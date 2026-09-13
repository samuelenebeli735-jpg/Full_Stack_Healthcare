import { resolveOrganizationId } from "../utils/tenantAccess.js";
import { withTenant } from "../utils/tenantContext.js";

import {
  findAppointmentsForReport,
  findConsultationsForReport,
  findPatientStats,
  findStaffStats,
} from "../repositories/report.repository.js";

function resolveScope(organizationId, user) {
  return resolveOrganizationId(organizationId, user) || null;
}

function groupByDay(rows, dateField, statusField = null) {
  const map = new Map();

  for (const row of rows) {
    const day = new Date(row[dateField]).toISOString().slice(0, 10);

    if (!map.has(day)) {
      map.set(day, {
        date: day,
        total: 0,
        ...(statusField ? { byStatus: {} } : {}),
      });
    }

    const entry = map.get(day);
    entry.total += 1;

    if (statusField) {
      const status = row[statusField];
      entry.byStatus[status] = (entry.byStatus[status] || 0) + 1;
    }
  }

  return Array.from(map.values());
}

export async function getAppointmentReport(user, query = {}) {
  const orgId = resolveScope(query.organizationId, user);
  const isSuperAdmin = user.role === "super_admin";

  const { statusCounts, rows } = await withTenant(orgId, { isSuperAdmin }, (tx) =>
    findAppointmentsForReport(orgId, query.from, query.to, tx)
  );

  return {
    total: rows.length,
    statusCounts: statusCounts.map((g) => ({
      status: g.status,
      count: g._count._all,
    })),
    byDay: groupByDay(rows, "appointmentDate", "status"),
  };
}

export async function getConsultationReport(user, query = {}) {
  const orgId = resolveScope(query.organizationId, user);
  const isSuperAdmin = user.role === "super_admin";

  const rows = await withTenant(orgId, { isSuperAdmin }, (tx) =>
    findConsultationsForReport(orgId, query.from, query.to, tx)
  );

  return {
    total: rows.length,
    byDay: groupByDay(rows, "consultationDate"),
  };
}

export async function getPatientReport(user, query = {}) {
  const orgId = resolveScope(query.organizationId, user);
  const isSuperAdmin = user.role === "super_admin";

  const stats = await withTenant(orgId, { isSuperAdmin }, (tx) =>
    findPatientStats(orgId, tx)
  );

  return {
    total: stats.total,
    byGender: stats.byGender.map((g) => ({
      gender: g.gender,
      count: g._count._all,
    })),
    byLevel: stats.byLevel.map((g) => ({
      level: g.level,
      count: g._count._all,
    })),
  };
}

export async function getStaffReport(user, query = {}) {
  const orgId = resolveScope(query.organizationId, user);
  const isSuperAdmin = user.role === "super_admin";

  return await withTenant(orgId, { isSuperAdmin }, (tx) =>
    findStaffStats(orgId, tx)
  );
}