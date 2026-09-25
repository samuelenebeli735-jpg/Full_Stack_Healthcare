# SHMS Phase 3B — Task 5: Audit Immutability Report

**Date:** 2026-09-25
**Scope:** Make `AuditLog` append-only end-to-end — remove the one remaining write capability (super_admin hard-delete `DELETE /api/v1/audit/:id`), enforce delete/update denial at the PostgreSQL privilege layer, and prove that actor-lifecycle FK maintenance (`AuditLog.userId` `ON DELETE SET NULL`) and Task 1–4 behavior are fully preserved. Do NOT start Phase 3B Task 6.

## 1. Executive Summary

Phase 3A §12 flagged the last open audit concern: the `super_admin` could hard-delete audit rows via `DELETE /api/v1/audit/:id`, and the `shms_app` role held `UPDATE`/`DELETE` privileges on `AuditLog`. Phase 3B Task 5 (per the Phase 3A report's task ordering, item 5) closes this: the API delete path now returns a controlled **403** ("Audit log is append-only and cannot be deleted.") and the database-level privilege is revoked so no `shms_app` connection — with or without a tenant/RLO security context — can `UPDATE`, `DELETE`, `TRUNCATE`, or bulk-write `AuditLog`.

Enforcement is layered: app-layer (service guard), DB privilege layer (`REVOKE`), and pre-existing `FORCE` RLS. During implementation a first cut used **engine triggers** (`BEFORE UPDATE OR DELETE` + `BEFORE TRUNCATE`) as a second belt-and-suspenders layer; that design over-rotated: `prisma.user.delete()` on a user with audit history now emits `UPDATE "AuditLog" SET "userId" = NULL` (engine-side `ON DELETE SET NULL` maintenance), which the trigger aborted with `23514` — observed live when the Task-2 harness teardown crashed. The trigger layer was therefore **dropped** (migration 2) and the **`REVOKE`-only** contract retained, which binds the single application role (`shms_app`) regardless of RLS/GUC manipulation and does not interfere with owner-level or FK-maintenance writes. Verified 36/36 targeted checks plus the full regression battery; data-safety diff is audit-only; migrations applied (28/28).

## 2. Contract

- `AuditLog` is **append-only** for anything the application can do: no `UPDATE`, no `DELETE`, no bulk/many writes, no truncate, no tenant-scoped writes, no super_admin-scoped writes.
- The only privileged (super_admin) delete path is **removed**: `removeAuditLog` now unconditionally raises 403; route/validation wiring unchanged so no shape change reaches the client.
- `AuditLog_userId_fkey ... ON DELETE SET NULL` **remains effective**: deleting a user (actor deprovisioning, test teardown) is allowed and preserves every audit row, nulling only the linkage `userId`. This is the intended owner/FK-maintenance write and is the reason RLS/privilege denial must NOT also block it.
- RLS posture unchanged: `auditlog_tenant_policy AS (organization_id = app.organization_id())` with `FOR ALL`+`ENABLE`+`FORCE`; the app runs as `shms_app` (non-superuser, `rolbypassrls=false`).
- Trust boundary (documented, unchanged): the DB **owner / superuser** can still mutate audit rows (including a periodic archival/rotation job run by the operator). The requirement — removal of in-application hard-delete — is satisfied; "rotation window" behavior is delegated to the owner.

## 3. Root-Cause Analysis (verified by inspection)

### 3.1 The gap
Layout before Task 5 (all verified by inspection of schema + code):

- `src/routes/audit.route.js` exposed `DELETE /api/v1/audit/:id` (super_admin-guarded) → `audit.controller.js:remove` → `audit.service.js:removeAuditLog` → `audit.repository.js:deleteAuditLog` → `prisma.auditLog.delete()`.
- Grants: `shms_app` held `INSERT, SELECT, UPDATE, DELETE` on `AuditLog`; no engine trigger; RLS+FORCE active.
- No `UPDATE` product path exists (no audit.edit route/service) — delete was the sole mutation beyond append.

So a compromise of even the super_admin token (or any future code bug) could silently erase evidence. Multi-tenant report §12 explicitly listed "hard-delete removed or restricted to a rotation window" as deferred.

### 3.2 Why not the full engine-trigger design
Migration 1 installed `shms_auditlog_append_only()` + `BEFORE UPDATE OR DELETE` / `BEFORE TRUNCATE` triggers plus the `REVOKE`. Live failure observed during Task-2 harness teardown:

```
PrismaClientKnownRequestError: 23514: "AuditLog is append-only; rows cannot be updated or deleted."
  ... prisma.user.deleteMany ... violates the trigger shms_auditlog_append_only on UPDATE "AuditLog"
```

`AuditLog.userId` is `ON DELETE SET NULL`; the Prisma engine deletes a user by running `UPDATE "AuditLog" SET "userId" = NULL WHERE "userId" = $1`, which the row trigger aborted — so actor lifecycle teardown (Task 1–4 harnesses, future user deprovisioning, cascade maintenance) became impossible. Any engine-side write that touches audit rows would permanently wedge. This disproved the "add a DB belt" increment; the `REVOKE` alone is the correct boundary because it binds only the app role while owner/FK maintenance passes.

## 4. Solution Architecture & Rationale

### 4.1 API layer (guard first)
`audit.service.js:removeAuditLog()` — signature kept (controller still passes `(req.params.id, req.user)`; the args are ignored) — throws `new AppError("Audit log is append-only and cannot be deleted.", 403)`. The route/validation stay, so unauthorized, authorized, and malformed requests all receive the same controlled 403; there is no 500 path and no row is ever reached.

### 4.2 DB layer (REVOKE — the enforcement that binds)
Migration `20260925120000_auditlog_append_only` executed, as `shms_app`:

```sql
REVOKE UPDATE, DELETE ON TABLE public."AuditLog" FROM shms_app;
```

`REVOKE` is effective for the sole application role regardless of RLS row visibility or GUC (`app.bypass_rls`/$`app.organization_id`) manipulation — a tenant-scoped or super_admin-scoped attempt meets the privilege error before any policy runs. `TRUNCATE` needs table ownership (TRUNCATE cannot be granted) so it is already denied.

### 4.3 Contract correction migration
`20260925120001_auditlog_append_only_contract` dropped the two triggers and the helper function, keeping the `REVOKE`. Applied by the operator; final state `_prisma_migrations`: **28/28**.

### 4.4 Alternatives rejected
- **Full engine triggers (attempted, reverted)** — blocks FK `SET NULL` maintenance → `23514` on `user.delete*` (proven live).
- **App-only 403 without `REVOKE`** — leaves the DB privilege open to any future code path / SQL injection; not a defense in depth.
- **Row filters / `security_barrier` view in addition** — unnecessary once privilege is revoked; RLS permission checks remain unchanged.
- **Archival-rotation job + allowed delete window for `shms_app`** — adds an app-level escape hatch that contradicts "append-only"; rotation remains an owner responsibility (trust boundary).

## 5. Complexity, Memory & Performance

- One `AppError` throw (no DB work) on a path that previously did a single-row delete — strictly cheaper.
- `REVOKE` has no runtime cost; RLS+FORCE and per-insert checks are unchanged.
- No new index, table, cache, or background work. Zero unbounded state.

## 6. Network / Failure Modes / Recovery

- **Failure modes covered:** expired/absent/invalid token on the delete route (existing guards); authorized delete attempt (403); direct engine `auditLog.update/updateMany/delete/deleteMany` from `shms_app` (privilege error `P2010`); same under tenant scope and super_admin scope; `TRUNCATE` by app role (owner-only); actor deletion with audit history (allowed; row survives, `userId` nulled); audit append under load (concurrent appends all persisted).
- **Recovery:** nothing asynchronous; a failed delete-abort leaves no partial state; triggers removed so no engine write can wedge.
- **Observability:** every blocked delete returns 403 (no 5xx); appends continue to write `LOGIN`/`CREATE` events exactly as before (verified by distribution diff below). NBC-consistent: audit rows form an append-only event stream for later read-models.

## 7. Rollback Plan

1. Restore `audit.service.js` / `audit.repository.js` (reintroduce `removeAuditLog` body + `deleteAuditLog`) and restart. That alone restores the old API behavior.
2. To fully restore DB grant, run as owner:
   `GRANT UPDATE, DELETE ON TABLE public."AuditLog" TO shms_app;` (or `drizzle`/Prisma to push the pre-migration grant). No data is touched; no cast-of-schema.
3. Either `prisma migrate resolve`/revert the two migrations in the ordered inverse, or leave them as a recorded (reversible) policy change; plan provides the exact SQL above.

## 8. Files Changed (runtime)

| File | Change |
|---|---|
| `src/services/audit.service.js` | `removeAuditLog()` → unconditional `AppError(..., 403)` "Audit log is append-only and cannot be deleted."; `deleteAuditLog` import removed. |
| `src/repositories/audit.repository.js` | `deleteAuditLog` removed. |
| `prisma/migrations/20260925120000_auditlog_append_only/migration.sql` | `REVOKE UPDATE, DELETE ... FROM shms_app` + trigger function + 2 triggers (superseded by contract migration). |
| `prisma/migrations/20260925120001_auditlog_append_only_contract/migration.sql` | Drops both triggers + helper function; `REVOKE` retained (final contract). |

No controller/route/validation/schema change. Harness/artifacts (non-runtime): `.tmp/phase3b-task5-verify.mjs`, `.tmp/phase3b-task5-snapshot.mjs`, `.tmp/phase3b-task5-before.json`, `.tmp/phase3b-task5-after.json`, `.tmp/t5state-check.mjs`, `.tmp/t5clean-task2.mjs`, `.tmp/t5-sweep-clean.mjs`, `.tmp/t5-realign-counters.mjs`, `.tmp/t5-window-probe.mjs`. (Git baseline is heavily dirty from prior Phase-3B gates; Task-5 change surface limited to the rows above, verified by inspection.)

## 9. Verification

**Migration status: `20260925120000_auditlog_append_only` and `20260925120001_auditlog_append_only_contract` applied — `_prisma_migrations` = 28/28, last `20260925120001` `finished_at` set.** (shms_app cannot apply migrations — `SELECT`-only on `_prisma_migrations` and `REVOKE` requires table ownership — so the operator applied with the elevated URL, then `.env` restored to `shms_app`; confirmed before every suite.)

### 9.1 Targeted harness — `.tmp/phase3b-task5-verify.mjs` → **36/36 PASS**, live HTTP + real PostgreSQL, runtime `shms_app` / non-super / no bypass:

- **A** Append path intact: three-role login + `logAction` insert; marker count grows by exactly 1 per append; rows readable via super-admin; list/detail endpoints for admin and super_admin still 200.
- **B** Denial at the DB privilege layer: `update`, `updateMany`, `delete`, `deleteMany`, super_admin-scoped `update`/`delete`, and tenant-scoped `delete`/`updateMany` **all fail** (`P2010` privilege error). Row survives every attempt (`F1/F2`).
- **B9–B11** `information_schema.role_table_grants`: `shms_app` has `INSERT,SELECT` and **no** `UPDATE`/`DELETE` on `AuditLog`.
- **D** Actor-lifecycle preservation: fixture user + audit row created; **`user.delete` succeeds while the row survives**, `userId` nulled, `action`/`entity`/`createdAt`/description byte-identical. (Direct regression proof that FK `SET NULL` maintenance still works without the trigger.)
- **C** API super_admin / admin / student `DELETE /audit/:id` → **403** each, zero 5xx, row present and unchanged afterward.
- **E** Re-login appends new `LOGIN` rows (append path still live after enforcement).
- **G** 5 concurrent logAction appends — all persisted (append not serialized away).
- **H** Tenant separation with FORCE RLS: tenant-scoped query sees only its own org; unscoped (no GUC) = 0; super_admin global aggregate intact.
- **I** Append-only zero-loss: total audit rows only ever grew; fixture rows intentionally retained (never deleted by the harness).

### 9.2 Regression battery (fresh server per suite; rate-limiter reset; runtime gate re-checked)

| Suite | Result |
|---|---|
| Task 5 targeted `.tmp/phase3b-task5-verify.mjs` | **36/36 PASS** |
| HTTP regression `.tmp/regression.mjs` | **33/33 PASS** |
| Security/RLS `LT_BASE=... .tmp/loadtest/verify.mjs` | **RLS VERIFY OK (44/44)** |
| Task 1 light `.tmp/phase3b-task1-regression.mjs` | **14/14 PASS** |
| Task 3 timezone `.tmp/phase3b-task3-verify.mjs` | **52/52 PASS** |
| Task 4 queue `.tmp/phase3b-task4-verify.mjs` | **73/73 PASS** (its teardown deletes users with audit rows — completes cleanly) |
| Task 2 `.tmp/phase3b-task2-verify.mjs` | weekend window skew only (see 9.3); its teardown + counter reset now complete cleanly |

### 9.3 Task-2 harness — environmental caveat (NOT a regression)

Same Friday cassette as Task 4: the harness freezes its base to the **next Monday** (`2026-09-28`), outside `today..today+2` for Sat/Sun, so every booking 400s "only be booked up to 2 days ahead" and section F dereferences `appt.id` → FATAL. Proof booking works in-window today (`.tmp/t5-window-probe.mjs`): provisioned a Saturday schedule + student MR in babcock, booked `2026-09-26 10:00` (local, in-window, weekday-matching) → **appointment created** (`cmuh0tybb000lf7d8inifmgww`, `appointmentDate` 10:00 local) then all fixtures removed and counters re-aligned. Task-2 passed 37/37 in the Task-2/3 gates and re-runs green on a Mon–Thu base.

## 10. Runtime Security & Data Safety

- Runtime posture confirmed before each suite: `current_user=shms_app`, `rolsuper=false`, `rolbypassrls=false`; `AuditLog` RLS+FORCE=true; `AuditLog_userId_fkey` `confdeltype='n'` (SET NULL).
- Snapshots `.tmp/phase3b-task5-before.json` vs `.tmp/phase3b-task5-after.json`:

| Table | Before | After | Delta |
|---|---|---|---|
| user / profile / staff / medicalRecord / medicalRecordCounter / schedule / department / position / service / appointment / queue / consultation / prescription / prescriptionItem / notification / notificationPreference / organization | 20009 / 20003 / 2 / 14 / 3 / 0 / 10 / 10 / 15 / 0 / 0 / 0 / 0 / 0 / 0 / 0 / 15 | **identical** | **0** |
| auditLog | 569 | 743 | +174 |

- All deltas are **audit-log-only**: `LOGIN` +52, `MedicalRecord CREATE` +59, `Appointment CREATE/CANCEL/RESCHEDULE` +13/+1/+1, `Queue CHECKIN` +19, `AuditLog CREATE` +27 (append-only guard + fixture rows, now permanently retained by design), `User UPDATE` +2. Fixture artifacts from the failed-migration era (T5P/T2P/T2 rows: users, profiles, staff, MRs, schedules, dequeued appointments, dept/pos/svc) were swept with `.tmp/t5-sweep-clean.mjs` + `.tmp/t5clean-task2.mjs` in correct FK order once the trigger was dropped, and `MedicalRecordCounter.nextSeq` re-aligned to `max(recordSeq)` per org/year (3/9/2 — matches the Task-1 gate). Counts above prove pristine data tables.

## 11. Caveats / Follow-up (explicitly deferred)

- Task-2 harness date-fragility on weekends: documented, no code defect, pass expected Mon–Thu (see 9.3).
- Trust boundary: DB owner/superuser may still mutate `AuditLog` (archival/rotation). Any future need for constrained pruning should run as the owner, not `shms_app`; an in-app "rotation" API is intentionally out of scope for the append-only contract.
- Git state remains dirty from the cumulative hardening work; Task-5-only deltas are the four files in §8 (verified by inspection).
- Phase 3B Task 6 **NOT started** (this batch ends at Task 5).

## 12. Verdict

**ACCEPTED.** Audit hard-delete is removed at the API (403 for every role, zero 5xx) and the underlying capability is revoked at the database (`shms_app` no longer holds `UPDATE`/`DELETE` on `AuditLog`; `TRUNCATE` is owner-only), while actor-lifecycle `SET NULL` maintenance and Task 1–4 behavior are demonstrably preserved — including the live counter-proof that the rejected trigger design was wedging `user.delete*`. All 36 targeted checks pass; the full battery (33/33, 44/44, 14/14, 52/52, 73/73) is green or explained; migrations are applied (28/28); data safety is audit-only; runtime role and RLS posture are unchanged.

Server stopped after the run (port 5111 released).