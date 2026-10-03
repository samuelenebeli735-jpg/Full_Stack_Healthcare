import { Router } from "express";

import authenticate from "../middleware/auth.middleware.js";
import authorize from "../middleware/role.middleware.js";
import validate from "../middleware/validate.middleware.js";

import {
  createMyMedicalRecord,
  getMyOwnMedicalRecord,
  getMyMedicalRecord,
  getAllMedicalRecords,
  getMedicalRecord,
  updateMyMedicalRecord,
  updateMedicalRecord,
} from "../controllers/medical-record.controller.js";

import {
  idParamSchema,
  updateMedicalRecordSchema,
} from "../validations/medical-record.validation.js";

const router = Router();

/*
|--------------------------------------------------------------------------
| Student Medical Records
|--------------------------------------------------------------------------
*/

router.post(
  "/me",
  authenticate,
  authorize("student"),
  createMyMedicalRecord
);

router.get(
  "/me",
  authenticate,
  authorize("student"),
  getMyOwnMedicalRecord
);

router.get(
  "/me/:id",
  authenticate,
  authorize("student"),
  validate({ params: idParamSchema }),
  getMyMedicalRecord
);

router.patch(
  "/me/:id",
  authenticate,
  authorize("student"),
  validate({ params: idParamSchema, body: updateMedicalRecordSchema }),
  updateMyMedicalRecord
);

/*
|--------------------------------------------------------------------------
| Staff/Admin Medical Records (Organization-wide)
|--------------------------------------------------------------------------
*/

router.get(
  "/",
  authenticate,
  authorize("staff", "admin", "super_admin"),
  getAllMedicalRecords
);

router.get(
  "/:id",
  authenticate,
  authorize("staff", "admin", "super_admin"),
  validate({ params: idParamSchema }),
  getMedicalRecord
);

router.patch(
  "/:id",
  authenticate,
  authorize("staff", "admin", "super_admin"),
  validate({ params: idParamSchema, body: updateMedicalRecordSchema }),
  updateMedicalRecord
);

export default router;