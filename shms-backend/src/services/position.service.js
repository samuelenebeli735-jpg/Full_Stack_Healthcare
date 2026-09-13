import AppError from "../utils/AppError.js";
import { withTenant } from "../utils/tenantContext.js";
import { auditLogger } from "../utils/auditLogger.js";
import { getPagination, buildPaginationMeta } from "../utils/pagination.js";

import {
  findPositionById,
  findPositionByCode,
  findPositionsByOrganization,
  createPosition,
  updatePosition,
  deletePosition,
} from "../repositories/position.repository.js";

import { findOrganizationById } from "../repositories/organization.repository.js";

export async function createNewPosition(data, user) {
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

  const existingPosition = await withTenant(organizationId, { isSuperAdmin }, (tx) =>
    findPositionByCode(organizationId, data.code, tx)
  );

  if (existingPosition) {
    throw new AppError(
      "A position with this code already exists in this organization.",
      409
    );
  }

  const position = await withTenant(organizationId, { isSuperAdmin }, (tx) =>
    createPosition({
      organizationId,
      name: data.name,
      code: data.code,
      description: data.description,
    }, tx)
  );

  await auditLogger({
    organizationId,
    userId: user.id,
    action: "CREATE",
    entity: "Position",
    entityId: position.id,
    description: `Position ${position.name} (${position.code}) created.`,
  });

  return position;
}

export async function getOrganizationPositions(organizationId, user, query = {}) {
  // null means "all organizations" for super_admin; the repository
  // only filters by organizationId when it is provided.
  const resolvedOrgId =
    user.role === "super_admin"
      ? organizationId ?? null
      : user.organizationId;
  const isSuperAdmin = user.role === "super_admin";

  const { page, limit, skip } = getPagination(query);

  const { items, total } = await withTenant(resolvedOrgId, { isSuperAdmin }, (tx) =>
    findPositionsByOrganization(resolvedOrgId, query, tx)
  );

  return { items, pagination: buildPaginationMeta({ page, limit, total }) };
}

export async function getPositionById(id, user) {
  const position = await withTenant(user.organizationId, { isSuperAdmin: user.role === "super_admin" }, (tx) =>
    findPositionById(id, tx)
  );

  if (!position) {
    throw new AppError("Position not found.", 404);
  }

  if (user.role !== "super_admin" && position.organizationId !== user.organizationId) {
    throw new AppError("Position not found.", 404);
  }

  return position;
}

export async function updateExistingPosition(id, data, user) {
  const isSuperAdmin = user.role === "super_admin";

  const position = await withTenant(user.organizationId, { isSuperAdmin }, (tx) =>
    findPositionById(id, tx)
  );

  if (!position) {
    throw new AppError("Position not found.", 404);
  }

  const organizationId =
    user.role === "super_admin"
      ? data.organizationId ?? position.organizationId
      : user.organizationId;

  if (position.organizationId !== organizationId) {
    throw new AppError("Position not found.", 404);
  }

  if (data.code && data.code !== position.code) {
    const existing = await withTenant(organizationId, { isSuperAdmin }, (tx) =>
      findPositionByCode(organizationId, data.code, tx)
    );

    if (existing && existing.id !== id) {
      throw new AppError(
        "A position with this code already exists in this organization.",
        409
      );
    }
  }

  const updateData = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.code !== undefined) updateData.code = data.code;
  if (data.description !== undefined) updateData.description = data.description;

  const updated = await withTenant(organizationId, { isSuperAdmin }, (tx) =>
    updatePosition(id, updateData, tx)
  );

  await auditLogger({
    organizationId,
    userId: user.id,
    action: "UPDATE",
    entity: "Position",
    entityId: id,
    description: `Position ${updated.name} (${updated.code}) updated.`,
  });

  return updated;
}

export async function removePosition(id, user) {
  const isSuperAdmin = user.role === "super_admin";

  const position = await withTenant(user.organizationId, { isSuperAdmin }, (tx) =>
    findPositionById(id, tx)
  );

  if (!position) {
    throw new AppError("Position not found.", 404);
  }

  if (user.role !== "super_admin" && position.organizationId !== user.organizationId) {
    throw new AppError("Position not found.", 404);
  }

  const organizationId = position.organizationId;

  try {
    await withTenant(organizationId, { isSuperAdmin }, (tx) =>
      deletePosition(id, tx)
    );
  } catch (error) {
    if (error.code === "P2003") {
      throw new AppError(
        "Cannot delete position because it is referenced by staff or other records.",
        409
      );
    }
    throw error;
  }

  await auditLogger({
    organizationId,
    userId: user.id,
    action: "DELETE",
    entity: "Position",
    entityId: id,
    description: `Position ${position.name} (${position.code}) deleted.`,
  });
}