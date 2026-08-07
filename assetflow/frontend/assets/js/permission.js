/**
 * AssetFlow RBAC (Role-Based Access Control) Module
 * Handles permissions, page access authorization, and dynamic UI element visibility.
 */

const permissions = {
  'Admin': {
    pages: ['dashboard.html', 'org-setup.html', 'assets.html', 'booking.html', 'maintenance.html', 'audit.html', 'reports.html', 'notifications.html', 'profile.html'],
    actions: [
      'register_asset', 'create_department', 'add_category', 'start_audit', 'view_reports', 
      'approve_maintenance', 'book_resource', 'raise_maintenance'
    ]
  },
  'Asset Manager': {
    pages: ['dashboard.html', 'assets.html', 'allocation.html', 'booking.html', 'maintenance.html', 'audit.html', 'reports.html', 'notifications.html', 'profile.html'],
    actions: [
      'register_asset', 'allocate_asset', 'approve_transfer', 'approve_maintenance', 
      'book_resource', 'raise_maintenance', 'request_transfer', 'request_return', 'approve_allocation'
    ]
  },
  'AssetManager': {
    pages: ['dashboard.html', 'assets.html', 'allocation.html', 'booking.html', 'maintenance.html', 'audit.html', 'reports.html', 'notifications.html', 'profile.html'],
    actions: [
      'register_asset', 'allocate_asset', 'approve_transfer', 'approve_maintenance', 
      'book_resource', 'raise_maintenance', 'request_transfer', 'request_return', 'approve_allocation'
    ]
  },
  'Department Head': {
    pages: ['dashboard.html', 'assets.html', 'allocation.html', 'booking.html', 'reports.html', 'notifications.html', 'profile.html'],
    actions: [
      'approve_allocation', 'approve_transfer', 'book_resource', 'request_transfer', 'request_return'
    ]
  },
  'DepartmentHead': {
    pages: ['dashboard.html', 'assets.html', 'allocation.html', 'booking.html', 'reports.html', 'notifications.html', 'profile.html'],
    actions: [
      'approve_allocation', 'approve_transfer', 'book_resource', 'request_transfer', 'request_return'
    ]
  },
  'Employee': {
    pages: ['dashboard.html', 'assets.html', 'booking.html', 'maintenance.html', 'notifications.html', 'profile.html'],
    actions: [
      'book_resource', 'raise_maintenance', 'request_transfer', 'request_return', 'request_asset'
    ]
  }
};

/**
 * Check if the user has a specific permission
 */
function hasPermission(role, action) {
  if (!role || !permissions[role]) return false;
  return permissions[role].actions.includes(action);
}

/**
 * Check if the user can access a specific page
 */
function canAccessPage(role, pageName) {
  if (!role || !permissions[role]) return false;
  // Normalize page name (e.g. remove path prefix)
  const cleanPageName = pageName.split('/').pop().split('?')[0];
  
  // Dashboard is accessible to everyone
  if (cleanPageName === 'dashboard.html' || cleanPageName === 'index.html' || cleanPageName === '') return true;
  
  return permissions[role].pages.includes(cleanPageName);
}

/**
 * Get current user information from local storage
 */
function getCurrentUser() {
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch (e) {
    return null;
  }
}

/**
 * Get current user's role
 */
function getCurrentUserRole() {
  const user = getCurrentUser();
  return user ? user.role : null;
}

/**
 * Authorize the page access and redirect if unauthorized
 */
function authorizePage() {
  const role = getCurrentUserRole();
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  
  // Skip auth pages
  const authPages = ['login.html', 'signup.html', 'forgot-password.html', 'otp-verification.html', 'reset-password.html', 'index.html', ''];
  if (authPages.includes(currentPath)) return;
  
  if (!role || !canAccessPage(role, currentPath)) {
    console.warn(`Access Denied to ${currentPath} for role: ${role}`);
    
    // Show SweetAlert and redirect
    setTimeout(() => {
      Swal.fire({
        title: 'Access Denied',
        text: 'You do not have permission to access this page.',
        icon: 'error',
        confirmButtonColor: '#2563EB',
        confirmButtonText: 'Back to Dashboard'
      }).then(() => {
        window.location.href = 'dashboard.html';
      });
    }, 100);
  }
}

// Run authorization check on script load
document.addEventListener('DOMContentLoaded', () => {
  authorizePage();
  
  // Apply element-level action permissions
  const role = getCurrentUserRole();
  if (role) {
    document.querySelectorAll('[data-permission-action]').forEach(el => {
      const action = el.getAttribute('data-permission-action');
      if (!hasPermission(role, action)) {
        el.style.display = 'none'; // Hide unauthorized elements
      }
    });
  }
});

// Expose variables globally
window.RbacService = {
  permissions,
  hasPermission,
  canAccessPage,
  getCurrentUser,
  getCurrentUserRole,
  authorizePage
};
