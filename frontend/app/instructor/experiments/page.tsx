'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FlaskConical, Plus, Pencil, Trash2, CheckCircle2, EyeOff,
  Tag, Gauge, Sparkles, Lock, MessageSquare
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import { experimentService } from '@/services/experiment.service';
import styles from '../shared.module.css';

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

export default function ExperimentsPage() {
  const router = useRouter();
  const [experiments, setExperiments] = useState<ExpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const toast3 = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(async () => {
    try {
      const exps = await experimentService.listMine();
      setExperiments(exps as ExpRow[]);
    } catch {
      setExperiments([]);
    } finally {
      setLoading(false);
    }
  }, []);

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
    if (!window.confirm(`Delete "${exp.title}"? Its test cases and pre-lab content will also be removed.`)) return;
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
    <InstructorShell activePage="Experiments" title="Experiments"
      subtitle="Create lab experiments, configure rubrics, and publish them to students.">

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 300, background: '#111827', color: '#fff', padding: '12px 20px', borderRadius: 12, fontSize: 14, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>{toast}</div>}

      <div className={styles.actionRow}>
        <span className={styles.sectionSub}>
          {loading ? 'Loading…' : `${experiments.length} experiment${experiments.length === 1 ? '' : 's'}`}
        </span>
        <button className={styles.primaryBtn} onClick={() => router.push('/instructor/experiments/new')}>
          <Plus size={14} /> New Experiment
        </button>
      </div>

      <div className={styles.sectionCard}>
        {loading ? (
          <p className={styles.sectionSub}>Loading experiments…</p>
        ) : experiments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <FlaskConical size={30} color="#c4b5fd" style={{ marginBottom: 8 }} />
            <p className={styles.sectionSub}>No experiments yet. Create your first one.</p>
          </div>
        ) : (
          <div className={styles.list}>
            {experiments.map(exp => (
              <div key={exp.id} className={styles.listRow}>
                <div className={styles.rowIcon} style={{ background: exp.is_published ? '#ecfdf5' : '#fef3c7' }}>
                  <FlaskConical size={16} color={exp.is_published ? '#059669' : '#b45309'} />
                </div>
                <div className={styles.rowBody}>
                  <p className={styles.rowTitle}>#{exp.exp_number} — {exp.title}</p>
                  <p className={styles.rowMeta}>
                    <Gauge size={11} style={{ display: 'inline', marginRight: 3 }} />
                    {DIFF_LABEL[exp.difficulty_level] ?? `Level ${exp.difficulty_level}`}
                    {' · '}
                    {(exp.allowed_languages ?? []).join(', ')}
                    {exp.enable_viva && <> · <MessageSquare size={11} style={{ display: 'inline' }} /> viva</>}
                    {exp.enable_lockdown && <> · <Lock size={11} style={{ display: 'inline' }} /> lockdown</>}
                  </p>
                  <p className={styles.rowSub}>
                    <Tag size={11} style={{ display: 'inline', marginRight: 3 }} />
                    {exp.concept_tags.join(', ')}
                    {' · rubric '}{exp.rubric.test_cases}/{exp.rubric.lab_report}/{exp.rubric.code_quality}/{exp.rubric.viva}
                  </p>
                </div>
                <div className={styles.rowSide}>
                  <span className={`${styles.pill} ${exp.is_published ? styles.pillGreen : styles.pillAmber}`}>
                    {exp.is_published ? <CheckCircle2 size={11} style={{ display: 'inline', marginRight: 4 }} /> :
                      <EyeOff size={11} style={{ display: 'inline', marginRight: 4 }} />}
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

      <p className={styles.sectionSub} style={{ marginTop: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
        <Sparkles size={13} color="#7c3aed" />
        Tip: after creating an experiment, open Manage to add test cases (AI-generated supported), pre-lab content and simulations.
      </p>
    </InstructorShell>
  );
}
