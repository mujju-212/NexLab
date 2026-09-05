'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ClipboardList, Plus, Pencil, BarChart3, Trash2, Clock, CalendarClock,
  Loader2, Eye, EyeOff, HelpCircle, Code2, Layers,
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import styles from '../shared.module.css';
import { examService, type Exam } from '@/services/exam.service';

const fmtDateTime = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
};

const TYPE_META: Record<string, { label: string; Icon: typeof HelpCircle; cls: string }> = {
  mcq: { label: 'MCQ', Icon: HelpCircle, cls: 'blueBadge' },
  coding: { label: 'Coding', Icon: Code2, cls: 'greenBadge' },
  mixed: { label: 'Mixed', Icon: Layers, cls: 'amberBadge' },
};

export default function InstructorExamsPage() {
  const router = useRouter();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await examService.listExams();
      setExams(res);
    } catch {
      setError('Could not load exams.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const togglePublish = async (e: Exam) => {
    setBusyId(e.id);
    try {
      const updated = await examService.updateExam(e.id, { is_published: !e.is_published });
      setExams(xs => xs.map(x => x.id === e.id ? { ...x, ...updated } : x));
      setToast(updated.is_published ? 'Exam published — visible to enrolled students ✓' : 'Exam unpublished.');
    } catch {
      setToast('Failed to update publish state.');
    } finally {
      setBusyId(null);
    }
  };

  const removeExam = async (e: Exam) => {
    if (!window.confirm(`Delete "${e.title}"? This removes all its questions and attempts.`)) return;
    setBusyId(e.id);
    try {
      await examService.deleteExam(e.id);
      setExams(xs => xs.filter(x => x.id !== e.id));
      setToast('Exam deleted.');
    } catch {
      setToast('Failed to delete exam.');
    } finally {
      setBusyId(null);
    }
  };

  const published = exams.filter(e => e.is_published).length;
  const open = exams.filter(e => e.window_state === 'open').length;
  const totalAttempts = exams.reduce((s, e) => s + (e.attempt_count || 0), 0);

  return (
    <InstructorShell
      activePage="Exams"
      title="Timed Exams"
      subtitle="Create standalone timed assessments (MCQ / coding) with an availability window and per-attempt countdown"
    >
      <div className={styles.actionRow}>
        <button type="button" className={styles.primaryBtn} onClick={() => router.push('/instructor/exams/new')}>
          <Plus size={16} strokeWidth={2.2} /> New Exam
        </button>
      </div>

      {toast && (
        <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', padding: '11px 16px', borderRadius: 12, marginBottom: 18, color: '#6d28d9', fontSize: 13.5, fontWeight: 600 }}>
          {toast}
        </div>
      )}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: 12, marginBottom: 18, color: '#b91c1c', fontSize: 13.5, fontWeight: 600 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#6b7280', fontSize: 13.5, padding: '24px 4px' }}>
          <Loader2 size={18} className="spin" /> Loading exams…
        </div>
      ) : (
        <>
          <div className={styles.kpiRow}>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Total Exams</p>
              <p className={styles.kpiValue} style={{ color: '#7c3aed' }}>{exams.length}</p>
              <p className={styles.kpiSub}>Across your subjects</p>
            </div>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Published</p>
              <p className={styles.kpiValue} style={{ color: '#059669' }}>{published}</p>
              <p className={styles.kpiSub}>Visible to students</p>
            </div>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Open Now</p>
              <p className={styles.kpiValue} style={{ color: '#b45309' }}>{open}</p>
              <p className={styles.kpiSub}>Inside the window</p>
            </div>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Attempts</p>
              <p className={styles.kpiValue} style={{ color: '#7c3aed' }}>{totalAttempts}</p>
              <p className={styles.kpiSub}>Student submissions</p>
            </div>
          </div>

          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>All Exams</h2>
                <p className={styles.sectionSub}>Publish to make an exam available to enrolled students</p>
              </div>
            </div>

            {exams.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af' }}>
                <ClipboardList size={40} strokeWidth={1.4} style={{ marginBottom: 12, opacity: 0.5 }} />
                <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px', color: '#6b7280' }}>No exams yet</p>
                <p style={{ fontSize: 13, margin: 0 }}>Click “New Exam” to create your first timed assessment.</p>
              </div>
            ) : (
              <div className={styles.list}>
                {exams.map(e => {
                  const tm = TYPE_META[e.exam_type] || TYPE_META.mcq;
                  const TypeIcon = tm.Icon;
                  const stateBadge =
                    e.window_state === 'open' ? styles.greenBadge
                      : e.window_state === 'upcoming' ? styles.blueBadge
                        : styles.slateBadge;
                  return (
                    <div key={e.id} className={styles.listRow}>
                      <div className={styles.rowIcon}>
                        <TypeIcon size={19} strokeWidth={1.9} />
                      </div>
                      <div className={styles.rowBody}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                          <p className={styles.rowTitle} style={{ margin: 0 }}>{e.title}</p>
                          <span className={`${styles.badge} ${tm.cls}`}><TypeIcon size={11} /> {tm.label}</span>
                          {e.is_published
                            ? <span className={`${styles.badge} ${styles.greenBadge}`}><Eye size={11} /> Published</span>
                            : <span className={`${styles.badge} ${styles.slateBadge}`}><EyeOff size={11} /> Draft</span>}
                          <span className={`${styles.badge} ${stateBadge}`}>
                            <CalendarClock size={11} /> {e.window_state}
                          </span>
                        </div>
                        <p className={styles.rowMeta}>
                          {e.subject_name || 'Subject'} · {e.question_count} question{e.question_count === 1 ? '' : 's'} · {e.attempt_count || 0} attempt{(e.attempt_count || 0) === 1 ? '' : 's'}
                        </p>
                        <p className={styles.rowSub}>
                          <Clock size={11} style={{ verticalAlign: -1 }} /> {e.duration_minutes} min · pass {e.pass_threshold}% · max {e.max_attempts} attempt{e.max_attempts === 1 ? '' : 's'}
                          {' · '}Window: {fmtDateTime(e.available_from)} → {fmtDateTime(e.due_at)}
                        </p>
                      </div>
                      <div className={styles.rowSide}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button" className={styles.rowAction} onClick={() => togglePublish(e)} disabled={busyId === e.id}
                            title={e.is_published ? 'Unpublish' : 'Publish'}>
                            {e.is_published ? <EyeOff size={15} /> : <Eye size={15} />}
                            {e.is_published ? 'Unpublish' : 'Publish'}
                          </button>
                          <button type="button" className={styles.rowAction} onClick={() => router.push(`/instructor/exams/${e.id}/edit`)}>
                            <Pencil size={15} /> Edit
                          </button>
                          <button type="button" className={styles.rowAction} onClick={() => router.push(`/instructor/exams/${e.id}/edit?tab=results`)}>
                            <BarChart3 size={15} /> Results
                          </button>
                          <button type="button" className={styles.rowAction} style={{ color: '#b91c1c', borderColor: 'rgba(239,68,68,.2)', background: 'rgba(254,242,242,.7)' }}
                            onClick={() => removeExam(e)} disabled={busyId === e.id}>
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </InstructorShell>
  );
}
