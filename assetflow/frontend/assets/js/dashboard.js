/**
 * AssetFlow Dashboard JS
 * Manages stats loading, recent bookings table, activity timeline, and responsive Chart.js widgets.
 * Dynamically switches layouts, charts, and actions based on user's role (RBAC).
 */

let chartsList = [];

document.addEventListener('DOMContentLoaded', async () => {
  window.AssetFlowLoader.show();
  try {
    const role = window.RbacService.getCurrentUserRole() || 'Employee';
    
    // Set welcome text based on role
    document.getElementById('dashboard-welcome-title').textContent = `Dashboard - ${role} Portal`;
    document.getElementById('dashboard-welcome-desc').textContent = `Welcome back! Real-time status for the ${role} role.`;

    await loadDashboardData(role);

    // Re-render charts on theme change
    window.addEventListener('themeChanged', () => {
      if (window.dashboardData) {
        renderRoleCharts(role, window.dashboardData);
      }
    });
  } catch (err) {
    console.error(err);
  } finally {
    window.AssetFlowLoader.hide();
  }
});

async function loadDashboardData(role) {
  try {
    // 1. Fetch data from services in parallel
    const [assets, allocations, bookings, maintenance, notifications, departments, registeredUsers] = await Promise.all([
      window.ApiService.assets.list(),
      window.ApiService.allocations.list(),
      window.ApiService.bookings.list(),
      window.ApiService.maintenance.list(),
      window.ApiService.notifications.list(),
      window.ApiService.departments ? window.ApiService.departments.list() : Promise.resolve([]),
      (window.ApiService.users && role === 'Admin') ? window.ApiService.users.list() : Promise.resolve([])
    ]);

    const currentUser = window.RbacService.getCurrentUser() || {};
    const userDept = currentUser.department || 'IT';
    const userName = currentUser.fullName || currentUser.name || currentUser.email || 'Employee';

    let filteredAssets = assets;
    let filteredAllocations = allocations;
    let filteredBookings = bookings;

    if (role === 'Department Head' || role === 'DepartmentHead') {
      const deptAllocatedAssetIds = allocations
        .filter(a => a.department === userDept && a.status === 'Approved')
        .map(a => a.assetId);
      filteredAssets = assets.filter(a => deptAllocatedAssetIds.includes(a.id) || a.owner === userName);
      filteredAllocations = allocations.filter(a => a.department === userDept);
      filteredBookings = bookings.filter(b => b.department === userDept);
    } else if (role === 'Employee') {
      filteredAssets = assets.filter(a => a.owner === userName);
      filteredAllocations = allocations.filter(a => a.allocatedTo === userName);
      filteredBookings = bookings.filter(b => b.bookedBy === userName);
    }

    const totalValue = filteredAssets.reduce((sum, asset) => sum + (Number(asset.value) || 0), 0);

    const data = {
      assets: filteredAssets,
      allocations: filteredAllocations,
      bookings: filteredBookings,
      maintenance,
      notifications,
      totalValue,
      departments,
      registeredUsers
    };

    window.dashboardData = data;

    // 2. Build Quick Actions
    buildQuickActions(role);

    // 3. Build KPI Cards
    buildKpiCards(role, data);

    // 4. Build Charts Structure & Render
    buildChartsContainer(role);
    renderRoleCharts(role, data);

    // 5. Build Dynamic Tables and Timeline Details
    buildDetailsRow(role, data);

  } catch (err) {
    console.error("Dashboard data load error:", err);
    Swal.fire({
      title: 'Error Loading Dashboard',
      text: err.message,
      icon: 'error',
      confirmButtonColor: '#2563EB'
    });
  }
}

