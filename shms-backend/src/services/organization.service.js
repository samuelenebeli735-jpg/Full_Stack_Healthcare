import AppError from "../utils/AppError.js";
import { auditLogger } from "../utils/auditLogger.js";

import {
  findOrganizationById,
  findOrganizationBySlug,
  findOrganizationByEmail,
  createOrganization,
  findAllOrganizations,
  findActiveOrganizations,
  updateOrganization,
} from "../repositories/organization.repository.js";

import { getPagination, buildPaginationMeta } from "../utils/pagination.js";

/**
 * Create a new organization.
 *
 * @param {Object} data
 * @param {Object} user
 * @returns {Promise<Object>}
 */
export async function createNewOrganization(data, user) {
  // Check if the slug already exists
  const existingOrganization = await findOrganizationBySlug(data.slug);

  if (existingOrganization) {
    throw new AppError("Organization slug already exists.", 409);
  }

  if (data.email) {
    const existingEmail = await findOrganizationByEmail(data.email);

    if (existingEmail) {
      throw new AppError(
        "Organization email already exists.",
        409
      );
    }
  }

  // Create the organization
  const organization = await createOrganization({
    name: data.name,
    slug: data.slug,
    email: data.email,
    phone: data.phone,
    address: data.address,
    logoUrl: data.logoUrl,
  });

  await auditLogger({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entity: "Organization",
    entityId: organization.id,
    description: `Organization ${organization.name} created.`,
  });

  return organization;
}

export async function getAllOrganizations(query = {}) {
  const { page, limit, skip } = getPagination(query);

  const { items, total } = await findAllOrganizations(query);

  return { items, pagination: buildPaginationMeta({ page, limit, total }) };
}

export async function getOrganizationById(id) {
  const organization = await findOrganizationById(id);

  if (!organization) {
    throw new AppError("Organization not found.", 404);
  }

  return organization;
}

/**
 * List active organizations for public registration.
 */
export async function listActiveOrganizations() {
  return await findActiveOrganizations();
}

export async function updateExistingOrganization(id, data, user) {
  const organization = await findOrganizationById(id);

  if (!organization) {
    throw new AppError("Organization not found.", 404);
  }

  if (data.slug && data.slug !== organization.slug) {
    const existing = await findOrganizationBySlug(data.slug);
    if (existing) {
      throw new AppError("Organization slug already exists.", 409);
    }
  }

  if (data.email && data.email !== organization.email) {
    const existing = await findOrganizationByEmail(data.email);
    if (existing) {
      throw new AppError("Organization email already exists.", 409);
    }
  }

  const updateData = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.slug !== undefined) updateData.slug = data.slug;
  if (data.email !== undefined) updateData.email = data.email;
  if (data.phone !== undefined) updateData.phone = data.phone;
  if (data.address !== undefined) updateData.address = data.address;
  if (data.logoUrl !== undefined) updateData.logoUrl = data.logoUrl;

  const updated = await updateOrganization(id, updateData);

  await auditLogger({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entity: "Organization",
    entityId: id,
    description: `Organization ${updated.name} updated.`,
  });

  return updated;
}
