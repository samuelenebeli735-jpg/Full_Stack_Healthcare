# SHMS5 — Production Readiness & Scaling Implementation Report

**Project:** SHMS (School Health Management System) — `shms-backend` + `shms-frontend`
**Scope of this report:** everything completed in this working session, from the initial status handoff through live RLS enforcement under the `shms_app` role and the 20k–50k user scale-prep work (distributed rate limiting/risk in Redis, retention, backups, deep health, deployment artifacts).
**Date:** 14 Sep 2026 · **Companion reports:** `SHMS4_RLS_IMPLEMENTATION_REPORT.md`, `SHMS_TIER3_AUTHORIZATION_REPORT.md`, `SHMS_MULTI_TENANT_HARDENING_REPORT.md`

---

## 0. Starting state (handoff)

- Tenant isolation had been implemented via PostgreSQL Row-Level Security (RLS):
  - `set_tenant_context()` + `SET LOCAL app.organization_id` / `app.bypass_rls` GUCs.
  - Per-tenant `WITH (FORCE ROW LEVEL SECURITY)` on `app.User`, `app.StudentProfile`, `app.Appointment`, `app.MedicalRecord`, etc. — fail-closed (deny-by-default, `new_registered_user`-based visibility).
  - All business queries run through `withTenant()` (transaction-scoped `SET LOCAL`, no leak to the pool).
  - `SECURITY DEFINER` helper functions for cross-tenant lookups (login email lookup, super-admin global scope).
  - Application role `shms_app` with `GRANT SELECT/INSERT/UPDATE/DELETE` on tenant tables — **no `BYPASSRLS`** on the app role.
- Commit `80c7619` had pushed the RLS implementation + `SHMS4_RLS_IMPLEMENTATION_REPORT.md` to `master`.
- Remaining at handoff: confirm live enforcement under `shms_app`, then answer a scale-up question (20k–50k users).

---

## 1. Live RLS verification under `shms_app` (this session)

| Step | Action | Result |
|---|---|---|
| 1a | Applied pending migration `20260914000001` (`npx prisma migrate deploy`, admin connection) | Applied — **21 migrations** total |
| 1b | Built a self-discovering role/org probe (reads orgs from the DB, inserts rows for each scenario with proper `createdAt`/`updatedAt`) | **27/27 PASS** (same-tenant visible, cross-tenant invisible, super-admin bypass, wrong-org write aborts, etc.) |
| 1c | Ran the Tier-3 authorization regression suite | **24/24 PASS** |
| 1d | Switched `.env` `DATABASE_URL` → `shms_app` so the live server actually enforces RLS | — |
| 1e | Restarted the backend as `shms_app` and re-ran Tier-3 | **Initially 28/28 FAIL — all logins "Your account has been deactivated"** |

### 1.1 Root cause of the login failure + fix

- The `SECURITY DEFINER` helper functions return **lowercase** output columns (`organizationid`, `isactive`, `firstname`, …).
- The repository mappers read camelCase (`user.isActive`) → always `undefined` → the login flow treated every user as deactivated.
- **Fix** (`src/repositories/user.repository.js`): case-tolerant reads in `toUserWithProfile`, `toUserRow`, and `findUserOrgHint` (e.g. `row.organizationId ?? row.organizationid`, `row.isActive ?? row.isactive`).
- A leftover test artifact: the probe's "restore" step had set `student1.isActive = false`. Repaired with an org-scoped `UPDATE` run as `shms_app` (bypass allows global reads; `WITH CHECK` still requires `app.organization_id =` row org).

### 1.2 Final live status

| Suite | Result |
|---|---|
| Tab-Role probes under live `shms_app` | **28/28 PASS** |
| Tier-3 authorization + RLS regression | **24/24 PASS** (HTTP 200, no 401s) |
| `SHMS4_RLS_IMPLEMENTATION_REPORT.md` | Updated: §4.3 live enforcement, §7 manual steps (migrations require an **admin/owner** connection — `shms_app` has no write on `_prisma_migrations`), §8 PASS live |

**Operational constraint learned:** migrations `prisma migrate deploy` must run with the DB owner/admin connection, never as `shms_app`.

---

## 2. Scale-up analysis: 20k–50k users (decisions taken)

Asked and answered with the user: the app is stateless (DB + Redis only), so horizontal scaling is the right model.

| Range | Decision |
|---|---|
| 20 → 1k | No changes needed |
| 1k – 5k | Backups on a schedule + basic monitoring |
| 5k – 20k | **#1 Redis-backed rate limiter + risk store** (shared window across instances) |
| 20k – 50k | **#2** Multi-instance (2–4) behind a load balancer · **#3** PgBouncer connection pooling · **#4** Audit/Notification retention job · **#5** Backups + deep health monitoring |

