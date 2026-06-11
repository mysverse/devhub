/**
 * Mock FinSys (self-hosted Robux payout service, src/lib/roblox.ts).
 * Disbursements succeed synchronously, matching the real service contract.
 */

import type { DevHandler } from "@/dev/intercept";
import { getDevState } from "@/dev/state";

export const handleFinsys: DevHandler = async (req, url) => {
  if (url.pathname === "/disburse" && req.method === "POST") {
    const body = (await req.json()) as {
      userId?: number;
      amount?: number;
      reason?: string;
    };
    const id = 1000 + ++getDevState().counters.finsys;
    console.log(
      `[dev-mode] finsys disburse → user ${body.userId}, R$${body.amount} (${id})`,
    );
    return Response.json({ success: true, message: "Disbursed", id });
  }

  if (url.pathname === "/health" && req.method === "GET") {
    return Response.json({
      authenticated: true,
      userId: 1,
      userName: "MockFinSys",
      lastHealthCheck: new Date().toISOString(),
      healthy: true,
      uptime: 1000,
    });
  }

  if (url.pathname === "/admin/refresh-cookie" && req.method === "POST") {
    return Response.json({
      success: true,
      message: "Cookie refreshed",
      userId: 1,
      userName: "MockFinSys",
    });
  }

  throw new Error(
    `[dev-mode] Mock FinSys: unhandled ${req.method} ${url.pathname}. Add it in src/dev/handlers/finsys.ts`,
  );
};
