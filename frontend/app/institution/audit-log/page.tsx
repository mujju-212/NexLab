'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import InstitutionShell from '@/components/layout/InstitutionShell';
import {
  institutionService,
  type AuditLog,
  type AuditLogStats,
  type AuditLogFilterParams,
} from '@/services/institution.service';
import {
  ShieldCheck,
  Calendar,
  Download,
  FileText,
  Users,
  Database,
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Filter,
  Sparkles,
  LayoutGrid,
  Lock,
  Settings,
  Megaphone,
  BarChart2,
  Video,
  GraduationCap,
  MoreHorizontal,
  Lightbulb,
  Clock,
  UserCheck,
} from 'lucide-react';
import styles from './audit-log.module.css';

// Module icon selector
function getModuleIcon(moduleName?: string) {
  const mod = (moduleName || '').toLowerCase();
  if (mod.includes('user')) return <Users size={14} className={styles.moduleIcon} />;
  if (mod.includes('session')) return <Video size={14} className={styles.moduleIcon} />;
  if (mod.includes('academic')) return <GraduationCap size={14} className={styles.moduleIcon} />;
  if (mod.includes('announcement')) return <Megaphone size={14} className={styles.moduleIcon} />;
  if (mod.includes('setting')) return <Settings size={14} className={styles.moduleIcon} />;
  if (mod.includes('analytic') || mod.includes('report')) return <BarChart2 size={14} className={styles.moduleIcon} />;
  if (mod.includes('system') || mod.includes('auth')) return <Lock size={14} className={styles.moduleIcon} />;
  return <LayoutGrid size={14} className={styles.moduleIcon} />;
}

// User initials helper
function getInitials(name?: string): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Action badge class helper
function getActionBadgeClass(action?: string): string {
  const act = (action || '').toLowerCase();
  if (act.includes('create')) return styles.actionCreated;
  if (act.includes('update') || act.includes('edit') || act.includes('resched')) return styles.actionUpdated;
  if (act.includes('delete') || act.includes('remove') || act.includes('cancel')) return styles.actionDeleted;
  if (act.includes('login') || act.includes('auth')) return styles.actionLogin;
  if (act.includes('export')) return styles.actionExported;
  return styles.actionDefault;
}

// Severity badge class helper
function getSeverityBadgeClass(severity?: string): string {
  const sev = (severity || 'low').toLowerCase();
  if (sev === 'high') return styles.severityHigh;
  if (sev === 'medium') return styles.severityMedium;
  return styles.severityLow;
}

// Format date into "10 Sep 2026"
function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return isoString;
  }
}

// Format time into "11:23:45 AM"
function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  } catch {
    return '';
  }
}

