import { Router } from "express";

import validate from "../middleware/validate.middleware.js";

import {
  createDepartmentSchema,
  organizationDepartmentSchema,
  updateDepartmentSchema,
  idParamSchema,
} from "../validations/department.validation.js";

import {
  createDepartment,
  getDepartments,
  getDepartment,
  updateDepartment,
  deleteDepartment,
} from "../controllers/department.controller.js";

import authenticate from "../middleware/auth.middleware.js";
import authorize from "../middleware/role.middleware.js";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize("admin", "super_admin"),
  validate({ body: createDepartmentSchema }),
  createDepartment
);

router.get(
  "/organization/:organizationId",
  authenticate,
  authorize("student", "staff", "admin", "super_admin"),
  validate({ params: organizationDepartmentSchema }),
  getDepartments
);

router.get(
  "/:id",
  authenticate,
  authorize("admin", "super_admin"),
  validate({ params: idParamSchema }),
  getDepartment
);

router.patch(
  "/:id",
  authenticate,
  authorize("admin", "super_admin"),
  validate({ params: idParamSchema, body: updateDepartmentSchema }),
  updateDepartment
);

router.delete(
  "/:id",
  authenticate,
  authorize("admin", "super_admin"),
  validate({ params: idParamSchema }),
  deleteDepartment
);

export default router;