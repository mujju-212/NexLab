'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Save, Loader2, User, Award, ShieldCheck, Bell, LogOut,
  Mail, BookOpen, Clock, AlertTriangle, Sparkles
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import { experienceService } from '@/services/experience.service';
import { sessionService } from '@/services/session.service';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth-store';
import styles from '../shared.module.css';

interface SettingsShape {
  default_proctor_policy: Record<string, boolean>;
  default_rubric: Record<string, number>;
  default_session_duration_min: number;
  default_late_join_window_min: number;
  default_gate_threshold: number;
  allow_ai_hints: boolean;
  at_risk_avg_threshold: number;
  at_risk_min_threshold: number;
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

const PROCTOR_FIELDS = [
  { key: 'lockdown_fullscreen', label: 'Lockdown Fullscreen Mode', desc: 'Requires students to stay in fullscreen during graded lab sessions' },
  { key: 'block_copy_paste',    label: 'Block External Copy/Paste', desc: 'Prevents pasting external clipboard code into the editor' },
  { key: 'block_tab_switch',    label: 'Monitor & Alert Tab Switches', desc: 'Logs focus loss and tab-switching events in real time' },
  { key: 'plagiarism_scan',     label: 'Automated Plagiarism & AST Scan', desc: 'Runs structural similarity comparison on final submissions' },
  { key: 'focus_ml',            label: 'SPARK Focus Telemetry', desc: 'Computes live student focus and struggle scores during sessions' },
  { key: 'webcam_required',     label: 'LiveKit Camera Presence', desc: 'Prompts students to enable camera during proctored exams' },
];

const RUBRIC_FIELDS = [
  { key: 'test_cases',   label: 'Automated Test Cases (%)', color: '#7c3aed' },
  { key: 'lab_report',   label: 'Instructor / Lab Evaluation (%)', color: '#0284c7' },
  { key: 'code_quality', label: 'Code Quality & Complexity (%)', color: '#059669' },
  { key: 'viva',         label: 'Oral AI Viva Evaluation (%)', color: '#d97706' },
  { key: 'quiz',         label: 'Pre-Lab Readiness Quiz (%)', color: '#ec4899' },
];

const DEFAULT_SETTINGS: SettingsShape = {
  default_proctor_policy: {
    lockdown_fullscreen: true,
    block_copy_paste: true,
    block_tab_switch: true,
    plagiarism_scan: true,
    focus_ml: true,
    webcam_required: false,
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
  at_risk_avg_threshold: 40,
  at_risk_min_threshold: 20,
};

export default function InstructorSettingsPage() {
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'assignments' | 'rubric' | 'proctoring' | 'alerts'>('assignments');
  const [settings, setSettings] = useState<SettingsShape>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, isLoading: loading } = useQuery({
    queryKey: ['instructor', 'settings'],
    queryFn: () => experienceService.getSettings(),
    staleTime: 60 * 1000,
  });

  const { data: ssData } = useQuery({
    queryKey: ['instructor', 'section-subjects'],
    queryFn: () => sessionService.getSectionSubjects(),
    staleTime: 60 * 1000,
  });

  const assignments: SectionSubjectItem[] = (ssData?.section_subjects as SectionSubjectItem[]) ?? [];

  useEffect(() => {
    if (data) {
      setSettings((prev) => ({
        ...DEFAULT_SETTINGS,
        ...(data as unknown as Partial<SettingsShape>),
        default_proctor_policy: {
          ...DEFAULT_SETTINGS.default_proctor_policy,
          ...((data as any)?.default_proctor_policy || {}),
        },
        default_rubric: {
          ...DEFAULT_SETTINGS.default_rubric,
          ...((data as any)?.default_rubric || {}),
        },
      }));
    }
  }, [data]);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await experienceService.patchSettings(settings as unknown as Record<string, unknown>);
      if (updated) {
        setSettings(prev => ({ ...prev, ...(updated as unknown as Partial<SettingsShape>) }));
        queryClient.setQueryData(['instructor', 'settings'], updated);
      }
      setNotice('Instructor settings saved — new experiments and sessions will inherit these defaults.');
      setTimeout(() => setNotice(null), 4000);
    } catch (e: any) {
      setNotice(e?.response?.data?.error || 'Failed to save settings.');
      setTimeout(() => setNotice(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await authService.logout();
    } catch {
      /* ignore */
    }
    clearAuth();
    router.push('/login');
  };

  const set = (field: string, value: unknown) =>
    setSettings(prev => ({ ...prev, [field]: value }));

  const setProctor = (key: string, value: boolean) =>
    setSettings(prev => ({
      ...prev,
      default_proctor_policy: { ...prev.default_proctor_policy, [key]: value },
    }));

  const setRubric = (key: string, value: number) =>
    setSettings(prev => ({
      ...prev,
      default_rubric: { ...prev.default_rubric, [key]: value },
    }));


  const rubricSum = Object.values(settings.default_rubric || {}).reduce((a, b) => a + (b || 0), 0);
  const fullName = user?.full_name ?? '';
  const initials = fullName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'IN';

  return (
    <InstructorShell
      activePage="Settings"
      title="Teaching Settings & Defaults"
      subtitle="Manage teaching assignments and the defaults used for sessions, grading, and integrity policies."
    >
      {/* Top Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div className={styles.tabRow}>
          <button type="button" className={`${styles.tabChip} ${activeTab === 'assignments' ? styles.tabChipActive : ''}`} onClick={() => setActiveTab('assignments')}>
            <User size={13} /> Teaching Assignments ({assignments.length})
          </button>
          <button type="button" className={`${styles.tabChip} ${activeTab === 'rubric' ? styles.tabChipActive : ''}`} onClick={() => setActiveTab('rubric')}>
            <Award size={13} /> Grading Rubric Defaults
          </button>
          <button type="button" className={`${styles.tabChip} ${activeTab === 'proctoring' ? styles.tabChipActive : ''}`} onClick={() => setActiveTab('proctoring')}>
            <ShieldCheck size={13} /> Session, Proctoring & AI Policy
          </button>
          <button type="button" className={`${styles.tabChip} ${activeTab === 'alerts' ? styles.tabChipActive : ''}`} onClick={() => setActiveTab('alerts')}>
            <Bell size={13} /> At-Risk Alerts
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {rubricSum !== 100 && (
            <span style={{ fontSize: 12.5, color: '#b91c1c', fontWeight: 700 }}>
              Rubric must sum to 100% (currently {rubricSum}%)
            </span>
          )}
          <button className={styles.primaryBtn} onClick={save} disabled={saving || rubricSum !== 100}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save Defaults
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            style={{ color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}
            onClick={handleSignOut}
          >
            <LogOut size={15} /> Sign Out
          </button>
        </div>
      </div>

      {notice && (
        <div style={{
          background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px 16px',
          borderRadius: 12, marginBottom: 18, color: '#166534', fontSize: 13.5, fontWeight: 600,
        }}>
          {notice}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', color: '#9891a6', padding: 40 }}>
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : (
        <>
          {/* ═══ TAB 1: FACULTY PROFILE & TEACHING ASSIGNMENTS ═══ */}
          {activeTab === 'assignments' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <section className={styles.sectionCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{
                      width: 64, height: 64, borderRadius: 16,
                      background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: '#fff',
                      fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {initials}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <h2 className={styles.sectionTitle} style={{ margin: 0 }}>{fullName}</h2>
                        <span className={`${styles.pill} ${styles.pillGreen}`}>
                          <ShieldCheck size={12} /> Verified Faculty
                        </span>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: 13, color: '#475569', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Mail size={14} color="#7c3aed" /> {user?.email ?? 'instructor@nexlab.edu'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    style={{ color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}
                    onClick={handleSignOut}
                  >
                    <LogOut size={15} /> Sign Out of NexLab
                  </button>
                </div>
              </section>

              <section className={styles.sectionCard}>
                <div className={styles.sectionHeader}>
                  <div>
                    <h2 className={styles.sectionTitle}>Assigned Departments, Batches, Sections & Subjects</h2>
                    <p className={styles.sectionSub}>Active teaching assignments provisioned by your Institution Admin</p>
                  </div>
                </div>

                {assignments.length === 0 ? (
                  <p className={styles.sectionSub}>No teaching assignments found.</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Subject</th>
                          <th>Department</th>
                          <th>Academic Year & Batch</th>
                          <th>Section</th>
                          <th>Enrolled Students</th>
                          <th>Experiments</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assignments.map(a => (
                          <tr key={a.section_subject_id}>
                            <td>
                              <div className={styles.tdStrong}>{a.subject_name}</div>
                              <div style={{ fontSize: 11.5, color: '#64748b' }}>{a.subject_code}</div>
                            </td>
                            <td>
                              <span className={`${styles.pill} ${styles.pillBlue}`}>
                                {a.department_name || 'Department'} ({a.department_code || 'CSE'})
                              </span>
                            </td>
                            <td>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{a.batch_name || 'Batch'}</div>
                              <div style={{ fontSize: 11.5, color: '#64748b' }}>{a.academic_year || 'Current Year'}</div>
                            </td>
                            <td style={{ fontWeight: 700, color: '#7c3aed' }}>Section {a.section_name}</td>
                            <td style={{ fontWeight: 700 }}>{a.student_count} students</td>
                            <td style={{ fontWeight: 700 }}>{a.experiment_count} labs</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ═══ TAB 2: GRADING RUBRIC DEFAULTS ═══ */}
          {activeTab === 'rubric' && (
            <section className={styles.sectionCard} style={{ maxWidth: 760 }}>
              <h2 className={styles.sectionTitle}>Default 5-Component Experiment Rubric</h2>
              <p className={styles.sectionSub} style={{ marginBottom: 16 }}>
                Pre-fills the grading rubric whenever you create a new experiment. Weights must sum to 100%.
              </p>

              {/* Visual Progress Bar */}
              <div style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', background: '#f1f5f9', marginBottom: 18 }}>
                {RUBRIC_FIELDS.map(f => {
                  const val = settings.default_rubric[f.key] ?? 0;
                  if (val <= 0) return null;
                  return <div key={f.key} style={{ width: `${val}%`, background: f.color }} title={`${f.label}: ${val}%`} />;
                })}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                {RUBRIC_FIELDS.map(f => (
                  <div className={styles.formGroup} key={f.key} style={{ marginBottom: 4 }}>
                    <label className={styles.formLabel} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: f.color, display: 'inline-block' }} />
                      {f.label}
                    </label>
                    <input
                      type="number"
                      className={styles.input}
                      value={settings.default_rubric[f.key] ?? 0}
                      onChange={e => setRubric(f.key, Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                      min={0}
                      max={100}
                    />
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 12, fontSize: 13.5, fontWeight: 800, color: rubricSum === 100 ? '#059669' : '#b91c1c' }}>
                Total Allocation: {rubricSum} / 100%
              </div>
            </section>
          )}

          {/* ═══ TAB 3: SESSION, PROCTORING & AI POLICY ═══ */}
          {activeTab === 'proctoring' && (
            <div className={styles.gridTwo}>
              <section className={styles.sectionCard}>
                <h2 className={styles.sectionTitle}>Default Proctoring & Integrity Controls</h2>
                <p className={styles.sectionSub}>Applied automatically to new experiments and live sessions</p>
                <div className={styles.list} style={{ marginTop: 14 }}>
                  {PROCTOR_FIELDS.map(f => (
                    <div
                      key={f.key}
                      className={styles.listRow}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setProctor(f.key, !settings.default_proctor_policy[f.key])}
                    >
                      <div className={styles.rowBody}>
                        <div className={styles.rowTitle}>{f.label}</div>
                        <div className={styles.rowMeta}>{f.desc}</div>
                      </div>
                      <div className={styles.rowSide}>
                        <div style={{
                          width: 44, height: 24, borderRadius: 12, padding: 2, transition: 'all .15s',
                          background: settings.default_proctor_policy[f.key] ? '#7c3aed' : '#cbd5e1',
                        }}>
                          <div style={{
                            width: 20, height: 20, borderRadius: 10, background: '#fff', transition: 'all .15s',
                            marginLeft: settings.default_proctor_policy[f.key] ? '20px' : '0px',
                          }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className={styles.sectionCard}>
                <h2 className={styles.sectionTitle}>Live Session & Socratic AI Defaults</h2>
                <p className={styles.sectionSub}>Timing windows and AI hint availability during labs</p>
                <div className={styles.formGroup} style={{ marginTop: 14 }}>
                  <label className={styles.formLabel}>Default Lab Session Duration (minutes)</label>
                  <input type="number" className={styles.input}
                    value={settings.default_session_duration_min}
                    onChange={e => set('default_session_duration_min', Number(e.target.value))} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Late-Join Grace Window (minutes)</label>
                  <input type="number" className={styles.input}
                    value={settings.default_late_join_window_min}
                    onChange={e => set('default_late_join_window_min', Number(e.target.value))} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Pre-Lab Readiness Gate Pass Threshold (%)</label>
                  <input type="number" className={styles.input}
                    value={settings.default_gate_threshold}
                    onChange={e => set('default_gate_threshold', Number(e.target.value))} />
                </div>

                <div
                  style={{
                    marginTop: 14, padding: 14, borderRadius: 12,
                    background: '#f5f3ff', border: '1px solid #ddd6fe',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
                  }}
                  onClick={() => set('allow_ai_hints', !settings.allow_ai_hints)}
                >
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#4c1d95', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Sparkles size={15} /> Enable Socratic AI Hints by Default
                    </div>
                    <div style={{ fontSize: 12, color: '#6d28d9' }}>
                      Provides progressive conceptual hints without revealing solution code
                    </div>
                  </div>
                  <input type="checkbox" checked={settings.allow_ai_hints} onChange={e => set('allow_ai_hints', e.target.checked)} style={{ width: 18, height: 18 }} />
                </div>
              </section>
            </div>
          )}

          {/* ═══ TAB 4: AT-RISK RULES ═══ */}
          {activeTab === 'alerts' && (
            <div className={styles.gridTwo}>
              <section className={styles.sectionCard}>
                <h2 className={styles.sectionTitle}>At-Risk Early Warning Thresholds</h2>
                <p className={styles.sectionSub}>Controls when students are flagged in Analytics & Class Management</p>
                <div className={styles.formGroup} style={{ marginTop: 14 }}>
                  <label className={styles.formLabel}>Flag when Overall Concept Mastery drops below (%)</label>
                  <input type="number" className={styles.input}
                    value={settings.at_risk_avg_threshold}
                    onChange={e => set('at_risk_avg_threshold', Number(e.target.value))} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Flag when any Single Concept drops below (%)</label>
                  <input type="number" className={styles.input}
                    value={settings.at_risk_min_threshold}
                    onChange={e => set('at_risk_min_threshold', Number(e.target.value))} />
                </div>
              </section>

              <section className={styles.sectionCard}>
                <h2 className={styles.sectionTitle}>Your Notifications</h2>
                <p className={styles.sectionSub}>The header bell is connected to your account’s in-app notifications. Opening it no longer marks everything read; use “Mark all read” when you choose.</p>
                <div style={{ marginTop: 16, padding: 14, borderRadius: 12, border: '1px solid #ddd6fe', background: '#faf5ff', color: '#5b21b6', fontSize: 12.5, lineHeight: 1.55 }}>
                  Per-event email, SMS and push controls are not available yet, so they are not shown as working switches. Use the bell to view, open, and manage in-app notices.
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </InstructorShell>
  );
}
