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
}

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
