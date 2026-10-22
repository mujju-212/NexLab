'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import DOMPurify from 'dompurify';
import StudentShell from '@/components/layout/StudentShell';
import { useSocket } from '@/hooks/use-socket';
import { studentService, type AssignmentSubmitResult, type VivaSubmitResult, type ContentPage, type ExperimentDetail } from '@/services/student.service';
import { executionService, type PlaygroundResult } from '@/services/execution.service';
import { renderMarkdown } from '@/lib/markdown';
import { getSubjectIconDef } from '@/lib/subject-icons';
import type { ContentModule, QuizQuestion, LabSession } from '@/types';
import {
  Loader2, ArrowLeft, ArrowRight, CheckCircle2, Circle, FileText, PlayCircle,
  HelpCircle, BookOpen, Code2, Image as ImageIcon, FileCode, Play, Globe,
  Link2, Download, ExternalLink, ClipboardCheck, Mic2, Maximize2, Minimize2,
  ChevronLeft, ChevronRight, Copy, Check, Lightbulb, Plus, X, Sparkles,
  Layers, Compass, Info, FileEdit, Timer, CalendarClock
} from 'lucide-react';
import styles from '../page.module.css';
import { useServerCountdown } from '@/lib/countdown';

interface QuizResult {
  score: number;
  passed: boolean;
  threshold: number;
  attempts_used: number;
  correct_count: number;
  total_points: number;
  timed_out?: boolean;
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
  text: BookOpen,
  video: PlayCircle,
  pdf: FileText,
  quiz: HelpCircle,
  markdown: FileCode,
  code: Code2,
  image: ImageIcon,
  html: Globe,
  link: Link2,
  file: Download,
  assign: ClipboardCheck,
  viva: Mic2,
};

const DEFAULT_PAGE = '__default__';

/** Inline style for a server-time countdown pill (green → amber → red). */
const timerPillStyle = (cd: { expired: boolean; warn: boolean }): CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 14px',
  borderRadius: 9999, fontVariantNumeric: 'tabular-nums', fontSize: 15, fontWeight: 800,
  background: cd.expired ? '#fef2f2' : cd.warn ? '#fffbeb' : '#ecfdf5',
  color: cd.expired ? '#b91c1c' : cd.warn ? '#b45309' : '#047857',
  border: `1.5px solid ${cd.expired ? 'rgba(239,68,68,.35)' : cd.warn ? 'rgba(245,158,11,.35)' : 'rgba(16,185,129,.3)'}`,
});

/** Compact, locale-friendly deadline label for the assignment banner. */
const fmtDue = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  });
};

