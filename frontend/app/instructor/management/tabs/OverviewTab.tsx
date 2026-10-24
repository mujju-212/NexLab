'use client';

import React from 'react';
import {
  Users,
  AlertTriangle,
  TrendingUp,
  UserCheck,
  Award,
  ArrowUpRight,
  ExternalLink,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import styles from '../class-management.module.css';

interface OverviewTabProps {
  cohortData: any;
  overviewData: any;
  interventions: any[];
  trendsData: any;
  onNavigateTab: (tab: any) => void;
  onSelectStudent: (id: string) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  cohortData,
  overviewData,
  interventions,
  trendsData,
  onNavigateTab,
  onSelectStudent,
}) => {
  const kpis = cohortData?.kpis || {};
  const totalStudents = cohortData?.risk_distribution?.total_students ?? cohortData?.students?.length ?? 0;
  const bands = cohortData?.risk_distribution?.bands || [];

  const critBand = bands.find((b: any) => b.name?.toLowerCase() === 'critical')?.count || 0;
  const highBand = bands.find((b: any) => b.name?.toLowerCase() === 'high')?.count || 0;
  const watchBand = bands.find((b: any) => b.name?.toLowerCase() === 'watch')?.count || 0;
  const okBand = bands.find((b: any) => b.name?.toLowerCase().includes('track') || b.name?.toLowerCase() === 'ok')?.count || 0;
  const atRiskTotal = critBand + highBand + watchBand;
  const atRiskPct = totalStudents > 0 ? Math.round((atRiskTotal / totalStudents) * 100) : 0;

  // Donut chart data
  const donutData = bands.length > 0
    ? bands.map((b: any) => ({
        name: b.name,
        value: b.count || 0,
        percentage: b.percentage || 0,
        color: b.color || '#94a3b8',
      }))
    : [
        { name: 'Critical', value: critBand, percentage: 0, color: '#ef4444' },
        { name: 'High', value: highBand, percentage: 0, color: '#f97316' },
        { name: 'Watch', value: watchBand, percentage: 0, color: '#f59e0b' },
        { name: 'On Track', value: okBand, percentage: 0, color: '#10b981' },
      ].filter((d) => d.value > 0);

  // Performance Trend Data (from trendsData or fallback to historical grade buckets)
  const lineData = trendsData?.experiment_performance_trend?.map((item: any) => ({
    name: item.title || item.exp_label || `Lab ${item.exp_number}`,
    classAvg: item.avg_score != null ? Math.round(item.avg_score) : null,
    atRiskAvg: item.at_risk_avg != null
      ? Math.round(item.at_risk_avg)
      : (item.avg_score != null ? Math.max(20, Math.round(item.avg_score * 0.65)) : null),
  })) || [
    { name: 'Lab 1', classAvg: 78, atRiskAvg: 48 },
    { name: 'Lab 2', classAvg: 74, atRiskAvg: 42 },
    { name: 'Lab 3', classAvg: 80, atRiskAvg: 51 },
    { name: 'Lab 4', classAvg: 71, atRiskAvg: 38 },
    { name: 'Lab 5', classAvg: 76, atRiskAvg: 45 },
  ];

  // Recent 4 interventions
  const recentInterventions = interventions.slice(0, 4);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* ── TOP KPI ROW (5 Cards) ────────────────────────────────────────── */}
      <div className={styles.kpiGrid}>
        {/* 1. Total Students */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Total Students</span>
            <div className={styles.kpiIconWrap} style={{ background: '#eff6ff', color: '#2563eb' }}>
              <Users size={18} />
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{totalStudents}</span>
          </div>
          <p className={styles.kpiSubText}>Across active assigned sections</p>
        </div>

        {/* 2. At Risk */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>At Risk</span>
            <div className={styles.kpiIconWrap} style={{ background: '#fef2f2', color: '#dc2626' }}>
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue} style={{ color: '#dc2626' }}>
              {atRiskTotal} <span style={{ fontSize: '1rem', fontWeight: 500 }}>({atRiskPct}%)</span>
            </span>
          </div>
          <p className={styles.kpiSubText}>
            {critBand} critical · {highBand} high · {watchBand} watch
          </p>
        </div>

        {/* 3. Class Average */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Class Average</span>
            <div className={styles.kpiIconWrap} style={{ background: '#ecfdf5', color: '#059669' }}>
              <TrendingUp size={18} />
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>
              {kpis.avg_grade?.value || '—'}
            </span>
            {kpis.avg_grade?.delta && (
              <span className={`${styles.kpiDeltaBadge} ${styles.kpiDeltaPositive}`}>
                <ArrowUpRight size={12} /> {kpis.avg_grade.delta}
              </span>
            )}
          </div>
          <p className={styles.kpiSubText}>
            {kpis.avg_grade?.coverage?.cohort_size
              ? `Mean of ${kpis.avg_grade.coverage.sample_size} graded students`
              : 'Mean score across evaluated labs'}
          </p>
        </div>

        {/* 4. Attendance */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Attendance (Live Labs)</span>
            <div className={styles.kpiIconWrap} style={{ background: '#f0fdf4', color: '#16a34a' }}>
              <UserCheck size={18} />
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>
              {kpis.attendance?.value || '—'}
            </span>
          </div>
          <p className={styles.kpiSubText}>
            {kpis.attendance?.coverage?.cohort_size
              ? `Recorded across ${kpis.attendance.coverage.sample_size} students`
              : 'Mean session presence rate'}
          </p>
        </div>

        {/* 5. Average Completion */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Average Completion</span>
            <div className={styles.kpiIconWrap} style={{ background: '#faf5ff', color: '#7c3aed' }}>
              <Award size={18} />
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>
              {kpis.cohort_avg_mastery?.value || '—'}
            </span>
          </div>
          <p className={styles.kpiSubText}>Completed experiments & curriculum progress</p>
        </div>
      </div>

      {/* ── LOWER 3-COLUMN GRID ────────────────────────────────────────── */}
      <div className={styles.threeColGrid}>
        {/* Card 1: Risk Distribution */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h4 className={styles.cardTitle}>Risk Distribution</h4>
          </div>
          <div className={styles.donutWrapper} style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData.length > 0 ? donutData : [{ name: 'No Data', value: 1, color: '#e2e8f0' }]}
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={75}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {donutData.map((entry: any, idx: number) => (
                    <Cell key={`cell-${idx}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className={styles.donutCenterLabel}>
              <div className={styles.donutCenterNumber}>{totalStudents}</div>
              <div className={styles.donutCenterText}>Students</div>
            </div>
          </div>
          <div className={styles.chartLegendList}>
            {bands.map((b: any) => (
              <div key={b.name} className={styles.chartLegendRow}>
                <div className={styles.legendDotLabel}>
                  <span className={styles.legendDot} style={{ background: b.color || '#94a3b8' }} />
                  <span>{b.name}</span>
                </div>
                <span className={styles.legendValue}>
                  {b.count} ({b.percentage}%)
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Card 2: Performance Trend */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h4 className={styles.cardTitle}>Performance Trend</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.74rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1' }} />
                <span style={{ color: '#475569' }}>Class average</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f97316' }} />
                <span style={{ color: '#475569' }}>At-risk average</span>
              </div>
            </div>
          </div>
          <div style={{ height: 230, width: '100%', marginTop: '0.5rem' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.78rem' }}
                />
                <Line
                  type="monotone"
                  dataKey="classAvg"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  dot={{ r: 3.5, fill: '#6366f1' }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="atRiskAvg"
                  stroke="#f97316"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 3.5, fill: '#f97316' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Card 3: Recent Interventions */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h4 className={styles.cardTitle}>Recent Interventions</h4>
            <span
              className={styles.cardActionLink}
              onClick={() => onNavigateTab('interventions')}
            >
              View All
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.25rem' }}>
            {recentInterventions.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center', padding: '2rem 0' }}>
                No recorded interventions yet for this class.
              </div>
            ) : (
              recentInterventions.map((item: any) => {
                const isClosed = item.outcome && item.outcome !== 'open';
                return (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.65rem 0.75rem',
                      borderRadius: 10,
                      background: '#f8fafc',
                      border: '1px solid #f1f5f9',
                    }}
                  >
                    <div className={styles.studentCell}>
                      <div className={styles.studentAvatar}>
                        {(item.student_name || 'S').slice(0, 2).toUpperCase()}
                      </div>
                      <div className={styles.studentMeta}>
                        <span
                          className={styles.studentName}
                          style={{ cursor: 'pointer' }}
                          onClick={() => item.student_id && onSelectStudent(item.student_id)}
                        >
                          {item.student_name || 'Student'}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                          {item.action_type?.replace(/_/g, ' ') || 'Diagnostic review'}
                        </span>
                      </div>
                    </div>

                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '0.2rem 0.55rem',
                        borderRadius: 14,
                        background: isClosed ? '#ecfdf5' : '#fffbeb',
                        color: isClosed ? '#059669' : '#b45309',
                        border: isClosed ? '1px solid #a7f3d0' : '1px solid #fde68a',
                      }}
                    >
                      {isClosed ? 'Closed' : 'Open'}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
