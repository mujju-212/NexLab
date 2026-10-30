'use client';

import InstructorShell from '@/components/layout/InstructorShell';
import CompilerPlayground from '@/components/compiler/CompilerPlayground';

export default function InstructorCompilerPage() {
  return <CompilerPlayground Shell={InstructorShell} />;
}

