import prisma from "../config/db.js";
import { buildPrismaQuery } from "../utils/query.js";

export async function findNotificationsByUserId(
  userId,
  query = {},
  db = prisma
) {
  const prismaQuery = buildPrismaQuery(query, {
    allowedSortFields: ["createdAt"],
    defaultSort: { createdAt: "desc" },
    searchFields: ["title", "message"],
  });

  const where = {
    ...prismaQuery.where,
    userId,
  };

  if (query.type) {
    where.type = query.type;
  }

  if (query.read !== undefined && query.read !== "") {
    where.read = query.read === "true";
  }

  const [items, total] = await Promise.all([
    db.notification.findMany({
      where,
      skip: prismaQuery.skip,
      take: prismaQuery.take,
      orderBy: prismaQuery.orderBy,
    }),
    db.notification.count({ where }),
  ]);

  return { items, total };
}

export async function findUnreadNotificationCount(userId, db = prisma) {
  return await db.notification.count({
    where: { userId, read: false },
  });
}

export async function findUsersByOrganization(organizationId, db = prisma) {
  return await db.user.findMany({
    where: { organizationId },
    select: { id: true, organizationId: true },
  });
}

export async function createManyNotifications(data, db = prisma) {
  return await db.notification.createMany({ data });
}

export async function createNotification(data, db = prisma) {
  return await db.notification.create({ data });
}

export async function markNotificationRead(id, userId, db = prisma) {
  return await db.notification.updateMany({
    where: { id, userId },
    data: { read: true },
  });
}

export async function markAllNotificationsRead(userId, db = prisma) {
  return await db.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
}

export async function findPreferenceByUserId(userId, db = prisma) {
  return await db.notificationPreference.findUnique({
    where: { userId },
  });
}

export async function upsertPreference(userId, data, db = prisma) {
  return await db.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}
