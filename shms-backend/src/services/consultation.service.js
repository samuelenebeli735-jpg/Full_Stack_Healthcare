import AppError from "../utils/AppError.js";
import { withTenant } from "../utils/tenantContext.js";
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
  const isSuperAdmin = user.role === "super_admin";

  const queue = await withTenant(user.organizationId, { isSuperAdmin }, (tx) =>
    findQueueById(data.queueId, tx)
  );

  if (!queue) {
    throw new AppError("Queue entry not found.", 404);
  }

  if (user.role !== "super_admin" && queue.organizationId !== user.organizationId) {
    throw new AppError("Queue entry not found.", 404);
  }

  if (queue.status !== "in_progress") {
    throw new AppError("Patient consultation has not started.", 400);
  }

  const existingConsultation = await withTenant(queue.organizationId, { isSuperAdmin }, (tx) =>
    findConsultationByQueueId(data.queueId, tx)
  );

  if (existingConsultation) {
    throw new AppError("Consultation already exists.", 409);
  }

  const consultation = await withTenant(queue.organizationId, { isSuperAdmin }, (tx) =>
    createConsultation(data, tx)
  );

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
  const consultation = await withTenant(user.organizationId, { isSuperAdmin: user.role === "super_admin" }, (tx) =>
    findConsultationById(id, tx)
  );

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
  const isSuperAdmin = user.role === "super_admin";

  const { items, total } = await withTenant(organizationId, { isSuperAdmin }, (tx) =>
    findConsultations(organizationId, query, tx)
  );

  return {
    items,
    pagination: buildPaginationMeta({ page, limit, total }),
  };
}

export async function updatePatientConsultation(id, data, user) {
  const isSuperAdmin = user.role === "super_admin";

  const consultation = await withTenant(user.organizationId, { isSuperAdmin }, (tx) =>
    findConsultationById(id, tx)
  );

  if (!consultation) {
    throw new AppError("Consultation not found.", 404);
  }

  if (user.role !== "super_admin" && consultation.queue.organizationId !== user.organizationId) {
    throw new AppError("Consultation not found.", 404);
  }

  const organizationId = consultation.queue.organizationId;

  const updated = await withTenant(organizationId, { isSuperAdmin }, (tx) =>
    updateConsultation(id, data, tx)
  );

  await auditLogger({
    organizationId,
    userId: user.id,
    action: "UPDATE",
    entity: "Consultation",
    entityId: id,
    description: `Consultation ${id} updated.`,
  });

  return updated;
}

export async function removeConsultation(id, user) {
  const isSuperAdmin = user.role === "super_admin";

  const consultation = await withTenant(user.organizationId, { isSuperAdmin }, (tx) =>
    findConsultationById(id, tx)
  );

  if (!consultation) {
    throw new AppError("Consultation not found.", 404);
  }

  if (user.role !== "super_admin" && consultation.queue.organizationId !== user.organizationId) {
    throw new AppError("Consultation not found.", 404);
  }

  const organizationId = consultation.queue.organizationId;

  await withTenant(organizationId, { isSuperAdmin }, (tx) =>
    deleteConsultation(id, tx)
  );

  await auditLogger({
    organizationId,
    userId: user.id,
    action: "DELETE",
    entity: "Consultation",
    entityId: id,
    description: `Consultation ${id} deleted.`,
  });
}