/**
 * AssetFlow Resource Booking JS
 * Handles resource scheduling calendars, timeline events rendering, and reservation creations/cancellations.
 */

let calendar = null;
let bookingModal = null;

document.addEventListener('DOMContentLoaded', async () => {
  window.AssetFlowLoader.show();
  try {
    bookingModal = new bootstrap.Modal(document.getElementById('bookingModal'));
    initCalendar();
    await loadResourceOptions();
    await loadBookings();
    setupEventListeners();
  } catch (err) {
    console.error(err);
  } finally {
    window.AssetFlowLoader.hide();
  }
});

function initCalendar() {
  const calendarEl = document.getElementById('calendar-widget');
  if (!calendarEl) return;

  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    height: 480,
    expandRows: true,
    aspectRatio: 1.5,
    fixedWeekCount: false,
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek'
    },
    events: [],
    eventContent: function(arg) {
      const b = arg.event.extendedProps;
      if (!b) return;
      return {
        html: `
          <div class="p-1 overflow-hidden" style="line-height: 1.2; white-space: normal; word-break: break-word;">
            <div class="fw-bold" style="font-size: 0.68rem;"><i class="fa-regular fa-clock me-1"></i>${b.startTime}-${b.endTime}</div>
            <div class="fw-semibold" style="font-size: 0.72rem;">${escapeHtml(b.resourceName)}</div>
            <div style="font-size: 0.68rem; opacity: 0.9;">By: ${escapeHtml(b.bookedBy)}</div>
          </div>
        `
      };
    },
    eventClick: function(info) {
      const b = info.event.extendedProps;
      Swal.fire({
        title: info.event.title,
        html: `
          <div class="text-start">
            <p><strong>Booked By:</strong> ${b.bookedBy}</p>
            <p><strong>Date:</strong> ${b.date}</p>
            <p><strong>Time Slot:</strong> ${b.startTime} - ${b.endTime}</p>
            <p><strong>Status:</strong> ${b.status}</p>
          </div>
        `,
        icon: 'info',
        confirmButtonColor: '#2563EB'
      });
    }
  });

  calendar.render();
}

async function loadResourceOptions() {
  try {
    const assets = await window.ApiService.assets.list();
    const modalSelect = document.getElementById('booking-resource');
    const quickSelect = document.getElementById('quick-booking-resource');

    let optionsHtml = '<option value="">Choose a resource...</option>';

    if (assets && assets.length > 0) {
      assets.forEach(ast => {
        const typeLabel = ast.type ? ` (${escapeHtml(ast.type)})` : '';
        optionsHtml += `<option value="${escapeHtml(ast.name)}">${escapeHtml(ast.name)}${typeLabel}</option>`;
      });
    } else {
      optionsHtml = '<option value="">No registered assets available</option>';
    }

    if (modalSelect) modalSelect.innerHTML = optionsHtml;
    if (quickSelect) quickSelect.innerHTML = optionsHtml;

    // Default quick booking date to today
    const quickDate = document.getElementById('quick-booking-date');
    if (quickDate && !quickDate.value) {
      quickDate.value = new Date().toISOString().split('T')[0];
    }
  } catch (err) {
    console.error("Failed to load resource options:", err);
  }
}

let allBookingsList = [];

