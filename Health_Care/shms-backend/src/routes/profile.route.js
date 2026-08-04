import { Router } from "express";

import authenticate from "../middleware/auth.middleware.js";
import authorize from "../middleware/role.middleware.js";
import validate from "../middleware/validate.middleware.js";

import {
  getMyProfile,
  updateMyProfile,
  changeMyPassword,
} from "../controllers/profile.controller.js";

import {
  updateProfileSchema,
  changePasswordSchema,
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

router.put(
  "/password",
  authenticate,
  validate({ body: changePasswordSchema }),
  changeMyPassword
);

export default router;
