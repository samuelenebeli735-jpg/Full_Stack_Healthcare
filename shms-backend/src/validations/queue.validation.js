import { z } from "zod";

/*
|--------------------------------------------------------------------------
| Check In Validation
|--------------------------------------------------------------------------
*/

export const checkInSchema = z.object({
  appointmentId: z
    .string()
    .cuid("Invalid appointment ID."),
});

export const queueIdSchema = z.object({
  id: z
    .string()
    .cuid("Invalid queue ID."),
});

export const organizationQueueSchema = z.object({
  organizationId: z
    .string()
    .cuid("Invalid organization ID."),
});

// Optional: the ticket the staff member chose to skip.
export const skipQueueBodySchema = z
  .object({
    queueId: z.string().cuid("Invalid queue ID.").optional(),
  })
  .optional();
