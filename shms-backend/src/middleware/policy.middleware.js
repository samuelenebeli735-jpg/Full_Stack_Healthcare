import AppError from "../utils/AppError.js";
import { getRequestContext, securityAudit } from "../utils/securityAudit.js";
import {
  DENY,
  STEP_UP_AUTH,
  evaluatePolicy,
} from "../authorization/policy.engine.js";
import { SENSITIVITY } from "../authorization/permissions.js";
import {
  assessRisk,
  isBlocked,
  recordAuthzDenial,
  recordCrossOrgAttempt,
  recordSensitiveAccess,
} from "../authorization/risk.js";

function resolveOrganizationId({ req, from }) {
  if (!from) return null;
  if (from.startsWith("param:")) return req.params[from.slice(6)];
  if (from.startsWith("query:")) return req.query[from.slice(6)];
  if (from.startsWith("body:")) return req.body?.[from.slice(5)];
  return null;
}

export function authorizePolicy({
  action,
  resourceType,
  organizationId = null,
  onDeny = {},
}) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError("Authentication required.", 401));
    }

    const { ipAddress, userAgent } = getRequestContext(req);
    const orgId =
      typeof organizationId === "function"
        ? organizationId(req)
        : resolveOrganizationId({ req, from: organizationId });
    const riskLevel = isBlocked(req.user.id, ipAddress)
      ? "HIGH"
      : assessRisk(req.user.id, ipAddress);

    const result = evaluatePolicy({
      user: req.user,
      action,
      resourceType,
      organizationId: orgId,
      riskLevel,
    });

    if (result.reason === "role") {
      recordAuthzDenial({ userId: req.user.id });
    } else if (result.reason === "cross-org") {
      recordCrossOrgAttempt({ userId: req.user.id });
      securityAudit({
        organizationId: orgId || req.user.organizationId,
        userId: req.user.id,
        action: "CROSS_ORG_ATTEMPT",
        entity: "Organization",
        entityId: orgId || req.user.organizationId,
        description: `${req.user.email} attempted to access organization ${orgId || req.user.organizationId}.`,
        ipAddress,
        userAgent,
      });
    }

    req.policy = { ...result, targetOrganizationId: orgId };

    if (result.decision === DENY) {
      switch (result.reason) {
        case "role":
          return next(
            new AppError(
              "You do not have permission to perform this action.",
              403
            )
          );
        case "risk":
          return next(
            new AppError(
              "Too many suspicious requests. Please try again later.",
              429
            )
          );
        case "cross-org": {
          const status = onDeny.crossOrgStatus === 404 ? 404 : 403;
          return next(
            new AppError(
              status === 404
                ? "Not found."
                : "Access denied. You can only access your own organization's data.",
              status
            )
          );
        }
        case "ownership": {
          const status = onDeny.ownershipStatus === 403 ? 403 : 404;
          return next(
            new AppError(
              status === 403
                ? "You do not have permission to perform this action."
                : "Not found.",
              status
            )
          );
        }
        default:
          return next(new AppError("Not found.", 404));
      }
    }

    if (result.decision === STEP_UP_AUTH) {
      req.policyRisk = "MEDIUM";
    }

    const sensitivity = SENSITIVITY[resourceType];
    if (sensitivity === "CRITICAL" || sensitivity === "HIGH") {
      recordSensitiveAccess({ userId: req.user.id });
    }

    next();
  };
}