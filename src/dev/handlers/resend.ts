/**
 * Mock Resend email API. Logs the email to the server console (so flows are
 * verifiable) and returns a success id; EmailDelivery rows then record SENT.
 */

import type { DevHandler } from "@/dev/intercept";
import { getDevState } from "@/dev/state";

export const handleResend: DevHandler = async (req, url) => {
  if (url.pathname === "/emails" && req.method === "POST") {
    const body = (await req.json()) as {
      to?: string | string[];
      subject?: string;
      from?: string;
    };
    const id = `email_dev_${++getDevState().counters.email}`;
    console.log(
      `[dev-mode] email → ${JSON.stringify(body.to)} | ${body.subject} (${id})`,
    );
    return Response.json({ id });
  }

  throw new Error(
    `[dev-mode] Mock Resend: unhandled ${req.method} ${url.pathname}. Add it in src/dev/handlers/resend.ts`,
  );
};
