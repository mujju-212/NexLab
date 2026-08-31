'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Plus, Trash2, Save, GripVertical, Loader2, Flag, Lock,
} from 'lucide-react';
import { experienceService, type Checkpoint } from '@/services/experience.service';
import { experimentService } from '@/services/experiment.service';
import styles from '@/app/instructor/shared.module.css';

interface Props {
  experimentId: string;
  onToast: (msg: string) => void;
}

interface ExpExtras {
  experiment_type: string;
  rubric: { test_cases: number; lab_report: number; code_quality: number; viva: number; quiz: number; sum: number };
  proctor_defaults: Record<string, boolean>;
  weightage: number;
  grade_scale: number;
}

const PROCTOR_FIELDS = [
  { key: 'lockdown_fullscreen', label: 'Lockdown fullscreen' },
  { key: 'block_copy_paste',    label: 'Block copy/paste' },
  { key: 'block_tab_switch',    label: 'Block tab switch' },
  { key: 'plagiarism_scan',     label: 'Plagiarism scan' },
  { key: 'focus_ml',            label: 'Focus ML monitoring' },
  { key: 'webcam_required',     label: 'Webcam required' },
];

const TYPES = [
  { value: 'coding',    label: 'Coding',    desc: 'Test cases, checkpoints, code editor; exec engine invoked' },
  { value: 'mixed',     label: 'Mixed',     desc: 'Code + required quiz; all rubric sliders' },
  { value: 'quiz_only', label: 'Quiz Only', desc: 'No code; quiz is the deliverable' },
  { value: 'reading',   label: 'Reading',   desc: 'Content only; completion-based, no exec engine' },
];

