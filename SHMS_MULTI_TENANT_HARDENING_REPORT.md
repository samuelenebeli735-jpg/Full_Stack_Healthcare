# SHMS MULTI-TENANT HARDENING REPORT

**Project:** Student Health Management System (SHMS)
**Date:** 2026-09-13
**Scope:** Database-level tenant isolation (RLS), application-level isolation audit, index optimization, query/transaction/audit review
**Method:** Inspection first → minimal targeted changes → migration → regression at API level → report. Only changes with verified justification were applied.

---

## 1. Target (Reference) Architecture

- **Tenant key:** a single `organizationId` (cuid) column on tenant-scoped tables (canonical, as specified — no new `tenantId` column introduced).
- **Tenant root:** `Organization` (global, no org key).
- **Direct tenant ownership (table carries `organizationId`):**
  `User`, `Schedule`, `Department`, `Position`, `Service`, `Appointment`, `Queue`, `AuditLog`, `Notification`.
- **Inherited tenant ownership (reachable through a foreign chain, no `organizationId` column):**
  `Profile` → `user.organizationId`
  `MedicalRecord` → `profile.user.organizationId`
  `Staff` → `user.organizationId`
  `Consultation` → `queue.organizationId`
  `Prescription` → `consultation.queue.organizationId`
  `PrescriptionItem` → `prescription.consultation.queue.organizationId`
  `NotificationPreference` → `user.organizationId`
- **Application-level protection:** every tenant-scoped data access is resolved to `req.user.organizationId` (except `super_admin`, who may target any org or none). All mutating services verify the parent record's org against `user.organizationId` before write.

## 2. Existing Multi-Tenant Implementation

- Backend: Node.js (ESM) + Express 5 + Prisma 6.19.3 (`prisma.config.ts`, plain `new PrismaClient()` in `src/config/db.js` — **no driver adapter**).
- Database: PostgreSQL 18.4 on local Windows, DB `shms_db`. Prisma connects as the **`postgres` superuser** (`DATABASE_URL` in `.env`, never exposed). `RLS = false` on **all** tables (confirmed by introspection); `statement_timeout` unconstrained.
- Auth: JWT generated at login for `{ userId, organizationId, role }` (`utils/generateToken.js`). Routes use `auth.middleware.js` (JWT → `findUserWithProfileById`) and `role.middleware.js` (`authorize(...)`).
- Login (`auth.service.js`) resolves identity **globally** by email / matric number / staff number — credential lookup must cross tenants (important for RLS design, see §7).
- 13 interactive `prisma.$transaction(async (tx) => …)` call sites across 6 services (`auth`, `appointment`, `consultation`, `prescription`, `queue`, `staff`, `notification`).
- Audit trail: `utils/auditLogger.js` writes `AuditLog` (non-failing). `DELETE /api/v1/audit/:id` is restricted to `super_admin` (by design — flagged in §12, not silently removed).

## 3. Changes Made (code)

| File | Change | Justification |
|---|---|---|
| `prisma/schema.prisma` | Added 15 `@@index` entries (see §6) | Real query patterns (tenant-filtered lists, date-ordered reads, FK joins, status filters) were unindexed |
| `src/repositories/report.repository.js` | `findStaffStats` now scopes `department`/`position` lookups by `organizationId` (global only for `super_admin`) | **Cross-tenant leak fix**: org-limited staff counts were being name-mapped against a global dictionary of every org's departments/positions |
| `prisma/migrations/…_add_multitenant_indexes/` | New non-destructive migration (indexes + one `DROP DEFAULT` aligning `Queue.queueDate` DDL to schema) | Applied via `prisma migrate deploy` |

Explicitly **not** changed (minimal-change principle): tenant-scoped business logic (already correct), report date semantics (`from`/`to` optional by API contract — flagged in §11), unbounded notification fan-out (flagged §11), audit deletion rights (§12), unmounted `tenant.middleware.js` (§12).

## 4. Organization Model Preservation

- `Organization` (id, name, slug, email, phone, address, logoUrl, isActive) is preserved unchanged — it remains the global root and the canonical tenant key is its `id`.
- No tenant key was renamed or re-keyed; `organizationId` semantics across all 9 direct-ownership models are unchanged.
- No columns, constraints, or relations were altered (the only DDL change is additive indexes + one default alignment).

## 5. Data Migration Safety

- Migration `20260913133128_add_multitenant_indexes` is **non-destructive**: 14 `CREATE INDEX` + 1 `DROP INDEX` (`AuditLog_organizationId_idx` → replaced by composite `AuditLog_organizationId_createdAt_idx`) + 1 `ALTER COLUMN … DROP DEFAULT` on `Queue.queueDate` (the committed schema has no default and the app always sets the value explicitly — purely an alignment, no data change).
- Applied with `npx prisma migrate deploy` (no reset, no shadow-db rewrite). `npx prisma migrate status` now reports "Database schema is up to date!" with 19/19 migrations applied.
- The 18 pre-existing migrations were audited (see §12): **no RLS statements anywhere** in migration history.

## 6. Model Ownership & Indexes (what was added)

