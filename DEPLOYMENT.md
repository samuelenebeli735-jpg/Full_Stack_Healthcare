# SHMS — Hosted Deployment and Operations

How the hosted SHMS (Student Health Management System) runs, how to change it
safely, and how to move it elsewhere. This file contains **no secrets**:
environment variables are listed by name only.

Last updated: 2026-10-11.

## 1. Architecture

```
Browser ──HTTPS──> Render Static Site  shms-web   https://shms-web.onrender.com
                     │  rewrite /api/*  ──>  https://shms-api.onrender.com/api/*
Mobile app ─HTTPS──> Render Web Service shms-api  https://shms-api.onrender.com/api/v1
                     │  Docker (shms-backend/Dockerfile), Node 22, Express 5, Prisma 6
                     └──TLS──> Neon PostgreSQL 18  project "shms-production" (AWS Frankfurt)
```

| Piece | Provider / plan | Source in repo | Notes |
|---|---|---|---|
| API | Render Free web service, Frankfurt, Docker | `shms-backend/` (root dir), `./Dockerfile` | Auto-deploys from `master` on GitHub |
| Web | Render Static Site (free) | `shms-frontend/shms/` (publish dir `.`, no build) | One rewrite rule: `/api/*` → `https://shms-api.onrender.com/api/*` (action *Rewrite*) |
| Database | Neon Free, PostgreSQL 18, AWS Frankfurt | `shms-backend/prisma/migrations/` | Compute capped at 0.25 CU |
| Mobile | Expo EAS build, profile `production-apk` | `shms-mobile/eas.json` | API URL baked in at build time |

The web frontend calls `/api/v1` on its own origin (`js/config.js`), so the
rewrite makes every API call same-origin: no frontend code knows the API host.

## 2. Database roles (do not change)

| Role | Used by | Properties |
|---|---|---|
| `neondb_owner` | Migrations and admin tasks, **from the operator's PC only** | Owns all objects; has BYPASSRLS (required: the SECURITY DEFINER login/reset lookups run as the owner) |
| `shms_app` | The running API | Created by migration `20260913235959`; **no superuser, no BYPASSRLS**, no role memberships. The API refuses to start in production if its role can bypass RLS |

Never put the owner credentials into Render.

## 3. API environment variables (Render → shms-api → Environment)

| Name | Value / purpose |
|---|---|
| `DATABASE_URL` | **Secret.** `shms_app` on the Neon **direct** host (not `-pooler`), with `sslmode=require&connect_timeout=15`. No `channel_binding` (the tested configuration). |
| `JWT_SECRET` | **Secret.** ≥ 32 random characters (128 hex chars in use). Rotating it signs everybody out. |
| `NODE_ENV` | `production` (enables the startup guards) |
| `TZ` | `Africa/Lagos` — clinic wall-clock time; scheduling depends on it |
| `JWT_EXPIRES_IN` | `24h` |
| `FRONTEND_URL` | `https://shms-web.onrender.com` (used in password-reset links) |
| `CORS_ORIGINS` | `https://shms-web.onrender.com` |
| `TRUST_PROXY` | Private hops **plus Cloudflare's published ranges** (exact value in §9). Do **not** use `true`. |
| `EMAIL_WEBHOOK_URL` | Not set: password reset by email is unavailable until an HTTP email endpoint is configured (Render blocks SMTP ports) |
| `PORT`, `HOST` | Do not set: Render supplies `PORT`; the Dockerfile sets `HOST=0.0.0.0` |

Health check path: `/api/v1/health` (checks the database too).

