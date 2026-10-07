import type { Appointment } from '@/api/student';

/** Statuses of an appointment that is still ahead or in progress. */
export const OPEN_STATUSES = ['scheduled', 'confirmed', 'checked_in', 'in_progress'];

export function doctorName(a: Pick<Appointment, 'staff'>): string {
  return a.staff ? `Dr ${a.staff.firstName} ${a.staff.lastName}` : 'Any available doctor';
}
