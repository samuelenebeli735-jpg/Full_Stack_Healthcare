import { z } from "zod";

export const createServiceSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID."),

  name: z.string().trim().min(2, "Service name is required."),

  code: z.string().trim().min(2, "Service code is required."),

  description: z.string().trim().optional(),

  estimatedDuration: z
    .number()
    .int()
    .positive()
    .default(15),
});

export const organizationServiceSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID."),
});

export const updateServiceSchema = z.object({
  name: z.string().trim().min(2, "Service name is required.").optional(),
  code: z.string().trim().min(2, "Service code is required.").optional(),
  description: z.string().trim().optional(),
  estimatedDuration: z.number().int().positive().optional(),
});

export const idParamSchema = z.object({
  id: z.string().cuid("Invalid service ID."),
});
