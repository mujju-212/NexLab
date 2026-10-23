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
import DeltaPill from '@/components/analytics/DeltaPill';
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
  const [selectedExperiment, setSelectedExperiment] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('30d');
  const [trendWindow, setTrendWindow] = useState<string>('12w');

  // Synchronize with top global date filter
  useEffect(() => {
    if (dateRange) {
      const mapped = dateRange === 'all' ? 'all' : `${dateRange}d`;
      setSelectedPeriod(mapped);
    }
  }, [dateRange]);

  // Open dropdown toggles
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Hovered state for multi-line trend chart (null by default so tooltip only shows on hover)
  const [hoveredWeekIndex, setHoveredWeekIndex] = useState<number | null>(null);
  const [activeLegendFilter, setActiveLegendFilter] = useState<string | null>(null);

  // Attendance Donut interactive hover state
  const [hoveredAttendance, setHoveredAttendance] = useState<'present' | 'absent' | 'late' | 'partial' | null>(null);

  // Recent Grades Modal state
  const [isGradesModalOpen, setIsGradesModalOpen] = useState(false);
  const [gradesFilterSubject, setGradesFilterSubject] = useState<string>('all');

  // Card-Level Dropdowns & Modals
  const [conceptLimit, setConceptLimit] = useState<number | 'all'>(8);
  const [isConceptModalOpen, setIsConceptModalOpen] = useState(false);
  const [conceptModalSubject, setConceptModalSubject] = useState<string>('all');
  const [completionFilterSubject, setCompletionFilterSubject] = useState<string>('all');

  // ── TanStack Query to Fetch Real Backend Academic Analytics ────────────────
  const { data: dashboardData, isLoading, isError, error, refetch } = useQuery<AcademicDashboardResponse>({
    queryKey: ['student-academic-dashboard', selectedSubject, selectedExperiment, selectedPeriod],
    queryFn: () =>
      studentAnalyticsService.getAcademicDashboard({
        subject_id: selectedSubject !== 'all' ? selectedSubject : undefined,
        experiment_id: selectedExperiment !== 'all' ? selectedExperiment : undefined,
        period: selectedPeriod,
      }),
    staleTime: 60 * 1000,
  });

  // Missing API observations stay unavailable; counts are populated only by the response.
  const kpis = dashboardData?.kpi_metrics || {
    overall_score: null, overall_delta: null, sparkline_overall: [],
    subjects_enrolled: null, subjects_on_track: null, subjects_ring_pct: null,
    experiments_completed: null, experiments_total: null, experiments_completion_pct: null,
    attendance_rate: null, attendance_period: null, attendance_mini_bars: [],
    academic_rank: null, rank_position: null, rank_cohort: null, rank_delta: null,
    rank_percentile_text: null, sparkline_rank: [],
  };

  const performanceTrend = dashboardData?.performance_trend || {
    weeks: [],
    overall: [],
    subjects: [],
  };

  const subjectPerformance = dashboardData?.subject_performance || [];

  const conceptMastery = dashboardData?.concept_mastery || [];

  const attendanceDonut = dashboardData?.attendance_breakdown || {
    rate: null, present: 0, late: 0, partial: 0, absent: 0, total: 0, period_label: null,
  };

  const riskGuidance = dashboardData?.risk_and_guidance || {
    status: 'No Data',
    status_color: 'grey',
    subtitle: 'Not enough activity recorded yet to assess risk.',
    items: [] as Array<{ id: string; title: string; description: string; type: 'success' | 'warning' | 'info'; icon: string }>,
  };

  const recentGrades = dashboardData?.recent_grades || [];

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
    setSelectedExperiment('all');
    setOpenDropdown(null);
    if (onSubjectChange) onSubjectChange(id === 'all' ? null : id);
  };

  const getSubjectLabel = (id: string) => {
    if (id === 'all') return 'All Subjects';
    const found = subjectPerformance.find((s) => s.code.toLowerCase() === id.toLowerCase() || (s as any).id === id);
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
    const latePct = attendanceDonut.late / Math.max(1, attendanceDonut.total);
    const partialPct = attendanceDonut.partial / Math.max(1, attendanceDonut.total);

    const presentStroke = presentPct * circumference;
    const absentStroke = absentPct * circumference;
    const lateStroke = latePct * circumference;
    const partialStroke = partialPct * circumference;

    const presentOffset = circumference * 0.25;
    const absentOffset = presentOffset - presentStroke;
    const lateOffset = absentOffset - absentStroke;
    const partialOffset = lateOffset - lateStroke;

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
          {/* Late segment (amber) */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={hoveredAttendance === 'late' ? 16 : strokeWidth}
            strokeDasharray={`${lateStroke} ${circumference}`}
            strokeDashoffset={lateOffset}
            style={{
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              opacity: hoveredAttendance && hoveredAttendance !== 'late' ? 0.45 : 1,
              filter: hoveredAttendance === 'late' ? 'drop-shadow(0 0 6px rgba(245, 158, 11, 0.4))' : 'none',
            }}
            onMouseEnter={() => setHoveredAttendance('late')}
            onMouseLeave={() => setHoveredAttendance(null)}
          />
          <circle
            cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#8b5cf6"
            strokeWidth={hoveredAttendance === 'partial' ? 16 : strokeWidth}
            strokeDasharray={`${partialStroke} ${circumference}`} strokeDashoffset={partialOffset}
            style={{ cursor: 'pointer', opacity: hoveredAttendance && hoveredAttendance !== 'partial' ? 0.45 : 1, transition: 'all 0.2s ease' }}
            onMouseEnter={() => setHoveredAttendance('partial')} onMouseLeave={() => setHoveredAttendance(null)}
          />
        </svg>

        <div className={styles.donutCenterText}>
          {hoveredAttendance === 'present' ? (
            <>
              <div className={styles.donutRateBig} style={{ color: '#10b981' }}>{attendanceDonut.present}</div>
              <div className={styles.donutRateLabel}>Present ({attendanceDonut.rate != null ? `${attendanceDonut.rate}%` : '—'})</div>
            </>
          ) : hoveredAttendance === 'absent' ? (
            <>
              <div className={styles.donutRateBig} style={{ color: '#ef4444' }}>{attendanceDonut.absent}</div>
              <div className={styles.donutRateLabel}>Absent ({Math.round(absentPct * 100)}%)</div>
            </>
          ) : hoveredAttendance === 'late' ? (
            <>
              <div className={styles.donutRateBig} style={{ color: '#f59e0b' }}>{attendanceDonut.late}</div>
              <div className={styles.donutRateLabel}>Late ({Math.round(latePct * 100)}%)</div>
            </>
          ) : hoveredAttendance === 'partial' ? (
            <>
              <div className={styles.donutRateBig} style={{ color: '#7c3aed' }}>{attendanceDonut.partial}</div>
              <div className={styles.donutRateLabel}>Partial ({Math.round(partialPct * 100)}%)</div>
            </>
          ) : (
            <>
              <div className={styles.donutRateBig}>{attendanceDonut.rate != null ? `${attendanceDonut.rate != null ? `${attendanceDonut.rate}%` : '—'}` : '—'}</div>
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
            const pts = s.data
              .map((val, idx) => (val === null || val === undefined ? null : `${getX(idx)},${getY(val)}`))
              .filter(Boolean) as string[];
            if (pts.length < 2) return null;
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
                {/* Dots on each week — empty weeks draw nothing */}
                {s.data.map((val, idx) => (val === null || val === undefined ? null : (
                  <circle
                    key={`dot-${s.code}-${sIdx}-${idx}`}
                    cx={getX(idx)}
                    cy={getY(val)}
                    r={idx === activeIdx ? 4.5 : 2.5}
                    fill={s.color}
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                )))}
              </g>
            );
          })}

          {/* Overall Trend Curve (Thicker Purple) */}
          {showOverall && (
            <g>
              <path
                d={
                  overallSeries
                    .map((val, idx) => (val === null || val === undefined ? null : { idx, val }))
                    .filter(Boolean)
                    .map((pt: any, i: number, arr: any[]) =>
                      `${i === 0 ? 'M' : 'L'} ${getX(pt.idx)} ${getY(pt.val)}`
                    )
                    .join(' ')
                }
                fill={overallSeries.some((v) => v !== null && v !== undefined) ? 'none' : 'none'}
                stroke="#7c3aed"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {overallSeries.map((val, idx) => (val === null || val === undefined ? null : (
                <circle
                  key={`overall-${idx}`}
                  cx={getX(idx)}
                  cy={getY(val)}
                  r={idx === activeIdx ? 5.5 : 3}
                  fill="#7c3aed"
                  stroke="#ffffff"
                  strokeWidth="2"
                />
              )))}
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

  if (isLoading) return <div className={styles.dashboard} style={{ padding: '2rem', color: '#64748b' }}>Loading academic records…</div>;
  if (isError) return <div role="alert" className={styles.dashboard} style={{ padding: '2rem', color: '#991b1b' }}>Could not load academic records. No sample values are shown. <button onClick={() => refetch()}>Retry</button></div>;

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
                  className={`${styles.dropdownItem} ${selectedSubject.toLowerCase() === s.code.toLowerCase() || selectedSubject === (s as any).id ? styles.dropdownItemActive : ''}`}
                  onClick={() => handleSelectSubject((s as any).id || s.code.toLowerCase())}
                >
                  <span>{s.name}</span>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{s.avg_grade}%</span>
                </li>
              ))}
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
            <span>{selectedExperiment === 'all' ? 'All Experiments' : (dashboardData?.filter_options?.experiments ?? []).find((item) => item.id === selectedExperiment)?.label ?? 'Selected Experiment'}</span>
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
              {(dashboardData?.filter_options?.experiments ?? []).filter((item) => item.id !== 'all').map((item) => (
                <li key={item.id} className={`${styles.dropdownItem} ${selectedExperiment === item.id ? styles.dropdownItemActive : ''}`} onClick={() => { setSelectedExperiment(item.id); setOpenDropdown(null); }}>
                  {item.label}
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
                <span className={styles.kpiValue}>
                  {kpis.overall_score === null || kpis.overall_score === undefined
                    ? '—'
                    : `${kpis.overall_score}%`}
                </span>
                <DeltaPill
                  delta={typeof kpis.overall_delta === 'number' ? kpis.overall_delta : null}
                  suffix="%"
                />
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
                <span className={styles.kpiValue}>{kpis.subjects_enrolled ?? '—'}</span>
              </div>
            </div>
          </div>
          <div className={styles.kpiBottomRow}>
            <span className={styles.kpiSubtext}>{kpis.subjects_on_track != null ? `${kpis.subjects_on_track} on track` : 'On-track count unavailable'}</span>
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
                  strokeDasharray={`${((kpis.subjects_ring_pct ?? 0) / 100) * 69} 69`}
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
                  {kpis.experiments_completed ?? '—'} / {kpis.experiments_total ?? '—'}
                </span>
              </div>
            </div>
          </div>
          <div className={styles.kpiBottomRow} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <span className={styles.kpiSubtext}>{kpis.experiments_completion_pct != null ? `${kpis.experiments_completion_pct}% completion` : 'Completion unavailable'}</span>
            </div>
            <div style={{ width: '100%', height: '5px', background: '#e2e8f0', borderRadius: '9999px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${kpis.experiments_completion_pct ?? 0}%`,
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
                <span className={styles.kpiValue}>{kpis.attendance_rate != null ? `${kpis.attendance_rate}%` : '—'}</span>
              </div>
            </div>
          </div>
          <div className={styles.kpiBottomRow}>
            <span className={styles.kpiSubtext}>{kpis.attendance_period ?? 'No attendance period'}</span>
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
                <span className={styles.kpiValue}>
                  {kpis.rank_position ? `#${kpis.rank_position}` : '—'}
                </span>
                {kpis.rank_position ? (
                  <span style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 600 }}>
                    / {kpis.rank_cohort}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className={styles.kpiBottomRow}>
            <span className={styles.kpiSubtext}>{kpis.rank_percentile_text ?? 'Percentile unavailable'}</span>
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
          {performanceTrend.overall.some((value) => value != null) || performanceTrend.subjects.some((series) => series.data.some((value) => value != null)) ? renderMultiLineChart() : <div className={styles.chartContainer} style={{ display: 'grid', placeItems: 'center', color: '#64748b' }}>No graded observations are available for this trend period.</div>}

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
                      className={`${styles.dropdownItem} ${selectedSubject.toLowerCase() === s.code.toLowerCase() || selectedSubject === (s as any).id ? styles.dropdownItemActive : ''}`}
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
                        color:
                          subj.avg_grade === null || subj.avg_grade === undefined
                            ? '#94a3b8'
                            : subj.avg_grade >= 75 ? '#15803d' : subj.avg_grade >= 60 ? '#b45309' : '#b91c1c',
                      }}
                    >
                      {subj.avg_grade === null || subj.avg_grade === undefined ? '—' : `${subj.avg_grade}%`}
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
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          color:
                            subj.trend_pct === null || subj.trend_pct === undefined
                              ? '#94a3b8'
                              : subj.trend_pct >= 0 ? '#15803d' : '#b91c1c',
                        }}
                      >
                        {subj.trend_pct === null || subj.trend_pct === undefined
                          ? '—'
                          : `${subj.trend_pct >= 0 ? '↗' : '↘'}${Math.abs(subj.trend_pct)}%`}
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

          </div>

          {/* Circular Donut Diagram */}
          {attendanceDonut.total > 0 ? renderDonut() : <div className={styles.donutContainer} style={{ color: '#64748b', textAlign: 'center', display: 'grid', placeItems: 'center' }}>No attendance records for this period.</div>}

          {/* Attendance Breakdown Legend */}
          {attendanceDonut.total > 0 && <div className={styles.donutLegend}>
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
                background: hoveredAttendance === 'late' ? '#fffbeb' : 'transparent',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={() => setHoveredAttendance('late')}
              onMouseLeave={() => setHoveredAttendance(null)}
            >
              <span className={styles.donutDot} style={{ background: '#f59e0b' }} />
              <span>Late</span>
              <span className={styles.donutCount}>{attendanceDonut.late}</span>
            </div>
            <div className={styles.donutLegendItem} onMouseEnter={() => setHoveredAttendance('partial')} onMouseLeave={() => setHoveredAttendance(null)}>
              <span className={styles.donutDot} style={{ background: '#8b5cf6' }} />
              <span>Partial</span><span className={styles.donutCount}>{attendanceDonut.partial}</span>
            </div>
          </div>}

          {attendanceDonut.total > 0 && <div className={styles.donutFooter}>
            {attendanceDonut.total} Total Sessions
          </div>}
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
                color: riskGuidance.status_color === 'green' ? '#15803d' : riskGuidance.status_color === 'orange' ? '#b45309' : '#64748b',
                background: riskGuidance.status_color === 'green' ? '#dcfce7' : riskGuidance.status_color === 'orange' ? '#fff7ed' : '#f1f5f9',
                border: `1px solid ${riskGuidance.status_color === 'green' ? '#bbf7d0' : riskGuidance.status_color === 'orange' ? '#fed7aa' : '#cbd5e1'}`,
                padding: '0.25rem 0.65rem',
                borderRadius: '9999px',
              }}
            >
              {riskGuidance.status_color === 'green' ? <CheckCircle2 size={12} /> : riskGuidance.status_color === 'orange' ? <AlertTriangle size={12} /> : <Clock size={12} />}
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
                      width: `${cp.completion_pct ?? 0}%`,
                      background: cp.color,
                    }}
                  />
                </div>
                <span className={styles.completionPct}>{cp.completion_pct != null ? `${cp.completion_pct}%` : '—'}</span>
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
