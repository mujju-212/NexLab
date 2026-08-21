'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { freeService, type FreeCourse, type FreeExercise, type RunResult } from '@/services/free.service';
import { useAuthStore } from '@/store/auth-store';
import styles from './exercise.module.css';
import {
  Play, Send, ChevronLeft, ChevronRight, CheckCircle2,
  XCircle, Lightbulb, RefreshCw, Trophy, Lock, Loader2,
  FlaskConical, ExternalLink
} from 'lucide-react';

const DIFF_CLS: Record<string, string> = {
  easy: 'diffEasy', medium: 'diffMedium', hard: 'diffHard',
};

const LANG_IDS: Record<string, number> = {
  python: 71, cpp: 54, c: 50, java: 62, javascript: 63,
};

/**
 * Reusable exercise viewer.
 * basePath — route prefix for back/prev/next links ('/practice' or '/student/courses')
 * embedded — true when rendered inside the student portal (fills parent instead of 100vh)
 */
export default function ExerciseView({ basePath = '/practice', embedded = false }: {
  basePath?: string;
  embedded?: boolean;
}) {
  const { courseId, exerciseId } = useParams<{ courseId: string; exerciseId: string }>();
  const router = useRouter();
  const { user } = useAuthStore();

  const [course, setCourse]   = useState<FreeCourse | null>(null);
  const [exercise, setExercise] = useState<FreeExercise | null>(null);
  const [exercises, setExercises] = useState<FreeExercise[]>([]);
  const [lang, setLang]       = useState('python');
  const [code, setCode]       = useState('');
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [runResult, setRunResult]   = useState<RunResult | null>(null);
  const [submitResult, setSubmitResult] = useState<{ solved: boolean; score: number; xp_earned: number } | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [activeTab, setActiveTab] = useState<'problem' | 'results'>('problem');
  const [mcqAnswer, setMcqAnswer] = useState('');
  const [mcqResult, setMcqResult] = useState<{ correct: boolean; correct_answer: string; explanation: string } | null>(null);
  const [simSolved, setSimSolved]   = useState(false);
  const [completing, setCompleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const { course: c, exercises: exs } = await freeService.getCourse(courseId);
      setCourse(c);
      setExercises(exs);
      const ex = exs.find(e => e.id === exerciseId) ?? await freeService.getExercise(exerciseId);
      setExercise(ex);

      // Set initial language & starter code
      const defaultLang = (ex.allowed_languages || ['python'])[0];
      setLang(defaultLang);
      setCode(ex.starter_code?.[defaultLang] ?? '');

      // Simulation exercises: pre-load completion state
      if (user) {
        try {
          const prog = await freeService.getCourseProgress(c.id);
          setSimSolved((prog.solved_ids ?? []).includes(ex.id));
        } catch { /* progress is best-effort */ }
      }
    } catch {
      router.push(`${basePath}/${courseId}`);
    }
  }, [courseId, exerciseId, router, user, basePath]);

  useEffect(() => { load(); }, [load]);

  const changeLang = (l: string) => {
    setLang(l);
    setCode(exercise?.starter_code?.[l] ?? '');
    setRunResult(null);
    setSubmitResult(null);
  };

  const handleRun = async () => {
    if (!user) { router.push('/register'); return; }
    if (!code.trim() || !exercise) return;
    setRunning(true);
    setActiveTab('results');
    try {
      const res = await freeService.runCode(exercise.id, code, lang);
      setRunResult(res);
    } catch { /* network error */ } finally {
      setRunning(false);
    }
  };

  const handleSubmit = async () => {
    if (!user) { router.push('/register'); return; }
    if (!code.trim() || !exercise) return;
    setSubmitting(true);
    setActiveTab('results');
    try {
      const res = await freeService.submitCode(exercise.id, code, lang);
      setSubmitResult({ solved: res.solved, score: res.score, xp_earned: res.xp_earned });
      setRunResult({
        results: [], passed: res.passed, total: res.total,
        score: res.score, all_passed: res.solved,
      });
    } catch { /* error */ } finally {
      setSubmitting(false);
    }
  };

  const handleMcq = async (option: string) => {
    if (!user) { router.push('/register'); return; }
    if (!exercise) return;
    const letter = String.fromCharCode(65 + (exercise.mcq_options?.indexOf(option) ?? 0));
    setMcqAnswer(letter);
    try {
      const res = await freeService.submitMcq(exercise.id, letter);
      setMcqResult(res);
    } catch { /* error */ }
  };

  const handleSimComplete = async () => {
    if (!user) { router.push('/register'); return; }
    if (!exercise) return;
    setCompleting(true);
    try {
      const res = await freeService.completeSimulation(exercise.id);
      setSubmitResult({ solved: true, score: 100, xp_earned: res.xp_earned });
      setSimSolved(true);
    } catch { /* error */ } finally {
      setCompleting(false);
    }
  };

  const currentIndex = exercises.findIndex(e => e.id === exerciseId);
  const prevEx = exercises[currentIndex - 1];
  const nextEx = exercises[currentIndex + 1];

  if (!exercise) return (
    <div className={styles.loading}>
      <RefreshCw size={24} className={styles.spinIcon} />
      <span>Loading exercise…</span>
    </div>
  );

  return (
    <div className={`${styles.page} ${embedded ? styles.pageEmbedded : ''}`}>
      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <div className={styles.topBar}>
        <div className={styles.brandBack} onClick={() => router.push(`${basePath}/${courseId}`)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="NexLab" className={styles.brandLogo} />
          <span className={styles.brandText}>NexLab</span>
          <div className={styles.divider} />
          <span className={styles.courseName}>{course?.title ?? 'Practice'}</span>
        </div>

        <div className={styles.exerciseNav}>
          <button className={styles.navBtn} disabled={!prevEx}
            onClick={() => prevEx && router.push(`${basePath}/${courseId}/${prevEx.id}`)}>
            <ChevronLeft size={14} />
          </button>
          <span className={styles.exercisePos}>
            {currentIndex + 1} / {exercises.length}
          </span>
          <button className={styles.navBtn} disabled={!nextEx}
            onClick={() => nextEx && router.push(`${basePath}/${courseId}/${nextEx.id}`)}>
            <ChevronRight size={14} />
          </button>
        </div>

        {!user && (
          <button className={styles.signupCta} onClick={() => router.push('/register')}>
            <Lock size={12} /> Sign up to save progress
          </button>
        )}
      </div>

      <div className={styles.layout}>
        {/* ── Left Panel: Problem + Results ─────────────────────────────── */}
        <div className={styles.leftPanel}>
          {/* Exercise Header */}
          <div className={styles.exHeader}>
            <div className={styles.exMeta}>
              <span className={styles.exNum}>#{currentIndex + 1}</span>
              <span className={styles[DIFF_CLS[exercise.difficulty] ?? 'diffEasy']}>
                {exercise.difficulty}
              </span>
              <span className={styles.xpBadge}>+{exercise.xp_reward} XP</span>
            </div>
            <h1 className={styles.exTitle}>{exercise.title}</h1>
          </div>

          {/* Tabs (hidden for simulations — no test cases) */}
          {exercise.exercise_type !== 'simulation' && (
          <div className={styles.tabs}>
            <button className={`${styles.tab} ${activeTab === 'problem' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('problem')}>Problem</button>
            <button className={`${styles.tab} ${activeTab === 'results' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('results')}>
              Test Results
              {runResult && (
                <span className={runResult.all_passed ? styles.passCount : styles.failCount}>
                  {runResult.passed}/{runResult.total}
                </span>
              )}
            </button>
          </div>
          )}

          {exercise.exercise_type === 'simulation' ? (
          <div className={styles.panelContent}>
            <div className={styles.problemContent}>
              <div className={styles.simBanner}>
                <FlaskConical size={16} style={{ flexShrink: 0 }} />
                <span>Interactive virtual lab — run the simulator, tweak the inputs and watch each step. No code required.</span>
              </div>
              <div className={styles.description}
                dangerouslySetInnerHTML={{
                  __html: (exercise.description || '').replace(/\n/g, '<br/>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'),
                }}
              />
              {simSolved ? (
                <div className={`${styles.submitBanner} ${styles.bannerSolved}`}>
                  <Trophy size={18} /> Experiment completed
                  {submitResult && submitResult.xp_earned > 0 && <>&nbsp;— +{submitResult.xp_earned} XP</>}
                </div>
              ) : (
                <button className={styles.btnComplete} onClick={handleSimComplete} disabled={completing}>
                  {completing ? <RefreshCw size={14} className={styles.spinIcon} /> : <CheckCircle2 size={14} />}
                  Mark Experiment Complete (+{exercise.xp_reward} XP)
                </button>
              )}
            </div>
          </div>
          ) : (
          <div className={styles.panelContent}>
            {activeTab === 'problem' && (
              <div className={styles.problemContent}>
                {/* Description */}
                <div className={styles.description}
                  dangerouslySetInnerHTML={{
                    __html: (exercise.description || '').replace(/\n/g, '<br/>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'),
                  }}
                />

                {/* Visible Test Cases */}
                {exercise.exercise_type === 'coding' && (exercise.test_cases || []).length > 0 && (
                  <div className={styles.testCasesSection}>
                    <h3>Example Test Cases</h3>
                    {exercise.test_cases.map((tc, i) => (
                      <div key={i} className={styles.testCase}>
                        {tc.input && (
                          <div className={styles.tcBlock}>
                            <span>Input:</span>
                            <pre>{tc.input}</pre>
                          </div>
                        )}
                        <div className={styles.tcBlock}>
                          <span>Expected Output:</span>
                          <pre>{tc.expected}</pre>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* MCQ */}
                {exercise.exercise_type === 'mcq' && (
                  <div className={styles.mcqSection}>
                    {(exercise.mcq_options || []).map((opt, i) => {
                      const letter = String.fromCharCode(65 + i);
                      const isSelected = mcqAnswer === letter;
                      const isCorrect = mcqResult?.correct_answer === letter;
                      const isWrong   = mcqAnswer === letter && mcqResult && !mcqResult.correct;
                      return (
                        <button key={i} className={`${styles.mcqOption}
                          ${isSelected ? styles.mcqSelected : ''}
                          ${mcqResult && isCorrect ? styles.mcqCorrect : ''}
                          ${isWrong ? styles.mcqWrong : ''}`}
                          onClick={() => !mcqResult && handleMcq(opt)}
                          disabled={!!mcqResult}>
                          <span className={styles.mcqLetter}>{letter}</span>
                          {opt}
                        </button>
                      );
                    })}
                    {mcqResult && (
                      <div className={`${styles.mcqFeedback} ${mcqResult.correct ? styles.feedbackGood : styles.feedbackBad}`}>
                        <strong>{mcqResult.correct ? '✅ Correct!' : '❌ Incorrect'}</strong>
                        <p>{mcqResult.explanation}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Hint */}
                {exercise.hint_text && (
                  <div className={styles.hintSection}>
                    <button className={styles.hintToggle} onClick={() => setShowHint(v => !v)}>
                      <Lightbulb size={14} /> {showHint ? 'Hide Hint' : 'Show Hint'}
                    </button>
                    {showHint && <div className={styles.hintBox}>{exercise.hint_text}</div>}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'results' && (
              <div className={styles.resultsPanel}>
                {/* Submit result banner */}
                {submitResult && (
                  <div className={`${styles.submitBanner} ${submitResult.solved ? styles.bannerSolved : styles.bannerFailed}`}>
                    {submitResult.solved
                      ? <><Trophy size={18} /> Solved! +{submitResult.xp_earned} XP</>
                      : <><XCircle size={18} /> Score: {submitResult.score}% — Keep trying!</>}
                  </div>
                )}

                {(running || submitting) && (
                  <div className={styles.runningMsg}>
                    <RefreshCw size={15} className={styles.spinIcon} /> Running against test cases…
                  </div>
                )}

                {runResult && !running && !submitting && runResult.results && (
                  <div className={styles.resultsList}>
                    {runResult.results.map((r, i) => (
                      <div key={i} className={`${styles.resultRow} ${r.passed ? styles.rowPassed : styles.rowFailed}`}>
                        <div className={styles.rowHeader}>
                          {r.passed ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                          <span>Test {i + 1}</span>
                          <span className={styles.rowTime}>{r.time_ms != null ? `${r.time_ms}ms` : ''}</span>
                          <span className={styles.rowStatus}>{r.status}</span>
                        </div>
                        {!r.passed && (
                          <div className={styles.rowDetails}>
                            {r.input && <div><span>Input:</span><pre>{r.input}</pre></div>}
                            <div><span>Expected:</span><pre>{r.expected}</pre></div>
                            <div><span>Got:</span><pre>{r.output || r.stderr || r.compile_output || '(no output)'}</pre></div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {!runResult && !running && !submitting && (
                  <div className={styles.noResults}>
                    Click <strong>Run</strong> to test your code against visible test cases,<br/>
                    or <strong>Submit</strong> to run all test cases and save your progress.
                  </div>
                )}
              </div>
            )}
          </div>
          )}
        </div>
        {exercise.exercise_type === 'coding' && (
          <div className={styles.rightPanel}>
            <div className={styles.editorHeader}>
              <div className={styles.langTabs}>
                {(exercise.allowed_languages || ['python']).map(l => (
                  <button key={l} className={`${styles.langTab} ${lang === l ? styles.langTabActive : ''}`}
                    onClick={() => changeLang(l)}>
                    {l}
                  </button>
                ))}
              </div>
              <button className={styles.resetBtn} onClick={() => setCode(exercise.starter_code?.[lang] ?? '')}>
                <RefreshCw size={12} /> Reset
              </button>
            </div>

            <textarea
              className={styles.editor}
              value={code}
              onChange={e => setCode(e.target.value)}
              spellCheck={false}
              placeholder="Write your code here…"
            />

            <div className={styles.editorActions}>
              <button className={styles.btnRun} onClick={handleRun} disabled={running || submitting}>
                {running ? <RefreshCw size={14} className={styles.spinIcon} /> : <Play size={14} />}
                Run
              </button>
              <button className={styles.btnSubmit} onClick={handleSubmit} disabled={running || submitting}>
                {submitting ? <RefreshCw size={14} className={styles.spinIcon} /> : <Send size={14} />}
                Submit
              </button>
            </div>
          </div>
        )}

        {/* Right Panel: Simulation Lab */}
        {exercise.exercise_type === 'simulation' && exercise.simulation_path && (
          <div className={styles.simPanel}>
            <div className={styles.simToolbar}>
              <span className={styles.simLabel}><FlaskConical size={13} /> Live Simulator</span>
              <a className={styles.simOpen} href={exercise.simulation_path} target="_blank" rel="noreferrer">
                <ExternalLink size={12} /> Open full screen
              </a>
            </div>
            <iframe
              className={styles.simFrame}
              src={exercise.simulation_path}
              title={exercise.title}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            />
          </div>
        )}
      </div>
    </div>
  );
}
