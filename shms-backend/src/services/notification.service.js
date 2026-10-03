import AppError from "../utils/AppError.js";
import { auditLogger } from "../utils/auditLogger.js";
import { withTenant } from "../utils/tenantContext.js";
import { NOTIFICATION_TYPES } from "../types/notificationType.js";

import {
  findOrganizationById,
} from "../repositories/organization.repository.js";

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

/**
 * Split an array into fixed-size batches for fan-out inserts.
 */
function chunkArray(items, size) {
  const batches = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

// Conservative fan-out batch size: keeps each INSERT statement bounded while
// staying well inside a single tenant transaction, so a large organization
// cannot trigger one unbounded createMany. Nested inside one transaction, all
// batches commit or roll back together.
const BROADCAST_BATCH_SIZE = 500;

export async function sendNotificationToOrganization(
  organizationId,
  title,
  message,
  type = "general",
  role
) {
  const users = await withTenant(organizationId, async (tx) => {
    const found = await findUsersByOrganization(organizationId, role, tx);

    const notifications = found.map((user) => ({
      userId: user.id,
      organizationId,
      title,
      message,
      type,
    }));

    for (const batch of chunkArray(notifications, BROADCAST_BATCH_SIZE)) {
      await createManyNotifications(batch, tx);
    }

    return found;
  });

  return { sentCount: users.length };
}

export async function sendOrganizationBroadcast(data, user) {
  const organizationId =
    user.role === "super_admin"
      ? data.organizationId
      : user.organizationId;

  if (!organizationId) {
    throw new AppError("Organization ID is required.", 400);
  }

  const organization = await findOrganizationById(organizationId);

  if (!organization) {
    throw new AppError("Organization not found.", 404);
  }

  const result = await sendNotificationToOrganization(
    organizationId,
    data.title,
    data.message,
    data.type ?? NOTIFICATION_TYPES.GENERAL,
    data.role
  );

  const audienceSuffix = data.role ? ` (role: ${data.role})` : "";

  await auditLogger({
    organizationId,
    userId: user.id,
    action: "BROADCAST",
    entity: "Notification",
    entityId: null,
    description: `Broadcast "${data.title}" sent to ${result.sentCount} users${audienceSuffix}.`,
  });

  return result;
}