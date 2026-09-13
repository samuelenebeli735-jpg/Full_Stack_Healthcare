import { Router } from "express";

import authenticate from "../middleware/auth.middleware.js";
import authorize from "../middleware/role.middleware.js";
import { authorizePolicy } from "../middleware/policy.middleware.js";
import validate from "../middleware/validate.middleware.js";

import {
  createPrescription,
  getPrescriptions,
  getPrescription,
  updatePrescription,
  deletePrescription,
} from "../controllers/prescription.controller.js";

import {
  createPrescriptionSchema,
  updatePrescriptionSchema,
  prescriptionIdSchema,
} from "../validations/prescription.validation.js";

const router = Router();

/**
 * Create prescription.
 */
router.post(
  "/",
  authenticate,
  authorize("staff", "admin", "super_admin"),
  authorizePolicy({ action: "create", resourceType: "prescription", onDeny: { crossOrgStatus: 404, ownershipStatus: 404 } }),
  validate({ body: createPrescriptionSchema }),
  createPrescription
);

/**
 * Get all prescriptions.
 */
router.get(
  "/",
  authenticate,
  authorize("staff", "admin", "super_admin"),
  authorizePolicy({ action: "read", resourceType: "prescription", onDeny: { crossOrgStatus: 404, ownershipStatus: 404 } }),
  getPrescriptions
);

/**
 * Get prescription by ID.
 */
router.get(
  "/:id",
  authenticate,
  authorize("staff", "admin", "super_admin"),
  authorizePolicy({ action: "read", resourceType: "prescription", onDeny: { crossOrgStatus: 404, ownershipStatus: 404 } }),
  validate({ 
    params: prescriptionIdSchema
   }),
  getPrescription
);

/**
 * Update prescription.
 */
router.patch(
  "/:id",
  authenticate,
  authorize("staff", "admin", "super_admin"),
  authorizePolicy({ action: "update", resourceType: "prescription", onDeny: { crossOrgStatus: 404, ownershipStatus: 404 } }),
  validate({ 
    params: prescriptionIdSchema,
    body: updatePrescriptionSchema,
   }),
  updatePrescription
);

/**
 * Delete prescription.
 */
router.delete(
  "/:id",
  authenticate,
  authorize("admin", "super_admin"),
  authorizePolicy({ action: "delete", resourceType: "prescription", onDeny: { crossOrgStatus: 404, ownershipStatus: 404 } }),
  validate({ 
    params: prescriptionIdSchema
   }),
  deletePrescription
);

export default router;