export default function PreLabDetailPage() {
  const router = useRouter();
  const params = useParams<{ experimentId: string }>();
  const experimentId = params.experimentId;

  const [modules, setModules] = useState<ContentModule[]>([]);
  const [pages, setPages] = useState<ContentPage[]>([]);
  const [experiment, setExperiment] = useState<ExperimentDetail | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Server clock (ISO-Z) from getPreLabContent — reference for deadline countdowns.
  const [serverNow, setServerNow] = useState<string>(() => new Date().toISOString());

  // Interactive UI state
  const [copiedCode, setCopiedCode] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [userNotes, setUserNotes] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHtmlSource, setShowHtmlSource] = useState(false);

  // Navigate back to the subject's experiment list (or /student/subjects fallback)
  const handleBackToSubject = useCallback(() => {
    if (experiment?.subject_id) {
      router.push(`/student/subjects/${experiment.subject_id}`);
    } else {
      router.push('/student/subjects');
    }
  }, [experiment?.subject_id, router]);

  // Fullscreen controller with native browser API fallback & Escape key handling
  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
        setIsFullscreen(true);
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
        setIsFullscreen(false);
      }
    } catch {
      // In case browser restricts native fullscreen, toggle in-app fullscreen mode
      setIsFullscreen(prev => !prev);
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Quiz state
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<QuizResult | null>(null);

  // Feature 3 — optional per-quiz countdown (server-authoritative). The limit +
  // a server "now" are captured when questions are fetched; the deadline is that
  // now + limit, so a wrong client clock can't add or remove time.
  const [quizLimitMin, setQuizLimitMin] = useState<number | null>(null);
  const [quizStartedAt, setQuizStartedAt] = useState<string | null>(null);
  const [quizServerNow, setQuizServerNow] = useState<string | null>(null);
  const [quizDeadlineIso, setQuizDeadlineIso] = useState<string | null>(null);
  const quizAutoSubmitted = useRef(false);

  const applyQuizTiming = useCallback((limitMin: number | null, sNow: string | null) => {
    const nowIso = sNow || new Date().toISOString();
    quizAutoSubmitted.current = false;
    setQuizStartedAt(nowIso);
    setQuizServerNow(nowIso);
    setQuizLimitMin(limitMin ?? null);
    setQuizDeadlineIso(limitMin
      ? new Date(new Date(nowIso).getTime() + limitMin * 60000).toISOString()
      : null);
  }, []);

  // Runnable code-block state
  const [codeRunning, setCodeRunning] = useState(false);
  const [codeResult, setCodeResult] = useState<PlaygroundResult | null>(null);

  // Graded coding-assignment state
  const [assignCode, setAssignCode] = useState('');
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignResult, setAssignResult] = useState<AssignmentSubmitResult | null>(null);
  const [assignError, setAssignError] = useState('');
  const assignSeeded = useRef<string | null>(null);

  // AI-viva state
  const [vivaAnswers, setVivaAnswers] = useState<Record<number, string>>({});
  const [vivaSubmitting, setVivaSubmitting] = useState(false);
  const [vivaResult, setVivaResult] = useState<VivaResult | null>(null);
  const [vivaError, setVivaError] = useState('');
  const vivaSeeded = useRef<string | null>(null);

  // Load user notes from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedNotes = localStorage.getItem(`prelab_notes_${experimentId}`);
      if (savedNotes) setUserNotes(savedNotes);
    }
  }, [experimentId]);

  const saveNotes = (val: string) => {
    setUserNotes(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem(`prelab_notes_${experimentId}`, val);
    }
  };

  const loadModules = useCallback(async () => {
    try {
      const res = await studentService.getPreLabContent(experimentId);
      setModules(res.modules);
      setPages(res.pages);
      if (res.server_now) setServerNow(res.server_now);
      if (res.experiment) {
        setExperiment(res.experiment);
      }
      setActiveId(prev => prev ?? res.modules[0]?.id ?? null);
      setActivePageId(prev => {
        if (prev !== null) return prev;
        if (res.modules.length === 0) return DEFAULT_PAGE;
        return res.modules[0].page_id ?? DEFAULT_PAGE;
      });
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pre-lab content');
    } finally {
      setLoading(false);
    }
  }, [experimentId]);

  useEffect(() => { loadModules(); }, [loadModules]);

  // Live session socket listeners
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    studentService.getSessions()
      .then((list: LabSession[]) => {
        const active = list.find(s => s.experiment_id === experimentId && s.status === 'active');
        if (!ctrl.signal.aborted && active) setLiveSessionId(active.id);
      })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [experimentId]);

  useSocket({
    sessionId: liveSessionId || '',
    enabled: !!liveSessionId,
    onQuizLaunched: useCallback(() => { loadModules(); }, [loadModules]),
    onPageLaunched: useCallback(() => { loadModules(); }, [loadModules]),
  });

  const active = useMemo(() => modules.find(m => m.id === activeId) || null, [modules, activeId]);
  const doneCount = useMemo(() => modules.filter(m => m.completed).length, [modules]);
  const progressPct = useMemo(() => modules.length ? Math.round((doneCount / modules.length) * 100) : 0, [doneCount, modules.length]);

  // Feature 3 — live countdowns (server-time based) for the optional quiz limit
  // and the optional assignment deadline. Hooks are unconditional; a null target
  // simply means "untimed" and is guarded at each use site.
  const quizCd = useServerCountdown(quizDeadlineIso, quizServerNow);
  const assignDueIso = (active?.type === 'assign'
    ? (active.content_data as { due_at?: string | null })?.due_at ?? null
    : null) || null;
  const assignCd = useServerCountdown(assignDueIso, serverNow);
  const assignClosed = !!assignDueIso && assignCd.expired;

  // Synchronize state when active module changes
  useEffect(() => {
    if (!active) return;
    setShowHtmlSource(false);

    // Auto-seed quiz questions if entering a quiz module
    if (active.type === 'quiz') {
      setQuizError('');
      setResult(null);
      setAnswers({});
      setQuestions([]);
      setQuizLoading(true);
      studentService.getQuizQuestions(active.id)
        .then(res => { setQuestions(res.questions); applyQuizTiming(res.time_limit_minutes, res.server_now); })
        .catch(e => setQuizError(e instanceof Error ? e.message : 'Could not load quiz questions'))
        .finally(() => setQuizLoading(false));
    }

    // Auto-seed assignment starter code
    if (active.type === 'assign') {
      if (assignSeeded.current !== active.id) {
        assignSeeded.current = active.id;
        const starter = String((active.content_data as { starter_code?: string })?.starter_code || '');
        setAssignCode(starter);
        setAssignResult(null);
        setAssignError('');
      }
    }

    // Reset code runner result on module switch
    if (active.type === 'code') {
      setCodeResult(null);
      setCodeRunning(false);
    }

    // Reset viva state on module switch
    if (active.type === 'viva') {
      if (vivaSeeded.current !== active.id) {
        vivaSeeded.current = active.id;
        setVivaAnswers({});
        setVivaResult(null);
        setVivaError('');
      }
    }
  }, [active?.id, active?.type]);

  // Group modules by page tab
  const hasAuthoredPages = pages.length > 0;

  const displayPages = useMemo(() => {
    if (hasAuthoredPages) {
      return pages.map((p, idx) => ({
        id: p.id,
        title: p.title,
        step: idx + 1,
        icon: idx === 0 ? BookOpen : idx === 1 ? Code2 : idx === 2 ? PlayCircle : ClipboardCheck,
      }));
    }

    // Default 4 learning phases matching reference image
    return [
      { id: 'p-intro', title: 'Introduction', step: 1, icon: BookOpen },
      { id: 'p-code', title: 'Code Example', step: 2, icon: Code2 },
      { id: 'p-practice', title: 'Practice', step: 3, icon: PlayCircle },
      { id: 'p-assessment', title: 'Assessment', step: 4, icon: ClipboardCheck },
    ];
  }, [hasAuthoredPages, pages]);

  const currentTabId = activePageId ?? displayPages[0]?.id;

  // Distribute modules to tabs
  const pageModulesMap: Record<string, ContentModule[]> = useMemo(() => {
    if (hasAuthoredPages) {
      const map: Record<string, ContentModule[]> = {};
      modules.forEach(m => {
        const pid = m.page_id ?? pages[0]?.id ?? DEFAULT_PAGE;
        (map[pid] ??= []).push(m);
      });
      return map;
    }

    // Categorize modules into the 4 standard learning tabs
    const map: Record<string, ContentModule[]> = {
      'p-intro': [],
      'p-code': [],
      'p-practice': [],
      'p-assessment': [],
    };

    modules.forEach(m => {
      if (m.type === 'text' || m.type === 'markdown' || m.type === 'video' || m.type === 'pdf' || m.type === 'image' || m.type === 'link') {
        map['p-intro'].push(m);
      } else if (m.type === 'code' || m.type === 'html') {
        map['p-code'].push(m);
      } else if (m.type === 'assign') {
        map['p-practice'].push(m);
      } else if (m.type === 'quiz' || m.type === 'viva') {
        map['p-assessment'].push(m);
      } else if (m.type === 'file') {
        const fn = String((m.content_data as { filename?: string; url?: string })?.filename || (m.content_data as { filename?: string; url?: string })?.url || '').toLowerCase();
        if (fn.endsWith('.html') || fn.endsWith('.htm')) {
          map['p-code'].push(m);
        } else {
          map['p-intro'].push(m);
        }
      } else {
        map['p-intro'].push(m);
      }
    });

    // If any tab has 0 modules, ensure at least one module is viewable or fallback
    if (map['p-intro'].length === 0 && modules.length > 0) {
      map['p-intro'].push(modules[0]);
    }

    return map;
  }, [hasAuthoredPages, pages, modules]);

  // Current list of modules for the selected page tab
  const activeTabModules = useMemo(() => {
    const list = pageModulesMap[currentTabId] ?? [];
    return list.length > 0 ? list : modules;
  }, [pageModulesMap, currentTabId, modules]);

  // Handle switching tabs
  const switchPage = (pageId: string) => {
    setActivePageId(pageId);
    const firstMod = (pageModulesMap[pageId] ?? [])[0] ?? modules[0];
    if (firstMod) {
      setActiveId(firstMod.id);
      setResult(null);
      setQuizError('');
      setVivaResult(null);
      setVivaError('');
    }
  };

  // Next / Previous navigation within modules
  const currentModuleIndex = useMemo(() => {
    return activeTabModules.findIndex(m => m.id === activeId);
  }, [activeTabModules, activeId]);

  const goToNextModule = () => {
    if (currentModuleIndex >= 0 && currentModuleIndex < activeTabModules.length - 1) {
      const nextMod = activeTabModules[currentModuleIndex + 1];
      setActiveId(nextMod.id);
    } else {
      // Advance to next page tab
      const currentTabIdx = displayPages.findIndex(p => p.id === currentTabId);
      if (currentTabIdx < displayPages.length - 1) {
        switchPage(displayPages[currentTabIdx + 1].id);
      }
    }
  };

  const goToPrevModule = () => {
    if (currentModuleIndex > 0) {
      const prevMod = activeTabModules[currentModuleIndex - 1];
      setActiveId(prevMod.id);
    } else {
      // Step back to previous page tab
      const currentTabIdx = displayPages.findIndex(p => p.id === currentTabId);
      if (currentTabIdx > 0) {
        switchPage(displayPages[currentTabIdx - 1].id);
      }
    }
  };

  // Sanitize HTML / Markdown
  const safeHtml = useMemo(() => {
    if (!active) return '';
    if (active.type === 'text' || active.type === 'html') {
      const raw = String(
        (active.content_data as { html?: string; content?: string })?.html ||
        (active.content_data as { html?: string; content?: string })?.content ||
        '<p>No content available.</p>'
      );
      return DOMPurify.sanitize(raw);
    }
    return '';
  }, [active]);

  const safeMd = useMemo(() => {
    if (!active || active.type !== 'markdown') return '';
    return renderMarkdown(String((active.content_data as any)?.md || (active.content_data as any)?.text || (active.content_data as any)?.content || ''));
  }, [active]);

  // Copy code helper
  const handleCopyCode = (codeStr: string) => {
    navigator.clipboard.writeText(codeStr);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Run code playground
  const runStudentCode = async () => {
    if (!active) return;
    const cd = (active.content_data as { code?: string; language?: string; stdin?: string }) || {};
    if (!cd.code) return;
    setCodeRunning(true);
    setCodeResult(null);
    try {
      const res = await executionService.runPlayground({
        code: String(cd.code),
        language: String(cd.language || 'python'),
        stdin: String(cd.stdin || ''),
      });
      setCodeResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not run code');
    } finally {
      setCodeRunning(false);
    }
  };

  // Mark module complete & continue
  const markComplete = async (mod: ContentModule) => {
    try {
      await studentService.markModuleComplete(mod.id);
      setModules(ms => ms.map(m => m.id === mod.id ? { ...m, completed: true } : m));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not mark module complete');
    }
  };

  const markCompleteAndContinue = async () => {
    if (active) {
      await markComplete(active);
    }
    goToNextModule();
  };

  // Graded assignment submit
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
      setModules(ms => ms.map(m => m.id === active.id
        ? { ...m, score: res.best_score, completed: m.completed || res.passed }
        : m));
    } catch (e) {
      setAssignError(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setAssignSubmitting(false);
    }
  };

  // AI viva submit
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

  // Quizzes
  const openQuiz = async (quizModule: ContentModule) => {
    setActiveId(quizModule.id);
    setQuizError('');
    setResult(null);
    setAnswers({});
    setQuestions([]);
    setQuizLoading(true);
    try {
      const res = await studentService.getQuizQuestions(quizModule.id);
      setQuestions(res.questions);
      applyQuizTiming(res.time_limit_minutes, res.server_now);
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
      const res = await studentService.submitQuiz(active.id, answers, quizStartedAt);
      setResult(res);
      setModules(ms => ms.map(m => m.id === active.id
        ? { ...m, score: res.score, completed: m.completed || res.passed }
        : m));
    } catch (e) {
      setQuizError(e instanceof Error ? e.message : 'Quiz submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  // Feature 3 — auto-submit the quiz the moment the visible countdown hits zero
  // (only when a limit is set, questions are loaded, and it hasn't been graded).
  useEffect(() => {
    if (quizLimitMin && quizDeadlineIso && quizCd.expired && questions.length > 0
        && !result && !submitting && !quizAutoSubmitted.current) {
      quizAutoSubmitted.current = true;
      submitQuiz();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizCd.expired, quizLimitMin, quizDeadlineIso, questions.length, result, submitting]);

  // Visual Assets
  const iconDef = getSubjectIconDef(
    experiment?.icon,
    experiment?.subject_code,
    experiment?.subject_name || experiment?.title
  );

  const conceptTags = (experiment?.concept_tags && experiment.concept_tags.length > 0)
    ? experiment.concept_tags
    : ['Stack', 'Arrays', 'LIFO', 'Data Structures'];

  const ActiveIcon = active ? (MODULE_ICONS[active.type] || BookOpen) : BookOpen;

  if (loading) {
    return (
      <StudentShell activePage="My Subjects">
        <div className={styles.loadingBox}>
          <Loader2 size={24} className={styles.spinner} />
          <span>Loading experiment modules…</span>
        </div>
      </StudentShell>
    );
  }

  return (
    <StudentShell activePage="My Subjects">
      <div className={isFullscreen ? styles.fullscreenContainer : styles.pageContainer}>

        {/* ══ 1. TOP BREADCRUMBS & ACTION BUTTONS BAR ══ */}
        <div className={styles.topNavRow}>
          <div className={styles.topLeftNav}>
            <button
              className={styles.backSubjectBtn}
              onClick={handleBackToSubject}
              title={`Back to ${experiment?.subject_name || 'Subject'}`}
            >
              <ArrowLeft size={15} />
              <span>Back to {experiment?.subject_name || 'Subject'}</span>
            </button>

            <div className={styles.breadcrumbs}>
              <span
                className={styles.crumbLink}
                onClick={() => router.push('/student/subjects')}
              >
                <Compass size={15} /> My Subjects
              </span>
              <span className={styles.crumbSep}>&gt;</span>
              <span
                className={styles.crumbLink}
                onClick={handleBackToSubject}
              >
                {experiment?.subject_name || 'Data Structures'}
              </span>
              <span className={styles.crumbSep}>&gt;</span>
              <span className={styles.crumbActive}>
                {experiment?.title || 'Stack Implementation using Arrays'}
              </span>
            </div>
          </div>

          <div className={styles.topActions}>
            <button
              className={styles.labGuideBtn}
              onClick={() => setShowGuideModal(true)}
            >
              <BookOpen size={14} />
              <span>Lab Guide</span>
            </button>

            {isFullscreen ? (
              <button
                className={styles.fullscreenExitBtn}
                onClick={toggleFullscreen}
                title="Exit Fullscreen (Esc)"
              >
                <Minimize2 size={15} />
                <span>Exit Fullscreen</span>
              </button>
            ) : (
              <button
                className={styles.fullscreenBtn}
                onClick={toggleFullscreen}
                title="Fullscreen Reading Mode"
              >
                <Maximize2 size={16} />
              </button>
            )}
          </div>
        </div>

        {/* ══ 2. HERO HEADER CARD WITH CIRCULAR PROGRESS DIAL ══ */}
        <div className={styles.heroCard}>
          <div className={styles.heroLeft}>
            <div className={styles.heroIconBox}>
              <Image
                src={iconDef.src}
                alt={experiment?.title || 'Subject Icon'}
                fill
                style={{ objectFit: 'cover' }}
                sizes="64px"
              />
            </div>

            <div className={styles.heroInfo}>
              <h1 className={styles.heroTitle}>
                {experiment?.title || 'Stack Implementation using Arrays'}
              </h1>
              <p className={styles.heroDesc}>
                {experiment?.aim || 'Implement stack operations using arrays and analyze time complexity.'}
              </p>

              <div className={styles.tagsRow}>
                {conceptTags.map((tag, idx) => (
                  <span key={`${tag}-${idx}`} className={styles.conceptTag}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.heroRight}>
            <div className={styles.progressWidget}>
              {/* Circular Gauge */}
              <div className={styles.dialBox}>
                <svg className={styles.dialSvg} viewBox="0 0 58 58">
                  <defs>
                    <linearGradient id="dialGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#06b6d4" />
                      <stop offset="100%" stopColor="#7c3aed" />
                    </linearGradient>
                  </defs>
                  <circle className={styles.dialTrack} cx="29" cy="29" r="24" />
                  <circle
                    className={styles.dialProgress}
                    cx="29"
                    cy="29"
                    r="24"
                    strokeDasharray={`${(progressPct / 100) * 150.8} 150.8`}
                  />
                </svg>
                <span className={styles.dialText}>{progressPct}%</span>
              </div>

              <div className={styles.progressStats}>
                <span className={styles.progressRatio}>
                  {doneCount} / {modules.length}
                </span>
                <span className={styles.progressLabel}>Modules Completed</span>
              </div>
            </div>

            <div className={styles.heroQuote}>
              &ldquo;Experiment. Learn. Build Confidence.&rdquo;
            </div>
          </div>
        </div>

        {/* ══ 3. HORIZONTAL NUMBERED PAGE TABS BAR ══ */}
        <div className={styles.pageTabsBar}>
          {displayPages.map(page => {
            const isActive = currentTabId === page.id;
            const PageIcon = page.icon;
            return (
              <button
                key={page.id}
                className={`${styles.pageTab} ${isActive ? styles.pageTabActive : ''}`}
                onClick={() => switchPage(page.id)}
              >
                <PageIcon size={16} />
                <span className={styles.pageTabNum}>{page.step}</span>
                <span>{page.title}</span>
              </button>
            );
          })}
        </div>

        {/* ══ 4. TWO-COLUMN MAIN SECTION ══ */}
        <div className={styles.mainGrid}>

          {/* LEFT COLUMN: MODULES IN THIS PAGE TIMELINE */}
          <div className={styles.leftCol}>
            <div className={styles.modulesHeader}>
              <h3 className={styles.modulesTitle}>Modules in this page</h3>
              <span className={styles.modulesCountBadge}>
                {activeTabModules.length} modules
              </span>
            </div>

            {/* Vertical Timeline Track */}
            <div className={styles.timelineContainer}>
              <div className={styles.timelineTrack} />

              {activeTabModules.map((m, idx) => {
                const isSelected = activeId === m.id;
                const IconComp = MODULE_ICONS[m.type] || BookOpen;

                return (
                  <div key={m.id} className={styles.timelineRow}>
                    {/* Step Node */}
                    <div
                      className={`${styles.stepNode} ${
                        isSelected
                          ? styles.stepNodeActive
                          : m.completed
                          ? styles.stepNodeDone
                          : ''
                      }`}
                    >
                      {idx + 1}
                    </div>

                    {/* Module Item Card */}
                    <div
                      className={`${styles.moduleCard} ${isSelected ? styles.moduleCardActive : ''}`}
                      onClick={() => {
                        if (m.type === 'quiz') {
                          openQuiz(m);
                        } else {
                          setActiveId(m.id);
                          setResult(null);
                          setQuizError('');
                          setVivaResult(null);
                          setVivaError('');
                        }
                      }}
                    >
                      <div className={styles.moduleCardLeft}>
                        <div className={styles.moduleIconWrapper}>
                          <IconComp size={16} />
                        </div>
                        <div>
                          <h4 className={styles.moduleTitleText}>{m.title}</h4>
                          <p className={styles.moduleSubText}>
                            {m.type === 'text' ? 'Interactive explanation'
                              : m.type === 'markdown' ? 'Study Notes'
                              : m.type === 'code' ? 'Visual & Code Snippet'
                              : m.type === 'assign' ? 'Hands-on practice'
                              : m.type === 'quiz' ? 'Knowledge check'
                              : m.type === 'viva' ? 'Voice Viva Evaluation'
                              : 'Core module'}
                          </p>
                        </div>
                      </div>

                      <div className={styles.statusIndicator}>
                        {m.completed ? (
                          <CheckCircle2 size={18} color="#7c3aed" fill="#f5f3ff" />
                        ) : (
                          <Circle size={14} color="#cbd5e1" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Interactive Notes Button */}
            <button
              className={styles.addNotesBtn}
              onClick={() => setShowNotesModal(true)}
            >
              <Plus size={15} />
              <span>{userNotes ? 'Edit My Module Notes' : '+ Module notes'}</span>
            </button>

            {/* Pro Tip Card */}
            <div className={styles.proTipCard}>
              <div className={styles.proTipIconBox}>
                <Lightbulb size={16} />
              </div>
              <div>
                <h5 className={styles.proTipTitle}>Pro Tip</h5>
                <p className={styles.proTipDesc}>
                  Complete all modules to unlock the next page and your live laboratory sandbox.
                </p>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: MAIN CONTENT VIEWER */}
          <div className={styles.contentCard}>
            {/* Top Bar of Right Column */}
            <div className={styles.contentTopBar}>
              <div className={styles.contentModuleBadge}>
                <ActiveIcon size={15} />
                <span>{active?.title || 'Study Notes'}</span>
              </div>

              <div className={styles.contentTopRight}>
                {active?.completed ? (
                  <span className={styles.statusPillDone}>
                    <Check size={12} strokeWidth={3} /> Completed
                  </span>
                ) : (
                  <span className={styles.statusPillPending}>
                    <Circle size={10} /> In Progress
                  </span>
                )}

                <div className={styles.chevronBtnGroup}>
                  <button
                    className={styles.navChevronBtn}
                    onClick={goToPrevModule}
                    disabled={currentModuleIndex <= 0}
                    title="Previous Module"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    className={styles.navChevronBtn}
                    onClick={goToNextModule}
                    disabled={currentModuleIndex >= activeTabModules.length - 1}
                    title="Next Module"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Main Content Body */}
            <div className={styles.contentBody}>
              {!active && (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
                  <Sparkles size={40} color="#7c3aed" style={{ marginBottom: 12 }} />
                  <h3>Select a module to begin</h3>
                </div>
              )}

              {/* TEXT MODULE */}
              {active && active.type === 'text' && (
                <div>
                  <h2 className={styles.contentH1}>{active.title}</h2>
                  <div dangerouslySetInnerHTML={{ __html: safeHtml }} />

                  {/* Why It Matters Callout Box */}
                  <div className={styles.calloutBox}>
                    <Info size={20} className={styles.calloutIcon} />
                    <div>
                      <h4 className={styles.calloutTitle}>Why it matters?</h4>
                      <p className={styles.calloutText}>
                        Fundamental concepts and data structures power production-grade software architectures, compilers, and browser navigation models.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* MARKDOWN MODULE */}
              {active && active.type === 'markdown' && (
                <div>
                  <h2 className={styles.contentH1}>{active.title}</h2>
                  <div dangerouslySetInnerHTML={{ __html: safeMd }} />

                  <div className={styles.calloutBox}>
                    <Info size={20} className={styles.calloutIcon} />
                    <div>
                      <h4 className={styles.calloutTitle}>Key Concept</h4>
                      <p className={styles.calloutText}>
                        Review each section of theory carefully before testing your understanding in the interactive labs.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* INTERACTIVE HTML SIMULATION MODULE */}
              {active && active.type === 'html' && (() => {
                const cd = (active.content_data || {}) as { html?: string; content?: string; code?: string; url?: string };
                const htmlContent = String(cd.html || cd.content || cd.code || '');
                const htmlUrl = String(cd.url || '');

                return (
                  <div>
                    <h2 className={styles.contentH1}>{active.title}</h2>
                    <p style={{ color: '#64748b', fontSize: 13.5, margin: '0 0 12px 0' }}>
                      Interact directly with this live simulation below. You can also view its source code or open it in a dedicated window.
                    </p>

                    <div className={styles.htmlViewerContainer}>
                      <div className={styles.htmlHeaderBar}>
                        <div className={styles.htmlHeaderLeft}>
                          <Globe size={16} color="#2563eb" />
                          <span>{active.title || 'Interactive HTML Simulation'}</span>
                          <span className={styles.htmlBadge}>Live Simulation</span>
                        </div>
                        <div className={styles.htmlActions}>
                          {htmlContent && (
                            <button
                              type="button"
                              className={styles.htmlUtilityBtn}
                              onClick={() => setShowHtmlSource(prev => !prev)}
                              title="Toggle between simulation view and source code"
                            >
                              <Code2 size={13} />
                              <span>{showHtmlSource ? 'Live Simulation' : 'View Source'}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            className={styles.htmlUtilityBtn}
                            onClick={() => {
                              if (htmlUrl) {
                                window.open(htmlUrl, '_blank');
                              } else if (htmlContent) {
                                const blob = new Blob([htmlContent], { type: 'text/html' });
                                const blobUrl = URL.createObjectURL(blob);
                                window.open(blobUrl, '_blank');
                              }
                            }}
                            title="Open simulation in a dedicated full window"
                          >
                            <ExternalLink size={13} />
                            <span>Open in New Tab</span>
                          </button>
                        </div>
                      </div>

                      {showHtmlSource ? (
                        <pre className={styles.htmlSourceBox}>{htmlContent}</pre>
                      ) : (
                        <div className={styles.htmlIframeWrapper}>
                          <iframe
                            className={styles.htmlIframe}
                            title={active.title || 'HTML Simulation'}
                            srcDoc={htmlContent || undefined}
                            src={!htmlContent && htmlUrl ? htmlUrl : undefined}
                            sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals"
                          />
                        </div>
                      )}
                    </div>

                    <div className={styles.calloutBox}>
                      <Info size={20} className={styles.calloutIcon} />
                      <div>
                        <h4 className={styles.calloutTitle}>Simulation Tip</h4>
                        <p className={styles.calloutText}>
                          Feel free to explore interactive controls, input sample data, and observe how states change in real time.
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* UPLOADED FILE RESOURCE MODULE (Supports HTML Files, PDFs, and Downloads) */}
              {active && active.type === 'file' && (() => {
                const cd = (active.content_data || {}) as { url?: string; filename?: string; kind?: string };
                const fileUrl = cd.url || '';
                const fileName = cd.filename || 'Resource File';
                const fileKind = (cd.kind || '').toLowerCase();
                const isHtml = fileName.toLowerCase().endsWith('.html') || fileName.toLowerCase().endsWith('.htm') || fileUrl.toLowerCase().endsWith('.html') || fileKind === 'html';
                const isPdf = fileName.toLowerCase().endsWith('.pdf') || fileUrl.toLowerCase().endsWith('.pdf') || fileKind === 'pdf';
                const isImage = /\.(png|jpe?g|svg|webp|gif)$/i.test(fileName) || /\.(png|jpe?g|svg|webp|gif)$/i.test(fileUrl) || fileKind === 'image';

                return (
                  <div>
                    <h2 className={styles.contentH1}>{active.title}</h2>
                    <p style={{ color: '#64748b', fontSize: 13.5, margin: '0 0 12px 0' }}>
                      Attached module resource: <strong>{fileName}</strong>
                    </p>

                    {/* If it is an HTML file, render the live interactive simulation preview */}
                    {isHtml && fileUrl && (
                      <div className={styles.htmlViewerContainer}>
                        <div className={styles.htmlHeaderBar}>
                          <div className={styles.htmlHeaderLeft}>
                            <Globe size={16} color="#2563eb" />
                            <span>Interactive HTML Simulation Preview</span>
                            <span className={styles.htmlBadge}>Live Simulation</span>
                          </div>
                          <div className={styles.htmlActions}>
                            <a
                              href={fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className={styles.htmlUtilityBtn}
                            >
                              <ExternalLink size={13} />
                              <span>Open in New Tab</span>
                            </a>
                            <a
                              href={fileUrl}
                              download={fileName}
                              className={styles.htmlUtilityBtn}
                            >
                              <Download size={13} />
                              <span>Download</span>
                            </a>
                          </div>
                        </div>
                        <div className={styles.htmlIframeWrapper}>
                          <iframe
                            className={styles.htmlIframe}
                            title={fileName}
                            src={fileUrl}
                            sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals"
                          />
                        </div>
                      </div>
                    )}

                    {/* If it is a PDF file, embed the PDF reader */}
                    {isPdf && fileUrl && (
                      <iframe
                        className={styles.pdfViewerFrame}
                        src={fileUrl}
                        title={fileName}
                      />
                    )}

                    {/* If it is an image file */}
                    {isImage && fileUrl && (
                      <div className={styles.imagePreviewBox}>
                        <img src={fileUrl} alt={fileName} className={styles.imagePreviewImg} />
                      </div>
                    )}

                    {/* File Resource Card with Download Actions */}
                    <div className={styles.fileCardContainer}>
                      <div className={styles.fileCardMain}>
                        <div className={styles.fileCardLeft}>
                          <div className={styles.fileIconBox}>
                            <Download size={22} />
                          </div>
                          <div>
                            <h4 className={styles.fileFileName}>{fileName}</h4>
                            <div className={styles.fileMetaRow}>
                              <span className={styles.fileTypeBadge}>{fileKind || 'DOCUMENT'}</span>
                              <span>Ready for offline study &amp; inspection</span>
                            </div>
                          </div>
                        </div>

                        <div className={styles.fileActionBtns}>
                          {fileUrl ? (
                            <>
                              <a
                                href={fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className={styles.openFileBtn}
                              >
                                <ExternalLink size={14} />
                                <span>Open</span>
                              </a>
                              <a
                                href={fileUrl}
                                download={fileName}
                                className={styles.downloadFileBtn}
                              >
                                <Download size={14} />
                                <span>Download File</span>
                              </a>
                            </>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: 13 }}>No file URL provided.</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* CODE SNIPPET MODULE */}
              {active && active.type === 'code' && (
                <div>
                  <h2 className={styles.contentH1}>{active.title}</h2>
                  <p style={{ color: '#64748b', fontSize: 13.5, margin: '0 0 12px 0' }}>
                    Inspect the sample implementation below. You can copy the code or test its output in the runner.
                  </p>

                  {/* Dark-Themed Syntax Box */}
                  <div className={styles.codeContainer}>
                    <div className={styles.codeHeader}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#38bdf8' }} />
                        <span>{String((active.content_data as { language?: string })?.language || 'python').toUpperCase()}</span>
                      </div>

                      <button
                        className={styles.copyCodeBtn}
                        onClick={() => handleCopyCode(String((active.content_data as { code?: string })?.code || ''))}
                      >
                        {copiedCode ? <Check size={13} color="#22c55e" /> : <Copy size={13} />}
                        <span>{copiedCode ? 'Copied!' : 'Copy'}</span>
                      </button>
                    </div>

                    <pre className={styles.codeSnippet}>
                      {String((active.content_data as { code?: string })?.code || '# Code snippet')}
                    </pre>
                  </div>

                  {(active.content_data as { runnable?: boolean })?.runnable && (
                    <div style={{ marginTop: 16 }}>
                      <button
                        className={styles.runBtn}
                        onClick={runStudentCode}
                        disabled={codeRunning}
                      >
                        {codeRunning ? <Loader2 size={14} className={styles.spinner} /> : <Play size={14} />}
                        <span>{codeRunning ? 'Running on server…' : 'Run Code'}</span>
                      </button>

                      {codeResult && (
                        <div className={styles.outputBox}>
                          <p className={styles.outputLabel}>Execution Console Output</p>
                          <pre className={styles.outputPre}>{codeResult.stdout || codeResult.stderr || '(no output)'}</pre>
                        </div>
                      )}
                    </div>
                  )}

                  <div className={styles.calloutBox}>
                    <Info size={20} className={styles.calloutIcon} />
                    <div>
                      <h4 className={styles.calloutTitle}>Why it matters?</h4>
                      <p className={styles.calloutText}>
                        Contiguous memory allocation and constant time operations deliver predictable execution speed essential in low-latency systems.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* CODING ASSIGNMENT MODULE */}
              {active && active.type === 'assign' && (
                <div>
                  <h2 className={styles.contentH1}>{active.title}</h2>
                  {assignDueIso && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, padding: '10px 14px', marginBottom: 12, borderRadius: 10, background: assignClosed ? '#fef2f2' : '#f8fafc', border: `1px solid ${assignClosed ? 'rgba(239,68,68,.25)' : '#e2e8f0'}` }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#475569', fontWeight: 600 }}>
                        <CalendarClock size={15} color={assignClosed ? '#b91c1c' : '#64748b'} />
                        {assignClosed ? 'Submission closed' : `Due ${fmtDue(assignDueIso)}`}
                      </span>
                      <span style={timerPillStyle(assignCd)}>
                        <Timer size={15} />
                        {assignClosed ? 'Closed' : assignCd.label}
                      </span>
                    </div>
                  )}
                  <div className={styles.calloutBox}>
                    <Info size={20} className={styles.calloutIcon} />
                    <div>
                      <h4 className={styles.calloutTitle}>Task Instructions</h4>
                      <p className={styles.calloutText}>
                        Complete the function below. Write clean code that satisfies all test cases and maintains optimal time complexity.
                      </p>
                    </div>
                  </div>

                  <div style={{ border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden', margin: '16px 0' }}>
                    <div className={styles.editorHeader}>
                      <span className={styles.editorTitle}>Assignment Code Editor</span>
                    </div>
                    <textarea
                      className={styles.codeEditor}
                      value={assignCode}
                      onChange={e => setAssignCode(e.target.value)}
                      placeholder="# Write your solution here..."
                    />
                    <div className={styles.editorActions}>
                      <button
                        className={styles.runBtn}
                        onClick={submitAssign}
                        disabled={assignSubmitting || assignClosed}
                      >
                        {assignSubmitting ? <Loader2 size={14} className={styles.spinner} /> : <Play size={14} />}
                        <span>{assignSubmitting ? 'Testing Code…' : assignClosed ? 'Deadline Passed' : 'Submit & Grade Code'}</span>
                      </button>
                    </div>
                  </div>

                  {assignError && <div className={styles.errorBox}>{assignError}</div>}

                  {assignResult && (
                    <div className={styles.outputBox}>
                      <p className={styles.outputLabel}>
                        Result: {assignResult.passed ? 'PASSED ✅' : 'TESTS FAILED ⚠️'} · Score: {assignResult.score}%
                      </p>
                      <pre className={styles.outputPre}>
                        {assignResult.passed
                          ? 'All automated test cases passed successfully!'
                          : 'Some test cases did not match expected output.'}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* QUIZ MODULE */}
              {active && active.type === 'quiz' && (
                <div className={styles.quizBox}>
                  <div className={styles.quizHeader}>
                    <h2 className={styles.quizTitle}>{active.title}</h2>
                    <span className={styles.quizThreshold}>
                      Pass Mark ≥ {active.quiz_config?.pass_threshold ?? 70}%
                    </span>
                  </div>

                  {quizLimitMin != null && questions.length > 0 && !result && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, padding: '10px 14px', marginBottom: 14, borderRadius: 10, background: quizCd.expired ? '#fef2f2' : '#f8fafc', border: `1px solid ${quizCd.expired ? 'rgba(239,68,68,.25)' : '#e2e8f0'}` }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#475569', fontWeight: 600 }}>
                        <Timer size={15} color={quizCd.expired ? '#b91c1c' : '#64748b'} />
                        {quizCd.expired
                          ? "Time's up — submitting your answers…"
                          : `Time remaining · ${quizLimitMin} min limit · auto-submits at 0:00`}
                      </span>
                      <span style={timerPillStyle(quizCd)}>{quizCd.label}</span>
                    </div>
                  )}

                  {quizLoading ? (
                    <div className={styles.loadingBox}>
                      <Loader2 size={20} className={styles.spinner} /> Loading questions…
                    </div>
                  ) : questions.length === 0 ? (
                    <div style={{ padding: '24px 0', textAlign: 'center' }}>
                      <p style={{ color: '#64748b', marginBottom: 12 }}>Ready to test your knowledge on this module?</p>
                      <button
                        type="button"
                        className={styles.runBtn}
                        onClick={() => openQuiz(active)}
                        disabled={quizLoading}
                      >
                        {quizLoading ? <Loader2 size={14} className={styles.spinner} /> : <HelpCircle size={14} />}
                        <span>{quizLoading ? 'Loading Questions…' : 'Begin Assessment Quiz'}</span>
                      </button>
                    </div>
                  ) : (
                    <div>
                      {questions.map((q, qidx) => (
                        <div key={q.id || qidx} className={styles.question}>
                          <h4 className={styles.questionText}>
                            {qidx + 1}. {q.question_text || (q as any).question}
                          </h4>
                          <div className={styles.options}>
                            {['A', 'B', 'C', 'D'].map(letter => {
                              const optText = q.options?.[letter] ?? (q as any)[`option_${letter.toLowerCase()}`];
                              if (!optText) return null;
                              const isSelected = answers[q.id] === letter;
                              return (
                                <button
                                  key={letter}
                                  type="button"
                                  className={`${styles.optBtn} ${isSelected ? styles.optSelected : ''}`}
                                  onClick={() => setAnswers(prev => ({ ...prev, [q.id]: letter }))}
                                >
                                  <span className={styles.optLetter}>{letter}</span>
                                  <span>{optText}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}

                      {quizError && <div className={styles.errorBox}>{quizError}</div>}

                      <button
                        className={styles.submitBtn}
                        onClick={submitQuiz}
                        disabled={submitting || Object.keys(answers).length === 0}
                      >
                        {submitting ? 'Evaluating…' : 'Submit Quiz Answers'}
                      </button>

                      {result && (
                        <div className={styles.calloutBox} style={{ marginTop: 16 }}>
                          <Check size={20} color={result.passed ? '#10b981' : '#ef4444'} />
                          <div>
                            <h4 className={styles.calloutTitle}>
                              Score: {Math.round(result.score)}% — {result.passed ? 'PASSED!' : 'TRY AGAIN'}
                            </h4>
                            <p className={styles.calloutText}>
                              {result.correct_count} of {result.total_points} questions answered correctly.
                            </p>
                            {result.timed_out && (
                              <p className={styles.calloutText} style={{ color: '#b45309', marginTop: 4 }}>
                                Submitted after the {quizLimitMin ?? ''} minute time limit.
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* AI VIVA ORAL EVALUATION MODULE */}
              {active && active.type === 'viva' && (() => {
                const vivaQs = active.viva_config?.questions ?? [];
                return (
                  <div>
                    <h2 className={styles.contentH1}>{active.title}</h2>
                    <div className={styles.calloutBox}>
                      <Mic2 size={20} className={styles.calloutIcon} />
                      <div>
                        <h4 className={styles.calloutTitle}>Interactive AI Oral Viva</h4>
                        <p className={styles.calloutText}>
                          Respond to each question in your own words. The AI evaluator will score your conceptual depth (Pass Mark ≥ {active.viva_config?.pass_threshold ?? 70}%).
                        </p>
                      </div>
                    </div>

                    {vivaQs.length === 0 ? (
                      <p style={{ color: '#64748b', fontStyle: 'italic', padding: 16 }}>No viva questions authored for this module.</p>
                    ) : (
                      <div className={styles.vivaContainer}>
                        {vivaQs.map((q) => {
                          const fb = vivaResult?.per_question?.find(p => p.index === q.index);
                          return (
                            <div key={q.index} className={styles.vivaCard}>
                              <div className={styles.vivaQTitle}>
                                <span className={styles.vivaQBadge}>Q{q.index + 1}</span>
                                <span>{q.question}</span>
                              </div>
                              <textarea
                                className={styles.vivaTextarea}
                                placeholder="Type your detailed viva explanation here..."
                                value={vivaAnswers[q.index] || ''}
                                onChange={e => setVivaAnswers(prev => ({ ...prev, [q.index]: e.target.value }))}
                                disabled={vivaSubmitting}
                              />
                              {fb && (
                                <div className={styles.vivaFeedbackBox} style={{ borderLeft: `3px solid ${fb.score >= 7 ? '#10b981' : '#ef4444'}` }}>
                                  <strong>AI Score: {fb.score}/10</strong> — {fb.feedback}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {vivaError && <div className={styles.errorBox}>{vivaError}</div>}

                        <button
                          className={styles.submitBtn}
                          onClick={submitViva}
                          disabled={vivaSubmitting || vivaQs.some(q => !(vivaAnswers[q.index] || '').trim())}
                        >
                          {vivaSubmitting ? <Loader2 size={14} className={styles.spinner} /> : <Mic2 size={14} />}
                          <span>{vivaSubmitting ? 'Evaluating with AI…' : 'Submit Viva Responses'}</span>
                        </button>

                        {vivaResult && (
                          <div className={styles.calloutBox} style={{ marginTop: 16 }}>
                            <Check size={20} color={vivaResult.passed ? '#10b981' : '#ef4444'} />
                            <div>
                              <h4 className={styles.calloutTitle}>
                                Viva Score: {Math.round(vivaResult.score)}% — {vivaResult.passed ? 'PASSED!' : 'TRY AGAIN'}
                              </h4>
                              <p className={styles.calloutText}>
                                {vivaResult.passed
                                  ? 'Excellent performance on oral questions!'
                                  : 'Review the theory concepts and attempt again.'}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* VIDEO MODULE */}
              {active && active.type === 'video' && (
                <div>
                  <h2 className={styles.contentH1}>{active.title}</h2>
                  {(active.content_data as { url?: string })?.url ? (
                    <iframe
                      className={styles.videoFrame}
                      src={(active.content_data as { url?: string })?.url}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <div className={styles.calloutBox}>No video URL provided.</div>
                  )}
                </div>
              )}

              {/* PDF VIEWER MODULE */}
              {active && active.type === 'pdf' && (() => {
                const pdfUrl = String((active.content_data as { url?: string })?.url || '');
                return (
                  <div>
                    <h2 className={styles.contentH1}>{active.title}</h2>
                    {pdfUrl ? (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                          <a
                            href={pdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.openFileBtn}
                          >
                            <ExternalLink size={14} />
                            <span>Open in New Tab</span>
                          </a>
                        </div>
                        <iframe
                          className={styles.pdfViewerFrame}
                          src={pdfUrl}
                          title={active.title}
                        />
                      </>
                    ) : (
                      <div className={styles.calloutBox}>No PDF document URL provided.</div>
                    )}
                  </div>
                );
              })()}

              {/* IMAGE MODULE */}
              {active && active.type === 'image' && (() => {
                const cd = (active.content_data || {}) as { url?: string; alt?: string; caption?: string };
                const imgUrl = String(cd.url || '');
                return (
                  <div>
                    <h2 className={styles.contentH1}>{active.title}</h2>
                    {imgUrl ? (
                      <div className={styles.imagePreviewBox}>
                        <img src={imgUrl} alt={cd.alt || active.title} className={styles.imagePreviewImg} />
                        {cd.caption && <p className={styles.imageCaption}>{cd.caption}</p>}
                      </div>
                    ) : (
                      <div className={styles.calloutBox}>No image URL provided.</div>
                    )}
                  </div>
                );
              })()}

              {/* EXTERNAL REFERENCE LINK MODULE */}
              {active && active.type === 'link' && (() => {
                const cd = (active.content_data || {}) as { url?: string; label?: string; description?: string };
                const linkUrl = String(cd.url || '');
                return (
                  <div>
                    <h2 className={styles.contentH1}>{active.title}</h2>
                    <div className={styles.linkReferenceCard}>
                      <div>
                        <h4 className={styles.linkRefTitle}>{cd.label || active.title}</h4>
                        <p className={styles.linkRefDesc}>{cd.description || 'External resource and reference reading.'}</p>
                      </div>
                      {linkUrl ? (
                        <a
                          href={linkUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={styles.openLinkBtn}
                        >
                          <ExternalLink size={14} />
                          <span>Open Resource</span>
                        </a>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: 13 }}>No link URL provided.</span>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* ══ 5. BOTTOM ACTION FOOTER ══ */}
            <div className={styles.actionFooter}>
              <button
                className={styles.prevBtn}
                onClick={goToPrevModule}
                disabled={currentModuleIndex <= 0 && displayPages.findIndex(p => p.id === currentTabId) <= 0}
              >
                <ChevronLeft size={16} />
                <span>Previous</span>
              </button>

              <button
                className={styles.nextContinueBtn}
                onClick={markCompleteAndContinue}
              >
                <span>{active?.completed ? 'Next Module' : 'Mark as Complete & Continue'}</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* ══ LAB GUIDE MODAL ══ */}
        {showGuideModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.6)',
              backdropFilter: 'blur(4px)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
            }}
            onClick={() => setShowGuideModal(false)}
          >
            <div
              style={{
                background: '#ffffff',
                borderRadius: 20,
                padding: 28,
                maxWidth: 540,
                width: '100%',
                boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <BookOpen size={20} color="#7c3aed" />
                  <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    Lab Experiment Guide
                  </h3>
                </div>
                <button
                  onClick={() => setShowGuideModal(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                >
                  <X size={20} />
                </button>
              </div>

              <p style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.6 }}>
                <strong>Experiment Objective:</strong><br />
                {experiment?.aim || 'Implement stack operations using arrays and analyze time complexity.'}
              </p>

              <div style={{ marginTop: 14, background: '#f8fafc', padding: 14, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <h5 style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>Step-by-Step Instructions:</h5>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
                  <li>Review the Introduction and Study Notes carefully.</li>
                  <li>Inspect the sample implementation in the Code Example tab.</li>
                  <li>Complete the hands-on Practice coding task or quiz.</li>
                  <li>Ensure all modules are marked complete to unlock the Live Lab Sandbox.</li>
                </ol>
              </div>

              <button
                style={{
                  width: '100%',
                  marginTop: 20,
                  padding: 12,
                  background: '#0f172a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
                onClick={() => setShowGuideModal(false)}
              >
                Close Guide
              </button>
            </div>
          </div>
        )}

        {/* ══ MODULE NOTES MODAL ══ */}
        {showNotesModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.6)',
              backdropFilter: 'blur(4px)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
            }}
            onClick={() => setShowNotesModal(false)}
          >
            <div
              style={{
                background: '#ffffff',
                borderRadius: 20,
                padding: 28,
                maxWidth: 540,
                width: '100%',
                boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <FileEdit size={20} color="#7c3aed" />
                  <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    My Experiment Notes
                  </h3>
                </div>
                <button
                  onClick={() => setShowNotesModal(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                >
                  <X size={20} />
                </button>
              </div>

              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px 0' }}>
                Jot down takeaways, questions, or key algorithms. These notes are saved locally to your browser.
              </p>

              <textarea
                style={{
                  width: '100%',
                  minHeight: 180,
                  padding: 14,
                  borderRadius: 12,
                  border: '1.5px solid #e2e8f0',
                  fontSize: 13.5,
                  fontFamily: 'inherit',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                value={userNotes}
                onChange={e => saveNotes(e.target.value)}
                placeholder="Write your study notes here..."
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                <button
                  style={{
                    padding: '9px 20px',
                    background: '#7c3aed',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                  onClick={() => setShowNotesModal(false)}
                >
                  Save & Close
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </StudentShell>
  );
}
