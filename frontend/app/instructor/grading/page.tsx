'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ClipboardCheck, CheckCircle2, History, Lock, Save, X,
  Sparkles, Loader2, TrendingUp, FileCheck, Award, AlertTriangle, BookOpen,
  Calendar, Users, ShieldAlert, ShieldCheck, Download, Search, Mic2,
  Code2, Terminal, Layers, ChevronLeft, ChevronRight, Eye, Clock, Building2, Filter
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import { experimentService } from '@/services/experiment.service';
import { submissionService } from '@/services/submission.service';
import { sessionService } from '@/services/session.service';
import { instructorService, type VivaListItem, type VivaDetail } from '@/services/instructor.service';
import { experienceService, type InstructorExam, type ExamAttemptRow } from '@/services/experience.service';
import { exportCSV } from '@/lib/analytics-utils';
import styles from '../shared.module.css';

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

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

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
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Submissions & Experiment metadata state
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [experimentMeta, setExperimentMeta] = useState<ExperimentMeta | null>(null);
  const [examAttempts, setExamAttempts] = useState<ExamAttemptRow[]>([]);

  // Split-Pane Grading Workbench Modal state
  const [grading, setGrading] = useState<SubmissionRow | null>(null);
  const [workbenchTab, setWorkbenchTab] = useState<'code' | 'tests' | 'viva' | 'integrity'>('code');
  const [manualGrade, setManualGrade] = useState('');
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

  // Filtered rows by search & status
  const filteredRollupStudents = useMemo(() => {
    if (!gradeSummaryData?.students) return [];
    if (!searchQuery.trim()) return gradeSummaryData.students as StudentDossierTarget[];
    const q = searchQuery.toLowerCase();
    return (gradeSummaryData.students as StudentDossierTarget[]).filter(s =>
      s.full_name.toLowerCase().includes(q) || (s.roll_number || '').toLowerCase().includes(q)
    );
  }, [gradeSummaryData?.students, searchQuery]);

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
  const liveBlendedPreview = useMemo(() => {
    if (!grading) return null;
    const rub = experimentMeta?.rubric || { test_cases: 60, lab_report: 20, code_quality: 10, viva: 10, quiz: 0 };
    const tcScore = grading.auto_grade ?? (
      grading.test_cases_total ? Math.round(((grading.test_cases_passed ?? 0) / grading.test_cases_total) * 100) : 0
    );
    const manualVal = manualGrade !== '' && !Number.isNaN(parseFloat(manualGrade)) ? Math.min(100, Math.max(0, parseFloat(manualGrade))) : (grading.manual_grade ?? tcScore);
    const qualRaw = grading.code_quality_grade ?? (grading.quality_grade === 'A' ? 95 : grading.quality_grade === 'B' ? 82 : grading.quality_grade === 'C' ? 70 : 75);
    const qualScore = qualRaw > 0 && qualRaw <= 10 ? qualRaw * 10 : qualRaw;
    const vivaScore = grading.viva_grade ?? (activeViva?.viva?.total_score ?? 0);
    const quizScore = grading.quiz_grade ?? 0;

    const rubricSum = (rub.test_cases || 0) + (rub.lab_report || 0) + (rub.code_quality || 0) + (rub.viva || 0) + (rub.quiz || 0);
    if (rubricSum <= 0 || (rub.lab_report === 0 && manualGrade !== '')) {
      return Math.round(manualVal * 10) / 10;
    }

    const blended =
      tcScore * ((rub.test_cases || 0) / 100) +
      manualVal * ((rub.lab_report || 0) / 100) +
      qualScore * ((rub.code_quality || 0) / 100) +
      vivaScore * ((rub.viva || 0) / 100) +
      quizScore * ((rub.quiz || 0) / 100) -
      (grading.hint_deduction || 0);

    return Math.max(0, Math.round(blended * 10) / 10);
  }, [grading, experimentMeta, manualGrade, activeViva]);

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

  const saveGrade = async (advanceNext = false) => {
    if (!grading) return;
    setSaving(true);
    try {
      await submissionService.gradeSubmission({
        student_id: grading.student_id,
        experiment_id: selectedAssessment,
        session_id: grading.session_id ?? undefined,
        manual_grade: manualGrade === '' ? null : Math.min(100, Math.max(0, parseFloat(manualGrade))),
        manual_feedback: feedback || undefined,
      });
      toast3(`Saved grade for ${grading.full_name}.`);
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
      r['Total Subject Score'] = s.subject_score;
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

      {/* ═══ 5-LEVEL CASCADING ACADEMIC HIERARCHY FILTER BAR ═══ */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 16,
        padding: '16px 20px',
        marginBottom: 20,
        boxShadow: '0 4px 16px rgba(15,23,42,0.03)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 12, alignItems: 'center' }}>
          {/* 1. Department */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
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

          {/* 2. Academic Year */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
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

          {/* 3. Batch */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
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

          {/* 4. Section */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
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

          {/* 5. Subject */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              <BookOpen size={12} color="#7c3aed" /> Subject
            </label>
            <select
              className={styles.select}
              style={{ width: '100%' }}
              value={selectedSubject}
              onChange={e => {
                setSelectedSubject(e.target.value);
                setSelectedAssessment('all');
              }}
            >
              {availableSubjects.length === 0 && <option value="">No subjects assigned</option>}
              {availableSubjects.map(s => (
                <option key={s.subject_id} value={s.subject_id}>
                  {s.subject_name} ({s.subject_code})
                </option>
              ))}
            </select>
          </div>

          {/* 6. Assessment Scope Selector */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              <Award size={12} color="#7c3aed" /> Assessment View
            </label>
            <select
              className={styles.select}
              style={{ width: '100%', fontWeight: selectedAssessment === 'all' ? 700 : 600 }}
              value={selectedAssessment}
              onChange={e => setSelectedAssessment(e.target.value)}
            >
              <option value="all">⭐ Full Subject Gradebook Rollup</option>
              {subjectExperiments.length > 0 && (
                <optgroup label="Laboratory Experiments">
                  {subjectExperiments.map(e => (
                    <option key={e.id} value={e.id}>
                      #{e.exp_number} — {e.title} {e.weightage ? `(${e.weightage} pts)` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              {subjectExams.length > 0 && (
                <optgroup label="Timed Exams">
                  {subjectExams.map(ex => (
                    <option key={ex.id} value={ex.id}>
                      ⏱️ {ex.title} ({ex.exam_type.toUpperCase()})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>
      </div>

      {/* ═══ VIEW 1: SUBJECT GRADE BOOK ROLLUP (ALL ASSESSMENTS) ═══ */}
      {selectedAssessment === 'all' && (
        <>
          {gradeSummaryData?.subject.over_allocation && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: '#fffbeb', border: '1px solid #fef3c7', color: '#b45309',
              padding: '12px 18px', borderRadius: 12, fontSize: 13.5, fontWeight: 600,
              marginBottom: 16
            }}>
              <AlertTriangle size={18} color="#d97706" />
              <div>
                <strong>Over-allocation Notice:</strong> Total assessment weightage ({gradeSummaryData.subject.total_weightage} pts) exceeds Subject Total Marks ({gradeSummaryData.subject.total_marks} pts).
              </div>
            </div>
          )}

          {gradeSummaryData && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Subject Ceiling</span>
                <span style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{gradeSummaryData.subject.total_marks} Marks</span>
                <span style={{ fontSize: 11.5, color: '#94a3b8' }}>{gradeSummaryData.subject.name} ({gradeSummaryData.subject.code})</span>
              </div>

              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Allocated Weightage</span>
                <span style={{ fontSize: 22, fontWeight: 800, color: gradeSummaryData.subject.over_allocation ? '#d97706' : '#7c3aed' }}>
                  {gradeSummaryData.subject.total_weightage} pts
                </span>
                <span style={{ fontSize: 11.5, color: '#94a3b8' }}>Across {gradeSummaryData.experiments.length} assessments</span>
              </div>

              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Enrolled Students</span>
                <span style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{gradeSummaryData.students.length}</span>
                <span style={{ fontSize: 11.5, color: '#94a3b8' }}>Click any student or score cell to inspect</span>
              </div>

              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Class Rollup Average</span>
                <span style={{ fontSize: 22, fontWeight: 800, color: '#059669' }}>
                  {gradeSummaryData.students.length > 0
                    ? `${(gradeSummaryData.students.reduce((acc, s) => acc + s.subject_score, 0) / gradeSummaryData.students.length).toFixed(1)} pts`
                    : '—'}
                </span>
                <span style={{ fontSize: 11.5, color: '#94a3b8' }}>Weighted course average</span>
              </div>
            </div>
          )}

          {/* Rollup Table Card */}
          <div className={styles.sectionCard} style={{ overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="Search student or roll no..."
                    style={{ paddingLeft: 30, maxWidth: 260, height: 36, fontSize: 13 }}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <span className={styles.sectionSub}>
                  Showing {filteredRollupStudents.length} of {gradeSummaryData?.students.length ?? 0} students · <strong>Click any student or score cell for full submission breakdown</strong>
                </span>
              </div>

              <button
                type="button"
                className={styles.secondaryBtn}
                style={{ height: 36, padding: '0 14px', fontSize: 12.5 }}
                onClick={handleExportCSV}
                disabled={!gradeSummaryData || gradeSummaryData.students.length === 0}
              >
                <Download size={14} /> Export Gradebook (CSV)
              </button>
            </div>

            {gradeSummaryLoading ? (
              <p className={styles.sectionSub} style={{ padding: 24 }}>Loading subject gradebook…</p>
            ) : !selectedSubject ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <BookOpen size={30} color="#d8b4fe" style={{ marginBottom: 8 }} />
                <p className={styles.sectionSub}>Select a subject to view the gradebook.</p>
              </div>
            ) : !gradeSummaryData || gradeSummaryData.experiments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <ClipboardCheck size={30} color="#d8b4fe" style={{ marginBottom: 8 }} />
                <p className={styles.sectionSub}>No experiments or exams found for this subject.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto', width: '100%' }}>
                <table className={styles.table} style={{ minWidth: 780 }}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 220, position: 'sticky', left: 0, background: '#f8fafc', zIndex: 1 }}>Student</th>
                      {gradeSummaryData.experiments.map(e => (
                        <th
                          key={e.id}
                          style={{ minWidth: 145, textAlign: 'center', cursor: 'pointer' }}
                          onClick={() => setSelectedAssessment(e.id)}
                          title={`Click to open all submissions for #${e.exp_number} ${e.title}`}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1e293b', textDecoration: 'underline', textDecorationColor: '#cbd5e1' }}>
                              #{e.exp_number} {e.title.length > 18 ? e.title.slice(0, 18) + '…' : e.title}
                            </span>
                            <span style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: 6,
                              background: e.delivery_mode === 'exam' ? '#ede9fe' : '#e0f2fe',
                              color: e.delivery_mode === 'exam' ? '#7c3aed' : '#0369a1',
                            }}>
                              {e.delivery_mode === 'exam' ? '⏱️ Exam' : '🧪 Lab'} ({e.weightage} pts)
                            </span>
                          </div>
                        </th>
                      ))}
                      <th style={{ minWidth: 160, textAlign: 'right' }}>
                        Subject Total ({gradeSummaryData.subject.total_marks} max)
                      </th>
                      <th style={{ minWidth: 110, textAlign: 'right' }}>Dossier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRollupStudents.map(s => {
                      const pct = gradeSummaryData.subject.total_marks > 0
                        ? Math.round((s.subject_score / gradeSummaryData.subject.total_marks) * 100)
                        : 0;
                      return (
                        <tr key={s.student_id} style={{ cursor: 'pointer' }} onClick={() => setDossierStudent(s)}>
                          <td style={{ position: 'sticky', left: 0, background: '#ffffff', zIndex: 1 }}>
                            <div className={styles.tdStrong} style={{ color: '#4f46e5' }}>{s.full_name}</div>
                            <div style={{ fontSize: 11.5, color: '#64748b' }}>
                              {s.roll_number || s.student_id.slice(0, 8)}
                            </div>
                          </td>
                          {gradeSummaryData.experiments.map(e => {
                            const rawScore = s.experiment_scores[e.id];
                            const det = s.experiment_details?.[e.id];
                            const hasScore = rawScore !== undefined && rawScore !== null;
                            const weighted = hasScore ? ((rawScore / (e.grade_scale || 100)) * (e.weightage || 0)) : 0;
                            return (
                              <td
                                key={e.id}
                                style={{ textAlign: 'center' }}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  setDossierStudent(s);
                                }}
                              >
                                {hasScore ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                                    <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                                      {rawScore} / {e.grade_scale}
                                    </span>
                                    <span style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>
                                      +{weighted.toFixed(1)} pts
                                    </span>
                                    {det?.submitted_at && (
                                      <span style={{ fontSize: 10, color: '#94a3b8' }}>
                                        {new Date(det.submitted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                      </span>
                                    )}
                                  </div>
                                ) : det?.submitted_at ? (
                                  <span className={`${styles.pill} ${styles.pillAmber}`} style={{ fontSize: 10.5 }}>
                                    Submitted · Needs Grade
                                  </span>
                                ) : (
                                  <span style={{ fontSize: 12, color: '#cbd5e1' }}>Not Submitted</span>
                                )}
                              </td>
                            );
                          })}
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                              <span style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>
                                {s.subject_score.toFixed(1)} / {gradeSummaryData.subject.total_marks}
                              </span>
                              <span style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: '1px 7px',
                                borderRadius: 8,
                                background: pct >= 75 ? '#dcfce7' : pct >= 50 ? '#dbeafe' : '#fee2e2',
                                color: pct >= 75 ? '#15803d' : pct >= 50 ? '#1d4ed8' : '#b91c1c'
                              }}>
                                {pct}%
                              </span>
                            </div>
                          </td>
                          <td style={{ textAlign: 'right' }} onClick={ev => ev.stopPropagation()}>
                            <button
                              type="button"
                              className={styles.ghostBtn}
                              style={{ fontSize: 12, padding: '5px 10px' }}
                              onClick={() => setDossierStudent(s)}
                            >
                              <Eye size={13} /> Breakdown
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══ VIEW 2: SPECIFIC ASSESSMENT SUBMISSIONS (LAB OR EXAM) ═══ */}
      {selectedAssessment !== 'all' && (
        <>
          {/* Assessment KPI Summary Bar */}
          {!isSelectedExam && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 12, marginBottom: 16 }}>
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '12px 16px' }}>
                <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>Experiment Rubric</span>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                  {experimentMeta ? `${experimentMeta.weightage} pts · Scale /${experimentMeta.grade_scale}` : '100 pts'}
                </div>
                <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>
                  TC {experimentMeta?.rubric.test_cases ?? 60}% · Lab {experimentMeta?.rubric.lab_report ?? 20}% · Qual {experimentMeta?.rubric.code_quality ?? 10}% · Viva {experimentMeta?.rubric.viva ?? 10}%
                </span>
              </div>
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '12px 16px' }}>
                <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>Graded / Submitted</span>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#059669', marginTop: 2 }}>
                  {subStats.gradedCount} Graded · {subStats.submittedCount} Pending
                </div>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{subStats.notSubmittedCount} not yet submitted</span>
              </div>
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '12px 16px' }}>
                <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>Experiment Average</span>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#4f46e5', marginTop: 2 }}>
                  {subStats.avgScore}%
                </div>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>Across graded & auto-scored runs</span>
              </div>
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '12px 16px' }}>
                <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>Integrity Alerts</span>
                <div style={{ fontSize: 20, fontWeight: 800, color: subStats.flaggedCount > 0 ? '#dc2626' : '#10b981', marginTop: 2 }}>
                  {subStats.flaggedCount > 0 ? `${subStats.flaggedCount} Flagged` : 'All Clean'}
                </div>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>AST & token similarity check</span>
              </div>
            </div>
          )}

          {/* Toolbar: Search, Status Pills, Back to Rollup & Curve */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={() => setSelectedAssessment('all')}
                style={{ height: 34, padding: '0 12px', fontSize: 12.5 }}
              >
                <ChevronLeft size={14} /> Subject Rollup
              </button>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  className={styles.input}
                  placeholder="Filter student or roll no..."
                  style={{ paddingLeft: 30, maxWidth: 230, height: 34, fontSize: 13 }}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              {!isSelectedExam && (
                <div className={styles.tabRow} style={{ gap: 6 }}>
                  {([
                    { id: 'all', label: `All (${subStats.total})` },
                    { id: 'submitted', label: `Needs Review (${subStats.submittedCount})` },
                    { id: 'graded', label: `Graded (${subStats.gradedCount})` },
                    { id: 'not_submitted', label: `Not Submitted (${subStats.notSubmittedCount})` },
                    { id: 'flagged', label: `Flagged (${subStats.flaggedCount})` },
                  ] as const).map(f => (
                    <button
                      key={f.id}
                      type="button"
                      className={`${styles.tabChip} ${statusFilter === f.id ? styles.tabChipActive : ''}`}
                      onClick={() => setStatusFilter(f.id)}
                      style={{ fontSize: 12, padding: '5px 10px' }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!isSelectedExam && (
              <button
                className={styles.secondaryBtn}
                onClick={() => { setShowCurve(true); setCurvePreview(null); }}
                style={{ height: 34, padding: '0 12px', fontSize: 12.5 }}
              >
                <TrendingUp size={14} /> Curve Grades
              </button>
            )}
          </div>

          {/* Submissions Table Card */}
          <div className={styles.sectionCard}>
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
                        <th>Student</th>
                        <th>Status & When Submitted</th>
                        <th>Language & Code</th>
                        <th>Test Cases</th>
                        <th>Viva & Quiz</th>
                        <th>Rubric Breakdown</th>
                        <th>Final Score</th>
                        <th>Integrity</th>
                        <th style={{ textAlign: 'right' }}>Inspect & Grade</th>
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
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                  <span className={`${styles.pill} ${styles.pillBlue}`} style={{ width: 'fit-content' }}>
                                    {sub.language}
                                  </span>
                                  <span style={{ fontSize: 11, color: '#64748b' }}>
                                    {sub.loc != null ? `${sub.loc} LOC` : 'Module/Quiz'} {sub.quality_grade ? `· Quality ${sub.quality_grade}` : ''}
                                  </span>
                                </div>
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
                                {viva ? (
                                  <button
                                    type="button"
                                    onClick={() => openWorkbench(sub, 'viva')}
                                    style={{
                                      border: 'none', background: '#f5f3ff', color: '#7c3aed',
                                      padding: '3px 8px', borderRadius: 6, cursor: 'pointer',
                                      fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, width: 'fit-content'
                                    }}
                                  >
                                    <Mic2 size={11} /> Viva: {viva.total_score != null ? `${viva.total_score}%` : viva.status}
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
                                style={{ padding: '6px 12px', fontSize: 12 }}
                                onClick={() => openWorkbench(sub, 'code')}
                              >
                                <ClipboardCheck size={13} /> Inspect & Grade
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
                  Roll No: <strong>{dossierStudent.roll_number || '—'}</strong> · Subject: <strong>{gradeSummaryData.subject.name} ({gradeSummaryData.subject.code})</strong> · Total Score: <strong>{dossierStudent.subject_score.toFixed(1)} / {gradeSummaryData.subject.total_marks} pts</strong>
                </p>
              </div>
              <button className={styles.closeBtn} onClick={() => setDossierStudent(null)}><X size={16} /></button>
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
                        <td style={{ fontWeight: 700, color: '#059669' }}>
                          {hasScore ? `+${weighted.toFixed(1)} pts` : '0.0 pts'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className={styles.primaryBtn}
                            style={{ padding: '5px 10px', fontSize: 11.5 }}
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
                            Open Submission &rarr;
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
                  {experimentMeta ? `#${experimentMeta.exp_number} ${experimentMeta.title}` : 'Experiment Submission'} · Submitted: <strong>{fmt(grading.submitted_at)}</strong> · Language: <strong>{grading.language}</strong>
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
                <div style={{ display: 'flex', gap: 6, padding: '10px 18px', borderBottom: '1px solid #f1f5f9', background: '#ffffff', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`${styles.tabChip} ${workbenchTab === 'code' ? styles.tabChipActive : ''}`}
                    onClick={() => setWorkbenchTab('code')}
                  >
                    <Code2 size={13} /> Submitted Code & Output
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
                    <Mic2 size={13} /> Viva Q&A & Modules
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
                        <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 12, padding: 28, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                          {loadingReplay ? 'Loading student code snapshots…' : 'No code file submitted for this experiment yet.'}
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
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Rubric & Score Breakdown</h3>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                    Auto-computed components combine with your instructor evaluation score.
                  </p>
                </div>

                {/* Rubric Component Breakdown Table */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: '#475569' }}>1. Automated Test Cases ({experimentMeta?.rubric.test_cases ?? 60}%)</span>
                    <strong style={{ color: '#0f172a' }}>{grading.auto_grade != null ? `${grading.auto_grade}%` : '—'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: '#475569' }}>2. Code Quality / Radon ({experimentMeta?.rubric.code_quality ?? 10}%)</span>
                    <strong style={{ color: '#0f172a' }}>{grading.quality_grade ? `Grade ${grading.quality_grade}` : (grading.code_quality_grade ?? '—')}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: '#475569' }}>3. Oral AI Viva ({experimentMeta?.rubric.viva ?? 10}%)</span>
                    <strong style={{ color: '#0f172a' }}>{grading.viva_grade ?? activeViva?.viva?.total_score ?? '—'}%</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: '#475569' }}>4. Pre-Lab Quiz ({experimentMeta?.rubric.quiz ?? 0}%)</span>
                    <strong style={{ color: '#0f172a' }}>{grading.quiz_grade != null ? `${grading.quiz_grade}%` : '—'}</strong>
                  </div>
                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#4f46e5' }}>Blended Final Score Preview</span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: '#059669' }}>
                      {liveBlendedPreview ?? '—'} / {experimentMeta?.grade_scale ?? 100}
                    </span>
                  </div>
                </div>

                {/* Manual / Instructor Evaluation Input */}
                <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                  <label className={styles.formLabel}>
                    Instructor / Lab Report Score (0–100) · Weight: {experimentMeta?.rubric.lab_report ?? 20}%
                  </label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      className={styles.input}
                      type="number"
                      min={0}
                      max={100}
                      value={manualGrade}
                      onChange={e => setManualGrade(e.target.value)}
                      placeholder="e.g. 88"
                    />
                    {grading.auto_grade != null && (
                      <button
                        type="button"
                        className={styles.ghostBtn}
                        style={{ whiteSpace: 'nowrap', fontSize: 11.5, padding: '8px 10px' }}
                        onClick={() => setManualGrade(String(Math.round(grading.auto_grade!)))}
                      >
                        Match Auto ({Math.round(grading.auto_grade)}%)
                      </button>
                    )}
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
                  <p style={{ fontSize: 12, color: '#b45309', display: 'flex', gap: 6, alignItems: 'center', margin: 0 }}>
                    <Lock size={12} /> Student has already viewed this published grade.
                  </p>
                )}

                <div style={{ marginTop: 'auto', display: 'flex', gap: 8, paddingTop: 8 }}>
                  <button
                    className={styles.secondaryBtn}
                    disabled={saving}
                    onClick={() => saveGrade(false)}
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    <Save size={14} /> {saving ? 'Saving…' : 'Save Grade'}
                  </button>
                  <button
                    className={styles.primaryBtn}
                    disabled={saving}
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