function buildQuickActions(role) {
  const card = document.getElementById('quick-actions-card');
  const container = document.getElementById('quick-actions-container');
  if (!card || !container) return;

  let actions = [];
  if (role === 'Admin') {
    actions = [
      { label: 'Register Asset', icon: 'fa-plus', link: 'assets.html?action=new', cls: 'btn-primary-custom text-white' },
      { label: 'Create Department', icon: 'fa-sitemap', link: 'org-setup.html', cls: 'btn-secondary-custom' },
      { label: 'Add Category', icon: 'fa-tags', link: 'org-setup.html', cls: 'btn-secondary-custom' },
      { label: 'Start Audit', icon: 'fa-clipboard-list', link: 'audit.html', cls: 'btn-secondary-custom' },
      { label: 'View Reports', icon: 'fa-chart-pie', link: 'reports.html', cls: 'btn-secondary-custom' }
    ];
  } else if (role === 'Asset Manager' || role === 'AssetManager') {
    actions = [
      { label: 'Register Asset', icon: 'fa-plus', link: 'assets.html?action=new', cls: 'btn-primary-custom text-white' },
      { label: 'Allocate Asset', icon: 'fa-right-left', link: 'allocation.html?action=new', cls: 'btn-secondary-custom' },
      { label: 'Approve Maintenance', icon: 'fa-screwdriver-wrench', link: 'maintenance.html', cls: 'btn-secondary-custom' },
      { label: 'Approve Transfer', icon: 'fa-check', link: 'allocation.html', cls: 'btn-secondary-custom' }
    ];
  } else if (role === 'Department Head' || role === 'DepartmentHead') {
    actions = [
      { label: 'Approve Allocation', icon: 'fa-check-double', link: 'allocation.html', cls: 'btn-primary-custom text-white' },
      { label: 'Approve Transfer', icon: 'fa-right-left', link: 'allocation.html', cls: 'btn-secondary-custom' },
      { label: 'Book Resource', icon: 'fa-calendar-check', link: 'booking.html', cls: 'btn-secondary-custom' }
    ];
  } else if (role === 'Employee') {
    actions = [
      { label: 'Book Resource', icon: 'fa-calendar-plus', link: 'booking.html', cls: 'btn-primary-custom text-white' },
      { label: 'Raise Maintenance', icon: 'fa-screwdriver-wrench', link: 'maintenance.html', cls: 'btn-secondary-custom' },
      { label: 'Request Asset Return', icon: 'fa-arrow-left-long', link: 'allocation.html', cls: 'btn-secondary-custom' },
      { label: 'Request Asset Transfer', icon: 'fa-right-left', link: 'allocation.html', cls: 'btn-secondary-custom' }
    ];
  }

  if (actions.length > 0) {
    card.classList.remove('d-none');
    container.innerHTML = '';
    actions.forEach(act => {
      container.innerHTML += `
        <a href="${act.link}" class="btn ${act.cls} d-flex align-items-center gap-2">
          <i class="fa-solid ${act.icon}"></i>
          <span>${act.label}</span>
        </a>
      `;
    });
  } else {
    card.classList.add('d-none');
  }
}

