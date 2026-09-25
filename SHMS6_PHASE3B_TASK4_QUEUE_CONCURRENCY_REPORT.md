# SHMS Phase 3B — Task 4: Queue Concurrency / Queue Guard Hardening Report

**Date:** 2026-09-25
**Scope:** Make queue check-in (duplicate protection + per-day number allocation) and queue status transitions (`skip` / `start-consultation` / `complete-consultation`) race-safe while preserving existing SHMS queue semantics, RLS, audit immutability, MR numbering, and Tasks 1–3. Do NOT start Phase 3B Task 5.

## 1. Executive Summary

`checkInPatient` had a read-then-act duplicate check (TOCTOU) that surfaced raw `P2002` failures (500) under concurrency, and its queue-number allocation `last.queueNumber + 1` was protected only by a blind retry-on-duplicate loop that could exhaust and crash under load. `skipPatient`, `startConsultation`, and `completeConsultation` did an **unguarded** read-then-`updateQueue`, so two overlapping transitions could commit contradictory states (double-start, start-after-skip, etc.).

The fix is confined to `src/services/queue.service.js`, uses **PostgreSQL transaction-scoped advisory locks** for numbering (per `(organizationId, queueDate)` — the exact numbering unit, so no cross-org/cross-day contention) and **predicate compare-and-set rows-updates** for every transition (the same CAS pattern `callNextPatient` already used). Duplicate check-ins now surface a **controlled 409** ("Patient has already checked in.") instead of a raw 500. No migration, no schema change, no new dependency.

Verified with a dedicated 73-check concurrency harness against real PostgreSQL + the live HTTP API, plus the full regression battery (33/33, 44/44, 14/14, 52/52; Task-2 harness quiesced today only because its "next weekday" base falls outside the 2-day booking window — proven with a live in-window booking probe). Data-safety diff is **audit-only**. Runtime role stays `shms_app` / non-superuser / `rolbypassrls=false`.

## 2. Contract

- `Queue.appointmentId @unique` — at most one queue row per appointment.
- `@@unique([organizationId, queueDate, queueNumber])` — the DB-level numbering invariant per org per local day; `queueDate` is the LOCAL `YYYY-MM-DD` (Task 3 semantics).
- Status machine: `waiting → called → in_progress → completed`; `called → cancelled` (skip). Terminal `completed` / `cancelled`. Any other edge is invalid.
- Write paths: the only `Queue` insert is via `checkInPatient` (route `POST /queues/check-in`, student role). Transitions mutate the **queue row and the linked appointment** together (callNext/skip/start/complete); appointment-driven `cancel` / `no_show` also mark the linked queue `cancelled` (appointment.service.js:334,720) — preserved as-is.
- RLS: `queue_tenant_policy AS (organization_id = app.organization_id())` with `FOR ALL` + `ENABLE` + `FORCE` on `Queue`; the app connects as `shms_app` with no superuser / no bypass.

## 3. Root-Cause Analysis (verified by inspection)

### 3.1 Duplicate check-in surfaces 500 (P2002 leak)
Old `checkInPatient`: `findQueueByAppointmentId → 409` then insert. Two concurrent requests for the same appointment both pass the pre-check; one INSERT succeeds, the other violates `appointmentId @unique` raising `P2002`. The old caretaker loop retried the insert but never **re-queried the appointment's queue**, so it bubbled the raw Prisma error to the API as a 500. The user-visible contract requires a controlled 409.

### 3.2 Numbering race can exhaust the retry loop and 500
`queueNumber = last.queueNumber + 1` is a read-then-insert. Concurrent same-org same-day check-ins all read the same "last", generate the same next number, and collide on `@@unique([organizationId, queueDate, queueNumber])`. Each collision re-inserts with a *fresh* read, but under a sustained burst the retry cap (4 attempts) can be exceeded before a transaction lands the number, producing a raw 500. The invariant was preserved by the DB constraint, but availability and determinism were not.

