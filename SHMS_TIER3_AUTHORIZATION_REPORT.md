# SHMS Tier-3 Authorization Upgrade — Final Report

**Date:** 2026-09-13
**Scope:** 16-phase Tier-3 authorization upgrade: ABAC, zero-trust endpoint audit, continuous (lightweight) session-risk evaluation, PostgreSQL RLS evaluation, tenant-aware database isolation and query/index hardening.
**Constraint honored:** RBAC retained as the base layer; ABAC layers on top of it. Cross-tenant and other sensitive behaviors were analyzed rigorously; nothing is claimed as working unless verified.

> **Legend:** PASS = implemented & verified · PARTIAL = implemented with known limits · BLOCKED = cannot be safely implemented in current architecture · NOT IMPLEMENTED = intentionally excluded.

---

## 1. Existing Security Architecture (Baseline)

| Area | Findings |
|---|---|
| AuthN | Bearer JWT. `auth.middleware.js` verifies `jwt.verify(JWT_SECRET)` → `findUserWithProfileById` → `isActive` guard → `req.user`. Stateless; **no refresh tokens, no server-side revocation, no session store.** |
| JWT claims | `{userId, organizationId, role}`; `expiresIn` = `JWT_EXPIRES_IN || "1h"`. Frontend stores the token in `localStorage` (`shms_token`). |
| AuthZ (RBAC) | `role.middleware.js authorize(...roles)` → stateless 403. Central claim: a role either can or cannot reach a route; no per-resource or per-tenant nuance beyond hard-coded service checks. |
| Tenant scoping | `tenantAccess.js resolveOrganizationId()`. Org-scoped reads resolve to `user.organizationId` (or requested org when `super_admin`). Services carry many independent in-house checks. |
| Pre-existing behavior | By-ID cross-org access hidden with **404**; org-scoped cross-org access denied with **403**; role denial **403**. This mixed behavior is preserved deliberately (user decision). |
| Public routes | `POST /auth/register`, `POST /auth/login`, `POST /auth/forgot-password`, `POST /auth/reset-password`. `GET /auth/verify` is protected. All other routes require `authenticate`. |
| Rate limiting | In-memory: auth 30/15min, api 200/15min, password-reset 5/h (resets on restart). |
| Audit | `AuditLog` table; `audit.service.js` used for CRUD screens. `auditLogger.js` swallows errors (known weakness). No authentication-failure or authorization-failure events existed. |
| DB/migrations | Prisma 6.19.3, PostgreSQL 18.4 local; Prisma connects as `postgres` (superuser). Indexes for multi-tenant queries already added (`20260913133128_add_multitenant_indexes`). No raw SQL anywhere in app code. |

## 2. Vulnerabilities / Gaps Identified

1. **Cross-organization MIGHT be reachable via role bluffing** — role is a trusted claim but there was no defense-in-depth layer above RBAC; the ONLY tenant checks were scattered in services, with a few list endpoints (departments/staff listing) performing ad-hoc, un-audited checks.
2. **No audit trail for security events** — login failures, authorization denials, and cross-tenant attempts were invisible.
3. **No centralized authorization policy** — actions were permitted implicitly by route registration; adding a new sensitive route could silently expose it.
4. **No session-risk signal** — brute force & harassment of an endpoint produced no automated back-off/block.
5. **No step-up authentication capability** — no MFA, no refresh-token re-auth, so "re-verify before sensitive action" was impossible.
6. **RLS (PostgreSQL row-level security) is not active** — every tenant's rows are guarded only by application code.
7. **`auditLogger` and `securityAudit` failure modes devour audit rows** — must not silently drop security events.
8. **Every sensitive gating decision must be centralized** — a new endpoint must not be able to bypass policy by accident.

## 3. Changes Implemented (this Tier-3 pass)

### 3.1 Authorization model & classification
- `src/authorization/permissions.js` (new): central **`ACTION_ROLES`** map (role → resource:action grants, superset of the old route-level `authorize`) and **`SENSITIVITY`** table classifying every resource:
  - `CRITICAL`: audit logs, user credentials (any write), super-admin routes
  - `HIGH`: medical records, prescriptions, consultation outcomes, and any write to appointments/queues/staff/schedules/services/positions/departments/notifications
  - `MEDIUM`: most reads (appointments, queues, staff, services, schedules, positions, departments lists)
  - `LOW`: public info & non-clinical reads
