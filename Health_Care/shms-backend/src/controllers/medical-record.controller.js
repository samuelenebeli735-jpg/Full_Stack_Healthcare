import asyncHandler from "../utils/asyncHandler.js";
import { successResponse } from "../utils/apiResponse.js";

import {
  createStudentMedicalRecord,
  getMyMedicalRecord as getMyMedicalRecordService,
  getStudentMedicalRecordById,
  getOrganizationMedicalRecords,
  getMedicalRecordById,
  updateExistingMedicalRecord,
} from "../services/medical-record.service.js";

export const createMyMedicalRecord = asyncHandler(async (req, res) => {
  const medicalRecord = await createStudentMedicalRecord(req.user);
  return successResponse(res, medicalRecord, "Medical record created successfully.", 201);
});

export const getMyOwnMedicalRecord = asyncHandler(async (req, res) => {
  const result = await getMyMedicalRecordService(req.user);
  return successResponse(res, result, "Medical record retrieved successfully.");
});

export const getMyMedicalRecord = asyncHandler(async (req, res) => {
  const result = await getStudentMedicalRecordById(req.params.id, req.user.id);
  return successResponse(res, result, "Medical record retrieved successfully.");
});

export const getAllMedicalRecords = asyncHandler(async (req, res) => {
  const result = await getOrganizationMedicalRecords(req.user, req.query);
  return successResponse(res, result, "Medical records retrieved successfully.");
});

export const getMedicalRecord = asyncHandler(async (req, res) => {
  const result = await getMedicalRecordById(req.params.id, req.user);
  return successResponse(res, result, "Medical record retrieved successfully.");
});

export const updateMedicalRecord = asyncHandler(async (req, res) => {
  const result = await updateExistingMedicalRecord(req.params.id, req.body, req.user);
  return successResponse(res, result, "Medical record updated successfully.");
});

export const updateMyMedicalRecord = asyncHandler(async (req, res) => {
  const result = await updateExistingMedicalRecord(req.params.id, req.body, req.user);
  return successResponse(res, result, "Medical record updated successfully.");
});