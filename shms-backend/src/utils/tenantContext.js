import { AsyncLocalStorage } from "node:async_hooks";

import prisma from "../config/db.js";
import AppError from "./AppError.js";

// The tenant transaction currently running on this async path, so helpers
// such as the audit logger can write on it instead of opening a second
// connection while this one is held.
const tenantTx = new AsyncLocalStorage();

/**
 * The open tenant transaction for this request path, or null.
 * Returns { tx, organizationId } only while the transaction callback runs.
 */
export function currentTenantTransaction() {
  const store = tenantTx.getStore();
  return store && store.open ? store : null;
}

// Wait up to 10s for a pooled connection (Prisma's default is 2s, which made
// short bursts, e.g. a dashboard's parallel report requests, fail outright).
export const TX_OPTIONS = { maxWait: 10000, timeout: 30000 };

export async function setLocalGuc(tx, name, value) {
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
      const store = { tx, organizationId: orgId, open: true };
      try {
        return await tenantTx.run(store, () => callback(tx));
      } finally {
        // Work that outlives the callback must not touch this transaction.
        store.open = false;
      }
    },
    TX_OPTIONS
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
    TX_OPTIONS
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