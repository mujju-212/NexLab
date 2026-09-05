'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Loader2, HelpCircle, Code2, Layers } from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import styles from '../../shared.module.css';
import { examService, type ExamType, type SubjectOption } from '@/services/exam.service';

/** datetime-local string → UTC ISO (or null when empty). */
const toIso = (v: string): string | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const TYPE_CHOICES: Array<{ value: ExamType; label: string; Icon: typeof HelpCircle; hint: string }> = [
  { value: 'mcq', label: 'Multiple Choice', Icon: HelpCircle, hint: 'Auto-graded MCQ questions' },
  { value: 'coding', label: 'Coding', Icon: Code2, hint: 'Docker-graded code against test cases' },
  { value: 'mixed', label: 'Mixed', Icon: Layers, hint: 'Both MCQ and coding questions' },
];

export default function NewExamPage() {
  const router = useRouter();
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(true);

  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [examType, setExamType] = useState<ExamType>('mcq');
  const [description, setDescription] = useState('');
  const [availableFrom, setAvailableFrom] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [duration, setDuration] = useState(30);
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [passThreshold, setPassThreshold] = useState(40);
  const [shuffle, setShuffle] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    examService.listSubjectOptions()
      .then(res => { setSubjects(res); if (res.length && !subjectId) setSubjectId(res[0].subject_id); })
      .catch(() => setError('Could not load your subjects.'))
      .finally(() => setLoadingSubjects(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    setError(null);
    if (!title.trim()) { setError('Please enter an exam title.'); return; }
    if (!subjectId) { setError('Please choose a subject.'); return; }
    const from = toIso(availableFrom);
    const due = toIso(dueAt);
    if (from && due && due <= from) { setError('The due date must be after the availability start.'); return; }

    setSaving(true);
    try {
      const exam = await examService.createExam({
        title: title.trim(),
        subject_id: subjectId,
        exam_type: examType,
        description: description.trim() || undefined,
        available_from: from,
        due_at: due,
        duration_minutes: duration,
        max_attempts: maxAttempts,
        pass_threshold: passThreshold,
        shuffle_questions: shuffle,
      });
      router.push(`/instructor/exams/${exam.id}/edit`);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Failed to create exam.');
      setSaving(false);
    }
  };

  return (
    <InstructorShell
      activePage="Exams"
      title="Create Exam"
      subtitle="Set the basics — you'll add questions on the next screen"
    >
      <div className={styles.actionRow}>
        <button type="button" className={styles.secondaryBtn} onClick={() => router.push('/instructor/exams')}>
          <ArrowLeft size={16} /> Back to Exams
        </button>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: 12, marginBottom: 18, color: '#b91c1c', fontSize: 13.5, fontWeight: 600 }}>
          {error}
        </div>
      )}

      <section className={styles.sectionCard} style={{ maxWidth: 760 }}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Exam Details</h2>
            <p className={styles.sectionSub}>All fields except the window are required</p>
          </div>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Title *</label>
          <input className={styles.input} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Data Structures Mid-Term Exam" />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Subject *</label>
          {loadingSubjects ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280', fontSize: 13 }}><Loader2 size={15} className="spin" /> Loading subjects…</div>
          ) : subjects.length === 0 ? (
            <p style={{ color: '#b45309', fontSize: 13, margin: 0 }}>No subjects assigned to you yet. Ask your institution admin to assign a section-subject.</p>
          ) : (
            <select className={styles.select} value={subjectId} onChange={e => setSubjectId(e.target.value)}>
              {subjects.map(s => (
                <option key={s.subject_id} value={s.subject_id}>
                  {s.subject_name}{s.subject_code ? ` (${s.subject_code})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Exam Type *</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {TYPE_CHOICES.map(tc => {
              const Icon = tc.Icon;
              const active = examType === tc.value;
              return (
                <button key={tc.value} type="button" onClick={() => setExamType(tc.value)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
                    padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    border: active ? '1.5px solid #9333ea' : '1.5px solid #e5e7eb',
                    background: active ? 'rgba(245,243,255,.85)' : 'rgba(255,255,255,.7)',
                    boxShadow: active ? '0 2px 10px rgba(147,51,234,.12)' : 'none',
                    transition: 'all .15s',
                  }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13.5, color: active ? '#7c3aed' : '#374151' }}>
                    <Icon size={15} /> {tc.label}
                  </span>
                  <span style={{ fontSize: 11.5, color: '#6b7280', lineHeight: 1.35 }}>{tc.hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Description / Instructions</label>
          <textarea className={styles.textarea} value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Shown to students before they start (rules, allowed materials, etc.)" />
        </div>

        <div className={styles.gridTwo}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Available From</label>
            <input type="datetime-local" className={styles.input} value={availableFrom} onChange={e => setAvailableFrom(e.target.value)} />
            <span style={{ fontSize: 11.5, color: '#9ca3af' }}>Leave blank for “available immediately”.</span>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Due At (submission deadline)</label>
            <input type="datetime-local" className={styles.input} value={dueAt} onChange={e => setDueAt(e.target.value)} />
            <span style={{ fontSize: 11.5, color: '#9ca3af' }}>Leave blank for “no deadline”.</span>
          </div>
        </div>

        <div className={styles.gridTwo}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Duration (minutes per attempt)</label>
            <input type="number" min={1} className={styles.input} value={duration} onChange={e => setDuration(Math.max(1, Number(e.target.value) || 1))} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Max Attempts</label>
            <input type="number" min={1} className={styles.input} value={maxAttempts} onChange={e => setMaxAttempts(Math.max(1, Number(e.target.value) || 1))} />
          </div>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Pass Threshold (%): {passThreshold}</label>
          <input type="range" min={0} max={100} step={5} value={passThreshold}
            onChange={e => setPassThreshold(Number(e.target.value))} style={{ width: '100%' }} />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: '#374151', fontWeight: 600, marginBottom: 20, cursor: 'pointer' }}>
          <input type="checkbox" checked={shuffle} onChange={e => setShuffle(e.target.checked)} style={{ width: 16, height: 16 }} />
          Shuffle question order per attempt
        </label>

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className={styles.primaryBtn} onClick={submit} disabled={saving || loadingSubjects}>
            {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            {saving ? 'Creating…' : 'Create Exam & Add Questions'}
          </button>
          <button type="button" className={styles.secondaryBtn} onClick={() => router.push('/instructor/exams')} disabled={saving}>
            Cancel
          </button>
        </div>
      </section>
    </InstructorShell>
  );
}
