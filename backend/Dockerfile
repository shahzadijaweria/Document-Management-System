# Multi-stage build:
#   Stage 1 (builder): install everything, generate Prisma client, compile TS -> JS
#   Stage 2 (runtime):  copy only what's needed + install prod deps -> small image

# ─── Stage 1: build ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Install ALL dependencies (including dev) for the build step
COPY package*.json ./
RUN npm ci

# Copy source + Prisma schema, generate the typed client, compile TS
COPY . .
RUN npx prisma generate
RUN npm run build


# ─── Stage 2: runtime ───────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Install ONLY production deps (smaller image, no compiler/lint tools)
COPY package*.json ./
RUN npm ci --omit=dev

# Bring in build artifacts from stage 1
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/src/generated ./src/generated

ENV NODE_ENV=production
EXPOSE 4000

# On boot: apply pending migrations, then start the server.
# `migrate deploy` is the production-safe variant (no prompts, no schema changes).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
