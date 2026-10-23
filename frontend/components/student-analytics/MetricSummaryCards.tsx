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
import Sparkline from '@/components/analytics/Sparkline';
import { MetricValue, FractionValue } from '@/components/analytics/MetricValue';
import styles from './growth-overview.module.css';

interface MetricSummaryCardsProps {
  overview: UnifiedStudentOverview | null;
}

export const MetricSummaryCards: React.FC<MetricSummaryCardsProps> = ({ overview }) => {
  const kpis = overview?.summary_kpis;
  const academic = overview?.academic;
  const platform = overview?.platform;

  // Every value below is either measured by the API or rendered as "—".
  // (This component used to fall back to 72%, +12%, 18/26 concepts,
  // 18/24 experiments, 142 problems and invented bar arrays, i.e. a completely
  // different imaginary student whenever a key was missing.)
  const overallVal = kpis?.overall_progress?.value ?? null;
  const overallDelta = kpis?.overall_progress?.delta ?? null;
  const sparklineData = kpis?.overall_progress?.sparkline ?? [];

  const masteredConcepts = kpis?.concepts_mastered?.mastered ?? null;
  const totalConcepts = kpis?.concepts_mastered?.total ?? null;
  const conceptsDelta = kpis?.concepts_mastered?.delta ?? null;

  const completedExps =
    kpis?.experiments_completed?.completed ?? academic?.completion?.completed ?? null;
  const assignedExps =
    kpis?.experiments_completed?.assigned ?? academic?.completion?.assigned ?? null;
  const expPct =
    kpis?.experiments_completed?.pct ??
    (completedExps !== null && assignedExps ? Math.round((completedExps / assignedExps) * 100) : null);

  const probSolved = kpis?.practice_problems_solved?.total ?? platform?.problems_solved ?? null;
  const probDelta = kpis?.practice_problems_solved?.delta ?? null;


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
            <span className={styles.metricValue}>
              <MetricValue value={overallVal} suffix="%" />
            </span>
            {overallDelta !== null && overallDelta !== undefined && (
              <span className={styles.deltaBadgeGreen}>
                <ArrowUp size={11} /> {overallDelta}
              </span>
            )}
          </div>

          <Sparkline points={sparklineData} color="#22c55e" width={80} height={30} fill />
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
            <span className={styles.metricValue}>
              <FractionValue numerator={masteredConcepts} denominator={totalConcepts} />
            </span>
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
            <span className={styles.metricValue}>
              <FractionValue numerator={completedExps} denominator={assignedExps} />
            </span>
            <span className={styles.metricPctVal}>
              <MetricValue value={expPct} suffix="%" />
            </span>
          </div>

          {/* Linear Progress Bar (Orange) */}
          <div className={styles.linearProgressWrap}>
            <div
              className={styles.linearProgressFill}
              style={{
                width: `${expPct ?? 0}%`,
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
            <span className={styles.metricValue}>
              <MetricValue value={probSolved} />
            </span>
            {probDelta ? (
              <span className={styles.deltaBadgeGreen}>
                <ArrowUp size={11} /> {probDelta}
              </span>
            ) : null}
          </div>

        </div>
      </div>
    </div>
  );
};
