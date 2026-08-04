import prisma from "../config/db.js";
import { buildPrismaQuery } from "../utils/query.js";

export async function createAuditLog(data, db = prisma) {
  return await db.auditLog.create({
    data,
    include: {
      organization: true,
      user: {
        select: {
          id: true,
          email: true,
          role: true,
        },
      },
    },
  });
}

export async function findAuditLogById(id, db = prisma) {
  return await db.auditLog.findUnique({
    where: { id },
    include: {
      organization: true,
      user: {
        select: {
          id: true,
          email: true,
          role: true,
        },
      },
    },
  });
}

export async function findAuditLogs(
  organizationId = null,
  query = {},
  db = prisma
) {
  const prismaQuery = buildPrismaQuery(query, {
    allowedSortFields: ["createdAt"],
    defaultSort: { createdAt: "desc" },
    searchFields: ["action", "entity", "description"],
  });

  const where = {
    ...prismaQuery.where,
    ...(organizationId ? { organizationId } : {}),
  };

  if (query.action) where.action = query.action;
  if (query.entity) where.entity = query.entity;

  const [items, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      skip: prismaQuery.skip,
      take: prismaQuery.take,
      include: {
        organization: true,
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: prismaQuery.orderBy,
    }),
    db.auditLog.count({ where }),
  ]);

  return { items, total };
}

export async function findAuditLogsByOrganization(
  organizationId,
  query = {},
  db = prisma
) {
  const prismaQuery = buildPrismaQuery(query, {
    allowedSortFields: ["createdAt"],
    defaultSort: { createdAt: "desc" },
    searchFields: ["action", "entity", "description"],
  });

  const where = {
    ...prismaQuery.where,
    organizationId,
  };

  if (query.action) where.action = query.action;
  if (query.entity) where.entity = query.entity;

  const [items, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      skip: prismaQuery.skip,
      take: prismaQuery.take,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: prismaQuery.orderBy,
    }),
    db.auditLog.count({ where }),
  ]);

  return { items, total };
}

export async function deleteAuditLog(id, db = prisma) {
  return await db.auditLog.delete({
    where: { id },
  });
}
