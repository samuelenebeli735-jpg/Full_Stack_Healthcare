import AppError from "../utils/AppError.js";
import { auditLogger } from "../utils/auditLogger.js";
import { withTenant } from "../utils/tenantContext.js";

import {
  findOrganizationById,
} from "../repositories/organization.repository.js";

import {
  findAuthUserByIdentifier,
  findUserByEmail,
  createUser,
  updateResetToken,
  findUserByResetToken,
  updatePassword,
  findUserWithProfileById,
} from "../repositories/user.repository.js";

import {
  createProfile,
} from "../repositories/profile.repository.js";

import {
  hashPassword,
  comparePassword,
} from "../utils/password.js";

import generateToken from "../utils/generateToken.js";
import { isEmailDeliveryConfigured, sendPasswordResetEmail } from "../utils/email.js";
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

  // Pre-auth global uniqueness checks (SECURITY DEFINER) so a duplicate is a
  // 409 before any tenant-scoped write is attempted.
  const existingUser = await findUserByEmail(data.email);

  if (existingUser) {
  throw new AppError("Email already exists.", 409);
}

  const existingProfileUser = await findAuthUserByIdentifier(
    String(data.matricNumber ?? "").trim()
  );

  if (existingProfileUser?.matricNumber) {
    throw new AppError("Matric number already exists.", 409);
  }

  const hashedPassword = await hashPassword(data.password);

  // Registration is a pre-auth flow: the target organization comes from the
  // request, and the whole write runs with that tenant context.
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
 */
export async function loginStudent(data) {
  const identifier = String(data.identifier ?? "").trim();
  const password = String(data.password ?? "");

  if (!identifier || !password) {
    throw new AppError("Email or password is required.", 401);
  }

  // Pre-auth identity resolution (SECURITY DEFINER) across all organizations.
  const user = await findAuthUserByIdentifier(identifier);

  if (!user) {
    throw new AppError("Invalid email or password.", 401);
  }

  const passwordMatches = await comparePassword(password, user.password);

  if (!passwordMatches) {
    /* The account is known here, so the event can be attributed to the user's
       organization. An unknown identifier cannot be audited at all: the audit
       table requires an organizationId and there is no tenant to resolve. */
    await auditLogger({
      organizationId: user.organizationId,
      userId: user.id,
      action: "LOGIN_FAILED",
      entity: "User",
      entityId: user.id,
      description: `Failed sign-in attempt for ${user.email}.`,
    });

    throw new AppError("Invalid email or password.", 401);
  }

  if (!user.isActive) {
    /* Retrying a deactivated account is an intrusion signal in its own right,
       and the account is known here, so it is attributed to the user's
       organization exactly like a wrong-password attempt. */
    await auditLogger({
      organizationId: user.organizationId,
      userId: user.id,
      action: "LOGIN_FAILED",
      entity: "User",
      entityId: user.id,
      description: `Failed sign-in attempt for deactivated account ${user.email}.`,
    });

    throw new AppError("Your account has been deactivated.", 403);
  }

  const token = generateToken({
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role,
  });

  // Preserve the historic login response shape (user + profile + organization).
  const fullUser = (await findUserWithProfileById(user.id)) || null;

  await auditLogger({
    organizationId: user.organizationId,
    userId: user.id,
    action: "LOGIN",
    entity: "User",
    entityId: user.id,
    description: `${user.email} logged in.`,
  });

  return {
    user: fullUser,
    token,
  };
}

export async function forgotPassword(email) {
  // Without an email provider the reset link could never arrive. Say so
  // instead of claiming a link was sent. The answer is the same for every
  // address, so it does not reveal which accounts exist.
  if (!isEmailDeliveryConfigured()) {
    throw new AppError(
      "Password reset by email is not available on this server yet. Please contact your clinic administrator.",
      503
    );
  }

  // Pre-auth global lookup so the reset token can be written even though the
  // tenant context is unknown at this point.
  const user = await findUserByEmail(email);

  if (!user) {
    return { success: true };
  }

  const resetToken = crypto.randomBytes(32).toString("hex");

  const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

  const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);

  await withTenant(user.organizationId, async (tx) => {
    await updateResetToken(user.id, hashedToken, resetTokenExpiry, tx);
  });

  await auditLogger({
    organizationId: user.organizationId,
    userId: user.id,
    action: "PASSWORD_RESET_REQUEST",
    entity: "User",
    entityId: user.id,
    description: `Password reset requested for ${user.email}.`,
  });

  await sendPasswordResetEmail(user, resetToken);

  return { success: true };
}

export async function resetPassword(resetToken, newPassword) {
  const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

  // Pre-auth global lookup by unexpired reset token.
  const user = await findUserByResetToken(hashedToken);

  if (!user) {
    throw new AppError("Invalid or expired reset token.", 400);
  }

  const hashedPassword = await hashPassword(newPassword);

  await withTenant(user.organizationId, async (tx) => {
    await updatePassword(user.id, hashedPassword, tx);
  });

  await auditLogger({
    organizationId: user.organizationId,
    userId: user.id,
    action: "PASSWORD_RESET",
    entity: "User",
    entityId: user.id,
    description: `Password reset completed for ${user.email}.`,
  });

  return { success: true, message: "Password reset successfully." };
}