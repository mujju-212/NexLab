'use client';

import React, { useState, useMemo } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  TrendingUp,
  User,
  Users,
  Search,
  Filter,
  Download,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Info,
  Check,
  ArrowUpRight,
  ArrowDownRight,
  X,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type { RiskOverviewReport } from '@/services/institution.service';
import { exportCSV } from '@/lib/analytics-utils';
import styles from './analytics.module.css';

interface RiskEarlyWarningTabProps {
  data: RiskOverviewReport;
  onSelectStudent: (studentId: string) => void;
  days: number;
  isHowItWorksOpen?: boolean;
  onCloseHowItWorks?: () => void;
}

export function RiskEarlyWarningTab({
  data,
  onSelectStudent,
  days,
  isHowItWorksOpen,
  onCloseHowItWorks,
}: RiskEarlyWarningTabProps) {
  const [search, setSearch] = useState('');
  const [bandFilter, setBandFilter] = useState<'all' | 'critical' | 'high' | 'watch'>('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [trendDays, setTrendDays] = useState(days);
  const [selectedCohortView, setSelectedCohortView] = useState('All Students');
  const [deptSortMode, setDeptSortMode] = useState<'risk' | 'name'>('risk');

  const summary = data.summary;
  const bands = summary.bands || { critical: 0, high: 0, watch: 0, ok: 0 };
  const bandPcts = summary.band_percentages || { critical: 0, high: 0, watch: 0, ok: 0 };
  const bandDeltas = summary.band_deltas || { critical: 0, high: 0, watch: 0, ok: 0 };
  const riskDelta = summary.risk_delta ?? 0;

  // Donut chart data
  const donutData = useMemo(() => [
    { name: 'Critical (≥70)', value: bands.critical, color: '#ef4444', pct: bandPcts.critical },
    { name: 'High (50–69)', value: bands.high, color: '#f97316', pct: bandPcts.high },
    { name: 'Watch (30–49)', value: bands.watch, color: '#facc15', pct: bandPcts.watch },
    { name: 'Ok (<30)', value: bands.ok, color: '#22c55e', pct: bandPcts.ok },
  ], [bands, bandPcts]);

  // Daily Trend Data from backend or fallback points
  const trendData = useMemo(() => {
    if (data.trend_daily && data.trend_daily.length > 0) {
      return data.trend_daily;
    }
    return [];
  }, [data.trend_daily]);

  // Mini Sparkline Data for Card 1
  const sparklineData = useMemo(() => {
    return trendData.map(t => ({ val: t.avg_risk }));
  }, [trendData]);

  // Department Breakdown from live data
  const deptList = useMemo(() => {
    if (data.by_department && data.by_department.length > 0) {
      const list = [...data.by_department];
      if (deptSortMode === 'name') {
        list.sort((a, b) => a.name.localeCompare(b.name));
      } else {
        list.sort((a, b) => b.avg_risk - a.avg_risk);
      }
      return list;
    }
    return [];
  }, [data.by_department, deptSortMode]);

  // Student Roster
  const studentRows = useMemo(() => {
    return data.students || data.top_critical_students || [];
  }, [data.students, data.top_critical_students]);

  // Filtered & Searched Roster
  const filteredStudents = useMemo(() => {
    return studentRows.filter(s => {
      const matchesBand = bandFilter === 'all' || s.risk_band === bandFilter;
      if (!matchesBand) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        s.full_name?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        s.roll_number?.toLowerCase().includes(q) ||
        s.section_name?.toLowerCase().includes(q) ||
        s.primary_reason?.toLowerCase().includes(q)
      );
    });
  }, [studentRows, bandFilter, search]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const pagedStudents = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredStudents.slice(start, start + pageSize);
  }, [filteredStudents, page, pageSize]);

  // Checkbox management
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(pagedStudents.map(s => s.student_id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // CSV Export
  const handleExportCSV = () => {
    const exportData = filteredStudents.map((s, idx) => ({
      Index: idx + 1,
      Name: s.full_name,
      Roll: s.roll_number || '',
      Section: s.section_name || '',
      Department: s.department_name || '',
      RiskScore: s.risk_score,
      RiskBand: s.risk_band,
      PrimaryDriver: s.primary_reason,
      Mastery: `${s.mastery ?? s.components?.mastery ?? 0}%`,
      GradeAvg: `${s.grade_avg ?? s.components?.grade ?? 0}%`,
      Attendance: `${s.attendance ?? s.components?.attendance ?? 0}%`,
      Engagement: `${s.engagement ?? s.components?.focus ?? 0}%`,
      LastActive: s.last_active || '',
    }));
    exportCSV(exportData, `at-risk-student-roster-${new Date().toISOString().slice(0, 10)}`);
  };

  // Helper for percentage badge styling
  const getPctBadgeStyle = (pctVal: number, isGoodHigh = true) => {
    if (isGoodHigh) {
      if (pctVal >= 70) return { bg: '#f0fdf4', color: '#16a34a' };
      if (pctVal >= 50) return { bg: '#fffbeb', color: '#b45309' };
      return { bg: '#fef2f2', color: '#dc2626' };
    } else {
      if (pctVal >= 70) return { bg: '#fef2f2', color: '#dc2626' };
      if (pctVal >= 50) return { bg: '#fffbeb', color: '#b45309' };
      return { bg: '#f0fdf4', color: '#16a34a' };
    }
  };

  // Helper for risk band pill
  const getBandBadge = (band: string) => {
    switch (band) {
      case 'critical':
        return { bg: '#fee2e2', color: '#ef4444', label: 'Critical' };
      case 'high':
        return { bg: '#ffedd5', color: '#ea580c', label: 'High' };
      case 'watch':
        return { bg: '#fef9c3', color: '#ca8a04', label: 'Watch' };
      default:
        return { bg: '#dcfce7', color: '#16a34a', label: 'Ok' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Top 4 KPI Cards Row ── */}
      <div className={styles.riskKpiGrid}>
        {/* KPI 1: Average Risk Score with Sparkline */}
        <div className={styles.riskKpiCard}>
          <div>
            <div className={styles.kpiTopRow}>
              <div className={styles.kpiIconBox} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                <TrendingUp size={16} strokeWidth={2.4} />
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151' }}>
                Average Risk Score
              </span>
              <span
                className={styles.kpiDeltaPill}
                style={{ background: '#fee2e2', color: '#ef4444' }}
              >
                <ArrowUpRight size={11} strokeWidth={2.5} />
                <span>{riskDelta > 0 ? `+${riskDelta}` : riskDelta}%</span>
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
              <span className={styles.kpiValueBig} style={{ color: '#ef4444' }}>
                {summary.avg_risk_score}
              </span>
              <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#6b7280' }}>
                / 100
              </span>
            </div>

            <div className={styles.kpiSubNote}>
              Campus-wide student risk index
            </div>
          </div>

          {/* Sparkline running at bottom of card */}
          <div style={{ width: '100%', height: 38, marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparklineData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="kpiSparkGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="val"
                  stroke="#ef4444"
                  strokeWidth={2}
                  fill="url(#kpiSparkGrad)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* KPI 2: Critical Risk Students */}
        <div className={styles.riskKpiCard}>
          <div>
            <div className={styles.kpiTopRow}>
              <div className={styles.kpiIconBox} style={{ background: '#fee2e2', color: '#ef4444' }}>
                <AlertTriangle size={16} strokeWidth={2.4} />
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151' }}>
                Critical Risk Students
              </span>
              <span
                className={styles.kpiDeltaPill}
                style={{ background: '#fee2e2', color: '#ef4444' }}
              >
                <ArrowUpRight size={11} strokeWidth={2.5} />
                <span>+{Math.abs(bandDeltas.critical)}%</span>
              </span>
            </div>

            <div style={{ marginTop: 4 }}>
              <span className={styles.kpiValueBig} style={{ color: '#ef4444' }}>
                {bands.critical}
              </span>
            </div>

            <div className={styles.kpiSubNote}>
              Score ≥ 70 — immediate intervention
            </div>
          </div>

          <div className={styles.silhouettesRow}>
            <div className={styles.silhouettesGroup}>
              <User size={13} style={{ color: '#ef4444' }} />
              <User size={13} style={{ color: '#ef4444' }} />
              <User size={13} style={{ color: '#ef4444' }} />
              <User size={13} style={{ color: '#ef4444' }} />
            </div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280' }}>
              {bandPcts.critical}% of total students
            </span>
          </div>
        </div>

        {/* KPI 3: High Risk Students */}
        <div className={styles.riskKpiCard}>
          <div>
            <div className={styles.kpiTopRow}>
              <div className={styles.kpiIconBox} style={{ background: '#ffedd5', color: '#f97316' }}>
                <AlertTriangle size={16} strokeWidth={2.4} />
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151' }}>
                High Risk Students
              </span>
              <span
                className={styles.kpiDeltaPill}
                style={{ background: '#fee2e2', color: '#ef4444' }}
              >
                <ArrowUpRight size={11} strokeWidth={2.5} />
                <span>+{Math.abs(bandDeltas.high)}%</span>
              </span>
            </div>

            <div style={{ marginTop: 4 }}>
              <span className={styles.kpiValueBig} style={{ color: '#ea580c' }}>
                {bands.high}
              </span>
            </div>

            <div className={styles.kpiSubNote}>
              Score 50–69 — academic risk pattern
            </div>
          </div>

          <div className={styles.silhouettesRow}>
            <div className={styles.silhouettesGroup}>
              <User size={13} style={{ color: '#f97316' }} />
              <User size={13} style={{ color: '#f97316' }} />
              <User size={13} style={{ color: '#f97316' }} />
              <User size={13} style={{ color: '#f97316' }} />
            </div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280' }}>
              {bandPcts.high}% of total students
            </span>
          </div>
        </div>

        {/* KPI 4: Watch List Students */}
        <div className={styles.riskKpiCard}>
          <div>
            <div className={styles.kpiTopRow}>
              <div className={styles.kpiIconBox} style={{ background: '#fef9c3', color: '#eab308' }}>
                <Users size={16} strokeWidth={2.4} />
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151' }}>
                Watch List Students
              </span>
              <span
                className={styles.kpiDeltaPill}
                style={{ background: '#f0fdf4', color: '#16a34a' }}
              >
                <ArrowDownRight size={11} strokeWidth={2.5} />
                <span>-{Math.abs(bandDeltas.watch)}%</span>
              </span>
            </div>

            <div style={{ marginTop: 4 }}>
              <span className={styles.kpiValueBig} style={{ color: '#ca8a04' }}>
                {bands.watch}
              </span>
            </div>

            <div className={styles.kpiSubNote}>
              Score 30–49 — early warning signals
            </div>
          </div>

          <div className={styles.silhouettesRow}>
            <div className={styles.silhouettesGroup}>
              <User size={13} style={{ color: '#ca8a04' }} />
              <User size={13} style={{ color: '#ca8a04' }} />
              <User size={13} style={{ color: '#ca8a04' }} />
              <User size={13} style={{ color: '#ca8a04' }} />
            </div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280' }}>
              {bandPcts.watch}% of total students
            </span>
          </div>
        </div>
      </div>

      {/* ── 3. Interactive Charts Grid (3 Columns: Donut, Line/Area Trend, Dept Breakdown) ── */}
      <div className={styles.threeColChartsGrid}>
        {/* Card 1: Risk Distribution Donut */}
        <div className={styles.chartCard}>
          <div className={styles.chartCardHeader}>
            <h3 className={styles.chartCardTitle}>Risk Distribution</h3>
            <select
              className={styles.chartSelectMini}
              value={selectedCohortView}
              onChange={e => setSelectedCohortView(e.target.value)}
            >
              <option value="All Students">All Students</option>
              <option value="First Year">First Year</option>
              <option value="Second Year">Second Year</option>
              <option value="Final Year">Final Year</option>
            </select>
          </div>

          <div className={styles.donutWrapper}>
            {/* Donut Chart with Centered Total */}
            <div style={{ width: 170, height: 170, position: 'relative', flexShrink: 0 }}>
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
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#111827', lineHeight: 1.1 }}>
                  {summary.total_students.toLocaleString()}
                </div>
                <div style={{ fontSize: '0.675rem', fontWeight: 600, color: '#6b7280', textTransform: 'capitalize' }}>
                  Total Students
                </div>
              </div>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {donutData.map(entry => (
                      <Cell key={entry.name} fill={entry.color} stroke="#ffffff" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: number, name: string) => [
                      `${val} students (${summary.total_students ? Math.round((val / summary.total_students) * 100) : 0}%)`,
                      name,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Legend list matching the image */}
            <div className={styles.donutLegendList}>
              {donutData.map(d => (
                <div key={d.name} className={styles.donutLegendItem}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span className={styles.donutDot} style={{ background: d.color }} />
                    <span style={{ fontSize: '0.75rem', color: '#4b5563' }}>{d.name}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: '#111827', fontSize: '0.775rem' }}>{d.value}</span>
                    <span style={{ color: '#9ca3af', fontSize: '0.725rem', width: 28, textAlign: 'right' }}>{d.pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Card 2: Risk Trend Over Time */}
        <div className={styles.chartCard}>
          <div className={styles.chartCardHeader}>
            <h3 className={styles.chartCardTitle}>Risk Trend Over Time</h3>
            <select
              className={styles.chartSelectMini}
              value={trendDays}
              onChange={e => setTrendDays(Number(e.target.value))}
            >
              <option value={7}>Last 7 Days</option>
              <option value={14}>Last 14 Days</option>
              <option value={30}>Last 30 Days</option>
              <option value={60}>Last 60 Days</option>
              <option value={90}>Last 90 Days</option>
            </select>
          </div>

          {/* Top Custom Legend matching the screenshot */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 10,
              fontSize: '0.725rem',
              fontWeight: 600,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#ef4444' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444' }} />
              <span>Average Risk</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#ef4444' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444' }} />
              <span>Critical</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#f97316' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f97316' }} />
              <span>High</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#facc15' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#facc15' }} />
              <span>Watch</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#22c55e' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e' }} />
              <span>OK</span>
            </div>
          </div>

          {/* Recharts Area / Line Chart */}
          <div style={{ width: '100%', height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="avgRiskAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  axisLine={{ stroke: '#f3f4f6' }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 20, 40, 60, 80, 100]}
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: '#111827',
                    border: 'none',
                    borderRadius: 8,
                    color: '#ffffff',
                    fontSize: 11,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                  }}
                  itemStyle={{ padding: '1px 0' }}
                />
                <Area
                  type="monotone"
                  dataKey="avg_risk"
                  name="Average Risk"
                  stroke="#ef4444"
                  strokeWidth={2.2}
                  fill="url(#avgRiskAreaGrad)"
                  dot={{ r: 2.5, fill: '#ef4444' }}
                />
                <Line
                  type="monotone"
                  dataKey="critical"
                  name="Critical Cohort"
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="high"
                  name="High Risk"
                  stroke="#f97316"
                  strokeWidth={1.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="watch"
                  name="Watch List"
                  stroke="#facc15"
                  strokeWidth={1.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="ok"
                  name="OK (<30)"
                  stroke="#22c55e"
                  strokeWidth={1.5}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Card 3: Risk by Department */}
        <div className={styles.chartCard}>
          <div className={styles.chartCardHeader}>
            <h3 className={styles.chartCardTitle}>Risk by Department</h3>
            <select
              className={styles.chartSelectMini}
              value={deptSortMode}
              onChange={e => setDeptSortMode(e.target.value as any)}
            >
              <option value="risk">Average Risk</option>
              <option value="name">Alphabetical</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, justifyContent: 'center' }}>
            {deptList.length === 0 ? (
              <div style={{ padding: '24px 10px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>
                No department risk distribution recorded yet.
              </div>
            ) : (
              deptList.map(dept => {
              const b = dept.bands || { critical: 1, high: 1, watch: 1, ok: 1 };
              const tot = Math.max(1, (b.critical || 0) + (b.high || 0) + (b.watch || 0) + (b.ok || 0));
              const critW = ((b.critical || 0) / tot) * 100;
              const highW = ((b.high || 0) / tot) * 100;
              const watchW = ((b.watch || 0) / tot) * 100;
              const okW = ((b.ok || 0) / tot) * 100;

              return (
                <div key={dept.department_id || dept.name} className={styles.deptRow}>
                  <span className={styles.deptName} title={dept.name}>
                    {dept.name}
                  </span>
                  <div
                    className={styles.deptBarContainer}
                    title={`${dept.name}: Avg Risk ${dept.avg_risk} (Critical: ${b.critical}, High: ${b.high}, Watch: ${b.watch}, Ok: ${b.ok})`}
                  >
                    <div className={styles.deptBarSegment} style={{ width: `${critW}%`, background: '#ef4444' }} />
                    <div className={styles.deptBarSegment} style={{ width: `${highW}%`, background: '#f97316' }} />
                    <div className={styles.deptBarSegment} style={{ width: `${watchW}%`, background: '#facc15' }} />
                    <div className={styles.deptBarSegment} style={{ width: `${okW}%`, background: '#22c55e' }} />
                  </div>
                  <span className={styles.deptScore}>{dept.avg_risk}</span>
                </div>
              );
            })
          )}
          </div>
        </div>
      </div>

      {/* ── 4. At-Risk Student Early Warning Roster (Table) ── */}
      <div className={styles.rosterCard}>
        <div className={styles.rosterHeader}>
          <div>
            <h3 className={styles.rosterTitle}>At-Risk Student Early Warning Roster</h3>
            <p className={styles.rosterSubtitle}>
              Click any student to view complete profile, concept mastery and detailed risk breakdown.
            </p>
          </div>

          <div className={styles.rosterControls}>
            <div className={styles.rosterSearchBox}>
              <Search size={14} style={{ position: 'absolute', left: 10, color: '#9ca3af' }} />
              <input
                type="text"
                placeholder="Search students by name, ID or email..."
                className={styles.rosterSearchInput}
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            {/* Filter Pill */}
            <select
              className={styles.chartSelectMini}
              style={{ height: 34, padding: '0 10px', borderRadius: 8 }}
              value={bandFilter}
              onChange={e => {
                setBandFilter(e.target.value as any);
                setPage(1);
              }}
            >
              <option value="all">All Risk Bands</option>
              <option value="critical">Critical (≥70)</option>
              <option value="high">High (50–69)</option>
              <option value="watch">Watch (30–49)</option>
            </select>

            <button
              type="button"
              className={styles.actionBtn}
              style={{
                background: '#7c3aed',
                color: '#ffffff',
                height: 34,
                borderRadius: 8,
                padding: '0 14px',
              }}
              onClick={handleExportCSV}
            >
              <Download size={13} />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Table Body */}
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table className={styles.rosterTable}>
            <thead>
              <tr>
                <th style={{ width: 36, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={pagedStudents.length > 0 && selectedIds.size === pagedStudents.length}
                    onChange={e => handleSelectAll(e.target.checked)}
                    style={{ accentColor: '#7c3aed', cursor: 'pointer' }}
                  />
                </th>
                <th style={{ width: 36, textAlign: 'center' }}>#</th>
                <th style={{ minWidth: 180 }}>Student</th>
                <th style={{ minWidth: 130 }}>Risk Score</th>
                <th style={{ minWidth: 100 }}>Risk Band</th>
                <th style={{ minWidth: 170 }}>Primary Driver</th>
                <th style={{ minWidth: 80, textAlign: 'center' }}>Mastery</th>
                <th style={{ minWidth: 80, textAlign: 'center' }}>Grade Avg</th>
                <th style={{ minWidth: 80, textAlign: 'center' }}>Attendance</th>
                <th style={{ minWidth: 80, textAlign: 'center' }}>Engagement</th>
                <th style={{ minWidth: 100 }}>Last Active</th>
                <th style={{ minWidth: 100, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedStudents.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ textAlign: 'center', padding: '36px 0', color: '#9ca3af' }}>
                    No at-risk students match the selected filters.
                  </td>
                </tr>
              ) : (
                pagedStudents.map((s, idx) => {
                  const globalIdx = (page - 1) * pageSize + idx + 1;
                  const isChecked = selectedIds.has(s.student_id);
                  const bandInfo = getBandBadge(s.risk_band);
                  const mastery = s.mastery ?? s.components?.mastery ?? 0;
                  const grade = s.grade_avg ?? s.components?.grade ?? 0;
                  const att = s.attendance ?? s.components?.attendance ?? 0;
                  const eng = s.engagement ?? s.components?.focus ?? 0;

                  const masteryStyle = getPctBadgeStyle(mastery, true);
                  const gradeStyle = getPctBadgeStyle(grade, true);
                  const attStyle = getPctBadgeStyle(att, true);
                  const engStyle = getPctBadgeStyle(eng, true);

                  return (
                    <tr
                      key={s.student_id}
                      className={styles.rosterTableRow}
                      onClick={() => onSelectStudent(s.student_id)}
                    >
                      <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleRow(s.student_id)}
                          style={{ accentColor: '#7c3aed', cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ textAlign: 'center', color: '#9ca3af', fontWeight: 600 }}>
                        {globalIdx}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 700, color: '#111827', fontSize: '0.84rem' }}>
                            {s.full_name}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 1 }}>
                            {s.roll_number || s.email} • {s.section_name || 'Section A'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              fontWeight: 800,
                              fontSize: '0.9rem',
                              color: bandInfo.color,
                              width: 24,
                            }}
                          >
                            {Math.round(s.risk_score)}
                          </span>
                          <div
                            style={{
                              width: 60,
                              height: 6,
                              borderRadius: 9999,
                              background: '#f3f4f6',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${Math.min(100, s.risk_score)}%`,
                                height: '100%',
                                background: bandInfo.color,
                                borderRadius: 9999,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            background: bandInfo.bg,
                            color: bandInfo.color,
                            padding: '3px 9px',
                            borderRadius: 9999,
                            fontWeight: 700,
                            fontSize: '0.725rem',
                          }}
                        >
                          {bandInfo.label}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: '#374151', fontSize: '0.8rem' }}>
                          {s.primary_reason}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span
                          className={styles.pctBadge}
                          style={{ background: masteryStyle.bg, color: masteryStyle.color }}
                        >
                          {Math.round(mastery)}%
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span
                          className={styles.pctBadge}
                          style={{ background: gradeStyle.bg, color: gradeStyle.color }}
                        >
                          {Math.round(grade)}%
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span
                          className={styles.pctBadge}
                          style={{ background: attStyle.bg, color: attStyle.color }}
                        >
                          {Math.round(att)}%
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span
                          className={styles.pctBadge}
                          style={{ background: engStyle.bg, color: engStyle.color }}
                        >
                          {Math.round(eng)}%
                        </span>
                      </td>
                      <td>
                        <span style={{ color: '#6b7280', fontSize: '0.78rem' }}>
                          {s.last_active || '3 days ago'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <button
                            type="button"
                            className={styles.btnView}
                            onClick={() => onSelectStudent(s.student_id)}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className={styles.btnMore}
                            title="More options"
                            onClick={() => onSelectStudent(s.student_id)}
                          >
                            <MoreHorizontal size={14} />
                          </button>
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
        {filteredStudents.length > 0 && (
          <div className={styles.tablePagination}>
            <span>
              Showing {((page - 1) * pageSize) + 1} to{' '}
              {Math.min(filteredStudents.length, page * pageSize)} of {filteredStudents.length} students
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                type="button"
                className={styles.actionBtn}
                style={{
                  height: 30,
                  padding: '0 8px',
                  background: page === 1 ? '#f3f4f6' : '#ffffff',
                  color: page === 1 ? '#9ca3af' : '#374151',
                  border: '1px solid #e5e7eb',
                }}
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                <ChevronLeft size={14} />
              </button>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pNum = i + 1;
                const isActive = pNum === page;
                return (
                  <button
                    key={pNum}
                    type="button"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 6,
                      border: '1px solid',
                      borderColor: isActive ? '#7c3aed' : '#e5e7eb',
                      background: isActive ? '#7c3aed' : '#ffffff',
                      color: isActive ? '#ffffff' : '#374151',
                      fontWeight: isActive ? 700 : 600,
                      fontSize: '0.775rem',
                      cursor: 'pointer',
                    }}
                    onClick={() => setPage(pNum)}
                  >
                    {pNum}
                  </button>
                );
              })}

              <button
                type="button"
                className={styles.actionBtn}
                style={{
                  height: 30,
                  padding: '0 8px',
                  background: page === totalPages ? '#f3f4f6' : '#ffffff',
                  color: page === totalPages ? '#9ca3af' : '#374151',
                  border: '1px solid #e5e7eb',
                }}
                disabled={page === totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal: How it Works? ── */}
      {(isHowItWorksOpen !== undefined ? isHowItWorksOpen : showHowItWorks) && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(17, 24, 39, 0.45)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => {
            if (onCloseHowItWorks) onCloseHowItWorks();
            else setShowHowItWorks(false);
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 16,
              width: '100%',
              maxWidth: 580,
              padding: '24px 28px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              position: 'relative',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className={styles.riskShieldBox} style={{ width: 36, height: 36 }}>
                  <ShieldAlert size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>
                    Unified Risk Score Model
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Explainable AI early-warning calculation breakdown
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (onCloseHowItWorks) onCloseHowItWorks();
                  else setShowHowItWorks(false);
                }}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#9ca3af' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#4b5563', lineHeight: 1.5, margin: '0 0 16px 0' }}>
              The Unified Risk Score evaluates six continuous signals computed from live student telemetry.
              The overall risk index is scaled <strong>0–100</strong>, where higher values indicate immediate intervention need.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { factor: 'Concept Mastery', weight: '25%', desc: 'Time-decayed exponential half-life on evaluated concepts' },
                { factor: 'Grades & Marks', weight: '25%', desc: 'Mean final grades from unified experiments and lab assessments' },
                { factor: 'Session Attendance', weight: '20%', desc: 'Presence equivalent across scheduled lab sessions' },
                { factor: 'Lab Focus & Engagement', weight: '10%', desc: 'Random Forest active session telemetry and focus signals' },
                { factor: 'Assessment Consistency', weight: '10%', desc: '100 − stdev(grades) to detect sudden volatility or drops' },
                { factor: 'Submission Freshness', weight: '10%', desc: 'Recency decay penalty on prolonged activity dormancy' },
              ].map(item => (
                <div
                  key={item.factor}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: '#f9fafb',
                    border: '1px solid #f1f3f9',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.825rem', fontWeight: 700, color: '#111827' }}>
                      {item.factor}
                    </span>
                    <p style={{ margin: 0, fontSize: '0.725rem', color: '#6b7280' }}>{item.desc}</p>
                  </div>
                  <span
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      color: '#7c3aed',
                      background: '#f5f3ff',
                      padding: '3px 8px',
                      borderRadius: 6,
                    }}
                  >
                    {item.weight}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 20, textAlign: 'right' }}>
              <button
                type="button"
                className={styles.actionBtn}
                style={{ background: '#7c3aed', color: '#ffffff', borderRadius: 8, padding: '0 18px' }}
                onClick={() => {
                  if (onCloseHowItWorks) onCloseHowItWorks();
                  else setShowHowItWorks(false);
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
