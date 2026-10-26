'use client';

import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { queryClient } from '@/lib/query-client';
import MaintenanceBanner from '@/components/shared/MaintenanceBanner';

// Dev-only: some environments (e.g. headless Chromium in POSIX-locale
// sandboxes) report a non-BCP-47 navigator.language such as "en-US@posix".
// @tanstack/query-devtools calls `new Intl.Locale(navigator.language)` at
// chunk-evaluation time with no guard, which throws an uncaught RangeError.
// Normalize the tag before the devtools chunk loads (dev-only, no-op in prod).
function normalizeBrowserLocaleForDevtools() {
  if (typeof navigator === 'undefined') return;
  const raw = navigator.language || '';
  try {
    new Intl.Locale(raw);
    return; // already a valid BCP-47 tag
  } catch {
    /* falls through to patch */
  }
  const safe = raw.split('@')[0] || 'en-US';
  try {
    Object.defineProperty(navigator, 'language', {
      get: () => safe,
      configurable: true,
    });
  } catch {
    /* navigator.language not configurable in this browser — nothing to do */
  }
}

// Dev-only React Query devtools, code-split so it never ships to prod.
const ReactQueryDevtools = dynamic(
  () => {
    normalizeBrowserLocaleForDevtools();
    return import('@tanstack/react-query-devtools').then(
      (m) => m.ReactQueryDevtools
    );
  },
  { ssr: false }
);

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Suppress unhandled rejections from third-party browser extensions (e.g. MetaMask inpage.js)
    // so Next.js's dev overlay doesn't crash trying to fetch non-existent stack frames.
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason?.message || String(event.reason || '');
      const stack = event.reason?.stack || '';
      if (
        reason.includes('MetaMask') ||
        reason.includes('inpage.js') ||
        stack.includes('inpage.js')
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <MaintenanceBanner />
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      )}
    </QueryClientProvider>
  );
}

