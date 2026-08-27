/**
 * Dev-mode personas. Single source of truth for the seed script
 * (prisma/seed.ts), the dev login route (/api/dev/login) and the mock
 * service handlers. Determinism comes from fixed emails — better-auth
 * generates the user ids at seed time.
 */

export { DEV_PASSWORD } from "@/lib/dev-mode";

export type PersonaKey = "admin" | "developer" | "fresh" | "proxy";

export type Persona = {
  key: PersonaKey;
  email: string;
  name: string;
  /** Peer-facing display name. null exercises the User.name fallback. */
  preferredName: string | null;
  /** null = no UserProfile is seeded (exercises onboarding). */
  linearId: string | null;
  discordId: string | null;
  robloxId: string | null;
};

export const PERSONAS: Record<PersonaKey, Persona> = {
  admin: {
    key: "admin",
    email: "admin@devhub.mock",
    name: "Aina Admin",
    preferredName: "Aina",
    linearId: "linear-user-admin",
    discordId: "100000000000000001",
    robloxId: "20000001",
  },
  developer: {
    key: "developer",
    email: "developer@devhub.mock",
    name: "Alex Developer",
    preferredName: "Alex",
    linearId: "linear-user-alex",
    discordId: "100000000000000002",
    robloxId: "20000002",
  },
  fresh: {
    key: "fresh",
    email: "fresh@devhub.mock",
    name: "Farah Fresh",
    preferredName: null,
    linearId: null,
    discordId: null,
    robloxId: null,
  },
  // Paid by a DuitNow proxy ID and nothing else — no bank triple at all.
  //
  // Every other logged-in persona carries bankAccountNumber, which makes the
  // payment settings form open on the Bank account branch, so without this one
  // the proxy fields are unreachable from a screenshot and `pnpm visual` would
  // pass green while never rendering them. The proxy is a Singapore passport
  // (the type the old validator refused outright, and the one type that needs
  // an issuing country), linked at TnG eWallet, and still unconfirmed so the
  // inline confirmation boxes render.
  proxy: {
    key: "proxy",
    email: "proxy@devhub.mock",
    name: "Priya Proxy",
    preferredName: "Priya",
    linearId: "linear-user-priya",
    discordId: "100000000000000007",
    robloxId: "20000007",
  },
};

export function isPersonaKey(value: string): value is PersonaKey {
  return value in PERSONAS;
}

/**
 * Background developers without login accounts. They populate leaderboards,
 * admin review queues and the Linear workspace fixture. Seeded with fixed
 * user ids since they never go through better-auth.
 */
export type BackgroundUser = {
  userId: string;
  email: string;
  name: string;
  /** Peer-facing display name. null exercises the User.name fallback. */
  preferredName: string | null;
  linearId: string;
  discordId: string;
  robloxId: string;
};

export const BACKGROUND_USERS: BackgroundUser[] = [
  {
    userId: "dev-user-bala",
    email: "bala@devhub.mock",
    name: "Bala Builder",
    preferredName: "Bala",
    linearId: "linear-user-bala",
    discordId: "100000000000000003",
    robloxId: "20000003",
  },
  {
    userId: "dev-user-mei",
    email: "mei@devhub.mock",
    name: "Mei Mesher",
    preferredName: "Mei",
    linearId: "linear-user-mei",
    discordId: "100000000000000004",
    robloxId: "20000004",
  },
  {
    // preferredName deliberately null: keeps the User.name fallback on screen
    // in every admin view, so a regression that reaches for legalName instead
    // is visible during verification.
    userId: "dev-user-ravi",
    email: "ravi@devhub.mock",
    name: "Ravi Scripter",
    preferredName: null,
    linearId: "linear-user-ravi",
    discordId: "100000000000000005",
    robloxId: "20000005",
  },
  {
    // Onboarded and then nothing: no claim, no transaction, no activity ever.
    // This is the population the activation work targets, and the one the old
    // digest audience filter excluded by construction — every other seeded
    // developer has history, so without this fixture the re-engagement path
    // has nobody to prove itself against.
    userId: "dev-user-nadia",
    email: "nadia@devhub.mock",
    name: "Nadia Newcomer",
    preferredName: "Nadia",
    linearId: "linear-user-nadia",
    discordId: "100000000000000006",
    robloxId: "20000006",
  },
];
