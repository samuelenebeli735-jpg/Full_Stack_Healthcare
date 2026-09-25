import prisma from "../config/db.js";
import { buildPrismaQuery } from "../utils/query.js";

const consultationInclude = {
  queue: {
    include: {
      appointment: {
        include: {
          medicalRecord: true,
          service: true,
          staff: true,
        },
      },
    },
  },
};

export async function findConsultationById(id, db = prisma) {
  return await db.consultation.findUnique({
    where: { id },
    include: consultationInclude,
  });
}

export async function findConsultationByQueueId(queueId, db = prisma) {
  return await db.consultation.findUnique({
    where: { queueId },
    include: consultationInclude,
  });
}

export async function findConsultations(
  organizationId = null,
  query = {},
  db = prisma
) {
  const prismaQuery = buildPrismaQuery(query, {
    allowedSortFields: ["consultationDate", "createdAt", "updatedAt"],
    defaultSort: { consultationDate: "desc" },
    searchFields: ["chiefComplaint", "symptoms", "diagnosis", "treatmentPlan", "notes"],
  });

  if (organizationId) {
    prismaQuery.where = {
      ...prismaQuery.where,
      queue: {
        ...(prismaQuery.where.queue ?? {}),
        organizationId,
      },
    };
  }

  const [items, total] = await Promise.all([
    db.consultation.findMany({
      where: prismaQuery.where,
      skip: prismaQuery.skip,
      take: prismaQuery.take,
      include: consultationInclude,
      orderBy: prismaQuery.orderBy,
    }),
    db.consultation.count({ where: prismaQuery.where }),
  ]);

  return { items, total };
}

export async function createConsultation(data, db = prisma) {
  return await db.consultation.create({
    data,
    include: consultationInclude,
  });
}

export async function updateConsultation(id, data, db = prisma) {
  return await db.consultation.update({
    where: { id },
    data,
    include: consultationInclude,
  });
}

export async function deleteConsultation(id, db = prisma) {
  return await db.consultation.delete({
    where: { id },
  });
}
