import prisma from "../config/db.js";
import { buildPrismaQuery } from "../utils/query.js";

export async function findStaffById(id, db = prisma) {
  return await db.staff.findUnique({
    where: { id },
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
      department: true,
      position: true,
    },
  });
}

export async function findStaffByStaffNumber(staffNumber, db = prisma) {
  return await db.staff.findUnique({
    where: { staffNumber },
  });
}

export async function findStaffByUserId(userId, db = prisma) {
  return await db.staff.findUnique({
    where: { userId },
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
      department: true,
      position: true,
    },
  });
}

export async function findStaffByOrganization(
  organizationId = null,
  query = {},
  db = prisma,
  { publicView = false } = {}
) {
  // publicView (student callers): search/sort only on display names so the
  // filter cannot be used as an oracle for staffNumber or login email.
  const prismaQuery = buildPrismaQuery(query, {
    allowedSortFields: publicView
      ? ["firstName", "lastName"]
      : ["firstName", "lastName", "staffNumber", "employmentStatus", "createdAt", "updatedAt"],
    defaultSort: { firstName: "asc" },
    searchFields: publicView
      ? ["firstName", "middleName", "lastName"]
      : ["firstName", "middleName", "lastName", "staffNumber", "user.email"],
  });

  const where = {
    ...prismaQuery.where,
    ...(organizationId ? { user: { organizationId } } : {}),
  };

  delete where.organizationId;

  if (publicView) {
    // buildPrismaQuery copies any *Id query key into where; do not let a
    // student probe which user accounts belong to staff.
    delete where.userId;
  }

  if (query.employmentStatus) {
    where.employmentStatus = query.employmentStatus;
  }

  const [items, total] = await Promise.all([
    db.staff.findMany({
      where,
      skip: prismaQuery.skip,
      take: prismaQuery.take,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
          },
        },
        department: true,
        position: true,
      },
      orderBy: prismaQuery.orderBy,
    }),
    db.staff.count({ where }),
  ]);

  return { items, total };
}

export async function createStaff(data, db = prisma) {
  return await db.staff.create({
    data,
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
      department: true,
      position: true,
    },
  });
}

export async function updateStaff(id, data, db = prisma) {
  return await db.staff.update({
    where: { id },
    data,
    include: {
      user: { select: { id: true, email: true, role: true, isActive: true } },
      department: true,
      position: true,
    },
  });
}

export async function deleteStaff(id, db = prisma) {
  return await db.staff.delete({ where: { id } });
}
