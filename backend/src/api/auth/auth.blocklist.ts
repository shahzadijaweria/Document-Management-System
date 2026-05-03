// JWT revocation blocklist backed by Redis.
//
// On logout, we add the token's jti to Redis with TTL = remaining seconds
// until the token would naturally expire. requireAuth checks each request
// against this blocklist before letting it through.


import { redis } from "../../db/redis";
import { logger } from "../../utils/logger";

const KEY_PREFIX = "revoked:";

export async function revoke(jti: string, ttlSeconds: number): Promise<void> {
  if (ttlSeconds <= 0) return; // already expired naturally; nothing to do
  try {
    await redis.setex(`${KEY_PREFIX}${jti}`, ttlSeconds, "1");
  } catch (err) {
    logger.warn("blocklist revoke failed", {
      jti,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function isRevoked(jti: string): Promise<boolean> {
  try {
    const exists = await redis.exists(`${KEY_PREFIX}${jti}`);
    return exists === 1;
  } catch (err) {
    logger.warn("blocklist check failed", {
      jti,
      message: err instanceof Error ? err.message : String(err),
    });
    return false; // fail open
  }
}
