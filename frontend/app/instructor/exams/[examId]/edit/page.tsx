'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Plus, Trash2, Save, Loader2, Eye, EyeOff, HelpCircle, Code2,
  GripVertical, X, CheckCircle2, BarChart3, Settings2, ListOrdered,
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import InstructorWorkspaceTabs from '@/components/layout/InstructorWorkspaceTabs';
import styles from '../../../shared.module.css';
import {
  examService, type Exam, type ExamQuestion, type QuestionType,
  type ExamTestCase, type InstructorAttemptRow, type InstructorStudentRow,
} from '@/services/exam.service';

const toIso = (v: string): string | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const toLocalInput = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fmtDateTime = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });
};

const CODE_LANGS = ['python', 'cpp', 'c', 'java'];

interface QDraft {
  id?: string;
  question_type: QuestionType;
  prompt: string;
  points: number;
  explanation: string;
  options: string[];
  correct_answer: string;      // option index as string
  language: string;
  starter_code: string;
  test_cases: ExamTestCase[];
}

const emptyDraft = (type: QuestionType): QDraft => ({
  question_type: type,
  prompt: '',
  points: 1,
  explanation: '',
  options: type === 'mcq' ? ['', '', '', ''] : [],
  correct_answer: '0',
  language: 'python',
  starter_code: '',
  test_cases: type === 'coding' ? [{ input: '', expected: '', hidden: false, weight: 1 }] : [],
});

const toDraft = (q: ExamQuestion): QDraft => ({
  id: q.id,
  question_type: q.question_type,
  prompt: q.prompt || '',
  points: q.points ?? 1,
  explanation: q.explanation || '',
  options: q.question_type === 'mcq' ? (q.options && q.options.length ? q.options : ['', '', '', '']) : [],
  correct_answer: q.correct_answer ?? '0',
  language: q.language || 'python',
  starter_code: q.starter_code || '',
  test_cases: q.question_type === 'coding'
    ? (q.test_cases && q.test_cases.length ? q.test_cases : [{ input: '', expected: '', hidden: false, weight: 1 }])
    : [],
});

