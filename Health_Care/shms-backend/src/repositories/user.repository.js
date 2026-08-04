import prisma from "../config/db.js";

/**
 * Find a user by email.
 */
export async function findUserByEmail(email, db = prisma) {
  return await db.user.findUnique({
    where: {
      email,
    },
  });
}

/**
 * Find a user by email including their profile.
 */
export async function findUserWithProfileByEmail(email, db = prisma) {
  return await db.user.findUnique({
    where: {
      email,
    },
    include: {
      profile: true,
      organization: true,
    },
  });
}

/**
 * Find a user by ID.
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
  return await db.user.findFirst({
    where: {
      profile: {
        matricNumber,
      },
    },
    include: {
      profile: true,
      organization: true,
    },
  });
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
 * Find a user by a hashed reset token that hasn't expired.
 */
export async function findUserByResetToken(resetToken, db = prisma) {
  return await db.user.findFirst({
    where: {
      resetToken,
      resetTokenExpiry: { gt: new Date() },
    },
  });
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

/**
 * Find a user by ID including profile and organization.
 */
export async function findUserWithProfileById(id, db = prisma) {
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