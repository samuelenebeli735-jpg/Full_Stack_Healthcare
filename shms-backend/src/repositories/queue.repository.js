import prisma from "../config/db.js";

export async function findQueueById(id, db = prisma) {
  return await db.queue.findUnique({
    where: { id },
    include: {
      appointment: {
        include: {
          medicalRecord: {
            include: {
              profile: true,
            },
          },
          service: true,
          staff: {
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
    },
  });
}

export async function findQueueByAppointmentId(appointmentId, db = prisma) {
  return await db.queue.findUnique({
    where: { appointmentId },
  });
}

export async function findTodayQueue(
  organizationId,
  startOfDay,
  endOfDay,
  pagination = {},
  db = prisma
) {
  const { skip = 0, limit = 20, carryOverInProgress = false } = pagination;
  const today = { createdAt: { gte: startOfDay, lte: endOfDay } };
  // Day-close policy (F14): an earlier day's consultation that is still in
  // progress is never closed automatically, so it stays on today's list
  // until a clinician completes it.
  const where = carryOverInProgress
    ? {
        organizationId,
        OR: [today, { status: "in_progress", createdAt: { lt: startOfDay } }],
      }
    : { organizationId, ...today };

  const [items, total] = await Promise.all([
    db.queue.findMany({
      where,
      skip,
      take: limit,
      include: {
        appointment: {
          include: {
            medicalRecord: {
              include: {
                profile: true,
              },
            },
            service: true,
            staff: {
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
      },
      orderBy: [{ queueDate: "asc" }, { queueNumber: "asc" }, { id: "asc" }],
    }),
    db.queue.count({ where }),
  ]);

  return { items, total };
}

export async function findLastQueueToday(organizationId, startOfDay, endOfDay, db = prisma) {
  return await db.queue.findFirst({
    where: {
      organizationId,
      createdAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    orderBy: { queueNumber: "desc" },
  });
}

export async function findLastQueueByDate(organizationId, queueDate, db = prisma) {
  return await db.queue.findFirst({
    where: {
      organizationId,
      queueDate,
    },
    orderBy: { queueNumber: "desc" },
  });
}

export async function findQueueByUserIdAndDate(userId, queueDate, db = prisma) {
  return await db.queue.findFirst({
    // A student can hold more than one ticket on a day (e.g. skipped, then
    // re-booked); the newest one is the relevant one.
    orderBy: { createdAt: "desc" },
    where: {
      queueDate,
      appointment: {
        medicalRecord: {
          profile: {
            userId,
          },
        },
      },
    },
    include: {
      appointment: {
        include: {
          medicalRecord: {
            include: {
              profile: true,
            },
          },
          service: true,
          staff: {
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
    },
  });
}

export async function createQueue(data, db = prisma) {
  return await db.queue.create({
    data,
    include: {
      appointment: {
        include: {
          medicalRecord: {
            include: {
              profile: true,
            },
          },
          service: true,
          staff: {
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
    },
  });
}

export async function updateQueue(id, data, db = prisma) {
  return await db.queue.update({
    where: { id },
    data,
    include: {
      appointment: {
        include: {
          medicalRecord: {
            include: {
              profile: true,
            },
          },
          service: true,
          staff: {
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
    },
  });
}
