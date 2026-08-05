/**
 * AssetFlow User Profile JS
 * Manages profile information pre-population, change passwords, and FileReader image loaders.
 */

document.addEventListener('DOMContentLoaded', () => {
  window.AssetFlowLoader.show();
  try {
    loadUserProfile();
    setupProfileToggles();
    setupAvatarUpload();
    setupDetailsSubmit();
    setupPasswordSubmit();
  } catch (err) {
    console.error(err);
  } finally {
    window.AssetFlowLoader.hide();
  }
});

function getUserInitials(name) {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function updateProfileAvatarDisplay(user) {
  const wrapper = document.getElementById('profile-avatar-wrapper');
  if (!wrapper) return;

  if (user && user.avatar) {
    wrapper.innerHTML = `
      <img src="${user.avatar}" alt="Avatar" id="profile-card-img" style="width: 140px; height: 140px; border-radius: 50%; object-fit: cover; border: 3px solid var(--border-color);">
    `;
  } else {
    const initials = getUserInitials(user ? (user.fullName || user.name) : 'User');
    wrapper.innerHTML = `
      <div class="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center" 
           id="profile-card-img-placeholder"
           style="width: 140px; height: 140px; font-size: 56px; font-weight: 600; border: 3px solid var(--border-color);">
        ${initials}
      </div>
    `;
  }
}

function loadUserProfile() {
  const savedUser = localStorage.getItem('user');
  if (!savedUser) return;

  try {
    const user = JSON.parse(savedUser);
    
    // Strip cached default unsplash image
    if (user.avatar && user.avatar.includes('unsplash.com')) {
      user.avatar = '';
      localStorage.setItem('user', JSON.stringify(user));
    }
    
    // Set Profile Card info
    document.getElementById('profile-card-name').textContent = user.fullName || user.name || 'User';
    document.getElementById('profile-card-role').textContent = user.role || 'Employee';
    document.getElementById('profile-card-email').textContent = user.email || 'user@company.com';
    
    updateProfileAvatarDisplay(user);

    // Set Form Fields
    document.getElementById('profile-name').value = user.fullName || user.name || '';
    document.getElementById('profile-email').value = user.email || '';
    document.getElementById('profile-phone').value = user.phone || '';
    document.getElementById('profile-title').value = user.jobTitle || user.role || '';
    
  } catch (err) {
    console.error("Error reading user storage context", err);
  }
}

function setupProfileToggles() {
  const toggles = [
    { buttonId: 'password-toggle', inputId: 'password' },
    { buttonId: 'confirm-password-toggle', inputId: 'confirm-password' }
  ];

  toggles.forEach(t => {
    const btn = document.getElementById(t.buttonId);
    const input = document.getElementById(t.inputId);
    if (btn && input) {
      btn.addEventListener('click', () => {
        const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
        input.setAttribute('type', type);
        const icon = btn.querySelector('i');
        if (icon) {
          icon.className = type === 'password' ? 'fa-solid fa-eye text-muted' : 'fa-solid fa-eye-slash text-muted';
        }
      });
    }
  });
}

function setupAvatarUpload() {
  const input = document.getElementById('profile-avatar-upload');
  
  if (input) {
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        if (file.size > 1024 * 1024) {
          Swal.fire('File Too Large', 'Avatar image must be smaller than 1MB.', 'warning');
          return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
          const base64 = event.target.result;
          
          window.AssetFlowLoader.show();
          try {
            // Update profile with new base64 avatar
            await window.ApiService.profile.update({ avatar: base64 });
            
            // Update local user object
            const savedUser = localStorage.getItem('user');
            if (savedUser) {
              const userObj = JSON.parse(savedUser);
              userObj.avatar = base64;
              localStorage.setItem('user', JSON.stringify(userObj));
              updateProfileAvatarDisplay(userObj);
            }

            // Sync image inside top Navbar & Sidebar wrappers
            const navWrapper = document.getElementById('navbar-avatar-wrapper');
            const sideWrapper = document.getElementById('sidebar-avatar-wrapper');
            if (navWrapper) navWrapper.innerHTML = `<img src="${base64}" alt="Avatar" class="rounded-circle" width="40" height="40" id="navbar-avatar">`;
            if (sideWrapper) {
              sideWrapper.innerHTML = `
                <img src="${base64}" alt="Avatar" class="rounded-circle" width="40" height="40" id="sidebar-avatar">
                <span class="position-absolute bottom-0 end-0 bg-success border border-white rounded-circle p-1" style="width: 8px; height: 8px;"></span>
              `;
            }

            Swal.fire({
              title: 'Avatar Updated',
              text: 'Your profile picture has been synced.',
              icon: 'success',
              confirmButtonColor: '#2563EB'
            });
          } catch (err) {
            Swal.fire('Error', err.message, 'error');
          } finally {
            window.AssetFlowLoader.hide();
          }
        };
        reader.readAsDataURL(file);
      }
    });
  }
}

