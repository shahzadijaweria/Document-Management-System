// JWT helpers — sign and verify access/refresh tokens.
//
// Two tokens, two secrets:
//   - Access  (~15min, JWT_SECRET):         sent on every API call. Short-lived to limit blast radius if leaked.
//   - Refresh (~7d,    JWT_REFRESH_SECRET): used only to mint a new access token. Lives longer, exposed less.

import { randomUUID } from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";

import { env } from "../config/env";
import { UnauthorizedError } from "./errors";

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: "USER" | "ADMIN";
  type: "access" | "refresh";
  jti: string; // unique token id — used by the revocation blocklist
  iat?: number; // populated by jsonwebtoken on sign
  exp?: number; // populated by jsonwebtoken on sign
}

type SignInput = Pick<JwtPayload, "sub" | "email" | "role">;

export function signAccessToken(payload: SignInput): string {
  return jwt.sign(
    { ...payload, type: "access", jti: randomUUID() },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN } as SignOptions,
  );
}

export function signRefreshToken(payload: SignInput): string {
  return jwt.sign(
    { ...payload, type: "refresh", jti: randomUUID() },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN } as SignOptions,
  );
}

export function verifyAccessToken(token: string): JwtPayload {
  return verifyToken(token, env.JWT_SECRET, "access");
}

export function verifyRefreshToken(token: string): JwtPayload {
  return verifyToken(token, env.JWT_REFRESH_SECRET, "refresh");
}

function verifyToken(
  token: string,
  secret: string,
  expectedType: JwtPayload["type"],
): JwtPayload {
  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;
    if (decoded.type !== expectedType) {
      throw new UnauthorizedError("Invalid token");
    }
    return decoded;
  } catch (err) {
    // Re-throw our own typed error; collapse all jwt errors into one generic
    // "Invalid token" so attackers can't probe (expired vs malformed vs wrong-secret).
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError("Invalid token");
  }
}
