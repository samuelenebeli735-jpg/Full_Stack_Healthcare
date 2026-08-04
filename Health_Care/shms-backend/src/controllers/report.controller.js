import asyncHandler from "../utils/asyncHandler.js";
import { successResponse } from "../utils/apiResponse.js";

import {
  getAppointmentReport,
  getConsultationReport,
  getPatientReport,
  getStaffReport,
} from "../services/report.service.js";

export const appointmentReport = asyncHandler(async (req, res) => {
  const result = await getAppointmentReport(req.user, req.query);

  return successResponse(
    res,
    result,
    "Appointment report retrieved successfully."
  );
});

export const consultationReport = asyncHandler(async (req, res) => {
  const result = await getConsultationReport(req.user, req.query);

  return successResponse(
    res,
    result,
    "Consultation report retrieved successfully."
  );
});

export const patientReport = asyncHandler(async (req, res) => {
  const result = await getPatientReport(req.user, req.query);

  return successResponse(
    res,
    result,
    "Patient report retrieved successfully."
  );
});

export const staffReport = asyncHandler(async (req, res) => {
  const result = await getStaffReport(req.user, req.query);

  return successResponse(
    res,
    result,
    "Staff report retrieved successfully."
  );
});
