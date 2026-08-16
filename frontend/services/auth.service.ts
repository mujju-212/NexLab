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

export type BackendRole = 'platform_admin' | 'institution_admin' | 'instructor' | 'student' | 'free_user';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: BackendRole;
  institution_id: string | null;
  roll_number?: string | null;
  profile_pic_url?: string | null;
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
    Cookies.set('access_token', data.token, { expires: 1 });
    return data;
  },

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const { data } = await apiClient.post<AuthResponse>('/auth/register', dto);
    Cookies.set('access_token', data.token, { expires: 1 });
    return data;
  },

  async logout(): Promise<void> {
    try { await apiClient.post('/auth/logout'); } catch { /* stateless logout ok */ }
    Cookies.remove('access_token');
  },

  async getMe(): Promise<AuthUser> {
    const { data } = await apiClient.get<{ user: AuthUser }>('/auth/me');
    return data.user;
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await apiClient.post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
  },
};
