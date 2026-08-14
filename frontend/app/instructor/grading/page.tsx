'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ClipboardCheck, CheckCircle2, History, MessageSquare, Lock, Save, X
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import { experimentService } from '@/services/experiment.service';
import { submissionService } from '@/services/submission.service';
import styles from '../shared.module.css';

interface ExpOption { id: string; title: string; exp_number: number }

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
}

interface ReplayVersion {
  version_number: number;
  files: Record<string, string>;
  save_type: string;
  saved_at: string | null;
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export default function GradingPage() {
  const [experiments, setExperiments] = useState<ExpOption[]>([]);
  const [selectedExp, setSelectedExp] = useState('');
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // grade panel
  const [grading, setGrading] = useState<SubmissionRow | null>(null);
  const [manualGrade, setManualGrade] = useState('');
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);

  // replay modal
  const [replay, setReplay] = useState<{ student: string; versions: ReplayVersion[] } | null>(null);
  const [replayIdx, setReplayIdx] = useState(0);

  const toast3 = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    experimentService.listMine()
      .then(exps => {
        setExperiments(exps as ExpOption[]);
        if ((exps as ExpOption[]).length > 0) setSelectedExp((exps as ExpOption[])[0].id);
      })
      .catch(() => setExperiments([]));
  }, []);

  const loadSubmissions = useCallback(async (expId: string) => {
    if (!expId) return;
    setLoading(true);
    try {
      const d = await submissionService.getSubmissions(expId);
      setSubmissions(d.submissions ?? []);
    } catch { setSubmissions([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadSubmissions(selectedExp); }, [selectedExp, loadSubmissions]);

  const openGrade = (sub: SubmissionRow) => {
    setGrading(sub);
    setManualGrade('');
    setFeedback('');
  };

  const saveGrade = async () => {
    if (!grading) return;
    setSaving(true);
    try {
      const res = await submissionService.gradeSubmission({
        student_id: grading.student_id,
        experiment_id: selectedExp,
        session_id: grading.session_id ?? undefined,
        manual_grade: manualGrade === '' ? null : Math.min(100, Math.max(0, parseFloat(manualGrade))),
        manual_feedback: feedback || undefined,
      });
      const locked = res?.grade?.is_locked;
      toast3(locked ? 'Grade saved.' : 'Grade saved.');
      setGrading(null);
      loadSubmissions(selectedExp);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string }; status?: number } };
      if (e?.response?.status === 409) toast3('Grade is locked — the student already viewed it.');
      else toast3(e?.response?.data?.error ?? 'Failed to save grade.');
    } finally { setSaving(false); }
  };

  const openReplay = async (sub: SubmissionRow) => {
    try {
      const d = await submissionService.getReplay(sub.student_id, selectedExp);
      setReplay({ student: sub.full_name, versions: d.versions ?? [] });
      setReplayIdx(0);
    } catch { toast3('No saved code versions for this student.'); }
  };

  const version = replay?.versions[replayIdx];
  const versionCode = version ? Object.entries(version.files ?? {}).map(([name, code]) => `// ── ${name} ──\n${code}`).join('\n\n') : '';

  return (
    <InstructorShell activePage="Grading" title="Grading"
      subtitle="Review final submissions and assign grades. Auto-grade from test runs is applied automatically.">

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 300, background: '#111827', color: '#fff', padding: '12px 20px', borderRadius: 12, fontSize: 14, fontWeight: 600 }}>{toast}</div>}

      <div className={styles.actionRow}>
        <select className={styles.select} style={{ maxWidth: 380 }} value={selectedExp}
          onChange={e => setSelectedExp(e.target.value)}>
          {experiments.length === 0 && <option value="">No experiments found</option>}
          {experiments.map(e => <option key={e.id} value={e.id}>#{e.exp_number} — {e.title}</option>)}
        </select>
        <span className={styles.sectionSub}>
          {loading ? 'Loading…' : `${submissions.length} final submission${submissions.length === 1 ? '' : 's'}`}
        </span>
      </div>

      <div className={styles.sectionCard}>
        {!selectedExp ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <ClipboardCheck size={30} color="#c4b5fd" style={{ marginBottom: 8 }} />
            <p className={styles.sectionSub}>Create an experiment first to receive submissions.</p>
          </div>
        ) : loading ? (
          <p className={styles.sectionSub}>Loading submissions…</p>
        ) : submissions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <ClipboardCheck size={30} color="#c4b5fd" style={{ marginBottom: 8 }} />
            <p className={styles.sectionSub}>No final submissions for this experiment yet.</p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Student</th><th>Language</th><th>Test cases</th><th>Quality</th><th>Submitted</th><th />
              </tr>
            </thead>
            <tbody>
              {submissions.map(sub => (
                <tr key={sub.id}>
                  <td>
                    <div className={styles.tdStrong}>{sub.full_name}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>{sub.roll_number}</div>
                  </td>
                  <td><span className={`${styles.pill} ${styles.pillBlue}`}>{sub.language}</span></td>
                  <td>
                    {sub.test_cases_total
                      ? <span className={`${styles.pill} ${sub.test_cases_passed === sub.test_cases_total ? styles.pillGreen : styles.pillAmber}`}>
                          {sub.test_cases_passed}/{sub.test_cases_total}
                        </span>
                      : <span className={styles.pillSlate}>—</span>}
                  </td>
                  <td>{sub.quality_grade
                    ? <span className={`${styles.pill} ${styles.pillBlue}`}>Grade {sub.quality_grade} · {sub.loc ?? 0} LOC</span>
                    : '—'}</td>
                  <td style={{ fontSize: 13, color: '#6b7280' }}>{fmt(sub.submitted_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button className={styles.ghostBtn} onClick={() => openReplay(sub)}>
                        <History size={13} /> Replay
                      </button>
                      <button className={styles.primaryBtn} onClick={() => openGrade(sub)}>
                        <ClipboardCheck size={13} /> Grade
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ══ Grade panel ══ */}
      {grading && (
        <div className={styles.modalOverlay} onClick={() => setGrading(null)}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Grade — {grading.full_name} ({grading.roll_number})</h2>
              <button className={styles.closeBtn} onClick={() => setGrading(null)}><X size={16} /></button>
            </div>

            <div className={styles.kpiRow}>
              <div className={styles.kpiCard}>
                <p className={styles.kpiLabel}>Test cases</p>
                <p className={styles.kpiValue}>{grading.test_cases_passed ?? 0}/{grading.test_cases_total ?? 0}</p>
              </div>
              <div className={styles.kpiCard}>
                <p className={styles.kpiLabel}>Quality grade</p>
                <p className={styles.kpiValue}>{grading.quality_grade ?? '—'}</p>
              </div>
              <div className={styles.kpiCard}>
                <p className={styles.kpiLabel}>Compile</p>
                <p className={styles.kpiValue} style={{ fontSize: 16 }}>{grading.compile_status ?? '—'}</p>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Manual grade (0–100) — auto-grade from test runs is added automatically</label>
              <input className={styles.input} type="number" min={0} max={100} value={manualGrade}
                onChange={e => setManualGrade(e.target.value)} placeholder="e.g. 85" />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Feedback to student</label>
              <textarea className={styles.textarea} value={feedback}
                onChange={e => setFeedback(e.target.value)}
                placeholder="What was good, what to improve…" />
            </div>

            <p style={{ fontSize: 12, color: '#b45309', display: 'flex', gap: 6, alignItems: 'center' }}>
              <Lock size={12} /> Once the student views their grade, it becomes locked and can no longer be edited.
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

      {/* ══ Replay modal ══ */}
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

      <p className={styles.sectionSub} style={{ marginTop: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
        <MessageSquare size={13} color="#7c3aed" />
        Grades combine auto-grade (test cases), code quality and your manual grade using the experiment rubric.
        <CheckCircle2 size={13} color="#059669" />
      </p>
    </InstructorShell>
  );
}
