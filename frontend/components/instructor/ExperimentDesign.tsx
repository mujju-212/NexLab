'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Trash2, Save, GripVertical, Loader2, Flag, Lock, ShieldCheck,
  Layers, PieChart, Check, Sparkles, Monitor, Maximize2, FileText,
  BrainCircuit, Camera, Copy, Trophy, CheckCircle2, AlertCircle, RefreshCw
} from 'lucide-react';
import { experienceService, type Checkpoint } from '@/services/experience.service';
import { experimentService } from '@/services/experiment.service';

interface Props {
  experimentId: string;
  onToast: (msg: string) => void;
}

interface ExpExtras {
  experiment_type: string;
  rubric: { test_cases: number; lab_report: number; code_quality: number; viva: number; quiz: number; sum: number };
  proctor_defaults: Record<string, boolean>;
  ranking_visible?: boolean;
  weightage: number;
  grade_scale: number;
}

const PROCTOR_FIELDS = [
  { key: 'lockdown_fullscreen', label: 'Lockdown Fullscreen', desc: 'Force browser into exclusive fullscreen mode during lab.', icon: Maximize2, color: '#6366f1' },
  { key: 'block_copy_paste',    label: 'Block Copy / Paste', desc: 'Disable clipboard copy, paste, and right-click actions.', icon: Copy, color: '#ec4899' },
  { key: 'block_tab_switch',    label: 'Block Tab Switching', desc: 'Prevent opening external browser tabs or switching apps.', icon: Monitor, color: '#f59e0b' },
  { key: 'plagiarism_scan',     label: 'Plagiarism AI Scan', desc: 'Automatically scan submitted code for cross-student similarity.', icon: FileText, color: '#10b981' },
  { key: 'focus_ml',            label: 'Focus ML Monitoring', desc: 'Detect off-screen gaze and focus loss using ML heuristics.', icon: BrainCircuit, color: '#8b5cf6' },
  { key: 'webcam_required',     label: 'Webcam Verification', desc: 'Require live video stream for identity verification.', icon: Camera, color: '#ef4444' },
];

const TYPES = [
  { value: 'coding',    label: 'Coding',    desc: 'Test cases, checkpoints, IDE editor & automated execution engine.', icon: '💻', color: '#6366f1' },
  { value: 'mixed',     label: 'Mixed',     desc: 'Code solution + required MCQ quiz; all rubric dimensions active.', icon: '⚡', color: '#8b5cf6' },
  { value: 'quiz_only', label: 'Quiz Only', desc: 'Theoretical assessment; quiz scores drive student evaluation.', icon: '❓', color: '#06b6d4' },
  { value: 'reading',   label: 'Reading',   desc: 'Content pre-read only; completion-based, no exec engine needed.', icon: '📖', color: '#10b981' },
];

