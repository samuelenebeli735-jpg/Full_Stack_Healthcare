import prisma from "../config/db.js";
import AppError from "./AppError.js";

async function setLocalGuc(tx, name, value) {
  await tx.$executeRawUnsafe(
    "SELECT pg_catalog.set_config($1, $2, true)",
    name,
    value
  );
}

/**
 * Run a callback inside a transaction pinned to one organization.
 * The tenant context is transaction-local (SET LOCAL semantics via
 * set_config(..., true)) so it can never leak to a pooled connection.
 * A missing organization id fails closed: no database access is attempted.
 */
export async function withTenant(organizationId, callback) {
  const orgId = organizationId === undefined || organizationId === null
    ? ""
    : String(organizationId).trim();

  if (!orgId) {
    throw new AppError("Tenant context is required.", 403);
  }

  return await prisma.$transaction(
    async (tx) => {
      await setLocalGuc(tx, "app.organization_id", orgId);
      return await callback(tx);
    },
    { timeout: 30000 }
  );
}

/**
 * Run a callback inside a transaction with a global (super-admin) view.
 * Both GUCs are transaction-local; the bypass only applies while the
 * organization context is empty, so it never leaks and never grants a
 * normal user an unscoped view.
 */
export async function withSuperAdmin(callback) {
  return await prisma.$transaction(
    async (tx) => {
      await setLocalGuc(tx, "app.organization_id", "");
      await setLocalGuc(tx, "app.bypass_rls", "true");
      return await callback(tx);
    },
    { timeout: 30000 }
  );
}

/**
 * Pick the tenant scoping that matches a user's role:
 *  - super_admin  -> global (super-admin) scope
 *  - everyone     -> scoped to their own organization (fails closed otherwise)
 */
export function resolveUserScope(user) {
  if (user?.role === "super_admin") {
    return withSuperAdmin;
  }
  return (callback) => withTenant(user.organizationId, callback);
}