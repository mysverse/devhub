import type { PrismaClient } from "@prisma/client";
import { isDevMode } from "./dev-mode";

// ── Dev mode mock Prisma proxy ────────────────────────────────────────────

function createMockPrismaProxy(): any {
  // Lazy-load mock data so the module graph stays clean in production
  let _mockData: typeof import("./dev/mock-data") | null = null;
  async function getMockData() {
    if (!_mockData) {
      _mockData = await import("./dev/mock-data");
    }
    return _mockData;
  }

  // Resolve the right mock data for a given model name + operation
  function mockModelOperation(model: string, op: string, args?: any): any {
    const asyncResult = (async () => {
      const m = await getMockData();

      // ── userProfile ───────────────────────────────────────────────
      if (model === "userProfile") {
        if (op === "findUnique" || op === "findFirst") {
          // If the query selects only role + developerRank, return a slim object
          const select = args?.select;
          if (
            select &&
            Object.keys(select).length === 2 &&
            select.role &&
            select.developerRank
          ) {
            return {
              role: m.MOCK_USER_PROFILE.role,
              developerRank: m.MOCK_USER_PROFILE.developerRank,
            };
          }
          const include = args?.include;
          if (include?.transactions) {
            return {
              ...m.MOCK_USER_PROFILE,
              transactions: m.MOCK_TRANSACTIONS,
            };
          }
          return { ...m.MOCK_USER_PROFILE };
        }
        if (op === "findMany")
          return [m.MOCK_USER_PROFILE, ...m.MOCK_LEADERBOARD_PROFILES];
        if (op === "create" || op === "update" || op === "upsert") {
          const include = args?.include;
          if (include?.transactions) {
            return {
              ...m.MOCK_USER_PROFILE,
              transactions: m.MOCK_TRANSACTIONS,
            };
          }
          return { ...m.MOCK_USER_PROFILE };
        }
        if (op === "updateMany") return { count: 1 };
        if (op === "count") return 1;
      }

      // ── transaction ───────────────────────────────────────────────
      if (model === "transaction") {
        if (op === "findUnique" || op === "findFirst")
          return m.MOCK_TRANSACTIONS[0];
        if (op === "findMany") {
          const include = args?.include;
          if (include?.user || include?.payout || include?.bonusCandidates) {
            return m.MOCK_TRANSACTIONS.map((tx: any) => ({
              ...tx,
              user: m.MOCK_USER_PROFILE,
              payout: null,
              bonusCandidates: [],
              pptPayoutState: null,
            }));
          }
          return m.MOCK_TRANSACTIONS;
        }
        if (op === "aggregate") {
          return { _sum: { amount: 120 }, _count: { id: 3 } };
        }
        if (op === "count") return m.MOCK_TRANSACTIONS.length;
        if (op === "create" || op === "update") return m.MOCK_TRANSACTIONS[0];
      }

      // ── account (linked OAuth accounts) ───────────────────────────
      if (model === "account") {
        if (op === "findFirst") {
          return {
            id: "account-linear-001",
            accountId: "dev-linear-001",
            providerId: "linear",
            accessToken: "mock-token",
            refreshToken: "mock-refresh",
            accessTokenExpiresAt: new Date(Date.now() + 3600_000),
          };
        }
        if (op === "findMany")
          return m.MOCK_LINKED_ACCOUNTS.map((a: any, i: number) => ({
            id: `account-${i}`,
            ...a,
          }));
        if (op === "update" || op === "updateMany") return { count: 1 };
      }

      // ── bonusCandidate ────────────────────────────────────────────
      if (model === "bonusCandidate") {
        if (op === "findUnique" || op === "findFirst")
          return m.MOCK_BONUS_CANDIDATES[0];
        if (op === "findMany") {
          const include = args?.include;
          if (include?.user) {
            return m.MOCK_BONUS_CANDIDATES.map((bc: any) => ({
              ...bc,
              user: { ...m.MOCK_USER_PROFILE, user: m.MOCK_USER },
            }));
          }
          if (include?.transaction) {
            return m.MOCK_BONUS_CANDIDATES.map((bc: any) => ({
              ...bc,
              transaction:
                bc.status === "APPROVED" ? m.MOCK_TRANSACTIONS[3] : null,
            }));
          }
          return m.MOCK_BONUS_CANDIDATES;
        }
        if (op === "count") return m.MOCK_BONUS_CANDIDATES.length;
        if (op === "create" || op === "update")
          return m.MOCK_BONUS_CANDIDATES[0];
      }

      // ── bonusConfig ───────────────────────────────────────────────
      if (model === "bonusConfig") {
        return {
          id: "default",
          enabled: true,
          myrRatePerPoint: 20,
          robuxRatePerPoint: 1200,
          excludedLabels: ["Redistributable", "Redistributed"],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }

      // ── kycVerification ───────────────────────────────────────────
      if (model === "kycVerification") {
        if (op === "findFirst") return m.MOCK_KYC_VERIFICATION;
        if (op === "findMany") return [m.MOCK_KYC_VERIFICATION];
        if (op === "count") return 0;
      }

      // ── signedDocument ────────────────────────────────────────────
      if (model === "signedDocument") {
        if (op === "findUnique" || op === "findFirst")
          return m.MOCK_SIGNED_DOCUMENTS[0];
        if (op === "findMany") return m.MOCK_SIGNED_DOCUMENTS;
      }

      // ── pptRequest ────────────────────────────────────────────────
      if (model === "pptRequest") {
        if (op === "findMany") return [];
        if (op === "count") return 0;
      }

      // ── pptPayoutState ────────────────────────────────────────────
      if (model === "pptPayoutState") {
        if (op === "findMany") return [];
        if (op === "count") return 0;
      }

      // ── bonusNotification / pptNotification ───────────────────────
      if (model === "bonusNotification" || model === "pptNotification") {
        if (op === "findMany") return [];
        if (op === "count") return 0;
        if (op === "updateMany") return { count: 0 };
      }

      // ── welcomePackOrder ──────────────────────────────────────────
      if (model === "welcomePackOrder") {
        if (op === "findUnique" || op === "findFirst") return null;
        if (op === "findMany") return [];
      }

      // ── welcomePack ───────────────────────────────────────────────
      if (model === "welcomePack") {
        if (op === "findFirst") return null;
        if (op === "findMany") return [];
      }

      // ── invite ────────────────────────────────────────────────────
      if (model === "invite") {
        if (op === "findMany") return [];
        if (op === "create")
          return { id: "invite-mock", token: "mock-token", used: false };
      }

      // ── Fallback for any unhandled model ──────────────────────────
      if (op === "findUnique" || op === "findFirst") return null;
      if (op === "findMany") return [];
      if (op === "count") return 0;
      if (op === "aggregate") return { _sum: { amount: 0 }, _count: { id: 0 } };
      if (op === "create" || op === "update" || op === "upsert") return {};
      if (op === "updateMany" || op === "deleteMany") return { count: 0 };
      if (op === "delete") return {};
      return null;
    })();

    return asyncResult;
  }

  // The top-level Proxy represents the PrismaClient instance
  // biome-ignore lint/suspicious/noExplicitAny: Prisma mock proxy needs dynamic property access
  const proxy = new Proxy({} as any, {
    get(_target, modelProp: string) {
      // Handle $transaction — run callbacks sequentially with the proxy itself
      if (modelProp === "$transaction") {
        return async (arg: any) => {
          if (typeof arg === "function") {
            return arg(proxy);
          }
          if (Array.isArray(arg)) {
            return Promise.all(arg);
          }
          return [];
        };
      }
      if (modelProp === "$connect" || modelProp === "$disconnect") {
        return () => Promise.resolve();
      }

      // Return a nested Proxy for the model, exposing operation methods
      return new Proxy(
        {},
        {
          get(_modelTarget, opProp: string) {
            return (args?: any) => mockModelOperation(modelProp, opProp, args);
          },
        },
      );
    },
  });

  return proxy;
}

// ── Real Prisma client ────────────────────────────────────────────────────

let prisma: PrismaClient;

if (isDevMode()) {
  prisma = createMockPrismaProxy() as unknown as PrismaClient;
} else {
  const { PrismaPg } = require("@prisma/adapter-pg");
  const { PrismaClient: RealPrismaClient } = require("@prisma/client");
  const { Pool } = require("pg");

  // Cache the Prisma client + pg pool on globalThis so `next dev` hot reloads
  // don't leak connections by instantiating a fresh pool on every code change.
  const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
    pgPool: any | undefined;
  };

  const pool =
    globalForPrisma.pgPool ??
    new Pool({
      connectionString: `${process.env.DATABASE_URL}`,
      max: 10,
      idleTimeoutMillis: 60_000,
      connectionTimeoutMillis: 10_000,
    });

  prisma = (globalForPrisma.prisma ??
    new RealPrismaClient({ adapter: new PrismaPg(pool) })) as PrismaClient;

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.pgPool = pool;
    globalForPrisma.prisma = prisma;
  }
}

export default prisma;
