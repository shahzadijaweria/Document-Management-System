### Project setup instructions:
### Created separate frontend backend folders and a docker file.
### node already installed - check node version (node -v)
### download postgresql which automatically install pgadmin as well
### set up basic structure for backend folder - create new node folder with npm init -y

### installed runtime deps in 4 logical groups (inside backend/):
###   2a) web core:        npm install express cors helmet compression morgan
###   2b) auth/validation: npm install jsonwebtoken bcrypt zod
###   2c) upload/s3:       npm install multer @aws-sdk/client-s3 @aws-sdk/s3-request-presigner uuid
###   2d) realtime/db/env: npm install socket.io ioredis @prisma/client dotenv express-rate-limit

### installed dev deps in 4 logical groups (inside backend/, all with -D flag):
###   3a) ts toolchain:   npm install -D typescript ts-node nodemon
###   3b) type defs:      npm install -D @types/node @types/express @types/cors @types/compression @types/morgan @types/jsonwebtoken @types/bcrypt @types/multer @types/uuid
###   3c) lint/format:    npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin prettier eslint-config-prettier
###   3d) prisma CLI:     npm install -D prisma
### note: dev deps don't ship to production (npm ci --omit=dev skips them) - smaller prod image, no compile/lint tools at runtime
### initialized typescript config: npx tsc --init (creates tsconfig.json with TS 6 defaults)

### customized tsconfig.json for an express+node backend (see notes inline in the file)
###   - paired module + moduleResolution on "node16" (TS 6 deprecates "node"/"node10"; TS 6 enforces they match)
###   - kept "commonjs" emit format implicitly: package.json has "type": "commonjs", so module: "node16" emits CJS
###   - dropped library-only flags (declaration, declarationMap, jsx) — we're an app, not a library
###   - added rootDir/outDir, esModuleInterop, resolveJsonModule, forceConsistentCasingInFileNames
###   - dropped noUncheckedIndexedAccess and verbatimModuleSyntax (too much friction up front; can revisit later)

### created src/server.ts placeholder so tsc has at least one input file (real bootstrap comes in Step 7)
### verified config: npx tsc --noEmit (type-check only, no output) - passes clean

### created backend/.gitignore (ignores node_modules, dist, .env*, logs, IDE, OS junk; keeps .env.example via ! exception)
### created backend/.env.example with placeholders for: NODE_ENV/PORT, DATABASE_URL, JWT_*, AWS_*, REDIS_*, CORS_ORIGIN, LOG_LEVEL
### copied .env.example to .env for local use: cp .env.example .env (then fill in real values)
### generate JWT secrets: node -e "console.log(require('crypto').randomBytes(64).toString('base64'))" - run twice for access + refresh secrets

### installed git through git init and verified gitignore file doiesn't show in git status

### added npm scripts via npm pkg set (cleaner than hand-editing package.json):
###   - dev:        nodemon                              (live reload during dev)
###   - build:      tsc -p tsconfig.json                 (compile src/ -> dist/)
###   - start:      node dist/server.js                  (run compiled output in prod)
###   - type-check: tsc --noEmit                         (CI sanity check, no output)
###   - lint:       eslint "src/**/*.ts"                 (find code-quality issues)
###   - lint:fix:   eslint "src/**/*.ts" --fix           (auto-fix what eslint can)
###   - format:     prettier --write "src/**/*.ts"       (auto-format)
### gotcha: on windows bash, npm pkg set mangled the inner quotes for lint/lint:fix/format
###   - had to manually fix package.json (\\src/**/*.ts\" -> \"src/**/*.ts\")
###   - takeaway: when npm pkg set fights cross-platform quoting, just edit the JSON
### created backend/nodemon.json (watch src/, ext ts/js/json, ignore tests, exec ts-node src/server.ts)
### tested: npm run dev -> nodemon ran ts-node src/server.ts, printed bootstrap log, exited cleanly (expected: no listener yet)

### Step 7a - env config loader (src/config/env.ts):
###   - one place reads process.env, validates with zod, exports typed `env` object
###   - z.coerce.number() converts string env vars to numbers; .min(32) on JWT secrets; .url() on DATABASE_URL
###   - safeParse + process.exit(1) on failure -> fail-fast at boot, not at first request
###   - AWS_* fields kept .optional() for now; will tighten when we wire S3
###   - imports: import { env } from "./config/env"  -> fully typed, no string|undefined

### Step 7b - winston logger (src/utils/logger.ts):
###   - installed: npm install winston
###   - dev format: colored, HH:mm:ss timestamp, human-readable
###   - prod format: ISO 8601 timestamp + JSON (one log per line) for aggregators
###   - logger.info("msg", { key: val }) -> structured metadata, searchable in log tools
###   - exitOnError: false so logging failures don't crash the process
###   - tested via temporary server.ts -> three colored lines in dev terminal

### Step 7c - express app (src/app.ts):
###   - middleware order: helmet -> cors -> compression -> body parsing -> morgan -> routes -> 404 -> error handler
###   - error handler is LAST and identified by 4-arg signature (err, req, res, next)
###   - express 5 routes async throws to error handler automatically (no express-async-errors needed)
###   - morgan piped through winston so all logs share one pipeline
###   - GET /health returns { status, uptime, timestamp, env } - no auth, no DB, fast liveness check
###   - app exported as default; does NOT call .listen() (server.ts does that)

### Step 7d - http server bootstrap (src/server.ts):
###   - http.createServer(app) instead of app.listen() so socket.io can attach to the same server later
###   - graceful shutdown on SIGTERM/SIGINT: server.close() lets in-flight requests finish, then process.exit(0)
###   - 10s hard-timeout via setTimeout(...).unref() in case a connection hangs
###   - logs unhandledRejection and uncaughtException before process dies (supervisor restarts cleanly)
###   - tested: npm run dev -> "server listening on port 4000" -> http://localhost:4000/health returns JSON
###   - tested: ctrl+c -> "SIGINT received — shutting down gracefully" -> "HTTP server closed"

