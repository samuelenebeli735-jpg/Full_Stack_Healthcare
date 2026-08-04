import { z } from "zod";

/*
|--------------------------------------------------------------------------
| Shared Prescription Item Schema
|--------------------------------------------------------------------------
*/

const prescriptionItemSchema = z.object({
  medicationName: z
    .string()
    .trim()
    .min(1, "Medication name is required."),

  dosage: z
    .string()
    .trim()
    .min(1, "Dosage is required."),

  frequency: z
    .string()
    .trim()
    .min(1, "Frequency is required."),

  duration: z
    .string()
    .trim()
    .min(1, "Duration is required."),

  quantity: z
    .number()
    .int()
    .min(1, "Quantity must be at least 1."),

  instructions: z
    .string()
    .trim()
    .optional(),
});

/*
|--------------------------------------------------------------------------
| Create Prescription
|--------------------------------------------------------------------------
*/

export const createPrescriptionSchema = z.object({
  consultationId: z
    .string()
    .cuid("Invalid consultation ID."),

  items: z
    .array(prescriptionItemSchema)
    .min(1, "At least one prescription item is required."),
});

/*
|--------------------------------------------------------------------------
| Update Prescription
|--------------------------------------------------------------------------
*/

export const updatePrescriptionSchema = z.object({
  items: z
    .array(prescriptionItemSchema)
    .min(1, "At least one prescription item is required."),
});

/*
|--------------------------------------------------------------------------
| Prescription ID Params
|--------------------------------------------------------------------------
*/

export const prescriptionIdSchema = z.object({
  id: z.string().cuid("Invalid prescription ID."),
});