Notes for the range: JWT revocation is covered because authorization re-checks `user.isActive` per request; uniqueness indexes for login lookups already exist; RLS policies are not the bottleneck.

---

## 3. Implementation — distributed rate limiting & risk store (#1)

### New files

| File | Purpose |
|---|---|
| `src/config/redis.js` | Redis client singleton + `ensureRedis()`; `REDIS_URL` empty or unreachable → feature disabled, **in-memory fallback**, zero boot delay |
| `src/utils/rateLimitStore.js` | `RedisRateLimitStore` implementing the express-rate-limit **v8** custom-store contract |
| `src/utils/sessionStore.js` | Failure/session counters (`incr/count/clear/block/isBlocked`) in Redis, memory fallback |
| `src/authorization/risk.js` | **Rewritten to async** risk engine; thresholds preserved (15-min window, LOGIN_FAIL 10, AUTHZ_DENIAL 30, CROSS_ORG 30, SENSITIVE_MEDIUM 100, SENSITIVE_HIGH 500) |

### Modified

- `src/middleware/rateLimiter.middleware.js` — three limiters (`auth` 30/15m, `api` 200/15m, `reset` 5/1h), each with its **own** store instance and unique Redis prefix (`rl:auth:*`, `rl:api:*`, `rl:reset:*`); MemoryStore fallback when Redis is off.
- `src/middleware/role.middleware.js` — async + try/catch around `risk` calls.
- `src/middleware/policy.middleware.js` — async + try/catch (awaits `securityAudit`).
- `src/utils/tenantAccess.js` — risk recording is fire-and-forget (`.catch(() => {})`).
- `src/services/auth.service.js` — awaits `recordLoginFailure` / `recordLoginSuccess`.
- `src/config/env.js` + `.env.example` — `REDIS_URL`.

### Bugs found & fixed during live verification

| # | Bug | Cause | Fix |
|---|---|---|---|
| B1 | Limiter never tripped (no 429) | express-rate-limit **v8** store contract is `{ totalHits, resetTime }`, not `{ total, ... }` — the store returned `total`, v8 validated `undefined` hits | `rateLimitStore.js` returns `totalHits` |
| B2 | Server crashed at boot when Redis was configured | v8 does not allow sharing one store instance across limiters (`ERR_ERL_STORE_REUSE`) | one `RedisRateLimitStore` per limiter with a unique prefix |

---

## 4. Implementation — retention (#4), backups & monitoring (#5)

| File | What it does |
|---|---|
| `jobs/retention.js` | Deletes `AuditLog` + `Notification` rows older than N days (default 365), batched (500), super-admin global scope via `withTenant(null, { isSuperAdmin: true })`; `--days N --dry-run` flags |
| `jobs/backup.js` | `pg_dump -Fc` to `--dir`, prune with `--keep`; parses the connection string in-process, **never prints it**; graceful `PGDUMP_BIN`/missing-tool error; `--dry-run` |
| `src/app.js` | Added `GET /api/v1/health/deep` — returns `{ services: { database, redis } }`, 503 when DB degraded |
| `package.json` | Scripts `cluster`, `retention`, `backup` |
| `README.md` | New section "9. Operations & Scaling (20k–50k users)" |

### Bugs found & fixed

| # | Bug | Cause | Fix |
|---|---|---|---|
| B3 | `jobs/retention.js` would throw at runtime | `tx[name.toLowerCase()]` produced `tx.auditlog`/`tx.notification`; Prisma accessors are camelCase (`tx.auditLog`, `tx.notification`) | explicit model accessor in the table config |
| B4 | `pg_dump` as `shms_app` fails | RLS blocks `COPY` — "query would be affected by row-level security policy for table ..." | added `BACKUP_DATABASE_URL` override (`env.js`, `jobs/backup.js`, `.env.example`, README): backups (like migrations) must use an owner/`postgres` connection |

---

## 5. Implementation — deployment artifacts (#2 / #3)

| File | What it does |
|---|---|
| `ecosystem.config.cjs` | PM2 app config, `instances: "max"` cluster mode (Platform note: **Windows forces fork**; use multiple processes on Win or Linux for prod) |
| `deploy/pgbouncer/pgbouncer.ini` | PgBouncer config — listen `6432`, **transaction** pooling, targets host Postgres `127.0.0.1:5432`/`shms_db` |
| `deploy/pgbouncer/userlist.txt.example` | Scaffold for the `STAT` userlist (placeholder password only — replace for real use) |
| `Dockerfile` | Node 22 alpine, `npm ci --omit=dev`, `prisma generate` |
| `docker-compose.yml` | `redis:7-alpine` + `edoburu/pgbouncer` + `api`; requires `SHMS_APP_PASSWORD` and `JWT_SECRET` env; API gets `DATABASE_URL` via PgBouncer `:6432` and `REDIS_URL=redis://redis:6379`; healthchecks wired to `/health/deep` |

