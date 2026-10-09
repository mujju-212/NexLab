'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Save, Sparkles, AlertCircle,
  Code2, MessageSquare, HelpCircle, GripVertical, BookOpen, Check, X, Code, Lock, ShieldCheck
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import ContentStudio from '@/components/instructor/studio/ContentStudio';
import ExperimentDesign from '@/components/instructor/ExperimentDesign';
import { experimentService } from '@/services/experiment.service';
import { instructorService } from '@/services/instructor.service';
import { executionService, type CompilerLanguage } from '@/services/execution.service';
import createStyles from '../../new/create-experiment.module.css';
import styles from '../../../shared.module.css';

type Tab = 'details' | 'content' | 'design';

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
  delivery_mode?: 'lab' | 'exam' | 'practice';
  available_from?: string | null;
  due_at?: string | null;
  max_attempts?: number | null;
  pass_threshold?: number | null;
  shuffle_questions?: boolean;
  experiment_type?: string;
  rubric_test_cases?: number;
  rubric_lab_report?: number;
  rubric_code_quality?: number;
  rubric_viva?: number;
  rubric_quiz?: number;
}

interface GradableBlock {
  id: string;
  title: string;
  module_type: 'assign' | 'quiz' | 'viva';
  weight: number;
}

const DEFAULT_LANGS = ['python', 'cpp', 'c', 'java', 'sql', 'javascript'];

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

// ── Grading Block Weights Component ──────────────────────────────────────────

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
      <div className={createStyles.optionsCard} style={{ textAlign: 'center', padding: '24px' }}>
        <Sparkles size={24} color="#7c3aed" style={{ marginBottom: 6, margin: '0 auto' }} />
        <p className={styles.sectionSub} style={{ margin: 0 }}>
          No gradable blocks yet. Add an <strong>Assign</strong>, <strong>Quiz</strong>, or <strong>Viva</strong>{' '}
          block in the Pre-lab Content tab.
        </p>
      </div>
    );
  }

  return (
    <div className={createStyles.rubricCard}>
      <div className={createStyles.rubricHeaderRow}>
        <span className={createStyles.rubricTitle}>Block Grading Points</span>
        <span className={createStyles.rubricSumBadge} style={{ background: '#ede9fe', color: '#7c3aed' }}>
          Total: {total} pts
        </span>
      </div>
      <p className={styles.sectionSub} style={{ margin: '4px 0 12px 0' }}>
        Assign point weights to each gradable block. The system converts them to final scores automatically.
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
                <GripVertical size={14} color="#94a3b8" />
              </td>
              <td className={styles.tdStrong}>{b.title}</td>
              <td>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  {BLOCK_TYPE_ICON[b.module_type]}
                  {BLOCK_TYPE_LABEL[b.module_type]}
                </span>
              </td>
              <td>
                <input
                  type="number"
                  min={0}
                  max={9999}
                  className={createStyles.formInput}
                  style={{ width: 90, padding: '6px 10px' }}
                  value={b.weight}
                  onChange={e => updateWeight(b.id, parseInt(e.target.value) || 0)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button className={createStyles.draftBtn} onClick={saveWeights} disabled={saving}>
          <Save size={14} /> {saving ? 'Saving…' : 'Save Block Weights'}
        </button>
      </div>
    </div>
  );
}

// ── Edit Experiment Page ──────────────────────────────────────────────────────

