// /student/practice/study-plans/[slug]
'use client';
import { use } from 'react';
import StudentShell from '@/components/layout/StudentShell';
import StudyPlanDetailPage from '@/components/practice/StudyPlanDetailPage';

export default function StudentStudyPlanPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return (
    <StudentShell activePage="Study Plans">
      <StudyPlanDetailPage planSlug={slug} baseRoute="/student/practice" />
    </StudentShell>
  );
}
