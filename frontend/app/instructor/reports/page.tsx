'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download, Table, Loader2, FileText, Building2, Calendar, Layers,
  Users, BookOpen, UserCheck, Printer, CheckCircle2, AlertTriangle, Award, Clock
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import styles from '../shared.module.css';
import { sessionService } from '@/services/session.service';
import { experimentService } from '@/services/experiment.service';
import { experienceService, type ReportRow } from '@/services/experience.service';
import { exportCSV } from '@/lib/analytics-utils';

const REPORT_KINDS = [
  { value: 'gradebook',              label: 'Subject Gradebook',      desc: 'All students × experiments, weighted finals + percentage' },
  { value: 'session_summary',        label: 'Session Summary',        desc: 'Attendance, performance, focus & integrity per session' },
  { value: 'student_progress',       label: 'Student Progress',       desc: 'Per-student completion, grades & mastery' },
  { value: 'experiment_performance', label: 'Experiment Performance', desc: 'Avg final, attempts, completion per experiment' },
  { value: 'at_risk',                label: 'At-Risk Roster',         desc: 'Students projected below the pass threshold' },
  { value: 'cross_section',          label: 'Cross-Section Compare',  desc: 'Same experiment compared across your sections' },
  { value: 'viva_consolidated',      label: 'Viva Consolidated',      desc: 'Per-student oral AI viva grades + feedback' },
  { value: 'catch_up',               label: 'Catch-up Attendance',    desc: 'Catch-up session attendance and outcomes' },
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
  status?: string;
}

interface AttendanceRow {
  student_id: string;
  full_name: string;
  roll_number: string;
  email: string;
  status: string;
  joined_at?: string | null;
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

const statusBadge = (status: string) => {
  switch (status) {
    case 'present': return styles.greenBadge;
    case 'late': return styles.amberBadge;
    case 'absent': return styles.redBadge;
    default: return styles.slateBadge;
  }
};

export default function ReportsPage() {
  const queryClient = useQueryClient();

  // ── Report Studio Mode ───────────────────────────────────────────────────────
  const [reportMode, setReportMode] = useState<'subject' | 'student' | 'attendance'>('subject');

  // ── 5-Level Cascading Hierarchy Filters ──────────────────────────────────────
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedBatch, setSelectedBatch] = useState<string>('all');
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');

  // Custom columns toggles for Subject & Student reports
  const [includeRubricBreakdown, setIncludeRubricBreakdown] = useState(true);
  const [includeTimestamps, setIncludeTimestamps] = useState(true);
  const [includeFeedbackNotes, setIncludeFeedbackNotes] = useState(true);

  // Session Attendance state
  const [sessionId, setSessionId] = useState<string>('');
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Server async report builder state
  const [reportKind, setReportKind] = useState('gradebook');
  const [audience, setAudience] = useState<'internal' | 'student'>('internal');
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [generating, setGenerating] = useState(false);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
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

  const selectedSectionSubjectIds = useMemo(() => sectionSubjects.filter(ss => {
    if (selectedDept !== 'all' && (ss.department_code || ss.department_name) !== selectedDept) return false;
    if (selectedYear !== 'all' && ss.academic_year !== selectedYear) return false;
    if (selectedBatch !== 'all' && ss.batch_id !== selectedBatch) return false;
    if (selectedSection !== 'all' && ss.section_id !== selectedSection) return false;
    if (selectedSubject && ss.subject_id !== selectedSubject) return false;
    return true;
  }).map(ss => ss.section_subject_id), [sectionSubjects, selectedDept, selectedYear, selectedBatch, selectedSection, selectedSubject]);

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

  // ── 2. Fetch Subject Grade Summary for Subject & Individual Student Reports ──
  const { data: gradeSummaryData, isLoading: loadingSummary } = useQuery({
    queryKey: ['instructor', 'subject-grade-summary', { subjectId: selectedSubject, sectionId: selectedSection }],
    queryFn: () => experimentService.getSubjectGradeSummary(
      selectedSubject,
      selectedSection !== 'all' ? selectedSection : undefined
    ),
    enabled: !!selectedSubject,
    staleTime: 30 * 1000,
  });

