import { qs, request } from '@/api/client';
import type { Paginated } from '@/api/types';

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'checked_in'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type QueueStatus = 'waiting' | 'called' | 'in_progress' | 'completed' | 'cancelled';

/** Staff fields exposed to students (toPublicStaff). */
export interface PublicStaff {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  qualification?: string | null;
  department?: { id: string; name: string };
  position?: { id: string; name: string };
}

export interface Service {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  estimatedDuration?: number | null;
}

export interface PrescriptionItem {
  id: string;
  medicationName: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: number;
  instructions?: string | null;
}

/** An item of GET /appointments/my (with service, staff, queue → consultation → prescription). */
export interface Appointment {
  id: string;
  organizationId: string;
  serviceId: string;
  staffId: string | null;
  appointmentDate: string;
  reason: string | null;
  status: AppointmentStatus;
  service: Service | null;
  staff: PublicStaff | null;
  queue: {
    id: string;
    queueNumber: number;
    queueDate: string;
    status: QueueStatus;
    consultation: {
      id: string;
      chiefComplaint: string | null;
      symptoms: string | null;
      diagnosis: string | null;
      treatmentPlan: string | null;
      notes: string | null;
      consultationDate?: string | null;
      prescription: { id: string; createdAt: string; items: PrescriptionItem[] } | null;
    } | null;
  } | null;
}

export interface AvailableDoctor extends PublicStaff {
  hasAvailableSlots: boolean;
  availableSlotCount: number;
}

export interface MyQueue {
  id: string;
  queueNumber: number;
  status: QueueStatus;
  estimatedWaitMinutes: number;
  appointmentId: string;
  appointmentStatus: AppointmentStatus | null;
  patientsAhead: number;
  currentServing: { queueNumber: number; status: QueueStatus } | null;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
}

/** Every page of a paginated endpoint (limit 100 per page). */
async function allPages<T>(path: string, params: Record<string, string | undefined> = {}): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; ; page += 1) {
    const res = await request<Paginated<T>>('GET', `${path}${qs({ ...params, page, limit: 100 })}`);
    all.push(...res.items);
    if (!res.pagination?.hasNextPage) return all;
  }
}

/** The student's medical record id, created on first use (booking needs one). */
export async function ensureMedicalRecordId(): Promise<string> {
  const existing = await request<{ id: string } | null>('GET', '/medical-records/me');
  if (existing?.id) return existing.id;
  const created = await request<{ id: string }>('POST', '/medical-records/me');
  return created.id;
}

export const services = (organizationId: string) =>
  allPages<Service>(`/services/organization/${organizationId}`);

export const availableDoctors = (date: string, serviceId?: string) =>
  request<{ doctors: AvailableDoctor[]; message: string | null }>(
    'GET',
    `/appointments/doctors/available${qs({ date, serviceId })}`
  );

export const slots = (staffId: string, date: string, serviceId?: string) =>
  request<{ slots: { time: string; available: boolean }[]; message: string | null; hasSchedule: boolean }>(
    'GET',
    `/appointments/slots/${staffId}/${date}${qs({ serviceId })}`
  );

export const bookAppointment = (body: {
  organizationId: string;
  medicalRecordId: string;
  serviceId: string;
  staffId?: string;
  appointmentDate: string;
  reason?: string;
}) => request<Appointment>('POST', '/appointments', body);

export const myAppointments = () => allPages<Appointment>('/appointments/my');

/** Move an appointment to another time (and optionally another doctor). */
export const rescheduleAppointment = (id: string, appointmentDate: string, staffId: string) =>
  request<Appointment>('POST', `/appointments/${id}/reschedule`, { appointmentDate, staffId });

export const cancelAppointment = (id: string, reason: string) =>
  request<Appointment>('POST', `/appointments/${id}/cancel`, { reason });

export const checkIn = (appointmentId: string) =>
  request<{ id: string; queueNumber: number }>('POST', '/queues/check-in', { appointmentId });

export const myQueue = () => request<MyQueue | null>('GET', '/queues/my');

export const notifications = (page = 1) =>
  request<Paginated<Notification> & { unreadCount: number }>('GET', `/notifications${qs({ page, limit: 30 })}`);

export const markNotificationRead = (id: string) => request<unknown>('PUT', `/notifications/${id}/read`);

export const markAllNotificationsRead = () => request<unknown>('POST', '/notifications/read-all');
