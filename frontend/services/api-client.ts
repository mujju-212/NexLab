import axios from 'axios';
import Cookies from 'js-cookie';

// Flask backend runs on :5000 with /api prefix already in .env.local
export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api',
  timeout: 15000, // fail fast instead of hanging pages when backend is slow/down
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — attach JWT token (with cookie & localStorage self-healing)
apiClient.interceptors.request.use((config) => {
  let token = Cookies.get('access_token');
  if (!token && typeof window !== 'undefined') {
    token = localStorage.getItem('access_token') || undefined;
    if (token) {
      Cookies.set('access_token', token, { expires: 7, path: '/', sameSite: 'lax' });
    }
  }
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — handle 401 (JWT expired or revoked)
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      Cookies.remove('access_token', { path: '/' });
      if (typeof window !== 'undefined') {
        localStorage.removeItem('access_token');
        import('@/store/auth-store')
          .then((m) => m.useAuthStore.getState().clearAuth())
          .catch(() => {});
        if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/register')) {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);