  const subjectStudents = useMemo(() => (gradeSummaryData?.students as any[]) ?? [], [gradeSummaryData]);

  useEffect(() => {
    if (subjectStudents.length > 0) {
      if (!selectedStudentId || !subjectStudents.some(s => s.student_id === selectedStudentId)) {
        setSelectedStudentId(subjectStudents[0].student_id);
      }
    }
  }, [subjectStudents, selectedStudentId]);

  const activeStudentReport = useMemo(() => {
    return subjectStudents.find(s => s.student_id === selectedStudentId) || null;
  }, [subjectStudents, selectedStudentId]);

  // ── 3. Sessions & Attendance Queries ─────────────────────────────────────────
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
      setAttendance(res.attendance || []);
    } catch {
      setError('Could not load attendance for this session.');
      setAttendance([]);
    } finally {
      setLoadingAttendance(false);
    }
  }, []);

  useEffect(() => {
    if (filteredSessions.length > 0 && (!sessionId || !filteredSessions.some(s => s.id === sessionId))) {
      setSessionId(filteredSessions[0].id);
      loadAttendance(filteredSessions[0].id);
    }
  }, [filteredSessions, sessionId, loadAttendance]);

  const { data: reportsData, isLoading: reportsLoading } = useQuery({
    queryKey: ['instructor', 'reports'],
    queryFn: () => experienceService.listReports(),
    staleTime: 30 * 1000,
    refetchInterval: query => query.state.data?.some(r => r.status === 'pending' || r.status === 'generating') ? 1500 : false,
  });

  useEffect(() => {
    if (reportsData) setReports(reportsData);
  }, [reportsData]);

  // ── Export Handlers ──────────────────────────────────────────────────────────
  const handleExportCustomSubjectCSV = () => {
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
        r[`#${e.exp_number} ${e.title} (Score)`] = sc ?? 'Not Submitted';
        if (includeRubricBreakdown && det) {
          r[`#${e.exp_number} Auto TC%`] = det.auto_grade ?? '—';
          r[`#${e.exp_number} Viva%`] = det.viva_grade ?? '—';
          r[`#${e.exp_number} Manual%`] = det.manual_grade ?? '—';
        }
        if (includeTimestamps && det) {
          r[`#${e.exp_number} Submitted At`] = det.submitted_at ? fmtDateTime(det.submitted_at) : '—';
        }
        if (includeFeedbackNotes && det?.manual_feedback) {
          r[`#${e.exp_number} Feedback`] = det.manual_feedback;
        }
      });
      r['Points Earned'] = s.points_earned ?? s.subject_score ?? '';
      r['Points Allocated'] = s.points_allocated ?? gradeSummaryData.subject.total_weightage ?? '';
      r['Percentage of Allocated Marks (%)'] = s.subject_percent ?? '';
      r['Course Marks Total'] = gradeSummaryData.subject.total_marks;
      r['Course Marks Not Yet Allocated'] = gradeSummaryData.subject.unallocated_marks ?? '';
      return r;
    });
    exportCSV(rows, `${gradeSummaryData.subject.code || 'subject'}-custom-report-${new Date().toISOString().slice(0, 10)}`);
    flash('Custom Subject Report CSV downloaded.');
  };

  const handleExportIndividualStudentCSV = () => {
    if (!gradeSummaryData || !activeStudentReport) return;
    const rows = gradeSummaryData.experiments.map(e => {
      const raw = activeStudentReport.experiment_scores?.[e.id];
      const det = activeStudentReport.experiment_details?.[e.id];
      const weighted = raw != null ? ((raw / (e.grade_scale || 100)) * (e.weightage || 0)).toFixed(2) : null;
      return {
        'Student Name': activeStudentReport.full_name,
        'Roll Number': activeStudentReport.roll_number || '',
        'Subject': `${gradeSummaryData.subject.name} (${gradeSummaryData.subject.code})`,
        'Assessment #': e.exp_number,
        'Assessment Title': e.title,
        'Type': e.delivery_mode === 'exam' ? 'Timed Exam' : 'Lab Experiment',
        'Weightage (pts)': e.weightage,
        'Raw Score': raw ?? (det?.submitted_at ? 'Submitted, not graded' : '—'),
        'Weighted Points': weighted ?? '—',
        'Auto Test Case Grade (%)': det?.auto_grade ?? '—',
        'Viva Grade (%)': det?.viva_grade ?? '—',
        'Manual Grade (%)': det?.manual_grade ?? '—',
        'Language': det?.language ?? '—',
        'Test Cases Passed': det?.test_cases_total ? `${det.test_cases_passed}/${det.test_cases_total}` : '—',
        'Submitted At': det?.submitted_at ? fmtDateTime(det.submitted_at) : '—',
        'Graded At': det?.graded_at ? fmtDateTime(det.graded_at) : '—',
        'Instructor Feedback': det?.manual_feedback ?? '',
      };
    });
    exportCSV(rows, `${activeStudentReport.roll_number || activeStudentReport.full_name}-${gradeSummaryData.subject.code}-dossier`);
    flash(`Individual report exported for ${activeStudentReport.full_name}.`);
  };

  const generateServerReport = async (kind = reportKind, extraParams: Record<string, unknown> = {}) => {
    setGenerating(true);
    try {
      const scopedIds = kind === 'cross_section'
        ? sectionSubjects.filter(ss =>
            (selectedDept === 'all' || (ss.department_code || ss.department_name) === selectedDept) &&
            (selectedYear === 'all' || ss.academic_year === selectedYear) &&
            (selectedBatch === 'all' || ss.batch_id === selectedBatch) &&
            ss.subject_id === selectedSubject
          ).map(ss => ss.section_subject_id)
        : selectedSectionSubjectIds;
      const params: Record<string, unknown> = {
        subject_id: selectedSubject || undefined,
        section_id: selectedSection !== 'all' && kind !== 'cross_section' ? selectedSection : undefined,
        section_subject_ids: scopedIds,
        section_subject_id: scopedIds.length === 1 ? scopedIds[0] : undefined,
      };
      if (kind === 'session_summary' || kind === 'viva_consolidated') params.session_id = sessionId || undefined;
      if (kind === 'student_progress') params.audience = audience;
      Object.assign(params, extraParams);
      const queued = await experienceService.requestReport(kind, params);
      flash(`Report ${queued.status === 'ready' ? 'ready' : 'queued'} — status will update here.`);
      queryClient.invalidateQueries({ queryKey: ['instructor', 'reports'] });
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Report generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  const downloadReport = async (id: string, fmt: 'csv' | 'xlsx' | 'pdf' = 'csv') => {
    try { await experienceService.downloadReport(id, fmt); }
    catch (e: any) { setError(e?.response?.data?.error || 'Download failed.'); }
  };

  const attendanceStats = useMemo(() => {
    let present = 0, late = 0, absent = 0, notRecorded = 0, credit = 0;
    for (const a of attendance) {
      if (a.status === 'present') { present++; credit += 1; }
      else if (a.status === 'late') { late++; credit += 0.8; }
      else if (a.status === 'partial') credit += 0.6;
      else if (a.status === 'inactive_present') credit += 0.5;
      else if (a.status === 'absent') absent++;
      else if (a.status === 'not_recorded') notRecorded++;
    }
    const recorded = attendance.length - notRecorded;
    return { present, late, absent, notRecorded, recorded,
      rate: recorded ? Math.round(credit / recorded * 100) : null };
  }, [attendance]);
  const { present, late, absent, notRecorded, recorded } = attendanceStats;

  const handleExportAttendanceCsv = () => {
    if (attendance.length === 0) return;
    const rows = attendance.map(a => ({
      'Full Name': a.full_name,
      'Roll Number': a.roll_number,
      'Email': a.email,
      'Attendance Status': a.status,
      'Joined At': a.joined_at ?? '',
    }));
    exportCSV(rows, `session-attendance-${sessionId.slice(0, 8)}`);
    flash('Session attendance CSV downloaded.');
  };

  return (
    <InstructorShell
      activePage="Reports"
      title="Custom Reports & Academic Dossier Studio"
      subtitle="Generate flexible subject gradebooks, individual student performance dossiers, and session attendance audits across your assigned classes."
    >
      {notice && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px 16px', borderRadius: 12, marginBottom: 18, color: '#166534', fontSize: 13.5, fontWeight: 600 }}>
          📊 {notice}
        </div>
      )}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: 12, marginBottom: 18, color: '#b91c1c', fontSize: 13.5, fontWeight: 600 }}>
          {error}
        </div>
      )}

      {/* ═══ 5-LEVEL CASCADING SCOPE FILTER BAR ═══ */}
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
            <select className={styles.select} style={{ width: '100%' }} value={selectedDept} onChange={e => { setSelectedDept(e.target.value); setSelectedYear('all'); setSelectedBatch('all'); setSelectedSection('all'); }}>
              <option value="all">All Departments</option>
              {departments.map(d => <option key={d.code} value={d.code}>{d.name} ({d.code})</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 5, textTransform: 'uppercase' }}>
              <Calendar size={12} color="#7c3aed" /> Academic Year
            </label>
            <select className={styles.select} style={{ width: '100%' }} value={selectedYear} onChange={e => { setSelectedYear(e.target.value); setSelectedBatch('all'); setSelectedSection('all'); }}>
              <option value="all">All Academic Years</option>
              {academicYears.map(yr => <option key={yr} value={yr}>{yr}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 5, textTransform: 'uppercase' }}>
              <Layers size={12} color="#7c3aed" /> Batch
            </label>
            <select className={styles.select} style={{ width: '100%' }} value={selectedBatch} onChange={e => { setSelectedBatch(e.target.value); setSelectedSection('all'); }}>
              <option value="all">All Batches ({availableBatches.length})</option>
              {availableBatches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 5, textTransform: 'uppercase' }}>
              <Users size={12} color="#7c3aed" /> Section
            </label>
            <select className={styles.select} style={{ width: '100%' }} value={selectedSection} onChange={e => setSelectedSection(e.target.value)}>
              <option value="all">All Sections ({availableSections.length})</option>
              {availableSections.map(s => <option key={s.section_id} value={s.section_id}>Section {s.section_name} {s.batch_name ? `(${s.batch_name})` : ''}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 5, textTransform: 'uppercase' }}>
              <BookOpen size={12} color="#7c3aed" /> Subject
            </label>
            <select className={styles.select} style={{ width: '100%' }} value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}>
              {availableSubjects.map(s => <option key={s.subject_id} value={s.subject_id}>{s.subject_name} ({s.subject_code})</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ═══ REPORT MODE SELECTOR TABS ═══ */}
      <div className={styles.tabRow} style={{ marginBottom: 18 }}>
        <button
          type="button"
          className={`${styles.tabChip} ${reportMode === 'subject' ? styles.tabChipActive : ''}`}
          onClick={() => setReportMode('subject')}
        >
          <Table size={14} /> Subject & Section Custom Reports
        </button>
        <button
          type="button"
          className={`${styles.tabChip} ${reportMode === 'student' ? styles.tabChipActive : ''}`}
          onClick={() => setReportMode('student')}
        >
          <UserCheck size={14} /> Individual Student Report Dossier
        </button>
        <button
          type="button"
          className={`${styles.tabChip} ${reportMode === 'attendance' ? styles.tabChipActive : ''}`}
          onClick={() => setReportMode('attendance')}
        >
          <Clock size={14} /> Session Attendance Register
        </button>
      </div>

      {/* ═══ MODE 1: SUBJECT & SECTION CUSTOM REPORT BUILDER ═══ */}
      {reportMode === 'subject' && (
        <>
          <div className={styles.sectionCard} style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
              <div>
                <h2 className={styles.sectionTitle}>Custom Subject Gradebook & Rubric Report</h2>
                <p className={styles.sectionSub}>Configure included columns and export CSV or print to PDF. Scores show earned points against marks currently allocated.</p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className={styles.secondaryBtn} onClick={() => window.print()}>
                  <Printer size={14} /> Print / Save PDF
                </button>
                <button type="button" className={styles.primaryBtn} onClick={handleExportCustomSubjectCSV} disabled={!gradeSummaryData}>
                  <Download size={14} /> Export Custom Subject CSV
                </button>
              </div>
            </div>

            {/* Custom Column Checkboxes */}
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', padding: '10px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                <input type="checkbox" checked={includeRubricBreakdown} onChange={e => setIncludeRubricBreakdown(e.target.checked)} />
                Include Rubric Breakdown (Auto / Viva / Manual)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                <input type="checkbox" checked={includeTimestamps} onChange={e => setIncludeTimestamps(e.target.checked)} />
                Include Submission Timestamps
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                <input type="checkbox" checked={includeFeedbackNotes} onChange={e => setIncludeFeedbackNotes(e.target.checked)} />
                Include Instructor Feedback Comments
              </label>
            </div>

            {gradeSummaryData && (
              <p className={styles.sectionSub} style={{ margin: '0 0 12px' }}>
                {gradeSummaryData.subject.total_weightage.toFixed(1)} of {gradeSummaryData.subject.total_marks} course marks currently allocated
                {gradeSummaryData.subject.unallocated_marks != null ? ` · ${gradeSummaryData.subject.unallocated_marks} not yet allocated` : ''}.
                {' '}Percentages are based on allocated marks, not the full course total.
              </p>
            )}
            {loadingSummary ? (
              <p className={styles.sectionSub}>Loading subject report preview…</p>
            ) : !gradeSummaryData ? (
              <p className={styles.sectionSub}>Select a subject above to preview the report.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Student & Roll No.</th>
                      {gradeSummaryData.experiments.map(e => (
                        <th key={e.id} style={{ textAlign: 'center' }}>
                          #{e.exp_number} {e.title.slice(0, 18)} ({e.weightage}p)
                        </th>
                      ))}
                      <th style={{ textAlign: 'right' }}>Points Earned / Allocated</th>
                      <th style={{ textAlign: 'right' }}>Dossier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(gradeSummaryData.students as any[]).map(s => {
                      const pointsEarned = s.points_earned ?? s.subject_score ?? null;
                      const pointsAllocated = s.points_allocated ?? gradeSummaryData.subject.total_weightage ?? null;
                      const pct = s.subject_percent ?? null;
                      return (
                        <tr key={s.student_id}>
                          <td>
                            <div className={styles.tdStrong}>{s.full_name}</div>
                            <div style={{ fontSize: 11.5, color: '#64748b' }}>{s.roll_number || '—'}</div>
                          </td>
                          {gradeSummaryData.experiments.map(e => {
                            const sc = s.experiment_scores?.[e.id];
                            const det = s.experiment_details?.[e.id];
                            return (
                              <td key={e.id} style={{ textAlign: 'center' }}>
                                <div style={{ fontWeight: 700, fontSize: 13 }}>{sc != null ? `${sc}/${e.grade_scale}` : '—'}</div>
                                {includeRubricBreakdown && det && (
                                  <div style={{ fontSize: 10.5, color: '#64748b' }}>
                                    TC:{det.auto_grade ?? '–'} · V:{det.viva_grade ?? '–'} · M:{det.manual_grade ?? '–'}
                                  </div>
                                )}
                                {includeTimestamps && det?.submitted_at && (
                                  <div style={{ fontSize: 10, color: '#94a3b8' }}>{fmtDate(det.submitted_at)}</div>
                                )}
                              </td>
                            );
                          })}
                          <td style={{ textAlign: 'right', fontWeight: 800 }}>
                            {pointsEarned == null || pointsAllocated == null ? '—' : `${pointsEarned.toFixed(2)} / ${pointsAllocated.toFixed(2)}`}
                            <div style={{ fontSize: 10.5, fontWeight: 600, color: '#64748b' }}>
                              {pct == null ? 'No marks allocated' : `${pct.toFixed(1)}% of allocated marks`}
                            </div>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              className={styles.ghostBtn}
                              style={{ fontSize: 11.5, padding: '4px 8px' }}
                              onClick={() => {
                                setSelectedStudentId(s.student_id);
                                setReportMode('student');
                              }}
                            >
                              Student Report &rarr;
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

          {/* Async Server-Side Multi-Format Exporter (CSV / XLSX) */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Server Batch Report Generator (CSV & Excel .XLSX)</h2>
                <p className={styles.sectionSub}>Generate specialized audit workbooks for department submission</p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select className={styles.select} value={reportKind} onChange={e => setReportKind(e.target.value)} style={{ width: 'auto', minWidth: 210 }}>
                  {REPORT_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
                {reportKind === 'student_progress' && (
                  <select className={styles.select} value={audience} onChange={e => setAudience(e.target.value as 'internal' | 'student')} style={{ width: 'auto' }}>
                    <option value="internal">Internal (Full Integrity Detail)</option>
                    <option value="student">Student-Facing (Motivational)</option>
                  </select>
                )}
                <button className={styles.primaryBtn} onClick={() => generateServerReport()} disabled={generating}>
                  {generating ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                  Generate Workbook
                </button>
              </div>
            </div>

          </div>
        </>
      )}

      {/* ═══ MODE 2: INDIVIDUAL STUDENT CUSTOM REPORT DOSSIER ═══ */}
      {reportMode === 'student' && (
        <div className={styles.sectionCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Select Student:</label>
              <select
                className={styles.select}
                style={{ minWidth: 280 }}
                value={selectedStudentId}
                onChange={e => setSelectedStudentId(e.target.value)}
              >
                {subjectStudents.map(s => (
                  <option key={s.student_id} value={s.student_id}>
                    {s.full_name} ({s.roll_number || 'No Roll'}) — {s.subject_score.toFixed(1)} pts
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className={styles.secondaryBtn} onClick={() => window.print()}>
                <Printer size={14} /> Print / Save Student PDF Dossier
              </button>
              <button type="button" className={styles.primaryBtn} onClick={handleExportIndividualStudentCSV} disabled={!activeStudentReport}>
                <Download size={14} /> Export Student CSV
              </button>
              <button type="button" className={styles.ghostBtn}
                onClick={() => generateServerReport('student_progress', { student_id: selectedStudentId })}
                disabled={!activeStudentReport || generating}>
                {generating ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                Generate XLSX / PDF dossier
              </button>
            </div>
          </div>

          {!activeStudentReport || !gradeSummaryData ? (
            <p className={styles.sectionSub}>Select a subject and student to generate their custom academic dossier.</p>
          ) : (
            <div>
              {/* Student Dossier Header Banner */}
              <div style={{
                background: 'linear-gradient(135deg, #f8fafc, #f5f3ff)',
                border: '1px solid #ddd6fe',
                borderRadius: 14,
                padding: '18px 22px',
                marginBottom: 18,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 16,
              }}>
                <div>
                  <span className={`${styles.pill} ${styles.pillBlue}`} style={{ marginBottom: 6 }}>
                    Official Individual Student Assessment Report
                  </span>
                  <h3 style={{ margin: '4px 0 2px', fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
                    {activeStudentReport.full_name}
                  </h3>
                  <p style={{ margin: 0, fontSize: 13, color: '#475569' }}>
                    Roll Number: <strong>{activeStudentReport.roll_number || '—'}</strong>
                    {activeStudentReport.email ? ` · Email: ${activeStudentReport.email}` : ''}
                    {' · '}Subject: <strong>{gradeSummaryData.subject.name} ({gradeSummaryData.subject.code})</strong>
                  </p>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Points on allocated marks</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: '#7c3aed' }}>
                    {(activeStudentReport.points_earned ?? activeStudentReport.subject_score).toFixed(2)} / {(activeStudentReport.points_allocated ?? gradeSummaryData.subject.total_weightage).toFixed(2)}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>
                    {activeStudentReport.subject_percent == null
                      ? 'No marks allocated yet'
                      : `${activeStudentReport.subject_percent.toFixed(1)}% of allocated marks`}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                    {gradeSummaryData.subject.total_weightage.toFixed(1)} of {gradeSummaryData.subject.total_marks} course marks allocated
                  </div>
                </div>
              </div>

              {/* Detailed Experiment-by-Experiment Table */}
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Experiment / Exam Title</th>
                    <th>Status & Submission Date</th>
                    <th>Language & Test Cases</th>
                    <th>Rubric Breakdown (Auto / Viva / Manual)</th>
                    <th>Raw Score</th>
                    <th>Weighted Pts</th>
                    <th>Instructor Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {gradeSummaryData.experiments.map(e => {
                    const raw = activeStudentReport.experiment_scores?.[e.id];
                    const det = activeStudentReport.experiment_details?.[e.id];
                    const hasScore = raw !== undefined && raw !== null;
                    const weighted = hasScore ? ((raw / (e.grade_scale || 100)) * (e.weightage || 0)) : 0;
                    return (
                      <tr key={e.id}>
                        <td style={{ fontWeight: 700 }}>#{e.exp_number}</td>
                        <td>
                          <div className={styles.tdStrong}>{e.title}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            {e.delivery_mode === 'exam' ? 'Timed Exam' : 'Lab Experiment'} · Weight: {e.weightage} pts
                          </div>
                        </td>
                        <td>
                          {det?.submitted_at ? (
                            <div>
                              <span className={`${styles.pill} ${styles.pillGreen}`} style={{ fontSize: 10.5 }}>Submitted</span>
                              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{fmtDateTime(det.submitted_at)}</div>
                            </div>
                          ) : det?.graded_at ? (
                            <div>
                              <span className={`${styles.pill} ${styles.pillAmber}`} style={{ fontSize: 10.5 }}>Graded · submission time unavailable</span>
                              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Graded {fmtDateTime(det.graded_at)}</div>
                            </div>
                          ) : (
                            <span className={`${styles.pill} ${styles.pillSlate}`} style={{ fontSize: 10.5 }}>No submission recorded</span>
                          )}
                        </td>
                        <td>
                          {det?.test_cases_total ? (
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1e293b' }}>
                              {det.language || 'code'} · {det.test_cases_passed}/{det.test_cases_total} TC
                            </span>
                          ) : '—'}
                        </td>
                        <td>
                          {det ? (
                            <div style={{ fontSize: 11.5, color: '#334155' }}>
                              Auto: <strong>{det.auto_grade ?? '—'}%</strong> · Viva: <strong>{det.viva_grade ?? '—'}%</strong> · Manual: <strong>{det.manual_grade ?? '—'}%</strong>
                            </div>
                          ) : '—'}
                        </td>
                        <td style={{ fontWeight: 800, color: '#0f172a' }}>
                          {hasScore ? `${raw} / ${e.grade_scale}` : '—'}
                        </td>
                        <td style={{ fontWeight: 700, color: '#059669' }}>
                          +{weighted.toFixed(1)} pts
                        </td>
                        <td style={{ fontSize: 12, color: '#475569', maxWidth: 220 }}>
                          {det?.manual_feedback || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ MODE 3: SESSION ATTENDANCE REGISTER ═══ */}
      {reportMode === 'attendance' && (
        <>
          <div className={styles.actionRow}>
            <div className={styles.formGroup} style={{ marginBottom: 0, minWidth: 'min(380px, 100%)', flex: 1 }}>
              <label className={styles.formLabel}>Lab Session (Filtered by Subject & Section)</label>
              <select
                className={styles.select}
                value={sessionId}
                onChange={(e) => {
                  setSessionId(e.target.value);
                  loadAttendance(e.target.value);
                }}
                disabled={loadingSessions}
              >
                {filteredSessions.length === 0 && <option value="">No sessions matching filter</option>}
                {filteredSessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.experiment_title}
                    {s.section_name ? ` · Section ${s.section_name}` : ''} · {fmtDate(s.scheduled_at)}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, alignSelf: 'flex-end' }}>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={handleExportAttendanceCsv}
                disabled={attendance.length === 0 || exporting}
              >
                <Download size={16} /> Export Attendance CSV
              </button>
            </div>
          </div>

          <div className={styles.kpiRow}>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Enrolled</p>
              <p className={styles.kpiValue} style={{ color: '#7c3aed' }}>{attendance.length}</p>
              <p className={styles.kpiSub}>Students in this session</p>
            </div>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Attendance Recorded</p>
              <p className={styles.kpiValue} style={{ color: '#334155' }}>{recorded} / {attendance.length}</p>
              <p className={styles.kpiSub}>Saved attendance entries</p>
            </div>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Present / Late</p>
              <p className={styles.kpiValue} style={{ color: '#16a34a' }}>{present + late}</p>
              <p className={styles.kpiSub}>{present} present · {late} late</p>
            </div>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Explicitly Absent</p>
              <p className={styles.kpiValue} style={{ color: '#b91c1c' }}>{absent}</p>
              <p className={styles.kpiSub}>Absence saved in the record</p>
            </div>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Not Recorded</p>
              <p className={styles.kpiValue} style={{ color: '#64748b' }}>{notRecorded}</p>
              <p className={styles.kpiSub}>Not counted as absent</p>
            </div>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Rate of Recorded Attendance</p>
              <p className={styles.kpiValue} style={{ color: '#7c3aed' }}>
                {attendanceStats.rate == null ? '—' : `${attendanceStats.rate}%`}
              </p>
              <p className={styles.kpiSub}>Weighted rate among recorded statuses</p>
            </div>
          </div>

          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Session Attendance Ledger</h2>
                <p className={styles.sectionSub}>Saved attendance and join times. Missing records are shown as Not Recorded, not inferred absent.</p>
              </div>
            </div>

            {loadingAttendance ? (
              <p className={styles.sectionSub}>Loading attendance…</p>
            ) : attendance.length === 0 ? (
              <p className={styles.sectionSub}>No attendance records for this session yet.</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Roll No.</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Joined At</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.map((a) => (
                    <tr key={a.student_id}>
                      <td><span className={styles.tdStrong}>{a.full_name}</span></td>
                      <td>{a.roll_number || '—'}</td>
                      <td>{a.email || '—'}</td>
                      <td><span className={`${styles.badge} ${statusBadge(a.status)}`}>{a.status}</span></td>
                      <td>{fmtDateTime(a.joined_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      <section className={styles.sectionCard} style={{ marginTop: 18 }}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Generated Reports</h2>
            <p className={styles.sectionSub}>Server-built files are listed here when their status changes to Ready. Each report can be downloaded as CSV, Excel (.xlsx), or PDF.</p>
          </div>
        </div>
        {reportsLoading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : reports.length > 0 ? (
          <div className={styles.list}>
            {reports.slice(0, 8).map(r => (
              <div key={r.id} className={styles.listRow}>
                <div className={styles.rowBody}>
                  <div className={styles.rowTitle}>{r.kind.replace(/_/g, ' ').toUpperCase()}</div>
                  <div className={styles.rowMeta}>{r.created_at ?? '—'} · {r.status}{r.error ? ` · ${r.error}` : ''}</div>
                </div>
                <div className={styles.rowSide} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span className={`${styles.badge} ${r.status === 'ready' ? styles.greenBadge : r.status === 'failed' ? styles.redBadge : styles.amberBadge}`}>{r.status}</span>
                  {r.status === 'ready' && r.id && (
                    <>
                      <button className={styles.secondaryBtn} onClick={() => downloadReport(r.id, 'csv')} style={{ padding: '6px 12px', minHeight: 0, fontSize: 12 }}><Download size={12} /> CSV</button>
                      <button className={styles.ghostBtn} onClick={() => downloadReport(r.id, 'xlsx')} style={{ padding: '6px 12px', minHeight: 0, fontSize: 12 }}><Download size={12} /> XLSX</button>
                      <button className={styles.ghostBtn} onClick={() => downloadReport(r.id, 'pdf')} style={{ padding: '6px 12px', minHeight: 0, fontSize: 12 }}><Download size={12} /> PDF</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.sectionSub}>No server-generated reports yet. Create one from the Subject report or individual dossier view.</p>
        )}
      </section>
    </InstructorShell>
  );
}
