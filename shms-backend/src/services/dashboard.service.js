import { resolveOrganizationId } from "../utils/tenantAccess.js";

import {
  countProfiles,
  countStaff,
  countDepartments,
  countPositions,
  countServices,
  countAppointments,
  countAppointmentsToday,
  countConsultations,
  findAppointmentStatusCounts,
  findQueueStatusCounts,
  findRecentAppointments,
} from "../repositories/dashboard.repository.js";

function resolveScope(organizationId, user) {
  return resolveOrganizationId(organizationId, user) || null;
}

export async function getDashboardSummary(user, query = {}) {
  const orgId = resolveScope(query.organizationId, user);

  const [
    profiles,
    staff,
    departments,
    positions,
    services,
    appointments,
    appointmentsToday,
    consultations,
    appointmentStatusCounts,
    queueStatusCounts,
  ] = await Promise.all([
    countProfiles(orgId),
    countStaff(orgId),
    countDepartments(orgId),
    countPositions(orgId),
    countServices(orgId),
    countAppointments(orgId),
    countAppointmentsToday(orgId),
    countConsultations(orgId),
    findAppointmentStatusCounts(orgId),
    findQueueStatusCounts(orgId),
  ]);

  return {
    counts: {
      profiles,
      staff,
      departments,
      positions,
      services,
      appointments,
      appointmentsToday,
      consultations,
    },
    appointmentStatusCounts: appointmentStatusCounts.map((g) => ({
      status: g.status,
      count: g._count._all,
    })),
    queueStatusCounts: queueStatusCounts.map((g) => ({
      status: g.status,
      count: g._count._all,
    })),
  };
}

export async function getAppointmentOverview(user, query = {}) {
  const orgId = resolveScope(query.organizationId, user);

  const [statusCounts, recentAppointments] = await Promise.all([
    findAppointmentStatusCounts(orgId),
    findRecentAppointments(orgId, 10),
  ]);

  return {
    statusCounts: statusCounts.map((g) => ({
      status: g.status,
      count: g._count._all,
    })),
    recentAppointments,
  };
}

export async function getQueueOverview(user, query = {}) {
  const orgId = resolveScope(query.organizationId, user);

  const statusCounts = await findQueueStatusCounts(orgId);

  return {
    statusCounts: statusCounts.map((g) => ({
      status: g.status,
      count: g._count._all,
    })),
  };
}
