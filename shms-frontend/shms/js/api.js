/*
|--------------------------------------------------------------------------
| SHMS API client.
|
| Thin adapter over the real REST API (http://localhost:5000/api/v1).
| Every method resolves with the server's JSON body ({ success, message, data })
| while translating backend shapes into the display shapes the pages expect.
|--------------------------------------------------------------------------
*/
const API = (() => {
  const BASE_URL = (window.SHMS_API_BASE || (window.location && window.location.origin ? `${window.location.origin}/api/v1` : '/api/v1')).replace(/\/$/, '');
  const TOKEN_KEY = 'shms_token';
  const USER_KEY = 'shms_user';

  const _token = () => localStorage.getItem(TOKEN_KEY);
  const _user = () => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  };
  const _orgId = () => {
    const u = _user();
    return u && (u.organizationId || u.organization?.id) ? (u.organizationId || u.organization.id) : null;
  };
  const _role = () => {
    const u = _user();
    return u ? u.role : null;
  };

  /* Cache of resolved master data used by the booking flow. */
  let servicesCache = [];
  let staffCache = [];
  let queueIdByTicket = {};

  const _request = async (method, endpoint, body) => {
    const headers = { 'Content-Type': 'application/json' };
    const token = _token();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const fetchOptions = { method, headers };
    if (body !== undefined && body !== null) {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    let res;
    try {
      res = await fetch(`${BASE_URL}${endpoint}`, fetchOptions);
    } catch (err) {
      throw new Error('Unable to reach the server. Is the backend running?');
    }

    let data = null;
    try { data = await res.json(); } catch (e) { /* empty body */ }

    if (!res.ok) {
      if (res.status === 401) {
        try {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
        } catch (e) { /* ignore */ }
      }
      const message = data && data.message ? data.message : `Request failed (HTTP ${res.status})`;
      throw new Error(message);
    }

    if (data && typeof data === 'object' && !('success' in data)) {
      data = { success: true, data };
    }

    return data || { success: true, data: null };
  };

  /* Fetch every page of a paginated list endpoint using the backend
     `pagination.hasNextPage` metadata. Falls back to treating the whole
     response as the list for non-paginated callers. `limit` caps each
     page's size (backend max 100); `onPage` receives each page's
     `pagination` meta so callers can capture the true record `total`. */
  const _allPages = async (endpoint, limit, onPage) => {
    const all = [];
    let page = 1;
    let hasNextPage = false;
    do {
      const params = [];
      if (page > 1) params.push(`page=${page}`);
      if (limit) params.push(`limit=${limit}`);
      const suffix = params.length ? `?${params.join('&')}` : '';
      const res = await _request('GET', `${endpoint}${suffix}`);
      const data = res.data || {};
      const items = (data && data.items) || res.data || [];
      all.push(...items);
      hasNextPage = !!(data && data.pagination && data.pagination.hasNextPage);
      if (typeof onPage === 'function' && data && data.pagination) onPage(data.pagination);
      page += 1;
    } while (hasNextPage);
    return all;
  };

  /* ---------- small helpers ---------- */

  const _staffName = (staff) => {
    if (!staff) return 'Any available doctor';
    return `${staff.firstName || ''} ${staff.lastName || ''}`.trim() || 'Doctor';
  };

  const _splitDateTime = (iso) => {
    if (!iso) return { date: '', time: '' };
    const d = new Date(iso);
    if (isNaN(d.getTime())) return { date: String(iso).slice(0, 10), time: '' };
    const pad = (n) => String(n).padStart(2, '0');
    return {
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    };
  };

  const _mapAppointment = (a) => {
    const parts = _splitDateTime(a.appointmentDate);
    return {
      id: a.id,
      organizationId: a.organizationId,
      service: (a.service && a.service.name) || 'General Consultation',
      serviceId: a.serviceId,
      doctor_name: _staffName(a.staff),
      doctor: a.staff ? _staffName(a.staff) : 'Any available doctor',
      staffId: a.staffId,
      department: (a.medicalRecord && a.medicalRecord.profile && a.medicalRecord.profile.department) || '',
      date: parts.date,
      time: parts.time,
      appointmentDate: a.appointmentDate,
      status: a.status,
      reason: a.reason,
      diagnosis: (a.queue && a.queue.consultation && a.queue.consultation.diagnosis) || '',
      treatment: (a.queue && a.queue.consultation && a.queue.consultation.treatmentPlan) || '',
      notes: (a.queue && a.queue.consultation && a.queue.consultation.notes) || '',
      patient_name: a.medicalRecord && a.medicalRecord.profile
        ? `${a.medicalRecord.profile.firstName || ''} ${a.medicalRecord.profile.lastName || ''}`.trim()
        : '',
      matric: a.medicalRecord && a.medicalRecord.profile ? a.medicalRecord.profile.matricNumber : '',
      queueNumber: a.queue ? a.queue.queueNumber : null,
    };
  };

  const _mapNotification = (n) => ({
    id: n.id,
    title: n.title,
    message: n.message,
    type: n.type || 'general',
    read: !!n.read,
    created_at: n.createdAt,
    createdAt: n.createdAt,
  });

  const _mapStaffDoctor = (s) => {
    const name = _staffName(s);
    const qualification = s.qualification || (s.position && s.position.name) || '';
    return {
      id: s.id,
      name: name,
      first_name: s.firstName,
      last_name: s.lastName,
      specialization: qualification || 'Medical Officer',
      qualification: qualification,
      email: (s.user && s.user.email) || '',
      phone: s.phone || '',
      availability: s.employmentStatus === 'active' || s.employmentStatus === undefined,
      employmentStatus: s.employmentStatus,
      max_patients: 15,
      department: s.department ? s.department.name : '',
    };
  };

  const _mapPatient = (r) => {
    const p = (r.profile) || {};
    return {
      id: r.id,
      medicalRecordId: r.id,
      recordNumber: r.recordNumber,
      full_name: `${p.firstName || ''} ${p.middleName || ''} ${p.lastName || ''}`.replace(/\s+/g, ' ').trim(),
      matric: p.matricNumber || '',
      email: (p.user && p.user.email) || '',
      phone: p.phone || '',
      faculty: p.faculty || '',
      department: p.department || '',
      level: p.level || '',
      gender: p.gender || '',
      status: r.status || 'active',
    };
  };

  const _mapQueueEntry = (q) => {
    const profile = q.appointment && q.appointment.medicalRecord ? q.appointment.medicalRecord.profile : null;
    const patient = profile ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() : 'Patient';
    const ticket = '#' + String(q.queueNumber);
    const status = q.status === 'in_progress'
      ? 'in_consultation'
      : (q.status === 'called' ? 'checked_in' : (q.status === 'waiting' ? 'waiting' : q.status));
    const mapped = {
      ticket,
      queueId: q.id,
      patient,
      service: (q.appointment && q.appointment.service && q.appointment.service.name) || 'General',
      doctor: q.appointment && q.appointment.staff ? _staffName(q.appointment.staff) : '',
      status,
      estimated_wait_minutes: q.estimatedWaitMinutes || 0,
    };
    queueIdByTicket[ticket] = q.id;
    return mapped;
  };

  /* All of today's queue entries for the staff's organization, following the
     backend page metadata so a single response page is never mistaken for the
     whole day. `total` is the authoritative backend `pagination.total`; staff
     pages should never derive a "today" total from one page's `items` length. */
  const _todayQueue = async () => {
    const orgId = _orgId();
    if (!orgId) return { items: [], total: 0 };
    let total = 0;
    const items = await _allPages(`/queues/today/${orgId}`, 100, (pagination) => {
      total = pagination.total;
    });
    return { items, total };
  };

  const _servicesByName = async () => {
    const orgId = _orgId();
    if (!orgId) return {};
    if (servicesCache.length === 0) {
      const res = await _request('GET', `/services/organization/${orgId}`);
      servicesCache = (res.data && res.data.items) || res.data || [];
    }
    const map = {};
    servicesCache.forEach((s) => { map[s.name.toLowerCase()] = s; });
    return map;
  };

  const _staffById = async () => {
    const orgId = _orgId();
    if (!orgId) return {};
    if (staffCache.length === 0) {
      const res = await _request('GET', `/staff/organization/${orgId}`);
      staffCache = (res.data && res.data.items) || res.data || [];
    }
    const map = {};
    staffCache.forEach((s) => { map[s.id] = s; });
    return map;
  };

  const _medicalRecordId = async () => {
    const res = await _request('GET', '/medical-records/me');
    if (res.data && res.data.id) return res.data.id;
    const created = await _request('POST', '/medical-records/me');
    return created.data ? created.data.id : null;
  };

  const DAY_INDEX = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  /* ============================ PUBLIC API ============================ */

  return {
    setMockMode() {},
    getMockMode() { return false; },

    /* ---------- Auth ---------- */
    login: (credentials) => _request('POST', '/auth/login', credentials),
    register: (userData) => _request('POST', '/auth/register', userData),
    verifyToken: () => _request('GET', '/auth/verify'),
    forgotPassword: (email) => _request('POST', '/auth/forgot-password', { email }),
    resetPassword: (token, password) => _request('POST', '/auth/reset-password', { token, password }),

    /* ---------- Public ---------- */
    getActiveOrganizations: () => _request('GET', '/organizations/active'),
    /* All organizations (super_admin only, `/organizations` is gated by
       authorize("super_admin")). Pages through the backend metadata so the
       returned array is never truncated to a single page. Each item carries
       the organization id and name. */
    async getOrganizations() {
      const items = await _allPages('/organizations', 100);
      return { success: true, data: items };
    },

    /* ---------- Profile ---------- */
    async getProfile() {
      const res = await _request('GET', '/profiles/me');
      const u = res.data.user || res.data || {};
      const p = u.profile || {};
      return {
        success: true,
        data: {
          id: u.id,
          userId: u.id,
          full_name: `${p.firstName || ''} ${p.middleName || ''} ${p.lastName || ''}`.replace(/\s+/g, ' ').trim(),
          firstName: p.firstName || '',
          middleName: p.middleName || '',
          lastName: p.lastName || '',
          email: u.email || '',
          phone: p.phone || '',
          faculty: p.faculty || '',
          department: p.department || '',
          level: p.level || '',
          gender: p.gender || '',
          date_of_birth: p.dateOfBirth || '',
          matric_number: p.matricNumber || '',
          blood_group: p.bloodGroup || '',
          genotype: p.genotype || '',
          allergies: p.allergies || '',
          emergency_contact_name: p.emergencyContactName || '',
          emergency_contact_phone: p.emergencyContactPhone || '',
          joined: u.createdAt || '',
        },
      };
    },
    async updateProfile(data) {
      const body = {};
      const map = {
        firstName: 'firstName', middleName: 'middleName', lastName: 'lastName',
        faculty: 'faculty', department: 'department', level: 'level', gender: 'gender',
        dateOfBirth: 'dateOfBirth', phone: 'phone',
        emergencyContactName: 'emergencyContactName', emergencyContactPhone: 'emergencyContactPhone',
        bloodGroup: 'bloodGroup', genotype: 'genotype', allergies: 'allergies',
        profilePhotoUrl: 'profilePhotoUrl',
      };
      const snake = {
        matric_number: 'matricNumber', matricNumber: 'matricNumber',
        date_of_birth: 'dateOfBirth', blood_group: 'bloodGroup',
        emergency_contact_name: 'emergencyContactName', emergency_contact_phone: 'emergencyContactPhone',
      };
      Object.keys(data).forEach((key) => {
        if (key === 'full_name') {
          const parts = String(data[key] || '').split(/\s+/).filter(Boolean);
          if (parts.length) body.firstName = parts[0];
          if (parts.length > 1) body.lastName = parts[parts.length - 1];
          if (parts.length > 2) body.middleName = parts.slice(1, -1).join(' ');
        } else if (key in snake) {
          body[snake[key]] = data[key];
        } else if (key in map) {
          body[key] = data[key];
        }
      });
      await _request('PUT', '/profiles/me', body);
      const verify = await _request('GET', '/auth/verify');
      return { success: true, message: 'Profile updated successfully.', data: verify.data.user };
    },
    changePassword: (data) => _request('PUT', '/profiles/password', {
      currentPassword: data.currentPassword || data.current_password,
      newPassword: data.newPassword || data.new_password,
    }),

    /* ---------- Notifications ---------- */
    /* `filters` supports: { page, limit, read: true|false, type }
       Page reads first, then the accumulated items are appended by the caller.
       `unread_count` is the authoritative backend count (all unread for the
       user's organization), independent of the page actually loaded. */
    async getNotifications(filters) {
      const params = [];
      if (filters) {
        if (filters.page) params.push(`page=${filters.page}`);
        if (filters.limit) params.push(`limit=${filters.limit}`);
        if (filters.read === true || filters.read === false) params.push(`read=${filters.read}`);
        if (filters.type) params.push(`type=${encodeURIComponent(filters.type)}`);
      }
      const qs = params.length ? `?${params.join('&')}` : '';
      const res = await _request('GET', `/notifications${qs}`);
      const data = res.data || {};
      const rawItems = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);
      return {
        success: true,
        data: rawItems.map(_mapNotification),
        unread_count: (data && typeof data.unreadCount === 'number') ? data.unreadCount : 0,
        pagination: (data && data.pagination) || null,
      };
    },
    markNotificationRead: (id) => _request('PUT', `/notifications/${id}/read`),
    markAllNotificationsRead: () => _request('POST', '/notifications/read-all'),
    async getNotificationPrefs() {
      const res = await _request('GET', '/notifications/preferences');
      const p = res.data || {};
      return {
        success: true,
        data: {
          email_enabled: !!p.emailEnabled,
          whatsapp_enabled: !!p.whatsappEnabled,
          telegram_enabled: !!p.telegramEnabled,
          phone: p.phone || '',
          remind_before_hours: p.remindBeforeHours || 24,
          remind_for_appointment: p.remindForAppointment !== false,
          remind_for_queue: p.remindForQueue !== false,
          remind_for_results: p.remindForResults !== false,
        },
      };
    },
    async updateNotificationPrefs(data) {
      const body = {
        emailEnabled: !!data.email_enabled,
        whatsappEnabled: !!data.whatsapp_enabled,
        telegramEnabled: !!data.telegram_enabled,
        phone: data.phone || null,
        remindBeforeHours: parseInt(data.remind_before_hours) || 24,
        remindForAppointment: data.remind_for_appointment !== false,
        remindForQueue: data.remind_for_queue !== false,
        remindForResults: data.remind_for_results !== false,
      };
      const res = await _request('PUT', '/notifications/preferences', body);
      return {
        success: true,
        data: {
          email_enabled: !!res.data.emailEnabled,
          whatsapp_enabled: !!res.data.whatsappEnabled,
          telegram_enabled: !!res.data.telegramEnabled,
          phone: res.data.phone || '',
          remind_before_hours: res.data.remindBeforeHours || 24,
          remind_for_appointment: res.data.remindForAppointment !== false,
          remind_for_queue: res.data.remindForQueue !== false,
          remind_for_results: res.data.remindForResults !== false,
        },
      };
    },
    sendTestNotification: () => _request('POST', '/notifications/send-test'),
    /* Send an organization-wide broadcast (admin/super_admin only). Only the
       fields supported by the backend contract are sent. `organizationId` is
       meaningful solely for super_admin; the caller decides whether to include
       it. The backend remains authoritative for authorization and recipients. */
    async sendBroadcast(data) {
      const body = { title: data.title, message: data.message };
      if (data.type) body.type = data.type;
      if (data.role) body.role = data.role;
      if (data.organizationId) body.organizationId = data.organizationId;
      const res = await _request('POST', '/notifications/broadcast', body);
      return {
        success: true,
        data: {
          sentCount: res.data && typeof res.data.sentCount === 'number' ? res.data.sentCount : null,
        },
      };
    },

    /* ---------- Appointments ---------- */
    async getAppointments() {
      const role = _role();
      const orgId = _orgId();
      let items = [];
      if (role === 'student') {
        items = await _allPages('/appointments/my');
      } else {
        const res = await _request('GET', `/appointments/organization/${orgId}`);
        items = (res.data && res.data.items) || [];
      }
      return { success: true, data: items.map(_mapAppointment) };
    },
    async bookAppointment(data) {
      const orgId = _orgId();
      if (!orgId) throw new Error('Organization not found. Please log in again.');

      const services = await _servicesByName();
      const serviceName = (data.service || data.serviceName || '').toLowerCase();
      const service = services[serviceName];
      if (!service) {
        throw new Error('Please select a valid service.');
      }

      const medicalRecordId = await _medicalRecordId();
      if (!medicalRecordId) {
        throw new Error('Complete your medical profile first before booking.');
      }

      const staffMap = await _staffById();
      const staffId = data.doctor_id || data.staffId || data.doctorId || null;
      const resolvedStaffId = staffId && staffMap[staffId] ? staffId : null;

      const date = data.date || data.appointmentDate || '';
      const time = data.time || '09:00';
      const appointmentDate = date.includes('T')
        ? date
        : new Date(`${date}T${time}:00`).toISOString();

      return _request('POST', '/appointments', {
        organizationId: orgId,
        medicalRecordId,
        serviceId: service.id,
        ...(resolvedStaffId ? { staffId: resolvedStaffId } : {}),
        appointmentDate,
        ...(data.reason ? { reason: data.reason } : {}),
      });
    },
    async getAppointment(id) {
      const res = await _request('GET', `/appointments/${id}`);
      return { success: true, data: _mapAppointment(res.data) };
    },
    async updateAppointment(id, data) {
      const body = {};
      if (data.status) body.status = data.status;
      if (data.appointmentDate) body.appointmentDate = data.appointmentDate;
      if (data.date) {
        const time = data.time || '09:00';
        body.appointmentDate = new Date(`${data.date}T${time}:00`).toISOString();
      }
      if (data.serviceId) body.serviceId = data.serviceId;
      if (data.staffId !== undefined) body.staffId = data.staffId;
      if (data.reason !== undefined) body.reason = data.reason;
      const res = await _request('PATCH', `/appointments/${id}`, body);
      return { success: true, data: _mapAppointment(res.data) };
    },
    async getAppointmentHistory() {
      const role = _role();
      let items = [];
      if (role === 'student') {
        items = await _allPages('/appointments/my');
      } else {
        const orgId = _orgId();
        const res = await _request('GET', `/appointments/organization/${orgId}`);
        items = (res.data && res.data.items) || [];
      }
      const history = items
        .filter((a) => a.status === 'completed' || a.status === 'cancelled' || a.status === 'no_show')
        .map(_mapAppointment);
      return { success: true, data: history };
    },
    async cancelAppointment(id, reason) {
      const res = await _request('POST', `/appointments/${id}/cancel`, { reason });
      return { success: true, data: _mapAppointment(res.data) };
    },
    async rescheduleAppointment(id, data) {
      const date = data.date || data.appointmentDate || '';
      const time = data.time || '09:00';
      const appointmentDate = date.includes('T')
        ? date
        : new Date(`${date}T${time}:00`).toISOString();
      const body = { appointmentDate };
      if (data.staffId !== undefined) body.staffId = data.staffId;
      const res = await _request('POST', `/appointments/${id}/reschedule`, body);
      return { success: true, data: _mapAppointment(res.data) };
    },

    /* ---------- Queue ---------- */
    async getQueue() {
      const role = _role();
      if (role === 'student') {
        const res = await _request('GET', '/queues/my');
        const q = res.data;
        if (!q) {
          return {
            success: true,
            data: { ticket_number: '--', current_serving: '--', patients_ahead: 0, estimated_wait_minutes: 0, position: 0, status: 'none' },
          };
        }
        return {
          success: true,
          data: {
            ticket_number: '#' + String(q.queueNumber),
            current_serving: q.currentServing ? '#' + String(q.currentServing.queueNumber) : '--',
            patients_ahead: q.patientsAhead || 0,
            estimated_wait_minutes: q.estimatedWaitMinutes || 0,
            position: (q.patientsAhead || 0) + 1,
            status: q.status,
          },
        };
      }
      const { items } = await _todayQueue();
      const serving = items.find((q) => q.status === 'in_progress' || q.status === 'called');
      return {
        success: true,
        data: {
          current_serving: serving ? '#' + String(serving.queueNumber) : '--',
        },
      };
    },
    async getQueueList() {
      const role = _role();
      if (role === 'student') {
        const res = await _request('GET', '/queues/my');
        const q = res.data;
        if (!q) return { success: true, data: [] };
        return {
          success: true,
          data: [{ ticket: '#' + String(q.queueNumber), patient: 'You', service: '', doctor: '', status: 'waiting', queueId: q.id }],
        };
      }
      const { items, total } = await _todayQueue();
      return { success: true, data: items.map(_mapQueueEntry), total };
    },
    async checkIn(appointmentId) {
      const res = await _request('POST', '/queues/check-in', { appointmentId });
      return {
        success: true,
        data: {
          ticket: '#' + String(res.data.queueNumber),
          position: res.data.queueNumber,
          queueId: res.data.id,
          ...res.data,
        },
      };
    },
    async updateQueue(ticket, action, data) {
      const orgId = _orgId();
      if (action === 'call') {
        return _request('POST', `/queues/call-next/${orgId}`);
      }
      if (action === 'skip') {
        return _request('POST', `/queues/skip/${orgId}`);
      }
      if (action === 'start' || action === 'complete') {
        let queueId = queueIdByTicket[ticket] || (data && data.queueId) || null;
        if (!queueId) {
          const { items } = await _todayQueue();
          items.forEach(_mapQueueEntry);
          queueId = queueIdByTicket[ticket];
        }
        if (!queueId) throw new Error('Queue entry not found for ' + ticket);
        return _request('PATCH', `/queues/${queueId}/${action}`);
      }
      throw new Error(`Queue action "${action}" is not supported.`);
    },

    /* ---------- Doctors / Staff ---------- */
    async getDoctors() {
      const orgId = _orgId();
      const all = await _allPages(`/staff/organization/${orgId}`);
      staffCache = all;
      return { success: true, data: all.map(_mapStaffDoctor) };
    },
    async getAvailableDoctors() {
      const res = await this.getDoctors();
      return { success: true, data: res.data.filter((d) => d.availability) };
    },
    async addDoctor(data) {
      const orgId = _orgId();
      const deptRes = await _request('GET', `/departments/organization/${orgId}`);
      const posRes = await _request('GET', `/positions/organization/${orgId}`);
      const departments = (deptRes.data && deptRes.data.items) || deptRes.data || [];
      const positions = (posRes.data && posRes.data.items) || posRes.data || [];
      if (departments.length === 0) throw new Error('Create a department first.');
      if (positions.length === 0) throw new Error('Create a position first.');

      const nameParts = (data.name || '').split(/\s+/).filter(Boolean);
      if (nameParts.length < 2) throw new Error('Provide a full name (first and last).');

      const payload = {
        organizationId: orgId,
        departmentId: departments[0].id,
        positionId: positions[0].id,
        email: data.email || `${nameParts[0].toLowerCase()}.${nameParts[nameParts.length - 1].toLowerCase()}@health.edu`,
        password: 'Doctor@123',
        firstName: nameParts[0],
        middleName: null,
        lastName: nameParts[nameParts.length - 1],
        gender: 'Male',
        dateOfBirth: '1985-01-01',
        phone: data.phone || '08000000000',
        employmentDate: new Date().toISOString().slice(0, 10),
        qualification: data.specialization || 'Medical Officer',
      };
      return _request('POST', '/staff', payload);
    },
    async updateDoctor(id, data) {
      const body = {};
      if (data.firstName) body.firstName = data.firstName;
      if (data.lastName) body.lastName = data.lastName;
      if (data.name) {
        const parts = (data.name || '').split(/\s+/).filter(Boolean);
        body.firstName = parts[0];
        body.lastName = parts[parts.length - 1];
      }
      if (data.qualification !== undefined) body.qualification = data.qualification;
      if (data.specialization !== undefined) body.qualification = data.specialization;
      if (data.email !== undefined) body.email = data.email;
      if (data.phone !== undefined) body.phone = data.phone;
      if (data.availability !== undefined) {
        body.employmentStatus = data.availability ? 'active' : 'suspended';
      }
      return _request('PATCH', `/staff/${id}`, body);
    },
    deleteDoctor: (id) => _request('DELETE', `/staff/${id}`),

    /* ---------- Students ---------- */
    async getStudents() {
      const res = await _request('GET', '/medical-records');
      const items = (res.data && res.data.items) || res.data || [];
      return { success: true, data: items.map(_mapPatient) };
    },
    async getStudent(id) {
      const res = await _request('GET', `/medical-records/${id}`);
      return { success: true, data: _mapPatient(res.data) };
    },
    updateStudent: async (id, data) => _request('PATCH', `/medical-records/${id}`, data),
    deleteStudent: async (id) => _request('PATCH', `/medical-records/${id}`, { status: 'archived' }),
    archiveStudent: async (id, archived) => _request('PATCH', `/medical-records/${id}`, { status: archived ? 'archived' : 'active' }),

    /* ---------- Master data ---------- */
    async getDepartments() {
      const orgId = _orgId();
      const res = await _request('GET', `/departments/organization/${orgId}`);
      const items = (res.data && res.data.items) || res.data || [];
      return { success: true, data: items.map((d) => d.name) };
    },
    async getServices() {
      const orgId = _orgId();
      const res = await _request('GET', `/services/organization/${orgId}`);
      const items = (res.data && res.data.items) || res.data || [];
      servicesCache = items;
      return { success: true, data: items.map((s) => s.name) };
    },

    /* ---------- Schedules ---------- */
    async getSchedules() {
      const orgId = _orgId();
      if (!orgId) return { success: true, data: [] };
      const res = await _request('GET', `/schedules/organization/${orgId}`);
      const items = res.data || [];
      return {
        success: true,
        data: items.map((s) => ({
          id: s.id,
          doctor_id: s.staffId,
          doctor_name: _staffName(s.staff),
          doctor: _staffName(s.staff),
          day: s.dayOfWeek ? s.dayOfWeek.charAt(0).toUpperCase() + s.dayOfWeek.slice(1) : '',
          dayOfWeek: s.dayOfWeek,
          start_time: s.startTime ? new Date(s.startTime).toISOString().slice(11, 16) : '',
          end_time: s.endTime ? new Date(s.endTime).toISOString().slice(11, 16) : '',
          startTime: s.startTime,
          endTime: s.endTime,
          status: s.isActive === false ? 'inactive' : 'active',
          isActive: s.isActive !== false,
        })),
      };
    },
    async saveSchedule(data) {
      const orgId = _orgId();
      const staffId = data.doctor_id || data.staffId;
      if (!staffId) throw new Error('Select a doctor first.');
      const date = data.date || new Date().toISOString().slice(0, 10);
      const dayOfWeek = DAY_INDEX[new Date(date + 'T00:00:00').getDay()];
      const slots = (data.slots || []).sort();
      const startTime = slots[0] || '08:00';
      const endTime = slots[slots.length - 1] || '17:00';
      const startIso = new Date(`${date}T${startTime}:00`).toISOString();
      const endIso = new Date(`${date}T${endTime}:00`).toISOString();
      return _request('POST', '/schedules', {
        organizationId: orgId,
        staffId,
        dayOfWeek,
        startTime: startIso,
        endTime: endIso,
      });
    },
    deleteSchedule: (id) => _request('DELETE', `/schedules/${id}`),
    async getAvailableSlots(date, doctorId, serviceName) {
      const orgId = _orgId();
      if (!doctorId || !orgId) {
        return { success: true, data: [], message: 'Choose a doctor to view available time slots.', hasSchedule: false };
      }
      let serviceQs = '';
      if (serviceName) {
        const services = await _servicesByName();
        const svc = services[String(serviceName).toLowerCase()];
        if (svc) serviceQs = `?serviceId=${encodeURIComponent(svc.id)}`;
      }
      const res = await _request('GET', `/appointments/slots/${doctorId}/${date}${serviceQs}`);
      return {
        success: true,
        data: (res.data && res.data.slots) || [],
        message: (res.data && res.data.message) || null,
        hasSchedule: res.data ? !!res.data.hasSchedule : false,
      };
    },

    /* Resolve a real, eligible doctor for the "No preference" booking path.
       The backend only returns staff with an active schedule for the requested
       day, scoped to the logged-in organization. */
    async getAvailableDoctorsForDate(date, serviceName) {
      const orgId = _orgId();
      if (!orgId) {
        return { success: true, data: [], message: 'Organization not found. Please log in again.' };
      }
      let serviceQs = '';
      if (serviceName) {
        const services = await _servicesByName();
        const svc = services[String(serviceName).toLowerCase()];
        if (svc) serviceQs = `&serviceId=${encodeURIComponent(svc.id)}`;
      }
      const res = await _request('GET', `/appointments/doctors/available?date=${date}${serviceQs}`);
      return {
        success: true,
        data: ((res.data && res.data.doctors) || []).map(_mapStaffDoctor),
        message: (res.data && res.data.message) || null,
      };
    },

    /* ---------- Analytics / Reports ---------- */
    async getAdminStats() {
      const orgId = _orgId();
      const qs = orgId ? `?organizationId=${orgId}` : '';
      const summary = await _request('GET', `/dashboard${qs}`).catch(() => ({ data: { counts: {}, appointmentStatusCounts: [] } }));
      const c = summary.data.counts || {};
      const statusCounts = {};
      (summary.data.appointmentStatusCounts || []).forEach((g) => { statusCounts[g.status] = g.count; });

      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const availRes = await _request('GET', `/appointments/doctors/available?date=${today}`).catch(() => null);
      const available_doctors = (availRes && Array.isArray(availRes.data && availRes.data.doctors))
        ? availRes.data.doctors.length
        : null;

      let weekly_appointments = Array(7).fill(0);
      let busiest_day = null;
      let total_appointments = c.appointments || 0;
      let avg_wait_time = null;
      let peak_hour = null;
      let appointments_by_department = [];
      try {
        const apptRes = await _request('GET', `/reports/appointments${qs}`);
        const appt = (apptRes && apptRes.data) || {};
        const byDay = Array.isArray(appt.byDay) ? [...appt.byDay].sort((a, b) => (a.date < b.date ? -1 : 1)) : [];
        if (byDay.length) {
          weekly_appointments = byDay.slice(-7).map((d) => d.total || 0);
          while (weekly_appointments.length < 7) weekly_appointments.unshift(0);
          const peak = byDay.reduce((m, d) => (!m || (d.total || 0) > m.total ? d : m), null);
          if (peak) busiest_day = { date: peak.date, total: peak.total || 0 };
        }
        if (typeof appt.total === 'number') total_appointments = appt.total;
        avg_wait_time = typeof appt.avgWaitMinutes === 'number' ? appt.avgWaitMinutes : null;
        peak_hour = (appt.peakHours && appt.peakHours.length) ? appt.peakHours[0].hour : null;
        appointments_by_department = Array.isArray(appt.appointmentsByDepartment) ? appt.appointmentsByDepartment : [];
      } catch (e) { /* /reports/* endpoints are admin/super_admin only */ }

      return {
        success: true,
        data: {
          total_doctors: c.staff || 0,
          available_doctors,
          total_students: c.profiles || 0,
          total_departments: c.departments || 0,
          total_services: c.services || 0,
          total_consultations: c.consultations || 0,
          total_appointments,
          appointments_today: c.appointmentsToday || 0,
          completed_today: statusCounts.completed || 0,
          pending_appointments: (statusCounts.scheduled || 0) + (statusCounts.confirmed || 0) + (statusCounts.pending || 0) + (statusCounts.checked_in || 0),
          cancelled_appointments: statusCounts.cancelled || 0,
          avg_wait_time,
          peak_hour,
          busiest_day,
          satisfaction_rate: null,
          appointments_by_department,
          weekly_appointments,
          /* Exposed so getAnalytics() can reuse this single report request
             instead of issuing its own duplicate /reports/appointments call. */
          appointment_status_counts: statusCounts,
        },
      };
    },
    async getAdminReports() {
      const orgId = _orgId();
      const qs = orgId ? `?organizationId=${orgId}` : '';
      const [apptRes, patRes, staffRes, healthRes] = await Promise.all([
        _request('GET', `/reports/appointments${qs}`).catch(() => null),
        _request('GET', `/reports/patients${qs}`).catch(() => null),
        _request('GET', `/reports/staff${qs}`).catch(() => null),
        _request('GET', `/dashboard/health${qs}`).catch(() => null),
      ]);

      const appt = apptRes ? apptRes.data : null;
      const statusCounts = {};
      (appt && appt.statusCounts || []).forEach((g) => { statusCounts[g.status] = g.count; });
      const byGender = (patRes && patRes.data && patRes.data.byGender || [])
        .map((g) => ({ label: g.gender || 'Unknown', value: g.count || 0 }));
      const breakdown = (healthRes && Array.isArray(healthRes.data && healthRes.data.breakdown))
        ? healthRes.data.breakdown
        : [];
      const peakHours = (appt && Array.isArray(appt.peakHours)) ? appt.peakHours : [];
      const deptRows = (appt && Array.isArray(appt.appointmentsByDepartment))
        ? appt.appointmentsByDepartment
        : [];
      /* `dashboard/health` buckets diagnoses by keyword into real categories
         plus the two catch-all buckets "Other" and "Unspecified". Those two
         are not medical conditions, so they are not presented as condition
         tags. The full breakdown (including the catch-alls) is still
         returned by condition_breakdown on getAnalytics() for the donut. */
      const CONDITION_CATCH_ALL_BUCKETS = ['Other', 'Unspecified'];
      const isNamedCondition = (b) =>
        (b && (b.count || 0) > 0) && !CONDITION_CATCH_ALL_BUCKETS.includes(b.name);

      return {
        success: true,
        data: {
          monthly_summary: {
            total: appt ? appt.total : 0,
            completed: statusCounts.completed || 0,
            cancelled: statusCounts.cancelled || 0,
            no_show: statusCounts.no_show || 0,
          },
          department_breakdown: deptRows.map((d) => ({ dept: d.dept, appointments: d.count || 0 })),
          patient_demographics: byGender,
          top_conditions: breakdown.filter(isNamedCondition).map((b) => b.name),
          peak_times: peakHours.map((p) => `${String(p.hour).padStart(2, '0')}:00`),
          peak_counts: peakHours.map((p) => p.count || 0),
        },
      };
    },
    async getAnalytics() {
      const orgId = _orgId();
      const qs = orgId ? `?organizationId=${orgId}` : '';
      /* getAdminStats() already performs the single /reports/appointments
         request and exposes the derived totals (weekly_appointments,
         busiest_day, avg_wait_time, peak_hour, total_appointments) plus
         appointment_status_counts from /dashboard. Requesting the report
         again here duplicated an unbounded aggregation on every analytics
         load, so it is derived from `stats` below instead. */
      const [statsRes, healthRes, patRes, staffRes, queueRes] = await Promise.all([
        this.getAdminStats().catch(() => null),
        _request('GET', `/dashboard/health${qs}`).catch(() => null),
        _request('GET', `/reports/patients${qs}`).catch(() => null),
        _request('GET', `/reports/staff${qs}`).catch(() => null),
        _request('GET', `/dashboard/queue${qs}`).catch(() => null),
      ]);

      const stats = (statsRes && statsRes.data) || {};
      const health = (healthRes && healthRes.data) || {};
      const patients = (patRes && patRes.data) || null;
      const staff = (staffRes && staffRes.data) || null;
      const queue = (queueRes && queueRes.data) || null;

      const sc = { completed: 0, cancelled: 0, no_show: 0, checked_in: 0, scheduled: 0, confirmed: 0, pending: 0 };
      const rawStatusCounts = (stats && stats.appointment_status_counts) || {};
      Object.keys(rawStatusCounts).forEach((status) => {
        sc[status] = (sc[status] || 0) + (rawStatusCounts[status] || 0);
      });

      const weekly_trend = Array.isArray(stats.weekly_appointments) && stats.weekly_appointments.length
        ? stats.weekly_appointments
        : Array(7).fill(0);
      const busiest_day = stats.busiest_day || null;

      const condition_breakdown = (health && Array.isArray(health.breakdown)) ? health.breakdown : [];
      const total_cases = typeof health.totalCases === 'number'
        ? health.totalCases
        : condition_breakdown.reduce((s, b) => s + (b.count || 0), 0);
      const monthly_trend = (health && Array.isArray(health.monthlyTrend)) ? health.monthlyTrend : [];

      const queue_counts = {};
      (queue && queue.statusCounts || []).forEach((g) => { if (g && g.status) queue_counts[g.status] = g.count; });

      return {
        success: true,
        data: {
          as_of: new Date().toISOString(),
          total_students: stats.total_students || 0,
          total_doctors: stats.total_doctors || 0,
          total_departments: stats.total_departments || 0,
          total_services: stats.total_services || 0,
          total_consultations: stats.total_consultations || 0,
          total_appointments: stats.total_appointments || 0,
          appointments_today: stats.appointments_today || 0,
          completed: sc.completed,
          pending: sc.pending + sc.scheduled + sc.confirmed + sc.checked_in,
          cancelled: sc.cancelled,
          checked_in: sc.checked_in,
          no_show: sc.no_show,
          weekly_trend,
          monthly_trend,
          condition_breakdown,
          total_cases,
          patients_by_level: (patients && Array.isArray(patients.byLevel)) ? patients.byLevel : [],
          staff_by_department: (staff && Array.isArray(staff.byDepartment)) ? staff.byDepartment : [],
          busiest_day,
          queue_counts,
          avg_wait_time: (stats && typeof stats.avg_wait_time === 'number') ? stats.avg_wait_time : null,
          peak_hour: (stats && stats.peak_hour != null) ? stats.peak_hour : null,
          satisfaction_rate: null,
          max_queue_length: null,
        },
      };
    },

    /* ---------- Staff / Admin dashboards ---------- */
    async getStaffDashboard() {
      const orgId = _orgId();
      const summary = await _request('GET', `/dashboard?organizationId=${orgId}`).catch(() => ({ data: { counts: {}, queueStatusCounts: [] } }));
      const queueRes = await _todayQueue().catch(() => ({ items: [], total: 0 }));
      const items = queueRes.items;
      const queueTotal = queueRes.total;
      const c = summary.data.counts || {};
      const qCounts = {};
      (summary.data.queueStatusCounts || []).forEach((g) => { qCounts[g.status] = g.count; });
      const waiting = (qCounts.waiting || 0) + (qCounts.called || 0) + (qCounts.checked_in || 0);
      const inConsultation = qCounts.in_progress || 0;
      return {
        success: true,
        data: {
          total_appointments: c.appointmentsToday || queueTotal,
          checked_in: waiting + inConsultation,
          waiting,
          in_consultation: inConsultation,
          queue_list: items.map(_mapQueueEntry),
        },
      };
    },
    getStaffPatients: () => this.getStudents(),

    async getHealthAnalytics() {
      const orgId = _orgId();
      const res = await _request('GET', `/dashboard/health?organizationId=${orgId}`);
      return { success: true, data: res.data };
    },

    /* ---------- Clinical / ancillary ---------- */
    async getPrescriptions() {
      const role = _role();
      if (role === 'student') {
        const items = await _allPages('/appointments/my');
        const out = [];
        items.forEach((a) => {
          const rx = a.queue && a.queue.consultation && a.queue.consultation.prescription;
          if (rx && rx.items && rx.items.length) {
            rx.items.forEach((item) => {
              out.push({
                id: rx.id,
                medication: item.medicationName || 'Medication',
                dosage: item.dosage || '',
                status: 'dispensed',
                date: rx.createdAt || a.appointmentDate || '',
                prescribed_by: a.staff ? _staffName(a.staff) : 'Doctor',
              });
            });
          }
        });
        return { success: true, data: out };
      }
      const res = await _request('GET', '/prescriptions');
      const items = (res.data && res.data.items) || res.data || [];
      return {
        success: true,
        data: items.map((p) => {
          const item = (p.items && p.items[0]) || {};
          return {
            id: p.id,
            medication: item.medicationName || 'Medication',
            dosage: item.dosage || '',
            status: 'dispensed',
            date: p.createdAt || '',
            prescribed_by: p.consultation && p.consultation.queue && p.consultation.queue.appointment && p.consultation.queue.appointment.staff
              ? _staffName(p.consultation.queue.appointment.staff)
              : 'Doctor',
          };
        }),
      };
    },
    getLabResults: async () => ({ success: true, data: [] }),
    getTelecomConsultations: async () => ({ success: true, data: [] }),
    async getMedicalRecords() {
      const role = _role();
      if (role === 'student') {
        const items = await _allPages('/appointments/my');
        const completed = items.filter((a) => a.status === 'completed');
        return {
          success: true,
          data: completed.map((a) => {
            const m = _mapAppointment(a);
            return {
              type: 'consultation',
              date: m.date,
              doctor: m.doctor_name,
              diagnosis: m.diagnosis,
              notes: m.notes || m.treatment,
            };
          }),
        };
      }
      const res = await _request('GET', '/medical-records');
      const items = (res.data && res.data.items) || res.data || [];
      return {
        success: true,
        data: items.map((r) => ({
          type: 'checkup',
          date: r.createdAt || '',
          doctor: 'Health Center',
          diagnosis: '',
          notes: `Record ${r.recordNumber || ''}`.trim(),
        })),
      };
    },

    /* ---------- Patient search (staff) ---------- */
    async searchPatients(query) {
      const res = await this.getStudents();
      const q = String(query || '').toLowerCase();
      const filtered = res.data.filter((p) =>
        p.full_name.toLowerCase().includes(q) ||
        p.matric.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q)
      );
      return { success: true, data: filtered };
    },
    async lookupPatient(matric) {
      const res = await this.getStudents();
      const found = res.data.find((p) => p.matric.toLowerCase() === String(matric || '').toLowerCase());
      return { success: true, data: found || null };
    },

    /* ---------- Legacy admin lists ---------- */
    async getAllAppointments() {
      const res = await this.getAppointments();
      return { success: true, data: res.data };
    },
  };
})();
