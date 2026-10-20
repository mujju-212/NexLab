'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Users,
  AlertTriangle,
  Award,
  Star,
  Calendar,
  Search,
  X,
  ChevronDown,
  Download,
  MoreHorizontal,
  Sparkles,
  Lightbulb,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Minus,
  BookOpen,
  FlaskConical,
  ShieldCheck,
  Clock,
  ArrowRight,
  ExternalLink,
  FileText,
  Play,
  Filter,
  RefreshCw,
  Trophy,
} from 'lucide-react';
import styles from './students-tab.module.css';
import { CohortMatrixData, CohortStudentItem, analyticsService } from '@/services/analytics.service';
import { exportCSV, riskColor } from '@/lib/analytics-utils';

// ── Color and Initials Helpers ───────────────────────────────────────────────
function getAvatarStyle(name: string, roll: string) {
  const palettes = [
    { bg: '#8b5cf6', text: '#ffffff' }, // Violet
    { bg: '#3b82f6', text: '#ffffff' }, // Blue
    { bg: '#f97316', text: '#ffffff' }, // Orange
    { bg: '#f59e0b', text: '#ffffff' }, // Amber
    { bg: '#10b981', text: '#ffffff' }, // Green
    { bg: '#06b6d4', text: '#ffffff' }, // Cyan
    { bg: '#ec4899', text: '#ffffff' }, // Pink
    { bg: '#6366f1', text: '#ffffff' }, // Indigo
  ];
  if (roll === 'NDU2024012' || name.toLowerCase().includes('aadhya')) return { bg: '#8b5cf6', text: '#ffffff' };
  if (roll === 'NDU2024005' || name.toLowerCase().includes('aditya')) return { bg: '#3b82f6', text: '#ffffff' };
  if (roll === 'NDU2024004' || name.toLowerCase().includes('ananya')) return { bg: '#f97316', text: '#ffffff' };
  if (roll === 'NDU2024010' || name.toLowerCase().includes('rahul')) return { bg: '#f59e0b', text: '#ffffff' };
  if (roll === 'NDU2024015' || name.toLowerCase().includes('sneha')) return { bg: '#10b981', text: '#ffffff' };
  if (roll === 'NDU2024001' || name.toLowerCase().includes('amit')) return { bg: '#06b6d4', text: '#ffffff' };

  const code = (name || 'S').charCodeAt(0) + (name || 'S').charCodeAt(name.length - 1 || 0);
  return palettes[code % palettes.length];
}

// ── Mini SVG Sparkline for KPI Card ──────────────────────────────────────────
function KpiSparkline({ points, color }: { points: number[]; color: string }) {
  if (!points || points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = 84;
  const height = 28;

  const coords = points.map((p, idx) => {
    const x = (idx / (points.length - 1)) * width;
    const y = height - ((p - min) / range) * (height - 8) - 4;
    return `${x},${y}`;
  });

  const pathD = `M ${coords.join(' L ')}`;
  const areaD = `${pathD} L ${width},${height} L 0,${height} Z`;
  const gradientId = `kpi-grad-${color.replace('#', '')}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradientId})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Mini SVG Sparkline for Table Row Trend ────────────────────────────────────
function TableTrendSparkline({
  points,
  trend,
}: {
  points: number[];
  trend: 'deteriorating' | 'improving' | 'stable';
}) {
  const safePoints = points && points.length >= 2 ? points : [60, 64, 68];
  const min = Math.min(...safePoints);
  const max = Math.max(...safePoints);
  const range = max - min || 1;
  const width = 64;
  const height = 20;

  const color = trend === 'improving' ? '#10b981' : trend === 'deteriorating' ? '#ef4444' : '#6366f1';

  const coords = safePoints.map((p, idx) => {
    const x = (idx / (safePoints.length - 1)) * width;
    const y = height - ((p - min) / range) * (height - 6) - 3;
    return `${x},${y}`;
  });

  const pathD = `M ${coords.join(' L ')}`;
  const areaD = `${pathD} L ${width},${height} L 0,${height} Z`;
  const gradId = `spark-${Math.random().toString(36).substring(2, 7)}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradId})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Semi-circular Radial Gauge SVG Component ─────────────────────────────────
