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
  db = prisma
) {
  const prismaQuery = buildPrismaQuery(query, {
    allowedSortFields: ["firstName", "lastName", "staffNumber", "employmentStatus", "createdAt", "updatedAt"],
    defaultSort: { firstName: "asc" },
    searchFields: ["firstName", "middleName", "lastName", "staffNumber", "user.email"],
  });

  const where = {
    ...prismaQuery.where,
    ...(organizationId ? { user: { organizationId } } : {}),
  };

  delete where.organizationId;

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
