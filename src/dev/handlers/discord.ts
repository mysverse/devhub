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

  // DM channel open (src/lib/discord.ts sendDirectMessage).
  if (url.pathname === "/api/v10/users/@me/channels" && req.method === "POST") {
    const body = (await req.json()) as { recipient_id?: string };
    return Response.json({
      id: `dm-${body.recipient_id ?? "unknown"}`,
      type: 1,
      recipients: [{ id: body.recipient_id }],
    });
  }

  // Message post — logged like the mock email handler so DM and channel
  // delivery are verifiable in dev mode rather than silently succeeding.
  const messageMatch = /^\/api\/v10\/channels\/([^/]+)\/messages$/.exec(
    url.pathname,
  );
  if (messageMatch && req.method === "POST") {
    const body = (await req.json()) as { content?: string };
    const id = `msg_dev_${++getDevState().counters.discordMessage}`;
    console.log(
      `[dev-mode] discord → ${messageMatch[1]} | ${body.content?.split("\n")[0]} (${id})`,
    );
    return Response.json({ id, channel_id: messageMatch[1] });
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
