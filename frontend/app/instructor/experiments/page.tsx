'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  FlaskConical, Plus, Pencil, Trash2, CheckCircle2, EyeOff,
  Tag, Gauge, Sparkles, Lock, MessageSquare, BookOpen, ArrowLeft,
  Layers, ChevronRight,
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import { experimentService } from '@/services/experiment.service';
import { sessionService } from '@/services/session.service';
import styles from '../shared.module.css';
import s from './experiments.module.css';

// ── Types ──────────────────────────────────────────────────────────────────────

interface SectionSubject {
  id: string;
  subject_id: string;
  subject_name: string;
  section_name?: string;
  section_id?: string;
  experiment_count?: number;
}

interface ExpRow {
  id: string;
  exp_number: number;
  title: string;
  aim: string | null;
  difficulty_level: number;
  concept_tags: string[];
  allowed_languages: string[];
  enable_viva: boolean;
  enable_lockdown: boolean;
  is_published: boolean;
  rubric: { test_cases: number; lab_report: number; code_quality: number; viva: number; sum: number };
}

const DIFF_LABEL: Record<number, string> = { 1: 'Intro', 2: 'Intermediate', 3: 'Advanced', 4: 'Expert' };

// ── Subject card grid ──────────────────────────────────────────────────────────

function SubjectGrid({
  subjects,
  onSelect,
  onNewExperiment,
}: {
  subjects: SectionSubject[];
  onSelect: (s: SectionSubject) => void;
  onNewExperiment: () => void;
}) {
  return (
    <>
      <div className={styles.actionRow}>
        <span className={styles.sectionSub}>
          {subjects.length} subject{subjects.length === 1 ? '' : 's'} assigned
        </span>
        <button className={styles.primaryBtn} onClick={onNewExperiment}>
          <Plus size={14} /> New Experiment
        </button>
      </div>

      {subjects.length === 0 ? (
        <div className={styles.sectionCard} style={{ textAlign: 'center', padding: '40px 0' }}>
          <Layers size={32} color="#d8b4fe" style={{ marginBottom: 10 }} />
          <p className={styles.sectionSub}>No subjects assigned yet. Contact your administrator.</p>
        </div>
      ) : (
        <div className={s.subjectGrid}>
          {subjects.map((sub, idx) => (
            <button
              key={sub.id ? `${sub.id}-${idx}` : `sub-${sub.subject_id}-${idx}`}
              className={s.subjectCard}
              onClick={() => onSelect(sub)}
            >
              <div className={s.subjectCardIcon}>
                <BookOpen size={22} color="#7c3aed" />
              </div>
              <div className={s.subjectCardBody}>
                <p className={s.subjectCardTitle}>{sub.subject_name}</p>
                {sub.section_name && (
                  <p className={s.subjectCardMeta}>{sub.section_name}</p>
                )}
                {sub.experiment_count != null && (
                  <p className={s.subjectCardCount}>
                    {sub.experiment_count} experiment{sub.experiment_count === 1 ? '' : 's'}
                  </p>
                )}
              </div>
              <ChevronRight size={16} className={s.subjectCardArrow} />
            </button>
          ))}
        </div>
      )}

      <p className={styles.sectionSub} style={{ marginTop: 16, display: 'flex', gap: 6, alignItems: 'center' }}>
        <Sparkles size={13} color="#7c3aed" />
        Select a subject to view and manage its experiments.
      </p>
    </>
  );
}

// ── Experiment list for a subject ──────────────────────────────────────────────

