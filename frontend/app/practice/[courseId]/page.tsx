'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import IndividualShell from '@/components/layout/IndividualShell';
import { freeService, type FreeCourse, type FreeExercise } from '@/services/free.service';
import { useAuthStore } from '@/store/auth-store';
import styles from './course.module.css';
import {
  Code2, HelpCircle, CheckCircle2, Trophy, Zap,
  RefreshCw, FlaskConical
} from 'lucide-react';

const DIFF_MAP: Record<string, string> = {
  easy:   'diffEasy',
  medium: 'diffMedium',
  hard:   'diffHard',
};

export default function CoursePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();

  const [course,    setCourse]    = useState<FreeCourse | null>(null);
  const [exercises, setExercises] = useState<FreeExercise[]>([]);
  const [solvedIds, setSolvedIds] = useState<Set<string>>(new Set());
  const [loading,   setLoading]   = useState(true);

  // Guard: only logged-in users may see this page
  useEffect(() => {
    if (!isAuthenticated || !user) {
      router.replace('/login');
    }
  }, [isAuthenticated, user, router]);

  const load = useCallback(async () => {
    try {
      const { course: c, exercises: exs } = await freeService.getCourse(courseId);
      setCourse(c);
      setExercises(exs);
      if (user) {
        const prog = await freeService.getCourseProgress(c.id);
        setSolvedIds(new Set(prog.solved_ids ?? []));
      }
    } finally {
      setLoading(false);
    }
  }, [courseId, user]);

  useEffect(() => {
    if (!user) return;
    load();
  }, [load, user]);

  if (!isAuthenticated || !user) return null;

  const solvedCount = exercises.filter(e => solvedIds.has(e.id)).length;
  const totalXP     = exercises.reduce((a, e) => a + e.xp_reward, 0);
  const earnedXP    = exercises.filter(e => solvedIds.has(e.id)).reduce((a, e) => a + e.xp_reward, 0);
  const pct = exercises.length ? Math.round((solvedCount / exercises.length) * 100) : 0;

  const pageTitle = loading ? 'Loading course…' : (course?.title || 'Course');
  const pageSubtitle = course?.description || 'Work through the exercises to earn XP and track your progress.';

  return (
    <IndividualShell
      activePage="courses"
      title={pageTitle}
      subtitle={pageSubtitle}
    >
      {loading ? (
        <div className={styles.loading}>
          <RefreshCw size={24} className={styles.spinIcon} />
          <span>Loading course…</span>
        </div>
      ) : (
        <>
          {/* Course Hero */}
          {course && (
            <div className={styles.courseHero}>
              <div className={styles.heroLeft}>
                <h1 className={styles.courseTitle}>{course.title}</h1>
                <p className={styles.courseDesc}>{course.description}</p>
                <div className={styles.courseMeta}>
                  <span className={styles.metaChip}>{course.difficulty}</span>
                  <span className={styles.metaChip}><Code2 size={13} />{exercises.length} exercises</span>
                  <span className={styles.metaChip}><Zap size={13} />{totalXP} XP total</span>
                  {(course.tags || []).slice(0, 3).map(t => (
                    <span key={t} className={styles.tagChip}>{t}</span>
                  ))}
                </div>
              </div>

              {/* Progress Card */}
              <div className={styles.progressCard}>
                <div className={styles.progressHead}>
                  <Trophy size={14} color="#b45309" /> Your Progress
                </div>
                {user ? (
                  <>
                    <div className={styles.progressNums}>
                      <span className={styles.progressBig}>{solvedCount}</span>
                      <span className={styles.progressOf}>/ {exercises.length} solved</span>
                    </div>
                    <div className={styles.progressBar}>
                      <div className={styles.progressFill} style={{ width: `${pct}%` }} />
                    </div>
                    <div className={styles.progressXp}>
                      <Zap size={13} />{earnedXP} / {totalXP} XP
                    </div>
                  </>
                ) : (
                  <div className={styles.progressLocked}>
                    <p>Sign in to track progress</p>
                    <button onClick={() => router.push('/register')}>Get Started Free</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Free-tier banner */}
          <div className={styles.freeBanner}>
            <p className={styles.freeBannerTitle}>🎓 Free &amp; Open</p>
            <p className={styles.freeBannerSub}>All courses are free forever.</p>
          </div>

          {/* Exercise List */}
          <p className={styles.listTitle}>Exercises — {exercises.length} total</p>
          <div className={styles.exerciseList}>
            {exercises.map((ex, i) => {
              const solved = solvedIds.has(ex.id);
              return (
                <div key={ex.id} className={`${styles.exCard} ${solved ? styles.exSolved : ''}`}
                  onClick={() => router.push(`/practice/${courseId}/${ex.id}`)}>
                  <div className={styles.exLeft}>
                    <div className={styles.exNum}>{i + 1}</div>
                    <div style={{ minWidth: 0 }}>
                      <p className={styles.exTitle}>{ex.title}</p>
                      <div className={styles.exMeta}>
                        <span className={styles.exType}>
                          {ex.exercise_type === 'mcq'
                            ? <HelpCircle size={12} />
                            : ex.exercise_type === 'simulation'
                              ? <FlaskConical size={12} />
                              : <Code2 size={12} />}
                          {ex.exercise_type === 'mcq' ? 'MCQ'
                            : ex.exercise_type === 'simulation' ? 'Simulation'
                              : 'Coding'}
                        </span>
                        <span className={styles[DIFF_MAP[ex.difficulty] ?? 'diffEasy']}>
                          {ex.difficulty}
                        </span>
                        {(ex.allowed_languages || []).slice(0, 2).map(l => (
                          <span key={l} className={styles.langTag}>{l}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className={styles.exRight}>
                    <span className={styles.xpPill}><Zap size={11} /> {ex.xp_reward} XP</span>
                    {solved
                      ? <CheckCircle2 size={18} color="#0f8a3f" />
                      : <span className={styles.exArrow}>›</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </IndividualShell>
  );
}