### Step 8a - prisma init (database layer scaffold):
###   - prereq: postgres service running + DATABASE_URL in .env points at a valid postgres (password may need updating from default)
###   - ran: npx prisma init   (in backend/)
###   - created: prisma/schema.prisma  +  prisma.config.ts  (latter is new in Prisma 7)
###   - prisma.config.ts loads dotenv/config and passes process.env["DATABASE_URL"] to prisma -> schema.prisma no longer needs `url = env("DATABASE_URL")`
###   - generator block uses NEW "prisma-client" provider (not legacy "prisma-client-js"); output -> src/generated/prisma (auto-added to .gitignore)
###   - import path will be: import { PrismaClient } from "../generated/prisma"   (not from "@prisma/client")
###   - @prisma/client package in deps is unused by the new generator; leaving it for now, can prune later

### Step 8b - schema models (prisma/schema.prisma):
###   - 4 models: User, Document, Category, Notification (matching spec's tables)
###   - IDs use cuid() (collision-resistant + sortable, faster than uuid as a B-tree key, hides record count)
###   - camelCase in TS / snake_case in DB via @map: passwordHash <-> password_hash, etc. (@@map for table names: User -> users)
###   - relations + cascade rules:
###       Document.userId   -> User      onDelete: Cascade   (no orphan documents when user deleted)
###       Document.categoryId -> Category onDelete: SetNull  (deleting category clears the label, doesn't nuke the document)
###       Notification.userId -> User    onDelete: Cascade
###   - Document.category is a real FK relation (categoryId), not a free-form string - cleaner than spec's literal column name
###   - indexes added where we filter/join: Document(userId), Document(categoryId), Notification(userId, read) compound
###   - Notification.read defaults to false so inserts don't need to set it
###   - email @unique on User gives implicit index for login lookups

### Step 8c - first migration (npx prisma migrate dev --name init):
###   - created the dms database (Prisma creates it automatically if missing)
###   - generated migration: prisma/migrations/<timestamp>_init/migration.sql (commit this to git!)
###   - migration_lock.toml records the provider (postgresql) so future migrations can't accidentally switch
###   - SQL applied: 4 CREATE TABLE, 5 indexes (incl. unique on users.email and categories.name, compound on notifications.user_id+read), 3 FK constraints with cascade rules

Error.........................

###   - GOTCHA: Prisma 7's new "prisma-client" generator does NOT auto-generate during migrate dev (old "prisma-client-js" did)
###       -> after migrate dev, must run: npx prisma generate
###       -> generated to: src/generated/prisma/  (gitignored)
###   - rule of thumb: every schema change = new named migration (npx prisma migrate dev --name describe_change). Migration history is committed to git.
###   - alternatives we did NOT use:
###       prisma db push    -> applies schema without migration files (prototyping only, no history)
###       prisma migrate deploy -> applies existing migrations (CI/prod, doesn't create new ones)
###   - verify in pgAdmin: Servers > PostgreSQL > Databases > dms > Schemas > public > Tables (users, documents, categories, notifications, _prisma_migrations)
### ran: npx prisma generate -> src/generated/prisma/{client,enums,models,...}.ts created

### Step 8d - prisma client singleton (src/db/client.ts):
###   - exports a SINGLE prisma instance for the whole process (PrismaClient holds a connection pool; multiple instances exhaust Postgres connections)
###   - import path: import { PrismaClient } from "../generated/prisma/client"  (Prisma 7 new generator emits to src/generated/prisma)
###   - globalThis cache survives hot-reloads in dev/test (re-importing the module doesn't create a new client)
###   - cache disabled in production (no hot-reload there + globals are an anti-pattern in prod)
###   - log levels: ["error","warn"] in dev / ["error"] in prod; add "query" temporarily when debugging SQL
###   - usage anywhere: import { prisma } from "@db/client" (or relative path) -> prisma.user.findMany() etc.
###   - cleanup: removed unused empty src/db/prisma/ directory (we use backend/prisma/ for schema, not nested)

Error...............................
### GOTCHA: Prisma 7's new client requires a driver adapter (or Prisma Accelerate URL) - it does NOT bundle native db drivers anymore
###   - PrismaClientOptions is now a discriminated union: { adapter } OR { accelerateUrl } - one is required
###   - benefit: smaller bundle, works in edge/serverless, byo-driver flexibility
###   - postgres -> @prisma/adapter-pg (wraps the `pg` Node driver)
###   - installed: npm install @prisma/adapter-pg pg
###   - installed: npm install -D @types/pg     (pg is JS-only, types live separately)
###   - updated src/db/client.ts:
###       import { PrismaPg } from "@prisma/adapter-pg";
###       const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
###       new PrismaClient({ adapter, log: [...] })

### note on src/generated/prisma/ folder structure (auto-generated, gitignored, do NOT edit):
###   - client.ts            <- the only file you import from   (PrismaClient class)
###   - models.ts            <- TS types for User/Document/Category/Notification
###   - models/              <- per-model input shapes (UserCreateInput, DocumentWhereInput, ...)
###   - enums.ts             <- generated enums (empty for us; populates if we add enum blocks to schema.prisma)
###   - commonInputTypes.ts  <- shared filter/order/pagination types (SortOrder, StringFilter, ...)
###   - browser.ts           <- type-only entry for browser/edge runtimes (we don't use it; backend only)
###   - internal/            <- runtime engine + query glue (never imported directly)
###   - all of these get nuked + regenerated by `npx prisma generate`. CI should run generate as part of build.
###   - mental model: same role as node_modules/ - transient build artifact. Lives in src/ for better tree-shaking.

### Step 8e - DB sanity check + clean disconnect on shutdown:
###   - added GET /ready endpoint (separate from /health) - readiness probe with DB ping via prisma.$queryRaw`SELECT 1`
###   - kept /health as pure liveness (no deps) per the kubernetes pattern:
###       /health  -> "is process alive? should we RESTART the pod?"  (no deps, fast)
###       /ready   -> "can it serve traffic? should we ROUTE to it?"  (DB/Redis/etc., 503 if down)
###   - /ready returns checks: { db: { ok, latencyMs, error? } } - extensible for redis later
###   - wired prisma.$disconnect() into graceful shutdown (server.ts):
###       order: server.close (stop new conns + drain in-flight) -> prisma.$disconnect (release pool) -> process.exit(0)
###       10s hard-timeout still fires if any step hangs
###   - tested:
###       /health  -> 200 OK, no DB hit
###       /ready   -> 200 OK with db.ok:true and latencyMs (proves end-to-end Postgres connectivity through Prisma adapter-pg)
###       postgres stopped -> /ready returns 503 with db.ok:false + error message
###       ctrl+c -> "HTTP server closed" -> "prisma client disconnected" -> clean exit

