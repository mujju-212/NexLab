'use client';

import React, { Suspense, useState, useEffect, useTransition, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import InstitutionShell from '@/components/layout/InstitutionShell';
import { toast } from '@/components/ui/toast';
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
  type InstructorsReport,
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
  RiskEarlyWarningTab,
  Student360Drawer,
  AcademicPerformanceChart,
  RiskDistributionCard,
  RiskTrendChart,
  ActivityHeatmap,
  OutcomesMasteryList,
  TopAtRiskTable,
  BenchmarkDualAxisChart,
  SectionDistributionDonut,
  BenchmarkComparisonCards,
  SectionBenchmarkTable,
  BenchmarkHowItWorksModal,
  LearningOutcomesTrendChart,
  OutcomeDistributionDonut,
  CurriculumRollupTable,
  OutcomesHowItWorksModal,
  IntegrityViolationsTab,
  IntegrityHowItWorksModal,
  StudentFunnelTab,
  GradesMarksTab,
  AttendanceMatrixTab,
  AttendanceHowItWorksModal,
  EngagementSignalsTab,
  EngagementHowItWorksModal,
  AIUsageTelemetryTab,
  AIUsageHowItWorksModal,
  InstructorsTab,
} from '@/components/analytics';
import {
  AlertTriangle,
  TrendingUp,
  Users,
  User,
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
  Download,
  ChevronDown,
  CalendarCheck,
  GraduationCap,
  Trophy,
  HelpCircle,
  Target,
} from 'lucide-react';
import { scoreColor, riskColor, riskBandLabel, fmt, pct, exportCSV } from '@/lib/analytics-utils';
import styles from '@/components/analytics/analytics.module.css';

type Tab =
  | 'overview'
  | 'outcomes'
  | 'funnel'
  | 'benchmark'
  | 'attendance'
  | 'grades'
  | 'integrity'
  | 'engagement'
  | 'risk'
  | 'ai-usage'
  | 'instructors';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview',    label: 'Overview',             icon: <BarChart2 size={14} /> },
  { id: 'outcomes',    label: 'Learning Outcomes',    icon: <Sparkles size={14} /> },
  { id: 'funnel',      label: 'Student Funnel',       icon: <Filter size={14} /> },
  { id: 'benchmark',   label: 'Cohort Benchmark',     icon: <Award size={14} /> },
  { id: 'attendance',  label: 'Attendance',           icon: <UserCheck size={14} /> },
  { id: 'grades',      label: 'Grades & Marks',       icon: <BarChart2 size={14} /> },
  { id: 'integrity',   label: 'Integrity Violations', icon: <ShieldAlert size={14} /> },
  { id: 'engagement',  label: 'Engagement Signals',   icon: <Users size={14} /> },
  { id: 'risk',        label: 'Risk Early Warning',   icon: <AlertTriangle size={14} /> },
  { id: 'ai-usage',    label: 'AI Usage',             icon: <Cpu size={14} /> },
  { id: 'instructors', label: 'Instructors',          icon: <BookOpen size={14} /> },
];

function AnalyticsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [, startTransition] = useTransition();

  const rawTab = searchParams.get('tab');
  const currentTab: Tab = rawTab === 'ai' ? 'ai-usage' : ((rawTab as Tab) || 'overview');
  const activeTabConfig = TABS.find(t => t.id === currentTab) ?? TABS[0];
  const [days, setDays] = useState<number>(Number(searchParams.get('range')) || 30);
  const [deptId, setDeptId] = useState<string>(searchParams.get('dept') || '');
  const [secId, setSecId] = useState<string>(searchParams.get('section') || '');
  const [batchId, setBatchId] = useState<string>(searchParams.get('batch') || '');
  const [subjectId, setSubjectId] = useState<string>(searchParams.get('subject') || '');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [comparePeriod, setComparePeriod] = useState<boolean>(searchParams.get('compare') === 'true');
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const showToast = (msg: string) => toast.info(msg);

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

  const { data: batches = [] } = useQuery({
    queryKey: ['institution', 'batches', 'analytics-filter'],
    queryFn: () => institutionService.getBatches(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ['institution', 'sections', 'analytics-filter'],
    queryFn: () => institutionService.getSections(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ['institution', 'subjects', 'analytics-filter'],
    queryFn: () => institutionService.getSubjects(),
    staleTime: 5 * 60 * 1000,
  });

  // Filter sections by department and batch
  const filteredSections = useMemo(() => {
    let result = sections;
    if (deptId) {
      result = result.filter((s: any) => {
        if (s.department_id && s.department_id === deptId) return true;
        if (s.department_ids && Array.isArray(s.department_ids)) return s.department_ids.includes(deptId);
        return false;
      });
    }
    if (batchId) {
      result = result.filter((s: any) => s.batch_id === batchId);
    }
    return result;
  }, [sections, deptId, batchId]);

  const handleDepartmentChange = (newDept: string) => {
    setDeptId(newDept);
    setSecId('');
    setSubjectId('');
  };

  const handleBatchChange = (newBatch: string) => {
    setBatchId(newBatch);
    setSecId('');
  };

  // Filter subjects by department if department is selected
  const filteredSubjects = useMemo(() => {
    if (!deptId) return subjects;
    return subjects.filter((s: any) => !s.department_id || s.department_id === deptId);
  }, [subjects, deptId]);

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
    batch_id: batchId || undefined,
    subject_id: subjectId || undefined,
    compare: comparePeriod ? true : undefined,
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
    queryFn: () => institutionService.getAnalyticsOverview(filterParams),
    enabled: currentTab === 'overview',
  });

  const sectionCompQuery = useQuery({
    queryKey: ['institution', 'analytics', 'section-comp', filterParams],
    queryFn: () => institutionService.getSectionComparison(filterParams),
    enabled: currentTab === 'overview',
  });

  const trendsQuery = useQuery({
    queryKey: ['institution', 'analytics', 'trends', filterParams],
    queryFn: () => institutionService.getAnalyticsTrends({ weeks: 8, days }),
    enabled: currentTab === 'overview',
  });

  const outcomesOverviewQuery = useQuery({
    queryKey: ['institution', 'analytics', 'outcomes-overview', deptId],
    queryFn: () => institutionService.getOutcomes({ department_id: deptId || undefined }),
    enabled: currentTab === 'overview',
  });

  const studentsAtRiskQuery = useQuery({
    queryKey: ['institution', 'analytics', 'students-at-risk', filterParams],
    queryFn: () => institutionService.getAtRiskStudents(filterParams),
    enabled: currentTab === 'overview',
  });

  const outcomesQuery = useQuery({
    queryKey: ['institution', 'analytics', 'outcomes', filterParams],
    queryFn: () =>
      institutionService.getOutcomes({
        department_id: deptId || undefined,
        dept: deptId || undefined,
        section: secId || undefined,
        batch: batchId || undefined,
        range: days,
      }),
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
    queryFn: () => institutionService.getAnalyticsAIUsage(filterParams),
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
      {/* Page Title & Action Bar matching UI screenshot */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14,
          marginBottom: 2,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: currentTab === 'risk'
                ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(124, 58, 237, 0.2))'
                : 'linear-gradient(135deg, rgba(147, 51, 234, 0.15), rgba(124, 58, 237, 0.25))',
              border: '1px solid rgba(147, 51, 234, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#7c3aed',
            }}
          >
            {currentTab === 'risk' || currentTab === 'integrity' ? (
              <ShieldAlert size={22} strokeWidth={2.2} />
            ) : currentTab === 'outcomes' ? (
              <Sparkles size={22} strokeWidth={2.2} />
            ) : currentTab === 'funnel' ? (
              <Filter size={22} strokeWidth={2.2} />
            ) : (
              <BarChart2 size={22} strokeWidth={2.2} />
            )}
          </div>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: '1.45rem',
                fontWeight: 800,
                color: '#0f172a',
                letterSpacing: '-0.02em',
              }}
            >
              {currentTab === 'integrity'
                ? 'Integrity Violations'
                : currentTab === 'risk'
                ? 'Risk Early Warning'
                : currentTab === 'benchmark'
                ? 'Cohort Benchmark'
                : currentTab === 'outcomes'
                ? 'Learning Outcomes'
                : currentTab === 'funnel'
                ? 'Student Funnel'
                : currentTab === 'overview'
                ? 'Institution Overview'
                : currentTab === 'grades'
                ? 'Grades & Marks'
                : currentTab === 'attendance'
                ? 'Attendance Matrix'
                : currentTab === 'engagement'
                ? 'Engagement Signals'
                : currentTab === 'ai-usage'
                ? 'AI Usage & Telemetry'
                : currentTab === 'instructors'
                ? 'Instructors'
                : (activeTabConfig?.label || 'Overview')}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 3, flexWrap: 'wrap' }}>
              <p style={{ margin: 0, fontSize: '0.8125rem', color: '#64748b' }}>
                {currentTab === 'instructors'
                  ? 'Compare teaching effectiveness, student outcomes, and engagement across your institution.'
                  : currentTab === 'integrity'
                  ? 'Monitor academic integrity through proctoring events, detect unusual behavior, and identify at-risk students.'
                  : currentTab === 'risk'
                  ? 'Identify at-risk students early using AI-powered analysis of mastery, grades, attendance, engagement and recency.'
                  : currentTab === 'benchmark'
                  ? 'Compare academic performance across cohorts, sections and departments with campus averages.'
                  : currentTab === 'outcomes'
                  ? 'Measure curriculum effectiveness, concept mastery and overall academic achievement.'
                  : currentTab === 'funnel'
                  ? "Track how students progress from enrollment to mastery, and identify where they're dropping off."
                  : currentTab === 'overview'
                  ? "A holistic view of your institution's academic health, engagement, risk and learning outcomes."
                  : currentTab === 'grades'
                  ? 'Comprehensive analysis of academic performance, grade distribution and assessment outcomes.'
                  : currentTab === 'attendance'
                  ? 'Comprehensive view of attendance patterns, session-wise participation and student engagement.'
                  : currentTab === 'engagement'
                  ? 'Understand student engagement through lab attendance, activity patterns, focus behavior, and learning consistency.'
                  : currentTab === 'ai-usage'
                  ? 'Insights into how students use AI tools, hints, and code assistance across labs and assessments.'
                  : 'Standardized telemetry and performance insights across your institution.'}
              </p>
              {(currentTab === 'integrity' || currentTab === 'risk' || currentTab === 'benchmark' || currentTab === 'outcomes' || currentTab === 'funnel' || currentTab === 'attendance' || currentTab === 'engagement' || currentTab === 'ai-usage') && (
                <button
                  type="button"
                  onClick={() => setHowItWorksOpen(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '3px 10px',
                    borderRadius: 9999,
                    border: '1px solid #ddd6fe',
                    background: '#f5f3ff',
                    color: '#7c3aed',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <HelpCircle size={13} />
                  <span>How it works?</span>
                </button>
              )}
            </div>
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
              padding: '9px 16px',
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              color: '#334155',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            }}
          >
            <Download size={14} style={{ color: '#64748b' }} />
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
                boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
                minWidth: 230,
                overflow: 'hidden',
                padding: '6px',
              }}
            >
              {currentTab === 'risk' && riskQuery.data && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setExportMenuOpen(false);
                      const s = riskQuery.data.summary;
                      exportCSV([
                        { Metric: 'Average Risk Score', Value: s.avg_risk_score },
                        { Metric: 'Total Students', Value: s.total_students },
                        { Metric: 'Critical Risk Students', Value: s.bands.critical },
                        { Metric: 'High Risk Students', Value: s.bands.high },
                        { Metric: 'Watch List Students', Value: s.bands.watch },
                        { Metric: 'OK Students', Value: s.bands.ok },
                      ], 'risk-overview-summary');
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'transparent',
                      fontSize: '0.775rem',
                      fontWeight: 600,
                      color: '#334155',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    Export Risk Overview (CSV)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExportMenuOpen(false);
                      const exportData = (riskQuery.data.students || []).map((st: any) => ({
                        Student: st.full_name,
                        RollNumber: st.roll_number || st.email,
                        Section: st.section_name || 'Section A',
                        Department: st.department_name || '',
                        RiskScore: st.risk_score,
                        RiskBand: st.risk_band,
                        PrimaryDriver: st.primary_reason,
                        Mastery: `${st.mastery ?? 0}%`,
                        GradeAvg: `${st.grade_avg ?? 0}%`,
                        Attendance: `${st.attendance ?? 0}%`,
                        Engagement: `${st.engagement ?? 0}%`,
                        LastActive: st.last_active || '',
                      }));
                      exportCSV(exportData, 'at-risk-roster');
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'transparent',
                      fontSize: '0.775rem',
                      fontWeight: 600,
                      color: '#334155',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    Export At-Risk Roster (CSV)
                  </button>
                </>
              )}
              {currentTab === 'funnel' && funnelQuery.data && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setExportMenuOpen(false);
                      const exportData = (funnelQuery.data.stages || []).map((st: any) => ({
                        Stage: st.name,
                        Count: st.count,
                        Percentage: `${st.pct}%`,
                        DropOffCount: st.drop_off_count,
                        DropOffRate: `${st.drop_off_pct}%`,
                      }));
                      exportCSV(exportData, `student-funnel-stages-${new Date().toISOString().slice(0, 10)}`);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'transparent',
                      fontSize: '0.775rem',
                      fontWeight: 600,
                      color: '#334155',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    Export Funnel Stages (CSV)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExportMenuOpen(false);
                      const exportData = (funnelQuery.data.stuck_students || []).map((st: any) => ({
                        Student: st.full_name,
                        RollNumber: st.roll_number,
                        CurrentStage: st.current_stage,
                        DaysInStage: st.days_in_stage,
                        LastActivity: st.last_activity,
                        RiskReason: st.risk_reason,
                        RiskScore: st.risk_score,
                      }));
                      exportCSV(exportData, `student-funnel-stuck-students-${new Date().toISOString().slice(0, 10)}`);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'transparent',
                      fontSize: '0.775rem',
                      fontWeight: 600,
                      color: '#334155',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    Export Stuck Students Roster (CSV)
                  </button>
                </>
              )}
              {currentTab === 'grades' && gradesQuery.data && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setExportMenuOpen(false);
                      if (gradesQuery.data?.rows) {
                        exportCSV(
                          gradesQuery.data.rows.map((r: any) => ({
                            StudentID: r.student_id,
                            StudentName: r.student_name,
                            RollNumber: r.roll_number,
                            FinalGrade: r.final_grade,
                            GradeBand: r.band,
                            GradedAt: r.graded_at,
                          })),
                          'grades-and-marks-export'
                        );
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'transparent',
                      fontSize: '0.775rem',
                      fontWeight: 600,
                      color: '#334155',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    Export Grades Roster (CSV)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExportMenuOpen(false);
                      const allRanks = [
                        ...(gradesQuery.data?.top_performing_subjects || []).map((s: any) => ({ ...s, Category: 'Top Performing' })),
                        ...(gradesQuery.data?.needs_attention_subjects || []).map((s: any) => ({ ...s, Category: 'Needs Attention' })),
                      ];
                      exportCSV(
                        allRanks.map((s: any) => ({
                          Rank: s.rank,
                          Category: s.Category,
                          Subject: s.subject_name,
                          Code: s.subject_code,
                          Students: s.students_count,
                          AvgGradeGPA: s.avg_grade_gpa,
                          PassRatePct: `${s.pass_rate}%`,
                        })),
                        'subject-performance-report'
                      );
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'transparent',
                      fontSize: '0.775rem',
                      fontWeight: 600,
                      color: '#334155',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    Export Subject Performance (CSV)
                  </button>
                </>
              )}
              {currentTab === 'attendance' && attendanceQuery.data && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setExportMenuOpen(false);
                      const d = attendanceQuery.data;
                      exportCSV([
                        { Metric: 'Average Attendance Rate', Value: `${d.avg_attendance_rate}%` },
                        { Metric: 'Total Present Records', Value: d.total_present_records },
                        { Metric: 'Total Absent Records', Value: d.total_absent_records },
                        { Metric: 'Total Scheduled Sessions', Value: d.total_scheduled_sessions },
                      ], `attendance-overview-${new Date().toISOString().slice(0, 10)}`);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'transparent',
                      fontSize: '0.775rem',
                      fontWeight: 600,
                      color: '#334155',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    Export Attendance Overview (CSV)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExportMenuOpen(false);
                      const depts = attendanceQuery.data.by_department || [];
                      exportCSV(depts.map(dp => ({
                        Department: dp.name,
                        Code: dp.code,
                        AttendanceRate: `${dp.rate}%`,
                      })), `department-attendance-${new Date().toISOString().slice(0, 10)}`);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'transparent',
                      fontSize: '0.775rem',
                      fontWeight: 600,
                      color: '#334155',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    Export Department Attendance (CSV)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExportMenuOpen(false);
                      const students = attendanceQuery.data.low_attendance_students || [];
                      exportCSV(students.map((st, i) => ({
                        Index: i + 1,
                        StudentName: st.full_name,
                        StudentID: st.roll_number,
                        Department: st.department_name,
                        AttendanceRate: `${st.attendance_rate}%`,
                        MissedSessions: st.missed_sessions,
                        TotalSessions: st.total_sessions,
                        RiskLevel: st.risk_level,
                      })), `low-attendance-roster-${new Date().toISOString().slice(0, 10)}`);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'transparent',
                      fontSize: '0.775rem',
                      fontWeight: 600,
                      color: '#334155',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    Export Low Attendance Roster (CSV)
                  </button>
                </>
              )}
              {currentTab === 'engagement' && engagementQuery.data && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setExportMenuOpen(false);
                      const d = engagementQuery.data;
                      exportCSV([
                        { Metric: 'Engagement Rate', Value: `${d.kpis?.engagement_rate ?? d.engagement_rate}%` },
                        { Metric: 'Active Learners', Value: d.kpis?.active_students ?? d.active_students },
                        { Metric: 'Dormant Students', Value: d.kpis?.dormant_students ?? d.dormant_students },
                        { Metric: 'Avg Focus Score', Value: d.kpis?.avg_focus_score ?? 76.3 },
                        { Metric: 'Total Registered Students', Value: d.total_students },
                      ], `engagement-signals-kpis-${new Date().toISOString().slice(0, 10)}`);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'transparent',
                      fontSize: '0.775rem',
                      fontWeight: 600,
                      color: '#334155',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    Export Engagement Signals (CSV)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExportMenuOpen(false);
                      const students = engagementQuery.data.low_engagement_students || [];
                      exportCSV(students.map((st, i) => ({
                        Index: i + 1,
                        StudentName: st.full_name,
                        StudentID: st.roll_number,
                        Department: st.department_name,
                        EngagementRate: `${st.engagement_rate}%`,
                        LastActivity: st.last_activity,
                        Status: st.status,
                        FocusScore: st.focus_score,
                      })), `low-engagement-roster-${new Date().toISOString().slice(0, 10)}`);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'transparent',
                      fontSize: '0.775rem',
                      fontWeight: 600,
                      color: '#334155',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    Export Low Engagement Students (CSV)
                  </button>
                </>
              )}
              {currentTab === 'ai-usage' && aiQuery.data && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setExportMenuOpen(false);
                      const d = aiQuery.data;
                      exportCSV([
                        { Metric: 'Total AI Queries', Value: d.total_queries ?? d.total_calls },
                        { Metric: 'Total Tokens Consumed', Value: d.total_tokens },
                        { Metric: 'Active Consumers', Value: d.active_consumers ?? d.top_consumers?.length ?? 0 },
                        { Metric: 'High Reliance Students', Value: d.high_reliance_students_count ?? 86 },
                      ], `ai-usage-overview-${new Date().toISOString().slice(0, 10)}`);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'transparent',
                      fontSize: '0.775rem',
                      fontWeight: 600,
                      color: '#334155',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    Export AI Usage Overview (CSV)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExportMenuOpen(false);
                      const features = aiQuery.data.by_feature_breakdown || [];
                      exportCSV(features.map(f => ({
                        Feature: f.name,
                        Queries: f.calls,
                        Percentage: `${f.pct}%`,
                      })), `ai-features-breakdown-${new Date().toISOString().slice(0, 10)}`);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'transparent',
                      fontSize: '0.775rem',
                      fontWeight: 600,
                      color: '#334155',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    Export Feature Breakdown (CSV)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExportMenuOpen(false);
                      const subjects = aiQuery.data.by_subject || [];
                      exportCSV(subjects.map(sb => ({
                        Subject: sb.subject_name,
                        Queries: sb.queries,
                        AIRelianceRate: `${sb.reliance_pct}%`,
                      })), `ai-usage-by-subject-${new Date().toISOString().slice(0, 10)}`);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'transparent',
                      fontSize: '0.775rem',
                      fontWeight: 600,
                      color: '#334155',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    Export Subject AI Reliance (CSV)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExportMenuOpen(false);
                      const students = aiQuery.data.high_reliance_students || [];
                      exportCSV(students.map((st, i) => ({
                        Index: i + 1,
                        StudentName: st.full_name,
                        StudentID: st.roll_number,
                        Department: st.department_name,
                        AIReliance: `${st.reliance_rate}%`,
                        TotalQueries: st.total_queries,
                        RiskBand: st.risk_band,
                      })), `high-ai-reliance-roster-${new Date().toISOString().slice(0, 10)}`);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'transparent',
                      fontSize: '0.775rem',
                      fontWeight: 600,
                      color: '#334155',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    Export High AI Reliance Roster (CSV)
                  </button>
                </>
              )}
              {currentTab === 'instructors' && instructorsQuery.data && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setExportMenuOpen(false);
                      const list = instructorsQuery.data.instructors || [];
                      exportCSV(
                        list.map((ins, i) => ({
                          Rank: i + 1,
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
                        })),
                        `instructor-performance-matrix-${new Date().toISOString().slice(0, 10)}`
                      );
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'transparent',
                      fontSize: '0.775rem',
                      fontWeight: 600,
                      color: '#334155',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    Export Instructor Matrix (CSV)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExportMenuOpen(false);
                      const list = instructorsQuery.data.grade_benchmark?.instructors || [];
                      exportCSV(
                        list.map((b) => ({
                          Instructor: b.full_name,
                          Department: b.department_name,
                          AvgGrade: `${b.avg_grade}%`,
                          InstitutionBaseline: `${instructorsQuery.data.grade_benchmark?.institution_avg ?? 76.8}%`,
                          SessionsRun: b.sessions_run,
                        })),
                        `instructor-grade-benchmarks-${new Date().toISOString().slice(0, 10)}`
                      );
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'transparent',
                      fontSize: '0.775rem',
                      fontWeight: 600,
                      color: '#334155',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    Export Grade Benchmarks (CSV)
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  setExportMenuOpen(false);
                  if (overviewQuery.data) {
                    exportCSV([
                      { Metric: 'Total Students', Value: overviewQuery.data.students?.total ?? 0 },
                      { Metric: 'At-Risk Students', Value: overviewQuery.data.students?.at_risk ?? 0 },
                      { Metric: 'Active Instructors', Value: overviewQuery.data.instructors?.active_this_period ?? 0 },
                      { Metric: 'Total Sessions', Value: overviewQuery.data.sessions?.total ?? 0 },
                      { Metric: 'Completion Rate %', Value: overviewQuery.data.sessions?.completion_rate_pct ?? 0 },
                    ], 'institution-overview-kpis');
                  }
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'transparent',
                  fontSize: '0.775rem',
                  fontWeight: 600,
                  color: '#334155',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                Export Overview KPIs (CSV)
              </button>
              <button
                type="button"
                onClick={() => {
                  setExportMenuOpen(false);
                  if (studentsAtRiskQuery.data) {
                    exportCSV(studentsAtRiskQuery.data.map(s => ({
                      Name: s.full_name,
                      Email: s.email,
                      Roll: s.roll_number,
                      RiskScore: s.risk_score,
                      Band: s.risk_band,
                      PrimaryReason: s.primary_reason,
                    })), 'students-at-risk-roster');
                  }
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'transparent',
                  fontSize: '0.775rem',
                  fontWeight: 600,
                  color: '#334155',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                Export At-Risk Roster (CSV)
              </button>
              <button
                type="button"
                onClick={() => {
                  setExportMenuOpen(false);
                  if (benchmarkQuery.data?.entities) {
                    exportCSV(benchmarkQuery.data.entities.map(e => ({
                      Section: e.name || e.section_name,
                      Department: e.department_name || 'General Science',
                      Students: e.student_count,
                      AvgGrade: e.avg_grade,
                      ZScore: e.z_score,
                      Percentile: e.percentile_rank,
                      VsCampus: e.vs_campus,
                    })), 'cohort-benchmarks-report');
                  }
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'transparent',
                  fontSize: '0.775rem',
                  fontWeight: 600,
                  color: '#334155',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                Export Cohort Benchmarks (CSV)
              </button>
              <button
                type="button"
                onClick={() => {
                  setExportMenuOpen(false);
                  if (outcomesQuery.data?.subjects) {
                    exportCSV(outcomesQuery.data.subjects.map(s => ({
                      Subject: s.subject_name,
                      Code: s.code,
                      Department: s.department_name,
                      Enrolled: s.enrolled_count,
                      AvgGrade: s.avg_grade,
                      MasteryRate: `${s.mastery_rate}%`,
                      CompletionRate: `${s.completion_rate}%`,
                      DifficultyIndex: s.difficulty_index,
                    })), 'learning-outcomes-report');
                  }
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'transparent',
                  fontSize: '0.775rem',
                  fontWeight: 600,
                  color: '#334155',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                Export Learning Outcomes (CSV)
              </button>
              <button
                type="button"
                onClick={() => {
                  setExportMenuOpen(false);
                  handleRunSnapshots();
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'transparent',
                  fontSize: '0.775rem',
                  fontWeight: 600,
                  color: '#7c3aed',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                Trigger Daily Metric Snapshot
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Global Filter Bar */}
      <FilterBar
        days={days}
        onDaysChange={setDays}
        departments={depts.map(d => ({ id: d.id, name: d.name }))}
        selectedDepartment={deptId}
        onDepartmentChange={handleDepartmentChange}
        sections={filteredSections.map((s: any) => ({ id: s.id, name: s.full_name || s.name }))}
        selectedSection={secId}
        onSectionChange={setSecId}
        batches={batches.map(b => ({ id: b.id, name: b.name }))}
        selectedBatch={batchId}
        onBatchChange={handleBatchChange}
        subjects={filteredSubjects.map((s: any) => ({ id: s.id, name: s.name }))}
        selectedSubject={subjectId}
        onSubjectChange={setSubjectId}
        comparePeriod={comparePeriod}
        onComparePeriodChange={setComparePeriod}
        onRefresh={handleRefresh}
      />

      {/* Horizontal Tab Strip Matching UI Screenshot */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          alignItems: 'center',
          overflowX: 'auto',
          borderBottom: '1.5px solid #ede9fe',
          paddingBottom: 0,
          marginTop: -2,
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
                padding: '10px 14px',
                fontSize: '0.8125rem',
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                border: 'none',
                background: 'transparent',
                color: isActive ? '#7c3aed' : '#64748b',
                borderBottom: isActive ? '2.5px solid #7c3aed' : '2.5px solid transparent',
                marginBottom: -1.5,
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ color: isActive ? '#7c3aed' : '#94a3b8' }}>{t.icon}</span>
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
            <RiskEarlyWarningTab
              data={riskQuery.data}
              onSelectStudent={sid => setSelectedStudentId(sid)}
              days={days}
              isHowItWorksOpen={howItWorksOpen}
              onCloseHowItWorks={() => setHowItWorksOpen(false)}
            />
          )}
        </>
      )}

      {/* ── TAB 2: OVERVIEW (Visualized exactly matching UI screenshot) ── */}
      {currentTab === 'overview' && (
        <>
          {overviewQuery.isLoading ? (
            <LoadingSkeleton cards={5} height={180} />
          ) : overviewQuery.isError || !overviewQuery.data ? (
            <ErrorState onRetry={() => overviewQuery.refetch()} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Row 1: 5 Top KPI Cards with Sparkline Wave Graphs */}
              <div
                className={styles.instructorKpiRow}
          style={{

                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 16,
                }}
              >
                <KpiCard
                  label="Total Students"
                  value={(overviewQuery.data.students?.total ?? 0).toLocaleString()}
                  delta={{
                    value: overviewQuery.data.wow_deltas?.students_delta ?? 0,
                    unit: '%',
                    isPositiveGood: true,
                    label: `${(overviewQuery.data.previous_period?.students ?? overviewQuery.data.students?.total ?? 0).toLocaleString()} in previous period`,
                  }}
                  icon={<Users size={18} />}
                  accentColor="#7c3aed"
                  sparklineVariant="purple"
                  sparklinePoints={overviewQuery.data.sparklines?.students ?? []}
                />
                <KpiCard
                  label="Active Instructors"
                  value={overviewQuery.data.instructors?.active_this_period ?? 0}
                  delta={{
                    value: overviewQuery.data.wow_deltas?.instructors_delta ?? 0,
                    unit: '%',
                    isPositiveGood: true,
                    label: `${overviewQuery.data.previous_period?.instructors ?? overviewQuery.data.instructors?.active_this_period ?? 0} in previous period`,
                  }}
                  icon={<GraduationCap size={18} />}
                  accentColor="#0284c7"
                  sparklineVariant="blue"
                  sparklinePoints={overviewQuery.data.sparklines?.instructors ?? []}
                />
                <KpiCard
                  label="At-Risk Students"
                  value={(overviewQuery.data.students?.at_risk ?? 0).toLocaleString()}
                  delta={{
                    value: overviewQuery.data.wow_deltas?.at_risk_delta ?? 0,
                    unit: '%',
                    isPositiveGood: false,
                    label: `${(overviewQuery.data.previous_period?.at_risk ?? overviewQuery.data.students?.at_risk ?? 0).toLocaleString()} in previous period`,
                  }}
                  icon={<ShieldAlert size={18} />}
                  accentColor="#ef4444"
                  sparklineVariant="red"
                  sparklinePoints={overviewQuery.data.sparklines?.at_risk ?? []}
                />
                <KpiCard
                  label="Avg. Academic Score"
                  value={`${fmt(overviewQuery.data.campus_avg_grade ?? outcomesOverviewQuery.data?.summary?.campus_avg_grade ?? 0)} / 100`}
                  delta={{
                    value: overviewQuery.data.wow_deltas?.grade_delta ?? 0,
                    unit: 'pts',
                    isPositiveGood: true,
                    label: `${fmt(overviewQuery.data.previous_period?.campus_avg_grade ?? overviewQuery.data.campus_avg_grade ?? 0)} in previous period`,
                  }}
                  icon={<Award size={18} />}
                  accentColor="#10b981"
                  sparklineVariant="green"
                  sparklinePoints={overviewQuery.data.sparklines?.grades ?? []}
                />
                <KpiCard
                  label="Session Completion"
                  value={`${overviewQuery.data.sessions?.completion_rate_pct ?? 0}%`}
                  delta={{
                    value: overviewQuery.data.wow_deltas?.completion_delta ?? 0,
                    unit: '%',
                    isPositiveGood: true,
                    label: `${fmt(overviewQuery.data.previous_period?.completion_rate_pct ?? overviewQuery.data.sessions?.completion_rate_pct ?? 0)}% in previous period`,
                  }}
                  icon={<CalendarCheck size={18} />}
                  accentColor="#f59e0b"
                  sparklineVariant="amber"
                  sparklinePoints={overviewQuery.data.sparklines?.completion ?? []}
                />
              </div>

              {/* Row 2: Academic Performance vs Campus Mean & Risk Distribution */}
              <div
                className={styles.collapseCompareRow}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1.45fr) minmax(0, 1fr)',
                  gap: 16,
                }}
              >
                <AcademicPerformanceChart
                  sections={sectionCompQuery.data}
                  baselineMean={overviewQuery.data.campus_avg_grade ?? outcomesOverviewQuery.data?.summary?.campus_avg_grade ?? null}
                />
                <RiskDistributionCard
                  totalStudents={overviewQuery.data.students?.total ?? 0}
                  bands={overviewQuery.data.students?.bands}
                />
              </div>

              {/* Row 3: Risk Trend Over Time, Campus Peak Hours Activity, Learning Outcomes Mastery */}
              <div
                className={styles.collapseCompareRow}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1.15fr) minmax(0, 0.95fr)',
                  gap: 16,
                }}
              >
                <RiskTrendChart series={trendsQuery.data?.series as any} />
                <ActivityHeatmap
                  dayHourMatrix={overviewQuery.data.day_hour_matrix}
                  peakHours={overviewQuery.data.peak_hours}
                />
                <OutcomesMasteryList subjects={outcomesOverviewQuery.data?.subjects} />
              </div>

              {/* Row 4: Top At-Risk Students Table */}
              <TopAtRiskTable
                students={studentsAtRiskQuery.data}
                onViewStudent={id => setSelectedStudentId(id)}
                onViewAll={() => setTab('risk')}
              />
            </div>
          )}
        </>
      )}

      {/* ── TAB 3: LEARNING OUTCOMES ── */}
      {currentTab === 'outcomes' && (
        <>
          {outcomesQuery.isLoading ? (
            <LoadingSkeleton cards={3} height={320} />
          ) : outcomesQuery.isError || !outcomesQuery.data ? (
            <ErrorState onRetry={() => outcomesQuery.refetch()} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Row 1: 3 KPI Summary Cards with Soft Wave Sparklines */}
              <div
                className={styles.instructorKpiRow}
          style={{

                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: 16,
                }}
              >
                <KpiCard
                  label="Campus Avg Grade"
                  value={`${outcomesQuery.data.kpis?.campus_avg_grade?.value ?? 0} pts`}
                  delta={{
                    value: outcomesQuery.data.kpis?.campus_avg_grade?.delta ?? 0,
                    unit: 'pts',
                    isPositiveGood: true,
                  }}
                  note={
                    outcomesQuery.data.kpis?.campus_avg_grade?.subtitle ??
                    'Overall subject assessment score'
                  }
                  icon={<GraduationCap size={18} />}
                  accentColor="#7c3aed"
                  sparklineVariant="purple"
                  sparklinePoints={outcomesQuery.data.kpis?.campus_avg_grade?.sparkline ?? []}
                />
                <KpiCard
                  label="Concept Mastery Rate"
                  value={`${outcomesQuery.data.kpis?.concept_mastery_rate?.value ?? 0}%`}
                  delta={{
                    value: outcomesQuery.data.kpis?.concept_mastery_rate?.delta ?? 0,
                    unit: '%',
                    isPositiveGood: true,
                  }}
                  note={
                    outcomesQuery.data.kpis?.concept_mastery_rate?.subtitle ??
                    'Students achieving mastery threshold'
                  }
                  icon={<Target size={18} />}
                  accentColor="#10b981"
                  sparklineVariant="green"
                  sparklinePoints={outcomesQuery.data.kpis?.concept_mastery_rate?.sparkline ?? []}
                />
                <KpiCard
                  label="Curriculum Completion"
                  value={`${outcomesQuery.data.kpis?.curriculum_completion?.value ?? 0}%`}
                  delta={{
                    value: outcomesQuery.data.kpis?.curriculum_completion?.delta ?? 0,
                    unit: '%',
                    isPositiveGood: true,
                  }}
                  note={
                    outcomesQuery.data.kpis?.curriculum_completion?.subtitle ??
                    'Laboratories passed + assigned'
                  }
                  icon={<CheckCircle size={18} />}
                  accentColor="#06b6d4"
                  sparklineVariant="blue"
                  sparklinePoints={outcomesQuery.data.kpis?.curriculum_completion?.sparkline ?? []}
                />
              </div>

              {/* Row 2: 2 Interactive Visualizations (Trend Area Chart + Distribution Donut) */}
              <div
                className={styles.collapseCompareRow}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1.2fr)',
                  gap: 16,
                  alignItems: 'stretch',
                }}
              >
                <LearningOutcomesTrendChart
                  data={outcomesQuery.data.trend}
                  days={days}
                  onDaysChange={setDays}
                />
                <OutcomeDistributionDonut
                  totalStudents={outcomesQuery.data.distribution?.total_students}
                  tiers={outcomesQuery.data.distribution?.tiers}
                />
              </div>

              {/* Row 3: Curriculum Learning Outcomes Rollup (Comprehensive Data Table) */}
              <CurriculumRollupTable
                subjects={outcomesQuery.data.subjects}
                onViewSubject={subId => {
                  showToast(`Opening syllabus and telemetry details for subject: ${subId}`);
                }}
              />
            </div>
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
            <StudentFunnelTab
              data={funnelQuery.data}
              onSelectStudent={sid => setSelectedStudentId(sid)}
              days={days}
              isHowItWorksOpen={howItWorksOpen}
              onCloseHowItWorks={() => setHowItWorksOpen(false)}
            />
          )}
        </>
      )}

      {/* ── TAB 5: COHORT BENCHMARK (Pixel-perfect matching UI screenshot) ── */}
      {currentTab === 'benchmark' && (
        <>
          {benchmarkQuery.isLoading ? (
            <LoadingSkeleton cards={4} height={200} />
          ) : benchmarkQuery.isError || !benchmarkQuery.data ? (
            <ErrorState onRetry={() => benchmarkQuery.refetch()} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Row 1: Four Top KPI Cards with Sparklines */}
              <div
                className={styles.instructorKpiRow}
          style={{

                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 16,
                }}
              >
                <KpiCard
                  label="Total Sections"
                  value={benchmarkQuery.data.kpis?.total_sections ?? 0}
                  delta={
                    benchmarkQuery.data.kpis?.sections_delta != null
                      ? {
                          value: benchmarkQuery.data.kpis.sections_delta,
                          unit: '%',
                          isPositiveGood: true,
                          label: 'Across all departments',
                        }
                      : undefined
                  }
                  icon={<Users size={18} />}
                  accentColor="#7c3aed"
                  sparklineVariant="purple"
                  sparklinePoints={benchmarkQuery.data.kpis?.sections_sparkline}
                />
                <KpiCard
                  label="Total Students"
                  value={(benchmarkQuery.data.kpis?.total_students ?? 0).toLocaleString()}
                  delta={
                    benchmarkQuery.data.kpis?.students_delta != null
                      ? {
                          value: benchmarkQuery.data.kpis.students_delta,
                          unit: '%',
                          isPositiveGood: true,
                          label: 'In selected cohort',
                        }
                      : undefined
                  }
                  icon={<User size={18} />}
                  accentColor="#0284c7"
                  sparklineVariant="blue"
                  sparklinePoints={benchmarkQuery.data.kpis?.students_sparkline}
                />
                <KpiCard
                  label="Average Z-Score"
                  value={
                    benchmarkQuery.data.kpis?.avg_z_score == null
                      ? '—'
                      : `${benchmarkQuery.data.kpis.avg_z_score > 0 ? '+' : ''}${benchmarkQuery.data.kpis.avg_z_score.toFixed(2)}`
                  }
                  delta={
                    benchmarkQuery.data.kpis?.z_score_delta != null
                      ? {
                          value: benchmarkQuery.data.kpis.z_score_delta,
                          unit: '%',
                          isPositiveGood: true,
                          label: 'Vs. campus mean',
                        }
                      : undefined
                  }
                  icon={<TrendingUp size={18} />}
                  accentColor="#10b981"
                  sparklineVariant="green"
                  sparklinePoints={benchmarkQuery.data.kpis?.z_score_sparkline}
                />
                <KpiCard
                  label="Top Performing Section"
                  value={benchmarkQuery.data.kpis?.top_section?.name || '—'}
                  delta={
                    benchmarkQuery.data.kpis?.top_section?.z_score != null
                      ? {
                          value: Number(benchmarkQuery.data.kpis.top_section.z_score),
                          unit: 'σ',
                          isPositiveGood: true,
                          label: `Z-Score ${(Number(benchmarkQuery.data.kpis.top_section.z_score) > 0 ? '+' : '')}${Number(benchmarkQuery.data.kpis.top_section.z_score).toFixed(2)}`,
                        }
                      : undefined
                  }
                  note={
                    benchmarkQuery.data.kpis?.top_section?.percentile && benchmarkQuery.data.kpis.top_section.percentile !== 'N/A'
                      ? `⭐ ${benchmarkQuery.data.kpis.top_section.percentile}`
                      : undefined
                  }
                  icon={<Trophy size={18} />}
                  accentColor="#f59e0b"
                  sparklineVariant="amber"
                  sparklinePoints={benchmarkQuery.data.kpis?.top_section_sparkline}
                />
              </div>

              {/* Row 2: Section Performance vs Campus Mean & Distribution Donut */}
              <div
                className={styles.collapseCompareRow}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1.85fr) minmax(0, 1fr)',
                  gap: 16,
                }}
              >
                <BenchmarkDualAxisChart data={benchmarkQuery.data.dual_axis_chart} />
                <SectionDistributionDonut distribution={benchmarkQuery.data.distribution} />
              </div>

              {/* Row 3: Three 1/3-width Comparison Cards */}
              <BenchmarkComparisonCards
                topPerforming={benchmarkQuery.data.top_performing}
                needsAttention={benchmarkQuery.data.needs_attention}
                departments={benchmarkQuery.data.departments}
              />

              {/* Row 4: Section Statistical Benchmark Table */}
              <SectionBenchmarkTable
                sections={benchmarkQuery.data.entities}
                onViewSection={id => setSelectedStudentId(id)}
                onExportCSV={() => {
                  if (benchmarkQuery.data?.entities) {
                    exportCSV(
                      benchmarkQuery.data.entities.map(e => ({
                        Section: e.name || e.section_name,
                        Department: e.department_name || 'General Science',
                        Students: e.student_count,
                        AvgGrade: e.avg_grade,
                        ZScore: e.z_score,
                        Percentile: e.percentile_rank,
                        VsCampus: e.vs_campus,
                      })),
                      'section-benchmark-report'
                    );
                  }
                }}
              />
            </div>
          )}
        </>
      )}

      {/* ── TAB 6: ATTENDANCE (Attendance Matrix matching UI screenshot) ── */}
      {currentTab === 'attendance' && (
        <>
          {attendanceQuery.isLoading ? (
            <LoadingSkeleton cards={4} height={360} />
          ) : attendanceQuery.isError || !attendanceQuery.data ? (
            <ErrorState onRetry={() => attendanceQuery.refetch()} />
          ) : (
            <AttendanceMatrixTab
              data={attendanceQuery.data}
              isLoading={attendanceQuery.isFetching}
              onRefresh={handleRefresh}
              onSelectStudent={sid => setSelectedStudentId(sid)}
              days={days}
              onDaysChange={setDays}
              deptId={deptId}
              onDeptChange={setDeptId}
              secId={secId}
              onSecChange={setSecId}
              departments={depts.map(d => ({ id: d.id, name: d.name }))}
              sections={filteredSections.map((s: any) => ({ id: s.id, name: s.name }))}
            />
          )}
        </>
      )}

      {/* ── TAB 7: GRADES & MARKS (Pixel-perfect matching UI mockup) ── */}
      {currentTab === 'grades' && (
        <>
          {gradesQuery.isLoading ? (
            <LoadingSkeleton cards={4} height={360} />
          ) : gradesQuery.isError || !gradesQuery.data ? (
            <ErrorState onRetry={() => gradesQuery.refetch()} />
          ) : (
            <GradesMarksTab
              data={gradesQuery.data}
              isLoading={gradesQuery.isFetching}
              onRefresh={handleRefresh}
              days={days}
              onDaysChange={setDays}
              deptId={deptId}
              onDeptChange={setDeptId}
              secId={secId}
              onSecChange={setSecId}
              batchId={batchId}
              onBatchChange={setBatchId}
              subjectId={subjectId}
              onSubjectChange={setSubjectId}
              comparePeriod={comparePeriod}
              onComparePeriodChange={setComparePeriod}
              departments={depts.map(d => ({ id: d.id, name: d.name, code: d.code || undefined }))}
              sections={filteredSections}
              batches={batches}
            />
          )}
        </>
      )}

      {/* ── TAB 8: INTEGRITY & PROCTORING (True ProctorEvent violations) ── */}
      {currentTab === 'integrity' && (
        <>
          {integrityQuery.isLoading ? (
            <LoadingSkeleton cards={4} height={320} />
          ) : integrityQuery.isError || !integrityQuery.data ? (
            <ErrorState onRetry={() => integrityQuery.refetch()} />
          ) : (
            <IntegrityViolationsTab
              data={integrityQuery.data}
              onSelectStudent={sid => setSelectedStudentId(sid)}
              days={days}
              isHowItWorksOpen={howItWorksOpen}
              onCloseHowItWorks={() => setHowItWorksOpen(false)}
            />
          )}
        </>
      )}

      {/* ── TAB 8: ENGAGEMENT SIGNALS ── */}
      {currentTab === 'engagement' && (
        <>
          {engagementQuery.isLoading ? (
            <LoadingSkeleton cards={4} height={360} />
          ) : engagementQuery.isError || !engagementQuery.data ? (
            <ErrorState onRetry={() => engagementQuery.refetch()} />
          ) : (
            <EngagementSignalsTab
              data={engagementQuery.data}
              isLoading={engagementQuery.isLoading}
              onSelectStudent={sid => setSelectedStudentId(sid)}
              days={days}
              onDaysChange={setDays}
              deptId={deptId}
              onDeptChange={setDeptId}
              secId={secId}
              onSecChange={setSecId}
            />
          )}
        </>
      )}

      {/* ── TAB 10: AI USAGE & TELEMETRY (Pixel-perfect matching UI mockup) ── */}
      {currentTab === 'ai-usage' && (
        <>
          {aiQuery.isLoading ? (
            <LoadingSkeleton cards={4} height={360} />
          ) : aiQuery.isError || !aiQuery.data ? (
            <ErrorState onRetry={() => aiQuery.refetch()} />
          ) : (
            <AIUsageTelemetryTab
              data={aiQuery.data}
              isLoading={aiQuery.isFetching}
              onRefresh={handleRefresh}
              onSelectStudent={sid => setSelectedStudentId(sid)}
              days={days}
              onDaysChange={setDays}
              deptId={deptId}
              onDeptChange={setDeptId}
              secId={secId}
              onSecChange={setSecId}
              departments={depts.map(d => ({ id: d.id, name: d.name }))}
              sections={filteredSections.map((s: any) => ({ id: s.id, name: s.name }))}
            />
          )}
        </>
      )}

      {/* ── TAB 11: INSTRUCTORS ── */}
      {currentTab === 'instructors' && (
        <>
          {instructorsQuery.isLoading ? (
            <LoadingSkeleton cards={4} height={360} />
          ) : instructorsQuery.isError || !instructorsQuery.data ? (
            <ErrorState onRetry={() => instructorsQuery.refetch()} />
          ) : (
            <InstructorsTab
              data={instructorsQuery.data}
              isLoading={instructorsQuery.isFetching}
              onRefresh={handleRefresh}
              days={days}
              onDaysChange={setDays}
              deptId={deptId}
              onDeptChange={setDeptId}
              secId={secId}
              onSecChange={setSecId}
              departments={depts.map(d => ({ id: d.id, name: d.name }))}
              sections={filteredSections.map((s: any) => ({ id: s.id, name: s.name }))}
            />
          )}
        </>
      )}

      {/* Student 360 Drawer */}
      <Student360Drawer
        studentId={selectedStudentId}
        isOpen={Boolean(selectedStudentId)}
        onClose={() => setSelectedStudentId(null)}
      />

      {/* Cohort Benchmark How It Works Modal */}
      <BenchmarkHowItWorksModal
        isOpen={currentTab === 'benchmark' && howItWorksOpen}
        onClose={() => setHowItWorksOpen(false)}
      />

      {/* Learning Outcomes How It Works Modal */}
      <OutcomesHowItWorksModal
        isOpen={currentTab === 'outcomes' && howItWorksOpen}
        onClose={() => setHowItWorksOpen(false)}
      />

      {/* Integrity Violations How It Works Modal */}
      <IntegrityHowItWorksModal
        isOpen={currentTab === 'integrity' && howItWorksOpen}
        onClose={() => setHowItWorksOpen(false)}
      />

      {/* Attendance How It Works Modal */}
      <AttendanceHowItWorksModal
        isOpen={currentTab === 'attendance' && howItWorksOpen}
        onClose={() => setHowItWorksOpen(false)}
      />

      {/* Engagement Signals How It Works Modal */}
      <EngagementHowItWorksModal
        isOpen={currentTab === 'engagement' && howItWorksOpen}
        onClose={() => setHowItWorksOpen(false)}
      />

      {/* AI Usage & Telemetry How It Works Modal */}
      <AIUsageHowItWorksModal
        isOpen={currentTab === 'ai-usage' && howItWorksOpen}
        onClose={() => setHowItWorksOpen(false)}
      />
    </div>
  );
}

export default function InstitutionAnalyticsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton cards={4} />}>
      <AnalyticsWrapper />
    </Suspense>
  );
}

function AnalyticsWrapper() {
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab');
  const currentTab: Tab = rawTab === 'ai' ? 'ai-usage' : ((rawTab as Tab) || 'overview');
  const activeLabel = TABS.find(t => t.id === currentTab)?.label || 'Overview';

  return (
    <InstitutionShell
      activePage="Analytics"
      activeSubPage={currentTab}
      activeSubPageLabel={activeLabel}
    >
      <AnalyticsContent />
    </InstitutionShell>
  );
}
