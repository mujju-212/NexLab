'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DOMPurify from 'dompurify';
import StudentShell from '@/components/layout/StudentShell';
import { useSocket } from '@/hooks/use-socket';
import { studentService } from '@/services/student.service';
import type { AssignmentSubmitResult, VivaSubmitResult, ContentPage } from '@/services/student.service';
import { executionService, type PlaygroundResult } from '@/services/execution.service';
import { renderMarkdown } from '@/lib/markdown';
import type { ContentModule, QuizQuestion, LabSession } from '@/types';
import { Loader2, ArrowLeft, CheckCircle2, FileText, PlayCircle, HelpCircle, BookOpen, Code2, Image as ImageIcon, FileCode, Play, Globe, Link2, Download, ExternalLink, ClipboardCheck, Mic2 } from 'lucide-react';
import styles from '../page.module.css';

interface QuizResult {
  score: number;
  passed: boolean;
  threshold: number;
  attempts_used: number;
  correct_count: number;
  total_points: number;
}

interface VivaResult {
  score: number;
  best_score: number;
  passed: boolean;
  threshold: number;
  per_question: { index: number; score: number; feedback: string }[];
  attempts_used: number;
}

const MODULE_ICONS: Record<string, typeof BookOpen> = {
  text: BookOpen, video: PlayCircle, pdf: FileText, quiz: HelpCircle,
  markdown: FileCode, code: Code2, image: ImageIcon,
  html: Globe, link: Link2, file: Download, assign: ClipboardCheck, viva: Mic2,
};

// Compact monospace block for the per-test I/O rows in a graded-assignment result.
const preMini = { margin: '2px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, monospace', fontSize: 12 } as const;

// Sentinel page id for modules with a null/legacy page_id (grouped under a "Content" section).
const DEFAULT_PAGE = '__default__';

