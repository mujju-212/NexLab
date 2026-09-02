'use client';

import { useEffect, useMemo, useState } from 'react';
import InstitutionShell from '@/components/layout/InstitutionShell';
import { apiClient } from '@/services/api-client';
import {
  institutionService,
  type BulkScheduleDto,
  type BulkScheduleConflict,
  type SessionEnriched,
} from '@/services/institution.service';
import {
  Radio, Calendar, PlayCircle, StopCircle, History,
  Clock, Users, BookOpen, Edit2, X, ChevronRight,
  AlertTriangle, CheckCircle, CalendarPlus, Layers, CalendarDays,
  ChevronLeft,
} from 'lucide-react';
import styles from '../dashboard/page.module.css';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Session {
  id: string;
  title?: string;
  status: string;
  scheduled_at: string;
  started_at?: string;
  ended_at?: string;
  duration_minutes?: number;
  instructor_id?: string;
  instructor_name?: string;
  subject_name?: string;
  subject_code?: string;
  batch_name?: string;
  section_name?: string;
  section_id?: string;
  student_count?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type Tab = 'live' | 'calendar' | 'upcoming' | 'planner' | 'history';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (d?: string) =>
  d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

const statusColor: Record<string, string> = {
  scheduled: '#7c3aed', active: '#22c55e', ended: '#9891a6', cancelled: '#ef4444',
};
const statusBg: Record<string, string> = {
  scheduled: '#faf5ff', active: '#f0fdf4', ended: '#f9fafb', cancelled: '#fef2f2',
};

// Compute which dates fall on day_of_week (0=Mon … 6=Sun) between start and end
function computeOccurrences(startDate: string, endDate: string, dayOfWeek: number): string[] {
  if (!startDate || !endDate || dayOfWeek < 0 || dayOfWeek > 6) return [];
  const result: string[] = [];
  // JS getDay(): 0=Sun…6=Sat  →  Python weekday(): 0=Mon…6=Sun
  // Convert our dayOfWeek (0=Mon) to JS day (0=Sun): (dayOfWeek+1)%7
  const targetJsDay = (dayOfWeek + 1) % 7;
  const end = new Date(endDate + 'T00:00:00');
  let cur = new Date(startDate + 'T00:00:00');
  while (cur <= end) {
    if (cur.getDay() === targetJsDay) {
      result.push(cur.toISOString().slice(0, 10));
    }
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

// ── Edit modal ────────────────────────────────────────────────────────────────

interface EditModalProps {
  session: Session;
  onClose: () => void;
  onSaved: () => void;
  toast3: (m: string) => void;
}

function EditModal({ session, onClose, onSaved, toast3 }: EditModalProps) {
  const [title, setTitle] = useState(session.title ?? '');
  const [scheduledAt, setScheduledAt] = useState(
    session.scheduled_at ? session.scheduled_at.slice(0, 16) : ''
  );
  const [duration, setDuration] = useState(String(session.duration_minutes ?? 60));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await institutionService.updateSession(session.id, {
        title: title.trim() || undefined,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        duration_minutes: parseInt(duration) || undefined,
      });
      toast3('Session updated.');
      onSaved();
      onClose();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast3(e?.response?.data?.error ?? 'Failed to update session.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h3 className={styles.modalTitle}>Edit Session</h3>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Title</label>
          <input className={styles.input} value={title}
            onChange={e => setTitle(e.target.value)} placeholder="Session title…" />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Date &amp; Time</label>
          <input className={styles.input} type="datetime-local" value={scheduledAt}
            onChange={e => setScheduledAt(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Duration (minutes)</label>
          <select className={styles.select} value={duration} onChange={e => setDuration(e.target.value)}>
            <option value="30">30 mins</option>
            <option value="45">45 mins</option>
            <option value="60">1 hour</option>
            <option value="90">1.5 hours</option>
            <option value="120">2 hours</option>
            <option value="180">3 hours</option>
          </select>
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.btnSecondary} onClick={onClose} disabled={saving}>Cancel</button>
          <button className={styles.btnPrimary} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SessionsPage() {
  const [tab, setTab] = useState<Tab>('live');

  // Sessions data
  const [liveSessions, setLiveSessions] = useState<Session[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<Session[]>([]);
  const [historySessions, setHistorySessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  // Academic lookup data (shared between planner + quick-schedule)
  const [batches, setBatches] = useState<{ id: string; name: string }[]>([]);
  const [allSections, setAllSections] = useState<{ id: string; name: string; batch_id: string }[]>([]);
  const [allSubjects, setAllSubjects] = useState<{ id: string; name: string; code?: string }[]>([]);
  const [instructors, setInstructors] = useState<{ id: string; full_name: string; email: string }[]>([]);
  // section → assigned subjects (lazy loaded per section selection)
  const [sectionSubjects, setSectionSubjects] = useState<{
    id: string; subject_id: string; subject_name: string; subject_code?: string;
    instructor_id: string; instructor_name: string;
  }[]>([]);

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const toast3 = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 4000); };

  // Edit modal
  const [editTarget, setEditTarget] = useState<Session | null>(null);

  // ── Planner form state ─────────────────────────────────────────────────────

  const defaultPlanner: BulkScheduleDto = {
    section_id: '', subject_id: '', instructor_id: '',
    title_prefix: '', day_of_week: 0,
    start_time: '09:00', start_date: '', end_date: '',
    duration_minutes: 60,
  };
  const [planner, setPlanner] = useState<BulkScheduleDto>(defaultPlanner);
  const [plannerBusy, setPlannerBusy] = useState(false);

  // Bulk result
  const [bulkResult, setBulkResult] = useState<{
    created: SessionEnriched[];
    conflicts: BulkScheduleConflict[];
    created_count: number;
    skipped_count: number;
    warnings?: string[];
    message?: string;
  } | null>(null);

  // ── Data loading ───────────────────────────────────────────────────────────

  // Calendar week view — "did I double-book Thursday 10 AM?" answered at a glance.
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));   // Monday of this week
    return d;
  });
  const [weekSessions, setWeekSessions] = useState<Session[]>([]);
  const [weekLoading, setWeekLoading] = useState(false);

  const loadWeek = async (ws: Date) => {
    setWeekLoading(true);
    try {
      const we = new Date(ws); we.setDate(we.getDate() + 7);
      const sessions = await institutionService.getSessionsRange(ws.toISOString(), we.toISOString());
      setWeekSessions(sessions);
    } catch { setWeekSessions([]); }
    setWeekLoading(false);
  };

  useEffect(() => { if (tab === 'calendar') loadWeek(weekStart); /* eslint-disable-line */ }, [tab, weekStart]);

  const weekDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) { const d = new Date(weekStart); d.setDate(d.getDate() + i); days.push(d); }
    return days;
  }, [weekStart]);

  const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const sessionsByDay = useMemo(() => {
    const map: Record<string, Session[]> = {};
    for (const s of weekSessions) {
      const d = new Date(s.scheduled_at);
      const k = dayKey(d);
      (map[k] ??= []).push(s);
    }
    // sort each day by start time
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
    }
    return map;
  }, [weekSessions]);

  const loadLive = async () => {
    try {
      const { data } = await apiClient.get('/institution/sessions/live');
      setLiveSessions(data.live_sessions ?? []);
    } catch { setLiveSessions([]); }
  };

  const loadUpcoming = async () => {
    try {
      const { data } = await apiClient.get('/institution/sessions', {
        params: { status: 'scheduled', limit: 100 },
      });
      const all: Session[] = data.sessions ?? [];
      const now = new Date();
      setUpcomingSessions(
        all
          .filter(s => s.status === 'scheduled' && new Date(s.scheduled_at) >= now)
          .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
      );
    } catch { setUpcomingSessions([]); }
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
      setBatches(b);
      setAllSections(sec);
      setAllSubjects(sub);
      setInstructors(inst.filter(i => i.is_active));
    } catch {}
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([loadLive(), loadUpcoming(), loadHistory(), loadAcademic()])
      .finally(() => setLoading(false));
  }, []);

  // When section is selected in planner → load its assigned subjects
  useEffect(() => {
    if (!planner.section_id) { setSectionSubjects([]); return; }
    institutionService.getSectionSubjects(planner.section_id)
      .then(ss => setSectionSubjects(ss as any[]))
      .catch(() => setSectionSubjects([]));
  }, [planner.section_id]);

  // When subject changes in planner → auto-fill instructor from SectionSubject
  useEffect(() => {
    if (!planner.subject_id || sectionSubjects.length === 0) return;
    const ss = sectionSubjects.find(s => s.subject_id === planner.subject_id);
    if (ss?.instructor_id) {
      setPlanner(f => ({ ...f, instructor_id: ss.instructor_id }));
    }
  }, [planner.subject_id, sectionSubjects]);

  // ── Computed preview dates ─────────────────────────────────────────────────

  const previewDates = useMemo(() =>
    computeOccurrences(planner.start_date, planner.end_date, planner.day_of_week),
    [planner.start_date, planner.end_date, planner.day_of_week]
  );

  // Sections to show in the dropdown (all, since batch context may be unknown)
  const sectionOptions = useMemo(() => {
    return allSections.map(s => {
      const b = batches.find(b => b.id === s.batch_id);
      return { ...s, label: b ? `${s.name} — ${b.name}` : s.name };
    });
  }, [allSections, batches]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const terminateSession = async (sessionId: string) => {
    try {
      await apiClient.post(`/institution/sessions/${sessionId}/terminate`);
      toast3('Session terminated.');
      loadLive();
      loadHistory();
    } catch { toast3('Failed to terminate session.'); }
  };

  const cancelUpcoming = async (sessionId: string) => {
    try {
      await institutionService.cancelSession(sessionId);
      toast3('Session cancelled.');
      loadUpcoming();
    } catch { toast3('Failed to cancel session.'); }
  };

  const submitPlanner = async () => {
    setBulkResult(null);
    // Validate
    if (!planner.section_id) { toast3('Please select a section.'); return; }
    if (!planner.subject_id) { toast3('Please select a subject.'); return; }
    if (!planner.title_prefix.trim()) { toast3('Title prefix is required.'); return; }
    if (!planner.start_date) { toast3('Start date is required.'); return; }
    if (!planner.end_date)   { toast3('End date is required.'); return; }
    if (planner.end_date < planner.start_date) { toast3('End date must be after start date.'); return; }
    if (previewDates.length === 0) { toast3('No occurrences of that weekday fall within the date range.'); return; }

    setPlannerBusy(true);
    try {
      const result = await institutionService.bulkScheduleSessions({
        ...planner,
        title_prefix: planner.title_prefix.trim(),
        instructor_id: planner.instructor_id || undefined,
        duration_minutes: Number(planner.duration_minutes),
      });
      setBulkResult(result);
      if (result.created_count > 0) {
        toast3(`✓ ${result.created_count} session${result.created_count > 1 ? 's' : ''} scheduled!`);
        loadUpcoming();
      } else {
        toast3('No sessions created — all occurrences have conflicts.');
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast3(e?.response?.data?.error ?? 'Failed to schedule sessions.');
    } finally {
      setPlannerBusy(false);
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  const StatusBadge = ({ status }: { status: string }) => (
    <span style={{
      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: statusBg[status] ?? '#faf5ff', color: statusColor[status] ?? '#9891a6',
      textTransform: 'capitalize', letterSpacing: '.03em',
    }}>{status}</span>
  );

  // ── Page ───────────────────────────────────────────────────────────────────

  return (
    <InstitutionShell activePage="Sessions" title="Lab Sessions"
      subtitle="Monitor live sessions, schedule recurring plans, and view history.">

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 300,
          background: '#201b2e', color: '#fff', padding: '12px 20px',
          borderRadius: 12, fontSize: 14, fontWeight: 600,
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        }}>
          {toast}
        </div>
      )}

      {/* Edit modal */}
      {editTarget && (
        <EditModal
          session={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={loadUpcoming}
          toast3={toast3}
        />
      )}

      {/* ── Tab bar ── */}
      <div className={styles.tabs} style={{ marginBottom: 24 }}>
        {([
          { id: 'live'     as Tab, label: 'Live',     Icon: Radio },
          { id: 'calendar' as Tab, label: 'Calendar', Icon: CalendarDays },
          { id: 'upcoming' as Tab, label: 'Upcoming',  Icon: Clock },
          { id: 'planner'  as Tab, label: 'Planner',   Icon: CalendarPlus },
          { id: 'history'  as Tab, label: 'History',   Icon: History },
        ] as const).map(t => (
          <button key={t.id}
            className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
            onClick={() => setTab(t.id)}>
            <t.Icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          LIVE
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'live' && (
        <>
          {liveSessions.length > 0 && (
            <div style={{
              background: 'linear-gradient(135deg,rgba(34,197,94,0.12),rgba(16,185,129,0.08))',
              border: '1.5px solid rgba(34,197,94,0.25)', borderRadius: 14,
              padding: '14px 20px', marginBottom: 20,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{
                width: 10, height: 10, borderRadius: '50%', background: '#22c55e',
                display: 'inline-block', boxShadow: '0 0 0 4px rgba(34,197,94,0.2)',
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#166534' }}>
                {liveSessions.length} live session{liveSessions.length > 1 ? 's' : ''} in progress
              </span>
            </div>
          )}

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : liveSessions.length === 0 ? (
            <div className={styles.emptyState}>
              <Radio size={32} strokeWidth={1.4} style={{ color: '#d8b4fe', marginBottom: 8 }} />
              <p style={{ margin: 0 }}>No live sessions at the moment.</p>
              <p style={{ margin: 0, fontSize: 12 }}>Upcoming sessions are on the <strong>Upcoming</strong> tab.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {liveSessions.map(s => (
                <div key={s.id} style={{
                  background: 'rgba(255,255,255,0.78)', borderRadius: 16,
                  border: '1.5px solid rgba(34,197,94,0.2)', padding: '18px 22px',
                  display: 'flex', alignItems: 'center', gap: 16,
                }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 12, background: '#f0fdf4',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Radio size={18} style={{ color: '#22c55e' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#201b2e' }}>
                      {s.title ?? 'Lab Session'}
                    </p>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: '#9891a6' }}>
                      {[s.subject_name, s.section_name, s.instructor_name && `Instr. ${s.instructor_name}`]
                        .filter(Boolean).join(' • ')}
                      {s.started_at && ` • Started ${fmt(s.started_at)}`}
                    </p>
                  </div>
                  {s.student_count != null && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#6b7280' }}>
                      <Users size={13} /> {s.student_count}
                    </span>
                  )}
                  <span style={{
                    padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                    background: '#f0fdf4', color: '#22c55e',
                  }}>● Live</span>
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

      {/* ═══════════════════════════════════════════════════════════════════
          UPCOMING
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'upcoming' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#726a85' }}>
              {upcomingSessions.length} scheduled session{upcomingSessions.length !== 1 ? 's' : ''} — sorted by date
            </p>
            <button className={styles.btnPrimary} onClick={() => setTab('planner')} style={{ gap: 6 }}>
              <CalendarPlus size={14} /> Schedule More
            </button>
          </div>

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : upcomingSessions.length === 0 ? (
            <div className={styles.emptyState}>
              <Clock size={32} strokeWidth={1.4} style={{ color: '#d8b4fe', marginBottom: 8 }} />
              <p style={{ margin: 0 }}>No upcoming sessions scheduled.</p>
              <button className={styles.btnPrimary} style={{ marginTop: 12 }} onClick={() => setTab('planner')}>
                <CalendarPlus size={14} /> Open Planner
              </button>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Session</th>
                    <th>Section / Subject</th>
                    <th>Instructor</th>
                    <th>Scheduled</th>
                    <th>Duration</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingSessions.map(s => (
                    <tr key={s.id}>
                      <td>
                        <div style={{ fontWeight: 700, color: '#201b2e', fontSize: 14 }}>
                          {s.title ?? 'Lab Session'}
                        </div>
                        <StatusBadge status={s.status} />
                      </td>
                      <td>
                        <div style={{ fontSize: 13, color: '#463f57', fontWeight: 600 }}>
                          {s.section_name ?? '—'}
                        </div>
                        {s.subject_name && (
                          <div style={{ fontSize: 12, color: '#9891a6' }}>
                            {s.subject_name}{s.subject_code ? ` (${s.subject_code})` : ''}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: 13, color: '#726a85' }}>
                        {s.instructor_name ?? '—'}
                      </td>
                      <td style={{ fontSize: 13, color: '#726a85', whiteSpace: 'nowrap' }}>
                        <Calendar size={11} style={{ display: 'inline', marginRight: 4 }} />
                        {fmt(s.scheduled_at)}
                      </td>
                      <td style={{ fontSize: 13, color: '#726a85' }}>
                        {s.duration_minutes ? `${s.duration_minutes} min` : '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => setEditTarget(s)}
                            title="Edit"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '5px 11px', borderRadius: 8, border: '1.5px solid rgba(124,58,237,.2)',
                              background: 'rgba(245,243,255,.7)', color: '#7c3aed',
                              fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            }}>
                            <Edit2 size={11} /> Edit
                          </button>
                          <button
                            onClick={() => cancelUpcoming(s.id)}
                            title="Cancel"
                            className={styles.btnDanger}
                            style={{ padding: '5px 11px', fontSize: 12 }}>
                            <X size={11} /> Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          PLANNER
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'planner' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>

          {/* ── Left: form ── */}
          <div style={{
            background: 'rgba(255,255,255,0.82)', borderRadius: 20,
            border: '1px solid rgba(255,255,255,0.92)', padding: 28,
            boxShadow: '0 2px 16px rgba(124,58,237,0.07)',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: 'rgba(124,58,237,0.09)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Layers size={18} color="#7c3aed" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#201b2e', fontFamily: "'Space Grotesk',sans-serif" }}>
                  Recurring Session Planner
                </h3>
                <p style={{ margin: 0, fontSize: 12, color: '#9891a6' }}>
                  Set a date range + weekday → sessions auto-generate for every occurrence
                </p>
              </div>
            </div>

            {/* Title prefix */}
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Session title prefix *</label>
              <input className={styles.input}
                placeholder="e.g. DS Lab — sessions will be named “DS Lab — Session 1”, etc."
                value={planner.title_prefix}
                onChange={e => setPlanner(f => ({ ...f, title_prefix: e.target.value }))} />
            </div>

            {/* Section */}
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Section *</label>
              <select className={styles.select} value={planner.section_id}
                onChange={e => setPlanner(f => ({
                  ...f, section_id: e.target.value, subject_id: '', instructor_id: '',
                }))}>
                <option value="">Select section…</option>
                {sectionOptions.map(s => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>

            {/* Subject — filtered to section's assignments */}
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Subject *</label>
              {planner.section_id ? (
                sectionSubjects.length > 0 ? (
                  <select className={styles.select} value={planner.subject_id}
                    onChange={e => setPlanner(f => ({ ...f, subject_id: e.target.value, instructor_id: '' }))}>
                    <option value="">Select subject…</option>
                    {sectionSubjects.map(ss => (
                      <option key={ss.id} value={ss.subject_id}>
                        {ss.subject_name}{ss.subject_code ? ` (${ss.subject_code})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div style={{
                    padding: '10px 13px', borderRadius: 10, border: '1.5px solid #fcd34d',
                    background: '#fffbeb', color: '#92400e', fontSize: 13,
                  }}>
                    No subjects assigned to this section yet. Assign subjects from the Academic page first,
                    or select a different subject below and provide an instructor to create the assignment now.
                  </div>
                )
              ) : (
                <select className={styles.select} disabled>
                  <option>Select a section first…</option>
                </select>
              )}

              {/* Fallback: let admin pick any subject + instructor to create the assignment on the fly */}
              {planner.section_id && sectionSubjects.length === 0 && (
                <select className={styles.select} value={planner.subject_id}
                  style={{ marginTop: 8 }}
                  onChange={e => setPlanner(f => ({ ...f, subject_id: e.target.value }))}>
                  <option value="">— Or pick any subject —</option>
                  {allSubjects.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}{s.code ? ` (${s.code})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Instructor */}
            <div className={styles.field}>
              <label className={styles.fieldLabel}>
                Instructor
                {planner.instructor_id && sectionSubjects.find(ss => ss.subject_id === planner.subject_id)?.instructor_id === planner.instructor_id
                  ? ' (auto-filled from assignment)'
                  : ''}
              </label>
              <select className={styles.select} value={planner.instructor_id}
                onChange={e => setPlanner(f => ({ ...f, instructor_id: e.target.value }))}>
                <option value="">Select instructor…</option>
                {instructors.map(i => (
                  <option key={i.id} value={i.id}>{i.full_name} — {i.email}</option>
                ))}
              </select>
            </div>

            {/* Day of week */}
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Day of week *</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {DAY_NAMES.map((name, idx) => (
                  <button key={idx}
                    type="button"
                    onClick={() => setPlanner(f => ({ ...f, day_of_week: idx }))}
                    style={{
                      padding: '7px 13px', borderRadius: 9, border: '1.5px solid',
                      borderColor: planner.day_of_week === idx ? '#7c3aed' : '#e5e7eb',
                      background: planner.day_of_week === idx ? '#f5f3ff' : '#fff',
                      color: planner.day_of_week === idx ? '#7c3aed' : '#6b7280',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      transition: 'all .15s',
                    }}>
                    {DAY_SHORT[idx]}
                  </button>
                ))}
              </div>
            </div>

            {/* Time + Duration */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Start time *</label>
                <input className={styles.input} type="time" value={planner.start_time}
                  onChange={e => setPlanner(f => ({ ...f, start_time: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Duration</label>
                <select className={styles.select} value={planner.duration_minutes}
                  onChange={e => setPlanner(f => ({ ...f, duration_minutes: parseInt(e.target.value) }))}>
                  <option value={30}>30 mins</option>
                  <option value={45}>45 mins</option>
                  <option value={60}>1 hour</option>
                  <option value={90}>1.5 hours</option>
                  <option value={120}>2 hours</option>
                  <option value={180}>3 hours</option>
                </select>
              </div>
            </div>

            {/* Date range */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Start date *</label>
                <input className={styles.input} type="date" value={planner.start_date}
                  onChange={e => setPlanner(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>End date *</label>
                <input className={styles.input} type="date" value={planner.end_date}
                  onChange={e => setPlanner(f => ({ ...f, end_date: e.target.value }))} />
              </div>
            </div>

            {/* Submit */}
            <button className={styles.btnPrimary}
              style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}
              disabled={plannerBusy} onClick={submitPlanner}>
              {plannerBusy ? 'Scheduling…' : (
                <>
                  <CalendarPlus size={14} />
                  Schedule {previewDates.length > 0 ? `${previewDates.length} Session${previewDates.length > 1 ? 's' : ''}` : 'Sessions'}
                </>
              )}
            </button>
          </div>

          {/* ── Right: preview panel ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Date preview */}
            <div style={{
              background: 'rgba(255,255,255,0.82)', borderRadius: 18,
              border: '1px solid rgba(255,255,255,0.92)', padding: 22,
              boxShadow: '0 2px 12px rgba(124,58,237,0.07)',
            }}>
              <h4 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#463f57', textTransform: 'uppercase', letterSpacing: '.06em', fontFamily: "'JetBrains Mono',monospace" }}>
                Generated Dates ({previewDates.length})
              </h4>
              {previewDates.length === 0 ? (
                <p style={{ fontSize: 13, color: '#9891a6', margin: 0, textAlign: 'center', padding: '12px 0' }}>
                  Fill in the date range and weekday to preview dates.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                  {previewDates.map((d, i) => {
                    // Check if this date is in conflicts after submission
                    const conflict = bulkResult?.conflicts.find(c => c.date === d);
                    const created = bulkResult?.created.find(c => c.scheduled_at.startsWith(d));
                    return (
                      <div key={d} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px', borderRadius: 10,
                        background: conflict ? 'rgba(239,68,68,0.07)' : created ? 'rgba(34,197,94,0.07)' : 'rgba(245,243,255,0.8)',
                        border: `1px solid ${conflict ? 'rgba(239,68,68,0.15)' : created ? 'rgba(34,197,94,0.15)' : 'rgba(124,58,237,0.1)'}`,
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#9891a6', fontFamily: "'JetBrains Mono',monospace", minWidth: 22 }}>
                          #{i + 1}
                        </span>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: conflict ? '#dc2626' : created ? '#15803d' : '#463f57' }}>
                          {fmtDate(d)}
                        </span>
                        <span style={{ fontSize: 11, color: '#9891a6', fontFamily: "'JetBrains Mono',monospace" }}>
                          {planner.start_time}
                        </span>
                        {conflict && <AlertTriangle size={13} color="#ef4444" />}
                        {created && <CheckCircle size={13} color="#22c55e" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bulk result summary */}
            {bulkResult && (
              <div style={{
                background: 'rgba(255,255,255,0.82)', borderRadius: 18,
                border: '1px solid rgba(255,255,255,0.92)', padding: 22,
                boxShadow: '0 2px 12px rgba(124,58,237,0.07)',
              }}>
                <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#463f57', textTransform: 'uppercase', letterSpacing: '.06em', fontFamily: "'JetBrains Mono',monospace" }}>
                  Result
                </h4>
                <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                  <div style={{
                    flex: 1, textAlign: 'center', padding: '12px 8px', borderRadius: 12,
                    background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)',
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#15803d', lineHeight: 1 }}>
                      {bulkResult.created_count}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#15803d', marginTop: 4 }}>Scheduled</div>
                  </div>
                  <div style={{
                    flex: 1, textAlign: 'center', padding: '12px 8px', borderRadius: 12,
                    background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.12)',
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#dc2626', lineHeight: 1 }}>
                      {bulkResult.skipped_count}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', marginTop: 4 }}>Conflicts</div>
                  </div>
                </div>

                {/* Conflict detail list */}
                {bulkResult.conflicts.length > 0 && (
                  <>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#9891a6', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                      Skipped dates
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {bulkResult.conflicts.map((c, i) => (
                        <div key={i} style={{
                          padding: '8px 12px', borderRadius: 10,
                          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                            <AlertTriangle size={11} color="#ef4444" />
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>
                              {fmtDate(c.date)} at {c.time}
                            </span>
                          </div>
                          <p style={{ margin: 0, fontSize: 11.5, color: '#6b7280', lineHeight: 1.45 }}>{c.reason}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Readiness warnings — non-blocking, surfaced so the admin can act */}
                {(bulkResult.warnings?.length ?? 0) > 0 && (
                  <>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#9891a6', margin: '10px 0 8px', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                      Heads-up
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {bulkResult.warnings!.map((w, i) => (
                        <div key={i} style={{
                          padding: '8px 12px', borderRadius: 10,
                          background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                            <AlertTriangle size={11} color="#f59e0b" style={{ marginTop: 2, flexShrink: 0 }} />
                            <p style={{ margin: 0, fontSize: 11.5, color: '#92400e', lineHeight: 1.45 }}>{w}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {bulkResult.message && (
                  <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#9891a6', fontStyle: 'italic' }}>
                    {bulkResult.message}
                  </p>
                )}

                <button className={styles.btnSecondary}
                  style={{ width: '100%', justifyContent: 'center', marginTop: 14 }}
                  onClick={() => setTab('upcoming')}>
                  <ChevronRight size={14} /> View Upcoming Sessions
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          CALENDAR — week grid for spotting clashes and gaps at a glance
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'calendar' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className={styles.btnSecondary} onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); }}>
                <ChevronLeft size={14} /> Prev
              </button>
              <button className={styles.btnSecondary} onClick={() => {
                const d = new Date(); d.setHours(0, 0, 0, 0);
                d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
                setWeekStart(d);
              }}>This week</button>
              <button className={styles.btnSecondary} onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); }}>
                Next <ChevronRight size={14} />
              </button>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: '#726a85', fontWeight: 600 }}>
              {weekStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} –{' '}
              {new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              {weekLoading && <span style={{ marginLeft: 8, color: '#9891a6', fontWeight: 400 }}>loading…</span>}
            </p>
          </div>

          {/* 7-day grid; blocks positioned by local time (backend now sends UTC with Z) */}
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '64px repeat(7, minmax(120px, 1fr))', minWidth: 900, border: '1px solid rgba(124,58,237,0.12)', borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
              {/* Header row */}
              <div style={{ padding: 8, background: '#faf9ff', fontSize: 11, fontWeight: 700, color: '#9891a6' }}>GMT{new Date().getTimezoneOffset() === 0 ? '' : (new Date().getTimezoneOffset() > 0 ? '-' : '+') + Math.floor(Math.abs(new Date().getTimezoneOffset()) / 60)}</div>
              {weekDays.map(d => {
                const isToday = dayKey(d) === dayKey(new Date());
                return (
                  <div key={dayKey(d)} style={{
                    padding: 8, background: isToday ? 'rgba(147,51,234,0.08)' : '#faf9ff',
                    textAlign: 'center', borderLeft: '1px solid rgba(124,58,237,0.08)',
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: isToday ? '#7c3aed' : '#9891a6', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      {DAY_SHORT[(d.getDay() + 6) % 7]}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: isToday ? '#7c3aed' : '#201b2e' }}>{d.getDate()}</div>
                  </div>
                );
              })}

              {/* Time gutter + day columns */}
              {[...Array(13)].map((_, i) => {
                const hour = 8 + i;   // 8:00 → 20:00
                return (
                  <div key={hour} style={{ display: 'contents' }}>
                    <div style={{ padding: '4px 6px', borderTop: '1px solid #f1ecfb', fontSize: 10.5, color: '#9891a6', fontWeight: 600 }}>{hour}:00</div>
                    {weekDays.map(d => {
                      const k = dayKey(d);
                      const blocks = (sessionsByDay[k] ?? []).filter(s => {
                        const st = new Date(s.scheduled_at); return st.getHours() === hour;
                      });
                      return (
                        <div key={`${k}-${hour}`} style={{ borderTop: '1px solid #f1ecfb', borderLeft: '1px solid rgba(124,58,237,0.08)', padding: 3, minHeight: 44, background: dayKey(d) === dayKey(new Date()) ? 'rgba(147,51,234,0.03)' : 'transparent' }}>
                          {blocks.map(s => {
                            const st = new Date(s.scheduled_at);
                            return (
                              <div key={s.id} title={`${s.title || 'Lab session'}\n${st.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} · ${s.subject_name ?? ''} · ${s.section_name ?? ''}\nInstructor: ${s.instructor_name ?? '—'}`}
                                style={{
                                  marginBottom: 3, padding: '5px 7px', borderRadius: 8, cursor: 'default',
                                  background: statusBg[s.status] ?? '#faf5ff',
                                  border: `1.5px solid ${statusColor[s.status] ?? '#7c3aed'}44`,
                                  borderLeft: `3.5px solid ${statusColor[s.status] ?? '#7c3aed'}`,
                                }}>
                                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#201b2e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {st.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} {s.subject_code || s.title || 'Lab'}
                                </div>
                                <div style={{ fontSize: 10, color: '#726a85', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {s.section_name ?? ''}{s.instructor_name ? ` · ${s.instructor_name}` : ''}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {!weekLoading && weekSessions.length === 0 && (
            <p style={{ margin: '18px 0 0', fontSize: 13, color: '#9891a6' }}>
              No sessions this week — use the Planner to fill it.
            </p>
          )}
          <p style={{ margin: '12px 0 0', fontSize: 12, color: '#9891a6' }}>
            Times shown in your local timezone. Overlaps are checked automatically by the Planner.
          </p>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          HISTORY
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'history' && (
        <>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: '#726a85' }}>
            {historySessions.length} session{historySessions.length !== 1 ? 's' : ''} in history
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Status</th>
                  <th>Section / Subject</th>
                  <th>Instructor</th>
                  <th>Scheduled</th>
                  <th>Started</th>
                  <th>Ended</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9891a6', padding: 32 }}>Loading…</td></tr>
                ) : historySessions.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9891a6', padding: 32 }}>No session history yet.</td></tr>
                ) : historySessions.map(s => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                          background: s.status === 'active' ? '#f0fdf4' : '#faf5ff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {s.status === 'active'
                            ? <Radio size={15} style={{ color: '#22c55e' }} />
                            : <PlayCircle size={15} style={{ color: '#9333ea' }} />}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: '#201b2e', fontSize: 14 }}>
                            {s.title ?? 'Lab Session'}
                          </div>
                          {s.subject_name && (
                            <div style={{ fontSize: 12, color: '#9891a6' }}>
                              <BookOpen size={10} style={{ display: 'inline', marginRight: 3 }} />
                              {s.subject_name}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td><StatusBadge status={s.status} /></td>
                    <td>
                      <div style={{ fontSize: 13, color: '#463f57', fontWeight: 600 }}>{s.section_name ?? '—'}</div>
                      {s.subject_name && <div style={{ fontSize: 12, color: '#9891a6' }}>{s.subject_name}</div>}
                    </td>
                    <td style={{ fontSize: 13, color: '#726a85' }}>{s.instructor_name ?? '—'}</td>
                    <td style={{ fontSize: 13, color: '#726a85', whiteSpace: 'nowrap' }}>
                      <Calendar size={11} style={{ display: 'inline', marginRight: 4 }} />
                      {fmt(s.scheduled_at)}
                    </td>
                    <td style={{ fontSize: 13, color: '#726a85' }}>{fmt(s.started_at)}</td>
                    <td style={{ fontSize: 13, color: '#726a85' }}>{fmt(s.ended_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </InstitutionShell>
  );
}
