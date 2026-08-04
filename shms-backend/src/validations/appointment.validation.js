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
