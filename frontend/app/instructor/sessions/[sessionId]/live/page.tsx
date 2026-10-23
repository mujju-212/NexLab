'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Play, Square, X, Send, Loader2, Radio, Monitor, Video, Mic,
  Rocket, Code2, Presentation, MonitorPlay, MicOff, VideoOff, Focus, UserMinus,
  MessageSquare, MousePointer2, Contact, Users, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, GripVertical, PanelRightClose, PanelRightOpen, Lock,
  ShieldCheck, ShieldAlert, Share2, Clock3
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import {
  experienceService, type LiveState, type ChatMessage,
} from '@/services/experience.service';
import { sessionService } from '@/services/session.service';
import { executionService, type CompilerLanguage, type PlaygroundResult } from '@/services/execution.service';
import { useSocket } from '@/hooks/use-socket';
import type {
  StudentScreenshotPayload, ModeChangedPayload, DirectCheckpointPayload,
  ChatMessagePayload, ProctorPolicyPayload, FocusUpdatePayload,
  ProctorAlertPayload, StudentJoinedPayload, StudentLeftPayload,
} from '@/hooks/use-socket';
import CellPreview from '@/components/instructor/studio/CellPreview';
import type { ContentBlock } from '@/components/instructor/studio/blocks';
import { LiveKitRoom } from '@livekit/components-react';
import '@livekit/components-styles';
import ConductorConference, { ShareBridge, type ShareApi } from '@/components/instructor/ConductorConference';
import StudentScreenViewer from '@/components/instructor/StudentScreenViewer';
import styles from '../../../shared.module.css';
import chatStyles from './live.module.css';
import { useAuthStore } from '@/store/auth-store';

const MODES = [
  { value: 'briefing',    label: 'Briefing',    icon: '📋' },
  { value: 'working',     label: 'Working',     icon: '💻' },
  { value: 'quiz_active', label: 'Quiz Active', icon: '📝' },
  { value: 'paused',      label: 'Paused',      icon: '⏸' },
  { value: 'debrief',     label: 'Debrief',     icon: '📊' },
];

const PROCTOR_FIELDS: {
  key: string; label: string; desc: string; effect: string; sev?: string;
}[] = [
  { key: 'lockdown_fullscreen', label: 'Lockdown fullscreen',
    desc: 'Forces the workbench into fullscreen and re-enters it if the student escapes.',
    effect: 'Leaving raises a medium violation', sev: 'medium' },
  { key: 'block_copy_paste', label: 'Block copy/paste',
    desc: 'Blocks Ctrl+C / Ctrl+V and right-click inside the workbench.',
    effect: 'A blocked attempt is recorded', sev: 'medium' },
  { key: 'block_tab_switch', label: 'Block tab switch',
    desc: 'Notices when the tab loses focus or the student switches away.',
    effect: 'Recorded as a tab switch', sev: 'medium' },
  { key: 'plagiarism_scan', label: 'Plagiarism scan',
    desc: 'Compares submissions across the class for copied solutions.',
    effect: 'Flags appear in integrity', sev: 'high' },
  { key: 'focus_ml', label: 'Focus ML monitoring',
    desc: 'Scores attention from typing rhythm, idle time and tab switches every 30 s.',
    effect: 'Off = no scores are collected at all' },
  { key: 'webcam_required', label: 'Webcam required',
    desc: 'Students must publish camera video to stay in the room.',
    effect: 'Enforced at join' },
];

type Tab = 'spark' | 'present' | 'video' | 'control';
type SortBy = 'priority' | 'focus' | 'name' | 'checkpoints';

interface ScreenFrame { frame: string; ts: string }
interface ScreenshotEntry { name: string; frames: ScreenFrame[] }   // rolling last-5

interface PresentModule {
  id: string; page_id: string | null; module_type: string; title: string;
  content_data: Record<string, unknown>; display_order: number;
  question_count?: number; questions?: unknown[];
}
interface ContentPageFull {
  id: string | null; title: string; display_order: number;
  release_at: string | null; is_live?: boolean;
  modules: PresentModule[];
}

const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || '';

