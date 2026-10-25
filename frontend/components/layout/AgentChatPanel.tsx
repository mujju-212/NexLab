'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Sparkles,
  Bot,
  Send,
  X,
  Maximize2,
  Minimize2,
  History,
  FileText,
  Globe,
  Upload,
  Check,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Calendar,
  UserPlus,
  Users,
  Building2,
  BookOpen,
  Plus,
  ExternalLink,
  Pin,
  PinOff,
  Pencil,
  ShieldCheck,
  Clock,
  Download,
  Code2,
  GraduationCap,
  TrendingUp,
  FlaskConical,
} from 'lucide-react';
import {
  aiService,
  type HarnessChatSession,
  type HarnessChatMessage,
  type HarnessDocument,
  type HarnessGeneratedDoc,
} from '@/services/ai.service';
import { useAuthStore } from '@/store/auth-store';
import styles from './copilot.module.css';

/* ── Rich Action Configuration Map ── */
interface ActionMeta {
  label: string;
  badge: string;
  icon: React.ReactNode;
}

const ACTION_CONFIG: Record<string, ActionMeta> = {
  assign_subject_to_section: {
    label: 'Assign Subject to Section',
    badge: 'Curriculum',
    icon: <BookOpen size={15} color="#7c3aed" />,
  },
  update_user_token_quota: {
    label: 'Update User AI Token Quota',
    badge: 'AI Limits',
    icon: <Sparkles size={15} color="#059669" />,
  },
  update_ai_governance: {
    label: 'Update AI Governance Policy',
    badge: 'Governance',
    icon: <ShieldCheck size={15} color="#d97706" />,
  },
  reschedule_or_cancel_session: {
    label: 'Reschedule / Cancel Lab Session',
    badge: 'Timetable',
    icon: <Clock size={15} color="#ea580c" />,
  },
  schedule_lab_session: {
    label: 'Book Lab Session',
    badge: 'Timetable',
    icon: <Calendar size={15} color="#7c3aed" />,
  },
  create_user: {
    label: 'Create User Account',
    badge: 'Identity',
    icon: <UserPlus size={15} color="#2563eb" />,
  },
  update_user_status: {
    label: 'Update User Status / Role',
    badge: 'Identity',
    icon: <Users size={15} color="#4f46e5" />,
  },
  create_academic_department: {
    label: 'Create Academic Department',
    badge: 'Structure',
    icon: <Building2 size={15} color="#0891b2" />,
  },
  create_academic_section: {
    label: 'Create Academic Section',
    badge: 'Structure',
    icon: <Building2 size={15} color="#0891b2" />,
  },
  broadcast_announcement: {
    label: 'Broadcast Announcement',
    badge: 'Broadcast',
    icon: <Sparkles size={15} color="#9333ea" />,
  },
  draft_announcement: {
    label: 'Broadcast Announcement',
    badge: 'Broadcast',
    icon: <Sparkles size={15} color="#9333ea" />,
  },
  instructor_create_experiment: {
    label: 'Create Lab Experiment',
    badge: 'Experiment Authoring',
    icon: <FlaskConical size={15} color="#7c3aed" />,
  },
  instructor_add_test_cases: {
    label: 'Attach AI-Generated Test Cases',
    badge: 'Test Suite',
    icon: <Code2 size={15} color="#059669" />,
  },
  instructor_create_quiz_module: {
    label: 'Create Pre-Lab Quiz Module',
    badge: 'Assessment',
    icon: <BookOpen size={15} color="#2563eb" />,
  },
  instructor_create_checkpoints: {
    label: 'Configure SPARK Checkpoints',
    badge: 'SPARK Pacing',
    icon: <TrendingUp size={15} color="#7c3aed" />,
  },
  instructor_live_session_control: {
    label: 'Live Session Conductor Control',
    badge: 'Live Classroom',
    icon: <Clock size={15} color="#ea580c" />,
  },
  instructor_bulk_autograde: {
    label: 'Bulk Auto-Grade Experiment Submissions',
    badge: 'Grading',
    icon: <GraduationCap size={15} color="#059669" />,
  },
  instructor_grant_extension: {
    label: 'Grant Student Deadline Extension',
    badge: 'Relief',
    icon: <Calendar size={15} color="#0891b2" />,
  },
  instructor_log_intervention: {
    label: 'Record At-Risk Student Intervention',
    badge: 'Mentoring',
    icon: <Users size={15} color="#9333ea" />,
  },
  admin_create_academic_year: {
    label: 'Create Academic Year',
    badge: 'Academic Setup',
    icon: <Calendar size={15} color="#7c3aed" />,
  },
  admin_create_batch: {
    label: 'Create Student Batch',
    badge: 'Academic Setup',
    icon: <Users size={15} color="#2563eb" />,
  },
  admin_create_subject: {
    label: 'Create Curriculum Subject',
    badge: 'Catalog',
    icon: <BookOpen size={15} color="#059669" />,
  },
  admin_bulk_enroll_students: {
    label: 'Bulk Enroll Students into Section',
    badge: 'Enrollment',
    icon: <UserPlus size={15} color="#4f46e5" />,
  },
  admin_force_logout: {
    label: 'Force Revoke Active JWT Sessions',
    badge: 'Security',
    icon: <ShieldCheck size={15} color="#dc2626" />,
  },
  platform_provision_institution: {
    label: 'Provision New Institution Tenant',
    badge: 'Multi-Tenant',
    icon: <Building2 size={15} color="#7c3aed" />,
  },
  platform_update_tenant: {
    label: 'Update Institution Plan & Seat Cap',
    badge: 'Subscription',
    icon: <Building2 size={15} color="#059669" />,
  },
  platform_update_config: {
    label: 'Update Platform Configuration',
    badge: 'Platform Governance',
    icon: <ShieldCheck size={15} color="#dc2626" />,
  },
};

/* ── Role-Specific Branding & Prompt Suggestions ── */
interface RoleHarnessConfig {
  title: string;
  badgeText: string;
  launcherLabel: string;
  supportsAgentMode: boolean;
  socraticProtected: boolean;
  chatSubtitle: string;
  agentSubtitle: string;
  emptyChatTitle: string;
  emptyChatSub: string;
  emptyAgentTitle: string;
  emptyAgentSub: string;
  chatPlaceholder: string;
  agentPlaceholder: string;
  chatSuggestions: Array<{ icon: React.ReactNode; text: string }>;
  agentSuggestions: Array<{ icon: React.ReactNode; text: string }>;
}

