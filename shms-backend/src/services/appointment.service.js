import prisma from "../config/db.js";
import AppError from "../utils/AppError.js";
import {
  resolveOrganizationId,
} from "../utils/tenantAccess.js";
import { auditLogger } from "../utils/auditLogger.js";
import { withTenant, withSuperAdmin, resolveUserScope } from "../utils/tenantContext.js";
import { NOTIFICATION_TYPES } from "../types/notificationType.js";
import { sendNotification } from "./notification.service.js";
import { formatLocalDateTime } from "../utils/dateFormat.js";
import { toPublicStaff, withPublicStaff } from "../utils/publicStaff.js";

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
  findActiveSchedulesByStaffIds,
} from "../repositories/schedule.repository.js";

import {
  findStaffById,
  findStaffByOrganization,
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

// Set only by check-in / the queue workflow, never by a direct status PATCH.
const QUEUE_DRIVEN_STATUSES = ["checked_in", "in_progress"];

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

  // Suspended, resigned or retired staff cannot take appointments, whether
  // booked through the UI or directly through the API.
  if (staff.employmentStatus !== "active") {
    throw new AppError("Selected staff is not active.", 400);
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

  let patientUserId = null;

  const appointment = await withTenant(organizationId, async (tx) => {
    const organization = await findOrganizationById(organizationId, tx);

    if (!organization) {
      throw new AppError("Organization not found.", 404);
    }

    const medicalRecord = await validateMedicalRecord(data.medicalRecordId, organizationId, tx);

    patientUserId = medicalRecord.profile.user.id;

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

  // Best-effort lifecycle notification to the patient (never blocks booking).
  if (patientUserId) {
    try {
      await sendNotification(
        patientUserId,
        "Appointment booked",
        `Your appointment has been booked for ${formatLocalDateTime(appointmentDate)}.`,
        NOTIFICATION_TYPES.APPOINTMENT
      );
    } catch (error) {
      console.error("Failed to send appointment notification:", error.message);
    }
  }

  return user.role === "student" ? withPublicStaff(appointment) : appointment;
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

  // A super_admin without an organization filter reads in the global scope;
  // everyone else must match their (resolved) organization.
  if (!appointment || (resolvedOrgId && appointment.organizationId !== resolvedOrgId)) {
    throw new AppError("Appointment not found.", 404);
  }

  return appointment;
}

export async function updateExistingAppointment(id, data, user) {
  const organizationId =
    user.role === "super_admin"
      ? (data.organizationId ?? (await resolveUserScope(user)(async (tx) => {
          const appt = await findAppointmentById(id, tx);
          return appt?.organizationId;
        })))
      : user.organizationId;

  if (!organizationId) {
    throw new AppError("Organization ID is required.", 400);
  }

  const result = await withTenant(organizationId, async (tx) => {
    const appointment = await findAppointmentById(id, tx);

    if (!appointment) {
      throw new AppError("Appointment not found.", 404);
    }

    if (appointment.organizationId !== organizationId) {
      throw new AppError("Appointment not found.", 404);
    }

    /* checked_in and in_progress are owned by the queue workflow (check-in
       creates the queue entry; starting a consultation moves it). Setting
       them directly would leave the patient with no queue entry, so a
       manual PATCH cannot use them. */
    if (data.status !== undefined && data.status !== appointment.status && QUEUE_DRIVEN_STATUSES.includes(data.status)) {
      throw new AppError(
        `Status "${data.status}" is set by the check-in/queue workflow and cannot be applied directly.`,
        400
      );
    }

    if (data.status !== undefined) {
      assertValidTransition(appointment.status, data.status);
    }

    /* Moving or reassigning is only meaningful before check-in. Once a
       patient is in the queue (or the visit is over) a new date, doctor or
       service would put the appointment out of step with its queue entry. */
    const reschedules =
      data.appointmentDate !== undefined || data.staffId !== undefined || data.serviceId !== undefined;

    if (reschedules && !SELF_SERVICE_STATUSES.includes(appointment.status)) {
      throw new AppError(
        `The date, doctor or service of a ${appointment.status} appointment cannot be changed.`,
        409
      );
    }

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

    // For status changes, use compare-and-set to prevent race conditions:
    // only update if the status hasn't changed since we validated it.
    let updated;
    if (data.status !== undefined && data.status !== appointment.status) {
      // Lock order queue -> appointment, the same order skip and
      // start-consultation use, so these transactions cannot deadlock.
      if (appointment.queue) {
        await tx.$queryRaw`SELECT id FROM "Queue" WHERE id = ${appointment.queue.id} FOR UPDATE`;
      }

      const statusUpdated = await tx.appointment.updateMany({
        where: {
          id,
          status: appointment.status,
        },
        data: { status: data.status },
      });

      if (statusUpdated.count === 0) {
        throw new AppError(
          `Appointment status changed concurrently. Expected "${appointment.status}", please retry.`,
          409
        );
      }

      // Fetch the updated appointment with relations
      updated = await findAppointmentById(id, tx);

      // Apply non-status updates if any
      const nonStatusData = { ...updateData };
      delete nonStatusData.status;
      if (Object.keys(nonStatusData).length > 0) {
        updated = await updateAppointment(id, nonStatusData, tx);
      }
    } else {
      // Compare-and-set on the status read above: a concurrent check-in or
      // status change makes this edit fail instead of overwriting it.
      const edited = await tx.appointment.updateMany({
        where: { id, status: appointment.status },
        data: updateData,
      });

      if (edited.count === 0) {
        throw new AppError(
          `Appointment status changed concurrently. Expected "${appointment.status}", please retry.`,
          409
        );
      }

      updated = await findUpdatedAppointment(id, tx);
    }

    // Keep the linked queue in sync for ALL terminal states and in_progress.
    const terminalStatuses = ["completed", "cancelled", "no_show"];
    const queueSyncStatuses = [...terminalStatuses, "in_progress"];

    if (data.status !== undefined && queueSyncStatuses.includes(data.status) && appointment.queue) {
      const queueStatusMap = {
        completed: "completed",
        cancelled: "cancelled",
        no_show: "cancelled",
        in_progress: "in_progress",
      };

      await tx.queue.update({
        where: { id: appointment.queue.id },
        data: { status: queueStatusMap[data.status] },
      });
    }

    const statusChanged = data.status !== undefined && data.status !== appointment.status;

    await auditLogger({
      organizationId,
      userId: user.id,
      action: "UPDATE",
      entity: "Appointment",
      entityId: id,
      description: statusChanged
        ? `Appointment ${id} updated (status ${appointment.status} -> ${data.status}).`
        : `Appointment ${id} updated.`,
    });

    return {
      updated,
      newStatus: statusChanged ? data.status : null,
      patientUserId: appointment.medicalRecord?.profile?.user?.id || null,
      appointmentDate: updated?.appointmentDate || appointment.appointmentDate,
    };
  });

  // Best-effort patient notifications for status changes made by the clinic.
  const message = {
    confirmed: ["Appointment confirmed", `Your appointment on ${formatLocalDateTime(result.appointmentDate)} is confirmed. You can check in on the day of your appointment.`],
    cancelled: ["Appointment cancelled", `Your appointment on ${formatLocalDateTime(result.appointmentDate)} was cancelled by the clinic.`],
    no_show: ["Missed appointment", `Your appointment on ${formatLocalDateTime(result.appointmentDate)} was marked as missed.`],
  }[result.newStatus];

  if (message && result.patientUserId) {
    try {
      await sendNotification(result.patientUserId, message[0], message[1], NOTIFICATION_TYPES.APPOINTMENT);
    } catch (error) {
      console.error("Failed to send appointment status notification:", error.message);
    }
  }

  return result.updated;
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
      items: items.map((appointment) => withPublicStaff(appointment)),
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
 * Generate the 30-minute slot grid for one schedule on one calendar day,
 * marking slots that overlap booked appointments or a break as unavailable.
 * Returns `valid: false` when the configured working hours cannot be read.
 *
 * Handles both same-day schedules (e.g., 08:00–16:00) and midnight-crossing
 * schedules (e.g., 16:00–00:00) by detecting when endMinutes <= startMinutes
 * and treating the end as 24:00 (1440 minutes) on the same logical day.
 */
function buildDaySlots(schedule, dayDate, busy, slotWidth) {
  const startMinutes = minutesOfDay(new Date(schedule.startTime));
  let endMinutes = minutesOfDay(new Date(schedule.endTime));

  if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes)) {
    return { slots: [], valid: false };
  }

  // Handle midnight-crossing shifts (e.g., 16:00–00:00).
  // In the stored data, such schedules have endTime on the previous calendar day
  // (e.g., 23:00 UTC = 00:00 local), so endMinutes < startMinutes.
  // We treat the logical end as 24:00 (1440 minutes) on the same day.
  const crossesMidnight = endMinutes <= startMinutes;
  if (crossesMidnight) {
    endMinutes = 1440; // 24:00 = 1440 minutes
  }

  let breakStartMinutes = null;
  let breakEndMinutes = null;

  if (schedule.breakStart && schedule.breakEnd) {
    breakStartMinutes = minutesOfDay(new Date(schedule.breakStart));
    breakEndMinutes = minutesOfDay(new Date(schedule.breakEnd));

    // If the schedule crosses midnight and the break is on the next calendar day
    // (break start < schedule start), the break times are stored with the same
    // date as schedule.startTime (the logical day). Since we shifted endMinutes
    // to 1440, break minutes are already correct as long as break is on the
    // same logical day. If breakStart < startMinutes (break on next calendar day),
    // it would be stored with schedule.startTime's date, which is correct.
  }

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

  return { slots, valid: true };
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

    const { slots, valid } = buildDaySlots(
      schedule,
      dayDate,
      busy,
      slotWidth
    );

    if (!valid) {
      return {
        slots: [],
        message: "Invalid working hours configured for this doctor.",
        hasSchedule: false,
      };
    }

    return {
      slots,
      message: null,
      hasSchedule: true,
    };
  });
}

