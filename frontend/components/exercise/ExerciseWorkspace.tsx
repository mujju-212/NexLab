'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  platformUserService,
  type PlatformCourse,
  type PlatformExercise,
  type CourseUserProgress,
  type RunResult,
  type SubmitResult,
  type McqSubmitResult,
} from '@/services/platform-user.service';
import { useAuthStore } from '@/store/auth-store';
import styles from './ExerciseWorkspace.module.css';
import {
  Code2, Zap, Play, Send, ChevronLeft, ChevronRight,
  RotateCcw, Wand2, Copy, Check, Settings, Terminal,
  Maximize2, Trash2, CheckCircle2, XCircle, Lightbulb,
  FlaskConical, RefreshCw, AlertCircle, FileCode
} from 'lucide-react';

interface ExerciseWorkspaceProps {
  courseId: string;
  exerciseId: string;
  basePath?: string; // '/practice' or '/student/courses'
}

export default function ExerciseWorkspace({
  courseId,
  exerciseId,
  basePath = '/practice',
}: ExerciseWorkspaceProps) {
  const router = useRouter();
  const { user } = useAuthStore();

  const [course, setCourse] = useState<PlatformCourse | null>(null);
  const [exercise, setExercise] = useState<PlatformExercise | null>(null);
  const [exercises, setExercises] = useState<PlatformExercise[]>([]);
  const [courseProgress, setCourseProgress] = useState<CourseUserProgress | null>(null);
  const [loading, setLoading] = useState(true);

  // Editor state
  const [lang, setLang] = useState('python');
  const [code, setCode] = useState('');
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Execution outputs
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);
  const [mcqAnswer, setMcqAnswer] = useState<string | null>(null);
  const [mcqResult, setMcqResult] = useState<McqSubmitResult | null>(null);
  const [consoleTab, setConsoleTab] = useState<'output' | 'tests' | 'console'>('output');
  const [consoleExpanded, setConsoleExpanded] = useState(false);

  // View tabs (Problem / Test Cases / Hints / Simulation)
  const [activeTab, setActiveTab] = useState<'problem' | 'testcases' | 'hints' | 'simulation'>('problem');

  // Copy feedback state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Load course and exercises
  const loadData = useCallback(async () => {
    try {
      const data = await platformUserService.getCourse(courseId);
      setCourse(data.course);
      setExercises(data.exercises || []);
      setCourseProgress(data.user_progress ?? null);

      const current = (data.exercises || []).find(e => e.id === exerciseId)
        || await platformUserService.getExercise(exerciseId);
      setExercise(current);
      setMcqAnswer(null);
      setMcqResult(null);
      setExecutionError(null);
      setCompletionMessage(null);
      setRunResult(null);
      setSubmitResult(null);

      if (current.exercise_type === 'simulation' || current.simulation_path) {
        setActiveTab('simulation');
      } else {
        setActiveTab('problem');
      }

      // Default language and starter code
      const defaultLang = (current.allowed_languages && current.allowed_languages[0]) || 'python';
      setLang(defaultLang);
      setCode(current.starter_code?.[defaultLang] || current.starter_code?.['python'] || '');
    } catch (err) {
      console.error('Failed to load exercise:', err);
    } finally {
      setLoading(false);
    }
  }, [courseId, exerciseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const refreshCourseProgress = async () => {
    try {
      const refreshed = await platformUserService.getCourse(courseId);
      setCourseProgress(refreshed.user_progress ?? null);
      setExercises(refreshed.exercises || []);
    } catch {
      // The saved result remains visible even if the progress refresh is unavailable.
    }
  };

  // Index and neighbors
  const currentIndex = useMemo(() => {
    if (!exercises.length || !exercise) return 0;
    const idx = exercises.findIndex(e => e.id === exercise.id);
    return idx >= 0 ? idx : 0;
  }, [exercises, exercise]);

  const prevEx = exercises[currentIndex - 1];
  const nextEx = exercises[currentIndex + 1];

  const totalLessons = exercises.length;
  const currentLessonNum = exercise && exercises.some((item) => item.id === exercise.id) ? currentIndex + 1 : null;
  const completedLessons = courseProgress?.solved_count ?? (user ? exercises.filter((item) => item.is_solved).length : null);
  const lessonPct = totalLessons && completedLessons != null
    ? Math.round((completedLessons / totalLessons) * 100)
    : null;

  // Examples come only from the exercise's published public test cases.
  const publicExamples = exercise?.test_cases ?? [];

  // Language change
  const handleLangChange = (newLang: string) => {
    setLang(newLang);
    if (exercise?.starter_code?.[newLang]) {
      setCode(exercise.starter_code[newLang]);
    }
  };

  // Reset starter code
  const handleReset = () => {
    if (!exercise) return;
    const initial = exercise.starter_code?.[lang] || exercise.starter_code?.['python'] || '';
    setCode(initial);
  };

  // Simple auto-format
  const handleFormat = () => {
    const trimmed = code
      .split('\n')
      .map(line => line.trimEnd())
      .join('\n');
    setCode(trimmed);
  };

  // Copy to clipboard helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Run Code action
  const errorText = (err: unknown, fallback: string) => {
    const responseError = (err as any)?.response?.data?.error;
    return typeof responseError === 'string' ? responseError : (err instanceof Error ? err.message : fallback);
  };

  const handleRun = async () => {
    if (!exercise || !code.trim()) return;
    setRunning(true);
    setConsoleTab('output');
    setExecutionError(null);
    setCompletionMessage(null);
    setSubmitResult(null);
    try {
      const res = await platformUserService.runCode(exercise.id, code, lang);
      setRunResult(res);
    } catch (err) {
      setRunResult(null);
      setExecutionError(errorText(err, 'Code execution failed. Your code was not run.'));
      console.error('Run code error:', err);
    } finally {
      setRunning(false);
    }
  };

  const handleMcqSubmit = async () => {
    if (!exercise || !mcqAnswer || submitting) return;
    setSubmitting(true);
    setExecutionError(null);
    try {
      const result = await platformUserService.submitMcq(exercise.id, mcqAnswer);
      setMcqResult(result);
      if (result.correct) await refreshCourseProgress();
    } catch (err) {
      setExecutionError(errorText(err, 'Your answer could not be recorded.'));
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Solution / record a non-code completion.
  const handleSubmit = async () => {
    if (!exercise || submitting) return;
    setExecutionError(null);
    setCompletionMessage(null);
    if (exercise.exercise_type === 'simulation' || exercise.exercise_type === 'reading') {
      setSubmitting(true);
      try {
        const result = await platformUserService.completeSimulation(exercise.id);
        setCompletionMessage(result.solved ? `Completed • +${result.xp_earned} XP earned` : 'Completion recorded.');
        if (result.solved) await refreshCourseProgress();
      } catch (err) {
        setExecutionError(errorText(err, 'Completion could not be recorded.'));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const submissionCode = code.trim();
    if (!submissionCode) return;
    setSubmitting(true);
    setConsoleTab('output');
    try {
      const res = await platformUserService.submitCode(exercise.id, submissionCode, lang || 'python');
      setSubmitResult(res);
      if (res.solved) await refreshCourseProgress();
      setRunResult({
        results: [],
        passed: res.passed,
        total: res.total,
        score: res.score,
        all_passed: res.solved,
      });
    } catch (err) {
      setSubmitResult(null);
      setRunResult(null);
      setExecutionError(errorText(err, 'Submission failed. Your code was not saved.'));
      console.error('Submit code error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // Navigate to another exercise
  const navigateTo = (targetEx?: PlatformExercise) => {
    if (!targetEx) return;
    router.push(`${basePath}/${courseId}/${targetEx.id}`);
  };

  // Keyboard shortcuts listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleRun();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        handleSubmit();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === '/')) {
        e.preventDefault();
        const ta = (document.activeElement as HTMLTextAreaElement | null);
        if (!ta || ta.tagName !== 'TEXTAREA' || ta.value !== code) return;
        const before = ta.value.slice(0, ta.selectionStart);
        const after = ta.value.slice(ta.selectionEnd);
        const lineStart = before.lastIndexOf('\n') + 1;
        const lineEnd = after.indexOf('\n') === -1 ? ta.value.length : ta.selectionStart + after.indexOf('\n');
        const line = ta.value.slice(lineStart, lineEnd);
        const commented = line.trimStart().startsWith('#');
        const next = commented
          ? ta.value.slice(lineStart, lineEnd).replace(/^(\s*)#\s?/, '$1')
          : ta.value.slice(lineStart, lineEnd).replace(/^(\s*)/, '$1# ');
        const nextValue = ta.value.slice(0, lineStart) + next + ta.value.slice(lineEnd);
        setCode(nextValue);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = lineStart + next.length;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [code, exercise, lang]);

  // Line numbers generation
  const lineNumbers = useMemo(() => {
    const lines = code.split('\n').length;
    return Array.from({ length: Math.max(lines, 17) }, (_, i) => i + 1);
  }, [code]);

  // Check if simulation exists
  const hasSimulation = Boolean(exercise?.simulation_path);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 12, color: '#64748b' }}>
        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: 15, fontWeight: 600 }}>Loading lesson…</span>
      </div>
    );
  }

  if (!exercise) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
        <p>Exercise not found.</p>
        <button
          onClick={() => router.push(`${basePath}/${courseId}`)}
          style={{ marginTop: 12, padding: '8px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
        >
          Return to Course
        </button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* ══════════════════════════════════════════════════════════════════════
          TOP COURSE HEADER CARD
          ══════════════════════════════════════════════════════════════════════ */}
      <div className={styles.headerCard}>
        <div className={styles.headerLeft}>
          <div className={styles.courseIconBox}>
            <FileCode size={22} strokeWidth={2.2} />
          </div>
          <div className={styles.courseInfo}>
            <div className={styles.courseTitleRow}>
              <h1 className={styles.courseTitle}>{course?.title ?? 'Course title unavailable'}</h1>
              <span className={styles.badgeDifficulty}>{course?.difficulty ?? exercise.difficulty ?? 'Difficulty unavailable'}</span>
              <span className={styles.badgeXp}>
                <Zap size={12} fill="#f59e0b" color="#d97706" /> +{exercise.xp_reward ?? 0} XP
              </span>
            </div>
            {course?.description && <p className={styles.courseSubtitle}>{course.description}</p>}
          </div>
        </div>

        <div className={styles.headerRight}>
          {/* Lesson progress */}
          <div className={styles.progressWrap}>
            <div className={styles.progressLabelRow}>
              <span className={styles.progressLabel}>
                {completedLessons != null ? `Course progress: ${completedLessons} of ${totalLessons}` : user ? 'Course progress unavailable' : 'Sign in to track course progress'}
              </span>
              <span className={styles.progressPercent}>{lessonPct != null ? `${lessonPct}%` : '—'}</span>
            </div>
            <div className={styles.progressBarTrack}>
              <div className={styles.progressBarFill} style={{ width: `${lessonPct ?? 0}%` }} />
            </div>
          </div>

          {/* Navigation buttons */}
          <div className={styles.headerNavBtns}>
            <button
              className={styles.navBtnPrev}
              disabled={!prevEx}
              onClick={() => navigateTo(prevEx)}
            >
              <ChevronLeft size={15} /> Previous
            </button>
            <button
              className={styles.navBtnNext}
              disabled={!nextEx}
              onClick={() => navigateTo(nextEx)}
            >
              Next <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          WORKSPACE TABS BAR
          ══════════════════════════════════════════════════════════════════════ */}
      <div className={styles.workspaceTabs}>
        <button
          className={`${styles.tabItem} ${activeTab === 'problem' ? styles.tabItemActive : ''}`}
          onClick={() => setActiveTab('problem')}
        >
          <Code2 size={16} /> Problem
        </button>
        <button
          className={`${styles.tabItem} ${activeTab === 'testcases' ? styles.tabItemActive : ''}`}
          onClick={() => setActiveTab('testcases')}
        >
          <Settings size={16} /> Test Cases
        </button>
        <button
          className={`${styles.tabItem} ${activeTab === 'hints' ? styles.tabItemActive : ''}`}
          onClick={() => setActiveTab('hints')}
        >
          <Lightbulb size={16} /> Hints
        </button>
        {hasSimulation && (
          <button
            className={`${styles.tabItem} ${activeTab === 'simulation' ? styles.tabItemActive : ''}`}
            onClick={() => setActiveTab('simulation')}
          >
            <FlaskConical size={16} /> Simulation Lab
          </button>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TWO-COLUMN WORKSPACE
          ══════════════════════════════════════════════════════════════════════ */}
      {/* ══════════════════════════════════════════════════════════════════════
          SIMULATION STUDIO (FULL-WIDTH) OR TWO-COLUMN CODING WORKSPACE
          ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'simulation' && hasSimulation ? (
        <div className={styles.simulationStudio}>
          <div className={styles.simulationHeader}>
            <div className={styles.simulationTitleWrap}>
              <span className={styles.simulationBadge}>
                <span className={styles.pulseDot} /> Virtual Lab Active
              </span>
              <h2 className={styles.simulationTitle}>{exercise.title}</h2>
              <span className={styles.badgeXp}>
                <Zap size={12} fill="#f59e0b" color="#d97706" /> +{exercise.xp_reward ?? 0} XP
              </span>
            </div>
            <div className={styles.simulationActions}>
              <a
                href={exercise.simulation_path}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.openExternalBtn}
              >
                <Maximize2 size={14} /> Open Fullscreen
              </a>
              <button
                className={styles.markCompleteBtn}
                onClick={handleSubmit}
                disabled={submitting}
              >
                <CheckCircle2 size={15} /> {submitting ? 'Recording...' : 'Mark Completed (+XP)'}
              </button>
            </div>
          </div>

          <div className={styles.simulationFrameWrap}>
            <iframe
              src={exercise.simulation_path}
              title={exercise.title}
              className={styles.simulationIframe}
            />
          </div>

          <div className={styles.problemBottomNav} style={{ background: '#ffffff', borderRadius: 12, padding: '12px 20px', border: '1px solid #f1f5f9' }}>
            <button
              className={styles.navBtnPrev}
              disabled={!prevEx}
              onClick={() => navigateTo(prevEx)}
            >
              <ChevronLeft size={15} /> Previous
            </button>
            <span className={styles.lessonCountCenter}>
              {totalLessons ? `${currentLessonNum} of ${totalLessons}` : `${currentLessonNum}`}
            </span>
            <button
              className={styles.navBtnNext}
              disabled={!nextEx}
              onClick={() => navigateTo(nextEx)}
            >
              Next <ChevronRight size={15} />
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.workspaceGrid} style={exercise.exercise_type === 'mcq' ? { gridTemplateColumns: '1fr' } : undefined}>
          {/* ── Left Column: Problem Statement ── */}
          <div className={styles.problemPanel}>
            {activeTab === 'problem' && (
              <>
                <div className={styles.problemHeader}>
                  <div className={styles.problemTopRow}>
                    <span className={styles.problemLessonBreadcrumb}>
                      {course?.title ? `${course.title} — ` : ''}{currentLessonNum ? `Lesson ${currentLessonNum} of ${totalLessons}` : 'Lesson position unavailable'}
                    </span>
                    <span className={styles.badgeXp}>
                      <Zap size={12} fill="#f59e0b" color="#d97706" /> +{exercise.xp_reward ?? 0} XP
                    </span>
                  </div>
                  <h2 className={styles.problemMainTitle}>{exercise.title}</h2>
                </div>

                {/* Problem Description */}
                <div className={styles.problemDescArea}>
                  {exercise.description ? (
                    exercise.description.split('\n').filter(Boolean).map((p, i) => (
                      <p key={i} style={{ margin: 0, color: i === 0 ? '#1e293b' : '#475569' }}>
                        {p}
                      </p>
                    ))
                  ) : (
                    <p style={{ margin: 0, color: '#64748b' }}>No problem statement has been provided for this exercise yet.</p>
                  )}
                </div>

                {exercise.exercise_type === 'mcq' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Choose one answer</h3>
                    {(exercise.mcq_options || []).map((option, index) => {
                      const letter = String.fromCharCode(65 + index);
                      const selected = mcqAnswer === letter;
                      const isCorrect = mcqResult?.correct_answer === letter;
                      const isWrongSelection = mcqResult?.your_answer === letter && !mcqResult.correct;
                      return (
                        <button
                          key={`${letter}-${option}`}
                          type="button"
                          onClick={() => { setMcqAnswer(letter); setMcqResult(null); setExecutionError(null); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 14px', borderRadius: 10, border: `1px solid ${isCorrect ? '#86efac' : isWrongSelection ? '#fca5a5' : selected ? '#a78bfa' : '#e2e8f0'}`, background: isCorrect ? '#f0fdf4' : isWrongSelection ? '#fef2f2' : selected ? '#f5f3ff' : '#fff', textAlign: 'left', cursor: 'pointer', color: '#1e293b' }}
                        >
                          <span style={{ width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, background: selected ? '#7c3aed' : '#f1f5f9', color: selected ? '#fff' : '#475569', fontWeight: 800, flexShrink: 0 }}>{letter}</span>
                          <span>{option}</span>
                        </button>
                      );
                    })}
                    <button type="button" onClick={handleMcqSubmit} disabled={!mcqAnswer || submitting || !exercise.mcq_options?.length} className={styles.primaryBtn} style={{ alignSelf: 'flex-start', opacity: !mcqAnswer || submitting ? 0.55 : 1 }}>
                      {submitting ? 'Checking…' : 'Submit Answer'}
                    </button>
                    {mcqResult && (
                      <div style={{ padding: 14, borderRadius: 10, background: mcqResult.correct ? '#ecfdf5' : '#fef2f2', border: `1px solid ${mcqResult.correct ? '#a7f3d0' : '#fecaca'}` }}>
                        <strong style={{ color: mcqResult.correct ? '#047857' : '#b91c1c' }}>{mcqResult.correct ? `Correct • +${mcqResult.xp_earned} XP` : `Not quite • correct answer: ${mcqResult.correct_answer}`}</strong>
                        {mcqResult.explanation && <p style={{ margin: '6px 0 0', color: '#475569' }}>{mcqResult.explanation}</p>}
                      </div>
                    )}
                    {!exercise.mcq_options?.length && <p style={{ margin: 0, color: '#64748b' }}>No answer choices have been provided for this exercise.</p>}
                  </div>
                ) : (
                  <>
                {publicExamples.length ? publicExamples.map((example, index) => (
                  <div key={`example-${index}`} className={styles.exampleCard}>
                    <span className={styles.exampleTitle}>Example {index + 1}</span>
                    <div className={styles.exampleField}>
                      <span className={styles.exampleLabel}>Input</span>
                      <div className={styles.exampleBox}>
                        <span>{example.input}</span>
                        <button
                          className={styles.copyBtn}
                          onClick={() => handleCopy(example.input, `ex-${index}-in`)}
                          title="Copy"
                        >
                          {copiedId === `ex-${index}-in` ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                        </button>
                      </div>
                    </div>
                    <div className={styles.exampleField}>
                      <span className={styles.exampleLabel}>Expected Output</span>
                      <div className={styles.exampleBox}>
                        <span>{example.expected}</span>
                        <button
                          className={styles.copyBtn}
                          onClick={() => handleCopy(example.expected, `ex-${index}-out`)}
                          title="Copy"
                        >
                          {copiedId === `ex-${index}-out` ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>
                )) : (
                  <p style={{ margin: '14px 0 0', color: '#64748b' }}>No examples supplied.</p>
                )}
                <div className={styles.exampleCard} style={{ marginTop: 12 }}>
                  <span className={styles.exampleTitle}>Constraints</span>
                  <p style={{ margin: 0, color: '#64748b' }}>No structured constraints supplied for this exercise.</p>
                </div>
                  </>
                )}
              </>
            )}

            {activeTab === 'testcases' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Public Test Cases</h3>
                {(exercise.test_cases || []).length ? (exercise.test_cases || []).map((tc, idx) => (
                  <div key={idx} className={styles.exampleCard}>
                    <span className={styles.exampleTitle}>Case {idx + 1}</span>
                    <div className={styles.exampleField}>
                      <span className={styles.exampleLabel}>Input</span>
                      <div className={styles.exampleBox}>
                        <span>{tc.input}</span>
                      </div>
                    </div>
                    <div className={styles.exampleField}>
                      <span className={styles.exampleLabel}>Expected Output</span>
                      <div className={styles.exampleBox}>
                        <span>{tc.expected}</span>
                      </div>
                    </div>
                  </div>
                )) : <p style={{ margin: 0, color: '#64748b' }}>No public test cases are available for this exercise.</p>}
              </div>
            )}

            {activeTab === 'hints' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Problem Hints</h3>
                <div className={styles.exampleCard}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#b45309', fontWeight: 700, fontSize: 13 }}>
                    <Lightbulb size={16} /> Hint 1
                  </div>
                  <p style={{ margin: 0, fontSize: 13.5, color: '#334155' }}>
                    {exercise.hint_text || 'No hint is available for this exercise yet.'}
                  </p>
                </div>
              </div>
            )}

            {/* Bottom Pagination Inside Left Panel */}
            <div className={styles.problemBottomNav}>
              <button
                className={styles.navBtnPrev}
                disabled={!prevEx}
                onClick={() => navigateTo(prevEx)}
              >
                <ChevronLeft size={15} /> Previous
              </button>
              <span className={styles.lessonCountCenter}>
                {currentLessonNum} of {totalLessons}
              </span>
              <button
                className={styles.navBtnNext}
                disabled={!nextEx}
                onClick={() => navigateTo(nextEx)}
              >
                Next <ChevronRight size={15} />
              </button>
            </div>
          </div>

        {/* ── Right Column: Code Editor & Console ── */}
        <div className={styles.editorPanel}>
          {/* Top Code Editor */}
          <div className={styles.editorContainer}>
            <div className={styles.editorToolbar}>
              {/* Language Selector */}
              <select
                value={lang}
                onChange={(e) => handleLangChange(e.target.value)}
                className={styles.langSelector}
              >
                <option value="python">Python 3</option>
                <option value="javascript">JavaScript</option>
                <option value="cpp">C++</option>
                <option value="java">Java</option>
              </select>

              {/* Action buttons */}
              <div className={styles.toolbarRight}>
                <button className={styles.toolBtn} onClick={handleFormat} title="Format Code">
                  <Wand2 size={13} /> Format
                </button>
                <button className={styles.toolBtn} onClick={handleReset} title="Reset to Starter Code">
                  <RotateCcw size={13} /> Reset
                </button>
                <button
                  className={styles.btnRunCode}
                  onClick={handleRun}
                  disabled={running || submitting}
                >
                  {running ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={14} />}
                  Run Code
                </button>
                <button
                  className={styles.btnSubmit}
                  onClick={handleSubmit}
                  disabled={running || submitting}
                >
                  {submitting ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
                  Submit Solution
                </button>
              </div>
            </div>

            {/* Code Textarea with Line Numbers */}
            <div className={styles.codeAreaWrapper}>
              <div className={styles.lineNumbers}>
                {lineNumbers.map(n => (
                  <div key={n}>{n}</div>
                ))}
              </div>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={styles.codeTextarea}
                spellCheck={false}
                rows={17}
                onScroll={(e) => {
                  const ta = e.target as HTMLTextAreaElement;
                  const gutter = ta.previousElementSibling as HTMLDivElement | null;
                  if (gutter) gutter.scrollTop = ta.scrollTop;
                }}
              />
              <button
                className={styles.editorCornerBtn}
                title="Fullscreen"
                onClick={() => {
                  const el = document.documentElement;
                  if (!document.fullscreenElement) {
                    void el.requestFullscreen?.();
                  } else {
                    void document.exitFullscreen();
                  }
                }}
              >
                <Maximize2 size={13} />
              </button>
            </div>
          </div>

          {/* Bottom Console / Output Terminal */}
          <div className={styles.consoleCard}>
            <div className={styles.consoleHead}>
              <div className={styles.consoleTabs}>
                <button
                  className={`${styles.consoleTabBtn} ${consoleTab === 'output' ? styles.consoleTabBtnActive : ''}`}
                  onClick={() => setConsoleTab('output')}
                >
                  <Code2 size={14} /> Output
                </button>
                <button
                  className={`${styles.consoleTabBtn} ${consoleTab === 'tests' ? styles.consoleTabBtnActive : ''}`}
                  onClick={() => setConsoleTab('tests')}
                >
                  <Settings size={14} /> Test Cases
                </button>
                <button
                  className={`${styles.consoleTabBtn} ${consoleTab === 'console' ? styles.consoleTabBtnActive : ''}`}
                  onClick={() => setConsoleTab('console')}
                >
                  <Terminal size={14} /> Console
                </button>
              </div>

              <div className={styles.consoleRightBtns}>
                <button
                  className={styles.consoleClearBtn}
                  onClick={() => {
                    setRunResult(null);
                    setSubmitResult(null);
                    setExecutionError(null);
                    setCompletionMessage(null);
                  }}
                >
                  <Trash2 size={12} /> Clear
                </button>
                <button
                  className={styles.consoleClearBtn}
                  title="Expand Output"
                  onClick={() => setConsoleExpanded((v) => !v)}
                >
                  <Maximize2 size={12} />
                </button>
              </div>
            </div>

            {/* Console Output Body */}
            <div className={styles.consoleBody} style={consoleExpanded ? { maxHeight: 420, height: 420 } : undefined}>
              {executionError ? (
                <div role="alert" style={{ width: '100%', padding: 14, borderRadius: 10, background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', fontSize: 13, fontWeight: 600 }}>
                  <AlertCircle size={16} style={{ verticalAlign: 'middle', marginRight: 8 }} />{executionError}
                </div>
              ) : completionMessage ? (
                <div role="status" style={{ width: '100%', padding: 14, borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', fontSize: 13, fontWeight: 700 }}>{completionMessage}</div>
              ) : running || submitting ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: '#7c3aed' }}>
                  <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>Executing code in Docker sandbox…</span>
                </div>
              ) : submitResult ? (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, background: submitResult.solved ? '#ecfdf5' : '#fef2f2', border: `1px solid ${submitResult.solved ? '#a7f3d0' : '#fecaca'}`, borderRadius: 10 }}>
                    {submitResult.solved ? (
                      <CheckCircle2 size={20} color="#059669" />
                    ) : (
                      <XCircle size={20} color="#dc2626" />
                    )}
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 14, color: submitResult.solved ? '#065f46' : '#991b1b' }}>
                        {submitResult.solved ? '🎉 Solution Accepted!' : 'Submission Failed'}
                      </div>
                      <div style={{ fontSize: 12, color: '#475569' }}>
                        Passed {submitResult.passed} of {submitResult.total} test cases • +{submitResult.xp_earned} XP earned
                      </div>
                    </div>
                  </div>
                </div>
              ) : runResult ? (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: runResult.all_passed ? '#ecfdf5' : '#fffbeb', borderRadius: 8, fontSize: 13, fontWeight: 700 }}>
                    <span style={{ color: runResult.all_passed ? '#059669' : '#b45309' }}>
                      {runResult.all_passed ? 'All Test Cases Passed' : 'Some Test Cases Failed'}
                    </span>
                    <span style={{ color: '#64748b' }}>
                      {runResult.passed} / {runResult.total} Passed
                    </span>
                  </div>
                  {runResult.results.map((r, i) => (
                    <div key={i} style={{ padding: 10, background: '#f8fafc', borderRadius: 8, fontSize: 12.5, fontFamily: 'monospace' }}>
                      <div>Input: {r.input}</div>
                      <div>Output: {r.output || '(empty)'}</div>
                      <div>Expected: {r.expected}</div>
                      <div style={{ color: r.passed ? '#059669' : '#dc2626', fontWeight: 700, marginTop: 4 }}>
                        {r.passed ? '✓ Passed' : '✗ Failed'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* Empty state matching mockup */
                <div className={styles.emptyTerminalState}>
                  <div className={styles.terminalIconSquare}>
                    &gt;_
                  </div>
                  <h4 className={styles.terminalEmptyTitle}>Run your code to see the output</h4>
                  <p className={styles.terminalEmptySub}>
                    Click the &quot;Run Code&quot; button or press Ctrl + Enter
                  </p>
                </div>
              )}
            </div>

            {/* Bottom Status & Shortcuts Footer */}
            <div className={styles.consoleStatusFooter}>
              <div className={styles.statusReady}>
                <span className={styles.statusDot} />
                <span>{running ? 'Executing...' : 'Ready to run'}</span>
              </div>

              <div className={styles.shortcutHints}>
                <div className={styles.shortcutItem}>
                  <kbd className={styles.shortcutKbd}>Ctrl + Enter</kbd>
                  <span>Run Code</span>
                </div>
                <div className={styles.shortcutItem}>
                  <kbd className={styles.shortcutKbd}>Ctrl + S</kbd>
                  <span>Submit</span>
                </div>
                <div className={styles.shortcutItem}>
                  <kbd className={styles.shortcutKbd}>Ctrl + /</kbd>
                  <span>Toggle Comment</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}
  </div>
);
}
