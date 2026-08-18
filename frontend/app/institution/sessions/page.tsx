'use client';

import { useEffect, useState } from 'react';
import InstitutionShell from '@/components/layout/InstitutionShell';
import { apiClient } from '@/services/api-client';
import { institutionService } from '@/services/institution.service';
import { Radio, Calendar, PlayCircle, StopCircle, History, Plus } from 'lucide-react';
import styles from '../dashboard/page.module.css';

interface Session {
  id: string;
  title?: string;
  status: string;
  scheduled_at: string;
  started_at?: string;
  ended_at?: string;
  instructor_id?: string;
  instructor_name?: string;
  subject_name?: string;
  batch_name?: string;
  section_name?: string;
  student_count?: number;
}

type Tab = 'live' | 'history' | 'schedule';

export default function SessionsPage() {
  const [tab, setTab] = useState<Tab>('live');
  const [liveSessions, setLiveSessions] = useState<Session[]>([]);
  const [historySessions, setHistorySessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Schedule form
  const [batches, setBatches] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [instructors, setInstructors] = useState<any[]>([]);
  const [scheduleForm, setScheduleForm] = useState({
    title: '', section_id: '', subject_id: '', instructor_id: '',
    scheduled_at: '', duration_minutes: '60',
  });

  const toast3 = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const loadLive = async () => {
    try {
      const { data } = await apiClient.get('/institution/sessions/live');
      setLiveSessions(data.live_sessions ?? []);
    } catch { setLiveSessions([]); }
  };

  const loadHistory = async () => {
    try {
      const { data } = await apiClient.get('/institution/sessions/history');
      setHistorySessions(data.sessions ?? []);
    } catch { setHistorySessions([]); }
  };

  const loadAcademic = async () => {
    try {
      const [b, sec, sub, inst] = await Promise.all([
        institutionService.getBatches(),
        institutionService.getSections(),
        institutionService.getSubjects(),
        institutionService.listUsers({ role: 'instructor' }),
      ]);
      setBatches(b); setSections(sec); setSubjects(sub); setInstructors(inst.filter(i => i.is_active));
    } catch {}
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([loadLive(), loadHistory(), loadAcademic()]).finally(() => setLoading(false));
  }, []);

  const terminateSession = async (sessionId: string) => {
    try {
      await apiClient.post(`/institution/sessions/${sessionId}/terminate`);
      toast3('Session terminated.');
      loadLive();
      loadHistory();
    } catch { toast3('Failed to terminate session.'); }
  };

  const scheduleSession = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/institution/sessions', {
        ...scheduleForm,
        duration_minutes: parseInt(scheduleForm.duration_minutes),
      });
      toast3('Session scheduled!');
      setScheduleForm({ title: '', section_id: '', subject_id: '', instructor_id: '', scheduled_at: '', duration_minutes: '60' });
      loadHistory();
      setTab('history');
    } catch (err: any) {
      toast3(err?.response?.data?.error ?? 'Failed to schedule session.');
    }
  };

  const fmt = (d?: string) => d
    ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—';

  const statusColor: Record<string, string> = { scheduled: '#9333ea', active: '#22c55e', ended: '#9891a6', cancelled: '#ef4444' };
  const statusBg: Record<string, string> = { scheduled: '#faf5ff', active: '#f0fdf4', ended: '#faf5ff', cancelled: '#fef2f2' };

  return (
    <InstitutionShell activePage="Sessions" title="Lab Sessions"
      subtitle="Monitor live sessions, view history, and schedule new sessions.">

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 300, background: '#201b2e', color: '#fff', padding: '12px 20px', borderRadius: 12, fontSize: 14, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.18)' }}>{toast}</div>}

      {/* Tab bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div className={styles.tabs}>
          {([
            { id: 'live' as Tab, label: 'Live Sessions', Icon: Radio },
            { id: 'history' as Tab, label: 'Session History', Icon: History },
            { id: 'schedule' as Tab, label: 'Schedule', Icon: Calendar },
          ] as const).map(t => (
            <button key={t.id} className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
              onClick={() => setTab(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <t.Icon size={14} /> {t.label}
            </button>
          ))}
        </div>
        <button className={styles.btnPrimary} onClick={() => setTab('schedule')}>
          <Plus size={14} /> Schedule Session
        </button>
      </div>

      {/* ═══ LIVE SESSIONS ═══ */}
      {tab === 'live' && (
        <>
          {liveSessions.length > 0 && (
            <div style={{ background: 'linear-gradient(135deg,rgba(34,197,94,0.12),rgba(16,185,129,0.08))', border: '1.5px solid rgba(34,197,94,0.25)', borderRadius: 14, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 0 4px rgba(34,197,94,0.2)', animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#166534' }}>
                {liveSessions.length} live session{liveSessions.length > 1 ? 's' : ''} right now
              </span>
            </div>
          )}

          {loading ? <div className={styles.emptyState}>Loading…</div> :
           liveSessions.length === 0 ? (
            <div className={styles.emptyState}>
              <Radio size={32} strokeWidth={1.4} style={{ color: '#d8b4fe', marginBottom: 8 }} />
              <p>No live sessions at the moment.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {liveSessions.map(s => (
                <div key={s.id} style={{ background: 'rgba(255,255,255,0.78)', borderRadius: 16, border: '1.5px solid rgba(34,197,94,0.2)', padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Radio size={18} style={{ color: '#22c55e' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#201b2e' }}>{s.title ?? 'Lab Session'}</p>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: '#9891a6' }}>
                      {s.subject_name && `${s.subject_name} • `}
                      {s.instructor_name && `${s.instructor_name} • `}
                      Started {fmt(s.started_at)}
                    </p>
                  </div>
                  <span style={{ padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: '#f0fdf4', color: '#22c55e' }}>
                    ● Live
                  </span>
                  <button className={styles.btnDanger} onClick={() => terminateSession(s.id)}
                    style={{ padding: '7px 14px', fontSize: 12, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <StopCircle size={13} /> Terminate
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ═══ HISTORY ═══ */}
      {tab === 'history' && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Session</th><th>Status</th><th>Scheduled</th><th>Started</th><th>Ended</th></tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9891a6', padding: 32 }}>Loading…</td></tr> :
               historySessions.length === 0 ? <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9891a6', padding: 32 }}>No session history yet.</td></tr> :
               historySessions.map(s => (
                <tr key={s.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 9, background: s.status === 'active' ? '#f0fdf4' : '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {s.status === 'active' ? <Radio size={15} style={{ color: '#22c55e' }} /> : <PlayCircle size={15} style={{ color: '#9333ea' }} />}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: '#201b2e', fontSize: 14 }}>{s.title ?? 'Lab Session'}</div>
                        {s.subject_name && <div style={{ fontSize: 12, color: '#9891a6' }}>{s.subject_name}</div>}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: statusBg[s.status] ?? '#faf5ff', color: statusColor[s.status] ?? '#9891a6' }}>
                      {s.status}
                    </span>
                  </td>
                  <td style={{ color: '#726a85', fontSize: 13 }}><Calendar size={12} style={{ display: 'inline', marginRight: 4 }} />{fmt(s.scheduled_at)}</td>
                  <td style={{ color: '#726a85', fontSize: 13 }}>{fmt(s.started_at)}</td>
                  <td style={{ color: '#726a85', fontSize: 13 }}>{fmt(s.ended_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ SCHEDULE TAB ═══ */}
      {tab === 'schedule' && (
        <div style={{ maxWidth: 600 }}>
          <div style={{ background: 'rgba(255,255,255,0.78)', borderRadius: 18, border: '1px solid rgba(255,255,255,0.9)', padding: 28 }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: '#201b2e', fontFamily: "'Space Grotesk', sans-serif" }}>Schedule New Session</h3>
            <form onSubmit={scheduleSession}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Session Title *</label>
                <input className={styles.input} placeholder="e.g. Data Structures Lab 5" required
                  value={scheduleForm.title} onChange={e => setScheduleForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className={styles.grid2Tight}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Section</label>
                  <select className={styles.select} value={scheduleForm.section_id}
                    onChange={e => setScheduleForm(f => ({ ...f, section_id: e.target.value }))}>
                    <option value="">Select section…</option>
                    {sections.map(s => {
                      const b = batches.find((b: any) => b.id === s.batch_id);
                      return <option key={s.id} value={s.id}>{s.name} — {b?.name ?? ''}</option>;
                    })}
                  </select>
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Subject</label>
                  <select className={styles.select} value={scheduleForm.subject_id}
                    onChange={e => setScheduleForm(f => ({ ...f, subject_id: e.target.value }))}>
                    <option value="">Select subject…</option>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name} {s.code ? `(${s.code})` : ''}</option>)}
                  </select>
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Instructor</label>
                <select className={styles.select} value={scheduleForm.instructor_id}
                  onChange={e => setScheduleForm(f => ({ ...f, instructor_id: e.target.value }))}>
                  <option value="">Select instructor…</option>
                  {instructors.map(i => <option key={i.id} value={i.id}>{i.full_name} — {i.email}</option>)}
                </select>
              </div>
              <div className={styles.grid2Tight}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Date & Time *</label>
                  <input className={styles.input} type="datetime-local" required
                    value={scheduleForm.scheduled_at}
                    onChange={e => setScheduleForm(f => ({ ...f, scheduled_at: e.target.value }))} />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Duration (mins)</label>
                  <select className={styles.select} value={scheduleForm.duration_minutes}
                    onChange={e => setScheduleForm(f => ({ ...f, duration_minutes: e.target.value }))}>
                    <option value="30">30 mins</option>
                    <option value="45">45 mins</option>
                    <option value="60">1 hour</option>
                    <option value="90">1.5 hours</option>
                    <option value="120">2 hours</option>
                    <option value="180">3 hours</option>
                  </select>
                </div>
              </div>
              <button type="submit" className={styles.btnPrimary} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
                <Calendar size={14} /> Schedule Session
              </button>
            </form>
          </div>
        </div>
      )}
    </InstitutionShell>
  );
}
