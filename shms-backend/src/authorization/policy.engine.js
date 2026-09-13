import { ACTION_ROLES, SENSITIVITY } from "./permissions.js";

export const ALLOW = "ALLOW";
export const STEP_UP_AUTH = "STEP_UP_AUTH";
export const DENY = "DENY";

function roleAllows(role, action, resourceType) {
  const key = `${resourceType}:${action}`;
  const roles = ACTION_ROLES[key];
  if (!Array.isArray(roles)) return false;
  return roles.includes(role);
}

export function evaluatePolicy({
  user,
  action,
  resourceType,
  organizationId = null,
  resourceOrganizationId = null,
  resourceOwnerId = null,
  riskLevel = "LOW",
}) {
  const checks = [];

  if (!user) {
    return { decision: DENY, reason: "unauthenticated", checks };
  }

  checks.push({ check: "authenticated", ok: true });

  if (!roleAllows(user.role, action, resourceType)) {
    checks.push({
      check: "role",
      ok: false,
      detail: `${resourceType}:${action} not allowed for role ${user.role}`,
    });
    return { decision: DENY, reason: "role", checks };
  }

  checks.push({ check: "role", ok: true });

  if (
    organizationId &&
    user.role !== "super_admin" &&
    organizationId !== user.organizationId
  ) {
    checks.push({
      check: "organization",
      ok: false,
      detail: "cross-organization",
    });
    return { decision: DENY, reason: "cross-org", checks };
  }

  if (
    resourceOrganizationId &&
    user.role !== "super_admin" &&
    resourceOrganizationId !== user.organizationId
  ) {
    checks.push({
      check: "resource-organization",
      ok: false,
      detail: "cross-organization",
    });
    return { decision: DENY, reason: "cross-org", checks };
  }

  checks.push({ check: "organization", ok: true });

  if (
    resourceOwnerId &&
    user.role !== "super_admin" &&
    user.role !== "staff" &&
    user.role !== "admin" &&
    resourceOwnerId !== user.id
  ) {
    checks.push({
      check: "ownership",
      ok: false,
      detail: "resource owned by another user",
    });
    return { decision: DENY, reason: "ownership", checks };
  }

  if (resourceOwnerId) {
    checks.push({ check: "ownership", ok: true });
  }

  if (riskLevel === "HIGH") {
    checks.push({ check: "risk", ok: false, level: riskLevel });
    return { decision: DENY, reason: "risk", checks };
  }

  checks.push({ check: "risk", ok: true, level: riskLevel });

  const sensitivity = SENSITIVITY[resourceType] || "LOW";

  if (
    riskLevel === "MEDIUM" &&
    (sensitivity === "HIGH" || sensitivity === "CRITICAL")
  ) {
    checks.push({
      check: "sensitivity",
      ok: true,
      sensitivity,
      detail: "step-up required but no second factor configured",
    });
    return { decision: STEP_UP_AUTH, reason: "step-up", checks };
  }

  checks.push({ check: "sensitivity", ok: true, sensitivity });
  return { decision: ALLOW, reason: "allow", checks };
}