import { logAction } from "../services/audit.service.js";

/**
 * Write an audit log.
 */
export async function auditLogger({
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
    await logAction({
      organizationId,
      userId,
      action,
      entity,
      entityId,
      description,
      ipAddress,
      userAgent,
    });
  } catch (error) {
    console.error(
      "Failed to create audit log:",
      error.message
    );
  }
}