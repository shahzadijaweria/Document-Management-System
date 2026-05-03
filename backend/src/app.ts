// Builds and exports the Express app.

import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import { env } from "./config/env";
import { logger } from "./utils/logger";
import { prisma } from "./db/prisma";
import { redis } from "./db/redis";
import { AppError } from "./utils/errors";
import { requireAuth } from "./middlewares/auth.middleware";
import authRouter from "./api/auth/auth.routes";
import documentsRouter from "./api/documents/documents.routes";
import categoriesRouter from "./api/categories/categories.routes";
import notificationsRouter from "./api/notifications/notifications.routes";

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }),
);

app.use(compression());

// ─── Body parsing ───────────────────────────────────────────────
// 1mb is fine for JSON; file uploads go through multer (multipart, separate route).
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ─── HTTP request logging (morgan piped through winston) ───────
app.use(
  morgan(env.NODE_ENV === "production" ? "combined" : "dev", {
    stream: { write: (msg: string) => logger.info(msg.trim()) },
  }),
);

// ─── Liveness check ─────────────────────────────────────────────
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
  });
});

// ─── Readiness check ────────────────────────────────────────────
app.get("/ready", async (_req: Request, res: Response) => {
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};
  let allOk = true;

  // DB ping
  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = { ok: true, latencyMs: Date.now() - dbStart };
  } catch (err) {
    allOk = false;
    checks.db = {
      ok: false,
      latencyMs: Date.now() - dbStart,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Redis ping
  const redisStart = Date.now();
  try {
    await redis.ping();
    checks.redis = { ok: true, latencyMs: Date.now() - redisStart };
  } catch (err) {
    allOk = false;
    checks.redis = {
      ok: false,
      latencyMs: Date.now() - redisStart,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  res.status(allOk ? 200 : 503).json({
    status: allOk ? "ready" : "not_ready",
    checks,
  });
});

// ─── Auth rate limit ────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests / IP / window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many requests, please try again later.",
    },
  },
});

// ─── API routes ─────────────────────────────────────────────────
app.use("/api/auth", authLimiter, authRouter);
app.use("/api/documents", requireAuth, documentsRouter);
app.use("/api/categories", requireAuth, categoriesRouter);
app.use("/api/notifications", requireAuth, notificationsRouter);

// ─── 404 handler ────────────────────────────────────────────────
// Runs when no route above matched.
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: { message: "Not Found", path: req.path },
  });
});

// ─── Centralised error handler ──────────────────────────────────
// Express identifies error handlers by their 4-argument signature.
// Anything thrown in a route or middleware lands here.
// (Express 5 routes async throws here automatically — no need for
// express-async-errors like in Express 4.)
//
// Two paths:
//   1. AppError thrown deliberately by a service/controller -> map to its
//      statusCode + code + message. Logged at warn level (expected outcome).
//   2. Anything else -> log full stack at error level, return 500 with a
//      generic message (don't leak internals to the client).
app.use(
  (err: Error, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      logger.warn("AppError", {
        code: err.code,
        message: err.message,
        statusCode: err.statusCode,
        path: req.path,
        method: req.method,
      });
      res.status(err.statusCode).json({
        error: {
          code: err.code,
          message: err.message,
          ...(err.details !== undefined ? { details: err.details } : {}),
        },
      });
      return;
    }

    // Genuinely unexpected — log full stack so we can debug.
    logger.error("unhandled error", {
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });
    res.status(500).json({
      error: { code: "INTERNAL_SERVER_ERROR", message: "Internal Server Error" },
    });
  },
);

export default app;
