'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import StudentShell from '@/components/layout/StudentShell';
import { freeService, type FreeCourse, type FreeExercise } from '@/services/free.service';
import { useAuthStore } from '@/store/auth-store';
import {
  Loader2, FlaskConical, Code2, HelpCircle, BookOpen,
  CheckCircle2, Zap, ArrowRight, ChevronLeft
} from 'lucide-react';
import styles from './course.module.css';

const TYPE_ICON = {
  coding: Code2,
  mcq: HelpCircle,
  reading: BookOpen,
  simulation: FlaskConical,
};

const DIFF_CLS: Record<string, string> = {
  easy: 'diffEasy', medium: 'diffMedium', hard: 'diffHard',
};

export default function StudentCourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();
  const { user } = useAuthStore();

  const [course, setCourse] = useState<FreeCourse | null>(null);
  const [exercises, setExercises] = useState<FreeExercise[]>([]);
  const [solvedIds, setSolvedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { course: c, exercises: exs } = await freeService.getCourse(courseId);
        setCourse(c);
        setExercises(exs);
        if (user) {
          try {
            const prog = await freeService.getCourseProgress(c.id);
            setSolvedIds(prog.solved_ids ?? []);
          } catch { /* progress is best-effort */ }
        }
      } catch {
        router.push('/student/courses');
        return;
      }
      setLoading(false);
    })();
  }, [courseId, router, user]);

  if (loading || !course) return (
    <StudentShell activePage="Courses" title="Course" subtitle="Loading…">
      <div className={styles.loadingBox}>
        <Loader2 size={20} className={styles.spinner} /> Loading course…
      </div>
    </StudentShell>
  );

  const solvedCount = exercises.filter(e => solvedIds.includes(e.id)).length;
  const pct = exercises.length ? Math.round((solvedCount / exercises.length) * 100) : 0;

  return (
    <StudentShell activePage="Courses" title={course.title}
      subtitle={`${exercises.length} experiments · ${course.difficulty}`}>

      <button className={styles.backBtn} onClick={() => router.push('/student/courses')}>
        <ChevronLeft size={14} /> All Courses
      </button>

      {/* Hero card */}
      <div className={styles.hero}>
        <div className={styles.heroLeft}>
          <h2 className={styles.heroTitle}>{course.title}</h2>
          <p className={styles.heroDesc}>{course.description}</p>
          <div className={styles.heroTags}>
            {(course.tags || []).map(t => <span key={t} className={styles.tag}>{t}</span>)}
            <span className={styles.tag}><Zap size={11} /> {exercises.reduce((s, e) => s + e.xp_reward, 0)} XP total</span>
          </div>
        </div>
        <div className={styles.heroRight}>
          <div className={styles.ring}>
            <svg viewBox="0 0 36 36">
              <path className={styles.ringBg}
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              <path className={styles.ringFill} strokeDasharray={`${pct}, 100`}
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            </svg>
            <span className={styles.ringLabel}>{pct}%</span>
          </div>
          <span className={styles.heroStat}>{solvedCount}/{exercises.length} completed</span>
        </div>
      </div>

      {/* Exercise list */}
      <div className={styles.listHeader}>
        <FlaskConical size={15} /> Experiments
      </div>
      <div className={styles.exList}>
        {exercises.map((ex, i) => {
          const Icon = TYPE_ICON[ex.exercise_type] ?? Code2;
          const done = solvedIds.includes(ex.id);
          return (
            <div key={ex.id} className={`${styles.exRow} ${done ? styles.exRowDone : ''}`}
              onClick={() => router.push(`/student/courses/${courseId}/${ex.id}`)}>
              <span className={styles.exNum}>{String(i + 1).padStart(2, '0')}</span>
              <span className={styles.exIcon}><Icon size={15} /></span>
              <div className={styles.exInfo}>
                <span className={styles.exTitle}>{ex.title}</span>
                <span className={styles.exSub}>
                  {ex.exercise_type === 'simulation' ? 'Interactive lab' :
                   ex.exercise_type === 'mcq' ? 'Quiz question' :
                   ex.exercise_type === 'reading' ? 'Reading' : 'Coding challenge'}
                </span>
              </div>
              <span className={styles[DIFF_CLS[ex.difficulty] ?? 'diffEasy']}>{ex.difficulty}</span>
              <span className={styles.exXp}><Zap size={11} /> +{ex.xp_reward}</span>
              {done
                ? <CheckCircle2 size={17} className={styles.exDone} />
                : <ArrowRight size={15} className={styles.exArrow} />}
            </div>
          );
        })}
      </div>
    </StudentShell>
  );
}
