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
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  overview,
  onNavigateTab,
  studentName,
  rollNumber,
  department,
  dateRange,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* ── Row 1: Profile & Standings (3 Cards) ── */}
      <TopStandingsRow
        overview={overview}
        studentName={studentName}
        rollNumber={rollNumber}
        department={department}
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