..................Error
### GOTCHA: ts-node + module:"node16" + Prisma 7 generated client = CJS/ESM mismatch crash
###   - error: "ReferenceError: exports is not defined in ES module scope" at src/generated/prisma/client.ts
###   - root cause: ts-node compiled the file as CJS (exports.X = ...) but node loaded it via the ESM loader (no `exports` global)
###   - ts-node has known issues with auto-CJS/ESM detection under module:"node16"; ecosystem has moved to tsx (esbuild-backed, faster, no quirks)
###   - fix:
###       npm install -D tsx
###       nodemon.json: "exec": "tsx src/server.ts"   (replaces ts-node)
###   - kept ts-node in devDeps for now; can prune later
###   - build/start unaffected: tsc -> dist/ -> node dist/server.js   all CJS, no ts-node involved

### nodemon: added ".env" to watch list (dotenv loads .env at module top, so any change needs a full restart)
###   - nodemon.json: "watch": ["src", ".env"]   (specific filenames bypass the `ext` filter)
###   - reminder: invalid .env values cause env validator to exit(1); nodemon waits for next save then retries
###   - tested: edit .env -> see nodemon restart in terminal -> /ready reflects new config

### Step 9 - auth module (overview):
###   - feature folder structure: src/api/auth/{routes,controller,service,validation}.ts (separation of concerns)
###   - service has NO http knowledge - just throws rich errors; controller is thin (validate -> call service -> return)
###   - 8 substeps: 9a errors, 9b password, 9c jwt, 9d validation, 9e service, 9f controller+routes, 9g requireAuth middleware, 9h wire+test

### Step 9a - custom error classes (src/utils/errors.ts):
###   - AppError base class + subclasses: BadRequestError(400), UnauthorizedError(401), ForbiddenError(403), NotFoundError(404), ConflictError(409), PayloadTooLargeError(413), UnsupportedMediaTypeError(415)
###   - readonly fields: statusCode, code (machine-readable, e.g. "UNAUTHORIZED"), message, details? (optional structured info)
###   - Error.captureStackTrace?.(this, this.constructor) -> cleaner stack traces, omit constructor frame
###   - updated app.ts global error handler (2 branches):
###       1. instanceof AppError -> log at warn (expected), return statusCode/code/message/details to client
###       2. anything else -> log at error with full stack, return generic 500 (never leak internals)
###   - error contract: services THROW, handler MAPS to HTTP. controllers stay ~5 lines.

### Step 9b - password helpers (src/utils/password.ts):
###   - thin bcrypt wrapper: hashPassword(plaintext) + verifyPassword(plaintext, hash)
###   - cost factor 12 (~250ms/hash, OWASP recommendation as of recent guidance) - bump in future as hardware speeds up
###   - salt auto-generated and embedded in the hash output ($2b$12$<salt><hash>); no separate salt column needed
###   - bcrypt.compare uses constant-time comparison internally - defeats timing attacks. NEVER roll your own ===
###   - async only - sync variants block the event loop for 250ms (frozen server during login/register)
###   - password length/complexity rules belong in zod validation (9d), NOT in this util file

### Step 9c - JWT helpers (src/utils/jwt.ts):
###   - dual-token pattern:
###       access token  ~15min, signed with JWT_SECRET, sent on every API request (high exposure -> short-lived)
###       refresh token ~7d,    signed with JWT_REFRESH_SECRET, used only to mint new access tokens (low exposure -> long-lived)
###   - separate secrets so leaked access secret can't forge refresh tokens (and vice versa)
###   - payload: { sub: userId, email, type: "access"|"refresh", iat, exp }
###   - "type" claim inside payload = defense in depth: even if both secrets accidentally match, cross-type use is rejected
###   - verify functions COLLAPSE all errors into generic "Invalid token" - don't leak (expired vs malformed vs wrong-secret) to attackers
###   - jsonwebtoken's own errors (TokenExpiredError, JsonWebTokenError) are wrapped as UnauthorizedError so global handler returns 401 (not 500)
###   - sign functions never accept "type" from caller - set internally to prevent payload-injection

### Step 9d - validation (zod schemas + validate middleware):
###   - src/middlewares/validate.middleware.ts: one small function `validate(schema)`. safeParse req.body; on fail throws BadRequestError with the zod issues; on success replaces req.body with the parsed/typed data.
###   - src/api/auth/auth.validation.ts: registerSchema, loginSchema, refreshSchema (zod)
###       email: .trim().toLowerCase().email()  -> prevents duplicate-account bugs (Alice@... vs alice@...)
###       register password: min 8, max 128 (max guards against bcrypt's silent 72-byte truncation)
###       login password: min 1 only - old accounts may pre-date stricter rules; bcrypt.compare is the real check
###       name: .trim().min(1).max(100)
###   - schema doubles as the type: `type RegisterInput = z.infer<typeof registerSchema>` (single source of truth, no DTO drift)
###   - zod 4 note: ZodSchema and ZodTypeAny are both deprecated -> we use ZodType<unknown>

### length rules - register vs login vs refresh:
###   - REGISTER password min 8        -> we control creation, enforce quality going in
###   - LOGIN    password min 1        -> verifying existing creds; legacy users may pre-date stricter rules; bcrypt.compare is the real check
###   - REFRESH  refreshToken min 1    -> not a password, it's a JWT we signed; jwt.verify is the real check; min 1 is just "non-empty string"
###   - rule: enforce strength at the CREATION boundary, not the VERIFICATION boundary

