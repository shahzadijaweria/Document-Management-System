// Thin cache helper around ioredis.
// Every operation swallows errors so a down-Redis becomes a "cache miss"
// and callers fall back to the database.

import { redis } from "../db/redis";
import { logger } from "./logger";

function logFail(op: string, ctx: Record<string, unknown>, err: unknown): void {
  logger.warn(`cache.${op} failed`, {
    ...ctx,
    message: err instanceof Error ? err.message : String(err),
  });
}

export async function get<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (err) {
    logFail("get", { key }, err);
    return null;
  }
}

export async function set<T>(
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (err) {
    logFail("set", { key }, err);
  }
}

export async function del(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (err) {
    logFail("del", { key }, err);
  }
}

// Delete every key matching a pattern (e.g. "docs:user-123:*").
// Used to invalidate a user's whole document list after a create/update/delete.
export async function delPattern(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  } catch (err) {
    logFail("delPattern", { pattern }, err);
  }
}
