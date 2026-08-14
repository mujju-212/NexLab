'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarClock, PlayCircle, Radio, Clock, Users, CheckCircle2, AlertCircle,
  Plus, ShieldCheck, Video, Lock, RotateCcw, X, BrainCircuit
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import { sessionService } from '@/services/session.service';
import { experimentService } from '@/services/experiment.service';
import styles from '../shared.module.css';

interface EnrichedSession {
  id: string;
  experiment_id: string;
  section_subject_id: string;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_minutes: number;
  gate_score_threshold: number;
  late_join_window_min: number;
  catchup_enabled: boolean;
  catchup_deadline: string | null;
  focus_ml_enabled: boolean;
  lockdown_enabled: boolean;
  status: 'scheduled' | 'active' | 'ended';
  jitsi_room_name: string | null;
  experiment_title: string;
  subject_name: string | null;
  section_name: string | null;
  student_count: number;
}

interface SectionSubject {
  section_subject_id: string;
  subject_id: string;
  subject_name: string;
  subject_code: string;
  section_name: string;
  student_count: number;
}

interface InstructorExperiment {
  id: string;
  title: string;
  subject_id?: string;
  is_published: boolean;
}

type Filter = 'All' | 'Live' | 'Upcoming' | 'Completed';

const STATUS_FILTER: Record<Exclude<Filter, 'All'>, string> = {
  Live: 'active',
  Upcoming: 'scheduled',
  Completed: 'ended',
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }) : '—';