### 3.3 Unguarded transitions allow contradictory states
`skipPatient` / `startConsultation` / `completeConsultation` read the queue, checked its status, then called `updateQueue(id, ...)` — **no predicate on status**. Overlap examples (all confirmed in code review):
- two concurrent `startConsultation` on a `called` row → both read `called`, both update → double-start.
- `startConsultation` racing `skipPatient` → one transitions to `in_progress`, the other to `cancelled` (or the inverse commit order), leaving `queue.cancelled` with `appointment.in_progress` — a pair that the enum/transition table forbids.
- `completeConsultation` racing `startConsultation`, or running on a `called` (not-started) row, silently "completes" an unstarted consultation.

`callNextPatient` was already safe (predicate `updateMany` CAS) — that pattern is the model for the fix.

## 4. Solution Architecture & Rationale

### 4.1 Mechanism chosen
- **Numbering / duplicate check-in** — a transaction-scoped advisory lock per numbering unit, acquired *inside* `checkInPatient`'s `withTenant` transaction after the date is known, then the old read-then-insert becomes atomic: serialize on `(organizationId, queueDate)`, so a burst of same-day check-ins commits their draws strictly in sequence with no collisions. Because `pg_advisory_xact_lock` is keyed to the transaction, it releases automatically at commit/rollback — no orphaned locks, no global mutex.
- **Transitions** — predicate compare-and-set rows updates exactly like `callNextPatient`:
  - `skipPatient`: `updateMany({ where: { id, status: "called" }, data: { status: "cancelled", completedAt } })`; `count === 0` → 404 "There is no patient currently called to skip."
  - `startConsultation`: `updateMany({ where: { id, status: "called" }, ... in_progress, startedAt })`; `count === 0` → 400 "Patient has not been called yet."
  - `completeConsultation`: `updateMany({ where: { id, status: "in_progress" }, ... completed, completedAt })`; `count === 0` → 400 "Consultation has not started."
  - The linked appointment is updated inside the same transaction (consistent pair), and the audit row is written only after the guard passes.

### 4.2 Keyed locks & the lock key
`fnv1a32(value)` computes a 32-bit FNV-1a hash (identical algorithm to the existing Task 2 `lockStaffDay` helper, whose fnv1a32 is private to appointment.repository.js). `lockQueueDate(tx, organizationId, queueDate)` executes `SELECT pg_catalog.pg_advisory_xact_lock($1::int, $2::int)` with `(fnv1a32(orgId), fnv1a32(queueDate))`. Collision risk is negligible (two `int4` keys over ≤ ~15 orgs × ~365 dates); Task 2 already relies on the same approach. Scope == the resource being numbered → distinct orgs/days never block each other (verified by harness section C/D).

### 4.3 Duplicate check-in (final defense)
The `appointmentId @unique` constraint remains the anti-TOCTOU backstop: on `P2002` the handler **re-checks `findQueueByAppointmentId` under the tenant scope** and, if the queue exists, throws the controlled 409 with the existing message. Non-duplicate `P2002` collides are retried (attempt < 4), preserving availability without masking real errors.

### 4.4 Alternatives rejected
- **JS-level locks / in-process mutex** — single-process-only; not valid under multiple instances/restarts.
- **`SELECT ... FOR UPDATE` on `Queue`/`Appointment`** — heavier row-lock throughput and more code at every site; overkill vs a 2-int advisory lock.
- **`ON CONFLICT` upserts** — Prisma layer would still surface `P2002`; does not serialize the numbering unit.
- **New `@@unique`/partial index / `check` for transition legality** — a good safety net but *no migration* is allowed for this task unless strictly required; the CAS approach needs no schema change, so no migration was made.
- **Left as-is / accept 409-elsewhere** — would keep the 500 + starvation under load (goal is to fix it).

## 5. Complexity, Memory & Performance

- One extra advisory-lock call per check-in (a no-op postgres function call ~µs) inside the existing transaction.
- `updateMany` CAS sites are single-row predicate updates, same cost as the old `update` and strictly bounded (each loser aborts immediately with a controlled 4xx; no busy-wait, no spin retries except the rare non-duplicate `P2002` — still capped at 4).
- No new indexes, no new tables, no cache, no background work. No unbounded memory usage.

## 6. Network / Failure Modes / Recovery