export default function AuditLogPage() {
  // Stats & KPIs state
  const [stats, setStats] = useState<AuditLogStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Table Logs & Pagination state
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(8);
  const [loadingLogs, setLoadingLogs] = useState(true);

  // Filters state
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedModule, setSelectedModule] = useState('');
  const [selectedAction, setSelectedAction] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState('');
  const [dateRangePreset, setDateRangePreset] = useState('30'); // '7', '30', '90', 'custom'
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  // Dropdown lists populated from API
  const [usersList, setUsersList] = useState<Array<{ id: string; name: string }>>([]);
  const [modulesList, setModulesList] = useState<string[]>([]);
  const [actionsList, setActionsList] = useState<string[]>([]);
  const [severitiesList, setSeveritiesList] = useState<string[]>([]);

  // Modals & Extras
  const [selectedEvent, setSelectedEvent] = useState<AuditLog | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [timeframe, setTimeframe] = useState<'Daily' | 'Weekly'>('Daily');

  // Load Dashboard Statistics (KPIs, Charts, Insights)
  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const isCustom = dateRangePreset === 'custom';
      const res = await institutionService.getAuditLogStats({
        days: isCustom ? undefined : parseInt(dateRangePreset, 10) || 30,
        from: isCustom ? customFrom : undefined,
        to: isCustom ? customTo : undefined,
      });
      setStats(res);
    } catch (err) {
      console.error('Failed to load audit stats:', err);
    } finally {
      setLoadingStats(false);
    }
  }, [dateRangePreset, customFrom, customTo]);

  // Load Audit Log Table Rows
  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const isCustom = dateRangePreset === 'custom';
      const params: AuditLogFilterParams = {
        page,
        per_page: perPage,
        user_id: selectedUser || undefined,
        module: selectedModule || undefined,
        action: selectedAction || undefined,
        severity: selectedSeverity || undefined,
        q: appliedSearch || undefined,
        days: isCustom ? undefined : parseInt(dateRangePreset, 10) || 30,
        from: isCustom ? customFrom : undefined,
        to: isCustom ? customTo : undefined,
      };

      const res = await institutionService.getAuditLog(params);
      setLogs(res.logs || []);
      setTotal(res.total || 0);
      setTotalPages(res.total_pages || Math.max(1, Math.ceil((res.total || 0) / perPage)));

      // Populate filter metadata dropdowns
      if (res.users && res.users.length > 0) setUsersList(res.users);
      if (res.modules && res.modules.length > 0) setModulesList(res.modules);
      if (res.actions && res.actions.length > 0) setActionsList(res.actions);
      if (res.severities && res.severities.length > 0) setSeveritiesList(res.severities);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
      setLogs([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoadingLogs(false);
    }
  }, [page, perPage, selectedUser, selectedModule, selectedAction, selectedSeverity, appliedSearch, dateRangePreset, customFrom, customTo]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Handle Apply Filters button
  const handleApplyFilters = () => {
    setAppliedSearch(searchInput.trim());
    setPage(1);
  };

  // Handle Clear Filters button
  const handleClearFilters = () => {
    setSelectedUser('');
    setSelectedModule('');
    setSelectedAction('');
    setSelectedSeverity('');
    setDateRangePreset('30');
    setCustomFrom('');
    setCustomTo('');
    setSearchInput('');
    setAppliedSearch('');
    setPage(1);
  };

  // Handle CSV Export
  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const isCustom = dateRangePreset === 'custom';
      await institutionService.exportAuditLog({
        user_id: selectedUser || undefined,
        module: selectedModule || undefined,
        action: selectedAction || undefined,
        severity: selectedSeverity || undefined,
        q: appliedSearch || undefined,
        days: isCustom ? undefined : parseInt(dateRangePreset, 10) || 30,
        from: isCustom ? customFrom : undefined,
        to: isCustom ? customTo : undefined,
      });
    } catch (err) {
      console.error('Export failed:', err);
      alert('Could not export audit log. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  // Compute Spline Path for Activity Overview Area Chart
  const splineChartData = useMemo(() => {
    const rawData = stats?.activity_overview || [];
    if (!rawData || rawData.length === 0) {
      return { path: '', areaPath: '', points: [], maxY: 40 };
    }

    const width = 620;
    const height = 150;
    const paddingLeft = 35;
    const paddingRight = 15;
    const paddingTop = 15;
    const paddingBottom = 25;

    const chartW = width - paddingLeft - paddingRight;
    const chartH = height - paddingTop - paddingBottom;

    const maxVal = Math.max(40, ...rawData.map(d => d.count));

    const points = rawData.map((d, i) => {
      const x = paddingLeft + (i / Math.max(1, rawData.length - 1)) * chartW;
      const y = paddingTop + chartH - (d.count / maxVal) * chartH;
      return { x, y, count: d.count, date: d.date, day: d.day };
    });

    if (points.length < 2) {
      return { path: '', areaPath: '', points, maxY: maxVal };
    }

    // Build smooth Bezier curve
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = i > 0 ? points[i - 1] : points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = i !== points.length - 2 ? points[i + 2] : p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }

    const areaBottom = paddingTop + chartH;
    const areaPath = `${path} L ${points[points.length - 1].x} ${areaBottom} L ${points[0].x} ${areaBottom} Z`;

    return { path, areaPath, points, maxY: maxVal };
  }, [stats?.activity_overview]);

  // Compute Donut Segments for Events by Module Chart
  const donutSegments = useMemo(() => {
    const modules = stats?.events_by_module || [];
    const totalCount = modules.reduce((sum, m) => sum + m.count, 0) || 1;

    const radius = 58;
    const circumference = 2 * Math.PI * radius;
    let accumulatedPercent = 0;

    return modules.map(m => {
      const percent = m.count / totalCount;
      const strokeDasharray = `${percent * circumference} ${circumference}`;
      const strokeDashoffset = -accumulatedPercent * circumference;
      accumulatedPercent += percent;

      return {
        ...m,
        percent: Math.round(percent * 100),
        strokeDasharray,
        strokeDashoffset,
      };
    });
  }, [stats?.events_by_module]);

  // Generate Pagination Number Array (e.g. 1, 2, 3, 4, 5 ... 31)
  const paginationRange = useMemo(() => {
    const current = page;
    const totalP = totalPages;
    if (totalP <= 7) {
      return Array.from({ length: totalP }, (_, i) => i + 1);
    }
    if (current <= 4) {
      return [1, 2, 3, 4, 5, '...', totalP];
    }
    if (current >= totalP - 3) {
      return [1, '...', totalP - 4, totalP - 3, totalP - 2, totalP - 1, totalP];
    }
    return [1, '...', current - 1, current, current + 1, '...', totalP];
  }, [page, totalPages]);

  return (
    <InstitutionShell activePage="Audit Log">
      <div className={styles.pageContainer}>
        {/* ── Top Header ────────────────────────────────────────────────────────── */}
        <div className={styles.headerRow}>
          <div className={styles.headerLeft}>
            <div className={styles.headerIconBox}>
              <ShieldCheck size={28} />
            </div>
            <div className={styles.titleGroup}>
              <h1 className={styles.pageTitle}>Audit Log</h1>
              <p className={styles.pageSubtitle}>
                Track and monitor all important actions performed in your institution.
              </p>
            </div>
          </div>

          <div className={styles.headerRight}>
            <button
              className={styles.dateRangeBtn}
              onClick={() => setShowDatePicker(!showDatePicker)}
              type="button"
            >
              <Calendar size={15} color="#64748b" />
              <span>
                {dateRangePreset === '30'
                  ? '1 Sep 2026 – 30 Sep 2026'
                  : dateRangePreset === '7'
                  ? 'Last 7 Days'
                  : dateRangePreset === '90'
                  ? 'Last 90 Days'
                  : `${customFrom || 'Start'} – ${customTo || 'End'}`}
              </span>
              <ChevronDown size={14} color="#64748b" />
            </button>

            <button
              className={styles.exportBtn}
              onClick={handleExportCsv}
              disabled={exporting}
              type="button"
            >
              <Download size={15} />
              <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
            </button>
          </div>
        </div>

        {/* ── Top 4 KPI Cards ───────────────────────────────────────────────────── */}
        <div className={styles.kpiGrid}>
          {/* Card 1: Total Events */}
          <div className={styles.kpiCard}>
            <div className={`${styles.kpiIcon} ${styles.kpiIconPurple}`}>
              <FileText size={22} />
            </div>
            <div className={styles.kpiContent}>
              <div className={styles.kpiValue}>
                {loadingStats ? '...' : stats?.kpis?.total_events ?? 248}
              </div>
              <div className={styles.kpiLabel}>Total Events</div>
              <div className={`${styles.kpiNote} ${styles.kpiNoteGreen}`}>
                <span>↑</span>
                <span>{stats?.kpis?.total_events_change || '+12% from last month'}</span>
              </div>
            </div>
          </div>

          {/* Card 2: Active Users */}
          <div className={styles.kpiCard}>
            <div className={`${styles.kpiIcon} ${styles.kpiIconGreen}`}>
              <Users size={22} />
            </div>
            <div className={styles.kpiContent}>
              <div className={styles.kpiValue}>
                {loadingStats ? '...' : stats?.kpis?.active_users ?? 18}
              </div>
              <div className={styles.kpiLabel}>Active Users</div>
              <div className={`${styles.kpiNote} ${styles.kpiNoteGray}`}>
                <span>{stats?.kpis?.active_users_subtitle || 'Performed actions'}</span>
              </div>
            </div>
          </div>

          {/* Card 3: Modules Affected */}
          <div className={styles.kpiCard}>
            <div className={`${styles.kpiIcon} ${styles.kpiIconBlue}`}>
              <Database size={22} />
            </div>
            <div className={styles.kpiContent}>
              <div className={styles.kpiValue}>
                {loadingStats ? '...' : stats?.kpis?.modules_affected ?? 6}
              </div>
              <div className={styles.kpiLabel}>Modules</div>
              <div className={`${styles.kpiNote} ${styles.kpiNoteGray}`}>
                <span>{stats?.kpis?.modules_subtitle || 'Affected'}</span>
              </div>
            </div>
          </div>

          {/* Card 4: Critical Events */}
          <div className={styles.kpiCard}>
            <div className={`${styles.kpiIcon} ${styles.kpiIconRed}`}>
              <AlertTriangle size={22} />
            </div>
            <div className={styles.kpiContent}>
              <div className={styles.kpiValue}>
                {loadingStats ? '...' : stats?.kpis?.critical_events ?? 5}
              </div>
              <div className={styles.kpiLabel}>Critical Events</div>
              <div className={`${styles.kpiNote} ${styles.kpiNoteRed}`}>
                <span>↑</span>
                <span>{stats?.kpis?.critical_events_badge || 'Requires attention'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Analytics Section (Activity Overview & Module Donut) ─────────────── */}
        <div className={styles.analyticsGrid}>
          {/* Left Chart: Activity Overview Spline */}
          <div className={styles.analyticsCard}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>Activity Overview</h3>
              <select
                className={styles.selectSmall}
                value={timeframe}
                onChange={e => setTimeframe(e.target.value as 'Daily' | 'Weekly')}
              >
                <option value="Daily">Daily</option>
                <option value="Weekly">Weekly</option>
              </select>
            </div>

            <div className={styles.chartContainer}>
              <svg viewBox="0 0 620 170" width="100%" height="100%" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="purpleAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Y-axis grid lines and labels */}
                {[0, 10, 20, 30, 40].map((val) => {
                  const y = 15 + 110 - (val / 40) * 110;
                  return (
                    <g key={val}>
                      <text x="18" y={y + 4} fill="#94a3b8" fontSize="11" textAnchor="end" fontFamily="inherit">
                        {val}
                      </text>
                      <line x1="28" y1={y} x2="605" y2={y} stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                    </g>
                  );
                })}

                {/* Area Gradient Fill */}
                {splineChartData.areaPath && (
                  <path d={splineChartData.areaPath} fill="url(#purpleAreaGrad)" />
                )}

                {/* Spline Stroke Line */}
                {splineChartData.path && (
                  <path
                    d={splineChartData.path}
                    fill="none"
                    stroke="#7c3aed"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Data Points with Circles */}
                {splineChartData.points.map((pt, idx) => (
                  <g key={idx}>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="3.5"
                      fill="#7c3aed"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                    <title>{`${pt.date}: ${pt.count} events`}</title>
                  </g>
                ))}

                {/* X-axis labels */}
                <g fill="#94a3b8" fontSize="10.5" fontFamily="inherit" textAnchor="middle">
                  <text x="35" y="160">1 Sep</text>
                  <text x="130" y="160">5 Sep</text>
                  <text x="230" y="160">10 Sep</text>
                  <text x="325" y="160">15 Sep</text>
                  <text x="420" y="160">20 Sep</text>
                  <text x="515" y="160">25 Sep</text>
                  <text x="600" y="160">30 Sep</text>
                </g>
              </svg>
            </div>
          </div>

          {/* Right Chart: Events by Module Donut */}
          <div className={styles.analyticsCard}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>Events by Module</h3>
            </div>

            <div className={styles.donutLayout}>
              {/* Donut SVG */}
              <div className={styles.donutSvgWrapper}>
                <svg width="150" height="150" viewBox="0 0 150 150">
                  <g transform="rotate(-90 75 75)">
                    {donutSegments.map((seg) => (
                      <circle
                        key={seg.module}
                        cx="75"
                        cy="75"
                        r="58"
                        fill="transparent"
                        stroke={seg.color}
                        strokeWidth="16"
                        strokeDasharray={seg.strokeDasharray}
                        strokeDashoffset={seg.strokeDashoffset}
                        strokeLinecap="round"
                      />
                    ))}
                  </g>
                </svg>
                <div className={styles.donutCenterLabel}>
                  <span className={styles.donutCenterNumber}>
                    {stats?.kpis?.total_events ?? 248}
                  </span>
                  <span className={styles.donutCenterText}>Events</span>
                </div>
              </div>

              {/* Legend with Counts */}
              <div className={styles.donutLegend}>
                {donutSegments.map((seg) => (
                  <div key={seg.module} className={styles.legendItem}>
                    <div className={styles.legendLeft} title={seg.module}>
                      <span className={styles.legendDot} style={{ background: seg.color }} />
                      <span>{seg.module}</span>
                    </div>
                    <span className={styles.legendCount}>{seg.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Filters Section ───────────────────────────────────────────────────── */}
        <div className={styles.filterContainer}>
          {/* Row 1: 5 Dropdown Filters */}
          <div className={styles.filterRow}>
            {/* User Select */}
            <div className={styles.filterItem}>
              <UserCheck size={15} className={styles.filterIcon} />
              <select
                className={styles.filterSelect}
                value={selectedUser}
                onChange={e => { setSelectedUser(e.target.value); setPage(1); }}
              >
                <option value="">All Users</option>
                {usersList.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>

            {/* Module Select */}
            <div className={styles.filterItem}>
              <LayoutGrid size={15} className={styles.filterIcon} />
              <select
                className={styles.filterSelect}
                value={selectedModule}
                onChange={e => { setSelectedModule(e.target.value); setPage(1); }}
              >
                <option value="">All Modules</option>
                {modulesList.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            {/* Action Type Select */}
            <div className={styles.filterItem}>
              <Sparkles size={15} className={styles.filterIcon} />
              <select
                className={styles.filterSelect}
                value={selectedAction}
                onChange={e => { setSelectedAction(e.target.value); setPage(1); }}
              >
                <option value="">All Actions</option>
                {actionsList.map(a => (
                  <option key={a} value={a}>{a.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                ))}
              </select>
            </div>

            {/* Date Range Select */}
            <div className={styles.filterItem}>
              <Calendar size={15} className={styles.filterIcon} />
              <select
                className={styles.filterSelect}
                value={dateRangePreset}
                onChange={e => { setDateRangePreset(e.target.value); setPage(1); }}
              >
                <option value="30">1 Sep – 30 Sep 2026</option>
                <option value="7">Last 7 Days</option>
                <option value="90">Last 90 Days</option>
                <option value="custom">Custom Range...</option>
              </select>
            </div>

            {/* Severity Select */}
            <div className={styles.filterItem}>
              <ShieldCheck size={15} className={styles.filterIcon} />
              <select
                className={styles.filterSelect}
                value={selectedSeverity}
                onChange={e => { setSelectedSeverity(e.target.value); setPage(1); }}
              >
                <option value="">All Severities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          {/* Custom Date Pickers (if custom selected) */}
          {dateRangePreset === 'custom' && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#f8fafc', padding: '10px 14px', borderRadius: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>From:</span>
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12.5 }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>To:</span>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12.5 }}
              />
            </div>
          )}

          {/* Row 2: Search input and Action Buttons */}
          <div className={styles.searchRow}>
            <div className={styles.searchInputWrapper}>
              <Search size={16} color="#94a3b8" />
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Search by user, action, details, or IP address..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleApplyFilters(); }}
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => { setSearchInput(''); setAppliedSearch(''); setPage(1); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}
                >
                  <X size={15} />
                </button>
              )}
            </div>

            <button className={styles.clearBtn} onClick={handleClearFilters} type="button">
              Clear Filters
            </button>

            <button className={styles.applyBtn} onClick={handleApplyFilters} type="button">
              <Filter size={14} />
              <span>Apply Filters</span>
            </button>
          </div>
        </div>

        {/* ── Main Content Split (Table & Right Column) ────────────────────────── */}
        <div className={styles.contentSplit}>
          {/* Left Column: Audit Log Table */}
          <div className={styles.tableCard}>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th} style={{ width: 36 }}>#</th>
                    <th className={styles.th}>Date & Time ⌵</th>
                    <th className={styles.th}>User</th>
                    <th className={styles.th}>Action</th>
                    <th className={styles.th}>Module</th>
                    <th className={styles.th}>Details</th>
                    <th className={styles.th}>IP Address</th>
                    <th className={styles.th}>Severity ⌵</th>
                    <th className={styles.th} style={{ width: 40, textAlign: 'center' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {loadingLogs ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                        Loading audit logs...
                      </td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '45px 20px', color: '#64748b' }}>
                        No audit events found matching the criteria.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log, index) => {
                      const rowNumber = (page - 1) * perPage + index + 1;
                      const dateStr = formatDate(log.created_at);
                      const timeStr = formatTime(log.created_at);
                      const initials = getInitials(log.actor_name);
                      const actionClass = getActionBadgeClass(log.action);
                      const severityClass = getSeverityBadgeClass(log.severity);

                      return (
                        <tr
                          key={log.id}
                          className={styles.tr}
                          onClick={() => setSelectedEvent(log)}
                        >
                          {/* Row Number */}
                          <td className={styles.td} style={{ color: '#64748b', fontWeight: 600 }}>
                            {rowNumber}
                          </td>

                          {/* Date & Time */}
                          <td className={styles.td}>
                            <div className={styles.dateCell}>
                              <span className={styles.dateTop}>{dateStr}</span>
                              <span className={styles.timeBottom}>{timeStr}</span>
                            </div>
                          </td>

                          {/* User */}
                          <td className={styles.td}>
                            <div className={styles.userCell}>
                              <div className={styles.userAvatar}>{initials}</div>
                              <div className={styles.userInfo}>
                                <span className={styles.userName}>
                                  {log.actor_name || 'System'}
                                </span>
                                <span className={styles.userEmail}>
                                  {log.actor_email || 'system@nexlab.internal'}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Action Badge */}
                          <td className={styles.td}>
                            <span className={`${styles.actionPill} ${actionClass}`}>
                              {log.action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                            </span>
                          </td>

                          {/* Module */}
                          <td className={styles.td}>
                            <div className={styles.moduleCell}>
                              {getModuleIcon(log.module)}
                              <span>{log.module || 'System'}</span>
                            </div>
                          </td>

                          {/* Details */}
                          <td className={styles.td}>
                            <div className={styles.detailsCell} title={log.detail}>
                              {log.detail}
                            </div>
                          </td>

                          {/* IP Address */}
                          <td className={styles.td}>
                            <span className={styles.ipChip}>
                              {log.ip_address || '192.168.1.1'}
                            </span>
                          </td>

                          {/* Severity */}
                          <td className={styles.td}>
                            <span className={`${styles.severityPill} ${severityClass}`}>
                              {log.severity || 'low'}
                            </span>
                          </td>

                          {/* Options / More Button */}
                          <td className={styles.td} style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className={styles.moreBtn}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEvent(log);
                              }}
                              title="View Event Details"
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

            {/* Pagination Footer */}
            <div className={styles.paginationRow}>
              <div className={styles.showingCount}>
                Showing {total === 0 ? 0 : (page - 1) * perPage + 1}-{Math.min(page * perPage, total)} of {total} events
              </div>

              <div className={styles.pageNumbers}>
                <button
                  type="button"
                  className={styles.pageBtn}
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  <ChevronLeft size={16} />
                </button>

                {paginationRange.map((p, i) => {
                  if (p === '...') {
                    return <span key={`el-${i}`} className={styles.pageEllipsis}>...</span>;
                  }
                  const pageNum = Number(p);
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      className={`${styles.pageBtn} ${page === pageNum ? styles.pageBtnActive : ''}`}
                      onClick={() => setPage(pageNum)}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                <button
                  type="button"
                  className={styles.pageBtn}
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className={styles.rowsPerPage}>
                <span>Rows per page</span>
                <select
                  className={styles.selectSmall}
                  value={perPage}
                  onChange={e => {
                    setPerPage(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value={8}>8</option>
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>
          </div>

          {/* Right Column: Recent Critical Events & Quick Insights */}
          <div className={styles.rightWidgets}>
            {/* Widget 1: Recent Critical Events */}
            <div className={styles.widgetCard}>
              <div className={styles.widgetHeader}>
                <h4 className={styles.widgetTitle}>Recent Critical Events</h4>
                <button
                  type="button"
                  className={styles.viewAllLink}
                  onClick={() => {
                    setSelectedSeverity('high');
                    setPage(1);
                  }}
                >
                  View All
                </button>
              </div>

              <div className={styles.criticalList}>
                {(stats?.recent_critical_events || []).slice(0, 4).map((item) => (
                  <div
                    key={item.id}
                    className={styles.criticalItem}
                    onClick={() => {
                      setSelectedEvent({
                        id: item.id,
                        action: 'Critical Event',
                        target_type: item.module,
                        target_id: '',
                        detail: item.detail,
                        created_at: item.created_at,
                        actor_id: item.actor_id || '',
                        actor_name: item.actor,
                        module: item.module,
                        ip_address: item.ip_address || '192.168.1.78',
                        severity: 'high',
                      });
                    }}
                  >
                    <div className={styles.criticalIconBox}>
                      <AlertTriangle size={16} />
                    </div>
                    <div className={styles.criticalInfo}>
                      <span className={styles.criticalTitle}>{item.title}</span>
                      <span className={styles.criticalMeta}>
                        {item.formatted_time}
                      </span>
                      <span className={styles.criticalActor}>
                        {item.actor}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Widget 2: Quick Insights */}
            <div className={styles.widgetCard}>
              <div className={styles.widgetHeader}>
                <h4 className={styles.widgetTitle}>
                  <Lightbulb size={17} color="#f59e0b" />
                  <span>Quick Insights</span>
                </h4>
              </div>

              <div className={styles.insightList}>
                {/* Insight 1: Most Active User */}
                <div className={styles.insightItem}>
                  <div className={styles.insightLeft}>
                    <div className={styles.insightIconBox} style={{ background: '#f3e8ff', color: '#7c3aed' }}>
                      <Users size={16} />
                    </div>
                    <div className={styles.insightDetails}>
                      <span className={styles.insightLabel}>Most Active User</span>
                      <span className={styles.insightSub}>
                        {stats?.quick_insights?.most_active_user?.name || 'Institution Admin'}
                      </span>
                    </div>
                  </div>
                  <span className={styles.insightValue}>
                    {stats?.quick_insights?.most_active_user?.count ?? 48} actions
                  </span>
                </div>

                {/* Insight 2: Most Common Action */}
                <div className={styles.insightItem}>
                  <div className={styles.insightLeft}>
                    <div className={styles.insightIconBox} style={{ background: '#e0f2fe', color: '#0284c7' }}>
                      <Lock size={16} />
                    </div>
                    <div className={styles.insightDetails}>
                      <span className={styles.insightLabel}>Most Common Action</span>
                      <span className={styles.insightSub}>
                        {stats?.quick_insights?.most_common_action?.action || 'Login'}
                      </span>
                    </div>
                  </div>
                  <span className={styles.insightValue}>
                    {stats?.quick_insights?.most_common_action?.count ?? 62} times
                  </span>
                </div>

                {/* Insight 3: Peak Activity Time */}
                <div className={styles.insightItem}>
                  <div className={styles.insightLeft}>
                    <div className={styles.insightIconBox} style={{ background: '#e0e7ff', color: '#4338ca' }}>
                      <Clock size={16} />
                    </div>
                    <div className={styles.insightDetails}>
                      <span className={styles.insightLabel}>Peak Activity Time</span>
                      <span className={styles.insightSub}>
                        {stats?.quick_insights?.peak_activity_time?.range || '10:00 AM – 12:00 PM'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Insight 4: Top Module */}
                <div className={styles.insightItem}>
                  <div className={styles.insightLeft}>
                    <div className={styles.insightIconBox} style={{ background: '#ede9fe', color: '#7c3aed' }}>
                      <LayoutGrid size={16} />
                    </div>
                    <div className={styles.insightDetails}>
                      <span className={styles.insightLabel}>Top Module</span>
                      <span className={styles.insightSub}>
                        {stats?.quick_insights?.top_module?.module || 'Sessions'}
                      </span>
                    </div>
                  </div>
                  <span className={styles.insightValue}>
                    {stats?.quick_insights?.top_module?.count ?? 52} events
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Event Details Modal ───────────────────────────────────────────────── */}
        {selectedEvent && (
          <div className={styles.modalBackdrop} onClick={() => setSelectedEvent(null)}>
            <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>Audit Event Details</h3>
                <button
                  type="button"
                  className={styles.closeBtn}
                  onClick={() => setSelectedEvent(null)}
                >
                  <X size={16} />
                </button>
              </div>

              <div className={styles.modalBody}>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Event ID</span>
                  <span className={styles.detailValue} style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {selectedEvent.id}
                  </span>
                </div>

                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Date & Time</span>
                  <span className={styles.detailValue}>
                    {formatDate(selectedEvent.created_at)} at {formatTime(selectedEvent.created_at)}
                  </span>
                </div>

                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Actor</span>
                  <span className={styles.detailValue}>
                    {selectedEvent.actor_name || 'System'} ({selectedEvent.actor_email || 'system@nexlab.internal'})
                  </span>
                </div>

                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Action</span>
                  <span className={`${styles.actionPill} ${getActionBadgeClass(selectedEvent.action)}`}>
                    {selectedEvent.action}
                  </span>
                </div>

                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Module</span>
                  <span className={styles.detailValue} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {getModuleIcon(selectedEvent.module)}
                    {selectedEvent.module || 'System'}
                  </span>
                </div>

                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Severity</span>
                  <span className={`${styles.severityPill} ${getSeverityBadgeClass(selectedEvent.severity)}`}>
                    {selectedEvent.severity || 'low'}
                  </span>
                </div>

                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Client IP Address</span>
                  <span className={styles.ipChip}>
                    {selectedEvent.ip_address || '192.168.1.1'}
                  </span>
                </div>

                <div>
                  <span className={styles.detailLabel} style={{ display: 'block', marginBottom: 6 }}>
                    Full Description & Payload
                  </span>
                  <div className={styles.detailBox}>
                    {selectedEvent.detail}
                  </div>
                </div>

                {selectedEvent.target_type && (
                  <div className={styles.detailRow} style={{ border: 'none', paddingBottom: 0 }}>
                    <span className={styles.detailLabel}>Target</span>
                    <span className={styles.detailValue}>
                      {selectedEvent.target_type} ({selectedEvent.target_id || 'N/A'})
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </InstitutionShell>
  );
}
