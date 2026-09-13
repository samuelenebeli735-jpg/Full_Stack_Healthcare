import AppError from "./AppError.js";
import { securityAudit } from "./securityAudit.js";
import { recordCrossOrgAttempt } from "../authorization/risk.js";

export function resolveOrganizationId(organizationId, user, req = null) {
  if (user.role === "super_admin") {
    return organizationId;
  }

  if (
    organizationId &&
    organizationId !== user.organizationId
  ) {
    recordCrossOrgAttempt({ userId: user.id });
    securityAudit({
      organizationId: organizationId || user.organizationId,
      userId: user.id,
      action: "CROSS_ORG_ATTEMPT",
      entity: "Organization",
      entityId: organizationId || user.organizationId,
      description: `${user.email} attempted to access organization ${organizationId || user.organizationId}.`,
      ipAddress: req?.ip || null,
      userAgent: req?.headers?.["user-agent"] || null,
    });
    throw new AppError(
      "Access denied. You can only access your own organization's data.",
      403
    );
  }

  return user.organizationId;
}

export function ensureOrganizationAccess(
  organizationId,
  user
) {
  resolveOrganizationId(organizationId, user);
}
