const Utils = {
  formatDate(dateStr, format = 'medium') {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const options = format === 'short'
      ? { month: 'short', day: 'numeric' }
      : format === 'long'
        ? { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }
        : { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
    return d.toLocaleDateString('en-US', options);
  },

  formatTime(timeStr) {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${m} ${ampm}`;
  },

  formatDateTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  },

  timeAgo(dateStr) {
    if (!dateStr) return '';
    const now = new Date();
    const d = new Date(dateStr);
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return this.formatDate(dateStr);
  },

  truncate(str, len = 60) {
    if (!str) return '';
    return str.length > len ? str.substring(0, len) + '...' : str;
  },

  capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  },

  pluralize(count, singular, plural) {
    return count === 1 ? `${count} ${singular}` : `${count} ${plural || singular + 's'}`;
  },

  getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
  },

  getStatusColor(status) {
    const map = {
      pending: 'warning',
      confirmed: 'primary',
      checked_in: 'info',
      'checked in': 'info',
      in_queue: 'info',
      'in queue': 'info',
      in_consultation: 'warning',
      'in consultation': 'warning',
      completed: 'success',
      cancelled: 'danger',
      waiting: 'warning',
      serving: 'success',
      scheduled: 'primary',
      dispensed: 'success',
      read: 'neutral',
      unread: 'primary',
    };
    return map[status?.toLowerCase()] || 'neutral';
  },

  getStatusIcon(status) {
    const map = {
      pending: 'clock',
      confirmed: 'check-circle',
      checked_in: 'log-in',
      'checked in': 'log-in',
      in_queue: 'users',
      'in queue': 'users',
      in_consultation: 'activity',
      'in consultation': 'activity',
      completed: 'check-circle',
      cancelled: 'x-circle',
      waiting: 'clock',
      serving: 'user-check',
    };
    return map[status?.toLowerCase()] || 'circle';
  },

  debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  },

  validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },

  validatePhone(phone) {
    return /^\+?[\d\s-]{8,15}$/.test(phone);
  },

  validateMatric(matric) {
    return /^[A-Za-z0-9/-]{5,20}$/.test(matric);
  },

  sanitize(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  generateId() {
    return 'id-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  },

  saveToStorage(key, data) {
    try {
      localStorage.setItem('shms_' + key, JSON.stringify(data));
    } catch (e) {
      console.warn('Storage save failed:', e);
    }
  },

  loadFromStorage(key, defaultVal = null) {
    try {
      const data = localStorage.getItem('shms_' + key);
      return data ? JSON.parse(data) : defaultVal;
    } catch (e) {
      return defaultVal;
    }
  },

  removeFromStorage(key) {
    try {
      localStorage.removeItem('shms_' + key);
    } catch (e) {
      console.warn('Storage remove failed:', e);
    }
  },

  clearStorage() {
    try {
      Object.keys(localStorage).filter(k => k.startsWith('shms_')).forEach(k => localStorage.removeItem(k));
    } catch (e) {
      console.warn('Storage clear failed:', e);
    }
  },

  showToast(message, type = 'success', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) {
      const c = document.createElement('div');
      c.id = 'toast-container';
      c.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
      document.body.appendChild(c);
    }
    const toast = document.createElement('div');
    const icons = { success: 'check-circle', error: 'alert-circle', warning: 'alert-triangle', info: 'info' };
    toast.style.cssText = `
      display:flex;align-items:center;gap:10px;padding:14px 18px;
      border-radius:8px;font-size:14px;font-weight:500;box-shadow:0 8px 24px rgba(0,0,0,0.12);
      animation:slideIn 0.3s ease forwards;max-width:400px;
      background:${type === 'success' ? '#dcfce7' : type === 'error' ? '#fce4ec' : type === 'warning' ? '#fef3c7' : '#e0f2fe'};
      color:${type === 'success' ? '#166534' : type === 'error' ? '#c62828' : type === 'warning' ? '#92400e' : '#075985'};
      border:1px solid ${type === 'success' ? '#bbf7d0' : type === 'error' ? '#f8bbd0' : type === 'warning' ? '#fde68a' : '#bae6fd'};
    `;
    toast.innerHTML = `<span style="font-size:18px">${icons[type] || 'info'}</span><span>${message}</span>`;
    const containerEl = document.getElementById('toast-container');
    containerEl.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  showLoading(container) {
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    spinner.style.cssText = 'display:flex;align-items:center;justify-content:center;padding:40px;';
    spinner.innerHTML = '<div class="spinner spinner-lg"></div>';
    container.innerHTML = '';
    container.appendChild(spinner);
  },

  hideLoading(container) {
    const spinner = container.querySelector('.loading-spinner');
    if (spinner) spinner.remove();
  },

  renderPagination(container, currentPage, totalPages, onChange) {
    container.innerHTML = '';
    if (totalPages <= 1) return;
    const prevBtn = document.createElement('button');
    prevBtn.innerHTML = '&laquo;';
    prevBtn.disabled = currentPage === 1;
    prevBtn.addEventListener('click', () => onChange(currentPage - 1));
    container.appendChild(prevBtn);

    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement('button');
      btn.textContent = i;
      if (i === currentPage) btn.className = 'active';
      btn.addEventListener('click', () => onChange(i));
      container.appendChild(btn);
    }

    const nextBtn = document.createElement('button');
    nextBtn.innerHTML = '&raquo;';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.addEventListener('click', () => onChange(currentPage + 1));
    container.appendChild(nextBtn);
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  isInSubdirectory() {
    const path = window.location.pathname;
    const parts = path.split('/').filter(p => p);
    return parts.length > 1;
  },

  fixSidebarLinks() {
    const prefix = Utils.isInSubdirectory() ? '../' : '';
    document.querySelectorAll('#sidebar .sidebar-link').forEach(link => {
      const href = link.getAttribute('href');
      if (href && !href.startsWith('http') && !href.startsWith('../') && !href.startsWith('/')) {
        link.setAttribute('href', prefix + href);
      }
    });
  },

  buildSidebar(currentPage) {
    const base = window.SHMS_BASE || '';
    const user = Auth.getUser();
    const name = user ? user.full_name || 'User' : 'User';
    const initials = this.getInitials(name);
    const role = user ? this.capitalize(user.role || 'Student') : 'Student';
    const roleType = user ? user.role : 'student';

    let sections = [];

    if (roleType === 'admin' || roleType === 'super_admin') {
      sections = [
        { title: 'Admin', links: [
          { page: '', href: 'admin/index.html', icon: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>', label: 'Dashboard' },
          { page: '', href: 'admin/index.html', icon: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>', label: 'Doctors' },
          { page: '', href: 'admin/index.html', icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', label: 'Students' },
          { page: '', href: 'admin/index.html', icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>', label: 'Schedules' },
          { page: '', href: 'admin/index.html', icon: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>', label: 'Reports' },
        ]},
        { title: 'Intelligence', links: [
          { page: 'analytics', href: 'analytics/index.html', icon: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>', label: 'Analytics' },
          { page: 'ai', href: 'ai/index.html', icon: '<path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/><path d="M17 10h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h2"/><line x1="12" y1="18" x2="12" y2="22"/>', label: 'AI Symptom Checker' },
          { page: 'lab', href: 'lab/index.html', icon: '<path d="M10 2v7.31l-6 9.2A2 2 0 0 0 5.64 22h12.72a2 2 0 0 0 1.64-3.49l-6-9.2V2"/><line x1="10" y1="2" x2="14" y2="2"/>', label: 'Laboratory' },
          { page: 'pharmacy', href: 'pharmacy/index.html', icon: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>', label: 'Pharmacy' },
          { page: '', href: 'notifications.html', icon: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', label: 'Health Alerts', badge: true },
        ]},
        { title: 'Account', links: [
          { page: 'notifications', href: 'notifications.html', icon: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>', label: 'Notifications', badge: true },
          { page: 'profile', href: 'profile.html', icon: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', label: 'Profile' },
        ]},
      ];
    } else if (roleType === 'staff') {
      sections = [
        { title: 'Staff', links: [
          { page: '', href: 'staff/index.html', icon: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>', label: 'Dashboard' },
          { page: '', href: 'staff/index.html', icon: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>', label: 'Queue' },
          { page: '', href: 'staff/index.html', icon: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>', label: 'Patients' },
        ]},
        { title: 'Account', links: [
          { page: 'notifications', href: 'notifications.html', icon: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>', label: 'Notifications', badge: true },
          { page: 'profile', href: 'profile.html', icon: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', label: 'Profile' },
        ]},
      ];
    } else {
      sections = [
        {
          title: 'Main',
          links: [
            { page: 'dashboard', href: 'dashboard.html', icon: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>', label: 'Dashboard' },
            { page: 'appointments', href: 'appointments.html', icon: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>', label: 'Appointments' },
            { page: 'queue', href: 'queue.html', icon: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>', label: 'Queue' },
            { page: 'checkin', href: 'checkin.html', icon: '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', label: 'Check In' },
          ],
        },
        {
          title: 'Medical',
          links: [
            { page: 'history', href: 'history.html', icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', label: 'History' },
            { page: 'lab', href: 'lab/index.html', icon: '<path d="M10 2v7.31l-6 9.2A2 2 0 0 0 5.64 22h12.72a2 2 0 0 0 1.64-3.49l-6-9.2V2"/><line x1="10" y1="2" x2="14" y2="2"/>', label: 'Lab Results' },
            { page: 'pharmacy', href: 'pharmacy/index.html', icon: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>', label: 'Pharmacy' },
            { page: 'records', href: 'records/index.html', icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>', label: 'Records' },
          ],
        },
        {
          title: 'Services',
          links: [
            { page: 'telecom', href: 'telecom/index.html', icon: '<polyline points="4 4 20 4 20 20 4 20"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="12" y1="8" x2="12" y2="16"/>', label: 'Telemedicine' },
            { page: 'ai', href: 'ai/index.html', icon: '<path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/><path d="M17 10h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h2"/><line x1="12" y1="18" x2="12" y2="22"/>', label: 'AI Symptom Checker' },
          ],
        },
        {
          title: 'Account',
          links: [
            { page: 'notifications', href: 'notifications.html', icon: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>', label: 'Notifications', badge: true },
            { page: 'profile', href: 'profile.html', icon: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', label: 'Profile' },
          ],
        },
      ];
    }

    let html = '<aside class="sidebar" id="sidebar">\n  <div class="sidebar-brand">\n    <div class="sidebar-brand-icon">\n      <img src="' + base + 'assets/images/logo.svg" alt="SHMS" width="24" height="24">\n    </div>\n    <div class="sidebar-brand-text">\n      <h2>SHMS</h2>\n      <span>Health Center</span>\n    </div>\n  </div>\n  <nav class="sidebar-nav">';

    sections.forEach(section => {
      html += '\n    <div class="sidebar-section">\n      <div class="sidebar-section-title">' + section.title + '</div>';
      section.links.forEach(link => {
        const active = link.page === currentPage ? ' active' : '';
        const badgeHtml = link.badge ? '<span class="link-badge" id="sidebarNotifCount">0</span>' : '';
        html += '\n      <a href="' + base + link.href + '" class="sidebar-link' + active + '" data-page="' + link.page + '">\n        <svg class="link-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' + link.icon + '</svg>\n        ' + link.label + '\n        ' + badgeHtml + '\n      </a>';
      });
      html += '\n    </div>';
    });

    html += '\n  </nav>\n  <div class="sidebar-footer">\n    <div class="sidebar-user">\n      <span class="avatar avatar-sm user-initials">' + this.sanitize(initials) + '</span>\n      <div class="sidebar-user-info">\n        <div class="user-name">' + this.sanitize(name) + '</div>\n        <div class="user-role">' + role + '</div>\n      </div>\n    </div>\n    <button class="sidebar-logout btn-logout" aria-label="Sign Out">\n      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>\n      Sign Out\n    </button>\n  </div>\n</aside>';

    return html;
  },

  buildNavbar(pageTitle) {
    const user = Auth.getUser();
    const name = user ? user.full_name || 'User' : 'User';
    const initials = this.getInitials(name);
    const base = window.SHMS_BASE || '';

    return '<header class="main-header">\n  <div class="main-header-left">\n    <button class="mobile-toggle" id="sidebarToggle" aria-label="Toggle sidebar">\n      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>\n    </button>\n    <h1 class="page-title-text">' + this.sanitize(pageTitle) + '</h1>\n    <span class="live-indicator"><span class="live-dot"></span>Live</span>\n  </div>\n  <div class="main-header-right">\n    <div class="header-search">\n      <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>\n      <input type="text" placeholder="Search..." aria-label="Search">\n    </div>\n    <div class="notif-dropdown">\n      <button class="header-btn" id="notifBell" aria-label="Notifications">\n        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>\n        <span class="notification-count" id="notifCount">0</span>\n      </button>\n      <div class="notif-dropdown-menu" id="notifDropdown">\n        <div class="notif-dropdown-header">\n          <span>Notifications</span>\n          <button class="notif-mark-read" id="notifMarkRead">Mark all read</button>\n        </div>\n        <div class="notif-dropdown-body" id="notifDropdownBody">\n          <div class="notif-dropdown-empty">No notifications</div>\n        </div>\n        <a href="' + base + 'notifications.html" class="notif-dropdown-footer">View all notifications</a>\n      </div>\n    </div>\n    <div class="dropdown">\n      <button class="header-avatar" id="userMenuBtn" aria-label="User menu">\n        <span class="avatar avatar-sm user-initials">' + this.sanitize(initials) + '</span>\n      </button>\n      <div class="dropdown-menu" id="userMenu">\n        <a href="' + base + 'profile.html" class="dropdown-item">\n          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>\n          My Profile\n        </a>\n        <a href="' + base + 'notifications.html" class="dropdown-item">\n          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/></svg>\n          Notifications\n        </a>\n        <div class="dropdown-divider"></div>\n        <button class="dropdown-item btn-logout">\n          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>\n          Sign Out\n        </button>\n      </div>\n    </div>\n  </div>\n</header>';
  },
};
