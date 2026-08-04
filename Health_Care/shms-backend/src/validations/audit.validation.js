import { z } from "zod";

/**
 * Validate audit log ID.
 */
export const auditIdSchema = z.object({
  id: z
    .string()
    .cuid("Invalid audit log ID."),
});

/**
 * Validate organization ID.
 */
export const organizationAuditSchema = z.object({
  organizationId: z
    .string()
    .cuid("Invalid organization ID."),
});