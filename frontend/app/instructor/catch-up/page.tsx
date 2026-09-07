'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw, Video, FileText, Clock, Loader2 } from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import styles from '../shared.module.css';
import { instructorService, CatchupOverview } from '@/services/instructor.service';

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function CatchUpPage() {
  const router = useRouter();
  const [data, setData] = useState<CatchupOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await instructorService.getCatchups();
        setData(res);
      } catch {
        setError('Could not load catch-up overview.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const enabled = data?.enabled_sessions ?? [];
  const active = enabled.filter((s) => !s.expired);
  const attempts = data?.attempts ?? [];

  return (
    <InstructorShell
      activePage="Catch-Up Reviews"
      title="Catch-Up & Late Submission Review"
      subtitle="Sessions with catch-up enabled, their deadlines, and student catch-up attempts"
    >
      {/* Action Row */}
      <div className={styles.actionRow}>
        <button type="button" className={styles.primaryBtn} onClick={() => router.push('/instructor/experiments')}>
          <Video size={16} strokeWidth={2} /> Manage Experiment Content
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={() => router.push('/instructor/grading')}>
          <FileText size={16} strokeWidth={1.9} /> Review Catch-Up Submissions
        </button>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: '12px', marginBottom: '20px', color: '#b91c1c', fontSize: '13.5px', fontWeight: 600 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#6b7280', fontSize: '13.5px', padding: '24px 4px' }}>
          <Loader2 size={18} className="spin" /> Loading catch-up overview…
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className={styles.kpiRow}>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Catch-Up Enabled Sessions</p>
              <p className={styles.kpiValue} style={{ color: '#7c3aed' }}>{enabled.length}</p>
              <p className={styles.kpiSub}>Across your sections</p>
            </div>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Windows Still Open</p>
              <p className={styles.kpiValue} style={{ color: '#16a34a' }}>{active.length}</p>
              <p className={styles.kpiSub}>Before deadline passes</p>
            </div>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Expired Windows</p>
              <p className={styles.kpiValue} style={{ color: '#b45309' }}>{enabled.length - active.length}</p>
              <p className={styles.kpiSub}>Deadline passed</p>
            </div>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Catch-Up Attempts</p>
              <p className={styles.kpiValue} style={{ color: '#7c3aed' }}>{attempts.length}</p>
              <p className={styles.kpiSub}>Students joined late</p>
            </div>
          </div>

          {/* Enabled Sessions */}
          <section className={styles.sectionCard} style={{ marginBottom: '20px' }}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Sessions With Catch-Up Enabled</h2>
                <p className={styles.sectionSub}>Students who missed the live session can join until the deadline</p>
              </div>
            </div>

            {enabled.length === 0 ? (
              <p style={{ color: '#9ca3af', fontSize: '13.5px', margin: 0 }}>
                No sessions have catch-up enabled. Enable it in the schedule wizard when creating a session.
              </p>
            ) : (
              <div className={styles.list}>
                {enabled.map((s) => (
                  <div key={s.session_id} className={styles.listRow}>
                    <div className={styles.rowIcon} style={{ background: s.expired ? '#fef3c7' : '#dcfce7', color: s.expired ? '#b45309' : '#166534' }}>
                      <RotateCcw size={20} strokeWidth={1.9} />
                    </div>
                    <div className={styles.rowBody}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <p className={styles.rowTitle}>{s.experiment}</p>
                        <span className={`${styles.badge} ${s.expired ? styles.amberBadge : styles.greenBadge}`}>
                          {s.expired ? 'Window Closed' : 'Window Open'}
                        </span>
                      </div>
                      <p className={styles.rowMeta}>
                        Scheduled: {fmtDate(s.scheduled_at)} · Deadline: {fmtDate(s.catchup_deadline)}
                      </p>
                      <p className={styles.rowSub}>{s.attempts} catch-up attempt{s.attempts === 1 ? '' : 's'} recorded</p>
                    </div>
                    <div className={styles.rowSide}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={14} /> {s.expired ? 'Expired' : 'Active'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Attempts Table */}
          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Catch-Up Attempts</h2>
                <p className={styles.sectionSub}>Students who joined sessions after the live window</p>
              </div>
            </div>

            {attempts.length === 0 ? (
              <p style={{ color: '#9ca3af', fontSize: '13.5px', margin: 0 }}>No catch-up attempts recorded yet.</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Roll No.</th>
                    <th>Experiment</th>
                    <th>Status</th>
                    <th>Started</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.map((a, i) => (
                    <tr key={`${a.student_id}-${a.session_id}-${i}`}>
                      <td><span className={styles.tdStrong}>{a.full_name}</span></td>
                      <td>{a.roll_number || '—'}</td>
                      <td>{a.experiment}</td>
                      <td>
                        <span className={`${styles.badge} ${a.status === 'completed' ? styles.greenBadge : a.status === 'active' ? styles.blueBadge : styles.slateBadge}`}>
                          {a.status}
                        </span>
                      </td>
                      <td>{fmtDate(a.started_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </InstructorShell>
  );
}
