import { apiClient } from './api-client';
import Cookies from 'js-cookie';

export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterDto {
  full_name: string;
  email: string;
  password: string;
  phone?: string;
  // Institution self-registration (role='institution_admin' + institution_name)
  role?: 'institution_admin';
  first_name?: string;
  last_name?: string;
  staff_id?: string;
  institution_name?: string;
  institution_type?: string;
  institution_code?: string;
  institution_phone?: string;
  address?: string;
  website?: string;
}

export type OtpPurpose = 'individual_register' | 'institution_register';

export type BackendRole = 'platform_admin' | 'institution_admin' | 'instructor' | 'student' | 'platform_user';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  first_name?: string | null;
  last_name?: string | null;
  role: BackendRole;
  institution_id: string | null;
  institution_name?: string | null;
  institution_code?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  department_code?: string | null;
  section_name?: string | null;
  section_code?: string | null;
  batch_name?: string | null;
  program?: string | null;
  roll_number?: string | null;
  staff_id?: string | null;
  year_of_study?: number | null;
  semester?: number | null;
  phone?: string | null;
  location?: string | null;
  bio?: string | null;
  profile_pic_url?: string | null;
  timezone?: string | null;
  language?: string | null;
  two_factor_enabled?: boolean;
  created_at?: string | null;
  must_change_password?: boolean;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
  message?: string;
}

export const authService = {
  // OTP verification is required before `register()` will succeed — call
  // sendOtp() then verifyOtp() with the same (email, purpose) pair first.
  // This flow is ONLY for self-registration (individual or institution
  // signup); accounts created by an admin never need OTP.
  async sendOtp(email: string, purpose: OtpPurpose): Promise<{ message: string }> {
    const { data } = await apiClient.post('/auth/otp/send', { email, purpose });
    return data;
  },

  async verifyOtp(email: string, otp: string, purpose: OtpPurpose): Promise<{ verified: boolean; message: string }> {
    const { data } = await apiClient.post('/auth/otp/verify', { email, otp, purpose });
    return data;
  },

  async login(dto: LoginDto): Promise<AuthResponse> {
    const { data } = await apiClient.post<AuthResponse>('/auth/login', dto);
    Cookies.set('access_token', data.token, { expires: 7, path: '/', sameSite: 'lax' });
    if (typeof window !== 'undefined') {
      localStorage.setItem('access_token', data.token);
    }
    return data;
  },

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const { data } = await apiClient.post<AuthResponse>('/auth/register', dto);
    Cookies.set('access_token', data.token, { expires: 7, path: '/', sameSite: 'lax' });
    if (typeof window !== 'undefined') {
      localStorage.setItem('access_token', data.token);
    }
    return data;
  },

  async logout(): Promise<void> {
    try { await apiClient.post('/auth/logout'); } catch { /* stateless logout ok */ }
    Cookies.remove('access_token', { path: '/' });
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
    }
  },

  async getMe(): Promise<AuthUser> {
    const { data } = await apiClient.get<{ user: AuthUser }>('/auth/me');
    return data.user;
  },

  async updateProfile(updates: { full_name?: string; email?: string; first_name?: string; last_name?: string; phone?: string; bio?: string; location?: string; timezone?: string; language?: string }): Promise<AuthUser> {
    const { data } = await apiClient.patch<{ user: AuthUser; message?: string }>('/auth/profile', updates);
    return data.user;
  },

  async toggle2FA(): Promise<{ message: string; two_factor_enabled: boolean }> {
    const { data } = await apiClient.post<{ message: string; two_factor_enabled: boolean }>('/auth/2fa/toggle');
    return data;
  },

  async exportData(): Promise<any> {
    const { data } = await apiClient.get('/auth/export-data');
    return data;
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<{ token?: string; user?: AuthUser }> {
    const { data } = await apiClient.post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
    // A fresh token is returned when the old one carried the
    // must_change_password claim — swap it in so the session continues.
    if (data.token) {
      Cookies.set('access_token', data.token, { expires: 7, path: '/', sameSite: 'lax' });
      if (typeof window !== 'undefined') {
        localStorage.setItem('access_token', data.token);
      }
    }
    return data;
  },
};
