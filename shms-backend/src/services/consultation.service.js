import AppError from "../utils/AppError.js";
import { auditLogger } from "../utils/auditLogger.js";
import { withTenant, withSuperAdmin, resolveUserScope } from "../utils/tenantContext.js";
import { getPagination, buildPaginationMeta } from "../utils/pagination.js";
import { NOTIFICATION_TYPES } from "../types/notificationType.js";
import { sendNotification } from "./notification.service.js";

import {
  findConsultationById,
  findConsultationByQueueId,
  findConsultations,
  createConsultation,
  updateConsultation,
  deleteConsultation,
} from "../repositories/consultation.repository.js";

import { findQueueById } from "../repositories/queue.repository.js";

export async function createPatientConsultation(data, user) {
  const scoped = resolveUserScope(user);

  let patientUserId = null;

  const result = await scoped(async (tx) => {
    const queue = await findQueueById(data.queueId, tx);

    if (!queue) {
      throw new AppError("Queue entry not found.", 404);
    }

    patientUserId = queue.appointment.medicalRecord.profile.userId;

    if (user.role !== "super_admin" && queue.organizationId !== user.organizationId) {
      throw new AppError("Queue entry not found.", 404);
    }

    if (queue.status !== "in_progress") {
      throw new AppError("Patient consultation has not started.", 400);
    }

    const existingConsultation = await findConsultationByQueueId(data.queueId, tx);

    if (existingConsultation) {
      throw new AppError("Consultation already exists.", 409);
    }

    const consultation = await createConsultation(data, tx);

    return {
      consultation,
      organizationId: queue.organizationId,
      queueNumber: queue.queueNumber,
    };
  });

  await auditLogger({
    organizationId: result.organizationId,
    userId: user.id,
    action: "CREATE",
    entity: "Consultation",
    entityId: result.consultation.id,
    description: `Consultation ${result.consultation.id} created for queue #${result.queueNumber}.`,
  });

  // Best-effort lifecycle notification to the patient (never blocks consultation creation).
  if (patientUserId) {
    try {
      await sendNotification(
        patientUserId,
        "Consultation completed",
        "Your consultation has been completed. Please check your records for details.",
        NOTIFICATION_TYPES.CONSULTATION
      );
    } catch (error) {
      console.error("Failed to send consultation notification:", error.message);
    }
  }

  return result.consultation;
}

export async function getConsultationById(id, user) {
  const scoped = resolveUserScope(user);

  const consultation = await scoped(async (tx) => {
    return await findConsultationById(id, tx);
  });

  if (!consultation) {
    throw new AppError("Consultation not found.", 404);
  }

  if (user.role !== "super_admin" && consultation.queue.organizationId !== user.organizationId) {
    throw new AppError("Consultation not found.", 404);
  }

  return consultation;
}

export async function getAllConsultations(user, query = {}) {
  const { page, limit } = getPagination(query);
  const organizationId = user.role === "super_admin" ? null : user.organizationId;

  const runner = organizationId
    ? (callback) => withTenant(organizationId, callback)
    : withSuperAdmin;

  const { items, total } = await runner(async (tx) => {
    return await findConsultations(organizationId, query, tx);
  });

  return {
    items,
    pagination: buildPaginationMeta({ page, limit, total }),
  };
}

export async function updatePatientConsultation(id, data, user) {
  const scoped = resolveUserScope(user);

  const consultation = await scoped(async (tx) => {
    return await findConsultationById(id, tx);
  });

  if (!consultation) {
    throw new AppError("Consultation not found.", 404);
  }

  if (user.role !== "super_admin" && consultation.queue.organizationId !== user.organizationId) {
    throw new AppError("Consultation not found.", 404);
  }

  // Stale-session guard: consultation can only be updated while the queue is in_progress.
  if (consultation.queue.status !== "in_progress") {
    throw new AppError(
      `Cannot update consultation: queue is in "${consultation.queue.status}" state. Only "in_progress" consultations can be modified.`,
      400
    );
  }

  const updated = await withTenant(consultation.queue.organizationId, async (tx) => {
    // Re-check under a row lock: the check above ran in an earlier
    // transaction, and a concurrent "complete" must not let this edit land.
    const rows = await tx.$queryRaw`SELECT status::text AS status FROM "Queue" WHERE id = ${consultation.queueId} FOR SHARE`;
    if (rows[0]?.status !== "in_progress") {
      throw new AppError(
        `Cannot update consultation: the visit is "${rows[0]?.status || "unknown"}". Only "in_progress" consultations can be modified.`,
        409
      );
    }
    return await updateConsultation(id, data, tx);
  });

  await auditLogger({
    organizationId: consultation.queue.organizationId,
    userId: user.id,
    action: "UPDATE",
    entity: "Consultation",
    entityId: id,
    description: `Consultation ${id} updated.`,
  });

  return updated;
}

export async function removeConsultation(id, user) {
  const scoped = resolveUserScope(user);

  const consultation = await scoped(async (tx) => {
    return await findConsultationById(id, tx);
  });

  if (!consultation) {
    throw new AppError("Consultation not found.", 404);
  }

  if (user.role !== "super_admin" && consultation.queue.organizationId !== user.organizationId) {
    throw new AppError("Consultation not found.", 404);
  }

  /* A consultation is part of the clinical record. It may only be removed
     while the visit is still open and before anything was prescribed:
     the Prescription relation cascades on delete, so deleting a consultation
     with a prescription would silently destroy the prescription too. Both
     conditions are re-checked inside the deleting transaction. */
  await withTenant(consultation.queue.organizationId, async (tx) => {
    const queue = await tx.queue.findUnique({
      where: { id: consultation.queueId },
      select: { status: true },
    });

    if (queue && queue.status === "completed") {
      throw new AppError("A consultation for a completed visit is part of the clinical record and cannot be deleted.", 409);
    }

    const prescription = await tx.prescription.findUnique({
      where: { consultationId: id },
      select: { id: true },
    });

    if (prescription) {
      throw new AppError("This consultation has a prescription and cannot be deleted.", 409);
    }

    await deleteConsultation(id, tx);
  });

  await auditLogger({
    organizationId: consultation.queue.organizationId,
    userId: user.id,
    action: "DELETE",
    entity: "Consultation",
    entityId: id,
    description: `Consultation ${id} deleted.`,
  });
}