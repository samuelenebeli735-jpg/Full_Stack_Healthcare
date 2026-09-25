import { resolveOrganizationId } from "../utils/tenantAccess.js";
import { withTenant, withSuperAdmin } from "../utils/tenantContext.js";

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
  findDiagnoses,
} from "../repositories/dashboard.repository.js";

const DIAGNOSIS_CATEGORIES = [
  {
    name: "Cold & Cough",
    color: "#3b82f6",
    keywords: ["cold", "cough", "flu", "catarrh", "sore throat", "runny nose"],
  },
  {
    name: "Fever",
    color: "#f59e0b",
    keywords: ["fever", "malaria", "temperature", "pyrexia", "chills"],
  },
  {
    name: "Headache",
    color: "#8b5cf6",
    keywords: ["headache", "migraine", "head ache"],
  },
  {
    name: "Stomach Pain",
    color: "#10b981",
    keywords: ["stomach", "abdominal", "gastroenteritis", "diarrhea", "nausea", "dysentery"],
  },
  {
    name: "Allergies",
    color: "#ef4444",
    keywords: ["allergy", "allergic", "rash", "urticaria", "hives", "skin"],
  },
];

function categorizeDiagnosis(diagnosis) {
  const text = (diagnosis || "").toLowerCase();
  if (!text) return "Unspecified";
  for (const cat of DIAGNOSIS_CATEGORIES) {
    if (cat.keywords.some((k) => text.includes(k))) return cat.name;
  }
  return "Other";
}

function buildDiagnosisColors() {
  const colors = {};
  DIAGNOSIS_CATEGORIES.forEach((c) => { colors[c.name] = c.color; });
  colors["Unspecified"] = "#94a3b8";
  colors["Other"] = "#64748b";
  return colors;
}

export async function getHealthAnalytics(user, query = {}) {
  const orgId = resolveScope(query.organizationId, user);

  const runner = orgId
    ? (callback) => withTenant(orgId, callback)
    : withSuperAdmin;

  return await runner(async (tx) => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const trendStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [monthDiagnoses, trendDiagnoses] = await Promise.all([
      findDiagnoses(orgId, { from: monthStart, to: monthEnd }, tx),
      findDiagnoses(orgId, { from: trendStart, to: monthEnd }, tx),
    ]);

    const breakdownMap = {};
    const colors = buildDiagnosisColors();
    monthDiagnoses.forEach((c) => {
      const name = categorizeDiagnosis(c.diagnosis);
      breakdownMap[name] = (breakdownMap[name] || 0) + 1;
    });

    const breakdown = Object.entries(breakdownMap)
      .map(([name, count]) => ({ name, count, color: colors[name] || "#94a3b8" }))
      .sort((a, b) => b.count - a.count);

    const totalCases = breakdown.reduce((sum, b) => sum + b.count, 0);

    const monthBuckets = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthBuckets.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleString("en-US", { month: "short" }),
        count: 0,
      });
    }
    const bucketMap = Object.fromEntries(monthBuckets.map((b) => [b.key, b]));
    trendDiagnoses.forEach((c) => {
      const key = `${c.consultationDate.getFullYear()}-${String(c.consultationDate.getMonth() + 1).padStart(2, "0")}`;
      if (bucketMap[key]) bucketMap[key].count += 1;
    });

    return {
      breakdown,
      totalCases,
      monthlyTrend: monthBuckets,
    };
  });
}

function resolveScope(organizationId, user) {
  return resolveOrganizationId(organizationId, user) || null;
}

export async function getDashboardSummary(user, query = {}) {
  const orgId = resolveScope(query.organizationId, user);

  const runner = orgId
    ? (callback) => withTenant(orgId, callback)
    : withSuperAdmin;

  return await runner(async (tx) => {
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
      countProfiles(orgId, tx),
      countStaff(orgId, tx),
      countDepartments(orgId, tx),
      countPositions(orgId, tx),
      countServices(orgId, tx),
      countAppointments(orgId, tx),
      countAppointmentsToday(orgId, tx),
      countConsultations(orgId, tx),
      findAppointmentStatusCounts(orgId, tx),
      findQueueStatusCounts(orgId, tx),
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
  });
}

export async function getAppointmentOverview(user, query = {}) {
  const orgId = resolveScope(query.organizationId, user);

  const runner = orgId
    ? (callback) => withTenant(orgId, callback)
    : withSuperAdmin;

  return await runner(async (tx) => {
    const [statusCounts, recentAppointments] = await Promise.all([
      findAppointmentStatusCounts(orgId, tx),
      findRecentAppointments(orgId, 10, tx),
    ]);

    return {
      statusCounts: statusCounts.map((g) => ({
        status: g.status,
        count: g._count._all,
      })),
      recentAppointments,
    };
  });
}

export async function getQueueOverview(user, query = {}) {
  const orgId = resolveScope(query.organizationId, user);

  const runner = orgId
    ? (callback) => withTenant(orgId, callback)
    : withSuperAdmin;

  return await runner(async (tx) => {
    const statusCounts = await findQueueStatusCounts(orgId, tx);

    return {
      statusCounts: statusCounts.map((g) => ({
        status: g.status,
        count: g._count._all,
      })),
    };
  });
}