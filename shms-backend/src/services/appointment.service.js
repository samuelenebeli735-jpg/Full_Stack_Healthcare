import prisma from "../config/db.js";
import AppError from "../utils/AppError.js";
import {
  resolveOrganizationId,
} from "../utils/tenantAccess.js";
import { auditLogger } from "../utils/auditLogger.js";
import { withTenant, withSuperAdmin, resolveUserScope } from "../utils/tenantContext.js";

import validateSchedule from "../utils/scheduleValidator.js";

import {
  getPagination,
  buildPaginationMeta,
} from "../utils/pagination.js";

import {
  findOrganizationById,
} from "../repositories/organization.repository.js";

import {
  findMedicalRecordById,
} from "../repositories/medical-record.repository.js";

import {
  findServiceById,
} from "../repositories/service.repository.js";

import {
  findSchedulesByStaff,
} from "../repositories/schedule.repository.js";

import {
  findStaffById,
} from "../repositories/staff.repository.js";

import {
  createAppointment,
  findAppointmentsByOrganization,
  findAppointmentsByStudent,
  findAppointmentsForStaffOnDate,
  findAppointmentById,
  lockStaffDay,
  updateAppointment,
  deleteAppointment,
} from "../repositories/appointment.repository.js";

const ALLOWED_TRANSITIONS = {
  scheduled: ["confirmed", "cancelled", "no_show"],
  confirmed: ["checked_in", "in_progress", "cancelled", "no_show"],
  checked_in: ["in_progress", "cancelled", "no_show", "completed"],
  in_progress: ["completed", "cancelled", "no_show"],
  completed: [],
  cancelled: [],
  no_show: [],
};

const SELF_SERVICE_STATUSES = ["scheduled", "confirmed"];

function validateAppointmentDate(date) {
  if (Number.isNaN(date.getTime())) {
    throw new AppError("Invalid appointment date.", 400);
  }
  if (date <= new Date()) {
    throw new AppError("Appointment date must be in the future.", 400);
  }
}

function validateBookingWindow(date) {
  validateAppointmentDate(date);

  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const maxDate = new Date(startOfToday);
  maxDate.setDate(maxDate.getDate() + 2);
  maxDate.setHours(23, 59, 59, 999);

  if (date > maxDate) {
    throw new AppError(
      "Appointments can only be booked up to 2 days ahead.",
      400
    );
  }
}

function assertValidTransition(from, to) {
  if (from === to) return;

  const allowed = ALLOWED_TRANSITIONS[from] || [];

  if (!allowed.includes(to)) {
    throw new AppError(
      `Appointment status cannot change from "${from}" to "${to}".`,
      400
    );
  }
}

async function validateMedicalRecord(medicalRecordId, organizationId, db = prisma) {
  const medicalRecord = await findMedicalRecordById(medicalRecordId, db);

  if (!medicalRecord) {
    throw new AppError("Medical record not found.", 404);
  }

  if (medicalRecord.profile.user.organizationId !== organizationId) {
    throw new AppError("Medical record not found.", 404);
  }

  if (medicalRecord.status === "archived") {
    throw new AppError("Medical record is archived.", 400);
  }

  return medicalRecord;
}

async function validateService(serviceId, organizationId, db = prisma) {
  const service = await findServiceById(serviceId, db);

  if (!service) {
    throw new AppError("Clinical service not found.", 404);
  }

  if (!service.isActive) {
    throw new AppError("Clinical service is inactive.", 400);
  }

  if (service.organizationId !== organizationId) {
    throw new AppError("Clinical service not found.", 404);
  }

  return service;
}

async function validateStaff(staffId, organizationId, db = prisma) {
  const staff = await findStaffById(staffId, db);

  if (!staff) {
    throw new AppError("Staff not found.", 404);
  }

  if (!staff.user.isActive) {
    throw new AppError("Staff account is inactive.", 400);
  }

  if (staff.user.organizationId !== organizationId) {
    throw new AppError("Staff not found.", 404);
  }

  return staff;
}

