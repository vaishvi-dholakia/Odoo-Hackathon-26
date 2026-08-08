/**
 * AssetFlow Asset Management JS
 * Manages inventory table loading, search/filters, modal operations, image pre-viewers, and CRUD actions.
 */

let assetsTable = null;
let assetModal = null;
let requestModal = null;

document.addEventListener('DOMContentLoaded', async () => {
  window.AssetFlowLoader.show();
  try {
    assetModal = new bootstrap.Modal(document.getElementById('assetModal'));
    const reqModalEl = document.getElementById('requestModal');
    if (reqModalEl) {
      requestModal = new bootstrap.Modal(reqModalEl);
    }
    setupScopeDropdownForRole();
    await loadAssets();
    setupEventListeners();
  } catch (err) {
    console.error(err);
  } finally {
    window.AssetFlowLoader.hide();
  }
});

function setupScopeDropdownForRole() {
  const scopeSelect = document.getElementById('filter-scope');
  const scopeContainer = document.getElementById('scope-filter-container') || (scopeSelect ? scopeSelect.parentElement : null);
  if (!scopeSelect) return;

  const role = window.RbacService.getCurrentUserRole();
  if (role === 'Employee') {
    if (scopeContainer) scopeContainer.style.display = 'block';
    scopeSelect.innerHTML = `
      <option value="my" selected>💻 My Assets</option>
      <option value="department">🏢 Department Assets</option>
    `;
  } else if (role === 'Department Head' || role === 'DepartmentHead') {
    if (scopeContainer) scopeContainer.style.display = 'block';
    scopeSelect.innerHTML = `
      <option value="department" selected>🏢 Department Assets</option>
      <option value="my">💻 My Assets</option>
      <option value="all">🌐 All Company Assets</option>
    `;
  } else {
    // Admin & Asset Manager have all assets access; hide redundant 1-item dropdown
    if (scopeContainer) scopeContainer.style.display = 'none';
    scopeSelect.innerHTML = `
      <option value="all" selected>🌐 All Company Assets</option>
    `;
  }
}

let rawAssetsList = [];

async function loadAssets() {
  try {
    rawAssetsList = await window.ApiService.assets.list();
    await applyScopeAndTableFilters();
  } catch (err) {
    console.error("Failed to load assets list:", err);
  }
}

