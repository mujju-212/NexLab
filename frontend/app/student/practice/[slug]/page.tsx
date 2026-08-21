// /student/practice/[slug] — Institution student Problem Solver
'use client';
import { use } from 'react';
import StudentShell from '@/components/layout/StudentShell';
import ProblemSolverPage from '@/components/practice/ProblemSolverPage';

export default function StudentProblemSolverPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return (
    <StudentShell activePage="Practice Library">
      <ProblemSolverPage slug={slug} baseRoute="/student/practice" />
    </StudentShell>
  );
}