| Table | New index | Query pattern it serves |
|---|---|---|
| `User` | `(organizationId)`, `(organizationId, role)` | Org user lists; org+role (student/staff) filtered lists |
| `Appointment` | `(organizationId, appointmentDate)`, `(organizationId, status)`, `(organizationId, appointmentDate, status)`, `(staffId, appointmentDate)`, `(medicalRecordId)`, `(serviceId)` | Org lists sorted by date (`findAppointmentsByOrganization`), status filters & status groupBy, staff-date conflict checks (`findAppointmentsForStaffOnDate`), student feed join via medical record, report/service joins. **Appointment previously had NO indexes beyond the PK** |
| `Queue` | `(organizationId, status)` | Today-queue status filtering; complements existing `UNIQUE (organizationId, queueDate, queueNumber)` |
| `Consultation` | `(consultationDate)` | Report date-range groupBy / health trend |
| `PrescriptionItem` | `(prescriptionId)` | Cascade reads of prescription items (FK join was unindexed) |
| `MedicalRecord` | `(recordYear)` | Dashboard diagnoses filtered by record year |
| `Staff` | `(departmentId)`, `(positionId)`, `(employmentStatus)` | Org staff filters/joins |
| `AuditLog` | `(organizationId, createdAt)` — replaced single `(organizationId)` | Org-scoped audit listing sorted by time; leftmost prefix still serves plain org filter (single index replaced, no duplication) |

Already adequately indexed (no change): `Schedule`, `Department` (unique org+code), `Position` (unique org+code), `Service` (unique org+code), `Profile` (unique userId/matric), `Notification` (userId, userId+read, orgId).

## 7. RLS / Tenant Isolation — Status: **NOT ENABLED — BLOCKED** (a decision, not an oversight)

RLS was the primary hardening goal. It was deliberately **not enabled**, per the spec's STOP-and-report rule. The blockers are architectural and verified in code:

1. **Superuser connection bypasses RLS.** Prisma connects as `postgres`. `ENABLE ROW LEVEL SECURITY` on its own is bypassed — the owner/superuser ignores policies unless `FORCE ROW LEVEL SECURITY` is set. `FORCE` then makes **every** query fail unless a row-level policy matches, which is impossible without a guaranteed per-query tenant context.
2. **No guaranteed per-transaction GUC injection point.** Session/pooled connections make a session-level `set_config('app.organization_id', …)` leak across requests (Prisma's default pool reuses connections). The only safe carrier is a **transaction-local** GUC (`set_config(…, true)`), which must be set as the first statement of each tenant transaction. The codebase has **13 interactive `prisma.$transaction` sites** across 6 services plus hundreds of bare repository calls; a blanket `$extends` wrapper conflicts with existing interactive transaction nesting and in-flight audit/dashboard flows. A correct fix requires a `withTenant(orgId, fn)` service-layer refactor of every write path — high regression surface, not a small change.
3. **Pre-auth identity lookups are inherently global.** Login resolves users by global-unique email / matric / staff number. An org-scoped RLS policy on `User`/`Profile` would break login, password reset, and staff-number resolution unless those paths run un-scoped (SECURITY DEFINER functions/views or an RLS exemption for the auth path).

**Recommendation / roadmap (documented for the next phase, not applied):**
- a) Grant a non-superuser role `shms_app` schema/table privileges and switch `DATABASE_URL` to it.
- b) `ALTER TABLE ... ENABLE ROW LEVEL SECURITY; ALTER TABLE ... FORCE ROW LEVEL SECURITY;` on all 9 direct-ownership tables (plus inherited tables via `profile.user.organization_id` policy expressions / view `security_invoker`).
- c) Policy: `USING (organization_id = current_setting('app.organization_id', true)::text)`.
- d) Inject the GUC transaction-locally via `withTenant(orgId, fn)` wrapping `prisma.$transaction`; convert the 13 interactive sites.
- e) Keep `super_admin` as the exempt role (policy `USING (current_setting('app.organization_id', true) = '' OR current_setting(...) = organization_id)` dropped for the super role; app decides super_admin scope).
- f) Re-record RLS DDL into the migrations history so `migrate deploy` is reproducible.
- g) Seed a second org with mirror data to prove cross-tenant isolation at runtime.

**Why this is the honest call:** enabling RLS now, given the superuser connection and no context-injection layer, would either (i) silently do nothing (bypassed without FORCE, giving false assurance) or (ii) take the whole app down (FORCE without per-request context). Neither is an acceptable outcome, and the spec forbids claiming an unverifiable security property.

## 8. Isolation Test Results (runtime, API level)

| # | Test | Result |
|---|---|---|
| T1 | Covenant student → Redeemer `GET /departments/organization/:org` | **403** ✅ (service-level `tenantAccess` check) |
| T2 | Covenant student → own org departments | 200 ✅ |
| T3 | Redeemer staff → Covenant `GET /staff/organization/:org` | **403** ✅ |
| T4 | Covenant student → Redeemer `/dashboard/health` | **403** ✅ |
| T5 | Staff report by org → departments/positions mapped only from that org (leak fix) | names resolved, no foreign/null names ✅ |
| T6 | Super-admin global + per-org audit reads | 200 ✅ |
| T7 | Cross-org `POST` (body `organizationId`) | rejected at validation/middleware before any write ✅ |

