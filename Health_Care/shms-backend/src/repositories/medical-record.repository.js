import prisma from "../config/db.js";
import { buildPrismaQuery } from "../utils/query.js";

export async function findMedicalRecordByProfileId(profileId, db = prisma) {
  return await db.medicalRecord.findUnique({
    where: { profileId },
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
  });
}

export async function findMedicalRecordById(id, db = prisma) {
  return await db.medicalRecord.findUnique({
    where: { id },
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
  });
}

export async function findMedicalRecordByRecordNumber(recordNumber, db = prisma) {
  return await db.medicalRecord.findUnique({
    where: { recordNumber },
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
  });
}

export async function countMedicalRecordsByYear(recordYear, db = prisma) {
  return await db.medicalRecord.count({
    where: { recordYear },
  });
}

export async function findMedicalRecords(
  organizationId = null,
  query = {},
  db = prisma
) {
  const prismaQuery = buildPrismaQuery(query, {
    allowedSortFields: ["recordNumber", "recordYear", "status", "createdAt"],
    defaultSort: { recordNumber: "asc" },
    searchFields: ["recordNumber", "profile.firstName", "profile.lastName", "profile.matricNumber"],
  });

  if (organizationId) {
    prismaQuery.where = {
      ...prismaQuery.where,
      profile: { user: { organizationId } },
    };
  }

  delete prismaQuery.where.organizationId;

  const [items, total] = await Promise.all([
    db.medicalRecord.findMany({
      where: prismaQuery.where,
      skip: prismaQuery.skip,
      take: prismaQuery.take,
      orderBy: prismaQuery.orderBy,
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
    }),
    db.medicalRecord.count({ where: prismaQuery.where }),
  ]);

  return { items, total };
}

export async function createMedicalRecord(data, db = prisma) {
  return await db.medicalRecord.create({
    data,
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
              createdAt: true,
              updatedAt: true,
              organization: true,
            },
          },
        },
      },
    },
  });
}

export async function updateMedicalRecord(id, data, db = prisma) {
  return await db.medicalRecord.update({
    where: { id },
    data,
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
  });
}