import AppError from "../utils/AppError.js";
import { auditLogger } from "../utils/auditLogger.js";
import { withTenant, withSuperAdmin, resolveUserScope } from "../utils/tenantContext.js";
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
  const scoped = resolveUserScope(user);

  const result = await scoped(async (tx) => {
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

  const updated = await withTenant(consultation.queue.organizationId, async (tx) => {
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

  await withTenant(consultation.queue.organizationId, async (tx) => {
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