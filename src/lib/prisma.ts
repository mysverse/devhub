import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import { Pool } from "pg";
import {
  isInTransactionScope,
  RETRYABLE_READ_OPERATIONS,
  runInTransactionScope,
  transientErrorCode,
  withTransientRetry,
} from "@/lib/prisma-retry";

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  return url;
}

function isAccelerateUrl(url: string) {
  return url.startsWith("prisma://") || url.startsWith("prisma+postgres://");
}

function createPgPool(connectionString: string) {
  return new Pool({
    connectionString,
    // PG_POOL_MAX is only set in dev mode (.env.mock): the embedded prisma-dev
    // Postgres mishandles concurrent extended-protocol sessions, so the mock
    // environment caps the pool at 1.
    max: Number(process.env.PG_POOL_MAX ?? "10"),
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 10_000,
  });
}

const databaseUrl = getDatabaseUrl();

/**
 * Retry reads that fail transiently — chiefly Accelerate's `P6000`/503, which
 * is a Cloudflare worker being killed for exceeding its resource limits and
 * succeeds on the next isolate. Without this, one edge hiccup takes down a
 * whole page render or drops a payment confirmation. Classification and
 * backoff live in `prisma-retry.ts`, which is Prisma-free and unit-tested.
 *
 * Only reads (see RETRYABLE_READ_OPERATIONS). A worker that died mid-request
 * may have already committed, so retrying a write could double-insert a money
 * row; a call site whose write is structurally idempotent opts in by calling
 * `withTransientRetry()` itself.
 *
 * Operations inside an interactive `prisma.$transaction` are excluded — see
 * `isInTransactionScope()` in prisma-retry.ts for why, and
 * `markTransactionScope()` below for how the boundary is detected.
 */
const transientReadRetry = Prisma.defineExtension({
  name: "transient-read-retry",
  query: {
    async $allOperations({ model, operation, args, query }) {
      if (!RETRYABLE_READ_OPERATIONS.has(operation)) return query(args);
      if (isInTransactionScope()) return query(args);

      return withTransientRetry(() => query(args), {
        onRetry: ({ attempt, attempts, delayMs, error }) => {
          console.warn(
            `[prisma-retry] ${model ?? "raw"}.${operation} attempt ${attempt}/${attempts} ` +
              `failed with ${transientErrorCode(error)}, retrying in ${delayMs}ms`,
          );
        },
      });
    },
  },
});

/**
 * Wraps `$transaction` so the retry extension can tell it is running inside an
 * interactive transaction. Prisma gives the extension no such flag, so the
 * boundary is marked here with an AsyncLocalStorage scope that the extension
 * reads.
 *
 * Only the interactive form is wrapped. The array form
 * (`$transaction([p1, p2])`) receives promises whose queries were already
 * issued outside any transaction, and retrying those is correct.
 */
function markTransactionScope(client: PrismaClient): PrismaClient {
  return new Proxy(client, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (property !== "$transaction" || typeof value !== "function") {
        return value;
      }

      const original = value as (...args: unknown[]) => unknown;
      return (...args: unknown[]) => {
        if (typeof args[0] !== "function") return original.apply(target, args);
        const callback = args[0] as (tx: unknown) => unknown;
        return original.call(
          target,
          (tx: unknown) => runInTransactionScope(() => callback(tx)),
          ...args.slice(1),
        );
      };
    },
  });
}

function createPrismaClient(pool?: Pool): PrismaClient {
  const base = isAccelerateUrl(databaseUrl)
    ? (new PrismaClient({
        accelerateUrl: databaseUrl,
      }).$extends(withAccelerate()) as unknown as PrismaClient)
    : new PrismaClient({
        adapter: new PrismaPg(pool ?? createPgPool(databaseUrl)),
      });

  return markTransactionScope(
    base.$extends(transientReadRetry) as unknown as PrismaClient,
  );
}

// Cache the Prisma client + pg pool on globalThis so `next dev` hot reloads
// don't leak connections by instantiating a fresh pool on every code change.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
};

const pool = isAccelerateUrl(databaseUrl)
  ? undefined
  : (globalForPrisma.pgPool ?? createPgPool(databaseUrl));

const prisma = globalForPrisma.prisma ?? createPrismaClient(pool);

if (process.env.NODE_ENV !== "production") {
  if (pool) {
    globalForPrisma.pgPool = pool;
  }
  globalForPrisma.prisma = prisma;
}

export default prisma;
