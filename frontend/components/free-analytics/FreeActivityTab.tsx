'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  Flame,
  Zap,
  Target,
  Trophy,
  CheckCircle2,
  Clock,
  Star,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  BarChart2,
} from 'lucide-react';
import { freeService, type FreeActivityData, type FreeAccuracyData } from '@/services/free.service';
import styles from './free-analytics.module.css';

interface FreeActivityTabProps {
  activity?: FreeActivityData;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const FreeActivityTab: React.FC<FreeActivityTabProps> = ({ activity: initialActivity }) => {
  const currentYear = new Date().getFullYear();
  const [metricView, setMetricView] = useState<'cumulative' | 'daily'>('cumulative');
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [chartTimeframe, setChartTimeframe] = useState<string>('Last 6 Months');
  
  // Interactive chart hover state
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);

  // Interactive heatmap tooltip state
  const [tooltipState, setTooltipState] = useState<{
    visible: boolean;
    date: string;
    count: number;
    x: number;
    y: number;
  }>({
    visible: false,
    date: '',
    count: 0,
    x: 0,
    y: 0,
  });

  // Query Activity data if not provided via props
  const { data: fetchedActivity } = useQuery({
    queryKey: ['free-activity', selectedYear],
    queryFn: () => freeService.getActivity(365),
    enabled: !initialActivity,
    staleTime: 60 * 1000,
  });

  const activity = initialActivity || fetchedActivity;

  // Query Accuracy & Personal Bests from real database
  const { data: accuracyData } = useQuery<FreeAccuracyData>({
    queryKey: ['free-accuracy'],
    queryFn: () => freeService.getAccuracy(),
    staleTime: 60 * 1000,
  });

  // Real Database Summary Values
  const summary = activity?.summary;
  const activeDays = summary?.total_active_days ?? 0;
  const currentStreak = summary?.current_streak ?? 0;
  const longestStreak = summary?.longest_streak ?? 0;
  const totalSubmissions = summary?.total_submissions ?? 0;
  const maxDailySolves = summary?.max_daily_count ?? 0;
  const maxDailyDate = summary?.most_active_date;

  const acceptanceRate = accuracyData?.acceptance_rate != null ? Number(accuracyData.acceptance_rate.toFixed(1)) : 0;
  const firstTryRate = accuracyData?.first_try_rate != null ? Number(accuracyData.first_try_rate.toFixed(1)) : 0;
  const avgAttempts = accuracyData?.avg_attempts != null ? Number(accuracyData.avg_attempts.toFixed(1)) : 1.0;

  // ── 1. Interactive 365-Day Real Database Heatmap ─────────────────────────
  const { weeks, monthHeaders } = useMemo(() => {
    const totalWeeks = 52;
    const weekCols: Array<Array<{ date: string; count: number; level: number }>> = [];
    const months: Array<{ label: string; colIndex: number }> = [];

    // Map existing activity heatmap entries by date string
    const mapByDate = new Map<string, { count: number; level: number }>();
    if (activity?.heatmap) {
      activity.heatmap.forEach((item) => {
        mapByDate.set(item.date, { count: item.count, level: item.level });
      });
    }

    // Start Jan 1 of selectedYear
    const startDate = new Date(selectedYear, 0, 1);
    let curr = new Date(startDate);

    // Adjust to Monday
    const dayOfWeek = (curr.getDay() + 6) % 7;
    curr.setDate(curr.getDate() - dayOfWeek);

    let lastMonth = -1;

    for (let w = 0; w < totalWeeks; w++) {
      const week: Array<{ date: string; count: number; level: number }> = [];
      for (let d = 0; d < 7; d++) {
        const y = curr.getFullYear();
        const m = curr.getMonth();
        const day = curr.getDate();
        const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        if (d === 0 && m !== lastMonth && y === selectedYear) {
          lastMonth = m;
          months.push({ label: MONTH_NAMES[m], colIndex: w });
        }

        const existing = mapByDate.get(dateStr);
        const count = existing?.count ?? 0;
        const level = existing?.level ?? 0;

        week.push({ date: dateStr, count, level });
        curr.setDate(curr.getDate() + 1);
      }
      weekCols.push(week);
    }

    return { weeks: weekCols, monthHeaders: months };
  }, [activity?.heatmap, selectedYear]);

