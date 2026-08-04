import { Router } from "express";
import validate from "../middleware/validate.middleware.js";

import authenticate from "../middleware/auth.middleware.js";
import authorize from "../middleware/role.middleware.js";

import {
  checkInSchema,
  queueIdSchema,
  organizationQueueSchema,
} from "../validations/queue.validation.js";

import {
  checkIn,
  getToday,
  getQueue,
  getMyQueueController,
  callNext,
  start,
  complete,
} from "../controllers/queue.controller.js";

const router = Router();

/**
 * Check in a patient.
 */
router.post(
  "/check-in",
  authenticate,
  authorize("student"),
  validate({ body: checkInSchema }),
  checkIn
);

router.get(
  "/my",
  authenticate,
  authorize("student"),
  getMyQueueController
);

/**
 * Today's queue.
 */
router.get(
  "/today/:organizationId",
  authenticate,
  authorize("staff", "admin", "super_admin"),
  validate({ params: organizationQueueSchema }),
  getToday
);

/**
 * Queue details.
 */
router.get(
  "/:id",
  authenticate,
  authorize("staff", "admin", "super_admin"),
  validate({ params: queueIdSchema }),
  getQueue
);

/**
 * Call next patient.
 */
router.post(
  "/call-next/:organizationId",
  authenticate,
  authorize("staff", "admin", "super_admin"),
  validate({ params: organizationQueueSchema }),
  callNext
);

/**
 * Start consultation.
 */
router.patch(
  "/:id/start",
  authenticate,
  authorize("staff", "admin", "super_admin"),
  validate({ params: queueIdSchema }),
  start
);

/**
 * Complete consultation.
 */
router.patch(
  "/:id/complete",
  authenticate,
  authorize("staff", "admin", "super_admin"),
  validate({ params: queueIdSchema }),
  complete
);

export default router;
