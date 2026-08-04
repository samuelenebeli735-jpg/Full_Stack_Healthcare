import { z } from "zod";

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
