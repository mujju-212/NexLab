'use client';

import StudentShell from '@/components/layout/StudentShell';
import ExerciseView from '@/app/practice/[courseId]/[exerciseId]/exercise-view';
import styles from './exercise-embed.module.css';

export default function StudentExercisePage() {
  return (
    <StudentShell activePage="Courses" title="Experiment" subtitle="Run, test and complete">
      <div className={styles.embedWrap}>
        <ExerciseView basePath="/student/courses" embedded />
      </div>
    </StudentShell>
  );
}
