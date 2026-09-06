'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardList, Flame, Megaphone, CalendarClock, Loader2, Plus,
  CheckCircle2, AlertTriangle, X, TrendingUp, Trash2, Send, StickyNote,
  Sparkles,
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import {
  experienceService,
  type InterventionRow, type MasteryHeatmap, type ExtensionRow,
} from '@/services/experience.service';
import styles from '../shared.module.css';

type Tab = 'interventions' | 'heatmap' | 'announcements' | 'extensions' | 'insights' | 'notes';

const ACTION_LABELS: Record<string, string> = {
  talked_to_student: 'Talked to student',
  extended_deadline: 'Extended deadline',
  re_graded: 'Re-graded',
  contacted_guardian: 'Contacted guardian',
  tutoring: 'Arranged tutoring',
  resources_shared: 'Shared resources',
  other: 'Other',
};

const OUTCOME_COLORS: Record<string, string> = {
  open: '#d97706', improved: '#059669', no_change: '#9891a6', worsened: '#dc2626',
};

const fmtDT = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

function cellColor(v: number | null, threshold: number) {
  if (v == null) return { background: '#f3f0fa', color: '#c9c2d8' };
  if (v < threshold * 0.5) return { background: '#dc2626', color: '#fff' };
  if (v < threshold) return { background: '#f59e0b', color: '#fff' };
  if (v < 70) return { background: '#fde68a', color: '#78350f' };
  return { background: '#16a34a', color: '#fff' };
}

export default function ManagementPage() {
  const [tab, setTab] = useState<Tab>('interventions');
  const [toast, setToast] = useState<string | null>(null);
  const toast3 = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3200); };

  return (
    <InstructorShell activePage="Management" title="Student Management"
      subtitle="Interventions, mastery heat-map, announcements, deadline relief, insights and notes.">
      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 300, background: '#111827', color: '#fff', padding: '12px 20px', borderRadius: 12, fontSize: 14, fontWeight: 600 }}>{toast}</div>}

      <div className={styles.tabRow} style={{ marginBottom: 18, flexWrap: 'wrap' }}>
        {([
          { id: 'interventions' as Tab, label: 'Interventions', Icon: ClipboardList },
          { id: 'heatmap' as Tab, label: 'Mastery Heat-map', Icon: Flame },
          { id: 'insights' as Tab, label: 'Insights', Icon: TrendingUp },
          { id: 'announcements' as Tab, label: 'Announce', Icon: Megaphone },
          { id: 'extensions' as Tab, label: 'Extensions', Icon: CalendarClock },
          { id: 'notes' as Tab, label: 'Private Notes', Icon: StickyNote },
        ]).map(t => (
          <button key={t.id} className={`${styles.tabChip} ${tab === t.id ? styles.tabChipActive : ''}`}
            onClick={() => setTab(t.id)}>
            <t.Icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'interventions' && <InterventionsTab toast3={toast3} />}
      {tab === 'heatmap' && <HeatmapTab />}
      {tab === 'insights' && <InsightsTab toast3={toast3} />}
      {tab === 'announcements' && <AnnouncementsTab toast3={toast3} />}
      {tab === 'extensions' && <ExtensionsTab toast3={toast3} />}
      {tab === 'notes' && <NotesTab toast3={toast3} />}
    </InstructorShell>
  );
}

// ═══════════════════════ F1 — Interventions ═══════════════════════

