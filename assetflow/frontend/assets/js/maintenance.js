/**
 * AssetFlow Maintenance JS
 * Handles maintenance lists, scheduling logs, cost counters, and completions.
 */

let maintTable = null;
let maintModal = null;
let currentLogs = [];

document.addEventListener('DOMContentLoaded', async () => {
  window.AssetFlowLoader.show();
  try {
    maintModal = new bootstrap.Modal(document.getElementById('maintenanceModal'));
    const role = window.RbacService.getCurrentUserRole();
    const openModalBtn = document.getElementById('btn-open-maintenance-modal');
    if (role === 'Employee' && openModalBtn) {
      openModalBtn.innerHTML = '<i class="fa-solid fa-paper-plane me-2"></i>Report Issue';
    }
    await loadMaintenanceData();
    setupEventListeners();
  } catch (err) {
    console.error(err);
  } finally {
    window.AssetFlowLoader.hide();
  }
});

async function loadMaintenanceData() {
  try {
    let logs = await window.ApiService.maintenance.list();
    const allAssets = await window.ApiService.assets.list();

    // Auto-sync: Check if any asset was added/marked with status "Maintenance" in Asset Registry but has no active log
    const activeLogAssetIds = new Set(
      logs.filter(l => l.status !== 'Completed' && l.status !== 'Resolved' && l.status !== 'Cancelled').map(l => String(l.assetId))
    );

    const assetsNeedingLog = allAssets.filter(a => a.status === 'Maintenance' && !activeLogAssetIds.has(String(a.id)));

    for (const ast of assetsNeedingLog) {
      try {
        const autoLog = {
          assetId: ast.id,
          assetName: ast.name,
          type: 'Scheduled',
          cost: 0,
          date: new Date().toISOString().split('T')[0],
          description: `Auto-logged maintenance for ${ast.name} (${ast.id}).`
        };
        const res = await window.ApiService.maintenance.create(autoLog);
        if (res && res.log) {
          logs.push(res.log);
        } else {
          logs.push({
            id: 'MNT-' + Math.floor(1000 + Math.random() * 9000),
            ...autoLog,
            status: 'Pending'
          });
        }
      } catch (e) {
        console.error("Auto log creation notice:", e);
      }
    }

    const role = window.RbacService.getCurrentUserRole();
    if (role === 'Employee') {
      const user = window.RbacService.getCurrentUser() || {};
      const userEmail = (user.email || '').toLowerCase().trim();
      const userDept = (user.department || '').toLowerCase().trim();

      let userNamesSet = new Set();
      if (user.fullName) userNamesSet.add(user.fullName.toLowerCase().trim());
      if (user.name) userNamesSet.add(user.name.toLowerCase().trim());
      if (user.email) userNamesSet.add(user.email.toLowerCase().trim());

      const userNamesList = Array.from(userNamesSet).filter(Boolean);

      const myAssetIds = new Set(
        allAssets.filter(a => {
          if (a.owner) {
            const ownerLower = a.owner.toLowerCase().trim();
            if (userNamesSet.has(ownerLower)) return true;
            if (userNamesList.some(name => ownerLower.includes(name) || name.includes(ownerLower))) return true;
            if (userDept && (ownerLower === userDept || ownerLower.includes(userDept) || userDept.includes(ownerLower))) return true;
          }
          if (a.department) {
            const aDept = a.department.toLowerCase().trim();
            if (userDept && (aDept.includes(userDept) || userDept.includes(aDept))) return true;
          }
          return false;
        }).map(a => String(a.id))
      );
      logs = logs.filter(l => myAssetIds.has(String(l.assetId)));
    }

    currentLogs = logs;
    
    // 1. Calculate statistics
    const pendingCount = currentLogs.filter(l => l.status === 'Pending').length;
    const completedCount = currentLogs.filter(l => l.status === 'Completed' || l.status === 'Resolved').length;
    const totalCost = currentLogs.reduce((sum, log) => sum + (parseFloat(log.cost) || 0), 0);

    // Update stats UI
    document.getElementById('count-pending-maint').textContent = pendingCount;
    document.getElementById('count-completed-maint').textContent = completedCount;
    document.getElementById('val-total-maint-cost').textContent = `₹ ${totalCost.toLocaleString('en-IN')}`;

    // 2. Render Kanban & Table Views
    renderMaintenanceTable(currentLogs);
    renderKanbanBoard(currentLogs);

  } catch (err) {
    console.error(err);
  }
}

