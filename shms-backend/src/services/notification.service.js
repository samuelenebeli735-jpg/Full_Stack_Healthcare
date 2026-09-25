import AppError from "../utils/AppError.js";
import { auditLogger } from "../utils/auditLogger.js";
import { withTenant } from "../utils/tenantContext.js";

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

import { findUserById, findUserOrgHint } from "../repositories/user.repository.js";

import { getPagination, buildPaginationMeta } from "../utils/pagination.js";

export async function listNotifications(userId, query) {
  const hint = await findUserOrgHint(userId);

  if (!hint) {
    throw new AppError("User not found.", 404);
  }

  return await withTenant(hint.organizationId, async (tx) => {
    const { page, limit } = getPagination(query);

    const { items, total } = await findNotificationsByUserId(
      userId,
      query,
      tx
    );

    const unreadCount = await findUnreadNotificationCount(userId, tx);

    return {
      items,
      unreadCount,
      pagination: buildPaginationMeta({ page, limit, total }),
    };
  });
}

export async function readNotification(id, userId) {
  const hint = await findUserOrgHint(userId);

  if (!hint) {
    throw new AppError("User not found.", 404);
  }

  const result = await withTenant(hint.organizationId, async (tx) => {
    return await markNotificationRead(id, userId, tx);
  });

  if (result.count === 0) {
    throw new AppError("Notification not found.", 404);
  }

  return { success: true };
}

export async function readAllNotifications(userId) {
  const hint = await findUserOrgHint(userId);

  if (!hint) {
    throw new AppError("User not found.", 404);
  }

  const count = await withTenant(hint.organizationId, async (tx) => {
    return await markAllNotificationsRead(userId, tx);
  });

  return { success: true, markedRead: count.count };
}

export async function getPreferences(userId) {
  const hint = await findUserOrgHint(userId);

  if (!hint) {
    throw new AppError("User not found.", 404);
  }

  const prefs = await withTenant(hint.organizationId, async (tx) => {
    return await findPreferenceByUserId(userId, tx);
  });

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

  const hint = await findUserOrgHint(userId);

  if (!hint) {
    throw new AppError("User not found.", 404);
  }

  const prefs = await withTenant(hint.organizationId, async (tx) => {
    const result = await upsertPreference(userId, updateData, tx);

    await auditLogger({
      organizationId: hint.organizationId,
      userId,
      action: "UPDATE",
      entity: "NotificationPreference",
      entityId: userId,
      description: "Notification preferences updated.",
    });

    return result;
  });

  return prefs;
}

export async function sendNotification(userId, title, message, type = "general") {
  const hint = await findUserOrgHint(userId);

  if (!hint) {
    throw new AppError("User not found.", 404);
  }

  return await withTenant(hint.organizationId, async (tx) => {
    const user = await findUserById(userId, tx);

    if (!user) {
      throw new AppError("User not found.", 404);
    }

    return await createNotification({
      userId,
      organizationId: user.organizationId,
      title,
      message,
      type,
    }, tx);
  });
}

export async function sendNotificationToOrganization(
  organizationId,
  title,
  message,
  type = "general"
) {
  const users = await withTenant(organizationId, async (tx) => {
    const found = await findUsersByOrganization(organizationId, tx);

    const notifications = found.map((user) => ({
      userId: user.id,
      organizationId,
      title,
      message,
      type,
    }));

    if (notifications.length > 0) {
      await createManyNotifications(notifications, tx);
    }

    return found;
  });

  return { sentCount: users.length };
}