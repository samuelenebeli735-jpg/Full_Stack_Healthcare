import prisma from "../config/db.js";
import { getTenantClient } from "../utils/tenantContext.js";
import { buildPrismaQuery } from "../utils/query.js";

export async function findDepartmentById(id, db = getTenantClient()) {
  return await db.department.findUnique({
    where: { id },
  });
}

export async function findDepartmentByCode(organizationId, code, db = getTenantClient()) {
  return await db.department.findUnique({
    where: {
      organizationId_code: { organizationId, code },
    },
  });
}

export async function findDepartmentsByOrganization(
  organizationId = null,
  query = {},
  db = getTenantClient()
) {
  const prismaQuery = buildPrismaQuery(query, {
    allowedSortFields: ["name", "code", "createdAt", "updatedAt"],
    defaultSort: { name: "asc" },
    searchFields: ["name", "code", "description", "location", "phone", "email"],
  });

  if (organizationId) {
    prismaQuery.where = {
      ...prismaQuery.where,
      organizationId,
    };
  }

  const [items, total] = await Promise.all([
    db.department.findMany({
      where: prismaQuery.where,
      skip: prismaQuery.skip,
      take: prismaQuery.take,
      orderBy: prismaQuery.orderBy,
    }),
    db.department.count({ where: prismaQuery.where }),
  ]);

  return { items, total };
}

export async function createDepartment(data, db = getTenantClient()) {
  return await db.department.create({ data });
}

export async function updateDepartment(id, data, db = getTenantClient()) {
  return await db.department.update({ where: { id }, data });
}

export async function deleteDepartment(id, db = getTenantClient()) {
  return await db.department.delete({ where: { id } });
}