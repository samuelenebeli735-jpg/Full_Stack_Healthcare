# SHMS6 — Phase 3B Task 1: Medical-Record Numbering Fix — Implementation & Verification Report

**Date:** 2026-09-24
**Scope:** Phase 3B, Task 1 only — resolve the High-severity medical-record number collision.
**Out of scope (explicitly NOT touched):** appointment slot serialization, timezone handling, queue rules, audit immutability, notifications, frontend, analytics, AI, auth/session, and any unrelated security surface. No broad refactor was undertaken.

---

## 1. Root cause

`MedicalRecord.recordNumber` was declared `@unique` (globally unique) in the schema, while numbering is generated per **organization** and per **year**:

```
MR-<year>-<6-digit sequence>
```

The old algorithm (`src/services/medical-record.service.js`) computed the sequence as `count(records for year) + 1` and retried on a `P2002` (unique-violation) error up to 5 times.

Two independent failure modes made this unresolvable:

1. **Cross-organization collision.** Two different organizations both starting their first record of a year both compute the sequence `1` → both attempt `MR-2026-000001`. The *second* insert violates the global unique constraint.
2. **The retry could never help.** RLS hides every other tenant's rows, so the colliding org `count` stays `0` and the same number is regenerated forever. The retry loop is therefore ineffective for the exact case it was designed for.

The uniqueness constraint was on the wrong column: it enforced **global** uniqueness of a **per-tenant + per-year** number.

## 2. Adopted numbering strategy

- The **numbering unit is (organization, year)**, matching production intent: each organization restarts its sequence every year.
- Uniqueness is enforced in the database from relational columns only:

```
UNIQUE (organizationId, recordYear, recordSeq)
```

- `recordNumber` is now a **plain (non-unique) formatted display string**; the same formatted number may legitimately exist in different organizations for the same year. `recordSeq` is the canonical ordinal; the composite unique index is the backstop against any reuse, regardless of how the counter is reset.

## 3. Concurrency strategy (database-backed)

A new per-(organization, year) counter table reserves the next sequence **atomically inside the tenant transaction**:

```sql
INSERT INTO "MedicalRecordCounter" ("id","organizationId","recordYear","nextSeq","createdAt","updatedAt")
VALUES (gen_random_uuid()::text, $1, $2, 1, now(), now())
ON CONFLICT ("organizationId","recordYear")
DO UPDATE SET "nextSeq" = "MedicalRecordCounter"."nextSeq" + 1, "updatedAt" = now()
RETURNING "nextSeq";
```

- Concurrent creators in the same (org, year) are serialized on the counter's unique-index row lock: exactly one request performs the fresh insert (sequence 1), every other request blocks and then performs the `DO UPDATE`, receiving a strictly increasing value. **No two concurrent requests can ever receive the same sequence.**
- The counter stores the **last-allocated sequence** (`nextSeq` after N records = N; the next allocation is `nextSeq + 1`). This invariant is what the seed alignment migration reproduces.
- The counter table enforces **RLS + FORCE RLS** on its own `organizationId` column, matching every other tenant table, so counters for different organizations are invisible to each other and the numbering cannot leak across tenants.

## 4. Schema changes

**`MedicalRecord`**
- Added `organizationId TEXT NOT NULL` (FOREIGN KEY → `Organization`, RESTRICT/CASCADE).
- Added `recordSeq INTEGER NOT NULL`.
- Removed `recordNumber @unique` (now a plain index-free formatted string).
- Added `@@unique([organizationId, recordYear, recordSeq])` and `@@index([organizationId])`.

**`MedicalRecordCounter`** (new)
- `id, organizationId, recordYear, nextSeq (default 1), createdAt, updatedAt`
- `@@unique([organizationId, recordYear])`, FK → `Organization`; RLS policy (identical shape to the other tenant tables) + `ENABLE`/`FORCE ROW LEVEL SECURITY`; DML granted to `shms_app`.

## 5. Migrations (both applied; 26/26)

| Migration | Purpose |
|---|---|
| `20260916010000_fix_medical_record_numbering` | Add + backfill `organizationId`/`recordSeq`; **deterministic trailing-digit extraction** (`substring(recordNumber FROM '([0-9]+)$')` — handles both the `REC-<...>` and `MR-<year>-<seq>` formats); `SET NOT NULL`; drop `MedicalRecord_recordNumber_key`; create composite unique index; create counter table + seed (`nextSeq = max(recordSeq)+1`); RLS/FORCE policy + grant. |
| `20260916020000_align_medical_record_counter_seed` | Align seeded counters to the app's **last-allocated** invariant (`nextSeq = max(recordSeq)`), so the first app-created record in a pre-seeded (org, year) is contiguous (Redeemer counter 3 → 2). |

No existing rows were deleted or rewritten; both migrations are deterministic and reproducible on a fresh deployment.

## 6. Existing data impact

At migration time the database held exactly **2** medical records, both Redeemer:

| recordNumber | year | recordSeq (derived) |
|---|---|---|
| `REC-RUN/TEST/001` | 2026 | 1 |
| `REC-RUN/TEST/002` | 2026 | 2 |

