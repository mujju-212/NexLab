'use client';

import React, { useState, useMemo } from 'react';
import {
  Users,
  TrendingUp,
  Zap,
  AlertTriangle,
  PieChart as PieIcon,
  BarChart3,
  Clock,
  MoreHorizontal,
  ChevronRight,
  Info,
  CheckSquare,
  Square,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  AreaChart,
  Area,
} from 'recharts';
import styles from './instructor-analytics.module.css';
import {
  type InstructorOverviewData,
  type NeedsAttentionStudent,
} from '@/services/analytics.service';

interface OverviewTabProps {
  data: InstructorOverviewData;
  onSelectStudent: (studentId: string) => void;
  onViewAllStudents?: () => void;
  onActionClick?: (action: string, student: NeedsAttentionStudent) => void;
}

// Avatar color helper
function getAvatarColors(name: string, roll: string) {
  if (roll === 'NDU2024012') return { bg: '#dbeafe', text: '#1d4ed8' }; // Aadhya
  if (roll === 'NDU2024005') return { bg: '#e0e7ff', text: '#4338ca' }; // Aditya
  if (roll === 'NDU2024004') return { bg: '#f3e8ff', text: '#7e22ce' }; // Ananya
  if (roll === 'NDU2024010') return { bg: '#ffedd5', text: '#c2410c' }; // Rahul
  if (roll === 'NDU2024015') return { bg: '#d1fae5', text: '#047857' }; // Sneha
  const colors = [
    { bg: '#dbeafe', text: '#1d4ed8' },
    { bg: '#e0e7ff', text: '#4338ca' },
    { bg: '#f3e8ff', text: '#7e22ce' },
    { bg: '#ffedd5', text: '#c2410c' },
    { bg: '#d1fae5', text: '#047857' },
  ];
  const charCode = (name || 'S').charCodeAt(0);
  return colors[charCode % colors.length];
}