### Step 9e - auth service (src/api/auth/auth.service.ts):
###   - 3 functions: register, login, refresh - no HTTP knowledge, just throws AppError subclasses
###   - toSafeUser(user) strips passwordHash via explicit field mapping -> passwordHash never leaves the service
###   - issueTokens(user) signs access + refresh tokens together -> keeps each handler compact
###   - register: check duplicate email -> ConflictError(409); hash password; create user; issue tokens (auto-login)
###   - login: SAME generic "Invalid credentials" for both "no user found" and "wrong password" -> attackers can't enumerate emails by error text
###   - refresh: verifyRefreshToken (throws on bad/expired) -> re-fetch user (may have been deleted post-issue) -> issue new access + refresh tokens
###   - auth.types.ts: SafeUser, AuthResult, RefreshResult defined explicitly (skipped the Prisma User-type import since Prisma 7's barrel re-export was finicky)
###   - intentionally kept simple: skipped lazy-memoized dummy bcrypt hash, void-destructure tricks, generic literal-union schema maps. Best practices stay (boundary validation, hashed passwords, generic auth errors, service/controller split); readability wins.

### Step 9f - auth controller + routes:
###   - auth.controller.ts: 3 thin handlers (~3 lines each). Each: cast req.body to the zod-inferred type, await service, send JSON.
###   - auth.routes.ts: Express Router with 3 POST routes:
###       POST /register  -> validate(registerSchema) -> authController.register   (201 Created)
###       POST /login     -> validate(loginSchema)    -> authController.login      (200)
###       POST /refresh   -> validate(refreshSchema)  -> authController.refresh    (200)
###   - no try/catch in controllers - Express 5 auto-forwards async throws to the global error handler in app.ts
###   - router exported as default; mounted at /api/auth in 9h via `app.use("/api/auth", authRouter)`

### Step 9g - requireAuth middleware (src/middlewares/auth.middleware.ts):
###   - reads "Authorization: Bearer <token>" header; rejects 401 if missing/malformed
###   - calls verifyAccessToken (utils/jwt.ts) which throws UnauthorizedError on bad signature / expiry / wrong type
###   - attaches { id, email } to req.user on success
###   - declared `req.user` inline at the top of the file (declare global namespace Express { interface Request { user?: ... } }) - skipped a separate types/express.d.ts to keep file count down
###   - no try/catch needed - Express catches sync throws and routes them to the global error handler
###   - usage: app.use("/api/documents", requireAuth, docsRouter)  -> everything in docsRouter is gated

### Step 9h - wire /api/auth + rate-limit + end-to-end test:
###   - app.ts: imported authRouter; mounted with `app.use("/api/auth", authLimiter, authRouter)`
###   - rate limit (express-rate-limit): 30 requests / IP / 15 min on /api/auth/* only (not on /health, /ready, etc.)
###   - returns 429 with code "RATE_LIMITED" when tripped


###   - tested via PowerShell Invoke-RestMethod (curl on PowerShell strips inner JSON quotes -> server gets malformed JSON. Use Invoke-RestMethod with @{ ... } | ConvertTo-Json):
###       POST /api/auth/register  ok 201 {user,accessToken,refreshToken}
###       POST /api/auth/register again with same email -> 409 CONFLICT
###       POST /api/auth/login  ok 200
###       POST /api/auth/login wrong password -> 401 "Invalid credentials"
###       POST /api/auth/login non-existent email -> SAME 401 (no user enumeration via error text)
###       POST /api/auth/register with bad shape -> 400 BAD_REQUEST + zod field issues
###       POST /api/auth/refresh with refresh token -> 200 with new tokens
###   - verified in pgAdmin / prisma studio: user row exists with bcrypt-hashed password_hash ($2b$12$...)
###   - tip: error responses come back via $_.ErrorDetails.Message inside a try/catch (Invoke-RestMethod throws on non-2xx)

### Step 10a - Redis (Memurai) install + ioredis client:
###   - installed Memurai Developer Edition (free Windows-native Redis-compatible server, registers as auto-start Windows service)
###   - verified: Get-Service Memurai (Running) + memurai-cli ping (PONG)
###   - default port 6379 matches REDIS_PORT in .env, no env changes needed
###   - created src/db/redis.ts: single ioredis instance for the process
###       maxRetriesPerRequest: 3 -> fail fast so cache helpers can fall back to DB
###       on "connect" -> info log; on "error" -> WARN log (not error, we have graceful fallback per spec)
###       isRedisReady() helper: returns redis.status === "ready"
###   - server.ts shutdown order updated: server.close -> prisma.$disconnect -> redis.quit -> process.exit
###   - graceful fallback verified: Stop-Service Memurai -> server still boots, /health still works, only "redis error" warn in logs

### Step 10b - cache helper (src/utils/cache.ts):
###   - 4 functions: get<T>(key), set<T>(key, value, ttl), del(key), delPattern(pattern)
###   - JSON.stringify on set, JSON.parse on get (Redis stores strings)
###   - SETEX (set + TTL in one atomic op) for set; KEYS+DEL for delPattern
###   - GRACEFUL FALLBACK pattern: every function wraps the redis call in try/catch
###       on error: log at warn, return null (for get) or no-op (for set/del)
###       -> services treat cache failures as misses and fall back to DB transparently
###   - cache key conventions (defined where used, not in this file):
###       doc:<id>                                          -> single document, 10min TTL
###       docs:<userId>:<page>:<limit>:<category?>:<search?>  -> paginated user list, 5min TTL
###       cats:all                                          -> categories list, 1h TTL
###   - usage pattern: cached = await cache.get<T>(key); if (!cached) { fetch from DB; await cache.set(...); }

### Step 10c - /ready endpoint extended to check Redis:
###   - imported redis client into app.ts; added a second check block inside the existing /ready handler
###   - mirrors the DB-ping pattern: try redis.ping() -> measure latencyMs -> on error set ok:false + error message
###   - response shape: { status, checks: { db: {...}, redis: {...} } }
###   - 200 only if BOTH ok; 503 if either fails (kubernetes will stop routing traffic but won't restart pod)
###   - tested:
###       /ready  -> 200 with db.ok:true and redis.ok:true
###       Stop-Service Memurai -> /ready returns 503 with redis.ok:false (db still ok)
###       graceful: cache.get() in services still returns null (no exception thrown to callers)

