'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import IndividualShell from '@/components/layout/IndividualShell';
import { useAuthStore } from '@/store/auth-store';
import { authService } from '@/services/auth.service';
import { freeService } from '@/services/free.service';
import Cookies from 'js-cookie';
import ExerciseWorkspace from '@/components/exercise/ExerciseWorkspace';

export default function ExercisePage() {
  const { courseId, exerciseId } = useParams<{ courseId: string; exerciseId: string }>();
  const router = useRouter();
  const { user, isAuthenticated, hasHydrated, setUser } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [courseTitle, setCourseTitle] = useState('Algorithm Basics');

  useEffect(() => {
    setMounted(true);
  }, []);

  const isReady = mounted && (hasHydrated || typeof window !== 'undefined');

  useEffect(() => {
    if (!isReady) return;

    const token = Cookies.get('access_token') || (typeof window !== 'undefined' ? localStorage.getItem('access_token') : null);

    if (!token && !isAuthenticated) {
      router.replace('/login');
      return;
    }

    if (token && !user) {
      authService.getMe()
        .then((u) => setUser(u))
        .catch(() => router.replace('/login'));
    }
  }, [isReady, isAuthenticated, user, router, setUser]);

  useEffect(() => {
    if (courseId) {
      freeService.getCourse(courseId)
        .then(d => {
          if (d.course?.title) setCourseTitle(d.course.title);
        })
        .catch(() => {});
    }
  }, [courseId]);

  if (!isReady) return null;

  return (
    <IndividualShell
      activePage="courses"
      breadcrumbs={[
        { label: 'Practice', href: '/practice' },
        { label: 'Courses', href: '/practice' },
        { label: courseTitle },
      ]}
    >
      <ExerciseWorkspace
        courseId={courseId}
        exerciseId={exerciseId}
        basePath="/practice"
      />
    </IndividualShell>
  );
}
