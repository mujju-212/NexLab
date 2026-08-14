'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import StudentShell from '@/components/layout/StudentShell';
import { studentService } from '@/services/student.service';
import type { SectionSubject, Experiment } from '@/types';
import { Loader2 } from 'lucide-react';
import styles from './page.module.css';

const SUBJECT_COLORS = [
  'linear-gradient(135deg,#9333ea,#7c3aed)',
  'linear-gradient(135deg,#d946ef,#0284c7)',
  'linear-gradient(135deg,#f59e0b,#f2994a)',
  'linear-gradient(135deg,#ec4899,#d6409f)',
  'linear-gradient(135deg,#22c55e,#16a34a)',
];

export default function SubjectsPage() {
  const router = useRouter();
  const [subjects, setSubjects] = useState<SectionSubject[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [experiments, setExperiments] = useState<Record<string, Experiment[]>>({});
  const [loadingExps, setLoadingExps] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    studentService.getSubjects()
      .then(list => { setSubjects(list); if (list.length) setExpanded(list[0].section_subject_id); })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load subjects'))
      .finally(() => setLoading(false));
  }, []);

  // Lazy-load experiments when a subject card is expanded
  useEffect(() => {
    if (!expanded || experiments[expanded]) return;
    const sub = subjects.find(s => s.section_subject_id === expanded);
    if (!sub) return;
    setLoadingExps(m => ({ ...m, [expanded]: true }));
    studentService.getExperiments(sub.subject_id)
      .then(exps => setExperiments(m => ({ ...m, [expanded]: exps })))
      .catch(() => setExperiments(m => ({ ...m, [expanded]: [] })))
      .finally(() => setLoadingExps(m => ({ ...m, [expanded]: false })));
  }, [expanded, subjects, experiments]);

  return (
    <StudentShell activePage="My Subjects" title="My Subjects" subtitle="View your enrolled subjects and their experiments">
      {loading && <div className={styles.loadingBox}><Loader2 size={20} className={styles.spinner} /> Loading subjects…</div>}
      {error && <div className={styles.errorBox}>⚠️ {error}</div>}
      {!loading && !error && subjects.length === 0 && (
        <div className={styles.errorBox}>You are not enrolled in any sections yet. Ask your institution admin to assign you to a section.</div>
      )}

      <div className={styles.grid}>
        {subjects.map((sub, idx) => {
          const isOpen = expanded === sub.section_subject_id;
          const exps = experiments[sub.section_subject_id] || [];
          const isLoading = loadingExps[sub.section_subject_id];
          return (
            <div key={sub.section_subject_id} className={`${styles.subCard} ${isOpen ? styles.subCardOpen : ''}`}>
              <div className={styles.subHeader} onClick={() => setExpanded(isOpen ? null : sub.section_subject_id)}>
                <div className={styles.subIcon} style={{ background: SUBJECT_COLORS[idx % SUBJECT_COLORS.length] }}>
                  {sub.subject_name.charAt(0) || '?'}
                </div>
                <div className={styles.subInfo}>
                  <p className={styles.subCode}>{sub.subject_code || '—'}</p>
                  <h3 className={styles.subName}>{sub.subject_name || 'Unnamed Subject'}</h3>
                </div>
                <div className={styles.subRight}>
                  {experiments[sub.section_subject_id] && (
                    <span className={styles.expCount}>{exps.length} experiments</span>
                  )}
                  <span className={styles.chevron}>{isOpen ? '▲' : '▼'}</span>
                </div>
              </div>

              {isOpen && (
                <div className={styles.expList}>
                  <div className={styles.expListHeader}>
                    <span>Experiment</span>
                    <span>Concepts</span>
                    <span>Action</span>
                  </div>
                  {isLoading && <p className={styles.loadingInline}><Loader2 size={14} className={styles.spinner} /> Loading experiments…</p>}
                  {!isLoading && exps.length === 0 && <p className={styles.loadingInline}>No published experiments yet for this subject.</p>}
                  {!isLoading && exps.map(exp => (
                    <div key={exp.id} className={styles.expRow}>
                      <span className={styles.expName}>
                        <span className={styles.expNum}>{exp.exp_number}</span>
                        {exp.title}
                      </span>
                      <span className={styles.expDate}>{exp.concept_tags?.slice(0, 2).join(', ') || '—'}</span>
                      <button className={styles.expBtn} onClick={() => router.push(`/student/pre-lab/${exp.id}`)}>
                        → Open Pre-Lab
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </StudentShell>
  );
}
