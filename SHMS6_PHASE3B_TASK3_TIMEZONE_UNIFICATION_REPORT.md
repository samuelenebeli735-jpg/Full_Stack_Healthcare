# SHMS Phase 3B — Task 3: Timezone Unification & Schedule/Slot Correctness Report

**Date:** 2026-09-24
**Scope:** Unify the timezone interpretation of schedules, available-slot generation, booking, and rescheduling across the deployment runtime's LOCAL timezone (clinic wall-clock). Do NOT start Phase 3B Task 4.

## 1. Problem

Available-slot generation was the only subsystem that decoded stored timestamps using **UTC** getters while every other path (schedule validation, booking conflict checks, cancellation/reschedule windows, queue day windows, dashboard, the Task 2 advisory-lock day key, and the frontend encode/decode round-trip) uses the **runtime LOCAL** timezone.

Concretely, `getStaffAvailableSlots` in `src/services/appointment.service.js`:

```js
// OLD (buggy) — UTC decode, shifted by the server's UTC offset.
minutesOfDay  = date.getUTCHours() * 60 + date.getUTCMinutes();
dayDate       = new Date(date + "T00:00:00.000Z");
dayOfWeek     = DAY_NAMES[dayDate.getUTCDay()];
endOfDay.setUTCHours(23, 59, 59, 999);
```

On a `West Africa Time` (UTC+1) server, a schedule created by the frontend as "LOCAL 08:00" is stored as `07:00Z`. The UTC decoder re-read that as "07:00", producing:
- slot labels shifted an hour earlier (`07:00` instead of `08:00`),
- wrong weekday `date.getUTCDay()` vs local `date.getDay()` (off by one whenever offset crosses a day boundary),
- busy-window queries bounded by UTC midnight instead of local midnight (day bleed).

`validateSchedule` (`src/utils/scheduleValidator.js`) was already LOCAL and forced the 30-minute service duration; the slots endpoint is what fed the UI.

## 2. Contract (defined)

The whole product runs on the **deployment machine's LOCAL timezone = clinic wall-clock**:

- `YYYY-MM-DD` strings are local calendar dates.
- Schedule `startTime/endTime/breakStart/breakEnd` and `appointmentDate` are UTC `Z` instants produced by the frontend from local wall-clock (`new Date(date+'T'+time).toISOString()`), displayed via LOCAL getters (`_splitDateTime`).
- Slot labels (`HH:MM`) are local wall-clock strings the frontend reassembles into a local `Date`.
- Decoding is therefore always done with LOCAL getters.

Evidence sources:
- `shms-frontend/shms/js/api.js`: schedule create (~665-676), booking (~396-400), reschedule (~449-455) all build `new Date(...).toISOString()`; display `_splitDateTime` (81-90) uses LOCAL getters.
- `src/utils/scheduleValidator.js` decodes with LOCAL `getDay()` / `getHours()*60+getMinutes()`.
- `findAppointmentsForStaffOnDate`, Task 2 `lockStaffDay` day key, queue windows, dashboard, booking window: all LOCAL.
- No `TZ`/`TIMEZONE` env override anywhere (`src/config/env.js`, `.env`, `.env.example`); no date library in `package.json`/`package-lock`.
- Runtime confirmed `West Africa Time`, `getTimezoneOffset() = -60`.

## 3. Fix (smallest change, production-safe)

Confined to `getStaffAvailableSlots` in `src/services/appointment.service.js` — the only UTC/local split. No migration, no new dependency, no schema change:

| Location | Old | New |
|---|---|---|
| `minutesOfDay()` helper | `getUTCHours()*60 + getUTCMinutes()` | `getHours()*60 + getMinutes()` (LOCAL) |
| `dayDate` construction | `new Date(date + "T00:00:00.000Z")` | `new Date(date + "T00:00:00")` (LOCAL midnight) |
| `dayOfWeek` | `DAY_NAMES[dayDate.getUTCDay()]` | `DAY_NAMES[dayDate.getDay()]` |
| `endOfDay` | `.setUTCHours(23,59,59,999)` | `.setHours(23,59,59,999)` |

`startOfDay` is derived from `dayDate`, so it inherits the LOCAL midnight automatically. `node --check` passes; no `getUTC*/setUTC*`/`T00:00:00.000Z` remain in the file (grep-verified). `report.service.js:19` (`toISOString().slice(0,10)`) is report-scoped and intentionally untouched.

## 4. Verification

### 4.1 Timezone unification harness — `.tmp/phase3b-task3-verify.mjs` → **52/52 PASS**

