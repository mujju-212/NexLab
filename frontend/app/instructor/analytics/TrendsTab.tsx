'use client';

import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  CheckCircle2,
  Calendar,
  Zap,
  AlertTriangle,
  Clock,
  Info,
  Lightbulb,
  MoreVertical,
  X,
  ExternalLink,
  ChevronRight,
  Sparkles,
  BarChart3,
  Filter,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  Line,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
} from 'recharts';
import styles from './instructor-analytics.module.css';
import { type TrendsOverviewData } from '@/services/analytics.service';

interface TrendsTabProps {
  data: TrendsOverviewData;
  onSelectStudent?: (studentId: string) => void;
  onSelectExperiment?: (experimentId: string) => void;
}

// Mini SVG sparkline for KPI cards
function MiniSparkline({ points, color }: { points: number[]; color: string }) {
  // Real series can contain gaps; a single point is not a trend.
  const vals = (points || []).filter((p) => typeof p === 'number' && Number.isFinite(p));
  if (vals.length < 2) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const width = 74;
  const height = 24;

  const pts = vals.map((p, idx) => {
    const x = (idx / (vals.length - 1)) * (width - 8) + 4;
    const y = height - 4 - ((p - min) / range) * (height - 8);
    return `${x},${y}`;
  });

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts.join(' ')}
      />
    </svg>
  );
}

