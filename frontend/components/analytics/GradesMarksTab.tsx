'use client';

import React, { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  LabelList,
} from 'recharts';
import {
  GraduationCap,
  Users,
  FileText,
  AlertTriangle,
  TrendingUp,
  BarChart2,
  Trophy,
  Download,
  ChevronDown,
  RefreshCw,
  Calendar,
  Building,
  Layers,
  BookOpen,
  CheckCircle,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import type {
  GradeDistribution,
  GradeHistogramBracket,
  GradeTrendPoint,
  SubjectPerformanceItem,
} from '@/services/institution.service';
import { exportCSV } from '@/lib/analytics-utils';

interface GradesMarksTabProps {
  data: GradeDistribution;
  isLoading?: boolean;
  onRefresh?: () => void;
  days?: number;
  onDaysChange?: (days: number) => void;
  deptId?: string;
  onDeptChange?: (deptId: string) => void;
  secId?: string;
  onSecChange?: (secId: string) => void;
  batchId?: string;
  onBatchChange?: (batchId: string) => void;
  subjectId?: string;
  onSubjectChange?: (subjId: string) => void;
  comparePeriod?: boolean;
  onComparePeriodChange?: (val: boolean) => void;
  departments?: Array<{ id: string; name: string; code?: string | null }>;
  sections?: Array<{ id: string; name: string; department_id?: string }>;
  batches?: Array<{ id: string; name?: string; year_name?: string }>;
  showStandaloneHeaderAndFilter?: boolean;
}

// Generate smooth cubic bezier SVG path from array of numeric points
function generateSmoothWavePath(points: number[], width = 280, height = 50, closed = true): string {
  if (!points || points.length === 0) return '';
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const pts = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((p - min) / range) * (height - 12) - 6;
    return { x, y };
  });

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const cp1x = p0.x + (p1.x - p0.x) / 2;
    const cp1y = p0.y;
    const cp2x = p0.x + (p1.x - p0.x) / 2;
    const cp2y = p1.y;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`;
  }

  if (closed) {
    d += ` L ${width} ${height} L 0 ${height} Z`;
  }
  return d;
}

export default function GradesMarksTab({
  data,
  isLoading = false,
  onRefresh,
  days = 30,
  onDaysChange,
  deptId = '',
  onDeptChange,
  secId = '',
  onSecChange,
  batchId = '',
  onBatchChange,
  subjectId = '',
  onSubjectChange,
  comparePeriod = false,
  onComparePeriodChange,
  departments = [],
  sections = [],
  batches = [],
  showStandaloneHeaderAndFilter = false,
}: GradesMarksTabProps) {
  const [selectedHistogramSubject, setSelectedHistogramSubject] = useState<string>('all');
  const [trendGranularity, setTrendGranularity] = useState<'monthly' | 'weekly'>('monthly');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);

  // Student Grade Roster State
  type GradeSortField = 'student_name' | 'roll_number' | 'subject_name' | 'department_name' | 'final_grade' | 'gpa' | 'band' | 'graded_at';
  type GradeSortOrder = 'asc' | 'desc';

  const [rosterSearch, setRosterSearch] = useState('');
  const [bandFilter, setBandFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<GradeSortField>('graded_at');
  const [sortOrder, setSortOrder] = useState<GradeSortOrder>('desc');
  const [rosterPage, setRosterPage] = useState(1);
  const pageSize = 10;

  const handleSort = (field: GradeSortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'final_grade' || field === 'gpa' || field === 'graded_at' ? 'desc' : 'asc');
    }
  };

  const renderSortIcon = (field: GradeSortField) => {
    if (sortField !== field) {
      return <ArrowUpDown size={11} style={{ opacity: 0.35, marginLeft: 4 }} />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp size={11} style={{ color: '#7c3aed', marginLeft: 4 }} />
    ) : (
      <ArrowDown size={11} style={{ color: '#7c3aed', marginLeft: 4 }} />
    );
  };

  const filteredAndSortedRows = useMemo(() => {
    let rows = (data?.rows && Array.isArray(data.rows)) ? [...data.rows] : [];

    if (rosterSearch.trim()) {
      const q = rosterSearch.toLowerCase().trim();
      rows = rows.filter(r =>
        (r.student_name && r.student_name.toLowerCase().includes(q)) ||
        (r.roll_number && r.roll_number.toLowerCase().includes(q)) ||
        (r.subject_name && r.subject_name.toLowerCase().includes(q)) ||
        (r.subject_code && r.subject_code.toLowerCase().includes(q)) ||
        (r.department_name && r.department_name.toLowerCase().includes(q))
      );
    }

    if (bandFilter !== 'all') {
      rows = rows.filter(r => r.band === bandFilter);
    }

    rows.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (typeof aVal === 'string') {
        const cmp = (aVal || '').localeCompare(bVal || '');
        return sortOrder === 'asc' ? cmp : -cmp;
      }

      const numA = Number(aVal ?? (sortOrder === 'asc' ? Infinity : -Infinity));
      const numB = Number(bVal ?? (sortOrder === 'asc' ? Infinity : -Infinity));
      return sortOrder === 'asc' ? numA - numB : numB - numA;
    });

    return rows;
  }, [data?.rows, rosterSearch, bandFilter, sortField, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedRows.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (rosterPage - 1) * pageSize;
    return filteredAndSortedRows.slice(start, start + pageSize);
  }, [filteredAndSortedRows, rosterPage]);

  const handleExportRosterCSV = () => {
    if (!filteredAndSortedRows || filteredAndSortedRows.length === 0) return;
    const csvRows = filteredAndSortedRows.map((r, i) => ({
      '#': i + 1,
      'Student Name': r.student_name || 'N/A',
      'Roll Number': r.roll_number || 'N/A',
      'Department': r.department_name || 'General',
      'Subject': r.subject_name || 'N/A',
      'Subject Code': r.subject_code || '',
      'Final Grade %': r.final_grade ?? '',
      'GPA': (r.gpa ?? 0).toFixed(2),
      'Grade Band': r.band || '',
      'Graded Date': r.graded_at ? new Date(r.graded_at).toLocaleDateString() : 'N/A',
    }));
    exportCSV(csvRows, `student_grades_roster_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleRefreshClick = () => {
    setIsSpinning(true);
    if (onRefresh) onRefresh();
    setTimeout(() => setIsSpinning(false), 800);
  };

  const kpis = data?.kpis;

  // Active histogram data based on subject filter on top of histogram card
  const activeHistogramData: GradeHistogramBracket[] = useMemo(() => {
    if (selectedHistogramSubject !== 'all' && data?.histogram_by_subject?.[selectedHistogramSubject]) {
      return data.histogram_by_subject[selectedHistogramSubject];
    }
    if (data?.histogram && data.histogram.length > 0) {
      return data.histogram;
    }
    // Fallback if data structure is array or object
    return [
      { bracket: 'F (<50)', count: 0, pct: 0, label: 'F (<50)' },
      { bracket: 'D (50-59)', count: 0, pct: 0, label: 'D (50-59)' },
      { bracket: 'C (60-69)', count: 0, pct: 0, label: 'C (60-69)' },
      { bracket: 'B (70-79)', count: 0, pct: 0, label: 'B (70-79)' },
      { bracket: 'A (80-89)', count: 0, pct: 0, label: 'A (80-89)' },
      { bracket: 'A+ (90-100)', count: 0, pct: 0, label: 'A+ (90-100)' },
    ];
  }, [data, selectedHistogramSubject]);

  // Active trends data
  const activeTrendsData: GradeTrendPoint[] = useMemo(() => {
    if (data?.trends && data.trends.length > 0) {
      return data.trends;
    }
    return [];
  }, [data]);

  // Subject lists for rankings
  const topSubjects: SubjectPerformanceItem[] = useMemo(() => {
    if (data?.top_performing_subjects && data.top_performing_subjects.length > 0) {
      return data.top_performing_subjects;
    }
    return [];
  }, [data]);

  const needsAttentionSubjects: SubjectPerformanceItem[] = useMemo(() => {
    if (data?.needs_attention_subjects && data.needs_attention_subjects.length > 0) {
      return data.needs_attention_subjects;
    }
    return [];
  }, [data]);

  // Sparkline data points for KPI Cards
  const avgGradeSparklinePoints = kpis?.avg_grade_sparkline?.length ? kpis.avg_grade_sparkline : [];
  const passRateSparklinePoints = kpis?.pass_rate_sparkline?.length ? kpis.pass_rate_sparkline : [];
  const submissionsSparklinePoints = kpis?.submissions_sparkline?.length ? kpis.submissions_sparkline : [];
  const atRiskSparklinePoints = kpis?.at_risk_sparkline?.length ? kpis.at_risk_sparkline : [];

  const handleExportCSV = (type: 'grades' | 'subjects') => {
    setExportMenuOpen(false);
    if (type === 'grades' && data?.rows) {
      exportCSV(
        data.rows.map(r => ({
          StudentID: r.student_id,
          StudentName: r.student_name,
          RollNumber: r.roll_number,
          FinalGrade: r.final_grade,
          GradeBand: r.band,
          GradedAt: r.graded_at,
        })),
        'grades-and-marks-export'
      );
    } else {
      const allRanks = [
        ...topSubjects.map(s => ({ ...s, Category: 'Top Performing' })),
        ...needsAttentionSubjects.map(s => ({ ...s, Category: 'Needs Attention' })),
      ];
      exportCSV(
        allRanks.map(s => ({
          Rank: s.rank,
          Category: s.Category,
          Subject: s.subject_name,
          Code: s.subject_code,
          Students: s.students_count,
          AvgGradeGPA: s.avg_grade_gpa,
          PassRatePct: `${s.pass_rate}%`,
        })),
        'subject-grade-performance-report'
      );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {showStandaloneHeaderAndFilter && (
        <>
          {/* ── Page Header matching image ── */}
          <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(147, 51, 234, 0.12), rgba(124, 58, 237, 0.22))',
              border: '1px solid rgba(147, 51, 234, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#7c3aed',
              boxShadow: '0 2px 8px rgba(124, 58, 237, 0.08)',
            }}
          >
            <BarChart2 size={24} strokeWidth={2.4} />
          </div>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: '1.5rem',
                fontWeight: 800,
                color: '#0f172a',
                letterSpacing: '-0.025em',
              }}
            >
              Grades & Marks
            </h1>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.825rem', color: '#64748b' }}>
              Comprehensive analysis of academic performance, grade distribution and assessment outcomes.
            </p>
          </div>
        </div>

        {/* Export Report Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setExportMenuOpen(prev => !prev)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 18px',
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              color: '#334155',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              transition: 'all 0.15s ease',
            }}
          >
            <Download size={15} style={{ color: '#64748b' }} />
            <span>Export Report</span>
            <ChevronDown size={14} style={{ color: '#94a3b8' }} />
          </button>

          {exportMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                right: 0,
                zIndex: 100,
                background: '#ffffff',
                borderRadius: 12,
                border: '1px solid #ede9fe',
                boxShadow: '0 12px 30px rgba(0,0,0,0.09)',
                minWidth: 220,
                padding: 6,
              }}
            >
              <button
                type="button"
                onClick={() => handleExportCSV('grades')}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'transparent',
                  color: '#1e293b',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f5f3ff')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <Download size={14} style={{ color: '#7c3aed' }} />
                <span>Export Grades CSV</span>
              </button>
              <button
                type="button"
                onClick={() => handleExportCSV('subjects')}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'transparent',
                  color: '#1e293b',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f5f3ff')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <Trophy size={14} style={{ color: '#7c3aed' }} />
                <span>Export Subjects CSV</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setExportMenuOpen(false);
                  window.print();
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'transparent',
                  color: '#1e293b',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f5f3ff')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <FileText size={14} style={{ color: '#7c3aed' }} />
                <span>Print / Save as PDF</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Global Filter Bar Container matching image ── */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 14,
          border: '1px solid #e2e8f0',
          padding: '16px 20px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          {/* Calendar Bag Icon Badge */}
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#475569',
              flexShrink: 0,
            }}
          >
            <Calendar size={18} />
          </div>

          {/* Date Range Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 150px' }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b' }}>Date Range</label>
            <div style={{ position: 'relative' }}>
              <select
                value={days}
                onChange={e => onDaysChange && onDaysChange(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '8px 28px 8px 30px',
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: '#0f172a',
                  outline: 'none',
                  appearance: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value={7}>Last 7 Days</option>
                <option value={14}>Last 14 Days</option>
                <option value={30}>Last 30 Days</option>
                <option value={60}>Last 60 Days</option>
                <option value={90}>Last 90 Days</option>
                <option value={365}>All Time (Academic Year)</option>
              </select>
              <Calendar size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#7c3aed', pointerEvents: 'none' }} />
              <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: 11, color: '#94a3b8', pointerEvents: 'none' }} />
            </div>
          </div>

          {/* Department Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 160px' }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b' }}>Department</label>
            <div style={{ position: 'relative' }}>
              <select
                value={deptId}
                onChange={e => onDeptChange && onDeptChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 28px 8px 30px',
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: '#0f172a',
                  outline: 'none',
                  appearance: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="">All Departments</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} {d.code ? `(${d.code})` : ''}
                  </option>
                ))}
              </select>
              <Building size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#7c3aed', pointerEvents: 'none' }} />
              <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: 11, color: '#94a3b8', pointerEvents: 'none' }} />
            </div>
          </div>

          {/* Section Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 150px' }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b' }}>Section</label>
            <div style={{ position: 'relative' }}>
              <select
                value={secId}
                onChange={e => onSecChange && onSecChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 28px 8px 30px',
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: '#0f172a',
                  outline: 'none',
                  appearance: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="">All Sections</option>
                {sections.map(s => (
                  <option key={s.id} value={s.id}>
                    Section {s.name}
                  </option>
                ))}
              </select>
              <Layers size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#7c3aed', pointerEvents: 'none' }} />
              <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: 11, color: '#94a3b8', pointerEvents: 'none' }} />
            </div>
          </div>

          {/* Batch / Year Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 150px' }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b' }}>Batch / Year</label>
            <div style={{ position: 'relative' }}>
              <select
                value={batchId}
                onChange={e => onBatchChange && onBatchChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 28px 8px 30px',
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: '#0f172a',
                  outline: 'none',
                  appearance: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="">2028 (B.Tech)</option>
                {batches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name || b.year_name || 'Batch'}
                  </option>
                ))}
              </select>
              <GraduationCap size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#7c3aed', pointerEvents: 'none' }} />
              <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: 11, color: '#94a3b8', pointerEvents: 'none' }} />
            </div>
          </div>

          {/* Subject Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 160px' }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b' }}>Subject</label>
            <div style={{ position: 'relative' }}>
              <select
                value={subjectId}
                onChange={e => onSubjectChange && onSubjectChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 28px 8px 30px',
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: '#0f172a',
                  outline: 'none',
                  appearance: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="">All Subjects</option>
                {(data?.subjects_list || []).map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.code ? `(${s.code})` : ''}
                  </option>
                ))}
              </select>
              <BookOpen size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#7c3aed', pointerEvents: 'none' }} />
              <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: 11, color: '#94a3b8', pointerEvents: 'none' }} />
            </div>
          </div>

          {/* Refresh Button */}
          <div style={{ alignSelf: 'flex-end' }}>
            <button
              type="button"
              onClick={handleRefreshClick}
              disabled={isLoading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 20px',
                borderRadius: 10,
                border: 'none',
                background: '#7c3aed',
                color: '#ffffff',
                fontSize: '0.8125rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(124, 58, 237, 0.25)',
                transition: 'all 0.15s ease',
              }}
            >
              <RefreshCw
                size={14}
                style={{
                  transition: 'transform 0.6s ease',
                  transform: isSpinning ? 'rotate(360deg)' : 'none',
                }}
              />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Compare Toggle Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4 }}>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <div
              onClick={() => onComparePeriodChange && onComparePeriodChange(!comparePeriod)}
              style={{
                width: 36,
                height: 20,
                borderRadius: 9999,
                background: comparePeriod ? '#7c3aed' : '#cbd5e1',
                position: 'relative',
                transition: 'background 0.2s ease',
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 9999,
                  background: '#ffffff',
                  position: 'absolute',
                  top: 2,
                  left: comparePeriod ? 18 : 2,
                  transition: 'left 0.2s ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }}
              />
            </div>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569' }}>
              Compare with Previous Period
            </span>
          </label>
        </div>
      </div>
    </>
  )}

      {/* ── 4 KPI Stat Cards Grid matching image ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
        }}
      >
        {/* Card 1: Average Grade (GPA) */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #ede9fe',
            boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
            padding: '20px 20px 10px 20px',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: '#f3e8ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#7c3aed',
              }}
            >
              <GraduationCap size={18} strokeWidth={2.2} />
            </div>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>
              Average Grade (GPA)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
              {kpis?.avg_gpa || '3.42 / 4.00'}
            </div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                borderRadius: 9999,
                background: '#dcfce7',
                color: '#15803d',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              ↑ {kpis?.gpa_delta_pct ?? 6.2}%
            </div>
          </div>

          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4, marginBottom: 12 }}>
            +{kpis?.gpa_delta_value ?? '0.20'} vs previous period
          </div>

          {/* Smooth purple wave */}
          <div style={{ marginTop: 'auto', marginInline: -20, marginBottom: -10, height: 45 }}>
            <svg viewBox="0 0 280 50" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
              <defs>
                <linearGradient id="purpleWaveGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#9333ea" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#9333ea" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <path d={generateSmoothWavePath(avgGradeSparklinePoints, 280, 50, true)} fill="url(#purpleWaveGrad)" />
              <path
                d={generateSmoothWavePath(avgGradeSparklinePoints, 280, 50, false)}
                fill="none"
                stroke="#9333ea"
                strokeWidth={2.2}
              />
            </svg>
          </div>
        </div>

        {/* Card 2: Pass Rate */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e0f2fe',
            boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
            padding: '20px 20px 10px 20px',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: '#e0f2fe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0284c7',
              }}
            >
              <Users size={18} strokeWidth={2.2} />
            </div>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>Pass Rate</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
              {kpis?.pass_rate != null ? `${kpis.pass_rate}%` : '92.4%'}
            </div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                borderRadius: 9999,
                background: '#dcfce7',
                color: '#15803d',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              ↑ {kpis?.pass_rate_delta_pct ?? 2.1}%
            </div>
          </div>

          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4, marginBottom: 12 }}>
            +{kpis?.pass_rate_delta_value ?? '1.9'}% vs previous period
          </div>

          {/* Smooth cyan wave */}
          <div style={{ marginTop: 'auto', marginInline: -20, marginBottom: -10, height: 45 }}>
            <svg viewBox="0 0 280 50" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
              <defs>
                <linearGradient id="cyanWaveGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <path d={generateSmoothWavePath(passRateSparklinePoints, 280, 50, true)} fill="url(#cyanWaveGrad)" />
              <path
                d={generateSmoothWavePath(passRateSparklinePoints, 280, 50, false)}
                fill="none"
                stroke="#06b6d4"
                strokeWidth={2.2}
              />
            </svg>
          </div>
        </div>

        {/* Card 3: Total Submissions */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #dcfce7',
            boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
            padding: '20px 20px 10px 20px',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: '#dcfce7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#16a34a',
              }}
            >
              <FileText size={18} strokeWidth={2.2} />
            </div>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>
              Total Submissions
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
              {kpis?.total_submissions != null ? kpis.total_submissions.toLocaleString() : '1,842'}
            </div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                borderRadius: 9999,
                background: '#dcfce7',
                color: '#15803d',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              ↑ {kpis?.submissions_delta_pct ?? 12.5}%
            </div>
          </div>

          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4, marginBottom: 12 }}>
            +{kpis?.submissions_delta_value ?? '205'} vs previous period
          </div>

          {/* Smooth green wave */}
          <div style={{ marginTop: 'auto', marginInline: -20, marginBottom: -10, height: 45 }}>
            <svg viewBox="0 0 280 50" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
              <defs>
                <linearGradient id="greenWaveGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <path d={generateSmoothWavePath(submissionsSparklinePoints, 280, 50, true)} fill="url(#greenWaveGrad)" />
              <path
                d={generateSmoothWavePath(submissionsSparklinePoints, 280, 50, false)}
                fill="none"
                stroke="#10b981"
                strokeWidth={2.2}
              />
            </svg>
          </div>
        </div>

        {/* Card 4: At Risk (Low Grade) */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #fee2e2',
            boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
            padding: '20px 20px 10px 20px',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: '#fee2e2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#dc2626',
              }}
            >
              <AlertTriangle size={18} strokeWidth={2.2} />
            </div>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>
              At Risk (Low Grade)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
              {kpis?.at_risk_count != null ? kpis.at_risk_count.toLocaleString() : '38'}
            </div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                borderRadius: 9999,
                background: '#fee2e2',
                color: '#b91c1c',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              ↑ {kpis?.at_risk_delta_pct ?? 4.8}%
            </div>
          </div>

          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4, marginBottom: 12 }}>
            {kpis?.at_risk_subtext || 'Students below threshold'}
          </div>

          {/* Smooth coral wave */}
          <div style={{ marginTop: 'auto', marginInline: -20, marginBottom: -10, height: 45 }}>
            <svg viewBox="0 0 280 50" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
              <defs>
                <linearGradient id="redWaveGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <path d={generateSmoothWavePath(atRiskSparklinePoints, 280, 50, true)} fill="url(#redWaveGrad)" />
              <path
                d={generateSmoothWavePath(atRiskSparklinePoints, 280, 50, false)}
                fill="none"
                stroke="#ef4444"
                strokeWidth={2.2}
              />
            </svg>
          </div>
        </div>
      </div>

      {/* ── Middle Row: Two Charts Side by Side (50% / 50%) matching image ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
          gap: 20,
        }}
      >
        {/* Left: Grade Distribution Histogram */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            padding: '20px 24px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 18,
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: '#f3e8ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#7c3aed',
                }}
              >
                <BarChart2 size={16} strokeWidth={2.4} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                  Grade Distribution Histogram
                </h3>
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                  Distribution of final grades across all subjects
                </p>
              </div>
            </div>

            {/* Subject Selector for Histogram */}
            <div style={{ position: 'relative' }}>
              <select
                value={selectedHistogramSubject}
                onChange={e => setSelectedHistogramSubject(e.target.value)}
                style={{
                  padding: '6px 26px 6px 12px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: '#334155',
                  outline: 'none',
                  appearance: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="all">All Subjects</option>
                {(data?.subjects_list || []).map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} style={{ position: 'absolute', right: 8, top: 9, color: '#94a3b8', pointerEvents: 'none' }} />
            </div>
          </div>

          {/* Histogram Recharts BarChart */}
          <div style={{ width: '100%', height: 260, position: 'relative' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={activeHistogramData}
                margin={{ top: 25, right: 10, left: -10, bottom: 0 }}
                barCategoryGap="28%"
              >
                <defs>
                  <linearGradient id="histBarGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#9333ea" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#a855f7" stopOpacity={0.45} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="bracket"
                  tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  label={{
                    value: 'Number of Students',
                    angle: -90,
                    position: 'insideLeft',
                    fontSize: 10,
                    fill: '#94a3b8',
                    offset: 15,
                  }}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(243, 232, 255, 0.4)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0].payload as GradeHistogramBracket;
                      return (
                        <div
                          style={{
                            background: '#0f172a',
                            color: '#ffffff',
                            padding: '8px 12px',
                            borderRadius: 8,
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                          }}
                        >
                          <div style={{ color: '#c084fc', marginBottom: 2 }}>{item.bracket}</div>
                          <div>Students: {item.count}</div>
                          <div style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{item.pct}% of cohort</div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar
                  dataKey="count"
                  fill="url(#histBarGradient)"
                  radius={[8, 8, 0, 0]}
                  animationDuration={900}
                >
                  <LabelList
                    dataKey="count"
                    position="top"
                    fill="#334155"
                    fontSize={11}
                    fontWeight={700}
                    offset={6}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: Grade Trend Over Time */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            padding: '20px 24px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 18,
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: '#f3e8ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#7c3aed',
                }}
              >
                <TrendingUp size={16} strokeWidth={2.4} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                  Grade Trend Over Time
                </h3>
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                  Average grade comparison across time periods
                </p>
              </div>
            </div>

            {/* Granularity Dropdown */}
            <div style={{ position: 'relative' }}>
              <select
                value={trendGranularity}
                onChange={e => setTrendGranularity(e.target.value as 'monthly' | 'weekly')}
                style={{
                  padding: '6px 26px 6px 12px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: '#334155',
                  outline: 'none',
                  appearance: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
              </select>
              <ChevronDown size={13} style={{ position: 'absolute', right: 8, top: 9, color: '#94a3b8', pointerEvents: 'none' }} />
            </div>
          </div>

          {/* Trend Multi-Line Recharts */}
          <div style={{ width: '100%', height: 235, position: 'relative' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={activeTrendsData}
                margin={{ top: 15, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="instAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0.0, 4.0]}
                  ticks={[0.0, 1.0, 2.0, 3.0, 4.0]}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div
                          style={{
                            background: '#0f172a',
                            color: '#ffffff',
                            padding: '10px 14px',
                            borderRadius: 10,
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            boxShadow: '0 6px 18px rgba(0,0,0,0.2)',
                          }}
                        >
                          <div style={{ color: '#cbd5e1', marginBottom: 6, fontWeight: 700 }}>{label}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
                            <span>Top Performers: </span>
                            <span style={{ color: '#34d399', fontWeight: 800 }}>{payload.find(p => p.dataKey === 'top_performers')?.value} GPA</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#06b6d4' }} />
                            <span>Department Avg: </span>
                            <span style={{ color: '#38bdf8', fontWeight: 800 }}>{payload.find(p => p.dataKey === 'department_avg')?.value} GPA</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#a855f7' }} />
                            <span>Institution Avg: </span>
                            <span style={{ color: '#c084fc', fontWeight: 800 }}>{payload.find(p => p.dataKey === 'institution_avg')?.value} GPA</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                {/* Institution Area with fill */}
                <Area
                  type="monotone"
                  dataKey="institution_avg"
                  stroke="#7c3aed"
                  strokeWidth={2.4}
                  fill="url(#instAreaGrad)"
                  dot={{ r: 3.5, fill: '#ffffff', stroke: '#7c3aed', strokeWidth: 2 }}
                  activeDot={{ r: 5 }}
                />
                {/* Department Average */}
                <Line
                  type="monotone"
                  dataKey="department_avg"
                  stroke="#06b6d4"
                  strokeWidth={2.4}
                  dot={{ r: 3.5, fill: '#ffffff', stroke: '#06b6d4', strokeWidth: 2 }}
                  activeDot={{ r: 5 }}
                />
                {/* Top Performers */}
                <Line
                  type="monotone"
                  dataKey="top_performers"
                  stroke="#10b981"
                  strokeWidth={2.4}
                  dot={{ r: 3.5, fill: '#ffffff', stroke: '#10b981', strokeWidth: 2 }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Custom Legend at Bottom matching image */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 24,
              marginTop: 10,
              paddingTop: 8,
              borderTop: '1px solid #f1f5f9',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#7c3aed' }} />
              <span>Institution Average</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#06b6d4' }} />
              <span>Department Average</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
              <span>Top Performers</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom Row: Two Tables Side by Side (50% / 50%) matching image ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
          gap: 20,
        }}
      >
        {/* Left Table: Top Performing Subjects */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            padding: '20px 24px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#f3e8ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#7c3aed',
              }}
            >
              <Trophy size={16} strokeWidth={2.4} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                Top Performing Subjects
              </h3>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                Subjects with highest average grades
              </p>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <th style={{ padding: '8px 10px', fontSize: '0.72rem', fontWeight: 600, color: '#64748b', width: 35 }}>#</th>
                  <th style={{ padding: '8px 10px', fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>Subject</th>
                  <th style={{ padding: '8px 10px', fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>Students</th>
                  <th style={{ padding: '8px 10px', fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>Avg Grade</th>
                  <th style={{ padding: '8px 10px', fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>Pass Rate</th>
                  <th style={{ padding: '8px 10px', fontSize: '0.72rem', fontWeight: 600, color: '#64748b', width: 80 }}>Trend</th>
                </tr>
              </thead>
              <tbody>
                {topSubjects.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '32px 10px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>
                      No subject grade rankings available for current selection.
                    </td>
                  </tr>
                ) : (
                  topSubjects.map(s => (
                  <tr key={s.subject_id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '12px 10px', fontSize: '0.78rem', fontWeight: 600, color: '#64748b' }}>
                      {s.rank}
                    </td>
                    <td style={{ padding: '12px 10px' }}>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#0f172a' }}>{s.subject_name}</div>
                      {s.subject_code && (
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{s.subject_code}</div>
                      )}
                    </td>
                    <td style={{ padding: '12px 10px', fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                      {s.students_count}
                    </td>
                    <td style={{ padding: '12px 10px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: 6,
                          background: '#f0fdf4',
                          color: '#16a34a',
                          fontSize: '0.76rem',
                          fontWeight: 700,
                        }}
                      >
                        {s.avg_grade_gpa.toFixed(2)}
                      </span>
                    </td>
                    <td style={{ padding: '12px 10px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: 6,
                          background: '#f0fdf4',
                          color: '#16a34a',
                          fontSize: '0.76rem',
                          fontWeight: 700,
                        }}
                      >
                        {s.pass_rate.toFixed(1)}%
                      </span>
                    </td>
                    <td style={{ padding: '12px 10px' }}>
                      <div style={{ width: 70, height: 24 }}>
                        <svg viewBox="0 0 70 24" style={{ width: '100%', height: '100%' }}>
                          <path
                            d={generateSmoothWavePath(s.sparkline, 70, 24, false)}
                            fill="none"
                            stroke="#10b981"
                            strokeWidth={2}
                          />
                        </svg>
                      </div>
                    </td>
                  </tr>
                ))
              )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Table: Needs Attention */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            padding: '20px 24px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#fee2e2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ef4444',
              }}
            >
              <AlertTriangle size={16} strokeWidth={2.4} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                Needs Attention
              </h3>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                Subjects with lower performance or high failure rate
              </p>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <th style={{ padding: '8px 10px', fontSize: '0.72rem', fontWeight: 600, color: '#64748b', width: 35 }}>#</th>
                  <th style={{ padding: '8px 10px', fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>Subject</th>
                  <th style={{ padding: '8px 10px', fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>Students</th>
                  <th style={{ padding: '8px 10px', fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>Avg Grade</th>
                  <th style={{ padding: '8px 10px', fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>Pass Rate</th>
                  <th style={{ padding: '8px 10px', fontSize: '0.72rem', fontWeight: 600, color: '#64748b', width: 80 }}>Trend</th>
                </tr>
              </thead>
              <tbody>
                {needsAttentionSubjects.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '32px 10px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>
                      No subjects requiring attention for current selection.
                    </td>
                  </tr>
                ) : (
                  needsAttentionSubjects.map(s => (
                  <tr key={s.subject_id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '12px 10px', fontSize: '0.78rem', fontWeight: 600, color: '#64748b' }}>
                      {s.rank}
                    </td>
                    <td style={{ padding: '12px 10px' }}>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#0f172a' }}>{s.subject_name}</div>
                      {s.subject_code && (
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{s.subject_code}</div>
                      )}
                    </td>
                    <td style={{ padding: '12px 10px', fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                      {s.students_count}
                    </td>
                    <td style={{ padding: '12px 10px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: 6,
                          background: '#fef2f2',
                          color: '#dc2626',
                          fontSize: '0.76rem',
                          fontWeight: 700,
                        }}
                      >
                        {s.avg_grade_gpa.toFixed(2)}
                      </span>
                    </td>
                    <td style={{ padding: '12px 10px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: 6,
                          background: '#fff7ed',
                          color: '#ea580c',
                          fontSize: '0.76rem',
                          fontWeight: 700,
                        }}
                      >
                        {s.pass_rate.toFixed(1)}%
                      </span>
                    </td>
                    <td style={{ padding: '12px 10px' }}>
                      <div style={{ width: 70, height: 24 }}>
                        <svg viewBox="0 0 70 24" style={{ width: '100%', height: '100%' }}>
                          <path
                            d={generateSmoothWavePath(s.sparkline, 70, 24, false)}
                            fill="none"
                            stroke="#ef4444"
                            strokeWidth={2}
                          />
                        </svg>
                      </div>
                    </td>
                  </tr>
                ))
              )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── 5. Student Grade Roster Table ────────────────────────────────────── */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 16,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03)',
          padding: '22px 24px',
          display: 'flex',
          flexDirection: 'column',
          marginTop: 24,
        }}
      >
        {/* Table Header & Controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: '#f5f3ff',
                border: '1px solid #ddd6fe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#7c3aed',
              }}
            >
              <GraduationCap size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: '0.975rem', fontWeight: 700, color: '#0f172a' }}>
                  Student Grade Roster
                </h3>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: '#f1f5f9',
                    color: '#475569',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                  }}
                >
                  {filteredAndSortedRows.length} Records
                </span>
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                Complete individual assessment submissions and graded marks across all enrolled courses
              </p>
            </div>
          </div>

          {/* Search, Filter Pills & Export */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Search Input */}
            <div style={{ position: 'relative' }}>
              <Search
                size={13}
                style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8', pointerEvents: 'none' }}
              />
              <input
                type="text"
                placeholder="Search student, roll, or subject..."
                value={rosterSearch}
                onChange={e => {
                  setRosterSearch(e.target.value);
                  setRosterPage(1);
                }}
                style={{
                  height: 32,
                  padding: '0 10px 0 30px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  fontSize: '0.75rem',
                  color: '#0f172a',
                  outline: 'none',
                  width: 220,
                }}
              />
              {rosterSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setRosterSearch('');
                    setRosterPage(1);
                  }}
                  style={{
                    position: 'absolute',
                    right: 6,
                    top: 7,
                    border: 'none',
                    background: 'transparent',
                    color: '#94a3b8',
                    cursor: 'pointer',
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Band Filters */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f8fafc', padding: '3px 4px', borderRadius: 8, border: '1px solid #f1f5f9' }}>
              {['all', 'A', 'B', 'C', 'D', 'F'].map(b => (
                <button
                  key={b}
                  type="button"
                  onClick={() => {
                    setBandFilter(b);
                    setRosterPage(1);
                  }}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 6,
                    border: 'none',
                    background: bandFilter === b ? '#7c3aed' : 'transparent',
                    color: bandFilter === b ? '#ffffff' : '#64748b',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {b === 'all' ? 'All' : `Band ${b}`}
                </button>
              ))}
            </div>

            {/* Export CSV Button */}
            <button
              type="button"
              onClick={handleExportRosterCSV}
              style={{
                height: 32,
                padding: '0 12px',
                borderRadius: 8,
                border: 'none',
                background: '#7c3aed',
                color: '#ffffff',
                fontSize: '0.75rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(124, 58, 237, 0.2)',
              }}
            >
              <Download size={13} />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Table Container */}
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 680 }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid #f1f5f9' }}>
                <th style={{ padding: '9px 8px', fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', width: 36 }}>
                  #
                </th>
                <th
                  onClick={() => handleSort('student_name')}
                  style={{ padding: '9px 12px', fontSize: '0.7rem', fontWeight: 600, color: sortField === 'student_name' ? '#7c3aed' : '#94a3b8', cursor: 'pointer', userSelect: 'none' }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    Student Name {renderSortIcon('student_name')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('roll_number')}
                  style={{ padding: '9px 12px', fontSize: '0.7rem', fontWeight: 600, color: sortField === 'roll_number' ? '#7c3aed' : '#94a3b8', cursor: 'pointer', userSelect: 'none' }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    Roll / ID {renderSortIcon('roll_number')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('department_name')}
                  style={{ padding: '9px 12px', fontSize: '0.7rem', fontWeight: 600, color: sortField === 'department_name' ? '#7c3aed' : '#94a3b8', cursor: 'pointer', userSelect: 'none' }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    Department {renderSortIcon('department_name')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('subject_name')}
                  style={{ padding: '9px 12px', fontSize: '0.7rem', fontWeight: 600, color: sortField === 'subject_name' ? '#7c3aed' : '#94a3b8', cursor: 'pointer', userSelect: 'none' }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    Subject {renderSortIcon('subject_name')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('final_grade')}
                  style={{ padding: '9px 12px', fontSize: '0.7rem', fontWeight: 600, color: sortField === 'final_grade' ? '#7c3aed' : '#94a3b8', cursor: 'pointer', userSelect: 'none' }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    Final Grade % {renderSortIcon('final_grade')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('gpa')}
                  style={{ padding: '9px 12px', fontSize: '0.7rem', fontWeight: 600, color: sortField === 'gpa' ? '#7c3aed' : '#94a3b8', cursor: 'pointer', userSelect: 'none' }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    GPA (4.0) {renderSortIcon('gpa')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('band')}
                  style={{ padding: '9px 12px', fontSize: '0.7rem', fontWeight: 600, color: sortField === 'band' ? '#7c3aed' : '#94a3b8', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    Band {renderSortIcon('band')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('graded_at')}
                  style={{ padding: '9px 12px', fontSize: '0.7rem', fontWeight: 600, color: sortField === 'graded_at' ? '#7c3aed' : '#94a3b8', textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                    Graded At {renderSortIcon('graded_at')}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '36px 16px', color: '#64748b', fontSize: '0.82rem' }}>
                    No graded student records match the selected filters for this period.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((r, idx) => {
                  const globalIdx = (rosterPage - 1) * pageSize + idx + 1;
                  const bandStyles: Record<string, { bg: string; color: string }> = {
                    'A': { bg: '#ecfdf5', color: '#059669' },
                    'B': { bg: '#f0f9ff', color: '#0284c7' },
                    'C': { bg: '#fefce8', color: '#ca8a04' },
                    'D': { bg: '#fff7ed', color: '#ea580c' },
                    'F': { bg: '#fff1f2', color: '#e11d48' },
                  };
                  const bStyle = bandStyles[r.band] || { bg: '#f1f5f9', color: '#64748b' };

                  return (
                    <tr
                      key={r.grade_id || `${r.student_id}-${idx}`}
                      style={{
                        borderBottom: '1px solid #f8fafc',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <td style={{ padding: '11px 8px', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 500 }}>
                        {globalIdx}
                      </td>
                      <td style={{ padding: '11px 12px', fontSize: '0.8125rem', fontWeight: 600, color: '#0f172a' }}>
                        {r.student_name}
                      </td>
                      <td style={{ padding: '11px 12px', fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>
                        {r.roll_number}
                      </td>
                      <td style={{ padding: '11px 12px', fontSize: '0.785rem', color: '#475569' }}>
                        {r.department_name || 'General'}
                      </td>
                      <td style={{ padding: '11px 12px' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0f172a' }}>{r.subject_name}</div>
                        {r.subject_code && (
                          <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>{r.subject_code}</div>
                        )}
                      </td>
                      <td style={{ padding: '11px 12px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: r.final_grade >= 75 ? '#ecfdf5' : (r.final_grade >= 50 ? '#eff6ff' : '#fee2e2'),
                            color: r.final_grade >= 75 ? '#059669' : (r.final_grade >= 50 ? '#2563eb' : '#b91c1c'),
                            fontSize: '0.775rem',
                            fontWeight: 700,
                          }}
                        >
                          {Number(r.final_grade || 0).toFixed(1)}%
                        </span>
                      </td>
                      <td style={{ padding: '11px 12px', fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>
                        {(r.gpa ?? 0).toFixed(2)}
                      </td>
                      <td style={{ padding: '11px 12px', textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: bStyle.bg,
                            color: bStyle.color,
                            fontSize: '0.725rem',
                            fontWeight: 800,
                          }}
                        >
                          {r.band || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '11px 12px', fontSize: '0.75rem', color: '#64748b', textAlign: 'right' }}>
                        {r.graded_at ? new Date(r.graded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: 16,
              borderTop: '1px solid #f1f5f9',
              marginTop: 12,
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
              Showing {Math.min((rosterPage - 1) * pageSize + 1, filteredAndSortedRows.length)} to{' '}
              {Math.min(rosterPage * pageSize, filteredAndSortedRows.length)} of {filteredAndSortedRows.length} grade entries
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                onClick={() => setRosterPage(p => Math.max(1, p - 1))}
                disabled={rosterPage === 1}
                style={{
                  height: 30,
                  padding: '0 10px',
                  borderRadius: 6,
                  border: '1px solid #e2e8f0',
                  background: rosterPage === 1 ? '#f8fafc' : '#ffffff',
                  color: rosterPage === 1 ? '#94a3b8' : '#334155',
                  fontSize: '0.725rem',
                  fontWeight: 600,
                  cursor: rosterPage === 1 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <ChevronLeft size={13} />
                <span>Previous</span>
              </button>

              <span style={{ fontSize: '0.725rem', fontWeight: 600, color: '#475569', padding: '0 4px' }}>
                Page {rosterPage} of {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setRosterPage(p => Math.min(totalPages, p + 1))}
                disabled={rosterPage === totalPages}
                style={{
                  height: 30,
                  padding: '0 10px',
                  borderRadius: 6,
                  border: '1px solid #e2e8f0',
                  background: rosterPage === totalPages ? '#f8fafc' : '#ffffff',
                  color: rosterPage === totalPages ? '#94a3b8' : '#334155',
                  fontSize: '0.725rem',
                  fontWeight: 600,
                  cursor: rosterPage === totalPages ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span>Next</span>
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
