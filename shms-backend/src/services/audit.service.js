import AppError from "../utils/AppError.js";
import {
  resolveOrganizationId,
} from "../utils/tenantAccess.js";
import { withTenant, withSuperAdmin } from "../utils/tenantContext.js";
import {
  getPagination,
  buildPaginationMeta,
} from "../utils/pagination.js";

import {
  createAuditLog,
  findAuditLogById,
  findAuditLogs,
  findAuditLogsByOrganization,
} from "../repositories/audit.repository.js";

export async function logAction(data) {
  try {
    if (!data || !data.organizationId) {
      return;
    }
    // Self-contained tenancy: audit logging runs on its own transaction
    // (nested interactive transactions use a separate connection), so it
    // keeps working whether it is called inside a tenant transaction or not.
    return await withTenant(data.organizationId, async (tx) => {
      return await createAuditLog(data, tx);
    });
  } catch {
    // Audit logging must never break the main operation
  }
}

export async function getAuditLogById(id, user) {
  const scoped =
    user.role === "super_admin"
      ? withSuperAdmin
      : (callback) => withTenant(user.organizationId, callback);

  const log = await scoped(async (tx) => {
    return await findAuditLogById(id, tx);
  });

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
    const { page, limit } = getPagination(query);
    const { items, total } = await withSuperAdmin(async (tx) => {
      return await findAuditLogs(null, query, tx);
    });
    return { items, pagination: buildPaginationMeta({ page, limit, total }) };
  }

  if (user.role === "admin") {
    const { page, limit } = getPagination(query);
    const { items, total } = await withTenant(user.organizationId, async (tx) => {
      return await findAuditLogsByOrganization(
        user.organizationId,
        query,
        tx
      );
    });
    return { items, pagination: buildPaginationMeta({ page, limit, total }) };
  }

  throw new AppError(
    "You do not have permission to view audit logs.",
    403
  );
}

export async function getOrganizationAuditLogs(organizationId, user, query = {}) {
  const resolvedOrgId = resolveOrganizationId(organizationId, user);

  const { page, limit } = getPagination(query);

  const runner = resolvedOrgId
    ? (callback) => withTenant(resolvedOrgId, callback)
    : withSuperAdmin;

  const { items, total } = await runner(async (tx) => {
    return await findAuditLogsByOrganization(
      resolvedOrgId,
      query,
      tx
    );
  });

  return { items, pagination: buildPaginationMeta({ page, limit, total }) };
}

export async function removeAuditLog() {
  throw new AppError(
    "Audit log is append-only and cannot be deleted.",
    403
  );
}