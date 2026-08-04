import { z } from "zod";

/*
|--------------------------------------------------------------------------
| Student Registration Validation
|--------------------------------------------------------------------------
*/

export const registerSchema = z.object({
  organizationId: z
    .string()
    .trim()
    .min(1, "Organization is required."),

  email: z
    .string()
    .trim()
    .email("Invalid email address."),

  password: z
    .string()
    .min(8, "Password must be at least 8 characters."),

  firstName: z
    .string()
    .trim()
    .min(2, "First name is required."),

  middleName: z
    .string()
    .trim()
    .optional(),

  lastName: z
    .string()
    .trim()
    .min(2, "Last name is required."),

  matricNumber: z
    .string()
    .trim()
    .min(3, "Matric number is required."),

  faculty: z
    .string()
    .trim()
    .min(2, "Faculty is required."),

  department: z
    .string()
    .trim()
    .min(2, "Department is required."),

  level: z.enum(
    ["100", "200", "300", "400", "500", "600", "700"],
    {
      error: "Invalid academic level.",
    }),

  gender: z.enum(["Male", "Female"], {
    error: "Gender must be either Male or Female.",
  }),

  dateOfBirth: z.iso.date({
    error: "Date of birth must be in YYYY-MM-DD format.",
  }),

  phone: z
    .string()
    .trim()
    .min(10, "Phone number is invalid."),

  emergencyContactName: z
    .string()
    .trim()
    .min(2, "Emergency contact name is required."),

  emergencyContactPhone: z
    .string()
    .trim()
    .min(10, "Emergency contact phone is invalid."),

  bloodGroup: z
    .enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])
    .optional(),

  genotype: z
    .enum(["AA", "AS", "AC", "SS", "SC"])
    .optional(),

  allergies: z
    .string()
    .trim()
    .optional(),
});

/*
|--------------------------------------------------------------------------
| Login Validation
|--------------------------------------------------------------------------
*/

export const loginSchema = z.object({
  identifier: z
    .string()
    .min(1, "Email or matric number is required."),

  password: z
    .string()
    .min(1, "Password is required."),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address."),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});