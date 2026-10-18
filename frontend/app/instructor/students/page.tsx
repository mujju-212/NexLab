'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function InstructorStudentsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/instructor/analytics?tab=students');
  }, [router]);

  return null;
}
