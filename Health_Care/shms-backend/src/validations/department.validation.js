import { z } from "zod";

export const createDepartmentSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID.").optional(),

  name: z
    .string()
    .trim()
    .min(2, "Department name must be at least 2 characters.")
    .max(100, "Department name is too long."),

  code: z
    .string()
    .trim()
    .min(2, "Department code must be at least 2 characters.")
    .max(10, "Department code cannot exceed 10 characters."),

  description: z
    .string()
    .trim()
    .min(1)
    .max(500, "Description is too long.")
    .optional(),

  location: z
    .string()
    .trim()
    .min(1)
    .max(100, "Location is too long.")
    .optional(),

  phone: z
    .string()
    .trim()
    .min(1)
    .max(20, "Phone number is too long.")
    .optional(),

  email: z
    .string()
    .trim()
    .email("Invalid email address.")
    .optional(),
});

export const organizationDepartmentSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID."),
});

export const updateDepartmentSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  code: z.string().trim().min(2).max(10).optional(),
  description: z.string().trim().min(1).max(500).optional(),
  location: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().min(1).max(20).optional(),
  email: z.string().trim().email().optional(),
});

export const idParamSchema = z.object({
  id: z.string().cuid("Invalid department ID."),
});