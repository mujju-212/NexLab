// /practice/daily
'use client';
import IndividualShell from '@/components/layout/IndividualShell';
import DailyChallengePage from '@/components/practice/DailyChallengePage';

export default function IndividualDailyPage() {
  return (
    <IndividualShell activePage="daily">
      <DailyChallengePage baseRoute="/practice/library" />
    </IndividualShell>
  );
}
