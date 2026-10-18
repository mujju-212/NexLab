'use client';

import React, { useState, useMemo } from 'react';
import {
  Users,
  Clock,
  Target,
  AlertTriangle,
  Zap,
  Search,
  Download,
  Columns,
  MoreVertical,
  TrendingUp,
  Lightbulb,
  CheckCircle2,
  ChevronRight,
  Info,
} from 'lucide-react';
import styles from './engagement-tab.module.css';
import { type EngagementOverviewData } from '@/services/analytics.service';
import { exportCSV } from '@/lib/analytics-utils';

interface EngagementTabProps {
  data: EngagementOverviewData;
  onSelectStudent?: (studentId: string) => void;
  onRefresh?: () => void;
}

// Mini SVG sparkline for KPI cards and table rows
function MiniSparkline({ points, color }: { points: number[]; color: string }) {
  if (!points || points.length === 0) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = 80;
  const height = 26;

  const pts = points.map((p, idx) => {
    const x = (idx / (points.length - 1)) * (width - 8) + 4;
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

// Multi-line SVG chart for Engagement Trend Over Time
function MultiLineTrendChart({
  dates,
  series,
}: {
  dates: string[];
  series: {
    focus_engagement: number[];
    time_on_task: number[];
    active_coding: number[];
    hint_reliance: number[];
  };
}) {
  const width = 500;
  const height = 110;
  const paddingLeft = 32;
  const paddingRight = 16;
  const paddingTop = 12;
  const paddingBottom = 22;

  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;

  const getPoints = (data: number[]) => {
    return data.map((val, idx) => {
      const x = paddingLeft + (idx / (data.length - 1)) * chartW;
      const y = paddingTop + (1 - val / 100) * chartH;
      return `${x},${y}`;
    }).join(' ');
  };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>
      {/* Grid lines */}
      {[0, 25, 50, 75, 100].map((tick) => {
        const y = paddingTop + (1 - tick / 100) * chartH;
        return (
          <g key={tick}>
            <line
              x1={paddingLeft}
              y1={y}
              x2={width - paddingRight}
              y2={y}
              stroke="#f1f5f9"
              strokeWidth="1"
            />
            <text
              x={paddingLeft - 6}
              y={y + 3}
              textAnchor="end"
              fontSize="9"
              fill="#94a3b8"
              fontWeight="500"
            >
              {tick}%
            </text>
          </g>
        );
      })}

      {/* Date ticks on X axis */}
      {dates.map((d, idx) => {
        const x = paddingLeft + (idx / (dates.length - 1)) * chartW;
        return (
          <text
            key={idx}
            x={x}
            y={height - 4}
            textAnchor="middle"
            fontSize="9"
            fill="#94a3b8"
            fontWeight="500"
          >
            {d}
          </text>
        );
      })}

      {/* Hint Reliance line (red) */}
      <polyline
        fill="none"
        stroke="#ef4444"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={getPoints(series.hint_reliance)}
      />

      {/* Active Coding line (orange) */}
      <polyline
        fill="none"
        stroke="#f59e0b"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={getPoints(series.active_coding)}
      />

      {/* Time on Task line (blue) */}
      <polyline
        fill="none"
        stroke="#0284c7"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={getPoints(series.time_on_task)}
      />

      {/* Focus Engagement line (purple) */}
      <polyline
        fill="none"
        stroke="#7c3aed"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={getPoints(series.focus_engagement)}
      />
    </svg>
  );
}

// SVG Donut Chart
function DonutChart({
  total,
  segments,
}: {
  total: number;
  segments: Array<{ label: string; count: number; percentage: number; color: string }>;
}) {
  const size = 110;
  const strokeWidth = 18;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let currentOffset = 0;

  return (
    <div className={styles.donutWrapper}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#f1f5f9"
          strokeWidth={strokeWidth}
        />
        {segments.map((seg, idx) => {
          const strokeDasharray = `${(seg.percentage / 100) * circumference} ${circumference}`;
          const strokeDashoffset = -currentOffset;
          currentOffset += (seg.percentage / 100) * circumference;

          return (
            <circle
              key={idx}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
        })}
      </svg>
      <div className={styles.donutCenter}>
        <span className={styles.donutCenterCount}>{total}</span>
        <span className={styles.donutCenterLabel}>students</span>
      </div>
    </div>
  );
}

export function EngagementTab({ data, onSelectStudent }: EngagementTabProps) {
  // Local state
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [sortField, setSortField] = useState<string>('engagement_score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedQuadrant, setSelectedQuadrant] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedStudentTooltip, setSelectedStudentTooltip] = useState<{
    id?: string;
    name: string;
    roll: string;
    effort: number;
    outcome: number;
    quadrant: string;
    x: number;
    y: number;
  } | null>(null);

  // Filter and sort students (Interactive cross-filtering by quadrant or selected student)
  const filteredStudents = useMemo(() => {
    let list = [...data.student_details];
    if (selectedQuadrant) {
      list = list.filter((s) => s.status.toLowerCase() === selectedQuadrant.toLowerCase());
    }
    if (selectedStudentId) {
      list = list.filter((s) => s.id === selectedStudentId);
    }
    if (studentSearch.trim()) {
      const q = studentSearch.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.roll_number.toLowerCase().includes(q) ||
          s.status.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      let aVal = (a as any)[sortField];
      let bVal = (b as any)[sortField];
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [data.student_details, studentSearch, sortField, sortOrder, selectedQuadrant, selectedStudentId]);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // CSV export handler
  const handleExportCSV = () => {
    const csvRows = filteredStudents.map((s) => ({
      'Student Name': s.name,
      'Roll Number': s.roll_number,
      'Status': s.status,
      'Engagement Score': s.engagement_score,
      'Time on Task': s.time_on_task,
      'Focus %': s.focus_pct,
      'Hint Reliance': s.hint_reliance,
      'Tab Switches': s.tab_switches,
      'Suggested Action': s.suggested_action,
    }));
    exportCSV(csvRows, `student_engagement_details_${new Date().toISOString().split('T')[0]}`);
  };

  const getStatusClass = (status: string) => {
    switch (status.toLowerCase()) {
      case 'thriving':
        return styles.statusThriving;
      case 'coasting':
        return styles.statusCoasting;
      case 'struggling':
        return styles.statusStruggling;
      case 'disengaged':
        return styles.statusDisengaged;
      default:
        return '';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#3b82f6';
    if (score >= 40) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <div className={styles.container}>
      {/* ──────────────────────────────────────────────────────────────────────────
          1. TOP 5 KPI SUMMARY CARDS
         ────────────────────────────────────────────────────────────────────────── */}
      <div className={styles.kpiGrid}>
        {/* Card 1: Active Students */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div className={styles.kpiIconWrapper} style={{ background: '#f3e8ff', color: '#7c3aed' }}>
                <Users size={20} />
              </div>
              <span className={styles.kpiTitle}>Active Students</span>
            </div>
            <span className={`${styles.kpiBadge} ${styles.kpiBadgeGreen}`}>
              {data.kpis.active_students.delta}
            </span>
          </div>
          <div className={styles.kpiBody}>
            <div>
              <div className={styles.kpiValue}>{data.kpis.active_students.value}</div>
              <div className={styles.kpiLabel}>{data.kpis.active_students.label}</div>
            </div>
            <div className={styles.kpiSparkline}>
              <MiniSparkline points={data.kpis.active_students.sparkline} color="#7c3aed" />
            </div>
          </div>
        </div>

        {/* Card 2: Avg. Time on Task */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div className={styles.kpiIconWrapper} style={{ background: '#e0f2fe', color: '#0284c7' }}>
                <Clock size={20} />
              </div>
              <span className={styles.kpiTitle}>Avg. Time on Task</span>
            </div>
            <span className={`${styles.kpiBadge} ${styles.kpiBadgeGreen}`}>
              {data.kpis.avg_time_on_task.delta}
            </span>
          </div>
          <div className={styles.kpiBody}>
            <div>
              <div className={styles.kpiValue}>{data.kpis.avg_time_on_task.value}</div>
              <div className={styles.kpiLabel}>{data.kpis.avg_time_on_task.label}</div>
            </div>
            <div className={styles.kpiSparkline}>
              <MiniSparkline points={data.kpis.avg_time_on_task.sparkline} color="#0284c7" />
            </div>
          </div>
        </div>

        {/* Card 3: Focus Engagement */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div className={styles.kpiIconWrapper} style={{ background: '#fdf2f8', color: '#db2777' }}>
                <Target size={20} />
              </div>
              <span className={styles.kpiTitle}>Focus Engagement</span>
            </div>
            <span className={`${styles.kpiBadge} ${styles.kpiBadgeGreen}`}>
              {data.kpis.focus_engagement.delta}
            </span>
          </div>
          <div className={styles.kpiBody}>
            <div>
              <div className={styles.kpiValue}>{data.kpis.focus_engagement.value}</div>
              <div className={styles.kpiLabel}>{data.kpis.focus_engagement.label}</div>
            </div>
            <div className={styles.kpiSparkline}>
              <MiniSparkline points={data.kpis.focus_engagement.sparkline} color="#db2777" />
            </div>
          </div>
        </div>

        {/* Card 4: High-Distraction Sessions */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div className={styles.kpiIconWrapper} style={{ background: '#fee2e2', color: '#ef4444' }}>
                <AlertTriangle size={20} />
              </div>
              <span className={styles.kpiTitle}>High-Distraction Sessions</span>
            </div>
            <span className={`${styles.kpiBadge} ${styles.kpiBadgeRed}`}>
              {data.kpis.high_distraction_sessions.delta}
            </span>
          </div>
          <div className={styles.kpiBody}>
            <div>
              <div className={styles.kpiValue}>{data.kpis.high_distraction_sessions.value}</div>
              <div className={styles.kpiLabel}>{data.kpis.high_distraction_sessions.label}</div>
            </div>
            <div className={styles.kpiSparkline}>
              <MiniSparkline points={data.kpis.high_distraction_sessions.sparkline} color="#ef4444" />
            </div>
          </div>
        </div>

        {/* Card 5: At-Risk (Low Engagement) */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div className={styles.kpiIconWrapper} style={{ background: '#fee2e2', color: '#ef4444' }}>
                <AlertTriangle size={20} />
              </div>
              <span className={styles.kpiTitle}>At-Risk (Low Engagement)</span>
            </div>
            <span className={`${styles.kpiBadge} ${styles.kpiBadgeRed}`}>
              {data.kpis.at_risk_students.delta}
            </span>
          </div>
          <div className={styles.kpiBody}>
            <div>
              <div className={styles.kpiValue}>{data.kpis.at_risk_students.value}</div>
              <div className={styles.kpiLabel}>{data.kpis.at_risk_students.label}</div>
            </div>
            <div className={styles.kpiSparkline}>
              <MiniSparkline points={data.kpis.at_risk_students.sparkline} color="#ef4444" />
            </div>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          2. MIDDLE ROW: QUADRANT & 3-PANEL STACK
         ────────────────────────────────────────────────────────────────────────── */}
      <div className={styles.middleGrid}>
        {/* Left: Effort vs. Outcome (Engagement Quadrant) */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardHeaderLeft}>
              <div className={styles.cardIconBox}>
                <Users size={18} />
              </div>
              <div>
                <h3 className={styles.cardTitle}>Effort vs. Outcome (Engagement Quadrant)</h3>
                <div className={styles.cardSubtitle}>
                  Cohort median split: identify Thriving, Grinding/Struggling, Coasting, and Disengaged students
                </div>
              </div>
            </div>
          </div>

          <div className={styles.quadrantContainer}>
            <div className={styles.quadrantGrid}>
              {/* Top-Left: Coasting */}
              <div
                className={`${styles.quadrantBox} ${styles.quadrantCoasting}`}
                onClick={() => setSelectedQuadrant(selectedQuadrant === 'coasting' ? null : 'coasting')}
                style={{
                  outline: selectedQuadrant === 'coasting' ? '2px solid #2563eb' : 'none',
                  boxShadow: selectedQuadrant === 'coasting' ? 'inset 0 0 10px rgba(37,99,235,0.1)' : 'none',
                }}
                title="Click to filter table to Coasting students"
              >
                <span className={styles.quadrantTag} style={{ color: '#2563eb' }}>Coasting</span>
                <span className={styles.quadrantSub} style={{ color: '#3b82f6' }}>Low Effort, High Grade</span>
              </div>

              {/* Top-Right: Thriving */}
              <div
                className={`${styles.quadrantBox} ${styles.quadrantThriving}`}
                onClick={() => setSelectedQuadrant(selectedQuadrant === 'thriving' ? null : 'thriving')}
                style={{
                  outline: selectedQuadrant === 'thriving' ? '2px solid #16a34a' : 'none',
                  boxShadow: selectedQuadrant === 'thriving' ? 'inset 0 0 10px rgba(22,163,74,0.1)' : 'none',
                }}
                title="Click to filter table to Thriving students"
              >
                <span className={styles.quadrantTag} style={{ color: '#16a34a' }}>Thriving</span>
                <span className={styles.quadrantSub} style={{ color: '#16a34a' }}>High Effort, High Grade</span>
              </div>

              {/* Bottom-Left: Disengaged */}
              <div
                className={`${styles.quadrantBox} ${styles.quadrantDisengaged}`}
                onClick={() => setSelectedQuadrant(selectedQuadrant === 'disengaged' ? null : 'disengaged')}
                style={{
                  outline: selectedQuadrant === 'disengaged' ? '2px solid #dc2626' : 'none',
                  boxShadow: selectedQuadrant === 'disengaged' ? 'inset 0 0 10px rgba(220,38,38,0.1)' : 'none',
                }}
                title="Click to filter table to Disengaged students"
              >
                <span className={styles.quadrantTag} style={{ color: '#dc2626' }}>Disengaged</span>
                <span className={styles.quadrantSub} style={{ color: '#ef4444' }}>Low Effort, Low Grade</span>
              </div>

              {/* Bottom-Right: Struggling */}
              <div
                className={`${styles.quadrantBox} ${styles.quadrantStruggling}`}
                onClick={() => setSelectedQuadrant(selectedQuadrant === 'struggling' ? null : 'struggling')}
                style={{
                  outline: selectedQuadrant === 'struggling' ? '2px solid #d97706' : 'none',
                  boxShadow: selectedQuadrant === 'struggling' ? 'inset 0 0 10px rgba(217,119,6,0.1)' : 'none',
                }}
                title="Click to filter table to Struggling students"
              >
                <span className={styles.quadrantTag} style={{ color: '#d97706' }}>Struggling</span>
                <span className={styles.quadrantSub} style={{ color: '#d97706' }}>High Effort, Low Grade</span>
              </div>

              {/* Scatter Canvas with student dots */}
              <div className={styles.scatterCanvas}>
                {data.quadrant.students.map((stu) => {
                  const leftPct = Math.max(6, Math.min(94, stu.effort));
                  const topPct = Math.max(8, Math.min(92, 100 - stu.outcome));
                  const isSelected = selectedStudentId === stu.id;

                  return (
                    <div
                      key={stu.id}
                      className={styles.scatterDot}
                      style={{
                        left: `${leftPct}%`,
                        top: `${topPct}%`,
                        background: stu.color,
                        transform: isSelected ? 'translate(-50%, -50%) scale(1.9)' : undefined,
                        boxShadow: isSelected ? '0 0 14px rgba(124, 58, 237, 0.9)' : undefined,
                        border: isSelected ? '2px solid #7c3aed' : undefined,
                        zIndex: isSelected ? 40 : 10,
                      }}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setSelectedStudentTooltip({
                          id: stu.id,
                          name: stu.name,
                          roll: stu.roll_number,
                          effort: stu.effort,
                          outcome: stu.outcome,
                          quadrant: stu.quadrant,
                          x: rect.left + rect.width / 2,
                          y: rect.top,
                        });
                      }}
                      onMouseLeave={() => {
                        if (!selectedStudentId) {
                          setSelectedStudentTooltip(null);
                        }
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const nextId = selectedStudentId === stu.id ? null : stu.id;
                        setSelectedStudentId(nextId);
                        if (onSelectStudent) {
                          onSelectStudent(stu.id);
                        }
                      }}
                      title={`${stu.name} (${stu.roll_number}) — Effort: ${stu.effort}%, Outcome: ${stu.outcome}%`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Axis labels */}
            <div className={styles.axisLabels}>
              <span>Outcome (Final Assessment Grade) →</span>
              <span>Effort (Time on Task, Attempts, Practice) →</span>
            </div>
          </div>

          {/* Quadrant Legend with Click-to-Filter */}
          <div className={styles.quadrantLegend}>
            <div
              className={styles.quadrantLegendItem}
              style={{
                cursor: 'pointer',
                opacity: selectedQuadrant && selectedQuadrant !== 'thriving' ? 0.45 : 1,
                fontWeight: selectedQuadrant === 'thriving' ? 800 : 600,
              }}
              onClick={() => setSelectedQuadrant(selectedQuadrant === 'thriving' ? null : 'thriving')}
              title="Click to toggle filter for Thriving cohort"
            >
              <span className={styles.quadrantLegendDot} style={{ background: '#16a34a' }} />
              <span>Thriving ({data.quadrant.counts.thriving})</span>
            </div>
            <div
              className={styles.quadrantLegendItem}
              style={{
                cursor: 'pointer',
                opacity: selectedQuadrant && selectedQuadrant !== 'struggling' ? 0.45 : 1,
                fontWeight: selectedQuadrant === 'struggling' ? 800 : 600,
              }}
              onClick={() => setSelectedQuadrant(selectedQuadrant === 'struggling' ? null : 'struggling')}
              title="Click to toggle filter for Struggling cohort"
            >
              <span className={styles.quadrantLegendDot} style={{ background: '#f59e0b' }} />
              <span>Struggling ({data.quadrant.counts.struggling})</span>
            </div>
            <div
              className={styles.quadrantLegendItem}
              style={{
                cursor: 'pointer',
                opacity: selectedQuadrant && selectedQuadrant !== 'coasting' ? 0.45 : 1,
                fontWeight: selectedQuadrant === 'coasting' ? 800 : 600,
              }}
              onClick={() => setSelectedQuadrant(selectedQuadrant === 'coasting' ? null : 'coasting')}
              title="Click to toggle filter for Coasting cohort"
            >
              <span className={styles.quadrantLegendDot} style={{ background: '#2563eb' }} />
              <span>Coasting ({data.quadrant.counts.coasting})</span>
            </div>
            <div
              className={styles.quadrantLegendItem}
              style={{
                cursor: 'pointer',
                opacity: selectedQuadrant && selectedQuadrant !== 'disengaged' ? 0.45 : 1,
                fontWeight: selectedQuadrant === 'disengaged' ? 800 : 600,
              }}
              onClick={() => setSelectedQuadrant(selectedQuadrant === 'disengaged' ? null : 'disengaged')}
              title="Click to toggle filter for Disengaged cohort"
            >
              <span className={styles.quadrantLegendDot} style={{ background: '#dc2626' }} />
              <span>Disengaged ({data.quadrant.counts.disengaged})</span>
            </div>
          </div>
        </div>

        {/* Right: Stacked 3 Panels */}
        <div className={styles.rightStack}>
          {/* Panel 1: Engagement Trend Over Time */}
          <div className={styles.subCard}>
            <div className={styles.cardHeader} style={{ marginBottom: 8 }}>
              <div className={styles.cardHeaderLeft}>
                <div className={styles.cardIconBox} style={{ background: '#f3e8ff', color: '#7c3aed' }}>
                  <TrendingUp size={16} />
                </div>
                <div>
                  <h4 className={styles.cardTitle} style={{ fontSize: '0.88rem' }}>Engagement Trend Over Time</h4>
                  <div className={styles.cardSubtitle} style={{ fontSize: '0.72rem' }}>
                    Class median engagement metrics across selected window
                  </div>
                </div>
              </div>
              <select className={styles.selectDropdown} defaultValue="Engagement Metrics">
                <option>Engagement Metrics</option>
                <option>Active Coding Time</option>
                <option>Focus Score</option>
                <option>Hint Reliance</option>
              </select>
            </div>

            <div className={styles.trendChartContainer}>
              <MultiLineTrendChart
                dates={data.trend_over_time.dates}
                series={data.trend_over_time.series}
              />
            </div>

            <div className={styles.trendLegend}>
              <div className={styles.trendLegendItem}>
                <span className={styles.trendLegendDot} style={{ background: '#7c3aed' }} />
                <span>Focus Engagement</span>
              </div>
              <div className={styles.trendLegendItem}>
                <span className={styles.trendLegendDot} style={{ background: '#0284c7' }} />
                <span>Time on Task</span>
              </div>
              <div className={styles.trendLegendItem}>
                <span className={styles.trendLegendDot} style={{ background: '#f59e0b' }} />
                <span>Active Coding</span>
              </div>
              <div className={styles.trendLegendItem}>
                <span className={styles.trendLegendDot} style={{ background: '#ef4444' }} />
                <span>Hint Reliance</span>
              </div>
            </div>
          </div>

          {/* SubGrid: Panel 2 (Donut) & Panel 3 (Key Insights) */}
          <div className={styles.subGrid}>
            {/* Panel 2: Engagement Distribution */}
            <div className={styles.subCard}>
              <div className={styles.cardHeaderLeft} style={{ marginBottom: 6 }}>
                <div className={styles.cardIconBox} style={{ background: '#f3e8ff', color: '#7c3aed', width: 28, height: 28 }}>
                  <Users size={15} />
                </div>
                <div>
                  <h4 className={styles.cardTitle} style={{ fontSize: '0.85rem' }}>Engagement Distribution</h4>
                  <div className={styles.cardSubtitle} style={{ fontSize: '0.7rem' }}>
                    Breakdown of students by predominant pattern
                  </div>
                </div>
              </div>

              <div className={styles.donutRow}>
                <DonutChart
                  total={data.distribution.total}
                  segments={data.distribution.segments}
                />
                <div className={styles.donutLegend}>
                  {data.distribution.segments.map((seg, idx) => (
                    <div key={idx} className={styles.donutLegendRow}>
                      <div className={styles.donutLegendLeft}>
                        <span className={styles.quadrantLegendDot} style={{ background: seg.color }} />
                        <span>{seg.label}</span>
                      </div>
                      <div className={styles.donutLegendRight}>
                        <strong>{seg.count}</strong>
                        <span>{seg.percentage}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Panel 3: Key Insights */}
            <div className={styles.subCard}>
              <div className={styles.cardHeader} style={{ marginBottom: 6 }}>
                <div className={styles.cardHeaderLeft}>
                  <div className={styles.cardIconBox} style={{ background: '#e0f2fe', color: '#0284c7', width: 28, height: 28 }}>
                    <Lightbulb size={15} />
                  </div>
                  <div>
                    <h4 className={styles.cardTitle} style={{ fontSize: '0.85rem' }}>Key Insights</h4>
                  </div>
                </div>
                <span style={{ fontSize: '0.72rem', color: '#7c3aed', fontWeight: 600, cursor: 'pointer' }}>
                  View Full Analysis →
                </span>
              </div>

              <div className={styles.insightsList}>
                {data.key_insights.map((item) => (
                  <div key={item.id} className={styles.insightItem}>
                    <div className={styles.insightIconBox} style={{ color: item.color }}>
                      {item.type === 'positive' && <TrendingUp size={14} />}
                      {item.type === 'info' && <Clock size={14} />}
                      {item.type === 'warning' && <AlertTriangle size={14} />}
                      {item.type === 'danger' && <AlertTriangle size={14} />}
                      {item.type === 'highlight' && <Zap size={14} />}
                    </div>
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          3. BOTTOM TABLE: STUDENT ENGAGEMENT DETAILS
         ────────────────────────────────────────────────────────────────────────── */}
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div>
            <h3 className={styles.cardTitle}>Student Engagement Details</h3>
            <div className={styles.cardSubtitle}>
              Individual engagement metrics with trend indicators and intervention suggestions
            </div>
          </div>

          <div className={styles.tableControls}>
            <div className={styles.searchInputWrapper}>
              <Search size={14} className={styles.searchIcon} />
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Search students..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
              />
            </div>

            <button type="button" onClick={handleExportCSV} className={styles.actionBtn}>
              <Download size={13} />
              CSV
            </button>

            <button type="button" className={styles.actionBtn}>
              <Columns size={13} />
              Columns
            </button>
          </div>
        </div>

        {/* Interactive Active Filter Banner */}
        {(selectedQuadrant || selectedStudentId) && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 16px',
            margin: '0 20px 12px 20px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            fontSize: '0.78rem',
            color: '#334155',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Active Filter:</span>
              {selectedQuadrant && (
                <span style={{
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: '#e0e7ff',
                  color: '#3730a3',
                  fontWeight: 700,
                  textTransform: 'capitalize'
                }}>
                  Quadrant: {selectedQuadrant}
                </span>
              )}
              {selectedStudentId && (
                <span style={{
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: '#f3e8ff',
                  color: '#6b21a8',
                  fontWeight: 700
                }}>
                  Student: {data.student_details.find(s => s.id === selectedStudentId)?.name || selectedStudentId}
                </span>
              )}
              <span style={{ color: '#64748b' }}>({filteredStudents.length} students matching)</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedQuadrant(null);
                setSelectedStudentId(null);
                setSelectedStudentTooltip(null);
              }}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: '#7c3aed',
                fontSize: '0.75rem',
                fontWeight: 700,
                textDecoration: 'underline'
              }}
            >
              Reset Filter
            </button>
          </div>
        )}

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" style={{ cursor: 'pointer' }} />
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('name')}>
                  Student ⇅
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('status')}>
                  Status ⇅
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('engagement_score')}>
                  Engagement Score ⇅
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('time_on_task_min')}>
                  Time on Task ⇅
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('focus_pct_num')}>
                  Focus % ⇅
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('hint_reliance_num')}>
                  Hint Reliance ⇅
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('tab_switches')}>
                  Tab Switches ⇅
                </th>
                <th>Trend</th>
                <th>Suggested Action</th>
                <th style={{ width: 40, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((st) => {
                const isSelected = selectedStudentId === st.id;
                return (
                  <tr
                    key={st.id}
                    style={{
                      background: isSelected ? '#faf5ff' : undefined,
                      outline: isSelected ? '1.5px solid #7c3aed' : undefined,
                    }}
                  >
                    <td>
                      <input type="checkbox" style={{ cursor: 'pointer' }} />
                    </td>

                    <td>
                      <div
                        className={styles.studentCell}
                        style={{ cursor: 'pointer' }}
                        onClick={() => onSelectStudent && onSelectStudent(st.id)}
                        title="Click to view full student telemetry profile"
                      >
                        <div className={styles.avatarCircle} style={{ background: st.avatar_color }}>
                          {st.initials}
                        </div>
                        <div className={styles.studentInfo}>
                          <span className={styles.studentName} style={{ color: isSelected ? '#7c3aed' : undefined }}>
                            {st.name}
                          </span>
                          <span className={styles.studentRoll}>{st.roll_number}</span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className={`${styles.statusBadge} ${getStatusClass(st.status)}`}>
                        {st.status}
                      </span>
                    </td>

                    <td>
                      <div className={styles.scoreCell}>
                        <span className={styles.scoreNumber}>{st.engagement_score}</span>
                        <div className={styles.scoreBarTrack}>
                          <div
                            className={styles.scoreBarFill}
                            style={{
                              width: `${st.engagement_score}%`,
                              background: getScoreColor(st.engagement_score),
                            }}
                          />
                        </div>
                      </div>
                    </td>

                    <td>
                      <div className={styles.timeCell}>
                        <span className={styles.timeText}>{st.time_on_task}</span>
                        <div className={styles.timeBarTrack}>
                          <div
                            className={styles.timeBarFill}
                            style={{
                              width: `${Math.min(100, (st.time_on_task_min / 80) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </td>

                    <td style={{ fontWeight: 600 }}>{st.focus_pct}</td>

                    <td style={{ fontWeight: 600 }}>{st.hint_reliance}</td>

                    <td>
                      <span className={st.is_high_distraction ? styles.tabSwitchHigh : ''}>
                        {st.tab_switches}
                      </span>
                    </td>

                    <td>
                      <MiniSparkline points={st.trend} color={st.trend_color} />
                    </td>

                    <td>
                      <span className={styles.actionPill}>{st.suggested_action}</span>
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className={styles.menuBtn}
                        title="View Telemetry"
                        onClick={() => onSelectStudent && onSelectStudent(st.id)}
                      >
                        <MoreVertical size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Interactive Tooltip for Scatter Plot */}
      {selectedStudentTooltip && (
        <div
          className={styles.tooltip}
          style={{
            left: selectedStudentTooltip.x,
            top: selectedStudentTooltip.y,
            pointerEvents: 'auto',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '0.8rem' }}>{selectedStudentTooltip.name}</div>
          <div style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{selectedStudentTooltip.roll}</div>
          <div style={{ marginTop: 4, display: 'flex', gap: 10 }}>
            <span>Effort: <strong>{selectedStudentTooltip.effort}%</strong></span>
            <span>Outcome: <strong>{selectedStudentTooltip.outcome}%</strong></span>
          </div>
          <div style={{ marginTop: 2, textTransform: 'capitalize', color: '#38bdf8' }}>
            Quadrant: {selectedStudentTooltip.quadrant}
          </div>
          {onSelectStudent && selectedStudentTooltip.id && (
            <div style={{ marginTop: 6, paddingTop: 4, borderTop: '1px solid #334155' }}>
              <button
                type="button"
                onClick={() => onSelectStudent(selectedStudentTooltip.id!)}
                style={{
                  background: '#7c3aed',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 4,
                  padding: '3px 8px',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                View Telemetry Log →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
