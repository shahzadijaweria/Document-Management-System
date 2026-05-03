// Singleton Prisma client — ONE instance per process.
// Holds a connection pool, so multiple instances would exhaust Postgres connections.
// The globalThis cache prevents new instances on hot-reload during dev.
//
// Prisma 7 requires a driver adapter — for PostgreSQL we use @prisma/adapter-pg,
// which wraps the standard `pg` driver and feeds queries to Prisma.

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { env } from "../config/env";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    // Only log warnings/errors. "query" is too noisy by default;
    // enable temporarily when actively debugging slow queries.
    log: env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

// Cache on globalThis only in non-prod (avoid global state leaks in prod)
if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
