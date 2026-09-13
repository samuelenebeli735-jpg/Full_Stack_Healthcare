import AppError from "../utils/AppError.js";
import { withTenant } from "../utils/tenantContext.js";
import { auditLogger } from "../utils/auditLogger.js";
import {
  getPagination,
  buildPaginationMeta,
} from "../utils/pagination.js";

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
  const isSuperAdmin = user.role === "super_admin";

  const consultation = await withTenant(user.organizationId, { isSuperAdmin }, (tx) =>
    findConsultationById(data.consultationId, tx)
  );

  if (!consultation) {
    throw new AppError("Consultation not found.", 404);
  }

  if (
    user.role !== "super_admin" &&
    consultation.queue.organizationId !== user.organizationId
  ) {
    throw new AppError("Consultation not found.", 404);
  }

  const organizationId = consultation.queue.organizationId;

  const existingPrescription = await withTenant(organizationId, { isSuperAdmin }, (tx) =>
    findPrescriptionByConsultation(data.consultationId, tx)
  );

  if (existingPrescription) {
    throw new AppError(
      "Prescription already exists for this consultation.",
      409
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

  const prescription = await withTenant(organizationId, { isSuperAdmin }, async (tx) => {
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

  return prescription;
}

export async function getAllPrescriptions(user, query = {}) {
  const { page, limit, skip } = getPagination(query);
  const organizationId =
    user.role === "super_admin" ? null : user.organizationId;
  const isSuperAdmin = user.role === "super_admin";

  const { items, total } = await withTenant(organizationId, { isSuperAdmin }, (tx) =>
    findPrescriptions(organizationId, query, tx)
  );

  return { items, pagination: buildPaginationMeta({ page, limit, total }) };
}

export async function getPrescriptionById(id, user) {
  const prescription = await withTenant(user.organizationId, { isSuperAdmin: user.role === "super_admin" }, (tx) =>
    findPrescriptionById(id, tx)
  );

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

export async function updateExistingPrescription(id, data, user) {
  const isSuperAdmin = user.role === "super_admin";

  const prescription = await withTenant(user.organizationId, { isSuperAdmin }, (tx) =>
    findPrescriptionById(id, tx)
  );

  if (!prescription) {
    throw new AppError("Prescription not found.", 404);
  }

  if (
    user.role !== "super_admin" &&
    prescription.consultation.queue.organizationId !== user.organizationId
  ) {
    throw new AppError("Prescription not found.", 404);
  }

  const organizationId = prescription.consultation.queue.organizationId;

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

  const updatedPrescription = await withTenant(organizationId, { isSuperAdmin }, async (tx) => {
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
  });

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
  const isSuperAdmin = user.role === "super_admin";

  const prescription = await withTenant(user.organizationId, { isSuperAdmin }, (tx) =>
    findPrescriptionById(id, tx)
  );

  if (!prescription) {
    throw new AppError("Prescription not found.", 404);
  }

  if (
    user.role !== "super_admin" &&
    prescription.consultation.queue.organizationId !== user.organizationId
  ) {
    throw new AppError("Prescription not found.", 404);
  }

  const organizationId = prescription.consultation.queue.organizationId;

  await withTenant(organizationId, { isSuperAdmin }, (tx) =>
    deletePrescription(id, tx)
  );

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