function renderMaintenanceTable(logs) {
  const tbody = document.querySelector('#maintenance-table tbody');
  if (!tbody) return;

  if ($.fn.DataTable.isDataTable('#maintenance-table')) {
    $('#maintenance-table').DataTable().destroy();
  }

  let html = '';
  const role = window.RbacService.getCurrentUserRole();
  const canApproveMaint = window.RbacService.hasPermission(role, 'approve_maintenance');

  logs.forEach(log => {
    let statusClass = 'bg-warning text-dark';
    let actionBtn = '';

    const displayStatus = log.status === 'Completed' ? 'Resolved' : log.status;

    if (log.status === 'Completed' || log.status === 'Resolved') {
      statusClass = 'bg-success';
      actionBtn = '<span class="text-muted small">Resolved</span>';
    } else if (!canApproveMaint) {
      actionBtn = `<span class="text-muted small">${displayStatus}</span>`;
    } else if (log.status === 'Pending') {
      statusClass = 'bg-warning text-dark';
      actionBtn = `
        <button class="btn btn-sm btn-success btn-resolve" title="Mark as Resolved">
          <i class="fa-solid fa-circle-check me-1"></i>Resolve
        </button>
      `;
    } else {
      statusClass = 'bg-info text-dark';
      actionBtn = `
        <button class="btn btn-sm btn-success btn-resolve" title="Mark as Resolved">
          <i class="fa-solid fa-circle-check me-1"></i>Resolve
        </button>
      `;
    }

    const logCostVal = parseFloat(log.cost) || 0;
    const costCellHtml = canApproveMaint ? `
      <button class="btn btn-sm btn-outline-success py-0.5 px-2 fs-8 fw-bold btn-edit-cost" data-id="${log.id}" title="Click to update cost">
        ₹ ${logCostVal.toLocaleString('en-IN')} <i class="fa-solid fa-pen ms-1 fs-9"></i>
      </button>
    ` : `<span class="fw-bold text-success">₹ ${logCostVal.toLocaleString('en-IN')}</span>`;

    html += `
      <tr data-id="${log.id}">
        <td><strong class="text-primary">${log.id}</strong></td>
        <td><strong>${log.assetId}</strong></td>
        <td>
          <div class="fw-semibold text-dark-custom" style="color: var(--text-color);">${log.assetName}</div>
        </td>
        <td>${log.type}</td>
        <td><span class="text-truncate-2 small" style="max-width:200px;" title="${log.description || ''}">${log.description || '--'}</span></td>
        <td>${costCellHtml}</td>
        <td>${log.date}</td>
        <td><span class="badge ${statusClass} rounded-pill px-2.5 py-1">${displayStatus}</span></td>
        <td>${actionBtn}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  maintTable = $('#maintenance-table').DataTable({
    pageLength: 10,
    lengthChange: false,
    info: true,
    ordering: false,
    language: {
      search: "",
      searchPlaceholder: "Search maintenance log..."
    }
  });
}

function renderKanbanBoard(logs) {
  const columns = {
    'Pending': document.getElementById('kanban-pending'),
    'Approved': document.getElementById('kanban-approved'),
    'Technician assigned': document.getElementById('kanban-assigned'),
    'In progress': document.getElementById('kanban-inprogress'),
    'Resolved': document.getElementById('kanban-resolved')
  };

  // Clear all columns first
  Object.keys(columns).forEach(key => {
    if (columns[key]) columns[key].innerHTML = '';
  });

  const counts = { 'Pending': 0, 'Approved': 0, 'Technician assigned': 0, 'In progress': 0, 'Resolved': 0 };

  logs.forEach(log => {
    // Treat "Completed" as "Resolved"
    let status = log.status;
    if (status === 'Completed') status = 'Resolved';

    if (!columns[status]) return;
    counts[status]++;

    const role = window.RbacService.getCurrentUserRole();
    const canApprove = window.RbacService.hasPermission(role, 'approve_maintenance');
    const isResolved = status === 'Resolved';
    const cardClass = isResolved ? 'kanban-card resolved-card' : 'kanban-card';
    const isDraggable = canApprove;

    // Action buttons depending on state
    let actionButtons = '';
    if (canApprove) {
      if (status === 'Pending') {
        actionButtons = `<button class="btn btn-sm btn-outline-primary py-0 px-1 fs-8 btn-move" data-id="${log.id}" data-to="Approved">Approve <i class="fa-solid fa-arrow-right"></i></button>`;
      } else if (status === 'Approved') {
        actionButtons = `<button class="btn btn-sm btn-outline-info py-0 px-1 fs-8 btn-move text-dark" data-id="${log.id}" data-to="Technician assigned">Assign Tech <i class="fa-solid fa-arrow-right"></i></button>`;
      } else if (status === 'Technician assigned') {
        actionButtons = `<button class="btn btn-sm btn-outline-danger py-0 px-1 fs-8 btn-move" data-id="${log.id}" data-to="In progress">Start Work <i class="fa-solid fa-arrow-right"></i></button>`;
      } else if (status === 'In progress') {
        actionButtons = `<button class="btn btn-sm btn-outline-success py-0 px-1 fs-8 btn-move" data-id="${log.id}" data-to="Resolved">Resolve <i class="fa-solid fa-circle-check"></i></button>`;
      }
    }

    const costVal = parseFloat(log.cost) || 0;
    const costBtnText = costVal > 0 ? `₹ ${costVal.toLocaleString('en-IN')}` : '+ Add Cost';
    const costHtml = canApprove ? `
      <button class="btn btn-sm btn-outline-success py-0.5 px-2 fs-8 fw-bold btn-edit-cost" data-id="${log.id}" title="Click to add or edit repair cost">
        ${costBtnText} <i class="fa-solid fa-pen ms-1 fs-9"></i>
      </button>
    ` : `<span class="badge bg-success-subtle text-success border border-success-subtle fs-8 fw-bold">₹ ${costVal.toLocaleString('en-IN')}</span>`;

    const html = `
      <div class="${cardClass}" draggable="${isDraggable}" ondragstart="drag(event, '${log.id}')" data-id="${log.id}">
        <div class="d-flex justify-content-between align-items-start mb-1">
          <span class="fw-bold text-primary fs-8">${log.id}</span>
          <span class="fw-semibold text-dark fs-8">${log.assetId}</span>
        </div>
        <div class="fw-semibold text-dark-custom mb-1 fs-7" style="color: var(--text-color);">${log.assetName}</div>
        <div class="text-muted small fs-8 mb-2">${log.description || 'No description'}</div>
        <div class="d-flex justify-content-between align-items-center mt-2 pt-2 border-top border-secondary-subtle">
          ${costHtml}
          <div class="d-flex gap-1">
            ${actionButtons}
          </div>
        </div>
      </div>
    `;

    columns[status].innerHTML += html;
  });

  // Update headers badges
  document.getElementById('badge-pending').textContent = counts['Pending'];
  document.getElementById('badge-approved').textContent = counts['Approved'];
  document.getElementById('badge-assigned').textContent = counts['Technician assigned'];
  document.getElementById('badge-inprogress').textContent = counts['In progress'];
  document.getElementById('badge-resolved').textContent = counts['Resolved'];
}

// Drag and drop global hooks
window.allowDrop = function(ev) {
  ev.preventDefault();
};

window.drag = function(ev, id) {
  ev.dataTransfer.setData("text", id);
};

window.drop = async function(ev, newStatus) {
  ev.preventDefault();
  const id = ev.dataTransfer.getData("text");
  if (!id) return;
  await moveCardStatus(id, newStatus);
};

async function moveCardStatus(id, newStatus) {
  const role = window.RbacService.getCurrentUserRole();
  const canApproveMaint = window.RbacService.hasPermission(role, 'approve_maintenance');
  if (!canApproveMaint) {
    Swal.fire('Access Denied', 'You do not have permission to change maintenance task statuses.', 'error');
    return;
  }

  const log = currentLogs.find(l => String(l.id) === String(id));
  const currentCost = log ? (parseFloat(log.cost) || 0) : 0;
  let finalCost = currentCost;

  if (newStatus === 'Resolved' || newStatus === 'Completed') {
    const result = await Swal.fire({
      title: 'Complete Maintenance Task',
      html: `
        <p class="text-muted small mb-3">Verify or enter the final servicing/repair cost for task <strong>${id}</strong>:</p>
        <div class="text-start">
          <label class="form-label-custom fw-bold fs-7 mb-1">Final Maintenance Cost (₹ INR) <span class="text-danger">*</span></label>
          <input type="number" id="swal-maint-cost" class="form-control form-control-custom" value="${currentCost}" min="0" placeholder="e.g. 5000">
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#10B981',
      cancelButtonColor: '#64748B',
      confirmButtonText: '✔ Save Cost & Complete',
      cancelButtonText: 'Cancel',
      preConfirm: () => {
        const costInput = document.getElementById('swal-maint-cost');
        const val = costInput ? costInput.value : '';
        if (val === '' || Number(val) < 0) {
          Swal.showValidationMessage('Please enter a valid cost (0 or greater).');
          return false;
        }
        return val;
      }
    });

    if (!result.isConfirmed) return;
    finalCost = parseFloat(result.value) || 0;
  }

  window.AssetFlowLoader.show();
  try {
    const apiStatus = (newStatus === 'Resolved' || newStatus === 'Completed') ? 'Completed' : newStatus;
    
    // Update API state with cost
    await window.ApiService.maintenance.updateStatus(id, apiStatus, finalCost);

    // Sync Asset status
    if (log) {
      await updateAssetMaintenanceState(log.assetId, newStatus);
    }

    const Toast = Swal.mixin({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 2500,
      timerProgressBar: true
    });
    Toast.fire({
      icon: 'success',
      title: (newStatus === 'Resolved' || newStatus === 'Completed') ? `Task Resolved (Cost: ₹${finalCost.toLocaleString('en-IN')})` : `Task moved to ${newStatus}`
    });

    await loadMaintenanceData();
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  } finally {
    window.AssetFlowLoader.hide();
  }
}

