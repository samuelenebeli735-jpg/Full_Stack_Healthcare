import prisma from "../config/db.js";
import AppError from "../utils/AppError.js";
import { auditLogger } from "../utils/auditLogger.js";
import { getPagination, buildPaginationMeta } from "../utils/pagination.js";

import {
  findMedicalRecordByProfileId,
  findMedicalRecordById,
  findMedicalRecords,
  countMedicalRecordsByYear,
  createMedicalRecord,
  updateMedicalRecord,
} from "../repositories/medical-record.repository.js";

import {
  findProfileByUserId,
} from "../repositories/profile.repository.js";

/**
 * Generate a medical record number.
 * Example: MR-2026-000001
 */
function generateRecordNumber(count, year) {
  return `MR-${year}-${String(count + 1).padStart(6, "0")}`;
}

/**
 * Create a medical record for the authenticated student.
 */
export async function createStudentMedicalRecord(user) {
  const userId = user.id;

  // Find the student's profile
  const profile = await findProfileByUserId(userId);

  if (!profile) {
    throw new AppError("Student profile not found.", 404);
  }

  // Ensure a medical record doesn't already exist
  const existingRecord = await findMedicalRecordByProfileId(profile.id);

  if (existingRecord) {
    throw new AppError(
      "Medical record already exists for this student.",
      409
    );
  }

  const year = new Date().getFullYear();

  let medicalRecord;

  // Retry on the unique recordNumber constraint so concurrent creates
  // get distinct numbers instead of a generic 409.
  for (let attempt = 0; attempt < 5; attempt++) {
    const count = await countMedicalRecordsByYear(year);
    const recordNumber = generateRecordNumber(count, year);

    try {
      medicalRecord = await createMedicalRecord({
        profileId: profile.id,
        recordNumber,
        recordYear: year,
      });
      break;
    } catch (error) {
      if (error.code === "P2002" && attempt < 4) {
        continue;
      }
      throw error;
    }
  }

  await auditLogger({
    organizationId: user.organizationId,
    userId: userId,
    action: "CREATE",
    entity: "MedicalRecord",
    entityId: medicalRecord.id,
    description: `Medical record ${medicalRecord.recordNumber} created for student ${profile.firstName} ${profile.lastName}.`,
  });

  return medicalRecord;
}

export async function getMyMedicalRecord(user) {
  const profile = await findProfileByUserId(user.id);

  if (!profile) {
    return null;
  }

  return await findMedicalRecordByProfileId(profile.id);
}

export async function getStudentMedicalRecordById(id, userId) {
  const profile = await findProfileByUserId(userId);

  if (!profile) {
    throw new AppError("Student profile not found.", 404);
  }

  const record = await findMedicalRecordById(id);

  if (!record || record.profileId !== profile.id) {
    throw new AppError("Medical record not found.", 404);
  }

  return record;
}

export async function getOrganizationMedicalRecords(user, query = {}) {
  const organizationId = user.role === "super_admin" ? null : user.organizationId;

  const { page, limit } = getPagination(query);

  const { items, total } = await findMedicalRecords(organizationId, query);

  return {
    items,
    pagination: buildPaginationMeta({ page, limit, total }),
  };
}

export async function getMedicalRecordById(id, user) {
  const record = await findMedicalRecordById(id);

  if (!record) {
    throw new AppError("Medical record not found.", 404);
  }

  if (user.role !== "super_admin" && record.profile.user.organizationId !== user.organizationId) {
    throw new AppError("Medical record not found.", 404);
  }

  return record;
}

export async function updateExistingMedicalRecord(id, data, user) {
  const record = await findMedicalRecordById(id);

  if (!record) {
    throw new AppError("Medical record not found.", 404);
  }

  if (user.role !== "super_admin" && record.profile.user.organizationId !== user.organizationId) {
    throw new AppError("Medical record not found.", 404);
  }

  if (user.role === "student" && record.profile.user.id !== user.id) {
    throw new AppError("Medical record not found.", 404);
  }

  const updateData = {};

  if (data.status !== undefined) {
    updateData.status = data.status;
  }

  const updated = await updateMedicalRecord(id, updateData);

  await auditLogger({
    organizationId: record.profile.user.organizationId,
    userId: user.id,
    action: "UPDATE",
    entity: "MedicalRecord",
    entityId: id,
    description: `Medical record ${record.recordNumber} updated.`,
  });

  return updated;
}