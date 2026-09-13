import prisma from "../config/db.js";
import { getTenantClient } from "../utils/tenantContext.js";

export async function findQueueById(id, db = getTenantClient()) {
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

export async function findQueueByAppointmentId(appointmentId, db = getTenantClient()) {
  return await db.queue.findUnique({
    where: { appointmentId },
  });
}

export async function findTodayQueue(
  organizationId,
  startOfDay,
  endOfDay,
  pagination = {},
  db = getTenantClient()
) {
  const { skip = 0, limit = 20 } = pagination;
  const where = {
    organizationId,
    createdAt: {
      gte: startOfDay,
      lte: endOfDay,
    },
  };

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
      orderBy: { queueNumber: "asc" },
    }),
    db.queue.count({ where }),
  ]);

  return { items, total };
}

export async function findLastQueueToday(organizationId, startOfDay, endOfDay, db = getTenantClient()) {
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

export async function findLastQueueByDate(organizationId, queueDate, db = getTenantClient()) {
  return await db.queue.findFirst({
    where: {
      organizationId,
      queueDate,
    },
    orderBy: { queueNumber: "desc" },
  });
}

export async function findQueueByUserIdAndDate(userId, queueDate, db = getTenantClient()) {
  return await db.queue.findFirst({
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

export async function createQueue(data, db = getTenantClient()) {
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

export async function updateQueue(id, data, db = getTenantClient()) {
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
