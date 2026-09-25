-- Ensure the runtime application role exists BEFORE the RLS migration
-- (20260914000000) runs, because that migration executes
--   GRANT EXECUTE ... TO shms_app
-- and ALTER DEFAULT PRIVILEGES ... TO shms_app, both of which fail on a
-- fresh database if the role does not exist yet.
--
-- The role is created only if it is missing; an already-existing role is
-- left completely untouched (neither attributes nor password are altered),
-- so applying this migration to an existing deployment is a no-op.
--
-- Prerequisite for the operator (unchanged from the original provisioning):
-- the role needs a login password before the application can connect.
-- Set it out-of-band after deploy, e.g.:
--   ALTER ROLE shms_app WITH LOGIN PASSWORD '<managed-secret>';
-- This migration deliberately does NOT set any password.
--
-- If the migration runs with a connection that lacks role-creation
-- privilege (e.g. an owner that is not superuser/CREATEROLE), and the role
-- is missing, this raises a NOTICE describing the manual prerequisite. The
-- subsequent RLS migration will then fail with a clear
--   role "shms_app" does not exist
-- error, which is the correct, explicit behaviour for a non-reproducible
-- deployment.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shms_app') THEN
    BEGIN
      CREATE ROLE shms_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      RAISE NOTICE 'Created role shms_app (login, non-superuser, no bypassrls). Operator must ALTER ROLE shms_app WITH LOGIN PASSWORD ''<managed-secret>'' before connecting the app.';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Role shms_app does not exist and the migration connection cannot create roles. Manually run: CREATE ROLE shms_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; then ALTER ROLE shms_app WITH LOGIN PASSWORD ''<managed-secret>''; before re-running prisma migrate deploy.';
    END;
  ELSE
    RAISE NOTICE 'Role shms_app already exists; leaving its attributes and password untouched.';
  END IF;
END;
$$;