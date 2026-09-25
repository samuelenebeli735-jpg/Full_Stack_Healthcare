-- Align MedicalRecordCounter seed values with the app's upsert semantics.
--
-- Background
--   20260916010000 seeded the counter as nextSeq = max(recordSeq) + 1, i.e.
--   "next sequence to allocate". The application's atomic upsert instead
--   stores the *last-allocated* sequence:
--     * fresh insert (first record in an org+year): stores 1, allocates 1
--     * conflict   (subsequent records):           stores prev + 1, allocates that
--   i.e. after N records the counter always holds N and the *next* allocation
--   is counter + 1.
--
--   A seed of max + 1 would therefore make the first app-created record in a
--   pre-seeded (org, year) skip one number (e.g. Redeemer, 2 records, seeded
--   3 -> first new record would be 4, skipping 3).
--
-- Fix
--   Idempotently set nextSeq = max(recordSeq) for every counter that already
--   has corresponding MedicalRecord rows. Counters with no rows yet (nextSeq 1)
--   are a fresh insert awaiting its first record and are left untouched.
--   Rows already equal to max(recordSeq) (rows fed purely by the app) are no-ops.
--
--   A fresh deployment applies 20260916010000 (seed max + 1) followed by this
--   migration (seed max), so the final state is identical on every database.
UPDATE public."MedicalRecordCounter" c
   SET "nextSeq"  = m.max_seq,
       "updatedAt" = now()
  FROM (
        SELECT "organizationId", "recordYear", max("recordSeq") AS max_seq
          FROM public."MedicalRecord"
         GROUP BY "organizationId", "recordYear"
       ) m
 WHERE m."organizationId" = c."organizationId"
   AND m."recordYear"       = c."recordYear"
   AND c."nextSeq"         != m.max_seq;