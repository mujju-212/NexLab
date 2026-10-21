'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DOMPurify from 'dompurify';
import StudentShell from '@/components/layout/StudentShell';
import { studentService } from '@/services/student.service';
import type { ContentPage, ExperimentDetail, AssignmentSubmitResult } from '@/services/student.service';
import { executionService } from '@/services/execution.service';
import { aiService } from '@/services/ai.service';
import { experienceService } from '@/services/experience.service';
import { useAuthStore } from '@/store/auth-store';
import { useSocket } from '@/hooks/use-socket';
import { renderMarkdown } from '@/lib/markdown';
import type {
  ModeChangedPayload, ProctorPolicyPayload, ForceSubmitPayload,
  PageLaunchedPayload, QuizLaunchedPayload, DirectCheckpointPayload,
  ChatMessagePayload, MediaControlPayload,
} from '@/hooks/use-socket';
import type { ContentModule, QuizQuestion, GateResult, Language } from '@/types';
import {
  Radio, Sparkles, Loader2, ShieldAlert, Video,
  CheckCircle2, Circle, Camera, Monitor, UserCheck, X,
  Bell, PauseCircle, FileDown, BookOpen, Send,
  Users, ShieldCheck, TrendingUp, Mic, ArrowLeft, ArrowRight,
  Check, Info, Calendar, Lock, User, Clock, LogOut,
  Maximize2, Terminal, BarChart3, Eye, Smile, Paperclip,
  Lightbulb, Play, Copy, ChevronDown, ChevronUp, MicOff,
  VideoOff, MessageSquare, Tv, FlaskConical, PlayCircle, Code2,
  HelpCircle, Hand, MonitorOff, PhoneOff, Minimize2,
  RotateCcw, ChevronLeft, ChevronRight, ClipboardCheck,
  FileText, FileCode, ImageIcon, Globe, Link2, Download, ExternalLink, Mic2
} from 'lucide-react';
import styles from '../page.module.css';
// LiveKit hooks & components for real-time conference
import {
  LiveKitRoom, useLocalParticipant, useRemoteParticipants, useRoomContext,
  VideoTrack, RoomAudioRenderer,
} from '@livekit/components-react';
import { Track, type Participant, type TrackPublication } from 'livekit-client';
import '@livekit/components-styles';
import SessionFeedbackModal from '@/components/student/SessionFeedbackModal';

type JoinStep = 'attendance' | 'permissions' | 'room' | 'video' | 'workspace';

const LANGS: { key: Language; label: string; file: string }[] = [
  { key: 'python',     label: 'Python', file: 'lab.py'      },
  { key: 'javascript', label: 'JS',     file: 'lab.js'      },
  { key: 'c',          label: 'C',      file: 'lab.c'       },
  { key: 'cpp',        label: 'C++',    file: 'lab.cpp'     },
  { key: 'java',       label: 'Java',   file: 'Main.java'   },
];

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

function formatChatTime(raw?: string): string {
  if (!raw) return '';
  if (/^\d{1,2}:\d{2}(\s?[AP]M)?$/i.test(raw)) return raw;
  try {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  } catch {}
  return raw;
}

// ── REAL EXPERIMENT WORKBENCH (MATCHING PRE-LAB WITH ACTUAL DB EXPERIMENT MODULES) ──
interface ExperimentWorkbenchProps {
  expDetail: ExperimentDetail | null;
  expModules: ContentModule[];
  expPages: ContentPage[];
  expLoading: boolean;
  sessionId: string;
  experimentId: string;
  sessionTitleText: string;
  expFullscreen: boolean;
  setExpFullscreen: React.Dispatch<React.SetStateAction<boolean>>;
  language: Language;
  setLanguage: (l: Language) => void;
  handleTab: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSelfReportCheckpoint?: (checkpointNumber: number, passed: number) => void;
  onCodeChange?: (code: string) => void;
}

