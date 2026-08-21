// /student/practice — Institution student Practice Library
'use client';
import { Suspense } from 'react';
import StudentShell from '@/components/layout/StudentShell';
import PracticeLibraryPage from '@/components/practice/PracticeLibraryPage';

// Required because PracticeLibraryPage uses useSearchParams()
export const dynamic = 'force-dynamic';

export default function StudentPracticePage() {
  return (
    <StudentShell activePage="Practice Library">
      <Suspense fallback={<div style={{ padding: '2rem', color: '#9891a6' }}>Loading…</div>}>
        <PracticeLibraryPage baseRoute="/student/practice" />
      </Suspense>
    </StudentShell>
  );
}
