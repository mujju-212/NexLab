'use client';

import React from 'react';
import type { UnifiedStudentOverview } from '@/services/student-analytics.service';
import { TopStandingsRow } from './TopStandingsRow';
import { MetricSummaryCards } from './MetricSummaryCards';
import { LearningTrendCard } from './LearningTrendCard';
import { StrongestWeakestCard } from './StrongestWeakestCard';
import { RecentActivityCard } from './RecentActivityCard';
import { UpcomingGoalsCard } from './UpcomingGoalsCard';
import { AchievementsCard } from './AchievementsCard';
import styles from './growth-overview.module.css';

interface OverviewTabProps {
  overview: UnifiedStudentOverview | null;
  onNavigateTab: (tab: string) => void;
  studentName?: string;
  rollNumber?: string | null;
  department?: string | null;
  dateRange?: string;
  subjectCount?: number | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  overview,
  onNavigateTab,
  studentName,
  rollNumber,
  department,
  dateRange,
  subjectCount,
  loading = false,
  error,
  onRetry,
}) => {
  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading analytics from your records…</div>;
  if (error) return (
    <div role="alert" style={{ padding: '1.5rem', border: '1px solid #fecaca', borderRadius: 12, color: '#991b1b', background: '#fef2f2' }}>
      <p>Could not load your analytics. No sample data is shown.</p>
      <button onClick={onRetry} style={{ padding: '0.4rem 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer' }}>Retry</button>
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* ── Row 1: Profile & Standings (3 Cards) ── */}
      <TopStandingsRow
        overview={overview}
        studentName={studentName}
        rollNumber={rollNumber}
        department={department}
        subjectCount={subjectCount}
      />

      {/* ── Row 2: 4 Metric Summary Cards ── */}
      <MetricSummaryCards overview={overview} />

      {/* ── Row 3: Learning Trend (Left) & Strongest/Weakest Areas (Right) ── */}
      <div className={styles.middleGrid}>
        <LearningTrendCard overview={overview} />
        <StrongestWeakestCard
          overview={overview}
          onNavigateTab={onNavigateTab}
        />
      </div>

      {/* ── Row 4: Recent Activity, Upcoming Goals, Achievements (3 Columns) ── */}
      <div className={styles.bottomGrid}>
        <RecentActivityCard overview={overview} />
        <UpcomingGoalsCard overview={overview} />
        <AchievementsCard overview={overview} />
      </div>
    </div>
  );
};
