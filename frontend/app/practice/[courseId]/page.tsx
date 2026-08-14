'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { freeService, type FreeCourse, type FreeExercise } from '@/services/free.service';
import { useAuthStore } from '@/store/auth-store';
import { authService } from '@/services/auth.service';
import styles from './course.module.css';
import {
  ChevronLeft, Code2, HelpCircle, CheckCircle2, Trophy, Zap,
  Home, LogOut, LogIn, UserCircle2, RefreshCw, FlaskConical
} from 'lucide-react';

const DIFF_MAP: Record<string, string> = {
  easy:   'diffEasy',
  medium: 'diffMedium',
  hard:   'diffHard',
};

export default function CoursePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();

  const [course,    setCourse]    = useState<FreeCourse | null>(null);
  const [exercises, setExercises] = useState<FreeExercise[]>([]);
  const [solvedIds, setSolvedIds] = useState<Set<string>>(new Set());
  const [loading,   setLoading]   = useState(true);

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

  useEffect(() => { load(); }, [load]);

  const handleLogout = async () => {
    await authService.logout();
    clearAuth();
    router.push('/login');
  };

  const solvedCount = exercises.filter(e => solvedIds.has(e.id)).length;
  const totalXP     = exercises.reduce((a, e) => a + e.xp_reward, 0);
  const earnedXP    = exercises.filter(e => solvedIds.has(e.id)).reduce((a, e) => a + e.xp_reward, 0);
  const pct = exercises.length ? Math.round((solvedCount / exercises.length) * 100) : 0;

  const initials = user?.full_name
    ? user.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  if (loading) return (
    <div className={styles.loading}>
      <RefreshCw size={24} className={styles.spinIcon} />
      <span>Loading courseâ€¦</span>
    </div>
  );

  return (
    <div className={styles.stage}>
      <div className={`${styles.blob} ${styles.blob1}`} />
      <div className={`${styles.blob} ${styles.blob2}`} />
      <div className={`${styles.blob} ${styles.blob3}`} />
      <div className={styles.sheen} />

      <div className={styles.appPanel}>
        {/* â”€â”€ Sidebar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarTop}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="NexLab" className={styles.logo} onClick={() => router.push('/')} />
            <span className={styles.logoLabel}>Practice</span>
          </div>

          <span className={styles.navLabel}>Navigation</span>
          <nav className={styles.navGroup}>
            <ul>
              <li>
                <div className={styles.navItem} onClick={() => router.push('/practice')}>
                  <Home size={17} className={styles.navIcon} /> All Courses
                </div>
              </li>
              {course && (
                <li>
                  <div className={`${styles.navItem} ${styles.navItemActive}`}>
                    <Code2 size={17} className={styles.navIcon} />
                    {course.title}
                  </div>
                </li>
              )}
            </ul>
          </nav>

          {/* Exercise mini-list in sidebar */}
          {exercises.length > 0 && (
            <>
              <span className={styles.navLabel}>Exercises</span>
              <nav className={styles.navGroup}>
                <ul>
                  {exercises.map((ex, i) => (
                    <li key={ex.id}>
                      <div className={styles.navItem}
                        onClick={() => router.push(`/practice/${courseId}/${ex.id}`)}>
                        {solvedIds.has(ex.id)
                          ? <CheckCircle2 size={15} style={{ color: '#0f8a3f', flexShrink: 0 }} />
                          : <span style={{ width:15, height:15, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:700, color:'#a79fbb' }}>{i+1}</span>
                        }
                        <span style={{ overflow:'hidden', textOverflow:'ellipsis', fontSize:'13px' }}>{ex.title}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </nav>
            </>
          )}

          <div className={styles.bottomGroup}>
            <nav className={styles.navGroup}>
              <ul>
                {user ? (
                  <li>
                    <div className={`${styles.navItem} ${styles.navItemLogout}`} onClick={handleLogout}>
                      <LogOut size={17} className={styles.navIcon} /> Sign Out
                    </div>
                  </li>
                ) : (
                  <>
                    <li><div className={styles.navItem} onClick={() => router.push('/login')}><LogIn size={17} className={styles.navIcon} /> Sign In</div></li>
                    <li><div className={styles.navItem} onClick={() => router.push('/register')}><UserCircle2 size={17} className={styles.navIcon} /> Register Free</div></li>
                  </>
                )}
              </ul>
            </nav>
          </div>

          <div className={styles.freeBanner}>
            <p className={styles.freeBannerTitle}>ðŸŽ“ Free & Open</p>
            <p className={styles.freeBannerSub}>All courses are free forever.</p>
          </div>
        </aside>

        {/* â”€â”€ Content â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <main className={styles.content}>
          {/* Header */}
          <div className={styles.contentHeader}>
            <div className={styles.breadcrumb}>
              <span className={styles.crumbLink} onClick={() => router.push('/practice')}>
                Practice
              </span>
              <span className={styles.sep}>/</span>
              <strong>{course?.title}</strong>
            </div>
            <div className={styles.headerRight}>
              <button className={styles.backBtn} onClick={() => router.push('/practice')}>
                <ChevronLeft size={15} /> All Courses
              </button>
              {user ? (
                <div className={styles.profileChip}>
                  <div className={styles.avatar}>{initials}</div>
                  <span>{user.full_name?.split(' ')[0]}</span>
                </div>
              ) : (
                <button className={styles.loginBtn} onClick={() => router.push('/login')}>
                  <LogIn size={14} /> Sign In
                </button>
              )}
            </div>
          </div>

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

          {/* Exercise List */}
          <p className={styles.listTitle}>Exercises â€” {exercises.length} total</p>
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
                      : <span className={styles.exArrow}>â€º</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}

