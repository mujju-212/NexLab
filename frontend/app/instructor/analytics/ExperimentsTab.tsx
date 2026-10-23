'use client';

import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  CheckCircle2,
  Layers,
  AlertTriangle,
  PieChart as PieIcon,
  Search,
  Download,
  ExternalLink,
  ChevronRight,
  X,
  Code2,
  Bug,
  Sliders,
  Sparkles,
  Info,
  Clock,
  ArrowUpRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  LabelList,
} from 'recharts';
import styles from './instructor-analytics.module.css';
import { type ExperimentsOverviewData } from '@/services/analytics.service';
import { exportCSV } from '@/lib/analytics-utils';

interface ExperimentsTabProps {
  data: ExperimentsOverviewData;
  onSelectExperiment?: (experimentId: string) => void;
  onRefresh?: () => void;
}

// Mini SVG sparkline for KPI cards
function MiniSparkline({ points, color }: { points: number[]; color: string }) {
  // Real series can contain gaps; a single point is not a trend.
  const vals = (points || []).filter((p) => typeof p === 'number' && Number.isFinite(p));
  if (vals.length < 2) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const width = 96;
  const height = 32;

  const pts = vals.map((p, idx) => {
    const x = (idx / (vals.length - 1)) * (width - 12) + 6;
    const y = height - 6 - ((p - min) / range) * (height - 12);
    return `${x},${y}`;
  });

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts.join(' ')}
      />
    </svg>
  );
}

// Custom X Axis Tick with two lines: "Exp 1" and "Python List Comprehensions"
function CustomXAxisTick({ x, y, payload }: any) {
  const parts = (payload.value || '').split('\n');
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={12} textAnchor="middle" fill="#1e293b" fontSize={10.5} fontWeight={700}>
        {parts[0]}
      </text>
      {parts[1] && (
        <text x={0} y={26} textAnchor="middle" fill="#64748b" fontSize={9} fontWeight={500}>
          {parts[1].length > 13 ? parts[1].slice(0, 12) + '…' : parts[1]}
        </text>
      )}
    </g>
  );
}

// Custom interactive Tooltip for Bar Chart
function CustomBarTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div
        style={{
          background: '#0f172a',
          color: '#ffffff',
          padding: '10px 14px',
          borderRadius: 8,
          fontSize: '0.775rem',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          maxWidth: 240,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: '0.825rem', marginBottom: 4, color: '#c4b5fd' }}>
          Exp {d.exp_number}: {d.title}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, color: '#cbd5e1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span>Final Score:</span>
            <strong style={{ color: '#ffffff' }}>{d.final_score}%</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span>Auto Grade:</span>
            <strong style={{ color: '#ffffff' }}>{d.auto_grade}%</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span>Manual Grade:</span>
            <strong style={{ color: '#ffffff' }}>{d.manual_grade}%</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span>Completion Rate:</span>
            <strong style={{ color: '#34d399' }}>{d.completion_pct}%</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span>Avg Attempts:</span>
            <strong style={{ color: '#ffffff' }}>{d.avg_attempts}</strong>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

