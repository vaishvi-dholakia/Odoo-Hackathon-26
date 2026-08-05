/**
 * AssetFlow Notifications JS
 * Manages notifications, reading alerts, and clearing active notification profiles.
 */

document.addEventListener('DOMContentLoaded', async () => {
  window.AssetFlowLoader.show();
  try {
    await loadNotifications();
    setupEventListeners();
  } catch (err) {
    console.error(err);
  } finally {
    window.AssetFlowLoader.hide();
  }
});

async function loadNotifications() {
  const container = document.getElementById('notifications-list-container');
  if (!container) return;

  try {
    const list = await window.ApiService.notifications.list();
    
    if (list.length === 0) {
      container.innerHTML = `
        <div class="empty-state py-5 card-custom">
          <i class="fa-solid fa-bell-slash text-muted d-block fs-2 mb-3"></i>
          <h5 class="fw-bold">All caught up!</h5>
          <p class="text-muted small">You don't have any system notifications at this time.</p>
        </div>
      `;
      return;
    }

    let html = '';
    list.forEach(n => {
      let iconColor = 'text-primary bg-primary-subtle';
      let icon = 'fa-info-circle';
      if (n.type === 'warning') {
        iconColor = 'text-warning bg-warning-subtle';
        icon = 'fa-triangle-exclamation';
      } else if (n.type === 'success') {
        iconColor = 'text-success bg-success-subtle';
        icon = 'fa-circle-check';
      }

      html += `
        <div class="notif-card ${n.read ? '' : 'unread'}" data-id="${n.id}">
          <div class="d-flex align-items-start gap-3">
            <div class="${iconColor} rounded-circle p-2.5 d-flex align-items-center justify-content-center" style="width: 40px; height: 40px;">
              <i class="fa-solid ${icon} fs-5"></i>
            </div>
            <div class="flex-grow-1">
              <div class="d-flex justify-content-between align-items-start mb-1 flex-wrap gap-1">
                <h6 class="mb-0 fw-bold text-dark-custom" style="color: var(--text-color);">${n.title}</h6>
                <small class="text-muted fs-8">${n.date}</small>
              </div>
              <p class="text-muted small mb-0">${n.message}</p>
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="alert alert-danger">Error loading notifications: ${err.message}</div>`;
  }
}

function setupEventListeners() {
  const container = document.getElementById('notifications-list-container');
  if (container) {
    // Card click event to mark as read
    container.addEventListener('click', async (e) => {
      const card = e.target.closest('.notif-card');
      if (!card || !card.classList.contains('unread')) return;

      const id = card.getAttribute('data-id');
      try {
        await window.ApiService.notifications.markAsRead(id);
        
        // Remove unread visual class
        card.classList.remove('unread');
        
        // Trigger small success toast
        const Toast = Swal.mixin({
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 1000,
        });
        Toast.fire({
          icon: 'success',
          title: 'Marked as read'
        });
      } catch (err) {
        console.error(err);
      }
    });
  }

  // Handle Send Notification visibility
  const currentUser = JSON.parse(localStorage.getItem('user')) || {};
  const openModalBtn = document.getElementById('btn-open-send-notif-modal');
  if (openModalBtn && (currentUser.role === 'Admin' || currentUser.role === 'Asset Manager')) {
    openModalBtn.classList.remove('d-none');
  }

  // Handle target dropdown toggle
  const targetType = document.getElementById('notif-target-type');
  const roleGroup = document.getElementById('notif-role-group');
  const emailGroup = document.getElementById('notif-email-group');
  if (targetType && roleGroup && emailGroup) {
    targetType.addEventListener('change', () => {
      const val = targetType.value;
      if (val === 'role') {
        roleGroup.classList.remove('d-none');
        emailGroup.classList.add('d-none');
      } else if (val === 'email') {
        roleGroup.classList.add('d-none');
        emailGroup.classList.remove('d-none');
      } else {
        roleGroup.classList.add('d-none');
        emailGroup.classList.add('d-none');
      }
    });
  }

  // Form submission handler
  const sendForm = document.getElementById('send-notification-form');
  if (sendForm) {
    sendForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const title = document.getElementById('notif-title').value.trim();
      const message = document.getElementById('notif-message').value.trim();
      const type = document.getElementById('notif-type').value;
      const targetVal = targetType.value;
      
      if (!title || !message) {
        Swal.fire('Validation Error', 'Title and message are required fields.', 'warning');
        return;
      }

      let targetRole = null;
      let targetUserEmail = null;

      if (targetVal === 'role') {
        targetRole = document.getElementById('notif-target-role').value;
      } else if (targetVal === 'email') {
        targetUserEmail = document.getElementById('notif-target-email').value.trim();
        if (!targetUserEmail) {
          Swal.fire('Validation Error', 'Please enter a target email address.', 'warning');
          return;
        }
      }

      const spinner = document.getElementById('send-notif-spinner');
      const submitBtn = document.getElementById('btn-submit-notif');
      if (spinner) spinner.classList.remove('d-none');
      if (submitBtn) submitBtn.disabled = true;

      try {
        await window.ApiService.notifications.create({
          title,
          message,
          type,
          targetRole,
          targetUserEmail
        });

        // Close modal
        const modalEl = document.getElementById('sendNotificationModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();

        sendForm.reset();
        if (roleGroup) roleGroup.classList.add('d-none');
        if (emailGroup) emailGroup.classList.add('d-none');

        Swal.fire({
          title: 'Notification Sent',
          text: 'Alert was broadcasted or routed successfully.',
          icon: 'success',
          confirmButtonColor: '#2563EB'
        });

        await loadNotifications();
      } catch (err) {
        Swal.fire('Error Sending Alert', err.message, 'error');
      } finally {
        if (spinner) spinner.classList.add('d-none');
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // Clear all button action
  const clearBtn = document.getElementById('btn-clear-all-notifs');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      Swal.fire({
        title: 'Clear All Notifications?',
        text: 'This action will delete all read and unread notifications from your inbox.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EF4444',
        cancelButtonColor: '#64748B',
        confirmButtonText: 'Yes, clear all',
        cancelButtonText: 'Cancel'
      }).then(async (result) => {
        if (result.isConfirmed) {
          window.AssetFlowLoader.show();
          try {
            await window.ApiService.notifications.clearAll();
            
            Swal.fire({
              title: 'Cleared',
              text: 'All notifications cleared.',
              icon: 'success',
              confirmButtonColor: '#2563EB'
            });

            await loadNotifications();
          } catch (err) {
            Swal.fire('Error', err.message, 'error');
          } finally {
            window.AssetFlowLoader.hide();
          }
        }
      });
    });
  }
}
