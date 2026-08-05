/**
 * AssetFlow Organization Setup JS
 * Handles organization data prefilling, logo upload previews, and validation.
 */

document.addEventListener('DOMContentLoaded', async () => {
  window.AssetFlowLoader.show();
  try {
    await loadOrgDetails();
    setupLogoPreview();
    setupOrgFormSubmit();

    // Show Department & Department Head Assignment panels for Admins
    const currentUser = window.RbacService.getCurrentUser() || {};
    if (currentUser.role === 'Admin') {
      const deptCard = document.getElementById('dept-admin-section');
      if (deptCard) deptCard.style.display = 'block';
      await loadDepartmentsList();

      const card = document.getElementById('dept-heads-assignment-card');
      if (card) card.style.display = 'block';
      await loadDeptHeads();
      await loadTransitionHistory();
      await loadSystemUsers();

      setupDeptFormSubmit();
      setupAddHeadUserFormSubmit();
      populateHeadDepartmentDropdown();
    }
  } catch (err) {
    console.error(err);
  } finally {
    window.AssetFlowLoader.hide();
  }
});

async function loadOrgDetails() {
  try {
    const org = await window.ApiService.organization.get();
    if (org) {
      document.getElementById('org-name').value = org.name || '';
      document.getElementById('org-code').value = org.code || '';
      document.getElementById('org-industry').value = org.industry || '';
      document.getElementById('org-website').value = org.website || '';
      document.getElementById('org-phone').value = org.phone || '';
      document.getElementById('org-address').value = org.address || '';
      
      if (org.logo) {
        document.getElementById('logo-img-preview').src = org.logo;
      }
    }
  } catch (err) {
    console.error("Failed to load organization profile", err);
  }
}

