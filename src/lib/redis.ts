import { Redis } from "@upstash/redis";

const globalForRedis = globalThis as unknown as { redis: Redis | undefined };

function createRedisClient(): Redis {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error("KV_REST_API_URL and KV_REST_API_TOKEN must be set");
  }
  return new Redis({ url, token });
}

const redis = globalForRedis.redis ?? createRedisClient();
if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

export default redis;

const REDIS_KEY_PREFIX = "devhub:";

export const BILLPLZ_COLLECTION_ID_KEY =
  "billplz:payment_order_collection_id";

export async function getKV(key: string): Promise<string | null> {
  return redis.get<string>(`${REDIS_KEY_PREFIX}${key}`);
}

export async function setKV(key: string, value: string): Promise<void> {
  await redis.set(`${REDIS_KEY_PREFIX}${key}`, value);
}
