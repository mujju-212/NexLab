'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DOMPurify from 'dompurify';
import StudentShell from '@/components/layout/StudentShell';
import { studentService } from '@/services/student.service';
import type { ContentModule, QuizQuestion } from '@/types';
import { Loader2, ArrowLeft, CheckCircle2, FileText, PlayCircle, HelpCircle, BookOpen } from 'lucide-react';
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
                    {m.type === 'text' ? 'Reading' : m.type === 'video' ? 'Video' : m.type === 'pdf' ? 'PDF Document' : `Quiz · pass ≥ ${m.quiz_config?.pass_threshold ?? 70}%`}
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