function setupLogoPreview() {
  const uploadInput = document.getElementById('org-logo-upload');
  const previewImg = document.getElementById('logo-img-preview');
  
  if (uploadInput && previewImg) {
    uploadInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        // Size validation: limit to 1MB
        if (file.size > 1024 * 1024) {
          Swal.fire({
            title: 'File Too Large',
            text: 'Logo image must be smaller than 1MB.',
            icon: 'warning',
            confirmButtonColor: '#2563EB'
          });
          uploadInput.value = '';
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          previewImg.src = event.target.result;
          // Store logo temporarily in user memory or window object
          window.selectedLogoDataUrl = event.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }
}

function setupOrgFormSubmit() {
  const form = document.getElementById('org-setup-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Clear validation
    document.querySelectorAll('.invalid-feedback').forEach(el => el.textContent = '');
    document.querySelectorAll('.form-control').forEach(el => el.classList.remove('is-invalid'));

    const name = document.getElementById('org-name').value.trim();
    const code = document.getElementById('org-code').value.trim();
    const industry = document.getElementById('org-industry').value;
    const website = document.getElementById('org-website').value.trim();
    const phone = document.getElementById('org-phone').value.trim();
    const address = document.getElementById('org-address').value.trim();

    let isValid = true;

    if (!name) {
      showFieldError('org-name', 'Organization name is required.');
      isValid = false;
    }

    if (!code) {
      showFieldError('org-code', 'Organization code is required.');
      isValid = false;
    }

    if (website) {
      try {
        new URL(website);
      } catch (_) {
        showFieldError('org-website', 'Please enter a valid website URL (including https://).');
        isValid = false;
      }
    }

    if (!isValid) return;

    // Show loading
    const spinner = document.getElementById('org-spinner');
    const submitBtn = document.getElementById('btn-save-org');
    if (spinner) spinner.classList.remove('d-none');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const payload = {
        name,
        code,
        industry,
        website,
        phone,
        address,
        logo: window.selectedLogoDataUrl || document.getElementById('logo-img-preview').src
      };

      await window.ApiService.organization.save(payload);

      Swal.fire({
        title: 'Settings Saved',
        text: 'Organization details updated successfully.',
        icon: 'success',
        confirmButtonColor: '#2563EB'
      });
    } catch (err) {
      Swal.fire({
        title: 'Save Failed',
        text: err.message,
        icon: 'error',
        confirmButtonColor: '#2563EB'
      });
    } finally {
      if (spinner) spinner.classList.add('d-none');
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function showFieldError(id, msg) {
  const errEl = document.getElementById(`${id}-error`);
  const inputEl = document.getElementById(id);
  if (errEl) errEl.textContent = msg;
  if (inputEl) inputEl.classList.add('is-invalid');
}

async function loadDeptHeads() {
  const container = document.getElementById('dept-heads-table-body');
  if (!container) return;

  try {
    const users = await window.ApiService.users.list();
    const dynamicDepts = await window.ApiService.departments.list();
    const departments = dynamicDepts.map(d => ({ id: d.name, name: d.name }));

    // Filter candidates (non-admins, non-managers, and active only)
    const candidates = users.filter(u => 
      (u.role === 'Employee' || u.role === 'Department Head' || u.role === 'DepartmentHead') &&
      (!u.status || u.status === 'Active')
    );

    let html = '';
    departments.forEach(dept => {
      // Find current head
      const currentHead = users.find(u => u.department === dept.id && (u.role === 'Department Head' || u.role === 'DepartmentHead'));
      
      let optionsHtml = '<option value="">-- Not Assigned --</option>';
      candidates.forEach(cand => {
        const isSelected = currentHead && cand.email === currentHead.email ? 'selected' : '';
        optionsHtml += `<option value="${cand.email}" ${isSelected}>${cand.fullName || cand.name} (${cand.email})</option>`;
      });

      html += `
        <tr>
          <td><strong>${escapeHtml(dept.name)}</strong></td>
          <td>
            ${currentHead 
              ? `<span class="badge bg-primary-subtle text-primary rounded-pill px-2.5 py-1 fw-medium"><i class="fa-solid fa-user-tie me-1"></i>${escapeHtml(currentHead.fullName || currentHead.name)}</span>`
              : '<span class="text-muted small">None Assigned</span>'
            }
          </td>
          <td>
            ${currentHead 
              ? `<span class="text-dark small fw-medium"><i class="fa-regular fa-envelope me-1 text-primary"></i>${escapeHtml(currentHead.email)}</span>`
              : '<span class="text-muted small">-</span>'
            }
          </td>
          <td>
            <select class="form-select form-control-custom py-1 fs-7 w-auto d-inline-block" onchange="assignDeptHead('${escapeHtml(dept.id)}', this.value, '${currentHead ? escapeHtml(currentHead.email) : ''}')">
              ${optionsHtml}
            </select>
          </td>
        </tr>
      `;
    });

    container.innerHTML = html;
  } catch (err) {
    console.error("Failed to load department heads", err);
  }
}

window.assignDeptHead = async (deptId, newEmail, oldEmail) => {
  let transitionStatus = 'Employee';
  let transitionDetails = '';

  // Prompt for transition if replacing an existing head with a different one
  if (newEmail && oldEmail && newEmail !== oldEmail) {
    let oldHeadName = 'Current Head';
    try {
      const users = await window.ApiService.users.list();
      const oldHeadUser = users.find(u => u.email === oldEmail);
      if (oldHeadUser) {
        oldHeadName = oldHeadUser.fullName || oldHeadUser.name || oldEmail;
      }
    } catch (e) {
      console.error(e);
    }

    const { value: formValues, isDismissed } = await Swal.fire({
      title: 'Transition Old Department Head',
      html: `
        <p class="small text-muted mb-3 text-start">You are assigning a new head. Please specify what should happen to the current head, <strong>${oldHeadName}</strong>:</p>
        <div class="mb-3 text-start">
          <label for="swal-transition-status" class="form-label small fw-semibold">New Status / Action</label>
          <select id="swal-transition-status" class="form-select">
            <option value="Employee">Demoted to Employee (Active)</option>
            <option value="Transferred">Shifted to other city / Transferred</option>
            <option value="Retired">Retired (Deactivates Account)</option>
            <option value="Resigned">Resigned / Terminated (Deactivates Account)</option>
          </select>
        </div>
        <div class="mb-3 text-start">
          <label for="swal-transition-details" class="form-label small fw-semibold">Transition Details / Notes</label>
          <textarea id="swal-transition-details" class="form-control" rows="3" placeholder="e.g., Shifted to Bangalore branch, retired with full pension..."></textarea>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Confirm Promotion',
      confirmButtonColor: '#2563EB',
      cancelButtonColor: '#64748B',
      preConfirm: () => {
        return {
          status: document.getElementById('swal-transition-status').value,
          details: document.getElementById('swal-transition-details').value
        }
      }
    });

    if (isDismissed || !formValues) {
      // Re-load the table to revert the dropdown selection
      await loadDeptHeads();
      return;
    }

    transitionStatus = formValues.status;
    transitionDetails = formValues.details;
  }

  window.AssetFlowLoader.show();
  try {
    if (!newEmail && oldEmail) {
      // Demote current head to employee
      await window.ApiService.users.updateRole(oldEmail, 'Employee', deptId);
      Swal.fire({
        title: 'Department Head Removed',
        text: 'The department head was successfully unassigned.',
        icon: 'success',
        confirmButtonColor: '#2563EB'
      });
    } else if (newEmail) {
      await window.ApiService.users.updateRole(newEmail, 'Department Head', deptId, oldEmail, transitionStatus, transitionDetails);
      Swal.fire({
        title: 'Department Head Assigned',
        text: 'The new department head was assigned successfully.',
        icon: 'success',
        confirmButtonColor: '#2563EB'
      });
    }
    await loadDeptHeads();
    await loadTransitionHistory();
  } catch (err) {
    Swal.fire({
      title: 'Assignment Failed',
      text: err.message,
      icon: 'error',
      confirmButtonColor: '#2563EB'
    });
    await loadDeptHeads();
  } finally {
    window.AssetFlowLoader.hide();
  }
};

async function loadDepartmentsList() {
  const tbody = document.getElementById('departments-list-body');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="3" class="text-center py-3"><span class="spinner-border spinner-border-sm text-primary me-2"></span>Loading...</td></tr>';
  try {
    const list = await window.ApiService.departments.list();
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-3">No departments defined. Add a new department above.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map((dept, index) => `
      <tr>
        <td class="fw-semibold text-muted">${index + 1}</td>
        <td class="fw-semibold" style="color: var(--text-color);">${escapeHtml(dept.name)}</td>
        <td class="text-end">
          <button type="button" class="btn btn-sm btn-outline-danger py-0.5 px-2" title="Delete Department" onclick="deleteDepartment('${escapeHtml(dept.name)}')">
            <i class="fa-solid fa-trash-can me-1"></i>Delete
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="3" class="text-center text-danger py-3">Error loading departments: ${err.message}</td></tr>`;
  }
}

window.deleteDepartment = async (deptName) => {
  const result = await Swal.fire({
    title: 'Delete Department?',
    html: `Are you sure you want to delete <strong>"${escapeHtml(deptName)}"</strong>?<br><small class="text-muted">This action cannot be undone.</small>`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748B',
    confirmButtonText: 'Yes, Delete'
  });

  if (!result.isConfirmed) return;

  window.AssetFlowLoader.show();
  try {
    await window.ApiService.departments.delete(deptName);
    Swal.fire({
      title: 'Deleted!',
      text: `Department "${deptName}" was removed successfully.`,
      icon: 'success',
      confirmButtonColor: '#2563EB'
    });
    await loadDepartmentsList();
    await loadDeptHeads();
    await populateHeadDepartmentDropdown();
  } catch (err) {
    Swal.fire('Error', err.message || 'Failed to delete department', 'error');
  } finally {
    window.AssetFlowLoader.hide();
  }
};

function setupDeptFormSubmit() {
  const addDeptForm = document.getElementById('add-dept-form');
  if (!addDeptForm) return;

  addDeptForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('new-dept-name');
    const name = input.value.trim();
    if (!name) return;

    window.AssetFlowLoader.show();
    try {
      await window.ApiService.departments.create(name);
      Swal.fire({
        title: 'Department Added',
        text: `Department "${name}" registered successfully.`,
        icon: 'success',
        confirmButtonColor: '#2563EB'
      });
      input.value = '';
      await loadDepartmentsList();
      await loadDeptHeads();
      await populateHeadDepartmentDropdown();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    } finally {
      window.AssetFlowLoader.hide();
    }
  });
}

async function populateHeadDepartmentDropdown() {
  const select = document.getElementById('head-department');
  if (!select) return;

  try {
    const list = await window.ApiService.departments.list();
    if (list.length === 0) {
      select.innerHTML = '<option value="">-- No Departments Available --</option>';
      return;
    }
    select.innerHTML = list.map(d => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`).join('');
  } catch (err) {
    console.error("Failed to populate modal departments", err);
  }
}

function setupAddHeadUserFormSubmit() {
  const form = document.getElementById('add-head-user-form');
  if (!form) return;

  const roleSelect = document.getElementById('head-role');
  const deptContainer = document.getElementById('department-container');
  const deptSelect = document.getElementById('head-department');

  if (roleSelect && deptContainer && deptSelect) {
    roleSelect.addEventListener('change', (e) => {
      if (e.target.value === 'Asset Manager') {
        deptContainer.style.display = 'none';
        deptSelect.removeAttribute('required');
      } else {
        deptContainer.style.display = 'block';
        deptSelect.setAttribute('required', 'required');
      }
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fullName = document.getElementById('head-fullname').value.trim();
    const email = document.getElementById('head-email').value.trim();
    const password = document.getElementById('head-password').value;
    const role = document.getElementById('head-role').value;
    let department = document.getElementById('head-department').value;

    if (role === 'Asset Manager') {
      department = 'Global';
    }

    if (!fullName || !email || !password || !role || !department) {
      Swal.fire('Validation Error', 'All fields are required.', 'warning');
      return;
    }

    const spinner = document.getElementById('head-spinner');
    const submitBtn = document.getElementById('btn-save-head-user');
    if (spinner) spinner.classList.remove('d-none');
    if (submitBtn) submitBtn.disabled = true;

    try {
      // 1. Create User via Auth Service
      const signupFn = window.ApiService.auth.register || window.ApiService.auth.signup;
      await signupFn({
        fullName,
        email,
        password,
        role: role,
        department
      });

      // 2. Update role and assign as Head (Only for Department Heads)
      if (role === 'Department Head') {
        await window.ApiService.users.updateRole(email, 'Department Head', department);
      }

      // Hide Modal
      const modalEl = document.getElementById('addHeadModal');
      const modalInstance = bootstrap.Modal.getInstance(modalEl);
      if (modalInstance) modalInstance.hide();

      form.reset();

      Swal.fire({
        title: 'User Registered!',
        text: `${fullName} has been registered as ${role} for ${department}.`,
        icon: 'success',
        confirmButtonColor: '#2563EB'
      });

      if (role === 'Department Head') {
        await loadDeptHeads();
      }
      await loadSystemUsers();
    } catch (err) {
      Swal.fire('Error', err.message || 'Failed to create user', 'error');
    } finally {
      if (spinner) spinner.classList.add('d-none');
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function escapeHtml(str) {
  return str ? str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;") : '';
}

async function loadTransitionHistory() {
  const container = document.getElementById('dept-transitions-table-body');
  const card = document.getElementById('dept-transitions-card');
  if (!container || !card) return;

  try {
    const users = await window.ApiService.users.list();
    // Filter users with status other than Active, or with transition details
    const transitionedUsers = users.filter(u => (u.status && u.status !== 'Active') || u.transitionDetails);

    if (transitionedUsers.length === 0) {
      container.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-3 text-muted">No transition records found.</td>
        </tr>
      `;
      card.style.display = 'block';
      return;
    }

    let html = '';
    transitionedUsers.forEach(u => {
      let statusBadge = '';
      if (u.status === 'Retired') {
        statusBadge = '<span class="badge bg-danger-subtle text-danger rounded-pill px-2.5 py-1 fw-medium"><i class="fa-solid fa-person-cane me-1"></i>Retired</span>';
      } else if (u.status === 'Resigned') {
        statusBadge = '<span class="badge bg-secondary-subtle text-secondary rounded-pill px-2.5 py-1 fw-medium"><i class="fa-solid fa-door-open me-1"></i>Resigned</span>';
      } else if (u.status === 'Transferred') {
        statusBadge = '<span class="badge bg-warning-subtle text-warning rounded-pill px-2.5 py-1 fw-medium"><i class="fa-solid fa-plane-departure me-1"></i>Transferred</span>';
      } else {
        statusBadge = `<span class="badge bg-info-subtle text-info rounded-pill px-2.5 py-1 fw-medium">${escapeHtml(u.status || 'Employee')}</span>`;
      }

      html += `
        <tr>
          <td><strong>${escapeHtml(u.fullName || u.name)}</strong></td>
          <td>${escapeHtml(u.email)}</td>
          <td><span class="text-muted small">${escapeHtml(u.department || 'N/A')}</span></td>
          <td>${statusBadge}</td>
          <td><span class="text-muted small">${escapeHtml(u.transitionDetails || 'No details provided.')}</span></td>
        </tr>
      `;
    });

    container.innerHTML = html;
    card.style.display = 'block';
  } catch (err) {
    console.error("Failed to load transition history:", err);
  }
}

async function loadSystemUsers() {
  const container = document.getElementById('system-users-table-body');
  const card = document.getElementById('system-users-card');
  if (!container || !card) return;

  try {
    const users = await window.ApiService.users.list();
    
    if (!users || users.length === 0) {
      container.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-3 text-muted">No registered users found.</td>
        </tr>
      `;
      card.style.display = 'block';
      return;
    }

    let html = '';
    users.forEach(u => {
      let roleBadge = '';
      if (u.role === 'Admin') roleBadge = '<span class="badge bg-primary-subtle text-primary rounded-pill px-2.5 py-1 fw-medium"><i class="fa-solid fa-crown me-1"></i>Admin</span>';
      else if (u.role === 'Asset Manager') roleBadge = '<span class="badge bg-purple-subtle text-purple rounded-pill px-2.5 py-1 fw-medium" style="background-color:#F3E8FF; color:#7E22CE;"><i class="fa-solid fa-boxes-stacked me-1"></i>Asset Manager</span>';
      else if (u.role === 'Department Head') roleBadge = '<span class="badge bg-info-subtle text-info rounded-pill px-2.5 py-1 fw-medium"><i class="fa-solid fa-user-tie me-1"></i>Dept Head</span>';
      else roleBadge = '<span class="badge bg-secondary-subtle text-secondary rounded-pill px-2.5 py-1 fw-medium"><i class="fa-solid fa-user me-1"></i>Employee</span>';

      let statusBadge = '';
      if (u.status === 'Active') statusBadge = '<span class="text-success small fw-bold"><i class="fa-solid fa-circle-check me-1"></i>Active</span>';
      else statusBadge = `<span class="text-muted small fw-bold">${escapeHtml(u.status)}</span>`;

      html += `
        <tr>
          <td><strong>${escapeHtml(u.fullName || u.name)}</strong></td>
          <td>${escapeHtml(u.email)}</td>
          <td>${roleBadge}</td>
          <td><span class="text-muted small">${escapeHtml(u.department || 'N/A')}</span></td>
          <td>${statusBadge}</td>
        </tr>
      `;
    });

    container.innerHTML = html;
    card.style.display = 'block';
  } catch (err) {
    console.error("Failed to load system users directory:", err);
  }
}
