import prisma from "../config/db.js";
import AppError from "../utils/AppError.js";
import {
  resolveOrganizationId,
} from "../utils/tenantAccess.js";
import { auditLogger } from "../utils/auditLogger.js";

import validateSchedule from "../utils/scheduleValidator.js";

import {
  getPagination,
  buildPaginationMeta,
} from "../utils/pagination.js";

import {
  findOrganizationById,
} from "../repositories/organization.repository.js";

import {
  findMedicalRecordById,
} from "../repositories/medical-record.repository.js";

import {
  findServiceById,
} from "../repositories/service.repository.js";

import {
  findStaffById,
} from "../repositories/staff.repository.js";

import {
  createAppointment,
  findAppointmentsByOrganization,
  findAppointmentsByStudent,
  findAppointmentByStaffAndDate,
  findAppointmentsForStaffOnDate,
  findAppointmentById,
  updateAppointment,
  deleteAppointment,
} from "../repositories/appointment.repository.js";

const ALLOWED_TRANSITIONS = {
  scheduled: ["confirmed", "cancelled", "no_show"],
  confirmed: ["checked_in", "in_progress", "cancelled", "no_show"],
  checked_in: ["in_progress", "cancelled", "no_show", "completed"],
  in_progress: ["completed", "cancelled", "no_show"],
  completed: [],
  cancelled: [],
  no_show: [],
};

function validateAppointmentDate(date) {
  if (Number.isNaN(date.getTime())) {
    throw new AppError("Invalid appointment date.", 400);
  }
  if (date <= new Date()) {
    throw new AppError("Appointment date must be in the future.", 400);
  }
}

function assertValidTransition(from, to) {
  if (from === to) return;

  const allowed = ALLOWED_TRANSITIONS[from] || [];

  if (!allowed.includes(to)) {
    throw new AppError(
      `Appointment status cannot change from "${from}" to "${to}".`,
      400
    );
  }
}

async function validateMedicalRecord(medicalRecordId, organizationId, db = prisma) {
  const medicalRecord = await findMedicalRecordById(medicalRecordId, db);

  if (!medicalRecord) {
    throw new AppError("Medical record not found.", 404);
  }

  if (medicalRecord.profile.user.organizationId !== organizationId) {
    throw new AppError("Medical record not found.", 404);
  }

  if (medicalRecord.status === "archived") {
    throw new AppError("Medical record is archived.", 400);
  }

  return medicalRecord;
}

async function validateService(serviceId, organizationId, db = prisma) {
  const service = await findServiceById(serviceId, db);

  if (!service) {
    throw new AppError("Clinical service not found.", 404);
  }

  if (!service.isActive) {
    throw new AppError("Clinical service is inactive.", 400);
  }

  if (service.organizationId !== organizationId) {
    throw new AppError("Clinical service not found.", 404);
  }

  return service;
}

async function validateStaff(staffId, organizationId, db = prisma) {
  const staff = await findStaffById(staffId, db);

  if (!staff) {
    throw new AppError("Staff not found.", 404);
  }

  if (!staff.user.isActive) {
    throw new AppError("Staff account is inactive.", 400);
  }

  if (staff.user.organizationId !== organizationId) {
    throw new AppError("Staff not found.", 404);
  }

  return staff;
}

async function validateScheduleAndConflict(staffId, appointmentDate, organizationId, excludeAppointmentId = null, durationMinutes = 30, db = prisma) {
  const staff = await validateStaff(staffId, organizationId, db);

  await validateSchedule(staff, appointmentDate, db);

  const newStart = appointmentDate.getTime();
  const newEnd = newStart + durationMinutes * 60 * 1000;

  const conflicts = await findAppointmentsForStaffOnDate(
    staffId,
    appointmentDate,
    excludeAppointmentId,
    db
  );

  for (const appointment of conflicts) {
    const existingStart = appointment.appointmentDate.getTime();
    const existingEnd = existingStart + (appointment.service?.estimatedDuration || 30) * 60 * 1000;

    if (newStart < existingEnd && existingStart < newEnd) {
      throw new AppError("Staff already has an appointment at this time.", 409);
    }
  }
}

function resolveOrgId(user, dataOrgId) {
  return user.role === "super_admin" ? dataOrgId : user.organizationId;
}

/**
 * Create a new appointment.
 */
export async function createNewAppointment(data, user) {
  const organizationId = resolveOrgId(user, data.organizationId);

  if (!organizationId) {
    throw new AppError("Organization ID is required.", 400);
  }

  const appointmentDate = new Date(data.appointmentDate);
  validateAppointmentDate(appointmentDate);

  return await prisma.$transaction(async (tx) => {
    const organization = await findOrganizationById(organizationId, tx);

    if (!organization) {
      throw new AppError("Organization not found.", 404);
    }

    const medicalRecord = await validateMedicalRecord(data.medicalRecordId, organizationId, tx);

    if (user.role === "student" && medicalRecord.profile.user.id !== user.id) {
      throw new AppError("Medical record not found.", 404);
    }

    const service = await validateService(data.serviceId, organizationId, tx);

    if (data.staffId) {
      await validateScheduleAndConflict(data.staffId, appointmentDate, organizationId, null, service.estimatedDuration, tx);
    }

    const appointment = await createAppointment({
      organizationId,
      medicalRecordId: data.medicalRecordId,
      serviceId: data.serviceId,
      staffId: data.staffId || null,
      appointmentDate,
      reason: data.reason,
    }, tx);

    await auditLogger({
      organizationId,
      userId: user.id,
      action: "CREATE",
      entity: "Appointment",
      entityId: appointment.id,
      description: `Appointment booked for ${appointmentDate.toISOString()}.`,
    });

    return appointment;
  });
}

