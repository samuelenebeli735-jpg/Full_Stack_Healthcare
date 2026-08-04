import AppError from "../utils/AppError.js";
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

  const organization = await findOrganizationById(organizationId);

  if (!organization) {
    throw new AppError("Organization not found.", 404);
  }

  const existingPosition = await findPositionByCode(
    organizationId,
    data.code
  );

  if (existingPosition) {
    throw new AppError(
      "A position with this code already exists in this organization.",
      409
    );
  }

  const position = await createPosition({
    organizationId,
    name: data.name,
    code: data.code,
    description: data.description,
  });

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

  const { page, limit, skip } = getPagination(query);

  const { items, total } = await findPositionsByOrganization(resolvedOrgId, query);

  return { items, pagination: buildPaginationMeta({ page, limit, total }) };
}

export async function getPositionById(id, user) {
  const position = await findPositionById(id);

  if (!position) {
    throw new AppError("Position not found.", 404);
  }

  if (user.role !== "super_admin" && position.organizationId !== user.organizationId) {
    throw new AppError("Position not found.", 404);
  }

  return position;
}

export async function updateExistingPosition(id, data, user) {
  const position = await findPositionById(id);

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
    const existing = await findPositionByCode(organizationId, data.code);

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

  const updated = await updatePosition(id, updateData);

  await auditLogger({
    organizationId: position.organizationId,
    userId: user.id,
    action: "UPDATE",
    entity: "Position",
    entityId: id,
    description: `Position ${updated.name} (${updated.code}) updated.`,
  });

  return updated;
}

export async function removePosition(id, user) {
  const position = await findPositionById(id);

  if (!position) {
    throw new AppError("Position not found.", 404);
  }

  if (user.role !== "super_admin" && position.organizationId !== user.organizationId) {
    throw new AppError("Position not found.", 404);
  }

  try {
    await deletePosition(id);
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
    organizationId: position.organizationId,
    userId: user.id,
    action: "DELETE",
    entity: "Position",
    entityId: id,
    description: `Position ${position.name} (${position.code}) deleted.`,
  });
}
