import asyncHandler from "../utils/asyncHandler.js";
import { successResponse } from "../utils/apiResponse.js";

import {
  createNewDepartment,
  getOrganizationDepartments,
  getDepartmentById,
  updateExistingDepartment,
  removeDepartment,
} from "../services/department.service.js";

export const createDepartment = asyncHandler(async (req, res) => {
  const result = await createNewDepartment(req.body, req.user);

  return successResponse(res, result, "Department created successfully.", 201);
});

export const getDepartments = asyncHandler(async (req, res) => {
  const result = await getOrganizationDepartments(
    req.params.organizationId,
    req.user,
    req.query
  );

  return successResponse(res, result, "Departments retrieved successfully.");
});

export const getDepartment = asyncHandler(async (req, res) => {
  const result = await getDepartmentById(req.params.id, req.user);

  return successResponse(res, result, "Department retrieved successfully.");
});

export const updateDepartment = asyncHandler(async (req, res) => {
  const result = await updateExistingDepartment(req.params.id, req.body, req.user);

  return successResponse(res, result, "Department updated successfully.");
});

export const deleteDepartment = asyncHandler(async (req, res) => {
  await removeDepartment(req.params.id, req.user);

  return successResponse(res, null, "Department deleted successfully.");
});