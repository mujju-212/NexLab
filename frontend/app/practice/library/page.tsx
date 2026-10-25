// /practice/library — Individual platform user Practice Library
'use client';
import { Suspense } from 'react';
import IndividualShell from '@/components/layout/IndividualShell';
import PracticeLibraryPage from '@/components/practice/PracticeLibraryPage';

// Required because PracticeLibraryPage uses useSearchParams()
export const dynamic = 'force-dynamic';

export default function IndividualPracticePage() {
  return (
    <IndividualShell activePage="library">
      <Suspense fallback={<div style={{ padding: '2rem', color: '#9891a6' }}>Loading…</div>}>
        <PracticeLibraryPage baseRoute="/practice/library" />
      </Suspense>
    </IndividualShell>
  );
}