function ExperimentList({
  subject,
  onBack,
  router,
}: {
  subject: SectionSubject;
  onBack: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [experiments, setExperiments] = useState<ExpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const toast3 = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const exps = await experimentService.listMine(subject.subject_id);
      setExperiments(exps as ExpRow[]);
    } catch {
      setExperiments([]);
    } finally {
      setLoading(false);
    }
  }, [subject.subject_id]);

  useEffect(() => { load(); }, [load]);

  const togglePublish = async (exp: ExpRow) => {
    setBusyId(exp.id);
    try {
      await experimentService.setPublished(exp.id, !exp.is_published);
      toast3(exp.is_published ? 'Experiment unpublished.' : 'Experiment published — students can now see it.');
      load();
    } catch {
      toast3('Failed to change publish state.');
    } finally {
      setBusyId(null);
    }
  };

  const removeExperiment = async (exp: ExpRow) => {
    if (!window.confirm(`Delete "${exp.title}"? Its content will also be removed.`)) return;
    setBusyId(exp.id);
    try {
      await experimentService.delete(exp.id);
      toast3('Experiment deleted.');
      load();
    } catch {
      toast3('Failed to delete experiment.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 300, background: '#111827', color: '#fff', padding: '12px 20px', borderRadius: 12, fontSize: 14, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>{toast}</div>}

      <div className={styles.actionRow}>
        <button className={styles.ghostBtn} onClick={onBack}>
          <ArrowLeft size={13} /> Subjects
        </button>
        <button className={styles.primaryBtn} onClick={() => router.push(`/instructor/experiments/new?subject_id=${subject.subject_id}`)}>
          <Plus size={14} /> New Experiment
        </button>
      </div>

      {/* Subject header */}
      <div className={s.subjectHeader}>
        <div className={s.subjectHeaderIcon}>
          <BookOpen size={18} color="#7c3aed" />
        </div>
        <div>
          <p className={s.subjectHeaderTitle}>{subject.subject_name}</p>
          {subject.section_name && <p className={s.subjectHeaderSub}>{subject.section_name}</p>}
        </div>
        <span className={s.subjectHeaderCount}>
          {loading ? '…' : experiments.length} experiment{experiments.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className={styles.sectionCard}>
        {loading ? (
          <p className={styles.sectionSub}>Loading experiments…</p>
        ) : experiments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <FlaskConical size={30} color="#d8b4fe" style={{ marginBottom: 8 }} />
            <p className={styles.sectionSub}>No experiments in this subject yet.</p>
          </div>
        ) : (
          <div className={styles.list}>
            {experiments.map(exp => (
              <div key={exp.id} className={styles.listRow} style={{ padding: '16px 20px', justifyContent: 'space-between' }}>
                <div className={styles.rowIcon} style={{ background: exp.is_published ? '#ecfdf5' : '#fef3c7' }}>
                  <FlaskConical size={18} color={exp.is_published ? '#059669' : '#b45309'} />
                </div>
                <div className={styles.rowBody} style={{ flex: 1, paddingRight: 16 }}>
                  <p className={styles.rowTitle} style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
                    #{exp.exp_number} — {exp.title}
                  </p>
                  {exp.aim && (
                    <p className={styles.rowSub} style={{ fontSize: 13, color: '#4b5563', marginBottom: 6 }}>
                      {exp.aim}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                    <span className={styles.rowMeta} style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>
                      <Gauge size={12} style={{ display: 'inline', marginRight: 4 }} />
                      {DIFF_LABEL[exp.difficulty_level] ?? `Level ${exp.difficulty_level}`}
                    </span>
                    {(exp.allowed_languages ?? []).length > 0 && (
                      <span className={styles.rowMeta} style={{ fontSize: 12, color: '#6b7280' }}>
                        · {exp.allowed_languages.join(', ')}
                      </span>
                    )}
                    {exp.enable_viva && (
                      <span className={styles.rowMeta} style={{ fontSize: 12, color: '#6b7280' }}>
                        · <MessageSquare size={12} style={{ display: 'inline', marginRight: 2 }} /> viva
                      </span>
                    )}
                    {exp.enable_lockdown && (
                      <span className={styles.rowMeta} style={{ fontSize: 12, color: '#6b7280' }}>
                        · <Lock size={12} style={{ display: 'inline', marginRight: 2 }} /> lockdown
                      </span>
                    )}
                  </div>
                  {exp.concept_tags && exp.concept_tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      {exp.concept_tags.map(tag => (
                        <span key={tag} style={{ fontSize: 11, fontWeight: 600, background: '#f3e8ff', color: '#7c3aed', padding: '2px 8px', borderRadius: 6 }}>
                          <Tag size={10} style={{ display: 'inline', marginRight: 3 }} />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span className={`${styles.pill} ${exp.is_published ? styles.pillGreen : styles.pillAmber}`}>
                    {exp.is_published
                      ? <CheckCircle2 size={11} style={{ display: 'inline', marginRight: 4 }} />
                      : <EyeOff size={11} style={{ display: 'inline', marginRight: 4 }} />}
                    {exp.is_published ? 'Published' : 'Draft'}
                  </span>
                  <button className={styles.ghostBtn} disabled={busyId === exp.id}
                    onClick={() => router.push(`/instructor/experiments/${exp.id}/edit`)}>
                    <Pencil size={13} /> Manage
                  </button>
                  <button className={styles.secondaryBtn} disabled={busyId === exp.id}
                    onClick={() => togglePublish(exp)}>
                    {exp.is_published ? 'Unpublish' : 'Publish'}
                  </button>
                  <button className={styles.ghostBtn} disabled={busyId === exp.id}
                    onClick={() => removeExperiment(exp)} title="Delete experiment">
                    <Trash2 size={13} color="#ef4444" />
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

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ExperimentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [subjects, setSubjects] = useState<SectionSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<SectionSubject | null>(null);

  // Load section-subjects on mount
  useEffect(() => {
    sessionService.getSectionSubjects()
      .then(d => setSubjects(d.section_subjects ?? []))
      .catch(() => setSubjects([]))
      .finally(() => setLoading(false));
  }, []);

  // Respect ?subject_id= in the URL (deep-link / back-button)
  useEffect(() => {
    const sid = searchParams.get('subject_id');
    if (sid && subjects.length > 0) {
      const match = subjects.find(s => s.subject_id === sid || s.id === sid);
      if (match && selectedSubject?.id !== match.id) {
        setSelectedSubject(match);
      }
    }
  }, [searchParams, subjects, selectedSubject]);

  const handleSelectSubject = (sub: SectionSubject) => {
    setSelectedSubject(sub);
    // Update URL without navigation flash
    const url = new URL(window.location.href);
    url.searchParams.set('subject_id', sub.subject_id);
    window.history.pushState({}, '', url.toString());
  };

  const handleBack = () => {
    setSelectedSubject(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('subject_id');
    window.history.pushState({}, '', url.toString());
  };

  const subtitle = selectedSubject
    ? `Experiments in ${selectedSubject.subject_name}`
    : 'Select a subject to view and manage its experiments.';

  return (
    <InstructorShell activePage="Experiments" title="Experiments" subtitle={subtitle}>
      {loading ? (
        <p className={styles.sectionSub}>Loading…</p>
      ) : selectedSubject ? (
        <ExperimentList subject={selectedSubject} onBack={handleBack} router={router} />
      ) : (
        <SubjectGrid
          subjects={subjects}
          onSelect={handleSelectSubject}
          onNewExperiment={() => router.push('/instructor/experiments/new')}
        />
      )}
    </InstructorShell>
  );
}
