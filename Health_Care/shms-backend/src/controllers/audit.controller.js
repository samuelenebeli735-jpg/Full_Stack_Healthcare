import asyncHandler from "../utils/asyncHandler.js";
import { successResponse } from "../utils/apiResponse.js";

import {
  getAllAuditLogs,
  getAuditLogById,
  getOrganizationAuditLogs,
  removeAuditLog,
} from "../services/audit.service.js";

export const getAll = asyncHandler(async (req, res) => {
  const result = await getAllAuditLogs(req.user, req.query);

  return successResponse(res, result, "Audit logs retrieved successfully.");
});

export const getById = asyncHandler(async (req, res) => {
  const result = await getAuditLogById(req.params.id, req.user);

  return successResponse(res, result, "Audit log retrieved successfully.");
});

export const getByOrganization = asyncHandler(async (req, res) => {
  const result = await getOrganizationAuditLogs(
    req.params.organizationId,
    req.user,
    req.query
  );

  return successResponse(
    res,
    result,
    "Audit logs retrieved successfully."
  );
});

export const remove = asyncHandler(async (req, res) => {
  await removeAuditLog(req.params.id, req.user);

  return successResponse(res, null, "Audit log deleted successfully.");
});
