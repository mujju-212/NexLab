'use client';

/**
 * PracticeLibraryPage — Pixel-perfect modern redesign matching NexLab aesthetics:
 *   - Header with XP, Streak & Solved status badges
 *   - Daily Challenge hero card with prize and solver metrics
 *   - Category tabs + Grid / List view toggle
 *   - Multi-dropdown filter bar (Difficulty, Topic, Status, Acceptance, Reset, Sort)
 *   - Popular Study Plans 5-card carousel/grid (NexLab 75, Beginner Path, DP Mastery, Trees & Graphs, SQL 50)
 *   - Full 30 Topics & Categories grid view with difficulty breakdown (E, M, H)
 *   - Comprehensive Coding Problems table with real database data, pagination, bookmarks & solve actions
 *   - Saved collections & starred problems manager
 */

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search,
  Flame,
  Zap,
  Trophy,
  BookMarked,
  Bookmark,
  CheckCircle2,
  Circle,
  MinusCircle,
  ChevronRight,
  ChevronLeft,
  LayoutGrid,
  List,
  RotateCcw,
  Sparkles,
  Users,
  Target,
  BarChart2,
  Clock,
  ExternalLink,
  BookOpen,
  Code2,
} from 'lucide-react';
import styles from './PracticeLibrary.module.css';
import { apiClient } from '@/services/api-client';
import {
  practiceExtraService,
  type CollectionRow,
  type CollectionItemRow,
} from '@/services/practice-extra.service';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Problem {
  id: string;
  slug: string;
  lc_id: string | number;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  nexlab_topic: string;
  topics: string[];
  acceptance: number | null;
  acceptance_pct?: string | null;
  solvers_display?: string | null;
  status: 'solved' | 'attempted' | 'todo';
  is_daily: boolean;
}

interface Topic {
  topic: string;
  section: string;
  description?: string;
  total: number;
  solved: number;
  easy_total?: number;
  medium_total?: number;
  hard_total?: number;
  easy_solved?: number;
  medium_solved?: number;
  hard_solved?: number;
}

interface XP {
  total_xp: number;
  level: number;
  level_name: string;
  next_level_xp: number | null;
  streak_days: number;
  problems_solved: number;
  easy_solved: number;
  medium_solved: number;
  hard_solved: number;
}

interface DailyChallenge {
  slug: string;
  title: string;
  difficulty: string;
  nexlab_topic: string;
  acceptance: number | null;
  solvers_today?: string | null;
  success_rate?: string | null;
  prize_xp?: number;
  ends_in?: string;
}

interface StudyPlan {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon: string;
  total_problems: number;
  difficulty_mix: string;
  tag?: string;
  enrolled: boolean;
  solved_count: number;
  completed: boolean;
}

// ── Tabs Definition ───────────────────────────────────────────────────────────

const TABS = [
  'All Problems',
  'Foundations',
  'Data Structures',
  'Algorithms',
  'Graphs',
  'SQL & Shell',
  'Saved',
  'Study Plans',
] as const;

const SECTION_TABS: Record<string, string[]> = {
  Foundations: ['Array', 'Matrix', 'String', 'Math', 'Number Theory', 'Sorting', 'Recursion'],
  'Data Structures': [
    'Hash Table',
    'Linked List',
    'Stack',
    'Monotonic Stack',
    'Queue',
    'Heap',
    'Tree',
    'Trie',
    'Binary Search Tree',
    'Segment Tree',
    'Design',
  ],
  Algorithms: [
    'Binary Search',
    'Two Pointers',
    'Sliding Window',
    'Prefix Sum',
    'Greedy',
    'Backtracking',
    'Dynamic Programming',
    'Bit Manipulation',
  ],
  Graphs: ['Graph', 'Union Find'],
  'SQL & Shell': ['SQL', 'Shell'],
};

// ── Authentic SVGs for Study Plans (Matching Image 2) ──────────────────────────

