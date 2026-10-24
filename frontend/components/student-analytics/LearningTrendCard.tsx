'use client';

import React, { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { TrendingUp, ChevronDown } from 'lucide-react';
import type { UnifiedStudentOverview } from '@/services/student-analytics.service';
import styles from './growth-overview.module.css';

interface LearningTrendCardProps {
  overview: UnifiedStudentOverview | null;
}

export const LearningTrendCard: React.FC<LearningTrendCardProps> = ({ overview }) => {
  const [weeksFilter, setWeeksFilter] = useState<'12' | '6' | '4'>('12');

  const rawTrend = overview?.learning_trend ?? [];

  const data = weeksFilter === '4'
    ? rawTrend.slice(-4)
    : weeksFilter === '6'
    ? rawTrend.slice(-6)
    : rawTrend;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const point = payload[0].payload;
      return (
        <div className={styles.customTooltip}>
          <span className={styles.tooltipTitle}>{point.label || label}</span>
          <div className={styles.tooltipMetrics}>
            <span style={{ color: '#c084fc' }}>● Grade: {point.academic_grade != null ? `${point.academic_grade}%` : '—'}</span>
            <span style={{ color: '#38bdf8' }}>● Rating: {point.practice_rating_raw != null ? point.practice_rating_raw.toLocaleString() : '—'}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={styles.card}>
      <div className={styles.cardHeaderRow}>
        <div className={styles.cardTitleBlock}>
          <div className={`${styles.headerIconCircle}`} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
            <TrendingUp size={18} />
          </div>
          <div>
            <h3>Learning Trend</h3>
            <p>Your academic performance and practice rating over time.</p>
          </div>
        </div>

        <select
          value={weeksFilter}
          onChange={(e) => setWeeksFilter(e.target.value as any)}
          className={styles.filterPillSelect}
        >
          <option value="12">Last 12 Weeks</option>
          <option value="6">Last 6 Weeks</option>
          <option value="4">Last 4 Weeks</option>
        </select>
      </div>

      {/* Legend Strip */}
      <div className={styles.chartLegendRow}>
        <div className={styles.legendItem}>
          <div className={styles.legendDot} style={{ background: '#8b5cf6' }} />
          <span>Academic Grade %</span>
        </div>
        <div className={styles.legendItem}>
          <div className={styles.legendDot} style={{ background: '#0284c7' }} />
          <span>Practice Rating (scaled)</span>
        </div>
      </div>

      {data.length === 0 || !data.some((point) => point.academic_grade != null || point.practice_rating_scaled != null) ? (
        <div className={styles.chartContainer} style={{ display: 'grid', placeItems: 'center', color: '#64748b' }}>
          No historical grade or rating observations are available yet.
        </div>
      ) : (
      <div className={styles.chartContainer}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 15, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="week"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
              dy={6}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
            />
            <Tooltip content={<CustomTooltip />} />
            {/* Academic Grade Line (Purple) */}
            <Line
              type="monotone"
              dataKey="academic_grade"
              stroke="#8b5cf6"
              strokeWidth={2.5}
              dot={{ r: 3.5, fill: '#8b5cf6', stroke: '#ffffff', strokeWidth: 1.5 }}
              activeDot={{ r: 5.5, fill: '#7c3aed', stroke: '#ffffff', strokeWidth: 2 }}
            />
            {/* Practice Rating Line (Cyan-Blue) */}
            <Line
              type="monotone"
              dataKey="practice_rating_scaled"
              stroke="#0284c7"
              strokeWidth={2.5}
              dot={{ r: 3.5, fill: '#0284c7', stroke: '#ffffff', strokeWidth: 1.5 }}
              activeDot={{ r: 5.5, fill: '#0369a1', stroke: '#ffffff', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      )}
    </div>
  );
};
