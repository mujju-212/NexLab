'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { useAuthStore } from '@/store/auth-store';

/**
 * Admin layout — guards all /admin/* routes.
 * Only platform_admin is allowed; all other roles redirected to their dashboards.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, hasHydrated } = useAuthStore();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isReady = mounted && (hasHydrated || typeof window !== 'undefined');

  useEffect(() => {
    if (!isReady) return;

    const token = Cookies.get('access_token') || (typeof window !== 'undefined' ? localStorage.getItem('access_token') : null);

    if (!isAuthenticated && !token) {
      router.replace('/login');
      return;
    }
    if (user?.role === 'institution_admin') {
      router.replace('/institution/dashboard');
    } else if (user?.role === 'student') {
      router.replace('/student/dashboard');
    } else if (user?.role === 'instructor') {
      router.replace('/instructor/dashboard');
    } else if (user?.role === 'platform_user') {
      router.replace('/practice/dashboard');
    }
    // only platform_admin is allowed through
  }, [isReady, isAuthenticated, user, router]);

  if (!isReady) return null;
  if (!isAuthenticated && !Cookies.get('access_token')) return null;
  if (user?.role !== 'platform_admin') return null;

  return <>{children}</>;
}
