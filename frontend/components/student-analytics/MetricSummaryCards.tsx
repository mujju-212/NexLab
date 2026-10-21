'use client';

import React from 'react';
import {
  TrendingUp,
  Sparkles,
  Package,
  Code2,
  ArrowUp,
} from 'lucide-react';
import type { UnifiedStudentOverview } from '@/services/student-analytics.service';
import styles from './growth-overview.module.css';

interface MetricSummaryCardsProps {
  overview: UnifiedStudentOverview | null;
}

export const MetricSummaryCards: React.FC<MetricSummaryCardsProps> = ({ overview }) => {
  const kpis = overview?.summary_kpis;
  const academic = overview?.academic;
  const platform = overview?.platform;

  // 1. Overall Progress
  const overallVal = kpis?.overall_progress?.value ?? 72;
  const overallDelta = kpis?.overall_progress?.delta ?? '+12%';
  const sparklineData = kpis?.overall_progress?.sparkline ?? [52, 58, 63, 61, 67, 70, overallVal];

  // 2. Concepts Mastered
  const masteredConcepts = kpis?.concepts_mastered?.mastered ?? 18;
  const totalConcepts = kpis?.concepts_mastered?.total ?? 26;
  const conceptsDelta = kpis?.concepts_mastered?.delta ?? '+4';
  const conceptBars = kpis?.concepts_mastered?.bars ?? [10, 12, 14, 16, masteredConcepts];

  // 3. Experiments Completed
  const completedExps = kpis?.experiments_completed?.completed ?? academic?.completion?.completed ?? 18;
  const assignedExps = kpis?.experiments_completed?.assigned ?? academic?.completion?.assigned ?? 24;
  const expPct = kpis?.experiments_completed?.pct ?? (Math.round((completedExps / Math.max(1, assignedExps)) * 100) || 75);

  // 4. Practice Problems Solved
  const probSolved = kpis?.practice_problems_solved?.total ?? platform?.problems_solved ?? 142;
  const probDelta = kpis?.practice_problems_solved?.delta ?? '+28';
  const probBars = kpis?.practice_problems_solved?.bars ?? [60, 85, 110, 128, probSolved];

  // Sparkline path generator
  const minVal = Math.min(...sparklineData);
  const maxVal = Math.max(...sparklineData, minVal + 1);
  const points = sparklineData.map((val, idx) => {
    const x = (idx / (sparklineData.length - 1)) * 74 + 3;
    const y = 26 - ((val - minVal) / (maxVal - minVal)) * 20;
    return `${x},${y}`;
  });
  const pathD = `M ${points.join(' L ')}`;
  const fillD = `M 3,26 L ${points.join(' L ')} L 77,26 Z`;

  return (
    <div className={styles.metricsRow}>
      {/* ── CARD 1: Overall Progress ── */}
      <div className={styles.metricCard}>
        <div className={styles.metricTop}>
          <div className={styles.metricIconBox} style={{ background: '#dcfce7', color: '#16a34a' }}>
            <TrendingUp size={18} />
          </div>
          <div className={styles.metricTitles}>
            <h4>Overall Progress</h4>
            <p>Blended mastery score</p>
          </div>
        </div>

        <div className={styles.metricBottom}>
          <div className={styles.metricValueGroup}>
            <span className={styles.metricValue}>{overallVal}%</span>
            <span className={styles.deltaBadgeGreen}>
              <ArrowUp size={11} /> {overallDelta}
            </span>
          </div>

          {/* SVG Smooth Sparkline */}
          <svg className={styles.sparklineSvg} viewBox="0 0 80 30">
            <defs>
              <linearGradient id="sparklineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#22c55e" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <path d={fillD} fill="url(#sparklineGrad)" />
            <path
              d={pathD}
              fill="none"
              stroke="#22c55e"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* ── CARD 2: Concepts Mastered ── */}
      <div className={styles.metricCard}>
        <div className={styles.metricTop}>
          <div className={styles.metricIconBox} style={{ background: '#ede9fe', color: '#7c3aed' }}>
            <Sparkles size={18} />
          </div>
          <div className={styles.metricTitles}>
            <h4>Concepts Mastered</h4>
            <p>Across academic + practice</p>
          </div>
        </div>

        <div className={styles.metricBottom}>
          <div className={styles.metricValueGroup}>
            <span className={styles.metricValue}>{masteredConcepts} / {totalConcepts}</span>
            <span className={styles.deltaBadgeGreen}>
              <ArrowUp size={11} /> {conceptsDelta}
            </span>
          </div>

          {/* 5-bar Mini Bar Chart (Purple) */}
          <div className={styles.miniBarChart}>
            {conceptBars.map((b, i) => {
              const maxBar = Math.max(...conceptBars, 1);
              const heightPct = Math.max(25, Math.round((b / maxBar) * 100));
              return (
                <div
                  key={i}
                  className={styles.miniBar}
                  style={{
                    height: `${heightPct}%`,
                    background: `linear-gradient(180deg, #a855f7 0%, #7c3aed 100%)`,
                    opacity: 0.4 + (i / 4) * 0.6,
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* ── CARD 3: Experiments Completed ── */}
      <div className={styles.metricCard}>
        <div className={styles.metricTop}>
          <div className={styles.metricIconBox} style={{ background: '#ffedd5', color: '#ea580c' }}>
            <Package size={18} />
          </div>
          <div className={styles.metricTitles}>
            <h4>Experiments Completed</h4>
            <p>Out of assigned total</p>
          </div>
        </div>

        <div className={styles.metricBottom}>
          <div className={styles.metricValueGroup}>
            <span className={styles.metricValue}>{completedExps} / {assignedExps}</span>
            <span className={styles.metricPctVal}>{expPct}%</span>
          </div>

          {/* Linear Progress Bar (Orange) */}
          <div className={styles.linearProgressWrap}>
            <div
              className={styles.linearProgressFill}
              style={{
                width: `${expPct}%`,
                background: 'linear-gradient(90deg, #fb923c, #ea580c)',
              }}
            />
          </div>
        </div>
      </div>

      {/* ── CARD 4: Practice Problems Solved ── */}
      <div className={styles.metricCard}>
        <div className={styles.metricTop}>
          <div className={styles.metricIconBox} style={{ background: '#e0f2fe', color: '#0284c7' }}>
            <Code2 size={18} />
          </div>
          <div className={styles.metricTitles}>
            <h4>Practice Problems Solved</h4>
            <p>Easy • Medium • Hard</p>
          </div>
        </div>

        <div className={styles.metricBottom}>
          <div className={styles.metricValueGroup}>
            <span className={styles.metricValue}>{probSolved}</span>
            <span className={styles.deltaBadgeGreen}>
              <ArrowUp size={11} /> {probDelta}
            </span>
          </div>

          {/* 5-bar Mini Bar Chart (Blue) */}
          <div className={styles.miniBarChart}>
            {probBars.map((b, i) => {
              const maxBar = Math.max(...probBars, 1);
              const heightPct = Math.max(25, Math.round((b / maxBar) * 100));
              return (
                <div
                  key={i}
                  className={styles.miniBar}
                  style={{
                    height: `${heightPct}%`,
                    background: `linear-gradient(180deg, #38bdf8 0%, #0284c7 100%)`,
                    opacity: 0.4 + (i / 4) * 0.6,
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
