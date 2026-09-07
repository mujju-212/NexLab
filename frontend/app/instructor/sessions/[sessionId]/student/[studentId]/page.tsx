'use client';

/**
 * Student Details — the full-page dossier the instructor lands on from the
 * SPARK grid's "View" action. Identity header with action buttons, 6 stat
 * cards, tabbed body (Overview / Submissions / Screen & Activity / Code), and
 * an identical slide-in chat room popup matching the live conductor chat system.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, MessageSquare, Monitor, AlertTriangle, Loader2, X,
  Clock, ListChecks, Code2, FileText, Send, ShieldCheck, ChevronDown,
  CheckCircle2, XCircle, Eye, Copy, Check, Lock, Maximize2,
  Mic, MicOff, Video, VideoOff,
} from 'lucide-react';
import { sessionService } from '@/services/session.service';
import InstructorShell from '@/components/layout/InstructorShell';
import { experienceService, type StudentDetail, type ChatMessage, type SubmissionItem } from '@/services/experience.service';
import { useSocket } from '@/hooks/use-socket';
import type {
  StudentScreenshotPayload, ChatMessagePayload, FocusUpdatePayload,
  DirectCheckpointPayload, ProctorAlertPayload,
} from '@/hooks/use-socket';
import styles from '../../../../shared.module.css';
import chatStyles from '../../live/live.module.css';

type Tab = 'overview' | 'submissions' | 'screen' | 'code';

interface ScreenFrame { frame: string; ts: string }
const MAX_FRAMES = 5;

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—';

const fmtChatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });

const relTime = (iso: string | null) => {
  if (!iso) return '—';
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return `${Math.max(1, diffSec)}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays <= 7) return `${diffDays}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const STATUS_COLOR: Record<string, string> = {
  submitted: '#16a34a', graded: '#16a34a', in_progress: '#d97706', not_started: '#9ca3af',
};

export default function StudentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params?.sessionId as string;
  const studentId = params?.studentId as string;

  const [data, setData] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Screen — hidden until the instructor asks for it
  const [frames, setFrames] = useState<ScreenFrame[]>([]);
  const [showScreen, setShowScreen] = useState(false);
  const [viewingFrame, setViewingFrame] = useState<string | null>(null);

  // Submissions inspector
  const [inspectingSub, setInspectingSub] = useState<SubmissionItem | null>(null);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [codeCopied, setCodeCopied] = useState(false);

  // ── Chat panel ────────────────────────────────────────────────────────────
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  const toast3 = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); }, []);

  const load = useCallback(async () => {
    try {
      const res = await experienceService.studentDetail(sessionId, studentId);
      setData(res);
      // Default to inspecting first submission if available
      if (res.submissions.length > 0 && !inspectingSub) {
        setInspectingSub(res.submissions[0]);
        if (res.submissions[0].files) {
          setSelectedFile(Object.keys(res.submissions[0].files)[0] || '');
        }
      }
    } catch (e: any) {
      toast3(e?.response?.data?.error || 'Failed to load student');
    } finally { setLoading(false); }
  }, [sessionId, studentId, toast3, inspectingSub]);

  useEffect(() => { load(); }, [load]);

  // ── Load chat history when panel opens ───────────────────────────────────
  const loadChat = useCallback(async () => {
    setChatLoading(true);
    try {
      const all = await experienceService.getChat(sessionId);
      const thread = all.filter(m =>
        m.to_id === studentId || m.from_id === studentId
      );
      setChatMsgs(thread);
    } catch {
      // silently ignore — chat is non-critical
    } finally { setChatLoading(false); }
  }, [sessionId, studentId]);

  const openChat = useCallback(() => {
    setChatOpen(true);
    loadChat();
  }, [loadChat]);

  // Scroll chat body to bottom whenever messages change or panel opens
  useEffect(() => {
    if (chatOpen) {
      setTimeout(() => {
        chatBodyRef.current?.scrollTo({ top: chatBodyRef.current.scrollHeight, behavior: 'smooth' });
      }, 60);
    }
  }, [chatMsgs, chatOpen]);

  // Focus input when panel opens
  useEffect(() => {
    if (chatOpen) {
      setTimeout(() => chatInputRef.current?.focus(), 80);
    }
  }, [chatOpen]);

  // Collect this student's screenshot frames, live chat, focus, and checkpoint updates
  useSocket({
    sessionId: sessionId || '',
    enabled: !!sessionId,
    onScreenshotFrame: useCallback((p: StudentScreenshotPayload) => {
      if (p.student_id !== studentId) return;
      setFrames(prev => [{ frame: p.frame, ts: p.timestamp }, ...prev].slice(0, MAX_FRAMES));
    }, [studentId]),
    onChatMessage: useCallback((p: ChatMessagePayload) => {
      const msg = p as ChatMessage;
      if (msg.to_id === studentId || msg.from_id === studentId) {
        setChatMsgs(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    }, [studentId]),
    onFocusUpdate: useCallback((p: FocusUpdatePayload) => {
      if (p.student_id !== studentId) return;
      setData(prev => {
        if (!prev) return prev;
        const newScore = p.focus_score;
        const timeline = [...prev.focus_timeline, { at: p.timestamp, score: newScore }];
        return { ...prev, focus_score: newScore, focus_timeline: timeline };
      });
    }, [studentId]),
    onDirectCheckpoint: useCallback((p: DirectCheckpointPayload) => {
      if (p.student_id !== studentId) return;
      setData(prev => {
        if (!prev) return prev;
        const cps = prev.checkpoints.map(cp => cp.id === p.checkpoint_id ? { ...cp, status: p.status, passed_at: new Date().toISOString() } : cp);
        const done = cps.filter(c => c.status === 'verified' || c.status === 'manual_pass').length;
        return { ...prev, checkpoints: cps, checkpoints_done: done };
      });
    }, [studentId]),
    onProctorAlert: useCallback((p: ProctorAlertPayload) => {
      if (p.student_id !== studentId) return;
      setData(prev => {
        if (!prev) return prev;
        const pe = { ...prev.proctor_events, total: prev.proctor_events.total + 1 };
        if (p.type === 'tab_switch') pe.tab_switch += 1;
        else if (p.type === 'fullscreen_exit') pe.fullscreen_exit += 1;
        else if (p.type === 'lockdown_violation') pe.lockdown_violation += 1;
        return { ...prev, proctor_events: pe };
      });
    }, [studentId]),
  });

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text) return;
    setBusy('dm');
    const optimistic: ChatMessage = {
      id: `opt-${Date.now()}`, session_id: sessionId,
      from_id: 'me', to_id: studentId, text,
      at: new Date().toISOString(), from_name: 'You',
    };
    setChatMsgs(prev => [...prev, optimistic]);
    setChatInput('');
    try {
      const sent = await experienceService.sendChat(sessionId, text, studentId);
      setChatMsgs(prev => prev.map(m => m.id === optimistic.id ? { ...sent, from_name: 'You' } : m));
    } catch (e: any) {
      toast3(e?.response?.data?.error || 'Failed to send');
      setChatMsgs(prev => prev.filter(m => m.id !== optimistic.id));
    } finally { setBusy(null); }
  };

  const videoControl = async (action: 'mute' | 'camera', value: boolean) => {
    setBusy(`vc-${action}`);
    try {
      await sessionService.videoControl(sessionId, action, studentId, value);
      toast3(
        value ? `${data?.student.full_name}'s ${action === 'mute' ? 'microphone' : 'camera'} disabled`
          : `${data?.student.full_name}'s ${action === 'mute' ? 'microphone' : 'camera'} enabled`,
      );
    } catch (e: any) {
      const verb = action === 'mute'
        ? (value ? '🔇 Please mute your microphone.' : '🎤 Please unmute your microphone.')
        : (value ? '📵 Please turn off your camera.' : '📹 Please turn on your camera.');
      try {
        await experienceService.sendChat(sessionId, verb, studentId);
        toast3(`Request sent to ${data?.student.full_name}`);
      } catch { toast3(e?.response?.data?.error || 'Failed'); }
    } finally { setBusy(null); }
  };

  const forceSubmit = async () => {
    if (!confirm(`Force submit ${data?.student.full_name}?`)) return;
    setBusy('force');
    try {
      await experienceService.forceSubmit(sessionId, studentId);
      toast3('Student submitted');
      load();
    } catch (e: any) { toast3(e?.response?.data?.error || 'Failed'); }
    finally { setBusy(null); }
  };

  const overrideCp = async (cpId: string, status: 'manual_pass' | 'manual_fail') => {
    setBusy(cpId);
    try {
      await experienceService.checkpointOverride(sessionId, cpId, studentId, status);
      toast3(`Checkpoint ${status === 'manual_pass' ? 'passed' : 'failed'}`);
      load();
    } catch (e: any) { toast3(e?.response?.data?.error || 'Failed'); }
    finally { setBusy(null); }
  };

  // Sparkline path for the focus timeline
  const focusPath = useMemo(() => {
    const pts = data?.focus_timeline ?? [];
    if (pts.length < 2) return null;
    const w = 100, h = 40;
    const step = w / (pts.length - 1);
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(h - (p.score / 100) * h).toFixed(1)}`).join(' ');
  }, [data?.focus_timeline]);

  if (loading) {
    return (
      <InstructorShell activePage="Live Conductor">
        <div style={{ padding: 48, textAlign: 'center', color: '#9891a6' }}>
          <Loader2 size={22} className="animate-spin" style={{ margin: '0 auto 12px' }} /> Loading student dossier…
        </div>
      </InstructorShell>
    );
  }
  if (!data) {
    return (
      <InstructorShell activePage="Live Conductor">
        <div style={{ padding: 48, textAlign: 'center', color: '#ef4444' }}>Student not found in this session.</div>
      </InstructorShell>
    );
  }

  const s = data.student;
  const initials = s.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const isActive = data.attendance_status === 'present' || data.attendance_status === 'late' || data.attendance_status === 'joined' || !!data.joined_at;

  const CARDS = [
    { label: 'Focus Score', value: data.focus_score != null ? `${Math.round(data.focus_score)}%` : '—',
      sub: data.focus_score == null ? 'No signal yet' : data.focus_score >= 70 ? 'Good focus' : data.focus_score >= 50 ? 'Moderate' : 'Low focus',
      Icon: Clock, color: data.focus_score != null && data.focus_score < 50 ? '#dc2626' : '#7c3aed' },
    { label: 'Checkpoints', value: `${data.checkpoints_done} / ${data.checkpoints_total}`,
      sub: data.checkpoints_total > 0 && data.checkpoints_done === data.checkpoints_total ? 'All completed' : 'In progress',
      Icon: ListChecks, color: '#7c3aed' },
    { label: 'Code Executions', value: String(data.code_executions),
      sub: data.last_attempt_at ? `Last: ${relTime(data.last_attempt_at)}` : 'None yet', Icon: Code2, color: '#7c3aed' },
    { label: 'Quiz Status', value: data.quiz_status === 'submitted' ? 'Submitted' : data.quiz_status === 'in_progress' ? 'In progress' : 'Not started',
      sub: data.quiz_score != null ? `Score: ${data.quiz_score}%` : '—', Icon: FileText, color: STATUS_COLOR[data.quiz_status] ?? '#9ca3af' },
    { label: 'Assignment Status', value: data.assignment_status === 'submitted' ? 'Submitted' : data.assignment_status === 'in_progress' ? 'In progress' : 'Not started',
      sub: data.assignment_score != null ? `Score: ${data.assignment_score}%` : '—', Icon: FileText, color: STATUS_COLOR[data.assignment_status] ?? '#9ca3af' },
    { label: 'Screen Sharing', value: frames.length > 0 ? 'Active' : 'Waiting',
      sub: frames.length > 0 ? `${frames.length} snapshot${frames.length !== 1 ? 's' : ''}` : 'No frames yet',
      Icon: Monitor, color: frames.length > 0 ? '#16a34a' : '#9ca3af' },
  ];

  const TABS: { key: Tab; label: string; Icon: typeof Clock }[] = [
    { key: 'overview',    label: 'Overview',          Icon: Clock },
    { key: 'submissions', label: 'Submissions',       Icon: FileText },
    { key: 'screen',      label: 'Screen & Activity', Icon: Monitor },
    { key: 'code',        label: 'Code',              Icon: Code2 },
  ];

  return (
    <InstructorShell activePage="Live Conductor">
      {toast && (
        <div style={{ position: 'fixed', top: 18, right: 18, zIndex: 999, background: '#111827', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13 }}>{toast}</div>
      )}

      {/* Back */}
      <button className={styles.ghostBtn} style={{ marginBottom: 16 }}
        onClick={() => router.push(`/instructor/sessions/${sessionId}/live`)}>
        <ArrowLeft size={14} /> Back to Students
      </button>

      {/* ── Identity header ── */}
      <div className={styles.sectionCard} style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg,#c4b5fd,#a78bfa)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 3 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' }}>{s.full_name}</h2>
              <span className={isActive ? styles.greenBadge : styles.slateBadge}>
                {isActive ? '● Active' : data.attendance_status.replace('_', ' ')}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
              {s.roll_number || '—'} &nbsp;|&nbsp; {data.experiment.title || 'Session'}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>
              {data.joined_at ? `Joined ${fmtTime(data.joined_at)}` : 'Not joined yet'}
              {data.total_time_sec > 0 && ` · ${Math.round(data.total_time_sec / 60)} min elapsed`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {/* Message — opens chat popup */}
            <button className={styles.secondaryBtn} onClick={openChat}>
              <MessageSquare size={14} /> Message Student
              {chatMsgs.length > 0 && (
                <span style={{ marginLeft: 4, background: '#7c3aed', color: '#fff', borderRadius: 99, fontSize: 10, padding: '0 5px', fontWeight: 700 }}>
                  {chatMsgs.length}
                </span>
              )}
            </button>
            <button className={styles.secondaryBtn} onClick={() => { setTab('screen'); setShowScreen(true); }}>
              <Monitor size={14} /> View Screen
            </button>
            <button className={styles.secondaryBtn} style={{ color: '#dc2626' }}
              title="Mute Student Microphone" disabled={busy === 'vc-mute'}
              onClick={() => videoControl('mute', true)}>
              <MicOff size={14} color="#dc2626" /> Mute
            </button>
            <button className={styles.secondaryBtn} style={{ color: '#16a34a' }}
              title="Unmute Student Microphone" disabled={busy === 'vc-mute'}
              onClick={() => videoControl('mute', false)}>
              <Mic size={14} color="#16a34a" /> Unmute
            </button>
            <button className={styles.secondaryBtn} style={{ color: '#dc2626' }}
              title="Disable Student Camera" disabled={busy === 'vc-camera'}
              onClick={() => videoControl('camera', true)}>
              <VideoOff size={14} color="#dc2626" /> Stop Cam
            </button>
            <button className={styles.secondaryBtn} style={{ color: '#16a34a' }}
              title="Enable Student Camera" disabled={busy === 'vc-camera'}
              onClick={() => videoControl('camera', false)}>
              <Video size={14} color="#16a34a" /> Start Cam
            </button>
            <button className={styles.secondaryBtn} style={{ borderColor: 'rgba(239,68,68,.4)', color: '#dc2626' }}
              disabled={busy === 'force'} onClick={forceSubmit}>
              <AlertTriangle size={14} /> Force Submit
            </button>
          </div>
        </div>
      </div>

      {/* ── 6 stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
        {CARDS.map(c => (
          <div key={c.label} className={styles.sectionCard} style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(124,58,237,.09)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <c.Icon size={16} color="#7c3aed" />
              </div>
              <p style={{ margin: 0, fontSize: 11.5, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.04em' }}>{c.label}</p>
            </div>
            <p style={{ margin: 0, fontSize: 21, fontWeight: 700, color: c.color }}>{c.value}</p>
            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#9ca3af' }}>{c.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className={styles.tabRow}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`${styles.tabChip} ${tab === t.key ? styles.tabChipActive : ''}`}>
            <t.Icon size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />{t.label}
          </button>
        ))}
      </div>

      {/* ══ OVERVIEW ══ */}
      {tab === 'overview' && (
        <div className={styles.gridTwo}>
          {/* Session progress (checkpoints) */}
          <div className={styles.sectionCard}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 className={styles.sectionTitle}>Session Progress</h3>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed' }}>{data.checkpoints_done}/{data.checkpoints_total}</span>
            </div>
            {data.checkpoints.length === 0 ? (
              <p className={styles.sectionSub} style={{ padding: 12 }}>No checkpoints defined for this experiment.</p>
            ) : (
              <div style={{ marginTop: 12 }}>
                {data.checkpoints.map(cp => {
                  const done = cp.status === 'verified' || cp.status === 'manual_pass';
                  return (
                    <div key={cp.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                      <div style={{ width: 22, height: 22, borderRadius: 11, flexShrink: 0, background: done ? '#7c3aed' : cp.status === 'claimed' ? '#facc15' : '#e5e7eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                        {done ? '✓' : cp.order}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#374151' }}>{cp.title}</p>
                        <p style={{ margin: 0, fontSize: 11, color: '#9ca3af' }}>
                          {cp.passed_at ? `Completed at ${fmtTime(cp.passed_at)}` : cp.status}
                        </p>
                      </div>
                      <button className={styles.ghostBtn} style={{ fontSize: 10.5, padding: '2px 8px', minHeight: 0 }} disabled={busy === cp.id} onClick={() => overrideCp(cp.id, 'manual_pass')}>Pass</button>
                      <button className={styles.ghostBtn} style={{ fontSize: 10.5, padding: '2px 8px', minHeight: 0 }} disabled={busy === cp.id} onClick={() => overrideCp(cp.id, 'manual_fail')}>Fail</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Focus timeline */}
          <div className={styles.sectionCard}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 className={styles.sectionTitle}>Focus Timeline</h3>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed' }}>{data.focus_score != null ? `${Math.round(data.focus_score)}%` : '—'}</span>
            </div>
            {focusPath ? (
              <>
                <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ width: '100%', height: 90, marginTop: 12 }}>
                  <line x1="0" y1="20" x2="100" y2="20" stroke="#f3f4f6" strokeWidth="0.5" />
                  <path d={focusPath} fill="none" stroke="#7c3aed" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
                </svg>
                <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>
                  {data.focus_timeline.length} samples · {fmtTime(data.focus_timeline[0]?.at ?? null)} → {fmtTime(data.focus_timeline[data.focus_timeline.length - 1]?.at ?? null)}
                </p>
              </>
            ) : (
              <p className={styles.sectionSub} style={{ padding: 12 }}>
                Not enough focus samples yet — signals arrive every 30s while Focus ML is active.
              </p>
            )}
          </div>

          {/* Proctoring status */}
          <div className={styles.sectionCard}>
            <h3 className={styles.sectionTitle}><ShieldCheck size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />Proctoring Status</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginTop: 12 }}>
              {[
                { label: 'Tab Switches',    value: data.proctor_events.tab_switch },
                { label: 'Fullscreen Exits', value: data.proctor_events.fullscreen_exit },
                { label: 'Copy / Paste',    value: data.proctor_events.copy_paste },
                { label: 'Lockdown Violations', value: data.proctor_events.lockdown_violation },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span style={{ color: '#6b7280' }}>{r.label}</span>
                  <span style={{ fontWeight: 700, color: r.value > 0 ? '#d97706' : '#16a34a' }}>
                    {r.value} {r.value > 0 ? '●' : '●'}
                  </span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11.5, color: '#9ca3af', margin: '12px 0 0' }}>
              Total flagged events: <strong>{data.proctor_events.total}</strong>
            </p>
          </div>

          {/* Session info */}
          <div className={styles.sectionCard}>
            <h3 className={styles.sectionTitle}>Session Info</h3>
            <div style={{ marginTop: 12 }}>
              {[
                { label: 'Joined at',    value: fmtTime(data.joined_at) },
                { label: 'Time in lab',  value: `${Math.round(data.total_time_sec / 60)} min` },
                { label: 'Experiment',   value: data.experiment.title || '—' },
                { label: 'Attendance',   value: data.attendance_status.replace('_', ' ') },
                { label: 'Final grade',  value: data.final_grade != null ? `${Math.round(data.final_grade)}%` : 'Not graded' },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f3f4f6', fontSize: 12.5 }}>
                  <span style={{ color: '#6b7280' }}>{r.label}</span>
                  <span style={{ fontWeight: 600, color: '#374151', textTransform: 'capitalize' }}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ SUBMISSIONS ══ */}
      {tab === 'submissions' && (
        <div className={styles.sectionCard}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div>
              <h3 className={styles.sectionTitle}>Submissions & Results</h3>
              <p className={styles.sectionSub}>Inspect code executions, final submissions, and quiz answers for this student.</p>
            </div>
            {data.submissions.length > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', padding: '4px 10px', borderRadius: 99 }}>
                {data.submissions.length} Record{data.submissions.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {data.submissions.length === 0 ? (
            <p className={styles.sectionSub} style={{ padding: 24, textAlign: 'center' }}>Nothing submitted yet.</p>
          ) : (
            <div style={{ overflowX: 'auto', marginTop: 12 }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Score</th>
                    <th>Tests</th>
                    <th>Submitted</th>
                    <th style={{ textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.submissions.map((sub, i) => {
                    const isSelected = inspectingSub?.id === sub.id;
                    return (
                      <tr key={sub.id || i} style={{ background: isSelected ? '#f5f3ff' : undefined }}>
                        <td className={styles.tdStrong}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            color: sub.type === 'Quiz' ? '#9333ea' : '#7c3aed', fontWeight: 700
                          }}>
                            {sub.type === 'Quiz' ? <FileText size={13} /> : <Code2 size={13} />}
                            {sub.type}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{sub.title}</td>
                        <td>
                          <span className={sub.status === 'graded' || sub.status === 'submitted' ? styles.greenBadge : styles.amberBadge}>
                            {sub.status}
                          </span>
                        </td>
                        <td className={styles.tdStrong}>{sub.score != null ? `${sub.score}%` : '—'}</td>
                        <td>{sub.tests || '—'}</td>
                        <td style={{ color: '#6b7280', fontSize: 12 }}>{fmtTime(sub.at)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className={styles.secondaryBtn}
                            style={{ fontSize: 11.5, padding: '4px 12px', minHeight: 0 }}
                            onClick={() => {
                              setInspectingSub(sub);
                              if (sub.files && Object.keys(sub.files).length > 0) {
                                setSelectedFile(Object.keys(sub.files)[0]);
                              }
                            }}
                          >
                            <Eye size={12} /> {isSelected ? 'Viewing' : 'Inspect'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Submission Inspection Detail View ── */}
          {inspectingSub && (
            <div style={{
              marginTop: 20, padding: 20, borderRadius: 16,
              background: '#fdfcff', border: '1.5px solid #ede9fe',
              boxShadow: '0 4px 20px rgba(124, 58, 237, 0.05)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 9, background: '#ede9fe',
                    color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    {inspectingSub.type === 'Quiz' ? <FileText size={17} /> : <Code2 size={17} />}
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>
                      {inspectingSub.title} — Details
                    </h4>
                    <p style={{ margin: 0, fontSize: 11.5, color: '#6b7280' }}>
                      Submitted {fmtTime(inspectingSub.at)} · Score: {inspectingSub.score != null ? `${inspectingSub.score}%` : '—'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectingSub(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4 }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Quiz questions breakdown */}
              {inspectingSub.type === 'Quiz' && (
                <div>
                  {(!inspectingSub.questions || inspectingSub.questions.length === 0) ? (
                    <div style={{ padding: 18, background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', color: '#64748b', fontSize: 13, textAlign: 'center' }}>
                      Quiz recorded with score <strong>{inspectingSub.score}%</strong>. No per-question breakdown is logged for this attempt.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {inspectingSub.questions.map((q, qidx) => (
                        <div key={q.id || qidx} style={{
                          background: '#fff', borderRadius: 12, padding: 14,
                          border: q.is_correct ? '1px solid #d1fae5' : '1px solid #fee2e2'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#111827' }}>
                              Q{qidx + 1}. {q.question}
                            </p>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                              background: q.is_correct ? '#ecfdf5' : '#fef2f2',
                              color: q.is_correct ? '#059669' : '#dc2626'
                            }}>
                              {q.is_correct ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                              {q.is_correct ? 'Correct' : 'Incorrect'}
                            </span>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {q.options && q.options.map((opt, oidx) => {
                              const isSelected = q.selected === opt || q.selected === String.fromCharCode(65 + oidx);
                              const isCorrectAnswer = q.correct_answer === opt || q.correct_answer === String.fromCharCode(65 + oidx);
                              let optBg = '#f8fafc';
                              let optBorder = '#e2e8f0';
                              let optColor = '#334155';
                              if (isCorrectAnswer) {
                                optBg = '#ecfdf5';
                                optBorder = '#a7f3d0';
                                optColor = '#065f46';
                              } else if (isSelected && !q.is_correct) {
                                optBg = '#fef2f2';
                                optBorder = '#fecaca';
                                optColor = '#991b1b';
                              }
                              return (
                                <div key={oidx} style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                  padding: '7px 12px', borderRadius: 8, background: optBg, border: `1px solid ${optBorder}`,
                                  fontSize: 12.5, color: optColor
                                }}>
                                  <span>{String.fromCharCode(65 + oidx)}. {opt}</span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {isSelected && (
                                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: q.is_correct ? '#10b981' : '#ef4444', color: '#fff' }}>
                                        Student Answer
                                      </span>
                                    )}
                                    {isCorrectAnswer && (
                                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#059669', color: '#fff' }}>
                                        Correct
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {q.explanation && (
                            <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#6b7280', fontStyle: 'italic' }}>
                              💡 Explanation: {q.explanation}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Code / Assignment inspection */}
              {inspectingSub.type !== 'Quiz' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Meta badges */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {inspectingSub.language && (
                      <span style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ede9fe' }}>
                        Language: {inspectingSub.language}
                      </span>
                    )}
                    {inspectingSub.compile_status && (
                      <span style={{
                        fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                        background: inspectingSub.compile_status === 'success' ? '#ecfdf5' : '#fef2f2',
                        color: inspectingSub.compile_status === 'success' ? '#059669' : '#dc2626',
                        border: `1px solid ${inspectingSub.compile_status === 'success' ? '#a7f3d0' : '#fecaca'}`
                      }}>
                        Status: {inspectingSub.compile_status}
                      </span>
                    )}
                    {inspectingSub.tests && (
                      <span style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: '#f8fafc', color: '#334155', border: '1px solid #e2e8f0' }}>
                        Test Cases: {inspectingSub.tests} passed
                      </span>
                    )}
                    {inspectingSub.loc != null && (
                      <span style={{ fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 8, background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' }}>
                        {inspectingSub.loc} LOC
                      </span>
                    )}
                    {inspectingSub.quality_grade && (
                      <span style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: '#ede9fe', color: '#9333ea', border: '1px solid #ddd6fe' }}>
                        Quality: {inspectingSub.quality_grade}
                      </span>
                    )}
                  </div>

                  {/* Code editor preview */}
                  {inspectingSub.files && Object.keys(inspectingSub.files).length > 0 ? (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {Object.keys(inspectingSub.files).map(fname => (
                            <button
                              key={fname}
                              type="button"
                              onClick={() => setSelectedFile(fname)}
                              style={{
                                padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                                border: (selectedFile || Object.keys(inspectingSub.files!)[0]) === fname ? '1px solid #7c3aed' : '1px solid #e2e8f0',
                                background: (selectedFile || Object.keys(inspectingSub.files!)[0]) === fname ? '#7c3aed' : '#fff',
                                color: (selectedFile || Object.keys(inspectingSub.files!)[0]) === fname ? '#fff' : '#64748b',
                                cursor: 'pointer'
                              }}
                            >
                              {fname}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const curCode = inspectingSub.files?.[selectedFile || Object.keys(inspectingSub.files!)[0]] || '';
                            navigator.clipboard.writeText(curCode);
                            setCodeCopied(true);
                            setTimeout(() => setCodeCopied(false), 2000);
                          }}
                          className={styles.ghostBtn}
                          style={{ fontSize: 11.5, padding: '3px 10px', minHeight: 0 }}
                        >
                          {codeCopied ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                          {codeCopied ? 'Copied' : 'Copy Code'}
                        </button>
                      </div>

                      <pre style={{
                        margin: 0, padding: 14, borderRadius: 10, background: '#0f0b17', color: '#e7e3f0',
                        fontSize: 12.5, overflow: 'auto', maxHeight: 320, whiteSpace: 'pre',
                        fontFamily: "'JetBrains Mono', monospace"
                      }}>
                        {inspectingSub.files[selectedFile || Object.keys(inspectingSub.files)[0]] || ''}
                      </pre>
                    </div>
                  ) : (
                    <div style={{ padding: 16, background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', color: '#64748b', fontSize: 12.5 }}>
                      No code files recorded for this attempt.
                    </div>
                  )}

                  {/* Standard output / error output */}
                  {(inspectingSub.stdout || inspectingSub.stderr || inspectingSub.compile_output) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {inspectingSub.stdout && (
                        <div>
                          <p style={{ margin: '0 0 4px', fontSize: 11.5, fontWeight: 700, color: '#374151' }}>Standard Output:</p>
                          <pre style={{ margin: 0, padding: 10, borderRadius: 8, background: '#1e1b2e', color: '#a7f3d0', fontSize: 12, overflow: 'auto', maxHeight: 150 }}>
                            {inspectingSub.stdout}
                          </pre>
                        </div>
                      )}
                      {(inspectingSub.stderr || inspectingSub.compile_output) && (
                        <div>
                          <p style={{ margin: '0 0 4px', fontSize: 11.5, fontWeight: 700, color: '#dc2626' }}>Error / Compiler Output:</p>
                          <pre style={{ margin: 0, padding: 10, borderRadius: 8, background: '#261215', color: '#fca5a5', fontSize: 12, overflow: 'auto', maxHeight: 150 }}>
                            {inspectingSub.stderr || inspectingSub.compile_output}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ SCREEN & ACTIVITY ══ */}
      {tab === 'screen' && (
        <div className={styles.sectionCard}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3 className={styles.sectionTitle}>Live Screen Sharing</h3>
              <p className={styles.sectionSub}>
                {frames.length > 0
                  ? `Student screen stream active — ${frames.length} snapshot${frames.length !== 1 ? 's' : ''} buffered.`
                  : 'Waiting for student to share screen or broadcast frames in the session.'}
              </p>
            </div>
            {frames.length > 0 && (
              showScreen ? (
                <button className={styles.ghostBtn} onClick={() => setShowScreen(false)}><X size={13} /> Hide screen</button>
              ) : (
                <button className={styles.primaryBtn} onClick={() => setShowScreen(true)}>
                  <Monitor size={14} /> Show screen ({frames.length})
                </button>
              )
            )}
          </div>

          {frames.length === 0 ? (
            <p className={styles.sectionSub} style={{ padding: 24, textAlign: 'center' }}>
              No snapshots received yet. When the student shares their screen during the lab, frames stream live here.
            </p>
          ) : !showScreen ? (
            <p className={styles.sectionSub} style={{ padding: 24, textAlign: 'center' }}>
              {frames.length} snapshot{frames.length !== 1 ? 's' : ''} buffered — click <strong>Show screen</strong> to view.
            </p>
          ) : (
            <div style={{ marginTop: 14 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => setViewingFrame(frames[0].frame)}>
                <img src={frames[0].frame} alt="latest screen"
                  style={{ width: '100%', borderRadius: 12, border: '1px solid #e5e7eb', background: '#0f0a1e', display: 'block' }} />
                <button
                  type="button"
                  style={{
                    position: 'absolute', top: 12, right: 12, background: 'rgba(0,0,0,0.65)',
                    color: '#fff', border: 'none', borderRadius: 8, padding: '6px 10px',
                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer'
                  }}
                >
                  <Maximize2 size={13} /> Fullscreen
                </button>
              </div>
              <p style={{ fontSize: 11.5, color: '#9ca3af', margin: '6px 0 14px' }}>Latest snapshot · updated {relTime(frames[0].ts)}</p>

              {frames.length > 1 && (
                <>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Recent snapshots ({frames.length})</p>
                  <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6 }}>
                    {frames.map((f, i) => (
                      <div key={i} style={{ flex: '0 0 auto', width: 150, cursor: 'pointer' }} onClick={() => setViewingFrame(f.frame)}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f.frame} alt={`snapshot ${i + 1}`}
                          style={{ width: 150, height: 98, objectFit: 'cover', borderRadius: 8, border: i === 0 ? '2px solid #7c3aed' : '1px solid #e5e7eb', display: 'block' }} />
                        <p style={{ fontSize: 10.5, color: '#9ca3af', margin: '3px 0 0', textAlign: 'center' }}>{relTime(f.ts)}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Screen Lightbox */}
      {viewingFrame && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
        }} onClick={() => setViewingFrame(null)}>
          <div style={{ position: 'relative', maxWidth: '95vw', maxHeight: '95vh' }} onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={viewingFrame} alt="full screen snapshot" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 12, boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }} />
            <button
              type="button"
              onClick={() => setViewingFrame(null)}
              style={{
                position: 'absolute', top: -14, right: -14, width: 32, height: 32,
                borderRadius: '50%', background: '#fff', color: '#111', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                boxShadow: '0 2px 10px rgba(0,0,0,0.3)'
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ══ CODE ══ */}
      {tab === 'code' && (
        <div className={styles.sectionCard}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <h3 className={styles.sectionTitle}>Latest Code Snapshot</h3>
              <p className={styles.sectionSub}>
                {data.latest_code.saved_at
                  ? `Saved ${fmtTime(data.latest_code.saved_at)} (${relTime(data.latest_code.saved_at)}) · ${data.latest_code.save_type ?? 'auto'}`
                  : 'No code saved yet for this session.'}
              </p>
            </div>
          </div>
          {data.latest_code.files && Object.keys(data.latest_code.files).length > 0 ? (
            <div style={{ marginTop: 12 }}>
              {Object.entries(data.latest_code.files).map(([name, code]) => (
                <div key={name} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                    <p style={{ fontSize: 12.5, fontWeight: 700, color: '#7c3aed', margin: 0 }}>{name}</p>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(code);
                        toast3(`Copied ${name}`);
                      }}
                      className={styles.ghostBtn}
                      style={{ fontSize: 11, padding: '2px 8px', minHeight: 0 }}
                    >
                      <Copy size={11} /> Copy
                    </button>
                  </div>
                  <pre style={{
                    margin: 0, padding: 14, borderRadius: 10, background: '#0f0b17', color: '#e7e3f0',
                    fontSize: 12.5, overflow: 'auto', maxHeight: 420, whiteSpace: 'pre',
                    fontFamily: "'JetBrains Mono', monospace"
                  }}>
                    {code}
                  </pre>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.sectionSub} style={{ padding: 20, textAlign: 'center' }}>Nothing to show — the student has not saved code in this session.</p>
          )}
        </div>
      )}

      {/* ══ CHAT POPUP (IDENTICAL AESTHETICS TO LIVE CONDUCTOR / EXPERIMENT CHAT) ══ */}
      <div style={{
        position: 'fixed', bottom: 24, right: 28, zIndex: 900,
        width: 370,
        boxShadow: '0 12px 40px rgba(0,0,0,0.16)',
        borderRadius: 18,
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
        background: '#fff',
        display: 'flex', flexDirection: 'column',
        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        {/* Header / collapsed toggle */}
        <button
          type="button"
          onClick={() => chatOpen ? setChatOpen(false) : openChat()}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 16px', background: 'linear-gradient(135deg,#7c3aed,#9333ea)',
            border: 'none', cursor: 'pointer', color: '#fff', width: '100%', textAlign: 'left',
            flexShrink: 0,
          }}
        >
          <div style={{
            width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5,
            fontWeight: 800, color: '#fff', flexShrink: 0
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, lineHeight: 1.2, color: '#fff' }}>{s.full_name}</p>
            <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.85)' }}>
              {chatOpen ? 'Private 1:1 conversation' : 'Click to open private chat'}
            </p>
          </div>
          {chatMsgs.length > 0 && !chatOpen && (
            <span style={{ background: '#fff', color: '#7c3aed', borderRadius: 99, padding: '2px 7px', fontSize: 11, fontWeight: 800 }}>
              {chatMsgs.length}
            </span>
          )}
          <ChevronDown size={17} style={{ color: '#fff', transform: chatOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s' }} />
        </button>

        {chatOpen && (
          <div style={{ height: 460, display: 'flex', flexDirection: 'column', background: '#fff' }}>
            {/* Direct 1:1 notice banner */}
            <div className={chatStyles.directChatBanner} style={{ margin: '10px 12px 0', padding: '6px 10px', fontSize: 11 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Lock size={12} />
                <span>Private 1:1 thread with {s.full_name}</span>
              </div>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                title="Close"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', padding: 0 }}
              >
                <X size={13} />
              </button>
            </div>

            {/* Messages Stream */}
            <div ref={chatBodyRef} className={chatStyles.chatMessagesStream} style={{ flex: 1, padding: '12px', minHeight: 0, maxHeight: 'none' }}>
              {chatLoading ? (
                <div className={chatStyles.emptyChatBox}>
                  <Loader2 size={20} className="animate-spin" color="#7c3aed" />
                  <p className={chatStyles.emptyChatTitle}>Loading conversation…</p>
                </div>
              ) : chatMsgs.length === 0 ? (
                <div className={chatStyles.emptyChatBox}>
                  <MessageSquare size={26} color="#a1a1aa" />
                  <p className={chatStyles.emptyChatTitle}>No messages yet</p>
                  <p className={chatStyles.emptyChatSub}>Send a private message to {s.full_name.split(' ')[0]}.</p>
                </div>
              ) : (
                chatMsgs.map((m, idx) => {
                  const isMe = m.from_id !== studentId;
                  const senderInitials = isMe ? 'YOU' : initials;
                  return (
                    <div key={m.id || idx} className={`${chatStyles.chatMessageRow} ${isMe ? chatStyles.chatMessageOwn : ''}`}>
                      <div
                        className={chatStyles.chatAvatarBubble}
                        style={{ background: isMe ? '#7c3aed' : '#3b82f6' }}
                      >
                        {senderInitials}
                      </div>
                      <div className={chatStyles.chatMsgBody}>
                        <div className={chatStyles.chatMsgHeader}>
                          <span className={chatStyles.chatSenderName}>{isMe ? 'You (Instructor)' : s.full_name}</span>
                          {isMe && <span className={chatStyles.instructorBadgeTag}>Instructor</span>}
                          <span className={chatStyles.chatTimestamp}>{fmtChatTime(m.at)}</span>
                        </div>
                        <div className={`${chatStyles.chatTextContent} ${isMe ? chatStyles.chatTextOwn : ''}`}>
                          {m.text}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Input Bar */}
            <div style={{ padding: '8px 12px 12px', borderTop: '1px solid #f1f5f9' }}>
              <div className={chatStyles.chatInputWrap}>
                <input
                  ref={chatInputRef}
                  type="text"
                  className={chatStyles.chatInputField}
                  placeholder={`Message ${s.full_name.split(' ')[0]} privately…`}
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendChat();
                    }
                  }}
                />
                <button
                  type="button"
                  className={chatStyles.chatSendIconButton}
                  onClick={sendChat}
                  disabled={busy === 'dm' || !chatInput.trim()}
                >
                  {busy === 'dm' ? <Loader2 size={13} className="animate-spin" /> : <Send size={14} />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom padding so the fixed chat button doesn't overlap content */}
      <div style={{ height: 80 }} />
    </InstructorShell>
  );
}
