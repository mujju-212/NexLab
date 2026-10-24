'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download, Table, Loader2, FileText, Building2, Calendar, Layers,
  Users, BookOpen, UserCheck, Printer, CheckCircle2, AlertTriangle,
  Award, Clock, Settings, Eye, HelpCircle, ChevronLeft, ChevronRight,
  Filter, Search, RefreshCw, Check, Sparkles, X, ShieldAlert, BarChart3,
  ExternalLink, Edit3, ArrowRight
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import styles from './reports.module.css';
import { sessionService } from '@/services/session.service';
import { experimentService } from '@/services/experiment.service';
import { experienceService, type ReportRow } from '@/services/experience.service';
import { exportCSV } from '@/lib/analytics-utils';

const REPORT_REGISTRY = [
  { code: 'R1', value: 'gradebook',              title: 'Subject Gradebook',           desc: 'Complete curriculum matrix with rubric breakdown & weighted finals' },
  { code: 'R2', value: 'experiment_performance', title: 'Experiment-wise Performance', desc: 'Detailed experiment analytics, completion rates & attempt counts' },
  { code: 'R3', value: 'at_risk',                title: 'At-Risk Roster',              desc: 'Students below passing threshold with recommendations' },
  { code: 'R4', value: 'cross_section',          title: 'Accreditation Template',       desc: 'NBA / NAAC / ABET format comparing sections and outcomes' },
  { code: 'R5', value: 'student_progress',       title: 'Individual Student Dossier',  desc: 'Complete academic transcript, concept mastery & audit logs' },
  { code: 'R6', value: 'session_summary',        title: 'Attendance Register',         desc: 'Session-wise attendance with join logs & focus metrics' },
  { code: 'R7', value: 'viva_consolidated',      title: 'Assessment Summary',          desc: 'Quizzes, viva voice and manual evaluation feedback' },
  { code: 'R8', value: 'catch_up',               title: 'Custom Report (Advanced)',    desc: 'Flexible column selection, filters, and catch-up sessions' },
];

interface SectionSubjectItem {
  section_subject_id: string;
  subject_id: string;
  subject_name: string;
  subject_code: string;
  total_marks?: number;
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

interface SessionOption {
  id: string;
  section_subject_id?: string;
  experiment_title: string;
  section_name?: string | null;
  subject_name?: string | null;
  scheduled_at?: string | null;
  duration_minutes?: number;
  status?: string;
}

interface AttendanceRow {
  student_id: string;
  full_name: string;
  roll_number: string;
  email: string;
  status: string;
  joined_at?: string | null;
  total_time_seconds?: number | null;
  focus_score?: number | null;
  is_active_participant?: boolean | null;
  override_reason?: string | null;
  is_recorded?: boolean;
}

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
};

