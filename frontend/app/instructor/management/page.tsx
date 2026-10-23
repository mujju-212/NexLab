'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ClipboardList, Flame, Megaphone, CalendarClock, Loader2, Plus,
  CheckCircle2, AlertTriangle, X, TrendingUp, Trash2, Send, StickyNote,
  Users, Building2, Calendar, Layers, BookOpen, Search, Eye, ShieldCheck,
  Award, ArrowUpRight, ChevronLeft, ChevronRight
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import {
  experienceService,
  type InterventionRow, type MasteryHeatmap, type ExtensionRow,
} from '@/services/experience.service';
import { sessionService } from '@/services/session.service';
import { analyticsService } from '@/services/analytics.service';
import { Student360Drawer } from '@/components/analytics';
import styles from '../shared.module.css';

type Tab = 'roster' | 'interventions' | 'extensions' | 'announcements' | 'heatmap' | 'insights' | 'notes';

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

interface RosterStudent {
  student_id: string;
  full_name: string;
  roll_number: string | null;
  email?: string | null;
}

// One vocabulary for every surface that can log an intervention. The Student 360
// drawer posts its own set (1_on_1_review, counseling, …); without labels those
// rows rendered as raw slugs ("1_ON_1_REVIEW") in this very list.
const ACTION_LABELS: Record<string, string> = {
  talked_to_student: 'Talked to student',
  extended_deadline: 'Extended deadline',
  re_graded: 'Re-graded',
  contacted_guardian: 'Contacted guardian',
  tutoring: 'Arranged tutoring',
  resources_shared: 'Shared resources',
  other: 'Other',
  '1_on_1_review': '1:1 diagnostic review',
  practice_assignment: 'Remedial practice assigned',
  peer_tutoring: 'Peer tutor / TA pairing',
  counseling: 'Academic counseling',
  deadline_extension: 'Targeted deadline extension',
};

const OUTCOME_COLORS: Record<string, string> = {
  open: '#d97706', improved: '#059669', no_change: '#9891a6', worsened: '#dc2626',
};

const fmtDT = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

/**
 * The analytics API returns risk bands `critical | high | watch | ok | low | unknown`.
 * The page used to compare them against invented names ("at_risk", "excelling",
 * "steady"), so "On Track" matched the *watch* band and "Excelling" matched every
 * merely-ok student. These helpers are the single source of that mapping.
 */
function bandOf(st: any): string {
  return String(st?.status_band || st?.risk_band || 'ok').toLowerCase();
}
function isAtRisk(st: any): boolean {
  const b = bandOf(st);
  return b === 'critical' || b === 'high';
}
function needsAttention(st: any): boolean {
  return bandOf(st) === 'watch';
}
function isExcelling(st: any): boolean {
  const mastery = st?.mastery_pct ?? st?.mastery_score;
  const avg = st?.grade_avg ?? st?.avg_score;
  if (mastery != null && mastery >= 80) return true;
  return avg != null && avg >= 85;
}

function cellColor(v: number | null, threshold: number) {
  if (v == null) return { background: '#f3f0fa', color: '#c9c2d8' };
  if (v < threshold * 0.5) return { background: '#dc2626', color: '#fff' };
  if (v < threshold) return { background: '#f59e0b', color: '#fff' };
  if (v < 70) return { background: '#fde68a', color: '#78350f' };
  return { background: '#16a34a', color: '#fff' };
}