The operator keeps the secret values outside the repository, in
`%USERPROFILE%\.shms-secrets\` on the operator's PC (owner URL, `shms_app`
password and URL, `render-api.env`). Never commit or paste them into chat.

`connect_timeout=15` matters: Neon suspends compute after 5 idle minutes and
Prisma's default 5 s connect timeout can expire while it resumes. The API's
startup role check then exits the process (P1001 "Can't reach database
server"). Keep the parameter when editing the URL; set query parameters with a
URL parser rather than string concatenation so none are duplicated.

## 4. Redeploying

* **API / web code:** push to `master`. Render rebuilds both services
  automatically (Render → service → *Events* shows progress). *Manual Deploy →
  Deploy latest commit* forces a rebuild.
* **Environment change:** edit in Render → shms-api → Environment → *Save,
  rebuild and deploy*.
* **Rollback:** Render → service → *Deploys* → *Rollback* (free plan: the two
  most recent previous deploys only).
* The Docker image does **not** run migrations; schema changes are a separate,
  deliberate step (§5).

## 5. Database migrations

Run from the operator's PC, against the owner connection, **before** deploying
code that needs the new schema:

```powershell
cd C:\Users\samue\Desktop\TO\shms-backend
$env:DATABASE_URL = "<owner URL: direct host, sslmode=require, connect_timeout=15>"   # never commit/echo
npx prisma migrate status      # what is pending
npx prisma migrate deploy      # apply
Remove-Item Env:DATABASE_URL
```

Rules:
* Migrations are append-only. Never edit a migration that has been applied.
* Write new migrations so they also work on a fresh database (no out-of-band
  grants). Grants for the runtime role belong in migrations.
* Never use `prisma migrate dev`, `db push` or `migrate reset` against
  production.
* After a migration, re-check: `shms_app` still has `rolsuper = f` and
  `rolbypassrls = f`; RLS enabled **and forced** on the 17 tenant tables.

The first organization and administrator were created with the bootstrap CLI
(`npm run bootstrap`, see `shms-backend/README.md`); it refuses to run again on
an initialized database (exit code 4).

## 6. Backup and restore

The Neon Free plan keeps only a short restore window (6 hours of history) and
one manual snapshot, so take regular logical backups yourself.

**Backup** (PostgreSQL 18 client tools, e.g. `C:\Program Files\PostgreSQL\18\bin`):

```powershell
$env:PGDUMP_URL = "<owner URL>"
& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" --format=custom --file "D:\shms-backups\shms-$(Get-Date -Format yyyyMMdd-HHmm).dump" $env:PGDUMP_URL
Remove-Item Env:PGDUMP_URL
```

Dumps contain patient data: store them encrypted/offline, never in the
repository or a public location. `pg_dump` must be the same or a newer major
version than the server (18).

**Restore onto a new PostgreSQL host** (another Neon project, a VPS, etc.):

1. On the target, connect as an owner/superuser role that has BYPASSRLS and
   create the runtime role first (roles are not inside a dump):
   `CREATE ROLE shms_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '<new secret>';`
2. Restore into an empty database:
   `pg_restore --no-owner --dbname "<target owner URL>" shms-YYYYMMDD-HHMM.dump`
   (`--no-owner` makes the restoring role own the objects; it must have
   BYPASSRLS so the SECURITY DEFINER lookups keep working.)
3. Verify: `prisma migrate status` reports up to date; the role/RLS checks in §5.
4. Point `DATABASE_URL` (as `shms_app`) at the new host and redeploy.

Practise a restore into a scratch database before you need it.

## 7. Free-tier limits and what to watch

| Service | Limit | What happens |
|---|---|---|
| Render web service | Sleeps after 15 min without traffic; ~1 min to wake | First request after idle is slow (web and mobile). Expected. |
| Render workspace | 750 instance-hours, **5 GB bandwidth**, 500 build minutes per month | Bandwidth overage without a card suspends services until next month. Watch *Billing → Monthly Included Usage*. |
| Render free | No persistent disk, restarts at any time, no SLA | Nothing is stored on the container; all state is in Neon. |
| Neon project | 1 GB storage | Writes are blocked above it (no data deleted). |
| Neon compute | 100 CU-hours/month (≈ 400 active hours at 0.25 CU); scale-to-zero after 5 min | Exhausting it suspends the database until next month. Keep the 0.25 CU cap; do not add keep-alive pingers. |
| Neon history | 6-hour restore window, 1 snapshot | Hence the pg_dump routine in §6. |

Do not upgrade any plan or add a payment method without a deliberate decision.

## 8. Mobile app

`shms-mobile/eas.json` profiles:

* `test-apk` — local-network API over HTTP (cleartext allowed only here).
* `production-apk` — `EXPO_PUBLIC_API_URL=https://shms-api.onrender.com/api/v1`,
  cleartext disabled.

