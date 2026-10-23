'use client';

import React, { useState, useMemo } from 'react';
import {
  Filter,
  Users,
  Play,
  Code2,
  CheckCircle2,
  Trophy,
  BarChart3,
  Search,
  Download,
  ArrowRight,
  ChevronRight,
  Info,
  X,
  MoreHorizontal,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  PieChart as PieIcon,
  TrendingUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
  LineChart,
  Line,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts';
import type { FunnelReport } from '@/services/institution.service';
import { exportCSV } from '@/lib/analytics-utils';
import DeltaPill from '@/components/analytics/DeltaPill';
import styles from './analytics.module.css';

interface StudentFunnelTabProps {
  data: FunnelReport;
  onSelectStudent: (studentId: string) => void;
  days: number;
  isHowItWorksOpen?: boolean;
  onCloseHowItWorks?: () => void;
}

export function StudentFunnelTab({
  data,
  onSelectStudent,
  days,
  isHowItWorksOpen = false,
  onCloseHowItWorks,
}: StudentFunnelTabProps) {
  const [funnelBy, setFunnelBy] = useState<'students' | 'percentage'>('students');
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [showHowItWorksModal, setShowHowItWorksModal] = useState(false);

  const isModalOpen = isHowItWorksOpen || showHowItWorksModal;
  const handleCloseModal = () => {
    setShowHowItWorksModal(false);
    onCloseHowItWorks?.();
  };

  // Safe fallback KPI values from real data
  const kpis = data.kpis || {
    total_enrolled: {
      count: data.total_enrolled || 0,
      delta: null,
      is_positive: true,
      note: 'vs previous period',
      sparkline: [],
    },
    started: {
      count: data.stages?.[1]?.count ?? 0,
      pct: data.stages?.[1]?.pct ?? 0,
      delta: null,
      is_positive: true,
      note: 'of enrolled',
      sparkline: [],
    },
    attempted: {
      count: data.stages?.[2]?.count ?? 0,
      pct: data.stages?.[2]?.pct ?? 0,
      delta: null,
      is_positive: false,
      note: 'of enrolled',
      sparkline: [],
    },
    completed: {
      count: data.stages?.[3]?.count ?? 0,
      pct: data.stages?.[3]?.pct ?? 0,
      delta: null,
      is_positive: true,
      note: 'of enrolled',
      sparkline: [],
    },
    mastered: {
      count: data.stages?.[4]?.count ?? 0,
      pct: data.stages?.[4]?.pct ?? 0,
      delta: null,
      is_positive: true,
      note: 'of enrolled',
      sparkline: [],
    },
  };

  // Convert sparkline numbers to objects for Recharts
  const makeSparklineData = (arr: number[]) => (arr || []).map((val, idx) => ({ idx, val }));

  // Stages array from report
  const stages = data.stages || [];
  const enrolledStage = stages[0] || { count: data.total_enrolled || 0, pct: 100 };
  const startedStage = stages[1] || { count: kpis.started.count, pct: kpis.started.pct, drop_off_count: 0, drop_off_pct: 0 };
  const attemptedStage = stages[2] || { count: kpis.attempted.count, pct: kpis.attempted.pct, drop_off_count: 0, drop_off_pct: 0 };
  const completedStage = stages[3] || { count: kpis.completed.count, pct: kpis.completed.pct, drop_off_count: 0, drop_off_pct: 0 };
  const masteredStage = stages[4] || { count: kpis.mastered.count, pct: kpis.mastered.pct, drop_off_count: 0, drop_off_pct: 0 };

  // 1. Funnel Conversion Rate (Bar Chart data)
  const conversionRates = useMemo(() => {
    if (data.conversion_rates && data.conversion_rates.length > 0) {
      return data.conversion_rates;
    }
    return [
      { name: 'Enrolled', rate: 100, count: enrolledStage.count, color: '#8b5cf6' },
      { name: 'Started', rate: startedStage.pct ?? 0, count: startedStage.count, color: '#3b82f6' },
      { name: 'Attempted', rate: attemptedStage.pct ?? 0, count: attemptedStage.count, color: '#f59e0b' },
      { name: 'Completed', rate: completedStage.pct ?? 0, count: completedStage.count, color: '#10b981' },
      { name: 'Mastery', rate: masteredStage.pct ?? 0, count: masteredStage.count, color: '#f43f5e' },
    ];
  }, [data.conversion_rates, enrolledStage, startedStage, attemptedStage, completedStage, masteredStage]);

  // 2. Drop-off Analysis (Donut Chart data)
  const dropOffAnalysis = useMemo(() => {
    if (data.drop_off_analysis) {
      return data.drop_off_analysis;
    }
    const didNotStart = startedStage.drop_off_count ?? 0;
    const noAttempts = attemptedStage.drop_off_count ?? 0;
    const incompleteLabs = completedStage.drop_off_count ?? 0;
    const noMastery = masteredStage.drop_off_count ?? 0;
    const total = didNotStart + noAttempts + incompleteLabs + noMastery;

    return {
      total_drop_offs: total,
      breakdown: [
        { name: 'Did not start', reason: 'Did not start', count: didNotStart, pct: total ? Math.round((didNotStart / total) * 1000) / 10 : 0, color: '#ea580c' },
        { name: 'No lab attempts', reason: 'No lab attempts', count: noAttempts, pct: total ? Math.round((noAttempts / total) * 1000) / 10 : 0, color: '#f59e0b' },
        { name: 'Incomplete labs', reason: 'Incomplete labs', count: incompleteLabs, pct: total ? Math.round((incompleteLabs / total) * 1000) / 10 : 0, color: '#8b5cf6' },
        { name: 'No mastery', reason: 'Did not reach mastery', count: noMastery, pct: total ? Math.round((noMastery / total) * 1000) / 10 : 0, color: '#ef4444' },
      ],
    };
  }, [data.drop_off_analysis, startedStage, attemptedStage, completedStage, masteredStage]);

  // 3. Progress Trend (Multi-Line Chart data)
  const progressTrend = useMemo(() => {
    if (data.progress_trend && data.progress_trend.length > 0) {
      return data.progress_trend.map(p => ({
        ...p,
        mastery: (p as any).mastery ?? (p as any).mastered ?? 0,
      }));
    }
    return [];
  }, [data.progress_trend]);

  // 4. Stuck Students Roster (Table Data)
  const stuckStudents = useMemo(() => {
    return data.stuck_students || [];
  }, [data.stuck_students]);

  // Filtered & Paginated Students
  const filteredStudents = useMemo(() => {
    return stuckStudents.filter(st => {
      const matchesSearch =
        search === '' ||
        st.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        st.roll_number?.toLowerCase().includes(search.toLowerCase()) ||
        st.risk_reason?.toLowerCase().includes(search.toLowerCase());

      const matchesStage = stageFilter === 'all' || st.current_stage === stageFilter;

      return matchesSearch && matchesStage;
    });
  }, [stuckStudents, search, stageFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const pagedStudents = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredStudents.slice(start, start + pageSize);
  }, [filteredStudents, page, pageSize]);

  // Checkbox toggle handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedStudentIds(new Set(pagedStudents.map(s => s.student_id)));
    } else {
      setSelectedStudentIds(new Set());
    }
  };

  const handleToggleStudent = (studentId: string) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  // CSV Export
  const handleExportCSV = () => {
    const rows = filteredStudents.map((st, idx) => ({
      Index: idx + 1,
      Name: st.full_name,
      RollNumber: st.roll_number,
      Section: st.display_section || st.section_name || 'N/A',
      CurrentStage: st.current_stage,
      DaysInStage: st.days_in_stage,
      LastActivity: st.last_activity,
      RiskReason: st.risk_reason,
      RiskScore: st.risk_score,
    }));
    exportCSV(rows, `student_funnel_at_risk_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  // Stage Badge Style Helper
  const getStageBadgeClass = (stage: string) => {
    switch (stage) {
      case 'Enrolled':
        return styles.stageBadgeEnrolled;
      case 'Started':
        return styles.stageBadgeStarted;
      case 'Attempted':
        return styles.stageBadgeAttempted;
      case 'Completed':
        return styles.stageBadgeCompleted;
      case 'Mastered':
      case 'Achieved Mastery':
        return styles.stageBadgeMastered;
      default:
        return styles.stageBadgeEnrolled;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      {/* ── 1. Top 5 KPI Cards Grid ── */}
      <div className={styles.funnelKpiGrid}>
        {/* KPI 1: Total Enrolled */}
        <div className={styles.funnelKpiCard}>
          <div>
            <div className={styles.kpiTopRow}>
              <div className={styles.kpiIconBox} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                <Users size={16} strokeWidth={2.4} />
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', flex: 1, marginLeft: 8 }}>
                Total Enrolled
              </span>
              <DeltaPill
                delta={typeof kpis.total_enrolled.delta === 'number' ? kpis.total_enrolled.delta : null}
                suffix="%"
              />
            </div>

            <div style={{ marginTop: 2 }}>
              <span className={styles.kpiValueBig} style={{ color: '#111827' }}>
                {kpis.total_enrolled.count.toLocaleString()}
              </span>
            </div>

            <div className={styles.kpiSubNote}>
              {kpis.total_enrolled.note}
            </div>
          </div>

          {/* Sparkline area */}
          <div style={{ width: '100%', height: 38, marginTop: 6 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={makeSparklineData(kpis.total_enrolled.sparkline)} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="purpleSparkGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="val" stroke="#8b5cf6" strokeWidth={2} fill="url(#purpleSparkGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* KPI 2: Started Learning */}
        <div className={styles.funnelKpiCard}>
          <div>
            <div className={styles.kpiTopRow}>
              <div className={styles.kpiIconBox} style={{ background: '#eff6ff', color: '#2563eb' }}>
                <Play size={16} strokeWidth={2.4} fill="#2563eb" />
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', flex: 1, marginLeft: 8 }}>
                Started Learning
              </span>
              <DeltaPill
                delta={typeof kpis.started.delta === 'number' ? kpis.started.delta : null}
                suffix="%"
              />
            </div>

            <div style={{ marginTop: 2 }}>
              <span className={styles.kpiValueBig} style={{ color: '#111827' }}>
                {kpis.started.count.toLocaleString()}
              </span>
            </div>

            <div className={styles.kpiSubNote}>
              {kpis.started.pct}% of enrolled
            </div>
          </div>

          <div style={{ width: '100%', height: 38, marginTop: 6 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={makeSparklineData(kpis.started.sparkline)} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="blueSparkGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="val" stroke="#3b82f6" strokeWidth={2} fill="url(#blueSparkGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* KPI 3: Attempted Labs */}
        <div className={styles.funnelKpiCard}>
          <div>
            <div className={styles.kpiTopRow}>
              <div className={styles.kpiIconBox} style={{ background: '#fffbeb', color: '#d97706' }}>
                <Code2 size={16} strokeWidth={2.4} />
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', flex: 1, marginLeft: 8 }}>
                Attempted Labs
              </span>
              <DeltaPill
                delta={typeof kpis.attempted.delta === 'number' ? kpis.attempted.delta : null}
                suffix="%"
              />
            </div>

            <div style={{ marginTop: 2 }}>
              <span className={styles.kpiValueBig} style={{ color: '#b45309' }}>
                {kpis.attempted.count.toLocaleString()}
              </span>
            </div>

            <div className={styles.kpiSubNote}>
              {kpis.attempted.pct}% of enrolled
            </div>
          </div>

          <div style={{ width: '100%', height: 38, marginTop: 6 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={makeSparklineData(kpis.attempted.sparkline)} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="amberSparkGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="val" stroke="#f59e0b" strokeWidth={2} fill="url(#amberSparkGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* KPI 4: Completed Labs */}
        <div className={styles.funnelKpiCard}>
          <div>
            <div className={styles.kpiTopRow}>
              <div className={styles.kpiIconBox} style={{ background: '#f0fdf4', color: '#16a34a' }}>
                <CheckCircle2 size={16} strokeWidth={2.4} />
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', flex: 1, marginLeft: 8 }}>
                Completed Labs
              </span>
              <DeltaPill
                delta={typeof kpis.completed.delta === 'number' ? kpis.completed.delta : null}
                suffix="%"
              />
            </div>

            <div style={{ marginTop: 2 }}>
              <span className={styles.kpiValueBig} style={{ color: '#111827' }}>
                {kpis.completed.count.toLocaleString()}
              </span>
            </div>

            <div className={styles.kpiSubNote}>
              {kpis.completed.pct}% of enrolled
            </div>
          </div>

          <div style={{ width: '100%', height: 38, marginTop: 6 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={makeSparklineData(kpis.completed.sparkline)} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="greenSparkGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="val" stroke="#10b981" strokeWidth={2} fill="url(#greenSparkGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* KPI 5: Achieved Mastery */}
        <div className={styles.funnelKpiCard}>
          <div>
            <div className={styles.kpiTopRow}>
              <div className={styles.kpiIconBox} style={{ background: '#fef2f2', color: '#dc2626' }}>
                <Trophy size={16} strokeWidth={2.4} />
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', flex: 1, marginLeft: 8 }}>
                Achieved Mastery
              </span>
              <DeltaPill
                delta={typeof kpis.mastered.delta === 'number' ? kpis.mastered.delta : null}
                suffix="%"
              />
            </div>

            <div style={{ marginTop: 2 }}>
              <span className={styles.kpiValueBig} style={{ color: '#111827' }}>
                {kpis.mastered.count.toLocaleString()}
              </span>
            </div>

            <div className={styles.kpiSubNote}>
              {kpis.mastered.pct}% of enrolled
            </div>
          </div>

          <div style={{ width: '100%', height: 38, marginTop: 6 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={makeSparklineData(kpis.mastered.sparkline)} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="pinkSparkGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="val" stroke="#f43f5e" strokeWidth={2} fill="url(#pinkSparkGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── 2. Student Progression Funnel Big Card ── */}
      <div className={styles.progressionCard}>
        <div className={styles.progressionHeader}>
          <div className={styles.progressionTitleGroup}>
            <div className={styles.progressionIconBox}>
              <Filter size={18} strokeWidth={2.4} />
            </div>
            <div>
              <h3 className={styles.progressionTitle}>Student Progression Funnel</h3>
              <p className={styles.progressionSubtitle}>
                From enrollment to concept mastery (Last {days} Days)
              </p>
            </div>
          </div>

          {/* Funnel By Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 500 }}>Funnel by:</span>
            <select
              className={styles.chartSelectMini}
              value={funnelBy}
              onChange={e => setFunnelBy(e.target.value as any)}
              style={{ padding: '4px 10px', height: 32 }}
            >
              <option value="students">Students</option>
              <option value="percentage">Percentage (%)</option>
            </select>
          </div>
        </div>

        {/* 5 Connected Stages Row */}
        <div className={styles.funnelFlowContainer}>
          {/* Stage 1: Enrolled */}
          <div className={styles.funnelStageCard}>
            <div>
              <div className={styles.funnelStageTop}>
                <div className={styles.funnelStageIconBox} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                  <Users size={16} strokeWidth={2.4} />
                </div>
                <div>
                  <div className={styles.funnelStageName}>Enrolled</div>
                  <div className={styles.funnelStageCount}>
                    {funnelBy === 'students' ? enrolledStage.count.toLocaleString() : '100%'}
                  </div>
                  <span
                    className={styles.funnelStagePill}
                    style={{ background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe' }}
                  >
                    100% of cohort
                  </span>
                </div>
              </div>
            </div>

            <div
              className={styles.funnelDropBox}
              style={{ background: '#f9fafb', color: '#6b7280', border: '1px solid #f3f4f6' }}
            >
              <span>— Starting point</span>
            </div>
          </div>

          {/* Separator 1 -> 2 */}
          <div className={styles.funnelArrowSeparator}>
            <ChevronRight size={22} strokeWidth={2.5} style={{ color: '#38bdf8' }} />
          </div>

          {/* Stage 2: Started Learning */}
          <div className={styles.funnelStageCard}>
            <div>
              <div className={styles.funnelStageTop}>
                <div className={styles.funnelStageIconBox} style={{ background: '#eff6ff', color: '#2563eb' }}>
                  <Play size={16} strokeWidth={2.4} fill="#2563eb" />
                </div>
                <div>
                  <div className={styles.funnelStageName}>Started Learning</div>
                  <div className={styles.funnelStageCount}>
                    {funnelBy === 'students' ? startedStage.count.toLocaleString() : `${startedStage.pct}%`}
                  </div>
                  <span
                    className={styles.funnelStagePill}
                    style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}
                  >
                    {startedStage.pct != null ? `${startedStage.pct}%` : '90.6%'}
                  </span>
                </div>
              </div>
            </div>

            <div
              className={styles.funnelDropBox}
              style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fee2e2' }}
            >
              <span>↓ {startedStage.drop_off_count} ({startedStage.drop_off_pct}%) Did not start</span>
            </div>
          </div>

          {/* Separator 2 -> 3 */}
          <div className={styles.funnelArrowSeparator}>
            <ChevronRight size={22} strokeWidth={2.5} style={{ color: '#fbbf24' }} />
          </div>

          {/* Stage 3: Attempted Labs */}
          <div className={styles.funnelStageCard}>
            <div>
              <div className={styles.funnelStageTop}>
                <div className={styles.funnelStageIconBox} style={{ background: '#fffbeb', color: '#d97706' }}>
                  <Code2 size={16} strokeWidth={2.4} />
                </div>
                <div>
                  <div className={styles.funnelStageName}>Attempted Labs</div>
                  <div className={styles.funnelStageCount}>
                    {funnelBy === 'students' ? attemptedStage.count.toLocaleString() : `${attemptedStage.pct}%`}
                  </div>
                  <span
                    className={styles.funnelStagePill}
                    style={{ background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a' }}
                  >
                    {attemptedStage.pct != null ? `${attemptedStage.pct}%` : '73.5%'}
                  </span>
                </div>
              </div>
            </div>

            <div
              className={styles.funnelDropBox}
              style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fee2e2' }}
            >
              <span>↓ {attemptedStage.drop_off_count} ({attemptedStage.drop_off_pct}%) No lab attempts</span>
            </div>
          </div>

          {/* Separator 3 -> 4 */}
          <div className={styles.funnelArrowSeparator}>
            <ChevronRight size={22} strokeWidth={2.5} style={{ color: '#34d399' }} />
          </div>

          {/* Stage 4: Completed Labs */}
          <div className={styles.funnelStageCard}>
            <div>
              <div className={styles.funnelStageTop}>
                <div className={styles.funnelStageIconBox} style={{ background: '#f0fdf4', color: '#16a34a' }}>
                  <CheckCircle2 size={16} strokeWidth={2.4} />
                </div>
                <div>
                  <div className={styles.funnelStageName}>Completed Labs</div>
                  <div className={styles.funnelStageCount}>
                    {funnelBy === 'students' ? completedStage.count.toLocaleString() : `${completedStage.pct}%`}
                  </div>
                  <span
                    className={styles.funnelStagePill}
                    style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}
                  >
                    {completedStage.pct != null ? `${completedStage.pct}%` : '73.5%'}
                  </span>
                </div>
              </div>
            </div>

            <div
              className={styles.funnelDropBox}
              style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fee2e2' }}
            >
              <span>↓ {completedStage.drop_off_count} ({completedStage.drop_off_pct}%) Incomplete labs</span>
            </div>
          </div>

          {/* Separator 4 -> 5 */}
          <div className={styles.funnelArrowSeparator}>
            <ChevronRight size={22} strokeWidth={2.5} style={{ color: '#fb7185' }} />
          </div>

          {/* Stage 5: Achieved Mastery */}
          <div className={styles.funnelStageCard}>
            <div>
              <div className={styles.funnelStageTop}>
                <div className={styles.funnelStageIconBox} style={{ background: '#fef2f2', color: '#dc2626' }}>
                  <Trophy size={16} strokeWidth={2.4} />
                </div>
                <div>
                  <div className={styles.funnelStageName}>Achieved Mastery</div>
                  <div className={styles.funnelStageCount}>
                    {funnelBy === 'students' ? masteredStage.count.toLocaleString() : `${masteredStage.pct}%`}
                  </div>
                  <span
                    className={styles.funnelStagePill}
                    style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}
                  >
                    {masteredStage.pct != null ? `${masteredStage.pct}%` : '31.4%'}
                  </span>
                </div>
              </div>
            </div>

            <div
              className={styles.funnelDropBox}
              style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fee2e2' }}
            >
              <span>↓ {masteredStage.drop_off_count} ({masteredStage.drop_off_pct}%) Did not reach mastery</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. Row of 3 Analytics Cards Grid (1fr 1fr 1.25fr) ── */}
      <div className={styles.funnelThreeColGrid}>
        {/* Card 1: Funnel Conversion Rate */}
        <div className={styles.chartCard}>
          <div className={styles.chartCardHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ color: '#7c3aed', display: 'flex', alignItems: 'center' }}>
                <BarChart3 size={16} strokeWidth={2.4} />
              </div>
              <h3 className={styles.chartCardTitle} style={{ whiteSpace: 'nowrap', fontSize: '0.9rem' }}>
                Funnel Conversion Rate
              </h3>
            </div>
            <div style={{ color: '#9ca3af' }}>
              <BarChart3 size={14} />
            </div>
          </div>

          <div style={{ height: 210, width: '100%', marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={conversionRates} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: '#6b7280', fontWeight: 500 }}
                  axisLine={{ stroke: '#f3f4f6' }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  unit="%"
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(124, 58, 237, 0.04)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0].payload;
                      return (
                        <div
                          style={{
                            background: '#111827',
                            color: '#ffffff',
                            padding: '6px 10px',
                            borderRadius: 8,
                            fontSize: 11,
                            fontWeight: 600,
                            boxShadow: '0 8px 20px rgba(0,0,0,0.2)',
                          }}
                        >
                          <div>{item.name}: {item.rate}%</div>
                          <div style={{ color: '#9ca3af', fontSize: 10 }}>{item.count?.toLocaleString()} students</div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar
                  dataKey="rate"
                  radius={[6, 6, 0, 0]}
                  label={{
                    position: 'top',
                    fill: '#111827',
                    fontSize: 11,
                    fontWeight: 700,
                    formatter: (val: any) => `${val}%`,
                  }}
                >
                  {conversionRates.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Card 2: Drop-off Analysis */}
        <div className={styles.chartCard}>
          <div className={styles.chartCardHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ color: '#7c3aed', display: 'flex', alignItems: 'center' }}>
                <PieIcon size={16} strokeWidth={2.4} />
              </div>
              <h3 className={styles.chartCardTitle}>Drop-off Analysis</h3>
            </div>
            <div style={{ color: '#9ca3af' }}>
              <Download size={13} style={{ cursor: 'pointer' }} onClick={handleExportCSV} />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              height: 210,
              gap: 10,
              padding: '0 4px',
            }}
          >
            {/* Center Donut */}
            <div style={{ width: 140, height: 140, position: 'relative', flexShrink: 0 }}>
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
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#111827', lineHeight: 1.1 }}>
                  {dropOffAnalysis.total_drop_offs.toLocaleString()}
                </div>
                <div style={{ fontSize: '0.675rem', fontWeight: 600, color: '#6b7280', whiteSpace: 'nowrap' }}>
                  Total Drop-offs
                </div>
              </div>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    contentStyle={{
                      background: '#111827',
                      border: 'none',
                      borderRadius: 8,
                      color: '#ffffff',
                      fontSize: 11,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                    }}
                    formatter={(val: any, name: any) => [`${val} students`, name]}
                  />
                  <Pie
                    data={dropOffAnalysis.breakdown}
                    dataKey="count"
                    nameKey="name"
                    innerRadius={46}
                    outerRadius={65}
                    paddingAngle={3}
                  >
                    {dropOffAnalysis.breakdown.map((entry, idx) => (
                      <Cell key={`drop-cell-${idx}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Right Legend */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {dropOffAnalysis.breakdown.map((item, idx) => (
                <div key={idx} className={styles.funnelLegendRow}>
                  <div className={styles.funnelLegendLeft}>
                    <span className={styles.funnelColorSquare} style={{ background: item.color }} />
                    <span style={{ fontSize: '0.75rem' }}>{item.name}</span>
                  </div>
                  <div className={styles.funnelLegendRight} style={{ fontSize: '0.75rem' }}>
                    {item.count} <span style={{ color: '#6b7280', fontWeight: 500 }}>({item.pct}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Card 3: Progress Trend */}
        <div className={styles.chartCard}>
          <div className={styles.chartCardHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ color: '#7c3aed', display: 'flex', alignItems: 'center' }}>
                <TrendingUp size={16} strokeWidth={2.4} />
              </div>
              <h3 className={styles.chartCardTitle}>Progress Trend</h3>
            </div>

            {/* Legend pills at top right */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.7rem', fontWeight: 600 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#6b7280' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#8b5cf6' }} /> Enrolled
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#6b7280' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6' }} /> Started
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#6b7280' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} /> Completed
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#6b7280' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f43f5e' }} /> Mastery
              </span>
            </div>
          </div>

          <div style={{ height: 210, width: '100%', marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={progressTrend} margin={{ top: 15, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  axisLine={{ stroke: '#f3f4f6' }}
                  tickLine={false}
                />
                <YAxis
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
                />
                <Line type="monotone" dataKey="enrolled" name="Enrolled" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="started" name="Started" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="completed" name="Completed" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="mastery" name="Mastery" stroke="#f43f5e" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── 4. Students at Risk in Funnel (Table Card) ── */}
      <div className={styles.rosterCard}>
        <div className={styles.rosterHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: '#f5f3ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#7c3aed',
              }}
            >
              <ShieldAlert size={18} strokeWidth={2.4} />
            </div>
            <div>
              <h3 className={styles.rosterTitle}>Students at Risk in Funnel</h3>
              <p className={styles.rosterSubtitle}>
                Students who dropped off or are stuck at a stage for more than 7 days
              </p>
            </div>
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

            {/* Stage Filter */}
            <select
              className={styles.chartSelectMini}
              style={{ height: 34, padding: '0 10px', borderRadius: 8 }}
              value={stageFilter}
              onChange={e => {
                setStageFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All Stages</option>
              <option value="Enrolled">Enrolled</option>
              <option value="Started">Started</option>
              <option value="Attempted">Attempted</option>
              <option value="Completed">Completed</option>
            </select>

            {/* View All Button */}
            <button
              type="button"
              className={styles.funnelViewBtn}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 34 }}
              onClick={() => {
                setSearch('');
                setStageFilter('all');
              }}
            >
              <span>View All</span>
              <ArrowRight size={13} />
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
                    checked={pagedStudents.length > 0 && selectedStudentIds.size === pagedStudents.length}
                    onChange={e => handleSelectAll(e.target.checked)}
                    style={{ accentColor: '#7c3aed', cursor: 'pointer' }}
                  />
                </th>
                <th style={{ width: 36, textAlign: 'center' }}>#</th>
                <th style={{ minWidth: 160 }}>Student</th>
                <th style={{ minWidth: 100 }}>Current Stage</th>
                <th style={{ minWidth: 90 }}>Days in Stage</th>
                <th style={{ minWidth: 100 }}>Last Activity</th>
                <th style={{ minWidth: 150 }}>Risk Reason</th>
                <th style={{ minWidth: 90 }}>Risk Score</th>
                <th style={{ minWidth: 80, textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {pagedStudents.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '36px 0', color: '#9ca3af' }}>
                    No students currently stuck or at-risk matching the selected filters.
                  </td>
                </tr>
              ) : (
                pagedStudents.map((st, idx) => {
                  const globalIdx = (page - 1) * pageSize + idx + 1;
                  const isChecked = selectedStudentIds.has(st.student_id);
                  const isStuckLong = st.days_in_stage >= 10;

                  return (
                    <tr
                      key={st.student_id || idx}
                      className={styles.rosterTableRow}
                      onClick={() => onSelectStudent(st.student_id)}
                    >
                      {/* Checkbox */}
                      <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleStudent(st.student_id)}
                          style={{ accentColor: '#7c3aed', cursor: 'pointer' }}
                        />
                      </td>

                      {/* Index */}
                      <td style={{ textAlign: 'center', color: '#6b7280', fontWeight: 600 }}>
                        {globalIdx}
                      </td>

                      {/* Student Info */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 700, color: '#111827', fontSize: '0.825rem' }}>
                            {st.full_name}
                          </span>
                          <span style={{ fontSize: '0.725rem', color: '#6b7280' }}>
                            {st.roll_number} • {st.display_section || st.section_name || 'N/A'}
                          </span>
                        </div>
                      </td>

                      {/* Current Stage */}
                      <td>
                        <span
                          className={`${styles.funnelStagePill} ${getStageBadgeClass(st.current_stage)}`}
                          style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.725rem', fontWeight: 700 }}
                        >
                          {st.current_stage}
                        </span>
                      </td>

                      {/* Days in Stage */}
                      <td>
                        <span
                          style={{
                            fontWeight: 700,
                            color: isStuckLong ? '#dc2626' : '#111827',
                            fontSize: '0.8rem',
                          }}
                        >
                          {st.days_in_stage} days
                        </span>
                      </td>

                      {/* Last Activity */}
                      <td>
                        <span style={{ color: '#6b7280', fontSize: '0.775rem' }}>
                          {st.last_activity}
                        </span>
                      </td>

                      {/* Risk Reason */}
                      <td>
                        <span style={{ color: '#374151', fontSize: '0.775rem' }}>
                          {st.risk_reason}
                        </span>
                      </td>

                      {/* Risk Score */}
                      <td>
                        <div className={styles.funnelScoreBarContainer}>
                          <span className={styles.funnelScoreValue}>{st.risk_score}</span>
                          <div className={styles.funnelScoreBarTrack}>
                            <div
                              className={styles.funnelScoreBarFill}
                              style={{ width: `${Math.min(100, st.risk_score)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Action */}
                      <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                          <button
                            type="button"
                            className={styles.funnelViewBtn}
                            onClick={() => onSelectStudent(st.student_id)}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className={styles.funnelMoreBtn}
                            onClick={() => onSelectStudent(st.student_id)}
                            title="More Actions"
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

        {/* Pagination Controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            borderTop: '1px solid #f1f3f9',
            fontSize: '0.775rem',
            color: '#6b7280',
          }}
        >
          <div>
            Showing <span style={{ fontWeight: 600, color: '#111827' }}>{pagedStudents.length}</span> of{' '}
            <span style={{ fontWeight: 600, color: '#111827' }}>{filteredStudents.length}</span> stuck students
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              className={styles.paginationBtn}
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid #e5e7eb',
                background: '#ffffff',
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
                opacity: page <= 1 ? 0.5 : 1,
              }}
            >
              Previous
            </button>
            <span style={{ fontWeight: 600, color: '#111827', padding: '0 6px' }}>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className={styles.paginationBtn}
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid #e5e7eb',
                background: '#ffffff',
                cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                opacity: page >= totalPages ? 0.5 : 1,
              }}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* ── 5. "How it Works?" Modal ── */}
      {isModalOpen && (
        <div className={styles.modalOverlay} onClick={handleCloseModal}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className={styles.modalIconBox}>
                  <Info size={18} strokeWidth={2.4} />
                </div>
                <div>
                  <h3 className={styles.modalTitle}>How Student Funnel Works</h3>
                  <p className={styles.modalSubtitle}>Understanding progression stages, drop-offs and risk indicators</p>
                </div>
              </div>
              <button type="button" className={styles.modalCloseBtn} onClick={handleCloseModal}>
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.modalSection}>
                <h4 className={styles.modalSectionTitle}>The 5 Progression Stages</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <span className={`${styles.funnelStagePill} ${styles.stageBadgeEnrolled}`}>1. Enrolled</span>
                    <span style={{ fontSize: '0.8rem', color: '#4b5563' }}>
                      All registered students in the active academic session or cohort.
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <span className={`${styles.funnelStagePill} ${styles.stageBadgeStarted}`}>2. Started</span>
                    <span style={{ fontSize: '0.8rem', color: '#4b5563' }}>
                      Students who logged in, opened course modules, and viewed instruction materials.
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <span className={`${styles.funnelStagePill} ${styles.stageBadgeAttempted}`}>3. Attempted</span>
                    <span style={{ fontSize: '0.8rem', color: '#4b5563' }}>
                      Students who launched at least one hands-on coding lab or interactive simulation.
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <span className={`${styles.funnelStagePill} ${styles.stageBadgeCompleted}`}>4. Completed</span>
                    <span style={{ fontSize: '0.8rem', color: '#4b5563' }}>
                      Students who passed all lab verification tests and submitted all requirements.
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <span className={`${styles.funnelStagePill} ${styles.stageBadgeMastered}`}>5. Mastery</span>
                    <span style={{ fontSize: '0.8rem', color: '#4b5563' }}>
                      Students reaching upper-quartile scores (≥75% or configured mastery threshold).
                    </span>
                  </div>
                </div>
              </div>

              <div className={styles.modalSection} style={{ marginTop: 18 }}>
                <h4 className={styles.modalSectionTitle}>Drop-off & Inactivity Detection</h4>
                <p style={{ fontSize: '0.8rem', color: '#4b5563', lineHeight: 1.5, margin: '6px 0 0 0' }}>
                  A student is marked <strong>At-Risk in Funnel</strong> if they spend more than 7 days in the same
                  stage without making forward progress. Inactivity causes diagnostic risk score escalation (up to 95)
                  and generates targeted intervention recommendations.
                </p>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.actionBtn}
                style={{ background: '#7c3aed', color: '#ffffff' }}
                onClick={handleCloseModal}
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
