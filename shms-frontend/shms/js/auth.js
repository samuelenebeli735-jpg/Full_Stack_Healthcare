const Auth = {
  TOKEN_KEY: 'shms_token',
  USER_KEY: 'shms_user',

  root() {
    return window.SHMS_BASE || '';
  },

  isAuthenticated() {
    return !!localStorage.getItem(this.TOKEN_KEY);
  },

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  getUser() {
    const data = localStorage.getItem(this.USER_KEY);
    return data ? JSON.parse(data) : null;
  },

  setSession(token, user) {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  },

  clearSession() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  },

  async login(credentials) {
    try {
      const res = await API.login(credentials);
      if (res.success && res.data) {
        const flatUser = this._normalizeUser(res.data.user);
        this.setSession(res.data.token, flatUser);
        return { success: true, user: flatUser };
      }
      return { success: false, error: res.message || 'Login failed' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  async register(userData) {
    try {
      const res = await API.register(userData);
      if (res.success) {
        return { success: true, message: res.message };
      }
      return { success: false, error: res.message || 'Registration failed' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  _normalizeUser(rawUser) {
    return {
      id: rawUser.id,
      email: rawUser.email,
      role: rawUser.role,
      isActive: rawUser.isActive,
      organizationId: rawUser.organizationId,
      full_name: rawUser.profile
        ? (rawUser.profile.firstName + ' ' + (rawUser.profile.middleName || '') + ' ' + rawUser.profile.lastName).replace(/\s+/g, ' ').trim()
        : rawUser.email,
      matric_number: rawUser.profile?.matricNumber || '',
      faculty: rawUser.profile?.faculty || '',
      department: rawUser.profile?.department || '',
      level: rawUser.profile?.level || '',
      phone: rawUser.profile?.phone || '',
      gender: rawUser.profile?.gender || '',
      date_of_birth: rawUser.profile?.dateOfBirth || '',
      blood_group: rawUser.profile?.bloodGroup || '',
      genotype: rawUser.profile?.genotype || '',
      allergies: rawUser.profile?.allergies || '',
      emergency_contact_name: rawUser.profile?.emergencyContactName || '',
      emergency_contact_phone: rawUser.profile?.emergencyContactPhone || '',
      avatar: rawUser.profile?.profilePhotoUrl || null,
      createdAt: rawUser.createdAt,
      updatedAt: rawUser.updatedAt,
      organization: rawUser.organization || null,
    };
  },

  async verifySession() {
    try {
      const res = await API.verifyToken();
      if (res.success && res.data) {
        const flatUser = this._normalizeUser(res.data.user);
        localStorage.setItem(this.USER_KEY, JSON.stringify(flatUser));
        return { success: true, user: flatUser };
      }
      this.clearSession();
      return { success: false };
    } catch (err) {
      this.clearSession();
      return { success: false, error: err.message };
    }
  },

  logout() {
    this.clearSession();
    window.location.href = this.root() + 'login.html';
  },

  hasRole(role) {
    const user = this.getUser();
    return user && user.role === role;
  },

  isStudent() {
    return this.hasRole('student');
  },

  isStaff() {
    return this.hasRole('staff');
  },

  isAdmin() {
    return this.hasRole('admin') || this.hasRole('super_admin');
  },

  requireAuth(redirectTo) {
    if (!this.isAuthenticated()) {
      window.location.href = redirectTo || (this.root() + 'login.html');
      return false;
    }
    return true;
  },

  redirectIfAuthenticated(destination) {
    if (this.isAuthenticated()) {
      if (destination) { window.location.href = destination; return true; }
      try {
        const user = this.getUser();
        const role = user?.role || '';
        const roleMap = { student: 'dashboard.html', staff: 'staff/index.html', admin: 'admin/index.html', 'super_admin': 'admin/index.html' };
        window.location.href = this.root() + (roleMap[role] || 'dashboard.html');
      } catch(e) {
        window.location.href = this.root() + 'dashboard.html';
      }
      return true;
    }
    return false;
  },

  initLoginForm(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const mode = document.querySelector('.login-tab.active')?.dataset.mode || 'email';
      const password = form.querySelector('#password')?.value;
      const submitBtn = form.querySelector('button[type="submit"]');
      let identifier;
      if (mode === 'id') {
        identifier = form.querySelector('#idInput')?.value.trim();
        if (!identifier || !password) {
          this.showError(form, 'Please enter your ID and password');
          return;
        }
      } else {
        identifier = form.querySelector('#email')?.value.trim();
        if (!identifier || !password) {
          this.showError(form, 'Please fill in all fields');
          return;
        }
      }
      const credentials = { identifier, password };
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span> Signing in...';
      try {
        const result = await this.login(credentials);
        if (result.success) {
          Utils.showToast('Welcome back, ' + result.user.full_name + '!', 'success');
          setTimeout(() => {
            const r = this.root();
            const user = result.user;
            const role = user.role;
            // Check if student profile is incomplete (no faculty = first login)
            if (role === 'student' && !user.faculty && !user.department) {
              window.location.href = r + 'complete-profile.html';
            } else if (role === 'admin' || role === 'super_admin') window.location.href = r + 'admin/index.html';
            else if (role === 'staff') window.location.href = r + 'staff/index.html';
            else window.location.href = r + 'dashboard.html';
          }, 500);
        } else {
          this.showError(form, result.error || 'Invalid credentials');
        }
      } catch (e) {
        this.showError(form, e.message || 'Login failed. Please try again.');
      }
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
    });
  },

  initRegisterForm(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = (id) => form.querySelector('#' + id)?.value?.trim() || '';
      const fullName = val('full_name');
      const nameParts = fullName.split(/\s+/).filter(Boolean);
      if (nameParts.length < 2) {
        this.showError(form, 'Please enter your full name (first and last name)');
        return;
      }
      const data = {
        organizationId: val('organization'),
        email: val('email'),
        password: val('password'),
        confirm_password: val('confirm_password'),
        firstName: nameParts[0],
        middleName: nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : undefined,
        lastName: nameParts[nameParts.length - 1],
        matricNumber: val('id_field'),
        faculty: val('faculty'),
        department: val('department'),
        level: val('level'),
        gender: val('gender'),
        dateOfBirth: val('date_of_birth'),
        phone: val('phone'),
        emergencyContactName: val('emergency_contact_name'),
        emergencyContactPhone: val('emergency_contact_phone'),
      };
      const bloodGroup = val('blood_group');
      const genotype = val('genotype');
      const allergies = val('allergies');
      if (bloodGroup) data.bloodGroup = bloodGroup;
      if (genotype) data.genotype = genotype;
      if (allergies) data.allergies = allergies;

      if (!data.organizationId || !data.email || !data.password || !data.firstName || !data.lastName) {
        this.showError(form, 'Please fill in all required fields');
        return;
      }
      if (data.password !== data.confirm_password) {
        this.showError(form, 'Passwords do not match');
        return;
      }
      if (data.password.length < 8) {
        this.showError(form, 'Password must be at least 8 characters');
        return;
      }
      delete data.confirm_password;
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span> Creating account...';
      try {
        const result = await this.register(data);
        if (result.success) {
          this.showSuccess(form, result.message || 'Registration successful! Redirecting to login...');
          setTimeout(() => window.location.href = this.root() + 'login.html', 2000);
        } else {
          this.showError(form, result.error || 'Registration failed');
        }
      } catch (e) {
        this.showError(form, e.message || 'Registration failed. Please try again.');
      }
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Account';
    });
  },

  initPasswordToggle() {
    const eyeSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    const eyeOffSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    document.querySelectorAll('.toggle-password').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = btn.dataset.target
          ? document.getElementById(btn.dataset.target)
          : btn.closest('.input-icon-wrapper')?.querySelector('input');
        if (!input) return;
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        btn.innerHTML = isPassword ? eyeOffSvg : eyeSvg;
      });
    });
  },

  initNotificationBell(retries = 20) {
    if (retries <= 0) return;
    const bell = document.getElementById('notifBell');
    const dropdown = document.getElementById('notifDropdown');
    if (!bell || !dropdown) {
      setTimeout(() => this.initNotificationBell(retries - 1), 200);
      return;
    }

    const renderNotifs = (notifs) => {
      const body = document.getElementById('notifDropdownBody');
      const count = document.getElementById('notifCount');
      if (!body) return;
      const unread = notifs.filter(n => !n.read).length;
      if (count) {
        count.textContent = unread;
        count.style.display = unread > 0 ? 'flex' : 'none';
      }
      const sidebarCount = document.getElementById('sidebarNotifCount');
      if (sidebarCount) {
        sidebarCount.textContent = unread;
        sidebarCount.style.display = unread > 0 ? 'flex' : 'none';
      }
      if (notifs.length === 0) {
        body.innerHTML = '<div class="notif-dropdown-empty">No notifications</div>';
        return;
      }
      const typeIcons = { appointment: '📅', queue: '👥', checkin: '✅', reminder: '⏰', system: '⚙️' };
      body.innerHTML = notifs.slice(0, 8).map(n => `
        <div class="notif-dropdown-item${n.read ? '' : ' unread'}" data-id="${n.id}">
          <div class="notif-icon">${typeIcons[n.type] || '🔔'}</div>
          <div class="notif-content">
            <div class="notif-title">${Utils.sanitize(n.title)}</div>
            <div class="notif-msg">${Utils.sanitize(n.message)}</div>
          </div>
          <div class="notif-time">${Utils.timeAgo(n.created_at)}</div>
        </div>
      `).join('');
      body.querySelectorAll('.notif-dropdown-item').forEach(el => {
        el.addEventListener('click', async () => {
          const id = el.dataset.id;
          await API.markNotificationRead(id);
          el.classList.remove('unread');
          const notifCount = document.getElementById('notifCount');
          const cur = parseInt(notifCount.textContent) || 0;
          notifCount.textContent = Math.max(0, cur - 1);
          if (notifCount.textContent === '0') notifCount.style.display = 'none';
        });
      });
    };

    const fetchNotifs = async () => {
      try {
        const res = await API.getNotifications();
        if (res.success) {
          renderNotifs(res.data || []);
        }
      } catch (e) {}
    };

    bell.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.contains('active');
      document.querySelectorAll('.notif-dropdown-menu.active').forEach(m => m.classList.remove('active'));
      if (!isOpen) {
        dropdown.classList.add('active');
        fetchNotifs();
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.notif-dropdown')) {
        dropdown.classList.remove('active');
      }
    });

    document.getElementById('notifMarkRead')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await API.markAllNotificationsRead();
        fetchNotifs();
      } catch (e) {}
    });

    fetchNotifs();
    setInterval(fetchNotifs, 30000);
  },

  _insertAlert(form, alert) {
    const refNode = form.querySelector('button[type="submit"]')?.closest('.form-group') || form.querySelector('button[type="submit"]');
    if (refNode) {
      refNode.parentNode.insertBefore(alert, refNode);
    } else {
      form.appendChild(alert);
    }
  },

  showError(form, message) {
    let alert = form.querySelector('.auth-alert');
    if (!alert) {
      alert = document.createElement('div');
      alert.className = 'auth-alert';
      this._insertAlert(form, alert);
    }
    alert.className = 'auth-alert error';
    alert.textContent = message;
    alert.style.display = 'flex';
  },

  showSuccess(form, message) {
    let alert = form.querySelector('.auth-alert');
    if (!alert) {
      alert = document.createElement('div');
      alert.className = 'auth-alert';
      this._insertAlert(form, alert);
    }
    alert.className = 'auth-alert success';
    alert.textContent = message;
    alert.style.display = 'flex';
  },

  initGlobalHandlers() {
    document.addEventListener('click', (e) => {
      const logoutBtn = e.target.closest('.btn-logout');
      if (logoutBtn) {
        e.preventDefault();
        this.logout();
        return;
      }
      const menuBtn = e.target.closest('#userMenuBtn');
      if (menuBtn) {
        document.getElementById('userMenu')?.classList.toggle('active');
        return;
      }
      if (!e.target.closest('.dropdown')) {
        document.querySelectorAll('.dropdown-menu.active').forEach(m => m.classList.remove('active'));
      }
    });
  },

  applyTheme() {
    const user = this.getUser();
    if (!user) return;
    document.body.classList.remove('role-student', 'role-staff', 'role-admin');
    document.body.classList.add('role-' + (user.role || 'student'));
  },

  async initPage() {
    if (!this.requireAuth()) return;
    const result = await this.verifySession();
    if (!result.success) {
      this.logout();
      return;
    }
    this.updateUI(result.user);
    this.applyTheme();
    // Redirect students with incomplete profiles to complete-profile page
    const user = result.user;
    if (user.role === 'student' && !user.faculty && !user.department) {
      const currentPage = window.location.pathname.split('/').pop();
      if (currentPage !== 'complete-profile.html') {
        window.location.href = this.root() + 'complete-profile.html';
        return;
      }
    }
  },

  updateUI(user) {
    document.querySelectorAll('.user-name').forEach(el => { el.textContent = user.full_name; });
    document.querySelectorAll('.user-role').forEach(el => { el.textContent = Utils.capitalize(user.role || 'Student'); });
    document.querySelectorAll('.user-initials').forEach(el => { el.textContent = Utils.getInitials(user.full_name); });
    document.querySelectorAll('.user-email').forEach(el => { el.textContent = user.email; });
    document.querySelectorAll('.user-matric').forEach(el => { el.textContent = user.matric_number || ''; });
    document.querySelectorAll('.user-department').forEach(el => { el.textContent = user.department || ''; });
  },
};

document.addEventListener('DOMContentLoaded', () => {
  Auth.initPasswordToggle();
  Auth.initGlobalHandlers();
  Auth.applyTheme();
  Auth.initNotificationBell();
});
