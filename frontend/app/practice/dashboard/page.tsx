'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import IndividualShell from '@/components/layout/IndividualShell';
import { platformUserService, type PlatformCourse, type Progress, type PlatformAnalyticsOverview } from '@/services/platform-user.service';
import { practiceExtraService, type RecommendedProblem } from '@/services/practice-extra.service';
import { useAuthStore } from '@/store/auth-store';
import { apiClient } from '@/services/api-client';
import {
  Loader2,
  Zap,
  CheckCircle2,
  GraduationCap,
  Terminal,
  BookOpen,
  ArrowRight,
  Sparkles,
  Play,
  Library,
  Flame,
  Target,
  BarChart3,
  Clock,
  User,
  ThumbsUp,
  Users,
  Code2,
  Trophy,
  Layers,
  Type,
  Cpu,
  GitFork,
  Lightbulb,
} from 'lucide-react';
import { DashboardSkeleton } from '@/components/practice/PracticeSkeletons';
import styles from './page.module.css';

interface QuestXPData {
  total_xp: number;
  level: number;
  level_name: string;
  next_level_xp: number | null;
  streak_days: number;
  problems_solved: number;
}

const DEFAULT_RECOMMENDED: RecommendedProblem[] = [];

import Cookies from 'js-cookie';
import { authService } from '@/services/auth.service';