async function updateAssetMaintenanceState(assetId, logStatus) {
  try {
    const assets = await window.ApiService.assets.list();
    const asset = assets.find(a => String(a.id) === String(assetId));
    if (asset) {
      const newStatus = (logStatus === 'Resolved' || logStatus === 'Completed' || logStatus === 'Rejected' || logStatus === 'Cancelled') ? 'Active' : 'Maintenance';
      await window.ApiService.assets.update(asset.id, { ...asset, status: newStatus });
    }
  } catch (err) {
    console.error("Failed to sync asset state:", err);
  }
}

async function setupEventListeners() {
  // View Toggle buttons
  const btnViewKanban = document.getElementById('btn-view-kanban');
  const btnViewTable = document.getElementById('btn-view-table');
  const kanbanViewEl = document.getElementById('maintenance-kanban-view');
  const tableViewEl = document.getElementById('maintenance-table-view');

  if (btnViewKanban && btnViewTable) {
    btnViewKanban.addEventListener('click', () => {
      btnViewKanban.classList.add('active');
      btnViewTable.classList.remove('active');
      kanbanViewEl.classList.remove('d-none');
      tableViewEl.classList.add('d-none');
    });

    btnViewTable.addEventListener('click', () => {
      btnViewTable.classList.add('active');
      btnViewKanban.classList.remove('active');
      tableViewEl.classList.remove('d-none');
      kanbanViewEl.classList.add('d-none');
    });
  }

  // Direct Edit/Add Cost Button on Kanban Cards & Table rows
  $(document).on('click', '.btn-edit-cost', function(e) {
    e.preventDefault();
    e.stopPropagation();
    const id = $(this).attr('data-id');
    const log = currentLogs.find(l => String(l.id) === String(id));
    const currentCost = log ? (parseFloat(log.cost) || 0) : 0;

    Swal.fire({
      title: 'Update Maintenance Cost',
      html: `
        <p class="text-muted small mb-3">Set or update the repair/maintenance cost for task <strong>${id}</strong> (${escapeHtml(log?.assetName || '')}):</p>
        <div class="text-start">
          <label class="form-label-custom fw-bold fs-7 mb-1">Maintenance Cost (₹ INR) <span class="text-danger">*</span></label>
          <input type="number" id="swal-direct-cost-input" class="form-control form-control-custom" value="${currentCost}" min="0" placeholder="e.g. 5000">
        </div>
      `,
      icon: 'info',
      showCancelButton: true,
      confirmButtonColor: '#10B981',
      cancelButtonColor: '#64748B',
      confirmButtonText: '✔ Save Cost',
      cancelButtonText: 'Cancel',
      preConfirm: () => {
        const val = document.getElementById('swal-direct-cost-input').value;
        if (val === '' || Number(val) < 0) {
          Swal.showValidationMessage('Please enter a valid cost (0 or greater).');
          return false;
        }
        return val;
      }
    }).then(async (result) => {
      if (result.isConfirmed) {
        const newCost = parseFloat(result.value) || 0;
        window.AssetFlowLoader.show();
        try {
          await window.ApiService.maintenance.updateStatus(id, log.status, newCost);
          
          Swal.fire({
            title: 'Cost Updated!',
            text: `Maintenance cost set to ₹${newCost.toLocaleString('en-IN')}.`,
            icon: 'success',
            confirmButtonColor: '#2563EB'
          });

          await loadMaintenanceData();
        } catch (err) {
          Swal.fire('Error', err.message, 'error');
        } finally {
          window.AssetFlowLoader.hide();
        }
      }
    });
  });

  // Manual Move Buttons on Kanban Cards
  $(document).on('click', '.btn-move', async function() {
    const id = $(this).attr('data-id');
    const toStatus = $(this).attr('data-to');
    await moveCardStatus(id, toStatus);
  });

  // Modal open
  const openModalBtn = document.getElementById('btn-open-maintenance-modal');
  if (openModalBtn) {
    openModalBtn.addEventListener('click', async () => {
      window.AssetFlowLoader.show();
      try {
        let assets = await window.ApiService.assets.list();
        const role = window.RbacService.getCurrentUserRole();
        if (role === 'Employee') {
          const user = window.RbacService.getCurrentUser() || {};
          const userEmail = (user.email || '').toLowerCase().trim();
          const userDept = (user.department || '').toLowerCase().trim();

          let userNamesSet = new Set();
          if (user.fullName) userNamesSet.add(user.fullName.toLowerCase().trim());
          if (user.name) userNamesSet.add(user.name.toLowerCase().trim());
          if (user.email) userNamesSet.add(user.email.toLowerCase().trim());

          const userNamesList = Array.from(userNamesSet).filter(Boolean);

          let approvedAllocAssetIds = new Set();
          try {
            const allocList = window.ApiService.allocations ? await window.ApiService.allocations.list() : [];
            (allocList || []).forEach(al => {
              if (al.assetId) {
                const statusLower = (al.status || '').toLowerCase();
                if (statusLower === 'approved' || statusLower.includes('approve')) {
                  const target = (al.allocatedTo || '').toLowerCase().trim();
                  const reqEmail = (al.requestedByEmail || '').toLowerCase().trim();

                  const matchTarget = userNamesSet.has(target) || userNamesList.some(name => target.includes(name) || name.includes(target));
                  const matchEmail = userEmail && (reqEmail === userEmail || target.includes(userEmail));
                  if (matchTarget || matchEmail) {
                    approvedAllocAssetIds.add(String(al.assetId));
                  }
                }
              }
            });
          } catch (e) {}

          assets = assets.filter(a => {
            if (approvedAllocAssetIds.has(String(a.id))) return true;
            if (a.owner) {
              const ownerLower = a.owner.toLowerCase().trim();
              if (userNamesSet.has(ownerLower)) return true;
              if (userNamesList.some(name => ownerLower.includes(name) || name.includes(ownerLower))) return true;
              if (userDept && (ownerLower === userDept || ownerLower.includes(userDept) || userDept.includes(ownerLower))) return true;
            }
            if (a.department) {
              const aDept = a.department.toLowerCase().trim();
              if (userDept && (aDept.includes(userDept) || userDept.includes(aDept))) return true;
            }
            return false;
          });
        }

        const select = document.getElementById('maint-asset-id');
        if (select) {
          let optionsHtml = role === 'Employee' ? '<option value="">Select your asset...</option>' : '<option value="">Select asset to schedule...</option>';
          assets.forEach(asset => {
            optionsHtml += `<option value="${asset.id}" data-name="${asset.name}">${asset.id} - ${asset.name} (${asset.status})</option>`;
          });
          select.innerHTML = optionsHtml;
        }

        // Set default date to today
        const dateInput = document.getElementById('maint-date');
        if (dateInput) {
          dateInput.value = new Date().toISOString().split('T')[0];
        }

        // Reset form
        document.getElementById('maintenance-form').reset();
        
        // Clear errors
        document.querySelectorAll('.invalid-feedback').forEach(el => el.textContent = '');
        document.querySelectorAll('.form-control, .form-select').forEach(el => el.classList.remove('is-invalid'));

        // Customize labels and cost container visibility
        const titleEl = document.getElementById('maintenanceModalLabel');
        if (titleEl) {
          titleEl.textContent = role === 'Employee' ? 'Report Asset Issue' : 'Schedule Maintenance';
        }
        const submitBtnText = document.querySelector('#btn-save-maintenance span');
        if (submitBtnText) {
          submitBtnText.textContent = role === 'Employee' ? 'Submit Report' : 'Schedule Task';
        }
        const costContainer = document.getElementById('maint-cost')?.closest('.mb-3');
        if (costContainer) {
          if (role === 'Employee') {
            costContainer.classList.add('d-none');
            document.getElementById('maint-cost').value = '0';
          } else {
            costContainer.classList.remove('d-none');
            document.getElementById('maint-cost').value = '';
          }
        }

        maintModal.show();
      } catch (err) {
        Swal.fire('Error', err.message, 'error');
      } finally {
        window.AssetFlowLoader.hide();
      }
    });
  }

  // Resolve (Mark Completed) Action from Table View & Kanban Board
  $('#maintenance-table, #kanban-board').on('click', '.btn-resolve', function() {
    const role = window.RbacService.getCurrentUserRole();
    const canApproveMaint = window.RbacService.hasPermission(role, 'approve_maintenance');
    if (!canApproveMaint) {
      Swal.fire('Access Denied', 'You do not have permission to resolve maintenance tasks.', 'error');
      return;
    }
    const elem = $(this).closest('[data-id]');
    const id = elem.attr('data-id');
    const log = currentLogs.find(l => String(l.id) === String(id));
    const currentCost = log ? (parseFloat(log.cost) || 0) : 0;

    Swal.fire({
      title: 'Complete Maintenance Task',
      html: `
        <p class="text-muted small mb-3">Verify or enter the final servicing/repair cost for task <strong>${id}</strong>:</p>
        <div class="text-start">
          <label class="form-label-custom fw-bold fs-7 mb-1">Final Maintenance Cost (₹ INR) <span class="text-danger">*</span></label>
          <input type="number" id="swal-maint-cost" class="form-control form-control-custom" value="${currentCost}" min="0" placeholder="e.g. 5000">
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#10B981',
      cancelButtonColor: '#64748B',
      confirmButtonText: '✔ Save Cost & Complete',
      cancelButtonText: 'Cancel',
      preConfirm: () => {
        const costInput = document.getElementById('swal-maint-cost');
        const val = costInput ? costInput.value : '';
        if (val === '' || Number(val) < 0) {
          Swal.showValidationMessage('Please enter a valid cost (0 or greater).');
          return false;
        }
        return val;
      }
    }).then(async (result) => {
      if (result.isConfirmed) {
        const finalCost = parseFloat(result.value) || 0;
        window.AssetFlowLoader.show();
        try {
          await window.ApiService.maintenance.updateStatus(id, 'Completed', finalCost);
          
          // Sync asset state
          if (log) {
            await updateAssetMaintenanceState(log.assetId, 'Resolved');
          }

          Swal.fire({
            title: 'Task Resolved!',
            text: `Maintenance work completed with cost ₹${finalCost.toLocaleString('en-IN')}.`,
            icon: 'success',
            confirmButtonColor: '#2563EB'
          });
          
          await loadMaintenanceData();
        } catch (err) {
          Swal.fire('Error', err.message, 'error');
        } finally {
          window.AssetFlowLoader.hide();
        }
      }
    });
  });

  // Modal Submit
  const form = document.getElementById('maintenance-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Clear errors
      document.querySelectorAll('.invalid-feedback').forEach(el => el.textContent = '');
      document.querySelectorAll('.form-control, .form-select').forEach(el => el.classList.remove('is-invalid'));

      const assetSelect = document.getElementById('maint-asset-id');
      const assetId = assetSelect.value;
      const assetName = assetSelect.options[assetSelect.selectedIndex]?.getAttribute('data-name') || '';
      const type = document.getElementById('maint-type').value;
      const cost = document.getElementById('maint-cost').value;
      const date = document.getElementById('maint-date').value;
      const description = document.getElementById('maint-desc').value.trim();

      let isValid = true;

      if (!assetId) {
        showError('maint-asset-id', 'Please select an asset.');
        isValid = false;
      }
      if (!type) {
        showError('maint-type', 'Please select maintenance type.');
        isValid = false;
      }
      const role = window.RbacService.getCurrentUserRole();
      if (role !== 'Employee') {
        if (!cost || Number(cost) < 0) {
          showError('maint-cost', 'Please enter estimated cost.');
          isValid = false;
        }
      }
      if (!date) {
        showError('maint-date', 'Please select date.');
        isValid = false;
      }

      if (!isValid) return;

      const spinner = document.getElementById('maint-spinner');
      const submitBtn = document.getElementById('btn-save-maintenance');
      if (spinner) spinner.classList.remove('d-none');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const payload = {
          assetId,
          assetName,
          type,
          cost,
          date,
          description
        };

        await window.ApiService.maintenance.create(payload);

        // Also change asset state to Maintenance
        await updateAssetMaintenanceState(assetId, 'Pending');

        Swal.fire({
          title: role === 'Employee' ? 'Report Submitted!' : 'Scheduled!',
          text: role === 'Employee' ? 'Asset issue reported successfully and is pending review.' : 'New maintenance task scheduled successfully.',
          icon: 'success',
          confirmButtonColor: '#2563EB'
        });

        maintModal.hide();
        await loadMaintenanceData();
      } catch (err) {
        Swal.fire('Error', err.message, 'error');
      } finally {
        if (spinner) spinner.classList.add('d-none');
        if (submitBtn) submitBtn.disabled = false;
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

