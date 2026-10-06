import AppError from "../utils/AppError.js";
import { resolveOrganizationId } from "../utils/tenantAccess.js";
import { auditLogger } from "../utils/auditLogger.js";
import { withTenant, withSuperAdmin, resolveUserScope } from "../utils/tenantContext.js";
import { NOTIFICATION_TYPES } from "../types/notificationType.js";
import { sendNotification } from "./notification.service.js";
import {
  getPagination,
  buildPaginationMeta,
} from "../utils/pagination.js";

import {
  findQueueById,
  findQueueByAppointmentId,
  findTodayQueue,
  findLastQueueByDate,
  findQueueByUserIdAndDate,
  createQueue,
  updateQueue,
} from "../repositories/queue.repository.js";

import {
  findAppointmentById,
  updateAppointment,
} from "../repositories/appointment.repository.js";

import calculateQueueEstimate from "../utils/calculateQueueEstimate.js";
import { withPublicStaff } from "../utils/publicStaff.js";

/**
 * Deterministic 32-bit FNV-1a hash. Stable across processes, so every
 * request derives the same advisory-lock key for the same
 * (organizationId, queueDate) pair.
 */
function fnv1a32(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}

/**
 * Serialize queue-number allocation for one organization on one queue date.
 *
 * Allocations use a read-then-insert (last queueNumber + 1); to make that
 * race-safe the whole allocation runs inside a transaction-scoped advisory
 * lock keyed by (organizationId, queueDate). Only check-ins for the same
 * organization on the same queue date contend; other organizations, other
 * dates and unrelated queue activity are never blocked. The lock is acquired
 * on and released with the check-in transaction (pg_advisory_xact_lock).
 */
async function lockQueueDate(tx, organizationId, queueDate) {
  await tx.$executeRawUnsafe(
    "SELECT pg_catalog.pg_advisory_xact_lock($1::int, $2::int)",
    fnv1a32(organizationId),
    fnv1a32(queueDate)
  );
}

function getTodayRange() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  return { startOfDay, endOfDay };
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function runnable(orgId) {
  return orgId
    ? (callback) => withTenant(orgId, callback)
    : withSuperAdmin;
}

