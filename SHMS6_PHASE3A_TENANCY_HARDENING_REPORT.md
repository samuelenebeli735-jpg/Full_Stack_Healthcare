# SHMS6 — Phase 3A Tenancy Hardening: Implementation & Verification Report

**Date:** 2026-09-24
**Scope:** Audit item 4 (Tenancy Hardening). Verification-only + minimal targeted changes.
**Out of scope:** Phase 3B items (medical-record numbering, slot serialization, timezone handling, queue guards, audit immutability) remain separate tasks and were **not** touched.

---

## 1. Runtime PostgreSQL role (verified live)

Prepared by inspection (Phase 1) and confirmed at runtime (Phase 2/5) against the live database using the application's `.env` connection. The runtime `DATABASE_URL` authenticates as **`shms_app`**. Credentials are never reproduced in this report.

| Check | Result |
|---|---|
| `current_user == session_user` | `shms_app` |
| `rolsuper` | `false` |
| `rolbypassrls` | `false` |
| `rolcanlogin` | `true` |
| DML privileges (SELECT/INSERT/UPDATE/DELETE) | all 16 tenant tables **and** `Organization` |
| `_prisma_migrations` for `shms_app` | SELECT only (insert/update/delete revoked) |

The runtime role is already correct — non-superuser, no RLS bypass, with exactly the DML needed. **No configuration change was required.**

## 2. RLS and FORCE RLS (verified live)

All **16** tenancy-scoped tables have both `relrowsecurity = true` and `relforcerowsecurity = true`:

`User, Profile, MedicalRecord, Staff, Schedule, Department, Position, Service, Appointment, Queue, Consultation, Prescription, PrescriptionItem, AuditLog, Notification, NotificationPreference`

`Organization` is the tenant registry and intentionally has **no RLS** — an organization must be resolvable before any tenant context exists. This matches the design and was not changed.

## 3. SECURITY DEFINER function hardening (applied)

The four global pre-auth lookups were declared with `SET search_path = public`. They reference every relation with an explicit `public.` qualifier and use only built-ins (`now()`, `to_jsonb`, `COALESCE`), so their `search_path` is now pinned to `pg_catalog` (behavior-neutral, removes any public-schema shadowing during SECURITY DEFINER execution):

| Function | search_path (live) |
|---|---|
| `shms_auth_user(text)` | `pg_catalog` |
| `shms_user_by_reset_token(text)` | `pg_catalog` |
| `shms_user_org(text)` | `pg_catalog` |
| `shms_user_route(text)` | `pg_catalog` |
| `shms_row_visible(text)` | (plain, no SECURITY DEFINER, no config) |

All five functions have `EXECUTE` granted to `shms_app` and revoked from `PUBLIC` (verified live).

## 4. Seed / reset scripts — inspected vs. modified (Phase 3)

**Before:** both scripts built a bespoke `new PrismaClient({ datasources... })` and ran every query outside any tenant context — under RLS they would fail closed (or bypass GUC-based scoping).

**After (deployed and run live under RLS as `shms_app`):**

- Both scripts now import the shared `prisma` from `../src/config/db.js` and use the same tenant-context mechanism the application uses at runtime: `withTenant(org.id)`.
- `Organization` registry operations (no RLS) run on the bare client; **every** tenant-scoped operation (`Department`, `Position`, `User`, `Staff`, verification reads) runs inside `withTenant(org.id)`.
- Nested `tx.$transaction(...)` calls were flattened into the single `withTenant` transaction (Prisma does not support nesting a second interactive transaction, and a nested call would lose the GUC scope).
- **Reset behavior change (intended, documented):** the reset is now scoped to the Redeemer's University tenant (`withTenant(ORG_ID)`) instead of globally deleting rows across all organizations. It still hard-codes the target org/department/position ids, which were verified present at runtime.

**Verification result:** both scripts complete successfully against the live DB as `shms_app`, with the seed creating the expected test accounts (validated passwords, correct org/roles) and the reset restoring the canonical 8 Redeemer accounts (2 student, 2 staff, 2 admin, 2 super_admin).

## 5. Migrations — reproducibility on a fresh deployment (Phase 4)

Two new migrations were added (nothing already-applied was modified; applied history is unchanged):

**`20260913235959_ensure_shms_app_role/migration.sql`**
Placed before the RLS migration so a fresh deploy creates the runtime role before `20260914000000`'s `GRANT ... TO shms_app` and `ALTER DEFAULT PRIVILEGES ... TO shms_app` execute (both fail if the role is missing). The migration:
- creates `shms_app` **only if missing** — `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`; an existing role is never altered;
- raises the deployment prerequisite if the connection cannot create roles (`insufficient_privilege`).

**`20260916000000_harden_tenant_reproducibility/migration.sql`**
- Records the explicit DML grants on the 17 app tables that previously existed only out-of-band (so a fresh deploy is now reproducible); idempotent no-ops on existing DBs.
- Pins `search_path = pg_catalog` on the four SECURITY DEFINER functions (Section 3).
- No sequence grants needed: the schemas contain no sequences (text/CUID ids); `ALTER DEFAULT PRIVILEGES` from the RLS migration already covers future sequences.

