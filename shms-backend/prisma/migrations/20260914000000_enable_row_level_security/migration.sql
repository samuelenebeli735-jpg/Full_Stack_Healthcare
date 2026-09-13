-- RLS hardening: enforce tenant isolation at the PostgreSQL layer for
-- every tenancy-scoped table. Non-superuser app role: shms_app.
--
-- Design notes
-- * Tenant context is carried by the transaction-local GUC
--   app.organization_id (set via set_config(..., true)). A missing
--   context exposes NOTHING (fail closed).
-- * app.bypass_rls = 'true' (also transaction-local) grants a
--   global super-admin view ONLY while app.organization_id is empty.
-- * The SECURITY DEFINER functions are the ONLY global doorways
--   required before an organization is known (login, password reset,
--   user-scoped route context). Their USE is restricted to shms_app.
-- * Policies reference shms_row_visible(), a plain (non-DEFINER)
--   helper so RLS remains evaluated for the invoking role; no recursive
--   policy references exist (every chain terminates at the User/Queue
--   tables, whose policies contain no subqueries).

-- ---------------------------------------------------------------------------
-- 1. RLS predicate helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.shms_row_visible(p_org text)
RETURNS boolean
LANGUAGE sql
AS $$
  SELECT (
    current_setting('app.organization_id', true) = p_org
    OR (
      current_setting('app.bypass_rls', true) = 'true'
      AND (
        current_setting('app.organization_id', true) IS NULL
        OR current_setting('app.organization_id', true) = ''
      )
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Global pre-authentication lookup functions (SECURITY DEFINER)
--    - shms_auth_user(identifier)      login: email | matric | staff number
--    - shms_user_by_reset_token(token) password reset
--    - shms_user_org(user_id)          route context before RLS scope known
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.shms_auth_user(p_identifier text)
RETURNS TABLE (
  id               text,
  organizationId   text,
  email            text,
  password         text,
  role             public."Role",
  isActive         boolean,
  resetToken       text,
  resetTokenExpiry timestamp,
  firstName        text,
  middleName       text,
  lastName         text,
  matricNumber     text,
  staffNumber      text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user public."User"%ROWTYPE;
BEGIN
  SELECT u.* INTO v_user FROM public."User" u
    WHERE u.email IS NOT NULL AND u.email = p_identifier
    LIMIT 1;

  IF NOT FOUND THEN
    SELECT u.* INTO v_user FROM public."User" u
      JOIN public."Profile" p ON p."userId" = u.id
      WHERE p."matricNumber" = p_identifier
      LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    SELECT u.* INTO v_user FROM public."User" u
      JOIN public."Staff" s ON s."userId" = u.id
      WHERE s."staffNumber" = p_identifier
      LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT p."firstName", p."middleName", p."lastName", p."matricNumber"
    INTO firstName, middleName, lastName, matricNumber
    FROM public."Profile" p WHERE p."userId" = v_user.id;

  SELECT s."staffNumber" INTO staffNumber
    FROM public."Staff" s WHERE s."userId" = v_user.id;

  id := v_user.id;
  organizationId := v_user."organizationId";
  email := v_user.email;
  password := v_user.password;
  role := v_user.role;
  isActive := v_user.isActive;
  resetToken := v_user."resetToken";
  resetTokenExpiry := v_user."resetTokenExpiry";
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.shms_user_by_reset_token(p_token text)
RETURNS TABLE (
  id               text,
  organizationId   text,
  email            text,
  role             public."Role",
  isActive         boolean,
  resetToken       text,
  resetTokenExpiry timestamp
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user public."User"%ROWTYPE;
BEGIN
  SELECT u.* INTO v_user FROM public."User" u
    WHERE u."resetToken" = p_token AND u."resetTokenExpiry" > now()
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  id := v_user.id;
  organizationId := v_user."organizationId";
  email := v_user.email;
  role := v_user.role;
  isActive := v_user.isActive;
  resetToken := v_user."resetToken";
  resetTokenExpiry := v_user."resetTokenExpiry";
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.shms_user_org(p_user_id text)
RETURNS TABLE (
  id             text,
  organizationId text,
  role           public."Role",
  isActive       boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user public."User"%ROWTYPE;
BEGIN
  SELECT u.* INTO v_user FROM public."User" u WHERE u.id = p_user_id LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  id := v_user.id;
  organizationId := v_user."organizationId";
  role := v_user.role;
  isActive := v_user.isActive;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.shms_auth_user(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shms_user_by_reset_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shms_user_org(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shms_row_visible(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shms_auth_user(text) TO shms_app;
GRANT EXECUTE ON FUNCTION public.shms_user_by_reset_token(text) TO shms_app;
GRANT EXECUTE ON FUNCTION public.shms_user_org(text) TO shms_app;
GRANT EXECUTE ON FUNCTION public.shms_row_visible(text) TO shms_app;

-- ---------------------------------------------------------------------------
-- 3. Enable ROW LEVEL SECURITY and define policies
--    Direct-org tables (policies keyed on the rows own organizationId)
-- ---------------------------------------------------------------------------
CREATE POLICY user_tenant_policy ON public."User"
  FOR ALL
  USING (public.shms_row_visible("organizationId"))
  WITH CHECK ("organizationId" = current_setting('app.organization_id', true));

CREATE POLICY schedule_tenant_policy ON public."Schedule"
  FOR ALL
  USING (public.shms_row_visible("organizationId"))
  WITH CHECK ("organizationId" = current_setting('app.organization_id', true));

CREATE POLICY department_tenant_policy ON public."Department"
  FOR ALL
  USING (public.shms_row_visible("organizationId"))
  WITH CHECK ("organizationId" = current_setting('app.organization_id', true));

CREATE POLICY position_tenant_policy ON public."Position"
  FOR ALL
  USING (public.shms_row_visible("organizationId"))
  WITH CHECK ("organizationId" = current_setting('app.organization_id', true));

CREATE POLICY service_tenant_policy ON public."Service"
  FOR ALL
  USING (public.shms_row_visible("organizationId"))
  WITH CHECK ("organizationId" = current_setting('app.organization_id', true));

CREATE POLICY appointment_tenant_policy ON public."Appointment"
  FOR ALL
  USING (public.shms_row_visible("organizationId"))
  WITH CHECK ("organizationId" = current_setting('app.organization_id', true));

CREATE POLICY queue_tenant_policy ON public."Queue"
  FOR ALL
  USING (public.shms_row_visible("organizationId"))
  WITH CHECK ("organizationId" = current_setting('app.organization_id', true));

CREATE POLICY auditlog_tenant_policy ON public."AuditLog"
  FOR ALL
  USING (public.shms_row_visible("organizationId"))
  WITH CHECK ("organizationId" = current_setting('app.organization_id', true));

CREATE POLICY notification_tenant_policy ON public."Notification"
  FOR ALL
  USING (public.shms_row_visible("organizationId"))
  WITH CHECK ("organizationId" = current_setting('app.organization_id', true));

-- ---------------------------------------------------------------------------
-- 4. Inherited-org tables: the org is reached through a parent chain.
--    Chains are linear and terminate at tables whose own policies contain
--    no subqueries, so there is no policy recursion.
-- ---------------------------------------------------------------------------
CREATE POLICY profile_tenant_policy ON public."Profile"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public."User" u
      WHERE u.id = "Profile"."userId"
        AND public.shms_row_visible(u."organizationId")
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public."User" u
      WHERE u.id = "Profile"."userId"
        AND u."organizationId" = current_setting('app.organization_id', true)
    )
  );

CREATE POLICY medicalrecord_tenant_policy ON public."MedicalRecord"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public."Profile" p
      JOIN public."User" u ON u.id = p."userId"
      WHERE p.id = "MedicalRecord"."profileId"
        AND public.shms_row_visible(u."organizationId")
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public."Profile" p
      JOIN public."User" u ON u.id = p."userId"
      WHERE p.id = "MedicalRecord"."profileId"
        AND u."organizationId" = current_setting('app.organization_id', true)
    )
  );

CREATE POLICY staff_tenant_policy ON public."Staff"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public."User" u
      WHERE u.id = "Staff"."userId"
        AND public.shms_row_visible(u."organizationId")
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public."User" u
      WHERE u.id = "Staff"."userId"
        AND u."organizationId" = current_setting('app.organization_id', true)
    )
  );

CREATE POLICY consultation_tenant_policy ON public."Consultation"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public."Queue" q
      WHERE q.id = "Consultation"."queueId"
        AND public.shms_row_visible(q."organizationId")
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public."Queue" q
      WHERE q.id = "Consultation"."queueId"
        AND q."organizationId" = current_setting('app.organization_id', true)
    )
  );

