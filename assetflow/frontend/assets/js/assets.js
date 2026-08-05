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
    await loadAssets();
    setupEventListeners();
  } catch (err) {
    console.error(err);
  } finally {
    window.AssetFlowLoader.hide();
  }
});

async function loadAssets() {
  try {
    let assets = await window.ApiService.assets.list();
    const role = window.RbacService.getCurrentUserRole();
    if (role === 'Employee') {
      const user = window.RbacService.getCurrentUser();
      const userName = (user ? (user.fullName || user.name) : '').toLowerCase();
      assets = assets.filter(a => a.owner && a.owner.toLowerCase() === userName);
    }
    renderAssetsTable(assets);
  } catch (err) {
    console.error(err);
  }
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
        <td>${asset.owner || '<span class="text-muted small">Unassigned</span>'}</td>
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
  const searchInput = document.getElementById('asset-search');
  const typeFilter = document.getElementById('filter-type');
  const statusFilter = document.getElementById('filter-status');

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
    resetBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (typeFilter) typeFilter.value = '';
      if (statusFilter) statusFilter.value = '';
      assetsTable.search('').columns().search('').draw();
    });
  }
}

function setupEventListeners() {
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
        document.getElementById('asset-owner').value = asset.owner || '';
        
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
      const owner = document.getElementById('asset-owner').value.trim();

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
          owner,
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
