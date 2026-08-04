import { z } from "zod";

export const dashboardQuerySchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID.").optional(),
});
