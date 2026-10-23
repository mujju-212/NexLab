'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, Timer, Send, ChevronLeft, ChevronRight, HelpCircle, Code2, ArrowLeft,
  Play, Terminal,
} from 'lucide-react';
import StudentShell from '@/components/layout/StudentShell';
import styles from '../../exams.module.css';
import {
  examService, type Exam, type ExamQuestion, type ExamAttempt, type ProctorConfig,
} from '@/services/exam.service';
import { useServerCountdown } from '@/lib/countdown';

type Answers = Record<string, unknown>;

export default function TakeExamPage({ params }: { params: Promise<{ examId: string }> }) {
  const router = useRouter();
  const [examId, setExamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [proctor, setProctor] = useState<ProctorConfig | null>(null);
  const [violationCount, setViolationCount] = useState(0);
  const [violationNotice, setViolationNotice] = useState<string | null>(null);

  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [answers, setAnswers] = useState<Answers>({});
  const [current, setCurrent] = useState(0);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [serverNow, setServerNow] = useState<string>(new Date().toISOString());

  const [submitting, setSubmitting] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Coding execution states
  const [runningQuestionId, setRunningQuestionId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, Array<{
    index: number;
    input: string;
    expected: string | null;
    actual: string;
    stderr: string;
    compile_output?: string;
    passed: boolean;
    status: string;
    time_ms?: number;
    memory_kb?: number;
  }>>>({});
  const [runError, setRunError] = useState<Record<string, string>>({});

  // Refs keep the latest values available to timers/effects without re-firing them.
  const answersRef = useRef<Answers>({});
  const attemptRef = useRef<ExamAttempt | null>(null);
  const dirtyRef = useRef(false);
  const submittedRef = useRef(false);

  // ── Start (or resume) the attempt ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { examId: id } = await params;
      if (cancelled) return;
      setExamId(id);
      try {
        const res = await examService.startExam(id);
        if (cancelled) return;
        const init: Answers = { ...(res.answers || {}) };
        // Seed coding answers with starter code so a submit without edits still runs it.
        for (const q of res.questions) {
          if (q.question_type === 'coding' && init[q.id] == null) init[q.id] = q.starter_code ?? '';
        }
        answersRef.current = init;
        attemptRef.current = res.attempt;
        setAttempt(res.attempt);
        setExam(res.exam);
        setQuestions(res.questions);
        setAnswers(init);
        setExpiresAt(res.expires_at);
        setServerNow(res.server_now);
        setProctor(res.proctor ?? null);
        setViolationCount(res.violations?.total ?? 0);
      } catch (e) {
        if (!cancelled) {
          const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
          setError(msg || 'Could not start this exam.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [params]);

  const cd = useServerCountdown(expiresAt, serverNow);

  const setAnswer = useCallback((qid: string, value: unknown) => {
    setAnswers(prev => {
      const next = { ...prev, [qid]: value };
      answersRef.current = next;
      return next;
    });
    dirtyRef.current = true;
  }, []);

  // ── Debounced auto-save (1.2s after the last edit) ───────────────────────
  useEffect(() => {
    if (!attempt || submitting || !dirtyRef.current) return;
    setSaveState('saving');
    const t = setTimeout(() => {
      examService.saveAttempt(examId!, attempt.id, answersRef.current)
        .then(() => { setSaveState('saved'); dirtyRef.current = false; })
        .catch((err: unknown) => {
          const res = (err as { response?: { status?: number; data?: { error?: string } } })?.response;
          setSaveState('idle');
          // 403 = the attempt clock has run out. Say so instead of letting the
          // student keep typing into a form that is no longer being saved.
          if (res?.status === 403) {
            setError(res.data?.error || 'Time is up for this attempt.');
          }
        });
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, attempt, submitting]);

  const doSubmit = useCallback(async () => {
    if (!attempt || !examId || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setConfirmOpen(false);
    try {
      // Flush any pending edits, then submit the full answer set.
      await examService.submitAttempt(examId, attempt.id, answersRef.current);
      router.replace(`/student/exams/${examId}/result`);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      submittedRef.current = false;
      setSubmitting(false);
      setError(msg || 'Submission failed. Please try again.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, examId, router]);

  // ── Proctoring: report focus/lockdown violations while the exam is live ──
  // The server decides what counts; this only reports what it asked to watch.
  useEffect(() => {
    if (!proctor || !attempt || !examId) return;
    if (!proctor.focus_enabled && !proctor.lockdown_enabled) return;
    if (submitting || submittedRef.current) return;

    const report = (eventType: string, detail?: string) => {
      if (submittedRef.current) return;
      examService.recordViolation(examId, attempt.id, eventType, detail)
        .then(res => {
          setViolationCount(res.violations.total);
          const remaining = res.remaining_before_auto_submit;
          setViolationNotice(
            res.auto_submitted
              ? 'Too many proctoring violations — your exam has been submitted automatically.'
              : remaining != null && remaining <= 2
                ? `Proctoring warning: ${res.violations.total} violation(s) recorded. ${remaining} more and your exam is submitted automatically.`
                : `${res.violations.total} proctoring violation(s) recorded. Your instructor can see these.`,
          );
          if (res.auto_submitted) {
            submittedRef.current = true;
            router.replace(`/student/exams/${examId}/result`);
          }
        })
        .catch(() => { /* never block the exam on a reporting failure */ });
    };

    const onVisibility = () => { if (document.hidden) report('tab_switch', 'tab hidden during exam'); };
    const onBlur = () => report('focus_lost', 'window lost focus');
    const onFullscreen = () => {
      if (!document.fullscreenElement) report('fullscreen_exit', 'left fullscreen');
    };
    const onCopy = (e: ClipboardEvent) => {
      if (!proctor.lockdown_enabled) return;
      e.preventDefault();
      report('copy', 'copy attempted');
    };
    const onPaste = (e: ClipboardEvent) => {
      if (!proctor.lockdown_enabled) return;
      e.preventDefault();
      report('paste', 'paste attempted');
    };
    const onContextMenu = (e: MouseEvent) => {
      if (!proctor.lockdown_enabled) return;
      e.preventDefault();
      report('context_menu', 'right-click attempted');
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', onContextMenu);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('contextmenu', onContextMenu);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proctor, attempt, examId, submitting, router]);

  // ── Auto-submit when the countdown hits zero ─────────────────────────────
  useEffect(() => {
    if (cd.ready && cd.expired && attempt && expiresAt && !submittedRef.current && !submitting) {
      doSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cd.expired, attempt, expiresAt]);

  const isAnswered = useCallback((qq: ExamQuestion): boolean => {
    const a = answers[qq.id];
    if (qq.question_type === 'mcq') return a != null && a !== '';
    const code = typeof a === 'string' ? a : '';
    const starter = qq.starter_code ?? '';
    return code.trim().length > 0 && code !== starter;
  }, [answers]);

  const handleRunSampleTests = async (q: ExamQuestion) => {
    if (!examId) return;
    const currentCode = typeof answers[q.id] === 'string' ? (answers[q.id] as string) : (q.starter_code ?? '');
    if (!currentCode.trim()) {
      setRunError(prev => ({ ...prev, [q.id]: 'Please write some code before testing.' }));
      return;
    }
    setRunningQuestionId(q.id);
    setRunError(prev => ({ ...prev, [q.id]: '' }));

    try {
      const res = await examService.runCode(examId, {
        question_id: q.id,
        code: currentCode,
        language: q.language || 'python',
      });
      setTestResults(prev => ({ ...prev, [q.id]: res.results }));
    } catch (err: any) {
      setRunError(prev => ({ ...prev, [q.id]: err?.response?.data?.error || err?.message || 'Execution error.' }));
    } finally {
      setRunningQuestionId(null);
    }
  };

  if (loading) {
    return (
      <StudentShell activePage="Exams" title="Exam" subtitle="Starting your attempt…">
        <div className={styles.loadingBox}><Loader2 size={20} className={styles.spinner} /> Starting exam…</div>
      </StudentShell>
    );
  }

  if (error && !attempt) {
    return (
      <StudentShell activePage="Exams" title="Exam" subtitle="Unable to start">
        <div className={styles.errorBox}>⚠️ {error}</div>
        <button type="button" className={styles.secondaryBtn}
          onClick={() => router.push(examId ? `/student/exams/${examId}` : '/student/exams')}>
          <ArrowLeft size={16} /> Back
        </button>
      </StudentShell>
    );
  }

  const q = questions[current];
  const answeredCount = questions.filter(isAnswered).length;

  return (
    <StudentShell activePage="Exams" title={exam?.title || 'Exam'} subtitle="Answer every question — your work auto-saves">
      {error && <div className={styles.errorBox}>⚠️ {error}</div>}

      {/* Proctoring: the student is told, in advance and as it happens. */}
      {proctor && (proctor.focus_enabled || proctor.lockdown_enabled) && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
            padding: '10px 14px', borderRadius: 10,
            background: violationCount > 0 ? '#fef2f2' : '#f5f3ff',
            border: `1px solid ${violationCount > 0 ? '#fecaca' : '#ddd6fe'}`,
            color: violationCount > 0 ? '#991b1b' : '#5b21b6',
            fontSize: 13, fontWeight: 500,
          }}
        >
          <span style={{ fontSize: 16 }}>{violationCount > 0 ? '⚠️' : '👁️'}</span>
          <span>
            {violationNotice
              ?? `This exam is proctored${proctor.focus_enabled ? ' — leaving this tab or losing focus is recorded' : ''}${proctor.lockdown_enabled ? '; copy, paste and right-click are blocked' : ''}.`}
            {proctor.max_violations > 0 && violationCount === 0 && (
              <strong> Auto-submit after {proctor.max_violations} violations.</strong>
            )}
          </span>
          {violationCount > 0 && (
            <strong style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
              {violationCount} violation{violationCount === 1 ? '' : 's'}
              {proctor.max_violations > 0 ? ` / ${proctor.max_violations}` : ''}
            </strong>
          )}
        </div>
      )}

      {/* Header: progress + live countdown + submit */}
      <div className={styles.takeHeader}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#111827', letterSpacing: '-.02em' }}>
            {exam?.title}
          </h2>
          <p style={{ margin: '5px 0 0', fontSize: 12.5, color: '#6b7280' }}>
            Question {questions.length ? current + 1 : 0} of {questions.length} · {answeredCount} answered
            {saveState === 'saving' && <span style={{ color: '#b45309' }}> · Saving…</span>}
            {saveState === 'saved' && <span style={{ color: '#059669' }}> · Saved ✓</span>}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className={`${styles.countdownPill} ${cd.warn ? styles.countdownWarn : ''} ${cd.expired ? styles.countdownExpired : ''}`}>
            <Timer size={16} /> {cd.label}
          </span>
          <button type="button" className={styles.primaryBtn} onClick={() => setConfirmOpen(true)} disabled={submitting}>
            {submitting ? <Loader2 size={16} className={styles.spinner} /> : <Send size={16} />} Submit
          </button>
        </div>
      </div>

      <div className={styles.takeLayout}>
        {/* Question navigator */}
        <aside className={styles.navPanel}>
          <p className={styles.navTitle}>Questions</p>
          <div className={styles.navGrid}>
            {questions.map((qq, i) => (
              <button key={qq.id} type="button"
                className={`${styles.navDot} ${i === current ? styles.navActive : isAnswered(qq) ? styles.navAnswered : ''}`}
                onClick={() => setCurrent(i)}>
                {i + 1}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 16, fontSize: 11.5, color: '#9ca3af', lineHeight: 1.7 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 12, height: 12, borderRadius: 4, background: 'rgba(236,253,245,.9)', border: '1.5px solid rgba(16,185,129,.4)' }} /> Answered
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 12, height: 12, borderRadius: 4, background: '#fff', border: '1.5px solid #e5e7eb' }} /> Not answered
            </div>
          </div>
        </aside>

        {/* Active question */}
        <section className={styles.questionCard}>
          {!q ? (
            <p style={{ margin: 0, color: '#9ca3af', fontSize: 14, textAlign: 'center', padding: '20px 0' }}>
              This exam has no questions. You can submit to finish.
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                <span className={`${styles.badge} ${q.question_type === 'mcq' ? styles.blueBadge : styles.greenBadge}`}>
                  {q.question_type === 'mcq' ? <HelpCircle size={11} /> : <Code2 size={11} />}
                  {q.question_type === 'mcq' ? 'Multiple Choice' : `Coding · ${q.language || 'python'}`}
                </span>
                <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>
                  {q.points} point{q.points === 1 ? '' : 's'}
                </span>
              </div>

              <p className={styles.qPrompt}>{q.prompt}</p>

              {q.question_type === 'mcq' ? (
                <div className={styles.mcqOptions}>
                  {(q.options || []).map((opt, i) => {
                    const selected = answers[q.id] != null && Number(answers[q.id]) === i;
                    return (
                      <button key={i} type="button"
                        className={`${styles.mcqOption} ${selected ? styles.mcqOptionSelected : ''}`}
                        onClick={() => setAnswer(q.id, i)}>
                        <span className={styles.mcqLetter}>{String.fromCharCode(65 + i)}</span>
                        <span>{opt || `Option ${String.fromCharCode(65 + i)}`}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <>
                  <textarea
                    className={styles.codeEditor}
                    spellCheck={false}
                    value={typeof answers[q.id] === 'string' ? (answers[q.id] as string) : (q.starter_code ?? '')}
                    onChange={e => setAnswer(q.id, e.target.value)}
                    placeholder="# Write your exam solution code here..."
                  />

                  {/* Run Sample Tests Action Row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, flexWrap: 'wrap', gap: 10 }}>
                    <button
                      type="button"
                      disabled={runningQuestionId === q.id}
                      onClick={() => handleRunSampleTests(q)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '9px 18px',
                        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: runningQuestionId === q.id ? 'not-allowed' : 'pointer',
                        boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
                      }}
                    >
                      {runningQuestionId === q.id ? (
                        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <Play size={14} fill="#ffffff" />
                      )}
                      <span>{runningQuestionId === q.id ? 'Running Tests…' : 'Run Sample Tests'}</span>
                    </button>

                    <span style={{ fontSize: 12, color: '#64748b' }}>
                      Tests your code against public sample cases (does not submit exam attempt).
                    </span>
                  </div>

                  {runError[q.id] && (
                    <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13 }}>
                      ⚠️ {runError[q.id]}
                    </div>
                  )}

                  {/* Real Execution Console & Results */}
                  {testResults[q.id] && testResults[q.id].length > 0 && (
                    <div style={{ marginTop: 16, border: '1px solid #334155', borderRadius: 10, overflow: 'hidden', background: '#0f172a', color: '#f8fafc' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#1e293b', borderBottom: '1px solid #334155' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Terminal size={15} color="#38bdf8" />
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>Sample Test Cases Console</span>
                        </div>
                        <span style={{
                          fontSize: 12, fontWeight: 700,
                          padding: '3px 10px', borderRadius: 999,
                          background: testResults[q.id].every(r => r.passed) ? 'rgba(74, 222, 128, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                          color: testResults[q.id].every(r => r.passed) ? '#4ade80' : '#fbbf24'
                        }}>
                          {testResults[q.id].filter(r => r.passed).length} / {testResults[q.id].length} Passed
                        </span>
                      </div>
                      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {testResults[q.id].map((r, i) => (
                          <div key={i} style={{ background: '#1e293b', borderRadius: 8, padding: 12, border: `1px solid ${r.passed ? 'rgba(74, 222, 128, 0.3)' : 'rgba(239, 68, 68, 0.3)'}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>Sample Case #{r.index}</span>
                              <span style={{
                                fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999,
                                background: r.passed ? 'rgba(74, 222, 128, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                color: r.passed ? '#4ade80' : '#f87171'
                              }}>
                                {r.passed ? 'PASSED ✅' : 'FAILED ❌'} {r.time_ms != null ? `· ${r.time_ms}ms` : ''}
                              </span>
                            </div>
                            <div style={{ fontSize: 12, fontFamily: 'monospace' }}>
                              <div style={{ color: '#94a3b8', marginBottom: 3 }}>Input: <span style={{ color: '#f8fafc' }}>{r.input || '(none)'}</span></div>
                              {r.expected !== null && (
                                <div style={{ color: '#94a3b8', marginBottom: 3 }}>Expected: <span style={{ color: '#4ade80' }}>{r.expected}</span></div>
                              )}
                              <div style={{ color: '#94a3b8', marginBottom: 3 }}>Actual Output: <span style={{ color: r.passed ? '#f8fafc' : '#f87171' }}>{r.actual || '(no output)'}</span></div>
                              {r.stderr && (
                                <div style={{ color: '#f87171', marginTop: 4, background: 'rgba(239, 68, 68, 0.1)', padding: '4px 8px', borderRadius: 4 }}>
                                  Stderr: {r.stderr}
                                </div>
                              )}
                              {r.compile_output && (
                                <div style={{ color: '#fbbf24', marginTop: 4, background: 'rgba(245, 158, 11, 0.1)', padding: '4px 8px', borderRadius: 4 }}>
                                  Compiler: {r.compile_output}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(q.test_cases || []).length > 0 && (
                    <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <p className={styles.tcLabel}>Sample test case specifications</p>
                      {q.test_cases!.map((tc, i) => (
                        <div key={i} className={styles.tcBox}>
                          <div className={styles.tcLabel}>Input</div>
                          <pre className={styles.tcPre}>{tc.input || '(none)'}</pre>
                          <div className={styles.tcLabel} style={{ marginTop: 8 }}>Expected output</div>
                          <pre className={styles.tcPre}>{tc.expected || '(empty)'}</pre>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Prev / Next */}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 26 }}>
                <button type="button" className={styles.secondaryBtn}
                  onClick={() => setCurrent(c => Math.max(0, c - 1))} disabled={current === 0}>
                  <ChevronLeft size={16} /> Previous
                </button>
                {current < questions.length - 1 ? (
                  <button type="button" className={styles.primaryBtn}
                    onClick={() => setCurrent(c => Math.min(questions.length - 1, c + 1))}>
                    Next <ChevronRight size={16} />
                  </button>
                ) : (
                  <button type="button" className={styles.primaryBtn} onClick={() => setConfirmOpen(true)} disabled={submitting}>
                    <Send size={16} /> Submit Exam
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* Confirm submit modal */}
      {confirmOpen && (
        <div className={styles.modalOverlay} onClick={() => !submitting && setConfirmOpen(false)}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 800, color: '#111827' }}>Submit exam?</h3>
            <p style={{ margin: '0 0 20px', fontSize: 13.5, color: '#475569', lineHeight: 1.6 }}>
              You have answered <strong>{answeredCount}</strong> of <strong>{questions.length}</strong> questions.
              {answeredCount < questions.length && ' Unanswered questions will be scored as incorrect.'}
              {' '}Once submitted, you cannot change your answers.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className={styles.secondaryBtn} onClick={() => setConfirmOpen(false)} disabled={submitting}>
                Keep Working
              </button>
              <button type="button" className={styles.primaryBtn} onClick={doSubmit} disabled={submitting}>
                {submitting ? <Loader2 size={16} className={styles.spinner} /> : <Send size={16} />} Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </StudentShell>
  );
}
