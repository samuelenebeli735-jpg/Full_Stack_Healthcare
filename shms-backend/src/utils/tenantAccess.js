import AppError from "./AppError.js";

export function resolveOrganizationId(organizationId, user) {
  if (user.role === "super_admin") {
    return organizationId;
  }

  if (
    organizationId &&
    organizationId !== user.organizationId
  ) {
    throw new AppError(
      "Organization not found.",
      404
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
