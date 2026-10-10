-- Reproducible read access to migration status for the runtime role.
--
-- The first-run bootstrap (src/services/bootstrap.service.js, verifySchema)
-- runs as shms_app and refuses to write unless exactly this release's
-- migrations are applied and none failed. It reads
--   SELECT migration_name, finished_at, rolled_back_at
--     FROM public._prisma_migrations
-- No migration granted that read: existing databases got SELECT out-of-band,
-- so on a freshly migrated database the bootstrap failed with
--   permission denied for table _prisma_migrations
--
-- Only the three columns the bootstrap reads are granted (column-level
-- SELECT). id, checksum, logs, started_at and applied_steps_count stay
-- unreadable for shms_app, and INSERT/UPDATE/DELETE remain revoked
-- (20260914000000). No RLS policy, SECURITY DEFINER function or tenant table
-- privilege changes.
--
-- Idempotent: re-granting an already-held privilege is a no-op; databases
-- where shms_app already holds table-level SELECT are unaffected.
--
-- Requires an owner/elevated connection (the normal migration connection).

GRANT SELECT (migration_name, finished_at, rolled_back_at)
  ON TABLE public._prisma_migrations TO shms_app;
