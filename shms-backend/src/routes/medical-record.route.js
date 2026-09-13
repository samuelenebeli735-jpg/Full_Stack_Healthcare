import { Router } from "express";

import authenticate from "../middleware/auth.middleware.js";
import authorize from "../middleware/role.middleware.js";
import { authorizePolicy } from "../middleware/policy.middleware.js";
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
  authorizePolicy({ action: "create", resourceType: "medicalRecord", onDeny: { crossOrgStatus: 404, ownershipStatus: 404 } }),
  createMyMedicalRecord
);

router.get(
  "/me",
  authenticate,
  authorize("student"),
  authorizePolicy({ action: "read", resourceType: "medicalRecord", onDeny: { crossOrgStatus: 404, ownershipStatus: 404 } }),
  getMyOwnMedicalRecord
);

router.get(
  "/me/:id",
  authenticate,
  authorize("student"),
  authorizePolicy({ action: "read", resourceType: "medicalRecord", onDeny: { crossOrgStatus: 404, ownershipStatus: 404 } }),
  validate({ params: idParamSchema }),
  getMyMedicalRecord
);

router.patch(
  "/me/:id",
  authenticate,
  authorize("student"),
  authorizePolicy({ action: "update", resourceType: "medicalRecord", onDeny: { crossOrgStatus: 404, ownershipStatus: 404 } }),
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
  authorizePolicy({ action: "read", resourceType: "medicalRecord", onDeny: { crossOrgStatus: 404, ownershipStatus: 404 } }),
  getAllMedicalRecords
);

router.get(
  "/:id",
  authenticate,
  authorize("staff", "admin", "super_admin"),
  authorizePolicy({ action: "read", resourceType: "medicalRecord", onDeny: { crossOrgStatus: 404, ownershipStatus: 404 } }),
  validate({ params: idParamSchema }),
  getMedicalRecord
);

router.patch(
  "/:id",
  authenticate,
  authorize("staff", "admin", "super_admin"),
  authorizePolicy({ action: "update", resourceType: "medicalRecord", onDeny: { crossOrgStatus: 404, ownershipStatus: 404 } }),
  validate({ params: idParamSchema, body: updateMedicalRecordSchema }),
  updateMedicalRecord
);

export default router;