const ROLE_CONFIGS: Record<string, RoleHarnessConfig> = {
  student: {
    title: 'NexLab Socratic AI',
    badgeText: 'Socratic Tutor',
    launcherLabel: 'Ask Socratic Tutor',
    supportsAgentMode: false,
    socraticProtected: true,
    chatSubtitle: '3-Level Hints · Code & Error Help · Self-Analytics',
    agentSubtitle: 'Study Sheet & Practice Builder',
    emptyChatTitle: 'Your Socratic Lab Tutor & Study Companion',
    emptyChatSub:
      'Get progressive hints without spoiling solutions, understand compiler errors, check your grades/attendance/SPARK score, or generate study sheets.',
    emptyAgentTitle: 'Study Sheet & Revision Generator',
    emptyAgentSub: 'Generate downloadable study sheets, flashcards, and practice recommendations.',
    chatPlaceholder: 'Ask for a hint on your code, explain an error, check your grades/attendance, or generate a study sheet...',
    agentPlaceholder: 'Ask to generate a study sheet or recommend practice problems...',
    chatSuggestions: [
      { icon: <Code2 size={13} />, text: 'Give me a Level 1 Socratic hint for my current lab code' },
      { icon: <Sparkles size={13} />, text: '/collection Build a 5-problem practice playlist in my account for my weakest topics' },
      { icon: <BookOpen size={13} />, text: '/playground Create a saved Python playground workspace for Two Pointers & Sliding Window' },
      { icon: <FileText size={13} />, text: '/studyplan Enroll me in a study plan and generate a 7-day revision sheet & flashcards' },
    ],
    agentSuggestions: [],
  },
  platform_user: {
    title: 'NexLab Coding Coach',
    badgeText: 'Self-Learner AI',
    launcherLabel: 'Ask AI Coach',
    supportsAgentMode: false,
    socraticProtected: true,
    chatSubtitle: 'Socratic Practice Coach · Skill Gaps · Study Plans',
    agentSubtitle: 'Study Plan Generator',
    emptyChatTitle: 'Your Personal Socratic Coding Coach',
    emptyChatSub:
      'Analyze your practice submissions, diagnose weak algorithm topics, get progressive hints without spoilers, and build custom study plans.',
    emptyAgentTitle: 'Personalized Study Plan Builder',
    emptyAgentSub: 'Create multi-day coding roadmaps and cheat sheets.',
    chatPlaceholder: 'Ask about your practice stats, get a Socratic hint, or generate a 7-day study plan...',
    agentPlaceholder: 'Generate a study plan...',
    chatSuggestions: [
      { icon: <Sparkles size={13} />, text: '/collection Build a custom 5-problem playlist & bookmarks for my weakest topics' },
      { icon: <Code2 size={13} />, text: '/playground Create a saved Python playground session for Dynamic Programming' },
      { icon: <Calendar size={13} />, text: '/studyplan Enroll me in a study plan and build a 7-day coding roadmap' },
      { icon: <TrendingUp size={13} />, text: 'Show my solved practice stats, XP, and weakest algorithm topics' },
    ],
    agentSuggestions: [],
  },
  instructor: {
    title: 'NexLab Teaching Copilot',
    badgeText: 'v2.0 Instructor',
    launcherLabel: 'Teaching Copilot',
    supportsAgentMode: true,
    socraticProtected: false,
    chatSubtitle: 'Section Analytics · Error Clustering · At-Risk Detection',
    agentSubtitle: 'Experiment Authoring · Section Reports',
    emptyChatTitle: 'Section-Scoped Teaching & Lab Intelligence',
    emptyChatSub:
      'Analyze grades and attendance across your assigned sections, cluster common student code errors, identify at-risk students, or export reports.',
    emptyAgentTitle: 'Autonomous Experiment Authoring & Actions',
    emptyAgentSub: 'Propose and create new lab experiments with starter code or export section gradebooks.',
    chatPlaceholder: 'Ask about your assigned sections, at-risk students, common code errors, or export a section report...',
    agentPlaceholder: 'Instruct: e.g. "Create a new Python experiment on Binary Search Trees"...',
    chatSuggestions: [
      { icon: <FlaskConical size={13} />, text: '/experiment Create a complete experiment on "Binary Search Tree Operations" with interactive HTML visualizer, quiz, viva, test cases & SPARK checkpoints' },
      { icon: <BookOpen size={13} />, text: '/exam Create and publish a 45-minute mixed MCQ + Coding exam for my subject' },
      { icon: <GraduationCap size={13} />, text: '/autograde Auto-grade and publish all student submissions for my latest experiment' },
      { icon: <TrendingUp size={13} />, text: 'Show grade, attendance, and common submission error clusters across my sections' },
    ],
    agentSuggestions: [
      { icon: <FlaskConical size={13} />, text: '/experiment Build a complete experiment on "Stack & Queue Visualizer" with interactive HTML simulation, quiz, viva, test cases & checkpoints' },
      { icon: <Code2 size={13} />, text: 'Add an interactive HTML simulation block to my latest experiment and republish' },
      { icon: <BookOpen size={13} />, text: '/exam Create a 45-minute Mid-Sem Exam with 3 MCQs and 1 coding question' },
      { icon: <GraduationCap size={13} />, text: '/autograde Auto-grade all submissions for my latest experiment and grant a 3-day extension to struggling students' },
    ],
  },
  institution_admin: {
    title: 'NexLab AI Copilot',
    badgeText: 'v2.0 Admin',
    launcherLabel: 'Ask AI Copilot',
    supportsAgentMode: true,
    socraticProtected: false,
    chatSubtitle: '7-Domain Analytics · RAG Docs · Web Search',
    agentSubtitle: 'Autonomous Scheduling, Provisioning & Governance',
    emptyChatTitle: 'Ask Anything Across Your Institution',
    emptyChatSub:
      'Instant answers on sessions, instructor timetables, 7-domain analytics (Grades, Attendance, SPARK, AI Usage), or uploaded documents.',
    emptyAgentTitle: 'Autonomous Action Execution',
    emptyAgentSub:
      'Schedule lab sessions, create students/instructors, update token quotas, configure departments, and broadcast announcements.',
    chatPlaceholder: "Ask about today's sessions, instructors, 7-domain analytics, AI tokens, or attached documents...",
    agentPlaceholder: 'Instruct: e.g. "Schedule Python Lab for Section A tomorrow 10am" or "Create student..."',
    chatSuggestions: [
      { icon: <Sparkles size={13} />, text: '/setup Set up 2026-2027 CSE Department, CSE 2nd Year Batch, Sections A & B, Data Structures Lab, assign instructor, enroll students & schedule 8 weeks of sessions' },
      { icon: <Calendar size={13} />, text: '/schedule Create a recurring Tue/Thu 10:00 AM timetable for Section A across 8 weeks' },
      { icon: <TrendingUp size={13} />, text: 'Audit our academic catalog for unassigned subjects and show 7-domain analytics' },
      { icon: <FileText size={13} />, text: '/report Generate a NAAC/NBA Course Outcome attainment report in CSV' },
    ],
    agentSuggestions: [
      { icon: <Sparkles size={13} />, text: '/setup Execute full setup: CSE Dept, 2nd Year Batch, Sections A & B, Data Structures & OS Labs, enroll students & generate weekly sessions' },
      { icon: <Building2 size={13} />, text: 'Create a new subject "Compiler Design Lab" (code CS304L) and assign it to Section A' },
      { icon: <UserPlus size={13} />, text: 'Create a new instructor Dr. Vikram Nair (vikram@campus.edu) in CSE and assign to Section B' },
      { icon: <Calendar size={13} />, text: '/schedule Schedule weekly Tue/Thu 10 AM lab sessions for Section A for the next 8 weeks' },
    ],
  },
  admin: {
    title: 'NexLab Platform Copilot',
    badgeText: 'Super Admin',
    launcherLabel: 'Platform Copilot',
    supportsAgentMode: true,
    socraticProtected: false,
    chatSubtitle: 'Cross-Tenant Telemetry · Global AI Usage · Health',
    agentSubtitle: 'Global PlatformConfig & Tenant Governance',
    emptyChatTitle: 'Cross-Tenant Platform Operations',
    emptyChatSub: 'Inspect all institutions, active users by role, global AI token burn, and platform flags.',
    emptyAgentTitle: 'Platform Governance Actions',
    emptyAgentSub: 'Propose and confirm updates to global PlatformConfig settings.',
    chatPlaceholder: 'Ask about total institutions, global AI token usage, or platform settings...',
    agentPlaceholder: 'Instruct: e.g. "Propose updating platform config ai_hints_enabled to true"...',
    chatSuggestions: [
      { icon: <Building2 size={13} />, text: 'Show global platform overview, user counts by role, and today’s AI token usage' },
      { icon: <Users size={13} />, text: 'List all institutions on the platform with their plan and user count' },
    ],
    agentSuggestions: [
      { icon: <ShieldCheck size={13} />, text: 'Propose updating PlatformConfig key ai_hints_enabled to true' },
    ],
  },
};

