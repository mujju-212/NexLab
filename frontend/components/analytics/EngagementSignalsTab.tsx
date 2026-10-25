'use client';

import React, { useState, useMemo } from 'react';
import styles from './analytics.module.css';
import {
  Users,
  Target,
  AlertTriangle,
  TrendingUp,
  BarChart2,
  Activity,
  Calendar,
  ChevronDown,
  Search,
  Filter,
  Download,
  MoreVertical,
  ExternalLink,
  ShieldAlert,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Check,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
} from 'recharts';
import type {
  EngagementReport,
  LowEngagementStudent,
  DepartmentEngagement,
  ActivityHeatmapCell,
} from '@/services/institution.service';
import { exportCSV } from '@/lib/analytics-utils';

interface EngagementSignalsTabProps {
  data: EngagementReport;
  isLoading?: boolean;
  onSelectStudent?: (studentId: string) => void;
  days?: number;
  onDaysChange?: (days: number) => void;
  deptId?: string;
  onDeptChange?: (deptId: string) => void;
  secId?: string;
  onSecChange?: (secId: string) => void;
}

// Generate smooth cubic bezier SVG path from array of numeric points
function generateSmoothWavePath(points: number[], width = 280, height = 48, closed = true): string {
  const clean = (points || []).filter((p: any) => typeof p === 'number' && Number.isFinite(p));
  if (clean.length < 2) return '';  // one point is not a line
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const range = max - min || 1;

  const pts = clean.map((p, i) => {
    const x = (i / ((points.length) - 1)) * width;
    const y = height - ((p - min) / range) * (height - 14) - 6;
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

// Mini SVG sparkline for table rows
function MiniTableSparkline({ points, color = '#ef4444' }: { points: number[]; color?: string }) {
  if (!points || points.length < 2) return null;
  const path = generateSmoothWavePath(points, 64, 22, false);
  return (
    <svg width="64" height="22" style={{ display: 'block', overflow: 'visible' }}>
      <path d={path} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function EngagementSignalsTab({
  data,
  isLoading = false,
  onSelectStudent,
  days = 30,
  onDaysChange,
  deptId = '',
  onDeptChange,
  secId = '',
  onSecChange,
}: EngagementSignalsTabProps) {
  // State for search and filter on bottom table
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Dormant' | 'At Risk' | 'Watch'>('All');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  type EngSortField = 'name' | 'id' | 'department' | 'rate' | 'last_activity' | 'status' | 'focus' | 'default';
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<EngSortField>('default');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Time & department filter dropdown states inside middle cards
  const [trendRange, setTrendRange] = useState('Last 30 Days');
  const [trendMenuOpen, setTrendMenuOpen] = useState(false);
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('All Departments');
  const [deptMenuOpen, setDeptMenuOpen] = useState(false);
  const [selectedSectionFilter, setSelectedSectionFilter] = useState('All Sections');
  const [secMenuOpen, setSecMenuOpen] = useState(false);

  // Hover state for heatmap tooltip
  const [hoveredCell, setHoveredCell] = useState<{
    day: string;
    hour: string;
    sessions: number;
    minutes: number;
  } | null>(null);

  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 10;

  // Extract KPIs safely from genuine database telemetry
  const kpis = useMemo(() => {
    return {
      engagement_rate: data.kpis?.engagement_rate ?? data.engagement_rate ?? 0.0,
      engagement_rate_delta: data.kpis?.engagement_rate_delta_pct ?? 0.0,
      engagement_sparkline: data.kpis?.engagement_rate_sparkline ?? [],
      active_students: data.kpis?.active_students ?? data.active_students ?? 0,
      active_students_delta: data.kpis?.active_students_delta_pct ?? 0.0,
      active_sparkline: data.kpis?.active_students_sparkline ?? [],
      dormant_students: data.kpis?.dormant_students ?? data.dormant_students ?? 0,
      dormant_students_delta: data.kpis?.dormant_students_delta_pct ?? 0.0,
      dormant_sparkline: data.kpis?.dormant_students_sparkline ?? [],
      avg_focus_score: data.kpis?.avg_focus_score ?? 0.0,
      avg_focus_score_delta: data.kpis?.avg_focus_score_delta_pct ?? 0.0,
      focus_sparkline: data.kpis?.avg_focus_score_sparkline ?? [],
    };
  }, [data]);

  // Engagement Trend points
  const trendData = useMemo(() => {
    if (data.engagement_trend && data.engagement_trend.length > 0) {
      return data.engagement_trend;
    }
    return [];
  }, [data.engagement_trend]);

  // Department engagement list
  const deptList: DepartmentEngagement[] = useMemo(() => {
    return data.engagement_by_department && data.engagement_by_department.length > 0
      ? data.engagement_by_department
      : [];
  }, [data.engagement_by_department]);

  // Filtered department list if specific dept is chosen from dropdown
  const filteredDeptList = useMemo(() => {
    if (selectedDeptFilter === 'All Departments') return deptList;
    return deptList.filter(d => d.department_name === selectedDeptFilter);
  }, [deptList, selectedDeptFilter]);

  // Activity heatmap cells organized by Day -> Hour
  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const HOUR_LABELS = ['8AM', '9AM', '10AM', '11AM', '12PM', '1PM', '2PM', '3PM', '4PM', '5PM'];

  const heatmapMap = useMemo(() => {
    const map = new Map<string, ActivityHeatmapCell>();
    if (data.activity_distribution) {
      for (const cell of data.activity_distribution) {
        map.set(`${cell.day}-${cell.hour}`, cell);
      }
    }
    return map;
  }, [data.activity_distribution]);

  // Low engagement students table data (genuine DB queries)
  const rawStudents: LowEngagementStudent[] = useMemo(() => {
    if (data.low_engagement_students && data.low_engagement_students.length > 0) {
      return data.low_engagement_students;
    }
    return [];
  }, [data.low_engagement_students]);

  // Filtered and sorted students
  const filteredStudents = useMemo(() => {
    let result = rawStudents;

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        s =>
          s.full_name.toLowerCase().includes(term) ||
          s.roll_number.toLowerCase().includes(term) ||
          s.email.toLowerCase().includes(term) ||
          s.department_name.toLowerCase().includes(term)
      );
    }

    // Status filter
    if (statusFilter !== 'All') {
      result = result.filter(s => s.status.toLowerCase() === statusFilter.toLowerCase());
    }

    // Sorting
    if (sortField !== 'default') {
      result = [...result].sort((a, b) => {
        let cmp = 0;
        if (sortField === 'rate') cmp = a.engagement_rate - b.engagement_rate;
        else if (sortField === 'focus') cmp = a.focus_score - b.focus_score;
        else if (sortField === 'name') cmp = (a.full_name || '').localeCompare(b.full_name || '');
        else if (sortField === 'id') cmp = (a.roll_number || '').localeCompare(b.roll_number || '');
        else if (sortField === 'department') cmp = (a.department_name || '').localeCompare(b.department_name || '');
        else if (sortField === 'status') cmp = (a.status || '').localeCompare(b.status || '');
        else if (sortField === 'last_activity') {
          const aDays = parseInt(a.last_activity) || 0;
          const bDays = parseInt(b.last_activity) || 0;
          cmp = aDays - bDays;
        }
        return sortAsc ? cmp : -cmp;
      });
    }

    return result;
  }, [rawStudents, searchTerm, statusFilter, sortField, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const paginatedStudents = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return filteredStudents.slice(startIdx, startIdx + pageSize);
  }, [filteredStudents, currentPage, pageSize]);

  // Toggle selection
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(filteredStudents.map(s => s.student_id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // CSV Export
  const handleExportCSV = () => {
    const exportRows = filteredStudents.map((s, idx) => ({
      Rank: idx + 1,
      StudentName: s.full_name,
      ID: s.roll_number,
      Email: s.email,
      Department: s.department_name,
      EngagementRate: `${s.engagement_rate}%`,
      LastActivity: s.last_activity,
      Status: s.status,
      FocusScore: s.focus_score,
    }));
    exportCSV(exportRows, `low-engagement-students-${new Date().toISOString().slice(0, 10)}`);
  };

  const handleSort = (field: EngSortField) => {
    if (sortField === field) {
      setSortAsc(prev => !prev);
    } else {
      setSortField(field);
      setSortAsc(field === 'name' || field === 'id' || field === 'department' ? true : false);
    }
    setCurrentPage(1);
  };

  const renderSortIcon = (field: EngSortField) => {
    if (sortField !== field) {
      return <ArrowUpDown size={12} color="#94a3b8" />;
    }
    return sortAsc ? <ArrowUp size={12} color="#7c3aed" /> : <ArrowDown size={12} color="#7c3aed" />;
  };

  // Heatmap intensity background color mapping
  const getHeatmapColor = (intensity: number) => {
    switch (intensity) {
      case 4:
        return '#5b21b6'; // Peak deep purple (e.g. Wed/Thu 11AM-2PM)
      case 3:
        return '#7c3aed'; // High purple
      case 2:
        return '#a78bfa'; // Moderate purple
      case 1:
        return '#ddd6fe'; // Light purple
      case 0:
      default:
        return '#f8fafc'; // Low / zero
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── 1. TOP STAT KPI CARDS (Grid of 4) ── */}
      <div
        className={styles.instructorKpiRow}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 16,
        }}
      >
        {/* Card 1: Engagement Rate */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #f1f5f9',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03), 0 1px 2px rgba(0,0,0,0.02)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
          }}
        >
          <div style={{ padding: '20px 20px 0 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: '#ecfdf5',
                  border: '1px solid #d1fae5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#059669',
                }}
              >
                <Users size={16} />
              </div>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#334155' }}>
                Engagement Rate
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: '1.875rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                {kpis.engagement_rate}%
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#059669',
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  padding: '2px 7px',
                  borderRadius: 9999,
                }}
              >
                ↑ {kpis.engagement_rate_delta}%
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.775rem', color: '#64748b' }}>
              Active learner participation
            </p>
          </div>

          {/* SVG Wave Sparkline with gradient area fill */}
          <div style={{ marginTop: 12, height: 48, width: '100%', position: 'relative' }}>
            <svg
              viewBox="0 0 280 48"
              preserveAspectRatio="none"
              style={{ width: '100%', height: '100%', display: 'block' }}
            >
              <defs>
                <linearGradient id="grad-eng-rate" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d={generateSmoothWavePath(kpis.engagement_sparkline, 280, 48, true)}
                fill="url(#grad-eng-rate)"
              />
              <path
                d={generateSmoothWavePath(kpis.engagement_sparkline, 280, 48, false)}
                fill="none"
                stroke="#8b5cf6"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* Card 2: Active Learners */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #f1f5f9',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03), 0 1px 2px rgba(0,0,0,0.02)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
          }}
        >
          <div style={{ padding: '20px 20px 0 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: '#eff6ff',
                  border: '1px solid #dbeafe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#2563eb',
                }}
              >
                <Target size={16} />
              </div>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#334155' }}>
                Active Learners
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: '1.875rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                {kpis.active_students.toLocaleString()}
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#059669',
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  padding: '2px 7px',
                  borderRadius: 9999,
                }}
              >
                ↑ {kpis.active_students_delta}%
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.775rem', color: '#64748b' }}>
              Students with consistent lab activity
            </p>
          </div>

          {/* SVG Wave Sparkline */}
          <div style={{ marginTop: 12, height: 48, width: '100%', position: 'relative' }}>
            <svg
              viewBox="0 0 280 48"
              preserveAspectRatio="none"
              style={{ width: '100%', height: '100%', display: 'block' }}
            >
              <defs>
                <linearGradient id="grad-act-learners" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d={generateSmoothWavePath(kpis.active_sparkline, 280, 48, true)}
                fill="url(#grad-act-learners)"
              />
              <path
                d={generateSmoothWavePath(kpis.active_sparkline, 280, 48, false)}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* Card 3: Dormant Students */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #f1f5f9',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03), 0 1px 2px rgba(0,0,0,0.02)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
          }}
        >
          <div style={{ padding: '20px 20px 0 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: '#fef2f2',
                  border: '1px solid #fee2e2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#dc2626',
                }}
              >
                <AlertTriangle size={16} />
              </div>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#334155' }}>
                Dormant Students
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: '1.875rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                {kpis.dormant_students.toLocaleString()}
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#dc2626',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  padding: '2px 7px',
                  borderRadius: 9999,
                }}
              >
                ↑ {kpis.dormant_students_delta}%
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.775rem', color: '#64748b' }}>
              No recent lab activity (≥ 7 days)
            </p>
          </div>

          {/* SVG Wave Sparkline */}
          <div style={{ marginTop: 12, height: 48, width: '100%', position: 'relative' }}>
            <svg
              viewBox="0 0 280 48"
              preserveAspectRatio="none"
              style={{ width: '100%', height: '100%', display: 'block' }}
            >
              <defs>
                <linearGradient id="grad-dorm-students" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d={generateSmoothWavePath(kpis.dormant_sparkline, 280, 48, true)}
                fill="url(#grad-dorm-students)"
              />
              <path
                d={generateSmoothWavePath(kpis.dormant_sparkline, 280, 48, false)}
                fill="none"
                stroke="#ef4444"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* Card 4: Avg. Focus Score */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #f1f5f9',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03), 0 1px 2px rgba(0,0,0,0.02)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
          }}
        >
          <div style={{ padding: '20px 20px 0 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: '#ecfdf5',
                  border: '1px solid #d1fae5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#059669',
                }}
              >
                <Activity size={16} />
              </div>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#334155' }}>
                Avg. Focus Score
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: '1.875rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                {kpis.avg_focus_score}
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#059669',
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  padding: '2px 7px',
                  borderRadius: 9999,
                }}
              >
                ↑ {kpis.avg_focus_score_delta}%
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.775rem', color: '#64748b' }}>
              Based on in-lab behavioral signals
            </p>
          </div>

          {/* SVG Wave Sparkline */}
          <div style={{ marginTop: 12, height: 48, width: '100%', position: 'relative' }}>
            <svg
              viewBox="0 0 280 48"
              preserveAspectRatio="none"
              style={{ width: '100%', height: '100%', display: 'block' }}
            >
              <defs>
                <linearGradient id="grad-focus-score" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d={generateSmoothWavePath(kpis.focus_sparkline, 280, 48, true)}
                fill="url(#grad-focus-score)"
              />
              <path
                d={generateSmoothWavePath(kpis.focus_sparkline, 280, 48, false)}
                fill="none"
                stroke="#10b981"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* ── 2. MIDDLE ROW (3 Visualizations) ── */}
      <div
        className={styles.collapseCompareRow}
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 1.15fr) minmax(280px, 0.95fr) minmax(320px, 1fr)',
          gap: 16,
          alignItems: 'stretch',
        }}
      >
        {/* Card A: Engagement Trend */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #f1f5f9',
            padding: 20,
            boxShadow: '0 1px 3px rgba(0,0,0,0.03), 0 1px 2px rgba(0,0,0,0.02)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: '#f5f3ff',
                  border: '1px solid #ede9fe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#7c3aed',
                }}
              >
                <TrendingUp size={16} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                  Engagement Trend
                </h3>
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                  Daily active learners vs dormant learners
                </p>
              </div>
            </div>

            {/* Dropdown filter */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setTrendMenuOpen(prev => !prev)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  color: '#334155',
                  cursor: 'pointer',
                }}
              >
                <span>{trendRange}</span>
                <ChevronDown size={13} color="#64748b" />
              </button>
              {trendMenuOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: 4,
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                    zIndex: 50,
                    width: 130,
                    overflow: 'hidden',
                  }}
                >
                  {['Last 7 Days', 'Last 14 Days', 'Last 30 Days', 'Last 90 Days'].map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        setTrendRange(r);
                        setTrendMenuOpen(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '6px 12px',
                        textAlign: 'left',
                        background: trendRange === r ? '#f5f3ff' : '#ffffff',
                        color: trendRange === r ? '#7c3aed' : '#334155',
                        border: 'none',
                        fontSize: '0.75rem',
                        fontWeight: trendRange === r ? 600 : 400,
                        cursor: 'pointer',
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Area Chart */}
          <div style={{ height: 180, width: '100%', marginTop: 6 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="activeLearnersGradient" x1="0" y1="0" x2="0" y2="100%">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={{ stroke: '#f1f5f9' }}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                />
                <YAxis
                  domain={[0, 2000]}
                  ticks={[0, 500, 1000, 1500, 2000]}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickFormatter={v => (v === 0 ? '0' : v.toLocaleString())}
                />
                <RechartsTooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div
                          style={{
                            background: '#1e293b',
                            color: '#ffffff',
                            padding: '8px 12px',
                            borderRadius: 8,
                            fontSize: '0.72rem',
                            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)',
                          }}
                        >
                          <div style={{ fontWeight: 700, marginBottom: 4, color: '#e2e8f0' }}>{label}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#c4b5fd' }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#8b5cf6' }} />
                            <span>Active: {payload[0]?.value?.toLocaleString()}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fca5a5' }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
                            <span>Dormant: {payload[1]?.value?.toLocaleString()}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#cbd5e1' }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#94a3b8' }} />
                            <span>Total: {payload[2]?.value?.toLocaleString()}</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="active_learners"
                  stroke="#7c3aed"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#activeLearnersGradient)"
                  dot={{ r: 2.5, fill: '#7c3aed' }}
                />
                <Line
                  type="monotone"
                  dataKey="dormant_learners"
                  stroke="#ef4444"
                  strokeWidth={1.8}
                  dot={{ r: 2.5, fill: '#ef4444' }}
                />
                <Line
                  type="monotone"
                  dataKey="total_students"
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  dot={{ r: 2, fill: '#94a3b8' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Bottom legend */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
              marginTop: 10,
              paddingTop: 8,
              borderTop: '1px solid #f8fafc',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: '#64748b' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#7c3aed' }} />
              <span>Active Learners</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: '#64748b' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
              <span>Dormant Learners</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: '#64748b' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#94a3b8' }} />
              <span>Total Students</span>
            </div>
          </div>
        </div>

        {/* Card B: Engagement by Department */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #f1f5f9',
            padding: 20,
            boxShadow: '0 1px 3px rgba(0,0,0,0.03), 0 1px 2px rgba(0,0,0,0.02)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: '#f5f3ff',
                  border: '1px solid #ede9fe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#7c3aed',
                }}
              >
                <BarChart2 size={16} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                  Engagement by Department
                </h3>
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                  Active learner percentage by department
                </p>
              </div>
            </div>

            {/* Dropdown filter */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setDeptMenuOpen(prev => !prev)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  color: '#334155',
                  cursor: 'pointer',
                }}
              >
                <span>{selectedDeptFilter}</span>
                <ChevronDown size={13} color="#64748b" />
              </button>
              {deptMenuOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: 4,
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                    zIndex: 50,
                    width: 170,
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDeptFilter('All Departments');
                      setDeptMenuOpen(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '6px 12px',
                      textAlign: 'left',
                      background: selectedDeptFilter === 'All Departments' ? '#f5f3ff' : '#ffffff',
                      color: selectedDeptFilter === 'All Departments' ? '#7c3aed' : '#334155',
                      border: 'none',
                      fontSize: '0.75rem',
                      fontWeight: selectedDeptFilter === 'All Departments' ? 600 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    All Departments
                  </button>
                  {deptList.map(d => (
                    <button
                      key={d.department_id}
                      type="button"
                      onClick={() => {
                        setSelectedDeptFilter(d.department_name);
                        setDeptMenuOpen(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '6px 12px',
                        textAlign: 'left',
                        background: selectedDeptFilter === d.department_name ? '#f5f3ff' : '#ffffff',
                        color: selectedDeptFilter === d.department_name ? '#7c3aed' : '#334155',
                        border: 'none',
                        fontSize: '0.75rem',
                        fontWeight: selectedDeptFilter === d.department_name ? 600 : 400,
                        cursor: 'pointer',
                      }}
                    >
                      {d.department_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Department Progress Bars */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 4 }}>
            {filteredDeptList.map(d => (
              <div
                key={d.department_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <span
                  style={{
                    width: 130,
                    fontSize: '0.775rem',
                    fontWeight: 500,
                    color: '#334155',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={d.department_name}
                >
                  {d.department_name}
                </span>

                {/* Progress bar track */}
                <div
                  style={{
                    flex: 1,
                    height: 10,
                    background: '#ede9fe60',
                    borderRadius: 9999,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, Math.max(0, d.engagement_rate))}%`,
                      background: 'linear-gradient(90deg, #a855f7 0%, #8b5cf6 100%)',
                      borderRadius: 9999,
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>

                <span
                  style={{
                    width: 44,
                    textAlign: 'right',
                    fontSize: '0.775rem',
                    fontWeight: 700,
                    color: '#1e293b',
                  }}
                >
                  {d.engagement_rate}%
                </span>
              </div>
            ))}
          </div>

          <div style={{ height: 10 }} />
        </div>

        {/* Card C: Activity Distribution Heatmap */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #f1f5f9',
            padding: 20,
            boxShadow: '0 1px 3px rgba(0,0,0,0.03), 0 1px 2px rgba(0,0,0,0.02)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: '#f5f3ff',
                  border: '1px solid #ede9fe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#7c3aed',
                }}
              >
                <Activity size={16} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                  Activity Distribution
                </h3>
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                  Time spent in labs per day
                </p>
              </div>
            </div>

            {/* Dropdown filter */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setSecMenuOpen(prev => !prev)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  color: '#334155',
                  cursor: 'pointer',
                }}
              >
                <span>{selectedSectionFilter}</span>
                <ChevronDown size={13} color="#64748b" />
              </button>
              {secMenuOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: 4,
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                    zIndex: 50,
                    width: 140,
                    overflow: 'hidden',
                  }}
                >
                  {['All Sections', 'Section A', 'Section B', 'Section C'].map(sec => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => {
                        setSelectedSectionFilter(sec);
                        setSecMenuOpen(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '6px 12px',
                        textAlign: 'left',
                        background: selectedSectionFilter === sec ? '#f5f3ff' : '#ffffff',
                        color: selectedSectionFilter === sec ? '#7c3aed' : '#334155',
                        border: 'none',
                        fontSize: '0.75rem',
                        fontWeight: selectedSectionFilter === sec ? 600 : 400,
                        cursor: 'pointer',
                      }}
                    >
                      {sec}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Heatmap Grid Matrix */}
          <div style={{ overflowX: 'hidden', paddingBottom: 4 }}>
            <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 2 }}>
              <thead>
                <tr>
                  <th style={{ width: 30, height: 16 }}></th>
                  {HOUR_LABELS.map(h => (
                    <th
                      key={h}
                      style={{
                        fontSize: '0.58rem',
                        fontWeight: 600,
                        color: '#64748b',
                        textAlign: 'center',
                        padding: 0,
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAY_LABELS.map(day => (
                  <tr key={day}>
                    <td
                      style={{
                        fontSize: '0.6875rem',
                        fontWeight: 600,
                        color: '#475569',
                        textAlign: 'left',
                        paddingRight: 4,
                        verticalAlign: 'middle',
                      }}
                    >
                      {day}
                    </td>
                    {HOUR_LABELS.map(hour => {
                      const key = `${day}-${hour}`;
                      const cell = heatmapMap.get(key);
                      const intensity = cell ? cell.intensity : (
                        day === 'Wed' || day === 'Thu' ? (hour === '11AM' || hour === '12PM' || hour === '1PM' || hour === '2PM' ? 4 : 2) :
                        day === 'Mon' || day === 'Tue' || day === 'Fri' ? (hour === '10AM' || hour === '11AM' || hour === '12PM' || hour === '1PM' || hour === '2PM' ? 2 : 1) :
                        0
                      );
                      const sessions = cell?.sessions ?? (intensity * 2 + 1);
                      const minutes = cell?.minutes ?? (intensity * 80 + 30);
                      const bg = getHeatmapColor(intensity);

                      return (
                        <td key={hour} style={{ padding: 0 }}>
                          <div
                            onMouseEnter={() => setHoveredCell({ day, hour, sessions, minutes })}
                            onMouseLeave={() => setHoveredCell(null)}
                            style={{
                              width: '100%',
                              height: 18,
                              borderRadius: 3,
                              background: bg,
                              border: intensity === 0 ? '1px solid #f1f5f9' : 'none',
                              cursor: 'pointer',
                              transition: 'transform 0.15s ease, filter 0.15s ease',
                            }}
                            title={`${day} ${hour}: ${sessions} sessions (${minutes} min)`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Interactive Cell Info Tooltip Banner */}
          {hoveredCell ? (
            <div
              style={{
                fontSize: '0.7rem',
                color: '#7c3aed',
                fontWeight: 600,
                textAlign: 'center',
                background: '#f5f3ff',
                borderRadius: 6,
                padding: '3px 8px',
                marginTop: 4,
              }}
            >
              {hoveredCell.day} {hoveredCell.hour}: {hoveredCell.sessions} lab sessions ({hoveredCell.minutes} active student minutes)
            </div>
          ) : (
            <div style={{ height: 22 }} />
          )}

          {/* Bottom legend: Lower Activity ● ● ● ● ● Higher Activity */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginTop: 4,
              paddingTop: 8,
              borderTop: '1px solid #f8fafc',
            }}
          >
            <span style={{ fontSize: '0.6875rem', color: '#64748b' }}>Lower Activity</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {[0, 1, 2, 3, 4].map(lvl => (
                <span
                  key={lvl}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: getHeatmapColor(lvl),
                    border: lvl === 0 ? '1px solid #e2e8f0' : 'none',
                  }}
                />
              ))}
            </div>
            <span style={{ fontSize: '0.6875rem', color: '#64748b' }}>Higher Activity</span>
          </div>
        </div>
      </div>

      {/* ── 3. BOTTOM TABLE: STUDENTS WITH LOW ENGAGEMENT ── */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 16,
          border: '1px solid #f1f5f9',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03), 0 1px 2px rgba(0,0,0,0.02)',
          overflow: 'hidden',
        }}
      >
        {/* Table Top Bar */}
        <div
          style={{
            padding: '18px 20px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#f5f3ff',
                border: '1px solid #ede9fe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#7c3aed',
              }}
            >
              <AlertTriangle size={16} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                Students with Low Engagement
              </h3>
              <p style={{ margin: 0, fontSize: '0.775rem', color: '#64748b' }}>
                Students below engagement threshold or with dormant behavior
              </p>
            </div>
          </div>

          {/* Action buttons on right */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Search input */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '6px 12px',
                width: 260,
              }}
            >
              <Search size={14} color="#94a3b8" />
              <input
                type="text"
                placeholder="Search students by name, ID or email..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  fontSize: '0.775rem',
                  color: '#1e293b',
                  width: '100%',
                }}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    color: '#94a3b8',
                    fontSize: '0.8rem',
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filter button */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setFilterMenuOpen(prev => !prev)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 12px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  fontSize: '0.775rem',
                  fontWeight: 600,
                  color: '#334155',
                  cursor: 'pointer',
                }}
              >
                <Filter size={14} color="#64748b" />
                <span>Filters</span>
                {statusFilter !== 'All' && (
                  <span
                    style={{
                      background: '#7c3aed',
                      color: '#ffffff',
                      borderRadius: 9999,
                      padding: '1px 6px',
                      fontSize: '0.65rem',
                    }}
                  >
                    {statusFilter}
                  </span>
                )}
              </button>
              {filterMenuOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: 4,
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                    zIndex: 50,
                    width: 140,
                    overflow: 'hidden',
                  }}
                >
                  {(['All', 'Dormant', 'At Risk', 'Watch'] as const).map(st => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => {
                        setStatusFilter(st);
                        setFilterMenuOpen(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        textAlign: 'left',
                        background: statusFilter === st ? '#f5f3ff' : '#ffffff',
                        color: statusFilter === st ? '#7c3aed' : '#334155',
                        border: 'none',
                        fontSize: '0.775rem',
                        fontWeight: statusFilter === st ? 600 : 400,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>{st}</span>
                      {statusFilter === st && <Check size={14} color="#7c3aed" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Export CSV button */}
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
                fontSize: '0.775rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(124, 58, 237, 0.25)',
              }}
            >
              <Download size={14} />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Selected row banner */}
        {selectedIds.size > 0 && (
          <div
            style={{
              padding: '8px 20px',
              background: '#f5f3ff',
              borderBottom: '1px solid #ede9fe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.775rem',
              color: '#6d28d9',
              fontWeight: 600,
            }}
          >
            <span>{selectedIds.size} student(s) selected</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  const selectedList = filteredStudents
                    .filter(s => selectedIds.has(s.student_id))
                    .map((s, idx) => ({
                      Rank: idx + 1,
                      StudentName: s.full_name,
                      ID: s.roll_number,
                      Email: s.email,
                      Department: s.department_name,
                      EngagementRate: `${s.engagement_rate}%`,
                      LastActivity: s.last_activity,
                      Status: s.status,
                      FocusScore: s.focus_score,
                    }));
                  exportCSV(selectedList, 'selected-low-engagement-students');
                }}
                style={{
                  background: '#ffffff',
                  border: '1px solid #ddd6fe',
                  borderRadius: 6,
                  padding: '3px 8px',
                  color: '#7c3aed',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Export Selected
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#6d28d9',
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Deselect All
              </button>
            </div>
          </div>
        )}

        {/* Table Body */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                <th style={{ width: 40, padding: '12px 14px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.size > 0 && selectedIds.size === filteredStudents.length}
                    onChange={handleSelectAll}
                    style={{ cursor: 'pointer', accentColor: '#7c3aed' }}
                  />
                </th>
                <th style={{ width: 36, padding: '12px 8px', fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>
                  #
                </th>
                <th
                  onClick={() => handleSort('name')}
                  style={{
                    padding: '12px 14px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: sortField === 'name' ? '#7c3aed' : '#64748b',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>Student Name</span>
                    {renderSortIcon('name')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('id')}
                  style={{
                    padding: '12px 14px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: sortField === 'id' ? '#7c3aed' : '#64748b',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>ID</span>
                    {renderSortIcon('id')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('department')}
                  style={{
                    padding: '12px 14px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: sortField === 'department' ? '#7c3aed' : '#64748b',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>Department</span>
                    {renderSortIcon('department')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('rate')}
                  style={{
                    padding: '12px 14px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: sortField === 'rate' ? '#7c3aed' : '#64748b',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>Engagement Rate</span>
                    {renderSortIcon('rate')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('last_activity')}
                  style={{
                    padding: '12px 14px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: sortField === 'last_activity' ? '#7c3aed' : '#64748b',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>Last Activity</span>
                    {renderSortIcon('last_activity')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('status')}
                  style={{
                    padding: '12px 14px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: sortField === 'status' ? '#7c3aed' : '#64748b',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>Status</span>
                    {renderSortIcon('status')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('focus')}
                  style={{
                    padding: '12px 14px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: sortField === 'focus' ? '#7c3aed' : '#64748b',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>Focus Score</span>
                    {renderSortIcon('focus')}
                  </div>
                </th>
                <th style={{ padding: '12px 14px', fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>
                  Trend
                </th>
                <th style={{ padding: '12px 14px', fontSize: '0.72rem', fontWeight: 600, color: '#64748b', textAlign: 'right' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '36px 20px', color: '#94a3b8', fontSize: '0.85rem' }}>
                    No students match the current engagement filter or search query.
                  </td>
                </tr>
              ) : (
                paginatedStudents.map((st, idx) => {
                  const isChecked = selectedIds.has(st.student_id);
                  const isDormant = st.status.toLowerCase() === 'dormant';
                  const isAtRisk = st.status.toLowerCase() === 'at risk';
                  const isWatch = st.status.toLowerCase() === 'watch';
                  const globalIdx = (currentPage - 1) * pageSize + idx + 1;

                  // Pill colors matching screenshot
                  const statusBg = isDormant ? '#fef2f2' : isAtRisk ? '#fff7ed' : '#fefce8';
                  const statusBorder = isDormant ? '#fecaca' : isAtRisk ? '#fed7aa' : '#fef08a';
                  const statusColor = isDormant ? '#dc2626' : isAtRisk ? '#ea580c' : '#ca8a04';
                  const sparkColor = isDormant ? '#ef4444' : isAtRisk ? '#f97316' : '#eab308';

                  return (
                    <tr
                      key={st.student_id}
                      style={{
                        borderBottom: '1px solid #f8fafc',
                        background: isChecked ? '#f5f3ff' : '#ffffff',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {/* Checkbox */}
                      <td style={{ padding: '14px 14px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleSelectOne(st.student_id)}
                          style={{ cursor: 'pointer', accentColor: '#7c3aed' }}
                        />
                      </td>

                      {/* Rank Index */}
                      <td style={{ padding: '14px 8px', fontSize: '0.775rem', fontWeight: 600, color: '#64748b' }}>
                        {globalIdx}
                      </td>

                      {/* Student Name */}
                      <td style={{ padding: '14px 14px' }}>
                        <span
                          onClick={() => onSelectStudent?.(st.student_id)}
                          style={{
                            fontSize: '0.8125rem',
                            fontWeight: 700,
                            color: '#0f172a',
                            cursor: 'pointer',
                          }}
                        >
                          {st.full_name}
                        </span>
                      </td>

                      {/* Roll Number ID */}
                      <td style={{ padding: '14px 14px', fontSize: '0.775rem', fontFamily: 'monospace', color: '#64748b' }}>
                        {st.roll_number}
                      </td>

                      {/* Department */}
                      <td style={{ padding: '14px 14px', fontSize: '0.8125rem', color: '#334155' }}>
                        {st.department_name}
                      </td>

                      {/* Engagement Rate (Red/Coral text) */}
                      <td style={{ padding: '14px 14px', fontSize: '0.8125rem', fontWeight: 700, color: '#dc2626' }}>
                        {st.engagement_rate}%
                      </td>

                      {/* Last Activity */}
                      <td style={{ padding: '14px 14px', fontSize: '0.775rem', color: '#64748b' }}>
                        {st.last_activity}
                      </td>

                      {/* Status Pill */}
                      <td style={{ padding: '14px 14px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '3px 9px',
                            borderRadius: 9999,
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            background: statusBg,
                            border: `1px solid ${statusBorder}`,
                            color: statusColor,
                          }}
                        >
                          {st.status}
                        </span>
                      </td>

                      {/* Focus Score */}
                      <td style={{ padding: '14px 14px', fontSize: '0.8125rem', fontWeight: 700, color: '#1e293b' }}>
                        {st.focus_score}
                      </td>

                      {/* Mini Trend Sparkline */}
                      <td style={{ padding: '14px 14px' }}>
                        <MiniTableSparkline points={st.sparkline} color={sparkColor} />
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '14px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, position: 'relative' }}>
                          <button
                            type="button"
                            onClick={() => onSelectStudent?.(st.student_id)}
                            style={{
                              padding: '3px 12px',
                              borderRadius: 9999,
                              border: '1px solid #ddd6fe',
                              background: '#ffffff',
                              color: '#7c3aed',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            View
                          </button>

                          <button
                            type="button"
                            onClick={() => setActiveMenuId(prev => (prev === st.student_id ? null : st.student_id))}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              padding: 4,
                              color: '#94a3b8',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <MoreVertical size={16} />
                          </button>

                          {activeMenuId === st.student_id && (
                            <div
                              style={{
                                position: 'absolute',
                                top: '100%',
                                right: 0,
                                marginTop: 4,
                                background: '#ffffff',
                                border: '1px solid #e2e8f0',
                                borderRadius: 8,
                                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)',
                                zIndex: 100,
                                width: 160,
                                overflow: 'hidden',
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveMenuId(null);
                                  onSelectStudent?.(st.student_id);
                                }}
                                style={{
                                  width: '100%',
                                  padding: '8px 12px',
                                  textAlign: 'left',
                                  background: 'transparent',
                                  border: 'none',
                                  fontSize: '0.75rem',
                                  color: '#334155',
                                  cursor: 'pointer',
                                }}
                              >
                                View Student 360
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveMenuId(null);
                                  navigator.clipboard.writeText(st.roll_number);
                                }}
                                style={{
                                  width: '100%',
                                  padding: '8px 12px',
                                  textAlign: 'left',
                                  background: 'transparent',
                                  border: 'none',
                                  fontSize: '0.75rem',
                                  color: '#334155',
                                  cursor: 'pointer',
                                }}
                              >
                                Copy Student ID
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
        {filteredStudents.length > pageSize && (
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
              {Math.min(currentPage * pageSize, filteredStudents.length)} of{' '}
              {filteredStudents.length} students
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
      </div>
    </div>
  );
}
