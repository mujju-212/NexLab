'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  GraduationCap,
  BookOpen,
  FlaskConical,
  CalendarCheck,
  Trophy,
  TrendingUp,
  BarChart3,
  Sparkles,
  Calendar,
  ShieldCheck,
  AlertTriangle,
  Clock,
  FileText,
  CheckCircle2,
  ChevronDown,
  ArrowUp,
  ArrowRight,
  Filter,
  X,
} from 'lucide-react';
import { studentAnalyticsService, type AcademicDashboardResponse } from '@/services/student-analytics.service';
import styles from './AcademicDashboard.module.css';

interface AcademicTabProps {
  initialSubjectId?: string | null;
  selectedSubjectId?: string | null;
  onSubjectChange?: (subjectId: string | null) => void;
  onNavigateTab?: (tab: string) => void;
  subjects?: any[];
  mastery?: any;
  trends?: any;
  forecast?: any;
  standing?: any;
  attendance?: any;
  academicRanks?: any;
  dateRange?: string;
}

export const AcademicTab: React.FC<AcademicTabProps> = ({
  initialSubjectId,
  selectedSubjectId,
  onSubjectChange,
  onNavigateTab,
  subjects,
  mastery,
  trends,
  forecast,
  standing,
  attendance,
  academicRanks,
  dateRange,
}) => {
  const router = useRouter();

  // ── State for Interactive Controls & Dropdowns ─────────────────────────────
  const effectiveSubjectId = selectedSubjectId || initialSubjectId || 'all';
  const [selectedSubject, setSelectedSubject] = useState<string>(effectiveSubjectId);
  const [selectedSemester, setSelectedSemester] = useState<string>('all');
  const [selectedExperiment, setSelectedExperiment] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('30d');
  const [trendWindow, setTrendWindow] = useState<string>('12w');

  // Synchronize with top global date filter
  useEffect(() => {
    if (dateRange) {
      const mapped = dateRange === 'semester' ? 'semester' : dateRange === 'all' ? 'all' : `${dateRange}d`;
      setSelectedPeriod(mapped);
    }
  }, [dateRange]);

  // Open dropdown toggles
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Hovered state for multi-line trend chart (null by default so tooltip only shows on hover)
  const [hoveredWeekIndex, setHoveredWeekIndex] = useState<number | null>(null);
  const [activeLegendFilter, setActiveLegendFilter] = useState<string | null>(null);

  // Attendance Donut interactive hover state
  const [hoveredAttendance, setHoveredAttendance] = useState<'present' | 'absent' | 'excused' | null>(null);

  // Recent Grades Modal state
  const [isGradesModalOpen, setIsGradesModalOpen] = useState(false);
  const [gradesFilterSubject, setGradesFilterSubject] = useState<string>('all');

  // Card-Level Dropdowns & Modals
  const [conceptLimit, setConceptLimit] = useState<number | 'all'>(8);
  const [isConceptModalOpen, setIsConceptModalOpen] = useState(false);
  const [conceptModalSubject, setConceptModalSubject] = useState<string>('all');
  const [attendanceMonth, setAttendanceMonth] = useState<string>('this_month');
  const [completionFilterSubject, setCompletionFilterSubject] = useState<string>('all');

  // ── TanStack Query to Fetch Real Backend Academic Analytics ────────────────
  const { data: dashboardData, isLoading } = useQuery<AcademicDashboardResponse>({
    queryKey: ['student-academic-dashboard', selectedSubject, selectedSemester, selectedExperiment, selectedPeriod],
    queryFn: () =>
      studentAnalyticsService.getAcademicDashboard({
        subject_id: selectedSubject !== 'all' ? selectedSubject : undefined,
        semester: selectedSemester !== 'all' ? selectedSemester : undefined,
        experiment_id: selectedExperiment !== 'all' ? selectedExperiment : undefined,
        period: selectedPeriod,
      }),
    staleTime: 60 * 1000,
  });

  // Fallback defaults matching exact screenshot mockup
  const kpis = dashboardData?.kpi_metrics || {
    overall_score: 78,
    overall_delta: 6,
    sparkline_overall: [68, 70, 72, 71, 74, 75, 78],
    subjects_enrolled: 5,
    subjects_on_track: 3,
    subjects_ring_pct: 60,
    experiments_completed: 18,
    experiments_total: 24,
    experiments_completion_pct: 75,
    attendance_rate: 92,
    attendance_period: 'This month',
    attendance_mini_bars: [70, 100, 100, 60, 100, 100, 90, 100, 95],
    academic_rank: '#42 / 480',
    rank_position: 42,
    rank_cohort: 480,
    rank_delta: '+5',
    rank_percentile_text: 'Top 9% in Institute',
    sparkline_rank: [48, 47, 45, 46, 44, 43, 42],
  };

  const performanceTrend = dashboardData?.performance_trend || {
    weeks: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W10', 'W11', 'W12'],
    overall: [58, 62, 65, 68, 66, 70, 74, 78, 76, 75, 77, 80],
    subjects: [
      { code: 'DSA', name: 'DSA', color: '#2563eb', data: [60, 64, 68, 72, 70, 75, 79, 82, 80, 81, 83, 85] },
      { code: 'DBMS', name: 'DBMS', color: '#0d9488', data: [56, 59, 63, 66, 68, 70, 73, 75, 74, 76, 78, 80] },
      { code: 'CN', name: 'CN', color: '#f59e0b', data: [52, 54, 58, 61, 63, 65, 66, 68, 67, 69, 70, 72] },
      { code: 'OS', name: 'OS', color: '#ef4444', data: [48, 52, 56, 59, 63, 67, 70, 72, 71, 73, 74, 76] },
      { code: 'SE', name: 'SE', color: '#d946ef', data: [45, 48, 52, 56, 59, 63, 66, 70, 68, 69, 70, 71] },
    ],
  };

  const subjectPerformance = dashboardData?.subject_performance || [
    { code: 'DSA', name: 'DSA', full_name: 'Data Structures & Algorithms', avg_grade: 82, completed: 20, total: 24, completion_pct: 83, trend_pct: 83, sparkline: [72, 75, 78, 80, 81, 82], color: '#2563eb', bg: '#eff6ff', badge_bg: '#dbeafe', text_color: '#1d4ed8' },
    { code: 'DBMS', name: 'DBMS', full_name: 'Database Management Systems', avg_grade: 78, completed: 18, total: 24, completion_pct: 75, trend_pct: 75, sparkline: [68, 70, 72, 75, 76, 78], color: '#0d9488', bg: '#f0fdfa', badge_bg: '#ccfbf1', text_color: '#0f766e' },
    { code: 'CN', name: 'Computer Networks', full_name: 'Computer Networks', avg_grade: 72, completed: 16, total: 24, completion_pct: 67, trend_pct: 67, sparkline: [62, 64, 66, 68, 70, 72], color: '#f59e0b', bg: '#fffbeb', badge_bg: '#fef3c7', text_color: '#b45309' },
    { code: 'OS', name: 'Operating Systems', full_name: 'Operating Systems', avg_grade: 76, completed: 18, total: 24, completion_pct: 75, trend_pct: 75, sparkline: [65, 68, 70, 72, 74, 76], color: '#ef4444', bg: '#fef2f2', badge_bg: '#fee2e2', text_color: '#b91c1c' },
    { code: 'SE', name: 'Software Engineering', full_name: 'Software Engineering', avg_grade: 69, completed: 14, total: 24, completion_pct: 58, trend_pct: 58, sparkline: [58, 60, 62, 65, 67, 69], color: '#d946ef', bg: '#fdf4ff', badge_bg: '#fae8ff', text_color: '#a21caf' },
  ];

  const conceptMastery = dashboardData?.concept_mastery || [
    { concept: 'Arrays & Lists', subject: 'DSA', mastery: 92, color: '#0d9488' },
    { concept: 'Tree Algorithms', subject: 'DSA', mastery: 85, color: '#10b981' },
    { concept: 'SQL & Relational Algebra', subject: 'DBMS', mastery: 78, color: '#10b981' },
    { concept: 'Computer Networks Basics', subject: 'CN', mastery: 72, color: '#f59e0b' },
    { concept: 'Process Scheduling', subject: 'OS', mastery: 68, color: '#f59e0b' },
    { concept: 'Software Design Principles', subject: 'SE', mastery: 64, color: '#f97316' },
    { concept: 'Normalization', subject: 'DBMS', mastery: 60, color: '#f97316' },
    { concept: 'Dynamic Programming', subject: 'DSA', mastery: 56, color: '#ef4444' },
  ];

  const attendanceDonut = dashboardData?.attendance_breakdown || {
    rate: 92,
    present: 22,
    absent: 1,
    excused: 1,
    total: 24,
    period_label: 'This Month',
  };

  const riskGuidance = dashboardData?.risk_and_guidance || {
    status: 'On Track',
    status_color: 'green',
    subtitle: 'No major risk indicators. Keep your current momentum!',
    items: [
      { id: 'g1', title: 'Good progress in DSA', description: 'Keep practicing advanced problems', type: 'success' as const, icon: 'shield-check' },
      { id: 'g2', title: 'Improve Software Engineering', description: 'Lagging behind in experiment completion', type: 'warning' as const, icon: 'alert-triangle' },
      { id: 'g3', title: 'Be consistent in submissions', description: '2 late submissions this month', type: 'info' as const, icon: 'clock' },
    ],
  };

  const recentGrades = dashboardData?.recent_grades || [
    { id: 'exp-8', exp_title: 'Exp 8: Trees', subject: 'DSA', auto: '22/25', manual: '18/20', viva: '9/10', final: '87%', final_num: 87, status: 'Graded', status_type: 'graded' as const, date: 'Oct 14' },
    { id: 'exp-7', exp_title: 'Exp 7: SQL Queries', subject: 'DBMS', auto: '20/25', manual: '16/20', viva: '8/10', final: '78%', final_num: 78, status: 'Graded', status_type: 'graded' as const, date: 'Oct 12' },
    { id: 'exp-6', exp_title: 'Exp 6: Routing Basics', subject: 'CN', auto: '18/25', manual: '15/20', viva: '7/10', final: '72%', final_num: 72, status: 'Graded', status_type: 'graded' as const, date: 'Oct 10' },
    { id: 'exp-5', exp_title: 'Exp 5: Process Scheduling', subject: 'OS', auto: '17/25', manual: '15/20', viva: '8/10', final: '76%', final_num: 76, status: 'Graded', status_type: 'graded' as const, date: 'Oct 08' },
    { id: 'exp-4', exp_title: 'Exp 4: UML Modeling', subject: 'SE', auto: '19/25', manual: '14/20', viva: '6/10', final: '69%', final_num: 69, status: 'Needs Review', status_type: 'review' as const, date: 'Oct 05' },
  ];

  const completionProgress = dashboardData?.completion_progress || subjectPerformance;

  // Filtered views if subject is chosen
  const filteredRecentGrades = useMemo(() => {
    if (selectedSubject === 'all') return recentGrades;
    return recentGrades.filter(
      (g) => g.subject.toLowerCase() === selectedSubject.toLowerCase()
    );
  }, [recentGrades, selectedSubject]);

  const filteredConcepts = useMemo(() => {
    if (selectedSubject === 'all') return conceptMastery;
    return conceptMastery.filter(
      (c) => c.subject.toLowerCase() === selectedSubject.toLowerCase()
    );
  }, [conceptMastery, selectedSubject]);

  // Handle dropdown selection
  const handleSelectSubject = (id: string) => {
    setSelectedSubject(id);
    setOpenDropdown(null);
    if (onSubjectChange) onSubjectChange(id === 'all' ? null : id);
  };

  const getSubjectLabel = (id: string) => {
    if (id === 'all') return 'All Subjects';
    const found = subjectPerformance.find((s) => s.code.toLowerCase() === id.toLowerCase());
    return found ? found.name : id.toUpperCase();
  };

  // Sparkline SVG generator
  const renderSparkline = (
    points: number[],
    color = '#8b5cf6',
    width = 76,
    height = 24,
    fillGradient = true
  ) => {
    if (!points || points.length === 0) return null;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = Math.max(1, max - min);

    const coords = points.map((val, idx) => {
      const x = (idx / (points.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 6) - 3;
      return `${x},${y}`;
    });

    const pathD = `M ${coords.join(' L ')}`;
    const areaD = `${pathD} L ${width},${height} L 0,${height} Z`;
    const gradId = `sparkGrad-${color.replace('#', '')}`;

    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
        {fillGradient && (
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </linearGradient>
          </defs>
        )}
        {fillGradient && <path d={areaD} fill={`url(#${gradId})`} />}
        <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  };

  // Donut SVG generator
  const renderDonut = () => {
    const size = 130;
    const strokeWidth = 13;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    const presentPct = attendanceDonut.present / Math.max(1, attendanceDonut.total);
    const absentPct = attendanceDonut.absent / Math.max(1, attendanceDonut.total);
    const excusedPct = attendanceDonut.excused / Math.max(1, attendanceDonut.total);

    const presentStroke = presentPct * circumference;
    const absentStroke = absentPct * circumference;
    const excusedStroke = excusedPct * circumference;

    const presentOffset = circumference * 0.25;
    const absentOffset = presentOffset - presentStroke;
    const excusedOffset = absentOffset - absentStroke;

    return (
      <div className={styles.donutContainer}>
        <svg className={styles.donutSvg} viewBox={`0 0 ${size} ${size}`}>
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#f1f5f9"
            strokeWidth={strokeWidth}
          />
          {/* Present segment (green) */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#10b981"
            strokeWidth={hoveredAttendance === 'present' ? 16 : strokeWidth}
            strokeDasharray={`${presentStroke} ${circumference}`}
            strokeDashoffset={presentOffset}
            strokeLinecap="round"
            style={{
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              opacity: hoveredAttendance && hoveredAttendance !== 'present' ? 0.45 : 1,
              filter: hoveredAttendance === 'present' ? 'drop-shadow(0 0 6px rgba(16, 185, 129, 0.4))' : 'none',
            }}
            onMouseEnter={() => setHoveredAttendance('present')}
            onMouseLeave={() => setHoveredAttendance(null)}
          />
          {/* Absent segment (red) */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#ef4444"
            strokeWidth={hoveredAttendance === 'absent' ? 16 : strokeWidth}
            strokeDasharray={`${absentStroke} ${circumference}`}
            strokeDashoffset={absentOffset}
            style={{
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              opacity: hoveredAttendance && hoveredAttendance !== 'absent' ? 0.45 : 1,
              filter: hoveredAttendance === 'absent' ? 'drop-shadow(0 0 6px rgba(239, 68, 68, 0.4))' : 'none',
            }}
            onMouseEnter={() => setHoveredAttendance('absent')}
            onMouseLeave={() => setHoveredAttendance(null)}
          />
          {/* Excused segment (amber) */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={hoveredAttendance === 'excused' ? 16 : strokeWidth}
            strokeDasharray={`${excusedStroke} ${circumference}`}
            strokeDashoffset={excusedOffset}
            style={{
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              opacity: hoveredAttendance && hoveredAttendance !== 'excused' ? 0.45 : 1,
              filter: hoveredAttendance === 'excused' ? 'drop-shadow(0 0 6px rgba(245, 158, 11, 0.4))' : 'none',
            }}
            onMouseEnter={() => setHoveredAttendance('excused')}
            onMouseLeave={() => setHoveredAttendance(null)}
          />
        </svg>

        <div className={styles.donutCenterText}>
          {hoveredAttendance === 'present' ? (
            <>
              <div className={styles.donutRateBig} style={{ color: '#10b981' }}>{attendanceDonut.present}</div>
              <div className={styles.donutRateLabel}>Present ({attendanceDonut.rate}%)</div>
            </>
          ) : hoveredAttendance === 'absent' ? (
            <>
              <div className={styles.donutRateBig} style={{ color: '#ef4444' }}>{attendanceDonut.absent}</div>
              <div className={styles.donutRateLabel}>Absent ({Math.round(absentPct * 100)}%)</div>
            </>
          ) : hoveredAttendance === 'excused' ? (
            <>
              <div className={styles.donutRateBig} style={{ color: '#f59e0b' }}>{attendanceDonut.excused}</div>
              <div className={styles.donutRateLabel}>Excused ({Math.round(excusedPct * 100)}%)</div>
            </>
          ) : (
            <>
              <div className={styles.donutRateBig}>{attendanceDonut.rate}%</div>
              <div className={styles.donutRateLabel}>Present</div>
            </>
          )}
        </div>
      </div>
    );
  };

  // ── Multi-Line Trend Chart SVG Renderer ─────────────────────────────────────
  const renderMultiLineChart = () => {
    const svgWidth = 620;
    const svgHeight = 210;
    const padLeft = 40;
    const padRight = 20;
    const padTop = 15;
    const padBottom = 25;

    const plotWidth = svgWidth - padLeft - padRight;
    const plotHeight = svgHeight - padTop - padBottom;

    // Respect active trend window ('12w' vs '8w')
    const rawWeeks = performanceTrend.weeks;
    const sliceCount = trendWindow === '8w' ? 8 : rawWeeks.length;
    const weeks = rawWeeks.slice(-sliceCount);
    const overallSeries = performanceTrend.overall.slice(-sliceCount);

    const getX = (idx: number) => padLeft + (idx / Math.max(1, weeks.length - 1)) * plotWidth;
    const getY = (val: number) => padTop + plotHeight - (val / 100) * plotHeight;

    // Active hovered week index
    const activeIdx = hoveredWeekIndex !== null && hoveredWeekIndex < weeks.length ? hoveredWeekIndex : null;
    const hoveredX = activeIdx !== null ? getX(activeIdx) : 0;

    // Filter series if legend is clicked & slice to trend window
    const visibleSubjects = (activeLegendFilter
      ? performanceTrend.subjects.filter((s) => s.code === activeLegendFilter)
      : performanceTrend.subjects
    ).map((s) => ({
      ...s,
      data: s.data.slice(-sliceCount),
    }));

    const showOverall = !activeLegendFilter || activeLegendFilter === 'overall';

    // Tooltip data for active hovered week
    const weekLabel = activeIdx !== null ? weeks[activeIdx] : null;
    const overallVal = activeIdx !== null ? overallSeries[activeIdx] : null;

    return (
      <div className={styles.chartContainer} onMouseLeave={() => setHoveredWeekIndex(null)}>
        <svg
          className={styles.chartSvg}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          preserveAspectRatio="none"
        >
          {/* Y-Axis Horizontal Grid Lines & Labels */}
          {[100, 75, 50, 25, 0].map((val) => {
            const y = getY(val);
            return (
              <g key={val}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={svgWidth - padRight}
                  y2={y}
                  className={styles.chartGridLine}
                />
                <text x={padLeft - 10} y={y + 4} textAnchor="end" className={styles.chartAxisText}>
                  {val}
                </text>
              </g>
            );
          })}

          {/* X-Axis Vertical dashed guidelines & week labels */}
          {weeks.map((w, idx) => {
            const x = getX(idx);
            return (
              <text
                key={w}
                x={x}
                y={svgHeight - 6}
                textAnchor="middle"
                className={styles.chartAxisText}
                style={{ fontWeight: idx === activeIdx ? 700 : 500, fill: idx === activeIdx ? '#0f172a' : '#94a3b8' }}
              >
                {w}
              </text>
            );
          })}

          {/* Vertical Hover Guide Line (Only shown on active hover) */}
          {activeIdx !== null && (
            <line
              x1={hoveredX}
              y1={padTop}
              x2={hoveredX}
              y2={padTop + plotHeight}
              stroke="#94a3b8"
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
          )}

          {/* Subject Curves */}
          {visibleSubjects.map((s, sIdx) => {
            const pts = s.data.map((val, idx) => `${getX(idx)},${getY(val)}`);
            const pathD = `M ${pts.join(' L ')}`;
            return (
              <g key={`subject-curve-${s.code}-${sIdx}`}>
                <path
                  d={pathD}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={activeLegendFilter && activeLegendFilter !== s.code ? 0.2 : 0.85}
                />
                {/* Dots on each week */}
                {s.data.map((val, idx) => (
                  <circle
                    key={`dot-${s.code}-${sIdx}-${idx}`}
                    cx={getX(idx)}
                    cy={getY(val)}
                    r={idx === activeIdx ? 4.5 : 2.5}
                    fill={s.color}
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                ))}
              </g>
            );
          })}

          {/* Overall Trend Curve (Thicker Purple) */}
          {showOverall && (
            <g>
              <path
                d={`M ${overallSeries.map((val, idx) => `${getX(idx)},${getY(val)}`).join(' L ')}`}
                fill="none"
                stroke="#7c3aed"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {overallSeries.map((val, idx) => (
                <circle
                  key={`overall-${idx}`}
                  cx={getX(idx)}
                  cy={getY(val)}
                  r={idx === activeIdx ? 5.5 : 3}
                  fill="#7c3aed"
                  stroke="#ffffff"
                  strokeWidth="2"
                />
              ))}
            </g>
          )}

          {/* Invisible interactive vertical hitboxes for smooth hover */}
          {weeks.map((_, idx) => {
            const x = getX(idx);
            const colWidth = plotWidth / (weeks.length - 1);
            return (
              <rect
                key={`hit-${idx}`}
                x={x - colWidth / 2}
                y={padTop}
                width={colWidth}
                height={plotHeight}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredWeekIndex(idx)}
              />
            );
          })}
        </svg>

        {/* Hover Tooltip (Only displayed when actively hovering over a week) */}
        {activeIdx !== null && weekLabel && (
          <div
            className={styles.chartTooltip}
            style={{
              left: `${(hoveredX / svgWidth) * 100}%`,
              top: '40%',
            }}
          >
            <div className={styles.tooltipTitle}>{`Week ${weekLabel.replace('W', '')}`}</div>
            <div className={styles.tooltipRow}>
              <span>
                <span className={styles.tooltipDot} style={{ background: '#7c3aed' }} /> Overall:
              </span>
              <span className={styles.tooltipValue}>{overallVal}%</span>
            </div>
            {performanceTrend.subjects.map((s, sIdx) => (
              <div key={`tooltip-${s.code}-${sIdx}`} className={styles.tooltipRow}>
                <span>
                  <span className={styles.tooltipDot} style={{ background: s.color }} /> {s.code}:
                </span>
                <span className={styles.tooltipValue}>{s.data[activeIdx]}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.dashboard}>
      {/* ── 1. Academic Filter Controls Strip ───────────────────────────────── */}
      <div className={styles.filterBar}>
        {/* Subject Filter Dropdown */}
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Subject:</span>
          <button
            className={`${styles.filterBtn} ${selectedSubject !== 'all' ? styles.filterBtnActive : ''}`}
            onClick={() => setOpenDropdown(openDropdown === 'subject' ? null : 'subject')}
          >
            <span>{getSubjectLabel(selectedSubject)}</span>
            <ChevronDown size={14} />
          </button>
          {openDropdown === 'subject' && (
            <ul className={styles.dropdownMenu}>
              <li
                className={`${styles.dropdownItem} ${selectedSubject === 'all' ? styles.dropdownItemActive : ''}`}
                onClick={() => handleSelectSubject('all')}
              >
                All Subjects
              </li>
              {subjectPerformance.map((s, sIdx) => (
                <li
                  key={`dropdown-${(s as any).id || s.code}-${sIdx}`}
                  className={`${styles.dropdownItem} ${selectedSubject.toLowerCase() === s.code.toLowerCase() ? styles.dropdownItemActive : ''}`}
                  onClick={() => handleSelectSubject(s.code.toLowerCase())}
                >
                  <span>{s.name}</span>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{s.avg_grade}%</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Semester Filter Dropdown */}
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Semester:</span>
          <button
            className={`${styles.filterBtn} ${selectedSemester !== 'all' ? styles.filterBtnActive : ''}`}
            onClick={() => setOpenDropdown(openDropdown === 'semester' ? null : 'semester')}
          >
            <span>{selectedSemester === 'all' ? 'All Semesters' : `Semester ${selectedSemester}`}</span>
            <ChevronDown size={14} />
          </button>
          {openDropdown === 'semester' && (
            <ul className={styles.dropdownMenu}>
              <li
                className={`${styles.dropdownItem} ${selectedSemester === 'all' ? styles.dropdownItemActive : ''}`}
                onClick={() => { setSelectedSemester('all'); setOpenDropdown(null); }}
              >
                All Semesters
              </li>
              <li
                className={`${styles.dropdownItem} ${selectedSemester === '3' ? styles.dropdownItemActive : ''}`}
                onClick={() => { setSelectedSemester('3'); setOpenDropdown(null); }}
              >
                Semester 3 (Current)
              </li>
              <li
                className={`${styles.dropdownItem} ${selectedSemester === '4' ? styles.dropdownItemActive : ''}`}
                onClick={() => { setSelectedSemester('4'); setOpenDropdown(null); }}
              >
                Semester 4
              </li>
            </ul>
          )}
        </div>

        {/* Experiment Filter Dropdown */}
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Experiment:</span>
          <button
            className={`${styles.filterBtn} ${selectedExperiment !== 'all' ? styles.filterBtnActive : ''}`}
            onClick={() => setOpenDropdown(openDropdown === 'experiment' ? null : 'experiment')}
          >
            <span>{selectedExperiment === 'all' ? 'All Experiments' : selectedExperiment}</span>
            <ChevronDown size={14} />
          </button>
          {openDropdown === 'experiment' && (
            <ul className={styles.dropdownMenu}>
              <li
                className={`${styles.dropdownItem} ${selectedExperiment === 'all' ? styles.dropdownItemActive : ''}`}
                onClick={() => { setSelectedExperiment('all'); setOpenDropdown(null); }}
              >
                All Experiments
              </li>
              {recentGrades.map((g) => (
                <li
                  key={g.id}
                  className={`${styles.dropdownItem} ${selectedExperiment === g.exp_title ? styles.dropdownItemActive : ''}`}
                  onClick={() => { setSelectedExperiment(g.exp_title); setOpenDropdown(null); }}
                >
                  {g.exp_title}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Date Range Filter Dropdown */}
        <div className={styles.filterGroup} style={{ marginLeft: 'auto' }}>
          <button
            className={styles.filterBtn}
            onClick={() => setOpenDropdown(openDropdown === 'period' ? null : 'period')}
          >
            <Calendar size={14} color="#64748b" />
            <span>
              {selectedPeriod === '30d' || selectedPeriod === '30'
                ? 'Last 30 Days'
                : selectedPeriod === '60d' || selectedPeriod === '60'
                ? 'Last 60 Days'
                : selectedPeriod === '90d' || selectedPeriod === '90' || selectedPeriod === '12w'
                ? 'Last 90 Days'
                : selectedPeriod === 'semester'
                ? 'This Semester'
                : selectedPeriod === 'all'
                ? 'All Time'
                : 'Last 30 Days'}
            </span>
            <ChevronDown size={14} />
          </button>
          {openDropdown === 'period' && (
            <ul className={styles.dropdownMenu} style={{ right: 0, left: 'auto' }}>
              <li
                className={`${styles.dropdownItem} ${selectedPeriod === '30d' ? styles.dropdownItemActive : ''}`}
                onClick={() => { setSelectedPeriod('30d'); setOpenDropdown(null); }}
              >
                Last 30 Days
              </li>
              <li
                className={`${styles.dropdownItem} ${selectedPeriod === '60d' ? styles.dropdownItemActive : ''}`}
                onClick={() => { setSelectedPeriod('60d'); setOpenDropdown(null); }}
              >
                Last 60 Days
              </li>
              <li
                className={`${styles.dropdownItem} ${selectedPeriod === '90d' || selectedPeriod === '12w' ? styles.dropdownItemActive : ''}`}
                onClick={() => { setSelectedPeriod('90d'); setOpenDropdown(null); }}
              >
                Last 90 Days
              </li>
              <li
                className={`${styles.dropdownItem} ${selectedPeriod === 'semester' ? styles.dropdownItemActive : ''}`}
                onClick={() => { setSelectedPeriod('semester'); setOpenDropdown(null); }}
              >
                This Semester
              </li>
              <li
                className={`${styles.dropdownItem} ${selectedPeriod === 'all' ? styles.dropdownItemActive : ''}`}
                onClick={() => { setSelectedPeriod('all'); setOpenDropdown(null); }}
              >
                All Time
              </li>
            </ul>
          )}
        </div>
      </div>

      {/* ── 2. Top 5 KPI Summary Cards ──────────────────────────────────────── */}
      <div className={styles.kpiGrid}>
        {/* Card 1: Overall Academic Score */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiTop}>
            <div className={styles.kpiIconBox} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
              <GraduationCap size={18} />
            </div>
            <div>
              <p className={styles.kpiTitle}>Overall Academic Score</p>
              <div className={styles.kpiValueRow}>
                <span className={styles.kpiValue}>{kpis.overall_score}%</span>
                <span className={styles.kpiBadge}>
                  <ArrowUp size={10} /> +{kpis.overall_delta}%
                </span>
              </div>
            </div>
          </div>
          <div className={styles.kpiBottomRow}>
            <span className={styles.kpiSubtext}>Average across all subjects</span>
            <div className={styles.sparklineWrap}>
              {renderSparkline(kpis.sparkline_overall, '#8b5cf6', 76, 22, true)}
            </div>
          </div>
        </div>

        {/* Card 2: Subjects Enrolled */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiTop}>
            <div className={styles.kpiIconBox} style={{ background: '#eef2ff', color: '#4f46e5' }}>
              <BookOpen size={18} />
            </div>
            <div>
              <p className={styles.kpiTitle}>Subjects Enrolled</p>
              <div className={styles.kpiValueRow}>
                <span className={styles.kpiValue}>{kpis.subjects_enrolled}</span>
              </div>
            </div>
          </div>
          <div className={styles.kpiBottomRow}>
            <span className={styles.kpiSubtext}>{kpis.subjects_on_track} on track</span>
            <div className={styles.sparklineWrap}>
              {/* Circular Mini Progress Ring */}
              <svg width="28" height="28" viewBox="0 0 28 28">
                <circle cx="14" cy="14" r="11" fill="none" stroke="#f1f5f9" strokeWidth="3" />
                <circle
                  cx="14"
                  cy="14"
                  r="11"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="3"
                  strokeDasharray={`${(kpis.subjects_ring_pct / 100) * 69} 69`}
                  strokeDashoffset="17"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Card 3: Experiments Completed */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiTop}>
            <div className={styles.kpiIconBox} style={{ background: '#eff6ff', color: '#2563eb' }}>
              <FlaskConical size={18} />
            </div>
            <div>
              <p className={styles.kpiTitle}>Experiments Completed</p>
              <div className={styles.kpiValueRow}>
                <span className={styles.kpiValue}>
                  {kpis.experiments_completed} / {kpis.experiments_total}
                </span>
              </div>
            </div>
          </div>
          <div className={styles.kpiBottomRow} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <span className={styles.kpiSubtext}>{kpis.experiments_completion_pct}% completion</span>
            </div>
            <div style={{ width: '100%', height: '5px', background: '#e2e8f0', borderRadius: '9999px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${kpis.experiments_completion_pct}%`,
                  height: '100%',
                  background: '#2563eb',
                  borderRadius: '9999px',
                  transition: 'width 0.5s ease',
                }}
              />
            </div>
          </div>
        </div>

        {/* Card 4: Attendance */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiTop}>
            <div className={styles.kpiIconBox} style={{ background: '#f0fdf4', color: '#16a34a' }}>
              <CalendarCheck size={18} />
            </div>
            <div>
              <p className={styles.kpiTitle}>Attendance</p>
              <div className={styles.kpiValueRow}>
                <span className={styles.kpiValue}>{kpis.attendance_rate}%</span>
              </div>
            </div>
          </div>
          <div className={styles.kpiBottomRow}>
            <span className={styles.kpiSubtext}>{kpis.attendance_period}</span>
            <div className={styles.sparklineWrap}>
              {/* Mini vertical bar chart */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '22px' }}>
                {kpis.attendance_mini_bars.slice(0, 7).map((height, idx) => (
                  <div
                    key={idx}
                    style={{
                      width: '4px',
                      height: `${(height / 100) * 20 + 2}px`,
                      background: height >= 80 ? '#10b981' : '#f59e0b',
                      borderRadius: '1.5px',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Card 5: Academic Rank */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiTop}>
            <div className={styles.kpiIconBox} style={{ background: '#fffbeb', color: '#d97706' }}>
              <Trophy size={18} />
            </div>
            <div>
              <p className={styles.kpiTitle}>Academic Rank</p>
              <div className={styles.kpiValueRow}>
                <span className={styles.kpiValue}>#{kpis.rank_position}</span>
                <span style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 600 }}>
                  / {kpis.rank_cohort}
                </span>
                <span className={styles.kpiBadge}>
                  <ArrowUp size={10} /> {kpis.rank_delta}
                </span>
              </div>
            </div>
          </div>
          <div className={styles.kpiBottomRow}>
            <span className={styles.kpiSubtext}>{kpis.rank_percentile_text}</span>
            <div className={styles.sparklineWrap}>
              {renderSparkline(kpis.sparkline_rank, '#8b5cf6', 76, 22, true)}
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. Row 2: Trend Multi-Line Chart & Subject Performance ──────────── */}
      <div className={styles.trendRow}>
        {/* Left: Academic Performance Trend Chart */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleWrap}>
              <TrendingUp size={20} className={styles.cardIcon} />
              <div>
                <h3 className={styles.cardTitle}>Academic Performance Trend</h3>
                <p className={styles.cardSubtitle}>Your subject-wise grades and overall trend over time.</p>
              </div>
            </div>

            <div className={styles.filterGroup}>
              <button
                className={styles.filterBtn}
                onClick={() => setOpenDropdown(openDropdown === 'trendWindow' ? null : 'trendWindow')}
              >
                <span>{trendWindow === '12w' ? 'Last 12 Weeks' : 'Last 8 Weeks'}</span>
                <ChevronDown size={14} />
              </button>
              {openDropdown === 'trendWindow' && (
                <ul className={styles.dropdownMenu} style={{ right: 0, left: 'auto' }}>
                  <li
                    className={`${styles.dropdownItem} ${trendWindow === '12w' ? styles.dropdownItemActive : ''}`}
                    onClick={() => { setTrendWindow('12w'); setOpenDropdown(null); }}
                  >
                    Last 12 Weeks
                  </li>
                  <li
                    className={`${styles.dropdownItem} ${trendWindow === '8w' ? styles.dropdownItemActive : ''}`}
                    onClick={() => { setTrendWindow('8w'); setOpenDropdown(null); }}
                  >
                    Last 8 Weeks
                  </li>
                </ul>
              )}
            </div>
          </div>

          {/* Interactive Multi-Line SVG Chart */}
          {renderMultiLineChart()}

          {/* Color Legend (Clickable to isolate subject) */}
          <div className={styles.chartLegend}>
            <div
              className={styles.legendItem}
              onClick={() => setActiveLegendFilter(activeLegendFilter === 'overall' ? null : 'overall')}
              style={{ opacity: activeLegendFilter && activeLegendFilter !== 'overall' ? 0.35 : 1 }}
            >
              <span className={styles.legendDot} style={{ background: '#7c3aed' }} />
              <span>Overall</span>
            </div>
            {performanceTrend.subjects.map((s, sIdx) => (
              <div
                key={`legend-${s.code}-${sIdx}`}
                className={styles.legendItem}
                onClick={() => setActiveLegendFilter(activeLegendFilter === s.code ? null : s.code)}
                style={{ opacity: activeLegendFilter && activeLegendFilter !== s.code ? 0.35 : 1 }}
              >
                <span className={styles.legendDot} style={{ background: s.color }} />
                <span>{s.code}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Subject Performance Table */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleWrap}>
              <BarChart3 size={20} className={styles.cardIcon} />
              <div>
                <h3 className={styles.cardTitle}>Subject Performance</h3>
                <p className={styles.cardSubtitle}>Average grade and completion per subject</p>
              </div>
            </div>

            <div className={styles.filterGroup}>
              <button
                type="button"
                className={styles.filterBtn}
                onClick={() => setOpenDropdown(openDropdown === 'subject_card' ? null : 'subject_card')}
                title="Filter subjects"
              >
                <span>{selectedSubject === 'all' ? 'All Subjects' : getSubjectLabel(selectedSubject)}</span>
                <ChevronDown size={14} />
              </button>
              {openDropdown === 'subject_card' && (
                <ul className={styles.dropdownMenu} style={{ right: 0, left: 'auto', minWidth: '180px' }}>
                  <li
                    className={`${styles.dropdownItem} ${selectedSubject === 'all' ? styles.dropdownItemActive : ''}`}
                    onClick={() => {
                      handleSelectSubject('all');
                      setOpenDropdown(null);
                    }}
                  >
                    All Subjects
                  </li>
                  {subjectPerformance.map((s, sIdx) => (
                    <li
                      key={`card-dropdown-${(s as any).id || s.code}-${sIdx}`}
                      className={`${styles.dropdownItem} ${selectedSubject.toLowerCase() === s.code.toLowerCase() ? styles.dropdownItemActive : ''}`}
                      onClick={() => {
                        handleSelectSubject(s.code.toLowerCase());
                        setOpenDropdown(null);
                      }}
                    >
                      <span>{s.name}</span>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{s.avg_grade}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <table className={styles.subjectTable}>
            <thead>
              <tr>
                <th>Subject</th>
                <th>Avg Grade</th>
                <th>Completion</th>
                <th>Trend</th>
              </tr>
            </thead>
            <tbody>
              {subjectPerformance.map((subj, sIdx) => (
                <tr
                  key={`subj-row-${(subj as any).id || subj.code}-${sIdx}`}
                  style={{
                    cursor: 'pointer',
                    background: selectedSubject.toLowerCase() === subj.code.toLowerCase() ? '#f8fafc' : 'transparent',
                  }}
                  onClick={() => handleSelectSubject(subj.code.toLowerCase())}
                >
                  <td>
                    <div className={styles.subjectCell}>
                      <div
                        className={styles.subjectBadge}
                        style={{ background: subj.badge_bg, color: subj.text_color }}
                      >
                        {subj.code.slice(0, 2)}
                      </div>
                      <span className={styles.subjectName}>{subj.name}</span>
                    </div>
                  </td>
                  <td>
                    <span
                      className={styles.gradeCell}
                      style={{
                        color: subj.avg_grade >= 75 ? '#15803d' : subj.avg_grade >= 60 ? '#b45309' : '#b91c1c',
                      }}
                    >
                      {subj.avg_grade}%
                    </span>
                  </td>
                  <td>
                    <span className={styles.completionCell}>
                      {subj.completed} / {subj.total}
                    </span>
                  </td>
                  <td>
                    <div className={styles.trendCell}>
                      {renderSparkline(subj.sparkline, subj.color, 44, 16, false)}
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#15803d' }}>
                        ↗{subj.trend_pct}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 4. Row 3: Concept Mastery, Attendance Donut, Risk & Guidance ───── */}
      <div className={styles.threeColGrid}>
        {/* Column 1: Concept Mastery (Academic) */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleWrap}>
              <Sparkles size={20} className={styles.cardIcon} />
              <div>
                <h3 className={styles.cardTitle}>Concept Mastery (Academic)</h3>
                <p className={styles.cardSubtitle}>Mastery level for key concepts in your enrolled subjects.</p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div className={styles.filterGroup}>
                <button
                  type="button"
                  className={styles.filterBtn}
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                  onClick={() => setOpenDropdown(openDropdown === 'concept_limit' ? null : 'concept_limit')}
                >
                  <span>{conceptLimit === 'all' ? 'All Concepts' : `Top ${conceptLimit}`}</span>
                  <ChevronDown size={12} />
                </button>
                {openDropdown === 'concept_limit' && (
                  <ul className={styles.dropdownMenu} style={{ right: 0, left: 'auto', minWidth: '130px' }}>
                    {[5, 8, 12, 'all'].map((limitVal) => (
                      <li
                        key={`limit-${limitVal}`}
                        className={`${styles.dropdownItem} ${conceptLimit === limitVal ? styles.dropdownItemActive : ''}`}
                        onClick={() => {
                          setConceptLimit(limitVal as any);
                          setOpenDropdown(null);
                        }}
                      >
                        {limitVal === 'all' ? 'All Concepts' : `Top ${limitVal}`}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                type="button"
                className={styles.cardActionBtn}
                onClick={() => setIsConceptModalOpen(true)}
              >
                <span>View All</span>
                <ArrowRight size={13} />
              </button>
            </div>
          </div>

          <table className={styles.conceptTable}>
            <thead>
              <tr>
                <th>Concept</th>
                <th>Subject</th>
                <th>Mastery</th>
              </tr>
            </thead>
            <tbody>
              {filteredConcepts.slice(0, conceptLimit === 'all' ? filteredConcepts.length : conceptLimit).map((c, cIdx) => (
                <tr key={`concept-${c.concept}-${c.subject}-${cIdx}`}>
                  <td>
                    <span className={styles.conceptName}>{c.concept}</span>
                  </td>
                  <td>
                    <span className={styles.conceptSubjTag}>{c.subject}</span>
                  </td>
                  <td style={{ width: '45%' }}>
                    <div className={styles.conceptBarRow}>
                      <div className={styles.conceptBarTrack}>
                        <div
                          className={styles.conceptBarFill}
                          style={{
                            width: `${c.mastery}%`,
                            background: c.color,
                          }}
                        />
                      </div>
                      <span className={styles.conceptPctText}>{c.mastery}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Column 2: Attendance Donut Chart */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleWrap}>
              <Calendar size={20} className={styles.cardIcon} />
              <h3 className={styles.cardTitle}>Attendance</h3>
            </div>

            <div className={styles.filterGroup}>
              <button
                type="button"
                className={styles.filterBtn}
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                onClick={() => setOpenDropdown(openDropdown === 'attendance_month' ? null : 'attendance_month')}
              >
                <span>
                  {attendanceMonth === 'this_month'
                    ? 'This Month'
                    : attendanceMonth === 'last_month'
                    ? 'Last Month'
                    : attendanceMonth === 'semester'
                    ? 'This Semester'
                    : 'All Time'}
                </span>
                <ChevronDown size={12} />
              </button>
              {openDropdown === 'attendance_month' && (
                <ul className={styles.dropdownMenu} style={{ right: 0, left: 'auto', minWidth: '140px' }}>
                  {[
                    { id: 'this_month', label: 'This Month' },
                    { id: 'last_month', label: 'Last Month' },
                    { id: 'semester', label: 'This Semester' },
                    { id: 'all', label: 'All Time' },
                  ].map((opt) => (
                    <li
                      key={opt.id}
                      className={`${styles.dropdownItem} ${attendanceMonth === opt.id ? styles.dropdownItemActive : ''}`}
                      onClick={() => {
                        setAttendanceMonth(opt.id);
                        setOpenDropdown(null);
                      }}
                    >
                      {opt.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Circular Donut Diagram */}
          {renderDonut()}

          {/* Attendance Breakdown Legend */}
          <div className={styles.donutLegend}>
            <div
              className={styles.donutLegendItem}
              style={{
                cursor: 'pointer',
                padding: '3px 8px',
                borderRadius: '6px',
                background: hoveredAttendance === 'present' ? '#f0fdf4' : 'transparent',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={() => setHoveredAttendance('present')}
              onMouseLeave={() => setHoveredAttendance(null)}
            >
              <span className={styles.donutDot} style={{ background: '#10b981' }} />
              <span>Present</span>
              <span className={styles.donutCount}>{attendanceDonut.present}</span>
            </div>
            <div
              className={styles.donutLegendItem}
              style={{
                cursor: 'pointer',
                padding: '3px 8px',
                borderRadius: '6px',
                background: hoveredAttendance === 'absent' ? '#fef2f2' : 'transparent',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={() => setHoveredAttendance('absent')}
              onMouseLeave={() => setHoveredAttendance(null)}
            >
              <span className={styles.donutDot} style={{ background: '#ef4444' }} />
              <span>Absent</span>
              <span className={styles.donutCount}>{attendanceDonut.absent}</span>
            </div>
            <div
              className={styles.donutLegendItem}
              style={{
                cursor: 'pointer',
                padding: '3px 8px',
                borderRadius: '6px',
                background: hoveredAttendance === 'excused' ? '#fffbeb' : 'transparent',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={() => setHoveredAttendance('excused')}
              onMouseLeave={() => setHoveredAttendance(null)}
            >
              <span className={styles.donutDot} style={{ background: '#f59e0b' }} />
              <span>Excused</span>
              <span className={styles.donutCount}>{attendanceDonut.excused}</span>
            </div>
          </div>

          <div className={styles.donutFooter}>
            {attendanceDonut.total} Total Sessions
          </div>
        </div>

        {/* Column 3: Risk & Guidance */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleWrap}>
              <ShieldCheck size={20} className={styles.cardIcon} />
              <div>
                <h3 className={styles.cardTitle}>Risk & Guidance</h3>
              </div>
            </div>

            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#15803d',
                background: '#dcfce7',
                border: '1px solid #bbf7d0',
                padding: '0.25rem 0.65rem',
                borderRadius: '9999px',
              }}
            >
              <CheckCircle2 size={12} />
              <span>{riskGuidance.status}</span>
            </span>
          </div>

          <p className={styles.cardSubtitle} style={{ marginTop: '-0.75rem', marginBottom: '1rem' }}>
            {riskGuidance.subtitle}
          </p>

          <div className={styles.guidanceList}>
            {riskGuidance.items.map((item) => {
              const isSuccess = item.type === 'success';
              const isWarning = item.type === 'warning';
              const iconBoxBg = isSuccess ? '#dcfce7' : isWarning ? '#fef3c7' : '#e0f2fe';
              const iconColor = isSuccess ? '#15803d' : isWarning ? '#b45309' : '#0284c7';

              return (
                <div key={item.id} className={styles.guidanceItem}>
                  <div className={styles.guidanceIconBox} style={{ background: iconBoxBg, color: iconColor }}>
                    {isSuccess ? (
                      <ShieldCheck size={16} />
                    ) : isWarning ? (
                      <AlertTriangle size={16} />
                    ) : (
                      <Clock size={16} />
                    )}
                  </div>
                  <div>
                    <h4 className={styles.guidanceTitle}>{item.title}</h4>
                    <p className={styles.guidanceDesc}>{item.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── 5. Row 4: Recent Grades & Completion Progress ───────────────────── */}
      <div className={styles.bottomRow}>
        {/* Left: Recent Grades */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleWrap}>
              <FileText size={20} className={styles.cardIcon} />
              <div>
                <h3 className={styles.cardTitle}>Recent Grades</h3>
                <p className={styles.cardSubtitle}>Your latest experiment grades and feedback.</p>
              </div>
            </div>

            <button
              className={styles.cardActionBtn}
              onClick={() => setIsGradesModalOpen(true)}
            >
              <span>View All</span>
              <ArrowRight size={13} />
            </button>
          </div>

          <table className={styles.recentTable}>
            <thead>
              <tr>
                <th>Experiment</th>
                <th>Subject</th>
                <th>Auto</th>
                <th>Manual</th>
                <th>Viva</th>
                <th>Final</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecentGrades.map((g) => (
                <tr key={g.id}>
                  <td style={{ fontWeight: 600, color: '#0f172a' }}>{g.exp_title}</td>
                  <td>
                    <span className={styles.conceptSubjTag}>{g.subject}</span>
                  </td>
                  <td style={{ color: '#475569' }}>{g.auto}</td>
                  <td style={{ color: '#475569' }}>{g.manual}</td>
                  <td style={{ color: '#475569' }}>{g.viva}</td>
                  <td>
                    <span
                      style={{
                        fontWeight: 700,
                        color: g.final_num >= 75 ? '#15803d' : '#b45309',
                      }}
                    >
                      {g.final}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`${styles.statusPill} ${
                        g.status_type === 'graded' ? styles.statusGraded : styles.statusReview
                      }`}
                    >
                      {g.status}
                    </span>
                  </td>
                  <td className={styles.dateCell}>{g.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right: Completion Progress */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleWrap}>
              <CheckCircle2 size={20} className={styles.cardIcon} />
              <div>
                <h3 className={styles.cardTitle}>Completion Progress</h3>
                <p className={styles.cardSubtitle}>Experiments completion per subject</p>
              </div>
            </div>

            <div className={styles.filterGroup}>
              <button
                type="button"
                className={styles.filterBtn}
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                onClick={() => setOpenDropdown(openDropdown === 'completion_subject' ? null : 'completion_subject')}
              >
                <span>{completionFilterSubject === 'all' ? 'All Subjects' : completionFilterSubject}</span>
                <ChevronDown size={12} />
              </button>
              {openDropdown === 'completion_subject' && (
                <ul className={styles.dropdownMenu} style={{ right: 0, left: 'auto', minWidth: '150px' }}>
                  <li
                    className={`${styles.dropdownItem} ${completionFilterSubject === 'all' ? styles.dropdownItemActive : ''}`}
                    onClick={() => {
                      setCompletionFilterSubject('all');
                      setOpenDropdown(null);
                    }}
                  >
                    All Subjects
                  </li>
                  {completionProgress.map((cp, idx) => (
                    <li
                      key={`comp-opt-${cp.code}-${idx}`}
                      className={`${styles.dropdownItem} ${completionFilterSubject.toLowerCase() === cp.code.toLowerCase() ? styles.dropdownItemActive : ''}`}
                      onClick={() => {
                        setCompletionFilterSubject(cp.code);
                        setOpenDropdown(null);
                      }}
                    >
                      {cp.code}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className={styles.completionList}>
            {completionProgress
              .filter((cp) => completionFilterSubject === 'all' || cp.code.toLowerCase() === completionFilterSubject.toLowerCase())
              .map((cp, cpIdx) => (
              <div key={`completion-${(cp as any).id || cp.code}-${cpIdx}`} className={styles.completionRow}>
                <span className={styles.completionSubject}>{cp.code}</span>
                <span className={styles.completionCounts}>
                  {cp.completed} / {cp.total}
                </span>
                <div className={styles.completionBarTrack}>
                  <div
                    className={styles.completionBarFill}
                    style={{
                      width: `${cp.completion_pct}%`,
                      background: cp.color,
                    }}
                  />
                </div>
                <span className={styles.completionPct}>{cp.completion_pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Grades Full Modal */}
      {isGradesModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={() => setIsGradesModalOpen(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '1.25rem',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '840px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid #e2e8f0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1rem',
                borderBottom: '1px solid #f1f5f9',
                paddingBottom: '0.75rem',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                  All Experiment Grades & Feedback
                </h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                  Comprehensive record of your laboratory submissions, automated evaluations, manual grading, and viva scores.
                </p>
              </div>
              <button
                onClick={() => setIsGradesModalOpen(false)}
                style={{
                  border: 'none',
                  background: '#f1f5f9',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#64748b',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Subject Filter Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              {['all', 'DSA', 'DBMS', 'CN', 'OS'].map((sCode, sIdx) => (
                <button
                  key={`filter-tab-${sCode}-${sIdx}`}
                  style={{
                    padding: '0.35rem 0.85rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    background: gradesFilterSubject === sCode ? '#f5f3ff' : '#f8fafc',
                    color: gradesFilterSubject === sCode ? '#7c3aed' : '#64748b',
                    fontWeight: gradesFilterSubject === sCode ? 700 : 500,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                  }}
                  onClick={() => setGradesFilterSubject(sCode)}
                >
                  {sCode === 'all' ? 'All Subjects' : sCode}
                </button>
              ))}
            </div>

            <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '450px' }}>
              <table className={styles.recentTable}>
                <thead>
                  <tr>
                    <th>Experiment</th>
                    <th>Subject</th>
                    <th>Auto</th>
                    <th>Manual</th>
                    <th>Viva</th>
                    <th>Final</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentGrades
                    .filter((g) => gradesFilterSubject === 'all' || g.subject === gradesFilterSubject)
                    .map((g) => (
                      <tr key={g.id}>
                        <td style={{ fontWeight: 600, color: '#0f172a' }}>{g.exp_title}</td>
                        <td>
                          <span className={styles.conceptSubjTag}>{g.subject}</span>
                        </td>
                        <td style={{ color: '#475569' }}>{g.auto}</td>
                        <td style={{ color: '#475569' }}>{g.manual}</td>
                        <td style={{ color: '#475569' }}>{g.viva}</td>
                        <td>
                          <span
                            style={{
                              fontWeight: 700,
                              color: g.final_num >= 75 ? '#15803d' : '#b45309',
                            }}
                          >
                            {g.final}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`${styles.statusPill} ${
                              g.status_type === 'graded' ? styles.statusGraded : styles.statusReview
                            }`}
                          >
                            {g.status}
                          </span>
                        </td>
                        <td className={styles.dateCell}>{g.date}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button
                onClick={() => setIsGradesModalOpen(false)}
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  background: '#7c3aed',
                  color: '#ffffff',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Concept Mastery Full Modal */}
      {isConceptModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={() => setIsConceptModalOpen(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '1.25rem',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '820px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid #e2e8f0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1rem',
                borderBottom: '1px solid #f1f5f9',
                paddingBottom: '0.75rem',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                  All Academic Concept Mastery
                </h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                  Evaluated understanding across enrolled laboratory courses and theoretical modules.
                </p>
              </div>
              <button
                onClick={() => setIsConceptModalOpen(false)}
                style={{
                  border: 'none',
                  background: '#f1f5f9',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#64748b',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Subject Filter Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              {['all', 'DSA', 'DBMS', 'CN', 'OS'].map((sCode, sIdx) => (
                <button
                  key={`concept-modal-tab-${sCode}-${sIdx}`}
                  type="button"
                  style={{
                    padding: '0.35rem 0.85rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    background: conceptModalSubject.toLowerCase() === sCode.toLowerCase() ? '#f5f3ff' : '#f8fafc',
                    color: conceptModalSubject.toLowerCase() === sCode.toLowerCase() ? '#7c3aed' : '#64748b',
                    fontWeight: conceptModalSubject.toLowerCase() === sCode.toLowerCase() ? 700 : 500,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                  }}
                  onClick={() => setConceptModalSubject(sCode)}
                >
                  {sCode === 'all' ? 'All Subjects' : sCode}
                </button>
              ))}
            </div>

            {/* Scrollable Concept Table */}
            <div style={{ overflowY: 'auto', maxHeight: '450px' }}>
              <table className={styles.conceptTable}>
                <thead>
                  <tr>
                    <th>Concept</th>
                    <th>Subject</th>
                    <th>Mastery</th>
                  </tr>
                </thead>
                <tbody>
                  {conceptMastery
                    .filter(
                      (c) =>
                        conceptModalSubject === 'all' ||
                        c.subject.toLowerCase() === conceptModalSubject.toLowerCase()
                    )
                    .map((c, cIdx) => (
                      <tr key={`modal-concept-${c.concept}-${c.subject}-${cIdx}`}>
                        <td>
                          <span className={styles.conceptName}>{c.concept}</span>
                        </td>
                        <td>
                          <span className={styles.conceptSubjTag}>{c.subject}</span>
                        </td>
                        <td style={{ width: '45%' }}>
                          <div className={styles.conceptBarRow}>
                            <div className={styles.conceptBarTrack}>
                              <div
                                className={styles.conceptBarFill}
                                style={{
                                  width: `${c.mastery}%`,
                                  background: c.color,
                                }}
                              />
                            </div>
                            <span className={styles.conceptPctText}>{c.mastery}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
              <button
                onClick={() => setIsConceptModalOpen(false)}
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  background: '#7c3aed',
                  color: '#ffffff',
                  fontSize: '0.82rem',
                  fontWeight: 700,
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
};
