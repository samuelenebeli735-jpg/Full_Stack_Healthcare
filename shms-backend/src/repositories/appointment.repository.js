import prisma from "../config/db.js";
import { buildPrismaQuery } from "../utils/query.js";

/**
 * Find an appointment by ID.
 */
export async function findAppointmentById(
  id,
  db = prisma
) {
  return await db.appointment.findUnique({
    where: {
      id,
    },
    include: {
      medicalRecord: {
        include: {
          profile: {
            include: {
              user: {
                select: {
                  id: true,
                  organizationId: true,
                  email: true,
                  role: true,
                  isActive: true,
                },
              },
            },
          },
        },
      },
      service: true,
      staff: true,
      queue: {
        include: {
          consultation: true,
        },
      },
    },
  });
}

/**
 * Get paginated appointments for the current student user.
 */
export async function findAppointmentsByStudent(
  userId,
  query = {},
  db = prisma
) {
  const prismaQuery = buildPrismaQuery(query, {
    allowedSortFields: ["appointmentDate", "status", "createdAt", "updatedAt"],
    defaultSort: { appointmentDate: "desc" },
    searchFields: ["reason", "service.name"],
  });

  const where = {
    ...prismaQuery.where,
    medicalRecord: {
      profile: {
        userId,
      },
    },
  };

  const [items, total] = await Promise.all([
    db.appointment.findMany({
      where,
      skip: prismaQuery.skip,
      take: prismaQuery.take,
      include: {
        medicalRecord: {
          include: {
            profile: true,
          },
        },
        service: true,
        staff: true,
        queue: {
          include: {
            consultation: {
              include: {
                prescription: {
                  include: {
                    items: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: prismaQuery.orderBy,
    }),

    db.appointment.count({
      where,
    }),
  ]);

  return {
    items,
    total,
  };
}

/**
 * Get paginated appointments for an organization.
 */
export async function findAppointmentsByOrganization(
  organizationId = null,
  query = {},
  db = prisma
) {
  const prismaQuery = buildPrismaQuery(query, {
    allowedSortFields: ["appointmentDate", "status", "createdAt", "updatedAt"],
    defaultSort: { appointmentDate: "desc" },
    searchFields: ["reason", "medicalRecord.profile.firstName", "medicalRecord.profile.lastName", "medicalRecord.profile.matricNumber"],
  });

  const where = {
    ...prismaQuery.where,
    ...(organizationId ? { organizationId } : {}),
  };

  const [items, total] = await Promise.all([
    db.appointment.findMany({
      where,
      skip: prismaQuery.skip,
      take: prismaQuery.take,
      include: {
        medicalRecord: {
          include: {
            profile: true,
          },
        },
        service: true,
        staff: true,
      },
      orderBy: prismaQuery.orderBy,
    }),

    db.appointment.count({
      where,
    }),
  ]);

  return {
    items,
    total,
  };
}

/**
 * Create a new appointment.
 */
export async function createAppointment(
  data,
  db = prisma
) {
  return await db.appointment.create({
    data,
    include: {
      medicalRecord: true,
      service: true,
      staff: true,
    },
  });
}

/**
 * Update an appointment.
 */
export async function updateAppointment(
  id,
  data,
  db = prisma
) {
  return await db.appointment.update({
    where: {
      id,
    },
    data,
    include: {
      medicalRecord: true,
      service: true,
      staff: true,
    },
  });
}

/**
 * Delete an appointment.
 */
export async function deleteAppointment(id, db = prisma) {
  return await db.appointment.delete({ where: { id } });
}
/**
 * Find appointments for a staff member on the same calendar day as the
 * provided appointment date. Used for overlap/conflict detection.
 */
export async function findAppointmentsForStaffOnDate(
  staffId,
  appointmentDate,
  excludeAppointmentId = null,
  db = prisma
) {
  const startOfDay = new Date(appointmentDate);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(appointmentDate);
  endOfDay.setHours(23, 59, 59, 999);

  const where = {
    staffId,
    appointmentDate: { gte: startOfDay, lte: endOfDay },
    status: {
      notIn: ["cancelled", "no_show"],
    },
  };

  if (excludeAppointmentId) {
    where.id = {
      not: excludeAppointmentId,
    };
  }

  return await db.appointment.findMany({
    where,
    include: {
      medicalRecord: true,
      service: true,
      staff: true,
    },
  });
}

/**
 * Deterministic 32-bit FNV-1a hash. Stable across processes and versions,
 * so every request derives the same advisory-lock key for the same
 * (organizationId, staffId) pair.
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
 * Acquire a transaction-scoped PostgreSQL advisory lock keyed by
 * (organizationId, staffId, local calendar day of appointmentDate).
 *
 * Any two requests contending for the same staff member on the same day
 * compute the same key and therefore serialize on it. Serializing at
 * day-granularity is safe for arbitrary service durations: any pair of
 * potentially overlapping appointments necessarily shares (org, staff, day),
 * so they can never compute different keys and both slip through. Requests
 * for different staff members or different organizations derive different
 * keys and never serialize against each other.
 *
 * The lock is acquired and held on the SAME interactive transaction that
 * performs the conflict-check read and the insert, and is automatically
 * released when that transaction commits or rolls back
 * (pg_advisory_xact_lock semantics).
 */
export async function lockStaffDay(
  organizationId,
  staffId,
  appointmentDate,
  db = prisma
) {
  const day = new Date(appointmentDate);
  day.setHours(0, 0, 0, 0);
  const dayKey = Math.floor(day.getTime() / 86400000);
  const resourceKey = fnv1a32(`${organizationId}:${staffId}`);

  await db.$executeRawUnsafe(
    "SELECT pg_catalog.pg_advisory_xact_lock($1::int, $2::int)",
    resourceKey,
    dayKey
  );
}

/**
 * Find an appointment for a staff member
 * at a specific date and time.
 */
export async function findAppointmentByStaffAndDate(
  staffId,
  appointmentDate,
  excludeAppointmentId = null,
  db = prisma
) {
  const where = {
    staffId,
    appointmentDate,
    status: {
      notIn: ["cancelled", "no_show"],
    },
  };

  if (excludeAppointmentId) {
    where.id = {
      not: excludeAppointmentId,
    };
  }

  return await db.appointment.findFirst({
    where,
    include: {
      medicalRecord: true,
      service: true,
      staff: true,
    },
  });
}