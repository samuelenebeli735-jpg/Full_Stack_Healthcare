import asyncHandler from "../utils/asyncHandler.js";

import { successResponse } from "../utils/apiResponse.js";

import {
  createNewAppointment,
  getOrganizationAppointments,
  getMyAppointments,
  getAppointmentById,
  updateExistingAppointment,
  removeAppointment,
  getStaffAvailableSlots,
  cancelAppointment as cancelAppointmentService,
  rescheduleAppointment as rescheduleAppointmentService,
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

export const getAvailableSlots = asyncHandler(
  async (req, res) => {
    const result = await getStaffAvailableSlots(
      req.params.staffId,
      req.params.date,
      req.user,
      req.query
    );

    return successResponse(
      res,
      result,
      "Available slots retrieved successfully."
    );
  }
);

export const cancelAppointment = asyncHandler(async (req, res) => {
  const appointment = await cancelAppointmentService(
    req.params.id,
    req.body,
    req.user
  );

  return successResponse(
    res,
    appointment,
    "Appointment cancelled successfully."
  );
});

export const rescheduleAppointment = asyncHandler(async (req, res) => {
  const appointment = await rescheduleAppointmentService(
    req.params.id,
    req.body,
    req.user
  );

  return successResponse(
    res,
    appointment,
    "Appointment rescheduled successfully."
  );
});