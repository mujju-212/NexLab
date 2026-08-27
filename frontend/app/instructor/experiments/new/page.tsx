'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, FlaskConical, Save, AlertCircle, Layers, Sparkles } from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import { experimentService } from '@/services/experiment.service';
import { sessionService } from '@/services/session.service';
import { executionService, type CompilerLanguage } from '@/services/execution.service';
import styles from '../../shared.module.css';

interface SectionSubject {
  section_subject_id: string;
  subject_id: string;
  subject_name: string;
  subject_code: string;
  section_name: string;
}

const DEFAULT_LANGS = ['python', 'cpp', 'c', 'java'];

function NewExperimentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedSubjectId = searchParams.get('subject_id') || '';

  const [sectionSubjects, setSectionSubjects] = useState<SectionSubject[]>([]);
  const [languages, setLanguages] = useState<CompilerLanguage[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    subject_id: preselectedSubjectId,
    exp_number: 1,
    title: '',
    aim: '',
    difficulty_level: 1,
    concept_tags: '',
    allowed_languages: [...DEFAULT_LANGS],
    enable_viva: false,
    enable_lockdown: false,
    allow_ai_hints: true,
    time_limit_sec: 10,
    weightage: 1,
    grade_scale: 100,
  });

  useEffect(() => {
    sessionService.getSectionSubjects()
      .then(d => {
        const list = d.section_subjects ?? [];
        setSectionSubjects(list);
        if (preselectedSubjectId) {
          setForm(f => ({ ...f, subject_id: preselectedSubjectId }));
        }
      })
      .catch(() => setSectionSubjects([]));

    executionService.listLanguages()
      .then(d => setLanguages((d.languages ?? []).filter(l => l.engine === 'docker')))
      .catch(() => setLanguages([]));
  }, [preselectedSubjectId]);

  // Deduplicate subjects (same subject may appear for multiple sections)
  const subjects = sectionSubjects.filter(
    (ss, i) => sectionSubjects.findIndex(x => x.subject_id === ss.subject_id) === i
  );

  // Catalog if loaded, else a minimal fallback so the page still works offline.
  const langOptions: { id: string; label: string }[] = languages.length
    ? languages.map(l => ({ id: l.id, label: l.label }))
    : DEFAULT_LANGS.map(id => ({ id, label: id }));

  const toggleLanguage = (lang: string) =>
    setForm(f => ({
      ...f,
      allowed_languages: f.allowed_languages.includes(lang)
        ? f.allowed_languages.filter(l => l !== lang)
        : [...f.allowed_languages, lang],
    }));

  const submit = async () => {
    setError(null);
    const tags = form.concept_tags.split(',').map(t => t.trim()).filter(Boolean);
    if (!form.subject_id) { setError('Please select a subject.'); return; }
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (tags.length === 0) { setError('At least one concept tag is required (e.g. arrays, sorting).'); return; }
    if (form.allowed_languages.length === 0) { setError('Select at least one allowed language.'); return; }

    setSaving(true);
    try {
      const exp = await experimentService.create({
        subject_id: form.subject_id,
        exp_number: form.exp_number,
        title: form.title,
        aim: form.aim || undefined,
        difficulty_level: form.difficulty_level,
        concept_tags: tags,
        allowed_languages: form.allowed_languages,
        enable_viva: form.enable_viva,
        enable_lockdown: form.enable_lockdown,
        allow_ai_hints: form.allow_ai_hints,
        time_limit_sec: form.time_limit_sec,
        weightage: form.weightage,
        grade_scale: form.grade_scale,
      }) as { id?: string };

      // Hand off straight into the block studio (Content tab), where the rest of
      // the experiment — notes, runnable code, images, quizzes, graded tasks — is built.
      router.push(exp?.id ? `/instructor/experiments/${exp.id}/edit?tab=content` : '/instructor/experiments');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error ?? 'Failed to create experiment.');
      setSaving(false);
    }
  };

  return (
    <InstructorShell activePage="Experiments" title="Create Experiment"
      subtitle="Set up the experiment shell — you'll author its content in the studio next.">

      <div className={styles.actionRow}>
        <button className={styles.ghostBtn} onClick={() => router.push('/instructor/experiments')}>
          <ArrowLeft size={13} /> Back to experiments
        </button>
      </div>

      {error && (
        <p style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>
          <AlertCircle size={14} /> {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#f5f3ff', color: '#5b21b6', border: '1px solid #ddd6fe', padding: '12px 16px', borderRadius: 12, fontSize: 13, lineHeight: 1.55 }}>
        <Layers size={16} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          This creates the experiment shell. After saving you land in the <strong>content studio</strong>, where the
          pre-lab is built as stacked blocks — notes and theory, runnable code, images, HTML simulations, quizzes,
          and graded coding tasks (each with its own test cases). Theory, problem statements and test cases are no
          longer entered here; they are authored as blocks.
        </span>
      </div>

      <div className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <FlaskConical size={15} color="#7c3aed" />
          <h3 className={styles.sectionTitle}>Basics</h3>
        </div>

        <div className={styles.gridTwo}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Subject *</label>
            <select className={styles.select} value={form.subject_id}
              onChange={e => setForm(f => ({ ...f, subject_id: e.target.value }))}>
              <option value="">Select subject…</option>
              {subjects.map(s => (
                <option key={s.subject_id} value={s.subject_id}>
                  {s.subject_name} ({s.subject_code})
                </option>
              ))}
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Experiment number *</label>
            <input className={styles.input} type="number" min={1} value={form.exp_number}
              onChange={e => setForm(f => ({ ...f, exp_number: parseInt(e.target.value) || 1 }))} />
          </div>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Title *</label>
          <input className={styles.input} placeholder="e.g. Stack Data Structure Implementation"
            value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Aim (optional)</label>
          <textarea className={styles.textarea} placeholder="One-line purpose of the experiment. Full theory and tasks go in the studio."
            value={form.aim} onChange={e => setForm(f => ({ ...f, aim: e.target.value }))} />
        </div>
      </div>

      <div className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Classification & Rules</h3>
        </div>

        <div className={styles.gridTwo}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Difficulty level (1–4)</label>
            <select className={styles.select} value={form.difficulty_level}
              onChange={e => setForm(f => ({ ...f, difficulty_level: parseInt(e.target.value) }))}>
              <option value={1}>1 — Intro</option>
              <option value={2}>2 — Intermediate</option>
              <option value={3}>3 — Advanced</option>
              <option value={4}>4 — Expert</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Default execution time limit (seconds)</label>
            <input className={styles.input} type="number" min={1} max={60} value={form.time_limit_sec}
              onChange={e => setForm(f => ({ ...f, time_limit_sec: parseInt(e.target.value) || 10 }))} />
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
              onChange={e => setForm(f => ({ ...f, grade_scale: parseInt(e.target.value) }))}>
              <option value={100}>100-point scale</option>
              <option value={10}>10-point scale</option>
            </select>
            <p className={styles.sectionSub} style={{ marginTop: 4 }}>
              The denominator for this experiment's score (100 or 10).
            </p>
          </div>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Concept tags * (comma separated — used by knowledge tracing)</label>
          <input className={styles.input} placeholder="arrays, sorting, recursion"
            value={form.concept_tags} onChange={e => setForm(f => ({ ...f, concept_tags: e.target.value }))} />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>
            Allowed languages{languages.length ? ` (${languages.length} available from the compiler)` : ''}
          </label>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {langOptions.map(lang => (
              <label key={lang.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.allowed_languages.includes(lang.id)}
                  onChange={() => toggleLanguage(lang.id)} />
                {lang.label}
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginTop: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.enable_viva}
              onChange={e => setForm(f => ({ ...f, enable_viva: e.target.checked }))} />
            Enable viva
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.enable_lockdown}
              onChange={e => setForm(f => ({ ...f, enable_lockdown: e.target.checked }))} />
            Enable browser lockdown
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.allow_ai_hints}
              onChange={e => setForm(f => ({ ...f, allow_ai_hints: e.target.checked }))} />
            Allow AI hints
          </label>
        </div>
      </div>

      {/* Grading note — block weights are set in the studio, not here */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#f0fdf4', color: '#065f46', border: '1px solid #bbf7d0', padding: '12px 16px', borderRadius: 12, fontSize: 13, lineHeight: 1.55 }}>
        <Sparkles size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          <strong>Grading is block-based.</strong> After the experiment is created, open the studio&apos;s <strong>Details → Grading</strong> section to assign point weights to each assign/quiz/viva block you add. No rubric to fill out here.
        </span>
      </div>

      <div className={styles.actionRow}>
        <span />
        <button className={styles.primaryBtn} disabled={saving} onClick={submit}>
          <Save size={14} /> {saving ? 'Creating…' : 'Create & Open Studio'}
        </button>
      </div>
    </InstructorShell>
  );
}

export default function NewExperimentPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading...</div>}>
      <NewExperimentForm />
    </Suspense>
  );
}
