/**
 * Mock Upstash Redis REST API (@upstash/redis). Generic command interpreter
 * over an in-memory map. The client defaults to `Upstash-Encoding: base64`,
 * which base64-encodes string results (except literal "OK").
 */

import type { DevHandler } from "@/dev/intercept";
import { getDevState } from "@/dev/state";

type RedisCommand = (string | number)[];

function encodeResult(result: unknown, base64: boolean): unknown {
  if (!base64 || typeof result !== "string" || result === "OK") return result;
  return Buffer.from(result).toString("base64");
}

function runCommand(command: RedisCommand): unknown {
  const store = getDevState().upstash;
  const [rawName, ...args] = command;
  const name = String(rawName).toUpperCase();
  const key = String(args[0] ?? "");

  const entry = store.get(key);
  if (entry?.expiresAt && entry.expiresAt < Date.now()) {
    store.delete(key);
  }

  switch (name) {
    case "GET":
      return store.get(key)?.value ?? null;
    case "SET": {
      let expiresAt: number | null = null;
      for (let i = 2; i < args.length; i += 2) {
        const opt = String(args[i]).toUpperCase();
        if (opt === "EX") expiresAt = Date.now() + Number(args[i + 1]) * 1000;
        if (opt === "PX") expiresAt = Date.now() + Number(args[i + 1]);
      }
      store.set(key, { value: String(args[1]), expiresAt });
      return "OK";
    }
    case "DEL": {
      let deleted = 0;
      for (const k of args) {
        if (store.delete(String(k))) deleted++;
      }
      return deleted;
    }
    case "EXISTS":
      return store.has(key) ? 1 : 0;
    case "INCR": {
      const next = Number(store.get(key)?.value ?? "0") + 1;
      store.set(key, { value: String(next), expiresAt: null });
      return next;
    }
    case "EXPIRE": {
      const existing = store.get(key);
      if (!existing) return 0;
      existing.expiresAt = Date.now() + Number(args[1]) * 1000;
      return 1;
    }
    case "TTL": {
      const existing = store.get(key);
      if (!existing) return -2;
      if (!existing.expiresAt) return -1;
      return Math.max(0, Math.round((existing.expiresAt - Date.now()) / 1000));
    }
    default:
      throw new Error(
        `[dev-mode] Mock Upstash: unsupported command "${name}". Add it in src/dev/handlers/upstash.ts`,
      );
  }
}

export const handleUpstash: DevHandler = async (req, url) => {
  const base64 = req.headers.get("upstash-encoding") === "base64";
  const body = (await req.json()) as RedisCommand | RedisCommand[];

  if (
    url.pathname.endsWith("/pipeline") ||
    url.pathname.endsWith("/multi-exec")
  ) {
    const results = (body as RedisCommand[]).map((command) => ({
      result: encodeResult(runCommand(command), base64),
    }));
    return Response.json(results);
  }

  return Response.json({
    result: encodeResult(runCommand(body as RedisCommand), base64),
  });
};
