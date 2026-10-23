'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Server health is consolidated on /admin/monitoring (health, engine, config).
export default function ServerHealthRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/admin/monitoring'); }, [router]);
  return null;
}
