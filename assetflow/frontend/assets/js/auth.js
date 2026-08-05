/**
 * AssetFlow Authentication JS
 * Handles Signup, OTP Verification, Login, Forgot Password, and Reset Password workflows.
 */

document.addEventListener('DOMContentLoaded', () => {
  setupPasswordToggles();
  setupLoginForm();
  setupOtpVerificationForm();
  setupForgotPasswordForm();
  setupResetPasswordForm();
});

// Helper: Toggle password visibility
function setupPasswordToggles() {
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

// Validation Utilities
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Minimum 8 characters, at least one uppercase, one lowercase, one number, one special character
const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

function showError(inputId, message) {
  const errorEl = document.getElementById(`${inputId}-error`);
  const inputEl = document.getElementById(inputId);
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }
  if (inputEl) {
    inputEl.classList.add('is-invalid');
  }
}

function clearErrors() {
  const errorEls = document.querySelectorAll('.invalid-feedback');
  errorEls.forEach(el => {
    el.textContent = '';
    el.style.display = 'none';
  });
  const inputEls = document.querySelectorAll('.form-control');
  inputEls.forEach(el => {
    el.classList.remove('is-invalid');
  });
}

// 1. LOGIN FORM HANDLER
function setupLoginForm() {
  const form = document.getElementById('login-form');
  if (!form) return;


  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const roleSelect = document.getElementById('role-select');
    const role = roleSelect ? roleSelect.value : null;
    let isValid = true;

    if (!role) {
      Swal.fire('Error', 'Please select a role before signing in.', 'warning');
      isValid = false;
    }

    if (!email) {
      showError('email', 'Email address is required.');
      isValid = false;
    } else if (!emailRegex.test(email)) {
      showError('email', 'Please enter a valid email address.');
      isValid = false;
    }

    if (!password) {
      showError('password', 'Password is required.');
      isValid = false;
    }

    if (!isValid) return;

    // Show loading
    const spinner = document.getElementById('login-spinner');
    const submitBtn = document.getElementById('btn-login-submit');
    if (spinner) spinner.classList.remove('d-none');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const response = await ApiService.auth.login({ email, password, role });
      
      const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 1500,
        timerProgressBar: true,
      });

      await Toast.fire({
        icon: 'success',
        title: 'Signed in successfully'
      });

      // Redirect to dashboard
      window.location.href = 'dashboard.html';
    } catch (err) {
      console.error(err);
      
      if (err.message.includes("verify your email")) {
        // Unverified email handler
        Swal.fire({
          title: 'Email Unverified',
          text: 'Please verify your email before logging in.',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#2563EB',
          cancelButtonColor: '#64748B',
          confirmButtonText: 'Verify Now',
          cancelButtonText: 'Resend Verification'
        }).then(async (result) => {
          if (result.isConfirmed) {
            localStorage.setItem('verification_email', email);
            window.location.href = 'otp-verification.html';
          } else if (result.dismiss === Swal.DismissReason.cancel) {
            try {
              // Resend OTP
              await ApiService.auth.resendOtp(email);
              localStorage.setItem('verification_email', email);
              Swal.fire({
                title: 'OTP Resent',
                text: 'A new 6-digit verification code has been sent to your email.',
                icon: 'success',
                confirmButtonColor: '#2563EB'
              }).then(() => {
                window.location.href = 'otp-verification.html';
              });
            } catch (resendErr) {
              Swal.fire('Error', resendErr.message, 'error');
            }
          }
        });
      } else {
        Swal.fire({
          title: 'Sign In Failed',
          text: err.message,
          icon: 'error',
          confirmButtonColor: '#2563EB'
        });
      }
    } finally {
      if (spinner) spinner.classList.add('d-none');
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}