export async function checkInPatient(data, user) {
  const scoped = resolveUserScope(user);

  const appointment = await scoped(async (tx) => {
    return await findAppointmentById(data.appointmentId, tx);
  });

  if (!appointment) {
    throw new AppError("Appointment not found.", 404);
  }

  if (
    user.role !== "super_admin" &&
    appointment.organizationId !== user.organizationId
  ) {
    throw new AppError(
      "Appointment not found.",
      404
    );
  }

  if (
    user.role === "student" &&
    appointment.medicalRecord.profile.user.id !== user.id
  ) {
    throw new AppError(
      "Appointment not found.",
      404
    );
  }

  const today = new Date();
  const appointmentDate = new Date(appointment.appointmentDate);

  if (
    today.getFullYear() !== appointmentDate.getFullYear() ||
    today.getMonth() !== appointmentDate.getMonth() ||
    today.getDate() !== appointmentDate.getDate()
  ) {
    throw new AppError(
      "You can only check in on your appointment date.",
      400
    );
  }

  const queueDate = getLocalDateString();

  const organizationId = appointment.organizationId;

  const existingQueue = await withTenant(organizationId, async (tx) => {
    return await findQueueByAppointmentId(data.appointmentId, tx);
  });

  if (existingQueue) {
    throw new AppError("Patient has already checked in.", 409);
  }

  const validPreCheckInStatuses = ["confirmed"];

  if (!validPreCheckInStatuses.includes(appointment.status)) {
    throw new AppError(
      `Cannot check in: appointment is in "${appointment.status}" state. Only "confirmed" appointments can be checked in.`,
      400
    );
  }

  let result;

  // Allocate the queue number inside a per-(organizationId, queueDate)
  // transaction-scoped advisory lock so concurrent check-ins receive
  // distinct numbers deterministically. The (organizationId, queueDate,
  // queueNumber) and appointmentId unique constraints remain as final
  // guards; a stale retry is absorbed by re-running the allocation.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      result = await withTenant(organizationId, async (tx) => {
        await lockQueueDate(tx, organizationId, queueDate);

        const lastQueue = await findLastQueueByDate(
          organizationId,
          queueDate,
          tx
        );

        const queueNumber = lastQueue ? lastQueue.queueNumber + 1 : 1;

        const estimatedWaitMinutes = calculateQueueEstimate(
          queueNumber - 1,
          appointment.service.estimatedDuration
        );

        const queue = await createQueue(
          {
            organizationId,
            appointmentId: appointment.id,
            queueNumber,
            queueDate,
            estimatedWaitMinutes,
          },
          tx
        );

        /* Compare-and-set: only a still-confirmed appointment, still at the
           date validated above as today, becomes checked_in. If a concurrent
           cancel/reschedule changed it after the pre-check, the queue row
           created here is rolled back with this transaction instead of
           leaving a live queue entry for a cancelled or moved appointment. */
        const moved = await tx.appointment.updateMany({
          where: {
            id: appointment.id,
            status: "confirmed",
            appointmentDate: appointment.appointmentDate,
          },
          data: { status: "checked_in" },
        });

        if (moved.count === 0) {
          throw new AppError("Cannot check in: the appointment was changed or cancelled. Refresh and try again.", 409);
        }

        return queue;
      });
      break;
    } catch (error) {
      if (error.code === "P2002") {
        // Two concurrent check-ins raced for the same appointment: only one
        // can hold the 1:1 (appointmentId) queue row. Re-check and report
        // the controlled conflict instead of surfacing the constraint error.
        const already = await withTenant(organizationId, async (tx) => {
          return await findQueueByAppointmentId(data.appointmentId, tx);
        });

        if (already) {
          throw new AppError("Patient has already checked in.", 409);
        }

        if (attempt < 4) {
          continue;
        }
      }
      throw error;
    }
  }

  await auditLogger({
    organizationId,
    userId: user.id,
    action: "CHECKIN",
    entity: "Queue",
    entityId: result.id,
    description: `Patient checked in with queue number ${result.queueNumber}.`,
  });

  // Check-in is student-only (queue.route.js:29-35); createQueue embeds the
  // full staff row + login email, so return the public projection.
  return result && result.appointment
    ? { ...result, appointment: withPublicStaff(result.appointment) }
    : result;
}

export async function getTodayQueue(organizationId, user, query = {}) {
  const resolvedOrgId = resolveOrganizationId(organizationId, user);

  const { startOfDay, endOfDay } = getTodayRange();
  const { page, limit, skip } = getPagination(query);

  const { items, total } = await runnable(resolvedOrgId)(async (tx) => {
    return await findTodayQueue(
      resolvedOrgId,
      startOfDay,
      endOfDay,
      { skip, limit },
      tx
    );
  });

  return { items, pagination: buildPaginationMeta({ page, limit, total }) };
}

export async function getMyQueue(user) {
  const queueDate = getLocalDateString();
  const { startOfDay, endOfDay } = getTodayRange();

  return await withTenant(user.organizationId, async (tx) => {
    const queue = await findQueueByUserIdAndDate(user.id, queueDate, tx);

    if (!queue) {
      return null;
    }

    // Counted directly instead of scanning a capped page of the day's tickets.
    const today = {
      organizationId: queue.organizationId,
      createdAt: { gte: startOfDay, lte: endOfDay },
    };
    const OPEN = ["waiting", "called", "in_progress"];

    const patientsAhead = queue.status === "waiting"
      ? await tx.queue.count({
          where: { ...today, status: { in: OPEN }, queueNumber: { lt: queue.queueNumber } },
        })
      : 0;

    const pick = { queueNumber: true, status: true };
    const currentServing =
      (await tx.queue.findFirst({
        where: { ...today, status: { in: ["in_progress", "called"] } },
        orderBy: { queueNumber: "asc" },
        select: pick,
      })) ||
      (await tx.queue.findFirst({
        where: { ...today, status: "waiting" },
        orderBy: { queueNumber: "asc" },
        select: pick,
      }));

    // Live estimate from the patients still ahead; the value stored at
    // check-in also counted tickets that have since been served.
    const duration = queue.appointment?.service?.estimatedDuration;
    const estimatedWaitMinutes = queue.status !== "waiting"
      ? 0
      : Number.isFinite(duration)
        ? patientsAhead * duration
        : queue.estimatedWaitMinutes;

    return {
      id: queue.id,
      queueNumber: queue.queueNumber,
      status: queue.status,
      estimatedWaitMinutes,
      appointmentId: queue.appointmentId,
      appointmentStatus: queue.appointment?.status || null,
      patientsAhead,
      currentServing: currentServing
        ? {
            queueNumber: currentServing.queueNumber,
            status: currentServing.status,
          }
        : null,
    };
  });
}

