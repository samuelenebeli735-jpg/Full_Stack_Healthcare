import prisma from "../config/db.js";

async function globalAuthUser(identifier, db = prisma) {
  const rows = await db.$queryRaw`
    SELECT *
    FROM public.shms_auth_user(${identifier})
  `;

  if (!rows || rows.length === 0) {
    return null;
  }

  const row = rows[0];

  // The Postgres raw adapter lowercases column labels, so map the
  // lowercase keys back to the model's camelCase field names.
  return {
    id: row.id,
    organizationId: row.organizationid,
    email: row.email,
    password: row.password,
    role: row.role,
    isActive: row.isactive,
    resetToken: row.resettoken,
    resetTokenExpiry: row.resettokenexpiry,
    firstName: row.firstname,
    middleName: row.middlename,
    lastName: row.lastname,
    matricNumber: row.matricnumber,
    staffNumber: row.staffnumber,
  };
}

/**
 * Global pre-auth lookup by email | matric number | staff number.
 * Resolved through the shms_auth_user SECURITY DEFINER function so identity
 * can be established before an organization context exists (login, duplicate
 * checks, password reset). Returns null when no user matches.
 */
export async function findAuthUserByIdentifier(identifier, db = prisma) {
  return await globalAuthUser(identifier, db);
}

/**
 * Find a user by email (global, pre-auth).
 */
export async function findUserByEmail(email, db = prisma) {
  return await globalAuthUser(email, db);
}

/**
 * Find a user by email including their profile.
 */
export async function findUserWithProfileByEmail(email, db = prisma) {
  return await globalAuthUser(email, db);
}

/**
 * Find a user by ID. RLS-scoped: callers must pass a transaction from a
 * tenant/super-admin context, otherwise a row in another organization (or no
 * context) is invisible.
 */
export async function findUserById(id, db = prisma) {
  return await db.user.findUnique({
    where: {
      id,
    },
  });
}

/**
 * Create a new user.
 */
export async function createUser(data, db = prisma) {
  return await db.user.create({
    data,
  });
}

/**
 * Find a user by profile matric number including profile and organization.
 */
export async function findUserWithProfileByMatricNumber(matricNumber, db = prisma) {
  return await globalAuthUser(matricNumber, db);
}

export async function findUserWithProfileByStaffNumber(staffNumber, db = prisma) {
  return await globalAuthUser(staffNumber, db);
}

/**
 * Store a hashed reset token for a user.
 */
export async function updateResetToken(userId, resetToken, resetTokenExpiry, db = prisma) {
  return await db.user.update({
    where: { id: userId },
    data: { resetToken, resetTokenExpiry },
  });
}

/**
 * Global pre-auth lookup of a user by a hashed, unexpired reset token.
 * Resolved through the shms_user_by_reset_token SECURITY DEFINER function.
 */
export async function findUserByResetToken(resetToken, db = prisma) {
  const rows = await db.$queryRaw`
    SELECT *
    FROM public.shms_user_by_reset_token(${resetToken})
  `;

  if (!rows || rows.length === 0) {
    return null;
  }

  const row = rows[0];

  return {
    id: row.id,
    organizationId: row.organizationid,
    email: row.email,
    role: row.role,
    isActive: row.isactive,
    resetToken: row.resettoken,
    resetTokenExpiry: row.resettokenexpiry,
  };
}

/**
 * Update a user's password and clear the reset token.
 */
export async function updatePassword(userId, hashedPassword, db = prisma) {
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
 * RLS-scoped: must run inside a tenant/super-admin transaction.
 */
export async function findUserWithPasswordById(id, db = prisma) {
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

function parseStoredObject(value) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value ?? null;
}

/**
 * Global route-context lookup of a user by ID including profile and
 * organization. Resolved through the shms_user_route SECURITY DEFINER
 * function; used by the auth middleware and profile service before a tenant
 * scope exists.
 */
export async function findUserWithProfileById(id, db = prisma) {
  const rows = await db.$queryRaw`
    SELECT *
    FROM public.shms_user_route(${id})
  `;

  if (!rows || rows.length === 0) {
    return null;
  }

  const row = rows[0];

  return {
    id: row.id,
    organizationId: row.organizationid,
    email: row.email,
    role: row.role,
    isActive: row.isactive,
    createdAt: row.createdat,
    updatedAt: row.updatedat,
    profile: parseStoredObject(row.profile),
    organization: parseStoredObject(row.organization),
  };
}

/**
 * Minimal global lookup of a user's organization used when a service only has
 * a userId (notifications, student medical-record helpers). Resolved through
 * the shms_user_org SECURITY DEFINER function.
 */
export async function findUserOrgHint(userId, db = prisma) {
  const rows = await db.$queryRaw`
    SELECT *
    FROM public.shms_user_org(${userId})
  `;

  if (!rows || rows.length === 0) {
    return null;
  }

  const row = rows[0];

  return {
    id: row.id,
    organizationId: row.organizationid,
    role: row.role,
    isActive: row.isactive,
  };
}