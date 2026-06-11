/**
 * Mock Discord bot API (role sync in src/lib/access-sync.ts). Guild member
 * role state lives in src/dev/state.ts so assignments persist per session.
 */

import type { DevHandler } from "@/dev/intercept";
import { getDevState } from "@/dev/state";

export const handleDiscord: DevHandler = async (req, url) => {
  const memberMatch = /^\/api\/v10\/guilds\/[^/]+\/members\/([^/]+)$/.exec(
    url.pathname,
  );
  if (memberMatch && req.method === "GET") {
    const { discordRoles } = getDevState();
    const userId = memberMatch[1];
    if (!discordRoles.has(userId)) discordRoles.set(userId, new Set());
    return Response.json({
      user: { id: userId, username: `mock-user-${userId.slice(-4)}` },
      roles: [...(discordRoles.get(userId) ?? [])],
      joined_at: "2024-01-01T00:00:00.000Z",
    });
  }

  const roleMatch =
    /^\/api\/v10\/guilds\/[^/]+\/members\/([^/]+)\/roles\/([^/]+)$/.exec(
      url.pathname,
    );
  if (roleMatch && (req.method === "PUT" || req.method === "DELETE")) {
    const { discordRoles } = getDevState();
    const [, userId, roleId] = roleMatch;
    if (!discordRoles.has(userId)) discordRoles.set(userId, new Set());
    const roles = discordRoles.get(userId) as Set<string>;
    if (req.method === "PUT") roles.add(roleId);
    else roles.delete(roleId);
    return new Response(null, { status: 204 });
  }

  if (url.pathname === "/api/users/@me" && req.method === "GET") {
    return Response.json({
      id: "100000000000000000",
      username: "mock-discord-user",
      avatar: null,
    });
  }

  throw new Error(
    `[dev-mode] Mock Discord: unhandled ${req.method} ${url.pathname}. Add it in src/dev/handlers/discord.ts`,
  );
};
