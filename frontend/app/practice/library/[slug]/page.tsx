// /practice/library/[slug] — Individual user Problem Solver
'use client';
import { use } from 'react';
import IndividualShell from '@/components/layout/IndividualShell';
import ProblemSolverPage from '@/components/practice/ProblemSolverPage';

export default function IndividualProblemSolverPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return (
    <IndividualShell activePage="library">
      <ProblemSolverPage slug={slug} baseRoute="/practice/library" />
    </IndividualShell>
  );
}