CREATE POLICY prescription_tenant_policy ON public."Prescription"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public."Consultation" c
      JOIN public."Queue" q ON q.id = c."queueId"
      WHERE c.id = "Prescription"."consultationId"
        AND public.shms_row_visible(q."organizationId")
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public."Consultation" c
      JOIN public."Queue" q ON q.id = c."queueId"
      WHERE c.id = "Prescription"."consultationId"
        AND q."organizationId" = current_setting('app.organization_id', true)
    )
  );

CREATE POLICY prescriptionitem_tenant_policy ON public."PrescriptionItem"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public."Prescription" p
      JOIN public."Consultation" c ON c.id = p."consultationId"
      JOIN public."Queue" q ON q.id = c."queueId"
      WHERE p.id = "PrescriptionItem"."prescriptionId"
        AND public.shms_row_visible(q."organizationId")
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public."Prescription" p
      JOIN public."Consultation" c ON c.id = p."consultationId"
      JOIN public."Queue" q ON q.id = c."queueId"
      WHERE p.id = "PrescriptionItem"."prescriptionId"
        AND q."organizationId" = current_setting('app.organization_id', true)
    )
  );

CREATE POLICY notificationpref_tenant_policy ON public."NotificationPreference"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public."User" u
      WHERE u.id = "NotificationPreference"."userId"
        AND public.shms_row_visible(u."organizationId")
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public."User" u
      WHERE u.id = "NotificationPreference"."userId"
        AND u."organizationId" = current_setting('app.organization_id', true)
    )
  );

-- ---------------------------------------------------------------------------
-- 5. FORCE RLS: also applies to the table owner. Safe because the owner
--    (postgres) is a superuser that legitimately bypasses RLS, while the
--    runtime role shms_app is non-superuser with rolbypassrls = false.
-- ---------------------------------------------------------------------------
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."User" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."Profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Profile" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."MedicalRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."MedicalRecord" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."Staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Staff" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."Schedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Schedule" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."Department" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Department" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."Position" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Position" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."Service" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Service" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."Appointment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Appointment" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."Queue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Queue" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."Consultation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Consultation" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."Prescription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Prescription" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."PrescriptionItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PrescriptionItem" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AuditLog" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Notification" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."NotificationPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."NotificationPreference" FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 6. Least privilege hygiene
--    * Keep the app role out of migration bookkeeping mutations.
--    * Future tables created by later migrations get DML grants for the
--      app role by default (RLS still must be enabled explicitly).
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public._prisma_migrations FROM shms_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO shms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO shms_app;