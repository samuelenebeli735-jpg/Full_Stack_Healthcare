import { z } from "zod";

export const createStaffSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID.").optional(),

  departmentId: z.string().cuid("Invalid department ID."),

  positionId: z.string().cuid("Invalid position ID."),

  email: z.string().trim().email("Invalid email address."),

  password: z.string().min(8, "Password must be at least 8 characters."),

  firstName: z
    .string()
    .trim()
    .min(2, "First name must be at least 2 characters."),

  middleName: z.string().trim().optional(),

  lastName: z
    .string()
    .trim()
    .min(2, "Last name must be at least 2 characters."),

  gender: z
    .string()
    .trim()
    .min(1, "Gender is required."),

  dateOfBirth: z.coerce.date(),

  phone: z
    .string()
    .trim()
    .min(5, "Phone number is too short."),

  employmentDate: z.coerce.date(),

  qualification: z.string().trim().optional(),

  licenseNumber: z.string().trim().optional(),

  profilePhotoUrl: z.string().url("Invalid profile photo URL.").optional(),
});

export const organizationStaffSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID."),
});

export const updateStaffSchema = z.object({
  firstName: z.string().trim().min(2).optional(),
  middleName: z.string().trim().optional(),
  lastName: z.string().trim().min(2).optional(),
  gender: z.string().trim().min(1).optional(),
  dateOfBirth: z.coerce.date().optional(),
  phone: z.string().trim().min(5).optional(),
  departmentId: z.string().cuid("Invalid department ID.").optional(),
  positionId: z.string().cuid("Invalid position ID.").optional(),
  qualification: z.string().trim().optional(),
  licenseNumber: z.string().trim().optional(),
  profilePhotoUrl: z.string().url("Invalid profile photo URL.").optional(),
  employmentStatus: z.enum(["active", "suspended", "resigned", "retired"]).optional(),
  employmentDate: z.coerce.date().optional(),
});

export const idParamSchema = z.object({
  id: z.string().cuid("Invalid staff ID."),
});
