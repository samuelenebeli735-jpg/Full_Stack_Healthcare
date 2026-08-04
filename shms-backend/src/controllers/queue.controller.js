import asyncHandler from "../utils/asyncHandler.js";
import { successResponse } from "../utils/apiResponse.js";

import {
  checkInPatient,
  getTodayQueue,
  getQueueById,
  getMyQueue,
  callNextPatient,
  startConsultation,
  completeConsultation,
} from "../services/queue.service.js";

export const checkIn = asyncHandler(async (req, res) => {
  const result = await checkInPatient(req.body, req.user);

  return successResponse(res, result, "Check-in successful.", 201);
});

export const getToday = asyncHandler(async (req, res) => {
  const result = await getTodayQueue(
    req.params.organizationId,
    req.user,
    req.query
  );

  return successResponse(res, result, "Today's queue retrieved successfully.");
});

export const getQueue = asyncHandler(async (req, res) => {
  const result = await getQueueById(req.params.id, req.user);

  return successResponse(res, result, "Queue entry retrieved successfully.");
});

export const getMyQueueController = asyncHandler(async (req, res) => {
  const result = await getMyQueue(req.user);

  return successResponse(res, result, "Queue status retrieved successfully.");
});

export const callNext = asyncHandler(async (req, res) => {
  const result = await callNextPatient(req.params.organizationId, req.user);

  return successResponse(res, result, "Next patient called successfully.");
});

export const start = asyncHandler(async (req, res) => {
  const result = await startConsultation(req.params.id, req.user);

  return successResponse(res, result, "Consultation started successfully.");
});

export const complete = asyncHandler(async (req, res) => {
  const result = await completeConsultation(req.params.id, req.user);

  return successResponse(res, result, "Consultation completed successfully.");
});