function setupDetailsSubmit() {
  const form = document.getElementById('profile-details-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Clear errors
    document.querySelectorAll('.invalid-feedback').forEach(el => el.textContent = '');
    document.querySelectorAll('.form-control').forEach(el => el.classList.remove('is-invalid'));

    const name = document.getElementById('profile-name').value.trim();
    const email = document.getElementById('profile-email').value.trim();
    const phone = document.getElementById('profile-phone').value.trim();
    const jobTitle = document.getElementById('profile-title').value.trim();

    let isValid = true;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!name) {
      showError('profile-name', 'Full Name is required.');
      isValid = false;
    }
    if (!email) {
      showError('profile-email', 'Contact Email is required.');
      isValid = false;
    } else if (!emailRegex.test(email)) {
      showError('profile-email', 'Please enter a valid email address.');
      isValid = false;
    }

    if (!isValid) return;

    window.AssetFlowLoader.show();
    try {
      const response = await window.ApiService.profile.update({
        fullName: name,
        email,
        phone,
        jobTitle
      });

      // Update Side Card
      document.getElementById('profile-card-name').textContent = name;
      document.getElementById('profile-card-email').textContent = email;
      document.getElementById('profile-card-role').textContent = jobTitle || 'Employee';

      // Update Navbar & Sidebar names
      const navUser = document.getElementById('navbar-username');
      const sideUser = document.getElementById('sidebar-username');
      const sideRole = document.getElementById('sidebar-role');
      if (navUser) navUser.textContent = name;
      if (sideUser) sideUser.textContent = name;
      if (sideRole && jobTitle) sideRole.textContent = jobTitle;

      Swal.fire({
        title: 'Details Saved',
        text: 'Your details have been updated successfully.',
        icon: 'success',
        confirmButtonColor: '#2563EB'
      });

    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    } finally {
      window.AssetFlowLoader.hide();
    }
  });
}

function setupPasswordSubmit() {
  const form = document.getElementById('profile-password-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Clear errors
    document.querySelectorAll('.invalid-feedback').forEach(el => el.textContent = '');
    document.querySelectorAll('.form-control').forEach(el => el.classList.remove('is-invalid'));

    const currentPassword = document.getElementById('current-password').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    let isValid = true;
    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

    if (!currentPassword) {
      showError('current-password', 'Current password is required.');
      isValid = false;
    }

    if (!password) {
      showError('password', 'New password is required.');
      isValid = false;
    } else if (!strongPasswordRegex.test(password)) {
      showError('password', 'Password must contain at least 8 characters, with 1 uppercase, 1 lowercase, 1 number, and 1 special character.');
      isValid = false;
    }

    if (!confirmPassword) {
      showError('confirm-password', 'Please confirm your password.');
      isValid = false;
    } else if (password !== confirmPassword) {
      showError('confirm-password', 'Passwords do not match.');
      isValid = false;
    }

    if (!isValid) return;

    window.AssetFlowLoader.show();
    try {
      await window.ApiService.profile.changePassword({
        currentPassword,
        newPassword: password
      });

      Swal.fire({
        title: 'Password Updated!',
        text: 'Your account password has been changed.',
        icon: 'success',
        confirmButtonColor: '#2563EB'
      });

      form.reset();

    } catch (err) {
      Swal.fire({
        title: 'Error',
        text: err.message,
        icon: 'error',
        confirmButtonColor: '#2563EB'
      });
    } finally {
      window.AssetFlowLoader.hide();
    }
  });
}

function showError(id, msg) {
  const errEl = document.getElementById(`${id}-error`);
  const inputEl = document.getElementById(id);
  if (errEl) errEl.textContent = msg;
  if (inputEl) inputEl.classList.add('is-invalid');
}