export default function PreLabDetailPage() {
  const router = useRouter();
  const params = useParams<{ experimentId: string }>();
  const experimentId = params.experimentId;

  const [modules, setModules] = useState<ContentModule[]>([]);
  const [pages, setPages] = useState<ContentPage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Tracks which page tab is selected at the top of the page.
  const [activePageId, setActivePageId] = useState<string | null>(null);
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

  // Graded coding-assignment state
  const [assignCode, setAssignCode] = useState('');
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignResult, setAssignResult] = useState<AssignmentSubmitResult | null>(null);
  const [assignError, setAssignError] = useState('');
  const assignSeeded = useRef<string | null>(null);

  // AI-viva state — one text answer per question (keyed by question index).
  const [vivaAnswers, setVivaAnswers] = useState<Record<number, string>>({});
  const [vivaSubmitting, setVivaSubmitting] = useState(false);
  const [vivaResult, setVivaResult] = useState<VivaResult | null>(null);
  const [vivaError, setVivaError] = useState('');
  const vivaSeeded = useRef<string | null>(null);

  const loadModules = useCallback(async () => {
    try {
      const { modules: mods, pages: pgs } = await studentService.getPreLabContent(experimentId);
      setModules(mods);
      setPages(pgs);
      setActiveId(prev => prev ?? mods[0]?.id ?? null);
      // Initialise the page tab to whichever page the first module belongs to.
      setActivePageId(prev => {
        if (prev !== null) return prev; // already set (e.g. after re-fetch)
        if (mods.length === 0) return DEFAULT_PAGE;
        return mods[0].page_id ?? DEFAULT_PAGE;
      });
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pre-lab content');
    } finally {
      setLoading(false);
    }
  }, [experimentId]);

  useEffect(() => { loadModules(); }, [loadModules]);

  // ── Fix 4: live launched-quiz push (C15) ──────────────────────────────────
  // The instructor can push an unpublished quiz live mid-session. The backend
  // whitelist already exposes it on fetch; this socket listener makes it appear
  // WITHOUT a manual reload — reload modules the moment the quiz is launched.
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    studentService.getSessions()
      .then((list: LabSession[]) => {
        const active = list.find(s => s.experiment_id === experimentId && s.status === 'active');
        if (mounted && active) setLiveSessionId(active.id);
      })
      .catch(() => undefined);
    return () => { mounted = false; };
  }, [experimentId]);

  const { emitScreenshot } = useSocket({
    sessionId: liveSessionId || '',
    enabled: !!liveSessionId,
    onQuizLaunched: useCallback(() => { loadModules(); }, [loadModules]),
    onPageLaunched: useCallback(() => { loadModules(); }, [loadModules]),
  });

  const active = modules.find(m => m.id === activeId) || null;
  const doneCount = modules.filter(m => m.completed).length;
  const progressPct = modules.length ? Math.round((doneCount / modules.length) * 100) : 0;
  const allDone = modules.length > 0 && doneCount === modules.length;

  // Group modules by page_id for sidebar rendering.
  // A null/undefined page_id maps to the DEFAULT_PAGE sentinel (legacy page).
  const modulesByPage: Record<string, ContentModule[]> = useMemo(() => {
    const groups: Record<string, ContentModule[]> = {};
    modules.forEach(m => {
      const pid = m.page_id ?? DEFAULT_PAGE;
      (groups[pid] ??= []).push(m);
    });
    return groups;
  }, [modules]);

  // Ordered page sections for the sidebar. Real pages come first (in their
  // display order); any modules with a null page_id fall under a synthetic
  // default section so legacy content is never dropped.
  const displayPages = useMemo(() => {
    const out: { id: string; title: string }[] = pages.map(p => ({ id: p.id, title: p.title }));
    if ((modulesByPage[DEFAULT_PAGE]?.length ?? 0) > 0) {
      out.push({ id: DEFAULT_PAGE, title: pages.length > 0 ? 'Other' : 'Content' });
    }
    return out;
  }, [pages, modulesByPage]);

  // When the active page tab changes, jump to the first module in that page.
  const switchPage = useCallback((pageId: string) => {
    setActivePageId(pageId);
    const firstMod = (modulesByPage[pageId] ?? [])[0];
    if (firstMod) {
      setActiveId(firstMod.id);
      setResult(null);
      setQuizError('');
      setVivaResult(null);
      setVivaError('');
    }
  }, [modulesByPage]);

  // Sidebar only shows the modules that belong to the currently selected page tab.
  const sidebarPages = useMemo(() => {
    if (displayPages.length <= 1) return displayPages; // no tabs → show everything as-is
    const pid = activePageId ?? displayPages[0]?.id;
    return displayPages.filter(p => p.id === pid);
  }, [displayPages, activePageId]);

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
  useEffect(() => {
    setCodeResult(null); setCodeRunning(false);
    setAssignResult(null); setAssignError('');
    setVivaResult(null); setVivaError('');
  }, [activeId]);

  // Seed the assignment editor with the starter code once per module — the ref
  // guard keeps a modules refresh (e.g. after submit) from clobbering typed code.
  useEffect(() => {
    if (!active || active.type !== 'assign') return;
    if (assignSeeded.current === active.id) return;
    assignSeeded.current = active.id;
    setAssignCode(String((active.content_data as { starter_code?: string })?.starter_code || ''));
  }, [active]);

  // Reset viva answers once per viva module (so switching modules starts fresh
  // but a modules refresh after submit doesn't wipe in-progress answers).
  useEffect(() => {
    if (!active || active.type !== 'viva') return;
    if (vivaSeeded.current === active.id) return;
    vivaSeeded.current = active.id;
    setVivaAnswers({});
  }, [active]);

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

  const submitAssign = async () => {
    if (!active) return;
    if (!assignCode.trim()) { setAssignError('Write some code before submitting.'); return; }
    setAssignSubmitting(true);
    setAssignError('');
    try {
      const lang = String((active.content_data as { language?: string })?.language || 'python');
      const pkgs = (active.content_data as { packages?: string | string[] })?.packages;
      const res = await studentService.submitAssignment(active.id, { code: assignCode, language: lang, packages: pkgs });
      setAssignResult(res);
      // Reflect the new best score / completion locally (module id is stable).
      setModules(ms => ms.map(m => m.id === active.id
        ? { ...m, score: res.best_score, completed: m.completed || res.passed }
        : m));
    } catch (e) {
      setAssignError(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setAssignSubmitting(false);
    }
  };

  const submitViva = async () => {
    if (!active || active.type !== 'viva') return;
    const qs = active.viva_config?.questions ?? [];
    if (qs.length === 0) return;
    if (qs.some(q => !(vivaAnswers[q.index] || '').trim())) {
      setVivaError('Answer every question before submitting.');
      return;
    }
    setVivaSubmitting(true);
    setVivaError('');
    try {
      const res = await studentService.submitVivaAnswers(active.id, vivaAnswers);
      setVivaResult(res);
      setModules(ms => ms.map(m => m.id === active.id
        ? { ...m, score: res.best_score, completed: m.completed || res.passed }
        : m));
    } catch (e) {
      setVivaError(e instanceof Error ? e.message : 'Viva submission failed');
    } finally {
      setVivaSubmitting(false);
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
        <>
          {/* ── Page tab bar (only when the experiment has multiple pages) ── */}
          {displayPages.length > 1 && (
            <div className={styles.tabs} style={{ marginBottom: 18 }}>
              {displayPages.map(page => {
                const pageModules = modulesByPage[page.id] ?? [];
                const donePage = pageModules.filter(m => m.completed).length;
                const isActive = (activePageId ?? displayPages[0]?.id) === page.id;
                return (
                  <button
                    key={page.id}
                    className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
                    onClick={() => switchPage(page.id)}
                  >
                    {page.title}
                    {pageModules.length > 0 && (
                      <span style={{ marginLeft: 6, fontSize: 11, opacity: .7 }}>
                        {donePage}/{pageModules.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

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

            {sidebarPages.map((page, pi) => {
              const pageModules = modulesByPage[page.id] ?? [];
              return (
                <Fragment key={page.id}>
                  {/* Show the page header in the sidebar only when no top tab bar
                      is visible (single-page experiment) */}
                  {displayPages.length > 1 && false && (
                    <div className={styles.pageHeader} style={{ marginTop: pi === 0 ? 0 : 16, marginBottom: 6 }}>
                      <p className={styles.expTitle} style={{ margin: 0, color: '#7c3aed' }}>
                        📄 {page.title}
                      </p>
                    </div>
                  )}
                  {pageModules.map((m, i) => {
                    const Icon = MODULE_ICONS[m.type] || BookOpen;
                    return (
                      <div
                        key={m.id}
                        className={`${styles.expCard} ${activeId === m.id ? styles.expCardActive : ''}`}
                        onClick={() => m.type === 'quiz' ? openQuiz(m) : (setActiveId(m.id), setResult(null), setQuizError(''), setVivaResult(null), setVivaError(''))}
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
                            : m.type === 'html' ? 'Interactive'
                            : m.type === 'link' ? 'External Link'
                            : m.type === 'file' ? 'Download'
                            : m.type === 'assign' ? 'Coding task'
                            : m.type === 'quiz' ? `Quiz · pass ≥ ${m.quiz_config?.pass_threshold ?? 70}%`
                            : m.type === 'viva' ? `AI Viva · pass ≥ ${m.viva_config?.pass_threshold ?? 70}%`
                            : 'Content'}
                          {m.type === 'quiz' && ` · ${m.quiz_config?.attempts_used ?? 0}/${m.quiz_config?.max_attempts ?? 3} attempts used`}
                          {m.type === 'quiz' && m.score != null && ` · last score ${Math.round(m.score)}%`}
                          {m.type === 'assign' && m.score != null && ` · best ${Math.round(m.score)}%`}
                          {m.type === 'viva' && m.viva_config && m.score != null && ` · best ${Math.round(m.score)}%`}
                          {m.type === 'viva' && m.viva_config && ` · ${m.viva_config.attempts_used} attempts used`}
                        </p>
                      </div>
                    );
                  })}
                </Fragment>
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

            {active && active.type === 'html' && (
              <div className={styles.tabContent}>
                <div className={styles.theoryBox}>
                  <h3 className={styles.theoryHeading}>🌐 {active.title}</h3>
                  {(active.content_data as { html?: string })?.html ? (
                    <iframe
                      title={active.title}
                      srcDoc={String((active.content_data as { html?: string })?.html)}
                      sandbox="allow-scripts allow-popups allow-forms"
                      style={{ width: '100%', height: 420, border: '1px solid #e5e0ec', borderRadius: 8, background: '#fff' }}
                    />
                  ) : (
                    <p className={styles.expMeta}>Interactive content not available yet.</p>
                  )}
                  {!active.completed && (
                    <button className={styles.submitBtn} style={{ marginTop: 12 }} onClick={() => markComplete(active)}>✓ Mark as Done</button>
                  )}
                  {active.completed && <p className={styles.completedNote}><CheckCircle2 size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Completed</p>}
                </div>
              </div>
            )}

            {active && active.type === 'link' && (
              <div className={styles.tabContent}>
                <div className={styles.theoryBox}>
                  <h3 className={styles.theoryHeading}>🔗 {active.title}</h3>
                  {(active.content_data as { url?: string })?.url ? (
                    <a
                      href={String((active.content_data as { url?: string })?.url)}
                      target="_blank" rel="noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 8, background: '#f3effc', color: '#7c3aed', fontWeight: 600, textDecoration: 'none', border: '1px solid #e5e0ec' }}
                    >
                      <ExternalLink size={16} /> {String((active.content_data as { label?: string })?.label || (active.content_data as { url?: string })?.url)}
                    </a>
                  ) : (
                    <p className={styles.expMeta}>Link not available yet.</p>
                  )}
                  {(active.content_data as { description?: string })?.description && (
                    <p className={styles.expMeta} style={{ marginTop: 10 }}>{String((active.content_data as { description?: string }).description)}</p>
                  )}
                  {!active.completed && (
                    <button className={styles.submitBtn} style={{ marginTop: 12 }} onClick={() => markComplete(active)}>✓ Mark as Visited</button>
                  )}
                  {active.completed && <p className={styles.completedNote}><CheckCircle2 size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Completed</p>}
                </div>
              </div>
            )}

            {active && active.type === 'file' && (
              <div className={styles.tabContent}>
                <div className={styles.theoryBox}>
                  <h3 className={styles.theoryHeading}>📎 {active.title}</h3>
                  {(active.content_data as { url?: string })?.url ? (
                    <a
                      href={String((active.content_data as { url?: string })?.url)}
                      target="_blank" rel="noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 8, background: '#f3effc', color: '#7c3aed', fontWeight: 600, textDecoration: 'none', border: '1px solid #e5e0ec' }}
                    >
                      <Download size={16} /> {String((active.content_data as { filename?: string })?.filename || 'Download file')}
                      <span style={{ opacity: 0.6, fontWeight: 500 }}>({String((active.content_data as { kind?: string })?.kind || 'file')})</span>
                    </a>
                  ) : (
                    <p className={styles.expMeta}>File not available yet.</p>
                  )}
                  {!active.completed && (
                    <button className={styles.submitBtn} style={{ marginTop: 12 }} onClick={() => markComplete(active)}>✓ Mark as Downloaded</button>
                  )}
                  {active.completed && <p className={styles.completedNote}><CheckCircle2 size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Completed</p>}
                </div>
              </div>
            )}

            {active && active.type === 'assign' && (() => {
              const mod = active;
              if (!mod) return null;
              const cd = (mod.content_data as {
                language?: string; instructions?: string; pass_threshold?: number; test_cases?: unknown[];
              }) || {};
              const lang = String(cd.language || 'python');
              const threshold = typeof cd.pass_threshold === 'number' ? cd.pass_threshold : 60;
              const totalTests = Array.isArray(cd.test_cases) ? cd.test_cases.length : 0;
              return (
                <div className={styles.tabContent}>
                  <div className={styles.theoryBox}>
                    <h3 className={styles.theoryHeading}>💻 {mod.title}</h3>
                    <p className={styles.expMeta} style={{ marginBottom: 10 }}>
                      Graded · {lang} · pass ≥ {threshold}% · {totalTests} test case{totalTests === 1 ? '' : 's'}
                    </p>
                    {cd.instructions && (
                      <div className={styles.theoryText} style={{ marginBottom: 14 }}
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(String(cd.instructions)) }} />
                    )}

                    <p className={styles.expMeta} style={{ marginBottom: 6 }}>Your solution ({lang})</p>
                    <textarea
                      value={assignCode}
                      onChange={e => setAssignCode(e.target.value)}
                      spellCheck={false}
                      placeholder={`# Write your ${lang} solution here`}
                      style={{ width: '100%', minHeight: 220, padding: '12px 14px', borderRadius: 8, background: '#0f0b17', color: '#e7e3f0', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, lineHeight: 1.5, border: '1px solid #2a2440', resize: 'vertical', whiteSpace: 'pre' }}
                    />

                    {assignError && <div className={styles.errorBox} style={{ marginTop: 10 }}>⚠️ {assignError}</div>}

                    <button className={styles.submitBtn} style={{ marginTop: 12 }} disabled={assignSubmitting} onClick={submitAssign}>
                      {assignSubmitting
                        ? <><Loader2 size={14} className={styles.spinner} /> Running tests…</>
                        : <><Play size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Submit &amp; Grade</>}
                    </button>

                    {assignResult && (
                      <div style={{ marginTop: 14 }}>
                        <div className={`${styles.quizResult} ${assignResult.passed ? styles.quizPass : styles.quizFail}`}>
                          <div className={styles.resultIcon}>{assignResult.passed ? '🎉' : '😕'}</div>
                          <h3>{assignResult.passed ? 'Passed' : 'Not passed yet'} · {assignResult.passed_tests}/{assignResult.total_tests} tests</h3>
                          <p>Score {assignResult.score}% · best {assignResult.best_score}% · threshold {assignResult.threshold}% · attempt {assignResult.attempts_used}</p>
                        </div>
                        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {assignResult.results.map(r => (
                            <div key={r.index} style={{ border: '1px solid #2a2440', borderRadius: 8, overflow: 'hidden' }}>
                              <div style={{ padding: '8px 12px', fontSize: 12.5, fontWeight: 600, background: r.passed ? '#ecfdf3' : '#fef2f2', color: r.passed ? '#067647' : '#b42318' }}>
                                {r.passed ? '✓' : '✕'} Test {r.index + 1}{r.hidden ? ' · hidden' : ''}{r.status ? ` · ${r.status}` : ''}
                              </div>
                              {!r.hidden && (
                                <div style={{ padding: '8px 12px', fontSize: 12.5, background: '#0f0b17', color: '#e7e3f0', display: 'grid', gap: 6 }}>
                                  {r.input ? <div><span style={{ opacity: .6 }}>stdin:</span><pre style={preMini}>{r.input}</pre></div> : null}
                                  <div><span style={{ opacity: .6 }}>expected:</span><pre style={preMini}>{r.expected}</pre></div>
                                  <div><span style={{ opacity: .6 }}>got:</span><pre style={preMini}>{r.actual || '(no output)'}</pre></div>
                                  {r.stderr ? <div><span style={{ opacity: .6, color: '#fca5a5' }}>stderr:</span><pre style={preMini}>{r.stderr}</pre></div> : null}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {mod.completed && <p className={styles.completedNote}><CheckCircle2 size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Completed</p>}
                  </div>
                </div>
              );
            })()}

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

            {active && active.type === 'viva' && (
              <div className={styles.tabContent}>
                <div className={styles.quizBox}>
                  {active.completed && !vivaResult && (
                    <div className={styles.unlockedMsg}>
                      <div className={styles.unlockedIcon}>🎉</div>
                      <h3>Viva Passed!</h3>
                      <p>Score: {active.score != null ? `${Math.round(active.score)}%` : '—'} (threshold {active.viva_config?.pass_threshold ?? 70}%).</p>
                    </div>
                  )}

                  {vivaError && <div className={styles.errorBox}>⚠️ {vivaError}</div>}

                  {active.viva_config && active.viva_config.questions.length > 0 && (
                    <>
                      <div className={styles.quizHeader}>
                        <h3 className={styles.quizTitle}>🎤 {active.title}</h3>
                        <span className={styles.quizThreshold}>
                          Pass ≥ {active.viva_config.pass_threshold}% · {active.viva_config.count} question{active.viva_config.count === 1 ? '' : 's'} · {active.viva_config.attempts_used} attempt{active.viva_config.attempts_used === 1 ? '' : 's'} used
                        </span>
                      </div>

                      {active.viva_config.questions.map(q => (
                        <div key={q.index} className={styles.question}>
                          <p className={styles.questionText}>Q{q.index + 1}. {q.question}</p>
                          <textarea
                            value={vivaAnswers[q.index] || ''}
                            onChange={e => setVivaAnswers(a => ({ ...a, [q.index]: e.target.value }))}
                            placeholder="Type your answer here…"
                            style={{
                              width: '100%', minHeight: 100, padding: '10px 12px', borderRadius: 8,
                              background: '#faf9fc', color: '#111827', fontFamily: 'inherit',
                              fontSize: 13.5, lineHeight: 1.5, border: '1px solid #e5e0ec', resize: 'vertical'
                            }}
                          />
                          {vivaResult && vivaResult.per_question[q.index] && (
                            <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: '#f3effc', border: '1px solid #e5e0ec' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <span style={{ fontWeight: 700, color: vivaResult.per_question[q.index].score >= 6 ? '#067647' : '#b42318' }}>
                                  {vivaResult.per_question[q.index].score >= 6 ? '✓' : '✕'} Score: {vivaResult.per_question[q.index].score}/10
                                </span>
                              </div>
                              <p style={{ margin: 0, fontSize: 12.5, color: '#374151' }}>{vivaResult.per_question[q.index].feedback}</p>
                            </div>
                          )}
                        </div>
                      ))}

                      {!vivaResult ? (
                        <button
                          className={styles.submitBtn}
                          disabled={active.viva_config.questions.some(q => !(vivaAnswers[q.index] || '').trim()) || vivaSubmitting}
                          onClick={submitViva}
                        >
                          {vivaSubmitting ? <><Loader2 size={14} className={styles.spinner} /> Submitting…</> : 'Submit Answers'}
                        </button>
                      ) : (
                        <div className={`${styles.quizResult} ${vivaResult.passed ? styles.quizPass : styles.quizFail}`}>
                          {vivaResult.passed ? (
                            <>
                              <div className={styles.resultIcon}>🎉</div>
                              <h3>Passed! Score: {vivaResult.score}%</h3>
                              <p>Threshold {vivaResult.threshold}% · best {vivaResult.best_score}% · attempt {vivaResult.attempts_used}</p>
                              <button className={styles.joinBtn} onClick={() => router.push('/student/live-lab')}>
                                🚀 Continue to Live Lab
                              </button>
                            </>
                          ) : (
                            <>
                              <div className={styles.resultIcon}>😕</div>
                              <h3>Score: {vivaResult.score}% — Not Passed</h3>
                              <p>You need at least {vivaResult.threshold}%. Attempts used: {vivaResult.attempts_used}. Review the material and retry.</p>
                              <button className={styles.retryBtn} onClick={() => { setVivaAnswers({}); setVivaResult(null); }}>🔄 Retry Viva</button>
                            </>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
        </>
      )}
    </StudentShell>
  );
}
