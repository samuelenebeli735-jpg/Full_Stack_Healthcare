# SHMS Phase 3B — Task 2 Report: Appointment Slot Double-Booking Prevention

**Phase 3B, Task 2** — Prevent appointment slot double-booking (concurrent booking of the same staff member + overlapping time window) using the smallest reliable database-level serialization mechanism consistent with the existing architecture.

- Date: 2026-09-24
- Scope: `shms-backend` (Express + Prisma + PostgreSQL, RLS/tenant isolation in force)
- Task 3 has **NOT** been started.

---

## 1. Root cause

`createNewAppointment`, `rescheduleAppointment`, and `updateExistingAppointment` (staff/date-change branch) all perform the conflict check and the insert **inside the same interactive transaction** under PostgreSQL's default READ COMMITTED isolation (`src/services/appointment.service.js` → `validateScheduleAndConflict` → `findAppointmentsForStaffOnDate`). Two concurrent requests therefore both read "no conflict" (each other's uncommitted INSERT is invisible), both INSERT, and both COMMIT → the same staff member is double-booked. The existing overlap rule is `newStart < existingEnd && existingStart < newEnd` with `existingEnd = start + (service.estimatedDuration || 30) min`, ignoring `cancelled`/`no_show`.

## 2. Mechanism chosen (smallest + reliable)

**Transaction-scoped PostgreSQL advisory locks (`pg_advisory_xact_lock`)** keyed deterministically:

- `key1` = 32-bit **FNV-1a hash** of `"<organizationId>:<staffId>"` (stable across processes/restarts),
- `key2` = **local calendar day** (epoch days) of the appointment date.

Every request that books/reschedules a staff member on a given day acquires the lock on the **same transaction** that performs the conflict-check read and the write, so any two potentially-overlapping claims serialize deterministically: one wins; the loser blocks, then re-runs the existing overlap check, now sees the winner's **committed** row, and returns the existing **HTTP 409** (`AppError "Staff already has an appointment at this time."`). The lock is auto-released on COMMIT/ROLLBACK.

Why day-granularity is safe: any pair of appointments that can overlap necessarily shares `(org, staff, day)` regardless of variable `estimatedDuration`, so they can never compute different keys and both slip through. Different staff or different organizations derive different keys and never serialize (preserves throughput and isolation).

**Why it is the smallest reliable mechanism here:**
- No DDL, no new columns, no new tables → **no migration required** (explicitly confirmed below).
- No elevated DB privilege: `pg_advisory_xact_lock` is PUBLIC and works under the `shms_app` runtime role.
- Lock only touches (org, staff, day); range/status logic lives in the existing, already-correct conflict check that stays the single source of truth.
- Prisma ESM + interactive transactions: verified to work (advisory lock query must run as `$executeRawUnsafe`, see §10 note).

**Rejected alternative (for the report):** a range exclusion constraint (`EXCLUDE USING gist`) on `(staffId, tsrange)` — it requires the `btree_gist` extension (elevated privileges + a migration), a stored range column with backfill kept in sync with mutable `Service.estimatedDuration`, and cannot be modeled cleanly in the Prisma schema. Not used.

## 3. Code changes (only two runtime files)

| File | Change |
|---|---|
| `src/repositories/appointment.repository.js` | Added `fnv1a32()` (deterministic 32-bit FNV-1a) and `lockStaffDay(organizationId, staffId, appointmentDate, db)` which runs `SELECT pg_catalog.pg_advisory_xact_lock($1::int, $2::int)` on the passed interactive-transaction client. |
| `src/services/appointment.service.js` | Wired `lockStaffDay` into all three conflict-check paths, immediately before the existing `validateScheduleAndConflict`, on the same `withTenant(...)` transaction: `createNewAppointment` (when `staffId` present, line ~220), `updateExistingAppointment` (`assignedStaffId && (staffChanged || dateChanged)` branch, line ~326), `rescheduleAppointment` (when target `staffId` present, line ~773). Null-staff bookings are unaffected (no lock needed). |

No changes to `prisma/schema.prisma`, no new migration, no route/validation/controller changes.

## 4. No migration was required — confirmed

Migrations list unchanged: latest applied is `20260916020000_align_medical_record_counter_seed`, still 26/26. The fix is purely application-level advisory locking. (`migrations_count = 26`, `prisma migrate status` clean.)

## 5. Verification (concurrency harness)

Harness: `.tmp/phase3b-task2-verify.mjs` (provision fixtures → run tests → cleanup). Results **37/37 PASS**.

| Test | What it proves | Result |
|---|---|---|
| Preflight | runtime role `shms_app`, `rolsuper=false`, `rolbypassrls=false` | PASS |
| **A** (8 concurrent, same slot) | exactly **1** success, **7** controlled HTTP-409 conflicts, no duplicate row | PASS |
| **A-http** (end-to-end) | two real concurrent `POST /api/v1/appointments` (minted JWTs) → exactly one **201**, one **409** with the controlled conflict message | PASS |
| **B** | same staff, non-overlapping times → both succeed | PASS |
| **C** | different staff, same time → both succeed (keys differ) | PASS |
| **D** | different organizations → both succeed, each appointment stored in its own org (isolation) | PASS |
| **E** | variable duration: 10:00–10:45 vs 10:15–10:45 conflict (one 409); touching boundaries 10:00–10:30 vs 10:30–11:00 both valid | PASS |
| **F** | `cancelled` and `no_show` appointments do **not** block rebooking the slot | PASS |
| **G** | concurrent reschedules of two appointments to the same target slot → exactly one succeeds, loser 409 | PASS |
| **H** | RLS not weakened: babcock scope sees only babcock rows, covenant sees only covenant, no tenant scope fails closed (0 rows), cross-org reads return null | PASS |
| Cleanup | all fixtures removed, numbering counters restored exactly to Task-1 end-state (babcock 3 / covenant 9 / redeemer 2) | PASS |