function buildKpiCards(role, data) {
  const container = document.getElementById('kpi-cards-container');
  if (!container) return;
  container.innerHTML = '';

  let cards = [];
  if (role === 'Admin') {
    cards = [
      { label: 'Total Assets', val: data.assets.length, desc: `₹${data.totalValue.toLocaleString()}`, icon: 'fa-boxes-stacked', bg: 'bg-primary-subtle text-primary' },
      { label: 'Available Assets', val: data.assets.filter(a => a.status === 'Active').length, desc: 'Ready for use', icon: 'fa-circle-check', bg: 'bg-success-subtle text-success' },
      { label: 'Allocated Assets', val: data.allocations.filter(a => a.status === 'Approved').length, desc: 'In use', icon: 'fa-right-left', bg: 'bg-info-subtle text-info' },
      { label: 'Total Departments', val: data.departments ? data.departments.length : 5, desc: 'Enterprise groups', icon: 'fa-sitemap', bg: 'bg-warning-subtle text-warning' },
      { label: 'Total Employees', val: data.registeredUsers ? data.registeredUsers.length : 42, desc: 'Registered staff', icon: 'fa-users', bg: 'bg-purple-subtle text-purple' },
      { label: 'Pending Maintenance', val: data.maintenance.filter(m => m.status === 'Pending').length, desc: 'Requires action', icon: 'fa-screwdriver-wrench', bg: 'bg-danger-subtle text-danger' },
      { label: 'Active Audit Cycles', val: 1, desc: 'Q3 Asset Audit', icon: 'fa-clipboard-check', bg: 'bg-primary-subtle text-primary' },
      { label: 'Pending Approvals', val: data.allocations.filter(a => a.status === 'Pending Approval').length, desc: 'Awaiting Sign-off', icon: 'fa-circle-exclamation', bg: 'bg-warning-subtle text-warning' }
    ];
  } else if (role === 'Asset Manager' || role === 'AssetManager') {
    cards = [
      { label: 'Available Assets', val: data.assets.filter(a => a.status === 'Active').length, desc: 'Ready for allocation', icon: 'fa-circle-check', bg: 'bg-success-subtle text-success' },
      { label: 'Allocated Assets', val: data.allocations.filter(a => a.status === 'Approved').length, desc: 'With employees', icon: 'fa-right-left', bg: 'bg-info-subtle text-info' },
      { label: 'Pending Transfers', val: data.allocations.filter(a => a.status === 'Pending Approval').length, desc: 'Awaiting transfer approval', icon: 'fa-right-left', bg: 'bg-warning-subtle text-warning' },
      { label: 'Assets Under Maintenance', val: data.assets.filter(a => a.status === 'Maintenance').length, desc: 'Currently in repair', icon: 'fa-screwdriver-wrench', bg: 'bg-danger-subtle text-danger' },
      { label: 'Maintenance Requests', val: data.maintenance.filter(m => m.status === 'Pending').length, desc: 'Unassigned jobs', icon: 'fa-screwdriver-wrench', bg: 'bg-primary-subtle text-primary' }
    ];
  } else if (role === 'Department Head' || role === 'DepartmentHead') {
    const userDept = (window.RbacService.getCurrentUser() || {}).department || 'IT';
    cards = [
      { label: 'Department Assets', val: data.assets.length, desc: `${userDept} Department Resources`, icon: 'fa-boxes-stacked', bg: 'bg-primary-subtle text-primary' },
      { label: 'Pending Allocation Requests', val: data.allocations.filter(a => a.status === 'Pending Approval').length, desc: 'Awaiting your approval', icon: 'fa-right-left', bg: 'bg-warning-subtle text-warning' },
      { label: 'Department Bookings', val: data.bookings.filter(b => b.status === 'Confirmed').length, desc: 'Active resource bookings', icon: 'fa-calendar-check', bg: 'bg-success-subtle text-success' },
      { label: 'Overdue Assets', val: data.allocations.filter(a => a.status === 'Overdue').length, desc: 'Requires immediate return', icon: 'fa-clock', bg: 'bg-danger-subtle text-danger' }
    ];
  } else if (role === 'Employee') {
    const myAssetIds = data.assets.map(a => a.id);
    const myPendingMaint = data.maintenance.filter(m => myAssetIds.includes(m.assetId) && m.status === 'Pending');
    cards = [
      { label: 'My Assets', val: data.assets.length, desc: 'Allocated to you', icon: 'fa-user-gear', bg: 'bg-info-subtle text-info' },
      { label: 'Upcoming Bookings', val: data.bookings.filter(b => b.status === 'Confirmed').length, desc: 'Your active bookings', icon: 'fa-calendar-days', bg: 'bg-success-subtle text-success' },
      { label: 'Pending Maintenance Requests', val: myPendingMaint.length, desc: 'Your reported issues', icon: 'fa-screwdriver-wrench', bg: 'bg-warning-subtle text-warning' },
      { label: 'Notifications', val: data.notifications.filter(n => !n.read).length, desc: 'Unread updates', icon: 'fa-bell', bg: 'bg-primary-subtle text-primary' }
    ];
  }

  const colSize = cards.length % 4 === 0 ? 'col-xl-3 col-md-6' : (cards.length % 3 === 0 ? 'col-xl-4 col-md-6' : 'col-xl-3 col-md-6');
  cards.forEach(card => {
    container.innerHTML += `
      <div class="${colSize}">
        <div class="card-custom mb-0">
          <div class="stat-card">
            <div>
              <span class="text-muted fs-7 fw-semibold text-uppercase">${card.label}</span>
              <h3 class="fw-bold my-1" style="color: var(--text-color);">${card.val}</h3>
              <span class="small fw-medium ${card.bg.includes('danger') ? 'text-danger' : 'text-success'}">${card.desc}</span>
            </div>
            <div class="stat-icon ${card.bg}">
              <i class="fa-solid ${card.icon}"></i>
            </div>
          </div>
        </div>
      </div>
    `;
  });
}

