import prisma from "../config/db.js";
import { buildPrismaQuery } from "../utils/query.js";

export async function findPositionById(id, db = prisma) {
  return await db.position.findUnique({
    where: { id },
  });
}

export async function findPositionByCode(organizationId, code, db = prisma) {
  return await db.position.findUnique({
    where: {
      organizationId_code: { organizationId, code },
    },
  });
}

export async function findPositionsByOrganization(
  organizationId = null,
  query = {},
  db = prisma
) {
  const prismaQuery = buildPrismaQuery(query, {
    allowedSortFields: ["name", "code", "createdAt", "updatedAt"],
    defaultSort: { name: "asc" },
    searchFields: ["name", "code", "description"],
  });

  const where = {
    ...prismaQuery.where,
    ...(organizationId ? { organizationId } : {}),
  };

  const [items, total] = await Promise.all([
    db.position.findMany({
      where,
      skip: prismaQuery.skip,
      take: prismaQuery.take,
      orderBy: prismaQuery.orderBy,
    }),
    db.position.count({ where }),
  ]);

  return { items, total };
}

export async function createPosition(data, db = prisma) {
  return await db.position.create({ data });
}

export async function updatePosition(id, data, db = prisma) {
  return await db.position.update({ where: { id }, data });
}

export async function deletePosition(id, db = prisma) {
  return await db.position.delete({ where: { id } });
}
