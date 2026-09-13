# SHMS PostgreSQL Row-Level Security Implementation — Final Report

**Date:** 2026-09-14
**Scope:** Full RLS enablement for tenant isolation: code sweep to route every database operation through a transaction-local tenant context (`withTenant`), a migration enabling + forcing RLS on all 16 tenant tables with fail-closed policies, deliberate SECURITY DEFINER global lookups for pre-auth identity flows, and role-switched enforcement verification.

> **Status summary:** All 27 RLS enforcement probes PASS · Tier-3 authorization suite 28/28 PASS **under live RLS** · full-surface API regression 24/24 PASS · migration applied to `shms_db` · the app now runs as `shms_app` so RLS is enforced on every request (verified end-to-end); use a separate admin connection for `prisma migrate deploy` (§7).

---

## 1. What Was Implemented

### 1.1 Transaction-local tenant context (`src/utils/tenantContext.js`)
- `withTenant(organizationId, { isSuperAdmin }, fn)` provides the Prisma client (`tx`), first setting transaction-locally (`set_config(..., true)`):
  - `app.organization_id` — the acting tenant
  - `app.bypass_rls` = `'true'` only when `isSuperAdmin`
- **Fail closed:** a tenant-inside calling `withTenant()` with **no** `organizationId` and **not** a super-admin throws (no silent global scope). Super-admins may call with `null` for a deliberate global scope.
- **Fail closed at the data layer:** the RLS helper shares the same semantics — with `app.organization_id` empty/absent and bypass not set, every policy evaluates `false` and **zero rows are readable** (§3.2).
- Re-entrancy is supported: nested `withTenant` calls (e.g., an audit write inside a queue transaction) reuse the active transaction and fill in any organization/bypass setting not yet present in it. No nested DB transactions are ever opened.
- Context and `SET LOCAL ROLE` are strictly transaction-local and verified not to leak across pooled connections (probe checks §6).