async function applyScopeAndTableFilters() {
  const userRole = window.RbacService.getCurrentUserRole();
  const defaultScope = userRole === 'Employee' ? 'my' : 'department';
  const scopeSelect = document.getElementById('filter-scope');
  const scopeVal = scopeSelect ? scopeSelect.value : defaultScope;
  
  const user = window.RbacService.getCurrentUser() || {};
  const userEmail = (user.email || '').toLowerCase().trim();
  const userDept = (user.department || 'Management').toLowerCase().trim();

  let userNamesSet = new Set();
  if (user.fullName) userNamesSet.add(user.fullName.toLowerCase().trim());
  if (user.name) userNamesSet.add(user.name.toLowerCase().trim());
  if (user.email) userNamesSet.add(user.email.toLowerCase().trim());

  // Also resolve full details from Users API if available
  try {
    const usersList = window.ApiService.users ? await window.ApiService.users.list() : [];
    if (Array.isArray(usersList)) {
      const myUserRecord = usersList.find(u => u.email && u.email.toLowerCase().trim() === userEmail);
      if (myUserRecord) {
        if (myUserRecord.fullName) userNamesSet.add(myUserRecord.fullName.toLowerCase().trim());
        if (myUserRecord.name) userNamesSet.add(myUserRecord.name.toLowerCase().trim());
        if (myUserRecord.email) userNamesSet.add(myUserRecord.email.toLowerCase().trim());
      }
    }
  } catch (e) {
    console.warn("Could not fetch user profile for scope filter:", e);
  }

  const userNamesList = Array.from(userNamesSet).filter(Boolean);
  let filtered = [...rawAssetsList];

  if (scopeVal === 'my') {
    let approvedAllocAssetIds = new Set();

    try {
      const allocList = window.ApiService.allocations ? await window.ApiService.allocations.list() : [];
      (allocList || []).forEach(al => {
        if (al.assetId) {
          const statusLower = (al.status || '').toLowerCase();
          if (statusLower === 'approved' || statusLower.includes('approve')) {
            const target = (al.allocatedTo || '').toLowerCase().trim();
            const reqEmail = (al.requestedByEmail || '').toLowerCase().trim();
            const reqBy = (al.requestedBy || '').toLowerCase().trim();

            const matchTarget = userNamesSet.has(target) || userNamesList.some(name => target.includes(name) || name.includes(target));
            const matchEmail = userEmail && (reqEmail === userEmail || target.includes(userEmail));
            const matchReq = userNamesSet.has(reqBy) || userNamesList.some(name => reqBy.includes(name) || name.includes(reqBy));

            if (matchTarget || matchEmail || matchReq) {
              approvedAllocAssetIds.add(String(al.assetId));
            }
          }
        }
      });
    } catch (e) {
      console.warn("Error fetching allocations in assets filter:", e);
    }

    filtered = filtered.filter(a => {
      // 1. Matched via allocation record
      if (approvedAllocAssetIds.has(String(a.id))) return true;
      // 2. Matched via asset owner property
      if (a.owner) {
        const ownerLower = a.owner.toLowerCase().trim();
        if (userNamesSet.has(ownerLower)) return true;
        if (userNamesList.some(name => ownerLower.includes(name) || name.includes(ownerLower))) return true;
        if (userDept && (ownerLower === userDept || ownerLower.includes(userDept) || userDept.includes(ownerLower))) return true;
      }
      return false;
    });
  } else if (scopeVal === 'department') {
    let deptMemberNames = new Set(userNamesList);
    if (userDept) deptMemberNames.add(userDept);

    try {
      const usersList = window.ApiService.users ? await window.ApiService.users.list() : [];
      if (Array.isArray(usersList)) {
        usersList.forEach(u => {
          const uDept = (u.department || '').toLowerCase().trim();
          if (uDept && (uDept.includes(userDept) || userDept.includes(uDept))) {
            if (u.fullName) deptMemberNames.add(u.fullName.toLowerCase().trim());
            if (u.name) deptMemberNames.add(u.name.toLowerCase().trim());
            if (u.email) deptMemberNames.add(u.email.toLowerCase().trim());
          }
        });
      }
    } catch (e) {
      console.warn("Could not fetch users for department scope filter:", e);
    }

    let deptAllocAssetIds = new Set();
    try {
      const allocList = window.ApiService.allocations ? await window.ApiService.allocations.list() : [];
      (allocList || []).forEach(al => {
        if (al.assetId) {
          const statusLower = (al.status || '').toLowerCase();
          if (statusLower === 'approved' || statusLower.includes('approve')) {
            const alDept = (al.department || '').toLowerCase().trim();
            const alTarget = (al.allocatedTo || '').toLowerCase().trim();
            const matchDept = (alDept && (alDept.includes(userDept) || userDept.includes(alDept)));
            const matchTarget = (alTarget && (alTarget.includes(userDept) || userDept.includes(alTarget) || deptMemberNames.has(alTarget)));
            if (matchDept || matchTarget) {
              deptAllocAssetIds.add(String(al.assetId));
            }
          }
        }
      });
    } catch (e) {
      console.warn("Could not fetch allocations for department scope filter:", e);
    }

    filtered = filtered.filter(a => {
      const aDept = (a.department || '').toLowerCase().trim();
      // 1. Direct department match on asset record
      if (aDept && (aDept.includes(userDept) || userDept.includes(aDept))) return true;
      // 2. Approved allocation to department or department member
      if (deptAllocAssetIds.has(String(a.id))) return true;
      // 3. Asset owner is in department or matches department name
      if (a.owner) {
        const ownerLower = a.owner.toLowerCase().trim();
        if (deptMemberNames.has(ownerLower)) return true;
        if (userDept && (ownerLower.includes(userDept) || userDept.includes(ownerLower))) return true;
      }
      // 4. Location matches department
      const loc = (a.location || '').toLowerCase().trim();
      if (loc && userDept && (loc.includes(userDept) || userDept.includes(loc))) return true;
      
      return false;
    });
  }

  renderAssetsTable(filtered);
}