export default function ManagementPage() {
  const [tab, setTab] = useState<Tab>('roster');
  const [toast, setToast] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [selectedStudent360, setSelectedStudent360] = useState<string | null>(null);
  const [preselectedActionStudentId, setPreselectedActionStudentId] = useState<string>('');

  // ── 5-Level Cascading Academic Hierarchy State ───────────────────────────────
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedBatch, setSelectedBatch] = useState<string>('all');
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [riskFilter, setRiskFilter] = useState<'all' | 'at_risk' | 'attention' | 'top' | 'on_track'>('all');

  // Roster pagination — a class of 60 rendered as one 60-row table is unreadable
  // and the page used to do exactly that.
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const toast3 = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3200); };

  // Fetch assigned section-subjects
  const { data: ssData } = useQuery({
    queryKey: ['instructor', 'section-subjects'],
    queryFn: () => sessionService.getSectionSubjects(),
    staleTime: 60 * 1000,
  });

  const sectionSubjects: SectionSubjectItem[] = useMemo(
    () => (ssData?.section_subjects as SectionSubjectItem[]) ?? [],
    [ssData]
  );

  // Unique Departments
  const departments = useMemo(() => {
    const map = new Map<string, string>();
    sectionSubjects.forEach(ss => {
      const code = ss.department_code || ss.department_name;
      if (code) map.set(code, ss.department_name || code);
    });
    return Array.from(map.entries()).map(([code, name]) => ({ code, name }));
  }, [sectionSubjects]);

  // Unique Academic Years
  const academicYears = useMemo(() => {
    const set = new Set<string>();
    sectionSubjects.forEach(ss => {
      if (selectedDept !== 'all' && (ss.department_code || ss.department_name) !== selectedDept) return;
      if (ss.academic_year) set.add(ss.academic_year);
    });
    return Array.from(set);
  }, [sectionSubjects, selectedDept]);

  // Unique Batches
  const availableBatches = useMemo(() => {
    const map = new Map<string, string>();
    sectionSubjects.forEach(ss => {
      if (selectedDept !== 'all' && (ss.department_code || ss.department_name) !== selectedDept) return;
      if (selectedYear !== 'all' && ss.academic_year !== selectedYear) return;
      if (ss.batch_id && ss.batch_name) map.set(ss.batch_id, ss.batch_name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [sectionSubjects, selectedDept, selectedYear]);

  // Filtered Sections
  const availableSections = useMemo(() => {
    return sectionSubjects.filter(ss => {
      if (selectedDept !== 'all' && (ss.department_code || ss.department_name) !== selectedDept) return false;
      if (selectedYear !== 'all' && ss.academic_year !== selectedYear) return false;
      if (selectedBatch !== 'all' && ss.batch_id !== selectedBatch) return false;
      return true;
    }).reduce((acc, curr) => {
      if (!acc.some(s => s.section_id === curr.section_id)) {
        acc.push({
          section_id: curr.section_id,
          section_name: curr.section_name,
          batch_name: curr.batch_name,
        });
      }
      return acc;
    }, [] as Array<{ section_id: string; section_name: string; batch_name?: string }>);
  }, [sectionSubjects, selectedDept, selectedYear, selectedBatch]);

  // Filtered Subjects
  const availableSubjects = useMemo(() => {
    return sectionSubjects.filter(ss => {
      if (selectedDept !== 'all' && (ss.department_code || ss.department_name) !== selectedDept) return false;
      if (selectedYear !== 'all' && ss.academic_year !== selectedYear) return false;
      if (selectedBatch !== 'all' && ss.batch_id !== selectedBatch) return false;
      if (selectedSection !== 'all' && ss.section_id !== selectedSection) return false;
      return true;
    }).reduce((acc, curr) => {
      if (!acc.some(s => s.subject_id === curr.subject_id)) {
        acc.push({
          subject_id: curr.subject_id,
          subject_name: curr.subject_name,
          subject_code: curr.subject_code,
        });
      }
      return acc;
    }, [] as Array<{ subject_id: string; subject_name: string; subject_code: string }>);
  }, [sectionSubjects, selectedDept, selectedYear, selectedBatch, selectedSection]);

  // Matching SectionSubject IDs
  const matchingSectionSubjects = useMemo(() => {
    return sectionSubjects.filter(ss => {
      if (selectedDept !== 'all' && (ss.department_code || ss.department_name) !== selectedDept) return false;
      if (selectedYear !== 'all' && ss.academic_year !== selectedYear) return false;
      if (selectedBatch !== 'all' && ss.batch_id !== selectedBatch) return false;
      if (selectedSection !== 'all' && ss.section_id !== selectedSection) return false;
      if (selectedSubject !== 'all' && ss.subject_id !== selectedSubject) return false;
      return true;
    });
  }, [sectionSubjects, selectedDept, selectedYear, selectedBatch, selectedSection, selectedSubject]);

  // A selection that matches none of this instructor's classes must render an
  // empty state, not the unfiltered class.
  const noClassMatch = sectionSubjects.length > 0 && matchingSectionSubjects.length === 0;
  const activeSsId = matchingSectionSubjects.length === 1 ? matchingSectionSubjects[0].section_subject_id : '';
  const activeSectionName = useMemo(() => {
    if (selectedSection !== 'all') return availableSections.find(s => s.section_id === selectedSection)?.section_name;
    // Unfiltered, but the instructor only teaches one class: name it rather than
    // printing the generic "Assigned Section" in every row.
    if (matchingSectionSubjects.length === 1) return matchingSectionSubjects[0].section_name;
    return undefined;
  }, [selectedSection, availableSections, matchingSectionSubjects]);
  const activeSubjectName = useMemo(() => {
    if (selectedSubject !== 'all') return availableSubjects.find(s => s.subject_id === selectedSubject)?.subject_name;
    if (matchingSectionSubjects.length === 1) return matchingSectionSubjects[0].subject_name;
    return undefined;
  }, [selectedSubject, availableSubjects, matchingSectionSubjects]);

  // Fetch Rich Cohort Matrix for Class Roster & Student 360
  const { data: cohortData, isLoading: loadingCohort } = useQuery({
    queryKey: ['instructor', 'class-management-cohort', activeSsId, activeSectionName, activeSubjectName],
    queryFn: () => analyticsService.getCohortMatrix({
      section_subject_id: activeSsId || undefined,
      section: activeSectionName,
      subject: activeSubjectName,
      days: 90,
    }),
    staleTime: 30 * 1000,
    enabled: !noClassMatch,
  });

  useEffect(() => {
    experienceService.analyticsRoster()
      .then(res => setRoster(res.roster ?? []))
      .catch(() => {});
  }, []);

  const cohortStudents = useMemo(() => {
    const raw = noClassMatch ? [] : cohortData?.students ?? [];
    return raw.filter((st: any) => {
      if (riskFilter === 'at_risk' && !isAtRisk(st)) return false;
      if (riskFilter === 'attention' && !needsAttention(st)) return false;
      if (riskFilter === 'top' && !isExcelling(st)) return false;
      if (riskFilter === 'on_track' && (isAtRisk(st) || needsAttention(st))) return false;
      const q = searchQuery.trim().toLowerCase();
      if (q) {
        // Missing name/roll/email used to throw on `.toLowerCase()` of null.
        return (
          String(st.student_name ?? '').toLowerCase().includes(q) ||
          String(st.roll_number ?? '').toLowerCase().includes(q) ||
          String(st.email ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [cohortData?.students, riskFilter, searchQuery, noClassMatch]);

  // Pagination derived state. Filters narrow the list, so any filter change
  // must send the reader back to page 1 (otherwise page 4 of a 1-page result
  // renders an empty table).
  const totalFiltered = cohortStudents.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pagedStudents = useMemo(
    () => cohortStudents.slice(pageStart, pageStart + pageSize),
    [cohortStudents, pageStart, pageSize]
  );

  useEffect(() => {
    setPage(1);
  }, [riskFilter, searchQuery, pageSize, selectedDept, selectedYear, selectedBatch, selectedSection, selectedSubject]);

  // Keep the cursor inside the page range as filters shrink the result set.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const triggerStudentAction = (studentId: string, targetTab: Tab) => {
    setPreselectedActionStudentId(studentId);
    setTab(targetTab);
  };

  return (
    <InstructorShell
      activePage="Management"
      title="Class & Student 360° Management"
      subtitle="Manage your assigned batches and sections, inspect student 360° telemetry, broadcast section notices, and grant deadline relief."
    >
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 400, background: '#0f172a', color: '#fff', padding: '12px 20px', borderRadius: 12, fontSize: 13.5, fontWeight: 600 }}>
          {toast}
        </div>
      )}

      {/* ═══ 5-LEVEL CASCADING HIERARCHY FILTER BAR ═══ */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 16,
        padding: '16px 20px',
        marginBottom: 18,
        boxShadow: '0 4px 16px rgba(15,23,42,0.03)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 12, alignItems: 'center' }}>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 5, textTransform: 'uppercase' }}>
              <Building2 size={12} color="#7c3aed" /> Department
            </label>
            <select
              className={styles.select}
              style={{ width: '100%' }}
              value={selectedDept}
              onChange={e => {
                setSelectedDept(e.target.value);
                setSelectedYear('all');
                setSelectedBatch('all');
                setSelectedSection('all');
              }}
            >
              <option value="all">All Departments</option>
              {departments.map(d => (
                <option key={d.code} value={d.code}>{d.name} ({d.code})</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 5, textTransform: 'uppercase' }}>
              <Calendar size={12} color="#7c3aed" /> Academic Year
            </label>
            <select
              className={styles.select}
              style={{ width: '100%' }}
              value={selectedYear}
              onChange={e => {
                setSelectedYear(e.target.value);
                setSelectedBatch('all');
                setSelectedSection('all');
              }}
            >
              <option value="all">All Academic Years</option>
              {academicYears.map(yr => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 5, textTransform: 'uppercase' }}>
              <Layers size={12} color="#7c3aed" /> Batch
            </label>
            <select
              className={styles.select}
              style={{ width: '100%' }}
              value={selectedBatch}
              onChange={e => {
                setSelectedBatch(e.target.value);
                setSelectedSection('all');
              }}
            >
              <option value="all">All Batches ({availableBatches.length})</option>
              {availableBatches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 5, textTransform: 'uppercase' }}>
              <Users size={12} color="#7c3aed" /> Section
            </label>
            <select
              className={styles.select}
              style={{ width: '100%' }}
              value={selectedSection}
              onChange={e => setSelectedSection(e.target.value)}
            >
              <option value="all">All Sections ({availableSections.length})</option>
              {availableSections.map(s => (
                <option key={s.section_id} value={s.section_id}>
                  Section {s.section_name} {s.batch_name ? `(${s.batch_name})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 5, textTransform: 'uppercase' }}>
              <BookOpen size={12} color="#7c3aed" /> Subject
            </label>
            <select
              className={styles.select}
              style={{ width: '100%' }}
              value={selectedSubject}
              onChange={e => setSelectedSubject(e.target.value)}
            >
              <option value="all">All Assigned Subjects ({availableSubjects.length})</option>
              {availableSubjects.map(s => (
                <option key={s.subject_id} value={s.subject_id}>
                  {s.subject_name} ({s.subject_code})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ═══ NAVIGATION TABS ═══ */}
      <div className={styles.tabRow} style={{ marginBottom: 18, flexWrap: 'wrap' }}>
        {([
          { id: 'roster' as Tab,        label: 'Class Roster & Student 360°', Icon: Users },
          { id: 'interventions' as Tab, label: 'Interventions',               Icon: ClipboardList },
          { id: 'extensions' as Tab,    label: 'Deadline Extensions',         Icon: CalendarClock },
          { id: 'announcements' as Tab, label: 'Class Announcements',         Icon: Megaphone },
          { id: 'heatmap' as Tab,       label: 'Mastery Heatmap',             Icon: Flame },
          { id: 'insights' as Tab,      label: 'Early Warning & Hints',       Icon: TrendingUp },
          { id: 'notes' as Tab,         label: 'Private Faculty Notes',       Icon: StickyNote },
        ]).map(t => (
          <button
            key={t.id}
            className={`${styles.tabChip} ${tab === t.id ? styles.tabChipActive : ''}`}
            onClick={() => setTab(t.id)}
          >
            <t.Icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {/* ═══ TAB 1: CLASS ROSTER & STUDENT 360° DIRECTORY ═══ */}
      {tab === 'roster' && (
        <>
          {/* Assigned Section-Subject Cards Strip */}
          {matchingSectionSubjects.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, marginBottom: 18 }}>
              {matchingSectionSubjects.map(ss => {
                const isSelected = selectedSection === ss.section_id && selectedSubject === ss.subject_id;
                return (
                  <div
                    key={ss.section_subject_id}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedSection('all');
                        setSelectedSubject('all');
                      } else {
                        setSelectedSection(ss.section_id);
                        setSelectedSubject(ss.subject_id);
                      }
                    }}
                    style={{
                      background: isSelected ? 'linear-gradient(135deg, #f5f3ff, #ede9fe)' : '#ffffff',
                      border: isSelected ? '1.5px solid #7c3aed' : '1px solid #e2e8f0',
                      borderRadius: 14,
                      padding: '14px 16px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span className={`${styles.pill} ${styles.pillBlue}`} style={{ fontSize: 10.5 }}>
                        {ss.department_code || 'CSE'} · {ss.academic_year || 'Current'}
                      </span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: '#7c3aed' }}>
                        Section {ss.section_name}
                      </span>
                    </div>
                    <div style={{ fontSize: 14.5, fontWeight: 800, color: '#0f172a', marginBottom: 2 }}>
                      {ss.subject_name} ({ss.subject_code})
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                      <span><strong>{ss.student_count}</strong> Students ({ss.batch_name || 'Batch'})</span>
                      <span><strong>{ss.experiment_count}</strong> Experiments</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Cohort KPI Row */}
          <div className={styles.kpiRow}>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Enrolled Students</p>
              <p className={styles.kpiValue} style={{ color: '#4f46e5' }}>
                {cohortData?.kpis?.students_in_scope?.value ?? (cohortData?.kpis as any)?.total_students ?? roster.length}
              </p>
              <p className={styles.kpiSub}>Click any student for 360° telemetry</p>
            </div>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Class Average Score</p>
              <p className={styles.kpiValue} style={{ color: '#059669' }}>
                {cohortData?.kpis?.avg_grade?.value ?? ((cohortData?.kpis as any)?.avg_score != null ? `${(cohortData?.kpis as any).avg_score.toFixed(1)}%` : '—')}
              </p>
              <p className={styles.kpiSub}>
                {(() => {
                  const cov = cohortData?.kpis?.avg_grade?.coverage;
                  if (!cov || cov.sample_size === 0) return 'No graded work yet';
                  if (cov.is_representative) return `Mean of ${cov.sample_size} graded students`;
                  return `Only ${cov.sample_size} of ${cov.cohort_size} students graded`;
                })()}
              </p>
            </div>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>At-Risk Students</p>
              <p className={styles.kpiValue} style={{ color: '#dc2626' }}>
                {cohortData?.kpis?.high_critical_risk?.value ?? (cohortData?.kpis as any)?.at_risk_count ?? 0}
              </p>
              <p className={styles.kpiSub}>Critical or high risk band</p>
            </div>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Top Performers</p>
              <p className={styles.kpiValue} style={{ color: '#7c3aed' }}>
                {(cohortData?.kpis as any)?.top_performers_count
                  ?? (cohortData?.students ?? []).filter((s: any) => isExcelling(s)).length}
              </p>
              <p className={styles.kpiSub}>Average grade ≥ 85% (mastery not yet measured)</p>
            </div>
          </div>

          {/* Student Roster & 360 Table */}
          <div className={styles.sectionCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="Search student name, roll, email..."
                    style={{ paddingLeft: 30, maxWidth: 260, height: 36, fontSize: 13 }}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className={styles.tabRow} style={{ gap: 6 }}>
                  {([
                    { id: 'all', label: 'All Students' },
                    { id: 'at_risk', label: 'At-Risk' },
                    { id: 'attention', label: 'Needs Attention' },
                    { id: 'on_track', label: 'On Track' },
                    { id: 'top', label: 'Excelling' },
                  ] as const).map(f => (
                    <button
                      key={f.id}
                      type="button"
                      className={`${styles.tabChip} ${riskFilter === f.id ? styles.tabChipActive : ''}`}
                      onClick={() => setRiskFilter(f.id)}
                      style={{ fontSize: 12, padding: '5px 10px' }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <span className={styles.sectionSub}>
                {noClassMatch || totalFiltered === 0
                  ? 'No students in this scope'
                  : `Showing ${pageStart + 1}–${Math.min(pageStart + pageSize, totalFiltered)} of ${totalFiltered}${totalFiltered < (cohortData?.students?.length ?? 0) ? ` (filtered from ${cohortData?.students?.length})` : ''}`}
                {' · '}Click any row to open the <strong>Student 360° Diagnostic Drawer</strong>
              </span>
            </div>

            {loadingCohort ? (
              <div style={{ padding: 28, textAlign: 'center', color: '#64748b' }}>
                <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                Loading class student roster & 360° metrics…
              </div>
            ) : cohortStudents.length === 0 ? (
              <p className={styles.sectionSub} style={{ padding: 20, textAlign: 'center' }}>
                {noClassMatch
                  ? 'That department / year / batch / section / subject combination matches none of your classes.'
                  : searchQuery.trim()
                    ? `No student matches “${searchQuery.trim()}”${riskFilter !== 'all' ? ' in this risk filter' : ''}.`
                    : 'No students are enrolled in this class yet.'}
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Student & Roll No.</th>
                      <th>Section & Batch</th>
                      <th>Status Band</th>
                      <th>Avg Score</th>
                      <th>Labs Completed</th>
                      <th>Attendance</th>
                      <th>Mastery & Focus</th>
                      <th style={{ textAlign: 'right' }}>360° & Quick Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedStudents.map((st: any) => {
                      const isRisk = isAtRisk(st);
                      const watch = needsAttention(st);
                      const isTop = isExcelling(st);
                      // `?? 0` rendered "0.0%" for a student with no grades at all.
                      const avgScore = st.avg_score ?? st.grade_avg ?? null;
                      const completedExps = st.completed_experiments ?? st.completion?.completed ?? 0;
                      const totalExps = st.total_experiments ?? st.completion?.total ?? 0;
                      // `?? 0` here used to render "Mastery 0%" for every student
                      // whose mastery was never measured — a fake number, not a dash.
                      const masteryScore = st.mastery_score ?? st.mastery_pct ?? null;
                      return (
                        <tr
                          key={st.student_id}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setSelectedStudent360(st.student_id)}
                        >
                          <td>
                            <div className={styles.tdStrong} style={{ color: '#4f46e5', display: 'flex', alignItems: 'center', gap: 6 }}>
                              {st.student_name} <ArrowUpRight size={13} color="#7c3aed" />
                            </div>
                            <div style={{ fontSize: 11.5, color: '#64748b' }}>
                              {st.roll_number || 'No Roll'} {st.email ? `· ${st.email}` : ''}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1e293b' }}>
                              {st.section_name ? `Section ${st.section_name}` : activeSectionName ? `Section ${activeSectionName}` : 'Assigned Section'}
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>
                              {st.subject_name || activeSubjectName || 'All Assigned Subjects'}
                            </div>
                          </td>
                          <td>
                            <span className={`${styles.pill} ${
                              isRisk ? styles.pillRed : watch ? styles.pillAmber : styles.pillGreen
                            }`}>
                              {isRisk ? '⚠ At risk' : watch ? '👀 Needs attention' : '✓ On track'}
                              {isTop && <span style={{ marginLeft: 4 }}>· ⭐</span>}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontWeight: 800, fontSize: 14, color: avgScore >= 70 ? '#059669' : avgScore >= 45 ? '#d97706' : '#dc2626' }}>
                              {avgScore != null ? `${typeof avgScore === 'number' ? avgScore.toFixed(1) : avgScore}%` : '—'}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
                              {completedExps} / {totalExps}
                            </span>
                          </td>
                          <td>
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                // Unmeasured attendance used to be coloured green.
                                color: st.attendance_rate == null ? '#94a3b8' : st.attendance_rate < 75 ? '#dc2626' : '#059669',
                              }}
                            >
                              {st.attendance_rate != null ? `${Math.round(st.attendance_rate)}%` : '—'}
                              {/* The denominator matters: 0% of 1 lab is not the same
                                  signal as 0% of 14. */}
                              {st.attendance_sessions ? (
                                <span style={{ fontSize: 10.5, fontWeight: 500, color: '#94a3b8', marginLeft: 4 }}>
                                  /{st.attendance_sessions} lab{st.attendance_sessions > 1 ? 's' : ''}
                                </span>
                              ) : null}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontSize: 11.5, color: '#475569' }}>
                              Mastery: <strong>{masteryScore != null ? `${Math.round(masteryScore)}%` : '—'}</strong>
                              {' · '}
                              Focus: <strong>{st.focus_score != null ? `${Math.round(st.focus_score)}%` : '—'}</strong>
                            </div>
                          </td>
                          <td style={{ textAlign: 'right' }} onClick={ev => ev.stopPropagation()}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                              <button
                                type="button"
                                className={styles.primaryBtn}
                                style={{ padding: '5px 10px', fontSize: 11.5 }}
                                onClick={() => setSelectedStudent360(st.student_id)}
                              >
                                <Eye size={12} /> 360° View
                              </button>
                              <button
                                type="button"
                                className={styles.ghostBtn}
                                style={{ padding: '5px 8px', fontSize: 11.5 }}
                                onClick={() => triggerStudentAction(st.student_id, 'extensions')}
                                title="Grant deadline extension"
                              >
                                <CalendarClock size={12} /> Extend
                              </button>
                              <button
                                type="button"
                                className={styles.ghostBtn}
                                style={{ padding: '5px 8px', fontSize: 11.5 }}
                                onClick={() => triggerStudentAction(st.student_id, 'interventions')}
                                title="Log intervention"
                              >
                                <ClipboardList size={12} /> Intervene
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination — the roster used to render every student in one table. */}
            {!loadingCohort && totalFiltered > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                  padding: '12px 16px 2px',
                  borderTop: '1px solid #eef2f7',
                  marginTop: 10,
                }}
              >
                <span style={{ fontSize: 12.5, color: '#64748b' }}>
                  Showing <strong style={{ color: '#334155' }}>{pageStart + 1}–{Math.min(pageStart + pageSize, totalFiltered)}</strong> of{' '}
                  <strong style={{ color: '#334155' }}>{totalFiltered}</strong> students
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#64748b' }}>
                    Rows
                    <select
                      className={styles.select}
                      style={{ width: 'auto', padding: '4px 8px', fontSize: 12.5 }}
                      value={pageSize}
                      onChange={e => setPageSize(Number(e.target.value))}
                    >
                      {[10, 25, 50, 100].map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </label>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      type="button"
                      className={styles.ghostBtn}
                      style={{ padding: '4px 9px', fontSize: 12 }}
                      disabled={safePage <= 1}
                      onClick={() => setPage(Math.max(1, safePage - 1))}
                      title="Previous page"
                    >
                      <ChevronLeft size={13} /> Prev
                    </button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(n => n === 1 || n === totalPages || Math.abs(n - safePage) <= 1)
                      .reduce<Array<number | 'gap'>>((acc, n) => {
                        if (acc.length && typeof acc[acc.length - 1] === 'number' && n - (acc[acc.length - 1] as number) > 1) {
                          acc.push('gap');
                        }
                        acc.push(n);
                        return acc;
                      }, [])
                      .map((n, idx) =>
                        n === 'gap' ? (
                          <span key={`gap-${idx}`} style={{ fontSize: 12, color: '#94a3b8', padding: '0 2px' }}>…</span>
                        ) : (
                          <button
                            key={n}
                            type="button"
                            className={n === safePage ? styles.primaryBtn : styles.ghostBtn}
                            style={{ padding: '4px 9px', fontSize: 12, minWidth: 30 }}
                            onClick={() => setPage(n)}
                          >
                            {n}
                          </button>
                        )
                      )}

                    <button
                      type="button"
                      className={styles.ghostBtn}
                      style={{ padding: '4px 9px', fontSize: 12 }}
                      disabled={safePage >= totalPages}
                      onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                      title="Next page"
                    >
                      Next <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'interventions' && (
        <InterventionsTab
          toast3={toast3}
          roster={roster}
          preselectedStudentId={preselectedActionStudentId}
          onInspectStudent={sid => setSelectedStudent360(sid)}
        />
      )}
      {tab === 'heatmap' && <HeatmapTab />}
      {tab === 'insights' && <InsightsTab toast3={toast3} />}
      {tab === 'announcements' && <AnnouncementsTab toast3={toast3} />}
      {tab === 'extensions' && (
        <ExtensionsTab
          toast3={toast3}
          roster={roster}
          preselectedStudentId={preselectedActionStudentId}
        />
      )}
      {tab === 'notes' && (
        <NotesTab
          toast3={toast3}
          roster={roster}
          preselectedStudentId={preselectedActionStudentId}
        />
      )}

      {/* Global Slide-Over Student 360° Diagnostic Drawer */}
      <Student360Drawer
        studentId={selectedStudent360}
        isOpen={Boolean(selectedStudent360)}
        onClose={() => setSelectedStudent360(null)}
      />
    </InstructorShell>
  );
}

// ═══════════════════════ F1 — Interventions ═══════════════════════

function InterventionsTab({
  toast3,
  roster,
  preselectedStudentId,
  onInspectStudent,
}: {
  toast3: (m: string) => void;
  roster: RosterStudent[];
  preselectedStudentId?: string;
  onInspectStudent: (sid: string) => void;
}) {
  const [rows, setRows] = useState<InterventionRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<'open' | 'resolved' | 'all'>('open');
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(Boolean(preselectedStudentId));
  const [studentId, setStudentId] = useState(preselectedStudentId || '');
  const [actionType, setActionType] = useState('talked_to_student');
  const [note, setNote] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [saving, setSaving] = useState(false);

  const [outcomeFor, setOutcomeFor] = useState<InterventionRow | null>(null);
  const [outcome, setOutcome] = useState('improved');
  const [outcomeNote, setOutcomeNote] = useState('');

  const load = useCallback(async (f: 'open' | 'resolved' | 'all') => {
    setLoading(true);
    try {
      const res = await experienceService.listInterventions(f === 'all' ? undefined : f);
      setRows(res.interventions);
    } catch { toast3('Could not load interventions.'); }
    finally { setLoading(false); }
  }, [toast3]);

  useEffect(() => { load(statusFilter); }, [statusFilter, load]);

  useEffect(() => {
    if (preselectedStudentId) {
      setStudentId(preselectedStudentId);
      setShowForm(true);
    }
  }, [preselectedStudentId]);

  const studentOptions = useMemo(() => {
    const seen = new Map<string, string>();
    roster.forEach(r => seen.set(r.student_id, `${r.full_name} (${r.roll_number || 'No Roll'})`));
    rows.forEach(r => {
      if (!seen.has(r.student_id)) seen.set(r.student_id, r.student_name ?? 'Student');
    });
    return Array.from(seen.entries());
  }, [rows, roster]);

  useEffect(() => {
    if (!studentId && studentOptions.length > 0) {
      setStudentId(studentOptions[0][0]);
    }
  }, [studentOptions, studentId]);

  const create = async () => {
    if (!studentId) { toast3('Pick a student.'); return; }
    setSaving(true);
    try {
      await experienceService.createIntervention({
        student_id: studentId,
        action_type: actionType,
        note: note || undefined,
        follow_up_at: followUp ? new Date(followUp).toISOString() : undefined,
      });
      toast3('Intervention recorded.');
      setShowForm(false); setNote(''); setFollowUp('');
      load(statusFilter);
    } catch (e: unknown) {
      toast3((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to record.');
    } finally { setSaving(false); }
  };

  const saveOutcome = async () => {
    if (!outcomeFor) return;
    try {
      await experienceService.setInterventionOutcome(outcomeFor.id, outcome, outcomeNote || undefined);
      toast3('Outcome saved.');
      setOutcomeFor(null); setOutcomeNote('');
      load(statusFilter);
    } catch { toast3('Failed to save outcome.'); }
  };

  return (
    <>
      <div className={styles.actionRow}>
        <div className={styles.tabRow}>
          {(['open', 'resolved', 'all'] as const).map(f => (
            <button key={f} className={`${styles.tabChip} ${statusFilter === f ? styles.tabChipActive : ''}`}
              onClick={() => setStatusFilter(f)}>
              {f === 'open' ? 'Open' : f === 'resolved' ? 'Resolved' : 'All'}
            </button>
          ))}
        </div>
        <button className={styles.primaryBtn} onClick={() => setShowForm(s => !s)}>
          <Plus size={14} /> Record Intervention
        </button>
      </div>

      {showForm && (
        <div className={styles.sectionCard} style={{ marginBottom: 16 }}>
          <p className={styles.sectionTitle} style={{ marginBottom: 12 }}>New Faculty Intervention</p>
          <div className={styles.gridTwo}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Student</label>
              <select className={styles.select} value={studentId} onChange={e => setStudentId(e.target.value)}>
                {studentOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Action Taken</label>
              <select className={styles.select} value={actionType} onChange={e => setActionType(e.target.value)}>
                {Object.entries(ACTION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Notes</label>
            <textarea className={styles.textarea} value={note} onChange={e => setNote(e.target.value)}
              placeholder="What was discussed or arranged with the student…" />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Follow-up Date (optional)</label>
            <input className={styles.input} type="datetime-local" value={followUp}
              onChange={e => setFollowUp(e.target.value)} />
          </div>
          <button className={styles.primaryBtn} onClick={create} disabled={saving}>
            {saving ? 'Saving…' : 'Save Intervention'}
          </button>
        </div>
      )}

      <div className={styles.sectionCard}>
        {loading ? (
          <Loader2 size={18} className="animate-spin" style={{ margin: '20px auto', display: 'block' }} />
        ) : rows.length === 0 ? (
          <p className={styles.sectionSub}>No {statusFilter !== 'all' ? statusFilter : ''} interventions recorded.</p>
        ) : (
          <div className={styles.list}>
            {rows.map(r => (
              <div key={r.id} className={styles.listRow}>
                <div className={styles.rowBody}>
                  <p className={styles.rowTitle} style={{ cursor: 'pointer', color: '#4f46e5' }} onClick={() => onInspectStudent(r.student_id)}>
                    {r.student_name} — {ACTION_LABELS[r.action_type] ?? r.action_type}
                  </p>
                  {r.note && <p className={styles.rowMeta}>{r.note}</p>}
                  <p className={styles.rowSub}>
                    {fmtDT(r.created_at)}
                    {r.follow_up_at && <> · follow-up {fmtDT(r.follow_up_at)}</>}
                  </p>
                </div>
                <div className={styles.rowSide} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className={styles.pill} style={{
                    color: OUTCOME_COLORS[r.outcome], borderColor: OUTCOME_COLORS[r.outcome],
                    border: `1.5px solid ${OUTCOME_COLORS[r.outcome]}55`,
                  }}>{r.outcome}</span>
                  <button className={styles.ghostBtn} onClick={() => onInspectStudent(r.student_id)}>
                    <Eye size={13} /> 360°
                  </button>
                  {r.outcome === 'open' && (
                    <button className={styles.ghostBtn}
                      onClick={() => { setOutcomeFor(r); setOutcome('improved'); setOutcomeNote(''); }}>
                      <CheckCircle2 size={13} /> Close loop
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {outcomeFor && (
        <div className={styles.modalOverlay} onClick={() => setOutcomeFor(null)}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Outcome — {outcomeFor.student_name}</h2>
              <button className={styles.closeBtn} onClick={() => setOutcomeFor(null)}><X size={16} /></button>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Did the student improve?</label>
              <select className={styles.select} value={outcome} onChange={e => setOutcome(e.target.value)}>
                <option value="improved">Improved</option>
                <option value="no_change">No change</option>
                <option value="worsened">Worsened</option>
                <option value="open">Keep open</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Notes</label>
              <textarea className={styles.textarea} value={outcomeNote} onChange={e => setOutcomeNote(e.target.value)} />
            </div>
            <button className={styles.primaryBtn} onClick={saveOutcome}><TrendingUp size={13} /> Save outcome</button>
          </div>
        </div>
      )}
    </>
  );
}

// ═══════════════════════ T2-6/T2-8/T3-16 — Insights ═══════════════════════

function InsightsTab({ toast3 }: { toast3: (m: string) => void }) {
  const [sectionSubjects, setSectionSubjects] = useState<Array<{ section_subject_id: string; subject_name: string; section_name: string }>>([]);
  const [ssId, setSsId] = useState('');
  const [warnings, setWarnings] = useState<Array<import('@/services/experience.service').EarlyWarningRow>>([]);
  const [noDataCount, setNoDataCount] = useState(0);
  const [experiments, setExperiments] = useState<Array<{ id: string; title: string }>>([]);
  const [expId, setExpId] = useState('');
  const [hint, setHint] = useState<import('@/services/experience.service').HintEffectiveness | null>(null);
  const [errors, setErrors] = useState<import('@/services/experience.service').ErrorAnalysis | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    experienceService.announcementRecipients()
      .then(r => { setSectionSubjects(r.recipients); if (r.recipients[0]) setSsId(r.recipients[0].section_subject_id); })
      .catch(() => {});
    import('@/services/experiment.service').then(({ experimentService }) =>
      experimentService.listMine().then(e => { setExperiments(e as any); if ((e as any[])[0]) setExpId((e as any[])[0].id); })
        .catch(() => {}));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, h, er] = await Promise.all([
        ssId ? experienceService.earlyWarning(ssId) : Promise.resolve({ students: [], not_enough_data: 0 }),
        expId ? experienceService.hintEffectiveness(expId) : Promise.resolve(null),
        expId ? experienceService.errorAnalysis(expId) : Promise.resolve(null),
      ]);
      setWarnings(w.students);
      setNoDataCount(w.not_enough_data ?? 0);
      setHint(h);
      setErrors(er);
    } catch { /* keep old data */ }
    finally { setLoading(false); }
  }, [ssId, expId]);

  useEffect(() => { if (ssId || expId) load(); }, [ssId, expId, load]);

  return (
    <>
      <div className={styles.actionRow}>
        <select className={styles.select} style={{ maxWidth: 260 }} value={ssId} onChange={e => setSsId(e.target.value)}>
          <option value="">Select section…</option>
          {sectionSubjects.map(s => <option key={s.section_subject_id} value={s.section_subject_id}>{s.subject_name} — {s.section_name}</option>)}
        </select>
        <select className={styles.select} style={{ maxWidth: 260 }} value={expId} onChange={e => setExpId(e.target.value)}>
          <option value="">Select experiment…</option>
          {experiments.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
        <button className={styles.ghostBtn} onClick={load} disabled={loading}>
          {loading ? <Loader2 size={13} className="animate-spin" /> : <TrendingUp size={13} />} Refresh
        </button>
      </div>

      <div className={styles.sectionCard} style={{ marginBottom: 16 }}>
        <p className={styles.sectionTitle} style={{ marginBottom: 10 }}>Early Warning — Trend-Based Risk Detection</p>
        {warnings.length === 0 ? (
          <p className={styles.sectionSub}>
            No students are trending at risk on the signals this model reads (submissions, mastery, focus, missed
            sessions).
            {noDataCount > 0
              ? ` ${noDataCount} student${noDataCount === 1 ? ' has' : 's have'} no activity data yet, so no risk can be scored for them.`
              : ''}
          </p>
        ) : (
          <div className={styles.list}>
            {warnings.slice(0, 10).map(w => (
              <div key={w.student_id} className={styles.listRow}>
                <div className={styles.rowBody}>
                  <p className={styles.rowTitle}>{w.full_name} <span style={{ fontSize: 12, color: '#9891a6' }}>({w.roll_number ?? '—'})</span></p>
                  <p className={styles.rowMeta}>{w.reasons.join(' · ')}</p>
                </div>
                <span className={styles.pill}
                  style={{
                    color: w.level === 'high' ? '#dc2626' : '#d97706',
                    border: `1.5px solid ${w.level === 'high' ? '#dc262655' : '#d9770655'}`,
                  }}>
                  {w.level.toUpperCase()} · {w.risk_score}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {hint && (
        <div className={styles.sectionCard} style={{ marginBottom: 16 }}>
          <p className={styles.sectionTitle} style={{ marginBottom: 10 }}>Hint Effectiveness — “{hint.title}”</p>
          <div className={styles.kpiRow}>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Hint Users</p>
              <p className={styles.kpiValue}>{hint.hint_users}</p>
              <p className={styles.kpiSub}>Pass rate {hint.pass_rate_hint_users ?? '—'}%</p>
            </div>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>No-Hint Students</p>
              <p className={styles.kpiValue}>{hint.non_hint_users}</p>
              <p className={styles.kpiSub}>Pass rate {hint.pass_rate_non_users ?? '—'}%</p>
            </div>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Avg Hints (Passed)</p>
              <p className={styles.kpiValue}>{hint.avg_hints_passed}</p>
              <p className={styles.kpiSub}>vs {hint.avg_hints_failed} for failed</p>
            </div>
          </div>
        </div>
      )}

      {errors && (
        <div className={styles.sectionCard}>
          <p className={styles.sectionTitle} style={{ marginBottom: 10 }}>Common Compiler & Runtime Errors — “{errors.title}”</p>
          <p className={styles.sectionSub} style={{ marginBottom: 10 }}>
            {errors.error_attempts}/{errors.total_attempts} attempts hit errors ({errors.error_rate_pct}%)
          </p>
          {errors.errors.length === 0 ? (
            <p className={styles.sectionSub}>No compile/runtime errors recorded.</p>
          ) : (
            <div className={styles.list}>
              {errors.errors.slice(0, 8).map(e => (
                <div key={e.label} className={styles.listRow}>
                  <div className={styles.rowBody}>
                    <p className={styles.rowTitle}>{e.label} <span style={{ fontSize: 12, color: '#9891a6' }}>×{e.count}</span></p>
                    <p className={styles.rowMeta} style={{ fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap' }}>{e.sample}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ═══════════════════════ T3-14 — Private notes ═══════════════════════

function NotesTab({
  toast3,
  roster,
  preselectedStudentId,
}: {
  toast3: (m: string) => void;
  roster: RosterStudent[];
  preselectedStudentId?: string;
}) {
  const [studentId, setStudentId] = useState(preselectedStudentId || '');
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<import('@/services/experience.service').TeacherNoteRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (preselectedStudentId) setStudentId(preselectedStudentId);
    else if (!studentId && roster.length > 0) setStudentId(roster[0].student_id);
  }, [roster, studentId, preselectedStudentId]);

  const load = useCallback(async (id: string) => {
    if (!id) { setRows([]); return; }
    setLoading(true);
    try { setRows((await experienceService.listNotes(id)).notes); }
    catch { setRows([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (studentId) load(studentId);
  }, [studentId, load]);

  const add = async () => {
    if (!studentId || !note.trim()) { toast3('Select a student and enter a note.'); return; }
    try {
      await experienceService.addNote(studentId.trim(), note.trim());
      setNote('');
      toast3('Private note saved.');
      load(studentId.trim());
    } catch (e: unknown) {
      toast3((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Save failed.');
    }
  };

  const remove = async (id: string) => {
    try { await experienceService.deleteNote(id); setRows(rows.filter(r => r.id !== id)); }
    catch { toast3('Delete failed.'); }
  };

  return (
    <div className={styles.sectionCard}>
      <p className={styles.sectionTitle} style={{ marginBottom: 4 }}>Private Faculty Notes</p>
      <p className={styles.sectionSub} style={{ marginBottom: 12 }}>
        Only you can view these confidential observations on a student.
      </p>
      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Student</label>
        <select className={styles.select} value={studentId} onChange={e => setStudentId(e.target.value)}>
          {roster.map(s => (
            <option key={s.student_id} value={s.student_id}>
              {s.full_name} ({s.roll_number || 'No Roll'})
            </option>
          ))}
        </select>
      </div>
      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Observation Note</label>
        <textarea className={styles.textarea} rows={3} value={note} onChange={e => setNote(e.target.value)}
          placeholder="Record mentoring context, Viva observations, or follow-up items…" />
      </div>
      <button className={styles.primaryBtn} onClick={add} style={{ marginBottom: 14 }}>
        <Plus size={13} /> Save Private Note
      </button>

      {loading ? (
        <Loader2 size={18} className="animate-spin" style={{ margin: '12px auto', display: 'block' }} />
      ) : rows.length === 0 ? (
        <p className={styles.sectionSub}>No notes for this student yet.</p>
      ) : (
        <div className={styles.list}>
          {rows.map(r => (
            <div key={r.id} className={styles.listRow}>
              <div className={styles.rowBody}>
                <p className={styles.rowTitle}>{r.note}</p>
                <p className={styles.rowMeta}>{fmtDT(r.created_at)}</p>
              </div>
              <div className={styles.rowSide}>
                <button className={styles.ghostBtn} onClick={() => remove(r.id)}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HeatmapTab() {
  const [data, setData] = useState<MasteryHeatmap | null>(null);
  const [threshold, setThreshold] = useState(40);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    experienceService.masteryHeatmap(threshold)
      .then(d => { if (mounted) setData(d); })
      .catch(() => { if (mounted) setData(null); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [threshold]);

  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>Class Mastery Heatmap — Students × Concepts</h2>
          <p className={styles.sectionSub}>
            Concepts ordered weakest-first. Red = below threshold, amber = close, green = solid.
          </p>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#374151' }}>
          Threshold
          <input type="number" min={0} max={100} value={threshold}
            onChange={e => setThreshold(Math.max(0, Math.min(100, Number(e.target.value) || 40)))}
            style={{ width: 64, padding: '6px 8px', borderRadius: 8, border: '1px solid #ddd6ee' }} />
        </label>
      </div>

      {loading ? (
        <Loader2 size={18} className="animate-spin" style={{ margin: '20px auto', display: 'block' }} />
      ) : !data || data.students.length === 0 || data.concepts.length === 0 ? (
        <p className={styles.sectionSub}>No mastery data yet — it builds up as students complete experiments.</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {data.concept_avgs.slice(0, 5).map(c => (
              <span key={c.concept} style={{
                fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 999,
                background: c.avg < data.threshold ? 'rgba(220,38,38,.1)' : 'rgba(245,158,11,.1)',
                color: c.avg < data.threshold ? '#b91c1c' : '#92400e',
              }}>
                {c.concept} · avg {c.avg}
              </span>
            ))}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 3, minWidth: 600 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '4px 8px', fontSize: 11.5, color: '#726a85' }}>Student</th>
                  {data.concepts.map(c => (
                    <th key={c} title={c} style={{ padding: '4px 6px', fontSize: 10.5, color: '#726a85', fontWeight: 700, maxWidth: 90 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.students.map((s) => {
                  const rowVals = data.values.find(v => v.student_id === s.student_id)?.values ?? [];
                  return (
                    <tr key={s.student_id}>
                      <td style={{ padding: '2px 8px', fontSize: 12.5, fontWeight: 600, color: '#201b2e', whiteSpace: 'nowrap' }}>
                        {s.full_name}
                      </td>
                      {rowVals.map((v, j) => {
                        const st = cellColor(v, data.threshold);
                        return (
                          <td key={j} title={v == null ? 'no data' : `${data.concepts[j]}: ${v}`}
                            style={{ ...st, borderRadius: 6, textAlign: 'center', fontSize: 10.5, fontWeight: 700, padding: '5px 7px', minWidth: 42 }}>
                            {v ?? '–'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════ F3 — Announcements ═══════════════════════

function AnnouncementsTab({ toast3 }: { toast3: (m: string) => void }) {
  const [recipients, setRecipients] = useState<Array<{ section_subject_id: string; subject_name: string; section_name: string; student_count: number }>>([]);
  const [instructorNotices, setInstructorNotices] = useState<any[]>([]);
  const [target, setTarget] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const loadNotices = () => {
    experienceService.listInstructorAnnouncements()
      .then(res => setInstructorNotices(res.announcements))
      .catch(() => {});
  };

  useEffect(() => {
    experienceService.announcementRecipients()
      .then(r => {
        setRecipients(r.recipients);
        if (r.recipients[0]) setTarget(r.recipients[0].section_subject_id);
      })
      .catch(() => {});
    loadNotices();
  }, []);

  const send = async () => {
    if (!target || !title.trim() || !message.trim()) { toast3('Fill class, title and message.'); return; }
    setSending(true);
    try {
      const res = await experienceService.instructorAnnounce({ section_subject_id: target, title, message });
      toast3(`Announcement sent to ${res.sent_to} students.`);
      setTitle(''); setMessage('');
      loadNotices();
    } catch (e: unknown) {
      toast3((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Send failed.');
    } finally { setSending(false); }
  };

  const markRead = async (id: string) => {
    try {
      await experienceService.markInstructorAnnouncementRead(id);
      setInstructorNotices(prev => prev.map(a => a.id === id ? { ...a, is_read: true } : a));
    } catch {}
  };

  const toggleLike = async (id: string) => {
    try {
      const res = await experienceService.toggleInstructorAnnouncementLike(id);
      setInstructorNotices(prev => prev.map(a => a.id === id ? { ...a, is_liked: res.liked, likes_count: res.likes_count } : a));
    } catch {}
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className={styles.sectionCard}>
        <p className={styles.sectionTitle} style={{ marginBottom: 4 }}>Broadcast to Assigned Section</p>
        <p className={styles.sectionSub} style={{ marginBottom: 14 }}>
          Notifies all students enrolled in the selected Section & Subject.
        </p>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Target Class (Subject × Section)</label>
          <select className={styles.select} value={target} onChange={e => setTarget(e.target.value)}>
            <option value="">Select class…</option>
            {recipients.map(r => (
              <option key={r.section_subject_id} value={r.section_subject_id}>
                {r.subject_name} — Section {r.section_name} · {r.student_count} students
              </option>
            ))}
          </select>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Announcement Title</label>
          <input className={styles.input} value={title} onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Lab 4 Pre-Lab Quiz & Preparation Notes" maxLength={200} />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Message</label>
          <textarea className={styles.textarea} rows={3} value={message} onChange={e => setMessage(e.target.value)}
            placeholder="Write your announcement…" />
        </div>
        <button className={styles.primaryBtn} onClick={send} disabled={sending || !target}>
          <Send size={13} /> {sending ? 'Sending…' : 'Send Announcement'}
        </button>
      </div>

      <div className={styles.sectionCard}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <p className={styles.sectionTitle} style={{ margin: 0 }}>Campus Notices & Broadcast History</p>
            <p className={styles.sectionSub} style={{ margin: '2px 0 0' }}>
              Institutional announcements and section notices.
            </p>
          </div>
          <button className={styles.ghostBtn} onClick={loadNotices} style={{ padding: '6px 10px', fontSize: 12 }}>
            Refresh
          </button>
        </div>

        {instructorNotices.length === 0 ? (
          <p className={styles.sectionSub}>No announcements found.</p>
        ) : (
          <div className={styles.list}>
            {instructorNotices.map(a => (
              <div key={a.id} className={styles.listRow} style={{ borderLeft: a.priority === 'urgent' ? '3px solid #dc2626' : a.priority === 'important' ? '3px solid #f59e0b' : '3px solid transparent' }}>
                <div className={styles.rowBody}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p className={styles.rowTitle}>{a.title}</p>
                    <span style={{ fontSize: 11, color: '#9891a6' }}>• {a.author_name || 'Admin'}</span>
                  </div>
                  <p className={styles.rowMeta} style={{ margin: '4px 0', fontSize: 12.5, color: '#4b5563' }}>{a.message}</p>
                  <p className={styles.rowSub} style={{ fontSize: 11, color: '#9ca3af' }}>
                    {new Date(a.sent_at || a.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className={styles.rowSide} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button className={styles.ghostBtn} onClick={() => toggleLike(a.id)} style={{ fontSize: 11, color: a.is_liked ? '#dc2626' : '#6b7280' }}>
                    ❤️ {a.likes_count || 0}
                  </button>
                  <button className={styles.ghostBtn} onClick={() => markRead(a.id)} style={{ fontSize: 11, color: a.is_read ? '#059669' : '#6b7280' }}>
                    {a.is_read ? '✓ Read' : 'Mark Read'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════ F4 — Extensions ═══════════════════════

function ExtensionsTab({
  toast3,
  roster,
  preselectedStudentId,
}: {
  toast3: (m: string) => void;
  roster: RosterStudent[];
  preselectedStudentId?: string;
}) {
  const [experiments, setExperiments] = useState<Array<{ id: string; title: string }>>([]);
  const [expId, setExpId] = useState('');
  const [rows, setRows] = useState<ExtensionRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [studentId, setStudentId] = useState(preselectedStudentId || '');
  const [until, setUntil] = useState('');
  const [reason, setReason] = useState('');
  const [excused, setExcused] = useState(false);
  const [granting, setGranting] = useState(false);

  useEffect(() => {
    import('@/services/experiment.service').then(({ experimentService }) =>
      experimentService.listMine().then(e => {
        const list = e as Array<{ id: string; title: string }>;
        setExperiments(list);
        if (list.length > 0) setExpId(list[0].id);
      })
    ).catch(() => {});
  }, []);

  useEffect(() => {
    if (preselectedStudentId) setStudentId(preselectedStudentId);
    else if (!studentId && roster.length > 0) setStudentId(roster[0].student_id);
  }, [roster, studentId, preselectedStudentId]);

  const load = useCallback(async (id: string) => {
    if (!id) { setRows([]); return; }
    setLoading(true);
    try { setRows((await experienceService.listExtensions(id)).extensions); }
    catch { setRows([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(expId); }, [expId, load]);

  const grant = async () => {
    if (!expId || !studentId.trim() || !until) {
      toast3('Pick an experiment, student and date.'); return;
    }
    setGranting(true);
    try {
      await experienceService.grantExtension({
        experiment_id: expId,
        student_id: studentId.trim(),
        extension_until: new Date(until).toISOString(),
        reason: reason || undefined,
        excused,
      });
      toast3('Extension granted — the student was notified.');
      setReason(''); setUntil(''); setExcused(false);
      load(expId);
    } catch (e: unknown) {
      toast3((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to grant.');
    } finally { setGranting(false); }
  };

  const revoke = async (id: string) => {
    if (!confirm('Revoke this extension?')) return;
    try { await experienceService.revokeExtension(id); toast3('Extension revoked.'); load(expId); }
    catch { toast3('Revoke failed.'); }
  };

  return (
    <>
      <div className={styles.sectionCard} style={{ marginBottom: 16 }}>
        <p className={styles.sectionTitle} style={{ marginBottom: 4 }}>Grant Individual Deadline Relief</p>
        <p className={styles.sectionSub} style={{ marginBottom: 12 }}>
          Extends the submission window for a specific student on an experiment and notifies them automatically.
        </p>
        <div className={styles.gridTwo}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Experiment</label>
            <select className={styles.select} value={expId} onChange={e => setExpId(e.target.value)}>
              <option value="">Select experiment…</option>
              {experiments.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Student</label>
            <select className={styles.select} value={studentId} onChange={e => setStudentId(e.target.value)}>
              {roster.map(s => (
                <option key={s.student_id} value={s.student_id}>
                  {s.full_name} ({s.roll_number || 'No Roll'})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className={styles.gridTwo}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Extended Until</label>
            <input className={styles.input} type="datetime-local" value={until}
              onChange={e => setUntil(e.target.value)} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Reason</label>
            <input className={styles.input} value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Medical leave / approved absence…" />
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', marginBottom: 12 }}>
          <input type="checkbox" checked={excused} onChange={e => setExcused(e.target.checked)} />
          <AlertTriangle size={13} /> Excuse missed live session attendance for this experiment
        </label>
        <button className={styles.primaryBtn} onClick={grant} disabled={granting || !expId}>
          <CalendarClock size={13} /> {granting ? 'Granting…' : 'Grant Extension'}
        </button>
      </div>

      <div className={styles.sectionCard}>
        <p className={styles.sectionTitle} style={{ marginBottom: 10 }}>Active Extensions</p>
        {loading ? (
          <Loader2 size={18} className="animate-spin" style={{ margin: '12px auto', display: 'block' }} />
        ) : rows.length === 0 ? (
          <p className={styles.sectionSub}>No extensions granted{expId ? ' for this experiment' : ''}.</p>
        ) : (
          <div className={styles.list}>
            {rows.map(r => (
              <div key={r.id} className={styles.listRow}>
                <div className={styles.rowBody}>
                  <p className={styles.rowTitle}>{r.student_name ?? r.student_id} — {r.experiment_title ?? r.experiment_id}</p>
                  <p className={styles.rowMeta}>
                    Until {fmtDT(r.extension_until)}{r.excused ? ' · excused' : ''}{r.reason ? ` · ${r.reason}` : ''}
                  </p>
                </div>
                <div className={styles.rowSide}>
                  <button className={styles.ghostBtn} onClick={() => revoke(r.id)} title="Revoke">
                    <Trash2 size={13} /> Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
