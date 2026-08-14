'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Faculty allocation (subject ↔ instructor ↔ section) is institution-level
// and lives in each institution admin's portal. Platform admin no longer
// manages assignments directly — redirect to the institutions view.
export default function AssignmentsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/institutions');
  }, [router]);

  return null;
}
