// Socket.io bootstrap.
//   - JWT-authenticated connections (via io.use middleware)
//   - User-specific rooms ("user:<userId>") so we can broadcast to all of a user's tabs at once
//   - Online tracking in Redis (SET of active socket IDs per user) — handles multi-tab/multi-device
//   - emitToUser(userId, event, payload) helper used by services to push real-time events

import type { Server as HttpServer } from "node:http";
import { Server as IOServer } from "socket.io";

import { isRevoked } from "../api/auth/auth.blocklist";
import { env } from "../config/env";
import { redis } from "../db/redis";
import { verifyAccessToken } from "../utils/jwt";
import { logger } from "../utils/logger";

let io: IOServer | null = null;

export function getIO(): IOServer {
  if (!io) throw new Error("Socket.io not initialized — call initSocketIO first");
  return io;
}

function userRoom(userId: string): string {
  return `user:${userId}`;
}

function onlineKey(userId: string): string {
  return `online:${userId}`;
}

// Wipe stale online-user entries left over from previous runs.

async function clearStaleOnlineState(): Promise<void> {
  try {
    const keys = await redis.keys("online:*");
    if (keys.length > 0) await redis.del(...keys);
    logger.info("cleared stale online-user state", { keysCleared: keys.length });
  } catch (err) {
    logger.warn("failed to clear online state on init", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function initSocketIO(httpServer: HttpServer): Promise<IOServer> {
  await clearStaleOnlineState();

  io = new IOServer(httpServer, {          
    cors: { origin: env.CORS_ORIGIN, credentials: true },
  });

  // ─── JWT auth middleware ────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      // Token from `auth: { token: ... }` (preferred) or Authorization header (fallback).
      const fromAuth = socket.handshake.auth?.["token"];
      const fromHeader = socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, "");
      const token = typeof fromAuth === "string" ? fromAuth : fromHeader;

      if (!token) return next(new Error("Missing token"));

      const payload = verifyAccessToken(token);
      if (await isRevoked(payload.jti)) {
        return next(new Error("Token revoked"));
      }

      socket.data.userId = payload.sub;
      socket.data.email = payload.email;
      next();
    } catch (err) {
      logger.warn("socket auth failed", {
        message: err instanceof Error ? err.message : String(err),
      });
      next(new Error("Unauthorized"));
    }
  });

  // ─── Connection / disconnection ─────────────────────────────
  io.on("connection", async (socket) => {
    const userId = socket.data.userId as string;
    socket.join(userRoom(userId));

    logger.info("socket connected", { userId, socketId: socket.id });
    socket.emit("connection:status", { status: "connected", userId });

    // Online tracking: add this socket; if it's the user's first, broadcast user:online.
    try {
      const wasOffline = (await redis.scard(onlineKey(userId))) === 0;
      await redis.sadd(onlineKey(userId), socket.id);
      if (wasOffline && io) {
        io.emit("user:online", { userId });
      }
    } catch (err) {
      logger.warn("online-tracking add failed", {
        userId,
        message: err instanceof Error ? err.message : String(err),
      });
    }

    socket.on("disconnect", async (reason) => {
      logger.info("socket disconnected", { userId, socketId: socket.id, reason });

      try {
        await redis.srem(onlineKey(userId), socket.id);
        const stillOnline = (await redis.scard(onlineKey(userId))) > 0;
        if (!stillOnline && io) {
          io.emit("user:offline", { userId });
        }
      } catch (err) {
        logger.warn("online-tracking remove failed", {
          userId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    });
  });

  return io;
}

// ─── Used by services to push events to a user's tabs ──────────
// emitToUser(userId, "document:uploaded", { id, name, ... })
//   -> reaches every tab/device the user has open. Other users don't see it.
export function emitToUser(
  userId: string,
  event: string,
  payload: unknown,
): void {
  if (!io) return;
  io.to(userRoom(userId)).emit(event, payload);
}
