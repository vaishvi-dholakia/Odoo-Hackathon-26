/**
 * AssetFlow Audit JS
 * Manages compliance campaigns, progress bars, and schedule modals.
 */

let auditsTable = null;
let auditModal = null;
let progressModal = null;

document.addEventListener('DOMContentLoaded', async () => {
  window.AssetFlowLoader.show();
  try {
    auditModal = new bootstrap.Modal(document.getElementById('auditModal'));
    progressModal = new bootstrap.Modal(document.getElementById('progressModal'));
    await loadAuditCampaigns();
    setupEventListeners();
  } catch (err) {
    console.error(err);
  } finally {
    window.AssetFlowLoader.hide();
  }
});

async function loadAuditCampaigns() {
  try {
    const campaigns = await window.ApiService.audits.list();
    
    // Calculate stats
    const completedCount = campaigns.filter(c => c.status === 'Completed').length;
    const activeCount = campaigns.filter(c => c.status === 'In Progress').length;

    document.getElementById('val-audits-completed').textContent = completedCount;
    document.getElementById('val-audits-active').textContent = activeCount;

    // Render table
    renderAuditsTable(campaigns);
  } catch (err) {
    console.error(err);
  }
}

function renderAuditsTable(campaigns) {
  const tbody = document.querySelector('#audits-table tbody');
  if (!tbody) return;

  if ($.fn.DataTable.isDataTable('#audits-table')) {
    $('#audits-table').DataTable().destroy();
  }

  let html = '';
  campaigns.forEach(c => {
    let statusClass = 'bg-warning text-dark';
    if (c.status === 'Completed') statusClass = 'bg-success';

    let actionBtnHtml = '';
    if (c.status === 'Completed') {
      actionBtnHtml = `
        <button class="btn btn-sm btn-secondary-custom btn-view-audit" title="View Details">
          <i class="fa-solid fa-eye me-1"></i>View
        </button>
      `;
    } else {
      actionBtnHtml = `
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-primary-custom text-white btn-perform-audit" title="Perform Audit Workspace">
            <i class="fa-solid fa-clipboard-list me-1"></i>Audit
          </button>
          <button class="btn btn-sm btn-secondary-custom btn-update-progress" title="Update Progress">
            <i class="fa-solid fa-bars-progress me-1"></i>Update
          </button>
        </div>
      `;
    }

    html += `
      <tr data-id="${c.id}" data-name="${c.name}" data-auditor="${c.auditor}">
        <td><strong class="text-primary">${c.id}</strong></td>
        <td>
          <div class="fw-semibold text-dark-custom" style="color: var(--text-color);">${c.name}</div>
        </td>
        <td>${c.date}</td>
        <td>${c.auditor}</td>
        <td>
          <div class="d-flex align-items-center gap-2">
            <div class="progress flex-grow-1" style="height: 6px; border-radius:3px;">
              <div class="progress-bar bg-primary" role="progressbar" style="width: ${c.progress}%" aria-valuenow="${c.progress}" aria-valuemin="0" aria-valuemax="100"></div>
            </div>
            <span class="small fw-semibold" style="width:36px; text-align:right;">${c.progress}%</span>
          </div>
        </td>
        <td><span class="badge ${statusClass} rounded-pill px-2.5 py-1">${c.status}</span></td>
        <td>${actionBtnHtml}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  auditsTable = $('#audits-table').DataTable({
    pageLength: 10,
    lengthChange: false,
    info: true,
    ordering: false,
    language: {
      search: "",
      searchPlaceholder: "Search campaigns..."
    }
  });
}

// Global state for current audit workspace
let activeAuditCampaignId = null;
let auditAssetsState = [];

function setupEventListeners() {
  // Campaign Schedule modal open
  const openModalBtn = document.getElementById('btn-open-audit-modal');
  if (openModalBtn) {
    openModalBtn.addEventListener('click', () => {
      document.getElementById('audit-form').reset();
      
      const dateInput = document.getElementById('audit-date');
      if (dateInput) {
        dateInput.value = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // Default +7 days
      }

      // Clear errors
      document.querySelectorAll('.invalid-feedback').forEach(el => el.textContent = '');
      document.querySelectorAll('.form-control').forEach(el => el.classList.remove('is-invalid'));

      auditModal.show();
    });
  }

  // Update Progress modal trigger
  $('#audits-table').on('click', '.btn-update-progress', function() {
    const tr = $(this).closest('tr');
    const id = tr.attr('data-id');
    const name = tr.attr('data-name');
    
    // Get current progress from table row text
    const progressText = tr.find('.progress-bar').attr('aria-valuenow') || '0';
    const progress = parseInt(progressText, 10);

    document.getElementById('progress-audit-id').value = id;
    document.getElementById('progress-campaign-title').textContent = name;
    document.getElementById('progress-range').value = progress;
    document.getElementById('progress-range-val').textContent = `${progress}%`;

    progressModal.show();
  });

  // Perform Audit / View Audit Workspace
  $('#audits-table').on('click', '.btn-perform-audit, .btn-view-audit', async function() {
    const tr = $(this).closest('tr');
    const id = tr.attr('data-id');
    const name = tr.attr('data-name');
    const auditor = tr.attr('data-auditor');
    const isViewOnly = $(this).hasClass('btn-view-audit');

    activeAuditCampaignId = id;

    // Show Loader
    window.AssetFlowLoader.show();
    try {
      // Load assets from database to audit
      const assets = await window.ApiService.assets.list();
      
      // Let's create a mockup checklist for this campaign
      // If we don't have enough assets, insert standard ones from Screen 8 mockup
      let checklistAssets = [];
      
      if (assets.length > 0) {
        checklistAssets = assets.map((a, index) => ({
          tag: a.id,
          name: a.name,
          expectedLocation: a.location || `Desk E${12 + index}`,
          verification: 'Pending' // Pending, Verified, Missing, Damaged
        }));
      } else {
        // Fallback mockup assets
        checklistAssets = [
          { tag: 'AF-003', name: 'Dell laptop', expectedLocation: 'Desk E12', verification: 'Pending' },
          { tag: 'AF-9921', name: 'Office chair', expectedLocation: 'Desk E14', verification: 'Pending' },
          { tag: 'AF-9838', name: 'Monitor', expectedLocation: 'Desk E15', verification: 'Pending' }
        ];
      }

      // Check if we already have progress or state saved in the backend for this audit
      const savedState = await window.ApiService.audits.getState(id);
      if (savedState) {
        auditAssetsState = savedState;
      } else {
        auditAssetsState = checklistAssets;
      }

      // Populate Workspace HTML
      document.getElementById('workspace-campaign-title').textContent = name;
      document.getElementById('workspace-campaign-auditors').innerHTML = `<i class="fa-solid fa-user-shield me-2 text-primary"></i>Auditors: ${auditor}`;

      renderWorkspaceChecklist(isViewOnly);

      // Hide table list, show workspace
      document.getElementById('audits-list-panel').classList.add('d-none');
      document.getElementById('audit-workspace-panel').classList.remove('d-none');

      // Setup close button state
      const closeBtn = document.getElementById('btn-close-audit-cycle');
      if (isViewOnly) {
        closeBtn.innerHTML = '<i class="fa-solid fa-check-double me-2"></i>Audit Completed';
        closeBtn.disabled = true;
      } else {
        closeBtn.innerHTML = '<i class="fa-solid fa-lock me-2"></i>Close audit cycle';
        closeBtn.disabled = false;
      }

    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    } finally {
      window.AssetFlowLoader.hide();
    }
  });

  // Back to campaigns list
  const backBtn = document.getElementById('btn-back-to-campaigns');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      document.getElementById('audit-workspace-panel').classList.add('d-none');
      document.getElementById('audits-list-panel').classList.remove('d-none');
    });
  }

  // Close audit cycle click handler
  const closeAuditBtn = document.getElementById('btn-close-audit-cycle');
  if (closeAuditBtn) {
    closeAuditBtn.addEventListener('click', () => {
      // Check if all verified
      const pendingCount = auditAssetsState.filter(a => a.verification === 'Pending').length;
      if (pendingCount > 0) {
        Swal.fire({
          title: 'Unverified Assets Remaining',
          text: `There are ${pendingCount} assets still pending verification. Do you want to close anyway?`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#F59E0B',
          confirmButtonText: 'Yes, close it',
          cancelButtonText: 'Cancel'
        }).then((result) => {
          if (result.isConfirmed) {
            executeCloseAuditCycle();
          }
        });
      } else {
        Swal.fire({
          title: 'Close Audit Cycle?',
          text: 'This will lock the audit cycle and automatically update all asset statuses according to verification states.',
          icon: 'question',
          showCancelButton: true,
          confirmButtonColor: '#2563EB',
          confirmButtonText: 'Yes, close cycle',
          cancelButtonText: 'Cancel'
        }).then((result) => {
          if (result.isConfirmed) {
            executeCloseAuditCycle();
          }
        });
      }
    });
  }

  // Range slider visual update
  const rangeInput = document.getElementById('progress-range');
  const rangeVal = document.getElementById('progress-range-val');
  if (rangeInput && rangeVal) {
    rangeInput.addEventListener('input', (e) => {
      rangeVal.textContent = `${e.target.value}%`;
    });
  }

  // Schedule modal submit
  const scheduleForm = document.getElementById('audit-form');
  if (scheduleForm) {
    scheduleForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Clear errors
      document.querySelectorAll('.invalid-feedback').forEach(el => el.textContent = '');
      document.querySelectorAll('.form-control').forEach(el => el.classList.remove('is-invalid'));

      const name = document.getElementById('audit-name').value.trim();
      const auditor = document.getElementById('audit-auditor').value.trim();
      const date = document.getElementById('audit-date').value;

      let isValid = true;

      if (!name) {
        showError('audit-name', 'Campaign name is required.');
        isValid = false;
      }
      if (!auditor) {
        showError('audit-auditor', 'Please assign an auditor.');
        isValid = false;
      }
      if (!date) {
        showError('audit-date', 'Completion date is required.');
        isValid = false;
      }

      if (!isValid) return;

      const spinner = document.getElementById('audit-spinner');
      const submitBtn = document.getElementById('btn-save-audit');
      if (spinner) spinner.classList.remove('d-none');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const payload = {
          name,
          auditor,
          date
        };

        await window.ApiService.audits.create(payload);

        Swal.fire({
          title: 'Scheduled!',
          text: 'New compliance audit campaign scheduled.',
          icon: 'success',
          confirmButtonColor: '#2563EB'
        });

        auditModal.hide();
        await loadAuditCampaigns();
      } catch (err) {
        Swal.fire('Error', err.message, 'error');
      } finally {
        if (spinner) spinner.classList.add('d-none');
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // Progress update submit
  const progressForm = document.getElementById('progress-form');
  if (progressForm) {
    progressForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const id = document.getElementById('progress-audit-id').value;
      const progress = parseInt(document.getElementById('progress-range').value, 10);

      window.AssetFlowLoader.show();
      try {
        await window.ApiService.audits.updateProgress(id, progress);
        
        Swal.fire({
          title: 'Updated',
          text: 'Campaign progress updated successfully.',
          icon: 'success',
          confirmButtonColor: '#2563EB'
        });

        progressModal.hide();
        await loadAuditCampaigns();
      } catch (err) {
        Swal.fire('Error', err.message, 'error');
      } finally {
        window.AssetFlowLoader.hide();
      }
    });
  }
}

function renderWorkspaceChecklist(isViewOnly) {
  const tbody = document.getElementById('workspace-assets-body');
  if (!tbody) return;

  tbody.innerHTML = '';
  let flaggedCount = 0;

  auditAssetsState.forEach((item, index) => {
    if (item.verification === 'Missing' || item.verification === 'Damaged') {
      flaggedCount++;
    }

    // Determine verification badge button group
    let btnGroupHtml = '';
    if (isViewOnly) {
      let badgeClass = 'bg-secondary';
      if (item.verification === 'Verified') badgeClass = 'bg-success';
      if (item.verification === 'Missing') badgeClass = 'bg-danger';
      if (item.verification === 'Damaged') badgeClass = 'bg-warning text-dark';
      btnGroupHtml = `<span class="badge ${badgeClass} px-3 py-2 rounded-pill fs-7">${item.verification}</span>`;
    } else {
      btnGroupHtml = `
        <div class="btn-group btn-group-sm" role="group" aria-label="Verification choices">
          <button type="button" class="btn btn-outline-success px-3 btn-verify-choice ${item.verification === 'Verified' ? 'active btn-success text-white' : ''}" data-index="${index}" data-choice="Verified">Verified</button>
          <button type="button" class="btn btn-outline-danger px-3 btn-verify-choice ${item.verification === 'Missing' ? 'active btn-danger text-white' : ''}" data-index="${index}" data-choice="Missing">Missing</button>
          <button type="button" class="btn btn-outline-warning px-3 btn-verify-choice ${item.verification === 'Damaged' ? 'active btn-warning text-dark' : ''}" data-index="${index}" data-choice="Damaged">Damaged</button>
        </div>
      `;
    }

    tbody.innerHTML += `
      <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-color);">
        <td>
          <div class="fw-bold">${item.tag}</div>
          <div class="text-muted small">${item.name}</div>
        </td>
        <td>
          <span style="font-family: monospace;">${item.expectedLocation}</span>
        </td>
        <td class="text-center">
          ${btnGroupHtml}
        </td>
      </tr>
    `;
  });

  // Update discrepancy banner
  const banner = document.getElementById('workspace-discrepancy-banner');
  const bannerText = document.getElementById('workspace-discrepancy-text');
  if (banner && bannerText) {
    if (flaggedCount > 0) {
      bannerText.textContent = `${flaggedCount} assets flagged - discrepancy report generated automatically`;
      banner.classList.remove('d-none');
    } else {
      banner.classList.add('d-none');
    }
  }

  // Attach button click events inside checklist
  if (!isViewOnly) {
    document.querySelectorAll('.btn-verify-choice').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'), 10);
        const choice = e.target.getAttribute('data-choice');
        
        auditAssetsState[idx].verification = choice;
        
        // Save current campaign state to backend
        await window.ApiService.audits.saveState(activeAuditCampaignId, auditAssetsState);
        
        // Calculate progress percentage
        const verifiedOrFlagged = auditAssetsState.filter(a => a.verification !== 'Pending').length;
        const progressPercent = Math.round((verifiedOrFlagged / auditAssetsState.length) * 100);
        
        // Save current progress dynamically
        window.ApiService.audits.updateProgress(activeAuditCampaignId, progressPercent);

        renderWorkspaceChecklist(false);
      });
    });
  }
}

async function executeCloseAuditCycle() {
  window.AssetFlowLoader.show();
  try {
    // 1. Mark campaign as completed (progress 100, status Completed)
    await window.ApiService.audits.updateProgress(activeAuditCampaignId, 100);

    // 2. Loop through assets state and apply updates to statuses
    const assets = await window.ApiService.assets.list();
    
    for (let audited of auditAssetsState) {
      const targetAsset = assets.find(a => String(a.id) === String(audited.tag));
      if (targetAsset) {
        if (audited.verification === 'Missing') {
          await window.ApiService.assets.update(targetAsset.id, { ...targetAsset, status: 'Lost' });
          
          // Log discrepancy notification & audit log
          await window.ApiService.notifications.create({
            title: `Audit Discrepancy Flagged: ${targetAsset.id} Missing`,
            message: `During campaign, asset ${targetAsset.name} was marked missing. Status set to Lost.`,
            type: 'warning'
          });
        } else if (audited.verification === 'Damaged') {
          await window.ApiService.assets.update(targetAsset.id, { ...targetAsset, status: 'Maintenance' });
          
          // Log discrepancy notification & audit log
          await window.ApiService.notifications.create({
            title: `Audit Discrepancy Flagged: ${targetAsset.id} Damaged`,
            message: `Asset ${targetAsset.name} was marked damaged. Status set to Maintenance.`,
            type: 'warning'
          });

          // Create a maintenance request automatically
          await window.ApiService.maintenance.create({
            assetId: targetAsset.id,
            assetName: targetAsset.name,
            type: 'Repair',
            cost: 250,
            date: new Date().toISOString().split('T')[0],
            description: `Auto-generated from audit: Asset found damaged during check-in.`
          });
        } else if (audited.verification === 'Verified' && targetAsset.status === 'Lost') {
          await window.ApiService.assets.update(targetAsset.id, { ...targetAsset, status: 'Active' });
        }
      }
    }

    // Save final checklist state to backend
    await window.ApiService.audits.saveState(activeAuditCampaignId, auditAssetsState);

    Swal.fire({
      title: 'Audit Cycle Closed!',
      text: 'Audit locked successfully. Flags processed and asset statuses updated.',
      icon: 'success',
      confirmButtonColor: '#2563EB'
    });

    // Go back
    document.getElementById('audit-workspace-panel').classList.add('d-none');
    document.getElementById('audits-list-panel').classList.remove('d-none');
    
    await loadAuditCampaigns();
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  } finally {
    window.AssetFlowLoader.hide();
  }
}

function showError(id, message) {
  const errEl = document.getElementById(`${id}-error`);
  const inputEl = document.getElementById(id);
  if (errEl) errEl.textContent = message;
  if (inputEl) inputEl.classList.add('is-invalid');
}
