'use client';

/**
 * Session Creation Wizard — full-page, 4-step flow (design doc §3.3 + D12):
 *
 *   Step 1  Class & Lab        — section-subject picker (cards) + experiment
 *                              picker with marks-allocation context
 *   Step 2  Schedule           — date / time / duration with a live preview
 *   Step 3  Access & Policies  — gate threshold, late join, catch-up,
 *                              proctor defaults inherited from the experiment
 *                              (D12: "Use defaults" / customize per session)
 *   Step 4  Review & Launch    — pre-flight checklist (experiment attached,
 *                              checkpoints defined, students enrolled,
 *                              exec-engine healthy) + create
 *
 * Replaces the cramped single-modal wizard on the Sessions page. The backend
 * contract is POST /instructor/sessions (ownership-validated server-side).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import InstructorShell from '@/components/layout/InstructorShell';
import { sessionService } from '@/services/session.service';
import type { SessionConflict } from '@/services/session.service';
import { experimentService } from '@/services/experiment.service';
import { experienceService } from '@/services/experience.service';
import { apiClient } from '@/services/api-client';
import styles from '../shared.module.css';
import scheduleStyles from './schedule.module.css';

interface SectionSubjectRow {
  section_subject_id: string;
  subject_name: string;
  subject_code?: string;
  section_name: string;
  student_count: number;
  subject_id?: string;
}

interface ExpRow {
  id: string;
  title: string;
  exp_number: number;
  difficulty_level?: string | null;
  is_published?: boolean;
  subject_id?: string;
  weightage?: number;
}

interface CheckpointRow {
  id: string;
  title: string;
  order: number;
}

const STEPS = ['Class & Lab', 'Schedule', 'Access & Policies', 'Review'];

const DIFFICULTY_COLORS: Record<string, string> = {
  Easy: '#059669', Medium: '#d97706', Hard: '#dc2626',
};

function fmtDateTime(date: string, time: string) {
  if (!date || !time) return '—';
  const d = new Date(`${date}T${time}`);
  return d.toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

export default function ScheduleWizardPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // ── data ──────────────────────────────────────────────────────────────────
  const [sectionSubjects, setSectionSubjects] = useState<SectionSubjectRow[]>([]);
  const [experiments, setExperiments] = useState<ExpRow[]>([]);
  const [checkpoints, setCheckpoints] = useState<CheckpointRow[]>([]);
  const [engineOk, setEngineOk] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  // ── form ──────────────────────────────────────────────────────────────────
  const [ssId, setSsId] = useState('');
  const [expId, setExpId] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);   // next full hour, +1h
    d.setMinutes(0, 0, 0);
    return `${String(d.getHours()).padStart(2, '0')}:00`;
  });
  const [duration, setDuration] = useState(120);
  const [gateThreshold, setGateThreshold] = useState(70);
  const [lateJoinMin, setLateJoinMin] = useState(10);
  const [catchupEnabled, setCatchupEnabled] = useState(true);
  const [catchupDays, setCatchupDays] = useState(3);
  const [focusMl, setFocusMl] = useState(true);
  const [lockdown, setLockdown] = useState(true);
  // D12 — proctor inheritance: defaults come from the chosen experiment
  const [useExpProctor, setUseExpProctor] = useState(true);
  const [proctor, setProctor] = useState<Record<string, boolean>>({
    lockdown_fullscreen: true, block_copy_paste: true, block_tab_switch: true,
    plagiarism_scan: true, focus_ml: false, webcam_required: false,
  });

  // Conflict check (mirrors bulk-schedule rules) — runs when the Review step opens
  const [conflicts, setConflicts] = useState<SessionConflict[] | null>(null);
  const [conflictLoading, setConflictLoading] = useState(false);

  const selectedSS = sectionSubjects.find(s => s.section_subject_id === ssId) ?? null;
  const selectedExp = experiments.find(e => e.id === expId) ?? null;

  // ── load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [ss, exps, instructorDefaults] = await Promise.all([
          sessionService.getSectionSubjects(),
          experimentService.listMine(),
          experienceService.getSettings().catch(() => null),
        ]);
        const ssArr = Array.isArray(ss)
          ? ss
          : ((ss as { section_subjects?: SectionSubjectRow[] })?.section_subjects ?? []);
        setSectionSubjects(ssArr);
        setExperiments((exps ?? []) as ExpRow[]);
        if (instructorDefaults) {
          const policy = (instructorDefaults.default_proctor_policy || {}) as Record<string, boolean>;
          setDuration(Number(instructorDefaults.default_session_duration_min) || 90);
          setGateThreshold(Number(instructorDefaults.default_gate_threshold ?? 70));
          setLateJoinMin(Number(instructorDefaults.default_late_join_window_min ?? 10));
          setProctor(current => ({ ...current, ...policy }));
          setFocusMl(Boolean(policy.focus_ml ?? true));
          setLockdown(Boolean(policy.lockdown_fullscreen ?? false));
        }
      } catch {
        setError('Could not load your classes and experiments.');
      } finally {
        setLoading(false);
      }

      // Non-blocking health check for Step 4 pre-flight
      apiClient.get('/execution/engine-health')
        .then(health => {
          const body = health.data as { daemon_ok?: boolean; docker?: { daemon_ok?: boolean } };
          setEngineOk(!!(body.daemon_ok ?? body.docker?.daemon_ok));
        })
        .catch(() => setEngineOk(null));
    })();
  }, []);

  // Checkpoint count for the chosen experiment (pre-flight item)
  useEffect(() => {
    if (!expId) { setCheckpoints([]); return; }
    apiClient.get(`/instructor/experiments/${expId}/checkpoints`)
      .then(res => setCheckpoints(res.data?.checkpoints ?? []))
      .catch(() => setCheckpoints([]));
  }, [expId]);

  // Clash check — mirrors the bulk-schedule rules (section + instructor overlap)
  const runConflictCheck = useCallback(() => {
    if (!ssId || !date || !time) { setConflicts(null); return; }
    const when = new Date(`${date}T${time}`);
    if (isNaN(when.getTime())) { setConflicts(null); return; }
    setConflictLoading(true);
    sessionService.checkConflict({
      section_subject_id: ssId,
      scheduled_at: when.toISOString(),
      duration_minutes: duration,
    })
      .then(res => setConflicts(res.conflicts ?? []))
      .catch(() => setConflicts(null))
      .finally(() => setConflictLoading(false));
  }, [ssId, date, time, duration]);

  useEffect(() => {
    if (step === 3) runConflictCheck();
  }, [step, runConflictCheck]);

  // D12 — when the experiment changes, inherit its proctor defaults
  useEffect(() => {
    if (selectedExp) {
      const p = (selectedExp as unknown as { proctor_defaults?: Record<string, boolean> }).proctor_defaults;
      if (p) {
        setProctor(prev => ({ ...prev, ...p }));
        setFocusMl(Boolean(p.focus_ml ?? focusMl));
        setLockdown(Boolean(p.lockdown_fullscreen ?? lockdown));
      }
    }
  }, [selectedExp]);

  const experimentsForSubject = useMemo(() => {
    if (!selectedSS) return experiments;
    const subjId = (selectedSS as unknown as { subject_id?: string }).subject_id;
    return subjId ? experiments.filter(e => e.subject_id === subjId) : experiments;
  }, [selectedSS, experiments]);

  // ── validation per step ───────────────────────────────────────────────────
  const stepValid = [
    !!(ssId && expId),
    !!(date && time) && (() => {
      const when = new Date(`${date}T${time}`);
      return !isNaN(when.getTime()) && when.getTime() > Date.now() - 60_000;
    })(),
    true,
    true,
  ];

  const canSubmit = stepValid.every(Boolean);

  // ── pre-flight checklist ──────────────────────────────────────────────────
  const preflight = [
    { ok: !!expId, label: 'Experiment attached' },
    { ok: checkpoints.length > 0, label: `Checkpoints defined (${checkpoints.length})` },
    { ok: (selectedSS?.student_count ?? 0) > 0, label: `Students enrolled (${selectedSS?.student_count ?? 0})` },
    { ok: engineOk !== false, label: 'Execution engine healthy'
        + (engineOk === null ? ' (unverified)' : '') },
  ];

  // ── submit ────────────────────────────────────────────────────────────────
  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const when = new Date(`${date}T${time}`);
      const payload: Record<string, unknown> = {
        section_subject_id: ssId,
        experiment_id: expId,
        title: title.trim() || `${selectedExp?.title ?? 'Lab'} — ${selectedSS?.section_name ?? ''}`.trim(),
        scheduled_at: when.toISOString(),
        duration_minutes: duration,
        gate_score_threshold: gateThreshold,
        late_join_window_min: lateJoinMin,
        focus_ml_enabled: focusMl,
        lockdown_enabled: lockdown,
        catchup_enabled: catchupEnabled,
      };
      if (catchupEnabled) {
        const d = new Date(when);
        d.setDate(d.getDate() + catchupDays);
        payload.catchup_deadline = d.toISOString();
      }
      await sessionService.schedule(payload as Parameters<typeof sessionService.schedule>[0]);
      router.push('/instructor/sessions');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scheduling failed.');
      setSaving(false);
    }
  };

  // ── small helpers ─────────────────────────────────────────────────────────
  const Toggle = ({ on, onChange, label, desc, icon }: {
    on: boolean; onChange: (v: boolean) => void; label: string; desc: string; icon: string;
  }) => (
    <div onClick={() => onChange(!on)} style={{
      cursor: 'pointer', padding: '14px 16px', borderRadius: 14,
      border: `1.5px solid ${on ? 'rgba(124,58,237,.4)' : '#e5e7eb'}`,
      background: on ? 'rgba(124,58,237,.05)' : '#fff',
      transition: 'all .15s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#201b2e' }}>{icon} {label}</span>
        <div style={{
          width: 42, height: 24, borderRadius: 12, padding: 2,
          background: on ? '#7c3aed' : '#d1d5db', transition: 'background .15s',
        }}>
          <div style={{
            width: 20, height: 20, borderRadius: 10, background: '#fff',
            marginLeft: on ? 20 : 2, transition: 'margin-left .15s',
          }} />
        </div>
      </div>
      <p style={{ margin: '5px 0 0', fontSize: 12, color: '#9891a6' }}>{desc}</p>
    </div>
  );

  return (
    <InstructorShell activePage="Sessions" title="Schedule a Session"
      subtitle="Four quick steps — class, schedule, policies, review.">
      {error && (
        <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', color: '#b91c1c', fontSize: 13.5, fontWeight: 600, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* ── Step indicator ──────────────────────────────────────────────── */}
      <div className={scheduleStyles.stepIndicatorBar}>
        {STEPS.map((label, i) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <div
              className={scheduleStyles.stepPill}
              style={{
                background: i === step ? 'linear-gradient(135deg,#7c3aed,#9333ea)' : i < step ? 'rgba(124,58,237,.1)' : '#f3f4f6',
                color: i === step ? '#fff' : i < step ? '#7c3aed' : '#9ca3af',
                cursor: i < step ? 'pointer' : 'default',
              }}
              onClick={() => i < step && setStep(i)}
            >
              <span
                className={scheduleStyles.stepBadge}
                style={{
                  background: i === step ? 'rgba(255,255,255,.25)' : i < step ? '#7c3aed' : '#e5e7eb',
                  color: i === step ? '#fff' : i < step ? '#fff' : '#9ca3af',
                }}
              >
                {i < step ? '✓' : i + 1}
              </span>
              {label}
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={scheduleStyles.stepConnector}
                style={{ background: i < step ? '#c4b5fd' : '#e5e7eb' }}
              />
            )}
          </div>
        ))}
      </div>

      {loading ? (
        <p style={{ fontSize: 14, color: '#9891a6' }}>Loading your classes…</p>
      ) : (
        <>
          {/* ═══ STEP 1 — Class & Lab ═══ */}
          {step === 0 && (
            <div style={{ display: 'grid', gap: 22 }}>
              <section>
                <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 800, color: '#201b2e' }}>1 · Pick the class</h3>
                {sectionSubjects.length === 0 ? (
                  <p style={{ fontSize: 13.5, color: '#9891a6' }}>
                    No section-subjects assigned to you yet — ask your institution admin.
                  </p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                    {sectionSubjects.map(ss => {
                      const on = ss.section_subject_id === ssId;
                      return (
                        <div key={ss.section_subject_id}
                          onClick={() => { setSsId(ss.section_subject_id); setExpId(''); }}
                          style={{
                            cursor: 'pointer', padding: '16px 18px', borderRadius: 16,
                            border: `1.5px solid ${on ? 'rgba(124,58,237,.5)' : '#e5e7eb'}`,
                            background: on ? 'linear-gradient(135deg, rgba(124,58,237,.07), rgba(147,51,234,.04))' : '#fff',
                            boxShadow: on ? '0 4px 16px rgba(124,58,237,.12)' : 'none',
                          }}>
                          <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: '#201b2e' }}>
                            {ss.subject_name}
                          </p>
                          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: '#726a85' }}>
                            {ss.subject_code} · Section {ss.section_name}
                          </p>
                          <span style={{
                            display: 'inline-block', marginTop: 8, fontSize: 11.5, fontWeight: 700,
                            color: '#7c3aed', background: 'rgba(124,58,237,.09)',
                            padding: '3px 10px', borderRadius: 999,
                          }}>
                            👥 {ss.student_count} students
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {ssId && (
                <section>
                  <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 800, color: '#201b2e' }}>2 · Pick the experiment</h3>
                  {experimentsForSubject.length === 0 ? (
                    <p style={{ fontSize: 13.5, color: '#b45309', display: 'flex', alignItems: 'center', gap: 6 }}>
                      ⚠️ No experiments for this subject yet — create one under Experiments first.
                    </p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                      {experimentsForSubject.map(e => {
                        const on = e.id === expId;
                        return (
                          <div key={e.id} onClick={() => setExpId(e.id)}
                            style={{
                              cursor: 'pointer', padding: '15px 17px', borderRadius: 16,
                              border: `1.5px solid ${on ? 'rgba(124,58,237,.5)' : '#e5e7eb'}`,
                              background: on ? 'linear-gradient(135deg, rgba(124,58,237,.07), rgba(147,51,234,.04))' : '#fff',
                            }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#9891a6' }}>Exp #{e.exp_number}</span>
                              {e.difficulty_level && (
                                <span style={{
                                  fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase',
                                  color: DIFFICULTY_COLORS[e.difficulty_level] ?? '#726a85',
                                }}>{e.difficulty_level}</span>
                              )}
                            </div>
                            <p style={{ margin: '5px 0 0', fontSize: 14, fontWeight: 700, color: '#201b2e' }}>{e.title}</p>
                            {!e.is_published && (
                              <span style={{ fontSize: 11, color: '#b45309', fontWeight: 700 }}>draft — not visible to students</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}

          {/* ═══ STEP 2 — Schedule ═══ */}
          {step === 1 && (
            <div className={scheduleStyles.twoColLayout}>
              <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #e5e7eb', padding: 22 }}>
                <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 800, color: '#201b2e' }}>When does it run?</h3>
                <div className={scheduleStyles.dateTimeGrid}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Date</label>
                    <input type="date" value={date} min={new Date().toISOString().slice(0, 10)}
                      onChange={e => setDate(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Start time</label>
                    <input type="time" value={time} onChange={e => setTime(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Duration</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[60, 90, 120, 150, 180].map(d => (
                      <button key={d} onClick={() => setDuration(d)}
                        style={{
                          padding: '9px 16px', borderRadius: 12, fontSize: 13.5, fontWeight: 700,
                          border: `1.5px solid ${duration === d ? 'rgba(124,58,237,.5)' : '#e5e7eb'}`,
                          background: duration === d ? 'rgba(124,58,237,.08)' : '#fff',
                          color: duration === d ? '#7c3aed' : '#374151', cursor: 'pointer',
                        }}>
                        {d < 60 ? `${d}m` : `${d / 60}h`}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                    Session title (optional)
                  </label>
                  <input value={title} onChange={e => setTitle(e.target.value)}
                    placeholder="Auto: experiment name + section"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
              </div>

              {/* Live preview */}
              <div className={scheduleStyles.previewCard}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: 3, color: '#a78bfa' }}>SESSION PREVIEW</p>
                <p style={{ margin: '10px 0 2px', fontSize: 20, fontWeight: 800, color: '#fff' }}>
                  {selectedExp?.title ?? '—'}
                </p>
                <p style={{ margin: 0, fontSize: 13, color: '#c4b5fd' }}>
                  {selectedSS?.subject_name} · Section {selectedSS?.section_name}
                </p>
                <div style={{ height: 1, background: 'rgba(255,255,255,.12)', margin: '16px 0' }} />
                <div className={scheduleStyles.previewGrid}>
                  <div>
                    <p style={{ margin: 0, fontSize: 11, color: '#8b7fa8', fontWeight: 700, textTransform: 'uppercase' }}>Starts</p>
                    <p style={{ margin: '3px 0 0', fontWeight: 700, color: '#fff' }}>{fmtDateTime(date, time)}</p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 11, color: '#8b7fa8', fontWeight: 700, textTransform: 'uppercase' }}>Duration</p>
                    <p style={{ margin: '3px 0 0', fontWeight: 700, color: '#fff' }}>{duration} minutes</p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 11, color: '#8b7fa8', fontWeight: 700, textTransform: 'uppercase' }}>Students</p>
                    <p style={{ margin: '3px 0 0', fontWeight: 700, color: '#fff' }}>{selectedSS?.student_count ?? '—'}</p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 11, color: '#8b7fa8', fontWeight: 700, textTransform: 'uppercase' }}>Late join</p>
                    <p style={{ margin: '3px 0 0', fontWeight: 700, color: '#fff' }}>{lateJoinMin} min window</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ STEP 3 — Access & Policies ═══ */}
          {step === 2 && (
            <div style={{ display: 'grid', gap: 22 }}>
              <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #e5e7eb', padding: 22 }}>
                <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 800, color: '#201b2e' }}>Entry rules</h3>
                <div className={scheduleStyles.threeColGrid}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                      Quiz gate threshold
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input type="range" min={0} max={100} step={5} value={gateThreshold}
                        onChange={e => setGateThreshold(parseInt(e.target.value))}
                        style={{ flex: 1, accentColor: '#7c3aed' }} />
                      <span style={{ fontSize: 15, fontWeight: 800, color: '#7c3aed', width: 46, textAlign: 'right' }}>{gateThreshold}%</span>
                    </div>
                    <p style={{ margin: '5px 0 0', fontSize: 11.5, color: '#9891a6' }}>Informational only — reported on check-gate, never blocks joining.</p>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                      Late join window
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input type="range" min={0} max={60} step={5} value={lateJoinMin}
                        onChange={e => setLateJoinMin(parseInt(e.target.value))}
                        style={{ flex: 1, accentColor: '#7c3aed' }} />
                      <span style={{ fontSize: 15, fontWeight: 800, color: '#7c3aed', width: 46, textAlign: 'right' }}>{lateJoinMin}m</span>
                    </div>
                    <p style={{ margin: '5px 0 0', fontSize: 11.5, color: '#9891a6' }}>Students may join this many minutes after start.</p>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                      Catch-up window
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input type="checkbox" checked={catchupEnabled}
                        onChange={e => setCatchupEnabled(e.target.checked)} style={{ accentColor: '#7c3aed' }} />
                      <input type="number" min={1} max={14} value={catchupDays} disabled={!catchupEnabled}
                        onChange={e => setCatchupDays(parseInt(e.target.value) || 3)}
                        style={{ width: 64, padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13.5 }} />
                      <span style={{ fontSize: 12.5, color: '#6b7280' }}>days after</span>
                    </div>
                    <p style={{ margin: '5px 0 0', fontSize: 11.5, color: '#9891a6' }}>Missed students can replay the lab until then.</p>
                  </div>
                </div>
              </div>

              <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #e5e7eb', padding: 22 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#201b2e' }}>Proctoring & monitoring</h3>
                  {selectedExp && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: '#7c3aed', cursor: 'pointer' }}>
                      <input type="checkbox" checked={useExpProctor}
                        onChange={e => {
                          setUseExpProctor(e.target.checked);
                          if (e.target.checked) {
                            const p = (selectedExp as unknown as { proctor_defaults?: Record<string, boolean> }).proctor_defaults;
                            if (p) setProctor(prev => ({ ...prev, ...p }));
                          }
                        }} />
                      Use experiment defaults (D12)
                    </label>
                  )}
                </div>
                <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#9891a6' }}>
                  {useExpProctor
                    ? 'Inherited from the experiment — untick to customize for this session only.'
                    : 'Custom for this session only; the experiment defaults stay untouched.'}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                  <Toggle on={!useExpProctor ? proctor.lockdown_fullscreen : !!proctor.lockdown_fullscreen}
                    onChange={v => { setUseExpProctor(false); setLockdown(v); setProctor(p => ({ ...p, lockdown_fullscreen: v })); }}
                    label="Lockdown fullscreen" desc="Students must stay in fullscreen" icon="🔒" />
                  <Toggle on={proctor.block_copy_paste}
                    onChange={v => { setUseExpProctor(false); setProctor(p => ({ ...p, block_copy_paste: v })); }}
                    label="Block copy/paste" desc="Clipboard events are blocked + logged" icon="📋" />
                  <Toggle on={proctor.block_tab_switch}
                    onChange={v => { setUseExpProctor(false); setProctor(p => ({ ...p, block_tab_switch: v })); }}
                    label="Block tab switch" desc="Tab switches raise proctor alerts" icon="🗂" />
                  <Toggle on={proctor.plagiarism_scan}
                    onChange={v => { setUseExpProctor(false); setProctor(p => ({ ...p, plagiarism_scan: v })); }}
                    label="Plagiarism scan" desc="Post-session pairwise similarity scan" icon="🔍" />
                  <Toggle on={focusMl}
                    onChange={v => { setFocusMl(v); setProctor(p => ({ ...p, focus_ml: v })); }}
                    label="Focus ML monitoring" desc="Attention scoring via behavioral signals" icon="🧠" />
                  <Toggle on={proctor.webcam_required}
                    onChange={v => { setUseExpProctor(false); setProctor(p => ({ ...p, webcam_required: v })); }}
                    label="Webcam required" desc="Students must grant camera access" icon="📷" />
                </div>
              </div>
            </div>
          )}

          {/* ═══ STEP 4 — Review & Launch ═══ */}
          {step === 3 && (
            <div className={scheduleStyles.twoColLayout}>
              <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #e5e7eb', padding: 24 }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 800, color: '#201b2e' }}>Review everything</h3>
                {[
                  ['Class', `${selectedSS?.subject_name} — Section ${selectedSS?.section_name}`],
                  ['Experiment', `${selectedExp?.title ?? '—'}${selectedExp?.is_published ? '' : ' (draft)'}`],
                  ['Starts', fmtDateTime(date, time)],
                  ['Duration', `${duration} minutes`],
                  ['Quiz gate', `${gateThreshold}% (informational)`],
                  ['Late join', `${lateJoinMin} min window`],
                  ['Catch-up', catchupEnabled ? `Enabled · ${catchupDays} days` : 'Disabled'],
                  ['Proctoring', useExpProctor
                    ? 'Experiment defaults'
                    : [
                        proctor.lockdown_fullscreen && 'fullscreen lock',
                        proctor.block_copy_paste && 'no copy/paste',
                        proctor.block_tab_switch && 'no tab switch',
                        proctor.plagiarism_scan && 'plagiarism scan',
                        proctor.webcam_required && 'webcam',
                      ].filter(Boolean).join(', ') || 'custom'],
                  ['Focus ML', focusMl ? 'On' : 'Off'],
                ].map(([k, v]) => (
                  <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '9px 0', borderBottom: '1px solid #f3f4f6' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#9891a6' }}>{k}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: '#201b2e', textAlign: 'right' }}>{v}</span>
                  </div>
                ))}
              </div>

              <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #e5e7eb', padding: 24 }}>
                <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 800, color: '#201b2e' }}>Pre-flight checklist</h3>
                {preflight.map(p => (
                  <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: 11, display: 'flex',
                      alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800,
                      background: p.ok ? 'rgba(5,150,105,.12)' : 'rgba(217,119,6,.12)',
                      color: p.ok ? '#059669' : '#b45309',
                    }}>{p.ok ? '✓' : '!'}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: p.ok ? '#201b2e' : '#b45309' }}>{p.label}</span>
                  </div>
                ))}

                {/* Clash check — same rules as the bulk planner */}
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #f3f4f6' }}>
                  <p style={{ margin: '0 0 8px', fontSize: 12.5, fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    Schedule clashes
                  </p>
                  {conflictLoading ? (
                    <p style={{ margin: 0, fontSize: 13, color: '#9891a6' }}>Checking the timetable…</p>
                  ) : conflicts && conflicts.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {conflicts.map(c => (
                        <div key={c.session_id} style={{
                          padding: '9px 12px', borderRadius: 10,
                          background: 'rgba(239,68,68,.07)', border: '1px solid rgba(239,68,68,.3)',
                        }}>
                          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#b91c1c' }}>
                            ⚠ {c.reason}: {c.title}
                          </p>
                          <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#726a85' }}>
                            {c.scheduled_at ? new Date(c.scheduled_at).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''} · {c.duration} min
                          </p>
                        </div>
                      ))}
                      <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#b45309', fontWeight: 600 }}>
                        You can still schedule it, but students/you would be double-booked.
                      </p>
                    </div>
                  ) : conflicts ? (
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#059669' }}>
                      ✓ No clashes — this slot is free.
                    </p>
                  ) : (
                    <p style={{ margin: 0, fontSize: 13, color: '#9891a6' }}>—</p>
                  )}
                </div>

                <button
                  onClick={submit}
                  disabled={saving || !canSubmit}
                  style={{
                    width: '100%', marginTop: 18, padding: '13px 0', borderRadius: 12, border: 'none',
                    fontSize: 15, fontWeight: 800, color: '#fff', cursor: 'pointer',
                    background: 'linear-gradient(135deg,#7c3aed,#9333ea)',
                    opacity: saving || !canSubmit ? .6 : 1,
                    minHeight: 48,
                  }}>
                  {saving ? 'Scheduling…' : conflicts && conflicts.length > 0 ? 'Schedule Anyway' : 'Schedule Session'}
                </button>
                <p style={{ margin: '10px 0 0', fontSize: 11.5, color: '#9891a6', textAlign: 'center' }}>
                  A LiveKit video room is created automatically when the session starts.
                </p>
              </div>
            </div>
          )}

          {/* ── Step navigation ─────────────────────────────────────────────── */}
          <div className={scheduleStyles.navBar}>
            <button
              onClick={() => (step === 0 ? router.push('/instructor/sessions') : setStep(step - 1))}
              className={scheduleStyles.navBtnSecondary}>
              {step === 0 ? 'Cancel' : '← Back'}
            </button>
            {step < 3 && (
              <button
                onClick={() => stepValid[step] && setStep(step + 1)}
                disabled={!stepValid[step]}
                className={scheduleStyles.navBtnPrimary}
                style={{
                  opacity: stepValid[step] ? 1 : .5,
                }}>
                Continue →
              </button>
            )}
          </div>
        </>
      )}
    </InstructorShell>
  );
}
