import { z } from "zod";

export const createConsultationSchema = z.object({
  queueId: z.string().cuid("Invalid queue ID."),

  chiefComplaint: z.string().trim().min(1).max(1000).optional(),

  symptoms: z.string().trim().min(1).max(2000).optional(),

  diagnosis: z.string().trim().min(1).max(1000).optional(),

  treatmentPlan: z.string().trim().min(1).max(2000).optional(),

  notes: z.string().trim().min(1).max(2000).optional(),
});

export const updateConsultationSchema = z.object({
  chiefComplaint: z.string().trim().min(1).max(1000).optional(),

  symptoms: z.string().trim().min(1).max(2000).optional(),

  diagnosis: z.string().trim().min(1).max(1000).optional(),

  treatmentPlan: z.string().trim().min(1).max(2000).optional(),

  notes: z.string().trim().min(1).max(2000).optional(),
});

export const consultationIdSchema = z.object({
  id: z.string().cuid("Invalid consultation ID."),
});