export default function ExperimentDesign({ experimentId, onToast }: Props) {
  const [subtab, setSubtab] = useState<'checkpoints' | 'rubric' | 'proctor' | 'type'>('checkpoints');

  // ── Checkpoints state ─────────────────────────────────────────────────────
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [cpLoading, setCpLoading] = useState(true);
  const [testCases, setTestCases] = useState<{ id: string; description: string | null; is_hidden: boolean }[]>([]);
  const [editing, setEditing] = useState<Partial<Checkpoint> | null>(null);

  // ── Extras state ──────────────────────────────────────────────────────────
  const [extras, setExtras] = useState<ExpExtras | null>(null);
  const [exLoading, setExLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setCpLoading(true); setExLoading(true);
    try {
      const [cps, tcs, mine] = await Promise.all([
        experienceService.listCheckpoints(experimentId),
        experimentService.getTestCases(experimentId),
        experimentService.listMine(),
      ]);
      setCheckpoints(cps);
      setTestCases((tcs as { id: string; description: string | null; is_hidden: boolean }[]) ?? []);
      const found = (mine as (ExpExtras & { id: string })[]).find(e => e.id === experimentId);
      if (found) setExtras(found as unknown as ExpExtras);
    } catch { /* ignore */ }
    finally { setCpLoading(false); setExLoading(false); }
  }, [experimentId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Checkpoint CRUD ───────────────────────────────────────────────────────
  const saveCheckpoint = async () => {
    if (!editing?.title?.trim()) { onToast('Checkpoint title required.'); return; }
    try {
      if (editing.id) {
        await experienceService.updateCheckpoint(experimentId, editing.id, editing);
        onToast('Checkpoint updated.');
      } else {
        await experienceService.createCheckpoint(experimentId, editing);
        onToast('Checkpoint created.');
      }
      setEditing(null);
      loadAll();
    } catch (e: any) { onToast(e?.response?.data?.error || 'Failed to save checkpoint.'); }
  };

  const removeCheckpoint = async (cp: Checkpoint) => {
    if (!confirm(`Delete checkpoint "${cp.title}"?`)) return;
    try { await experienceService.deleteCheckpoint(experimentId, cp.id); loadAll(); }
    catch { onToast('Failed to delete.'); }
  };

  // ── Extras (rubric/type/proctor) ──────────────────────────────────────────
  const saveExtras = async (payload: Record<string, unknown>) => {
    try {
      const res = await experienceService.patchExperimentExtras(experimentId, payload);
      const warn = (res as { warnings?: string[] }).warnings?.[0];
      if (warn) onToast(warn);
      else onToast('Saved.');
      loadAll();
    } catch (e: any) { onToast(e?.response?.data?.error || 'Failed to save.'); }
  };

  const setRubric = (key: string, val: number) =>
    setExtras(prev => prev ? {
      ...prev,
      rubric: { ...prev.rubric, [key]: val, sum: 0 },
    } : prev);

  const rubricSum = extras ? Object.entries(extras.rubric)
    .filter(([k]) => k !== 'sum')
    .reduce((s, [, v]) => s + (Number(v) || 0), 0) : 0;

  const saveRubric = () => saveExtras({ rubric: extras?.rubric });

  const setProctor = (key: string, val: boolean) =>
    setExtras(prev => prev ? {
      ...prev,
      proctor_defaults: { ...prev.proctor_defaults, [key]: val },
    } : prev);

  const saveProctor = () => saveExtras({ proctor_defaults: extras?.proctor_defaults });

  if (cpLoading || exLoading) {
    return <div style={{ textAlign: 'center', color: '#9891a6', padding: 30 }}><Loader2 size={18} className="animate-spin" /></div>;
  }

  return (
    <div className={styles.sectionCard}>
      <div className={styles.tabRow}>
        {[
          { key: 'checkpoints', label: 'Checkpoints (SPARK)' },
          { key: 'rubric',      label: 'Rubric' },
          { key: 'proctor',     label: 'Proctoring' },
          { key: 'type',        label: 'Type' },
        ].map(t => (
          <button key={t.key} onClick={() => setSubtab(t.key as typeof subtab)}
            className={`${styles.tabChip} ${subtab === t.key ? styles.tabChipActive : ''}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ Checkpoints ═════════════════════════════════════════════════════ */}
      {subtab === 'checkpoints' && (
        <div>
          <div className={styles.actionRow}>
            <p className={styles.sectionSub} style={{ flex: 1 }}>
              Milestones students must pass during the live lab. Verified by test cases; gate locks the next page.
            </p>
            <button className={styles.primaryBtn} onClick={() => setEditing({ order: checkpoints.length + 1, weight: 10, is_gated: false, test_case_ids: [] })}>
              <Plus size={14} /> New Checkpoint
            </button>
          </div>

          <div className={styles.list}>
            {checkpoints.length === 0 && (
              <div style={{ color: '#9891a6', padding: 16, textAlign: 'center' }}>
                No checkpoints yet — add one to power the SPARK grid.
              </div>
            )}
            {checkpoints.map(cp => (
              <div key={cp.id} className={styles.listRow}>
                <GripVertical size={16} color="#c4b5fd" />
                <div className={styles.rowBody}>
                  <div className={styles.rowTitle}>
                    {cp.order}. {cp.title}
                    {cp.is_gated && <Lock size={12} style={{ display: 'inline', marginLeft: 6, color: '#b45309' }} />}
                  </div>
                  <div className={styles.rowMeta}>{cp.description || 'No description'}</div>
                  <div className={styles.rowSub}>
                    Weight {cp.weight} · {cp.test_case_ids?.length ?? 0} test case(s) verify · page {cp.page_id ? 'linked' : 'none'}
                  </div>
                </div>
                <div className={styles.rowSide}>
                  <button className={styles.ghostBtn} onClick={() => setEditing(cp)}>Edit</button>
                  <button className={styles.ghostBtn} onClick={() => removeCheckpoint(cp)}>
                    <Trash2 size={13} color="#ef4444" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {editing && (
            <div style={{ marginTop: 18, padding: 18, border: '1px solid #ede9fe', borderRadius: 14, background: '#faf5ff' }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 12 }}>
                {editing.id ? 'Edit Checkpoint' : 'New Checkpoint'}
              </h4>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Title</label>
                <input className={styles.input} value={editing.title || ''}
                  onChange={e => setEditing(p => ({ ...p, title: e.target.value }))} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Description</label>
                <textarea className={styles.textarea} value={editing.description || ''}
                  onChange={e => setEditing(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Order</label>
                  <input type="number" className={styles.input} value={editing.order ?? 0}
                    onChange={e => setEditing(p => ({ ...p, order: parseInt(e.target.value) || 0 }))} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Weight (code component %)</label>
                  <input type="number" className={styles.input} value={editing.weight ?? 10}
                    onChange={e => setEditing(p => ({ ...p, weight: parseInt(e.target.value) || 0 }))} />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Verified by test cases</label>
                <select multiple className={styles.select} style={{ minHeight: 80 }}
                  value={editing.test_case_ids || []}
                  onChange={e => setEditing(p => ({
                    ...p,
                    test_case_ids: Array.from(e.target.selectedOptions).map(o => o.value),
                  }))}>
                  {testCases.map(tc => (
                    <option key={tc.id} value={tc.id}>
                      {tc.description || tc.id.slice(0, 8)}{tc.is_hidden ? ' (hidden)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14 }}>
                <input type="checkbox" checked={!!editing.is_gated}
                  onChange={e => setEditing(p => ({ ...p, is_gated: e.target.checked }))} />
                <span><Flag size={12} style={{ display: 'inline', marginRight: 4 }} />Gated — locks next page until verified</span>
              </label>
              <div className={styles.actionRow} style={{ marginBottom: 0 }}>
                <button className={styles.secondaryBtn} onClick={() => setEditing(null)}>Cancel</button>
                <button className={styles.primaryBtn} onClick={saveCheckpoint}>
                  <Save size={13} /> {editing.id ? 'Save' : 'Create'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ Rubric ═══════════════════════════════════════════════════════════ */}
      {subtab === 'rubric' && extras && (
        <div>
          <p className={styles.sectionSub} style={{ marginBottom: 14 }}>
            Final = code·w + quiz·w + viva·w + quality·w + lab·w − hint deduction. Must sum to 100.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
            {[
              { key: 'test_cases', label: 'Code (test cases)' },
              { key: 'quiz',       label: 'Quiz' },
              { key: 'viva',       label: 'Viva' },
              { key: 'code_quality', label: 'Code quality' },
              { key: 'lab_report', label: 'Lab report' },
            ].map(f => (
              <div key={f.key} className={styles.formGroup}>
                <label className={styles.formLabel}>{f.label}</label>
                <input type="number" min={0} max={100} className={styles.input}
                  value={extras.rubric?.[f.key as keyof typeof extras.rubric] ?? 0}
                  onChange={e => setRubric(f.key, parseInt(e.target.value) || 0)} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: rubricSum === 100 ? '#059669' : '#b91c1c' }}>
              Sum: {rubricSum}/100
            </span>
            <button className={styles.primaryBtn} onClick={saveRubric} disabled={rubricSum !== 100}>
              <Save size={13} /> Save Rubric
            </button>
          </div>
        </div>
      )}

      {/* ══ Proctoring ═══════════════════════════════════════════════════════ */}
      {subtab === 'proctor' && extras && (
        <div>
          <p className={styles.sectionSub} style={{ marginBottom: 14 }}>
            Default proctoring policy — overridable per session/page live from the Conductor.
          </p>
          <div className={styles.list}>
            {PROCTOR_FIELDS.map(f => (
              <div key={f.key} className={styles.listRow} style={{ cursor: 'pointer' }}
                onClick={() => setProctor(f.key, !extras.proctor_defaults?.[f.key])}>
                <div className={styles.rowBody}><div className={styles.rowTitle}>{f.label}</div></div>
                <div className={styles.rowSide}>
                  <div style={{
                    width: 44, height: 24, borderRadius: 12, padding: 2, transition: 'all .15s',
                    background: extras.proctor_defaults?.[f.key] ? '#7c3aed' : '#d1d5db',
                  }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: 10, background: '#fff', transition: 'all .15s',
                      marginLeft: extras.proctor_defaults?.[f.key] ? '22px' : '2px',
                    }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className={styles.actionRow} style={{ marginTop: 14, marginBottom: 0 }}>
            <span style={{ flex: 1 }} />
            <button className={styles.primaryBtn} onClick={saveProctor}>
              <Save size={13} /> Save Proctoring
            </button>
          </div>
        </div>
      )}

      {/* ══ Type ═════════════════════════════════════════════════════════════ */}
      {subtab === 'type' && extras && (
        <div>
          <p className={styles.sectionSub} style={{ marginBottom: 14 }}>
            Type drives the student UI, exec-engine invocation and which rubric sliders apply.
          </p>
          <div className={styles.list}>
            {TYPES.map(t => (
              <button key={t.value} onClick={() => saveExtras({ experiment_type: t.value })}
                className={styles.listRow} style={{
                  cursor: 'pointer', width: '100%', textAlign: 'left',
                  border: extras.experiment_type === t.value ? '1.5px solid #7c3aed' : '1px solid rgba(255,255,255,.88)',
                }}>
                <div className={styles.rowBody}>
                  <div className={styles.rowTitle}>{t.label}</div>
                  <div className={styles.rowMeta}>{t.desc}</div>
                </div>
                <div className={styles.rowSide}>
                  {extras.experiment_type === t.value && (
                    <span className={styles.pillGreen}>Active</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