function buildChartsContainer(role) {
  const container = document.getElementById('charts-container');
  if (!container) return;
  container.innerHTML = '';

  if (role === 'Admin') {
    container.innerHTML = `
      <div class="col-lg-8">
        <div class="card-custom h-100 mb-0">
          <h5 class="fw-bold mb-3"><i class="fa-solid fa-chart-line me-2 text-primary"></i>Asset Depreciation & Cost Value</h5>
          <div style="height: 320px; position: relative;">
            <canvas id="chart-depreciation"></canvas>
          </div>
        </div>
      </div>
      <div class="col-lg-4">
        <div class="card-custom h-100 mb-0">
          <h5 class="fw-bold mb-3"><i class="fa-solid fa-chart-pie me-2 text-primary"></i>Asset Distribution</h5>
          <div style="height: 250px; position: relative;" class="d-flex align-items-center justify-content-center">
            <canvas id="chart-distribution"></canvas>
          </div>
          <div class="mt-3 text-center small text-muted" id="distribution-legend"></div>
        </div>
      </div>
    `;
  } else if (role === 'Asset Manager' || role === 'AssetManager') {
    container.innerHTML = `
      <div class="col-lg-4">
        <div class="card-custom h-100 mb-0">
          <h5 class="fw-bold mb-3"><i class="fa-solid fa-circle-info me-2 text-primary"></i>Asset Status</h5>
          <div style="height: 250px; position: relative;">
            <canvas id="chart-status"></canvas>
          </div>
        </div>
      </div>
      <div class="col-lg-4">
        <div class="card-custom h-100 mb-0">
          <h5 class="fw-bold mb-3"><i class="fa-solid fa-chart-line me-2 text-primary"></i>Allocation Trend</h5>
          <div style="height: 250px; position: relative;">
            <canvas id="chart-allocation-trend"></canvas>
          </div>
        </div>
      </div>
      <div class="col-lg-4">
        <div class="card-custom h-100 mb-0">
          <h5 class="fw-bold mb-3"><i class="fa-solid fa-screwdriver-wrench me-2 text-primary"></i>Maintenance Trend</h5>
          <div style="height: 250px; position: relative;">
            <canvas id="chart-maintenance-trend"></canvas>
          </div>
        </div>
      </div>
    `;
  } else if (role === 'Department Head' || role === 'DepartmentHead') {
    container.innerHTML = `
      <div class="col-lg-6">
        <div class="card-custom h-100 mb-0">
          <h5 class="fw-bold mb-3"><i class="fa-solid fa-chart-bar me-2 text-primary"></i>Department Assets Usage</h5>
          <div style="height: 280px; position: relative;">
            <canvas id="chart-dept-assets"></canvas>
          </div>
        </div>
      </div>
      <div class="col-lg-6">
        <div class="card-custom h-100 mb-0">
          <h5 class="fw-bold mb-3"><i class="fa-solid fa-chart-line me-2 text-primary"></i>Booking Usage</h5>
          <div style="height: 280px; position: relative;">
            <canvas id="chart-booking-usage"></canvas>
          </div>
        </div>
      </div>
    `;
  }
}

