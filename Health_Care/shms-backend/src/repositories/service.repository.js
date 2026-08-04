import prisma from "../config/db.js";
import { buildPrismaQuery } from "../utils/query.js";

export async function findServiceById(id, db = prisma) {
  return await db.service.findUnique({
    where: { id },
  });
}

export async function findServiceByCode(organizationId, code, db = prisma) {
  return await db.service.findUnique({
    where: {
      organizationId_code: { organizationId, code },
    },
  });
}

export async function findServicesByOrganization(
  organizationId = null,
  query = {},
  db = prisma
) {
  const prismaQuery = buildPrismaQuery(query, {
    allowedSortFields: ["name", "code", "estimatedDuration", "createdAt", "updatedAt"],
    defaultSort: { name: "asc" },
    searchFields: ["name", "code", "description"],
  });

  const where = {
    ...prismaQuery.where,
    ...(organizationId ? { organizationId } : {}),
  };

  const [items, total] = await Promise.all([
    db.service.findMany({
      where,
      skip: prismaQuery.skip,
      take: prismaQuery.take,
      orderBy: prismaQuery.orderBy,
    }),
    db.service.count({ where }),
  ]);

  return { items, total };
}

export async function createService(data, db = prisma) {
  return await db.service.create({ data });
}

export async function updateService(id, data, db = prisma) {
  return await db.service.update({ where: { id }, data });
}

export async function deleteService(id, db = prisma) {
  return await db.service.delete({ where: { id } });
}
