'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import IndividualShell from '@/components/layout/IndividualShell';
import { freeService, type FreeCourse, type Progress } from '@/services/free.service';
import { useAuthStore } from '@/store/auth-store';
import {
  Loader2, Zap, CheckCircle2, GraduationCap, Terminal,
  BookOpen, TrendingUp, ArrowRight, Target, Sparkles, Code2, Play, Library, Flame
} from 'lucide-react';
import styles from './page.module.css';

export default function IndividualDashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();

  const [progress, setProgress] = useState<Progress | null>(null);
  const [courses, setCourses]   = useState<FreeCourse[]>([]);
  const [loading, setLoading]   = useState(true);


  // Guard: only free_user (logged-in) may see the dashboard
  useEffect(() => {
    if (!isAuthenticated || !user) {
      router.replace('/login');
    }
  }, [isAuthenticated, user, router]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      freeService.getProgress(),
      freeService.listCourses(),
    ])
      .then(([prog, list]) => { setProgress(prog); setCourses(list); })
      .catch(() => { /* best-effort — render empty states */ })
      .finally(() => setLoading(false));
  }, [user]);

  if (!isAuthenticated || !user) return null;

  const firstName = user.full_name?.split(' ')[0] ?? 'there';
  const courseMap = Object.fromEntries(courses.map(c => [c.id, c]));

  const totalXp     = progress?.total_xp ?? 0;
  const totalSolved = progress?.total_solved ?? 0;
  const byCourse    = progress?.by_course ?? {};
  const coursesInProgress = Object.values(byCourse).filter(
    c => (c.solved ?? 0) > 0 || (c.attempted ?? 0) > 0
  ).length;

  // Course entries the learner has touched (solved/attempted), for the "Continue" section
  const courseEntries = Object.entries(byCourse)
    .filter(([, d]) => (d.solved ?? 0) > 0 || (d.attempted ?? 0) > 0)
    .sort((a, b) => (b[1].xp ?? 0) - (a[1].xp ?? 0));

  // Most recent submissions
  const recentRecords = (progress?.records ?? []).slice(0, 8);

  // Route helper for a course id (prefer slug)
  const courseHref = (courseId: string) => {
    const c = courseMap[courseId];
    return `/practice/${c?.slug || courseId}`;
  };

  return (
    <IndividualShell
      activePage="dashboard"
      title={`Welcome back, ${firstName} 👋`}
      subtitle="Keep the momentum going — pick up where you left off or explore something new."
    >
      {loading ? (
        <div className={styles.loadingBox}>
          <Loader2 size={22} className={styles.spinner} /> Loading your dashboard…
        </div>
      ) : (
        <>
          {/* ── Quick actions ─────────────────────────────────────────── */}
          <div className={styles.quickActions}>
            {courseEntries.length > 0 ? (
              <button
                className={`${styles.quickBtn} ${styles.quickBtnPrimary}`}
                onClick={() => router.push(courseHref(courseEntries[0][0]))}
              >
                <Play size={15} /> Continue learning
              </button>
            ) : (
              <button
                className={`${styles.quickBtn} ${styles.quickBtnPrimary}`}
                onClick={() => router.push('/practice')}
              >
                <Play size={15} /> Start learning
              </button>
            )}
            <button className={styles.quickBtn} onClick={() => router.push('/practice')}>
              <GraduationCap size={15} /> Browse courses
            </button>
            <button className={`${styles.quickBtn} ${styles.quickBtnPink}`} onClick={() => router.push('/practice/playground')}>
              <Terminal size={15} /> Open Playground
            </button>
            <button className={styles.quickBtn} style={{ color: '#7c3aed', borderColor: 'rgba(124,58,237,.25)', background: 'rgba(124,58,237,.07)' }} onClick={() => router.push('/practice/library')}>
              <Library size={15} /> Practice Library
            </button>
          </div>

          {/* ── Practice Library promo ────────────────────────────────── */}
          <div
            onClick={() => router.push('/practice/library')}
            style={{
              background: 'linear-gradient(135deg, rgba(124,58,237,.08), rgba(147,51,234,.05))',
              border: '1px solid rgba(124,58,237,.2)',
              borderRadius: '16px',
              padding: '1.1rem 1.3rem',
              marginBottom: '1.5rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap',
              transition: 'all .18s',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(124,58,237,.45)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(124,58,237,.2)')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ fontSize: '2.2rem', flexShrink: 0 }}>🏆</div>
              <div>
                <div style={{ fontSize: '.7rem', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '.2rem', fontFamily: 'Space Grotesk, sans-serif' }}>
                  Practice Library
                </div>
                <div style={{ fontSize: '.95rem', fontWeight: 800, color: '#201b2e', fontFamily: 'Space Grotesk, sans-serif', marginBottom: '.3rem' }}>
                  589 LeetCode & CodeChef Problems
                </div>
                <div style={{ fontSize: '.78rem', color: '#9891a6', fontWeight: 600 }}>
                  Arrays · Trees · DP · Graphs · SQL · and more — with XP, streaks & study plans
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', background: 'rgba(220,38,38,.08)', border: '1px solid rgba(220,38,38,.15)', borderRadius: '8px', padding: '.3rem .7rem', fontSize: '.75rem', fontWeight: 700, color: '#dc2626' }}>
                <Flame size={13} /> Daily Challenge
              </div>
              <div style={{ background: 'linear-gradient(135deg, #7c3aed, #9333ea)', color: '#fff', fontWeight: 800, fontSize: '.82rem', padding: '.42rem 1rem', borderRadius: '9px', whiteSpace: 'nowrap' }}>
                Open Library →
              </div>
            </div>
          </div>

          {/* ── Stat cards ────────────────────────────────────────────── */}
          <div className={styles.statCards}>
            <div className={styles.statCard}>
              <div className={styles.statTop}>
                <div className={styles.statIcon} style={{ background: 'rgba(245,158,11,.15)', color: '#f59e0b' }}>
                  <Zap size={17} />
                </div>
                <p className={styles.statLabel}>Total XP</p>
              </div>
              <span className={styles.statValue}>{totalXp}</span>
              <p className={styles.statCompare}>Experience earned across all courses</p>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statTop}>
                <div className={styles.statIcon} style={{ background: 'rgba(16,185,129,.15)', color: '#10b981' }}>
                  <CheckCircle2 size={17} />
                </div>
                <p className={styles.statLabel}>Problems Solved</p>
              </div>
              <span className={styles.statValue}>{totalSolved}</span>
              <p className={styles.statCompare}>Exercises completed successfully</p>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statTop}>
                <div className={styles.statIcon} style={{ background: 'rgba(124,58,237,.15)', color: '#7c3aed' }}>
                  <BookOpen size={17} />
                </div>
                <p className={styles.statLabel}>Courses in progress</p>
              </div>
              <span className={styles.statValue}>{coursesInProgress}</span>
              <p className={styles.statCompare}>{courses.length} courses available</p>
            </div>
          </div>

          {/* ── Your courses / Continue ───────────────────────────────── */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}><GraduationCap size={18} /> Your courses</h2>
              <button className={styles.sectionLink} onClick={() => router.push('/practice')}>Browse all</button>
            </div>

            {courseEntries.length > 0 ? (
              <div className={styles.courseGrid}>
                {courseEntries.map(([courseId, data]) => {
                  const course = courseMap[courseId];
                  const total  = course?.exercise_count || data.attempted || 1;
                  const pct    = Math.min(100, Math.round((data.solved / total) * 100));
                  return (
                    <div key={courseId} className={styles.courseCard} onClick={() => router.push(courseHref(courseId))}>
                      <div className={styles.courseCardTop}>
                        <h3 className={styles.courseName}>{course?.title ?? courseId}</h3>
                        <span className={styles.solvedBadge}>
                          <CheckCircle2 size={12} /> {data.solved}/{total}
                        </span>
                      </div>
                      {course?.description && <p className={styles.courseDesc}>{course.description}</p>}
                      <div className={styles.courseMeta}>
                        <span className={styles.courseXp}><Zap size={12} /> {data.xp} XP</span>
                        <span className={styles.courseXp} style={{ color: '#7c3aed' }}>
                          <Target size={12} /> {data.attempted} attempted
                        </span>
                      </div>
                      <div className={styles.progressWrap}>
                        <div className={styles.progressBar}>
                          <div className={styles.progressFill} style={{ width: `${pct}%` }} />
                        </div>
                        <span className={styles.progressPct}>{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}><Sparkles size={26} /></div>
                <h3 className={styles.emptyTitle}>No courses started yet</h3>
                <p className={styles.emptySub}>
                  Browse the free catalog and start solving exercises to earn XP and track your progress here.
                </p>
                <button className={styles.emptyBtn} onClick={() => router.push('/practice')}>
                  Browse courses →
                </button>
              </div>
            )}
          </section>

          {/* ── Recent activity ───────────────────────────────────────── */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}><TrendingUp size={18} /> Recent activity</h2>
              <button className={styles.sectionLink} onClick={() => router.push('/practice/progress')}>View progress</button>
            </div>

            {recentRecords.length > 0 ? (
              <div className={styles.activityList}>
                {recentRecords.map((rec, i) => {
                  const course = courseMap[rec.course_id];
                  return (
                    <div
                      key={`${rec.exercise_id}-${i}`}
                      className={styles.activityRow}
                      style={{ cursor: 'pointer' }}
                      onClick={() => router.push(courseHref(rec.course_id))}
                    >
                      <div className={styles.activityIcon}>
                        {rec.status === 'solved'
                          ? <CheckCircle2 size={16} style={{ color: '#10b981' }} />
                          : <Target size={16} style={{ color: '#f59e0b' }} />}
                      </div>
                      <div className={styles.activityInfo}>
                        <span className={styles.activityExercise}>
                          Exercise <code className={styles.exCode}>{rec.exercise_id}</code>
                        </span>
                        <span className={styles.activityCourse}>{course?.title ?? rec.course_id}</span>
                      </div>
                      <div className={styles.activityRight}>
                        <span className={`${styles.statusBadge} ${rec.status === 'solved' ? styles.statusSolved : styles.statusAttempted}`}>
                          {rec.status}
                        </span>
                        {rec.xp_earned > 0 && (
                          <span className={styles.xpPill}><Zap size={11} /> +{rec.xp_earned}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}><Code2 size={26} /></div>
                <h3 className={styles.emptyTitle}>No activity yet</h3>
                <p className={styles.emptySub}>
                  Solve your first exercise to see your recent submissions here.
                </p>
                <button className={styles.emptyBtn} onClick={() => router.push('/practice')}>
                  Find an exercise <ArrowRight size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </IndividualShell>
  );
}
