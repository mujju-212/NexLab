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

// Request interceptor — attach JWT token (backend uses 'token' key from login response)
apiClient.interceptors.request.use((config) => {
  const token = Cookies.get('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — handle 401 (no refresh token in Flask-JWT-Extended by default)
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // JWT expired — clear cookie and redirect to login
      Cookies.remove('access_token');
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);
