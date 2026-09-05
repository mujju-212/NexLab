'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileClock, Loader2, Clock, CalendarClock, HelpCircle, Code2, Layers,
  ChevronRight, CheckCircle2, Timer,
} from 'lucide-react';
import StudentShell from '@/components/layout/StudentShell';
import styles from './exams.module.css';
import { examService, type StudentExamItem } from '@/services/exam.service';
import { useServerCountdown } from '@/lib/countdown';

const fmtDateTime = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });
};

const TYPE_META: Record<string, { label: string; Icon: typeof HelpCircle }> = {
  mcq: { label: 'MCQ', Icon: HelpCircle },
  coding: { label: 'Coding', Icon: Code2 },
  mixed: { label: 'Mixed', Icon: Layers },
};

/** Live countdown chip — server-time based to avoid client clock skew. */
function CountdownChip({ target, serverNow, prefix }: { target: string | null; serverNow: string; prefix: string }) {
  const cd = useServerCountdown(target, serverNow);
  if (!target) return null;
  if (cd.expired) return <span className={`${styles.badge} ${styles.slateBadge}`}><Timer size={11} /> {prefix} elapsed</span>;
  return (
    <span className={`${styles.badge} ${cd.warn ? styles.amberBadge : styles.blueBadge}`}>
      <Timer size={11} /> {prefix} {cd.label}
    </span>
  );
}

type Tab = 'open' | 'upcoming' | 'closed' | 'results';

export default function StudentExamsPage() {
  const router = useRouter();
  const [exams, setExams] = useState<StudentExamItem[]>([]);
  const [serverNow, setServerNow] = useState<string>(new Date().toISOString());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('open');

  useEffect(() => {
    examService.listMyExams()
      .then(res => { setExams(res.exams); setServerNow(res.server_now); })
      .catch(() => setError('Could not load your exams.'))
      .finally(() => setLoading(false));
  }, []);

  const buckets = useMemo(() => ({
    open: exams.filter(e => e.window_state === 'open'),
    upcoming: exams.filter(e => e.window_state === 'upcoming'),
    closed: exams.filter(e => e.window_state === 'closed'),
    results: exams.filter(e => e.best_score != null || e.latest_status === 'submitted' || e.latest_status === 'expired'),
  }), [exams]);

  // If there are no open exams on first load, fall back to the most relevant tab.
  useEffect(() => {
    if (!loading && buckets.open.length === 0) {
      if (buckets.upcoming.length) setTab('upcoming');
      else if (buckets.results.length) setTab('results');
      else if (buckets.closed.length) setTab('closed');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const TABS: Array<{ id: Tab; label: string; count: number }> = [
    { id: 'open', label: 'Open Now', count: buckets.open.length },
    { id: 'upcoming', label: 'Upcoming', count: buckets.upcoming.length },
    { id: 'closed', label: 'Closed', count: buckets.closed.length },
    { id: 'results', label: 'My Results', count: buckets.results.length },
  ];

  const visible = buckets[tab];

  const ctaFor = (e: StudentExamItem): { label: string; href: string; disabled: boolean } => {
    if (e.has_in_progress) return { label: 'Resume Attempt', href: `/student/exams/${e.id}/take`, disabled: false };
    if (e.window_state === 'open' && e.attempts_remaining > 0) return { label: 'View & Start', href: `/student/exams/${e.id}`, disabled: false };
    if (e.best_score != null || e.latest_status === 'submitted' || e.latest_status === 'expired') return { label: 'View Result', href: `/student/exams/${e.id}/result`, disabled: false };
    return { label: 'View Details', href: `/student/exams/${e.id}`, disabled: false };
  };

  return (
    <StudentShell activePage="Exams" title="My Exams" subtitle="Timed assessments published by your instructors">
      {error && <div className={styles.errorBox}>⚠️ {error}</div>}

      <div className={styles.tabRow}>
        {TABS.map(t => (
          <button key={t.id} type="button"
            className={`${styles.tabChip} ${tab === t.id ? styles.tabChipActive : ''}`}
            onClick={() => setTab(t.id)}>
            {t.label} <span style={{ opacity: .7 }}>{t.count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.loadingBox}><Loader2 size={20} className={styles.spinner} /> Loading exams…</div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '56px 20px', color: '#9ca3af' }}>
          <FileClock size={44} strokeWidth={1.3} style={{ marginBottom: 14, opacity: .5 }} />
          <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 6px', color: '#6b7280' }}>
            {tab === 'open' ? 'No open exams right now'
              : tab === 'upcoming' ? 'No upcoming exams'
                : tab === 'closed' ? 'No closed exams'
                  : 'No results yet'}
          </p>
          <p style={{ fontSize: 13, margin: 0 }}>
            {tab === 'results' ? 'Submit an exam to see your score and review here.' : 'Check back later or switch tabs.'}
          </p>
        </div>
      ) : (
        <div className={styles.grid}>
          {visible.map(e => {
            const tm = TYPE_META[e.exam_type] || TYPE_META.mcq;
            const TypeIcon = tm.Icon;
            const cta = ctaFor(e);
            const stateBadge =
              e.window_state === 'open' ? styles.greenBadge
                : e.window_state === 'upcoming' ? styles.blueBadge
                  : styles.slateBadge;
            return (
              <div key={e.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <div style={{ minWidth: 0 }}>
                    <h3 className={styles.cardTitle}>{e.title}</h3>
                    {e.description && <p className={styles.cardDesc}>{e.description}</p>}
                  </div>
                  <span className={`${styles.badge} ${stateBadge}`}>
                    <CalendarClock size={11} /> {e.window_state}
                  </span>
                </div>

                <div className={styles.cardMeta}>
                  <span className={`${styles.badge} ${styles.blueBadge}`}><TypeIcon size={11} /> {tm.label}</span>
                  <span><Clock size={13} /> {e.duration_minutes} min</span>
                  <span><HelpCircle size={13} /> {e.question_count} Q</span>
                  <span><CheckCircle2 size={13} /> pass {e.pass_threshold}%</span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {e.window_state === 'upcoming' && (
                    <CountdownChip target={e.available_from} serverNow={serverNow} prefix="Opens in" />
                  )}
                  {e.window_state === 'open' && e.due_at && (
                    <CountdownChip target={e.due_at} serverNow={serverNow} prefix="Closes in" />
                  )}
                  {e.best_score != null && (
                    <span className={`${styles.badge} ${e.best_score >= e.pass_threshold ? styles.greenBadge : styles.redBadge}`}>
                      Best: {Math.round(e.best_score)}%
                    </span>
                  )}
                  <span className={`${styles.badge} ${styles.slateBadge}`}>
                    {e.attempts_used}/{e.max_attempts} attempts
                  </span>
                </div>

                <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>
                  Window: {fmtDateTime(e.available_from)} → {fmtDateTime(e.due_at)}
                </p>

                <div className={styles.cardActions}>
                  <button type="button" className={styles.primaryBtn} disabled={cta.disabled} onClick={() => router.push(cta.href)}>
                    {cta.label} <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </StudentShell>
  );
}
