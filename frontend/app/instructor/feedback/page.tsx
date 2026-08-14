'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Star, Loader2 } from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import styles from '../shared.module.css';
import { sessionService } from '@/services/session.service';
import { instructorService, SessionFeedbackData } from '@/services/instructor.service';

interface SessionOption {
  id: string;
  experiment_title: string;
  section_name?: string | null;
  subject_name?: string | null;
  scheduled_at?: string | null;
  status?: string;
}

const fmt = (v: number | null | undefined) =>
  v == null ? '—' : v.toFixed(2);

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function FeedbackPage() {
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [sessionId, setSessionId] = useState<string>('');
  const [data, setData] = useState<SessionFeedbackData | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFeedback = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await instructorService.getSessionFeedback(id);
      setData(res);
    } catch {
      setError('Could not load feedback for this session.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await sessionService.list();
        const list: SessionOption[] = res.sessions || [];
        setSessions(list);
        if (list.length > 0) {
          setSessionId(list[0].id);
          await loadFeedback(list[0].id);
        }
      } catch {
        setError('Could not load sessions.');
      } finally {
        setLoadingSessions(false);
      }
    })();
  }, [loadFeedback]);

  const handleSelect = (id: string) => {
    setSessionId(id);
    loadFeedback(id);
  };

  const avgs = data?.averages;
  const comments = data?.feedback.filter((f) => f.comment) ?? [];

  return (
    <InstructorShell
      activePage="Feedback"
      title="Student Feedback & Lab Sentiment"
      subtitle="Anonymous post-session ratings submitted by students on lab completion"
    >
      {/* Session Picker */}
      <div className={styles.actionRow}>
        <div className={styles.formGroup} style={{ marginBottom: 0, minWidth: 'min(380px, 100%)', flex: 1 }}>
          <label className={styles.formLabel}>Session</label>
          <select
            className={styles.select}
            value={sessionId}
            onChange={(e) => handleSelect(e.target.value)}
            disabled={loadingSessions}
          >
            {loadingSessions && <option>Loading sessions…</option>}
            {!loadingSessions && sessions.length === 0 && <option>No sessions yet</option>}
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.experiment_title}
                {s.section_name ? ` · ${s.section_name}` : ''} · {fmtDate(s.scheduled_at)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: '12px', marginBottom: '20px', color: '#b91c1c', fontSize: '13.5px', fontWeight: 600 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#6b7280', fontSize: '13.5px', padding: '24px 4px' }}>
          <Loader2 size={18} className="spin" /> Loading feedback…
        </div>
      ) : data ? (
        <>
          {/* KPI Cards */}
          <div className={styles.kpiRow}>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Overall Rating</p>
              <p className={styles.kpiValue} style={{ color: '#7c3aed' }}>{fmt(avgs?.overall_rating)}</p>
              <p className={styles.kpiSub}>Out of 5.0 · {data.total} response{data.total === 1 ? '' : 's'}</p>
            </div>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Experiment Clarity</p>
              <p className={styles.kpiValue} style={{ color: '#16a34a' }}>{fmt(avgs?.experiment_clarity)}</p>
              <p className={styles.kpiSub}>Instructions & lab content</p>
            </div>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Session Pacing</p>
              <p className={styles.kpiValue} style={{ color: '#b45309' }}>{fmt(avgs?.session_pacing)}</p>
              <p className={styles.kpiSub}>Duration & difficulty pace</p>
            </div>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>AI Hint Helpfulness</p>
              <p className={styles.kpiValue} style={{ color: '#7c3aed' }}>{fmt(avgs?.ai_hint_helpfulness)}</p>
              <p className={styles.kpiSub}>Guided hint quality</p>
            </div>
          </div>

          {/* Feedback Stream */}
          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Anonymous Feedback Stream</h2>
                <p className={styles.sectionSub}>
                  {comments.length > 0
                    ? `${comments.length} written comment${comments.length === 1 ? '' : 's'} · identities hidden by design`
                    : 'No written comments submitted for this session'}
                </p>
              </div>
            </div>

            {comments.length === 0 ? (
              <p style={{ color: '#9ca3af', fontSize: '13.5px', margin: 0 }}>
                Students can submit ratings without a comment — comments will appear here once provided.
              </p>
            ) : (
              <div className={styles.list}>
                {comments.map((item) => (
                  <div key={item.id} className={styles.listRow}>
                    <div className={styles.rowIcon}>
                      <MessageSquare size={20} />
                    </div>
                    <div className={styles.rowBody}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <p className={styles.rowTitle}>Anonymous Student</p>
                        {(item.overall_rating != null) && (
                          <span className={`${styles.badge} ${item.overall_rating >= 4 ? styles.greenBadge : item.overall_rating >= 3 ? styles.amberBadge : styles.redBadge}`}>
                            <Star size={11} /> {item.overall_rating}/5
                          </span>
                        )}
                      </div>
                      <p className={styles.rowSub}>“{item.comment}”</p>
                    </div>
                    <span className={styles.rowMeta}>{fmtDate(item.submitted_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : !loadingSessions && sessions.length === 0 ? (
        <section className={styles.sectionCard}>
          <p style={{ color: '#6b7280', fontSize: '13.5px', margin: 0 }}>
            No lab sessions found. Schedule and run a session first — feedback becomes available once students submit it.
          </p>
        </section>
      ) : null}
    </InstructorShell>
  );
}
