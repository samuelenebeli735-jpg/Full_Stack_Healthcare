import { z } from "zod";

const dayOfWeekEnum = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

export const createScheduleSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID.").optional(),

  staffId: z.string().cuid("Invalid staff ID."),

  dayOfWeek: dayOfWeekEnum,

  startTime: z
    .string()
    .datetime("Start time must be a valid date."),

  endTime: z
    .string()
    .datetime("End time must be a valid date."),

  breakStart: z
    .string()
    .datetime("Break start must be a valid date.")
    .optional(),

  breakEnd: z
    .string()
    .datetime("Break end must be a valid date.")
    .optional(),
});

export const updateScheduleSchema = z.object({
  dayOfWeek: dayOfWeekEnum.optional(),

  startTime: z
    .string()
    .datetime("Start time must be valid.")
    .optional(),

  endTime: z
    .string()
    .datetime("End time must be valid.")
    .optional(),

  breakStart: z
    .string()
    .datetime("Break start must be valid.")
    .optional(),

  breakEnd: z
    .string()
    .datetime("Break end must be valid.")
    .optional(),

  isActive: z
    .boolean({
      invalid_type_error: "isActive must be boolean.",
    })
    .optional(),
});

export const scheduleIdSchema = z.object({
  id: z.string().cuid("Invalid schedule ID."),
});

export const staffScheduleSchema = z.object({
  staffId: z.string().cuid("Invalid staff ID."),
});

export const dayScheduleSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID."),

  dayOfWeek: dayOfWeekEnum,
});

export const organizationSchedulesSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID."),
});
