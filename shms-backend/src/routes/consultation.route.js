import { Router } from "express";

import authenticate from "../middleware/auth.middleware.js";
import authorize from "../middleware/role.middleware.js";
import { authorizePolicy } from "../middleware/policy.middleware.js";
import validate from "../middleware/validate.middleware.js";

import {
  create,
  getAll,
  getById,
  update,
  remove,
} from "../controllers/consultation.controller.js";

import {
  createConsultationSchema,
  updateConsultationSchema,
  consultationIdSchema,
} from "../validations/consultation.validation.js";

const router = Router();

/**
 * Create consultation.
 */
router.post(
  "/",
  authenticate,
  authorize("staff", "admin", "super_admin"),
  authorizePolicy({ action: "create", resourceType: "consultation", onDeny: { crossOrgStatus: 404, ownershipStatus: 404 } }),
  validate({ body: createConsultationSchema }),
  create
);

/**
 * Get all consultations.
 */
router.get(
  "/",
  authenticate,
  authorize("staff", "admin", "super_admin"),
  authorizePolicy({ action: "read", resourceType: "consultation", onDeny: { crossOrgStatus: 404, ownershipStatus: 404 } }),
  getAll
);

/**
 * Get consultation by ID.
 */
router.get(
  "/:id",
  authenticate,
  authorize("staff", "admin", "super_admin"),
  authorizePolicy({ action: "read", resourceType: "consultation", onDeny: { crossOrgStatus: 404, ownershipStatus: 404 } }),
  validate({ params: consultationIdSchema }),
  getById
);

/**
 * Update consultation.
 */
router.patch(
  "/:id",
  authenticate,
  authorize("staff", "admin", "super_admin"),
  authorizePolicy({ action: "update", resourceType: "consultation", onDeny: { crossOrgStatus: 404, ownershipStatus: 404 } }),
  validate({
    params: consultationIdSchema,
    body: updateConsultationSchema,
  }),
  update
);

/**
 * Delete consultation.
 */
router.delete(
  "/:id",
  authenticate,
  authorize("staff", "admin", "super_admin"),
  authorizePolicy({ action: "delete", resourceType: "consultation", onDeny: { crossOrgStatus: 404, ownershipStatus: 404 } }),
  validate({ params: consultationIdSchema }),
  remove
);

export default router;
