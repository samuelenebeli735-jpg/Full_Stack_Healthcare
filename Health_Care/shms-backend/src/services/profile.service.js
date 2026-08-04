import prisma from "../config/db.js";
import AppError from "../utils/AppError.js";
import { hashPassword, comparePassword } from "../utils/password.js";

import {
  findProfileByUserId,
  updateProfile,
} from "../repositories/profile.repository.js";

import {
  findUserWithProfileById,
  findUserWithPasswordById,
} from "../repositories/user.repository.js";

export async function getProfile(userId) {
  const user = await findUserWithProfileById(userId);

  if (!user) {
    throw new AppError("User not found.", 404);
  }

  return user;
}

export async function updateStudentProfile(userId, data) {
  const user = await findUserWithProfileById(userId);

  if (!user) {
    throw new AppError("User not found.", 404);
  }

  if (!user.profile) {
    throw new AppError("Student profile not found.", 404);
  }

  const allowedFields = [
    "firstName",
    "middleName",
    "lastName",
    "faculty",
    "department",
    "level",
    "gender",
    "dateOfBirth",
    "phone",
    "emergencyContactName",
    "emergencyContactPhone",
    "bloodGroup",
    "genotype",
    "allergies",
    "profilePhotoUrl",
  ];

  const updateData = {};
  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      updateData[field] = field === "dateOfBirth"
        ? new Date(data[field])
        : data[field];
    }
  }

  if (Object.keys(updateData).length === 0) {
    throw new AppError("No valid fields to update.", 400);
  }

  return await updateProfile(user.profile.id, updateData);
}

export async function changePassword(userId, data) {
  const user = await findUserWithPasswordById(userId);

  if (!user) {
    throw new AppError("User not found.", 404);
  }

  const isMatch = await comparePassword(data.currentPassword, user.password);

  if (!isMatch) {
    throw new AppError("Current password is incorrect.", 401);
  }

  if (data.newPassword.length < 8) {
    throw new AppError("New password must be at least 8 characters.", 400);
  }

  const hashedPassword = await hashPassword(data.newPassword);

  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword, resetToken: null, resetTokenExpiry: null },
  });

  return { success: true, message: "Password changed successfully." };
}
