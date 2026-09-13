import AppError from "../utils/AppError.js";
import { withTenant } from "../utils/tenantContext.js";
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

import {
  findUserOrgHint,
} from "../repositories/user.repository.js";

import { getPagination, buildPaginationMeta } from "../utils/pagination.js";

async function resolveUserOrg(userId) {
  const hint = await findUserOrgHint(userId);
  return hint?.organizationId ?? null;
}

export async function listNotifications(userId, query) {
  const organizationId = await resolveUserOrg(userId);

  if (!organizationId) {
    throw new AppError("User not found.", 404);
  }

  const { page, limit, skip } = getPagination(query);

  const { items, total } = await withTenant(organizationId, (tx) =>
    findNotificationsByUserId(userId, query, tx)
  );

  const unreadCount = await withTenant(organizationId, (tx) =>
    findUnreadNotificationCount(userId, tx)
  );

  return {
    items,
    unreadCount,
    pagination: buildPaginationMeta({ page, limit, total }),
  };
}

export async function readNotification(id, userId) {
  const organizationId = await resolveUserOrg(userId);

  if (!organizationId) {
    throw new AppError("Notification not found.", 404);
  }

  const result = await withTenant(organizationId, (tx) =>
    markNotificationRead(id, userId, tx)
  );

  if (result.count === 0) {
    throw new AppError("Notification not found.", 404);
  }

  return { success: true };
}

export async function readAllNotifications(userId) {
  const organizationId = await resolveUserOrg(userId);

  if (!organizationId) {
    throw new AppError("User not found.", 404);
  }

  const count = await withTenant(organizationId, (tx) =>
    markAllNotificationsRead(userId, tx)
  );

  return { success: true, markedRead: count.count };
}

export async function getPreferences(userId) {
  const organizationId = await resolveUserOrg(userId);

  if (!organizationId) {
    throw new AppError("User not found.", 404);
  }

  const prefs = await withTenant(organizationId, (tx) =>
    findPreferenceByUserId(userId, tx)
  );

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
  const organizationId = await resolveUserOrg(userId);

  if (!organizationId) {
    throw new AppError("User not found.", 404);
  }

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

  const prefs = await withTenant(organizationId, (tx) =>
    upsertPreference(userId, updateData, tx)
  );

  await auditLogger({
    organizationId,
    userId,
    action: "UPDATE",
    entity: "NotificationPreference",
    entityId: userId,
    description: "Notification preferences updated.",
  });

  return prefs;
}

export async function sendNotification(userId, title, message, type = "general") {
  const organizationId = await resolveUserOrg(userId);

  if (!organizationId) {
    throw new AppError("User not found.", 404);
  }

  return await withTenant(organizationId, (tx) =>
    createNotification({
      userId,
      organizationId,
      title,
      message,
      type,
    }, tx)
  );
}

export async function sendNotificationToOrganization(
  organizationId,
  title,
  message,
  type = "general"
) {
  const users = await withTenant(organizationId, async (tx) =>
    findUsersByOrganization(organizationId, tx)
  );

  const notifications = users.map((user) => ({
    userId: user.id,
    organizationId,
    title,
    message,
    type,
  }));

  if (notifications.length > 0) {
    await withTenant(organizationId, async (tx) => {
      await createManyNotifications(notifications, tx);
    });
  }

  return { sentCount: notifications.length };
}