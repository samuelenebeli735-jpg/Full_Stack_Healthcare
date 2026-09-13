import { createAuditLog } from "../repositories/audit.repository.js";
import { withTenant } from "./tenantContext.js";

export async function securityAudit({
  organizationId,
  userId,
  action,
  entity,
  entityId = null,
  description,
  ipAddress = null,
  userAgent = null,
}) {
  try {
    if (!organizationId) {
      return;
    }

    await withTenant(organizationId, { isSuperAdmin: true }, (tx) =>
      createAuditLog(
        {
          organizationId,
          userId,
          action,
          entity,
          entityId,
          description,
          ipAddress,
          userAgent,
        },
        tx
      )
    );
  } catch (error) {
    console.error(
      "Failed to create security audit log:",
      error.message
    );
  }
}

export function getRequestContext(req) {
  return {
    ipAddress: req?.ip || req?.socket?.remoteAddress || null,
    userAgent: req?.headers?.["user-agent"] || null,
  };
}