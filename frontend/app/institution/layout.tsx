'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';

/**
 * Institution layout — guards all /institution/* routes.
 * Waits for Zustand persist hydration before checking auth,
 * preventing a false redirect on first load.
 */
export default function InstitutionLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuthStore();
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);

  // Wait one tick for Zustand's persist middleware to rehydrate from localStorage
  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return; // don't redirect until store is hydrated

    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    if (user?.role === 'platform_admin') {
      router.replace('/admin/dashboard');
    } else if (user?.role === 'instructor') {
      router.replace('/instructor/dashboard');
    } else if (user?.role === 'student') {
      router.replace('/student/dashboard');
    } else if (user?.role === 'platform_user') {
      router.replace('/practice/dashboard');
    }
    // institution_admin is allowed through
  }, [hydrated, isAuthenticated, user, router]);

  // Show nothing until hydrated (avoid flash)
  if (!hydrated) return null;
  if (!isAuthenticated) return null;
  if (user?.role !== 'institution_admin') return null;

  return <>{children}</>;
}
