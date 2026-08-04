import asyncHandler from "../utils/asyncHandler.js";
import { successResponse } from "../utils/apiResponse.js";

import {
  createNewOrganization,
  getAllOrganizations,
  getOrganizationById,
  listActiveOrganizations,
  updateExistingOrganization,
} from "../services/organization.service.js";

export const getActiveOrganizations = asyncHandler(async (req, res) => {
  const result = await listActiveOrganizations();
  return successResponse(res, result, "Organizations retrieved successfully.");
});

export const createOrganization = asyncHandler(async (req, res) => {
  const organization = await createNewOrganization(req.body, req.user);
  return successResponse(res, organization, "Organization created successfully.", 201);
});

export const getOrganizations = asyncHandler(async (req, res) => {
  const result = await getAllOrganizations(req.query);
  return successResponse(res, result, "Organizations retrieved successfully.");
});

export const getOrganization = asyncHandler(async (req, res) => {
  const result = await getOrganizationById(req.params.id);
  return successResponse(res, result, "Organization retrieved successfully.");
});

export const updateOrganization = asyncHandler(async (req, res) => {
  const result = await updateExistingOrganization(req.params.id, req.body, req.user);
  return successResponse(res, result, "Organization updated successfully.");
});
