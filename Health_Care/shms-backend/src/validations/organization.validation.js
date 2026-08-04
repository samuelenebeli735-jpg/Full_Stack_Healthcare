import { z } from "zod";

/*
|--------------------------------------------------------------------------
| Create Organization Validation
|--------------------------------------------------------------------------
*/

export const createOrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Organization name must be at least 3 characters.")
    .max(100, "Organization name is too long."),

  slug: z
    .string()
    .trim()
    .min(3, "Slug must be at least 3 characters.")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug can only contain lowercase letters, numbers and hyphens."
    ),

  email: z
    .string()
    .trim()
    .email("Invalid email address.")
    .optional(),

  phone: z
    .string()
    .trim()
    .min(1, "Phone number is required.")
    .max(20, "Phone number is too long.")
    .optional(),

  address: z
    .string()
    .trim()
    .min(1)
    .max(255, "Address is too long.")
    .optional(),

  logoUrl: z.string().url("Invalid logo URL.").optional(),
});

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(3).max(100).optional(),
  slug: z.string().trim().min(3).regex(/^[a-z0-9-]+$/).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().min(1).max(20).optional(),
  address: z.string().trim().min(1).max(255).optional(),
  logoUrl: z.string().url().optional(),
});

export const idParamSchema = z.object({
  id: z.string().cuid("Invalid organization ID."),
});
