import AppError from "../utils/AppError.js";
import {
  resolveOrganizationId,
} from "../utils/tenantAccess.js";
import { withTenant } from "../utils/tenantContext.js";
import {
  getPagination,
  buildPaginationMeta,
} from "../utils/pagination.js";
import { auditLogger } from "../utils/auditLogger.js";

import {
  findServiceById,
  findServiceByCode,
  findServicesByOrganization,
  createService,
  updateService,
  deleteService,
} from "../repositories/service.repository.js";

import {
  findOrganizationById,
} from "../repositories/organization.repository.js";

export async function createNewService(data, user) {
  const organizationId =
    user.role === "super_admin"
      ? data.organizationId
      : user.organizationId;
  const isSuperAdmin = user.role === "super_admin";

  const organization = await withTenant(organizationId, { isSuperAdmin }, (tx) =>
    findOrganizationById(organizationId, tx)
  );

  if (!organization) {
    throw new AppError("Organization not found.", 404);
  }

  const existingService = await withTenant(organizationId, { isSuperAdmin }, (tx) =>
    findServiceByCode(organizationId, data.code, tx)
  );

  if (existingService) {
    throw new AppError(
      "A service with this code already exists in this organization.",
      409
    );
  }

  const service = await withTenant(organizationId, { isSuperAdmin }, (tx) =>
    createService({
      organizationId,
      name: data.name,
      code: data.code,
      description: data.description,
      estimatedDuration: data.estimatedDuration,
    }, tx)
  );

  await auditLogger({
    organizationId,
    userId: user.id,
    action: "CREATE",
    entity: "Service",
    entityId: service.id,
    description: `Service "${service.name}" created.`,
  });

  return service;
}

export async function getOrganizationServices(organizationId, user, query = {}) {
  const resolvedOrgId = resolveOrganizationId(organizationId, user);

  const isSuperAdmin = user.role === "super_admin";

  const { page, limit, skip } = getPagination(query);

  const { items, total } = await withTenant(resolvedOrgId, { isSuperAdmin }, (tx) =>
    findServicesByOrganization(resolvedOrgId, query, tx)
  );

  return { items, pagination: buildPaginationMeta({ page, limit, total }) };
}

export async function getServiceById(id, organizationId, user) {
  const resolvedOrgId = resolveOrganizationId(organizationId, user);

  const service = await withTenant(resolvedOrgId, { isSuperAdmin: user.role === "super_admin" }, (tx) =>
    findServiceById(id, tx)
  );

  if (!service || service.organizationId !== resolvedOrgId) {
    throw new AppError("Service not found.", 404);
  }

  return service;
}

export async function updateExistingService(id, data, user) {
  const isSuperAdmin = user.role === "super_admin";

  const service = await withTenant(user.organizationId, { isSuperAdmin }, (tx) =>
    findServiceById(id, tx)
  );

  if (!service) {
    throw new AppError("Service not found.", 404);
  }

  if (
    user.role !== "super_admin" &&
    service.organizationId !== user.organizationId
  ) {
    throw new AppError("Service not found.", 404);
  }

  const organizationId = service.organizationId;

  if (data.code !== undefined && data.code !== service.code) {
    const existingService = await withTenant(organizationId, { isSuperAdmin }, (tx) =>
      findServiceByCode(organizationId, data.code, tx)
    );

    if (existingService) {
      throw new AppError(
        "A service with this code already exists in this organization.",
        409
      );
    }
  }

  const updateData = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.code !== undefined) updateData.code = data.code;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.estimatedDuration !== undefined) updateData.estimatedDuration = data.estimatedDuration;

  const updated = await withTenant(organizationId, { isSuperAdmin }, (tx) =>
    updateService(id, updateData, tx)
  );

  await auditLogger({
    organizationId,
    userId: user.id,
    action: "UPDATE",
    entity: "Service",
    entityId: id,
    description: `Service "${updated.name}" updated.`,
  });

  return updated;
}

export async function removeService(id, user) {
  const isSuperAdmin = user.role === "super_admin";

  const service = await withTenant(user.organizationId, { isSuperAdmin }, (tx) =>
    findServiceById(id, tx)
  );

  if (!service) {
    throw new AppError("Service not found.", 404);
  }

  if (
    user.role !== "super_admin" &&
    service.organizationId !== user.organizationId
  ) {
    throw new AppError("Service not found.", 404);
  }

  const organizationId = service.organizationId;

  try {
    await withTenant(organizationId, { isSuperAdmin }, (tx) =>
      deleteService(id, tx)
    );
  } catch (error) {
    if (error.code === "P2003") {
      throw new AppError(
        "Cannot delete service because it is referenced by other records.",
        409
      );
    }
    throw error;
  }

  await auditLogger({
    organizationId,
    userId: user.id,
    action: "DELETE",
    entity: "Service",
    entityId: id,
    description: `Service "${service.name}" deleted.`,
  });
}