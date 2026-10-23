'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// User management is search-driven on /admin/users (role + institution
// filters). These sub-routes were stubs — send admins there directly.
export default function UsersSubpageRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/admin/users'); }, [router]);
  return null;
}