### Step 11a - AWS S3 bucket + IAM user setup (manual console work):
###   - created S3 bucket (private, all 4 "block public access" boxes ON)
###   - added CORS config so frontend (localhost:3000) can use presigned URLs: AllowedMethods GET/PUT/POST/DELETE
###   - created dedicated IAM user `dms-app` with policy scoped to ONLY this bucket (least privilege)
###       allowed actions: s3:PutObject, s3:GetObject, s3:DeleteObject on bucket/*  +  s3:ListBucket on bucket
###   - generated programmatic access key (saved Access Key ID + Secret Access Key once - secret shown only on creation)
###   - filled in backend/.env: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET
###   - .env stays gitignored; if keys leak: IAM -> deactivate the access key, generate new

### Step 11b - S3 service (src/services/s3.service.ts):
###   - one S3Client instance per process, region+creds from env
###   - buildS3Key(userId, originalName) -> "documents/<userId>/<uuid>-<originalName>"  (per-user folder + uuid prefix prevents collisions)
###   - uploadObject({ key, body, contentType }) -> PutObjectCommand (body is a Buffer from multer)
###   - deleteObject(key) -> DeleteObjectCommand (idempotent; deleting missing key is fine)
###   - getDownloadUrl(key, expiresIn=900) -> presigned GET URL via @aws-sdk/s3-request-presigner (15min default)
###   - requireBucket() throws clear error if AWS_S3_BUCKET missing instead of obscure SDK error
###   - presigned URL pattern: bucket stays PRIVATE; backend hands client a time-limited URL; client downloads directly from S3 (no backend bandwidth, leaked URL has bounded blast radius)

..............................error
###   - TS error: "Type 'undefined' is not assignable to type 'AwsCredentialIdentity ...'" with exactOptionalPropertyTypes:true
###   - simplest fix: don't pass `credentials` to S3Client at all - AWS SDK's default credential chain reads AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY straight from process.env (dotenv puts them there). Standard AWS pattern.

### Step 11c - multer upload middleware (src/middlewares/upload.middleware.ts):
###   - memory storage: file lands at req.file.buffer (RAM) - hand straight to S3 SDK, no temp files to clean up. OK because spec caps at 10MB.
###   - file size limit: 10MB per spec (LIMIT_FILE_SIZE -> wrapped as PayloadTooLargeError 413)
###   - MIME whitelist (per spec): application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document, text/plain, image/png, image/jpeg
###       rejected types -> UnsupportedMediaTypeError 415 thrown from fileFilter
###   - missing "file" field -> BadRequestError 400
###   - wrapper around multer.single("file") translates multer's own errors into our AppError types so the global handler returns proper HTTP statuses (else multer errors hit "unexpected" 500 branch)
###   - usage: router.post("/upload", requireAuth, uploadSingle, validate(metaSchema), controller.upload)

### Step 11d - documents validation (src/api/documents/documents.validation.ts):
###   - 3 schemas:
###       uploadDocumentSchema    -> metadata fields on POST /api/documents/upload (file is in req.file separately)
###           name:        optional (defaults to original filename if missing), trim, 1-255
###           description: optional, trim, max 2000
###           categoryId:  optional
###       updateDocumentSchema    -> PUT body. all fields optional (PATCH-style "only update what's sent")
###           all fields just .optional() - simpler, no PATCH-with-explicit-null-clear gymnastics
###           rationale: spec doesn't require "uncategorize" as a feature; user can just re-assign to a different category. add a dedicated endpoint later if actually needed.
###       listDocumentsQuerySchema -> GET query params
###           page (coerce, default 1), limit (coerce, max 100, default 20), categoryId?, search? (min 1, trim)
###           coerce because query strings always come in as strings
###   - validate middleware only handles req.body; controller will parse req.query manually for the list endpoint
###   - z.infer at bottom -> UploadDocumentInput, UpdateDocumentInput, ListDocumentsQuery (single source of truth)

### Step 11e - documents service (src/api/documents/documents.service.ts) + types file:
###   - 5 operations: create, list, getById, update, remove
###   - OWNERSHIP via DB query: prisma.document.findFirst({ where: { id, userId } }) -> 404 for both "missing" and "wrong owner" (no existence leak)
###   - cache keys include userId:
###       single: doc:<userId>:<id>          (10min TTL per spec)
###       list:   docs:<userId>:<page>:<limit>:<categoryId?>:<search?>   (5min TTL per spec)
###       -> ownership is implicit in the key; per-user invalidation via delPattern("docs:<userId>:*")
###   - cache stores DB metadata ONLY; downloadUrl is generated fresh every response (presigned URLs expire in 15min, can't safely cache)
###   - withDownloadUrl helper: try presigned URL gen -> on error log warn + return null -> list/get still work even when S3 isn't configured
###   - create order: S3 upload FIRST -> DB row SECOND
###       S3 fails: throw 502 STORAGE_UPLOAD_FAILED, no DB pollution
###       DB fails after S3 success: best-effort s3.deleteObject cleanup, then re-throw
###   - delete order: DB FIRST -> S3 SECOND (best effort)
###       DB fails: user sees doc still there, retries (no S3 damage)
###       S3 fails: user sees doc gone (correct UX), file orphaned (logged for cleanup job)
###   - update: conditional spread for PATCH semantics (only fields user sent get updated)
###   - list: where clause spreads conditional categoryId + name contains search (case-insensitive); orderBy createdAt desc; uses Promise.all for findMany + count
###   - documents.types.ts: DocumentRecord, DocumentResponse, ListDocumentsResponse - explicit types (no Prisma type imports - same approach as SafeUser)

### spec-aligned response shapes:
###   - POST /api/documents/upload: spec says "Return document ID and S3 URL" -> returns { id, s3Url } (CreateDocumentResponse type)
###   - GET /api/documents/:id     : spec says "Return document metadata and S3 URL" -> full metadata + s3Url (DocumentResponse type)
###   - DocumentResponse OMITS internal fields: s3Key (internal) and the static s3Url DB column
###   - the s3Url field in responses is the PRESIGNED URL (the actually-usable one for our private bucket); the DB column of the same name is just an informational static reference
###   - helper renamed: withDownloadUrl -> toDocumentResponse  (more accurate name; explicit field-by-field mapping)
###   - getDownloadUrlSafe(s3Key) extracted as separate helper - returns null instead of throwing if S3 isn't configured. The `Safe` suffix is a JS/TS idiom signaling "won't throw". Reused by toDocumentResponse and create's minimal response.