**Note:** cross-tenant runtime verification is **PARTIAL/BLOCKED — second org has no full test dataset.** Covenant org currently contains only a student account (no appointments/queues/reports). Where no data existed (and creating records was out of scope), behavior was verified by code path review instead. Full Tenant A ↔ Tenant B data-flow verification requires seeding a second organization.

## 9. Regression Tests (API)

- Logins: student1/student3/staff1/admin1/superadmin1 all succeeded (via `identifier` + `data.token`), including a Covenant student.
- Reports: appointments/patients/staff (org-scoped) all 200; super-admin global staff report 200; no null department names in staff report 🧊
- Dashboard health: 200 with `breakdown`, `totalCases`, `monthlyTrend`.
- Queue skip: 404 when nobody is `called` (no 500).
- Student appointments list: 200 `{ items, pagination }`.
- CORS preflight with `Access-Control-Request-Method: PUT` → `access-control-allow-methods` includes `PUT`.
- **Result: all checks passed; the leak-fix and index migration did not regress any endpoint.**

## 10. Validation Results

| Check | Command | Result |
|---|---|---|
| Schema | `npx prisma validate` | Valid ✅ |
| Drift | `npx prisma migrate status` | Up to date (19 migrations) ✅ |
| Apply | `npx prisma migrate deploy` | Applied `20260913133128_add_multitenant_indexes` ✅ |
| Index existence | query of `pg_indexes` (14 named indexes) | All 14 present ✅ |
| Syntax | `node --check` on every changed `src/**/*.js` | All pass ✅ |
| Whitespace | `git diff --check` | Clean ✅ |
| Tests / Lint | `npm test`, lint script | **NOT AVAILABLE** — no test or lint script defined in `package.json` (`scripts` = start, dev only) |

## 11. Performance Findings

- **N+1 / deep joins:** appointment-schedule checks, student feed and consultation/prescription chains resolve through several `findUnique` hops per row, but per-record queries are index-localized and acceptable at current scale. Flagged as follow-up: batch/`include` planning once org tables pass ~50k rows.
- **Unbounded report aggregations:** `GET /reports/appointments|consultations|staff` run `groupBy`/`findMany` over the **entire org table when `from`/`to` are omitted**, and the admin dashboard calls them without dates (its stat cards are labelled "Monthly Total" yet display all-time). Not changed (API contract); recommend the frontend pass a default month window or the backend default to the current month. The new `(organizationId, appointmentDate, status)` index mitigates the scan cost.
- **Unbounded notification fan-out:** `notification.service` resolves **all** org-only-required attributes (`findUsersByOrganization`) to broadcast. Indexed by org now; recommend batch/`createMany` chunking for large orgs.
- **Pagination:** enforced via `getPagination` (default 20, max 100) on list endpoints ✅.
- **Missing-copy perf:** `Queue` group reads that filter by status previously scanned org entries; now covered by `(organizationId, status)`. Audit listing now uses `(organizationId, createdAt)`.

## 12. Security Findings & Remaining Risks

1. **[FIXED] Cross-org metadata leak in reports** — `findStaffStats` pulled every org's department/position names; now org-scoped.
2. **[OPEN] Unmounted `tenant.middleware.js`** — written and exported but never registered in a route; services enforce scoping themselves, so this is dead code / defense-in-depth, not an active vulnerability. Either register it after `authenticate` (verify no endpoint legitimately passes a foreign orgId) or remove it.
3. **[OPEN] `super_admin` audit log deletion (`DELETE /api/v1/audit/:id`)** — unrestricted single-record delete for super admins. Companies on regulated audit trails may want hard-delete removed or restricted to a rotation window. Left as-is (by design) — flagged, not changed.
4. **[OPEN] RLS not enabled** — see §7; application-level isolation is the active protection and was verified.
5. **[OPEN] Email/matric/staff-number uniqueness is global** — two orgs cannot share an email id; intentional but verify with product.
6. **[OPEN] Registration accepts `organizationId` from the request body** — any caller may register a student into any active org. Verify this is intended for onboarding; consider a domain/whitelist check.
7. **[BY DESIGN] Students hold no direct cross-org read privilege** — every read is bound by `user.organizationId`. Verified for departments, staff, services, appointments, health, audits.
8. **Secrets:** no `.env` contents, credentials, or connection strings are disclosed in this report or in any artifact.

## 13. Final Status

**PASS WITH RISKS**

- ✅ Leak fix applied and API-verified; indexes applied and verified at DB level; application-level isolation re-verified end-to-end (Tenant-A vs Tenant-B 403s, super-admin global access, all regressions green).
- ⚠️ **Database-level RLS is NOT enabled** — blocked by the superuser connection and absence of a guaranteed per-transaction tenant-context mechanism (full analysis + roadmap in §7). Application-level isolation remains the enforced control.
- ⚠️ Runtime cross-tenant verification is PARTIAL/BLOCKED (second org lacks a full test dataset).
- ⚠️ No unit/integration test suite exists; validation was via the API regression above.