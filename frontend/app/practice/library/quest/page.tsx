// /practice/library/quest — individual user quest/XP (nested under library)
'use client';
import IndividualShell from '@/components/layout/IndividualShell';
import QuestPage from '@/components/practice/QuestPage';

export default function IndividualQuestPage() {
  return (
    <IndividualShell activePage="quest">
      <QuestPage baseRoute="/practice/library" />
    </IndividualShell>
  );
}
