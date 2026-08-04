import asyncHandler from "../utils/asyncHandler.js";
import { successResponse } from "../utils/apiResponse.js";

import {
  createNewStaff,
  getOrganizationStaff,
  getStaffById,
  updateExistingStaff,
  removeStaff,
} from "../services/staff.service.js";

export const createStaff = asyncHandler(async (req, res) => {
  const result = await createNewStaff(req.body, req.user);
  return successResponse(res, result, "Staff created successfully.", 201);
});

export const getStaff = asyncHandler(async (req, res) => {
  const result = await getOrganizationStaff(req.params.organizationId, req.user, req.query);
  return successResponse(res, result, "Staff retrieved successfully.");
});

export const getStaffMember = asyncHandler(async (req, res) => {
  const result = await getStaffById(req.params.id, req.user);
  return successResponse(res, result, "Staff retrieved successfully.");
});

export const updateStaff = asyncHandler(async (req, res) => {
  const result = await updateExistingStaff(req.params.id, req.body, req.user);
  return successResponse(res, result, "Staff updated successfully.");
});

export const deleteStaff = asyncHandler(async (req, res) => {
  await removeStaff(req.params.id, req.user);
  return successResponse(res, null, "Staff deleted successfully.");
});
