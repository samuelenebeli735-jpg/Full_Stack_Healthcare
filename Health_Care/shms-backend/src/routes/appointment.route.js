import { Router } from "express";

import authenticate from "../middleware/auth.middleware.js";
import authorize from "../middleware/role.middleware.js";

import {
  createAppointment,
  getAppointments,
  getAppointment,
  getMyAppointmentsController,
  updateAppointment,
  deleteAppointment,
} from "../controllers/appointment.controller.js";

import validate from "../middleware/validate.middleware.js";

import {
  createAppointmentSchema,
  organizationAppointmentSchema,
  updateAppointmentSchema,
  idParamSchema,
} from "../validations/appointment.validation.js";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize("student", "staff", "admin", "super_admin"),
  validate({ body: createAppointmentSchema }),
  createAppointment
);

router.get(
  "/my",
  authenticate,
  authorize("student"),
  getMyAppointmentsController
);

router.get(
  "/organization/:organizationId",
  authenticate,
  authorize("staff", "admin", "super_admin"),
  validate({ params: organizationAppointmentSchema }),
  getAppointments
);

router.get(
  "/:id",
  authenticate,
  authorize("staff", "admin", "super_admin"),
  validate({ params: idParamSchema }),
  getAppointment
);

router.patch(
  "/:id",
  authenticate,
  authorize("staff", "admin", "super_admin"),
  validate({ params: idParamSchema, body: updateAppointmentSchema }),
  updateAppointment
);

router.delete(
  "/:id",
  authenticate,
  authorize("admin", "super_admin"),
  validate({ params: idParamSchema }),
  deleteAppointment
);

export default router;
