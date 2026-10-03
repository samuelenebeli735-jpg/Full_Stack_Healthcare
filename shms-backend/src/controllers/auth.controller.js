import asyncHandler from "../utils/asyncHandler.js";
import { successResponse } from "../utils/apiResponse.js";

import {
  registerStudent,
  loginStudent,
  forgotPassword,
  resetPassword,
} from "../services/auth.service.js";

/*
|--------------------------------------------------------------------------
| Register Student
|--------------------------------------------------------------------------
*/

export const register = asyncHandler(async (req, res) => {
  const result = await registerStudent(req.body);

  return successResponse(
    res,
    result,
    "Student registered successfully.",
    201
  );
});

/*
|--------------------------------------------------------------------------
| Login Student
|--------------------------------------------------------------------------
*/

export const login = asyncHandler(async (req, res) => {
  const result = await loginStudent(req.body);

  return successResponse(
    res,
    result,
    "Login successful.",
    200
  );
});

/*
|--------------------------------------------------------------------------
| Verify Token / Get Current User
|--------------------------------------------------------------------------
*/

export const verify = asyncHandler(async (req, res) => {
  const user = req.user;

  return successResponse(
    res,
    { user },
    "Token is valid."
  );
});

export const forgot = asyncHandler(async (req, res) => {
  const result = await forgotPassword(req.body.email);

  return successResponse(
    res,
    result,
    "If the email exists, a reset link has been sent.",
    200
  );
});

export const reset = asyncHandler(async (req, res) => {
  const result = await resetPassword(
    req.body.token,
    req.body.password
  );

  return successResponse(
    res,
    result,
    result.message,
    200
  );
});