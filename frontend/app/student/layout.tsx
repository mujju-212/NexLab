'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) { router.replace('/login'); return; }
    if (user?.role !== 'student') {
      const routes: Record<string, string> = {
        platform_admin: '/admin/dashboard', institution_admin: '/institution/dashboard',
        instructor: '/instructor/dashboard',
      };
      router.replace(routes[user?.role ?? ''] ?? '/login');
    }
  }, [isAuthenticated, user, router]);

  if (!isAuthenticated || user?.role !== 'student') return null;
  return <>{children}</>;
}
