import { Router } from "express";

import validate from "../middleware/validate.middleware.js";
import authenticate from "../middleware/auth.middleware.js";
import {
  loginLimiter,
  registerLimiter,
  passwordResetLimiter,
} from "../middleware/rateLimiter.middleware.js";

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
  registerLimiter,
  validate({ body: registerSchema }),
  register
);

router.post(
  "/login",
  loginLimiter,
  validate({ body: loginSchema }),
  login
);

// Called on every page load; authenticated, so covered by the per-user API
// limiter rather than an auth bucket that would log people out.
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