/**
 * Resolve which doctors can take an appointment on a given date, for the
 * "No preference" booking path. A doctor is eligible when they have an
 * active working schedule for the requested day and belong to the same
 * organization as the requester. Each eligible doctor carries
 * `hasAvailableSlots`, which is false when every generated slot for that
 * day overlaps an existing appointment or the configured break, so the
 * list is never reduced to "the first row found".
 */
export async function getDoctorsAvailableOnDate(date, user, query = {}) {
  const dayDate = new Date(date + "T00:00:00");

  if (Number.isNaN(dayDate.getTime())) {
    throw new AppError("Invalid date.", 400);
  }

  const dayOfWeek = DAY_NAMES[dayDate.getDay()];

  const scoped = resolveUserScope(user);

  return await scoped(async (tx) => {
    const orgFilter =
      user.role === "super_admin" ? null : user.organizationId;

    // Every active staff member, not just the first page of 100.
    const items = [];
    for (let page = 1; page <= 1000; page++) {
      const batch = await findStaffByOrganization(
        orgFilter,
        { employmentStatus: "active", limit: 100, page },
        tx
      );
      items.push(...batch.items);
      if (!batch.items.length || items.length >= batch.total) break;
    }

    const activeStaff = items.filter(
      (staff) => staff.user?.isActive !== false
    );

    if (!activeStaff.length) {
      return {
        doctors: [],
        message: "No active doctors available.",
      };
    }

    const staffIds = activeStaff.map((staff) => staff.id);

    const schedules = await findActiveSchedulesByStaffIds(staffIds, tx);

    if (!schedules.length) {
      return {
        doctors: [],
        message: "No doctors have a working schedule.",
      };
    }

    const schedulesOnDay = schedules.filter(
      (item) => item.dayOfWeek === dayOfWeek
    );

    if (!schedulesOnDay.length) {
      return {
        doctors: [],
        message: `No doctors are scheduled to work on ${dayOfWeek}.`,
      };
    }

    let slotWidth = 30;

    if (query.serviceId) {
      const service = await findServiceById(query.serviceId, tx);

      if (
        !service ||
        !service.isActive ||
        service.organizationId !== user.organizationId
      ) {
        throw new AppError("Clinical service not found.", 404);
      }

      slotWidth = service.estimatedDuration || 30;
    }

    const startOfDay = new Date(dayDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(dayDate);
    endOfDay.setHours(23, 59, 59, 999);

    const existing = await tx.appointment.findMany({
      where: {
        staffId: { in: staffIds },
        appointmentDate: { gte: startOfDay, lte: endOfDay },
        status: { notIn: ["cancelled", "no_show"] },
      },
      include: {
        service: true,
      },
    });

    const busyByStaff = {};

    existing.forEach((appointment) => {
      const start = minutesOfDay(appointment.appointmentDate);
      (busyByStaff[appointment.staffId] ||= []).push({
        start,
        end: start + (appointment.service?.estimatedDuration || 30),
      });
    });

    // For today, slots that have already started cannot be booked, so they
    // must not make a doctor look available ("No preference" picks the first).
    const now = new Date();
    const isToday = dayDate.toDateString() === now.toDateString();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const slotMinutes = (time) => {
      const [h, m] = String(time).split(":").map(Number);
      return h * 60 + m;
    };

    const doctors = [];

    activeStaff.forEach((staff) => {
      const schedule = schedulesOnDay.find(
        (item) => item.staffId === staff.id
      );

      if (!schedule) return;

      const { slots, valid } = buildDaySlots(
        schedule,
        dayDate,
        busyByStaff[staff.id] || [],
        slotWidth
      );

      if (!valid) return;

      const availableSlots = slots.filter(
        (slot) => slot.available && (!isToday || slotMinutes(slot.time) > nowMinutes)
      );

      doctors.push({
        ...(user.role === "student" ? toPublicStaff(staff) : staff),
        hasAvailableSlots: availableSlots.length > 0,
        availableSlotCount: availableSlots.length,
      });
    });

    doctors.sort(
      (a, b) =>
        Number(b.hasAvailableSlots) - Number(a.hasAvailableSlots) ||
        (a.lastName || "").localeCompare(b.lastName || "")
    );

    return { doctors, message: null };
  });
}

/**
 * Cancel an appointment by the owning student.
 */
// Same shape updateAppointment() returns, read after a compare-and-set write.
async function findUpdatedAppointment(id, tx) {
  return await tx.appointment.findUnique({
    where: { id },
    include: { medicalRecord: true, service: true, staff: true },
  });
}

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

  const updated = await withTenant(organizationId, async (tx) => {
    /* Compare-and-set: the status check above ran outside this transaction,
       so a concurrent check-in or status change could have moved the
       appointment since. Only cancel if it is still self-service. */
    const moved = await tx.appointment.updateMany({
      where: { id, status: { in: SELF_SERVICE_STATUSES } },
      data: { status: "cancelled" },
    });

    if (moved.count === 0) {
      throw new AppError(
        "Appointment cannot be cancelled: its status changed. Refresh and try again.",
        409
      );
    }

    const queue = await tx.queue.findUnique({ where: { appointmentId: id } });

    if (queue && queue.status !== "cancelled") {
      await tx.queue.update({
        where: { id: queue.id },
        data: { status: "cancelled" },
      });
    }

    const updated = await findUpdatedAppointment(id, tx);

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

  // Best-effort lifecycle notification to the patient (never blocks cancellation).
  const patientUserId = appointment.medicalRecord.profile.user.id;

  if (patientUserId) {
    try {
      await sendNotification(
        patientUserId,
        "Appointment cancelled",
        "Your appointment has been cancelled.",
        NOTIFICATION_TYPES.APPOINTMENT
      );
    } catch (error) {
      console.error("Failed to send appointment cancellation notification:", error.message);
    }
  }

  return withPublicStaff(updated);
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

  const updated = await withTenant(organizationId, async (tx) => {
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

    // Compare-and-set, as in cancelAppointment.
    const moved = await tx.appointment.updateMany({
      where: { id, status: { in: SELF_SERVICE_STATUSES } },
      data: updateData,
    });

    if (moved.count === 0) {
      throw new AppError(
        "Appointment cannot be rescheduled: its status changed. Refresh and try again.",
        409
      );
    }

    const updated = await findUpdatedAppointment(id, tx);

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

  // Best-effort lifecycle notification to the patient (never blocks rescheduling).
  const patientUserId = appointment.medicalRecord.profile.user.id;

  if (patientUserId) {
    try {
      await sendNotification(
        patientUserId,
        "Appointment rescheduled",
        `Your appointment has been rescheduled to ${formatLocalDateTime(newDate)}.`,
        NOTIFICATION_TYPES.APPOINTMENT
      );
    } catch (error) {
      console.error("Failed to send appointment reschedule notification:", error.message);
    }
  }

  return withPublicStaff(updated);
}