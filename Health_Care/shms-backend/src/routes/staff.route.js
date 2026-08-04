import { Router } from "express";

import authenticate from "../middleware/auth.middleware.js";
import authorize from "../middleware/role.middleware.js";

import validate from "../middleware/validate.middleware.js";

import {
    createStaffSchema,
    organizationStaffSchema,
    updateStaffSchema,
    idParamSchema,
} from "../validations/staff.validation.js";

import {
  createStaff,
  getStaff,
  getStaffMember,
  updateStaff,
  deleteStaff,
} from "../controllers/staff.controller.js";

const router = Router();

router.post(
    "/",
    authenticate,
    authorize("admin", "super_admin"),
    validate({ body: createStaffSchema }),
    createStaff
);

router.get(
    "/organization/:organizationId",
    authenticate,
    authorize("student", "staff", "admin", "super_admin"),
    validate({ params: organizationStaffSchema }),
    getStaff
);

router.get(
    "/:id",
    authenticate,
    authorize("admin", "super_admin"),
    validate({ params: idParamSchema }),
    getStaffMember
);

router.patch(
    "/:id",
    authenticate,
    authorize("admin", "super_admin"),
    validate({ params: idParamSchema, body: updateStaffSchema }),
    updateStaff
);

router.delete(
    "/:id",
    authenticate,
    authorize("admin", "super_admin"),
    validate({ params: idParamSchema }),
    deleteStaff
);

export default router;