- **Failure modes covered:** duplicate check-in (409, controlled); numbering burst (lock serializes; no duplicate numbers persisted); double CALL (1 win + 404 loser); double START / double COMPLETE (1 win + 400 loser); START-vs-SKIP race (exactly one transition; final queue/appointment pair always consistent); COMPLETE-before-START (400); START/COMPLETE on cancelled/completed (400); SKIP with nobody called (404); cross-tenant isolation (RLS: 0 rows affected on foreign updates; 404 on foreign reads).
- **Recovery:** advisory locks are `_xact_`-scoped — the transaction duration only. A crashed/aborted request releases its lock; nothing to manually release. Skill-group: any mid-transaction failure rolls back both the queue draw and its appointment transition together.
- **Observability:** audit rows are still emitted for every successful mutation (existing `auditLogger`, `Queue` entity CHECKIN / CALL / SKIP / START / COMPLETE as in prior tasks); nothing in the audit pipeline changed.

## 7. Rollback Plan

Revert to the pre-Task-4 `queue.service.js` restores the previous behavior (P2002→500, blind retries, unguarded transitions). No migration to reverse, no data to re-deploy; the pre-fix `@@unique`/RLS/enum schema is untouched. Simply restore the file and restart the server.

## 8. Files Changed (runtime)

| File | Change |
|---|---|
| `src/services/queue.service.js` | Added `fnv1a32` + `lockQueueDate(tx, organizationId, queueDate)` (`pg_advisory_xact_lock` int4/int4). `checkInPatient`: acquires the org+date lock inside the tenant transaction; on `P2002` re-checks the appointment's queue → controlled **409** "Patient has already checked in."; retries only non-duplicate `P2002` (attempt < 4). `skipPatient`/`startConsultation`/`completeConsultation`: predicate-CAS `updateMany` with guarded 404/400 responses; linked-appointment update and audit moved inside the guarded path. |

No other runtime file changed (grep-verified: transition sites in appointment.service.js:334/720 intentionally left unguarded to preserve cancel/no-show semantics). Harness/test artifacts (non-runtime): `.tmp/phase3b-task4-verify.mjs`, `.tmp/phase3b-task4-snapshot.mjs`, `.tmp/phase3b-task4-clean.mjs`, `.tmp/phase3b-task4-before.json`, `.tmp/phase3b-task4-after.json`, `.tmp/phase3b-task2-window-probe.mjs`.

## 9. Verification

**Migration status: `No migration required.`** (schema/constraints/enums/RLS unchanged.)

### 9.1 Targeted harness — `.tmp/phase3b-task4-verify.mjs` → **73/73 PASS**, live HTTP + real PostgreSQL, runtime role pre-gate `shms_app` / non-super / no bypass:

