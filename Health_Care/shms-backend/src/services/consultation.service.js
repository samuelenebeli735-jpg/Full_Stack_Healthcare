import prisma from "../config/db.js";
import AppError from "../utils/AppError.js";
import { auditLogger } from "../utils/auditLogger.js";
import { getPagination, buildPaginationMeta } from "../utils/pagination.js";

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
  const consultation = await prisma.$transaction(async (tx) => {
    const queue = await findQueueById(data.queueId, tx);

    if (!queue) {
      throw new AppError("Queue entry not found.", 404);
    }

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

    return await createConsultation(data, tx);
  });

  const queue = await findQueueById(data.queueId);

  await auditLogger({
    organizationId: queue.organizationId,
    userId: user.id,
    action: "CREATE",
    entity: "Consultation",
    entityId: consultation.id,
    description: `Consultation ${consultation.id} created for queue #${queue.queueNumber}.`,
  });

  return consultation;
}

export async function getConsultationById(id, user) {
  const consultation = await findConsultationById(id);

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

  const { items, total } = await findConsultations(organizationId, query);

  return {
    items,
    pagination: buildPaginationMeta({ page, limit, total }),
  };
}

export async function updatePatientConsultation(id, data, user) {
  const consultation = await findConsultationById(id);

  if (!consultation) {
    throw new AppError("Consultation not found.", 404);
  }

  if (user.role !== "super_admin" && consultation.queue.organizationId !== user.organizationId) {
    throw new AppError("Consultation not found.", 404);
  }

  const updated = await updateConsultation(id, data);

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
  const consultation = await findConsultationById(id);

  if (!consultation) {
    throw new AppError("Consultation not found.", 404);
  }

  if (user.role !== "super_admin" && consultation.queue.organizationId !== user.organizationId) {
    throw new AppError("Consultation not found.", 404);
  }

  await deleteConsultation(id);

  await auditLogger({
    organizationId: consultation.queue.organizationId,
    userId: user.id,
    action: "DELETE",
    entity: "Consultation",
    entityId: id,
    description: `Consultation ${id} deleted.`,
  });
}
