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

// recordNumber is no longer globally unique (uniqueness is enforced per
// organization + recordYear via the recordSeq), so use findFirst scoped by
// the tenant context provided by the caller.
export async function findMedicalRecordByRecordNumber(recordNumber, db = prisma) {
  return await db.medicalRecord.findFirst({
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

/**
 * Atomically reserve the next record sequence for (organizationId, recordYear).
 *
 * Uses an INSERT ... ON CONFLICT DO UPDATE so concurrent creators inside the
 * same organization + year are serialized on the counter's unique index row
 * lock; each request reliably receives a distinct sequence. The upsert runs in
 * the caller's tenant context (the MedicalRecordCounter table enforces RLS on
 * organizationId), so counters for different organizations are invisible to
 * each other and cannot leak.
 */
export async function nextMedicalRecordSeq(
  organizationId,
  recordYear,
  db = prisma
) {
  const rows = await db.$queryRawUnsafe(
    `INSERT INTO "MedicalRecordCounter" ("id", "organizationId", "recordYear", "nextSeq", "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, 1, now(), now())
     ON CONFLICT ("organizationId", "recordYear")
     DO UPDATE SET "nextSeq" = "MedicalRecordCounter"."nextSeq" + 1, "updatedAt" = now()
     RETURNING "nextSeq"`,
    organizationId,
    recordYear
  );
  if (!rows || rows.length !== 1) {
    throw new Error("Failed to reserve a medical record sequence.");
  }
  return Number(rows[0].nextSeq);
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