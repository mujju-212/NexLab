'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import IndividualShell from '@/components/layout/IndividualShell';
import { freeService, type FreeCourse, type Progress } from '@/services/free.service';
import { useAuthStore } from '@/store/auth-store';
import styles from './progress.module.css';
import {
  Zap, BookOpen, Code2, Target, TrendingUp, CheckCircle2, RefreshCw,
} from 'lucide-react';

export default function ProgressPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();

  const [progress, setProgress] = useState<Progress | null>(null);
  const [courses,  setCourses]  = useState<FreeCourse[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!isAuthenticated || !user) { router.replace('/login'); }
  }, [isAuthenticated, user, router]);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    Promise.all([
      freeService.getProgress(),
      freeService.listCourses(),
    ]).then(([prog, crs]) => {
      setProgress(prog);
      setCourses(crs);
    }).finally(() => setLoading(false));
  }, [user]);

  if (!isAuthenticated || !user) return null;

  const courseMap = Object.fromEntries(courses.map(c => [c.id, c]));

  return (
    <IndividualShell
      activePage="progress"
      title="My Progress"
      subtitle="Track your XP, solved exercises, and course completion across NexLab."
    >
      {loading ? (
        <div className={styles.loading}>
          <RefreshCw size={22} className={styles.spinIcon} />
          <span>Loading your progress…</span>
        </div>
      ) : (
        <>
          {/* ── Stats row ─────────────────────────────────────────────── */}
          <div className={styles.statsRow}>
            <div className={styles.statChip}>
              <Zap size={15} style={{ color: '#f59e0b' }} />
              <strong>{progress?.total_xp ?? 0}</strong> XP Earned
            </div>
            <div className={styles.statChip}>
              <CheckCircle2 size={15} style={{ color: '#10b981' }} />
              <strong>{progress?.total_solved ?? 0}</strong> Solved
            </div>
            <div className={styles.statChip}>
              <Target size={15} style={{ color: '#7c3aed' }} />
              <strong>
                {progress
                  ? Object.values(progress.by_course).reduce((a, c) => a + c.attempted, 0)
                  : 0}
              </strong>{' '}
              Attempted
            </div>
          </div>

          {/* ── Course Progress ───────────────────────────────────────── */}
          {progress && Object.keys(progress.by_course).length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <BookOpen size={16} className={styles.sectionIcon} />
                <h2 className={styles.sectionTitle}>Course Progress</h2>
              </div>
              <div className={styles.courseGrid}>
                {Object.entries(progress.by_course).map(([courseId, data]) => {
                  const course = courseMap[courseId];
                  const total  = course?.exercise_count || data.attempted || 1;
                  const pct    = Math.min(100, Math.round((data.solved / total) * 100));
                  return (
                    <div
                      key={courseId}
                      className={styles.courseCard}
                      onClick={() => course && router.push(`/practice/${course.slug || course.id}`)}
                    >
                      <div className={styles.courseCardTop}>
                        <div className={styles.courseInfo}>
                          <h3 className={styles.courseName}>{course?.title ?? courseId}</h3>
                          <span className={styles.courseXp}>
                            <Zap size={12} /> {data.xp} XP
                          </span>
                        </div>
                        <div className={styles.solvedBadge}>
                          <CheckCircle2 size={13} />
                          {data.solved}/{total}
                        </div>
                      </div>
                      <div className={styles.progressBarWrap}>
                        <div className={styles.progressBar}>
                          <div className={styles.progressFill} style={{ width: `${pct}%` }} />
                        </div>
                        <span className={styles.progressPct}>{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Recent Activity ───────────────────────────────────────── */}
          {progress && progress.records.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <TrendingUp size={16} className={styles.sectionIcon} />
                <h2 className={styles.sectionTitle}>Recent Activity</h2>
              </div>
              <div className={styles.activityList}>
                {progress.records.slice(0, 10).map((rec, i) => {
                  const course = courseMap[rec.course_id];
                  return (
                    <div key={`${rec.exercise_id}-${i}`} className={styles.activityRow}>
                      <div className={styles.activityIcon}>
                        {rec.status === 'solved' ? (
                          <CheckCircle2 size={16} style={{ color: '#10b981' }} />
                        ) : (
                          <Target size={16} style={{ color: '#f59e0b' }} />
                        )}
                      </div>
                      <div className={styles.activityInfo}>
                        <span className={styles.activityExercise}>
                          Exercise <code className={styles.exCode}>{rec.exercise_id}</code>
                        </span>
                        <span className={styles.activityCourse}>
                          {course?.title ?? rec.course_id}
                        </span>
                      </div>
                      <div className={styles.activityRight}>
                        <span className={`${styles.statusBadge} ${rec.status === 'solved' ? styles.statusSolved : styles.statusAttempted}`}>
                          {rec.status}
                        </span>
                        {rec.xp_earned > 0 && (
                          <span className={styles.xpPill}>
                            <Zap size={11} /> +{rec.xp_earned}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Empty state ───────────────────────────────────────────── */}
          {progress &&
            Object.keys(progress.by_course).length === 0 &&
            progress.records.length === 0 && (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>
                  <Code2 size={28} />
                </div>
                <h3 className={styles.emptyTitle}>No activity yet</h3>
                <p className={styles.emptySub}>
                  Start solving exercises to track your progress and earn XP!
                </p>
                <button
                  className={styles.registerBtn}
                  onClick={() => router.push('/practice')}
                >
                  Browse Courses →
                </button>
              </div>
            )}
        </>
      )}
    </IndividualShell>
  );
}
