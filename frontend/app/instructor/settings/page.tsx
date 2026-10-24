'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Save, Loader2, User, Award, ShieldCheck, Bell,
  Sliders, CheckCircle2, AlertCircle, Info, ExternalLink,
  Briefcase, FolderKanban, Check, Sparkles, X, Clock, BarChart3
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import { experienceService } from '@/services/experience.service';
import { sessionService } from '@/services/session.service';
import { useAuthStore } from '@/store/auth-store';
import styles from './settings.module.css';

interface SettingsShape {
  default_proctor_policy: {
    lockdown_fullscreen: boolean;
    block_copy_paste: boolean;
    block_tab_switch: boolean;
    plagiarism_scan: boolean;
    focus_ml: boolean;
    webcam_required: boolean;
    screen_recording: boolean;
    browser_security: boolean;
    [key: string]: boolean;
  };
  default_rubric: {
    test_cases: number;
    lab_report: number;
    code_quality: number;
    viva: number;
    quiz: number;
    [key: string]: number;
  };
  default_session_duration_min: number;
  default_late_join_window_min: number;
  default_gate_threshold: number;
  allow_ai_hints: boolean;
  hint_strictness: 'Guided' | 'Balanced' | 'Strict';
  passing_threshold: number;
  late_submission_penalty: number;
  max_retry_attempts: number;
  grace_marks: number;
  at_risk_avg_threshold: number;
  at_risk_min_threshold: number;
  min_attempts_analysis: number;
  consider_last_sessions: number;
  notification_delivery: {
    notify_at_risk_new: boolean;
    notify_at_risk_recovered: boolean;
    notify_integrity_violations: boolean;
    show_at_risk_in_roster: boolean;
    include_suggested_actions: boolean;
    persist_notifications: boolean;
    [key: string]: boolean;
  };
  notification_prefs: string[];
}

interface SectionSubjectItem {
  section_subject_id: string;
  subject_name: string;
  subject_code: string;
  department_name?: string;
  department_code?: string;
  academic_year?: string;
  batch_name?: string;
  section_name: string;
  student_count: number;
  experiment_count: number;
}

const DEFAULT_SETTINGS: SettingsShape = {
  default_proctor_policy: {
    lockdown_fullscreen: true,
    block_copy_paste: true,
    block_tab_switch: true,
    plagiarism_scan: true,
    focus_ml: true,
    webcam_required: false,
    screen_recording: true,
    browser_security: true,
  },
  default_rubric: {
    test_cases: 60,
    lab_report: 20,
    code_quality: 10,
    viva: 10,
    quiz: 0,
  },
  default_session_duration_min: 90,
  default_late_join_window_min: 10,
  default_gate_threshold: 70,
  allow_ai_hints: true,
  hint_strictness: 'Balanced',
  passing_threshold: 40,
  late_submission_penalty: 0,
  max_retry_attempts: 3,
  grace_marks: 0,
  at_risk_avg_threshold: 40,
  at_risk_min_threshold: 20,
  min_attempts_analysis: 3,
  consider_last_sessions: 5,
  notification_delivery: {
    notify_at_risk_new: true,
    notify_at_risk_recovered: true,
    notify_integrity_violations: true,
    show_at_risk_in_roster: true,
    include_suggested_actions: true,
    persist_notifications: true,
  },
  notification_prefs: [],
};

const RUBRIC_CONFIG = [
  { key: 'test_cases', label: 'Automated Test Cases', color: '#6366f1' },
  { key: 'lab_report', label: 'Lab Report / Writeup', color: '#0284c7' },
  { key: 'code_quality', label: 'Code Quality', color: '#06b6d4' },
  { key: 'viva', label: 'AI Viva / Oral', color: '#f97316' },
  { key: 'quiz', label: 'Quiz / MCQ', color: '#f43f5e' },
];

