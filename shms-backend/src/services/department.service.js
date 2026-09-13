import AppError from "../utils/AppError.js";
import { withTenant } from "../utils/tenantContext.js";
import { auditLogger } from "../utils/auditLogger.js";
import { getPagination, buildPaginationMeta } from "../utils/pagination.js";
import { resolveOrganizationId } from "../utils/tenantAccess.js";

import {
  findDepartmentById,
  findDepartmentByCode,
  findDepartmentsByOrganization,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from "../repositories/department.repository.js";

import {
  findOrganizationById,
} from "../repositories/organization.repository.js";

export async function createNewDepartment(data, user) {
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

  const existingDepartment = await withTenant(organizationId, { isSuperAdmin }, (tx) =>
    findDepartmentByCode(organizationId, data.code, tx)
  );

  if (existingDepartment) {
    throw new AppError(
      "A department with this code already exists in this organization.",
      409
    );
  }

  const department = await withTenant(organizationId, { isSuperAdmin }, (tx) =>
    createDepartment({
      organizationId,
      name: data.name,
      code: data.code,
      description: data.description,
      location: data.location,
      phone: data.phone,
      email: data.email,
    }, tx)
  );

  await auditLogger({
    organizationId,
    userId: user.id,
    action: "CREATE",
    entity: "Department",
    entityId: department.id,
    description: `Department ${department.name} (${department.code}) created.`,
  });

  return department;
}

export async function getOrganizationDepartments(organizationId, user, query = {}) {
  const resolvedOrgId = resolveOrganizationId(organizationId, user);

  const isSuperAdmin = user.role === "super_admin";

  const { page, limit, skip } = getPagination(query);

  const { items, total } = await withTenant(resolvedOrgId, { isSuperAdmin }, (tx) =>
    findDepartmentsByOrganization(resolvedOrgId, query, tx)
  );

  return {
    items,
    pagination: buildPaginationMeta({ page, limit, total }),
  };
}

export async function getDepartmentById(id, user) {
  const department = await withTenant(user.organizationId, { isSuperAdmin: user.role === "super_admin" }, (tx) =>
    findDepartmentById(id, tx)
  );

  if (!department) {
    throw new AppError("Department not found.", 404);
  }

  if (user.role !== "super_admin" && department.organizationId !== user.organizationId) {
    throw new AppError("Department not found.", 404);
  }

  return department;
}

export async function updateExistingDepartment(id, data, user) {
  const isSuperAdmin = user.role === "super_admin";

  const department = await withTenant(user.organizationId, { isSuperAdmin }, (tx) =>
    findDepartmentById(id, tx)
  );

  if (!department) {
    throw new AppError("Department not found.", 404);
  }

  const organizationId =
    user.role === "super_admin"
      ? data.organizationId ?? department.organizationId
      : user.organizationId;

  if (department.organizationId !== organizationId) {
    throw new AppError("Department not found.", 404);
  }

  if (data.code && data.code !== department.code) {
    const existing = await withTenant(organizationId, { isSuperAdmin }, (tx) =>
      findDepartmentByCode(organizationId, data.code, tx)
    );

    if (existing && existing.id !== id) {
      throw new AppError(
        "A department with this code already exists in this organization.",
        409
      );
    }
  }

  const updateData = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.code !== undefined) updateData.code = data.code;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.location !== undefined) updateData.location = data.location;
  if (data.phone !== undefined) updateData.phone = data.phone;
  if (data.email !== undefined) updateData.email = data.email;

  const updated = await withTenant(organizationId, { isSuperAdmin }, (tx) =>
    updateDepartment(id, updateData, tx)
  );

  await auditLogger({
    organizationId,
    userId: user.id,
    action: "UPDATE",
    entity: "Department",
    entityId: id,
    description: `Department ${updated.name} (${updated.code}) updated.`,
  });

  return updated;
}

export async function removeDepartment(id, user) {
  const isSuperAdmin = user.role === "super_admin";

  const department = await withTenant(user.organizationId, { isSuperAdmin }, (tx) =>
    findDepartmentById(id, tx)
  );

  if (!department) {
    throw new AppError("Department not found.", 404);
  }

  if (user.role !== "super_admin" && department.organizationId !== user.organizationId) {
    throw new AppError("Department not found.", 404);
  }

  const organizationId = department.organizationId;

  try {
    await withTenant(organizationId, { isSuperAdmin }, (tx) =>
      deleteDepartment(id, tx)
    );
  } catch (error) {
    if (error.code === "P2003") {
      throw new AppError(
        "Cannot delete department because it is referenced by staff, appointments, or other records.",
        409
      );
    }
    throw error;
  }

  await auditLogger({
    organizationId: department.organizationId,
    userId: user.id,
    action: "DELETE",
    entity: "Department",
    entityId: id,
    description: `Department ${department.name} (${department.code}) deleted.`,
  });
}