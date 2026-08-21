// /student/practice/daily
'use client';
import StudentShell from '@/components/layout/StudentShell';
import DailyChallengePage from '@/components/practice/DailyChallengePage';

export default function StudentDailyPage() {
  return (
    <StudentShell activePage="Daily Challenge">
      <DailyChallengePage baseRoute="/student/practice" />
    </StudentShell>
  );
}
