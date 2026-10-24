'use client';

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  LayoutDashboard,
  Brain,
  AlertTriangle,
  HeartHandshake,
  CalendarClock,
  UserCheck,
  BarChart3,
  Calendar,
  Layers,
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import { Student360Drawer } from '@/components/analytics';
import { sessionService } from '@/services/session.service';
import { experienceService } from '@/services/experience.service';
import { analyticsService } from '@/services/analytics.service';
import { apiClient } from '@/services/api-client';

import styles from './class-management.module.css';
import { CascadingFilterBar } from './components/CascadingFilterBar';
import { TabNavigation, type ManagementTab } from './components/TabNavigation';
import { AddInterventionModal } from './components/AddInterventionModal';
import { GrantReliefModal } from './components/GrantReliefModal';

import { OverviewTab } from './tabs/OverviewTab';
import { StudentsTab } from './tabs/StudentsTab';
import { ConceptMasteryTab } from './tabs/ConceptMasteryTab';
import { EarlyWarningsTab } from './tabs/EarlyWarningsTab';
import { InterventionsTab } from './tabs/InterventionsTab';
import { DeadlineReliefTab } from './tabs/DeadlineReliefTab';
import { AttendanceTab } from './tabs/AttendanceTab';
import { AnalyticsTab } from './tabs/AnalyticsTab';

interface SectionSubjectItem {
  section_subject_id: string;
  subject_id: string;
  subject_name: string;
  subject_code: string;
  department_id?: string | null;
  department_name?: string;
  department_code?: string;
  academic_year?: string;
  batch_id?: string | null;
  batch_name?: string;
  section_id: string;
  section_name: string;
  student_count: number;
  experiment_count: number;
}

function ManagementContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const tabParam = (searchParams.get('tab') as ManagementTab) || 'overview';
  const [activeTab, setActiveTab] = useState<ManagementTab>(tabParam);
  const [toast, setToast] = useState<string | null>(null);

  // Modals & Drawer State
  const [isAddInterventionOpen, setIsAddInterventionOpen] = useState(false);
  const [isGrantReliefOpen, setIsGrantReliefOpen] = useState(false);
  const [selectedStudent360, setSelectedStudent360] = useState<string | null>(null);
  const [preselectedStudentId, setPreselectedStudentId] = useState<string>('');

  // ── 5-Level Cascading Hierarchy State ───────────────────────────────────────
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedBatch, setSelectedBatch] = useState<string>('all');
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');

  // Keep state synced with URL query param
  useEffect(() => {
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [tabParam, activeTab]);

  const handleTabChange = (t: ManagementTab) => {
    setActiveTab(t);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', t);
    router.replace(`?${params.toString()}`);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // 1. Fetch Assigned Section-Subjects
  const { data: ssData } = useQuery({
    queryKey: ['instructor', 'section-subjects'],
    queryFn: () => sessionService.getSectionSubjects(),
    staleTime: 60 * 1000,
  });

  const sectionSubjects: SectionSubjectItem[] = useMemo(
    () => (ssData?.section_subjects as SectionSubjectItem[]) ?? [],
    [ssData]
  );

  // Derive cascading filter dropdown options
  const departments = useMemo(() => {
    const map = new Map<string, string>();
    sectionSubjects.forEach((ss) => {
      const code = ss.department_code || ss.department_name;
      if (code) map.set(code, ss.department_name || code);
    });
    return Array.from(map.entries()).map(([code, name]) => ({ id: code, name, code }));
  }, [sectionSubjects]);

  const years = useMemo(() => {
    const set = new Set<string>();
    sectionSubjects.forEach((ss) => {
      if (ss.academic_year) set.add(ss.academic_year);
    });
    return Array.from(set).map((y) => ({ id: y, name: y }));
  }, [sectionSubjects]);

  const batches = useMemo(() => {
    const map = new Map<string, string>();
    sectionSubjects.forEach((ss) => {
      if (ss.batch_id && ss.batch_name) map.set(ss.batch_id, ss.batch_name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [sectionSubjects]);

  const sections = useMemo(() => {
    const map = new Map<string, string>();
    sectionSubjects.forEach((ss) => {
      if (ss.section_id && ss.section_name) map.set(ss.section_id, ss.section_name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [sectionSubjects]);

  const subjects = useMemo(() => {
    const map = new Map<string, string>();
    sectionSubjects.forEach((ss) => {
      if (ss.subject_id && ss.subject_name) map.set(ss.subject_id, ss.subject_name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [sectionSubjects]);

  // Active matching SectionSubject ID
  const activeSectionSubjectId = useMemo(() => {
    const match = sectionSubjects.find((ss) => {
      if (selectedSection !== 'all' && ss.section_id !== selectedSection) return false;
      if (selectedSubject !== 'all' && ss.subject_id !== selectedSubject) return false;
      return true;
    });
    return match?.section_subject_id || sectionSubjects[0]?.section_subject_id || '';
  }, [sectionSubjects, selectedSection, selectedSubject]);

  // 2. Fetch Live Cohort Matrix (KPIs, Students, Risk Distribution)
  const { data: cohortData } = useQuery({
    queryKey: ['instructor', 'cohort-matrix', activeSectionSubjectId],
    queryFn: async () => {
      const { data } = await apiClient.get('/instructor/analytics/cohort-matrix', {
        params: activeSectionSubjectId ? { section_subject_id: activeSectionSubjectId } : {},
      });
      return data;
    },
    staleTime: 45 * 1000,
  });

  // 3. Fetch Overview Aggregates
  const { data: overviewData } = useQuery({
    queryKey: ['instructor', 'overview-analytics', activeSectionSubjectId],
    queryFn: async () => {
      const { data } = await apiClient.get('/instructor/analytics/overview', {
        params: activeSectionSubjectId ? { section_subject_id: activeSectionSubjectId } : {},
      });
      return data;
    },
    staleTime: 60 * 1000,
  });

  // 4. Fetch Trends & Student Experiment Heatmap
  const { data: trendsData } = useQuery({
    queryKey: ['instructor', 'trends-overview', activeSectionSubjectId],
    queryFn: async () => {
      const { data } = await apiClient.get('/instructor/analytics/trends-overview', {
        params: activeSectionSubjectId ? { section_subject_id: activeSectionSubjectId } : {},
      });
      return data;
    },
    staleTime: 60 * 1000,
  });

  // 5. Fetch Mastery Overview
  const { data: masteryData } = useQuery({
    queryKey: ['instructor', 'mastery-overview', activeSectionSubjectId],
    queryFn: async () => {
      const { data } = await apiClient.get('/instructor/analytics/mastery-overview', {
        params: activeSectionSubjectId ? { section_subject_id: activeSectionSubjectId } : {},
      });
      return data;
    },
    staleTime: 60 * 1000,
  });

  // 6. Fetch Interventions
  const { data: interventionsData, refetch: refetchInterventions } = useQuery({
    queryKey: ['instructor', 'interventions'],
    queryFn: () => experienceService.listInterventions(),
    staleTime: 30 * 1000,
  });

  // 7. Fetch Extensions / Deadline Relief
  const { data: extensionsData, refetch: refetchExtensions } = useQuery({
    queryKey: ['instructor', 'extensions'],
    queryFn: () => experienceService.listExtensions(),
    staleTime: 30 * 1000,
  });

  // 8. Fetch Cohort Attendance Summary
  const { data: cohortAttendance } = useQuery({
    queryKey: ['instructor', 'cohort-attendance', activeSectionSubjectId],
    queryFn: () => sessionService.getCohortAttendanceSummary(activeSectionSubjectId),
    staleTime: 45 * 1000,
  });

  // 9. Fetch Early Warnings
  const { data: earlyWarningsData } = useQuery({
    queryKey: ['instructor', 'early-warnings', activeSectionSubjectId],
    queryFn: async () => {
      if (!activeSectionSubjectId) return null;
      try {
        const { data } = await apiClient.get(`/instructor/early-warning/${activeSectionSubjectId}`);
        return data;
      } catch {
        return null;
      }
    },
    enabled: !!activeSectionSubjectId,
  });

  // Student options for modals
  const studentOptions = useMemo(() => {
    const list = cohortData?.students || [];
    return list.map((s: any) => ({
      id: s.student_id,
      name: s.student_name || s.full_name || 'Student',
      rollNumber: s.roll_number,
    }));
  }, [cohortData]);

  // Experiment options for modals
  const experimentOptions = useMemo(() => {
    return [
      { id: 'exp-1', title: 'Data Structures & Algorithms - Lab 1', expNumber: 1 },
      { id: 'exp-2', title: 'Trees & Balanced Search Trees - Lab 2', expNumber: 2 },
      { id: 'exp-3', title: 'Graph Traversal & BFS/DFS - Lab 3', expNumber: 3 },
      { id: 'exp-4', title: 'Dynamic Programming Foundations - Lab 4', expNumber: 4 },
    ];
  }, []);

  // Title and subtitle mapping per tab
  const getHeaderInfo = () => {
    switch (activeTab) {
      case 'overview':
        return {
          title: 'Class & Student Management',
          subtitle: 'Monitor class performance, identify at-risk students, take interventions, and manage academic progress.',
        };
      case 'students':
        return {
          title: 'Students',
          subtitle: 'View the complete class roster, monitor progress, and manage individual student actions.',
        };
      case 'concept-mastery':
        return {
          title: 'Concept Mastery',
          subtitle: 'Analyze student understanding across concepts and experiments.',
        };
      case 'early-warnings':
        return {
          title: 'Early Warnings',
          subtitle: 'Identify students with early-risk signals and declining performance.',
        };
      case 'interventions':
        return {
          title: 'Interventions',
          subtitle: 'Manage individual student interventions and track outcomes.',
        };
      case 'deadline-relief':
        return {
          title: 'Deadline Relief',
          subtitle: 'Manage individual deadline extensions and manage excused absences.',
        };
      case 'attendance':
        return {
          title: 'Attendance',
          subtitle: 'Track lab attendance and manage excused absences.',
        };
      case 'analytics':
        return {
          title: 'Analytics',
          subtitle: 'Deep-dive into class performance and trends.',
        };
      default:
        return {
          title: 'Class Management',
          subtitle: 'Instructor Class Management & Student Analytics.',
        };
    }
  };

  const headerInfo = getHeaderInfo();

  return (
    <InstructorShell activePage="Management">
      <div className={styles.container}>
        {/* Toast Notification */}
        {toast && (
          <div
            style={{
              position: 'fixed',
              bottom: 24,
              right: 24,
              background: '#0f172a',
              color: '#ffffff',
              padding: '0.75rem 1.25rem',
              borderRadius: 10,
              fontSize: '0.84rem',
              boxShadow: '0 10px 15px -3px rgba(0,0,0,0.2)',
              zIndex: 9999,
            }}
          >
            {toast}
          </div>
        )}

        {/* ── TOP HEADER ROW ────────────────────────────────────────────── */}
        <div className={styles.headerRow}>
          <div className={styles.titleArea}>
            <div className={styles.titleIcon}>
              <Users size={22} />
            </div>
            <div>
              <h1 className={styles.title}>{headerInfo.title}</h1>
              <p className={styles.subtitle}>{headerInfo.subtitle}</p>
            </div>
          </div>

          <div className={styles.termBadge}>
            <Calendar size={13} color="#7c3aed" />
            <span>2025 - 2026 (Even)</span>
          </div>
        </div>

        {/* ── CASCADING FILTERS RIBBON ─────────────────────────────────── */}
        <CascadingFilterBar
          departments={departments}
          years={years}
          batches={batches}
          sections={sections}
          subjects={subjects}
          selectedDept={selectedDept}
          onSelectDept={setSelectedDept}
          selectedYear={selectedYear}
          onSelectYear={setSelectedYear}
          selectedBatch={selectedBatch}
          onSelectBatch={setSelectedBatch}
          selectedSection={selectedSection}
          onSelectSection={setSelectedSection}
          selectedSubject={selectedSubject}
          onSelectSubject={setSelectedSubject}
        />

        {/* ── 8-TAB PERSISTENT NAVIGATION BAR ───────────────────────────── */}
        <TabNavigation
          activeTab={activeTab}
          onTabChange={handleTabChange}
        />

        {/* ── TAB CONTENT MOUNTING ──────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <OverviewTab
            cohortData={cohortData}
            overviewData={overviewData}
            interventions={interventionsData?.interventions || []}
            trendsData={trendsData}
            onNavigateTab={handleTabChange}
            onSelectStudent={(id) => setSelectedStudent360(id)}
          />
        )}

        {activeTab === 'students' && (
          <StudentsTab
            students={cohortData?.students || []}
            onSelectStudent={(id) => setSelectedStudent360(id)}
          />
        )}

        {activeTab === 'concept-mastery' && (
          <ConceptMasteryTab
            masteryData={masteryData}
            trendsData={trendsData}
            onSelectStudent={(id) => setSelectedStudent360(id)}
          />
        )}

        {activeTab === 'early-warnings' && (
          <EarlyWarningsTab
            cohortData={cohortData}
            earlyWarningsData={earlyWarningsData}
            onSelectStudent={(id) => setSelectedStudent360(id)}
          />
        )}

        {activeTab === 'interventions' && (
          <InterventionsTab
            interventions={interventionsData?.interventions || []}
            onOpenAddModal={() => setIsAddInterventionOpen(true)}
            onRefresh={() => {
              refetchInterventions();
              queryClient.invalidateQueries({ queryKey: ['instructor'] });
            }}
            onSelectStudent={(id) => setSelectedStudent360(id)}
          />
        )}

        {activeTab === 'deadline-relief' && (
          <DeadlineReliefTab
            extensions={extensionsData?.extensions || []}
            onOpenGrantModal={() => setIsGrantReliefOpen(true)}
            onSelectStudent={(id) => setSelectedStudent360(id)}
          />
        )}

        {activeTab === 'attendance' && (
          <AttendanceTab
            cohortAttendance={cohortAttendance}
            onSelectStudent={(id) => setSelectedStudent360(id)}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsTab
            trendsData={trendsData}
            overviewData={overviewData}
            masteryData={masteryData}
          />
        )}

        {/* ── MODALS & STUDENT 360 DRAWER ──────────────────────────────── */}
        <AddInterventionModal
          isOpen={isAddInterventionOpen}
          onClose={() => setIsAddInterventionOpen(false)}
          students={studentOptions}
          initialStudentId={preselectedStudentId}
          onSuccess={(msg) => {
            showToast(msg);
            refetchInterventions();
          }}
        />

        <GrantReliefModal
          isOpen={isGrantReliefOpen}
          onClose={() => setIsGrantReliefOpen(false)}
          students={studentOptions}
          experiments={experimentOptions}
          initialStudentId={preselectedStudentId}
          onSuccess={(msg) => {
            showToast(msg);
            refetchExtensions();
          }}
        />

        {selectedStudent360 && (
          <Student360Drawer
            studentId={selectedStudent360}
            isOpen={!!selectedStudent360}
            onClose={() => setSelectedStudent360(null)}
          />
        )}
      </div>
    </InstructorShell>
  );
}

export default function ManagementPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading Class Management...</div>}>
      <ManagementContent />
    </Suspense>
  );
}
