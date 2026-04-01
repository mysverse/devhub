/**
 * Roblox API client for group payouts and user resolution.
 * Authentication uses .ROBLOSECURITY cookie stored in Redis (fallback to env var).
 * Handles CSRF token requirement (Roblox APIs return 403 with x-csrf-token on first call).
 */

import { getKV, ROBLOX_COOKIE_KEY, setKV } from "@/lib/redis";

// Module-level CSRF token cache (short-lived, refreshed on 403)
let csrfToken: string | null = null;

function getGroupId(): string {
  const id = process.env.ROBLOX_GROUP_ID;
  if (!id) throw new Error("ROBLOX_GROUP_ID is not set");
  return id;
}

/**
 * Get the .ROBLOSECURITY cookie from Redis first, then env var.
 */
export async function getRobloxCookie(): Promise<string> {
  const redisCookie = await getKV(ROBLOX_COOKIE_KEY);
  if (redisCookie) return redisCookie;

  const envCookie = process.env.ROBLOX_COOKIE;
  if (envCookie) return envCookie;

  throw new Error(
    "Roblox cookie not found in Redis or environment. An admin must configure it.",
  );
}

/**
 * Store a new .ROBLOSECURITY cookie in Redis.
 * Used by admin action to rotate the cookie without redeployment.
 */
export async function setRobloxCookie(cookie: string): Promise<void> {
  await setKV(ROBLOX_COOKIE_KEY, cookie);
}

/**
 * Make an authenticated request to Roblox API with CSRF token handling.
 * On 403 with x-csrf-token header, caches the token and retries once.
 */
async function robloxFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const cookie = await getRobloxCookie();
  const headers: Record<string, string> = {
    Cookie: `.ROBLOSECURITY=${cookie}`,
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (csrfToken) {
    headers["x-csrf-token"] = csrfToken;
  }

  const response = await fetch(url, { ...options, headers });

  // Handle CSRF token challenge: 403 with new token in header
  if (response.status === 403) {
    const newToken = response.headers.get("x-csrf-token");
    if (newToken) {
      csrfToken = newToken;
      headers["x-csrf-token"] = newToken;
      return fetch(url, { ...options, headers });
    }
    // 403 without CSRF token means auth failure (cookie expired)
    throw new Error(
      "Roblox authentication failed — .ROBLOSECURITY cookie may be expired. An admin must rotate it.",
    );
  }

  return response;
}

// -- Types --

export interface RobloxUser {
  id: number;
  name: string;
  displayName: string;
}

export interface GroupPayoutResult {
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
}

// -- API Functions --

/**
 * Resolve a Roblox username to a user ID.
 * Returns null if the username doesn't exist.
 */
export async function getRobloxUserByUsername(
  username: string,
): Promise<RobloxUser | null> {
  const response = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      usernames: [username],
      excludeBannedUsers: true,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Roblox Users API error (${response.status}): ${await response.text()}`,
    );
  }

  const data = (await response.json()) as { data: RobloxUser[] };
  return data.data.length > 0 ? data.data[0] : null;
}

/**
 * Verify that a Roblox user is a member of the configured group.
 */
export async function verifyGroupMembership(
  robloxUserId: string,
): Promise<boolean> {
  const groupId = getGroupId();
  const response = await fetch(
    `https://groups.roblox.com/v2/users/${robloxUserId}/groups/roles`,
    { method: "GET" },
  );

  if (!response.ok) {
    throw new Error(
      `Roblox Groups API error (${response.status}): ${await response.text()}`,
    );
  }

  const data = (await response.json()) as {
    data: { group: { id: number } }[];
  };
  return data.data.some((entry) => String(entry.group.id) === groupId);
}

/**
 * Send Robux to a user via group payout.
 * This is synchronous — succeeds or fails immediately.
 * Requires the cookie account to be the group owner.
 */
export async function sendGroupPayout(params: {
  robloxUserId: string;
  amount: number;
  description?: string;
}): Promise<GroupPayoutResult> {
  const groupId = getGroupId();

  const response = await robloxFetch(
    `https://groups.roblox.com/v1/groups/${groupId}/payouts`,
    {
      method: "POST",
      body: JSON.stringify({
        PayoutType: "FixedAmount",
        Recipients: [
          {
            recipientId: Number(params.robloxUserId),
            recipientType: "User",
            amount: params.amount,
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    let errorCode = "UNKNOWN";
    let errorMessage = errorBody;
    try {
      const parsed = JSON.parse(errorBody);
      errorCode = parsed.errors?.[0]?.code?.toString() ?? "UNKNOWN";
      errorMessage = parsed.errors?.[0]?.message ?? errorBody;
    } catch {
      // Use raw error body
    }
    return { success: false, errorCode, errorMessage };
  }

  return { success: true };
}
