'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Cross-institution academic comparisons live in Platform Analytics, and the
// per-tenant academic structure is managed in each institution's own portal —
// this route now forwards to the analytics hub (Phase 2 IA cleanup).
export default function AcademicRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/admin/analytics'); }, [router]);
  return null;
}