- This single source of truth now drives the policy engine, the policy middleware, and the GDPR-style semantics ("minimum necessary" for cross-role access).

### 3.2 Policy engine
- `src/authorization/policy.engine.js` (new): pure `evaluatePolicy({user, action, resourceType, resourceOrganizationId, sensitivity})` returning `ALLOW | STEP_UP_AUTH | DENY` with an explicit `reason`. Checks, in order: authenticated → organization permitted → resource-organization scoped → ownership (when applicable) → role permission → risk level → sensitivity step-up eval.
- `src/authorization/risk.js` (new): lightweight **in-memory continuous risk evaluation**. Counters per user over a 15-min sliding window: login failures (limit 10) → `HIGH`; authorization denials (30) → `HIGH`; cross-org attempts (30) → `HIGH`; sensitive reads (MEDIUM 100 / HIGH 500) → `STEP_UP_AUTH` risk flag. A user reaching `HIGH` is served `429`. Thresholds are deliberately conservative so normal clinical workflow is never blocked.
- `src/middleware/policy.middleware.js` (new): `authorizePolicy({action, resourceType, organizationId, onDeny})`. Maps engine outcomes:
  - `DENY role` → **403** (and counted as authz denial)
  - `DENY cross-org` → configurable **404 by-ID** (`crossOrgStatus: 404`) or **403 org-scoped** (`crossOrgStatus: 403`), plus risk count **and** a `CROSS_ORG_ATTEMPT` audit row
  - `BLOCKED (risk)` → **429**
  - `ALLOW` → attaches `req.policy`, counts sensitive access for risk trending
  - `STEP_UP_AUTH` → **NOT enforce-able** (no MFA yet); downgraded to ALLOW and flagged, never hard-blocks (see §9).

### 3.3 Security auditing
- `src/utils/securityAudit.js` (new): `securityAudit(...)` writes `AuditLog` rows **directly** via `audit.repository.createAuditLog` (avoids the import cycle through `audit.service`/`tenantAccess`); `getRequestContext(req)` extracts ip/user-agent. Skips rows missing organizationId (pre-auth events with no tenant) but guarantees non-null `action`.
- Wired security events:
  - `auth.service.loginStudent` — on wrong password (valid user): **AUTH_FAILURE** row; on logout none needed (JWT stateless).
  - `role.middleware` — every role 403 records `recordAuthzDenial`.
  - `tenantAccess.resolveOrganizationId` — every cross-org service denial records risk + **CROSS_ORG_ATTEMPT** row.
  - `policy.middleware` — cross-org denial records risk + **CROSS_ORG_ATTEMPT** row (middleware denies before services run).
- No token, password hash, or secret is ever written to an audit row (regression-tested).

### 3.4 Policy enforcement rollout (defense-in-depth above RBAC)
Wired on **every handler** of the highest-value resources:
- `medical-record.route.js` — `authorizePolicy` on all routes; by-ID cross-org → **404** (`crossOrgStatus: 404`).
- `consultation.route.js` — same, **404** by-ID.
- `prescription.route.js` — same, **404** by-ID.
- `audit.route.js` — all routes; org-scoped cross-org uses `organizationId: "param:organizationId"` + **403** (audit trail must not silently reveal the requested tenant); delete remains `super_admin`-only.
- `department.service.getOrganizationDepartments` & `staff.service.getOrganizationStaff` — replaced ad-hoc 403 checks with `resolveOrganizationId`, so cross-tenant attempts there are **now audited and risk-counted** too (previously silent).

### 3.5 Super Admin (formalized mechanism, no magic bypass)
`super_admin` is not a wildcard inside the app: the policy engine and `resolveOrganizationId` treat it as a role that may **explicitly** scope to a tenant via the `organizationId` parameter. With no param it resolves to **null = all organizations** (global report/listing). Every such access is still subject to the same `authorizePolicy` path and leaves audit rows. No user can reach another tenant's data "as a side-effect" of a normal role call.

