'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Save, Sparkles, AlertCircle,
  Code2, MessageSquare, HelpCircle, GripVertical,
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import ContentStudio from '@/components/instructor/studio/ContentStudio';
import { experimentService } from '@/services/experiment.service';
import { instructorService } from '@/services/instructor.service';
import { executionService, type CompilerLanguage } from '@/services/execution.service';
import styles from '../../../shared.module.css';

// Only two tabs remain: Details and Pre-lab Content.
type Tab = 'details' | 'content';

interface Exp {
  id: string;
  exp_number: number;
  title: string;
  aim: string | null;
  theory: string | null;
  problem_statement: string | null;
  difficulty_level: number;
  concept_tags: string[];
  allowed_languages: string[];
  enable_viva: boolean;
  enable_lockdown: boolean;
  allow_ai_hints: boolean;
  time_limit_sec: number;
  is_published: boolean;
  weightage: number;
  grade_scale: 100 | 10;
}

// A gradable block pulled from the studio block list.
interface GradableBlock {
  id: string;
  title: string;
  module_type: 'assign' | 'quiz' | 'viva';
  weight: number; // editable points
}

// Sensible fallback when the compiler catalog can't be reached.
const DEFAULT_LANGS = ['python', 'cpp', 'c', 'java'];

const BLOCK_TYPE_ICON: Record<string, React.ReactNode> = {
  assign: <Code2 size={14} color="#7c3aed" />,
  quiz:   <HelpCircle size={14} color="#0891b2" />,
  viva:   <MessageSquare size={14} color="#059669" />,
};

const BLOCK_TYPE_LABEL: Record<string, string> = {
  assign: 'Code assignment',
  quiz:   'Quiz',
  viva:   'Viva',
};

// ── Grading tab ───────────────────────────────────────────────────────────────

