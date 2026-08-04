import { Router } from "express";

import authenticate from "../middleware/auth.middleware.js";
import authorize from "../middleware/role.middleware.js";

import validate from "../middleware/validate.middleware.js";

import {
  createServiceSchema,
  organizationServiceSchema,
  updateServiceSchema,
  idParamSchema,
} from "../validations/service.validation.js";

import {
  createService,
  getServices,
  getService,
  updateService,
  deleteService,
} from "../controllers/service.controller.js";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize("admin", "super_admin"),
  validate({ body: createServiceSchema }),
  createService
);

router.get(
  "/organization/:organizationId",
  authenticate,
  authorize("student", "staff", "admin", "super_admin"),
  validate({ params: organizationServiceSchema }),
  getServices
);

router.get(
  "/:id",
  authenticate,
  authorize("admin", "super_admin"),
  validate({ params: idParamSchema }),
  getService
);

router.patch(
  "/:id",
  authenticate,
  authorize("admin", "super_admin"),
  validate({ params: idParamSchema, body: updateServiceSchema }),
  updateService
);

router.delete(
  "/:id",
  authenticate,
  authorize("admin", "super_admin"),
  validate({ params: idParamSchema }),
  deleteService
);

export default router;
