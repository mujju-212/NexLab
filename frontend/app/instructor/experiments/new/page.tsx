'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FlaskConical, Save, AlertCircle } from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import { experimentService } from '@/services/experiment.service';
import { sessionService } from '@/services/session.service';
import styles from '../../shared.module.css';

interface SectionSubject {
  section_subject_id: string;
  subject_id: string;
  subject_name: string;
  subject_code: string;
  section_name: string;
}

const ALL_LANGUAGES = ['python', 'cpp', 'c', 'java'];

export default function NewExperimentPage() {
  const router = useRouter();
  const [sectionSubjects, setSectionSubjects] = useState<SectionSubject[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    subject_id: '',
    exp_number: 1,
    title: '',
    aim: '',
    theory: '',
    problem_statement: '',
    input_format: '',
    output_format: '',
    difficulty_level: 1,
    concept_tags: '',
    allowed_languages: [...ALL_LANGUAGES],
    rubric_test_cases: 60,
    rubric_lab_report: 20,
    rubric_code_quality: 10,
    rubric_viva: 10,
    enable_viva: false,
    enable_lockdown: false,
    allow_ai_hints: true,
    time_limit_sec: 10,
  });

  useEffect(() => {
    sessionService.getSectionSubjects()
      .then(d => setSectionSubjects(d.section_subjects ?? []))
      .catch(() => setSectionSubjects([]));
  }, []);

  // Deduplicate subjects (same subject may appear for multiple sections)
  const subjects = sectionSubjects.filter(
    (ss, i) => sectionSubjects.findIndex(x => x.subject_id === ss.subject_id) === i
  );

  const rubricSum = form.rubric_test_cases + form.rubric_lab_report
    + form.rubric_code_quality + form.rubric_viva;

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
    if (rubricSum !== 100) { setError(`Rubric weights must sum to 100 (currently ${rubricSum}).`); return; }
    if (form.allowed_languages.length === 0) { setError('Select at least one allowed language.'); return; }

    setSaving(true);
    try {
      const exp = await experimentService.create({
        subject_id: form.subject_id,
        exp_number: form.exp_number,
        title: form.title,
        aim: form.aim || undefined,
        theory: form.theory || undefined,
        problem_statement: form.problem_statement || undefined,
        input_format: form.input_format || undefined,
        output_format: form.output_format || undefined,
        difficulty_level: form.difficulty_level,
        concept_tags: tags,
        allowed_languages: form.allowed_languages,
        rubric_test_cases: form.rubric_test_cases,
        rubric_lab_report: form.rubric_lab_report,
        rubric_code_quality: form.rubric_code_quality,
        rubric_viva: form.rubric_viva,
        enable_viva: form.enable_viva,
        enable_lockdown: form.enable_lockdown,
        allow_ai_hints: form.allow_ai_hints,
        time_limit_sec: form.time_limit_sec,
      }) as { id?: string };
      router.push(exp?.id ? `/instructor/experiments/${exp.id}/edit` : '/instructor/experiments');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error ?? 'Failed to create experiment.');
      setSaving(false);
    }
  };

  return (
    <InstructorShell activePage="Experiments" title="Create Experiment"
      subtitle="Define the experiment, grading rubric and rules.">

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
          <label className={styles.formLabel}>Aim</label>
          <textarea className={styles.textarea} placeholder="What students should achieve…"
            value={form.aim} onChange={e => setForm(f => ({ ...f, aim: e.target.value }))} />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Theory (shown in pre-lab)</label>
          <textarea className={styles.textarea} placeholder="Background theory for the experiment…"
            value={form.theory} onChange={e => setForm(f => ({ ...f, theory: e.target.value }))} />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Problem statement *</label>
          <textarea className={styles.textarea} placeholder="The exact coding task students must complete…"
            value={form.problem_statement} onChange={e => setForm(f => ({ ...f, problem_statement: e.target.value }))} />
        </div>

        <div className={styles.gridTwo}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Input format</label>
            <textarea className={styles.textarea} placeholder="e.g. First line: N, then N integers"
              value={form.input_format} onChange={e => setForm(f => ({ ...f, input_format: e.target.value }))} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Output format</label>
            <textarea className={styles.textarea} placeholder="e.g. Single integer per line"
              value={form.output_format} onChange={e => setForm(f => ({ ...f, output_format: e.target.value }))} />
          </div>
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
            <label className={styles.formLabel}>Execution time limit (seconds)</label>
            <input className={styles.input} type="number" min={1} max={60} value={form.time_limit_sec}
              onChange={e => setForm(f => ({ ...f, time_limit_sec: parseInt(e.target.value) || 10 }))} />
          </div>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Concept tags * (comma separated — used by knowledge tracing)</label>
          <input className={styles.input} placeholder="arrays, sorting, recursion"
            value={form.concept_tags} onChange={e => setForm(f => ({ ...f, concept_tags: e.target.value }))} />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Allowed languages</label>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {ALL_LANGUAGES.map(lang => (
              <label key={lang} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.allowed_languages.includes(lang)}
                  onChange={() => toggleLanguage(lang)} />
                {lang}
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

      <div className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Grading Rubric (must sum to 100)</h3>
          <span className={`${styles.pill} ${rubricSum === 100 ? styles.pillGreen : styles.pillAmber}`}>
            Sum: {rubricSum}
          </span>
        </div>
        <div className={styles.gridTwo}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Test cases (%)</label>
            <input className={styles.input} type="number" min={0} max={100} value={form.rubric_test_cases}
              onChange={e => setForm(f => ({ ...f, rubric_test_cases: parseInt(e.target.value) || 0 }))} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Lab report (%)</label>
            <input className={styles.input} type="number" min={0} max={100} value={form.rubric_lab_report}
              onChange={e => setForm(f => ({ ...f, rubric_lab_report: parseInt(e.target.value) || 0 }))} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Code quality (%)</label>
            <input className={styles.input} type="number" min={0} max={100} value={form.rubric_code_quality}
              onChange={e => setForm(f => ({ ...f, rubric_code_quality: parseInt(e.target.value) || 0 }))} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Viva (%)</label>
            <input className={styles.input} type="number" min={0} max={100} value={form.rubric_viva}
              onChange={e => setForm(f => ({ ...f, rubric_viva: parseInt(e.target.value) || 0 }))} />
          </div>
        </div>
      </div>

      <div className={styles.actionRow}>
        <span />
        <button className={styles.primaryBtn} disabled={saving} onClick={submit}>
          <Save size={14} /> {saving ? 'Creating…' : 'Create Experiment'}
        </button>
      </div>
    </InstructorShell>
  );
}
