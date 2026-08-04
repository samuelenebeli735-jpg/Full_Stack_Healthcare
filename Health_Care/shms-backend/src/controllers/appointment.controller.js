import asyncHandler from "../utils/asyncHandler.js";

import { successResponse } from "../utils/apiResponse.js";

import {
  createNewAppointment,
  getOrganizationAppointments,
  getMyAppointments,
  getAppointmentById,
  updateExistingAppointment,
  removeAppointment,
} from "../services/appointment.service.js";

/**
 * Create a new appointment.
 */
export const createAppointment = asyncHandler(
  async (req, res) => {
    const appointment = await createNewAppointment(
      req.body,
      req.user
    );

    return successResponse(
      res,
      appointment,
      "Appointment created successfully.",
      201
    );
  }
);

/**
 * Get all appointments for an organization.
 */
export const getAppointment = asyncHandler(async (req, res) => {
  const result = await getAppointmentById(req.params.id, req.query.organizationId, req.user);
  return successResponse(res, result, "Appointment retrieved successfully.");
});

export const getMyAppointmentsController = asyncHandler(
  async (req, res) => {
    const appointments = await getMyAppointments(req.user, req.query);

    return successResponse(
      res,
      appointments,
      "Appointments retrieved successfully."
    );
  }
);

export const updateAppointment = asyncHandler(async (req, res) => {
  const result = await updateExistingAppointment(req.params.id, req.body, req.user);
  return successResponse(res, result, "Appointment updated successfully.");
});

export const deleteAppointment = asyncHandler(async (req, res) => {
  await removeAppointment(req.params.id, req.user);
  return successResponse(res, null, "Appointment deleted successfully.");
});

export const getAppointments = asyncHandler(
  async (req, res) => {
    const appointments =
      await getOrganizationAppointments(
        req.params.organizationId,
        req.user,
        req.query
      );

    return successResponse(
      res,
      appointments,
      "Appointments retrieved successfully."
    );
  }
);