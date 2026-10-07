import { qs, request } from '@/api/client';
import type { Appointment, PrescriptionItem, QueueStatus } from '@/api/student';
import type { Paginated, Profile } from '@/api/types';

export interface DashboardSummary {
  counts: {
    profiles: number;
    staff: number;
    appointments: number;
    appointmentsToday: number;
    consultations: number;
    [key: string]: number;
  };
  appointmentStatusCounts: { status: string; count: number }[];
  queueStatusCounts: { status: string; count: number }[];
}

/** An item of GET /queues/today/:orgId. */
export interface QueueEntry {
  id: string;
  queueNumber: number;
  queueDate: string;
  status: QueueStatus;
  estimatedWaitMinutes: number | null;
  checkedInAt: string | null;
  calledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  appointmentId: string;
  appointment: {
    id: string;
    reason: string | null;
    status: string;
    appointmentDate: string;
    service: { id: string; name: string } | null;
    staff: { id: string; firstName: string; lastName: string } | null;
    medicalRecord: { id: string; recordNumber?: string | null; profile: Profile | null } | null;
  } | null;
}

/** Organization appointment (GET /appointments/organization/:orgId). */
export interface OrgAppointment extends Omit<Appointment, 'staff'> {
  staff: { id: string; firstName: string; lastName: string } | null;
  medicalRecord: { id: string; profile: Profile | null } | null;
}

export interface Consultation {
  id: string;
  queueId: string;
  chiefComplaint: string | null;
  symptoms: string | null;
  diagnosis: string | null;
  treatmentPlan: string | null;
  notes: string | null;
}

export type ConsultationFields = Pick<
  Consultation,
  'chiefComplaint' | 'symptoms' | 'diagnosis' | 'treatmentPlan' | 'notes'
>;

export interface Prescription {
  id: string;
  consultationId: string;
  items: PrescriptionItem[];
}

export type NewPrescriptionItem = Omit<PrescriptionItem, 'id'>;

async function allPages<T>(path: string, params: Record<string, string | undefined> = {}): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; ; page += 1) {
    const res = await request<Paginated<T>>('GET', `${path}${qs({ ...params, page, limit: 100 })}`);
    all.push(...res.items);
    if (!res.pagination?.hasNextPage) return all;
  }
}

export const dashboard = (organizationId: string) =>
  request<DashboardSummary>('GET', `/dashboard${qs({ organizationId })}`);

/** Appointments of the organization on one clinic date (YYYY-MM-DD). */
export const appointmentsOn = (organizationId: string, date: string) =>
  allPages<OrgAppointment>(`/appointments/organization/${organizationId}`, {
    appointmentDate: date,
    sort: 'appointmentDate',
    order: 'asc',
  });

export const confirmAppointment = (id: string) =>
  request<OrgAppointment>('PATCH', `/appointments/${id}`, { status: 'confirmed' });

/** Today's queue, including consultations still open from earlier days. */
export const todayQueue = (organizationId: string) => allPages<QueueEntry>(`/queues/today/${organizationId}`);

export const queueEntry = (id: string) => request<QueueEntry>('GET', `/queues/${id}`);

export const callNext = (organizationId: string) =>
  request<QueueEntry>('POST', `/queues/call-next/${organizationId}`);

/** Skip a called patient (the ticket is closed). */
export const skipPatient = (organizationId: string, queueId: string) =>
  request<QueueEntry>('POST', `/queues/skip/${organizationId}`, { queueId });

export const startVisit = (queueId: string) => request<QueueEntry>('PATCH', `/queues/${queueId}/start`);

export const completeVisit = (queueId: string) => request<QueueEntry>('PATCH', `/queues/${queueId}/complete`);

export async function consultationForQueue(queueId: string): Promise<Consultation | null> {
  const res = await request<Paginated<Consultation>>('GET', `/consultations${qs({ queueId, limit: 1 })}`);
  return res.items.find((c) => c.queueId === queueId) ?? null;
}

export const createConsultation = (queueId: string, fields: Partial<ConsultationFields>) =>
  request<Consultation>('POST', '/consultations', { queueId, ...fields });

export const updateConsultation = (id: string, fields: Partial<ConsultationFields>) =>
  request<Consultation>('PATCH', `/consultations/${id}`, fields);

export async function prescriptionForConsultation(consultationId: string): Promise<Prescription | null> {
  const res = await request<Paginated<Prescription & { consultation?: { id: string } }>>(
    'GET',
    `/prescriptions${qs({ consultationId, limit: 1 })}`
  );
  const found = res.items.find((p) => (p.consultationId ?? p.consultation?.id) === consultationId);
  return found ?? null;
}

export const createPrescription = (consultationId: string, items: NewPrescriptionItem[]) =>
  request<Prescription>('POST', '/prescriptions', { consultationId, items });

export const updatePrescription = (id: string, items: NewPrescriptionItem[]) =>
  request<Prescription>('PATCH', `/prescriptions/${id}`, { items });

/** A student's medical record as GET /medical-records returns it (profile-level). */
export interface PatientRecord {
  id: string;
  recordNumber?: string | null;
  status: string;
  createdAt?: string;
  profile: (Profile & { user?: { email: string | null; isActive?: boolean } }) | null;
}

/** Patient records (students) of the organization, optionally searched. */
export const patientRecords = (search: string) =>
  request<Paginated<PatientRecord>>('GET', `/medical-records${qs({ search: search || undefined, limit: 30 })}`);

export type StaffAppointmentAction = 'confirmed' | 'cancelled' | 'no_show';

/** Status change by staff; the API enforces which transitions are allowed. */
export const setAppointmentStatus = (id: string, status: StaffAppointmentAction) =>
  request<OrgAppointment>('PATCH', `/appointments/${id}`, { status });

/** One page of organization appointments with the filters the API supports. */
export const appointmentsPage = (
  organizationId: string,
  filters: { date?: string; status?: string; search?: string; page: number; order: 'asc' | 'desc' }
) =>
  request<Paginated<OrgAppointment>>(
    'GET',
    `/appointments/organization/${organizationId}${qs({
      appointmentDate: filters.date,
      status: filters.status,
      search: filters.search,
      sort: 'appointmentDate',
      order: filters.order,
      page: filters.page,
      limit: 20,
    })}`
  );

/** Most recently created patient records of the organization. */
export const recentPatientRecords = () =>
  request<Paginated<PatientRecord>>('GET', `/medical-records${qs({ sort: 'createdAt', order: 'desc', limit: 20 })}`);

/** One patient record (profile-level details, as on the web). */
export const patientRecord = (id: string) => request<PatientRecord>('GET', `/medical-records/${id}`);
