// Express middleware that gates protected routes.
// requireAuth — reads the Authorization: Bearer header, verifies the JWT,
//   checks the revocation blocklist, attaches user info to req.user.
// requireAdmin — must run AFTER requireAuth; rejects non-admin users with 403.

import type { NextFunction, Request, Response } from "express";

import { isRevoked } from "../api/auth/auth.blocklist";
import { ForbiddenError, UnauthorizedError } from "../utils/errors";
import { verifyAccessToken } from "../utils/jwt";

// Tell TypeScript that req.user exists after this middleware runs.
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: "USER" | "ADMIN";
        jti: string;
        exp: number;
      };
    }
  }
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or malformed Authorization header");
  }

  const token = header.slice("Bearer ".length);
  const payload = verifyAccessToken(token); // throws on bad/expired

  if (await isRevoked(payload.jti)) {
    throw new UnauthorizedError("Token revoked");
  }

  req.user = {
    id: payload.sub,
    email: payload.email,
    role: payload.role ?? "USER",
    jti: payload.jti,
    exp: payload.exp ?? 0,
  };
  next();
}

// Admin-only gate. Compose with requireAuth: router.post("/", requireAuth, requireAdmin, handler).
// (requireAuth runs first to populate req.user.)
export function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) throw new UnauthorizedError();
  if (req.user.role !== "ADMIN") {
    throw new ForbiddenError("Admin access required");
  }
  next();
}
