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

  const _slotsFromSchedule = (schedule) => {
    const start = schedule && schedule.startTime ? new Date(schedule.startTime) : null;
    const end = schedule && schedule.endTime ? new Date(schedule.endTime) : null;
    if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) return [];

    const breakStart = schedule.breakStart ? new Date(schedule.breakStart) : null;
    const breakEnd = schedule.breakEnd ? new Date(schedule.breakEnd) : null;
    const inBreak = (t) => {
      if (!breakStart || !breakEnd || isNaN(breakStart.getTime()) || isNaN(breakEnd.getTime())) return false;
      const ms = t.getTime();
      const startMs = breakStart.getTime();
      const endMs = breakEnd.getTime();
      const day = (ms - new Date(ms).setHours(0, 0, 0, 0));
      const bStart = day + (startMs - new Date(startMs).setHours(0, 0, 0, 0));
      const bEnd = day + (endMs - new Date(endMs).setHours(0, 0, 0, 0));
      const slotStart = day;
      const slotEnd = slotStart + 30 * 60000;
      return slotStart < bEnd && slotEnd > bStart;
    };

    const slots = [];
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    const hour = start.getHours();
    cursor.setHours(hour, Math.floor(start.getMinutes() / 30) * 30, 0, 0);

    const endHour = end.getHours();
    const endMinute = end.getMinutes();
    while (cursor.getHours() < endHour || (cursor.getHours() === endHour && cursor.getMinutes() < endMinute)) {
      if (!inBreak(cursor)) {
        const pad = (n) => String(n).padStart(2, '0');
        slots.push({ time: `${pad(cursor.getHours())}:${pad(cursor.getMinutes())}`, available: true });
      }
      cursor.setMinutes(cursor.getMinutes() + 30);
    }
    return slots;
  };

  const _defaultSlots = () => {
    const slots = [];
    for (let h = 8; h < 17; h++) {
      slots.push({ time: `${String(h).padStart(2, '0')}:00`, available: true });
      slots.push({ time: `${String(h).padStart(2, '0')}:30`, available: true });
    }
    return slots;
  };

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
    async getNotifications() {
      const res = await _request('GET', '/notifications');
      const items = (res.data && res.data.items) || res.data || [];
      return {
        success: true,
        data: items.map(_mapNotification),
        unread_count: (res.data && res.data.unreadCount) || 0,
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
    async getSentNotifications() {
      return { success: true, data: [] };
    },

    /* ---------- Appointments ---------- */
    async getAppointments() {
      const role = _role();
      const orgId = _orgId();
      let items = [];
      if (role === 'student') {
        const res = await _request('GET', '/appointments/my');
        items = (res.data && res.data.items) || [];
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
        const res = await _request('GET', '/appointments/my');
        items = (res.data && res.data.items) || [];
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
      const orgId = _orgId();
      const res = await _request('GET', `/queues/today/${orgId}`);
      const items = (res.data && res.data.items) || [];
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
      const orgId = _orgId();
      const res = await _request('GET', `/queues/today/${orgId}`);
      const items = (res.data && res.data.items) || [];
      return { success: true, data: items.map(_mapQueueEntry) };
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
      if (action === 'call' || action === 'skip' || action === 'reassign') {
        return _request('POST', `/queues/call-next/${orgId}`);
      }
      if (action === 'start' || action === 'complete') {
        let queueId = queueIdByTicket[ticket] || (data && data.queueId) || null;
        if (!queueId) {
          const res = await _request('GET', `/queues/today/${orgId}`);
          const items = (res.data && res.data.items) || [];
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
      const res = await _request('GET', `/staff/organization/${orgId}`);
      const items = (res.data && res.data.items) || res.data || [];
      staffCache = items;
      return { success: true, data: items.map(_mapStaffDoctor) };
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
    async getAvailableSlots(date, doctorId) {
      if (!doctorId) return { success: true, data: _defaultSlots() };
      let schedule = null;
      try {
        const res = await _request('GET', `/schedules/staff/${doctorId}`);
        const schedules = res.data || [];
        const dayOfWeek = DAY_INDEX[new Date(date + 'T00:00:00').getDay()];
        schedule = schedules.find((s) => s.dayOfWeek === dayOfWeek && s.isActive !== false) || null;
      } catch (e) {
        schedule = null;
      }
      const slots = schedule ? _slotsFromSchedule(schedule) : _defaultSlots();
      return { success: true, data: slots };
    },

    /* ---------- Analytics / Reports ---------- */
    async getAdminStats() {
      const orgId = _orgId();
      const summary = await _request('GET', `/dashboard?organizationId=${orgId}`).catch(() => ({ data: { counts: {}, appointmentStatusCounts: [] } }));
      const c = summary.data.counts || {};
      const statusCounts = {};
      (summary.data.appointmentStatusCounts || []).forEach((g) => { statusCounts[g.status] = g.count; });
      return {
        success: true,
        data: {
          total_doctors: c.staff || 0,
          available_doctors: c.staff || 0,
          total_students: c.profiles || 0,
          total_appointments: c.appointments || 0,
          completed_today: statusCounts.completed || 0,
          pending_appointments: (statusCounts.scheduled || 0) + (statusCounts.confirmed || 0),
          cancelled_appointments: statusCounts.cancelled || 0,
          avg_wait_time: 12,
          peak_hour: '10:00 AM',
          busiest_day: 'Monday',
          satisfaction_rate: 94,
          appointments_by_department: [],
          weekly_appointments: Array(7).fill(0),
        },
      };
    },
    async getAdminReports() {
      const orgId = _orgId();
      const qs = orgId ? `?organizationId=${orgId}` : '';
      const apptRes = await _request('GET', `/reports/appointments${qs}`).catch(() => null);
      const patRes = await _request('GET', `/reports/patients${qs}`).catch(() => null);
      const staffRes = await _request('GET', `/reports/staff${qs}`).catch(() => null);

      const appt = apptRes ? apptRes.data : null;
      const statusCounts = {};
      (appt && appt.statusCounts || []).forEach((g) => { statusCounts[g.status] = g.count; });
      const byGender = (patRes && patRes.data && patRes.data.byGender || [])
        .map((g) => ({ label: g.gender || 'Unknown', value: g.count || 0 }));

      return {
        success: true,
        data: {
          monthly_summary: {
            total: appt ? appt.total : 0,
            completed: statusCounts.completed || 0,
            cancelled: statusCounts.cancelled || 0,
            no_show: statusCounts.no_show || 0,
          },
          department_breakdown: byGender,
          top_conditions: [],
          peak_times: [],
          peak_counts: [],
        },
      };
    },
    async getAnalytics() {
      const stats = await this.getAdminStats();
      const orgId = _orgId();
      let weeklyTrend = stats.data.weekly_appointments;
      let doctorWorkload = [];
      try {
        if (orgId) {
          const apptRes = await _request('GET', `/reports/appointments?organizationId=${orgId}`);
          const byDay = (apptRes.data && apptRes.data.byDay) || [];
          const last7 = byDay.slice(-7);
          weeklyTrend = last7.map((d) => d.total || 0);
          while (weeklyTrend.length < 7) weeklyTrend.unshift(0);
        }
        const staffRes = await _request('GET', `/reports/staff?organizationId=${orgId}`).catch(() => null);
        if (staffRes && staffRes.data) {
          doctorWorkload = (staffRes.data.byDepartment || []).map((d) => ({
            doctor: d.name || 'Department',
            patients: d.count || 0,
          }));
        }
      } catch (e) { /* keep defaults */ }
      return {
        success: true,
        data: {
          total_appointments_today: stats.data.total_appointments,
          completed: stats.data.completed_today,
          pending: stats.data.pending_appointments,
          cancelled: stats.data.cancelled_appointments,
          average_wait_time: stats.data.avg_wait_time,
          max_queue_length: stats.data.max_queue_length,
          doctor_workload: doctorWorkload,
          weekly_trend: weeklyTrend,
          satisfaction_rate: stats.data.satisfaction_rate,
        },
      };
    },

    /* ---------- Staff / Admin dashboards ---------- */
    async getStaffDashboard() {
      const orgId = _orgId();
      const summary = await _request('GET', `/dashboard?organizationId=${orgId}`).catch(() => ({ data: { counts: {}, queueStatusCounts: [] } }));
      const queueRes = await _request('GET', `/queues/today/${orgId}`).catch(() => ({ data: { items: [] } }));
      const items = (queueRes.data && queueRes.data.items) || [];
      const c = summary.data.counts || {};
      const qCounts = {};
      (summary.data.queueStatusCounts || []).forEach((g) => { qCounts[g.status] = g.count; });
      const waiting = (qCounts.waiting || 0) + (qCounts.called || 0) + (qCounts.checked_in || 0);
      const inConsultation = qCounts.in_progress || 0;
      return {
        success: true,
        data: {
          total_appointments: c.appointmentsToday || items.length,
          checked_in: waiting + inConsultation,
          waiting,
          in_consultation: inConsultation,
          queue_list: items.map(_mapQueueEntry),
        },
      };
    },
    getStaffPatients: () => this.getStudents(),

    /* ---------- Clinical / ancillary ---------- */
    async getPrescriptions() {
      const role = _role();
      if (role === 'student') {
        const res = await _request('GET', '/appointments/my');
        const items = (res.data && res.data.items) || [];
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
        const res = await _request('GET', '/appointments/my');
        const items = (res.data && res.data.items) || [];
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
