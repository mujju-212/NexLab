'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import StudentShell from '@/components/layout/StudentShell';
import { studentService } from '@/services/student.service';
import { executionService } from '@/services/execution.service';
import { aiService } from '@/services/ai.service';
import { useSocket } from '@/hooks/use-socket';
import type { GateResult } from '@/types';
import type { Language } from '@/types';
import {
  Radio, Sparkles, Loader2, ShieldAlert, Video,
  CheckCircle2, Circle, Camera, Monitor, UserCheck, X,
} from 'lucide-react';
import styles from '../page.module.css';

// Lazy-load LiveKit so the bundle is unaffected when packages are absent
// (npm install @livekit/components-react @livekit/components-styles livekit-client)
let LiveKitRoom: React.ComponentType<{
  serverUrl: string; token: string; connect: boolean;
  audio: boolean; video: boolean;
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
  // Package not yet installed — fallback UI shown in the video step
}

type JoinStep = 'idle' | 'attendance' | 'permissions' | 'video';

const LANGS: { key: Language; label: string; file: string }[] = [
  { key: 'python',     label: 'Python', file: 'lab.py'      },
  { key: 'javascript', label: 'JS',     file: 'lab.js'      },
  { key: 'c',          label: 'C',      file: 'lab.c'       },
  { key: 'cpp',        label: 'C++',    file: 'lab.cpp'     },
  { key: 'java',       label: 'Java',   file: 'Main.java'   },
];

