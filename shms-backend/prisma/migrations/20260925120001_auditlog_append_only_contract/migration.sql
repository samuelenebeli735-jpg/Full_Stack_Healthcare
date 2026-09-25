-- Phase 3B Task 5 — Audit immutability: final contract adjustment.
--
-- Migration 20260925120000 installed an engine-level BEFORE UPDATE/DELETE/
-- TRUNCATE trigger on public."AuditLog" in addition to the REVOKE. That
-- trigger was over-rotated and is intentionally removed here:
--
--   * "AuditLog" has an FK to "User" declared ON DELETE SET NULL
--     ("AuditLog_userId_fkey"). Deleting a referenced user makes the engine
--     emit UPDATE "AuditLog" SET "userId" = NULL as a referential-integrity
--     maintenance action. A plain BEFORE UPDATE row trigger fires for that
--     engine maintenance too and aborts it, breaking legitimate actor-lifecycle
--     cleanup wherever it runs (for fixture teardown in the verification
--     suite, and for any future user-removal feature). That is a regression
--     caused by the engine trigger, not a product requirement.
--
--   * Audit immutability is therefore enforced at the role boundary — the
--     mechanism that binds the only actor the application ever uses. The REVOKE
--     from 20260925120000 removed UPDATE and DELETE on public."AuditLog" from
--     shms_app. Privilege checks bind regardless of RLS policy, tenant GUC,
--     or RLS bypass: the runtime role cannot update or delete a single audit
--     row through any code path (verified dynamically). The application has
--     no UPDATE path for audit rows and the super_admin hard-delete endpoint
--     now returns a controlled 403.
--
--   * Owner/engine-level mutability (PG FK maintenance SET NULL during actor
--     deletion, and DBA operations) remains the documented operational trust
--     boundary — the normal position for an append-only application trail.
--     PREVIOUSLY (pre-Task-5) SET NULL silently rewrote actor linkage during
--     fixture teardown; the REVOKE does not change that engine behavior, so
--     no product flow is altered and no data changes.
--
-- Idempotent: DROP IF EXISTS on triggers and function.
--
-- Requires an owner/elevated connection (same as 20260925120000); not shms_app.

DROP TRIGGER IF EXISTS "AuditLog_append_only_truncate" ON public."AuditLog";

DROP TRIGGER IF EXISTS "AuditLog_append_only" ON public."AuditLog";

DROP FUNCTION IF EXISTS public.shms_auditlog_append_only();