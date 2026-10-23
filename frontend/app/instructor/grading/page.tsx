'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ClipboardCheck, CheckCircle2, History, Lock, Save, X,
  Sparkles, Loader2, TrendingUp, FileCheck, Award, AlertTriangle, BookOpen,
  Calendar, Users, ShieldAlert, ShieldCheck, Download, Search, Mic2,
  Code2, Terminal, Layers, ChevronLeft, ChevronRight, Eye, Clock, Building2, Filter,
  RefreshCw
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import { experimentService, type SubjectGradeSummary } from '@/services/experiment.service';
import { submissionService } from '@/services/submission.service';
import { sessionService } from '@/services/session.service';
import { instructorService, type VivaListItem, type VivaDetail } from '@/services/instructor.service';
import { experienceService, type InstructorExam, type ExamAttemptRow } from '@/services/experience.service';
import { exportCSV } from '@/lib/analytics-utils';
import styles from '../shared.module.css';
import hub from './hub.module.css';

interface SectionSubjectItem {
  section_subject_id: string;
  subject_id: string;
  subject_name: string;
  subject_code: string;
  total_marks?: number;
  department_id?: string | null;
  department_name?: string;
  department_code?: string;
  year_id?: string | null;
  academic_year?: string;
  batch_id?: string | null;
  batch_name?: string;
  section_id: string;
  section_name: string;
  student_count: number;
  experiment_count: number;
}

interface ExpOption {
  id: string;
  title: string;
  exp_number: number;
  subject_id?: string;
  delivery_mode?: string;
  weightage?: number;
  grade_scale?: number;
}

interface ModuleSubmissionItem {
  module_id: string;
  module_type: string;
  module_title: string;
  completed: boolean;
  score: number | null;
  completed_at: string | null;
}

interface SubmissionRow {
  id: string;
  student_id: string;
  session_id: string | null;
  full_name: string;
  email?: string | null;
  roll_number: string;
  submission_status?: 'graded' | 'submitted' | 'not_submitted';
  language: string;
  files?: Record<string, string>;
  code_text?: string;
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  test_cases_passed: number | null;
  test_cases_total: number | null;
  execution_time_ms?: number | null;
  quality_grade: string | null;
  loc: number | null;
  cyclomatic_complexity?: number | null;
  compile_status: string | null;
  submitted_at: string | null;
  grade_id?: string | null;
  auto_grade?: number | null;
  manual_grade?: number | null;
  manual_feedback?: string | null;
  viva_grade?: number | null;
  quiz_grade?: number | null;
  code_quality_grade?: number | null;
  hint_deduction?: number | null;
  final_grade?: number | null;
  graded_at?: string | null;
  is_locked?: boolean;
  module_submissions?: ModuleSubmissionItem[];
}

interface ExperimentMeta {
  id: string;
  title: string;
  exp_number: number;
  aim?: string | null;
  weightage: number;
  grade_scale: number;
  rubric: {
    test_cases: number;
    lab_report: number;
    code_quality: number;
    viva: number;
    quiz: number;
  };
  test_cases: Array<{
    id: string;
    input_data: string;
    expected_output: string;
    is_hidden: boolean;
    points: number;
  }>;
}

interface ReplayVersion {
  version_number: number;
  files: Record<string, string>;
  save_type: string;
  saved_at: string | null;
}

interface PlagiarismFlagItem {
  id: string;
  student_a_id: string;
  student_b_id: string;
  similarity_pct: number;
  status: string;
}

interface StudentDossierTarget {
  student_id: string;
  full_name: string;
  roll_number?: string | null;
  email?: string | null;
  subject_score: number;
  /** Weighted points earned out of `points_allocated`. */
  points_earned?: number;
  points_allocated?: number;
  /** Pro-rated percentage of the marks currently allocated (null = none). */
  subject_percent?: number | null;
  assessed_count?: number;
  assessment_count?: number;
  experiment_scores: Record<string, number>;
  experiment_details?: Record<string, {
    final_grade?: number | null;
    auto_grade?: number | null;
    manual_grade?: number | null;
    viva_grade?: number | null;
    quiz_grade?: number | null;
    code_quality_grade?: number | null;
    manual_feedback?: string | null;
    graded_at?: string | null;
    submitted_at?: string | null;
    language?: string | null;
    test_cases_passed?: number | null;
    test_cases_total?: number | null;
    compile_status?: string | null;
  }>;
}

interface RollupRow extends StudentDossierTarget {
  /** Pro-rated subject total (0–100) over the marks currently allocated. */
  pct: number | null;
  /** Unweighted mean of every graded assessment, 0–100. */
  gradedAvg: number | null;
  needsReview: boolean;
  gradedCount: number;
}

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

// ── Hub presentation helpers (kept dependency-free: no chart library) ────────
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('') || '—';
}

function formatScore(value: number | null | undefined): string {
  if (value == null) return '—';
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 100) / 100);
}

/** Sparkline of real per-assessment values. Renders a caption when there is no trend yet. */
function Sparkline({
  values, color = '#7c3aed', width = 112, height = 30, unit = '%', emptyLabel = 'no trend yet',
}: { values: number[]; color?: string; width?: number; height?: number; unit?: string; emptyLabel?: string }) {
  const pts = values.filter(v => typeof v === 'number' && Number.isFinite(v));
  const flat = pts.length > 1 && Math.max(...pts) === Math.min(...pts);
  if (pts.length < 2 || flat) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', fontSize: 10.5, fontWeight: 600, color: '#c2c9d6' }}>
        {pts.length === 0
          ? emptyLabel
          : pts.length === 1
            ? `1 assessment · ${formatScore(pts[0])}${unit}`
            : `flat at ${formatScore(pts[0])}${unit}`}
      </div>
    );
  }
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const span = max - min || 1;
  const step = (width - 4) / (pts.length - 1);
  const coords = pts.map((v, i) => {
    const x = 2 + i * step;
    const y = height - 4 - ((v - min) / span) * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = coords[coords.length - 1].split(',');
  return (
    <svg width={width} height={height} aria-hidden="true" style={{ display: 'block' }}>
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.9}
      />
      <circle cx={last[0]} cy={last[1]} r={2.6} fill={color} />
    </svg>
  );
}

/** Circular gauge for a student's pro-rated subject total. */
function ScoreRing({ pct, size = 46 }: { pct: number | null; size?: number }) {
  const radius = (size - 7) / 2;
  const circumference = 2 * Math.PI * radius;
  const value = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const stroke = pct == null ? '#e5e9f2' : value >= 75 ? '#16a34a' : value >= 50 ? '#d97706' : '#dc2626';
  return (
    <div className={hub.ringWrap} style={{ width: size, height: size }}>
      <svg width={size} height={size} className={hub.ringSvg} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#eef1f7" strokeWidth={4} />
        {pct != null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={`${(value / 100) * circumference} ${circumference}`}
          />
        )}
      </svg>
      <div className={hub.ringText} style={{ color: pct == null ? '#b6becc' : '#0f172a' }}>
        {pct == null ? '—' : Math.round(pct)}
        {pct != null && <span className={hub.ringSub}>%</span>}
      </div>
    </div>
  );
}