export default function EditExamPage({ params }: { params: Promise<{ examId: string }> }) {
  const router = useRouter();
  const [examId, setExamId] = useState<string | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<'questions' | 'settings' | 'results'>('questions');

  // Question editor modal
  const [draft, setDraft] = useState<QDraft | null>(null);
  const [savingQ, setSavingQ] = useState(false);

  // Settings form
  const [settings, setSettings] = useState({
    title: '', description: '', exam_type: 'mcq' as Exam['exam_type'],
    available_from: '', due_at: '', duration_minutes: 30,
    max_attempts: 1, pass_threshold: 40, shuffle_questions: true,
    proctor_focus_enabled: false, proctor_lockdown_enabled: false, max_violations: 0,
  });
  const [savingSettings, setSavingSettings] = useState(false);

  // Results
  const [studentResults, setStudentResults] = useState<InstructorStudentRow[]>([]);
  const [openStudent, setOpenStudent] = useState<string | null>(null);
  const [openAttempt, setOpenAttempt] = useState<string | null>(null);
  const [loadingAttempts, setLoadingAttempts] = useState(false);

  useEffect(() => {
    (async () => {
      const { examId: id } = await params;
      setExamId(id);
      if (typeof window !== 'undefined' && window.location.search.includes('tab=results')) setTab('results');
    })();
  }, [params]);

  const load = useCallback(async (id: string) => {
    try {
      setError(null);
      const e = await examService.getExam(id);
      setExam(e);
      setQuestions(e.questions || []);
      setSettings({
        title: e.title, description: e.description || '', exam_type: e.exam_type,
        available_from: toLocalInput(e.available_from), due_at: toLocalInput(e.due_at),
        duration_minutes: e.duration_minutes, max_attempts: e.max_attempts,
        pass_threshold: e.pass_threshold, shuffle_questions: e.shuffle_questions,
        proctor_focus_enabled: !!e.proctor_focus_enabled,
        proctor_lockdown_enabled: !!e.proctor_lockdown_enabled,
        max_violations: e.max_violations ?? 0,
      });
    } catch {
      setError('Could not load this exam.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (examId) load(examId); }, [examId, load]);

  useEffect(() => {
    if (tab === 'results' && examId) {
      setLoadingAttempts(true);
      examService.getStudentResults(examId)
        .then(setStudentResults)
        .catch(() => setStudentResults([]))
        .finally(() => setLoadingAttempts(false));
    }
  }, [tab, examId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const saveQuestion = async () => {
    if (!draft || !examId) return;
    if (!draft.prompt.trim()) { setToast('Question prompt is required.'); return; }
    setSavingQ(true);
    try {
      const payload = draft.question_type === 'mcq'
        ? {
          question_type: 'mcq' as const, prompt: draft.prompt.trim(), points: draft.points,
          explanation: draft.explanation, options: draft.options, correct_answer: draft.correct_answer,
        }
        : {
          question_type: 'coding' as const, prompt: draft.prompt.trim(), points: draft.points,
          explanation: draft.explanation, language: draft.language, starter_code: draft.starter_code,
          test_cases: draft.test_cases,
        };
      if (draft.id) await examService.updateQuestion(draft.id, payload);
      else await examService.addQuestion(examId, payload);
      setDraft(null);
      await load(examId);
      setToast('Question saved ✓');
    } catch {
      setToast('Failed to save question.');
    } finally {
      setSavingQ(false);
    }
  };

  const deleteQuestion = async (qid: string) => {
    if (!examId || !window.confirm('Delete this question?')) return;
    try {
      await examService.deleteQuestion(qid);
      await load(examId);
      setToast('Question deleted.');
    } catch { setToast('Failed to delete question.'); }
  };

  const move = async (index: number, dir: -1 | 1) => {
    if (!examId) return;
    const next = [...questions];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setQuestions(next);
    try { await examService.reorderQuestions(examId, next.map(q => q.id)); }
    catch { setToast('Reorder failed.'); await load(examId); }
  };

  const saveSettings = async () => {
    if (!examId) return;
    const from = toIso(settings.available_from);
    const due = toIso(settings.due_at);
    if (from && due && due <= from) { setToast('Due date must be after the availability start.'); return; }
    setSavingSettings(true);
    try {
      const updated = await examService.updateExam(examId, {
        title: settings.title, description: settings.description, exam_type: settings.exam_type,
        available_from: from, due_at: due, duration_minutes: settings.duration_minutes,
        max_attempts: settings.max_attempts, pass_threshold: settings.pass_threshold,
        shuffle_questions: settings.shuffle_questions,
        proctor_focus_enabled: settings.proctor_focus_enabled,
        proctor_lockdown_enabled: settings.proctor_lockdown_enabled,
        max_violations: settings.max_violations,
      });
      setExam(prev => prev ? { ...prev, ...updated } : prev);
      setToast('Settings saved ✓');
    } catch { setToast('Failed to save settings.'); }
    finally { setSavingSettings(false); }
  };

  const togglePublish = async () => {
    if (!examId || !exam) return;
    try {
      const updated = await examService.updateExam(examId, { is_published: !exam.is_published });
      setExam(prev => prev ? { ...prev, ...updated } : prev);
      setToast(updated.is_published ? 'Exam published ✓' : 'Exam unpublished.');
    } catch { setToast('Failed to update publish state.'); }
  };

  if (loading) {
    return (
      <InstructorShell activePage="Experiments" title="Edit Exam" subtitle="Loading…">
        <InstructorWorkspaceTabs active="timed-exams" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#6b7280', fontSize: 13.5, padding: 24 }}>
          <Loader2 size={18} className="spin" /> Loading exam…
        </div>
      </InstructorShell>
    );
  }

  const TABS = [
    { id: 'questions' as const, label: 'Questions', Icon: ListOrdered },
    { id: 'settings' as const, label: 'Settings', Icon: Settings2 },
    { id: 'results' as const, label: 'Results', Icon: BarChart3 },
  ];

  return (
    <InstructorShell
      activePage="Experiments"
      title={exam?.title || 'Edit Exam'}
      subtitle={`${questions.length} question${questions.length === 1 ? '' : 's'} · ${exam?.is_published ? 'Published' : 'Draft'}`}
    >
      <InstructorWorkspaceTabs active="timed-exams" />
      <div className={styles.actionRow} style={{ justifyContent: 'space-between' }}>
        <button type="button" className={styles.secondaryBtn} onClick={() => router.push('/instructor/exams')}>
          <ArrowLeft size={16} /> Back to Exams
        </button>
        <button type="button" className={exam?.is_published ? styles.secondaryBtn : styles.primaryBtn} onClick={togglePublish}>
          {exam?.is_published ? <><EyeOff size={16} /> Unpublish</> : <><Eye size={16} /> Publish Exam</>}
        </button>
      </div>

      {toast && (
        <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', padding: '11px 16px', borderRadius: 12, marginBottom: 16, color: '#6d28d9', fontSize: 13.5, fontWeight: 600 }}>{toast}</div>
      )}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: 12, marginBottom: 16, color: '#b91c1c', fontSize: 13.5, fontWeight: 600 }}>{error}</div>
      )}

      <div className={styles.tabRow}>
        {TABS.map(t => {
          const Icon = t.Icon;
          return (
            <button key={t.id} type="button" className={`${styles.tabChip} ${tab === t.id ? styles.tabChipActive : ''}`} onClick={() => setTab(t.id)}>
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* ══ QUESTIONS ══════════════════════════════════════════════════════ */}
      {tab === 'questions' && (
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Questions</h2>
              <p className={styles.sectionSub}>
                {exam?.exam_type === 'mcq' ? 'MCQ exam — add multiple-choice questions.'
                  : exam?.exam_type === 'coding' ? 'Coding exam — add docker-graded questions.'
                    : 'Mixed exam — add MCQ and coding questions.'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {(exam?.exam_type === 'mcq' || exam?.exam_type === 'mixed') && (
                <button type="button" className={styles.primaryBtn} onClick={() => setDraft(emptyDraft('mcq'))}>
                  <HelpCircle size={15} /> Add MCQ
                </button>
              )}
              {(exam?.exam_type === 'coding' || exam?.exam_type === 'mixed') && (
                <button type="button" className={styles.primaryBtn} onClick={() => setDraft(emptyDraft('coding'))}>
                  <Code2 size={15} /> Add Coding
                </button>
              )}
            </div>
          </div>

          {questions.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: 13.5, margin: 0, padding: '20px 0' }}>
              No questions yet. Add your first question using the buttons above.
            </p>
          ) : (
            <div className={styles.list}>
              {questions.map((q, i) => (
                <div key={q.id} className={styles.listRow} style={{ alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                    <GripVertical size={16} style={{ color: '#cbd5e1' }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af' }}>{i + 1}</span>
                  </div>
                  <div className={styles.rowIcon} style={{ background: q.question_type === 'mcq' ? 'rgba(245,243,255,.9)' : 'rgba(236,253,245,.9)', color: q.question_type === 'mcq' ? '#7c3aed' : '#059669' }}>
                    {q.question_type === 'mcq' ? <HelpCircle size={18} /> : <Code2 size={18} />}
                  </div>
                  <div className={styles.rowBody}>
                    <p className={styles.rowTitle} style={{ whiteSpace: 'pre-wrap' }}>{q.prompt}</p>
                    <p className={styles.rowMeta}>
                      {q.points} point{q.points === 1 ? '' : 's'}
                      {q.question_type === 'mcq'
                        ? ` · ${(q.options || []).length} options · correct: ${String.fromCharCode(65 + Number(q.correct_answer || 0))}`
                        : ` · ${q.language || 'python'} · ${(q.test_cases || []).length} test case${(q.test_cases || []).length === 1 ? '' : 's'}`}
                    </p>
                  </div>
                  <div className={styles.rowSide}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className={styles.rowAction} onClick={() => move(i, -1)} disabled={i === 0} title="Move up">↑</button>
                      <button type="button" className={styles.rowAction} onClick={() => move(i, 1)} disabled={i === questions.length - 1} title="Move down">↓</button>
                      <button type="button" className={styles.rowAction} onClick={() => setDraft(toDraft(q))}><Save size={14} /> Edit</button>
                      <button type="button" className={styles.rowAction} style={{ color: '#b91c1c' }} onClick={() => deleteQuestion(q.id)}><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ══ SETTINGS ═══════════════════════════════════════════════════════ */}
      {tab === 'settings' && exam && (
        <section className={styles.sectionCard} style={{ maxWidth: 760 }}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Exam Settings</h2>
              <p className={styles.sectionSub}>Window, timing, and grading configuration</p>
            </div>
            {exam.is_published
              ? <span className={`${styles.badge} ${styles.greenBadge}`}><CheckCircle2 size={11} /> Published</span>
              : <span className={`${styles.badge} ${styles.slateBadge}`}>Draft</span>}
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Title</label>
            <input className={styles.input} value={settings.title} onChange={e => setSettings(s => ({ ...s, title: e.target.value }))} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Description / Instructions</label>
            <textarea className={styles.textarea} value={settings.description} onChange={e => setSettings(s => ({ ...s, description: e.target.value }))} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Exam Type</label>
            <select className={styles.select} value={settings.exam_type} onChange={e => setSettings(s => ({ ...s, exam_type: e.target.value as Exam['exam_type'] }))}>
              <option value="mcq">Multiple Choice</option>
              <option value="coding">Coding</option>
              <option value="mixed">Mixed</option>
            </select>
            <span style={{ fontSize: 11.5, color: '#9ca3af' }}>Changing the type controls which question kinds you can add.</span>
          </div>
          <div className={styles.gridTwo}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Available From</label>
              <input type="datetime-local" className={styles.input} value={settings.available_from} onChange={e => setSettings(s => ({ ...s, available_from: e.target.value }))} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Due At</label>
              <input type="datetime-local" className={styles.input} value={settings.due_at} onChange={e => setSettings(s => ({ ...s, due_at: e.target.value }))} />
            </div>
          </div>
          <div className={styles.gridTwo}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Duration (minutes)</label>
              <input type="number" min={1} className={styles.input} value={settings.duration_minutes} onChange={e => setSettings(s => ({ ...s, duration_minutes: Math.max(1, Number(e.target.value) || 1) }))} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Max Attempts</label>
              <input type="number" min={1} className={styles.input} value={settings.max_attempts} onChange={e => setSettings(s => ({ ...s, max_attempts: Math.max(1, Number(e.target.value) || 1) }))} />
            </div>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Pass Threshold (%): {settings.pass_threshold}</label>
            <input type="range" min={0} max={100} step={5} value={settings.pass_threshold} onChange={e => setSettings(s => ({ ...s, pass_threshold: Number(e.target.value) }))} style={{ width: '100%' }} />
          </div>

          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: '#111827' }}>Proctoring</h3>
            <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#6b7280' }}>
              Applies only to timed exams. Every violation is stored against the attempt and shown
              to you on the Results tab.
            </p>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, fontSize: 13.5, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.proctor_focus_enabled}
                onChange={e => setSettings(s => ({ ...s, proctor_focus_enabled: e.target.checked }))}
                style={{ width: 17, height: 17, accentColor: '#7c3aed' }}
              />
              <span>
                <strong>Focus tracking</strong>
                <span style={{ color: '#6b7280' }}> — record tab switches and focus loss</span>
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, fontSize: 13.5, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.proctor_lockdown_enabled}
                onChange={e => setSettings(s => ({ ...s, proctor_lockdown_enabled: e.target.checked }))}
                style={{ width: 17, height: 17, accentColor: '#7c3aed' }}
              />
              <span>
                <strong>Lockdown</strong>
                <span style={{ color: '#6b7280' }}> — block and record copy, paste and right-click</span>
              </span>
            </label>

            {(settings.proctor_focus_enabled || settings.proctor_lockdown_enabled) && (
              <div className={styles.formGroup} style={{ marginTop: 8, marginBottom: 0 }}>
                <label className={styles.formLabel}>Auto-submit after violations (0 = never)</label>
                <input
                  type="number" min={0} className={styles.input}
                  value={settings.max_violations}
                  onChange={e => setSettings(s => ({ ...s, max_violations: Math.max(0, Number(e.target.value) || 0) }))}
                />
              </div>
            )}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: '#374151', fontWeight: 600, marginBottom: 20, cursor: 'pointer' }}>
            <input type="checkbox" checked={settings.shuffle_questions} onChange={e => setSettings(s => ({ ...s, shuffle_questions: e.target.checked }))} style={{ width: 16, height: 16 }} />
            Shuffle question order per attempt
          </label>
          <button type="button" className={styles.primaryBtn} onClick={saveSettings} disabled={savingSettings}>
            {savingSettings ? <Loader2 size={16} className="spin" /> : <Save size={16} />} Save Settings
          </button>
        </section>
      )}

      {/* ══ RESULTS ════════════════════════════════════════════════════════ */}
      {tab === 'results' && (
        <section className={styles.tableCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Student Results</h2>
              <p className={styles.sectionSub}>
                {studentResults.length} student{studentResults.length === 1 ? '' : 's'}
                {' · best score shown; expand for every attempt and the answers'}
              </p>
            </div>
          </div>
          {loadingAttempts ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#6b7280', fontSize: 13.5, padding: 20 }}><Loader2 size={16} className="spin" /> Loading results…</div>
          ) : studentResults.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: 13.5, margin: 0, padding: '16px 0' }}>No attempts yet.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Student</th><th>Attempts</th><th>Best Score</th><th>Result</th>
                  <th>Violations</th><th>Last Activity</th><th></th>
                </tr>
              </thead>
              <tbody>
                {studentResults.map(st => (
                  <Fragment key={st.student_id}>
                    <tr>
                      <td>
                        <span className={styles.tdStrong}>{st.student_name}</span><br />
                        <span style={{ fontSize: 11.5, color: '#9ca3af' }}>{st.student_email}</span>
                      </td>
                      <td>
                        {st.attempts_used} / {exam?.max_attempts ?? '—'}
                        {st.attempts_count > st.attempts_used && (
                          <span style={{ fontSize: 11, color: '#9ca3af' }}> ({st.attempts_count} total)</span>
                        )}
                      </td>
                      <td>
                        {st.best_score != null
                          ? <span className={styles.tdStrong}>{Math.round(st.best_score)}%</span>
                          : <span style={{ color: '#9ca3af' }}>—</span>}
                      </td>
                      <td>
                        {st.best_score == null
                          ? <span className={`${styles.badge} ${styles.blueBadge}`}>{st.latest_status}</span>
                          : st.best_passed
                            ? <span className={`${styles.badge} ${styles.greenBadge}`}>Passed</span>
                            : <span className={`${styles.badge} ${styles.redBadge}`}>Failed</span>}
                      </td>
                      <td>
                        {st.violation_count > 0
                          ? <span className={`${styles.badge} ${styles.redBadge}`} title="Proctoring violations across attempts">{st.violation_count}</span>
                          : <span style={{ color: '#9ca3af', fontSize: 12 }}>none</span>}
                      </td>
                      <td>{fmtDateTime(st.latest_submitted_at)}</td>
                      <td>
                        <button
                          type="button"
                          className={styles.ghostBtn}
                          onClick={() => { setOpenStudent(openStudent === st.student_id ? null : st.student_id); setOpenAttempt(null); }}
                        >
                          {openStudent === st.student_id ? 'Hide' : `View attempts (${st.attempts_count})`}
                        </button>
                      </td>
                    </tr>

                    {openStudent === st.student_id && st.attempts.map((a, idx) => (
                      <Fragment key={a.attempt_id}>
                        <tr style={{ background: '#fbfaff' }}>
                          <td style={{ paddingLeft: 28 }}>
                            <span style={{ fontWeight: 700, color: '#4c1d95' }}>Attempt {st.attempts.length - idx}</span>
                            <br />
                            <span style={{ fontSize: 11.5, color: '#9ca3af' }}>
                              <span className={`${styles.badge} ${a.status === 'submitted' ? styles.greenBadge : a.status === 'expired' ? styles.amberBadge : styles.blueBadge}`}>{a.status}</span>
                            </span>
                          </td>
                          <td>
                            <span style={{ fontWeight: 700 }}>{Math.round(a.score ?? 0)}%</span>
                            <br />
                            <span style={{ fontSize: 11.5, color: '#9ca3af' }}>{a.total_points ?? 0} / {a.max_points ?? 0} pts</span>
                          </td>
                          <td>
                            {a.status === 'in_progress'
                              ? <span className={`${styles.badge} ${styles.blueBadge}`}>In progress</span>
                              : a.passed
                                ? <span className={`${styles.badge} ${styles.greenBadge}`}>Passed</span>
                                : <span className={`${styles.badge} ${styles.redBadge}`}>Failed</span>}
                          </td>
                          <td>
                            {(a.violation_count ?? 0) > 0
                              ? <span style={{ color: '#b91c1c', fontWeight: 700, fontSize: 12.5 }}>{a.violation_count} ⚠️</span>
                              : <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>}
                          </td>
                          <td>{fmtDateTime(a.submitted_at)}</td>
                          <td>
                            {a.answers && a.answers.length > 0 && (
                              <button
                                type="button"
                                className={styles.ghostBtn}
                                onClick={() => setOpenAttempt(openAttempt === a.attempt_id ? null : a.attempt_id)}
                              >
                                {openAttempt === a.attempt_id ? 'Hide' : `Answers (${a.answers.length})`}
                              </button>
                            )}
                          </td>
                          <td />
                        </tr>

                        {openAttempt === a.attempt_id && (a.violations?.length ?? 0) > 0 && (
                          <tr>
                            <td colSpan={7} style={{ background: '#fef2f2', padding: '10px 16px' }}>
                              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#991b1b', marginBottom: 6 }}>
                                Proctoring violations
                              </div>
                              {a.violations!.map((v, vi) => (
                                <div key={vi} style={{ fontSize: 12.5, color: '#7f1d1d' }}>
                                  {fmtDateTime(v.recorded_at)} — <strong>{v.event_type.replace(/_/g, ' ')}</strong>
                                  {v.severity ? ` (${v.severity})` : ''}
                                  {v.payload?.detail ? ` · ${String(v.payload.detail)}` : ''}
                                </div>
                              ))}
                            </td>
                          </tr>
                        )}

                        {openAttempt === a.attempt_id && a.answers && a.answers.length > 0 && (
                          <tr>
                            <td colSpan={7} style={{ background: '#faf9ff', padding: '4px 16px 18px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {a.answers.map((qq, qi) => (
                                  <div key={qq.question_id} style={{ borderLeft: `3px solid ${qq.is_correct ? '#16a34a' : '#dc2626'}`, paddingLeft: 12 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 4 }}>
                                      {qi + 1}. {qq.prompt}
                                    </div>
                                    <div style={{ fontSize: 12.5, color: '#374151' }}>
                                      Student answered:{' '}
                                      <strong style={{ color: qq.is_correct ? '#16a34a' : '#dc2626' }}>
                                        {qq.student_answer_text == null || qq.student_answer_text === '' ? '(left blank)' : String(qq.student_answer_text)}
                                      </strong>
                                    </div>
                                    {!qq.is_correct && (
                                      <div style={{ fontSize: 12.5, color: '#374151' }}>
                                        Correct answer: <strong style={{ color: '#16a34a' }}>{String(qq.correct_answer_text ?? '—')}</strong>
                                      </div>
                                    )}
                                    <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 2 }}>
                                      {qq.earned != null ? `${qq.earned} / ${qq.points ?? '—'} points` : 'Ungraded'}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* ══ QUESTION EDITOR MODAL ══════════════════════════════════════════ */}
      {draft && (
        <div className={styles.modalOverlay} onClick={() => !savingQ && setDraft(null)}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()} style={{ maxWidth: 720 }}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                {draft.id ? 'Edit' : 'Add'} {draft.question_type === 'mcq' ? 'MCQ' : 'Coding'} Question
              </h3>
              <button type="button" className={styles.closeBtn} onClick={() => setDraft(null)}><X size={17} /></button>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Prompt *</label>
              <textarea className={styles.textarea} value={draft.prompt} onChange={e => setDraft(d => d ? { ...d, prompt: e.target.value } : d)} placeholder="Write the question…" />
            </div>

            <div className={styles.gridTwo}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Points</label>
                <input type="number" min={0} step={0.5} className={styles.input} value={draft.points} onChange={e => setDraft(d => d ? { ...d, points: Number(e.target.value) || 0 } : d)} />
              </div>
              {draft.question_type === 'coding' && (
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Language</label>
                  <select className={styles.select} value={draft.language} onChange={e => setDraft(d => d ? { ...d, language: e.target.value } : d)}>
                    {CODE_LANGS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              )}
            </div>

            {draft.question_type === 'mcq' ? (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Options (select the correct one)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {draft.options.map((opt, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input type="radio" name="correct" checked={draft.correct_answer === String(i)}
                        onChange={() => setDraft(d => d ? { ...d, correct_answer: String(i) } : d)}
                        title="Mark as correct" style={{ width: 17, height: 17, cursor: 'pointer', accentColor: '#7c3aed' }} />
                      <span style={{ fontWeight: 700, color: '#7c3aed', width: 16 }}>{String.fromCharCode(65 + i)}</span>
                      <input className={styles.input} value={opt} placeholder={`Option ${String.fromCharCode(65 + i)}`}
                        onChange={e => setDraft(d => {
                          if (!d) return d;
                          const options = [...d.options]; options[i] = e.target.value; return { ...d, options };
                        })} />
                    </div>
                  ))}
                </div>
                <button type="button" className={styles.ghostBtn} style={{ marginTop: 8 }}
                  onClick={() => setDraft(d => d ? { ...d, options: [...d.options, ''] } : d)} disabled={draft.options.length >= 6}>
                  <Plus size={14} /> Add Option
                </button>
              </div>
            ) : (
              <>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Starter Code</label>
                  <textarea value={draft.starter_code} onChange={e => setDraft(d => d ? { ...d, starter_code: e.target.value } : d)}
                    spellCheck={false}
                    style={{ width: '100%', minHeight: 140, fontFamily: "'JetBrains Mono', monospace", fontSize: 13, padding: 14, borderRadius: 12, background: '#201b2e', color: '#e9d5ff', border: '1px solid #3b2f52', outline: 'none', lineHeight: 1.55, resize: 'vertical' }}
                    placeholder="# Code the student starts with" />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Test Cases (input → expected output)</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {draft.test_cases.map((tc, i) => (
                      <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,.6)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#6b7280' }}>Case {i + 1}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#6b7280', cursor: 'pointer' }}>
                              <input type="checkbox" checked={!!tc.hidden} style={{ accentColor: '#7c3aed' }}
                                onChange={e => setDraft(d => {
                                  if (!d) return d;
                                  const test_cases = [...d.test_cases]; test_cases[i] = { ...tc, hidden: e.target.checked }; return { ...d, test_cases };
                                })} /> Hidden
                            </label>
                            <input type="number" min={1} value={tc.weight ?? 1} title="Weight"
                              onChange={e => setDraft(d => {
                                if (!d) return d;
                                const test_cases = [...d.test_cases]; test_cases[i] = { ...tc, weight: Number(e.target.value) || 1 }; return { ...d, test_cases };
                              })}
                              style={{ width: 56, padding: '4px 6px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                            <button type="button" onClick={() => setDraft(d => {
                              if (!d) return d;
                              const test_cases = d.test_cases.filter((_, k) => k !== i);
                              return { ...d, test_cases: test_cases.length ? test_cases : [{ input: '', expected: '', hidden: false, weight: 1 }] };
                            })} style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer' }}><Trash2 size={14} /></button>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <textarea value={tc.input} placeholder="Input (stdin)" onChange={e => setDraft(d => {
                            if (!d) return d;
                            const test_cases = [...d.test_cases]; test_cases[i] = { ...tc, input: e.target.value }; return { ...d, test_cases };
                          })} style={{ minHeight: 60, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, padding: 8, borderRadius: 8, border: '1px solid #e5e7eb', resize: 'vertical' }} />
                          <textarea value={tc.expected} placeholder="Expected output" onChange={e => setDraft(d => {
                            if (!d) return d;
                            const test_cases = [...d.test_cases]; test_cases[i] = { ...tc, expected: e.target.value }; return { ...d, test_cases };
                          })} style={{ minHeight: 60, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, padding: 8, borderRadius: 8, border: '1px solid #e5e7eb', resize: 'vertical' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <button type="button" className={styles.ghostBtn} style={{ marginTop: 8 }}
                    onClick={() => setDraft(d => d ? { ...d, test_cases: [...d.test_cases, { input: '', expected: '', hidden: false, weight: 1 }] } : d)}>
                    <Plus size={14} /> Add Test Case
                  </button>
                </div>
              </>
            )}

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Explanation (shown to students after submission)</label>
              <textarea className={styles.textarea} value={draft.explanation} onChange={e => setDraft(d => d ? { ...d, explanation: e.target.value } : d)} />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className={styles.secondaryBtn} onClick={() => setDraft(null)} disabled={savingQ}>Cancel</button>
              <button type="button" className={styles.primaryBtn} onClick={saveQuestion} disabled={savingQ}>
                {savingQ ? <Loader2 size={16} className="spin" /> : <Save size={16} />} {draft.id ? 'Save Changes' : 'Add Question'}
              </button>
            </div>
          </div>
        </div>
      )}
    </InstructorShell>
  );
}
