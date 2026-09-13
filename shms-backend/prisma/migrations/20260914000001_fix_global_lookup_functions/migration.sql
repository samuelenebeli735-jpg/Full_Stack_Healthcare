-- Correct the SECURITY DEFINER lookups: plpgsql cannot address mixed-case
-- columns through a %ROWTYPE record (identifiers are folded to lowercase),
-- so the functions read each camelCase column into its own typed variable.
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
  v_id             text;
  v_org            text;
  v_email          text;
  v_password       text;
  v_role           public."Role";
  v_active         boolean;
  v_reset_token    text;
  v_reset_expiry   timestamp;
  v_tmp_id         text;
BEGIN
  SELECT u.id, u."organizationId", u.email, u.password, u.role,
         u."isActive", u."resetToken", u."resetTokenExpiry"
    INTO v_id, v_org, v_email, v_password, v_role,
         v_active, v_reset_token, v_reset_expiry
    FROM public."User" u
   WHERE u.email IS NOT NULL AND u.email = p_identifier
   LIMIT 1;

  IF v_id IS NULL THEN
    SELECT u.id, u."organizationId", u.email, u.password, u.role,
           u."isActive", u."resetToken", u."resetTokenExpiry"
      INTO v_id, v_org, v_email, v_password, v_role,
           v_active, v_reset_token, v_reset_expiry
      FROM public."User" u
      JOIN public."Profile" p ON p."userId" = u.id
     WHERE p."matricNumber" = p_identifier
     LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    SELECT u.id, u."organizationId", u.email, u.password, u.role,
           u."isActive", u."resetToken", u."resetTokenExpiry"
      INTO v_id, v_org, v_email, v_password, v_role,
           v_active, v_reset_token, v_reset_expiry
      FROM public."User" u
      JOIN public."Staff" s ON s."userId" = u.id
     WHERE s."staffNumber" = p_identifier
     LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  SELECT p."firstName", p."middleName", p."lastName", p."matricNumber"
    INTO firstName, middleName, lastName, matricNumber
    FROM public."Profile" p WHERE p."userId" = v_id;

  SELECT s."staffNumber" INTO staffNumber
    FROM public."Staff" s WHERE s."userId" = v_id;

  id := v_id;
  organizationId := v_org;
  email := v_email;
  password := v_password;
  role := v_role;
  isActive := v_active;
  resetToken := v_reset_token;
  resetTokenExpiry := v_reset_expiry;
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
  v_id             text;
  v_org            text;
  v_email          text;
  v_role           public."Role";
  v_active         boolean;
  v_reset_token    text;
  v_reset_expiry   timestamp;
BEGIN
  SELECT u.id, u."organizationId", u.email, u.role, u."isActive",
         u."resetToken", u."resetTokenExpiry"
    INTO v_id, v_org, v_email, v_role, v_active, v_reset_token, v_reset_expiry
    FROM public."User" u
   WHERE u."resetToken" = p_token AND u."resetTokenExpiry" > now()
   LIMIT 1;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  id := v_id;
  organizationId := v_org;
  email := v_email;
  role := v_role;
  isActive := v_active;
  resetToken := v_reset_token;
  resetTokenExpiry := v_reset_expiry;
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
  v_id      text;
  v_org     text;
  v_role    public."Role";
  v_active  boolean;
BEGIN
  SELECT u.id, u."organizationId", u.role, u."isActive"
    INTO v_id, v_org, v_role, v_active
    FROM public."User" u WHERE u.id = p_user_id LIMIT 1;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  id := v_id;
  organizationId := v_org;
  role := v_role;
  isActive := v_active;
  RETURN NEXT;
END;
$$;