export default function IndividualDashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, hasHydrated, setUser } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  const [progress, setProgress] = useState<Progress | null>(null);
  const [courses, setCourses] = useState<PlatformCourse[]>([]);
  const [recs, setRecs] = useState<RecommendedProblem[]>(DEFAULT_RECOMMENDED);
  const [questXP, setQuestXP] = useState<QuestXPData | null>(null);
  const [overview, setOverview] = useState<PlatformAnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isReady = mounted && (hasHydrated || typeof window !== 'undefined');

  // Guard: only platform_user (logged-in) may see the dashboard
  useEffect(() => {
    if (!isReady) return;

    const token = Cookies.get('access_token') || (typeof window !== 'undefined' ? localStorage.getItem('access_token') : null);

    if (!token && !isAuthenticated) {
      router.replace('/login');
      return;
    }

    if (token && !user) {
      authService.getMe()
        .then((u) => setUser(u))
        .catch(() => router.replace('/login'));
    }
  }, [isReady, isAuthenticated, user, router, setUser]);

  useEffect(() => {
    if (!user) return;

    Promise.all([
      platformUserService.getProgress().catch(() => null),
      platformUserService.listCourses().catch(() => []),
      practiceExtraService.recommended().catch(() => ({ recommendations: [] })),
      apiClient.get('/practice/quest/stats').catch(() => ({ data: { xp: null } })),
      platformUserService.getPlatformOverview().catch(() => null),
    ])
      .then(([prog, courseList, recsRes, questRes, ovRes]) => {
        if (prog) setProgress(prog);
        if (courseList) setCourses(courseList);

        // Real recommendations only — no synthetic padding or invented stats.
        const fetchedRecs: RecommendedProblem[] = (recsRes?.recommendations || []).map((r) => ({
          ...r,
          topics: (r.topics && r.topics.length > 0) ? r.topics : (r.nexlab_topic ? [r.nexlab_topic] : []),
          description: r.description || `Practice challenge in ${r.nexlab_topic || 'this topic'}.`,
          acceptance_pct: r.acceptance_pct
            || (r.acceptance != null ? Math.round(Number(r.acceptance) * (Number(r.acceptance) <= 1 ? 100 : 1)) : undefined),
        }));
        setRecs(fetchedRecs.slice(0, 5));

        if (questRes?.data?.xp) {
          setQuestXP(questRes.data.xp);
        }
        if (ovRes) {
          setOverview(ovRes);
        }
      })
      .finally(() => setLoading(false));
  }, [user]);

  if (!isReady || !isAuthenticated || !user || loading) {
    return (
      <IndividualShell activePage="dashboard">
        <DashboardSkeleton />
      </IndividualShell>
    );
  }

  const firstName = user.full_name?.split(' ')[0] || 'Learner';
  const totalXp = questXP?.total_xp ?? progress?.total_xp ?? 0;
  const totalSolved = questXP?.problems_solved ?? progress?.total_solved ?? 0;
  const byCourse = progress?.by_course ?? {};

  const courseEntries = Object.entries(byCourse)
    .filter(([, d]) => (d.solved ?? 0) > 0 || (d.attempted ?? 0) > 0)
    .sort((a, b) => (b[1].xp ?? 0) - (a[1].xp ?? 0));

  const coursesInProgress = courseEntries.length;
  const courseMap = Object.fromEntries(courses.map((c) => [c.id, c]));

  // Level & XP math
  const level = questXP?.level ?? 1;
  const nextLevelXp = questXP?.next_level_xp ?? 100;
  const xpInLevel = totalXp % nextLevelXp;
  const levelProgressPct = Math.min(100, Math.round((xpInLevel / Math.max(nextLevelXp, 1)) * 100));

  // Courses overall completion percentage
  const totalCourseExercises = courses.reduce((acc, c) => acc + (c.exercise_count || 0), 0);
  const totalExercisesSolved = Object.values(byCourse).reduce((acc, c) => acc + (c.solved || 0), 0);
  const courseCompletionPct = totalCourseExercises > 0
    ? Math.min(100, Math.round((totalExercisesSolved / totalCourseExercises) * 100))
    : 0;

  // Topic mastery counts for Learning Progress Card
  const topicMasteryList = overview?.topic_strength || [];
  // Real mastery only: pct is the API's strength score, total is real attempts.
  const findTopicSolved = (name: string) => {
    const found = topicMasteryList.find((t) => t.topic.toLowerCase().includes(name.toLowerCase()));
    return {
      solved: found ? found.total_solved : 0,
      total: found ? found.total_attempted : 0,
      pct: found ? Math.min(100, Math.round(found.strength)) : 0,
    };
  };

  const arraysProgress = findTopicSolved('Array');
  const stringProgress = findTopicSolved('String');
  const dpProgress = findTopicSolved('Dynamic Programming');
  const treesProgress = findTopicSolved('Tree');

  // Top 4 and 5th problem
  const top4Recs = recs.slice(0, 4);
  const fifthProblem = recs[4];

  // Recent activity: use actual submissions or friendly onboarding timeline
  const recentRecords = (progress?.records ?? []).slice(0, 3);

  return (
    <IndividualShell activePage="dashboard">
      <div className={styles.dashboardContainer}>
        {/* ── 1. Hero Header Card ─────────────────────────────────────── */}
        <div className={styles.heroCard}>
          <div className={styles.heroLeft}>
            <h1 className={styles.heroTitle}>
              Welcome back, {firstName}
            </h1>
                <p className={styles.heroSubtitle}>
                  Keep the momentum going — pick up where you left off or explore something new.
                </p>

                <div className={styles.heroActions}>
                  {courseEntries.length > 0 ? (
                    <button
                      className={`${styles.quickBtn} ${styles.btnPurple}`}
                      onClick={() => {
                        const topCourseId = courseEntries[0][0];
                        const c = courseMap[topCourseId];
                        router.push(`/practice/${c?.slug || topCourseId}`);
                      }}
                    >
                      <Play size={14} fill="#ffffff" /> Continue learning
                    </button>
                  ) : (
                    <button
                      className={`${styles.quickBtn} ${styles.btnPurple}`}
                      onClick={() => router.push('/practice')}
                    >
                      <Play size={14} fill="#ffffff" /> Start learning
                    </button>
                  )}

                  <button
                    className={`${styles.quickBtn} ${styles.btnWhite}`}
                    onClick={() => router.push('/practice')}
                  >
                    <GraduationCap size={15} /> Browse courses
                  </button>

                  <button
                    className={`${styles.quickBtn} ${styles.btnPink}`}
                    onClick={() => router.push('/practice/playground')}
                  >
                    <Terminal size={15} /> &gt;_ Open Playground
                  </button>

                  <button
                    className={`${styles.quickBtn} ${styles.btnOutlinePurple}`}
                    onClick={() => router.push('/practice/library')}
                  >
                    <BookOpen size={15} /> Practice Library
                  </button>
                </div>
              </div>

              {/* Decorative Hero Illustration matching the reference mockup */}
              <div className={styles.heroRight}>
                <svg
                  width="360"
                  height="160"
                  viewBox="0 0 360 160"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
                >
                  <defs>
                    <linearGradient id="textGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="50%" stopColor="#8b5cf6" />
                      <stop offset="100%" stopColor="#a855f7" />
                    </linearGradient>
                    <linearGradient id="laptopGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#312e81" />
                      <stop offset="100%" stopColor="#1e1b4b" />
                    </linearGradient>
                    <linearGradient id="hoodieGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#4338ca" />
                      <stop offset="100%" stopColor="#3730a3" />
                    </linearGradient>
                    <filter id="softGlow" x="-10%" y="-10%" width="120%" height="120%">
                      <feGaussianBlur stdDeviation="6" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>

                  {/* Soft ambient background glow */}
                  <ellipse cx="190" cy="95" rx="80" ry="40" fill="rgba(147, 51, 234, 0.08)" filter="url(#softGlow)" />

                  {/* Desk Surface */}
                  <rect x="70" y="128" width="170" height="6" rx="3" fill="#cbd5e1" />
                  <rect x="85" y="134" width="6" height="24" rx="2" fill="#94a3b8" />
                  <rect x="220" y="134" width="6" height="24" rx="2" fill="#94a3b8" />

                  {/* Stack of colorful books */}
                  <rect x="80" y="118" width="36" height="5" rx="1.5" fill="#ef4444" />
                  <rect x="82" y="112" width="34" height="5" rx="1.5" fill="#f59e0b" />
                  <rect x="80" y="106" width="38" height="5" rx="1.5" fill="#3b82f6" />

                  {/* Student / Developer sitting */}
                  {/* Chair back */}
                  <rect x="186" y="70" width="10" height="56" rx="4" fill="#64748b" />
                  {/* Head */}
                  <circle cx="166" cy="52" r="14" fill="#fed7aa" />
                  {/* Hair */}
                  <path d="M152 50 C152 36 174 34 178 46 C172 44 162 45 158 54 Z" fill="#1e1b4b" />
                  {/* Hoodie body */}
                  <path d="M148 70 C148 64 154 62 166 62 C178 62 184 64 184 70 L190 120 C190 124 186 126 182 126 L148 126 Z" fill="url(#hoodieGrad)" />
                  {/* Arms forward on keyboard */}
                  <path d="M164 80 L140 106 L154 108 Z" fill="#4338ca" />
                  <circle cx="140" cy="107" r="4" fill="#fed7aa" />

                  {/* Laptop base and screen */}
                  <rect x="120" y="80" width="36" height="26" rx="3" fill="url(#laptopGrad)" />
                  <rect x="122" y="82" width="32" height="22" rx="2" fill="#0f172a" />
                  {/* NexLab Logo on laptop back */}
                  <circle cx="138" cy="93" r="4.5" fill="#a855f7" />
                  <circle cx="134" cy="90" r="2" fill="#38bdf8" />
                  <circle cx="142" cy="96" r="2" fill="#38bdf8" />
                  {/* Laptop Keyboard Base */}
                  <rect x="114" y="106" width="46" height="4" rx="2" fill="#94a3b8" />

                  {/* Floating Elements */}
                  {/* Code Badge </> */}
                  <g transform="translate(182, 30)">
                    <rect width="28" height="18" rx="5" fill="#8b5cf6" />
                    <text x="6" y="13" fill="#ffffff" fontSize="10" fontWeight="bold" fontFamily="monospace">&lt;/&gt;</text>
                  </g>

                  {/* Lightbulb Badge */}
                  <g transform="translate(198, 48)">
                    <circle cx="10" cy="10" r="10" fill="#fef3c7" stroke="#f59e0b" strokeWidth="1" />
                    <path d="M10 6a3 3 0 0 0-3 3c0 1.2.7 1.9 1.4 2.4v1.6h3.2V11.4c.7-.5 1.4-1.2 1.4-2.4a3 3 0 0 0-3-3z" fill="#d97706" />
                  </g>

                  {/* Vertical Slogan on Right */}
                  <text x="264" y="52" fill="url(#textGrad)" fontSize="13" fontWeight="800" fontFamily="sans-serif" letterSpacing="0.04em">Learn</text>
                  <text x="264" y="74" fill="url(#textGrad)" fontSize="13" fontWeight="800" fontFamily="sans-serif" letterSpacing="0.04em">Practice</text>
                  <text x="264" y="96" fill="url(#textGrad)" fontSize="13" fontWeight="800" fontFamily="sans-serif" letterSpacing="0.04em">Build</text>
                  <text x="264" y="118" fill="url(#textGrad)" fontSize="13" fontWeight="800" fontFamily="sans-serif" letterSpacing="0.04em">Grow</text>
                </svg>
              </div>
            </div>

            {/* ── Sections with real data (analytics may be empty on new accounts) ── */}
          {overview && (
          <>

          {/* ── 2. Practice Library Banner (No LeetCode / CodeChef mention) ── */}
            <div className={styles.libraryBanner}>
              <div className={styles.bannerLeft}>
                <div className={styles.trophyBox}>
                  <Trophy size={18} strokeWidth={2.2} color="#b45309" />
                </div>
                <div>
                  <div className={styles.bannerLabel}>PRACTICE LIBRARY</div>
                  <h2 className={styles.bannerHeading}>Curated Coding Challenges</h2>
                  <p className={styles.bannerSub}>
                    Arrays · Trees · DP · Graphs · SQL · and more — with XP, streaks &amp; study plans
                  </p>
                </div>
              </div>

              <div className={styles.bannerActions}>
                <button
                  className={styles.dailyBtn}
                  onClick={() => router.push('/practice/library/daily')}
                >
                  <Flame size={14} color="#dc2626" /> Daily Challenge
                </button>

                <button
                  className={styles.openLibraryBtn}
                  onClick={() => router.push('/practice/library')}
                >
                  Open Library →
                </button>
              </div>
            </div>

            {/* ── 3. Stat Cards Row ───────────────────────────────────────── */}
            <div className={styles.statGrid}>
              {/* Card 1: Total XP */}
              <div className={styles.statCard}>
                <div className={styles.statTop}>
                  <div className={styles.statTopLeft}>
                    <div className={styles.statIconBox} style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' }}>
                      <Zap size={18} fill="#f59e0b" />
                    </div>
                    <span className={styles.statTitle}>Total XP</span>
                  </div>
                </div>

                <div className={styles.statMid}>
                  <span className={styles.statBigValue}>{totalXp.toLocaleString()}</span>
                  <div className={styles.statMetaRight}>
                    <span className={styles.levelPill}>Level {level}</span>
                    <div className={styles.miniProgressBar}>
                      <div className={styles.miniProgressFill} style={{ width: `${levelProgressPct}%` }} />
                    </div>
                    <span className={styles.miniProgressText}>{xpInLevel} / {nextLevelXp} XP</span>
                  </div>
                </div>

                <p className={styles.statSubtext}>Experience earned across all courses</p>
              </div>

              {/* Card 2: Problems Solved */}
              <div className={styles.statCard}>
                <div className={styles.statTop}>
                  <div className={styles.statTopLeft}>
                    <div className={styles.statIconBox} style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}>
                      <CheckCircle2 size={18} />
                    </div>
                    <span className={styles.statTitle}>Problems Solved</span>
                  </div>
                </div>

                <div className={styles.statMid}>
                  <span className={styles.statBigValue}>{totalSolved}</span>
                  <div className={styles.statMetaRight}>
                    <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>
                      across the whole library
                    </span>
                  </div>
                </div>

                <p className={styles.statSubtext}>Exercises completed successfully</p>
              </div>

              {/* Card 3: Courses in progress */}
              <div className={styles.statCard}>
                <div className={styles.statTop}>
                  <div className={styles.statTopLeft}>
                    <div className={styles.statIconBox} style={{ background: 'rgba(124, 58, 237, 0.12)', color: '#7c3aed' }}>
                      <BookOpen size={18} />
                    </div>
                    <span className={styles.statTitle}>Courses in progress</span>
                  </div>
                </div>

                <div className={styles.statMid}>
                  <span className={styles.statBigValue}>{coursesInProgress}</span>
                  <div className={styles.statMetaRight}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>
                      {courses.length} courses available
                    </span>
                    <span style={{ fontSize: '10px', color: '#7c3aed', fontWeight: 700 }}>
                      {courseCompletionPct}% completion
                    </span>
                  </div>
                </div>

                <p className={styles.statSubtext}>{courses.length} courses available</p>
              </div>
            </div>

            {/* ── 4. "Recommended next" Section ───────────────────────────── */}
            <div>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionHeaderLeft}>
                  <h2 className={styles.sectionTitle}>
                    <Sparkles size={18} color="#7c3aed" /> Recommended next
                  </h2>
                  <span className={styles.sectionSub}>Handpicked problems to get you started.</span>
                </div>

                <button
                  className={styles.sectionLink}
                  onClick={() => router.push('/practice/library')}
                >
                  View Library →
                </button>
              </div>

              {/* Top Row: 4 Problem Cards */}
              <div className={styles.recGridTop}>
                {top4Recs.map((prob) => {
                  const diffCls = prob.difficulty === 'Hard'
                    ? styles.diffHard
                    : prob.difficulty === 'Medium'
                    ? styles.diffMedium
                    : styles.diffEasy;

                  const probTopics = (prob as any).topics;
                  const displayTags = Array.isArray(probTopics) && probTopics.length > 0
                    ? probTopics.slice(0, 2)
                    : typeof probTopics === 'string' && probTopics.trim().length > 0
                    ? [probTopics.trim()]
                    : prob.nexlab_topic
                    ? [prob.nexlab_topic]
                    : [];

                  return (
                    <div
                      key={prob.id}
                      className={styles.problemCard}
                      onClick={() => router.push(`/practice/library/${prob.slug}`)}
                    >
                      <div>
                        <div className={styles.cardTopRow}>
                          <span className={`${styles.diffBadge} ${diffCls}`}>
                            {prob.difficulty}
                          </span>
                        </div>

                        <h3 className={styles.problemTitle}>{prob.title}</h3>
                        <p className={styles.problemDesc}>{prob.description}</p>

                        <div className={styles.problemTags}>
                          {displayTags.map((tag) => (
                            <span key={tag} className={styles.tagPill}>{tag}</span>
                          ))}
                        </div>
                      </div>

                      <div className={styles.cardFooter}>
                        <div className={styles.cardStats}>
                          {prob.acceptance_pct != null && (
                            <span className={styles.statItem}>
                              <ThumbsUp size={11} style={{ verticalAlign: 'middle' }} /> {prob.acceptance_pct}%
                            </span>
                          )}
                          {prob.solves_display && (
                            <span className={styles.statItem}>
                              <Users size={11} style={{ verticalAlign: 'middle' }} /> {prob.solves_display}
                            </span>
                          )}
                        </div>

                        <button className={styles.circleArrowBtn} title="Solve problem">
                          <ArrowRight size={13} strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── 5. Bottom Row: Card 5 + Learning Progress + Recent Activity ─ */}
            <div className={styles.bottomRowGrid}>
              {/* Card 5: Standalone Problem Card */}
              <div className={styles.bottomProblemCol}>
                {fifthProblem && (
                <div
                  className={styles.problemCard}
                  onClick={() => router.push(`/practice/library/${fifthProblem.slug}`)}
                >
                  <div>
                    <div className={styles.cardTopRow}>
                      <span
                        className={`${styles.diffBadge} ${
                          fifthProblem.difficulty === 'Hard'
                            ? styles.diffHard
                            : fifthProblem.difficulty === 'Medium'
                            ? styles.diffMedium
                            : styles.diffEasy
                        }`}
                      >
                        {fifthProblem.difficulty}
                      </span>
                    </div>

                    <h3 className={styles.problemTitle}>{fifthProblem.title}</h3>
                    <p className={styles.problemDesc}>{fifthProblem.description}</p>

                    <div className={styles.problemTags}>
                      {(() => {
                        const topics = (fifthProblem as any).topics;
                        const tags = Array.isArray(topics) && topics.length > 0
                          ? topics.slice(0, 2)
                          : typeof topics === 'string' && topics.trim().length > 0
                          ? [topics.trim()]
                          : fifthProblem.nexlab_topic
                          ? [fifthProblem.nexlab_topic]
                          : [];
                        return tags.map((tag: string) => (
                          <span key={tag} className={styles.tagPill}>{tag}</span>
                        ));
                      })()}
                    </div>
                  </div>

                  <div className={styles.cardFooter}>
                    <div className={styles.cardStats}>
                      {fifthProblem.acceptance_pct != null && (
                        <span className={styles.statItem}>
                          <ThumbsUp size={11} /> {fifthProblem.acceptance_pct}%
                        </span>
                      )}
                      {fifthProblem.solves_display && (
                        <span className={styles.statItem}>
                          <Users size={11} /> {fifthProblem.solves_display}
                        </span>
                      )}
                    </div>

                    <button className={styles.circleArrowBtn} title="Solve problem">
                      <ArrowRight size={13} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
                )}
              </div>

              {/* Panel 2: Learning Progress */}
              <div className={styles.panelCard}>
                <div className={styles.panelHeader}>
                  <h3 className={styles.panelHeaderTitle}>
                    <BarChart3 size={16} className={styles.panelHeaderIcon} /> Learning Progress
                  </h3>
                  <button
                    className={styles.panelHeaderLink}
                    onClick={() => router.push('/practice/progress')}
                  >
                    View Progress →
                  </button>
                </div>

                <div className={styles.topicList}>
                  {/* Arrays */}
                  <div className={styles.topicRow}>
                    <div className={styles.topicIconBox} style={{ background: '#eff6ff', color: '#2563eb' }}>
                      <Layers size={16} strokeWidth={2.2} />
                    </div>
                    <span className={styles.topicLabel}>Arrays</span>
                    <div className={styles.topicTrack}>
                      <div className={styles.topicFill} style={{ width: `${arraysProgress.pct}%`, background: '#3b82f6' }} />
                    </div>
                    <span className={styles.topicRatio}>{arraysProgress.solved} / {arraysProgress.total}</span>
                  </div>

                  {/* String */}
                  <div className={styles.topicRow}>
                    <div className={styles.topicIconBox} style={{ background: '#ecfdf5', color: '#059669' }}>
                      <Type size={16} strokeWidth={2.2} />
                    </div>
                    <span className={styles.topicLabel}>String</span>
                    <div className={styles.topicTrack}>
                      <div className={styles.topicFill} style={{ width: `${stringProgress.pct}%`, background: '#10b981' }} />
                    </div>
                    <span className={styles.topicRatio}>{stringProgress.solved} / {stringProgress.total}</span>
                  </div>

                  {/* Dynamic Programming */}
                  <div className={styles.topicRow}>
                    <div className={styles.topicIconBox} style={{ background: '#fffbeb', color: '#d97706' }}>
                      <Cpu size={16} strokeWidth={2.2} />
                    </div>
                    <span className={styles.topicLabel}>Dynamic Programming</span>
                    <div className={styles.topicTrack}>
                      <div className={styles.topicFill} style={{ width: `${dpProgress.pct}%`, background: '#f59e0b' }} />
                    </div>
                    <span className={styles.topicRatio}>{dpProgress.solved} / {dpProgress.total}</span>
                  </div>

                  {/* Trees */}
                  <div className={styles.topicRow}>
                    <div className={styles.topicIconBox} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                      <GitFork size={16} strokeWidth={2.2} />
                    </div>
                    <span className={styles.topicLabel}>Trees</span>
                    <div className={styles.topicTrack}>
                      <div className={styles.topicFill} style={{ width: `${treesProgress.pct}%`, background: '#8b5cf6' }} />
                    </div>
                    <span className={styles.topicRatio}>{treesProgress.solved} / {treesProgress.total}</span>
                  </div>
                </div>
              </div>

              {/* Panel 3: Recent Activity */}
              <div className={styles.panelCard}>
                <div className={styles.panelHeader}>
                  <h3 className={styles.panelHeaderTitle}>
                    <Clock size={16} className={styles.panelHeaderIcon} /> Recent Activity
                  </h3>
                  <button
                    className={styles.panelHeaderLink}
                    onClick={() => router.push('/practice/progress?tab=activity')}
                  >
                    View All →
                  </button>
                </div>

                <div className={styles.timeline}>
                  {recentRecords.length > 0 ? (
                    recentRecords.map((rec, i) => {
                      const course = courseMap[rec.course_id];
                      return (
                        <div
                          key={`${rec.exercise_id}-${i}`}
                          className={styles.timelineItem}
                          style={{ cursor: 'pointer' }}
                          onClick={() => router.push(rec.course_id && rec.exercise_id ? `/practice/${rec.course_id}/${rec.exercise_id}` : '/practice')}
                          title={`Go to ${(rec as any).exercise_title || 'Exercise'}`}
                        >
                          {i < recentRecords.length - 1 && <div className={styles.timelineConnector} />}
                          <div
                            className={styles.timelineIconBox}
                            style={{
                              background: rec.status === 'solved' ? '#ecfdf5' : '#fffbeb',
                              color: rec.status === 'solved' ? '#059669' : '#d97706',
                            }}
                          >
                            {rec.status === 'solved' ? <CheckCircle2 size={14} /> : <Target size={14} />}
                          </div>
                          <div className={styles.timelineContent}>
                            <p className={styles.timelineTitle}>{(rec as any).exercise_title || rec.exercise_id}</p>
                            <p className={styles.timelineDesc}>{course?.title || 'Practice Module'}</p>
                          </div>
                          <span className={styles.timelineTime}>
                            {rec.xp_earned > 0 ? `+${rec.xp_earned} XP` : 'Attempted'}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ padding: '22px 8px', textAlign: 'center' }}>
                      <p style={{ margin: 0, fontSize: 13, color: '#9ca3af' }}>
                        No activity yet — solve your first problem to start your journey.
                      </p>
                      <button
                        className={styles.sectionLink}
                        style={{ marginTop: 10 }}
                        onClick={() => router.push('/practice/library')}
                      >
                        Browse Problems →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── 6. Courses in Progress (Preserves enrolled learning continuity) ── */}
            {courseEntries.length > 0 && (
              <div style={{ marginTop: '10px' }}>
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionHeaderLeft}>
                    <h2 className={styles.sectionTitle}>
                      <GraduationCap size={18} color="#7c3aed" /> Your Enrolled Courses
                    </h2>
                    <span className={styles.sectionSub}>Continue where you left off</span>
                  </div>
                  <button className={styles.sectionLink} onClick={() => router.push('/practice')}>
                    Browse all →
                  </button>
                </div>

                <div className={styles.courseGrid}>
                  {courseEntries.map(([courseId, data]) => {
                    const course = courseMap[courseId];
                    const total = course?.exercise_count || data.attempted || 1;
                    const pct = Math.min(100, Math.round((data.solved / total) * 100));
                    return (
                      <div
                        key={courseId}
                        className={styles.courseCard}
                        onClick={() => router.push(`/practice/${course?.slug || courseId}`)}
                      >
                        <div className={styles.courseCardTop}>
                          <h3 className={styles.courseName}>{course?.title ?? courseId}</h3>
                          <span className={styles.solvedBadge}>
                            <CheckCircle2 size={11} /> {data.solved}/{total}
                          </span>
                        </div>
                        {course?.description && <p className={styles.courseDesc}>{course.description}</p>}
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
              </div>
            )}
          </>
        )}
      </div>
    </IndividualShell>
  );
}
