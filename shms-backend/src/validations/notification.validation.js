import { z } from "zod";
import { NOTIFICATION_TYPE_LIST } from "../types/notificationType.js";
import { ROLE_LIST } from "../types/roles.js";

export const broadcastNotificationSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(255),
  message: z.string().trim().min(1, "Message is required.").max(2000),
  type: z.enum(NOTIFICATION_TYPE_LIST).optional(),
  organizationId: z.string().cuid("Invalid organization ID.").optional(),
  role: z.enum(ROLE_LIST).optional(),
});

export const updateNotificationPreferencesSchema = z.object({
  emailEnabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  telegramEnabled: z.boolean().optional(),
  phone: z.string().trim().min(1).nullable().optional(),
  remindBeforeHours: z.number().int().min(1).max(168).optional(),
  remindForAppointment: z.boolean().optional(),
  remindForQueue: z.boolean().optional(),
  remindForResults: z.boolean().optional(),
});

export const notificationIdSchema = z.object({
  id: z.string().cuid("Invalid notification ID."),
});
