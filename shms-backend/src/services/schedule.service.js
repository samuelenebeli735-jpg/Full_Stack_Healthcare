import AppError from "../utils/AppError.js";
import { auditLogger } from "../utils/auditLogger.js";
import { resolveOrganizationId } from "../utils/tenantAccess.js";
import { withTenant, withSuperAdmin, resolveUserScope } from "../utils/tenantContext.js";

import {
  findScheduleById,
  findScheduleByStaffAndDay,
  findSchedulesByStaff,
  findSchedulesByDay,
  findSchedulesByOrganization,
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from "../repositories/schedule.repository.js";

import { findOrganizationById } from "../repositories/organization.repository.js";
import { findStaffById } from "../repositories/staff.repository.js";

/**
 * Create schedule.
 */
export async function createStaffSchedule(data, user) {
  const organizationId =
    user.role === "super_admin"
      ? data.organizationId
      : user.organizationId;

  const organization = await findOrganizationById(organizationId);

  if (!organization) {
    throw new AppError("Organization not found.", 404);
  }

  const schedule = await withTenant(organizationId, async (tx) => {
    const staff = await findStaffById(data.staffId, tx);

    if (!staff) {
      throw new AppError("Staff not found.", 404);
    }

    if (staff.user.organizationId !== organizationId) {
      throw new AppError("Staff not found.", 404);
    }

    const existingSchedule = await findScheduleByStaffAndDay(
      data.staffId,
      data.dayOfWeek,
      tx
    );

    if (existingSchedule) {
      throw new AppError(
        "Schedule already exists for this day.",
        409
      );
    }

    if (new Date(data.startTime) >= new Date(data.endTime)) {
      throw new AppError(
        "Start time must be before end time.",
        400
      );
    }

    if (data.breakStart && data.breakEnd) {
      const startTime = new Date(data.startTime);
      const endTime = new Date(data.endTime);

      const breakStart = new Date(data.breakStart);
      const breakEnd = new Date(data.breakEnd);

      if (breakStart >= breakEnd) {
        throw new AppError(
          "Break start must be before break end.",
          400
        );
      }

      if (breakStart < startTime) {
        throw new AppError(
          "Break cannot start before working hours.",
          400
        );
      }

      if (breakEnd > endTime) {
        throw new AppError(
          "Break cannot end after working hours.",
          400
        );
      }
    }

    return await createSchedule({ ...data, organizationId }, tx);
  });

  await auditLogger({
    organizationId,
    userId: user.id,
    action: "CREATE",
    entity: "Schedule",
    entityId: schedule.id,
    description: `Created schedule for staff on ${data.dayOfWeek}.`,
  });

  return schedule;
}

/**
 * Get schedule by ID.
 */
export async function getScheduleById(id, user) {
  const scoped = resolveUserScope(user);

  const schedule = await scoped(async (tx) => {
    return await findScheduleById(id, tx);
  });

  if (!schedule) {
    throw new AppError("Schedule not found.", 404);
  }

  if (
    user.role !== "super_admin" &&
    schedule.organizationId !== user.organizationId
  ) {
    throw new AppError("Schedule not found.", 404);
  }

  return schedule;
}

/**
 * Get schedules for a staff member.
 */
export async function getStaffSchedules(staffId, user) {
  const scoped = resolveUserScope(user);

  return await scoped(async (tx) => {
    const staff = await findStaffById(staffId, tx);

    if (!staff) {
      throw new AppError("Staff not found.", 404);
    }

    if (
      user.role !== "super_admin" &&
      staff.user.organizationId !== user.organizationId
    ) {
      throw new AppError("Staff not found.", 404);
    }

    return await findSchedulesByStaff(staffId, tx);
  });
}

/**
 * Get schedules by day.
 */
export async function getSchedulesByDay(organizationId, dayOfWeek, user) {
  const resolvedOrgId = resolveOrganizationId(organizationId, user);

  const runner = resolvedOrgId
    ? (callback) => withTenant(resolvedOrgId, callback)
    : withSuperAdmin;

  return await runner(async (tx) => {
    return await findSchedulesByDay(resolvedOrgId, dayOfWeek, tx);
  });
}

/**
 * Get all schedules for an organization (admin view).
 */
export async function getOrganizationSchedules(organizationId, user) {
  const resolvedOrgId = resolveOrganizationId(organizationId, user);

  const runner = resolvedOrgId
    ? (callback) => withTenant(resolvedOrgId, callback)
    : withSuperAdmin;

  return await runner(async (tx) => {
    return await findSchedulesByOrganization(resolvedOrgId, tx);
  });
}

/**
 * Update schedule.
 */
export async function updateStaffSchedule(id, data, user) {
  const scoped = resolveUserScope(user);

  const schedule = await scoped(async (tx) => {
    return await findScheduleById(id, tx);
  });

  if (!schedule) {
    throw new AppError("Schedule not found.", 404);
  }

  if (
    user.role !== "super_admin" &&
    schedule.organizationId !== user.organizationId
  ) {
    throw new AppError("Schedule not found.", 404);
  }

  if (
    data.startTime &&
    data.endTime &&
    new Date(data.startTime) >= new Date(data.endTime)
  ) {
    throw new AppError(
      "Start time must be before end time.",
      400
    );
  }

  const nextStart = data.startTime !== undefined ? new Date(data.startTime) : null;
  const nextEnd = data.endTime !== undefined ? new Date(data.endTime) : null;
  const nextBreakStart = data.breakStart !== undefined ? new Date(data.breakStart) : null;
  const nextBreakEnd = data.breakEnd !== undefined ? new Date(data.breakEnd) : null;

  if (nextBreakStart && nextBreakEnd) {
    if (nextBreakStart >= nextBreakEnd) {
      throw new AppError(
        "Break start must be before break end.",
        400
      );
    }

    if (nextStart && nextBreakStart < nextStart) {
      throw new AppError(
        "Break cannot start before working hours.",
        400
      );
    }

    if (nextEnd && nextBreakEnd > nextEnd) {
      throw new AppError(
        "Break cannot end after working hours.",
        400
      );
    }
  }

  const updated = await withTenant(schedule.organizationId, async (tx) => {
    if (data.dayOfWeek !== undefined && data.dayOfWeek !== schedule.dayOfWeek) {
      const existingSchedule = await findScheduleByStaffAndDay(
        schedule.staffId,
        data.dayOfWeek,
        tx
      );

      if (existingSchedule) {
        throw new AppError(
          "Schedule already exists for this day.",
          409
        );
      }
    }

    const updateData = {};

    if (data.dayOfWeek !== undefined) updateData.dayOfWeek = data.dayOfWeek;
    if (data.startTime !== undefined) updateData.startTime = data.startTime;
    if (data.endTime !== undefined) updateData.endTime = data.endTime;
    if (data.breakStart !== undefined) updateData.breakStart = data.breakStart;
    if (data.breakEnd !== undefined) updateData.breakEnd = data.breakEnd;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    return await updateSchedule(id, updateData, tx);
  });

  await auditLogger({
    organizationId: schedule.organizationId,
    userId: user.id,
    action: "UPDATE",
    entity: "Schedule",
    entityId: id,
    description: `Updated schedule ${id}.`,
  });

  return updated;
}

/**
 * Delete schedule.
 */
export async function removeSchedule(id, user) {
  const scoped = resolveUserScope(user);

  const schedule = await scoped(async (tx) => {
    return await findScheduleById(id, tx);
  });

  if (!schedule) {
    throw new AppError("Schedule not found.", 404);
  }

  if (
    user.role !== "super_admin" &&
    schedule.organizationId !== user.organizationId
  ) {
    throw new AppError("Schedule not found.", 404);
  }

  try {
    await withTenant(schedule.organizationId, async (tx) => {
      await deleteSchedule(id, tx);
    });
  } catch (error) {
    if (error.code === "P2003") {
      throw new AppError(
        "Cannot delete schedule because it is referenced by other records.",
        409
      );
    }
    throw error;
  }

  await auditLogger({
    organizationId: schedule.organizationId,
    userId: user.id,
    action: "DELETE",
    entity: "Schedule",
    entityId: id,
    description: `Deleted schedule ${id}.`,
  });
}