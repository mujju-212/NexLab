import { apiClient } from './api-client';
import Cookies from 'js-cookie';

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: 'ADMIN' | 'INSTRUCTOR' | 'STUDENT';
  };
}

export const authService = {
  async login(dto: LoginDto): Promise<AuthResponse> {
    const { data } = await apiClient.post<AuthResponse>('/auth/login', dto);
    Cookies.set('access_token', data.accessToken, { expires: 1 / 96 }); // 15 min
    Cookies.set('refresh_token', data.refreshToken, { expires: 7 });
    return data;
  },

  async logout(): Promise<void> {
    await apiClient.post('/auth/logout');
    Cookies.remove('access_token');
    Cookies.remove('refresh_token');
  },

  async getMe() {
    const { data } = await apiClient.get('/auth/me');
    return data;
  },

  async refreshTokens(refreshToken: string): Promise<Pick<AuthResponse, 'accessToken' | 'refreshToken'>> {
    const { data } = await apiClient.post('/auth/refresh', { refreshToken });
    return data;
  },
};
