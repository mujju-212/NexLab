'use client';

import { useAuthStore } from '@/store/auth-store';
import { authService, LoginDto } from '@/services/auth.service';
import { useRouter } from 'next/navigation';

export function useAuth() {
  const { user, isAuthenticated, setUser, clearAuth } = useAuthStore();
  const router = useRouter();

  const login = async (dto: LoginDto) => {
    const data = await authService.login(dto);
    setUser(data.user);
    const roleRoutes = {
      ADMIN: '/admin/dashboard',
      INSTRUCTOR: '/instructor/dashboard',
      STUDENT: '/student/dashboard',
    };
    router.push(roleRoutes[data.user.role]);
  };

  const logout = async () => {
    await authService.logout();
    clearAuth();
    router.push('/login');
  };

  return { user, isAuthenticated, login, logout };
}
