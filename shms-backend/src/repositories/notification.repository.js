import prisma from "../config/db.js";
import { getTenantClient } from "../utils/tenantContext.js";
import { buildPrismaQuery } from "../utils/query.js";

export async function findNotificationsByUserId(
  userId,
  query = {},
  db = getTenantClient()
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

export async function findUnreadNotificationCount(userId, db = getTenantClient()) {
  return await db.notification.count({
    where: { userId, read: false },
  });
}

export async function findUsersByOrganization(organizationId, db = getTenantClient()) {
  return await db.user.findMany({
    where: { organizationId },
    select: { id: true, organizationId: true },
  });
}

export async function createManyNotifications(data, db = getTenantClient()) {
  return await db.notification.createMany({ data });
}

export async function createNotification(data, db = getTenantClient()) {
  return await db.notification.create({ data });
}

export async function markNotificationRead(id, userId, db = getTenantClient()) {
  return await db.notification.updateMany({
    where: { id, userId },
    data: { read: true },
  });
}

export async function markAllNotificationsRead(userId, db = getTenantClient()) {
  return await db.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
}

export async function findPreferenceByUserId(userId, db = getTenantClient()) {
  return await db.notificationPreference.findUnique({
    where: { userId },
  });
}

export async function upsertPreference(userId, data, db = getTenantClient()) {
  return await db.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}
