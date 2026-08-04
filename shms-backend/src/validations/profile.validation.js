import { z } from "zod";

export const createProfileSchema = z.object({
  userId: z.string().min(1, "User ID is required."),

  firstName: z.string().min(1, "First name is required."),

  middleName: z.string().optional(),

  lastName: z.string().min(1, "Last name is required."),

  matricNumber: z.string().min(1, "Matric number is required."),

  faculty: z.string().min(1, "Faculty is required."),

  department: z.string().min(1, "Department is required."),

  level: z.string().min(1, "Level is required."),

  gender: z.string().min(1, "Gender is required."),

  dateOfBirth: z.string()
    .min(1, "Date of birth is required.")
    .refine((val) => !Number.isNaN(new Date(val).getTime()), {
      message: "Invalid date.",
    }),

  phone: z.string().min(1, "Phone number is required."),

  emergencyContactName: z
    .string()
    .min(1, "Emergency contact name is required."),

  emergencyContactPhone: z
    .string()
    .min(1, "Emergency contact phone is required."),

  bloodGroup: z.string().optional(),

  genotype: z.string().optional(),

  allergies: z.string().optional(),
});

export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(2, "First name is required.").optional(),
  middleName: z.string().trim().optional(),
  lastName: z.string().trim().min(2, "Last name is required.").optional(),
  faculty: z.string().trim().min(2, "Faculty is required.").optional(),
  department: z.string().trim().min(2, "Department is required.").optional(),
  level: z
    .enum(["100", "200", "300", "400", "500", "600", "700"], {
      error: "Invalid academic level.",
    })
    .optional(),
  gender: z.enum(["Male", "Female"], {
    error: "Gender must be either Male or Female.",
  }).optional(),
  dateOfBirth: z
    .string()
    .refine((val) => !Number.isNaN(new Date(val).getTime()), {
      message: "Invalid date.",
    })
    .optional(),
  phone: z.string().trim().min(10, "Phone number is invalid.").optional(),
  emergencyContactName: z.string().trim().min(2, "Emergency contact name is required.").optional(),
  emergencyContactPhone: z.string().trim().min(10, "Emergency contact phone is invalid.").optional(),
  bloodGroup: z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]).optional(),
  genotype: z.enum(["AA", "AS", "AC", "SS", "SC"]).optional(),
  allergies: z.string().trim().optional(),
  profilePhotoUrl: z.string().trim().url("Invalid photo URL.").optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: z.string().min(8, "New password must be at least 8 characters."),
});