// Custom Tooltip for Longitudinal Performance
function CustomLongitudinalTooltip({ active, payload, metricName }: any) {
  if (active && payload && payload.length) {
    const item = payload[0].payload;
    return (
      <div
        style={{
          background: '#0f172a',
          color: '#ffffff',
          padding: '10px 14px',
          borderRadius: 8,
          fontSize: '0.75rem',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          minWidth: 165,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#c4b5fd', marginBottom: 4 }}>
          {item.full_date || item.date}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, color: '#cbd5e1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span>{metricName} Avg:</span>
            <strong style={{ color: '#ffffff' }}>
              {item.metric_actual !== null && item.metric_actual !== undefined
                ? `${item.metric_actual}%`
                : `${item.metric_forecast}% (Forecast)`}
            </strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span>95% CI:</span>
            <strong style={{ color: '#a78bfa' }}>
              {item.metric_ci_lower}% – {item.metric_ci_upper}%
            </strong>
          </div>
          {item.students_count && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span>Students:</span>
              <strong style={{ color: '#ffffff' }}>{item.students_count}</strong>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
}

// Custom Tooltip for Metric Trends Over Time
function CustomMetricTrendsTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div
        style={{
          background: '#0f172a',
          color: '#ffffff',
          padding: '10px 14px',
          borderRadius: 8,
          fontSize: '0.75rem',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          minWidth: 175,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#e2e8f0', marginBottom: 4 }}>
          {label}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {payload.map((p: any) => (
            <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ color: p.color, fontWeight: 600 }}>{p.name}:</span>
              <strong style={{ color: '#ffffff' }}>{p.value}%</strong>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
}

// Custom Tooltip for Experiment-wise Performance
function CustomExpTrendTooltip({ active, payload, metricLabel }: any) {
  if (active && payload && payload.length) {
    const item = payload[0].payload;
    return (
      <div
        style={{
          background: '#0f172a',
          color: '#ffffff',
          padding: '10px 14px',
          borderRadius: 8,
          fontSize: '0.75rem',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          maxWidth: 220,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#c4b5fd', marginBottom: 4 }}>
          {item.label}: {item.full_title}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, color: '#cbd5e1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span>{metricLabel || 'Experiment'} Avg:</span>
            <strong style={{ color: '#ffffff' }}>{item.val}%</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span>Overall Trend:</span>
            <strong style={{ color: '#a78bfa' }}>{item.overall_trend}%</strong>
          </div>
        </div>
        <div style={{ marginTop: 6, fontSize: '0.675rem', color: '#94a3b8', borderTop: '1px solid #334155', paddingTop: 4 }}>
          Click bar to filter analytics by this experiment
        </div>
      </div>
    );
  }
  return null;
}

export function TrendsTab({ data, onSelectStudent, onSelectExperiment }: TrendsTabProps) {
  // KPI interactive focus selection
  const [activeKpi, setActiveKpi] = useState<string | null>(null);

  // Metric selector states
  const [longitudinalMetric, setLongitudinalMetric] = useState<'Final Grade' | 'Completion Rate' | 'Attendance' | 'Focus Score'>('Final Grade');
  const [showLongitudinalActual, setShowLongitudinalActual] = useState(true);
  const [showLongitudinalForecast, setShowLongitudinalForecast] = useState(true);
  const [showLongitudinalCi, setShowLongitudinalCi] = useState(true);

  // Metric Trends Over Time visibility toggles
  const [metricFilterPreset, setMetricFilterPreset] = useState<'all' | 'grade_completion' | 'att_focus' | 'grade_only'>('all');
  const [showFinalGrade, setShowFinalGrade] = useState(true);
  const [showCompletionRate, setShowCompletionRate] = useState(true);
  const [showAttendance, setShowAttendance] = useState(true);
  const [showFocusScore, setShowFocusScore] = useState(true);

  // Experiment performance metric selection
  const [expMetric, setExpMetric] = useState<'Final Grade' | 'Auto Grade' | 'Manual Grade'>('Final Grade');
  const [showExpBars, setShowExpBars] = useState(true);
  const [showExpTrend, setShowExpTrend] = useState(true);

  // Heatmap controls
  const [heatmapMetric, setHeatmapMetric] = useState<'Final Grade' | 'Attempts'>('Final Grade');
  const [selectedGradeTier, setSelectedGradeTier] = useState<string | null>(null);

  // Detailed modal state
  const [showDetailedModal, setShowDetailedModal] = useState(false);

  // Floating tooltip state for heatmap cell
  const [hoveredCell, setHoveredCell] = useState<{
    student: string;
    roll: string;
    exp: string;
    score: number | null;
    attempts?: number;
    status: string;
    x: number;
    y: number;
  } | null>(null);

  // Handle KPI Click to cross-interact
  const handleKpiClick = (kpiKey: string) => {
    if (activeKpi === kpiKey) {
      setActiveKpi(null);
      setSelectedGradeTier(null);
      return;
    }
    setActiveKpi(kpiKey);
    if (kpiKey === 'avg_final_score') {
      setLongitudinalMetric('Final Grade');
      setSelectedGradeTier(null);
    } else if (kpiKey === 'completion_rate') {
      setLongitudinalMetric('Completion Rate');
      setSelectedGradeTier(null);
    } else if (kpiKey === 'attendance_rate') {
      setLongitudinalMetric('Attendance');
      setSelectedGradeTier(null);
    } else if (kpiKey === 'focus_engagement') {
      setLongitudinalMetric('Focus Score');
      setSelectedGradeTier(null);
    } else if (kpiKey === 'at_risk_students') {
      // Highlight lower tiers in heatmap
      setSelectedGradeTier('< 40%');
    }
  };

  // Prepare dynamic longitudinal data based on metric selection
  const formattedLongitudinal = useMemo(() => {
    return data.longitudinal_performance.map((d) => {
      let actual: number | null = d.class_avg;
      let forecast: number | null | undefined = d.forecast_avg;
      let ciLower = d.ci_lower;
      let ciUpper = d.ci_upper;

      if (longitudinalMetric === 'Completion Rate') {
        actual = d.completion_avg !== undefined ? d.completion_avg : (d.class_avg ? Math.min(100, d.class_avg + 8) : null);
        forecast = d.completion_forecast !== undefined ? d.completion_forecast : (d.forecast_avg ? Math.min(100, d.forecast_avg + 8) : null);
        ciLower = d.completion_ci_lower !== undefined ? d.completion_ci_lower : ciLower + 8;
        ciUpper = d.completion_ci_upper !== undefined ? d.completion_ci_upper : Math.min(100, ciUpper + 8);
      } else if (longitudinalMetric === 'Attendance') {
        actual = d.attendance_avg !== undefined ? d.attendance_avg : (d.class_avg ? Math.min(100, d.class_avg + 12) : null);
        forecast = d.attendance_forecast !== undefined ? d.attendance_forecast : (d.forecast_avg ? Math.min(100, d.forecast_avg + 12) : null);
        ciLower = d.attendance_ci_lower !== undefined ? d.attendance_ci_lower : ciLower + 12;
        ciUpper = d.attendance_ci_upper !== undefined ? d.attendance_ci_upper : Math.min(100, ciUpper + 12);
      } else if (longitudinalMetric === 'Focus Score') {
        actual = d.focus_avg !== undefined ? d.focus_avg : (d.class_avg ? Math.max(0, d.class_avg - 4) : null);
        forecast = d.focus_forecast !== undefined ? d.focus_forecast : (d.forecast_avg ? Math.max(0, d.forecast_avg - 4) : null);
        ciLower = d.focus_ci_lower !== undefined ? d.focus_ci_lower : Math.max(0, ciLower - 4);
        ciUpper = d.focus_ci_upper !== undefined ? d.focus_ci_upper : ciUpper - 4;
      }

      return {
        ...d,
        metric_actual: actual,
        metric_forecast: forecast,
        metric_ci_lower: ciLower,
        metric_ci_upper: ciUpper,
      };
    });
  }, [data.longitudinal_performance, longitudinalMetric]);

  // Handle Metric Trends Preset selection
  const handlePresetChange = (preset: 'all' | 'grade_completion' | 'att_focus' | 'grade_only') => {
    setMetricFilterPreset(preset);
    if (preset === 'all') {
      setShowFinalGrade(true);
      setShowCompletionRate(true);
      setShowAttendance(true);
      setShowFocusScore(true);
    } else if (preset === 'grade_completion') {
      setShowFinalGrade(true);
      setShowCompletionRate(true);
      setShowAttendance(false);
      setShowFocusScore(false);
    } else if (preset === 'att_focus') {
      setShowFinalGrade(false);
      setShowCompletionRate(false);
      setShowAttendance(true);
      setShowFocusScore(true);
    } else if (preset === 'grade_only') {
      setShowFinalGrade(true);
      setShowCompletionRate(false);
      setShowAttendance(false);
      setShowFocusScore(false);
    }
  };

  // Experiment performance formatted with chosen metric
  const formattedExpTrend = useMemo(() => {
    return data.experiment_performance_trend.map((d) => {
      let val = d.experiment_avg;
      if (expMetric === 'Auto Grade') {
        val = d.auto_grade !== undefined ? d.auto_grade : Math.min(100, d.experiment_avg + 4);
      } else if (expMetric === 'Manual Grade') {
        val = d.manual_grade !== undefined ? d.manual_grade : Math.max(0, d.experiment_avg - 4);
      }
      return {
        ...d,
        val,
      };
    });
  }, [data.experiment_performance_trend, expMetric]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', minWidth: 0 }}>
      {/* ────────────────────────────────────────────────────────────────────────
          ROW 1: 5 TOP KPI CARDS (Interactive & Compact Layout)
         ──────────────────────────────────────────────────────────────────────── */}
      <div className={styles.kpiFiveGrid}>
        {/* KPI 1: Average Final Score */}
        <div
          className={`${styles.kpiCardTrend} ${activeKpi === 'avg_final_score' ? styles.kpiCardTrendActive : ''}`}
          onClick={() => handleKpiClick('avg_final_score')}
          title="Click to focus Longitudinal Chart on Final Grade"
        >
          <div className={styles.kpiTrendTopRow}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: '#f5f3ff',
                color: '#8b5cf6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <TrendingUp size={14} />
            </div>
            <span className={styles.kpiTrendLabel}>Average Final Score</span>
          </div>

          <div className={styles.kpiTrendMidRow}>
            <span className={styles.kpiTrendNumber}>{data.kpis.avg_final_score.value}</span>
            <span className={styles.kpiDeltaPillGreen}>{data.kpis.avg_final_score.delta}</span>
          </div>

          <div className={styles.kpiTrendBottomRow}>
            <span className={styles.kpiTrendSubtext}>{data.kpis.avg_final_score.subtext}</span>
            <div style={{ width: 68, height: 22, flexShrink: 0 }}>
              <MiniSparkline points={data.kpis.avg_final_score.sparkline} color="#8b5cf6" />
            </div>
          </div>
        </div>

        {/* KPI 2: Completion Rate */}
        <div
          className={`${styles.kpiCardTrend} ${activeKpi === 'completion_rate' ? styles.kpiCardTrendActive : ''}`}
          onClick={() => handleKpiClick('completion_rate')}
          title="Click to focus Longitudinal Chart on Completion Rate"
        >
          <div className={styles.kpiTrendTopRow}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: '#ecfdf5',
                color: '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <CheckCircle2 size={14} />
            </div>
            <span className={styles.kpiTrendLabel}>Completion Rate</span>
          </div>

          <div className={styles.kpiTrendMidRow}>
            <span className={styles.kpiTrendNumber}>{data.kpis.completion_rate.value}</span>
            <span className={styles.kpiDeltaPillGreen}>{data.kpis.completion_rate.delta}</span>
          </div>

          <div className={styles.kpiTrendBottomRow}>
            <span className={styles.kpiTrendSubtext}>{data.kpis.completion_rate.subtext}</span>
            <div style={{ width: 68, height: 22, flexShrink: 0 }}>
              <MiniSparkline points={data.kpis.completion_rate.sparkline} color="#10b981" />
            </div>
          </div>
        </div>

        {/* KPI 3: Attendance Rate */}
        <div
          className={`${styles.kpiCardTrend} ${activeKpi === 'attendance_rate' ? styles.kpiCardTrendActive : ''}`}
          onClick={() => handleKpiClick('attendance_rate')}
          title="Click to focus Longitudinal Chart on Attendance"
        >
          <div className={styles.kpiTrendTopRow}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: '#f0f9ff',
                color: '#0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Calendar size={14} />
            </div>
            <span className={styles.kpiTrendLabel}>Attendance Rate</span>
          </div>

          <div className={styles.kpiTrendMidRow}>
            <span className={styles.kpiTrendNumber}>{data.kpis.attendance_rate.value}</span>
            <span className={styles.kpiDeltaPillGreen}>{data.kpis.attendance_rate.delta}</span>
          </div>

          <div className={styles.kpiTrendBottomRow}>
            <span className={styles.kpiTrendSubtext}>{data.kpis.attendance_rate.subtext}</span>
            <div style={{ width: 68, height: 22, flexShrink: 0 }}>
              <MiniSparkline points={data.kpis.attendance_rate.sparkline} color="#0284c7" />
            </div>
          </div>
        </div>

        {/* KPI 4: Focus Engagement */}
        <div
          className={`${styles.kpiCardTrend} ${activeKpi === 'focus_engagement' ? styles.kpiCardTrendActive : ''}`}
          onClick={() => handleKpiClick('focus_engagement')}
          title="Click to focus Longitudinal Chart on Focus Score"
        >
          <div className={styles.kpiTrendTopRow}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: '#fffbeb',
                color: '#f59e0b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Zap size={14} />
            </div>
            <span className={styles.kpiTrendLabel}>Focus Engagement</span>
          </div>

          <div className={styles.kpiTrendMidRow}>
            <span className={styles.kpiTrendNumber}>{data.kpis.focus_engagement.value}</span>
            <span className={styles.kpiDeltaPillGreen}>{data.kpis.focus_engagement.delta}</span>
          </div>

          <div className={styles.kpiTrendBottomRow}>
            <span className={styles.kpiTrendSubtext}>{data.kpis.focus_engagement.subtext}</span>
            <div style={{ width: 68, height: 22, flexShrink: 0 }}>
              <MiniSparkline points={data.kpis.focus_engagement.sparkline} color="#f59e0b" />
            </div>
          </div>
        </div>

        {/* KPI 5: At-Risk Students */}
        <div
          className={`${styles.kpiCardTrend} ${activeKpi === 'at_risk_students' ? styles.kpiCardTrendActive : ''}`}
          onClick={() => handleKpiClick('at_risk_students')}
          title="Click to highlight at-risk students in Heatmap"
        >
          <div className={styles.kpiTrendTopRow}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: '#fef2f2',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={14} />
            </div>
            <span className={styles.kpiTrendLabel}>At-Risk Students</span>
          </div>

          <div className={styles.kpiTrendMidRow}>
            <span className={styles.kpiTrendNumber}>{data.kpis.at_risk_students.value}</span>
            <span className={styles.kpiDeltaPillRose}>{data.kpis.at_risk_students.delta}</span>
          </div>

          <div className={styles.kpiTrendBottomRow}>
            <span className={styles.kpiTrendSubtext}>{data.kpis.at_risk_students.subtext}</span>
            <div style={{ width: 68, height: 22, flexShrink: 0 }}>
              <MiniSparkline points={data.kpis.at_risk_students.sparkline} color="#ef4444" />
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────
          ROW 2: MIDDLE SECTION (Longitudinal Forecast Chart + Key Trends & Insights)
         ──────────────────────────────────────────────────────────────────────── */}
      <div className={styles.trendsMiddleGrid}>
        {/* Left Card: Class Longitudinal Performance */}
        <div className={styles.panelCard}>
          <div className={styles.expCardHeader}>
            <div className={styles.expHeaderLeft}>
              <div className={styles.cardIconBox} style={{ background: '#f5f3ff', color: '#8b5cf6' }}>
                <TrendingUp size={18} />
              </div>
              <div className={styles.expHeaderTitles}>
                <span className={styles.expHeaderTitle}>Class Longitudinal Performance</span>
                <span className={styles.expHeaderSubtitle}>
                  Average {longitudinalMetric.toLowerCase()} with forecast and 95% confidence interval
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <select
                className={styles.metricSelector}
                value={longitudinalMetric}
                onChange={(e) => setLongitudinalMetric(e.target.value as any)}
              >
                <option value="Final Grade">Final Grade</option>
                <option value="Completion Rate">Completion Rate</option>
                <option value="Attendance">Attendance</option>
                <option value="Focus Score">Focus Score</option>
              </select>
              <button
                type="button"
                className={styles.actionBtnMore}
                title="View detailed predictive analysis"
                onClick={() => setShowDetailedModal(true)}
              >
                <MoreVertical size={16} />
              </button>
            </div>
          </div>

          {/* Longitudinal Chart with Forecast Ribbon */}
          <div style={{ width: '100%', height: 235, marginTop: 4, position: 'relative' }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={formattedLongitudinal} margin={{ top: 15, right: 15, left: -22, bottom: 10 }}>
                <defs>
                  <linearGradient id="ciGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10.5, fill: '#64748b' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  unit="%"
                  tick={{ fontSize: 10.5, fill: '#64748b' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <RechartsTooltip content={<CustomLongitudinalTooltip metricName={longitudinalMetric} />} />

                {/* 95% Confidence Interval Shaded Ribbon */}
                {showLongitudinalCi && (
                  <Area
                    type="monotone"
                    dataKey="metric_ci_upper"
                    stroke="none"
                    fill="url(#ciGradient)"
                    isAnimationActive={true}
                  />
                )}

                {/* Forecast Vertical Reference Divider Line */}
                <ReferenceLine
                  x="May 25"
                  stroke="#cbd5e1"
                  strokeDasharray="3 3"
                  label={{
                    value: 'Forecast →',
                    position: 'top',
                    fill: '#64748b',
                    fontSize: 10.5,
                    fontWeight: 600,
                  }}
                />

                {/* Actual Historical Class Average Line with Dots */}
                {showLongitudinalActual && (
                  <Line
                    type="monotone"
                    dataKey="metric_actual"
                    stroke="#7c3aed"
                    strokeWidth={2.4}
                    dot={{ r: 4, fill: '#7c3aed', stroke: '#ffffff', strokeWidth: 1.5 }}
                    activeDot={{ r: 6, fill: '#7c3aed', stroke: '#ffffff', strokeWidth: 2 }}
                    connectNulls={false}
                  />
                )}

                {/* Future Forecasted Trend Line (Dashed) */}
                {showLongitudinalForecast && (
                  <Line
                    type="monotone"
                    dataKey="metric_forecast"
                    stroke="#7c3aed"
                    strokeWidth={2.2}
                    strokeDasharray="4 4"
                    dot={{ r: 3.5, fill: '#7c3aed' }}
                    connectNulls={true}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Interactive Chart Legend */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
              fontSize: '0.725rem',
              color: '#475569',
              marginTop: 4,
            }}
          >
            <div
              className={`${styles.legendPillBtn} ${!showLongitudinalActual ? styles.legendPillBtnDisabled : ''}`}
              onClick={() => setShowLongitudinalActual(!showLongitudinalActual)}
              title="Click to toggle Class Average line"
            >
              <span style={{ display: 'inline-block', width: 12, height: 2.5, background: '#7c3aed', borderRadius: 2 }} />
              <span>Class Average</span>
            </div>
            <div
              className={`${styles.legendPillBtn} ${!showLongitudinalForecast ? styles.legendPillBtnDisabled : ''}`}
              onClick={() => setShowLongitudinalForecast(!showLongitudinalForecast)}
              title="Click to toggle Forecast line"
            >
              <span style={{ display: 'inline-block', width: 12, height: 2, borderTop: '2px dashed #7c3aed' }} />
              <span>Forecasted Trend</span>
            </div>
            <div
              className={`${styles.legendPillBtn} ${!showLongitudinalCi ? styles.legendPillBtnDisabled : ''}`}
              onClick={() => setShowLongitudinalCi(!showLongitudinalCi)}
              title="Click to toggle 95% Confidence Interval band"
            >
              <span style={{ display: 'inline-block', width: 10, height: 8, background: '#ede9fe', borderRadius: 2 }} />
              <span>95% Confidence Interval</span>
            </div>
          </div>
        </div>

        {/* Right Card: Key Trends & Insights */}
        <div className={styles.panelCard}>
          <div className={styles.expCardHeader}>
            <div className={styles.expHeaderLeft}>
              <div className={styles.cardIconBox} style={{ background: '#f5f3ff', color: '#8b5cf6' }}>
                <Sparkles size={18} />
              </div>
              <div className={styles.expHeaderTitles}>
                <span className={styles.expHeaderTitle}>Key Trends & Insights</span>
                <span className={styles.expHeaderSubtitle}>Automated algorithmic pattern detection</span>
              </div>
            </div>

            <button
              type="button"
              className={styles.viewAllLink}
              style={{ fontSize: '0.75rem' }}
              onClick={() => setShowDetailedModal(true)}
            >
              View Detailed Analysis →
            </button>
          </div>

          <div className={styles.insightsList}>
            {data.insights.map((item) => {
              const bg =
                item.color === '#10b981'
                  ? '#ecfdf5'
                  : item.color === '#f59e0b'
                  ? '#fffbeb'
                  : item.color === '#0284c7'
                  ? '#f0f9ff'
                  : '#f5f3ff';
              return (
                <div
                  key={item.id}
                  className={styles.insightItemRow}
                  onClick={() => setShowDetailedModal(true)}
                  style={{ cursor: 'pointer' }}
                  title="Click to view detailed analysis"
                >
                  <div className={styles.insightIconCircle} style={{ background: bg, color: item.color }}>
                    {item.icon === 'trending-up' && <TrendingUp size={15} />}
                    {item.icon === 'check-circle-2' && <CheckCircle2 size={15} />}
                    {item.icon === 'clock' && <Clock size={15} />}
                    {item.icon === 'info' && <Info size={15} />}
                    {item.icon === 'lightbulb' && <Lightbulb size={15} />}
                  </div>
                  <div className={styles.insightContent}>
                    <div className={styles.insightTitle}>{item.title}</div>
                    <div className={styles.insightText}>{item.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────
          ROW 3: BOTTOM 3-CARD GRID (Metric Trends, Exp Performance, Heatmap)
         ──────────────────────────────────────────────────────────────────────── */}
      <div className={styles.trendsBottomGrid}>
        {/* Card 1: Metric Trends Over Time */}
        <div className={styles.panelCard}>
          <div className={styles.expCardHeader}>
            <div className={styles.expHeaderTitles}>
              <span className={styles.expHeaderTitle}>Metric Trends Over Time</span>
              <span className={styles.expHeaderSubtitle}>Compare multiple metrics across the window</span>
            </div>

            <select
              className={styles.metricSelector}
              value={metricFilterPreset}
              onChange={(e) => handlePresetChange(e.target.value as any)}
            >
              <option value="all">4 Metrics Selected</option>
              <option value="grade_completion">Final Grade & Completion</option>
              <option value="att_focus">Attendance & Focus</option>
              <option value="grade_only">Final Grade Only</option>
            </select>
          </div>

          <div style={{ width: '100%', height: 180, marginTop: 4 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.metric_trends_over_time} margin={{ top: 12, right: 10, left: -26, bottom: 6 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  unit="%"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <RechartsTooltip content={<CustomMetricTrendsTooltip />} />

                {/* Final Grade (Purple) */}
                {showFinalGrade && (
                  <Line
                    type="monotone"
                    dataKey="final_grade"
                    name="Final Grade"
                    stroke="#8b5cf6"
                    strokeWidth={2.2}
                    dot={{ r: 2.8, fill: '#8b5cf6' }}
                  />
                )}

                {/* Completion Rate (Green) */}
                {showCompletionRate && (
                  <Line
                    type="monotone"
                    dataKey="completion_rate"
                    name="Completion Rate"
                    stroke="#10b981"
                    strokeWidth={2.2}
                    dot={{ r: 2.8, fill: '#10b981' }}
                  />
                )}

                {/* Attendance (Blue) */}
                {showAttendance && (
                  <Line
                    type="monotone"
                    dataKey="attendance"
                    name="Attendance"
                    stroke="#0284c7"
                    strokeWidth={2.2}
                    dot={{ r: 2.8, fill: '#0284c7' }}
                  />
                )}

                {/* Focus Score (Amber) */}
                {showFocusScore && (
                  <Line
                    type="monotone"
                    dataKey="focus_score"
                    name="Focus Score"
                    stroke="#f59e0b"
                    strokeWidth={2.2}
                    dot={{ r: 2.8, fill: '#f59e0b' }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Clickable Legend Pills */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              fontSize: '0.7rem',
              color: '#475569',
              marginTop: 6,
              flexWrap: 'wrap',
            }}
          >
            <div
              className={`${styles.legendPillBtn} ${!showFinalGrade ? styles.legendPillBtnDisabled : ''}`}
              onClick={() => setShowFinalGrade(!showFinalGrade)}
              title="Click to toggle Final Grade line"
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#8b5cf6' }} />
              <span>Final Grade</span>
            </div>
            <div
              className={`${styles.legendPillBtn} ${!showCompletionRate ? styles.legendPillBtnDisabled : ''}`}
              onClick={() => setShowCompletionRate(!showCompletionRate)}
              title="Click to toggle Completion Rate line"
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981' }} />
              <span>Completion Rate</span>
            </div>
            <div
              className={`${styles.legendPillBtn} ${!showAttendance ? styles.legendPillBtnDisabled : ''}`}
              onClick={() => setShowAttendance(!showAttendance)}
              title="Click to toggle Attendance line"
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#0284c7' }} />
              <span>Attendance</span>
            </div>
            <div
              className={`${styles.legendPillBtn} ${!showFocusScore ? styles.legendPillBtnDisabled : ''}`}
              onClick={() => setShowFocusScore(!showFocusScore)}
              title="Click to toggle Focus Score line"
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b' }} />
              <span>Focus Score</span>
            </div>
          </div>
        </div>

        {/* Card 2: Experiment-wise Performance Trend */}
        <div className={styles.panelCard}>
          <div className={styles.expCardHeader}>
            <div className={styles.expHeaderTitles}>
              <span className={styles.expHeaderTitle}>Experiment-wise Performance Trend</span>
              <span className={styles.expHeaderSubtitle}>Average {expMetric.toLowerCase()} across experiments</span>
            </div>

            <select
              className={styles.metricSelector}
              value={expMetric}
              onChange={(e) => setExpMetric(e.target.value as any)}
            >
              <option value="Final Grade">Final Grade</option>
              <option value="Auto Grade">Auto Grade</option>
              <option value="Manual Grade">Manual Grade</option>
            </select>
          </div>

          <div style={{ width: '100%', height: 180, marginTop: 4 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={formattedExpTrend}
                margin={{ top: 12, right: 10, left: -26, bottom: 6 }}
                onClick={(e: any) => {
                  if (e && e.activePayload && e.activePayload.length) {
                    const item = e.activePayload[0].payload;
                    if (item && item.experiment_id && onSelectExperiment) {
                      onSelectExperiment(item.experiment_id);
                    }
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  unit="%"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <RechartsTooltip content={<CustomExpTrendTooltip metricLabel={expMetric} />} />

                {/* Lavender Bars: Experiment Average */}
                {showExpBars && (
                  <Bar
                    dataKey="val"
                    fill="#ddd6fe"
                    radius={[4, 4, 0, 0]}
                    barSize={18}
                    cursor="pointer"
                  />
                )}

                {/* Purple Line Overlay: Overall Trend */}
                {showExpTrend && (
                  <Line
                    type="monotone"
                    dataKey="overall_trend"
                    stroke="#7c3aed"
                    strokeWidth={2.4}
                    dot={{ r: 3.2, fill: '#7c3aed', stroke: '#ffffff', strokeWidth: 1.5 }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Interactive Legend */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              fontSize: '0.7rem',
              color: '#475569',
              marginTop: 6,
            }}
          >
            <div
              className={`${styles.legendPillBtn} ${!showExpBars ? styles.legendPillBtnDisabled : ''}`}
              onClick={() => setShowExpBars(!showExpBars)}
              title="Click to toggle bars"
            >
              <span style={{ width: 9, height: 9, background: '#ddd6fe', borderRadius: 2 }} />
              <span>Experiment Average</span>
            </div>
            <div
              className={`${styles.legendPillBtn} ${!showExpTrend ? styles.legendPillBtnDisabled : ''}`}
              onClick={() => setShowExpTrend(!showExpTrend)}
              title="Click to toggle overall trend line"
            >
              <span style={{ width: 11, height: 2.5, background: '#7c3aed', borderRadius: 2 }} />
              <span>Overall Trend</span>
            </div>
          </div>
        </div>

        {/* Card 3: Students Performance Heatmap */}
        <div className={styles.panelCard}>
          <div className={styles.expCardHeader}>
            <div className={styles.expHeaderTitles}>
              <span className={styles.expHeaderTitle}>Students Performance Heatmap</span>
              <span className={styles.expHeaderSubtitle}>Individual performance across experiments</span>
            </div>

            <select
              className={styles.metricSelector}
              value={heatmapMetric}
              onChange={(e) => setHeatmapMetric(e.target.value as any)}
            >
              <option value="Final Grade">Final Grade</option>
              <option value="Attempts">Attempts</option>
            </select>
          </div>

          {/* Interactive Heatmap Matrix */}
          <div className={styles.heatmapContainer}>
            {/* Header row: Exp 1 .. Exp 8 */}
            <div className={styles.heatmapHeaderRow}>
              <span style={{ fontSize: '0.675rem', fontWeight: 600, color: '#94a3b8' }}>Student</span>
              {Array.from({ length: 8 }, (_, i) => (
                <span
                  key={i}
                  className={styles.heatmapColHeader}
                  title={`Experiment ${i + 1}`}
                  onClick={() => {
                    const expId = data.experiment_performance_trend[i]?.experiment_id;
                    if (expId && onSelectExperiment) onSelectExperiment(expId);
                  }}
                >
                  Exp {i + 1}
                </span>
              ))}
            </div>

            {/* Student rows */}
            {data.students_heatmap.map((st) => (
              <div key={st.student_id} className={styles.heatmapStudentRow}>
                <span
                  className={styles.heatmapStudentLabel}
                  title={`View ${st.full_name || st.student_alias} (${st.roll_number})`}
                  onClick={() => onSelectStudent && onSelectStudent(st.student_id)}
                >
                  {st.full_name || st.student_alias}
                </span>

                {st.experiments.map((cell) => {
                  // Determine cell color and label based on heatmapMetric
                  let cellBg = cell.color_code;
                  let cellLabel = cell.status_label;
                  if (heatmapMetric === 'Attempts') {
                    const att = cell.attempts || 0;
                    if (att === 0 || cell.score === null) {
                      cellBg = '#cbd5e1';
                      cellLabel = 'Not attempted (0 attempts)';
                    } else if (att === 1) cellBg = '#34d399';
                    else if (att === 2) cellBg = '#60a5fa';
                    else if (att === 3) cellBg = '#fbbf24';
                    else cellBg = '#f87171';
                    if (att > 0 && cell.score !== null) {
                      cellLabel = `${att} attempt${att > 1 ? 's' : ''}`;
                    }
                  } else {
                    if (cell.score === null) {
                      cellBg = '#cbd5e1';
                      cellLabel = 'Not Attempted';
                    }
                  }

                  // Check if cell is dimmed by tier filter
                  const isDimmed = selectedGradeTier !== null && cell.status_label !== selectedGradeTier;
                  const isHighlighted = selectedGradeTier !== null && cell.status_label === selectedGradeTier;

                  return (
                    <div
                      key={cell.exp_num}
                      className={`${styles.heatmapCell} ${isDimmed ? styles.heatmapCellDimmed : ''} ${
                        isHighlighted ? styles.heatmapCellHighlighted : ''
                      }`}
                      style={{ background: cellBg }}
                      onClick={() => {
                        if (onSelectStudent) onSelectStudent(st.student_id);
                        const expId = data.experiment_performance_trend[cell.exp_num - 1]?.experiment_id;
                        if (expId && onSelectExperiment) onSelectExperiment(expId);
                      }}
                      onMouseEnter={(e) => {
                        const rect = (e.target as HTMLElement).getBoundingClientRect();
                        setHoveredCell({
                          student: st.full_name || st.student_alias,
                          roll: st.roll_number,
                          exp: `Exp ${cell.exp_num}: ${cell.exp_title}`,
                          score: cell.score,
                          attempts: cell.attempts || 0,
                          status: cellLabel,
                          x: rect.left + rect.width / 2,
                          y: rect.top - 8,
                        });
                      }}
                      onMouseLeave={() => setHoveredCell(null)}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {/* Interactive Legend with Filter Toggle */}
          <div className={styles.heatmapLegend}>
            {heatmapMetric === 'Final Grade' ? (
              <>
                {[
                  { label: '≥ 80%', color: '#34d399' },
                  { label: '60 – 79%', color: '#fbbf24' },
                  { label: '40 – 59%', color: '#fb923c' },
                  { label: '< 40%', color: '#f87171' },
                ].map((tier) => (
                  <div
                    key={tier.label}
                    className={`${styles.heatmapLegendItem} ${
                      selectedGradeTier === tier.label ? styles.heatmapLegendItemActive : ''
                    }`}
                    onClick={() =>
                      setSelectedGradeTier(selectedGradeTier === tier.label ? null : tier.label)
                    }
                    title={`Click to ${selectedGradeTier === tier.label ? 'clear' : 'filter'} ${tier.label}`}
                  >
                    <span className={styles.heatmapLegendBox} style={{ background: tier.color }} />
                    <span>{tier.label}</span>
                  </div>
                ))}
                <div
                  className={`${styles.heatmapLegendItem} ${
                    selectedGradeTier === 'Not Attempted' ? styles.heatmapLegendItemActive : ''
                  }`}
                  onClick={() =>
                    setSelectedGradeTier(selectedGradeTier === 'Not Attempted' ? null : 'Not Attempted')
                  }
                  title="Click to filter Not Attempted"
                >
                  <span className={styles.heatmapLegendBox} style={{ background: '#e2e8f0' }} />
                  <span>Not Attempted</span>
                </div>
              </>
            ) : (
              <>
                {[
                  { label: '1 Attempt', color: '#34d399' },
                  { label: '2 Attempts', color: '#60a5fa' },
                  { label: '3 Attempts', color: '#fbbf24' },
                  { label: '4+ Attempts', color: '#f87171' },
                ].map((tier) => (
                  <div key={tier.label} className={styles.heatmapLegendItem}>
                    <span className={styles.heatmapLegendBox} style={{ background: tier.color }} />
                    <span>{tier.label}</span>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Hover Floating Tooltip */}
          {hoveredCell && (
            <div
              style={{
                position: 'fixed',
                top: hoveredCell.y,
                left: hoveredCell.x,
                transform: 'translate(-50%, -100%)',
                background: '#0f172a',
                color: '#ffffff',
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: '0.725rem',
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                pointerEvents: 'none',
                zIndex: 99999,
                whiteSpace: 'nowrap',
              }}
            >
              <div style={{ fontWeight: 700, color: '#c4b5fd', marginBottom: 2 }}>
                {hoveredCell.student} ({hoveredCell.roll})
              </div>
              <div style={{ color: '#cbd5e1' }}>{hoveredCell.exp}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 4 }}>
                <span style={{ color: '#94a3b8' }}>Score:</span>
                <strong style={{ color: '#ffffff' }}>
                  {hoveredCell.score !== null ? `${hoveredCell.score}%` : 'Not Attempted'}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ color: '#94a3b8' }}>Status / Band:</span>
                <strong style={{ color: '#34d399' }}>{hoveredCell.status}</strong>
              </div>
              <div style={{ marginTop: 4, fontSize: '0.65rem', color: '#64748b' }}>
                Click cell to view Student 360 profile
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────
          INTERACTIVE MODAL: Key Trends & Insights Detailed Analysis
         ──────────────────────────────────────────────────────────────────────── */}
      {showDetailedModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(6px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setShowDetailedModal(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 16,
              maxWidth: 620,
              width: '100%',
              padding: '24px 28px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
              border: '1px solid #e2e8f0',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: '#f5f3ff',
                    color: '#7c3aed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Sparkles size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                    Key Trends & Predictive Analysis
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.775rem', color: '#64748b' }}>
                    Algorithmic risk signals and cohort learning trajectory
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDetailedModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: 4,
                  borderRadius: 6,
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {data.insights.map((item) => (
                <div
                  key={item.id}
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    padding: '14px 16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: item.color,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                      }}
                    >
                      {item.icon === 'trending-up' && <TrendingUp size={14} />}
                      {item.icon === 'check-circle-2' && <CheckCircle2 size={14} />}
                      {item.icon === 'clock' && <Clock size={14} />}
                      {item.icon === 'info' && <Info size={14} />}
                      {item.icon === 'lightbulb' && <Lightbulb size={14} />}
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>{item.title}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#475569', lineHeight: 1.45 }}>{item.text}</p>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setShowDetailedModal(false)}
                style={{
                  padding: '8px 18px',
                  background: '#7c3aed',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: '0.825rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Close Analysis
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
