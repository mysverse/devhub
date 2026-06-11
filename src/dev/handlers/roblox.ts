/**
 * Mock Roblox APIs: Open Cloud group memberships (access sync), legacy group
 * APIs, username resolution and thumbnails. Every seeded user is a member of
 * the configured group so access flows succeed.
 */

import { BACKGROUND_USERS, PERSONAS } from "@/dev/fixtures/personas";
import type { DevHandler } from "@/dev/intercept";

const KNOWN_USERNAMES: Record<string, string> = {
  raviscripts: BACKGROUND_USERS[2].robloxId,
  aliasadmin: PERSONAS.admin.robloxId as string,
  alexdev: PERSONAS.developer.robloxId as string,
};

export const handleRoblox: DevHandler = async (req, url) => {
  // ── Open Cloud (apis.roblox.com) ────────────────────────────────────────────
  if (url.hostname === "apis.roblox.com") {
    const membershipsMatch = /^\/cloud\/v2\/groups\/([^/]+)\/memberships$/.exec(
      url.pathname,
    );
    if (membershipsMatch && req.method === "GET") {
      const groupId = membershipsMatch[1];
      const filter = url.searchParams.get("filter") ?? "";
      const userId = /users\/(\d+)/.exec(filter)?.[1] ?? "0";
      return Response.json({
        groupMemberships: [
          {
            path: `groups/${groupId}/memberships/membership-${userId}`,
            user: `users/${userId}`,
            role: `groups/${groupId}/roles/102`,
          },
        ],
      });
    }
    if (
      /:(assignRole|unassignRole)$/.test(url.pathname) &&
      req.method === "POST"
    ) {
      return Response.json({});
    }
  }

  // ── Legacy groups API (groups.roblox.com) ───────────────────────────────────
  if (url.hostname === "groups.roblox.com") {
    if (
      /^\/v2\/users\/[^/]+\/groups\/roles$/.test(url.pathname) &&
      req.method === "GET"
    ) {
      const groupId = Number(process.env.ROBLOX_GROUP_ID ?? "12345678");
      return Response.json({
        data: [
          {
            group: { id: groupId, name: "MYSverse", memberCount: 250 },
            role: { id: 102, name: "Developer", rank: 100 },
          },
        ],
      });
    }
    if (
      /^\/v1\/groups\/[^/]+\/users\/[^/]+$/.test(url.pathname) &&
      req.method === "PATCH"
    ) {
      return Response.json({});
    }
  }

  // ── Users API (users.roblox.com) ────────────────────────────────────────────
  if (
    url.hostname === "users.roblox.com" &&
    url.pathname === "/v1/usernames/users" &&
    req.method === "POST"
  ) {
    const body = (await req.json()) as { usernames?: string[] };
    const username = body.usernames?.[0] ?? "MockUser";
    const id = Number(KNOWN_USERNAMES[username.toLowerCase()] ?? "29999999");
    return Response.json({
      data: [{ id, name: username, displayName: username }],
    });
  }

  // ── Thumbnails (thumbnails.roblox.com) ──────────────────────────────────────
  if (url.hostname === "thumbnails.roblox.com" && req.method === "GET") {
    const userIds = (url.searchParams.get("userIds") ?? "0").split(",");
    return Response.json({
      data: userIds.map((targetId) => ({
        targetId: Number(targetId),
        state: "Completed",
        imageUrl: "http://localhost:3000/icons/devhub-icon-192.png",
      })),
    });
  }

  throw new Error(
    `[dev-mode] Mock Roblox: unhandled ${req.method} ${url.hostname}${url.pathname}. Add it in src/dev/handlers/roblox.ts`,
  );
};