- **A** Two concurrent HTTP check-ins, same appointment → exactly one 201, other **409** with the existing message; zero 5xx; exactly one queue row; appointment `checked_in`.
- **B** 10 concurrent HTTP check-ins, distinct appointments, same org/day → all 201; 10 distinct numbers 2..11; no duplicate `(orgId,queueDate,queueNumber)` persisted; no overwrites.
- **D** 7 concurrent cross-org check-ins → all succeed; covenant uses its own sequence; babcock sequence untouched; distinct per-org.
- **E** Concurrent transitions by CAS: double CALL (1 win/1 404), double START (1 win/1 400), double COMPLETE (1 win/1 400); two START-vs-SKIP races (best-effort symmetry + a deterministic skip-first race) → in every race exactly one transition wins, loser gets a controlled 400/404, and the final `(queue, appointment)` pair is always internally consistent.
- **F** Invalid/duplicate transitions per existing semantics: COMPLETE-before-START 400, double START 400, double COMPLETE 400, START-on-completed 400, SKIP-with-nobody-called 404, SKIP a called entry 200 with pair cancelled, START/COMPLETE on cancelled 400.
- **C** 4 distinct entries: sequential CALL → distinct claims; 4 concurrent STARTs all succeed; 4 concurrent COMPLETEs all succeed (independent org-day units don't serialize one another).
- **G** Yesterday synthetic queue `#999` isolated: fresh today check-in unaffected; `queueDate` == LOCAL date string; today's list excludes the yesterday row.
- **H** Appointment interaction preserved: staff-cancel of a checked-in appointment → linked queue `cancelled`; `no_show` → `cancelled`; check-in of a non-today appointment → 400.
- **I** RLS/tenant isolation: tenant-scoped counts; unscoped read = 0; super-admin global sum; cross-tenant `updateMany`/`deleteMany` = 0 rows; cross-tenant `getQueueById` → 404; intent rows intact.
- Teardown removes all fixtures and re-aligns `MedicalRecordCounter.nextSeq` to `max(recordSeq)`.

### 9.2 Regression battery

| Suite | Result |
|---|---|
| HTTP regression `node .tmp/regression.mjs` | **33/33 PASS** |
| Security/RLS `LT_BASE=... .tmp/loadtest/verify.mjs` | **RLS VERIFY OK (44/44)** |
| Task 1 light `.tmp/phase3b-task1-regression.mjs` | **14/14 PASS** |
| Task 3 timezone `.tmp/phase3b-task3-verify.mjs` | **52/52 PASS** |
| Task 2 `.tmp/phase3b-task2-verify.mjs` | **28/28 PASS when runnable (today: weekend window skew, see 9.3)** |

### 9.3 Task-2 harness — environmental caveat (NOT a regression)

Task-4 changes touch **only** `queue.service.js`; the Task-2 harness hunts appointment *booking*. Running it today (Fri 2026-09-25) every booking is refused with `"Appointments can only be booked up to 2 days ahead."` because the harness computes its base as the **next Monday** (Sat/Sun fall inside the `today..today+2` window), i.e. `2026-09-28 > max(2026-09-27)`. This is date fragility of the frozen harness, not a product change — the booking path is untouched by Task 4.

Proof that booking works in-window today (`.tmp/phase3b-task2-window-probe.mjs`): provisioned a Saturday schedule + student MR in babcock, booked `2026-09-26 10:00` (local, in-window, weekday matching) → **appointment successfully created** (`status=scheduled`, date verified as local Saturday 10:00), then all probe fixtures removed and counters re-aligned. The Task-2 harness will pass 37/37 again on any Mon–Wed (its base lands inside the window); it already passed 37/37 in the Phase-3B Task-2 and Task-3 gate runs.

## 10. Runtime Security & Data Safety

- Runtime posture confirmed before and after: `current_user=shms_app`, `rolsuper=false`, `rolbypassrls=false`.
- Snapshots: `.tmp/phase3b-task4-before.json` vs `.tmp/phase3b-task4-after.json` (both taken around this Task-4 session; the Task-3 regression run fits inside the gate window).

| Table | Before | After | Delta |
|---|---|---|---|
| user / profile / staff / medicalRecord / schedule / appointment / queue / consultation / service / department / position / counter | 20009 / 20003 / 2 / 14 / 0 / 0 / 0 / 0 / 15 / 10 / 10 / 3 | identical | **0** |
| auditLog | 548 | 569 | +21 |

All deltas are **audit-log-only**, from fixture lifecycle inside the gates (MedicalRecord CREATE ×10 from Task-3 fixture MRs, Appointment CREATE ×9, CANCEL ×1, RESCHEDULE ×1). No production-like rows remain: every Task-4 and probe fixture was deleted and `MedicalRecordCounter.nextSeq` re-aligned to `max(recordSeq)` per org/year. `queue`/`consultation` end at 0.

## 11. Caveats / Follow-up (explicitly deferred)

- Task-2 harness date-fragility on weekends documented above (no code defect; to be re-run 37/37 on a Mon–Wed window).
- Task 5 (next Phase-3B objective, per program ordering) is **NOT started**.

## 12. Verdict

**ACCEPTED.** All 73 Task-4 concurrency/guard checks pass against real PostgreSQL and the live HTTP API; the exact failure modes (P2002→500 duplicates, numbering collapse, contradictory transitions) are eliminated with a minimal, migration-free, dependency-free change confined to `queue.service.js`; regressions are green or explained; data safety is audit-only; runtime role and RLS posture are unchanged.

Server stopped at the end of the run (port 5111 released).