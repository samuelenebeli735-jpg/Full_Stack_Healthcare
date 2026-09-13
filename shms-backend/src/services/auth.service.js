import AppError from "../utils/AppError.js";
import { auditLogger } from "../utils/auditLogger.js";
import { withTenant } from "../utils/tenantContext.js";

import {
  findOrganizationById,
} from "../repositories/organization.repository.js";

import {
  findAuthUserByIdentifier,
  findUserByEmail,
  findUserByResetToken,
  createUser,
  updateResetToken,
  updatePassword,
} from "../repositories/user.repository.js";

import {
  createProfile,
} from "../repositories/profile.repository.js";

import {
  hashPassword,
  comparePassword,
} from "../utils/password.js";

import generateToken from "../utils/generateToken.js";
import { sendPasswordResetEmail } from "../utils/email.js";
import {
  recordLoginFailure,
  recordLoginSuccess,
} from "../authorization/risk.js";
import { securityAudit } from "../utils/securityAudit.js";
import crypto from "crypto";

/**
 * Register a new student.
 *
 * The pre-registration duplicate checks (email / matric number) are
 * intentionally cross-tenant and therefore run through the SECURITY
 * DEFINER authentication helper. Account creation itself runs under a
 * tenant transaction scoped to the target organization.
 */
export async function registerStudent(data) {
  const organization = await findOrganizationById(data.organizationId);

  if (!organization) {
    throw new AppError("Organization not found.", 404);
  }

  if (!organization.isActive) {
    throw new AppError("Organization not found.", 404);
  }

  const existingUser = await findAuthUserByIdentifier(data.email);

  if (existingUser) {
    throw new AppError("Email already exists.", 409);
  }

  const existingProfile = await findAuthUserByIdentifier(data.matricNumber);

  if (existingProfile) {
    throw new AppError("Matric number already exists.", 409);
  }

  const hashedPassword = await hashPassword(data.password);

  const result = await withTenant(data.organizationId, async (tx) => {
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
 *
 * The user is resolved BEFORE any tenant context exists (identifier can
 * be email, matric number, or staff number), so this lookup uses the
 * SECURITY DEFINER authentication helper rather than a tenant-scoped
 * query.
 */
export async function loginStudent(data, context = {}) {
  const identifier = String(data.identifier ?? "").trim();
  const password = String(data.password ?? "");
  const ip = context.ipAddress || null;

  if (!identifier || !password) {
    throw new AppError("Email or password is required.", 401);
  }

  const user = await findAuthUserByIdentifier(identifier);

  if (!user) {
    recordLoginFailure(identifier, ip);
    throw new AppError("Invalid email or password.", 401);
  }

  const passwordMatches = await comparePassword(password, user.password);

  if (!passwordMatches) {
    recordLoginFailure(identifier, ip);
    securityAudit({
      organizationId: user.organizationId,
      userId: user.id,
      action: "AUTH_FAILURE",
      entity: "User",
      entityId: user.id,
      description: `Failed login attempt for ${user.email}.`,
      ipAddress: ip,
      userAgent: context.userAgent || null,
    });
    throw new AppError("Invalid email or password.", 401);
  }

  if (!user.isActive) {
    throw new AppError("Your account has been deactivated.", 403);
  }

  recordLoginSuccess(identifier, ip);

  const { password: _password, resetToken, resetTokenExpiry, ...safeUser } = user;

  const token = generateToken({
    userId: safeUser.id,
    organizationId: safeUser.organizationId,
    role: safeUser.role,
  });

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

  await withTenant(user.organizationId, (tx) =>
    updateResetToken(user.id, hashedToken, resetTokenExpiry, tx)
  );

  await sendPasswordResetEmail(
    { email: user.email },
    resetToken
  );

  return { success: true };
}

export async function resetPassword(resetToken, newPassword) {
  const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

  const user = await findUserByResetToken(hashedToken);

  if (!user) {
    throw new AppError("Invalid or expired reset token.", 400);
  }

  const hashedPassword = await hashPassword(newPassword);

  await withTenant(user.organizationId, (tx) =>
    updatePassword(user.id, hashedPassword, tx)
  );

  return { success: true, message: "Password reset successfully." };
}