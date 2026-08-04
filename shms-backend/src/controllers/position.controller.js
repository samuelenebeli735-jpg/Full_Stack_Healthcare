import asyncHandler from "../utils/asyncHandler.js";
import { successResponse } from "../utils/apiResponse.js";

import {
  createNewPosition,
  getOrganizationPositions,
  getPositionById,
  updateExistingPosition,
  removePosition,
} from "../services/position.service.js";

export const createPosition = asyncHandler(async (req, res) => {
  const result = await createNewPosition(req.body, req.user);
  return successResponse(res, result, "Position created successfully.", 201);
});

export const getPositions = asyncHandler(async (req, res) => {
  const result = await getOrganizationPositions(req.params.organizationId, req.user, req.query);
  return successResponse(res, result, "Positions retrieved successfully.");
});

export const getPosition = asyncHandler(async (req, res) => {
  const result = await getPositionById(req.params.id, req.user);
  return successResponse(res, result, "Position retrieved successfully.");
});

export const updatePosition = asyncHandler(async (req, res) => {
  const result = await updateExistingPosition(req.params.id, req.body, req.user);
  return successResponse(res, result, "Position updated successfully.");
});

export const deletePosition = asyncHandler(async (req, res) => {
  await removePosition(req.params.id, req.user);
  return successResponse(res, null, "Position deleted successfully.");
});
