import prisma from "../config/db.js";

/**
 * Find schedule by ID.
 */
export async function findScheduleById(id, db = prisma) {
  return await db.schedule.findUnique({
    where: {
      id,
    },
    include: {
      organization: true,
      staff: true,
    },
  });
}

/**
 * Find a schedule for a staff member on a specific day.
 */
export async function findScheduleByStaffAndDay(
  staffId,
  dayOfWeek,
  db = prisma
) {
  return await db.schedule.findUnique({
    where: {
      staffId_dayOfWeek: {
        staffId,
        dayOfWeek,
      },
    },
    include: {
      organization: true,
      staff: true,
    },
  });
}

/**
 * Get all schedules for a staff member.
 */
export async function findSchedulesByStaff(
  staffId,
  db = prisma
) {
  return await db.schedule.findMany({
    where: {
      staffId,
    },
    include: {
      organization: true,
      staff: true,
    },
    orderBy: {
      dayOfWeek: "asc",
    },
  });
}

/**
 * Get all schedules for an organization on a specific day.
 */
export async function findSchedulesByDay(
  organizationId,
  dayOfWeek,
  db = prisma
) {
  return await db.schedule.findMany({
    where: {
      organizationId,
      dayOfWeek,
      isActive: true,
    },
    include: {
      staff: true,
    },
    orderBy: {
      startTime: "asc",
    },
  });
}

/**
 * Get all schedules for an organization.
 */
export async function findSchedulesByOrganization(
  organizationId,
  db = prisma
) {
  return await db.schedule.findMany({
    where: {
      organizationId,
    },
    include: {
      organization: true,
      staff: true,
    },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
}

/**
 * Create a schedule.
 */
export async function createSchedule(
  data,
  db = prisma
) {
  return await db.schedule.create({
    data,
    include: {
      organization: true,
      staff: true,
    },
  });
}

/**
 * Update a schedule.
 */
export async function updateSchedule(
  id,
  data,
  db = prisma
) {
  return await db.schedule.update({
    where: {
      id,
    },
    data,
    include: {
      organization: true,
      staff: true,
    },
  });
}

/**
 * Delete a schedule.
 */
export async function deleteSchedule(
  id,
  db = prisma
) {
  return await db.schedule.delete({
    where: {
      id,
    },
  });
}