'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Play, Square, X, Send, Loader2, Radio, RefreshCw,
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import { experienceService, type LiveState, type SparkRow, type Checkpoint, type ChatMessage } from '@/services/experience.service';
import { useSocket } from '@/hooks/use-socket';
import type { StudentScreenshotPayload, ModeChangedPayload, DirectCheckpointPayload, ChatMessagePayload, ProctorPolicyPayload } from '@/hooks/use-socket';
import styles from '../../../shared.module.css';

const MODES = [
  { value: 'briefing',    label: 'Briefing',    icon: '📋' },
  { value: 'working',     label: 'Working',     icon: '💻' },
  { value: 'quiz_active', label: 'Quiz Active', icon: '📝' },
  { value: 'paused',      label: 'Paused',      icon: '⏸' },
  { value: 'debrief',     label: 'Debrief',     icon: '📊' },
  { value: 'ended',       label: 'Ended',       icon: '🔚' },
];

const CP_COLORS: Record<string, string> = {
  pending:    '#d1d5db',  // grey
  claimed:    '#facc15',  // yellow
  verified:   '#22c55e',  // green
  failed:     '#ef4444',  // red
  manual_pass:'#22c55e',  // green
  manual_fail:'#ef4444',  // red
};

const CP_LABELS: Record<string, string> = {
  pending: '—', claimed: '⚡', verified: '✓', failed: '✗',
  manual_pass: '✓✓', manual_fail: '✗✗',
};