const renderStudyPlanIcon = (slug: string) => {
  switch (slug) {
    case 'nexlab-75':
      // 3D Isometric purple cubes
      return (
        <svg width="34" height="34" viewBox="0 0 48 48" fill="none">
          <path d="M24 6L38 14V28L24 36L10 28V14L24 6Z" fill="#7c3aed" opacity="0.85" />
          <path d="M24 6L38 14L24 22L10 14L24 6Z" fill="#a78bfa" />
          <path d="M24 22V36L10 28V14L24 22Z" fill="#6d28d9" />
          <path d="M24 22L38 14V28L24 36V22Z" fill="#5b21b6" />
          <circle cx="34" cy="34" r="6" fill="#f43f5e" />
          <circle cx="15" cy="35" r="4.5" fill="#10b981" />
        </svg>
      );
    case 'beginner-path':
      // 3D Green seedling / leaf sprout
      return (
        <svg width="34" height="34" viewBox="0 0 48 48" fill="none">
          <path
            d="M24 40C24 40 24 26 24 22M24 22C24 16 29 11 36 10C36 17 31 22 24 22ZM24 22C24 17 19 13 12 13C11 19 16 24 24 22Z"
            stroke="#16a34a"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M24 22C24 16 29 11 36 10C36 17 31 22 24 22Z"
            fill="#86efac"
            opacity="0.85"
          />
          <path
            d="M24 22C24 17 19 13 12 13C11 19 16 24 24 22Z"
            fill="#4ade80"
          />
        </svg>
      );
    case 'dp-mastery':
      // 3D Blue geometric steps
      return (
        <svg width="34" height="34" viewBox="0 0 48 48" fill="none">
          <rect x="8" y="28" width="10" height="12" rx="3" fill="#60a5fa" />
          <rect x="19" y="20" width="10" height="20" rx="3" fill="#3b82f6" />
          <rect x="30" y="12" width="10" height="28" rx="3" fill="#2563eb" />
          <path d="M13 24L24 16L35 8" stroke="#93c5fd" strokeWidth="2.8" strokeLinecap="round" strokeDasharray="3 3" />
        </svg>
      );
    case 'trees-and-graphs':
      // 3D Orange connected graph nodes
      return (
        <svg width="34" height="34" viewBox="0 0 48 48" fill="none">
          <circle cx="16" cy="16" r="6" fill="#f97316" />
          <circle cx="34" cy="20" r="5.5" fill="#fb923c" />
          <circle cx="24" cy="34" r="6.5" fill="#ea580c" />
          <line x1="20" y1="18" x2="30" y2="20" stroke="#fed7aa" strokeWidth="2.8" />
          <line x1="18" y1="21" x2="22" y2="29" stroke="#fed7aa" strokeWidth="2.8" />
          <line x1="32" y1="24" x2="26" y2="30" stroke="#fed7aa" strokeWidth="2.8" />
        </svg>
      );
    case 'sql-50':
      // 3D Cyan/blue cylindrical database stack
      return (
        <svg width="34" height="34" viewBox="0 0 48 48" fill="none">
          <ellipse cx="24" cy="14" rx="14" ry="5.5" fill="#38bdf8" />
          <path
            d="M10 14V34C10 37 16.3 39.5 24 39.5C31.7 39.5 38 37 38 34V14"
            stroke="#0284c7"
            strokeWidth="3"
            fill="#0ea5e9"
            opacity="0.6"
          />
          <path
            d="M10 24C10 27 16.3 29 24 29C31.7 29 38 27 38 24"
            stroke="#0284c7"
            strokeWidth="2.5"
          />
        </svg>
      );
    default:
      return (
        <svg width="34" height="34" viewBox="0 0 48 48" fill="none">
          <rect x="10" y="10" width="28" height="28" rx="8" fill="#a78bfa" />
          <path d="M18 24H30M24 18V30" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
  }
};

// ── Authentic Vector Icons for Topic Grid (Matching Image 1) ──────────────────

const renderTopicIcon = (topic: string) => {
  const t = topic.toLowerCase();
  if (t.includes('array')) {
    return <span style={{ color: '#3b82f6', fontWeight: 800, fontSize: '1.05rem' }}>[ ]</span>;
  }
  if (t.includes('string')) {
    return <span style={{ color: '#ec4899', fontWeight: 800, fontSize: '1.15rem' }}>A</span>;
  }
  if (t.includes('hash')) {
    return <span style={{ color: '#eab308', fontWeight: 800, fontSize: '1.2rem' }}>#</span>;
  }
  if (t.includes('stack')) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7L12 12L22 7L12 2Z" />
        <path d="M2 17L12 22L22 17" />
        <path d="M2 12L12 17L22 12" />
      </svg>
    );
  }
  if (t.includes('queue')) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2.4" strokeLinecap="round">
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <line x1="7" y1="5" x2="7" y2="19" />
        <line x1="12" y1="5" x2="12" y2="19" />
      </svg>
    );
  }
  if (t.includes('linked')) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9333ea" strokeWidth="2.4" strokeLinecap="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    );
  }
  if (t.includes('tree')) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.4" strokeLinecap="round">
        <path d="M12 2L19 14H5L12 2Z" fill="#86efac" opacity="0.4" />
        <path d="M12 2L19 14H5L12 2Z" />
        <path d="M12 14V22" />
      </svg>
    );
  }
  if (t.includes('graph')) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.4" strokeLinecap="round">
        <circle cx="6" cy="6" r="3" fill="#c4b5fd" />
        <circle cx="18" cy="8" r="3" fill="#c4b5fd" />
        <circle cx="12" cy="18" r="3" fill="#c4b5fd" />
        <line x1="8.5" y1="7" x2="15.5" y2="7.5" />
        <line x1="7.5" y1="8.5" x2="10.5" y2="15.5" />
        <line x1="16.5" y1="10.5" x2="13.5" y2="15.5" />
      </svg>
    );
  }
  if (t.includes('dynamic') || t.includes('dp')) {
    return <span style={{ color: '#ef4444', fontWeight: 800, fontSize: '1.15rem' }}>∑</span>;
  }
  if (t.includes('greedy')) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="#f59e0b" stroke="#d97706" strokeWidth="1.5">
        <path d="M2 4L5 18H19L22 4L16 11L12 3L8 11L2 4Z" />
      </svg>
    );
  }
  if (t.includes('backtrack')) {
    return <span style={{ color: '#f97316', fontWeight: 800, fontSize: '1.1rem' }}>🧩</span>;
  }
  if (t.includes('binary search') || t.includes('search')) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2.4" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    );
  }
  if (t.includes('bit')) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2.4" strokeLinecap="round">
        <rect x="4" y="4" width="16" height="16" rx="4" />
        <path d="M9 9H15V15H9V9Z" fill="#ddd6fe" />
      </svg>
    );
  }
  if (t.includes('math')) {
    return <span style={{ color: '#f43f5e', fontWeight: 800, fontSize: '1.15rem' }}>π</span>;
  }
  if (t.includes('two pointers') || t.includes('pointer')) {
    return <span style={{ color: '#10b981', fontWeight: 800, fontSize: '1.15rem' }}>⇄</span>;
  }
  if (t.includes('sql')) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.2">
        <ellipse cx="12" cy="5" rx="8" ry="3" fill="#fef3c7" />
        <path d="M4 5V12C4 13.7 7.6 15 12 15C16.4 15 20 13.7 20 12V5" />
        <path d="M4 12V19C4 20.7 7.6 22 12 22C16.4 22 20 20.7 20 19V12" />
      </svg>
    );
  }
  return <Code2 size={20} color="#7c3aed" />;
};