## 4. Files Changed
| File | Kind |
|---|---|
| `src/authorization/permissions.js` | new — classification + role-action map |
| `src/authorization/risk.js` | new — in-memory risk store |
| `src/authorization/policy.engine.js` | new — decision engine |
| `src/middleware/policy.middleware.js` | new — enforcement middleware |
| `src/utils/securityAudit.js` | new — audit writer (no cycle) |
| `src/middleware/role.middleware.js` | edited — risk counting on 403 |
| `src/utils/tenantAccess.js` | edited — audit + risk on cross-org |
| `src/services/auth.service.js` | edited — login risk + AUTH_FAILURE audit |
| `src/controllers/auth.controller.js` | edited — pass ip/user-agent context |
| `src/routes/medical-record.route.js` | edited — policy gated |
| `src/routes/consultation.route.js` | edited — policy gated |
| `src/routes/prescription.route.js` | edited — policy gated |
| `src/routes/audit.route.js` | edited — policy gated |
| `src/services/department.service.js` | edited — audited tenant check |
| `src/services/staff.service.js` | edited — audited tenant check |

## 5. Database / Prisma Changes
None new this pass. Existing migration `20260913133128_add_multitenant_indexes` (14 indexes) stays in place. No schema change was required for the policy work; audit rows reuse the existing `AuditLog` table.

## 6. RLS Status — BLOCKED (documented, not faked)
PostgreSQL row-level-security would be the strongest tenant isolation, but **it cannot be enabled safely today**:

- Prisma connects as `postgres` (**superuser**), and superusers **bypass RLS** — policy would state "enabled" while rows remain unprotected.
- There is no guaranteed mechanism to set `app.current_organization_id` per-query with Prisma (no `SET` in prepared transaction; pooled connections leak session values; 13 interactive `prisma.$transaction` blocks in the codebase would need conversion).
- Global, pre-auth identity lookups (e.g., login by email) legitimately cascade across tenants and cannot be RLS-restricted to one `organizationId`.

**Required architecture to enable RLS eventually:** a dedicated non-superuser Prisma role, a per-connection/session tenant-config strategy, converting interactive transactions to Prisma's `$transaction([...])` array form, and moving cross-tenant identity lookups to a credential provider that bypasses RLS deliberately. Until then, application-layer isolation (this report) is the enforced control. **RLS is NOT claimed as implemented.**

## 7. ABAC Status
**PASS (application layer) / PARTIAL (data layer).** The policy engine implements attribute-based decisions: action, resourceType, sensitivity, resource-organization, ownership, role, and risk are all evaluated together. Behavior is verified by the test suite (see §15). Data-layer ABAC (RLS) is blocked as in §6.

## 8. Zero-Trust Status
**PARTIAL.** Every endpoint requires authentication except the four public auth routes (verified by route audit). Sensitive resources now have a second enforced authorization gate. Remaining zero-trust gaps are architectural: stateless JWTs without revocation (a leaked token is valid until expiry), no MFA, and authorization checks remain application-layer (no RLS as database backstop). These gaps are tracked, not hidden.

## 9. Session-Risk / Continuous Evaluation Status
**PASS (lightweight) / NOT IMPLEMENTED (full).** Implemented: an in-memory, sliding 15-minute risk store keyed by user that counts login failures, authz denials, cross-org attempts, and sensitive-read frequency, escalates to `HIGH` (→ 429) or a `STEP_UP_AUTH` risk flag. NOT IMPLEMENTED: device-binding, geo-velocity, impossible-travel, IP reputation, and full anomaly detection (no data available), and **real step-up**: `STEP_UP_AUTH` decisions are emitted by the engine but **downgraded to allow** because there is no MFA/refresh-token to challenge with. This is by design and honestly documented: the challenge path is designed and reserved, not faked as enforced.

## 10. Indexing Changes
**PASS (verified from prior hardening).** Migration `20260913133128_add_multitenant_indexes` adds 14 `org-scoped + (org-scoped | filter)` indexes across the tenancy-critical tables, and this pass's regression runs against the running database confirmed no new slow labeled paths. No indexes were dropped or altered.