  // ── 2. Real Skill Velocity & XP Trend Chart Data ─────────────────────────
  const chartPoints = useMemo(() => {
    const rawSolve = activity?.solve_trend ?? [];
    const rawXP = activity?.xp_trend ?? [];

    if (rawSolve.length === 0) {
      // Default baseline when database has no activity recorded yet
      const today = new Date();
      return Array.from({ length: 6 }).map((_, i) => {
        const d = new Date(today);
        d.setMonth(d.getMonth() - (5 - i));
        const label = `${MONTH_NAMES[d.getMonth()]} 1`;
        return {
          label,
          date: d.toISOString().split('T')[0],
          solved: 0,
          xp: 0,
        };
      });
    }

    // Filter points by timeframe
    const now = new Date();
    let cutoffDays = 180;
    if (chartTimeframe === 'Last 3 Months') cutoffDays = 90;
    else if (chartTimeframe === 'Last 6 Months') cutoffDays = 180;
    else if (chartTimeframe === 'Last 12 Months') cutoffDays = 365;

    const cutoffDate = new Date(now.getTime() - cutoffDays * 24 * 60 * 60 * 1000);

    const merged = rawSolve
      .filter((s) => new Date(s.date) >= cutoffDate)
      .map((s, idx) => {
        const xpItem = rawXP[idx] || rawXP.find((x) => x.date === s.date);
        const d = new Date(s.date);
        const label = `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
        return {
          label,
          date: s.date,
          solved: metricView === 'cumulative' ? (s.cumulative_solved ?? 0) : (s.new_solves ?? 0),
          xp: metricView === 'cumulative' ? (xpItem?.cumulative_xp ?? 0) : (xpItem?.delta_xp ?? 0),
        };
      });

    // Subsample if too many points for smooth SVG display
    if (merged.length > 12) {
      const step = Math.ceil(merged.length / 10);
      const sampled = merged.filter((_, i) => i % step === 0 || i === merged.length - 1);
      return sampled;
    }

    return merged.length >= 2 ? merged : [
      { label: 'Start', date: 'Start', solved: 0, xp: 0 },
      ...merged,
    ];
  }, [activity?.solve_trend, activity?.xp_trend, metricView, chartTimeframe]);

  // Chart layout geometry
  const chartWidth = 560;
  const chartHeight = 220;
  const padLeft = 45;
  const padRight = 45;
  const padTop = 20;
  const padBottom = 35;
  const plotWidth = chartWidth - padLeft - padRight;
  const plotHeight = chartHeight - padTop - padBottom;

  // Max values from live data
  const maxSolved = Math.max(5, Math.ceil(Math.max(...chartPoints.map((p) => p.solved), 1) * 1.2));
  const maxXP = Math.max(50, Math.ceil(Math.max(...chartPoints.map((p) => p.xp), 10) * 1.2));

  // Compute coordinate mapping for points
  const mappedPoints = useMemo(() => {
    return chartPoints.map((pt, i) => {
      const x = padLeft + (chartPoints.length > 1 ? (i / (chartPoints.length - 1)) * plotWidth : plotWidth / 2);
      const ySolved = padTop + plotHeight - (pt.solved / maxSolved) * plotHeight;
      const yXP = padTop + plotHeight - (pt.xp / maxXP) * plotHeight;
      return { ...pt, x, ySolved, yXP };
    });
  }, [chartPoints, plotWidth, plotHeight, maxSolved, maxXP]);

  // Area path for XP
  const xpAreaPath = useMemo(() => {
    if (mappedPoints.length === 0) return '';
    const firstX = mappedPoints[0].x;
    const lastX = mappedPoints[mappedPoints.length - 1].x;
    const baselineY = padTop + plotHeight;

    const lineCommands = mappedPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.yXP}`).join(' ');
    return `${lineCommands} L ${lastX} ${baselineY} L ${firstX} ${baselineY} Z`;
  }, [mappedPoints, plotHeight]);

  // Line path for XP
  const xpLinePath = useMemo(() => {
    return mappedPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.yXP}`).join(' ');
  }, [mappedPoints]);

  // Line path for Solved
  const solvedLinePath = useMemo(() => {
    return mappedPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.ySolved}`).join(' ');
  }, [mappedPoints]);

  // Dynamic sparkline bars from recent activity weeks
  const activeSpark = useMemo(() => {
    const recent = weeks.slice(-8);
    const totals = recent.map((w) => w.reduce((acc, d) => acc + d.count, 0));
    const maxVal = Math.max(...totals, 1);
    return totals.map((t) => Math.min(100, Math.max(15, Math.round((t / maxVal) * 100))));
  }, [weeks]);

  // Personal records from real database
  const bests = accuracyData?.personal_bests;
  const fastestMs = bests?.fastest_solve_ms;
  const hardestProb = bests?.hardest_problem_cracked;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* ═════════════════════════════════════════════════════════════════════
          1. HERO HEADER: Calendar Icon + Title + Wave Gradient Art
         ═════════════════════════════════════════════════════════════════════ */}
      <div className={styles.activityHeroRow}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', zIndex: 2 }}>
          <div className={styles.skillsIconBox}>
            <Calendar size={24} />
          </div>
          <div>
            <h2 className={styles.cardTitle} style={{ fontSize: '1.25rem', color: '#0f172a' }}>
              Activity &amp; Trends
            </h2>
            <p className={styles.cardSubtitle} style={{ fontSize: '0.825rem', color: '#64748b' }}>
              Visualize your coding journey, track your consistency, and see how your problem solving skills improve over time.
            </p>
          </div>
        </div>

        <svg
          className={styles.activityHeroWaveBg}
          viewBox="0 0 320 70"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M0 35C60 10 120 50 180 25C240 0 280 40 320 20V70H0V35Z"
            fill="url(#waveGrad1)"
            opacity="0.3"
          />
          <path
            d="M40 45C90 20 150 55 210 30C270 10 290 45 320 30V70H40V45Z"
            fill="url(#waveGrad2)"
            opacity="0.4"
          />
          <defs>
            <linearGradient id="waveGrad1" x1="160" y1="0" x2="160" y2="70" gradientUnits="userSpaceOnUse">
              <stop stopColor="#c4b5fd" />
              <stop offset="1" stopColor="#ede9fe" stopOpacity="0.1" />
            </linearGradient>
            <linearGradient id="waveGrad2" x1="180" y1="10" x2="180" y2="70" gradientUnits="userSpaceOnUse">
              <stop stopColor="#8b5cf6" />
              <stop offset="1" stopColor="#c4b5fd" stopOpacity="0.2" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════
          2. TOP 4 METRIC CARDS WITH REAL DATA & DYNAMIC SPARKLINE
         ═════════════════════════════════════════════════════════════════════ */}
      <div className={styles.activityTopGrid4}>
        {/* Card 1: Active Days */}
        <div className={styles.activityTopCard}>
          <div className={styles.activityTopLeft}>
            <div className={styles.activityTopIcon} style={{ background: '#ecfdf5', color: '#059669' }}>
              <Calendar size={18} />
            </div>
            <div>
              <div className={styles.activityTopValue}>{activeDays}</div>
              <div className={styles.activityTopLabel}>Active Days</div>
              <div className={styles.activityTopTrend} style={{ color: '#16a34a' }}>
                Past 365 days
              </div>
            </div>
          </div>
          <div className={styles.activitySparkline} title="Weekly activity trajectory">
            {activeSpark.map((val, idx) => (
              <div
                key={idx}
                className={styles.activitySparkBar}
                style={{
                  height: `${val}%`,
                  background: 'linear-gradient(180deg, #10b981, #6ee7b7)',
                }}
              />
            ))}
          </div>
        </div>

        {/* Card 2: Current Streak */}
        <div className={styles.activityTopCard}>
          <div className={styles.activityTopLeft}>
            <div className={styles.activityTopIcon} style={{ background: '#fef2f2', color: '#dc2626' }}>
              <Flame size={18} />
            </div>
            <div>
              <div className={styles.activityTopValue}>{currentStreak} days</div>
              <div className={styles.activityTopLabel}>Current Streak</div>
              <div className={styles.activityTopTrend} style={{ color: '#64748b' }}>
                All-time best: {longestStreak} days
              </div>
            </div>
          </div>
          <div className={styles.activitySparkline} title="Consecutive daily solve momentum">
            {activeSpark.map((val, idx) => (
              <div
                key={idx}
                className={styles.activitySparkBar}
                style={{
                  height: `${Math.min(100, val * 0.9)}%`,
                  background: 'linear-gradient(180deg, #ef4444, #fca5a5)',
                }}
              />
            ))}
          </div>
        </div>

        {/* Card 3: Total Submissions */}
        <div className={styles.activityTopCard}>
          <div className={styles.activityTopLeft}>
            <div className={styles.activityTopIcon} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
              <Target size={18} />
            </div>
            <div>
              <div className={styles.activityTopValue}>{totalSubmissions}</div>
              <div className={styles.activityTopLabel}>Total Submissions</div>
              <div className={styles.activityTopTrend} style={{ color: '#16a34a' }}>
                Practice &amp; Courses
              </div>
            </div>
          </div>
          <div className={styles.activitySparkline} title="Submission volume">
            {activeSpark.map((val, idx) => (
              <div
                key={idx}
                className={styles.activitySparkBar}
                style={{
                  height: `${val}%`,
                  background: 'linear-gradient(180deg, #7c3aed, #c4b5fd)',
                }}
              />
            ))}
          </div>
        </div>

        {/* Card 4: Max Daily Solves */}
        <div className={styles.activityTopCard}>
          <div className={styles.activityTopLeft}>
            <div className={styles.activityTopIcon} style={{ background: '#fffbeb', color: '#d97706' }}>
              <Zap size={18} />
            </div>
            <div>
              <div className={styles.activityTopValue}>{maxDailySolves}</div>
              <div className={styles.activityTopLabel}>Max Daily Solves</div>
              <div className={styles.activityTopTrend} style={{ color: '#64748b' }}>
                {maxDailyDate ? `on ${maxDailyDate}` : 'No solves yet'}
              </div>
            </div>
          </div>
          <div className={styles.activitySparkline} title="Peak solve volume">
            {activeSpark.map((val, idx) => (
              <div
                key={idx}
                className={styles.activitySparkBar}
                style={{
                  height: `${val}%`,
                  background: 'linear-gradient(180deg, #f59e0b, #fde68a)',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════
          3. YEAR OF CODE HEATMAP (Real DB Calendar)
         ═════════════════════════════════════════════════════════════════════ */}
      <div className={styles.heatmapSectionCard}>
        <div className={styles.heatmapHeaderFlex}>
          <div className={styles.cardTitleWrap}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: '#ede9fe',
                color: '#7c3aed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Calendar size={16} />
            </div>
            <div>
              <h3 className={styles.cardTitle} style={{ fontSize: '1.05rem' }}>
                Year of Code Heatmap
              </h3>
              <p className={styles.cardSubtitle} style={{ fontSize: '0.775rem' }}>
                Your submission frequency across {selectedYear}
              </p>
            </div>
          </div>

          {/* Interactive Year Navigator */}
          <div className={styles.yearNavBtnGroup}>
            <button
              type="button"
              className={styles.yearNavArrow}
              onClick={() => setSelectedYear((y) => y - 1)}
              title="Previous Year"
            >
              <ChevronLeft size={14} />
            </button>
            <span>Jan {selectedYear} - Dec {selectedYear}</span>
            <button
              type="button"
              className={styles.yearNavArrow}
              onClick={() => setSelectedYear((y) => y + 1)}
              title="Next Year"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* Heatmap Body */}
        <div className={styles.heatmapBodyFlex}>
          <div className={styles.heatmapGridScrollArea}>
            {/* Month Header row */}
            <div
              style={{
                display: 'flex',
                fontSize: '0.72rem',
                color: '#94a3b8',
                marginBottom: '0.4rem',
                paddingLeft: '32px',
                minWidth: '780px',
                position: 'relative',
                height: '16px',
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 600,
              }}
            >
              {monthHeaders.map((m, idx) => (
                <span
                  key={idx}
                  style={{
                    position: 'absolute',
                    left: `${32 + m.colIndex * 14.5}px`,
                  }}
                >
                  {m.label}
                </span>
              ))}
            </div>

            {/* Grid */}
            <div style={{ display: 'flex', gap: '8px', minWidth: '780px', position: 'relative' }}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  height: `${7 * 14.5}px`,
                  fontSize: '0.675rem',
                  color: '#94a3b8',
                  width: '24px',
                  textAlign: 'right',
                  flexShrink: 0,
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 600,
                  paddingTop: '1px',
                }}
              >
                {DAY_LABELS.map((d, i) => (
                  <span key={i} style={{ height: '12px', lineHeight: '12px' }}>
                    {d}
                  </span>
                ))}
              </div>

              {/* 52 Week Columns */}
              <div style={{ display: 'flex', gap: '3px' }}>
                {weeks.map((week, wIdx) => (
                  <div key={wIdx} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {week.map((day) => {
                      const levelColor =
                        day.level === 4
                          ? '#5b21b6'
                          : day.level === 3
                          ? '#7c3aed'
                          : day.level === 2
                          ? '#a78bfa'
                          : day.level === 1
                          ? '#ddd6fe'
                          : '#f1f5f9';

                      return (
                        <div
                          key={day.date}
                          className={styles.heatmapCellInteractive}
                          style={{ background: levelColor }}
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setTooltipState({
                              visible: true,
                              date: day.date,
                              count: day.count,
                              x: rect.left + rect.width / 2,
                              y: rect.top,
                            });
                          }}
                          onMouseLeave={() => setTooltipState((s) => ({ ...s, visible: false }))}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Floating Tooltip */}
              {tooltipState.visible && (
                <div
                  className={styles.heatmapTooltipBox}
                  style={{
                    position: 'fixed',
                    left: `${tooltipState.x}px`,
                    top: `${tooltipState.y - 8}px`,
                  }}
                >
                  {tooltipState.date}: <strong>{tooltipState.count}</strong> solve{tooltipState.count === 1 ? '' : 's'}
                </div>
              )}
            </div>
          </div>

          {/* Right Summary Side */}
          <div className={styles.heatmapSummarySide}>
            <div>
              <div className={styles.heatmapTotalLabel}>Total Submissions</div>
              <div className={styles.heatmapTotalBig}>{totalSubmissions}</div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#64748b' }}>
              <span>Less</span>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: '#f1f5f9' }} />
              <div style={{ width: 10, height: 10, borderRadius: 2, background: '#ddd6fe' }} />
              <div style={{ width: 10, height: 10, borderRadius: 2, background: '#a78bfa' }} />
              <div style={{ width: 10, height: 10, borderRadius: 2, background: '#7c3aed' }} />
              <div style={{ width: 10, height: 10, borderRadius: 2, background: '#5b21b6' }} />
              <span>More</span>
            </div>
          </div>
        </div>

        {/* 4 Heatmap Milestone Cards */}
        <div className={styles.heatmapMilestonesRow}>
          <div className={styles.heatmapMilestoneCard}>
            <div className={styles.heatmapMilestoneIcon} style={{ background: '#ecfdf5', color: '#059669' }}>
              <Trophy size={16} />
            </div>
            <div>
              <div className={styles.heatmapMilestoneLabel}>Most Active Day</div>
              <div className={styles.heatmapMilestoneTitle}>{maxDailyDate || '—'}</div>
              <div className={styles.heatmapMilestoneSub} style={{ color: '#059669' }}>{maxDailySolves} solves</div>
            </div>
          </div>

          <div className={styles.heatmapMilestoneCard}>
            <div className={styles.heatmapMilestoneIcon} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
              <Calendar size={16} />
            </div>
            <div>
              <div className={styles.heatmapMilestoneLabel}>Active Days</div>
              <div className={styles.heatmapMilestoneTitle}>{activeDays} days</div>
              <div className={styles.heatmapMilestoneSub} style={{ color: '#7c3aed' }}>Total across period</div>
            </div>
          </div>

          <div className={styles.heatmapMilestoneCard}>
            <div className={styles.heatmapMilestoneIcon} style={{ background: '#fff7ed', color: '#ea580c' }}>
              <Flame size={16} />
            </div>
            <div>
              <div className={styles.heatmapMilestoneLabel}>Longest Streak</div>
              <div className={styles.heatmapMilestoneTitle}>{longestStreak} days</div>
              <div className={styles.heatmapMilestoneSub} style={{ color: '#64748b' }}>All-time record</div>
            </div>
          </div>

          <div className={styles.heatmapMilestoneCard}>
            <div className={styles.heatmapMilestoneIcon} style={{ background: '#eff6ff', color: '#2563eb' }}>
              <Zap size={16} />
            </div>
            <div>
              <div className={styles.heatmapMilestoneLabel}>Current Streak</div>
              <div className={styles.heatmapMilestoneTitle}>{currentStreak} days</div>
              <div className={styles.heatmapMilestoneSub} style={{ color: '#2563eb' }}>Keep it going!</div>
            </div>
          </div>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════
          4. BOTTOM GRID: Real Skill Velocity & XP Trend + Precision / Records
         ═════════════════════════════════════════════════════════════════════ */}
      <div className={styles.activityBottomGrid2}>
        {/* ── Left: Skill Velocity & XP Trend (Interactive Dual-Axis Chart) ── */}
        <div className={styles.velocityCard}>
          <div className={styles.cardHeader} style={{ flexWrap: 'wrap', gap: '10px' }}>
            <div className={styles.cardTitleWrap}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: '#f5f3ff',
                  color: '#7c3aed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <TrendingUp size={16} />
              </div>
              <div>
                <h3 className={styles.cardTitle} style={{ fontSize: '1.05rem' }}>
                  Skill Velocity &amp; XP Trend
                </h3>
                <p className={styles.cardSubtitle} style={{ fontSize: '0.775rem' }}>
                  Your problem solving progress and experience points over time
                </p>
              </div>
            </div>

            {/* Toggle pills + Timeframe dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className={styles.pillsGroup}>
                <button
                  type="button"
                  className={`${styles.pillOption} ${metricView === 'cumulative' ? styles.pillOptionActive : ''}`}
                  onClick={() => setMetricView('cumulative')}
                >
                  Cumulative
                </button>
                <button
                  type="button"
                  className={`${styles.pillOption} ${metricView === 'daily' ? styles.pillOptionActive : ''}`}
                  onClick={() => setMetricView('daily')}
                >
                  Daily
                </button>
              </div>

              <select
                value={chartTimeframe}
                onChange={(e) => setChartTimeframe(e.target.value)}
                className={styles.matrixSelect}
                style={{ padding: '5px 10px', fontSize: '11.5px' }}
              >
                <option value="Last 3 Months">Last 3 Months</option>
                <option value="Last 6 Months">Last 6 Months</option>
                <option value="Last 12 Months">Last 12 Months</option>
              </select>
            </div>
          </div>

          {/* Interactive SVG Chart */}
          <div className={styles.chartContainerRel}>
            <svg
              width="100%"
              height="230"
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              style={{ overflow: 'visible' }}
            >
              <defs>
                <linearGradient id="amberAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="#fef3c7" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* Grid Horizontal Guide Lines */}
              {[0, 0.25, 0.5, 0.75, 1.0].map((ratio) => {
                const y = padTop + plotHeight * (1 - ratio);
                const valSolved = Math.round(maxSolved * ratio);
                const valXP = Math.round(maxXP * ratio);
                const xpStr = valXP >= 1000 ? `${(valXP / 1000).toFixed(1)}K` : valXP;

                return (
                  <g key={ratio}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={padLeft + plotWidth}
                      y2={y}
                      stroke="#f1f5f9"
                      strokeWidth="1"
                    />
                    <text
                      x={padLeft - 8}
                      y={y + 3.5}
                      textAnchor="end"
                      fontSize="9.5"
                      fontWeight="600"
                      fill="#94a3b8"
                      fontFamily="'Space Grotesk', sans-serif"
                    >
                      {valSolved}
                    </text>
                    <text
                      x={padLeft + plotWidth + 8}
                      y={y + 3.5}
                      textAnchor="start"
                      fontSize="9.5"
                      fontWeight="600"
                      fill="#94a3b8"
                      fontFamily="'Space Grotesk', sans-serif"
                    >
                      {xpStr}
                    </text>
                  </g>
                );
              })}

              {/* Area fill for XP */}
              <path d={xpAreaPath} fill="url(#amberAreaGrad)" />

              {/* Line for Total XP (Amber) */}
              <path d={xpLinePath} fill="none" stroke="#f59e0b" strokeWidth="2.4" />

              {/* Line for Problems Solved (Purple) */}
              <path d={solvedLinePath} fill="none" stroke="#7c3aed" strokeWidth="2.8" />

              {/* Interactive Vertical Guide Line on Hover */}
              {hoveredPointIndex !== null && mappedPoints[hoveredPointIndex] && (
                <line
                  x1={mappedPoints[hoveredPointIndex].x}
                  y1={padTop}
                  x2={mappedPoints[hoveredPointIndex].x}
                  y2={padTop + plotHeight}
                  stroke="#7c3aed"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
              )}

              {/* Data points & interaction hit targets */}
              {mappedPoints.map((pt, i) => {
                const isHovered = hoveredPointIndex === i;

                return (
                  <g key={i}>
                    <circle
                      cx={pt.x}
                      cy={pt.yXP}
                      r={isHovered ? 5.5 : 3.5}
                      fill="#f59e0b"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                    <circle
                      cx={pt.x}
                      cy={pt.ySolved}
                      r={isHovered ? 6 : 4}
                      fill="#7c3aed"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />

                    <text
                      x={pt.x}
                      y={padTop + plotHeight + 16}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="600"
                      fill={isHovered ? '#7c3aed' : '#94a3b8'}
                      fontFamily="'Space Grotesk', sans-serif"
                    >
                      {pt.label}
                    </text>

                    <rect
                      x={pt.x - (plotWidth / (chartPoints.length * 2 || 1))}
                      y={padTop}
                      width={plotWidth / (chartPoints.length || 1)}
                      height={plotHeight}
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredPointIndex(i)}
                      onMouseLeave={() => setHoveredPointIndex(null)}
                    />
                  </g>
                );
              })}

              <text
                x={padLeft - 18}
                y={padTop - 8}
                fontSize="9"
                fontWeight="700"
                fill="#64748b"
                fontFamily="'Space Grotesk', sans-serif"
              >
                Solved
              </text>
              <text
                x={padLeft + plotWidth + 18}
                y={padTop - 8}
                textAnchor="end"
                fontSize="9"
                fontWeight="700"
                fill="#64748b"
                fontFamily="'Space Grotesk', sans-serif"
              >
                XP
              </text>
            </svg>

            {hoveredPointIndex !== null && mappedPoints[hoveredPointIndex] && (
              <div
                style={{
                  position: 'absolute',
                  left: `${mappedPoints[hoveredPointIndex].x}px`,
                  top: `${Math.min(mappedPoints[hoveredPointIndex].ySolved, mappedPoints[hoveredPointIndex].yXP) - 10}px`,
                  transform: 'translate(-50%, -100%)',
                  background: 'rgba(15, 23, 42, 0.95)',
                  color: '#ffffff',
                  padding: '7px 12px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontFamily: "'Space Grotesk', sans-serif",
                  boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                  pointerEvents: 'none',
                  zIndex: 20,
                  whiteSpace: 'nowrap',
                }}
              >
                <div style={{ color: '#cbd5e1', fontWeight: 600, marginBottom: '2px' }}>
                  {mappedPoints[hoveredPointIndex].date}
                </div>
                <div style={{ color: '#c4b5fd', fontWeight: 700 }}>
                  ● Solved: {mappedPoints[hoveredPointIndex].solved}
                </div>
                <div style={{ color: '#fde68a', fontWeight: 700 }}>
                  ● Total XP: {mappedPoints[hoveredPointIndex].xp.toLocaleString()} XP
                </div>
              </div>
            )}
          </div>

          <div className={styles.chartLegendFlex}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#7c3aed' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#7c3aed' }} />
              Problems Solved ({metricView})
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#d97706' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
              Total XP Earned ({metricView})
            </span>
          </div>
        </div>

        {/* ── Right Column: Precision & Accuracy + Personal Bests ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Card 1: Precision & Accuracy */}
          <div className={styles.precisionCard}>
            <div className={styles.cardHeader} style={{ marginBottom: 0 }}>
              <div className={styles.cardTitleWrap}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: '#ede9fe',
                    color: '#7c3aed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Target size={15} />
                </div>
                <div>
                  <h3 className={styles.cardTitle} style={{ fontSize: '0.98rem' }}>
                    Precision &amp; Accuracy
                  </h3>
                  <p className={styles.cardSubtitle} style={{ fontSize: '0.75rem' }}>
                    Your submission success rates and solving efficiency
                  </p>
                </div>
              </div>
            </div>

            {/* 3 Metrics Box */}
            <div className={styles.precisionMetricsRow}>
              {/* Acceptance Rate */}
              <div className={styles.precisionItem}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#059669' }}>
                  <CheckCircle2 size={13} />
                  <span className={styles.precisionVal}>{acceptanceRate}%</span>
                </div>
                <span className={styles.precisionLbl}>Acceptance Rate</span>
              </div>

              {/* First-Try Solves */}
              <div className={styles.precisionItem}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#7c3aed' }}>
                  <Star size={13} />
                  <span className={styles.precisionVal}>{firstTryRate}%</span>
                </div>
                <span className={styles.precisionLbl}>First-Try Solves</span>
              </div>

              {/* Avg Attempts */}
              <div className={styles.precisionItem}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#2563eb' }}>
                  <Clock size={13} />
                  <span className={styles.precisionVal}>{avgAttempts}</span>
                </div>
                <span className={styles.precisionLbl}>Avg Attempts/Solve</span>
              </div>
            </div>

            {/* 2 Progress Bars */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700, marginBottom: '4px', color: '#334155', fontFamily: "'Space Grotesk', sans-serif" }}>
                  <span>Overall Submission Accuracy</span>
                  <span style={{ color: '#059669' }}>{acceptanceRate}%</span>
                </div>
                <div style={{ height: 6, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      background: 'linear-gradient(90deg, #10b981, #059669)',
                      width: `${Math.min(100, acceptanceRate)}%`,
                      borderRadius: 999,
                    }}
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700, marginBottom: '4px', color: '#334155', fontFamily: "'Space Grotesk', sans-serif" }}>
                  <span>First Attempt Accuracy</span>
                  <span style={{ color: '#7c3aed' }}>{firstTryRate}%</span>
                </div>
                <div style={{ height: 6, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      background: 'linear-gradient(90deg, #7c3aed, #9333ea)',
                      width: `${Math.min(100, firstTryRate)}%`,
                      borderRadius: 999,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Personal Bests & Records (Bound to Real DB Records) */}
          <div className={styles.recordsCard}>
            <div className={styles.cardHeader} style={{ marginBottom: 0 }}>
              <div className={styles.cardTitleWrap}>
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: '#fef3c7',
                    color: '#b45309',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Trophy size={14} />
                </div>
                <div>
                  <h3 className={styles.cardTitle} style={{ fontSize: '0.98rem' }}>
                    Personal Bests &amp; Records
                  </h3>
                  <p className={styles.cardSubtitle} style={{ fontSize: '0.75rem' }}>
                    All-time milestone achievements on NexLab
                  </p>
                </div>
              </div>
            </div>

            <div className={styles.recordsGrid4}>
              {/* Record 1: Longest Streak */}
              <div className={styles.recordItemBox}>
                <div className={styles.recordIconRow} style={{ color: '#ef4444' }}>
                  <Flame size={13} />
                  <span>Longest Streak</span>
                </div>
                <div className={styles.recordVal}>{longestStreak} days</div>
                <div className={styles.recordSub}>Consecutive solves</div>
              </div>

              {/* Record 2: Peak Rating */}
              <div className={styles.recordItemBox}>
                <div className={styles.recordIconRow} style={{ color: '#2563eb' }}>
                  <Zap size={13} />
                  <span>Peak Rating</span>
                </div>
                <div className={styles.recordVal}>
                  {bests?.peak_rating != null ? Math.round(bests.peak_rating).toLocaleString() : '—'}
                </div>
                <div className={styles.recordSub}>Platform ELO</div>
              </div>

              {/* Record 3: Fastest Solve */}
              <div className={styles.recordItemBox}>
                <div className={styles.recordIconRow} style={{ color: '#3b82f6' }}>
                  <Clock size={13} />
                  <span>Fastest Solve</span>
                </div>
                <div className={styles.recordVal}>{fastestMs ? `${fastestMs}ms` : '—'}</div>
                <div className={styles.recordSub}>{hardestProb?.title || 'Practice Solve'}</div>
              </div>

              {/* Record 4: Most in a Day */}
              <div className={styles.recordItemBox}>
                <div className={styles.recordIconRow} style={{ color: '#7c3aed' }}>
                  <Star size={13} />
                  <span>Most in a Day</span>
                </div>
                <div className={styles.recordVal}>{maxDailySolves} solves</div>
                <div className={styles.recordSub}>{maxDailyDate || '—'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FreeActivityTab;
