import AppError from "../utils/AppError.js";
import { auditLogger } from "../utils/auditLogger.js";
import { withTenant, withSuperAdmin, resolveUserScope } from "../utils/tenantContext.js";
import { findUserOrgHint } from "../repositories/user.repository.js";
import { getPagination, buildPaginationMeta } from "../utils/pagination.js";

import {
  findMedicalRecordByProfileId,
  findMedicalRecordById,
  findMedicalRecords,
  nextMedicalRecordSeq,
  createMedicalRecord,
  updateMedicalRecord,
} from "../repositories/medical-record.repository.js";

import {
  findProfileByUserId,
} from "../repositories/profile.repository.js";

/**
 * Format a medical record number.
 * Example: MR-2026-000001
 */
function formatRecordNumber(year, seq) {
  return `MR-${year}-${String(seq).padStart(6, "0")}`;
}

/**
 * Create a medical record for the authenticated student.
 *
 * Concurrency: the sequence is reserved atomically by the database
 * (INSERT ... ON CONFLICT on the per-(organizationId, recordYear) counter)
 * inside the same tenant-scoped transaction as the row insert, so two
 * concurrent creates for the same organization + year always receive
 * distinct numbers. Uniqueness is additionally enforced at the schema level
 * by the composite unique index (organizationId, recordYear, recordSeq).
 */
export async function createStudentMedicalRecord(user) {
  const userId = user.id;
  const organizationId = user.organizationId;

  // Find the student's profile (tenant-scoped).
  let profile;

  await withTenant(organizationId, async (tx) => {
    const found = await findProfileByUserId(userId, tx);

    if (!found) {
      throw new AppError("Student profile not found.", 404);
    }

    profile = found;
  });

  const year = new Date().getFullYear();

  // Retry transient unique-constraint conflicts (e.g. two concurrent creates
  // for the SAME student racing on the profileId unique column). Sequence
  // conflicts cannot occur because the counter is serialized by the DB.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await withTenant(organizationId, async (tx) => {
        // Ensure a medical record doesn't already exist
        const existingRecord = await findMedicalRecordByProfileId(profile.id, tx);

        if (existingRecord) {
          throw new AppError(
            "Medical record already exists for this student.",
            409
          );
        }

        const seq = await nextMedicalRecordSeq(organizationId, year, tx);
        const recordNumber = formatRecordNumber(year, seq);

        const medicalRecord = await createMedicalRecord({
          profileId: profile.id,
          organizationId,
          recordNumber,
          recordSeq: seq,
          recordYear: year,
        }, tx);

        await auditLogger({
          organizationId,
          userId: userId,
          action: "CREATE",
          entity: "MedicalRecord",
          entityId: medicalRecord.id,
          description: `Medical record ${medicalRecord.recordNumber} created for student ${profile.firstName} ${profile.lastName}.`,
        });

        return medicalRecord;
      });
    } catch (error) {
      if (error.code === "P2002" && attempt < 4) {
        continue;
      }
      throw error;
    }
  }
}

export async function getMyMedicalRecord(user) {
  return await withTenant(user.organizationId, async (tx) => {
    const profile = await findProfileByUserId(user.id, tx);

    if (!profile) {
      return null;
    }

    return await findMedicalRecordByProfileId(profile.id, tx);
  });
}

export async function getStudentMedicalRecordById(id, userId) {
  // Services that only receive a userId resolve the organization through the
  // SECURITY DEFINER org hint before entering a tenant scope.
  const hint = await findUserOrgHint(userId);

  if (!hint) {
    throw new AppError("Student profile not found.", 404);
  }

  return await withTenant(hint.organizationId, async (tx) => {
    const profile = await findProfileByUserId(userId, tx);

    if (!profile) {
      throw new AppError("Student profile not found.", 404);
    }

    const record = await findMedicalRecordById(id, tx);

    if (!record || record.profileId !== profile.id) {
      throw new AppError("Medical record not found.", 404);
    }

    return record;
  });
}

export async function getOrganizationMedicalRecords(user, query = {}) {
  const organizationId = user.role === "super_admin" ? null : user.organizationId;

  const runner = organizationId
    ? (callback) => withTenant(organizationId, callback)
    : withSuperAdmin;

  const { page, limit } = getPagination(query);

  const { items, total } = await runner(async (tx) => {
    return await findMedicalRecords(organizationId, query, tx);
  });

  return {
    items,
    pagination: buildPaginationMeta({ page, limit, total }),
  };
}

export async function getMedicalRecordById(id, user) {
  const scoped = resolveUserScope(user);

  const record = await scoped(async (tx) => {
    return await findMedicalRecordById(id, tx);
  });

  if (!record) {
    throw new AppError("Medical record not found.", 404);
  }

  if (user.role !== "super_admin" && record.profile.user.organizationId !== user.organizationId) {
    throw new AppError("Medical record not found.", 404);
  }

  return record;
}

export async function updateExistingMedicalRecord(id, data, user) {
  const scoped = resolveUserScope(user);

  const record = await scoped(async (tx) => {
    return await findMedicalRecordById(id, tx);
  });

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

  const updated = await withTenant(record.profile.user.organizationId, async (tx) => {
    return await updateMedicalRecord(id, updateData, tx);
  });

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