async function validateScheduleAndConflict(staffId, appointmentDate, organizationId, excludeAppointmentId = null, durationMinutes = 30, db = prisma) {
  const staff = await validateStaff(staffId, organizationId, db);

  await validateSchedule(staff, appointmentDate, db);

  const newStart = appointmentDate.getTime();
  const newEnd = newStart + durationMinutes * 60 * 1000;

  const conflicts = await findAppointmentsForStaffOnDate(
    staffId,
    appointmentDate,
    excludeAppointmentId,
    db
  );

  for (const appointment of conflicts) {
    const existingStart = appointment.appointmentDate.getTime();
    const existingEnd = existingStart + (appointment.service?.estimatedDuration || 30) * 60 * 1000;

    if (newStart < existingEnd && existingStart < newEnd) {
      throw new AppError("Staff already has an appointment at this time.", 409);
    }
  }
}

function resolveOrgId(user, dataOrgId) {
  return user.role === "super_admin" ? dataOrgId : user.organizationId;
}

/**
 * Create a new appointment.
 */
export async function createNewAppointment(data, user) {
  const organizationId = resolveOrgId(user, data.organizationId);

  if (!organizationId) {
    throw new AppError("Organization ID is required.", 400);
  }

  const appointmentDate = new Date(data.appointmentDate);
  if (user.role === "student") {
    validateBookingWindow(appointmentDate);
  } else {
    validateAppointmentDate(appointmentDate);
  }

  return await withTenant(organizationId, async (tx) => {
    const organization = await findOrganizationById(organizationId, tx);

    if (!organization) {
      throw new AppError("Organization not found.", 404);
    }

    const medicalRecord = await validateMedicalRecord(data.medicalRecordId, organizationId, tx);

    if (user.role === "student" && medicalRecord.profile.user.id !== user.id) {
      throw new AppError("Medical record not found.", 404);
    }

    const service = await validateService(data.serviceId, organizationId, tx);

    if (data.staffId) {
      // Serialize concurrent claims on the same staff member + day before the
      // final conflict check and insert (see lockStaffDay).
      await lockStaffDay(organizationId, data.staffId, appointmentDate, tx);
      await validateScheduleAndConflict(data.staffId, appointmentDate, organizationId, null, service.estimatedDuration, tx);
    }

    const appointment = await createAppointment({
      organizationId,
      medicalRecordId: data.medicalRecordId,
      serviceId: data.serviceId,
      staffId: data.staffId || null,
      appointmentDate,
      reason: data.reason,
    }, tx);

    await auditLogger({
      organizationId,
      userId: user.id,
      action: "CREATE",
      entity: "Appointment",
      entityId: appointment.id,
      description: `Appointment booked for ${appointmentDate.toISOString()}.`,
    });

    return appointment;
  });
}

/**
 * Get an appointment by ID within an organization scope.
 */
export async function getAppointmentById(id, organizationId, user) {
  const resolvedOrgId = resolveOrganizationId(organizationId, user);

  const runner = resolvedOrgId
    ? (callback) => withTenant(resolvedOrgId, callback)
    : withSuperAdmin;

  const appointment = await runner(async (tx) => {
    return await findAppointmentById(id, tx);
  });

  if (!appointment || appointment.organizationId !== resolvedOrgId) {
    throw new AppError("Appointment not found.", 404);
  }

  return appointment;
}