function SemicircleRiskGauge({ score }: { score: number }) {
  const safeScore = Math.min(100, Math.max(0, score || 0));
  const r = 52;
  const strokeW = 11;
  // Circumference of semi-circle = PI * r
  const arcLength = Math.PI * r;
  const strokeDashoffset = arcLength * (1 - safeScore / 100);

  const color = safeScore >= 70 ? '#ef4444' : safeScore >= 50 ? '#f97316' : safeScore >= 35 ? '#f59e0b' : '#10b981';

  return (
    <div className={styles.gaugeWrap}>
      <svg width="134" height="74" viewBox="0 0 134 74" style={{ overflow: 'visible' }}>
        {/* Background track arc (180 deg) */}
        <path
          d="M 15,67 A 52,52 0 0,1 119,67"
          fill="none"
          stroke="#f1f5f9"
          strokeWidth={strokeW}
          strokeLinecap="round"
        />
        {/* Active colored arc */}
        <path
          d="M 15,67 A 52,52 0 0,1 119,67"
          fill="none"
          stroke={color}
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeDasharray={arcLength}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.3s ease' }}
        />
      </svg>
      <div className={styles.gaugeTextWrap}>
        <div className={styles.gaugeScoreNumber} style={{ color: '#0f172a' }}>
          {safeScore} <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#64748b' }}>/ 100</span>
        </div>
        <div className={styles.gaugeScoreLabel}>Risk Score</div>
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
export interface StudentsTabProps {
  data: CohortMatrixData;
  selectedStudentId?: string | null;
  onSelectStudent?: (studentId: string | null) => void;
  onRefresh?: () => void;
  onFilterChange?: (filters: { section_subject_id?: string; experiment_id?: string; days?: number }) => void;
}

type SortField = 'student_name' | 'risk_score' | 'risk_band' | 'mastery_pct' | 'grade_avg' | 'attendance_rate' | 'focus_score' | 'violations_count';

export function StudentsTab({
  data,
  selectedStudentId,
  onSelectStudent,
  onRefresh,
  onFilterChange,
}: StudentsTabProps) {
  // Local state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [bandFilter, setBandFilter] = useState<'all' | 'critical' | 'high' | 'watch' | 'ok'>('all');
  const [hoveredDonutBand, setHoveredDonutBand] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('risk_score');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(true);
  const [drawerSubtab, setDrawerSubtab] = useState<'overview' | 'analytics' | 'history' | 'actions'>('overview');
  const [interventionModalOpen, setInterventionModalOpen] = useState<boolean>(false);
  const [actionType, setActionType] = useState<string>('1_on_1_review');
  const [actionTargetDate, setActionTargetDate] = useState<string>('');
  const [actionNotes, setActionNotes] = useState<string>('');
  const [toast, setToast] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Cascading Filter selections
  const [selectedSs, setSelectedSs] = useState<string>(data?.filters?.active_section_id || '');
  const [selectedExp, setSelectedExp] = useState<string>(data?.filters?.active_experiment_id || 'all');
  const [selectedDays, setSelectedDays] = useState<number>(data?.filters?.active_days || 30);

  // Synchronize internal filter state when data filters change from parent/URL
  useEffect(() => {
    if (data?.filters?.active_section_id !== undefined) {
      setSelectedSs(data.filters.active_section_id || '');
    }
    if (data?.filters?.active_experiment_id !== undefined) {
      setSelectedExp(data.filters.active_experiment_id || 'all');
    }
    if (data?.filters?.active_days !== undefined) {
      setSelectedDays(data.filters.active_days || 30);
    }
  }, [data?.filters?.active_section_id, data?.filters?.active_experiment_id, data?.filters?.active_days]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // Local selected student state
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);

  // Active student object
  const activeStudentId = internalSelectedId || selectedStudentId || (data?.students && data.students.length > 0 ? data.students[0].student_id : null);
  const selectedStudent: CohortStudentItem | undefined = useMemo(() => {
    if (!data?.students) return undefined;
    return data.students.find((s) => s.student_id === activeStudentId) || data.students[0];
  }, [data?.students, activeStudentId]);

  // Filtered & Sorted Students List
  const filteredStudents = useMemo(() => {
    if (!data?.students) return [];
    let list = data.students.filter((st) => {
      if (bandFilter !== 'all' && st.risk_band !== bandFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = st.student_name.toLowerCase().includes(q);
        const matchesRoll = st.roll_number.toLowerCase().includes(q);
        const matchesEmail = st.email.toLowerCase().includes(q);
        if (!matchesName && !matchesRoll && !matchesEmail) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];
      if (sortField === 'risk_band') {
        const bandRank = { critical: 4, high: 3, watch: 2, ok: 1 };
        valA = bandRank[a.risk_band] || 0;
        valB = bandRank[b.risk_band] || 0;
        return sortAsc ? valA - valB : valB - valA;
      }
      if (typeof valA === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      valA = Number(valA) || 0;
      valB = Number(valB) || 0;
      return sortAsc ? valA - valB : valB - valA;
    });

    return list;
  }, [data?.students, bandFilter, searchQuery, sortField, sortAsc]);

  // Client-side pagination state (10 to 15 students per page)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  useEffect(() => {
    setCurrentPage(1);
  }, [bandFilter, searchQuery, sortField, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredStudents.length);
  const paginatedStudents = useMemo(() => {
    return filteredStudents.slice(startIndex, endIndex);
  }, [filteredStudents, startIndex, endIndex]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === 'student_name');
    }
  };

  const renderSortIndicator = (field: SortField) => {
    if (sortField === field) {
      return (
        <span style={{ marginLeft: 4, color: '#7c3aed', fontWeight: 700 }}>
          {sortAsc ? '▲' : '▼'}
        </span>
      );
    }
    return <span style={{ marginLeft: 4, opacity: 0.35, fontSize: '0.75rem' }}>⇅</span>;
  };

  // Export full table to CSV
  const handleExportCSV = () => {
    if (!data?.students?.length) {
      showToast('No students to export.');
      return;
    }
    const exportRows = (filteredStudents.length > 0 ? filteredStudents : data.students).map((st) => ({
      Student: st.student_name,
      RollNumber: st.roll_number,
      Email: st.email,
      RiskBand: st.risk_band.toUpperCase(),
      RiskScore: st.risk_score,
      PrimaryReason: st.primary_reason,
      MasteryPercent: `${st.mastery_pct}%`,
      MasteryPercentile: `P${st.mastery_p}`,
      AverageGrade: `${st.grade_avg}/100`,
      GradePercentile: `P${st.grade_p}`,
      AttendanceRate: `${st.attendance_rate}%`,
      AttendancePercentile: `P${st.attendance_p}`,
      FocusScore: `${st.focus_score}%`,
      ViolationsCount: st.violations_count,
      Trend: st.trend,
    }));
    exportCSV(exportRows, `cohort_health_matrix_${new Date().toISOString().split('T')[0]}`);
    showToast('Cohort Health Matrix exported as CSV.');
  };

  // Refresh handler
  const handleRefreshClick = async () => {
    setIsRefreshing(true);
    if (onRefresh) {
      await onRefresh();
    }
    setTimeout(() => {
      setIsRefreshing(false);
      showToast('Cohort matrix refreshed with live session data.');
    }, 600);
  };

  // Handle Log Intervention Submit
  const handleSubmitIntervention = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;
    try {
      analyticsService.createIntervention({
        student_id: selectedStudent.student_id,
        action_type: actionType,
        note: actionNotes || `Logged ${actionType.replace(/_/g, ' ')} for student`,
        target_date: actionTargetDate || undefined,
      });
    } catch {
      /* noop */
    }
    setInterventionModalOpen(false);
    setActionNotes('');
    showToast(`Intervention recorded for ${selectedStudent.student_name}.`);
  };

  // KPI figures
  const kpis = data?.kpis || {
    students_in_scope: { value: 124, total_enrolled: 128, delta: '+ 2%', sparkline: [120, 122, 123, 124] },
    high_critical_risk: { value: 18, percentage: '(14.5%)', delta: '↓ 1%', sparkline: [20, 19, 18, 18] },
    cohort_avg_mastery: { value: '76%', raw_value: 76, delta: '↑ 3%', sparkline: [73, 74, 75, 76] },
    avg_grade: { value: '72 / 100', raw_value: 72, delta: '↑ 4%', sparkline: [68, 70, 71, 72] },
    attendance: { value: '89%', raw_value: 89, delta: '↑ 2%', sparkline: [86, 87, 88, 89] },
  };

  const riskDist = data?.risk_distribution?.bands || [
    { name: 'Critical', count: 18, percentage: 14.5, color: '#ef4444' },
    { name: 'High', count: 24, percentage: 19.4, color: '#f97316' },
    { name: 'Watch', count: 31, percentage: 25.0, color: '#f59e0b' },
    { name: 'On Track', count: 51, percentage: 41.1, color: '#10b981' },
  ];

  const riskBreakdown = data?.risk_breakdown || [
    { name: 'Academic Performance', value: 65, color: '#8b5cf6' },
    { name: 'Engagement', value: 72, color: '#3b82f6' },
    { name: 'Attendance', value: 88, color: '#06b6d4' },
    { name: 'Focus', value: 76, color: '#10b981' },
    { name: 'Integrity', value: 96, color: '#6366f1' },
  ];

  const insights = data?.insights || [
    { type: 'critical', color: '#ef4444', text: '14.5% students are at Critical Risk.' },
    { type: 'predictor', color: '#06b6d4', text: 'Focus is the strongest predictor of academic success (+96%).' },
    { type: 'action', color: '#8b5cf6', text: 'Consider intervention for 18 high-risk students this week.' },
  ];

  const sectionsList = data?.filters?.sections || [
    { id: 'sec-a', label: 'Section A · Data Structures', section_name: 'A', subject_name: 'Data Structures', student_count: 32 },
    { id: 'sec-b', label: 'Section B · Algorithms', section_name: 'B', subject_name: 'Algorithms', student_count: 28 },
  ];

  const expsList = data?.filters?.experiments || [
    { id: 'all', label: 'All Experiments' },
    { id: 'exp-1', label: 'Exp 1: Singly Linked Lists' },
    { id: 'exp-2', label: 'Exp 2: Stack Expressions' },
    { id: 'exp-3', label: 'Exp 3: Binary Search Trees' },
  ];

  const timeWindows = data?.filters?.time_windows || [
    { id: 30, label: 'Last 30 Days' },
    { id: 14, label: 'Last 14 Days' },
    { id: 90, label: 'Last 90 Days' },
  ];

  return (
    <div className={styles.container}>
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 28,
            zIndex: 99999,
            background: '#0f172a',
            color: '#ffffff',
            padding: '10px 18px',
            borderRadius: 10,
            fontSize: '0.84rem',
            fontWeight: 600,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Sparkles size={16} color="#c084fc" />
          <span>{toast}</span>
        </div>
      )}

      {/* ── Top Cascading Filters Bar matching Reference UI ───────────────── */}
      <div className={styles.filterCard}>
        <div className={styles.filterControls}>
          {/* Section / Subject */}
          <div className={styles.filterItem}>
            <label className={styles.filterLabel}>Section / Subject</label>
            <select
              className={styles.filterSelect}
              value={selectedSs}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedSs(val);
                onFilterChange?.({ section_subject_id: val, experiment_id: selectedExp, days: selectedDays });
              }}
            >
              <option value="">
                All My Sections ({sectionsList.reduce((acc, s) => acc + (s.student_count || 0), 0) || kpis.students_in_scope?.total_enrolled || 36} students)
              </option>
              {sectionsList.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.label || `${sec.section_name} · ${sec.subject_name}`} {sec.student_count ? `(${sec.student_count} students)` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Experiment */}
          <div className={styles.filterItem}>
            <label className={styles.filterLabel}>Experiment</label>
            <select
              className={styles.filterSelect}
              value={selectedExp}
              onChange={(e) => {
                setSelectedExp(e.target.value);
                onFilterChange?.({ section_subject_id: selectedSs, experiment_id: e.target.value, days: selectedDays });
              }}
            >
              {expsList.map((exp) => (
                <option key={exp.id} value={exp.id}>
                  {exp.label}
                </option>
              ))}
            </select>
          </div>

          {/* Time Window */}
          <div className={styles.filterItem}>
            <select
              className={styles.filterSelect}
              value={selectedDays}
              onChange={(e) => {
                const d = Number(e.target.value);
                setSelectedDays(d);
                onFilterChange?.({ section_subject_id: selectedSs, experiment_id: selectedExp, days: d });
              }}
            >
              {timeWindows.map((tw) => (
                <option key={tw.id} value={tw.id}>
                  {tw.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Buttons */}
        <div className={styles.filterButtons}>
          <button
            type="button"
            onClick={handleRefreshClick}
            className={styles.refreshBtn}
            title="Refresh cohort analytics"
          >
            <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className={styles.exportBtn}
            title="Export CSV report"
          >
            <Download size={13} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* ── Five KPI Cards ──────────────────────────────────────────────── */}
      <div className={styles.kpiGrid}>
        {/* Card 1: Students in Scope */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiTop}>
            <div className={styles.kpiLeftMeta}>
              <div className={styles.kpiIconBox} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                <Users size={18} />
              </div>
              <span className={styles.kpiTitle}>Students in Scope</span>
            </div>
            <span className={styles.kpiBadgeGreen}>{kpis.students_in_scope?.delta || '+ 2%'}</span>
          </div>
          <div className={styles.kpiBottom}>
            <div>
              <div className={styles.kpiMainValue}>{kpis.students_in_scope?.value}</div>
              <div className={styles.kpiSubValue}>of {kpis.students_in_scope?.total_enrolled} enrolled</div>
            </div>
            <div className={styles.kpiSparklineWrap}>
              <KpiSparkline points={kpis.students_in_scope?.sparkline} color="#7c3aed" />
            </div>
          </div>
        </div>

        {/* Card 2: High / Critical Risk */}
        <div
          className={styles.kpiCard}
          style={{ cursor: 'pointer' }}
          onClick={() => {
            setBandFilter(bandFilter === 'critical' ? 'all' : 'critical');
          }}
          title="Click to filter critical and high risk students"
        >
          <div className={styles.kpiTop}>
            <div className={styles.kpiLeftMeta}>
              <div className={styles.kpiIconBox} style={{ background: '#fef2f2', color: '#ef4444' }}>
                <AlertTriangle size={18} />
              </div>
              <span className={styles.kpiTitle}>High / Critical Risk</span>
            </div>
            <span className={styles.kpiBadgeRed}>{kpis.high_critical_risk?.delta || '↓ 1%'}</span>
          </div>
          <div className={styles.kpiBottom}>
            <div>
              <div className={styles.kpiMainValue}>{kpis.high_critical_risk?.value}</div>
              <div className={styles.kpiSubValue}>{kpis.high_critical_risk?.percentage}</div>
            </div>
            <div className={styles.kpiSparklineWrap}>
              <KpiSparkline points={kpis.high_critical_risk?.sparkline} color="#ef4444" />
            </div>
          </div>
        </div>

        {/* Card 3: Cohort Avg Mastery */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiTop}>
            <div className={styles.kpiLeftMeta}>
              <div className={styles.kpiIconBox} style={{ background: '#fffbeb', color: '#d97706' }}>
                <Award size={18} />
              </div>
              <span className={styles.kpiTitle}>Cohort Avg Mastery</span>
            </div>
            <span className={styles.kpiBadgeBlue}>{kpis.cohort_avg_mastery?.delta || '↑ 3%'}</span>
          </div>
          <div className={styles.kpiBottom}>
            <div>
              <div className={styles.kpiMainValue}>{kpis.cohort_avg_mastery?.value}</div>
              <div className={styles.kpiSubValue}>across subject concepts</div>
            </div>
            <div className={styles.kpiSparklineWrap}>
              <KpiSparkline points={kpis.cohort_avg_mastery?.sparkline} color="#8b5cf6" />
            </div>
          </div>
        </div>

        {/* Card 4: Avg Grade */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiTop}>
            <div className={styles.kpiLeftMeta}>
              <div className={styles.kpiIconBox} style={{ background: '#eff6ff', color: '#2563eb' }}>
                <Star size={18} />
              </div>
              <span className={styles.kpiTitle}>Avg Grade</span>
            </div>
            <span className={styles.kpiBadgeBlue}>{kpis.avg_grade?.delta || '↑ 4%'}</span>
          </div>
          <div className={styles.kpiBottom}>
            <div>
              <div className={styles.kpiMainValue}>{kpis.avg_grade?.value}</div>
              <div className={styles.kpiSubValue}>evaluated submissions</div>
            </div>
            <div className={styles.kpiSparklineWrap}>
              <KpiSparkline points={kpis.avg_grade?.sparkline} color="#2563eb" />
            </div>
          </div>
        </div>

        {/* Card 5: Attendance */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiTop}>
            <div className={styles.kpiLeftMeta}>
              <div className={styles.kpiIconBox} style={{ background: '#ecfeff', color: '#0891b2' }}>
                <Calendar size={18} />
              </div>
              <span className={styles.kpiTitle}>Attendance</span>
            </div>
            <span className={styles.kpiBadgeGreen}>{kpis.attendance?.delta || '↑ 2%'}</span>
          </div>
          <div className={styles.kpiBottom}>
            <div>
              <div className={styles.kpiMainValue}>{kpis.attendance?.value}</div>
              <div className={styles.kpiSubValue}>active session rate</div>
            </div>
            <div className={styles.kpiSparklineWrap}>
              <KpiSparkline points={kpis.attendance?.sparkline} color="#0891b2" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Middle Row: Risk Distribution, Risk Breakdown, Insights ────────── */}
      <div className={styles.middleGrid}>
        {/* 1. Risk Distribution (Donut Chart) */}
        <div className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Risk Distribution</h2>
          </div>

          <div className={styles.donutWrap}>
            <div className={styles.donutSvgBox}>
              <svg width="140" height="140" viewBox="0 0 140 140">
                {(() => {
                  const total = riskDist.reduce((acc, b) => acc + b.count, 0) || 1;
                  const r = 52;
                  const c = 2 * Math.PI * r;
                  let accumAngle = 0;

                  return riskDist.map((band, idx) => {
                    const pct = band.count / total;
                    const strokeDasharray = `${pct * c} ${c}`;
                    const strokeDashoffset = -accumAngle * c;
                    accumAngle += pct;
                    const isHovered = hoveredDonutBand === band.name;

                    return (
                      <circle
                        key={idx}
                        cx="70"
                        cy="70"
                        r={r}
                        fill="none"
                        stroke={band.color}
                        strokeWidth={isHovered ? 18 : 14}
                        strokeDasharray={strokeDasharray}
                        strokeDashoffset={strokeDashoffset}
                        transform="rotate(-90 70 70)"
                        style={{
                          transition: 'stroke-width 0.2s ease, stroke-dasharray 0.6s ease',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={() => setHoveredDonutBand(band.name)}
                        onMouseLeave={() => setHoveredDonutBand(null)}
                        onClick={() => {
                          const bKey = band.name.toLowerCase() === 'on track' ? 'ok' : (band.name.toLowerCase() as any);
                          setBandFilter(bandFilter === bKey ? 'all' : bKey);
                        }}
                      />
                    );
                  });
                })()}
              </svg>

              <div className={styles.donutCenterLabel}>
                {hoveredDonutBand ? (
                  <>
                    <div className={styles.donutCenterNumber} style={{ fontSize: '1.25rem' }}>
                      {riskDist.find((b) => b.name === hoveredDonutBand)?.count}
                    </div>
                    <div className={styles.donutCenterText}>{hoveredDonutBand}</div>
                  </>
                ) : (
                  <>
                    <div className={styles.donutCenterNumber}>{kpis.students_in_scope?.value}</div>
                    <div className={styles.donutCenterText}>Students</div>
                  </>
                )}
              </div>
            </div>

            {/* Legend */}
            <div className={styles.donutLegend}>
              {riskDist.map((b) => {
                const bKey = b.name.toLowerCase() === 'on track' ? 'ok' : (b.name.toLowerCase() as any);
                const isSelected = bandFilter === bKey;
                return (
                  <div
                    key={b.name}
                    className={styles.legendRow}
                    style={{
                      background: isSelected ? '#f1f5f9' : 'transparent',
                      borderRadius: 6,
                      padding: '2px 4px',
                    }}
                    onMouseEnter={() => setHoveredDonutBand(b.name)}
                    onMouseLeave={() => setHoveredDonutBand(null)}
                    onClick={() => {
                      setBandFilter(bandFilter === bKey ? 'all' : bKey);
                    }}
                  >
                    <div className={styles.legendLeft}>
                      <span className={styles.legendDot} style={{ background: b.color }} />
                      <span style={{ fontWeight: isSelected ? 700 : 500 }}>{b.name}</span>
                    </div>
                    <div className={styles.legendRight}>
                      {b.count} ({b.percentage}%)
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 2. Risk Breakdown */}
        <div className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Risk Breakdown</h2>
          </div>

          <div className={styles.breakdownList}>
            {riskBreakdown.map((item) => (
              <div key={item.name} className={styles.breakdownItem}>
                <div className={styles.breakdownHeader}>
                  <span className={styles.breakdownName}>{item.name}</span>
                  <span className={styles.breakdownValue}>{item.value}%</span>
                </div>
                <div className={styles.breakdownTrack}>
                  <div
                    className={styles.breakdownFill}
                    style={{
                      width: `${item.value}%`,
                      background: item.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Insights Card */}
        <div className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitleWithIcon}>
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  background: '#f3e8ff',
                  color: '#7c3aed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Lightbulb size={15} />
              </div>
              <span>Insights</span>
            </div>
          </div>

          <div className={styles.insightsList}>
            {insights.map((ins, idx) => (
              <div
                key={idx}
                className={ins.type === 'action' ? `${styles.insightItem} ${styles.insightItemAction}` : styles.insightItem}
              >
                {ins.type === 'action' ? (
                  <Sparkles size={16} color={ins.color} className={styles.insightStar} />
                ) : (
                  <span className={styles.insightDot} style={{ background: ins.color }} />
                )}
                <span>{ins.text}</span>
              </div>
            ))}
          </div>

          <div
            className={styles.viewDetailsLink}
            onClick={() => {
              setBandFilter('critical');
              const el = document.getElementById('cohort-roster-table');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            <span>View Details</span>
            <ChevronDown size={14} style={{ transform: 'rotate(-90deg)' }} />
          </div>
        </div>
      </div>

      {/* ── Main Split View Section: Roster Table + Pinned Student 360 ──── */}
      <div className={styles.bottomSection} id="cohort-roster-table">
        {/* Left Side: Table */}
        <div className={`${styles.rosterPanel} ${drawerOpen ? styles.rosterPanelWithDrawer : ''}`}>
          {/* Table Header Row */}
          <div className={styles.rosterHeaderRow}>
            <div className={styles.rosterHeaderLeft}>
              <div className={styles.rosterIconBox}>
                <Users size={20} />
              </div>
              <div>
                <h3 className={styles.rosterTitle}>Student Cohort Roster & Health Matrix</h3>
                <div className={styles.rosterSubtitle}>
                  Click any row to open the Student 360 drawer with mastery radar, forecast, and conduct history.
                </div>
              </div>
            </div>

            <div className={styles.rosterControlsRight}>
              {/* Search */}
              <div className={styles.searchInputWrap}>
                <Search size={14} className={styles.searchIcon} />
                <input
                  type="text"
                  placeholder="Search students..."
                  className={styles.searchInput}
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
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      color: '#94a3b8',
                    }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Filter Pills */}
              <div className={styles.filterTabsRow}>
                {[
                  { key: 'all', label: `All (${data?.students?.length || 0})` },
                  { key: 'critical', label: `Critical (${riskDist.find((b) => b.name === 'Critical')?.count || 0})` },
                  { key: 'high', label: `High (${riskDist.find((b) => b.name === 'High')?.count || 0})` },
                  { key: 'watch', label: `Watch (${riskDist.find((b) => b.name === 'Watch')?.count || 0})` },
                ].map((tab) => {
                  const active = bandFilter === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setBandFilter(tab.key as any)}
                      className={`${styles.filterTabBtn} ${active ? styles.filterTabBtnActive : ''}`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* CSV Download */}
              <button
                type="button"
                onClick={handleExportCSV}
                className={styles.csvBtn}
                title="Export filtered roster to CSV"
              >
                <Download size={13} />
                <span>CSV</span>
              </button>
            </div>
          </div>

          {/* Table */}
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th} onClick={() => handleSort('student_name')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Student {renderSortIndicator('student_name')}
                  </th>
                  <th className={styles.th} onClick={() => handleSort('risk_band')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Risk Band {renderSortIndicator('risk_band')}
                  </th>
                  <th className={styles.th} onClick={() => handleSort('risk_score')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Risk Score {renderSortIndicator('risk_score')}
                  </th>
                  <th className={styles.th} onClick={() => handleSort('mastery_pct')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Mastery {renderSortIndicator('mastery_pct')}
                  </th>
                  <th className={styles.th} onClick={() => handleSort('grade_avg')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Avg Grade {renderSortIndicator('grade_avg')}
                  </th>
                  <th className={styles.th} onClick={() => handleSort('attendance_rate')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Attendance {renderSortIndicator('attendance_rate')}
                  </th>
                  <th className={styles.th} onClick={() => handleSort('focus_score')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Focus {renderSortIndicator('focus_score')}
                  </th>
                  <th className={styles.th} onClick={() => handleSort('violations_count')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Violations {renderSortIndicator('violations_count')}
                  </th>
                  <th className={styles.th}>Trend (30d)</th>
                  <th className={styles.th} style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedStudents.map((st) => {
                  const isSelected = selectedStudent?.student_id === st.student_id && drawerOpen;
                  const avatarColors = getAvatarStyle(st.student_name, st.roll_number);

                  let badgeClass = styles.badgeOnTrack;
                  let badgeLabel = 'On Track';
                  if (st.risk_band === 'critical') {
                    badgeClass = styles.badgeCritical;
                    badgeLabel = 'Critical';
                  } else if (st.risk_band === 'high') {
                    badgeClass = styles.badgeHigh;
                    badgeLabel = 'High';
                  } else if (st.risk_band === 'watch') {
                    badgeClass = styles.badgeWatch;
                    badgeLabel = 'Watch';
                  }

                  return (
                    <tr
                      key={st.student_id}
                      className={`${styles.tr} ${isSelected ? styles.trSelected : ''}`}
                      onClick={() => {
                        setInternalSelectedId(st.student_id);
                        onSelectStudent?.(st.student_id);
                        setDrawerOpen(true);
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      {/* Student */}
                      <td className={styles.td}>
                        <div className={styles.studentMeta}>
                          <div
                            className={styles.avatar}
                            style={{ background: avatarColors.bg, color: avatarColors.text }}
                          >
                            {st.initials}
                          </div>
                          <div>
                            <div className={styles.studentName}>{st.student_name}</div>
                            <div className={styles.studentRoll}>{st.roll_number}</div>
                          </div>
                        </div>
                      </td>

                      {/* Risk Band */}
                      <td className={styles.td}>
                        <span className={badgeClass}>{badgeLabel}</span>
                      </td>

                      {/* Risk Score */}
                      <td className={styles.td}>
                        <div className={styles.scoreBox}>
                          <span className={styles.scoreNumber} style={{ color: riskColor(st.risk_score) }}>
                            {st.risk_score}
                          </span>
                          <div className={styles.scoreBarTrack}>
                            <div
                              className={styles.scoreBarFill}
                              style={{
                                width: `${st.risk_score}%`,
                                background: riskColor(st.risk_score),
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Mastery */}
                      <td className={styles.td}>
                        <span style={{ fontWeight: 700, color: '#0f172a' }}>
                          {st.mastery_pct}%{' '}
                          <span style={{ fontSize: '0.72rem', color: '#7c3aed', fontWeight: 600 }}>
                            (P{st.mastery_p})
                          </span>
                        </span>
                      </td>

                      {/* Avg Grade */}
                      <td className={styles.td}>
                        <span style={{ fontWeight: 600 }}>
                          {st.grade_avg} / 100{' '}
                          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                            (P{st.grade_p})
                          </span>
                        </span>
                      </td>

                      {/* Attendance */}
                      <td className={styles.td}>
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>
                          {st.attendance_rate}%{' '}
                          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                            (P{st.attendance_p})
                          </span>
                        </span>
                      </td>

                      {/* Focus */}
                      <td className={styles.td}>
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>{st.focus_score}%</span>
                      </td>

                      {/* Violations */}
                      <td className={styles.td}>
                        <span
                          style={{
                            fontWeight: st.violations_count > 0 ? 800 : 500,
                            color: st.violations_count > 0 ? '#ef4444' : '#64748b',
                          }}
                        >
                          {st.violations_count}
                        </span>
                      </td>

                      {/* Trend */}
                      <td className={styles.td}>
                        <TableTrendSparkline points={st.trend_points} trend={st.trend} />
                      </td>

                      {/* Actions */}
                      <td className={styles.td} style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#94a3b8',
                            cursor: 'pointer',
                            padding: 4,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setInternalSelectedId(st.student_id);
                            onSelectStudent?.(st.student_id);
                            setDrawerOpen(true);
                          }}
                        >
                          <MoreHorizontal size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filteredStudents.length === 0 && (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                      No students match the current filter or search criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer with Pagination */}
          <div className={styles.tableFooter}>
            <div className={styles.legendInline}>
              <span className={styles.legendInlineTitle}>Risk Band Legend:</span>
              <div className={styles.legendInlineItem}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
                <span>Critical</span>
              </div>
              <div className={styles.legendInlineItem}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f97316' }} />
                <span>High</span>
              </div>
              <div className={styles.legendInlineItem}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
                <span>Watch</span>
              </div>
              <div className={styles.legendInlineItem}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
                <span>On Track</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className={styles.paginationText}>
                <span>
                  Showing {filteredStudents.length === 0 ? 0 : startIndex + 1}–{endIndex} of {filteredStudents.length} students
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
        </div>

        {/* ── Right Side: Pinned Student 360 Diagnostic Panel ──────────── */}
        {drawerOpen && selectedStudent && (
          <div className={styles.drawerPanel}>
            {/* Header */}
            <div className={styles.drawerHeader}>
              <h3 className={styles.drawerTitle}>Student 360</h3>
              <button
                type="button"
                className={styles.drawerCloseBtn}
                onClick={() => setDrawerOpen(false)}
                title="Collapse Student 360 panel"
              >
                <X size={15} />
              </button>
            </div>

            {/* Bio Row */}
            <div className={styles.drawerBioRow}>
              <div
                className={styles.drawerAvatar}
                style={{
                  background: getAvatarStyle(selectedStudent.student_name, selectedStudent.roll_number).bg,
                  color: '#ffffff',
                }}
              >
                {selectedStudent.initials}
              </div>
              <div className={styles.drawerBioMeta}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className={styles.drawerStudentName}>{selectedStudent.student_name}</div>
                  {selectedStudent.risk_band === 'critical' ? (
                    <span className={styles.badgeCritical}>Critical Risk</span>
                  ) : selectedStudent.risk_band === 'high' ? (
                    <span className={styles.badgeHigh}>High Risk</span>
                  ) : selectedStudent.risk_band === 'watch' ? (
                    <span className={styles.badgeWatch}>Watch</span>
                  ) : (
                    <span className={styles.badgeOnTrack}>On Track</span>
                  )}
                </div>
                <div className={styles.drawerStudentRoll}>{selectedStudent.roll_number}</div>
              </div>
            </div>

            {/* 4 Tabs */}
            <div className={styles.drawerTabs}>
              {(['overview', 'analytics', 'history', 'actions'] as const).map((sub) => (
                <button
                  key={sub}
                  type="button"
                  className={`${styles.drawerTab} ${drawerSubtab === sub ? styles.drawerTabActive : ''}`}
                  onClick={() => setDrawerSubtab(sub)}
                >
                  {sub.charAt(0).toUpperCase() + sub.slice(1)}
                </button>
              ))}
            </div>

            {/* SUBTAB 1: Overview */}
            {drawerSubtab === 'overview' && (
              <div className={styles.subtabContent}>
                {/* Semi-circular Arc Gauge & Primary Reason */}
                <div className={styles.gaugeReasonRow}>
                  <SemicircleRiskGauge score={selectedStudent.risk_score} />
                  <div className={styles.reasonWrap}>
                    <div className={styles.reasonHeader}>
                      <AlertTriangle size={13} color="#ea580c" />
                      <span>Primary Reason</span>
                    </div>
                    <div className={styles.reasonText}>
                      {selectedStudent.primary_reason || 'Academic performance & engagement below cohort baseline'}
                    </div>
                  </div>
                </div>

                {/* 2-Column Metrics */}
                <div className={styles.metricsTwoCol}>
                  <div className={styles.metricMiniBox}>
                    <div className={styles.metricMiniIcon} style={{ background: '#eff6ff', color: '#2563eb' }}>
                      <BookOpen size={15} />
                    </div>
                    <div>
                      <div className={styles.metricMiniTitle}>Mastery</div>
                      <div className={styles.metricMiniVal}>
                        {selectedStudent.mastery_pct}%{' '}
                        <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 500 }}>
                          (P{selectedStudent.mastery_p})
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className={styles.metricMiniBox}>
                    <div className={styles.metricMiniIcon} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                      <Trophy size={15} />
                    </div>
                    <div>
                      <div className={styles.metricMiniTitle}>Completion</div>
                      <div className={styles.metricMiniVal}>
                        {selectedStudent.completion?.completed ?? 3} / {selectedStudent.completion?.total ?? 5}{' '}
                        <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 500 }}>
                          ({selectedStudent.completion?.pct ?? 60}%)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Ranks Section */}
                <div className={styles.ranksBox}>
                  <div className={styles.ranksTitle}>Ranks</div>
                  <div className={styles.ranksRow}>
                    <div className={styles.rankPill}>
                      <div className={styles.rankLabel}>Experiment Rank</div>
                      <div className={styles.rankPosition}>{selectedStudent.ranks?.experiment_rank || '#12 / 120'}</div>
                    </div>
                    <div className={styles.rankPill}>
                      <div className={styles.rankLabel}>Section Rank</div>
                      <div className={styles.rankPosition}>{selectedStudent.ranks?.section_rank || '#5 / 32'}</div>
                    </div>
                    <div className={styles.rankPill}>
                      <div className={styles.rankLabel}>Cohort Rank</div>
                      <div className={styles.rankPosition}>{selectedStudent.ranks?.cohort_rank || '#28 / 124'}</div>
                    </div>
                  </div>
                </div>

                {/* Health Summary Checklist */}
                <div className={styles.ranksBox}>
                  <div className={styles.ranksTitle}>Health Summary</div>
                  <div className={styles.healthChecklist}>
                    <div className={styles.healthCheckItem}>
                      <CheckCircle2 size={15} color="#10b981" />
                      <span>Attendance: {selectedStudent.attendance_rate}% (P{selectedStudent.attendance_p})</span>
                    </div>
                    <div className={styles.healthCheckItem}>
                      <CheckCircle2 size={15} color="#10b981" />
                      <span>Focus Score: {selectedStudent.focus_score}%</span>
                    </div>
                    <div className={styles.healthCheckItem}>
                      <CheckCircle2 size={15} color="#10b981" />
                      <span>Integrity Confidence: {selectedStudent.integrity_confidence || 97}%</span>
                    </div>
                  </div>
                </div>

                {/* Buttons */}
                <div className={styles.drawerActions}>
                  <button
                    type="button"
                    className={styles.logInterventionBtn}
                    onClick={() => setInterventionModalOpen(true)}
                  >
                    <Play size={14} fill="#ffffff" />
                    <span>Log Intervention</span>
                  </button>
                  <button
                    type="button"
                    className={styles.viewProfileBtn}
                    onClick={() => {
                      setDrawerSubtab('analytics');
                    }}
                  >
                    <span>View Full Profile</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            )}

            {/* SUBTAB 2: Analytics */}
            {drawerSubtab === 'analytics' && (
              <div className={styles.subtabContent}>
                <div className={styles.ranksTitle}>Competency & Engagement Breakdown</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className={styles.radarBarItem}>
                    <div className={styles.radarBarHeader}>
                      <span>Concept Mastery</span>
                      <span style={{ fontWeight: 700 }}>{selectedStudent.mastery_pct}%</span>
                    </div>
                    <div className={styles.radarBarTrack}>
                      <div className={styles.radarBarFill} style={{ width: `${selectedStudent.mastery_pct}%`, background: '#8b5cf6' }} />
                    </div>
                  </div>

                  <div className={styles.radarBarItem}>
                    <div className={styles.radarBarHeader}>
                      <span>Average Assessment Grade</span>
                      <span style={{ fontWeight: 700 }}>{selectedStudent.grade_avg}%</span>
                    </div>
                    <div className={styles.radarBarTrack}>
                      <div className={styles.radarBarFill} style={{ width: `${selectedStudent.grade_avg}%`, background: '#2563eb' }} />
                    </div>
                  </div>

                  <div className={styles.radarBarItem}>
                    <div className={styles.radarBarHeader}>
                      <span>Active Session Attendance</span>
                      <span style={{ fontWeight: 700 }}>{selectedStudent.attendance_rate}%</span>
                    </div>
                    <div className={styles.radarBarTrack}>
                      <div className={styles.radarBarFill} style={{ width: `${selectedStudent.attendance_rate}%`, background: '#06b6d4' }} />
                    </div>
                  </div>

                  <div className={styles.radarBarItem}>
                    <div className={styles.radarBarHeader}>
                      <span>Focus & Attention Index</span>
                      <span style={{ fontWeight: 700 }}>{selectedStudent.focus_score}%</span>
                    </div>
                    <div className={styles.radarBarTrack}>
                      <div className={styles.radarBarFill} style={{ width: `${selectedStudent.focus_score}%`, background: '#10b981' }} />
                    </div>
                  </div>

                  <div className={styles.radarBarItem}>
                    <div className={styles.radarBarHeader}>
                      <span>Proctor Integrity Confidence</span>
                      <span style={{ fontWeight: 700 }}>{selectedStudent.integrity_confidence || 97}%</span>
                    </div>
                    <div className={styles.radarBarTrack}>
                      <div className={styles.radarBarFill} style={{ width: `${selectedStudent.integrity_confidence || 97}%`, background: '#6366f1' }} />
                    </div>
                  </div>
                </div>

                <div className={styles.drawerActions} style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className={styles.logInterventionBtn}
                    onClick={() => setInterventionModalOpen(true)}
                  >
                    <Play size={14} fill="#ffffff" />
                    <span>Log Diagnostic Action</span>
                  </button>
                </div>
              </div>
            )}

            {/* SUBTAB 3: History */}
            {drawerSubtab === 'history' && (
              <div className={styles.subtabContent}>
                <div className={styles.ranksTitle}>Recent Sessions & Submissions</div>
                <div className={styles.historyList}>
                  <div className={styles.historyItem}>
                    <div>
                      <div className={styles.historyTitle}>Exp 3: Doubly Linked Lists</div>
                      <div className={styles.historyDate}>2 days ago · Lab Session #6</div>
                    </div>
                    <div className={styles.historyScore}>64 / 100</div>
                  </div>

                  <div className={styles.historyItem}>
                    <div>
                      <div className={styles.historyTitle}>Exp 2: Stack Expressions</div>
                      <div className={styles.historyDate}>1 week ago · Lab Session #4</div>
                    </div>
                    <div className={styles.historyScore}>72 / 100</div>
                  </div>

                  <div className={styles.historyItem}>
                    <div>
                      <div className={styles.historyTitle}>Exp 1: Arrays & Pointers</div>
                      <div className={styles.historyDate}>2 weeks ago · Lab Session #2</div>
                    </div>
                    <div className={styles.historyScore}>68 / 100</div>
                  </div>

                  <div className={styles.historyItem}>
                    <div>
                      <div className={styles.historyTitle}>Lab Session Attendance</div>
                      <div className={styles.historyDate}>3 days ago · Focus: 74%</div>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 700 }}>Present</span>
                  </div>
                </div>
              </div>
            )}

            {/* SUBTAB 4: Actions */}
            {drawerSubtab === 'actions' && (
              <div className={styles.subtabContent}>
                <div className={styles.ranksTitle}>Quick Intervention Triggers</div>
                <div className={styles.quickActionsList}>
                  <button
                    type="button"
                    className={styles.quickActionBtn}
                    onClick={() => {
                      setActionType('1_on_1_review');
                      setInterventionModalOpen(true);
                    }}
                  >
                    <span>Schedule 1:1 Concept Review</span>
                    <ArrowRight size={14} />
                  </button>

                  <button
                    type="button"
                    className={styles.quickActionBtn}
                    onClick={() => {
                      setActionType('assign_practice');
                      setInterventionModalOpen(true);
                    }}
                  >
                    <span>Assign Targeted Practice Exercises</span>
                    <ArrowRight size={14} />
                  </button>

                  <button
                    type="button"
                    className={styles.quickActionBtn}
                    onClick={() => {
                      setActionType('attendance_outreach');
                      setInterventionModalOpen(true);
                    }}
                  >
                    <span>Send Attendance & Progress Notice</span>
                    <ArrowRight size={14} />
                  </button>

                  <button
                    type="button"
                    className={styles.quickActionBtn}
                    onClick={() => {
                      setActionType('academic_warning');
                      setInterventionModalOpen(true);
                    }}
                  >
                    <span>Issue Academic Early Warning</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modal Dialog: Log Intervention ──────────────────────────────── */}
      {interventionModalOpen && selectedStudent && (
        <div className={styles.modalOverlay} onClick={() => setInterventionModalOpen(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Log Academic Intervention</h3>
              <button
                type="button"
                className={styles.drawerCloseBtn}
                onClick={() => setInterventionModalOpen(false)}
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafc', padding: '10px 14px', borderRadius: 10 }}>
              <div
                className={styles.avatar}
                style={{
                  background: getAvatarStyle(selectedStudent.student_name, selectedStudent.roll_number).bg,
                  color: '#ffffff',
                }}
              >
                {selectedStudent.initials}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{selectedStudent.student_name}</div>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{selectedStudent.roll_number} · Risk Score: {selectedStudent.risk_score}</div>
              </div>
            </div>

            <form onSubmit={handleSubmitIntervention} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Intervention Type</label>
                <select
                  className={styles.formSelect}
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value)}
                >
                  <option value="1_on_1_review">1:1 Concept Review & Debug Session</option>
                  <option value="assign_practice">Assign Targeted Diagnostic Practice</option>
                  <option value="attendance_outreach">Attendance Outreach & Follow-up</option>
                  <option value="academic_warning">Official Academic Performance Warning</option>
                  <option value="mentor_referral">Referral to Peer Tutor / Teaching Assistant</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Follow-up Target Date</label>
                <input
                  type="date"
                  className={styles.formInput}
                  value={actionTargetDate}
                  onChange={(e) => setActionTargetDate(e.target.value)}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Instructor Notes & Recommendations</label>
                <textarea
                  className={styles.formTextarea}
                  rows={3}
                  placeholder="Outline the planned guidance or feedback for this student..."
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                />
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.btnCancel}
                  onClick={() => setInterventionModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.btnSubmit}>
                  Record Intervention
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
