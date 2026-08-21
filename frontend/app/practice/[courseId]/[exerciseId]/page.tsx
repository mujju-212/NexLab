'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import IndividualShell from '@/components/layout/IndividualShell';
import { useAuthStore } from '@/store/auth-store';
import ExerciseView from './exercise-view';

export default function ExercisePage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();

  // Guard: only logged-in learners may see the practice exercise
  useEffect(() => {
    if (!isAuthenticated || !user) {
      router.replace('/login');
    }
  }, [isAuthenticated, user, router]);

  if (!isAuthenticated || !user) return null;

  return (
    <IndividualShell activePage="courses" title="Exercise" subtitle="Run, test and complete">
      <ExerciseView basePath="/practice" embedded />
    </IndividualShell>
  );
}
