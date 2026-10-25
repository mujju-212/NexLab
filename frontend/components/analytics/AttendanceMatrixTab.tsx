'use client';

import styles from './analytics.module.css';
import React, { useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  UserCheck,
  CheckCircle,
  AlertTriangle,
  Calendar,
  BarChart2,
  TrendingUp,
  Search,
  SlidersHorizontal,
  Download,
  ChevronDown,
  MoreHorizontal,
  Check,
  Mail,
  User,
  Filter,
  X,
  Clock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import type { AttendanceReport, LowAttendanceStudent } from '@/services/institution.service';
import { exportCSV } from '@/lib/analytics-utils';

interface AttendanceMatrixTabProps {
  data: AttendanceReport;
  isLoading?: boolean;
  onRefresh?: () => void;
  onSelectStudent?: (studentId: string) => void;
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
function generateSmoothWavePath(points: number[], width = 280, height = 54, closed = true): string {
  const clean = (points || []).filter((p: any) => typeof p === 'number' && Number.isFinite(p));
  if (clean.length < 2) return '';  // one point is not a line
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const range = max - min || 1;

  const pts = clean.map((p, i) => {
    const x = (i / ((points.length) - 1)) * width;
    const y = height - ((p - min) / range) * (height - 14) - 7;
    return { x, y };
  });

  if (!pts || pts.length === 0) return '';  // nothing measured -> no path
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

// Format integers with thousand commas
function formatNumber(num: number | undefined | null): string {
  if (num === undefined || num === null) return '0';
  return num.toLocaleString();
}

export default function AttendanceMatrixTab({
  data,
  isLoading = false,
  onRefresh,
  onSelectStudent,
  days = 30,
  onDaysChange,
  deptId = '',
  onDeptChange,
  secId = '',
  onSecChange,
  departments = [],
  sections = [],
}: AttendanceMatrixTabProps) {
  // Local filter states
  const [trendRange, setTrendRange] = useState<number>(days);
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [heatmapSection, setHeatmapSection] = useState<string>('all');
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [thresholdFilterOpen, setThresholdFilterOpen] = useState(false);
  const [thresholdLimit, setThresholdLimit] = useState<number>(75);
  const [actionMenuStudentId, setActionMenuStudentId] = useState<string | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{
    day: string;
    hourLabel: string;
    rate: number;
    tier: string;
    sessionCount: number;
    x: number;
    y: number;
  } | null>(null);

  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 8;

  type LowAttSortField = 'full_name' | 'roll_number' | 'department_name' | 'attendance_rate' | 'missed_sessions';
  type LowAttSortOrder = 'asc' | 'desc';

  const [sortField, setSortField] = useState<LowAttSortField>('attendance_rate');
  const [sortOrder, setSortOrder] = useState<LowAttSortOrder>('asc');

  const handleSort = (field: LowAttSortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'attendance_rate' ? 'asc' : 'desc');
    }
  };

  const renderSortIcon = (field: LowAttSortField) => {
    if (sortField !== field) {
      return <ArrowUpDown size={11} style={{ opacity: 0.35, marginLeft: 4 }} />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp size={11} style={{ color: '#7c3aed', marginLeft: 4 }} />
    ) : (
      <ArrowDown size={11} style={{ color: '#7c3aed', marginLeft: 4 }} />
    );
  };

  // Real Database Telemetry with zero mock presets
  const avgRate = data?.avg_attendance_rate ?? 0.0;
  const presentCount = data?.total_present_records ?? 0;
  const absentCount = data?.total_absent_records ?? 0;
  const sessionsCount = data?.total_scheduled_sessions ?? 0;

  const deltas = data?.deltas || {
    attendance: 0.0,
    present: 0.0,
    absent: 0.0,
    sessions: 0.0,
  };

  const sparklines = data?.sparklines || {
    attendance: [0, 0, 0, 0, 0, 0, 0],
    present: [0, 0, 0, 0, 0, 0, 0],
    absent: [0, 0, 0, 0, 0, 0, 0],
    sessions: [0, 0, 0, 0, 0, 0, 0],
  };

  // Trend data
  const trendData = useMemo(() => {
    if (data?.attendance_trend && data.attendance_trend.length > 0) {
      return data.attendance_trend;
    }
    return [];
  }, [data?.attendance_trend]);

  // Department ranking data
  const deptList = useMemo(() => {
    const list = data?.by_department && data.by_department.length > 0 ? data.by_department : [];
    if (deptFilter !== 'all') {
      return list.filter(d => (d.name && d.name.toLowerCase().includes(deptFilter.toLowerCase())) || (d.code && d.code.toLowerCase() === deptFilter.toLowerCase()));
    }
    return list;
  }, [data?.by_department, deptFilter]);

  // Heatmap matrix
  const daysList = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hoursList = ['8AM', '9AM', '10AM', '11AM', '12PM', '1PM', '2PM', '3PM', '4PM', '5PM'];

  const heatmapMatrix = useMemo(() => {
    const map: Record<string, { rate: number; tier: string; sessionCount: number }> = {};
    if (data?.heatmap && data.heatmap.length > 0) {
      data.heatmap.forEach(cell => {
        map[`${cell.day}-${cell.hour_label}`] = {
          rate: cell.attendance_rate,
          tier: cell.tier,
          sessionCount: cell.session_count,
        };
      });
    }
    return map;
  }, [data?.heatmap]);

  // Color generator for heatmap cell
  const getHeatmapColor = (rate: number) => {
    if (rate >= 90) return '#059669'; // Deep emerald
    if (rate >= 75) return '#86efac'; // Soft fresh green
    if (rate >= 50) return '#fef08a'; // Soft cream yellow
    if (rate >= 25) return '#fdba74'; // Warm peach orange
    return '#f87171'; // Soft coral red
  };

  // Heatmap highlights and schedule insights
  const heatmapStats = useMemo(() => {
    // No real cells yet => no invented "peak slot" labels.
    let peak = { label: '—', rate: 0 };
    let lowest = { label: '—', rate: 0 };
    let seenAny = false;
    let amSum = 0, amCount = 0;
    let pmSum = 0, pmCount = 0;

    daysList.forEach(day => {
      hoursList.forEach((hour, hIdx) => {
        const cell = heatmapMatrix[`${day}-${hour}`];
        if (cell) {
          if (!seenAny) {
            // seed peak/lowest from the first real cell so we never compare
            // against invented defaults
            seenAny = true;
            peak = { label: `${day} ${hour}`, rate: cell.rate };
            lowest = { label: `${day} ${hour}`, rate: cell.rate };
          } else {
            if (cell.rate > peak.rate) {
              peak = { label: `${day} ${hour}`, rate: cell.rate };
            }
            if (cell.rate < lowest.rate) {
              lowest = { label: `${day} ${hour}`, rate: cell.rate };
            }
          }
          if (hIdx < 5) { // 8AM - 12PM
            amSum += cell.rate;
            amCount++;
          } else { // 1PM - 5PM
            pmSum += cell.rate;
            pmCount++;
          }
        }
      });
    });

    const amAvg = amCount ? Math.round(amSum / amCount) : 0;
    const pmAvg = pmCount ? Math.round(pmSum / pmCount) : 0;

    return {
      peak,
      lowest,
      morningAvg: amAvg,
      afternoonAvg: pmAvg,
    };
  }, [heatmapMatrix]);

  // Low attendance students (genuine database telemetry with sorting)
  const lowStudents: LowAttendanceStudent[] = useMemo(() => {
    let list: LowAttendanceStudent[] = [];
    if (data?.low_attendance_students && data.low_attendance_students.length > 0) {
      list = [...data.low_attendance_students];
    }

    // Apply search filter
    if (studentSearch.trim()) {
      const q = studentSearch.toLowerCase().trim();
      list = list.filter(
        s =>
          s.full_name.toLowerCase().includes(q) ||
          s.roll_number.toLowerCase().includes(q) ||
          s.department_name.toLowerCase().includes(q)
      );
    }

    // Apply threshold filter
    list = list.filter(s => (s.attendance_rate ?? 0) <= thresholdLimit);

    // Apply sorting
    list.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (typeof aVal === 'string') {
        const cmp = (aVal || '').localeCompare(bVal || '');
        return sortOrder === 'asc' ? cmp : -cmp;
      }

      const numA = Number(aVal ?? (sortOrder === 'asc' ? Infinity : -Infinity));
      const numB = Number(bVal ?? (sortOrder === 'asc' ? Infinity : -Infinity));
      return sortOrder === 'asc' ? numA - numB : numB - numA;
    });

    return list;
  }, [data?.low_attendance_students, studentSearch, thresholdLimit, sortField, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(lowStudents.length / pageSize));
  const paginatedLowStudents = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return lowStudents.slice(startIdx, startIdx + pageSize);
  }, [lowStudents, currentPage, pageSize]);

  // Checkbox handlers
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedStudentIds(new Set(lowStudents.map(s => s.student_id)));
    } else {
      setSelectedStudentIds(new Set());
    }
  };

  const handleSelectStudent = (id: string) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExportLowAttendanceCSV = () => {
    const rows = lowStudents.map((s, idx) => ({
      Index: idx + 1,
      StudentName: s.full_name,
      StudentID: s.roll_number,
      Department: s.department_name,
      AttendanceRate: `${s.attendance_rate}%`,
      MissedSessions: s.missed_sessions,
      TotalSessions: s.total_sessions,
      RiskLevel: s.risk_level,
    }));
    exportCSV(rows, `low-attendance-students-${new Date().toISOString().slice(0, 10)}`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%' }}>
      {/* ── TOP 4 KPI CARDS ─────────────────────────────────────────────────── */}
      <div
        className={styles.instructorKpiRow}
          style={{

          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16,
          width: '100%',
        }}
      >
        {/* KPI 1: Average Attendance */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            minHeight: 154,
          }}
        >
          <div style={{ padding: '20px 22px 0 22px', position: 'relative', zIndex: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: '#ecfdf5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#10b981',
                }}
              >
                <UserCheck size={18} />
              </div>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#475569' }}>
                Average Attendance
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: '1.875rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                {avgRate == null ? '—' : `${avgRate.toFixed(1)}%`}
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#10b981',
                  background: '#ecfdf5',
                  padding: '2px 8px',
                  borderRadius: 6,
                }}
              >
                ↑ {deltas.attendance == null ? '—' : `${deltas.attendance.toFixed(1)}%`}
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
              Across all scheduled sessions
            </p>
          </div>

          {/* Flowing Purple Wave Sparkline */}
          <div style={{ width: '100%', height: 50, marginTop: 'auto', position: 'relative' }}>
            <svg
              viewBox="0 0 280 50"
              preserveAspectRatio="none"
              style={{ width: '100%', height: '100%', display: 'block' }}
            >
              <defs>
                <linearGradient id="purpleWaveGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#c084fc" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#c084fc" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d={generateSmoothWavePath(sparklines.attendance, 280, 50, true)}
                fill="url(#purpleWaveGrad)"
              />
              <path
                d={generateSmoothWavePath(sparklines.attendance, 280, 50, false)}
                fill="none"
                stroke="#a855f7"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* KPI 2: Present Records */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            minHeight: 154,
          }}
        >
          <div style={{ padding: '20px 22px 0 22px', position: 'relative', zIndex: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: '#f0fdf4',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#10b981',
                }}
              >
                <CheckCircle size={18} />
              </div>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#475569' }}>
                Present Records
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: '1.875rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                {formatNumber(presentCount)}
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#10b981',
                  background: '#ecfdf5',
                  padding: '2px 8px',
                  borderRadius: 6,
                }}
              >
                ↑ {deltas.present == null ? '—' : `${deltas.present.toFixed(1)}%`}
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
              Student-session attendances
            </p>
          </div>

          {/* Flowing Green Wave Sparkline */}
          <div style={{ width: '100%', height: 50, marginTop: 'auto', position: 'relative' }}>
            <svg
              viewBox="0 0 280 50"
              preserveAspectRatio="none"
              style={{ width: '100%', height: '100%', display: 'block' }}
            >
              <defs>
                <linearGradient id="greenWaveGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4ade80" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#4ade80" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d={generateSmoothWavePath(sparklines.present, 280, 50, true)}
                fill="url(#greenWaveGrad)"
              />
              <path
                d={generateSmoothWavePath(sparklines.present, 280, 50, false)}
                fill="none"
                stroke="#10b981"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* KPI 3: Absent Records */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            minHeight: 154,
          }}
        >
          <div style={{ padding: '20px 22px 0 22px', position: 'relative', zIndex: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: '#fef2f2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ef4444',
                }}
              >
                <AlertTriangle size={18} />
              </div>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#475569' }}>
                Absent Records
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: '1.875rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                {formatNumber(absentCount)}
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#ef4444',
                  background: '#fef2f2',
                  padding: '2px 8px',
                  borderRadius: 6,
                }}
              >
                ↑ {deltas.absent == null ? '—' : `${deltas.absent.toFixed(1)}%`}
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
              Missed scheduled sessions
            </p>
          </div>

          {/* Flowing Red Wave Sparkline */}
          <div style={{ width: '100%', height: 50, marginTop: 'auto', position: 'relative' }}>
            <svg
              viewBox="0 0 280 50"
              preserveAspectRatio="none"
              style={{ width: '100%', height: '100%', display: 'block' }}
            >
              <defs>
                <linearGradient id="redWaveGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f87171" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#f87171" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d={generateSmoothWavePath(sparklines.absent, 280, 50, true)}
                fill="url(#redWaveGrad)"
              />
              <path
                d={generateSmoothWavePath(sparklines.absent, 280, 50, false)}
                fill="none"
                stroke="#ef4444"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* KPI 4: Scheduled Sessions */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            minHeight: 154,
          }}
        >
          <div style={{ padding: '20px 22px 0 22px', position: 'relative', zIndex: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: '#f0f9ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#0284c7',
                }}
              >
                <Calendar size={18} />
              </div>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#475569' }}>
                Scheduled Sessions
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: '1.875rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                {formatNumber(sessionsCount)}
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#64748b',
                  background: '#f1f5f9',
                  padding: '2px 8px',
                  borderRadius: 6,
                }}
              >
                {deltas.sessions >= 0 ? `0.0%` : `${deltas.sessions == null ? '—' : `${deltas.sessions.toFixed(1)}%`}`}
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
              Conducted in selected period
            </p>
          </div>

          {/* Flowing Blue Wave Sparkline */}
          <div style={{ width: '100%', height: 50, marginTop: 'auto', position: 'relative' }}>
            <svg
              viewBox="0 0 280 50"
              preserveAspectRatio="none"
              style={{ width: '100%', height: '100%', display: 'block' }}
            >
              <defs>
                <linearGradient id="blueWaveGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d={generateSmoothWavePath(sparklines.sessions, 280, 50, true)}
                fill="url(#blueWaveGrad)"
              />
              <path
                d={generateSmoothWavePath(sparklines.sessions, 280, 50, false)}
                fill="none"
                stroke="#0284c7"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* ── MIDDLE ROW: TREND & DEPARTMENT BARS (50% / 50%) ─────────────────── */}
      <div
        className={styles.mobileFullStack}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
          gap: 20,
          width: '100%',
        }}
      >
        {/* Card Left: Attendance Trend */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03)',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Card Header */}
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
                  width: 34,
                  height: 34,
                  borderRadius: 10,
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
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                  Attendance Trend
                </h3>
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                  Daily attendance rate across the selected period
                </p>
              </div>
            </div>

            {/* Date range dropdown */}
            <div style={{ position: 'relative' }}>
              <select
                value={trendRange}
                onChange={e => {
                  const val = Number(e.target.value);
                  setTrendRange(val);
                  if (onDaysChange) onDaysChange(val);
                }}
                style={{
                  height: 32,
                  padding: '0 26px 0 10px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#334155',
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
              </select>
              <ChevronDown
                size={13}
                style={{ position: 'absolute', right: 8, top: 10, color: '#94a3b8', pointerEvents: 'none' }}
              />
            </div>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#7c3aed' }} />
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>Overall</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>Present</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>Absent</span>
            </div>
          </div>

          {/* Area Chart */}
          <div style={{ width: '100%', height: 260, position: 'relative' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="trendOverallGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.12" />
                    <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="trendPresentGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.10" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="trendAbsentGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity="0.08" />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tickFormatter={v => `${v}%`}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <RechartsTooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const dataPoint = payload[0].payload;
                      return (
                        <div
                          style={{
                            background: '#ffffff',
                            borderRadius: 10,
                            padding: '10px 14px',
                            border: '1px solid #ede9fe',
                            boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
                            fontSize: '0.75rem',
                          }}
                        >
                          <p style={{ margin: '0 0 6px 0', fontWeight: 700, color: '#0f172a' }}>{label}</p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                              <span style={{ color: '#7c3aed', fontWeight: 600 }}>Overall Rate:</span>
                              <span style={{ fontWeight: 700, color: '#0f172a' }}>{dataPoint.overall}%</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                              <span style={{ color: '#10b981', fontWeight: 600 }}>Present:</span>
                              <span style={{ fontWeight: 700, color: '#0f172a' }}>{dataPoint.present}%</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                              <span style={{ color: '#ef4444', fontWeight: 600 }}>Absent:</span>
                              <span style={{ fontWeight: 700, color: '#0f172a' }}>{dataPoint.absent}%</span>
                            </div>
                            {dataPoint.sessions_count && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, borderTop: '1px dashed #e2e8f0', paddingTop: 4, marginTop: 2 }}>
                                <span style={{ color: '#64748b' }}>Sessions:</span>
                                <span style={{ fontWeight: 600, color: '#334155' }}>{dataPoint.sessions_count}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="overall"
                  stroke="#7c3aed"
                  strokeWidth={2.5}
                  fill="url(#trendOverallGrad)"
                  dot={{ r: 3.5, fill: '#7c3aed', strokeWidth: 1, stroke: '#ffffff' }}
                  activeDot={{ r: 5, stroke: '#7c3aed', strokeWidth: 2 }}
                />
                <Area
                  type="monotone"
                  dataKey="present"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fill="url(#trendPresentGrad)"
                  dot={{ r: 3.5, fill: '#10b981', strokeWidth: 1, stroke: '#ffffff' }}
                  activeDot={{ r: 5, stroke: '#10b981', strokeWidth: 2 }}
                />
                <Area
                  type="monotone"
                  dataKey="absent"
                  stroke="#ef4444"
                  strokeWidth={2.5}
                  fill="url(#trendAbsentGrad)"
                  dot={{ r: 3.5, fill: '#ef4444', strokeWidth: 1, stroke: '#ffffff' }}
                  activeDot={{ r: 5, stroke: '#ef4444', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Card Right: Attendance by Department */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03)',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Card Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 20,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
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
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                  Attendance by Department
                </h3>
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                  Average attendance percentage by department
                </p>
              </div>
            </div>

            {/* Department Filter dropdown */}
            <div style={{ position: 'relative' }}>
              <select
                value={deptFilter}
                onChange={e => setDeptFilter(e.target.value)}
                style={{
                  height: 32,
                  padding: '0 26px 0 10px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#334155',
                  outline: 'none',
                  appearance: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="all">All Departments</option>
                {deptList.map((d, idx) => (
                  <option key={(d as any).id || `${d.code || d.name}-${idx}`} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={13}
                style={{ position: 'absolute', right: 8, top: 10, color: '#94a3b8', pointerEvents: 'none' }}
              />
            </div>
          </div>

          {/* Department Progress Bars List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 4 }}>
            {deptList.map((dept, idx) => (
              <div
                key={(dept as any).id || `${dept.name}-${idx}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '2px 0',
                }}
              >
                {/* Department Name */}
                <div
                  style={{
                    width: 200,
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    color: '#334155',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={dept.name}
                >
                  {dept.name}
                </div>

                {/* Progress Track */}
                <div
                  style={{
                    flex: 1,
                    height: 10,
                    background: '#ede9fe',
                    borderRadius: 9999,
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, Math.max(0, dept.rate))}%`,
                      background: '#8b5cf6',
                      borderRadius: 9999,
                      transition: 'width 0.5s ease',
                    }}
                  />
                </div>

                {/* Percentage */}
                <div
                  style={{
                    width: 48,
                    textAlign: 'right',
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    color: '#0f172a',
                  }}
                >
                  {dept.rate == null ? '—' : `${dept.rate.toFixed(1)}%`}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── BOTTOM ROW: HEATMAP & LOW ATTENDANCE TABLE (50% / 50%) ─────────── */}
      <div
        className={styles.mobileFullStack}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
          gap: 20,
          width: '100%',
        }}
      >
        {/* Card Left: Session Attendance Heatmap */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03)',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
          }}
        >
          {/* Card Header */}
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
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: '#f5f3ff',
                  border: '1px solid #ddd6fe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#7c3aed',
                }}
              >
                <Calendar size={18} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                  Session Attendance Heatmap
                </h3>
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                  Attendance percentage by day and hour
                </p>
              </div>
            </div>

            {/* Section Filter dropdown */}
            <div style={{ position: 'relative' }}>
              <select
                value={heatmapSection}
                onChange={e => setHeatmapSection(e.target.value)}
                style={{
                  height: 32,
                  padding: '0 26px 0 10px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#334155',
                  outline: 'none',
                  appearance: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="all">All Sections</option>
                {sections.map((s, idx) => (
                  <option key={s.id || `${s.name}-${idx}`} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={13}
                style={{ position: 'absolute', right: 8, top: 10, color: '#94a3b8', pointerEvents: 'none' }}
              />
            </div>
          </div>

          {/* Full-width Matrix Grid */}
          <div style={{ width: '100%', overflowX: 'auto', paddingBottom: 4 }}>
            <div style={{ minWidth: 420 }}>
              {/* Day rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {daysList.map(day => (
                  <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Day label */}
                    <span
                      style={{
                        width: 36,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: '#64748b',
                        textAlign: 'left',
                        flexShrink: 0,
                      }}
                    >
                      {day}
                    </span>

                    {/* 10 hour cells */}
                    <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                      {hoursList.map(hour => {
                        const cell = heatmapMatrix[`${day}-${hour}`] || { rate: 75, tier: '75-89%', sessionCount: 5 };
                        const color = getHeatmapColor(cell.rate);

                        return (
                          <div
                            key={hour}
                            onMouseEnter={e => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setHoveredCell({
                                day,
                                hourLabel: hour,
                                rate: cell.rate,
                                tier: cell.tier,
                                sessionCount: cell.sessionCount,
                                x: rect.left + rect.width / 2,
                                y: rect.top - 8,
                              });
                            }}
                            onMouseLeave={() => setHoveredCell(null)}
                            style={{
                              flex: 1,
                              height: 34,
                              borderRadius: 6,
                              background: color,
                              border: '1px solid rgba(0,0,0,0.04)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                            }}
                            title={`${day} ${hour}: ${cell.rate}% attendance`}
                          >
                            <span
                              style={{
                                fontSize: '0.625rem',
                                fontWeight: 700,
                                color: cell.rate >= 90 ? '#ffffff' : cell.rate < 25 ? '#991b1b' : '#334155',
                                opacity: 0.85,
                                pointerEvents: 'none',
                                userSelect: 'none',
                              }}
                            >
                              {Math.round(cell.rate)}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Hour labels footer */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <span style={{ width: 36, flexShrink: 0 }} />
                <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                  {hoursList.map(hour => (
                    <span
                      key={hour}
                      style={{
                        flex: 1,
                        fontSize: '0.675rem',
                        fontWeight: 600,
                        color: '#64748b',
                        textAlign: 'center',
                      }}
                    >
                      {hour}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Horizontal Color Scale Legend */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
              marginTop: 14,
              padding: '8px 14px',
              background: '#f8fafc',
              borderRadius: 10,
              border: '1px solid #f1f5f9',
            }}
          >
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>Attendance Rate:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 11, height: 11, borderRadius: 3, background: '#059669', flexShrink: 0 }} />
                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#334155' }}>≥ 90%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 11, height: 11, borderRadius: 3, background: '#86efac', flexShrink: 0 }} />
                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#334155' }}>75–89%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 11, height: 11, borderRadius: 3, background: '#fef08a', flexShrink: 0 }} />
                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#334155' }}>50–74%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 11, height: 11, borderRadius: 3, background: '#fdba74', flexShrink: 0 }} />
                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#334155' }}>25–49%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 11, height: 11, borderRadius: 3, background: '#f87171', flexShrink: 0 }} />
                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#334155' }}>&lt; 25%</span>
              </div>
            </div>
          </div>

          {/* Heatmap Insights & Highlights to elegantly utilize vertical card height */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: 10,
              marginTop: 14,
              paddingTop: 14,
              borderTop: '1px solid #f1f5f9',
            }}
          >
            <div style={{ padding: '8px 12px', background: '#ecfdf5', borderRadius: 10, border: '1px solid #d1fae5' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#059669', fontSize: '0.675rem', fontWeight: 700 }}>
                <TrendingUp size={12} />
                <span>Peak Slot</span>
              </div>
              <div style={{ fontSize: '0.875rem', fontWeight: 800, color: '#065f46', marginTop: 3 }}>
                {heatmapStats.peak.label}
              </div>
              <div style={{ fontSize: '0.675rem', color: '#047857', fontWeight: 600 }}>
                {heatmapStats.peak.rate}% attendance avg
              </div>
            </div>

            <div style={{ padding: '8px 12px', background: '#fef2f2', borderRadius: 10, border: '1px solid #fee2e2' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#dc2626', fontSize: '0.675rem', fontWeight: 700 }}>
                <AlertTriangle size={12} />
                <span>Lowest Slot</span>
              </div>
              <div style={{ fontSize: '0.875rem', fontWeight: 800, color: '#991b1b', marginTop: 3 }}>
                {heatmapStats.lowest.label}
              </div>
              <div style={{ fontSize: '0.675rem', color: '#b91c1c', fontWeight: 600 }}>
                {heatmapStats.lowest.rate}% attendance avg
              </div>
            </div>

            <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#475569', fontSize: '0.675rem', fontWeight: 700 }}>
                <Clock size={12} />
                <span>Shift Split</span>
              </div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#1e293b', marginTop: 3 }}>
                AM: {heatmapStats.morningAvg}% · PM: {heatmapStats.afternoonAvg}%
              </div>
              <div style={{ fontSize: '0.675rem', color: '#64748b', fontWeight: 500 }}>
                Morning vs afternoon participation
              </div>
            </div>
          </div>
        </div>

        {/* Card Right: Students with Low Attendance */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03)',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
          }}
        >
          {/* Card Header */}
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
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ef4444',
                }}
              >
                <AlertTriangle size={18} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                  Students with Low Attendance
                </h3>
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                  Students below attendance threshold (e.g., &lt; {thresholdLimit}%)
                </p>
              </div>
            </div>

            {/* Header Tools: Search + Filters + Export CSV */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Search input */}
              <div style={{ position: 'relative' }}>
                <Search
                  size={13}
                  style={{ position: 'absolute', left: 9, top: 10, color: '#94a3b8', pointerEvents: 'none' }}
                />
                <input
                  type="text"
                  placeholder="Search students by name, ID or email..."
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                  style={{
                    height: 32,
                    padding: '0 10px 0 28px',
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    background: '#ffffff',
                    fontSize: '0.75rem',
                    color: '#0f172a',
                    outline: 'none',
                    width: 220,
                  }}
                />
                {studentSearch && (
                  <button
                    type="button"
                    onClick={() => setStudentSearch('')}
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

              {/* Filters popover button */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setThresholdFilterOpen(prev => !prev)}
                  style={{
                    height: 32,
                    padding: '0 10px',
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    background: thresholdFilterOpen ? '#f5f3ff' : '#ffffff',
                    color: thresholdFilterOpen ? '#7c3aed' : '#475569',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                  }}
                >
                  <SlidersHorizontal size={13} />
                  <span>Filters</span>
                </button>

                {thresholdFilterOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      right: 0,
                      zIndex: 50,
                      background: '#ffffff',
                      borderRadius: 12,
                      border: '1px solid #ede9fe',
                      boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                      padding: 14,
                      width: 210,
                    }}
                  >
                    <label style={{ fontSize: '0.725rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                      Attendance Threshold:
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {[85, 75, 65, 50].map(val => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => {
                            setThresholdLimit(val);
                            setThresholdFilterOpen(false);
                          }}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 6,
                            border: '1px solid',
                            borderColor: thresholdLimit === val ? '#7c3aed' : '#e2e8f0',
                            background: thresholdLimit === val ? '#f5f3ff' : '#ffffff',
                            color: thresholdLimit === val ? '#7c3aed' : '#334155',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            textAlign: 'left',
                            cursor: 'pointer',
                          }}
                        >
                          &lt; {val}% Attendance
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Export CSV Solid Purple Button */}
              <button
                type="button"
                onClick={handleExportLowAttendanceCSV}
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
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 540 }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid #f1f5f9' }}>
                  <th style={{ padding: '8px 6px', width: 28 }}>
                    <input
                      type="checkbox"
                      checked={lowStudents.length > 0 && selectedStudentIds.size === lowStudents.length}
                      onChange={handleSelectAll}
                      style={{ cursor: 'pointer', accentColor: '#7c3aed' }}
                    />
                  </th>
                  <th style={{ padding: '8px 6px', fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', width: 24 }}>
                    #
                  </th>
                  <th
                    onClick={() => handleSort('full_name')}
                    style={{ padding: '8px 10px', fontSize: '0.7rem', fontWeight: 600, color: sortField === 'full_name' ? '#7c3aed' : '#94a3b8', cursor: 'pointer', userSelect: 'none' }}
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                      Student Name {renderSortIcon('full_name')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('roll_number')}
                    style={{ padding: '8px 10px', fontSize: '0.7rem', fontWeight: 600, color: sortField === 'roll_number' ? '#7c3aed' : '#94a3b8', cursor: 'pointer', userSelect: 'none' }}
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                      ID {renderSortIcon('roll_number')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('department_name')}
                    style={{ padding: '8px 10px', fontSize: '0.7rem', fontWeight: 600, color: sortField === 'department_name' ? '#7c3aed' : '#94a3b8', cursor: 'pointer', userSelect: 'none' }}
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                      Department {renderSortIcon('department_name')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('attendance_rate')}
                    style={{ padding: '8px 10px', fontSize: '0.7rem', fontWeight: 600, color: sortField === 'attendance_rate' ? '#7c3aed' : '#94a3b8', cursor: 'pointer', userSelect: 'none' }}
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                      Attendance % {renderSortIcon('attendance_rate')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('missed_sessions')}
                    style={{ padding: '8px 10px', fontSize: '0.7rem', fontWeight: 600, color: sortField === 'missed_sessions' ? '#7c3aed' : '#94a3b8', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      Missed Sessions {renderSortIcon('missed_sessions')}
                    </div>
                  </th>
                  <th style={{ padding: '8px 10px', fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', textAlign: 'center' }}>
                    Trend
                  </th>
                  <th style={{ padding: '8px 10px', fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', textAlign: 'right' }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedLowStudents.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '36px 16px', color: '#64748b', fontSize: '0.82rem' }}>
                      No low-attendance students identified below the threshold for this period.
                    </td>
                  </tr>
                ) : (
                  paginatedLowStudents.map((st, idx) => {
                    const isChecked = selectedStudentIds.has(st.student_id);
                    const globalIdx = (currentPage - 1) * pageSize + idx + 1;
                    const studentSparkline = st.sparkline && st.sparkline.length >= 2 ? st.sparkline : [st.attendance_rate, st.attendance_rate];

                    return (
                    <tr
                      key={st.student_id}
                      style={{
                        borderBottom: '1px solid #f8fafc',
                        background: isChecked ? '#fbfbfe' : 'transparent',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {/* Checkbox */}
                      <td style={{ padding: '10px 6px' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleSelectStudent(st.student_id)}
                          style={{ cursor: 'pointer', accentColor: '#7c3aed' }}
                        />
                      </td>

                      {/* Index */}
                      <td style={{ padding: '10px 6px', fontSize: '0.785rem', color: '#64748b', fontWeight: 500 }}>
                        {globalIdx}
                      </td>

                      {/* Student Name */}
                      <td style={{ padding: '10px 10px', fontSize: '0.8125rem', fontWeight: 600, color: '#0f172a' }}>
                        {st.full_name}
                      </td>

                      {/* Roll / ID */}
                      <td style={{ padding: '10px 10px', fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>
                        {st.roll_number}
                      </td>

                      {/* Department */}
                      <td style={{ padding: '10px 10px', fontSize: '0.785rem', color: '#475569' }}>
                        {st.department_name}
                      </td>

                      {/* Attendance % Badge */}
                      <td style={{ padding: '10px 10px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 9px',
                            borderRadius: 6,
                            background: '#fee2e2',
                            color: '#b91c1c',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                          }}
                        >
                          {st.attendance_rate == null ? '—' : `${st.attendance_rate.toFixed(1)}%`}
                        </span>
                      </td>

                      {/* Missed Sessions */}
                      <td
                        style={{
                          padding: '10px 10px',
                          textAlign: 'center',
                          fontSize: '0.875rem',
                          fontWeight: 700,
                          color: '#dc2626',
                        }}
                      >
                        {st.missed_sessions}
                      </td>

                      {/* Mini Sparkline Trend */}
                      <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                        <div style={{ width: 64, height: 20, margin: '0 auto' }}>
                          <svg viewBox="0 0 64 20" style={{ width: '100%', height: '100%' }}>
                            <defs>
                              <linearGradient id={`sparkGrad-${st.student_id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#f87171" stopOpacity="0.4" />
                                <stop offset="100%" stopColor="#f87171" stopOpacity="0.0" />
                              </linearGradient>
                            </defs>
                            <path
                              d={generateSmoothWavePath(studentSparkline, 64, 20, true)}
                              fill={`url(#sparkGrad-${st.student_id})`}
                            />
                            <path
                              d={generateSmoothWavePath(studentSparkline, 64, 20, false)}
                              fill="none"
                              stroke="#ef4444"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                            />
                          </svg>
                        </div>
                      </td>

                      {/* Action */}
                      <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, position: 'relative' }}>
                          {/* View Button */}
                          <button
                            type="button"
                            onClick={() => {
                              if (onSelectStudent) onSelectStudent(st.student_id);
                            }}
                            style={{
                              padding: '4px 12px',
                              borderRadius: 6,
                              border: '1px solid #ddd6fe',
                              background: '#f5f3ff',
                              color: '#7c3aed',
                              fontSize: '0.725rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            View
                          </button>

                          {/* 3-dots dropdown */}
                          <button
                            type="button"
                            onClick={() => {
                              setActionMenuStudentId(prev => (prev === st.student_id ? null : st.student_id));
                            }}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              color: '#94a3b8',
                              cursor: 'pointer',
                              padding: 4,
                              display: 'flex',
                              alignItems: 'center',
                            }}
                          >
                            <MoreHorizontal size={14} />
                          </button>

                          {/* Popover Menu */}
                          {actionMenuStudentId === st.student_id && (
                            <div
                              style={{
                                position: 'absolute',
                                top: 'calc(100% + 4px)',
                                right: 0,
                                zIndex: 60,
                                background: '#ffffff',
                                borderRadius: 10,
                                border: '1px solid #ede9fe',
                                boxShadow: '0 8px 20px rgba(0,0,0,0.1)',
                                padding: '4px 0',
                                minWidth: 160,
                                textAlign: 'left',
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setActionMenuStudentId(null);
                                  if (onSelectStudent) onSelectStudent(st.student_id);
                                }}
                                style={{
                                  width: '100%',
                                  padding: '7px 12px',
                                  border: 'none',
                                  background: 'transparent',
                                  fontSize: '0.75rem',
                                  fontWeight: 500,
                                  color: '#334155',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                }}
                              >
                                <User size={13} color="#7c3aed" />
                                <span>Student 360 Profile</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setActionMenuStudentId(null);
                                  alert(`Warning notification queued for ${st.full_name} (${st.roll_number})`);
                                }}
                                style={{
                                  width: '100%',
                                  padding: '7px 12px',
                                  border: 'none',
                                  background: 'transparent',
                                  fontSize: '0.75rem',
                                  fontWeight: 500,
                                  color: '#334155',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                }}
                              >
                                <Mail size={13} color="#ef4444" />
                                <span>Send Warning Notice</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {lowStudents.length > pageSize && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 18px',
                borderTop: '1px solid #f1f5f9',
                fontSize: '0.75rem',
                color: '#64748b',
              }}
            >
              <span>
                Showing {(currentPage - 1) * pageSize + 1} to{' '}
                {Math.min(currentPage * pageSize, lowStudents.length)} of{' '}
                {lowStudents.length} students
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                    background: currentPage <= 1 ? '#f8fafc' : '#ffffff',
                    color: currentPage <= 1 ? '#cbd5e1' : '#475569',
                    cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Prev
                </button>
                <span style={{ padding: '4px 8px', fontWeight: 700, color: '#7c3aed' }}>
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                    background: currentPage >= totalPages ? '#f8fafc' : '#ffffff',
                    color: currentPage >= totalPages ? '#cbd5e1' : '#475569',
                    cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Bulk Selection Notification Bar */}
          {selectedStudentIds.size > 0 && (
            <div
              style={{
                marginTop: 12,
                padding: '8px 14px',
                borderRadius: 8,
                background: '#f5f3ff',
                border: '1px solid #ddd6fe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#7c3aed' }}>
                {selectedStudentIds.size} student{selectedStudentIds.size > 1 ? 's' : ''} selected
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    alert(`Queued automated warning emails to ${selectedStudentIds.size} students.`);
                    setSelectedStudentIds(new Set());
                  }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: 'none',
                    background: '#7c3aed',
                    color: '#ffffff',
                    fontSize: '0.725rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Send Batch Warning
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedStudentIds(new Set())}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontSize: '0.725rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Deselect All
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