export default function ConductorPage() {
  const params = useParams();
  const sessionId = params?.sessionId as string;
  const router = useRouter();

  const [state, setState] = useState<LiveState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<'pace' | 'spark' | 'control'>('spark');

  // Chat state
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const chatRef = useRef<HTMLDivElement>(null);

  // Screenshot monitoring
  const [screenshots, setScreenshots] = useState<Record<string, { frame: string; name: string; ts: string }>>({});

  // Code inspector
  const [inspectorStudent, setInspectorStudent] = useState<string | null>(null);
  const [inspectorData, setInspectorData] = useState<Record<string, unknown> | null>(null);
  const [inspectorBusy, setInspectorBusy] = useState(false);

  const toast3 = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Fetch live state ──────────────────────────────────────────────────────
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

  // ── Socket events ─────────────────────────────────────────────────────────
  const isLive = state?.session?.status === 'active';
  useSocket({
    sessionId: sessionId || '',
    enabled: !!sessionId && !!isLive,
    onScreenshotFrame: useCallback((data: StudentScreenshotPayload) => {
      setScreenshots(prev => ({ ...prev, [data.student_id]: { frame: data.frame, name: data.full_name, ts: data.timestamp } }));
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
  });

  // Scroll chat to bottom
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatMessages]);

  // ── Mode change ───────────────────────────────────────────────────────────
  const changeMode = async (mode: string) => {
    setBusy('mode');
    try {
      const res = await experienceService.setMode(sessionId, mode);
      setState(prev => prev ? { ...prev, mode: res.mode, mode_rules: res.rules } : prev);
      toast3(`Mode: ${mode}`);
    } catch (e: any) { toast3(e?.response?.data?.error || 'Failed'); }
    finally { setBusy(null); }
  };

  // ── Launch page ───────────────────────────────────────────────────────────
  const launchPage = async (pageId: string, timerSec?: number) => {
    setBusy('page');
    try {
      await experienceService.launchPage(sessionId, pageId, timerSec);
      toast3('Page launched');
      await loadState();
    } catch (e: any) { toast3(e?.response?.data?.error || 'Failed'); }
    finally { setBusy(null); }
  };

  // ── Launch quiz ───────────────────────────────────────────────────────────
  const launchQuiz = async (moduleId: string) => {
    setBusy('quiz');
    try {
      await experienceService.launchQuiz(sessionId, moduleId);
      toast3('Quiz launched');
    } catch (e: any) { toast3(e?.response?.data?.error || 'Failed'); }
    finally { setBusy(null); }
  };

  // ── End session ───────────────────────────────────────────────────────────
  const endSession = async () => {
    if (!confirm('End session for all students?')) return;
    setBusy('end');
    try {
      await experienceService.setMode(sessionId, 'ended');
      await experienceService.finalizeGrades(sessionId);
      toast3('Session ended, grades finalized');
      router.push('/instructor/sessions');
    } catch (e: any) { toast3(e?.response?.data?.error || 'Failed'); }
    finally { setBusy(null); }
  };

  // ── Proctor toggle ────────────────────────────────────────────────────────
  const toggleProctor = async (key: string, value: boolean) => {
    setBusy('proctor');
    try {
      const res = await experienceService.setProctor(sessionId, null, { [key]: value });
      setState(prev => prev ? { ...prev, proctor_policy: res.policy } : prev);
    } catch (e: any) { toast3(e?.response?.data?.error || 'Failed'); }
    finally { setBusy(null); }
  };

  // ── Broadcast ─────────────────────────────────────────────────────────────
  const sendBroadcast = async () => {
    if (!chatInput.trim()) return;
    setBusy('broadcast');
    try {
      await experienceService.broadcast(sessionId, chatInput);
      setChatInput('');
    } catch (e: any) { toast3(e?.response?.data?.error || 'Failed'); }
    finally { setBusy(null); }
  };

  // ── Force submit ──────────────────────────────────────────────────────────
  const forceSubmit = async (studentId?: string) => {
    const msg = studentId ? `Force submit ${state?.spark_grid.find(s => s.student_id === studentId)?.full_name}?` : 'Force submit ALL students?';
    if (!confirm(msg)) return;
    setBusy('force');
    try {
      await experienceService.forceSubmit(sessionId, studentId);
      toast3(studentId ? 'Student submitted' : 'All submitted');
    } catch (e: any) { toast3(e?.response?.data?.error || 'Failed'); }
    finally { setBusy(null); }
  };

  // ── Checkpoint override ───────────────────────────────────────────────────
  const overrideCp = async (studentId: string, checkpointId: string, status: 'manual_pass' | 'manual_fail') => {
    setBusy('cp');
    try {
      await experienceService.checkpointOverride(sessionId, checkpointId, studentId, status);
      toast3(`Checkpoint ${status === 'manual_pass' ? 'passed' : 'failed'}`);
    } catch (e: any) { toast3(e?.response?.data?.error || 'Failed'); }
    finally { setBusy(null); }
  };

  // ── Code inspector ────────────────────────────────────────────────────────
  const openInspector = async (studentId: string) => {
    setInspectorStudent(studentId);
    setInspectorBusy(true);
    setInspectorData(null);
    try {
      const data = await experienceService.studentCode(sessionId, studentId);
      setInspectorData(data);
    } catch {
      setInspectorData({ error: 'No code snapshot available' });
    } finally {
      setInspectorBusy(false);
    }
  };

  if (loading) {
    return (
      <InstructorShell activePage="Live Lab">
        <div style={{ padding: 40, textAlign: 'center', color: '#9891a6' }}>
          <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
          Loading session…
        </div>
      </InstructorShell>
    );
  }

  if (!state) {
    return (
      <InstructorShell activePage="Live Lab">
        <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>
          Session not found or not assigned to you.
        </div>
      </InstructorShell>
    );
  }

  const cps = state.checkpoints;
  const grid = state.spark_grid;
  const mode = state.mode;
  const rules = state.mode_rules;
  const quizModules = (state.experiment?.content_modules ?? []).filter(m => m.module_type === 'quiz');
  const inspectorFiles = (inspectorData?.files as Record<string, string> | undefined) ?? {};

  return (
    <InstructorShell activePage="Live Lab">
      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{ position: 'fixed', top: 18, right: 18, zIndex: 999,
          background: '#111827', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13 }}>
          {toast}
        </div>
      )}

      {/* ── Top Bar ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontFamily: "'Geist',sans-serif", fontSize: 18, fontWeight: 700, color: '#111827', flex: 1 }}>
          Conductor — {(state.experiment?.title as string) || (state.session?.title as string) || 'Live Lab'}
        </h2>

        {/* Mode selector */}
        <div style={{ display: 'flex', gap: 4, background: 'rgba(245,243,255,.7)', borderRadius: 10, padding: 3, border: '1px solid rgba(255,255,255,.9)' }}>
          {MODES.filter(m => m.value !== 'ended').map(m => (
            <button key={m.value} onClick={() => changeMode(m.value)}
              disabled={busy === 'mode'}
              style={{
                padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 12.5, fontWeight: 600, fontFamily: "'Geist',sans-serif",
                background: mode === m.value ? 'linear-gradient(135deg,#7c3aed,#9333ea)' : 'transparent',
                color: mode === m.value ? '#fff' : '#6b7280',
                opacity: busy === 'mode' ? .6 : 1,
                transition: 'all .15s',
              }}>
              {m.icon} {m.label}
            </button>
          ))}
        </div>

        <button onClick={endSession} disabled={busy === 'end'}
          style={{
            padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: '#ef4444', color: '#fff', fontWeight: 700, fontSize: 13,
            fontFamily: "'Geist',sans-serif", opacity: busy === 'end' ? .6 : 1,
          }}>
          {busy === 'end' ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />} End
        </button>
      </div>

      {/* Mode indicator */}
      <div style={{ marginBottom: 18, padding: '10px 16px', borderRadius: 10,
        background: mode === 'paused' ? '#fef3c7' : mode === 'quiz_active' ? '#ede9fe' : '#f3f4f6',
        fontSize: 13, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>Rules: {rules.label}</strong>
        <span>Code: {rules.code}</span>
        <span>Quiz: {rules.quiz}</span>
        <span>Submit: {String(rules.submit)}</span>
        <span>Proctor: {rules.proctor}</span>
      </div>

      {/* ── Panel Tabs ────────────────────────────────────────────────────── */}
      <div className={styles.tabRow}>
        {[
          { key: 'spark',    label: 'SPARK Grid',    icon: '🔍' },
          { key: 'pace',     label: 'Present & Pace', icon: '📄' },
          { key: 'control',  label: 'Control & Comms', icon: '🎛' },
        ].map(t => (
          <button key={t.key} onClick={() => setActivePanel(t.key as typeof activePanel)}
            className={`${styles.tabChip} ${activePanel === t.key ? styles.tabChipActive : ''}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* PANEL: SPARK Monitoring Grid                                       */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activePanel === 'spark' && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3 className={styles.sectionTitle}>SPARK Monitoring Grid</h3>
              <p className={styles.sectionSub}>
                {grid.length} student{cps.length > 0 ? ` · ${cps.length} checkpoints` : ''}
              </p>
            </div>
            <button onClick={() => openInspector('')} className={styles.secondaryBtn} style={{ display: 'none' }}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          {cps.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#9891a6' }}>
              No checkpoints defined for this experiment. Add checkpoints in the experiment editor.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className={styles.table} style={{ minWidth: 600 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 120 }}>Student</th>
                    {cps.map(cp => (
                      <th key={cp.id} title={cp.title} style={{ textAlign: 'center', minWidth: 40 }}>
                        {cp.order}
                        <div style={{ fontWeight: 400, fontSize: 10, color: '#9ca3af' }}>{cp.title.slice(0, 8)}</div>
                      </th>
                    ))}
                    <th style={{ textAlign: 'center' }}>Focus</th>
                    <th style={{ textAlign: 'center' }}>Proctor</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {grid.map(row => (
                    <tr key={row.student_id} style={{ cursor: 'pointer' }}
                      onClick={() => openInspector(row.student_id)}>
                      <td className={styles.tdStrong}>
                        {row.full_name}
                        <div style={{ fontSize: 11, fontWeight: 500, color: '#9ca3af' }}>{row.roll_number}</div>
                      </td>
                      {cps.map(cp => {
                        const status = row.checkpoints[cp.id] || 'pending';
                        const bg = CP_COLORS[status] || '#d1d5db';
                        return (
                          <td key={cp.id} style={{ textAlign: 'center', padding: '6px 8px' }}>
                            <div style={{
                              width: 32, height: 32, borderRadius: 8, margin: '0 auto',
                              background: bg, opacity: status === 'pending' ? .3 : .85,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 13, fontWeight: 700, color: status === 'pending' ? '#9ca3af' : '#fff',
                              boxShadow: (row.focus_score !== null && row.focus_score < 40 && status !== 'pending')
                                ? '0 0 0 3px rgba(239,68,68,.5)' : 'none',
                              animation: (row.focus_score !== null && row.focus_score < 40 && status !== 'pending')
                                ? 'pulse 2s infinite' : 'none',
                            }}>
                              {CP_LABELS[status] || '—'}
                            </div>
                          </td>
                        );
                      })}
                      <td style={{ textAlign: 'center' }}>
                        <span className={row.focus_score !== null && row.focus_score < 40 ? styles.redBadge : styles.greenBadge}>
                          {row.focus_score !== null ? `${row.focus_score}%` : '—'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {row.proctor_events > 0 ? (
                          <span className={styles.amberBadge}>{row.proctor_events}</span>
                        ) : (
                          <span className={styles.slateBadge}>0</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button onClick={(e) => { e.stopPropagation(); forceSubmit(row.student_id); }}
                          className={styles.ghostBtn} style={{ fontSize: 11, padding: '4px 8px', minHeight: 0 }}>
                          Submit
                        </button>
                      </td>
                    </tr>
                  ))}
                  {/* Bottom row: per-checkpoint aggregate */}
                  <tr>
                    <td className={styles.tdStrong} style={{ fontSize: 12, color: '#6b7280' }}>Aggregate</td>
                    {cps.map(cp => {
                      const verified = grid.filter(r => r.checkpoints[cp.id] === 'verified' || r.checkpoints[cp.id] === 'manual_pass').length;
                      const total = grid.length;
                      return (
                        <td key={cp.id} style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>
                          {verified}/{total}
                        </td>
                      );
                    })}
                    <td colSpan={3} />
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Screenshot monitoring grid */}
          {Object.keys(screenshots).length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 10 }}>Screenshots</h4>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {Object.entries(screenshots).map(([sid, s]) => (
                  <div key={sid} style={{ width: 160, borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                    <img src={s.frame} alt={s.name} style={{ width: '100%', height: 100, objectFit: 'cover' }} />
                    <div style={{ padding: '6px 8px', fontSize: 11, fontWeight: 600, color: '#374151' }}>{s.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* PANEL: Present & Pace                                              */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activePanel === 'pace' && (
        <div className={styles.gridTwo}>
          {/* Pages */}
          <div className={styles.sectionCard}>
            <h3 className={styles.sectionTitle}>Content Pages</h3>
            <p className={styles.sectionSub}>Launch a page for all students</p>
            <div className={styles.list} style={{ marginTop: 14 }}>
              {state.pages.length === 0 ? (
                <div style={{ color: '#9891a6', fontSize: 13 }}>No content pages defined.</div>
              ) : state.pages.map(p => (
                <div key={p.id} className={styles.listRow}>
                  <div className={styles.rowBody}>
                    <div className={styles.rowTitle}>{p.title}</div>
                    <div className={styles.rowMeta}>Order {p.display_order}</div>
                  </div>
                  <div className={styles.rowSide}>
                    <button onClick={() => launchPage(p.id)}
                      disabled={busy === 'page'}
                      className={styles.primaryBtn} style={{ fontSize: 12, padding: '6px 12px', minHeight: 0 }}>
                      {busy === 'page' ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                      Launch
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quiz modules */}
          <div className={styles.sectionCard}>
            <h3 className={styles.sectionTitle}>Quiz Modules</h3>
            <p className={styles.sectionSub}>Push a quiz live even if unpublished</p>
            <div className={styles.list} style={{ marginTop: 14 }}>
              {quizModules.length > 0 ? (
                quizModules.map((m) => (
                  <div key={m.id} className={styles.listRow}>
                    <div className={styles.rowBody}>
                      <div className={styles.rowTitle}>{m.title}</div>
                    </div>
                    <div className={styles.rowSide}>
                      <button onClick={() => launchQuiz(m.id)}
                        disabled={busy === 'quiz'}
                        className={styles.primaryBtn} style={{ fontSize: 12, padding: '6px 12px', minHeight: 0 }}>
                        {busy === 'quiz' ? <Loader2 size={12} className="animate-spin" /> : <Radio size={12} />}
                        Launch
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ color: '#9891a6', fontSize: 13 }}>No quiz modules found.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* PANEL: Control & Comms                                             */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activePanel === 'control' && (
        <div className={styles.gridTwo}>
          {/* Proctor controls */}
          <div className={styles.sectionCard}>
            <h3 className={styles.sectionTitle}>Proctoring Controls</h3>
            <p className={styles.sectionSub}>Toggle per-page, mid-session (relays to all students)</p>
            <div className={styles.list} style={{ marginTop: 14 }}>
              {[
                { key: 'lockdown_fullscreen', label: 'Lockdown fullscreen' },
                { key: 'block_copy_paste',    label: 'Block copy/paste' },
                { key: 'block_tab_switch',    label: 'Block tab switch' },
                { key: 'plagiarism_scan',     label: 'Plagiarism scan' },
                { key: 'focus_ml',            label: 'Focus ML monitoring' },
                { key: 'webcam_required',     label: 'Webcam required' },
              ].map(t => (
                <div key={t.key} className={styles.listRow} style={{ cursor: 'pointer' }}
                  onClick={() => toggleProctor(t.key, !(state.proctor_policy as any)?.[t.key])}>
                  <div className={styles.rowBody}>
                    <div className={styles.rowTitle}>{t.label}</div>
                  </div>
                  <div className={styles.rowSide}>
                    <div style={{
                      width: 44, height: 24, borderRadius: 12, padding: 2, transition: 'all .15s',
                      background: (state.proctor_policy as any)?.[t.key] ? '#7c3aed' : '#d1d5db',
                    }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: 10, background: '#fff',
                        transition: 'all .15s',
                        marginLeft: (state.proctor_policy as any)?.[t.key] ? '22px' : '2px',
                      }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Chat & Broadcast */}
          <div className={styles.sectionCard}>
            <h3 className={styles.sectionTitle}>Chat & Broadcast</h3>
            <p className={styles.sectionSub}>Send messages to all students</p>

            {/* Message input */}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                placeholder="Type a message…"
                onKeyDown={e => e.key === 'Enter' && sendBroadcast()}
                className={styles.input}
                style={{ flex: 1 }}
              />
              <button onClick={sendBroadcast} disabled={busy === 'broadcast' || !chatInput.trim()}
                className={styles.primaryBtn}
                style={{ padding: '0 14px' }}>
                {busy === 'broadcast' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>

            {/* Chat log */}
            <div ref={chatRef} style={{ marginTop: 12, maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {chatMessages.length === 0 ? (
                <div style={{ color: '#9891a6', fontSize: 12, textAlign: 'center', padding: 16 }}>No messages yet.</div>
              ) : chatMessages.slice(-30).map((m, i) => (
                <div key={m.id || i} style={{
                  padding: '8px 10px', borderRadius: 8, fontSize: 13,
                  background: m.to_id ? 'rgba(245,243,255,.8)' : 'rgba(236,253,245,.8)',
                  border: '1px solid #e5e7eb',
                }}>
                  <strong style={{ fontSize: 11, color: '#7c3aed' }}>{m.from_name || m.from_id?.slice(0, 8)}</strong>
                  {m.to_id && <span style={{ fontSize: 11, color: '#9ca3af' }}> → DM</span>}
                  <div style={{ marginTop: 2 }}>{m.text}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Force submit */}
          <div className={styles.sectionCard}>
            <h3 className={styles.sectionTitle}>Force Submit</h3>
            <p className={styles.sectionSub}>Force-submit all students or a single student</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={() => forceSubmit()} disabled={busy === 'force'}
                className={styles.secondaryBtn}>
                {busy === 'force' ? <Loader2 size={14} className="animate-spin" /> : null}
                Submit All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* Code Inspector Modal (D-S5)                                        */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {inspectorStudent && (
        <div className={styles.modalOverlay} onClick={() => setInspectorStudent(null)}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                Code Inspector — {state.spark_grid.find(s => s.student_id === inspectorStudent)?.full_name || 'Student'}
              </h3>
              <button className={styles.closeBtn} onClick={() => setInspectorStudent(null)}>
                <X size={18} />
              </button>
            </div>
            {inspectorBusy ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#9891a6' }}>
                <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                Loading code…
              </div>
            ) : inspectorData?.error ? (
              <div style={{ padding: 24, color: '#9891a6', textAlign: 'center' }}>
                {inspectorData.error as string}
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: 10, fontSize: 12, color: '#6b7280' }}>
                  Saved at: {inspectorData?.saved_at as string} · Version {inspectorData?.version_number as string}
                  · Type: {inspectorData?.save_type as string}
                </div>
                <pre className={styles.codeBlock}>
                  {Object.keys(inspectorFiles).length > 0
                    ? Object.entries(inspectorFiles).map(([name, code]) => (
                        <div key={name}>
                          <div style={{ color: '#facc15', fontSize: 11, marginBottom: 4 }}>// {name}</div>
                          <code>{code}</code>
                        </div>
                      ))
                    : '<no code files>'}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pulse animation for low-focus (D-S3) */}
      <style>{`
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.6; } }
      `}</style>
    </InstructorShell>
  );
}