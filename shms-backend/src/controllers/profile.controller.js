import asyncHandler from "../utils/asyncHandler.js";
import { successResponse } from "../utils/apiResponse.js";

import {
  getProfile,
  updateStudentProfile,
  changePassword,
} from "../services/profile.service.js";

export const getMyProfile = asyncHandler(async (req, res) => {
  const result = await getProfile(req.user.id);

  return successResponse(res, result, "Profile retrieved successfully.");
});

export const updateMyProfile = asyncHandler(async (req, res) => {
  const result = await updateStudentProfile(req.user.id, req.body);

  return successResponse(res, result, "Profile updated successfully.");
});

export const changeMyPassword = asyncHandler(async (req, res) => {
  const result = await changePassword(req.user.id, req.body);

  return successResponse(res, result, result.message);
});
