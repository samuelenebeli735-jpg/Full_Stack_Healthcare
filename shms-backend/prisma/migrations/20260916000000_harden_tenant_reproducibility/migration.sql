-- Harden tenancy reproducibility and SECURITY DEFINER function config.
--
-- Background
--   The RLS migration (20260914000000) only set ALTER DEFAULT PRIVILEGES for
--   *future* tables/sequences. The concrete table-level DML grants the runtime
--   role needs were applied manually against the live database and were not
--   recorded in any migration, so a brand-new deployment applying only the
--   migration history would leave shms_app unable to read or write any table.
--   This migration records those grants explicitly so they reproduce exactly.
--
--   Additionally, the four global SECURITY DEFINER lookup functions were
--   declared with `SET search_path = public`. Their bodies reference every
--   relation with an explicit `public.` qualifier and only use built-in
--   functions (now(), to_jsonb, COALESCE), which resolve from pg_catalog, so
--   pinning search_path to `pg_catalog` is behaviour-neutral while removing
--   the possibility of a public-schema object ever shadowing a built-in
--   during SECURITY DEFINER execution.
--
-- Notes
--   * Every statement here is idempotent: re-granting an already-held
--     privilege and re-setting an identical function configuration are
--     no-ops, so this migration is safe on both fresh and existing databases.
--   * The schemas contain no sequences (Prisma uses text/CUID ids), so no
--     sequence grants are required; ALTER DEFAULT PRIVILEGES from the RLS
--     migration already covers any future sequences for shms_app.
--   * _prisma_migrations stays write-protected for shms_app (see the REVOKE
--     in 20260914000000).

-- ---------------------------------------------------------------------------
-- 1. Explicit DML grants for the runtime role (append-only, idempotent)
--    Organization is included: it is the tenant registry with NO RLS by
--    design and does need the same CRUD as the tenancy-scoped tables.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public."User",
  public."Profile",
  public."MedicalRecord",
  public."Staff",
  public."Schedule",
  public."Department",
  public."Position",
  public."Service",
  public."Appointment",
  public."Queue",
  public."Consultation",
  public."Prescription",
  public."PrescriptionItem",
  public."AuditLog",
  public."Notification",
  public."NotificationPreference",
  public."Organization"
  TO shms_app;

-- ---------------------------------------------------------------------------
-- 2. Harden SECURITY DEFINER lookup functions
--    Keep pg_catalog on every known built-in; all relations are explicitly
--    qualified as `public."..."` inside the bodies.
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.shms_auth_user(text) SET search_path = pg_catalog;
ALTER FUNCTION public.shms_user_by_reset_token(text) SET search_path = pg_catalog;
ALTER FUNCTION public.shms_user_org(text) SET search_path = pg_catalog;
ALTER FUNCTION public.shms_user_route(text) SET search_path = pg_catalog;