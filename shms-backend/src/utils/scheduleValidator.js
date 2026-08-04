import prisma from "../config/db.js";
import AppError from "./AppError.js";

import {
  findSchedulesByStaff,
} from "../repositories/schedule.repository.js";

/**
 * Validate whether a staff member is available
 * for an appointment.
 */
export default async function validateSchedule(
  staff,
  appointmentDate,
  db = prisma
) {
  if (!staff) {
    throw new AppError("Staff not found.", 404);
  }

  if (staff.employmentStatus !== "active") {
    throw new AppError(
      "Selected staff is not active.",
      400
    );
  }

  const schedules = await findSchedulesByStaff(
  staff.id,
  db
);

  if (!schedules.length) {
    throw new AppError(
      "Staff has no working schedule.",
      400
    );
  }

  const date = new Date(appointmentDate);

  const days = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];

  const dayOfWeek = days[date.getDay()];

  const schedule = schedules.find(
    (item) =>
      item.dayOfWeek === dayOfWeek &&
      item.isActive
  );

  if (!schedule) {
    throw new AppError(
      `Staff is not scheduled to work on ${dayOfWeek}.`,
      400
    );
  }

  const appointmentMinutes =
    date.getHours() * 60 +
    date.getMinutes();

  const start =
    new Date(schedule.startTime);

  const end =
    new Date(schedule.endTime);

  const startMinutes =
    start.getHours() * 60 +
    start.getMinutes();

  const endMinutes =
    end.getHours() * 60 +
    end.getMinutes();

  if (
    appointmentMinutes < startMinutes ||
    appointmentMinutes >= endMinutes
  ) {
    throw new AppError(
      "Appointment is outside staff working hours.",
      400
    );
  }

  if (
    schedule.breakStart &&
    schedule.breakEnd
  ) {
    const breakStart =
      new Date(schedule.breakStart);

    const breakEnd =
      new Date(schedule.breakEnd);

    const breakStartMinutes =
      breakStart.getHours() * 60 +
      breakStart.getMinutes();

    const breakEndMinutes =
      breakEnd.getHours() * 60 +
      breakEnd.getMinutes();

    if (
      appointmentMinutes >= breakStartMinutes &&
      appointmentMinutes < breakEndMinutes
    ) {
      throw new AppError(
        "Appointment falls within staff break period.",
        400
      );
    }
  }

  return true;
}