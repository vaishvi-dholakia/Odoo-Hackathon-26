/**
 * AssetFlow API Service Layer
 * Uses Axios to communicate with the Backend API.
 * Provides a fallback to LocalStorage for demonstration when the backend is unreachable.
 */

const API_BASE_URL = window.location.origin.includes('localhost') || 
  window.location.origin.includes('127.0.0.1') || 
  window.location.protocol === 'file:' || 
  window.location.origin === 'null'
    ? 'http://localhost:3000/api'
    : '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request Interceptor: Attach JWT Token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor: Handle errors globally
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // Check if error is 401 (Unauthorized) and not already retrying
    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      // Clear token and redirect to login if not already on auth pages
      const authPages = ['login.html', 'signup.html', 'forgot-password.html', 'otp-verification.html', 'reset-password.html'];
      const currentPage = window.location.pathname.split('/').pop();
      
      if (!authPages.includes(currentPage)) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        
        Swal.fire({
          title: 'Session Expired',
          text: 'Please log in again.',
          icon: 'warning',
          confirmButtonColor: '#2563EB'
        }).then(() => {
          const isSubPage = window.location.pathname.includes('/pages/');
          window.location.href = isSubPage ? 'login.html' : 'pages/login.html';
        });
      }
    }
    return Promise.reject(error);
  }
);

// Helper to notify of Network/Server failures and fallback
function handleApiError(error, fallbackCallback) {
  console.warn("API Request Failed:", error);
  
  const isNetworkError = !error.response;
  
  if (isNetworkError) {
    // Notify user of connection issue and fallback
    const Toast = Swal.mixin({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 3500,
      timerProgressBar: true,
    });
    
    Toast.fire({
      icon: 'info',
      title: 'Connecting to local sandbox (Offline mode)'
    });
    
    if (fallbackCallback) {
      return fallbackCallback();
    }
  }
  
  // Extract error message
  const message = error.response && error.response.data && error.response.data.message
    ? error.response.data.message
    : 'Something went wrong. Please try again.';
    
  throw new Error(message);
}

// Local Storage Fallback Data Store (to ensure the frontend is interactive during review)
const fallbackStore = {
  get: (key, defaultValue) => {
    const val = localStorage.getItem(`af_fb_${key}`);
    return val ? JSON.parse(val) : defaultValue;
  },
  set: (key, value) => {
    localStorage.setItem(`af_fb_${key}`, JSON.stringify(value));
  }
};

// Initialize fallback store clean without static dummy departments/users/bookings/maintenance
if (!localStorage.getItem('af_fb_initialized_v7')) {
  // Wipe any old static data from fallback storage
  localStorage.removeItem('af_fb_departments');
  localStorage.removeItem('af_fb_bookings');
  localStorage.removeItem('af_fb_maintenance');
  fallbackStore.set('departments', []);
  fallbackStore.set('maintenance', []);

  // Seed initial admin account only (no dummy employees or dummy department heads)
  fallbackStore.set('registered_users', [
    { email: 'admin@assetflow.com', password: 'Password123!', fullName: 'Rahul Sharma', role: 'Admin', department: 'Management', avatar: '', isVerified: true }
  ]);

  localStorage.setItem('af_fb_initialized_v7', 'true');
}