export async function updateExistingAppointment(id, data, user) {
  const scoped = resolveUserScope(user);

  const appointment = await scoped(async (tx) => {
    return await findAppointmentById(id, tx);
  });

  if (!appointment) {
    throw new AppError("Appointment not found.", 404);
  }

  const organizationId =
    user.role === "super_admin"
      ? (data.organizationId ?? appointment.organizationId)
      : user.organizationId;

  if (appointment.organizationId !== organizationId) {
    throw new AppError("Appointment not found.", 404);
  }

  if (data.status !== undefined) {
    assertValidTransition(appointment.status, data.status);
  }

  return await withTenant(organizationId, async (tx) => {
    const updateData = {};

    if (data.appointmentDate !== undefined) {
      const date = new Date(data.appointmentDate);
      validateAppointmentDate(date);
      updateData.appointmentDate = date;
    }

    if (data.serviceId !== undefined) {
      await validateService(data.serviceId, organizationId, tx);
      updateData.serviceId = data.serviceId;
    }

    if (data.staffId !== undefined) {
      if (data.staffId === null) {
        updateData.staffId = null;
      } else {
        await validateStaff(data.staffId, organizationId, tx);
        updateData.staffId = data.staffId;
      }
    }

    if (data.reason !== undefined) updateData.reason = data.reason;
    if (data.status !== undefined) updateData.status = data.status;

    const assignedStaffId =
      updateData.staffId !== undefined ? updateData.staffId : appointment.staffId;
    const assignedDate = updateData.appointmentDate ?? appointment.appointmentDate;

    const staffChanged = updateData.staffId !== undefined;
    const dateChanged = updateData.appointmentDate !== undefined;

    if (assignedStaffId && (staffChanged || dateChanged)) {
      const service = appointment.service || await validateService(appointment.serviceId, organizationId, tx);
      await lockStaffDay(organizationId, assignedStaffId, assignedDate, tx);
      await validateScheduleAndConflict(assignedStaffId, assignedDate, organizationId, id, service.estimatedDuration, tx);
    }

    const updated = await updateAppointment(id, updateData, tx);

    // Keep the linked queue in sync when an appointment is cancelled or marked no-show.
    if ((data.status === "cancelled" || data.status === "no_show") && appointment.queue) {
      await tx.queue.update({
        where: { id: appointment.queue.id },
        data: { status: "cancelled" },
      });
    }

    await auditLogger({
      organizationId,
      userId: user.id,
      action: "UPDATE",
      entity: "Appointment",
      entityId: id,
      description: `Appointment ${id} updated.`,
    });

    return updated;
  });
}

export async function removeAppointment(id, user) {
  const scoped = resolveUserScope(user);

  const appointment = await scoped(async (tx) => {
    return await findAppointmentById(id, tx);
  });

  if (!appointment) {
    throw new AppError("Appointment not found.", 404);
  }

  if (user.role !== "super_admin" && appointment.organizationId !== user.organizationId) {
    throw new AppError("Appointment not found.", 404);
  }

  try {
    await withTenant(appointment.organizationId, async (tx) => {
      await deleteAppointment(id, tx);
    });
  } catch (error) {
    if (error.code === "P2003") {
      throw new AppError(
        "Cannot delete appointment because it is referenced by other records.",
        409
      );
    }
    throw error;
  }

  await auditLogger({
    organizationId: appointment.organizationId,
    userId: user.id,
    action: "DELETE",
    entity: "Appointment",
    entityId: id,
    description: `Appointment ${id} deleted.`,
  });
}

export async function getOrganizationAppointments(
  organizationId,
  user,
  query = {}
) {
  const resolvedOrgId =
    resolveOrganizationId(
      organizationId,
      user
    );

  const runner = resolvedOrgId
    ? (callback) => withTenant(resolvedOrgId, callback)
    : withSuperAdmin;

  return await runner(async (tx) => {
    const organization =
      await findOrganizationById(
        resolvedOrgId,
        tx
      );

    if (!organization) {
      throw new AppError(
        "Organization not found.",
        404
      );
    }

    const {
      page,
      limit,
    } = getPagination(query);

    const {
      items,
      total,
    } = await findAppointmentsByOrganization(
      resolvedOrgId,
      query,
      tx
    );

    return {
      items,
      pagination: buildPaginationMeta({
        page,
        limit,
        total,
      }),
    };
  });
}

