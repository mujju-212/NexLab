'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ClipboardCheck, CheckCircle2, History, Lock, Save, X,
  Sparkles, Loader2, TrendingUp, FileCheck, Award, AlertTriangle, BookOpen,
  Calendar, Users, ShieldAlert, ShieldCheck, Download, Search, Check, Mic2, HelpCircle
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import { experimentService, type SubjectGradeSummary } from '@/services/experiment.service';
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
  section_id: string;
  section_name: string;
  batch_id?: string;
  batch_name?: string;
  academic_year?: string;
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
}

interface SubmissionRow {
  id: string;
  student_id: string;
  session_id: string | null;
  full_name: string;
  roll_number: string;
  language: string;
  test_cases_passed: number | null;
  test_cases_total: number | null;
  quality_grade: string | null;
  loc: number | null;
  compile_status: string | null;
  submitted_at: string | null;
  final_grade?: number | null;
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

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export default function GradingPage() {
  const [toast, setToast] = useState<string | null>(null);

  // ── Cascading Filter States ──────────────────────────────────────────────────
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedAssessment, setSelectedAssessment] = useState<string>('all'); // 'all' = Subject Rollup
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Submissions state
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [examAttempts, setExamAttempts] = useState<ExamAttemptRow[]>([]);

  // Grade panel modal state
  const [grading, setGrading] = useState<SubmissionRow | null>(null);
  const [manualGrade, setManualGrade] = useState('');
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);

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

  // Replay modal state
  const [replay, setReplay] = useState<{ student: string; versions: ReplayVersion[] } | null>(null);
  const [replayIdx, setReplayIdx] = useState(0);

  // Viva modal state (Integrated Q&A inspector)
  const [activeViva, setActiveViva] = useState<VivaDetail | null>(null);
  const [loadingVivaDetail, setLoadingVivaDetail] = useState(false);

  const toast3 = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // ── 1. Fetch Assigned Section-Subjects ────────────────────────────────────────
  const { data: ssData, isLoading: loadingSS } = useQuery({
    queryKey: ['instructor', 'section-subjects'],
    queryFn: () => sessionService.getSectionSubjects(),
    staleTime: 60 * 1000,
  });

  const sectionSubjects: SectionSubjectItem[] = useMemo(
    () => (ssData?.section_subjects as SectionSubjectItem[]) ?? [],
    [ssData]
  );

  // Unique Academic Years / Batches
  const academicYears = useMemo(() => {
    const set = new Set<string>();
    sectionSubjects.forEach(ss => {
      if (ss.academic_year) set.add(ss.academic_year);
    });
    return Array.from(set);
  }, [sectionSubjects]);

  // Sections filtered by selected year (if any)
  const availableSections = useMemo(() => {
    return sectionSubjects.filter(ss => {
      if (selectedYear !== 'all' && ss.academic_year !== selectedYear) return false;
      return true;
    }).reduce((acc, curr) => {
      if (!acc.some(s => s.section_id === curr.section_id)) {
        acc.push({ section_id: curr.section_id, section_name: curr.section_name, batch_name: curr.batch_name });
      }
      return acc;
    }, [] as Array<{ section_id: string; section_name: string; batch_name?: string }>);
  }, [sectionSubjects, selectedYear]);

  // Subjects filtered by selected year & section
  const availableSubjects = useMemo(() => {
    return sectionSubjects.filter(ss => {
      if (selectedYear !== 'all' && ss.academic_year !== selectedYear) return false;
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
  }, [sectionSubjects, selectedYear, selectedSection]);

  // Auto-select first available subject if none or invalid
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
    staleTime: 30 * 1000,
  });

  // ── 4. Submissions / Exam Attempts for Specific Assessment ────────────────────
  const isSelectedExam = useMemo(() => {
    return subjectExams.some(e => e.id === selectedAssessment);
  }, [subjectExams, selectedAssessment]);

  const { data: submissionsData, isLoading: submissionsLoading, refetch: refetchSubmissions } = useQuery({
    queryKey: ['instructor', 'submissions', { expId: selectedAssessment }],
    queryFn: () => submissionService.getSubmissions(selectedAssessment),
    enabled: !!selectedAssessment && selectedAssessment !== 'all' && !isSelectedExam,
    staleTime: 30 * 1000,
  });

  const { data: examAttemptsData, isLoading: examAttemptsLoading } = useQuery({
    queryKey: ['instructor', 'exam-attempts', { examId: selectedAssessment }],
    queryFn: () => experienceService.getExamAttempts(selectedAssessment),
    enabled: !!selectedAssessment && selectedAssessment !== 'all' && isSelectedExam,
    staleTime: 30 * 1000,
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

  // Sync submissions data
  useEffect(() => {
    if (submissionsData) setSubmissions(submissionsData.submissions ?? []);
  }, [submissionsData]);

  // Sync exam attempts data
  useEffect(() => {
    if (examAttemptsData) setExamAttempts(examAttemptsData.attempts ?? []);
  }, [examAttemptsData]);

  // Map student_id -> VivaItem
  const vivaByStudent = useMemo(() => {
    const map = new Map<string, VivaListItem>();
    (vivasData as VivaListItem[]).forEach(v => {
      map.set(v.student_id, v);
    });
    return map;
  }, [vivasData]);

  // Map student_id -> PlagiarismFlag
  const flagByStudent = useMemo(() => {
    const map = new Map<string, PlagiarismFlagItem>();
    plagiarismFlags.forEach(f => {
      map.set(f.student_a_id, f);
      map.set(f.student_b_id, f);
    });
    return map;
  }, [plagiarismFlags]);

  // Filtered rows by search
  const filteredRollupStudents = useMemo(() => {
    if (!gradeSummaryData?.students) return [];
    if (!searchQuery.trim()) return gradeSummaryData.students;
    const q = searchQuery.toLowerCase();
    return gradeSummaryData.students.filter(s =>
      s.full_name.toLowerCase().includes(q) || (s.roll_number || '').toLowerCase().includes(q)
    );
  }, [gradeSummaryData?.students, searchQuery]);

  const filteredSubmissions = useMemo(() => {
    if (!searchQuery.trim()) return submissions;
    const q = searchQuery.toLowerCase();
    return submissions.filter(s =>
      s.full_name.toLowerCase().includes(q) || (s.roll_number || '').toLowerCase().includes(q)
    );
  }, [submissions, searchQuery]);

  const filteredExamAttempts = useMemo(() => {
    if (!searchQuery.trim()) return examAttempts;
    const q = searchQuery.toLowerCase();
    return examAttempts.filter(a =>
      a.student_name.toLowerCase().includes(q) || (a.student_email || '').toLowerCase().includes(q)
    );
  }, [examAttempts, searchQuery]);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const openGrade = (sub: SubmissionRow) => {
    setGrading(sub);
    setManualGrade(sub.final_grade != null ? String(sub.final_grade) : '');
    setFeedback('');
  };

  const generateDraft = async () => {
    if (!grading) return;
    setDrafting(true);
    try {
      const res = await experienceService.aiFeedbackDraft(grading.student_id, selectedAssessment);
      setFeedback(res.draft);
      toast3(`Draft generated (${res.model}). Edit before saving.`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string }; status?: number } };
      toast3(e?.response?.data?.error ?? (e?.response?.status === 429 ? 'AI quota exceeded.' : 'Draft generation failed.'));
    } finally { setDrafting(false); }
  };

  const saveGrade = async () => {
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
      toast3('Grade & feedback successfully saved.');
      setGrading(null);
      refetchSubmissions();
      refetchSummary();
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

  const openReplay = async (sub: SubmissionRow) => {
    try {
      const d = await submissionService.getReplay(sub.student_id, selectedAssessment);
      setReplay({ student: sub.full_name, versions: d.versions ?? [] });
      setReplayIdx(0);
    } catch { toast3('No saved code versions for this student.'); }
  };

  const openVivaReview = async (vivaId: string) => {
    setLoadingVivaDetail(true);
    try {
      const detail = await instructorService.getVivaDetail(vivaId);
      setActiveViva(detail);
    } catch {
      toast3('Could not load student viva answers.');
    } finally {
      setLoadingVivaDetail(false);
    }
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

  const version = replay?.versions[replayIdx];
  const versionCode = version ? Object.entries(version.files ?? {}).map(([name, code]) => `// ── ${name} ──\n${code}`).join('\n\n') : '';

  return (
    <InstructorShell
      activePage="Grading"
      title="Grading & Assessment Hub"
      subtitle="Evaluate lab submissions, timed exams, oral viva evaluations, and view complete subject grade rollups."
    >
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 300, background: '#111827', color: '#fff', padding: '12px 20px', borderRadius: 12, fontSize: 14, fontWeight: 600 }}>
          {toast}
        </div>
      )}

      {/* ═══ CASCADING ACADEMIC FILTER BAR ═══ */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 14,
        padding: '16px 20px',
        marginBottom: 20,
        boxShadow: '0 2px 10px rgba(0,0,0,0.02)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, alignItems: 'center' }}>
          
          {/* 1. Academic Year / Batch */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
              <Calendar size={13} color="#7c3aed" /> Academic Year / Batch
            </label>
            <select
              className={styles.select}
              style={{ width: '100%' }}
              value={selectedYear}
              onChange={e => {
                setSelectedYear(e.target.value);
                setSelectedSection('all');
              }}
            >
              <option value="all">All Academic Years</option>
              {academicYears.map(yr => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>

          {/* 2. Section */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
              <Users size={13} color="#7c3aed" /> Section
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

          {/* 3. Subject */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
              <BookOpen size={13} color="#7c3aed" /> Subject
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

          {/* 4. Assessment Scope Selector */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
              <Award size={13} color="#7c3aed" /> Assessment View
            </label>
            <select
              className={styles.select}
              style={{ width: '100%', fontWeight: selectedAssessment === 'all' ? 700 : 500 }}
              value={selectedAssessment}
              onChange={e => setSelectedAssessment(e.target.value)}
            >
              <option value="all">⭐ All Assessments (Subject Grade Book Rollup)</option>
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
          {/* Over-allocation warning banner */}
          {gradeSummaryData?.subject.over_allocation && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: '#fffbeb', border: '1px solid #fef3c7', color: '#b45309',
              padding: '12px 18px', borderRadius: 12, fontSize: 13.5, fontWeight: 600,
              marginBottom: 16
            }}>
              <AlertTriangle size={18} color="#d97706" />
              <div>
                <strong>Over-allocation Detected:</strong> Total assessment weightage ({gradeSummaryData.subject.total_weightage} pts) exceeds Subject Total Marks ({gradeSummaryData.subject.total_marks} pts).
                Student rollup scores may exceed course ceiling.
              </div>
            </div>
          )}

          {/* Metric KPI Cards */}
          {gradeSummaryData && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Subject Ceiling</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{gradeSummaryData.subject.total_marks} Marks</span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{gradeSummaryData.subject.name} ({gradeSummaryData.subject.code})</span>
              </div>

              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Total Weightage Sum</span>
                <span style={{
                  fontSize: 20, fontWeight: 800,
                  color: gradeSummaryData.subject.over_allocation ? '#d97706' : '#7c3aed'
                }}>
                  {gradeSummaryData.subject.total_weightage} pts
                </span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                  {gradeSummaryData.subject.over_allocation ? 'Exceeds total marks' : 'Equally distributed'}
                </span>
              </div>

              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Assessments Configured</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
                  {gradeSummaryData.experiments.length}
                </span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                  {gradeSummaryData.experiments.filter(e => e.delivery_mode === 'exam').length} Exams • {gradeSummaryData.experiments.filter(e => e.delivery_mode !== 'exam').length} Labs
                </span>
              </div>

              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Class Average</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: '#059669' }}>
                  {gradeSummaryData.students.length > 0
                    ? `${(gradeSummaryData.students.reduce((acc, s) => acc + s.subject_score, 0) / gradeSummaryData.students.length).toFixed(1)} pts`
                    : '—'}
                </span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>Across enrolled section students</span>
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
                    style={{ paddingLeft: 30, maxWidth: 240, height: 34, fontSize: 13 }}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <span className={styles.sectionSub}>
                  {filteredRollupStudents.length} of {gradeSummaryData?.students.length ?? 0} students
                </span>
              </div>

              <button
                type="button"
                className={styles.secondaryBtn}
                style={{ height: 34, padding: '0 12px', fontSize: 12.5 }}
                onClick={handleExportCSV}
                disabled={!gradeSummaryData || gradeSummaryData.students.length === 0}
              >
                <Download size={14} /> Export Grade Book (CSV)
              </button>
            </div>

            {gradeSummaryLoading ? (
              <p className={styles.sectionSub} style={{ padding: 24 }}>Loading subject grade book…</p>
            ) : !selectedSubject ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <BookOpen size={30} color="#d8b4fe" style={{ marginBottom: 8 }} />
                <p className={styles.sectionSub}>Select a subject to view the grade book.</p>
              </div>
            ) : !gradeSummaryData || gradeSummaryData.experiments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <ClipboardCheck size={30} color="#d8b4fe" style={{ marginBottom: 8 }} />
                <p className={styles.sectionSub}>No experiments or exams found for this subject.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto', width: '100%' }}>
                <table className={styles.table} style={{ minWidth: 720 }}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 200, position: 'sticky', left: 0, background: '#f8fafc', zIndex: 1 }}>Student</th>
                      {gradeSummaryData.experiments.map(e => (
                        <th key={e.id} style={{ minWidth: 140, textAlign: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>
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
                      <th style={{ minWidth: 150, textAlign: 'right' }}>
                        Total Rollup ({gradeSummaryData.subject.total_marks} max)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRollupStudents.length === 0 ? (
                      <tr>
                        <td colSpan={gradeSummaryData.experiments.length + 2} style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>
                          No students matching your search.
                        </td>
                      </tr>
                    ) : (
                      filteredRollupStudents.map(s => {
                        const pct = gradeSummaryData.subject.total_marks > 0
                          ? Math.round((s.subject_score / gradeSummaryData.subject.total_marks) * 100)
                          : 0;
                        return (
                          <tr key={s.student_id}>
                            <td style={{ position: 'sticky', left: 0, background: '#ffffff', zIndex: 1 }}>
                              <div className={styles.tdStrong}>{s.full_name}</div>
                              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                                {s.roll_number || s.student_id.slice(0, 8)}
                              </div>
                            </td>
                            {gradeSummaryData.experiments.map(e => {
                              const rawScore = s.experiment_scores[e.id];
                              const hasScore = rawScore !== undefined && rawScore !== null;
                              const weighted = hasScore ? ((rawScore / (e.grade_scale || 100)) * (e.weightage || 0)) : 0;
                              return (
                                <td key={e.id} style={{ textAlign: 'center' }}>
                                  {hasScore ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                                      <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                                        {rawScore} / {e.grade_scale}
                                      </span>
                                      <span style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>
                                        +{weighted.toFixed(1)} pts
                                      </span>
                                    </div>
                                  ) : (
                                    <span style={{ fontSize: 13, color: '#cbd5e1' }}>—</span>
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
                          </tr>
                        );
                      })
                    )}
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
          {/* Specific assessment action & KPI header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  className={styles.input}
                  placeholder="Filter student or roll no..."
                  style={{ paddingLeft: 30, maxWidth: 240, height: 34, fontSize: 13 }}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              <span className={styles.sectionSub}>
                {isSelectedExam
                  ? `${filteredExamAttempts.length} attempt${filteredExamAttempts.length === 1 ? '' : 's'}`
                  : `${filteredSubmissions.length} final submission${filteredSubmissions.length === 1 ? '' : 's'}`}
              </span>
            </div>

            {!isSelectedExam && (
              <button
                className={styles.secondaryBtn}
                onClick={() => { setShowCurve(true); setCurvePreview(null); }}
                title="Curve final grades for this experiment"
              >
                <TrendingUp size={14} /> Curve Experiment Grades
              </button>
            )}
          </div>

          {/* Table Card */}
          <div className={styles.sectionCard}>
            {isSelectedExam ? (
              /* Timed Exam Submissions Table */
              examAttemptsLoading ? (
                <p className={styles.sectionSub}>Loading exam attempts…</p>
              ) : filteredExamAttempts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <FileCheck size={30} color="#d8b4fe" style={{ marginBottom: 8 }} />
                  <p className={styles.sectionSub}>No student attempts recorded for this exam yet.</p>
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
                      <th>Submitted</th>
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
              /* Laboratory Experiment Submissions Table (Enriched with Viva & Integrity) */
              submissionsLoading ? (
                <p className={styles.sectionSub}>Loading lab submissions…</p>
              ) : filteredSubmissions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <ClipboardCheck size={30} color="#d8b4fe" style={{ marginBottom: 8 }} />
                  <p className={styles.sectionSub}>No submissions recorded for this experiment yet.</p>
                </div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Language</th>
                      <th>Test Cases</th>
                      <th>Quality</th>
                      <th>AI Viva</th>
                      <th>Integrity</th>
                      <th>Submitted</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubmissions.map(sub => {
                      const viva = vivaByStudent.get(sub.student_id);
                      const flag = flagByStudent.get(sub.student_id);

                      return (
                        <tr key={sub.id}>
                          <td>
                            <div className={styles.tdStrong}>{sub.full_name}</div>
                            <div style={{ fontSize: 12, color: '#9ca3af' }}>{sub.roll_number}</div>
                          </td>
                          <td>
                            <span className={`${styles.pill} ${styles.pillBlue}`}>{sub.language}</span>
                          </td>
                          <td>
                            {sub.test_cases_total ? (
                              <span className={`${styles.pill} ${sub.test_cases_passed === sub.test_cases_total ? styles.pillGreen : styles.pillAmber}`}>
                                {sub.test_cases_passed}/{sub.test_cases_total}
                              </span>
                            ) : (
                              <span className={styles.pillSlate}>—</span>
                            )}
                          </td>
                          <td>
                            {sub.quality_grade ? (
                              <span className={`${styles.pill} ${styles.pillBlue}`}>
                                Grade {sub.quality_grade} · {sub.loc ?? 0} LOC
                              </span>
                            ) : '—'}
                          </td>
                          {/* Integrated Viva evaluation cell (Audio 4) */}
                          <td>
                            {viva ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span className={`${styles.pill} ${viva.status === 'completed' ? styles.pillGreen : styles.pillAmber}`}>
                                  <Mic2 size={11} /> {viva.total_score != null ? `${viva.total_score}%` : viva.status}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => openVivaReview(viva.id)}
                                  style={{
                                    border: 'none', background: 'transparent', color: '#7c3aed',
                                    cursor: 'pointer', fontSize: 11, fontWeight: 700, textDecoration: 'underline'
                                  }}
                                >
                                  Q&A
                                </button>
                              </div>
                            ) : (
                              <span style={{ fontSize: 12, color: '#cbd5e1' }}>—</span>
                            )}
                          </td>
                          {/* Integrity flag cell */}
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
                          <td style={{ fontSize: 13, color: '#6b7280' }}>{fmt(sub.submitted_at)}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                              <button className={styles.ghostBtn} onClick={() => openReplay(sub)} title="Code timeline replay">
                                <History size={13} /> Replay
                              </button>
                              <button className={styles.primaryBtn} onClick={() => openGrade(sub)}>
                                <ClipboardCheck size={13} /> Grade
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            )}
          </div>
        </>
      )}

      {/* ═══ MODAL 1: MANUAL GRADE & FEEDBACK ═══ */}
      {grading && (
        <div className={styles.modalOverlay} onClick={() => setGrading(null)}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Grade — {grading.full_name} ({grading.roll_number})</h2>
              <button className={styles.closeBtn} onClick={() => setGrading(null)}><X size={16} /></button>
            </div>

            <div className={styles.kpiRow}>
              <div className={styles.kpiCard}>
                <p className={styles.kpiLabel}>Test Cases</p>
                <p className={styles.kpiValue}>{grading.test_cases_passed ?? 0}/{grading.test_cases_total ?? 0}</p>
              </div>
              <div className={styles.kpiCard}>
                <p className={styles.kpiLabel}>Quality Grade</p>
                <p className={styles.kpiValue}>{grading.quality_grade ?? '—'}</p>
              </div>
              <div className={styles.kpiCard}>
                <p className={styles.kpiLabel}>Compile Status</p>
                <p className={styles.kpiValue} style={{ fontSize: 15 }}>{grading.compile_status ?? '—'}</p>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Manual grade (0–100) — combines with test run marks via rubric</label>
              <input
                className={styles.input}
                type="number"
                min={0}
                max={100}
                value={manualGrade}
                onChange={e => setManualGrade(e.target.value)}
                placeholder="e.g. 85"
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Feedback to student</label>
              <textarea
                className={styles.textarea}
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                placeholder="Specific guidance, code clarity, edge-case suggestions…"
              />
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={generateDraft}
                disabled={drafting}
                style={{ marginTop: 6 }}
              >
                {drafting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {drafting ? 'Drafting…' : 'Generate AI Feedback Draft'}
              </button>
            </div>

            <p style={{ fontSize: 12, color: '#b45309', display: 'flex', gap: 6, alignItems: 'center' }}>
              <Lock size={12} /> Once student views the published grade, it is locked against accidental modification.
            </p>

            <div className={styles.actionRow} style={{ marginTop: 8 }}>
              <span />
              <button className={styles.primaryBtn} disabled={saving} onClick={saveGrade}>
                <Save size={13} /> {saving ? 'Saving…' : 'Save Grade'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL 2: VIVA DETAIL Q&A REVIEW (Integrated from Audio 4) ═══ */}
      {activeViva && (
        <div className={styles.modalOverlay} onClick={() => setActiveViva(null)}>
          <div className={styles.modalCard} style={{ maxWidth: 760, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2 className={styles.modalTitle}>AI Viva Evaluation — {activeViva.viva?.full_name || 'Student'}</h2>
                <p className={styles.sectionSub} style={{ margin: 0 }}>
                  Experiment: {activeViva.viva?.experiment || 'Experiment'} • Overall Score: <strong>{activeViva.viva?.total_score ?? '—'}%</strong>
                </p>
              </div>
              <button className={styles.closeBtn} onClick={() => setActiveViva(null)}><X size={16} /></button>
            </div>

            <div style={{ overflowY: 'auto', paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {activeViva.answers.length === 0 ? (
                <p className={styles.sectionSub} style={{ padding: 20, textAlign: 'center' }}>No viva answers recorded yet.</p>
              ) : (
                activeViva.answers.map((ans, idx) => {
                  const scoreVal = ans.score ?? 0;
                  return (
                    <div key={idx} style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 12,
                      padding: '14px 16px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed' }}>
                          Question {ans.question_index + 1}
                        </span>
                        <span style={{
                          fontSize: 12, fontWeight: 700,
                          padding: '2px 8px', borderRadius: 8,
                          background: scoreVal >= 70 ? '#dcfce7' : scoreVal >= 50 ? '#fef3c7' : '#fee2e2',
                          color: scoreVal >= 70 ? '#15803d' : scoreVal >= 50 ? '#b45309' : '#b91c1c'
                        }}>
                          Score: {ans.score ?? '—'}/100
                        </span>
                      </div>

                      <p style={{ fontSize: 13.5, fontWeight: 600, color: '#1e293b', marginBottom: 8 }}>
                        {ans.question_text}
                      </p>

                      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 2 }}>
                          Student Answer:
                        </span>
                        <p style={{ fontSize: 13, color: '#334155', margin: 0, fontStyle: ans.answer_text ? 'normal' : 'italic' }}>
                          “{ans.answer_text || 'No spoken/typed response submitted'}”
                        </p>
                      </div>

                      {ans.ai_feedback && (
                      <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#6d28d9', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                          <Sparkles size={12} /> AI Diagnostic Feedback:
                        </span>
                        <p style={{ fontSize: 12.5, color: '#4c1d95', margin: 0 }}>
                          {ans.ai_feedback}
                        </p>
                      </div>
                    )}
                  </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL 3: CODE REPLAY ═══ */}
      {replay && (
        <div className={styles.modalOverlay} onClick={() => setReplay(null)}>
          <div className={styles.modalCard} style={{ maxWidth: 760 }} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Code Replay — {replay.student}</h2>
              <button className={styles.closeBtn} onClick={() => setReplay(null)}><X size={16} /></button>
            </div>

            {replay.versions.length === 0 ? (
              <p className={styles.sectionSub}>No autosaved versions recorded.</p>
            ) : (
              <>
                <div className={styles.actionRow}>
                  <div className={styles.tabRow}>
                    {replay.versions.map((v, i) => (
                      <button key={v.version_number}
                        className={`${styles.tabChip} ${i === replayIdx ? styles.tabChipActive : ''}`}
                        onClick={() => setReplayIdx(i)}>
                        v{v.version_number}
                      </button>
                    ))}
                  </div>
                  <span className={styles.sectionSub}>
                    {version?.save_type} · {fmt(version?.saved_at ?? null)}
                  </span>
                </div>
                <pre className={styles.codeBlock} style={{ whiteSpace: 'pre-wrap', maxHeight: 380, overflow: 'auto' }}>
                  {versionCode || '(empty)'}
                </pre>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ MODAL 4: CURVE GRADES ═══ */}
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
                <select className={styles.select} value={curveMode} onChange={e => { setCurveMode(e.target.value as 'add' | 'factor'); setCurvePreview(null); }}>
                  <option value="add">Add Points (+N)</option>
                  <option value="factor">Multiply Factor (×factor)</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>{curveMode === 'add' ? 'Points (±50)' : 'Factor (0.5–2.0)'}</label>
                <input className={styles.input} type="number" step="0.1" value={curveValue}
                  onChange={e => { setCurveValue(e.target.value); setCurvePreview(null); }} />
              </div>
            </div>
            <button className={styles.ghostBtn} onClick={() => runCurve(false)} disabled={curving}>
              {curving ? <Loader2 size={13} className="animate-spin" /> : null} Preview Curve Impact
            </button>

            {curvePreview && (
              <div style={{ marginTop: 12 }}>
                <p style={{ fontSize: 13, color: '#374151', marginBottom: 6 }}>
                  Class average: {curvePreview.class_avg_before ?? '—'} → <strong>{curvePreview.class_avg_after ?? '—'}</strong>
                  {' · '}{curvePreview.affected ?? 0} affected
                  {curvePreview.locked_skipped ? ` · ${curvePreview.locked_skipped} locked (skipped)` : ''}
                </p>
                <div style={{ maxHeight: 180, overflowY: 'auto', marginBottom: 12 }}>
                  {(curvePreview.rows ?? []).filter(r => r.before != null).slice(0, 30).map(r => (
                    <div key={r.student_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0', borderBottom: '1px solid #f3f0fa' }}>
                      <span>{r.locked ? '🔒' : ''} {r.before} → <strong>{r.after}</strong></span>
                    </div>
                  ))}
                </div>
                <button className={styles.primaryBtn} onClick={() => runCurve(true)} disabled={curving}>
                  {curving ? 'Applying…' : 'Apply Curve to All Submissions'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </InstructorShell>
  );
}
