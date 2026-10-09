'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Award, Loader2, X, Sparkles } from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import styles from '../shared.module.css';
import { instructorService, VivaListItem, VivaDetail } from '@/services/instructor.service';

type StatusFilter = 'all' | 'pending' | 'active' | 'completed';

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const statusBadge = (status: string) => {
  switch (status) {
    case 'completed': return styles.greenBadge;
    case 'active': return styles.blueBadge;
    default: return styles.amberBadge;
  }
};

export default function VivaPage() {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [error, setError] = useState<string | null>(null);

  const [detail, setDetail] = useState<VivaDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const { data: vivas = [], isLoading: loading, error: fetchError } = useQuery({
    queryKey: ['instructor', 'vivas', { filter }],
    queryFn: () => instructorService.listVivas(filter === 'all' ? undefined : filter),
    staleTime: 30 * 1000,
  });

  const loadVivas = useCallback((status: StatusFilter) => {
    setFilter(status);
  }, []);

  useEffect(() => {
    if (fetchError) setError('Could not load viva sessions.');
  }, [fetchError]);

  const openDetail = async (vivaId: string) => {
    setLoadingDetail(true);
    try {
      const res = await instructorService.getVivaDetail(vivaId);
      setDetail(res);
    } catch {
      setError('Could not load viva detail.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleFilter = (f: StatusFilter) => {
    setFilter(f);
  };

  const completed = vivas.filter((v) => v.status === 'completed').length;
  const avgScore = (() => {
    const scored = vivas.filter((v) => v.total_score != null);
    if (scored.length === 0) return null;
    return scored.reduce((sum, v) => sum + (v.total_score ?? 0), 0) / scored.length;
  })();

  return (
    <InstructorShell
      activePage="Viva"
      title="AI Viva Assistant & Oral Evaluation"
      subtitle="Review AI-generated viva sessions, student answers, and scores for your experiments"
    >
      {/* KPI Cards */}
      <div className={styles.kpiRow}>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Total Viva Sessions</p>
          <p className={styles.kpiValue} style={{ color: '#7c3aed' }}>{vivas.length}</p>
          <p className={styles.kpiSub}>Across your experiments</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Completed</p>
          <p className={styles.kpiValue} style={{ color: '#16a34a' }}>{completed}</p>
          <p className={styles.kpiSub}>Scored & closed</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>In Progress / Pending</p>
          <p className={styles.kpiValue} style={{ color: '#b45309' }}>{vivas.length - completed}</p>
          <p className={styles.kpiSub}>Awaiting completion</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Average Score</p>
          <p className={styles.kpiValue} style={{ color: '#7c3aed' }}>{avgScore == null ? '—' : avgScore.toFixed(1)}</p>
          <p className={styles.kpiSub}>Across completed vivas</p>
        </div>
      </div>

      {/* Status Filter */}
      <div className={styles.tabRow}>
        {(['all', 'pending', 'active', 'completed'] as StatusFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            className={`${styles.tabChip} ${filter === f ? styles.tabChipActive : ''}`}
            onClick={() => handleFilter(f)}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: '12px', marginBottom: '20px', color: '#b91c1c', fontSize: '13.5px', fontWeight: 600 }}>
          {error}
        </div>
      )}

      {/* Vivas Table */}
      <section className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Viva Sessions</h2>
            <p className={styles.sectionSub}>Students take AI-generated vivas after final submission</p>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#6b7280', fontSize: '13.5px', padding: '12px 4px' }}>
            <Loader2 size={18} className="spin" /> Loading viva sessions…
          </div>
        ) : vivas.length === 0 ? (
          <p style={{ color: '#9ca3af', fontSize: '13.5px', margin: 0 }}>
            No viva sessions {filter !== 'all' ? `with status “${filter}”` : 'yet'} — vivas appear here once students start them.
          </p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Student</th>
                <th>Experiment</th>
                <th>Questions</th>
                <th>Score</th>
                <th>Status</th>
                <th>Completed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {vivas.map((v) => (
                <tr key={v.id}>
                  <td>
                    <span className={styles.tdStrong}>{v.full_name}</span>
                    {v.roll_number && <span style={{ color: '#9ca3af', fontSize: '12px' }}> · {v.roll_number}</span>}
                  </td>
                  <td>{v.experiment}</td>
                  <td>{v.question_count}</td>
                  <td>
                    {v.total_score != null ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 700, color: '#111827' }}>
                        <Award size={14} style={{ color: '#7c3aed' }} /> {v.total_score}
                      </span>
                    ) : '—'}
                  </td>
                  <td>
                    <span className={`${styles.badge} ${statusBadge(v.status)}`}>{v.status}</span>
                  </td>
                  <td>{fmtDate(v.completed_at)}</td>
                  <td>
                    <button
                      type="button"
                      className={styles.ghostBtn}
                      style={{ minHeight: '30px', padding: '0 10px', fontSize: '11.5px' }}
                      onClick={() => openDetail(v.id)}
                      disabled={loadingDetail}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Detail Modal */}
      {detail && (
        <div className={styles.modalOverlay} onClick={() => setDetail(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                Viva — {detail.viva.full_name}
              </h3>
              <button type="button" className={styles.closeBtn} onClick={() => setDetail(null)}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <span className={`${styles.badge} ${statusBadge(detail.viva.status)}`}>{detail.viva.status}</span>
              {detail.viva.total_score != null && (
                <span className={`${styles.badge} ${styles.blueBadge}`}>
                  <Award size={11} /> Score: {detail.viva.total_score}
                </span>
              )}
              <span className={`${styles.badge} ${styles.slateBadge}`}>{detail.viva.experiment}</span>
            </div>

            {detail.answers.length === 0 ? (
              <p style={{ color: '#9ca3af', fontSize: '13.5px' }}>No answers submitted yet.</p>
            ) : (
              <div className={styles.list}>
                {detail.answers.map((a) => (
                  <div key={a.question_index} className={styles.listRow} style={{ alignItems: 'flex-start' }}>
                    <div className={styles.rowIcon}>
                      <Sparkles size={18} />
                    </div>
                    <div className={styles.rowBody}>
                      <p className={styles.rowTitle}>Q{a.question_index + 1}. {a.question_text}</p>
                      <p className={styles.rowMeta} style={{ marginTop: '4px' }}>“{a.answer_text}”</p>
                      {a.ai_feedback && (
                        <p className={styles.rowSub} style={{ marginTop: '4px' }}>AI feedback: {a.ai_feedback}</p>
                      )}
                    </div>
                    <span className={`${styles.badge} ${a.score != null && a.score >= 3 ? styles.greenBadge : styles.amberBadge}`}>
                      {a.score != null ? `${a.score}/5` : 'unscored'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </InstructorShell>
  );
}
