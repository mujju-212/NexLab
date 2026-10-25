'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import StudentShell from '@/components/layout/StudentShell';
import { platformUserService, type PlatformCourse, type Progress } from '@/services/platform-user.service';
import {
  Loader2, FlaskConical, Zap, Code2, HelpCircle,
  ArrowRight, Sparkles
} from 'lucide-react';
import styles from './page.module.css';

const DIFF_CLS: Record<string, string> = {
  beginner: 'diffBeginner', intermediate: 'diffIntermediate', advanced: 'diffAdvanced',
};

const COURSE_COLORS = [
  'linear-gradient(135deg,#9333ea,#7c3aed)',
  'linear-gradient(135deg,#d946ef,#0284c7)',
  'linear-gradient(135deg,#f59e0b,#f2994a)',
  'linear-gradient(135deg,#ec4899,#d6409f)',
  'linear-gradient(135deg,#22c55e,#16a34a)',
];

export default function StudentCoursesPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<PlatformCourse[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      platformUserService.listCourses(),
      platformUserService.getProgress().catch(() => null),
    ])
      .then(([list, prog]) => { setCourses(list); setProgress(prog); })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load courses'))
      .finally(() => setLoading(false));
  }, []);

  const totalXP = progress?.total_xp ?? 0;
  const totalSolved = progress?.total_solved ?? 0;

  return (
    <StudentShell activePage="Courses" title="Free Courses & Virtual Labs"
      subtitle="Interactive simulation labs and practice courses — free forever, on top of your regular curriculum">

      {/* XP summary strip */}
      <div className={styles.xpStrip}>
        <div className={styles.xpItem}>
          <Sparkles size={16} />
          <span><strong>{courses.length}</strong> courses available</span>
        </div>
        <div className={styles.xpItem}>
          <FlaskConical size={16} />
          <span><strong>{totalSolved}</strong> experiments completed</span>
        </div>
        <div className={styles.xpItem}>
          <Zap size={16} />
          <span><strong>{totalXP}</strong> XP earned</span>
        </div>
      </div>

      {loading && <div className={styles.loadingBox}><Loader2 size={20} className={styles.spinner} /> Loading courses…</div>}
      {error && <div className={styles.errorBox}>⚠️ {error}</div>}
      {!loading && !error && courses.length === 0 && (
        <div className={styles.errorBox}>No courses published yet. Check back soon!</div>
      )}

      <div className={styles.grid}>
        {courses.map((course, idx) => {
          const cp = progress?.by_course?.[course.id];
          const solved = cp?.solved ?? 0;
          const pct = course.exercise_count
            ? Math.round((solved / course.exercise_count) * 100) : 0;
          return (
            <div key={course.id} className={styles.card}
              onClick={() => router.push(`/student/courses/${course.slug}`)}>
              <div className={styles.cardTop}>
                <div className={styles.cardIcon} style={{ background: COURSE_COLORS[idx % COURSE_COLORS.length] }}>
                  <FlaskConical size={22} strokeWidth={1.9} />
                </div>
                <span className={styles[DIFF_CLS[course.difficulty] ?? 'diffBeginner']}>
                  {course.difficulty}
                </span>
              </div>

              <h3 className={styles.cardTitle}>{course.title}</h3>
              <p className={styles.cardDesc}>{course.description}</p>

              <div className={styles.cardTags}>
                {(course.tags || []).slice(0, 3).map(t => (
                  <span key={t} className={styles.tag}>{t}</span>
                ))}
              </div>

              <div className={styles.cardMeta}>
                <span><FlaskConical size={12} /> {course.exercise_count} experiments</span>
                <span><Zap size={12} /> {cp?.xp ?? 0} XP earned</span>
              </div>

              {/* Progress bar */}
              <div className={styles.progressWrap}>
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${pct}%` }} />
                </div>
                <span className={styles.progressLabel}>
                  {solved}/{course.exercise_count} done
                </span>
              </div>

              <button className={styles.cardBtn}>
                {solved > 0 ? 'Continue Course' : 'Start Course'} <ArrowRight size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Bottom note */}
      {!loading && !error && courses.length > 0 && (
        <p className={styles.footNote}>
          <Code2 size={13} /> Coding &amp; MCQ courses run in the built-in editor ·
          <HelpCircle size={13} /> simulation labs open as interactive experiments —
          progress counts toward your XP and leaderboard.
        </p>
      )}
    </StudentShell>
  );
}