const getTopicCardBg = (topic: string) => {
  const t = topic.toLowerCase();
  if (t.includes('array')) return '#eff6ff';
  if (t.includes('string')) return '#fdf2f8';
  if (t.includes('hash')) return '#fefce8';
  if (t.includes('stack')) return '#f5f3ff';
  if (t.includes('queue')) return '#f0f9ff';
  if (t.includes('linked')) return '#faf5ff';
  if (t.includes('tree')) return '#f0fdf4';
  if (t.includes('graph')) return '#f5f3ff';
  if (t.includes('dynamic') || t.includes('dp')) return '#fef2f2';
  if (t.includes('greedy')) return '#fffbeb';
  if (t.includes('math')) return '#fff1f2';
  if (t.includes('two pointers')) return '#ecfdf5';
  return '#f8fafc';
};

// ── Inner Component ───────────────────────────────────────────────────────────

function PracticeLibraryInner({ baseRoute }: { baseRoute: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Route state
  const initTab = searchParams.get('tab') === 'plans' ? 'Study Plans' : 'All Problems';
  const [activeTab, setActiveTab] = useState<string>(initTab);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Core data states
  const [problems, setProblems] = useState<Problem[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [xp, setXP] = useState<XP | null>(null);
  const [daily, setDaily] = useState<DailyChallenge | null>(null);
  const [dailySolved, setDailySolved] = useState(false);
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [bookmarkIds, setBookmarkIds] = useState<Set<string>>(new Set());

  // Filter states
  const [search, setSearch] = useState('');
  const [diffFilter, setDiffFilter] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<string>(() => searchParams.get('topic') || '');
  const [statusFilter, setStatusFilter] = useState('');
  const [acceptanceFilter, setAcceptanceFilter] = useState('');
  const [sortBy, setSortBy] = useState<'relevant' | 'acc_desc' | 'acc_asc' | 'title' | 'difficulty'>('relevant');

  // Sync with URL query parameters (?topic=, ?problem=)
  useEffect(() => {
    const topicParam = searchParams.get('topic');
    if (topicParam !== null) {
      setSelectedTopic(topicParam);
    }
    const probParam = searchParams.get('problem');
    if (probParam) {
      router.push(`/practice/library/${probParam}`);
    }
  }, [searchParams, router]);

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Collections state
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [selectedColl, setSelectedColl] = useState<{ collection: CollectionRow; items: CollectionItemRow[] } | null>(null);
  const [newCollOpen, setNewCollOpen] = useState(false);
  const [newCollTitle, setNewCollTitle] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const refreshCollections = useCallback(() => {
    practiceExtraService
      .collections()
      .then((r) => setCollections(r.collections ?? []))
      .catch(() => {});
  }, []);

  // Fetch all live data on mount
  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const results = await Promise.allSettled([
          apiClient.get('/practice/problems'),
          apiClient.get('/practice/topics'),
          apiClient.get('/practice/quest/stats'),
          apiClient.get('/practice/daily'),
          apiClient.get('/practice/plans'),
        ]);

        const probData = results[0].status === 'fulfilled' ? results[0].value.data?.problems : [];
        const topicData = results[1].status === 'fulfilled' ? results[1].value.data?.topics : [];
        const xpData = results[2].status === 'fulfilled' ? results[2].value.data?.xp : null;
        const dailyData = results[3].status === 'fulfilled' ? results[3].value.data?.daily : null;
        const solvedToday = results[3].status === 'fulfilled' ? results[3].value.data?.solved_today : false;
        const planData = results[4].status === 'fulfilled' ? results[4].value.data?.plans : [];

        const cleanedProblems = (probData || []).map((p: any) => {
          let tList: string[] = [];
          if (Array.isArray(p.topics)) {
            tList = p.topics;
          } else if (typeof p.topics === 'string' && p.topics.trim()) {
            try {
              const j = JSON.parse(p.topics);
              tList = Array.isArray(j) ? j : [p.topics];
            } catch {
              tList = p.topics.split(',').map((s: string) => s.trim()).filter(Boolean);
            }
          }
          if (tList.length === 0 && p.nexlab_topic) tList = [p.nexlab_topic];
          return { ...p, topics: tList };
        });

        setProblems(cleanedProblems);
        setTopics(topicData || []);
        setXP(xpData);
        setDaily(dailyData);
        setDailySolved(Boolean(solvedToday));
        setPlans(planData || []);
      } catch (e) {
        console.error('Practice library fetch error:', e);
      } finally {
        setLoading(false);
      }
    };
    // Check-in and fetch bookmarks. Refresh the XP snapshot after the check-in
    // so the header cannot show a stale total.
    const loadWithCheckin = async () => {
      try {
        const checkin = await apiClient.post('/practice/quest/daily-checkin');
        if (checkin.data?.xp) setXP(checkin.data.xp);
      } catch {
        // The library remains browseable when the optional check-in is unavailable.
      }
      await fetchAll();
    };
    loadWithCheckin();

    apiClient
      .get('/practice/bookmarks/ids')
      .then((res) => setBookmarkIds(new Set(res.data.starred ?? [])))
      .catch(() => {});
    refreshCollections();
  }, [refreshCollections]);

  // Star / Bookmark toggle
  const toggleStar = useCallback(
    async (problemId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        const res = await apiClient.post('/practice/bookmarks', { problem_id: problemId });
        setBookmarkIds((prev) => {
          const next = new Set(prev);
          if (res.data.starred) {
            next.add(problemId);
            showToast('Problem added to bookmarks');
          } else {
            next.delete(problemId);
            showToast('Removed from bookmarks');
          }
          return next;
        });
      } catch {
        // silent
      }
    },
    []
  );

  // Filter & sort logic on real problems
  const filteredProblems = useMemo(() => {
    let p = [...problems];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      p = p.filter(
        (x) =>
          x.title.toLowerCase().includes(q) ||
          x.nexlab_topic.toLowerCase().includes(q) ||
          (x.topics || []).some((t) => t.toLowerCase().includes(q))
      );
    }

    // Difficulty
    if (diffFilter) {
      p = p.filter((x) => x.difficulty.toLowerCase() === diffFilter.toLowerCase());
    }

    // Topic
    if (selectedTopic) {
      p = p.filter(
        (x) =>
          x.nexlab_topic.toLowerCase() === selectedTopic.toLowerCase() ||
          (x.topics || []).some((t) => t.toLowerCase() === selectedTopic.toLowerCase())
      );
    }

    // Status
    if (statusFilter) {
      p = p.filter((x) => x.status === statusFilter);
    }

    // Acceptance
    if (acceptanceFilter === 'high') {
      p = p.filter((x) => x.acceptance != null && x.acceptance >= 0.6);
    } else if (acceptanceFilter === 'med') {
      p = p.filter((x) => x.acceptance != null && x.acceptance >= 0.4 && x.acceptance < 0.6);
    } else if (acceptanceFilter === 'low') {
      p = p.filter((x) => x.acceptance != null && x.acceptance < 0.4);
    }

    // Tab filter
    if (activeTab === 'Saved') {
      p = p.filter((x) => bookmarkIds.has(x.id));
    } else if (activeTab !== 'All Problems' && activeTab !== 'Study Plans') {
      const sectionTopics = SECTION_TABS[activeTab] || [];
      p = p.filter((x) => sectionTopics.includes(x.nexlab_topic));
    }

    // Sort
    if (sortBy === 'acc_desc') {
      p.sort((a, b) => a.acceptance == null ? (b.acceptance == null ? 0 : 1) : b.acceptance == null ? -1 : b.acceptance - a.acceptance);
    } else if (sortBy === 'acc_asc') {
      p.sort((a, b) => a.acceptance == null ? (b.acceptance == null ? 0 : 1) : b.acceptance == null ? -1 : a.acceptance - b.acceptance);
    } else if (sortBy === 'title') {
      p.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === 'difficulty') {
      const diffOrder: Record<string, number> = { Easy: 1, Medium: 2, Hard: 3 };
      p.sort((a, b) => (diffOrder[a.difficulty] || 2) - (diffOrder[b.difficulty] || 2));
    } else {
      // Relevance / numeric lc_id
      p.sort((a, b) => Number(a.lc_id || 9999) - Number(b.lc_id || 9999));
    }

    return p;
  }, [problems, search, diffFilter, selectedTopic, statusFilter, acceptanceFilter, activeTab, bookmarkIds, sortBy]);

  // Reset all filters
  const handleResetFilters = () => {
    setSearch('');
    setDiffFilter('');
    setSelectedTopic('');
    setStatusFilter('');
    setAcceptanceFilter('');
    setSortBy('relevant');
    setPage(1);
    showToast('Filters reset');
  };

  const totalPages = Math.max(1, Math.ceil(filteredProblems.length / pageSize));
  const paginatedProblems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredProblems.slice(start, start + pageSize);
  }, [filteredProblems, page, pageSize]);

  const goToProblem = (slug: string) => router.push(`${baseRoute}/${slug}`);
  const goToStudyPlan = (slug: string) => router.push(`${baseRoute}/study-plans/${slug}`);

  // Unique topic list for dropdown
  const allTopicNames = useMemo(() => {
    const set = new Set<string>();
    topics.forEach((t) => set.add(t.topic));
    return Array.from(set).sort();
  }, [topics]);

  if (loading) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', color: '#64748b', fontWeight: 600 }}>
        Loading Practice Library…
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* ── 1. Page Header ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIconBadge}>
            <Code2 size={24} strokeWidth={2.2} />
          </div>
          <div>
            <h1 className={styles.headerTitle}>Practice Library</h1>
            <p className={styles.headerSubtitle}>
              <span>{problems.length.toLocaleString()} Curated Coding Challenges</span>
              <span className={styles.headerSubtitleDot}>•</span>
              <span>{topics.length} Core Topics</span>
              <span className={styles.headerSubtitleDot}>•</span>
              <span>Algorithmic &amp; Data Structures</span>
            </p>
          </div>
        </div>

        {/* Top XP & Streak Badges */}
        {xp && (
          <div className={styles.xpStrip}>
            <div className={styles.levelBadge}>
              <BarChart2 size={13} />
              <span>{xp.level_name ?? '—'}</span>
            </div>
            <div className={styles.xpChip}>
              <Zap size={14} color="#7c3aed" />
              <span>{xp.total_xp.toLocaleString()} XP</span>
            </div>
            <div className={`${styles.xpChip} ${styles.streakChip}`}>
              <Flame size={14} className={styles.streakFire} />
              <span>{xp.streak_days}d streak</span>
            </div>
            <div className={`${styles.xpChip} ${styles.solvedChip}`}>
              <Trophy size={14} color="#7c3aed" />
              <span>{xp.problems_solved ?? 0} solved</span>
            </div>
          </div>
        )}
      </div>

      {/* ── 2. Daily Challenge Banner ── */}
      {daily && (
        <div className={styles.dailyBanner}>
          <div className={styles.dailyLeft}>
            <div className={styles.dailyFlameWrap}>
              <Flame size={28} className={styles.dailyFlameIcon} />
            </div>
            <div>
              <div className={styles.dailyLabelRow}>
                <span className={styles.dailyTagLabel}>Daily Challenge</span>
              </div>
              <h2 className={styles.dailyTitle} onClick={() => goToProblem(daily.slug)}>
                {daily.title}
              </h2>
              <p className={styles.dailySubtitle}>
                You have 24 hours to solve this challenge. Compete with fellow learners and improve your streak!
              </p>
              <div className={styles.dailyChipsRow}>
                <span
                  className={styles.dailyChip}
                  style={{
                    background: daily.difficulty === 'Hard' ? '#fee2e2' : daily.difficulty === 'Medium' ? '#fef3c7' : '#dcfce7',
                    color: daily.difficulty === 'Hard' ? '#dc2626' : daily.difficulty === 'Medium' ? '#b45309' : '#15803d',
                  }}
                >
                  {daily.difficulty}
                </span>
                <span className={styles.dailyChip} style={{ background: '#f3e8ff', color: '#7c3aed' }}>
                  {daily.nexlab_topic}
                </span>
                <span className={styles.dailyChip} style={{ background: '#ffffff', color: '#64748b', border: '1px solid #e2e8f0' }}>
                  <Clock size={12} />
                  <span>{daily.ends_in ?? '—'}</span>
                </span>
              </div>
            </div>
          </div>

          <div className={styles.dailyRight}>
            <div className={styles.dailyStatsBox}>
              <div className={styles.dailyStatItem}>
                <div className={styles.dailyStatHeader}>
                  <Target size={12} color="#dc2626" />
                  <span>Today&apos;s Prize</span>
                </div>
                <div className={styles.dailyStatValue} style={{ color: '#ea580c' }}>
                  +{daily.prize_xp ?? 15} XP
                </div>
              </div>
              <div className={styles.dailyStatItem}>
                <div className={styles.dailyStatHeader}>
                  <Users size={12} color="#3b82f6" />
                  <span>Solvers Today</span>
                </div>
                <div className={styles.dailyStatValue}>{daily.solvers_today ?? '—'}</div>
              </div>
              <div className={styles.dailyStatItem}>
                <div className={styles.dailyStatHeader}>
                  <Trophy size={12} color="#f59e0b" />
                  <span>Success Rate</span>
                </div>
                <div className={styles.dailyStatValue}>{daily.success_rate ?? '—'}</div>
              </div>
            </div>

            {dailySolved ? (
              <div className={styles.solvedTodayBadge}>
                <CheckCircle2 size={16} />
                <span>Solved Today · +15 XP</span>
              </div>
            ) : (
              <button className={styles.solveCtaBtn} onClick={() => goToProblem(daily.slug)}>
                <span>Solve Today</span>
                <ChevronRight size={15} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── 3. Category Tabs & View-As Bar ── */}
      <div className={styles.navRow}>
        <div className={styles.tabsList}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                className={`${styles.tabBtn} ${isActive ? styles.tabBtnActive : ''}`}
                onClick={() => {
                  setActiveTab(tab);
                  setSelectedTopic('');
                  setPage(1);
                }}
              >
                {tab === 'Saved' && <Bookmark size={13} />}
                {tab === 'Study Plans' && <BookMarked size={13} />}
                <span>{tab}</span>
              </button>
            );
          })}
        </div>

        {/* View Mode Toggle: Grid (Topics) vs List (Table & Study Plans) */}
        {activeTab !== 'Study Plans' && activeTab !== 'Saved' && (
          <div className={styles.viewModeToggle}>
            <span>View as:</span>
            <div className={styles.viewToggleGroup}>
              <button
                type="button"
                className={`${styles.viewToggleBtn} ${viewMode === 'list' ? styles.viewToggleBtnActive : ''}`}
                onClick={() => setViewMode('list')}
                title="Table & Plans View"
              >
                <List size={16} />
              </button>
              <button
                type="button"
                className={`${styles.viewToggleBtn} ${viewMode === 'grid' ? styles.viewToggleBtnActive : ''}`}
                onClick={() => setViewMode('grid')}
                title="Topics & Categories Grid"
              >
                <LayoutGrid size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── 4. Search & Multi-Filter Bar ── */}
      {activeTab !== 'Study Plans' && activeTab !== 'Saved' && (
        <div className={styles.filterBar}>
          <div className={styles.searchBox}>
            <Search size={15} color="#94a3b8" />
            <input
              placeholder="Search problems, titles, or topics…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <select
            className={styles.filterSelect}
            value={diffFilter}
            onChange={(e) => {
              setDiffFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Difficulty: All</option>
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>

          <select
            className={styles.filterSelect}
            value={selectedTopic}
            onChange={(e) => {
              setSelectedTopic(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Topic: All Topics</option>
            {allTopicNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <select
            className={styles.filterSelect}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Status: All Status</option>
            <option value="todo">Todo</option>
            <option value="attempted">Attempted</option>
            <option value="solved">Solved</option>
          </select>

          <select
            className={styles.filterSelect}
            value={acceptanceFilter}
            onChange={(e) => {
              setAcceptanceFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Acceptance: All</option>
            <option value="high">&gt; 60%</option>
            <option value="med">40% – 60%</option>
            <option value="low">&lt; 40%</option>
          </select>

          <button type="button" className={styles.resetBtn} onClick={handleResetFilters} title="Reset filters">
            <RotateCcw size={13} />
            <span>Reset</span>
          </button>

          <select
            className={styles.sortSelect}
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as any);
              setPage(1);
            }}
          >
            <option value="relevant">Sort: Most Relevant</option>
            <option value="acc_desc">Acceptance: High to Low</option>
            <option value="acc_asc">Acceptance: Low to High</option>
            <option value="title">Title: A–Z</option>
            <option value="difficulty">Difficulty: Easy to Hard</option>
          </select>
        </div>
      )}

      {/* ── 5. Popular Study Plans (Image 2) ── */}
      {activeTab === 'All Problems' && viewMode === 'list' && plans.length > 0 && !selectedTopic && !search && (
        <section className={styles.plansSection}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionHeaderLeft}>
              <div className={styles.sectionHeaderIcon}>
                <BookOpen size={18} />
              </div>
              <div>
                <h3 className={styles.sectionHeading}>Popular Study Plans</h3>
                <p className={styles.sectionSubtitle}>
                  Structured learning paths to master key topics with curated problems.
                </p>
              </div>
            </div>
            <button className={styles.viewAllLink} onClick={() => setActiveTab('Study Plans')}>
              <span>View All Plans</span>
              <ChevronRight size={14} />
            </button>
          </div>

          <div className={styles.plansGrid5}>
            {plans.slice(0, 5).map((plan) => {
              const badgeBg =
                plan.tag === 'Most Popular'
                  ? '#f3e8ff'
                  : plan.tag === 'Beginner'
                  ? '#dcfce7'
                  : plan.tag === 'Intermediate'
                  ? '#ffedd5'
                  : '#ede9fe';
              const badgeColor =
                plan.tag === 'Most Popular'
                  ? '#7c3aed'
                  : plan.tag === 'Beginner'
                  ? '#15803d'
                  : plan.tag === 'Intermediate'
                  ? '#c2410c'
                  : '#6d28d9';

              const isPrimary = plan.slug === 'nexlab-75';

              return (
                <div key={plan.id} className={styles.studyPlanCard} onClick={() => goToStudyPlan(plan.slug)}>
                  <div>
                    <div className={styles.studyPlanTop}>
                      <div className={styles.studyPlanIconBox}>{renderStudyPlanIcon(plan.slug)}</div>
                      <span className={styles.studyPlanBadge} style={{ background: badgeBg, color: badgeColor }}>
                        {plan.tag || 'Curated'}
                      </span>
                    </div>

                    <h4 className={styles.studyPlanTitle}>{plan.title}</h4>
                    <p className={styles.studyPlanDesc}>{plan.description}</p>
                  </div>

                  <div>
                    <div className={styles.studyPlanMeta}>
                      <span>{plan.total_problems} problems</span>
                      <span className={styles.studyPlanMetaDot}>•</span>
                      <span>{plan.difficulty_mix || 'Mixed'}</span>
                    </div>

                    <button
                      type="button"
                      className={`${styles.studyPlanBtn} ${isPrimary ? styles.studyPlanBtnPrimary : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        goToStudyPlan(plan.slug);
                      }}
                    >
                      <span>{plan.completed ? '✓ Completed' : plan.enrolled ? 'Continue' : 'Start Plan'}</span>
                      <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── 6. Full Study Plans Tab ── */}
      {activeTab === 'Study Plans' ? (
        <section className={styles.plansSection}>
          <div className={styles.sectionHeader}>
            <div>
              <h3 className={styles.sectionHeading}>Curated Study Plans ({plans.length})</h3>
              <p className={styles.sectionSubtitle}>
                Master targeted algorithms, data structures, and interview patterns with structured roadmaps.
              </p>
            </div>
          </div>

          <div className={styles.plansGrid5}>
            {plans.map((plan) => (
              <div key={plan.id} className={styles.studyPlanCard} onClick={() => goToStudyPlan(plan.slug)}>
                <div>
                  <div className={styles.studyPlanTop}>
                    <div className={styles.studyPlanIconBox}>{renderStudyPlanIcon(plan.slug)}</div>
                    <span
                      className={styles.studyPlanBadge}
                      style={{
                        background: plan.enrolled ? '#dcfce7' : '#f3e8ff',
                        color: plan.enrolled ? '#15803d' : '#7c3aed',
                      }}
                    >
                      {plan.completed ? 'Completed' : plan.enrolled ? 'Enrolled' : plan.tag || 'Curated'}
                    </span>
                  </div>

                  <h4 className={styles.studyPlanTitle}>{plan.title}</h4>
                  <p className={styles.studyPlanDesc}>{plan.description}</p>
                </div>

                <div>
                  <div className={styles.studyPlanMeta}>
                    <span>{plan.total_problems} problems</span>
                    <span className={styles.studyPlanMetaDot}>•</span>
                    <span>{plan.difficulty_mix}</span>
                  </div>

                  {plan.enrolled && (
                    <div style={{ marginBottom: 10 }}>
                      <div className={styles.topicCardProgressTrack}>
                        <div
                          className={styles.topicCardProgressFill}
                          style={{
                            width: `${Math.round(((plan.solved_count || 0) / Math.max(1, plan.total_problems)) * 100)}%`,
                          }}
                        />
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
                        {plan.solved_count || 0} / {plan.total_problems} solved
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    className={`${styles.studyPlanBtn} ${styles.studyPlanBtnPrimary}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      goToStudyPlan(plan.slug);
                    }}
                  >
                    <span>{plan.completed ? 'Review Plan' : plan.enrolled ? 'Continue Learning' : 'Start Plan'}</span>
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : activeTab === 'Saved' ? (
        /* ── 7. Saved Tab: Starred Problems + Custom Collections ── */
        <div className={styles.savedWrap}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className={styles.tabBtn}
              style={{ background: '#6d28d9', color: '#ffffff' }}
              onClick={() => setNewCollOpen((o) => !o)}
            >
              <BookMarked size={14} />
              <span>{newCollOpen ? 'Cancel' : 'New Collection'}</span>
            </button>
            {newCollOpen && (
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={newCollTitle}
                  onChange={(e) => setNewCollTitle(e.target.value)}
                  placeholder="Collection name (e.g. 'Binary Trees revision')"
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 13,
                    minWidth: 240,
                    outline: 'none',
                  }}
                />
                <button
                  className={styles.solveActionBtn}
                  onClick={async () => {
                    if (!newCollTitle.trim()) return;
                    try {
                      await practiceExtraService.createCollection(newCollTitle.trim());
                      setNewCollTitle('');
                      setNewCollOpen(false);
                      refreshCollections();
                      showToast('Collection created!');
                    } catch {
                      // ignore
                    }
                  }}
                >
                  Create
                </button>
              </div>
            )}
          </div>

          {collections.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: 12,
                marginBottom: 20,
              }}
            >
              {collections.map((c) => (
                <div
                  key={c.id}
                  className={styles.collectionCard}
                  onClick={async () => {
                    const detail = await practiceExtraService.collectionItems(c.id).catch(() => null);
                    if (detail) setSelectedColl(detail);
                  }}
                >
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>📁 {c.title}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>{c.item_count} problem(s)</p>
                </div>
              ))}
            </div>
          )}

          {selectedColl && (
            <div
              style={{
                background: '#ffffff',
                borderRadius: 14,
                border: '1px solid #e2e8f0',
                padding: 16,
                marginBottom: 20,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>📂 {selectedColl.collection.title}</h4>
                <button
                  className={styles.resetBtn}
                  onClick={() => setSelectedColl(null)}
                >
                  Close
                </button>
              </div>
              {selectedColl.items.map((it) => (
                <div
                  key={it.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 0',
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  <span
                    className={styles.probTitleText}
                    onClick={() => it.problem && goToProblem(it.problem.slug)}
                  >
                    {it.problem?.title ?? 'Problem'}
                  </span>
                  <button
                    className={styles.resetBtn}
                    onClick={async () => {
                      await practiceExtraService.removeFromCollection(selectedColl.collection.id, it.id).catch(() => {});
                      const detail = await practiceExtraService
                        .collectionItems(selectedColl.collection.id)
                        .catch(() => null);
                      if (detail) setSelectedColl(detail);
                      refreshCollections();
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Starred problems table */}
          <div className={styles.tableCard}>
            <table className={styles.problemsTable}>
              <thead>
                <tr>
                  <th className={styles.colNum}>#</th>
                  <th className={styles.colTitle}>Title</th>
                  <th className={styles.colDiff}>Difficulty</th>
                  <th className={styles.colTopics}>Topics</th>
                  <th className={styles.colAccept}>Acceptance</th>
                  <th className={styles.colSolved}>Solved</th>
                  <th className={styles.colActions}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProblems.map((p, idx) => (
                  <tr key={p.id}>
                    <td className={styles.colNum}>{p.lc_id || idx + 1}</td>
                    <td className={styles.colTitle}>
                      <div className={styles.probTitleWrap}>
                        <span className={styles.probTitleText} onClick={() => goToProblem(p.slug)}>
                          {p.title}
                        </span>
                        <Bookmark
                          size={14}
                          className={`${styles.tableBookmarkIcon} ${styles.tableBookmarkActive}`}
                          fill="#7c3aed"
                          onClick={(e) => toggleStar(p.id, e)}
                        />
                      </div>
                    </td>
                    <td className={styles.colDiff}>
                      <span
                        className={`${styles.diffPill} ${
                          p.difficulty === 'Easy'
                            ? styles.diffEasy
                            : p.difficulty === 'Medium'
                            ? styles.diffMedium
                            : styles.diffHard
                        }`}
                      >
                        {p.difficulty}
                      </span>
                    </td>
                    <td className={styles.colTopics}>
                      <div className={styles.topicPillsFlex}>
                        {(p.topics || [p.nexlab_topic]).slice(0, 2).map((t) => (
                          <span key={t} className={styles.topicPillItem}>
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className={styles.colAccept}>{p.acceptance_pct ?? (p.acceptance != null ? `${Math.round(p.acceptance * 100)}%` : '—')}</td>
                    <td className={styles.colSolved}>
                      <Users size={12} color="#94a3b8" />
                      <span>{p.solvers_display ?? '—'}</span>
                    </td>
                    <td className={styles.colActions}>
                      <div className={styles.actionsFlex}>
                        <button
                          type="button"
                          className={styles.solveActionBtn}
                          onClick={() => goToProblem(p.slug)}
                        >
                          <span>Solve</span>
                          <ChevronRight size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredProblems.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                      No saved problems yet. Click the bookmark icon on any problem to save it.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        /* ── 8. Topics & Categories (30 Topics) Grid View (Image 1) ── */
        <section className={styles.topicsSection}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionHeaderLeft}>
              <div className={styles.sectionHeaderIcon}>
                <LayoutGrid size={18} />
              </div>
              <div>
                <h3 className={styles.sectionHeading}>Topics &amp; Categories</h3>
                <p className={styles.sectionSubtitle}>
                  Browse problems by topic. Click on a topic to view all problems and start practicing.
                </p>
              </div>
            </div>
            <span style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 700 }}>
              {topics.length} Topics
            </span>
          </div>

          <div className={styles.topicsGrid30}>
            {topics.map((t) => {
              const pct = t.total > 0 ? Math.round((t.solved / t.total) * 100) : 0;
              const bg = getTopicCardBg(t.topic);

              return (
                <div
                  key={t.topic}
                  className={styles.topicCard30}
                  onClick={() => {
                    setSelectedTopic(t.topic);
                    setViewMode('list');
                    setPage(1);
                  }}
                >
                  <div>
                    <div className={styles.topicCardTop}>
                      <div className={styles.topicCardIconBox} style={{ background: bg }}>
                        {renderTopicIcon(t.topic)}
                      </div>
                      <div className={styles.topicCardHeaderRight}>
                        <div className={styles.topicCardTitleRow}>
                          <span className={styles.topicCardName}>{t.topic}</span>
                          <span className={styles.topicCardCount}>{t.total}</span>
                        </div>
                      </div>
                    </div>

                    <p className={styles.topicCardDesc}>{t.description || `Master ${t.topic} problems and techniques.`}</p>
                  </div>

                  <div>
                    <div className={styles.topicCardProgressTrack}>
                      <div className={styles.topicCardProgressFill} style={{ width: `${pct}%` }} />
                    </div>

                    <div className={styles.topicCardBottomMeta}>
                      <span>
                        {t.solved} / {t.total} solved
                      </span>
                      <div className={styles.topicDiffBadges}>
                        <span className={`${styles.diffCountPill} ${styles.diffCountEasy}`}>
                          E {t.easy_solved ?? 0}/{t.easy_total ?? 0}
                        </span>
                        <span className={`${styles.diffCountPill} ${styles.diffCountMedium}`}>
                          M {t.medium_solved ?? 0}/{t.medium_total ?? 0}
                        </span>
                        <span className={`${styles.diffCountPill} ${styles.diffCountHard}`}>
                          H {t.hard_solved ?? 0}/{t.hard_total ?? 0}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        /* ── 9. Coding Problems Table Section (Image 2) ── */
        <section className={styles.tableSection}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionHeaderLeft}>
              <div className={styles.sectionHeaderIcon}>
                <Code2 size={18} />
              </div>
              <div>
                <h3 className={styles.sectionHeading}>
                  {selectedTopic ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span>Problems for {selectedTopic}</span>
                      <button
                        onClick={() => setSelectedTopic('')}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#7c3aed',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        (Show All)
                      </button>
                    </span>
                  ) : (
                    `Coding Problems (${filteredProblems.length})`
                  )}
                </h3>
                <p className={styles.sectionSubtitle}>
                  Hand-picked problems across all topics and difficulty levels.
                </p>
              </div>
            </div>

            <button
              className={styles.viewAllLink}
              onClick={() => {
                handleResetFilters();
              }}
            >
              <span>View All Problems</span>
              <ChevronRight size={14} />
            </button>
          </div>

          <div className={styles.tableCard}>
            <table className={styles.problemsTable}>
              <thead>
                <tr>
                  <th className={styles.colNum}>#</th>
                  <th className={styles.colTitle}>Title</th>
                  <th className={styles.colDiff}>Difficulty</th>
                  <th className={styles.colTopics}>Topics</th>
                  <th className={styles.colAccept}>Acceptance</th>
                  <th className={styles.colSolved}>Solved</th>
                  <th className={styles.colActions}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedProblems.map((p, idx) => {
                  const isStarred = bookmarkIds.has(p.id);
                  const rowNumber = (page - 1) * pageSize + idx + 1;

                  return (
                    <tr key={p.id}>
                      <td className={styles.colNum}>{p.lc_id || rowNumber}</td>
                      <td className={styles.colTitle}>
                        <div className={styles.probTitleWrap}>
                          <span className={styles.probTitleText} onClick={() => goToProblem(p.slug)}>
                            {p.title}
                          </span>
                          <span
                            title={isStarred ? 'Remove bookmark' : 'Bookmark problem'}
                            onClick={(e) => toggleStar(p.id, e)}
                            style={{ display: 'inline-flex', cursor: 'pointer' }}
                          >
                            <Bookmark
                              size={14}
                              className={`${styles.tableBookmarkIcon} ${isStarred ? styles.tableBookmarkActive : ''}`}
                              fill={isStarred ? '#7c3aed' : 'none'}
                            />
                          </span>

                        </div>
                      </td>
                      <td className={styles.colDiff}>
                        <span
                          className={`${styles.diffPill} ${
                            p.difficulty === 'Easy'
                              ? styles.diffEasy
                              : p.difficulty === 'Medium'
                              ? styles.diffMedium
                              : styles.diffHard
                          }`}
                        >
                          {p.difficulty}
                        </span>
                      </td>
                      <td className={styles.colTopics}>
                        <div className={styles.topicPillsFlex}>
                          {(p.topics || [p.nexlab_topic]).slice(0, 3).map((t) => (
                            <span key={t} className={styles.topicPillItem}>
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className={styles.colAccept}>
                        {p.acceptance_pct ?? (p.acceptance != null ? `${Math.round(p.acceptance * 100)}%` : '—')}
                      </td>
                      <td className={styles.colSolved}>
                        <Users size={12} color="#94a3b8" />
                        <span>{p.solvers_display ?? '—'}</span>
                      </td>
                      <td className={styles.colActions}>
                        <div className={styles.actionsFlex}>
                          {p.status === 'solved' ? (
                            <span className={styles.solvedStatusText}>
                              <CheckCircle2 size={13} />
                              <span>Solved</span>
                            </span>
                          ) : null}

                          <button
                            type="button"
                            className={styles.bookmarkActionBtn}
                            onClick={(e) => toggleStar(p.id, e)}
                            title={isStarred ? 'Remove bookmark' : 'Bookmark problem'}
                          >
                            <Bookmark size={14} fill={isStarred ? '#7c3aed' : 'none'} />
                          </button>

                          <button
                            type="button"
                            className={styles.solveActionBtn}
                            onClick={() => goToProblem(p.slug)}
                          >
                            <span>{p.status === 'solved' ? 'Review' : 'Solve'}</span>
                            <ChevronRight size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredProblems.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '3.5rem', color: '#94a3b8' }}>
                      No problems match your selected filters. Try resetting the filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Pagination Controls */}
            {filteredProblems.length > 0 && (
              <div className={styles.paginationRow}>
                <span>
                  Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredProblems.length)} of{' '}
                  {filteredProblems.length} problems
                </span>

                <div className={styles.paginationControls}>
                  <button
                    type="button"
                    className={styles.pageBtn}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft size={14} />
                  </button>

                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum = i + 1;
                    if (totalPages > 5 && page > 3) {
                      pageNum = page - 2 + i;
                      if (pageNum > totalPages) pageNum = totalPages - (4 - i);
                    }
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        className={`${styles.pageBtn} ${page === pageNum ? styles.pageBtnActive : ''}`}
                        onClick={() => setPage(pageNum)}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    className={styles.pageBtn}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Toast Notice */}
      {toastMessage && <div className={styles.toastNotice}>{toastMessage}</div>}
    </div>
  );
}

// ── Public Export ─────────────────────────────────────────────────────────────

export default function PracticeLibraryPage({ baseRoute }: { baseRoute: string }) {
  return (
    <Suspense
      fallback={
        <div style={{ padding: '2rem', color: '#9891a6', fontFamily: 'Space Grotesk, sans-serif' }}>
          Loading practice library…
        </div>
      }
    >
      <PracticeLibraryInner baseRoute={baseRoute} />
    </Suspense>
  );
}