export default function GradingPage() {
  const [toast, setToast] = useState<string | null>(null);

  // ── 5-Level Cascading Filter States ──────────────────────────────────────────
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedBatch, setSelectedBatch] = useState<string>('all');
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedAssessment, setSelectedAssessment] = useState<string>('all'); // 'all' = Subject Rollup
  const [statusFilter, setStatusFilter] = useState<'all' | 'submitted' | 'graded' | 'not_submitted' | 'flagged'>('all');
  // Gradebook row filter (rollup view) and the distribution metric toggle.
  const [rollupFilter, setRollupFilter] = useState<'all' | 'review' | 'graded' | 'none'>('all');
  const [distMetric, setDistMetric] = useState<'total' | 'graded'>('total');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Submissions & Experiment metadata state
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [experimentMeta, setExperimentMeta] = useState<ExperimentMeta | null>(null);
  const [examAttempts, setExamAttempts] = useState<ExamAttemptRow[]>([]);

  // Split-Pane Grading Workbench Modal state
  const [grading, setGrading] = useState<SubmissionRow | null>(null);
  const [workbenchTab, setWorkbenchTab] = useState<'code' | 'tests' | 'viva' | 'integrity'>('code');
  // Instructor explicitly overriding a grade the student already viewed
  const [overrideLock, setOverrideLock] = useState(false);
  const [manualGrade, setManualGrade] = useState('');
  // Per-component rubric scores, keyed exactly like Experiment.rubric_*.
  // Empty string = "not entered" → falls back to the auto-computed value.
  const [componentScores, setComponentScores] = useState<Record<string, string>>({});
  // Explicit "graded" ticks per rubric component. Unticked = the weight is
  // removed from the mark entirely (it is not counted as a zero).
  const [assessed, setAssessed] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);

  // Inline Replay versions inside the Workbench
  const [replayVersions, setReplayVersions] = useState<ReplayVersion[]>([]);
  const [selectedVersionIdx, setSelectedVersionIdx] = useState<number>(-1); // -1 = Final Submission
  const [loadingReplay, setLoadingReplay] = useState(false);

  // Student Subject Rollup Dossier Modal state
  const [dossierStudent, setDossierStudent] = useState<StudentDossierTarget | null>(null);

  // Curve modal state
  const [showCurve, setShowCurve] = useState(false);
  const [curveMode, setCurveMode] = useState<'add' | 'factor'>('add');
  const [curveValue, setCurveValue] = useState('5');
  const [curvePreview, setCurvePreview] = useState<{
    affected: number; locked_skipped: number;
    class_avg_before: number | null; class_avg_after: number | null;
    rows: Array<{ student_id: string; before: number | null; after: number | null; locked: boolean }>;
  } | null>(null);
  const [curving, setCurving] = useState(false);

  // Viva detail state inside Workbench
  const [activeViva, setActiveViva] = useState<VivaDetail | null>(null);
  const [loadingVivaDetail, setLoadingVivaDetail] = useState(false);

  const toast3 = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3200); };

  // ── 1. Fetch Assigned Section-Subjects ────────────────────────────────────────
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

  // Sections filtered by Dept, Year, Batch
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

  // Subjects filtered by Dept, Year, Batch, Section
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

  useEffect(() => {
    if (availableSubjects.length > 0) {
      if (!selectedSubject || !availableSubjects.some(s => s.subject_id === selectedSubject)) {
        setSelectedSubject(availableSubjects[0].subject_id);
      }
    }
  }, [availableSubjects, selectedSubject]);

  // ── 2. Fetch Experiments & Exams for Selected Subject ─────────────────────────
  const { data: allExperiments = [] } = useQuery({
    queryKey: ['instructor', 'experiments', 'mine'],
    queryFn: () => experimentService.listMine(),
    staleTime: 60 * 1000,
  });

  const { data: allExams = [] } = useQuery({
    queryKey: ['instructor', 'exams'],
    queryFn: () => experienceService.listExams(),
    staleTime: 60 * 1000,
  });

  const subjectExperiments = useMemo(() => {
    if (!selectedSubject) return [];
    return (allExperiments as ExpOption[]).filter(e => !e.subject_id || e.subject_id === selectedSubject);
  }, [allExperiments, selectedSubject]);

  const subjectExams = useMemo(() => {
    if (!selectedSubject) return [];
    return (allExams as InstructorExam[]).filter(e => !e.subject_id || e.subject_id === selectedSubject);
  }, [allExams, selectedSubject]);

  // ── 3. Subject Grade Summary (Rollup) Query ──────────────────────────────────
  const { data: gradeSummaryData, isLoading: gradeSummaryLoading, refetch: refetchSummary } = useQuery({
    queryKey: ['instructor', 'subject-grade-summary', { subjectId: selectedSubject, sectionId: selectedSection }],
    queryFn: () => experimentService.getSubjectGradeSummary(
      selectedSubject,
      selectedSection !== 'all' ? selectedSection : undefined
    ),
    enabled: !!selectedSubject,
    staleTime: 20 * 1000,
  });

  // ── 4. Submissions / Exam Attempts for Specific Assessment ────────────────────
  const isSelectedExam = useMemo(() => {
    return subjectExams.some(e => e.id === selectedAssessment);
  }, [subjectExams, selectedAssessment]);

  const { data: submissionsData, isLoading: submissionsLoading, refetch: refetchSubmissions } = useQuery({
    queryKey: ['instructor', 'submissions', { expId: selectedAssessment, sectionId: selectedSection }],
    queryFn: () => submissionService.getSubmissions(selectedAssessment, selectedSection),
    enabled: !!selectedAssessment && selectedAssessment !== 'all' && !isSelectedExam,
    staleTime: 20 * 1000,
  });

  const { data: examAttemptsData, isLoading: examAttemptsLoading } = useQuery({
    queryKey: ['instructor', 'exam-attempts', { examId: selectedAssessment }],
    queryFn: () => experienceService.getExamAttempts(selectedAssessment),
    enabled: !!selectedAssessment && selectedAssessment !== 'all' && isSelectedExam,
    staleTime: 20 * 1000,
  });

  // ── 5. Integrated Vivas and Plagiarism Flags for Selected Experiment ─────────
  const { data: vivasData = [] } = useQuery({
    queryKey: ['instructor', 'vivas', { experimentId: selectedAssessment }],
    queryFn: () => instructorService.listVivas(undefined, selectedAssessment),
    enabled: !!selectedAssessment && selectedAssessment !== 'all' && !isSelectedExam,
    staleTime: 30 * 1000,
  });

  const { data: plagiarismData } = useQuery({
    queryKey: ['instructor', 'plagiarism-flags', { experimentId: selectedAssessment }],
    queryFn: () => instructorService.getPlagiarismFlags(selectedAssessment),
    enabled: !!selectedAssessment && selectedAssessment !== 'all' && !isSelectedExam,
    staleTime: 30 * 1000,
  });

  const plagiarismFlags: PlagiarismFlagItem[] = useMemo(
    () => (plagiarismData?.flags as PlagiarismFlagItem[]) ?? [],
    [plagiarismData]
  );

  useEffect(() => {
    if (submissionsData) {
      setSubmissions(submissionsData.submissions ?? []);
      if (submissionsData.experiment) {
        setExperimentMeta(submissionsData.experiment as ExperimentMeta);
      }
    }
  }, [submissionsData]);

  useEffect(() => {
    if (examAttemptsData) setExamAttempts(examAttemptsData.attempts ?? []);
  }, [examAttemptsData]);

  const vivaByStudent = useMemo(() => {
    const map = new Map<string, VivaListItem>();
    (vivasData as VivaListItem[]).forEach(v => {
      map.set(v.student_id, v);
    });
    return map;
  }, [vivasData]);

  const flagByStudent = useMemo(() => {
    const map = new Map<string, PlagiarismFlagItem>();
    plagiarismFlags.forEach(f => {
      map.set(f.student_a_id, f);
      map.set(f.student_b_id, f);
    });
    return map;
  }, [plagiarismFlags]);

  // ── Hub analytics — every figure is derived from the grade-summary payload ──
  // Nothing here is a placeholder: a value that cannot be computed is `null`
  // and the UI renders an explicit empty state instead of a misleading zero.
  const hubStats = useMemo(() => {
    const items = gradeSummaryData?.experiments ?? [];
    const students = (gradeSummaryData?.students ?? []) as StudentDossierTarget[];
    const published = items.filter(a => a.is_published !== false);
    const drafts = items.filter(a => a.is_published === false);
    const subject = gradeSummaryData?.subject;

    const rows: RollupRow[] = students.map(s => {
      const gradedPcts: number[] = [];
      let needsReview = false;
      items.forEach(a => {
        const raw = s.experiment_scores[a.id];
        if (raw != null && Number.isFinite(raw)) {
          gradedPcts.push((raw / (a.grade_scale || 100)) * 100);
        } else if (s.experiment_details?.[a.id]?.submitted_at) {
          needsReview = true;
        }
      });
      return {
        ...s,
        pct: s.subject_percent ?? null,
        gradedAvg: gradedPcts.length
          ? Math.round((gradedPcts.reduce((x, y) => x + y, 0) / gradedPcts.length) * 10) / 10
          : null,
        needsReview,
        gradedCount: gradedPcts.length,
      };
    });

    const cellHasMark = (s: StudentDossierTarget, a: { id: string }) => s.experiment_scores[a.id] != null;
    const gradedCells = rows.reduce((acc, r) => acc + r.gradedCount, 0);
    const totalCells = rows.length * items.length;
    const pendingSeries = items.map(
      a => rows.filter(r => r.experiment_scores[a.id] == null && r.experiment_details?.[a.id]?.submitted_at).length
    );
    const submittedCells = items.reduce(
      (acc, a) => acc + rows.filter(r => cellHasMark(r, a) || r.experiment_details?.[a.id]?.submitted_at).length,
      0
    );

    const pctValues = rows.map(r => r.pct).filter((v): v is number => v != null);
    const gradedAvgValues = rows.map(r => r.gradedAvg).filter((v): v is number => v != null);
    const mean = (vals: number[]) =>
      vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;

    const avgSeries = published
      .map(a => a.class_average_percent)
      .filter((v): v is number => v != null);

    const labels = ['0–40', '40–50', '50–60', '60–70', '70–80', '80–90', '90–100'];
    const binOf = (v: number) => (v < 40 ? 0 : v < 50 ? 1 : v < 60 ? 2 : v < 70 ? 3 : v < 80 ? 4 : v < 90 ? 5 : 6);
    const distTotal = labels.map(label => ({ label, count: 0 }));
    const distGraded = labels.map(label => ({ label, count: 0 }));
    rows.forEach(r => {
      if (r.pct != null) distTotal[binOf(r.pct)].count += 1;
      if (r.gradedAvg != null) distGraded[binOf(r.gradedAvg)].count += 1;
    });

    const totalMarks = subject?.total_marks ?? 100;
    const allocated = subject?.total_weightage ?? 0;
    return {
      assessments: items,
      assessmentCount: items.length,
      publishedCount: published.length,
      draftCount: drafts.length,
      draftWeight: subject?.draft_weightage ?? drafts.reduce((acc, a) => acc + (a.weightage ?? 0), 0),
      allocated,
      totalMarks,
      unallocatedMarks: Math.max(0, subject?.unallocated_marks ?? totalMarks - allocated),
      overAllocation: Boolean(subject?.over_allocation),
      students: rows.length,
      rows,
      classAvg: mean(pctValues),
      classGradedAvg: mean(gradedAvgValues),
      gradedCells,
      totalCells,
      pendingCells: pendingSeries.reduce((a, b) => a + b, 0),
      submittedCells,
      avgSeries,
      pendingSeries,
      needsReviewCount: rows.filter(r => r.needsReview).length,
      gradedRowCount: rows.filter(r => !r.needsReview && r.gradedCount > 0).length,
      notStartedCount: rows.filter(r => !r.needsReview && r.gradedCount === 0).length,
      distTotal,
      distGraded,
    };
  }, [gradeSummaryData]);

  const rollupRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return hubStats.rows.filter(r => {
      if (q && !(r.full_name.toLowerCase().includes(q) || (r.roll_number || '').toLowerCase().includes(q))) {
        return false;
      }
      if (rollupFilter === 'review') return r.needsReview;
      if (rollupFilter === 'graded') return !r.needsReview && r.gradedCount > 0;
      if (rollupFilter === 'none') return !r.needsReview && r.gradedCount === 0;
      return true;
    });
  }, [hubStats.rows, rollupFilter, searchQuery]);

  const filteredSubmissions = useMemo(() => {
    return submissions.filter(s => {
      if (statusFilter === 'graded' && s.submission_status !== 'graded') return false;
      if (statusFilter === 'submitted' && s.submission_status !== 'submitted') return false;
      if (statusFilter === 'not_submitted' && s.submission_status !== 'not_submitted') return false;
      if (statusFilter === 'flagged' && !flagByStudent.has(s.student_id)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return s.full_name.toLowerCase().includes(q) || (s.roll_number || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [submissions, statusFilter, searchQuery, flagByStudent]);

  const filteredExamAttempts = useMemo(() => {
    if (!searchQuery.trim()) return examAttempts;
    const q = searchQuery.toLowerCase();
    return examAttempts.filter(a =>
      a.student_name.toLowerCase().includes(q) || (a.student_email || '').toLowerCase().includes(q)
    );
  }, [examAttempts, searchQuery]);

  // ── Open Split-Pane Grading Workbench ────────────────────────────────────────
  const openWorkbench = async (sub: SubmissionRow, defaultTab: 'code' | 'tests' | 'viva' | 'integrity' = 'code') => {
    setGrading(sub);
    setWorkbenchTab(defaultTab);
    setManualGrade(
      sub.manual_grade != null
        ? String(sub.manual_grade)
        : sub.final_grade != null
          ? String(sub.final_grade)
          : sub.auto_grade != null
            ? String(sub.auto_grade)
            : ''
    );
    setComponentScores({
      test_cases: sub.auto_grade != null ? String(sub.auto_grade) : '',
      lab_report: sub.manual_grade != null ? String(sub.manual_grade) : '',
      code_quality: (sub as { code_quality_grade?: number | null }).code_quality_grade != null
        ? String((sub as { code_quality_grade?: number | null }).code_quality_grade)
        : '',
      viva: (sub as { viva_grade?: number | null }).viva_grade != null
        ? String((sub as { viva_grade?: number | null }).viva_grade)
        : '',
      quiz: (sub as { quiz_grade?: number | null }).quiz_grade != null
        ? String((sub as { quiz_grade?: number | null }).quiz_grade)
        : '',
    });
    setOverrideLock(false);
    // A component starts ticked when it already carries a mark; the instructor
    // can untick anything that has not really been assessed.
    setAssessed({
      test_cases: sub.auto_grade != null,
      lab_report: sub.manual_grade != null,
      code_quality: (sub as { code_quality_grade?: number | null }).code_quality_grade != null,
      viva: (sub as { viva_grade?: number | null }).viva_grade != null,
      quiz: (sub as { quiz_grade?: number | null }).quiz_grade != null,
    });
    setFeedback(sub.manual_feedback || '');
    setSelectedVersionIdx(-1);
    setReplayVersions([]);
    setActiveViva(null);

    // Load code replay versions in background
    if (selectedAssessment && selectedAssessment !== 'all') {
      setLoadingReplay(true);
      submissionService.getReplay(sub.student_id, selectedAssessment)
        .then(d => setReplayVersions(d.versions ?? []))
        .catch(() => setReplayVersions([]))
        .finally(() => setLoadingReplay(false));

      // Load Viva Q&A if student has a viva session
      const vItem = vivaByStudent.get(sub.student_id);
      if (vItem) {
        setLoadingVivaDetail(true);
        instructorService.getVivaDetail(vItem.id)
          .then(detail => setActiveViva(detail))
          .catch(() => setActiveViva(null))
          .finally(() => setLoadingVivaDetail(false));
      }
    }
  };

  // Navigate to previous / next student inside Workbench
  const currentSubIndex = useMemo(() => {
    if (!grading) return -1;
    return filteredSubmissions.findIndex(s => s.student_id === grading.student_id);
  }, [grading, filteredSubmissions]);

  const goPrevNextStudent = (delta: number) => {
    if (currentSubIndex < 0) return;
    const nextIdx = currentSubIndex + delta;
    if (nextIdx >= 0 && nextIdx < filteredSubmissions.length) {
      openWorkbench(filteredSubmissions[nextIdx], workbenchTab);
    }
  };

  // Calculate live blended final grade preview from rubric
  // Live preview: sum each component's score × its rubric weight. Components
  // the rubric gives 0% to contribute nothing (they are not calculated at all).
  const rubricOf = useMemo(
    () => experimentMeta?.rubric || { test_cases: 60, lab_report: 20, code_quality: 10, viva: 10, quiz: 0 },
    [experimentMeta],
  );

  const componentValue = useCallback((key: string): number | null => {
    const raw = componentScores[key];
    if (raw != null && raw !== '' && !Number.isNaN(parseFloat(raw))) {
      return Math.min(100, Math.max(0, parseFloat(raw)));
    }
    return null;
  }, [componentScores]);

  // Live preview mirrors the server: the mark is renormalised over the weight
  // that has actually been assessed, so an unmarked component cannot read as 0.
  const livePreview = useMemo(() => {
    if (!grading) return { final: null as number | null, weightUsed: 0, provisional: false };
    const rub = rubricOf as Record<string, number>;
    const fallback: Record<string, number | null> = {
      test_cases: grading.auto_grade ?? (
        grading.test_cases_total
          ? Math.round(((grading.test_cases_passed ?? 0) / grading.test_cases_total) * 100)
          : null
      ),
      lab_report: grading.manual_grade ?? null,
      code_quality: grading.code_quality_grade ?? null,
      viva: grading.viva_grade ?? activeViva?.viva?.total_score ?? null,
      quiz: grading.quiz_grade ?? null,
    };

    let earned = 0;
    let weightUsed = 0;
    Object.keys(rub).forEach(key => {
      const weight = rub[key] || 0;
      if (!weight || !assessed[key]) return;
      const score = componentValue(key) ?? fallback[key];
      if (score == null) return;
      earned += score * weight;
      weightUsed += weight;
    });

    if (weightUsed <= 0) return { final: null, weightUsed: 0, provisional: true };
    const final = Math.max(0, Math.round((earned / weightUsed - (grading.hint_deduction || 0)) * 10) / 10);
    return { final, weightUsed, provisional: weightUsed < 100 };
  }, [grading, rubricOf, componentValue, assessed, activeViva]);

  const generateDraft = async () => {
    if (!grading) return;
    setDrafting(true);
    try {
      const res = await experienceService.aiFeedbackDraft(grading.student_id, selectedAssessment);
      setFeedback(res.draft);
      toast3(`AI feedback draft generated (${res.model}).`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string }; status?: number } };
      toast3(e?.response?.data?.error ?? (e?.response?.status === 429 ? 'AI quota exceeded.' : 'Draft generation failed.'));
    } finally { setDrafting(false); }
  };

  const saveGrade = async (advanceNext = false, overrideLock = false) => {
    if (!grading) return;
    setSaving(true);
    try {
      // Send one score per rubric component. Components left blank fall back to
      // the server's auto-computed value; 0%-weight components are ignored.
      // Only score components the rubric actually uses; a 0% component is not
      // part of the mark and must not be written either.
      const components: Record<string, number> = {};
      Object.entries(componentScores).forEach(([key, raw]) => {
        const weight = Number((rubricOf as Record<string, number>)[key] || 0);
        if (!weight) return;
        if (raw !== '' && raw != null && !Number.isNaN(parseFloat(raw))) {
          components[key] = Math.min(100, Math.max(0, parseFloat(raw)));
        }
      });
      await submissionService.gradeSubmission({
        student_id: grading.student_id,
        experiment_id: selectedAssessment,
        session_id: grading.session_id ?? undefined,
        components: Object.keys(components).length ? components : undefined,
        manual_feedback: feedback || undefined,
        // Only sent when the instructor explicitly chooses to correct a
        // grade the student has already viewed.
        assessed,
        force: overrideLock || undefined,
      });
      toast3(overrideLock
        ? `Corrected the locked grade for ${grading.full_name}. The student sees the new mark.`
        : `Saved grade for ${grading.full_name}.`);
      refetchSubmissions();
      refetchSummary();
      if (advanceNext && currentSubIndex >= 0 && currentSubIndex + 1 < filteredSubmissions.length) {
        openWorkbench(filteredSubmissions[currentSubIndex + 1], workbenchTab);
      } else {
        setGrading(null);
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string }; status?: number } };
      if (e?.response?.status === 409) toast3('Grade is locked — the student already viewed it.');
      else toast3(e?.response?.data?.error ?? 'Failed to save grade.');
    } finally { setSaving(false); }
  };

  const runCurve = async (apply: boolean) => {
    const v = parseFloat(curveValue);
    if (isNaN(v)) { toast3('Enter a valid numerical value.'); return; }
    setCurving(true);
    try {
      const res = await experienceService.curveGrades({
        experiment_id: selectedAssessment, mode: curveMode, value: v, apply,
      });
      if (apply) {
        toast3(`Curved ${res.changed} grade(s).`);
        setShowCurve(false);
        setCurvePreview(null);
        refetchSubmissions();
        refetchSummary();
      } else {
        setCurvePreview(res as typeof curvePreview);
      }
    } catch (e: unknown) {
      toast3((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Curve failed.');
    } finally { setCurving(false); }
  };

  const handleExportCSV = () => {
    if (!gradeSummaryData) return;
    const rows = gradeSummaryData.students.map(s => {
      const r: Record<string, unknown> = {
        'Roll Number': s.roll_number || '',
        'Student Name': s.full_name,
      };
      gradeSummaryData.experiments.forEach(e => {
        r[`#${e.exp_number} ${e.title}`] = s.experiment_scores[e.id] ?? '—';
      });
      r['Points Earned'] = s.points_earned ?? s.subject_score;
      r['Points Allocated'] = s.points_allocated ?? gradeSummaryData.subject.total_weightage;
      r['Pro-rated Total (%)'] = s.subject_percent ?? '';
      r['Assessments Graded'] = `${s.assessed_count ?? 0}/${s.assessment_count ?? gradeSummaryData.experiments.length}`;
      r['Ceiling Max'] = gradeSummaryData.subject.total_marks;
      return r;
    });
    exportCSV(rows, `${gradeSummaryData.subject.code || 'subject'}-gradebook-${new Date().toISOString().slice(0, 10)}`);
  };

  // Code shown inside Workbench (either final submission or selected replay version)
  const displayedCode = useMemo(() => {
    if (!grading) return '';
    if (selectedVersionIdx >= 0 && replayVersions[selectedVersionIdx]) {
      const v = replayVersions[selectedVersionIdx];
      return Object.entries(v.files ?? {}).map(([name, code]) => `// ── ${name} (v${v.version_number} · ${v.save_type}) ──\n${code}`).join('\n\n');
    }
    if (grading.code_text && grading.code_text.trim()) return grading.code_text;
    if (grading.files && Object.keys(grading.files).length > 0) {
      return Object.entries(grading.files).map(([name, code]) => `// ── ${name} ──\n${code}`).join('\n\n');
    }
    if (replayVersions.length > 0) {
      const latest = replayVersions[replayVersions.length - 1];
      return Object.entries(latest.files ?? {}).map(([name, code]) => `// ── ${name} (Latest Snapshot v${latest.version_number}) ──\n${code}`).join('\n\n');
    }
    return '';
  }, [grading, selectedVersionIdx, replayVersions]);

  // Summary counts for specific experiment view
  const subStats = useMemo(() => {
    let gradedCount = 0, submittedCount = 0, notSubmittedCount = 0, flaggedCount = 0;
    let scoreSum = 0, scoreCount = 0;
    submissions.forEach(s => {
      if (s.submission_status === 'graded') gradedCount++;
      else if (s.submission_status === 'submitted') submittedCount++;
      else notSubmittedCount++;
      if (flagByStudent.has(s.student_id)) flaggedCount++;
      const sc = s.final_grade ?? s.auto_grade;
      if (sc != null) { scoreSum += sc; scoreCount++; }
    });
    return {
      total: submissions.length,
      gradedCount,
      submittedCount,
      notSubmittedCount,
      flaggedCount,
      avgScore: scoreCount > 0 ? (scoreSum / scoreCount).toFixed(1) : '—',
    };
  }, [submissions, flagByStudent]);

  return (
    <InstructorShell
      activePage="Grading"
      title="Grading & Assessment Hub"
      subtitle="Inspect full subject gradebooks or drill into individual student code submissions, test-case outputs, viva answers, and rubric scores."
    >
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 400, background: '#0f172a', color: '#fff', padding: '12px 20px', borderRadius: 12, fontSize: 13.5, fontWeight: 600, boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
          {toast}
        </div>
      )}

      {/* ═══ STICKY SCOPE BAR — one line, remembers the academic context ═══ */}
      <div className={hub.scopeBar}>
        <div className={hub.scopeRail}>
          <div className={hub.scopeChip}>
            <span className={hub.scopeLabel}><Building2 size={9} /> Department</span>
            <select
              className={hub.scopeSelect}
              title="Filter by department"
              value={selectedDept}
              onChange={e => {
                setSelectedDept(e.target.value);
                setSelectedYear('all');
                setSelectedBatch('all');
                setSelectedSection('all');
              }}
            >
              <option value="all">All departments</option>
              {departments.map(d => (
                <option key={d.code} value={d.code}>{d.code} · {d.name}</option>
              ))}
            </select>
          </div>

          <div className={hub.scopeChip}>
            <span className={hub.scopeLabel}><Calendar size={9} /> Year</span>
            <select
              className={hub.scopeSelect}
              title="Filter by academic year"
              value={selectedYear}
              onChange={e => {
                setSelectedYear(e.target.value);
                setSelectedBatch('all');
                setSelectedSection('all');
              }}
            >
              <option value="all">All years</option>
              {academicYears.map(yr => <option key={yr} value={yr}>{yr}</option>)}
            </select>
          </div>

          <div className={hub.scopeChip}>
            <span className={hub.scopeLabel}><Layers size={9} /> Batch</span>
            <select
              className={hub.scopeSelect}
              title="Filter by batch"
              value={selectedBatch}
              onChange={e => { setSelectedBatch(e.target.value); setSelectedSection('all'); }}
            >
              <option value="all">All batches ({availableBatches.length})</option>
              {availableBatches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          <div className={hub.scopeChip}>
            <span className={hub.scopeLabel}><Users size={9} /> Section</span>
            <select
              className={hub.scopeSelect}
              title="Filter by section"
              value={selectedSection}
              onChange={e => setSelectedSection(e.target.value)}
            >
              <option value="all">All sections ({availableSections.length})</option>
              {availableSections.map(s => (
                <option key={s.section_id} value={s.section_id}>
                  Section {s.section_name}{s.batch_name ? ` (${s.batch_name})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className={`${hub.scopeChip} ${hub.scopeChipWide}`}>
            <span className={hub.scopeLabel}><BookOpen size={9} /> Subject</span>
            <select
              className={hub.scopeSelect}
              title={availableSubjects.find(sub => sub.subject_id === selectedSubject)?.subject_name ?? 'Subject'}
              value={selectedSubject}
              onChange={e => { setSelectedSubject(e.target.value); setSelectedAssessment('all'); }}
            >
              {availableSubjects.length === 0 && <option value="">No subjects assigned</option>}
              {availableSubjects.map(s => (
                <option key={s.subject_id} value={s.subject_id}>
                  {s.subject_name} ({s.subject_code})
                </option>
              ))}
            </select>
          </div>

          <div className={`${hub.scopeChip} ${hub.scopeChipWide}`}>
            <span className={hub.scopeLabel}><Award size={9} /> View</span>
            <select
              className={hub.scopeSelect}
              title="Choose the gradebook rollup or a single assessment"
              value={selectedAssessment}
              onChange={e => setSelectedAssessment(e.target.value)}
            >
              <option value="all">Full subject gradebook</option>
              {subjectExperiments.length > 0 && (
                <optgroup label="Laboratory experiments">
                  {subjectExperiments.map(e => (
                    <option key={e.id} value={e.id}>
                      #{e.exp_number} — {e.title}{e.weightage ? ` (${e.weightage} pts)` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              {subjectExams.length > 0 && (
                <optgroup label="Timed exams">
                  {subjectExams.map(ex => (
                    <option key={ex.id} value={ex.id}>⏱ {ex.title} ({ex.exam_type.toUpperCase()})</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>

        <div className={hub.scopeActions}>
          <button type="button" className={hub.iconBtn} onClick={() => refetchSummary()} title="Re-fetch grades">
            <History size={14} /> Refresh
          </button>
          <button
            type="button"
            className={hub.primaryBtn}
            onClick={handleExportCSV}
            disabled={!gradeSummaryData || gradeSummaryData.students.length === 0}
          >
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* ═══ VIEW 1: SUBJECT GRADEBOOK ROLLUP ═══ */}
      {selectedAssessment === 'all' && (
        <>
          {hubStats.assessmentCount === 0 && (
            <div className={`${hub.banner} ${hub.bannerInfo}`}>
              <BookOpen size={16} style={{ flex: 'none', marginTop: 1 }} />
              <span>
                <strong>No assessments yet.</strong> Create a laboratory experiment or timed exam for{' '}
                {gradeSummaryData?.subject.name ?? 'this subject'} — the gradebook fills in as soon as one exists.
              </span>
            </div>
          )}

          {hubStats.assessmentCount > 0 && hubStats.publishedCount === 0 && (
            <div className={`${hub.banner} ${hub.bannerWarn}`}>
              <AlertTriangle size={16} style={{ flex: 'none', marginTop: 1 }} />
              <span>
                <strong>Rollup paused — none of the {hubStats.assessmentCount} assessments are published.</strong>{' '}
                Recorded scores are shown below, but nothing counts toward the subject total until an assessment is
                published. Totals stay blank rather than reporting a misleading 0.
              </span>
            </div>
          )}

          {hubStats.publishedCount > 0 && hubStats.unallocatedMarks > 0 && (
            <div className={`${hub.banner} ${hub.bannerWarn}`}>
              <AlertTriangle size={16} style={{ flex: 'none', marginTop: 1 }} />
              <span>
                <strong>Only {hubStats.allocated.toFixed(2)} of {hubStats.totalMarks} marks are allocated</strong>{' '}
                across {hubStats.publishedCount} published assessment{hubStats.publishedCount === 1 ? '' : 's'} — the
                totals below are pro-rated to the allocated weight, not to the full subject ceiling.
              </span>
            </div>
          )}

          {hubStats.overAllocation && (
            <div className={`${hub.banner} ${hub.bannerWarn}`}>
              <AlertTriangle size={16} style={{ flex: 'none', marginTop: 1 }} />
              <span>
                <strong>Over-allocated:</strong> {hubStats.allocated.toFixed(2)} pts of weight is assigned to a subject
                ceiling of {hubStats.totalMarks} marks.
              </span>
            </div>
          )}

          {/* KPI row — every number derived from the grade summary */}
          <div className={hub.kpiGrid}>
            <div className={`${hub.kpiCard} ${hub.kpiCardGreen}`}>
              <div className={hub.kpiTop}>
                <span className={hub.kpiLabel}>Class average</span>
                <span className={hub.kpiIcon}><TrendingUp size={13} /></span>
              </div>
              <div className={hub.kpiValueRow}>
                <span className={hub.kpiValue}>{hubStats.classAvg != null ? hubStats.classAvg.toFixed(1) : '—'}</span>
                <span className={hub.kpiUnit}>/ 100</span>
              </div>
              <div className={hub.kpiSpark}>
                <Sparkline
                  values={hubStats.avgSeries}
                  color="#16a34a"
                  emptyLabel={hubStats.publishedCount === 0 ? 'publish to start the trend' : 'needs 2+ assessments'}
                />
              </div>
              <span className={hub.kpiSub}>
                {hubStats.classAvg != null
                  ? `Pro-rated across ${hubStats.publishedCount} published assessment${hubStats.publishedCount === 1 ? '' : 's'} · ${hubStats.students} student${hubStats.students === 1 ? '' : 's'}`
                  : 'No published assessment yet — nothing to average'}
              </span>
            </div>

            <div className={`${hub.kpiCard}`}>
              <div className={hub.kpiTop}>
                <span className={hub.kpiLabel}>Graded</span>
                <span className={hub.kpiIcon}><CheckCircle2 size={13} /></span>
              </div>
              <div className={hub.kpiValueRow}>
                <span className={hub.kpiValue}>{hubStats.gradedCells}</span>
                <span className={hub.kpiUnit}>of {hubStats.totalCells} cells</span>
              </div>
              <div className={hub.progressTrack}>
                <div
                  className={hub.progressFill}
                  style={{ width: `${hubStats.totalCells ? Math.round((hubStats.gradedCells / hubStats.totalCells) * 100) : 0}%` }}
                />
              </div>
              <span className={hub.kpiSub}>
                {hubStats.totalCells
                  ? `${Math.round((hubStats.gradedCells / hubStats.totalCells) * 100)}% of the gradebook carries a mark`
                  : 'No student × assessment cells yet'}
              </span>
            </div>

            <div className={`${hub.kpiCard} ${hubStats.pendingCells > 0 ? hub.kpiCardAmber : hub.kpiCardGreen}`}>
              <div className={hub.kpiTop}>
                <span className={hub.kpiLabel}>Pending review</span>
                <span className={hub.kpiIcon}><ClipboardCheck size={13} /></span>
              </div>
              <div className={hub.kpiValueRow}>
                <span className={hub.kpiValue}>{hubStats.pendingCells}</span>
                <span className={hub.kpiUnit}>submission{hubStats.pendingCells === 1 ? '' : 's'}</span>
              </div>
              <div className={hub.kpiSpark}>
                <Sparkline
                  values={hubStats.pendingSeries}
                  color="#d97706"
                  unit=""
                  emptyLabel={hubStats.assessmentCount ? 'steady across assessments' : 'no assessments'}
                />
              </div>
              <span className={hub.kpiSub}>
                {hubStats.pendingCells > 0
                  ? `Submitted, still ungraded · ${hubStats.submittedCells} total submission${hubStats.submittedCells === 1 ? '' : 's'}`
                  : 'Every submitted piece of work has a mark'}
              </span>
            </div>

            <div className={`${hub.kpiCard} ${hubStats.overAllocation || hubStats.unallocatedMarks > 0 ? hub.kpiCardAmber : hub.kpiCardGreen}`}>
              <div className={hub.kpiTop}>
                <span className={hub.kpiLabel}>Marks allocated</span>
                <span className={hub.kpiIcon}><Award size={13} /></span>
              </div>
              <div className={hub.kpiValueRow}>
                <span className={hub.kpiValue}>{hubStats.allocated.toFixed(hubStats.allocated % 1 === 0 ? 0 : 2)}</span>
                <span className={hub.kpiUnit}>/ {hubStats.totalMarks} marks</span>
              </div>
              <div className={hub.progressTrack}>
                <div
                  className={`${hub.progressFill} ${hubStats.overAllocation ? hub.progressFillAmber : ''}`}
                  style={{ width: `${Math.min(100, hubStats.totalMarks ? (hubStats.allocated / hubStats.totalMarks) * 100 : 0)}%` }}
                />
              </div>
              <span className={hub.kpiSub}>
                {hubStats.publishedCount} published · {hubStats.draftCount} draft
                {hubStats.draftWeight > 0 ? ` (${hubStats.draftWeight.toFixed(2)} pts excluded)` : ''}
              </span>
            </div>
          </div>

          {/* Gradebook */}
          <div className={hub.panel}>
            <div className={hub.panelHead}>
              <div>
                <div className={hub.panelTitle}>Subject gradebook</div>
                <div className={hub.panelSub}>
                  {gradeSummaryData?.subject.name ?? 'Subject'} · {gradeSummaryData?.subject.code ?? '—'} ·{' '}
                  {hubStats.assessmentCount} assessment{hubStats.assessmentCount === 1 ? '' : 's'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, fontSize: 10.5, color: '#94a3b8', fontWeight: 600 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 14, height: 4, borderRadius: 99, background: '#16a34a' }} /> ≥75%
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 14, height: 4, borderRadius: 99, background: '#d97706' }} /> 50–74%
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 14, height: 4, borderRadius: 99, background: '#dc2626' }} /> &lt;50%
                  </span>
                  <span>· bar = score on the assessment scale, +x.xx = weighted contribution</span>
                </div>
              </div>
              <div className={hub.panelHeadRight}>
                <div className={hub.searchWrap}>
                  <Search size={13} />
                  <input
                    className={hub.searchInput}
                    placeholder="Search student or roll no…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className={hub.chipRow}>
                  {([
                    { id: 'all', label: 'All', count: hubStats.rows.length },
                    { id: 'review', label: 'Needs review', count: hubStats.needsReviewCount },
                    { id: 'graded', label: 'Graded', count: hubStats.gradedRowCount },
                    { id: 'none', label: 'Not started', count: hubStats.notStartedCount },
                  ] as const).map(f => (
                    <button
                      key={f.id}
                      type="button"
                      className={`${hub.chip} ${rollupFilter === f.id ? hub.chipActive : ''}`}
                      onClick={() => setRollupFilter(f.id)}
                    >
                      {f.label}
                      <span className={hub.chipCount}>{f.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {gradeSummaryLoading ? (
              <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[0, 1, 2, 3].map(i => <div key={i} className={hub.skeleton} style={{ width: `${88 - i * 8}%` }} />)}
              </div>
            ) : hubStats.assessmentCount === 0 ? (
              <div className={hub.empty}>
                <BookOpen size={30} color="#d8b4fe" />
                <div className={hub.emptyTitle}>This subject has no assessments</div>
                <div className={hub.emptyText}>
                  Add a laboratory experiment or a timed exam to {gradeSummaryData?.subject.name ?? 'this subject'} and
                  students will appear here with their rollup.
                </div>
              </div>
            ) : rollupRows.length === 0 ? (
              <div className={hub.empty}>
                <Users size={30} color="#d8b4fe" />
                <div className={hub.emptyTitle}>No students in this scope</div>
                <div className={hub.emptyText}>
                  {searchQuery
                    ? `Nothing matches “${searchQuery}”.`
                    : 'No enrolment matches the current department / year / section scope, or no filter is set.'}
                </div>
              </div>
            ) : (
              <div className={hub.tableScroll}>
                <table className={hub.gradeTable}>
                  <thead>
                    <tr>
                      <th className={hub.studentCol}>Student</th>
                      {hubStats.assessments.map(a => (
                        <th key={a.id}>
                          <button
                            type="button"
                            className={hub.colHeadBtn}
                            onClick={() => setSelectedAssessment(a.id)}
                            title={`Open all submissions for ${a.title}`}
                          >
                            <div className={hub.colHead}>
                              <div className={hub.colHeadTop}>
                                <span className={hub.colName}>
                                  {(a.delivery_mode === 'exam' ? 'Exam ' : 'Lab ') + a.exp_number}
                                </span>
                                <span className={`${hub.weightTag} ${a.is_published === false ? hub.weightTagDraft : ''}`}>
                                  {a.weightage ?? 0} pt{(a.weightage ?? 0) === 1 ? '' : 's'}
                                </span>
                              </div>
                              <span className={hub.colFoot}>
                                {a.class_average_percent != null
                                  ? `avg ${a.class_average_percent.toFixed(1)}% · ${a.graded_count ?? 0}/${hubStats.students} graded`
                                  : 'not graded yet'}
                              </span>
                            </div>
                          </button>
                        </th>
                      ))}
                      <th style={{ textAlign: 'right' }}>Subject total</th>
                      <th style={{ textAlign: 'right' }}>Dossier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rollupRows.map(row => (
                      <tr key={row.student_id} className={hub.row} onClick={() => setDossierStudent(row)}>
                        <td className={hub.studentCol}>
                          <div className={hub.studentCell}>
                            <span className={hub.avatar}>{initials(row.full_name)}</span>
                            <div>
                              <div className={hub.studentName}>{row.full_name}</div>
                              <div className={hub.studentMeta}>{row.roll_number || row.student_id.slice(0, 8)}</div>
                            </div>
                          </div>
                        </td>
                        {hubStats.assessments.map(a => {
                          const raw = row.experiment_scores[a.id];
                          const det = row.experiment_details?.[a.id];
                          const scale = a.grade_scale || 100;
                          const pct = raw != null ? Math.max(0, Math.min(100, (raw / scale) * 100)) : null;
                          const weighted = raw != null ? (raw / scale) * (a.weightage ?? 0) : 0;
                          return (
                            <td key={a.id}>
                              {pct != null ? (
                                <div className={hub.scoreCell}>
                                  <div className={hub.scoreTop}>
                                    <span className={hub.scoreNum}>{formatScore(raw)}</span>
                                    <span className={hub.scoreDen}>/ {scale}</span>
                                    {a.is_published !== false && (
                                      <span className={hub.scorePts}>+{weighted.toFixed(2)}</span>
                                    )}
                                  </div>
                                  <div className={hub.barTrack}>
                                    <div
                                      className={`${hub.barFill} ${pct >= 75 ? hub.barGreen : pct >= 50 ? hub.barAmber : hub.barRed}`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              ) : det?.submitted_at ? (
                                <span className={hub.stateTag}>Needs grade</span>
                              ) : (
                                <span className={hub.stateMuted}>—</span>
                              )}
                            </td>
                          );
                        })}
                        <td>
                          <div className={hub.totalCell}>
                            <div className={hub.totalMeta}>
                              <span className={hub.totalPts}>
                                {row.points_earned != null && row.points_allocated
                                  ? `${row.points_earned.toFixed(2)} / ${row.points_allocated.toFixed(2)} pts`
                                  : '0 pts allocated'}
                              </span>
                              <span className={hub.totalCap}>
                                {row.pct != null
                                  ? `${row.pct.toFixed(1)}% of ${hubStats.totalMarks} marks`
                                  : 'awaiting published marks'}
                              </span>
                            </div>
                            <ScoreRing pct={row.pct} />
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }} onClick={ev => ev.stopPropagation()}>
                          <button type="button" className={hub.dossierBtn} onClick={() => setDossierStudent(row)}>
                            <Eye size={13} /> Open
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Distribution + weightage health */}
          {hubStats.assessmentCount > 0 && (
            <div className={hub.bottomGrid}>
              <div className={hub.panel}>
                <div className={hub.panelHead}>
                  <div>
                    <div className={hub.panelTitle}>Grade distribution</div>
                    <div className={hub.panelSub}>
                      {distMetric === 'total'
                        ? 'Pro-rated subject total — published assessments only'
                        : 'Mean of every graded assessment, unweighted'}
                    </div>
                  </div>
                  <div className={hub.panelHeadRight}>
                    <div className={hub.chipRow}>
                      <button
                        type="button"
                        className={`${hub.chip} ${distMetric === 'total' ? hub.chipActive : ''}`}
                        onClick={() => setDistMetric('total')}
                        disabled={hubStats.classAvg == null}
                        style={hubStats.classAvg == null ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                      >
                        Subject total %
                      </button>
                      <button
                        type="button"
                        className={`${hub.chip} ${distMetric === 'graded' ? hub.chipActive : ''}`}
                        onClick={() => setDistMetric('graded')}
                        disabled={hubStats.classGradedAvg == null}
                        style={hubStats.classGradedAvg == null ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                      >
                        Graded average %
                      </button>
                    </div>
                  </div>
                </div>
                {(() => {
                  const dist = distMetric === 'total' ? hubStats.distTotal : hubStats.distGraded;
                  const max = Math.max(...dist.map(d => d.count), 0);
                  const total = dist.reduce((a, d) => a + d.count, 0);
                  if (total === 0) {
                    return (
                      <div className={hub.empty}>
                        <TrendingUp size={28} color="#d8b4fe" />
                        <div className={hub.emptyTitle}>Nothing to plot yet</div>
                        <div className={hub.emptyText}>
                          {distMetric === 'total'
                            ? 'No published assessment carries a mark, so there is no distribution to draw.'
                            : 'No assessment has been graded yet.'}
                        </div>
                      </div>
                    );
                  }
                  return (
                    <>
                      <div className={hub.distChart}>
                        {dist.map((d, i) => (
                          <div key={d.label} className={hub.distCol} title={`${d.count} student${d.count === 1 ? '' : 's'} in ${d.label}`}>
                            <span className={hub.distCount} style={{ opacity: d.count === 0 ? 0.35 : 1 }}>{d.count}</span>
                            <div
                              className={`${hub.distBar} ${d.count === 0 ? hub.distBarEmpty : ''}`}
                              style={{ height: `${max ? Math.max(3, (d.count / max) * 128) : 3}px` }}
                            />
                          </div>
                        ))}
                      </div>
                      <div className={hub.distAxis}>
                        {dist.map(d => (
                          <span key={'axis-' + d.label} className={hub.distTick}>{d.label}</span>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className={hub.panel}>
                <div className={hub.panelHead}>
                  <div>
                    <div className={hub.panelTitle}>Assessment weightage health</div>
                    <div className={hub.panelSub}>
                      What counts toward the {hubStats.totalMarks}-mark subject ceiling
                    </div>
                  </div>
                  <div className={hub.panelHeadRight}>
                    <span className={`${hub.healthStatus} ${hubStats.overAllocation ? hub.statusWarn : hub.statusOk}`}>
                      {hubStats.overAllocation ? <AlertTriangle size={11} /> : <CheckCircle2 size={11} />}
                      {hubStats.allocated.toFixed(2)} / {hubStats.totalMarks}
                    </span>
                  </div>
                </div>
                <table className={hub.healthTable}>
                  <thead>
                    <tr>
                      <th>Assessment</th>
                      <th style={{ textAlign: 'right', width: 92 }}>Weightage</th>
                      <th style={{ width: 150 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hubStats.assessments.map(a => (
                      <tr key={a.id}>
                        <td>
                          <div style={{ fontWeight: 650, color: '#1e293b' }}>
                            {(a.delivery_mode === 'exam' ? 'Exam ' : 'Lab ') + a.exp_number} — {a.title}
                          </div>
                        </td>
                        <td className={hub.healthNum}>
                          {a.weightage ?? 0} / {hubStats.totalMarks}
                        </td>
                        <td>
                          {a.is_published === false ? (
                            <span className={`${hub.healthStatus} ${hub.statusWarn}`}>
                              <AlertTriangle size={11} /> Draft — not counted
                            </span>
                          ) : (
                            <span className={`${hub.healthStatus} ${hub.statusOk}`}>
                              <CheckCircle2 size={11} /> Published
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className={`${hub.healthFoot} ${!hubStats.overAllocation && hubStats.unallocatedMarks === 0 && hubStats.draftWeight === 0 ? hub.healthFootOk : ''}`}>
                  {hubStats.overAllocation ? (
                    <>
                      <AlertTriangle size={14} />
                      Over-allocated by {(hubStats.allocated - hubStats.totalMarks).toFixed(2)} marks — rebalance weights before publishing.
                    </>
                  ) : hubStats.unallocatedMarks === 0 && hubStats.draftWeight === 0 ? (
                    <>
                      <CheckCircle2 size={14} />
                      All {hubStats.totalMarks} marks are allocated across {hubStats.publishedCount} published assessments.
                    </>
                  ) : (
                    <>
                      <AlertTriangle size={14} />
                      {hubStats.unallocatedMarks.toFixed(2)} of {hubStats.totalMarks} marks unallocated
                      {hubStats.draftWeight > 0 ? ` · ${hubStats.draftWeight.toFixed(2)} pts sit in ${hubStats.draftCount} draft assessment${hubStats.draftCount === 1 ? '' : 's'}` : ''}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ VIEW 2: SPECIFIC ASSESSMENT SUBMISSIONS (LAB OR EXAM) ═══ */}
      {selectedAssessment !== 'all' && (
        <>
          {/* ── Assessment context header: what this scope is and how it is marked ── */}
          {!isSelectedExam && (
            <div className={hub.panel}>
              <div className={hub.assessHead}>
                <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                  <div className={hub.assessTitle}>
                    Lab {experimentMeta?.exp_number ?? '—'} · {experimentMeta?.title ?? 'Loading assessment…'}
                  </div>
                  <div className={hub.assessMeta}>
                    <span className={`${hub.metaTag} ${hub.metaTagViolet}`}>
                      {experimentMeta?.weightage ?? 0} pts of {gradeSummaryData?.subject.total_marks ?? 100} subject marks
                    </span>
                    <span className={hub.metaTag}>marked on /{experimentMeta?.grade_scale ?? 100}</span>
                    <span className={hub.metaTag}>{subStats.total} student{subStats.total === 1 ? '' : 's'} in scope</span>
                    <span className={`${hub.metaTag} ${hub.metaTagAmber}`}>
                      {subStats.submittedCount > 0 ? `${subStats.submittedCount} awaiting a mark` : 'nothing awaiting review'}
                    </span>
                  </div>
                </div>
                <div className={hub.scopeActions}>
                  <button type="button" className={hub.iconBtn} onClick={() => setSelectedAssessment('all')}>
                    <ChevronLeft size={14} /> Subject rollup
                  </button>
                  <button
                    type="button"
                    className={hub.primaryBtn}
                    onClick={() => { setShowCurve(true); setCurvePreview(null); }}
                  >
                    <TrendingUp size={14} /> Curve grades
                  </button>
                </div>
              </div>

              {/* Rubric weights — the same numbers the grade is computed from */}
              <div className={hub.rubricStrip}>
                {([
                  { key: 'test_cases', label: 'Test cases' },
                  { key: 'lab_report', label: 'Lab report' },
                  { key: 'code_quality', label: 'Code quality' },
                  { key: 'viva', label: 'Viva' },
                  { key: 'quiz', label: 'Quiz' },
                ] as const).map(item => {
                  const weight = experimentMeta?.rubric?.[item.key] ?? 0;
                  return (
                    <div key={item.key} className={hub.rubricItem} style={{ opacity: weight === 0 ? 0.42 : 1 }}>
                      <span className={hub.rubricLabel}>{item.label}</span>
                      <span className={hub.rubricValue}>{weight}%</span>
                      <div className={hub.rubricBar}>
                        <div className={hub.rubricBarFill} style={{ width: `${Math.min(100, weight)}%` }} />
                      </div>
                    </div>
                  );
                })}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8', fontWeight: 600, alignSelf: 'center' }}>
                  0% components are not part of the mark
                </span>
              </div>
            </div>
          )}

          {/* ── Assessment KPI row ── */}
          {!isSelectedExam && (
            <div className={hub.kpiGrid}>
              <div className={`${hub.kpiCard} ${hub.kpiCardGreen}`}>
                <div className={hub.kpiTop}>
                  <span className={hub.kpiLabel}>Graded</span>
                  <span className={hub.kpiIcon}><CheckCircle2 size={13} /></span>
                </div>
                <div className={hub.kpiValueRow}>
                  <span className={hub.kpiValue}>{subStats.gradedCount}</span>
                  <span className={hub.kpiUnit}>of {subStats.total} student{subStats.total === 1 ? '' : 's'}</span>
                </div>
                <div className={hub.progressTrack}>
                  <div
                    className={`${hub.progressFill} ${hub.progressFillGreen}`}
                    style={{ width: `${subStats.total ? Math.round((subStats.gradedCount / subStats.total) * 100) : 0}%` }}
                  />
                </div>
                <span className={hub.kpiSub}>
                  {subStats.total ? `${Math.round((subStats.gradedCount / subStats.total) * 100)}% of the roster has a published mark` : 'No roster in scope'}
                </span>
              </div>

              <div className={`${hub.kpiCard} ${subStats.submittedCount > 0 ? hub.kpiCardAmber : hub.kpiCardSlate}`}>
                <div className={hub.kpiTop}>
                  <span className={hub.kpiLabel}>Awaiting review</span>
                  <span className={hub.kpiIcon}><ClipboardCheck size={13} /></span>
                </div>
                <div className={hub.kpiValueRow}>
                  <span className={hub.kpiValue}>{subStats.submittedCount}</span>
                  <span className={hub.kpiUnit}>submitted</span>
                </div>
                <span className={hub.kpiSub}>
                  {subStats.notSubmittedCount} not submitted · {subStats.total} in scope
                </span>
              </div>

              <div className={`${hub.kpiCard}`}>
                <div className={hub.kpiTop}>
                  <span className={hub.kpiLabel}>Assessment average</span>
                  <span className={hub.kpiIcon}><TrendingUp size={13} /></span>
                </div>
                <div className={hub.kpiValueRow}>
                  <span className={hub.kpiValue}>{subStats.avgScore}</span>
                  <span className={hub.kpiUnit}>% unweighted</span>
                </div>
                <span className={hub.kpiSub}>
                  Mean of graded and auto-scored runs · not the weighted subject contribution
                </span>
              </div>

              <div className={`${hub.kpiCard} ${subStats.flaggedCount > 0 ? hub.kpiCardRed : hub.kpiCardGreen}`}>
                <div className={hub.kpiTop}>
                  <span className={hub.kpiLabel}>Integrity flags</span>
                  <span className={hub.kpiIcon}><ShieldAlert size={13} /></span>
                </div>
                <div className={hub.kpiValueRow}>
                  <span className={hub.kpiValue}>{subStats.flaggedCount}</span>
                  <span className={hub.kpiUnit}>of {subStats.total}</span>
                </div>
                <span className={hub.kpiSub}>
                  {subStats.flaggedCount > 0 ? 'AST / token similarity match found' : 'No similarity match above threshold'}
                </span>
              </div>
            </div>
          )}

          {/* ── Toolbar: search, status chips, back to rollup ── */}
          {!isSelectedExam && (
            <div className={hub.panel} style={{ padding: '11px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div className={hub.searchWrap}>
                  <Search size={13} />
                  <input
                    className={hub.searchInput}
                    placeholder="Filter student or roll no…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className={hub.chipRow}>
                  {([
                    { id: 'all', label: 'All', count: subStats.total },
                    { id: 'submitted', label: 'Needs review', count: subStats.submittedCount },
                    { id: 'graded', label: 'Graded', count: subStats.gradedCount },
                    { id: 'not_submitted', label: 'Not submitted', count: subStats.notSubmittedCount },
                    { id: 'flagged', label: 'Flagged', count: subStats.flaggedCount },
                  ] as const).map(f => (
                    <button
                      key={f.id}
                      type="button"
                      className={`${hub.chip} ${statusFilter === f.id ? hub.chipActive : ''}`}
                      onClick={() => setStatusFilter(f.id)}
                    >
                      {f.label}
                      <span className={hub.chipCount}>{f.count}</span>
                    </button>
                  ))}
                </div>
                <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#94a3b8', fontWeight: 600 }}>
                  Click any row to inspect the submission and grade it
                </span>
              </div>
            </div>
          )}

          {isSelectedExam && (
            <div className={hub.panel} style={{ padding: '11px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button type="button" className={hub.iconBtn} onClick={() => setSelectedAssessment('all')}>
                  <ChevronLeft size={14} /> Subject rollup
                </button>
                <div className={hub.searchWrap}>
                  <Search size={13} />
                  <input
                    className={hub.searchInput}
                    placeholder="Filter student…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#94a3b8', fontWeight: 600 }}>
                  Timed exam — attempts are auto-scored, no rubric grading needed
                </span>
              </div>
            </div>
          )}

          {/* Submissions Table Card */}
          <div className={hub.panel}>
            <div className={hub.panelHead}>
              <div>
                <div className={hub.panelTitle}>{isSelectedExam ? 'Exam attempts' : 'Submissions'}</div>
                <div className={hub.panelSub}>
                  {isSelectedExam
                    ? `${filteredExamAttempts.length} attempt${filteredExamAttempts.length === 1 ? '' : 's'} recorded`
                    : `${filteredSubmissions.length} of ${subStats.total} student${subStats.total === 1 ? '' : 's'} shown`}
                </div>
              </div>
              <div className={hub.panelHeadRight}>
                {!isSelectedExam && (
                  <span className={hub.panelSub}>Rubric total is recomputed live when you grade</span>
                )}
              </div>
            </div>
            <div style={{ padding: '4px 6px 6px' }}>
            {isSelectedExam ? (
              examAttemptsLoading ? (
                <p className={styles.sectionSub}>Loading exam attempts…</p>
              ) : filteredExamAttempts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <FileCheck size={30} color="#d8b4fe" style={{ marginBottom: 8 }} />
                  <p className={styles.sectionSub}>No student attempts recorded for this timed exam yet.</p>
                </div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Status</th>
                      <th>Score</th>
                      <th>Points Earned</th>
                      <th>Result</th>
                      <th>Submitted At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExamAttempts.map(att => (
                      <tr key={att.attempt_id}>
                        <td>
                          <div className={styles.tdStrong}>{att.student_name}</div>
                          <div style={{ fontSize: 12, color: '#9ca3af' }}>{att.student_email}</div>
                        </td>
                        <td>
                          <span className={`${styles.pill} ${
                            att.status === 'submitted' ? styles.pillGreen
                            : att.status === 'expired' ? styles.pillAmber
                            : styles.pillBlue
                          }`}>
                            {att.status}
                          </span>
                        </td>
                        <td style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>
                          {att.score !== null ? `${att.score.toFixed(1)}%` : '—'}
                        </td>
                        <td style={{ fontSize: 13, color: '#6b7280' }}>
                          {att.total_points}/{att.max_points}
                        </td>
                        <td>
                          {att.status === 'in_progress' ? (
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>In Progress</span>
                          ) : att.passed ? (
                            <span style={{ color: '#059669', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <CheckCircle2 size={14} /> Pass
                            </span>
                          ) : (
                            <span style={{ color: '#dc2626', fontWeight: 700 }}>Fail</span>
                          )}
                        </td>
                        <td style={{ fontSize: 13, color: '#6b7280' }}>{fmt(att.submitted_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : (
              submissionsLoading ? (
                <p className={styles.sectionSub}>Loading student submissions & code snapshots…</p>
              ) : filteredSubmissions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <ClipboardCheck size={30} color="#d8b4fe" style={{ marginBottom: 8 }} />
                  <p className={styles.sectionSub}>No submissions match the selected filter.</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th style={{ minWidth: 190 }}>Student</th>
                        <th>Status</th>
                        <th>Submission</th>
                        <th>Test cases</th>
                        <th>Viva / quiz</th>
                        <th>Rubric</th>
                        <th>Final score</th>
                        <th>Integrity</th>
                        <th style={{ textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSubmissions.map(sub => {
                        const viva = vivaByStudent.get(sub.student_id);
                        const flag = flagByStudent.get(sub.student_id);
                        const isNotSub = sub.submission_status === 'not_submitted';
                        const displayScore = sub.final_grade ?? sub.auto_grade;

                        return (
                          <tr
                            key={sub.id}
                            style={{ cursor: 'pointer', opacity: isNotSub ? 0.72 : 1 }}
                            onClick={() => openWorkbench(sub, 'code')}
                          >
                            <td>
                              <div className={styles.tdStrong} style={{ color: '#1e293b' }}>{sub.full_name}</div>
                              <div style={{ fontSize: 11.5, color: '#64748b' }}>
                                {sub.roll_number || 'No Roll'} {sub.email ? `· ${sub.email}` : ''}
                              </div>
                            </td>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                <span className={`${styles.pill} ${
                                  sub.submission_status === 'graded' ? styles.pillGreen
                                  : sub.submission_status === 'submitted' ? styles.pillBlue
                                  : styles.pillSlate
                                }`} style={{ width: 'fit-content' }}>
                                  {sub.submission_status === 'graded' ? '✓ Graded' : sub.submission_status === 'submitted' ? 'Submitted' : 'Not Submitted'}
                                </span>
                                <span style={{ fontSize: 11.5, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <Clock size={11} /> {fmt(sub.submitted_at)}
                                </span>
                              </div>
                            </td>
                            <td>
                              {isNotSub ? (
                                <span style={{ fontSize: 12, color: '#cbd5e1' }}>—</span>
                              ) : (sub.code_text || (sub.files && Object.keys(sub.files).length > 0)) ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                  <span className={`${styles.pill} ${styles.pillBlue}`} style={{ width: 'fit-content' }}>
                                    {sub.language}
                                  </span>
                                  <span style={{ fontSize: 11, color: '#64748b' }}>
                                    {sub.loc != null ? `${sub.loc} LOC` : ''} {sub.quality_grade ? `· Quality ${sub.quality_grade}` : ''}
                                  </span>
                                </div>
                              ) : (
                                <span style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 600 }}>No code — rubric only</span>
                              )}
                            </td>
                            <td>
                              {sub.test_cases_total ? (
                                <span className={`${styles.pill} ${sub.test_cases_passed === sub.test_cases_total ? styles.pillGreen : styles.pillAmber}`}>
                                  {sub.test_cases_passed}/{sub.test_cases_total} Passed
                                </span>
                              ) : (
                                <span style={{ fontSize: 12, color: '#cbd5e1' }}>—</span>
                              )}
                            </td>
                            <td onClick={ev => ev.stopPropagation()}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                {viva || sub.viva_grade != null ? (
                                  <button
                                    type="button"
                                    onClick={() => openWorkbench(sub, 'viva')}
                                    className={hub.vivaTag}
                                    style={{ cursor: 'pointer', border: 'none' }}
                                  >
                                    <Mic2 size={11} /> Viva{' '}
                                    {sub.viva_grade != null
                                      ? `${sub.viva_grade}%`
                                      : viva?.total_score != null ? `${viva.total_score}%` : viva?.status}
                                  </button>
                                ) : (
                                  <span style={{ fontSize: 11.5, color: '#94a3b8' }}>Viva: —</span>
                                )}
                                {sub.quiz_grade != null && (
                                  <span style={{ fontSize: 11, color: '#0369a1', fontWeight: 600 }}>
                                    Quiz: {sub.quiz_grade}%
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              <div style={{ fontSize: 11.5, color: '#475569', lineHeight: 1.4 }}>
                                <div>Auto: <strong>{sub.auto_grade != null ? `${sub.auto_grade}%` : '—'}</strong></div>
                                <div>Manual: <strong>{sub.manual_grade != null ? `${sub.manual_grade}%` : '—'}</strong></div>
                              </div>
                            </td>
                            <td>
                              {displayScore != null ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                  <span style={{ fontWeight: 800, fontSize: 14.5, color: displayScore >= 70 ? '#059669' : displayScore >= 40 ? '#d97706' : '#dc2626' }}>
                                    {displayScore} / {experimentMeta?.grade_scale ?? 100}
                                  </span>
                                  {sub.manual_feedback && (
                                    <span style={{ fontSize: 10.5, color: '#6d28d9', fontWeight: 600 }}>Has Feedback</span>
                                  )}
                                </div>
                              ) : (
                                <span style={{ fontSize: 12, color: '#94a3b8' }}>Ungraded</span>
                              )}
                            </td>
                            <td>
                              {flag ? (
                                <span className={`${styles.pill} ${styles.pillRed}`} title={`Plagiarism match: ${flag.similarity_pct}%`}>
                                  <ShieldAlert size={12} /> {Math.round(flag.similarity_pct)}% Match
                                </span>
                              ) : (
                                <span style={{ fontSize: 12, color: '#10b981', display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
                                  <ShieldCheck size={13} /> Clean
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }} onClick={ev => ev.stopPropagation()}>
                              <button
                                className={styles.primaryBtn}
                                style={{ padding: '6px 12px', fontSize: 12, whiteSpace: 'nowrap' }}
                                onClick={() => openWorkbench(sub, 'code')}
                              >
                                <ClipboardCheck size={13} /> Inspect &amp; grade
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}
            </div>
          </div>
        </>
      )}

      {/* ═══ MODAL 1: STUDENT SUBJECT ASSESSMENT DOSSIER (FROM SUBJECT ROLLUP) ═══ */}
      {dossierStudent && gradeSummaryData && (
        <div className={styles.modalOverlay} onClick={() => setDossierStudent(null)}>
          <div
            className={styles.modalCard}
            style={{ maxWidth: 880, width: '95vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <h2 className={styles.modalTitle}>
                  {dossierStudent.full_name} — Subject Assessment Dossier
                </h2>
                <p className={styles.sectionSub} style={{ margin: 0 }}>
                  Roll No: <strong>{dossierStudent.roll_number || '—'}</strong> · Subject:{' '}
                  <strong>{gradeSummaryData.subject.name} ({gradeSummaryData.subject.code})</strong>
                </p>
              </div>
              <button className={styles.closeBtn} onClick={() => setDossierStudent(null)}><X size={16} /></button>
            </div>

            {/* Dossier summary — pro-rated total, published points and coverage */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, padding: '0 0 14px' }}>
              <div style={{ border: '1px solid #eef1f7', borderRadius: 12, padding: '10px 13px' }}>
                <div className={hub.rubricLabel}>Pro-rated total</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
                  {dossierStudent.subject_percent != null
                    ? `${dossierStudent.subject_percent.toFixed(1)}%`
                    : '—'}
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: '#94a3b8', marginLeft: 4 }}>
                    of {gradeSummaryData.subject.total_marks}
                  </span>
                </div>
              </div>
              <div style={{ border: '1px solid #eef1f7', borderRadius: 12, padding: '10px 13px' }}>
                <div className={hub.rubricLabel}>Published points</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
                  {dossierStudent.points_earned != null ? dossierStudent.points_earned.toFixed(2) : '0.00'}
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: '#94a3b8', marginLeft: 4 }}>
                    / {dossierStudent.points_allocated != null ? dossierStudent.points_allocated.toFixed(2) : '0.00'} pts
                  </span>
                </div>
              </div>
              <div style={{ border: '1px solid #eef1f7', borderRadius: 12, padding: '10px 13px' }}>
                <div className={hub.rubricLabel}>Assessments graded</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
                  {dossierStudent.assessed_count ?? 0}
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: '#94a3b8', marginLeft: 4 }}>
                    / {dossierStudent.assessment_count ?? gradeSummaryData.experiments.length}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ overflowY: 'auto', paddingRight: 4 }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Assessment</th>
                    <th>Status & Submitted At</th>
                    <th>Test Cases</th>
                    <th>Rubric Breakdown (Auto / Viva / Manual)</th>
                    <th>Raw Score</th>
                    <th>Weighted Pts</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {gradeSummaryData.experiments.map(exp => {
                    const raw = dossierStudent.experiment_scores[exp.id];
                    const det = dossierStudent.experiment_details?.[exp.id];
                    const hasScore = raw !== undefined && raw !== null;
                    const weighted = hasScore ? ((raw / (exp.grade_scale || 100)) * (exp.weightage || 0)) : 0;

                    return (
                      <tr key={exp.id}>
                        <td>
                          <div className={styles.tdStrong}>#{exp.exp_number} {exp.title}</div>
                          <div style={{ fontSize: 11.5, color: '#64748b' }}>
                            {exp.delivery_mode === 'exam' ? 'Timed Exam' : 'Lab Experiment'} · Weightage: {exp.weightage} pts
                            {exp.is_published === false && (
                              <span style={{ color: '#b45309', fontWeight: 700 }}> · draft, not counted</span>
                            )}
                          </div>
                        </td>
                        <td>
                          {det?.submitted_at ? (
                            <div>
                              <span className={`${styles.pill} ${styles.pillGreen}`} style={{ fontSize: 11 }}>Submitted</span>
                              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{fmt(det.submitted_at)}</div>
                            </div>
                          ) : (
                            <span className={`${styles.pill} ${styles.pillSlate}`} style={{ fontSize: 11 }}>Not Submitted</span>
                          )}
                        </td>
                        <td>
                          {det?.test_cases_total ? (
                            <span className={`${styles.pill} ${det.test_cases_passed === det.test_cases_total ? styles.pillGreen : styles.pillAmber}`}>
                              {det.test_cases_passed}/{det.test_cases_total} ({det.language || 'code'})
                            </span>
                          ) : '—'}
                        </td>
                        <td>
                          {det ? (
                            <div style={{ fontSize: 11.5, color: '#334155', lineHeight: 1.4 }}>
                              <span>Auto: <strong>{det.auto_grade ?? '—'}</strong></span>
                              {' · '}
                              <span>Viva: <strong>{det.viva_grade ?? '—'}</strong></span>
                              {' · '}
                              <span>Manual: <strong>{det.manual_grade ?? '—'}</strong></span>
                              {det.manual_feedback && (
                                <div style={{ fontSize: 11, color: '#6d28d9', marginTop: 2 }}>
                                  “{det.manual_feedback.slice(0, 60)}{det.manual_feedback.length > 60 ? '…' : ''}”
                                </div>
                              )}
                            </div>
                          ) : '—'}
                        </td>
                        <td style={{ fontWeight: 800, color: '#0f172a' }}>
                          {hasScore ? `${raw} / ${exp.grade_scale}` : '—'}
                        </td>
                        <td style={{ fontWeight: 700, color: exp.is_published === false ? '#b45309' : '#059669' }}>
                          {!hasScore
                            ? '—'
                            : exp.is_published === false
                              ? `+${weighted.toFixed(2)} pts (excluded)`
                              : `+${weighted.toFixed(2)} pts`}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className={styles.primaryBtn}
                            style={{ padding: '5px 10px', fontSize: 11.5, whiteSpace: 'nowrap' }}
                            onClick={() => {
                              const targetSid = dossierStudent.student_id;
                              setDossierStudent(null);
                              setSelectedAssessment(exp.id);
                              setSearchQuery(dossierStudent.roll_number || dossierStudent.full_name);
                              // Once submissions load, instructor can click Inspect & Grade
                              setTimeout(() => {
                                const match = submissions.find(x => x.student_id === targetSid);
                                if (match) openWorkbench(match, 'code');
                              }, 250);
                            }}
                          >
                            Open &rarr;
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL 2: SPLIT-PANE SUBMISSION & GRADING WORKBENCH ═══ */}
      {grading && (
        <div className={styles.modalOverlay} onClick={() => setGrading(null)}>
          <div
            className={styles.modalCard}
            style={{ maxWidth: 1160, width: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Workbench Top Bar */}
            <div style={{
              padding: '16px 22px',
              borderBottom: '1px solid #e2e8f0',
              background: '#f8fafc',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
                    {grading.full_name} ({grading.roll_number || 'No Roll'})
                  </h2>
                  <span className={`${styles.pill} ${
                    grading.submission_status === 'graded' ? styles.pillGreen
                    : grading.submission_status === 'submitted' ? styles.pillBlue
                    : styles.pillSlate
                  }`}>
                    {grading.submission_status === 'graded' ? 'Graded' : grading.submission_status === 'submitted' ? 'Submitted' : 'Not Submitted'}
                  </span>
                </div>
                <p style={{ margin: '3px 0 0', fontSize: 12.5, color: '#64748b' }}>
                  {experimentMeta ? `#${experimentMeta.exp_number} ${experimentMeta.title}` : 'Experiment Submission'} · Submitted: <strong>{fmt(grading.submitted_at)}</strong>
                  {grading.code_text || (grading.files && Object.keys(grading.files).length > 0)
                    ? <> · Language: <strong>{grading.language}</strong></>
                    : <> · <span style={{ color: '#b45309', fontWeight: 650 }}>no code submitted</span></>}
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  className={styles.ghostBtn}
                  disabled={currentSubIndex <= 0}
                  onClick={() => goPrevNextStudent(-1)}
                  style={{ padding: '6px 10px', fontSize: 12 }}
                >
                  <ChevronLeft size={14} /> Prev Student
                </button>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
                  {currentSubIndex >= 0 ? `${currentSubIndex + 1} / ${filteredSubmissions.length}` : ''}
                </span>
                <button
                  type="button"
                  className={styles.ghostBtn}
                  disabled={currentSubIndex < 0 || currentSubIndex >= filteredSubmissions.length - 1}
                  onClick={() => goPrevNextStudent(1)}
                  style={{ padding: '6px 10px', fontSize: 12 }}
                >
                  Next Student <ChevronRight size={14} />
                </button>
                <button className={styles.closeBtn} onClick={() => setGrading(null)}><X size={16} /></button>
              </div>
            </div>

            {/* Split-Pane Body */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.45fr) minmax(340px, 1fr)', flex: 1, minHeight: 480, overflow: 'hidden' }}>
              
              {/* LEFT PANE: STUDENT SUBMISSION & ANSWER INSPECTOR */}
              <div style={{ borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Inspector Sub-Tabs */}
                <div style={{ display: 'flex', gap: 6, padding: '10px 18px', borderBottom: '1px solid #f1f5f9', background: '#ffffff', flexWrap: 'nowrap', overflowX: 'auto' }}>
                  <button
                    type="button"
                    className={`${styles.tabChip} ${workbenchTab === 'code' ? styles.tabChipActive : ''}`}
                    onClick={() => setWorkbenchTab('code')}
                  >
                    <Code2 size={13} /> Code &amp; output
                  </button>
                  <button
                    type="button"
                    className={`${styles.tabChip} ${workbenchTab === 'tests' ? styles.tabChipActive : ''}`}
                    onClick={() => setWorkbenchTab('tests')}
                  >
                    <Terminal size={13} /> Test Cases ({grading.test_cases_passed ?? 0}/{grading.test_cases_total ?? (experimentMeta?.test_cases.length || 0)})
                  </button>
                  <button
                    type="button"
                    className={`${styles.tabChip} ${workbenchTab === 'viva' ? styles.tabChipActive : ''}`}
                    onClick={() => setWorkbenchTab('viva')}
                  >
                    <Mic2 size={13} /> Viva Q&amp;A
                  </button>
                  <button
                    type="button"
                    className={`${styles.tabChip} ${workbenchTab === 'integrity' ? styles.tabChipActive : ''}`}
                    onClick={() => setWorkbenchTab('integrity')}
                  >
                    <ShieldCheck size={13} /> Integrity Check
                  </button>
                </div>

                {/* Tab Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
                  {workbenchTab === 'code' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {/* Version Snapshot Selector */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <History size={14} color="#7c3aed" />
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>Code Snapshot:</span>
                          <select
                            className={styles.select}
                            style={{ height: 32, fontSize: 12, padding: '0 10px', width: 'auto' }}
                            value={selectedVersionIdx}
                            onChange={e => setSelectedVersionIdx(Number(e.target.value))}
                          >
                            <option value={-1}>⭐ Final Submitted Code ({fmt(grading.submitted_at)})</option>
                            {replayVersions.map((v, idx) => (
                              <option key={v.version_number} value={idx}>
                                v{v.version_number} · {v.save_type} · {fmt(v.saved_at)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>
                          {grading.loc != null ? `${grading.loc} LOC` : ''}
                          {grading.execution_time_ms != null ? ` · ${grading.execution_time_ms} ms` : ''}
                          {grading.quality_grade ? ` · Radon Quality: ${grading.quality_grade}` : ''}
                        </div>
                      </div>

                      {/* Code Viewer */}
                      {displayedCode ? (
                        <pre style={{
                          background: '#0f172a',
                          color: '#e2e8f0',
                          padding: '16px 18px',
                          borderRadius: 12,
                          fontSize: 12.5,
                          lineHeight: 1.55,
                          overflowX: 'auto',
                          margin: 0,
                          fontFamily: 'JetBrains Mono, Fira Code, monospace',
                          maxHeight: 360,
                        }}>
                          {displayedCode}
                        </pre>
                      ) : (
                        <div className={hub.empty} style={{ background: '#fcfdff', border: '1px dashed #dbe1ee', borderRadius: 12, padding: '38px 28px' }}>
                          <Code2 size={26} color="#d8b4fe" />
                          <div className={hub.emptyTitle}>
                            {loadingReplay ? 'Loading student code snapshots…' : 'No code file for this submission'}
                          </div>
                          <div className={hub.emptyText}>
                            This mark was built from the rubric components on the right — there is no source file to
                            review here. Use the other tabs for test-case results, viva answers and the integrity check.
                          </div>
                        </div>
                      )}

                      {/* Compiler & Standard Output */}
                      {(grading.stdout || grading.stderr || grading.compile_output) && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {grading.stdout && (
                            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 12 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#166534', marginBottom: 4, textTransform: 'uppercase' }}>Program Stdout</div>
                              <pre style={{ margin: 0, fontSize: 12, color: '#14532d', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{grading.stdout}</pre>
                            </div>
                          )}
                          {(grading.stderr || grading.compile_output) && (
                            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: 12 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#991b1b', marginBottom: 4, textTransform: 'uppercase' }}>Compiler / Runtime Output</div>
                              <pre style={{ margin: 0, fontSize: 12, color: '#7f1d1d', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{grading.stderr || grading.compile_output}</pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {workbenchTab === 'tests' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                          Test Case Execution Summary
                        </span>
                        <span className={`${styles.pill} ${grading.test_cases_passed === grading.test_cases_total && grading.test_cases_total ? styles.pillGreen : styles.pillAmber}`}>
                          {grading.test_cases_passed ?? 0} / {grading.test_cases_total ?? (experimentMeta?.test_cases.length || 0)} Passed
                        </span>
                      </div>

                      {!experimentMeta?.test_cases || experimentMeta.test_cases.length === 0 ? (
                        <p className={styles.sectionSub}>No automated test cases configured on this experiment.</p>
                      ) : (
                        experimentMeta.test_cases.map((tc, idx) => {
                          const passedEst = idx < (grading.test_cases_passed ?? 0);
                          return (
                            <div key={tc.id} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a' }}>
                                  Test Case #{idx + 1} {tc.is_hidden ? '(Hidden Evaluation Case)' : '(Sample Case)'}
                                </span>
                                <span className={`${styles.pill} ${passedEst ? styles.pillGreen : styles.pillRed}`}>
                                  {passedEst ? '✓ Passed' : '✗ Failed / Not Run'} · {tc.points} pts
                                </span>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <div style={{ background: '#f8fafc', padding: 8, borderRadius: 8, fontSize: 11.5 }}>
                                  <div style={{ fontWeight: 700, color: '#64748b', marginBottom: 2 }}>Input (stdin):</div>
                                  <code style={{ color: '#0f172a', whiteSpace: 'pre-wrap' }}>{tc.input_data || '(empty)'}</code>
                                </div>
                                <div style={{ background: '#f8fafc', padding: 8, borderRadius: 8, fontSize: 11.5 }}>
                                  <div style={{ fontWeight: 700, color: '#64748b', marginBottom: 2 }}>Expected Output:</div>
                                  <code style={{ color: '#059669', whiteSpace: 'pre-wrap' }}>{tc.expected_output || '(empty)'}</code>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {workbenchTab === 'viva' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {/* Completed Pre-Lab / Quiz / Assignment Modules */}
                      {grading.module_submissions && grading.module_submissions.length > 0 && (
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
                            Completed Experiment Modules & Quizzes
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {grading.module_submissions.map(m => (
                              <div key={m.module_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12.5 }}>
                                <span><strong>{m.module_title}</strong> ({m.module_type})</span>
                                <span style={{ color: '#059669', fontWeight: 700 }}>
                                  {m.score != null ? `Score: ${m.score}%` : 'Completed'} · {fmt(m.completed_at)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Oral AI Viva Q&A */}
                      {loadingVivaDetail ? (
                        <p className={styles.sectionSub}>Loading AI Viva Q&A transcript…</p>
                      ) : !activeViva || activeViva.answers.length === 0 ? (
                        <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 12, padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                          No AI Viva Q&A answers recorded for this student on this experiment.
                        </div>
                      ) : (
                        activeViva.answers.map((ans, idx) => (
                          <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed' }}>Viva Question #{ans.question_index + 1}</span>
                              <span className={`${styles.pill} ${(ans.score ?? 0) >= 70 ? styles.pillGreen : styles.pillAmber}`}>
                                Score: {ans.score ?? '—'}/100
                              </span>
                            </div>
                            <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>{ans.question_text}</p>
                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, fontSize: 12.5, color: '#334155', marginBottom: 8 }}>
                              <strong>Student Response:</strong> “{ans.answer_text || 'No response submitted'}”
                            </div>
                            {ans.ai_feedback && (
                              <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: 10, fontSize: 12, color: '#4c1d95' }}>
                                <strong>AI Evaluation:</strong> {ans.ai_feedback}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {workbenchTab === 'integrity' && (
                    <div>
                      {flagByStudent.has(grading.student_id) ? (
                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 16 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#b91c1c', fontWeight: 800, fontSize: 14, marginBottom: 6 }}>
                            <ShieldAlert size={18} /> Plagiarism Similarity Alert ({Math.round(flagByStudent.get(grading.student_id)!.similarity_pct)}% Match)
                          </div>
                          <p style={{ fontSize: 13, color: '#7f1d1d', margin: 0 }}>
                            This submission triggered a structural AST/token similarity flag. Review the student&apos;s version snapshot history in the Code tab to verify progressive authoring.
                          </p>
                        </div>
                      ) : (
                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', gap: 10, color: '#166534', fontWeight: 600, fontSize: 13.5 }}>
                          <ShieldCheck size={18} /> No plagiarism or integrity flags detected for this submission.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT PANE: RUBRIC BREAKDOWN & INSTRUCTOR GRADING CONTROLS */}
              <div style={{ padding: 20, background: '#ffffff', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
                <div className={hub.wbHead}>
                  <div>
                    <h3 className={hub.wbTitle}>Rubric &amp; score</h3>
                    <p className={hub.wbSub}>
                      Tick a component only when it has actually been assessed — ticked components are
                      re-normalised into the final mark, unticked ones are excluded rather than scored zero.
                    </p>
                  </div>
                  <ScoreRing pct={livePreview.final != null
                    ? (livePreview.final / (experimentMeta?.grade_scale ?? 100)) * 100
                    : null} />
                </div>

                {/* Rubric components — only those the rubric actually uses are scored */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className={hub.rubricHeadRow}>
                    <span>Include</span>
                    <span>Component</span>
                    <span style={{ textAlign: 'right' }}>Score</span>
                    <span style={{ textAlign: 'right' }}>Adds</span>
                  </div>
                  {([
                    { key: 'test_cases',   label: 'Test cases',   auto: true  },
                    { key: 'lab_report',   label: 'Lab report',   auto: false },
                    { key: 'code_quality', label: 'Code quality', auto: true  },
                    { key: 'viva',         label: 'Oral viva',    auto: true  },
                    { key: 'quiz',         label: 'Pre-lab quiz', auto: true  },
                  ] as const).map(({ key, label, auto }) => {
                    const weight = Number((rubricOf as Record<string, number>)[key] || 0);
                    const value = componentValue(key);

                    if (!weight) {
                      return (
                        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, opacity: 0.6, padding: '2px 10px' }}>
                          <span style={{ color: '#475569' }}>{label}</span>
                          <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>0% — not part of this rubric</span>
                        </div>
                      );
                    }

                    const ticked = !!assessed[key];
                    const marked = value != null;
                    // Marks this component adds to the FINAL mark (renormalised
                    // over the assessed weight), matching what the server stores.
                    const marksAdded = ticked && marked
                      ? (value * weight) / (livePreview.weightUsed || weight)
                      : null;
                    return (
                      <div key={key} className={`${hub.compRow} ${ticked ? hub.compRowOn : hub.compRowOff}`}>
                        <button
                          type="button"
                          className={`${hub.tickBtn} ${ticked ? hub.tickBtnOn : ''}`}
                          aria-pressed={ticked}
                          title={ticked ? 'Ticked — counted in the final mark' : 'Unticked — excluded, not marked zero'}
                          onClick={() => setAssessed(prev => ({ ...prev, [key]: !prev[key] }))}
                        >
                          {ticked ? <CheckCircle2 size={11} /> : <span style={{ fontSize: 12 }}>○</span>}
                          {ticked ? 'Assessed' : 'Skip'}
                        </button>
                        <div style={{ minWidth: 0 }}>
                          <div className={hub.compName}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                            <span className={hub.compWeight}>{weight}%</span>
                          </div>
                          <div className={hub.compHint}>
                            {auto ? 'auto-computed — type to override' : 'your score, 0–100'}
                            {!ticked ? ' · excluded from the mark' : ''}
                          </div>
                        </div>
                        <input
                          className={styles.input}
                          type="number" min={0} max={100}
                          value={componentScores[key] ?? ''}
                          placeholder="—"
                          disabled={!ticked}
                          onChange={e => setComponentScores(prev => ({ ...prev, [key]: e.target.value }))}
                          style={{ padding: '6px 8px', fontSize: 13, textAlign: 'right' }}
                        />
                        <span className={`${hub.compAdds} ${marksAdded == null ? hub.compAddsMuted : ''}`}>
                          {marksAdded != null ? `+${marksAdded.toFixed(1)}` : '—'}
                        </span>
                      </div>
                    );
                  })}

                  <div className={hub.finalBar}>
                    <div>
                      <div className={hub.finalLabel}>Final score</div>
                      <div className={hub.finalValue}>
                        {livePreview.final ?? '—'}
                        <span className={hub.finalScale}> / {experimentMeta?.grade_scale ?? 100}</span>
                      </div>
                      {grading.hint_deduction ? (
                        <div className={hub.finalNote}>after −{grading.hint_deduction} hint deduction</div>
                      ) : null}
                    </div>
                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                      {livePreview.provisional ? (
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#b45309', background: '#fef3c7',
                                       border: '1px solid #fcd34d', borderRadius: 999, padding: '2px 8px' }}>
                          PROVISIONAL · {livePreview.weightUsed}% assessed
                        </span>
                      ) : (
                        <span className={`${hub.healthStatus} ${hub.statusOk}`}>
                          <CheckCircle2 size={11} /> 100% assessed
                        </span>
                      )}
                      <span style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 600 }}>
                        weighted over the ticked components
                      </span>
                    </div>
                  </div>
                </div>

                {/* Feedback Textarea + AI Draft */}
                <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label className={styles.formLabel} style={{ marginBottom: 0 }}>Feedback to Student</label>
                    <button
                      type="button"
                      className={styles.ghostBtn}
                      onClick={generateDraft}
                      disabled={drafting}
                      style={{ padding: '4px 8px', fontSize: 11.5 }}
                    >
                      {drafting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      {drafting ? 'Drafting…' : 'AI Draft Feedback'}
                    </button>
                  </div>
                  <textarea
                    className={styles.textarea}
                    rows={4}
                    value={feedback}
                    onChange={e => setFeedback(e.target.value)}
                    placeholder="Specific feedback on algorithm efficiency, edge cases, and lab report clarity…"
                  />
                </div>

                {grading.is_locked && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <p style={{ fontSize: 12, color: '#b45309', display: 'flex', gap: 6, alignItems: 'center', margin: 0 }}>
                      <Lock size={12} /> Student has already viewed this published grade.
                    </p>
                    {overrideLock ? (
                      <div style={{ border: '1px solid #fcd34d', background: '#fffbeb', borderRadius: 8, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 11.5, color: '#92400e', lineHeight: 1.45 }}>
                          Overriding replaces the mark the student already saw. The correction is recorded and the student is shown the new mark.
                        </span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button type="button" className={styles.primaryBtn} disabled={saving}
                            style={{ flex: 1, justifyContent: 'center', fontSize: 11.5, padding: '6px 10px' }}
                            onClick={() => saveGrade(false, true)}>
                            <CheckCircle2 size={13} /> {saving ? 'Saving…' : 'Confirm override & save'}
                          </button>
                          <button type="button" className={styles.secondaryBtn} disabled={saving}
                            style={{ fontSize: 11.5, padding: '6px 10px' }}
                            onClick={() => setOverrideLock(false)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" className={styles.secondaryBtn}
                        style={{ fontSize: 11.5, padding: '6px 10px', width: 'fit-content' }}
                        onClick={() => setOverrideLock(true)}>
                        <Lock size={12} /> Correct this mark anyway
                      </button>
                    )}
                  </div>
                )}

                <div className={hub.wbFooter}>
                  <button
                    className={styles.secondaryBtn}
                    disabled={saving || (grading.is_locked && !overrideLock)}
                    title={grading.is_locked && !overrideLock ? 'Locked — use “Correct this mark anyway”' : undefined}
                    onClick={() => saveGrade(false)}
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    <Save size={14} /> {saving ? 'Saving…' : 'Save Grade'}
                  </button>
                  <button
                    className={styles.primaryBtn}
                    disabled={saving || (grading.is_locked && !overrideLock)}
                    onClick={() => saveGrade(true)}
                    style={{ flex: 1.3, justifyContent: 'center' }}
                  >
                    <CheckCircle2 size={14} /> Save & Next Student
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL 3: GRADE CURVE SIMULATOR ═══ */}
      {showCurve && (
        <div className={styles.modalOverlay} onClick={() => setShowCurve(false)}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Curve Experiment Grades</h2>
              <button className={styles.closeBtn} onClick={() => setShowCurve(false)}><X size={16} /></button>
            </div>

            <div className={styles.gridTwo}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Curve Mode</label>
                <select className={styles.select} value={curveMode} onChange={e => setCurveMode(e.target.value as 'add' | 'factor')}>
                  <option value="add">Flat boost (+N points)</option>
                  <option value="factor">Multiplier (× factor)</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>{curveMode === 'add' ? 'Points to add' : 'Multiplier'}</label>
                <input className={styles.input} type="number" step="0.1" value={curveValue} onChange={e => setCurveValue(e.target.value)} />
              </div>
            </div>

            {curvePreview && (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, marginBottom: 14, fontSize: 13 }}>
                <div>Affected students: <strong>{curvePreview.affected}</strong> · Locked skipped: <strong>{curvePreview.locked_skipped}</strong></div>
                <div>Class average: <strong>{curvePreview.class_avg_before ?? '—'}%</strong> &rarr; <strong style={{ color: '#059669' }}>{curvePreview.class_avg_after ?? '—'}%</strong></div>
              </div>
            )}

            <div className={styles.actionRow}>
              <button className={styles.secondaryBtn} disabled={curving} onClick={() => runCurve(false)}>
                Preview Impact
              </button>
              <button className={styles.primaryBtn} disabled={curving} onClick={() => runCurve(true)}>
                <TrendingUp size={14} /> Apply Curve
              </button>
            </div>
          </div>
        </div>
      )}
    </InstructorShell>
  );
}
