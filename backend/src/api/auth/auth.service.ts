// Auth business logic. Throws AppError subclasses on failure;
// the global error handler maps them to HTTP responses.

import { prisma } from "../../db/prisma";
import { hashPassword, verifyPassword } from "../../utils/password";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../../utils/jwt";
import { ConflictError, UnauthorizedError } from "../../utils/errors";

import * as blocklist from "./auth.blocklist";
import type { LoginInput, RegisterInput } from "./auth.validation";
import type { AuthResult, RefreshResult, SafeUser } from "./auth.types";

function toSafeUser(user: {
  id: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
  createdAt: Date;
  updatedAt: Date;
}): SafeUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function issueTokens(user: SafeUser): {
  accessToken: string;
  refreshToken: string;
} {
  const payload = { sub: user.id, email: user.email, role: user.role };
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (existing) {
    throw new ConflictError("Email already registered");
  }

  const passwordHash = await hashPassword(input.password);

  const created = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash,
    },
  });

  const user = toSafeUser(created);
  return { user, ...issueTokens(user) };
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const found = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (!found) {
    throw new UnauthorizedError("Invalid credentials");
  }

  const isPasswordVerified = await verifyPassword(input.password, found.passwordHash);
  if (!isPasswordVerified) {
    throw new UnauthorizedError("Invalid credentials");
  }

  const user = toSafeUser(found);
  return { user, ...issueTokens(user) };
}

export async function refresh(refreshToken: string): Promise<RefreshResult> {
  const payload = verifyRefreshToken(refreshToken);

  // Reject revoked refresh tokens (e.g. after the user logged out).
  if (await blocklist.isRevoked(payload.jti)) {
    throw new UnauthorizedError("Invalid token");
  }

  // Re-check the user — the token may be valid but the user could have been deleted.
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    throw new UnauthorizedError("Invalid token");
  }

  return issueTokens(toSafeUser(user));
}

// Revoke the current access token (and the refresh token if provided).
// Each jti goes into Redis with TTL = remaining seconds until natural expiry,
// so Redis cleans itself up automatically.
export async function logout(
  accessJti: string,
  accessExp: number,
  refreshToken?: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await blocklist.revoke(accessJti, accessExp - now);

  if (refreshToken) {
    try {
      const payload = verifyRefreshToken(refreshToken);
      await blocklist.revoke(payload.jti, (payload.exp ?? now) - now);
    } catch {
    }
  }
}