**Status:** all **24/24** migrations applied (`prisma migrate deploy` run by the operator with an admin/owner connection per the SHMS4/5 protocol; `migrate status` is current). Verified from the live migration ledger.

**Remaining prerequisite (unchanged, operator-managed):** the runtime role's login password is set out-of-band (`ALTER ROLE shms_app WITH LOGIN PASSWORD ...`) — the migrations deliberately contain no secrets.

## 6. Security verification (44/44 PASS)

Run via `.tmp/loadtest/verify.mjs` against a live server (port 5111, `shms_app`) and the DB:

- **Fail-closed base state:** no-GUC read returns 0 rows; GUC does not leak after transactions.
- **Partition sums == global** for all 16 models across the 15 active organizations (every row attributable to exactly one tenant).
- **Tenant A ↔ B isolation (15 orgs, all pairs):** every org's probe user is invisible in every other org's context; cross-tenant `UPDATE` and `DELETE` affect **0** rows; probe rows remain intact after the attempts.
- **API isolation:** org-A staff requesting org-B `/departments` → **403**; same org → **200**; superadmin across orgs → **200**.

## 7. Regression suite (33/33 PASS)

API regression (`/api/v1`) on the same live server: health, registration validation negatives (400s, no rows created), all-role logins, auth hardening (401s), profiles / medical-records / departments / services / positions / staff / schedules / appointments / queues / prescriptions / consultations / dashboard / reports / audit, plus unknown-route 404.

**Server status-code distribution for the whole session (zero 5xx):**

| Status | Count |
|---|---|
| 200 | 39 |
| 400 | 4 |
| 401 | 3 |
| 403 | 8 |
| 404 | 1 |
| **5xx** | **0** |

## 8. Data safety — verified by before/after dataset diff

A per-organization × per-model snapshot (all 16 models, all 16 orgs, via `withSuperAdmin`) was captured immediately before and after the Phase 5 execution (seed + reset + regression + security verification).

**Diff result:** the only change is `redeemer-university.auditLog 0 → 8` — the login-audit rows written by the regression and security suites. Every other organization × model cell is identical. The seed's temporary `@shms.local` accounts were created and then removed by the scoped reset (net zero).

**Counts across the whole engagement:**

| Model | Audit-time baseline | Final (verified) |
|---|---|---|
| organizations | 15 | 15 (load-test orgs remain inert) |
| user | 30,013 | 20,009 |
| profile | 30,007 | 20,003 |
| staff | 2 | 2 |
| medicalRecord | 2 | 2 |
| appointment | 4 | 0 |
| queue | 2 | 0 |
| consultation | 0 | 0 |
| prescription | 0 | 0 |

The user/profile/appointment/queue reductions are the **intended, documented** effect of the scoped reset removing the Redeemer's University load-test fixtures at implementation start; no other organization was touched. The PRISMA regression `smoke.*@shms.test` register attempts were all rejected (400, pre-validated), so nothing additional was created.

## 9. Files modified (Phase 3A only)

| Change | Reason |
|---|---|
| `scripts/seed-test-accounts.js` | RLS-aware: shared `prisma` + `withTenant`; org ops bare, tenant ops scoped |
| `scripts/reset-test-accounts.mjs` | RLS-aware: shared `prisma` + `withTenant`; reset scoped to Redeemer tenant |
| `prisma/migrations/20260913235959_ensure_shms_app_role/migration.sql` (new) | Fresh-deploy role creation (guarded, non-mutating on existing) |
| `prisma/migrations/20260916000000_harden_tenant_reproducibility/migration.sql` (new) | Recorded DML grants + SECURITY DEFINER `search_path` hardening |

Ephemeral verification harnesses under git-ignored `.tmp/` (`phase3a-probe.mjs`, `probe-grants.mjs`, `phase5-snapshot.mjs`, before/after JSON, verify/regression logs) — used, no longer part of the codebase.

## 10. Notes (unchanged design properties / known items)

- A raw connection holding `shms_app` credentials can re-derive the super-admin view by setting both transaction-local GUCs (`app.organization_id=''`, `app.bypass_rls='true'`). This is the documented RLS-by-GUC design; in application code it sits behind `withSuperAdmin`, reachable only for the `super_admin` role. Not changed.
- The seed/reset scripts print test passwords in plaintext at completion (reported; credential-redesign is out of scope).
- No passwords, personal data, or connection secrets appear in this report or in any new file.

---

**Conclusion:** Phase 3A Tenancy Hardening is complete and verified — runtime role correct (`shms_app`, non-superuser, no bypass), RLS+FORCE active on all 16 tenant tables, security verification 44/44, regression 33/33, zero 5xx, and no unintended data changes. Fresh-deploy reproducibility for the role/grants/RLS is now recorded in migrations. No Phase 3B work was started.