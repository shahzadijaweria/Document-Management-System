# Document Management System (DMS) — with Real-Time Features

A full-stack document management application with JWT authentication, AWS S3 file storage, Redis caching, and Socket.io real-time updates.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
  - [1. PostgreSQL](#1-postgresql)
  - [2. Redis (Memurai on Windows)](#2-redis-memurai-on-windows)
  - [3. AWS S3](#3-aws-s3)
  - [4. Backend](#4-backend)
  - [5. Frontend](#5-frontend)
- [Environment Variables](#environment-variables)
- [Running the Application](#running-the-application)
- [API Endpoints](#api-endpoints)
- [Socket.io Events](#socketio-events)
- [Testing Instructions](#testing-instructions)
- [Troubleshooting](#troubleshooting)

---

## Overview

The DMS lets authenticated users upload, organise, and manage documents stored in AWS S3, with categorised metadata persisted in PostgreSQL. Frequently-accessed data is cached in Redis with TTL-based invalidation, and any change (upload / update / delete) is broadcast in real time over Socket.io to the user's other tabs and devices.

**Key features**

- Email/password authentication with **JWT access + refresh tokens** and a **Redis-backed revocation blocklist** (real logout)
- Role-based authorisation (`USER` / `ADMIN`) with admin-only category creation
- Document upload to **AWS S3** (10 MB cap, MIME-whitelisted) with presigned URLs for time-limited downloads
- **Redis caching** for documents, lists, categories and the JWT blocklist (with graceful DB fallback when Redis is down)
- **Real-time** UI: documents appear / update / disappear without refresh; notification bell with live badge; cross-tab read sync
- Per-user Socket.io rooms with online/offline tracking
- Modern, responsive UI built with **Next.js 16 (App Router) + Tailwind v4**

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node v24 · Express 5 · TypeScript 6 · Prisma 7 (Postgres adapter) · ioredis · @aws-sdk/client-s3 · socket.io · zod · winston |
| Frontend | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · axios · socket.io-client · react-hook-form + zod · react-hot-toast · date-fns |
| Database | PostgreSQL 14+ |
| Cache / Sessions | Redis (Memurai on Windows) |
| File Storage | AWS S3 (private bucket, presigned URLs) |

## Project Structure

```
DMS/
├── backend/              Express + TypeScript API
│   ├── prisma/           Schema + migrations
│   ├── src/
│   │   ├── api/          Feature modules (auth, documents, categories, notifications)
│   │   ├── config/       env loader (zod-validated)
│   │   ├── db/           Prisma client + Redis client
│   │   ├── middlewares/  requireAuth, requireAdmin, validate, multer upload
│   │   ├── services/     Cross-cutting services (s3.service)
│   │   ├── sockets/      Socket.io bootstrap + emit helpers
│   │   ├── utils/        errors, jwt, password, cache, logger, request
│   │   ├── app.ts        Express app + middleware stack
│   │   └── server.ts     HTTP server + graceful shutdown
│   └── Readme.md         Detailed engineering log
│
├── frontend/             Next.js 16 web app
│   ├── app/              App Router pages (login, register, dashboard)
│   ├── components/       Header, UploadZone, DocumentList,     EditDocumentModal, NotificationBell
│   ├── contexts/         AuthProvider
│   ├── lib/              api (axios), auth (localStorage), socket (singleton)
│   └── README.md         Detailed engineering log
│
└── README.md             ← you are here
```

---

## Prerequisites

- **Node.js** 20.9 or later (LTS) and `npm`
- **PostgreSQL** 14+ with a user that can create databases — *OR* Docker
- **Memurai Developer Edition** (Windows) — or Redis 6+ on Linux/macOS — *OR* Docker
- **An AWS account** with permissions to create an S3 bucket and an IAM user
- **Git Bash** or **PowerShell** (commands below assume PowerShell on Windows)

> **Want the fastest setup?** Skip the native Postgres/Redis installs entirely and use [Docker](#docker-quick-start) — one command brings up the whole stack.

---

## Docker quick-start

If you have Docker Desktop installed, you can skip the manual Postgres/Memurai/backend/frontend setup. From the project root:

1. Copy the env template and fill in your AWS keys + JWT secrets:
   ```powershell
   copy .env.docker.example .env
   ```
   Edit `.env` (root). Postgres and Redis are containerised — you only need to provide the AWS + JWT values.
2. Build and start everything:
   ```powershell
   docker-compose up --build
   ```
   First run takes a couple of minutes (downloads images + builds backend/frontend). Subsequent runs are fast.
3. Visit <http://localhost:3000>.

What you get:
- `dms-postgres` on `5432` (data persisted in a Docker volume named `postgres_data`)
- `dms-redis` on `6379` (volume `redis_data`)
- `dms-backend` on `4000` (runs `prisma migrate deploy` automatically on each boot)
- `dms-frontend` on `3000` (Next.js `output: standalone` build — small image, fast cold start)

Stop everything: `docker-compose down`. Wipe data: `docker-compose down -v`.

> The Dockerfiles are also production-ready — same images can deploy to Fly.io, Railway, Render (Docker mode), DigitalOcean App Platform, or any container host.

If you'd rather run everything natively (no Docker), follow the per-service setup steps below.

---

## Setup

### 1. PostgreSQL

1. Install PostgreSQL — pgAdmin is bundled with the standard installer.
2. During install, set a password for the `postgres` superuser. Remember it.
3. The `dms` database itself does **not** need to be created manually — Prisma will create it on first migration.

> **Quick check** that Postgres is reachable:
> ```powershell
> pg_isready -h localhost -p 5432
> ```

### 2. Redis (Memurai on Windows)

1. Download **Memurai Developer Edition** from <https://www.memurai.com/get-memurai>.
2. Run the installer with default settings — it registers as an **auto-starting Windows service** on port `6379`.
3. Verify:
   ```powershell
   Get-Service Memurai      # should be Running
   memurai-cli ping         # should print "PONG"
   ```

> On macOS / Linux, install Redis 6+ instead. Same commands apply with `redis-cli`.

### 3. AWS S3

1. Sign in to the **AWS Console** → search for **S3** → **Create bucket**.
   - **Bucket name:** must be globally unique (e.g. `dms-yourname-127`)
   - **Region:** pick the one closest to you (e.g. `ap-south-1`)
   - **Block all public access:** keep all 4 boxes ✅ checked (we serve files via presigned URLs)
   - Defaults for everything else.
2. **Configure CORS** on the new bucket → Permissions tab → CORS → paste:
   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:3000"],
       "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3000
     }
   ]
   ```
3. **Create an IAM user** for the app (least-privilege):
   - IAM → **Users** → **Create user** (e.g. `dms-app`) → programmatic access only
   - Attach a custom inline policy (replace `your-bucket-name`):
     ```json
     {
       "Version": "2012-10-17",
       "Statement": [
         { "Effect": "Allow",
           "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
           "Resource": "arn:aws:s3:::your-bucket-name/*" },
         { "Effect": "Allow",
           "Action": ["s3:ListBucket"],
           "Resource": "arn:aws:s3:::your-bucket-name" }
       ]
     }
     ```
4. Generate **access keys** for the user (Security credentials → Create access key → "Application running outside AWS"). Copy both the **Access key ID** and **Secret access key** — the secret is only shown once.

### 4. Backend

```powershell
cd backend
npm install
copy .env.example .env
```

Edit `backend/.env` (see [Environment Variables](#environment-variables) below). At minimum, fill in:
- `DATABASE_URL` (your Postgres password)
- `JWT_SECRET` and `JWT_REFRESH_SECRET` — generate with:
  ```powershell
  node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
  ```
  Run twice to get two distinct values.
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`

Then create the database + tables and generate the typed Prisma client:
```powershell
npx prisma migrate dev --name init
npx prisma generate
```

> **Important:** Prisma 7's `prisma-client` generator does **not** auto-run during `migrate dev`. You must run `npx prisma generate` manually after every schema change.

### 5. Frontend

```powershell
cd ../frontend
npm install
```

Create `frontend/.env.local` (default values work if you ran the backend on port 4000):
```
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development` / `test` / `production` |
| `PORT` | no | `4000` | HTTP port the API listens on |
| `DATABASE_URL` | **yes** | — | Postgres connection string. Format: `postgresql://USER:PASSWORD@HOST:PORT/DBNAME?schema=public` |
| `JWT_SECRET` | **yes** | — | Access-token signing secret. Min 32 chars. |
| `JWT_EXPIRES_IN` | no | `15m` | Access-token lifetime (e.g. `15m`, `1h`) |
| `JWT_REFRESH_SECRET` | **yes** | — | Refresh-token signing secret. Min 32 chars. **Must differ from `JWT_SECRET`** |
| `JWT_REFRESH_EXPIRES_IN` | no | `7d` | Refresh-token lifetime |
| `AWS_REGION` | yes (for uploads) | `us-east-1` | AWS region code (e.g. `ap-south-1`). **Must be the code, not the descriptive name** |
| `AWS_ACCESS_KEY_ID` | yes (for uploads) | — | IAM user access key |
| `AWS_SECRET_ACCESS_KEY` | yes (for uploads) | — | IAM user secret |
| `AWS_S3_BUCKET` | yes (for uploads) | — | Your bucket name |
| `REDIS_HOST` | no | `localhost` | Redis hostname |
| `REDIS_PORT` | no | `6379` | Redis port |
| `REDIS_PASSWORD` | no | (empty) | Required only if Redis has auth enabled |
| `CORS_ORIGIN` | no | `http://localhost:3000` | Frontend origin allowed by CORS |
| `LOG_LEVEL` | no | `info` | `error` / `warn` / `info` / `http` / `verbose` / `debug` |

### Frontend (`frontend/.env.local`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | **yes** | — | Backend HTTP URL |
| `NEXT_PUBLIC_SOCKET_URL` | **yes** | — | Backend WebSocket URL (usually same host as API) |

> The `NEXT_PUBLIC_` prefix is required for Next.js to expose the variable to the browser bundle.

---

## Running the Application

### Two terminals

**Terminal 1 — backend** (port `4000`):
```powershell
cd backend
npm run dev
```
You should see:
```
... info  redis connected {"host":"localhost","port":6379}
... info  server listening {"port":4000,"env":"development","url":"http://localhost:4000"}
```

**Terminal 2 — frontend** (port `3000`):
```powershell
cd frontend
npm run dev
```

Open <http://localhost:3000>. The root path redirects to `/login`.

### Production build (when ready)

```powershell
# backend
npm run build && npm start

# frontend
npm run build && npm start
```

---

## API Endpoints

All authenticated endpoints expect `Authorization: Bearer <accessToken>`. All responses are JSON. Error shape:
```json
{ "error": { "code": "BAD_REQUEST", "message": "...", "details": { ... } } }
```

### Auth — `/api/auth`

| Method | Path | Body | Auth | Returns |
|---|---|---|---|---|
| POST | `/register` | `{ email, password, name }` | none | `201 { user, accessToken, refreshToken }` |
| POST | `/login` | `{ email, password }` | none | `200 { user, accessToken, refreshToken }` |
| POST | `/refresh` | `{ refreshToken }` | none | `200 { accessToken, refreshToken }` |
| POST | `/logout` | `{ refreshToken? }` | required | `204` (revokes both tokens via Redis blocklist) |

> Rate-limited to **30 requests / IP / 15 min** to throttle brute-force attempts.

### Documents — `/api/documents`

All require auth. Ownership is enforced via `userId` in the WHERE clause; trying to touch another user's document returns **404** (deliberate — does not leak existence).

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| POST | `/upload` | `multipart/form-data`: `file` (≤10MB), `name?`, `description?`, `categoryId?` | `201 { id, s3Url }` |
| GET | `/` | `?page=1&limit=20&search=&categoryId=` | `200 { items, total, page, limit }` |
| GET | `/:id` | — | `200 DocumentResponse` |
| PUT | `/:id` | `{ name?, description?, categoryId? }` | `200 DocumentResponse` (file is **not** editable) |
| DELETE | `/:id` | — | `204` |

> Allowed MIME types: PDF, DOC, DOCX, TXT, PNG, JPG, JPEG. Single-document GET cached **10 min**, lists cached **5 min**.

### Categories — `/api/categories`

All require auth.

| Method | Path | Body | Auth | Returns |
|---|---|---|---|---|
| GET | `/` | — | required | `200 { categories: [{id, name, color}] }` (cached 1h) |
| POST | `/` | `{ name, color }` (hex `#rrggbb`) | required + **admin** | `201 Category` |

> To promote a user to admin: `npx prisma studio` → `User` table → set `role` to `ADMIN` → save → user must log in fresh. Once logged in as admin, the dashboard shows a **Categories** panel (hidden for non-admins) where you can list and add categories without leaving the app.

### Notifications — `/api/notifications`

All require auth and are scoped to the calling user.

| Method | Path | Query / Body | Returns |
|---|---|---|---|
| GET | `/` | `?page=1&limit=20&unreadOnly=true` | `200 { items, total, unreadCount, page, limit }` |
| PATCH | `/:id/read` | — | `200 NotificationRecord` |
| PATCH | `/read-all` | — | `200 { count }` |

> Notifications are created server-side as side effects of document mutations. There is no public POST.

### Health

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness — process is alive (no deps checked) |
| GET | `/ready` | Readiness — pings DB and Redis. Returns 503 if either fails. |

---

## Socket.io Events

Connect from the client with the access token in the handshake:
```ts
const socket = io("http://localhost:4000", { auth: { token: accessToken } });
```

The server authenticates the JWT, joins the socket to `user:<userId>` room, and tracks online state in Redis.

### Server → Client

| Event | Payload | When |
|---|---|---|
| `connection:status` | `{ status: "connected", userId }` | On successful connect |
| `user:online` | `{ userId }` | Broadcast when a user's first socket connects |
| `user:offline` | `{ userId }` | Broadcast when a user's last socket disconnects |
| `document:uploaded` | `DocumentResponse` | After successful upload (to user's room) |
| `document:updated` | `DocumentResponse` | After successful update |
| `document:deleted` | `{ id }` | After successful delete |
| `notification:new` | `NotificationRecord` | Whenever a notification is created |
| `notification:read` | `{ id }` | After a notification is marked read (cross-tab sync) |
| `notifications:read-all` | `{}` | After "mark all as read" (cross-tab sync) |

### Client → Server

The client does not emit any custom events. All push direction is server → client.

---

## Testing Instructions

The frontend exercises the entire stack — for most things, just use the UI. For backend-only or quick API checks, the snippets below are PowerShell-ready.

> **PowerShell tip:** prefer `Invoke-RestMethod` for JSON requests. Bash-style `curl -d '{...}'` mangles inner quotes on Windows PowerShell. For multipart uploads, use `curl.exe --form` (each form field is a separate arg, no quoting issues).

### Test credentials

There is no seeded user — register one via the UI or this snippet:
```powershell
$body = @{ email = "alice@example.com"; password = "hunter2hunter2"; name = "Alice" } | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:4000/api/auth/register -Method POST -ContentType "application/json" -Body $body
```

To test admin-only category creation, promote the user via Prisma Studio (see Categories above).

### 1. Authentication

**UI:** click "Sign up" → fill form → land on `/dashboard`. Try wrong password on `/login` to see the red toast.

**API:**
```powershell
$body = @{ email = "alice@example.com"; password = "hunter2hunter2" } | ConvertTo-Json
$session = Invoke-RestMethod -Uri http://localhost:4000/api/auth/login -Method POST -ContentType "application/json" -Body $body
$auth = @{ Authorization = "Bearer $($session.accessToken)" }
```

What to verify:
- Wrong password → 401 `Invalid credentials`
- Non-existent email → **same** 401 (no enumeration leak)
- Empty body → 400 with field-level errors
- Refresh: `Invoke-RestMethod -Uri http://localhost:4000/api/auth/refresh -Method POST -ContentType "application/json" -Body (@{ refreshToken = $session.refreshToken } | ConvertTo-Json)` → new tokens
- Logout (revokes blocklisted): then reuse old access token → 401 `Token revoked`

### 2. File Upload

**UI:** drag a PDF onto the upload zone or click to browse → fill optional name/category → "Upload". Watch the progress bar.

**API (PowerShell):**
```powershell
$uploaded = curl.exe -s -X POST http://localhost:4000/api/documents/upload `
  -H "Authorization: Bearer $($session.accessToken)" `
  --form "file=@C:\path\to\test.pdf" `
  --form "name=Q4 Report" | ConvertFrom-Json
$docId = $uploaded.id
```

What to verify:
- Wrong file type (e.g. `.zip`) → 415 `UNSUPPORTED_MEDIA_TYPE`
- File >10MB → 413 `PAYLOAD_TOO_LARGE`
- Open `Start-Process $uploaded.s3Url` → file downloads (presigned URL works)
- File exists in S3 console under `documents/<userId>/`
- Row exists in pgAdmin / Prisma Studio
- Cached: `memurai-cli keys "doc:*"` shows the key

### 3. Document Management

**UI:** the dashboard is the test surface. Try search (debounced), category filter, pagination ("Showing 1-10 of N"), View / Edit / Delete row actions.

**API:**
```powershell
# List
Invoke-RestMethod -Uri "http://localhost:4000/api/documents?page=1&limit=10&search=q4" -Headers $auth

# Get one
Invoke-RestMethod -Uri "http://localhost:4000/api/documents/$docId" -Headers $auth

# Update
$body = @{ name = "Renamed" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:4000/api/documents/$docId" -Method PUT -ContentType "application/json" -Body $body -Headers $auth

# Delete
Invoke-RestMethod -Uri "http://localhost:4000/api/documents/$docId" -Method DELETE -Headers $auth
```

What to verify:
- Logging in as a second user and trying to GET another user's `docId` → 404 (not 403, by design)
- Delete also removes the file from S3

### 4. Redis Caching

**Verify cache hit on warm read:**
```powershell
# First call: cold (DB query in backend log)
Invoke-RestMethod -Uri "http://localhost:4000/api/documents/$docId" -Headers $auth
# Second call: warm (no DB query in backend log; served from Redis)
Invoke-RestMethod -Uri "http://localhost:4000/api/documents/$docId" -Headers $auth
```

**Inspect cached values directly:**
```powershell
memurai-cli keys "doc:*"                                   # cached single docs
memurai-cli keys "docs:*"                                  # cached lists
memurai-cli keys "cats:*"                                  # cached categories
memurai-cli keys "online:*"                                # online user socket sets
memurai-cli keys "revoked:*"                               # JWT blocklist
memurai-cli ttl  doc:<userId>:<docId>                      # remaining TTL in seconds
```

**Verify graceful fallback when Redis is down:**
1. Stop Memurai (admin PowerShell): `Stop-Service Memurai`
2. Hit any document/list endpoint — still works (falls through to Postgres). Backend log shows `redis error` warnings but no 5xx.
3. `GET /ready` returns **503** (correctly reflects degraded state, while `/health` stays 200).
4. Restart: `Start-Service Memurai`. `/ready` returns 200 again.

### 5. Socket.io Real-Time Features

**UI two-tab demo — same user:**
1. Open dashboard in two tabs as the same user. Both show **green "Online"** in the header.
2. Upload a file in Tab A. Tab B sees:
   - 🔔 toast pop-up
   - Bell badge increments
   - List refreshes (new doc appears at the top)
3. In Tab A, click an unread notification → Tab B's badge decrements (cross-tab read sync via socket).

**Cross-user isolation:**
1. Log in as Alice in Tab 1, Bob in Tab 2.
2. Upload as Alice → Bob sees **nothing** (per-user rooms).

**Connection state:**
1. Stop the backend (Ctrl+C). Within ~5s the green dot in both tabs turns gray ("Offline"). Browser console logs `[socket] disconnected: transport close`.
2. Restart backend → dots return to green automatically (auto-reconnect).

### 6. Testing with Multiple Clients

Open more than two tabs / browsers / devices on the same network. All connected clients of the same user join the same `user:<id>` room and receive the same events. The Redis SET `online:<userId>` tracks each socket — a user is "online" while at least one socket remains alive.

To inspect online state from the server:
```powershell
memurai-cli smembers online:<userId>     # list of active socket IDs
memurai-cli scard   online:<userId>      # count
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `error TS5107: 'moduleResolution=node10' is deprecated` | Stale tsconfig | Already fixed — uses `"node16"` |
| `ReferenceError: exports is not defined in ES module scope` | ts-node + Prisma 7 ESM/CJS mismatch | Already fixed — `npm run dev` uses `tsx` instead of `ts-node` |
| Backend `Region not accepted: "Asia Pacific (Tokyo) ap-northeast-1"` | `AWS_REGION` was set to the descriptive label, not the code | Use the **code** (e.g. `ap-northeast-1`), not the UI label |
| Backend boots but `/api/documents/upload` returns `502 STORAGE_UPLOAD_FAILED` | AWS credentials missing or wrong | Check the four `AWS_*` vars in `backend/.env`. Restart the server (nodemon picks up changes). |
| `prisma migrate dev` succeeded but TypeScript can't find new model fields | Prisma 7 doesn't auto-generate the client | Run `npx prisma generate` after every schema change. |
| Postgres `password authentication failed for user "postgres"` | `DATABASE_URL` password is wrong | Update the password in `backend/.env`. |
| `/ready` returns 503 with `redis: { ok: false }` | Memurai service stopped | `Start-Service Memurai` (in admin PowerShell). |
| Login form auto-redirects to `/dashboard` even with no creds | You're already authenticated; tokens are still in localStorage | In devtools console: `localStorage.clear()` then refresh. |
| Two toasts on own upload | Was a known bug, fixed | If you still see it, ensure `markOwnAction()` is called BEFORE the API request in the action component (UploadZone / EditModal / DocumentList delete handler). |
| `Header` stuck on "Offline" until refresh | Race in subscribing to socket "connect" event | Already fixed — `Header.tsx` subscribes BEFORE reading `socket.connected`. |
| Browser shows `AuthorizationQueryParametersError` opening a presigned URL | URL got truncated when copy-pasting from terminal | Use `Start-Process $uploaded.s3Url` or `$uploaded.s3Url \| Set-Clipboard` to avoid the copy. |
| `Invoke-RestMethod -Form` not recognised | PowerShell 5.1 doesn't have `-Form` (added in 7+) | Use `curl.exe --form` for multipart uploads on PS 5.1. |
| `JSON.parse SyntaxError: Expected property name` on backend during PowerShell test | PowerShell stripped the inner double-quotes in your JSON body | Switch to `Invoke-RestMethod` with `@{ ... } \| ConvertTo-Json`. Don't pass JSON to `curl.exe` from PowerShell. |
| `"Invalid token"` on every authenticated request after sitting idle | Access token expired (15 min) | Frontend's axios interceptor refreshes automatically; on the API, send `/api/auth/refresh` with your refresh token, or just log in again. |

For deeper details on engineering decisions and the order they were made, see `backend/Readme.md` and `frontend/README.md` — they're the chronological build log.

---

**Author:** Shahzadi Jaweria.
**License:** MIT