export default function ConductorPage() {
  const params = useParams();
  const sessionId = params?.sessionId as string;
  const router = useRouter();

  const [state, setState] = useState<LiveState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('spark');
  // SPARK grid search + sort
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('priority');

  // Chat
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatTarget, setChatTarget] = useState<string>('');   // '' = everyone
  const chatRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Right panel (Video tab) — tabbed Chat / Participants / Student Screens
  const [rightTab, setRightTab] = useState<'chat' | 'participants' | 'screens'>('chat');
  const [chatAudience, setChatAudience] = useState<'everyone' | 'direct'>('everyone');
  // Spotlight the selected student's LIVE screen (vs their 30s screenshot)
  const [liveSpotlight, setLiveSpotlight] = useState(false);

  // Instructor left the LiveKit room manually — hold re-minting until Rejoin
  const [videoLeft, setVideoLeft] = useState(false);

  // Session-live timer (header pill)
  const [now, setNow] = useState(() => Date.now());

  const user = useAuthStore(s => s.user);

  // Screenshots (keyed by student_id) — rolling buffer of the last 5 frames.
  // Students already share their screen at join; frames stream every ~30s. We
  // keep them but do NOT display until the instructor clicks "Show screen".
  const [screenshots, setScreenshots] = useState<Record<string, ScreenshotEntry>>({});
  // Which student's live screen the instructor has opened (click-to-view).
  const [screenViewId, setScreenViewId] = useState<string | null>(null);
  // End-session / force-submit confirmations. Native window.confirm() blocks the
  // UI thread, cannot be styled, and is suppressed outright in kiosk and embedded
  // browsers — where the action then silently does nothing.
  const [confirmDialog, setConfirmDialog] = useState<
    | { kind: 'end' }
    | { kind: 'force'; studentId?: string; who: string }
    | null>(null);
  const MAX_FRAMES = 5;

  // Video token — minted once when the session is active, kept for the
  // lifetime of the page so switching tabs never kills the LiveKit connection.
  const [videoToken, setVideoToken] = useState<string | null>(null);
  // Mint failure reason — shown in the Video tab instead of spinning forever.
  const [videoError, setVideoError] = useState<string | null>(null);

  // Screen share — primary path is LiveKit (students see it in the room);
  // ShareBridge exposes the room's toggle/pause API to this outer page.
  // The raw getDisplayMedia stream is only a fallback when not connected.
  type ShareState = 'idle' | 'sharing' | 'paused';
  const [shareState, setShareState] = useState<ShareState>('idle');
  const shareStreamRef = useRef<MediaStream | null>(null);
  const shareApiRef = useRef<ShareApi | null>(null);
  const onShareChange = useCallback((sharing: boolean) => {
    setShareState(sharing ? 'sharing' : 'idle');
  }, []);

  // Present tab
  const [content, setContent] = useState<ContentPageFull[]>([]);
  const [contentLoaded, setContentLoaded] = useState(false);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [scratchCode, setScratchCode] = useState('# Live demo — write code and run it for the class\n');
  const [scratchLang, setScratchLang] = useState('python');
  const [scratchStdin, setScratchStdin] = useState('');
  const [scratchResult, setScratchResult] = useState<PlaygroundResult | null>(null);
  const [scratchRunning, setScratchRunning] = useState(false);
  const [languages, setLanguages] = useState<CompilerLanguage[]>([]);

  const toast3 = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Present Tab Sidebar Resize & Minimize ──────────────────────────────
  const [presentSidebarWidth, setPresentSidebarWidth] = useState(220);
  const [presentSidebarMinimized, setPresentSidebarMinimized] = useState(false);
  const [isDraggingPresentSidebar, setIsDraggingPresentSidebar] = useState(false);

  // Floating Screen Share Popover state (docked at bottom-right)
  const [sharePanelOpen, setSharePanelOpen] = useState(false);

  // ── Video Tab Right Panel Resize & Minimize ───────────────────────────
  const [videoSidebarWidth, setVideoSidebarWidth] = useState(340);
  const [videoSidebarMinimized, setVideoSidebarMinimized] = useState(false);
  const [isDraggingVideoSidebar, setIsDraggingVideoSidebar] = useState(false);
  const [chatCardCollapsed, setChatCardCollapsed] = useState(false);
  const [studentCtrlCollapsed, setStudentCtrlCollapsed] = useState(false);

  // Resize handler for Present tab sidebar (dragging right increases width)
  const startResizePresentSidebar = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingPresentSidebar(true);
    const startX = e.clientX;
    const startWidth = presentSidebarWidth;

    const onMouseMove = (moveEvt: MouseEvent) => {
      const delta = moveEvt.clientX - startX;
      const newWidth = Math.max(160, Math.min(480, startWidth + delta));
      setPresentSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      setIsDraggingPresentSidebar(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [presentSidebarWidth]);

  // Resize handler for Video tab right sidebar (dragging left increases width)
  const startResizeVideoSidebar = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingVideoSidebar(true);
    const startX = e.clientX;
    const startWidth = videoSidebarWidth;

    const onMouseMove = (moveEvt: MouseEvent) => {
      const delta = startX - moveEvt.clientX;
      const newWidth = Math.max(260, Math.min(560, startWidth + delta));
      setVideoSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      setIsDraggingVideoSidebar(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [videoSidebarWidth]);

  // ── Load live state ─────────────────────────────────────────────────────
  const loadState = useCallback(async () => {
    if (!sessionId) return;
    try {
      const data = await experienceService.liveState(sessionId);
      setState(data);
      setChatMessages(data.chat || []);
    } catch (e: any) {
      toast3(e?.response?.data?.error || 'Failed to load session');
    } finally {
      setLoading(false);
    }
  }, [sessionId, toast3]);

  useEffect(() => { loadState(); }, [loadState]);

  // The proctor feed and the focus numbers are server-derived, so poll them while
  // the conductor is open — a violation must show up within seconds, not on reload.
  useEffect(() => {
    if (state?.session?.status !== 'active') return;
    const t = setInterval(() => { void loadState(); }, 20000);
    return () => clearInterval(t);
  }, [state?.session?.status, loadState]);

  const isLive = state?.session?.status === 'active';
  // Focus scores only exist while the Focus ML control is switched on. Showing a
  // number when collection is off would be inventing data.
  const focusCollecting = !!(state?.focus_ml_enabled ?? state?.proctor_policy?.focus_ml);
  const experimentId = (state?.experiment?.id || (state?.session as { experiment_id?: string })?.experiment_id) as string | undefined;

  // ── Socket — one connection, stable callbacks ───────────────────────────
  useSocket({
    sessionId: sessionId || '',
    enabled: !!sessionId && !!isLive,
    onScreenshotFrame: useCallback((data: StudentScreenshotPayload) => {
      setScreenshots(prev => {
        const existing = prev[data.student_id];
        const nextFrame = { frame: data.frame, ts: data.timestamp };
        const frames = [nextFrame, ...(existing?.frames ?? [])].slice(0, MAX_FRAMES);
        return { ...prev, [data.student_id]: { name: data.full_name, frames } };
      });
    }, []),
    onModeChanged: useCallback((data: ModeChangedPayload) => {
      setState(prev => prev ? { ...prev, mode: data.mode, mode_rules: data.rules } : prev);
      toast3(`Mode changed to ${data.rules.label}`);
    }, [toast3]),
    onDirectCheckpoint: useCallback((data: DirectCheckpointPayload) => {
      setState(prev => {
        if (!prev) return prev;
        const grid = prev.spark_grid.map(row => {
          if (row.student_id !== data.student_id) return row;
          const cps = { ...row.checkpoints, [data.checkpoint_id]: data.status };
          const verified = Object.values(cps).filter(v => v === 'verified' || v === 'manual_pass').length;
          return { ...row, checkpoints: cps, verified_checkpoints: verified };
        });
        return { ...prev, spark_grid: grid };
      });
    }, []),
    onChatMessage: useCallback((data: ChatMessagePayload) => {
      setChatMessages(prev => [...prev, data as ChatMessage]);
    }, []),
    onProctorPolicy: useCallback((data: ProctorPolicyPayload) => {
      setState(prev => prev ? { ...prev, proctor_policy: data.policy } : prev);
    }, []),
    onFocusUpdate: useCallback((data: FocusUpdatePayload) => {
      setState(prev => {
        if (!prev) return prev;
        const grid = prev.spark_grid.map(row => {
          if (row.student_id !== data.student_id) return row;
          const score = data.focus_score;
          const behind = (prev.checkpoints?.length || 0) - row.verified_checkpoints;
          const priority = behind * 3 + (score !== null && score < 40 ? 2 : 0) + row.proctor_events;
          return { ...row, focus_score: score, priority_score: priority };
        });
        return { ...prev, spark_grid: grid };
      });
    }, []),
    onProctorAlert: useCallback((data: ProctorAlertPayload) => {
      setState(prev => {
        if (!prev) return prev;
        const grid = prev.spark_grid.map(row => {
          if (row.student_id !== data.student_id) return row;
          const count = row.proctor_events + 1;
          const behind = (prev.checkpoints?.length || 0) - row.verified_checkpoints;
          const priority = behind * 3 + (row.focus_score !== null && row.focus_score < 40 ? 2 : 0) + count;
          return { ...row, proctor_events: count, priority_score: priority };
        });
        return { ...prev, spark_grid: grid };
      });
      toast3(`Proctor alert: ${data.full_name} (${data.type.replace('_', ' ')})`);
    }, [toast3]),
    onStudentJoined: useCallback((data: StudentJoinedPayload) => {
      setState(prev => {
        if (!prev) return prev;
        const exists = prev.attendance.some(a => a.student_id === data.student_id);
        const att = exists
          ? prev.attendance.map(a => a.student_id === data.student_id ? { ...a, status: 'present' } : a)
          : [...prev.attendance, { student_id: data.student_id, status: 'present' }];
        return { ...prev, attendance: att };
      });
      toast3(`${data.full_name} joined the session`);
    }, [toast3]),
    onStudentLeft: useCallback((data: StudentLeftPayload) => {
      toast3(`${data.full_name || 'A student'} left the session`);
    }, [toast3]),
  });

  // Scroll chat to bottom on new message
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatMessages]);

  // ── Lazy-load Present-tab content + language catalog on first open ───────
  useEffect(() => {
    if (tab !== 'present' || contentLoaded || !experimentId) return;
    (async () => {
      try {
        const [c, langs] = await Promise.all([
          experienceService.getSessionContent(experimentId),
          executionService.listLanguages().catch(() => ({ languages: [] as CompilerLanguage[], groups: [] })),
        ]);
        setContent(c.pages as unknown as ContentPageFull[]);
        setLanguages(langs.languages);
        const firstMod = c.pages.flatMap(p => p.modules)[0];
        if (firstMod) setActiveModuleId(firstMod.id);
      } catch (e: any) {
        toast3(e?.response?.data?.error || 'Could not load content');
      } finally {
        setContentLoaded(true);
      }
    })();
  }, [tab, contentLoaded, experimentId, toast3]);

  // ── Mint video token as soon as session is live ──────────────────────────
  // Done here (not on tab open) so the LiveKit connection is established once
  // and never drops when the instructor switches between tabs.
  useEffect(() => {
    if (!isLive || videoToken || videoLeft || !sessionId) return;
    (async () => {
      try {
        const res = await sessionService.getVideoToken(sessionId);
        if (res.livekit_token) setVideoToken(res.livekit_token);
        else setVideoError('Backend returned no video token — LiveKit is not configured on the server.');
      } catch (e: any) {
        // Surface the reason (e.g. 503 misconfig) instead of silently spinning.
        setVideoError(e?.response?.data?.error || 'Could not reach the video server.');
      }
    })();
  }, [isLive, videoToken, videoLeft, sessionId]);

  // Tick the header live timer once per second while the session is active
  useEffect(() => {
    if (!isLive) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isLive]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const changeMode = async (mode: string) => {
    setBusy('mode');
    try {
      const res = await experienceService.setMode(sessionId, mode);
      setState(prev => prev ? { ...prev, mode: res.mode, mode_rules: res.rules } : prev);
      toast3(`Mode: ${mode}`);
    } catch (e: any) { toast3(e?.response?.data?.error || 'Failed'); }
    finally { setBusy(null); }
  };

  const endSession = async () => {
    setConfirmDialog(null);
    setBusy('end');
    try {
      await experienceService.setMode(sessionId, 'ended');
      await experienceService.finalizeGrades(sessionId);
      toast3('Session ended, grades finalized');
      router.push('/instructor/sessions');
    } catch (e: any) { toast3(e?.response?.data?.error || 'Failed'); }
    finally { setBusy(null); }
  };

  const toggleProctor = async (key: string, value: boolean) => {
    setBusy('proctor');
    try {
      const res = await experienceService.setProctor(sessionId, null, { [key]: value });
      setState(prev => prev ? { ...prev, proctor_policy: res.policy } : prev);
    } catch (e: any) { toast3(e?.response?.data?.error || 'Failed'); }
    finally { setBusy(null); }
  };

  const sendChatMsg = async () => {
    if (!chatInput.trim()) return;
    setBusy('chat');
    try {
      if (chatTarget) await experienceService.sendChat(sessionId, chatInput, chatTarget);
      else await experienceService.broadcast(sessionId, chatInput);
      setChatInput('');
    } catch (e: any) { toast3(e?.response?.data?.error || 'Failed'); }
    finally { setBusy(null); }
  };

  const forceSubmit = async (studentId?: string) => {
    setConfirmDialog(null);
    setBusy('force');
    try {
      await experienceService.forceSubmit(sessionId, studentId);
      toast3(studentId ? 'Student submitted' : 'All submitted');
    } catch (e: any) { toast3(e?.response?.data?.error || 'Failed'); }
    finally { setBusy(null); }
  };

  const releasePage = async (pageId: string, makeLive: boolean) => {
    if (!experimentId) return;
    setBusy(`page-${pageId}`);
    try {
      await experienceService.releasePage(experimentId, pageId, { is_live: makeLive });
      setContent(prev => prev.map(p => p.id === pageId ? { ...p, is_live: makeLive } : p));
      if (makeLive) await experienceService.launchPage(sessionId, pageId).catch(() => undefined);
      toast3(makeLive ? 'Page released to students' : 'Page hidden from students');
    } catch (e: any) { toast3(e?.response?.data?.error || 'Failed'); }
    finally { setBusy(null); }
  };

  const runScratch = async () => {
    setScratchRunning(true);
    setScratchResult(null);
    try {
      const res = await executionService.runPlayground({ code: scratchCode, language: scratchLang, stdin: scratchStdin || undefined });
      setScratchResult(res);
    } catch (e: any) { toast3(e?.response?.data?.error || 'Run failed'); }
    finally { setScratchRunning(false); }
  };

  // ── Screen share — routed through LiveKit so students actually see it ────
  const startScreenShare = async () => {
    // LiveKit connected → publish the screen track to the room
    if (shareApiRef.current) {
      await shareApiRef.current.toggle();
      return;
    }
    // Fallback (no LiveKit) — local preview only
    try {
      const stream = await (navigator.mediaDevices as MediaDevices & {
        getDisplayMedia(opts?: object): Promise<MediaStream>
      }).getDisplayMedia({ video: true, audio: true });
      shareStreamRef.current = stream;
      setShareState('sharing');
      stream.getVideoTracks()[0].onended = () => {
        shareStreamRef.current = null;
        setShareState('idle');
      };
      toast3('Screen sharing started (local preview — video room not connected)');
    } catch (e: any) {
      if (e?.name !== 'NotAllowedError') toast3('Could not start screen share');
    }
  };

  const pauseScreenShare = () => {
    if (shareApiRef.current) { shareApiRef.current.pause(); return; }
    if (!shareStreamRef.current) return;
    shareStreamRef.current.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    const nowPaused = !shareStreamRef.current.getVideoTracks()[0]?.enabled;
    setShareState(nowPaused ? 'paused' : 'sharing');
  };

  const stopScreenShare = () => {
    if (shareApiRef.current && shareState !== 'idle') { shareApiRef.current.toggle(); return; }
    shareStreamRef.current?.getTracks().forEach(t => t.stop());
    shareStreamRef.current = null;
    setShareState('idle');
  };

  // ── Student control actions (Video tab) ───────────────────────────────────
  const sendFocusSignal = async (studentId: string) => {
    try {
      // Sends a direct chat push to the student alerting them to focus
      await experienceService.sendChat(sessionId, '⚡ Please pay attention to the session.', studentId);
      toast3('Focus signal sent');
    } catch { toast3('Failed to send focus signal'); }
  };

  // ── Server-side LiveKit controls (mic / camera / remove) ─────────────────
  const videoControl = async (
    action: 'mute' | 'camera' | 'remove', studentId: string, name: string, value = true,
  ) => {
    setBusy(`vc-${studentId}`);
    try {
      await sessionService.videoControl(sessionId, action, studentId, value);
      toast3(
        action === 'remove' ? `${name} removed from the video room`
          : value ? `${name}'s ${action === 'mute' ? 'microphone' : 'camera'} disabled`
          : `${name}'s ${action === 'mute' ? 'microphone' : 'camera'} re-enabled`,
      );
    } catch (e: any) {
      // Fallback request via direct chat
      const verb = action === 'mute'
        ? (value ? '🔇 Please mute your microphone.' : '🎤 Please unmute your microphone.')
        : action === 'camera'
        ? (value ? '📵 Please turn off your camera.' : '📹 Please turn on your camera.')
        : '⚠️ Please leave the session.';
      try {
        await experienceService.sendChat(sessionId, verb, studentId);
        toast3(`Request sent to ${name} (${action === 'mute' ? (value ? 'Mute' : 'Unmute') : (value ? 'Disable' : 'Enable')} cam)`);
      } catch { toast3(e?.response?.data?.error || 'Failed'); }
    } finally { setBusy(null); }
  };

  // ── Derived ─────────────────────────────────────────────────────────────
  const grid = state?.spark_grid ?? [];
  const cps = state?.checkpoints ?? [];
  const rules = state?.mode_rules;
  const mode = state?.mode ?? 'briefing';
  const proctor = (state?.proctor_policy ?? {}) as Record<string, boolean>;

  const connected = useMemo(
    () => grid.filter(r => screenshots[r.student_id] || r.focus_score !== null).length,
    [grid, screenshots],
  );
  const lowFocus = useMemo(
    () => grid.filter(r => r.focus_score !== null && (r.focus_score as number) < 60).length,
    [grid],
  );
  const totalAttempts = useMemo(() => grid.reduce((s, r) => s + (r.attempts || 0), 0), [grid]);

  // Header pill — hh:mm:ss since the session went live
  const elapsed = useMemo(() => {
    const st = (state?.session as { started_at?: string | null } | undefined)?.started_at;
    if (!st) return '00:00:00';
    const s = Math.max(0, Math.floor((now - new Date(st).getTime()) / 1000));
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
  }, [state, now]);

  // Right-panel chat view — audience segment + text filter
  const visibleChat = useMemo(() => {
    let msgs = chatMessages;
    if (chatAudience === 'direct') {
      // Only the 1:1 thread with the selected student (both directions)
      msgs = chatTarget
        ? msgs.filter(m => m.to_id === chatTarget || (m.from_id === chatTarget && (m.to_id === user?.id || !m.to_id)))
        : [];
    } else {
      // Everyone / group — broadcasts and messages that aren't private DMs
      msgs = msgs.filter(m => !m.to_id || m.from_id === user?.id || m.to_id === user?.id);
    }
    return msgs;
  }, [chatMessages, chatAudience, chatTarget, user]);

  // Search + sort the grid
  const filteredGrid = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q
      ? grid.filter(r =>
          r.full_name.toLowerCase().includes(q) || (r.roll_number || '').toLowerCase().includes(q))
      : [...grid];
    rows.sort((a, b) => {
      switch (sortBy) {
        case 'focus':       return (b.focus_score ?? -1) - (a.focus_score ?? -1);
        case 'name':        return a.full_name.localeCompare(b.full_name);
        case 'checkpoints': return b.verified_checkpoints - a.verified_checkpoints;
        default:            return (b.priority_score ?? 0) - (a.priority_score ?? 0);
      }
    });
    return rows;
  }, [grid, search, sortBy]);

  const activeModule = useMemo(() => {
    for (const p of content) {
      const m = p.modules.find(mm => mm.id === activeModuleId);
      if (m) return m;
    }
    return null;
  }, [content, activeModuleId]);

  const relTime = (iso: string) => {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    return s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`;
  };

  if (loading) {
    return (
      <InstructorShell activePage="Live Conductor">
        <div style={{ padding: 40, textAlign: 'center', color: '#9891a6' }}>
          <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} /> Loading session…
        </div>
      </InstructorShell>
    );
  }
  if (!state) {
    return (
      <InstructorShell activePage="Live Conductor">
        <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>Session not found or not assigned to you.</div>
      </InstructorShell>
    );
  }

  const TABS: { key: Tab; label: string; Icon: typeof Monitor }[] = [
    { key: 'spark',   label: 'SPARK Grid',      Icon: Monitor },
    { key: 'present', label: 'Present & Teach', Icon: Presentation },
    { key: 'video',   label: 'Video',           Icon: Video },
    { key: 'control', label: 'Control & Comms', Icon: Radio },
  ];

  return (
    <InstructorShell activePage="Live Conductor" noScroll>
      {toast && (
        <div style={{ position: 'fixed', top: 18, right: 18, zIndex: 999, background: '#111827', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13 }}>
          {toast}
        </div>
      )}

      {/* Outer flex column — fills the shell content area, nothing overflows the page */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', gap: 0 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 10, flexShrink: 0 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827', flex: 1 }}>
          Conductor — {(state.experiment?.title as string) || (state.session?.title as string) || 'Live Lab'}
        </h2>
        <div style={{ display: 'flex', gap: 4, background: 'rgba(245,243,255,.7)', borderRadius: 10, padding: 3, border: '1px solid rgba(255,255,255,.9)' }}>
          {MODES.map(m => (
            <button key={m.value} onClick={() => changeMode(m.value)} disabled={busy === 'mode'}
              style={{
                padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 12.5, fontWeight: 600,
                background: mode === m.value ? 'linear-gradient(135deg,#7c3aed,#9333ea)' : 'transparent',
                color: mode === m.value ? '#fff' : '#6b7280', opacity: busy === 'mode' ? .6 : 1,
              }}>
              {m.icon} {m.label}
            </button>
          ))}
        </div>
        {isLive && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 700, color: '#059669' }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: '#10b981' }} />
            Session Live
            <span style={{ fontVariantNumeric: 'tabular-nums', color: '#065f46' }}>{elapsed}</span>
          </span>
        )}
        <button onClick={() => setConfirmDialog({ kind: 'end' })} disabled={busy === 'end'}
          style={{ padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', background: '#ef4444', color: '#fff', fontWeight: 700, fontSize: 13 }}>
          {busy === 'end' ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />} End
        </button>
      </div>

      {/* ── Rules strip ── */}
      <div style={{ marginBottom: 10, padding: '10px 16px', borderRadius: 10, flexShrink: 0,
        background: mode === 'paused' ? '#fef3c7' : mode === 'quiz_active' ? '#ede9fe' : '#f3f4f6',
        fontSize: 13, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>Rules: {rules?.label}</strong>
        <span>Code: {rules?.code}</span><span>Quiz: {rules?.quiz}</span>
        <span>Submit: {String(rules?.submit)}</span><span>Proctor: {rules?.proctor}</span>
      </div>

      {/* ── Navigation Tabs — Fixed Top ── */}
      <div className={styles.tabRow} style={{ flexShrink: 0, marginBottom: 12 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`${styles.tabChip} ${tab === t.key ? styles.tabChipActive : ''}`}>
            <t.Icon size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />{t.label}
          </button>
        ))}
      </div>

      {/* ── Main Tab Content Container — Scrollable ── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

      {/* ── LiveKit room — always mounted so it never drops on tab switch ──
          Rendered visually hidden when not on the Video tab. The token is
          minted once when the session goes live (see useEffect above).        */}
      {videoToken && LIVEKIT_URL && isLive && (
        <div hidden={tab !== 'video'} style={{ display: tab !== 'video' ? 'none' : undefined }}>
          {/* The actual LiveKit room is rendered inside the Video tab JSX
              below — this block intentionally left to hold future track hooks */}
        </div>
      )}

      {/* ── KPIs — only on SPARK tab ── */}
      {tab === 'spark' && (
        <div className={styles.kpiRow} style={{ marginBottom: 16, flexShrink: 0 }}>
          <div className={styles.kpiCard}><p className={styles.kpiLabel}>Students</p><p className={styles.kpiValue} style={{ color: '#7c3aed' }}>{grid.length}</p><p className={styles.kpiSub}>{connected} active</p></div>
          <div className={styles.kpiCard}>
            <p className={styles.kpiLabel}>Low Focus</p>
            <p className={styles.kpiValue} style={{ color: focusCollecting ? (lowFocus > 0 ? '#b45309' : '#16a34a') : '#9ca3af' }}>
              {focusCollecting ? String(lowFocus).padStart(2, '0') : '—'}
            </p>
            <p className={styles.kpiSub}>{focusCollecting ? 'Focus below 60' : 'Monitoring off'}</p>
          </div>
          <div className={styles.kpiCard}><p className={styles.kpiLabel}>Attempts</p><p className={styles.kpiValue} style={{ color: '#7c3aed' }}>{totalAttempts}</p><p className={styles.kpiSub}>Code executions</p></div>
          <div className={styles.kpiCard}><p className={styles.kpiLabel}>Status</p><p className={styles.kpiValue} style={{ color: '#d946ef', textTransform: 'capitalize' }}>{isLive ? 'Active' : String(state.session?.status ?? '—')}</p><p className={styles.kpiSub}>{Object.keys(screenshots).length} sending frames</p></div>
        </div>
      )}

      {/* ══ SPARK GRID ══ */}
      {tab === 'spark' && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3 className={styles.sectionTitle}>SPARK Monitoring Grid</h3>
              <p className={styles.sectionSub}>
                {filteredGrid.length} of {grid.length} student{grid.length !== 1 ? 's' : ''}
                {cps.length > 0 ? ` · ${cps.length} checkpoints` : ''} · click a row to watch their live screen
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search name or roll number…" className={styles.input} style={{ width: 210 }} />
              <select className={styles.select} value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)} style={{ width: 'auto' }}>
                <option value="priority">Sort by Priority</option>
                <option value="focus">Sort by Focus</option>
                <option value="name">Sort by Name</option>
                <option value="checkpoints">Sort by Checkpoints</option>
              </select>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className={styles.table} style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={{ width: 38 }}>#</th>
                  <th style={{ minWidth: 150 }}>Student</th>
                  <th>Roll No.</th>
                  <th style={{ textAlign: 'center' }}>Focus</th>
                  <th style={{ textAlign: 'center' }}>Checkpoints</th>
                  <th style={{ textAlign: 'center' }}>Proctor</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredGrid.map((row, i) => {
                  const initials = row.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                  const lowF = row.focus_score !== null && (row.focus_score as number) < 50;
                  const statusLabel = row.focus_score === null ? 'Idle' : lowF ? 'Low Focus' : 'Active';
                  const statusCls = row.focus_score === null ? styles.slateBadge : lowF ? styles.amberBadge : styles.greenBadge;
                  const allDone = cps.length > 0 && row.verified_checkpoints >= cps.length;
                  return (
                    <tr key={row.student_id}
                      onClick={() => setScreenViewId(row.student_id)}
                      title={`View ${row.full_name}'s live screen`}
                      style={{ cursor: 'pointer' }}>
                      <td style={{ color: '#9ca3af', fontSize: 12 }}>{i + 1}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <div style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, background: 'linear-gradient(135deg,#c4b5fd,#a78bfa)', color: '#fff', fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {initials}
                          </div>
                          <span className={styles.tdStrong}>{row.full_name}</span>
                        </div>
                      </td>
                      <td style={{ color: '#6b7280', fontSize: 12.5 }}>{row.roll_number || '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        {focusCollecting ? (
                          <span className={row.focus_score === null ? styles.slateBadge : lowF ? styles.redBadge : styles.greenBadge}>
                            {row.focus_score !== null ? `${Math.round(row.focus_score)}%` : '—'}
                          </span>
                        ) : (
                          <span className={styles.slateBadge} title="Focus monitoring is switched off for this session">
                            off
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: allDone ? '#16a34a' : '#d97706' }}>
                          {allDone ? '● ' : '● '}{row.verified_checkpoints}/{cps.length}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {row.proctor_events > 0 ? <span className={styles.amberBadge}>{row.proctor_events}</span> : <span className={styles.slateBadge}>0</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}><span className={statusCls}>{statusLabel}</span></td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          <button className={styles.secondaryBtn} style={{ fontSize: 11.5, padding: '4px 10px', minHeight: 0 }}
                            onClick={(e) => { e.stopPropagation(); setScreenViewId(row.student_id); }}>
                            Screen
                          </button>
                          <button className={styles.secondaryBtn} style={{ fontSize: 11.5, padding: '4px 10px', minHeight: 0 }}
                            onClick={(e) => { e.stopPropagation(); router.push(`/instructor/sessions/${sessionId}/student/${row.student_id}`); }}>
                            Dossier
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredGrid.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9891a6', padding: 24 }}>
                    {grid.length === 0 ? 'No students in this session yet.' : 'No students match your search.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          <p className={styles.sectionSub} style={{ marginTop: 14, fontSize: 12 }}>
            No screens are shown by default. Click a student's row (or <strong>Screen</strong>) to watch that one
            student live — screen sharing is compulsory at join, so nothing is asked of them mid-session.
            Screenshots keep recording every 30s in the background.
          </p>
        </div>
      )}

      {/* ══ PRESENT & TEACH ══
          Fixed-height layout that fills the viewport below the header.
          Internal scroll is confined to the content area and sidebar — the
          browser window itself never scrolls on this tab.                        */}
      {tab === 'present' && (
        <div style={{
          display: 'flex', flexDirection: 'column',
          flex: 1, minHeight: 0,   /* fills remaining flex space in the shell, no page scroll */
          overflow: 'hidden', position: 'relative',
        }}>

          {/* ── Top control bar — fixed height, never scrolls ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            padding: '10px 16px', background: '#fff', borderRadius: 14,
            boxShadow: '0 1px 6px rgba(0,0,0,.07)', marginBottom: 12,
            border: '1px solid rgba(124,58,237,.1)',
            flexShrink: 0,   /* never shrink, full row always visible */
          }}>
            {/* Experiment selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 220 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Experiment</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, color: '#374151', background: '#fafafa', flex: 1 }}>
                <span style={{ color: '#7c3aed', fontWeight: 600 }}>{(state.experiment?.title as string) || 'Lab'}</span>
                {activeModule && <><span style={{ color: '#9ca3af', margin: '0 4px' }}>›</span><span>{activeModule.title || activeModule.module_type}</span></>}
              </div>
            </div>

            {/* Page navigation — right side */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
              {!contentLoaded ? (
                <Loader2 size={16} className="animate-spin" style={{ color: '#9891a6' }} />
              ) : (
                <>
                  <span style={{ fontSize: 12.5, color: '#9ca3af', whiteSpace: 'nowrap' }}>
                    Page {content.findIndex(p => p.modules.some(m => m.id === activeModuleId)) + 1} of {content.length}
                  </span>
                  {/* Prev / Next */}
                  <button onClick={() => {
                    const allMods = content.flatMap(p => p.modules);
                    const idx = allMods.findIndex(m => m.id === activeModuleId);
                    if (idx > 0) setActiveModuleId(allMods[idx - 1].id);
                  }} style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
                  <button onClick={() => {
                    const allMods = content.flatMap(p => p.modules);
                    const idx = allMods.findIndex(m => m.id === activeModuleId);
                    if (idx < allMods.length - 1) setActiveModuleId(allMods[idx + 1].id);
                  }} style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>

                  {/* Page number pills */}
                  <div style={{ display: 'flex', gap: 4 }}>
                    {content.map((pg, pi) => {
                      const isPageActive = pg.modules.some(m => m.id === activeModuleId);
                      return (
                        <button key={pg.id ?? pi} onClick={() => { if (pg.modules[0]) setActiveModuleId(pg.modules[0].id); }}
                          style={{ width: 28, height: 28, borderRadius: 7, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12.5,
                            background: isPageActive ? 'linear-gradient(135deg,#7c3aed,#9333ea)' : '#f3f4f6',
                            color: isPageActive ? '#fff' : '#6b7280' }}>
                          {pi + 1}
                        </button>
                      );
                    })}
                  </div>

                  {/* Release toggle for active page */}
                  {(() => {
                    const activePg = content.find(p => p.modules.some(m => m.id === activeModuleId));
                    if (!activePg?.id) return null;
                    return (
                      <button onClick={() => releasePage(activePg.id as string, !activePg.is_live)}
                        disabled={busy === `page-${activePg.id}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                          background: activePg.is_live ? '#dcfce7' : '#f3f4f6', color: activePg.is_live ? '#16a34a' : '#6b7280' }}>
                        {busy === `page-${activePg.id}` ? <Loader2 size={12} className="animate-spin" /> : <Rocket size={12} />}
                        {activePg.is_live ? 'Live ✓' : 'Release'}
                      </button>
                    );
                  })()}
                </>
              )}

              {/* Open fullscreen */}
              <button style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 12.5, color: '#374151' }}
                onClick={() => { const w = window.open('', '_blank'); if (w && activeModule) { w.document.write(`<html><body style="margin:0;background:#fff">${activeModule.content_data?.html_content ?? activeModule.title}</body></html>`); }}}>
                <Square size={12} /> Fullscreen
              </button>
            </div>
          </div>

          {/* ── Content area — fills remaining height, both columns scroll internally ── */}
          <div style={{ display: 'flex', gap: 10, flex: 1, minHeight: 0 /* allow flex child to shrink below content size */ }}>

            {/* Page/module sidebar — resizable & minimizable */}
            {presentSidebarMinimized ? (
              <div className={chatStyles.timelineRail} title="Pages & Modules sidebar">
                <button
                  type="button"
                  className={chatStyles.timelineCollapseBtn}
                  onClick={() => setPresentSidebarMinimized(false)}
                  title="Expand Pages & Modules"
                >
                  <ChevronRight size={14} />
                </button>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', width: '100%', alignItems: 'center' }}>
                  {content.map((pg, pi) => (
                    <div
                      key={pg.id ?? pi}
                      className={`${chatStyles.timelineRailNode} ${pg.modules.some(m => m.id === activeModuleId) ? chatStyles.timelineRailNodeActive : ''}`}
                      onClick={() => {
                        if (pg.modules.length > 0) setActiveModuleId(pg.modules[0].id);
                      }}
                      title={`Page ${pi + 1}: ${pg.title} (${pg.modules.length} modules)`}
                    >
                      P{pi + 1}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div style={{ width: presentSidebarWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: '10px 10px', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '.05em' }}>Modules</span>
                      <span style={{ fontSize: 10.5, background: '#ede9fe', color: '#7c3aed', padding: '1px 6px', borderRadius: 6, fontWeight: 700 }}>
                        {content.reduce((sum, p) => sum + p.modules.length, 0)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={chatStyles.timelineCollapseBtn}
                      onClick={() => setPresentSidebarMinimized(true)}
                      title="Minimize Sidebar"
                    >
                      <ChevronLeft size={13} />
                    </button>
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto', paddingRight: 2 }}>
                    {!contentLoaded ? null : content.map((pg, pi) => (
                      <div key={pg.id ?? pi} style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.05em', padding: '4px 6px' }}>
                          {pg.title}
                          {pg.is_live
                            ? <span style={{ marginLeft: 6, fontSize: 9.5, background: '#dcfce7', color: '#16a34a', borderRadius: 4, padding: '1px 5px' }}>Live</span>
                            : <span style={{ marginLeft: 6, fontSize: 9.5, background: '#f3f4f6', color: '#9ca3af', borderRadius: 4, padding: '1px 5px' }}>Draft</span>}
                        </div>
                        {pg.modules.map(m => (
                          <div key={m.id} onClick={() => setActiveModuleId(m.id)}
                            style={{ padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, marginBottom: 2,
                              background: activeModuleId === m.id ? 'linear-gradient(135deg,rgba(124,58,237,.12),rgba(147,51,234,.08))' : 'transparent',
                              color: activeModuleId === m.id ? '#6d28d9' : '#6b7280',
                              borderLeft: activeModuleId === m.id ? '3px solid #7c3aed' : '3px solid transparent' }}>
                            <p style={{ margin: 0, fontWeight: activeModuleId === m.id ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title || m.module_type}</p>
                            <p style={{ margin: 0, fontSize: 10.5, color: '#9ca3af' }}>{m.module_type}</p>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Resize handle */}
                <div
                  className={`${chatStyles.timelineResizeHandle} ${isDraggingPresentSidebar ? chatStyles.timelineResizeHandleActive : ''}`}
                  onMouseDown={startResizePresentSidebar}
                  title="Drag to resize sidebar"
                >
                  <div className={chatStyles.timelineResizeBar} />
                </div>
              </>
            )}

            {/* Main content view — the only column that scrolls; includes content + scratchpad */}
            <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', paddingBottom: 24 }}>
              {/* Content card */}
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', overflow: 'hidden', minHeight: 400 }}>
                {!contentLoaded ? (
                  <div style={{ padding: 60, textAlign: 'center', color: '#9891a6' }}>
                    <Loader2 size={22} className="animate-spin" style={{ margin: '0 auto 12px' }} />
                    <p style={{ margin: 0, fontSize: 13 }}>Loading content…</p>
                  </div>
                ) : !activeModule ? (
                  <div style={{ padding: 60, textAlign: 'center', color: '#9891a6' }}>
                    <Presentation size={36} style={{ margin: '0 auto 12px', opacity: .3 }} />
                    <p style={{ margin: 0, fontSize: 13 }}>Select a module from the left to preview it.</p>
                  </div>
                ) : (
                  <div style={{ padding: '20px 24px' }}>
                    {/* Page badge */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                        {(state.experiment?.title as string) || 'Experiment'}
                      </span>
                      <span style={{ fontSize: 11.5, color: '#9ca3af' }}>
                        Page {content.findIndex(p => p.modules.some(m => m.id === activeModuleId)) + 1} of {content.length}
                      </span>
                    </div>
                    <CellPreview block={{ min_watch_pct: 0, ...activeModule } as ContentBlock} />
                  </div>
                )}
              </div>

              {/* Code scratchpad — below the content */}
              <div style={{ marginTop: 12, background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Code2 size={15} color="#7c3aed" />
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Live Code Scratchpad</span>
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>Demo code live — runs in the sandbox</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select className={styles.select} value={scratchLang} onChange={e => setScratchLang(e.target.value)} style={{ width: 'auto', fontSize: 12 }}>
                      {(languages.length ? languages : [{ id: 'python', label: 'Python' } as CompilerLanguage]).map(l => (
                        <option key={l.id} value={l.id}>{l.label}</option>
                      ))}
                    </select>
                    <button className={styles.primaryBtn} onClick={runScratch} disabled={scratchRunning} style={{ padding: '6px 14px', fontSize: 12 }}>
                      {scratchRunning ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Run
                    </button>
                  </div>
                </div>
                <textarea value={scratchCode} onChange={e => setScratchCode(e.target.value)} spellCheck={false}
                  style={{ width: '100%', minHeight: 120, padding: 12, borderRadius: 8, background: '#0f0b17', color: '#e7e3f0', fontFamily: 'ui-monospace,monospace', fontSize: 13, border: '1px solid #2a2440', resize: 'vertical', whiteSpace: 'pre', boxSizing: 'border-box' }} />
                <input value={scratchStdin} onChange={e => setScratchStdin(e.target.value)} placeholder="stdin (optional)"
                  className={styles.input} style={{ marginTop: 8, fontSize: 12 }} />
                {scratchResult && (
                  <pre style={{ marginTop: 10, padding: 12, borderRadius: 8, background: '#0f0b17', color: '#e7e3f0', fontSize: 12.5, whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto', margin: '8px 0 0' }}>
                    {scratchResult.compile_output || scratchResult.stderr || scratchResult.stdout || '(no output)'}
                    {`\n>>> ${scratchResult.status} · ${scratchResult.time_ms ?? '—'}ms`}
                  </pre>
                )}
              </div>
            </div>
          </div>

          {/* ── Screen Share Floating Pop Icon (Docked at bottom-right, doesn't block content) ── */}
          {!sharePanelOpen ? (
            <button
              type="button"
              className={`${chatStyles.sharePopIcon} ${shareState !== 'idle' ? chatStyles.sharePopIconActive : ''}`}
              onClick={() => setSharePanelOpen(true)}
              title={shareState === 'sharing' ? 'Sharing Screen Live - Click for controls' : shareState === 'paused' ? 'Screen Share Paused - Click for controls' : 'Share Screen with Class'}
            >
              {shareState === 'idle' ? (
                <>
                  <div style={{ width: 28, height: 28, borderRadius: 99, background: 'linear-gradient(135deg,#7c3aed,#9333ea)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Monitor size={15} color="#fff" />
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', display: 'block' }}>Share Screen</span>
                    <span style={{ fontSize: 10.5, color: '#9ca3af', display: 'block' }}>Live to students</span>
                  </div>
                </>
              ) : (
                <>
                  <span className={shareState === 'sharing' ? chatStyles.sharePulseDot : chatStyles.sharePulseDotPaused} />
                  <Monitor size={15} color={shareState === 'sharing' ? '#16a34a' : '#d97706'} />
                  <div style={{ textAlign: 'left' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: shareState === 'sharing' ? '#15803d' : '#b45309', display: 'block' }}>
                      {shareState === 'sharing' ? 'Sharing Live' : 'Share Paused'}
                    </span>
                    <span style={{ fontSize: 10.5, color: '#9ca3af', display: 'block' }}>Click for controls</span>
                  </div>
                </>
              )}
            </button>
          ) : (
            /* Popover Card docked at bottom-right */
            <div className={chatStyles.shareDrawerCard}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: shareState === 'sharing' ? '#dcfce7' : '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Monitor size={15} color={shareState === 'sharing' ? '#16a34a' : '#7c3aed'} />
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#0f172a' }}>Screen Sharing</p>
                    <p style={{ margin: 0, fontSize: 10.5, color: '#64748b' }}>
                      {shareState === 'sharing' ? 'Streaming live to students' : shareState === 'paused' ? 'Paused (frozen frame)' : 'Not broadcasting'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className={chatStyles.cardHeaderBtn}
                  onClick={() => setSharePanelOpen(false)}
                  title="Close Controls"
                >
                  <X size={14} />
                </button>
              </div>

              {shareState === 'idle' ? (
                <div style={{ padding: '6px 0' }}>
                  <p style={{ margin: '0 0 10px', fontSize: 11.5, color: '#64748b' }}>
                    Broadcast your display, browser tab, or application directly to all connected students.
                  </p>
                  <button
                    onClick={() => { startScreenShare(); }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '9px 14px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#7c3aed,#9333ea)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(124,58,237,0.25)' }}
                  >
                    <Monitor size={15} /> Start Screen Share
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: shareState === 'sharing' ? '#f0fdf4' : '#fffbeb', border: `1px solid ${shareState === 'sharing' ? '#bbf7d0' : '#fde68a'}` }}>
                    <span className={shareState === 'sharing' ? chatStyles.sharePulseDot : chatStyles.sharePulseDotPaused} />
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: shareState === 'sharing' ? '#166534' : '#92400e' }}>
                      {shareState === 'sharing' ? 'Students see your active screen' : 'Screen share paused for students'}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 2 }}>
                    <button
                      onClick={pauseScreenShare}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#334151' }}
                    >
                      <Square size={13} color="#475569" />
                      {shareState === 'paused' ? 'Resume' : 'Pause'}
                    </button>
                    <button
                      onClick={() => { stopScreenShare(); setSharePanelOpen(false); }}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#dc2626' }}
                    >
                      <X size={14} color="#dc2626" />
                      Stop Share
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* ══ VIDEO CONFERENCE ══
          Always mounted (display:none when on other tabs) so the LiveKit
          connection is never torn down on a tab switch. The whole section
          scrolls vertically so blocks keep a comfortable height instead of
          being squeezed into the viewport.                                    */}
      <div style={{ display: tab === 'video' ? 'flex' : 'none', gap: 14, flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', alignItems: 'flex-start', paddingBottom: 4 }}>
          {/* ── Left column: custom conference (stage + tiles + controls) ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 640 }}>
            {videoToken && LIVEKIT_URL ? (
              <LiveKitRoom serverUrl={LIVEKIT_URL} token={videoToken} connect audio video
                style={{ flex: 1, height: '100%', background: 'transparent' }}
                onDisconnected={() => { setVideoToken(null); setVideoLeft(true); }}>
                <ShareBridge apiRef={shareApiRef} onShareChange={onShareChange} />
                {/* Click a student -> their live screen. Compulsory sharing at join means
                    the track is already published, so no mid-session prompt is needed. */}
                <StudentScreenViewer
                  target={screenViewId ? (() => {
                    const r = grid.find(g => g.student_id === screenViewId);
                    return r ? { student_id: r.student_id, full_name: r.full_name, roll_number: r.roll_number } : null;
                  })() : null}
                  frameEntry={screenViewId ? screenshots[screenViewId] ?? null : null}
                  onClose={() => setScreenViewId(null)}
                  onOpenDossier={(sid) => router.push(`/instructor/sessions/${sessionId}/student/${sid}`)}
                />
                <ConductorConference
                  roster={grid.map(r => ({
                    id: r.student_id, name: r.full_name, roll: r.roll_number,
                    focus: r.focus_score as number | null,
                    connected: !!screenshots[r.student_id] || r.focus_score !== null || (r.attempts ?? 0) > 0 || (r.verified_checkpoints ?? 0) > 0,
                    screenshot: screenshots[r.student_id]?.frames[0]?.frame ?? null,
                  }))}
                  shareActive={shareState !== 'idle'}
                  onToggleShare={() => { void startScreenShare(); }}
                  onSelectStudent={(sid) => { setChatTarget(sid); setLiveSpotlight(true); }}
                  selectedStudentId={chatTarget || null}
                  spotlightFrame={chatTarget ? screenshots[chatTarget]?.frames[0]?.frame ?? null : null}
                  liveSpotlight={liveSpotlight}
                  onClearSpotlight={() => { setChatTarget(''); setLiveSpotlight(false); }}
                  instructorName={user?.full_name || 'Instructor'}
                  notify={toast3}
                />
              </LiveKitRoom>
            ) : (
              /* placeholder until token arrives / not configured */
              <div style={{ flex: 1, borderRadius: 16, background: '#0f0a1e', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#9891a6', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 10, left: 12, background: 'rgba(255,255,255,.12)', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 600, color: '#fff' }}>
                  You (Instructor)
                </div>
                <Video size={48} color="#c4b5fd" style={{ opacity: .4 }} />
                {!LIVEKIT_URL ? (
                  <p style={{ fontSize: 13, textAlign: 'center', maxWidth: 260, margin: 0 }}>Video server not configured.<br /><code style={{ fontSize: 11 }}>NEXT_PUBLIC_LIVEKIT_URL</code> not set.</p>
                ) : !isLive ? (
                  <p style={{ fontSize: 13, margin: 0 }}>Session must be active to join video.</p>
                ) : videoLeft ? (
                  <>
                    <p style={{ fontSize: 13, margin: 0 }}>You left the video room.</p>
                    <button onClick={() => { setVideoLeft(false); setVideoError(null); }}
                      style={{ padding: '8px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#7c3aed,#9333ea)', color: '#fff', fontWeight: 700, fontSize: 12.5 }}>
                      Rejoin video
                    </button>
                  </>
                ) : videoError ? (
                  <p style={{ fontSize: 13, margin: 0, textAlign: 'center', maxWidth: 340, lineHeight: 1.5 }}>{videoError}</p>
                ) : (
                  <><Loader2 size={18} className="animate-spin" /><p style={{ fontSize: 13, margin: 0 }}>Connecting to video room…</p></>
                )}
              </div>
            )}
          </div>

          {/* ── Right panel: Chat / Participants / Screens + Student Controls (Identical to Experiment Side) ──
              Sticky so it stays in view while the left column scrolls.        */}
          {videoSidebarMinimized ? (
            <div className={chatStyles.timelineRail} style={{ position: 'sticky', top: 0, alignSelf: 'flex-start' }} title="Video Right Sidebar">
              <button
                type="button"
                className={chatStyles.timelineCollapseBtn}
                onClick={() => setVideoSidebarMinimized(false)}
                title="Expand Chat & Controls"
              >
                <ChevronLeft size={16} />
              </button>
              <div
                className={`${chatStyles.timelineRailNode} ${rightTab === 'chat' ? chatStyles.timelineRailNodeActive : ''}`}
                onClick={() => { setVideoSidebarMinimized(false); setRightTab('chat'); setChatCardCollapsed(false); }}
                title={`Live Chat (${chatMessages.length})`}
              >
                <MessageSquare size={14} />
              </div>
              <div
                className={`${chatStyles.timelineRailNode} ${rightTab === 'participants' ? chatStyles.timelineRailNodeActive : ''}`}
                onClick={() => { setVideoSidebarMinimized(false); setRightTab('participants'); setChatCardCollapsed(false); }}
                title={`Participants (${grid.length})`}
              >
                <Users size={14} />
              </div>
              <div
                className={`${chatStyles.timelineRailNode} ${rightTab === 'screens' ? chatStyles.timelineRailNodeActive : ''}`}
                onClick={() => { setVideoSidebarMinimized(false); setRightTab('screens'); setChatCardCollapsed(false); }}
                title={`Screens (${Object.keys(screenshots).length})`}
              >
                <Monitor size={14} />
              </div>
              <div
                className={`${chatStyles.timelineRailNode} ${chatTarget ? chatStyles.timelineRailNodeActive : ''}`}
                onClick={() => { setVideoSidebarMinimized(false); setStudentCtrlCollapsed(false); }}
                title="Student Controls"
              >
                <MousePointer2 size={14} />
              </div>
            </div>
          ) : (
            <>
              {/* Resize handle */}
              <div
                className={`${chatStyles.timelineResizeHandle} ${isDraggingVideoSidebar ? chatStyles.timelineResizeHandleActive : ''}`}
                onMouseDown={startResizeVideoSidebar}
                title="Drag to resize panel"
                style={{ alignSelf: 'stretch', cursor: 'col-resize' }}
              >
                <div className={chatStyles.timelineResizeBar} />
              </div>

              <div style={{ width: videoSidebarWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 0, alignSelf: 'flex-start' }}>
                {/* Mini bar to minimize the whole panel */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className={chatStyles.cardHeaderBtn}
                    onClick={() => setVideoSidebarMinimized(true)}
                    title="Minimize Sidebar"
                    style={{ gap: 4, fontSize: 11, padding: '3px 8px' }}
                  >
                    <ChevronRight size={13} />
                    <span>Collapse Panel</span>
                  </button>
                </div>

                {/* ── Tabbed card — identical design, colors, and bounded height to experiment chat ── */}
                <div className={chatStyles.sessionRightSidebar}>
                  {/* Tabs */}
                  <div className={chatStyles.sidebarTabsRow}>
                    <button
                      type="button"
                      className={`${chatStyles.sidebarTabButton} ${rightTab === 'chat' ? chatStyles.sidebarTabActive : ''}`}
                      onClick={() => { setRightTab('chat'); if (chatCardCollapsed) setChatCardCollapsed(false); }}
                    >
                      <MessageSquare size={15} />
                      <span>Live Chat ({chatMessages.length})</span>
                    </button>
                    <button
                      type="button"
                      className={`${chatStyles.sidebarTabButton} ${rightTab === 'participants' ? chatStyles.sidebarTabActive : ''}`}
                      onClick={() => { setRightTab('participants'); if (chatCardCollapsed) setChatCardCollapsed(false); }}
                    >
                      <Users size={15} />
                      <span>Participants ({grid.length})</span>
                    </button>
                    <button
                      type="button"
                      className={`${chatStyles.sidebarTabButton} ${rightTab === 'screens' ? chatStyles.sidebarTabActive : ''}`}
                      onClick={() => { setRightTab('screens'); if (chatCardCollapsed) setChatCardCollapsed(false); }}
                    >
                      <Monitor size={15} />
                      <span>Screens ({Object.keys(screenshots).length})</span>
                    </button>

                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                      <button
                        type="button"
                        className={chatStyles.cardHeaderBtn}
                        onClick={() => setChatCardCollapsed(c => !c)}
                        title={chatCardCollapsed ? "Expand Chat" : "Minimize Chat"}
                      >
                        {chatCardCollapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
                      </button>
                    </div>
                  </div>

                  {!chatCardCollapsed && (
                    <>

              {rightTab === 'chat' && (
                <>
                  {/* Mode segment — Everyone (group) vs Direct (per-student) */}
                  <div className={chatStyles.chatAudiencePills}>
                    <button
                      type="button"
                      className={`${chatStyles.chatAudienceBtn} ${chatAudience === 'everyone' ? chatStyles.chatAudienceActive : ''}`}
                      onClick={() => { setChatAudience('everyone'); setChatTarget(''); }}
                    >
                      <Users size={13} />
                      <span>Group (Everyone)</span>
                    </button>
                    <button
                      type="button"
                      className={`${chatStyles.chatAudienceBtn} ${chatAudience === 'direct' ? chatStyles.chatAudienceActive : ''}`}
                      onClick={() => setChatAudience('direct')}
                    >
                      <Lock size={13} />
                      <span>Direct (Student)</span>
                    </button>
                  </div>

                  {chatAudience === 'direct' && !chatTarget ? (
                    /* ── Contacts list — tap a student to open their thread ── */
                    <div className={chatStyles.chatMessagesStream}>
                      <p style={{ margin: '2px 4px 6px', fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>Tap a student to chat privately:</p>
                      {grid.length === 0 && (
                        <div className={chatStyles.emptyChatBox}>
                          <Users size={24} color="#a1a1aa" />
                          <p className={chatStyles.emptyChatTitle}>No students enrolled</p>
                        </div>
                      )}
                      {grid.map(r => {
                        const online = !!screenshots[r.student_id] || r.focus_score !== null;
                        const thread = chatMessages.filter(m => m.to_id === r.student_id || m.from_id === r.student_id);
                        const last = thread[thread.length - 1];
                        const ini = r.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                        return (
                          <button
                            key={r.student_id}
                            type="button"
                            onClick={() => setChatTarget(r.student_id)}
                            className={chatStyles.participantItem}
                            style={{ cursor: 'pointer', textAlign: 'left', border: '1px solid #e2e8f0', width: '100%' }}
                          >
                            <div style={{ position: 'relative', flexShrink: 0 }}>
                              <div className={chatStyles.chatAvatarBubble} style={{ background: 'linear-gradient(135deg,#7c3aed,#9333ea)' }}>
                                {ini}
                              </div>
                              <span style={{ position: 'absolute', right: -1, bottom: -1, width: 9, height: 9, borderRadius: 99, background: online ? '#10b981' : '#9ca3af', border: '2px solid #fff' }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                                  {r.full_name}
                                </p>
                                {last && <span className={chatStyles.chatTimestamp}>{new Date(last.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>}
                              </div>
                              <p style={{ margin: '1px 0 0', fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {last ? `${last.from_id === user?.id ? 'You: ' : ''}${last.text}` : (r.roll_number || 'No messages yet')}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <>
                      {/* Thread header */}
                      {chatAudience === 'direct' && chatTarget ? (
                        <div className={chatStyles.directChatBanner}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <button
                              type="button"
                              onClick={() => setChatTarget('')}
                              title="Back to students list"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', padding: 0, display: 'flex', alignItems: 'center' }}
                            >
                              <ChevronLeft size={16} />
                            </button>
                            <Lock size={12} />
                            <span>Private 1:1 with {grid.find(r => r.student_id === chatTarget)?.full_name || 'Student'}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setChatTarget('')}
                            title="Close thread"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9333ea', padding: 0, display: 'flex', alignItems: 'center' }}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ) : null}

                      {/* Messages Stream */}
                      <div ref={chatRef} className={chatStyles.chatMessagesStream}>
                        {visibleChat.length === 0 ? (
                          <div className={chatStyles.emptyChatBox}>
                            <MessageSquare size={24} color="#a1a1aa" />
                            <p className={chatStyles.emptyChatTitle}>No messages yet</p>
                            <p className={chatStyles.emptyChatSub}>
                              {chatAudience === 'direct'
                                ? 'Send a private message to this student.'
                                : 'Say hello to everyone in the class session.'}
                            </p>
                          </div>
                        ) : (
                          visibleChat.slice(-40).map((m, idx) => {
                            const own = m.from_id === user?.id;
                            const isInst = (m.from_name || '').includes('Dr.') || (m.from_name || '').includes('Instructor') || own;
                            const msgInitials = (m.from_name || (own ? 'You' : 'Student'))
                              .split(' ')
                              .map(w => w[0])
                              .join('')
                              .slice(0, 2)
                              .toUpperCase();
                            return (
                              <div key={m.id || idx} className={`${chatStyles.chatMessageRow} ${own ? chatStyles.chatMessageOwn : ''}`}>
                                <div
                                  className={chatStyles.chatAvatarBubble}
                                  style={{ background: own ? '#7c3aed' : isInst ? '#9333ea' : '#3b82f6' }}
                                >
                                  {msgInitials}
                                </div>
                                <div className={chatStyles.chatMsgBody}>
                                  <div className={chatStyles.chatMsgHeader}>
                                    <span className={chatStyles.chatSenderName}>{own ? 'You' : m.from_name || 'Student'}</span>
                                    {isInst && <span className={chatStyles.instructorBadgeTag}>Instructor</span>}
                                    <span className={chatStyles.chatTimestamp}>
                                      {new Date(m.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                                    </span>
                                  </div>
                                  <div className={`${chatStyles.chatTextContent} ${own ? chatStyles.chatTextOwn : ''}`}>
                                    {m.text}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Input */}
                      <div className={chatStyles.chatInputWrap}>
                        <input
                          ref={chatInputRef}
                          type="text"
                          className={chatStyles.chatInputField}
                          placeholder={
                            chatTarget
                              ? `Message ${grid.find(r => r.student_id === chatTarget)?.full_name?.split(' ')[0] || 'student'} privately…`
                              : 'Message everyone in class…'
                          }
                          value={chatInput}
                          onChange={e => setChatInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              sendChatMsg();
                            }
                          }}
                        />
                        <button
                          type="button"
                          className={chatStyles.chatSendIconButton}
                          onClick={sendChatMsg}
                          disabled={busy === 'chat' || !chatInput.trim()}
                        >
                          {busy === 'chat' ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Send size={14} />
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}

              {rightTab === 'participants' && (
                <div className={chatStyles.chatMessagesStream}>
                  {grid.length === 0 ? (
                    <div className={chatStyles.emptyChatBox}>
                      <Users size={24} color="#a1a1aa" />
                      <p className={chatStyles.emptyChatTitle}>No students enrolled</p>
                    </div>
                  ) : (
                    grid.map(r => {
                      const online = !!screenshots[r.student_id] || r.focus_score !== null;
                      const ini = r.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                      return (
                        <div key={r.student_id} className={chatStyles.participantItem}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                            <div className={chatStyles.chatAvatarBubble} style={{ background: '#3b82f6' }}>
                              {ini}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {r.full_name}
                              </span>
                              <span style={{ fontSize: 11, color: '#64748b' }}>
                                {r.roll_number || 'Student'}
                              </span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 10.5, fontWeight: 700, color: online ? '#059669' : '#9ca3af', padding: '2px 6px', borderRadius: 6, background: online ? '#ecfdf5' : '#f1f5f9' }}>
                              {online ? 'Active' : 'Waiting'}
                            </span>
                            <button
                              type="button"
                              className={chatStyles.dmInstBtn}
                              onClick={() => {
                                setChatTarget(r.student_id);
                                setChatAudience('direct');
                                setRightTab('chat');
                                setTimeout(() => chatInputRef.current?.focus(), 50);
                              }}
                            >
                              Message
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {rightTab === 'screens' && (
                <div className={chatStyles.chatMessagesStream}>
                  {Object.keys(screenshots).length === 0 ? (
                    <div className={chatStyles.emptyChatBox}>
                      <Monitor size={24} color="#a1a1aa" />
                      <p className={chatStyles.emptyChatTitle}>No screen frames yet</p>
                      <p className={chatStyles.emptyChatSub}>Students stream frames every ~30s.</p>
                    </div>
                  ) : (
                    Object.entries(screenshots).map(([sid, s]) => (
                      <div
                        key={sid}
                        onClick={() => router.push(`/instructor/sessions/${sessionId}/student/${sid}`)}
                        style={{ cursor: 'pointer', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', background: '#fff' }}
                      >
                        <img src={s.frames[0].frame} alt={s.name} style={{ width: '100%', display: 'block' }} />
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', background: '#f8fafc' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{s.name}</span>
                          <span style={{ fontSize: 10.5, color: '#94a3b8' }}>{relTime(s.frames[0].ts)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
                  </>
                )}
            </div>

            {/* ── Student Controls card ── */}
            <div className={chatStyles.studentControlsCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: studentCtrlCollapsed ? 0 : 12 }}>
                <div style={{ width: 30, height: 30, borderRadius: 9, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Monitor size={15} color="#7c3aed" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#111827' }}>Student Controls</p>
                  {!studentCtrlCollapsed && (
                    <p style={{ margin: 0, fontSize: 11, color: '#9ca3af' }}>Select a student to control their session</p>
                  )}
                </div>
                {chatTarget && !studentCtrlCollapsed && (
                  <button title="Clear selection" onClick={() => setChatTarget('')}
                    style={{ width: 24, height: 24, borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                    <X size={12} />
                  </button>
                )}
                <button
                  type="button"
                  className={chatStyles.cardHeaderBtn}
                  onClick={() => setStudentCtrlCollapsed(c => !c)}
                  title={studentCtrlCollapsed ? "Expand Student Controls" : "Minimize Student Controls"}
                >
                  {studentCtrlCollapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
                </button>
              </div>

              {!studentCtrlCollapsed && (
                <>
                  {!chatTarget ? (
                <div style={{ minHeight: 170, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 4px' }}>
                  <div style={{ width: 42, height: 42, borderRadius: 999, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <MousePointer2 size={17} color="#7c3aed" />
                  </div>
                  <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: '#374151', textAlign: 'center' }}>No student selected</p>
                  <p style={{ margin: 0, fontSize: 11, color: '#9891a6', textAlign: 'center', lineHeight: 1.4 }}>Click a student tile or participant row, or pick one below.</p>
                  <select className={styles.select} value="" onChange={e => setChatTarget(e.target.value)} style={{ width: '100%', fontSize: 12.5, marginTop: 4 }}>
                    <option value="">— Select a student —</option>
                    {grid.map(r => <option key={r.student_id} value={r.student_id}>{r.full_name} · {r.roll_number || 'No roll'}</option>)}
                  </select>
                </div>
              ) : (() => {
                const sel = grid.find(r => r.student_id === chatTarget);
                if (!sel) return null;
                const selIni = sel.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                const selOnline = !!screenshots[sel.student_id] || sel.focus_score !== null;
                return (
                  <>
                    {/* Identity row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10, background: '#fafafa', border: '1px solid #f3f4f6', marginBottom: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 99, background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#7c3aed', flexShrink: 0 }}>{selIni}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#111827' }}>{sel.full_name}</p>
                        <p style={{ margin: 0, fontSize: 11, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Contact size={11} /> {sel.roll_number || 'No roll no'}
                        </p>
                      </div>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, background: selOnline ? '#ecfdf5' : '#f3f4f6', color: selOnline ? '#059669' : '#6b7280', borderRadius: 999, padding: '3px 9px', fontSize: 10.5, fontWeight: 700, flexShrink: 0 }}>
                        <span style={{ width: 6, height: 6, borderRadius: 99, background: selOnline ? '#10b981' : '#9ca3af' }} />
                        {selOnline ? 'Active' : 'Waiting'}
                      </span>
                    </div>
                    {/* Live-screen toggle — default is the 30s screenshot; flip
                        to watch the student's live screen, flip back to stop. */}
                    <button onClick={() => setLiveSpotlight(v => !v)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderRadius: 10, marginBottom: 10, cursor: 'pointer',
                        border: liveSpotlight ? 'none' : '1px solid #e5e7eb',
                        background: liveSpotlight ? 'linear-gradient(135deg,#7c3aed,#9333ea)' : '#fff',
                        color: liveSpotlight ? '#fff' : '#374151' }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: liveSpotlight ? 'rgba(255,255,255,.2)' : '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {liveSpotlight ? <MonitorPlay size={16} color="#fff" /> : <Monitor size={16} color="#7c3aed" />}
                      </div>
                      <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700 }}>{liveSpotlight ? 'Watching live screen' : 'View live screen'}</p>
                        <p style={{ margin: 0, fontSize: 10.5, opacity: .85 }}>{liveSpotlight ? 'Tap to return to 30s snapshot' : 'Default shows the 30s snapshot'}</p>
                      </div>
                      <span style={{ width: 34, height: 20, borderRadius: 999, flexShrink: 0, background: liveSpotlight ? 'rgba(255,255,255,.35)' : '#d1d5db', position: 'relative', transition: 'background .15s' }}>
                        <span style={{ position: 'absolute', top: 2, left: liveSpotlight ? 16 : 2, width: 16, height: 16, borderRadius: 99, background: '#fff', transition: 'left .15s' }} />
                      </span>
                    </button>
                    {/* Media Controls (Mute / Unmute / Disable Cam / Enable Cam) */}
                    <div style={{ marginBottom: 10, background: '#f8fafc', padding: '10px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 7 }}>
                        Media Controls
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                        <button onClick={() => videoControl('mute', chatTarget, sel.full_name, true)} disabled={busy === `vc-${chatTarget}`}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 8px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', cursor: 'pointer', fontSize: 11.5, color: '#dc2626', fontWeight: 600 }}>
                          <MicOff size={13} color="#dc2626" /> Mute Mic
                        </button>
                        <button onClick={() => videoControl('mute', chatTarget, sel.full_name, false)} disabled={busy === `vc-${chatTarget}`}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 8px', borderRadius: 8, border: '1px solid #bbf7d0', background: '#f0fdf4', cursor: 'pointer', fontSize: 11.5, color: '#16a34a', fontWeight: 600 }}>
                          <Mic size={13} color="#16a34a" /> Unmute Mic
                        </button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <button onClick={() => videoControl('camera', chatTarget, sel.full_name, true)} disabled={busy === `vc-${chatTarget}`}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 8px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', cursor: 'pointer', fontSize: 11.5, color: '#dc2626', fontWeight: 600 }}>
                          <VideoOff size={13} color="#dc2626" /> Disable Cam
                        </button>
                        <button onClick={() => videoControl('camera', chatTarget, sel.full_name, false)} disabled={busy === `vc-${chatTarget}`}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 8px', borderRadius: 8, border: '1px solid #bbf7d0', background: '#f0fdf4', cursor: 'pointer', fontSize: 11.5, color: '#16a34a', fontWeight: 600 }}>
                          <Video size={13} color="#16a34a" /> Enable Cam
                        </button>
                      </div>
                    </div>

                    {/* Action buttons 2×2 */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 10 }}>
                      {[
                        { Icon: MessageSquare, label: 'Message',        action: () => { setRightTab('chat'); setChatAudience('direct'); setTimeout(() => chatInputRef.current?.focus(), 50); } },
                        { Icon: Focus,         label: 'Focus Nudge',    action: () => sendFocusSignal(chatTarget) },
                        { Icon: Contact,       label: 'Full Dossier',   action: () => router.push(`/instructor/sessions/${sessionId}/student/${chatTarget}`) },
                        { Icon: Square,        label: 'Force Submit',   action: () => setConfirmDialog({ kind: 'force', studentId: chatTarget, who: state?.spark_grid.find(r => r.student_id === chatTarget)?.full_name || 'this student' }) },
                      ].map(({ Icon, label, action }) => (
                        <button key={label} onClick={action} disabled={busy === `vc-${chatTarget}`}
                          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 10px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 11.5, color: '#374151', fontWeight: 500 }}>
                          <Icon size={14} color="#7c3aed" /> {label}
                        </button>
                      ))}
                    </div>
                    {/* Remove student */}
                    <button style={{ width: '100%', padding: '9px', borderRadius: 9, border: 'none', background: '#fee2e2', color: '#dc2626', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                      onClick={() => {
                        void forceSubmit(chatTarget).then(() =>
                          videoControl('remove', chatTarget, sel.full_name).catch(() => undefined));
                      }}>
                      <UserMinus size={14} /> Remove Student
                    </button>
                  </>
                );
              })()}
                </>
              )}
            </div>
          </div>
            </>
          )}
        </div>

      {/* ══ CONTROL & COMMS ══ */}
      {confirmDialog && (
        <div
          onClick={() => setConfirmDialog(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 96000, background: 'rgba(10,7,20,.6)',
            backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: 20,
          }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: 'min(460px, 94vw)', background: '#fff', borderRadius: 14, padding: 22,
            boxShadow: '0 24px 60px rgba(0,0,0,.3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: confirmDialog.kind === 'end' ? '#fee2e2' : '#ede9fe',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {confirmDialog.kind === 'end'
                  ? <Square size={16} color="#b91c1c" />
                  : <Send size={16} color="#7c3aed" />}
              </div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#111827' }}>
                {confirmDialog.kind === 'end' ? 'End this session?' : 'Force submission?'}
              </h3>
            </div>
            <p style={{ margin: '0 0 6px', fontSize: 13, lineHeight: 1.6, color: '#475569' }}>
              {confirmDialog.kind === 'end'
                ? 'Attendance is finalised and grades are computed for every student in this lab. Students lose access to the workbench, and anyone still sharing stops being recorded.'
                : `The current code of ${'who' in confirmDialog ? confirmDialog.who : 'the student'} is submitted as their final attempt. They are told immediately, and a record is kept against them.`}
            </p>
            <p style={{ margin: '0 0 18px', fontSize: 12, color: '#94a3b8' }}>
              {confirmDialog.kind === 'end'
                ? 'This cannot be undone from the conductor.'
                : 'You can still regrade afterwards.'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9 }}>
              <button onClick={() => setConfirmDialog(null)} style={{
                padding: '9px 16px', borderRadius: 9, border: '1px solid #e5e7eb',
                background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
                Cancel
              </button>
              <button
                onClick={() => (confirmDialog.kind === 'end'
                  ? void endSession()
                  : void forceSubmit(confirmDialog.kind === 'force' ? confirmDialog.studentId : undefined))}
                disabled={busy === 'end' || busy === 'force'}
                style={{
                  padding: '9px 16px', borderRadius: 9, border: 'none',
                  background: confirmDialog.kind === 'end' ? '#dc2626' : '#7c3aed',
                  color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}>
                {confirmDialog.kind === 'end' ? 'End session' : 'Force submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'control' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className={styles.gridTwo}>
          {/* Proctor toggles */}
          <div className={styles.sectionCard}>
            <h3 className={styles.sectionTitle}>Proctoring</h3>
            <p className={styles.sectionSub}>
              Applies to every student immediately. Each switch says what the student
              experiences, so nothing here is a guess.
            </p>

            {/* Non-negotiable part of the policy, stated up front. */}
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 12,
              padding: '9px 12px', borderRadius: 10, background: '#f5f3ff', border: '1px solid #ddd6fe',
            }}>
              <ShieldCheck size={15} color="#7c3aed" style={{ marginTop: 1, flexShrink: 0 }} />
              <div>
                <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#4c1d95' }}>
                  Screen sharing is compulsory
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#6d28d9', lineHeight: 1.5 }}>
                  Every student shares from the moment they join until the session ends.
                  Stopping it raises a <strong>high</strong> severity violation and re-blocks
                  their room. No student screen is shown to you unless you open it.
                </p>
              </div>
            </div>

            <div className={styles.list} style={{ marginTop: 12 }}>
              {PROCTOR_FIELDS.map(t => (
                <div key={t.key} className={styles.listRow} style={{ cursor: 'pointer', alignItems: 'flex-start' }}
                  onClick={() => toggleProctor(t.key, !proctor[t.key])}>
                  <div className={styles.rowBody}>
                    <div className={styles.rowTitle} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      {t.label}
                      {t.sev && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase',
                          padding: '1px 6px', borderRadius: 999,
                          background: t.sev === 'high' ? '#fee2e2' : '#fef3c7',
                          color: t.sev === 'high' ? '#b91c1c' : '#92400e',
                        }}>{t.sev}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 2, lineHeight: 1.45 }}>{t.desc}</div>
                    <div style={{ fontSize: 11, color: proctor[t.key] ? '#7c3aed' : '#9ca3af', marginTop: 3, fontWeight: 600 }}>
                      {proctor[t.key] ? '● On — ' : '○ Off — '}{t.effect}
                    </div>
                  </div>
                  <div className={styles.rowSide} style={{ paddingTop: 2 }}>
                    <div style={{ width: 44, height: 24, borderRadius: 12, padding: 2, transition: 'all .15s', background: proctor[t.key] ? '#7c3aed' : '#d1d5db' }}>
                      <div style={{ width: 20, height: 20, borderRadius: 10, background: '#fff', marginLeft: proctor[t.key] ? '22px' : '2px', transition: 'all .15s' }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {!proctor.focus_ml && (
              <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#92400e', background: '#fffbeb',
                          border: '1px solid #fde68a', borderRadius: 8, padding: '8px 10px' }}>
                Focus monitoring is off, so no attention scores are being collected or
                shown for this session. Turn it on to score students every 30 seconds.
              </p>
            )}
            <button className={styles.secondaryBtn} style={{ marginTop: 14 }} onClick={() => setConfirmDialog({ kind: 'force', who: 'ALL students' })} disabled={busy === 'force'}>
              {busy === 'force' ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />} Force Submit All
            </button>
          </div>

          {/* Chat + broadcast */}
          <div className={styles.sectionCard}>
            <h3 className={styles.sectionTitle}>Chat & Broadcast</h3>
            <p className={styles.sectionSub}>Message everyone, or DM one student.</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <select className={styles.select} value={chatTarget} onChange={e => setChatTarget(e.target.value)} style={{ width: 'auto', minWidth: 130 }}>
                <option value="">Everyone</option>
                {grid.map(r => <option key={r.student_id} value={r.student_id}>{r.full_name}</option>)}
              </select>
              <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Type a message…"
                onKeyDown={e => e.key === 'Enter' && sendChatMsg()} className={styles.input} style={{ flex: 1 }} />
              <button onClick={sendChatMsg} disabled={busy === 'chat' || !chatInput.trim()} className={styles.primaryBtn} style={{ padding: '0 14px' }}>
                {busy === 'chat' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>
            <div ref={chatRef} style={{ marginTop: 12, maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {chatMessages.length === 0 ? (
                <div style={{ color: '#9891a6', fontSize: 12, textAlign: 'center', padding: 16 }}>No messages yet.</div>
              ) : chatMessages.slice(-40).map((m, i) => (
                <div key={m.id || i} style={{ padding: '8px 10px', borderRadius: 8, fontSize: 13, background: m.to_id ? 'rgba(245,243,255,.8)' : 'rgba(236,253,245,.8)', border: '1px solid #e5e7eb' }}>
                  <strong style={{ fontSize: 11, color: '#7c3aed' }}>{m.from_name || m.from_id?.slice(0, 8)}</strong>
                  {m.to_id && <span style={{ fontSize: 11, color: '#9ca3af' }}> → DM</span>}
                  <div style={{ marginTop: 2 }}>{m.text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Live proctor feed — what actually happened, when, and to whom. */}
        <div className={styles.sectionCard} style={{ marginTop: 14 }}>
          <div className={styles.sectionHeader}>
            <div>
              <h3 className={styles.sectionTitle}>Proctor feed</h3>
              <p className={styles.sectionSub}>
                Newest first. Every event costs integrity by severity — high −6.0, medium −2.5, low −1.0.
              </p>
            </div>
            <span style={{ fontSize: 12, color: '#6b7280' }}>
              {(state.proctor_feed?.length ?? 0)} event{(state.proctor_feed?.length ?? 0) === 1 ? '' : 's'} this session
            </span>
          </div>
          {!state.proctor_feed?.length ? (
            <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#9891a6' }}>
              Nothing has been flagged yet. Screen-share stops, tab switches, blocked
              copy/paste and fullscreen exits will appear here the moment they happen.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, maxHeight: 280, overflowY: 'auto' }}>
              {state.proctor_feed.slice(0, 25).map(ev => {
                const sev = ev.severity === 'high' ? { bg: '#fee2e2', fg: '#b91c1c' }
                  : ev.severity === 'medium' ? { bg: '#fef3c7', fg: '#92400e' }
                  : { bg: '#f1f5f9', fg: '#475569' };
                const label = ev.event_type.replace(/_/g, ' ');
                const when = ev.recorded_at ? new Date(ev.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
                return (
                  <div key={ev.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px',
                    borderRadius: 9, border: '1px solid #eceaf3', background: '#fff',
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em',
                      padding: '2px 7px', borderRadius: 999, background: sev.bg, color: sev.fg,
                    }}>{ev.severity}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', minWidth: 140 }}>
                      {ev.student_name || 'Student'}
                    </span>
                    <span style={{ fontSize: 12.5, color: '#4b5563', textTransform: 'capitalize' }}>{label}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock3 size={11} /> {when}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </div>
      )}

      </div>{/* end tab content container */}
      </div>{/* end outer flex-column */}
    </InstructorShell>
  );
}
