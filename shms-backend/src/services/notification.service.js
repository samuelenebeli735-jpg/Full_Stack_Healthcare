import prisma from "../config/db.js";
import AppError from "../utils/AppError.js";
import { auditLogger } from "../utils/auditLogger.js";

import {
  findNotificationsByUserId,
  findUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  findPreferenceByUserId,
  upsertPreference,
  createNotification,
  findUsersByOrganization,
  createManyNotifications,
} from "../repositories/notification.repository.js";

import { findUserById } from "../repositories/user.repository.js";

import { getPagination, buildPaginationMeta } from "../utils/pagination.js";

export async function listNotifications(userId, query) {
  const { page, limit, skip } = getPagination(query);

  const { items, total } = await findNotificationsByUserId(
    userId,
    query
  );

  const unreadCount = await findUnreadNotificationCount(userId);

  return {
    items,
    unreadCount,
    pagination: buildPaginationMeta({ page, limit, total }),
  };
}

export async function readNotification(id, userId) {
  const result = await markNotificationRead(id, userId);

  if (result.count === 0) {
    throw new AppError("Notification not found.", 404);
  }

  return { success: true };
}

export async function readAllNotifications(userId) {
  const count = await markAllNotificationsRead(userId);

  return { success: true, markedRead: count.count };
}

export async function getPreferences(userId) {
  const prefs = await findPreferenceByUserId(userId);

  if (!prefs) {
    return {
      emailEnabled: true,
      whatsappEnabled: false,
      telegramEnabled: false,
      phone: null,
      remindBeforeHours: 24,
      remindForAppointment: true,
      remindForQueue: true,
      remindForResults: true,
    };
  }

  return prefs;
}

export async function savePreferences(userId, data) {
  const allowedFields = [
    "emailEnabled",
    "whatsappEnabled",
    "telegramEnabled",
    "phone",
    "remindBeforeHours",
    "remindForAppointment",
    "remindForQueue",
    "remindForResults",
  ];

  const updateData = {};
  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      updateData[field] = data[field];
    }
  }

  const prefs = await upsertPreference(userId, updateData);

  const user = await findUserById(userId);

  await auditLogger({
    organizationId: user?.organizationId,
    userId,
    action: "UPDATE",
    entity: "NotificationPreference",
    entityId: userId,
    description: "Notification preferences updated.",
  });

  return prefs;
}

export async function sendNotification(userId, title, message, type = "general") {
  const user = await findUserById(userId);

  if (!user) {
    throw new AppError("User not found.", 404);
  }

  return await createNotification({
    userId,
    organizationId: user.organizationId,
    title,
    message,
    type,
  });
}

export async function sendNotificationToOrganization(
  organizationId,
  title,
  message,
  type = "general"
) {
  const users = await findUsersByOrganization(organizationId);

  const notifications = users.map((user) => ({
    userId: user.id,
    organizationId,
    title,
    message,
    type,
  }));

  if (notifications.length > 0) {
    await prisma.$transaction(async (tx) => {
      await createManyNotifications(notifications, tx);
    });
  }

  return { sentCount: notifications.length };
}
