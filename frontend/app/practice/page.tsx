'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import IndividualShell from '@/components/layout/IndividualShell';
import { freeService, type FreeCourse } from '@/services/free.service';
import styles from './practice.content.module.css';
import {
  BookOpen, Code2, Trophy, Search, RefreshCw, ChevronRight,
} from 'lucide-react';

const DIFF_MAP = {
  beginner:     { label: 'Beginner',     cls: 'diffBeginner'     },
  intermediate: { label: 'Intermediate', cls: 'diffIntermediate' },
  advanced:     { label: 'Advanced',     cls: 'diffAdvanced'     },
} as const;

const LANG_ICONS: Record<string, string> = {
  python: '🐍', cpp: '⚙️', java: '☕', javascript: '🟨', default: '💻',
};

export default function PracticePage() {
  const router = useRouter();

  const [courses, setCourses] = useState<FreeCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [diffFilter, setDiffFilter] = useState<string>('all');

  useEffect(() => {
    freeService.listCourses().then(setCourses).finally(() => setLoading(false));
  }, []);

  const filtered = courses.filter(c => {
    const matchSearch = !search ||
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      (c.tags || []).some(t => t.includes(search.toLowerCase()));
    const matchDiff = diffFilter === 'all' || c.difficulty === diffFilter;
    return matchSearch && matchDiff;
  });

  const totalExercises = courses.reduce((a, c) => a + (c.exercise_count || 0), 0);

  return (
    <IndividualShell
      activePage="courses"
      title="Practice Platform"
      subtitle="Write, run, and debug real code in your browser. Master programming through hands-on exercises."
    >
      {/* Stats */}
      <div className={styles.statsRow}>
        {[
          { icon: <BookOpen size={15} />, val: courses.length,      lbl: 'Courses'   },
          { icon: <Code2 size={15} />,    val: `${totalExercises}+`, lbl: 'Exercises' },
          { icon: <Trophy size={15} />,   val: 'XP',                 lbl: 'System'    },
        ].map(s => (
          <div key={s.lbl} className={styles.statChip}>
            {s.icon}
            <strong>{s.val}</strong> {s.lbl}
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <Search size={15} className={styles.searchIcon} />
          <input className={styles.searchInput}
            placeholder="Search courses or topics…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className={styles.filters}>
          {['all', 'beginner', 'intermediate', 'advanced'].map(d => (
            <button key={d}
              className={`${styles.filterBtn} ${diffFilter === d ? styles.filterActive : ''}`}
              onClick={() => setDiffFilter(d)}>
              {d === 'all' ? 'All Levels' : DIFF_MAP[d as keyof typeof DIFF_MAP]?.label ?? d}
            </button>
          ))}
        </div>
      </div>

      {/* Course Grid */}
      {loading ? (
        <div className={styles.loading}>
          <RefreshCw size={22} className={styles.spinIcon} />
          <span>Loading courses…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>No courses match your search.</div>
      ) : (
        <div className={styles.grid}>
          {filtered.map(course => {
            const diff = DIFF_MAP[course.difficulty] ?? DIFF_MAP.beginner;
            const icon = LANG_ICONS[course.language] ?? LANG_ICONS.default;
            return (
              <div key={course.id} className={styles.card}
                onClick={() => router.push(`/practice/${course.slug || course.id}`)}>
                <div className={styles.cardHeader}>
                  <span className={styles.langIcon}>{icon}</span>
                  <span className={`${styles.diffBadge} ${styles[diff.cls]}`}>
                    {diff.label}
                  </span>
                </div>
                <h2 className={styles.cardTitle}>{course.title}</h2>
                <p className={styles.cardDesc}>{course.description}</p>
                <div className={styles.cardTags}>
                  {(course.tags || []).slice(0, 3).map(t => (
                    <span key={t} className={styles.tag}>{t}</span>
                  ))}
                </div>
                <div className={styles.cardFooter}>
                  <span className={styles.exerciseCount}>
                    <Code2 size={13} /> {course.exercise_count} exercises
                  </span>
                  <span className={styles.startArrow}>
                    Start <ChevronRight size={13} style={{ display: 'inline', verticalAlign: 'middle' }} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </IndividualShell>
  );
}
