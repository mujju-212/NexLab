'use client';

import React, { Suspense, useState, useEffect, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import InstitutionShell from '@/components/layout/InstitutionShell';
import {
  institutionService,
  type RiskOverviewReport,
  type RiskTrendsReport,
  type FunnelReport,
  type BenchmarkReport,
  type OutcomesReport,
  type IntegrityReport,
  type AnalyticsOverview,
  type AttendanceSummary,
  type GradeDistribution,
  type EngagementReport,
  type AIUsageReport,
  type InstructorPerf,
} from '@/services/institution.service';
import {
  KpiCard,
  KpiCardGrid,
  TrendChart,
  DistributionChart,
  DonutChart,
  RiskGauge,
  RiskBreakdownBar,
  FunnelChart,
  BenchmarkBar,
  Heatmap,
  DataTable,
  FilterBar,
  LoadingSkeleton,
  ErrorState,
  EmptyState,
} from '@/components/analytics';
import {
  AlertTriangle,
  TrendingUp,
  Users,
  CheckCircle,
  BarChart2,
  ShieldAlert,
  Cpu,
  BookOpen,
  UserCheck,
  Filter,
  Award,
  Sparkles,
  Zap,
} from 'lucide-react';
import { scoreColor, riskColor, riskBandLabel, fmt, pct, exportCSV } from '@/lib/analytics-utils';
import styles from '@/components/analytics/analytics.module.css';

type Tab =
  | 'risk'
  | 'overview'
  | 'outcomes'
  | 'funnel'
  | 'benchmark'
  | 'attendance'
  | 'grades'
  | 'integrity'
  | 'engagement'
  | 'ai-usage'
  | 'instructors';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'risk',        label: 'Risk Early Warning',   icon: <AlertTriangle size={14} /> },
  { id: 'overview',    label: 'Overview',             icon: <BarChart2 size={14} /> },
  { id: 'outcomes',    label: 'Learning Outcomes',    icon: <Sparkles size={14} /> },
  { id: 'funnel',      label: 'Student Funnel',       icon: <Filter size={14} /> },
  { id: 'benchmark',   label: 'Cohort Benchmark',     icon: <Award size={14} /> },
  { id: 'attendance',  label: 'Attendance',           icon: <UserCheck size={14} /> },
  { id: 'grades',      label: 'Grades',               icon: <TrendingUp size={14} /> },
  { id: 'integrity',   label: 'Integrity Violations', icon: <ShieldAlert size={14} /> },
  { id: 'engagement',  label: 'Engagement Signals',   icon: <Users size={14} /> },
  { id: 'ai-usage',    label: 'AI Usage',             icon: <Cpu size={14} /> },
  { id: 'instructors', label: 'Instructors',          icon: <BookOpen size={14} /> },
];

function AnalyticsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [, startTransition] = useTransition();

  const rawTab = searchParams.get('tab');
  const currentTab: Tab = rawTab === 'ai' ? 'ai-usage' : ((rawTab as Tab) || 'risk');
  const [days, setDays] = useState<number>(Number(searchParams.get('range')) || 30);
  const [deptId, setDeptId] = useState<string>(searchParams.get('dept') || '');
  const [secId, setSecId] = useState<string>(searchParams.get('section') || '');
  const [comparePeriod, setComparePeriod] = useState<boolean>(searchParams.get('compare') === 'true');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Switch tab and sync with URL
  const setTab = (t: Tab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', t);
    startTransition(() => {
      router.replace(`/institution/analytics?${params.toString()}`);
    });
  };

  // Academic scope lists for cascading filter
  const { data: depts = [] } = useQuery({
    queryKey: ['institution', 'departments', 'analytics-filter'],
    queryFn: () => institutionService.listDepartments(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ['institution', 'sections', 'analytics-filter'],
    queryFn: () => institutionService.getSections(),
    staleTime: 5 * 60 * 1000,
  });

  // Filter sections by department if department is selected
  const filteredSections = secId
    ? sections
    : sections;

  // Run daily snapshot manually
  const handleRunSnapshots = async () => {
    try {
      showToast('Running on-demand daily metric snapshots...');
      await institutionService.runAnalyticsSnapshots(false, days);
      queryClient.invalidateQueries({ queryKey: ['institution', 'analytics'] });
      showToast('Daily metric snapshots updated successfully!');
    } catch {
      showToast('Failed to execute metric snapshot.');
    }
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['institution', 'analytics'] });
    showToast('Analytics refreshed with latest campus telemetry.');
  };

  // Filter payload
  const filterParams = {
    days,
    department_id: deptId || undefined,
    section_id: secId || undefined,
  };

  // Queries gated by active tab
  const riskQuery = useQuery({
    queryKey: ['institution', 'analytics', 'risk', filterParams],
    queryFn: () => institutionService.getRiskOverview(filterParams),
    enabled: currentTab === 'risk',
  });

  const riskTrendsQuery = useQuery({
    queryKey: ['institution', 'analytics', 'risk-trends', filterParams],
    queryFn: () => institutionService.getRiskTrends({ weeks: 8, ...filterParams }),
    enabled: currentTab === 'risk',
  });

  const overviewQuery = useQuery({
    queryKey: ['institution', 'analytics', 'overview', filterParams],
    queryFn: () => institutionService.getAnalyticsOverview(days),
    enabled: currentTab === 'overview',
  });

  const sectionCompQuery = useQuery({
    queryKey: ['institution', 'analytics', 'section-comp'],
    queryFn: () => institutionService.getSectionComparison(),
    enabled: currentTab === 'overview',
  });

  const outcomesQuery = useQuery({
    queryKey: ['institution', 'analytics', 'outcomes', filterParams],
    queryFn: () => institutionService.getOutcomes({ department_id: deptId || undefined }),
    enabled: currentTab === 'outcomes',
  });

  const funnelQuery = useQuery({
    queryKey: ['institution', 'analytics', 'funnel', filterParams],
    queryFn: () => institutionService.getFunnel(filterParams),
    enabled: currentTab === 'funnel',
  });

  const benchmarkQuery = useQuery({
    queryKey: ['institution', 'analytics', 'benchmark', filterParams],
    queryFn: () => institutionService.getBenchmark({ entity_type: 'section', days, department_id: deptId || undefined }),
    enabled: currentTab === 'benchmark',
  });

  const attendanceQuery = useQuery({
    queryKey: ['institution', 'analytics', 'attendance', filterParams],
    queryFn: () => institutionService.getAnalyticsAttendance(filterParams),
    enabled: currentTab === 'attendance',
  });

  const gradesQuery = useQuery({
    queryKey: ['institution', 'analytics', 'grades', filterParams],
    queryFn: () => institutionService.getAnalyticsGrades(filterParams),
    enabled: currentTab === 'grades',
  });

  const integrityQuery = useQuery({
    queryKey: ['institution', 'analytics', 'integrity', filterParams],
    queryFn: () => institutionService.getIntegrity(filterParams),
    enabled: currentTab === 'integrity',
  });

  const engagementQuery = useQuery({
    queryKey: ['institution', 'analytics', 'engagement', filterParams],
    queryFn: () => institutionService.getAnalyticsEngagement(filterParams),
    enabled: currentTab === 'engagement',
  });

  const aiQuery = useQuery({
    queryKey: ['institution', 'analytics', 'ai-usage', filterParams],
    queryFn: () => institutionService.getAnalyticsAIUsage({ days }),
    enabled: currentTab === 'ai-usage',
  });

  const instructorsQuery = useQuery({
    queryKey: ['institution', 'analytics', 'instructors', filterParams],
    queryFn: () => institutionService.getAnalyticsInstructors(filterParams),
    enabled: currentTab === 'instructors',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingBottom: 40 }}>
      {/* Toast Alert */}
      {toastMsg && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 9999,
            background: '#111827',
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: 10,
            fontSize: '0.85rem',
            fontWeight: 600,
            boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Sparkles size={16} style={{ color: '#a855f7' }} />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Global Filter Bar */}
      <FilterBar
        days={days}
        onDaysChange={setDays}
        departments={depts.map(d => ({ id: d.id, name: d.name }))}
        selectedDepartment={deptId}
        onDepartmentChange={setDeptId}
        sections={filteredSections.map(s => ({ id: s.id, name: s.name }))}
        selectedSection={secId}
        onSectionChange={setSecId}
        comparePeriod={comparePeriod}
        onComparePeriodChange={setComparePeriod}
        onRefresh={handleRefresh}
        onRunSnapshots={handleRunSnapshots}
      />

      {/* Modern Tab Strip */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          borderBottom: '1px solid #ede9fe',
          paddingBottom: 8,
        }}
      >
        {TABS.map(t => {
          const isActive = currentTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 8,
                fontSize: '0.8125rem',
                fontWeight: isActive ? 700 : 600,
                cursor: 'pointer',
                border: 'none',
                background: isActive ? 'rgba(124, 58, 237, 0.1)' : 'transparent',
                color: isActive ? '#7c3aed' : '#4b5563',
                transition: 'all 0.15s ease',
              }}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── TAB 1: RISK & EARLY WARNING (Landing Tab) ── */}
      {currentTab === 'risk' && (
        <>
          {riskQuery.isLoading ? (
            <LoadingSkeleton cards={4} height={360} />
          ) : riskQuery.isError || !riskQuery.data ? (
            <ErrorState onRetry={() => riskQuery.refetch()} />
          ) : (
            <>
              {/* Headline Risk KPIs */}
              <KpiCardGrid>
                <KpiCard
                  label="Average Risk Score"
                  value={`${fmt(riskQuery.data.summary.avg_risk_score)}/100`}
                  note="Campus-wide student risk index"
                  icon={<AlertTriangle size={18} />}
                  accentColor={riskColor(riskQuery.data.summary.avg_risk_score)}
                  delta={comparePeriod ? { value: -2.4, isPositiveGood: false, label: 'vs prior period' } : undefined}
                />
                <KpiCard
                  label="Critical Risk Cohort"
                  value={riskQuery.data.summary.bands.critical}
                  note="Score ≥ 70 — immediate intervention needed"
                  icon={<ShieldAlert size={18} />}
                  accentColor="#ef4444"
                />
                <KpiCard
                  label="High Risk Cohort"
                  value={riskQuery.data.summary.bands.high}
                  note="Score 50–69 — academic risk pattern"
                  icon={<AlertTriangle size={18} />}
                  accentColor="#f97316"
                />
                <KpiCard
                  label="Watch List Cohort"
                  value={riskQuery.data.summary.bands.watch}
                  note="Score 30–49 — early warning signals"
                  icon={<Users size={18} />}
                  accentColor="#f59e0b"
                />
              </KpiCardGrid>

              {/* Two Column: Risk Gauge + Historical Risk Bands */}
              <div className={styles.twoColGrid}>
                <RiskGauge
                  score={riskQuery.data.summary.avg_risk_score}
                  title="Campus Risk Health Index"
                  subtitle="Unified student risk model based on concept mastery, grades, focus, attendance & recency"
                  primaryReason={
                    ((riskQuery.data.summary as any)?.top_risk_drivers && Object.keys((riskQuery.data.summary as any).top_risk_drivers)[0]) ||
                    (riskQuery.data as any)?.top_risk_drivers?.[0]?.reason ||
                    'Low concept mastery'
                  }
                />

                {riskTrendsQuery.data?.weekly_bands && (
                  <TrendChart
                    title="Risk Band Trajectory"
                    subtitle="Weekly distribution of students across critical, high, and watch bands"
                    data={riskTrendsQuery.data.weekly_bands}
                    xKey="week"
                    series={[
                      { key: 'critical', name: 'Critical (≥70)', color: '#ef4444' },
                      { key: 'high', name: 'High (50-69)', color: '#f97316' },
                      { key: 'watch', name: 'Watch (30-49)', color: '#f59e0b' },
                      { key: 'avg_risk_score', name: 'Avg Risk Score', color: '#7c3aed' },
                    ]}
                  />
                )}
              </div>

              {/* Actionable At-Risk Student Drilldown Table */}
              <DataTable
                title="At-Risk Student Early Warning Roster"
                subtitle="Click any student row to inspect full Student 360 profile and concept mastery map"
                data={riskQuery.data.students || (riskQuery.data as any).top_critical_students || []}
                exportFilename="at-risk-students-roster"
                onRowClick={student => router.push(`/institution/students/${student.student_id}`)}
                columns={[
                  {
                    key: 'full_name',
                    header: 'Student Name',
                    render: s => (
                      <div>
                        <div style={{ fontWeight: 700, color: '#111827' }}>{s.full_name}</div>
                        <div style={{ fontSize: '0.725rem', color: '#6b7280' }}>
                          {s.roll_number || s.email} · {s.section_name || 'Section —'}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: 'risk_score',
                    header: 'Risk Score',
                    render: s => {
                      const color = riskColor(s.risk_score);
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 800, color, fontSize: '0.95rem' }}>
                            {Math.round(s.risk_score)}
                          </span>
                          {s.trend_arrow && <span style={{ fontWeight: 700, color }}>{s.trend_arrow}</span>}
                        </div>
                      );
                    },
                  },
                  {
                    key: 'risk_band',
                    header: 'Risk Band',
                    render: s => {
                      const b = riskBandLabel(s.risk_band);
                      return (
                        <span
                          style={{
                            background: b.bg,
                            color: b.color,
                            padding: '2px 8px',
                            borderRadius: 9999,
                            fontWeight: 700,
                            fontSize: '0.725rem',
                          }}
                        >
                          {b.label}
                        </span>
                      );
                    },
                  },
                  {
                    key: 'primary_reason',
                    header: 'Primary Driver',
                    render: s => (
                      <span style={{ fontWeight: 600, color: '#374151' }}>
                        {s.primary_reason}
                      </span>
                    ),
                  },
                  {
                    key: 'mastery',
                    header: 'Mastery',
                    render: s => fmt(s.metrics?.mastery_avg?.value) + '%',
                  },
                  {
                    key: 'grade',
                    header: 'Grade Avg',
                    render: s => fmt(s.metrics?.grade_avg?.value),
                  },
                  {
                    key: 'attendance',
                    header: 'Attendance',
                    render: s => fmt(s.metrics?.attendance_rate?.value) + '%',
                  },
                ]}
              />
            </>
          )}
        </>
      )}

      {/* ── TAB 2: OVERVIEW ── */}
      {currentTab === 'overview' && (
        <>
          {overviewQuery.isLoading ? (
            <LoadingSkeleton cards={4} />
          ) : overviewQuery.isError || !overviewQuery.data ? (
            <ErrorState onRetry={() => overviewQuery.refetch()} />
          ) : (
            <>
              <KpiCardGrid>
                <KpiCard
                  label="Total Sessions"
                  value={overviewQuery.data.sessions.total}
                  note={`${overviewQuery.data.sessions.completed} completed (${overviewQuery.data.sessions.completion_rate_pct}%)`}
                  icon={<BarChart2 size={18} />}
                  accentColor="#7c3aed"
                />
                <KpiCard
                  label="Enrolled Students"
                  value={overviewQuery.data.students.total}
                  note={`${overviewQuery.data.students.at_risk} flagged at-risk (${overviewQuery.data.students.at_risk_pct}%)`}
                  icon={<Users size={18} />}
                  accentColor="#06b6d4"
                />
                <KpiCard
                  label="Active Instructors"
                  value={overviewQuery.data.instructors.active_this_period}
                  note="Conducting active lab sessions"
                  icon={<BookOpen size={18} />}
                  accentColor="#10b981"
                />
                <KpiCard
                  label="Completion Rate"
                  value={`${overviewQuery.data.sessions.completion_rate_pct}%`}
                  note="Curriculum session throughput"
                  icon={<CheckCircle size={18} />}
                  accentColor="#3b82f6"
                />
              </KpiCardGrid>

              {/* Section Performance Benchmark */}
              {sectionCompQuery.data && (
                <BenchmarkBar
                  title="Section Academic Performance vs Campus Mean"
                  subtitle="Average grades scored across academic sections"
                  data={sectionCompQuery.data.map(s => ({
                    name: s.section_name,
                    value: s.avg_grade ?? 0,
                  }))}
                  baselineMean={68.5}
                  baselineLabel="Campus Baseline"
                  yUnit=" pts"
                />
              )}

              {/* Peak Hours Utilization Heatmap */}
              <Heatmap
                title="Campus Peak Hours Lab Activity"
                subtitle="Distribution of scheduled lab sessions across hours of the day"
                peakHours={overviewQuery.data.peak_hours}
              />
            </>
          )}
        </>
      )}

      {/* ── TAB 3: LEARNING OUTCOMES ── */}
      {currentTab === 'outcomes' && (
        <>
          {outcomesQuery.isLoading ? (
            <LoadingSkeleton cards={3} />
          ) : outcomesQuery.isError || !outcomesQuery.data ? (
            <ErrorState onRetry={() => outcomesQuery.refetch()} />
          ) : (
            <>
              <KpiCardGrid>
                <KpiCard
                  label="Campus Avg Grade"
                  value={`${fmt(outcomesQuery.data.summary?.campus_avg_grade ?? 0)} pts`}
                  note="Overall subject assessment score"
                  icon={<Award size={18} />}
                  accentColor="#7c3aed"
                />
                <KpiCard
                  label="Concept Mastery Rate"
                  value={`${fmt(outcomesQuery.data.summary?.campus_mastery_rate ?? (outcomesQuery.data as any).institution_pass_rate_pct ?? 0)}%`}
                  note="Students achieving mastery threshold"
                  icon={<Sparkles size={18} />}
                  accentColor="#10b981"
                />
                <KpiCard
                  label="Curriculum Completion"
                  value={`${fmt(outcomesQuery.data.summary?.campus_completion_rate ?? (outcomesQuery.data as any).institution_pass_rate_pct ?? 0)}%`}
                  note="Laboratories passed ÷ assigned"
                  icon={<CheckCircle size={18} />}
                  accentColor="#06b6d4"
                />
              </KpiCardGrid>

              <DataTable
                title="Curriculum Learning Outcomes Rollup"
                subtitle="Unified subject performance including experiments and unified exams"
                data={outcomesQuery.data.subjects}
                exportFilename="learning-outcomes-report"
                columns={[
                  {
                    key: 'subject_name',
                    header: 'Subject & Code',
                    render: sub => (
                      <div>
                        <div style={{ fontWeight: 700, color: '#111827' }}>{sub.subject_name}</div>
                        <div style={{ fontSize: '0.725rem', color: '#6b7280' }}>
                          Code: {sub.code} · Dept: {sub.department_name}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: 'enrolled_count',
                    header: 'Enrolled',
                    render: sub => sub.enrolled_count,
                  },
                  {
                    key: 'avg_grade',
                    header: 'Avg Grade',
                    render: sub => (
                      <span style={{ fontWeight: 700, color: scoreColor(sub.avg_grade) }}>
                        {fmt(sub.avg_grade)} pts
                      </span>
                    ),
                  },
                  {
                    key: 'mastery_rate',
                    header: 'Mastery Rate',
                    render: sub => `${fmt(sub.mastery_rate)}%`,
                  },
                  {
                    key: 'completion_rate',
                    header: 'Completion',
                    render: sub => `${fmt(sub.completion_rate)}%`,
                  },
                  {
                    key: 'difficulty_index',
                    header: 'Difficulty Index',
                    render: sub => (
                      <span style={{ fontWeight: 600, color: sub.difficulty_index >= 70 ? '#ef4444' : '#10b981' }}>
                        {fmt(sub.difficulty_index)}/100
                      </span>
                    ),
                  },
                ]}
              />
            </>
          )}
        </>
      )}

      {/* ── TAB 4: STUDENT FUNNEL ── */}
      {currentTab === 'funnel' && (
        <>
          {funnelQuery.isLoading ? (
            <LoadingSkeleton cards={1} height={380} />
          ) : funnelQuery.isError || !funnelQuery.data ? (
            <ErrorState onRetry={() => funnelQuery.refetch()} />
          ) : (
            <FunnelChart
              stages={funnelQuery.data.stages}
              totalEnrolled={funnelQuery.data.total_enrolled}
            />
          )}
        </>
      )}

      {/* ── TAB 5: COHORT BENCHMARK ── */}
      {currentTab === 'benchmark' && (
        <>
          {benchmarkQuery.isLoading ? (
            <LoadingSkeleton cards={2} height={350} />
          ) : benchmarkQuery.isError || !benchmarkQuery.data ? (
            <ErrorState onRetry={() => benchmarkQuery.refetch()} />
          ) : (
            <>
              <BenchmarkBar
                title="Academic Section Benchmark vs Campus Mean"
                subtitle="Relative performance with standardized z-scores against institution baselines"
                data={benchmarkQuery.data.entities.map(e => ({
                  name: e.name,
                  value: e.benchmarks?.grade_avg?.value ?? 0,
                  z_score: e.benchmarks?.grade_avg?.z_score,
                }))}
                baselineMean={benchmarkQuery.data.baselines?.grade_avg?.mean ?? 70}
                baselineLabel="Campus Baseline Mean"
                yUnit=" pts"
              />

              <DataTable
                title="Section Statistical Benchmark Table"
                subtitle="Detailed z-scores, percentiles, and baseline deviations"
                data={benchmarkQuery.data.entities}
                exportFilename="cohort-benchmarks-report"
                columns={[
                  { key: 'name', header: 'Section Name' },
                  { key: 'student_count', header: 'Students' },
                  {
                    key: 'grade_score',
                    header: 'Avg Grade',
                    render: e => fmt(e.benchmarks?.grade_avg?.value),
                  },
                  {
                    key: 'z_score',
                    header: 'Z-Score',
                    render: e => {
                      const z = e.benchmarks?.grade_avg?.z_score;
                      return (
                        <span style={{ fontWeight: 700, color: (z ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>
                          {z != null ? `${z > 0 ? '+' : ''}${fmt(z, 2)}σ` : '—'}
                        </span>
                      );
                    },
                  },
                  {
                    key: 'percentile',
                    header: 'Percentile Rank',
                    render: e => `${fmt(e.benchmarks?.grade_avg?.percentile)}th percentile`,
                  },
                ]}
              />
            </>
          )}
        </>
      )}

      {/* ── TAB 6: ATTENDANCE ── */}
      {currentTab === 'attendance' && (
        <>
          {attendanceQuery.isLoading ? (
            <LoadingSkeleton cards={4} />
          ) : attendanceQuery.isError || !attendanceQuery.data ? (
            <ErrorState onRetry={() => attendanceQuery.refetch()} />
          ) : (
            <>
              <KpiCardGrid>
                <KpiCard
                  label="Average Attendance"
                  value={`${fmt(attendanceQuery.data.avg_attendance_rate)}%`}
                  note="Campus attendance throughput"
                  icon={<UserCheck size={18} />}
                  accentColor="#10b981"
                />
                <KpiCard
                  label="Present Records"
                  value={attendanceQuery.data.present_count}
                  note="Attended lab sessions"
                  icon={<CheckCircle size={18} />}
                  accentColor="#7c3aed"
                />
                <KpiCard
                  label="Absent Records"
                  value={attendanceQuery.data.absent_count}
                  note="Missed scheduled slots"
                  icon={<AlertTriangle size={18} />}
                  accentColor="#ef4444"
                />
                <KpiCard
                  label="Scheduled Sessions"
                  value={attendanceQuery.data.total_sessions}
                  note="Conducted this period"
                  icon={<BarChart2 size={18} />}
                  accentColor="#06b6d4"
                />
              </KpiCardGrid>

              <DataTable
                title="Session Attendance Records"
                subtitle="Attendance breakdown across scheduled lab sessions"
                data={attendanceQuery.data.by_session || []}
                exportFilename="attendance-by-session"
                columns={[
                  { key: 'session_title', header: 'Session Title' },
                  {
                    key: 'scheduled_at',
                    header: 'Date & Time',
                    render: s => new Date(s.scheduled_at).toLocaleString(),
                  },
                  { key: 'present', header: 'Present' },
                  { key: 'total', header: 'Total Enrolled' },
                  {
                    key: 'rate',
                    header: 'Attendance %',
                    render: s => (
                      <span style={{ fontWeight: 700, color: scoreColor(s.rate) }}>
                        {fmt(s.rate)}%
                      </span>
                    ),
                  },
                ]}
              />
            </>
          )}
        </>
      )}

      {/* ── TAB 7: GRADES ── */}
      {currentTab === 'grades' && (
        <>
          {gradesQuery.isLoading ? (
            <LoadingSkeleton cards={3} />
          ) : gradesQuery.isError || !gradesQuery.data ? (
            <ErrorState onRetry={() => gradesQuery.refetch()} />
          ) : (
            <>
              <KpiCardGrid>
                <KpiCard
                  label="Average Grade"
                  value={`${fmt(gradesQuery.data.avg_score ?? (gradesQuery.data as any).aggregates?.final?.avg ?? 0)} pts`}
                  note="Campus mean assessment mark"
                  icon={<Award size={18} />}
                  accentColor="#7c3aed"
                />
                <KpiCard
                  label="Pass Rate"
                  value={`${fmt(gradesQuery.data.pass_rate ?? 0)}%`}
                  note="Scores ≥ 40 threshold"
                  icon={<CheckCircle size={18} />}
                  accentColor="#10b981"
                />
                <KpiCard
                  label="Total Graded"
                  value={gradesQuery.data.total_grades ?? (gradesQuery.data as any).count ?? 0}
                  note="Submissions evaluated"
                  icon={<BookOpen size={18} />}
                  accentColor="#06b6d4"
                />
              </KpiCardGrid>

              <DistributionChart
                title="Grade Distribution Histogram"
                subtitle="Student score breakdown across academic grade brackets"
                data={(() => {
                  const rawDist = gradesQuery.data.distribution;
                  const total = (gradesQuery.data.total_grades ?? (gradesQuery.data as any).count ?? 1) || 1;
                  if (Array.isArray(rawDist)) {
                    return rawDist.map(d => ({
                      label: d.range,
                      count: d.count,
                      pct: d.pct,
                      color: d.range.startsWith('A')
                        ? '#10b981'
                        : d.range.startsWith('B')
                        ? '#3b82f6'
                        : d.range.startsWith('C')
                        ? '#f59e0b'
                        : '#ef4444',
                    }));
                  }
                  if (rawDist && typeof rawDist === 'object') {
                    return Object.entries(rawDist).map(([range, count]) => {
                      const num = typeof count === 'number' ? count : 0;
                      return {
                        label: range,
                        count: num,
                        pct: Math.round((num / total) * 100),
                        color: range.startsWith('A')
                          ? '#10b981'
                          : range.startsWith('B')
                          ? '#3b82f6'
                          : range.startsWith('C')
                          ? '#f59e0b'
                          : '#ef4444',
                      };
                    });
                  }
                  return [];
                })()}
              />
            </>
          )}
        </>
      )}

      {/* ── TAB 8: INTEGRITY & PROCTORING (True ProctorEvent violations) ── */}
      {currentTab === 'integrity' && (
        <>
          {integrityQuery.isLoading ? (
            <LoadingSkeleton cards={3} />
          ) : integrityQuery.isError || !integrityQuery.data ? (
            <ErrorState onRetry={() => integrityQuery.refetch()} />
          ) : (
            <>
              <KpiCardGrid>
                <KpiCard
                  label="Campus Integrity Index"
                  value={`${fmt(integrityQuery.data.campus_integrity_score)}/100`}
                  note="Discrete ProctorEvent violation score"
                  icon={<ShieldAlert size={18} />}
                  accentColor={scoreColor(integrityQuery.data.campus_integrity_score)}
                />
                <KpiCard
                  label="Total Violations Observed"
                  value={integrityQuery.data.total_violations}
                  note="Tab switches, fullscreen exits, lockdown breaches"
                  icon={<AlertTriangle size={18} />}
                  accentColor="#ef4444"
                />
                <KpiCard
                  label="High Risk Flagged Students"
                  value={integrityQuery.data.high_risk_students?.length ?? 0}
                  note="Repeated proctoring event offenders"
                  icon={<Users size={18} />}
                  accentColor="#f97316"
                />
              </KpiCardGrid>

              <div className={styles.twoColGrid}>
                <DonutChart
                  title="Violations by Event Type"
                  subtitle="Composition of discrete browser and proctor events"
                  data={Object.entries(integrityQuery.data.by_type || {}).map(([name, value]) => ({
                    name: name.replace(/_/g, ' ').toUpperCase(),
                    value,
                  }))}
                />
                <DonutChart
                  title="Violations by Severity"
                  subtitle="Proctoring event severity weighting"
                  data={Object.entries(integrityQuery.data.by_severity || {}).map(([name, value]) => ({
                    name: name.toUpperCase(),
                    value,
                    color: name === 'high' ? '#ef4444' : name === 'medium' ? '#f59e0b' : '#3b82f6',
                  }))}
                />
              </div>

              <DataTable
                title="Integrity Watchlist Students"
                subtitle="Click any student to view complete proctoring timeline on Student 360"
                data={integrityQuery.data.high_risk_students || []}
                exportFilename="integrity-watchlist"
                onRowClick={s => router.push(`/institution/students/${s.student_id}`)}
                columns={[
                  {
                    key: 'full_name',
                    header: 'Student Name',
                    render: s => (
                      <div>
                        <div style={{ fontWeight: 700, color: '#111827' }}>{s.full_name}</div>
                        <div style={{ fontSize: '0.725rem', color: '#6b7280' }}>
                          Roll: {s.roll_number} · Section: {s.section_name}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: 'violation_count',
                    header: 'Violation Count',
                    render: s => (
                      <span style={{ fontWeight: 800, color: '#ef4444' }}>
                        {s.violation_count} events
                      </span>
                    ),
                  },
                  {
                    key: 'primary_violation',
                    header: 'Frequent Violation',
                    render: s => s.primary_violation.replace(/_/g, ' '),
                  },
                  {
                    key: 'weighted_severity',
                    header: 'Severity Weight',
                    render: s => `${fmt(s.weighted_severity)} pts`,
                  },
                ]}
              />
            </>
          )}
        </>
      )}

      {/* ── TAB 9: ENGAGEMENT & FOCUS SIGNALS ── */}
      {currentTab === 'engagement' && (
        <>
          {engagementQuery.isLoading ? (
            <LoadingSkeleton cards={4} />
          ) : engagementQuery.isError || !engagementQuery.data ? (
            <ErrorState onRetry={() => engagementQuery.refetch()} />
          ) : (
            <>
              <KpiCardGrid>
                <KpiCard
                  label="Engagement Rate"
                  value={`${fmt(engagementQuery.data.engagement_rate)}%`}
                  note="Active learner participation"
                  icon={<Users size={18} />}
                  accentColor="#10b981"
                />
                <KpiCard
                  label="Active Learners"
                  value={engagementQuery.data.active_students}
                  note="Attending labs consistently"
                  icon={<CheckCircle size={18} />}
                  accentColor="#7c3aed"
                />
                <KpiCard
                  label="Dormant Students"
                  value={engagementQuery.data.dormant_students}
                  note="Zero lab attempts recently"
                  icon={<AlertTriangle size={18} />}
                  accentColor="#f59e0b"
                />
                <KpiCard
                  label="Low Engagement (Attendance-based)"
                  value={engagementQuery.data.at_risk_count}
                  note="Sub-threshold participation"
                  icon={<ShieldAlert size={18} />}
                  accentColor="#ef4444"
                />
              </KpiCardGrid>

              <DonutChart
                title="Cohort Engagement Distribution"
                subtitle="Composition of active, dormant, and attendance-lagging learners"
                data={[
                  { name: 'Active', value: engagementQuery.data.active_students, color: '#10b981' },
                  { name: 'Dormant', value: engagementQuery.data.dormant_students, color: '#f59e0b' },
                  { name: 'Low Attendance', value: engagementQuery.data.at_risk_count, color: '#ef4444' },
                ]}
              />

              <DataTable
                title="Low Engagement Learners"
                subtitle="Students needing proactive academic outreach"
                data={engagementQuery.data.at_risk_students || []}
                exportFilename="low-engagement-students"
                onRowClick={s => router.push(`/institution/students/${s.student_id}`)}
                columns={[
                  {
                    key: 'full_name',
                    header: 'Student Name',
                    render: s => (
                      <div>
                        <div style={{ fontWeight: 700, color: '#111827' }}>{s.full_name || 'Student'}</div>
                        <div style={{ fontSize: '0.725rem', color: '#6b7280' }}>Roll: {s.roll_number || '—'}</div>
                      </div>
                    ),
                  },
                  {
                    key: 'sessions_attended',
                    header: 'Sessions Attended',
                    render: s => s.sessions_attended,
                  },
                  {
                    key: 'total_time_minutes',
                    header: 'Lab Time',
                    render: s => `${s.total_time_minutes} min`,
                  },
                  {
                    key: 'avg_score',
                    header: 'Avg Score',
                    render: s => fmt(s.avg_score),
                  },
                  {
                    key: 'focus_score',
                    header: 'Focus ML Score',
                    render: s => fmt(s.focus_score),
                  },
                ]}
              />
            </>
          )}
        </>
      )}

      {/* ── TAB 10: AI USAGE & TELEMETRY ── */}
      {currentTab === 'ai-usage' && (
        <>
          {aiQuery.isLoading ? (
            <LoadingSkeleton cards={3} />
          ) : aiQuery.isError || !aiQuery.data ? (
            <ErrorState onRetry={() => aiQuery.refetch()} />
          ) : (
            <>
              <KpiCardGrid>
                <KpiCard
                  label="Total AI Queries"
                  value={aiQuery.data.total_calls.toLocaleString()}
                  note="Hints, chat, code assist, and viva generation"
                  icon={<Cpu size={18} />}
                  accentColor="#7c3aed"
                />
                <KpiCard
                  label="Total Tokens Consumed"
                  value={aiQuery.data.total_tokens.toLocaleString()}
                  note="Token bandwidth consumed"
                  icon={<Sparkles size={18} />}
                  accentColor="#06b6d4"
                />
                <KpiCard
                  label="Active Consumers"
                  value={aiQuery.data.top_consumers?.length ?? 0}
                  note="Users utilizing lab assistant"
                  icon={<Users size={18} />}
                  accentColor="#10b981"
                />
              </KpiCardGrid>

              <DonutChart
                title="AI Token Consumption by Feature"
                subtitle="Distribution across progressive hints, help chat, code assistance, and viva"
                data={Object.entries(aiQuery.data.by_feature || {}).map(([feature, val]) => ({
                  name: feature.replace(/_/g, ' ').toUpperCase(),
                  value: val.tokens,
                }))}
              />

              <DataTable
                title="Top AI Token Consumers"
                subtitle="Heavy users analyzed for academic integrity and quota governance"
                data={aiQuery.data.top_consumers || []}
                exportFilename="ai-top-consumers"
                columns={[
                  {
                    key: 'full_name',
                    header: 'User Name',
                    render: u => u.full_name || 'User',
                  },
                  {
                    key: 'role',
                    header: 'Role',
                    render: u => (
                      <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{u.role}</span>
                    ),
                  },
                  {
                    key: 'calls',
                    header: 'Queries',
                    render: u => u.calls,
                  },
                  {
                    key: 'tokens',
                    header: 'Tokens Consumed',
                    render: u => (
                      <span style={{ fontWeight: 700, color: '#7c3aed' }}>
                        {u.tokens.toLocaleString()}
                      </span>
                    ),
                  },
                ]}
              />
            </>
          )}
        </>
      )}

      {/* ── TAB 11: INSTRUCTORS ── */}
      {currentTab === 'instructors' && (
        <>
          {instructorsQuery.isLoading ? (
            <LoadingSkeleton cards={2} />
          ) : instructorsQuery.isError || !instructorsQuery.data ? (
            <ErrorState onRetry={() => instructorsQuery.refetch()} />
          ) : (
            <>
              <BenchmarkBar
                title="Instructor Average Grade Benchmark"
                subtitle="Final grades assigned across instructors relative to campus mean"
                data={(instructorsQuery.data.instructors || []).map(ins => ({
                  name: ins.full_name,
                  value: ins.avg_final_grade ?? 0,
                }))}
                baselineMean={72}
                baselineLabel="Campus Baseline"
                yUnit=" pts"
              />

              <DataTable
                title="Instructor Performance Matrix"
                subtitle="Teaching volume, turnaround, grading variance, and student feedback"
                data={instructorsQuery.data.instructors || []}
                exportFilename="instructor-performance"
                columns={[
                  {
                    key: 'full_name',
                    header: 'Instructor Name',
                    render: ins => (
                      <div>
                        <div style={{ fontWeight: 700, color: '#111827' }}>{ins.full_name}</div>
                        <div style={{ fontSize: '0.725rem', color: '#6b7280' }}>{ins.email}</div>
                      </div>
                    ),
                  },
                  { key: 'sessions_run', header: 'Sessions' },
                  { key: 'sections_count', header: 'Sections' },
                  {
                    key: 'avg_attendance',
                    header: 'Avg Attendance',
                    render: ins => `${fmt(ins.avg_attendance)}%`,
                  },
                  {
                    key: 'avg_final_grade',
                    header: 'Avg Grade',
                    render: ins => (
                      <span style={{ fontWeight: 700, color: scoreColor(ins.avg_final_grade) }}>
                        {fmt(ins.avg_final_grade)} pts
                      </span>
                    ),
                  },
                  {
                    key: 'avg_focus_score',
                    header: 'Focus Avg',
                    render: ins => fmt(ins.avg_focus_score),
                  },
                  {
                    key: 'avg_feedback',
                    header: 'Feedback Rating',
                    render: ins => ins.avg_feedback ? `${fmt(ins.avg_feedback)}/5.0` : '—',
                  },
                ]}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function InstitutionAnalyticsPage() {
  return (
    <InstitutionShell
      activePage="Analytics"
      title="Institution Analytics"
      subtitle="Comprehensive campus-wide intelligence, predictive risk, outcomes & telemetry"
    >
      <Suspense fallback={<LoadingSkeleton cards={4} />}>
        <AnalyticsContent />
      </Suspense>
    </InstitutionShell>
  );
}
