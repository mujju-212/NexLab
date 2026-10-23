'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Trophy,
  Flame,
  Award,
  Sparkles,
  CheckCircle2,
  Lock,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  Target,
  Clock,
  Lightbulb,
  BarChart2,
  PieChart,
  Shield,
  FileText,
  AlertCircle,
  TrendingUp,
  Info,
  Edit2,
  Calendar,
  X,
  Search,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import {
  studentAnalyticsService,
  type PlatformDashboardResponse,
  type ContentUnlocksResponse,
  type PracticeMasteryItem,
  type PlatformLeaderboardResponse,
} from '@/services/student-analytics.service';
import styles from './PlatformDashboard.module.css';

interface PlatformTabProps {
  standing?: any;
  unlocks?: ContentUnlocksResponse | any;
  practiceMastery?: PracticeMasteryItem[];
  leaderboardData?: PlatformLeaderboardResponse | null;
  leaderboardLoading?: boolean;
  boardScope?: 'global' | 'topic' | 'institution';
  boardPeriod?: 'all_time' | 'monthly' | 'weekly';
  boardTopic?: string;
  onScopeChange?: (scope: 'global' | 'topic' | 'institution') => void;
  onPeriodChange?: (period: 'all_time' | 'monthly' | 'weekly') => void;
  onTopicChange?: (topic: string) => void;
  onNavigateTab?: (tab: string) => void;
  dateRange?: string;
}

