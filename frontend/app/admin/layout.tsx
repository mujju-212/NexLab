'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';

/**
 * Admin layout — guards all /admin/* routes.
 * Only platform_admin is allowed; all other roles redirected to their dashboards.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    if (user?.role === 'institution_admin') {
      router.replace('/institution/dashboard');
    } else if (user?.role === 'student') {
      router.replace('/student/dashboard');
    } else if (user?.role === 'instructor') {
      router.replace('/instructor/dashboard');
    } else if (user?.role === 'free_user') {
      router.replace('/practice/dashboard');
    }
    // only platform_admin is allowed through
  }, [isAuthenticated, user, router]);

  if (!isAuthenticated) return null;
  if (user?.role !== 'platform_admin') return null;

  return <>{children}</>;
}