### 1.2 Full application-code sweep
Every interactive `prisma.$transaction` block and every service data-access path was converted to run inside `withTenant`:
- **Read phase:** scoped with `withTenant(user.organizationId, { isSuperAdmin })` (userId-only services resolve the hint via `findUserOrgHint`).
- **Write phase:** scoped with `withTenant(recordOrg, { isSuperAdmin })`, where `recordOrg` is derived from the target row (e.g., `appointment.organizationId`, `consultation.queue.organizationId`), never from user input.
- The planned P2002 retry loop for unique-constraint races now wraps its own `withTenant` scope (`staff.service`, `queue.service`, `prescription.service`).
- Files swept: `auth.middleware.js`, `securityAudit.js`, `audit.service.js`, and the services `{queue, consultation, appointment, prescription, staff, notification, medical-record, profile, schedule, department, position, service, report, dashboard}.service.js`. `node --check` clean on all.
- All 13 interactive `prisma.$transaction` sites are converted; no `prisma.` usage remains in services (`server.js`/`config/db.js` only, `$disconnect`).
- Verified by grep: controllers never import repositories; no unwrapped repository call remains reachable — every service access is either `withTenant`-wrapped, a deliberate SECURITY DEFINER global lookup, or the (un-RLS'd) root `Organization` table.

### 1.3 Intentional global lookups (SECURITY DEFINER)
Login/reset must resolve identity across tenants *before* any tenant is known:
- `shms_auth_user(identifier)` — login lookup (email OR matric), returns the user + its real `organizationId`, `role`, and active flag.
- `shms_user_by_reset_token(token)` — password-reset lookup.
- `shms_user_org(userId)` — organization hint for app-side tenant resolution.
- All are `SECURITY DEFINER`, `REVOKE ... FROM PUBLIC`, `GRANT EXECUTE ... TO shms_app` only. They are the **only** intentional RLS bypasses, and they return tenant-linked rows rather than leaking "everything".
- plpgsql detail: these were written with explicit scalar variables and quoted camelCase columns (`SELECT ... INTO`), **not** `%ROWTYPE` (record-field access folds identifiers to lowercase and fails on camelCase columns — fixed in migration `20260914000001`).

## 2. Migration (applied to live `shms_db`)
`prisma/migrations/20260914000000_enable_row_level_security/migration.sql` (+ applying `20260914000001_fix_global_lookup_functions`) does:
- Creates `shms_row_visible(org)` — `security invoker` helper: bypass if `bypass_rls = 'true'` and org unset (global super-admin view); otherwise visible only when `current_setting('app.organization_id')` matches.
- Creates the three SECURITY DEFINER functions above.
- Creates `FOR ALL` policies per table with `USING` (read) **and** `WITH CHECK` (write) so inserts must claim the current tenant — writes never get a "global" bypass expansion.
- Inherited tables (no own `organizationId`: Profile, Staff, MedicalRecord, Consultation, Prescription, PrescriptionItem, NotificationPreference) use linear `EXISTS` chains ending at `User`/`Queue` — no recursive policies.
- `ENABLE` + `FORCE` RLS on all 16 tenant tables (safe to force now: the runtime role `postgres` is superuser and bypasses RLS, so the app is unaffected during transition).
- `REVOKE INSERT/UPDATE/DELETE` on `_prisma_migrations` from `shms_app` (migrations are an admin concern only).
- `ALTER DEFAULT PRIVILEGES` — future tables/sequences in `public` are granted to `shms_app`.

## 3. Security Model

### 3.1 Delegation
- **Code-level (defense-in-depth):** every data operation carries the acting user's org as a transaction-local variable.
- **DB-level (the control):** RLS re-checks the same org for every row, so even a future service bug that forgets to scope cannot reach another tenant (fail closed, verified F).
- **Intentional escapes (only two):** SECURITY DEFINER identity lookups (§1.3) and super-admin global scope (bypass + org unset → policy permits all rows).

### 3.2 Fail-closed semantics
- No context: `not visible`. Missing `app.organization_id` → `shms_row_visible` returns false → **0 rows** for reads, **0 rows** for UPDATE/DELETE, `WITH CHECK` violation (error) for INSERT.
- Super-admin global: `app.bypass_rls='true'` with org unset → policy's bypass branch makes every row visible; with an org set → normal tenant scope.
- All of the above verified by probes (F, A/B, C, D, E, E2, I).

## 4. Verification Performed

### 4.1 Config and privilege checks (as `postgres`)
- RLS **enabled on all 16** tenant tables; **FORCE on all 16**.
- Every table has ≥1 policy; all four functions exist; `shms_app` has SELECT/INSERT/UPDATE/DELETE on all tenant tables but was verified **not** superuser and **without** `BYPASSRLS`; DML on `_prisma_migrations` denied.

### 4.2 Enforcement probes (as `shms_app` via `SET LOCAL ROLE` inside a transaction)
| ID | Probe | Result |
|---|---|---|
| CONFIG | RLS/FORCE/policies/functions/privileges | PASS (6/6) |
| G | global auth resolves user + own org pre-tenant; unknown → empty | PASS |
| H | reset-token lookup on unknown token (no error) | PASS |
| F | missing context → **0 rows** (fail closed) | PASS |
| A | own-org reads visible; total == own-org count | PASS |
| B | cross-tenant rows invisible | PASS |
| C | cross-tenant UPDATE → 0 rows; own-tenant UPDATE works | PASS |
| D | cross-tenant DELETE → 0 rows | PASS |
| E | cross-tenant INSERT → blocked (WITH CHECK) | PASS |
| E2 | inherited Profile INSERT for foreign user → blocked | PASS |
| K | own-org INSERT then DELETE allowed within one transaction | PASS |
| I | super-admin global sees all orgs | PASS |
| J | context + role are transaction-local; no leak after commit | PASS |
| J2 | `_prisma_migrations` DML denied for `shms_app` | PASS |

**Result: 27 passed, 0 failed.**

### 4.3 API regression — live enforcement (runtime role `shms_app`)
After the operator switched `DATABASE_URL` to `shms_app`, RLS is now **actually enforced** on every request. Full suites re-run against the live backend:
- **Tier-3 authorization suite (28 checks):** ALL PASSED — logins (SECURITY DEFINER globals), policy 403s, authorized 200s, medical-record ownership/hierarchy, cross-org hiding (404 by-ID / 403 org-scoped), AUTH_FAILURE + CROSS_ORG_ATTEMPT audit rows, no false lockout, super_admin controlled cross-org 200.
- **Full-surface regression (24 checks):** ALL PASSED — dashboards, lists, reports (org + global), audit, services, staff, departments, profiles — restarted backend, no 5xx.
- This is the real end-to-end proof that tenant scoping (code) + RLS (database) work together: the same behavior previously verified under `postgres` is reproduced, and a bare (no-context) `User` read as `shms_app` returns **0 rows** (fail-closed confirmed from inside the app connection).

## 5. Files Changed
| File | Change |
|---|---|
| `prisma/migrations/20260914000000_enable_row_level_security/migration.sql` | new — RLS enablement (functions, policies, grants, FORCE) |
| `prisma/migrations/20260914000001_fix_global_lookup_functions/migration.sql` | new — plpgsql camelCase fix (scalar `INTO`, no `%ROWTYPE`) |
| `src/utils/tenantContext.js` | hardened — re-entrancy, strict fail-closed, super-admin semantics |
| `src/middleware/auth.middleware.js` | user lookup wrapped in `withTenant`; missing org claim → 401 |
| `src/utils/securityAudit.js` | audit writes via `withTenant(org, {isSuperAdmin:true})` |
| `src/services/audit.service.js` | all functions tenant-wrapped; super-admin global audit read |
| `src/services/queue.service.js` | two-phase + retry loop wrapped |
| `src/services/consultation.service.js` | two-phase (read user org / write queue org) |
| `src/services/appointment.service.js` | writes wrapped in record org |
| `src/services/prescription.service.js` | two-phase via `consultation.queue.organizationId` |
| `src/services/staff.service.js` | wrapped; dup-check = SECURITY DEFINER (intentional) |
| `src/services/notification.service.js` | org resolved via `findUserOrgHint` |
| `src/services/medical-record.service.js` | wrapped (incl. static `findUserOrgHint` import) |
| `src/services/profile.service.js` | org resolved via `findUserOrgHint` |
| `src/repositories/user.repository.js` | case-tolerant mappers for SECURITY DEFINER results (DB returns lowercase keys: `isactive`, `organizationid`); login was broken until fixed |
| `src/services/schedule.service.js`, `department.service.js`, `position.service.js`, `service.service.js`, `report.service.js`, `dashboard.service.js` | all wrapped |

## 6. Test Artifacts
- `probe3.mjs` (temporary, role-switched RLS enforcement suite §4.2) — **deleted after green**.
- Full-surface regression continues to live in the temp workspace and passed §4.3.

## 7. Remaining / Manual Steps (honest)
1. **Runtime is now live on `shms_app`.** `DATABASE_URL` was switched; RLS is enforced on every request against the running backend, verified by the Tier-3 + regression suites (§4.3). Do **not** revert it to `postgres`, or enforcement silently becomes advisory again.
2. **Migrations must be run with an admin (owner) connection.** `shms_app` has `INSERT/UPDATE/DELETE` revoked on `_prisma_migrations`, so `prisma migrate deploy` will **fail** under the app connection (by design — migrations are an admin concern). Keep the original superuser URL for the migration/db:migrate step, then switch back to the app connection. New objects are covered by the `ALTER DEFAULT PRIVILEGES` grants.
3. **Incident repair path** (used and validated during this pass): tenant writes for super-admin flows already set the record's org `WITH CHECK`, so `withTenant(recordOrg, { isSuperAdmin: true })` covers global-scope repairs with org = each affected org and `app.bypass_rls = true`.
4. **Performance observation:** org-scoped indexes already exist (Tier-3 pass `add_multitenant_indexes`); inherited-chain policies add EXISTS subquery reads on first-tenant tables only — cheap, but worth an EXPLAIN pass on the two busiest reads (queue-by-org, medical-record-by-org).
5. **Multi-tenant real-world load** is still not exercised with a second fully populated tenant (only seeded accounts); the probe matrix covers the semantics.

## 8. Production Readiness Assessment

| Item | Status |
|---|---|
| RLS enabled + FORCED on 16 tenant tables (live DB) | PASS (migration applied) |
| Fail-closed: no context → no rows; writes blocked | PASS (probes F/E/E2) |
| Cross-tenant read/update/delete isolated | PASS (probes A/B/C/D) |
| In-scope inserts work, cross-tenant inserts blocked | PASS (probes K/E) |
| Global pre-auth identity lookups preserved | PASS (probes G/H) |
| Super-admin global scope (deliberate) | PASS (probe I) |
| Tenant context is transaction-local (no leaks) | PASS (probe J) |
| All app code routes work under `shms_app` (live RLS) | PASS (28/28 tier3 + 24/24 regression) |
| Appliances run as `shms_app` (live enforcement) | PASS (DATABASE_URL switched, verified) |

**Overall: RLS is implemented, live, and verified end-to-end.** The database is now enforced tenant-isolated for the application role; super-admin global scope remains deliberate and audited. The only operational caveat: run `prisma migrate deploy` under a separate admin connection (migration-table DML is revoked for `shms_app`, by design).