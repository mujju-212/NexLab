'use client';

import { useEffect, useState } from 'react';
import LoginPageClient from './LoginPageClient';

export default function LoginPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return <LoginPageClient />;
}
