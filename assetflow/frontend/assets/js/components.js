/**
 * AssetFlow Reusable Components Loader
 * Injects Navbar, Sidebar, and Footer into pages dynamically.
 */

// Dynamically load permission.js if not already loaded
(function() {
  if (typeof RbacService === 'undefined') {
    const isSubPage = window.location.pathname.includes('/pages/');
    const path = isSubPage ? '../assets/js/permission.js' : 'assets/js/permission.js';
    document.write(`<script src="${path}"></script>`);
  }
})();

function getUserInitials(name) {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getAvatarMarkup(user, width = 40, height = 40, idPrefix = '') {
  if (user && user.avatar) {
    return `<img src="${user.avatar}" alt="Avatar" class="rounded-circle" width="${width}" height="${height}" id="${idPrefix}avatar">`;
  }
  const initials = getUserInitials(user ? (user.fullName || user.name) : 'User');
  const sizeStyle = `width: ${width}px; height: ${height}px; font-size: ${width * 0.4}px; font-weight: 600; display: flex; align-items: center; justify-content: center; border-radius: 50%;`;
  return `
    <div class="bg-primary text-white" style="${sizeStyle}" id="${idPrefix}avatar-placeholder">
      ${initials}
    </div>
  `;
}

document.addEventListener('DOMContentLoaded', () => {
  // 1. Detect environment and set prefixes
  const isSubPage = window.location.pathname.includes('/pages/');
  const assetPrefix = isSubPage ? '../assets/' : 'assets/';
  const pagePrefix = isSubPage ? '' : 'pages/';

  // Centralized Route Protection check
  const authPages = ['login.html', 'signup.html', 'forgot-password.html', 'otp-verification.html', 'reset-password.html', 'index.html', ''];
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  const token = localStorage.getItem('token');
  
  if (!authPages.includes(currentPage) && !token) {
    window.location.href = isSubPage ? 'login.html' : 'pages/login.html';
    return;
  }

  // RBAC redirection check
  if (!authPages.includes(currentPage) && token) {
    const role = window.RbacService.getCurrentUserRole();
    if (role && !window.RbacService.canAccessPage(role, currentPage)) {
      console.warn(`Redirecting unauthorized page access for ${currentPage} (Role: ${role})`);
      window.location.href = isSubPage ? 'dashboard.html' : 'pages/dashboard.html';
      return;
    }
  }

  // 2. Initialize Dark Mode from localStorage
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // 3. Render Components if placeholders exist
  renderSidebar(isSubPage, assetPrefix, pagePrefix);
  renderNavbar(isSubPage, assetPrefix, pagePrefix, savedTheme);
  renderFooter();

  if (token) {
    loadNavbarNotifications();
  }

  // 4. Setup Global Event Listeners (Sidebar toggle, ripple, etc.)
  setupGlobalInteractions();
});

function renderSidebar(isSubPage, assetPrefix, pagePrefix) {
  const sidebarPlaceholder = document.getElementById('sidebar-placeholder');
  if (!sidebarPlaceholder) return;

  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  const role = window.RbacService.getCurrentUserRole() || 'Employee';

  const menuItems = [
    { name: 'Dashboard', icon: 'fa-gauge', path: 'dashboard.html' },
    { name: 'Organization Setup', icon: 'fa-sitemap', path: 'org-setup.html' },
    { name: 'Asset Management', icon: 'fa-boxes-stacked', path: 'assets.html' },
    { name: 'Allocation & Transfer', icon: 'fa-right-left', path: 'allocation.html' },
    { name: 'Resource Booking', icon: 'fa-calendar-check', path: 'booking.html' },
    { name: 'Maintenance', icon: 'fa-screwdriver-wrench', path: 'maintenance.html' },
    { name: 'Audit', icon: 'fa-clipboard-check', path: 'audit.html' },
    { name: 'Reports', icon: 'fa-chart-pie', path: 'reports.html' },
    { name: 'Notifications', icon: 'fa-bell', path: 'notifications.html' },
    { name: 'Profile', icon: 'fa-user-gear', path: 'profile.html' }
  ];

  let menuHtml = '';
  menuItems.forEach(item => {
    // Check RBAC permission for this page
    if (!window.RbacService.canAccessPage(role, item.path)) {
      return;
    }

    // Dynamic menu name labeling based on role
    let displayName = item.name;
    if (role === 'Department Head' || role === 'DepartmentHead') {
      if (item.path === 'assets.html') displayName = 'Department Assets';
      if (item.path === 'allocation.html') displayName = 'Allocation Requests';
      if (item.path === 'reports.html') displayName = 'Department Reports';
    } else if (role === 'Employee') {
      if (item.path === 'assets.html') displayName = 'My Assets';
      if (item.path === 'maintenance.html') displayName = 'Maintenance Requests';
    }

    const isActive = currentPath === item.path;
    const resolvedPath = pagePrefix + item.path;
    menuHtml += `
      <li class="sidebar-item ${isActive ? 'active' : ''}">
        <a href="${resolvedPath}" class="sidebar-link">
          <i class="fa-solid ${item.icon}"></i>
          <span>${displayName}</span>
        </a>
      </li>
    `;
  });

  const landingPath = isSubPage ? '../index.html' : 'index.html';

  sidebarPlaceholder.innerHTML = `
    <div class="sidebar">
      <div class="sidebar-brand">
        <a href="${landingPath}" class="text-decoration-none d-flex align-items-center">
          <i class="fa-solid fa-cube text-primary fs-3 me-2"></i>
          <span class="fs-4 fw-bold text-dark-custom" style="color: var(--text-color);">AssetFlow</span>
        </a>
      </div>
      <ul class="sidebar-menu">
        ${menuHtml}
      </ul>
      <div class="sidebar-footer">
        <div class="d-flex align-items-center">
          <div class="position-relative me-3" id="sidebar-avatar-wrapper">
            <div class="bg-primary text-white rounded-circle" style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-weight: 600;">U</div>
            <span class="position-absolute bottom-0 end-0 bg-success border border-white rounded-circle p-1" style="width: 8px; height: 8px;"></span>
          </div>
          <div class="overflow-hidden">
            <h6 class="mb-0 text-truncate font-weight-bold" id="sidebar-username">Rahul Sharma</h6>
            <small class="text-muted text-truncate d-block" id="sidebar-role">${role}</small>
          </div>
          <a href="#" class="ms-auto text-danger fs-5" id="btn-logout-sidebar" title="Log Out">
            <i class="fa-solid fa-right-from-bracket"></i>
          </a>
        </div>
      </div>
    </div>
  `;
}

function renderNavbar(isSubPage, assetPrefix, pagePrefix, currentTheme) {
  const navbarPlaceholder = document.getElementById('navbar-placeholder');
  if (!navbarPlaceholder) return;

  // Retrieve page title from document or main heading
  const pageTitle = document.title.replace('AssetFlow - ', '') || 'System';

  navbarPlaceholder.innerHTML = `
    <nav class="navbar-custom px-4 justify-content-between">
      <div class="d-flex align-items-center">
        <button class="navbar-toggler-custom me-3" id="sidebar-toggle">
          <i class="fa-solid fa-bars"></i>
        </button>
        <div class="d-none d-md-flex align-items-center">
          <nav aria-label="breadcrumb">
            <ol class="breadcrumb-custom mb-0">
              <li class="breadcrumb-item-custom"><a href="${pagePrefix}dashboard.html">Home</a></li>
              <li class="breadcrumb-item-custom active" aria-current="page">${pageTitle}</li>
            </ol>
          </nav>
        </div>
      </div>

      <div class="d-flex align-items-center gap-3">
        <!-- Search bar -->
        <div class="position-relative d-none d-sm-block" style="width: 250px;">
          <input type="text" class="form-control-custom w-100 ps-5" placeholder="Search assets, resource...">
          <i class="fa-solid fa-magnifying-glass position-absolute text-muted" style="left: 15px; top: 12px;"></i>
        </div>

        <!-- Dark Mode Toggle -->
        <button class="btn btn-icon btn-secondary-custom rounded-circle p-2" id="theme-toggle" title="Toggle Theme" style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;">
          <i class="fa-solid ${currentTheme === 'dark' ? 'fa-sun' : 'fa-moon'}"></i>
        </button>

        <!-- Notifications -->
        <div class="dropdown">
          <button class="btn btn-icon btn-secondary-custom rounded-circle p-2 position-relative" id="notifications-dropdown" data-bs-toggle="dropdown" aria-expanded="false" style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;">
            <i class="fa-solid fa-bell"></i>
            <span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger border border-white" style="font-size: 0.65rem; display: none;">
              0
            </span>
          </button>
          <ul class="dropdown-menu dropdown-menu-end shadow-md border-0 p-2" aria-labelledby="notifications-dropdown" style="width: 320px; border-radius: var(--border-radius);">
            <div class="d-flex justify-content-between align-items-center px-3 py-2 border-bottom mb-2">
              <h6 class="mb-0 fw-bold">Notifications</h6>
              <a href="${pagePrefix}notifications.html" class="text-primary text-decoration-none small">View all</a>
            </div>
            <!-- Dynamic elements loaded via loadNavbarNotifications() -->
          </ul>
        </div>

        <!-- User Profile Dropdown -->
        <div class="dropdown">
          <button class="btn p-0 border-0 d-flex align-items-center gap-2" type="button" id="user-menu-dropdown" data-bs-toggle="dropdown" aria-expanded="false">
            <div id="navbar-avatar-wrapper">
              <div class="bg-primary text-white rounded-circle" style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-weight: 600;">U</div>
            </div>
          </button>
          <ul class="dropdown-menu dropdown-menu-end shadow-md border-0 p-2" aria-labelledby="user-menu-dropdown" style="border-radius: var(--border-radius);">
            <div class="px-3 py-2 border-bottom mb-2">
              <h6 class="mb-0 fw-bold" id="navbar-username">Rahul Sharma</h6>
              <small class="text-muted" id="navbar-email">admin@assetflow.com</small>
            </div>
            <li><a class="dropdown-item rounded-2 py-2" href="${pagePrefix}profile.html"><i class="fa-solid fa-user me-2 text-muted"></i> My Profile</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item text-danger rounded-2 py-2" href="#" id="btn-logout-navbar"><i class="fa-solid fa-right-from-bracket me-2"></i> Log Out</a></li>
          </ul>
        </div>
      </div>
    </nav>
  `;
}

function renderFooter() {
  const footerPlaceholder = document.getElementById('footer-placeholder');
  if (!footerPlaceholder) return;
  footerPlaceholder.innerHTML = `
    <footer>
      <div class="container-fluid">
        <div class="row align-items-center">
          <div class="col-md-6 text-md-start mb-2 mb-md-0">
            <span>&copy; 2026 <strong>AssetFlow</strong>. All rights reserved.</span>
          </div>
          <div class="col-md-6 text-md-end">
            <a href="#" class="text-muted text-decoration-none me-3">Terms of Service</a>
            <a href="#" class="text-muted text-decoration-none">Privacy Policy</a>
          </div>
        </div>
      </div>
    </footer>
  `;
}

function setupGlobalInteractions() {
  // Theme toggle functionality
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      
      // Update icon
      const icon = themeToggle.querySelector('i');
      if (icon) {
        icon.className = newTheme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
      }

      // Dispatch event for components that might need updating (like Chart.js)
      window.dispatchEvent(new Event('themeChanged'));
    });
  }

  // Sidebar toggle for mobile
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const sidebar = document.querySelector('.sidebar');
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('active');
    });

    // Close sidebar when clicking outside of it on mobile
    document.addEventListener('click', (e) => {
      if (sidebar.classList.contains('active') && !sidebar.contains(e.target) && e.target !== sidebarToggle) {
        sidebar.classList.remove('active');
      }
    });
  }

  // Ripple effect on buttons
  const buttons = document.querySelectorAll('.btn-primary-custom, .btn-secondary-custom, .btn-primary, .btn-secondary');
  buttons.forEach(button => {
    button.addEventListener('click', function(e) {
      // Don't apply if disabled
      if (this.disabled) return;
      
      const x = e.clientX - this.getBoundingClientRect().left;
      const y = e.clientY - this.getBoundingClientRect().top;
      
      const ripple = document.createElement('span');
      ripple.classList.add('ripple');
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;
      
      this.appendChild(ripple);
      
      setTimeout(() => {
        ripple.remove();
      }, 600);
    });
  });

  // Load User Data from localStorage if present, otherwise set default
  const savedUser = localStorage.getItem('user');
  if (savedUser) {
    try {
      const user = JSON.parse(savedUser);
      // Strip cached default unsplash image
      if (user.avatar && user.avatar.includes('unsplash.com')) {
        user.avatar = '';
        localStorage.setItem('user', JSON.stringify(user));
      }

      const nameElements = ['sidebar-username', 'navbar-username'];
      const emailElements = ['navbar-email'];
      
      nameElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = user.fullName || user.name || 'User';
      });
      emailElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = user.email || 'user@example.com';
      });

      // Update avatar wrappers dynamically with either image or initials
      const sidebarAvatarWrapper = document.getElementById('sidebar-avatar-wrapper');
      if (sidebarAvatarWrapper) {
        sidebarAvatarWrapper.innerHTML = `
          ${getAvatarMarkup(user, 40, 40, 'sidebar-')}
          <span class="position-absolute bottom-0 end-0 bg-success border border-white rounded-circle p-1" style="width: 8px; height: 8px;"></span>
        `;
      }
      const navbarAvatarWrapper = document.getElementById('navbar-avatar-wrapper');
      if (navbarAvatarWrapper) {
        navbarAvatarWrapper.innerHTML = getAvatarMarkup(user, 40, 40, 'navbar-');
      }
    } catch (e) {
      console.error("Error parsing user data from localStorage", e);
    }
  }

  // Logout buttons
  const handleLogout = (e) => {
    e.preventDefault();
    Swal.fire({
      title: 'Log Out?',
      text: 'Are you sure you want to log out of AssetFlow?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#2563EB',
      cancelButtonColor: '#64748B',
      confirmButtonText: 'Yes, log out',
      cancelButtonText: 'Cancel'
    }).then((result) => {
      if (result.isConfirmed) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        // Redirect to login page
        const isSubPage = window.location.pathname.includes('/pages/');
        window.location.href = isSubPage ? 'login.html' : 'pages/login.html';
      }
    });
  };

  const logoutSidebar = document.getElementById('btn-logout-sidebar');
  const logoutNavbar = document.getElementById('btn-logout-navbar');
  if (logoutSidebar) logoutSidebar.addEventListener('click', handleLogout);
  if (logoutNavbar) logoutNavbar.addEventListener('click', handleLogout);
}

