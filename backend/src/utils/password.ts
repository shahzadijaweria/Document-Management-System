// Password hashing utilities — bcrypt wrappers.
// Cost factor 12 ≈ 250ms per hash on modern hardware (OWASP recommendation).

import bcrypt from "bcrypt";

const COST_FACTOR = 12;

/**
 * Hash a plaintext password. Salt is generated automatically and embedded
 * in the returned hash, so no separate salt storage is needed.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, COST_FACTOR);
}

/**
 * Verify a plaintext password against a stored bcrypt hash.
 * Uses constant-time comparison internally to defeat timing attacks —
 * never roll your own comparison.
 */
export async function verifyPassword(
  plaintext: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}
