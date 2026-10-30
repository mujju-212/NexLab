'use client';

import StudentShell from '@/components/layout/StudentShell';
import CompilerPlayground from '@/components/compiler/CompilerPlayground';

export default function StudentCompilerPage() {
  return <CompilerPlayground Shell={StudentShell} />;
}
