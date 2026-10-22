'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function InstructorProfileRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/instructor/settings');
  }, [router]);
  return null;
}
