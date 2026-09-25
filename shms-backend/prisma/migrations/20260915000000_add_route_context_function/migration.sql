-- Route context lookup used by the authentication middleware BEFORE any
-- tenant-scoped query runs. A single SECURITY DEFINER function resolves the
-- authenticated user (global read) plus their profile and organization in one
-- call, preserving the exact response shape the API already produces for
-- /auth/verify while registration/login remain the only pre-auth flows.
--
-- The function is SECURITY DEFINER (owner = migration superuser) so it can
-- read User/Profile across all organizations regardless of RLS. Its USE is
-- granted only to shms_app; it is revoked from PUBLIC like the other three
-- global lookup functions.
CREATE OR REPLACE FUNCTION public.shms_user_route(p_user_id text)
RETURNS TABLE (
  id             text,
  organizationId text,
  email          text,
  role           public."Role",
  isActive       boolean,
  createdAt      timestamp,
  updatedAt      timestamp,
  profile        jsonb,
  organization   jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id            text;
  v_org           text;
  v_email         text;
  v_role          public."Role";
  v_active        boolean;
  v_created       timestamp;
  v_updated       timestamp;
  v_profile       jsonb;
  v_organization  jsonb;
BEGIN
  SELECT u.id, u."organizationId", u.email, u.role, u."isActive",
         u."createdAt", u."updatedAt"
    INTO v_id, v_org, v_email, v_role, v_active, v_created, v_updated
    FROM public."User" u WHERE u.id = p_user_id LIMIT 1;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  SELECT to_jsonb(p.*) INTO v_profile
    FROM public."Profile" p WHERE p."userId" = v_id LIMIT 1;

  SELECT to_jsonb(o.*) INTO v_organization
    FROM public."Organization" o WHERE o.id = v_org LIMIT 1;

  id := v_id;
  organizationId := v_org;
  email := v_email;
  role := v_role;
  isActive := v_active;
  createdAt := v_created;
  updatedAt := v_updated;
  profile := COALESCE(v_profile, '{}'::jsonb);
  organization := COALESCE(v_organization, '{}'::jsonb);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.shms_user_route(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shms_user_route(text) TO shms_app;