export default function LiveLabRoomPage() {
  const router    = useRouter();
  const params    = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;

  const [gate,        setGate]        = useState<GateResult | null>(null);
  const [gateLoading, setGateLoading] = useState(true);
  const [gateError,   setGateError]   = useState('');

  // ── Pre-join state machine ─────────────────────────────────────────────────
  // idle        → user clicks "Join Video Room"
  // attendance  → user acknowledges their presence
  // permissions → browser camera/mic/screen prompts
  // video       → LiveKit room visible
  const [joinStep,      setJoinStep]      = useState<JoinStep>('idle');
  const [camGranted,    setCamGranted]    = useState(false);
  const [screenGranted, setScreenGranted] = useState(false);
  const [permError,     setPermError]     = useState('');
  const [permBusy,      setPermBusy]      = useState(false);

  // Hold the screen capture stream so we can stop it on unmount / step change
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenshotTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [language,   setLanguage]   = useState<Language>('python');
  const [code,       setCode]       = useState('# Write your experiment code here\n');
  const [stdin,      setStdin]      = useState('');
  const [output,     setOutput]     = useState('');
  const [running,    setRunning]    = useState(false);
  const [activeTab,  setActiveTab]  = useState<'output' | 'ai'>('output');

  const [hint,        setHint]        = useState('');
  const [hintLevel,   setHintLevel]   = useState(0);
  const [hintLoading, setHintLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Socket — heartbeat + screenshot emission ───────────────────────────────
  const { isConnected, emitHeartbeat, emitScreenshot } = useSocket({
    sessionId,
    enabled: !!(gate?.gate_passed),
  });

  useEffect(() => {
    if (!isConnected) return;
    const id = setInterval(() => emitHeartbeat(30), 30_000);
    return () => clearInterval(id);
  }, [isConnected, emitHeartbeat]);

  // ── Gate check on mount ────────────────────────────────────────────────────
  useEffect(() => {
    studentService.checkGate(sessionId)
      .then(res => setGate(res as GateResult))
      .catch(e => setGateError(e instanceof Error ? e.message : 'Gate check failed'))
      .finally(() => setGateLoading(false));
  }, [sessionId]);

  // ── Screenshot capture loop — runs while joinStep === 'video' ─────────────
  useEffect(() => {
    if (joinStep !== 'video') {
      // Clean up any lingering capture when they leave the video step
      screenshotTimer.current && clearInterval(screenshotTimer.current);
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      return;
    }

    let cancelled = false;

    const captureAndSend = async (stream: MediaStream) => {
      if (cancelled) return;
      try {
        const track = stream.getVideoTracks()[0];
        if (!track || track.readyState !== 'live') return;

        // Prefer ImageCapture API (Chrome/Edge); fall back to hidden video element
        if (typeof ImageCapture !== 'undefined') {
          const cap = new ImageCapture(track);
          // grabFrame() isn't in every TS DOM lib version yet.
          const grabFrame = (cap as unknown as { grabFrame(): Promise<ImageBitmap> }).grabFrame.bind(cap);
          const bitmap = await grabFrame();
          const canvas = document.createElement('canvas');
          canvas.width  = 640;
          canvas.height = 480;
          canvas.getContext('2d')!.drawImage(bitmap, 0, 0, 640, 480);
          canvas.toBlob(blob => {
            if (!blob || cancelled) return;
            const reader = new FileReader();
            reader.onload = () => emitScreenshot(reader.result as string);
            reader.readAsDataURL(blob);
          }, 'image/jpeg', 0.6);
        } else {
          // Firefox fallback: draw from a hidden video element
          const video = document.createElement('video');
          video.srcObject = stream;
          video.muted = true;
          await video.play().catch(() => undefined);
          const canvas = document.createElement('canvas');
          canvas.width  = 640;
          canvas.height = 480;
          canvas.getContext('2d')!.drawImage(video, 0, 0, 640, 480);
          video.pause();
          video.srcObject = null;
          canvas.toBlob(blob => {
            if (!blob || cancelled) return;
            const reader = new FileReader();
            reader.onload = () => emitScreenshot(reader.result as string);
            reader.readAsDataURL(blob);
          }, 'image/jpeg', 0.6);
        }
      } catch {
        // Frame grab failed (track ended, tab hidden, etc.) — skip this interval
      }
    };

    const startCapture = async () => {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 1, width: 1280, height: 720 },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        screenStreamRef.current = stream;

        // Send first frame immediately, then every 30 s
        captureAndSend(stream);
        screenshotTimer.current = setInterval(() => captureAndSend(stream), 30_000);

        // If user stops screen share from browser UI
        stream.getVideoTracks()[0]?.addEventListener('ended', () => {
          clearInterval(screenshotTimer.current!);
          screenStreamRef.current = null;
        });
      } catch {
        // User declined screen share — monitoring just shows placeholder; no hard failure
      }
    };

    startCapture();

    return () => {
      cancelled = true;
      screenshotTimer.current && clearInterval(screenshotTimer.current);
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    };
  // emitScreenshot is stable (useCallback with no deps that change while in video step)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinStep]);

  // ── Permission helpers ─────────────────────────────────────────────────────
  const requestCamera = async () => {
    setPermBusy(true);
    setPermError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach(t => t.stop()); // release — LiveKit manages its own
      setCamGranted(true);
    } catch {
      setPermError('Camera / microphone access was denied. Please allow it in your browser settings and try again.');
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
      // Screen share is optional — mark granted even on cancel so student can proceed
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

  if (!gate.gate_passed) {
    return (
      <StudentShell activePage="Live Coding Lab" title="Gate Locked" subtitle="Complete the pre-lab quiz to unlock this session">
        <div className={styles.joinFlow}>
          <div className={styles.sessionCard}>
            <div className={styles.sessionBadge}><ShieldAlert size={13} /> LOCKED</div>
            <h2 className={styles.sessionTitle}>Pre-Lab Gate Not Cleared</h2>
            <p style={{ fontSize: 14, color: '#615a72', fontWeight: 500, lineHeight: 1.6 }}>
              You must pass the pre-lab quiz for this experiment before joining the live session.
              Complete the quiz modules first, then come back to join.
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
              <button className={styles.joinBtn} onClick={() => router.push('/student/pre-lab')}>📖 Go to Pre-Lab</button>
              <button className={styles.checkBtn} onClick={() => router.push('/student/live-lab')}>Back to sessions</button>
            </div>
          </div>
        </div>
      </StudentShell>
    );
  }

  // ── Attendance acknowledgment overlay ──────────────────────────────────────
  if (joinStep === 'attendance') {
    return (
      <StudentShell activePage="Live Coding Lab" title="Mark Attendance" subtitle="Confirm you are present for this session">
        <div className={styles.joinFlow}>
          <div className={styles.sessionCard}>
            <div className={styles.sessionBadge} style={{ background: 'rgba(34,197,94,.2)', borderColor: 'rgba(34,197,94,.3)', color: '#86efac' }}>
              <Radio size={13} /> LIVE SESSION
            </div>
            <h2 className={styles.sessionTitle}>Attendance Acknowledgment</h2>
            <p style={{ fontSize: 14.5, color: 'rgba(255,255,255,.75)', fontWeight: 500, lineHeight: 1.65, marginBottom: 28 }}>
              By proceeding, you confirm that you are physically present and ready to participate
              in this live lab session. Your attendance will be recorded and your presence tracked
              throughout the session.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button
                className={styles.joinBtn}
                style={{ maxWidth: 280 }}
                onClick={() => setJoinStep('permissions')}
              >
                <UserCheck size={16} style={{ display: 'inline', verticalAlign: '-3px', marginRight: 8 }} />
                ✓ I am present — Continue
              </button>
              <button
                className={styles.checkBtn}
                onClick={() => setJoinStep('idle')}
              >
                ← Cancel
              </button>
            </div>
          </div>
        </div>
      </StudentShell>
    );
  }

  // ── Permissions overlay ────────────────────────────────────────────────────
  if (joinStep === 'permissions') {
    const allGranted = camGranted && screenGranted;
    return (
      <StudentShell activePage="Live Coding Lab" title="Device Permissions" subtitle="Allow access so the video room works correctly">
        <div className={styles.joinFlow}>
          <div className={styles.sessionCard}>
            <div className={styles.sessionBadge} style={{ background: 'rgba(245,158,11,.2)', borderColor: 'rgba(245,158,11,.3)', color: '#fcd34d' }}>
              <Video size={13} /> SETUP
            </div>
            <h2 className={styles.sessionTitle}>Camera &amp; Screen Access</h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,.7)', lineHeight: 1.6, marginBottom: 24 }}>
              Grant the permissions below so your instructor can see you in the video room and
              the session monitoring tools work correctly.
            </p>
          </div>

          <div className={styles.checksGrid}>
            {/* Camera & mic */}
            <div className={`${styles.checkCard} ${camGranted ? styles.checkDone : ''}`}>
              <div className={styles.checkIconWrapper}>
                <Camera size={22} className={styles.checkLucideIcon} />
              </div>
              <div className={styles.checkInfo}>
                <p className={styles.checkLabel}>Camera &amp; Microphone</p>
                <p className={styles.checkDesc}>Required for the video room. Your camera lets the instructor see you during the lab.</p>
              </div>
              {camGranted
                ? <span className={styles.checkPass}><CheckCircle2 size={14} /> Granted</span>
                : <button className={styles.checkBtn} onClick={requestCamera} disabled={permBusy}>
                    {permBusy ? <Loader2 size={14} style={{ animation: 'spin .7s linear infinite' }} /> : <Camera size={14} />}
                    &nbsp;Allow
                  </button>
              }
            </div>

            {/* Screen share */}
            <div className={`${styles.checkCard} ${screenGranted ? styles.checkDone : ''}`}>
              <div className={styles.checkIconWrapper}>
                <Monitor size={22} className={styles.checkLucideIcon} />
              </div>
              <div className={styles.checkInfo}>
                <p className={styles.checkLabel}>Screen Sharing <span style={{ fontSize: 12, fontWeight: 500, color: '#9891a6' }}>(optional)</span></p>
                <p className={styles.checkDesc}>Allows your instructor to monitor your screen during the session via periodic snapshots.</p>
              </div>
              {screenGranted
                ? <span className={styles.checkPass}><CheckCircle2 size={14} /> Granted</span>
                : <button className={styles.checkBtn} onClick={requestScreen} disabled={permBusy}>
                    {permBusy ? <Loader2 size={14} style={{ animation: 'spin .7s linear infinite' }} /> : <Monitor size={14} />}
                    &nbsp;Allow
                  </button>
              }
            </div>
          </div>

          {permError && (
            <div className={styles.errorBox} style={{ marginBottom: 16 }}>
              <X size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />
              {permError}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              className={`${styles.joinBtn} ${!camGranted ? styles.joinBtnDisabled : ''}`}
              style={{ maxWidth: 280 }}
              onClick={() => { if (camGranted) setJoinStep('video'); }}
              disabled={!camGranted}
            >
              <Video size={16} style={{ display: 'inline', verticalAlign: '-3px', marginRight: 8 }} />
              {allGranted ? 'Enter Video Room →' : 'Enter Video Room (camera required)'}
            </button>
            <button className={styles.checkBtn} onClick={() => setJoinStep('attendance')}>← Back</button>
          </div>
        </div>
      </StudentShell>
    );
  }

  // ── LiveKit video room ─────────────────────────────────────────────────────
  if (joinStep === 'video') {
    const livekitToken = gate.livekit_token;
    const livekitUrl   = gate.livekit_url || process.env.NEXT_PUBLIC_LIVEKIT_URL || '';

    return (
      <StudentShell activePage="Live Coding Lab">
        <div className={styles.labLayout}>
          <div className={styles.labTopBar}>
            <div className={styles.sessionInfo}>
              <span className={styles.livePill}><Radio size={12} /> LIVE</span>
              <span className={styles.sessionName}>Lab Session — Video Room</span>
              {isConnected && <span className={styles.attendedPill}>🟢 Connected</span>}
            </div>
            <div className={styles.labActions}>
              <button
                className={styles.checkBtn}
                style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 13 }}
                onClick={() => setJoinStep('idle')}
              >
                ← Back to Lab
              </button>
            </div>
          </div>

          {/* ── LiveKit or fallback ───────────────────────────────────────── */}
          <div style={{ flex: 1, borderRadius: 16, overflow: 'hidden', boxShadow: '0 10px 32px rgba(15,10,30,.3)', background: '#0f0d1a' }}>
            {LiveKitRoom && VideoConference && livekitToken && livekitUrl ? (
              <LiveKitRoom
                serverUrl={livekitUrl}
                token={livekitToken}
                connect={true}
                audio={true}
                video={true}
              >
                <VideoConference />
              </LiveKitRoom>
            ) : (
              /* Fallback — package absent, no token, or no URL */
              <div style={{
                width: '100%', height: '100%',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 16, padding: 32,
              }}>
                {!LiveKitRoom ? (
                  <>
                    <Video size={48} color="#6b5f7a" />
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ color: '#e2d9f3', fontWeight: 700, marginBottom: 8 }}>
                        LiveKit packages not installed
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
                    <p style={{ color: '#6b5f7a', fontSize: 13, textAlign: 'center' }}>
                      Video room not available yet — the session may not be active, or the pre-lab gate was not fully passed.
                      <br />Try refreshing the page.
                    </p>
                  </>
                ) : (
                  <>
                    <Video size={48} color="#6b5f7a" />
                    <p style={{ color: '#6b5f7a', fontSize: 13 }}>
                      LiveKit URL not configured. Contact your instructor.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </StudentShell>
    );
  }

  // ── Main lab layout (code editor + output/AI) ──────────────────────────────
  const currentLang = LANGS.find(l => l.key === language)!;
  // Show "Join Video Room" if the session is active and we have a LiveKit token
  const canJoinVideo = !!(gate.can_join_live && (gate.livekit_token || gate.jitsi_room));

  return (
    <StudentShell activePage="Live Coding Lab">
      <div className={styles.labLayout}>

        {/* ── Top Bar ── */}
        <div className={styles.labTopBar}>
          <div className={styles.sessionInfo}>
            <span className={styles.livePill}><Radio size={12} /> LIVE</span>
            <span className={styles.sessionName}>Lab Session</span>
            {isConnected && <span className={styles.attendedPill}>🟢 Connected</span>}
            {gate.focus_ml_enabled   && <span className={styles.attendedPill}>🧠 Focus ML on</span>}
            {gate.lockdown_enabled   && <span className={styles.attendedPill}>🔒 Lockdown on</span>}
          </div>
          <div className={styles.labActions}>
            {canJoinVideo && (
              <button
                className={styles.attendBtn}
                onClick={() => setJoinStep('attendance')}
              >
                <Video size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
                Join Video Room
              </button>
            )}
            <button className={styles.hintBtn} onClick={getHint} disabled={hintLoading}>
              <Sparkles size={14} /> AI Hint {hintLevel > 0 ? `(L${hintLevel})` : ''}
            </button>
            <div className={styles.langSelect}>
              {LANGS.map(l => (
                <button
                  key={l.key}
                  className={`${styles.langBtn} ${language === l.key ? styles.langActive : ''}`}
                  onClick={() => setLanguage(l.key)}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Split Layout ── */}
        <div className={styles.splitLayout}>

          {/* Left: Output + AI */}
          <div className={styles.leftPane}>
            <div className={styles.paneTabs}>
              {(['output', 'ai'] as const).map(t => (
                <button
                  key={t}
                  className={`${styles.paneTab} ${activeTab === t ? styles.paneTabActive : ''}`}
                  onClick={() => setActiveTab(t)}
                >
                  {t === 'output' ? 'Output' : 'AI Hints'}
                  {t === 'output' && output && <span className={styles.tabDot} />}
                </button>
              ))}
            </div>

            <div className={styles.paneContent}>
              {activeTab === 'output' && (
                <div className={styles.outputPane}>
                  {running ? (
                    <div className={styles.outputRunning}>
                      <div className={styles.outputSpinner} />
                      <span>Executing in Docker sandbox…</span>
                    </div>
                  ) : output ? (
                    <pre className={styles.outputText}>{output}</pre>
                  ) : (
                    <div className={styles.outputEmpty}>
                      <span>▶ Run your code to see output here</span>
                    </div>
                  )}
                  <div style={{ marginTop: 14 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#9891a6' }}>Stdin (optional)</label>
                    <textarea
                      className={styles.stdinBox}
                      value={stdin}
                      onChange={e => setStdin(e.target.value)}
                      placeholder="Program input…"
                      rows={3}
                    />
                  </div>
                </div>
              )}

              {activeTab === 'ai' && (
                <div className={styles.aiPane}>
                  <div className={styles.aiHeader}>
                    <Sparkles size={28} style={{ color: '#7c3aed' }} />
                    <div>
                      <p className={styles.aiTitle}>AI Lab Assistant</p>
                      <p className={styles.aiSub}>Progressive hints — level {hintLevel}/3 used</p>
                    </div>
                  </div>
                  {hintLoading ? (
                    <div className={styles.hintLoading}>
                      <div className={styles.hintSpinner} />
                      <span>Generating hint…</span>
                    </div>
                  ) : hint ? (
                    <div className={styles.hintBubble}><p>{hint}</p></div>
                  ) : (
                    <div className={styles.hintBubble}><p>Stuck? Click &quot;AI Hint&quot; for a level-1 nudge. Deeper levels cost more grade deduction.</p></div>
                  )}
                  <button className={styles.newHintBtn} onClick={getHint} disabled={hintLoading || hintLevel >= 3}>
                    {hintLevel >= 3 ? 'All hint levels used' : '✨ Get Next Hint'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right: Code Editor */}
          <div className={styles.rightPane}>
            <div className={styles.editorWrapper}>
              <div className={styles.editorBar}>
                <div className={styles.editorDots}>
                  <span style={{ background: '#ef4444' }} />
                  <span style={{ background: '#f59e0b' }} />
                  <span style={{ background: '#22c55e' }} />
                </div>
                <span className={styles.editorFilename}>{currentLang.file}</span>
                <span className={styles.editorLang}>{language.toUpperCase()}</span>
              </div>

              <div className={styles.editorArea}>
                <div className={styles.lineNums}>
                  {code.split('\n').map((_, i) => (
                    <div key={i} className={styles.lineNum}>{i + 1}</div>
                  ))}
                </div>
                <textarea
                  ref={textareaRef}
                  className={styles.editor}
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  onKeyDown={handleTab}
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="off"
                />
              </div>

              <div className={styles.editorFooter}>
                <div className={styles.editorStats}>
                  <span>Lines: {code.split('\n').length}</span>
                  <span>Chars: {code.length}</span>
                </div>
                <div className={styles.editorBtns}>
                  <button className={styles.clearCodeBtn} onClick={() => setCode('')}>Clear</button>
                  <button className={styles.runBtn} onClick={runCode} disabled={running || !code.trim()}>
                    {running ? <><span className={styles.runSpinner} /> Running…</> : <>▶ Run Code</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </StudentShell>
  );
}
