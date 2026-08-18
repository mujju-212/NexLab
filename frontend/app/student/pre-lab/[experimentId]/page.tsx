'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DOMPurify from 'dompurify';
import StudentShell from '@/components/layout/StudentShell';
import { studentService } from '@/services/student.service';
import { executionService, type PlaygroundResult } from '@/services/execution.service';
import { renderMarkdown } from '@/lib/markdown';
import type { ContentModule, QuizQuestion } from '@/types';
import { Loader2, ArrowLeft, CheckCircle2, FileText, PlayCircle, HelpCircle, BookOpen, Code2, Image as ImageIcon, FileCode, Play } from 'lucide-react';
import styles from '../page.module.css';

interface QuizResult {
  score: number;
  passed: boolean;
  threshold: number;
  attempts_used: number;
  correct_count: number;
  total_points: number;
}

const MODULE_ICONS: Record<string, typeof BookOpen> = {
  text: BookOpen, video: PlayCircle, pdf: FileText, quiz: HelpCircle,
  markdown: FileCode, code: Code2, image: ImageIcon,
};

export default function PreLabDetailPage() {
  const router = useRouter();
  const params = useParams<{ experimentId: string }>();
  const experimentId = params.experimentId;

  const [modules, setModules] = useState<ContentModule[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Quiz state
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<QuizResult | null>(null);

  // Runnable code-block state (keyed by module id)
  const [codeRunning, setCodeRunning] = useState(false);
  const [codeResult, setCodeResult] = useState<PlaygroundResult | null>(null);

  const loadModules = useCallback(async () => {
    try {
      const mods = await studentService.getPreLabContent(experimentId);
      setModules(mods);
      setActiveId(prev => prev ?? mods[0]?.id ?? null);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pre-lab content');
    } finally {
      setLoading(false);
    }
  }, [experimentId]);

  useEffect(() => { loadModules(); }, [loadModules]);

  const active = modules.find(m => m.id === activeId) || null;
  const doneCount = modules.filter(m => m.completed).length;
  const progressPct = modules.length ? Math.round((doneCount / modules.length) * 100) : 0;
  const allDone = modules.length > 0 && doneCount === modules.length;

  // Sanitize instructor-authored HTML once per active text module
  const safeHtml = useMemo(() => {
    if (!active || active.type !== 'text') return '';
    const raw = String((active.content_data as { html?: string })?.html || '<p>No content available.</p>');
    return DOMPurify.sanitize(raw);
  }, [active]);

  // Render + sanitize markdown for the active markdown module
  const safeMd = useMemo(() => {
    if (!active || active.type !== 'markdown') return '';
    return renderMarkdown(String((active.content_data as { md?: string })?.md || ''));
  }, [active]);

  // Reset any code-run output when switching modules
  useEffect(() => { setCodeResult(null); setCodeRunning(false); }, [activeId]);

  const runStudentCode = async () => {
    if (!active) return;
    const cd = (active.content_data as { code?: string; language?: string; stdin?: string }) || {};
    if (!cd.code) return;
    setCodeRunning(true);
    setCodeResult(null);
    try {
      const res = await executionService.runPlayground({
        code: String(cd.code), language: String(cd.language || 'python'), stdin: String(cd.stdin || ''),
      });
      setCodeResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not run code');
    } finally {
      setCodeRunning(false);
    }
  };

  const markComplete = async (mod: ContentModule) => {
    try {
      await studentService.markModuleComplete(mod.id);
      setModules(ms => ms.map(m => m.id === mod.id ? { ...m, completed: true } : m));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not mark module complete');
    }
  };

  const openQuiz = async (quizModule: ContentModule) => {
    setActiveId(quizModule.id);
    setQuizError('');
    setResult(null);
    setAnswers({});
    setQuestions([]);
    setQuizLoading(true);
    try {
      const qs = await studentService.getQuizQuestions(quizModule.id);
      setQuestions(qs);
    } catch (e) {
      setQuizError(e instanceof Error ? e.message : 'Could not start quiz');
    } finally {
      setQuizLoading(false);
    }
  };

  const submitQuiz = async () => {
    if (!active) return;
    setSubmitting(true);
    setQuizError('');
    try {
      const res = await studentService.submitQuiz(active.id, answers);
      setResult(res);
      await loadModules(); // refresh completion state
    } catch (e) {
      setQuizError(e instanceof Error ? e.message : 'Quiz submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <StudentShell activePage="Pre-Lab">
        <div className={styles.loadingBox}><Loader2 size={20} className={styles.spinner} /> Loading pre-lab modules…</div>
      </StudentShell>
    );
  }

  return (
    <StudentShell activePage="Pre-Lab" title="Pre-Lab Preparation" subtitle="Complete every module to unlock your live lab session">
      <button className={styles.backBtn} onClick={() => router.push('/student/pre-lab')}>
        <ArrowLeft size={14} strokeWidth={2.2} /> All pre-labs
      </button>

      {error && <div className={styles.errorBox}>⚠️ {error}</div>}
      {!error && modules.length === 0 && (
        <div className={styles.errorBox}>This experiment has no pre-lab content yet. Check back later.</div>
      )}

      {modules.length > 0 && (
        <div className={styles.layout}>
          {/* ── Module List ── */}
          <div className={styles.expList}>
            <div className={styles.expCard} style={{ cursor: 'default' }}>
              <p className={styles.expTitle}>Progress</p>
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: `${progressPct}%`, background: '#9333ea' }} />
              </div>
              <p className={styles.progressPct}>{progressPct}% · {doneCount}/{modules.length} modules</p>
              {allDone && (
                <button className={styles.joinBtn} onClick={() => router.push('/student/live-lab')}>
                  🚀 All done — go to Live Lab
                </button>
              )}
            </div>

            {modules.map((m, i) => {
              const Icon = MODULE_ICONS[m.type] || BookOpen;
              return (
                <div
                  key={m.id}
                  className={`${styles.expCard} ${activeId === m.id ? styles.expCardActive : ''}`}
                  onClick={() => m.type === 'quiz' ? openQuiz(m) : (setActiveId(m.id), setResult(null), setQuizError(''))}
                >
                  <div className={styles.expCardTop}>
                    <div className={styles.expDot} style={{ background: m.completed ? '#22c55e' : '#9333ea' }}>
                      {m.completed ? '✓' : ''}
                    </div>
                    <span className={`${styles.statusBadge} ${m.completed ? styles.badgeGreen : styles.badgeGray}`}>
                      {m.completed ? '✓ Done' : `Step ${i + 1}`}
                    </span>
                  </div>
                  <p className={styles.expTitle} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon size={15} strokeWidth={2} /> {m.title}
                  </p>
                  <p className={styles.expMeta}>
                    {m.type === 'text' || m.type === 'markdown' ? 'Reading'
                      : m.type === 'video' ? 'Video'
                      : m.type === 'pdf' ? 'PDF Document'
                      : m.type === 'code' ? 'Code Snippet'
                      : m.type === 'image' ? 'Image'
                      : `Quiz · pass ≥ ${m.quiz_config?.pass_threshold ?? 70}%`}
                    {m.type === 'quiz' && ` · ${m.quiz_config?.attempts_used ?? 0}/${m.quiz_config?.max_attempts ?? 3} attempts used`}
                    {m.type === 'quiz' && m.score != null && ` · last score ${Math.round(m.score)}%`}
                  </p>
                </div>
              );
            })}
          </div>

          {/* ── Module Detail ── */}
          <div className={styles.detailPanel}>
            {!active && (
              <div className={styles.placeholder}>
                <div className={styles.placeholderIcon}>🧪</div>
                <h3 className={styles.placeholderTitle}>Select a module</h3>
                <p className={styles.placeholderSub}>Choose a step from the list to begin</p>
              </div>
            )}

            {active && active.type === 'text' && (
              <div className={styles.tabContent}>
                <div className={styles.theoryBox}>
                  <h3 className={styles.theoryHeading}>📖 {active.title}</h3>
                  <div
                    className={styles.theoryText}
                    dangerouslySetInnerHTML={{ __html: safeHtml }}
                  />
                  {!active.completed && (
                    <button className={styles.submitBtn} onClick={() => markComplete(active)}>✓ Mark as Read</button>
                  )}
                  {active.completed && <p className={styles.completedNote}><CheckCircle2 size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Completed</p>}
                </div>
              </div>
            )}

            {active && active.type === 'markdown' && (
              <div className={styles.tabContent}>
                <div className={styles.theoryBox}>
                  <h3 className={styles.theoryHeading}>📖 {active.title}</h3>
                  <div className={styles.theoryText} dangerouslySetInnerHTML={{ __html: safeMd }} />
                  {!active.completed && (
                    <button className={styles.submitBtn} onClick={() => markComplete(active)}>✓ Mark as Read</button>
                  )}
                  {active.completed && <p className={styles.completedNote}><CheckCircle2 size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Completed</p>}
                </div>
              </div>
            )}

            {active && active.type === 'code' && (
              <div className={styles.tabContent}>
                <div className={styles.theoryBox}>
                  <h3 className={styles.theoryHeading}>💻 {active.title}</h3>
                  <p className={styles.expMeta} style={{ marginBottom: 8 }}>
                    {String((active.content_data as { language?: string })?.language || 'code')}
                    {(active.content_data as { runnable?: boolean })?.runnable ? ' · runnable' : ' · read-only'}
                  </p>
                  <pre style={{ margin: 0, padding: '12px 14px', borderRadius: 8, background: '#0f0b17', color: '#e7e3f0', fontSize: 13, overflow: 'auto', whiteSpace: 'pre', lineHeight: 1.5 }}>
                    {String((active.content_data as { code?: string })?.code || '')}
                  </pre>

                  {(active.content_data as { runnable?: boolean })?.runnable && (
                    <div style={{ marginTop: 12 }}>
                      <button className={styles.submitBtn} disabled={codeRunning} onClick={runStudentCode}>
                        {codeRunning ? <><Loader2 size={14} className={styles.spinner} /> Running…</> : <><Play size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Run Code</>}
                      </button>
                      {codeResult && (
                        <div style={{ marginTop: 12, border: '1px solid #2a2440', borderRadius: 8, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', gap: 12, padding: '8px 12px', fontSize: 12, fontWeight: 600, background: codeResult.status_id === 3 ? '#ecfdf3' : '#fef2f2', color: codeResult.status_id === 3 ? '#067647' : '#b42318' }}>
                            <span>{codeResult.status}</span>
                            {codeResult.time_ms != null && <span style={{ fontWeight: 500 }}>{codeResult.time_ms} ms</span>}
                          </div>
                          <pre style={{ margin: 0, padding: '10px 12px', fontSize: 12.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 240, overflow: 'auto', background: '#0f0b17', color: '#e7e3f0' }}>
                            {codeResult.compile_output || codeResult.stderr || codeResult.stdout || '(no output)'}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  {!active.completed && (
                    <button className={styles.submitBtn} style={{ marginTop: 12 }} onClick={() => markComplete(active)}>✓ Mark as Read</button>
                  )}
                  {active.completed && <p className={styles.completedNote}><CheckCircle2 size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Completed</p>}
                </div>
              </div>
            )}

            {active && active.type === 'image' && (
              <div className={styles.tabContent}>
                <div className={styles.theoryBox}>
                  <h3 className={styles.theoryHeading}>🖼️ {active.title}</h3>
                  {(active.content_data as { url?: string })?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={String((active.content_data as { url?: string })?.url)}
                      alt={String((active.content_data as { alt?: string })?.alt || active.title)}
                      style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid #e5e0ec' }} />
                  ) : (
                    <p className={styles.expMeta}>Image not available yet.</p>
                  )}
                  {(active.content_data as { caption?: string })?.caption && (
                    <p className={styles.videoCaption}>{String((active.content_data as { caption?: string }).caption)}</p>
                  )}
                  {!active.completed && (
                    <button className={styles.submitBtn} style={{ marginTop: 12 }} onClick={() => markComplete(active)}>✓ Mark as Viewed</button>
                  )}
                  {active.completed && <p className={styles.completedNote}><CheckCircle2 size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Completed</p>}
                </div>
              </div>
            )}

            {active && active.type === 'video' && (
              <div className={styles.tabContent}>
                <div className={styles.videoBox}>
                  {(active.content_data as { url?: string })?.url ? (
                    <iframe
                      className={styles.videoFrame}
                      src={String((active.content_data as { url?: string })?.url)}
                      title={active.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <div className={styles.videoPlayer}>
                      <div className={styles.videoInner}>
                        <div className={styles.videoPlayBtn}>▶</div>
                        <p className={styles.videoLabel}>Video not available yet</p>
                      </div>
                    </div>
                  )}
                  <p className={styles.videoCaption}>
                    {(active.content_data as { duration_sec?: number })?.duration_sec
                      ? `Duration: ~${Math.ceil(((active.content_data as { duration_sec?: number }).duration_sec ?? 0) / 60)} minutes.`
                      : 'Watch the full video before attempting the quiz.'}
                  </p>
                  {!active.completed && (
                    <button className={styles.submitBtn} onClick={() => markComplete(active)}>✓ Mark as Watched</button>
                  )}
                  {active.completed && <p className={styles.completedNote}><CheckCircle2 size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Completed</p>}
                </div>
              </div>
            )}

            {active && active.type === 'pdf' && (
              <div className={styles.tabContent}>
                <div className={styles.videoBox}>
                  {(active.content_data as { url?: string })?.url ? (
                    <iframe className={styles.videoFrame} src={String((active.content_data as { url?: string })?.url)} title={active.title} />
                  ) : (
                    <div className={styles.videoPlayer}>
                      <div className={styles.videoInner}>
                        <div className={styles.videoPlayBtn}>📄</div>
                        <p className={styles.videoLabel}>PDF not available yet</p>
                      </div>
                    </div>
                  )}
                  <p className={styles.videoCaption}>
                    {(active.content_data as { pages?: number })?.pages ? `${(active.content_data as { pages?: number }).pages} pages.` : 'Read the document carefully.'}
                  </p>
                  {!active.completed && (
                    <button className={styles.submitBtn} onClick={() => markComplete(active)}>✓ Mark as Read</button>
                  )}
                  {active.completed && <p className={styles.completedNote}><CheckCircle2 size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Completed</p>}
                </div>
              </div>
            )}

            {active && active.type === 'quiz' && (
              <div className={styles.tabContent}>
                <div className={styles.quizBox}>
                  {active.completed && !result && (
                    <div className={styles.unlockedMsg}>
                      <div className={styles.unlockedIcon}>🎉</div>
                      <h3>Quiz Passed!</h3>
                      <p>Score: {active.score != null ? `${Math.round(active.score)}%` : '—'} (threshold {active.quiz_config?.pass_threshold ?? 70}%).</p>
                    </div>
                  )}

                  {quizLoading && <div className={styles.loadingBox}><Loader2 size={18} className={styles.spinner} /> Loading questions…</div>}
                  {!quizLoading && quizError && <div className={styles.errorBox}>⚠️ {quizError}</div>}

                  {!quizLoading && !quizError && questions.length > 0 && (
                    <>
                      <div className={styles.quizHeader}>
                        <h3 className={styles.quizTitle}>📝 {active.title}</h3>
                        <span className={styles.quizThreshold}>
                          Pass ≥ {active.quiz_config?.pass_threshold ?? 70}% · attempt {Math.min((active.quiz_config?.attempts_used ?? 0) + 1, active.quiz_config?.max_attempts ?? 3)}/{active.quiz_config?.max_attempts ?? 3}
                        </span>
                      </div>

                      {questions.map((q, qi) => (
                        <div key={q.id} className={styles.question}>
                          <p className={styles.questionText}>Q{qi + 1}. {q.question_text} <span style={{ color: '#9891a6', fontSize: 12 }}>({q.points} pts)</span></p>
                          <div className={styles.options}>
                            {Object.entries(q.options || {}).map(([letter, text]) => (
                              <button
                                key={letter}
                                disabled={!!result}
                                className={`${styles.optBtn} ${answers[q.id] === letter ? styles.optSelected : ''}`}
                                onClick={() => setAnswers(a => ({ ...a, [q.id]: letter }))}
                              >
                                <span className={styles.optLetter}>{letter}</span>
                                {text}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}

                      {!result ? (
                        <button
                          className={styles.submitBtn}
                          disabled={Object.keys(answers).length < questions.length || submitting}
                          onClick={submitQuiz}
                        >
                          {submitting ? 'Submitting…' : 'Submit Quiz'}
                        </button>
                      ) : (
                        <div className={`${styles.quizResult} ${result.passed ? styles.quizPass : styles.quizFail}`}>
                          {result.passed ? (
                            <>
                              <div className={styles.resultIcon}>🎉</div>
                              <h3>Passed! Score: {result.score}%</h3>
                              <p>{result.correct_count}/{result.total_points} points · threshold {result.threshold}%</p>
                              <button className={styles.joinBtn} onClick={() => router.push('/student/live-lab')}>
                                🚀 Continue to Live Lab
                              </button>
                            </>
                          ) : (
                            <>
                              <div className={styles.resultIcon}>😕</div>
                              <h3>Score: {result.score}% — Not Passed</h3>
                              <p>You need at least {result.threshold}%. Attempts used: {result.attempts_used}. Review the material and retry.</p>
                              <button className={styles.retryBtn} onClick={() => openQuiz(active)}>🔄 Retry Quiz</button>
                            </>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {!quizLoading && !quizError && questions.length === 0 && !active.completed && (
                    <button className={styles.submitBtn} onClick={() => openQuiz(active)}>▶ Start Quiz</button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </StudentShell>
  );
}