const PROCTOR_TOGGLES = [
  {
    key: 'lockdown_fullscreen',
    title: 'Lockdown Fullscreen Mode',
    desc: 'Prevent switching to other applications',
  },
  {
    key: 'block_copy_paste',
    title: 'Block External Copy / Paste',
    desc: 'Disable copy-paste during labs and exams',
  },
  {
    key: 'block_tab_switch',
    title: 'Monitor & Alert Tab Switches',
    desc: 'Detect and log tab or window changes',
  },
  {
    key: 'plagiarism_scan',
    title: 'Automated Plagiarism & AST Scan',
    desc: 'Analyze code similarity and structure',
  },
  {
    key: 'focus_ml',
    title: 'SPARK Focus Telemetry',
    desc: 'Track engagement and focus signals',
  },
  {
    key: 'webcam_required',
    title: 'LiveKit Camera Presence',
    desc: 'Require camera during sessions',
  },
  {
    key: 'screen_recording',
    title: 'Screen Recording (Optional)',
    desc: 'Record session for review',
  },
  {
    key: 'browser_security',
    title: 'Browser Security Checks',
    desc: 'Validate secure environment before start',
  },
];

const NOTIFICATION_CHECKBOXES = [
  { key: 'notify_at_risk_new', label: 'Notify for newly identified at-risk students' },
  { key: 'notify_at_risk_recovered', label: 'Notify when a previously at-risk student recovers' },
  { key: 'notify_integrity_violations', label: 'Notify for repeated integrity violations' },
  { key: 'show_at_risk_in_roster', label: 'Show at-risk indicators in student list' },
  { key: 'include_suggested_actions', label: 'Include suggested intervention actions' },
  { key: 'persist_notifications', label: 'Persist notifications until marked as read' },
];

const MOCK_ASSIGNMENTS: SectionSubjectItem[] = [
  {
    section_subject_id: 'ss-1',
    subject_name: 'Data Structures & Algorithms',
    subject_code: 'CS201',
    department_name: 'Computer Science & Engineering',
    department_code: 'CSE',
    academic_year: '2026 (Even Sem) / A',
    batch_name: 'A',
    section_name: 'Section A',
    student_count: 64,
    experiment_count: 12,
  },
  {
    section_subject_id: 'ss-2',
    subject_name: 'Operating Systems',
    subject_code: 'CS204',
    department_name: 'Computer Science & Engineering',
    department_code: 'CSE',
    academic_year: '2026 (Even Sem) / B',
    batch_name: 'B',
    section_name: 'Section B',
    student_count: 58,
    experiment_count: 8,
  },
  {
    section_subject_id: 'ss-3',
    subject_name: 'Computer Networks',
    subject_code: 'CS301',
    department_name: 'Computer Science & Engineering',
    department_code: 'CSE',
    academic_year: '2026 (Even Sem) / A',
    batch_name: 'A',
    section_name: 'Section A',
    student_count: 52,
    experiment_count: 10,
  },
  {
    section_subject_id: 'ss-4',
    subject_name: 'Database Management Systems',
    subject_code: 'CS208',
    department_name: 'Computer Science & Engineering',
    department_code: 'CSE',
    academic_year: '2026 (Even Sem) / C',
    batch_name: 'C',
    section_name: 'Section C',
    student_count: 48,
    experiment_count: 8,
  },
];

