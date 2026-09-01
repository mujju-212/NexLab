'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Bulk user import is institution-level (each institution admin imports via
// CSV with per-row errors). Platform admins use the users search instead.
export default function UsersImportRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/admin/users'); }, [router]);
  return null;
}
