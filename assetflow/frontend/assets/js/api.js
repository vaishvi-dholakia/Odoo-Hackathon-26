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

// Fallback store removed for production environment

// Global API Services Module
const ApiService = {
  // --- AUTH SERVICES ---
  auth: {
    signup: async (userData) => {
      try {
        const res = await api.post('/auth/signup', userData);
        return res.data;
      } catch (err) {
        return handleApiError(err);
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
        return handleApiError(err);
      }
    },

    resendOtp: async (email) => {
      try {
        const res = await api.post('/auth/resend-otp', { email });
        return res.data;
      } catch (err) {
        return handleApiError(err);
      }
    },

    login: async (credentials) => {
      try {
        const res = await api.post('/auth/login', credentials);
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        return res.data;
      } catch (err) {
        return handleApiError(err);
      }
    },

    forgotPassword: async (email) => {
      try {
        const res = await api.post('/auth/forgot-password', { email });
        return res.data;
      } catch (err) {
        return handleApiError(err);
      }
    },

    resetPassword: async (email, otp, newPassword) => {
      try {
        const res = await api.post('/auth/reset-password', { email, otp, newPassword });
        return res.data;
      } catch (err) {
        return handleApiError(err);
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
        return handleApiError(err);
      }
    },
    save: async (orgData) => {
      try {
        const res = await api.put('/org', orgData);
        return res.data;
      } catch (err) {
        return handleApiError(err);
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
        return handleApiError(err);
      }
    },
    create: async (asset) => {
      try {
        const res = await api.post('/assets', asset);
        return res.data;
      } catch (err) {
        return handleApiError(err);
      }
    },
    update: async (id, assetData) => {
      try {
        const res = await api.put(`/assets/${id}`, assetData);
        return res.data;
      } catch (err) {
        return handleApiError(err);
      }
    },
    delete: async (id) => {
      try {
        const res = await api.delete(`/assets/${id}`);
        return res.data;
      } catch (err) {
        return handleApiError(err);
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
        return handleApiError(err);
      }
    },
    create: async (allocation) => {
      try {
        const res = await api.post('/allocations', allocation);
        return res.data;
      } catch (err) {
        return handleApiError(err);
      }
    },
    action: async (id, status, assetId = null) => {
      try {
        const res = await api.post(`/allocations/${id}/action`, { status, assetId });
        return res.data;
      } catch (err) {
        return handleApiError(err);
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
        return handleApiError(err);
      }
    },
    create: async (booking) => {
      try {
        const res = await api.post('/bookings', booking);
        return res.data;
      } catch (err) {
        return handleApiError(err);
      }
    },
    cancel: async (id) => {
      try {
        const res = await api.delete(`/bookings/${id}`);
        return res.data;
      } catch (err) {
        return handleApiError(err);
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
        return handleApiError(err);
      }
    },
    create: async (log) => {
      try {
        const res = await api.post('/maintenance', log);
        return res.data;
      } catch (err) {
        return handleApiError(err);
      }
    },
    updateStatus: async (id, status) => {
      try {
        const res = await api.put(`/maintenance/${id}/status`, { status });
        return res.data;
      } catch (err) {
        return handleApiError(err);
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
        return handleApiError(err);
      }
    },
    create: async (audit) => {
      try {
        const res = await api.post('/audits', audit);
        return res.data;
      } catch (err) {
        return handleApiError(err);
      }
    },
    updateProgress: async (id, progress) => {
      try {
        const res = await api.put(`/audits/${id}/progress`, { progress });
        return res.data;
      } catch (err) {
        return handleApiError(err);
      }
    },
    getState: async (id) => {
      try {
        const res = await api.get(`/audits/${id}/state`);
        return res.data.state;
      } catch (err) {
        return handleApiError(err);
      }
    },
    saveState: async (id, state) => {
      try {
        const res = await api.put(`/audits/${id}/state`, { state });
        return res.data;
      } catch (err) {
        return handleApiError(err);
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
        return handleApiError(err);
      }
    },
    markAsRead: async (id) => {
      try {
        const res = await api.post(`/notifications/${id}/read`);
        return res.data;
      } catch (err) {
        return handleApiError(err);
      }
    },
    clearAll: async () => {
      try {
        const res = await api.delete('/notifications');
        return res.data;
      } catch (err) {
        return handleApiError(err);
      }
    },
    create: async (notifData) => {
      try {
        const res = await api.post('/notifications', notifData);
        return res.data;
      } catch (err) {
        return handleApiError(err);
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
        return handleApiError(err);
      }
    },
    create: async (name) => {
      try {
        const res = await api.post('/departments', { name });
        return res.data;
      } catch (err) {
        return handleApiError(err);
      }
    },
    delete: async (name) => {
      try {
        const res = await api.delete(`/departments/${encodeURIComponent(name)}`);
        return res.data;
      } catch (err) {
        return handleApiError(err);
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
        return handleApiError(err);
      }
    },
    changePassword: async (pwdData) => {
      try {
        const res = await api.post('/profile/change-password', pwdData);
        return res.data;
      } catch (err) {
        return handleApiError(err);
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
        return handleApiError(err);
      }
    },
    updateRole: async (email, role, department, oldHeadEmail = null, oldHeadStatus = null, oldHeadDetails = null) => {
      try {
        const res = await api.put('/users/role', { email, role, department, oldHeadEmail, oldHeadStatus, oldHeadDetails });
        return res.data;
      } catch (err) {
        return handleApiError(err);
      }
    }
  }
};
window.ApiService = ApiService;
