import AppError from "../utils/AppError.js";
import { auditLogger } from "../utils/auditLogger.js";
import { withTenant, withSuperAdmin, resolveUserScope } from "../utils/tenantContext.js";
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