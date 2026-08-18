'use client';

import { useAuthStore } from '@/store/auth-store';
import { authService, LoginDto } from '@/services/auth.service';
import { useRouter } from 'next/navigation';

// Role → dashboard route mapping (matches backend role strings exactly)
const ROLE_ROUTES: Record<string, string> = {
  platform_admin:    '/admin/dashboard',
  institution_admin: '/institution/dashboard',
  instructor:        '/instructor/dashboard',
  student:           '/student/dashboard',
  free_user:         '/practice/dashboard',
};

export function useAuth() {
  const { user, isAuthenticated, setUser, clearAuth } = useAuthStore();
  const router = useRouter();

  const login = async (dto: LoginDto) => {
    const data = await authService.login(dto);
    setUser(data.user);
    // Route based on actual backend role string
    const route = ROLE_ROUTES[data.user.role] ?? '/practice/dashboard';
    router.push(route);
  };

  const logout = async () => {
    await authService.logout();
    clearAuth();
    router.push('/login');
  };

  return { user, isAuthenticated, login, logout };
}