/**
 * Get paginated appointments for an organization.
 */
export async function getAppointmentById(id, organizationId, user) {
  const resolvedOrgId = resolveOrganizationId(organizationId, user);

  const appointment = await findAppointmentById(id);

  if (!appointment || appointment.organizationId !== resolvedOrgId) {
    throw new AppError("Appointment not found.", 404);
  }

  return appointment;
}

export async function updateExistingAppointment(id, data, user) {
  const appointment = await findAppointmentById(id);

  if (!appointment) {
    throw new AppError("Appointment not found.", 404);
  }

  const organizationId =
    user.role === "super_admin"
      ? (data.organizationId ?? appointment.organizationId)
      : user.organizationId;

  if (appointment.organizationId !== organizationId) {
    throw new AppError("Appointment not found.", 404);
  }

  if (data.status !== undefined) {
    assertValidTransition(appointment.status, data.status);
  }

  return await prisma.$transaction(async (tx) => {
    const updateData = {};

    if (data.appointmentDate !== undefined) {
      const date = new Date(data.appointmentDate);
      validateAppointmentDate(date);
      updateData.appointmentDate = date;
    }

    if (data.serviceId !== undefined) {
      await validateService(data.serviceId, organizationId, tx);
      updateData.serviceId = data.serviceId;
    }

    if (data.staffId !== undefined) {
      if (data.staffId === null) {
        updateData.staffId = null;
      } else {
        await validateStaff(data.staffId, organizationId, tx);
        updateData.staffId = data.staffId;
      }
    }

    if (data.reason !== undefined) updateData.reason = data.reason;
    if (data.status !== undefined) updateData.status = data.status;

    const assignedStaffId =
      updateData.staffId !== undefined ? updateData.staffId : appointment.staffId;
    const assignedDate = updateData.appointmentDate ?? appointment.appointmentDate;

    const staffChanged = updateData.staffId !== undefined;
    const dateChanged = updateData.appointmentDate !== undefined;

    if (assignedStaffId && (staffChanged || dateChanged)) {
      const service = appointment.service || await validateService(appointment.serviceId, organizationId, tx);
      await validateScheduleAndConflict(assignedStaffId, assignedDate, organizationId, id, service.estimatedDuration, tx);
    }

    const updated = await updateAppointment(id, updateData, tx);

    // Keep the linked queue in sync when an appointment is cancelled or marked no-show.
    if ((data.status === "cancelled" || data.status === "no_show") && appointment.queue) {
      await tx.queue.update({
        where: { id: appointment.queue.id },
        data: { status: "cancelled" },
      });
    }

    await auditLogger({
      organizationId,
      userId: user.id,
      action: "UPDATE",
      entity: "Appointment",
      entityId: id,
      description: `Appointment ${id} updated.`,
    });

    return updated;
  });
}

export async function removeAppointment(id, user) {
  const appointment = await findAppointmentById(id);

  if (!appointment) {
    throw new AppError("Appointment not found.", 404);
  }

  if (user.role !== "super_admin" && appointment.organizationId !== user.organizationId) {
    throw new AppError("Appointment not found.", 404);
  }

  try {
    await deleteAppointment(id);
  } catch (error) {
    if (error.code === "P2003") {
      throw new AppError(
        "Cannot delete appointment because it is referenced by other records.",
        409
      );
    }
    throw error;
  }

  await auditLogger({
    organizationId: appointment.organizationId,
    userId: user.id,
    action: "DELETE",
    entity: "Appointment",
    entityId: id,
    description: `Appointment ${id} deleted.`,
  });
}

export async function getOrganizationAppointments(
  organizationId,
  user,
  query = {}
) {
  const resolvedOrgId =
    resolveOrganizationId(
      organizationId,
      user
    );

  const organization =
    await findOrganizationById(
      resolvedOrgId
    );

  if (!organization) {
    throw new AppError(
      "Organization not found.",
      404
    );
  }

  const {
    page,
    limit,
    skip,
  } = getPagination(query);

  const {
    items,
    total,
  } = await findAppointmentsByOrganization(
    resolvedOrgId,
    query
  );

  return {
    items,
    pagination: buildPaginationMeta({
      page,
      limit,
      total,
    }),
  };
}

export async function getMyAppointments(user, query = {}) {
  const {
    page,
    limit,
  } = getPagination(query);

  const {
    items,
    total,
  } = await findAppointmentsByStudent(
    user.id,
    query
  );

  return {
    items,
    pagination: buildPaginationMeta({
      page,
      limit,
      total,
    }),
  };
}