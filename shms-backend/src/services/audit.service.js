import AppError from "../utils/AppError.js";
import {
  resolveOrganizationId,
} from "../utils/tenantAccess.js";
import { withTenant } from "../utils/tenantContext.js";
import {
  getPagination,
  buildPaginationMeta,
} from "../utils/pagination.js";

import {
  createAuditLog,
  findAuditLogById,
  findAuditLogs,
  findAuditLogsByOrganization,
  deleteAuditLog,
} from "../repositories/audit.repository.js";

export async function logAction(data) {
  try {
    if (!data.organizationId) {
      return;
    }

    return await withTenant(data.organizationId, { isSuperAdmin: true }, (tx) =>
      createAuditLog(data, tx)
    );
  } catch (error) {
    // Audit logging must never break the main operation
  }
}

export async function getAuditLogById(id, user) {
  const log = await withTenant(user.organizationId, { isSuperAdmin: user.role === "super_admin" }, (tx) =>
    findAuditLogById(id, tx)
  );

  if (!log) {
    throw new AppError("Audit log not found.", 404);
  }

  if (
    user.role !== "super_admin" &&
    log.organizationId !== user.organizationId
  ) {
    throw new AppError(
      "Audit log not found.",
      404
    );
  }

  return log;
}

export async function getAllAuditLogs(user, query = {}) {
  if (user.role === "super_admin") {
    const { page, limit, skip } = getPagination(query);
    const { items, total } = await withTenant(null, { isSuperAdmin: true }, (tx) =>
      findAuditLogs(null, query, tx)
    );
    return { items, pagination: buildPaginationMeta({ page, limit, total }) };
  }

  if (user.role === "admin") {
    const { page, limit, skip } = getPagination(query);
    const { items, total } = await withTenant(user.organizationId, (tx) =>
      findAuditLogsByOrganization(user.organizationId, query, tx)
    );
    return { items, pagination: buildPaginationMeta({ page, limit, total }) };
  }

  throw new AppError(
    "You do not have permission to view audit logs.",
    403
  );
}

export async function getOrganizationAuditLogs(organizationId, user, query = {}) {
  const resolvedOrgId = resolveOrganizationId(organizationId, user);

  const isSuperAdmin = user.role === "super_admin";

  const { page, limit, skip } = getPagination(query);
  const { items, total } = await withTenant(resolvedOrgId, { isSuperAdmin }, (tx) =>
    findAuditLogsByOrganization(resolvedOrgId, query, tx)
  );

  return { items, pagination: buildPaginationMeta({ page, limit, total }) };
}

export async function removeAuditLog(id, user) {
  const log = await withTenant(user.organizationId, { isSuperAdmin: user.role === "super_admin" }, (tx) =>
    findAuditLogById(id, tx)
  );

  if (!log) {
    throw new AppError("Audit log not found.", 404);
  }

  if (
    user.role !== "super_admin" &&
    log.organizationId !== user.organizationId
  ) {
    throw new AppError(
      "Audit log not found.",
      404
    );
  }

  const organizationId = log.organizationId;

  await withTenant(organizationId, { isSuperAdmin: user.role === "super_admin" }, (tx) =>
    deleteAuditLog(id, tx)
  );
}
