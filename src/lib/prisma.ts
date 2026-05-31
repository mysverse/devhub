import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import { Pool } from "pg";

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
    max: 10,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 10_000,
  });
}

const databaseUrl = getDatabaseUrl();

function createPrismaClient(pool?: Pool): PrismaClient {
  if (isAccelerateUrl(databaseUrl)) {
    return new PrismaClient({
      accelerateUrl: databaseUrl,
    }).$extends(withAccelerate()) as unknown as PrismaClient;
  }

  const pgPool = pool ?? createPgPool(databaseUrl);

  return new PrismaClient({ adapter: new PrismaPg(pgPool) });
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
