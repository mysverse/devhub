export type SetupIntegrationId = "linear" | "discord" | "roblox";

export type IntegrationAvailability = {
  configured: boolean;
  label: string;
  unavailableTitle: string | null;
  unavailableDescription: string | null;
};

export type SetupIntegrationAvailability = Record<
  SetupIntegrationId,
  IntegrationAvailability
>;

type Requirement = {
  env: string;
  label: string;
};

const OAUTH_REQUIREMENTS: Record<SetupIntegrationId, Requirement[]> = {
  linear: [
    { env: "LINEAR_CLIENT_ID", label: "Linear OAuth client ID" },
    { env: "LINEAR_CLIENT_SECRET", label: "Linear OAuth client secret" },
  ],
  discord: [
    { env: "DISCORD_CLIENT_ID", label: "Discord OAuth client ID" },
    { env: "DISCORD_CLIENT_SECRET", label: "Discord OAuth client secret" },
  ],
  roblox: [
    { env: "ROBLOX_CLIENT_ID", label: "Roblox OAuth client ID" },
    { env: "ROBLOX_CLIENT_SECRET", label: "Roblox OAuth client secret" },
  ],
};

const LABELS: Record<SetupIntegrationId, string> = {
  linear: "Linear",
  discord: "Discord",
  roblox: "Roblox",
};

const ROBUX_PAYOUT_REQUIREMENTS: Requirement[] = [
  ...OAUTH_REQUIREMENTS.roblox,
  { env: "ROBLOX_GROUP_ID", label: "Roblox group ID" },
  { env: "FINSYS_API_URL", label: "FinSys payout service URL" },
  { env: "FINSYS_API_KEY", label: "FinSys payout API key" },
];

function missingRequirements(requirements: Requirement[]) {
  return requirements.filter(
    ({ env }) => !process.env[env] || process.env[env]?.trim() === "",
  );
}

function formatList(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function oauthAvailability(id: SetupIntegrationId): IntegrationAvailability {
  const label = LABELS[id];
  const missing = missingRequirements(OAUTH_REQUIREMENTS[id]);

  if (missing.length === 0) {
    return {
      configured: true,
      label,
      unavailableTitle: null,
      unavailableDescription: null,
    };
  }

  return {
    configured: false,
    label,
    unavailableTitle: `${label} linking unavailable`,
    unavailableDescription: `${label} linking is disabled because ${formatList(
      missing.map((item) => item.label),
    )} ${missing.length === 1 ? "is" : "are"} not configured. Ask an admin to enable it before linking this account.`,
  };
}

export function getOauthProviderAvailability(id: SetupIntegrationId) {
  return oauthAvailability(id);
}

export function getSetupIntegrationAvailability(): SetupIntegrationAvailability {
  return {
    linear: oauthAvailability("linear"),
    discord: oauthAvailability("discord"),
    roblox: oauthAvailability("roblox"),
  };
}

export function getRobuxPayoutAvailability(): IntegrationAvailability {
  const missing = missingRequirements(ROBUX_PAYOUT_REQUIREMENTS);

  if (missing.length === 0) {
    return {
      configured: true,
      label: "Robux",
      unavailableTitle: null,
      unavailableDescription: null,
    };
  }

  return {
    configured: false,
    label: "Robux",
    unavailableTitle: "Robux payments unavailable",
    unavailableDescription: `Robux payments are disabled because ${formatList(
      missing.map((item) => item.label),
    )} ${missing.length === 1 ? "is" : "are"} not configured. Choose another payment method for now.`,
  };
}
