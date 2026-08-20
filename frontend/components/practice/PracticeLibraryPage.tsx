'use client';

/**
 * PracticeLibraryPage — shared component used by BOTH portals:
 *   /student/practice         (StudentShell — institution students)
 *   /practice/library         (IndividualShell — free/individual users)
 *
 * Props:
 *   baseRoute — the root URL for this portal's practice library
 *               e.g. '/student/practice' or '/practice/library'
 */

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search, Flame, Zap, Trophy, BookMarked,
  CheckCircle2, Circle, MinusCircle, ChevronRight
} from 'lucide-react';
import styles from './PracticeLibrary.module.css';
import { apiClient } from '@/services/api-client';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Problem {
  id: string; slug: string; lc_id: string; title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  nexlab_topic: string; topics: string[];
  acceptance: number; status: 'solved' | 'attempted' | 'todo'; is_daily: boolean;
}

interface Topic {
  topic: string; section: string; total: number; solved: number;
}

interface XP {
  total_xp: number; level: number; level_name: string;
  next_level_xp: number | null; streak_days: number;
  problems_solved: number; easy_solved: number; medium_solved: number; hard_solved: number;
}

interface DailyChallenge {
  slug: string; title: string; difficulty: string; nexlab_topic: string; acceptance: number;
}

interface StudyPlan {
  id: string; slug: string; title: string; description: string;
  icon: string; total_problems: number; difficulty_mix: string;
  enrolled: boolean; solved_count: number; completed: boolean;
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = ['All Problems', 'Foundations', 'Data Structures', 'Algorithms', 'Graphs', 'SQL & Shell', 'Study Plans'];

const SECTION_TABS: Record<string, string[]> = {
  'Foundations':     ['Array', 'Matrix', 'String', 'Math', 'Number Theory', 'Sorting', 'Recursion'],
  'Data Structures': ['Hash Table', 'Linked List', 'Stack', 'Monotonic Stack', 'Queue', 'Heap',
                      'Tree', 'Trie', 'Binary Search Tree', 'Segment Tree', 'Design'],
  'Algorithms':      ['Binary Search', 'Two Pointers', 'Sliding Window', 'Prefix Sum',
                      'Greedy', 'Backtracking', 'Dynamic Programming', 'Bit Manipulation'],
  'Graphs':          ['Graph', 'Union Find'],
  'SQL & Shell':     ['SQL', 'Shell'],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function diffClass(d: string) {
  if (d === 'Easy') return styles.easy;
  if (d === 'Medium') return styles.medium;
  return styles.hard;
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'solved')
    return <span className={`${styles.statusDot} ${styles.solved}`}><CheckCircle2 size={13} /> Solved</span>;
  if (status === 'attempted')
    return <span className={`${styles.statusDot} ${styles.attempted}`}><MinusCircle size={13} /> Attempted</span>;
  return <span className={`${styles.statusDot} ${styles.todo}`}><Circle size={13} /> Todo</span>;
}

// ── Main Component ────────────────────────────────────────────────────────────

// ── Inner component (uses useSearchParams — must be inside Suspense) ─────────

function PracticeLibraryInner({ baseRoute }: { baseRoute: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initTab = searchParams.get('tab') === 'plans' ? 'Study Plans' : 'All Problems';
  const [activeTab, setActiveTab] = useState(initTab);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [xp, setXP] = useState<XP | null>(null);
  const [daily, setDaily] = useState<DailyChallenge | null>(null);
  const [dailySolved, setDailySolved] = useState(false);
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [search, setSearch] = useState('');
  const [diffFilter, setDiffFilter] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [loading, setLoading] = useState(true);

  // Fetch all data on mount
  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [probRes, topicRes, xpRes, dailyRes, planRes] = await Promise.all([
          apiClient.get('/practice/problems'),
          apiClient.get('/practice/topics'),
          apiClient.get('/practice/quest/stats'),
          apiClient.get('/practice/daily'),
          apiClient.get('/practice/plans'),
        ]);
        setProblems(probRes.data?.problems || []);
        setTopics(topicRes.data?.topics || []);
        setXP(xpRes.data?.xp || null);
        setDaily(dailyRes.data?.daily || null);
        setDailySolved(dailyRes.data?.solved_today || false);
        setPlans(planRes.data?.plans || []);
      } catch (e) {
        console.error('Practice library fetch error:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
    // Advance the daily streak on any visit (fire-and-forget, once per day server-side)
    apiClient.post('/practice/quest/daily-checkin').catch(() => {});
  }, []);

  // Filter problems
  const filteredProblems = useCallback(() => {
    let p = [...problems];
    if (search) p = p.filter(x => x.title.toLowerCase().includes(search.toLowerCase()));
    if (diffFilter) p = p.filter(x => x.difficulty === diffFilter);
    if (selectedTopic) p = p.filter(x => x.nexlab_topic === selectedTopic);
    // Tab filter
    if (activeTab !== 'All Problems' && activeTab !== 'Study Plans') {
      const sectionTopics = SECTION_TABS[activeTab];
      if (sectionTopics) p = p.filter(x => sectionTopics.includes(x.nexlab_topic));
    }
    return p;
  }, [problems, search, diffFilter, selectedTopic, activeTab]);

  const goToProblem = (slug: string) => router.push(`${baseRoute}/${slug}`);

  if (loading) return <div className={styles.loading}>Loading Practice Library…</div>;

  const filtered = filteredProblems();
  const sectionTopics = activeTab !== 'All Problems' && activeTab !== 'Study Plans'
    ? topics.filter(t => (SECTION_TABS[activeTab] || []).includes(t.topic))
    : topics;

  return (
    <div className={styles.page}>

      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>Practice Library</h1>
          <p>589 problems · 30 topics · LeetCode & CodeChef curated</p>
        </div>

        {xp && (
          <div className={styles.xpStrip}>
            <div className={styles.levelBadge}>{xp.level_name}</div>
            <div className={styles.xpChip}>
              <Zap size={14} /> {xp.total_xp.toLocaleString()} XP
            </div>
            <div className={`${styles.xpChip} ${styles.streakFire}`}>
              <Flame size={14} /> {xp.streak_days}d streak
            </div>
            <div className={styles.xpChip}>
              <Trophy size={14} /> {xp.problems_solved} solved
            </div>
          </div>
        )}
      </div>

      {/* ── Daily Challenge banner ── */}
      {daily && (
        <div className={styles.dailyBanner} onClick={() => goToProblem(daily.slug)}>
          <div className={styles.dailyLeft}>
            <div className={styles.dailyIcon}>🔥</div>
            <div>
              <div className={styles.dailyLabel}>Daily Challenge</div>
              <div className={styles.dailyTitle}>{daily.title}</div>
              <span className={`${styles.diffBadge} ${diffClass(daily.difficulty)}`}>{daily.difficulty}</span>
              <span className={styles.topicTag}>{daily.nexlab_topic}</span>
            </div>
          </div>
          {dailySolved
            ? <div className={styles.solvedBadge}>✓ Solved · +15 XP</div>
            : <button className={styles.solveCta}>Solve Today +15 XP →</button>}
        </div>
      )}

      {/* ── Tabs ── */}
      <div className={styles.tabs}>
        {TABS.map(tab => (
          <button
            key={tab}
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
            onClick={() => { setActiveTab(tab); setSelectedTopic(''); }}
          >
            {tab === 'Study Plans' && <BookMarked size={13} style={{ marginRight: 4 }} />}
            {tab}
          </button>
        ))}
      </div>

      {/* ── Study Plans tab ── */}
      {activeTab === 'Study Plans' ? (
        <div className={styles.planGrid}>
          {plans.map(plan => (
            <div key={plan.id} className={styles.planCard}
              onClick={() => router.push(`${baseRoute}/study-plans/${plan.slug}`)}>
              <div className={styles.planIcon}>{plan.icon}</div>
              <div className={styles.planTitle}>{plan.title}</div>
              <div className={styles.planDesc}>{plan.description}</div>
              <div className={styles.planMeta}>
                <span className={styles.planMetaChip}>{plan.total_problems} problems</span>
                <span className={styles.planMetaChip}>{plan.difficulty_mix}</span>
                {plan.enrolled && <span className={styles.planMetaChip}>✓ Enrolled</span>}
              </div>
              {plan.enrolled && (
                <>
                  <div className={styles.planProgress}>
                    <div className={styles.planProgressFill}
                      style={{ width: `${Math.round(plan.solved_count / plan.total_problems * 100)}%` }} />
                  </div>
                  <div className={styles.planProgressLabel}>
                    {plan.solved_count} / {plan.total_problems} solved
                  </div>
                </>
              )}
              <button className={`${styles.planBtn} ${plan.enrolled ? '' : styles.planBtnOutline}`}>
                {plan.completed ? '✓ Completed' : plan.enrolled ? 'Continue →' : 'Start Plan'}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* ── Topic grid (shown for non-All tabs or when no topic selected) ── */}
          {!selectedTopic && (
            <div className={styles.topicGrid}>
              {sectionTopics.map(t => (
                <div key={t.topic} className={styles.topicCard}
                  onClick={() => setSelectedTopic(t.topic)}>
                  <div className={styles.topicCardHeader}>
                    <span className={styles.topicName}>{t.topic}</span>
                    <span className={styles.topicCount}>{t.total}</span>
                  </div>
                  <div className={styles.topicSection}>{t.section}</div>
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill}
                      style={{ width: t.total ? `${Math.round(t.solved / t.total * 100)}%` : '0%' }} />
                  </div>
                  <div className={styles.progressLabel}>
                    {t.solved}/{t.total} solved
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Problem table ── */}
          <div className={styles.tableSection}>
            <div className={styles.tableTop}>
              <h2>
                {selectedTopic ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                    <button onClick={() => setSelectedTopic('')}
                      style={{ background: 'none', border: 'none', color: '#a855f7', cursor: 'pointer', fontSize: '.85rem' }}>
                      ← All Topics
                    </button>
                    <ChevronRight size={14} style={{ color: '#475569' }} />
                    {selectedTopic}
                  </span>
                ) : `Problems (${filtered.length})`}
              </h2>

              <div className={styles.searchBox}>
                <Search size={14} color="#64748b" />
                <input
                  placeholder="Search problems…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              <select className={styles.filterSelect}
                value={diffFilter} onChange={e => setDiffFilter(e.target.value)}>
                <option value="">All Difficulties</option>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>

            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Title</th>
                  <th>Topic</th>
                  <th>Difficulty</th>
                  <th>Acceptance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id}>
                    <td className={styles.probNum}>{p.lc_id}</td>
                    <td>
                      <span className={styles.probTitle} onClick={() => goToProblem(p.slug)}>
                        {p.title}
                      </span>
                    </td>
                    <td><span className={styles.topicTag}>{p.nexlab_topic}</span></td>
                    <td><span className={`${styles.diffBadge} ${diffClass(p.difficulty)}`}>{p.difficulty}</span></td>
                    <td className={styles.acceptance}>{Math.round((p.acceptance || 0) * 100)}%</td>
                    <td><StatusIcon status={p.status} /></td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className={styles.empty}>No problems found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Public export — wraps inner in Suspense so the page can prerender ─────────

export default function PracticeLibraryPage({ baseRoute }: { baseRoute: string }) {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', color: '#9891a6', fontFamily: 'Manrope, sans-serif' }}>Loading practice library…</div>}>
      <PracticeLibraryInner baseRoute={baseRoute} />
    </Suspense>
  );
}
