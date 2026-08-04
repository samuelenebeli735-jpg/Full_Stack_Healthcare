import { Router } from "express";

import validate from "../middleware/validate.middleware.js";
import authenticate from "../middleware/auth.middleware.js";
import { passwordResetLimiter } from "../middleware/rateLimiter.middleware.js";

import {
  register,
  login,
  verify,
  forgot,
  reset,
} from "../controllers/auth.controller.js";

import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../validations/auth.validation.js";

const router = Router();

/*
|--------------------------------------------------------------------------
| Authentication Routes
|--------------------------------------------------------------------------
*/

router.post(
  "/register",
  validate({ body: registerSchema }),
  register
);

router.post(
  "/login",
  validate({ body: loginSchema }),
  login
);

router.get(
  "/verify",
  authenticate,
  verify
);

router.post(
  "/forgot-password",
  passwordResetLimiter,
  validate({ body: forgotPasswordSchema }),
  forgot
);

router.post(
  "/reset-password",
  passwordResetLimiter,
  validate({ body: resetPasswordSchema }),
  reset
);

export default router;
