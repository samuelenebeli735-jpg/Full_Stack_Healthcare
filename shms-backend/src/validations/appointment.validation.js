import { z } from "zod";

export const createAppointmentSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID."),

  medicalRecordId: z.string().cuid("Invalid medical record ID."),

  serviceId: z.string().cuid("Invalid service ID."),

  staffId: z.string().cuid().optional(),

  appointmentDate: z
    .string()
    .datetime("Invalid appointment date."),

  reason: z
    .string()
    .max(500, "Reason cannot exceed 500 characters.")
    .optional(),
});

export const organizationAppointmentSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID."),
});

export const updateAppointmentSchema = z.object({
  appointmentDate: z.string().datetime().optional(),
  serviceId: z.string().cuid().optional(),
  staffId: z.string().cuid().nullable().optional(),
  reason: z.string().max(500).optional(),
  status: z.enum(["scheduled", "confirmed", "checked_in", "in_progress", "completed", "cancelled", "no_show"]).optional(),
});

export const idParamSchema = z.object({
  id: z.string().cuid("Invalid appointment ID."),
});

export const staffSlotsParamsSchema = z.object({
  staffId: z.string().cuid("Invalid staff ID."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date."),
});

export const slotsQuerySchema = z.object({
  serviceId: z.string().cuid("Invalid service ID.").optional(),
});

export const cancelAppointmentSchema = z.object({
  reason: z
    .string()
    .trim("Cancellation reason is required.")
    .min(1, "Cancellation reason is required.")
    .max(500, "Cancellation reason cannot exceed 500 characters."),
});

export const rescheduleAppointmentSchema = z.object({
  appointmentDate: z
    .string()
    .datetime("Invalid appointment date."),
  staffId: z
    .string()
    .cuid("Invalid staff ID.")
    .nullable()
    .optional(),
});