function ExperimentWorkbench({
  expDetail,
  expModules,
  expPages,
  expLoading,
  sessionId,
  experimentId,
  sessionTitleText,
  expFullscreen,
  setExpFullscreen,
  language,
  setLanguage,
  handleTab,
  onSelfReportCheckpoint,
  onCodeChange,
}: ExperimentWorkbenchProps) {
  const hasAuthoredPages = expPages.length > 0;
  const displayPages = useMemo(() => {
    if (hasAuthoredPages) {
      return expPages.map((p, idx) => ({
        id: p.id,
        title: p.title,
        step: idx + 1,
        icon: idx === 0 ? BookOpen : idx === 1 ? Code2 : idx === 2 ? PlayCircle : ClipboardCheck,
      }));
    }
    return [
      { id: 'p-intro', title: 'Introduction', step: 1, icon: BookOpen },
      { id: 'p-code', title: 'Code Example', step: 2, icon: Code2 },
      { id: 'p-practice', title: 'Practice', step: 3, icon: PlayCircle },
      { id: 'p-assessment', title: 'Assessment', step: 4, icon: ClipboardCheck },
    ];
  }, [hasAuthoredPages, expPages]);

  const [activePageId, setActivePageId] = useState<string | null>(null);
  const currentTabId = activePageId ?? displayPages[0]?.id;

  // Fallback if no modules authored yet in DB
  const resolvedModules = useMemo<ContentModule[]>(() => {
    if (expModules && expModules.length > 0) return expModules;
    const expTitle = expDetail?.title || sessionTitleText || 'Experiment';
    const expAim = expDetail?.aim || 'Hands-on laboratory experiment and coding exercises.';
    return [
      {
        id: 'mod-intro',
        page_id: hasAuthoredPages ? expPages[0]?.id : 'p-intro',
        title: `${expTitle} — Overview`,
        type: 'markdown',
        display_order: 1,
        completed: false,
        score: null,
        content_data: {
          md: `# ${expTitle}\n\n**Aim:** ${expAim}\n\n### Core Concepts\nWelcome to this live laboratory experiment. Follow along with your instructor's guidance to study theoretical mechanics and test implementation code.\n\n- Read the problem requirements and constraints.\n- Implement operations and analyze performance.\n- Verify test cases before completing the milestone.`,
        },
      },
      {
        id: 'mod-code',
        page_id: hasAuthoredPages ? (expPages[1]?.id || expPages[0]?.id) : 'p-code',
        title: `${expTitle} — Implementation Sandbox`,
        type: 'code',
        display_order: 2,
        completed: false,
        score: null,
        content_data: {
          code: `# ${expTitle} Solution\n# Write your solution below\n\ndef solution():\n    print("Running test solution for ${expTitle}...")\n\nif __name__ == "__main__":\n    solution()\n`,
          language: 'python',
        },
      },
      {
        id: 'mod-practice',
        page_id: hasAuthoredPages ? (expPages[2]?.id || expPages[0]?.id) : 'p-practice',
        title: `${expTitle} — Practice Exercise`,
        type: 'assign',
        display_order: 3,
        completed: false,
        score: null,
        content_data: {
          starter_code: `# Practice task for ${expTitle}\n# Complete the function below\n\ndef solve():\n    pass\n`,
        },
      },
      {
        id: 'mod-quiz',
        page_id: hasAuthoredPages ? (expPages[3]?.id || expPages[0]?.id) : 'p-assessment',
        title: `${expTitle} — Checkpoint Verification`,
        type: 'quiz',
        display_order: 4,
        completed: false,
        score: null,
        quiz_config: {
          pass_threshold: 70,
          max_attempts: 3,
          cooldown_minutes: 0,
          shuffle: false,
          attempts_used: 0,
          last_attempt_at: null,
        },
      },
    ];
  }, [expModules, expDetail, sessionTitleText, hasAuthoredPages, expPages]);

  const pageModulesMap = useMemo(() => {
    if (hasAuthoredPages) {
      const map: Record<string, ContentModule[]> = {};
      resolvedModules.forEach(m => {
        const pid = m.page_id ?? expPages[0]?.id ?? 'default';
        (map[pid] ??= []).push(m);
      });
      return map;
    }
    const map: Record<string, ContentModule[]> = {
      'p-intro': [],
      'p-code': [],
      'p-practice': [],
      'p-assessment': [],
    };
    resolvedModules.forEach(m => {
      if (m.type === 'text' || m.type === 'markdown' || m.type === 'video' || m.type === 'pdf' || m.type === 'image' || m.type === 'link') {
        map['p-intro'].push(m);
      } else if (m.type === 'code' || m.type === 'html') {
        map['p-code'].push(m);
      } else if (m.type === 'assign') {
        map['p-practice'].push(m);
      } else if (m.type === 'quiz' || m.type === 'viva') {
        map['p-assessment'].push(m);
      } else {
        map['p-intro'].push(m);
      }
    });
    if (map['p-intro'].length === 0 && resolvedModules.length > 0) {
      map['p-intro'].push(resolvedModules[0]);
    }
    return map;
  }, [hasAuthoredPages, expPages, resolvedModules]);

  const activeTabModules = useMemo(() => {
    const list = pageModulesMap[currentTabId] ?? [];
    return list.length > 0 ? list : resolvedModules;
  }, [pageModulesMap, currentTabId, resolvedModules]);

  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const activeModule = useMemo(() => {
    return activeTabModules.find(m => m.id === activeModuleId) || activeTabModules[0] || resolvedModules[0];
  }, [activeTabModules, activeModuleId, resolvedModules]);

  // Editor states
  const [expCode, setExpCode] = useState('');
  const [expRunning, setExpRunning] = useState(false);
  const [expOutput, setExpOutput] = useState('');
  const [stdin, setStdin] = useState('');
  const [tryDrawerOpen, setTryDrawerOpen] = useState(false);
  const [expCopied, setExpCopied] = useState(false);
  const [showHtmlSource, setShowHtmlSource] = useState(false);

  // Coding assignment state
  const [assignCode, setAssignCode] = useState('');
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignResult, setAssignResult] = useState<AssignmentSubmitResult | null>(null);
  const [assignError, setAssignError] = useState('');

  // Quiz state
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState('');
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [quizResult, setQuizResult] = useState<any>(null);

  // Completed modules tracking
  const [completedModIds, setCompletedModIds] = useState<string[]>([]);

  // Timeline resize & minimization states
  const [timelineWidth, setTimelineWidth] = useState(280);
  const [timelineMinimized, setTimelineMinimized] = useState(false);
  const [isDraggingTimeline, setIsDraggingTimeline] = useState(false);

  const startResizeTimeline = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingTimeline(true);
  };

  useEffect(() => {
    if (!isDraggingTimeline) return;
    const handleMouseMove = (e: MouseEvent) => {
      const containerRect = document.querySelector(`.${styles.expMainGrid}`)?.getBoundingClientRect();
      const leftOffset = containerRect ? containerRect.left : 0;
      const newWidth = Math.min(480, Math.max(220, e.clientX - leftOffset));
      setTimelineWidth(newWidth);
    };
    const handleMouseUp = () => setIsDraggingTimeline(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingTimeline]);

  useEffect(() => {
    if (!activeModule) return;
    setShowHtmlSource(false);
    setExpOutput('');

    if (activeModule.type === 'code') {
      const cd = (activeModule.content_data as any) || {};
      const codeVal = String(cd.code || '# Code snippet\n');
      setExpCode(codeVal);
      onCodeChange?.(codeVal);
    } else if (activeModule.type === 'assign') {
      const cd = (activeModule.content_data as any) || {};
      const starterVal = String(cd.starter_code || '');
      setAssignCode(starterVal);
      onCodeChange?.(starterVal);
      setAssignResult(null);
      setAssignError('');
    } else if (activeModule.type === 'quiz') {
      setQuizError('');
      setQuizResult(null);
      setQuizAnswers({});
      setQuestions([]);
      setQuizLoading(true);
      studentService.getQuizQuestions(activeModule.id)
        .then(res => { setQuestions(res.questions); })
        .catch(e => setQuizError(e instanceof Error ? e.message : 'Could not load quiz questions'))
        .finally(() => setQuizLoading(false));
    }
  }, [activeModule?.id, activeModule?.type]);

  const switchPage = (pageId: string) => {
    setActivePageId(pageId);
    const firstMod = (pageModulesMap[pageId] ?? [])[0] ?? resolvedModules[0];
    if (firstMod) {
      setActiveModuleId(firstMod.id);
    }
  };

  const currentModIdx = activeTabModules.findIndex(m => m.id === activeModule?.id);

  const goToPrevModule = () => {
    if (currentModIdx > 0) {
      setActiveModuleId(activeTabModules[currentModIdx - 1].id);
    } else {
      const currentTabIdx = displayPages.findIndex(p => p.id === currentTabId);
      if (currentTabIdx > 0) {
        switchPage(displayPages[currentTabIdx - 1].id);
      }
    }
  };

  const goToNextModule = () => {
    if (currentModIdx >= 0 && currentModIdx < activeTabModules.length - 1) {
      setActiveModuleId(activeTabModules[currentModIdx + 1].id);
    } else {
      const currentTabIdx = displayPages.findIndex(p => p.id === currentTabId);
      if (currentTabIdx < displayPages.length - 1) {
        switchPage(displayPages[currentTabIdx + 1].id);
      }
    }
  };

  const markCompleteAndContinue = async () => {
    if (activeModule) {
      try {
        await studentService.markModuleComplete(activeModule.id);
        setCompletedModIds(prev => [...prev, activeModule.id]);
      } catch {}
    }
    goToNextModule();
  };

  // Run Code
  const runCode = async () => {
    setExpRunning(true);
    setExpOutput('');
    try {
      const res = await executionService.runCode({
        files: { main: expCode },
        language,
        stdin: stdin || undefined,
        experiment_id: experimentId,
        session_id: sessionId,
      });
      const parts = [
        res.compile_output ? `[Compile]\n${res.compile_output}` : '',
        res.stdout || '',
        res.stderr ? `[Error]\n${res.stderr}` : '',
        `\n>>> Status: ${res.status} | Time: ${res.time_ms ?? '—'}ms | Memory: ${res.memory_kb ?? '—'} KB`,
      ].filter(Boolean);
      setExpOutput(parts.join('\n'));
      if (typeof res.test_cases_passed === 'number' && onSelfReportCheckpoint) {
        onSelfReportCheckpoint(currentModIdx + 1, res.test_cases_passed);
      }
    } catch (e) {
      setExpOutput(`Execution failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setExpRunning(false);
    }
  };

  // Submit Final Code
  const [expSubmitting, setExpSubmitting] = useState(false);
  const submitFinalCode = async () => {
    setExpSubmitting(true);
    setExpOutput('');
    try {
      const res = await executionService.runCode({
        files: { main: expCode },
        language,
        stdin: stdin || undefined,
        experiment_id: experimentId,
        session_id: sessionId,
        is_final_submission: true,
      });
      const parts = [
        `>>> [FINAL SUBMISSION RECORDED]`,
        res.compile_output ? `[Compile]\n${res.compile_output}` : '',
        res.stdout || '',
        res.stderr ? `[Error]\n${res.stderr}` : '',
        `\n>>> Status: ${res.status} | Tests Passed: ${res.test_cases_passed ?? 0}/${res.test_cases_total ?? 0} | Quality Score: ${res.quality_score ?? 100}%`,
      ].filter(Boolean);
      setExpOutput(parts.join('\n'));
      if (typeof res.test_cases_passed === 'number' && onSelfReportCheckpoint) {
        onSelfReportCheckpoint(currentModIdx + 1, res.test_cases_passed);
      }
    } catch (e) {
      setExpOutput(`Submission failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setExpSubmitting(false);
    }
  };

  // Submit Assignment
  const submitAssignment = async () => {
    if (!activeModule) return;
    if (!assignCode.trim()) { setAssignError('Write some code before submitting.'); return; }
    setAssignSubmitting(true);
    setAssignError('');
    try {
      const lang = String((activeModule.content_data as any)?.language || language || 'python');
      const res = await studentService.submitAssignment(activeModule.id, { code: assignCode, language: lang });
      setAssignResult(res);
      if (res.passed) {
        setCompletedModIds(prev => [...prev, activeModule.id]);
      }
    } catch (e) {
      setAssignError(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setAssignSubmitting(false);
    }
  };

  // Submit Quiz
  const submitQuiz = async () => {
    if (!activeModule) return;
    setQuizSubmitting(true);
    setQuizError('');
    try {
      const res = await studentService.submitQuiz(activeModule.id, quizAnswers);
      setQuizResult(res);
      if (res.passed) {
        setCompletedModIds(prev => [...prev, activeModule.id]);
      }
    } catch (e) {
      setQuizError(e instanceof Error ? e.message : 'Quiz submission failed');
    } finally {
      setQuizSubmitting(false);
    }
  };

  const safeMd = useMemo(() => {
    if (!activeModule || activeModule.type !== 'markdown') return '';
    return renderMarkdown(String((activeModule.content_data as any)?.md || ''));
  }, [activeModule]);

  const safeHtml = useMemo(() => {
    if (!activeModule || (activeModule.type !== 'text' && activeModule.type !== 'html')) return '';
    const raw = String((activeModule.content_data as any)?.html || (activeModule.content_data as any)?.content || '');
    return DOMPurify.sanitize(raw);
  }, [activeModule]);

  const isCompleted = activeModule ? (activeModule.completed || completedModIds.includes(activeModule.id)) : false;
  const ActiveIcon = activeModule ? (MODULE_ICONS[activeModule.type] || BookOpen) : BookOpen;

  return (
    <div className={`${styles.expContainerWrapper} ${expFullscreen ? styles.expFullscreenOverlay : ''}`}>
      {/* 1. Horizontal Numbered Page Tabs Bar at the top */}
      <div className={styles.pageTabsBar}>
        {displayPages.map(p => {
          const isActive = currentTabId === p.id;
          const PageIcon = p.icon;
          return (
            <button
              key={p.id}
              className={`${styles.pageTab} ${isActive ? styles.pageTabActive : ''}`}
              onClick={() => switchPage(p.id)}
            >
              <PageIcon size={15} />
              <span className={styles.pageTabNum}>{p.step}</span>
              <span>{p.title}</span>
            </button>
          );
        })}
      </div>

      {/* 2. Main Grid: Left Timeline + Right Workbench */}
      <div
        className={styles.expMainGrid}
        style={{
          gridTemplateColumns: timelineMinimized ? '48px 1fr' : `${timelineWidth}px 8px 1fr`,
        }}
      >
        {/* Left Column: Modules in this page timeline */}
        {timelineMinimized ? (
          <div className={styles.timelineRail}>
            <button
              type="button"
              className={styles.timelineCollapseBtn}
              onClick={() => setTimelineMinimized(false)}
              title="Expand Modules Sidebar"
            >
              <ChevronRight size={15} />
            </button>
            {activeTabModules.map((m, idx) => {
              const isSelected = activeModule?.id === m.id;
              const done = m.completed || completedModIds.includes(m.id);
              return (
                <div
                  key={m.id}
                  className={`${styles.timelineRailNode} ${isSelected ? styles.timelineRailNodeActive : done ? styles.timelineRailNodeDone : ''}`}
                  onClick={() => setActiveModuleId(m.id)}
                  title={`${idx + 1}. ${m.title}`}
                >
                  {done ? <Check size={13} strokeWidth={2.5} /> : idx + 1}
                </div>
              );
            })}
          </div>
        ) : (
          <>
            <div className={styles.expLeftCol} style={{ width: timelineWidth }}>
              <div className={styles.modulesHeader}>
                <h3 className={styles.modulesTitle}>Modules in this page</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className={styles.modulesCountBadge}>
                    {activeTabModules.length} module{activeTabModules.length !== 1 ? 's' : ''}
                  </span>
                  <button
                    type="button"
                    className={styles.timelineCollapseBtn}
                    onClick={() => setTimelineMinimized(true)}
                    title="Minimize Modules Sidebar"
                  >
                    <ChevronLeft size={14} />
                  </button>
                </div>
              </div>

              <div className={styles.timelineContainer}>
                <div className={styles.timelineTrack} />
                {activeTabModules.map((m, idx) => {
                  const isSelected = activeModule?.id === m.id;
                  const ModIcon = MODULE_ICONS[m.type] || BookOpen;
                  const done = m.completed || completedModIds.includes(m.id);

                  return (
                    <div key={m.id} className={styles.timelineRow}>
                      <div className={`${styles.stepNode} ${isSelected ? styles.stepNodeActive : done ? styles.stepNodeDone : ''}`}>
                        {idx + 1}
                      </div>
                      <div
                        className={`${styles.moduleCard} ${isSelected ? styles.moduleCardActive : ''}`}
                        onClick={() => setActiveModuleId(m.id)}
                      >
                        <div className={styles.moduleCardLeft}>
                          <div className={styles.moduleIconWrapper}>
                            <ModIcon size={15} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <h4 className={styles.moduleTitleText}>{m.title}</h4>
                            <p className={styles.moduleSubText}>
                              {m.type === 'text' ? 'Concept Explanation'
                                : m.type === 'markdown' ? 'Study Notes'
                                : m.type === 'code' ? 'Code Implementation'
                                : m.type === 'assign' ? 'Coding Assignment'
                                : m.type === 'quiz' ? 'Knowledge Check'
                                : m.type === 'viva' ? 'Oral Evaluation'
                                : m.type === 'html' ? 'Simulation Lab'
                                : 'Interactive Module'}
                            </p>
                          </div>
                        </div>
                        <div className={styles.statusIndicator}>
                          {done ? (
                            <CheckCircle2 size={16} color="#7c3aed" fill="#f5f3ff" />
                          ) : (
                            <Circle size={13} color="#cbd5e1" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className={styles.calloutBox}>
                <Info size={16} className={styles.calloutIcon} />
                <div>
                  <h4 className={styles.calloutTitle}>Why it matters</h4>
                  <p className={styles.calloutText}>
                    {expDetail?.aim || 'Review the core concept modules and interactive exercises to build your practical mastery.'}
                  </p>
                </div>
              </div>

              <div className={styles.proTipCard}>
                <div className={styles.proTipIconBox}>
                  <Lightbulb size={16} />
                </div>
                <div>
                  <h5 className={styles.proTipTitle}>Pro Tip</h5>
                  <p className={styles.proTipDesc}>
                    Complete all modules and test boundary conditions with custom stdin before moving to the next step.
                  </p>
                </div>
              </div>
            </div>

            {/* Drag Resize Separator */}
            <div
              className={`${styles.timelineResizeHandle} ${isDraggingTimeline ? styles.timelineResizeHandleActive : ''}`}
              onMouseDown={startResizeTimeline}
              title="Drag to resize modules panel"
            >
              <div className={styles.timelineResizeBar} />
            </div>
          </>
        )}

        {/* Right Column: Active Module Content */}
        <div className={styles.contentCard}>
          <div className={styles.contentTopBar}>
            <div className={styles.contentModuleBadge}>
              <ActiveIcon size={15} />
              <span>{activeModule?.title || 'Interactive Module'}</span>
            </div>

            <div className={styles.contentTopRight}>
              {isCompleted ? (
                <span className={styles.statusPillDone}>
                  <Check size={12} strokeWidth={3} /> Completed
                </span>
              ) : (
                <span className={styles.statusPillPending}>
                  <Circle size={10} /> In Progress
                </span>
              )}

              <button
                className={styles.navChevronBtn}
                onClick={() => setExpFullscreen(f => !f)}
                title={expFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                {expFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>

              <div className={styles.chevronBtnGroup}>
                <button
                  className={styles.navChevronBtn}
                  onClick={goToPrevModule}
                  disabled={currentModIdx <= 0 && displayPages.findIndex(p => p.id === currentTabId) <= 0}
                  title="Previous Module"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  className={styles.navChevronBtn}
                  onClick={goToNextModule}
                  disabled={currentModIdx >= activeTabModules.length - 1 && displayPages.findIndex(p => p.id === currentTabId) >= displayPages.length - 1}
                  title="Next Module"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Content Body based on activeModule.type */}
          <div className={styles.contentBody}>
            {/* MARKDOWN */}
            {activeModule?.type === 'markdown' && (
              <div>
                <h2 className={styles.contentH1}>{activeModule.title}</h2>
                <div dangerouslySetInnerHTML={{ __html: safeMd }} />
              </div>
            )}

            {/* TEXT */}
            {activeModule?.type === 'text' && (
              <div>
                <h2 className={styles.contentH1}>{activeModule.title}</h2>
                <div dangerouslySetInnerHTML={{ __html: safeHtml }} />
              </div>
            )}

            {/* CODE */}
            {activeModule?.type === 'code' && (
              <div>
                <h2 className={styles.contentH1}>{activeModule.title}</h2>
                <div className={styles.codeContainer}>
                  <div className={styles.codeHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#38bdf8' }} />
                      <select
                        className={styles.langSelectorPill}
                        value={language}
                        onChange={e => setLanguage(e.target.value as Language)}
                      >
                        <option value="python">Python ⌵</option>
                        <option value="javascript">JavaScript ⌵</option>
                        <option value="c">C ⌵</option>
                        <option value="cpp">C++ ⌵</option>
                        <option value="java">Java ⌵</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        className={styles.copyCodeBtn}
                        onClick={() => {
                          const cd = (activeModule?.content_data as any) || {};
                          setExpCode(String(cd.code || ''));
                        }}
                        title="Reset Code"
                      >
                        <RotateCcw size={12} />
                        <span>Reset</span>
                      </button>
                      <button
                        className={styles.copyCodeBtn}
                        onClick={() => {
                          navigator.clipboard.writeText(expCode);
                          setExpCopied(true);
                          setTimeout(() => setExpCopied(false), 2000);
                        }}
                      >
                        {expCopied ? <Check size={12} color="#22c55e" /> : <Copy size={12} />}
                        <span>{expCopied ? 'Copied!' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>

                  <div className={styles.codeEditorWithGutters}>
                    <div className={styles.lineNums}>
                      {Array.from({ length: Math.max(expCode.split('\n').length, 12) }, (_, i) => (
                        <div key={i + 1} className={styles.lineNum}>{i + 1}</div>
                      ))}
                    </div>
                    <textarea
                      value={expCode}
                      onChange={e => {
                        setExpCode(e.target.value);
                        onCodeChange?.(e.target.value);
                      }}
                      onKeyDown={handleTab}
                      spellCheck={false}
                      className={styles.expEditorInput}
                    />
                  </div>

                  <div className={styles.expRunActionRow}>
                    <button
                      className={styles.runBtn}
                      onClick={runCode}
                      disabled={expRunning || expSubmitting}
                    >
                      {expRunning ? <Loader2 size={13} className={styles.spinner} /> : <Play size={13} fill="#ffffff" />}
                      <span>{expRunning ? 'Running…' : 'Run Code'}</span>
                    </button>

                    <button
                      className={styles.runBtn}
                      style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', borderColor: '#10b981' }}
                      onClick={submitFinalCode}
                      disabled={expRunning || expSubmitting}
                      title="Submit your code for grading and test evaluation"
                    >
                      {expSubmitting ? <Loader2 size={13} className={styles.spinner} /> : <CheckCircle2 size={13} />}
                      <span>{expSubmitting ? 'Submitting…' : 'Submit Final Code'}</span>
                    </button>

                    <button
                      className={styles.stdinToggleBtn}
                      onClick={() => setTryDrawerOpen(o => !o)}
                    >
                      <Terminal size={13} />
                      <span>Custom Stdin {tryDrawerOpen ? '▲' : '▼'}</span>
                    </button>
                  </div>

                  {tryDrawerOpen && (
                    <div className={styles.stdinDrawerBox}>
                      <label style={{ fontSize: 11.5, fontWeight: 700, color: '#94a3b8' }}>Standard Input (stdin)</label>
                      <textarea
                        value={stdin}
                        onChange={e => setStdin(e.target.value)}
                        placeholder="Type input passed to standard input..."
                        rows={2}
                        className={styles.stdinTextarea}
                      />
                    </div>
                  )}

                  {expOutput && (
                    <div className={styles.outputBox}>
                      <div className={styles.outputHeaderRow}>
                        <span className={styles.outputLabel}>Execution Console Output</span>
                        <button className={styles.clearOutputBtn} onClick={() => setExpOutput('')}>Clear</button>
                      </div>
                      <pre className={styles.outputPre}>{expOutput}</pre>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* CODING ASSIGNMENT */}
            {activeModule?.type === 'assign' && (
              <div>
                <h2 className={styles.contentH1}>{activeModule.title}</h2>
                <div className={styles.calloutBox}>
                  <Info size={16} className={styles.calloutIcon} />
                  <div>
                    <h4 className={styles.calloutTitle}>Task Instructions</h4>
                    <p className={styles.calloutText}>
                      Write clean code that satisfies all required test cases and maintains optimal time complexity.
                    </p>
                  </div>
                </div>

                <div style={{ border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden', margin: '14px 0' }}>
                  <div className={styles.editorHeader}>
                    <span className={styles.editorTitle}>Assignment Code Editor</span>
                  </div>
                  <textarea
                    className={styles.codeEditor}
                    value={assignCode}
                    onChange={e => {
                      setAssignCode(e.target.value);
                      onCodeChange?.(e.target.value);
                    }}
                    placeholder="# Write your solution here..."
                  />
                  <div className={styles.editorActions}>
                    <button
                      className={styles.runBtn}
                      onClick={submitAssignment}
                      disabled={assignSubmitting}
                    >
                      {assignSubmitting ? <Loader2 size={13} className={styles.spinner} /> : <Play size={13} />}
                      <span>{assignSubmitting ? 'Testing Code…' : 'Submit & Grade Code'}</span>
                    </button>
                  </div>
                </div>

                {assignError && <div className={styles.errorBox} style={{ margin: '8px 0' }}>{assignError}</div>}

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

            {/* QUIZ */}
            {activeModule?.type === 'quiz' && (
              <div className={styles.quizBox}>
                <div className={styles.quizHeader}>
                  <h2 className={styles.quizTitle}>{activeModule.title}</h2>
                  <span className={styles.quizThreshold}>
                    Pass Mark ≥ {activeModule.quiz_config?.pass_threshold ?? 70}%
                  </span>
                </div>

                {quizLoading ? (
                  <div className={styles.loadingBox} style={{ padding: 24 }}>
                    <Loader2 size={18} className={styles.spinner} /> Loading questions…
                  </div>
                ) : questions.length === 0 ? (
                  <div style={{ padding: '24px 0', textAlign: 'center' }}>
                    <p style={{ color: '#64748b', marginBottom: 12 }}>Ready to test your knowledge on this module?</p>
                    <button
                      type="button"
                      className={styles.runBtn}
                      onClick={() => {
                        setQuizLoading(true);
                        studentService.getQuizQuestions(activeModule.id)
                          .then(res => setQuestions(res.questions))
                          .catch(e => setQuizError(e instanceof Error ? e.message : 'Could not load quiz'))
                          .finally(() => setQuizLoading(false));
                      }}
                    >
                      <HelpCircle size={14} />
                      <span>Begin Assessment Quiz</span>
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
                            const isSelected = quizAnswers[q.id] === letter;
                            return (
                              <button
                                key={letter}
                                type="button"
                                className={`${styles.optBtn} ${isSelected ? styles.optSelected : ''}`}
                                onClick={() => setQuizAnswers(prev => ({ ...prev, [q.id]: letter }))}
                              >
                                <span className={styles.optLetter}>{letter}</span>
                                <span>{optText}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    {quizError && <div className={styles.errorBox} style={{ margin: '8px 0' }}>{quizError}</div>}

                    <button
                      className={styles.submitBtn}
                      onClick={submitQuiz}
                      disabled={quizSubmitting || Object.keys(quizAnswers).length === 0}
                    >
                      {quizSubmitting ? 'Evaluating…' : 'Submit Quiz Answers'}
                    </button>

                    {quizResult && (
                      <div className={styles.calloutBox} style={{ marginTop: 14 }}>
                        <Check size={18} color={quizResult.passed ? '#10b981' : '#ef4444'} />
                        <div>
                          <h4 className={styles.calloutTitle}>
                            Score: {Math.round(quizResult.score)}% — {quizResult.passed ? 'PASSED!' : 'TRY AGAIN'}
                          </h4>
                          <p className={styles.calloutText}>
                            {quizResult.correct_count} of {quizResult.total_points} questions answered correctly.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* HTML SIMULATION */}
            {activeModule?.type === 'html' && (() => {
              const cd = (activeModule.content_data || {}) as any;
              const htmlContent = String(cd.html || cd.content || cd.code || '');
              const htmlUrl = String(cd.url || '');
              return (
                <div>
                  <h2 className={styles.contentH1}>{activeModule.title}</h2>
                  <div className={styles.htmlViewerContainer}>
                    <div className={styles.htmlHeaderBar}>
                      <div className={styles.htmlHeaderLeft}>
                        <Globe size={15} color="#2563eb" />
                        <span>{activeModule.title}</span>
                        <span className={styles.htmlBadge}>Live Simulation</span>
                      </div>
                      <div className={styles.htmlActions}>
                        {htmlContent && (
                          <button
                            type="button"
                            className={styles.htmlUtilityBtn}
                            onClick={() => setShowHtmlSource(s => !s)}
                          >
                            <Code2 size={12} />
                            <span>{showHtmlSource ? 'Live View' : 'View Source'}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className={styles.htmlUtilityBtn}
                          onClick={() => {
                            if (htmlUrl) window.open(htmlUrl, '_blank');
                            else if (htmlContent) {
                              const blob = new Blob([htmlContent], { type: 'text/html' });
                              window.open(URL.createObjectURL(blob), '_blank');
                            }
                          }}
                        >
                          <ExternalLink size={12} />
                          <span>Open in Tab</span>
                        </button>
                      </div>
                    </div>
                    {showHtmlSource ? (
                      <pre className={styles.htmlSourceBox}>{htmlContent}</pre>
                    ) : (
                      <div className={styles.htmlIframeWrapper}>
                        <iframe
                          className={styles.htmlIframe}
                          title={activeModule.title}
                          srcDoc={htmlContent || undefined}
                          src={!htmlContent && htmlUrl ? htmlUrl : undefined}
                          sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* FILE / LINK / VIDEO / OTHER */}
            {(activeModule?.type === 'file' || activeModule?.type === 'link' || activeModule?.type === 'video') && (() => {
              const cd = (activeModule.content_data || {}) as any;
              const fileUrl = cd.url || '';
              const fileName = cd.filename || activeModule.title;
              return (
                <div>
                  <h2 className={styles.contentH1}>{activeModule.title}</h2>
                  <div className={styles.fileCardContainer}>
                    <div className={styles.fileCardMain}>
                      <div className={styles.fileCardLeft}>
                        <div className={styles.fileIconBox}>
                          <Download size={20} />
                        </div>
                        <div>
                          <h4 className={styles.fileFileName}>{fileName}</h4>
                          <div className={styles.fileMetaRow}>
                            <span className={styles.fileTypeBadge}>{activeModule.type.toUpperCase()}</span>
                            <span>Interactive Module Resource</span>
                          </div>
                        </div>
                      </div>
                      <div className={styles.fileActionBtns}>
                        {fileUrl && (
                          <>
                            <a href={fileUrl} target="_blank" rel="noreferrer" className={styles.openFileBtn}>
                              <ExternalLink size={13} /> Open
                            </a>
                            <a href={fileUrl} download={fileName} className={styles.downloadFileBtn}>
                              <Download size={13} /> Download
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Action Footer */}
          <div className={styles.actionFooter}>
            <button
              className={styles.prevBtn}
              onClick={goToPrevModule}
              disabled={currentModIdx <= 0 && displayPages.findIndex(p => p.id === currentTabId) <= 0}
            >
              <ArrowLeft size={14} />
              <span>Previous Module</span>
            </button>

            <button
              className={styles.completeNextBtn}
              onClick={markCompleteAndContinue}
            >
              <span>{isCompleted ? 'Next Module' : 'Complete & Continue'}</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const initials = (name?: string | null): string => {
  if (!name) return 'ST';
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'ST';
};

const getAvatarStyle = (name: string) => {
  if (!name) return { bg: '#818cf8', initials: 'ST' };
  if (name.includes('Priya Sharma') || name.includes('Instructor') || name.includes('Dr.')) return { bg: '#7c3aed', initials: 'DP' };
  return { bg: '#818cf8', initials: initials(name) };
};

export default function LiveLabRoomPage() {
  const router    = useRouter();
  const params    = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const { user }  = useAuthStore();

  const [gate,        setGate]        = useState<GateResult | null>(null);
  const [gateLoading, setGateLoading] = useState(true);
  const [gateError,   setGateError]   = useState('');
  // RULES OF HOOKS: must be declared with the other states, BEFORE any
  // early return (gateLoading / gateError) — a useState below the first
  // return crashes with "Rendered more hooks than during the previous render".
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  // ── Pre-join state machine ─────────────────────────────────────────────────
  // idle        → user clicks "Join Video Room"
  // attendance  → user acknowledges their presence
  // permissions → browser camera/mic/screen prompts
  // video       → LiveKit room visible
  const [joinStep,      setJoinStep]      = useState<JoinStep>('room');
  const [camGranted,    setCamGranted]    = useState(false);
  const [micGranted,    setMicGranted]    = useState(false);
  const [screenGranted, setScreenGranted] = useState(false);
  const [permError,     setPermError]     = useState('');
  const [permBusy,      setPermBusy]      = useState(false);
  // Session display metadata for the join cards
  const [sessionSubjectName, setSessionSubjectName] = useState('Data Structures');
  const [sessionTitleText,   setSessionTitleText]   = useState('Live Lab Session');
  const [sessionStartTimeStr, setSessionStartTimeStr] = useState('10:00 AM');
  // Dynamic Experiment Content from DB
  const [expDetail,   setExpDetail]   = useState<ExperimentDetail | null>(null);
  const [expModules,  setExpModules]  = useState<ContentModule[]>([]);
  const [expPages,    setExpPages]    = useState<ContentPage[]>([]);
  const [expLoading,  setExpLoading]  = useState(false);
  // Which media the pre-flight actually acquired — LiveKit publishes only these
  // so a missing mic/cam never aborts the room connection.
  const [pubVideo,      setPubVideo]      = useState(true);
  const [pubAudio,      setPubAudio]      = useState(true);

  // Floating toast feedback for proctor / media events
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimeoutRef = useRef<any>(null);
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToastMsg(null), 4000);
  }, []);

  // Media control signal from instructor (mute / unmute / disable cam / enable cam)
  const [mediaSignal, setMediaSignal] = useState<{ action: 'mute' | 'camera'; value: boolean; ts: number } | null>(null);

  // Hold the screen capture stream so we can stop it on unmount / step change
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenshotTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Real behavioral signal collection ───────────────────────────────────────
  // Counts are accumulated here and sent every 30 s. Everything resets after
  // each send so we always report the rate in that 30-second window.
  const signalsRef = useRef({
    keystrokes:     0,
    backspaces:     0,
    copyPastes:     0,
    tabSwitches:    0,
    fsExits:        0,
    focusMs:        0,     // ms the window was focused in the window
    lastFocusAt:    Date.now(),
    isFocused:      true,
    intervalStart:  Date.now(),
  });

  const [language,   setLanguage]   = useState<Language>('python');
  const [code,       setCode]       = useState('# Write your experiment code here\n');
  const [stdin,      setStdin]      = useState('');
  const [output,     setOutput]     = useState('');
  const [running,    setRunning]    = useState(false);
  const [activeTab,  setActiveTab]  = useState<'output' | 'ai' | 'checkpoints' | 'chat'>('output');

  const [hint,        setHint]        = useState('');
  const [hintLevel,   setHintLevel]   = useState(0);
  const [hintLoading, setHintLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Conductor state (mode machine / proctor / broadcasts) ──────────────────
  const [mode, setMode] = useState('working');            // briefing|working|quiz_active|paused|debrief|ended
  const [modeRules, setModeRules] = useState<ModeChangedPayload['rules'] | null>(null);
  const [proctorPolicy, setProctorPolicy] = useState<ProctorPolicyPayload['policy'] | null>(null);
  const [broadcastMsg, setBroadcastMsg] = useState<{ text: string; ts: string } | null>(null);
  const [forcedSubmit, setForcedSubmit] = useState<ForceSubmitPayload | null>(null);
  const [launchedPage, setLaunchedPage] = useState<PageLaunchedPayload | null>(null);
  const [launchedQuiz, setLaunchedQuiz] = useState<QuizLaunchedPayload | null>(null);
  const [myCheckpoints, setMyCheckpoints] = useState<Record<string, DirectCheckpointPayload['status']>>({});
  const [pendingMsg, setPendingMsg] = useState<ChatMessagePayload | null>(null);

  // ── Redesigned Room states (Matching Reference Images 1 & 2) ───────────────
  const [roomTab, setRoomTab] = useState<'live_class' | 'experiment'>('live_class');
  const [sidebarTab, setSidebarTab] = useState<'chat' | 'participants'>('chat');
  const [sessionTimer, setSessionTimer] = useState(1455); // 00:24:15 default
  const [showReactions, setShowReactions] = useState(false);
  const [floatingReaction, setFloatingReaction] = useState<string | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  // Experiment Tab states
  const [activeExpStep, setActiveExpStep] = useState(0);
  const [expSubTab, setExpSubTab] = useState<'code' | 'explanation' | 'visualization'>('code');
  const [tryDrawerOpen, setTryDrawerOpen] = useState(false);
  const [expCopied, setExpCopied] = useState(false);
  const [expRunning, setExpRunning] = useState(false);
  const [expOutput, setExpOutput] = useState('');
  const [expCode, setExpCode] = useState('');

  // Stack visualization items (Top to bottom)
  const [stackVisualItems, setStackVisualItems] = useState<string[]>(['30', '20', '10']);

  // Clock ticker for the 00:24:15 timer
  useEffect(() => {
    const timer = setInterval(() => {
      setSessionTimer(t => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ── Live chat with the instructor & peers ──────────────────────────────────
  const [chatLog, setChatLog]   = useState<ChatMessagePayload[]>([]);
  const [chatText, setChatText] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const chatLogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load session history (late-join safe) once the gate clears
    if (!gate || gateLoading) return;
    experienceService.getChat(sessionId)
      .then(messages => {
        if (messages && Array.isArray(messages)) {
          setChatLog(messages as ChatMessagePayload[]);
        }
      })
      .catch(() => {});
  }, [gate, gateLoading, sessionId]);

  useEffect(() => {
    chatLogRef.current?.scrollTo({ top: chatLogRef.current.scrollHeight });
  }, [chatLog]);

  const sendChat = async (textToSend?: string, targetId?: string) => {
    const text = (textToSend !== undefined ? textToSend : chatText).trim();
    if (!text || chatSending) return;
    setChatSending(true);
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const myMsg: ChatMessagePayload = {
      id: localId,
      session_id: sessionId,
      from_id: user?.id || 'me',
      to_id: targetId || null,
      from_name: user?.full_name || 'Student',
      text,
      at: new Date().toISOString(),
    };
    setChatLog(prev => [...prev, myMsg]);
    if (textToSend === undefined) setChatText('');
    try {
      const sent = await experienceService.sendChat(sessionId, text, targetId);
      if (sent && sent.id) {
        setChatLog(prev => {
          if (prev.some(m => m.id === sent.id)) {
            return prev.filter(m => m.id !== localId);
          }
          return prev.map(m => m.id === localId ? { ...m, ...sent, id: sent.id, at: sent.at || (sent as any).created_at || m.at } : m);
        });
      }
    } catch {
      // already appended locally
    } finally {
      setChatSending(false);
    }
  };

  const runExpCode = async () => {
    if (!gate) return;
    setExpRunning(true);
    setExpOutput('');
    try {
      const res = await executionService.runCode({
        files: { main: expCode },
        language,
        stdin: stdin || undefined,
        experiment_id: gate.session.experiment_id,
        session_id: sessionId,
      });
      const parts = [
        res.compile_output ? `[Compile]\n${res.compile_output}` : '',
        res.stdout || '',
        res.stderr ? `[Error]\n${res.stderr}` : '',
        `\n>>> Status: ${res.status} | Time: ${res.time_ms ?? '—'}ms | Memory: ${res.memory_kb ?? '—'} KB`,
      ].filter(Boolean);
      setExpOutput(parts.join('\n'));
      if (typeof res.test_cases_passed === 'number') {
        selfReportCheckpoint(activeExpStep + 1, res.test_cases_passed);
      }
    } catch (e) {
      setExpOutput(`Execution failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setExpRunning(false);
    }
  };

  const copyExpCode = () => {
    navigator.clipboard.writeText(expCode);
    setExpCopied(true);
    setTimeout(() => setExpCopied(false), 2000);
  };

  // ── Socket — heartbeat, screenshot, focus + ALL conductor listeners ────────
  const { isConnected, emitHeartbeat, emitScreenshot, emitBehavioralSignals,
          emitTabSwitch, emitFullscreenExit, emitLockdownViolation, emitCheckpointPassed } = useSocket({
    sessionId,
    enabled: !!gate,
    onModeChanged: useCallback((d: ModeChangedPayload) => {
      setMode(d.mode);
      setModeRules(d.rules);
    }, []),
    onProctorPolicy: useCallback((d: ProctorPolicyPayload) => setProctorPolicy(d.policy), []),
    onInstructorMessage: useCallback((d: { message: string; from: string; timestamp: string }) =>
      setBroadcastMsg({ text: d.message, ts: d.timestamp }), []),
    onForceSubmit: useCallback((d: ForceSubmitPayload) => {
      setForcedSubmit(d);
      // Auto-submit the current code so the session-end grade has a final attempt
      if (gate) {
        executionService.runCode({
          files: { main: codeRef.current },
          language, stdin: stdin || undefined,
          experiment_id: gate.session.experiment_id,
          session_id: sessionId,
          is_final_submission: true,
        }).catch(() => undefined);
      }
    }, [gate, language, stdin, sessionId]),
    onMyCheckpoint: useCallback((d: DirectCheckpointPayload) => {
      setMyCheckpoints(prev => ({ ...prev, [d.checkpoint_id]: d.status }));
    }, []),
    onPageLaunched: useCallback((d: PageLaunchedPayload) => setLaunchedPage(d), []),
    onQuizLaunched: useCallback((d: QuizLaunchedPayload) => setLaunchedQuiz(d), []),
    // D13 chat — instructor replies + own-message echo land here with robust deduplication
    onChatMessage: useCallback((d: ChatMessagePayload) => {
      setChatLog(prev => {
        if (prev.some(m => m.id === d.id)) return prev;
        const localIdx = prev.findIndex(m =>
          m.id.startsWith('local-') &&
          m.text.trim() === d.text.trim() &&
          (m.from_id === d.from_id || m.from_id === 'me' || m.from_name === d.from_name)
        );
        if (localIdx !== -1) {
          const next = [...prev];
          next[localIdx] = d;
          return next;
        }
        return [...prev, d];
      });
    }, []),
    onMediaControl: useCallback((data: MediaControlPayload) => {
      if (data.action === 'mute') {
        setMediaSignal({ action: 'mute', value: data.value, ts: Date.now() });
        showToast(data.value ? '🔇 Your microphone was muted by the instructor.' : '🎤 The instructor requested you to unmute your microphone.');
      } else if (data.action === 'camera') {
        setMediaSignal({ action: 'camera', value: data.value, ts: Date.now() });
        showToast(data.value ? '📵 Your camera was disabled by the instructor.' : '📹 The instructor requested you to enable your camera.');
      } else if (data.action === 'remove') {
        alert('You have been removed from the session by the instructor.');
        router.push('/student/sessions');
      }
    }, [router, showToast]),
  });

  // Keep a ref of the latest code so the force-submit closure always has it
  const codeRef = useRef(code);
  useEffect(() => { codeRef.current = code; }, [code]);

  // Heartbeat every 30 s → attendance accumulation
  useEffect(() => {
    if (!isConnected) return;
    const id = setInterval(() => emitHeartbeat(30), 30_000);
    return () => clearInterval(id);
  }, [isConnected, emitHeartbeat]);

  // ── Real behavioral signal collection + emission every 30 s ────────────────
  useEffect(() => {
    const isInRoom = joinStep === 'room' || joinStep === 'video' || joinStep === 'workspace';
    if (!isConnected || !gate?.focus_ml_enabled || !isInRoom) return;

    const sig = signalsRef.current;

    // Keystroke events
    const onKeydown = (e: KeyboardEvent) => {
      sig.keystrokes++;
      if (e.key === 'Backspace' || e.key === 'Delete') sig.backspaces++;
    };

    // Copy / paste / cut (counts as distraction)
    const onCopyPaste = () => { sig.copyPastes++; };

    // Tab / window focus tracking
    const onFocus   = () => { sig.isFocused = true;  sig.lastFocusAt = Date.now(); };
    const onBlur    = () => {
      if (sig.isFocused) sig.focusMs += Date.now() - sig.lastFocusAt;
      sig.isFocused = false;
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        if (sig.isFocused) sig.focusMs += Date.now() - sig.lastFocusAt;
        sig.isFocused = false;
        sig.tabSwitches++;
      } else {
        sig.isFocused = true;
        sig.lastFocusAt = Date.now();
      }
    };

    // Fullscreen exit counts as violation
    const onFs = () => { if (!document.fullscreenElement) sig.fsExits++; };

    document.addEventListener('keydown',           onKeydown);
    document.addEventListener('copy',              onCopyPaste);
    document.addEventListener('paste',             onCopyPaste);
    document.addEventListener('cut',               onCopyPaste);
    window.addEventListener  ('focus',             onFocus);
    window.addEventListener  ('blur',              onBlur);
    document.addEventListener('visibilitychange',  onVis);
    document.addEventListener('fullscreenchange',  onFs);

    // Every 30 s compute rates and emit real signal
    const id = setInterval(() => {
      const now     = Date.now();
      const elapsed = Math.max(1, (now - sig.intervalStart) / 1_000); // seconds

      // Accumulate any remaining focused time
      if (sig.isFocused) {
        sig.focusMs += now - sig.lastFocusAt;
        sig.lastFocusAt = now;
      }

      const typing_speed_wpm  = Math.round((sig.keystrokes / 5) / (elapsed / 60)); // WPM approx
      const backspace_ratio   = sig.keystrokes > 0 ? +(sig.keystrokes === 0 ? 0 : sig.backspaces / sig.keystrokes).toFixed(3) : 0;
      const window_focus_ratio = +(sig.focusMs / (elapsed * 1_000)).toFixed(3);
      const tab_switches_per_min = +(sig.tabSwitches / (elapsed / 60)).toFixed(2);
      const copy_paste_count  = sig.copyPastes;
      const idle_seconds      = Math.max(0, elapsed - sig.focusMs / 1_000);

      emitBehavioralSignals({
        tab_switches_per_min,
        idle_seconds: Math.round(idle_seconds),
        typing_speed_wpm,
        backspace_ratio,
        copy_paste_count,
        window_focus_ratio: Math.min(1, Math.max(0, window_focus_ratio)),
      });

      // Reset window for the next interval
      sig.keystrokes    = 0;
      sig.backspaces    = 0;
      sig.copyPastes    = 0;
      sig.tabSwitches   = 0;
      sig.fsExits       = 0;
      sig.focusMs       = 0;
      sig.intervalStart = now;
      sig.lastFocusAt   = now;
    }, 30_000);

    return () => {
      clearInterval(id);
      document.removeEventListener('keydown',           onKeydown);
      document.removeEventListener('copy',              onCopyPaste);
      document.removeEventListener('paste',             onCopyPaste);
      document.removeEventListener('cut',               onCopyPaste);
      window.removeEventListener  ('focus',             onFocus);
      window.removeEventListener  ('blur',              onBlur);
      document.removeEventListener('visibilitychange',  onVis);
      document.removeEventListener('fullscreenchange',  onFs);
    };
  }, [isConnected, gate?.focus_ml_enabled, emitBehavioralSignals]);

  // Proctor enforcement (Fix 2) — tab switch, fullscreen exit, copy/paste
  useEffect(() => {
    const isInRoom = joinStep === 'room' || joinStep === 'video' || joinStep === 'workspace';
    if (!isConnected || !isInRoom) return;
    const onVis = () => {
      if (document.visibilityState === 'hidden') emitTabSwitch(1);
    };
    const onCopy = (e: ClipboardEvent) => {
      if (gate?.lockdown_enabled || proctorPolicy?.block_copy_paste) {
        e.preventDefault();
        emitLockdownViolation('copy');
      }
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) emitFullscreenExit();
    };
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('copy', onCopy);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [isConnected, joinStep, gate?.lockdown_enabled, proctorPolicy?.block_copy_paste, emitTabSwitch, emitLockdownViolation, emitFullscreenExit]);

  // Checkpoint self-report: emit on each successful run (claimed)
  const selfReportCheckpoint = useCallback((checkpointNumber: number, passed: number) => {
    emitCheckpointPassed(checkpointNumber, passed);
  }, [emitCheckpointPassed]);

  // ── Gate check on mount ────────────────────────────────────────────────────
  useEffect(() => {
    studentService.checkGate(sessionId)
      .then(async (res) => {
        const g = res as GateResult;
        setGate(g);
        if (g?.session) {
          const t = g.session.started_at || g.session.scheduled_at;
          if (t) {
            try {
              const d = new Date(t);
              setSessionStartTimeStr(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            } catch {
              // fallback
            }
          }
          if (g.session.experiment_id) {
            setExpLoading(true);
            try {
              const prelab = await studentService.getPreLabContent(g.session.experiment_id);
              if (prelab?.experiment) {
                setExpDetail(prelab.experiment);
                if (prelab.experiment.subject_name) setSessionSubjectName(prelab.experiment.subject_name);
                if (prelab.experiment.title) setSessionTitleText(prelab.experiment.title);
              }
              if (prelab?.modules) setExpModules(prelab.modules);
              if (prelab?.pages) setExpPages(prelab.pages);
            } catch {
              // fallback
            } finally {
              setExpLoading(false);
            }
          }
        }
      })
      .catch(e => setGateError(e instanceof Error ? e.message : 'Gate check failed'))
      .finally(() => setGateLoading(false));
  }, [sessionId]);

  // Fallback loader if gate.session loads but modules are empty
  useEffect(() => {
    if (!gate?.session?.experiment_id) return;
    if (expDetail && expModules.length > 0) return;
    setExpLoading(true);
    studentService.getPreLabContent(gate.session.experiment_id)
      .then(prelab => {
        if (prelab?.experiment) {
          setExpDetail(prelab.experiment);
          if (prelab.experiment.subject_name) setSessionSubjectName(prelab.experiment.subject_name);
          if (prelab.experiment.title) setSessionTitleText(prelab.experiment.title);
        }
        if (prelab?.modules) setExpModules(prelab.modules);
        if (prelab?.pages) setExpPages(prelab.pages);
      })
      .catch(() => {})
      .finally(() => setExpLoading(false));
  }, [gate?.session?.experiment_id, expDetail, expModules.length]);

  // ── Screen capture and real-time streaming are handled inside StudentLiveConference ──
  // The screen share track publishes to LiveKit for real-time 30 FPS instructor view,
  // and emits periodic 30s screenshots over the socket so the SPARK grid stays updated.

  // ── Permission helpers ─────────────────────────────────────────────────────
  const requestCamera = async () => {
    setPermBusy(true);
    setPermError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setPubVideo(true);
      setCamGranted(true);
      stream.getTracks().forEach(t => t.stop());
    } catch (err: unknown) {
      const name = (err as DOMException | null)?.name || '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setPermError('Camera access was denied in your browser settings.');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setPubVideo(false);
        setCamGranted(true);
      } else {
        setPermError('Camera is in use by another application or unavailable.');
      }
    } finally {
      setPermBusy(false);
    }
  };

  const requestMicrophone = async () => {
    setPermBusy(true);
    setPermError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setPubAudio(true);
      setMicGranted(true);
      stream.getTracks().forEach(t => t.stop());
    } catch (err: unknown) {
      const name = (err as DOMException | null)?.name || '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setPermError('Microphone access was denied in your browser settings.');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setPubAudio(false);
        setMicGranted(true);
      } else {
        setPermError('Microphone is in use by another application or unavailable.');
      }
    } finally {
      setPermBusy(false);
    }
  };

  const requestScreen = async () => {
    setPermBusy(true);
    setPermError('');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      stream.getTracks().forEach(t => t.stop());
      setScreenGranted(true);
    } catch {
      setScreenGranted(true);
    } finally {
      setPermBusy(false);
    }
  };

  // ── Real code execution ────────────────────────────────────────────────────
  const runCode = async () => {
    if (!gate) return;
    setRunning(true);
    setOutput('');
    setActiveTab('output');
    try {
      const res = await executionService.runCode({
        files: { main: code },
        language,
        stdin: stdin || undefined,
        experiment_id: gate.session.experiment_id,
        session_id: sessionId,
      });
      const parts = [
        res.compile_output ? `[Compile]\n${res.compile_output}` : '',
        res.stdout || '',
        res.stderr ? `[Error]\n${res.stderr}` : '',
        `\n>>> Status: ${res.status} | Time: ${res.time_ms ?? '—'}ms | Memory: ${res.memory_kb ?? '—'} KB`,
      ].filter(Boolean);
      setOutput(parts.join('\n'));
      // Self-report checkpoint progress if the run reports tests passed
      if (typeof res.test_cases_passed === 'number') {
        selfReportCheckpoint(1, res.test_cases_passed);
      }
    } catch (e) {
      setOutput(`Execution failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setRunning(false);
    }
  };

  // ── Progressive AI hints ───────────────────────────────────────────────────
  const getHint = async () => {
    if (!gate) return;
    const nextLevel = Math.min(hintLevel + 1, 3) as 1 | 2 | 3;
    setHintLoading(true);
    setActiveTab('ai');
    try {
      const res = await aiService.getHint({
        experiment_id: gate.session.experiment_id,
        session_id: sessionId,
        hint_level: nextLevel,
        code,
        language,
      }) as { hint?: string; error?: string };
      setHint(res.hint || res.error || 'No hint available.');
      setHintLevel(nextLevel);
    } catch (e) {
      setHint(e instanceof Error ? e.message : 'Hint service unavailable');
    } finally {
      setHintLoading(false);
    }
  };

  const handleTab = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end   = el.selectionEnd;
      setCode(c => c.substring(0, start) + '    ' + c.substring(end));
      setTimeout(() => { el.selectionStart = el.selectionEnd = start + 4; }, 0);
    }
  }, []);

  // ── Loading / error / gate-locked screens ─────────────────────────────────
  if (gateLoading) {
    return (
      <StudentShell activePage="Live Coding Lab">
        <div className={styles.loadingBox}><Loader2 size={20} className={styles.spinner} /> Checking pre-lab gate…</div>
      </StudentShell>
    );
  }

  if (gateError || !gate) {
    return (
      <StudentShell activePage="Live Coding Lab">
        <div className={styles.errorBox}>⚠️ {gateError || 'Session not found'}</div>
        <button className={styles.joinBtn} onClick={() => router.push('/student/live-lab')}>← Back to sessions</button>
      </StudentShell>
    );
  }



  // ── 1. Attendance acknowledgment step (Matching Reference Image 1) ──────────
  if (joinStep === 'attendance') {
    return (
      <StudentShell activePage="Live Coding Lab">
        <div className={styles.prejoinWrapper}>
          {/* Breadcrumbs & Header Row */}
          <div className={styles.prejoinHeaderRow}>
            <div className={styles.prejoinHeaderLeft}>
              <div className={styles.prejoinBreadcrumbs}>
                <span onClick={() => router.push('/student/dashboard')}>Home</span>
                <span>&gt;</span>
                <span onClick={() => router.push('/student/live-lab')}>Student</span>
                <span>&gt;</span>
                <span onClick={() => router.push('/student/live-lab')}>Live Coding Lab</span>
                <span>&gt;</span>
                <span onClick={() => router.push('/student/live-lab')}>Join Session</span>
                <span>&gt;</span>
                <span className={styles.activeCrumb}>Attendance</span>
              </div>
              <h1 className={styles.prejoinTitle}>Mark Attendance</h1>
              <p className={styles.prejoinSubtitle}>Confirm you are present for this live lab session.</p>
            </div>

            {/* Top Right Live Session Badge */}
            <div className={styles.sessionMetaBadge}>
              <div className={styles.sessionMetaIconBox}>
                <Calendar size={18} strokeWidth={2.2} />
              </div>
              <div className={styles.sessionMetaInfo}>
                <p className={styles.sessionMetaTitle}>{sessionSubjectName} - Live Lab</p>
                <div className={styles.sessionMetaTimeRow}>
                  <span>Started at {sessionStartTimeStr}</span>
                  <span className={styles.liveTag}>
                    <span className={styles.liveTagDot} /> Live
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Main Attendance Card */}
          <div className={styles.attendanceCard}>
            <div className={styles.liveSessionPill}>
              <Radio size={12} strokeWidth={2.5} /> LIVE SESSION
            </div>

            <h2 className={styles.attendanceMainTitle}>Attendance Acknowledgment</h2>
            <p className={styles.attendanceMainDesc}>
              By proceeding, you confirm that you are physically present and ready to participate
              in this live lab session. Your attendance will be recorded and your presence tracked
              throughout the session.
            </p>

            <div className={styles.attendanceContentGrid}>
              {/* Left Column: 3 Pillars */}
              <div className={styles.pillarsList}>
                <div className={styles.pillarItem}>
                  <div className={styles.pillarIconBox}>
                    <Users size={18} strokeWidth={2.2} />
                  </div>
                  <div className={styles.pillarText}>
                    <p className={styles.pillarTitle}>Tracks Your Presence</p>
                    <p className={styles.pillarDesc}>Your attendance is recorded for this session</p>
                  </div>
                </div>

                <div className={styles.pillarItem}>
                  <div className={styles.pillarIconBox}>
                    <ShieldCheck size={18} strokeWidth={2.2} />
                  </div>
                  <div className={styles.pillarText}>
                    <p className={styles.pillarTitle}>Be an Active Participant</p>
                    <p className={styles.pillarDesc}>Join, learn, and interact with your instructor</p>
                  </div>
                </div>

                <div className={styles.pillarItem}>
                  <div className={styles.pillarIconBox}>
                    <TrendingUp size={18} strokeWidth={2.2} />
                  </div>
                  <div className={styles.pillarText}>
                    <p className={styles.pillarTitle}>Better Learning Experience</p>
                    <p className={styles.pillarDesc}>Helps maintain a focused and productive lab</p>
                  </div>
                </div>
              </div>

              {/* Right Column: 3D ID Badge Graphic with Cursive Callout & Quote */}
              <div className={styles.idCardVisualWrapper}>
                <div className={styles.idCardAura} />

                <div className={styles.idCardHandwrittenCallout}>
                  <span>Let's Learn Together!</span>
                  <svg className={styles.idCardArrowSvg} viewBox="0 0 34 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M6 4 C16 4, 26 12, 14 24" />
                    <polyline points="20 22 14 24 16 18" />
                  </svg>
                </div>

                <div className={styles.idCardElement}>
                  <div className={styles.idCardHeaderRow}>
                    <div className={styles.idCardChip} />
                    <span className={styles.idCardBrand}>NEXLAB STUDENT ID</span>
                  </div>

                  <div className={styles.idCardBodyRow}>
                    <div className={styles.idCardAvatarBox}>
                      <User size={22} strokeWidth={2.2} />
                    </div>
                    <div className={styles.idCardInfoLines}>
                      <div className={styles.idLineWide} />
                      <div className={styles.idLineNarrow} />
                      <div className={styles.idLineWide} style={{ width: '75%' }} />
                    </div>
                  </div>

                  {/* Floating Purple Check Badge */}
                  <div className={styles.idCardFloatingCheck}>
                    <Check size={22} strokeWidth={3} />
                  </div>
                </div>

                <p className={styles.attendanceQuote}>“Presence today, Progress tomorrow.”</p>
              </div>
            </div>

            {/* Bottom Action Toolbar */}
            <div className={styles.attendanceActionToolbar}>
              <div className={styles.actionBtnGroup}>
                <button
                  className={styles.presentBtn}
                  onClick={() => setJoinStep('permissions')}
                >
                  <UserCheck size={17} />
                  <span>I am present — Continue →</span>
                </button>
                <button
                  className={styles.cancelBtn}
                  onClick={() => router.push('/student/live-lab')}
                >
                  <X size={15} />
                  <span>Cancel</span>
                </button>
              </div>

              <div className={styles.securePresencePill}>
                <ShieldCheck size={16} color="#7c3aed" />
                <span>Your presence is secure and only used for this session.</span>
              </div>
            </div>
          </div>

          {/* Pre-join Page Footer */}
          <div className={styles.prejoinFooter}>
            <div className={styles.prejoinFooterBrand}>NexLab • Learn • Experiment • Grow</div>
            <div className={styles.prejoinFooterLinks}>
              <span onClick={() => router.push('/student/dashboard')}>Help</span>
              <span>•</span>
              <span onClick={() => router.push('/student/dashboard')}>Privacy</span>
              <span>•</span>
              <span onClick={() => router.push('/student/dashboard')}>Terms</span>
            </div>
          </div>
        </div>
      </StudentShell>
    );
  }

  // ── 2. Device Permissions Step (Matching Reference Image 2) ──────────────────
  if (joinStep === 'permissions') {
    return (
      <StudentShell activePage="Live Coding Lab">
        <div className={styles.prejoinWrapper}>
          {/* Breadcrumbs & Header Row */}
          <div className={styles.prejoinHeaderRow}>
            <div className={styles.prejoinHeaderLeft}>
              <div className={styles.prejoinBreadcrumbs}>
                <span onClick={() => router.push('/student/dashboard')}>Home</span>
                <span>&gt;</span>
                <span onClick={() => router.push('/student/live-lab')}>Student</span>
                <span>&gt;</span>
                <span onClick={() => router.push('/student/live-lab')}>Live Coding Lab</span>
                <span>&gt;</span>
                <span className={styles.activeCrumb}>Device Permissions</span>
              </div>
              <h1 className={styles.prejoinTitle}>Device Permissions</h1>
              <p className={styles.prejoinSubtitle}>Allow access so the video room works correctly</p>
            </div>

            {/* Top Right Privacy Badge */}
            <div className={styles.privacyBadge}>
              <div className={styles.privacyIconBox}>
                <ShieldCheck size={18} strokeWidth={2.2} />
              </div>
              <div className={styles.privacyInfo}>
                <p className={styles.privacyTitle}>Your privacy matters</p>
                <p className={styles.privacySub}>We only access the devices required for this session. 🔒</p>
              </div>
            </div>
          </div>

          {/* Main Permissions Card */}
          <div className={styles.permissionsCard}>
            <div className={styles.permissionsGrid}>
              {/* Left Column: Laptop Graphic & Pitch */}
              <div className={styles.permLeftCol}>
                <div className={styles.laptopVisualWrapper}>
                  <div className={styles.laptopAura} />
                  <div className={styles.laptopBody}>
                    <div className={styles.laptopScreenInner}>
                      <div className={styles.laptopScreenBar1} />
                      <div className={styles.laptopScreenBar2} />
                    </div>
                  </div>
                  <div className={styles.laptopBase} />

                  {/* Floating camera & mic bubbles */}
                  <div className={styles.floatingCameraBubble}>
                    <Video size={18} strokeWidth={2.2} />
                  </div>
                  <div className={styles.floatingMicBubble}>
                    <Mic size={18} strokeWidth={2.2} />
                  </div>
                </div>

                <h2 className={styles.permTitle}>We need your permission</h2>
                <p className={styles.permDesc}>
                  To ensure a smooth live lab experience, we need access to your camera and microphone.
                  You can revoke these permissions anytime from your browser settings.
                </p>

                <div className={styles.permPillList}>
                  <div className={styles.permMiniPill}>
                    <span className={styles.permMiniPillIcon}><Video size={14} /></span>
                    <span>See &amp; interact in the video room</span>
                  </div>
                  <div className={styles.permMiniPill}>
                    <span className={styles.permMiniPillIcon}><Mic size={14} /></span>
                    <span>Speak &amp; ask questions</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Permission Device Cards */}
              <div className={styles.permRightCol}>
                {/* Camera Access Card */}
                <div className={`${styles.permDeviceCard} ${camGranted ? styles.permCardDone : ''}`}>
                  <div className={styles.permDeviceLeft}>
                    <div className={styles.permDeviceIconBox}>
                      <Video size={20} strokeWidth={2.2} />
                    </div>
                    <div className={styles.permDeviceInfo}>
                      <div className={styles.permDeviceTitleRow}>
                        <p className={styles.permDeviceTitle}>Camera Access</p>
                        <span className={styles.requiredPill}>Required</span>
                      </div>
                      <p className={styles.permDeviceDesc}>Allows the instructor to see you during the session.</p>
                    </div>
                  </div>

                  {camGranted ? (
                    <span className={styles.allowedBadge}>
                      <CheckCircle2 size={15} /> Allowed
                    </span>
                  ) : (
                    <button
                      className={styles.allowBtn}
                      onClick={requestCamera}
                      disabled={permBusy}
                    >
                      {permBusy ? <Loader2 size={13} style={{ animation: 'spin .7s linear infinite' }} /> : <Video size={14} />}
                      <span>Allow</span>
                    </button>
                  )}
                </div>

                {/* Microphone Access Card */}
                <div className={`${styles.permDeviceCard} ${micGranted ? styles.permCardDone : ''}`}>
                  <div className={styles.permDeviceLeft}>
                    <div className={styles.permDeviceIconBox}>
                      <Mic size={20} strokeWidth={2.2} />
                    </div>
                    <div className={styles.permDeviceInfo}>
                      <div className={styles.permDeviceTitleRow}>
                        <p className={styles.permDeviceTitle}>Microphone Access</p>
                        <span className={styles.requiredPill}>Required</span>
                      </div>
                      <p className={styles.permDeviceDesc}>Lets you speak and participate in the session.</p>
                    </div>
                  </div>

                  {micGranted ? (
                    <span className={styles.allowedBadge}>
                      <CheckCircle2 size={15} /> Allowed
                    </span>
                  ) : (
                    <button
                      className={styles.allowBtn}
                      onClick={requestMicrophone}
                      disabled={permBusy}
                    >
                      {permBusy ? <Loader2 size={13} style={{ animation: 'spin .7s linear infinite' }} /> : <Mic size={14} />}
                      <span>Allow</span>
                    </button>
                  )}
                </div>

                {/* Browser permission notice callout */}
                <div className={styles.permCallout}>
                  <Info size={16} className={styles.permCalloutIcon} />
                  <span>You can change these permissions anytime in your browser settings.</span>
                </div>

                {permError && (
                  <div className={styles.errorBox} style={{ margin: 0, padding: '10px 14px', fontSize: 13 }}>
                    ⚠️ {permError}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Action Toolbar */}
            <div className={styles.permissionsActionToolbar}>
              <button
                className={styles.cancelBtn}
                onClick={() => setJoinStep('attendance')}
              >
                <ArrowLeft size={15} />
                <span>Back</span>
              </button>
              <button
                className={styles.continueBtn}
                onClick={() => setJoinStep('room')}
              >
                <Check size={16} strokeWidth={2.5} />
                <span>Continue</span>
              </button>
            </div>
          </div>

          {/* Pre-join Page Footer */}
          <div className={styles.prejoinFooter}>
            <div className={styles.prejoinFooterBrand}>NexLab • Learn • Experiment • Grow</div>
            <div className={styles.prejoinFooterLinks}>
              <span onClick={() => router.push('/student/dashboard')}>Help</span>
              <span>•</span>
              <span onClick={() => router.push('/student/dashboard')}>Privacy</span>
              <span>•</span>
              <span onClick={() => router.push('/student/dashboard')}>Terms</span>
            </div>
          </div>
        </div>
      </StudentShell>
    );
  }

  // ── 3. Redesigned Live Session Room (Live Class & Experiment Views) ────────
  const livekitToken = gate.livekit_token;
  const livekitUrl   = gate.livekit_url || process.env.NEXT_PUBLIC_LIVEKIT_URL || '';
  const instructorName = (gate?.session as unknown as { instructor_name?: string })?.instructor_name || 'Dr. Priya Sharma';

  return (
    <StudentShell activePage="Live Coding Lab">
      {/* Floating Reaction Toast */}
      {floatingReaction && (
        <div style={{
          position: 'fixed',
          top: '20%',
          right: '80px',
          fontSize: 48,
          zIndex: 9999,
          animation: 'bounce 0.5s ease infinite alternate',
          pointerEvents: 'none',
          filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.2))',
        }}>
          {floatingReaction}
        </div>
      )}

      <div className={styles.roomContainer}>
        {/* ── Top Bar (Matching Mockups) ── */}
        <div className={styles.roomHeader}>
          <div className={styles.roomHeaderLeft}>
            <div className={styles.roomBadge}>
              <Radio size={13} strokeWidth={2.5} />
              <span>Live Coding Lab</span>
            </div>
            <h1 className={styles.roomTitle}>
              {sessionTitleText || 'Data Structures – Stack (Using Arrays)'}
            </h1>
            <div className={styles.roomMeta}>
              <span>Instructor: {instructorName}</span>
              <span className={styles.roomMetaDot}>|</span>
              <span>Live Session</span>
              <span className={styles.roomMetaDot}>|</span>
              <span>Topic: {(gate?.session as unknown as { topic?: string })?.topic || 'Interactive Live Class'}</span>
            </div>
          </div>

          <div className={styles.roomHeaderRight}>
            <div className={styles.livePillRed}>
              <span className={styles.liveDotAnimated} />
              <span>LIVE</span>
            </div>
            <div className={styles.roomTimer}>
              <Clock size={14} color="#7c3aed" />
              <span>{formatTimer(sessionTimer)}</span>
            </div>
            <button
              className={styles.leaveSessionBtn}
              onClick={() => router.push('/student/live-lab')}
            >
              <LogOut size={14} />
              <span>Leave Session</span>
            </button>
          </div>
        </div>

        {/* ── Tab Switcher: Live Class & Experiment ── */}
        <div className={styles.classTabsGroup}>
          <button
            className={`${styles.classTabBtn} ${roomTab === 'live_class' ? styles.classTabBtnActive : ''}`}
            onClick={() => setRoomTab('live_class')}
          >
            <Tv size={15} />
            <span>Live Class</span>
          </button>
          <button
            className={`${styles.classTabBtn} ${roomTab === 'experiment' ? styles.classTabBtnActive : ''}`}
            onClick={() => setRoomTab('experiment')}
          >
            <FlaskConical size={15} />
            <span>Experiment</span>
          </button>
        </div>

        {/* ── Broadcast and Conductor Notices ── */}
        {broadcastMsg && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'rgba(124,58,237,.1)', border: '1px solid rgba(124,58,237,.25)', fontSize: 13.5 }}>
            <Bell size={15} color="#7c3aed" />
            <span style={{ flex: 1 }}><b>Instructor:</b> {broadcastMsg.text}</span>
            <button className={styles.checkBtn} onClick={() => setBroadcastMsg(null)}><X size={13} /> Dismiss</button>
          </div>
        )}
        {forcedSubmit && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', fontSize: 13.5 }}>
            <FileDown size={15} color="#ef4444" />
            <span style={{ flex: 1 }}><b>Session ended by instructor.</b> {forcedSubmit.reason} — your code was auto-submitted.</span>
            <button
              className={styles.checkBtn}
              style={{ background: '#7c3aed', color: '#ffffff', fontWeight: 600, border: 'none' }}
              onClick={() => setShowFeedbackModal(true)}
            >
              Rate Session
            </button>
            <button className={styles.checkBtn} onClick={() => setForcedSubmit(null)}><X size={13} /> OK</button>
          </div>
        )}
        {mode === 'paused' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'rgba(245,158,11,.15)', border: '1px solid rgba(245,158,11,.35)', fontSize: 13.5 }}>
            <PauseCircle size={15} color="#f59e0b" />
            <span style={{ flex: 1 }}><b>Session paused by instructor.</b> Editing and running are frozen.</span>
          </div>
        )}

        {/* ── UNIFIED LIVE WORKSPACE (Real-time LiveKit & Right Sidebar persistent across tabs) ── */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {livekitToken && livekitUrl ? (
            <LiveKitRoom
              serverUrl={livekitUrl}
              token={livekitToken}
              connect={true}
              audio={pubAudio}
              video={pubVideo}
              style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
            >
              <StudentLiveConference
                user={user}
                session={gate.session}
                sessionId={sessionId}
                instructorName={instructorName}
                sessionTitleText={sessionTitleText}
                chatLog={chatLog}
                onSendChat={sendChat}
                chatSending={chatSending}
                roomTab={roomTab}
                onTabChange={setRoomTab}
                onReaction={(emoji) => {
                  setFloatingReaction(emoji);
                  setTimeout(() => setFloatingReaction(null), 3000);
                }}
                onLeave={() => router.push('/student/live-lab')}
                pubAudio={pubAudio}
                pubVideo={pubVideo}
                emitScreenshot={emitScreenshot}
                expDetail={expDetail}
                expModules={expModules}
                expPages={expPages}
                expLoading={expLoading}
                onSelfReportCheckpoint={selfReportCheckpoint}
                onCodeChange={(c) => { codeRef.current = c; }}
                handleTab={handleTab}
                language={language}
                setLanguage={setLanguage}
                mediaSignal={mediaSignal}
              />
            </LiveKitRoom>
          ) : (
            <StudentLiveConferenceStandalone
              user={user}
              session={gate.session}
              sessionId={sessionId}
              instructorName={instructorName}
              sessionTitleText={sessionTitleText}
              chatLog={chatLog}
              onSendChat={sendChat}
              chatSending={chatSending}
              roomTab={roomTab}
              onTabChange={setRoomTab}
              onReaction={(emoji) => {
                setFloatingReaction(emoji);
                setTimeout(() => setFloatingReaction(null), 3000);
              }}
              onLeave={() => router.push('/student/live-lab')}
              pubAudio={pubAudio}
              pubVideo={pubVideo}
              expDetail={expDetail}
              expModules={expModules}
              expPages={expPages}
              expLoading={expLoading}
              onSelfReportCheckpoint={selfReportCheckpoint}
              onCodeChange={(c) => { codeRef.current = c; }}
              handleTab={handleTab}
              language={language}
              setLanguage={setLanguage}
              mediaSignal={mediaSignal}
            />
          )}
          {showFeedbackModal && (
            <SessionFeedbackModal
              isOpen={showFeedbackModal}
              sessionId={sessionId}
              sessionTitle={sessionTitleText}
              instructorName={instructorName}
              onClose={() => setShowFeedbackModal(false)}
              onSuccess={() => {
                setToastMsg('Thank you! Your anonymous feedback was recorded.');
                setTimeout(() => setToastMsg(null), 3500);
              }}
            />
          )}
          {toastMsg && (
            <div style={{
              position: 'fixed', top: 20, right: 20, zIndex: 99999,
              background: '#1e1b4b', color: '#fff', border: '1px solid #7c3aed',
              borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 600,
              boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            }}>
              {toastMsg}
            </div>
          )}
        </div>
      </div>
    </StudentShell>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// REAL LIVEKIT CONFERENCE (RUNS INSIDE <LiveKitRoom> CONTEXT)
// ══════════════════════════════════════════════════════════════════════════════

interface StudentConferenceProps {
  user: any;
  session: any;
  sessionId: string;
  instructorName: string;
  sessionTitleText: string;
  chatLog: ChatMessagePayload[];
  onSendChat: (text: string, toId?: string) => Promise<void>;
  chatSending: boolean;
  roomTab: 'live_class' | 'experiment';
  onTabChange: (tab: 'live_class' | 'experiment') => void;
  onReaction: (emoji: string) => void;
  onLeave: () => void;
  pubAudio: boolean;
  pubVideo: boolean;
  emitScreenshot?: (dataUrl: string) => void;
  expDetail: ExperimentDetail | null;
  expModules: ContentModule[];
  expPages: ContentPage[];
  expLoading: boolean;
  onSelfReportCheckpoint?: (checkpointNumber: number, passed: number) => void;
  onCodeChange?: (code: string) => void;
  handleTab: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  mediaSignal?: { action: 'mute' | 'camera'; value: boolean; ts: number } | null;
}

function StudentLiveConference({
  user,
  session,
  sessionId,
  instructorName,
  sessionTitleText,
  chatLog,
  onSendChat,
  chatSending,
  roomTab,
  onTabChange,
  onReaction,
  onLeave,
  pubAudio,
  pubVideo,
  emitScreenshot,
  expDetail,
  expModules,
  expPages,
  expLoading,
  onSelfReportCheckpoint,
  onCodeChange,
  handleTab,
  language,
  setLanguage,
  mediaSignal,
}: StudentConferenceProps) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const room = useRoomContext();

  // React to remote media control signals from instructor
  useEffect(() => {
    if (!mediaSignal) return;
    if (mediaSignal.action === 'mute') {
      localParticipant.setMicrophoneEnabled(!mediaSignal.value).catch(() => {});
    } else if (mediaSignal.action === 'camera') {
      localParticipant.setCameraEnabled(!mediaSignal.value).catch(() => {});
    }
  }, [mediaSignal, localParticipant]);
  const [handRaised, setHandRaised] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'chat' | 'participants'>('chat');
  const [chatAudience, setChatAudience] = useState<'everyone' | 'direct'>('everyone');
  const [chatInput, setChatInput] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>('contain');

  // Resizable & Minimizable states
  const [sidebarMinimized, setSidebarMinimized] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(340);
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);

  const [studentTileMinimized, setStudentTileMinimized] = useState(false);
  const [studentTileHeight, setStudentTileHeight] = useState(210);
  const [isDraggingStudentTile, setIsDraggingStudentTile] = useState(false);

  // Experiment states
  const [expFullscreen, setExpFullscreen] = useState(false);

  const chatLogRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // Drag-resize right sidebar
  const startResizeSidebar = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingSidebar(true);
  };

  useEffect(() => {
    if (!isDraggingSidebar) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX - 32;
      if (newWidth >= 240 && newWidth <= 520) {
        setSidebarWidth(newWidth);
      }
    };
    const handleMouseUp = () => setIsDraggingSidebar(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingSidebar]);

  // Drag-resize student preview tile
  const startResizeStudentTile = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingStudentTile(true);
  };

  useEffect(() => {
    if (!isDraggingStudentTile) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newHeight = window.innerHeight - e.clientY - 90;
      if (newHeight >= 120 && newHeight <= 380) {
        setStudentTileHeight(newHeight);
      }
    };
    const handleMouseUp = () => setIsDraggingStudentTile(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingStudentTile]);

  // Escape key handling for fullscreen
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && expFullscreen) {
        setExpFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [expFullscreen]);

  // Sync initial published audio/video
  useEffect(() => {
    if (!pubAudio && isMicrophoneEnabled) {
      localParticipant.setMicrophoneEnabled(false).catch(() => {});
    }
    if (!pubVideo && isCameraEnabled) {
      localParticipant.setCameraEnabled(false).catch(() => {});
    }
  }, []);

  // Prompt screen share on entry
  useEffect(() => {
    if (!isScreenShareEnabled) {
      localParticipant.setScreenShareEnabled(true).catch(() => {});
    }
  }, []);

  // Find instructor participant
  const instructor = useMemo(() => {
    return (
      remoteParticipants.find(p =>
        p.identity.startsWith('instructor-') ||
        p.identity.includes('host') ||
        (p.name && (p.name.toLowerCase().includes('instructor') || p.name.toLowerCase().includes('dr.')))
      ) || remoteParticipants[0]
    );
  }, [remoteParticipants]);

  const instScreenPub = instructor?.getTrackPublication(Track.Source.ScreenShare);
  const instCamPub = instructor?.getTrackPublication(Track.Source.Camera);

  const localScreenPub = localParticipant.getTrackPublication(Track.Source.ScreenShare);
  const localCamPub = localParticipant.getTrackPublication(Track.Source.Camera);

  // Periodic screenshot capture
  useEffect(() => {
    const track = localScreenPub?.videoTrack?.mediaStreamTrack;
    if (!track || track.readyState !== 'live' || !emitScreenshot) return;

    let cancelled = false;

    const captureAndSend = async () => {
      if (cancelled || track.readyState !== 'live') return;
      try {
        if (typeof ImageCapture !== 'undefined') {
          const cap = new ImageCapture(track);
          const bitmap = await (cap as unknown as { grabFrame(): Promise<ImageBitmap> }).grabFrame();
          const canvas = document.createElement('canvas');
          const W = Math.min(bitmap.width || 1280, 1280);
          const H = Math.min(bitmap.height || 720, 720);
          canvas.width = W;
          canvas.height = H;
          canvas.getContext('2d')!.drawImage(bitmap, 0, 0, W, H);
          canvas.toBlob(blob => {
            if (!blob || cancelled) return;
            const reader = new FileReader();
            reader.onload = () => {
              if (reader.result && !cancelled && emitScreenshot) {
                emitScreenshot(reader.result as string);
              }
            };
            reader.readAsDataURL(blob);
          }, 'image/jpeg', 0.75);
        } else {
          const video = document.createElement('video');
          video.srcObject = new MediaStream([track]);
          video.muted = true;
          await video.play().catch(() => {});
          const canvas = document.createElement('canvas');
          const vW = Math.min(video.videoWidth || 1280, 1280);
          const vH = Math.min(video.videoHeight || 720, 720);
          canvas.width = vW;
          canvas.height = vH;
          canvas.getContext('2d')!.drawImage(video, 0, 0, vW, vH);
          video.pause();
          video.srcObject = null;
          canvas.toBlob(blob => {
            if (!blob || cancelled) return;
            const reader = new FileReader();
            reader.onload = () => {
              if (reader.result && !cancelled && emitScreenshot) {
                emitScreenshot(reader.result as string);
              }
            };
            reader.readAsDataURL(blob);
          }, 'image/jpeg', 0.75);
        }
      } catch {}
    };

    captureAndSend();
    const timer = setInterval(captureAndSend, 30_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [localScreenPub?.videoTrack?.mediaStreamTrack, emitScreenshot]);

  const filteredMessages = useMemo(() => {
    if (chatAudience === 'direct') {
      return chatLog.filter(m => Boolean(m.to_id));
    }
    return chatLog.filter(m => !m.to_id);
  }, [chatLog, chatAudience]);

  useEffect(() => {
    chatLogRef.current?.scrollTo({ top: chatLogRef.current.scrollHeight, behavior: 'smooth' });
  }, [filteredMessages]);

  const handleSend = async () => {
    const text = chatInput.trim();
    if (!text || chatSending) return;
    setChatInput('');
    const targetId = chatAudience === 'direct' ? (session?.instructor_id || 'instructor') : undefined;
    await onSendChat(text, targetId);
  };

  const toggleFullscreen = () => {
    if (!stageRef.current) return;
    if (!document.fullscreenElement) {
      stageRef.current.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const instInitials = initials(instructorName || 'Dr. Priya Sharma');
  const userInitials = initials(user?.full_name || 'You');

  return (
    <div className={styles.liveClassGridContainer}>
      <RoomAudioRenderer />

      {/* Main Content Area */}
      <div className={styles.mainContentFlexCol}>
        {roomTab === 'live_class' ? (
          <>
            {/* Top: Instructor Stage */}
            <div ref={stageRef} className={`${styles.instructorStageWrapper} ${isFullscreen ? styles.stageFullscreen : ''}`} style={{ flex: 1, minHeight: 280 }}>
              <div className={styles.stageHeader}>
                <div className={styles.stageHeaderLeft}>
                  <span className={styles.liveTagDot} />
                  <span className={styles.stageTitle}>Instructor's Presentation</span>
                  <span className={styles.instructorNamePill}>
                    <User size={13} />
                    <span>{instructorName}</span>
                  </span>
                </div>
                <div className={styles.stageHeaderRight}>
                  {instScreenPub?.videoTrack ? (
                    <span className={styles.screenShareBadge}>
                      <Monitor size={12} /> Screen Sharing
                    </span>
                  ) : instCamPub?.videoTrack ? (
                    <span className={styles.screenShareBadge}>
                      <Video size={12} /> Camera Active
                    </span>
                  ) : (
                    <span className={styles.liveAudioBadge}>
                      <Mic size={12} /> Audio Live
                    </span>
                  )}
                  {isFullscreen && (
                    <button
                      className={styles.stageFsBtn}
                      onClick={() => setFitMode(m => m === 'contain' ? 'cover' : 'contain')}
                      title={fitMode === 'contain' ? 'Fill screen completely' : 'Fit original aspect ratio'}
                      style={{ width: 'auto', padding: '0 10px', fontSize: 11.5, fontWeight: 700 }}
                    >
                      {fitMode === 'contain' ? 'Fill Screen' : 'Fit Screen'}
                    </button>
                  )}
                  <button className={styles.stageFsBtn} onClick={toggleFullscreen} title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
                    {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  </button>
                </div>
              </div>

              <div className={styles.stageMediaBox} style={{ flex: 1, minHeight: 240, maxHeight: 'none' }}>
                {instScreenPub?.videoTrack && instructor ? (
                  <VideoTrack
                    trackRef={{
                      participant: instructor,
                      publication: instScreenPub,
                      source: Track.Source.ScreenShare,
                    }}
                    style={{ width: '100%', height: '100%', objectFit: fitMode }}
                  />
                ) : instCamPub?.videoTrack && instructor ? (
                  <VideoTrack
                    trackRef={{
                      participant: instructor,
                      publication: instCamPub,
                      source: Track.Source.Camera,
                    }}
                    style={{ width: '100%', height: '100%', objectFit: fitMode }}
                  />
                ) : (
                  <div className={styles.stagePlaceholder}>
                    <div className={styles.stageAvatarGlow}>
                      {instInitials}
                    </div>
                    <h3 className={styles.stagePlaceholderTitle}>
                      {instructorName} is conducting the live session
                    </h3>
                    <p className={styles.stagePlaceholderSub}>
                      Listening to instructor audio · Watching for screen share & demo
                    </p>
                    <div className={styles.audioWaveIndicator}>
                      <span /><span /><span /><span /><span />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Vertical Resizer between Stage and Student Tile */}
            {!studentTileMinimized && (
              <div
                className={styles.verticalSplitResizer}
                onMouseDown={startResizeStudentTile}
                title="Drag to resize student preview"
              >
                <div className={styles.resizerGripH} />
              </div>
            )}

            {/* Bottom: Student Tile Preview + Controls */}
            {studentTileMinimized ? (
              <div className={styles.studentTileMinimized}>
                <div className={styles.studentTileMinimizedLeft}>
                  <span className={styles.studentTileDot} />
                  <span className={styles.studentTileMinimizedName}>
                    {user?.full_name || 'You'}
                    {isScreenShareEnabled && <span className={styles.sharingLabel}> • Sharing Screen</span>}
                    {isCameraEnabled && !isScreenShareEnabled && <span className={styles.camLabel}> • Camera Active</span>}
                  </span>
                </div>
                <div className={styles.studentTileMinimizedActions}>
                  <button
                    className={`${styles.miniCtrlBtn} ${!isMicrophoneEnabled ? styles.miniCtrlDanger : ''}`}
                    onClick={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
                    title={isMicrophoneEnabled ? 'Mute Microphone' : 'Unmute Microphone'}
                  >
                    {isMicrophoneEnabled ? <Mic size={13} /> : <MicOff size={13} />}
                  </button>
                  <button
                    className={`${styles.miniCtrlBtn} ${!isCameraEnabled ? styles.miniCtrlDanger : ''}`}
                    onClick={() => localParticipant.setCameraEnabled(!isCameraEnabled)}
                    title={isCameraEnabled ? 'Stop Video' : 'Start Video'}
                  >
                    {isCameraEnabled ? <Video size={13} /> : <VideoOff size={13} />}
                  </button>
                  <button
                    className={`${styles.miniCtrlBtn} ${isScreenShareEnabled ? styles.miniCtrlActive : ''}`}
                    onClick={async () => {
                      try {
                        await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
                      } catch {}
                    }}
                    title={isScreenShareEnabled ? 'Stop Sharing' : 'Share Screen'}
                  >
                    {isScreenShareEnabled ? <MonitorOff size={13} /> : <Monitor size={13} />}
                  </button>
                  <button
                    className={`${styles.miniCtrlBtn} ${handRaised ? styles.miniCtrlActive : ''}`}
                    onClick={() => {
                      const next = !handRaised;
                      setHandRaised(next);
                      localParticipant.setAttributes({ hand_raised: next ? '1' : '' }).catch(() => {});
                    }}
                    title={handRaised ? 'Lower Hand' : 'Raise Hand'}
                  >
                    <Hand size={13} />
                  </button>
                  <button
                    className={styles.miniExpandBtn}
                    onClick={() => setStudentTileMinimized(false)}
                    title="Expand Student Preview"
                  >
                    <ChevronUp size={13} />
                    <span>Expand</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.studentTileWrapper} style={{ height: studentTileHeight, minHeight: studentTileHeight }}>
                <div className={styles.studentTileMedia} style={{ flex: 1, minHeight: 0, maxHeight: 'none' }}>
                  {localScreenPub?.videoTrack ? (
                    <VideoTrack
                      trackRef={{
                        participant: localParticipant,
                        publication: localScreenPub,
                        source: Track.Source.ScreenShare,
                      }}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  ) : localCamPub?.videoTrack ? (
                    <VideoTrack
                      trackRef={{
                        participant: localParticipant,
                        publication: localCamPub,
                        source: Track.Source.Camera,
                      }}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div className={styles.studentTilePlaceholder}>
                      <div className={styles.studentTileAvatar}>
                        {userInitials}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center', textAlign: 'center' }}>
                        <span className={styles.studentTileName}>{user?.full_name || 'You'}</span>
                        <span style={{ fontSize: 11, color: '#9ca3af' }}>Your screen is not shared</span>
                        <button
                          type="button"
                          onClick={() => localParticipant.setScreenShareEnabled(true).catch(() => {})}
                          style={{
                            marginTop: 4,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '5px 12px',
                            background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 8,
                            fontSize: 11.5,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          <Monitor size={12} />
                          <span>Share Screen</span>
                        </button>
                      </div>
                    </div>
                  )}

                  <div className={styles.studentTileBadge}>
                    <span className={styles.studentTileDot} />
                    <span>{user?.full_name || 'You'}</span>
                    {isScreenShareEnabled && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#22c55e', fontSize: 11, marginLeft: 4 }}>
                        <Monitor size={11} /> Sharing
                      </span>
                    )}
                    {!isMicrophoneEnabled && <MicOff size={12} color="#ef4444" />}
                  </div>
                </div>

                {/* Control Bar */}
                <div className={styles.conferenceControlsBar}>
                  <button
                    className={`${styles.ctrlCircleBtn} ${!isMicrophoneEnabled ? styles.ctrlDanger : ''}`}
                    onClick={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
                    title={isMicrophoneEnabled ? 'Mute Microphone' : 'Unmute Microphone'}
                  >
                    {isMicrophoneEnabled ? <Mic size={15} /> : <MicOff size={15} />}
                    <span>{isMicrophoneEnabled ? 'Mute' : 'Unmute'}</span>
                  </button>

                  <button
                    className={`${styles.ctrlCircleBtn} ${!isCameraEnabled ? styles.ctrlDanger : ''}`}
                    onClick={() => localParticipant.setCameraEnabled(!isCameraEnabled)}
                    title={isCameraEnabled ? 'Stop Camera' : 'Start Camera'}
                  >
                    {isCameraEnabled ? <Video size={15} /> : <VideoOff size={15} />}
                    <span>{isCameraEnabled ? 'Stop Video' : 'Start Video'}</span>
                  </button>

                  <button
                    className={`${styles.ctrlCircleBtn} ${isScreenShareEnabled ? styles.ctrlActive : ''}`}
                    onClick={async () => {
                      try {
                        await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
                      } catch {}
                    }}
                    title={isScreenShareEnabled ? 'Stop Sharing' : 'Share Screen'}
                  >
                    {isScreenShareEnabled ? <MonitorOff size={15} /> : <Monitor size={15} />}
                    <span>{isScreenShareEnabled ? 'Stop Share' : 'Share Screen'}</span>
                  </button>

                  <button
                    className={`${styles.ctrlCircleBtn} ${handRaised ? styles.ctrlActive : ''}`}
                    onClick={() => {
                      const next = !handRaised;
                      setHandRaised(next);
                      localParticipant.setAttributes({ hand_raised: next ? '1' : '' }).catch(() => {});
                    }}
                    title={handRaised ? 'Lower Hand' : 'Raise Hand'}
                  >
                    <Hand size={15} />
                    <span>{handRaised ? 'Hand Raised' : 'Raise Hand'}</span>
                  </button>

                  <div style={{ position: 'relative' }}>
                    <button
                      className={styles.ctrlCircleBtn}
                      onClick={() => setShowReactions(r => !r)}
                      title="Share Reaction"
                    >
                      <Smile size={15} />
                      <span>Reaction</span>
                    </button>

                    {showReactions && (
                      <div className={styles.reactionPickerPopover}>
                        {['👍', '❤️', '👏', '✋', '🔥', '💡'].map(emoji => (
                          <button
                            key={emoji}
                            className={styles.emojiBtn}
                            onClick={() => {
                              onReaction(emoji);
                              setShowReactions(false);
                            }}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    className={styles.ctrlCircleBtn}
                    onClick={() => setStudentTileMinimized(true)}
                    title="Minimize Student Tile"
                  >
                    <ChevronDown size={15} />
                    <span>Minimize</span>
                  </button>

                  <button
                    className={`${styles.ctrlCircleBtn} ${styles.ctrlLeave}`}
                    onClick={() => {
                      room.disconnect();
                      onLeave();
                    }}
                    title="Leave Live Session"
                  >
                    <PhoneOff size={15} />
                    <span>Leave</span>
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <ExperimentWorkbench
            expDetail={expDetail}
            expModules={expModules}
            expPages={expPages}
            expLoading={expLoading}
            sessionId={sessionId}
            experimentId={session?.experiment_id || ''}
            sessionTitleText={sessionTitleText}
            expFullscreen={expFullscreen}
            setExpFullscreen={setExpFullscreen}
            language={language}
            setLanguage={setLanguage}
            handleTab={handleTab}
            onSelfReportCheckpoint={onSelfReportCheckpoint}
            onCodeChange={onCodeChange}
          />
        )}
      </div>

      {/* Resizer Divider between Main Content and Right Sidebar */}
      {!sidebarMinimized && (
        <div
          className={styles.sidebarSplitResizer}
          onMouseDown={startResizeSidebar}
          title="Drag to resize sidebar"
        >
          <div className={styles.resizerGripV} />
        </div>
      )}

      {/* Right Column: Chat & Participants Sidebar (SAME IN BOTH LIVE CLASS & EXPERIMENT) */}
      <div
        className={`${styles.sessionRightSidebar} ${sidebarMinimized ? styles.sidebarMinimized : ''}`}
        style={{
          width: sidebarMinimized ? 48 : sidebarWidth,
          minWidth: sidebarMinimized ? 48 : sidebarWidth,
        }}
      >
        {sidebarMinimized ? (
          <div className={styles.sidebarMinimizedRail}>
            <button
              className={styles.sidebarExpandBtn}
              onClick={() => setSidebarMinimized(false)}
              title="Expand Sidebar"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              className={`${styles.railIconBtn} ${sidebarTab === 'chat' ? styles.railIconActive : ''}`}
              onClick={() => {
                setSidebarTab('chat');
                setSidebarMinimized(false);
              }}
              title={`Live Chat (${chatLog.length})`}
            >
              <MessageSquare size={16} />
              {chatLog.length > 0 && <span className={styles.railBadge}>{chatLog.length}</span>}
            </button>
            <button
              className={`${styles.railIconBtn} ${sidebarTab === 'participants' ? styles.railIconActive : ''}`}
              onClick={() => {
                setSidebarTab('participants');
                setSidebarMinimized(false);
              }}
              title={`Participants (${remoteParticipants.length + 1})`}
            >
              <Users size={16} />
              <span className={styles.railBadge}>{remoteParticipants.length + 1}</span>
            </button>
          </div>
        ) : (
          <>
            <div className={styles.sidebarTabsRow}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  className={`${styles.sidebarTabButton} ${sidebarTab === 'chat' ? styles.sidebarTabActive : ''}`}
                  onClick={() => setSidebarTab('chat')}
                >
                  <MessageSquare size={15} />
                  <span>Live Chat ({chatLog.length})</span>
                </button>
                <button
                  className={`${styles.sidebarTabButton} ${sidebarTab === 'participants' ? styles.sidebarTabActive : ''}`}
                  onClick={() => setSidebarTab('participants')}
                >
                  <Users size={15} />
                  <span>Participants ({remoteParticipants.length + 1})</span>
                </button>
              </div>
              <button
                className={styles.sidebarMinimizeBtn}
                onClick={() => setSidebarMinimized(true)}
                title="Minimize Sidebar"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {sidebarTab === 'chat' ? (
              <>
                <div className={styles.chatAudiencePills}>
                  <button
                    className={`${styles.chatAudienceBtn} ${chatAudience === 'everyone' ? styles.chatAudienceActive : ''}`}
                    onClick={() => setChatAudience('everyone')}
                  >
                    <Users size={13} />
                    <span>Group (Everyone)</span>
                  </button>
                  <button
                    className={`${styles.chatAudienceBtn} ${chatAudience === 'direct' ? styles.chatAudienceActive : ''}`}
                    onClick={() => setChatAudience('direct')}
                  >
                    <Lock size={13} />
                    <span>Direct (Instructor)</span>
                  </button>
                </div>

                {chatAudience === 'direct' && (
                  <div className={styles.directChatBanner}>
                    <Lock size={12} />
                    <span>Private 1:1 conversation with {instructorName}</span>
                  </div>
                )}

                <div ref={chatLogRef} className={styles.chatMessagesStream}>
                  {filteredMessages.length === 0 ? (
                    <div className={styles.emptyChatBox}>
                      <MessageSquare size={24} color="#a1a1aa" />
                      <p className={styles.emptyChatTitle}>No messages yet</p>
                      <p className={styles.emptyChatSub}>
                        {chatAudience === 'direct'
                          ? 'Send a private question or clarification to your instructor.'
                          : 'Say hello to your instructor and classmates!'}
                      </p>
                    </div>
                  ) : (
                    filteredMessages.map((m: ChatMessagePayload, idx: number) => {
                      const own = m.from_id === user?.id || m.from_name === user?.full_name;
                      const isInst =
                        (m.from_name || '').includes('Dr.') ||
                        (m.from_name || '').includes('Instructor');
                      const msgInitials = initials(m.from_name || (own ? 'You' : 'Student'));
                      return (
                        <div
                          key={m.id || idx}
                          className={`${styles.chatMessageRow} ${own ? styles.chatMessageOwn : ''}`}
                        >
                          <div
                            className={styles.chatAvatarBubble}
                            style={{
                              background: own ? '#7c3aed' : isInst ? '#9333ea' : '#3b82f6',
                            }}
                          >
                            {msgInitials}
                          </div>
                          <div className={styles.chatMsgBody}>
                            <div className={styles.chatMsgHeader}>
                              <span className={styles.chatSenderName}>
                                {own ? 'You' : m.from_name || 'Student'}
                              </span>
                              {isInst && (
                                <span className={styles.instructorBadgeTag}>Instructor</span>
                              )}
                              <span className={styles.chatTimestamp}>{formatChatTime(m.at)}</span>
                            </div>
                            <div
                              className={`${styles.chatTextContent} ${own ? styles.chatTextOwn : ''}`}
                            >
                              {m.text}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className={styles.chatInputWrap}>
                  <input
                    type="text"
                    className={styles.chatInputField}
                    placeholder={
                      chatAudience === 'direct'
                        ? `Message ${instructorName} privately…`
                        : 'Message everyone in class…'
                    }
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className={styles.chatSendIconButton}
                    onClick={handleSend}
                    disabled={chatSending || !chatInput.trim()}
                  >
                    {chatSending ? (
                      <Loader2 size={13} className={styles.spinner} />
                    ) : (
                      <Send size={14} />
                    )}
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.chatMessagesStream}>
                <div className={styles.participantItem}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className={styles.chatAvatarBubble} style={{ background: '#7c3aed' }}>
                      {instInitials}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                        {instructorName}
                      </span>
                      <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>
                        Instructor • Host
                      </span>
                    </div>
                  </div>
                  <button
                    className={styles.dmInstBtn}
                    onClick={() => {
                      setChatAudience('direct');
                      setSidebarTab('chat');
                    }}
                  >
                    Message
                  </button>
                </div>

                <div className={styles.participantItem}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className={styles.chatAvatarBubble} style={{ background: '#3b82f6' }}>
                      {userInitials}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                        {user?.full_name || 'You'} (You)
                      </span>
                      <span style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>
                        Online • Student
                      </span>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: '#059669', fontWeight: 700 }}>Active</span>
                </div>

                {remoteParticipants
                  .filter(p => !p.identity.startsWith('instructor-'))
                  .map(p => {
                    const pInitials = initials(p.name || p.identity);
                    return (
                      <div key={p.identity} className={styles.participantItem}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className={styles.chatAvatarBubble} style={{ background: '#64748b' }}>
                            {pInitials}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                              {p.name || p.identity}
                            </span>
                            <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                              Student
                            </span>
                          </div>
                        </div>
                        <span style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>
                          In room
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// STANDALONE FALLBACK (WHEN LIVEKIT TOKEN IS ABSENT OR CONNECTING)
// ══════════════════════════════════════════════════════════════════════════════

function StudentLiveConferenceStandalone({
  user,
  session,
  sessionId,
  instructorName,
  sessionTitleText,
  chatLog,
  onSendChat,
  chatSending,
  roomTab,
  onTabChange,
  onReaction,
  onLeave,
  pubAudio,
  pubVideo,
  expDetail,
  expModules,
  expPages,
  expLoading,
  onSelfReportCheckpoint,
  onCodeChange,
  handleTab,
  language,
  setLanguage,
  mediaSignal,
}: StudentConferenceProps) {
  const [micOn, setMicOn] = useState(pubAudio);
  const [camOn, setCamOn] = useState(pubVideo);

  // React to remote media control signals from instructor
  useEffect(() => {
    if (!mediaSignal) return;
    if (mediaSignal.action === 'mute') {
      setMicOn(!mediaSignal.value);
    } else if (mediaSignal.action === 'camera') {
      setCamOn(!mediaSignal.value);
    }
  }, [mediaSignal]);
  const [sharing, setSharing] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'chat' | 'participants'>('chat');
  const [chatAudience, setChatAudience] = useState<'everyone' | 'direct'>('everyone');
  const [chatInput, setChatInput] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>('contain');

  // Resizable & Minimizable states
  const [sidebarMinimized, setSidebarMinimized] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(340);
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);

  const [studentTileMinimized, setStudentTileMinimized] = useState(false);
  const [studentTileHeight, setStudentTileHeight] = useState(210);
  const [isDraggingStudentTile, setIsDraggingStudentTile] = useState(false);

  // Experiment states
  const [expFullscreen, setExpFullscreen] = useState(false);

  const chatLogRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const standaloneScreenStreamRef = useRef<MediaStream | null>(null);

  // Drag-resize right sidebar
  const startResizeSidebar = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingSidebar(true);
  };

  useEffect(() => {
    if (!isDraggingSidebar) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX - 32;
      if (newWidth >= 240 && newWidth <= 520) {
        setSidebarWidth(newWidth);
      }
    };
    const handleMouseUp = () => setIsDraggingSidebar(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingSidebar]);

  // Drag-resize student preview tile
  const startResizeStudentTile = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingStudentTile(true);
  };

  useEffect(() => {
    if (!isDraggingStudentTile) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newHeight = window.innerHeight - e.clientY - 90;
      if (newHeight >= 120 && newHeight <= 380) {
        setStudentTileHeight(newHeight);
      }
    };
    const handleMouseUp = () => setIsDraggingStudentTile(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingStudentTile]);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && expFullscreen) {
        setExpFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [expFullscreen]);

  useEffect(() => {
    if (camOn && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: true, audio: micOn })
        .then(stream => {
          localStreamRef.current = stream;
          if (videoRef.current) videoRef.current.srcObject = stream;
        })
        .catch(() => {});
    } else {
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    }
    return () => {
      localStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [camOn]);

  const toggleScreenShare = async () => {
    if (sharing) {
      standaloneScreenStreamRef.current?.getTracks().forEach(t => t.stop());
      standaloneScreenStreamRef.current = null;
      if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
      setSharing(false);
    } else {
      try {
        if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getDisplayMedia) {
          const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
          standaloneScreenStreamRef.current = stream;
          if (screenVideoRef.current) screenVideoRef.current.srcObject = stream;
          stream.getVideoTracks()[0].onended = () => {
            setSharing(false);
            standaloneScreenStreamRef.current = null;
          };
          setSharing(true);
        }
      } catch {}
    }
  };

  useEffect(() => {
    return () => {
      standaloneScreenStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const filteredMessages = useMemo(() => {
    if (chatAudience === 'direct') {
      return chatLog.filter(m => Boolean(m.to_id));
    }
    return chatLog.filter(m => !m.to_id);
  }, [chatLog, chatAudience]);

  useEffect(() => {
    chatLogRef.current?.scrollTo({ top: chatLogRef.current.scrollHeight, behavior: 'smooth' });
  }, [filteredMessages]);

  const handleSend = async () => {
    const text = chatInput.trim();
    if (!text || chatSending) return;
    setChatInput('');
    const targetId = chatAudience === 'direct' ? (session?.instructor_id || 'instructor') : undefined;
    await onSendChat(text, targetId);
  };

  const toggleFullscreen = () => {
    if (!stageRef.current) return;
    if (!document.fullscreenElement) {
      stageRef.current.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const instInitials = initials(instructorName || 'Dr. Priya Sharma');
  const userInitials = initials(user?.full_name || 'You');

  return (
    <div className={styles.liveClassGridContainer}>
      {/* Main Content Area */}
      <div className={styles.mainContentFlexCol}>
        {roomTab === 'live_class' ? (
          <>
            {/* Top: Instructor Stage */}
            <div ref={stageRef} className={`${styles.instructorStageWrapper} ${isFullscreen ? styles.stageFullscreen : ''}`} style={{ flex: 1, minHeight: 280 }}>
              <div className={styles.stageHeader}>
                <div className={styles.stageHeaderLeft}>
                  <span className={styles.liveTagDot} />
                  <span className={styles.stageTitle}>Instructor's Presentation</span>
                  <span className={styles.instructorNamePill}>
                    <User size={13} />
                    <span>{instructorName}</span>
                  </span>
                </div>
                <div className={styles.stageHeaderRight}>
                  <span className={styles.liveAudioBadge}>
                    <Mic size={12} /> Audio Live
                  </span>
                  {isFullscreen && (
                    <button
                      className={styles.stageFsBtn}
                      onClick={() => setFitMode(m => m === 'contain' ? 'cover' : 'contain')}
                      title={fitMode === 'contain' ? 'Fill screen completely' : 'Fit original aspect ratio'}
                      style={{ width: 'auto', padding: '0 10px', fontSize: 11.5, fontWeight: 700 }}
                    >
                      {fitMode === 'contain' ? 'Fill Screen' : 'Fit Screen'}
                    </button>
                  )}
                  <button className={styles.stageFsBtn} onClick={toggleFullscreen} title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
                    {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  </button>
                </div>
              </div>

              <div className={styles.stageMediaBox} style={{ flex: 1, minHeight: 240, maxHeight: 'none' }}>
                <div className={styles.stagePlaceholder}>
                  <div className={styles.stageAvatarGlow}>
                    {instInitials}
                  </div>
                  <h3 className={styles.stagePlaceholderTitle}>
                    {instructorName} is conducting the live session
                  </h3>
                  <p className={styles.stagePlaceholderSub}>
                    Listening to instructor audio · Watching for screen share & demo
                  </p>
                  <div className={styles.audioWaveIndicator}>
                    <span /><span /><span /><span /><span />
                  </div>
                </div>
              </div>
            </div>

            {/* Vertical Splitter between Stage and Student Tile */}
            {!studentTileMinimized && (
              <div
                className={styles.verticalSplitResizer}
                onMouseDown={startResizeStudentTile}
                title="Drag to resize student preview"
              >
                <div className={styles.resizerGripH} />
              </div>
            )}

            {/* Bottom: Student Tile Preview + Controls */}
            {studentTileMinimized ? (
              <div className={styles.studentTileMinimized}>
                <div className={styles.studentTileMinimizedLeft}>
                  <span className={styles.studentTileDot} />
                  <span className={styles.studentTileMinimizedName}>
                    {user?.full_name || 'You'}
                    {sharing && <span className={styles.sharingLabel}> • Sharing Screen</span>}
                    {camOn && !sharing && <span className={styles.camLabel}> • Camera Active</span>}
                  </span>
                </div>
                <div className={styles.studentTileMinimizedActions}>
                  <button
                    className={`${styles.miniCtrlBtn} ${!micOn ? styles.miniCtrlDanger : ''}`}
                    onClick={() => setMicOn(!micOn)}
                    title={micOn ? 'Mute Microphone' : 'Unmute Microphone'}
                  >
                    {micOn ? <Mic size={13} /> : <MicOff size={13} />}
                  </button>
                  <button
                    className={`${styles.miniCtrlBtn} ${!camOn ? styles.miniCtrlDanger : ''}`}
                    onClick={() => setCamOn(!camOn)}
                    title={camOn ? 'Stop Video' : 'Start Video'}
                  >
                    {camOn ? <Video size={13} /> : <VideoOff size={13} />}
                  </button>
                  <button
                    className={`${styles.miniCtrlBtn} ${sharing ? styles.miniCtrlActive : ''}`}
                    onClick={toggleScreenShare}
                    title={sharing ? 'Stop Sharing' : 'Share Screen'}
                  >
                    {sharing ? <MonitorOff size={13} /> : <Monitor size={13} />}
                  </button>
                  <button
                    className={`${styles.miniCtrlBtn} ${handRaised ? styles.miniCtrlActive : ''}`}
                    onClick={() => setHandRaised(!handRaised)}
                    title={handRaised ? 'Lower Hand' : 'Raise Hand'}
                  >
                    <Hand size={13} />
                  </button>
                  <button
                    className={styles.miniExpandBtn}
                    onClick={() => setStudentTileMinimized(false)}
                    title="Expand Student Preview"
                  >
                    <ChevronUp size={13} />
                    <span>Expand</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.studentTileWrapper} style={{ height: studentTileHeight, minHeight: studentTileHeight }}>
                <div className={styles.studentTileMedia} style={{ flex: 1, minHeight: 0, maxHeight: 'none' }}>
                  {sharing ? (
                    <video
                      ref={screenVideoRef}
                      autoPlay
                      muted
                      playsInline
                      style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#09090b' }}
                    />
                  ) : camOn ? (
                    <video
                      ref={videoRef}
                      autoPlay
                      muted
                      playsInline
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div className={styles.studentTilePlaceholder}>
                      <div className={styles.studentTileAvatar}>
                        {userInitials}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span className={styles.studentTileName}>{user?.full_name || 'You'}</span>
                        <span style={{ fontSize: 11, color: '#9ca3af' }}>Your camera is off</span>
                      </div>
                    </div>
                  )}

                  <div className={styles.studentTileBadge}>
                    <span className={styles.studentTileDot} />
                    <span>{user?.full_name || 'You'}</span>
                    {sharing && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#22c55e', fontSize: 11, marginLeft: 4 }}>
                        <Monitor size={11} /> Sharing
                      </span>
                    )}
                    {!micOn && <MicOff size={12} color="#ef4444" />}
                  </div>
                </div>

                {/* Hover / Control Bar */}
                <div className={styles.conferenceControlsBar}>
                  <button
                    className={`${styles.ctrlCircleBtn} ${!micOn ? styles.ctrlDanger : ''}`}
                    onClick={() => setMicOn(!micOn)}
                    title={micOn ? 'Mute Microphone' : 'Unmute Microphone'}
                  >
                    {micOn ? <Mic size={15} /> : <MicOff size={15} />}
                    <span>{micOn ? 'Mute' : 'Unmute'}</span>
                  </button>

                  <button
                    className={`${styles.ctrlCircleBtn} ${!camOn ? styles.ctrlDanger : ''}`}
                    onClick={() => setCamOn(!camOn)}
                    title={camOn ? 'Stop Camera' : 'Start Camera'}
                  >
                    {camOn ? <Video size={15} /> : <VideoOff size={15} />}
                    <span>{camOn ? 'Stop Video' : 'Start Video'}</span>
                  </button>

                  <button
                    className={`${styles.ctrlCircleBtn} ${sharing ? styles.ctrlActive : ''}`}
                    onClick={toggleScreenShare}
                    title={sharing ? 'Stop Sharing' : 'Share Screen'}
                  >
                    {sharing ? <MonitorOff size={15} /> : <Monitor size={15} />}
                    <span>{sharing ? 'Stop Share' : 'Share Screen'}</span>
                  </button>

                  <button
                    className={`${styles.ctrlCircleBtn} ${handRaised ? styles.ctrlActive : ''}`}
                    onClick={() => setHandRaised(!handRaised)}
                    title={handRaised ? 'Lower Hand' : 'Raise Hand'}
                  >
                    <Hand size={15} />
                    <span>{handRaised ? 'Hand Raised' : 'Raise Hand'}</span>
                  </button>

                  <div style={{ position: 'relative' }}>
                    <button
                      className={styles.ctrlCircleBtn}
                      onClick={() => setShowReactions(r => !r)}
                      title="Share Reaction"
                    >
                      <Smile size={15} />
                      <span>Reaction</span>
                    </button>

                    {showReactions && (
                      <div className={styles.reactionPickerPopover}>
                        {['👍', '❤️', '👏', '✋', '🔥', '💡'].map(emoji => (
                          <button
                            key={emoji}
                            className={styles.emojiBtn}
                            onClick={() => {
                              onReaction(emoji);
                              setShowReactions(false);
                            }}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    className={styles.ctrlCircleBtn}
                    onClick={() => setStudentTileMinimized(true)}
                    title="Minimize Student Tile"
                  >
                    <ChevronDown size={15} />
                    <span>Minimize</span>
                  </button>

                  <button
                    className={`${styles.ctrlCircleBtn} ${styles.ctrlLeave}`}
                    onClick={onLeave}
                    title="Leave Live Session"
                  >
                    <PhoneOff size={15} />
                    <span>Leave</span>
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <ExperimentWorkbench
            expDetail={expDetail}
            expModules={expModules}
            expPages={expPages}
            expLoading={expLoading}
            sessionId={sessionId}
            experimentId={session?.experiment_id || ''}
            sessionTitleText={sessionTitleText}
            expFullscreen={expFullscreen}
            setExpFullscreen={setExpFullscreen}
            language={language}
            setLanguage={setLanguage}
            handleTab={handleTab}
            onSelfReportCheckpoint={onSelfReportCheckpoint}
            onCodeChange={onCodeChange}
          />
        )}
      </div>

      {/* Resizer Divider between Main Content and Right Sidebar */}
      {!sidebarMinimized && (
        <div
          className={styles.sidebarSplitResizer}
          onMouseDown={startResizeSidebar}
          title="Drag to resize sidebar"
        >
          <div className={styles.resizerGripV} />
        </div>
      )}

      {/* Right Column: Chat & Participants Sidebar (SAME IN BOTH LIVE CLASS & EXPERIMENT) */}
      <div
        className={`${styles.sessionRightSidebar} ${sidebarMinimized ? styles.sidebarMinimized : ''}`}
        style={{
          width: sidebarMinimized ? 48 : sidebarWidth,
          minWidth: sidebarMinimized ? 48 : sidebarWidth,
        }}
      >
        {sidebarMinimized ? (
          <div className={styles.sidebarMinimizedRail}>
            <button
              className={styles.sidebarExpandBtn}
              onClick={() => setSidebarMinimized(false)}
              title="Expand Sidebar"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              className={`${styles.railIconBtn} ${sidebarTab === 'chat' ? styles.railIconActive : ''}`}
              onClick={() => {
                setSidebarTab('chat');
                setSidebarMinimized(false);
              }}
              title={`Live Chat (${chatLog.length})`}
            >
              <MessageSquare size={16} />
              {chatLog.length > 0 && <span className={styles.railBadge}>{chatLog.length}</span>}
            </button>
            <button
              className={`${styles.railIconBtn} ${sidebarTab === 'participants' ? styles.railIconActive : ''}`}
              onClick={() => {
                setSidebarTab('participants');
                setSidebarMinimized(false);
              }}
              title="Participants (2)"
            >
              <Users size={16} />
              <span className={styles.railBadge}>2</span>
            </button>
          </div>
        ) : (
          <>
            <div className={styles.sidebarTabsRow}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  className={`${styles.sidebarTabButton} ${sidebarTab === 'chat' ? styles.sidebarTabActive : ''}`}
                  onClick={() => setSidebarTab('chat')}
                >
                  <MessageSquare size={15} />
                  <span>Live Chat ({chatLog.length})</span>
                </button>
                <button
                  className={`${styles.sidebarTabButton} ${sidebarTab === 'participants' ? styles.sidebarTabActive : ''}`}
                  onClick={() => setSidebarTab('participants')}
                >
                  <Users size={15} />
                  <span>Participants (2)</span>
                </button>
              </div>
              <button
                className={styles.sidebarMinimizeBtn}
                onClick={() => setSidebarMinimized(true)}
                title="Minimize Sidebar"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {sidebarTab === 'chat' ? (
              <>
                <div className={styles.chatAudiencePills}>
                  <button
                    className={`${styles.chatAudienceBtn} ${chatAudience === 'everyone' ? styles.chatAudienceActive : ''}`}
                    onClick={() => setChatAudience('everyone')}
                  >
                    <Users size={13} />
                    <span>Group (Everyone)</span>
                  </button>
                  <button
                    className={`${styles.chatAudienceBtn} ${chatAudience === 'direct' ? styles.chatAudienceActive : ''}`}
                    onClick={() => setChatAudience('direct')}
                  >
                    <Lock size={13} />
                    <span>Direct (Instructor)</span>
                  </button>
                </div>

                {chatAudience === 'direct' && (
                  <div className={styles.directChatBanner}>
                    <Lock size={12} />
                    <span>Private 1:1 conversation with {instructorName}</span>
                  </div>
                )}

                <div ref={chatLogRef} className={styles.chatMessagesStream}>
                  {filteredMessages.length === 0 ? (
                    <div className={styles.emptyChatBox}>
                      <MessageSquare size={24} color="#a1a1aa" />
                      <p className={styles.emptyChatTitle}>No messages yet</p>
                      <p className={styles.emptyChatSub}>
                        {chatAudience === 'direct'
                          ? 'Send a private question or clarification to your instructor.'
                          : 'Say hello to your instructor and classmates!'}
                      </p>
                    </div>
                  ) : (
                    filteredMessages.map((m: ChatMessagePayload, idx: number) => {
                      const own = m.from_id === user?.id || m.from_name === user?.full_name;
                      const isInst =
                        (m.from_name || '').includes('Dr.') ||
                        (m.from_name || '').includes('Instructor');
                      const msgInitials = initials(m.from_name || (own ? 'You' : 'Student'));
                      return (
                        <div
                          key={m.id || idx}
                          className={`${styles.chatMessageRow} ${own ? styles.chatMessageOwn : ''}`}
                        >
                          <div
                            className={styles.chatAvatarBubble}
                            style={{
                              background: own ? '#7c3aed' : isInst ? '#9333ea' : '#3b82f6',
                            }}
                          >
                            {msgInitials}
                          </div>
                          <div className={styles.chatMsgBody}>
                            <div className={styles.chatMsgHeader}>
                              <span className={styles.chatSenderName}>
                                {own ? 'You' : m.from_name || 'Student'}
                              </span>
                              {isInst && (
                                <span className={styles.instructorBadgeTag}>Instructor</span>
                              )}
                              <span className={styles.chatTimestamp}>{formatChatTime(m.at)}</span>
                            </div>
                            <div
                              className={`${styles.chatTextContent} ${own ? styles.chatTextOwn : ''}`}
                            >
                              {m.text}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className={styles.chatInputWrap}>
                  <input
                    type="text"
                    className={styles.chatInputField}
                    placeholder={
                      chatAudience === 'direct'
                        ? `Message ${instructorName} privately…`
                        : 'Message everyone in class…'
                    }
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className={styles.chatSendIconButton}
                    onClick={handleSend}
                    disabled={chatSending || !chatInput.trim()}
                  >
                    {chatSending ? (
                      <Loader2 size={13} className={styles.spinner} />
                    ) : (
                      <Send size={14} />
                    )}
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.chatMessagesStream}>
                <div className={styles.participantItem}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className={styles.chatAvatarBubble} style={{ background: '#7c3aed' }}>
                      {instInitials}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                        {instructorName}
                      </span>
                      <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>
                        Instructor • Host
                      </span>
                    </div>
                  </div>
                  <button
                    className={styles.dmInstBtn}
                    onClick={() => {
                      setChatAudience('direct');
                      setSidebarTab('chat');
                    }}
                  >
                    Message
                  </button>
                </div>

                <div className={styles.participantItem}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className={styles.chatAvatarBubble} style={{ background: '#3b82f6' }}>
                      {userInitials}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                        {user?.full_name || 'You'} (You)
                      </span>
                      <span style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>
                        Online • Student
                      </span>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: '#059669', fontWeight: 700 }}>Active</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