function renderRoleCharts(role, data) {
  // Destroy previous charts
  chartsList.forEach(c => c.destroy());
  chartsList = [];

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#94A3B8' : '#64748B';
  const gridColor = isDark ? '#334155' : '#E2E8F0';

  if (role === 'Admin') {
    // 1. Depreciation Line Chart
    const ctxDep = document.getElementById('chart-depreciation');
    if (ctxDep) {
      const chart = new Chart(ctxDep, {
        type: 'line',
        data: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          datasets: [
            {
              label: 'Asset Initial Value',
              data: data.assets.length ? [15000, 18000, 22000, 21000, 25000, data.totalValue] : [],
              borderColor: '#2563EB',
              backgroundColor: 'rgba(37, 99, 235, 0.05)',
              fill: true,
              tension: 0.4
            },
            {
              label: 'Depreciated Value',
              data: data.assets.length ? [11000, 13000, 15000, 14000, 16000, data.totalValue * 0.7] : [],
              borderColor: '#F59E0B',
              backgroundColor: 'transparent',
              borderDash: [5, 5],
              tension: 0.4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: textColor } } },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor } },
            y: { grid: { color: gridColor }, ticks: { color: textColor } }
          }
        }
      });
      chartsList.push(chart);
    }

    // 2. Distribution Pie/Doughnut
    const ctxDist = document.getElementById('chart-distribution');
    if (ctxDist) {
      const types = {};
      data.assets.forEach(a => { types[a.type] = (types[a.type] || 0) + 1; });
      const finalLabels = Object.keys(types).length ? Object.keys(types) : [];
      const finalData = Object.values(types).length ? Object.values(types) : [];
      const colors = ['#2563EB', '#3B82F6', '#10B981', '#F59E0B', '#EF4444'];

      const chart = new Chart(ctxDist, {
        type: 'doughnut',
        data: {
          labels: finalLabels,
          datasets: [{
            data: finalData,
            backgroundColor: colors,
            borderWidth: isDark ? 2 : 1,
            borderColor: isDark ? '#1E293B' : '#FFFFFF'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          cutout: '75%'
        }
      });
      chartsList.push(chart);

      // Render custom legend
      const legendEl = document.getElementById('distribution-legend');
      if (legendEl) {
        let legendHtml = '<div class="d-flex flex-wrap justify-content-center gap-2 mt-2">';
        finalLabels.forEach((label, i) => {
          const pct = Math.round((finalData[i] / finalData.reduce((a,b)=>a+b,0)) * 100);
          legendHtml += `
            <span class="d-flex align-items-center gap-1 fs-8">
              <span style="display:inline-block; width:8px; height:8px; background-color:${colors[i % colors.length]}; border-radius:50%;"></span>
              <strong>${pct}%</strong> ${label}
            </span>
          `;
        });
        legendHtml += '</div>';
        legendEl.innerHTML = legendHtml;
      }
    }
  } else if (role === 'Asset Manager' || role === 'AssetManager') {
    // 1. Status Doughnut Chart
    const ctxStatus = document.getElementById('chart-status');
    if (ctxStatus) {
      const statuses = {};
      data.assets.forEach(a => { statuses[a.status] = (statuses[a.status] || 0) + 1; });
      const chart = new Chart(ctxStatus, {
        type: 'doughnut',
        data: {
          labels: Object.keys(statuses).length ? Object.keys(statuses) : [],
          datasets: [{
            data: Object.values(statuses).length ? Object.values(statuses) : [],
            backgroundColor: ['#10B981', '#EF4444', '#64748B']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { color: textColor } } }
        }
      });
      chartsList.push(chart);
    }

    // 2. Allocation Trend Line
    const ctxAlloc = document.getElementById('chart-allocation-trend');
    if (ctxAlloc) {
      const chart = new Chart(ctxAlloc, {
        type: 'line',
        data: {
          labels: data.allocations.length ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'] : [],
          datasets: [{
            label: 'Allocations',
            data: data.allocations.length ? [5, 12, 8, 15, 22, data.allocations.length] : [],
            borderColor: '#3B82F6',
            backgroundColor: 'transparent',
            tension: 0.3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor } },
            y: { grid: { color: gridColor }, ticks: { color: textColor } }
          }
        }
      });
      chartsList.push(chart);
    }

    // 3. Maintenance Trend Bar
    const ctxMaint = document.getElementById('chart-maintenance-trend');
    if (ctxMaint) {
      const chart = new Chart(ctxMaint, {
        type: 'bar',
        data: {
          labels: data.maintenance.length ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'] : [],
          datasets: [{
            label: 'Repairs Completed',
            data: data.maintenance.length ? [2, 4, 1, 5, 3, data.maintenance.filter(m => m.status === 'Resolved').length] : [],
            backgroundColor: '#EF4444',
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor } },
            y: { grid: { color: gridColor }, ticks: { color: textColor } }
          }
        }
      });
      chartsList.push(chart);
    }
  } else if (role === 'Department Head' || role === 'DepartmentHead') {
    // 1. Dept Assets Usage Bar Chart
    const ctxDept = document.getElementById('chart-dept-assets');
    if (ctxDept) {
      const chart = new Chart(ctxDept, {
        type: 'bar',
        data: {
          labels: data.assets.length ? ['Laptops', 'Monitors', 'AV Equipment', 'Software Licenses', 'Furniture'] : [],
          datasets: [{
            label: 'Quantity',
            data: data.assets.length ? [8, 5, 2, 6, 4] : [],
            backgroundColor: '#8B5CF6',
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor } },
            y: { grid: { color: gridColor }, ticks: { color: textColor } }
          }
        }
      });
      chartsList.push(chart);
    }

    // 2. Booking Usage Line Chart
    const ctxBook = document.getElementById('chart-booking-usage');
    if (ctxBook) {
      const chart = new Chart(ctxBook, {
        type: 'line',
        data: {
          labels: data.bookings.length ? ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4'] : [],
          datasets: [{
            label: 'Hours Booked',
            data: data.bookings.length ? [12, 18, 15, 24] : [],
            borderColor: '#10B981',
            tension: 0.3,
            fill: false
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor } },
            y: { grid: { color: gridColor }, ticks: { color: textColor } }
          }
        }
      });
      chartsList.push(chart);
    }
  }
}

