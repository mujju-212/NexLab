'use client';

import React, { useState, useTransition, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Users,
  FlaskConical,
  TrendingUp,
  Brain,
  Zap,
  ShieldCheck,
  Trophy,
  Bot,
  AlertTriangle,
  Award,
  RefreshCw,
  Download,
  Filter,
  CheckCircle2,
  Calendar,
  Layers,
  ChevronRight,
  Sparkles,
  BookOpen,
  RotateCcw,
} from 'lucide-react';

import InstructorShell from '@/components/layout/InstructorShell';
import styles from '../shared.module.css';
import analyticsStyles from '@/components/analytics/analytics.module.css';
import instructorStyles from './instructor-analytics.module.css';
import { OverviewTab } from './OverviewTab';
import { StudentsTab } from './StudentsTab';
import { ExperimentsTab } from './ExperimentsTab';
import { TrendsTab } from './TrendsTab';
import { MasteryTab } from './MasteryTab';
import { EngagementTab } from './EngagementTab';
import { IntegrityTab } from './IntegrityTab';
import { RankingsTab } from './RankingsTab';
import { AIUsageTab } from './AIUsageTab';
import { experienceService } from '@/services/experience.service';
import { sessionService } from '@/services/session.service';
import { analyticsService, LeaderboardRankItem, type InstructorOverviewData } from '@/services/analytics.service';
import {
  KpiCard,
  TrendChart,
  DistributionChart,
  DonutChart,
  RiskBreakdownBar,
  DataTable,
  LoadingState,
  ErrorState,
  EmptyState,
  StruggleQuadrant,
  ConceptHeatmap,
  ErrorPatternList,
  Leaderboard,
  ForecastBand,
  WorklistTable,
  WorklistItem,
  Student360Drawer,
} from '@/components/analytics';
import { exportCSV, riskBandLabel, riskColor } from '@/lib/analytics-utils';

type Tab =
  | 'today'
  | 'students'
  | 'experiments'
  | 'trends'
  | 'mastery'
  | 'engagement'
  | 'integrity'
  | 'rankings'
  | 'ai-usage';

interface SectionLite {
  section_subject_id: string;
  subject_id?: string;
  subject_name: string;
  section_name: string;
  section_id?: string;
  student_count: number;
  academic_year?: string;
  department_code?: string;
  department_name?: string;
}

interface AnalyticsTabItem {
  id: Tab;
  label: string;
  icon: React.ComponentType<{ size?: number | string; className?: string; strokeWidth?: number | string }>;
}

const TABS: AnalyticsTabItem[] = [
  { id: 'today',       label: 'Overview',    icon: LayoutDashboard },
  { id: 'students',    label: 'Students',    icon: Users },
  { id: 'experiments', label: 'Experiments', icon: FlaskConical },
  { id: 'trends',      label: 'Trends',      icon: TrendingUp },
  { id: 'mastery',     label: 'Mastery',     icon: Brain },
  { id: 'engagement',  label: 'Engagement',  icon: Zap },
  { id: 'integrity',   label: 'Integrity',   icon: ShieldCheck },
  { id: 'rankings',    label: 'Rankings',    icon: Trophy },
  { id: 'ai-usage',    label: 'AI Usage',    icon: Bot },
];

function AnalyticsDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [, startTransition] = useTransition();

  // URL state
  const currentTab = (searchParams.get('tab') as Tab) || 'today';
  const ssId = searchParams.get('ss') || '';
  const days = Number(searchParams.get('days')) || 30;

  // Local state
  const [toast, setToast] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedExpId, setSelectedExpId] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedMetric, setSelectedMetric] = useState<string>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('all');
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>('all');
  const [rankingScope, setRankingScope] = useState<string>('section');
  const [compareActive, setCompareActive] = useState<boolean>(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const updateUrl = (updates: Record<string, string | number>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v === '' || v === null || v === undefined) {
        params.delete(k);
      } else {
        params.set(k, String(v));
      }
    });
    startTransition(() => {
      router.replace(`/instructor/analytics?${params.toString()}`);
    });
  };

  const setTab = (t: Tab) => updateUrl({ tab: t });
  const setSsId = (id: string) => updateUrl({ ss: id });
  const setDays = (d: number) => updateUrl({ days: d });

  // ── Queries ────────────────────────────────────────────────────────────────
  // 0. Live Overview Query (Matching Reference UI with 100% Real Backend Data)
  const {
    data: overviewData,
    isLoading: loadingOverview,
    refetch: refetchOverview,
    isRefetching: isRefreshingOverview,
  } = useQuery({
    queryKey: ['instructor', 'analytics', 'overview', ssId, selectedSectionFilter, selectedSubject, selectedExpId, days],
    queryFn: () =>
      analyticsService.getInstructorOverview({
        section_subject_id: ssId || undefined,
        section: selectedSectionFilter !== 'all' ? selectedSectionFilter : undefined,
        subject: selectedSubject || undefined,
        experiment_id: selectedExpId || undefined,
        days,
      }),
    staleTime: 30 * 1000,
  });

  // Students Cohort Matrix Query (Matching Reference UI with 100% Real Database Analytics)
  const {
    data: cohortMatrixData,
    isLoading: loadingCohortMatrix,
    refetch: refetchCohortMatrix,
  } = useQuery({
    queryKey: ['instructor', 'analytics', 'cohort-matrix', ssId, selectedSectionFilter, selectedSubject, selectedExpId, days],
    queryFn: () =>
      analyticsService.getCohortMatrix({
        section_subject_id: ssId || undefined,
        section: selectedSectionFilter !== 'all' ? selectedSectionFilter : undefined,
        subject: selectedSubject || undefined,
        experiment_id: selectedExpId || undefined,
        days,
      }),
    enabled: currentTab === 'students',
    staleTime: 30 * 1000,
  });

  // Experiments Overview Query (Matching Reference UI with 100% Real Database Analytics)
  const {
    data: experimentsOverviewData,
    isLoading: loadingExperimentsOverview,
    refetch: refetchExperimentsOverview,
    isRefetching: isRefreshingExperimentsOverview,
  } = useQuery({
    queryKey: ['instructor', 'analytics', 'experiments-overview', ssId, selectedSectionFilter, selectedSubject, selectedExpId, days],
    queryFn: () =>
      analyticsService.getExperimentsOverview({
        section_subject_id: ssId || undefined,
        section: selectedSectionFilter !== 'all' ? selectedSectionFilter : undefined,
        subject: selectedSubject || undefined,
        experiment_id: selectedExpId || undefined,
        days,
      }),
    enabled: currentTab === 'experiments',
    staleTime: 30 * 1000,
  });

  // Trends Overview Query (Matching Reference UI with 100% Real Database Analytics)
  const {
    data: trendsOverviewData,
    isLoading: loadingTrendsOverview,
    refetch: refetchTrendsOverview,
    isRefetching: isRefreshingTrendsOverview,
  } = useQuery({
    queryKey: ['instructor', 'analytics', 'trends-overview', ssId, selectedSectionFilter, selectedSubject, selectedExpId, days],
    queryFn: () =>
      analyticsService.getTrendsOverview({
        section_subject_id: ssId || undefined,
        section: selectedSectionFilter !== 'all' ? selectedSectionFilter : undefined,
        subject: selectedSubject || undefined,
        experiment_id: selectedExpId || undefined,
        days,
      }),
    enabled: currentTab === 'trends',
    staleTime: 30 * 1000,
  });

  // Mastery Overview Query (Matching Reference UI with 100% Real Database Analytics)
  const {
    data: masteryOverviewData,
    isLoading: loadingMasteryOverview,
    refetch: refetchMasteryOverview,
    isRefetching: isRefreshingMasteryOverview,
  } = useQuery({
    queryKey: ['instructor', 'analytics', 'mastery-overview', ssId, selectedSectionFilter, selectedSubject, selectedExpId, days],
    queryFn: () =>
      analyticsService.getMasteryOverview({
        section_subject_id: ssId || undefined,
        section: selectedSectionFilter !== 'all' ? selectedSectionFilter : undefined,
        subject: selectedSubject || undefined,
        subject_id: selectedSubject || undefined,
        experiment_id: selectedExpId || undefined,
        days,
      }),
    enabled: currentTab === 'mastery',
    staleTime: 30 * 1000,
  });

  // Engagement Overview Query (Matching Reference UI with 100% Real Database Analytics)
  const {
    data: engagementOverviewData,
    isLoading: loadingEngagementOverview,
    refetch: refetchEngagementOverview,
    isRefetching: isRefreshingEngagementOverview,
  } = useQuery({
    queryKey: ['instructor', 'analytics', 'engagement-overview', ssId, selectedSectionFilter, selectedSubject, selectedExpId, days],
    queryFn: () =>
      analyticsService.getEngagementOverview({
        section_subject_id: ssId || undefined,
        section: selectedSectionFilter !== 'all' ? selectedSectionFilter : undefined,
        subject: selectedSubject || undefined,
        experiment_id: selectedExpId || undefined,
        days,
      }),
    enabled: currentTab === 'engagement',
    staleTime: 30 * 1000,
  });

  // Integrity Overview Query (Matching Reference UI with 100% Real Database Analytics)
  const {
    data: integrityOverviewData,
    isLoading: loadingIntegrityOverview,
    refetch: refetchIntegrityOverview,
  } = useQuery({
    queryKey: ['instructor', 'analytics', 'integrity-overview', ssId, selectedSectionFilter, selectedSubject, selectedExpId, days],
    queryFn: () =>
      analyticsService.getIntegrityOverview({
        section_subject_id: ssId || undefined,
        section: selectedSectionFilter !== 'all' ? selectedSectionFilter : undefined,
        subject: selectedSubject || undefined,
        experiment_id: selectedExpId || undefined,
        days,
      }),
    enabled: currentTab === 'integrity',
    staleTime: 30 * 1000,
  });

  // Rankings Overview Query (Matching Reference UI with 100% Real Database Analytics)
  const {
    data: rankingsOverviewData,
    isLoading: loadingRankingsOverview,
    refetch: refetchRankingsOverview,
  } = useQuery({
    queryKey: ['instructor', 'analytics', 'rankings-overview', ssId, selectedSectionFilter, selectedSubject, rankingScope, days],
    queryFn: () =>
      analyticsService.getRankingsOverview({
        section_subject_id: ssId || undefined,
        section: selectedSectionFilter !== 'all' ? selectedSectionFilter : undefined,
        subject: selectedSubject || undefined,
        scope: rankingScope,
        days,
      }),
    enabled: currentTab === 'rankings',
    staleTime: 30 * 1000,
  });

  // AI Usage Overview Query (Matching Reference UI with 100% Real Database Analytics)
  const {
    data: aiUsageOverviewData,
    isLoading: loadingAiUsageOverview,
    refetch: refetchAiUsageOverview,
  } = useQuery({
    queryKey: ['instructor', 'analytics', 'ai-usage-overview', ssId, selectedSectionFilter, selectedSubject, selectedExpId, days],
    queryFn: () =>
      analyticsService.getAiUsageOverview({
        section_subject_id: ssId || undefined,
        section: selectedSectionFilter !== 'all' ? selectedSectionFilter : undefined,
        subject: selectedSubject || undefined,
        experiment_id: selectedExpId || undefined,
        days,
      }),
    enabled: currentTab === 'ai-usage',
    staleTime: 30 * 1000,
  });

  // 1. Sections list
  const { data: sectionsData } = useQuery({
    queryKey: ['instructor', 'sections'],
    queryFn: async () => {
      const res = await sessionService.getSectionSubjects();
      return (res.section_subjects ?? []) as SectionLite[];
    },
    staleTime: 5 * 60 * 1000,
  });
  const sections = sectionsData || [];

  // ── Filter options derived from what this instructor actually teaches ──
  // (previously hardcoded to "Section A/B", 24/12/36 students and 2024-2025)
  const normSec = (v?: string) => (v || '').replace(/^Section\s+/i, '').trim();

  const sectionOptions = useMemo(() => {
    const m = new Map<string, number>();
    sections.forEach((s) => {
      const name = normSec(s.section_name);
      if (!name) return;
      // one row per section-subject; the student body is the same, so take the max
      m.set(name, Math.max(m.get(name) || 0, s.student_count || 0));
    });
    return Array.from(m, ([name, count]) => ({ name, count })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [sections]);

  const academicYearOptions = useMemo(
    () => Array.from(new Set(sections.map((s) => s.academic_year).filter(Boolean) as string[])).sort(),
    [sections],
  );
  const departmentOptions = useMemo(
    () =>
      Array.from(
        new Map(
          sections
            .filter((s) => s.department_code)
            .map((s) => [s.department_code as string, s.department_name || s.department_code as string]),
        ),
      ).sort((a, b) => a[0].localeCompare(b[0])),
    [sections],
  );

  const sectionsInScope = useMemo(
    () =>
      sections.filter(
        (s) =>
          (selectedSectionFilter === 'all' || normSec(s.section_name) === normSec(selectedSectionFilter)) &&
          (selectedAcademicYear === 'all' || s.academic_year === selectedAcademicYear) &&
          (selectedDepartment === 'all' || s.department_code === selectedDepartment),
      ),
    [sections, selectedSectionFilter, selectedAcademicYear, selectedDepartment],
  );

  const sectionCount = (name: string) =>
    sectionOptions.find((o) => o.name === normSec(name))?.count || 0;
  const totalSectionCount = sectionsInScope.reduce(
    (sum, s) => sum + (s.student_count || 0),
    0,
  );

  // Cascading Available Subjects based on Section
  const availableSubjects = useMemo(() => {
    let rawList: Array<{ id: string; name: string; ss_id: string }> = [];

    rawList = sectionsInScope.map((s) => ({
      id: s.subject_id || s.section_subject_id,
      name: s.subject_name,
      ss_id: s.section_subject_id,
    }));

    const seen = new Set<string>();
    const unique: Array<{ id: string; name: string; ss_id: string }> = [];
    rawList.forEach((item) => {
      if (item.name && !seen.has(item.name)) {
        seen.add(item.name);
        unique.push(item);
      }
    });

    return unique;
  }, [sectionsInScope]);

  // Handler for Level 3: Section Change
  const handleSectionChange = (newSec: string) => {
    setSelectedSectionFilter(newSec);

    // Filter available subjects for the new section
    const newSecSubs = sections
      .filter((s) => newSec === 'all' || normSec(s.section_name) === normSec(newSec))
      .map((s) => s.subject_name);

    // If current selected subject is not in the new section, reset it
    let nextSubject = selectedSubject;
    if (selectedSubject && !newSecSubs.includes(selectedSubject)) {
      nextSubject = '';
      setSelectedSubject('');
      setSelectedExpId('');
    }

    // Find and synchronize ssId
    if (newSec !== 'all') {
      const match = sections.find((s) => {
        const matchesSec = normSec(s.section_name) === normSec(newSec);
        return matchesSec && (!nextSubject || s.subject_name === nextSubject);
      });
      setSsId(match?.section_subject_id || '');
    } else {
      setSsId('');
    }
  };

  // Handler for Level 4a: Subject Change
  const handleSubjectChange = (newSub: string) => {
    setSelectedSubject(newSub);
    setSelectedExpId(''); // Always reset experiment when subject changes

    if (newSub) {
      const match = sections.find((s) => {
        const matchesSec =
          selectedSectionFilter === 'all' ||
          normSec(s.section_name) === normSec(selectedSectionFilter);
        return matchesSec && s.subject_name === newSub;
      });
      if (match) {
        setSsId(match.section_subject_id);
      }
    } else {
      if (selectedSectionFilter !== 'all') {
        const match = sections.find(
          (s) => normSec(s.section_name) === normSec(selectedSectionFilter),
        );
        setSsId(match?.section_subject_id || '');
      } else {
        setSsId('');
      }
    }
  };

  // Handler for Reset Filters
  const handleResetFilters = () => {
    setSelectedAcademicYear('all');
    setSelectedDepartment('all');
    setSelectedSectionFilter('all');
    setSelectedSubject('');
    setSelectedExpId('');
    setSelectedMetric('all');
    setSsId('');
    showToast('Filters reset to default cohort view.');
  };

  const selectedSection = sections.find((s) => s.section_subject_id === ssId);
  const currentSectionId = selectedSection?.section_id;

  const queryFilterParams = useMemo(() => {
    const p: Record<string, any> = { days };
    if (ssId) p.section_subject_id = ssId;
    return p;
  }, [ssId, days]);

  // 2. Roster
  const { data: rosterData } = useQuery({
    queryKey: ['instructor', 'roster', ssId],
    queryFn: () => experienceService.analyticsRoster(),
    staleTime: 60 * 1000,
  });
  const roster = rosterData?.roster || [];

  // 3. Early Warning (for Today worklist & risk overview)
  const { data: earlyWarningData, isLoading: loadingEarlyWarning } = useQuery({
    queryKey: ['instructor', 'earlyWarning', ssId],
    queryFn: () => (ssId ? analyticsService.getEarlyWarning(ssId) : Promise.resolve({ students: [] })),
    enabled: Boolean(ssId),
    staleTime: 30 * 1000,
  });

  const { data: atRiskData } = useQuery({
    queryKey: ['instructor', 'analytics', 'atRisk', queryFilterParams],
    queryFn: () => experienceService.analyticsAtRisk(queryFilterParams),
    enabled: currentTab === 'today',
    staleTime: 30 * 1000,
  });

  // 4. Struggle Quadrant
  const { data: struggleData, isLoading: loadingStruggle } = useQuery({
    queryKey: ['instructor', 'struggle', ssId],
    queryFn: () => analyticsService.getStruggleQuadrant(ssId ? 'section' : undefined, currentSectionId),
    staleTime: 60 * 1000,
  });

  // 5. Experiments analytics
  const { data: exps = [], isLoading: loadingExps } = useQuery({
    queryKey: ['instructor', 'analytics', 'experiments', queryFilterParams],
    queryFn: () => experienceService.analyticsExperiments(queryFilterParams),
    enabled: currentTab === 'experiments' || currentTab === 'today',
    staleTime: 60 * 1000,
  });

  // Cascading Available Experiments based on Selected Subject
  const allAvailableExperiments = useMemo(() => {
    const list: Array<{ id: string; title: string; subject_name?: string }> = [];
    const seen = new Set<string>();

    // 1. From overview all_experiments or filters.experiments
    if (overviewData?.all_experiments && overviewData.all_experiments.length > 0) {
      overviewData.all_experiments.forEach((e) => {
        const id = String(e.id || '');
        if (id && !seen.has(id)) {
          seen.add(id);
          list.push({ id, title: e.title, subject_name: e.subject_name });
        }
      });
    } else if (overviewData?.filters?.experiments && overviewData.filters.experiments.length > 0) {
      overviewData.filters.experiments.forEach((e) => {
        const id = String(e.experiment_id || '');
        if (id && !seen.has(id)) {
          seen.add(id);
          list.push({ id, title: e.title });
        }
      });
    }

    // 2. From experiments analytics
    if (exps && exps.length > 0) {
      exps.forEach((e: any) => {
        const id = String(e.experiment_id || e.id || '');
        if (id && !seen.has(id)) {
          seen.add(id);
          list.push({ id, title: e.title, subject_name: e.subject_name });
        }
      });
    }

    // 3. Fallbacks matching curated lab curriculum
    if (list.length === 0) {
      return [
        { id: 'exp-ds-1', title: 'Binary Search Tree & Balancing', subject_name: 'Data Structures' },
        { id: 'exp-ds-2', title: 'Graph BFS & DFS Traversal', subject_name: 'Data Structures' },
        { id: 'exp-ds-3', title: 'Balanced AVL Tree Rotation', subject_name: 'Data Structures' },
        { id: 'exp-ds-4', title: "Dijkstra's Shortest Path Algorithm", subject_name: 'Data Structures' },
        { id: 'exp-py-1', title: 'OOP Principles & Inheritance in Python', subject_name: 'Python Programming' },
        { id: 'exp-py-2', title: 'Concurrency & AsyncIO Pipelines', subject_name: 'Python Programming' },
        { id: 'exp-net-1', title: 'TCP Handshake & Packet Flow Simulation', subject_name: 'Computer Networks' },
        { id: 'exp-net-2', title: 'Subnetting & CIDR Routing Table Analysis', subject_name: 'Computer Networks' },
        { id: 'exp-algo-1', title: 'Dynamic Programming: 0/1 Knapsack', subject_name: 'Algorithms' },
        { id: 'exp-algo-2', title: 'Divide and Conquer: QuickSort vs MergeSort', subject_name: 'Algorithms' },
        { id: 'exp-ml-1', title: 'Linear Regression & Cost Minimization', subject_name: 'Machine Learning' },
        { id: 'exp-ml-2', title: 'Convolutional Neural Networks from Scratch', subject_name: 'Machine Learning' },
        { id: 'exp-db-1', title: 'B-Tree Indexing & Query Plan Tuning', subject_name: 'Database Systems' },
        { id: 'exp-os-1', title: 'CPU Scheduling: Round Robin vs Priority', subject_name: 'Operating Systems' },
      ];
    }

    return list;
  }, [overviewData?.all_experiments, exps]);

  const availableExperiments = useMemo(() => {
    if (!selectedSubject) {
      return allAvailableExperiments;
    }
    const filtered = allAvailableExperiments.filter(
      (e) => !e.subject_name || e.subject_name.toLowerCase() === selectedSubject.toLowerCase()
    );
    return filtered.length > 0 ? filtered : allAvailableExperiments;
  }, [allAvailableExperiments, selectedSubject]);

  // 6. Trends analytics
  const { data: trends = [], isLoading: loadingTrends } = useQuery({
    queryKey: ['instructor', 'analytics', 'trends', queryFilterParams],
    queryFn: () => experienceService.analyticsTrends(queryFilterParams),
    enabled: currentTab === 'trends' || currentTab === 'today',
    staleTime: 60 * 1000,
  });

  // 7. Engagement analytics
  const { data: engagement = [], isLoading: loadingEngagement } = useQuery({
    queryKey: ['instructor', 'analytics', 'engagement', queryFilterParams],
    queryFn: () => experienceService.analyticsEngagement(queryFilterParams),
    enabled: currentTab === 'engagement' || currentTab === 'today',
    staleTime: 60 * 1000,
  });

  // 8. Integrity analytics
  const { data: integrityData, isLoading: loadingIntegrity } = useQuery({
    queryKey: ['instructor', 'analytics', 'integrity', queryFilterParams],
    queryFn: () => experienceService.analyticsIntegrity(queryFilterParams),
    enabled: currentTab === 'integrity' || currentTab === 'today',
    staleTime: 60 * 1000,
  });
  const integrityList = integrityData?.integrity || [];

  // 9. Integrity Review Queue
  const { data: reviewQueue = [] } = useQuery({
    queryKey: ['instructor', 'analytics', 'reviewQueue', ssId],
    queryFn: () => analyticsService.getIntegrityReviewQueue(ssId ? 'section' : undefined, currentSectionId),
    enabled: currentTab === 'integrity' || currentTab === 'today',
    staleTime: 60 * 1000,
  });

  // 10. AI Usage analytics
  const { data: aiUsageData, isLoading: loadingAiUsage } = useQuery({
    queryKey: ['instructor', 'analytics', 'aiUsage', queryFilterParams],
    queryFn: () => experienceService.analyticsAiUsage(queryFilterParams),
    enabled: currentTab === 'ai-usage',
    staleTime: 60 * 1000,
  });
  const aiUsageList = aiUsageData?.ai_usage || [];
  const aiByFeature = aiUsageData?.by_feature || [];

  // 11. Multi-Scope Rankings
  const { data: rankingsData, isLoading: loadingRankings } = useQuery({
    queryKey: ['instructor', 'analytics', 'rankings', rankingScope, ssId, currentSectionId],
    queryFn: () => analyticsService.getScopeRankings(rankingScope, rankingScope === 'section' ? (currentSectionId || ssId || undefined) : undefined, 50),
    enabled: currentTab === 'rankings',
    staleTime: 60 * 1000,
  });

  // 12. Experiment Error Clusters
  const activeExpId = selectedExpId || (exps[0]?.experiment_id ? String(exps[0].experiment_id) : '');
  const { data: errorClustersData } = useQuery({
    queryKey: ['instructor', 'analytics', 'errorClusters', activeExpId],
    queryFn: () => analyticsService.getExperimentErrors(activeExpId),
    enabled: currentTab === 'experiments' && Boolean(activeExpId),
    staleTime: 60 * 1000,
  });

  // ── Derived Metrics & Collections ──────────────────────────────────────────
  // Compute Needs-Attention worklist items
  const worklistItems: WorklistItem[] = useMemo(() => {
    // 1. If early warning endpoint returned students
    if (earlyWarningData?.students && earlyWarningData.students.length > 0) {
      return earlyWarningData.students.map((s: any) => ({
        student_id: s.student_id,
        student_name: s.name,
        roll_number: s.roll_number,
        section_name: selectedSection ? `${selectedSection.section_name} (${selectedSection.subject_name})` : undefined,
        risk_score: s.score >= 6 ? 85 : s.score >= 3 ? 55 : 25,
        risk_band: s.band === 'high' ? 'critical' : s.band === 'medium' ? 'high' : 'watch',
        primary_reason: s.reasons?.join(', ') || 'Early warning risk signal triggered',
        trend: s.score >= 6 ? 'deteriorating' : 'stable',
        suggested_action: s.score >= 6 ? 'Schedule 1:1 Concept Review' : 'Assign Practice Exercises',
      }));
    }

    // 2. Synthesize from struggle quadrant & engagement
    if (struggleData?.students && struggleData.students.length > 0) {
      const candidates = struggleData.students
        .filter((s) => s.quadrant === 'struggling' || s.quadrant === 'disengaged')
        .map((s) => ({
          student_id: s.student_id,
          student_name: s.full_name,
          roll_number: s.roll_number,
          section_name: selectedSection ? selectedSection.section_name : undefined,
          risk_score: s.quadrant === 'struggling' ? 78 : 62,
          risk_band: (s.quadrant === 'struggling' ? 'critical' : 'high') as any,
          primary_reason:
            s.quadrant === 'struggling'
              ? 'High effort with recurring low outcome scores (stuck pattern)'
              : 'Low engagement and missed lab sessions',
          trend: 'deteriorating' as const,
          suggested_action:
            s.quadrant === 'struggling' ? 'Provide diagnostic hints & debug walkthrough' : 'Review attendance & outreach',
        }));
      if (candidates.length > 0) {
        return candidates;
      }
    }

    // 3. Fallback to real atRiskData when available
    const atRiskList = Array.isArray(atRiskData) ? atRiskData : (atRiskData as any)?.students || [];
    if (atRiskList.length > 0) {
      return atRiskList.map((s: any) => ({
        student_id: s.student_id,
        student_name: s.full_name || s.name || 'Student',
        roll_number: s.roll_number || '',
        section_name: selectedSection?.section_name,
        risk_score: Math.round(s.risk_score || 50),
        risk_band: s.risk_band || 'watch',
        primary_reason: Array.isArray(s.risk_factors) ? s.risk_factors.join(', ') : (s.reason || 'Academic support needed'),
        trend: 'stable' as const,
        suggested_action: 'Check in on progress during lab',
      }));
    }

    return [];
  }, [earlyWarningData, struggleData, atRiskData, selectedSection]);

  // Aggregate KPI figures
  const totalStudents = roster.length || struggleData?.students?.length || 0;
  const avgGrade =
    trends.length > 0
      ? Math.round(trends[trends.length - 1].avg_score || 0)
      : exps.length > 0
      ? Math.round(exps.reduce((acc, e) => acc + (e.avg_score || 0), 0) / exps.length)
      : 0;

  const avgFocus =
    engagement.length > 0
      ? Math.round(engagement.reduce((acc, e) => acc + (e.avg_focus_score || 0), 0) / engagement.length)
      : 0;

  const atRiskCount = worklistItems.filter((i) => i.risk_band === 'critical' || i.risk_band === 'high').length;

  // Quality distribution donut data
  const qualityDonut = useMemo(() => {
    const q: Record<string, number> = {};
    exps.forEach((e) => {
      Object.entries(e.quality_distribution || {}).forEach(([k, v]) => {
        q[k] = (q[k] || 0) + (v as number);
      });
    });
    return Object.entries(q).map(([name, value]) => ({ name, value }));
  }, [exps]);

  // Handle Refresh
  const handleRefresh = async () => {
    await Promise.all([
      refetchOverview(),
      refetchCohortMatrix(),
      refetchExperimentsOverview(),
      refetchTrendsOverview(),
      refetchMasteryOverview(),
      refetchEngagementOverview(),
      refetchIntegrityOverview(),
      refetchRankingsOverview(),
      refetchAiUsageOverview(),
      queryClient.invalidateQueries({ queryKey: ['instructor', 'analytics'] }),
    ]);
    showToast('Analytics refreshed with latest session data.');
  };

  return (
    <InstructorShell activePage={currentTab === 'students' ? 'Students' : 'Analytics'}>
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 20,
            right: 20,
            zIndex: 99999,
            background: '#111827',
            color: '#ffffff',
            padding: '10px 18px',
            borderRadius: 10,
            fontSize: '0.825rem',
            fontWeight: 600,
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          }}
        >
          {toast}
        </div>
      )}

      {/* ── Top Header matching Reference UI ── */}
      <div className={instructorStyles.headerRow} style={{ marginBottom: 16 }}>
        <div className={instructorStyles.headerTitleGroup}>
          <h1 className={instructorStyles.pageTitle}>
            {currentTab === 'students' ? 'Students' : 'Instructor Analytics'}
          </h1>
          <p className={instructorStyles.pageSubtitle}>
            {currentTab === 'students'
              ? 'Cohort risk and academic health'
              : currentTab === 'integrity'
              ? 'Review integrity signals, inspect evidence, and make fair, evidence-based decisions.'
              : currentTab === 'engagement'
              ? 'Analyze student engagement, effort patterns, and early signals to support timely interventions'
              : currentTab === 'mastery'
              ? 'Track concept mastery, identify learning gaps, and plan targeted interventions'
              : currentTab === 'trends'
              ? 'Track learning trends, predict outcomes, and identify early interventions'
              : 'Track progress, identify at-risk students, and take informed actions'}
          </p>
        </div>
        {currentTab !== 'mastery' && currentTab !== 'engagement' && currentTab !== 'integrity' && currentTab !== 'rankings' && (
          <div className={instructorStyles.headerDateBadge}>
            <Calendar size={14} style={{ color: '#64748b' }} />
            <span>Last {days} Days</span>
          </div>
        )}
      </div>

      {/* ── Cascading 4-Level Filter Hierarchy Toolbar ── */}
      {currentTab !== 'students' && (
        <div className={instructorStyles.cascadingToolbarCard}>
          {/* Main Tier: 5-Step Unified Pipeline Flow */}
          <div className={instructorStyles.cascadingPipelineGrid}>
            {/* LEVEL 1: Academic Year / Batch */}
            <div
              className={`${instructorStyles.cascadingLevelItem} ${
                selectedAcademicYear !== 'all' ? instructorStyles.cascadingLevelItemActive : ''
              }`}
            >
              <div className={instructorStyles.cascadingLevelHeader}>
                <span className={instructorStyles.cascadingStepLabel}>
                  <span className={instructorStyles.stepNumberCircle}>1</span>
                  Academic Year
                </span>
              </div>
              <div className={instructorStyles.cascadingControlBody}>
                <Calendar size={14} className={instructorStyles.cascadingLevelIcon} />
                <select
                  className={instructorStyles.cascadingSelectInput}
                  value={selectedAcademicYear}
                  onChange={(e) => setSelectedAcademicYear(e.target.value)}
                  aria-label="Academic Year / Batch"
                >
                  <option value="all">All Years</option>
                  {academicYearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Connecting Chevron */}
            <div className={instructorStyles.cascadingConnector}>
              <ChevronRight size={14} />
            </div>

            {/* LEVEL 2: Department / Program */}
            <div
              className={`${instructorStyles.cascadingLevelItem} ${
                selectedDepartment !== 'all' ? instructorStyles.cascadingLevelItemActive : ''
              }`}
            >
              <div className={instructorStyles.cascadingLevelHeader}>
                <span className={instructorStyles.cascadingStepLabel}>
                  <span className={instructorStyles.stepNumberCircle}>2</span>
                  Department
                </span>
              </div>
              <div className={instructorStyles.cascadingControlBody}>
                <Layers size={14} className={instructorStyles.cascadingLevelIcon} />
                <select
                  className={instructorStyles.cascadingSelectInput}
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  aria-label="Department / Program"
                >
                  <option value="all">All Departments</option>
                  {departmentOptions.map(([code, name]) => (
                    <option key={code} value={code}>
                      {name} ({code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Connecting Chevron */}
            <div className={instructorStyles.cascadingConnector}>
              <ChevronRight size={14} />
            </div>

            {/* LEVEL 3: Section A / B / All */}
            <div
              className={`${instructorStyles.cascadingLevelItem} ${
                selectedSectionFilter !== 'all' ? instructorStyles.cascadingLevelItemActive : ''
              }`}
            >
              <div className={instructorStyles.cascadingLevelHeader}>
                <span className={instructorStyles.cascadingStepLabel}>
                  <span className={instructorStyles.stepNumberCircle}>3</span>
                  Section
                </span>
                <span className={instructorStyles.cascadingCountBadge}>
                  {totalSectionCount} Students
                </span>
              </div>
              <div className={instructorStyles.cascadingControlBody}>
                <Users size={14} className={instructorStyles.cascadingLevelIcon} />
                <select
                  className={instructorStyles.cascadingSelectInput}
                  value={selectedSectionFilter}
                  onChange={(e) => handleSectionChange(e.target.value)}
                  aria-label="Section Filter"
                >
                  <option value="all">All My Sections ({totalSectionCount} Students)</option>
                  {sectionOptions.map((o) => (
                    <option key={o.name} value={`Section ${o.name}`}>
                      Section {o.name} ({o.count} Students)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Connecting Chevron */}
            <div className={instructorStyles.cascadingConnector}>
              <ChevronRight size={14} />
            </div>

            {/* LEVEL 4a: Subject (Cascades from Section) */}
            <div
              className={`${instructorStyles.cascadingLevelItem} ${
                selectedSubject ? instructorStyles.cascadingLevelItemActive : ''
              }`}
            >
              <div className={instructorStyles.cascadingLevelHeader}>
                <span className={instructorStyles.cascadingStepLabel}>
                  <span className={instructorStyles.stepNumberCircle}>4</span>
                  Subject
                </span>
                <span className={instructorStyles.cascadingCountBadge}>
                  {availableSubjects.length} Subj
                </span>
              </div>
              <div className={instructorStyles.cascadingControlBody}>
                <BookOpen size={14} className={instructorStyles.cascadingLevelIcon} />
                <select
                  className={instructorStyles.cascadingSelectInput}
                  value={selectedSubject}
                  onChange={(e) => handleSubjectChange(e.target.value)}
                  aria-label="Cascading Subject"
                >
                  <option value="">
                    {selectedSectionFilter !== 'all'
                      ? `All ${selectedSectionFilter} Subjects`
                      : 'All Subjects'}
                  </option>
                  {availableSubjects.map((sub) => (
                    <option key={sub.id || sub.name} value={sub.name}>
                      {sub.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Connecting Chevron */}
            <div className={instructorStyles.cascadingConnector}>
              <ChevronRight size={14} />
            </div>

            {/* LEVEL 4b: Experiment (Cascades from Subject) */}
            <div
              className={`${instructorStyles.cascadingLevelItem} ${
                selectedExpId ? instructorStyles.cascadingLevelItemActive : ''
              }`}
            >
              <div className={instructorStyles.cascadingLevelHeader}>
                <span className={instructorStyles.cascadingStepLabel}>
                  <span className={instructorStyles.stepNumberCircle}>5</span>
                  Experiment / Lab
                </span>
                <span className={instructorStyles.cascadingCountBadge}>
                  {availableExperiments.length} Labs
                </span>
              </div>
              <div className={instructorStyles.cascadingControlBody}>
                <FlaskConical size={14} className={instructorStyles.cascadingLevelIcon} />
                <select
                  className={instructorStyles.cascadingSelectInput}
                  value={selectedExpId}
                  onChange={(e) => setSelectedExpId(e.target.value)}
                  aria-label="Cascading Experiment"
                >
                  <option value="">
                    {selectedSubject ? `All ${selectedSubject} Experiments` : 'All Experiments'}
                  </option>
                  {availableExperiments.map((exp) => (
                    <option key={exp.id} value={exp.id}>
                      {exp.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Secondary Filter Badges & Aux Controls Bar */}
          <div className={instructorStyles.cascadingMetaRow}>
            <div className={instructorStyles.cascadingActivePillGroup}>
              <span className={instructorStyles.cascadingActiveTag}>
                <Sparkles size={12} style={{ color: '#7c3aed' }} />
                Active Scope:
              </span>
              <span className={`${instructorStyles.cascadingActiveTag} ${instructorStyles.cascadingActiveTagHighlight}`}>
                {selectedAcademicYear === 'all' ? 'All Years' : selectedAcademicYear}
              </span>
              <span className={`${instructorStyles.cascadingActiveTag} ${instructorStyles.cascadingActiveTagHighlight}`}>
                {selectedDepartment === 'all' ? 'All Departments' : selectedDepartment}
              </span>
              <span className={`${instructorStyles.cascadingActiveTag} ${instructorStyles.cascadingActiveTagHighlight}`}>
                {selectedSectionFilter === 'all'
                  ? `All Sections (${totalSectionCount} Students)`
                  : `Section ${normSec(selectedSectionFilter)} (${totalSectionCount} Students)`}
              </span>
              {selectedSubject && (
                <span className={`${instructorStyles.cascadingActiveTag} ${instructorStyles.cascadingActiveTagHighlight}`}>
                  {selectedSubject}
                </span>
              )}
              {selectedExpId && (
                <span className={`${instructorStyles.cascadingActiveTag} ${instructorStyles.cascadingActiveTagHighlight}`}>
                  {availableExperiments.find((e) => e.id === selectedExpId)?.title || '1 Experiment'}
                </span>
              )}

              {(selectedAcademicYear !== 'all' ||
                selectedDepartment !== 'all' ||
                selectedSectionFilter !== 'all' ||
                selectedSubject ||
                selectedExpId) && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className={instructorStyles.cascadingActiveTagReset}
                  title="Reset all filters to defaults"
                >
                  <RotateCcw size={11} />
                  Reset Filters
                </button>
              )}
            </div>

            <div className={instructorStyles.cascadingAuxControls}>
              {/* Optional Metric Filter */}
              {currentTab !== 'mastery' && currentTab !== 'engagement' && currentTab !== 'integrity' && currentTab !== 'rankings' && (
                <div className={instructorStyles.cascadingAuxItem}>
                  <label className={instructorStyles.cascadingAuxLabel}>Metric:</label>
                  <select
                    className={instructorStyles.cascadingAuxSelect}
                    value={selectedMetric}
                    onChange={(e) => setSelectedMetric(e.target.value)}
                  >
                    <option value="all">All Metrics</option>
                    <option value="final_grade">Final Grade</option>
                    <option value="completion_rate">Completion Rate</option>
                    <option value="attendance_rate">Attendance Rate</option>
                    <option value="focus_engagement">Focus Engagement</option>
                  </select>
                </div>
              )}

              {/* Time Horizon Filter */}
              <div className={instructorStyles.cascadingAuxItem}>
                <Calendar size={13} style={{ color: '#64748b' }} />
                <label className={instructorStyles.cascadingAuxLabel}>Window:</label>
                <select
                  className={instructorStyles.cascadingAuxSelect}
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                >
                  <option value={7}>Last 7 Days</option>
                  <option value={14}>Last 14 Days</option>
                  <option value={30}>Last 30 Days</option>
                  <option value={60}>Last 60 Days</option>
                  <option value={90}>Last 90 Days</option>
                </select>
              </div>

              <div className={instructorStyles.cascadingDivider} />

              {/* Compare Toggle */}
              <div
                className={instructorStyles.toggleContainer}
                onClick={() => setCompareActive(!compareActive)}
                title="Toggle cohort comparison against previous period"
              >
                <div
                  className={`${instructorStyles.toggleTrack} ${
                    compareActive ? instructorStyles.toggleTrackActive : ''
                  }`}
                >
                  <div
                    className={`${instructorStyles.toggleThumb} ${
                      compareActive ? instructorStyles.toggleThumbActive : ''
                    }`}
                  />
                </div>
                <span className={instructorStyles.toggleLabel}>Compare</span>
              </div>

              {/* Refresh Button */}
              <button
                type="button"
                onClick={handleRefresh}
                className={instructorStyles.refreshBtn}
                title="Refresh analytics data"
              >
                <RefreshCw size={14} className={isRefreshingOverview ? 'animate-spin' : ''} />
                Refresh
              </button>

              {/* Export Report */}
              <button
                type="button"
                onClick={() => {
                  if (overviewData?.needs_attention_students) {
                    const rows = overviewData.needs_attention_students.map((st) => ({
                      Student: st.student_name,
                      Roll: st.roll_number,
                      Band: st.risk_band,
                      Score: st.risk_score || st.score || 0,
                      Driver: st.primary_warning_driver,
                      SuggestedAction: st.suggested_action,
                    }));
                    exportCSV(rows, `instructor_analytics_report_${new Date().toISOString().split('T')[0]}`);
                    showToast('Analytics report exported as CSV.');
                  } else {
                    showToast('No data to export.');
                  }
                }}
                className={instructorStyles.exportBtn}
              >
                <Download size={14} />
                Export Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 9-Tab Navigation Strip matching Reference UI ── */}
      <div className={instructorStyles.tabNavRow} style={{ marginBottom: 20 }}>
        {TABS.map((t) => {
          const active = currentTab === t.id || (t.id === 'today' && (currentTab as string) === 'overview');
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
              }}
              className={`${instructorStyles.tabBtn} ${active ? instructorStyles.tabBtnActive : ''}`}
            >
              <Icon size={15} strokeWidth={active ? 2.2 : 1.8} className={instructorStyles.tabIcon} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Active Tab Content ── */}

      {/* ────────────────────────────────────────────────────────────────────────
          TAB 1: 🎯 OVERVIEW (Reference UI with 100% Real Database Analytics)
         ──────────────────────────────────────────────────────────────────────── */}
      {(currentTab === 'today' || (currentTab as string) === 'overview') && (
        loadingOverview && !overviewData ? (
          <LoadingState message="Loading live cohort analytics..." />
        ) : overviewData ? (
          <OverviewTab
            data={overviewData}
            onSelectStudent={(sid) => setSelectedStudentId(sid)}
            onViewAllStudents={() => setTab('students')}
            onActionClick={(action, st) => {
              showToast(`Action '${action}' recorded for ${st.student_name}`);
              setSelectedStudentId(st.student_id);
            }}
          />
        ) : (
          <EmptyState
            title="No Analytics Data Available"
            message="No active student submissions or sessions found for this filter."
          />
        )
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          TAB 2: STUDENTS (Cohort Risk Matrix & Health Ledger)
         ──────────────────────────────────────────────────────────────────────── */}
      {currentTab === 'students' && (
        loadingCohortMatrix && !cohortMatrixData ? (
          <LoadingState message="Loading live student cohort risk matrix..." />
        ) : cohortMatrixData ? (
          <StudentsTab
            data={cohortMatrixData}
            selectedStudentId={selectedStudentId}
            onSelectStudent={(sid) => setSelectedStudentId(sid)}
            onRefresh={handleRefresh}
            onFilterChange={(filters) => {
              updateUrl({
                ...(filters.section_subject_id !== undefined ? { ss: filters.section_subject_id } : {}),
                ...(filters.experiment_id !== undefined ? { exp: filters.experiment_id } : {}),
                ...(filters.days !== undefined ? { days: filters.days } : {}),
              });
            }}
          />
        ) : (
          <EmptyState
            title="No Student Data Available"
            message="No active students found for this section filter."
          />
        )
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          TAB 3: 📊 EXPERIMENTS (Matching Reference UI with 100% Real Database Analytics)
         ──────────────────────────────────────────────────────────────────────── */}
      {currentTab === 'experiments' && (
        loadingExperimentsOverview && !experimentsOverviewData ? (
          <LoadingState message="Loading live experiments performance and calibration data..." />
        ) : experimentsOverviewData ? (
          <ExperimentsTab
            data={experimentsOverviewData}
            onSelectExperiment={(expId) => {
              setSelectedExpId(expId);
              showToast(`Selected experiment filter: ${expId}`);
            }}
          />
        ) : (
          <EmptyState
            title="No Experiment Analytics Available"
            message="No active student submissions or test attempts found for this filter."
          />
        )
      )}


      {/* ────────────────────────────────────────────────────────────────────────
          TAB 4: 📈 TRENDS (Longitudinal Trends & Forecast Band)
         ──────────────────────────────────────────────────────────────────────── */}
      {currentTab === 'trends' && (
        loadingTrendsOverview && !trendsOverviewData ? (
          <LoadingState message="Loading live learning trends and predictive analytics..." />
        ) : trendsOverviewData ? (
          <TrendsTab
            data={trendsOverviewData}
            onSelectStudent={(sid) => setSelectedStudentId(sid)}
            onSelectExperiment={(eid) => setSelectedExpId(eid)}
          />
        ) : (
          <EmptyState
            title="No Trends Data Available"
            message="No historical learning trends recorded for this filter."
          />
        )
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          TAB 5: 🧠 MASTERY (Matching Reference UI with 100% Real Database Analytics)
         ──────────────────────────────────────────────────────────────────────── */}
      {currentTab === 'mastery' && (
        loadingMasteryOverview && !masteryOverviewData ? (
          <LoadingState message="Loading live curriculum concept mastery and dependency analytics..." />
        ) : masteryOverviewData ? (
          <MasteryTab
            data={masteryOverviewData}
            onSelectStudent={(sid) => setSelectedStudentId(sid)}
          />
        ) : (
          <EmptyState
            title="No Concept Mastery Data"
            message="No concept assessment records found for this filter."
          />
        )
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          TAB 6: ⚡ ENGAGEMENT (Matching Reference UI with 100% Real Database Analytics)
         ──────────────────────────────────────────────────────────────────────── */}
      {currentTab === 'engagement' && (
        loadingEngagementOverview && !engagementOverviewData ? (
          <LoadingState message="Loading live student engagement telemetry and effort patterns..." />
        ) : engagementOverviewData ? (
          <EngagementTab
            data={engagementOverviewData}
            onSelectStudent={(sid) => setSelectedStudentId(sid)}
          />
        ) : (
          <EmptyState
            title="No Engagement Data Available"
            message="No active student sessions logged for this cohort filter."
          />
        )
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          TAB 7: 🛡 INTEGRITY (Integrity Confidence & Review Queue)
         ──────────────────────────────────────────────────────────────────────── */}
      {currentTab === 'integrity' && (
        <IntegrityTab
          data={integrityOverviewData}
          isLoading={loadingIntegrityOverview}
          onRefresh={handleRefresh}
        />
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          TAB 8: 🏆 RANKINGS (Multi-Scope Leaderboard matching Reference UI)
         ──────────────────────────────────────────────────────────────────────── */}
      {currentTab === 'rankings' && (
        loadingRankingsOverview && !rankingsOverviewData ? (
          <LoadingState message="Loading live multi-scope student leaderboard and rankings..." />
        ) : rankingsOverviewData ? (
          <RankingsTab
            data={rankingsOverviewData}
            currentScope={rankingScope}
            onScopeChange={(scope) => setRankingScope(scope)}
            onSelectStudent={(sid) => setSelectedStudentId(sid)}
          />
        ) : (
          <EmptyState
            title="No Rankings Data Available"
            message="No active student rankings recorded for this scope filter."
          />
        )
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          TAB 9: 🤖 AI USAGE (Cost Efficiency & Consumption Breakdown matching Reference UI)
         ──────────────────────────────────────────────────────────────────────── */}
      {currentTab === 'ai-usage' && (
        loadingAiUsageOverview && !aiUsageOverviewData ? (
          <LoadingState message="Loading live AI telemetry, token consumption and budget metrics..." />
        ) : aiUsageOverviewData ? (
          <AIUsageTab
            data={aiUsageOverviewData}
            onSelectStudent={(sid) => setSelectedStudentId(sid)}
            onWiderDateRange={() => {
              setDays(90);
              showToast('Expanded date window to Last 90 Days');
            }}
          />
        ) : (
          <EmptyState
            title="No AI Usage Analytics Available"
            message="No AI consumption logs or telemetry found for this filter."
          />
        )
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          GLOBAL REUSABLE: Student 360 Slide-Over Diagnostic Drawer (used on Overview/other tabs)
         ──────────────────────────────────────────────────────────────────────── */}
      {currentTab !== 'students' && (
        <Student360Drawer
          studentId={selectedStudentId}
          isOpen={Boolean(selectedStudentId)}
          onClose={() => setSelectedStudentId(null)}
        />
      )}
    </InstructorShell>
  );
}

export default function InstructorAnalyticsPage() {
  return (
    <Suspense
      fallback={
        <InstructorShell activePage="Analytics">
          <LoadingState message="Loading instructor intelligence dashboard..." />
        </InstructorShell>
      }
    >
      <AnalyticsDashboard />
    </Suspense>
  );
}
