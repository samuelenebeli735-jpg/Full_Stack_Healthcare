import AppError from "../utils/AppError.js";
import { withTenant } from "../utils/tenantContext.js";
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

import {
  findUserOrgHint,
} from "../repositories/user.repository.js";

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

  const organizationId = user.organizationId;

  const record = await withTenant(organizationId, async (tx) => {
    // Find the student's profile
    const profile = await findProfileByUserId(userId, tx);

    if (!profile) {
      throw new AppError("Student profile not found.", 404);
    }

    // Ensure a medical record doesn't already exist
    const existingRecord = await findMedicalRecordByProfileId(profile.id, tx);

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
      const count = await countMedicalRecordsByYear(year, tx);
      const recordNumber = generateRecordNumber(count, year);

      try {
        medicalRecord = await createMedicalRecord({
          profileId: profile.id,
          recordNumber,
          recordYear: year,
        }, tx);
        break;
      } catch (error) {
        if (error.code === "P2002" && attempt < 4) {
          continue;
        }
        throw error;
      }
    }

    return medicalRecord;
  });

  await auditLogger({
    organizationId,
    userId: userId,
    action: "CREATE",
    entity: "MedicalRecord",
    entityId: record.id,
    description: `Medical record ${record.recordNumber} created for student.`,
  });

  return record;
}

export async function getMyMedicalRecord(user) {
  const profile = await withTenant(user.organizationId, (tx) =>
    findProfileByUserId(user.id, tx)
  );

  if (!profile) {
    return null;
  }

  return await withTenant(user.organizationId, (tx) =>
    findMedicalRecordByProfileId(profile.id, tx)
  );
}

export async function getStudentMedicalRecordById(id, userId) {
  const hint = await findUserOrgHint(userId);

  if (!hint?.organizationId) {
    throw new AppError("Student profile not found.", 404);
  }

  const record = await withTenant(hint.organizationId, async (tx) => {
    const profile = await findProfileByUserId(userId, tx);

    if (!profile) {
      throw new AppError("Student profile not found.", 404);
    }

    const found = await findMedicalRecordById(id, tx);

    if (!found || found.profileId !== profile.id) {
      throw new AppError("Medical record not found.", 404);
    }

    return found;
  });

  return record;
}

export async function getOrganizationMedicalRecords(user, query = {}) {
  const organizationId = user.role === "super_admin" ? null : user.organizationId;
  const isSuperAdmin = user.role === "super_admin";

  const { page, limit } = getPagination(query);

  const { items, total } = await withTenant(organizationId, { isSuperAdmin }, (tx) =>
    findMedicalRecords(organizationId, query, tx)
  );

  return {
    items,
    pagination: buildPaginationMeta({ page, limit, total }),
  };
}

export async function getMedicalRecordById(id, user) {
  const record = await withTenant(user.organizationId, { isSuperAdmin: user.role === "super_admin" }, (tx) =>
    findMedicalRecordById(id, tx)
  );

  if (!record) {
    throw new AppError("Medical record not found.", 404);
  }

  if (user.role !== "super_admin" && record.profile.user.organizationId !== user.organizationId) {
    throw new AppError("Medical record not found.", 404);
  }

  return record;
}

export async function updateExistingMedicalRecord(id, data, user) {
  const isSuperAdmin = user.role === "super_admin";

  const record = await withTenant(user.organizationId, { isSuperAdmin }, (tx) =>
    findMedicalRecordById(id, tx)
  );

  if (!record) {
    throw new AppError("Medical record not found.", 404);
  }

  if (user.role !== "super_admin" && record.profile.user.organizationId !== user.organizationId) {
    throw new AppError("Medical record not found.", 404);
  }

  if (user.role === "student" && record.profile.user.id !== user.id) {
    throw new AppError("Medical record not found.", 404);
  }

  const organizationId = record.profile.user.organizationId;

  const updateData = {};

  if (data.status !== undefined) {
    updateData.status = data.status;
  }

  const updated = await withTenant(organizationId, { isSuperAdmin }, (tx) =>
    updateMedicalRecord(id, updateData, tx)
  );

  await auditLogger({
    organizationId,
    userId: user.id,
    action: "UPDATE",
    entity: "MedicalRecord",
    entityId: id,
    description: `Medical record ${record.recordNumber} updated.`,
  });

  return updated;
}