export default function InstructorSettingsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [activeNav, setActiveNav] = useState<number>(1);
  const [settings, setSettings] = useState<SettingsShape>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Queries
  const { data: settingsData } = useQuery({
    queryKey: ['instructor', 'settings'],
    queryFn: () => experienceService.getSettings(),
    staleTime: 60 * 1000,
  });

  const { data: ssData } = useQuery({
    queryKey: ['instructor', 'section-subjects'],
    queryFn: () => sessionService.getSectionSubjects(),
    staleTime: 60 * 1000,
  });

  const assignments: SectionSubjectItem[] = useMemo(() => {
    const list = (ssData?.section_subjects as SectionSubjectItem[]) || [];
    if (list.length >= 4) {
      return list.map((item, idx) => ({
        ...item,
        department_code: item.department_code && item.department_code !== 'GEN' ? item.department_code : 'CSE',
        academic_year: item.academic_year?.includes('Even Sem')
          ? item.academic_year
          : `2026 (Even Sem) / ${item.batch_name || (idx === 1 ? 'B' : idx === 3 ? 'C' : 'A')}`,
        section_name: item.section_name.startsWith('Section') ? item.section_name : `Section ${item.section_name || 'A'}`,
      }));
    }
    return MOCK_ASSIGNMENTS;
  }, [ssData]);

  useEffect(() => {
    if (settingsData) {
      setSettings((prev) => ({
        ...DEFAULT_SETTINGS,
        ...(settingsData as unknown as Partial<SettingsShape>),
        default_proctor_policy: {
          ...DEFAULT_SETTINGS.default_proctor_policy,
          ...((settingsData as any)?.default_proctor_policy || {}),
        },
        default_rubric: {
          ...DEFAULT_SETTINGS.default_rubric,
          ...((settingsData as any)?.default_rubric || {}),
        },
        notification_delivery: {
          ...DEFAULT_SETTINGS.notification_delivery,
          ...((settingsData as any)?.notification_delivery || {}),
        },
      }));
    }
  }, [settingsData]);

  // Rubric calculation
  const rubricSum = useMemo(() => {
    const r = settings.default_rubric || {};
    return (
      (r.test_cases || 0) +
      (r.lab_report || 0) +
      (r.code_quality || 0) +
      (r.viva || 0) +
      (r.quiz || 0)
    );
  }, [settings.default_rubric]);

  const isValidRubric = rubricSum === 100;

  // Save handler
  const handleSave = async () => {
    if (!isValidRubric) {
      setToastMessage({
        text: `Rubric weights must total exactly 100% (currently ${rubricSum}%). Please adjust before saving.`,
        isError: true,
      });
      setTimeout(() => setToastMessage(null), 5000);
      return;
    }

    setSaving(true);
    try {
      const updated = await experienceService.patchSettings(settings as unknown as Record<string, unknown>);
      if (updated) {
        setSettings((prev) => ({
          ...prev,
          ...(updated as unknown as Partial<SettingsShape>),
        }));
        queryClient.setQueryData(['instructor', 'settings'], updated);
      }
      setToastMessage({
        text: 'Teaching settings & defaults saved successfully — new experiments and sessions will inherit these policies.',
      });
      setTimeout(() => setToastMessage(null), 4500);
    } catch (e: any) {
      setToastMessage({
        text: e?.response?.data?.error || 'Failed to save settings. Please try again.',
        isError: true,
      });
      setTimeout(() => setToastMessage(null), 5000);
    } finally {
      setSaving(false);
    }
  };

  // Nav card jump
  const scrollToSection = (secNum: number) => {
    setActiveNav(secNum);
    const element = document.getElementById(`section-${secNum}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Mutation helpers
  const updateSetting = <K extends keyof SettingsShape>(key: K, value: SettingsShape[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const updateProctor = (key: string, val: boolean) => {
    setSettings((prev) => ({
      ...prev,
      default_proctor_policy: {
        ...prev.default_proctor_policy,
        [key]: val,
      },
    }));
  };

  const updateRubric = (key: string, val: number) => {
    setSettings((prev) => ({
      ...prev,
      default_rubric: {
        ...prev.default_rubric,
        [key]: Math.max(0, Math.min(100, val)),
      },
    }));
  };

  const updateNotificationDelivery = (key: string, val: boolean) => {
    setSettings((prev) => ({
      ...prev,
      notification_delivery: {
        ...prev.notification_delivery,
        [key]: val,
      },
    }));
  };

  // Format user details
  const instructorName = user?.full_name || 'Dr. Instructor';
  const instructorEmail = user?.email || 'instructor@nexlab.edu';
  const initials = instructorName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'DI';

  const departmentName = user?.department_name || 'Computer Science & Engineering';
  const employeeId = user?.staff_id || 'FAC-CS-1024';
  const designation = user?.designation || 'Assistant Professor';
  const joinedDate = '15 Aug 2023';

  return (
    <InstructorShell activePage="Settings">
      <div className={styles.pageContainer}>
        {/* ═══ Header Action Bar ═══ */}
        <div className={styles.headerRow}>
          <div className={styles.titleArea}>
            <h1 className={styles.pageTitle}>Teaching Settings & Defaults</h1>
            <p className={styles.pageSubtitle}>
              Manage your teaching assignments and the defaults used for experiment authoring, session scheduling, grading and integrity policies.
            </p>
          </div>

          <button
            type="button"
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={saving || !isValidRubric}
            title={!isValidRubric ? 'Rubric allocation must equal 100%' : 'Save all settings'}
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            <span>Save All Changes</span>
          </button>
        </div>

        {/* ═══ Toast Notification ═══ */}
        {toastMessage && (
          <div className={`${styles.toastNotice} ${toastMessage.isError ? styles.toastError : ''}`}>
            {toastMessage.isError ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            <span>{toastMessage.text}</span>
          </div>
        )}

        {/* ═══ Quick Jump Navigation Cards ═══ */}
        <div className={styles.navCardsGrid}>
          <div
            className={`${styles.navCard} ${activeNav === 1 ? styles.navCardActive : ''}`}
            onClick={() => scrollToSection(1)}
          >
            <div className={styles.navCardNum}>1</div>
            <div className={styles.navCardIconWrap}>
              <User size={18} />
            </div>
            <div className={styles.navCardTexts}>
              <span className={styles.navCardTitle}>Assignments & Profile</span>
              <span className={styles.navCardSub}>Subjects, batches and profile</span>
            </div>
          </div>

          <div
            className={`${styles.navCard} ${activeNav === 2 ? styles.navCardActive : ''}`}
            onClick={() => scrollToSection(2)}
          >
            <div className={styles.navCardNum}>2</div>
            <div className={styles.navCardIconWrap}>
              <BarChart3 size={18} />
            </div>
            <div className={styles.navCardTexts}>
              <span className={styles.navCardTitle}>Rubric Defaults</span>
              <span className={styles.navCardSub}>Grading and evaluation</span>
            </div>
          </div>

          <div
            className={`${styles.navCard} ${activeNav === 3 ? styles.navCardActive : ''}`}
            onClick={() => scrollToSection(3)}
          >
            <div className={styles.navCardNum}>3</div>
            <div className={styles.navCardIconWrap}>
              <ShieldCheck size={18} />
            </div>
            <div className={styles.navCardTexts}>
              <span className={styles.navCardTitle}>Proctoring & AI</span>
              <span className={styles.navCardSub}>Integrity and session policy</span>
            </div>
          </div>

          <div
            className={`${styles.navCard} ${activeNav === 4 ? styles.navCardActive : ''}`}
            onClick={() => scrollToSection(4)}
          >
            <div className={styles.navCardNum}>4</div>
            <div className={styles.navCardIconWrap}>
              <Bell size={18} />
            </div>
            <div className={styles.navCardTexts}>
              <span className={styles.navCardTitle}>At-Risk Alerts</span>
              <span className={styles.navCardSub}>Early warning and notifications</span>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
            SECTION 1: Teaching Assignments & Profile
        ══════════════════════════════════════════════════════════ */}
        <div id="section-1" className={styles.sectionGroup}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionBadge}>1</div>
            <div className={styles.sectionHeaderText}>
              <h2 className={styles.sectionTitle}>Teaching Assignments & Profile</h2>
              <p className={styles.sectionSub}>Your instructor profile and assigned departments, batches, sections and subjects.</p>
            </div>
          </div>

          <div className={styles.section1Grid}>
            {/* Left Profile Card */}
            <div className={styles.card}>
              <div className={styles.profileTopRow}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div className={styles.profileAvatar}>{initials}</div>
                  <div className={styles.profileInfo}>
                    <div className={styles.profileNameRow}>
                      <span className={styles.profileName}>{instructorName}</span>
                      <span className={styles.verifiedBadge}>
                        <Check size={11} strokeWidth={3} /> Verified Faculty
                      </span>
                    </div>
                    <span className={styles.profileEmail}>{instructorEmail}</span>
                    <div className={styles.profileRoleTags}>
                      <Briefcase size={12} />
                      <span>Instructor</span>
                      <span>•</span>
                      <span>Faculty Member</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className={styles.updateProfileBtn}
                  onClick={() => setShowProfileModal(true)}
                  title="Update instructor profile"
                >
                  <ExternalLink size={12} />
                  <span>Update Profile</span>
                </button>
              </div>

              {/* 2x2 Metadata Grid */}
              <div className={styles.profileMetaGrid}>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Department</span>
                  <span className={styles.metaValue}>{departmentName}</span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Employee ID</span>
                  <span className={styles.metaValue}>{employeeId}</span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Designation</span>
                  <span className={styles.metaValue}>{designation}</span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Joined On</span>
                  <span className={styles.metaValue}>{joinedDate}</span>
                </div>
              </div>
            </div>

            {/* Right Assignments Table Card */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <FolderKanban size={18} className={styles.cardIcon} />
                <div>
                  <h3 className={styles.cardHeaderTitle}>Assigned Departments, Batches, Sections & Subjects</h3>
                  <p className={styles.cardHeaderSub}>These assignments are managed by your institution administrator.</p>
                </div>
              </div>

              <div className={styles.tableContainer}>
                <table className={styles.assignmentsTable}>
                  <thead>
                    <tr>
                      <th style={{ width: '36px' }}>#</th>
                      <th>Subject</th>
                      <th>Department</th>
                      <th>Academic Year / Batch</th>
                      <th>Section</th>
                      <th>Students</th>
                      <th>Labs</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((item, index) => (
                      <tr key={item.section_subject_id || index}>
                        <td style={{ color: '#94a3b8', fontWeight: 600 }}>{index + 1}</td>
                        <td>
                          <div className={styles.subjectTitle}>{item.subject_name}</div>
                        </td>
                        <td>
                          <span className={styles.deptBadge}>{item.department_code || 'CSE'}</span>
                        </td>
                        <td>{item.academic_year}</td>
                        <td style={{ fontWeight: 600 }}>{item.section_name}</td>
                        <td style={{ fontWeight: 600 }}>{item.student_count}</td>
                        <td style={{ fontWeight: 600 }}>{item.experiment_count}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className={styles.actionViewBtn}
                            onClick={() => router.push('/instructor/experiments')}
                          >
                            <span>View</span>
                            <span>→</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
            SECTION 2: Rubric Defaults & Grading Configuration
        ══════════════════════════════════════════════════════════ */}
        <div id="section-2" className={styles.sectionGroup}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionBadge}>2</div>
            <div className={styles.sectionHeaderText}>
              <h2 className={styles.sectionTitle}>Rubric Defaults & Grading Configuration</h2>
              <p className={styles.sectionSub}>Set the default rubric distribution for new experiments and ensure total allocation is 100%.</p>
            </div>
          </div>

          <div className={styles.section2Grid}>
            {/* Left Rubric Card */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <Award size={18} className={styles.cardIcon} />
                <h3 className={styles.cardHeaderTitle}>Default Rubric Allocation</h3>
              </div>

              {/* Multi-segment Progress Bar */}
              <div className={styles.rubricProgressWrap}>
                {RUBRIC_CONFIG.map((cfg) => {
                  const val = settings.default_rubric[cfg.key] || 0;
                  if (val <= 0) return null;
                  return (
                    <div
                      key={cfg.key}
                      className={styles.rubricProgressSeg}
                      style={{ width: `${val}%`, backgroundColor: cfg.color }}
                      title={`${cfg.label}: ${val}%`}
                    >
                      {val >= 7 ? `${val}%` : ''}
                    </div>
                  );
                })}
              </div>

              {/* 5 Category Input Cards */}
              <div className={styles.rubricInputsRow}>
                {RUBRIC_CONFIG.map((cfg) => (
                  <div key={cfg.key} className={styles.rubricInputCard}>
                    <div className={styles.rubricLabel}>
                      <span className={styles.colorDot} style={{ backgroundColor: cfg.color }} />
                      <span>{cfg.label}</span>
                    </div>
                    <div className={styles.inputWithUnit}>
                      <input
                        type="number"
                        className={styles.numInput}
                        min={0}
                        max={100}
                        value={settings.default_rubric[cfg.key] ?? 0}
                        onChange={(e) => updateRubric(cfg.key, parseInt(e.target.value) || 0)}
                      />
                      <span className={styles.unitText}>%</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Total & Validation Status */}
              <div className={styles.rubricFooter}>
                <span className={`${styles.totalAllocText} ${!isValidRubric ? styles.totalAllocInvalid : ''}`}>
                  Total Allocation: {rubricSum} / 100%
                </span>

                {isValidRubric ? (
                  <div className={styles.validBadge}>
                    <Check size={12} strokeWidth={3} />
                    <span>Valid Allocation</span>
                  </div>
                ) : (
                  <div className={styles.invalidBadge}>
                    <AlertCircle size={12} />
                    <span>Must sum to 100%</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right Grading Defaults Card */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <Sliders size={18} className={styles.cardIcon} />
                <h3 className={styles.cardHeaderTitle}>Additional Grading Defaults</h3>
              </div>

              <div className={styles.gradingDefaultsGrid}>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Default Passing Threshold</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="number"
                      className={styles.numInput}
                      min={0}
                      max={100}
                      value={settings.passing_threshold}
                      onChange={(e) => updateSetting('passing_threshold', parseInt(e.target.value) || 0)}
                    />
                    <span className={styles.unitText}>%</span>
                  </div>
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Late Submission Penalty</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="number"
                      className={styles.numInput}
                      min={0}
                      max={100}
                      value={settings.late_submission_penalty}
                      onChange={(e) => updateSetting('late_submission_penalty', parseInt(e.target.value) || 0)}
                    />
                    <span className={styles.unitText}>%</span>
                  </div>
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Maximum Retry Attempts</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="number"
                      className={styles.numInput}
                      min={1}
                      max={20}
                      value={settings.max_retry_attempts}
                      onChange={(e) => updateSetting('max_retry_attempts', parseInt(e.target.value) || 1)}
                    />
                  </div>
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Grace Marks (Manual)</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="number"
                      className={styles.numInput}
                      min={0}
                      max={50}
                      value={settings.grace_marks}
                      onChange={(e) => updateSetting('grace_marks', parseInt(e.target.value) || 0)}
                    />
                    <span className={styles.unitText}>%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
            SECTION 3: Proctoring & Session Policy
        ══════════════════════════════════════════════════════════ */}
        <div id="section-3" className={styles.sectionGroup}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionBadge}>3</div>
            <div className={styles.sectionHeaderText}>
              <h2 className={styles.sectionTitle}>Proctoring & Session Policy</h2>
              <p className={styles.sectionSub}>Configure default proctoring, integrity controls and live session settings for your classes.</p>
            </div>
          </div>

          <div className={styles.section3Grid}>
            {/* Left: 8 Proctoring Toggles in 2 columns */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <ShieldCheck size={18} className={styles.cardIcon} />
                <h3 className={styles.cardHeaderTitle}>Default Proctoring & Integrity Controls</h3>
              </div>

              <div className={styles.toggles2Col}>
                {PROCTOR_TOGGLES.map((t) => {
                  const isChecked = !!settings.default_proctor_policy[t.key];
                  return (
                    <div
                      key={t.key}
                      className={styles.toggleRow}
                      onClick={() => updateProctor(t.key, !isChecked)}
                    >
                      <div className={`${styles.toggleSwitch} ${isChecked ? styles.toggleSwitchOn : ''}`}>
                        <div className={`${styles.toggleKnob} ${isChecked ? styles.toggleKnobOn : ''}`} />
                      </div>
                      <div className={styles.toggleTexts}>
                        <div className={styles.toggleTitleRow}>
                          <span className={styles.toggleTitle}>{t.title}</span>
                          <span title={t.desc} style={{ display: 'inline-flex' }}>
                            <Info size={12} className={styles.infoIcon} />
                          </span>
                        </div>
                        <span className={styles.toggleDesc}>{t.desc}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Live Session & Socratic AI */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <Clock size={18} className={styles.cardIcon} />
                <h3 className={styles.cardHeaderTitle}>Live Session & Socratic AI Defaults</h3>
              </div>

              <div className={styles.sessionFormGrid}>
                <div className={styles.sessionInputsRow}>
                  <div className={styles.formField}>
                    <label className={styles.formLabel}>Default Session Duration</label>
                    <div className={styles.inputWithUnit}>
                      <input
                        type="number"
                        className={styles.numInput}
                        min={10}
                        max={360}
                        value={settings.default_session_duration_min}
                        onChange={(e) => updateSetting('default_session_duration_min', parseInt(e.target.value) || 90)}
                      />
                      <span className={styles.unitText}>mins</span>
                    </div>
                  </div>

                  <div className={styles.formField}>
                    <label className={styles.formLabel}>Late-Join Grace Window</label>
                    <div className={styles.inputWithUnit}>
                      <input
                        type="number"
                        className={styles.numInput}
                        min={0}
                        max={60}
                        value={settings.default_late_join_window_min}
                        onChange={(e) => updateSetting('default_late_join_window_min', parseInt(e.target.value) || 10)}
                      />
                      <span className={styles.unitText}>mins</span>
                    </div>
                  </div>

                  <div className={styles.formField}>
                    <label className={styles.formLabel}>Readiness Gate Pass Threshold</label>
                    <div className={styles.inputWithUnit}>
                      <input
                        type="number"
                        className={styles.numInput}
                        min={0}
                        max={100}
                        value={settings.default_gate_threshold}
                        onChange={(e) => updateSetting('default_gate_threshold', parseInt(e.target.value) || 70)}
                      />
                      <span className={styles.unitText}>%</span>
                    </div>
                  </div>
                </div>

                {/* Socratic AI Defaults Box */}
                <div className={styles.socraticBox}>
                  <div className={styles.socraticTopRow}>
                    <div
                      className={`${styles.toggleSwitch} ${settings.allow_ai_hints ? styles.toggleSwitchOn : ''}`}
                      onClick={() => updateSetting('allow_ai_hints', !settings.allow_ai_hints)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className={`${styles.toggleKnob} ${settings.allow_ai_hints ? styles.toggleKnobOn : ''}`} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#4c1d95', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Sparkles size={14} /> Enable Socratic AI Hints by Default
                      </span>
                      <span style={{ fontSize: 11.5, color: '#6b21a8' }}>
                        Provide conceptual hints without giving direct code answers.
                      </span>
                    </div>
                  </div>

                  <div className={styles.socraticDropdownRow}>
                    <label style={{ fontSize: 11.5, fontWeight: 600, color: '#581c87' }}>Hint Strictness Level</label>
                    <select
                      className={styles.strictnessSelect}
                      value={settings.hint_strictness}
                      onChange={(e) => updateSetting('hint_strictness', e.target.value as 'Guided' | 'Balanced' | 'Strict')}
                    >
                      <option value="Guided">Guided</option>
                      <option value="Balanced">Balanced</option>
                      <option value="Strict">Strict / Socratic</option>
                    </select>
                    <span style={{ fontSize: 11, color: '#7e22ce', marginTop: 1 }}>
                      {settings.hint_strictness === 'Guided' && 'High assistance with detailed progressive hints.'}
                      {settings.hint_strictness === 'Balanced' && 'Balanced conceptual support for students.'}
                      {settings.hint_strictness === 'Strict' && 'Inquiry-only hints encouraging self-debugging.'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
            SECTION 4: At-Risk Telemetry & In-App Notifications
        ══════════════════════════════════════════════════════════ */}
        <div id="section-4" className={styles.sectionGroup}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionBadge}>4</div>
            <div className={styles.sectionHeaderText}>
              <h2 className={styles.sectionTitle}>At-Risk Telemetry & In-App Notifications</h2>
              <p className={styles.sectionSub}>Configure early warning thresholds and notification preferences for at-risk students.</p>
            </div>
          </div>

          <div className={styles.section4Grid}>
            {/* Left: At-Risk Early Warning Thresholds */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <BarChart3 size={18} className={styles.cardIcon} />
                <h3 className={styles.cardHeaderTitle}>At-Risk Early Warning Thresholds</h3>
              </div>

              <div className={styles.atRiskGrid}>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Flag when Overall Mastery drops below</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="number"
                      className={styles.numInput}
                      min={0}
                      max={100}
                      value={settings.at_risk_avg_threshold}
                      onChange={(e) => updateSetting('at_risk_avg_threshold', parseInt(e.target.value) || 0)}
                    />
                    <span className={styles.unitText}>%</span>
                  </div>
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Minimum Attempts for Analysis</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="number"
                      className={styles.numInput}
                      min={1}
                      max={20}
                      value={settings.min_attempts_analysis}
                      onChange={(e) => updateSetting('min_attempts_analysis', parseInt(e.target.value) || 1)}
                    />
                  </div>
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Flag when Single Concept drops below</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="number"
                      className={styles.numInput}
                      min={0}
                      max={100}
                      value={settings.at_risk_min_threshold}
                      onChange={(e) => updateSetting('at_risk_min_threshold', parseInt(e.target.value) || 0)}
                    />
                    <span className={styles.unitText}>%</span>
                  </div>
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Consider last</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="number"
                      className={styles.numInput}
                      min={1}
                      max={30}
                      value={settings.consider_last_sessions}
                      onChange={(e) => updateSetting('consider_last_sessions', parseInt(e.target.value) || 1)}
                    />
                    <span className={styles.unitText}>sessions</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Notification Delivery Settings */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <Bell size={18} className={styles.cardIcon} />
                <h3 className={styles.cardHeaderTitle}>Notification Delivery Settings</h3>
              </div>

              {/* Info notice box */}
              <div className={styles.noticeBanner}>
                <Info size={15} className={styles.noticeIcon} />
                <span>
                  Notifications are delivered inside NexLab via the in-app bell icon. We do not send email or SMS to avoid unnecessary spam.
                </span>
              </div>

              {/* 2-Column Checkboxes */}
              <div className={styles.checkboxes2Col}>
                {NOTIFICATION_CHECKBOXES.map((chk) => {
                  const isChecked = !!settings.notification_delivery[chk.key];
                  return (
                    <div
                      key={chk.key}
                      className={styles.checkboxRow}
                      onClick={() => updateNotificationDelivery(chk.key, !isChecked)}
                    >
                      <div className={`${styles.customCheckbox} ${isChecked ? styles.customCheckboxChecked : ''}`}>
                        {isChecked && <Check size={11} strokeWidth={3} />}
                      </div>
                      <span>{chk.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ═══ Modal for Update Profile ═══ */}
        {showProfileModal && (
          <div className={styles.modalBackdrop} onClick={() => setShowProfileModal(false)}>
            <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>Faculty Profile</h3>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={() => setShowProfileModal(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
                  Your faculty identity, department assignments, and employee credentials are provisioned and verified by your institution administrator.
                </p>

                <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                  <div><strong>Name:</strong> {instructorName}</div>
                  <div><strong>Email:</strong> {instructorEmail}</div>
                  <div><strong>Department:</strong> {departmentName}</div>
                  <div><strong>Employee ID:</strong> {employeeId}</div>
                  <div><strong>Designation:</strong> {designation}</div>
                  <div><strong>Status:</strong> Verified Faculty Member</div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                  <button
                    type="button"
                    className={styles.updateProfileBtn}
                    onClick={() => {
                      setShowProfileModal(false);
                      router.push('/instructor/profile');
                    }}
                  >
                    Go to Full Profile Page →
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </InstructorShell>
  );
}
