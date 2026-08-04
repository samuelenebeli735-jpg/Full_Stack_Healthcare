import asyncHandler from "../utils/asyncHandler.js";
import { successResponse } from "../utils/apiResponse.js";

import {
  createNewPrescription,
  getAllPrescriptions,
  getPrescriptionById,
  updateExistingPrescription,
  removePrescription,
} from "../services/prescription.service.js";

export const createPrescription = asyncHandler(async (req, res) => {
  const result = await createNewPrescription(req.body, req.user);

  return successResponse(
    res,
    result,
    "Prescription created successfully.",
    201
  );
});

export const getPrescriptions = asyncHandler(async (req, res) => {
  const result = await getAllPrescriptions(req.user, req.query);

  return successResponse(
    res,
    result,
    "Prescriptions retrieved successfully."
  );
});

export const getPrescription = asyncHandler(async (req, res) => {
  const result = await getPrescriptionById(req.params.id, req.user);

  return successResponse(
    res,
    result,
    "Prescription retrieved successfully."
  );
});

export const updatePrescription = asyncHandler(async (req, res) => {
  const result = await updateExistingPrescription(req.params.id, req.body, req.user);

  return successResponse(
    res,
    result,
    "Prescription updated successfully."
  );
});

export const deletePrescription = asyncHandler(async (req, res) => {
  await removePrescription(req.params.id, req.user);

  return successResponse(res, null, "Prescription deleted successfully.");
});
