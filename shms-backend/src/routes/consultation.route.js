import { Router } from "express";

import authenticate from "../middleware/auth.middleware.js";
import authorize from "../middleware/role.middleware.js";
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
  getAll
);

/**
 * Get consultation by ID.
 */
router.get(
  "/:id",
  authenticate,
  authorize("staff", "admin", "super_admin"),
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
  validate({ params: consultationIdSchema }),
  remove
);

export default router;
