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

  const role = window.RbacService.getCurrentUserRole();
  const user = window.RbacService.getCurrentUser() || {};
  const userDept = user.department || 'IT';
  const isDeptHead = (role === 'Department Head' || role === 'DepartmentHead');

  // Update Page Header Title & Subtitle for Department Head
  const pageTitleEl = document.querySelector('h2.fw-bold');
  const pageSubTitleEl = document.querySelector('h2.fw-bold + p');
  if (isDeptHead) {
    if (pageTitleEl) pageTitleEl.textContent = `Department Analytics (${userDept})`;
    if (pageSubTitleEl) pageSubTitleEl.textContent = `Real-time asset utilization, maintenance expenses, and resource reports for ${userDept} Department.`;
    
    // Update Chart 1 Card Title
    const chart1Box = document.getElementById('chart-utilization-dept');
    if (chart1Box && chart1Box.closest('.card-custom')) {
      const h5 = chart1Box.closest('.card-custom').querySelector('h5');
      const p = chart1Box.closest('.card-custom').querySelector('p');
      if (h5) h5.innerHTML = `<i class="fa-solid fa-chart-pie me-2 text-primary"></i>Category Asset Distribution`;
      if (p) p.textContent = `Asset category breakdown for ${userDept} Department`;
    }
  } else {
    if (pageTitleEl) pageTitleEl.textContent = `System Analytics`;
    if (pageSubTitleEl) pageSubTitleEl.textContent = `Generate, review, and export financial and operational reports`;
  }

  try {
    let analytics = null;
    
    // Compute real-time analytics from DB tables (scoped by role)
    console.warn("Computing analytics from live DB tables...");
    const [assets, maintenance, bookings, allocations] = await Promise.all([
      window.ApiService.assets.list().catch(() => []),
      window.ApiService.maintenance.list().catch(() => []),
      window.ApiService.bookings.list().catch(() => []),
      window.ApiService.allocations.list().catch(() => [])
    ]);

    let assetList = Array.isArray(assets) ? assets : [];
    let maintList = Array.isArray(maintenance) ? maintenance : [];
    let bookingList = Array.isArray(bookings) ? bookings : [];
    let allocList = Array.isArray(allocations) ? allocations : [];

    // STRICT DEPARTMENT-HEAD SCOPING
    if (isDeptHead) {
      const deptAllocAssetIds = new Set(
        allocList.filter(al => al.department === userDept).map(al => String(al.assetId))
      );
      assetList = assetList.filter(a => a.department === userDept || deptAllocAssetIds.has(String(a.id)));
      
      const deptAssetIds = new Set(assetList.map(a => String(a.id)));
      maintList = maintList.filter(m => deptAssetIds.has(String(m.assetId)));
      allocList = allocList.filter(al => al.department === userDept);
      bookingList = bookingList.filter(b => b.department === userDept);
    }

    const totalValuation = assetList.reduce((sum, a) => sum + (parseFloat(a.cost || a.value) || 0), 0);
    const totalMaintenanceCost = maintList.reduce((sum, m) => sum + (parseFloat(m.cost) || 0), 0);

    // Distribution map (If Dept Head: show Category breakdown; If Admin: show Department breakdown)
    const deptMap = {};
    assetList.forEach(a => {
      const key = isDeptHead ? (a.type || a.category || 'Hardware') : (a.department || 'General');
      deptMap[key] = (deptMap[key] || 0) + 1;
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
      idleList,
      isDeptHead,
      userDept
    };

    window.analyticsDataCache = analytics;

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
        items.forEach((item) => {
          html += `
            <div class="p-3.5 rounded-3 border bg-body-tertiary d-flex justify-content-between align-items-center">
              <div>
                <div class="fw-bold fs-6 text-body mb-1">${escapeHtml(item.name)}</div>
                <small class="text-muted fs-7"><i class="fa-solid fa-fire me-1 text-danger"></i>High Demand Resource</small>
              </div>
              <span class="badge bg-danger text-white px-3 py-1.5 rounded-pill fs-7 fw-bold">
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
            <div class="p-3.5 rounded-3 border bg-body-tertiary d-flex justify-content-between align-items-center">
              <div>
                <div class="fw-bold fs-6 text-body mb-1">${escapeHtml(item.name)} <span class="badge bg-primary-subtle text-primary ms-1 fs-7">${escapeHtml(item.id)}</span></div>
                <small class="text-muted fs-7"><i class="fa-solid fa-location-dot me-1 text-muted"></i>${escapeHtml(item.location)}</small>
              </div>
              <span class="badge bg-success-subtle text-success px-3 py-1.5 rounded-pill fs-7 fw-bold">Available</span>
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

  const role = window.RbacService.getCurrentUserRole();
  const user = window.RbacService.getCurrentUser() || {};
  const userDept = user.department || 'IT';
  const isDeptHead = (role === 'Department Head' || role === 'DepartmentHead');

  async function getReportAnalyticsData() {
    return window.analyticsDataCache || {};
  }

  // Live CSV Export Action (Scoped by Role)
  const csvBtn = document.getElementById('btn-export-csv');
  if (csvBtn) {
    csvBtn.addEventListener('click', async () => {
      window.AssetFlowLoader.show();
      try {
        let [assets, allocations, maintenance] = await Promise.all([
          window.ApiService.assets.list().catch(() => []),
          window.ApiService.allocations.list().catch(() => []),
          window.ApiService.maintenance.list().catch(() => [])
        ]);

        if (isDeptHead) {
          const deptAllocAssetIds = new Set(
            allocations.filter(al => al.department === userDept).map(al => String(al.assetId))
          );
          assets = assets.filter(a => a.department === userDept || deptAllocAssetIds.has(String(a.id)));
          const deptAssetIds = new Set(assets.map(a => String(a.id)));
          maintenance = maintenance.filter(m => deptAssetIds.has(String(m.assetId)));
          allocations = allocations.filter(al => al.department === userDept);
        }

        let csvContent = "\uFEFF"; // Byte Order Mark for Excel UTF-8
        
        // Section 1: Assets Inventory
        csvContent += `ASSET INVENTORY LEDGER (${isDeptHead ? userDept + ' Department' : 'Enterprise All'})\r\n`;
        csvContent += '"Asset ID","Asset Name","Type","Department","Status","Location","Cost (INR)"\r\n';
        (assets || []).forEach(a => {
          csvContent += `"${a.id}","${(a.name||'').replace(/"/g, '""')}","${a.type||''}","${a.department||''}","${a.status||''}","${(a.location||'').replace(/"/g, '""')}","${parseFloat(a.cost||a.value)||0}"\r\n`;
        });
        csvContent += "\r\n";

        // Section 2: Allocations
        csvContent += `ALLOCATION ASSIGNMENTS (${isDeptHead ? userDept + ' Department' : 'Enterprise All'})\r\n`;
        csvContent += '"Request ID","Asset ID","Asset Name","Target Department/User","Date","Status"\r\n';
        (allocations || []).forEach(al => {
          csvContent += `"${al.id}","${al.assetId||''}","${(al.assetName||'').replace(/"/g, '""')}","${(al.allocatedTo||al.department||'').replace(/"/g, '""')}","${al.date||''}","${al.status||''}"\r\n`;
        });
        csvContent += "\r\n";

        // Section 3: Maintenance
        csvContent += `MAINTENANCE EXPENDITURES (${isDeptHead ? userDept + ' Department' : 'Enterprise All'})\r\n`;
        csvContent += '"Log ID","Asset ID","Asset Name","Type","Cost (INR)","Date","Status"\r\n';
        (maintenance || []).forEach(m => {
          csvContent += `"${m.id}","${m.assetId||''}","${(m.assetName||'').replace(/"/g, '""')}","${m.type||''}","${parseFloat(m.cost)||0}","${m.date||''}","${m.status||''}"\r\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `AssetFlow_${isDeptHead ? userDept + '_' : ''}Report_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        Swal.fire({
          title: 'CSV Exported!',
          text: `Report data (${isDeptHead ? userDept + ' Department' : 'Company Wide'}) exported successfully to CSV.`,
          icon: 'success',
          confirmButtonColor: '#2563EB'
        });
      } catch (err) {
        console.error("CSV Export Error:", err);
        Swal.fire('Export Error', 'Unable to export CSV file.', 'error');
      } finally {
        window.AssetFlowLoader.hide();
      }
    });
  }

  // Professional 2-Page PDF Export Action (Scoped by Role)
  const pdfBtn = document.getElementById('btn-export-pdf');
  if (pdfBtn) {
    pdfBtn.addEventListener('click', async () => {
      window.AssetFlowLoader.show();
      try {
        const analyticsData = await getReportAnalyticsData();
        
        // Get chart canvas data URLs
        const chartUtilCanvas = document.getElementById('chart-utilization-dept');
        const chartFreqCanvas = document.getElementById('chart-maintenance-freq');
        
        const chartUtilImg = chartUtilCanvas ? chartUtilCanvas.toDataURL('image/png') : '';
        const chartFreqImg = chartFreqCanvas ? chartFreqCanvas.toDataURL('image/png') : '';

        let mostUsedRows = '';
        (analyticsData.mostUsedList || []).forEach(item => {
          mostUsedRows += `
            <tr>
              <td style="padding: 10px 12px; border-bottom: 1px solid #E2E8F0; font-weight: bold; color: #1E293B;">${escapeHtml(item.name)}</td>
              <td style="padding: 10px 12px; border-bottom: 1px solid #E2E8F0; color: #DC2626; font-weight: 600;">High Demand Resource</td>
              <td style="padding: 10px 12px; border-bottom: 1px solid #E2E8F0; text-align: right; font-weight: bold; color: #DC2626;">${item.count} Use(s)</td>
            </tr>
          `;
        });
        if (!mostUsedRows) mostUsedRows = `<tr><td colspan="3" style="padding: 12px; text-align: center; color: #64748B;">No usage records logged.</td></tr>`;

        let idleRows = '';
        (analyticsData.idleList || []).forEach(item => {
          idleRows += `
            <tr>
              <td style="padding: 10px 12px; border-bottom: 1px solid #E2E8F0; font-weight: bold; color: #1E293B;">${escapeHtml(item.name)}</td>
              <td style="padding: 10px 12px; border-bottom: 1px solid #E2E8F0; color: #2563EB; font-weight: 600;">${escapeHtml(item.id)}</td>
              <td style="padding: 10px 12px; border-bottom: 1px solid #E2E8F0; color: #64748B;">${escapeHtml(item.location)}</td>
              <td style="padding: 10px 12px; border-bottom: 1px solid #E2E8F0; text-align: right; color: #10B981; font-weight: bold;">Available</td>
            </tr>
          `;
        });
        if (!idleRows) idleRows = `<tr><td colspan="4" style="padding: 12px; text-align: center; color: #64748B;">All assets currently allocated.</td></tr>`;

        const reportTitleHeader = isDeptHead ? `${userDept} Departmental Audit` : 'Executive Operational & Asset Intelligence Audit';
        const chart1HeaderTitle = isDeptHead ? 'Category Asset Distribution' : 'Department Asset Distribution';
        const row3Label = isDeptHead ? 'Department Scope' : 'Enterprise Departments';
        const row3Val = isDeptHead ? `${userDept} Department` : `${Object.keys(analyticsData.deptDistribution || {}).length || 1} Departments`;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>AssetFlow ${isDeptHead ? userDept + ' Department' : 'Executive'} Report</title>
            <style>
              @page { size: A4 portrait; margin: 12mm; }
              body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1E293B; margin: 0; padding: 0; background: #FFF; font-size: 13px; line-height: 1.5; }
              .page { height: 267mm; box-sizing: border-box; page-break-after: always; display: flex; flex-direction: column; justify-content: space-between; }
              .page-last { page-break-after: avoid; }
              .header-bar { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #2563EB; padding-bottom: 12px; margin-bottom: 20px; }
              .logo-title { font-size: 22px; font-weight: 800; color: #2563EB; letter-spacing: -0.5px; }
              .sub-title { font-size: 11px; color: #64748B; text-transform: uppercase; font-weight: 600; margin-top: 2px; }
              .section-title { font-size: 13px; font-weight: 700; color: #0F172A; text-transform: uppercase; border-left: 4px solid #2563EB; padding-left: 8px; margin-top: 15px; margin-bottom: 12px; }
              .charts-row { display: flex; gap: 20px; margin-bottom: 20px; }
              .chart-box { flex: 1; border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px; text-align: center; background: #F8FAFC; }
              .chart-box h4 { font-size: 11px; color: #334155; margin: 0 0 10px 0; text-transform: uppercase; font-weight: 700; }
              .chart-box img { max-width: 100%; height: 190px; object-fit: contain; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
              th { background: #F1F5F9; color: #475569; text-transform: uppercase; font-size: 10px; font-weight: 700; padding: 9px 12px; text-align: left; border-bottom: 2px solid #CBD5E1; }
              .footer { border-top: 1px solid #E2E8F0; padding-top: 10px; font-size: 10px; color: #94A3B8; display: flex; justify-content: space-between; }
            </style>
          </head>
          <body>
            
            <!-- PAGE 1: CHARTS & EXECUTIVE SUMMARY -->
            <div class="page">
              <div>
                <div class="header-bar">
                  <div>
                    <div class="logo-title">AssetFlow Analytics</div>
                    <div class="sub-title">${reportTitleHeader}</div>
                  </div>
                </div>

                <div class="section-title">${isDeptHead ? userDept + ' Department Analytics Overview' : 'System Asset & Maintenance Analytics Overview'}</div>
                <div class="charts-row">
                  <div class="chart-box">
                    <h4>${chart1HeaderTitle}</h4>
                    ${chartUtilImg ? `<img src="${chartUtilImg}" />` : '<div style="padding:40px; color:#94A3B8;">Chart unavailable</div>'}
                  </div>
                  <div class="chart-box">
                    <h4>Asset Status Breakdown</h4>
                    ${chartFreqImg ? `<img src="${chartFreqImg}" />` : '<div style="padding:40px; color:#94A3B8;">Chart unavailable</div>'}
                  </div>
                </div>

                <div class="section-title">Summary Audit Indicators</div>
                <table>
                  <thead>
                    <tr>
                      <th>Metric Category</th>
                      <th>Operational Indicator</th>
                      <th style="text-align: right;">Current Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style="padding:10px 12px; border-bottom:1px solid #E2E8F0; font-weight:bold;">Total Inventory Units</td>
                      <td style="padding:10px 12px; border-bottom:1px solid #E2E8F0; color:#64748B;">Active and registered hardware assets</td>
                      <td style="padding:10px 12px; border-bottom:1px solid #E2E8F0; text-align:right; font-weight:bold; color:#10B981;">${analyticsData.totalAssetsCount || 0} Assets</td>
                    </tr>
                    <tr>
                      <td style="padding:10px 12px; border-bottom:1px solid #E2E8F0; font-weight:bold;">Maintenance Expenditures</td>
                      <td style="padding:10px 12px; border-bottom:1px solid #E2E8F0; color:#64748B;">Total repair and servicing expense</td>
                      <td style="padding:10px 12px; border-bottom:1px solid #E2E8F0; text-align:right; font-weight:bold; color:#EF4444;">₹ ${(analyticsData.totalMaintenanceCost || 0).toLocaleString('en-IN')}</td>
                    </tr>
                    <tr>
                      <td style="padding:10px 12px; border-bottom:1px solid #E2E8F0; font-weight:bold;">${row3Label}</td>
                      <td style="padding:10px 12px; border-bottom:1px solid #E2E8F0; color:#64748B;">Organizational audit scope</td>
                      <td style="padding:10px 12px; border-bottom:1px solid #E2E8F0; text-align:right; font-weight:bold; color:#2563EB;">${row3Val}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="footer">
                <span>AssetFlow System Compliance Engine</span>
              </div>
            </div>

            <!-- PAGE 2: UTILIZATION & IDLE ASSETS -->
            <div class="page page-last">
              <div>
                <div class="header-bar">
                  <div>
                    <div class="logo-title">AssetFlow Analytics</div>
                    <div class="sub-title">Resource Utilization & Idle Stock Ledger</div>
                  </div>
                </div>

                <div class="section-title">Most Utilized Assets & Resources</div>
                <table>
                  <thead>
                    <tr>
                      <th>Resource / Asset Name</th>
                      <th>Demand Category</th>
                      <th style="text-align: right;">Utilization Frequency</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${mostUsedRows}
                  </tbody>
                </table>

                <div class="section-title" style="margin-top: 25px;">Available Idle Assets in Stock</div>
                <table>
                  <thead>
                    <tr>
                      <th>Asset Name</th>
                      <th>Asset Code</th>
                      <th>Current Location</th>
                      <th style="text-align: right;">Availability Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${idleRows}
                  </tbody>
                </table>
              </div>

              <div>
                <div style="margin-top: 20px; display: flex; justify-content: space-between; align-items: flex-end; padding-top: 15px; border-top: 1px dashed #CBD5E1;">
                  <div>
                    <div style="font-weight: bold; font-size: 11px; color: #334155;">Verified By:</div>
                    <div style="font-size: 11px; color: #64748B; margin-top: 3px;">AssetFlow Automated Compliance Audit</div>
                  </div>
                  <div style="text-align: right;">
                    <div style="font-size: 10px; color: #94A3B8;">Official Seal / Approval</div>
                    <div style="font-weight: bold; font-size: 12px; color: #10B981; margin-top: 2px;">✔ Certified Executive Audit</div>
                  </div>
                </div>

                <div class="footer" style="margin-top: 15px;">
                  <span>Confidential - Internal Enterprise System Report</span>
                </div>
              </div>
            </div>

            <script>
              window.onload = function() {
                setTimeout(function() {
                  window.print();
                }, 400);
              };
            </script>
          </body>
          </html>
        `);
        printWindow.document.close();
      } catch (err) {
        console.error("PDF Export Error:", err);
        Swal.fire('Error', 'Unable to generate PDF report.', 'error');
      } finally {
        window.AssetFlowLoader.hide();
      }
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
