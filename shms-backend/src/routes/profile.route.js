import { Router } from "express";

import authenticate from "../middleware/auth.middleware.js";
import authorize from "../middleware/role.middleware.js";
import validate from "../middleware/validate.middleware.js";

import {
  getMyProfile,
  updateMyProfile,
  changeMyPassword,
  updateStudentAccountStatus,
} from "../controllers/profile.controller.js";

import {
  updateProfileSchema,
  changePasswordSchema,
  studentAccountParamsSchema,
  studentAccountStatusSchema,
} from "../validations/profile.validation.js";

const router = Router();

router.get(
  "/me",
  authenticate,
  authorize("student"),
  getMyProfile
);

router.put(
  "/me",
  authenticate,
  authorize("student"),
  validate({ body: updateProfileSchema }),
  updateMyProfile
);

// Admin: enable/disable a student's login account.
router.patch(
  "/students/:userId/status",
  authenticate,
  authorize("admin", "super_admin"),
  validate({ params: studentAccountParamsSchema, body: studentAccountStatusSchema }),
  updateStudentAccountStatus
);

router.put(
  "/password",
  authenticate,
  validate({ body: changePasswordSchema }),
  changeMyPassword
);

export default router;