### refactor: deleteFromS3Quietly(s3Key) helper for best-effort S3 cleanup
###   - same noisy 5-line try/catch was duplicated in create (orphan rollback) and remove (post-delete sweep)
###   - now: one helper that logs warn on failure but never throws. Each call site is one line.
###   - why we even cleanup: if S3 succeeds but DB insert fails, file is "orphaned" - sits in S3 forever. Cleanup deletes it before re-throwing.
###   - why 3 (now 2) try/catch in create instead of one big one: each handles a different failure with different recovery
###       try1 around s3.uploadObject -> AWS error -> 502 STORAGE_UPLOAD_FAILED
###       try2 around prisma.document.create -> DB error -> clean up orphan via deleteFromS3, then re-throw

### Step 11g - wired /api/documents into app.ts + end-to-end test:
###   - app.ts: imported documentsRouter + requireAuth; mounted with `app.use("/api/documents", requireAuth, documentsRouter)`
###   - all 5 doc routes are gated by requireAuth at the mount; if no Authorization header -> 401 before even hitting the router
###   - tested via PowerShell Invoke-RestMethod (PS 7+ has -Form for multipart; PS 5 falls back to curl.exe --form which has no JSON quote issues):
###       login first -> $session.accessToken -> reused as Bearer for all doc requests
###       POST /api/documents/upload (multipart: file + name + description) -> 201 { id, s3Url }
###       GET /api/documents -> 200 paginated list
###       GET /api/documents?page=&limit=&categoryId=&search= -> filters work
###       GET /api/documents/:id -> 200 full metadata + presigned s3Url
###       PUT /api/documents/:id -> 200 updated doc
###       DELETE /api/documents/:id -> 204
###       no-token request -> 401 UNAUTHORIZED
###       wrong-owner request -> 404 (not 403, to avoid leaking existence)
###   - sanity check: row in pgAdmin documents table, key in memurai-cli (doc:userId:id), file in S3 console (documents/<userId>/...)
###   - if AWS keys not yet filled in .env -> upload returns 502 STORAGE_UPLOAD_FAILED (everything else still works on existing docs)

### Step 12 prelude - JWT revocation blocklist (Redis sessions per spec):
###   - WHY: spec asks for "Store active user sessions in Redis" + "Session expiry handling". Pure JWT is stateless (no revocation). Compromise: store REVOKED tokens (jti) in Redis with TTL = remaining validity. Logout becomes meaningful; sessions auto-expire via Redis TTL.
###   - changes across 7 files:
###       utils/jwt.ts: added jti claim (randomUUID per token); added jti to JwtPayload interface
###       api/auth/auth.blocklist.ts (NEW): revoke(jti, ttl) + isRevoked(jti). Both swallow Redis errors; isRevoked fails OPEN (returns false on Redis down) so API stays usable
###       middlewares/auth.middleware.ts: now async, checks isRevoked after verifyAccessToken; req.user expanded to include jti + exp
###       api/auth/auth.validation.ts: added logoutSchema { refreshToken?: string }; ALSO migrated z.string().email() -> z.email() (Zod 4 deprecated the chained form)
###       api/auth/auth.service.ts: added logout(accessJti, accessExp, refreshToken?) - revokes access AND optionally refresh; refresh() now also blocklist-checks the refresh token's jti
###       api/auth/auth.controller.ts: added logout handler (uses req.user.jti + req.user.exp from middleware)
###       api/auth/auth.routes.ts: POST /logout (requireAuth -> validate(logoutSchema) -> handler) -> 204
###   - Redis keys: revoked:<jti> = "1" with TTL until natural token expiry. Self-cleaning - no cleanup job needed.
###   - covers spec items: SET ✅ EXISTS ✅ (via redis.exists in isRevoked) SETEX ✅ DEL ✅ (auto via TTL) sessions in Redis ✅ session expiry ✅
###   - tracking online users: pending Step 13 (Socket.io connect/disconnect)

### troubleshooting (things hit during end-to-end testing):
###   - AWS_REGION gotcha: must be the CODE (e.g. "ap-northeast-1"), not the descriptive label from the AWS console UI ("Asia Pacific (Tokyo) ap-northeast-1") - the SDK builds endpoint hostnames from this string. Region codes are like ap-south-1, us-east-1, eu-central-1, etc.
###   - PowerShell + presigned URL: terminal wraps long URLs across lines; copy-paste from terminal grabs only the first line and S3 returns "AuthorizationQueryParametersError" because X-Amz-* params are missing
###       fix: use `Start-Process $uploaded.s3Url` (opens directly in browser), or `$uploaded.s3Url | Set-Clipboard` (clean clipboard copy), or `$uploaded.s3Url | Out-File url.txt; notepad url.txt`
###   - bug fixed: documents.controller.ts had infinite recursion in getDocumentId helper (id = getDocumentId(req) called itself instead of req.params.id) - rename slip during refactor
###   - "Invalid token" 401 = expired/malformed/revoked (deliberately generic to avoid leaking which to attackers). Access tokens last 15 min. Recover via login again, or via /api/auth/refresh with the refresh token (7d).


# ─────────────────────────────────────────────────────────────────────
# TESTING INSTRUCTIONS (PowerShell — user environment)
# ─────────────────────────────────────────────────────────────────────

