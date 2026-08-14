'use client';

import { useEffect, useState } from 'react';
import StudentShell from '@/components/layout/StudentShell';
import { studentService } from '@/services/student.service';
import { Loader2 } from 'lucide-react';
import styles from './page.module.css';

interface HistoryRow {
  experiment_id: string;
  experiment_title: string;
  concept_tags: string[];
  last_attempt: string | null;
  total_attempts: number;
  best_tests_passed: number | null;
  tests_total: number | null;
  grade: number | null;
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export default function SubmissionsPage() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    studentService.getHistory()
      .then(h => setRows((h as HistoryRow[]).sort((a, b) =>
        (b.last_attempt || '').localeCompare(a.last_attempt || ''))))
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load submissions'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <StudentShell activePage="Submission" title="My Submissions" subtitle="Track your experiment submissions, grades and feedback">
        <div className={styles.loadingBox}><Loader2 size={20} className={styles.spinner} /> Loading submissions…</div>
      </StudentShell>
    );
  }

  const graded = rows.filter(r => r.grade != null);
  const avg = graded.length > 0
    ? Math.round(graded.reduce((a, b) => a + (b.grade || 0), 0) / graded.length)
    : 0;

  return (
    <StudentShell activePage="Submission" title="My Submissions" subtitle="Track your experiment submissions, grades and feedback">
      {error && <div className={styles.errorBox}>⚠️ {error}</div>}

      {/* Summary Row */}
      <div className={styles.summaryRow}>
        {[
          { label: 'Experiments Attempted', value: rows.length, color: '#9333ea' },
          { label: 'Graded',                value: graded.length, color: '#22c55e' },
          { label: 'Awaiting Grade',        value: rows.length - graded.length, color: '#f59e0b' },
          { label: 'Average Grade',         value: graded.length > 0 ? `${avg}%` : '—', color: '#ec4899' },
        ].map(s => (
          <div key={s.label} className={styles.summaryCard}>
            <p className={styles.summaryLabel}>{s.label}</p>
            <p className={styles.summaryValue} style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Submissions List */}
      {rows.length === 0 && !error ? (
        <div className={styles.loadingBox}>No submissions yet — run code in a live lab or catch-up session to see it here.</div>
      ) : (
        <div className={styles.subList}>
          {rows.map(s => (
            <div key={s.experiment_id} className={styles.subCard}>
              <div className={styles.subTop}>
                <div>
                  <p className={styles.subId}>{s.total_attempts} attempt{s.total_attempts === 1 ? '' : 's'} · Last: {fmtDate(s.last_attempt)}</p>
                  <h3 className={styles.subTitle}>{s.experiment_title}</h3>
                  <p className={styles.subDate}>
                    Best test run: {s.best_tests_passed != null && s.tests_total
                      ? `${s.best_tests_passed}/${s.tests_total} test cases passed`
                      : '—'}
                  </p>
                </div>
                <div className={styles.subRight}>
                  {s.grade != null ? (
                    <div className={styles.scoreCircle} style={{ background: s.grade >= 90 ? 'linear-gradient(135deg,#22c55e,#16a34a)' : s.grade >= 75 ? 'linear-gradient(135deg,#9333ea,#7c3aed)' : 'linear-gradient(135deg,#f59e0b,#f2994a)' }}>
                      {Math.round(s.grade)}
                    </div>
                  ) : (
                    <div className={styles.pendingBadge}>⏳ Pending</div>
                  )}
                </div>
              </div>

              {s.concept_tags && s.concept_tags.length > 0 && (
                <div className={styles.subFooter}>
                  {s.concept_tags.map(t => (
                    <span key={t} className={styles.fileTag}>🏷 {t}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </StudentShell>
  );
}
