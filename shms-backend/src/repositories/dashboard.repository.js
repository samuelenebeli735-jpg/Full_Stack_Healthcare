import prisma from "../config/db.js";
import { getTenantClient } from "../utils/tenantContext.js";

const scopeWhere = (organizationId) =>
  organizationId ? { organizationId } : {};

export async function countProfiles(organizationId, db = getTenantClient()) {
  return await db.profile.count({
    where: organizationId ? { user: { organizationId } } : {},
  });
}

export async function countStaff(organizationId, db = getTenantClient()) {
  return await db.staff.count({
    where: organizationId ? { user: { organizationId } } : {},
  });
}

export async function countDepartments(organizationId, db = getTenantClient()) {
  return await db.department.count({ where: scopeWhere(organizationId) });
}

export async function countPositions(organizationId, db = getTenantClient()) {
  return await db.position.count({ where: scopeWhere(organizationId) });
}

export async function countServices(organizationId, db = getTenantClient()) {
  return await db.service.count({ where: scopeWhere(organizationId) });
}

export async function countAppointments(organizationId, db = getTenantClient()) {
  return await db.appointment.count({ where: scopeWhere(organizationId) });
}

export async function countAppointmentsToday(organizationId, db = getTenantClient()) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  return await db.appointment.count({
    where: {
      ...scopeWhere(organizationId),
      appointmentDate: { gte: start, lte: end },
    },
  });
}

export async function countConsultations(organizationId, db = getTenantClient()) {
  return await db.consultation.count({
    where: organizationId ? { queue: { organizationId } } : {},
  });
}

export async function findAppointmentStatusCounts(organizationId, db = getTenantClient()) {
  return await db.appointment.groupBy({
    by: ["status"],
    where: scopeWhere(organizationId),
    _count: { _all: true },
  });
}

export async function findQueueStatusCounts(organizationId, db = getTenantClient()) {
  return await db.queue.groupBy({
    by: ["status"],
    where: scopeWhere(organizationId),
    _count: { _all: true },
  });
}

export async function findRecentAppointments(
  organizationId,
  limit = 10,
  db = getTenantClient()
) {
  return await db.appointment.findMany({
    where: scopeWhere(organizationId),
    take: limit,
    orderBy: { appointmentDate: "desc" },
    include: {
      medicalRecord: {
        include: {
          profile: true,
        },
      },
      service: true,
      staff: true,
    },
  });
}

export async function findDiagnoses(
  organizationId,
  { from, to },
  db = getTenantClient()
) {
  return await db.consultation.findMany({
    where: {
      queue: {
        ...scopeWhere(organizationId),
      },
      consultationDate: { gte: from, lte: to },
    },
    select: { diagnosis: true, consultationDate: true },
  });
}
