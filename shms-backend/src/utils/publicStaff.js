/**
 * Patient-facing (student) projection of a Staff row.
 *
 * Students only need enough to recognise and choose a doctor. Personal and
 * HR/identity fields (dateOfBirth, phone, gender, licenseNumber,
 * employmentDate, staffNumber - a login identifier - userId and the linked
 * user/email) must never reach a student response.
 * department/position are reduced to id+name (the Department row also
 * carries phone/email) and are only emitted when the source row included them.
 */
export function toPublicStaff(staff) {
  if (!staff) return null;

  const out = {
    id: staff.id,
    firstName: staff.firstName,
    middleName: staff.middleName ?? null,
    lastName: staff.lastName,
    qualification: staff.qualification ?? null,
    profilePhotoUrl: staff.profilePhotoUrl ?? null,
    employmentStatus: staff.employmentStatus,
  };

  if (staff.department) {
    out.department = { id: staff.department.id, name: staff.department.name };
  }

  if (staff.position) {
    out.position = { id: staff.position.id, name: staff.position.name };
  }

  return out;
}

/**
 * Copy of an appointment whose embedded `staff` relation is replaced by the
 * public projection. Appointments without a `staff` key are returned as-is.
 */
export function withPublicStaff(appointment) {
  if (!appointment || !("staff" in appointment)) return appointment;
  return { ...appointment, staff: toPublicStaff(appointment.staff) };
}