function renderAssetsTable(assets) {
  const tbody = document.querySelector('#assets-table tbody');
  if (!tbody) return;

  // Destroy previous DataTable instance if it exists
  if ($.fn.DataTable.isDataTable('#assets-table')) {
    $('#assets-table').DataTable().destroy();
  }

  let html = '';
  assets.forEach(asset => {
    let statusClass = 'bg-success';
    if (asset.status === 'Maintenance') statusClass = 'bg-warning text-dark';
    if (asset.status === 'Disposed') statusClass = 'bg-danger';

    const role = window.RbacService.getCurrentUserRole();
    const canManage = window.RbacService.hasPermission(role, 'register_asset');
    const user = window.RbacService.getCurrentUser() || {};
    const userName = (user.fullName || user.name || '').toLowerCase();
    const userDept = (user.department || 'Management').toLowerCase();
    
    let actionsHtml = '--';
    if (canManage) {
      actionsHtml = `
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-secondary-custom btn-edit" title="Edit Asset">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button class="btn btn-sm btn-secondary-custom text-danger btn-delete" title="Delete Asset">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      `;
    } else if (!asset.owner && asset.status === 'Active') {
      actionsHtml = `
        <button class="btn btn-sm btn-primary-custom text-white btn-request-asset" data-id="${asset.id}" data-name="${asset.name}" title="Request Asset">
          <i class="fa-solid fa-paper-plane me-1"></i>Request
        </button>
      `;
    } else if (asset.owner) {
      // Allocated asset -> Dept Head or Owner can Return asset
      actionsHtml = `
        <button class="btn btn-sm btn-outline-danger btn-return-asset" data-id="${asset.id}" data-name="${asset.name}" title="Return Asset to Stock">
          <i class="fa-solid fa-arrow-rotate-left me-1"></i>Return
        </button>
      `;
    }

    html += `
      <tr data-id="${asset.id}">
        <td><strong class="text-primary">${asset.id}</strong></td>
        <td>
          <div class="fw-semibold text-dark-custom" style="color: var(--text-color);">${asset.name}</div>
        </td>
        <td>${asset.type}</td>
        <td><code class="text-muted">${asset.serial}</code></td>
        <td><span class="badge ${statusClass} rounded-pill px-2.5 py-1">${asset.status}</span></td>
        <td class="fw-medium">₹${Number(asset.value).toLocaleString()}</td>
        <td>${asset.location || '--'}</td>
        <td>${actionsHtml}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  // Re-initialize DataTable
  assetsTable = $('#assets-table').DataTable({
    pageLength: 10,
    lengthChange: false,
    info: true,
    language: {
      search: "",
      searchPlaceholder: "Search records..."
    },
    dom: 'rtip' // Hide default search bar, we use our custom one
  });

  // Bind custom filter behaviors
  bindTableFilters();
}

function bindTableFilters() {
  const scopeFilter = document.getElementById('filter-scope');
  const searchInput = document.getElementById('asset-search');
  const typeFilter = document.getElementById('filter-type');
  const statusFilter = document.getElementById('filter-status');

  if (scopeFilter) {
    scopeFilter.removeEventListener('change', applyScopeAndTableFilters);
    scopeFilter.addEventListener('change', applyScopeAndTableFilters);
  }

  if (searchInput) {
    searchInput.addEventListener('keyup', () => {
      assetsTable.search(searchInput.value).draw();
    });
  }

  if (typeFilter) {
    typeFilter.addEventListener('change', () => {
      assetsTable.column(2).search(typeFilter.value).draw();
    });
  }

  if (statusFilter) {
    statusFilter.addEventListener('change', () => {
      assetsTable.column(4).search(statusFilter.value).draw();
    });
  }

  const resetBtn = document.getElementById('btn-clear-filters');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      if (scopeFilter) scopeFilter.value = 'department';
      if (searchInput) searchInput.value = '';
      if (typeFilter) typeFilter.value = '';
      if (statusFilter) statusFilter.value = '';
      await applyScopeAndTableFilters();
      if (assetsTable) assetsTable.search('').columns().search('').draw();
    });
  }
}

function setupEventListeners() {
  // Handle "Return Asset" button in inventory table
  $(document).on('click', '.btn-return-asset', async function() {
    const assetId = $(this).attr('data-id');
    const assetName = $(this).attr('data-name');

    Swal.fire({
      title: `Return ${assetName}?`,
      text: `Are you sure you want to return ${assetName} (${assetId}) back to company stock?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#EF4444',
      cancelButtonColor: '#64748B',
      confirmButtonText: 'Yes, Return Asset',
      cancelButtonText: 'Cancel'
    }).then(async (result) => {
      if (result.isConfirmed) {
        window.AssetFlowLoader.show();
        try {
          await window.ApiService.assets.returnAsset(assetId);
          Swal.fire({
            title: 'Asset Returned!',
            text: `${assetName} has been returned to stock successfully.`,
            icon: 'success',
            confirmButtonColor: '#2563EB'
          });
          await loadAssets();
        } catch (err) {
          Swal.fire('Error', err.message || 'Failed to return asset', 'error');
        } finally {
          window.AssetFlowLoader.hide();
        }
      }
    });
  });

  // Add Asset modal open
  const addBtn = document.getElementById('btn-open-add-modal');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      document.getElementById('assetModalLabel').textContent = 'Add Asset';
      document.getElementById('asset-form').reset();
      document.getElementById('asset-edit-id').value = '';
      const previewImg = document.getElementById('asset-img-preview');
      previewImg.src = '';
      previewImg.style.display = 'none';
      window.selectedAssetPhotoUrl = '';
      
      // Clear errors
      document.querySelectorAll('.invalid-feedback').forEach(el => el.textContent = '');
      document.querySelectorAll('.form-control, .form-select').forEach(el => el.classList.remove('is-invalid'));

      assetModal.show();
    });
  }

  // File/Image upload preview
  const uploadInput = document.getElementById('asset-photo-upload');
  const previewImg = document.getElementById('asset-img-preview');
  if (uploadInput && previewImg) {
    uploadInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          previewImg.src = event.target.result;
          previewImg.style.display = 'block';
          window.selectedAssetPhotoUrl = event.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Edit action
  $('#assets-table').on('click', '.btn-edit', async function() {
    const tr = $(this).closest('tr');
    const id = tr.attr('data-id');
    
    window.AssetFlowLoader.show();
    try {
      const assets = await window.ApiService.assets.list();
      const asset = assets.find(a => a.id === id);
      if (asset) {
        document.getElementById('assetModalLabel').textContent = 'Edit Asset';
        document.getElementById('asset-edit-id').value = asset.id;
        document.getElementById('asset-name').value = asset.name;
        document.getElementById('asset-type').value = asset.type;
        document.getElementById('asset-serial').value = asset.serial;
        document.getElementById('asset-value').value = asset.value;
        document.getElementById('asset-status').value = asset.status;
        document.getElementById('asset-location').value = asset.location || '';
        
        const previewImg = document.getElementById('asset-img-preview');
        if (asset.photo) {
          previewImg.src = asset.photo;
          previewImg.style.display = 'block';
        } else {
          previewImg.src = '';
          previewImg.style.display = 'none';
        }

        // Clear errors
        document.querySelectorAll('.invalid-feedback').forEach(el => el.textContent = '');
        document.querySelectorAll('.form-control, .form-select').forEach(el => el.classList.remove('is-invalid'));

        assetModal.show();
      }
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    } finally {
      window.AssetFlowLoader.hide();
    }
  });

  // Delete Action
  $('#assets-table').on('click', '.btn-delete', function() {
    const role = window.RbacService.getCurrentUserRole();
    if (role === 'Employee') {
      Swal.fire('Access Denied', 'Employees are not allowed to delete assets.', 'error');
      return;
    }
    const tr = $(this).closest('tr');
    const id = tr.attr('data-id');

    Swal.fire({
      title: 'Delete Asset?',
      text: `Are you sure you want to permanently delete asset ${id}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#EF4444',
      cancelButtonColor: '#64748B',
      confirmButtonText: 'Yes, delete',
      cancelButtonText: 'Cancel'
    }).then(async (result) => {
      if (result.isConfirmed) {
        window.AssetFlowLoader.show();
        try {
          await window.ApiService.assets.delete(id);
          
          Swal.fire({
            title: 'Deleted',
            text: 'Asset deleted successfully.',
            icon: 'success',
            confirmButtonColor: '#2563EB'
          });
          
          await loadAssets();
        } catch (err) {
          Swal.fire('Error', err.message, 'error');
        } finally {
          window.AssetFlowLoader.hide();
        }
      }
    });
  });

  // Form submit (Add or Edit)
  const form = document.getElementById('asset-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      // Validation
      document.querySelectorAll('.invalid-feedback').forEach(el => el.textContent = '');
      document.querySelectorAll('.form-control, .form-select').forEach(el => el.classList.remove('is-invalid'));

      const id = document.getElementById('asset-edit-id').value;
      const name = document.getElementById('asset-name').value.trim();
      const type = document.getElementById('asset-type').value;
      const serial = document.getElementById('asset-serial').value.trim();
      const value = document.getElementById('asset-value').value;
      const status = document.getElementById('asset-status').value;
      const location = document.getElementById('asset-location').value.trim();

      let isValid = true;

      if (!name) {
        showError('asset-name', 'Asset name is required.');
        isValid = false;
      }
      if (!type) {
        showError('asset-type', 'Asset type is required.');
        isValid = false;
      }
      if (!serial) {
        showError('asset-serial', 'Serial number is required.');
        isValid = false;
      }
      if (!value || Number(value) < 0) {
        showError('asset-value', 'Please enter a valid asset cost.');
        isValid = false;
      }

      if (!isValid) return;

      const spinner = document.getElementById('asset-spinner');
      const submitBtn = document.getElementById('btn-save-asset');
      if (spinner) spinner.classList.remove('d-none');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const payload = {
          name,
          type,
          serial,
          value,
          status,
          location,
          photo: window.selectedAssetPhotoUrl || document.getElementById('asset-img-preview').getAttribute('src') || ''
        };

        if (id) {
          // Update
          await window.ApiService.assets.update(id, payload);
          Swal.fire({
            title: 'Asset Updated',
            text: 'Asset modifications saved successfully.',
            icon: 'success',
            confirmButtonColor: '#2563EB'
          });
        } else {
          // Create
          await window.ApiService.assets.create(payload);
          Swal.fire({
            title: 'Asset Added',
            text: 'New asset added to inventory.',
            icon: 'success',
            confirmButtonColor: '#2563EB'
          });
        }

        assetModal.hide();
        await loadAssets();
      } catch (err) {
        Swal.fire('Error', err.message, 'error');
      } finally {
        if (spinner) spinner.classList.add('d-none');
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // Request Modal open
  const requestBtn = document.getElementById('btn-open-request-modal');
  if (requestBtn) {
    requestBtn.addEventListener('click', () => {
      document.getElementById('request-asset-form').reset();
      
      // Clear errors
      document.querySelectorAll('.invalid-feedback').forEach(el => el.textContent = '');
      document.querySelectorAll('.form-control, .form-select').forEach(el => el.classList.remove('is-invalid'));

      // Set default needed date to tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      document.getElementById('request-needed-date').value = tomorrow.toISOString().split('T')[0];

      requestModal.show();
    });
  }

  // Handle direct "Request Asset" button in inventory table
  $(document).on('click', '.btn-request-asset', async function() {
    const assetId = $(this).attr('data-id');
    const assetName = $(this).attr('data-name');
    const user = window.RbacService.getCurrentUser() || {};
    const role = window.RbacService.getCurrentUserRole();
    
    const targetInfo = (role === 'Employee') 
      ? `Your request will be sent to your Department Head (${user.department || 'Management'}).` 
      : `Your requisition will be sent to the Asset Manager.`;

    const { value: notes, isConfirmed } = await Swal.fire({
      title: `Request ${assetName}`,
      html: `<p class="text-muted small mb-2">${targetInfo}</p>`,
      input: 'textarea',
      inputLabel: 'Reason / Usage Details',
      inputPlaceholder: 'Enter reason for requesting this asset...',
      showCancelButton: true,
      confirmButtonText: 'Submit Request',
      confirmButtonColor: '#2563EB'
    });

    if (isConfirmed) {
      window.AssetFlowLoader.show();
      try {
        await window.ApiService.allocations.create({
          assetId,
          assetName,
          allocatedTo: user.fullName || user.name || user.email,
          notes
        });
        Swal.fire({
          title: 'Request Submitted!',
          text: 'Your request has been submitted for approval.',
          icon: 'success',
          confirmButtonColor: '#2563EB'
        });
      } catch (err) {
        Swal.fire('Error', err.message, 'error');
      } finally {
        window.AssetFlowLoader.hide();
      }
    }
  });

  // Request Asset submit
  const requestForm = document.getElementById('request-asset-form');
  if (requestForm) {
    requestForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      // Clear errors
      document.querySelectorAll('.invalid-feedback').forEach(el => el.textContent = '');
      document.querySelectorAll('.form-control, .form-select').forEach(el => el.classList.remove('is-invalid'));

      const type = document.getElementById('request-asset-type').value;
      const date = document.getElementById('request-needed-date').value;
      const reason = document.getElementById('request-reason').value.trim();

      let isValid = true;

      if (!type) {
        showError('request-asset-type', 'Please select asset category.');
        isValid = false;
      }
      if (!date) {
        showError('request-needed-date', 'Please select needed date.');
        isValid = false;
      }
      if (!reason) {
        showError('request-reason', 'Reason is required.');
        isValid = false;
      }

      if (!isValid) return;

      const spinner = document.getElementById('request-spinner');
      const submitBtn = document.getElementById('btn-submit-request');
      if (spinner) spinner.classList.remove('d-none');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const user = window.RbacService.getCurrentUser();
        const payload = {
          assetId: null, // Indicates a generic request
          assetName: type,
          allocatedTo: user.fullName || user.name,
          date
        };

        await window.ApiService.allocations.create(payload);

        Swal.fire({
          title: 'Request Submitted',
          text: `Asset request for "${type}" has been submitted for review.`,
          icon: 'success',
          confirmButtonColor: '#2563EB'
        });

        requestModal.hide();
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