export interface AgentChatPanelProps {
  roleOverride?: string;
  pageContext?: Record<string, any>;
}

export default function AgentChatPanel({ roleOverride, pageContext }: AgentChatPanelProps = {}) {
  const pathname = usePathname();
  const { user } = useAuthStore();

  // Resolve effective role from prop -> authStore -> URL path
  const effectiveRole = useMemo(() => {
    if (roleOverride) return roleOverride;
    if (user?.role) return user.role;
    if (pathname?.startsWith('/student')) return 'student';
    if (pathname?.startsWith('/practice')) return 'platform_user';
    if (pathname?.startsWith('/instructor')) return 'instructor';
    if (pathname?.startsWith('/admin')) return 'admin';
    return 'institution_admin';
  }, [roleOverride, user?.role, pathname]);

  const roleCfg = ROLE_CONFIGS[effectiveRole] || ROLE_CONFIGS.institution_admin;

  const [open, setOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [mode, setMode] = useState<'chat' | 'agent'>('chat');

  // Ensure student / platform_user stay in 'chat' mode
  useEffect(() => {
    if (!roleCfg.supportsAgentMode && mode !== 'chat') {
      setMode('chat');
    }
  }, [roleCfg.supportsAgentMode, mode]);

  // Conversation Threads & Messages
  const [sessions, setSessions] = useState<HarnessChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showHistorySidebar, setShowHistorySidebar] = useState(false);
  const [messages, setMessages] = useState<HarnessChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Session memory per mode so Knowledge & Analytics and Agent & Action Mode don't collide
  const activeSessionByMode = useRef<{ chat: string | null; agent: string | null }>({
    chat: null,
    agent: null,
  });
  const [historyFilter, setHistoryFilter] = useState<'all' | 'chat' | 'agent'>('all');

  // Composer State
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [thinkingPhase, setThinkingPhase] = useState(0);

  // Cycle reasoning phases smoothly while busy
  useEffect(() => {
    if (!busy) {
      setThinkingPhase(0);
      return;
    }
    const timer = setInterval(() => {
      setThinkingPhase(p => (p + 1) % 3);
    }, 2600);
    return () => clearInterval(timer);
  }, [busy]);

  // Documents & RAG
  const [documents, setDocuments] = useState<HarnessDocument[]>([]);
  const [attachedDoc, setAttachedDoc] = useState<HarnessDocument | null>(null);
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Actions Execution & File Download
  const [executingActionId, setExecutingActionId] = useState<string | null>(null);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const activeSessionIdRef = useRef<string | null>(null);

  // Build live page_context payload from current route + optional prop
  const livePageContext = useMemo(() => {
    const ctx: Record<string, any> = {
      route: pathname || '/',
      ...(pageContext || {}),
    };
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('experiment_id')) ctx.experiment_id = sp.get('experiment_id');
      if (sp.get('session_id')) ctx.session_id = sp.get('session_id');
      if (sp.get('section_id')) ctx.section_id = sp.get('section_id');
    }
    const parts = (pathname || '').split('/').filter(Boolean);
    if (parts[0] === 'practice' && parts[1] === 'library' && parts[2]) {
      ctx.problem_slug = parts[2];
    } else if (parts[0] === 'student' && parts[1] === 'practice' && parts[2]) {
      ctx.problem_slug = parts[2];
    }
    return ctx;
  }, [pathname, pageContext]);

  // Auto-scroll on messages change
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  // ── Keyboard shortcut: Ctrl+K or Ctrl+/ to toggle AI Harness ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.key === '/')) {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Detect if any modal or drawer overlay is active in the page to prevent obstructing modal actions
  const [hasActiveOverlay, setHasActiveOverlay] = useState(false);

  useEffect(() => {
    const checkOverlays = () => {
      if (typeof document === 'undefined') return;
      const elements = document.querySelectorAll(
        '[class*="drawerOverlay"], [class*="modalOverlay"], [class*="confirmOverlay"], [class*="aiOverlay"], [class*="certModalOverlay"], [class*="drawerBackdrop"], [data-modal-overlay="true"], [role="dialog"], [aria-modal="true"]'
      );
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        if (el.closest('[class*="copilotContainer"]')) continue;
        const style = window.getComputedStyle(el);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          setHasActiveOverlay(true);
          return;
        }
      }
      setHasActiveOverlay(false);
    };

    checkOverlays();

    const t1 = setTimeout(checkOverlays, 60);
    const t2 = setTimeout(checkOverlays, 200);

    const observer = new MutationObserver(() => {
      checkOverlays();
      setTimeout(checkOverlays, 60);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });

    window.addEventListener('animationend', checkOverlays);
    window.addEventListener('transitionend', checkOverlays);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      observer.disconnect();
      window.removeEventListener('animationend', checkOverlays);
      window.removeEventListener('transitionend', checkOverlays);
    };
  }, [pathname]);

  // Load sessions and documents when opened
  useEffect(() => {
    if (open) {
      loadSessions(true);
      loadDocuments();
    }
  }, [open]);

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  const loadSessions = async (autoSelectFirst = false) => {
    try {
      const list = await aiService.listHarnessSessions();
      setSessions(list);
      if (autoSelectFirst && list.length > 0 && !activeSessionIdRef.current) {
        const match = list.find(s => (s.mode || 'chat') === mode) || list[0];
        selectSession(match.id);
      }
    } catch (err) {
      console.error('Failed to load AI harness sessions', err);
    }
  };

  const loadDocuments = async () => {
    try {
      const docs = await aiService.listHarnessDocuments();
      setDocuments(docs);
    } catch (err) {
      console.error('Failed to load RAG documents', err);
    }
  };

  const selectSession = async (sessionId: string, explicitMode?: 'chat' | 'agent') => {
    activeSessionIdRef.current = sessionId;
    setActiveSessionId(sessionId);
    setLoadingMessages(true);
    try {
      const data = await aiService.getHarnessSession(sessionId);
      setMessages(data.messages || []);
      const sessionMode = explicitMode || (data.session?.mode as 'chat' | 'agent') || 'chat';
      if (roleCfg.supportsAgentMode) {
        setMode(sessionMode);
        activeSessionByMode.current[sessionMode] = sessionId;
      } else {
        activeSessionByMode.current['chat'] = sessionId;
      }
    } catch (err) {
      console.error('Failed to load session messages', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const startNewConversation = () => {
    activeSessionByMode.current[mode] = null;
    activeSessionIdRef.current = null;
    setActiveSessionId(null);
    setMessages([]);
    setShowHistorySidebar(false);
  };

  const handleModeSwitch = async (newMode: 'chat' | 'agent') => {
    if (newMode === mode) return;
    // Save current active session for the outgoing mode
    activeSessionByMode.current[mode] = activeSessionId;
    setMode(newMode);

    // Look up remembered session for incoming mode
    const targetId = activeSessionByMode.current[newMode];
    if (targetId && sessions.some(s => s.id === targetId)) {
      await selectSession(targetId, newMode);
    } else {
      // Find the most recent session created in this mode
      const recent = sessions.find(s => (s.mode || 'chat') === newMode);
      if (recent) {
        await selectSession(recent.id, newMode);
      } else {
        // Clean slate for new mode so the user sees tailored suggestions
        activeSessionIdRef.current = null;
        setActiveSessionId(null);
        setMessages([]);
      }
    }
  };

  const deleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    try {
      await aiService.deleteHarnessSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (activeSessionByMode.current.chat === sessionId) activeSessionByMode.current.chat = null;
      if (activeSessionByMode.current.agent === sessionId) activeSessionByMode.current.agent = null;
      if (activeSessionIdRef.current === sessionId) {
        startNewConversation();
      }
    } catch (err) {
      console.error('Failed to delete session', err);
    }
  };

  const togglePin = async (e: React.MouseEvent, session: HarnessChatSession) => {
    e.stopPropagation();
    try {
      const updated = await aiService.updateHarnessSession(session.id, { is_pinned: !session.is_pinned });
      setSessions(prev =>
        prev
          .map(s => (s.id === session.id ? { ...s, is_pinned: updated.is_pinned } : s))
          .sort(
            (a, b) =>
              (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0) ||
              new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          )
      );
    } catch (err) {
      console.error('Failed to toggle pin', err);
    }
  };

  const startRename = (e: React.MouseEvent, session: HarnessChatSession) => {
    e.stopPropagation();
    setRenamingId(session.id);
    setRenameText(session.title);
  };

  const commitRename = async (sessionId: string) => {
    const trimmed = renameText.trim();
    if (!trimmed) {
      setRenamingId(null);
      return;
    }
    try {
      const updated = await aiService.updateHarnessSession(sessionId, { title: trimmed });
      setSessions(prev => prev.map(s => (s.id === sessionId ? { ...s, title: updated.title } : s)));
    } catch (err) {
      console.error('Failed to rename session', err);
    } finally {
      setRenamingId(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    const allowed = ['.pdf', '.docx', '.xlsx', '.csv', '.md', '.txt'];
    if (!allowed.some(ext => lower.endsWith(ext))) {
      alert(`Supported document formats: ${allowed.join(', ')}`);
      return;
    }

    setUploadingDoc(true);
    try {
      const res = await aiService.uploadHarnessDocument(file);
      setDocuments(prev => [res.document, ...prev]);
      setAttachedDoc(res.document);
      setShowDocsModal(false);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to upload and index document.');
    } finally {
      setUploadingDoc(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    try {
      await aiService.deleteHarnessDocument(docId);
      setDocuments(prev => prev.filter(d => d.id !== docId));
      if (attachedDoc?.id === docId) {
        setAttachedDoc(null);
      }
    } catch (err) {
      console.error('Failed to delete document', err);
    }
  };

  const handleDownloadGeneratedDoc = async (doc: HarnessGeneratedDoc) => {
    setDownloadingDocId(doc.id);
    try {
      await aiService.downloadGeneratedDocument(doc.id, `${doc.title}.${doc.format}`);
    } catch (err) {
      console.error('Failed to download generated document', err);
    } finally {
      setDownloadingDocId(null);
    }
  };

  const sendMessage = useCallback(
    async (customPrompt?: string) => {
      const text = (customPrompt ?? input).trim();
      if (!text || busy) return;

      setInput('');
      const tempUserMsg: HarnessChatMessage = {
        id: `tmp-${Date.now()}`,
        session_id: activeSessionId || 'pending',
        role: 'user',
        content: text,
        mode,
        created_at: new Date().toISOString(),
      };

      setMessages(prev => [...prev, tempUserMsg]);
      setBusy(true);

      try {
        const res = await aiService.sendHarnessMessage({
          prompt: text,
          mode: roleCfg.supportsAgentMode ? mode : 'chat',
          session_id: activeSessionId || undefined,
          doc_id: attachedDoc?.id,
          web_search: webSearch,
          page_context: livePageContext,
        });

        const targetSessionId = res.session_id || activeSessionIdRef.current;
        if (targetSessionId) {
          activeSessionIdRef.current = targetSessionId;
          setActiveSessionId(targetSessionId);
          activeSessionByMode.current[mode] = targetSessionId;
          if (res.session_title) {
            setSessions(prev =>
              prev.map(s =>
                s.id === targetSessionId
                  ? { ...s, title: res.session_title, updated_at: new Date().toISOString() }
                  : s
              )
            );
          }
          loadSessions(false);
        }

        setMessages(prev => {
          const withoutTemp = prev.filter(m => m.id !== tempUserMsg.id);
          return [...withoutTemp, res.user_message, res.assistant_message];
        });
      } catch (err: any) {
        const isTimeout = err?.code === 'ECONNABORTED' || err?.message?.toLowerCase().includes('timeout');
        const errorMsg =
          err?.response?.status === 403
            ? 'AI assistance is currently disabled by institution governance policy.'
            : err?.response?.status === 429
            ? 'Daily AI token limit reached. Resets at midnight UTC.'
            : isTimeout
            ? 'The AI assistant took longer than expected. Click this thread in History in a moment to view the completed response.'
            : err?.response?.data?.error || 'Could not communicate with the AI assistant.';

        setMessages(prev => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            session_id: activeSessionId || '',
            role: 'system',
            content: `⚠️ ${errorMsg}`,
            mode,
            created_at: new Date().toISOString(),
          },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [input, busy, activeSessionId, mode, attachedDoc, webSearch, roleCfg.supportsAgentMode, livePageContext]
  );

  const confirmAction = async (msg: HarnessChatMessage) => {
    if (!msg.pending_action) return;
    setExecutingActionId(msg.id);

    try {
      const res = await aiService.executeHarnessAction({
        action_payload: msg.pending_action,
        message_id: msg.id,
      });

      // Build a full, chat-style answer from the execution result instead of a
      // single "done" line — the agent should report outcomes with the same
      // richness as chat-mode replies.
      const formatActionResult = (result: any): string => {
        if (!result) return 'Done.';
        const skip = new Set(['success', 'message', 'found_error']);
        const isIdKey = (k: string) => k === 'id' || k.endsWith('_id') || k.endsWith('_path') || k.endsWith('_count');
        const lines: string[] = [];
        if (result.message) lines.push(String(result.message));
        for (const [k, v] of Object.entries(result)) {
          if (skip.has(k) || isIdKey(k) || v == null || v === '') continue;
          const label = k.replace(/_/g, ' ');
          if (Array.isArray(v)) {
            if (!v.length) continue;
            const titles = v
              .slice(0, 5)
              .map((it: any) => (typeof it === 'string' ? it : it?.title || it?.name || it?.label))
              .filter(Boolean);
            lines.push(`- **${label}:** ${titles.length ? titles.join(', ') : `${v.length} item(s)`}`);
          } else if (typeof v === 'object') {
            const t = (v as any).title || (v as any).name;
            if (t) lines.push(`- **${label}:** ${t}`);
          } else {
            lines.push(`- **${label}:** ${String(v).slice(0, 200)}`);
          }
        }
        return lines.length ? lines.join('\n') : 'Done.';
      };

      setMessages(prev =>
        prev.map(m =>
          m.id === msg.id
            ? {
                ...m,
                applied: true,
                pending_action: null,
                content: `${m.content}\n\n---\n\n**✓ Action Executed**\n\n${formatActionResult(res.result)}`,
              }
            : m
        )
      );
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Action execution failed.');
    } finally {
      setExecutingActionId(null);
    }
  };

  const cancelAction = (msgId: string) => {
    setMessages(prev =>
      prev.map(m =>
        m.id === msgId
          ? {
              ...m,
              pending_action: null,
              content: `${m.content}\n\n*(Action proposal dismissed)*`,
            }
          : m
      )
    );
  };

  const sortedSessions = useMemo(() => {
    return [...sessions].sort(
      (a, b) =>
        (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0) ||
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    if (historyFilter === 'all') return sortedSessions;
    return sortedSessions.filter(s => (s.mode || 'chat') === historyFilter);
  }, [sortedSessions, historyFilter]);

  const activeSuggestions =
    mode === 'agent' && roleCfg.supportsAgentMode ? roleCfg.agentSuggestions : roleCfg.chatSuggestions;

  return (
    <div className={`${styles.copilotContainer} ${open ? styles.copilotContainerOpen : ''}`}>
      {/* ── Floating Launcher (avatar-style) ── */}
      {!open && !hasActiveOverlay && (
        <button
          onClick={() => setOpen(true)}
          className={styles.launcherBtn}
          aria-label={`Open ${roleCfg.launcherLabel}`}
          title={`${roleCfg.launcherLabel} — Ctrl+K`}
        >
          <Bot size={26} strokeWidth={2} />
          <span className={styles.pulseDot} />
        </button>
      )}

      {/* ── Main Copilot / Harness Window ── */}
      {open && (
        <div className={`${styles.panelWindow} ${isExpanded ? styles.expandedWindow : styles.compactWindow}`}>
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerTop}>
              <div className={styles.brandIcon}>
                <Bot size={19} strokeWidth={2.2} />
              </div>
              <div className={styles.titleArea}>
                <div className={styles.title}>
                  <span>{roleCfg.title}</span>
                  <span className={styles.badgeEnterprise}>{roleCfg.badgeText}</span>
                </div>
                <div className={styles.subtitle}>
                  {mode === 'chat' ? roleCfg.chatSubtitle : roleCfg.agentSubtitle}
                  <span style={{ marginLeft: 8, opacity: 0.6, fontSize: 10, fontFamily: 'monospace' }}>
                    Ctrl+K
                  </span>
                </div>
              </div>

              <div className={styles.headerActions}>
                <button
                  onClick={() => setShowHistorySidebar(!showHistorySidebar)}
                  className={`${styles.iconBtn} ${showHistorySidebar ? styles.activeIconBtn : ''}`}
                  title="Conversation History"
                >
                  <History size={16} />
                </button>
                <button
                  onClick={() => setShowDocsModal(true)}
                  className={`${styles.iconBtn} ${attachedDoc ? styles.activeIconBtn : ''}`}
                  title="RAG Document Library (.pdf, .docx, .xlsx, .csv, .md)"
                >
                  <FileText size={16} />
                </button>
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className={styles.iconBtn}
                  title={isExpanded ? 'Compact View' : 'Expand Studio'}
                >
                  {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
                <button onClick={() => setOpen(false)} className={styles.iconBtn} title="Close">
                  <X size={17} />
                </button>
              </div>
            </div>

            {/* Mode Switcher Tabs (or Socratic Contract Banner for Student / Free User) */}
            {roleCfg.supportsAgentMode ? (
              <div className={styles.modeSwitcher}>
                <button
                  onClick={() => handleModeSwitch('chat')}
                  className={`${styles.modeTab} ${mode === 'chat' ? styles.activeModeTab : ''}`}
                >
                  <Bot size={14} />
                  <span>Knowledge &amp; Analytics</span>
                </button>
                <button
                  onClick={() => handleModeSwitch('agent')}
                  className={`${styles.modeTab} ${mode === 'agent' ? styles.activeModeTab : ''}`}
                >
                  <Sparkles size={14} />
                  <span>Agent &amp; Action Mode</span>
                </button>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 14px',
                  background: 'rgba(124, 58, 237, 0.08)',
                  borderTop: '1px solid rgba(124, 58, 237, 0.14)',
                  fontSize: 11,
                  color: '#6d28d9',
                  fontWeight: 600,
                }}
              >
                <span>🔒 Socratic Learning Contract Active — Guided Hints &amp; Study Tools</span>
                <span style={{ opacity: 0.75 }}>{livePageContext.route}</span>
              </div>
            )}
          </div>

          {/* Body Container */}
          <div className={styles.bodyContainer}>
            {/* History Sidebar */}
            {showHistorySidebar && (
              <div className={styles.historySidebar}>
                <div className={styles.sidebarHeader}>
                  <span className={styles.sidebarTitle}>Past Chats</span>
                  <button onClick={() => setShowHistorySidebar(false)} className={styles.iconBtn}>
                    <X size={14} />
                  </button>
                </div>
                <button onClick={startNewConversation} className={styles.newChatBtn}>
                  <Plus size={14} /> New Conversation
                </button>
                {roleCfg.supportsAgentMode && (
                  <div className={styles.sidebarFilterBar}>
                    <button
                      className={`${styles.sidebarFilterBtn} ${historyFilter === 'all' ? styles.sidebarFilterBtnActive : ''}`}
                      onClick={() => setHistoryFilter('all')}
                    >
                      All ({sessions.length})
                    </button>
                    <button
                      className={`${styles.sidebarFilterBtn} ${historyFilter === 'chat' ? styles.sidebarFilterBtnActive : ''}`}
                      onClick={() => setHistoryFilter('chat')}
                    >
                      Knowledge ({sessions.filter(s => (s.mode || 'chat') === 'chat').length})
                    </button>
                    <button
                      className={`${styles.sidebarFilterBtn} ${historyFilter === 'agent' ? styles.sidebarFilterBtnActive : ''}`}
                      onClick={() => setHistoryFilter('agent')}
                    >
                      Agent ({sessions.filter(s => s.mode === 'agent').length})
                    </button>
                  </div>
                )}
                <div className={styles.sessionList}>
                  {filteredSessions.length === 0 && (
                    <div style={{ padding: '16px 12px', fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>
                      No {historyFilter === 'all' ? '' : historyFilter} sessions recorded.
                    </div>
                  )}
                  {filteredSessions.map(s => (
                    <div
                      key={s.id}
                      onClick={() => {
                        selectSession(s.id);
                        if (!isExpanded) setShowHistorySidebar(false);
                      }}
                      className={`${styles.sessionItem} ${activeSessionId === s.id ? styles.activeSessionItem : ''}`}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        {renamingId === s.id ? (
                          <input
                            ref={renameInputRef}
                            className={styles.renameInput}
                            value={renameText}
                            onChange={e => setRenameText(e.target.value)}
                            onBlur={() => commitRename(s.id)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') commitRename(s.id);
                              if (e.key === 'Escape') setRenamingId(null);
                            }}
                            onClick={e => e.stopPropagation()}
                            placeholder="Thread title..."
                            autoFocus
                          />
                        ) : (
                          <>
                            <div className={styles.sessionTitle}>
                              {s.is_pinned && (
                                <span className={styles.pinnedBadge}>
                                  <Pin size={9} /> Pinned
                                </span>
                              )}
                              <span>{s.title}</span>
                            </div>
                            <div className={styles.sessionMeta}>
                              {new Date(s.updated_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })}{' '}
                              ·{' '}
                              <span
                                className={
                                  (s.mode || 'chat') === 'agent' ? styles.agentModeBadge : styles.chatModeBadge
                                }
                              >
                                {(s.mode || 'chat') === 'agent' ? '⚡ AGENT' : '💬 KNOWLEDGE'}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                      <div className={styles.sessionActions}>
                        <button
                          onClick={e => togglePin(e, s)}
                          className={`${styles.sessionActionBtn} ${s.is_pinned ? styles.activePinned : ''}`}
                          title={s.is_pinned ? 'Unpin thread' : 'Pin thread to top'}
                        >
                          {s.is_pinned ? <PinOff size={13} /> : <Pin size={13} />}
                        </button>
                        <button
                          onClick={e => startRename(e, s)}
                          className={styles.sessionActionBtn}
                          title="Rename thread"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={e => deleteSession(e, s.id)}
                          className={`${styles.sessionActionBtn} ${styles.dangerBtn}`}
                          title="Delete thread"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Multi-Format Document Management Drawer */}
            {showDocsModal && (
              <div className={styles.docDrawer}>
                <div className={styles.docDrawerHeader}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1f2937' }}>
                      Knowledge Base &amp; RAG Index
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>
                      Upload PDFs, Word (.docx), Excel (.xlsx), CSV, or Markdown notes for grounded Q&amp;A.
                    </p>
                  </div>
                  <button onClick={() => setShowDocsModal(false)} className={styles.iconBtn}>
                    <X size={16} />
                  </button>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".pdf,.docx,.xlsx,.csv,.md,.txt"
                    style={{ display: 'none' }}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingDoc}
                    className={styles.confirmBtn}
                    style={{ background: '#7c3aed' }}
                  >
                    {uploadingDoc ? (
                      <>
                        <Loader2 size={14} className="animate-spin" /> Indexing Document...
                      </>
                    ) : (
                      <>
                        <Upload size={14} /> Upload Document (.pdf, .docx, .xlsx, .csv, .md)
                      </>
                    )}
                  </button>
                </div>

                <div className={styles.docGrid}>
                  {documents.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px 16px', color: '#9ca3af' }}>
                      <FileText size={36} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>No documents uploaded yet</p>
                      <p style={{ margin: '4px 0 0', fontSize: 12 }}>
                        Upload lab manuals, syllabi, or study notes to query them with AI.
                      </p>
                    </div>
                  )}

                  {documents.map(doc => (
                    <div key={doc.id} className={styles.docCard}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FileText size={20} color="#7c3aed" />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2937' }}>{doc.filename}</div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>
                            {(doc.doc_type || 'pdf').toUpperCase()} · {doc.page_count} sections ·{' '}
                            {doc.chunk_count} chunks · {Math.round(doc.file_size / 1024)} KB
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          onClick={() => {
                            setAttachedDoc(attachedDoc?.id === doc.id ? null : doc);
                            setShowDocsModal(false);
                          }}
                          className={styles.pillToggle}
                          style={
                            attachedDoc?.id === doc.id
                              ? { background: '#7c3aed', color: '#fff', borderColor: '#7c3aed' }
                              : {}
                          }
                        >
                          {attachedDoc?.id === doc.id ? '✓ Attached' : 'Attach for RAG'}
                        </button>
                        <button
                          onClick={() => handleDeleteDocument(doc.id)}
                          className={styles.iconBtn}
                          title="Delete document"
                        >
                          <Trash2 size={14} color="#ef4444" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Chat Canvas */}
            <div className={styles.chatCanvas}>
              <div ref={scrollRef} className={styles.messageStream}>
                {loadingMessages && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      padding: 30,
                      color: '#7c3aed',
                    }}
                  >
                    <Loader2 size={18} className="animate-spin" /> Loading session...
                  </div>
                )}

                {/* Empty State / Role-Tailored Suggestions */}
                {!loadingMessages && messages.length === 0 && (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIconArea}>
                      {mode === 'chat' ? <Bot size={28} /> : <Sparkles size={28} />}
                    </div>
                    <h3 className={styles.emptyTitle}>
                      {mode === 'chat' ? roleCfg.emptyChatTitle : roleCfg.emptyAgentTitle}
                    </h3>
                    <p className={styles.emptySubtitle}>
                      {mode === 'chat' ? roleCfg.emptyChatSub : roleCfg.emptyAgentSub}
                    </p>

                    <div className={styles.suggestionGrid}>
                      {activeSuggestions.map((s, idx) => (
                        <button key={idx} onClick={() => sendMessage(s.text)} className={styles.suggestionChip}>
                          {s.icon}
                          <span>{s.text}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Messages Feed */}
                {messages.map((m, i) => (
                  <div
                    key={m.id || i}
                    className={`${styles.messageRow} ${
                      m.role === 'user'
                        ? styles.userMessageRow
                        : m.role === 'system'
                        ? styles.systemMessageRow
                        : styles.assistantMessageRow
                    }`}
                  >
                    {/* Tool Badges */}
                    {m.tool_calls && m.tool_calls.length > 0 && (
                      <div className={styles.toolBadgesContainer}>
                        {m.tool_calls.map((tc, tcIdx) => (
                          <div key={tcIdx} className={styles.toolBadge}>
                            <span>⚡</span>
                            <span>{tc.tool}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Bubble Content */}
                    <div
                      className={
                        m.role === 'user'
                          ? styles.userBubble
                          : m.role === 'system'
                          ? styles.systemBubble
                          : styles.assistantBubble
                      }
                    >
                      {m.role === 'assistant' ? (
                        <div className={styles.markdownBody}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                      )}

                      {/* Generated Document Download Card */}
                      {m.generated_doc && (
                        <div
                          style={{
                            marginTop: 10,
                            padding: '10px 12px',
                            borderRadius: 10,
                            background: 'rgba(124, 58, 237, 0.08)',
                            border: '1px solid rgba(124, 58, 237, 0.22)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <FileText size={18} color="#7c3aed" />
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#1f2937' }}>
                                {m.generated_doc.title}.{m.generated_doc.format}
                              </div>
                              <div style={{ fontSize: 10, color: '#6b7280' }}>
                                AI Generated Deliverable · {m.generated_doc.format.toUpperCase()}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDownloadGeneratedDoc(m.generated_doc!)}
                            disabled={downloadingDocId === m.generated_doc.id}
                            className={styles.confirmBtn}
                            style={{ padding: '5px 10px', fontSize: 11 }}
                          >
                            {downloadingDocId === m.generated_doc.id ? (
                              <>
                                <Loader2 size={12} className="animate-spin" /> Downloading...
                              </>
                            ) : (
                              <>
                                <Download size={12} /> Download
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      {/* Action Preview Card */}
                      {m.pending_action &&
                        !m.applied &&
                        (() => {
                          const payload = m.pending_action;
                          if (!payload) return null;
                          const actionMeta = ACTION_CONFIG[payload.action] || {
                            label: 'Proposed Action Confirmation',
                            badge: 'Action',
                            icon: <AlertCircle size={15} color="#9333ea" />,
                          };

                          const entries = Object.entries(payload).filter(([k]) => {
                            if (['action', 'requires_confirmation', 'draft'].includes(k)) return false;
                            if (k.endsWith('_id') && payload[k.replace('_id', '_name')]) return false;
                            if (k === 'user_id' && payload.full_name) return false;
                            return true;
                          });

                          return (
                            <div className={styles.actionCard}>
                              <div className={styles.actionCardHeader}>
                                <div className={styles.actionHeaderTitle}>
                                  {actionMeta.icon}
                                  <span>{actionMeta.label}</span>
                                </div>
                                <span className={styles.actionBadgeType}>{actionMeta.badge}</span>
                              </div>

                              <div className={styles.actionCardBody}>
                                {entries.map(([k, v]) => {
                                  let displayVal = String(v ?? 'None');
                                  if (typeof v === 'boolean') {
                                    displayVal = v ? 'Enabled' : 'Disabled';
                                  }
                                  return (
                                    <div key={k} className={styles.actionKeyVal}>
                                      <span className={styles.actionKey}>{k.replace(/_/g, ' ')}:</span>
                                      <span className={styles.actionVal}>{displayVal}</span>
                                    </div>
                                  );
                                })}
                              </div>

                              <div className={styles.actionFooter}>
                                <button onClick={() => cancelAction(m.id)} className={styles.cancelBtn}>
                                  <X size={13} /> Dismiss
                                </button>
                                <button
                                  onClick={() => confirmAction(m)}
                                  disabled={executingActionId === m.id}
                                  className={styles.confirmBtn}
                                >
                                  {executingActionId === m.id ? (
                                    <>
                                      <Loader2 size={13} className="animate-spin" /> Executing...
                                    </>
                                  ) : (
                                    <>
                                      <Check size={13} /> Confirm &amp; Apply
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })()}

                      {/* Applied Status Badge */}
                      {m.applied && (
                        <div style={{ marginTop: 8 }}>
                          <span className={styles.appliedBadge}>
                            <CheckCircle2 size={13} /> Executed &amp; Recorded in Audit Log
                          </span>
                        </div>
                      )}

                      {/* Sources / Citations Drawer */}
                      {m.sources && m.sources.length > 0 && (
                        <div className={styles.sourcesContainer}>
                          <div className={styles.sourcesTitle}>
                            <FileText size={12} />
                            <span>Sources &amp; References ({m.sources.length})</span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {m.sources.map((src, sIdx) => (
                              <React.Fragment key={sIdx}>
                                {src.type === 'document' ? (
                                  <div className={styles.sourcePill} title={src.text}>
                                    <FileText size={11} color="#7c3aed" />
                                    <span>
                                      {src.filename} (p. {src.page})
                                    </span>
                                  </div>
                                ) : (
                                  <a
                                    href={src.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={styles.sourcePill}
                                    title={src.snippet}
                                  >
                                    <Globe size={11} color="#2563eb" />
                                    <span>{src.title || src.url}</span>
                                    <ExternalLink size={10} />
                                  </a>
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Thinking / Busy Indicator */}
                {busy && (
                  <div className={`${styles.messageRow} ${styles.assistantMessageRow}`}>
                    <div className={styles.thinkingCard}>
                      <div className={styles.thinkingMainRow}>
                        <div className={styles.aiOrb}>
                          <Sparkles size={16} />
                        </div>
                        <div className={styles.thinkingContent}>
                          <div className={styles.thinkingTitleRow}>
                            <span className={styles.thinkingText}>{roleCfg.title} Thinking</span>
                            <div className={styles.thinkingWave}>
                              <span className={styles.waveDot} />
                              <span className={styles.waveDot} />
                              <span className={styles.waveDot} />
                            </div>
                          </div>
                          <span className={styles.thinkingSub}>
                            {thinkingPhase === 0
                              ? 'Inspecting live workspace & role context...'
                              : thinkingPhase === 1
                              ? 'Running role-scoped tools & database queries...'
                              : 'Synthesizing grounded response...'}
                          </span>
                        </div>
                      </div>
                      <div className={styles.thinkingProgressBar} />
                    </div>
                  </div>
                )}
              </div>

              {/* Composer */}
              <div className={styles.composerArea}>
                <div className={styles.composerTopBar}>
                  <div className={styles.pillToggleGroup}>
                    <button
                      onClick={() => setWebSearch(!webSearch)}
                      className={`${styles.pillToggle} ${webSearch ? styles.pillToggleActive : ''}`}
                      title="Toggle live Web Search"
                    >
                      <Globe size={12} />
                      <span>{webSearch ? 'Web: Active' : 'Web Search'}</span>
                    </button>

                    {attachedDoc ? (
                      <div className={styles.pdfChip}>
                        <FileText size={11} />
                        <span>{attachedDoc.filename}</span>
                        <button
                          onClick={() => setAttachedDoc(null)}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowDocsModal(true)}
                        className={styles.pillToggle}
                        title="Attach Document for RAG (.pdf, .docx, .xlsx, .csv, .md)"
                      >
                        <FileText size={12} />
                        <span>Attach Doc</span>
                      </button>
                    )}
                  </div>

                  <div style={{ fontSize: 11, color: '#9ca3af' }}>
                    Press <strong>Enter</strong> to send
                  </div>
                </div>

                <form
                  onSubmit={e => {
                    e.preventDefault();
                    sendMessage();
                  }}
                  className={styles.composerForm}
                >
                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder={mode === 'chat' ? roleCfg.chatPlaceholder : roleCfg.agentPlaceholder}
                    disabled={busy}
                    rows={1}
                    className={styles.composerTextarea}
                  />

                  <button
                    type="submit"
                    disabled={busy || !input.trim()}
                    className={styles.sendBtn}
                    aria-label="Send"
                  >
                    <Send size={16} />
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