export async function getQueueById(id, user) {
  const scoped = resolveUserScope(user);

  const queue = await scoped(async (tx) => {
    return await findQueueById(id, tx);
  });

  if (!queue) {
    throw new AppError("Queue entry not found.", 404);
  }

  if (
    user.role !== "super_admin" &&
    queue.organizationId !== user.organizationId
  ) {
    throw new AppError(
      "Queue entry not found.",
      404
    );
  }

  return queue;
}

export async function callNextPatient(organizationId, user) {
  const resolvedOrgId = resolveOrganizationId(organizationId, user);

  const { startOfDay, endOfDay } = getTodayRange();

  const updatedQueue = await runnable(resolvedOrgId)(async (tx) => {
    const today = {
      organizationId: resolvedOrgId,
      createdAt: { gte: startOfDay, lte: endOfDay },
    };

    // Claim the lowest waiting ticket. If a concurrent call claimed it
    // first, move on to the next one rather than reporting an empty queue.
    for (let attempt = 0; attempt < 20; attempt++) {
      const next = await tx.queue.findFirst({
        where: { ...today, status: "waiting" },
        orderBy: { queueNumber: "asc" },
        select: { id: true },
      });

      if (!next) {
        throw new AppError(
          "There are no patients waiting in the queue.",
          404
        );
      }

      const calledAt = new Date();
      const claimed = await tx.queue.updateMany({
        where: { id: next.id, status: "waiting" },
        data: { status: "called", calledAt },
      });

      if (claimed.count === 1) {
        return await updateQueue(next.id, { status: "called", calledAt }, tx);
      }
    }

    throw new AppError("The queue is busy. Please try again.", 409);
  });

  // Audit after commit, so it never needs a second connection while this
  // transaction holds one and never records a call that rolled back.
  await auditLogger({
    organizationId: resolvedOrgId,
    userId: user.id,
    action: "CALL",
    entity: "Queue",
    entityId: updatedQueue.id,
    description: `Called queue number ${updatedQueue.queueNumber}.`,
  });

  // Best-effort lifecycle notification to the patient (never blocks the queue call).
  const patientUserId =
    updatedQueue?.appointment?.medicalRecord?.profile?.userId || null;

  if (patientUserId) {
    try {
      await sendNotification(
        patientUserId,
        "Queue called",
        `Queue number ${updatedQueue.queueNumber} has been called. Please proceed to the consultation room.`,
        NOTIFICATION_TYPES.QUEUE
      );
    } catch (error) {
      console.error("Failed to send queue notification:", error.message);
    }
  }

  return updatedQueue;
}

/**
 * Skip (cancel) a called ticket. With `queueId` only that ticket is skipped,
 * so a stale screen cannot cancel a different patient who was called in the
 * meantime; without it, the lowest called ticket of the day is skipped.
 */
