'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Radio, Play, Square, MonitorPlay, Video, RefreshCw,
  Users, AlertTriangle, Code, X, Maximize2, Minimize2, Monitor,
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import { sessionService } from '@/services/session.service';
import { useSocket } from '@/hooks/use-socket';
import type { StudentScreenshotPayload } from '@/hooks/use-socket';
import styles from '../shared.module.css';

// Lazy-load LiveKit so the bundle isn't bloated when the module is absent
// (npm install @livekit/components-react @livekit/components-styles livekit-client)
let LiveKitRoom: React.ComponentType<{
  serverUrl: string; token: string; connect: boolean;
  audio: boolean; video: boolean; style?: React.CSSProperties;
  children: React.ReactNode;
}> | null = null;
let VideoConference: React.ComponentType | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const lk = require('@livekit/components-react');
  LiveKitRoom     = lk.LiveKitRoom;
  VideoConference = lk.VideoConference;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@livekit/components-styles');
} catch {
  // Package not yet installed — video room will show an install-prompt fallback
}

interface LiveStudent {
  student_id: string;
  full_name: string;
  roll_number: string;
  status: string;               // present | absent | late | partial | inactive_present
  joined_at: string | null;
  total_time_sec: number;
  focus_score: number | null;
  attempt_count: number;
  is_active: boolean;
}

interface SessionMeta {
  id: string;
  status: 'scheduled' | 'active' | 'ended';
  experiment_title: string;
  section_name: string | null;
  subject_name: string | null;
  student_count: number;
  jitsi_room_name: string;
  scheduled_at: string;
}

interface ScreenshotEntry {
  frame: string;    // base64 JPEG data-URL
  name: string;
  ts: string;       // ISO-8601
}

const errText = (err: unknown) =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error
  || 'Something went wrong';

function LiveLabInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionParam = searchParams.get('session');

  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(sessionParam);
  const [students, setStudents] = useState<LiveStudent[]>([]);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoMaximized, setVideoMaximized] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── LiveKit state ────────────────────────────────────────────────────────────
  const [livekitToken, setLivekitToken] = useState<string | null>(null);
  const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || '';

  // ── Student screenshot monitoring grid ──────────────────────────────────────
  const [screenshots, setScreenshots] = useState<Record<string, ScreenshotEntry>>({});

  const toast3 = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Socket — listen for student screenshots (instructor side) ───────────────
  const isLiveForSocket = sessionStatus === 'active' || false;
  useSocket({
    sessionId: sessionId || '',
    enabled: !!sessionId && isLiveForSocket,
    onScreenshotFrame: useCallback((data: StudentScreenshotPayload) => {
      setScreenshots(prev => ({
        ...prev,
        [data.student_id]: {
          frame: data.frame,
          name:  data.full_name,
          ts:    data.timestamp,
        },
      }));
    }, []),
  });

  // ── Load all sessions once ──────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await sessionService.list();
        if (!mounted) return;
        const list = (res.sessions ?? []) as SessionMeta[];
        setSessions(list);
        if (!sessionParam) {
          const active = list.find((s) => s.status === 'active');
          if (active) setSessionId(active.id);
        }
      } catch (err) {
        if (mounted) toast3(errText(err));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [sessionParam, toast3]);

  const currentSession = sessions.find((s) => s.id === sessionId) ?? null;

  // ── Poll the live dashboard ─────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await sessionService.getLiveDashboard(sessionId);
        if (cancelled) return;
        setStudents(res.students ?? []);
        setSessionStatus(res.session_status ?? null);
        if (res.session_status === 'ended' && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch { /* transient poll errors are silent */ }
    };

    poll();
    pollRef.current = setInterval(poll, 8000);
    return () => {
      cancelled = true;
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [sessionId]);

  const handleEndSession = async () => {
    if (!sessionId) return;
    if (!window.confirm('End this session for all students? Attendance will be finalized.')) return;
    setBusy(true);
    try {
      await sessionService.end(sessionId);
      toast3('Session ended');
      setSessionStatus('ended');
      const res = await sessionService.list();
      setSessions((res.sessions ?? []) as SessionMeta[]);
    } catch (err) {
      toast3(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const handleStartSession = async (id: string) => {
    setBusy(true);
    try {
      const res = await sessionService.start(id) as { livekit_token?: string | null };
      setSessionId(id);
      setSessionStatus('active');
      // Capture the LiveKit instructor token from the start response
      if (res.livekit_token) setLivekitToken(res.livekit_token);
      const listRes = await sessionService.list();
      setSessions((listRes.sessions ?? []) as SessionMeta[]);
      toast3('Session started');
    } catch (err) {
      toast3(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const connected    = students.filter((s) => s.joined_at).length;
  const lowFocus     = students.filter((s) => s.focus_score !== null && s.focus_score < 60).length;
  const totalAttempts = students.reduce((sum, s) => sum + (s.attempt_count || 0), 0);
  const isLive       = sessionStatus === 'active' || currentSession?.status === 'active';

  // Relative time helper for screenshot grid
  const relTime = (iso: string) => {
    const diffMs = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diffMs / 1000);
    if (s < 60) return `${s}s ago`;
    return `${Math.floor(s / 60)}m ago`;
  };

  return (
    <InstructorShell
      activePage="Live Lab Control"
      title="Live Lab Control Center"
      subtitle="Monitor active class sessions, student focus scores, attempts, and attendance in real time"
    >
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1000, background: '#201b2e',
          color: '#fff', padding: '12px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
        }}>
          {toast}
        </div>
      )}

      {/* ── No session selected: picker ─────────────────────────────────────── */}
      {!sessionId && !loading && (
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>No live session selected</h2>
              <p className={styles.sectionSub}>Pick a session below to monitor, or start a scheduled one.</p>
            </div>
            <button type="button" className={styles.primaryBtn} onClick={() => router.push('/instructor/sessions')}>
              <Play size={15} /> Go to Sessions
            </button>
          </div>
          <div className={styles.list}>
            {sessions.slice(0, 10).map((s) => (
              <div key={s.id} className={styles.listRow}>
                <div className={styles.rowBody}>
                  <p className={styles.rowTitle}>{s.experiment_title}</p>
                  <p className={styles.rowSub}>
                    {s.subject_name ?? '—'} · {s.section_name ?? '—'} · {s.student_count} students
                  </p>
                </div>
                <div className={styles.rowSide} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className={`${styles.pill} ${s.status === 'active' ? styles.pillGreen : s.status === 'scheduled' ? styles.pillBlue : styles.pillSlate}`}>
                    {s.status}
                  </span>
                  {s.status === 'scheduled' ? (
                    <button type="button" className={styles.primaryBtn} disabled={busy}
                      onClick={() => handleStartSession(s.id)}>
                      <Play size={14} /> Start
                    </button>
                  ) : (
                    <button type="button" className={styles.secondaryBtn} onClick={() => setSessionId(s.id)}>
                      <MonitorPlay size={14} /> Monitor
                    </button>
                  )}
                </div>
              </div>
            ))}
            {sessions.length === 0 && (
              <p className={styles.sectionSub} style={{ padding: 16 }}>
                No sessions yet. Schedule one from the Sessions page.
              </p>
            )}
          </div>
        </section>
      )}

      {/* ── Session selected ─────────────────────────────────────────────────── */}
      {sessionId && (
        <>
          {/* Session Header Banner */}
          <div className={styles.sectionCard} style={{
            background: isLive ? 'linear-gradient(135deg, rgba(124,58,237,0.08), rgba(15,118,110,0.08))' : '#faf5ff',
            marginBottom: 22,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span className={`${styles.badge} ${isLive ? styles.greenBadge : styles.slateBadge}`}>
                    <Radio size={14} /> {isLive ? 'Live Session Active' : sessionStatus === 'ended' ? 'Session Ended' : 'Session Not Started'}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>
                    {currentSession?.subject_name ?? '—'} · {currentSession?.section_name ?? '—'}
                  </span>
                </div>
                <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
                  {currentSession?.experiment_title ?? 'Live Session'}
                </h2>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" className={styles.ghostBtn} onClick={() => { setSessionId(null); setStudents([]); }}>
                  <RefreshCw size={15} /> Switch Session
                </button>
                {/* Show "Open Video Room" when session has a room name — LiveKit or legacy */}
                {currentSession?.jitsi_room_name && (
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() => setVideoOpen(true)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Video size={15} /> Open Video Room
                  </button>
                )}
                {isLive ? (
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    style={{ background: 'linear-gradient(135deg, #dc2626, #b91c1c)' }}
                    disabled={busy}
                    onClick={handleEndSession}
                  >
                    <Square size={15} /> {busy ? 'Ending…' : 'End Session'}
                  </button>
                ) : currentSession?.status === 'scheduled' ? (
                  <button type="button" className={styles.primaryBtn} disabled={busy}
                    onClick={() => handleStartSession(sessionId)}>
                    <Play size={15} /> Start Session
                  </button>
                ) : (
                  <button type="button" className={styles.secondaryBtn}
                    onClick={() => router.push('/instructor/grading')}>
                    <Code size={15} /> Grade Submissions
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* KPI Stats */}
          <div className={styles.kpiRow}>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Connected Students</p>
              <p className={styles.kpiValue} style={{ color: '#7c3aed' }}>
                {connected} / {currentSession?.student_count ?? students.length}
              </p>
              <p className={styles.kpiSub}>{students.filter((s) => s.is_active).length} active participants</p>
            </div>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Low Focus Alerts</p>
              <p className={styles.kpiValue} style={{ color: lowFocus > 0 ? '#b45309' : '#16a34a' }}>
                {String(lowFocus).padStart(2, '0')}
              </p>
              <p className={styles.kpiSub}>Focus score below 60</p>
            </div>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Code Executions</p>
              <p className={styles.kpiValue} style={{ color: '#7c3aed' }}>{totalAttempts}</p>
              <p className={styles.kpiSub}>Total attempts this class</p>
            </div>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Session Status</p>
              <p className={styles.kpiValue} style={{ color: '#d946ef', textTransform: 'capitalize' }}>
                {sessionStatus ?? '—'}
              </p>
              <p className={styles.kpiSub}>Auto-refreshes every 8s</p>
            </div>
          </div>

          {/* Real-Time Student Roster */}
          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Student Live Monitor</h2>
                <p className={styles.sectionSub}>Attendance status, focus score, and code attempts — refreshed automatically.</p>
              </div>
              {lowFocus > 0 && (
                <span className={`${styles.badge} ${styles.amberBadge}`}>
                  <AlertTriangle size={14} /> {lowFocus} low focus
                </span>
              )}
            </div>

            <div className={styles.list}>
              {students.map((st) => (
                <div key={st.student_id} className={styles.listRow}>
                  <div className={styles.rowIcon}>
                    <Users size={18} />
                  </div>
                  <div className={styles.rowBody}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <p className={styles.rowTitle}>
                        {st.full_name} <span style={{ fontSize: 12, color: '#64748b' }}>({st.roll_number || '—'})</span>
                      </p>
                      <span className={`${styles.badge} ${
                        st.focus_score === null ? styles.slateBadge
                        : st.focus_score >= 80 ? styles.greenBadge
                        : st.focus_score >= 60 ? styles.amberBadge
                        : styles.redBadge
                      }`}>
                        Focus {st.focus_score === null ? '—' : `${Math.round(st.focus_score)}%`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#64748b', flexWrap: 'wrap' }}>
                      <span style={{ textTransform: 'capitalize' }}>Attendance: {st.status.replace('_', ' ')}</span>
                      <span>Attempts: {st.attempt_count}</span>
                      <span>⏱️ {Math.round((st.total_time_sec || 0) / 60)} min in lab</span>
                      {!st.is_active && st.joined_at && <span style={{ color: '#b45309' }}>Inactive</span>}
                    </div>
                  </div>
                  <div className={styles.rowSide}>
                    {!st.joined_at && <span className={`${styles.pill} ${styles.pillSlate}`}>Not joined</span>}
                  </div>
                </div>
              ))}
              {students.length === 0 && (
                <p className={styles.sectionSub} style={{ padding: 16 }}>
                  No attendance records yet. Records are created when the session starts.
                </p>
              )}
            </div>
          </section>

          {/* ── Student Screen Monitoring Grid ─────────────────────────────────── */}
          {isLive && (
            <section className={styles.sectionCard} style={{ marginTop: 22 }}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>
                    <Monitor size={17} style={{ display: 'inline', verticalAlign: '-3px', marginRight: 8 }} />
                    Student Screen Monitor
                  </h2>
                  <p className={styles.sectionSub}>
                    JPEG snapshots sent by each student every ~30 s via the screenshot capture loop.
                    Frames are never stored — live in-memory only.
                  </p>
                </div>
                <span style={{ fontSize: 12, color: '#9891a6', fontWeight: 500 }}>
                  {Object.keys(screenshots).length} screen{Object.keys(screenshots).length !== 1 ? 's' : ''} received
                </span>
              </div>

              {Object.keys(screenshots).length === 0 ? (
                <p className={styles.sectionSub} style={{ padding: 16 }}>
                  No screenshots yet — students must grant screen share permission and enter the video room.
                  Thumbnails appear here within ~30 s of each student joining.
                </p>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                  gap: 14,
                  padding: '12px 0',
                }}>
                  {Object.entries(screenshots).map(([studentId, entry]) => (
                    <div key={studentId} style={{
                      background: 'rgba(15,10,30,0.6)',
                      border: '1px solid rgba(124,58,237,0.2)',
                      borderRadius: 12,
                      overflow: 'hidden',
                    }}>
                      {/* Thumbnail */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={entry.frame}
                        alt={`${entry.name} screen`}
                        style={{ width: '100%', display: 'block', aspectRatio: '4/3', objectFit: 'cover' }}
                      />
                      {/* Label bar */}
                      <div style={{ padding: '6px 10px' }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#e2d9f3', margin: 0 }}>
                          {entry.name}
                        </p>
                        <p style={{ fontSize: 11, color: '#6b5f7a', margin: 0 }}>
                          Updated {relTime(entry.ts)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {loading && <p className={styles.sectionSub}>Loading sessions…</p>}

      {/* ── Instructor LiveKit Video Room Modal ─────────────────────────────── */}
      {videoOpen && currentSession?.jitsi_room_name && (
        <div
          className={styles.modalOverlay}
          onClick={e => { if (e.target === e.currentTarget) setVideoOpen(false); }}
        >
          <div
            className={styles.modalCard}
            style={{
              maxWidth: videoMaximized ? '100%' : 920,
              width: videoMaximized ? '100%' : '90vw',
              maxHeight: videoMaximized ? '95vh' : '88vh',
              padding: 0,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Modal header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 18px', background: '#1a1528', borderRadius: '22px 22px 0 0',
              borderBottom: '1px solid rgba(255,255,255,.07)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px',
                  background: 'rgba(34,197,94,.15)', border: '1px solid rgba(34,197,94,.25)',
                  borderRadius: 9999, fontSize: 11, fontWeight: 700, color: '#86efac',
                }}>
                  <Radio size={11} /> LIVE VIDEO
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: '#e2d9f3' }}>
                  {currentSession.experiment_title} — Video Room
                </span>
                <span style={{ fontSize: 12, color: '#9891a6' }}>
                  ({currentSession.section_name ?? '—'})
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className={styles.closeBtn}
                  style={{ background: 'rgba(255,255,255,.07)', color: '#c4b5fd' }}
                  onClick={() => setVideoMaximized(m => !m)}
                  title={videoMaximized ? 'Restore' : 'Maximize'}
                >
                  {videoMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
                <button
                  className={styles.closeBtn}
                  style={{ background: 'rgba(255,255,255,.07)', color: '#c4b5fd' }}
                  onClick={() => setVideoOpen(false)}
                  title="Close video room"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* ── LiveKit video room body ────────────────────────────────────── */}
            {LiveKitRoom && VideoConference && livekitToken && LIVEKIT_URL ? (
              <LiveKitRoom
                serverUrl={LIVEKIT_URL}
                token={livekitToken}
                connect={true}
                audio={true}
                video={true}
                style={{
                  flex: 1,
                  minHeight: videoMaximized ? 'calc(95vh - 56px)' : 560,
                }}
              >
                <VideoConference />
              </LiveKitRoom>
            ) : (
              /* Fallback — covers three cases:
                 1. LiveKit packages not yet installed (npm install pending)
                 2. Session not yet started (no token)
                 3. NEXT_PUBLIC_LIVEKIT_URL not configured */
              <div style={{
                flex: 1,
                minHeight: videoMaximized ? 'calc(95vh - 56px)' : 560,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#0f0d1a',
                gap: 16,
                padding: 32,
              }}>
                {!LiveKitRoom ? (
                  <>
                    <Video size={48} color="#6b5f7a" />
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ color: '#e2d9f3', fontWeight: 700, marginBottom: 8 }}>
                        LiveKit packages not installed
                      </p>
                      <p style={{ color: '#6b5f7a', fontSize: 13 }}>
                        Run in the <code style={{ background: '#1a1528', padding: '2px 6px', borderRadius: 4 }}>frontend/</code> directory:
                      </p>
                      <pre style={{
                        background: '#1a1528', color: '#86efac', padding: '10px 16px',
                        borderRadius: 8, fontSize: 12, marginTop: 10, textAlign: 'left',
                      }}>
                        npm install @livekit/components-react @livekit/components-styles livekit-client
                      </pre>
                    </div>
                  </>
                ) : !livekitToken ? (
                  <>
                    <Video size={48} color="#6b5f7a" />
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ color: '#e2d9f3', fontWeight: 700, marginBottom: 8 }}>
                        No video token yet
                      </p>
                      <p style={{ color: '#6b5f7a', fontSize: 13 }}>
                        Start the session first — the LiveKit token is issued when the session goes live.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <Video size={48} color="#6b5f7a" />
                    <p style={{ color: '#6b5f7a', fontSize: 13 }}>
                      NEXT_PUBLIC_LIVEKIT_URL not configured in <code>.env.local</code>
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </InstructorShell>
  );
}

export default function InstructorLiveLabPage() {
  return (
    <Suspense fallback={null}>
      <LiveLabInner />
    </Suspense>
  );
}
