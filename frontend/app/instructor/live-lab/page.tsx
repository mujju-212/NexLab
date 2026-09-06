'use client';

/**
 * Live Lab Control has been merged into the unified Conductor
 * (`/instructor/sessions/[sessionId]/live`). This page now just routes the
 * instructor to the right place:
 *   - if a session is active → open that session's Conductor
 *   - else → the sessions list to pick/start one
 * Kept so old links, bookmarks, and the sidebar nav item still resolve.
 */
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import { sessionService } from '@/services/session.service';

function LiveLabRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const explicit = searchParams.get('session');
    if (explicit) {
      router.replace(`/instructor/sessions/${explicit}/live`);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await sessionService.list();
        const list = (res.sessions ?? []) as { id: string; status: string }[];
        const active = list.find(s => s.status === 'active');
        if (cancelled) return;
        router.replace(active ? `/instructor/sessions/${active.id}/live` : '/instructor/sessions');
      } catch {
        if (!cancelled) router.replace('/instructor/sessions');
      }
    })();
    return () => { cancelled = true; };
  }, [router, searchParams]);

  return (
    <InstructorShell activePage="Live Conductor">
      <div style={{ padding: 48, textAlign: 'center', color: '#9891a6' }}>
        <Loader2 size={22} className="animate-spin" style={{ margin: '0 auto 12px' }} />
        Opening the live Conductor…
      </div>
    </InstructorShell>
  );
}

export default function InstructorLiveLabPage() {
  return (
    <Suspense fallback={null}>
      <LiveLabRedirect />
    </Suspense>
  );
}