function getInitials(name: string) {
  if (!name) return 'ST';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// Mini SVG sparkline for table
function TableSparkline({ trend }: { trend: 'deteriorating' | 'improving' | 'stable' }) {
  const isUp = trend === 'improving';
  const strokeColor = isUp ? '#10b981' : '#ef4444';
  const d = isUp
    ? 'M 2 18 Q 12 20, 22 14 T 42 6 T 60 4'
    : 'M 2 4 Q 14 6, 24 12 T 44 16 T 60 20';

  return (
    <svg width="60" height="22" viewBox="0 0 64 24" style={{ overflow: 'visible' }}>
      <path
        d={d}
        fill="none"
        stroke={strokeColor}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Mini SVG sparkline for KPI card
function KpiSparkline({ points, color }: { points: number[]; color: string }) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = 80;
  const height = 26;

  const coords = points.map((p, idx) => {
    const x = (idx / (points.length - 1)) * width;
    const y = height - ((p - min) / range) * (height - 6) - 3;
    return `${x},${y}`;
  });

  const pathD = `M ${coords.join(' L ')}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Custom interactive tooltip for Risk Trend chart
function CustomTrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((acc: number, p: any) => acc + (p.value || 0), 0);
  return (
    <div
      style={{
        background: '#0f172a',
        color: '#ffffff',
        padding: '8px 12px',
        borderRadius: 8,
        fontSize: '0.725rem',
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        border: '1px solid #334155',
        minWidth: 120,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4, borderBottom: '1px solid #334155', paddingBottom: 3 }}>
        {label} 2026
      </div>
      {payload.map((p: any) => (
        <div
          key={p.dataKey}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            margin: '3px 0',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.color }} />
            <span style={{ textTransform: 'capitalize' }}>{p.dataKey}:</span>
          </span>
          <strong style={{ color: '#fff' }}>{p.value}</strong>
        </div>
      ))}
      <div
        style={{
          borderTop: '1px solid #334155',
          marginTop: 4,
          paddingTop: 3,
          display: 'flex',
          justifyContent: 'space-between',
          color: '#cbd5e1',
        }}
      >
        <span>Total At-Risk:</span>
        <strong style={{ color: '#f59e0b' }}>{total}</strong>
      </div>
    </div>
  );
}

export function OverviewTab({
  data,
  onSelectStudent,
  onViewAllStudents,
  onActionClick,
}: OverviewTabProps) {
  // ── State for Interactive Features ──
  const [activeRiskFilter, setActiveRiskFilter] = useState<'all' | 'critical' | 'high' | 'watch'>('all');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Record<string, boolean>>({});
  const [hoveredRiskBand, setHoveredRiskBand] = useState<string | null>(null);
  const [hoveredQualityGrade, setHoveredQualityGrade] = useState<string | null>(null);
  const [selectedQuadrant, setSelectedQuadrant] = useState<string | null>(null);
  const [hoveredStudentId, setHoveredStudentId] = useState<string | null>(null);
  const [hoveredScatterStudent, setHoveredScatterStudent] = useState<any | null>(null);
  const [trendVisibility, setTrendVisibility] = useState({ critical: true, high: true, watch: true });
  const [selectedQualityGrade, setSelectedQualityGrade] = useState<string | null>(null);

  const kpis = data?.kpis || {
    active_students: { value: 24, total_enrolled: 28, delta: 8.0, label: 'of 28 enrolled', sparkline: [20, 22, 24] },
    class_avg_grade: { value: '68%', delta: 3.2, label: 'vs previous 30 days', sparkline: [62, 65, 68] },
    focus_engagement: { value: '78%', delta: 1.5, label: 'active participation rate', sparkline: [75, 77, 78] },
    needs_attention: { value: 2, total_at_risk: 5, delta: 2.0, label: 'students at risk', sparkline: [1, 2, 2] },
  };

  const studentsList = data?.needs_attention_students || [];

  // Filter students based on risk band pills and/or quadrant
  const filteredStudents = useMemo(() => {
    let list = studentsList;
    if (activeRiskFilter !== 'all') {
      list = list.filter((s) => s.risk_band === activeRiskFilter);
    }
    return list;
  }, [studentsList, activeRiskFilter]);

  const critCount = studentsList.filter((s) => s.risk_band === 'critical').length;
  const highCount = studentsList.filter((s) => s.risk_band === 'high').length;
  const watchCount = studentsList.filter((s) => s.risk_band === 'watch').length;

  const toggleSelectStudent = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedStudentIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSelectAll = () => {
    const allSelected = filteredStudents.length > 0 && filteredStudents.every((s) => selectedStudentIds[s.student_id]);
    const next: Record<string, boolean> = {};
    if (!allSelected) {
      filteredStudents.forEach((s) => {
        next[s.student_id] = true;
      });
    }
    setSelectedStudentIds(next);
  };

  const selectedCount = Object.values(selectedStudentIds).filter(Boolean).length;

  // Risk Distribution Data
  const riskDistBands = data?.risk_distribution?.bands || [
    { name: 'Critical', count: 1, percentage: 4, color: '#ef4444' },
    { name: 'High',     count: 3, percentage: 11, color: '#f97316' },
    { name: 'Watch',    count: 6, percentage: 21, color: '#f59e0b' },
    { name: 'On Track', count: 18, percentage: 64, color: '#10b981' },
  ];

  // Active risk slice details for dynamic center display
  const activeRiskDetails = useMemo(() => {
    if (!hoveredRiskBand) {
      return {
        value: data?.risk_distribution?.total_students || 28,
        label: 'Students',
      };
    }
    const band = riskDistBands.find((b) => b.name === hoveredRiskBand);
    if (!band) return { value: data?.risk_distribution?.total_students || 28, label: 'Students' };
    return {
      value: `${band.count} (${band.percentage}%)`,
      label: band.name,
    };
  }, [hoveredRiskBand, data, riskDistBands]);

  // Risk Trend Data
  const riskTrendData = data?.risk_trend || [
    { date: 'Oct 1', critical: 1, high: 2, watch: 4 },
    { date: 'Oct 8', critical: 1, high: 2, watch: 5 },
    { date: 'Oct 15', critical: 1, high: 3, watch: 6 },
    { date: 'Oct 22', critical: 2, high: 3, watch: 5 },
    { date: 'Oct 30', critical: 1, high: 3, watch: 6 },
  ];

  // Quality Distribution Data
  const qualityBreakdown = data?.quality_distribution?.breakdown || [
    { grade: 'A (≥ 80%)', count: 35, percentage: 28, color: '#8b5cf6' },
    { grade: 'B (60 – 79%)', count: 44, percentage: 35, color: '#0284c7' },
    { grade: 'C (40 – 59%)', count: 31, percentage: 25, color: '#f59e0b' },
    { grade: 'D (< 40%)', count: 16, percentage: 12, color: '#10b981' },
  ];
  const totalSubmissions = data?.quality_distribution?.total_submissions || 126;

  // Active quality slice details for dynamic center display
  const activeQualityDetails = useMemo(() => {
    if (!hoveredQualityGrade) {
      return {
        value: totalSubmissions,
        label: 'Submissions',
      };
    }
    const q = qualityBreakdown.find((b) => b.grade.startsWith(hoveredQualityGrade));
    if (!q) return { value: totalSubmissions, label: 'Submissions' };
    return {
      value: q.count,
      label: `${q.grade.split(' ')[0]} (${q.percentage}%)`,
    };
  }, [hoveredQualityGrade, totalSubmissions, qualityBreakdown]);

  // Struggle Quadrant Data
  const quadrantStudents = data?.struggle_quadrant?.students || [];

  // Quadrant student counts for interactive headers
  const quadrantCounts = useMemo(() => {
    const counts = { thriving: 0, grinding: 0, disengaged: 0, coasting: 0 };
    quadrantStudents.forEach((s) => {
      const q = (s.quadrant || 'disengaged') as keyof typeof counts;
      if (counts[q] !== undefined) counts[q]++;
    });
    return counts;
  }, [quadrantStudents]);

  return (
    <div className={styles.pageContainer}>
      {/* ── 4 KPI CARDS ROW (Interactive Elevation) ── */}
      <div className={styles.kpiGrid}>
        {/* KPI 1: Active Students */}
        <div
          className={styles.kpiCard}
          title="Number of distinct students with recorded lab activity in the selected timeframe."
        >
          <div>
            <div className={styles.kpiTopRow}>
              <div className={styles.kpiIconWrapper} style={{ background: '#f5f3ff', color: '#8b5cf6' }}>
                <Users size={20} />
              </div>
              <span className={styles.kpiBadgeGreen}>↑ 8%</span>
            </div>
            <div className={styles.kpiLabel}>Active Students</div>
          </div>
          <div className={styles.kpiBottomRow}>
            <div>
              <div className={styles.kpiNumber}>{kpis.active_students.value}</div>
              <div className={styles.kpiSubtext}>of {kpis.active_students.total_enrolled || 28} enrolled</div>
            </div>
            <div className={styles.kpiSparkline}>
              <KpiSparkline points={kpis.active_students.sparkline || [20, 22, 24]} color="#8b5cf6" />
            </div>
          </div>
        </div>

        {/* KPI 2: Class Avg Grade */}
        <div
          className={styles.kpiCard}
          title="Mean aggregated final grade across graded submissions."
        >
          <div>
            <div className={styles.kpiTopRow}>
              <div className={styles.kpiIconWrapper} style={{ background: '#eff6ff', color: '#3b82f6' }}>
                <TrendingUp size={20} />
              </div>
              <span className={styles.kpiBadgeGreen}>↑ 3.2%</span>
            </div>
            <div className={styles.kpiLabel}>Class Avg Grade</div>
          </div>
          <div className={styles.kpiBottomRow}>
            <div>
              <div className={styles.kpiNumber}>{kpis.class_avg_grade.value}</div>
              <div className={styles.kpiSubtext}>vs previous 30 days</div>
            </div>
            <div className={styles.kpiSparkline}>
              <KpiSparkline points={kpis.class_avg_grade.sparkline || [62, 65, 68]} color="#3b82f6" />
            </div>
          </div>
        </div>

        {/* KPI 3: Focus Engagement */}
        <div
          className={styles.kpiCard}
          title="Active telemetry participation score based on IDE interaction and time on task."
        >
          <div>
            <div className={styles.kpiTopRow}>
              <div className={styles.kpiIconWrapper} style={{ background: '#ecfdf5', color: '#10b981' }}>
                <Zap size={20} />
              </div>
              <span className={styles.kpiBadgeGreen}>↑ 1.5%</span>
            </div>
            <div className={styles.kpiLabel}>Focus Engagement</div>
          </div>
          <div className={styles.kpiBottomRow}>
            <div>
              <div className={styles.kpiNumber}>{kpis.focus_engagement.value}</div>
              <div className={styles.kpiSubtext}>active participation rate</div>
            </div>
            <div className={styles.kpiSparkline}>
              <KpiSparkline points={kpis.focus_engagement.sparkline || [74, 76, 78]} color="#10b981" />
            </div>
          </div>
        </div>

        {/* KPI 4: Needs Attention */}
        <div
          className={styles.kpiCard}
          onClick={() => setActiveRiskFilter(activeRiskFilter === 'critical' ? 'all' : 'critical')}
          title="Click to toggle Critical students filter."
          style={{ cursor: 'pointer' }}
        >
          <div>
            <div className={styles.kpiTopRow}>
              <div className={styles.kpiIconWrapper} style={{ background: '#fef2f2', color: '#ef4444' }}>
                <AlertTriangle size={20} />
              </div>
              <span className={styles.kpiBadgeRed}>↑ 2%</span>
            </div>
            <div className={styles.kpiLabel}>Needs Attention</div>
          </div>
          <div className={styles.kpiBottomRow}>
            <div>
              <div className={styles.kpiNumber}>{kpis.needs_attention.value}</div>
              <div className={styles.kpiSubtext}>students at risk</div>
            </div>
            <div className={styles.kpiSparkline}>
              <KpiSparkline points={kpis.needs_attention.sparkline || [1, 2, 2]} color="#ef4444" />
            </div>
          </div>
        </div>
      </div>

      {/* ── MIDDLE SECTION: Needs-Attention Worklist (Left) & Risk Cards Stack (Right) ── */}
      <div className={styles.middleGrid}>
        {/* Left Card: Needs-Attention Students Worklist Table */}
        <div className={styles.panelCard}>
          {/* Header */}
          <div className={styles.cardHeader}>
            <div className={styles.cardHeaderLeft}>
              <div className={styles.cardIconBox} style={{ background: '#fef2f2', color: '#ef4444' }}>
                <AlertTriangle size={18} />
              </div>
              <div>
                <h3 className={styles.cardTitle}>Needs-Attention Students</h3>
                <div className={styles.cardSubtitle}>
                  Prioritized by risk score, recent performance, and key warning signals
                </div>
              </div>
            </div>

            {/* Filter Pills */}
            <div className={styles.filterPillsGroup}>
              <button
                type="button"
                onClick={() => setActiveRiskFilter('all')}
                className={`${styles.pillBtn} ${activeRiskFilter === 'all' ? styles.pillBtnActive : ''}`}
              >
                All ({studentsList.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveRiskFilter('critical')}
                className={`${styles.pillBtn} ${styles.pillBtnCritical} ${
                  activeRiskFilter === 'critical' ? styles.pillBtnActive : ''
                }`}
              >
                Critical ({critCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveRiskFilter('high')}
                className={`${styles.pillBtn} ${styles.pillBtnHigh} ${
                  activeRiskFilter === 'high' ? styles.pillBtnActive : ''
                }`}
              >
                High ({highCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveRiskFilter('watch')}
                className={`${styles.pillBtn} ${styles.pillBtnWatch} ${
                  activeRiskFilter === 'watch' ? styles.pillBtnActive : ''
                }`}
              >
                Watch ({watchCount})
              </button>
              {onViewAllStudents && (
                <button
                  type="button"
                  onClick={onViewAllStudents}
                  className={styles.viewAllLink}
                  title="View full student cohort matrix"
                >
                  View All <ChevronRight size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Table Container */}
          <div className={styles.tableContainer}>
            <table className={styles.worklistTable}>
              <thead>
                <tr>
                  <th style={{ width: 36, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={
                        filteredStudents.length > 0 &&
                        filteredStudents.every((s) => selectedStudentIds[s.student_id])
                      }
                      onChange={toggleSelectAll}
                      style={{ cursor: 'pointer' }}
                      title="Select all students in current view"
                    />
                  </th>
                  <th style={{ minWidth: 160 }}>Student</th>
                  <th style={{ minWidth: 84 }}>Risk</th>
                  <th style={{ minWidth: 70 }}>Score</th>
                  <th style={{ minWidth: 80 }}>Trend (30d)</th>
                  <th style={{ minWidth: 180 }}>Primary Warning Driver</th>
                  <th style={{ minWidth: 140 }}>Suggested Action</th>
                  <th style={{ width: 72, minWidth: 72, textAlign: 'center', paddingRight: 14 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '32px 0', color: '#64748b' }}>
                      No students in this risk band. All students are on track!
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((st) => {
                    const avatar = getAvatarColors(st.student_name, st.roll_number);
                    const initials = getInitials(st.student_name);
                    const isSelected = Boolean(selectedStudentIds[st.student_id]);
                    const isHovered = hoveredStudentId === st.student_id;
                    const score = st.score ?? st.risk_score ?? 50;

                    const scoreFillColor =
                      st.risk_band === 'critical'
                        ? '#ef4444'
                        : st.risk_band === 'high'
                        ? '#f97316'
                        : '#f59e0b';

                    return (
                      <tr
                        key={st.student_id}
                        onClick={() => onSelectStudent(st.student_id)}
                        onMouseEnter={() => setHoveredStudentId(st.student_id)}
                        onMouseLeave={() => setHoveredStudentId(null)}
                        className={styles.worklistRow}
                        style={{
                          background: isHovered
                            ? '#f8fafc'
                            : isSelected
                            ? '#f5f3ff'
                            : undefined,
                        }}
                        title="Click to view Student 360 diagnostic profile"
                      >
                        {/* Checkbox */}
                        <td
                          style={{ textAlign: 'center' }}
                          onClick={(e) => toggleSelectStudent(st.student_id, e)}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>

                        {/* Student Name & Avatar */}
                        <td>
                          <div className={styles.studentCell}>
                            <div
                              className={styles.studentAvatar}
                              style={{ background: avatar.bg, color: avatar.text }}
                            >
                              {initials}
                            </div>
                            <div>
                              <div className={styles.studentName}>{st.student_name}</div>
                              <div className={styles.studentRoll}>{st.roll_number}</div>
                            </div>
                          </div>
                        </td>

                        {/* Risk Band Badge */}
                        <td>
                          {st.risk_band === 'critical' && (
                            <span className={styles.riskBadgeCritical}>Critical</span>
                          )}
                          {st.risk_band === 'high' && (
                            <span className={styles.riskBadgeHigh}>High</span>
                          )}
                          {st.risk_band === 'watch' && (
                            <span className={styles.riskBadgeWatch}>Watch</span>
                          )}
                          {st.risk_band === 'ok' && (
                            <span className={styles.riskBadgeOk}>On Track</span>
                          )}
                        </td>

                        {/* Score & Progress Bar */}
                        <td>
                          <div style={{ width: 56 }}>
                            <div className={styles.scoreNumber}>{score}</div>
                            <div className={styles.scoreBarTrack}>
                              <div
                                className={styles.scoreBarFill}
                                style={{
                                  width: `${Math.min(100, Math.max(10, score))}%`,
                                  background: scoreFillColor,
                                }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* 30-Day Trend Sparkline */}
                        <td>
                          <TableSparkline trend={st.trend} />
                        </td>

                        {/* Primary Warning Driver */}
                        <td>
                          <div className={styles.warningDriverText} title={st.primary_warning_driver}>
                            {st.primary_warning_driver}
                          </div>
                        </td>

                        {/* Suggested Action */}
                        <td>
                          <button
                            type="button"
                            className={styles.actionBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onActionClick) {
                                onActionClick(st.suggested_action, st);
                              } else {
                                onSelectStudent(st.student_id);
                              }
                            }}
                            title={`Execute: ${st.suggested_action}`}
                          >
                            {st.suggested_action}
                          </button>
                        </td>

                        {/* Actions menu */}
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className={styles.moreBtn}
                            title="Open Student 360 Drawer"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectStudent(st.student_id);
                            }}
                          >
                            <MoreHorizontal size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Bulk Selection Floating Action Bar */}
          {selectedCount > 0 && (
            <div className={styles.bulkActionBar}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckSquare size={16} style={{ color: '#a78bfa' }} />
                <span>
                  <strong>{selectedCount}</strong> student{selectedCount > 1 ? 's' : ''} selected
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  className={styles.bulkActionBtn}
                  onClick={() => {
                    alert(`Intervention scheduled for ${selectedCount} selected students.`);
                  }}
                >
                  <Sparkles size={12} /> Schedule Group Catch-Up
                </button>
                <button
                  type="button"
                  className={styles.bulkActionBtn}
                  style={{ background: '#334155', color: '#fff' }}
                  onClick={() => setSelectedStudentIds({})}
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Stack: Risk Distribution & Risk Trend */}
        <div className={styles.rightStack}>
          {/* Card 1: Risk Distribution (Interactive Donut) */}
          <div className={styles.panelCard}>
            <div className={styles.cardHeader} style={{ marginBottom: 10 }}>
              <div className={styles.cardHeaderLeft}>
                <div className={styles.cardIconBox} style={{ background: '#f5f3ff', color: '#8b5cf6' }}>
                  <Clock size={18} />
                </div>
                <div>
                  <h3 className={styles.cardTitle}>Risk Distribution</h3>
                  <div className={styles.cardSubtitle}>Students by unified risk score band</div>
                </div>
              </div>
            </div>

            <div className={styles.donutWithLegend}>
              {/* Donut Chart */}
              <div className={styles.donutWrapper} style={{ width: 120, height: 120 }}>
                <ResponsiveContainer width={120} height={120}>
                  <PieChart>
                    <Pie
                      data={riskDistBands}
                      innerRadius={38}
                      outerRadius={56}
                      paddingAngle={3}
                      dataKey="count"
                      onMouseEnter={(entry) => setHoveredRiskBand(entry.name)}
                      onMouseLeave={() => setHoveredRiskBand(null)}
                      onClick={(entry) => {
                        const target = entry.name.toLowerCase() as any;
                        setActiveRiskFilter((prev) => (prev === target ? 'all' : target));
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      {riskDistBands.map((entry, index) => {
                        const isHovered = hoveredRiskBand === entry.name;
                        return (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.color}
                            stroke={isHovered ? '#0f172a' : 'transparent'}
                            strokeWidth={isHovered ? 2 : 0}
                            style={{
                              transform: isHovered ? 'scale(1.05)' : 'scale(1)',
                              transformOrigin: 'center center',
                              transition: 'transform 0.15s ease',
                            }}
                          />
                        );
                      })}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                {/* Center Dynamic Label */}
                <div className={styles.donutCenterLabel}>
                  <span className={styles.donutCenterValue} style={{ fontSize: '1.05rem' }}>
                    {activeRiskDetails.value}
                  </span>
                  <span className={styles.donutCenterSub} style={{ fontSize: '0.675rem' }}>
                    {activeRiskDetails.label}
                  </span>
                </div>
              </div>

              {/* Interactive Legend with Click-to-Filter */}
              <div className={styles.donutLegend}>
                {riskDistBands.map((b) => {
                  const isHovered = hoveredRiskBand === b.name;
                  const isActiveFilter = activeRiskFilter === b.name.toLowerCase();
                  return (
                    <div
                      key={b.name}
                      onMouseEnter={() => setHoveredRiskBand(b.name)}
                      onMouseLeave={() => setHoveredRiskBand(null)}
                      onClick={() => {
                        const target = b.name.toLowerCase() as any;
                        setActiveRiskFilter((prev) => (prev === target ? 'all' : target));
                      }}
                      className={`${styles.legendRowInteractive} ${
                        isActiveFilter ? styles.legendRowInteractiveActive : ''
                      }`}
                      style={{
                        background: isHovered ? '#f1f5f9' : undefined,
                      }}
                      title={`Click to filter table by ${b.name} students`}
                    >
                      <div className={styles.legendNameDot}>
                        <span className={styles.legendDot} style={{ background: b.color }} />
                        <span style={{ fontWeight: isActiveFilter ? 700 : 500 }}>{b.name}</span>
                      </div>
                      <span className={styles.legendValue}>
                        {b.count} ({b.percentage}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Card 2: Risk Trend (Interactive Area Chart with Legend Toggles) */}
          <div className={styles.panelCard}>
            <div className={styles.cardHeader} style={{ marginBottom: 6 }}>
              <div className={styles.cardHeaderLeft}>
                <div className={styles.cardIconBox} style={{ background: '#f5f3ff', color: '#8b5cf6' }}>
                  <BarChart3 size={18} />
                </div>
                <div>
                  <h3 className={styles.cardTitle}>Risk Trend</h3>
                  <div className={styles.cardSubtitle}>Count of at-risk students over time</div>
                </div>
              </div>

              {/* Interactive Legend Pills with Click-to-Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setTrendVisibility((p) => ({ ...p, critical: !p.critical }))}
                  className={`${styles.trendLegendBtn} ${
                    !trendVisibility.critical ? styles.trendLegendBtnInactive : ''
                  }`}
                  title="Toggle Critical risk area"
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
                  Critical
                </button>
                <button
                  type="button"
                  onClick={() => setTrendVisibility((p) => ({ ...p, high: !p.high }))}
                  className={`${styles.trendLegendBtn} ${
                    !trendVisibility.high ? styles.trendLegendBtnInactive : ''
                  }`}
                  title="Toggle High risk area"
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316' }} />
                  High
                </button>
                <button
                  type="button"
                  onClick={() => setTrendVisibility((p) => ({ ...p, watch: !p.watch }))}
                  className={`${styles.trendLegendBtn} ${
                    !trendVisibility.watch ? styles.trendLegendBtnInactive : ''
                  }`}
                  title="Toggle Watch risk area"
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b' }} />
                  Watch
                </button>
              </div>
            </div>

            {/* Recharts Area Chart */}
            <div style={{ width: '100%', height: 115, marginTop: 4 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={riskTrendData} margin={{ top: 8, right: 6, left: -26, bottom: 0 }}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 15]}
                    ticks={[0, 5, 10, 15]}
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <RechartsTooltip
                    content={<CustomTrendTooltip />}
                    cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '3 3' }}
                  />
                  {trendVisibility.watch && (
                    <Area
                      type="monotone"
                      dataKey="watch"
                      stackId="1"
                      stroke="#f59e0b"
                      fill="#fef9c3"
                      strokeWidth={1.8}
                      activeDot={{ r: 4, strokeWidth: 1, fill: '#f59e0b' }}
                    />
                  )}
                  {trendVisibility.high && (
                    <Area
                      type="monotone"
                      dataKey="high"
                      stackId="2"
                      stroke="#f97316"
                      fill="#ffedd5"
                      strokeWidth={1.8}
                      activeDot={{ r: 4, strokeWidth: 1, fill: '#f97316' }}
                    />
                  )}
                  {trendVisibility.critical && (
                    <Area
                      type="monotone"
                      dataKey="critical"
                      stackId="3"
                      stroke="#ef4444"
                      fill="#fee2e2"
                      strokeWidth={1.8}
                      activeDot={{ r: 4, strokeWidth: 1, fill: '#ef4444' }}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* ── BOTTOM SECTION: Effort vs Outcome Quadrant (Left) & Quality Distribution (Right) ── */}
      <div className={styles.bottomGrid}>
        {/* Left: Struggle Quadrant (Interactive 2D Scatter) */}
        <div className={styles.panelCard}>
          <div className={styles.cardHeader}>
            <div className={styles.cardHeaderLeft}>
              <div className={styles.cardIconBox} style={{ background: '#f5f3ff', color: '#8b5cf6' }}>
                <TrendingUp size={18} />
              </div>
              <div>
                <h3 className={styles.cardTitle}>Effort vs. Outcome (Struggle Quadrant)</h3>
                <div className={styles.cardSubtitle}>
                  Cohort median split: identify Thriving, Grinding, Struggling, and Disengaged
                </div>
              </div>
            </div>

            {selectedQuadrant && (
              <button
                type="button"
                onClick={() => setSelectedQuadrant(null)}
                className={styles.pillBtn}
                style={{ background: '#f1f5f9' }}
              >
                Clear Filter ✕
              </button>
            )}
          </div>

          {/* Interactive 2D Quadrant Scatter Plot */}
          <div className={styles.quadrantContainer}>
            {/* Top-Left: Grinding (High Outcome, Low Effort) */}
            <div
              className={`${styles.quadrantBoxInteractive} ${styles.quadrantBoxTL} ${
                selectedQuadrant === 'grinding' ? styles.quadrantBoxInteractiveActive : ''
              }`}
              onClick={() => setSelectedQuadrant(selectedQuadrant === 'grinding' ? null : 'grinding')}
              title="Click to highlight Grinding students (High Outcome, Low Effort)"
            >
              <div className={styles.quadrantTitle} style={{ color: '#d97706' }}>
                Grinding
                <span className={styles.quadrantBadge}>{quadrantCounts.grinding}</span>
              </div>
              <div className={styles.quadrantDesc}>High Outcome, Low Effort</div>
            </div>

            {/* Top-Right: Thriving (High Outcome, High Effort) */}
            <div
              className={`${styles.quadrantBoxInteractive} ${styles.quadrantBoxTR} ${
                selectedQuadrant === 'thriving' ? styles.quadrantBoxInteractiveActive : ''
              }`}
              onClick={() => setSelectedQuadrant(selectedQuadrant === 'thriving' ? null : 'thriving')}
              title="Click to highlight Thriving students (High Outcome, High Effort)"
            >
              <div className={styles.quadrantTitle} style={{ color: '#16a34a' }}>
                Thriving
                <span className={styles.quadrantBadge}>{quadrantCounts.thriving}</span>
              </div>
              <div className={styles.quadrantDesc}>High Outcome, High Effort</div>
            </div>

            {/* Bottom-Left: Disengaged (Low Outcome, Low Effort) */}
            <div
              className={`${styles.quadrantBoxInteractive} ${styles.quadrantBoxBL} ${
                selectedQuadrant === 'disengaged' ? styles.quadrantBoxInteractiveActive : ''
              }`}
              onClick={() => setSelectedQuadrant(selectedQuadrant === 'disengaged' ? null : 'disengaged')}
              title="Click to highlight Disengaged students (Low Outcome, Low Effort)"
            >
              <div className={styles.quadrantTitle} style={{ color: '#dc2626' }}>
                Disengaged
                <span className={styles.quadrantBadge}>{quadrantCounts.disengaged}</span>
              </div>
              <div className={styles.quadrantDesc}>Low Outcome, Low Effort</div>
            </div>

            {/* Bottom-Right: Coasting (Low Outcome, High Effort) */}
            <div
              className={`${styles.quadrantBoxInteractive} ${styles.quadrantBoxBR} ${
                selectedQuadrant === 'coasting' ? styles.quadrantBoxInteractiveActive : ''
              }`}
              onClick={() => setSelectedQuadrant(selectedQuadrant === 'coasting' ? null : 'coasting')}
              title="Click to highlight Coasting students (Low Outcome, High Effort)"
            >
              <div className={styles.quadrantTitle} style={{ color: '#2563eb' }}>
                Coasting
                <span className={styles.quadrantBadge}>{quadrantCounts.coasting}</span>
              </div>
              <div className={styles.quadrantDesc}>Low Outcome, High Effort</div>
            </div>

            {/* Axis Labels */}
            <div className={styles.axisLabelY}>Outcome (Final Grade) ↑</div>
            <div className={styles.axisLabelX}>Effort (Time on Task, Attempts, Practice) →</div>

            {/* Grid percentage markers */}
            <div style={{ position: 'absolute', left: 4, bottom: 4, fontSize: '0.65rem', color: '#94a3b8' }}>0%</div>
            <div style={{ position: 'absolute', left: '25%', bottom: 4, fontSize: '0.65rem', color: '#94a3b8' }}>25%</div>
            <div style={{ position: 'absolute', left: '50%', bottom: 4, fontSize: '0.65rem', color: '#94a3b8' }}>50%</div>
            <div style={{ position: 'absolute', left: '75%', bottom: 4, fontSize: '0.65rem', color: '#94a3b8' }}>75%</div>
            <div style={{ position: 'absolute', left: '94%', bottom: 4, fontSize: '0.65rem', color: '#94a3b8' }}>100%</div>

            <div style={{ position: 'absolute', left: 4, bottom: '25%', fontSize: '0.65rem', color: '#94a3b8' }}>25%</div>
            <div style={{ position: 'absolute', left: 4, bottom: '50%', fontSize: '0.65rem', color: '#94a3b8' }}>50%</div>
            <div style={{ position: 'absolute', left: 4, bottom: '75%', fontSize: '0.65rem', color: '#94a3b8' }}>75%</div>
            <div style={{ position: 'absolute', left: 4, top: 4, fontSize: '0.65rem', color: '#94a3b8' }}>100%</div>

            {/* Interactive Student Dots */}
            {quadrantStudents.map((s, idx) => {
              const xPct = Math.max(5, Math.min(95, s.effort));
              const yPct = Math.max(5, Math.min(95, 100 - s.outcome));
              const dotColor =
                s.quadrant === 'thriving'
                  ? '#10b981'
                  : s.quadrant === 'grinding'
                  ? '#f59e0b'
                  : s.quadrant === 'disengaged'
                  ? '#ef4444'
                  : '#3b82f6';

              const isMatchHover = hoveredStudentId === s.student_id;
              const isMatchQuadrant = !selectedQuadrant || s.quadrant === selectedQuadrant;

              return (
                <div
                  key={s.student_id || idx}
                  className={`${styles.scatterDotInteractive} ${
                    isMatchHover ? styles.scatterDotHighlighted : ''
                  }`}
                  style={{
                    left: `${xPct}%`,
                    top: `${yPct}%`,
                    background: dotColor,
                    opacity: isMatchQuadrant ? 1 : 0.25,
                    border: '1.5px solid #ffffff',
                  }}
                  onMouseEnter={() => {
                    setHoveredScatterStudent(s);
                    setHoveredStudentId(s.student_id);
                  }}
                  onMouseLeave={() => {
                    setHoveredScatterStudent(null);
                    setHoveredStudentId(null);
                  }}
                  onClick={() => onSelectStudent(s.student_id)}
                />
              );
            })}

            {/* Floating Student Hover Tooltip Card */}
            {hoveredScatterStudent && (
              <div
                className={styles.scatterTooltipCard}
                style={{
                  left: `${Math.max(12, Math.min(88, hoveredScatterStudent.effort))}%`,
                  top: `${Math.max(18, Math.min(80, 100 - hoveredScatterStudent.outcome))}%`,
                  transform: 'translate(-50%, -120%)',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#ffffff' }}>
                  {hoveredScatterStudent.student_name}
                </div>
                <div style={{ color: '#94a3b8', fontSize: '0.675rem' }}>
                  Roll: {hoveredScatterStudent.roll_number}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    margin: '4px 0',
                    borderTop: '1px solid #334155',
                    paddingTop: 4,
                  }}
                >
                  <span>Effort: <strong style={{ color: '#38bdf8' }}>{hoveredScatterStudent.effort}%</strong></span>
                  <span>Outcome: <strong style={{ color: '#a78bfa' }}>{hoveredScatterStudent.outcome}%</strong></span>
                </div>
                <div style={{ textTransform: 'capitalize', color: '#10b981', fontWeight: 600 }}>
                  Quadrant: {hoveredScatterStudent.quadrant}
                </div>
                <div style={{ marginTop: 2, fontSize: '0.625rem', color: '#cbd5e1', fontStyle: 'italic' }}>
                  Click point to open Student 360 profile ↗
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Class Quality Distribution (Interactive Donut & Breakdown Table) */}
        <div className={styles.panelCard}>
          <div className={styles.cardHeader}>
            <div className={styles.cardHeaderLeft}>
              <div className={styles.cardIconBox} style={{ background: '#f5f3ff', color: '#8b5cf6' }}>
                <PieIcon size={18} />
              </div>
              <div>
                <h3 className={styles.cardTitle}>Class Quality Distribution</h3>
                <div className={styles.cardSubtitle}>Aggregated submissions across active experiments</div>
              </div>
            </div>
          </div>

          <div className={styles.qualityTableWrapper} style={{ marginTop: 12 }}>
            {/* Interactive Donut */}
            <div className={styles.donutWrapper} style={{ width: 130, height: 130 }}>
              <ResponsiveContainer width={130} height={130}>
                <PieChart>
                  <Pie
                    data={qualityBreakdown}
                    innerRadius={42}
                    outerRadius={62}
                    paddingAngle={3}
                    dataKey="count"
                    onMouseEnter={(entry) => setHoveredQualityGrade(entry.grade.split(' ')[0])}
                    onMouseLeave={() => setHoveredQualityGrade(null)}
                    style={{ cursor: 'pointer' }}
                  >
                    {qualityBreakdown.map((entry, index) => {
                      const isHovered = hoveredQualityGrade === entry.grade.split(' ')[0];
                      return (
                        <Cell
                          key={`quality-cell-${index}`}
                          fill={entry.color}
                          stroke={isHovered ? '#0f172a' : 'transparent'}
                          strokeWidth={isHovered ? 2 : 0}
                          style={{
                            transform: isHovered ? 'scale(1.06)' : 'scale(1)',
                            transformOrigin: 'center center',
                            transition: 'transform 0.15s ease',
                          }}
                        />
                      );
                    })}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              {/* Dynamic Center Label */}
              <div className={styles.donutCenterLabel}>
                <span className={styles.donutCenterValue} style={{ fontSize: '1.2rem' }}>
                  {activeQualityDetails.value}
                </span>
                <span className={styles.donutCenterSub}>{activeQualityDetails.label}</span>
              </div>
            </div>

            {/* Breakdown Table with Hover & Click Interactions */}
            <div className={styles.qualityTable}>
              {qualityBreakdown.map((row) => {
                const gradeLetter = row.grade.split(' ')[0];
                const isHovered = hoveredQualityGrade === gradeLetter;
                const isSelected = selectedQualityGrade === gradeLetter;
                return (
                  <div
                    key={row.grade}
                    onMouseEnter={() => setHoveredQualityGrade(gradeLetter)}
                    onMouseLeave={() => setHoveredQualityGrade(null)}
                    onClick={() =>
                      setSelectedQualityGrade((prev) => (prev === gradeLetter ? null : gradeLetter))
                    }
                    className={`${styles.qualityRowInteractive} ${
                      isSelected ? styles.qualityRowInteractiveActive : ''
                    }`}
                    style={{
                      background: isHovered ? '#f1f5f9' : undefined,
                    }}
                    title={`Click to inspect ${row.grade} submissions`}
                  >
                    <div className={styles.qualityRowLabel}>
                      <span className={styles.legendDot} style={{ background: row.color }} />
                      <span style={{ fontWeight: isSelected ? 700 : 500 }}>{row.grade}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <span className={styles.qualityCount}>{row.count}</span>
                      <span className={styles.qualityPct}>{row.percentage}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={styles.cardFooterNote}>
            Data updated 4 min ago • Metrics with limited samples are marked ⓘ
          </div>
        </div>
      </div>
    </div>
  );
}
