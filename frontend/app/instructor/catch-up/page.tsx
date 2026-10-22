'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CatchUpRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/instructor/sessions');
  }, [router]);
  return null;
}
