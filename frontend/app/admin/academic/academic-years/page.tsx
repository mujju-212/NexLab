'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Academic structure is institution-scoped — each institution admin manages
// years/departments/batches/sections/subjects in their portal.
export default function AcademicYearsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/admin/institutions'); }, [router]);
  return null;
}
