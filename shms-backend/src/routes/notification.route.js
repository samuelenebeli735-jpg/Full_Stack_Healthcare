import { Router } from "express";

import authenticate from "../middleware/auth.middleware.js";
import authorize from "../middleware/role.middleware.js";
import validate from "../middleware/validate.middleware.js";

import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  getNotificationPreferences,
  saveNotificationPreferences,
  sendTestNotification,
  sendOrganizationBroadcast,
} from "../controllers/notification.controller.js";

import {
  updateNotificationPreferencesSchema,
  notificationIdSchema,
  broadcastNotificationSchema,
} from "../validations/notification.validation.js";

const router = Router();

router.get(
  "/",
  authenticate,
  getNotifications
);

router.post(
  "/broadcast",
  authenticate,
  authorize("admin", "super_admin"),
  validate({ body: broadcastNotificationSchema }),
  sendOrganizationBroadcast
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
