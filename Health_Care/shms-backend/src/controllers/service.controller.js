import asyncHandler from "../utils/asyncHandler.js";
import { successResponse } from "../utils/apiResponse.js";

import {
  createNewService,
  getOrganizationServices,
  getServiceById,
  updateExistingService,
  removeService,
} from "../services/service.service.js";

export const createService = asyncHandler(async (req, res) => {
  const result = await createNewService(req.body, req.user);
  return successResponse(res, result, "Service created successfully.", 201);
});

export const getServices = asyncHandler(async (req, res) => {
  const result = await getOrganizationServices(req.params.organizationId, req.user, req.query);
  return successResponse(res, result, "Services retrieved successfully.");
});

export const getService = asyncHandler(async (req, res) => {
  const result = await getServiceById(req.params.id, req.query.organizationId, req.user);
  return successResponse(res, result, "Service retrieved successfully.");
});

export const updateService = asyncHandler(async (req, res) => {
  const result = await updateExistingService(req.params.id, req.body, req.user);
  return successResponse(res, result, "Service updated successfully.");
});

export const deleteService = asyncHandler(async (req, res) => {
  await removeService(req.params.id, req.user);
  return successResponse(res, null, "Service deleted successfully.");
});