function InterventionsTab({ toast3 }: { toast3: (m: string) => void }) {
  const [rows, setRows] = useState<InterventionRow[]>([]);
  const [students, setStudents] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<'open' | 'resolved' | 'all'>('open');
  const [loading, setLoading] = useState(true);

  // create form
  const [showForm, setShowForm] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [actionType, setActionType] = useState('talked_to_student');
  const [note, setNote] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [saving, setSaving] = useState(false);

  // outcome form
  const [outcomeFor, setOutcomeFor] = useState<InterventionRow | null>(null);
  const [outcome, setOutcome] = useState('improved');
  const [outcomeNote, setOutcomeNote] = useState('');

  const studentName = useCallback((id: string) => {
    const r = rows.find(x => x.student_id === id);
    return r?.student_name ?? 'Student';
  }, [rows]);

  const load = useCallback(async (f: 'open' | 'resolved' | 'all') => {
    setLoading(true);
    try {
      const res = await experienceService.listInterventions(f === 'all' ? undefined : f);
      setRows(res.interventions);
      if (res.my_students?.length) setStudents(res.my_students);
    } catch { toast3('Could not load interventions.'); }
    finally { setLoading(false); }
  }, [toast3]);

  useEffect(() => { load(statusFilter); }, [statusFilter, load]);

  // Student names come from rows; for the create dropdown use the names list
  // from the API (my_students) mapped against any row, else raw names.
  const create = async () => {
    if (!studentId) { toast3('Pick a student.'); return; }
    setSaving(true);
    try {
      await experienceService.createIntervention({
        student_id: studentId,
        action_type: actionType,
        note: note || undefined,
        follow_up_at: followUp ? new Date(followUp).toISOString() : undefined,
      });
      toast3('Intervention recorded.');
      setShowForm(false); setNote(''); setFollowUp('');
      load(statusFilter);
    } catch (e: unknown) {
      toast3((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to record.');
    } finally { setSaving(false); }
  };

  const saveOutcome = async () => {
    if (!outcomeFor) return;
    try {
      await experienceService.setInterventionOutcome(outcomeFor.id, outcome, outcomeNote || undefined);
      toast3('Outcome saved.');
      setOutcomeFor(null); setOutcomeNote('');
      load(statusFilter);
    } catch { toast3('Failed to save outcome.'); }
  };

  // Build student id options from any known rows; if empty, show names list
  const studentOptions = useMemo(() => {
    const seen = new Map<string, string>();
    rows.forEach(r => seen.set(r.student_id, r.student_name ?? 'Student'));
    return Array.from(seen.entries());
  }, [rows]);

  return (
    <>
      <div className={styles.actionRow}>
        <div className={styles.tabRow}>
          {(['open', 'resolved', 'all'] as const).map(f => (
            <button key={f} className={`${styles.tabChip} ${statusFilter === f ? styles.tabChipActive : ''}`}
              onClick={() => setStatusFilter(f)}>
              {f === 'open' ? 'Open' : f === 'resolved' ? 'Resolved' : 'All'}
            </button>
          ))}
        </div>
        <button className={styles.primaryBtn} onClick={() => setShowForm(s => !s)}>
          <Plus size={14} /> Record Intervention
        </button>
      </div>

      {showForm && (
        <div className={styles.sectionCard} style={{ marginBottom: 16 }}>
          <p className={styles.sectionTitle} style={{ marginBottom: 12 }}>New intervention</p>
          {studentOptions.length === 0 ? (
            <p style={{ fontSize: 13, color: '#b45309' }}>
              Students appear here once they show up in your attention/at-risk list — record your first intervention from a flagged student.
            </p>
          ) : (
            <>
              <div className={styles.gridTwo}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Student</label>
                  <select className={styles.select} value={studentId} onChange={e => setStudentId(e.target.value)}>
                    <option value="">Select student…</option>
                    {studentOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Action</label>
                  <select className={styles.select} value={actionType} onChange={e => setActionType(e.target.value)}>
                    {Object.entries(ACTION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Notes</label>
                <textarea className={styles.textarea} value={note} onChange={e => setNote(e.target.value)}
                  placeholder="What was discussed / done…" />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Follow-up date (optional)</label>
                <input className={styles.input} type="datetime-local" value={followUp}
                  onChange={e => setFollowUp(e.target.value)} />
              </div>
              <button className={styles.primaryBtn} onClick={create} disabled={saving}>
                {saving ? 'Saving…' : 'Record'}
              </button>
            </>
          )}
        </div>
      )}

      <div className={styles.sectionCard}>
        {loading ? (
          <Loader2 size={18} className="animate-spin" style={{ margin: '20px auto', display: 'block' }} />
        ) : rows.length === 0 ? (
          <p className={styles.sectionSub}>No {statusFilter !== 'all' ? statusFilter : ''} interventions.</p>
        ) : (
          <div className={styles.list}>
            {rows.map(r => (
              <div key={r.id} className={styles.listRow}>
                <div className={styles.rowBody}>
                  <p className={styles.rowTitle}>
                    {r.student_name} — {ACTION_LABELS[r.action_type] ?? r.action_type}
                  </p>
                  {r.note && <p className={styles.rowMeta}>{r.note}</p>}
                  <p className={styles.rowSub}>
                    {fmtDT(r.created_at)}
                    {r.follow_up_at && <> · follow-up {fmtDT(r.follow_up_at)}</>}
                  </p>
                </div>
                <div className={styles.rowSide} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className={styles.pill} style={{
                    color: OUTCOME_COLORS[r.outcome], borderColor: OUTCOME_COLORS[r.outcome],
                    border: `1.5px solid ${OUTCOME_COLORS[r.outcome]}55`,
                  }}>{r.outcome}</span>
                  {r.outcome === 'open' && (
                    <button className={styles.ghostBtn}
                      onClick={() => { setOutcomeFor(r); setOutcome('improved'); setOutcomeNote(''); }}>
                      <CheckCircle2 size={13} /> Close loop
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {outcomeFor && (
        <div className={styles.modalOverlay} onClick={() => setOutcomeFor(null)}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Outcome — {outcomeFor.student_name}</h2>
              <button className={styles.closeBtn} onClick={() => setOutcomeFor(null)}><X size={16} /></button>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Did the student improve?</label>
              <select className={styles.select} value={outcome} onChange={e => setOutcome(e.target.value)}>
                <option value="improved">Improved</option>
                <option value="no_change">No change</option>
                <option value="worsened">Worsened</option>
                <option value="open">Keep open</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Notes</label>
              <textarea className={styles.textarea} value={outcomeNote} onChange={e => setOutcomeNote(e.target.value)} />
            </div>
            <button className={styles.primaryBtn} onClick={saveOutcome}><TrendingUp size={13} /> Save outcome</button>
          </div>
        </div>
      )}
    </>
  );
}

// ═══════════════════════ T2-6/T2-8/T3-16 — Insights ═══════════════════════

function InsightsTab({ toast3 }: { toast3: (m: string) => void }) {
  const [sectionSubjects, setSectionSubjects] = useState<Array<{ section_subject_id: string; subject_name: string; section_name: string }>>([]);
  const [ssId, setSsId] = useState('');
  const [warnings, setWarnings] = useState<Array<import('@/services/experience.service').EarlyWarningRow>>([]);
  const [experiments, setExperiments] = useState<Array<{ id: string; title: string }>>([]);
  const [expId, setExpId] = useState('');
  const [hint, setHint] = useState<import('@/services/experience.service').HintEffectiveness | null>(null);
  const [errors, setErrors] = useState<import('@/services/experience.service').ErrorAnalysis | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    experienceService.announcementRecipients()
      .then(r => { setSectionSubjects(r.recipients); if (r.recipients[0]) setSsId(r.recipients[0].section_subject_id); })
      .catch(() => {});
    import('@/services/experiment.service').then(({ experimentService }) =>
      experimentService.listMine().then(e => { setExperiments(e as any); if ((e as any[])[0]) setExpId((e as any[])[0].id); })
        .catch(() => {}));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, h, er] = await Promise.all([
        ssId ? experienceService.earlyWarning(ssId) : Promise.resolve({ students: [] }),
        expId ? experienceService.hintEffectiveness(expId) : Promise.resolve(null),
        expId ? experienceService.errorAnalysis(expId) : Promise.resolve(null),
      ]);
      setWarnings(w.students);
      setHint(h);
      setErrors(er);
    } catch { /* keep old data */ }
    finally { setLoading(false); }
  }, [ssId, expId]);

  useEffect(() => { if (ssId || expId) load(); }, [ssId, expId, load]);

  return (
    <>
      <div className={styles.actionRow}>
        <select className={styles.select} style={{ maxWidth: 260 }} value={ssId} onChange={e => setSsId(e.target.value)}>
          <option value="">Select section…</option>
          {sectionSubjects.map(s => <option key={s.section_subject_id} value={s.section_subject_id}>{s.subject_name} — {s.section_name}</option>)}
        </select>
        <select className={styles.select} style={{ maxWidth: 260 }} value={expId} onChange={e => setExpId(e.target.value)}>
          <option value="">Select experiment…</option>
          {experiments.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
        <button className={styles.ghostBtn} onClick={load} disabled={loading}>
          {loading ? <Loader2 size={13} className="animate-spin" /> : <TrendingUp size={13} />} Refresh
        </button>
      </div>

      {/* Early warning */}
      <div className={styles.sectionCard} style={{ marginBottom: 16 }}>
        <p className={styles.sectionTitle} style={{ marginBottom: 10 }}>Early warning — trend-based, before thresholds trigger</p>
        {warnings.length === 0 ? (
          <p className={styles.sectionSub}>No students currently trending at risk for this section.</p>
        ) : (
          <div className={styles.list}>
            {warnings.slice(0, 10).map(w => (
              <div key={w.student_id} className={styles.listRow}>
                <div className={styles.rowBody}>
                  <p className={styles.rowTitle}>{w.full_name} <span style={{ fontSize: 12, color: '#9891a6' }}>({w.roll_number ?? '—'})</span></p>
                  <p className={styles.rowMeta}>{w.reasons.join(' · ')}</p>
                </div>
                <span className={`${styles.pill} ${w.level === 'high' ? styles.pillGreen === styles.pillGreen ? styles.redBadge ?? '' : '' : styles.amberBadge}`}
                  style={{
                    color: w.level === 'high' ? '#dc2626' : '#d97706',
                    border: `1.5px solid ${w.level === 'high' ? '#dc262655' : '#d9770655'}`,
                  }}>
                  {w.level.toUpperCase()} · {w.risk_score}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hint effectiveness */}
      {hint && (
        <div className={styles.sectionCard} style={{ marginBottom: 16 }}>
          <p className={styles.sectionTitle} style={{ marginBottom: 10 }}>Hint effectiveness — “{hint.title}”</p>
          <div className={styles.kpiRow}>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Hint users</p>
              <p className={styles.kpiValue}>{hint.hint_users}</p>
              <p className={styles.kpiSub}>Pass rate {hint.pass_rate_hint_users ?? '—'}%</p>
            </div>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>No-hint students</p>
              <p className={styles.kpiValue}>{hint.non_hint_users}</p>
              <p className={styles.kpiSub}>Pass rate {hint.pass_rate_non_users ?? '—'}%</p>
            </div>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Avg hints (passed)</p>
              <p className={styles.kpiValue}>{hint.avg_hints_passed}</p>
              <p className={styles.kpiSub}>vs {hint.avg_hints_failed} for failed</p>
            </div>
          </div>
          {hint.top_users.length > 0 && (
            <p className={styles.sectionSub}>Top hint users: {hint.top_users.slice(0, 5).map(u => `${u.name} (${u.hints})`).join(', ')}</p>
          )}
        </div>
      )}

      {/* Error analysis */}
      {errors && (
        <div className={styles.sectionCard}>
          <p className={styles.sectionTitle} style={{ marginBottom: 10 }}>Common errors — “{errors.title}”</p>
          <p className={styles.sectionSub} style={{ marginBottom: 10 }}>
            {errors.error_attempts}/{errors.total_attempts} attempts hit errors ({errors.error_rate_pct}%)
          </p>
          {errors.errors.length === 0 ? (
            <p className={styles.sectionSub}>No compile/runtime errors recorded.</p>
          ) : (
            <div className={styles.list}>
              {errors.errors.slice(0, 8).map(e => (
                <div key={e.label} className={styles.listRow}>
                  <div className={styles.rowBody}>
                    <p className={styles.rowTitle}>{e.label} <span style={{ fontSize: 12, color: '#9891a6' }}>×{e.count}</span></p>
                    <p className={styles.rowMeta} style={{ fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap' }}>{e.sample}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ═══════════════════════ T3-14 — Private notes ═══════════════════════

function NotesTab({ toast3 }: { toast3: (m: string) => void }) {
  const [studentId, setStudentId] = useState('');
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<import('@/services/experience.service').TeacherNoteRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (id: string) => {
    if (!id) { setRows([]); return; }
    setLoading(true);
    try { setRows((await experienceService.listNotes(id)).notes); }
    catch { setRows([]); }
    finally { setLoading(false); }
  }, []);

  const add = async () => {
    if (!studentId || !note.trim()) { toast3('Enter a student ID and a note.'); return; }
    try {
      await experienceService.addNote(studentId.trim(), note.trim());
      setNote('');
      toast3('Note saved.');
      load(studentId.trim());
    } catch (e: unknown) {
      toast3((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Save failed.');
    }
  };

  const remove = async (id: string) => {
    try { await experienceService.deleteNote(id); setRows(rows.filter(r => r.id !== id)); }
    catch { toast3('Delete failed.'); }
  };

  return (
    <div className={styles.sectionCard}>
      <p className={styles.sectionTitle} style={{ marginBottom: 4 }}>Private notes</p>
      <p className={styles.sectionSub} style={{ marginBottom: 12 }}>
        Only you can see these — visible to no other teacher, admin or student.
      </p>
      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Student ID</label>
        <input className={styles.input} value={studentId} onChange={e => setStudentId(e.target.value)}
          placeholder="Student ID (from Students page)" />
      </div>
      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Note</label>
        <textarea className={styles.textarea} rows={3} value={note} onChange={e => setNote(e.target.value)}
          placeholder="Observations, promises, context…" />
      </div>
      <button className={styles.primaryBtn} onClick={add} style={{ marginBottom: 14 }}>
        <Plus size={13} /> Add Note
      </button>

      {loading ? (
        <Loader2 size={18} className="animate-spin" style={{ margin: '12px auto', display: 'block' }} />
      ) : rows.length === 0 ? (
        <p className={styles.sectionSub}>No notes for this student yet.</p>
      ) : (
        <div className={styles.list}>
          {rows.map(r => (
            <div key={r.id} className={styles.listRow}>
              <div className={styles.rowBody}>
                <p className={styles.rowTitle}>{r.note}</p>
                <p className={styles.rowMeta}>{fmtDT(r.created_at)}</p>
              </div>
              <div className={styles.rowSide}>
                <button className={styles.ghostBtn} onClick={() => remove(r.id)}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HeatmapTab() {
  const [data, setData] = useState<MasteryHeatmap | null>(null);
  const [threshold, setThreshold] = useState(40);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    experienceService.masteryHeatmap(threshold)
      .then(d => { if (mounted) setData(d); })
      .catch(() => { if (mounted) setData(null); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [threshold]);

  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>Class mastery — students × concepts</h2>
          <p className={styles.sectionSub}>
            Concepts ordered weakest-first. Red = below threshold, amber = close, green = solid.
          </p>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#374151' }}>
          Threshold
          <input type="number" min={0} max={100} value={threshold}
            onChange={e => setThreshold(Math.max(0, Math.min(100, Number(e.target.value) || 40)))}
            style={{ width: 64, padding: '6px 8px', borderRadius: 8, border: '1px solid #ddd6ee' }} />
        </label>
      </div>

      {loading ? (
        <Loader2 size={18} className="animate-spin" style={{ margin: '20px auto', display: 'block' }} />
      ) : !data || data.students.length === 0 || data.concepts.length === 0 ? (
        <p className={styles.sectionSub}>No mastery data yet — it builds up as students complete experiments.</p>
      ) : (
        <>
          {/* Teach-next strip */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {data.concept_avgs.slice(0, 5).map(c => (
              <span key={c.concept} style={{
                fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 999,
                background: c.avg < data.threshold ? 'rgba(220,38,38,.1)' : 'rgba(245,158,11,.1)',
                color: c.avg < data.threshold ? '#b91c1c' : '#92400e',
              }}>
                {c.concept} · avg {c.avg}
              </span>
            ))}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 3, minWidth: 600 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '4px 8px', fontSize: 11.5, color: '#726a85' }}>Student</th>
                  {data.concepts.map(c => (
                    <th key={c} title={c} style={{ padding: '4px 6px', fontSize: 10.5, color: '#726a85', fontWeight: 700, maxWidth: 90 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.students.map((s, i) => {
                  const rowVals = data.values.find(v => v.student_id === s.student_id)?.values ?? [];
                  return (
                    <tr key={s.student_id}>
                      <td style={{ padding: '2px 8px', fontSize: 12.5, fontWeight: 600, color: '#201b2e', whiteSpace: 'nowrap' }}>
                        {s.full_name}
                      </td>
                      {rowVals.map((v, j) => {
                        const st = cellColor(v, data.threshold);
                        return (
                          <td key={j} title={v == null ? 'no data' : `${data.concepts[j]}: ${v}`}
                            style={{ ...st, borderRadius: 6, textAlign: 'center', fontSize: 10.5, fontWeight: 700, padding: '5px 7px', minWidth: 42 }}>
                            {v ?? '–'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 12, color: '#9891a6' }}>
            {data.weak_flags.length} weak cell(s) below {data.threshold} — hover any cell for details.
          </p>
        </>
      )}
    </div>
  );
}

// ═══════════════════════ F3 — Announcements ═══════════════════════

function AnnouncementsTab({ toast3 }: { toast3: (m: string) => void }) {
  const [recipients, setRecipients] = useState<Array<{ section_subject_id: string; subject_name: string; section_name: string; student_count: number }>>([]);
  const [target, setTarget] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    experienceService.announcementRecipients()
      .then(r => setRecipients(r.recipients))
      .catch(() => {});
  }, []);

  const send = async () => {
    if (!target || !title.trim() || !message.trim()) { toast3('Fill class, title and message.'); return; }
    setSending(true);
    try {
      const res = await experienceService.instructorAnnounce({ section_subject_id: target, title, message });
      toast3(`Announcement sent to ${res.sent_to} students.`);
      setTitle(''); setMessage('');
    } catch (e: unknown) {
      toast3((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Send failed.');
    } finally { setSending(false); }
  };

  return (
    <div className={styles.sectionCard}>
      <p className={styles.sectionTitle} style={{ marginBottom: 4 }}>Announce to one of your sections</p>
      <p className={styles.sectionSub} style={{ marginBottom: 14 }}>
        Reaches only students enrolled in the selected class — narrower than admin announcements by design.
      </p>
      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Class</label>
        <select className={styles.select} value={target} onChange={e => setTarget(e.target.value)}>
          <option value="">Select class…</option>
          {recipients.map(r => (
            <option key={r.section_subject_id} value={r.section_subject_id}>
              {r.subject_name} — Section {r.section_name} · {r.student_count} students
            </option>
          ))}
        </select>
      </div>
      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Title</label>
        <input className={styles.input} value={title} onChange={e => setTitle(e.target.value)}
          placeholder="Lab moved to Thursday" maxLength={200} />
      </div>
      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Message</label>
        <textarea className={styles.textarea} rows={4} value={message} onChange={e => setMessage(e.target.value)}
          placeholder="Write your announcement…" />
      </div>
      <button className={styles.primaryBtn} onClick={send} disabled={sending || !target}>
        <Send size={13} /> {sending ? 'Sending…' : 'Send Announcement'}
      </button>
    </div>
  );
}

// ═══════════════════════ F4 — Extensions ═══════════════════════

function ExtensionsTab({ toast3 }: { toast3: (m: string) => void }) {
  const [experiments, setExperiments] = useState<Array<{ id: string; title: string }>>([]);
  const [expId, setExpId] = useState('');
  const [rows, setRows] = useState<ExtensionRow[]>([]);
  const [loading, setLoading] = useState(false);

  // grant form
  const [studentName, setStudentName] = useState('');
  const [until, setUntil] = useState('');
  const [reason, setReason] = useState('');
  const [excused, setExcused] = useState(false);
  const [granting, setGranting] = useState(false);

  useEffect(() => {
    import('@/services/experiment.service').then(({ experimentService }) =>
      experimentService.listMine().then(e => setExperiments(e as Array<{ id: string; title: string }>))
        .catch(() => {}));
  }, []);

  const load = useCallback(async (id: string) => {
    if (!id) { setRows([]); return; }
    setLoading(true);
    try { setRows((await experienceService.listExtensions(id)).extensions); }
    catch { setRows([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(expId); }, [expId, load]);

  const grant = async () => {
    if (!expId || !studentName.trim() || !until) {
      toast3('Pick an experiment, student and date.'); return;
    }
    setGranting(true);
    try {
      await experienceService.grantExtension({
        experiment_id: expId,
        student_id: studentName.trim(),   // id chosen below via student list if available
        extension_until: new Date(until).toISOString(),
        reason: reason || undefined,
        excused,
      });
      toast3('Extension granted — the student was notified.');
      setReason(''); setStudentName(''); setUntil(''); setExcused(false);
      load(expId);
    } catch (e: unknown) {
      toast3((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to grant.');
    } finally { setGranting(false); }
  };

  const revoke = async (id: string) => {
    if (!confirm('Revoke this extension?')) return;
    try { await experienceService.revokeExtension(id); toast3('Extension revoked.'); load(expId); }
    catch { toast3('Revoke failed.'); }
  };

  return (
    <>
      <div className={styles.sectionCard} style={{ marginBottom: 16 }}>
        <p className={styles.sectionTitle} style={{ marginBottom: 4 }}>Grant deadline relief</p>
        <p className={styles.sectionSub} style={{ marginBottom: 12 }}>
          Re-opens the gate/catch-up window for one student on one experiment. Excused absences drop out of attendance-sensitive rollups. The student is notified automatically.
        </p>
        <div className={styles.gridTwo}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Experiment</label>
            <select className={styles.select} value={expId} onChange={e => setExpId(e.target.value)}>
              <option value="">Select experiment…</option>
              {experiments.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Student ID</label>
            <input className={styles.input} value={studentName} onChange={e => setStudentName(e.target.value)}
              placeholder="Student ID (from Students page)" />
          </div>
        </div>
        <div className={styles.gridTwo}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Extended until</label>
            <input className={styles.input} type="datetime-local" value={until}
              onChange={e => setUntil(e.target.value)} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Reason</label>
            <input className={styles.input} value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Medical leave…" />
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', marginBottom: 12 }}>
          <input type="checkbox" checked={excused} onChange={e => setExcused(e.target.checked)} />
          <AlertTriangle size={13} /> Also excuse missed sessions for this experiment
        </label>
        <button className={styles.primaryBtn} onClick={grant} disabled={granting || !expId}>
          <CalendarClock size={13} /> {granting ? 'Granting…' : 'Grant Extension'}
        </button>
      </div>

      <div className={styles.sectionCard}>
        <p className={styles.sectionTitle} style={{ marginBottom: 10 }}>Active extensions</p>
        {loading ? (
          <Loader2 size={18} className="animate-spin" style={{ margin: '12px auto', display: 'block' }} />
        ) : rows.length === 0 ? (
          <p className={styles.sectionSub}>No extensions granted{expId ? ' for this experiment' : ''}.</p>
        ) : (
          <div className={styles.list}>
            {rows.map(r => (
              <div key={r.id} className={styles.listRow}>
                <div className={styles.rowBody}>
                  <p className={styles.rowTitle}>{r.student_name ?? r.student_id} — {r.experiment_title ?? r.experiment_id}</p>
                  <p className={styles.rowMeta}>
                    Until {fmtDT(r.extension_until)}{r.excused ? ' · excused' : ''}{r.reason ? ` · ${r.reason}` : ''}
                  </p>
                </div>
                <div className={styles.rowSide}>
                  <button className={styles.ghostBtn} onClick={() => revoke(r.id)} title="Revoke">
                    <Trash2 size={13} /> Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
