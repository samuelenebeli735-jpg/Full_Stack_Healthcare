import { Router } from "express";

import authenticate from "../middleware/auth.middleware.js";
import authorize from "../middleware/role.middleware.js";
import { authorizePolicy } from "../middleware/policy.middleware.js";
import validate from "../middleware/validate.middleware.js";

import {
  getAll,
  getById,
  getByOrganization,
  remove,
} from "../controllers/audit.controller.js";

import {
  auditIdSchema,
  organizationAuditSchema,
} from "../validations/audit.validation.js";

const router = Router();

/**
 * Get all audit logs.
 */
router.get(
  "/",
  authenticate,
  authorize("admin", "super_admin"),
  authorizePolicy({ action: "read", resourceType: "auditLog", onDeny: { crossOrgStatus: 404, ownershipStatus: 404 } }),
  getAll
);

/**
 * Get organization audit logs.
 */
router.get(
  "/organization/:organizationId",
  authenticate,
  authorize("admin", "super_admin"),
  authorizePolicy({ action: "read", resourceType: "auditLog", organizationId: "param:organizationId", onDeny: { crossOrgStatus: 403, ownershipStatus: 404 } }),
  validate({ params: organizationAuditSchema }),
  getByOrganization
);

/**
 * Get audit log by ID.
 */
router.get(
  "/:id",
  authenticate,
  authorize("admin", "super_admin"),
  authorizePolicy({ action: "read", resourceType: "auditLog", onDeny: { crossOrgStatus: 404, ownershipStatus: 404 } }),
  validate({ params: auditIdSchema }),
  getById
);

/**
 * Delete audit log.
 */
router.delete(
  "/:id",
  authenticate,
  authorize("super_admin"),
  authorizePolicy({ action: "delete", resourceType: "auditLog", onDeny: { crossOrgStatus: 404, ownershipStatus: 404 } }),
  validate({ params: auditIdSchema }),
  remove
);

export default router;