'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Award, Download, X, Pencil, CheckCircle2,
  Calendar, Layers, BookOpen, FlaskConical, Clock,
  User, Check, AlertCircle, TrendingUp, Activity,
  ChevronRight, ExternalLink, Filter, Sparkles,
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import { sessionService } from '@/services/session.service';
import styles from '../shared.module.css';
import sStyles from './students.module.css';

// ── Types for Cascading Filter Tree ──────────────────────────────────────────
interface AcademicYearItem {
  id: string;
  year_label: string;
  is_active: boolean;
}

interface SectionItem {
  id: string;
  name: string;
  section_code: string;
  batch_id: string;
  batch_name: string;
  year_id: string | null;
}

interface SectionSubjectItem {
  section_subject_id: string;
  section_id: string;
  subject_id: string;
  name: string;
  code: string;
  icon: string;
}

interface ExperimentItem {
  id: string;
  subject_id: string;
  exp_number: number;
  title: string;
}

interface FilterSessionItem {
  id: string;
  title: string;
  scheduled_at: string | null;
  duration_minutes: number;
  status: 'scheduled' | 'active' | 'ended';
  experiment_id: string;
  section_subject_id: string;
  section_id: string | null;
  subject_id: string | null;
}

interface AttendanceRow {
  student_id: string;
  status: string;          // present | absent | late | partial | inactive_present
  joined_at: string | null;
  total_time_seconds: number;
  is_active_participant: boolean;
  override_reason: string | null;
  full_name: string;
  roll_number: string;
  email: string;
  focus_score: number | null;
}

interface StudentHistoryRecord {
  session_id: string;
  session_title: string;
  scheduled_at: string | null;
  session_status: string;
  duration_minutes: number;
  subject_name: string;
  subject_code: string;
  experiment_title: string;
  exp_number: number | null;
  section_name: string;
  status: string;
  joined_at: string | null;
  total_time_seconds: number;
  focus_score: number | null;
  override_reason: string | null;
}

interface StudentDetailDossier {
  student: {
    id: string;
    full_name: string;
    roll_number: string;
    email: string;
    section_name: string;
    batch_name: string;
  };
  summary: {
    total_sessions: number;
    past_sessions: number;
    attended: number;
    attendance_rate: number;
    avg_focus_score: number | null;
    breakdown: Record<string, number>;
  };
  history: StudentHistoryRecord[];
}

const STATUS_OPTIONS = ['present', 'absent', 'late', 'partial', 'inactive_present'];

const statusPill = (status: string) => {
  switch (status) {
    case 'present': return styles.pillGreen;
    case 'late': return styles.pillAmber;
    case 'partial': return styles.pillBlue;
    case 'inactive_present': return styles.pillBlue;
    default: return styles.pillSlate; // absent
  }
};

const focusScoreBadge = (score: number | null) => {
  if (score === null || score === undefined) return <span className={sStyles.focusEmpty}>—</span>;
  let cls = sStyles.focusNormal;
  if (score >= 75) {
    cls = sStyles.focusHigh;
  } else if (score >= 50) {
    cls = sStyles.focusModerate;
  } else {
    cls = sStyles.focusLow;
  }
  return (
    <span className={`${sStyles.focusGauge} ${cls}`}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
      {score}%
    </span>
  );
};

const errText = (err: unknown) =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error
  || 'Something went wrong';

