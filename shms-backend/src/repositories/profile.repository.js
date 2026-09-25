import prisma from "../config/db.js";

/**
 * Find a profile by matric number.
 */
export async function findProfileByMatricNumber(matricNumber, db = prisma) {
  return await db.profile.findUnique({
    where: {
      matricNumber,
    },
  });
}

/**
 * Find a profile by user ID.
 */
export async function findProfileByUserId(userId, db = prisma) {
  return await db.profile.findUnique({
    where: {
      userId,
    },
  });
}

/**
 * Create a new profile.
 */
export async function createProfile(data, db = prisma) {
  return await db.profile.create({
    data,
  });
}

export async function updateProfile(id, data, db = prisma) {
  return await db.profile.update({
    where: { id },
    data,
  });
}