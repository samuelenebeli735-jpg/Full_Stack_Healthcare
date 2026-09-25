import prisma from "../config/db.js";
import { buildPrismaQuery } from "../utils/query.js";

const prescriptionInclude = {
  consultation: {
    include: {
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
    },
  },
  items: true,
};

export async function createPrescription(data, db = prisma) {
  return await db.prescription.create({
    data,
  });
}

export async function createPrescriptionItems(items, db = prisma) {
  return await db.prescriptionItem.createMany({
    data: items,
  });
}

export async function findPrescriptionById(id, db = prisma) {
  return await db.prescription.findUnique({
    where: { id },
    include: prescriptionInclude,
  });
}

export async function findPrescriptionByConsultation(consultationId, db = prisma) {
  return await db.prescription.findUnique({
    where: { consultationId },
  });
}

export async function findPrescriptions(
  organizationId = null,
  query = {},
  db = prisma
) {
  const prismaQuery = buildPrismaQuery(query, {
    allowedSortFields: ["createdAt", "updatedAt"],
    defaultSort: { createdAt: "desc" },
    searchFields: ["consultation.chiefComplaint", "consultation.symptoms", "consultation.diagnosis"],
  });

  const where = {
    ...prismaQuery.where,
    ...(organizationId
      ? { consultation: { queue: { organizationId } } }
      : {}),
  };

  const [items, total] = await Promise.all([
    db.prescription.findMany({
      where,
      skip: prismaQuery.skip,
      take: prismaQuery.take,
      include: prescriptionInclude,
      orderBy: prismaQuery.orderBy,
    }),
    db.prescription.count({ where }),
  ]);

  return { items, total };
}

export async function updatePrescription(id, data, db = prisma) {
  return await db.prescription.update({
    where: { id },
    data,
  });
}

export async function deletePrescriptionItems(prescriptionId, db = prisma) {
  return await db.prescriptionItem.deleteMany({
    where: { prescriptionId },
  });
}

export async function deletePrescription(id, db = prisma) {
  return await db.prescription.delete({
    where: { id },
  });
}