export default function ExperimentDesign({ experimentId, onToast }: Props) {
  const [subtab, setSubtab] = useState<'all' | 'checkpoints' | 'rubric' | 'proctor' | 'type'>('all');

  // ── Checkpoints state ─────────────────────────────────────────────────────
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [cpLoading, setCpLoading] = useState(true);
  const [testCases, setTestCases] = useState<{ id: string; description: string | null; is_hidden: boolean }[]>([]);
  const [editing, setEditing] = useState<Partial<Checkpoint> | null>(null);

  // ── Extras state ──────────────────────────────────────────────────────────
  const [extras, setExtras] = useState<ExpExtras | null>(null);
  const [exLoading, setExLoading] = useState(true);
  const [savingRubric, setSavingRubric] = useState(false);
  const [savingProctor, setSavingProctor] = useState(false);

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
      else onToast('Saved successfully.');
      loadAll();
    } catch (e: any) { onToast(e?.response?.data?.error || 'Failed to save settings.'); }
  };

  const setRubric = (key: string, val: number) =>
    setExtras(prev => prev ? {
      ...prev,
      rubric: { ...prev.rubric, [key]: val, sum: 0 },
    } : prev);

  const rubricSum = useMemo(() => extras ? Object.entries(extras.rubric)
    .filter(([k]) => k !== 'sum')
    .reduce((s, [, v]) => s + (Number(v) || 0), 0) : 0, [extras]);

  const saveRubric = async () => {
    setSavingRubric(true);
    await saveExtras({ rubric: extras?.rubric });
    setSavingRubric(false);
  };

  const setProctor = (key: string, val: boolean) =>
    setExtras(prev => prev ? {
      ...prev,
      proctor_defaults: { ...prev.proctor_defaults, [key]: val },
    } : prev);

  const saveProctor = async () => {
    setSavingProctor(true);
    await saveExtras({ proctor_defaults: extras?.proctor_defaults });
    setSavingProctor(false);
  };

  if (cpLoading || exLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 240, gap: 12, color: '#64748b' }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: '#7c3aed' }} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>Loading experiment design &amp; rubrics…</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* ── Sub Navigation Header Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        {[
          { key: 'checkpoints', label: 'Checkpoints (SPARK)', sub: 'Milestones during the lab', icon: Flag, count: `${checkpoints.length} Active` },
          { key: 'rubric',      label: 'Rubric',              sub: 'Scoring distribution',   icon: PieChart, count: `${rubricSum}/100%` },
          { key: 'proctor',     label: 'Proctoring',          sub: 'Security & monitoring',  icon: ShieldCheck, count: '6 Controls' },
          { key: 'type',        label: 'Type',               sub: 'Experiment behavior',    icon: Layers, count: extras?.experiment_type?.toUpperCase() || 'CODING' },
        ].map(t => {
          const Icon = t.icon;
          const isActive = subtab === t.key || subtab === 'all';
          return (
            <button
              key={t.key}
              onClick={() => setSubtab(subtab === t.key ? 'all' : (t.key as typeof subtab))}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12, textAlign: 'left',
                background: isActive ? '#ffffff' : '#f8fafc',
                border: subtab === t.key ? '2px solid #7c3aed' : '1px solid #e2e8f0',
                boxShadow: subtab === t.key ? '0 4px 14px rgba(124, 58, 237, 0.12)' : '0 1px 3px rgba(0,0,0,0.03)',
                cursor: 'pointer', transition: 'all 0.2s ease', position: 'relative', overflow: 'hidden'
              }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 10, background: subtab === t.key ? '#ede9fe' : '#f1f5f9', color: subtab === t.key ? '#7c3aed' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</div>
                <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>{t.sub}</div>
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: subtab === t.key ? '#7c3aed' : '#64748b', background: subtab === t.key ? '#f3e8ff' : '#e2e8f0', padding: '2px 8px', borderRadius: 6 }}>
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ══ 1. CHECKPOINTS (SPARK) SECTION ════════════════════════════════════ */}
      {(subtab === 'all' || subtab === 'checkpoints') && (
        <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 22, boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#ede9fe', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Flag size={18} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>Checkpoints (SPARK)</h3>
                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#7c3aed', background: '#f3e8ff', padding: '2px 6px', borderRadius: 4 }}>BETA</span>
                </div>
                <p style={{ fontSize: 12.5, color: '#64748b', margin: '2px 0 0' }}>
                  Milestones students must pass during the live lab. Verified by test cases or manual review; gate locks the next page.
                </p>
              </div>
            </div>
            <button
              onClick={() => setEditing({ order: checkpoints.length + 1, weight: 10, is_gated: false, test_case_ids: [] })}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: '#7c3aed', color: '#ffffff', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 2px 6px rgba(124,58,237,0.25)' }}
            >
              <Plus size={15} /> New Checkpoint
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            {checkpoints.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 16px', background: '#f8fafc', borderRadius: 10, border: '1px dashed #cbd5e1', color: '#64748b' }}>
                <Sparkles size={24} style={{ color: '#7c3aed', marginBottom: 6, margin: '0 auto' }} />
                <div style={{ fontSize: 13, fontWeight: 600 }}>No checkpoints defined yet</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Add your first checkpoint milestone to power the live SPARK evaluation grid.</div>
              </div>
            )}

            {checkpoints.map(cp => (
              <div
                key={cp.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: '#ffffff', borderRadius: 10,
                  border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', transition: 'all 0.15s ease'
                }}
              >
                <GripVertical size={16} color="#cbd5e1" style={{ cursor: 'grab' }} />
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#7c3aed', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
                  {cp.order}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{cp.title}</span>
                    {cp.is_gated && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#b45309', background: '#fffbeb', padding: '2px 8px', borderRadius: 6, border: '1px solid #fde68a' }}>
                        <Lock size={11} /> Gated Step
                      </span>
                    )}
                  </div>
                  {cp.description && <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>{cp.description}</div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11.5, color: '#64748b', marginTop: 6 }}>
                    <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>Weight: {cp.weight}%</span>
                    <span>{cp.test_case_ids?.length ?? 0} test case(s) verify</span>
                    <span>Page: {cp.page_id ? 'Linked' : 'None'}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => setEditing(cp)}
                    style={{ padding: '6px 12px', borderRadius: 6, background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => removeCheckpoint(cp)}
                    style={{ padding: '6px 10px', borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', color: '#ef4444', cursor: 'pointer' }}
                    title="Delete checkpoint"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Edit Checkpoint Modal / Panel */}
          {editing && (
            <div style={{ marginTop: 18, padding: 18, border: '1.5px solid #d8b4fe', borderRadius: 12, background: '#faf5ff' }}>
              <h4 style={{ fontSize: 14, fontWeight: 800, color: '#581c87', margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Flag size={16} /> {editing.id ? 'Edit Checkpoint' : 'Create New Checkpoint'}
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Checkpoint Title</label>
                  <input
                    value={editing.title || ''}
                    placeholder="e.g. Implement push and pop correctly"
                    onChange={e => setEditing(p => ({ ...p, title: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Description</label>
                  <textarea
                    value={editing.description || ''}
                    placeholder="Brief description of what is evaluated..."
                    onChange={e => setEditing(p => ({ ...p, description: e.target.value }))}
                    style={{ width: '100%', minHeight: 60, padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Step Order #</label>
                    <input
                      type="number"
                      value={editing.order ?? 0}
                      onChange={e => setEditing(p => ({ ...p, order: parseInt(e.target.value) || 0 }))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Weight (% of code score)</label>
                    <input
                      type="number"
                      value={editing.weight ?? 10}
                      onChange={e => setEditing(p => ({ ...p, weight: parseInt(e.target.value) || 0 }))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Verification Test Cases</label>
                  <select
                    multiple
                    value={editing.test_case_ids || []}
                    onChange={e => setEditing(p => ({
                      ...p,
                      test_case_ids: Array.from(e.target.selectedOptions).map(o => o.value),
                    }))}
                    style={{ width: '100%', minHeight: 80, padding: '8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, background: '#ffffff' }}
                  >
                    {testCases.map(tc => (
                      <option key={tc.id} value={tc.id}>
                        {tc.description || tc.id.slice(0, 8)}{tc.is_hidden ? ' (🔒 hidden)' : ' (🌐 public)'}
                      </option>
                    ))}
                  </select>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: '#374151', cursor: 'pointer', marginTop: 4 }}>
                  <input
                    type="checkbox"
                    checked={!!editing.is_gated}
                    onChange={e => setEditing(p => ({ ...p, is_gated: e.target.checked }))}
                  />
                  <span>Lock next page until this checkpoint passes (Gated milestone)</span>
                </label>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                  <button
                    onClick={() => setEditing(null)}
                    style={{ padding: '8px 16px', borderRadius: 6, background: '#ffffff', border: '1px solid #cbd5e1', color: '#374151', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveCheckpoint}
                    style={{ padding: '8px 18px', borderRadius: 6, background: '#7c3aed', color: '#ffffff', fontSize: 12.5, fontWeight: 700, border: 'none', cursor: 'pointer' }}
                  >
                    {editing.id ? 'Update Checkpoint' : 'Create Checkpoint'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ 2. RUBRIC DISTRIBUTION SECTION ═════════════════════════════════════ */}
      {(subtab === 'all' || subtab === 'rubric') && extras && (
        <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 22, boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <PieChart size={18} />
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>Rubric Scoring Distribution</h3>
                <p style={{ fontSize: 12.5, color: '#64748b', margin: '2px 0 0' }}>
                  Define how marks are distributed across different evaluation components. Total must sum to 100%.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: rubricSum === 100 ? '#15803d' : '#b91c1c', background: rubricSum === 100 ? '#f0fdf4' : '#fef2f2', padding: '4px 12px', borderRadius: 6, border: `1px solid ${rubricSum === 100 ? '#bbf7d0' : '#fecaca'}` }}>
                {rubricSum === 100 ? '✓ Total: 100/100%' : `⚠️ Total: ${rubricSum}/100%`}
              </span>
              <button
                onClick={saveRubric}
                disabled={rubricSum !== 100 || savingRubric}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: rubricSum === 100 ? '#16a34a' : '#94a3b8', color: '#ffffff', fontSize: 13, fontWeight: 700, border: 'none', cursor: rubricSum === 100 ? 'pointer' : 'not-allowed' }}
              >
                {savingRubric ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
                Save Rubric
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginTop: 14 }}>
            {[
              { key: 'test_cases', label: 'Code (test cases)', icon: '🧪' },
              { key: 'quiz',       label: 'MCQ Quiz',          icon: '❓' },
              { key: 'viva',       label: 'Oral Viva',         icon: '🗣️' },
              { key: 'code_quality', label: 'Code Quality',   icon: '✨' },
              { key: 'lab_report', label: 'Lab Report',       icon: '📄' },
            ].map(f => (
              <div key={f.key} style={{ background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', padding: '12px 14px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{f.icon}</span> {f.label}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={extras.rubric?.[f.key as keyof typeof extras.rubric] ?? 0}
                    onChange={e => setRubric(f.key, parseInt(e.target.value) || 0)}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 14, fontWeight: 700, textAlign: 'center', background: '#ffffff' }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ 3. PROCTORING SECURITY SECTION ═════════════════════════════════════ */}
      {(subtab === 'all' || subtab === 'proctor') && extras && (
        <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 22, boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShieldCheck size={18} />
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>Proctoring Security &amp; Monitoring</h3>
                <p style={{ fontSize: 12.5, color: '#64748b', margin: '2px 0 0' }}>
                  Default proctoring policy for this experiment — overridable per live session from the Conductor dashboard.
                </p>
              </div>
            </div>
            <button
              onClick={saveProctor}
              disabled={savingProctor}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: '#2563eb', color: '#ffffff', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}
            >
              {savingProctor ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
              Save Proctoring Settings
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginTop: 14 }}>
            {PROCTOR_FIELDS.map(f => {
              const IconComp = f.icon;
              const isEnabled = !!extras.proctor_defaults?.[f.key];
              return (
                <div
                  key={f.key}
                  onClick={() => setProctor(f.key, !isEnabled)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 10,
                    background: isEnabled ? '#f8fafc' : '#ffffff', border: isEnabled ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                    cursor: 'pointer', transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: isEnabled ? '#dbeafe' : '#f1f5f9', color: isEnabled ? '#2563eb' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <IconComp size={18} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{f.label}</div>
                    <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2, lineHeight: 1.4 }}>{f.desc}</div>
                  </div>
                  <div
                    style={{
                      width: 42, height: 22, borderRadius: 11, padding: 2, transition: 'all .2s ease', flexShrink: 0,
                      background: isEnabled ? '#2563eb' : '#cbd5e1', marginTop: 2
                    }}
                  >
                    <div
                      style={{
                        width: 18, height: 18, borderRadius: 9, background: '#ffffff', transition: 'all .2s ease',
                        marginLeft: isEnabled ? '20px' : '0px', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══ 4. EXPERIMENT TYPE & BEHAVIOR SECTION ══════════════════════════════ */}
      {(subtab === 'all' || subtab === 'type') && extras && (
        <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 22, boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#faf5ff', color: '#9333ea', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Layers size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>Experiment Mode &amp; Behavior</h3>
              <p style={{ fontSize: 12.5, color: '#64748b', margin: '2px 0 0' }}>
                Select the experiment mode. Drives student UI layout, execution engine invocation, and scoring logic.
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 14 }}>
            {TYPES.map(t => {
              const isSelected = extras.experiment_type === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => saveExtras({ experiment_type: t.value })}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px', borderRadius: 12, textAlign: 'left',
                    background: isSelected ? '#ffffff' : '#f8fafc', border: isSelected ? '2px solid #9333ea' : '1px solid #cbd5e1',
                    boxShadow: isSelected ? '0 4px 14px rgba(147, 51, 234, 0.12)' : 'none', cursor: 'pointer', transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 22 }}>{t.icon}</span>
                    {isSelected && (
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#9333ea', background: '#f3e8ff', padding: '2px 8px', borderRadius: 6 }}>
                        Active Mode
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{t.label}</div>
                  <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>{t.desc}</div>
                </button>
              );
            })}
          </div>

          {/* Public Rankings Toggle Card */}
          <div
            onClick={() => saveExtras({ ranking_visible: !(extras.ranking_visible ?? true) })}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '14px 18px', borderRadius: 10,
              background: '#f8fafc', border: '1px solid #e2e8f0', marginTop: 16, cursor: 'pointer'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Trophy size={20} color="#eab308" />
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>Show Public Rankings for this Experiment</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  When disabled, student performance in this experiment remains hidden from the subject leaderboard.
                </div>
              </div>
            </div>

            <div
              style={{
                width: 42, height: 22, borderRadius: 11, padding: 2, transition: 'all .2s ease', flexShrink: 0,
                background: (extras.ranking_visible ?? true) ? '#9333ea' : '#cbd5e1'
              }}
            >
              <div
                style={{
                  width: 18, height: 18, borderRadius: 9, background: '#ffffff', transition: 'all .2s ease',
                  marginLeft: (extras.ranking_visible ?? true) ? '20px' : '0px', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