Both were backfilled via the `Profile → User` chain; numbers and years preserved verbatim.

## 7. Targeted verification — A–G (25/25 PASS)

- **A — existing behavior preserved:** both pre-existing records readable; numbers `REC-RUN/TEST/001`/`002`, year 2026, seq 1/2, org Redeemer.
- **B — cross-org independence:** Babcock and Covenant each created their first 2026 record — **both persisted as `MR-2026-000001`** with distinct ids, seq 1, in their own org. (Previously the second insert failed with `P2002`.)
- **C — same-org uniqueness:** two more Babcock records → `MR-2026-000002`, `MR-2026-000003`; distinct sequences.
- **D — concurrency:** 8 parallel creates in Covenant (after step B consumed seq 1) → all succeeded with **distinct** records, sequences `2..9` (contiguous, no duplicates, no errors). No two parallel requests received the same number.
- **E — RLS isolation:** Babcock sees exactly its 3; Covenant exactly its 9; Redeemer exactly its 2; bare (no scope) query returns **0**; each org cannot see the counterpart org's `MR-2026-000001`; counters are scoped per org (1 row each) and store last-allocated seq (Babcock 3, Covenant 9); Redeemer counter = 2 after seed alignment.
- **F — full regression + security suites:** see §8.
- **G — data safety:** see §9.

## 8. Regression & security (F)

- **Regression suite:** **33/33 PASS** (API; includes `medical-records/me` student 200, list staff/superadmin 200, staff-on-student-route 403).
- **RLS / security suite:** **44/44 PASS**, including `partition medicalRecord: sum(14) == global(14)` (each org only sums its own records) and the full cross-tenant read/update/delete isolation matrix.

## 9. Before/after data-safety comparison (G)

Captured via `.tmp/phase3b-before.json` / `.tmp/phase3b-after.json` (entire table count snapshot + Redeemer content fingerprint):

| Table | Before | After | Δ |
|---|---|---|---|
| `medicalRecord` | 2 | 14 | **+12** (12 new test records created by the verification harness) |
| `medicalRecordCounter` | 1 | 3 | **+2** (new per-org counters for Babcock and Covenant) |
| `auditLog` | 46 | 58 | **+12** (one `CREATE MedicalRecord` audit row per create) |
| all other tables (`user` 20009, `profile` 20003, `organization` 15, …) | — | — | **no change** |

Redeemer records are **byte-for-byte identical** before and after (same ids `cmufb214g0005f7rofbx76p46` / `cmufb217k000bf7rondyrcb00`, numbers, seqs, years). Nothing was deleted or rewritten.

> Note on the audit baseline: during verification the app connection was briefly authenticated as a superuser (admin URL left in `.env` after a migration deploy), which bypasses RLS; that window produced 23 additional `CREATE MedicalRecord` audit rows plus 12 test records. The test records and their counters were removed and verification was re-run cleanly as `shms_app` (current_user `shms_app`, `rolsuper=false`, `rolbypassrls=false` — confirmed live). The 23 orphan audit rows were left in place rather than deleted (audit immutability is out of scope); final verified results above reflect the clean `shms_app` run.

## 10. Files modified

- `prisma/schema.prisma` — `MedicalRecord` + new `MedicalRecordCounter` model + `Organization` relations.
- `prisma/migrations/20260916010000_fix_medical_record_numbering/migration.sql` (new).
- `prisma/migrations/20260916020000_align_medical_record_counter_seed/migration.sql` (new).
- `src/repositories/medical-record.repository.js` — added `nextMedicalRecordSeq()` (atomic upsert); `findMedicalRecordByRecordNumber()` switched to `findFirst` (number no longer globally unique); removed `countMedicalRecordsByYear()`.
- `src/services/medical-record.service.js` — `createStudentMedicalRecord()` now reserves the sequence from the counter inside the tenant transaction; numbering via `formatRecordNumber()`.
- `scripts/reset-test-accounts.mjs` — writes `organizationId`/`recordSeq`, and clears `MedicalRecordCounter`.
- Prisma client regenerated (locally).

## 11. Remaining limitations / notes

- `recordNumber` is intentionally **not globally unique**; any future lookup by a bare formatted number must be done **within a tenant scope** (as `findMedicalRecordByRecordNumber` now is). Global display-number uniqueness was never the requirement — per-(org, year) uniqueness is.
- At-a-glance, an organization's counter equals its records in the current/year scope; a reset that deletes records AND resets counters leaves the composite unique index as the final protection against sequence reuse within the year.
- If a garbage collection policy ever removes old medical records, the year-bound (year-scoped) counter is unaffected (each year has its own counter row).

---

**Result:** High-severity medical-record number collision **fixed** — per-organization/per-year numbering is now enforced by the database, concurrency-safe, RLS-preserving, and fully verified (A–G 25/25, regression 33/33, security 44/44, data-safety diff clean). **Task 1 complete; not proceeding to Phase 3B Task 2.**