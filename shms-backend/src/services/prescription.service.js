import AppError from "../utils/AppError.js";
import { auditLogger } from "../utils/auditLogger.js";
import { withTenant, withSuperAdmin, resolveUserScope } from "../utils/tenantContext.js";
import {
  getPagination,
  buildPaginationMeta,
} from "../utils/pagination.js";
import { NOTIFICATION_TYPES } from "../types/notificationType.js";
import { sendNotification } from "./notification.service.js";

import {
  createPrescription,
  createPrescriptionItems,
  findPrescriptionById,
  findPrescriptionByConsultation,
  findPrescriptions,
  updatePrescription,
  deletePrescription,
  deletePrescriptionItems,
} from "../repositories/prescription.repository.js";

import {
  findConsultationById,
} from "../repositories/consultation.repository.js";

export async function createNewPrescription(data, user) {
  const scoped = resolveUserScope(user);

  const consultation = await scoped(async (tx) => {
    return await findConsultationById(data.consultationId, tx);
  });

  if (!consultation) {
    throw new AppError("Consultation not found.", 404);
  }

  if (
    user.role !== "super_admin" &&
    consultation.queue.organizationId !== user.organizationId
  ) {
    throw new AppError("Consultation not found.", 404);
  }

  if (
    !data.items ||
    !Array.isArray(data.items) ||
    data.items.length === 0
  ) {
    throw new AppError(
      "At least one prescription item is required.",
      400
    );
  }

  const prescription = await withTenant(consultation.queue.organizationId, async (tx) => {
    // Same rule as update: only while the visit is in progress.
    await assertVisitInProgress(tx, consultation.queueId, "create");

    const existingPrescription = await findPrescriptionByConsultation(
      data.consultationId,
      tx
    );

    if (existingPrescription) {
      throw new AppError(
        "Prescription already exists for this consultation.",
        409
      );
    }

    const createdPrescription = await createPrescription(
      { consultationId: data.consultationId },
      tx
    );

    await createPrescriptionItems(
      data.items.map((item) => ({
        prescriptionId: createdPrescription.id,
        medicationName: item.medicationName,
        dosage: item.dosage,
        frequency: item.frequency,
        duration: item.duration,
        quantity: item.quantity,
        instructions: item.instructions,
      })),
      tx
    );

    return await findPrescriptionById(createdPrescription.id, tx);
  });

  await auditLogger({
    organizationId: consultation.queue.organizationId,
    userId: user.id,
    action: "CREATE",
    entity: "Prescription",
    entityId: prescription.id,
    description: `Created prescription for consultation ${consultation.id}.`,
  });

  // Best-effort lifecycle notification to the patient (never blocks prescription creation).
  const patientUserId =
    prescription?.consultation?.queue?.appointment?.medicalRecord?.profile?.userId || null;

  if (patientUserId) {
    try {
      await sendNotification(
        patientUserId,
        "Prescription created",
        "Your prescription has been created. Please check your records for details.",
        NOTIFICATION_TYPES.PRESCRIPTION
      );
    } catch (error) {
      console.error("Failed to send prescription notification:", error.message);
    }
  }

  return prescription;
}

export async function getAllPrescriptions(user, query = {}) {
  const { page, limit } = getPagination(query);
  const organizationId =
    user.role === "super_admin" ? null : user.organizationId;

  const runner = organizationId
    ? (callback) => withTenant(organizationId, callback)
    : withSuperAdmin;

  const { items, total } = await runner(async (tx) => {
    return await findPrescriptions(organizationId, query, tx);
  });

  return { items, pagination: buildPaginationMeta({ page, limit, total }) };
}

export async function getPrescriptionById(id, user) {
  const scoped = resolveUserScope(user);

  const prescription = await scoped(async (tx) => {
    return await findPrescriptionById(id, tx);
  });

  if (!prescription) {
    throw new AppError("Prescription not found.", 404);
  }

  if (
    user.role !== "super_admin" &&
    prescription.consultation.queue.organizationId !== user.organizationId
  ) {
    throw new AppError("Prescription not found.", 404);
  }

  return prescription;
}

