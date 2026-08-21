// /practice/library/study-plans/[slug]
'use client';
import { use } from 'react';
import IndividualShell from '@/components/layout/IndividualShell';
import StudyPlanDetailPage from '@/components/practice/StudyPlanDetailPage';

export default function IndividualStudyPlanPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return (
    <IndividualShell activePage="library">
      <StudyPlanDetailPage planSlug={slug} baseRoute="/practice/library" />
    </IndividualShell>
  );
}
