import AppError from "../utils/AppError.js";
import { auditLogger } from "../utils/auditLogger.js";
import { withTenant, withSuperAdmin, resolveUserScope } from "../utils/tenantContext.js";
import {
  getPagination,
  buildPaginationMeta,
} from "../utils/pagination.js";

import {
  findStaffById,
  findStaffByOrganization,
  createStaff,
  updateStaff,
  deleteStaff,
} from "../repositories/staff.repository.js";

import {
  findUserByEmail,
  createUser,
} from "../repositories/user.repository.js";

import {
  findDepartmentById,
} from "../repositories/department.repository.js";

import {
  findPositionById,
} from "../repositories/position.repository.js";

import {
  hashPassword,
} from "../utils/password.js";

export async function createNewStaff(data, user) {
  const organizationId =
    user.role === "super_admin"
      ? data.organizationId
      : user.organizationId;

  // Global pre-auth duplicate check (SECURITY DEFINER).
  const existingUser = await findUserByEmail(data.email);

  if (existingUser) {
    throw new AppError("Email already exists.", 409);
  }

  const hashedPassword = await hashPassword(data.password);

  let staffNumber;
  let result;

  // Retry on the unique staffNumber constraint so concurrent creates
  // get distinct numbers instead of a generic 409.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      result = await withTenant(organizationId, async (tx) => {
        const department = await findDepartmentById(data.departmentId, tx);

        if (!department) {
          throw new AppError("Department not found.", 404);
        }

        if (department.organizationId !== organizationId) {
          throw new AppError("Department not found.", 404);
        }

        const position = await findPositionById(data.positionId, tx);

        if (!position) {
          throw new AppError("Position not found.", 404);
        }

        if (position.organizationId !== organizationId) {
          throw new AppError("Position not found.", 404);
        }

        const { total } = await findStaffByOrganization(organizationId, {
          skip: 0,
          limit: 1,
        }, tx);
        staffNumber = `RUN-STF-${String(total + 1).padStart(6, "0")}`;

        const newUser = await createUser(
          {
            organizationId,
            email: data.email,
            password: hashedPassword,
            role: "staff",
          },
          tx
        );

        return await createStaff(
          {
            userId: newUser.id,
            departmentId: data.departmentId,
            positionId: data.positionId,
            staffNumber,
            firstName: data.firstName,
            middleName: data.middleName,
            lastName: data.lastName,
            gender: data.gender,
            dateOfBirth: new Date(data.dateOfBirth),
            phone: data.phone,
            employmentDate: new Date(data.employmentDate),
            qualification: data.qualification,
            licenseNumber: data.licenseNumber,
            profilePhotoUrl: data.profilePhotoUrl,
          },
          tx
        );
      });
      break;
    } catch (error) {
      if (error.code === "P2002" && attempt < 4) {
        continue;
      }
      throw error;
    }
  }

  await auditLogger({
    organizationId,
    userId: user.id,
    action: "CREATE",
    entity: "Staff",
    entityId: result.id,
    description: `Created staff ${result.firstName} ${result.lastName} (${staffNumber}).`,
  });

  return result;
}

export async function getOrganizationStaff(organizationId, user, query = {}) {
  if (user.role !== "super_admin" && organizationId && organizationId !== user.organizationId) {
    throw new AppError("Access denied. You can only access your own organization's data.", 403);
  }
  // null means "all organizations" for super_admin; the repository
  // only filters by organizationId when it is provided.
  const resolvedOrgId =
    user.role === "super_admin"
      ? organizationId ?? null
      : user.organizationId;

  const runner = resolvedOrgId
    ? (callback) => withTenant(resolvedOrgId, callback)
    : withSuperAdmin;

  const { page, limit } = getPagination(query);

  const { items, total } = await runner(async (tx) => {
    return await findStaffByOrganization(resolvedOrgId, query, tx);
  });

  if (user.role === "student") {
    const safeItems = items.map((staff) => ({
      id: staff.id,
      firstName: staff.firstName,
      middleName: staff.middleName,
      lastName: staff.lastName,
      gender: staff.gender,
      qualification: staff.qualification,
      licenseNumber: staff.licenseNumber,
      employmentStatus: staff.employmentStatus,
      profilePhotoUrl: staff.profilePhotoUrl,
      department: staff.department,
      position: staff.position,
    }));

    return {
      items: safeItems,
      pagination: buildPaginationMeta({ page, limit, total }),
    };
  }

  return { items, pagination: buildPaginationMeta({ page, limit, total }) };
}