export async function getMyAppointments(user, query = {}) {
  return await withTenant(user.organizationId, async (tx) => {
    const {
      page,
      limit,
    } = getPagination(query);

    const {
      items,
      total,
    } = await findAppointmentsByStudent(
      user.id,
      query,
      tx
    );

    return {
      items,
      pagination: buildPaginationMeta({
        page,
        limit,
        total,
      }),
    };
  });
}

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/**
 * Minutes-of-day of a stored timestamp, interpreted in the runtime LOCAL
 * timezone (the clinic wall clock).
 *
 * The frontend encodes a local wall-clock slot like "2026-09-24 08:00" as
 * the instant `new Date("2026-09-24T08:00:00").toISOString()` (a `Z`-suffixed
 * UTC ISO string). Every consumer decodes that instant back to the wall
 * clock with LOCAL getters — scheduleValidator, the booking window, queue
 * day windows, and the Task 2 lock day key. Available-slot generation must
 * use the same LOCAL interpretation so its schedule minutes, busy-window
 * minutes, and slot "HH:MM" labels agree with the validation/booking paths.
 * (Using UTC getters here would shift all times by the server's UTC offset.)
 */
function minutesOfDay(date) {
  if (Number.isNaN(date.getTime())) return NaN;
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Compute the real available appointment slots for a staff member on a
 * given date. Uses the staff working schedule (active schedule for the
 * day, minus any break window) and excludes slots that overlap already
 * booked appointments that are still actionable (not cancelled/no_show).
 * "No schedule" and "not scheduled on this day" are valid outcomes and
 * are returned as an empty slot list with a human-readable message.
 */
export async function getStaffAvailableSlots(staffId, date, user, query = {}) {
  // `date` is a local calendar day ("YYYY-MM-DD", enforced by the route
  // param regex). Build LOCAL midnight and take the LOCAL weekday so the
  // day matching agrees with scheduleValidator and the frontend
  // (`new Date(date + "T00:00:00").getDay()`).
  const dayDate = new Date(date + "T00:00:00");

  if (Number.isNaN(dayDate.getTime())) {
    throw new AppError("Invalid date.", 400);
  }

  const dayOfWeek = DAY_NAMES[dayDate.getDay()];

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

    if (!staff.user.isActive) {
      throw new AppError("Staff account is inactive.", 400);
    }

    if (staff.employmentStatus !== "active") {
      throw new AppError("Selected staff is not active.", 400);
    }

    const schedules = await findSchedulesByStaff(staffId, tx);

    if (!schedules.length) {
      return {
        slots: [],
        message: "Staff has no working schedule.",
        hasSchedule: false,
      };
    }

    const schedule = schedules.find(
      (item) => item.dayOfWeek === dayOfWeek && item.isActive
    );

    if (!schedule) {
      return {
        slots: [],
        message: `Staff is not scheduled to work on ${dayOfWeek}.`,
        hasSchedule: false,
      };
    }

    let slotWidth = 30;

    if (query.serviceId) {
      const service = await findServiceById(query.serviceId, tx);

      if (
        !service ||
        !service.isActive ||
        service.organizationId !== staff.user.organizationId
      ) {
        throw new AppError("Clinical service not found.", 404);
      }

      slotWidth = service.estimatedDuration || 30;
    }

    const startMinutes = minutesOfDay(
      new Date(schedule.startTime)
    );
    const endMinutes = minutesOfDay(
      new Date(schedule.endTime)
    );

    if (
      Number.isNaN(startMinutes) ||
      Number.isNaN(endMinutes)
    ) {
      return {
        slots: [],
        message: "Invalid working hours configured for this doctor.",
        hasSchedule: false,
      };
    }

    let breakStartMinutes = null;
    let breakEndMinutes = null;

    if (schedule.breakStart && schedule.breakEnd) {
      breakStartMinutes = minutesOfDay(
        new Date(schedule.breakStart)
      );
      breakEndMinutes = minutesOfDay(
        new Date(schedule.breakEnd)
      );
    }

    const startOfDay = new Date(dayDate);
    const endOfDay = new Date(dayDate);
    endOfDay.setHours(23, 59, 59, 999);

    const existing = await tx.appointment.findMany({
      where: {
        staffId,
        appointmentDate: { gte: startOfDay, lte: endOfDay },
        status: { notIn: ["cancelled", "no_show"] },
      },
      include: {
        service: true,
      },
    });

    const busy = existing.map((appointment) => {
      const start = minutesOfDay(appointment.appointmentDate);
      return {
        start,
        end: start + (appointment.service?.estimatedDuration || 30),
      };
    });

    const slots = [];

    for (
      let minutes = startMinutes;
      minutes < endMinutes;
      minutes += 30
    ) {
      const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

      const conflicting = busy.some(
        (interval) =>
          minutes < interval.end &&
          interval.start < minutes + slotWidth
      );

      const inBreak =
        breakStartMinutes !== null && breakEndMinutes !== null
          ? minutes >= breakStartMinutes &&
            minutes < breakEndMinutes
          : false;

      slots.push({
        time,
        available: !conflicting && !inBreak,
      });
    }

    return {
      slots,
      message: null,
      hasSchedule: true,
    };
  });
}

