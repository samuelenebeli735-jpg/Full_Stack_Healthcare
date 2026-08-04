import prisma from "../config/db.js";
import AppError from "../utils/AppError.js";
import { resolveOrganizationId } from "../utils/tenantAccess.js";
import { auditLogger } from "../utils/auditLogger.js";
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

export async function checkInPatient(data, user) {
  const appointment = await findAppointmentById(data.appointmentId);

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

  const existingQueue = await findQueueByAppointmentId(data.appointmentId);

  if (existingQueue) {
    throw new AppError("Patient has already checked in.", 409);
  }

  const queueDate = getLocalDateString();

  let result;

  // Retry on the unique (organizationId, queueDate, queueNumber) constraint
  // so concurrent check-ins receive distinct sequential numbers.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      result = await prisma.$transaction(async (tx) => {
        const lastQueue = await findLastQueueByDate(
          appointment.organizationId,
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
            organizationId: appointment.organizationId,
            appointmentId: appointment.id,
            queueNumber,
            queueDate,
            estimatedWaitMinutes,
          },
          tx
        );

        await updateAppointment(
          appointment.id,
          { status: "checked_in" },
          tx
        );

        return queue;
      });
      break;
    } catch (error) {
      if (error.code === "P2002" && attempt < 4) {
        continue;
      }
      throw error;
    }
  }

  await auditLogger({
    organizationId: appointment.organizationId,
    userId: user.id,
    action: "CHECKIN",
    entity: "Queue",
    entityId: result.id,
    description: `Patient checked in with queue number ${result.queueNumber}.`,
  });

  return result;
}

export async function getTodayQueue(organizationId, user, query = {}) {
  const resolvedOrgId = resolveOrganizationId(organizationId, user);

  const { startOfDay, endOfDay } = getTodayRange();
  const { page, limit, skip } = getPagination(query);

  const { items, total } = await findTodayQueue(
    resolvedOrgId,
    startOfDay,
    endOfDay,
    { skip, limit }
  );

  return { items, pagination: buildPaginationMeta({ page, limit, total }) };
}

export async function getMyQueue(user) {
  const queueDate = getLocalDateString();
  const { startOfDay, endOfDay } = getTodayRange();

  const queue = await findQueueByUserIdAndDate(user.id, queueDate);

  if (!queue) {
    return null;
  }

  const { items: todayQueue } = await findTodayQueue(
    queue.organizationId,
    startOfDay,
    endOfDay,
    { skip: 0, limit: 500 }
  );

  const active = todayQueue
    .filter((q) => q.status !== "completed" && q.status !== "cancelled")
    .sort((a, b) => a.queueNumber - b.queueNumber);

  const myIndex = active.findIndex((q) => q.id === queue.id);
  const patientsAhead = myIndex >= 0 ? myIndex : 0;

  const currentServing =
    active.find((q) => q.status === "in_progress" || q.status === "called") ||
    active[0] ||
    null;

  return {
    id: queue.id,
    queueNumber: queue.queueNumber,
    status: queue.status,
    estimatedWaitMinutes: queue.estimatedWaitMinutes,
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
}

export async function getQueueById(id, user) {
  const queue = await findQueueById(id);

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

  const { items: queue } = await findTodayQueue(
    resolvedOrgId,
    startOfDay,
    endOfDay,
    { skip: 0, limit: 500 }
  );

  const nextPatient = queue.find((item) => item.status === "waiting");

  if (!nextPatient) {
    throw new AppError(
      "There are no patients waiting in the queue.",
      404
    );
  }

  // Atomically claim the entry so two concurrent calls never call the same patient.
  const claimed = await prisma.queue.updateMany({
    where: { id: nextPatient.id, status: "waiting" },
    data: { status: "called", calledAt: new Date() },
  });

  if (claimed.count === 0) {
    throw new AppError(
      "There are no patients waiting in the queue.",
      404
    );
  }

  const updatedQueue = await updateQueue(nextPatient.id, {
    status: "called",
    calledAt: new Date(),
  });

  await auditLogger({
    organizationId: resolvedOrgId,
    userId: user.id,
    action: "CALL",
    entity: "Queue",
    entityId: nextPatient.id,
    description: `Called queue number ${nextPatient.queueNumber}.`,
  });

  return updatedQueue;
}

export async function startConsultation(queueId, user) {
  const queue = await findQueueById(queueId);

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

  const updated = await prisma.$transaction(async (tx) => {
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
  const queue = await findQueueById(queueId);

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

  const result = await prisma.$transaction(async (tx) => {
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
