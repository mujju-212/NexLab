'use client';

import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import styles from '../class-management.module.css';

interface AnalyticsTabProps {
  trendsData: any;
  overviewData: any;
  masteryData: any;
}

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({
  trendsData,
  overviewData,
  masteryData,
}) => {
  // 1. Performance Trend Data — real backend fields only (full_title /
  // experiment_avg). The old fabricated at-risk / top-quartile series and mock
  // Lab 1–5 rows are gone: an empty dataset renders an empty chart, not lies.
  const perfData = (trendsData?.experiment_performance_trend ?? []).map((item: any, idx: number) => ({
    name: item.full_title || item.title || item.label || `Lab ${idx + 1}`,
    classAvg: item.experiment_avg != null
      ? Math.round(item.experiment_avg)
      : (item.avg_score != null ? Math.round(item.avg_score) : null),
    atRiskAvg: item.at_risk_avg != null ? Math.round(item.at_risk_avg) : null,
    topQuartile: item.top_quartile != null ? Math.round(item.top_quartile) : null,
  }));

  // 2. Attendance Trend Data (Bar chart across Labs)
  const attendanceData = (trendsData?.experiment_performance_trend ?? []).map((item: any, idx: number) => ({
    name: item.full_title || item.label || `Lab ${idx + 1}`,
    attendance: item.attendance_pct != null ? Math.round(item.attendance_pct) : null,
  }));

  // 3 & 4. Real distributions computed from the students heatmap (per-student,
  // per-experiment scores). The old hardcoded bucket/struggle mock arrays are gone.
  const heatmapScores: Array<{ expLabel: string; score: number }> = [];
  (trendsData?.students_heatmap ?? []).forEach((st: any) => {
    (st.experiments ?? []).forEach((cell: any) => {
      if (cell.score != null) {
        heatmapScores.push({ expLabel: cell.exp_title || cell.exp_label || `Exp ${cell.exp_num}`, score: Number(cell.score) });
      }
    });
  });

  // Grade Distribution (Histogram buckets: 0-20, 20-40, 40-60, 60-80, 80-100)
  const bucketDefs = [
    { bracket: '0-20', min: 0, fill: '#ef4444' },
    { bracket: '20-40', min: 20, fill: '#f97316' },
    { bracket: '40-60', min: 40, fill: '#f59e0b' },
    { bracket: '60-80', min: 60, fill: '#3b82f6' },
    { bracket: '80-100', min: 80, fill: '#10b981' },
  ];
  const gradeDistData = bucketDefs.map((b, i) => ({
    bracket: b.bracket,
    count: heatmapScores.filter(x => x.score >= b.min && x.score < (bucketDefs[i + 1]?.min ?? 101)).length,
    fill: b.fill,
  })).filter(b => heatmapScores.length > 0);

  // Concept/Experiment difficulty — % of students scoring below 40 on each experiment
  const byExperiment: Record<string, { total: number; struggling: number }> = {};
  heatmapScores.forEach(({ expLabel, score }) => {
    const bucket = (byExperiment[expLabel] ??= { total: 0, struggling: 0 });
    bucket.total += 1;
    if (score < 40) bucket.struggling += 1;
  });
  const strugglePalette = ['#ef4444', '#f97316', '#f59e0b', '#6366f1', '#3b82f6', '#10b981', '#9333ea', '#0891b2'];
  const difficultyData = Object.entries(byExperiment)
    .map(([concept, { total, struggling }]) => ({
      concept,
      failRate: Math.round((struggling / total) * 100),
      fill: strugglePalette[0],
    }))
    .sort((a, b) => b.failRate - a.failRate)
    .slice(0, 8)
    .map((d, i) => ({ ...d, fill: strugglePalette[i % strugglePalette.length] }));

  return (
    <div className={styles.analyticsGrid}>
      {/* Chart 1: Performance Trend */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h4 className={styles.cardTitle}>Performance Trend</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', fontSize: '0.72rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1' }} /> Class avg
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f97316' }} /> At-risk avg
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} /> Top 25%
            </span>
          </div>
        </div>
        <div style={{ height: 230, width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={perfData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} domain={[0, 100]} />
              <Tooltip contentStyle={{ background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.78rem' }} />
              <Line type="monotone" dataKey="classAvg" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="atRiskAvg" stroke="#f97316" strokeDasharray="4 4" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="topQuartile" stroke="#10b981" strokeWidth={1.5} dot={{ r: 2.5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 2: Attendance Trend */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h4 className={styles.cardTitle}>Attendance Trend</h4>
          <span style={{ fontSize: '0.74rem', color: '#64748b' }}>Mean % per Lab</span>
        </div>
        <div style={{ height: 230, width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={attendanceData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} domain={[0, 100]} />
              <Tooltip contentStyle={{ background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.78rem' }} />
              <Bar dataKey="attendance" fill="#7c3aed" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 3: Grade Distribution */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h4 className={styles.cardTitle}>Grade Distribution</h4>
          <span style={{ fontSize: '0.74rem', color: '#64748b' }}>Student score cohorts</span>
        </div>
        <div style={{ height: 230, width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={gradeDistData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="bracket" stroke="#94a3b8" fontSize={11} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
              <Tooltip contentStyle={{ background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.78rem' }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {gradeDistData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 4: Concept Difficulty */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h4 className={styles.cardTitle}>Concept Difficulty</h4>
          <span style={{ fontSize: '0.74rem', color: '#64748b' }}>Struggle / Fail rate</span>
        </div>
        <div style={{ height: 230, width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={difficultyData}
              layout="vertical"
              margin={{ top: 5, right: 20, left: 40, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" stroke="#94a3b8" fontSize={11} tickLine={false} domain={[0, 100]} />
              <YAxis type="category" dataKey="concept" stroke="#94a3b8" fontSize={11} tickLine={false} />
              <Tooltip contentStyle={{ background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.78rem' }} />
              <Bar dataKey="failRate" radius={[0, 4, 4, 0]}>
                {difficultyData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
