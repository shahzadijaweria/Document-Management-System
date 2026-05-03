// Single Redis client for the whole process.
// Spec: handle Redis connection failures gracefully (fallback to DB).
// We achieve that here by:
//   - logging connection errors at warn level instead of crashing
//   - exposing isRedisReady() so callers can check before using the cache
// The cache helper (next step) wraps every operation in try/catch so a
// down-Redis just becomes a "miss" — services continue to hit the DB.

import Redis from "ioredis";

import { env } from "../config/env";
import { logger } from "../utils/logger";

export const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  // Don't keep retrying forever - fail fast so callers can fall back to DB.
  maxRetriesPerRequest: 3,
});

redis.on("connect", () => {
  logger.info("redis connected", {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
  });
});

redis.on("error", (err) => {
  // Don't escalate to error level - we have graceful fallback.
  logger.warn("redis error", { message: err.message });
});

// True only when the connection is alive and ready for commands.
export function isRedisReady(): boolean {
  return redis.status === "ready";
}
