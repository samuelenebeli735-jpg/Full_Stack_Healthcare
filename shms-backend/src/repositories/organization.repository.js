import prisma from "../config/db.js";
import { getTenantClient } from "../utils/tenantContext.js";
import { buildPrismaQuery } from "../utils/query.js";

/**
 * Find an organization by its ID.
 */
export async function findOrganizationById(id, db = getTenantClient()) {
  return await db.organization.findUnique({
    where: {
      id,
    },
  });
}

/**
 * Find an organization by its slug.
 */
export async function findOrganizationBySlug(slug, db = getTenantClient()) {
  return await db.organization.findUnique({
    where: {
      slug,
    },
  });
}

/**
 * Find an organization by email.
 */
export async function findOrganizationByEmail(
  email,
  db = getTenantClient()
) {
  return await db.organization.findUnique({
    where: {
      email,
    },
  });
}

/**
 * Create a new organization.
 */
export async function createOrganization(data, db = getTenantClient()) {
  return await db.organization.create({
    data,
  });
}

export async function findAllOrganizations(query = {}, db = getTenantClient()) {
  const prismaQuery = buildPrismaQuery(query, {
    allowedSortFields: ["name", "createdAt", "updatedAt"],
    defaultSort: { name: "asc" },
    searchFields: ["name", "slug", "email"],
  });

  const [items, total] = await Promise.all([
    db.organization.findMany({
      where: prismaQuery.where,
      skip: prismaQuery.skip,
      take: prismaQuery.take,
      orderBy: prismaQuery.orderBy,
    }),
    db.organization.count({ where: prismaQuery.where }),
  ]);

  return { items, total };
}

export async function updateOrganization(id, data, db = getTenantClient()) {
  return await db.organization.update({
    where: { id },
    data,
  });
}

/**
 * Find active organizations (public registration listing).
 */
export async function findActiveOrganizations(db = getTenantClient()) {
  return await db.organization.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
    },
    orderBy: { name: "asc" },
  });
}