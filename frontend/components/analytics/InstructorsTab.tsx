'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Users,
  BarChart2,
  UserCheck,
  BookOpen,
  Star,
  Search,
  SlidersHorizontal,
  Download,
  ChevronDown,
  MoreHorizontal,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Award,
  CheckCircle2,
  AlertTriangle,
  Info,
  X,
  Mail,
  GraduationCap,
  Calendar,
} from 'lucide-react';
import type {
  InstructorsReport,
  InstructorPerf,
  InstructorBenchmarkItem,
  InstructorDepartmentSlice,
} from '@/services/institution.service';
import { exportCSV } from '@/lib/analytics-utils';

interface InstructorsTabProps {
  data: InstructorsReport;
  isLoading?: boolean;
  onRefresh?: () => void;
  days?: number;
  onDaysChange?: (days: number) => void;
  deptId?: string;
  onDeptChange?: (deptId: string) => void;
  secId?: string;
  onSecChange?: (secId: string) => void;
  departments?: Array<{ id: string; name: string }>;
  sections?: Array<{ id: string; name: string }>;
}

// Generate smooth cubic bezier SVG path from array of numeric points
function generateSmoothWavePath(points: number[], width = 280, height = 48, closed = true): string {
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

// Render mini trend sparkline in table row
function renderTrendSparkline(points: number[] | undefined, status: string = 'Good') {
  if (!points || points.length === 0) {
    points =
      status === 'Excellent' || status === 'Good'
        ? [65, 68, 70, 72, 75]
        : status === 'Watch'
        ? [74, 72, 70, 68, 66]
        : [68, 65, 62, 60, 58];
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = 44;
  const height = 16;

  const pts = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((p - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });

  let color = '#10b981';
  if (status === 'Needs Support') {
    color = '#ef4444';
  } else if (status === 'Watch') {
    color = '#f59e0b';
  } else if (points[points.length - 1] < points[0]) {
    color = '#f59e0b';
  }

  return (
    <svg width={width} height={height} style={{ overflow: 'visible', display: 'block' }}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts.join(' ')}
      />
    </svg>
  );
}

// Extract initials for avatar
function getInitials(name: string): string {
  if (!name) return 'IN';
  const clean = name.replace(/^(Dr\.|Prof\.|Mr\.|Ms\.|Mrs\.)\s+/i, '').trim();
  const parts = clean.split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function InstructorsTab({
  data,
  isLoading = false,
  onRefresh,
  days = 30,
  onDaysChange,
  deptId = '',
  onDeptChange,
  secId = '',
  onSecChange,
  departments = [],
  sections = [],
}: InstructorsTabProps) {
  // Benchmark Chart Department Filter
  const [benchmarkDept, setBenchmarkDept] = useState<string>('All Departments');

  // Matrix Table Local State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedInstructorIds, setSelectedInstructorIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<keyof InstructorPerf | 'rank'>('rank');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [viewInstructor, setViewInstructor] = useState<InstructorPerf | null>(null);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);

  // Safe KPI extract
  const kpis = data?.kpis || {
    total_instructors: 0,
    total_instructors_delta_pct: 0,
    total_instructors_sparkline: [],
    avg_student_performance: 0,
    avg_student_performance_delta_pct: 0,
    avg_student_performance_sparkline: [],
    avg_attendance_rate: 0,
    avg_attendance_rate_delta_pct: 0,
    avg_attendance_rate_sparkline: [],
    teaching_workload: 0,
    teaching_workload_delta_pct: 0,
    teaching_workload_sparkline: [],
    student_feedback: 0,
    student_feedback_delta_pct: 0,
    student_feedback_responses: 0,
    student_feedback_sparkline: [],
  };

  const institutionAvg = data?.grade_benchmark?.institution_avg ?? 0;

  // Filter benchmark data by selected department
  const benchmarkData = useMemo(() => {
    const list = data?.grade_benchmark?.instructors || [];
    if (benchmarkDept === 'All Departments') return list;
    return list.filter(item => item.department_name.toLowerCase().includes(benchmarkDept.toLowerCase()));
  }, [data?.grade_benchmark?.instructors, benchmarkDept]);

  // Dynamic department options for benchmark filter
  const benchmarkDeptOptions = useMemo(() => {
    const set = new Set<string>();
    if (departments && departments.length > 0) {
      departments.forEach(d => { if (d.name) set.add(d.name); });
    }
    (data?.grade_benchmark?.instructors || []).forEach(ins => {
      if (ins.department_name) set.add(ins.department_name);
    });
    return Array.from(set).sort();
  }, [departments, data?.grade_benchmark?.instructors]);

  // Department distribution slices
  const deptSlices = useMemo(() => {
    return data?.department_distribution || [];
  }, [data?.department_distribution]);

  // Filtered and sorted table instructors
  const rawInstructors = useMemo(() => data?.instructors || [], [data?.instructors]);

  const filteredInstructors = useMemo(() => {
    return rawInstructors.filter(ins => {
      // Search filter
      const matchesSearch =
        !searchQuery.trim() ||
        ins.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ins.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (ins.department_name || '').toLowerCase().includes(searchQuery.toLowerCase());

      // Status filter
      const matchesStatus =
        statusFilter === 'all' ||
        (ins.status || '').toLowerCase() === statusFilter.toLowerCase();

      return matchesSearch && matchesStatus;
    });
  }, [rawInstructors, searchQuery, statusFilter]);

  const sortedInstructors = useMemo(() => {
    if (sortField === 'rank') {
      return sortDir === 'asc' ? [...filteredInstructors] : [...filteredInstructors].reverse();
    }
    const copy = [...filteredInstructors];
    copy.sort((a, b) => {
      let valA: any = a[sortField as keyof InstructorPerf];
      let valB: any = b[sortField as keyof InstructorPerf];

      if (valA === undefined || valA === null) valA = 0;
      if (valB === undefined || valB === null) valB = 0;

      if (typeof valA === 'string') {
        return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDir === 'asc' ? valA - valB : valB - valA;
    });
    return copy;
  }, [filteredInstructors, sortField, sortDir]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(sortedInstructors.length / pageSize));
  const paginatedInstructors = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedInstructors.slice(start, start + pageSize);
  }, [sortedInstructors, currentPage, pageSize]);

  // Toggle selection
  const handleSelectAll = () => {
    if (selectedInstructorIds.size === sortedInstructors.length) {
      setSelectedInstructorIds(new Set());
    } else {
      setSelectedInstructorIds(new Set(sortedInstructors.map(i => i.instructor_id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedInstructorIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedInstructorIds(next);
  };

  // Sorting helper
  const handleSort = (field: keyof InstructorPerf | 'rank') => {
    if (sortField === field) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const toExport = sortedInstructors.map((ins, index) => ({
      Rank: index + 1,
      Name: ins.full_name,
      Email: ins.email,
      Department: ins.department_name || '',
      Sections: ins.sections_count || 0,
      Students: ins.students_count || 0,
      AvgGrade: `${ins.avg_final_grade ?? 0}%`,
      Attendance: `${ins.avg_attendance ?? 0}%`,
      Engagement: ins.engagement_score ?? 0,
      Feedback: ins.avg_feedback ?? 0,
      Status: ins.status || 'Good',
      SessionsRun: ins.sessions_run || 0,
    }));
    exportCSV(toExport, `instructor-performance-matrix-${new Date().toISOString().split('T')[0]}`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── 1. STAT KPI CARDS (TOP ROW OF 5) ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
          gap: 16,
        }}
      >
        {/* Card 1: Total Instructors */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 14,
            border: '1px solid #f1f5f9',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            height: 140,
          }}
        >
          <div style={{ padding: '16px 16px 0 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: '#f3e8ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#7c3aed',
                }}
              >
                <Users size={16} />
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                Total Instructors
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: '1.9rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                {kpis.total_instructors}
              </span>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#059669',
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  padding: '2px 6px',
                  borderRadius: 9999,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                ↑ {kpis.total_instructors_delta_pct}%
              </span>
            </div>

            <div style={{ fontSize: '0.725rem', color: '#94a3b8', marginTop: 3 }}>
              Active in selected period
            </div>
          </div>

          {/* Purple SVG Wave */}
          <div style={{ width: '100%', height: 38, marginTop: 'auto', overflow: 'hidden' }}>
            <svg
              viewBox="0 0 280 48"
              preserveAspectRatio="none"
              style={{ width: '100%', height: '100%', display: 'block' }}
            >
              <defs>
                <linearGradient id="wavePurpleGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a855f7" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <path
                d={generateSmoothWavePath(kpis.total_instructors_sparkline, 280, 48, true)}
                fill="url(#wavePurpleGrad)"
              />
              <path
                d={generateSmoothWavePath(kpis.total_instructors_sparkline, 280, 48, false)}
                fill="none"
                stroke="#a855f7"
                strokeWidth="2"
              />
            </svg>
          </div>
        </div>

        {/* Card 2: Avg. Student Performance */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 14,
            border: '1px solid #f1f5f9',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            height: 140,
          }}
        >
          <div style={{ padding: '16px 16px 0 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: '#f3e8ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#7c3aed',
                }}
              >
                <BarChart2 size={16} />
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                Avg. Student Performance
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: '1.9rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                {kpis.avg_student_performance}
              </span>
              <span style={{ fontSize: '1.05rem', fontWeight: 600, color: '#64748b' }}>
                / 100
              </span>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#059669',
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  padding: '2px 6px',
                  borderRadius: 9999,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 2,
                  marginLeft: 2,
                }}
              >
                ↑ {kpis.avg_student_performance_delta_pct}%
              </span>
            </div>

            <div style={{ fontSize: '0.725rem', color: '#94a3b8', marginTop: 3 }}>
              Mean final grade across instructors
            </div>
          </div>

          {/* Purple SVG Wave */}
          <div style={{ width: '100%', height: 38, marginTop: 'auto', overflow: 'hidden' }}>
            <svg
              viewBox="0 0 280 48"
              preserveAspectRatio="none"
              style={{ width: '100%', height: '100%', display: 'block' }}
            >
              <path
                d={generateSmoothWavePath(kpis.avg_student_performance_sparkline, 280, 48, true)}
                fill="url(#wavePurpleGrad)"
              />
              <path
                d={generateSmoothWavePath(kpis.avg_student_performance_sparkline, 280, 48, false)}
                fill="none"
                stroke="#a855f7"
                strokeWidth="2"
              />
            </svg>
          </div>
        </div>

        {/* Card 3: Avg. Attendance Rate */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 14,
            border: '1px solid #f1f5f9',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            height: 140,
          }}
        >
          <div style={{ padding: '16px 16px 0 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: '#ecfdf5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#059669',
                }}
              >
                <UserCheck size={16} />
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                Avg. Attendance Rate
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: '1.9rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                {kpis.avg_attendance_rate}%
              </span>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#059669',
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  padding: '2px 6px',
                  borderRadius: 9999,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                ↑ {kpis.avg_attendance_rate_delta_pct}%
              </span>
            </div>

            <div style={{ fontSize: '0.725rem', color: '#94a3b8', marginTop: 3 }}>
              Average student attendance
            </div>
          </div>

          {/* Emerald SVG Wave */}
          <div style={{ width: '100%', height: 38, marginTop: 'auto', overflow: 'hidden' }}>
            <svg
              viewBox="0 0 280 48"
              preserveAspectRatio="none"
              style={{ width: '100%', height: '100%', display: 'block' }}
            >
              <defs>
                <linearGradient id="waveEmeraldGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <path
                d={generateSmoothWavePath(kpis.avg_attendance_rate_sparkline, 280, 48, true)}
                fill="url(#waveEmeraldGrad)"
              />
              <path
                d={generateSmoothWavePath(kpis.avg_attendance_rate_sparkline, 280, 48, false)}
                fill="none"
                stroke="#10b981"
                strokeWidth="2"
              />
            </svg>
          </div>
        </div>

        {/* Card 4: Teaching Workload */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 14,
            border: '1px solid #f1f5f9',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            height: 140,
          }}
        >
          <div style={{ padding: '16px 16px 0 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: '#eff6ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#2563eb',
                }}
              >
                <BookOpen size={16} />
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                Teaching Workload
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: '1.9rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                {kpis.teaching_workload}
              </span>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  color: '#64748b',
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  padding: '2px 6px',
                  borderRadius: 9999,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                ↓ {kpis.teaching_workload_delta_pct.toFixed(1)}%
              </span>
            </div>

            <div style={{ fontSize: '0.725rem', color: '#94a3b8', marginTop: 3 }}>
              Avg. sections per instructor
            </div>
          </div>

          {/* Blue SVG Wave */}
          <div style={{ width: '100%', height: 38, marginTop: 'auto', overflow: 'hidden' }}>
            <svg
              viewBox="0 0 280 48"
              preserveAspectRatio="none"
              style={{ width: '100%', height: '100%', display: 'block' }}
            >
              <defs>
                <linearGradient id="waveBlueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <path
                d={generateSmoothWavePath(kpis.teaching_workload_sparkline, 280, 48, true)}
                fill="url(#waveBlueGrad)"
              />
              <path
                d={generateSmoothWavePath(kpis.teaching_workload_sparkline, 280, 48, false)}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2"
              />
            </svg>
          </div>
        </div>

        {/* Card 5: Student Feedback */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 14,
            border: '1px solid #f1f5f9',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            height: 140,
          }}
        >
          <div style={{ padding: '16px 16px 0 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: '#fffbeb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#d97706',
                }}
              >
                <Star size={16} />
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                Student Feedback
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: '1.9rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                {kpis.student_feedback}
              </span>
              <span style={{ fontSize: '1.05rem', fontWeight: 600, color: '#64748b' }}>
                / 5
              </span>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#059669',
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  padding: '2px 6px',
                  borderRadius: 9999,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 2,
                  marginLeft: 2,
                }}
              >
                ↑ {kpis.student_feedback_delta_pct}%
              </span>
            </div>

            <div style={{ fontSize: '0.725rem', color: '#94a3b8', marginTop: 3 }}>
              Average rating (from {kpis.student_feedback_responses?.toLocaleString() || '1,245'} responses)
            </div>
          </div>

          {/* Amber SVG Wave */}
          <div style={{ width: '100%', height: 38, marginTop: 'auto', overflow: 'hidden' }}>
            <svg
              viewBox="0 0 280 48"
              preserveAspectRatio="none"
              style={{ width: '100%', height: '100%', display: 'block' }}
            >
              <defs>
                <linearGradient id="waveAmberGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <path
                d={generateSmoothWavePath(kpis.student_feedback_sparkline, 280, 48, true)}
                fill="url(#waveAmberGrad)"
              />
              <path
                d={generateSmoothWavePath(kpis.student_feedback_sparkline, 280, 48, false)}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="2"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* ── 2. MIDDLE ROW: BENCHMARK BAR CHART (LEFT) & DISTRIBUTION DONUT (RIGHT) ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)',
          gap: 16,
        }}
      >
        {/* Left Visualization: Instructor Average Grade Benchmark */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 14,
            border: '1px solid #f1f5f9',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            padding: '20px 22px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: '#f5f3ff',
                  border: '1px solid #ddd6fe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#7c3aed',
                }}
              >
                <BarChart2 size={18} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0f172a' }}>
                  Instructor Average Grade Benchmark
                </h3>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
                  Final grades relative to institution average (dotted line)
                </p>
              </div>
            </div>

            {/* Department Dropdown */}
            <div style={{ position: 'relative' }}>
              <select
                value={benchmarkDept}
                onChange={e => setBenchmarkDept(e.target.value)}
                style={{
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  padding: '6px 28px 6px 12px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: '#334155',
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                }}
              >
                <option value="All Departments">All Departments</option>
                {benchmarkDeptOptions.map(name => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                style={{
                  position: 'absolute',
                  right: 9,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                  color: '#64748b',
                }}
              />
            </div>
          </div>

          {/* Bar Chart */}
          <div style={{ width: '100%', height: 260, position: 'relative' }}>
            {/* Institution Avg Badge on Top Right of Chart */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                right: 12,
                fontSize: '0.72rem',
                fontWeight: 600,
                color: '#64748b',
                background: '#f8fafc',
                padding: '2px 8px',
                borderRadius: 4,
                border: '1px dashed #cbd5e1',
                zIndex: 10,
              }}
            >
              Institution Avg: {institutionAvg}%
            </div>

            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={benchmarkData}
                margin={{ top: 20, right: 10, left: -10, bottom: 45 }}
              >
                <defs>
                  <linearGradient id="instructorBarGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#9333ea" />
                    <stop offset="100%" stopColor="#c084fc" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="name"
                  interval={0}
                  angle={-32}
                  textAnchor="end"
                  height={50}
                  tick={{ fontSize: 11, fill: '#475569', fontWeight: 500 }}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 20, 40, 60, 80, 100]}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                  label={{
                    value: 'Average Grade (%)',
                    angle: -90,
                    position: 'insideLeft',
                    offset: 15,
                    style: { fontSize: 11, fill: '#64748b', fontWeight: 500 },
                  }}
                />
                <RechartsTooltip
                  cursor={{ fill: 'rgba(124, 58, 237, 0.05)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const item = payload[0].payload as InstructorBenchmarkItem;
                    const diff = ((item.avg_grade || 0) - institutionAvg).toFixed(1);
                    const isPositive = Number(diff) >= 0;
                    return (
                      <div
                        style={{
                          background: '#0f172a',
                          color: '#ffffff',
                          padding: '10px 14px',
                          borderRadius: 8,
                          fontSize: '0.78rem',
                          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                          minWidth: 180,
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 4 }}>
                          {item.full_name}
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: '0.72rem', marginBottom: 6 }}>
                          {item.department_name}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 2 }}>
                          <span style={{ color: '#cbd5e1' }}>Average Grade:</span>
                          <span style={{ fontWeight: 700, color: '#a855f7' }}>{item.avg_grade}%</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 2 }}>
                          <span style={{ color: '#cbd5e1' }}>Vs Campus Mean:</span>
                          <span style={{ fontWeight: 600, color: isPositive ? '#34d399' : '#f87171' }}>
                            {isPositive ? `+${diff}%` : `${diff}%`}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                          <span style={{ color: '#cbd5e1' }}>Sessions Run:</span>
                          <span style={{ fontWeight: 600 }}>{item.sessions_run}</span>
                        </div>
                      </div>
                    );
                  }}
                />
                <ReferenceLine
                  y={institutionAvg}
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                />
                <Bar
                  dataKey="avg_grade"
                  fill="url(#instructorBarGrad)"
                  radius={[4, 4, 0, 0]}
                  barSize={24}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right Visualization: Instructor Distribution by Department */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 14,
            border: '1px solid #f1f5f9',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            padding: '20px 22px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#f5f3ff',
                border: '1px solid #ddd6fe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#7c3aed',
              }}
            >
              <Info size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0f172a' }}>
                Instructor Distribution by Department
              </h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
                Total {kpis.total_instructors} Instructors
              </p>
            </div>
          </div>

          {/* Donut and Legend Flex Container */}
          {deptSlices.length === 0 ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                minHeight: 180,
                color: '#94a3b8',
                fontSize: '0.82rem',
                textAlign: 'center',
                padding: '20px',
              }}
            >
              No department distribution data available for current selection.
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginTop: 10,
                flex: 1,
              }}
            >
              {/* Donut Chart with Center Text */}
              <div style={{ width: 175, height: 195, position: 'relative', flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={deptSlices}
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="count"
                  >
                    {deptSlices.map((entry, idx) => (
                      <Cell key={`slice-${idx}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const slice = payload[0].payload as InstructorDepartmentSlice;
                      return (
                        <div
                          style={{
                            background: '#0f172a',
                            color: '#ffffff',
                            padding: '6px 12px',
                            borderRadius: 6,
                            fontSize: '0.75rem',
                          }}
                        >
                          <div style={{ fontWeight: 700 }}>{slice.name}</div>
                          <div style={{ color: '#cbd5e1' }}>
                            {slice.count} Instructors ({slice.percentage}%)
                          </div>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Centered Text */}
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center',
                  pointerEvents: 'none',
                }}
              >
                <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
                  {kpis.total_instructors}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500, marginTop: 2 }}>
                  Instructors
                </div>
              </div>
            </div>

            {/* Department Legend */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 9,
                flex: 1,
                minWidth: 0,
              }}
            >
              {deptSlices.map(item => (
                <div
                  key={item.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.78rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: item.color,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        color: '#334155',
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.name}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>{item.count}</span>
                    <span style={{ color: '#64748b', fontSize: '0.74rem', minWidth: 38, textAlign: 'right' }}>
                      {item.percentage}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          )}
        </div>
      </div>

      {/* ── 3. BOTTOM ROW: INSTRUCTOR PERFORMANCE MATRIX (DATA TABLE) ── */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 14,
          border: '1px solid #f1f5f9',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          overflow: 'hidden',
        }}
      >
        {/* Table Toolbar Header */}
        <div
          style={{
            padding: '18px 22px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 14,
          }}
        >
          {/* Title & Subtitle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#f5f3ff',
                border: '1px solid #ddd6fe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#7c3aed',
              }}
            >
              <Users size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0f172a' }}>
                Instructor Performance Matrix
              </h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
                Teaching volume, grades, attendance, engagement and student feedback
              </p>
            </div>
          </div>

          {/* Search, Filter, Export Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Search Input */}
            <div style={{ position: 'relative', width: 260 }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#94a3b8',
                }}
              />
              <input
                type="text"
                placeholder="Search instructors by name or email..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 12px 7px 30px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  fontSize: '0.78rem',
                  color: '#0f172a',
                  outline: 'none',
                  transition: 'border-color 0.15s ease',
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    color: '#94a3b8',
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Filter Button */}
            <button
              type="button"
              onClick={() => setFilterModalOpen(!filterModalOpen)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                background: statusFilter !== 'all' ? '#f5f3ff' : '#ffffff',
                color: statusFilter !== 'all' ? '#7c3aed' : '#475569',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              }}
            >
              <SlidersHorizontal size={14} />
              <span>Filters</span>
              {statusFilter !== 'all' && (
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#7c3aed',
                  }}
                />
              )}
            </button>

            {/* Export CSV Button */}
            <button
              type="button"
              onClick={handleExportCSV}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: 8,
                border: 'none',
                background: '#7c3aed',
                color: '#ffffff',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(124, 58, 237, 0.25)',
                transition: 'background 0.15s ease',
              }}
            >
              <Download size={14} />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Filter Drawer / Bar if open */}
        {filterModalOpen && (
          <div
            style={{
              padding: '12px 22px',
              background: '#f8fafc',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              fontSize: '0.78rem',
            }}
          >
            <span style={{ fontWeight: 600, color: '#475569' }}>Status Filter:</span>
            {['all', 'Excellent', 'Good', 'Watch', 'Needs Support'].map(st => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border:
                    statusFilter === st ? '1px solid #7c3aed' : '1px solid #e2e8f0',
                  background: statusFilter === st ? '#7c3aed' : '#ffffff',
                  color: statusFilter === st ? '#ffffff' : '#475569',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {st === 'all' ? 'All Statuses' : st}
              </button>
            ))}

            {statusFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  marginLeft: 'auto',
                }}
              >
                Clear Filter
              </button>
            )}
          </div>
        )}

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.8rem',
              textAlign: 'left',
            }}
          >
            <thead>
              <tr style={{ background: '#fafbfc', borderBottom: '1px solid #f1f5f9', color: '#64748b', fontSize: '0.74rem' }}>
                {/* Checkbox */}
                <th style={{ width: 30, padding: '9px 4px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={
                      sortedInstructors.length > 0 &&
                      selectedInstructorIds.size === sortedInstructors.length
                    }
                    onChange={handleSelectAll}
                    style={{ cursor: 'pointer', accentColor: '#7c3aed' }}
                  />
                </th>

                {/* Rank # */}
                <th
                  onClick={() => handleSort('rank')}
                  style={{ width: 28, padding: '9px 4px', fontWeight: 600, textAlign: 'center', cursor: 'pointer' }}
                >
                  #
                </th>

                {/* Instructor Name */}
                <th
                  onClick={() => handleSort('full_name')}
                  style={{ padding: '9px 8px', fontWeight: 600, cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>Instructor Name</span>
                    <span style={{ fontSize: '0.66rem', color: '#94a3b8' }}>⇅</span>
                  </div>
                </th>

                {/* Department */}
                <th style={{ padding: '9px 8px', fontWeight: 600 }}>
                  Department
                </th>

                {/* Sections */}
                <th
                  onClick={() => handleSort('sections_count')}
                  style={{ width: 55, padding: '9px 4px', fontWeight: 600, textAlign: 'center', cursor: 'pointer' }}
                >
                  Sections
                </th>

                {/* Students */}
                <th
                  onClick={() => handleSort('students_count')}
                  style={{ width: 58, padding: '9px 4px', fontWeight: 600, textAlign: 'center', cursor: 'pointer' }}
                >
                  Students
                </th>

                {/* Avg Grade */}
                <th
                  onClick={() => handleSort('avg_final_grade')}
                  style={{ width: 75, padding: '9px 4px', fontWeight: 600, textAlign: 'center', cursor: 'pointer' }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <span>Avg Grade</span>
                    <span style={{ fontSize: '0.66rem', color: '#94a3b8' }}>⇅</span>
                  </div>
                </th>

                {/* Attendance % */}
                <th
                  onClick={() => handleSort('avg_attendance')}
                  style={{ width: 82, padding: '9px 4px', fontWeight: 600, textAlign: 'center', cursor: 'pointer' }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <span>Attendance %</span>
                    <span style={{ fontSize: '0.66rem', color: '#94a3b8' }}>⇅</span>
                  </div>
                </th>

                {/* Engagement */}
                <th
                  onClick={() => handleSort('engagement_score')}
                  style={{ width: 72, padding: '9px 4px', fontWeight: 600, textAlign: 'center', cursor: 'pointer' }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <span>Engagement</span>
                    <span style={{ fontSize: '0.66rem', color: '#94a3b8' }}>⇅</span>
                  </div>
                </th>

                {/* Feedback */}
                <th
                  onClick={() => handleSort('avg_feedback')}
                  style={{ width: 62, padding: '9px 4px', fontWeight: 600, textAlign: 'center', cursor: 'pointer' }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <span>Feedback</span>
                    <span style={{ fontSize: '0.66rem', color: '#94a3b8' }}>⇅</span>
                  </div>
                </th>

                {/* Trend */}
                <th style={{ width: 58, padding: '9px 4px', fontWeight: 600, textAlign: 'center' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <span>Trend</span>
                    <span style={{ fontSize: '0.66rem', color: '#94a3b8' }}>⇅</span>
                  </div>
                </th>

                {/* Status */}
                <th
                  onClick={() => handleSort('status')}
                  style={{ width: 85, padding: '9px 4px', fontWeight: 600, textAlign: 'center', cursor: 'pointer' }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <span>Status</span>
                    <span style={{ fontSize: '0.66rem', color: '#94a3b8' }}>⇅</span>
                  </div>
                </th>

                {/* Actions */}
                <th style={{ width: 75, padding: '9px 4px', fontWeight: 600, textAlign: 'center' }}>
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {sortedInstructors.length === 0 ? (
                <tr>
                  <td colSpan={13} style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8' }}>
                    No instructors found matching current filters.
                  </td>
                </tr>
              ) : (
                paginatedInstructors.map((ins, index) => {
                  const isSelected = selectedInstructorIds.has(ins.instructor_id);
                  const status = ins.status || 'Good';
                  const isFeedbackLow = (ins.avg_feedback || 0) < 4.0;
                  const globalRank = (currentPage - 1) * pageSize + index + 1;

                  return (
                    <tr
                      key={ins.instructor_id}
                      style={{
                        borderBottom: '1px solid #f8fafc',
                        background: isSelected ? '#faf5ff' : index % 2 === 0 ? '#ffffff' : '#fafbfc',
                        transition: 'background 0.1s ease',
                      }}
                      onMouseEnter={e => {
                        if (!isSelected) e.currentTarget.style.background = '#f8fafc';
                      }}
                      onMouseLeave={e => {
                        if (!isSelected) {
                          e.currentTarget.style.background = index % 2 === 0 ? '#ffffff' : '#fafbfc';
                        }
                      }}
                    >
                      {/* Checkbox */}
                      <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(ins.instructor_id)}
                          style={{ cursor: 'pointer', accentColor: '#7c3aed' }}
                        />
                      </td>

                      {/* Rank # */}
                      <td style={{ padding: '8px 4px', color: '#64748b', fontWeight: 600, textAlign: 'center' }}>
                        {globalRank}
                      </td>

                      {/* Instructor Avatar + Name + Email */}
                      <td style={{ padding: '8px 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: '50%',
                              background: '#8b5cf6',
                              color: '#ffffff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '0.72rem',
                              flexShrink: 0,
                            }}
                          >
                            {getInitials(ins.full_name)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', fontSize: '0.79rem' }}>
                              {ins.full_name}
                            </div>
                            <div style={{ fontSize: '0.71rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                              {ins.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Department */}
                      <td style={{ padding: '8px 8px', color: '#334155', fontWeight: 500, whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
                        {ins.department_name || 'Unassigned'}
                      </td>

                      {/* Sections */}
                      <td style={{ padding: '8px 4px', textAlign: 'center', fontWeight: 600, color: '#0f172a', fontSize: '0.79rem' }}>
                        {ins.sections_count ?? 0}
                      </td>

                      {/* Students */}
                      <td style={{ padding: '8px 4px', textAlign: 'center', fontWeight: 600, color: '#0f172a', fontSize: '0.79rem' }}>
                        {ins.students_count ?? 0}
                      </td>

                      {/* Avg Grade Pill */}
                      <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 7px',
                            borderRadius: 6,
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            background:
                              (ins.avg_final_grade || 0) >= 80
                                ? '#ecfdf5'
                                : (ins.avg_final_grade || 0) >= 75
                                ? '#fef3c7'
                                : (ins.avg_final_grade || 0) >= 70
                                ? '#fef9c3'
                                : '#fee2e2',
                            color:
                              (ins.avg_final_grade || 0) >= 80
                                ? '#059669'
                                : (ins.avg_final_grade || 0) >= 75
                                ? '#d97706'
                                : (ins.avg_final_grade || 0) >= 70
                                ? '#ca8a04'
                                : '#dc2626',
                          }}
                        >
                          {(ins.avg_final_grade ?? 0).toFixed(1)}%
                        </span>
                      </td>

                      {/* Attendance % Pill */}
                      <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 7px',
                            borderRadius: 6,
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            background:
                              (ins.avg_attendance || 0) >= 80
                                ? '#ecfdf5'
                                : (ins.avg_attendance || 0) >= 75
                                ? '#fef3c7'
                                : '#fee2e2',
                            color:
                              (ins.avg_attendance || 0) >= 80
                                ? '#059669'
                                : (ins.avg_attendance || 0) >= 75
                                ? '#d97706'
                                : '#dc2626',
                          }}
                        >
                          {(ins.avg_attendance ?? 0).toFixed(1)}%
                        </span>
                      </td>

                      {/* Engagement */}
                      <td style={{ padding: '8px 4px', textAlign: 'center', fontWeight: 600, color: '#334155', fontSize: '0.78rem' }}>
                        {ins.engagement_score !== undefined && ins.engagement_score !== null
                          ? Number(ins.engagement_score).toFixed(1)
                          : '-'}
                      </td>

                      {/* Feedback */}
                      <td
                        style={{
                          padding: '8px 4px',
                          textAlign: 'center',
                          fontWeight: 700,
                          fontSize: '0.78rem',
                          color: isFeedbackLow ? '#ef4444' : '#334155',
                        }}
                      >
                        {ins.avg_feedback !== undefined && ins.avg_feedback !== null
                          ? Number(ins.avg_feedback).toFixed(1)
                          : '-'}
                      </td>

                      {/* Trend Sparkline */}
                      <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          {renderTrendSparkline(
                            ins.trend_sparkline,
                            status
                          )}
                        </div>
                      </td>

                      {/* Status Pill */}
                      <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 9999,
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            background:
                              status === 'Excellent'
                                ? '#ecfdf5'
                                : status === 'Good'
                                ? '#e0f2fe'
                                : status === 'Watch'
                                ? '#fffbeb'
                                : '#fef2f2',
                            border: `1px solid ${
                              status === 'Excellent'
                                ? '#a7f3d0'
                                : status === 'Good'
                                ? '#bae6fd'
                                : status === 'Watch'
                                ? '#fde68a'
                                : '#fecaca'
                            }`,
                            color:
                              status === 'Excellent'
                                ? '#059669'
                                : status === 'Good'
                                ? '#0284c7'
                                : status === 'Watch'
                                ? '#d97706'
                                : '#dc2626',
                          }}
                        >
                          {status}
                        </span>
                      </td>

                      {/* Actions: View Button & ... */}
                      <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => setViewInstructor(ins)}
                            style={{
                              padding: '4px 12px',
                              borderRadius: 6,
                              border: 'none',
                              background: '#f3e8ff',
                              color: '#7c3aed',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = '#e9d5ff';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = '#f3e8ff';
                            }}
                          >
                            View
                          </button>

                          <div style={{ position: 'relative' }}>
                            <button
                              type="button"
                              onClick={() =>
                                setActionMenuId(
                                  actionMenuId === ins.instructor_id ? null : ins.instructor_id
                                )
                              }
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#94a3b8',
                                cursor: 'pointer',
                                padding: 2,
                                display: 'flex',
                                alignItems: 'center',
                              }}
                            >
                              <MoreHorizontal size={16} />
                            </button>

                            {/* Dropdown Action Menu */}
                            {actionMenuId === ins.instructor_id && (
                              <div
                                style={{
                                  position: 'absolute',
                                  right: 0,
                                  top: '100%',
                                  marginTop: 4,
                                  background: '#ffffff',
                                  borderRadius: 8,
                                  border: '1px solid #e2e8f0',
                                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                  zIndex: 50,
                                  minWidth: 150,
                                  overflow: 'hidden',
                                  fontSize: '0.76rem',
                                  textAlign: 'left',
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setViewInstructor(ins);
                                    setActionMenuId(null);
                                  }}
                                  style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    background: 'none',
                                    border: 'none',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    color: '#1e293b',
                                  }}
                                  onMouseEnter={e => {
                                    e.currentTarget.style.background = '#f8fafc';
                                  }}
                                  onMouseLeave={e => {
                                    e.currentTarget.style.background = 'none';
                                  }}
                                >
                                  Full Analytics Profile
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    window.open(`mailto:${ins.email}`);
                                    setActionMenuId(null);
                                  }}
                                  style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    background: 'none',
                                    border: 'none',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    color: '#1e293b',
                                  }}
                                  onMouseEnter={e => {
                                    e.currentTarget.style.background = '#f8fafc';
                                  }}
                                  onMouseLeave={e => {
                                    e.currentTarget.style.background = 'none';
                                  }}
                                >
                                  Contact Instructor
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {sortedInstructors.length > 0 && (
          <div
            style={{
              padding: '14px 20px',
              borderTop: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#ffffff',
              fontSize: '0.82rem',
              color: '#64748b',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div>
                Showing {Math.min((currentPage - 1) * pageSize + 1, sortedInstructors.length)} to{' '}
                {Math.min(currentPage * pageSize, sortedInstructors.length)} of {sortedInstructors.length} instructors
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Rows:</span>
                <select
                  value={pageSize}
                  onChange={e => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  style={{
                    padding: '2px 6px',
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                    fontSize: '0.75rem',
                    color: '#334155',
                    background: '#ffffff',
                    cursor: 'pointer',
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                style={{
                  padding: '5px 12px',
                  borderRadius: 6,
                  border: '1px solid #e2e8f0',
                  background: currentPage <= 1 ? '#f8fafc' : '#ffffff',
                  color: currentPage <= 1 ? '#94a3b8' : '#334155',
                  cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: '0.78rem',
                }}
              >
                Previous
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pNum = i + 1;
                if (totalPages > 5 && currentPage > 3) {
                  pNum = Math.min(currentPage - 2 + i, totalPages);
                }
                return (
                  <button
                    key={pNum}
                    type="button"
                    onClick={() => setCurrentPage(pNum)}
                    style={{
                      padding: '4px 9px',
                      borderRadius: 6,
                      border: pNum === currentPage ? '1px solid #7c3aed' : '1px solid #e2e8f0',
                      background: pNum === currentPage ? '#7c3aed' : '#ffffff',
                      color: pNum === currentPage ? '#ffffff' : '#475569',
                      cursor: 'pointer',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                    }}
                  >
                    {pNum}
                  </button>
                );
              })}
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                style={{
                  padding: '5px 12px',
                  borderRadius: 6,
                  border: '1px solid #e2e8f0',
                  background: currentPage >= totalPages ? '#f8fafc' : '#ffffff',
                  color: currentPage >= totalPages ? '#94a3b8' : '#334155',
                  cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: '0.78rem',
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── 4. INSTRUCTOR DETAIL MODAL (WHEN VIEW CLICKED) ── */}
      {viewInstructor && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 20,
          }}
          onClick={() => setViewInstructor(null)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 16,
              maxWidth: 580,
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
              overflow: 'hidden',
              animation: 'fadeIn 0.2s ease',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#fafbfc',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: '#8b5cf6',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1rem',
                    fontWeight: 700,
                  }}
                >
                  {getInitials(viewInstructor.full_name)}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                    {viewInstructor.full_name}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', color: '#64748b' }}>
                    <span>{viewInstructor.department_name}</span>
                    <span>•</span>
                    <span>{viewInstructor.email}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setViewInstructor(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body: Metrics Grid */}
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 10, border: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Avg Grade</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#7c3aed', marginTop: 2 }}>
                    {(viewInstructor.avg_final_grade ?? 0).toFixed(1)}%
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Campus: {institutionAvg}%</div>
                </div>

                <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 10, border: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Attendance</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#10b981', marginTop: 2 }}>
                    {(viewInstructor.avg_attendance ?? 0).toFixed(1)}%
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Campus: 82.4%</div>
                </div>

                <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 10, border: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Student Rating</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f59e0b', marginTop: 2 }}>
                    {(viewInstructor.avg_feedback ?? 4.0).toFixed(1)} / 5.0
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Campus: 4.3 / 5</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 10, border: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Sections</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                    {viewInstructor.sections_count || 2}
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 10, border: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Enrolled Students</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                    {viewInstructor.students_count || 90}
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 10, border: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Sessions Run</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                    {viewInstructor.sessions_run || 10}
                  </div>
                </div>
              </div>

              {/* Status and Action Buttons */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: 10,
                  borderTop: '1px solid #f1f5f9',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Assigned Status:</span>
                  <span
                    style={{
                      padding: '3px 10px',
                      borderRadius: 9999,
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      background:
                        viewInstructor.status === 'Excellent'
                          ? '#ecfdf5'
                          : viewInstructor.status === 'Good'
                          ? '#e0f2fe'
                          : viewInstructor.status === 'Watch'
                          ? '#fffbeb'
                          : '#fef2f2',
                      color:
                        viewInstructor.status === 'Excellent'
                          ? '#059669'
                          : viewInstructor.status === 'Good'
                          ? '#0284c7'
                          : viewInstructor.status === 'Watch'
                          ? '#d97706'
                          : '#dc2626',
                    }}
                  >
                    {viewInstructor.status || 'Good'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setViewInstructor(null)}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 8,
                    background: '#7c3aed',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
