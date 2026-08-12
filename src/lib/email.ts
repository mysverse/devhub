import crypto from "node:crypto";
import type { EmailDeliveryStatus } from "@prisma/client";
import type React from "react";
import { Resend } from "resend";
import { isDeliverySettled } from "@/lib/delivery-staleness";
import prisma from "@/lib/prisma";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_ADDRESS =
  process.env.EMAIL_FROM ?? "MYSverse DevHub <devhub@mysver.se>";
const DEFAULT_DEDUPE_WINDOW_MINUTES = 60;
const DEFAULT_MAX_SENDS_PER_HOUR = 250;
const DEFAULT_MAX_SENDS_PER_RECIPIENT_PER_HOUR = 25;
const DEFAULT_MAX_SENDS_PER_CATEGORY_PER_HOUR = 100;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

type SendEmailStatus = "sent" | "skipped";

type SendEmailResult = {
  status: SendEmailStatus;
  reason?: "deduped" | "disabled" | "missing_api_key" | "rate_limited";
  deliveryId?: string;
};

type EmailRateLimitScope = "global" | "recipient" | "category";

type EmailDeliveryReservation =
  | { status: "reserved"; id: string }
  | { status: "skipped"; reason: "deduped" };

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

function hash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function getDedupeWindowMs(value?: number | false) {
  if (value === false) return 0;
  if (typeof value === "number") return Math.max(0, value);

  const configured = Number(
    process.env.EMAIL_DEDUPE_WINDOW_MINUTES ??
      String(DEFAULT_DEDUPE_WINDOW_MINUTES),
  );
  if (!Number.isFinite(configured) || configured <= 0) return 0;
  return configured * 60 * 1000;
}

function getHourlyLimit(name: string, fallback: number) {
  const configured = Number(process.env[name] ?? String(fallback));
  if (!Number.isFinite(configured) || configured <= 0) return 0;
  return Math.floor(configured);
}

function emailSendsDisabled() {
  return process.env.EMAIL_SENDS_DISABLED === "true";
}

function normalizeRecipient(to: string) {
  return to.trim().toLowerCase();
}

function truncateError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 2000);
}

function providerIdFromData(data: unknown) {
  if (
    typeof data === "object" &&
    data !== null &&
    "id" in data &&
    typeof (data as { id?: unknown }).id === "string"
  ) {
    return (data as { id: string }).id;
  }
  return null;
}

async function reserveEmailDelivery({
  to,
  subject,
  category,
  idempotencyKey,
  dedupeWindowMs,
}: {
  to: string;
  subject: string;
  category: string;
  idempotencyKey?: string;
  dedupeWindowMs?: number | false;
}): Promise<EmailDeliveryReservation> {
  const recipient = normalizeRecipient(to);
  const normalizedSubject = subject.trim();
  const normalizedCategory = category.trim();
  const fingerprint = hash(
    [FROM_ADDRESS, recipient, normalizedCategory, normalizedSubject].join("\n"),
  );
  const windowMs = getDedupeWindowMs(dedupeWindowMs);
  const now = new Date();
  const cleanedIdempotencyKey = idempotencyKey?.trim() || null;
  const dedupeKey = cleanedIdempotencyKey
    ? `id:${hash(`${recipient}\n${cleanedIdempotencyKey}`)}`
    : windowMs > 0
      ? `window:${Math.floor(now.getTime() / windowMs)}:${fingerprint}`
      : `single:${crypto.randomUUID()}:${fingerprint}`;

  if (!cleanedIdempotencyKey && windowMs > 0) {
    const recentDelivery = await prisma.emailDelivery.findFirst({
      where: {
        fingerprint,
        createdAt: { gte: new Date(now.getTime() - windowMs) },
        status: { in: ["PENDING", "SENT"] },
      },
      orderBy: { createdAt: "desc" },
      select: { status: true, updatedAt: true },
    });

    if (recentDelivery && isDeliverySettled(recentDelivery)) {
      return { status: "skipped", reason: "deduped" };
    }
  }

  const existingDelivery = await prisma.emailDelivery.findUnique({
    where: { dedupeKey },
    select: { id: true, status: true, updatedAt: true },
  });

  if (existingDelivery) {
    if (isDeliverySettled(existingDelivery)) {
      return { status: "skipped", reason: "deduped" };
    }

    const retry = await prisma.emailDelivery.update({
      where: { id: existingDelivery.id },
      data: {
        idempotencyKey: cleanedIdempotencyKey,
        fingerprint,
        recipient,
        subject: normalizedSubject,
        category: normalizedCategory,
        status: "PENDING",
        providerId: null,
        error: null,
        sentAt: null,
      },
      select: { id: true },
    });
    return { status: "reserved", id: retry.id };
  }

  try {
    const delivery = await prisma.emailDelivery.create({
      data: {
        dedupeKey,
        idempotencyKey: cleanedIdempotencyKey,
        fingerprint,
        recipient,
        subject: normalizedSubject,
        category: normalizedCategory,
      },
      select: { id: true },
    });
    return { status: "reserved", id: delivery.id };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { status: "skipped", reason: "deduped" };
    }
    throw error;
  }
}

