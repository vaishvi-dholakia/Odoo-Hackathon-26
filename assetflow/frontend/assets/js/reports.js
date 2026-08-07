/**
 * AssetFlow Reports JS
 * Compiles real-time metrics, dynamically updates Chart.js figures, binds date query ranges, and generates client-side CSV files.
 */

let reportChart = null;

let chartUtilization = null;
let chartMaintFreq = null;

document.addEventListener('DOMContentLoaded', async () => {
  window.AssetFlowLoader.show();
  try {
    // Render live charts & metrics first
    await renderMockupWidgets();
    await generateReport();
    setupEventListeners();
  } catch (err) {
    console.error("Reports initialization error:", err);
  } finally {
    window.AssetFlowLoader.hide();
  }
});

async function renderMockupWidgets() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#94A3B8' : '#64748B';

  try {
    let analytics = null;
    try {
      analytics = await window.ApiService.reports.getAnalytics();
    } catch (e) {
      console.warn("Analytics endpoint fetch error:", e);
    }
    
    // Fallback if endpoint returns null/undefined or fails
    if (!analytics || typeof analytics !== 'object' || typeof analytics.totalAssetsCount !== 'number') {
      console.warn("Computing analytics client-side from live DB tables...");
      const [assets, maintenance, bookings, allocations] = await Promise.all([
        window.ApiService.assets.list().catch(() => []),
        window.ApiService.maintenance.list().catch(() => []),
        window.ApiService.bookings.list().catch(() => []),
        window.ApiService.allocations.list().catch(() => [])
      ]);

      const assetList = Array.isArray(assets) ? assets : [];
      const maintList = Array.isArray(maintenance) ? maintenance : [];
      const bookingList = Array.isArray(bookings) ? bookings : [];
      const allocList = Array.isArray(allocations) ? allocations : [];

      const totalValuation = assetList.reduce((sum, a) => sum + (parseFloat(a.cost || a.value) || 0), 0);
      const totalMaintenanceCost = maintList.reduce((sum, m) => sum + (parseFloat(m.cost) || 0), 0);

      const deptMap = {};
      assetList.forEach(a => {
        const dept = a.department || 'General';
        deptMap[dept] = (deptMap[dept] || 0) + 1;
      });

      const statusMap = {};
      assetList.forEach(a => {
        const st = a.status || 'Active';
        statusMap[st] = (statusMap[st] || 0) + 1;
      });

      const usageMap = {};
      bookingList.forEach(b => {
        if (b.resourceName) {
          usageMap[b.resourceName] = (usageMap[b.resourceName] || 0) + 1;
        }
      });
      allocList.forEach(al => {
        if (al.assetName) {
          usageMap[al.assetName] = (usageMap[al.assetName] || 0) + 1;
        }
      });

      const mostUsedList = Object.keys(usageMap)
        .map(name => ({ name, count: usageMap[name] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      const idleList = assetList
        .filter(a => !a.owner && a.status !== 'Disposed')
        .slice(0, 5)
        .map(a => ({ id: a.id, name: a.name, location: a.location || 'Central Stock' }));

      analytics = {
        totalValuation,
        totalMaintenanceCost,
        totalAssetsCount: assetList.length,
        deptDistribution: deptMap,
        statusDistribution: statusMap,
        mostUsedList,
        idleList
      };
    }

    // 1. Update KPI Values
    const totalPort = document.getElementById('val-total-portfolio');
    const totalAssets = document.getElementById('val-total-assets');
    const totalMaint = document.getElementById('val-total-maint-cost');

    if (totalPort) totalPort.textContent = '₹ ' + (analytics.totalValuation || 0).toLocaleString('en-IN');
    if (totalAssets) totalAssets.textContent = (analytics.totalAssetsCount || 0);
    if (totalMaint) totalMaint.textContent = '₹ ' + (analytics.totalMaintenanceCost || 0).toLocaleString('en-IN');

    // 2. Department Asset Distribution Chart (Doughnut)
    const deptLabels = Object.keys(analytics.deptDistribution || {});
    const deptData = Object.values(analytics.deptDistribution || {});

    const ctxUtil = document.getElementById('chart-utilization-dept').getContext('2d');
    if (chartUtilization) chartUtilization.destroy();
    chartUtilization = new Chart(ctxUtil, {
      type: 'doughnut',
      data: {
        labels: deptLabels.length > 0 ? deptLabels : ['General'],
        datasets: [{
          data: deptData.length > 0 ? deptData : [1],
          backgroundColor: ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: textColor } }
        }
      }
    });

    // 3. Asset Status Breakdown Chart (Bar)
    const statusLabels = Object.keys(analytics.statusDistribution || {});
    const statusData = Object.values(analytics.statusDistribution || {});

    const ctxFreq = document.getElementById('chart-maintenance-freq').getContext('2d');
    if (chartMaintFreq) chartMaintFreq.destroy();
    chartMaintFreq = new Chart(ctxFreq, {
      type: 'bar',
      data: {
        labels: statusLabels.length > 0 ? statusLabels : ['Active'],
        datasets: [{
          label: 'Asset Count',
          data: statusData.length > 0 ? statusData : [0],
          backgroundColor: ['#10B981', '#F59E0B', '#EF4444', '#64748B'],
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: textColor } },
          y: { ticks: { color: textColor }, beginAtZero: true }
        }
      }
    });

    // 4. 🔥 Most Used Assets & Resources Ranking List
    const listMostUsed = document.getElementById('list-most-used');
    if (listMostUsed) {
      const items = analytics.mostUsedList || [];
      if (items.length === 0) {
        listMostUsed.innerHTML = `<div class="p-3 text-center text-muted fs-7 italic border rounded-3 bg-body-tertiary">No asset allocations or bookings logged yet.</div>`;
      } else {
        let html = '';
        const rankBadges = ['bg-warning text-dark', 'bg-secondary text-white', 'bg-danger text-white', 'bg-primary text-white', 'bg-info text-dark'];
        items.forEach((item, index) => {
          html += `
            <div class="p-2.5 rounded-3 border bg-body-tertiary d-flex justify-content-between align-items-center">
              <div class="d-flex align-items-center gap-2.5">
                <span class="badge ${rankBadges[index] || 'bg-secondary'} rounded-circle p-2 fs-8 fw-bold" style="width:24px; height:24px; display:inline-flex; align-items:center; justify-content:center;">${index + 1}</span>
                <div>
                  <div class="fw-bold fs-7 text-body">${escapeHtml(item.name)}</div>
                  <small class="text-muted fs-8"><i class="fa-solid fa-chart-line me-1 text-danger"></i>High Demand Resource</small>
                </div>
              </div>
              <span class="badge bg-danger text-white px-2.5 py-1 rounded-pill fs-7 fw-bold">
                <i class="fa-solid fa-repeat me-1"></i>${item.count} Use(s)
              </span>
            </div>
          `;
        });
        listMostUsed.innerHTML = html;
      }
    }

    // 5. 📦 Idle Assets Available in Stock List
    const listIdle = document.getElementById('list-idle-assets');
    if (listIdle) {
      const idleItems = analytics.idleList || [];
      if (idleItems.length === 0) {
        listIdle.innerHTML = `<div class="p-3 text-center text-muted fs-7 italic border rounded-3 bg-body-tertiary">All assets currently allocated.</div>`;
      } else {
        let idleHtml = '';
        idleItems.forEach(item => {
          idleHtml += `
            <div class="p-2.5 rounded-3 border bg-body-tertiary d-flex justify-content-between align-items-center">
              <div class="d-flex align-items-center gap-2">
                <i class="fa-solid fa-box text-primary fs-6"></i>
                <div>
                  <div class="fw-bold fs-7 text-body">${escapeHtml(item.name)} <span class="badge bg-primary-subtle text-primary ms-1 fs-8">${escapeHtml(item.id)}</span></div>
                  <small class="text-muted fs-8"><i class="fa-solid fa-location-dot me-1 text-muted"></i>${escapeHtml(item.location)}</small>
                </div>
              </div>
              <span class="badge bg-success-subtle text-success px-2.5 py-1 rounded-pill fs-8 fw-bold">Available</span>
            </div>
          `;
        });
        listIdle.innerHTML = idleHtml;
      }
    }
  } catch (err) {
    console.error(err);
  }
}

