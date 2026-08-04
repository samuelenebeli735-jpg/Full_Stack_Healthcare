import { z } from "zod";

export const reportDateQuerySchema = z
  .object({
    organizationId: z.string().cuid("Invalid organization ID.").optional(),
    from: z.string().datetime("Invalid start date.").optional(),
    to: z.string().datetime("Invalid end date.").optional(),
  })
  .refine(
    (data) =>
      !data.from ||
      !data.to ||
      new Date(data.from).getTime() <= new Date(data.to).getTime(),
    {
      message: "The 'from' date cannot be after the 'to' date.",
      path: ["from"],
    }
  );

export const reportOrganizationQuerySchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID.").optional(),
});
