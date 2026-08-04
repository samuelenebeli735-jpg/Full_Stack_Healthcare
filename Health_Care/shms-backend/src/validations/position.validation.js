import { z } from "zod";

export const createPositionSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID.").optional(),

  name: z
    .string()
    .trim()
    .min(2, "Position name must be at least 2 characters.")
    .max(100, "Position name is too long."),

  code: z
    .string()
    .trim()
    .min(2, "Position code must be at least 2 characters.")
    .max(20, "Position code is too long."),

  description: z
    .string()
    .trim()
    .min(1)
    .max(255, "Description is too long.")
    .optional(),
});

export const organizationPositionSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID."),
});

export const updatePositionSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  code: z.string().trim().min(2).max(20).optional(),
  description: z.string().trim().min(1).max(255).optional(),
});

export const idParamSchema = z.object({
  id: z.string().cuid("Invalid position ID."),
});
