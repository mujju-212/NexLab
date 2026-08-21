// /student/practice/quest
'use client';
import StudentShell from '@/components/layout/StudentShell';
import QuestPage from '@/components/practice/QuestPage';

export default function StudentQuestPage() {
  return (
    <StudentShell activePage="Quest">
      <QuestPage baseRoute="/student/practice" />
    </StudentShell>
  );
}
