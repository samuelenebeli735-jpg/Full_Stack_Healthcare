-- Phase 3B Task 5 — Audit immutability: make "AuditLog" append-only.
--
-- Background
--   shms_app previously held full DML (INSERT, SELECT, UPDATE, DELETE) on
--   public."AuditLog" (granted by 20260916000000_harden_tenant_reproducibility),
--   and the API exposed an unconstrained super_admin hard-delete
--   (DELETE /api/v1/audit/:id). There was no engine-level backstop, so a bug
--   or an elevated/owner connection (which bypasses RLS) could mutate or
--   remove any audit record, defeating the audit trail.
--
--   This migration makes "AuditLog" append-only at the engine level:
--     1. REVOKE UPDATE, DELETE from the runtime role (INSERT stays for
--        auditLogger writes, SELECT stays for audit reads).
--     2. Create an append-only trigger that aborts any UPDATE/DELETE/TRUNCATE
--        for every role, including the table owner and any RLS-bypassing
--        connection, because a privilege REVOKE alone does not bind the
--        table owner.
--   RLS (auditlog_tenant_policy) is left untouched; it still scopes reads
--   and INSERT writes by organization.
--
-- Notes
--   * Idempotent: REVOKE of an already-revoked privilege is a no-op;
--     DROP TRIGGER IF EXISTS precedes CREATE TRIGGER, and the function uses
--     CREATE OR REPLACE, so the migration is safe on fresh and existing DBs.
--   * Requires a connection with ownership of public."AuditLog" (the normal
--     migration-time admin/owner connection), NOT shms_app.
--   * Rotation of a tamper-evident trail is an explicit operator action: the
--     triggers must be dropped (and the REVOKE lifted) deliberately.

REVOKE UPDATE, DELETE ON TABLE public."AuditLog" FROM shms_app;

CREATE OR REPLACE FUNCTION public.shms_auditlog_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only: UPDATE/DELETE/TRUNCATE is forbidden (audit immutability).'
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS "AuditLog_append_only" ON public."AuditLog";
CREATE TRIGGER "AuditLog_append_only"
BEFORE UPDATE OR DELETE ON public."AuditLog"
FOR EACH ROW
EXECUTE FUNCTION public.shms_auditlog_append_only();

DROP TRIGGER IF EXISTS "AuditLog_append_only_truncate" ON public."AuditLog";
CREATE TRIGGER "AuditLog_append_only_truncate"
BEFORE TRUNCATE ON public."AuditLog"
FOR EACH STATEMENT
EXECUTE FUNCTION public.shms_auditlog_append_only();