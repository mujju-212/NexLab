'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import StudentShell from '@/components/layout/StudentShell';
import { studentService } from '@/services/student.service';
import type { ContentPage } from '@/services/student.service';
import type { Experiment, ContentModule } from '@/types';
import { Loader2 } from 'lucide-react';
import styles from './page.module.css';

const EXP_COLORS = ['#9333ea', '#f97316', '#22c55e', '#d946ef', '#f59e0b', '#0284c7', '#ec4899'];

interface ExpWithProgress extends Experiment {
  subject_name: string;
  modules: ContentModule[];
}

export default function PreLabListPage() {
  const router = useRouter();
  const [items, setItems] = useState<ExpWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const subjects = await studentService.getSubjects();
        const expLists = await Promise.all(
          subjects.map(async s => {
            const exps = await studentService.getExperiments(s.subject_id).catch(() => [] as Experiment[]);
            return exps.map(e => ({ ...e, subject_name: s.subject_name }));
          })
        );
        const all = expLists.flat();

        // Load module progress for each experiment (small fan-out for a class)
        const withProgress = await Promise.all(
          all.map(async e => {
            const res = await studentService.getPreLabContent(e.id).catch(() => ({ modules: [] as ContentModule[], pages: [] as ContentPage[] }));
            return { ...e, modules: res.modules };
          })
        );
        if (!cancelled) setItems(withProgress);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load pre-labs');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const progressOf = (it: ExpWithProgress) =>
    it.modules.length ? Math.round((it.modules.filter(m => m.completed).length / it.modules.length) * 100) : 0;

  const statusOf = (it: ExpWithProgress) => {
    const pct = progressOf(it);
    if (pct === 100 && it.modules.length > 0) return 'unlocked';
    if (pct > 0) return 'in-progress';
    return 'pending';
  };

  return (
    <StudentShell activePage="Content" title="Lab Content" subtitle="Complete theory, video and quiz modules to unlock your live lab session">
      {loading && <div className={styles.loadingBox}><Loader2 size={20} className={styles.spinner} /> Loading content…</div>}
      {error && <div className={styles.errorBox}>⚠️ {error}</div>}
      {!loading && !error && items.length === 0 && (
        <div className={styles.errorBox}>No published experiments found for your enrolled subjects yet.</div>
      )}

      <div className={styles.listGrid}>
        {items.map((it, idx) => {
          const pct = progressOf(it);
          const status = statusOf(it);
          const color = EXP_COLORS[idx % EXP_COLORS.length];
          return (
            <div key={it.id} className={styles.expCard} onClick={() => router.push(`/student/pre-lab/${it.id}`)} style={{ cursor: 'pointer' }}>
              <div className={styles.expCardTop}>
                <div className={styles.expDot} style={{ background: color }} />
                <span className={`${styles.statusBadge} ${
                  status === 'unlocked' ? styles.badgeGreen :
                  status === 'in-progress' ? styles.badgeBlue : styles.badgeGray}`}>
                  {status === 'unlocked' ? '✓ Completed' : status === 'in-progress' ? '⟳ In Progress' : '○ Not Started'}
                </span>
              </div>
              <p className={styles.expTitle}>{it.title}</p>
              <p className={styles.expMeta}>{it.subject_name} · Exp #{it.exp_number}</p>
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: `${pct}%`, background: color }} />
              </div>
              <p className={styles.progressPct}>{pct}% complete · {it.modules.length} modules</p>

              <div className={styles.stepsRow}>
                {it.modules.slice(0, 8).map((m, i) => (
                  <div key={m.id} className={`${styles.stepDot} ${m.completed ? styles.stepDone : ''}`} title={m.title}>
                    {m.completed ? '✓' : i + 1}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </StudentShell>
  );
}
