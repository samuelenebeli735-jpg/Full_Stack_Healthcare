import { z } from "zod";

export const idParamSchema = z.object({
  id: z.string().cuid("Invalid medical record ID."),
});

export const updateMedicalRecordSchema = z.object({
  status: z.enum(["active", "archived"]).optional(),
});