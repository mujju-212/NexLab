'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import {
  Cpu,
  Sparkles,
  Users,
  AlertTriangle,
  Clock,
  BarChart2,
  BookOpen,
  Search,
  SlidersHorizontal,
  Download,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  MoreHorizontal,
  X,
  Mail,
  User,
} from 'lucide-react';
import type { AIUsageReport, HighAIRelianceStudent } from '@/services/institution.service';
import { exportCSV } from '@/lib/analytics-utils';
import styles from './analytics.module.css';

interface AIUsageTelemetryTabProps {
  data: AIUsageReport;
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

function formatNumber(num: number | undefined | null): string {
  if (num === undefined || num === null) return '0';
  return num.toLocaleString();
}

export default function AIUsageTelemetryTab({
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
}: AIUsageTelemetryTabProps) {
  // Local filter states
  const [featureRange, setFeatureRange] = useState<number>(days);
  const [trendRange, setTrendRange] = useState<number>(days);
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [thresholdLimit, setThresholdLimit] = useState<number>(70);
  const [thresholdFilterOpen, setThresholdFilterOpen] = useState(false);
  const [actionMenuStudentId, setActionMenuStudentId] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [sortField, setSortField] = useState<'full_name' | 'roll_number' | 'department_name' | 'reliance_rate' | 'total_queries'>('reliance_rate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: 'full_name' | 'roll_number' | 'department_name' | 'reliance_rate' | 'total_queries') => {
    if (sortField === field) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'full_name' || field === 'roll_number' || field === 'department_name' ? 'asc' : 'desc');
    }
    setCurrentPage(1);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [studentSearch, thresholdLimit, pageSize]);

  const renderSortIcon = (field: 'full_name' | 'roll_number' | 'department_name' | 'reliance_rate' | 'total_queries') => {
    if (sortField !== field) {
      return <ArrowUpDown size={11} style={{ opacity: 0.35, verticalAlign: 'middle', marginLeft: 4 }} />;
    }
    return sortDir === 'asc' ? (
      <ChevronUp size={12} color="#7c3aed" style={{ verticalAlign: 'middle', marginLeft: 4 }} />
    ) : (
      <ChevronDown size={12} color="#7c3aed" style={{ verticalAlign: 'middle', marginLeft: 4 }} />
    );
  };

  // Real KPIs with zero mock fallback
  const totalQueries = data?.total_queries ?? data?.total_calls ?? 0;
  const totalTokens = data?.total_tokens ?? 0;
  const activeConsumers = data?.active_consumers ?? 0;
  const highRelianceCount = data?.high_reliance_students_count ?? 0;

  const deltas = data?.deltas || {
    queries: 0,
    tokens: 0,
    consumers: 0,
    high_reliance: 0,
  };

  const sparklines = data?.sparklines || {
    queries: [0, 0, 0, 0, 0, 0, 0],
    tokens: [0, 0, 0, 0, 0, 0, 0],
    consumers: [0, 0, 0, 0, 0, 0, 0],
    high_reliance: [0, 0, 0, 0, 0, 0, 0],
  };

  // 1. AI Usage by Feature breakdown
  const featureBreakdown = useMemo(() => {
    if (data?.by_feature_breakdown && data.by_feature_breakdown.length > 0) {
      return data.by_feature_breakdown;
    }
    return [];
  }, [data?.by_feature_breakdown]);

  // 2. AI Usage Trend
  const usageTrendData = useMemo(() => {
    if (data?.usage_trend && data.usage_trend.length > 0) {
      return data.usage_trend;
    }
    return [];
  }, [data?.usage_trend]);

  // 3. AI Usage by Subject
  const subjectUsageList = useMemo(() => {
    const list = data?.by_subject && data.by_subject.length > 0 ? data.by_subject : [];
    if (subjectFilter !== 'all') {
      return list.filter(s => s.subject_name.toLowerCase().includes(subjectFilter.toLowerCase()));
    }
    return list;
  }, [data?.by_subject, subjectFilter]);

  // Unique subject names for the select dropdown to avoid duplicate React keys
  const uniqueSubjectOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: string[] = [];
    if (data?.by_subject) {
      for (const s of data.by_subject) {
        if (s.subject_name && !seen.has(s.subject_name)) {
          seen.add(s.subject_name);
          opts.push(s.subject_name);
        }
      }
    }
    return opts;
  }, [data?.by_subject]);

  // 4. AI Reliance Distribution
  const relianceDistributionData = useMemo(() => {
    if (data?.reliance_distribution && data.reliance_distribution.length > 0) {
      return data.reliance_distribution;
    }
    return [];
  }, [data?.reliance_distribution]);

  // 5. Students with High AI Reliance (real DB data)
  const highRelianceStudents: HighAIRelianceStudent[] = useMemo(() => {
    let list: HighAIRelianceStudent[] = [];
    if (data?.high_reliance_students && data.high_reliance_students.length > 0) {
      list = [...data.high_reliance_students];
    }

    if (studentSearch.trim()) {
      const q = studentSearch.toLowerCase().trim();
      list = list.filter(
        s =>
          (s.full_name && s.full_name.toLowerCase().includes(q)) ||
          (s.roll_number && s.roll_number.toLowerCase().includes(q)) ||
          (s.department_name && s.department_name.toLowerCase().includes(q))
      );
    }

    list = list.filter(s => (s.reliance_rate ?? 0) >= thresholdLimit);

    return list;
  }, [data?.high_reliance_students, studentSearch, thresholdLimit]);

  const sortedStudents = useMemo(() => {
    const list = [...highRelianceStudents];
    list.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];
      if (valA === undefined || valA === null) valA = 0;
      if (valB === undefined || valB === null) valB = 0;
      if (typeof valA === 'string') {
        return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDir === 'asc' ? valA - valB : valB - valA;
    });
    return list;
  }, [highRelianceStudents, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedStudents.length / pageSize));
  const paginatedStudents = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return sortedStudents.slice(startIdx, startIdx + pageSize);
  }, [sortedStudents, currentPage, pageSize]);

  const handleExportCSV = () => {
    const rows = sortedStudents.map((s, idx) => ({
      Index: idx + 1,
      StudentName: s.full_name,
      StudentID: s.roll_number,
      Department: s.department_name,
      AIReliance: `${s.reliance_rate}%`,
      TotalQueries: s.total_queries,
      RiskBand: s.risk_band,
    }));
    exportCSV(rows, `high-ai-reliance-students-${new Date().toISOString().slice(0, 10)}`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%' }}>
      {/* ── TOP 4 KPI CARDS ─────────────────────────────────────────────────── */}
      <div className={styles.aiUsageKpiGrid}>
        {/* KPI 1: Total AI Queries */}
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
                  background: '#f5f3ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#7c3aed',
                }}
              >
                <Cpu size={18} />
              </div>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#475569' }}>
                Total AI Queries
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: '1.875rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                {formatNumber(totalQueries)}
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
                ↑ {deltas.queries == null ? '—' : `${deltas.queries.toFixed(1)}%`}
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
              Hints, chat, and code assistance requests
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
                <linearGradient id="aiQueriesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#c084fc" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#c084fc" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d={generateSmoothWavePath(sparklines.queries, 280, 50, true)}
                fill="url(#aiQueriesGrad)"
              />
              <path
                d={generateSmoothWavePath(sparklines.queries, 280, 50, false)}
                fill="none"
                stroke="#a855f7"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* KPI 2: Total Tokens Consumed */}
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
                <Sparkles size={18} />
              </div>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#475569' }}>
                Total Tokens Consumed
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: '1.875rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                {(totalTokens / 1000000).toFixed(1)}M
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
                ↑ {deltas.tokens == null ? '—' : `${deltas.tokens.toFixed(1)}%`}
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
              Across all AI-assisted sessions
            </p>
          </div>

          {/* Flowing Cyan Wave Sparkline */}
          <div style={{ width: '100%', height: 50, marginTop: 'auto', position: 'relative' }}>
            <svg
              viewBox="0 0 280 50"
              preserveAspectRatio="none"
              style={{ width: '100%', height: '100%', display: 'block' }}
            >
              <defs>
                <linearGradient id="aiTokensGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d={generateSmoothWavePath(sparklines.tokens, 280, 50, true)}
                fill="url(#aiTokensGrad)"
              />
              <path
                d={generateSmoothWavePath(sparklines.tokens, 280, 50, false)}
                fill="none"
                stroke="#0284c7"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* KPI 3: Active Consumers */}
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
                <Users size={18} />
              </div>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#475569' }}>
                Active Consumers
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: '1.875rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                {formatNumber(activeConsumers)}
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
                ↑ {deltas.consumers == null ? '—' : `${deltas.consumers.toFixed(1)}%`}
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
              Students using AI tools
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
                <linearGradient id="aiConsumersGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4ade80" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#4ade80" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d={generateSmoothWavePath(sparklines.consumers, 280, 50, true)}
                fill="url(#aiConsumersGrad)"
              />
              <path
                d={generateSmoothWavePath(sparklines.consumers, 280, 50, false)}
                fill="none"
                stroke="#10b981"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* KPI 4: High AI Reliance Students */}
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
                High AI Reliance Students
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: '1.875rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                {highRelianceCount}
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
                ↑ {deltas.high_reliance == null ? '—' : `${deltas.high_reliance.toFixed(1)}%`}
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
              &gt; 70% of experiments used AI help
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
                <linearGradient id="aiRelianceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f87171" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#f87171" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d={generateSmoothWavePath(sparklines.high_reliance, 280, 50, true)}
                fill="url(#aiRelianceGrad)"
              />
              <path
                d={generateSmoothWavePath(sparklines.high_reliance, 280, 50, false)}
                fill="none"
                stroke="#ef4444"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* ── MIDDLE ROW: 3-COLUMN GRID (Features Donut | Trend Mixed | Subjects Bars) ── */}
      <div className={styles.aiUsageMiddleGrid}>
        {/* Card 1: AI Usage by Feature */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03)',
            padding: '18px 16px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
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
                  flexShrink: 0,
                }}
              >
                <Clock size={16} />
              </div>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
                  AI Usage by Feature
                </h3>
                <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Distribution across features
                </p>
              </div>
            </div>

            <div style={{ position: 'relative', flexShrink: 0 }}>
              <select
                value={featureRange}
                onChange={e => setFeatureRange(Number(e.target.value))}
                style={{
                  height: 28,
                  padding: '0 22px 0 8px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  fontSize: '0.725rem',
                  fontWeight: 600,
                  color: '#334155',
                  outline: 'none',
                  appearance: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value={7}>Last 7 Days</option>
                <option value={30}>Last 30 Days</option>
                <option value={90}>Last 90 Days</option>
              </select>
              <ChevronDown
                size={12}
                style={{ position: 'absolute', right: 7, top: 8, color: '#94a3b8', pointerEvents: 'none' }}
              />
            </div>
          </div>

          {/* Donut and Legend Layout */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            {/* Donut Chart with Center Text */}
            <div style={{ width: 140, height: 165, position: 'relative', flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={featureBreakdown}
                    dataKey="calls"
                    nameKey="name"
                    innerRadius={44}
                    outerRadius={65}
                    paddingAngle={3}
                  >
                    {featureBreakdown.map(entry => (
                      <Cell key={entry.feature_key} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const item = payload[0].payload;
                        return (
                          <div
                            style={{
                              background: '#ffffff',
                              borderRadius: 8,
                              padding: '6px 10px',
                              border: '1px solid #ede9fe',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                              fontSize: '0.725rem',
                            }}
                          >
                            <span style={{ fontWeight: 700, color: item.color }}>{item.name}</span>
                            <div style={{ color: '#0f172a', fontWeight: 600, marginTop: 2 }}>
                              {formatNumber(item.calls)} queries ({item.pct}%)
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Center text */}
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
                <div style={{ fontSize: '0.975rem', fontWeight: 800, color: '#0f172a' }}>
                  {formatNumber(totalQueries)}
                </div>
                <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 600 }}>
                  Total Queries
                </div>
              </div>
            </div>

            {/* Feature List Legend */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1, minWidth: 0, overflow: 'hidden' }}>
              {featureBreakdown.map(feat => (
                <div
                  key={feat.feature_key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 6,
                    minWidth: 0,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, flex: 1, overflow: 'hidden' }}>
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: feat.color,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: '0.725rem',
                        fontWeight: 500,
                        color: '#334155',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={feat.name}
                    >
                      {feat.name}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: '0.725rem', fontWeight: 700, color: '#0f172a' }}>
                      {formatNumber(feat.calls)}
                    </span>
                    <span
                      style={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: 4,
                        background: '#f1f5f9',
                        color: '#475569',
                        minWidth: 36,
                        textAlign: 'right',
                      }}
                    >
                      {feat.pct == null ? '—' : `${feat.pct.toFixed(1)}%`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Card 2: AI Usage Trend (Dual Axis Mixed Chart) */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03)',
            padding: '20px 22px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
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
                <BarChart2 size={16} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.925rem', fontWeight: 700, color: '#0f172a' }}>
                  AI Usage Trend
                </h3>
                <p style={{ margin: 0, fontSize: '0.725rem', color: '#64748b' }}>
                  Daily AI queries and active users
                </p>
              </div>
            </div>

            <div style={{ position: 'relative' }}>
              <select
                value={trendRange}
                onChange={e => {
                  const val = Number(e.target.value);
                  setTrendRange(val);
                  if (onDaysChange) onDaysChange(val);
                }}
                style={{
                  height: 30,
                  padding: '0 24px 0 8px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  fontSize: '0.725rem',
                  fontWeight: 600,
                  color: '#334155',
                  outline: 'none',
                  appearance: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value={7}>Last 7 Days</option>
                <option value={30}>Last 30 Days</option>
                <option value={90}>Last 90 Days</option>
              </select>
              <ChevronDown
                size={12}
                style={{ position: 'absolute', right: 7, top: 9, color: '#94a3b8', pointerEvents: 'none' }}
              />
            </div>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: '#a78bfa' }} />
              <span style={{ fontSize: '0.725rem', fontWeight: 600, color: '#475569' }}>AI Queries</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#06b6d4' }} />
              <span style={{ fontSize: '0.725rem', fontWeight: 600, color: '#475569' }}>Active Users</span>
            </div>
          </div>

          {/* Mixed ComposedChart */}
          <div style={{ width: '100%', height: 180, position: 'relative' }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={usageTrendData} margin={{ top: 8, right: 0, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                />
                <YAxis
                  yAxisId="left"
                  domain={[0, 1000]}
                  ticks={[0, 200, 400, 600, 800, 1000]}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 200]}
                  ticks={[0, 40, 80, 120, 160, 200]}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                />
                <RechartsTooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const pt = payload[0].payload;
                      return (
                        <div
                          style={{
                            background: '#ffffff',
                            borderRadius: 8,
                            padding: '8px 12px',
                            border: '1px solid #ede9fe',
                            boxShadow: '0 8px 20px rgba(0,0,0,0.08)',
                            fontSize: '0.75rem',
                          }}
                        >
                          <p style={{ margin: '0 0 4px 0', fontWeight: 700, color: '#0f172a' }}>{label}</p>
                          <div style={{ color: '#7c3aed', fontWeight: 600 }}>
                            AI Queries: <strong style={{ color: '#0f172a' }}>{pt.queries}</strong>
                          </div>
                          <div style={{ color: '#06b6d4', fontWeight: 600, marginTop: 2 }}>
                            Active Users: <strong style={{ color: '#0f172a' }}>{pt.active_users}</strong>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar
                  yAxisId="left"
                  dataKey="queries"
                  fill="#8b5cf6"
                  opacity={0.7}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={14}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="active_users"
                  stroke="#06b6d4"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#06b6d4', stroke: '#ffffff', strokeWidth: 1.5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Card 3: AI Usage by Subject */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03)',
            padding: '20px 22px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
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
                  flexShrink: 0,
                }}
              >
                <BookOpen size={16} />
              </div>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
                  AI Usage by Subject
                </h3>
                <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Queries & reliance rate
                </p>
              </div>
            </div>

            <div style={{ position: 'relative', flexShrink: 0 }}>
              <select
                value={subjectFilter}
                onChange={e => setSubjectFilter(e.target.value)}
                style={{
                  height: 28,
                  padding: '0 22px 0 8px',
                  maxWidth: 120,
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  fontSize: '0.725rem',
                  fontWeight: 600,
                  color: '#334155',
                  outline: 'none',
                  appearance: 'none',
                  cursor: 'pointer',
                  textOverflow: 'ellipsis',
                }}
              >
                <option value="all">All Subjects</option>
                {uniqueSubjectOptions.map(name => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={12}
                style={{ position: 'absolute', right: 7, top: 8, color: '#94a3b8', pointerEvents: 'none' }}
              />
            </div>
          </div>

          {/* Subject Progress Bars */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              marginTop: 4,
              maxHeight: 205,
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            {subjectUsageList.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: '#94a3b8', fontSize: '0.75rem' }}>
                No subjects found for this selection
              </div>
            ) : (
              subjectUsageList.map((s, idx) => {
                const badgeBg = s.reliance_pct >= 20 ? '#fee2e2' : s.reliance_pct >= 12 ? '#fef3c7' : '#dcfce7';
                const badgeText = s.reliance_pct >= 20 ? '#b91c1c' : s.reliance_pct >= 12 ? '#b45309' : '#15803d';
                const itemKey = `${s.subject_id || s.subject_name}-${idx}`;

                return (
                  <div key={itemKey} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Subject Name */}
                    <span
                      style={{
                        width: 110,
                        fontSize: '0.725rem',
                        fontWeight: 500,
                        color: '#334155',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        flexShrink: 0,
                      }}
                      title={s.subject_name}
                    >
                      {s.subject_name}
                    </span>

                    {/* Horizontal Bar */}
                    <div
                      style={{
                        flex: 1,
                        height: 7,
                        background: '#ede9fe',
                        borderRadius: 9999,
                        overflow: 'hidden',
                        minWidth: 40,
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(100, Math.max(4, (s.queries / Math.max(totalQueries * 0.25, 1)) * 100))}%`,
                          background: '#8b5cf6',
                          borderRadius: 9999,
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>

                    {/* Query Count */}
                    <span style={{ fontSize: '0.725rem', fontWeight: 700, color: '#0f172a', minWidth: 32, textAlign: 'right', flexShrink: 0 }}>
                      {formatNumber(s.queries)}
                    </span>

                    {/* Reliance Badge */}
                    <span
                      style={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: 4,
                        background: badgeBg,
                        color: badgeText,
                        minWidth: 38,
                        textAlign: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {s.reliance_pct == null ? '—' : `${s.reliance_pct.toFixed(1)}%`}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── BOTTOM ROW: 2-COLUMN GRID (Reliance Distribution | High Reliance Table) ── */}
      <div className={styles.aiUsageBottomGrid}>
        {/* Card Left: AI Reliance Distribution */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03)',
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
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
              <Clock size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                AI Reliance Distribution
              </h3>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                Percentage of experiments where AI assistance was used
              </p>
            </div>
          </div>

          {/* Bar Chart with Data Labels */}
          <div style={{ width: '100%', height: 260, position: 'relative' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={relianceDistributionData} margin={{ top: 24, right: 10, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="bracket"
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <YAxis
                  domain={[0, 250]}
                  ticks={[0, 50, 100, 150, 200, 250]}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <RechartsTooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0].payload;
                      return (
                        <div
                          style={{
                            background: '#ffffff',
                            borderRadius: 8,
                            padding: '6px 12px',
                            border: '1px solid #ede9fe',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                            fontSize: '0.75rem',
                          }}
                        >
                          <span style={{ fontWeight: 600, color: '#64748b' }}>Bracket {item.bracket}:</span>
                          <span style={{ fontWeight: 700, color: '#7c3aed', marginLeft: 6 }}>
                            {item.count} students
                          </span>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="count" fill="#a78bfa" radius={[4, 4, 0, 0]} maxBarSize={38}>
                  <LabelList
                    dataKey="count"
                    position="top"
                    style={{ fontSize: 11, fontWeight: 700, fill: '#0f172a' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* AI Reliance Summary & Tier Breakdown */}
          <div
            style={{
              marginTop: 16,
              paddingTop: 14,
              borderTop: '1px solid #f1f5f9',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.775rem' }}>
              <span style={{ fontWeight: 600, color: '#64748b' }}>High Reliance (&gt; 70%):</span>
              <span style={{ fontWeight: 700, color: '#ef4444', background: '#fee2e2', padding: '2px 8px', borderRadius: 6 }}>
                {highRelianceStudents.length} Students ({activeConsumers > 0 ? ((highRelianceStudents.length / activeConsumers) * 100).toFixed(1) : 0}%)
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.775rem' }}>
              <span style={{ fontWeight: 600, color: '#64748b' }}>Moderate Reliance (30–70%):</span>
              <span style={{ fontWeight: 700, color: '#d97706', background: '#fef3c7', padding: '2px 8px', borderRadius: 6 }}>
                {relianceDistributionData.filter(b => ['31-40%', '41-50%', '51-70%'].includes(b.bracket)).reduce((acc, b) => acc + b.count, 0)} Students
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.775rem' }}>
              <span style={{ fontWeight: 600, color: '#64748b' }}>Independent / Low Reliance (&le; 30%):</span>
              <span style={{ fontWeight: 700, color: '#15803d', background: '#dcfce7', padding: '2px 8px', borderRadius: 6 }}>
                {relianceDistributionData.filter(b => ['0-10%', '11-20%', '21-30%'].includes(b.bracket)).reduce((acc, b) => acc + b.count, 0)} Students
              </span>
            </div>
            <div
              style={{
                marginTop: 6,
                padding: '10px 12px',
                borderRadius: 8,
                background: '#faf5ff',
                border: '1px solid #f3e8ff',
                fontSize: '0.725rem',
                color: '#6b21a8',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Sparkles size={14} style={{ color: '#9333ea', flexShrink: 0 }} />
              <span>Institutional AI guardrails are active with auto-throttling on excessive hint loops.</span>
            </div>
          </div>
        </div>

        {/* Card Right: Students with High AI Reliance */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03)',
            padding: '18px 20px',
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
                  Students with High AI Reliance
                </h3>
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                  Students who frequently rely on AI assistance (e.g., &gt; {thresholdLimit}% of experiments)
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
                  placeholder="Search students..."
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
                    width: 160,
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

              {/* Filters button */}
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
                      Reliance Threshold:
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {[85, 75, 70, 60].map(val => (
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
                          &gt; {val}% AI Reliance
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Export CSV button */}
              <button
                type="button"
                onClick={handleExportCSV}
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

          {/* Table */}
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 460 }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid #f1f5f9' }}>
                  <th style={{ padding: '8px 4px', fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', width: 24, textAlign: 'center' }}>
                    #
                  </th>
                  <th
                    onClick={() => handleSort('full_name')}
                    style={{
                      padding: '8px 8px',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: sortField === 'full_name' ? '#7c3aed' : '#94a3b8',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    Student Name {renderSortIcon('full_name')}
                  </th>
                  <th
                    onClick={() => handleSort('roll_number')}
                    style={{
                      padding: '8px 6px',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: sortField === 'roll_number' ? '#7c3aed' : '#94a3b8',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    ID {renderSortIcon('roll_number')}
                  </th>
                  <th
                    onClick={() => handleSort('department_name')}
                    style={{
                      padding: '8px 6px',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: sortField === 'department_name' ? '#7c3aed' : '#94a3b8',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    Department {renderSortIcon('department_name')}
                  </th>
                  <th
                    onClick={() => handleSort('reliance_rate')}
                    style={{
                      padding: '8px 6px',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: sortField === 'reliance_rate' ? '#7c3aed' : '#94a3b8',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    AI Reliance {renderSortIcon('reliance_rate')}
                  </th>
                  <th
                    onClick={() => handleSort('total_queries')}
                    style={{
                      padding: '8px 6px',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: sortField === 'total_queries' ? '#7c3aed' : '#94a3b8',
                      textAlign: 'center',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    Total Queries {renderSortIcon('total_queries')}
                  </th>
                  <th style={{ padding: '8px 4px', fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', textAlign: 'center', width: 56 }}>
                    Trend
                  </th>
                  <th style={{ padding: '8px 6px', fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', textAlign: 'right' }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedStudents.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '36px 16px', color: '#64748b', fontSize: '0.82rem' }}>
                      No students exceeding the AI reliance threshold found for this period.
                    </td>
                  </tr>
                ) : (
                  paginatedStudents.map((st, idx) => {
                    const badgeBg = st.reliance_rate >= 80 ? '#fee2e2' : '#fef3c7';
                    const badgeText = st.reliance_rate >= 80 ? '#b91c1c' : '#b45309';
                    const globalIdx = (currentPage - 1) * pageSize + idx + 1;

                    return (
                      <tr
                        key={st.student_id}
                        style={{
                          borderBottom: '1px solid #f8fafc',
                          transition: 'background 0.15s ease',
                        }}
                      >
                        {/* Index */}
                        <td style={{ padding: '8px 4px', fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>
                          {globalIdx}
                        </td>

                        {/* Student Name */}
                        <td style={{ padding: '8px 8px', fontSize: '0.8rem', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>
                          {st.full_name}
                        </td>

                        {/* Roll / ID */}
                        <td style={{ padding: '8px 6px', fontSize: '0.725rem', color: '#64748b', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                          {st.roll_number}
                        </td>

                        {/* Department */}
                        <td style={{ padding: '8px 6px', fontSize: '0.75rem', color: '#475569', whiteSpace: 'nowrap' }}>
                          {st.department_name}
                        </td>

                        {/* AI Reliance Badge */}
                        <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: badgeBg,
                              color: badgeText,
                              fontSize: '0.725rem',
                              fontWeight: 700,
                            }}
                          >
                            {st.reliance_rate == null ? '—' : `${st.reliance_rate.toFixed(1)}%`}
                          </span>
                        </td>

                        {/* Total Queries */}
                        <td
                          style={{
                            padding: '8px 6px',
                            textAlign: 'center',
                            fontSize: '0.8125rem',
                            fontWeight: 700,
                            color: '#0f172a',
                          }}
                        >
                          {st.total_queries}
                        </td>

                        {/* Mini Sparkline Trend */}
                        <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                          <div style={{ width: 52, height: 18, margin: '0 auto' }}>
                            <svg viewBox="0 0 52 18" style={{ width: '100%', height: '100%' }}>
                              <defs>
                                <linearGradient id={`aiTrendGrad-${st.student_id}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#f87171" stopOpacity="0.4" />
                                  <stop offset="100%" stopColor="#f87171" stopOpacity="0.0" />
                                </linearGradient>
                              </defs>
                              <path
                                d={generateSmoothWavePath(st.sparkline || [], 52, 18, true)}
                                fill={`url(#aiTrendGrad-${st.student_id})`}
                              />
                              <path
                                d={generateSmoothWavePath(st.sparkline || [], 52, 18, false)}
                                fill="none"
                                stroke="#ef4444"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                              />
                            </svg>
                          </div>
                        </td>

                        {/* Action */}
                        <td style={{ padding: '8px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, position: 'relative' }}>
                            <button
                              type="button"
                              onClick={() => {
                                if (onSelectStudent) onSelectStudent(st.student_id);
                              }}
                              style={{
                                padding: '3px 10px',
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
                                    alert(`AI Reliance notice sent to ${st.full_name} (${st.roll_number})`);
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
                                  <span>Send Guidance Notice</span>
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
          {sortedStudents.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 18px',
                borderTop: '1px solid #f1f5f9',
                fontSize: '0.75rem',
                color: '#64748b',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span>
                  Showing {(currentPage - 1) * pageSize + 1} to{' '}
                  {Math.min(currentPage * pageSize, sortedStudents.length)} of{' '}
                  {sortedStudents.length} students
                </span>
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
                        fontSize: '0.72rem',
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
    </div>
  );
}
