import prisma from "../config/db.js";
import { buildPrismaQuery } from "../utils/query.js";

export async function findDepartmentById(id, db = prisma) {
  return await db.department.findUnique({
    where: { id },
  });
}

export async function findDepartmentByCode(organizationId, code, db = prisma) {
  return await db.department.findUnique({
    where: {
      organizationId_code: { organizationId, code },
    },
  });
}

export async function findDepartmentsByOrganization(
  organizationId = null,
  query = {},
  db = prisma
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

export async function createDepartment(data, db = prisma) {
  return await db.department.create({ data });
}

export async function updateDepartment(id, data, db = prisma) {
  return await db.department.update({ where: { id }, data });
}

export async function deleteDepartment(id, db = prisma) {
  return await db.department.delete({ where: { id } });
}