async function checkEmailRateLimits({
  to,
  category,
}: {
  to: string;
  category: string;
}): Promise<
  { limited: false } | { limited: true; scope: EmailRateLimitScope }
> {
  const recipient = normalizeRecipient(to);
  const normalizedCategory = category.trim();
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const activeStatuses: EmailDeliveryStatus[] = ["PENDING", "SENT"];
  const globalLimit = getHourlyLimit(
    "EMAIL_MAX_SENDS_PER_HOUR",
    DEFAULT_MAX_SENDS_PER_HOUR,
  );
  const recipientLimit = getHourlyLimit(
    "EMAIL_MAX_SENDS_PER_RECIPIENT_PER_HOUR",
    DEFAULT_MAX_SENDS_PER_RECIPIENT_PER_HOUR,
  );
  const categoryLimit = getHourlyLimit(
    "EMAIL_MAX_SENDS_PER_CATEGORY_PER_HOUR",
    DEFAULT_MAX_SENDS_PER_CATEGORY_PER_HOUR,
  );

  const [globalCount, recipientCount, categoryCount] = await Promise.all([
    globalLimit > 0
      ? prisma.emailDelivery.count({
          where: { createdAt: { gte: since }, status: { in: activeStatuses } },
        })
      : Promise.resolve(0),
    recipientLimit > 0
      ? prisma.emailDelivery.count({
          where: {
            recipient,
            createdAt: { gte: since },
            status: { in: activeStatuses },
          },
        })
      : Promise.resolve(0),
    categoryLimit > 0
      ? prisma.emailDelivery.count({
          where: {
            category: normalizedCategory,
            createdAt: { gte: since },
            status: { in: activeStatuses },
          },
        })
      : Promise.resolve(0),
  ]);

  if (globalLimit > 0 && globalCount >= globalLimit) {
    return { limited: true, scope: "global" };
  }
  if (recipientLimit > 0 && recipientCount >= recipientLimit) {
    return { limited: true, scope: "recipient" };
  }
  if (categoryLimit > 0 && categoryCount >= categoryLimit) {
    return { limited: true, scope: "category" };
  }

  return { limited: false };
}

export async function sendEmail({
  to,
  subject,
  react,
  attachments,
  category,
  idempotencyKey,
  dedupeWindowMs,
}: {
  to: string;
  subject: string;
  react: React.ReactElement;
  attachments?: { filename: string; content: Buffer }[];
  category: string;
  idempotencyKey?: string;
  dedupeWindowMs?: number | false;
}): Promise<SendEmailResult> {
  if (!to.trim()) throw new Error("Email recipient is required");
  if (!subject.trim()) throw new Error("Email subject is required");
  if (!category.trim()) throw new Error("Email category is required");

  if (emailSendsDisabled()) {
    console.warn("[email] EMAIL_SENDS_DISABLED=true; skipping email", {
      to,
      subject,
      category,
    });
    return { status: "skipped", reason: "disabled" };
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY is not configured; skipping email", {
      to,
      subject,
      category,
    });
    return { status: "skipped", reason: "missing_api_key" };
  }

  const rateLimit = await checkEmailRateLimits({ to, category });
  if (rateLimit.limited) {
    console.error("[email] Hourly email rate limit reached; skipping email", {
      to,
      subject,
      category,
      scope: rateLimit.scope,
    });
    return { status: "skipped", reason: "rate_limited" };
  }

  const reservation = await reserveEmailDelivery({
    to,
    subject,
    category,
    idempotencyKey,
    dedupeWindowMs,
  });

  if (reservation.status === "skipped") {
    console.warn("[email] Skipping duplicate email", { to, subject, category });
    return { status: "skipped", reason: reservation.reason };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject,
      react,
      attachments,
    });

    if (error) {
      throw new Error(error.message);
    }

    await prisma.emailDelivery.update({
      where: { id: reservation.id },
      data: {
        status: "SENT",
        providerId: providerIdFromData(data),
        sentAt: new Date(),
        error: null,
      },
    });
    return { status: "sent", deliveryId: reservation.id };
  } catch (error) {
    await prisma.emailDelivery.update({
      where: { id: reservation.id },
      data: { status: "FAILED", error: truncateError(error) },
    });
    console.error("Failed to send email:", error);
    throw error instanceof Error ? error : new Error(String(error));
  }
}
