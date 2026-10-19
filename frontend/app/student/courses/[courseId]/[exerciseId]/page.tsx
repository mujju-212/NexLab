'use client';

import { useParams } from 'next/navigation';
import StudentShell from '@/components/layout/StudentShell';
import ExerciseWorkspace from '@/components/exercise/ExerciseWorkspace';

export default function StudentExercisePage() {
  const { courseId, exerciseId } = useParams<{ courseId: string; exerciseId: string }>();

  return (
    <StudentShell activePage="Courses">
      <ExerciseWorkspace
        courseId={courseId}
        exerciseId={exerciseId}
        basePath="/student/courses"
      />
    </StudentShell>
  );
}