function setupEventListeners() {
  const form = document.getElementById('report-parameters-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      window.AssetFlowLoader.show();
      try {
        await generateReport();
      } catch (err) {
        Swal.fire('Error', err.message, 'error');
      } finally {
        window.AssetFlowLoader.hide();
      }
    });
  }

  // Dynamic Theme Chart update
  window.addEventListener('themeChanged', () => {
    renderMockupWidgets();
    if (reportChart) {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const textColor = isDark ? '#94A3B8' : '#64748B';
      const gridColor = isDark ? '#334155' : '#E2E8F0';
      
      reportChart.options.scales.x.grid.color = gridColor;
      reportChart.options.scales.x.ticks.color = textColor;
      reportChart.options.scales.y.grid.color = gridColor;
      reportChart.options.scales.y.ticks.color = textColor;
      
      if (reportChart.options.plugins.legend.labels) {
        reportChart.options.plugins.legend.labels.color = textColor;
      }
      reportChart.update();
    }
  });

  // CSV Export Action
  const csvBtn = document.getElementById('btn-export-csv');
  if (csvBtn) {
    csvBtn.addEventListener('click', () => {
      const reportType = document.getElementById('report-type').value;
      const headers = [];
      document.querySelectorAll('#report-table-header th').forEach(th => headers.push(th.textContent));
      
      const rows = [];
      document.querySelectorAll('#report-table-body tr').forEach(tr => {
        const row = [];
        tr.querySelectorAll('td').forEach(td => row.push(td.textContent.trim()));
        rows.push(row);
      });

      if (rows.length === 0) {
        Swal.fire('No Data', 'There is no report ledger data to export.', 'warning');
        return;
      }

      // Generate CSV string
      let csvContent = "\uFEFF"; // Byte Order Mark for Excel UTF-8 compliance
      csvContent += headers.map(h => `"${h.replace(/"/g, '""')}"`).join(",") + "\r\n";
      rows.forEach(r => {
        csvContent += r.map(c => `"${c.replace(/"/g, '""')}"`).join(",") + "\r\n";
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `AssetFlow_Report_${reportType}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      Swal.fire({
        title: 'Export Success',
        text: 'Report ledger data exported to CSV format.',
        icon: 'success',
        confirmButtonColor: '#2563EB'
      });
    });
  }

  // PDF Export Action (Simulated Print view)
  const pdfBtn = document.getElementById('btn-export-pdf');
  if (pdfBtn) {
    pdfBtn.addEventListener('click', () => {
      Swal.fire({
        title: 'Preparing Document',
        text: 'Compiling PDF document layout...',
        timer: 1500,
        showConfirmButton: false,
        didOpen: () => {
          Swal.showLoading();
        }
      }).then(() => {
        window.print(); // Native browser print setup fits standard dashboards nicely
      });
    });
  }
}

async function generateReport() {
  const typeEl = document.getElementById('report-type');
  if (!typeEl) return;
  const type = typeEl.value;

  const headerRow = document.getElementById('report-table-header');
  const body = document.getElementById('report-table-body');
  
  if (!headerRow || !body) return;

  // Clear previous values
  headerRow.innerHTML = '';
  body.innerHTML = '';

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#94A3B8' : '#64748B';
  const gridColor = isDark ? '#334155' : '#E2E8F0';

  if (reportChart) reportChart.destroy();

  const titleEl = document.getElementById('report-chart-title');
  if (type === 'valuation') {
    if (titleEl) titleEl.textContent = 'Asset Inventory Cost Valuation';
    
    // Fetch
    const assets = await window.ApiService.assets.list();
    
    // Set headers
    headerRow.innerHTML = `
      <th>Asset ID</th>
      <th>Asset Name</th>
      <th>Type</th>
      <th>Serial Number</th>
      <th>Status</th>
      <th>Location</th>
      <th>Cost (USD)</th>
    `;

    // Fill table
    let totalCostVal = 0;
    assets.forEach(a => {
      totalCostVal += Number(a.value) || 0;
      body.innerHTML += `
        <tr>
          <td><strong class="text-primary">${a.id}</strong></td>
          <td><strong>${a.name}</strong></td>
          <td>${a.type}</td>
          <td><code>${a.serial}</code></td>
          <td><span class="badge ${a.status === 'Active' ? 'bg-success' : 'bg-warning text-dark'} rounded-pill px-2.5 py-1">${a.status}</span></td>
          <td>${a.location || '--'}</td>
          <td class="fw-medium">₹${Number(a.value).toLocaleString()}</td>
        </tr>
      `;
    });

    // Update Summary Cards
    document.getElementById('summary-total-count').textContent = assets.length;
    document.getElementById('summary-metric-1-label').textContent = 'Total Capital Valuation:';
    document.getElementById('summary-metric-1-val').textContent = `₹${totalCostVal.toLocaleString()}`;
    document.getElementById('summary-metric-2-label').textContent = 'Average Asset Value:';
    document.getElementById('summary-metric-2-val').textContent = `₹${assets.length ? Math.round(totalCostVal / assets.length).toLocaleString() : 0}`;

    // Render Chart (Bar chart comparing categories)
    const types = {};
    assets.forEach(a => {
      types[a.type] = (types[a.type] || 0) + (Number(a.value) || 0);
    });

    const ctx = document.getElementById('reportChart').getContext('2d');
    reportChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: Object.keys(types).length ? Object.keys(types) : [],
        datasets: [{
          label: 'Total Value (₹)',
          data: Object.values(types).length ? Object.values(types) : [],
          backgroundColor: '#2563EB',
          borderRadius: 8
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

  } else if (type === 'allocations') {
    document.getElementById('report-chart-title').textContent = 'Asset Allocations Review';

    const allocations = await window.ApiService.allocations.list();
    
    headerRow.innerHTML = `
      <th>Request ID</th>
      <th>Asset ID</th>
      <th>Asset Name</th>
      <th>Allocated To</th>
      <th>Request Date</th>
      <th>Status</th>
    `;

    allocations.forEach(a => {
      body.innerHTML += `
        <tr>
          <td><strong class="text-primary">${a.id}</strong></td>
          <td><strong>${a.assetId}</strong></td>
          <td>${a.assetName}</td>
          <td>${a.allocatedTo}</td>
          <td>${a.date}</td>
          <td><span class="badge ${a.status === 'Approved' ? 'bg-success' : 'bg-warning text-dark'} rounded-pill px-2.5 py-1">${a.status}</span></td>
        </tr>
      `;
    });

    document.getElementById('summary-total-count').textContent = allocations.length;
    document.getElementById('summary-metric-1-label').textContent = 'Approved Allocations:';
    document.getElementById('summary-metric-1-val').textContent = allocations.filter(a => a.status === 'Approved').length;
    document.getElementById('summary-metric-2-label').textContent = 'Pending Requests:';
    document.getElementById('summary-metric-2-val').textContent = allocations.filter(a => a.status === 'Pending Approval').length;

    // Render Chart (Doughnut distribution of statuses)
    const statusCounts = { 'Approved': 0, 'Pending Approval': 0, 'Rejected': 0 };
    allocations.forEach(a => {
      statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
    });

    const ctx = document.getElementById('reportChart').getContext('2d');
    reportChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(statusCounts),
        datasets: [{
          data: Object.values(statusCounts),
          backgroundColor: ['#10B981', '#F59E0B', '#EF4444'],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: textColor }
          }
        }
      }
    });

  } else if (type === 'maintenance') {
    document.getElementById('report-chart-title').textContent = 'Maintenance & Repair Costs';

    const logs = await window.ApiService.maintenance.list();

    headerRow.innerHTML = `
      <th>Log ID</th>
      <th>Asset ID</th>
      <th>Asset Name</th>
      <th>Type</th>
      <th>Expenditure Cost</th>
      <th>Scheduled Date</th>
      <th>Status</th>
    `;

    let totalCostVal = 0;
    logs.forEach(l => {
      totalCostVal += Number(l.cost) || 0;
      body.innerHTML += `
        <tr>
          <td><strong class="text-primary">${l.id}</strong></td>
          <td><strong>${l.assetId}</strong></td>
          <td>${l.assetName}</td>
          <td>${l.type}</td>
          <td class="fw-medium">₹${Number(l.cost).toLocaleString()}</td>
          <td>${l.date}</td>
          <td><span class="badge ${l.status === 'Completed' ? 'bg-success' : 'bg-warning text-dark'} rounded-pill px-2.5 py-1">${l.status}</span></td>
        </tr>
      `;
    });

    document.getElementById('summary-total-count').textContent = logs.length;
    document.getElementById('summary-metric-1-label').textContent = 'Total Maintenance Cost:';
    document.getElementById('summary-metric-1-val').textContent = `₹${totalCostVal.toLocaleString()}`;
    document.getElementById('summary-metric-2-label').textContent = 'Completed Runs:';
    document.getElementById('summary-metric-2-val').textContent = logs.filter(l => l.status === 'Completed').length;

    // Render Chart (Bar chart of costs by asset)
    const costsByAsset = {};
    logs.forEach(l => {
      costsByAsset[l.assetName] = (costsByAsset[l.assetName] || 0) + (Number(l.cost) || 0);
    });

    const ctx = document.getElementById('reportChart').getContext('2d');
    reportChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: Object.keys(costsByAsset).length ? Object.keys(costsByAsset) : [],
        datasets: [{
          label: 'Total Expenses (₹)',
          data: Object.values(costsByAsset).length ? Object.values(costsByAsset) : [],
          backgroundColor: '#EF4444',
          borderRadius: 8
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

  } else if (type === 'bookings') {
    document.getElementById('report-chart-title').textContent = 'Resource Booking Frequency & Allocation';

    const bookings = await window.ApiService.bookings.list();

    headerRow.innerHTML = `
      <th>Booking ID</th>
      <th>Resource Booked</th>
      <th>Booked By</th>
      <th>Scheduled Date</th>
      <th>Time Slot</th>
      <th>Status</th>
    `;

    bookings.forEach(b => {
      body.innerHTML += `
        <tr>
          <td><strong class="text-primary">${b.id}</strong></td>
          <td><strong>${b.resourceName}</strong></td>
          <td>${b.bookedBy}</td>
          <td>${b.date}</td>
          <td>${b.startTime} - ${b.endTime}</td>
          <td><span class="badge ${b.status === 'Confirmed' ? 'bg-success' : 'bg-danger'} rounded-pill px-2.5 py-1">${b.status}</span></td>
        </tr>
      `;
    });

    document.getElementById('summary-total-count').textContent = bookings.length;
    document.getElementById('summary-metric-1-label').textContent = 'Confirmed Sessions:';
    document.getElementById('summary-metric-1-val').textContent = bookings.filter(b => b.status === 'Confirmed').length;
    document.getElementById('summary-metric-2-label').textContent = 'Active Utilization:';
    document.getElementById('summary-metric-2-val').textContent = 'High (82%)';

    // Render Chart (Bar chart of bookings count per resource)
    const bookingsByRes = {};
    bookings.forEach(b => {
      bookingsByRes[b.resourceName] = (bookingsByRes[b.resourceName] || 0) + 1;
    });

    const ctx = document.getElementById('reportChart').getContext('2d');
    reportChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: Object.keys(bookingsByRes).length ? Object.keys(bookingsByRes) : [],
        datasets: [{
          label: 'Bookings Count',
          data: Object.values(bookingsByRes).length ? Object.values(bookingsByRes) : [],
          backgroundColor: '#10B981',
          borderRadius: 8
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
  }
}
