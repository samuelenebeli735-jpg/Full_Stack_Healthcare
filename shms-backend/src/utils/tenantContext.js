import { AsyncLocalStorage } from "async_hooks";
import prisma from "../config/db.js";
import AppError from "./AppError.js";

const tenantStorage = new AsyncLocalStorage();

const ORG_ID_PATTERN = /^[a-zA-Z0-9]{8,40}$/;

function normalizeOrgId(organizationId) {
  if (organizationId == null) return null;
  const value = String(organizationId).trim();
  if (value === "") return null;
  return value;
}

/**
 * Establish a transaction-local tenant context (RLS) for a set of
 * database operations.
 *
 * - Opens a single interactive Prisma transaction.
 * - Sets app.organization_id (and app.bypass_rls for super admins) via
 *   set_config(..., true) so the context is LOCAL to the transaction and
 *   can never leak through the connection pool.
 * - Runs `fn(client)` where `client` is the transaction client.
 * - FAILS CLOSED: a tenant operation without an organization context
 *   (when not a super_admin global scope) is an error, never "all rows".
 *
 * It is safe to call withTenant while already inside a withTenant
 * transaction with the SAME organization: the active transaction and its
 * client are reused (no nested interactive transactions). Conflicting
 * contexts throw.
 */
export async function withTenant(organizationId, options = {}, fn) {
  if (typeof options === "function") {
    fn = options;
    options = {};
  }

  const { isSuperAdmin = false } = options;
  const orgId = normalizeOrgId(organizationId);

  if (!isSuperAdmin && orgId == null) {
    throw new AppError(
      "Tenant context is required for this operation.",
      500
    );
  }

  if (orgId != null && !ORG_ID_PATTERN.test(orgId)) {
    throw new AppError("Invalid organization identifier.", 500);
  }

  const store = tenantStorage.getStore();

  if (store) {
    if (
      store.organizationId !== null &&
      orgId !== null &&
      store.organizationId !== orgId
    ) {
      throw new AppError(
        "Conflicting tenant context inside an active transaction.",
        500
      );
    }

    // Re-entry may request a MORE specific context than the active one
    // (e.g. a global super-admin scope proceeding into a concrete
    // organization). Apply the missing GUC to the same transaction.
    if (orgId !== null && store.organizationId === null) {
      await store.tx.$executeRaw`SELECT set_config('app.organization_id', ${orgId}, true)`;
    }
    if (isSuperAdmin && !store.isSuperAdmin) {
      await store.tx.$executeRaw`SELECT set_config('app.bypass_rls', 'true', true)`;
    }

    return fn(store.tx);
  }

  return prisma.$transaction(async (tx) => {
    if (orgId != null) {
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${orgId}, true)`;
    }
    if (isSuperAdmin) {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'true', true)`;
    }

    const context = { tx, organizationId: orgId, isSuperAdmin };

    return tenantStorage.run(context, () => fn(tx));
  });
}

/**
 * Return the active transaction client when one exists (i.e. inside
 * withTenant), otherwise the global Prisma client. Used as the default
 * database client in repositories so tenant-scoped queries always run on
 * the same connection that carries the RLS context.
 */
export function getTenantClient() {
  const store = tenantStorage.getStore();
  return store ? store.tx : prisma;
}

export function isInTenantTransaction() {
  return Boolean(tenantStorage.getStore());
}