export default function EditExperimentPage({ params }: { params: Promise<{ experimentId: string }> }) {
  const { experimentId } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>('details');
  const [exp, setExp] = useState<Exp | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Interactive Concept Tags state
  const [tagInput, setTagInput] = useState('');
  const [tagsList, setTagsList] = useState<string[]>([]);

  // Form State
  const [form, setForm] = useState({
    title: '',
    aim: '',
    exp_number: 1,
    difficulty_level: 2,
    time_limit_sec: 60,
    allowed_languages: [] as string[],
    experiment_type: 'coding',
    enable_viva: true,
    enable_lockdown: true,
    allow_ai_hints: true,
    weightage: 100,
    grade_scale: 100 as 100 | 10,
    delivery_mode: 'lab' as 'lab' | 'exam' | 'practice',
    available_from: '',
    due_at: '',
    duration_minutes: 60,
    max_attempts: 1,
    pass_threshold: 40,
    shuffle_questions: false,
    prerequisites: '',
    learning_outcomes: '',

    // Rubric breakdown
    rubric_test_cases: 60,
    rubric_lab_report: 20,
    rubric_code_quality: 10,
    rubric_viva: 10,
    rubric_quiz: 0,
  });

  const [contentCount, setContentCount] = useState<number | null>(null);
  const [languages, setLanguages] = useState<CompilerLanguage[]>([]);

  const toast3 = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const { data: expData, isLoading: loadingExp } = useQuery({
    queryKey: ['instructor', 'experiment', { id: experimentId }],
    queryFn: () => experimentService.getById(experimentId),
    staleTime: 60 * 1000,
  });

  const { data: langData, isLoading: loadingLang } = useQuery({
    queryKey: ['execution', 'languages'],
    queryFn: () => executionService.listLanguages(),
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (expData) {
      const found = expData as unknown as Exp;
      setExp(found);
      setTagsList(found.concept_tags ?? []);
      setForm({
        title: found.title,
        aim: found.aim ?? '',
        exp_number: found.exp_number ?? 1,
        difficulty_level: found.difficulty_level ?? 2,
        time_limit_sec: found.time_limit_sec ?? 60,
        allowed_languages: found.allowed_languages ?? [],
        experiment_type: found.experiment_type ?? 'coding',
        enable_viva: found.enable_viva ?? true,
        enable_lockdown: found.enable_lockdown ?? true,
        allow_ai_hints: found.allow_ai_hints ?? true,
        weightage: found.weightage ?? 100,
        grade_scale: (found.grade_scale === 10 ? 10 : 100) as 100 | 10,
        delivery_mode: (found.delivery_mode || 'lab') as 'lab' | 'exam' | 'practice',
        available_from: found.available_from ? found.available_from.slice(0, 16) : '',
        due_at: found.due_at ? found.due_at.slice(0, 16) : '',
        duration_minutes: found.time_limit_sec ? Math.round(found.time_limit_sec / 60) : 60,
        max_attempts: found.max_attempts ?? 1,
        pass_threshold: found.pass_threshold ?? 40,
        shuffle_questions: Boolean(found.shuffle_questions),
        prerequisites: '',
        learning_outcomes: '',
        rubric_test_cases: found.rubric_test_cases ?? 60,
        rubric_lab_report: found.rubric_lab_report ?? 20,
        rubric_code_quality: found.rubric_code_quality ?? 10,
        rubric_viva: found.rubric_viva ?? 10,
        rubric_quiz: found.rubric_quiz ?? 0,
      });
    }
  }, [expData]);

  useEffect(() => {
    setLanguages((langData?.languages ?? []).filter((l: CompilerLanguage) => l.engine === 'docker'));
  }, [langData]);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'content') setTab('content');
    else if (t === 'design') setTab('design');
  }, []);

  const langOptions: { id: string; label: string }[] = languages.length
    ? languages.map(l => ({ id: l.id, label: l.label }))
    : DEFAULT_LANGS.map(id => ({ id, label: id.toUpperCase() }));

  const toggleLanguage = (langId: string) => {
    setForm(f => ({
      ...f,
      allowed_languages: f.allowed_languages.includes(langId)
        ? f.allowed_languages.filter(l => l !== langId)
        : [...f.allowed_languages, langId],
    }));
  };

  const handleAddTag = (tag: string) => {
    const cleaned = tag.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (cleaned && !tagsList.includes(cleaned)) {
      setTagsList(prev => [...prev, cleaned]);
    }
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTagsList(prev => prev.filter(t => t !== tagToRemove));
  };

  const rubricSum = form.rubric_test_cases + form.rubric_lab_report + form.rubric_code_quality + form.rubric_viva + form.rubric_quiz;

  const saveDetails = async () => {
    setError(null);
    if (!form.title.trim()) { setError('Experiment title is required.'); return; }
    if (tagsList.length === 0) { setError('At least one concept tag is required.'); return; }
    if (form.allowed_languages.length === 0) { setError('Select at least one allowed language.'); return; }
    if (rubricSum !== 100) { setError(`Rubric weight percentages must sum to 100% (Current sum: ${rubricSum}%).`); return; }

    setSaving(true);
    try {
      await experimentService.update(experimentId, {
        title: form.title,
        aim: form.aim,
        difficulty_level: form.difficulty_level,
        concept_tags: tagsList,
        time_limit_sec: form.delivery_mode === 'exam' ? form.duration_minutes * 60 : form.time_limit_sec,
        allowed_languages: form.allowed_languages,
        experiment_type: form.experiment_type,
        enable_viva: form.enable_viva,
        enable_lockdown: form.enable_lockdown,
        allow_ai_hints: form.allow_ai_hints,
        weightage: form.weightage,
        grade_scale: form.grade_scale,
        delivery_mode: form.delivery_mode,
        available_from: form.delivery_mode === 'exam' && form.available_from ? form.available_from : null,
        due_at: form.delivery_mode === 'exam' && form.due_at ? form.due_at : null,
        max_attempts: form.delivery_mode === 'exam' ? form.max_attempts : null,
        pass_threshold: form.delivery_mode === 'exam' ? form.pass_threshold : null,
        shuffle_questions: form.delivery_mode === 'exam' ? form.shuffle_questions : false,
        rubric_test_cases: form.rubric_test_cases,
        rubric_lab_report: form.rubric_lab_report,
        rubric_code_quality: form.rubric_code_quality,
        rubric_viva: form.rubric_viva,
        rubric_quiz: form.rubric_quiz,
      });
      toast3('Experiment settings saved successfully.');
      queryClient.invalidateQueries({ queryKey: ['instructor', 'experiment', { id: experimentId }] });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error ?? 'Failed to save experiment.');
    } finally {
      setSaving(false);
    }
  };

  if (!exp) {
    return (
      <InstructorShell activePage="Experiments" title="Experiment">
        <p className={styles.sectionSub}>Loading experiment details…</p>
      </InstructorShell>
    );
  }

  return (
    <InstructorShell
      activePage="Experiments"
      title={`#${exp.exp_number} — ${exp.title}`}
      subtitle={exp.is_published ? 'Published — visible to students.' : 'Draft — hidden from students.'}
    >
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 300, background: '#111827', color: '#fff', padding: '12px 20px', borderRadius: 12, fontSize: 14, fontWeight: 600 }}>
          {toast}
        </div>
      )}

      {/* Header Tab Bar & Navigation */}
      <div className={createStyles.topHeader} style={{ marginBottom: 20 }}>
        <div className={createStyles.topActions}>
          <button className={createStyles.draftBtn} onClick={() => router.push('/instructor/experiments')}>
            <ArrowLeft size={15} /> Back to Experiments
          </button>
        </div>

        <div className={styles.tabRow}>
          {([
            { id: 'details', label: 'Details & Configuration' },
            { id: 'content', label: `Pre-lab Content${contentCount != null ? ` (${contentCount})` : ''}` },
            { id: 'design',  label: 'Rubrics & Checkpoints' },
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

        {tab === 'details' && (
          <button className={createStyles.nextTopBtn} disabled={saving} onClick={saveDetails}>
            <Save size={15} /> {saving ? 'Saving...' : 'Save Changes'}
          </button>
        )}
      </div>

      {error && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '12px 18px', borderRadius: 14, fontSize: 13.5, fontWeight: 700, marginBottom: 20 }}>
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {/* ══ DETAILS TAB ══ */}
      {tab === 'details' && (
        <div className={createStyles.formCard} style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div className={createStyles.formHeader}>
            <div className={createStyles.formIconBox}>
              <BookOpen size={24} />
            </div>
            <div className={createStyles.formTitleGroup}>
              <h2 className={createStyles.formCardTitle}>Edit Experiment Details</h2>
              <p className={createStyles.formCardSubtitle}>Modify experiment metadata, rules, options, and rubric weights.</p>
            </div>
          </div>

          {/* ── SECTION 1: BASICS ── */}
          <div className={createStyles.sectionSubHeader}>
            <span>1. Basics</span>
          </div>

          <div className={createStyles.gridTwo}>
            <div className={createStyles.formGroup}>
              <label className={createStyles.formLabel}>
                Exp # <span className={createStyles.reqStar}>*</span>
              </label>
              <input
                type="number"
                min={1}
                className={createStyles.formInput}
                value={form.exp_number}
                onChange={e => setForm(f => ({ ...f, exp_number: parseInt(e.target.value) || 1 }))}
              />
            </div>

            <div className={createStyles.formGroup}>
              <label className={createStyles.formLabel}>
                Weightage (Marks) <span className={createStyles.reqStar}>*</span>
              </label>
              <input
                type="number"
                min={1}
                className={createStyles.formInput}
                value={form.weightage}
                onChange={e => setForm(f => ({ ...f, weightage: parseInt(e.target.value) || 100 }))}
              />
              <p className={createStyles.inputHelpText} style={{ color: '#7c3aed', fontWeight: 600 }}>
                Rolls up into subject grade: (score / grade_scale) × weightage
              </p>
            </div>
          </div>

          {/* Delivery Mode Selector */}
          <div className={createStyles.formGroup}>
            <label className={createStyles.formLabel}>
              Delivery Mode <span className={createStyles.reqStar}>*</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, delivery_mode: 'lab' }))}
                style={{
                  padding: '14px 16px',
                  borderRadius: 12,
                  border: form.delivery_mode === 'lab' ? '2px solid #7c3aed' : '1px solid #e2e8f0',
                  background: form.delivery_mode === 'lab' ? '#f5f3ff' : '#ffffff',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 14, color: form.delivery_mode === 'lab' ? '#6d28d9' : '#1e293b' }}>
                  🧪 Lab Experiment
                </span>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  Standard continuous lab with modules, code runner, and viva.
                </span>
              </button>

              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, delivery_mode: 'exam' }))}
                style={{
                  padding: '14px 16px',
                  borderRadius: 12,
                  border: form.delivery_mode === 'exam' ? '2px solid #7c3aed' : '1px solid #e2e8f0',
                  background: form.delivery_mode === 'exam' ? '#f5f3ff' : '#ffffff',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 14, color: form.delivery_mode === 'exam' ? '#6d28d9' : '#1e293b' }}>
                  ⏱️ Timed Exam
                </span>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  Scheduled time window, attempt limit, rolls up to subject grade.
                </span>
              </button>

              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, delivery_mode: 'practice' }))}
                style={{
                  padding: '14px 16px',
                  borderRadius: 12,
                  border: form.delivery_mode === 'practice' ? '2px solid #7c3aed' : '1px solid #e2e8f0',
                  background: form.delivery_mode === 'practice' ? '#f5f3ff' : '#ffffff',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 14, color: form.delivery_mode === 'practice' ? '#6d28d9' : '#1e293b' }}>
                  ✨ Practice Mode
                </span>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  Self-paced playground without exam or grading pressure.
                </span>
              </button>
            </div>
          </div>

          {/* Conditional Timed Exam Settings */}
          {form.delivery_mode === 'exam' && (
            <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>⏱️</span>
                <strong style={{ fontSize: 14, color: '#6b21a8' }}>Exam Window & Delivery Settings</strong>
              </div>

              <div className={createStyles.gridTwo}>
                <div className={createStyles.formGroup}>
                  <label className={createStyles.formLabel}>Available From</label>
                  <input
                    type="datetime-local"
                    className={createStyles.formInput}
                    value={form.available_from}
                    onChange={e => setForm(f => ({ ...f, available_from: e.target.value }))}
                  />
                  <p className={createStyles.inputHelpText}>Optional: earliest date/time students can start.</p>
                </div>

                <div className={createStyles.formGroup}>
                  <label className={createStyles.formLabel}>Due Date / Window Closes</label>
                  <input
                    type="datetime-local"
                    className={createStyles.formInput}
                    value={form.due_at}
                    onChange={e => setForm(f => ({ ...f, due_at: e.target.value }))}
                  />
                  <p className={createStyles.inputHelpText}>Optional: deadline after which no new attempts are allowed.</p>
                </div>
              </div>

              <div className={createStyles.gridTwo}>
                <div className={createStyles.formGroup}>
                  <label className={createStyles.formLabel}>Duration (Minutes)</label>
                  <input
                    type="number"
                    min={5}
                    max={300}
                    className={createStyles.formInput}
                    value={form.duration_minutes}
                    onChange={e => setForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) || 60 }))}
                  />
                  <p className={createStyles.inputHelpText}>Timer duration once an attempt starts.</p>
                </div>

                <div className={createStyles.formGroup}>
                  <label className={createStyles.formLabel}>Max Attempts</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    className={createStyles.formInput}
                    value={form.max_attempts}
                    onChange={e => setForm(f => ({ ...f, max_attempts: parseInt(e.target.value) || 1 }))}
                  />
                  <p className={createStyles.inputHelpText}>Number of attempts allowed per student.</p>
                </div>
              </div>

              <div className={createStyles.gridTwo}>
                <div className={createStyles.formGroup}>
                  <label className={createStyles.formLabel}>Pass Threshold (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className={createStyles.formInput}
                    value={form.pass_threshold}
                    onChange={e => setForm(f => ({ ...f, pass_threshold: parseInt(e.target.value) || 40 }))}
                  />
                </div>

                <div className={createStyles.formGroup} style={{ justifyContent: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 24, fontSize: 13.5, fontWeight: 600, color: '#334155' }}>
                    <input
                      type="checkbox"
                      checked={form.shuffle_questions}
                      onChange={e => setForm(f => ({ ...f, shuffle_questions: e.target.checked }))}
                      style={{ width: 16, height: 16, accentColor: '#7c3aed' }}
                    />
                    Shuffle Question Order for Students
                  </label>
                </div>
              </div>
            </div>
          )}

          <div className={createStyles.formGroup}>
            <label className={createStyles.formLabel}>
              Experiment Title <span className={createStyles.reqStar}>*</span>
            </label>
            <input
              type="text"
              className={createStyles.formInput}
              placeholder="e.g. Stack Implementation using Arrays"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />
          </div>

          <div className={createStyles.formGroup}>
            <label className={createStyles.formLabel}>
              <span>Short Description / Aim <span className={createStyles.reqStar}>*</span></span>
              <span className={createStyles.charCount}>{form.aim.length}/200</span>
            </label>
            <textarea
              className={createStyles.formTextarea}
              rows={3}
              maxLength={200}
              placeholder="e.g. Implement a fixed-size stack using arrays and analyze time complexity."
              value={form.aim}
              onChange={e => setForm(f => ({ ...f, aim: e.target.value }))}
            />
          </div>

          {/* ── SECTION 2: CLASSIFICATION & RULES ── */}
          <div className={createStyles.sectionSubHeader}>
            <span>2. Classification & Rules</span>
          </div>

          <div className={createStyles.gridTwo}>
            <div className={createStyles.formGroup}>
              <label className={createStyles.formLabel}>
                Difficulty Level <span className={createStyles.reqStar}>*</span>
              </label>
              <select
                className={createStyles.formSelect}
                value={form.difficulty_level}
                onChange={e => setForm(f => ({ ...f, difficulty_level: parseInt(e.target.value) }))}
              >
                <option value={1}>Level 1 — Introductory</option>
                <option value={2}>Level 2 — Intermediate</option>
                <option value={3}>Level 3 — Advanced</option>
              </select>
            </div>

            <div className={createStyles.formGroup}>
              <label className={createStyles.formLabel}>
                Default Execution Time Limit <span className={createStyles.reqStar}>*</span>
              </label>
              <select
                className={createStyles.formSelect}
                value={form.time_limit_sec}
                onChange={e => setForm(f => ({ ...f, time_limit_sec: parseInt(e.target.value) }))}
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>60 minutes</option>
                <option value={90}>90 minutes</option>
                <option value={120}>120 minutes</option>
              </select>
            </div>
          </div>

          <div className={createStyles.gridTwo}>
            <div className={createStyles.formGroup}>
              <label className={createStyles.formLabel}>Grade Scale</label>
              <select
                className={createStyles.formSelect}
                value={form.grade_scale}
                onChange={e => setForm(f => ({ ...f, grade_scale: parseInt(e.target.value) as 100 | 10 }))}
              >
                <option value={100}>100-point scale (0 - 100%)</option>
                <option value={10}>10-point scale</option>
              </select>
            </div>

            <div className={createStyles.formGroup}>
              <label className={createStyles.formLabel}>Experiment Type</label>
              <select
                className={createStyles.formSelect}
                value={form.experiment_type}
                onChange={e => setForm(f => ({ ...f, experiment_type: e.target.value }))}
              >
                <option value="coding">Coding Lab</option>
                <option value="quiz_only">Quiz Only</option>
                <option value="mixed">Mixed (Theory + Code + Quiz)</option>
                <option value="reading">Reading & Conceptual</option>
              </select>
            </div>
          </div>

          {/* Interactive Concept Tags Input */}
          <div className={createStyles.formGroup}>
            <label className={createStyles.formLabel}>Concept Tags (press Enter or comma to add)</label>
            <div className={createStyles.tagsBox}>
              {tagsList.map(tag => (
                <span key={tag} className={createStyles.tagPill}>
                  {tag}
                  <button type="button" className={createStyles.tagRemoveBtn} onClick={() => handleRemoveTag(tag)}>
                    <X size={13} />
                  </button>
                </span>
              ))}
              <input
                type="text"
                className={createStyles.tagInput}
                placeholder={tagsList.length === 0 ? "Add tags e.g. stacks, arrays..." : "Add tag..."}
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    handleAddTag(tagInput);
                  }
                }}
              />
            </div>
          </div>

          {/* Allowed Languages Selection */}
          <div className={createStyles.formGroup}>
            <label className={createStyles.formLabel}>Allowed Programming Languages</label>
            <div className={createStyles.langGrid}>
              {langOptions.map(lang => {
                const selected = form.allowed_languages.includes(lang.id);
                return (
                  <div
                    key={lang.id}
                    className={`${createStyles.langPill} ${selected ? createStyles.langPillSelected : ''}`}
                    onClick={() => toggleLanguage(lang.id)}
                  >
                    <Code size={14} />
                    <span>{lang.label}</span>
                    {selected && <Check size={14} />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── SECTION 3: OPTIONS ── */}
          <div className={createStyles.sectionSubHeader}>
            <span>3. Experiment Options</span>
          </div>

          <div className={createStyles.optionsCard}>
            <div className={createStyles.optionRow}>
              <div className={createStyles.optionLabelGroup}>
                <span className={createStyles.optionTitle}>
                  <MessageSquare size={16} color="#7c3aed" /> Enable Viva Voice Evaluation
                </span>
                <span className={createStyles.optionSub}>AI interactive viva voice questions after lab completion.</span>
              </div>
              <input
                type="checkbox"
                className={createStyles.toggleCheckbox}
                checked={form.enable_viva}
                onChange={e => setForm(f => ({ ...f, enable_viva: e.target.checked }))}
              />
            </div>

            <div className={createStyles.optionRow}>
              <div className={createStyles.optionLabelGroup}>
                <span className={createStyles.optionTitle}>
                  <Lock size={16} color="#7c3aed" /> Enable Browser Lockdown
                </span>
                <span className={createStyles.optionSub}>Restrict tab switching, copy-paste, and external dev tools.</span>
              </div>
              <input
                type="checkbox"
                className={createStyles.toggleCheckbox}
                checked={form.enable_lockdown}
                onChange={e => setForm(f => ({ ...f, enable_lockdown: e.target.checked }))}
              />
            </div>

            <div className={createStyles.optionRow}>
              <div className={createStyles.optionLabelGroup}>
                <span className={createStyles.optionTitle}>
                  <Sparkles size={16} color="#7c3aed" /> Allow AI Hints & Assistance
                </span>
                <span className={createStyles.optionSub}>Give students step-by-step guidance when compiler errors occur.</span>
              </div>
              <input
                type="checkbox"
                className={createStyles.toggleCheckbox}
                checked={form.allow_ai_hints}
                onChange={e => setForm(f => ({ ...f, allow_ai_hints: e.target.checked }))}
              />
            </div>
          </div>

          {/* ── SECTION 4: RUBRIC WEIGHT BREAKDOWN ── */}
          <div className={createStyles.sectionSubHeader}>
            <span>4. Rubric Weight Distribution (Total: 100%)</span>
          </div>

          <div className={createStyles.rubricCard}>
            <div className={createStyles.rubricHeaderRow}>
              <span className={createStyles.rubricTitle}>Assessment Breakdown Weights</span>
              <span className={`${createStyles.rubricSumBadge} ${rubricSum === 100 ? createStyles.rubricValid : createStyles.rubricInvalid}`}>
                Sum: {rubricSum}% {rubricSum === 100 ? '✓ Valid' : '⚠️ Must sum to 100%'}
              </span>
            </div>

            <div className={createStyles.gridThree}>
              <div className={createStyles.formGroup}>
                <label className={createStyles.formLabel}>Test Cases (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={createStyles.formInput}
                  value={form.rubric_test_cases}
                  onChange={e => setForm(f => ({ ...f, rubric_test_cases: parseInt(e.target.value) || 0 }))}
                />
              </div>

              <div className={createStyles.formGroup}>
                <label className={createStyles.formLabel}>Lab Report (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={createStyles.formInput}
                  value={form.rubric_lab_report}
                  onChange={e => setForm(f => ({ ...f, rubric_lab_report: parseInt(e.target.value) || 0 }))}
                />
              </div>

              <div className={createStyles.formGroup}>
                <label className={createStyles.formLabel}>Code Quality (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={createStyles.formInput}
                  value={form.rubric_code_quality}
                  onChange={e => setForm(f => ({ ...f, rubric_code_quality: parseInt(e.target.value) || 0 }))}
                />
              </div>

              <div className={createStyles.formGroup}>
                <label className={createStyles.formLabel}>Viva Voice (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={createStyles.formInput}
                  value={form.rubric_viva}
                  onChange={e => setForm(f => ({ ...f, rubric_viva: parseInt(e.target.value) || 0 }))}
                />
              </div>

              <div className={createStyles.formGroup}>
                <label className={createStyles.formLabel}>Quiz Block (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={createStyles.formInput}
                  value={form.rubric_quiz}
                  onChange={e => setForm(f => ({ ...f, rubric_quiz: parseInt(e.target.value) || 0 }))}
                />
              </div>
            </div>
          </div>

          {/* Block Grading Weights Table */}
          <div style={{ marginTop: 12 }}>
            <GradingSection experimentId={experimentId} onToast={toast3} />
          </div>

          <div className={createStyles.formActionsRow}>
            <button type="button" className={createStyles.cancelBtn} onClick={() => router.push('/instructor/experiments')}>
              Cancel
            </button>
            <button type="button" className={createStyles.nextStepBtn} disabled={saving} onClick={saveDetails}>
              <Save size={15} /> {saving ? 'Saving...' : 'Save Changes'}
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

      {/* ══ DESIGN — checkpoints / rubric / proctoring / type ══ */}
      {tab === 'design' && (
        <ExperimentDesign experimentId={experimentId} onToast={toast3} />
      )}
    </InstructorShell>
  );
}