export const PlatformTab: React.FC<PlatformTabProps> = ({
  onNavigateTab,
  dateRange,
}) => {
  const { user } = useAuthStore();

  // ── Filter State ────────────────────────────────────────────────────────────
  const [selectedProblemType, setSelectedProblemType] = useState<string>('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [selectedTopic, setSelectedTopic] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('30d');

  // Synchronize with top global date filter
  useEffect(() => {
    if (dateRange) {
      const mapped = dateRange === 'all' ? 'all_time' : `${dateRange}d`;
      setSelectedPeriod(mapped);
    }
  }, [dateRange]);

  // Dropdown open states
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Topic performance view toggle: 'strongest' | 'needs_focus'
  const [topicTab, setTopicTab] = useState<'strongest' | 'needs_focus'>('strongest');

  // Leaderboard scope: 'global' | 'topic' | 'friends' | 'institution'
  const [leaderboardScope, setLeaderboardScope] = useState<'global' | 'topic' | 'friends' | 'institution'>('global');

  // Activity trend hovered week index (null by default so tooltip only shows on hover)
  const [hoveredWeekIndex, setHoveredWeekIndex] = useState<number | null>(null);
  const [activityTrendWindow, setActivityTrendWindow] = useState<'12w' | '8w' | '4w'>('12w');

  // Interactive hover states for Difficulty Donut
  const [hoveredDiff, setHoveredDiff] = useState<'easy' | 'medium' | 'hard' | null>(null);

  // Modal dialog states
  const [activeModal, setActiveModal] = useState<'badges' | 'topics' | 'submissions' | 'leaderboard' | 'quote' | null>(null);
  const [customQuote, setCustomQuote] = useState<string>('');
  const [quoteInput, setQuoteInput] = useState<string>('');
  const [submissionFilter, setSubmissionFilter] = useState<'all' | 'accepted' | 'wrong'>('all');
  const [modalTopicTab, setModalTopicTab] = useState<'all' | 'strongest' | 'needs_focus'>('all');

  // ── TanStack Query to Fetch Real Backend Platform Analytics ─────────────────
  const { data: dashboardData, isLoading, isError, error, refetch } = useQuery<PlatformDashboardResponse>({
    queryKey: ['student-platform-dashboard', selectedProblemType, selectedDifficulty, selectedTopic, selectedPeriod],
    queryFn: () =>
      studentAnalyticsService.getPlatformDashboard({
        problem_type: selectedProblemType !== 'all' ? selectedProblemType : undefined,
        difficulty: selectedDifficulty !== 'all' ? selectedDifficulty : undefined,
        topic: selectedTopic !== 'all' ? selectedTopic : undefined,
        period: selectedPeriod,
      }),
    staleTime: 60 * 1000,
  });

  // Profile comes from the API; blank until it answers (no invented identity).
  const profile = dashboardData?.student_profile || { id: '', name: null, department_year: null, avatar_url: null };

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('nexlab_student_quote') : null;
    if (saved) {
      setCustomQuote(saved);
      setQuoteInput(saved);
    }
  }, []);

  const handleSaveQuote = () => {
    if (quoteInput.trim()) {
      setCustomQuote(quoteInput.trim());
      if (typeof window !== 'undefined') {
        localStorage.setItem('nexlab_student_quote', quoteInput.trim());
      }
    }
    setActiveModal(null);
  };

  const displayName = user?.full_name || profile.name || '';
  const displayDept = (user as any)?.department ? `${(user as any).department} • Student` : profile.department_year || '';
  const studentInitials = useMemo(() => {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return displayName.slice(0, 2).toUpperCase();
  }, [displayName]);

  const standing = dashboardData?.standing || {
    rating: null, rating_delta: null, sparkline_rating: [], global_rank: null,
    global_percentile: null, top_percent: null, level: null, level_name: null,
    current_xp: null, next_level_xp: null, streak_days: null, week_dots: [],
  };

  // Badge catalogue comes from the backend (locked/unlocked), never invented.
  const badges = dashboardData?.badges || [];

  const kpis = dashboardData?.kpi_metrics || {
    problems_solved: { value: 0, delta: null, breakdown: { easy: 0, medium: 0, hard: 0 }, bars: [] },
    acceptance_rate: { value: null, delta: null, sparkline: [] },
    avg_time: { value: null, delta: null, sparkline: [] },
    hints_used: { value: 0, delta: null, bars: [] },
  };

  const activityTrend = dashboardData?.activity_trend || {
    weeks: [],
    problems_series: [],
    xp_series: [],
    max_problems: 0,
    max_xp: 0,
  };

  const difficultyDist = dashboardData?.difficulty_distribution || {
    total: 0, easy: { count: 0, pct: 0, color: '#10b981' },
    medium: { count: 0, pct: 0, color: '#f59e0b' }, hard: { count: 0, pct: 0, color: '#ef4444' },
  };

  const topicPerf = dashboardData?.topic_performance || {
    strongest: [],
    needs_focus: [],
  };

  const visibleTrendData = useMemo(() => {
    const sliceCount = activityTrendWindow === '4w' ? 4 : activityTrendWindow === '8w' ? 8 : 12;
    const weeks = activityTrend.weeks.slice(-sliceCount);
    const problems = activityTrend.problems_series.slice(-sliceCount);
    const xp = activityTrend.xp_series.slice(-sliceCount);
    const maxP = Math.max(10, ...problems);
    const maxX = Math.max(500, ...xp);
    return {
      weeks,
      problems_series: problems,
      xp_series: xp,
      max_problems: maxP,
      max_xp: maxX,
    };
  }, [activityTrend, activityTrendWindow]);

  const recentSubmissions = dashboardData?.recent_submissions || [];

  const nextUnlocks = dashboardData?.next_unlocks || [];

  const leaderboardEntries = useMemo(() => {
    if (dashboardData?.leaderboard?.entries?.length) {
      return dashboardData.leaderboard.entries;
    }
    // No leaderboard rows from the API => show none (the UI renders an empty state).
    return [];
  }, [dashboardData]);

  // Filter options come from catalog rows (Problem.source, is_daily, difficulty, topics).
  const problemTypeOptions = dashboardData?.filter_options.problem_types ?? [];
  const difficultyOptions = dashboardData?.filter_options.difficulties ?? [];
  const topicOptions = dashboardData?.filter_options.topics ?? [];
  const periodOptions = (dashboardData?.filter_options.date_ranges ?? []).map((option) => option.id === 'all' ? { ...option, id: 'all_time' } : option);

  // Helper function to render SVG sparklines
  const renderSparkline = (data: number[], strokeColor: string, fillColor?: string) => {
    if (!data || data.length === 0) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const width = 80;
    const height = 24;
    const points = data.map((val, idx) => {
      const x = (idx / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    });
    if (!points || points.length < 2) return null;
    const pathD = `M ${points.join(' L ')}`;
    const areaD = `${pathD} L ${width},${height} L 0,${height} Z`;

    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
        {fillColor && <path d={areaD} fill={fillColor} opacity={0.15} />}
        <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  };

  // Helper for mini bar charts
  const renderMiniBars = (bars: number[], color: string) => {
    const max = Math.max(...bars, 1);
    return (
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '22px' }}>
        {bars.map((b, i) => {
          const heightPct = Math.max(15, (b / max) * 100);
          return (
            <div
              key={i}
              style={{
                width: '4px',
                height: `${heightPct}%`,
                background: color,
                borderRadius: '2px',
                opacity: i === bars.length - 1 ? 1 : 0.65,
              }}
            />
          );
        })}
      </div>
    );
  };

  // Level Ring calculations
  const levelPct = standing.current_xp != null && standing.next_level_xp != null && standing.next_level_xp > 0 ? Math.min(100, Math.round((standing.current_xp / standing.next_level_xp) * 100)) : null;
  const ringRadius = 26;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - ((levelPct ?? 0) / 100) * ringCircumference;

  // Donut chart calculations for Difficulty Distribution
  const totalSolved = difficultyDist.total;
  const easyPct = difficultyDist.easy.pct;
  const medPct = difficultyDist.medium.pct;
  const hardPct = difficultyDist.hard.pct;

  const donutR = 52;
  const donutC = 2 * Math.PI * donutR;
  const easyStroke = (easyPct / 100) * donutC;
  const medStroke = (medPct / 100) * donutC;
  const hardStroke = (hardPct / 100) * donutC;

  if (isLoading) return <div className={styles.dashboard} style={{ padding: '2rem', color: '#64748b' }}>Loading practice records…</div>;
  if (isError) return <div role="alert" className={styles.dashboard} style={{ padding: '2rem', color: '#991b1b' }}>Could not load practice analytics. No sample values are shown. <button onClick={() => refetch()}>Retry</button></div>;

  return (
    <div className={styles.dashboard}>
      {/* ── TOP FILTER BAR ─────────────────────────────────────────────────── */}
      <div className={styles.filterBar}>
        {/* Filter 1: Problem Type */}
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Problem Type:</span>
          <button
            type="button"
            className={`${styles.filterBtn} ${openDropdown === 'problem_type' ? styles.filterBtnActive : ''}`}
            onClick={() => setOpenDropdown(openDropdown === 'problem_type' ? null : 'problem_type')}
          >
            <span>{problemTypeOptions.find((o) => o.id === selectedProblemType)?.label || 'All Problems'}</span>
            <ChevronDown size={14} />
          </button>
          {openDropdown === 'problem_type' && (
            <ul className={styles.dropdownMenu}>
              {problemTypeOptions.map((opt) => (
                <li
                  key={opt.id}
                  className={`${styles.dropdownItem} ${selectedProblemType === opt.id ? styles.dropdownItemActive : ''}`}
                  onClick={() => {
                    setSelectedProblemType(opt.id);
                    setOpenDropdown(null);
                  }}
                >
                  {opt.label}
                  {selectedProblemType === opt.id && <CheckCircle2 size={13} />}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Filter 2: Difficulty */}
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Difficulty:</span>
          <button
            type="button"
            className={`${styles.filterBtn} ${openDropdown === 'difficulty' ? styles.filterBtnActive : ''}`}
            onClick={() => setOpenDropdown(openDropdown === 'difficulty' ? null : 'difficulty')}
          >
            <span>{difficultyOptions.find((o) => o.id === selectedDifficulty)?.label || 'All'}</span>
            <ChevronDown size={14} />
          </button>
          {openDropdown === 'difficulty' && (
            <ul className={styles.dropdownMenu}>
              {difficultyOptions.map((opt) => (
                <li
                  key={opt.id}
                  className={`${styles.dropdownItem} ${selectedDifficulty === opt.id ? styles.dropdownItemActive : ''}`}
                  onClick={() => {
                    setSelectedDifficulty(opt.id);
                    setOpenDropdown(null);
                  }}
                >
                  {opt.label}
                  {selectedDifficulty === opt.id && <CheckCircle2 size={13} />}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Filter 3: Topic */}
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Topic:</span>
          <button
            type="button"
            className={`${styles.filterBtn} ${openDropdown === 'topic' ? styles.filterBtnActive : ''}`}
            onClick={() => setOpenDropdown(openDropdown === 'topic' ? null : 'topic')}
          >
            <span>{topicOptions.find((o) => o.id === selectedTopic)?.label || 'All Topics'}</span>
            <ChevronDown size={14} />
          </button>
          {openDropdown === 'topic' && (
            <ul className={styles.dropdownMenu}>
              {topicOptions.map((opt) => (
                <li
                  key={opt.id}
                  className={`${styles.dropdownItem} ${selectedTopic === opt.id ? styles.dropdownItemActive : ''}`}
                  onClick={() => {
                    setSelectedTopic(opt.id);
                    setOpenDropdown(null);
                  }}
                >
                  {opt.label}
                  {selectedTopic === opt.id && <CheckCircle2 size={13} />}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Filter 4: Date Range */}
        <div className={styles.filterGroup} style={{ marginLeft: 'auto' }}>
          <button
            type="button"
            className={`${styles.filterBtn} ${openDropdown === 'period' ? styles.filterBtnActive : ''}`}
            onClick={() => setOpenDropdown(openDropdown === 'period' ? null : 'period')}
          >
            <Calendar size={13} style={{ color: '#64748b' }} />
            <span>{periodOptions.find((o) => o.id === selectedPeriod)?.label || 'Last 30 Days'}</span>
            <ChevronDown size={14} />
          </button>
          {openDropdown === 'period' && (
            <ul className={styles.dropdownMenu} style={{ right: 0, left: 'auto' }}>
              {periodOptions.map((opt) => (
                <li
                  key={opt.id}
                  className={`${styles.dropdownItem} ${selectedPeriod === opt.id ? styles.dropdownItemActive : ''}`}
                  onClick={() => {
                    setSelectedPeriod(opt.id);
                    setOpenDropdown(null);
                  }}
                >
                  {opt.label}
                  {selectedPeriod === opt.id && <CheckCircle2 size={13} />}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── ROW 1: STANDING HERO CARD & BADGES ──────────────────────────────── */}
      <div className={styles.topStandingRow}>
        {/* Left Hero Card: Profile | Rating | Level Ring | Streak */}
        <div className={styles.standingHeroCard}>
          {/* Zone 1: Profile */}
          <div className={styles.profileZone}>
            <div className={styles.avatarWrap}>
              <div className={styles.avatar}>
                {studentInitials}
              </div>
              <button
                type="button"
                className={styles.editBtn}
                title="Edit profile quote"
                onClick={() => {
                  setQuoteInput(customQuote);
                  setActiveModal('quote');
                }}
              >
                <Edit2 size={11} />
              </button>
            </div>
            <div className={styles.profileInfo}>
              <h3 className={styles.profileName}>{displayName}</h3>
              <div className={styles.profileSub}>{displayDept}</div>
              <div
                className={styles.profileQuote}
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setQuoteInput(customQuote);
                  setActiveModal('quote');
                }}
                title="Click to edit personal quote"
              >
                <span style={{ color: '#7c3aed', marginRight: '4px' }}>“</span>
                {customQuote}
                <span style={{ color: '#7c3aed', marginLeft: '4px' }}>”</span>
              </div>
            </div>
          </div>

          {/* Zone 2: Platform Rating */}
          <div className={styles.ratingZone}>
            <div className={styles.ratingHeader}>
              <div
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '4px',
                  background: '#fef3c7',
                  color: '#d97706',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Trophy size={12} />
              </div>
              <span className={styles.ratingLabel}>Platform Rating</span>
              <Info size={12} style={{ color: '#94a3b8', cursor: 'pointer' }} />
            </div>
            <div className={styles.ratingValueRow}>
              <span className={styles.ratingNum}>{standing.rating != null ? standing.rating.toLocaleString() : '—'}</span>
              {standing.rating_delta != null && <span className={styles.ratingBadge}>{standing.rating_delta >= 0 ? '+' : ''}{standing.rating_delta}</span>}
            </div>
            <div className={styles.ratingSub}>
              Global Rank <span style={{ fontWeight: 700, color: '#334155' }}>{standing.global_rank != null ? `#${standing.global_rank.toLocaleString()}` : 'Not ranked'}</span>{standing.top_percent != null ? <span style={{ color: '#7c3aed', fontWeight: 600 }}> (Top {standing.top_percent}%)</span> : null}
            </div>
            <div className={styles.ratingSparklineWrap}>
              {renderSparkline(standing.sparkline_rating, '#8b5cf6', '#c4b5fd')}
            </div>
          </div>

          {/* Zone 3: Level Ring */}
          <div className={styles.levelZone}>
            <div className={styles.ringSvgWrap}>
              <svg width="68" height="68" viewBox="0 0 68 68">
                {/* Background Ring */}
                <circle cx="34" cy="34" r={ringRadius} stroke="#f1f5f9" strokeWidth="5" fill="none" />
                {/* Foreground Progress */}
                <circle
                  cx="34"
                  cy="34"
                  r={ringRadius}
                  stroke="url(#purpleGrad)"
                  strokeWidth="5"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                  strokeLinecap="round"
                  fill="none"
                  transform="rotate(-90 34 34)"
                />
                <defs>
                  <linearGradient id="purpleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#c084fc" />
                    <stop offset="100%" stopColor="#7c3aed" />
                  </linearGradient>
                </defs>
              </svg>
              <div className={styles.ringCenter}>
                <Sparkles size={11} style={{ color: '#7c3aed', marginBottom: '1px' }} />
                <span className={styles.ringLevel}>{standing.level != null ? `Level ${standing.level}` : '—'}</span>
              </div>
            </div>
            <div className={styles.levelInfo}>
              <div className={styles.levelBadge}>{standing.level_name || 'Level unavailable'}</div>
              <div className={styles.xpProgressText}>
                {standing.current_xp == null ? 'XP progress unavailable' : standing.next_level_xp != null ? `${standing.current_xp.toLocaleString()} / ${standing.next_level_xp.toLocaleString()} XP` : `${standing.current_xp.toLocaleString()} XP`}
              </div>
              <div style={{ fontSize: '0.675rem', color: '#94a3b8', fontWeight: 500 }}>
                {standing.level != null ? `to Level ${standing.level + 1}` : ''}
              </div>
            </div>
          </div>

          {/* Zone 4: Practice Streak */}
          <div className={styles.streakZone}>
            <div className={styles.streakTop}>
              <div
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  background: '#ffedd5',
                  color: '#ea580c',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Flame size={15} />
              </div>
              <div>
                <div className={styles.streakBig}>{standing.streak_days != null ? `${standing.streak_days}-day` : '—'}</div>
                <div className={styles.streakLabel}>Practice Streak</div>
              </div>
            </div>
            <div className={styles.streakDotsRow}>
              {standing.week_dots.map((dot, idx) => (
                <div key={idx} className={styles.streakDotItem}>
                  <span className={styles.streakDotLetter}>{dot.day}</span>
                  <div className={`${styles.streakCircle} ${dot.active ? styles.streakCircleActive : ''}`} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Badges Card */}
        <div className={styles.badgesCard}>
          <div className={styles.cardHeader} style={{ marginBottom: '0.25rem' }}>
            <div className={styles.cardTitleWrap}>
              <Award size={16} className={styles.cardIcon} />
              <h3 className={styles.cardTitle}>Badges</h3>
            </div>
            <button
              type="button"
              className={styles.cardActionBtn}
              onClick={() => setActiveModal('badges')}
            >
              View All <ArrowRight size={13} />
            </button>
          </div>
          <div className={styles.badgesGrid}>
            {badges.map((b) => (
              <div key={b.id} className={styles.badgeItem}>
                <div
                  className={styles.badgeIconBox}
                  style={{
                    background: b.bg,
                    color: b.color,
                    border: `1px solid ${b.color}25`,
                  }}
                >
                  {b.badge_text || '★'}
                </div>
                <span className={styles.badgeTitle}>{b.title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── ROW 2: 4 KPI SUMMARY CARDS ───────────────────────────────────────── */}
      <div className={styles.kpiGrid}>
        {/* KPI 1: Problems Solved */}
        <div className={styles.kpiCard}>
          <div>
            <div className={styles.kpiTop}>
              <div className={styles.kpiIconBox} style={{ background: '#dcfce7', color: '#16a34a' }}>
                <CheckCircle2 size={18} />
              </div>
              <h4 className={styles.kpiTitle}>Problems Solved</h4>
            </div>
            <div className={styles.kpiValueRow}>
              <span className={styles.kpiValue}>{kpis.problems_solved.value ?? '—'}</span>
            </div>
          </div>
          <div className={styles.kpiBottomRow}>
            <div className={styles.kpiSubtext}>
              <span className={styles.diffDotsSpan}>
                <span style={{ color: '#10b981', fontWeight: 700 }}>● Easy {kpis.problems_solved.breakdown.easy}</span>
                <span style={{ color: '#f59e0b', fontWeight: 700 }}>● Med {kpis.problems_solved.breakdown.medium}</span>
                <span style={{ color: '#ef4444', fontWeight: 700 }}>● Hard {kpis.problems_solved.breakdown.hard}</span>
              </span>
            </div>
            {renderMiniBars(kpis.problems_solved.bars, '#38bdf8')}
          </div>
        </div>

        {/* KPI 2: Acceptance Rate */}
        <div className={styles.kpiCard}>
          <div>
            <div className={styles.kpiTop}>
              <div className={styles.kpiIconBox} style={{ background: '#fee2e2', color: '#ef4444' }}>
                <Target size={18} />
              </div>
              <h4 className={styles.kpiTitle}>Acceptance Rate</h4>
            </div>
            <div className={styles.kpiValueRow}>
              <span className={styles.kpiValue}>{kpis.acceptance_rate.value != null ? `${kpis.acceptance_rate.value}%` : '—'}</span>
            </div>
          </div>
          <div className={styles.kpiBottomRow}>
            <div className={styles.kpiSubtext}>Clean first-try passes</div>
            {renderSparkline(kpis.acceptance_rate.sparkline, '#10b981', '#a7f3d0')}
          </div>
        </div>

        {/* KPI 3: Avg. Time per Problem */}
        <div className={styles.kpiCard}>
          <div>
            <div className={styles.kpiTop}>
              <div className={styles.kpiIconBox} style={{ background: '#e0f2fe', color: '#0284c7' }}>
                <Clock size={18} />
              </div>
              <h4 className={styles.kpiTitle}>Avg. Time per Problem</h4>
            </div>
            <div className={styles.kpiValueRow}>
              <span className={styles.kpiValue}>{kpis.avg_time.value ?? '—'}</span>
            </div>
          </div>
          <div className={styles.kpiBottomRow}>
            <div className={styles.kpiSubtext}>Optimal speed & precision</div>
            {renderSparkline(kpis.avg_time.sparkline, '#0ea5e9', '#bae6fd')}
          </div>
        </div>

        {/* KPI 4: Hints Used */}
        <div className={styles.kpiCard}>
          <div>
            <div className={styles.kpiTop}>
              <div className={styles.kpiIconBox} style={{ background: '#fef3c7', color: '#d97706' }}>
                <Lightbulb size={18} />
              </div>
              <h4 className={styles.kpiTitle}>Hints Used</h4>
            </div>
            <div className={styles.kpiValueRow}>
              <span className={styles.kpiValue}>{kpis.hints_used.value ?? '—'}</span>
            </div>
          </div>
          <div className={styles.kpiBottomRow}>
            <div className={styles.kpiSubtext}>Decreasing dependency</div>
            {renderMiniBars(kpis.hints_used.bars, '#a855f7')}
          </div>
        </div>
      </div>

      {/* ── ROW 3: MIDDLE ROW (3 COLUMNS) ────────────────────────────────────── */}
      <div className={styles.activityRow}>
        {/* Column 1: Practice Activity Trend */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleWrap}>
              <BarChart2 size={18} className={styles.cardIcon} />
              <div>
                <h3 className={styles.cardTitle}>Practice Activity Trend</h3>
                <p className={styles.cardSubtitle}>Problems solved and XP gained over time.</p>
              </div>
            </div>
            <div className={styles.filterGroup}>
              <button
                type="button"
                className={styles.filterBtn}
                style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
                onClick={() => setOpenDropdown(openDropdown === 'activity_trend' ? null : 'activity_trend')}
              >
                <span>{activityTrendWindow === '12w' ? 'Last 12 Weeks' : activityTrendWindow === '8w' ? 'Last 8 Weeks' : 'Last 4 Weeks'}</span>
                <ChevronDown size={13} />
              </button>
              {openDropdown === 'activity_trend' && (
                <ul className={styles.dropdownMenu} style={{ right: 0, left: 'auto', minWidth: '130px' }}>
                  {[
                    { id: '12w', label: 'Last 12 Weeks' },
                    { id: '8w', label: 'Last 8 Weeks' },
                    { id: '4w', label: 'Last 4 Weeks' },
                  ].map((opt) => (
                    <li
                      key={opt.id}
                      className={`${styles.dropdownItem} ${activityTrendWindow === opt.id ? styles.dropdownItemActive : ''}`}
                      onClick={() => {
                        setActivityTrendWindow(opt.id as any);
                        setOpenDropdown(null);
                      }}
                    >
                      {opt.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Chart Legends */}
          <div className={styles.chartLegend}>
            <span className={styles.chartLegendItem}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#7c3aed' }} />
              Problems Solved
            </span>
            <span className={styles.chartLegendItem}>
              <span style={{ width: 8, height: 8, transform: 'rotate(45deg)', background: '#0284c7' }} />
              XP Gained
            </span>
          </div>

          {/* Combo SVG Dual-Axis Chart */}
          <div className={styles.chartContainer} onMouseLeave={() => setHoveredWeekIndex(null)}>
            <svg
              className={styles.chartSvg}
              viewBox="0 0 520 180"
              preserveAspectRatio="none"
            >
              {/* Horizontal Gridlines */}
              {[0, 1, 2, 3, 4].map((step) => {
                const y = 20 + step * 32;
                return (
                  <g key={step}>
                    <line x1="35" y1={y} x2="480" y2={y} className={styles.chartGridLine} />
                    {/* Left Axis: Problems */}
                    <text x="28" y={y + 4} textAnchor="end" className={styles.chartAxisText}>
                      {Math.round(visibleTrendData.max_problems - step * (visibleTrendData.max_problems / 4))}
                    </text>
                    {/* Right Axis: XP */}
                    <text x="488" y={y + 4} textAnchor="start" className={styles.chartAxisText}>
                      {Math.round(visibleTrendData.max_xp - step * (visibleTrendData.max_xp / 4))}
                    </text>
                  </g>
                );
              })}

              {/* XP Bars (Purple Columns) */}
              {visibleTrendData.weeks.map((week, idx) => {
                const colWidth = (450 - 50) / Math.max(1, visibleTrendData.weeks.length - 1);
                const x = 50 + idx * colWidth;
                const xpVal = visibleTrendData.xp_series[idx] || 0;
                const barHeight = visibleTrendData.max_xp > 0 ? (xpVal / visibleTrendData.max_xp) * 128 : 0;
                const y = 148 - barHeight;
                const isHovered = hoveredWeekIndex === idx;

                return (
                  <rect
                    key={`bar-${idx}`}
                    x={x - 8}
                    y={y}
                    width="16"
                    height={barHeight}
                    rx="3"
                    fill={isHovered ? '#7c3aed' : '#c4b5fd'}
                    opacity={isHovered ? 1 : 0.65}
                    style={{ transition: 'all 0.15s ease', cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredWeekIndex(idx)}
                  />
                );
              })}

              {/* Problems Line (Cyan) with circular dots */}
              <polyline
                fill="none"
                stroke="#0284c7"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={visibleTrendData.weeks
                  .map((_, idx) => {
                    const colWidth = (450 - 50) / Math.max(1, visibleTrendData.weeks.length - 1);
                    const x = 50 + idx * colWidth;
                    const probVal = visibleTrendData.problems_series[idx] || 0;
                    const y = visibleTrendData.max_problems > 0 ? 148 - (probVal / visibleTrendData.max_problems) * 128 : 148;
                    return `${x},${y}`;
                  })
                  .join(' ')}
              />

              {/* Vertex Dots */}
              {visibleTrendData.weeks.map((week, idx) => {
                const colWidth = (450 - 50) / Math.max(1, visibleTrendData.weeks.length - 1);
                const x = 50 + idx * colWidth;
                const probVal = visibleTrendData.problems_series[idx] || 0;
                const y = visibleTrendData.max_problems > 0 ? 148 - (probVal / visibleTrendData.max_problems) * 128 : 148;
                const isHovered = hoveredWeekIndex === idx;

                return (
                  <g key={`dot-${idx}`}>
                    <circle
                      cx={x}
                      cy={y}
                      r={isHovered ? 5 : 3.5}
                      fill="#ffffff"
                      stroke="#0284c7"
                      strokeWidth="2.5"
                      style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
                      onMouseEnter={() => setHoveredWeekIndex(idx)}
                    />
                    {/* Week label on bottom */}
                    <text x={x} y="168" textAnchor="middle" className={styles.chartAxisText}>
                      {week}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Hover Tooltip */}
            {hoveredWeekIndex !== null && visibleTrendData.weeks[hoveredWeekIndex] && (
              <div
                className={styles.chartTooltip}
                style={{
                  left: `${((50 + hoveredWeekIndex * ((450 - 50) / Math.max(1, visibleTrendData.weeks.length - 1))) / 520) * 100}%`,
                  top: '40%',
                }}
              >
                <div className={styles.tooltipTitle}>{visibleTrendData.weeks[hoveredWeekIndex]} Telemetry</div>
                <div className={styles.tooltipRow}>
                  <span style={{ color: '#93c5fd' }}>Problems Solved:</span>
                  <span style={{ fontWeight: 700 }}>{visibleTrendData.problems_series[hoveredWeekIndex]}</span>
                </div>
                <div className={styles.tooltipRow}>
                  <span style={{ color: '#d8b4fe' }}>XP Gained:</span>
                  <span style={{ fontWeight: 700 }}>+{visibleTrendData.xp_series[hoveredWeekIndex]} XP</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Difficulty Distribution Donut */}
        <div className={styles.card}>
          <div className={styles.cardHeader} style={{ marginBottom: '0.75rem' }}>
            <div className={styles.cardTitleWrap}>
              <PieChart size={18} className={styles.cardIcon} />
              <div>
                <h3 className={styles.cardTitle}>Difficulty Distribution</h3>
                <p className={styles.cardSubtitle}>Solved problems by difficulty level.</p>
              </div>
            </div>
          </div>

          <div className={styles.donutContainer}>
            <svg className={styles.donutSvg} viewBox="0 0 140 140">
              <circle cx="70" cy="70" r={donutR} stroke="#f1f5f9" strokeWidth="12" fill="none" />
              {/* Easy Arc */}
              <circle
                cx="70"
                cy="70"
                r={donutR}
                stroke="#10b981"
                strokeWidth={hoveredDiff === 'easy' ? 16 : 12}
                strokeDasharray={`${easyStroke} ${donutC - easyStroke}`}
                strokeDashoffset="0"
                strokeLinecap="round"
                fill="none"
                transform="rotate(-90 70 70)"
                className={styles.donutArcInteractive}
                style={{
                  opacity: hoveredDiff && hoveredDiff !== 'easy' ? 0.45 : 1,
                  filter: hoveredDiff === 'easy' ? 'drop-shadow(0 0 6px rgba(16, 185, 129, 0.4))' : 'none',
                }}
                onMouseEnter={() => setHoveredDiff('easy')}
                onMouseLeave={() => setHoveredDiff(null)}
              />
              {/* Medium Arc */}
              <circle
                cx="70"
                cy="70"
                r={donutR}
                stroke="#f59e0b"
                strokeWidth={hoveredDiff === 'medium' ? 16 : 12}
                strokeDasharray={`${medStroke} ${donutC - medStroke}`}
                strokeDashoffset={-easyStroke}
                strokeLinecap="round"
                fill="none"
                transform="rotate(-90 70 70)"
                className={styles.donutArcInteractive}
                style={{
                  opacity: hoveredDiff && hoveredDiff !== 'medium' ? 0.45 : 1,
                  filter: hoveredDiff === 'medium' ? 'drop-shadow(0 0 6px rgba(245, 158, 11, 0.4))' : 'none',
                }}
                onMouseEnter={() => setHoveredDiff('medium')}
                onMouseLeave={() => setHoveredDiff(null)}
              />
              {/* Hard Arc */}
              <circle
                cx="70"
                cy="70"
                r={donutR}
                stroke="#ef4444"
                strokeWidth={hoveredDiff === 'hard' ? 16 : 12}
                strokeDasharray={`${hardStroke} ${donutC - hardStroke}`}
                strokeDashoffset={-(easyStroke + medStroke)}
                strokeLinecap="round"
                fill="none"
                transform="rotate(-90 70 70)"
                className={styles.donutArcInteractive}
                style={{
                  opacity: hoveredDiff && hoveredDiff !== 'hard' ? 0.45 : 1,
                  filter: hoveredDiff === 'hard' ? 'drop-shadow(0 0 6px rgba(239, 68, 68, 0.4))' : 'none',
                }}
                onMouseEnter={() => setHoveredDiff('hard')}
                onMouseLeave={() => setHoveredDiff(null)}
              />
            </svg>

            <div className={styles.donutCenterText}>
              {hoveredDiff === 'easy' ? (
                <>
                  <div className={styles.donutTotalBig} style={{ color: '#10b981' }}>{difficultyDist.easy.count}</div>
                  <div className={styles.donutTotalLabel}>Easy ({difficultyDist.easy.pct}%)</div>
                </>
              ) : hoveredDiff === 'medium' ? (
                <>
                  <div className={styles.donutTotalBig} style={{ color: '#f59e0b' }}>{difficultyDist.medium.count}</div>
                  <div className={styles.donutTotalLabel}>Medium ({difficultyDist.medium.pct}%)</div>
                </>
              ) : hoveredDiff === 'hard' ? (
                <>
                  <div className={styles.donutTotalBig} style={{ color: '#ef4444' }}>{difficultyDist.hard.count}</div>
                  <div className={styles.donutTotalLabel}>Hard ({difficultyDist.hard.pct}%)</div>
                </>
              ) : (
                <>
                  <div className={styles.donutTotalBig}>{totalSolved}</div>
                  <div className={styles.donutTotalLabel}>Solved</div>
                </>
              )}
            </div>
          </div>

          {/* Breakdown List */}
          <div className={styles.diffBreakdownList}>
            <div
              className={`${styles.diffBreakdownRow} ${styles.diffBreakdownRowInteractive}`}
              style={{ background: hoveredDiff === 'easy' ? '#f0fdf4' : 'transparent' }}
              onMouseEnter={() => setHoveredDiff('easy')}
              onMouseLeave={() => setHoveredDiff(null)}
            >
              <span>
                <span className={styles.diffDot} style={{ background: '#10b981' }} />
                Easy
              </span>
              <span>
                <span className={styles.diffCount}>{difficultyDist.easy.count}</span>
                <span className={styles.diffPct}>{difficultyDist.easy.pct}%</span>
              </span>
            </div>
            <div
              className={`${styles.diffBreakdownRow} ${styles.diffBreakdownRowInteractive}`}
              style={{ background: hoveredDiff === 'medium' ? '#fffbeb' : 'transparent' }}
              onMouseEnter={() => setHoveredDiff('medium')}
              onMouseLeave={() => setHoveredDiff(null)}
            >
              <span>
                <span className={styles.diffDot} style={{ background: '#f59e0b' }} />
                Medium
              </span>
              <span>
                <span className={styles.diffCount}>{difficultyDist.medium.count}</span>
                <span className={styles.diffPct}>{difficultyDist.medium.pct}%</span>
              </span>
            </div>
            <div
              className={`${styles.diffBreakdownRow} ${styles.diffBreakdownRowInteractive}`}
              style={{ background: hoveredDiff === 'hard' ? '#fef2f2' : 'transparent' }}
              onMouseEnter={() => setHoveredDiff('hard')}
              onMouseLeave={() => setHoveredDiff(null)}
            >
              <span>
                <span className={styles.diffDot} style={{ background: '#ef4444' }} />
                Hard
              </span>
              <span>
                <span className={styles.diffCount}>{difficultyDist.hard.count}</span>
                <span className={styles.diffPct}>{difficultyDist.hard.pct}%</span>
              </span>
            </div>
          </div>
        </div>

        {/* Column 3: Topic Performance */}
        <div className={styles.card}>
          <div className={styles.cardHeader} style={{ marginBottom: '0.75rem' }}>
            <div className={styles.cardTitleWrap}>
              <Shield size={18} className={styles.cardIcon} />
              <div>
                <h3 className={styles.cardTitle}>Topic Performance</h3>
                <p className={styles.cardSubtitle}>Your strongest and weakest practice topics.</p>
              </div>
            </div>
            <button
              type="button"
              className={styles.cardActionBtn}
              onClick={() => setActiveModal('topics')}
            >
              View All <ArrowRight size={13} />
            </button>
          </div>

          {/* Toggle Pills: Strongest / Needs Focus */}
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '0.5rem' }}>
            <div className={styles.topicFilterPills}>
              <button
                type="button"
                className={`${styles.topicPill} ${topicTab === 'strongest' ? styles.topicPillActiveGreen : ''}`}
                onClick={() => setTopicTab('strongest')}
              >
                <CheckCircle2 size={12} />
                <span>Strongest</span>
              </button>
              <button
                type="button"
                className={`${styles.topicPill} ${topicTab === 'needs_focus' ? styles.topicPillActiveAmber : ''}`}
                onClick={() => setTopicTab('needs_focus')}
              >
                <AlertCircle size={12} />
                <span>Needs Focus</span>
              </button>
            </div>
          </div>

          {/* Progress Rows or Clean Zero-State */}
          <div className={styles.topicList}>
            {(topicTab === 'strongest' ? topicPerf.strongest : topicPerf.needs_focus).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem 1rem', color: '#64748b' }}>
                <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600 }}>No practice attempts recorded yet.</p>
                <p style={{ margin: '0.25rem 0 0.85rem', fontSize: '0.75rem', color: '#94a3b8' }}>
                  Solve practice problems to build your topic mastery profile.
                </p>
                <Link
                  href="/student/practice"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.4rem 0.85rem',
                    background: '#f5f3ff',
                    color: '#7c3aed',
                    borderRadius: '0.5rem',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    textDecoration: 'none',
                  }}
                >
                  <span>Start Practice</span>
                  <ArrowRight size={12} />
                </Link>
              </div>
            ) : (
              (topicTab === 'strongest' ? topicPerf.strongest : topicPerf.needs_focus).map((item, idx) => (
                <div key={idx} className={styles.topicRow}>
                  <span className={styles.topicName} title={item.topic}>
                    {item.topic}
                  </span>
                  <div className={styles.topicBarTrack}>
                    <div
                      className={styles.topicBarFill}
                      style={{
                        width: `${item.pct}%`,
                        background: item.color,
                      }}
                    />
                  </div>
                  <span className={styles.topicPctText}>{item.pct}%</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── ROW 4: BOTTOM ROW (3 COLUMNS) ────────────────────────────────────── */}
      <div className={styles.bottomRow}>
        {/* Column 1: Recent Practice Submissions */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleWrap}>
              <FileText size={18} className={styles.cardIcon} />
              <div>
                <h3 className={styles.cardTitle}>Recent Practice Submissions</h3>
                <p className={styles.cardSubtitle}>Your latest submissions with results and time taken.</p>
              </div>
            </div>
            <button
              type="button"
              className={styles.cardActionBtn}
              onClick={() => setActiveModal('submissions')}
            >
              View All <ArrowRight size={13} />
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className={styles.recentTable}>
              <thead>
                <tr>
                  <th>Problem</th>
                  <th>Difficulty</th>
                  <th>Result</th>
                  <th>Time</th>
                  <th>XP</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentSubmissions.map((sub) => (
                  <tr key={sub.id}>
                    <td className={styles.probName}>{sub.problem}</td>
                    <td>
                      <span
                        className={`${styles.diffBadge} ${
                          sub.difficulty === 'Easy'
                            ? styles.diffEasy
                            : sub.difficulty === 'Medium'
                            ? styles.diffMedium
                            : styles.diffHard
                        }`}
                      >
                        {sub.difficulty}
                      </span>
                    </td>
                    <td>
                      <span className={sub.is_accepted ? styles.resultAccepted : styles.resultWrong}>
                        {sub.result}
                      </span>
                    </td>
                    <td style={{ color: '#64748b', fontSize: '0.75rem' }}>{sub.time}</td>
                    <td className={sub.is_accepted ? styles.xpGain : ''} style={{ fontSize: '0.75rem' }}>
                      {sub.xp}
                    </td>
                    <td className={styles.dateCell}>{sub.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Column 2: Next Unlocks */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleWrap}>
              <Lock size={18} className={styles.cardIcon} />
              <div>
                <h3 className={styles.cardTitle}>Next Unlocks</h3>
                <p className={styles.cardSubtitle}>Keep practicing to unlock more content.</p>
              </div>
            </div>
          </div>

          <div className={styles.unlocksList}>
            {nextUnlocks.map((u) => (
              <div key={u.id} className={styles.unlockItem}>
                <div className={styles.unlockIconBox} style={{ background: u.icon_bg, color: u.color }}>
                  <Lock size={15} />
                </div>
                <div className={styles.unlockContent}>
                  <div className={styles.unlockTitleRow}>
                    <h5 className={styles.unlockTitle}>{u.title}</h5>
                    <span className={styles.unlockCount}>
                      {u.current != null ? `${u.current.toLocaleString()} / ${u.target.toLocaleString()}` : `— / ${u.target.toLocaleString()}`}
                    </span>
                  </div>
                  <div className={styles.unlockTrack}>
                    <div
                      className={styles.unlockFill}
                      style={{
                        width: `${u.current != null ? Math.min(100, (u.current / u.target) * 100) : 0}%`,
                        background: u.color,
                      }}
                    />
                  </div>
                  <p className={styles.unlockReward}>
                    <Sparkles size={11} style={{ color: u.color }} />
                    {u.reward}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Column 3: Leaderboards (Platform) */}
        <div className={styles.card}>
          <div className={styles.cardHeader} style={{ marginBottom: '0.65rem' }}>
            <div className={styles.cardTitleWrap}>
              <Trophy size={18} className={styles.cardIcon} />
              <h3 className={styles.cardTitle}>Leaderboards (Platform)</h3>
            </div>
            <button
              type="button"
              className={styles.cardActionBtn}
              onClick={() => setActiveModal('leaderboard')}
            >
              View All <ArrowRight size={13} />
            </button>
          </div>

          {/* Scope Pills: Global | Topic | Friends | Institution */}
          <div className={styles.scopePillsRow}>
            {(['global', 'topic', 'friends', 'institution'] as const).map((sc) => (
              <button
                key={sc}
                type="button"
                className={`${styles.scopePill} ${leaderboardScope === sc ? styles.scopePillActive : ''}`}
                onClick={() => setLeaderboardScope(sc)}
              >
                {sc === 'global'
                  ? 'Global'
                  : sc === 'topic'
                  ? 'Topic'
                  : sc === 'friends'
                  ? 'Friends'
                  : 'Institution'}
              </button>
            ))}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className={styles.leaderboardTable}>
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>Rank</th>
                  <th>Student</th>
                  <th style={{ textAlign: 'right' }}>Rating</th>
                </tr>
              </thead>
              <tbody>
                {leaderboardEntries.map((entry) => (
                  <tr key={entry.rank} className={entry.is_current_user ? styles.currentUserRow : ''}>
                    <td className={styles.rankNum}>#{entry.rank}</td>
                    <td>
                      <div className={styles.userCell}>
                        <div className={styles.miniAvatar} style={{ background: entry.avatar_color }}>
                          {entry.initials}
                        </div>
                        <span className={styles.leaderName}>{entry.name}</span>
                      </div>
                    </td>
                    <td className={styles.ratingCell}>{entry.rating != null ? entry.rating.toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── MODALS & DRAWERS ── */}

      {/* 1. Edit Profile Quote Modal */}
      {activeModal === 'quote' && (
        <div className={styles.modalOverlay} onClick={() => setActiveModal(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <h3>Edit Profile Quote</h3>
                <p>Personalize the bio line on your competitive standing card.</p>
              </div>
              <button className={styles.modalCloseBtn} onClick={() => setActiveModal(null)}>
                <X size={16} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.quoteInputWrap}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                  Your Growth Motto:
                </label>
                <input
                  type="text"
                  className={styles.quoteInput}
                  value={quoteInput}
                  onChange={(e) => setQuoteInput(e.target.value)}
                  placeholder="e.g. Solve today, grow tomorrow."
                  maxLength={90}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveQuote();
                  }}
                />
                <span style={{ fontSize: '0.72rem', color: '#94a3b8', textAlign: 'right' }}>
                  {quoteInput.length}/90 characters
                </span>
              </div>
              <div className={styles.modalActions}>
                <button className={styles.modalBtnSecondary} onClick={() => setActiveModal(null)}>
                  Cancel
                </button>
                <button className={styles.modalBtnPrimary} onClick={handleSaveQuote}>
                  Save Quote
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. All Badges Modal */}
      {activeModal === 'badges' && (
        <div className={styles.modalOverlay} onClick={() => setActiveModal(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <h3>Achievements & Badges</h3>
                <p>Track your earned badges and upcoming platform milestones.</p>
              </div>
              <button className={styles.modalCloseBtn} onClick={() => setActiveModal(null)}>
                <X size={16} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalBadgeGrid}>
                {badges.length === 0 ? <p style={{ color: '#64748b', textAlign: 'center', gridColumn: '1 / -1' }}>No badges have been earned yet.</p> : badges.map((b) => (
                  <div key={b.id} className={styles.modalBadgeCard}>
                    <div
                      className={styles.badgeIconBox}
                      style={{ background: b.bg, color: b.color, width: '52px', height: '52px', fontSize: '1.1rem' }}
                    >
                      {b.badge_text || '★'}
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#0f172a' }}>{b.title}</span>
                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{b.subtext}</span>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: '9999px', marginTop: '4px' }}>
                      Unlocked
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. All Topic Performance Modal */}
      {activeModal === 'topics' && (
        <div className={styles.modalOverlay} onClick={() => setActiveModal(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <h3>Comprehensive Topic Mastery</h3>
                <p>Complete breakdown of problem accuracy across all practiced topics.</p>
              </div>
              <button className={styles.modalCloseBtn} onClick={() => setActiveModal(null)}>
                <X size={16} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalFilterTabs}>
                <button
                  className={`${styles.modalTabBtn} ${modalTopicTab === 'all' ? styles.modalTabBtnActive : ''}`}
                  onClick={() => setModalTopicTab('all')}
                >
                  All Topics ({topicPerf.strongest.length + topicPerf.needs_focus.length})
                </button>
                <button
                  className={`${styles.modalTabBtn} ${modalTopicTab === 'strongest' ? styles.modalTabBtnActive : ''}`}
                  onClick={() => setModalTopicTab('strongest')}
                >
                  Strongest (≥70%)
                </button>
                <button
                  className={`${styles.modalTabBtn} ${modalTopicTab === 'needs_focus' ? styles.modalTabBtnActive : ''}`}
                  onClick={() => setModalTopicTab('needs_focus')}
                >
                  Needs Focus (&lt;70%)
                </button>
              </div>

              <div className={styles.topicList} style={{ gap: '0.85rem' }}>
                {(modalTopicTab === 'strongest'
                  ? topicPerf.strongest
                  : modalTopicTab === 'needs_focus'
                  ? topicPerf.needs_focus
                  : [...topicPerf.strongest, ...topicPerf.needs_focus]
                ).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#64748b' }}>
                    <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>No topic practice records found.</p>
                    <p style={{ margin: '0.35rem 0 1rem', fontSize: '0.78rem', color: '#94a3b8' }}>
                      Complete problems across Easy, Medium, and Hard tiers to generate proficiency data.
                    </p>
                    <Link
                      href="/student/practice"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.45rem 1rem',
                        background: '#7c3aed',
                        color: '#ffffff',
                        borderRadius: '0.5rem',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        textDecoration: 'none',
                      }}
                    >
                      <span>Start Practice</span>
                      <ArrowRight size={13} />
                    </Link>
                  </div>
                ) : (
                  (modalTopicTab === 'strongest'
                    ? topicPerf.strongest
                    : modalTopicTab === 'needs_focus'
                    ? topicPerf.needs_focus
                    : [...topicPerf.strongest, ...topicPerf.needs_focus]
                  ).map((item, idx) => (
                    <div key={idx} className={styles.topicRow}>
                      <span className={styles.topicName} style={{ minWidth: '150px' }}>
                        {item.topic}
                      </span>
                      <div className={styles.topicBarTrack} style={{ height: '8px' }}>
                        <div
                          className={styles.topicBarFill}
                          style={{
                            width: `${item.pct}%`,
                            background: item.color,
                          }}
                        />
                      </div>
                      <span className={styles.topicPctText} style={{ minWidth: '45px', textAlign: 'right' }}>
                        {item.pct}%
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Full Practice Submissions Modal */}
      {activeModal === 'submissions' && (
        <div className={styles.modalOverlay} onClick={() => setActiveModal(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '780px' }}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <h3>Practice Submission History</h3>
                <p>Full record of your algorithmic practice submissions and runtime stats.</p>
              </div>
              <button className={styles.modalCloseBtn} onClick={() => setActiveModal(null)}>
                <X size={16} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalFilterTabs}>
                <button
                  className={`${styles.modalTabBtn} ${submissionFilter === 'all' ? styles.modalTabBtnActive : ''}`}
                  onClick={() => setSubmissionFilter('all')}
                >
                  All ({recentSubmissions.length})
                </button>
                <button
                  className={`${styles.modalTabBtn} ${submissionFilter === 'accepted' ? styles.modalTabBtnActive : ''}`}
                  onClick={() => setSubmissionFilter('accepted')}
                >
                  Accepted ({recentSubmissions.filter((s) => s.is_accepted).length})
                </button>
                <button
                  className={`${styles.modalTabBtn} ${submissionFilter === 'wrong' ? styles.modalTabBtnActive : ''}`}
                  onClick={() => setSubmissionFilter('wrong')}
                >
                  Needs Attention ({recentSubmissions.filter((s) => !s.is_accepted).length})
                </button>
              </div>

              <div style={{ overflowX: 'auto', maxHeight: '420px' }}>
                <table className={styles.recentTable}>
                  <thead>
                    <tr>
                      <th>Problem</th>
                      <th>Difficulty</th>
                      <th>Result</th>
                      <th>Runtime</th>
                      <th>XP</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentSubmissions
                      .filter((s) => {
                        if (submissionFilter === 'accepted') return s.is_accepted;
                        if (submissionFilter === 'wrong') return !s.is_accepted;
                        return true;
                      })
                      .map((sub) => (
                        <tr key={sub.id}>
                          <td className={styles.probName}>{sub.problem}</td>
                          <td>
                            <span
                              className={`${styles.diffBadge} ${
                                sub.difficulty === 'Easy'
                                  ? styles.diffEasy
                                  : sub.difficulty === 'Medium'
                                  ? styles.diffMedium
                                  : styles.diffHard
                              }`}
                            >
                              {sub.difficulty}
                            </span>
                          </td>
                          <td>
                            <span className={sub.is_accepted ? styles.resultAccepted : styles.resultWrong}>
                              {sub.result}
                            </span>
                          </td>
                          <td style={{ color: '#64748b', fontSize: '0.75rem' }}>{sub.time}</td>
                          <td className={sub.is_accepted ? styles.xpGain : ''} style={{ fontSize: '0.75rem' }}>
                            {sub.xp}
                          </td>
                          <td className={styles.dateCell}>{sub.date}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Full Leaderboard Modal */}
      {activeModal === 'leaderboard' && (
        <div className={styles.modalOverlay} onClick={() => setActiveModal(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <h3>Platform Standings & Rankings</h3>
                <p>Global leaderboard for competitive programming on NexLab.</p>
              </div>
              <button className={styles.modalCloseBtn} onClick={() => setActiveModal(null)}>
                <X size={16} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <div style={{ overflowX: 'auto', maxHeight: '440px' }}>
                <table className={styles.leaderboardTable}>
                  <thead>
                    <tr>
                      <th style={{ width: '50px' }}>Rank</th>
                      <th>Student</th>
                      <th style={{ textAlign: 'right' }}>Platform Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboardEntries.map((entry) => (
                      <tr key={entry.rank} className={entry.is_current_user ? styles.currentUserRow : ''}>
                        <td className={styles.rankNum}>#{entry.rank}</td>
                        <td>
                          <div className={styles.userCell}>
                            <div className={styles.miniAvatar} style={{ background: entry.avatar_color }}>
                              {entry.initials}
                            </div>
                            <span className={styles.leaderName}>
                              {entry.name} {entry.is_current_user && '(You)'}
                            </span>
                          </div>
                        </td>
                        <td className={styles.ratingCell}>{entry.rating != null ? entry.rating.toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
