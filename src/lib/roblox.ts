/**
 * Roblox user resolution + FinSys payout client.
 *
 * Username→ID resolution and group membership checks hit Roblox APIs directly (no auth needed).
 * Payouts are delegated to FinSys (self-hosted VPS) which handles Roblox auth internally.
 */

// -- FinSys client --

function getFinSysConfig(): { url: string; apiKey: string } {
  const url = process.env.FINSYS_API_URL;
  const apiKey = process.env.FINSYS_API_KEY;
  if (!url || !apiKey) {
    throw new Error("FINSYS_API_URL and FINSYS_API_KEY must be set");
  }
  return { url: url.replace(/\/+$/, ""), apiKey };
}

async function finSysFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const { url, apiKey } = getFinSysConfig();
  return fetch(`${url}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      ...(options.headers as Record<string, string>),
    },
  });
}

// -- FinSys API functions --

export interface FinSysPayoutResult {
  success: boolean;
  message: string;
  id?: number;
  error?: string;
}

/**
 * Create a payout request via FinSys.
 * FinSys handles Roblox auth, CSRF, and group payout execution on its side.
 */
export async function createFinSysPayout(params: {
  robloxUserId: number;
  amount: number;
  reason: string;
}): Promise<FinSysPayoutResult> {
  const response = await finSysFetch("/create-payout", {
    method: "POST",
    body: JSON.stringify({
      userId: params.robloxUserId,
      amount: params.amount,
      reason: params.reason,
    }),
  });

  const data = (await response.json()) as FinSysPayoutResult;

  if (!response.ok) {
    return {
      success: false,
      message: data.error || `FinSys error (HTTP ${response.status})`,
    };
  }

  return data;
}

export interface FinSysHealthStatus {
  authenticated: boolean;
  userId: number | null;
  userName: string | null;
  lastHealthCheck: string | null;
  healthy: boolean;
  uptime: number;
}

/**
 * Check FinSys service health and Roblox auth status.
 */
export async function checkFinSysHealth(): Promise<FinSysHealthStatus> {
  const response = await finSysFetch("/health");

  if (!response.ok) {
    throw new Error(`FinSys health check failed (HTTP ${response.status})`);
  }

  return (await response.json()) as FinSysHealthStatus;
}

export interface FinSysCookieRefreshResult {
  success: boolean;
  message: string;
  userId?: number;
  userName?: string;
  error?: string;
}

/**
 * Rotate the Roblox cookie on the FinSys VPS without restart.
 */
export async function refreshFinSysCookie(
  cookie: string,
): Promise<FinSysCookieRefreshResult> {
  const response = await finSysFetch("/admin/refresh-cookie", {
    method: "POST",
    body: JSON.stringify({ cookie }),
  });

  const data = (await response.json()) as FinSysCookieRefreshResult;

  if (!response.ok) {
    return {
      success: false,
      message:
        data.error || `FinSys cookie refresh failed (HTTP ${response.status})`,
    };
  }

  return data;
}

// -- Roblox direct API functions (no auth needed) --

function getGroupId(): string {
  const id = process.env.ROBLOX_GROUP_ID;
  if (!id) throw new Error("ROBLOX_GROUP_ID is not set");
  return id;
}

export interface RobloxUser {
  id: number;
  name: string;
  displayName: string;
}

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
