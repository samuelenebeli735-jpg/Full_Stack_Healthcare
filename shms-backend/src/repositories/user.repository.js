import prisma from "../config/db.js";
import { getTenantClient } from "../utils/tenantContext.js";

function toUserWithProfile(row) {
  if (!row) return null;

  const id = row.id ?? row.Id;
  const organizationId = row.organizationId ?? row.organizationid;
  const email = row.email ?? row.Email;
  const password = row.password ?? row.Password;
  const role = row.role ?? row.Role;
  const isActive = row.isActive ?? row.isactive;
  const resetToken = row.resetToken ?? row.resettoken;
  const resetTokenExpiry = row.resetTokenExpiry ?? row.resettokenexpiry;
  const firstName = row.firstName ?? row.firstname;
  const middleName = row.middleName ?? row.middlename;
  const lastName = row.lastName ?? row.lastname;
  const matricNumber = row.matricNumber ?? row.matricnumber;
  const staffNumber = row.staffNumber ?? row.staffnumber;

  return {
    id,
    organizationId,
    email,
    password,
    role,
    isActive,
    resetToken,
    resetTokenExpiry,
    profile: firstName || matricNumber
      ? { firstName, middleName, lastName, matricNumber }
      : null,
    staff: staffNumber ? { staffNumber } : null,
  };
}

function toUserRow(row) {
  if (!row) return null;

  return {
    id: row.id ?? row.Id,
    organizationId: row.organizationId ?? row.organizationid,
    email: row.email ?? row.Email,
    role: row.role ?? row.Role,
    isActive: row.isActive ?? row.isactive,
    resetToken: row.resetToken ?? row.resettoken,
    resetTokenExpiry: row.resetTokenExpiry ?? row.resettokenexpiry,
  };
}

/**
 * Global authentication lookup by email, matric number, or staff number.
 * Runs through the SECURITY DEFINER function shms_auth_user so the
 * pre-authentication lookup can cross tenant boundaries without
 * weakening tenant RLS on the User table.
 */
export async function findAuthUserByIdentifier(identifier, db = getTenantClient()) {
  const [row] = await db.$queryRaw`SELECT * FROM public.shms_auth_user(${identifier})`;
  return toUserWithProfile(row);
}

/**
 * Find a user by email (global existence check via SECURITY DEFINER).
 */
export async function findUserByEmail(email, db = getTenantClient()) {
  const [row] = await db.$queryRaw`SELECT * FROM public.shms_auth_user(${email})`;
  return toUserRow(row);
}

/**
 * Find a user by email including their profile (authentication lookup).
 */
export async function findUserWithProfileByEmail(email, db = getTenantClient()) {
  const [row] = await db.$queryRaw`SELECT * FROM public.shms_auth_user(${email})`;
  return toUserWithProfile(row);
}

/**
 * Find a user by ID.
 */
export async function findUserById(id, db = getTenantClient()) {
  return await db.user.findUnique({
    where: {
      id,
    },
  });
}

/**
 * Create a new user.
 */
export async function createUser(data, db = getTenantClient()) {
  return await db.user.create({
    data,
  });
}

/**
 * Find a user by profile matric number including profile and organization.
 */
export async function findUserWithProfileByMatricNumber(matricNumber, db = getTenantClient()) {
  const [row] = await db.$queryRaw`SELECT * FROM public.shms_auth_user(${matricNumber})`;
  return toUserWithProfile(row);
}

export async function findUserWithProfileByStaffNumber(staffNumber, db = getTenantClient()) {
  const [row] = await db.$queryRaw`SELECT * FROM public.shms_auth_user(${staffNumber})`;
  return toUserWithProfile(row);
}

/**
 * Global reset-token lookup via SECURITY DEFINER.
 */
export async function findUserByResetToken(resetToken, db = getTenantClient()) {
  const [row] = await db.$queryRaw`SELECT * FROM public.shms_user_by_reset_token(${resetToken})`;
  return toUserRow(row);
}

/**
 * Read the organization hint for a user ID (used to establish tenant
 * context for user-scoped operations). Runs via SECURITY DEFINER.
 */
export async function findUserOrgHint(userId, db = getTenantClient()) {
  const [row] = await db.$queryRaw`SELECT * FROM public.shms_user_org(${userId})`;
  return row
    ? {
        organizationId: row.organizationId ?? row.organizationid,
        role: row.role ?? row.Role,
        isActive: row.isActive ?? row.isactive,
      }
    : null;
}

/**
 * Store a hashed reset token for a user.
 */
export async function updateResetToken(userId, resetToken, resetTokenExpiry, db = getTenantClient()) {
  return await db.user.update({
    where: { id: userId },
    data: { resetToken, resetTokenExpiry },
  });
}

/**
 * Find a user by a hashed reset token that hasn't expired (global lookup).
 */
export async function updatePassword(userId, hashedPassword, db = getTenantClient()) {
  return await db.user.update({
    where: { id: userId },
    data: {
      password: hashedPassword,
      resetToken: null,
      resetTokenExpiry: null,
    },
  });
}

/**
 * Find a user by ID including their password (used for credential checks).
 */
export async function findUserWithPasswordById(id, db = getTenantClient()) {
  return await db.user.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      password: true,
      resetToken: true,
    },
  });
}

/**
 * Find a user by ID including profile and organization.
 */
export async function findUserWithProfileById(id, db = getTenantClient()) {
  return await db.user.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
      organizationId: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,

      profile: true,
      organization: true,
    },
  });
}