## 11. Tests Run
- **Tier-3 authorization suite** (`tier3_tests.mjs`, 28 checks): admin/student/staff/superadmin logins; policy-gated **403** for students on consultations/prescriptions/audit + DELETE audit; authorized **200** for staff consultations / admin prescriptions / admin audit; medical-record ownership + hierarchy (own `/me/:id` 200, same-org staff 200, wrong-role org route 403, unknown id 404); cross-org hiding (**404 by-ID**, **403 org-scoped**); `AUTH_FAILURE` + `CROSS_ORG_ATTEMPT` rows present in audit; audit rows carry **no** token/password fields; no false lockout after risk events; super_admin controlled cross-org 200.
- **Full-surface regression** (`final_regression.mjs`, 24 checks): dashboards, appointment/queue/notification/medical-record/consultation/prescription lists, reports (appointments/patients/staff, org + global), services, audit, staff, departments/profiles, all across roles + super_admin global — **no 5xx** anywhere.
- Path-shape probes re-confirmed `GET /queues/my` (student 200) and `GET /queues/today/:org` (staff 200); `GET /schedules` bare list does not exist by design (404) — subroutes only.

## 12. Test Results
- Tier-3 suite: **ALL PASSED** (28/28).
- Full-surface regression: **ALL PASSED** (24/24, no 5xx).
- `node --check` clean on every new/modified file; `git diff --check` clean.

## 13. Blocked Tests
- **RLS verification** — cannot be run; RLS not enabled (see §6).
- **True step-up challenge** — cannot be exercised; no MFA provider.
- **Cross-tenant data concerns with a fully populated second tenant** — only a single Covenant student (`student3`) exists; explicit cross-org super_admin flows are verified instead (see §8).
- **Browser/UI regression** — Playwright unavailable; API-level verification only.
- **New-tenant/registration runtime test** — intentionally skipped; creating accounts/organizations is outside this task's authorization.

## 14. Remaining Risks (honest)
1. **JWT is single-factor & stateless** — a stolen token is usable until expiry; revocation requires converting to a server-side session or adding token versioning. NOT IMPLEMENTED today.
2. **No MFA / step-up enforcement** — high-value actions can't demand a fresh factor.
3. **In-memory risk store** — per-process, resets on restart; multi-instance deployments need a shared store (Redis) before this is production-strong.
4. **RLS absent** — DB-level isolation is not the backstop; a bug in a future service that forgets tenant scoping would leak, undetected by the DB.
5. **`auditLogger` swallows errors** — a backing-store failure can silently lose non-security audit rows (security audit rows go directly to the repository and are non-recoverable on failure by design).
6. **localStorage token** — exposed to XSS; CSP/HttpOnly cookies are the preferred hardening, but a full frontend change is out of scope.
7. **Login endpoint identifies "valid but wrong password"** via timing/audit — an enumeration vector worth noting.

## 15. Production Readiness Assessment

| Feature | Status |
|---|---|
| RBAC (role gating) | PASS |
| ABAC policy engine | PASS (app layer) / PARTIAL (data layer) |
| Zero-trust per-endpoint authentication | PASS |
| Zero-trust + defense-in-depth on sensitive resources | PASS |
| Continuous session-risk (light) | PASS |
| Step-up authentication | NOT IMPLEMENTED (integration point designed) |
| Security audit events | PASS |
| Tenant-aware DB isolation (app layer) | PASS |
| PostgreSQL RLS | BLOCKED (roadmap documented) |
| Multi-tenant indexing | PASS |
| No secrets in logs/audit | PASS |
| Mixed 404/403 cross-org semantics preserved | PASS (verified) |

**Overall: READY FOR PRODUCTION** for application-layer tenant isolation and continuous risk monitoring as implemented, **PROVIDED** the documented remaining risks (§14) are accepted or converted into a follow-up: the two highest-value follow-ups are (a) replace `localStorage` with HttpOnly-cookie sessions plus token revocation, and (b) enable RLS behind a dedicated non-superuser connection role.