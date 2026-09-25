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
  getAvailableSlots,
  cancelAppointment,
  rescheduleAppointment,
} from "../controllers/appointment.controller.js";

import validate from "../middleware/validate.middleware.js";

import {
  createAppointmentSchema,
  organizationAppointmentSchema,
  updateAppointmentSchema,
  idParamSchema,
  staffSlotsParamsSchema,
  slotsQuerySchema,
  cancelAppointmentSchema,
  rescheduleAppointmentSchema,
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
  "/slots/:staffId/:date",
  authenticate,
  authorize("student", "staff", "admin", "super_admin"),
  validate({
    params: staffSlotsParamsSchema,
    query: slotsQuerySchema,
  }),
  getAvailableSlots
);

router.post(
  "/:id/cancel",
  authenticate,
  authorize("student"),
  validate({
    params: idParamSchema,
    body: cancelAppointmentSchema,
  }),
  cancelAppointment
);

router.post(
  "/:id/reschedule",
  authenticate,
  authorize("student"),
  validate({
    params: idParamSchema,
    body: rescheduleAppointmentSchema,
  }),
  rescheduleAppointment
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