// Global API Services Module
const ApiService = {
  // --- AUTH SERVICES ---
  auth: {
    signup: async (userData) => {
      try {
        const res = await api.post('/auth/signup', userData);
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          // Fallback signup: Bypass OTP, register directly
          const registeredUsers = fallbackStore.get('registered_users', []);
          if (registeredUsers.some(u => u.email === userData.email)) {
            throw new Error("Email already registered.");
          }
          const newUser = { ...userData, isVerified: true, id: 'USR-' + Math.floor(1000 + Math.random() * 9000) };
          registeredUsers.push(newUser);
          fallbackStore.set('registered_users', registeredUsers);
          return { success: true, message: "Signup successful! Please log in.", email: userData.email, bypassOtp: true };
        });
      }
    },

    register: async (userData) => {
      return ApiService.auth.signup(userData);
    },

    verifyOtp: async (email, otp) => {
      try {
        const res = await api.post('/auth/verify-otp', { email, otp });
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          return { success: true, message: "Email verified successfully!" };
        });
      }
    },

    resendOtp: async (email) => {
      try {
        const res = await api.post('/auth/resend-otp', { email });
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          return { success: true, message: "New OTP sent successfully!" };
        });
      }
    },

    login: async (credentials) => {
      try {
        const res = await api.post('/auth/login', credentials);
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          const registeredUsers = fallbackStore.get('registered_users', []);
          const user = registeredUsers.find(u => u.email === credentials.email);
          if (!user) throw new Error("Invalid email or password.");
          
          if (user.password !== credentials.password) throw new Error("Invalid email or password.");
          if (!user.isVerified) {
            const err = new Error("Please verify your email before logging in.");
            err.unverified = true;
            throw err;
          }
          
          const userProfile = { 
            name: user.fullName || user.name, 
            email: user.email, 
            role: user.role || 'Employee', 
            department: user.department || 'IT',
            avatar: user.avatar || '' 
          };
          localStorage.setItem('token', 'fallback-mock-jwt-token-' + userProfile.role.replace(' ', ''));
          localStorage.setItem('user', JSON.stringify(userProfile));
          return { success: true, user: userProfile, token: 'fallback-mock-jwt-token-' + userProfile.role.replace(' ', '') };
        });
      }
    },

    forgotPassword: async (email) => {
      try {
        const res = await api.post('/auth/forgot-password', { email });
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          const registeredUsers = fallbackStore.get('registered_users', []);
          const userExists = credentials => true; // Allow mock for demo
          
          const otp = Math.floor(100000 + Math.random() * 900000).toString();
          localStorage.setItem('reset_email', email);
          localStorage.setItem('reset_otp', otp);
          
          console.log(`[OFFLINE DEV] Reset password OTP for ${email}: ${otp}`);
          return { success: true, message: "Reset code sent to your email." };
        });
      }
    },

    resetPassword: async (email, otp, newPassword) => {
      try {
        const res = await api.post('/auth/reset-password', { email, otp, newPassword });
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          const savedEmail = localStorage.getItem('reset_email');
          const savedOtp = localStorage.getItem('reset_otp');
          
          if (email !== savedEmail || otp !== savedOtp) {
            throw new Error("Invalid email or OTP code.");
          }
          
          // Modify password in registered users list
          const registeredUsers = fallbackStore.get('registered_users', []);
          const user = registeredUsers.find(u => u.email === email);
          if (user) {
            user.password = newPassword;
            fallbackStore.set('registered_users', registeredUsers);
          }
          
          localStorage.removeItem('reset_email');
          localStorage.removeItem('reset_otp');
          return { success: true, message: "Password reset successfully!" };
        });
      }
    }
  },

  // --- ORGANIZATION SERVICES ---
  organization: {
    get: async () => {
      try {
        const res = await api.get('/org');
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          return fallbackStore.get('organization');
        });
      }
    },
    save: async (orgData) => {
      try {
        const res = await api.put('/org', orgData);
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          fallbackStore.set('organization', orgData);
          return { success: true, message: "Organization setup saved successfully!" };
        });
      }
    }
  },

  // --- ASSET SERVICES ---
  assets: {
    list: async () => {
      try {
        const res = await api.get('/assets');
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          return fallbackStore.get('assets', []);
        });
      }
    },
    create: async (asset) => {
      try {
        const res = await api.post('/assets', asset);
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          const assets = fallbackStore.get('assets', []);
          const newAsset = { ...asset, id: 'AST-' + String(assets.length + 1).padStart(3, '0') };
          assets.push(newAsset);
          fallbackStore.set('assets', assets);
          return { success: true, asset: newAsset, message: "Asset added successfully!" };
        });
      }
    },
    update: async (id, assetData) => {
      try {
        const res = await api.put(`/assets/${id}`, assetData);
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          const assets = fallbackStore.get('assets', []);
          const idx = assets.findIndex(a => a.id === id);
          if (idx !== -1) {
            assets[idx] = { ...assets[idx], ...assetData };
            fallbackStore.set('assets', assets);
            return { success: true, message: "Asset updated successfully!" };
          }
          throw new Error("Asset not found");
        });
      }
    },
    delete: async (id) => {
      try {
        const res = await api.delete(`/assets/${id}`);
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          let assets = fallbackStore.get('assets', []);
          assets = assets.filter(a => a.id !== id);
          fallbackStore.set('assets', assets);
          return { success: true, message: "Asset deleted successfully!" };
        });
      }
    }
  },

  // --- ALLOCATION & TRANSFER SERVICES ---
  allocations: {
    list: async () => {
      try {
        const res = await api.get('/allocations');
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          return fallbackStore.get('allocations', []);
        });
      }
    },
    create: async (allocation) => {
      try {
        const res = await api.post('/allocations', allocation);
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          const allocations = fallbackStore.get('allocations', []);
          const newAlloc = { ...allocation, id: 'ALC-' + String(allocations.length + 1).padStart(3, '0'), status: 'Pending Approval' };
          allocations.push(newAlloc);
          fallbackStore.set('allocations', allocations);
          return { success: true, allocation: newAlloc, message: "Allocation request created!" };
        });
      }
    },
    action: async (id, status, assetId = null) => {
      try {
        const res = await api.post(`/allocations/${id}/action`, { status, assetId });
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          const allocations = fallbackStore.get('allocations', []);
          const idx = allocations.findIndex(a => a.id === id);
          if (idx !== -1) {
            allocations[idx].status = status;
            if (status === 'Approved' && assetId) {
              allocations[idx].assetId = assetId;
              const assets = fallbackStore.get('assets', []);
              const asset = assets.find(a => a.id === assetId);
              if (asset) {
                allocations[idx].assetName = asset.name;
                asset.owner = allocations[idx].allocatedTo;
                fallbackStore.set('assets', assets);
              }
            }
            fallbackStore.set('allocations', allocations);
            return { success: true, message: `Allocation ${status.toLowerCase()} successfully!` };
          }
          throw new Error("Allocation not found");
        });
      }
    }
  },

  // --- RESOURCE BOOKING SERVICES ---
  bookings: {
    list: async () => {
      try {
        const res = await api.get('/bookings');
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          return fallbackStore.get('bookings', []);
        });
      }
    },
    create: async (booking) => {
      try {
        const res = await api.post('/bookings', booking);
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          const bookings = fallbackStore.get('bookings', []);
          const newBooking = { ...booking, id: 'BKG-' + String(bookings.length + 1).padStart(3, '0'), status: 'Confirmed' };
          bookings.push(newBooking);
          fallbackStore.set('bookings', bookings);
          return { success: true, booking: newBooking, message: "Resource booked successfully!" };
        });
      }
    },
    cancel: async (id) => {
      try {
        const res = await api.delete(`/bookings/${id}`);
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          const bookings = fallbackStore.get('bookings', []);
          const idx = bookings.findIndex(b => b.id === id);
          if (idx !== -1) {
            bookings[idx].status = 'Cancelled';
            fallbackStore.set('bookings', bookings);
            return { success: true, message: "Booking cancelled successfully!" };
          }
          throw new Error("Booking not found");
        });
      }
    }
  },

  // --- MAINTENANCE SERVICES ---
  maintenance: {
    list: async () => {
      try {
        const res = await api.get('/maintenance');
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          return fallbackStore.get('maintenance', []);
        });
      }
    },
    create: async (log) => {
      try {
        const res = await api.post('/maintenance', log);
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          const maintenance = fallbackStore.get('maintenance', []);
          const newLog = { ...log, id: 'MNT-' + String(maintenance.length + 1).padStart(3, '0'), status: 'Pending' };
          maintenance.push(newLog);
          fallbackStore.set('maintenance', maintenance);
          return { success: true, log: newLog, message: "Maintenance log added successfully!" };
        });
      }
    },
    updateStatus: async (id, status) => {
      try {
        const res = await api.put(`/maintenance/${id}/status`, { status });
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          const maintenance = fallbackStore.get('maintenance', []);
          const idx = maintenance.findIndex(m => m.id === id);
          if (idx !== -1) {
            maintenance[idx].status = status;
            fallbackStore.set('maintenance', maintenance);
            return { success: true, message: "Maintenance status updated!" };
          }
          throw new Error("Log not found");
        });
      }
    }
  },

  // --- AUDIT SERVICES ---
  audits: {
    list: async () => {
      try {
        const res = await api.get('/audits');
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          return fallbackStore.get('audits');
        });
      }
    },
    create: async (audit) => {
      try {
        const res = await api.post('/audits', audit);
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          const audits = fallbackStore.get('audits');
          const newAudit = { ...audit, id: 'AUD-' + String(audits.length + 1).padStart(3, '0'), progress: 0, status: 'In Progress' };
          audits.push(newAudit);
          fallbackStore.set('audits', audits);
          return { success: true, audit: newAudit, message: "Audit scheduled successfully!" };
        });
      }
    },
    updateProgress: async (id, progress) => {
      try {
        const res = await api.put(`/audits/${id}/progress`, { progress });
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          const audits = fallbackStore.get('audits');
          const idx = audits.findIndex(a => a.id === id);
          if (idx !== -1) {
            audits[idx].progress = progress;
            if (progress === 100) {
              audits[idx].status = 'Completed';
            }
            fallbackStore.set('audits', audits);
            return { success: true, message: "Audit progress updated!" };
          }
          throw new Error("Audit record not found");
        });
      }
    }
  },

  // --- NOTIFICATIONS SERVICES ---
  notifications: {
    list: async () => {
      try {
        const res = await api.get('/notifications');
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          return fallbackStore.get('notifications');
        });
      }
    },
    markAsRead: async (id) => {
      try {
        const res = await api.post(`/notifications/${id}/read`);
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          const notifications = fallbackStore.get('notifications');
          const idx = notifications.findIndex(n => n.id === id);
          if (idx !== -1) {
            notifications[idx].read = true;
            fallbackStore.set('notifications', notifications);
            return { success: true };
          }
          throw new Error("Notification not found");
        });
      }
    },
    clearAll: async () => {
      try {
        const res = await api.delete('/notifications');
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          fallbackStore.set('notifications', []);
          return { success: true };
        });
      }
    },
    sendCustom: async (notifData) => {
      try {
        const res = await api.post('/notifications', notifData);
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          const list = fallbackStore.get('notifications') || [];
          const newNotif = {
            id: 'NTF-' + Math.floor(1000 + Math.random() * 9000),
            title: notifData.title,
            message: notifData.message,
            type: notifData.type || 'info',
            date: new Date().toISOString().replace('T', ' ').substring(0, 16),
            read: false
          };
          list.unshift(newNotif);
          fallbackStore.set('notifications', list);
          return { success: true, message: "Notification sent successfully!" };
        });
      }
    }
  },

  // --- DEPARTMENTS SERVICES ---
  departments: {
    list: async () => {
      try {
        const res = await api.get('/departments');
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          return fallbackStore.get('departments', []);
        });
      }
    },
    create: async (name) => {
      try {
        const res = await api.post('/departments', { name });
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          const depts = fallbackStore.get('departments', []);
          if (depts.includes(name)) throw new Error("Department already exists.");
          depts.push(name);
          fallbackStore.set('departments', depts);
          return { success: true, message: "Department added successfully!" };
        });
      }
    },
    delete: async (name) => {
      try {
        const res = await api.delete(`/departments/${encodeURIComponent(name)}`);
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          let depts = fallbackStore.get('departments', []);
          const filtered = depts.filter(d => (typeof d === 'string' ? d : d.name) !== name);
          fallbackStore.set('departments', filtered);
          return { success: true, message: "Department deleted successfully!" };
        });
      }
    }
  },

  // --- PROFILE & SETTINGS ---
  profile: {
    update: async (profileData) => {
      try {
        const res = await api.put('/profile', profileData);
        // Sync local user info
        localStorage.setItem('user', JSON.stringify(res.data.user));
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          const user = JSON.parse(localStorage.getItem('user')) || {};
          const updatedUser = { ...user, ...profileData };
          localStorage.setItem('user', JSON.stringify(updatedUser));
          return { success: true, user: updatedUser, message: "Profile updated successfully!" };
        });
      }
    },
    changePassword: async (pwdData) => {
      try {
        const res = await api.post('/profile/change-password', pwdData);
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          // Simulating password check
          if (pwdData.currentPassword === '') {
            throw new Error("Current password cannot be empty.");
          }
          return { success: true, message: "Password updated successfully!" };
        });
      }
    }
  },

  // --- USER MANAGEMENT SERVICES ---
  users: {
    list: async () => {
      try {
        const res = await api.get('/users');
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          return fallbackStore.get('registered_users', []);
        });
      }
    },
    updateRole: async (email, role, department, oldHeadEmail = null, oldHeadStatus = null, oldHeadDetails = null) => {
      try {
        const res = await api.put('/users/role', { email, role, department, oldHeadEmail, oldHeadStatus, oldHeadDetails });
        return res.data;
      } catch (err) {
        return handleApiError(err, () => {
          const registeredUsers = fallbackStore.get('registered_users', []);
          
          // Demote / Transition existing head if assigning a new head
          if (role === 'Department Head') {
            if (oldHeadEmail) {
              const oldUser = registeredUsers.find(u => u.email === oldHeadEmail);
              if (oldUser) {
                oldUser.role = 'Employee';
                oldUser.status = oldHeadStatus || 'Employee';
                oldUser.transitionDetails = oldHeadDetails || null;
              }
            } else {
              registeredUsers.forEach(u => {
                if (u.department === department && u.role === 'Department Head') {
                  u.role = 'Employee';
                  u.status = 'Active';
                }
              });
            }
          }

          const user = registeredUsers.find(u => u.email === email);
          if (user) {
            user.role = role;
            user.department = department;
            user.status = 'Active';
            fallbackStore.set('registered_users', registeredUsers);
            
            // Sync with current user profile if active
            const loggedInUser = JSON.parse(localStorage.getItem('user')) || {};
            if (loggedInUser.email === email) {
              const updatedProfile = { ...loggedInUser, role, department };
              localStorage.setItem('user', JSON.stringify(updatedProfile));
            }
            
            return { success: true, message: `Assigned ${user.fullName || user.name} as Head of ${department} department.` };
          }
          throw new Error("User not found.");
        });
      }
    }
  }
};
window.ApiService = ApiService;
