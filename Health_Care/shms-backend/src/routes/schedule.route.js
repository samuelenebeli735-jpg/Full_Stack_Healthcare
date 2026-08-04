import { Router } from "express";

import authenticate from "../middleware/auth.middleware.js";
import authorize from "../middleware/role.middleware.js";
import validate from "../middleware/validate.middleware.js";

import {
  createScheduleSchema,
  updateScheduleSchema,
  scheduleIdSchema,
  staffScheduleSchema,
  dayScheduleSchema,
  organizationSchedulesSchema,
} from "../validations/schedule.validation.js";

import {
  create,
  getById,
  getStaff,
  getDay,
  getOrganization,
  update,
  remove,
} from "../controllers/schedule.controller.js";

const router = Router();

/**
 * Create schedule.
 */
router.post(
  "/",
  authenticate,
  authorize("admin", "super_admin"),
  validate({
    body: createScheduleSchema,
  }),
  create
);

/**
 * Get all schedules for a staff member.
 */
router.get(
  "/staff/:staffId",
  authenticate,
  authorize("student", "staff", "admin", "super_admin"),
  validate({
    params: staffScheduleSchema,
  }),
  getStaff
);

/**
 * Get schedules for a day.
 */
router.get(
  "/day/:organizationId/:dayOfWeek",
  authenticate,
  authorize("staff", "admin", "super_admin"),
  validate({
    params: dayScheduleSchema,
  }),
  getDay
);

/**
 * Get all schedules for an organization (admin view).
 */
router.get(
  "/organization/:organizationId",
  authenticate,
  authorize("staff", "admin", "super_admin"),
  validate({
    params: organizationSchedulesSchema,
  }),
  getOrganization
);

/**
 * Get schedule by ID.
 */
router.get(
  "/:id",
  authenticate,
  authorize("staff", "admin", "super_admin"),
  validate({
    params: scheduleIdSchema,
  }),
  getById
);

/**
 * Update schedule.
 */
router.patch(
  "/:id",
  authenticate,
  authorize("admin", "super_admin"),
  validate({
    params: scheduleIdSchema,
    body: updateScheduleSchema,
  }),
  update
);

/**
 * Delete schedule.
 */
router.delete(
  "/:id",
  authenticate,
  authorize("admin", "super_admin"),
  validate({
    params: scheduleIdSchema,
  }),
  remove
);

export default router;
