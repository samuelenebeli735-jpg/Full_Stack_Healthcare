import prisma from "../config/db.js";
import AppError from "../utils/AppError.js";
import { auditLogger } from "../utils/auditLogger.js";

import {
  findOrganizationById,
} from "../repositories/organization.repository.js";

import {
  findUserByEmail,
  findUserWithProfileByEmail,
  findUserWithProfileByMatricNumber,
  createUser,
  updateResetToken,
  findUserByResetToken,
  updatePassword,
} from "../repositories/user.repository.js";

import {
  findProfileByMatricNumber,
  createProfile,
} from "../repositories/profile.repository.js";

import {
  hashPassword,
  comparePassword,
} from "../utils/password.js";

import generateToken from "../utils/generateToken.js";
import { sendPasswordResetEmail } from "../utils/email.js";
import crypto from "crypto";

/**
 * Register a new student.
 */
export async function registerStudent(data) {
  const organization = await findOrganizationById(data.organizationId);

  if (!organization) {
    throw new AppError("Organization not found.", 404);
  }

  if (!organization.isActive) {
    throw new AppError("Organization not found.", 404);
  }

  const existingUser = await findUserByEmail(data.email);

  if (existingUser) {
  throw new AppError("Email already exists.", 409);
}

  const existingProfile = await findProfileByMatricNumber(
    data.matricNumber
  );

  if (existingProfile) {
    throw new AppError("Matric number already exists.", 409);
  }

  const hashedPassword = await hashPassword(data.password);

  const result = await prisma.$transaction(async (tx) => {
    const user = await createUser(
      {
        organizationId: data.organizationId,
        email: data.email,
        password: hashedPassword,
        role: "student",
      },
      tx
    );

    const profile = await createProfile(
      {
        userId: user.id,
        firstName: data.firstName,
        middleName: data.middleName,
        lastName: data.lastName,
        matricNumber: data.matricNumber,
        faculty: data.faculty,
        department: data.department,
        level: data.level,
        gender: data.gender,
        dateOfBirth: new Date(data.dateOfBirth),
        phone: data.phone,
        emergencyContactName: data.emergencyContactName,
        emergencyContactPhone: data.emergencyContactPhone,
        bloodGroup: data.bloodGroup,
        genotype: data.genotype,
        allergies: data.allergies,
      },
      tx
    );

    return { user, profile };
  });

  const { password, resetToken, resetTokenExpiry, ...safeUser } = result.user;

  const token = generateToken({ userId: safeUser.id, organizationId: safeUser.organizationId, role: safeUser.role });

await auditLogger({
  organizationId: safeUser.organizationId,
  userId: safeUser.id,
  action: "REGISTER",
  entity: "User",
  entityId: safeUser.id,
  description: `Student ${result.profile.firstName} ${result.profile.lastName} registered.`,
});

return {
  user: safeUser,
  profile: result.profile,
  token,
};
}

/**
 * Login a student.
 */
export async function loginStudent(data) {
  const user =
    (await findUserWithProfileByEmail(data.identifier)) ||
    (await findUserWithProfileByMatricNumber(data.identifier));

  if (!user) {
    throw new AppError("Invalid email or password.", 401);
  }

  const passwordMatches = await comparePassword(
    data.password,
    user.password
  );

  if (!passwordMatches) {
    throw new AppError("Invalid email or password.", 401);
  }

  if (!user.isActive) {
    throw new AppError("Your account has been deactivated.", 403);
  }

  const { password, resetToken, resetTokenExpiry, ...safeUser } = user;

  const token = generateToken({ userId: safeUser.id, organizationId: safeUser.organizationId, role: safeUser.role });

await auditLogger({
  organizationId: safeUser.organizationId,
  userId: safeUser.id,
  action: "LOGIN",
  entity: "User",
  entityId: safeUser.id,
  description: `${safeUser.email} logged in.`,
});

return {
  user: safeUser,
  token,
};
}

export async function forgotPassword(email) {
  const user = await findUserByEmail(email);

  if (!user) {
    return { success: true };
  }

  const resetToken = crypto.randomBytes(32).toString("hex");

  const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

  const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);

  await updateResetToken(user.id, hashedToken, resetTokenExpiry);

  await sendPasswordResetEmail(user, resetToken);

  return { success: true };
}

export async function resetPassword(resetToken, newPassword) {
  const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

  const user = await findUserByResetToken(hashedToken);

  if (!user) {
    throw new AppError("Invalid or expired reset token.", 400);
  }

  const hashedPassword = await hashPassword(newPassword);

  await updatePassword(user.id, hashedPassword);

  return { success: true, message: "Password reset successfully." };
}