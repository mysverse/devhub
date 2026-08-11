"use server";

/**
 * The two endpoints behind every writing-assist affordance in the app.
 *
 * One-shot request/response, so a server action rather than a route handler:
 * the streamed path would force the primitive off structured output and back
 * onto parsing prose, which is the thing `generateStructured` exists to avoid.
 *
 * Both exports are async and guard the session in their own body, which is what
 * `pnpm check-pii` greps for. Helpers live in `src/lib/ai-assist-server.ts` —
 * a non-async export here would silently strip this module of all its exports.
 */

import type { AiAssistAction } from "@/lib/ai-assist-config";
import { aiAssistField } from "@/lib/ai-assist-config";
import {
  type AiAssistOutcome,
  type AiAssistRewrite,
  runWritingAssist,
  runWritingReview,
} from "@/lib/ai-assist-server";
import { getSession } from "@/lib/auth-utils";
import { hasAdminAccess } from "@/lib/authz";
import type { WritingReviewResult } from "@/lib/llm-prompts";
import prisma from "@/lib/prisma";

const ACTIONS = new Set<AiAssistAction>([
  "polish",
  "expand",
  "shorten",
  "structure",
]);

/**
 * Resolves the field and proves the caller may write into it.
 *
 * The field id arrives from a client component, so it is treated as a claim
 * rather than a fact: an unknown id resolves to nothing, and an admin-audience
 * field checks admin access rather than trusting that the button only rendered
 * for admins. `AI_ASSIST_FIELDS` is the entire allowlist, which is what keeps
 * KYC, COI, welcome-pack and payment fields unreachable from here.
 */
async function resolveField(userId: string, fieldId: string) {
  const config = aiAssistField(fieldId);
  if (!config) return null;
  if (config.audience !== "admin") return config;

  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { role: true, developerRank: true },
  });
  return hasAdminAccess(profile) ? config : null;
}

export async function assistWriting(input: {
  fieldId: string;
  action: string;
  text: string;
}): Promise<AiAssistOutcome<AiAssistRewrite>> {
  const { userId } = await getSession();
  if (!userId) return { available: false };

  const action = input.action as AiAssistAction;
  if (!ACTIONS.has(action)) return { available: false };

  const config = await resolveField(userId, input.fieldId);
  if (!config?.actions.includes(action)) return { available: false };

  return runWritingAssist({ config, action, text: input.text, userId });
}

export async function reviewBeforePosting(input: {
  fieldId: string;
  text: string;
}): Promise<AiAssistOutcome<WritingReviewResult>> {
  const { userId } = await getSession();
  if (!userId) return { available: false };

  const config = await resolveField(userId, input.fieldId);
  if (!config?.review) return { available: false };

  return runWritingReview({ config, text: input.text, userId });
}
