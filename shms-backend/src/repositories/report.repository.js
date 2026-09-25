import prisma from "../config/db.js";

const scopeWhere = (organizationId) =>
  organizationId ? { organizationId } : {};

function dateRangeWhere(from, to) {
  const where = {};

  if (from) where.gte = new Date(from);
  if (to) where.lte = new Date(to);

  return where;
}

export async function findAppointmentsForReport(
  organizationId,
  from,
  to,
  db = prisma
) {
  const range = dateRangeWhere(from, to);

  const where = {
    ...scopeWhere(organizationId),
    ...(from || to ? { appointmentDate: range } : {}),
  };

  const [statusCounts, rows] = await Promise.all([
    db.appointment.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
    db.appointment.findMany({
      where,
      select: {
        appointmentDate: true,
        status: true,
      },
    }),
  ]);

  return { statusCounts, rows };
}

export async function findConsultationsForReport(
  organizationId,
  from,
  to,
  db = prisma
) {
  const range = dateRangeWhere(from, to);

  const where = {
    ...(organizationId ? { queue: { organizationId } } : {}),
    ...(from || to ? { consultationDate: range } : {}),
  };

  return await db.consultation.findMany({
    where,
    select: {
      consultationDate: true,
    },
  });
}

export async function findPatientStats(organizationId, db = prisma) {
  const where = organizationId ? { user: { organizationId } } : {};

  const [total, byGender, byLevel] = await Promise.all([
    db.profile.count({ where }),
    db.profile.groupBy({
      by: ["gender"],
      where,
      _count: { _all: true },
    }),
    db.profile.groupBy({
      by: ["level"],
      where,
      _count: { _all: true },
    }),
  ]);

  return { total, byGender, byLevel };
}

export async function findStaffStats(organizationId, db = prisma) {
  const where = organizationId ? { user: { organizationId } } : {};

  const [
    total,
    byDepartmentIds,
    byPositionIds,
    byEmploymentStatus,
    departments,
    positions,
  ] = await Promise.all([
    db.staff.count({ where }),
    db.staff.groupBy({
      by: ["departmentId"],
      where,
      _count: { _all: true },
    }),
    db.staff.groupBy({
      by: ["positionId"],
      where,
      _count: { _all: true },
    }),
    db.staff.groupBy({
      by: ["employmentStatus"],
      where,
      _count: { _all: true },
    }),
    db.department.findMany({ select: { id: true, name: true } }),
    db.position.findMany({ select: { id: true, name: true } }),
  ]);

  const departmentNames = Object.fromEntries(
    departments.map((d) => [d.id, d.name])
  );

  const positionNames = Object.fromEntries(
    positions.map((p) => [p.id, p.name])
  );

  return {
    total,
    byDepartment: byDepartmentIds.map((g) => ({
      departmentId: g.departmentId,
      name: departmentNames[g.departmentId] || null,
      count: g._count._all,
    })),
    byPosition: byPositionIds.map((g) => ({
      positionId: g.positionId,
      name: positionNames[g.positionId] || null,
      count: g._count._all,
    })),
    byEmploymentStatus: byEmploymentStatus.map((g) => ({
      status: g.employmentStatus,
      count: g._count._all,
    })),
  };
}
