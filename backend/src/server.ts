// Boots the HTTP server and wires process-level concerns:
//   - http.Server (so Socket.io can attach later)
//   - Graceful shutdown on SIGTERM / SIGINT
//   - Crash logging for uncaught errors

import http from "node:http";

import app from "./app";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { prisma } from "./db/prisma";
import { redis } from "./db/redis";
import { initSocketIO } from "./sockets";

const server = http.createServer(app);

// Attach Socket.io to the same HTTP server 
initSocketIO(server).catch((err) => {
  logger.error("failed to init socket.io", {
    message: err instanceof Error ? err.message : String(err),
  });
});

// ─── Start listening ──────────────────────────────────────────
server.listen(env.PORT, () => {
  logger.info("server listening", {
    port: env.PORT,
    env: env.NODE_ENV,
    url: `http://localhost:${env.PORT}`,
  });
});

// ─── Graceful shutdown ────────────────────────────────────────
// On SIGTERM (k8s/Docker/PM2 stop) or SIGINT (Ctrl+C):
//   1. Stop accepting new connections (server.close)
//   2. Let in-flight requests finish
//   3. Exit
// Hard 10s timeout in case a connection hangs.
const shutdown = (signal: string): void => {
  logger.info(`${signal} received — shutting down gracefully`);

  // Order: stop new connections -> wait for in-flight requests -> release DB pool -> exit
  server.close(async (err) => {
    if (err) {
      logger.error("error during server.close()", { message: err.message });
      process.exit(1);
    }
    logger.info("HTTP server closed");

    try {
      await prisma.$disconnect();
      logger.info("prisma client disconnected");
    } catch (e) {
      logger.error("error during prisma.$disconnect()", {
        message: e instanceof Error ? e.message : String(e),
      });
    }

    try {
      await redis.quit();
      logger.info("redis client disconnected");
    } catch (e) {
      logger.warn("error during redis.quit()", {
        message: e instanceof Error ? e.message : String(e),
      });
    }

    process.exit(0);
  });

  // .unref() so the timer itself doesn't keep the event loop alive
  // if shutdown completes cleanly before the timeout fires.
  setTimeout(() => {
    logger.error("forceful shutdown — connections did not close in 10s");
    process.exit(1);
  }, 10_000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ─── Crash safety ─────────────────────────────────────────────
process.on("unhandledRejection", (reason) => {
  logger.error("unhandledRejection", { reason: String(reason) });
});

process.on("uncaughtException", (err) => {
  logger.error("uncaughtException", {
    message: err.message,
    stack: err.stack,
  });
  process.exit(1);
});
