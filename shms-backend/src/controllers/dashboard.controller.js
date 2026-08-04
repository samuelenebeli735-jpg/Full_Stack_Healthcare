import asyncHandler from "../utils/asyncHandler.js";
import { successResponse } from "../utils/apiResponse.js";

import {
  getDashboardSummary,
  getAppointmentOverview,
  getQueueOverview,
} from "../services/dashboard.service.js";

export const getSummary = asyncHandler(async (req, res) => {
  const result = await getDashboardSummary(req.user, req.query);

  return successResponse(
    res,
    result,
    "Dashboard summary retrieved successfully."
  );
});

export const getAppointments = asyncHandler(async (req, res) => {
  const result = await getAppointmentOverview(req.user, req.query);

  return successResponse(
    res,
    result,
    "Appointment overview retrieved successfully."
  );
});

export const getQueue = asyncHandler(async (req, res) => {
  const result = await getQueueOverview(req.user, req.query);

  return successResponse(
    res,
    result,
    "Queue overview retrieved successfully."
  );
});