Build: `cd shms-mobile; npx eas-cli build --platform android --profile production-apk`.
Both profiles use the same package (`com.shms.mobile`), so installing one APK
replaces the other on a phone. If the API host changes, update the profile and
rebuild; the URL is compiled into the app.

## 9. Troubleshooting

| Symptom | Likely cause / action |
|---|---|
| First request takes ~1 min | Render free service waking. Retry; not an error. |
| API exits at start with `could not verify the database role` / P1001 | Database unreachable within the timeout (Neon waking or network). Check `connect_timeout=15` is in `DATABASE_URL`; Render restarts the service automatically. |
| API exits with `bypasses row-level security` | `DATABASE_URL` uses the owner role. Use `shms_app`. |
| Web pages load but every action fails / empty responses | The `/api/*` rewrite on shms-web is wrong. Destination must be `https://shms-api.onrender.com/api/*`, action *Rewrite*. |
| `/api/v1/health` on the web host returns an empty 200 | Stale CDN entry from before the rewrite was fixed; other API paths are unaffected. It expires on its own. |
| CORS error in the browser | `CORS_ORIGINS` must contain the exact web origin (scheme + host, no path). |
| "Password reset by email is not available" | Expected until `EMAIL_WEBHOOK_URL` is configured. |

**Client IP / `TRUST_PROXY`.** The API's access log (morgan `combined`) prints
`req.ip`, the address rate limiting is keyed on. With `TRUST_PROXY=1` the log
showed private Render addresses (`10.195.57.137`, `10.199.71.9`) for requests
from one public client (2026-10-11), i.e. Render forwards through more than one
internal hop and `1` stops at an internal proxy: all users then share a few
rate-limit buckets. With only `loopback,linklocal,uniquelocal` the log then showed Cloudflare edge
addresses (`172.68.x`, `172.70.x`): Render sits behind Cloudflare, whose edge is
public. Trust the private hops **and** Cloudflare's published ranges
(https://www.cloudflare.com/ips-v4 and /ips-v6, checked 2026-10-11):

```
loopback,linklocal,uniquelocal,173.245.48.0/20,103.21.244.0/22,103.22.200.0/22,103.31.4.0/22,141.101.64.0/18,108.162.192.0/18,190.93.240.0/20,188.114.96.0/20,197.234.240.0/22,198.41.128.0/17,162.158.0.0/15,104.16.0.0/13,104.24.0.0/14,172.64.0.0/13,131.0.72.0/22,2400:cb00::/32,2606:4700::/32,2803:f800::/32,2405:b500::/32,2405:8100::/32,2a06:98c0::/29,2c0f:f248::/32
```

Express then uses the right-most untrusted address, which is the client address
Cloudflare appended; a client cannot forge it. Re-check Cloudflare's lists if
they change. Verify after the redeploy: request
`/api/v1/health?trust_proxy_check=<marker>` and confirm the matching log line
starts with your public IP. If it shows a public Cloudflare/Render edge address
instead, the edge is not in a private range; report the `X-Forwarded-For`
layout before changing anything further.

## 10. Clinic setup before booking works

Students can only book when the organization has, in the admin pages:
departments/positions as needed, at least one **service**, **staff** with the
doctor role, and **schedules** for those doctors. With none of these, both web
and mobile show "no services" and nothing can be booked. A new production
organization (as created by the bootstrap) starts with none.

Render's health check polls `/api/v1/health` every 5 s while the API is up and
that endpoint queries the database, so Neon compute stays awake whenever the API
is awake. Point the health check at `/` (no database) if compute hours run low.

## 11. Moving to another provider later

Everything provider-specific is configuration:

1. Database: back up and restore as in §6 to any PostgreSQL ≥ 18 host that
   allows an owner role with BYPASSRLS plus a separate non-bypass `shms_app`.
2. API: run the same Docker image anywhere (`docker build shms-backend`), with
   the environment variables in §3 and a TLS reverse proxy in front
   (`TRUST_PROXY` = number of proxy hops).
3. Web: serve `shms-frontend/shms/` from any static host that can proxy `/api/*`
   to the API (or from the API host itself).
4. Mobile: change `EXPO_PUBLIC_API_URL` in `eas.json` and rebuild.
