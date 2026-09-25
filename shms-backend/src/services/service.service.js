import AppError from "../utils/AppError.js";
import {
  resolveOrganizationId,
} from "../utils/tenantAccess.js";
import {
  getPagination,
  buildPaginationMeta,
} from "../utils/pagination.js";
import { auditLogger } from "../utils/auditLogger.js";
import { withTenant, withSuperAdmin, resolveUserScope } from "../utils/tenantContext.js";

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

  const organization = await findOrganizationById(organizationId);

  if (!organization) {
    throw new AppError("Organization not found.", 404);
  }

  const service = await withTenant(organizationId, async (tx) => {
    const existingService = await findServiceByCode(
      organizationId,
      data.code,
      tx
    );

    if (existingService) {
      throw new AppError(
        "A service with this code already exists in this organization.",
        409
      );
    }

    return await createService({
      organizationId,
      name: data.name,
      code: data.code,
      description: data.description,
      estimatedDuration: data.estimatedDuration,
    }, tx);
  });

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

  const runner = resolvedOrgId
    ? (callback) => withTenant(resolvedOrgId, callback)
    : withSuperAdmin;

  const { page, limit } = getPagination(query);

  const { items, total } = await runner(async (tx) => {
    return await findServicesByOrganization(resolvedOrgId, query, tx);
  });

  return { items, pagination: buildPaginationMeta({ page, limit, total }) };
}

export async function getServiceById(id, organizationId, user) {
  const resolvedOrgId = resolveOrganizationId(organizationId, user);

  const runner = resolvedOrgId
    ? (callback) => withTenant(resolvedOrgId, callback)
    : withSuperAdmin;

  const service = await runner(async (tx) => {
    return await findServiceById(id, tx);
  });

  if (!service || service.organizationId !== resolvedOrgId) {
    throw new AppError("Service not found.", 404);
  }

  return service;
}

export async function updateExistingService(id, data, user) {
  const scoped = resolveUserScope(user);

  const service = await scoped(async (tx) => {
    return await findServiceById(id, tx);
  });

  if (!service) {
    throw new AppError("Service not found.", 404);
  }

  if (
    user.role !== "super_admin" &&
    service.organizationId !== user.organizationId
  ) {
    throw new AppError("Service not found.", 404);
  }

  const updated = await withTenant(service.organizationId, async (tx) => {
    if (data.code !== undefined && data.code !== service.code) {
      const existingService = await findServiceByCode(
        service.organizationId,
        data.code,
        tx
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

    return await updateService(id, updateData, tx);
  });

  await auditLogger({
    organizationId: service.organizationId,
    userId: user.id,
    action: "UPDATE",
    entity: "Service",
    entityId: id,
    description: `Service "${updated.name}" updated.`,
  });

  return updated;
}

export async function removeService(id, user) {
  const scoped = resolveUserScope(user);

  const service = await scoped(async (tx) => {
    return await findServiceById(id, tx);
  });

  if (!service) {
    throw new AppError("Service not found.", 404);
  }

  if (
    user.role !== "super_admin" &&
    service.organizationId !== user.organizationId
  ) {
    throw new AppError("Service not found.", 404);
  }

  try {
    await withTenant(service.organizationId, async (tx) => {
      await deleteService(id, tx);
    });
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
    organizationId: service.organizationId,
    userId: user.id,
    action: "DELETE",
    entity: "Service",
    entityId: id,
    description: `Service "${service.name}" deleted.`,
  });
}