// Global Loader controls
window.AssetFlowLoader = {
  show: function() {
    let loader = document.getElementById('global-loader');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'global-loader';
      loader.className = 'loader-wrapper';
      loader.innerHTML = '<span class="loader"></span>';
      document.body.appendChild(loader);
    } else {
      loader.style.display = 'flex';
      loader.style.opacity = '1';
    }
  },
  hide: function() {
    const loader = document.getElementById('global-loader');
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => {
        loader.style.display = 'none';
      }, 500);
    }
  }
};

async function loadNavbarNotifications() {
  const badge = document.querySelector('#notifications-dropdown .badge');
  const dropdownMenu = document.querySelector('[aria-labelledby="notifications-dropdown"]');
  if (!dropdownMenu) return;

  try {
    const list = await window.ApiService.notifications.list();
    const unreadCount = list.filter(n => !n.read).length;
    
    if (badge) {
      if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }

    // Clear previous items (except the header)
    const items = dropdownMenu.querySelectorAll('li');
    items.forEach(item => item.remove());

    if (list.length === 0) {
      const li = document.createElement('li');
      li.className = 'px-3 py-3 text-center text-muted small';
      li.textContent = 'No new notifications';
      dropdownMenu.appendChild(li);
      return;
    }

    // Limit to top 3 notifications
    const displayList = list.slice(0, 3);
    const pagePrefix = window.location.pathname.includes('/pages/') ? '' : 'pages/';

    displayList.forEach(n => {
      const li = document.createElement('li');
      
      let iconClass = 'fa-info-circle';
      let iconColorClass = 'bg-info-subtle text-info';
      if (n.type === 'warning') {
        iconClass = 'fa-triangle-exclamation';
        iconColorClass = 'bg-warning-subtle text-warning';
      } else if (n.type === 'success') {
        iconClass = 'fa-circle-check';
        iconColorClass = 'bg-success-subtle text-success';
      }

      li.innerHTML = `
        <a class="dropdown-item py-2.5 d-flex align-items-start gap-2 rounded-3 mt-1" href="${pagePrefix}notifications.html">
          <div class="${iconColorClass} p-2 rounded-circle fs-6" style="width:32px; height:32px; display:flex; align-items:center; justify-content:center; flex-shrink: 0;">
            <i class="fa-solid ${iconClass}"></i>
          </div>
          <div class="overflow-hidden">
            <p class="mb-0 fw-semibold text-truncate-2 small text-dark-custom" style="color: var(--text-color);">${escapeHtml(n.title)}</p>
            <p class="mb-0 text-muted small text-truncate">${escapeHtml(n.message)}</p>
          </div>
        </a>
      `;
      dropdownMenu.appendChild(li);
    });
  } catch (err) {
    console.error("Failed to load navbar notifications:", err);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