export default function StudentsPage() {
  const router = useRouter();

  // ── Cascading Data Tree ───────────────────────────────────────────────────
  const [treeLoading, setTreeLoading] = useState(true);
  const [academicYears, setAcademicYears] = useState<AcademicYearItem[]>([]);
  const [allSections, setAllSections] = useState<SectionItem[]>([]);
  const [allSectionSubjects, setAllSectionSubjects] = useState<SectionSubjectItem[]>([]);
  const [allExperiments, setAllExperiments] = useState<ExperimentItem[]>([]);
  const [allSessions, setAllSessions] = useState<FilterSessionItem[]>([]);

  // ── Selected Filter State ─────────────────────────────────────────────────
  const [selectedYearId, setSelectedYearId] = useState<string>('');
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [selectedExperimentId, setSelectedExperimentId] = useState<string>('');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');

  // ── Session Roster & Stats ────────────────────────────────────────────────
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [avgFocusScore, setAvgFocusScore] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // ── Attendance Override Modal ─────────────────────────────────────────────
  const [overrideTarget, setOverrideTarget] = useState<AttendanceRow | null>(null);
  const [overrideStatus, setOverrideStatus] = useState('present');
  const [overrideReason, setOverrideReason] = useState('');
  const [busy, setBusy] = useState(false);

  // ── Student Drill-down Drawer ─────────────────────────────────────────────
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);
  const [studentDossier, setStudentDossier] = useState<StudentDetailDossier | null>(null);
  const [dossierLoading, setDossierLoading] = useState(false);

  // ── Global Student Search Autocomplete ────────────────────────────────────
  const [globalSearch, setGlobalSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{
    id: string; full_name: string; roll_number: string; email: string; section_name: string;
  }>>([]);
  const [searchFocused, setSearchFocused] = useState(false);

  const toast3 = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // ── 1. Fetch complete Filter Tree on mount ────────────────────────────────
  useEffect(() => {
    (async () => {
      setTreeLoading(true);
      try {
        const res = await sessionService.getAttendanceFilterTree();
        const years: AcademicYearItem[] = res.years ?? [];
        const secs: SectionItem[] = res.sections ?? [];
        const ssList: SectionSubjectItem[] = res.section_subjects ?? [];
        const exps: ExperimentItem[] = res.experiments ?? [];
        const sessList: FilterSessionItem[] = res.sessions ?? [];

        setAcademicYears(years);
        setAllSections(secs);
        setAllSectionSubjects(ssList);
        setAllExperiments(exps);
        setAllSessions(sessList);

        // Pre-select Active Academic Year
        const activeY = years.find((y) => y.is_active) || years[0];
        const yrId = activeY ? activeY.id : '';
        setSelectedYearId(yrId);

        // Pre-select Section matching year
        const availableSecs = secs.filter((s) => !yrId || s.year_id === yrId);
        const secId = availableSecs.length > 0 ? availableSecs[0].id : (secs[0]?.id ?? '');
        setSelectedSectionId(secId);

        // Pre-select Subject matching section
        const availableSubjs = ssList.filter((item) => item.section_id === secId);
        const subjId = availableSubjs.length > 0 ? availableSubjs[0].subject_id : (ssList[0]?.subject_id ?? '');
        setSelectedSubjectId(subjId);

        // Pre-select Experiment matching subject
        const availableExps = exps.filter((e) => e.subject_id === subjId);
        const expId = availableExps.length > 0 ? availableExps[0].id : (exps[0]?.id ?? '');
        setSelectedExperimentId(expId);

        // Pre-select Session matching experiment & section
        const matchedSessions = sessList.filter((s) =>
          s.experiment_id === expId && (!secId || s.section_id === secId)
        );
        const activeOrFirstSess = matchedSessions.find((s) => s.status === 'active')
          || matchedSessions[0]
          || sessList[0];
        if (activeOrFirstSess) {
          setSelectedSessionId(activeOrFirstSess.id);
        }
      } catch (err) {
        toast3(errText(err));
      } finally {
        setTreeLoading(false);
      }
    })();
  }, []);

  // ── Cascading Options Derived State ───────────────────────────────────────
  const availableSections = useMemo(() => {
    if (!selectedYearId) return allSections;
    return allSections.filter((s) => s.year_id === selectedYearId);
  }, [allSections, selectedYearId]);

  const availableSubjects = useMemo(() => {
    if (!selectedSectionId) return allSectionSubjects;
    return allSectionSubjects.filter((ss) => ss.section_id === selectedSectionId);
  }, [allSectionSubjects, selectedSectionId]);

  const availableExperiments = useMemo(() => {
    if (!selectedSubjectId) return allExperiments;
    return allExperiments.filter((e) => e.subject_id === selectedSubjectId);
  }, [allExperiments, selectedSubjectId]);

  const availableSessions = useMemo(() => {
    return allSessions.filter((s) => {
      const matchExp = !selectedExperimentId || s.experiment_id === selectedExperimentId;
      const matchSec = !selectedSectionId || s.section_id === selectedSectionId;
      return matchExp && matchSec;
    });
  }, [allSessions, selectedExperimentId, selectedSectionId]);

  // ── Cascading Handlers ────────────────────────────────────────────────────
  const handleYearChange = (yearId: string) => {
    setSelectedYearId(yearId);
    const secs = allSections.filter((s) => !yearId || s.year_id === yearId);
    const firstSec = secs[0]?.id ?? '';
    setSelectedSectionId(firstSec);

    const subjs = allSectionSubjects.filter((ss) => ss.section_id === firstSec);
    const firstSubj = subjs[0]?.subject_id ?? '';
    setSelectedSubjectId(firstSubj);

    const exps = allExperiments.filter((e) => e.subject_id === firstSubj);
    const firstExp = exps[0]?.id ?? '';
    setSelectedExperimentId(firstExp);

    const sess = allSessions.filter((s) => s.experiment_id === firstExp && (!firstSec || s.section_id === firstSec));
    setSelectedSessionId(sess[0]?.id ?? '');
  };

  const handleSectionChange = (sectionId: string) => {
    setSelectedSectionId(sectionId);
    const subjs = allSectionSubjects.filter((ss) => ss.section_id === sectionId);
    const firstSubj = subjs[0]?.subject_id ?? '';
    setSelectedSubjectId(firstSubj);

    const exps = allExperiments.filter((e) => e.subject_id === firstSubj);
    const firstExp = exps[0]?.id ?? '';
    setSelectedExperimentId(firstExp);

    const sess = allSessions.filter((s) => s.experiment_id === firstExp && s.section_id === sectionId);
    setSelectedSessionId(sess[0]?.id ?? '');
  };

  const handleSubjectChange = (subjectId: string) => {
    setSelectedSubjectId(subjectId);
    const exps = allExperiments.filter((e) => e.subject_id === subjectId);
    const firstExp = exps[0]?.id ?? '';
    setSelectedExperimentId(firstExp);

    const sess = allSessions.filter((s) => s.experiment_id === firstExp && (!selectedSectionId || s.section_id === selectedSectionId));
    setSelectedSessionId(sess[0]?.id ?? '');
  };

  const handleExperimentChange = (expId: string) => {
    setSelectedExperimentId(expId);
    const sess = allSessions.filter((s) => s.experiment_id === expId && (!selectedSectionId || s.section_id === selectedSectionId));
    setSelectedSessionId(sess[0]?.id ?? '');
  };

  // ── Load Attendance for Selected Session ──────────────────────────────────
  useEffect(() => {
    if (!selectedSessionId) {
      setRows([]);
      setSummary({});
      setAvgFocusScore(null);
      return;
    }
    let mounted = true;
    setLoading(true);
    (async () => {
      try {
        const [att, sum] = await Promise.all([
          sessionService.getAttendance(selectedSessionId),
          sessionService.getAttendanceSummary(selectedSessionId),
        ]);
        if (!mounted) return;
        setRows(att.attendance ?? []);
        setAvgFocusScore(att.avg_focus_score ?? null);
        setSummary(sum.breakdown ?? {});
      } catch (err) {
        if (mounted) toast3(errText(err));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [selectedSessionId]);

  // ── Single Student Drill-down Loader ──────────────────────────────────────
  const openStudentDossier = async (studentId: string) => {
    setActiveStudentId(studentId);
    setDossierLoading(true);
    try {
      const data = await sessionService.getStudentAttendanceHistory(studentId);
      setStudentDossier(data);
    } catch (err) {
      toast3(errText(err));
      setActiveStudentId(null);
    } finally {
      setDossierLoading(false);
    }
  };

  // ── Global Search Autocomplete ────────────────────────────────────
  useEffect(() => {
    if (!globalSearch.trim() || globalSearch.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await sessionService.searchAttendanceStudents(globalSearch.trim());
        setSearchResults(res.students ?? []);
      } catch {
        setSearchResults([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [globalSearch]);

  const filtered = rows.filter((r) => {
    const q = searchQuery.toLowerCase();
    const matchSearch = r.full_name.toLowerCase().includes(q) || r.roll_number.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'All' || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleOverride = async () => {
    if (!overrideTarget || !selectedSessionId) return;
    setBusy(true);
    try {
      await sessionService.overrideAttendance(
        selectedSessionId, overrideTarget.student_id, overrideStatus,
        overrideReason || 'Manual override by instructor'
      );
      toast3('Attendance updated successfully');
      setRows((prev) => prev.map((r) =>
        r.student_id === overrideTarget.student_id
          ? { ...r, status: overrideStatus, override_reason: overrideReason || 'Manual override by instructor' }
          : r
      ));
      setOverrideTarget(null);
      setOverrideReason('');
      const sum = await sessionService.getAttendanceSummary(selectedSessionId);
      setSummary(sum.breakdown ?? {});
    } catch (err) {
      toast3(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    if (!selectedSessionId) return;
    try {
      await sessionService.exportAttendanceCsv(selectedSessionId);
      toast3('Attendance CSV exported successfully');
    } catch {
      toast3('CSV export failed');
    }
  };

  // Selected session object lookup
  const currentSessionObj = allSessions.find((s) => s.id === selectedSessionId);

  // Present/Late calculations for KPI
  const presentCount = (summary['present'] ?? 0) + (summary['late'] ?? 0);
  const totalEnrolled = rows.length;
  const attendanceRate = totalEnrolled > 0 ? Math.round((presentCount / totalEnrolled) * 100) : 0;

  return (
    <InstructorShell
      activePage="Students"
      title="Student Attendance Management"
      subtitle="Hierarchical session register, live focus score tracking, and comprehensive student attendance records"
    >
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1000, background: '#201b2e',
          color: '#fff', padding: '12px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          boxShadow: '0 8px 30px rgba(0,0,0,0.2)'
        }}>
          {toast}
        </div>
      )}

      <div className={sStyles.pageContainer}>

        {/* ── 1. CASCADING HIERARCHICAL CONTROLS ────────────────────────────── */}
        <section className={sStyles.cascadeCard}>
          <div className={sStyles.cascadeHeader}>
            <div className={sStyles.cascadeTitle}>
              <Layers size={17} color="#7c3aed" />
              <span>Hierarchical Class & Session Navigator</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className={sStyles.cascadeBadge}>
                Academic Year → Section → Subject → Experiment → Session
              </span>
            </div>
          </div>

          <div className={sStyles.cascadeGrid}>
            {/* 1. Academic Year */}
            <div className={sStyles.filterGroup}>
              <label className={sStyles.filterLabel}>
                <Calendar size={12} /> Academic Year
              </label>
              <select
                className={sStyles.filterSelect}
                value={selectedYearId}
                onChange={(e) => handleYearChange(e.target.value)}
                disabled={treeLoading}
              >
                {academicYears.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.year_label} {y.is_active ? '● Current' : ''}
                  </option>
                ))}
                {academicYears.length === 0 && <option value="">No years found</option>}
              </select>
            </div>

            {/* 2. Section */}
            <div className={sStyles.filterGroup}>
              <label className={sStyles.filterLabel}>
                <Layers size={12} /> Section / Batch
              </label>
              <select
                className={sStyles.filterSelect}
                value={selectedSectionId}
                onChange={(e) => handleSectionChange(e.target.value)}
                disabled={treeLoading || availableSections.length === 0}
              >
                {availableSections.map((sec) => (
                  <option key={sec.id} value={sec.id}>
                    {sec.batch_name ? `${sec.batch_name} — ` : ''}Sec {sec.name}
                  </option>
                ))}
                {availableSections.length === 0 && <option value="">No sections in this year</option>}
              </select>
            </div>

            {/* 3. Subject / Course */}
            <div className={sStyles.filterGroup}>
              <label className={sStyles.filterLabel}>
                <BookOpen size={12} /> Subject / Course
              </label>
              <select
                className={sStyles.filterSelect}
                value={selectedSubjectId}
                onChange={(e) => handleSubjectChange(e.target.value)}
                disabled={treeLoading || availableSubjects.length === 0}
              >
                {availableSubjects.map((ss) => (
                  <option key={ss.subject_id} value={ss.subject_id}>
                    {ss.code ? `[${ss.code}] ` : ''}{ss.name}
                  </option>
                ))}
                {availableSubjects.length === 0 && <option value="">No subjects assigned</option>}
              </select>
            </div>

            {/* 4. Experiment / Lab */}
            <div className={sStyles.filterGroup}>
              <label className={sStyles.filterLabel}>
                <FlaskConical size={12} /> Experiment / Lab
              </label>
              <select
                className={sStyles.filterSelect}
                value={selectedExperimentId}
                onChange={(e) => handleExperimentChange(e.target.value)}
                disabled={treeLoading || availableExperiments.length === 0}
              >
                {availableExperiments.map((exp) => (
                  <option key={exp.id} value={exp.id}>
                    Exp {exp.exp_number}: {exp.title}
                  </option>
                ))}
                {availableExperiments.length === 0 && <option value="">No experiments configured</option>}
              </select>
            </div>
          </div>

          {/* 5. Session Selector Strip (Multiple sessions per experiment supported) */}
          <div className={sStyles.sessionStrip}>
            <div className={sStyles.sessionLabelRow}>
              <label className={sStyles.filterLabel}>
                <Clock size={12} /> Lab Sessions for this Experiment ({availableSessions.length})
              </label>
              <span style={{ fontSize: 12, color: '#6b7280' }}>
                One experiment may span multiple scheduled or makeup sessions
              </span>
            </div>

            <div className={sStyles.sessionPillsContainer}>
              {availableSessions.map((sess, idx) => {
                const isSelected = sess.id === selectedSessionId;
                const dotClass = sess.status === 'active'
                  ? sStyles.dotActive
                  : (sess.status === 'ended' ? sStyles.dotEnded : sStyles.dotScheduled);
                const dateLabel = sess.scheduled_at
                  ? new Date(sess.scheduled_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                  : '';
                const timeLabel = sess.scheduled_at
                  ? new Date(sess.scheduled_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                  : '';

                return (
                  <button
                    key={sess.id}
                    type="button"
                    className={`${sStyles.sessionPill} ${isSelected ? sStyles.sessionPillActive : ''}`}
                    onClick={() => setSelectedSessionId(sess.id)}
                  >
                    <span className={`${sStyles.sessionStatusDot} ${dotClass}`} />
                    <span>Run #{idx + 1}: {sess.title}</span>
                    <span style={{ opacity: 0.65, fontSize: 11 }}>
                      {dateLabel} {timeLabel}
                    </span>
                  </button>
                );
              })}

              {availableSessions.length === 0 && (
                <span style={{ fontSize: 12.5, color: '#9ca3af', padding: '6px 0' }}>
                  No lab sessions conducted or scheduled yet for this experiment.
                </span>
              )}
            </div>
          </div>
        </section>

        {/* ── 2. GLOBAL STUDENT SEARCH & TOP ACTIONS ──────────────────────── */}
        <div className={sStyles.searchBarRow}>
          <div className={sStyles.globalSearchWrap}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#9891a6' }} />
            <input
              type="text"
              className={sStyles.globalSearchInput}
              placeholder="Search any student by name or roll no across all classes…"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
            />
            {searchFocused && searchResults.length > 0 && (
              <div className={sStyles.globalSearchDropdown}>
                {searchResults.map((st) => (
                  <div
                    key={st.id}
                    className={sStyles.searchItem}
                    onMouseDown={() => {
                      openStudentDossier(st.id);
                      setGlobalSearch('');
                    }}
                  >
                    <div>
                      <div className={sStyles.searchItemName}>{st.full_name}</div>
                      <div className={sStyles.searchItemMeta}>
                        <span>{st.roll_number}</span>
                        {st.section_name && <span>· Sec {st.section_name}</span>}
                      </div>
                    </div>
                    <ChevronRight size={15} color="#9ca3af" />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={handleExport}
              disabled={!selectedSessionId || rows.length === 0}
            >
              <Download size={15} /> Export Session CSV
            </button>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => router.push('/instructor/analytics')}
            >
              <Award size={15} strokeWidth={2} /> Class Analytics
            </button>
          </div>
        </div>

        {/* ── 3. SESSION KPI STRIP ──────────────────────────────────────────── */}
        {selectedSessionId && (
          <div className={styles.kpiRow}>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Enrolled Headcount</p>
              <p className={styles.kpiValue}>{rows.length}</p>
              <p className={styles.kpiSub}>Total students registered in section</p>
            </div>

            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Attendance Rate</p>
              <p className={styles.kpiValue} style={{ color: '#059669' }}>
                {attendanceRate}%
              </p>
              <p className={styles.kpiSub}>
                {presentCount} present or late of {rows.length}
              </p>
            </div>

            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Late / Absent</p>
              <p className={styles.kpiValue} style={{ color: (summary['absent'] ?? 0) > 0 ? '#dc2626' : '#6b7280' }}>
                {summary['late'] ?? 0} L · {summary['absent'] ?? 0} A
              </p>
              <p className={styles.kpiSub}>Late arrivals & unexcused absentees</p>
            </div>

            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Session Focus Score</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <p className={styles.kpiValue} style={{ margin: 0, color: '#7c3aed' }}>
                  {avgFocusScore !== null ? `${avgFocusScore}%` : '—'}
                </p>
                {avgFocusScore !== null && (
                  <span className={styles.badge} style={{
                    background: avgFocusScore >= 70 ? '#ecfdf5' : '#fffbeb',
                    color: avgFocusScore >= 70 ? '#059669' : '#d97706',
                    border: '1px solid currentColor'
                  }}>
                    {avgFocusScore >= 75 ? 'High Focus' : (avgFocusScore >= 50 ? 'Normal' : 'Attention Dip')}
                  </span>
                )}
              </div>
              <p className={styles.kpiSub}>Class average during active coding</p>
            </div>
          </div>
        )}

        {/* ── 4. STATUS FILTER CHIPS & IN-SESSION SEARCH ───────────────────── */}
        {selectedSessionId && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div className={styles.tabRow} style={{ margin: 0 }}>
              <button
                type="button"
                className={`${styles.tabChip} ${statusFilter === 'All' ? styles.tabChipActive : ''}`}
                onClick={() => setStatusFilter('All')}
              >
                All ({rows.length})
              </button>
              {STATUS_OPTIONS.map((st) => (
                <button
                  key={st}
                  type="button"
                  className={`${styles.tabChip} ${statusFilter === st ? styles.tabChipActive : ''}`}
                  onClick={() => setStatusFilter(st)}
                >
                  {st.replace('_', ' ')} ({summary[st] ?? 0})
                </button>
              ))}
            </div>

            <div style={{ position: 'relative', width: 280 }}>
              <input
                type="text"
                className={styles.input}
                style={{ paddingLeft: 34 }}
                placeholder="Filter table by name or roll no…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Search size={14} style={{ position: 'absolute', left: 11, top: 12, color: '#9891a6' }} />
            </div>
          </div>
        )}

        {/* ── 5. ATTENDANCE REGISTER TABLE ─────────────────────────────────── */}
        <section className={styles.tableCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>
                {currentSessionObj ? `Attendance Sheet: ${currentSessionObj.title}` : 'Session Attendance Register'}
              </h2>
              <p className={styles.sectionSub}>
                {loading
                  ? 'Loading attendance records…'
                  : (selectedSessionId
                    ? `${rows.length} students enrolled · Click any row to view complete attendance history`
                    : 'Select an experiment and session from the navigator above')}
              </p>
            </div>
          </div>

          <table className={styles.table}>
            <thead>
              <tr>
                <th>Student</th>
                <th>Roll Number</th>
                <th>Status</th>
                <th>Joined At</th>
                <th>Time in Lab</th>
                <th>Focus Score</th>
                <th>Activity</th>
                <th>Override Reason</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.student_id}
                  className={sStyles.clickableRow}
                  onClick={() => openStudentDossier(r.student_id)}
                >
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', background: '#ede9fe',
                        color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: 13
                      }}>
                        {r.full_name?.charAt(0) || 'S'}
                      </div>
                      <div>
                        <div className={styles.tdStrong}>{r.full_name}</div>
                        <div style={{ fontSize: 11.5, color: '#6b7280' }}>{r.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 600, fontSize: 12.5 }}>
                      {r.roll_number || '—'}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.pill} ${statusPill(r.status)}`}>
                      {r.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    {r.joined_at
                      ? new Date(r.joined_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                      : '—'}
                  </td>
                  <td>{Math.round((r.total_time_seconds || 0) / 60)} min</td>
                  <td>{focusScoreBadge(r.focus_score)}</td>
                  <td>
                    {r.is_active_participant ? (
                      <span className={`${styles.pill} ${styles.pillGreen}`} style={{ fontSize: 11 }}>
                        Active
                      </span>
                    ) : (
                      <span style={{ color: '#9ca3af', fontSize: 12 }}>Passive</span>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: '#64748b', maxWidth: 160 }}>
                    {r.override_reason || '—'}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        className={styles.ghostBtn}
                        style={{ minHeight: 28, padding: '0 8px', fontSize: 11.5 }}
                        title="View complete multi-subject attendance dossier"
                        onClick={() => openStudentDossier(r.student_id)}
                      >
                        <User size={12} /> Profile
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        style={{ minHeight: 28, padding: '0 8px', fontSize: 11.5 }}
                        title="Manual status override"
                        onClick={() => {
                          setOverrideTarget(r);
                          setOverrideStatus(r.status);
                          setOverrideReason(r.override_reason || '');
                        }}
                      >
                        <Pencil size={11} /> Override
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', color: '#9891a6', padding: 32 }}>
                    {selectedSessionId
                      ? 'No attendance records match your filter criteria.'
                      : 'Select an experiment and session from the navigator to view attendance.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

      </div>

      {/* ── 6. OVERRIDE ATTENDANCE MODAL ────────────────────────────────────── */}
      {overrideTarget && (
        <div className={styles.modalOverlay} onClick={() => setOverrideTarget(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Override Attendance Status</h3>
                <p className={styles.sectionSub}>
                  {overrideTarget.full_name} · {overrideTarget.roll_number}
                </p>
              </div>
              <button type="button" className={styles.closeBtn} onClick={() => setOverrideTarget(null)}>
                <X size={18} />
              </button>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>New Status</label>
              <select
                className={styles.select}
                value={overrideStatus}
                onChange={(e) => setOverrideStatus(e.target.value)}
              >
                {STATUS_OPTIONS.map((st) => (
                  <option key={st} value={st}>{st.replace('_', ' ')}</option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Reason / Remarks</label>
              <textarea
                className={styles.textarea}
                rows={3}
                placeholder="e.g. Internet disconnected mid-session, verified offline participation"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button type="button" className={styles.secondaryBtn} onClick={() => setOverrideTarget(null)}>
                Cancel
              </button>
              <button type="button" className={styles.primaryBtn} disabled={busy} onClick={handleOverride}>
                <CheckCircle2 size={15} /> {busy ? 'Saving…' : 'Save Override'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 7. SINGLE STUDENT ATTENDANCE DOSSIER DRAWER ──────────────────────── */}
      {activeStudentId && (
        <div className={sStyles.drawerOverlay} onClick={() => setActiveStudentId(null)}>
          <div className={sStyles.drawerCard} onClick={(e) => e.stopPropagation()}>
            {dossierLoading || !studentDossier ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
                Loading student attendance profile…
              </div>
            ) : (
              <>
                <div className={sStyles.drawerHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                      width: 46, height: 46, borderRadius: '50%', background: '#7c3aed',
                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: 18
                    }}>
                      {studentDossier.student.full_name.charAt(0)}
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#1e1b4b', fontFamily: 'Geist' }}>
                        {studentDossier.student.full_name}
                      </h3>
                      <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 2, display: 'flex', gap: 10 }}>
                        <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 600 }}>
                          Roll: {studentDossier.student.roll_number}
                        </span>
                        {studentDossier.student.section_name && (
                          <span>· Sec {studentDossier.student.section_name}</span>
                        )}
                        {studentDossier.student.batch_name && (
                          <span>· {studentDossier.student.batch_name}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.closeBtn}
                    onClick={() => setActiveStudentId(null)}
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className={sStyles.drawerBody}>
                  {/* Summary Metric Cards */}
                  <div className={sStyles.studentMetaGrid}>
                    <div className={sStyles.studentMetaCard}>
                      <span className={sStyles.studentMetaLabel}>Overall Rate</span>
                      <div className={sStyles.studentMetaVal} style={{ color: '#059669' }}>
                        {studentDossier.summary.attendance_rate}%
                      </div>
                    </div>

                    <div className={sStyles.studentMetaCard}>
                      <span className={sStyles.studentMetaLabel}>Attended</span>
                      <div className={sStyles.studentMetaVal}>
                        {studentDossier.summary.attended} / {studentDossier.summary.past_sessions}
                      </div>
                    </div>

                    <div className={sStyles.studentMetaCard}>
                      <span className={sStyles.studentMetaLabel}>Avg Focus Score</span>
                      <div className={sStyles.studentMetaVal} style={{ color: '#7c3aed' }}>
                        {studentDossier.summary.avg_focus_score !== null
                          ? `${studentDossier.summary.avg_focus_score}%`
                          : '—'}
                      </div>
                    </div>

                    <div className={sStyles.studentMetaCard}>
                      <span className={sStyles.studentMetaLabel}>Absences</span>
                      <div className={sStyles.studentMetaVal} style={{ color: studentDossier.summary.breakdown['absent'] > 0 ? '#dc2626' : '#6b7280' }}>
                        {studentDossier.summary.breakdown['absent'] ?? 0}
                      </div>
                    </div>
                  </div>

                  {/* Multi-Session Chronological Attendance Register */}
                  <div>
                    <h4 style={{ fontSize: 14, fontWeight: 700, color: '#111827', margin: '0 0 10px', fontFamily: 'Geist' }}>
                      Session-by-Session Attendance Register ({studentDossier.history.length})
                    </h4>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                      <table className={sStyles.timelineTable}>
                        <thead>
                          <tr>
                            <th>Date / Time</th>
                            <th>Subject</th>
                            <th>Experiment & Session</th>
                            <th>Status</th>
                            <th>Focus Score</th>
                            <th>Time</th>
                            <th>Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {studentDossier.history.map((h, i) => (
                            <tr key={`${h.session_id}-${i}`}>
                              <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                                {h.scheduled_at
                                  ? new Date(h.scheduled_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                                  : '—'}
                              </td>
                              <td>
                                <div style={{ fontWeight: 600, fontSize: 12.5 }}>{h.subject_name}</div>
                                <div style={{ fontSize: 11, color: '#64748b' }}>{h.subject_code}</div>
                              </td>
                              <td>
                                <div style={{ fontWeight: 600, fontSize: 12.5 }}>
                                  {h.exp_number ? `Exp ${h.exp_number}: ` : ''}{h.experiment_title}
                                </div>
                                <div style={{ fontSize: 11, color: '#64748b' }}>{h.session_title}</div>
                              </td>
                              <td>
                                <span className={`${styles.pill} ${statusPill(h.status)}`}>
                                  {h.status.replace('_', ' ')}
                                </span>
                              </td>
                              <td>{focusScoreBadge(h.focus_score)}</td>
                              <td style={{ fontSize: 12 }}>
                                {h.total_time_seconds ? `${Math.round(h.total_time_seconds / 60)} min` : '—'}
                              </td>
                              <td style={{ fontSize: 11.5, color: '#64748b', maxWidth: 140 }}>
                                {h.override_reason || '—'}
                              </td>
                            </tr>
                          ))}
                          {studentDossier.history.length === 0 && (
                            <tr>
                              <td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>
                                No session history found for this student.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </InstructorShell>
  );
}

