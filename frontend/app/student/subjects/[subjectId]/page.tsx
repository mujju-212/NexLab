'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Experiments are browsed inside the subjects accordion; redirect back there.
export default function SubjectDetailPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/student/subjects'); }, [router]);
  return null;
}