function buildDetailsRow(role, data) {
  const container = document.getElementById('details-row-container');
  if (!container) return;
  container.innerHTML = '';

  if (role === 'Admin' || role === 'Asset Manager' || role === 'AssetManager') {
    container.innerHTML = `
      <!-- Recent Activity Timeline -->
      <div class="col-lg-5">
        <div class="card-custom h-100 mb-0">
          <h5 class="fw-bold mb-3"><i class="fa-solid fa-history me-2 text-primary"></i>Recent Activity</h5>
          <div class="timeline" id="dashboard-activity-timeline">
            <!-- Dynamically populated -->
          </div>
        </div>
      </div>
      <!-- Recent Bookings Table -->
      <div class="col-lg-7">
        <div class="card-custom h-100 mb-0">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="fw-bold mb-0"><i class="fa-solid fa-calendar-check me-2 text-primary"></i>Recent Bookings</h5>
            <a href="booking.html" class="text-primary text-decoration-none small fw-semibold">View Calendar</a>
          </div>
          <div class="table-custom-wrapper">
            <table class="table-custom" id="dashboard-bookings-table">
              <thead>
                <tr>
                  <th>Resource</th>
                  <th>Booked By</th>
                  <th>Time Slot</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <!-- Loaded dynamically -->
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Populate timeline
    const timelineEl = document.getElementById('dashboard-activity-timeline');
    if (timelineEl) {
      let timelineHtml = '';
      const recentNotifs = data.notifications.slice(0, 4);
      recentNotifs.forEach(n => {
        timelineHtml += `
          <div class="timeline-item">
            <span class="small fw-semibold d-block text-dark-custom" style="color: var(--text-color);">${n.title}</span>
            <p class="text-muted small mb-1">${n.message}</p>
            <small class="text-muted fs-8"><i class="fa-regular fa-clock me-1"></i>${n.date}</small>
          </div>
        `;
      });
      timelineEl.innerHTML = timelineHtml || '<p class="text-muted small">No recent activity.</p>';
    }

    // Populate bookings
    const bookingsTableBody = document.querySelector('#dashboard-bookings-table tbody');
    if (bookingsTableBody) {
      let bookingsHtml = '';
      data.bookings.slice(0, 4).forEach(b => {
        bookingsHtml += `
          <tr>
            <td><strong>${b.resourceName}</strong></td>
            <td>${b.bookedBy}</td>
            <td class="small">${b.date} (${b.startTime}-${b.endTime})</td>
            <td><span class="badge ${b.status === 'Confirmed' ? 'bg-success-subtle text-success' : 'bg-secondary-subtle text-secondary'} rounded-pill px-2 py-0.5">${b.status}</span></td>
          </tr>
        `;
      });
      bookingsTableBody.innerHTML = bookingsHtml || '<tr><td colspan="4" class="text-center py-3 text-muted">No recent bookings.</td></tr>';
    }

  } else if (role === 'Department Head' || role === 'DepartmentHead') {
    container.innerHTML = `
      <!-- Left: Allocation Requests -->
      <div class="col-lg-6">
        <div class="card-custom h-100 mb-0">
          <h5 class="fw-bold mb-3"><i class="fa-solid fa-file-invoice me-2 text-primary"></i>Department Allocation Requests</h5>
          <div class="table-custom-wrapper">
            <table class="table-custom">
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>Asset</th>
                  <th>Requestor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody id="dept-allocations-table-body">
                <!-- Dynamically populated -->
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <!-- Right: Department Bookings List -->
      <div class="col-lg-6">
        <div class="card-custom h-100 mb-0">
          <h5 class="fw-bold mb-3"><i class="fa-solid fa-clock-rotate-left me-2 text-primary"></i>Recent Department Bookings</h5>
          <div class="table-custom-wrapper">
            <table class="table-custom">
              <thead>
                <tr>
                  <th>Resource</th>
                  <th>Booked By</th>
                  <th>Time Slot</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody id="dept-bookings-table-body">
                <!-- Dynamically populated -->
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Populate allocations
    const allocBody = document.getElementById('dept-allocations-table-body');
    if (allocBody) {
      let html = '';
      data.allocations.slice(0, 4).forEach(a => {
        html += `
          <tr>
            <td><strong class="text-primary">${a.id}</strong></td>
            <td><strong>${a.assetName}</strong></td>
            <td>${a.allocatedTo}</td>
            <td><span class="badge ${a.status === 'Approved' ? 'bg-success-subtle text-success' : 'bg-warning-subtle text-warning'} rounded-pill px-2 py-0.5">${a.status}</span></td>
          </tr>
        `;
      });
      allocBody.innerHTML = html || '<tr><td colspan="4" class="text-center py-3 text-muted">No pending allocations.</td></tr>';
    }

    // Populate bookings
    const bookingsBody = document.getElementById('dept-bookings-table-body');
    if (bookingsBody) {
      let html = '';
      data.bookings.slice(0, 4).forEach(b => {
        html += `
          <tr>
            <td><strong>${b.resourceName}</strong></td>
            <td>${b.bookedBy}</td>
            <td class="small">${b.date} (${b.startTime}-${b.endTime})</td>
            <td><span class="badge bg-success-subtle text-success rounded-pill px-2 py-0.5">${b.status}</span></td>
          </tr>
        `;
      });
      bookingsBody.innerHTML = html || '<tr><td colspan="4" class="text-center py-3 text-muted">No bookings scheduled.</td></tr>';
    }

  } else if (role === 'Employee') {
    container.innerHTML = `
      <!-- Left: My Assigned Assets -->
      <div class="col-lg-6">
        <div class="card-custom h-100 mb-0">
          <h5 class="fw-bold mb-3"><i class="fa-solid fa-laptop me-2 text-primary"></i>My Assigned Assets</h5>
          <div class="table-custom-wrapper">
            <table class="table-custom">
              <thead>
                <tr>
                  <th>Asset Name</th>
                  <th>Serial Number</th>
                  <th>Assigned Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody id="my-assets-table-body">
                <!-- Dynamically populated -->
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <!-- Right: My Upcoming Bookings -->
      <div class="col-lg-6">
        <div class="card-custom h-100 mb-0">
          <h5 class="fw-bold mb-3"><i class="fa-solid fa-calendar-check me-2 text-primary"></i>My Upcoming Bookings</h5>
          <div class="table-custom-wrapper">
            <table class="table-custom">
              <thead>
                <tr>
                  <th>Resource</th>
                  <th>Date</th>
                  <th>Time Slot</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody id="my-bookings-table-body">
                <!-- Dynamically populated -->
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Populate my assets
    const myAssetsBody = document.getElementById('my-assets-table-body');
    if (myAssetsBody) {
      if (data.assets && data.assets.length > 0) {
        let html = '';
        data.assets.forEach(asset => {
          html += `
            <tr>
              <td><strong>${asset.name}</strong></td>
              <td><code>${asset.serialNumber || asset.id}</code></td>
              <td>${asset.purchaseDate || 'N/A'}</td>
              <td><span class="badge bg-success-subtle text-success rounded-pill px-2 py-0.5">${asset.status}</span></td>
            </tr>
          `;
        });
        myAssetsBody.innerHTML = html;
      } else {
        myAssetsBody.innerHTML = `
          <tr>
            <td colspan="4" class="text-center py-4 text-muted">
              <i class="fa-solid fa-folder-open d-block fs-3 mb-2"></i>
              No assets allocated to you.
            </td>
          </tr>
        `;
      }
    }

    // Populate my bookings
    const myBookingsBody = document.getElementById('my-bookings-table-body');
    if (myBookingsBody) {
      if (data.bookings && data.bookings.length > 0) {
        let html = '';
        data.bookings.forEach(b => {
          html += `
            <tr>
              <td><strong>${b.resourceName}</strong></td>
              <td>${b.date}</td>
              <td class="small">${b.startTime} - ${b.endTime}</td>
              <td><span class="badge bg-success-subtle text-success rounded-pill px-2 py-0.5">${b.status}</span></td>
            </tr>
          `;
        });
        myBookingsBody.innerHTML = html;
      } else {
        myBookingsBody.innerHTML = `
          <tr>
            <td colspan="4" class="text-center py-4 text-muted">
              <i class="fa-solid fa-calendar-xmark d-block fs-3 mb-2"></i>
              No active bookings.
            </td>
          </tr>
        `;
      }
    }
  }
}