export async function getStaffById(id, user) {
  const scoped = resolveUserScope(user);

  const staff = await scoped(async (tx) => {
    return await findStaffById(id, tx);
  });

  if (!staff) {
    throw new AppError("Staff not found.", 404);
  }

  if (user.role !== "super_admin" && staff.user.organizationId !== user.organizationId) {
    throw new AppError("Staff not found.", 404);
  }

  return staff;
}

export async function updateExistingStaff(id, data, user) {
  const scoped = resolveUserScope(user);

  const staff = await scoped(async (tx) => {
    return await findStaffById(id, tx);
  });

  if (!staff) {
    throw new AppError("Staff not found.", 404);
  }

  const organizationId =
    user.role === "super_admin"
      ? data.organizationId ?? staff.user.organizationId
      : user.organizationId;

  if (staff.user.organizationId !== organizationId) {
    throw new AppError("Staff not found.", 404);
  }

  const updated = await withTenant(organizationId, async (tx) => {
    if (data.departmentId) {
      const department = await findDepartmentById(data.departmentId, tx);
      if (!department || department.organizationId !== organizationId) {
        throw new AppError("Department not found.", 404);
      }
    }

    if (data.positionId) {
      const position = await findPositionById(data.positionId, tx);
      if (!position || position.organizationId !== organizationId) {
        throw new AppError("Position not found.", 404);
      }
    }

    const updateData = {};
    const allowedFields = [
      "firstName", "middleName", "lastName", "gender", "dateOfBirth",
      "phone", "departmentId", "positionId", "qualification",
      "licenseNumber", "profilePhotoUrl", "employmentStatus",
      "employmentDate",
    ];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updateData[field] = field === "dateOfBirth" || field === "employmentDate"
          ? new Date(data[field])
          : data[field];
      }
    }

    return await updateStaff(id, updateData, tx);
  });

  await auditLogger({
    organizationId: staff.user.organizationId,
    userId: user.id,
    action: "UPDATE",
    entity: "Staff",
    entityId: id,
    description: `Updated staff ${staff.firstName} ${staff.lastName} (${staff.staffNumber}).`,
  });

  return updated;
}

export async function removeStaff(id, user) {
  const scoped = resolveUserScope(user);

  const staff = await scoped(async (tx) => {
    return await findStaffById(id, tx);
  });

  if (!staff) {
    throw new AppError("Staff not found.", 404);
  }

  if (user.role !== "super_admin" && staff.user.organizationId !== user.organizationId) {
    throw new AppError("Staff not found.", 404);
  }

  try {
    await withTenant(staff.user.organizationId, async (tx) => {
      await deleteStaff(id, tx);
      await tx.user.update({
        where: { id: staff.userId },
        data: { isActive: false },
      });
    });
  } catch (error) {
    if (error.code === "P2003") {
      throw new AppError(
        "Cannot delete staff because they are referenced by appointments, schedules, or other records.",
        409
      );
    }
    throw error;
  }

  await auditLogger({
    organizationId: staff.user.organizationId,
    userId: user.id,
    action: "DELETE",
    entity: "Staff",
    entityId: id,
    description: `Deleted staff ${staff.firstName} ${staff.lastName} (${staff.staffNumber}).`,
  });
}