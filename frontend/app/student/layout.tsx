'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { useAuthStore } from '@/store/auth-store';
import { authService } from '@/services/auth.service';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, hasHydrated, setUser } = useAuthStore();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Ensure client has mounted and Zustand persist hydration has finished
  const isReady = mounted && (hasHydrated || typeof window !== 'undefined');

  useEffect(() => {
    if (!isReady) return;

    const token = Cookies.get('access_token') || (typeof window !== 'undefined' ? localStorage.getItem('access_token') : null);

    // If no token exists and store is not authenticated, redirect to login
    if (!token && !isAuthenticated) {
      router.replace('/login');
      return;
    }

    // Edge case: token exists but user state wasn't in localStorage — self-heal session
    if (token && !isAuthenticated) {
      authService.getMe()
        .then(u => {
          setUser(u);
          if (u.role !== 'student') {
            const routes: Record<string, string> = {
              platform_admin: '/admin/dashboard',
              institution_admin: '/institution/dashboard',
              instructor: '/instructor/dashboard',
              platform_user: '/practice/dashboard',
            };
            router.replace(routes[u.role] ?? '/login');
          }
        })
        .catch(() => {
          Cookies.remove('access_token', { path: '/' });
          if (typeof window !== 'undefined') localStorage.removeItem('access_token');
          router.replace('/login');
        });
      return;
    }

    // Role check
    if (user && user.role !== 'student') {
      const routes: Record<string, string> = {
        platform_admin: '/admin/dashboard',
        institution_admin: '/institution/dashboard',
        instructor: '/instructor/dashboard',
        platform_user: '/practice/dashboard',
      };
      router.replace(routes[user.role] ?? '/login');
    }
  }, [isReady, isAuthenticated, user, router, setUser]);

  if (!isReady) return null;
  if (!isAuthenticated && !Cookies.get('access_token')) return null;
  if (user && user.role !== 'student') return null;

  return <>{children}</>;
}

