import asyncHandler from "../utils/asyncHandler.js";
import { successResponse } from "../utils/apiResponse.js";

import {
  listNotifications,
  readNotification,
  readAllNotifications,
  getPreferences,
  savePreferences,
  sendNotification,
} from "../services/notification.service.js";

export const getNotifications = asyncHandler(async (req, res) => {
  const result = await listNotifications(req.user.id, req.query);

  return successResponse(res, result, "Notifications retrieved successfully.");
});

export const markAsRead = asyncHandler(async (req, res) => {
  const result = await readNotification(req.params.id, req.user.id);

  return successResponse(res, result, "Notification marked as read.");
});

export const markAllAsRead = asyncHandler(async (req, res) => {
  const result = await readAllNotifications(req.user.id);

  return successResponse(res, result, "All notifications marked as read.");
});

export const getNotificationPreferences = asyncHandler(async (req, res) => {
  const result = await getPreferences(req.user.id);

  return successResponse(res, result, "Preferences retrieved successfully.");
});

export const saveNotificationPreferences = asyncHandler(async (req, res) => {
  const result = await savePreferences(req.user.id, req.body);

  return successResponse(res, result, "Preferences saved successfully.");
});

export const sendTestNotification = asyncHandler(async (req, res) => {
  const notification = await sendNotification(
    req.user.id,
    "Test notification",
    "This is a test notification from SHMS.",
    "system"
  );

  return successResponse(res, notification, "Test notification sent.");
});