export function ExperimentsTab({ data, onSelectExperiment }: ExperimentsTabProps) {
  // Metric selector on Bar Chart
  const [selectedMetric, setSelectedMetric] = useState<'final_score' | 'auto_grade' | 'manual_grade' | 'completion_pct'>('final_score');

  // Search input for Item Discrimination table
  const [searchQuery, setSearchQuery] = useState('');

  // Modals / Drawers state
  const [selectedExpDetail, setSelectedExpDetail] = useState<any | null>(null);
  const [showAllErrorsModal, setShowAllErrorsModal] = useState(false);
  const [showNeedReviewModal, setShowNeedReviewModal] = useState(false);

  // Active hover/filter on Donut segments
  const [highlightedRubric, setHighlightedRubric] = useState<string | null>(null);

  // Prepare Bar chart data with formatted multiline X-axis labels
  const barChartData = useMemo(() => {
    return (data.score_by_experiment || []).map((exp) => ({
      ...exp,
      chart_label: `${exp.short_title}\n${exp.sub_title || exp.title}`,
    }));
  }, [data.score_by_experiment]);

  // Filter Item Discrimination table rows
  const filteredMetrics = useMemo(() => {
    const list = data.item_metrics || [];
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter((item) =>
      item.title.toLowerCase().includes(q) ||
      item.difficulty_badge.label.toLowerCase().includes(q) ||
      String(item.num).includes(q)
    );
  }, [data.item_metrics, searchQuery]);

  // Client-side pagination for item discrimination table
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredMetrics.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredMetrics.length);
  const paginatedMetrics = useMemo(() => {
    return filteredMetrics.slice(startIndex, endIndex);
  }, [filteredMetrics, startIndex, endIndex]);

  // Export CSV handler
  const handleExportCsv = () => {
    const rows = filteredMetrics.map((item) => ({
      Index: item.num,
      Title: item.title,
      AvgScore: item.avg_score,
      Completion: item.completion,
      AvgAttempts: item.avg_attempts,
      AvgExecTime: item.avg_exec_time,
      Difficulty: item.difficulty_badge.label,
      SampleSize: item.sample_size,
      SampleStatus: item.sample_badge.label,
    }));
    exportCSV(rows, 'experiments_item_discrimination_metrics');
  };

  // Color config for error cluster ranks
  const errorColors = [
    { rankBg: '#fee2e2', rankColor: '#ef4444', barColor: '#ef4444' }, // 1: red
    { rankBg: '#ffedd5', rankColor: '#f97316', barColor: '#f97316' }, // 2: orange
    { rankBg: '#fef3c7', rankColor: '#d97706', barColor: '#f59e0b' }, // 3: amber
    { rankBg: '#e0e7ff', rankColor: '#4f46e5', barColor: '#6366f1' }, // 4: indigo
    { rankBg: '#f3e8ff', rankColor: '#9333ea', barColor: '#8b5cf6' }, // 5: purple
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%', minWidth: 0 }}>
      {/* ────────────────────────────────────────────────────────────────────────
          ROW 1: 4 KPI CARDS (Matching Reference UI)
         ──────────────────────────────────────────────────────────────────────── */}
      <div className={styles.kpiGrid}>
        {/* KPI 1: Average Final Score */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className={styles.kpiIconWrapper} style={{ background: '#f5f3ff', color: '#8b5cf6' }}>
                <BarChart3 size={20} />
              </div>
              <span className={styles.kpiLabel}>Average Final Score</span>
            </div>
          </div>
          <div className={styles.kpiBottomRow}>
            <div>
              <div className={styles.kpiNumber}>{data.kpis.avg_final_score.value}</div>
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  marginTop: 6,
                  color: data.kpis.avg_final_score.delta_direction === 'down' ? '#ef4444' : '#10b981',
                }}
              >
                {data.kpis.avg_final_score.delta}
              </div>
            </div>
            <div className={styles.kpiSparkline}>
              <MiniSparkline points={data.kpis.avg_final_score.sparkline} color="#8b5cf6" />
            </div>
          </div>
        </div>

        {/* KPI 2: Completion Rate */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className={styles.kpiIconWrapper} style={{ background: '#ecfdf5', color: '#10b981' }}>
                <CheckCircle2 size={20} />
              </div>
              <span className={styles.kpiLabel}>Completion Rate</span>
            </div>
          </div>
          <div className={styles.kpiBottomRow}>
            <div>
              <div className={styles.kpiNumber}>{data.kpis.completion_rate.value}</div>
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  marginTop: 6,
                  color: '#10b981',
                }}
              >
                {data.kpis.completion_rate.delta}
              </div>
            </div>
            <div className={styles.kpiSparkline}>
              <MiniSparkline points={data.kpis.completion_rate.sparkline} color="#10b981" />
            </div>
          </div>
        </div>

        {/* KPI 3: Avg Attempts to Pass */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className={styles.kpiIconWrapper} style={{ background: '#f0f9ff', color: '#0284c7' }}>
                <Layers size={20} />
              </div>
              <span className={styles.kpiLabel}>Avg Attempts to Pass</span>
            </div>
          </div>
          <div className={styles.kpiBottomRow}>
            <div>
              <div className={styles.kpiNumber}>{data.kpis.avg_attempts_to_pass.value}</div>
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  marginTop: 6,
                  color: '#10b981', // Reduction in attempts is positive
                }}
              >
                {data.kpis.avg_attempts_to_pass.delta}
              </div>
            </div>
            <div className={styles.kpiSparkline}>
              <MiniSparkline points={data.kpis.avg_attempts_to_pass.sparkline} color="#0284c7" />
            </div>
          </div>
        </div>

        {/* KPI 4: Experiments Need Review */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className={styles.kpiIconWrapper} style={{ background: '#fef2f2', color: '#ef4444' }}>
                <AlertTriangle size={20} />
              </div>
              <span className={styles.kpiLabel}>Experiments Need Review</span>
            </div>
            <button
              type="button"
              onClick={() => setShowNeedReviewModal(true)}
              style={{
                background: 'none',
                border: 'none',
                color: '#7c3aed',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 2,
              }}
            >
              View All →
            </button>
          </div>
          <div className={styles.kpiBottomRow}>
            <div>
              <div className={styles.kpiNumber}>{data.kpis.experiments_need_review.value}</div>
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  marginTop: 6,
                  color: '#ef4444',
                }}
              >
                {data.kpis.experiments_need_review.delta}
              </div>
            </div>
            <div className={styles.kpiSparkline}>
              <MiniSparkline points={data.kpis.experiments_need_review.sparkline} color="#ef4444" />
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────
          ROW 2: 3-COLUMN MIDDLE GRID (Bar Chart, Donut, Error Clusters)
         ──────────────────────────────────────────────────────────────────────── */}
      <div className={styles.expThreeGrid}>
        {/* Card 1: Average Score by Experiment */}
        <div className={styles.panelCard}>
          <div className={styles.expCardHeader}>
            <div className={styles.expHeaderLeft}>
              <div className={styles.cardIconBox} style={{ background: '#f5f3ff', color: '#8b5cf6' }}>
                <BarChart3 size={18} />
              </div>
              <div className={styles.expHeaderTitles}>
                <span className={styles.expHeaderTitle}>Average Score by Experiment</span>
                <span className={styles.expHeaderSubtitle}>Mean final scores across selected section/subject</span>
              </div>
            </div>
            <select
              className={styles.metricSelector}
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value as any)}
            >
              <option value="final_score">Final Score</option>
              <option value="auto_grade">Auto Grade</option>
              <option value="manual_grade">Manual Grade</option>
              <option value="completion_pct">Completion %</option>
            </select>
          </div>

          <div style={{ width: '100%', height: 275, marginTop: 4 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barChartData} margin={{ top: 20, right: 10, left: -20, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="chart_label"
                  tick={<CustomXAxisTick />}
                  interval={0}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 20, 40, 60, 80, 100]}
                  unit="%"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <RechartsTooltip content={<CustomBarTooltip />} />
                <Bar
                  dataKey={selectedMetric}
                  fill="#8b5cf6"
                  radius={[4, 4, 0, 0]}
                  cursor="pointer"
                  onClick={(entry) => setSelectedExpDetail(entry)}
                >
                  <LabelList
                    dataKey={selectedMetric}
                    position="top"
                    formatter={(val: any) => `${val}%`}
                    style={{ fontSize: 11, fontWeight: 700, fill: '#1e293b' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Card 2: Class Quality Distribution */}
        <div className={styles.panelCard}>
          <div className={styles.expCardHeader}>
            <div className={styles.expHeaderLeft}>
              <div className={styles.cardIconBox} style={{ background: '#f0f9ff', color: '#0284c7' }}>
                <PieIcon size={18} />
              </div>
              <div className={styles.expHeaderTitles}>
                <span className={styles.expHeaderTitle}>Class Quality Distribution</span>
                <span className={styles.expHeaderSubtitle}>Distribution of final grades across all experiments</span>
              </div>
            </div>
          </div>

          <div className={styles.donutFlex} style={{ marginTop: 10 }}>
            {/* Donut Chart with Centered Total Submissions */}
            <div style={{ position: 'relative', width: 140, height: 140, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.quality_distribution.breakdown}
                    dataKey="count"
                    nameKey="grade"
                    innerRadius={46}
                    outerRadius={66}
                    paddingAngle={2}
                    cursor="pointer"
                    onMouseEnter={(_, index) =>
                      setHighlightedRubric(data.quality_distribution.breakdown[index].grade)
                    }
                    onMouseLeave={() => setHighlightedRubric(null)}
                  >
                    {data.quality_distribution.breakdown.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.color}
                        opacity={highlightedRubric && highlightedRubric !== entry.grade ? 0.4 : 1}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                }}
              >
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
                  {data.quality_distribution.total_submissions}
                </div>
                <div style={{ fontSize: '0.675rem', fontWeight: 600, color: '#64748b', marginTop: 2 }}>
                  submissions
                </div>
              </div>
            </div>

            {/* Rubrics Breakdown Legend */}
            <div className={styles.donutLegendList}>
              {data.quality_distribution.breakdown.map((rubric) => {
                const isSelected = highlightedRubric === rubric.grade;
                return (
                  <div
                    key={rubric.grade}
                    className={`${styles.donutLegendItem} ${isSelected ? styles.donutLegendItemActive : ''}`}
                    onMouseEnter={() => setHighlightedRubric(rubric.grade)}
                    onMouseLeave={() => setHighlightedRubric(null)}
                  >
                    <div className={styles.donutLegendLabel}>
                      <span className={styles.donutLegendDot} style={{ background: rubric.color }} />
                      <span>{rubric.grade}</span>
                    </div>
                    <div className={styles.donutLegendStats}>
                      <span className={styles.donutLegendCount}>{rubric.count}</span>
                      <span className={styles.donutLegendPct}>{rubric.percentage}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Card 3: Error Patterns (Top Clusters) */}
        <div className={styles.panelCard}>
          <div className={styles.expCardHeader}>
            <div className={styles.expHeaderLeft}>
              <div className={styles.cardIconBox} style={{ background: '#f5f3ff', color: '#8b5cf6' }}>
                <Bug size={18} />
              </div>
              <div className={styles.expHeaderTitles}>
                <span className={styles.expHeaderTitle}>Error Patterns (Top Clusters)</span>
                <span className={styles.expHeaderSubtitle}>Most common error signatures across submissions</span>
              </div>
            </div>
          </div>

          <div className={styles.errorClustersList} style={{ marginTop: 8 }}>
            {data.error_patterns.length === 0 ? (
              <div style={{ padding: '24px 12px', textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>
                No error patterns recorded for current scope.
              </div>
            ) : (
              data.error_patterns.map((err, idx) => {
                const colorCfg = errorColors[idx % errorColors.length];
                return (
                  <div key={err.rank} className={styles.errorClusterRow}>
                    <div
                      className={styles.errorRankPill}
                      style={{ background: colorCfg.rankBg, color: colorCfg.rankColor }}
                    >
                      {err.rank}
                    </div>
                    <div className={styles.errorContent}>
                      <div className={styles.errorTitleRow}>
                        <span className={styles.errorSignature} title={err.signature}>
                          {err.signature}
                        </span>
                        <span className={styles.errorPct}>{err.percentage}%</span>
                      </div>
                      <div className={styles.errorTrack}>
                        <div
                          className={styles.errorBarFill}
                          style={{
                            width: `${err.percentage}%`,
                            background: colorCfg.barColor,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className={styles.viewAllFooter}>
            <button
              type="button"
              className={styles.viewAllLink}
              onClick={() => setShowAllErrorsModal(true)}
            >
              View All →
            </button>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────
          ROW 3: BOTTOM FULL-WIDTH ITEM DISCRIMINATION & DIFFICULTY METRICS TABLE
         ──────────────────────────────────────────────────────────────────────── */}
      <div className={styles.tableCard}>
        <div className={styles.tableCardHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className={styles.cardIconBox} style={{ background: '#f5f3ff', color: '#8b5cf6' }}>
              <Sliders size={18} />
            </div>
            <div>
              <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#0f172a' }}>
                Item Discrimination & Difficulty Metrics
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Calibrate lab assignments: how effectively each experiment distinguishes top vs struggling performers.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className={styles.tableSearchWrapper}>
              <Search
                size={15}
                style={{ position: 'absolute', left: 10, color: '#94a3b8', pointerEvents: 'none' }}
              />
              <input
                type="text"
                className={styles.tableSearchInput}
                placeholder="Search experiments..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: 8,
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <button type="button" className={styles.tableCsvBtn} onClick={handleExportCsv}>
              <Download size={14} />
              <span>CSV</span>
            </button>
          </div>
        </div>

        <div className={styles.metricsTableResponsive}>
          <table className={styles.metricsTable}>
            <thead>
              <tr>
                <th style={{ width: 44 }}>#</th>
                <th>Experiment Title</th>
                <th>Avg Score</th>
                <th>Completion</th>
                <th>Avg Attempts</th>
                <th>Avg Execution Time</th>
                <th>Difficulty / Discrimination</th>
                <th>Sample Size</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedMetrics.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '32px 16px', color: '#64748b' }}>
                    No experiments matching &ldquo;{searchQuery}&rdquo;
                  </td>
                </tr>
              ) : (
                paginatedMetrics.map((item) => (
                  <tr key={item.id || item.num}>
                    <td style={{ fontWeight: 600, color: '#64748b' }}>{item.num}</td>
                    <td style={{ fontWeight: 700, color: '#0f172a' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedExpDetail(item)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#0f172a',
                          fontWeight: 700,
                          cursor: 'pointer',
                          padding: 0,
                          textAlign: 'left',
                          fontFamily: 'inherit',
                          fontSize: 'inherit',
                          transition: 'color 0.15s ease',
                        }}
                        onMouseEnter={(e) => ((e.target as HTMLElement).style.color = '#7c3aed')}
                        onMouseLeave={(e) => ((e.target as HTMLElement).style.color = '#0f172a')}
                      >
                        {item.title}
                      </button>
                    </td>
                    <td style={{ fontWeight: 800, color: '#1e293b' }}>{item.avg_score}</td>
                    <td style={{ fontWeight: 700, color: parseInt(item.completion) >= 80 ? '#10b981' : '#f59e0b' }}>
                      {item.completion}
                    </td>
                    <td style={{ fontWeight: 600, color: '#334155' }}>{item.avg_attempts}</td>
                    <td style={{ fontWeight: 600, color: '#64748b' }}>{item.avg_exec_time}</td>
                    <td>
                      <span
                        className={
                          item.difficulty_badge.type === 'green'
                            ? styles.diffBadgeEasy
                            : item.difficulty_badge.type === 'amber'
                            ? styles.diffBadgeModerate
                            : styles.diffBadgeHard
                        }
                      >
                        {item.difficulty_badge.label}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, color: '#1e293b', marginRight: 6 }}>
                        {item.sample_size}
                      </span>
                      {item.sample_badge.is_sufficient ? (
                        <span className={styles.sampleSufficient}>
                          <span>●</span>
                          <span>{item.sample_badge.label}</span>
                        </span>
                      ) : (
                        <span className={styles.sampleLow}>
                          <span>▲</span>
                          <span>{item.sample_badge.label}</span>
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <button
                          type="button"
                          className={styles.actionBtnView}
                          onClick={() => setSelectedExpDetail(item)}
                        >
                          View Details →
                        </button>
                        <button
                          type="button"
                          className={styles.actionBtnMore}
                          title="More actions"
                          onClick={() => setSelectedExpDetail(item)}
                        >
                          ···
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls Bar */}
        <div className={styles.paginationRow}>
          <div className={styles.paginationText}>
            <span>
              Showing {filteredMetrics.length === 0 ? 0 : startIndex + 1}–{endIndex} of {filteredMetrics.length} experiments
            </span>
            <span style={{ margin: '0 4px', color: '#cbd5e1' }}>|</span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span>Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className={styles.paginationSelect}
              >
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={25}>25</option>
              </select>
            </label>
          </div>

          <div className={styles.paginationButtons}>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className={`${styles.pageBtn} ${currentPage <= 1 ? styles.pageBtnDisabled : ''}`}
            >
              Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
              <button
                key={pageNum}
                type="button"
                onClick={() => setCurrentPage(pageNum)}
                className={`${styles.pageBtn} ${currentPage === pageNum ? styles.pageBtnActive : ''}`}
              >
                {pageNum}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className={`${styles.pageBtn} ${currentPage >= totalPages ? styles.pageBtnDisabled : ''}`}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────
          MODAL 1: EXPERIMENT CALIBRATION & ITEM DETAIL DRAWER
         ──────────────────────────────────────────────────────────────────────── */}
      {selectedExpDetail && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            zIndex: 9999,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={() => setSelectedExpDetail(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 520,
              background: '#ffffff',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.2)',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: '#f5f3ff',
                    color: '#8b5cf6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Code2 size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                    {selectedExpDetail.title}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Experiment #{selectedExpDetail.num || selectedExpDetail.exp_number} Calibration Drilldown
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedExpDetail(null)}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: 8,
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#64748b',
                  cursor: 'pointer',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Metrics Overview Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 12,
                }}
              >
                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.725rem', color: '#64748b', fontWeight: 600 }}>Average Score</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
                    {selectedExpDetail.avg_score || `${selectedExpDetail.final_score}%`}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#10b981', marginTop: 4 }}>
                    Auto: {selectedExpDetail.auto_grade || selectedExpDetail.avg_score} · Manual:{' '}
                    {selectedExpDetail.manual_grade || selectedExpDetail.avg_score}
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.725rem', color: '#64748b', fontWeight: 600 }}>Completion Rate</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981', marginTop: 4 }}>
                    {selectedExpDetail.completion || `${selectedExpDetail.completion_pct}%`}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 4 }}>
                    Passed final automated test run
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.725rem', color: '#64748b', fontWeight: 600 }}>Average Attempts</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0284c7', marginTop: 4 }}>
                    {selectedExpDetail.avg_attempts}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 4 }}>
                    Attempts before final code submission
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.725rem', color: '#64748b', fontWeight: 600 }}>Avg Execution Time</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#7c3aed', marginTop: 4 }}>
                    {selectedExpDetail.avg_exec_time || selectedExpDetail.exec_time || '1.2s'}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 4 }}>
                    Compiler sandbox container run time
                  </div>
                </div>
              </div>

              {/* Item Difficulty & Discrimination Analysis */}
              <div
                style={{
                  background: '#f8fafc',
                  padding: '16px',
                  borderRadius: 12,
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                    Item Calibration Diagnosis
                  </span>
                  {selectedExpDetail.difficulty_badge && (
                    <span
                      className={
                        selectedExpDetail.difficulty_badge.type === 'green'
                          ? styles.diffBadgeEasy
                          : selectedExpDetail.difficulty_badge.type === 'amber'
                          ? styles.diffBadgeModerate
                          : styles.diffBadgeHard
                      }
                    >
                      {selectedExpDetail.difficulty_badge.label}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '0.775rem', color: '#475569', lineHeight: 1.5, margin: 0 }}>
                  This assignment distinguishes upper quartile students from struggling students. The discrimination index
                  shows reliable variance, with higher attempt frequencies correlating directly with boundary edge cases in
                  test suites.
                </p>
              </div>

              {/* Sample Test Suite Pass Breakdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: '0.825rem', fontWeight: 700, color: '#0f172a' }}>
                  Test Case Coverage Breakdown
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: '#ecfdf5',
                      borderRadius: 8,
                      fontSize: '0.775rem',
                    }}
                  >
                    <span style={{ color: '#047857', fontWeight: 600 }}>Standard Test Cases (Core Logic)</span>
                    <strong style={{ color: '#065f46' }}>92% Pass Rate</strong>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: '#fffbeb',
                      borderRadius: 8,
                      fontSize: '0.775rem',
                    }}
                  >
                    <span style={{ color: '#b45309', fontWeight: 600 }}>Edge Cases (Null / Boundary Checks)</span>
                    <strong style={{ color: '#92400e' }}>64% Pass Rate</strong>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: '#fef2f2',
                      borderRadius: 8,
                      fontSize: '0.775rem',
                    }}
                  >
                    <span style={{ color: '#b91c1c', fontWeight: 600 }}>Stress & Time Limit Constraints</span>
                    <strong style={{ color: '#991b1b' }}>48% Pass Rate</strong>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button
                  type="button"
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    background: '#7c3aed',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: '0.8125rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                  onClick={() => {
                    if (onSelectExperiment && selectedExpDetail.id) {
                      onSelectExperiment(selectedExpDetail.id);
                    }
                    setSelectedExpDetail(null);
                  }}
                >
                  <ArrowUpRight size={16} />
                  <span>Inspect Cohort Submissions</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          MODAL 2: ALL ERROR PATTERNS CLUSTERS
         ──────────────────────────────────────────────────────────────────────── */}
      {showAllErrorsModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setShowAllErrorsModal(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 620,
              background: '#ffffff',
              borderRadius: 16,
              boxShadow: '0 20px 48px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '90vh',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: '#fef2f2',
                    color: '#ef4444',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Bug size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                    All Code Error Signatures & Patterns
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Aggregated runtime & compiler exceptions across all student submissions
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAllErrorsModal(false)}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: 8,
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#64748b',
                  cursor: 'pointer',
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {data.error_patterns.map((err, idx) => {
                const colorCfg = errorColors[idx % errorColors.length];
                return (
                  <div
                    key={err.rank}
                    style={{
                      padding: '14px 16px',
                      background: '#f8fafc',
                      borderRadius: 10,
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          className={styles.errorRankPill}
                          style={{ background: colorCfg.rankBg, color: colorCfg.rankColor }}
                        >
                          {err.rank}
                        </div>
                        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a' }}>
                          {err.signature}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.825rem', fontWeight: 800, color: colorCfg.rankColor }}>
                        {err.percentage}% ({err.count} instances)
                      </span>
                    </div>

                    <div className={styles.errorTrack} style={{ height: 6 }}>
                      <div
                        className={styles.errorBarFill}
                        style={{ width: `${err.percentage}%`, background: colorCfg.barColor }}
                      />
                    </div>

                    <div style={{ fontSize: '0.725rem', color: '#64748b', marginTop: 2 }}>
                      Common trigger: Index bounds verification in array indexing and pointer traversal test runs.
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              style={{
                padding: '14px 24px',
                borderTop: '1px solid #e2e8f0',
                background: '#f8fafc',
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={() => setShowAllErrorsModal(false)}
                style={{
                  padding: '8px 18px',
                  background: '#0f172a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          MODAL 3: EXPERIMENTS NEED REVIEW MODAL
         ──────────────────────────────────────────────────────────────────────── */}
      {showNeedReviewModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setShowNeedReviewModal(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 620,
              background: '#ffffff',
              borderRadius: 16,
              boxShadow: '0 20px 48px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '90vh',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: '#fef2f2',
                    color: '#ef4444',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                    Experiments Requiring Calibration Review
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Labs exhibiting anomalous failure rates (&gt;35%) or high discrimination friction
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNeedReviewModal(false)}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: 8,
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#64748b',
                  cursor: 'pointer',
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {data.item_metrics
                .filter((item) => item.difficulty_badge.type === 'red' || parseInt(item.avg_score) < 60)
                .slice(0, 3)
                .map((item) => (
                  <div
                    key={item.num}
                    style={{
                      padding: '16px',
                      background: '#fff',
                      borderRadius: 10,
                      border: '1px solid #fecaca',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      boxShadow: '0 1px 3px rgba(239, 68, 68, 0.08)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a' }}>
                        Exp #{item.num}: {item.title}
                      </span>
                      <span className={styles.diffBadgeHard}>{item.difficulty_badge.label}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: '0.75rem', color: '#64748b' }}>
                      <span>Avg Score: <strong style={{ color: '#ef4444' }}>{item.avg_score}</strong></span>
                      <span>Completion: <strong style={{ color: '#ef4444' }}>{item.completion}</strong></span>
                      <span>Avg Attempts: <strong>{item.avg_attempts}</strong></span>
                    </div>

                    <div style={{ fontSize: '0.75rem', color: '#475569', background: '#fef2f2', padding: '8px 12px', borderRadius: 6, marginTop: 4 }}>
                      <strong>Pedagogical Recommendation:</strong> Multiple students face syntax and pointer validation timeouts. Consider providing test case hints or adjusting test suite threshold limits.
                    </div>
                  </div>
                ))}
            </div>

            <div
              style={{
                padding: '14px 24px',
                borderTop: '1px solid #e2e8f0',
                background: '#f8fafc',
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={() => setShowNeedReviewModal(false)}
                style={{
                  padding: '8px 18px',
                  background: '#0f172a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