// 3. OTP VERIFICATION FORM HANDLER
function setupOtpVerificationForm() {
  const form = document.getElementById('otp-form');
  if (!form) return;

  const emailDisplay = document.getElementById('otp-email-display');
  const email = localStorage.getItem('verification_email') || 'your email';
  if (emailDisplay) emailDisplay.textContent = email;

  const digits = document.querySelectorAll('.otp-digit');
  const verifyBtn = document.getElementById('btn-otp-verify');
  const resendBtn = document.getElementById('btn-otp-resend');
  const timerVal = document.getElementById('otp-timer');
  const timerContainer = document.getElementById('otp-timer-container');

  let countdown = 60;
  let timerInterval;

  // Start Rate Limit Countdown Timer on load
  startTimer();



  function startTimer() {
    countdown = 60;
    if (resendBtn) resendBtn.disabled = true;
    if (timerContainer) timerContainer.style.display = 'block';
    if (timerVal) timerVal.textContent = countdown;

    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      countdown--;
      if (timerVal) timerVal.textContent = countdown;
      
      if (countdown <= 0) {
        clearInterval(timerInterval);
        if (resendBtn) resendBtn.disabled = false;
        if (timerContainer) timerContainer.style.display = 'none';
      }
    }, 1000);
  }

  // Handle auto-focus and deletion behaviors for digits
  digits.forEach((digit, idx) => {
    digit.addEventListener('input', (e) => {
      const val = e.target.value;
      
      // Auto focus next box
      if (val && idx < digits.length - 1) {
        digits[idx + 1].focus();
      }
      
      checkOtpComplete();
    });

    digit.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !digit.value && idx > 0) {
        digits[idx - 1].focus();
      }
    });
  });

  function checkOtpComplete() {
    let completed = true;
    digits.forEach(d => {
      if (!d.value) completed = false;
    });
    
    if (verifyBtn) {
      verifyBtn.disabled = !completed;
    }
  }

  // Resend OTP Action
  if (resendBtn) {
    resendBtn.addEventListener('click', async () => {
      try {
        await ApiService.auth.resendOtp(email);
        Swal.fire({
          title: 'OTP Resent',
          text: 'A new 6-digit verification code has been sent to your email.',
          icon: 'success',
          confirmButtonColor: '#2563EB'
        });
        startTimer();
      } catch (err) {
        Swal.fire('Error', err.message, 'error');
      }
    });
  }

  // Submit OTP Action
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    let otpCode = '';
    digits.forEach(d => otpCode += d.value);

    // Show loading
    const spinner = document.getElementById('otp-spinner');
    if (spinner) spinner.classList.remove('d-none');
    if (verifyBtn) verifyBtn.disabled = true;

    try {
      await ApiService.auth.verifyOtp(email, otpCode);
      
      Swal.fire({
        title: 'Account Activated!',
        text: 'Your email has been verified successfully. Redirecting to login.',
        icon: 'success',
        confirmButtonColor: '#2563EB'
      }).then(() => {
        localStorage.removeItem('verification_email');
        window.location.href = 'login.html';
      });
    } catch (err) {
      console.error(err);
      Swal.fire({
        title: 'Verification Failed',
        text: err.message,
        icon: 'error',
        confirmButtonColor: '#2563EB'
      });
    } finally {
      if (spinner) spinner.classList.add('d-none');
      if (verifyBtn) verifyBtn.disabled = false;
    }
  });
}

// 4. FORGOT PASSWORD FORM HANDLER
function setupForgotPasswordForm() {
  const form = document.getElementById('forgot-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    const email = document.getElementById('email').value.trim();
    let isValid = true;

    if (!email) {
      showError('email', 'Email address is required.');
      isValid = false;
    } else if (!emailRegex.test(email)) {
      showError('email', 'Please enter a valid email address.');
      isValid = false;
    }

    if (!isValid) return;

    // Show loading
    const spinner = document.getElementById('forgot-spinner');
    const submitBtn = document.getElementById('btn-forgot-submit');
    if (spinner) spinner.classList.remove('d-none');
    if (submitBtn) submitBtn.disabled = true;

    try {
      await ApiService.auth.forgotPassword(email);
      
      Swal.fire({
        title: 'OTP Code Sent',
        text: 'A password reset OTP code has been sent to your email.',
        icon: 'success',
        confirmButtonColor: '#2563EB'
      }).then(() => {
        window.location.href = 'reset-password.html';
      });
    } catch (err) {
      console.error(err);
      Swal.fire({
        title: 'Error',
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

// 5. RESET PASSWORD FORM HANDLER
function setupResetPasswordForm() {
  const form = document.getElementById('reset-form');
  if (!form) return;

  // Pre-fill email if it exists
  const savedEmail = localStorage.getItem('reset_email');
  if (savedEmail) {
    const emailInput = document.getElementById('email');
    if (emailInput) emailInput.value = savedEmail;
  }



  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    const email = document.getElementById('email').value.trim();
    const otp = document.getElementById('otp').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    let isValid = true;

    if (!email) {
      showError('email', 'Email address is required.');
      isValid = false;
    } else if (!emailRegex.test(email)) {
      showError('email', 'Please enter a valid email address.');
      isValid = false;
    }

    if (!otp) {
      showError('otp', 'OTP Reset Code is required.');
      isValid = false;
    } else if (otp.length !== 6) {
      showError('otp', 'OTP Code must be exactly 6 digits.');
      isValid = false;
    }

    if (!password) {
      showError('password', 'Password is required.');
      isValid = false;
    } else if (!strongPasswordRegex.test(password)) {
      showError('password', 'Password must contain at least 8 characters, including 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character.');
      isValid = false;
    }

    if (!confirmPassword) {
      showError('confirm-password', 'Confirm password is required.');
      isValid = false;
    } else if (password !== confirmPassword) {
      showError('confirm-password', 'Passwords do not match.');
      isValid = false;
    }

    if (!isValid) return;

    // Show loading
    const spinner = document.getElementById('reset-spinner');
    const submitBtn = document.getElementById('btn-reset-submit');
    if (spinner) spinner.classList.remove('d-none');
    if (submitBtn) submitBtn.disabled = true;

    try {
      await ApiService.auth.resetPassword(email, otp, password);
      
      Swal.fire({
        title: 'Password Updated!',
        text: 'Your password has been reset successfully. You can now log in.',
        icon: 'success',
        confirmButtonColor: '#2563EB'
      }).then(() => {
        window.location.href = 'login.html';
      });
    } catch (err) {
      console.error(err);
      Swal.fire({
        title: 'Error',
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
