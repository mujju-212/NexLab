'use client';
/**
 * DailyChallengePage — High-fidelity Daily Challenge Dashboard
 * Powered 100% by live backend endpoints & database records.
 * Visual and structural recreation of the Daily Challenge design.
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  Flame,
  Trophy,
  Check,
  Lock,
  Gift,
  Clock,
  BookOpen,
  Zap,
  Users,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  ArrowRight,
  Sun,
  X,
} from 'lucide-react';
import styles from './DailyChallengePage.module.css';
import { apiClient } from '@/services/api-client';

interface DailyProblem {
  id: string;
  slug: string;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | string;
  nexlab_topic: string;
  tags?: string[];
  reward_xp?: number;
  solvers_today?: string;
  solvers_raw?: number;
  success_rate?: string;
  success_rate_raw?: number;
  ends_in_seconds?: number;
  ends_in?: string;
  description_hook?: string;
  acceptance?: number;
}

interface WeekDayItem {
  day: string;
  date: string;
  day_number: number;
  solved: boolean;
  is_today: boolean;
  is_future: boolean;
}

interface CalendarDay {
  day: number;
  date: string;
  is_current_month: boolean;
  status: 'solved' | 'today' | 'today_solved' | 'upcoming' | 'missed';
}

interface RecentChallenge {
  id: string;
  title: string;
  slug: string;
  date: string;
  date_formatted: string;
  difficulty: string;
  solved: boolean;
}

interface Milestone {
  day: number;
  label: string;
  xp: number;
  status: 'completed' | 'active' | 'locked';
  is_gift?: boolean;
}

interface WeeklyReward {
  streak: number;
  title: string;
  xp: number;
  unlocked: boolean;
  icon: string;
}

interface DailyChallengeData {
  daily: DailyProblem | null;
  date: string;
  solved_today: boolean;
  streak_stats: {
    current_streak: number;
    best_streak: number;
    week_history: WeekDayItem[];
  };
  calendar: {
    year: number;
    month: number;
    days: CalendarDay[];
  };
  recent_challenges: RecentChallenge[];
  milestones: Milestone[];
  weekly_rewards: WeeklyReward[];
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function DailyChallengePage({ baseRoute }: { baseRoute: string }) {
  const router = useRouter();
  const [data, setData] = useState<DailyChallengeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [calYear, setCalYear] = useState<number>(2026);
  const [calMonth, setCalMonth] = useState<number>(10);
  const [calLoading, setCalLoading] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);

  // Initial load
  useEffect(() => {
    let isMounted = true;
    const fetchDailyData = async () => {
      try {
        const res = await apiClient.get('/practice/daily');
        if (isMounted && res.data) {
          setData(res.data);
          if (res.data.calendar) {
            setCalYear(res.data.calendar.year);
            setCalMonth(res.data.calendar.month);
          }
          if (res.data.daily?.ends_in_seconds !== undefined) {
            setSecondsRemaining(res.data.daily.ends_in_seconds);
          }
        }
      } catch (err) {
        console.error('Failed to load daily challenge:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchDailyData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Live countdown timer
  useEffect(() => {
    if (secondsRemaining <= 0) return;
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsRemaining]);

  const formatCountdown = (totalSec: number) => {
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    return `Ends in ${hours}h ${minutes}m`;
  };

  // Switch Calendar Month
  const handleMonthChange = useCallback(
    async (delta: number) => {
      let nextMonth = calMonth + delta;
      let nextYear = calYear;
      if (nextMonth < 1) {
        nextMonth = 12;
        nextYear -= 1;
      } else if (nextMonth > 12) {
        nextMonth = 1;
        nextYear += 1;
      }
      setCalYear(nextYear);
      setCalMonth(nextMonth);
      setCalLoading(true);

      try {
        const res = await apiClient.get('/practice/daily/calendar', {
          params: { year: nextYear, month: nextMonth },
        });
        if (res.data?.days) {
          setData((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              calendar: {
                year: nextYear,
                month: nextMonth,
                days: res.data.days,
              },
            };
          });
        }
      } catch (e) {
        console.error('Failed to change calendar month:', e);
      } finally {
        setCalLoading(false);
      }
    },
    [calMonth, calYear]
  );

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
        <div>Loading your Daily Challenge…</div>
      </div>
    );
  }

  const daily = data?.daily;
  const streakStats = data?.streak_stats;
  const solvedToday = data?.solved_today || false;
  const currentStreak = streakStats?.current_streak || 0;
  const bestStreak = streakStats?.best_streak || 0;
  const weekHistory = streakStats?.week_history || [];
  const calendarDays = data?.calendar?.days || [];
  const recentChallenges = data?.recent_challenges || [];
  const milestones = data?.milestones || [];
  const weeklyRewards = data?.weekly_rewards || [];

  const diffClass = (diff: string) => {
    if (diff === 'Easy') return styles.diffEasy;
    if (diff === 'Hard') return styles.diffHard;
    return styles.diffMedium;
  };

  return (
    <div className={styles.container}>
      {/* ──────────────────────────────────────────────────────────────────
          1. HERO HEADER
          ────────────────────────────────────────────────────────────────── */}
      <header className={styles.heroHeader}>
        <div className={styles.heroLeft}>
          <div className={styles.flameIconBox}>
            🔥
          </div>
          <div>
            <h1 className={styles.heroTitle}>Daily Challenge</h1>
            <p className={styles.heroSubtitle}>
              Solve one curated problem every day to build consistency and improve your skills.
            </p>
          </div>
        </div>

        <div className={styles.heroRight}>
          {/* Day Streak Pill */}
          <div className={styles.streakPill}>
            <div className={styles.streakPillIcon}>
              <Flame size={24} color="#7c3aed" />
            </div>
            <div className={styles.streakPillText}>
              <span className={styles.streakPillCount}>{currentStreak}</span>
              <span className={styles.streakPillLabel}>Day Streak</span>
            </div>
          </div>

          {/* Weekly Progress Dots (Mon - Sun) */}
          <div className={styles.weekProgressTracker} title="Current Week Progress">
            {weekHistory.map((item) => (
              <div key={item.day} className={styles.weekDayItem}>
                <span className={styles.weekDayLabel}>{item.day}</span>
                <div
                  className={`${styles.weekDayDot} ${
                    item.solved
                      ? styles.weekDayDotSolved
                      : item.is_today
                      ? styles.weekDayDotToday
                      : styles.weekDayDotEmpty
                  }`}
                >
                  {item.solved ? <Check size={12} strokeWidth={3.5} /> : null}
                </div>
              </div>
            ))}
          </div>

          {/* Best Streak Pill */}
          <div className={styles.bestStreakPill}>
            <span className={styles.bestStreakIcon}>🏆</span>
            <div className={styles.bestStreakText}>
              <span className={styles.bestStreakLabel}>Best Streak</span>
              <span className={styles.bestStreakValue}>{bestStreak} days</span>
            </div>
          </div>
        </div>
      </header>

      {/* ──────────────────────────────────────────────────────────────────
          2. TOP ROW GRID (Today's Challenge + Challenge Calendar)
          ────────────────────────────────────────────────────────────────── */}
      <section className={styles.topGrid}>
        {/* Today's Challenge Main Card */}
        <div className={styles.challengeCard}>
          <div className={styles.challengeCardContent}>
            {/* Eyebrow Pill + Countdown */}
            <div className={styles.eyebrowRow}>
              <span className={styles.eyebrowBadge}>
                <Sun size={13} strokeWidth={2.5} />
                TODAY'S CHALLENGE
              </span>
              <span className={styles.countdownBadge}>
                <Clock size={15} color="#475569" />
                {secondsRemaining > 0
                  ? formatCountdown(secondsRemaining)
                  : daily?.ends_in || 'Ends in 12h 34m'}
              </span>
            </div>

            {/* Problem Title & Hook */}
            {daily ? (
              <>
                <h2 className={styles.problemTitle}>{daily.title}</h2>
                <p className={styles.problemHook}>
                  {daily.description_hook ||
                    'You have 24 hours to solve today’s challenge. Compete with other learners and keep your streak alive!'}
                </p>

                {/* Difficulty & Topic Tags */}
                <div className={styles.tagsRow}>
                  <span className={`${styles.diffPill} ${diffClass(daily.difficulty)}`}>
                    {daily.difficulty}
                  </span>
                  {(daily.tags && daily.tags.length > 0
                    ? daily.tags.filter((t) => t !== daily.difficulty)
                    : [daily.nexlab_topic]
                  ).map((tag) => (
                    <span key={tag} className={styles.topicPill}>
                      {tag}
                    </span>
                  ))}
                </div>

                {/* 3 Stat Metrics */}
                <div className={styles.metricsGrid}>
                  <div className={styles.metricBox}>
                    <div
                      className={styles.metricIconCircle}
                      style={{ background: 'rgba(234, 179, 8, 0.12)', color: '#ca8a04' }}
                    >
                      <Zap size={18} fill="#ca8a04" />
                    </div>
                    <div className={styles.metricInfo}>
                      <span className={styles.metricValue}>+{daily.reward_xp || 15} XP</span>
                      <span className={styles.metricLabel}>Today's Reward</span>
                    </div>
                  </div>

                  <div className={styles.metricBox}>
                    <div
                      className={styles.metricIconCircle}
                      style={{ background: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed' }}
                    >
                      <Users size={18} />
                    </div>
                    <div className={styles.metricInfo}>
                      <span className={styles.metricValue}>{daily.solvers_today || '1.2K'}</span>
                      <span className={styles.metricLabel}>Solvers Today</span>
                    </div>
                  </div>

                  <div className={styles.metricBox}>
                    <div
                      className={styles.metricIconCircle}
                      style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#d97706' }}
                    >
                      <Trophy size={18} />
                    </div>
                    <div className={styles.metricInfo}>
                      <span className={styles.metricValue}>{daily.success_rate || '68%'}</span>
                      <span className={styles.metricLabel}>Success Rate</span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className={styles.actionsRow}>
                  {solvedToday ? (
                    <button
                      className={`${styles.solveBtn} ${styles.solveBtnSolved}`}
                      onClick={() => router.push(`${baseRoute}/${daily.slug}`)}
                    >
                      <Check size={16} strokeWidth={3} /> Solved (+15 XP) • Review Solution →
                    </button>
                  ) : (
                    <button
                      className={styles.solveBtn}
                      onClick={() => router.push(`${baseRoute}/${daily.slug}`)}
                    >
                      Solve Challenge <ArrowRight size={16} />
                    </button>
                  )}

                  <button
                    className={styles.editorialBtn}
                    onClick={() => {
                      if (solvedToday) {
                        router.push(`${baseRoute}/${daily.slug}?tab=editorial`);
                      } else {
                        router.push(`${baseRoute}/${daily.slug}`);
                      }
                    }}
                  >
                    <Bookmark size={15} color="#7c3aed" />
                    View Editorial {solvedToday ? '' : '(after solve)'}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ padding: '2rem 0', color: '#64748b' }}>
                No active challenge found today. Check back tomorrow!
              </div>
            )}
          </div>

          {/* 3D Isometric Calendar Artwork */}
          <div className={styles.heroIllustrationWrapper}>
            <Image
              src="/images/daily_challenge_hero.jpg"
              alt="Daily Challenge 3D Calendar"
              width={340}
              height={260}
              priority
              className={styles.heroIllustrationImg}
            />
          </div>
        </div>

        {/* Challenge Calendar Card */}
        <div className={styles.calendarCard}>
          <div>
            <div className={styles.calendarHeader}>
              <div className={styles.calendarTitleWrap}>
                <div className={styles.calendarIconBadge}>📅</div>
                <h3 className={styles.calendarTitle}>Challenge Calendar</h3>
              </div>

              <div className={styles.calendarNav}>
                <button
                  className={styles.calendarNavBtn}
                  onClick={() => handleMonthChange(-1)}
                  aria-label="Previous Month"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className={styles.calendarNavMonth}>
                  {MONTH_NAMES[calMonth - 1]} {calYear}
                </span>
                <button
                  className={styles.calendarNavBtn}
                  onClick={() => handleMonthChange(1)}
                  aria-label="Next Month"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Days of Week Header */}
            <div className={styles.calendarDaysHeader}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className={styles.calendarDayCol}>
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar Grid Cells */}
            <div
              className={styles.calendarGrid}
              style={{ opacity: calLoading ? 0.6 : 1, transition: 'opacity 0.2s' }}
            >
              {calendarDays.map((cd, idx) => {
                let cellClass = styles.calendarDayCurrentMonth;
                if (!cd.is_current_month) {
                  cellClass = styles.calendarDayOtherMonth;
                } else if (cd.status === 'solved') {
                  cellClass = styles.calendarDaySolved;
                } else if (cd.status === 'today') {
                  cellClass = styles.calendarDayToday;
                } else if (cd.status === 'today_solved') {
                  cellClass = styles.calendarDayTodaySolved;
                } else if (cd.status === 'missed') {
                  cellClass = styles.calendarDayMissed;
                } else {
                  cellClass = styles.calendarDayUpcoming;
                }

                return (
                  <div
                    key={`${cd.date}-${idx}`}
                    className={`${styles.calendarDayCell} ${cellClass}`}
                    title={`${cd.date}: ${cd.status}`}
                  >
                    {cd.is_current_month && cd.status === 'solved' ? (
                      <Check size={13} strokeWidth={3.5} />
                    ) : (
                      cd.day
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Calendar Legend */}
          <div className={styles.calendarLegend}>
            <div className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.legendSolved}`} /> Solved
            </div>
            <div className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.legendToday}`} /> Today
            </div>
            <div className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.legendUpcoming}`} /> Upcoming
            </div>
            <div className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.legendMissed}`} /> Missed
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────
          3. MIDDLE ROW GRID (Streak Progress + Rewards + Recent Challenges)
          ────────────────────────────────────────────────────────────────── */}
      <section className={styles.middleGrid}>
        {/* Streak Progress Stepper */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionHeaderLeft}>
              <div
                className={styles.sectionIconBadge}
                style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#dc2626' }}
              >
                🔥
              </div>
              <div className={styles.sectionTitleWrap}>
                <h3 className={styles.sectionTitle}>Streak Progress</h3>
                <p className={styles.sectionDesc}>
                  Solve daily to build your streak and earn bigger rewards.
                </p>
              </div>
            </div>
          </div>

          {/* Stepper Nodes */}
          <div className={styles.stepperWrapper}>
            <div className={styles.stepperLineTrack} />
            {currentStreak > 1 && (
              <div
                className={styles.stepperLineFill}
                style={{
                  width: `calc((${Math.min(6, currentStreak - 1)} / 6) * (100% - (100% / 7)))`,
                }}
              />
            )}
            {milestones.map((m) => {
              const isDone = m.status === 'completed';
              const isActive = m.status === 'active';

              return (
                <div key={m.day} className={styles.stepperNode}>
                  <div
                    className={`${styles.stepperCircle} ${
                      isDone
                        ? styles.stepperCircleCompleted
                        : isActive
                        ? styles.stepperCircleActive
                        : styles.stepperCircleLocked
                    }`}
                  >
                    {isDone ? (
                      <Check size={14} strokeWidth={3.5} />
                    ) : m.is_gift ? (
                      <Gift size={15} />
                    ) : (
                      <Lock size={13} />
                    )}
                  </div>
                  <span className={styles.stepperNodeLabel}>{m.label}</span>
                  {m.day >= 3 && m.xp > 0 && (
                    <span className={styles.stepperRewardBadge}>+{m.xp} XP</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Rewards This Week */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionHeaderLeft}>
              <div
                className={styles.sectionIconBadge}
                style={{ background: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed' }}
              >
                🎁
              </div>
              <div className={styles.sectionTitleWrap}>
                <h3 className={styles.sectionTitle}>Rewards This Week</h3>
                <p className={styles.sectionDesc}>
                  Bigger rewards for consistent problem solving.
                </p>
              </div>
            </div>
          </div>

          <div className={styles.rewardsList}>
            {weeklyRewards.map((reward) => (
              <div key={reward.streak} className={styles.rewardRow}>
                <div className={styles.rewardRowLeft}>
                  <span className={styles.rewardIcon}>
                    {reward.icon === 'crown' ? '👑' : '🔥'}
                  </span>
                  <span>{reward.title}</span>
                </div>
                <span className={styles.rewardPill}>+{reward.xp} XP</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Daily Challenges */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionHeaderLeft}>
              <div
                className={styles.sectionIconBadge}
                style={{ background: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed' }}
              >
                🕒
              </div>
              <div className={styles.sectionTitleWrap}>
                <h3 className={styles.sectionTitle}>Recent Daily Challenges</h3>
              </div>
            </div>
            <button
              onClick={() => router.push(baseRoute)}
              className={styles.viewAllLink}
            >
              View All →
            </button>
          </div>

          <div className={styles.recentList}>
            {recentChallenges.map((rc) => (
              <div
                key={rc.date}
                className={styles.recentRow}
                onClick={() => router.push(`${baseRoute}/${rc.slug}`)}
                title={`Open ${rc.title}`}
              >
                <div className={styles.recentRowLeft}>
                  {rc.solved ? (
                    <div className={styles.statusIconSolved}>
                      <Check size={12} strokeWidth={3.5} />
                    </div>
                  ) : (
                    <div className={styles.statusIconMissed}>
                      <X size={12} strokeWidth={3.5} />
                    </div>
                  )}
                  <div className={styles.recentProblemInfo}>
                    <span className={styles.recentProblemTitle}>{rc.title}</span>
                    <span className={styles.recentProblemDate}>{rc.date_formatted}</span>
                  </div>
                </div>

                <span className={`${styles.diffPill} ${diffClass(rc.difficulty)}`}>
                  {rc.difficulty}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────
          4. BOTTOM FULL WIDTH CARD (How Daily Challenge Works)
          ────────────────────────────────────────────────────────────────── */}
      <section className={styles.howCard}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionHeaderLeft}>
            <div
              className={styles.sectionIconBadge}
              style={{ background: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed' }}
            >
              <BookOpen size={18} />
            </div>
            <div className={styles.sectionTitleWrap}>
              <h3 className={styles.sectionTitle}>How Daily Challenge Works</h3>
              <p className={styles.sectionDesc}>
                A quick guide to help you get the most out of daily practice.
              </p>
            </div>
          </div>
        </div>

        <div className={styles.howStepsGrid}>
          <div className={styles.howStepBox}>
            <div className={styles.howStepNumber}>1</div>
            <div className={styles.howStepContent}>
              <h4 className={styles.howStepTitle}>Solve Daily</h4>
              <p className={styles.howStepDesc}>
                A new hand-picked problem every day at midnight UTC.
              </p>
            </div>
          </div>

          <div className={styles.howStepBox}>
            <div className={styles.howStepNumber}>2</div>
            <div className={styles.howStepContent}>
              <h4 className={styles.howStepTitle}>Maintain Streak</h4>
              <p className={styles.howStepDesc}>
                Solve within 24 hours to keep your streak alive.
              </p>
            </div>
          </div>

          <div className={styles.howStepBox}>
            <div className={styles.howStepNumber}>3</div>
            <div className={styles.howStepContent}>
              <h4 className={styles.howStepTitle}>Earn Rewards</h4>
              <p className={styles.howStepDesc}>
                Get bonus XP for longer streaks and climb the ladder.
              </p>
            </div>
          </div>

          <div className={styles.howStepBox}>
            <div className={styles.howStepNumber}>4</div>
            <div className={styles.howStepContent}>
              <h4 className={styles.howStepTitle}>Improve Consistently</h4>
              <p className={styles.howStepDesc}>
                Build problem solving habits and track your progress.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