function GradingSection({
  experimentId,
  onToast,
}: {
  experimentId: string;
  onToast: (msg: string) => void;
}) {
  const [blocks, setBlocks] = useState<GradableBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load the content blocks, keep only gradable types.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await instructorService.listContent(experimentId) as {
        modules?: { id: string; title: string; module_type: string; content_data?: Record<string, unknown> }[];
      };
      const all = raw.modules ?? [];
      const gradable = all.filter(m => ['assign', 'quiz', 'viva'].includes(m.module_type));
      setBlocks(gradable.map(m => ({
        id: m.id,
        title: m.title,
        module_type: m.module_type as 'assign' | 'quiz' | 'viva',
        weight: typeof m.content_data?.weight === 'number' ? m.content_data.weight : 0,
      })));
    } catch {
      setBlocks([]);
    } finally {
      setLoading(false);
    }
  }, [experimentId]);

  useEffect(() => { load(); }, [load]);

  const updateWeight = (id: string, val: number) =>
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, weight: val } : b));

  const saveWeights = async () => {
    setSaving(true);
    try {
      await Promise.all(
        blocks.map(b =>
          instructorService.updateContentModule(experimentId, b.id, {
            content_data: { weight: b.weight },
          })
        )
      );
      onToast('Grading weights saved.');
    } catch {
      onToast('Failed to save weights — try again.');
    } finally {
      setSaving(false);
    }
  };

  const total = blocks.reduce((s, b) => s + (b.weight || 0), 0);

  if (loading) {
    return <p className={styles.sectionSub}>Loading content blocks…</p>;
  }

  if (blocks.length === 0) {
    return (
      <div className={styles.sectionCard} style={{ textAlign: 'center', padding: '32px 0' }}>
        <Sparkles size={28} color="#d8b4fe" style={{ marginBottom: 8 }} />
        <p className={styles.sectionSub}>
          No gradable blocks yet. Add an <strong>Assign</strong>, <strong>Quiz</strong>, or <strong>Viva</strong>{' '}
          block in the Pre-lab Content tab.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>Block grading weights</h3>
        <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 600 }}>
          Total: <strong style={{ color: total === 100 ? '#059669' : '#b45309' }}>{total}</strong> pts
        </span>
      </div>
      <p className={styles.sectionSub} style={{ marginBottom: 14 }}>
        Assign point weights to each gradable block. They do not need to sum to 100 — the system
        converts them to percentages automatically.
      </p>

      <table className={styles.table}>
        <thead>
          <tr>
            <th style={{ width: 32 }}></th>
            <th>Block</th>
            <th>Type</th>
            <th style={{ width: 120 }}>Weight (pts)</th>
          </tr>
        </thead>
        <tbody>
          {blocks.map(b => (
            <tr key={b.id}>
              <td>
                <GripVertical size={14} color="#d1d5db" />
              </td>
              <td className={styles.tdStrong}>{b.title}</td>
              <td>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  {BLOCK_TYPE_ICON[b.module_type]}
                  {BLOCK_TYPE_LABEL[b.module_type]}
                </span>
              </td>
              <td>
                <input
                  type="number"
                  min={0}
                  max={9999}
                  className={styles.input}
                  style={{ width: 80 }}
                  value={b.weight}
                  onChange={e => updateWeight(b.id, parseInt(e.target.value) || 0)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={styles.actionRow} style={{ marginTop: 14 }}>
        <span />
        <button className={styles.primaryBtn} onClick={saveWeights} disabled={saving}>
          <Save size={13} /> {saving ? 'Saving…' : 'Save Weights'}
        </button>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function EditExperimentPage({ params }: { params: Promise<{ experimentId: string }> }) {
  const { experimentId } = use(params);
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('details');
  const [exp, setExp] = useState<Exp | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [languages, setLanguages] = useState<CompilerLanguage[]>([]);

  // details form — removed: input_format, output_format, rubric_* fields
  const [form, setForm] = useState({
    title: '',
    aim: '',
    theory: '',
    problem_statement: '',
    difficulty_level: 1,
    concept_tags: '',
    time_limit_sec: 10,
    allowed_languages: [] as string[],
    enable_viva: false,
    enable_lockdown: false,
    allow_ai_hints: true,
    weightage: 1,
    grade_scale: 100 as 100 | 10,
  });

  // content is managed inside <ContentStudio />; it reports its block count up
  // so the tab label can show it.
  const [contentCount, setContentCount] = useState<number | null>(null);

  const toast3 = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const loadExp = useCallback(async () => {
    try {
      const exps = await experimentService.listMine() as Exp[];
      const found = exps.find(e => e.id === experimentId) ?? null;
      setExp(found);
      if (found) {
        setForm({
          title: found.title,
          aim: found.aim ?? '',
          theory: found.theory ?? '',
          problem_statement: found.problem_statement ?? '',
          difficulty_level: found.difficulty_level,
          concept_tags: found.concept_tags.join(', '),
          time_limit_sec: found.time_limit_sec,
          allowed_languages: found.allowed_languages ?? [],
          enable_viva: found.enable_viva,
          enable_lockdown: found.enable_lockdown,
          allow_ai_hints: found.allow_ai_hints,
          weightage: found.weightage ?? 1,
          grade_scale: (found.grade_scale === 10 ? 10 : 100) as 100 | 10,
        });
      }
    } catch { setExp(null); }
  }, [experimentId]);

  useEffect(() => { loadExp(); }, [loadExp]);

  // Compiler catalog — docker-executable languages only.
  useEffect(() => {
    executionService.listLanguages()
      .then(d => setLanguages((d.languages ?? []).filter(l => l.engine === 'docker')))
      .catch(() => setLanguages([]));
  }, []);

  // Deep-link support: /edit?tab=content lands directly in the studio.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'content') setTab('content');
  }, []);

  // ── actions ────────────────────────────────────────────────────────────────

  const saveDetails = async () => {
    setError(null);
    const tags = form.concept_tags.split(',').map(t => t.trim()).filter(Boolean);
    if (tags.length === 0) { setError('At least one concept tag is required.'); return; }
    try {
      await experimentService.update(experimentId, {
        title: form.title,
        aim: form.aim,
        theory: form.theory,
        problem_statement: form.problem_statement,
        difficulty_level: form.difficulty_level,
        concept_tags: tags,
        time_limit_sec: form.time_limit_sec,
        allowed_languages: form.allowed_languages,
        enable_viva: form.enable_viva,
        enable_lockdown: form.enable_lockdown,
        allow_ai_hints: form.allow_ai_hints,
        weightage: form.weightage,
        grade_scale: form.grade_scale,
      });
      toast3('Experiment saved.');
      loadExp();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error ?? 'Failed to save.');
    }
  };

  // Catalog if loaded, else a minimal fallback so the selector still works.
  const langOptions: { id: string; label: string }[] = languages.length
    ? languages.map(l => ({ id: l.id, label: l.label }))
    : DEFAULT_LANGS.map(id => ({ id, label: id }));

  const toggleLang = (id: string) =>
    setForm(f => ({
      ...f,
      allowed_languages: f.allowed_languages.includes(id)
        ? f.allowed_languages.filter(l => l !== id)
        : [...f.allowed_languages, id],
    }));

  if (!exp) {
    return (
      <InstructorShell activePage="Experiments" title="Experiment">
        <p className={styles.sectionSub}>Loading experiment…</p>
      </InstructorShell>
    );
  }

  return (
    <InstructorShell
      activePage="Experiments"
      title={`#${exp.exp_number} — ${exp.title}`}
      subtitle={exp.is_published ? 'Published — students can see this experiment.' : 'Draft — not visible to students yet.'}
    >
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 300, background: '#111827', color: '#fff', padding: '12px 20px', borderRadius: 12, fontSize: 14, fontWeight: 600 }}>
          {toast}
        </div>
      )}

      <div className={styles.actionRow}>
        <button className={styles.ghostBtn} onClick={() => router.push('/instructor/experiments')}>
          <ArrowLeft size={13} /> Back
        </button>
        <div className={styles.tabRow}>
          {([
            { id: 'details', label: 'Details' },
            { id: 'content', label: `Pre-lab Content${contentCount != null ? ` (${contentCount})` : ''}` },
          ] as { id: Tab; label: string }[]).map(t => (
            <button
              key={t.id}
              className={`${styles.tabChip} ${tab === t.id ? styles.tabChipActive : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>
          <AlertCircle size={14} /> {error}
        </p>
      )}

      {/* ══ DETAILS ══ */}
      {tab === 'details' && (
        <div className={styles.sectionCard}>
          {/* Title */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Title</label>
            <input className={styles.input} value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>

          {/* Aim + Problem statement */}
          <div className={styles.gridTwo}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Aim</label>
              <textarea className={styles.textarea} value={form.aim}
                onChange={e => setForm(f => ({ ...f, aim: e.target.value }))} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Problem statement</label>
              <textarea className={styles.textarea} value={form.problem_statement}
                onChange={e => setForm(f => ({ ...f, problem_statement: e.target.value }))} />
            </div>
          </div>

          {/* Theory */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Theory</label>
            <textarea className={styles.textarea} value={form.theory}
              onChange={e => setForm(f => ({ ...f, theory: e.target.value }))} />
          </div>

          {/* Concept tags + Difficulty */}
          <div className={styles.gridTwo}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Concept tags (comma separated)</label>
              <input className={styles.input} value={form.concept_tags}
                onChange={e => setForm(f => ({ ...f, concept_tags: e.target.value }))} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Difficulty (1–4)</label>
              <select className={styles.select} value={form.difficulty_level}
                onChange={e => setForm(f => ({ ...f, difficulty_level: parseInt(e.target.value) }))}>
                <option value={1}>1 — Intro</option>
                <option value={2}>2 — Intermediate</option>
                <option value={3}>3 — Advanced</option>
                <option value={4}>4 — Expert</option>
              </select>
            </div>
          </div>

          {/* Allowed languages */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              Allowed languages{languages.length ? ` (${languages.length} available from the compiler)` : ''}
            </label>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {langOptions.map(lang => (
                <label key={lang.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.allowed_languages.includes(lang.id)}
                    onChange={() => toggleLang(lang.id)} />
                  {lang.label}
                </label>
              ))}
            </div>
          </div>

          {/* Options — inline toggles */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Options</label>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', paddingTop: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.enable_viva}
                  onChange={e => setForm(f => ({ ...f, enable_viva: e.target.checked }))} />
                Enable Viva
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.enable_lockdown}
                  onChange={e => setForm(f => ({ ...f, enable_lockdown: e.target.checked }))} />
                Lockdown mode
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.allow_ai_hints}
                  onChange={e => setForm(f => ({ ...f, allow_ai_hints: e.target.checked }))} />
                Allow AI hints
              </label>
            </div>
          </div>

          {/* Experiment grading weightage */}
          <div className={styles.gridTwo}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Weightage (marks toward subject total)</label>
              <input className={styles.input} type="number" min={1} value={form.weightage}
                onChange={e => setForm(f => ({ ...f, weightage: parseInt(e.target.value) || 1 }))} />
              <p className={styles.sectionSub} style={{ marginTop: 4 }}>
                How many marks this experiment contributes to the subject's total.
              </p>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Grade scale</label>
              <select className={styles.select} value={form.grade_scale}
                onChange={e => setForm(f => ({ ...f, grade_scale: parseInt(e.target.value) as 100 | 10 }))}>
                <option value={100}>100-point scale</option>
                <option value={10}>10-point scale</option>
              </select>
              <p className={styles.sectionSub} style={{ marginTop: 4 }}>
                The denominator for this experiment's score (100 or 10).
              </p>
            </div>
          </div>

          {/* Grading — block weights */}
          <div style={{ marginTop: 8 }}>
            <label className={styles.formLabel} style={{ marginBottom: 10 }}>
              Grading — block weights
            </label>
            <GradingSection experimentId={experimentId} onToast={toast3} />
          </div>

          <div className={styles.actionRow}>
            <span />
            <button className={styles.primaryBtn} onClick={saveDetails}>
              <Save size={13} /> Save Changes
            </button>
          </div>
        </div>
      )}

      {/* ══ PRE-LAB CONTENT ══ */}
      {tab === 'content' && (
        <ContentStudio
          experimentId={experimentId}
          languages={languages}
          onToast={toast3}
          onCount={setContentCount}
        />
      )}
    </InstructorShell>
  );
}
