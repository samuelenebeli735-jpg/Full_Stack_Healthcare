import { Router } from "express";

import authenticate from "../middleware/auth.middleware.js";
import authorize from "../middleware/role.middleware.js";
import validate from "../middleware/validate.middleware.js";

import {
  appointmentReport,
  consultationReport,
  patientReport,
  staffReport,
} from "../controllers/report.controller.js";

import {
  reportDateQuerySchema,
  reportOrganizationQuerySchema,
} from "../validations/report.validation.js";

const router = Router();

router.get(
  "/appointments",
  authenticate,
  authorize("admin", "super_admin"),
  validate({ query: reportDateQuerySchema }),
  appointmentReport
);

router.get(
  "/consultations",
  authenticate,
  authorize("admin", "super_admin"),
  validate({ query: reportDateQuerySchema }),
  consultationReport
);

router.get(
  "/patients",
  authenticate,
  authorize("admin", "super_admin"),
  validate({ query: reportOrganizationQuerySchema }),
  patientReport
);

router.get(
  "/staff",
  authenticate,
  authorize("admin", "super_admin"),
  validate({ query: reportOrganizationQuerySchema }),
  staffReport
);

export default router;
