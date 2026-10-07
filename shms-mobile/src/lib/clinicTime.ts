import { CLINIC_UTC_OFFSET_MINUTES } from '@/config';

/**
 * SHMS stores appointment times as the clinic's wall-clock time encoded as a
 * UTC instant, and the server reads them back on Africa/Lagos time. The phone
 * may be on any time zone, so every conversion here uses the clinic offset,
 * never the device's.
 */
const OFFSET_MS = CLINIC_UTC_OFFSET_MINUTES * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');

/** Clinic-local parts of an instant: { date: 'YYYY-MM-DD', time: 'HH:MM' }. */
export function toClinicParts(iso: string | Date): { date: string; time: string } {
  const shifted = new Date(new Date(iso).getTime() + OFFSET_MS);
  return {
    date: `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    time: `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`,
  };
}

/** The UTC ISO instant for a clinic-local date ('YYYY-MM-DD') and time ('HH:MM'). */
export function fromClinicParts(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, h, min) - OFFSET_MS).toISOString();
}

/** Today's date at the clinic. */
export function clinicToday(): string {
  return toClinicParts(new Date()).date;
}

/** The current clinic time 'HH:MM'. */
export function clinicNowTime(): string {
  return toClinicParts(new Date()).time;
}

/** The next `count` clinic dates starting today. */
export function nextClinicDates(count: number): string[] {
  const [y, m, d] = clinicToday().split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  });
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'Wed 8 Oct' for a clinic date 'YYYY-MM-DD'. */
export function formatClinicDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${DAYS[dt.getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}

/** '9:30 AM' for 'HH:MM'. */
export function formatTime(time: string): string {
  const [h, min] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${pad(min)} ${suffix}`;
}

/** 'Wed 8 Oct, 9:30 AM' (clinic time) for an instant. */
export function formatClinicDateTime(iso: string): string {
  const { date, time } = toClinicParts(iso);
  return `${formatClinicDate(date)}, ${formatTime(time)}`;
}