## Prereqs
- Server running: cd backend; npm run dev   (server on http://localhost:4000)
- Postgres service running, dms database created (Prisma migrate dev did this)
- Memurai (Redis) service running on port 6379
- AWS S3 bucket configured + .env filled in (only needed for upload/delete tests)

## 1. Health & readiness
Invoke-RestMethod -Uri http://localhost:4000/health     # 200 always
Invoke-RestMethod -Uri http://localhost:4000/ready      # 200 with db.ok and redis.ok
# stop a dep (Stop-Service Memurai) -> /ready returns 503 with that check ok:false

## 2. Authentication
# Register
$reg = @{ email = "alice@example.com"; password = "hunter2hunter2"; name = "Alice" } | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:4000/api/auth/register -Method POST -ContentType "application/json" -Body $reg
# expected: 201 { user, accessToken, refreshToken }
# duplicate email -> 409 CONFLICT
# bad shape (short pw, invalid email) -> 400 BAD_REQUEST + zod field errors

# Login (capture session for later tests)
$loginBody = @{ email = "alice@example.com"; password = "hunter2hunter2" } | ConvertTo-Json
$session = Invoke-RestMethod -Uri http://localhost:4000/api/auth/login -Method POST -ContentType "application/json" -Body $loginBody
$auth = @{ Authorization = "Bearer $($session.accessToken)" }
# wrong password -> 401 "Invalid credentials"
# non-existent email -> SAME 401 (no enumeration)

# Refresh
$rb = @{ refreshToken = $session.refreshToken } | ConvertTo-Json
$session = Invoke-RestMethod -Uri http://localhost:4000/api/auth/refresh -Method POST -ContentType "application/json" -Body $rb
$auth = @{ Authorization = "Bearer $($session.accessToken)" }
# expected: 200 with new tokens

# Logout (revoke both tokens)
$lb = @{ refreshToken = $session.refreshToken } | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:4000/api/auth/logout -Method POST -ContentType "application/json" -Body $lb -Headers $auth
# expected: 204
# retry with same access token -> 401 "Token revoked"
# retry refresh -> 401 "Invalid token"
# memurai-cli keys "revoked:*"   -> 2 entries with TTL

## 3. Documents — single file upload
# (login first to refresh $auth)
# PS 5.1: use curl.exe --form (Invoke-RestMethod -Form needs PS 7+)
$uploaded = curl.exe -s -X POST http://localhost:4000/api/documents/upload `
  -H "Authorization: Bearer $($session.accessToken)" `
  --form "file=@C:\path\to\test.pdf" `
  --form "name=Q4 Report" `
  --form "description=test upload" | ConvertFrom-Json
$docId = $uploaded.id
# expected: { id, s3Url }
# verify file: AWS console -> bucket -> documents/<userId>/  +  pgAdmin documents table  +  memurai-cli keys "doc:*"
# wrong file type (.zip) -> 415 UNSUPPORTED_MEDIA_TYPE
# >10MB file -> 413 PAYLOAD_TOO_LARGE
# no token -> 401 UNAUTHORIZED

# Open the presigned URL (terminal truncation = use one of these, not copy-paste)
Start-Process $uploaded.s3Url   # opens default browser
# OR: $uploaded.s3Url | Set-Clipboard   # then Ctrl+V into browser

## 4. Documents — list / get / update / delete
# List
Invoke-RestMethod -Uri http://localhost:4000/api/documents -Headers $auth
# pagination: ?page=1&limit=10 ; filter: &categoryId=...; search: &search=report

# Get one
Invoke-RestMethod -Uri "http://localhost:4000/api/documents/$docId" -Headers $auth
# wrong owner -> 404 (NOT 403, deliberate to avoid leaking existence)

# Update
$ub = @{ name = "Renamed"; description = "updated" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:4000/api/documents/$docId" -Method PUT -ContentType "application/json" -Body $ub -Headers $auth

# Delete
Invoke-RestMethod -Uri "http://localhost:4000/api/documents/$docId" -Method DELETE -Headers $auth   # 204
# verify: AWS console -> file gone; memurai-cli keys "doc:*" -> entry gone

## 5. Redis caching
# Check cache hit on second GET (look at server log: first call queries DB, second is silent)
Invoke-RestMethod -Uri "http://localhost:4000/api/documents/$docId" -Headers $auth   # cold (DB)
Invoke-RestMethod -Uri "http://localhost:4000/api/documents/$docId" -Headers $auth   # warm (Redis)
# verify cache key exists: memurai-cli keys "doc:<userId>:$docId"
# inspect TTL: memurai-cli ttl doc:<userId>:<docId>   -> ≤ 600 sec
# invalidation: do a PUT, then memurai-cli get -> nil (cleared)

## 6. Graceful Redis fallback
# Stop-Service Memurai (admin PS) -> retry any GET /api/documents -> still works (hits DB)
# Server logs "redis error" warn but never crashes
# Start-Service Memurai when done

## Multi-client tests (Step 13 will add Socket.io tests)
# - register a second user (bob@example.com), login, try GET on alice's docId -> 404
# - try logout flow with two tokens for the same user (different sessions) -> each revocation independent

## 7. Categories
# List (returns { categories: [...] })
Invoke-RestMethod -Uri http://localhost:4000/api/categories -Headers $auth

# Create
$body = @{ name = "Finance"; color = "#3b82f6" } | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:4000/api/categories -Method POST -ContentType "application/json" -Body $body -Headers $auth
# duplicate name -> 409 ; bad color (not 6-digit hex) -> 400

# Cache: memurai-cli get cats:all -> JSON ; ttl cats:all -> ≤ 3600


### Step 12a - categories module:
###   - 5 files in src/api/categories/ (validation, types, service, controller, routes)
###   - GET /api/categories  -> { categories: [{id,name,color,createdAt}] }, cached 1h per spec at key "cats:all"
###   - POST /api/categories -> 201 with new category. Validates name (1-100) + color (strict 6-digit hex regex).
###   - duplicate name -> 409 ConflictError; cache.del(CACHE_KEY) on create to invalidate
###   - TODO (Step 13): emit "category:created" via Socket.io after create

### Step 12a (revised) - admin-only POST per spec:
###   - prisma schema: added enum UserRole { USER, ADMIN } and role UserRole @default(USER) on User model
###   - migration: npx prisma migrate dev --name add_user_role  (creates Postgres enum + adds column)
###   - JWT now carries role claim: utils/jwt.ts JwtPayload + SignInput include role
###   - issueTokens(user) passes user.role into the signed payload
###   - SafeUser type + toSafeUser helper extended with role field
###   - requireAuth middleware extracts payload.role into req.user; defaults to "USER" if claim missing (backward compat with pre-migration tokens)
###   - NEW requireAdmin middleware in same file: throws ForbiddenError(403) if req.user.role !== "ADMIN"
###   - categories.routes.ts: POST / now uses requireAdmin BEFORE validate
###   - to promote a user: npx prisma studio -> User table -> change role to ADMIN -> Save -> RE-LOGIN (old tokens have role: USER baked in)
###   - tested: admin login -> POST /categories -> 201. non-admin (bob) -> POST -> 403 FORBIDDEN. non-admin GET -> 200 (read open to everyone)

### refactor: extracted shared request helpers (rule of three)
###   - src/utils/request.ts: getUserId(req), getIdParam(req)
###   - was duplicated in documents.controller; now also used by notifications.controller -> extract
###   - documents.controller.ts updated: removed local getUserId/getDocumentId, imports from utils/request

### Step 12b - notifications module:
###   - 5 files in src/api/notifications/ (validation, types, service, controller, routes)
###   - GET /api/notifications              -> { items, total, unreadCount, page, limit }  (unreadCount for the badge -> saves a 2nd request)
###       query: ?page=&limit=&unreadOnly=true  (unreadOnly transforms "true" string -> boolean)
###   - PATCH /api/notifications/:id/read   -> mark single as read; ownership via where: { id, userId }
###   - PATCH /api/notifications/read-all   -> bulk update unread -> read for this user; returns { count }
###       defined BEFORE /:id/read in the router so "read-all" doesn't match as an :id
###   - service exports an INTERNAL create({ userId, type, title, message }) helper for documents/categories to call as side effects (12c)
###   - no caching: list is per-user and small; cache invalidation on every new notification would be more work than it's worth at this scale
###   - TODO (Step 13): emit "notification:new" via Socket.io when create() runs
###   - tested: list (empty), seed via Prisma Studio, list shows item with unreadCount, mark single -> read=true unreadCount drops, read-all bulk, wrong-owner mark -> 404

### Step 12c - hooked notifications into documents service:
###   - documents.service.ts now calls notifyUser(userId, type, title, message) after create / update / remove
###   - types match spec's Socket.io event names: "document:uploaded" / "document:updated" / "document:deleted"
###   - notifyUser is a fire-and-forget wrapper: try/catch swallows notifications.create errors and logs at warn level
###       rationale: a notifications-table hiccup must NOT fail an upload that already succeeded in S3 + main DB
###   - DB persistence done now; Socket.io broadcast still TODO Step 13 (so user sees the notification on next page load even before realtime is wired)
###   - tested: upload/update/delete each adds a row to notifications table; GET /api/notifications shows them in createdAt-desc with unreadCount

### Step 13a - Socket.io server setup (src/sockets/index.ts):
###   - attached to the same http.Server as Express (reason we used http.createServer in Step 7d)
###   - JWT auth middleware via io.use: token from socket.handshake.auth.token (preferred) or Authorization header
###       same verifyAccessToken + blocklist check as requireAuth -> connection rejected if expired/revoked/missing
###       socket.data.userId set after auth -> available in connection handler
###   - on connection: socket.join(`user:<userId>`) -> all of a user's tabs share one room
###   - online tracking via Redis SET online:<userId>:
###       SADD socketId on connect; if scard was 0 first -> emit user:online to everyone
###       SREM socketId on disconnect; if scard now 0 -> emit user:offline
###       handles multi-tab/multi-device correctly (online if AT LEAST ONE socket alive)
###   - clearStaleOnlineState() on init: redis.keys("online:*") + del to wipe stuck entries from previous runs (single-instance assumption)
###   - emitToUser(userId, event, payload) helper: io.to(`user:<userId>`).emit(...) — used by services to push real-time events to a user's tabs only
###   - getIO() exported for places that need the full IO instance
###   - server.ts wires it: initSocketIO(server) before server.listen
###   - test client: scripts/test-socket.js takes accessToken arg, listens for all spec events, useful for two-tab realtime test

### Step 13b - wired socket emits into services:
###   - documents.service.ts:
###       imports emitToUser from sockets
###       create(): build docResponse via toDocumentResponse(doc) ONCE, emitToUser("document:uploaded", docResponse), return { id, s3Url }
###       update(): emitToUser("document:updated", docResponse) before return
###       remove(): emitToUser("document:deleted", { id }) after cache invalidation
###   - notifications.service.ts: create() now persists DB row AND emits "notification:new" to user's tabs in one step
###   - room scoping: emitToUser sends to `user:<userId>` only - other users don't see events for someone else's docs
###   - tested via 2 node test-socket.js clients + curl uploads:
###       alice's socket receives: notification:new + document:uploaded after her own upload
###       bob's socket receives: nothing (different user, different room)
###       update/delete fire matching events; user:online/user:offline fire on connect/disconnect
###   - all spec events covered: document:uploaded, document:updated, document:deleted, notification:new, user:online, user:offline, connection:status

### audited service against spec line-by-line. All requirements covered EXCEPT:
###   - real-time Socket.io emits on create/update/delete -> deferred to Step 13 (the whole point of that step)
###   - left "TODO (Step 13)" markers in service.ts at the 3 emit points
### one fix applied: spec says "Cache document metadata in Redis" on POST /upload
###   - now: after DB create, cache.set(singleKey(userId, id), doc, SINGLE_TTL)  -> next /api/documents/:id read is a cache hit
###   - was: only invalidating the list cache (which is also still done)

### Step 11f - documents controller + routes:
###   - documents.controller.ts: 5 thin handlers (upload, list, getById, update, remove)
###       getUserId(req) helper - throws UnauthorizedError if req.user missing (defensive; requireAuth normally guarantees it)
###       list controller parses req.query inline via listDocumentsQuerySchema.safeParse - validate middleware only handles body
###       failed query parse -> BadRequestError with z.flattenError fieldErrors
###   - documents.routes.ts: Express Router with 5 routes (no requireAuth here - applied at mount time in app.ts)
###       POST   /upload   uploadSingle -> validate(uploadDocumentSchema) -> upload    (multer must run FIRST to parse multipart)
###       GET    /         list                                                          (200, paginated)
###       GET    /:id      getById                                                       (200)
###       PUT    /:id      validate(updateDocumentSchema) -> update                      (200, returns updated doc)
###       DELETE /:id      remove                                                        (204 no content)

