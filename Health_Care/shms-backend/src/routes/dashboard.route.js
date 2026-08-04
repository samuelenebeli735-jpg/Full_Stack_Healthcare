import { Router } from "express";

import authenticate from "../middleware/auth.middleware.js";
import authorize from "../middleware/role.middleware.js";
import validate from "../middleware/validate.middleware.js";

import {
  getSummary,
  getAppointments,
  getQueue,
} from "../controllers/dashboard.controller.js";

import { dashboardQuerySchema } from "../validations/dashboard.validation.js";

const router = Router();

router.get(
  "/",
  authenticate,
  authorize("staff", "admin", "super_admin"),
  validate({ query: dashboardQuerySchema }),
  getSummary
);

router.get(
  "/appointments",
  authenticate,
  authorize("staff", "admin", "super_admin"),
  validate({ query: dashboardQuerySchema }),
  getAppointments
);

router.get(
  "/queue",
  authenticate,
  authorize("staff", "admin", "super_admin"),
  validate({ query: dashboardQuerySchema }),
  getQueue
);

export default router;
