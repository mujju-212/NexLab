'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { freeService, type FreeCourse } from '@/services/free.service';
import { useAuthStore } from '@/store/auth-store';
import { authService } from '@/services/auth.service';
import styles from './practice.module.css';
import {
  BookOpen, Code2, Trophy, Home, LogOut, LogIn,
  Search, RefreshCw, ChevronRight, UserCircle2
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
  const router   = useRouter();
  const pathname = usePathname();
  const { user, clearAuth } = useAuthStore();

  const [courses, setCourses] = useState<FreeCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [diffFilter, setDiffFilter] = useState<string>('all');

  useEffect(() => {
    freeService.listCourses().then(setCourses).finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    await authService.logout();
    clearAuth();
    router.push('/login');
  };

  const filtered = courses.filter(c => {
    const matchSearch = !search ||
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      (c.tags || []).some(t => t.includes(search.toLowerCase()));
    const matchDiff = diffFilter === 'all' || c.difficulty === diffFilter;
    return matchSearch && matchDiff;
  });

  const initials = user?.full_name
    ? user.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const totalExercises = courses.reduce((a, c) => a + (c.exercise_count || 0), 0);

  return (
    <div className={styles.stage}>
      {/* bg blobs */}
      <div className={`${styles.blob} ${styles.blob1}`} />
      <div className={`${styles.blob} ${styles.blob2}`} />
      <div className={`${styles.blob} ${styles.blob3}`} />
      <div className={styles.sheen} />

      <div className={styles.appPanel}>
        {/* ── Sidebar ────────────────────────────────────────────────── */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarTop}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="NexLab" className={styles.logo} onClick={() => router.push('/')} />
            <span className={styles.logoLabel}>Practice</span>
          </div>

          <span className={styles.navLabel}>Menu</span>
          <nav className={styles.navGroup}>
            <ul>
              <li>
                <div className={`${styles.navItem} ${pathname === '/practice' ? styles.navItemActive : ''}`}
                  onClick={() => router.push('/practice')}>
                  <Home size={17} className={styles.navIcon} />
                  All Courses
                </div>
              </li>
              {user && (
                <li>
                  <div className={`${styles.navItem}`}
                    onClick={() => router.push('/practice/progress')}>
                    <Trophy size={17} className={styles.navIcon} />
                    My Progress
                  </div>
                </li>
              )}
            </ul>
          </nav>

          <span className={styles.navLabel}>Topics</span>
          <nav className={styles.navGroup}>
            <ul>
              {['Python', 'DSA', 'C++', 'Java'].map(t => (
                <li key={t}>
                  <div className={styles.navItem} onClick={() => setSearch(t.toLowerCase())}>
                    <Code2 size={17} className={styles.navIcon} />
                    {t}
                  </div>
                </li>
              ))}
            </ul>
          </nav>

          <div className={styles.bottomGroup}>
            <nav className={styles.navGroup}>
              <ul>
                {user ? (
                  <li>
                    <div className={`${styles.navItem} ${styles.navItemLogout}`} onClick={handleLogout}>
                      <LogOut size={17} className={styles.navIcon} />
                      Sign Out
                    </div>
                  </li>
                ) : (
                  <>
                    <li>
                      <div className={styles.navItem} onClick={() => router.push('/login')}>
                        <LogIn size={17} className={styles.navIcon} />
                        Sign In
                      </div>
                    </li>
                    <li>
                      <div className={styles.navItem} onClick={() => router.push('/register')}>
                        <UserCircle2 size={17} className={styles.navIcon} />
                        Register Free
                      </div>
                    </li>
                  </>
                )}
              </ul>
            </nav>
          </div>

          <div className={styles.freeBanner}>
            <p className={styles.freeBannerTitle}>🎓 Free & Open</p>
            <p className={styles.freeBannerSub}>All courses are free forever. No subscription needed.</p>
          </div>
        </aside>

        {/* ── Main Content ────────────────────────────────────────────── */}
        <main className={styles.content}>
          {/* Header */}
          <div className={styles.contentHeader}>
            <div className={styles.breadcrumb}>
              Practice <span className={styles.sep}>/</span>
              <strong>All Courses</strong>
            </div>
            <div className={styles.headerRight}>
              {user ? (
                <div className={styles.profileChip}>
                  <div className={styles.avatar}>{initials}</div>
                  <span>{user.full_name?.split(' ')[0]}</span>
                </div>
              ) : (
                <>
                  <button className={styles.loginBtn} onClick={() => router.push('/login')}>
                    <LogIn size={14} /> Sign In
                  </button>
                  <button className={styles.registerBtn} onClick={() => router.push('/register')}>
                    Get Started Free
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Page Hero */}
          <div className={styles.pageHero}>
            <div className={styles.heroRow}>
              <div className={styles.heroIcon}>
                <Code2 size={22} />
              </div>
              <h1 className={styles.pageTitle}>Practice Platform</h1>
            </div>
            <p className={styles.pageSubtitle}>
              Write, run, and debug real code in your browser. Master programming through hands-on exercises.
            </p>
          </div>

          {/* Stats */}
          <div className={styles.statsRow}>
            {[
              { icon: <BookOpen size={15} />, val: courses.length,   lbl: 'Courses'   },
              { icon: <Code2 size={15} />,    val: `${totalExercises}+`, lbl: 'Exercises' },
              { icon: <Trophy size={15} />,   val: 'XP',             lbl: 'System'    },
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

          {/* CTA for guests */}
          {!user && (
            <div className={styles.ctaBanner}>
              <div>
                <h3>Track Your Progress</h3>
                <p>Sign up free to save solutions, earn XP, and compete on the leaderboard.</p>
              </div>
              <button className={styles.ctaBtn} onClick={() => router.push('/register')}>
                Create Free Account →
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
