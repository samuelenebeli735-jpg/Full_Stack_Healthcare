import asyncHandler from "../utils/asyncHandler.js";

import { successResponse } from "../utils/apiResponse.js";

import {
  createStaffSchedule,
  getScheduleById,
  getStaffSchedules,
  getSchedulesByDay,
  getOrganizationSchedules,
  updateStaffSchedule,
  removeSchedule,
} from "../services/schedule.service.js";

/**
 * Create schedule.
 */
export const create = asyncHandler(async (req, res) => {
  const schedule = await createStaffSchedule(req.body, req.user);

  return successResponse(
    res,
    schedule,
    "Schedule created successfully.",
    201
  );
});

/**
 * Get schedule by ID.
 */
export const getById = asyncHandler(async (req, res) => {
  const schedule = await getScheduleById(req.params.id, req.user);

  return successResponse(
    res,
    schedule,
    "Schedule retrieved successfully."
  );
});

/**
 * Get schedules for a staff member.
 */
export const getStaff = asyncHandler(async (req, res) => {
  const schedules = await getStaffSchedules(
    req.params.staffId,
    req.user
  );

  return successResponse(
    res,
    schedules,
    "Schedules retrieved successfully."
  );
});

/**
 * Get schedules by day.
 */
export const getDay = asyncHandler(async (req, res) => {
  const schedules = await getSchedulesByDay(
    req.params.organizationId,
    req.params.dayOfWeek,
    req.user
  );

  return successResponse(
    res,
    schedules,
    "Schedules retrieved successfully."
  );
});

/**
 * Get all schedules for an organization.
 */
export const getOrganization = asyncHandler(async (req, res) => {
  const schedules = await getOrganizationSchedules(
    req.params.organizationId,
    req.user
  );

  return successResponse(
    res,
    schedules,
    "Schedules retrieved successfully."
  );
});

/**
 * Update schedule.
 */
export const update = asyncHandler(async (req, res) => {
  const schedule = await updateStaffSchedule(
    req.params.id,
    req.body,
    req.user
  );

  return successResponse(
    res,
    schedule,
    "Schedule updated successfully."
  );
});

/**
 * Delete schedule.
 */
export const remove = asyncHandler(async (req, res) => {
  await removeSchedule(req.params.id, req.user);

  return successResponse(
    res,
    null,
    "Schedule deleted successfully."
  );
});