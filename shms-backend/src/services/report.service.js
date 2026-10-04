import { resolveOrganizationId } from "../utils/tenantAccess.js";
import { withTenant, withSuperAdmin } from "../utils/tenantContext.js";

import {
  findAppointmentsForReport,
  findConsultationsForReport,
  findPatientStats,
  findStaffStats,
} from "../repositories/report.repository.js";

function resolveScope(organizationId, user) {
  return resolveOrganizationId(organizationId, user) || null;
}

/**
 * Local wall-clock day key (YYYY-MM-DD) for a stored timestamp.
 *
 * Timestamps are stored as UTC instants, but the clinic wall clock is the
 * runtime LOCAL timezone (see the minutesOfDay contract in
 * appointment.service.js). Bucketing a day with toISOString() would use the
 * UTC day boundary instead, so an appointment late in the evening would be
 * filed under the following day and would disagree with computePeakHours,
 * which reads the same instant with LOCAL getters. Both aggregations must
 * share one day/hour boundary, so both go through these helpers.
 */
function localDayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Local wall-clock hour of day (0-23) for a stored timestamp, matching the
 * same runtime LOCAL convention as localDayKey.
 */
function localHourOfDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getHours();
}

function groupByDay(rows, dateField, statusField = null) {
  const map = new Map();

  for (const row of rows) {
    const day = localDayKey(row[dateField]);

    if (day === null) continue;

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

function computeWaitMetrics(rows) {
  const waits = [];

  for (const row of rows) {
    const q = row.queue;
    if (!q) continue;

    // Queue.checkedInAt is non-nullable in the schema (a Queue row only ever
    // exists because the patient checked in), so it needs no null guard.
    const start = q.startedAt || q.calledAt;
    if (!start) continue;

    const ms = new Date(start).getTime() - new Date(q.checkedInAt).getTime();
    if (ms > 0) waits.push(ms);
  }

  if (!waits.length) return null;

  const avgMs = waits.reduce((sum, ms) => sum + ms, 0) / waits.length;
  return Math.round(avgMs / 60000);
}

function computePeakHours(rows, limit = 8) {
  const counts = new Map();

  for (const row of rows) {
    const hour = localHourOfDay(row.appointmentDate);
    if (hour === null) continue;
    counts.set(hour, (counts.get(hour) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => b.count - a.count || a.hour - b.hour)
    .slice(0, limit);
}

function computeDepartmentCounts(rows) {
  const counts = new Map();

  for (const row of rows) {
    const name = row.staff?.department?.name || "Unassigned";
    counts.set(name, (counts.get(name) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([dept, count]) => ({ dept, count }))
    .sort((a, b) => b.count - a.count);
}

export async function getAppointmentReport(user, query = {}) {
  const orgId = resolveScope(query.organizationId, user);

  const runner = orgId
    ? (callback) => withTenant(orgId, callback)
    : withSuperAdmin;

  return await runner(async (tx) => {
    const { statusCounts, rows } = await findAppointmentsForReport(
      orgId,
      query.from,
      query.to,
      tx
    );

    return {
      total: rows.length,
      statusCounts: statusCounts.map((g) => ({
        status: g.status,
        count: g._count._all,
      })),
      byDay: groupByDay(rows, "appointmentDate", "status"),
      avgWaitMinutes: computeWaitMetrics(rows),
      peakHours: computePeakHours(rows),
      appointmentsByDepartment: computeDepartmentCounts(rows),
    };
  });
}

export async function getConsultationReport(user, query = {}) {
  const orgId = resolveScope(query.organizationId, user);

  const runner = orgId
    ? (callback) => withTenant(orgId, callback)
    : withSuperAdmin;

  return await runner(async (tx) => {
    const rows = await findConsultationsForReport(
      orgId,
      query.from,
      query.to,
      tx
    );

    return {
      total: rows.length,
      byDay: groupByDay(rows, "consultationDate"),
    };
  });
}

export async function getPatientReport(user, query = {}) {
  const orgId = resolveScope(query.organizationId, user);

  const runner = orgId
    ? (callback) => withTenant(orgId, callback)
    : withSuperAdmin;

  return await runner(async (tx) => {
    const stats = await findPatientStats(orgId, tx);

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
  });
}

export async function getStaffReport(user, query = {}) {
  const orgId = resolveScope(query.organizationId, user);

  const runner = orgId
    ? (callback) => withTenant(orgId, callback)
    : withSuperAdmin;

  return await runner(async (tx) => {
    return await findStaffStats(orgId, tx);
  });
}