import { Router } from "express";

import authenticate from "../middleware/auth.middleware.js";
import validate from "../middleware/validate.middleware.js";

import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  getNotificationPreferences,
  saveNotificationPreferences,
  sendTestNotification,
} from "../controllers/notification.controller.js";

import {
  updateNotificationPreferencesSchema,
  notificationIdSchema,
} from "../validations/notification.validation.js";

const router = Router();

router.get(
  "/",
  authenticate,
  getNotifications
);

router.post(
  "/send-test",
  authenticate,
  sendTestNotification
);

router.post(
  "/read-all",
  authenticate,
  markAllAsRead
);

router.put(
  "/:id/read",
  authenticate,
  validate({ params: notificationIdSchema }),
  markAsRead
);

router.get(
  "/preferences",
  authenticate,
  getNotificationPreferences
);

router.put(
  "/preferences",
  authenticate,
  validate({ body: updateNotificationPreferencesSchema }),
  saveNotificationPreferences
);

export default router;
