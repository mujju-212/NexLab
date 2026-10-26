'use client';

import { useParams, useRouter } from 'next/navigation';
import IndividualShell from '@/components/layout/IndividualShell';
import CourseDetailPage from '@/components/courses/CourseDetailPage';
import { useAuthStore } from '@/store/auth-store';
import { useEffect, useState } from 'react';
import Cookies from 'js-cookie';
import { authService } from '@/services/auth.service';
import { platformUserService } from '@/services/platform-user.service';

export default function CoursePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();
  const { user, isAuthenticated, hasHydrated, setUser } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isReady = mounted && (hasHydrated || typeof window !== 'undefined');

  useEffect(() => {
    if (!isReady) return;

    const token = Cookies.get('access_token') || (typeof window !== 'undefined' ? localStorage.getItem('access_token') : null);

    if (!token && !isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '/practice')}`);
      return;
    }

    if (token && !user) {
      authService.getMe()
        .then((u) => setUser(u))
        .catch(() => router.replace(`/login?next=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '/practice')}`));
    }
  }, [isReady, isAuthenticated, user, router, setUser]);

  const [courseTitle, setCourseTitle] = useState<string>('');

  useEffect(() => {
    if (courseId) {
      platformUserService.getCourse(courseId)
        .then((d: { course?: { title?: string } }) => setCourseTitle(d.course?.title || ''))
        .catch(() => setCourseTitle(courseId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())));
    }
  }, [courseId]);

  if (!isReady) {
    return (
      <IndividualShell
        activePage="courses"
        breadcrumbs={[
          { label: 'Practice', href: '/practice' },
          { label: 'Courses', href: '/practice' },
        ]}
      >
        <div style={{ minHeight: '360px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
          Loading course…
        </div>
      </IndividualShell>
    );
  }

  return (
    <IndividualShell
      activePage="courses"
      breadcrumbs={[
        { label: 'Practice', href: '/practice' },
        { label: 'Courses', href: '/practice' },
        { label: courseTitle || courseId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) },
      ]}
    >
      <CourseDetailPage courseId={courseId} basePath="/practice" />
    </IndividualShell>
  );
}