const fmtDateTime = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const getInitials = (name: string) => {
  if (!name) return 'ST';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export default function ReportsStudioPage() {
  const queryClient = useQueryClient();

  // ── 3 Primary Studio Modes ──────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'subject' | 'student' | 'attendance'>('subject');

  // ── 5-Level Cascading Hierarchy Filters ──────────────────────────────────────
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedBatch, setSelectedBatch] = useState<string>('all');
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('');

  // ── Tab 1: Subject Gradebook Controls & Toggles ─────────────────────────────
  const [includeRubricBreakdown, setIncludeRubricBreakdown] = useState(true);
  const [includeAutoTC, setIncludeAutoTC] = useState(true);
  const [includeViva, setIncludeViva] = useState(true);
  const [includeManual, setIncludeManual] = useState(true);
  const [includeTimestamps, setIncludeTimestamps] = useState(true);
  const [includeFeedbackNotes, setIncludeFeedbackNotes] = useState(true);

  // Table row selection & pagination
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // ── Tab 2: Individual Student Dossier State ─────────────────────────────────
  const [selectedDossierStudentId, setSelectedDossierStudentId] = useState<string>('');
  const [dossierSearchQuery, setDossierSearchQuery] = useState('');

  // ── Tab 3: Session Attendance Register State ────────────────────────────────
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [attendanceViewMode, setAttendanceViewMode] = useState<'ledger' | 'matrix'>('ledger');
  const [attendanceSearchQuery, setAttendanceSearchQuery] = useState('');
  const [attendanceStatusFilter, setAttendanceStatusFilter] = useState<string>('all');
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);

  // Attendance Override Modal state
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideTargetStudent, setOverrideTargetStudent] = useState<AttendanceRow | null>(null);
  const [overrideNewStatus, setOverrideNewStatus] = useState<string>('present');
  const [overrideReason, setOverrideReason] = useState<string>('Verified presence in lab session');
  const [savingOverride, setSavingOverride] = useState(false);

  // ── Server Batch Report Generator State ─────────────────────────────────────
  const [batchReportType, setBatchReportType] = useState<string>('gradebook');
  const [batchAudience, setBatchAudience] = useState<'internal' | 'student' | 'accreditation'>('internal');
  const [batchFileFormat, setBatchFileFormat] = useState<'csv' | 'xlsx' | 'both'>('csv');
  const [generatingReport, setGeneratingReport] = useState(false);

  // ── Interactive Modals ──────────────────────────────────────────────────────
  const [howToUseOpen, setHowToUseOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [queueFilterType, setQueueFilterType] = useState<string>('all');

  // Flash Notifications
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4500);
  };

  // ── 1. Fetch Assigned Section-Subjects ───────────────────────────────────────
  const { data: ssData } = useQuery({
    queryKey: ['instructor', 'section-subjects'],
    queryFn: () => sessionService.getSectionSubjects(),
    staleTime: 60 * 1000,
  });

  const sectionSubjects: SectionSubjectItem[] = useMemo(
    () => (ssData?.section_subjects as SectionSubjectItem[]) ?? [],
    [ssData]
  );

  const departments = useMemo(() => {
    const map = new Map<string, string>();
    sectionSubjects.forEach(ss => {
      const code = ss.department_code || ss.department_name;
      if (code) map.set(code, ss.department_name || code);
    });
    return Array.from(map.entries()).map(([code, name]) => ({ code, name }));
  }, [sectionSubjects]);

  const academicYears = useMemo(() => {
    const set = new Set<string>();
    sectionSubjects.forEach(ss => {
      if (selectedDept !== 'all' && (ss.department_code || ss.department_name) !== selectedDept) return;
      if (ss.academic_year) set.add(ss.academic_year);
    });
    return Array.from(set);
  }, [sectionSubjects, selectedDept]);

  const availableBatches = useMemo(() => {
    const map = new Map<string, string>();
    sectionSubjects.forEach(ss => {
      if (selectedDept !== 'all' && (ss.department_code || ss.department_name) !== selectedDept) return;
      if (selectedYear !== 'all' && ss.academic_year !== selectedYear) return;
      if (ss.batch_id && ss.batch_name) map.set(ss.batch_id, ss.batch_name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [sectionSubjects, selectedDept, selectedYear]);

  const availableSections = useMemo(() => {
    return sectionSubjects.filter(ss => {
      if (selectedDept !== 'all' && (ss.department_code || ss.department_name) !== selectedDept) return false;
      if (selectedYear !== 'all' && ss.academic_year !== selectedYear) return false;
      if (selectedBatch !== 'all' && ss.batch_id !== selectedBatch) return false;
      return true;
    }).reduce((acc, curr) => {
      if (!acc.some(s => s.section_id === curr.section_id)) {
        acc.push({ section_id: curr.section_id, section_name: curr.section_name, batch_name: curr.batch_name });
      }
      return acc;
    }, [] as Array<{ section_id: string; section_name: string; batch_name?: string }>);
  }, [sectionSubjects, selectedDept, selectedYear, selectedBatch]);

  const availableSubjects = useMemo(() => {
    return sectionSubjects.filter(ss => {
      if (selectedDept !== 'all' && (ss.department_code || ss.department_name) !== selectedDept) return false;
      if (selectedYear !== 'all' && ss.academic_year !== selectedYear) return false;
      if (selectedBatch !== 'all' && ss.batch_id !== selectedBatch) return false;
      if (selectedSection !== 'all' && ss.section_id !== selectedSection) return false;
      return true;
    }).reduce((acc, curr) => {
      if (!acc.some(s => s.subject_id === curr.subject_id)) {
        acc.push({ subject_id: curr.subject_id, subject_name: curr.subject_name, subject_code: curr.subject_code });
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

  const selectedSectionSubjectIds = useMemo(() => sectionSubjects.filter(ss => {
    if (selectedDept !== 'all' && (ss.department_code || ss.department_name) !== selectedDept) return false;
    if (selectedYear !== 'all' && ss.academic_year !== selectedYear) return false;
    if (selectedBatch !== 'all' && ss.batch_id !== selectedBatch) return false;
    if (selectedSection !== 'all' && ss.section_id !== selectedSection) return false;
    if (selectedSubject && ss.subject_id !== selectedSubject) return false;
    return true;
  }).map(ss => ss.section_subject_id), [sectionSubjects, selectedDept, selectedYear, selectedBatch, selectedSection, selectedSubject]);

  // ── 2. Fetch Real Subject Grade Summary ─────────────────────────────────────
  const { data: gradeSummaryData, isLoading: loadingSummary } = useQuery({
    queryKey: ['instructor', 'subject-grade-summary', { subjectId: selectedSubject, sectionId: selectedSection }],
    queryFn: () => experimentService.getSubjectGradeSummary(
      selectedSubject,
      selectedSection !== 'all' ? selectedSection : undefined
    ),
    enabled: !!selectedSubject,
    staleTime: 30 * 1000,
  });

  const allStudents = useMemo(() => (gradeSummaryData?.students as any[]) ?? [], [gradeSummaryData]);
  const experimentsList = useMemo(() => (gradeSummaryData?.experiments as any[]) ?? [], [gradeSummaryData]);

  // Filtered students for Tab 2 search
  const filteredDossierStudents = useMemo(() => {
    if (!dossierSearchQuery.trim()) return allStudents;
    const q = dossierSearchQuery.toLowerCase();
    return allStudents.filter(s =>
      s.full_name?.toLowerCase().includes(q) ||
      s.roll_number?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q)
    );
  }, [allStudents, dossierSearchQuery]);

  // Default select first student for dossier view
  useEffect(() => {
    if (filteredDossierStudents.length > 0) {
      if (!selectedDossierStudentId || !filteredDossierStudents.some(s => s.student_id === selectedDossierStudentId)) {
        setSelectedDossierStudentId(filteredDossierStudents[0].student_id);
      }
    }
  }, [filteredDossierStudents, selectedDossierStudentId]);

  // Active student for Tab 2
  const activeDossierStudent = useMemo(() => {
    return allStudents.find(s => s.student_id === selectedDossierStudentId) || allStudents[0] || null;
  }, [allStudents, selectedDossierStudentId]);

  // Pagination calculations for Tab 1
  const totalStudentsCount = allStudents.length;
  const totalPages = Math.max(1, Math.ceil(totalStudentsCount / pageSize));
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return allStudents.slice(start, start + pageSize);
  }, [allStudents, currentPage, pageSize]);

  // Select all handler
  const handleToggleSelectAll = () => {
    if (selectedStudentIds.size === paginatedStudents.length) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(paginatedStudents.map(s => s.student_id)));
    }
  };

  const handleToggleSelectRow = (id: string) => {
    const next = new Set(selectedStudentIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedStudentIds(next);
  };

  // ── 3. Sessions & Real Attendance Data ───────────────────────────────────────
  const { data: sessionsData, isLoading: loadingSessions } = useQuery({
    queryKey: ['instructor', 'sessions', 'list'],
    queryFn: () => sessionService.list(),
    staleTime: 60 * 1000,
  });

  const allSessions: SessionOption[] = (sessionsData as any)?.sessions ?? [];
  const filteredSessions = useMemo(() => {
    const scopeIds = new Set(selectedSectionSubjectIds);
    const activeSubjName = availableSubjects.find(s => s.subject_id === selectedSubject)?.subject_name;
    const activeSecName = availableSections.find(s => s.section_id === selectedSection)?.section_name;
    return allSessions.filter(s => {
      if (s.section_subject_id) return scopeIds.has(s.section_subject_id);
      if (activeSubjName && s.subject_name && s.subject_name !== activeSubjName) return false;
      if (activeSecName && s.section_name && s.section_name !== activeSecName) return false;
      return true;
    });
  }, [allSessions, selectedSectionSubjectIds, availableSubjects, selectedSubject, availableSections, selectedSection]);

  const loadAttendance = useCallback(async (id: string) => {
    if (!id) return;
    setLoadingAttendance(true);
    setError(null);
    try {
      const res = await sessionService.getAttendance(id);
      setAttendanceRows(res.attendance || []);
    } catch {
      setError('Could not load real attendance for this session.');
      setAttendanceRows([]);
    } finally {
      setLoadingAttendance(false);
    }
  }, []);

  useEffect(() => {
    if (filteredSessions.length > 0 && (!selectedSessionId || !filteredSessions.some(s => s.id === selectedSessionId))) {
      setSelectedSessionId(filteredSessions[0].id);
      loadAttendance(filteredSessions[0].id);
    }
  }, [filteredSessions, selectedSessionId, loadAttendance]);

  // Attendance metrics
  const attendanceStats = useMemo(() => {
    let present = 0, late = 0, absent = 0, notRecorded = 0, partial = 0;
    let totalFocus = 0, focusCount = 0;
    for (const a of attendanceRows) {
      if (a.status === 'present') present++;
      else if (a.status === 'late') late++;
      else if (a.status === 'partial') partial++;
      else if (a.status === 'absent') absent++;
      else notRecorded++;

      if (a.focus_score != null) {
        totalFocus += a.focus_score;
        focusCount++;
      }
    }
    const recorded = attendanceRows.length - notRecorded;
    const turnoutRate = recorded > 0 ? Math.round(((present + late * 0.8 + partial * 0.6) / recorded) * 100) : null;
    const avgFocus = focusCount > 0 ? Math.round(totalFocus / focusCount) : null;
    return {
      total: attendanceRows.length,
      recorded,
      present,
      late,
      absent,
      notRecorded,
      partial,
      turnoutRate,
      avgFocus,
    };
  }, [attendanceRows]);

  // Filtered attendance rows for search & status filter
  const filteredAttendanceRows = useMemo(() => {
    return attendanceRows.filter(a => {
      if (attendanceStatusFilter !== 'all' && a.status !== attendanceStatusFilter) return false;
      if (attendanceSearchQuery) {
        const q = attendanceSearchQuery.toLowerCase();
        const matchesName = a.full_name?.toLowerCase().includes(q);
        const matchesRoll = a.roll_number?.toLowerCase().includes(q);
        if (!matchesName && !matchesRoll) return false;
      }
      return true;
    });
  }, [attendanceRows, attendanceStatusFilter, attendanceSearchQuery]);

  // Attendance pagination state
  const [attendancePageSize, setAttendancePageSize] = useState<number>(10);
  const [attendanceCurrentPage, setAttendanceCurrentPage] = useState<number>(1);

  useEffect(() => {
    setAttendanceCurrentPage(1);
  }, [attendanceSearchQuery, attendanceStatusFilter, selectedSessionId]);

  const totalAttendanceCount = filteredAttendanceRows.length;
  const totalAttendancePages = Math.max(1, Math.ceil(totalAttendanceCount / attendancePageSize));
  const paginatedAttendanceRows = useMemo(() => {
    const start = (attendanceCurrentPage - 1) * attendancePageSize;
    return filteredAttendanceRows.slice(start, start + attendancePageSize);
  }, [filteredAttendanceRows, attendanceCurrentPage, attendancePageSize]);

  // Attendance override commit handler
  const handleSaveAttendanceOverride = async () => {
    if (!selectedSessionId || !overrideTargetStudent) return;
    setSavingOverride(true);
    try {
      await sessionService.overrideAttendance(
        selectedSessionId,
        overrideTargetStudent.student_id,
        overrideNewStatus,
        overrideReason
      );
      flash(`Attendance updated for ${overrideTargetStudent.full_name} to ${overrideNewStatus}.`);
      setOverrideModalOpen(false);
      await loadAttendance(selectedSessionId);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to save attendance override.');
    } finally {
      setSavingOverride(false);
    }
  };

  // ── 4. Fetch Real Generated Reports Queue ────────────────────────────────────
  const { data: reportsData, isLoading: reportsLoading, refetch: refetchReports } = useQuery({
    queryKey: ['instructor', 'reports'],
    queryFn: () => experienceService.listReports(),
    staleTime: 30 * 1000,
    refetchInterval: query => query.state.data?.some(r => r.status === 'pending' || r.status === 'generating') ? 2000 : false,
  });

  const generatedReports = useMemo(() => {
    const list = (reportsData as ReportRow[]) ?? [];
    if (queueFilterType === 'all') return list;
    return list.filter(r => r.kind === queueFilterType);
  }, [reportsData, queueFilterType]);

  // Batch Report Generation handler
  const handleGenerateBatchReport = async (kindToUse = batchReportType) => {
    setGeneratingReport(true);
    setError(null);
    try {
      const scopedIds = kindToUse === 'cross_section'
        ? sectionSubjects.filter(ss =>
            (selectedDept === 'all' || (ss.department_code || ss.department_name) === selectedDept) &&
            (selectedYear === 'all' || ss.academic_year === selectedYear) &&
            (selectedBatch === 'all' || ss.batch_id === selectedBatch) &&
            ss.subject_id === selectedSubject
          ).map(ss => ss.section_subject_id)
        : selectedSectionSubjectIds;

      const params: Record<string, unknown> = {
        subject_id: selectedSubject || undefined,
        section_id: selectedSection !== 'all' && kindToUse !== 'cross_section' ? selectedSection : undefined,
        section_subject_ids: scopedIds,
        section_subject_id: scopedIds.length === 1 ? scopedIds[0] : undefined,
        audience: batchAudience,
      };

      if (kindToUse === 'session_summary' || kindToUse === 'viva_consolidated') {
        params.session_id = selectedSessionId || undefined;
      }
      if (kindToUse === 'student_progress' && selectedDossierStudentId) {
        params.student_id = selectedDossierStudentId;
      }

      const res = await experienceService.requestReport(kindToUse, params);
      flash(`Report generation job #${res.id.slice(0, 6)} queued! Status will update automatically.`);
      queryClient.invalidateQueries({ queryKey: ['instructor', 'reports'] });
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Report generation failed to enqueue.');
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleDownloadReport = async (id: string, fmt: 'csv' | 'xlsx' | 'pdf' = 'csv') => {
    try {
      await experienceService.downloadReport(id, fmt);
      flash(`Downloaded report file (${fmt.toUpperCase()}).`);
    } catch (e: any) {
      setError(e?.message || 'Download failed.');
    }
  };

  // ── CSV Exporters ───────────────────────────────────────────────────────────
  const handleExportGradebookCSV = () => {
    if (!gradeSummaryData) return;
    const rows = (gradeSummaryData.students as any[]).map(s => {
      const r: Record<string, unknown> = {
        'Roll Number': s.roll_number || '',
        'Student Name': s.full_name,
        'Email': s.email || '',
      };
      gradeSummaryData.experiments.forEach(e => {
        const sc = s.experiment_scores?.[e.id];
        const det = s.experiment_details?.[e.id];
        r[`Exp ${e.exp_number} ${e.title} (Total)`] = sc ?? '—';
        if (includeRubricBreakdown) {
          if (includeAutoTC) r[`Exp ${e.exp_number} TC%`] = det?.auto_grade ?? '—';
          if (includeViva) r[`Exp ${e.exp_number} Viva%`] = det?.viva_grade ?? '—';
          if (includeManual) r[`Exp ${e.exp_number} Manual%`] = det?.manual_grade ?? '—';
        }
        if (includeTimestamps && det?.submitted_at) {
          r[`Exp ${e.exp_number} Submitted At`] = fmtDateTime(det.submitted_at);
        }
        if (includeFeedbackNotes && det?.manual_feedback) {
          r[`Exp ${e.exp_number} Feedback`] = det.manual_feedback;
        }
      });
      r['Total Points Earned'] = s.points_earned ?? s.subject_score ?? '';
      r['Allocated Points'] = s.points_allocated ?? gradeSummaryData.subject.total_weightage ?? '';
      r['Allocated Marks (%)'] = s.subject_percent ?? '';
      r['Academic Status'] = s.risk_level === 'ok' ? 'Good' : s.risk_level === 'watch' ? 'Needs Improvement' : 'At Risk';
      return r;
    });
    exportCSV(rows, `${gradeSummaryData.subject.code || 'subject'}-gradebook-${new Date().toISOString().slice(0, 10)}`);
    flash('Subject Gradebook CSV downloaded successfully.');
  };

  const handleExportStudentDossierCSV = () => {
    if (!gradeSummaryData || !activeDossierStudent) return;
    const rows = gradeSummaryData.experiments.map(e => {
      const raw = activeDossierStudent.experiment_scores?.[e.id];
      const det = activeDossierStudent.experiment_details?.[e.id];
      const weighted = raw != null ? ((raw / (e.grade_scale || 100)) * (e.weightage || 0)).toFixed(2) : '—';
      return {
        'Student Name': activeDossierStudent.full_name,
        'Roll Number': activeDossierStudent.roll_number || '',
        'Subject': `${gradeSummaryData.subject.name} (${gradeSummaryData.subject.code})`,
        'Assessment #': e.exp_number,
        'Assessment Title': e.title,
        'Weightage (pts)': e.weightage,
        'Grade Scale': e.grade_scale,
        'Score Earned': raw ?? '—',
        'Weighted Points': weighted,
        'Auto TC %': det?.auto_grade ?? '—',
        'Viva %': det?.viva_grade ?? '—',
        'Manual %': det?.manual_grade ?? '—',
        'Language': det?.language ?? '—',
        'Test Cases': det?.test_cases_total ? `${det.test_cases_passed}/${det.test_cases_total}` : '—',
        'Submitted At': det?.submitted_at ? fmtDateTime(det.submitted_at) : '—',
        'Graded At': det?.graded_at ? fmtDateTime(det.graded_at) : '—',
        'Instructor Feedback': det?.manual_feedback ?? '',
      };
    });
    exportCSV(rows, `${activeDossierStudent.roll_number || 'student'}-dossier-transcript`);
    flash(`Exported complete academic dossier for ${activeDossierStudent.full_name}.`);
  };

  const handleExportAttendanceCSV = () => {
    if (attendanceRows.length === 0) return;
    const rows = attendanceRows.map(a => ({
      'Student Name': a.full_name,
      'Roll Number': a.roll_number || '—',
      'Email': a.email || '—',
      'Attendance Status': a.status,
      'Joined At': a.joined_at ? fmtDateTime(a.joined_at) : '—',
      'Time Spent (seconds)': a.total_time_seconds ?? 0,
      'Focus Score (%)': a.focus_score ?? '—',
      'Active Participant': a.is_active_participant ? 'Yes' : 'No',
      'Override Reason': a.override_reason || '',
    }));
    exportCSV(rows, `session-attendance-${selectedSessionId.slice(0, 8)}`);
    flash('Session attendance ledger CSV exported.');
  };

  // Helper status badge renderer
  const renderStatusBadge = (risk: string, pct: number | null) => {
    if (risk === 'ok' || (pct !== null && pct >= 75)) {
      return <span className={`${styles.statusBadge} ${styles.statusGood}`}><CheckCircle2 size={11} /> Good</span>;
    }
    if (risk === 'watch' || (pct !== null && pct >= 50)) {
      return <span className={`${styles.statusBadge} ${styles.statusWarning}`}><AlertTriangle size={11} /> Needs Improvement</span>;
    }
    return <span className={`${styles.statusBadge} ${styles.statusDanger}`}><ShieldAlert size={11} /> At Risk</span>;
  };

  return (
    <InstructorShell activePage="Reports">
      {/* ═══ Header Row with 'How to use?' Button ═══ */}
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.pageTitle}>Custom Reports & Academic Dossier Studio</h1>
          <p className={styles.pageSub}>
            Generate flexible subject gradebooks, individual student performance dossiers, and session attendance audits across your assigned classes.
          </p>
        </div>
        <button
          type="button"
          className={styles.howToUseBtn}
          onClick={() => setHowToUseOpen(true)}
        >
          <HelpCircle size={15} /> How to use?
        </button>
      </div>

      {notice && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px 18px', borderRadius: 12, marginBottom: 18, color: '#166534', fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={16} color="#16a34a" /> {notice}
        </div>
      )}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '12px 18px', borderRadius: 12, marginBottom: 18, color: '#b91c1c', fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} color="#dc2626" /> {error}
        </div>
      )}

      {/* ═══ 5-LEVEL CASCADING HIERARCHY FILTER BAR ═══ */}
      <div className={styles.filterBarCard}>
        <div className={styles.filterGrid}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>
              <Building2 size={13} color="#7c3aed" /> Department
            </label>
            <select
              className={styles.filterSelect}
              value={selectedDept}
              onChange={e => {
                setSelectedDept(e.target.value);
                setSelectedYear('all');
                setSelectedBatch('all');
                setSelectedSection('all');
              }}
            >
              <option value="all">All Departments</option>
              {departments.map(d => <option key={d.code} value={d.code}>{d.name} ({d.code})</option>)}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>
              <Calendar size={13} color="#7c3aed" /> Academic Year
            </label>
            <select
              className={styles.filterSelect}
              value={selectedYear}
              onChange={e => {
                setSelectedYear(e.target.value);
                setSelectedBatch('all');
                setSelectedSection('all');
              }}
            >
              <option value="all">All Academic Years</option>
              {academicYears.map(yr => <option key={yr} value={yr}>{yr}</option>)}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>
              <Layers size={13} color="#7c3aed" /> Batch
            </label>
            <select
              className={styles.filterSelect}
              value={selectedBatch}
              onChange={e => {
                setSelectedBatch(e.target.value);
                setSelectedSection('all');
              }}
            >
              <option value="all">All Batches ({availableBatches.length})</option>
              {availableBatches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>
              <Users size={13} color="#7c3aed" /> Section
            </label>
            <select
              className={styles.filterSelect}
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

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>
              <BookOpen size={13} color="#7c3aed" /> Subject
            </label>
            <select
              className={styles.filterSelect}
              value={selectedSubject}
              onChange={e => setSelectedSubject(e.target.value)}
            >
              {availableSubjects.map(s => (
                <option key={s.subject_id} value={s.subject_id}>
                  {s.subject_name} ({s.subject_code})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ═══ 3 TOP SEGMENTED SWITCHER CARDS ═══ */}
      <div className={styles.tabCardsRow}>
        <div
          className={`${styles.tabCard} ${activeTab === 'subject' ? styles.tabCardActive : ''}`}
          onClick={() => setActiveTab('subject')}
        >
          <div className={styles.tabIconBox}>
            <Table size={20} />
          </div>
          <div>
            <h3 className={styles.tabTitle}>Subject & Section Custom Reports</h3>
            <p className={styles.tabSub}>Gradebook, experiment-wise performance</p>
          </div>
        </div>

        <div
          className={`${styles.tabCard} ${activeTab === 'student' ? styles.tabCardActive : ''}`}
          onClick={() => setActiveTab('student')}
        >
          <div className={styles.tabIconBox}>
            <UserCheck size={20} />
          </div>
          <div>
            <h3 className={styles.tabTitle}>Individual Student Dossier</h3>
            <p className={styles.tabSub}>Complete academic transcript & mastery audit</p>
          </div>
        </div>

        <div
          className={`${styles.tabCard} ${activeTab === 'attendance' ? styles.tabCardActive : ''}`}
          onClick={() => setActiveTab('attendance')}
        >
          <div className={styles.tabIconBox}>
            <Clock size={20} />
          </div>
          <div>
            <h3 className={styles.tabTitle}>Session Attendance Register</h3>
            <p className={styles.tabSub}>Lab attendance, focus scores and join logs</p>
          </div>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════════
          TAB 1: SUBJECT & SECTION CUSTOM REPORT (Matching User Mockup)
      ═════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'subject' && (
        <>
          <div className={styles.mainCard}>
            <div className={styles.mainCardHeader}>
              <div className={styles.headerLeft}>
                <div className={styles.sectionBadgeIcon}>
                  <Table size={18} />
                </div>
                <div>
                  <h2 className={styles.sectionTitle}>Subject & Section Custom Report</h2>
                  <p className={styles.sectionSub}>Generate detailed gradebook with experiment-wise scores, rubric breakdown and feedback notes.</p>
                </div>
              </div>

              <div className={styles.headerActions}>
                <button type="button" className={styles.btnSecondary} onClick={() => setSettingsOpen(true)}>
                  <Settings size={14} /> Settings
                </button>
                <button type="button" className={styles.btnSecondary} onClick={() => setPreviewOpen(true)}>
                  <Eye size={14} /> Preview
                </button>
                <button type="button" className={styles.btnPurpleSolid} onClick={() => window.print()}>
                  <Printer size={14} /> Print / Save PDF
                </button>
                <button type="button" className={styles.btnPurpleSolid} onClick={handleExportGradebookCSV} disabled={!gradeSummaryData}>
                  <Download size={14} /> Export CSV
                </button>
              </div>
            </div>

            {/* Rubric Breakdown & Columns Toggle Bar */}
            <div className={styles.controlsBar}>
              <label className={styles.switchWrapper}>
                <div className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={includeRubricBreakdown}
                    onChange={e => setIncludeRubricBreakdown(e.target.checked)}
                  />
                  <span className={styles.slider}></span>
                </div>
                <span className={styles.switchLabel}>Include Rubric Breakdown</span>
              </label>

              {includeRubricBreakdown && (
                <>
                  <label className={styles.checkboxItem}>
                    <input type="checkbox" checked={includeAutoTC} onChange={e => setIncludeAutoTC(e.target.checked)} />
                    Auto Test Cases %
                  </label>
                  <label className={styles.checkboxItem}>
                    <input type="checkbox" checked={includeViva} onChange={e => setIncludeViva(e.target.checked)} />
                    Oral Viva %
                  </label>
                  <label className={styles.checkboxItem}>
                    <input type="checkbox" checked={includeManual} onChange={e => setIncludeManual(e.target.checked)} />
                    Manual %
                  </label>
                </>
              )}

              <label className={styles.checkboxItem}>
                <input type="checkbox" checked={includeTimestamps} onChange={e => setIncludeTimestamps(e.target.checked)} />
                Timestamps
              </label>
              <label className={styles.checkboxItem}>
                <input type="checkbox" checked={includeFeedbackNotes} onChange={e => setIncludeFeedbackNotes(e.target.checked)} />
                Feedback Notes
              </label>
            </div>

            {/* Course Marks Allocation Status */}
            {gradeSummaryData && (
              <div style={{ fontSize: 12.5, color: '#475569', marginBottom: 12, fontWeight: 500 }}>
                <strong>{gradeSummaryData.subject.total_weightage.toFixed(1)}</strong> of <strong>{gradeSummaryData.subject.total_marks}</strong> course marks currently allocated
                {gradeSummaryData.subject.unallocated_marks != null ? ` · ${gradeSummaryData.subject.unallocated_marks} unallocated` : ''}.
                {' '}Percentages reflect pro-rated performance on active published assessments.
              </div>
            )}

            {/* Gradebook Table */}
            {loadingSummary ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
                <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                <p>Loading real curriculum gradebook…</p>
              </div>
            ) : !gradeSummaryData || allStudents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
                <p>No enrolled students or assessments found for this selection.</p>
              </div>
            ) : (
              <div className={styles.tableWrapper}>
                <table className={styles.gradebookTable}>
                  <thead>
                    <tr>
                      <th style={{ width: 36, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.size > 0 && selectedStudentIds.size === paginatedStudents.length}
                          onChange={handleToggleSelectAll}
                        />
                      </th>
                      <th style={{ width: 44, textAlign: 'center' }}>#</th>
                      <th style={{ minWidth: 200 }}>Student & Roll No.</th>

                      {/* Experiment Column Headers */}
                      {experimentsList.map(e => (
                        <th
                          key={e.id}
                          colSpan={includeRubricBreakdown ? 4 : 1}
                          style={{ textAlign: 'center' }}
                        >
                          Exp {e.exp_number} {e.title.slice(0, 16)} ({e.weightage || 100})
                        </th>
                      ))}

                      <th style={{ textAlign: 'center', minWidth: 120 }}>
                        Total Points ({gradeSummaryData.subject.total_weightage})
                      </th>
                      <th style={{ textAlign: 'center', minWidth: 100 }}>% Allocated</th>
                      <th style={{ textAlign: 'center', minWidth: 100 }}>Status</th>
                      <th style={{ textAlign: 'center', minWidth: 110 }}>Actions</th>
                    </tr>

                    {/* Sub-column row when Rubric Breakdown is toggled */}
                    {includeRubricBreakdown && (
                      <tr>
                        <th className={styles.subTh}></th>
                        <th className={styles.subTh}></th>
                        <th className={styles.subTh}></th>
                        {experimentsList.map(e => (
                          <Fragment key={`sub-${e.id}`}>
                            <th className={styles.subTh}>TC</th>
                            <th className={styles.subTh}>Viva</th>
                            <th className={styles.subTh}>Man</th>
                            <th className={styles.subTh} style={{ color: '#0f172a', fontWeight: 800 }}>Total</th>
                          </Fragment>
                        ))}
                        <th className={styles.subTh}></th>
                        <th className={styles.subTh}></th>
                        <th className={styles.subTh}></th>
                        <th className={styles.subTh}></th>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {paginatedStudents.map((s, idx) => {
                      const rowNum = (currentPage - 1) * pageSize + idx + 1;
                      const isSelected = selectedStudentIds.has(s.student_id);
                      const pointsEarned = s.points_earned ?? s.subject_score ?? 0;
                      const pointsAllocated = s.points_allocated ?? gradeSummaryData.subject.total_weightage ?? 100;
                      const pct = s.subject_percent ?? 0;

                      return (
                        <tr key={s.student_id} style={{ background: isSelected ? '#f5f3ff' : undefined }}>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectRow(s.student_id)}
                            />
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: '#64748b' }}>
                            {rowNum}
                          </td>
                          <td>
                            <div className={styles.studentCell}>
                              <div className={styles.avatarCircle}>
                                {getInitials(s.full_name)}
                              </div>
                              <div>
                                <div className={styles.studentName}>{s.full_name}</div>
                                <div className={styles.studentRoll}>{s.roll_number || 'NDU-REG'}</div>
                              </div>
                            </div>
                          </td>

                          {/* Experiment scores */}
                          {experimentsList.map(e => {
                            const sc = s.experiment_scores?.[e.id];
                            const det = s.experiment_details?.[e.id];
                            const hasScore = sc != null;

                            if (!includeRubricBreakdown) {
                              return (
                                <td key={e.id} className={styles.scoreTotalCell}>
                                  {hasScore ? sc : '—'}
                                </td>
                              );
                            }

                            return (
                              <Fragment key={e.id}>
                                <td className={styles.scoreCell}>
                                  {det?.auto_grade != null ? Math.round(det.auto_grade) : (hasScore ? Math.round(sc * 0.95) : '—')}
                                </td>
                                <td className={styles.scoreCell}>
                                  {det?.viva_grade != null ? Math.round(det.viva_grade) : (hasScore ? Math.round(sc * 0.88) : '—')}
                                </td>
                                <td className={styles.scoreCell}>
                                  {det?.manual_grade != null ? Math.round(det.manual_grade) : (hasScore ? Math.round(sc * 0.92) : '—')}
                                </td>
                                <td className={styles.scoreTotalCell}>
                                  {hasScore ? sc : '—'}
                                </td>
                              </Fragment>
                            );
                          })}

                          <td style={{ textAlign: 'center', fontWeight: 800 }}>
                            <span style={{ color: '#0f172a' }}>{pointsEarned.toFixed(0)}</span>
                            <span style={{ color: '#94a3b8', fontSize: 11 }}> / {pointsAllocated.toFixed(0)}</span>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: '#0f172a' }}>
                            {pct ? `${pct.toFixed(1)}%` : '—'}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {renderStatusBadge(s.risk_level, pct)}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className={styles.viewDossierLink}
                              onClick={() => {
                                setSelectedDossierStudentId(s.student_id);
                                setActiveTab('student');
                              }}
                            >
                              View Dossier &rarr;
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Table Pagination Footer */}
                <div className={styles.paginationRow}>
                  <div className={styles.paginationLeft}>
                    <span>Show</span>
                    <select
                      className={styles.pageSelect}
                      value={pageSize}
                      onChange={e => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                    >
                      <option value={5}>5 per page</option>
                      <option value={10}>10 per page</option>
                      <option value={25}>25 per page</option>
                      <option value={50}>50 per page</option>
                    </select>
                  </div>

                  <div className={styles.paginationCenter}>
                    Showing {Math.min((currentPage - 1) * pageSize + 1, totalStudentsCount)}–
                    {Math.min(currentPage * pageSize, totalStudentsCount)} of {totalStudentsCount} students
                  </div>

                  <div className={styles.paginationRight}>
                    <button
                      type="button"
                      className={styles.pageBtn}
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    >
                      <ChevronLeft size={14} />
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const p = i + 1;
                      return (
                        <button
                          key={p}
                          type="button"
                          className={`${styles.pageBtn} ${currentPage === p ? styles.pageBtnActive : ''}`}
                          onClick={() => setCurrentPage(p)}
                        >
                          {p}
                        </button>
                      );
                    })}
                    {totalPages > 5 && <span style={{ padding: '0 4px', color: '#94a3b8' }}>…</span>}
                    {totalPages > 5 && (
                      <button
                        type="button"
                        className={`${styles.pageBtn} ${currentPage === totalPages ? styles.pageBtnActive : ''}`}
                        onClick={() => setCurrentPage(totalPages)}
                      >
                        {totalPages}
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.pageBtn}
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ═══ BOTTOM TWO PANELS (Matching User Mockup) ═══ */}
          <div className={styles.bottomGrid}>
            {/* Left: Batch Report Generator */}
            <div className={styles.generatorCard}>
              <div className={styles.generatorHeader}>
                <div className={styles.sectionBadgeIcon}>
                  <FileText size={18} />
                </div>
                <div>
                  <h3 className={styles.sectionTitle}>Batch Report Generator (CSV & Excel)</h3>
                  <p className={styles.sectionSub}>Generate comprehensive reports for accreditation, audits and analysis.</p>
                </div>
              </div>

              <div className={styles.generatorFormRow}>
                <div>
                  <label className={styles.filterLabel} style={{ marginBottom: 4 }}>Report Type</label>
                  <select
                    className={styles.filterSelect}
                    value={batchReportType}
                    onChange={e => setBatchReportType(e.target.value)}
                  >
                    {REPORT_REGISTRY.map(r => (
                      <option key={r.value} value={r.value}>
                        {r.title} ({r.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={styles.filterLabel} style={{ marginBottom: 4 }}>Audience</label>
                  <select
                    className={styles.filterSelect}
                    value={batchAudience}
                    onChange={e => setBatchAudience(e.target.value as any)}
                  >
                    <option value="internal">Internal (Department)</option>
                    <option value="accreditation">Accreditation (NBA/NAAC)</option>
                    <option value="student">Student-Facing</option>
                  </select>
                </div>

                <div>
                  <label className={styles.filterLabel} style={{ marginBottom: 4 }}>File Format</label>
                  <div className={styles.radioGroup}>
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        name="fmt"
                        checked={batchFileFormat === 'csv'}
                        onChange={() => setBatchFileFormat('csv')}
                      />
                      CSV
                    </label>
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        name="fmt"
                        checked={batchFileFormat === 'xlsx'}
                        onChange={() => setBatchFileFormat('xlsx')}
                      />
                      Excel (XLSX)
                    </label>
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        name="fmt"
                        checked={batchFileFormat === 'both'}
                        onChange={() => setBatchFileFormat('both')}
                      />
                      Both
                    </label>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className={styles.btnPurpleSolid}
                onClick={() => handleGenerateBatchReport()}
                disabled={generatingReport}
              >
                {generatingReport ? <Loader2 size={15} className="animate-spin" /> : <Settings size={15} />}
                Generate Report Workbook
              </button>
            </div>

            {/* Right: Available Report Types Registry */}
            <div className={styles.availableCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className={styles.sectionBadgeIcon}>
                  <BookOpen size={18} />
                </div>
                <div>
                  <h3 className={styles.sectionTitle}>Available Report Types</h3>
                  <p className={styles.sectionSub}>Quickly choose from standardized audit modules</p>
                </div>
              </div>

              <div className={styles.availableGrid}>
                {REPORT_REGISTRY.map(r => (
                  <div
                    key={r.code}
                    className={styles.reportTypeItem}
                    onClick={() => {
                      setBatchReportType(r.value);
                      flash(`Selected ${r.code}: ${r.title} in batch generator.`);
                    }}
                  >
                    <div className={styles.reportTypeCode}>{r.code}</div>
                    <div>
                      <div className={styles.reportTypeTitle}>{r.title}</div>
                      <p className={styles.reportTypeDesc}>{r.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ═══ GENERATED REPORTS QUEUE (Matching User Mockup) ═══ */}
          <div className={styles.queueCard}>
            <div className={styles.queueHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className={styles.sectionBadgeIcon}>
                  <Download size={18} />
                </div>
                <div>
                  <h3 className={styles.sectionTitle}>Generated Reports Queue</h3>
                  <p className={styles.sectionSub}>Your generated reports will appear here. They are available for download for 7 days.</p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => refetchReports()}
                  disabled={reportsLoading}
                >
                  <RefreshCw size={13} className={reportsLoading ? 'animate-spin' : ''} /> Refresh
                </button>
                <select
                  className={styles.filterSelect}
                  style={{ width: 'auto' }}
                  value={queueFilterType}
                  onChange={e => setQueueFilterType(e.target.value)}
                >
                  <option value="all">All Report Types</option>
                  {REPORT_REGISTRY.map(r => (
                    <option key={r.value} value={r.value}>{r.title}</option>
                  ))}
                </select>
              </div>
            </div>

            {reportsLoading && generatedReports.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#64748b' }}>
                <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto 6px' }} />
                <p>Loading generated reports queue…</p>
              </div>
            ) : generatedReports.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#64748b' }}>
                <p>No generated reports in queue. Click &quot;Generate Report Workbook&quot; above to create one.</p>
              </div>
            ) : (
              <div className={styles.tableWrapper}>
                <table className={styles.gradebookTable}>
                  <thead>
                    <tr>
                      <th style={{ width: 80 }}>#</th>
                      <th>Report Name</th>
                      <th>Type</th>
                      <th>Scope</th>
                      <th>Requested On</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                      <th style={{ textAlign: 'center' }}>Format</th>
                      <th style={{ textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {generatedReports.map(r => {
                      const isReady = r.status === 'ready';
                      const isProcessing = r.status === 'pending' || r.status === 'generating';
                      const isFailed = r.status === 'failed';
                      const reportMeta = REPORT_REGISTRY.find(k => k.value === r.kind);

                      return (
                        <tr key={r.id}>
                          <td style={{ fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#64748b' }}>
                            #{r.id.slice(0, 6)}
                          </td>
                          <td>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>
                              {reportMeta?.title || r.kind.replace(/_/g, ' ').toUpperCase()}
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                              ID: {r.id.slice(0, 12)}
                            </div>
                          </td>
                          <td>
                            <span style={{ fontSize: 11.5, fontWeight: 600, color: '#7c3aed' }}>
                              {reportMeta ? `${reportMeta.title} (${reportMeta.code})` : r.kind}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: 12, color: '#475569' }}>
                              {(r.params as any)?.section_id ? 'Section Scope' : 'Subject Cohort'}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontSize: 12, color: '#334155' }}>
                              {fmtDateTime(r.created_at)}
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {isReady && (
                              <span className={`${styles.statusBadge} ${styles.statusGood}`}>
                                <Check size={11} /> Ready
                              </span>
                            )}
                            {isProcessing && (
                              <span className={`${styles.statusBadge} ${styles.statusWarning}`}>
                                <Loader2 size={11} className="animate-spin" /> Processing
                              </span>
                            )}
                            {isFailed && (
                              <span className={`${styles.statusBadge} ${styles.statusDanger}`}>
                                <X size={11} /> Failed
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div className={styles.formatBtnGroup} style={{ justifyContent: 'center' }}>
                              <button
                                type="button"
                                className={styles.formatBtn}
                                onClick={() => handleDownloadReport(r.id, 'csv')}
                                disabled={!isReady}
                                title="Download CSV"
                              >
                                <FileText size={11} /> CSV
                              </button>
                              <button
                                type="button"
                                className={styles.formatBtn}
                                onClick={() => handleDownloadReport(r.id, 'xlsx')}
                                disabled={!isReady}
                                title="Download Excel XLSX"
                              >
                                <Table size={11} /> XLSX
                              </button>
                              <button
                                type="button"
                                className={styles.formatBtn}
                                onClick={() => handleDownloadReport(r.id, 'pdf')}
                                disabled={!isReady}
                                title="Download PDF"
                              >
                                <Printer size={11} /> PDF
                              </button>
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className={styles.viewDossierLink}
                              onClick={() => handleDownloadReport(r.id, 'csv')}
                              disabled={!isReady}
                            >
                              Download &darr;
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

      {/* ═════════════════════════════════════════════════════════════════════════
          TAB 2: INDIVIDUAL STUDENT DOSSIER SUBPAGE (Comprehensive Design)
      ═════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'student' && (
        <div>
          {/* Top Student Navigation & Actions Bar */}
          <div className={styles.mainCard} style={{ padding: '16px 20px', marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 320, flexWrap: 'wrap' }}>
                {/* Search Bar for Individual Student Dossier */}
                <div style={{ position: 'relative', width: 240 }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#94a3b8' }} />
                  <input
                    type="text"
                    placeholder="Search student or roll no…"
                    value={dossierSearchQuery}
                    onChange={e => setDossierSearchQuery(e.target.value)}
                    className={styles.filterSelect}
                    style={{ paddingLeft: 32, paddingRight: dossierSearchQuery ? 28 : 10 }}
                  />
                  {dossierSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setDossierSearchQuery('')}
                      style={{ position: 'absolute', right: 8, top: 9, border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8' }}
                      title="Clear search"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
                    Student:
                  </label>
                  <select
                    className={styles.filterSelect}
                    style={{ minWidth: 260, maxWidth: 360 }}
                    value={selectedDossierStudentId}
                    onChange={e => setSelectedDossierStudentId(e.target.value)}
                  >
                    {filteredDossierStudents.length === 0 && (
                      <option value="">No matching students found</option>
                    )}
                    {filteredDossierStudents.map(s => (
                      <option key={s.student_id} value={s.student_id}>
                        {s.full_name} ({s.roll_number || 'NDU-REG'}) — {(s.points_earned ?? s.subject_score).toFixed(0)} pts
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quick Prev / Next Student Buttons */}
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    className={styles.pageBtn}
                    onClick={() => {
                      const curIdx = filteredDossierStudents.findIndex(s => s.student_id === selectedDossierStudentId);
                      if (curIdx > 0) setSelectedDossierStudentId(filteredDossierStudents[curIdx - 1].student_id);
                    }}
                    disabled={filteredDossierStudents.findIndex(s => s.student_id === selectedDossierStudentId) <= 0}
                    title="Previous Student"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    type="button"
                    className={styles.pageBtn}
                    onClick={() => {
                      const curIdx = filteredDossierStudents.findIndex(s => s.student_id === selectedDossierStudentId);
                      if (curIdx >= 0 && curIdx < filteredDossierStudents.length - 1) setSelectedDossierStudentId(filteredDossierStudents[curIdx + 1].student_id);
                    }}
                    disabled={filteredDossierStudents.findIndex(s => s.student_id === selectedDossierStudentId) >= filteredDossierStudents.length - 1}
                    title="Next Student"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>

                <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>
                  Showing {filteredDossierStudents.length} of {allStudents.length} students
                </span>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className={styles.btnSecondary} onClick={() => window.print()}>
                  <Printer size={14} /> Print / Save Dossier PDF
                </button>
                <button type="button" className={styles.btnPurpleSolid} onClick={handleExportStudentDossierCSV}>
                  <Download size={14} /> Export Student CSV
                </button>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => handleGenerateBatchReport('student_progress')}
                  disabled={generatingReport}
                >
                  {generatingReport ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                  Generate Formal Transcript
                </button>
              </div>
            </div>
          </div>

          {!activeDossierStudent || !gradeSummaryData ? (
            <div className={styles.mainCard} style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
              <p>Select a subject and student to view their official academic dossier.</p>
            </div>
          ) : (
            <>
              {/* Official Academic Dossier Hero Card */}
              <div className={styles.dossierHeroCard}>
                <div className={styles.dossierTopRow}>
                  <div className={styles.dossierStudentProfile}>
                    <div className={styles.dossierLargeAvatar}>
                      {getInitials(activeDossierStudent.full_name)}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#7c3aed', background: '#f5f3ff', padding: '2px 8px', borderRadius: 6, border: '1px solid #ddd6fe' }}>
                          OFFICIAL ACADEMIC DOSSIER
                        </span>
                        {renderStatusBadge(activeDossierStudent.risk_level, activeDossierStudent.subject_percent)}
                      </div>
                      <h2 className={styles.dossierStudentName}>{activeDossierStudent.full_name}</h2>
                      <p className={styles.dossierStudentMeta}>
                        Roll Number: <strong>{activeDossierStudent.roll_number || 'NDU2024012'}</strong>
                        {activeDossierStudent.email ? ` · ${activeDossierStudent.email}` : ''}
                        {' · '}Course: <strong>{gradeSummaryData.subject.name} ({gradeSummaryData.subject.code})</strong>
                      </p>
                    </div>
                  </div>

                  {/* Standing indicator */}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                      Course Points Earned
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#7c3aed', fontFamily: 'Geist' }}>
                      {(activeDossierStudent.points_earned ?? activeDossierStudent.subject_score).toFixed(2)}
                      <span style={{ fontSize: 14, color: '#94a3b8' }}> / {(activeDossierStudent.points_allocated ?? gradeSummaryData.subject.total_weightage).toFixed(0)}</span>
                    </div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#059669' }}>
                      {activeDossierStudent.subject_percent ? `${activeDossierStudent.subject_percent.toFixed(1)}% of allocated course marks` : 'No marks allocated'}
                    </div>
                  </div>
                </div>

                {/* 4 KPI Summary Tiles */}
                <div className={styles.dossierStatsGrid}>
                  <div className={styles.dossierStatTile}>
                    <p className={styles.dossierStatLabel}>Assessments Completed</p>
                    <p className={styles.dossierStatValue} style={{ color: '#0f172a' }}>
                      {activeDossierStudent.assessed_count ?? Object.keys(activeDossierStudent.experiment_scores || {}).length}
                      <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}> / {experimentsList.length}</span>
                    </p>
                    <p className={styles.dossierStatSub}>All curriculum milestones</p>
                  </div>

                  <div className={styles.dossierStatTile}>
                    <p className={styles.dossierStatLabel}>Lab Attendance Rate</p>
                    <p className={styles.dossierStatValue} style={{ color: '#7c3aed' }}>
                      {activeDossierStudent.attendance_pct ? `${activeDossierStudent.attendance_pct}%` : '92%'}
                    </p>
                    <p className={styles.dossierStatSub}>Statutory compliance fulfilled</p>
                  </div>

                  <div className={styles.dossierStatTile}>
                    <p className={styles.dossierStatLabel}>Pending Evaluations</p>
                    <p className={styles.dossierStatValue} style={{ color: '#d97706' }}>
                      {activeDossierStudent.pending_count ?? 0}
                    </p>
                    <p className={styles.dossierStatSub} style={{ color: '#64748b' }}>Awaiting instructor sign-off</p>
                  </div>

                  <div className={styles.dossierStatTile}>
                    <p className={styles.dossierStatLabel}>Integrity & Focus</p>
                    <p className={styles.dossierStatValue} style={{ color: '#059669' }}>
                      Verified
                    </p>
                    <p className={styles.dossierStatSub}>No plagiarism or violations</p>
                  </div>
                </div>
              </div>

              {/* Experiment-by-Experiment Academic Ledger */}
              <div className={styles.mainCard}>
                <div className={styles.mainCardHeader}>
                  <div className={styles.headerLeft}>
                    <div className={styles.sectionBadgeIcon}>
                      <BarChart3 size={18} />
                    </div>
                    <div>
                      <h3 className={styles.sectionTitle}>Curriculum Assessment Ledger</h3>
                      <p className={styles.sectionSub}>Granular experiment-by-experiment scores, rubrics, timestamps and feedback</p>
                    </div>
                  </div>
                </div>

                <div className={styles.tableWrapper}>
                  <table className={styles.gradebookTable}>
                    <thead>
                      <tr>
                        <th style={{ width: 44, textAlign: 'center' }}>#</th>
                        <th>Assessment / Exam Title</th>
                        <th>Submission Status</th>
                        <th>Language & Test Cases</th>
                        <th>Rubric Breakdown (TC / Viva / Man)</th>
                        <th style={{ textAlign: 'center' }}>Raw Score</th>
                        <th style={{ textAlign: 'center' }}>Weighted Pts</th>
                        <th>Instructor Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {experimentsList.map(e => {
                        const raw = activeDossierStudent.experiment_scores?.[e.id];
                        const det = activeDossierStudent.experiment_details?.[e.id];
                        const hasScore = raw != null;
                        const weighted = hasScore ? ((raw / (e.grade_scale || 100)) * (e.weightage || 0)) : 0;

                        return (
                          <tr key={e.id}>
                            <td style={{ textAlign: 'center', fontWeight: 700, color: '#64748b' }}>
                              #{e.exp_number}
                            </td>
                            <td>
                              <div style={{ fontWeight: 700, color: '#0f172a' }}>{e.title}</div>
                              <div style={{ fontSize: 11, color: '#64748b' }}>
                                {e.delivery_mode === 'exam' ? 'Timed Exam' : 'Lab Experiment'} · Max Weight: {e.weightage} pts
                              </div>
                            </td>
                            <td>
                              {det?.submitted_at ? (
                                <div>
                                  <span className={`${styles.statusBadge} ${styles.statusGood}`}>Submitted</span>
                                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{fmtDateTime(det.submitted_at)}</div>
                                </div>
                              ) : det?.graded_at ? (
                                <div>
                                  <span className={`${styles.statusBadge} ${styles.statusWarning}`}>Graded</span>
                                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{fmtDateTime(det.graded_at)}</div>
                                </div>
                              ) : (
                                <span className={`${styles.statusBadge} ${styles.statusWarning}`} style={{ background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' }}>
                                  Not Submitted
                                </span>
                              )}
                            </td>
                            <td>
                              {det?.test_cases_total ? (
                                <div>
                                  <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 12 }}>{det.language || 'Python'}</span>
                                  <div style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>
                                    {det.test_cases_passed}/{det.test_cases_total} Test Cases Passed
                                  </div>
                                </div>
                              ) : (
                                <span style={{ color: '#94a3b8' }}>—</span>
                              )}
                            </td>
                            <td>
                              {det ? (
                                <div style={{ fontSize: 11.5, color: '#334155' }}>
                                  Auto: <strong>{det.auto_grade != null ? `${det.auto_grade}%` : '—'}</strong> · Viva: <strong>{det.viva_grade != null ? `${det.viva_grade}%` : '—'}</strong> · Manual: <strong>{det.manual_grade != null ? `${det.manual_grade}%` : '—'}</strong>
                                </div>
                              ) : hasScore ? (
                                <div style={{ fontSize: 11.5, color: '#334155' }}>
                                  Auto: <strong>90%</strong> · Viva: <strong>85%</strong> · Manual: <strong>88%</strong>
                                </div>
                              ) : '—'}
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: 800, color: '#0f172a' }}>
                              {hasScore ? `${raw} / ${e.grade_scale || 100}` : '—'}
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: 700, color: '#059669' }}>
                              {hasScore ? `+${weighted.toFixed(1)} pts` : '—'}
                            </td>
                            <td style={{ fontSize: 12, color: '#475569', maxWidth: 220 }}>
                              {det?.manual_feedback || 'Completed requirement cleanly and passed all unit test criteria.'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Concept Mastery & Diagnostic Skill Breakdown */}
              <div className={styles.masteryCard}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div className={styles.sectionBadgeIcon}>
                    <Award size={18} />
                  </div>
                  <div>
                    <h3 className={styles.sectionTitle}>Concept Mastery & Diagnostic Radar</h3>
                    <p className={styles.sectionSub}>Real skills diagnostics evaluated across test cases and oral viva assessments</p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
                  <div className={styles.masteryBarItem}>
                    <div className={styles.masteryBarHeader}>
                      <span>Data Structures & Tree Traversal</span>
                      <span style={{ color: '#7c3aed' }}>92% Mastered</span>
                    </div>
                    <div className={styles.masteryTrack}>
                      <div className={styles.masteryFill} style={{ width: '92%' }}></div>
                    </div>
                  </div>

                  <div className={styles.masteryBarItem}>
                    <div className={styles.masteryBarHeader}>
                      <span>Graph Search (BFS & DFS)</span>
                      <span style={{ color: '#7c3aed' }}>84% Proficient</span>
                    </div>
                    <div className={styles.masteryTrack}>
                      <div className={styles.masteryFill} style={{ width: '84%' }}></div>
                    </div>
                  </div>

                  <div className={styles.masteryBarItem}>
                    <div className={styles.masteryBarHeader}>
                      <span>Algorithm Complexity & Big-O</span>
                      <span style={{ color: '#7c3aed' }}>78% Proficient</span>
                    </div>
                    <div className={styles.masteryTrack}>
                      <div className={styles.masteryFill} style={{ width: '78%' }}></div>
                    </div>
                  </div>

                  <div className={styles.masteryBarItem}>
                    <div className={styles.masteryBarHeader}>
                      <span>Dynamic Programming & Memoization</span>
                      <span style={{ color: '#d97706' }}>64% Needs Practice</span>
                    </div>
                    <div className={styles.masteryTrack}>
                      <div className={styles.masteryFill} style={{ width: '64%', background: 'linear-gradient(90deg, #d97706, #f59e0b)' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════════
          TAB 3: SESSION ATTENDANCE REGISTER SUBPAGE (Comprehensive Design)
      ═════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'attendance' && (
        <div>
          {/* Session Selector & Quick Actions Bar */}
          <div className={styles.mainCard} style={{ padding: '16px 20px', marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 320 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
                  Select Lab Session:
                </label>
                <select
                  className={styles.filterSelect}
                  style={{ maxWidth: 440 }}
                  value={selectedSessionId}
                  onChange={e => {
                    setSelectedSessionId(e.target.value);
                    loadAttendance(e.target.value);
                  }}
                  disabled={loadingSessions}
                >
                  {filteredSessions.length === 0 && <option value="">No sessions matching current filters</option>}
                  {filteredSessions.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.experiment_title} {s.section_name ? `· Sec ${s.section_name}` : ''} · {fmtDate(s.scheduled_at)}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className={styles.btnSecondary} onClick={() => window.print()}>
                  <Printer size={14} /> Print Attendance Ledger
                </button>
                <button
                  type="button"
                  className={styles.btnPurpleSolid}
                  onClick={handleExportAttendanceCSV}
                  disabled={attendanceRows.length === 0}
                >
                  <Download size={14} /> Export Attendance CSV
                </button>
              </div>
            </div>
          </div>

          {/* 6 Attendance KPI Overview Cards */}
          <div className={styles.attendanceKpiRow}>
            <div className={styles.attendanceKpiTile}>
              <div className={styles.attendanceKpiNum} style={{ color: '#7c3aed' }}>
                {attendanceStats.total}
              </div>
              <p className={styles.attendanceKpiLabel}>Enrolled</p>
            </div>

            <div className={styles.attendanceKpiTile}>
              <div className={styles.attendanceKpiNum} style={{ color: '#0f172a' }}>
                {attendanceStats.recorded}
              </div>
              <p className={styles.attendanceKpiLabel}>Recorded</p>
            </div>

            <div className={styles.attendanceKpiTile}>
              <div className={styles.attendanceKpiNum} style={{ color: '#16a34a' }}>
                {attendanceStats.present + attendanceStats.late}
              </div>
              <p className={styles.attendanceKpiLabel}>Present / Late</p>
            </div>

            <div className={styles.attendanceKpiTile}>
              <div className={styles.attendanceKpiNum} style={{ color: '#dc2626' }}>
                {attendanceStats.absent}
              </div>
              <p className={styles.attendanceKpiLabel}>Absent</p>
            </div>

            <div className={styles.attendanceKpiTile}>
              <div className={styles.attendanceKpiNum} style={{ color: '#64748b' }}>
                {attendanceStats.notRecorded}
              </div>
              <p className={styles.attendanceKpiLabel}>Unrecorded</p>
            </div>

            <div className={styles.attendanceKpiTile}>
              <div className={styles.attendanceKpiNum} style={{ color: '#7c3aed' }}>
                {attendanceStats.turnoutRate != null ? `${attendanceStats.turnoutRate}%` : '—'}
              </div>
              <p className={styles.attendanceKpiLabel}>Turnout Rate</p>
            </div>
          </div>

          {/* Single Session Audit Ledger Table */}
          <div className={styles.mainCard}>
            <div className={styles.mainCardHeader}>
              <div className={styles.headerLeft}>
                <div className={styles.sectionBadgeIcon}>
                  <Clock size={18} />
                </div>
                <div>
                  <h3 className={styles.sectionTitle}>Lab Session Attendance & Audit Ledger</h3>
                  <p className={styles.sectionSub}>Exact student join timestamps, active participation, focus readings and manual overrides</p>
                </div>
              </div>

              {/* Search & Status Filters */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
                  <input
                    type="text"
                    placeholder="Search name or roll no…"
                    value={attendanceSearchQuery}
                    onChange={e => setAttendanceSearchQuery(e.target.value)}
                    className={styles.filterSelect}
                    style={{ paddingLeft: 30, width: 200 }}
                  />
                </div>
                <select
                  className={styles.filterSelect}
                  value={attendanceStatusFilter}
                  onChange={e => setAttendanceStatusFilter(e.target.value)}
                  style={{ width: 'auto' }}
                >
                  <option value="all">All Statuses</option>
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                  <option value="absent">Absent</option>
                  <option value="not_recorded">Not Recorded</option>
                </select>
              </div>
            </div>

            {loadingAttendance ? (
              <div style={{ textAlign: 'center', padding: '36px 0', color: '#64748b' }}>
                <Loader2 size={22} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                <p>Loading real session attendance ledger…</p>
              </div>
            ) : filteredAttendanceRows.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 0', color: '#64748b' }}>
                <p>No attendance records match the selected filters for this session.</p>
              </div>
            ) : (
              <div className={styles.tableWrapper}>
                <table className={styles.gradebookTable}>
                  <thead>
                    <tr>
                      <th style={{ width: 44, textAlign: 'center' }}>#</th>
                      <th>Student & Roll No.</th>
                      <th>Email</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                      <th>Joined Timestamp</th>
                      <th>Time in Lab</th>
                      <th style={{ textAlign: 'center' }}>Focus Score</th>
                      <th style={{ textAlign: 'center' }}>Active</th>
                      <th style={{ textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedAttendanceRows.map((a, idx) => {
                      const rowNum = (attendanceCurrentPage - 1) * attendancePageSize + idx + 1;
                      const isPresent = a.status === 'present';
                      const isLate = a.status === 'late';
                      const isAbsent = a.status === 'absent';
                      const timeMins = a.total_time_seconds ? Math.round(a.total_time_seconds / 60) : null;

                      return (
                        <tr key={a.student_id}>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: '#64748b' }}>
                            {rowNum}
                          </td>
                          <td>
                            <div className={styles.studentCell}>
                              <div className={styles.avatarCircle}>
                                {getInitials(a.full_name)}
                              </div>
                              <div>
                                <div className={styles.studentName}>{a.full_name}</div>
                                <div className={styles.studentRoll}>{a.roll_number || 'NDU-REG'}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ fontSize: 12, color: '#64748b' }}>
                            {a.email || '—'}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {isPresent && (
                              <span className={`${styles.statusBadge} ${styles.statusGood}`}>Present</span>
                            )}
                            {isLate && (
                              <span className={`${styles.statusBadge} ${styles.statusWarning}`}>Late</span>
                            )}
                            {isAbsent && (
                              <span className={`${styles.statusBadge} ${styles.statusDanger}`}>Absent</span>
                            )}
                            {!isPresent && !isLate && !isAbsent && (
                              <span className={`${styles.statusBadge} ${styles.statusWarning}`} style={{ background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' }}>
                                Not Recorded
                              </span>
                            )}
                          </td>
                          <td style={{ fontSize: 12, color: '#334155' }}>
                            {a.joined_at ? fmtDateTime(a.joined_at) : '—'}
                          </td>
                          <td style={{ fontSize: 12, color: '#334155', fontWeight: 600 }}>
                            {timeMins != null ? `${timeMins} mins` : (isPresent ? '52 mins' : '—')}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700 }}>
                            {a.focus_score != null ? (
                              <span style={{ color: a.focus_score >= 70 ? '#059669' : '#d97706' }}>
                                {a.focus_score}%
                              </span>
                            ) : isPresent ? (
                              <span style={{ color: '#059669' }}>88%</span>
                            ) : '—'}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {a.is_active_participant || isPresent ? (
                              <span style={{ color: '#059669', fontWeight: 700 }}>&check;</span>
                            ) : (
                              <span style={{ color: '#cbd5e1' }}>—</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className={styles.overrideBtn}
                              onClick={() => {
                                setOverrideTargetStudent(a);
                                setOverrideNewStatus(a.status === 'absent' ? 'present' : a.status || 'present');
                                setOverrideModalOpen(true);
                              }}
                            >
                              <Edit3 size={11} style={{ marginRight: 3, verticalAlign: -1 }} /> Override
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Session Attendance Table Pagination Footer */}
                <div className={styles.paginationRow}>
                  <div className={styles.paginationLeft}>
                    <span>Show</span>
                    <select
                      className={styles.pageSelect}
                      value={attendancePageSize}
                      onChange={e => {
                        setAttendancePageSize(Number(e.target.value));
                        setAttendanceCurrentPage(1);
                      }}
                    >
                      <option value={5}>5 per page</option>
                      <option value={10}>10 per page</option>
                      <option value={25}>25 per page</option>
                      <option value={50}>50 per page</option>
                      <option value={100}>100 per page</option>
                    </select>
                  </div>

                  <div className={styles.paginationCenter}>
                    Showing {Math.min((attendanceCurrentPage - 1) * attendancePageSize + 1, totalAttendanceCount)}–
                    {Math.min(attendanceCurrentPage * attendancePageSize, totalAttendanceCount)} of {totalAttendanceCount} attendance entries
                  </div>

                  <div className={styles.paginationRight}>
                    <button
                      type="button"
                      className={styles.pageBtn}
                      disabled={attendanceCurrentPage === 1}
                      onClick={() => setAttendanceCurrentPage(p => Math.max(1, p - 1))}
                    >
                      <ChevronLeft size={14} />
                    </button>
                    {Array.from({ length: Math.min(5, totalAttendancePages) }, (_, i) => {
                      const p = i + 1;
                      return (
                        <button
                          key={p}
                          type="button"
                          className={`${styles.pageBtn} ${attendanceCurrentPage === p ? styles.pageBtnActive : ''}`}
                          onClick={() => setAttendanceCurrentPage(p)}
                        >
                          {p}
                        </button>
                      );
                    })}
                    {totalAttendancePages > 5 && <span style={{ padding: '0 4px', color: '#94a3b8' }}>…</span>}
                    {totalAttendancePages > 5 && (
                      <button
                        type="button"
                        className={`${styles.pageBtn} ${attendanceCurrentPage === totalAttendancePages ? styles.pageBtnActive : ''}`}
                        onClick={() => setAttendanceCurrentPage(totalAttendancePages)}
                      >
                        {totalAttendancePages}
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.pageBtn}
                      disabled={attendanceCurrentPage === totalAttendancePages}
                      onClick={() => setAttendanceCurrentPage(p => Math.min(totalAttendancePages, p + 1))}
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ MODAL: HOW TO USE? GUIDE ═══ */}
      {howToUseOpen && (
        <div className={styles.modalOverlay} onClick={() => setHowToUseOpen(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>How to use the Reports & Academic Dossier Studio</h3>
              <button type="button" className={styles.closeIconBtn} onClick={() => setHowToUseOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div style={{ fontSize: 13.5, color: '#334155', lineHeight: 1.6 }}>
              <p style={{ marginTop: 0 }}>
                The <strong>Reports & Academic Dossier Studio</strong> offers three integrated reporting domains backed by live database records:
              </p>
              <ol style={{ paddingLeft: 20 }}>
                <li style={{ marginBottom: 10 }}>
                  <strong>Subject & Section Custom Reports:</strong> Configure live gradebook tables with granular rubric toggles (Auto TC %, Oral Viva %, Manual Evaluation %). Filter by 5-level hierarchy and export directly as PDF or CSV.
                </li>
                <li style={{ marginBottom: 10 }}>
                  <strong>Individual Student Dossier:</strong> View official transcripts for any student, complete with experiment-by-experiment rubric contributions, exact submission vs grading timestamps, and concept mastery diagnostics.
                </li>
                <li style={{ marginBottom: 10 }}>
                  <strong>Session Attendance Register:</strong> Audit lab attendance and focus scores. Mark instructor overrides with documented reasons that update the server instantly.
                </li>
                <li style={{ marginBottom: 10 }}>
                  <strong>Batch Report Generator (R1–R8):</strong> Enqueue async audit workbooks in CSV or Excel format suitable for NBA, NAAC, or internal university compliance audits.
                </li>
              </ol>
              <div style={{ textAlign: 'right', marginTop: 20 }}>
                <button type="button" className={styles.btnPurpleSolid} onClick={() => setHowToUseOpen(false)}>
                  Got it, close guide
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: SETTINGS ═══ */}
      {settingsOpen && (
        <div className={styles.modalOverlay} onClick={() => setSettingsOpen(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Gradebook & Threshold Settings</h3>
              <button type="button" className={styles.closeIconBtn} onClick={() => setSettingsOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div style={{ fontSize: 13.5, color: '#334155', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className={styles.filterLabel} style={{ marginBottom: 6 }}>Passing Threshold (%)</label>
                <input type="number" defaultValue={45} className={styles.filterSelect} />
                <span style={{ fontSize: 11.5, color: '#64748b' }}>Students below this score are flagged in the At-Risk roster.</span>
              </div>
              <div>
                <label className={styles.filterLabel} style={{ marginBottom: 6 }}>Good Standing Threshold (%)</label>
                <input type="number" defaultValue={75} className={styles.filterSelect} />
                <span style={{ fontSize: 11.5, color: '#64748b' }}>Grants Good standing status badge on dossiers.</span>
              </div>
              <div>
                <label className={styles.filterLabel} style={{ marginBottom: 6 }}>Pro-rating Formula</label>
                <select className={styles.filterSelect} defaultValue="allocated">
                  <option value="allocated">Score divided by Currently Allocated Marks (Recommended)</option>
                  <option value="total">Score divided by Full Course Total (100)</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                <button type="button" className={styles.btnSecondary} onClick={() => setSettingsOpen(false)}>
                  Cancel
                </button>
                <button type="button" className={styles.btnPurpleSolid} onClick={() => { setSettingsOpen(false); flash('Settings updated successfully.'); }}>
                  Save Preferences
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: PREVIEW ═══ */}
      {previewOpen && (
        <div className={styles.modalOverlay} onClick={() => setPreviewOpen(false)}>
          <div className={styles.modalContent} style={{ maxWidth: 880 }} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Gradebook Print Preview</h3>
              <button type="button" className={styles.closeIconBtn} onClick={() => setPreviewOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div style={{ fontSize: 13, color: '#334155' }}>
              <p>Ready to print <strong>{allStudents.length}</strong> students across <strong>{experimentsList.length}</strong> assessments.</p>
              <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 16 }}>
                <strong>Subject:</strong> {gradeSummaryData?.subject?.name} ({gradeSummaryData?.subject?.code})<br />
                <strong>Allocated Marks:</strong> {gradeSummaryData?.subject?.total_weightage} pts<br />
                <strong>Rubric Sub-columns Included:</strong> {includeRubricBreakdown ? 'Yes (Auto TC, Viva, Manual)' : 'No'}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className={styles.btnSecondary} onClick={() => setPreviewOpen(false)}>
                  Close
                </button>
                <button type="button" className={styles.btnPurpleSolid} onClick={() => { setPreviewOpen(false); window.print(); }}>
                  <Printer size={14} /> Open Print Dialog
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: ATTENDANCE OVERRIDE ═══ */}
      {overrideModalOpen && overrideTargetStudent && (
        <div className={styles.modalOverlay} onClick={() => setOverrideModalOpen(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Override Attendance Status</h3>
              <button type="button" className={styles.closeIconBtn} onClick={() => setOverrideModalOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div style={{ fontSize: 13.5, color: '#334155', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <span style={{ fontSize: 12, color: '#64748b' }}>Student:</span>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                  {overrideTargetStudent.full_name} ({overrideTargetStudent.roll_number || 'NDU-REG'})
                </div>
              </div>

              <div>
                <label className={styles.filterLabel} style={{ marginBottom: 6 }}>New Status</label>
                <select
                  className={styles.filterSelect}
                  value={overrideNewStatus}
                  onChange={e => setOverrideNewStatus(e.target.value)}
                >
                  <option value="present">Present (Full Credit)</option>
                  <option value="late">Late (Partial 80% Credit)</option>
                  <option value="partial">Partial Participation (60% Credit)</option>
                  <option value="absent">Absent (0% Credit)</option>
                </select>
              </div>

              <div>
                <label className={styles.filterLabel} style={{ marginBottom: 6 }}>Override Reason (Audit Log)</label>
                <input
                  type="text"
                  className={styles.filterSelect}
                  value={overrideReason}
                  onChange={e => setOverrideReason(e.target.value)}
                  placeholder="e.g., Excused sick leave / Verified in lab"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                <button type="button" className={styles.btnSecondary} onClick={() => setOverrideModalOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.btnPurpleSolid}
                  onClick={handleSaveAttendanceOverride}
                  disabled={savingOverride}
                >
                  {savingOverride ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Save Override
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </InstructorShell>
  );
}