async function loadBookings() {
  try {
    const bookings = await window.ApiService.bookings.list();
    allBookingsList = bookings;
    const role = window.RbacService.getCurrentUserRole();

    // 1. Populate Calendar Events with dynamic color palette
    const colorPalette = ['#2563EB', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#6366F1'];
    const resourceColorMap = {};
    let colorIdx = 0;

    const events = [];
    bookings.forEach(b => {
      if (!resourceColorMap[b.resourceName]) {
        resourceColorMap[b.resourceName] = colorPalette[colorIdx % colorPalette.length];
        colorIdx++;
      }

      if (b.status === 'Confirmed') {
        events.push({
          title: `${b.resourceName} (${b.bookedBy})`,
          start: `${b.date}T${b.startTime}:00`,
          end: `${b.date}T${b.endTime}:00`,
          color: resourceColorMap[b.resourceName] || '#2563EB',
          display: 'block',
          extendedProps: b
        });
      }
    });

    if (calendar) {
      calendar.removeAllEvents();
      calendar.addEventSource(events);
    }

    // 2. Populate Active Bookings List
    const bookingsListEl = document.getElementById('my-bookings-list');
    if (bookingsListEl) {
      let listHtml = '';
      if (bookings.length === 0) {
        listHtml = `
          <div class="empty-state py-4 text-center">
            <i class="fa-solid fa-calendar-xmark d-block fs-3 mb-2 text-muted"></i>
            <p class="text-muted small mb-0">No bookings scheduled.</p>
          </div>
        `;
      } else {
        bookings.forEach(b => {
          let cancelBtnHtml = '';
          if (b.status === 'Confirmed' && role !== 'Employee') {
            cancelBtnHtml = `
              <button class="btn btn-sm btn-link text-danger text-decoration-none fw-semibold p-0 btn-cancel-booking" data-id="${b.id}">
                Cancel
              </button>
            `;
          }

          let statusBadge = 'bg-success';
          if (b.status === 'Cancelled') statusBadge = 'bg-danger';

          listHtml += `
            <div class="border-bottom pb-2 mb-2 last-no-border">
              <div class="d-flex justify-content-between align-items-start mb-1">
                <span class="fw-semibold text-dark-custom fs-7" style="color: var(--text-color);">${escapeHtml(b.resourceName)}</span>
                <span class="badge ${statusBadge} rounded-pill px-2 py-0.5" style="font-size:0.68rem;">${b.status}</span>
              </div>
              <p class="text-muted small mb-1 fs-8"><i class="fa-regular fa-clock me-1"></i>${b.date} (${b.startTime} - ${b.endTime})</p>
              <div class="d-flex justify-content-between align-items-center">
                <small class="text-muted fs-8">By: ${escapeHtml(b.bookedBy)}</small>
                ${cancelBtnHtml}
              </div>
            </div>
          `;
        });
      }
      bookingsListEl.innerHTML = listHtml;
    }

    // 3. Trigger Live Conflict Check
    checkConflictAndRenderTimeline();

  } catch (err) {
    console.error(err);
  }
}

function runAiResourceDetection(selectedResource) {
  const cardEl = document.getElementById('ai-resource-detection-card');
  const countBadge = document.getElementById('ai-booking-count-badge');
  const scheduleList = document.getElementById('ai-resource-booking-schedule-list');

  if (!cardEl || !countBadge || !scheduleList) return;

  if (!selectedResource) {
    cardEl.classList.add('d-none');
    return;
  }

  cardEl.classList.remove('d-none');

  // Filter confirmed bookings for this specific resource
  const resBookings = allBookingsList.filter(b => 
    b.status === 'Confirmed' && 
    b.resourceName.toLowerCase().includes(selectedResource.toLowerCase())
  );

  countBadge.textContent = `${resBookings.length} Active Booking(s)`;

  if (resBookings.length === 0) {
    scheduleList.innerHTML = `
      <div class="p-3 text-success fs-7 fw-bold bg-success-subtle rounded-3 border border-success-subtle d-flex align-items-center gap-2">
        <i class="fa-solid fa-circle-check fs-5 text-success"></i>
        <div>
          <div class="fw-bold">100% Available</div>
          <div class="fw-normal fs-8 opacity-75">No active reservations found for this resource.</div>
        </div>
      </div>
    `;
  } else {
    let listHtml = '';
    resBookings.forEach(b => {
      listHtml += `
        <div class="p-3 mb-2 rounded-3 border border-danger-subtle bg-white shadow-sm d-flex flex-column gap-2" style="border-left: 4px solid #EF4444 !important; overflow: hidden;">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
            <span class="badge bg-danger text-white px-2.5 py-1 fs-7 fw-bold rounded-pill text-truncate" style="max-width: 100%;">
              <i class="fa-solid fa-user me-1"></i>Booked by ${escapeHtml(b.bookedBy)}
            </span>
            <span class="fs-7 fw-bold text-danger"><i class="fa-solid fa-calendar-day me-1"></i>${b.date}</span>
          </div>

          <div class="d-flex align-items-center flex-wrap gap-2 pt-1">
            <span class="fw-semibold text-muted fs-7"><i class="fa-regular fa-clock me-1 text-danger"></i>Time Window:</span>
            <span class="bg-danger-subtle text-danger px-2.5 py-1 rounded-2 border border-danger-subtle fw-bold fs-7">${b.startTime} — ${b.endTime}</span>
          </div>
        </div>
      `;
    });
    scheduleList.innerHTML = listHtml;
  }
}

function checkConflictAndRenderTimeline() {
  const resourceEl = document.getElementById('quick-booking-resource');
  const dateEl = document.getElementById('quick-booking-date');
  const startEl = document.getElementById('quick-booking-start');
  const endEl = document.getElementById('quick-booking-end');
  const alertEl = document.getElementById('quick-booking-conflict-alert');
  const gridEl = document.getElementById('visual-time-slot-grid');
  const submitBtn = document.getElementById('btn-quick-reserve');

  if (!resourceEl || !dateEl || !startEl || !endEl || !alertEl || !gridEl) return;

  const selectedResource = resourceEl.value;
  const selectedDate = dateEl.value;
  const startTime = startEl.value;
  const endTime = endEl.value;

  // Run AI Detection for selected resource
  runAiResourceDetection(selectedResource);

  if (!selectedResource || !selectedDate) {
    alertEl.classList.add('d-none');
    gridEl.innerHTML = '<span class="text-muted fs-8 italic">Select a resource and date to inspect slots...</span>';
    if (submitBtn) submitBtn.disabled = false;
    return;
  }

  // Filter confirmed bookings for this resource & date
  const dayBookings = allBookingsList.filter(b => 
    b.status === 'Confirmed' &&
    b.resourceName === selectedResource &&
    b.date === selectedDate
  );

  // 1. Render Visual Hourly Slots Grid (8 AM to 6 PM)
  const hours = [
    { label: '8 AM', start: '08:00', end: '09:00' },
    { label: '9 AM', start: '09:00', end: '10:00' },
    { label: '10 AM', start: '10:00', end: '11:00' },
    { label: '11 AM', start: '11:00', end: '12:00' },
    { label: '12 PM', start: '12:00', end: '13:00' },
    { label: '1 PM', start: '13:00', end: '14:00' },
    { label: '2 PM', start: '14:00', end: '15:00' },
    { label: '3 PM', start: '15:00', end: '16:00' },
    { label: '4 PM', start: '16:00', end: '17:00' },
    { label: '5 PM', start: '17:00', end: '18:00' }
  ];

  let gridHtml = '';
  hours.forEach(h => {
    const isBooked = dayBookings.some(b => (h.start < b.endTime && h.end > b.startTime));
    if (isBooked) {
      const bObj = dayBookings.find(b => (h.start < b.endTime && h.end > b.startTime));
      const bookedByName = bObj ? bObj.bookedBy : 'Staff';
      gridHtml += `
        <span class="badge bg-danger-subtle text-danger border border-danger-subtle px-2 py-1 fs-8 slot-badge" title="Booked by ${escapeHtml(bookedByName)}" style="cursor: not-allowed;">
          <i class="fa-solid fa-lock me-1"></i>${h.label}
        </span>
      `;
    } else {
      gridHtml += `
        <span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1 fs-8 slot-badge btn-select-time-slot" data-start="${h.start}" data-end="${h.end}" style="cursor: pointer;" title="Click to select this slot">
          <i class="fa-solid fa-check me-1"></i>${h.label}
        </span>
      `;
    }
  });
  gridEl.innerHTML = gridHtml;

  // 2. Real-Time Conflict Detection for current selected time window
  if (startTime && endTime) {
    const conflict = dayBookings.find(b => (startTime < b.endTime && endTime > b.startTime));
    
    if (conflict) {
      alertEl.className = 'alert alert-danger py-2 px-3 mt-3 mb-3.5 rounded-2 border-danger d-block';
      alertEl.style.fontSize = '0.78rem';
      alertEl.innerHTML = `
        <div class="d-flex align-items-start gap-2">
          <i class="fa-solid fa-triangle-exclamation text-danger mt-0.5 fs-7"></i>
          <div>
            <div class="fw-bold text-danger">⚠️ Scheduling Conflict Detected</div>
            <div><strong>${escapeHtml(selectedResource)}</strong> is reserved by <strong>${escapeHtml(conflict.bookedBy)}</strong> (${conflict.startTime} - ${conflict.endTime}).</div>
          </div>
        </div>
      `;
      if (submitBtn) submitBtn.disabled = true;
    } else {
      alertEl.className = 'alert alert-success py-1.5 px-3 mt-3 mb-3.5 rounded-2 border-success d-block';
      alertEl.style.fontSize = '0.78rem';
      alertEl.innerHTML = `
        <div class="d-flex align-items-center gap-2 text-success">
          <i class="fa-solid fa-circle-check fs-7"></i>
          <span class="fw-semibold">Slot Available! No conflicts detected for this time.</span>
        </div>
      `;
      if (submitBtn) submitBtn.disabled = false;
    }
  }
}

function setupEventListeners() {
  // Live input listeners for Smart Conflict Detector
  ['quick-booking-resource', 'quick-booking-date', 'quick-booking-start', 'quick-booking-end'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', checkConflictAndRenderTimeline);
      el.addEventListener('keyup', checkConflictAndRenderTimeline);
      el.addEventListener('input', checkConflictAndRenderTimeline);
    }
  });

  // Handle clicking visual time slot badges
  const gridEl = document.getElementById('visual-time-slot-grid');
  if (gridEl) {
    gridEl.addEventListener('click', (e) => {
      const badge = e.target.closest('.btn-select-time-slot');
      if (!badge) return;
      const start = badge.getAttribute('data-start');
      const end = badge.getAttribute('data-end');
      if (start && end) {
        document.getElementById('quick-booking-start').value = start;
        document.getElementById('quick-booking-end').value = end;
        checkConflictAndRenderTimeline();
      }
    });
  }
  // Quick Reserve Form Submission
  const quickForm = document.getElementById('quick-booking-form');
  if (quickForm) {
    quickForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const resourceName = document.getElementById('quick-booking-resource').value;
      const date = document.getElementById('quick-booking-date').value;
      const startTime = document.getElementById('quick-booking-start').value;
      const endTime = document.getElementById('quick-booking-end').value;

      if (!resourceName) {
        Swal.fire('Validation Error', 'Please select a resource to reserve.', 'warning');
        return;
      }
      if (!date || !startTime || !endTime) {
        Swal.fire('Validation Error', 'Please complete date and time slots.', 'warning');
        return;
      }

      const user = window.RbacService.getCurrentUser() || {};
      const bookedBy = user.fullName || user.name || user.email || 'Staff Member';

      window.AssetFlowLoader.show();
      try {
        await window.ApiService.bookings.create({
          resourceName,
          bookedBy,
          date,
          startTime,
          endTime,
          department: user.department || 'General'
        });

        Swal.fire({
          title: 'Resource Reserved!',
          text: `Successfully reserved ${resourceName} for ${date} (${startTime} - ${endTime}).`,
          icon: 'success',
          confirmButtonColor: '#2563EB'
        });

        quickForm.reset();
        const quickDate = document.getElementById('quick-booking-date');
        if (quickDate) quickDate.value = new Date().toISOString().split('T')[0];

        await loadBookings();
      } catch (err) {
        Swal.fire('Booking Conflict', err.message || 'Time slot is unavailable.', 'error');
      } finally {
        window.AssetFlowLoader.hide();
      }
    });
  }

  // Modal open
  const openBtn = document.getElementById('btn-open-booking-modal');
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      document.getElementById('booking-form').reset();
      
      // Auto-set date to today
      const dateInput = document.getElementById('booking-date');
      if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

      // Auto-populate logged-in user name
      const user = JSON.parse(localStorage.getItem('user'));
      if (user && user.name) {
        document.getElementById('booking-name').value = user.name;
      }
      
      // Clear errors
      document.querySelectorAll('.invalid-feedback').forEach(el => el.textContent = '');
      document.querySelectorAll('.form-control, .form-select').forEach(el => el.classList.remove('is-invalid'));

      bookingModal.show();
    });
  }

  // Cancel action
  const listEl = document.getElementById('my-bookings-list');
  if (listEl) {
    listEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('.btn-cancel-booking');
      if (!btn) return;

      const role = window.RbacService.getCurrentUserRole();
      if (role === 'Employee') {
        Swal.fire('Access Denied', 'Employees are not allowed to cancel bookings.', 'error');
        return;
      }

      const id = btn.getAttribute('data-id');

      Swal.fire({
        title: 'Cancel Booking?',
        text: 'Are you sure you want to cancel this booking reservation?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EF4444',
        cancelButtonColor: '#64748B',
        confirmButtonText: 'Yes, cancel booking',
        cancelButtonText: 'No'
      }).then(async (result) => {
        if (result.isConfirmed) {
          window.AssetFlowLoader.show();
          try {
            await window.ApiService.bookings.cancel(id);
            Swal.fire({
              title: 'Cancelled',
              text: 'Booking has been cancelled.',
              icon: 'success',
              confirmButtonColor: '#2563EB'
            });
            await loadBookings();
          } catch (err) {
            Swal.fire('Error', err.message, 'error');
          } finally {
            window.AssetFlowLoader.hide();
          }
        }
      });
    });
  }

  // Modal Submit
  const form = document.getElementById('booking-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Clear errors
      document.querySelectorAll('.invalid-feedback').forEach(el => el.textContent = '');
      document.querySelectorAll('.form-control, .form-select').forEach(el => el.classList.remove('is-invalid'));

      const resourceName = document.getElementById('booking-resource').value;
      const bookedBy = document.getElementById('booking-name').value.trim();
      const date = document.getElementById('booking-date').value;
      const startTime = document.getElementById('booking-start').value;
      const endTime = document.getElementById('booking-end').value;

      let isValid = true;

      if (!resourceName) {
        showError('booking-resource', 'Please select a resource.');
        isValid = false;
      }
      if (!bookedBy) {
        showError('booking-name', 'Please enter booking name.');
        isValid = false;
      }
      if (!date) {
        showError('booking-date', 'Please select date.');
        isValid = false;
      }
      if (!startTime) {
        showError('booking-start', 'Start time is required.');
        isValid = false;
      }
      if (!endTime) {
        showError('booking-end', 'End time is required.');
        isValid = false;
      } else if (startTime && endTime && startTime >= endTime) {
        showError('booking-end', 'End time must be after start time.');
        isValid = false;
      }

      if (!isValid) return;

      const spinner = document.getElementById('booking-spinner');
      const submitBtn = document.getElementById('btn-save-booking');
      if (spinner) spinner.classList.remove('d-none');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const payload = {
          resourceName,
          bookedBy,
          date,
          startTime,
          endTime
        };

        await window.ApiService.bookings.create(payload);

        Swal.fire({
          title: 'Booking Confirmed!',
          text: `You have successfully booked ${resourceName}.`,
          icon: 'success',
          confirmButtonColor: '#2563EB'
        });

        bookingModal.hide();
        await loadBookings();
      } catch (err) {
        Swal.fire('Error', err.message, 'error');
      } finally {
        if (spinner) spinner.classList.add('d-none');
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // Connect timeline book shortcut
  const timelineBookBtn = document.getElementById('btn-timeline-book-shortcut');
  if (timelineBookBtn) {
    timelineBookBtn.addEventListener('click', () => {
      const resourceVal = document.getElementById('timeline-resource-select').value;
      const openBtn = document.getElementById('btn-open-booking-modal');
      if (openBtn) openBtn.click();
      
      // Auto-set the selected resource in the booking modal select field
      setTimeout(() => {
        const modalSelect = document.getElementById('booking-resource');
        if (modalSelect && resourceVal) {
          modalSelect.value = resourceVal;
        }
      }, 300);
    });
  }

  // Handle timeline resource select toggle
  const resourceSelect = document.getElementById('timeline-resource-select');
  if (resourceSelect) {
    resourceSelect.addEventListener('change', async (e) => {
      const val = e.target.value;
      const timelineGrid = document.querySelector('#btn-timeline-book-shortcut')?.previousElementSibling;
      if (!timelineGrid || !val) return;
      
      try {
        const bookings = await window.ApiService.bookings.list();
        const todayStr = new Date().toISOString().split('T')[0];
        const resourceBookings = bookings.filter(b => b.resourceName === val && b.status === 'Confirmed' && b.date === todayStr);

        if (resourceBookings.length > 0) {
          timelineGrid.innerHTML = resourceBookings.map(b => `
            <div class="p-2.5 bg-primary-subtle text-primary border border-primary-subtle rounded-3 small mb-2">
              <div class="fw-bold"><i class="fa-regular fa-clock me-1"></i>${escapeHtml(b.startTime)} - ${escapeHtml(b.endTime)}</div>
              <div class="small text-muted">Booked by: ${escapeHtml(b.bookedBy)}</div>
            </div>
          `).join('');
        } else {
          timelineGrid.innerHTML = `
            <div class="p-3 text-center text-muted small border rounded-3 border-dashed border-secondary-subtle">
              No bookings scheduled for <strong>${escapeHtml(val)}</strong> today.
            </div>
          `;
        }
      } catch (err) {
        console.error("Failed to filter timeline:", err);
      }
    });
  }
}

function showError(id, message) {
  const errEl = document.getElementById(`${id}-error`);
  const inputEl = document.getElementById(id);
  if (errEl) errEl.textContent = message;
  if (inputEl) inputEl.classList.add('is-invalid');
}