export default function SessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<EnrichedSession[]>([]);
  const [filter, setFilter] = useState<Filter>('All');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Wizard state
  const [showWizard, setShowWizard] = useState(false);
  const [sectionSubjects, setSectionSubjects] = useState<SectionSubject[]>([]);
  const [experiments, setExperiments] = useState<InstructorExperiment[]>([]);
  const [form, setForm] = useState({
    section_subject_id: '',
    experiment_id: '',
    date: '',
    time: '',
    duration_minutes: 90,
    gate_score_threshold: 70,
    late_join_window_min: 10,
    focus_ml_enabled: false,
    lockdown_enabled: false,
    catchup_enabled: false,
    catchup_days: 3,
  });
  const [saving, setSaving] = useState(false);

  const toast3 = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(async () => {
    try {
      const data = await sessionService.list();
      setSessions(data.sessions ?? []);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openWizard = async () => {
    setShowWizard(true);
    try {
      const [ssData, exps] = await Promise.all([
        sessionService.getSectionSubjects(),
        experimentService.listMine(),
      ]);
      setSectionSubjects(ssData.section_subjects ?? []);
      setExperiments((exps as InstructorExperiment[]) ?? []);
    } catch {
      toast3('Could not load subjects/experiments.');
    }
  };

  const selectedSS = sectionSubjects.find(s => s.section_subject_id === form.section_subject_id);
  const visibleExperiments = selectedSS
    ? experiments.filter(e => e.subject_id === selectedSS.subject_id)
    : experiments;

  const schedule = async () => {
    if (!form.section_subject_id || !form.experiment_id || !form.date || !form.time) {
      toast3('Please fill subject, experiment, date and time.');
      return;
    }
    setSaving(true);
    try {
      const scheduled_at = new Date(`${form.date}T${form.time}`).toISOString();
      const payload: Parameters<typeof sessionService.schedule>[0] = {
        section_subject_id: form.section_subject_id,
        experiment_id: form.experiment_id,
        scheduled_at,
        duration_minutes: form.duration_minutes,
        gate_score_threshold: form.gate_score_threshold,
        late_join_window_min: form.late_join_window_min,
        focus_ml_enabled: form.focus_ml_enabled,
        lockdown_enabled: form.lockdown_enabled,
        catchup_enabled: form.catchup_enabled,
      };
      if (form.catchup_enabled) {
        const d = new Date(`${form.date}T${form.time}`);
        d.setDate(d.getDate() + form.catchup_days);
        payload.catchup_deadline = d.toISOString();
      }
      await sessionService.schedule(payload);
      toast3('Session scheduled.');
      setShowWizard(false);
      load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast3(e?.response?.data?.error ?? 'Failed to schedule session.');
    } finally {
      setSaving(false);
    }
  };

  const startSession = async (id: string) => {
    setBusyId(id);
    try {
      await sessionService.start(id);
      toast3('Session started — students can now join.');
      load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast3(e?.response?.data?.error ?? 'Could not start session.');
    } finally {
      setBusyId(null);
    }
  };

  const endSession = async (id: string) => {
    setBusyId(id);
    try {
      await sessionService.end(id);
      toast3('Session ended.');
      load();
    } catch {
      toast3('Could not end session.');
    } finally {
      setBusyId(null);
    }
  };

  const filtered = sessions.filter(
    s => filter === 'All' || s.status === STATUS_FILTER[filter]
  );

  const statusPill = (status: string) =>
    status === 'active' ? styles.pillGreen :
    status === 'scheduled' ? styles.pillBlue : styles.pillSlate;

  return (
    <InstructorShell activePage="Sessions" title="Lab Sessions"
      subtitle="Schedule, start and manage your lab sessions.">

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 300, background: '#111827', color: '#fff', padding: '12px 20px', borderRadius: 12, fontSize: 14, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>{toast}</div>}

      <div className={styles.actionRow}>
        <div className={styles.tabRow}>
          {(['All', 'Live', 'Upcoming', 'Completed'] as Filter[]).map(f => (
            <button key={f}
              className={`${styles.tabChip} ${filter === f ? styles.tabChipActive : ''}`}
              onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
        <button className={styles.primaryBtn} onClick={openWizard}>
          <Plus size={14} /> Schedule Session
        </button>
      </div>

      <div className={styles.sectionCard}>
        {loading ? (
          <p className={styles.sectionSub}>Loading sessions…</p>
        ) : filtered.length === 0 ? (
          <p className={styles.sectionSub}>No {filter !== 'All' ? filter.toLowerCase() : ''} sessions yet. Schedule one to get started.</p>
        ) : (
          <div className={styles.list}>
            {filtered.map(s => (
              <div key={s.id} className={styles.listRow}>
                <div className={styles.rowIcon} style={{
                  background: s.status === 'active' ? '#ecfdf5' : s.status === 'scheduled' ? '#faf5ff' : '#faf5ff',
                }}>
                  {s.status === 'active' ? <Radio size={16} color="#059669" /> :
                   s.status === 'scheduled' ? <CalendarClock size={16} color="#7c3aed" /> :
                   <CheckCircle2 size={16} color="#6b7280" />}
                </div>
                <div className={styles.rowBody}>
                  <p className={styles.rowTitle}>{s.experiment_title}</p>
                  <p className={styles.rowMeta}>
                    {s.subject_name ?? 'Subject'}{s.section_name ? ` · Section ${s.section_name}` : ''} · {s.student_count} students
                  </p>
                  <p className={styles.rowSub}>
                    <Clock size={11} style={{ display: 'inline', marginRight: 3 }} />
                    {fmt(s.scheduled_at)} · {s.duration_minutes} min · gate {s.gate_score_threshold}%
                    {s.focus_ml_enabled && <> · <BrainCircuit size={11} style={{ display: 'inline' }} /> focus ML</>}
                    {s.lockdown_enabled && <> · <Lock size={11} style={{ display: 'inline' }} /> lockdown</>}
                    {s.catchup_enabled && <> · <RotateCcw size={11} style={{ display: 'inline' }} /> catch-up</>}
                  </p>
                </div>
                <div className={styles.rowSide}>
                  <span className={`${styles.pill} ${statusPill(s.status)}`}>
                    {s.status === 'active' ? 'Live' : s.status === 'scheduled' ? 'Upcoming' : 'Ended'}
                  </span>
                  {s.status === 'scheduled' && (
                    <button className={styles.primaryBtn} disabled={busyId === s.id}
                      onClick={() => startSession(s.id)}>
                      <PlayCircle size={13} /> {busyId === s.id ? 'Starting…' : 'Start'}
                    </button>
                  )}
                  {s.status === 'active' && (
                    <>
                      <button className={styles.primaryBtn}
                        onClick={() => router.push(`/instructor/live-lab?session=${s.id}`)}>
                        <Video size={13} /> Open Live Lab
                      </button>
                      <button className={styles.ghostBtn} disabled={busyId === s.id}
                        onClick={() => endSession(s.id)}>
                        End
                      </button>
                    </>
                  )}
                  {s.status === 'ended' && (
                    <>
                      <button className={styles.ghostBtn}
                        onClick={() => router.push(`/instructor/students?session=${s.id}`)}>
                        <Users size={13} /> Attendance
                      </button>
                      <button className={styles.ghostBtn}
                        onClick={() => router.push('/instructor/grading')}>
                        Grade
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══ Schedule Wizard ══ */}
      {showWizard && (
        <div className={styles.modalOverlay} onClick={() => setShowWizard(false)}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Schedule New Session</h2>
              <button className={styles.closeBtn} onClick={() => setShowWizard(false)}><X size={16} /></button>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Class (section + subject)</label>
              <select className={styles.select} value={form.section_subject_id}
                onChange={e => setForm(f => ({ ...f, section_subject_id: e.target.value, experiment_id: '' }))}>
                <option value="">Select class…</option>
                {sectionSubjects.map(ss => (
                  <option key={ss.section_subject_id} value={ss.section_subject_id}>
                    {ss.subject_name} ({ss.subject_code}) — Section {ss.section_name} · {ss.student_count} students
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Experiment</label>
              <select className={styles.select} value={form.experiment_id}
                onChange={e => setForm(f => ({ ...f, experiment_id: e.target.value }))}>
                <option value="">Select experiment…</option>
                {visibleExperiments.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.title}{e.is_published ? '' : ' (draft)'}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.gridTwo}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Date</label>
                <input className={styles.input} type="date" value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Start time</label>
                <input className={styles.input} type="time" value={form.time}
                  onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
              </div>
            </div>

            <div className={styles.gridTwo}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Duration</label>
                <select className={styles.select} value={form.duration_minutes}
                  onChange={e => setForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) }))}>
                  <option value={60}>60 minutes</option>
                  <option value={90}>90 minutes</option>
                  <option value={120}>120 minutes</option>
                  <option value={180}>180 minutes</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Quiz gate threshold (%)</label>
                <input className={styles.input} type="number" min={0} max={100}
                  value={form.gate_score_threshold}
                  onChange={e => setForm(f => ({ ...f, gate_score_threshold: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>

            <div className={styles.gridTwo}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Late join window (min)</label>
                <input className={styles.input} type="number" min={0} max={60}
                  value={form.late_join_window_min}
                  onChange={e => setForm(f => ({ ...f, late_join_window_min: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Catch-up window (days)</label>
                <input className={styles.input} type="number" min={1} max={14} disabled={!form.catchup_enabled}
                  value={form.catchup_days}
                  onChange={e => setForm(f => ({ ...f, catchup_days: parseInt(e.target.value) || 3 }))} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', margin: '4px 0 16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.focus_ml_enabled}
                  onChange={e => setForm(f => ({ ...f, focus_ml_enabled: e.target.checked }))} />
                <BrainCircuit size={13} /> Focus ML monitoring
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.lockdown_enabled}
                  onChange={e => setForm(f => ({ ...f, lockdown_enabled: e.target.checked }))} />
                <Lock size={13} /> Browser lockdown
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.catchup_enabled}
                  onChange={e => setForm(f => ({ ...f, catchup_enabled: e.target.checked }))} />
                <RotateCcw size={13} /> Allow catch-up
              </label>
            </div>

            <div className={styles.actionRow}>
              <span style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 5 }}>
                <ShieldCheck size={13} /> A Jitsi video room is created automatically
              </span>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className={styles.secondaryBtn} onClick={() => setShowWizard(false)}>Cancel</button>
                <button className={styles.primaryBtn} disabled={saving} onClick={schedule}>
                  <CalendarClock size={13} /> {saving ? 'Scheduling…' : 'Schedule Session'}
                </button>
              </div>
            </div>

            {experiments.length > 0 && visibleExperiments.length === 0 && selectedSS && (
              <p style={{ fontSize: 12, color: '#b45309', marginTop: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
                <AlertCircle size={13} /> No experiments yet for this subject — create one under Experiments first.
              </p>
            )}
          </div>
        </div>
      )}
    </InstructorShell>
  );
}
