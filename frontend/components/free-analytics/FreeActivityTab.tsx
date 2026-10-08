'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  TrendingUp,
  Target,
  Zap,
  Flame,
  Award,
  Trophy,
  CheckCircle2,
  Clock,
  Crosshair,
  BarChart3,
  HelpCircle,
} from 'lucide-react';
import { TrendChart, type TrendSeries } from '@/components/analytics/TrendChart';
import { freeService, type FreeActivityData, type FreeAccuracyData } from '@/services/free.service';
import styles from './free-analytics.module.css';

interface FreeActivityTabProps {
  activity?: FreeActivityData;
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const FreeActivityTab: React.FC<FreeActivityTabProps> = ({ activity: initialActivity }) => {
  const [metricView, setMetricView] = useState<'cumulative' | 'daily'>('cumulative');

  // Query Activity if not passed
  const { data: fetchedActivity } = useQuery({
    queryKey: ['free-activity'],
    queryFn: () => freeService.getActivity(365),
    enabled: !initialActivity,
  });

  const activity = initialActivity || fetchedActivity;

  // Query Accuracy & Personal Bests
  const { data: accuracyData, isLoading: accuracyLoading } = useQuery<FreeAccuracyData>({
    queryKey: ['free-accuracy'],
    queryFn: () => freeService.getAccuracy(),
  });

  // Format milliseconds into human readable time
  const formatMs = (ms: number | null | undefined) => {
    if (!ms || ms <= 0) return '—';
    const totalSec = Math.floor(ms / 1000);
    if (totalSec < 60) return `${totalSec}s`;
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}m ${sec}s`;
  };

  // Group Heatmap days into calendar week columns (Sun-Sat)
  const { weeks, monthLabels } = useMemo(() => {
    const list = activity?.heatmap || [];
    if (list.length === 0) return { weeks: [], monthLabels: [] };

    type DayItem = { date: string; count: number; level: number };
    const weekCols: Array<Array<DayItem | null>> = [];
    const months: Array<{ label: string; colIndex: number }> = [];

    let currentWeek: Array<DayItem | null> = [];
    let lastMonth = -1;

    // Determine the day of week for the first item
    const firstDate = new Date(`${list[0].date}T00:00:00`);
    const startDay = firstDate.getDay(); // 0 is Sun

    // Pad beginning of first week
    for (let i = 0; i < startDay; i++) {
      currentWeek.push(null);
    }

    list.forEach((item) => {
      const d = new Date(`${item.date}T00:00:00`);
      const month = d.getMonth();
      const day = d.getDay();

      if (month !== lastMonth) {
        lastMonth = month;
        months.push({
          label: d.toLocaleString('default', { month: 'short' }),
          colIndex: weekCols.length,
        });
      }

      currentWeek.push(item);
      if (currentWeek.length === 7) {
        weekCols.push(currentWeek);
        currentWeek = [];
      }
    });

    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      weekCols.push(currentWeek);
    }

    return { weeks: weekCols, monthLabels: months };
  }, [activity?.heatmap]);

  // Combine trend series
  const trendData = useMemo(() => {
    const solveTrend = activity?.solve_trend || [];
    const xpTrend = activity?.xp_trend || [];
    const maxLen = Math.max(solveTrend.length, xpTrend.length);

    const merged = [];
    for (let i = 0; i < maxLen; i++) {
      const s = solveTrend[i];
      const x = xpTrend[i];
      const dateStr = s?.date || x?.date || '';
      merged.push({
        date: dateStr ? dateStr.slice(5) : `Day ${i + 1}`,
        fullDate: dateStr,
        cumulative_solved: s?.cumulative_solved ?? 0,
        new_solves: s?.new_solves ?? 0,
        cumulative_xp: x?.cumulative_xp ?? 0,
        delta_xp: x?.delta_xp ?? 0,
      });
    }
    return merged;
  }, [activity?.solve_trend, activity?.xp_trend]);

  const seriesCumulative: TrendSeries[] = [
    {
      key: 'cumulative_solved',
      name: 'Problems Solved',
      color: '#7c3aed',
      type: 'area',
      unit: '',
    },
    {
      key: 'cumulative_xp',
      name: 'Total XP Earned',
      color: '#f59e0b',
      type: 'line',
      unit: ' XP',
    },
  ];

  const seriesDaily: TrendSeries[] = [
    {
      key: 'new_solves',
      name: 'Daily Solves',
      color: '#10b981',
      type: 'area',
      unit: '',
    },
    {
      key: 'delta_xp',
      name: 'Daily XP Delta',
      color: '#6366f1',
      type: 'line',
      unit: ' XP',
    },
  ];

  const summary = activity?.summary;
  const bests = accuracyData?.personal_bests;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* ── 1. Activity & Streak Highlights Strip ─────────────────────────── */}
      <div className={styles.highlightsRow}>
        <div className={styles.highlightCard}>
          <div className={styles.highlightIconBox} style={{ background: '#ecfdf5', color: '#059669' }}>
            <Calendar size={18} />
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
              {summary?.total_active_days ?? 0}
            </div>
            <div style={{ fontSize: '0.725rem', color: '#64748b' }}>Active Days (Past 365)</div>
          </div>
        </div>

        <div className={styles.highlightCard}>
          <div className={styles.highlightIconBox} style={{ background: '#fef2f2', color: '#dc2626' }}>
            <Flame size={18} />
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
              {summary?.current_streak ?? 0} days
            </div>
            <div style={{ fontSize: '0.725rem', color: '#64748b' }}>
              Current Streak (Best: {summary?.longest_streak ?? 0}d)
            </div>
          </div>
        </div>

        <div className={styles.highlightCard}>
          <div className={styles.highlightIconBox} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
            <CheckCircle2 size={18} />
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
              {summary?.total_submissions ?? 0}
            </div>
            <div style={{ fontSize: '0.725rem', color: '#64748b' }}>Total Submissions</div>
          </div>
        </div>

        <div className={styles.highlightCard}>
          <div className={styles.highlightIconBox} style={{ background: '#fffbeb', color: '#d97706' }}>
            <Zap size={18} />
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
              {summary?.max_daily_count ?? 0}
            </div>
            <div style={{ fontSize: '0.725rem', color: '#64748b' }}>
              Max Daily Solves {summary?.most_active_date ? `(${summary.most_active_date})` : ''}
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. GitHub-Style 365-Day Activity Heatmap ──────────────────────── */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleWrap}>
            <div className={styles.cardIconBox} style={{ background: '#ede9fe', color: '#7c3aed' }}>
              <Calendar size={20} />
            </div>
            <div>
              <h3 className={styles.cardTitle}>Year of Code Heatmap</h3>
              <p className={styles.cardSubtitle}>
                Submission frequency across the past 365 days
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: '#64748b' }}>
            <span>Total: <strong>{summary?.total_submissions ?? 0}</strong> submissions</span>
          </div>
        </div>

        {/* Heatmap Grid */}
        <div className={styles.heatmapWrapper}>
          {/* Month labels row */}
          <div
            style={{
              display: 'flex',
              fontSize: '0.7rem',
              color: '#94a3b8',
              marginBottom: '0.35rem',
              paddingLeft: '28px',
              minWidth: '760px',
              position: 'relative',
              height: '16px',
            }}
          >
            {monthLabels.map((m, idx) => (
              <span
                key={idx}
                style={{
                  position: 'absolute',
                  left: `${28 + m.colIndex * 14}px`,
                  fontWeight: 600,
                }}
              >
                {m.label}
              </span>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '8px', minWidth: '760px' }}>
            {/* Day labels (Sun, Tue, Thu, Sat) */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                height: `${7 * 14}px`,
                fontSize: '0.675rem',
                color: '#94a3b8',
                paddingTop: '1px',
                paddingBottom: '2px',
                width: '24px',
                textAlign: 'right',
                flexShrink: 0,
              }}
            >
              <span>Sun</span>
              <span>Tue</span>
              <span>Thu</span>
              <span>Sat</span>
            </div>

            {/* Week Columns */}
            <div className={styles.heatmapGrid}>
              {weeks.map((week, wIdx) => (
                <div key={wIdx} className={styles.heatmapCol}>
                  {week.map((day, dIdx) => {
                    if (!day) {
                      return (
                        <div
                          key={`empty-${dIdx}`}
                          style={{ width: 11, height: 11, visibility: 'hidden' }}
                        />
                      );
                    }

                    const levelClass =
                      day.level === 1
                        ? styles.cellLevel1
                        : day.level === 2
                        ? styles.cellLevel2
                        : day.level === 3
                        ? styles.cellLevel3
                        : day.level >= 4
                        ? styles.cellLevel4
                        : styles.cellLevel0;

                    return (
                      <div
                        key={day.date}
                        className={`${styles.heatmapCell} ${levelClass}`}
                        title={`${day.date}: ${day.count} submission${day.count === 1 ? '' : 's'}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className={styles.heatmapLegend}>
            <span>Less</span>
            <div className={`${styles.heatmapCell} ${styles.cellLevel0}`} />
            <div className={`${styles.heatmapCell} ${styles.cellLevel1}`} />
            <div className={`${styles.heatmapCell} ${styles.cellLevel2}`} />
            <div className={`${styles.heatmapCell} ${styles.cellLevel3}`} />
            <div className={`${styles.heatmapCell} ${styles.cellLevel4}`} />
            <span>More</span>
          </div>
        </div>
      </div>

      {/* ── 3. Solves & XP Progression Trends ─────────────────────────────── */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleWrap}>
            <div className={styles.cardIconBox} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
              <TrendingUp size={20} />
            </div>
            <div>
              <h3 className={styles.cardTitle}>Skill Velocity & XP Trend</h3>
              <p className={styles.cardSubtitle}>
                Cumulative problem solves and earned experience points over time
              </p>
            </div>
          </div>

          {/* Toggle between cumulative and daily */}
          <div style={{ display: 'flex', gap: '0.25rem', background: '#f1f5f9', padding: '0.25rem', borderRadius: '0.5rem' }}>
            <button
              onClick={() => setMetricView('cumulative')}
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '0.35rem 0.75rem',
                borderRadius: '0.375rem',
                border: 'none',
                cursor: 'pointer',
                background: metricView === 'cumulative' ? '#fff' : 'transparent',
                color: metricView === 'cumulative' ? '#7c3aed' : '#64748b',
                boxShadow: metricView === 'cumulative' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              Cumulative Growth
            </button>
            <button
              onClick={() => setMetricView('daily')}
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '0.35rem 0.75rem',
                borderRadius: '0.375rem',
                border: 'none',
                cursor: 'pointer',
                background: metricView === 'daily' ? '#fff' : 'transparent',
                color: metricView === 'daily' ? '#7c3aed' : '#64748b',
                boxShadow: metricView === 'daily' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              Daily Output
            </button>
          </div>
        </div>

        <TrendChart
          data={trendData}
          xKey="date"
          series={metricView === 'cumulative' ? seriesCumulative : seriesDaily}
          height={320}
        />
      </div>

      {/* ── 4. Accuracy & Personal Bests Grid ─────────────────────────────── */}
      <div className={styles.twoColGrid}>
        {/* Accuracy Breakdown Card */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleWrap}>
              <div className={styles.cardIconBox} style={{ background: '#ecfdf5', color: '#059669' }}>
                <Crosshair size={20} />
              </div>
              <div>
                <h3 className={styles.cardTitle}>Precision & Accuracy</h3>
                <p className={styles.cardSubtitle}>Submission pass efficiency and attempt rates</p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Primary Accuracy Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', textAlign: 'center' }}>
              <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '0.75rem', border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#059669' }}>
                  {accuracyData ? `${Math.round(accuracyData.acceptance_rate)}%` : '—'}
                </div>
                <div style={{ fontSize: '0.725rem', color: '#64748b', fontWeight: 600, marginTop: '0.2rem' }}>
                  Acceptance Rate
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '0.75rem', border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#7c3aed' }}>
                  {accuracyData ? `${Math.round(accuracyData.first_try_rate)}%` : '—'}
                </div>
                <div style={{ fontSize: '0.725rem', color: '#64748b', fontWeight: 600, marginTop: '0.2rem' }}>
                  First-Try Solves
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '0.75rem', border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a' }}>
                  {accuracyData ? accuracyData.avg_attempts.toFixed(1) : '—'}
                </div>
                <div style={{ fontSize: '0.725rem', color: '#64748b', fontWeight: 600, marginTop: '0.2rem' }}>
                  Avg Attempts/Solve
                </div>
              </div>
            </div>

            {/* Visual Bars */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  <span style={{ color: '#334155' }}>Overall Submission Accuracy</span>
                  <span style={{ color: '#059669', fontWeight: 800 }}>
                    {accuracyData ? `${Math.round(accuracyData.acceptance_rate)}%` : '0%'}
                  </span>
                </div>
                <div style={{ height: 8, background: '#f1f5f9', borderRadius: 9999, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      background: 'linear-gradient(90deg, #10b981, #059669)',
                      width: `${accuracyData ? Math.min(100, accuracyData.acceptance_rate) : 0}%`,
                      borderRadius: 9999,
                      transition: 'width 0.5s ease',
                    }}
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  <span style={{ color: '#334155' }}>First Attempt Accuracy (Zero Trial Error)</span>
                  <span style={{ color: '#7c3aed', fontWeight: 800 }}>
                    {accuracyData ? `${Math.round(accuracyData.first_try_rate)}%` : '0%'}
                  </span>
                </div>
                <div style={{ height: 8, background: '#f1f5f9', borderRadius: 9999, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      background: 'linear-gradient(90deg, #7c3aed, #9333ea)',
                      width: `${accuracyData ? Math.min(100, accuracyData.first_try_rate) : 0}%`,
                      borderRadius: 9999,
                      transition: 'width 0.5s ease',
                    }}
                  />
                </div>
              </div>
            </div>

            <div style={{ fontSize: '0.75rem', color: '#64748b', background: '#f8fafc', padding: '0.75rem', borderRadius: '0.625rem', border: '1px solid #f1f5f9' }}>
              💡 <strong>Pro-Tip:</strong> Running code tests before final submit significantly elevates your first-try rate and platform rating momentum.
            </div>
          </div>
        </div>

        {/* Personal Bests Card */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleWrap}>
              <div className={styles.cardIconBox} style={{ background: '#fffbeb', color: '#d97706' }}>
                <Trophy size={20} />
              </div>
              <div>
                <h3 className={styles.cardTitle}>Personal Bests & Records</h3>
                <p className={styles.cardSubtitle}>All-time milestone achievements on NexLab</p>
              </div>
            </div>
          </div>

          <div className={styles.bestsGrid}>
            {/* Best 1: Longest Streak */}
            <div className={styles.bestCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#ef4444' }}>
                <Flame size={16} />
                <span className={styles.bestLabel}>Longest Streak</span>
              </div>
              <span className={styles.bestValue}>{bests?.longest_streak_days ?? 0} days</span>
              <span className={styles.bestDetail}>Consecutive daily problem solving</span>
            </div>

            {/* Best 2: Peak Rating */}
            <div className={styles.bestCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#7c3aed' }}>
                <Award size={16} />
                <span className={styles.bestLabel}>Peak Rating</span>
              </div>
              <span className={styles.bestValue}>{Math.round(bests?.peak_rating ?? 0)}</span>
              <span className={styles.bestDetail}>Highest competitive Elo reached</span>
            </div>

            {/* Best 3: Fastest Solve */}
            <div className={styles.bestCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#10b981' }}>
                <Clock size={16} />
                <span className={styles.bestLabel}>Fastest Solve</span>
              </div>
              <span className={styles.bestValue}>{formatMs(bests?.fastest_solve_ms)}</span>
              <span className={styles.bestDetail}>From read to accepted submission</span>
            </div>

            {/* Best 4: Hardest Problem Solved */}
            <div className={styles.bestCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#b45309' }}>
                <Trophy size={16} />
                <span className={styles.bestLabel}>Hardest Problem</span>
              </div>
              <span
                className={styles.bestValue}
                style={{
                  fontSize: '0.95rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={bests?.hardest_problem_cracked?.title || 'None yet'}
              >
                {bests?.hardest_problem_cracked?.title || 'None yet'}
              </span>
              <span className={styles.bestDetail}>
                {bests?.hardest_problem_cracked
                  ? `${bests.hardest_problem_cracked.difficulty} · ${Math.round(bests.hardest_problem_cracked.acceptance)}% acceptance`
                  : 'Solve Hard tier exercises to register'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