Other suites (re-run after the fix, all green):
- Standard regression `.tmp/regression.mjs`: **33/33 PASS**
- RLS/security `.tmp/loadtest/verify.mjs`: **44/44 PASS** (`=== RLS VERIFY OK ===`)
- Task 1 light regression `.tmp/phase3b-task1-regression.mjs`: **14/14 PASS** (14 MRs intact byte-for-byte incl. redeemer ids `cmufb214g0005f7rofbx76p46`/`cmufb217k000bf7rondyrcb00`, babcock 3 / covenant 9 numbering in order, counters 3/9/2, RLS cross-read null, composite unique `(org, year, seq)` still enforced via a rolled-back duplicate insert).

## 6. HTTP 409 mapping verified end-to-end

The blocking loser surfaces as `AppError(statusCode=409)` which the existing error middleware maps to HTTP 409; the concurrent two-request HTTP test against the live server on port 5111 observed exactly `[201, 409]` with `"Staff already has an appointment at this time."` — no 500, no duplicate row.

## 7. Runtime security check (pre-flight)

- `SELECT current_user, rolsuper, rolbypassrls` → `shms_app`, `false`, `false`.
- `.env` uses the `shms_app` connection (no superuser/admin DSN; verified by the preflight and by `withSuperAdmin`-style reads returning RLS-filtered results).
- The super-admin `app.bypass_rls=true` + pinned `app.organization_id` fixture helper used by the harness is transaction-local (SET LOCAL semantics) and still enforces `WITH CHECK organizationId = app.organization_id` — even test tooling cannot write a row into a different organization.

## 8. Data safety — before/after diff

Snapshots: `.tmp/phase3b-task2-before.json` (pristine Task-1 end-state) vs `.tmp/phase3b-task2-after.json`.

| Model | Before | After | Delta |
|---|---|---|---|
| user / profile / staff / department / position / service / schedule / appointment / queue / consultation / prescription / prescriptionItem / notification / notificationPreference | 20009 / 20003 / 2 / 10 / 10 / 15 / 0 / 0 / 0 / 0 / 0 / 0 / 0 / 0 | identical | 0 |
| medicalRecord | 14 | 14 | 0 (Task-1 dataset untouched) |
| medicalRecordCounter | 3 (bab 3, cov 9, red 2) | restored to 3 (bab 3, cov 9, red 2) | 0 |
| auditLog | 64 | 109 | +45 (documented, see §9) |
| organization | 15 | 15 | 0 |

All fixture rows (`[T2]` services, `T2/S*` staff, `t2s.*@t2.shms.test` students, `T2/…` matric numbers) created during verification were deleted. The numbering counters were re-aligned to `max(recordSeq)` (last-allocated semantics matching the `20260916020000` alignment) so future numbering resumes exactly where Task 1 left off.

## 9. Audit deltas (expected by design, not errors)

Audit rows are never deleted (same convention as Task 1). The +45 rows:

- +24 `MedicalRecord CREATE` — fixture medical records created by the provisioning steps across the verification and debugging runs (records deleted; audit kept).
- +19 `Appointment CREATE` — one per successful booking in tests A–H (A 1, A-http 1, B 2, C 2, D 2, E1 1, E2 2, F 4, G 2, H 2).
- +1 `Appointment CANCEL` — F cancellation.
- +1 `Appointment RESCHEDULE` — G successful reschedule.

Note: `updateExistingAppointment`'s `UPDATE` audit write did not appear (a pre-existing silent audit-coverage gap; the status change itself is verified by the F test passing). Out of scope for this task; flagged for follow-up.

## 10. Notes / caveats

- Prisma cannot deserialize the `void` column returned by `SELECT pg_advisory_xact_lock(...)` via `$queryRawUnsafe`; the lock is issued with `$executeRawUnsafe` (executes fine, no column deserialization). Documented at `src/repositories/appointment.repository.js`.
- Advisory locks are session-scoped via the transaction (`pg_advisory_xact_lock`), so they never leak to the connection pool and are released on COMMIT/ROLLBACK — verified by the sequential tests (B/C) both succeeding after prior lock use.
- The 2-day student booking window and Mon–Fri schedule constraints were respected by computing test dates on a live weekday within the window.

## 11. How to reproduce

```
cd shms-backend
PORT=5111 node src/server.js                 # start API (new code)
node .tmp/phase3b-task2-snapshot.mjs before  # pristine snapshot
node .tmp/phase3b-task2-verify.mjs           # provisions fixtures, runs A–H, cleans up
node .tmp/phase3b-task2-snapshot.mjs after   # post snapshot, diff against before
node .tmp/regression.mjs                     # 33/33
LT_BASE=http://127.0.0.1:5111/api/v1 node .tmp/loadtest/verify.mjs  # 44/44
node .tmp/phase3b-task1-regression.mjs       # 14/14
```

## 12. Status

- **Implementation:** complete (2 files, no migration).
- **Verification:** Task 2 harness 37/37, regression 33/33, RLS/security 44/44, Task-1 light regression 14/14 — all PASS.
- **Migrations:** none required (26/26 unchanged).
- **Data safety:** all counts restored to Task-1 end-state; only documented audit-log deltas remain.
- **Runtime role:** `shms_app`, non-superuser, RLS enforced, no superuser DSN in `.env`.
- **Task 3:** NOT started (per instructions).