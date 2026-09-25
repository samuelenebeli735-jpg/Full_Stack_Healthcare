-- Fix High-severity medical-record number collision.
--
-- Problem
--   MedicalRecord.recordNumber is created per (organization, year) as
--   "MR-<year>-<000001..>", but the schema declared recordNumber as globally
--   UNIQUE. Two different organizations both create their first record of a
--   year with the same formatted number, so the second insert violates the
--   global unique constraint. Worse, because RLS hides the other tenant's
--   rows, the old count-then-increment retry loop can never observe the
--   colliding row and retries forever.
--
--   Example: Redeemer and Babcock both start a 2026 record:
--     Redeemer -> MR-2026-000001  (count 0, +1)
--     Babcock  -> MR-2026-000001  (count 0, +1)  -> UNIQUE violation (P2002)
--
-- Fix
--   Enforce uniqueness per tenant + year in the database solely from
--   relational columns:
--     UNIQUE (organizationId, recordYear, recordSeq)
--   recordNumber becomes a plain (non-unique, formatted) display string and
--   may repeat across organizations. A per-(organizationId, recordYear)
--   counter table (MedicalRecordCounter) reserves the next sequence atomically
--   via INSERT ... ON CONFLICT ... DO UPDATE, so concurrent creates within an
--   organization + year always receive distinct sequences. The counter table
--   enforces RLS on its own organizationId column, matching every other
--   tenant-scoped table.
--
-- Existing data
--   Only two MedicalRecord rows exist, both in the Redeemer organization:
--     REC-RUN/TEST/001 and REC-RUN/TEST/002 (recordYear 2026).
--   Their numbers end in a plain integer, so the trailing-digit extraction
--   below is deterministic: 001 -> 1, 002 -> 2. No rows are deleted or
--   rewritten. This backfill is reversible in the sense that the original
--   recordNumber values are preserved verbatim; only the two new relational
--   columns are derived.
--
-- Notes
--   * Idempotence is NOT assumed here: this migration runs exactly once in
--     the deployment history. It fails loudly if the backfill cannot derive a
--     sequence (SET NOT NULL / UNIQUE creation would abort), which is the
--     correct behaviour for unexpected data rather than guessing.
--   * The new counter table is created explicitly for the runtime role
--     (GRANT ... TO shms_app) in addition to the ALTER DEFAULT PRIVILEGES
--     from 20260914000000, so it works regardless of the operator role that
--     applies this migration.

-- ---------------------------------------------------------------------------
-- 1. Add relational numbering columns (nullable while backfilling)
-- ---------------------------------------------------------------------------
ALTER TABLE public."MedicalRecord" ADD COLUMN "organizationId" TEXT;
ALTER TABLE public."MedicalRecord" ADD COLUMN "recordSeq" INTEGER;

-- ---------------------------------------------------------------------------
-- 2. Backfill from the existing tenant chain (Profile -> User) + trailing digits
--    Works for both the "REC-..." (reset script) and "MR-<year>-<seq>"
--    (service) formats because both end in an integer sequence.
-- ---------------------------------------------------------------------------
UPDATE public."MedicalRecord" mr
   SET "organizationId" = u."organizationId",
       "recordSeq" = CAST(substring(mr."recordNumber" FROM '([0-9]+)$') AS INTEGER)
  FROM public."Profile" p
  JOIN public."User" u ON u.id = p."userId"
 WHERE p.id = mr."profileId";

-- Guard: any row that failed to derive either column aborts the migration.
-- (With the current data this never triggers, but it protects against
-- unexpected recordNumber shapes.)
DO $$
DECLARE
  bad_count INTEGER;
BEGIN
  SELECT count(*) INTO bad_count
    FROM public."MedicalRecord"
   WHERE "organizationId" IS NULL OR "recordSeq" IS NULL;

  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Cannot derive organization/sequence for % medical record(s). Aborting migration.', bad_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Enforce NOT NULL now that every row is derived
-- ---------------------------------------------------------------------------
ALTER TABLE public."MedicalRecord" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE public."MedicalRecord" ALTER COLUMN "recordSeq" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Replace the global unique constraint on recordNumber with the tenant +
--    year-scoped uniqueness; keep a plain non-unique index for lookups.
--    Index names match Prisma's default @@unique / @@index naming so the
--    generated client and migrate stay in sync.
-- ---------------------------------------------------------------------------
DROP INDEX "MedicalRecord_recordNumber_key";

CREATE UNIQUE INDEX "MedicalRecord_organizationId_recordYear_recordSeq_key"
  ON public."MedicalRecord" ("organizationId", "recordYear", "recordSeq");

CREATE INDEX "MedicalRecord_organizationId_idx"
  ON public."MedicalRecord" ("organizationId");

-- ---------------------------------------------------------------------------
-- 5. Foreign key from MedicalRecord to Organization
-- ---------------------------------------------------------------------------
ALTER TABLE public."MedicalRecord"
  ADD CONSTRAINT "MedicalRecord_organizationId_fkey"
  FOREIGN KEY ("organizationId")
  REFERENCES public."Organization"(id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 6. Per-(organization, year) sequence counter table
-- ---------------------------------------------------------------------------
CREATE TABLE public."MedicalRecordCounter" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "recordYear"     INTEGER NOT NULL,
  "nextSeq"        INTEGER NOT NULL DEFAULT 1,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MedicalRecordCounter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MedicalRecordCounter_organizationId_recordYear_key"
  ON public."MedicalRecordCounter" ("organizationId", "recordYear");

ALTER TABLE public."MedicalRecordCounter"
  ADD CONSTRAINT "MedicalRecordCounter_organizationId_fkey"
  FOREIGN KEY ("organizationId")
  REFERENCES public."Organization"(id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 7. Seed counters from existing data so the next created record continues
--    after the highest existing sequence (no numbering reuse).
-- ---------------------------------------------------------------------------
INSERT INTO public."MedicalRecordCounter"
  ("id", "organizationId", "recordYear", "nextSeq", "createdAt", "updatedAt")
SELECT
  'cmrc_' || substr(md5(mr."organizationId" || ':' || mr."recordYear"), 1, 20),
  mr."organizationId",
  mr."recordYear",
  max(mr."recordSeq") + 1,
  now(),
  now()
FROM public."MedicalRecord" mr
GROUP BY mr."organizationId", mr."recordYear";

-- ---------------------------------------------------------------------------
-- 8. RLS for the counter table: scoped to its own organizationId column,
--    following the same shape as every other tenant table. FORCE is set so a
--    pooled connection without a tenant GUC fails closed on reads and writes.
-- ---------------------------------------------------------------------------
CREATE POLICY "medicalrecordcounter_tenant_policy"
  ON public."MedicalRecordCounter"
  FOR ALL
  USING (
    public.shms_row_visible("MedicalRecordCounter"."organizationId")
  )
  WITH CHECK (
    "MedicalRecordCounter"."organizationId" =
      NULLIF(current_setting('app.organization_id', true), '')::text
  );

ALTER TABLE public."MedicalRecordCounter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."MedicalRecordCounter" FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."MedicalRecordCounter" TO shms_app;