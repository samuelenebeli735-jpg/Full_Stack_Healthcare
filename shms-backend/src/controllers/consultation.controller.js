import asyncHandler from "../utils/asyncHandler.js";
import { successResponse } from "../utils/apiResponse.js";

import {
  createPatientConsultation,
  getConsultationById,
  getAllConsultations,
  updatePatientConsultation,
  removeConsultation,
} from "../services/consultation.service.js";

export const create = asyncHandler(async (req, res) => {
  const result = await createPatientConsultation(req.body, req.user);

  return successResponse(
    res,
    result,
    "Consultation created successfully.",
    201
  );
});

export const getAll = asyncHandler(async (req, res) => {
  const result = await getAllConsultations(req.user, req.query);

  return successResponse(
    res,
    result,
    "Consultations retrieved successfully."
  );
});

export const getById = asyncHandler(async (req, res) => {
  const result = await getConsultationById(req.params.id, req.user);

  return successResponse(
    res,
    result,
    "Consultation retrieved successfully."
  );
});

export const update = asyncHandler(async (req, res) => {
  const result = await updatePatientConsultation(
    req.params.id,
    req.body,
    req.user
  );

  return successResponse(
    res,
    result,
    "Consultation updated successfully."
  );
});

export const remove = asyncHandler(async (req, res) => {
  await removeConsultation(req.params.id, req.user);

  return successResponse(
    res,
    null,
    "Consultation deleted successfully."
  );
});