/**
 * Cancel an appointment by the owning student.
 */
export async function cancelAppointment(id, data, user) {
  const scoped = resolveUserScope(user);

  const appointment = await scoped(async (tx) => {
    return await findAppointmentById(id, tx);
  });

  if (!appointment) {
    throw new AppError("Appointment not found.", 404);
  }

  if (
    user.role !== "super_admin" &&
    appointment.organizationId !== user.organizationId
  ) {
    throw new AppError("Appointment not found.", 404);
  }

  if (appointment.medicalRecord.profile.user.id !== user.id) {
    throw new AppError("Appointment not found.", 404);
  }

  if (!SELF_SERVICE_STATUSES.includes(appointment.status)) {
    throw new AppError(
      "Appointment cannot be cancelled in its current state.",
      400
    );
  }

  const reason = String(data.reason || "").trim();

  if (!reason) {
    throw new AppError("Cancellation reason is required.", 400);
  }

  const organizationId = appointment.organizationId;

  return await withTenant(organizationId, async (tx) => {
    const updated = await updateAppointment(
      id,
      { status: "cancelled" },
      tx
    );

    if (appointment.queue) {
      await tx.queue.update({
        where: { id: appointment.queue.id },
        data: { status: "cancelled" },
      });
    }

    await auditLogger({
      organizationId,
      userId: user.id,
      action: "CANCEL",
      entity: "Appointment",
      entityId: id,
      description: `Student cancelled appointment. Reason: ${reason}.`,
    });

    return updated;
  });
}

/**
 * Reschedule an appointment by the owning student.
 */
export async function rescheduleAppointment(id, data, user) {
  const scoped = resolveUserScope(user);

  const appointment = await scoped(async (tx) => {
    return await findAppointmentById(id, tx);
  });

  if (!appointment) {
    throw new AppError("Appointment not found.", 404);
  }

  if (
    user.role !== "super_admin" &&
    appointment.organizationId !== user.organizationId
  ) {
    throw new AppError("Appointment not found.", 404);
  }

  if (appointment.medicalRecord.profile.user.id !== user.id) {
    throw new AppError("Appointment not found.", 404);
  }

  if (!SELF_SERVICE_STATUSES.includes(appointment.status)) {
    throw new AppError(
      "Appointment cannot be rescheduled in its current state.",
      400
    );
  }

  const newDate = new Date(data.appointmentDate);
  validateBookingWindow(newDate);

  const organizationId = appointment.organizationId;

  return await withTenant(organizationId, async (tx) => {
    const service = await validateService(
      appointment.serviceId,
      organizationId,
      tx
    );

    const staffId =
      data.staffId === undefined
        ? appointment.staffId
        : data.staffId;

    if (staffId) {
      await validateStaff(staffId, organizationId, tx);
      await lockStaffDay(organizationId, staffId, newDate, tx);
      await validateScheduleAndConflict(
        staffId,
        newDate,
        organizationId,
        id,
        service.estimatedDuration,
        tx
      );
    }

    const updateData = { appointmentDate: newDate };

    if (data.staffId !== undefined) {
      updateData.staffId = data.staffId;
    }

    const updated = await updateAppointment(id, updateData, tx);

    await auditLogger({
      organizationId,
      userId: user.id,
      action: "RESCHEDULE",
      entity: "Appointment",
      entityId: id,
      description: `Student rescheduled appointment to ${newDate.toISOString()}.`,
    });

    return updated;
  });
}