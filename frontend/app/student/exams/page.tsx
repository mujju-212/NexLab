'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileClock, Loader2, Clock, CalendarClock, HelpCircle, Code2, Layers,
  ChevronRight, CheckCircle2, Timer, Search, X, BookOpen,
  Filter, ArrowUpDown, AlertCircle, RotateCcw
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
type SortKey = 'due_asc' | 'due_desc' | 'recent' | 'duration' | 'score_desc';

export default function StudentExamsPage() {
  const router = useRouter();
  const [exams, setExams] = useState<StudentExamItem[]>([]);
  const [serverNow, setServerNow] = useState<string>(new Date().toISOString());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('open');

  // Multi-subject & filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [sortBy, setSortBy] = useState<SortKey>('due_asc');

  useEffect(() => {
    examService.listMyExams()
      .then(res => { setExams(res.exams); setServerNow(res.server_now); })
      .catch(() => setError('Could not load your exams.'))
      .finally(() => setLoading(false));
  }, []);

  // Distinct subjects for multi-subject filtering
  const uniqueSubjects = useMemo(() => {
    const map = new Map<string, { id: string; name: string; code?: string; color?: string }>();
    exams.forEach(e => {
      if (e.subject_id && !map.has(e.subject_id)) {
        map.set(e.subject_id, {
          id: e.subject_id,
          name: e.subject_name || 'General',
          code: e.subject_code || '',
          color: e.subject_color || '#7c3aed',
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [exams]);

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
    { id: 'closed', label: 'Past & Closed', count: buckets.closed.length },
    { id: 'results', label: 'My Results', count: buckets.results.length },
  ];

  // Filtered and sorted exams for the active tab
  const visible = useMemo(() => {
    const baseList = buckets[tab] || [];
    return baseList
      .filter(e => {
        // Search filter (title, description, subject name/code)
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = (e.title || '').toLowerCase().includes(q);
          const matchDesc = (e.description || '').toLowerCase().includes(q);
          const matchSub = (e.subject_name || '').toLowerCase().includes(q) || (e.subject_code || '').toLowerCase().includes(q);
          if (!matchTitle && !matchDesc && !matchSub) return false;
        }
        // Subject filter
        if (selectedSubject !== 'all' && e.subject_id !== selectedSubject) {
          return false;
        }
        // Type filter
        if (selectedType !== 'all' && (e.exam_type || 'mcq') !== selectedType) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'due_asc') {
          const tA = a.due_at ? new Date(a.due_at).getTime() : Infinity;
          const tB = b.due_at ? new Date(b.due_at).getTime() : Infinity;
          return tA - tB;
        }
        if (sortBy === 'due_desc') {
          const tA = a.due_at ? new Date(a.due_at).getTime() : -Infinity;
          const tB = b.due_at ? new Date(b.due_at).getTime() : -Infinity;
          return tB - tA;
        }
        if (sortBy === 'duration') {
          return (a.duration_minutes || 0) - (b.duration_minutes || 0);
        }
        if (sortBy === 'score_desc') {
          return (b.best_score ?? -1) - (a.best_score ?? -1);
        }
        if (sortBy === 'recent') {
          const tA = a.available_from ? new Date(a.available_from).getTime() : 0;
          const tB = b.available_from ? new Date(b.available_from).getTime() : 0;
          return tB - tA;
        }
        return 0;
      });
  }, [buckets, tab, searchQuery, selectedSubject, selectedType, sortBy]);

  const hasActiveFilters = searchQuery.trim() !== '' || selectedSubject !== 'all' || selectedType !== 'all';
  const resetFilters = () => {
    setSearchQuery('');
    setSelectedSubject('all');
    setSelectedType('all');
  };

  const ctaFor = (e: StudentExamItem): { label: string; href: string; disabled: boolean } => {
    if (e.has_in_progress) return { label: 'Resume Attempt', href: `/student/exams/${e.id}/take`, disabled: false };
    if (e.window_state === 'open' && e.attempts_remaining > 0) return { label: 'View & Start', href: `/student/exams/${e.id}`, disabled: false };
    if (e.best_score != null || e.latest_status === 'submitted' || e.latest_status === 'expired') {
      return { label: 'Review Result', href: `/student/exams/${e.id}/result`, disabled: false };
    }
    return { label: 'View Details', href: `/student/exams/${e.id}`, disabled: false };
  };

  return (
    <StudentShell activePage="Exams" title="My Exams" subtitle="Track and take timed assessments across all your enrolled subjects">
      {error && <div className={styles.errorBox}>⚠️ {error}</div>}

      {/* ── Status Tab Navigation ─────────────────────────────────────── */}
      <div className={styles.tabRow}>
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            className={`${styles.tabChip} ${tab === t.id ? styles.tabChipActive : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label} <span style={{ opacity: .75 }}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* ── Multi-Subject Search, Filter & Sort Toolbar ─────────────── */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          {/* Search Box */}
          <div className={styles.searchBox}>
            <Search size={15} color="#94a3b8" />
            <input
              type="text"
              placeholder="Search by title, subject or code…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <X size={14} color="#94a3b8" />
              </button>
            )}
          </div>

          {/* Subject Filter Dropdown */}
          <div className={styles.selectControl}>
            <BookOpen size={14} color="#7c3aed" />
            <select
              value={selectedSubject}
              onChange={e => setSelectedSubject(e.target.value)}
              className={styles.selectInput}
            >
              <option value="all">All Subjects ({uniqueSubjects.length})</option>
              {uniqueSubjects.map(s => (
                <option key={s.id} value={s.id}>
                  {s.code ? `${s.code} · ${s.name}` : s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Type Filter */}
          <div className={styles.selectControl}>
            <Filter size={13} color="#64748b" />
            <select
              value={selectedType}
              onChange={e => setSelectedType(e.target.value)}
              className={styles.selectInput}
            >
              <option value="all">All Types</option>
              <option value="mcq">MCQ Only</option>
              <option value="coding">Coding Only</option>
              <option value="mixed">Mixed Assessment</option>
            </select>
          </div>

          {/* Sort By */}
          <div className={styles.selectControl}>
            <ArrowUpDown size={13} color="#64748b" />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortKey)}
              className={styles.selectInput}
            >
              <option value="due_asc">Due Soonest</option>
              <option value="due_desc">Due Latest</option>
              <option value="recent">Recently Released</option>
              <option value="duration">Shortest Duration</option>
              {tab === 'results' && <option value="score_desc">Highest Score</option>}
            </select>
          </div>
        </div>

        <div className={styles.toolbarRight}>
          <span>Showing <strong>{visible.length}</strong> of {buckets[tab].length}</span>
          {hasActiveFilters && (
            <button type="button" onClick={resetFilters} className={styles.clearBtn}>
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* ── Main Content Area ────────────────────────────────────────── */}
      {loading ? (
        <div className={styles.loadingBox}>
          <Loader2 size={20} className={styles.spinner} /> Loading your exams…
        </div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '56px 20px', color: '#9ca3af' }}>
          <FileClock size={44} strokeWidth={1.3} style={{ marginBottom: 14, opacity: .5 }} />
          <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 6px', color: '#6b7280' }}>
            {hasActiveFilters
              ? 'No exams match your search or filter criteria'
              : tab === 'open'
                ? 'No open exams right now'
                : tab === 'upcoming'
                  ? 'No upcoming exams scheduled'
                  : tab === 'closed'
                    ? 'No past exams found'
                    : 'No exam results yet'}
          </p>
          <p style={{ fontSize: 13, margin: 0, color: '#94a3b8' }}>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={resetFilters}
                style={{ background: 'none', border: 'none', color: '#7c3aed', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
              >
                Clear all filters
              </button>
            ) : tab === 'results' ? (
              'Complete and submit an exam to see your score card and solutions review here.'
            ) : (
              'Check back later or switch to another tab to view upcoming or past exams.'
            )}
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

            const isPassed = e.best_score != null && e.best_score >= e.pass_threshold;
            const isFailed = e.best_score != null && e.best_score < e.pass_threshold;
            const isUnattempted = e.window_state === 'closed' && e.attempts_used === 0;

            return (
              <div key={e.id} className={styles.card}>
                {/* Subject Header Pill */}
                {e.subject_name && (
                  <div
                    className={styles.subjectPill}
                    style={{
                      borderColor: e.subject_color ? `${e.subject_color}33` : undefined,
                      color: e.subject_color || '#6d28d9',
                    }}
                  >
                    <BookOpen size={11} />
                    <span>{e.subject_code ? `${e.subject_code} · ` : ''}{e.subject_name}</span>
                  </div>
                )}

                <div className={styles.cardTop}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h3 className={styles.cardTitle}>{e.title}</h3>
                    {e.description && <p className={styles.cardDesc}>{e.description}</p>}
                  </div>
                  <span className={`${styles.badge} ${stateBadge}`}>
                    <CalendarClock size={11} /> {e.window_state}
                  </span>
                </div>

                {/* Key Assessment Attributes */}
                <div className={styles.cardMeta}>
                  <span className={`${styles.badge} ${styles.blueBadge}`}>
                    <TypeIcon size={11} /> {tm.label}
                  </span>
                  <span><Clock size={13} /> {e.duration_minutes} min</span>
                  <span><HelpCircle size={13} /> {e.question_count} Questions</span>
                  <span><CheckCircle2 size={13} /> Pass: {e.pass_threshold}%</span>
                </div>

                {/* Status Badges, Countdown & Score Badges */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  {e.window_state === 'upcoming' && (
                    <CountdownChip target={e.available_from} serverNow={serverNow} prefix="Opens in" />
                  )}
                  {e.window_state === 'open' && e.due_at && (
                    <CountdownChip target={e.due_at} serverNow={serverNow} prefix="Closes in" />
                  )}

                  {/* Past Exam Outcome Chips */}
                  {isPassed && (
                    <span className={`${styles.badge} ${styles.greenBadge}`}>
                      <CheckCircle2 size={11} /> Passed ({Math.round(e.best_score!)}%)
                    </span>
                  )}
                  {isFailed && (
                    <span className={`${styles.badge} ${styles.amberBadge}`}>
                      <AlertCircle size={11} /> Below Pass ({Math.round(e.best_score!)}%)
                    </span>
                  )}
                  {isUnattempted && (
                    <span className={`${styles.badge} ${styles.slateBadge}`}>
                      Missed / Unattempted
                    </span>
                  )}

                  {e.has_in_progress && (
                    <span className={`${styles.badge} ${styles.amberBadge}`}>
                      <Timer size={11} /> Attempt In Progress
                    </span>
                  )}

                  <span className={`${styles.badge} ${styles.slateBadge}`}>
                    {e.attempts_used}/{e.max_attempts} attempts used
                  </span>
                </div>

                {/* Window or Submission Timestamps */}
                <div className={styles.scoreRow}>
                  <span style={{ color: '#64748b' }}>
                    {e.submitted_at
                      ? `Last submitted: ${fmtDateTime(e.submitted_at)}`
                      : `Window: ${fmtDateTime(e.available_from)} → ${fmtDateTime(e.due_at)}`}
                  </span>
                  {e.best_score != null && (
                    <span style={{ fontWeight: 700, color: isPassed ? '#059669' : '#b45309' }}>
                      Best: {Math.round(e.best_score)}%
                    </span>
                  )}
                </div>

                {/* Call to Action Button */}
                <div className={styles.cardActions}>
                  <button
                    type="button"
                    className={e.has_in_progress ? styles.primaryBtn : (e.window_state === 'open' ? styles.primaryBtn : styles.secondaryBtn)}
                    disabled={cta.disabled}
                    onClick={() => router.push(cta.href)}
                  >
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
