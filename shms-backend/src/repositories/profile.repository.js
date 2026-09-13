import prisma from "../config/db.js";
import { getTenantClient } from "../utils/tenantContext.js";

/**
 * Find a profile by matric number.
 */
export async function findProfileByMatricNumber(matricNumber, db = getTenantClient()) {
  return await db.profile.findUnique({
    where: {
      matricNumber,
    },
  });
}

/**
 * Find a profile by user ID.
 */
export async function findProfileByUserId(userId, db = getTenantClient()) {
  return await db.profile.findUnique({
    where: {
      userId,
    },
  });
}

/**
 * Create a new profile.
 */
export async function createProfile(data, db = getTenantClient()) {
  return await db.profile.create({
    data,
  });
}

export async function updateProfile(id, data, db = getTenantClient()) {
  return await db.profile.update({
    where: { id },
    data,
  });
}