/**
 * Lock the visit's queue row (FOR SHARE, inside the writing transaction) and
 * return its status, so a concurrent "complete" or cancel cannot slip in
 * between the check and the write.
 */
async function lockVisitStatus(tx, queueId) {
  const rows = await tx.$queryRaw`SELECT status::text AS status FROM "Queue" WHERE id = ${queueId} FOR SHARE`;
  return rows[0]?.status || null;
}

async function assertVisitInProgress(tx, queueId, action) {
  const status = await lockVisitStatus(tx, queueId);
  if (status !== "in_progress") {
    throw new AppError(
      `Cannot ${action} prescription: the visit is "${status || "unknown"}". Prescriptions can only be changed while the consultation is in progress.`,
      409
    );
  }
}

export async function updateExistingPrescription(id, data, user) {
  const scoped = resolveUserScope(user);

  const prescription = await scoped(async (tx) => {
    return await findPrescriptionById(id, tx);
  });

  if (!prescription) {
    throw new AppError("Prescription not found.", 404);
  }

  if (
    user.role !== "super_admin" &&
    prescription.consultation.queue.organizationId !== user.organizationId
  ) {
    throw new AppError("Prescription not found.", 404);
  }

  // Stale-session guard: prescription can only be updated while the queue is in_progress.
  if (prescription.consultation.queue.status !== "in_progress") {
    throw new AppError(
      `Cannot update prescription: queue is in "${prescription.consultation.queue.status}" state. Only "in_progress" prescriptions can be modified.`,
      400
    );
  }

  if (
    !data.items ||
    !Array.isArray(data.items) ||
    data.items.length === 0
  ) {
    throw new AppError(
      "At least one prescription item is required.",
      400
    );
  }

  const updatedPrescription = await withTenant(
    prescription.consultation.queue.organizationId,
    async (tx) => {
      // Re-check under a row lock: the check above ran in an earlier transaction.
      await assertVisitInProgress(tx, prescription.consultation.queueId, "update");
      await updatePrescription(id, {}, tx);
      await deletePrescriptionItems(id, tx);
      await createPrescriptionItems(
        data.items.map((item) => ({
          prescriptionId: id,
          medicationName: item.medicationName,
          dosage: item.dosage,
          frequency: item.frequency,
          duration: item.duration,
          quantity: item.quantity,
          instructions: item.instructions,
        })),
        tx
      );

      return await findPrescriptionById(id, tx);
    }
  );

  await auditLogger({
    organizationId:
      updatedPrescription.consultation.queue.organizationId,
    userId: user.id,
    action: "UPDATE",
    entity: "Prescription",
    entityId: id,
    description: `Updated prescription ${id}.`,
  });

  return updatedPrescription;
}

export async function removePrescription(id, user) {
  const scoped = resolveUserScope(user);

  const prescription = await scoped(async (tx) => {
    return await findPrescriptionById(id, tx);
  });

  if (!prescription) {
    throw new AppError("Prescription not found.", 404);
  }

  if (
    user.role !== "super_admin" &&
    prescription.consultation.queue.organizationId !== user.organizationId
  ) {
    throw new AppError("Prescription not found.", 404);
  }

  await withTenant(prescription.consultation.queue.organizationId, async (tx) => {
    // A completed visit's prescription is part of the clinical record, as for
    // consultations (removeConsultation).
    if ((await lockVisitStatus(tx, prescription.consultation.queueId)) === "completed") {
      throw new AppError(
        "A prescription for a completed visit is part of the clinical record and cannot be deleted.",
        409
      );
    }
    await deletePrescription(id, tx);
  });

  await auditLogger({
    organizationId:
      prescription.consultation.queue.organizationId,
    userId: user.id,
    action: "DELETE",
    entity: "Prescription",
    entityId: id,
    description: `Deleted prescription ${id}.`,
  });

  return { success: true };
}