Runtime background: `West Africa Time`, offset -60min. Fixtures provisioned per-org (Babcock + Covenant) with `withBypassOrg`, frontend-equivalent encoding (`local wall-clock → .toISOString()`), counters re-aligned to `max(recordSeq)` after cleanup.

- **A** Normal day: 08:00–16:00 → exactly 16 × 30-min slots, labels `08:00..15:30`.
- **B** Boundaries: first slot = schedule start; last slot ends exactly at schedule end; no slot begins at/before end.
- **C** Break 12:00–13:00: 12:00/12:30 unavailable; 11:30 and 13:00 available.
- **D** Date consistency: same `YYYY-MM-DD` is interpreted identically by `validateSchedule` and slots.
- **F** UTC/local regression (the crux): schedule stored as `07:00Z` (local 08:00) → slots report `08:00`, NOT `07:00`. The old code would have emitted `07:00`.
- **G** Booking: stores the intended local wall-clock instant (`10:00` local == frontend-equivalent `toISOString()`); slot flipped to taken.
- **H** Reschedule: timestamp decodes LOCAL `09:30` same day; new slot taken, vacated slot freed.
- **E** Midnight boundaries: late slot (15:30, ends 16:00) taken on its day; `16:00` rejected (`>= endMinutes`); next day unaffected (no UTC-midnight bleed); weekday-by-LOCAL matches schedule.
- **I** Conflict behavior unchanged: overlap 409, touching OK, cancelled frees slot, no-show frees slot.
- **J** Task 2 preservation: 6 concurrent same-slot → exactly 1 success, 5 × 409.
- **K** Cross-org: simultaneous Babcock + Covenant bookings both OK, each stored in own org.
- **L** RLS: tenant scope sees own rows only; unscoped read = 0; cross-org read = null.
- Runtime role gate: `current_user=shms_app`, `rolsuper=false`, `rolbypassrls=false`.

### 4.2 Regression battery (nothing regressed)

| Suite | Result |
|---|---|
| HTTP regression `node .tmp/regression.mjs` | **33/33 PASS** |
| Security/RLS `LT_BASE=... .tmp/loadtest/verify.mjs` | **44/44 PASS** |
| Task 1 light regression `.tmp/phase3b-task1-regression.mjs` | **14/14 PASS** |
| Task 2 concurrency `.tmp/phase3b-task2-verify.mjs` | **37/37 PASS** |
| z before/after sink: no unexpected 5xx during suites | OK |

## 5. Runtime Security & Data Safety

- Preexisting runtime posture confirmed before and after: runtime DB role `shms_app` is non-superuser with `rolbypassrls=false`; app connects through the RLS-enabled pool.
- Snapshots: `.tmp/phase3b-task3-before.json` (119 audit rows) vs `.tmp/phase3b-task3-after.json` (252 audit rows).

| Table | Before | After | Delta |
|---|---|---|---|
| user / profile / staff / medicalRecord / schedule / appointment / queue / service / department / position / counters | 20009 / 20003 / 2 / 14 / 0 / 0 / 0 / 15 / 10 / 10 / 3 | identical | 0 |
| auditLog | 119 | 252 | +133 |

All deltas are **audit-log-only**, from fixture lifecycle across harness executions (MedicalRecord CREATE from fixture MRs, Appointment CREATE/CANCEL/RESCHEDULE from the fixture bookings/conflicts, User LOGIN from regression suites) — the same documented, never-deleted policy used in Phase 3B Tasks 1 & 2. No production-like rows remain: fixture staff/schedules/services/students/MRs are removed, and `MedicalRecordCounter.nextSeq` is re-aligned to `max(recordSeq)` (last-allocated semantics) per org/year.

Between the Task 2 gate and this run, 10 additional `User LOGIN` audit rows appeared with no data-table changes (out-of-scope activity between gates; audit-only).

## 6. Files Changed (runtime)

| File | Change |
|---|---|
| `src/services/appointment.service.js` | `getStaffAvailableSlots`: LOCAL decode of minutes-of-day, weekday, and day bounds (4 edited sites + helper comment). |

Harness/test artifacts (non-runtime): `.tmp/phase3b-task3-verify.mjs`, `.tmp/phase3b-task3-snapshot.mjs`, `.tmp/phase3b-task3-before.json`, `.tmp/phase3b-task3-after.json`.

## 7. Verdict

**ACCEPTED.** All 52 timezone-unification checks pass on a UTC+1 runtime, all prior gates remain green (33/33, 44/44, 14/14, 37/37), data safety is audit-only, and the runtime keeps its non-privileged RLS-bound posture. The UTC/local split in available-slot generation is eliminated with a minimal, migration-free, dependency-free change.

Server stopped at the end of the run (port 5111 released).