---

## 6. Verification evidence (this session)

All checks executed against the live server (node v24, backend PID restarted per test; Redis 8.10.1 run on port 6399 purely as a test vehicle, then shut down).

### 6.1 Redis-backed limiter

```
35× POST /api/v1/auth/login (wrong password)  →  30× HTTP 401 then 5× HTTP 429
Redis keys after the run:
  rl:auth::: /56 -> 35
  rl:api::: /56 -> 31
  rs:login:::1:student1@shms.test -> 30     (risk store recorded failures in Redis)
```

### 6.2 Deep health

```
GET /api/v1/health          → 200 {"status":"OK"}
GET /api/v1/health/deep     → 200 {"services":{"database":"up","redis":"up"}}
GET /api/v1/health/deep     → 200 {"services":{"database":"up","redis":"disabled"}}   (no REDIS_URL → fallback)
```

### 6.3 Auth + RLS smoke (with Redis on)

```
PASS login student1/student2/staff1/admin1/superadmin1  200
PASS verify student1/admin1/superadmin1                 200
PASS profiles/me student1, student2                     200
PASS medical-records/me student1 (own only)             200
PASS medical-records staff1 (org-scoped list)           200
PASS medical-records superadmin1 (global list)          200
PASS isolation staff-subset-of-super (org containment)  true
PASS bad jwt → 401   ·   anon → 401
14/16 (the 2 "FAIL" rows were an assertion-shape bug in the throwaway smoke script,
       corrected by the subset check → isolation PASS)
```

> Note: a smoke-script defect (logging in with the object key `"student1"` as the identifier instead of `student1@shms.test`) caused a batch of false 401s mid-verification; the server was not at fault. The inline/curl equivalents of the same request returned 200.

### 6.4 Jobs

```
node jobs/retention.js --days 365 --dry-run   →  AuditLog: wouldDelete=0 · Notification: wouldDelete=0 (dry-run)
node jobs/backup.js --dir <tmp> --keep 7 --dry-run → would run pg_dump -Fc → <file>.dump
node jobs/backup.js ...                         → graceful error when pg_dump missing from PATH
node jobs/backup.js ... with PGDUMP_BIN set, as shms_app → RLS COPY error (expected) → BACKUP_DATABASE_URL added
```

### 6.5 Syntax / startup

- `node --check` on all new/modified files: OK.
- Server boots with Redis configured and without it; HTTP behaviour identical apart from the `redis` health flag.

---

## 7. How to run / operate

```bash
# Normal single-instance dev (Redis optional)
node src/server.js                       # or: npm run dev

# Multi-instance
npm run cluster                        # PM2 (instances = CPU count; Windows → fork mode)

# Full stack (API + Redis + PgBouncer)
docker compose up -d                   # set SHMS_APP_PASSWORD + JWT_SECRET

# Ops
node jobs/retention.js --days 365 --dry-run   # preview
node jobs/backup.js --keep 7                  # real dump; needs PGDUMP_BIN or PATH + BACKUP_DATABASE_URL

# Health
GET /api/v1/health          # liveness
GET /api/v1/health/deep     # DB + Redis, 503 when degraded
```

Environment notes:
- `REDIS_URL` empty ⇒ in-memory fallback (single instance only). Set it to an actual Redis (≥ 6.x; node-redis requires `HELLO`/RESP3) to share limiter/risk state across instances.
- Migrations and backups need a **DB owner/admin** connection (migrations alter `_prisma_migrations`; `shms_app` is RLS-restricted and cannot `pg_dump`).
- Never print `DATABASE_URL`/`BACKUP_DATABASE_URL`/`JWT_SECRET`; the scripts redact them.

---

## 8. Commit / push status

- RLS + hardening docs: pushed as **`80c7619`**.
- This phase (Redis rate limiting/risk, health/deep, retention, backup, deploy artifacts, README/env docs, and this report): committed and pushed to `master` as part of this session (see git log for the latest commit hash).

---

## 9. Not done / blocked (explicitly)

| Item | Status |
|---|---|
| Full `docker compose` stack runtime test | Blocked in this environment — Docker Desktop VM fails to start; compose files are syntactically checked only |
| Redis-backed path against a real production Redis | Verified against a temporary Redis 8.10.1 (RESP3/HELLO-capable) server; the temp server was shut down after testing |
| Real (complete) backup dump | Blocked until `BACKUP_DATABASE_URL` is set to an owner/`postgres` connection by operations |
| Load / soak tests at 20k–50k | Out of scope here; recommendations in §2 are the design baseline |