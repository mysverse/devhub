/**
 * Dev-mode personas. Single source of truth for the seed script
 * (prisma/seed.ts), the dev login route (/api/dev/login) and the mock
 * service handlers. Determinism comes from fixed emails — better-auth
 * generates the user ids at seed time.
 */

export { DEV_PASSWORD } from "@/lib/dev-mode";

export type PersonaKey = "admin" | "developer" | "fresh";

export type Persona = {
  key: PersonaKey;
  email: string;
  name: string;
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
    linearId: "linear-user-admin",
    discordId: "100000000000000001",
    robloxId: "20000001",
  },
  developer: {
    key: "developer",
    email: "developer@devhub.mock",
    name: "Alex Developer",
    linearId: "linear-user-alex",
    discordId: "100000000000000002",
    robloxId: "20000002",
  },
  fresh: {
    key: "fresh",
    email: "fresh@devhub.mock",
    name: "Farah Fresh",
    linearId: null,
    discordId: null,
    robloxId: null,
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
  linearId: string;
  discordId: string;
  robloxId: string;
};

export const BACKGROUND_USERS: BackgroundUser[] = [
  {
    userId: "dev-user-bala",
    email: "bala@devhub.mock",
    name: "Bala Builder",
    linearId: "linear-user-bala",
    discordId: "100000000000000003",
    robloxId: "20000003",
  },
  {
    userId: "dev-user-mei",
    email: "mei@devhub.mock",
    name: "Mei Mesher",
    linearId: "linear-user-mei",
    discordId: "100000000000000004",
    robloxId: "20000004",
  },
  {
    userId: "dev-user-ravi",
    email: "ravi@devhub.mock",
    name: "Ravi Scripter",
    linearId: "linear-user-ravi",
    discordId: "100000000000000005",
    robloxId: "20000005",
  },
];
