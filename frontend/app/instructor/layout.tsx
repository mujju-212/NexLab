'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';

export default function InstructorLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuthStore();
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { setHydrated(true); }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!isAuthenticated) { router.replace('/login'); return; }
    if (user?.role !== 'instructor') {
      const routes: Record<string, string> = {
        platform_admin: '/admin/dashboard',
        institution_admin: '/institution/dashboard',
        student: '/student/dashboard',
        free_user: '/practice',
      };
      router.replace(routes[user?.role ?? ''] ?? '/login');
    }
  }, [hydrated, isAuthenticated, user, router]);

  if (!hydrated) return null;
  if (!isAuthenticated || user?.role !== 'instructor') return null;
  return <>{children}</>;
}
