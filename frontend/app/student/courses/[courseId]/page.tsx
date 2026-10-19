'use client';

import { useParams } from 'next/navigation';
import StudentShell from '@/components/layout/StudentShell';
import CourseDetailPage from '@/components/courses/CourseDetailPage';

export default function StudentCourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();

  return (
    <StudentShell activePage="Courses">
      <CourseDetailPage courseId={courseId} basePath="/student/courses" />
    </StudentShell>
  );
}