export async function skipPatient(organizationId, user, queueId = null) {
  const resolvedOrgId = resolveOrganizationId(organizationId, user);

  const { startOfDay, endOfDay } = getTodayRange();

  const result = await runnable(resolvedOrgId)(async (tx) => {
    const currentPatient = await tx.queue.findFirst({
      where: queueId
        ? { id: queueId, organizationId: resolvedOrgId, status: "called" }
        : {
            organizationId: resolvedOrgId,
            createdAt: { gte: startOfDay, lte: endOfDay },
            status: "called",
          },
      orderBy: { queueNumber: "asc" },
      include: {
        appointment: {
          include: { medicalRecord: { include: { profile: true } } },
        },
      },
    });

    if (!currentPatient) {
      throw new AppError(
        queueId
          ? "That ticket is no longer called (it may have been started, skipped or completed)."
          : "There is no patient currently called to skip.",
        queueId ? 409 : 404
      );
    }

    const skipped = await tx.queue.updateMany({
      where: { id: currentPatient.id, status: "called" },
      data: { status: "cancelled", completedAt: new Date() },
    });

    if (skipped.count === 0) {
      throw new AppError(
        "That ticket is no longer called (it may have been started, skipped or completed).",
        409
      );
    }

    const updated = await updateQueue(currentPatient.id, {
      status: "cancelled",
      completedAt: new Date(),
    }, tx);

    await updateAppointment(
      currentPatient.appointmentId,
      { status: "cancelled" },
      tx
    );

    return {
      updated,
      queueId: currentPatient.id,
      patientUserId: currentPatient.appointment?.medicalRecord?.profile?.userId || null,
      queueNumber: currentPatient.queueNumber,
    };
  });

  await auditLogger({
    organizationId: resolvedOrgId,
    userId: user.id,
    action: "SKIP",
    entity: "Queue",
    entityId: result.queueId,
    description: `Skipped queue number ${result.queueNumber}.`,
  });

  // Best-effort notification: the skipped patient's appointment was cancelled.
  if (result.patientUserId) {
    try {
      await sendNotification(
        result.patientUserId,
        "Missed queue call",
        `Queue number ${result.queueNumber} was called but not answered, so the appointment was cancelled. Please book a new appointment if you still need to be seen.`,
        NOTIFICATION_TYPES.QUEUE
      );
    } catch (error) {
      console.error("Failed to send queue skip notification:", error.message);
    }
  }

  return result.updated;
}

export async function startConsultation(queueId, user) {
  const scoped = resolveUserScope(user);

  const queue = await scoped(async (tx) => {
    return await findQueueById(queueId, tx);
  });

  if (!queue) {
    throw new AppError("Queue entry not found.", 404);
  }

  if (
    user.role !== "super_admin" &&
    queue.organizationId !== user.organizationId
  ) {
    throw new AppError(
      "Queue entry not found.",
      404
    );
  }

  if (queue.status !== "called") {
    throw new AppError("Patient has not been called yet.", 400);
  }

  const updated = await withTenant(queue.organizationId, async (tx) => {
    // Atomic compare-and-set: only a "called" entry may start. Two
    // concurrent START attempts (or a start racing a skip/cancel) cannot
    // both succeed or move an already-advanced entry backwards.
    const started = await tx.queue.updateMany({
      where: { id: queueId, status: "called" },
      data: { status: "in_progress", startedAt: new Date() },
    });

    if (started.count === 0) {
      throw new AppError("Patient has not been called yet.", 400);
    }

    const result = await updateQueue(queueId, {
      status: "in_progress",
      startedAt: new Date(),
    }, tx);

    await updateAppointment(
      queue.appointmentId,
      { status: "in_progress" },
      tx
    );

    return result;
  });

  await auditLogger({
    organizationId: queue.organizationId,
    userId: user.id,
    action: "START",
    entity: "Queue",
    entityId: queueId,
    description: `Started consultation for queue number ${queue.queueNumber}.`,
  });

  return updated;
}

export async function completeConsultation(queueId, user) {
  const scoped = resolveUserScope(user);

  const queue = await scoped(async (tx) => {
    return await findQueueById(queueId, tx);
  });

  if (!queue) {
    throw new AppError("Queue entry not found.", 404);
  }

  if (
    user.role !== "super_admin" &&
    queue.organizationId !== user.organizationId
  ) {
    throw new AppError(
      "Queue entry not found.",
      404
    );
  }

  if (queue.status !== "in_progress") {
    throw new AppError("Consultation has not started.", 400);
  }

  const result = await withTenant(queue.organizationId, async (tx) => {
    // Atomic compare-and-set: only an "in_progress" entry may complete.
    const completed = await tx.queue.updateMany({
      where: { id: queueId, status: "in_progress" },
      data: { status: "completed", completedAt: new Date() },
    });

    if (completed.count === 0) {
      throw new AppError("Consultation has not started.", 400);
    }

    await updateAppointment(
      queue.appointmentId,
      { status: "completed" },
      tx
    );

    return await updateQueue(
      queueId,
      {
        status: "completed",
        completedAt: new Date(),
      },
      tx
    );
  });

  await auditLogger({
    organizationId: queue.organizationId,
    userId: user.id,
    action: "COMPLETE",
    entity: "Queue",
    entityId: queueId,
    description: `Completed consultation for queue number ${queue.queueNumber}.`,
  });

  return result;
}