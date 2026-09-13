'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ClipboardCheck, CheckCircle2, History, MessageSquare, Lock, Save, X,
  Sparkles, Loader2, TrendingUp, FileCheck, Award,
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import { experimentService } from '@/services/experiment.service';
import { submissionService } from '@/services/submission.service';
import { experienceService, type InstructorExam, type ExamAttemptRow } from '@/services/experience.service';
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
  const [drafting, setDrafting] = useState(false);

  // T2-9 curve modal
  const [showCurve, setShowCurve] = useState(false);
  const [curveMode, setCurveMode] = useState<'add' | 'factor'>('add');
  const [curveValue, setCurveValue] = useState('5');
  const [curvePreview, setCurvePreview] = useState<{
    affected: number; locked_skipped: number;
    class_avg_before: number | null; class_avg_after: number | null;
    rows: Array<{ student_id: string; before: number | null; after: number | null; locked: boolean }>;
  } | null>(null);
  const [curving, setCurving] = useState(false);

  // replay modal
  const [replay, setReplay] = useState<{ student: string; versions: ReplayVersion[] } | null>(null);
  const [replayIdx, setReplayIdx] = useState(0);

  // grading mode tab
  const [gradingMode, setGradingMode] = useState<'submissions' | 'exams'>('submissions');

  // exam grading state
  const [examList, setExamList] = useState<InstructorExam[]>([]);
  const [selectedExam, setSelectedExam] = useState('');
  const [examAttempts, setExamAttempts] = useState<ExamAttemptRow[]>([]);
  const [selectedExamData, setSelectedExamData] = useState<InstructorExam | null>(null);
  const [loadingExams, setLoadingExams] = useState(false);

  const toast3 = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    experimentService.listMine()
      .then(exps => {
        setExperiments(exps as ExpOption[]);
        if ((exps as ExpOption[]).length > 0) setSelectedExp((exps as ExpOption[])[0].id);
      })
      .catch(() => setExperiments([]));
    experienceService.listExams()
      .then(exams => {
        setExamList(exams);
        if (exams.length > 0) setSelectedExam(exams[0].id);
      })
      .catch(() => setExamList([]));
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

  const loadExamAttempts = useCallback(async (examId: string) => {
    if (!examId) return;
    setLoadingExams(true);
    try {
      const res = await experienceService.getExamAttempts(examId);
      setExamAttempts(res.attempts ?? []);
      setSelectedExamData(res.exam ?? null);
    } catch {
      setExamAttempts([]);
      setSelectedExamData(null);
    } finally {
      setLoadingExams(false);
    }
  }, []);

  useEffect(() => { if (selectedExam) loadExamAttempts(selectedExam); }, [selectedExam, loadExamAttempts]);

  const openGrade = (sub: SubmissionRow) => {
    setGrading(sub);
    setManualGrade('');
    setFeedback('');
  };

  // T2-7 — governed AI draft; instructor edits before saving
  const generateDraft = async () => {
    if (!grading) return;
    setDrafting(true);
    try {
      const res = await experienceService.aiFeedbackDraft(grading.student_id, selectedExp);
      setFeedback(res.draft);
      toast3(`Draft generated (${res.model}). Edit before saving.`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string }; status?: number } };
      toast3(e?.response?.data?.error ?? (e?.response?.status === 429 ? 'AI quota exceeded.' : 'Draft generation failed.'));
    } finally { setDrafting(false); }
  };

  // T2-9 curve — preview then apply
  const runCurve = async (apply: boolean) => {
    const v = parseFloat(curveValue);
    if (isNaN(v)) { toast3('Enter a number.'); return; }
    setCurving(true);
    try {
      const res = await experienceService.curveGrades({
        experiment_id: selectedExp, mode: curveMode, value: v, apply,
      });
      if (apply) {
        toast3(`Curved ${res.changed} grade(s).`);
        setShowCurve(false); setCurvePreview(null);
      } else {
        setCurvePreview(res as typeof curvePreview);
      }
    } catch (e: unknown) {
      toast3((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Curve failed.');
    } finally { setCurving(false); }
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

      {/* Grading mode tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#f1f5f9', borderRadius: 10, padding: 3, width: 'fit-content' }}>
        <button
          onClick={() => setGradingMode('submissions')}
          style={{
            padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
            border: 'none', cursor: 'pointer',
            background: gradingMode === 'submissions' ? '#fff' : 'transparent',
            color: gradingMode === 'submissions' ? '#0f172a' : '#64748b',
            boxShadow: gradingMode === 'submissions' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <ClipboardCheck size={14} /> Lab Submissions
        </button>
        <button
          onClick={() => setGradingMode('exams')}
          style={{
            padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
            border: 'none', cursor: 'pointer',
            background: gradingMode === 'exams' ? '#fff' : 'transparent',
            color: gradingMode === 'exams' ? '#0f172a' : '#64748b',
            boxShadow: gradingMode === 'exams' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <FileCheck size={14} /> Exam Scores
          {examList.length > 0 && (
            <span style={{ fontSize: 11, background: '#ede9fe', color: '#7c3aed', padding: '1px 7px', borderRadius: 10, fontWeight: 700 }}>
              {examList.length}
            </span>
          )}
        </button>
      </div>

      {gradingMode === 'submissions' && (
        <>
      <div className={styles.actionRow}>
        <select className={styles.select} style={{ maxWidth: 380 }} value={selectedExp}
          onChange={e => setSelectedExp(e.target.value)}>
          {experiments.length === 0 && <option value="">No experiments found</option>}
          {experiments.map(e => <option key={e.id} value={e.id}>#{e.exp_number} — {e.title}</option>)}
        </select>
        <span className={styles.sectionSub}>
          {loading ? 'Loading…' : `${submissions.length} final submission${submissions.length === 1 ? '' : 's'}`}
        </span>
        {selectedExp && (
          <button className={styles.ghostBtn} onClick={() => { setShowCurve(true); setCurvePreview(null); }}
            title="Curve final grades for this experiment">
            <TrendingUp size={13} /> Curve
          </button>
        )}
      </div>

      <div className={styles.sectionCard}>
        {!selectedExp ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <ClipboardCheck size={30} color="#d8b4fe" style={{ marginBottom: 8 }} />
            <p className={styles.sectionSub}>Create an experiment first to receive submissions.</p>
          </div>
        ) : loading ? (
          <p className={styles.sectionSub}>Loading submissions…</p>
        ) : submissions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <ClipboardCheck size={30} color="#d8b4fe" style={{ marginBottom: 8 }} />
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
              <button type="button" className={styles.ghostBtn} onClick={generateDraft} disabled={drafting}
                style={{ marginTop: 6 }}>
                {drafting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {drafting ? 'Drafting…' : 'Generate AI draft'}
              </button>
              <span style={{ fontSize: 11.5, color: '#9891a6', marginLeft: 8 }}>
                Draft only — you edit and decide what the student sees.
              </span>
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

      {/* ══ Curve modal (T2-9) ══ */}
      {showCurve && (
        <div className={styles.modalOverlay} onClick={() => setShowCurve(false)}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Curve grades</h2>
              <button className={styles.closeBtn} onClick={() => setShowCurve(false)}><X size={16} /></button>
            </div>
            <div className={styles.gridTwo}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Mode</label>
                <select className={styles.select} value={curveMode} onChange={e => { setCurveMode(e.target.value as 'add' | 'factor'); setCurvePreview(null); }}>
                  <option value="add">Add points (+N)</option>
                  <option value="factor">Multiply (×factor)</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>{curveMode === 'add' ? 'Points (±50)' : 'Factor (0.5–2.0)'}</label>
                <input className={styles.input} type="number" step="0.1" value={curveValue}
                  onChange={e => { setCurveValue(e.target.value); setCurvePreview(null); }} />
              </div>
            </div>
            <button className={styles.ghostBtn} onClick={() => runCurve(false)} disabled={curving}>
              {curving ? <Loader2 size={13} className="animate-spin" /> : null} Preview
            </button>

            {curvePreview && (
              <div style={{ marginTop: 12 }}>
                <p style={{ fontSize: 13, color: '#374151', marginBottom: 6 }}>
                  Class avg: {curvePreview.class_avg_before ?? '—'} → <strong>{curvePreview.class_avg_after ?? '—'}</strong>
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
                  {curving ? 'Applying…' : 'Apply curve'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

        </>
      )}

      {gradingMode === 'exams' && (
        <>
          <div className={styles.actionRow}>
            <select className={styles.select} style={{ maxWidth: 380 }} value={selectedExam}
              onChange={e => setSelectedExam(e.target.value)}>
              {examList.length === 0 && <option value="">No exams found</option>}
              {examList.map(e => <option key={e.id} value={e.id}>{e.title} ({e.exam_type.toUpperCase()})</option>)}
            </select>
            <span className={styles.sectionSub}>
              {loadingExams ? 'Loading…' : `${examAttempts.length} attempt${examAttempts.length === 1 ? '' : 's'}`}
              {selectedExamData && selectedExamData.grade_weight > 0 && (
                <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, background: '#fef3c7', color: '#d97706', padding: '2px 8px', borderRadius: 6 }}>
                  {Math.round(selectedExamData.grade_weight * 100)}% of final grade
                </span>
              )}
            </span>
          </div>

          <div className={styles.sectionCard}>
            {!selectedExam ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <FileCheck size={30} color="#d8b4fe" style={{ marginBottom: 8 }} />
                <p className={styles.sectionSub}>No exams created yet. Create exams from the Experiments page.</p>
              </div>
            ) : loadingExams ? (
              <p className={styles.sectionSub}>Loading exam attempts…</p>
            ) : examAttempts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <FileCheck size={30} color="#d8b4fe" style={{ marginBottom: 8 }} />
                <p className={styles.sectionSub}>No students have attempted this exam yet.</p>
              </div>
            ) : (
              <>
                {/* Exam summary stats */}
                <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                  {(() => {
                    const submitted = examAttempts.filter(a => a.status === 'submitted' || a.status === 'expired');
                    const scores = submitted.map(a => a.score ?? 0).filter(s => s > 0);
                    const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
                    const passed = submitted.filter(a => a.passed).length;
                    return (
                      <>
                        <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 18px', fontSize: 13 }}>
                          <span style={{ color: '#64748b', fontWeight: 500 }}>Average: </span>
                          <strong style={{ color: '#0f172a' }}>{avg.toFixed(1)}%</strong>
                        </div>
                        <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '10px 18px', fontSize: 13 }}>
                          <span style={{ color: '#64748b', fontWeight: 500 }}>Passed: </span>
                          <strong style={{ color: '#059669' }}>{passed}/{submitted.length}</strong>
                        </div>
                        <div style={{ background: '#faf5ff', borderRadius: 10, padding: '10px 18px', fontSize: 13 }}>
                          <span style={{ color: '#64748b', fontWeight: 500 }}>In Progress: </span>
                          <strong style={{ color: '#7c3aed' }}>{examAttempts.filter(a => a.status === 'in_progress').length}</strong>
                        </div>
                      </>
                    );
                  })()}
                </div>

                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Student</th><th>Status</th><th>Score</th><th>Points</th><th>Passed</th><th>Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {examAttempts.map(att => (
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
                        <td style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>
                          {att.score !== null ? `${att.score.toFixed(1)}%` : '—'}
                        </td>
                        <td style={{ fontSize: 13, color: '#6b7280' }}>
                          {att.total_points}/{att.max_points}
                        </td>
                        <td>
                          {att.status === 'in_progress' ? (
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>—</span>
                          ) : att.passed ? (
                            <span style={{ color: '#059669', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Award size={14} /> Pass
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
              </>
            )}
          </div>
        </>
      )}

      <p className={styles.sectionSub} style={{ marginTop: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
        <MessageSquare size={13} color="#7c3aed" />
        Grades combine auto-grade (test cases), code quality and your manual grade using the experiment rubric.
        <CheckCircle2 size={13} color="#059669" />
      </p>
    </InstructorShell>
  );
}
