// Centralised winston logger.
// Dev: colorized, human-readable lines.
// Prod: structured JSON (one log per line) so aggregators can index fields.

import winston from "winston";
import { env } from "../config/env";

const isProd = env.NODE_ENV === "production";

// Dev format: 14:32:01 info  message {meta:...}
const devFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: "HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length
      ? ` ${JSON.stringify(meta)}`
      : "";
    const stackStr = stack ? `\n${stack}` : "";
    return `${timestamp} ${level} ${message}${metaStr}${stackStr}`;
  }),
);

// Prod format: {"timestamp":"2026-04-30T...","level":"error","message":"...",...}
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: isProd ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console(),
    // Persist errors to disk in prod so they survive container restarts
    ...(isProd
      ? [
          new winston.transports.File({
            filename: "logs/error.log",
            level: "error",
          }),
          new winston.transports.File({
            filename: "logs/combined.log",
          }),
        ]
      : []),
  ],
  // Don't crash the process if logging itself errors (e.g. disk full)
  exitOnError: false,
});
