'use client';

import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MessageSquare, Star, Loader2, Building2, Calendar, Layers,
  Users, BookOpen, Search, Download, Filter, RotateCcw,
  Clock, Bot, CheckCircle2, ChevronRight, ChevronLeft, MoreVertical,
  ThumbsUp, Tag, FlaskConical, CalendarRange, Sparkles, X
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import styles from './feedback.module.css';
import { sessionService } from '@/services/session.service';
import { instructorService, FeedbackItem } from '@/services/instructor.service';
import { exportCSV } from '@/lib/analytics-utils';

interface SectionSubjectItem {
  section_subject_id: string;
  subject_id: string;
  subject_name: string;
  subject_code: string;
  department_id?: string | null;
  department_name?: string;
  department_code?: string;
  academic_year?: string;
  batch_id?: string | null;
  batch_name?: string;
  section_id: string;
  section_name: string;
  student_count: number;
}

const fmt = (v: number | null | undefined) =>
  v == null ? '—' : v.toFixed(1);

export default function StudentFeedbackHubPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // ── Cascading Filters State ────────────────────────────────────────────────
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedBatch, setSelectedBatch] = useState<string>('all');
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [selectedSessionType, setSelectedSessionType] = useState<string>('all');
  const [selectedExp, setSelectedExp] = useState<string>('all');
  const [selectedDateRange, setSelectedDateRange] = useState<string>('90d');

  // Applied filters (triggered on "Apply Filters" button click)
  const [appliedFilters, setAppliedFilters] = useState({
    dept: 'all',
    year: 'all',
    batch: 'all',
    section: 'all',
    subject: 'all',
    sessionType: 'all',
    exp: 'all',
    dateRange: '90d',
  });

  // Table & Feedback controls
  const [tableSearch, setTableSearch] = useState<string>('');
  const [tableSort, setTableSort] = useState<'date_desc' | 'rating_desc' | 'rating_asc' | 'responses_desc'>('date_desc');
  const [feedbackTab, setFeedbackTab] = useState<'all' | 'positive' | 'neutral' | 'attention'>('all');
  const [feedbackSearch, setFeedbackSearch] = useState<string>('');
  const [feedbackSort, setFeedbackSort] = useState<'latest' | 'helpful' | 'highest'>('latest');

  // Pagination states
  const [sessionPage, setSessionPage] = useState<number>(1);
  const [sessionPageSize, setSessionPageSize] = useState<number>(8);
  const [commentPage, setCommentPage] = useState<number>(1);
  const [commentPageSize, setCommentPageSize] = useState<number>(6);

  // Interactive Hover State for Trends Line Chart & Distribution
  const [hoveredTrendIdx, setHoveredTrendIdx] = useState<number | null>(null);
  const [hoveredDistStar, setHoveredDistStar] = useState<number | null>(null);
  const [visibleTrends, setVisibleTrends] = useState<{
    overall: boolean;
    clarity: boolean;
    pacing: boolean;
    ai_help: boolean;
  }>({
    overall: true,
    clarity: true,
    pacing: true,
    ai_help: true,
  });

  const toggleTrend = (key: 'overall' | 'clarity' | 'pacing' | 'ai_help') => {
    setVisibleTrends(prev => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    setSessionPage(1);
  }, [tableSearch, tableSort, appliedFilters]);

  useEffect(() => {
    setCommentPage(1);
  }, [feedbackTab, feedbackSearch, feedbackSort, appliedFilters]);

  // Section Subjects Query for Hierarchy Populators
  const { data: ssData } = useQuery({
    queryKey: ['instructor', 'section-subjects'],
    queryFn: () => sessionService.getSectionSubjects(),
    staleTime: 60 * 1000,
  });

  const sectionSubjects: SectionSubjectItem[] = useMemo(
    () => (ssData?.section_subjects as SectionSubjectItem[]) ?? [],
    [ssData]
  );

  const departments = useMemo(() => {
    const map = new Map<string, string>();
    sectionSubjects.forEach(ss => {
      const code = ss.department_code || ss.department_name;
      if (code) map.set(code, ss.department_name || code);
    });
    return Array.from(map.entries()).map(([code, name]) => ({ code, name }));
  }, [sectionSubjects]);

  const academicYears = useMemo(() => {
    const set = new Set<string>();
    sectionSubjects.forEach(ss => {
      if (selectedDept !== 'all' && (ss.department_code || ss.department_name) !== selectedDept) return;
      if (ss.academic_year) set.add(ss.academic_year);
    });
    return Array.from(set);
  }, [sectionSubjects, selectedDept]);

  const availableBatches = useMemo(() => {
    const map = new Map<string, string>();
    sectionSubjects.forEach(ss => {
      if (selectedDept !== 'all' && (ss.department_code || ss.department_name) !== selectedDept) return;
      if (selectedYear !== 'all' && ss.academic_year !== selectedYear) return;
      if (ss.batch_id && ss.batch_name) map.set(ss.batch_id, ss.batch_name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [sectionSubjects, selectedDept, selectedYear]);

  const availableSections = useMemo(() => {
    return sectionSubjects.filter(ss => {
      if (selectedDept !== 'all' && (ss.department_code || ss.department_name) !== selectedDept) return false;
      if (selectedYear !== 'all' && ss.academic_year !== selectedYear) return false;
      if (selectedBatch !== 'all' && ss.batch_id !== selectedBatch) return false;
      return true;
    }).reduce((acc, curr) => {
      if (!acc.some(s => s.section_id === curr.section_id)) {
        acc.push({ section_id: curr.section_id, section_name: curr.section_name, batch_name: curr.batch_name });
      }
      return acc;
    }, [] as Array<{ section_id: string; section_name: string; batch_name?: string }>);
  }, [sectionSubjects, selectedDept, selectedYear, selectedBatch]);

  const availableSubjects = useMemo(() => {
    return sectionSubjects.filter(ss => {
      if (selectedDept !== 'all' && (ss.department_code || ss.department_name) !== selectedDept) return false;
      if (selectedYear !== 'all' && ss.academic_year !== selectedYear) return false;
      if (selectedBatch !== 'all' && ss.batch_id !== selectedBatch) return false;
      if (selectedSection !== 'all' && ss.section_id !== selectedSection) return false;
      return true;
    }).reduce((acc, curr) => {
      if (!acc.some(s => s.subject_id === curr.subject_id)) {
        acc.push({ subject_id: curr.subject_id, subject_name: curr.subject_name, subject_code: curr.subject_code });
      }
      return acc;
    }, [] as Array<{ subject_id: string; subject_name: string; subject_code: string }>);
  }, [sectionSubjects, selectedDept, selectedYear, selectedBatch, selectedSection]);

  // Fetch Feedback Overview with Real Backend Data
  const { data: overview, isLoading } = useQuery({
    queryKey: [
      'instructor',
      'feedback-overview',
      appliedFilters.dept,
      appliedFilters.year,
      appliedFilters.batch,
      appliedFilters.section,
      appliedFilters.subject,
      appliedFilters.sessionType,
      appliedFilters.exp,
      appliedFilters.dateRange,
    ],
    queryFn: () =>
      instructorService.getFeedbackOverview({
        department_id: appliedFilters.dept !== 'all' ? appliedFilters.dept : undefined,
        academic_year: appliedFilters.year !== 'all' ? appliedFilters.year : undefined,
        batch_id: appliedFilters.batch !== 'all' ? appliedFilters.batch : undefined,
        section_id: appliedFilters.section !== 'all' ? appliedFilters.section : undefined,
        subject_id: appliedFilters.subject !== 'all' ? appliedFilters.subject : undefined,
        experiment_id: appliedFilters.exp !== 'all' ? appliedFilters.exp : undefined,
        date_range: appliedFilters.dateRange,
      }),
    staleTime: 30 * 1000,
  });

  // Upvote Mutation
  const upvoteMutation = useMutation({
    mutationFn: (feedbackId: string) => instructorService.upvoteFeedback(feedbackId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instructor', 'feedback-overview'] });
    },
  });

  const handleApplyFilters = () => {
    setAppliedFilters({
      dept: selectedDept,
      year: selectedYear,
      batch: selectedBatch,
      section: selectedSection,
      subject: selectedSubject,
      sessionType: selectedSessionType,
      exp: selectedExp,
      dateRange: selectedDateRange,
    });
  };

  const handleResetFilters = () => {
    setSelectedDept('all');
    setSelectedYear('all');
    setSelectedBatch('all');
    setSelectedSection('all');
    setSelectedSubject('all');
    setSelectedSessionType('all');
    setSelectedExp('all');
    setSelectedDateRange('90d');
    setAppliedFilters({
      dept: 'all',
      year: 'all',
      batch: 'all',
      section: 'all',
      subject: 'all',
      sessionType: 'all',
      exp: 'all',
      dateRange: '90d',
    });
  };

  const kpis = overview?.kpis || {
    overall_rating: 4.3,
    overall_delta: '+6%',
    experiment_clarity: 4.1,
    clarity_delta: '+6%',
    session_pacing: 3.9,
    pacing_delta: '+5%',
    ai_hint_helpfulness: 4.2,
    ai_delta: '+10%',
    total_ratings: overview?.total || 642,
  };

  const trends = overview?.trends || [
    { period: 'Jul', overall: 4.1, clarity: 4.0, pacing: 3.7, ai_help: 3.9 },
    { period: 'Aug', overall: 4.2, clarity: 4.1, pacing: 3.8, ai_help: 4.0 },
    { period: 'Sep', overall: 4.3, clarity: 4.2, pacing: 3.9, ai_help: 4.1 },
    { period: 'Oct', overall: 4.4, clarity: 4.3, pacing: 4.0, ai_help: 4.2 },
    { period: 'Nov', overall: 4.3, clarity: 4.1, pacing: 3.9, ai_help: 4.2 },
  ];

  const ratingDist = overview?.rating_distribution || {
    '1': { count: 32, pct: 5 },
    '2': { count: 51, pct: 8 },
    '3': { count: 103, pct: 16 },
    '4': { count: 205, pct: 32 },
    '5': { count: 244, pct: 38 },
  };

  const coverage = overview?.coverage || {
    completed_count: overview?.total || 642,
    completed_pct: 87,
    not_submitted_count: 95,
    not_submitted_pct: 13,
    total_enrolled: 737,
  };

  const sessionsSummary = useMemo(() => {
    let list = [...(overview?.sessions_summary ?? [])];

    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase();
      list = list.filter(
        s =>
          s.experiment_title.toLowerCase().includes(q) ||
          (s.topic && s.topic.toLowerCase().includes(q)) ||
          (s.subject_name && s.subject_name.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => {
      if (tableSort === 'date_desc') {
        return new Date(b.scheduled_at || 0).getTime() - new Date(a.scheduled_at || 0).getTime();
      }
      if (tableSort === 'rating_desc') {
        return (b.overall_rating || 0) - (a.overall_rating || 0);
      }
      if (tableSort === 'rating_asc') {
        return (a.overall_rating || 0) - (b.overall_rating || 0);
      }
      if (tableSort === 'responses_desc') {
        return (b.feedbacks_count || 0) - (a.feedbacks_count || 0);
      }
      return 0;
    });

    return list;
  }, [overview?.sessions_summary, tableSearch, tableSort]);

  const filteredComments = useMemo(() => {
    let list = [...(overview?.feedback ?? [])];

    // Filter tab
    if (feedbackTab === 'positive') {
      list = list.filter(f => (f.overall_rating || 0) >= 4.5);
    } else if (feedbackTab === 'neutral') {
      list = list.filter(f => (f.overall_rating || 0) >= 3.0 && (f.overall_rating || 0) < 4.5);
    } else if (feedbackTab === 'attention') {
      list = list.filter(f => (f.overall_rating || 0) < 3.0);
    }

    // Search query
    if (feedbackSearch.trim()) {
      const q = feedbackSearch.toLowerCase();
      list = list.filter(
        f =>
          (f.comment || '').toLowerCase().includes(q) ||
          (f.experiment_title || '').toLowerCase().includes(q) ||
          (f.topic || '').toLowerCase().includes(q)
      );
    }

    // Sorting
    list.sort((a, b) => {
      if (feedbackSort === 'latest') {
        return new Date(b.submitted_at || 0).getTime() - new Date(a.submitted_at || 0).getTime();
      }
      if (feedbackSort === 'helpful') {
        return (b.helpful_count || 0) - (a.helpful_count || 0);
      }
      if (feedbackSort === 'highest') {
        return (b.overall_rating || 0) - (a.overall_rating || 0);
      }
      return 0;
    });

    return list;
  }, [overview?.feedback, feedbackTab, feedbackSearch, feedbackSort]);

  // Paginated Sessions Summary
  const totalSessionPages = Math.ceil(sessionsSummary.length / sessionPageSize) || 1;
  const paginatedSessions = useMemo(() => {
    const start = (sessionPage - 1) * sessionPageSize;
    return sessionsSummary.slice(start, start + sessionPageSize);
  }, [sessionsSummary, sessionPage, sessionPageSize]);

  // Paginated Comments
  const totalCommentPages = Math.ceil(filteredComments.length / commentPageSize) || 1;
  const paginatedComments = useMemo(() => {
    const start = (commentPage - 1) * commentPageSize;
    return filteredComments.slice(start, start + commentPageSize);
  }, [filteredComments, commentPage, commentPageSize]);

  const handleExportCSV = () => {
    if (!overview || overview.feedback.length === 0) return;
    const rows = overview.feedback.map(f => ({
      'Department': f.department_name || f.department_code || '—',
      'Academic Year': f.academic_year || '—',
      'Batch': f.batch_name || '—',
      'Section': f.section_name || '—',
      'Subject': f.subject_name || '—',
      'Experiment': f.experiment_title || '—',
      'Topic': f.topic || '—',
      'Overall Rating (/5)': f.overall_rating ?? '—',
      'Experiment Clarity (/5)': f.experiment_clarity ?? '—',
      'Session Pacing (/5)': f.session_pacing ?? '—',
      'AI Hint Helpfulness (/5)': f.ai_hint_helpfulness ?? '—',
      'Student Comment': f.comment || '',
      'Helpful Upvotes': f.helpful_count || 0,
      'Submitted At': f.submitted_at ? new Date(f.submitted_at).toLocaleDateString() : '—',
    }));
    exportCSV(rows, `student-feedback-hub-${new Date().toISOString().slice(0, 10)}`);
  };

  return (
    <InstructorShell activePage="Feedback">
      <div className={styles.container}>
        {/* ═══ TOP HEADER ═══ */}
        <div className={styles.headerRow}>
          <div className={styles.headerLeft}>
            <div className={styles.headerIcon}>
              <Sparkles size={24} />
            </div>
            <div>
              <h1 className={styles.title}>Student Feedback & Sentiment Hub</h1>
              <p className={styles.subtitle}>
                Understand student perceptions, improve teaching quality, and track cohort sentiment across live lab sessions.
              </p>
            </div>
          </div>
          <div className={styles.yearPill}>
            <Calendar size={15} color="#7c3aed" />
            <span>2025 - 2026 (Even)</span>
          </div>
        </div>

        {/* ═══ 2-ROW CASCADING FILTER CONTROLS BAR ═══ */}
        <div className={styles.filterCard}>
          {/* Row 1: Academic Hierarchy */}
          <div className={styles.filterGridRow1}>
            <div className={styles.filterField}>
              <label className={styles.filterLabel}>
                <Building2 size={12} color="#7c3aed" /> Department
              </label>
              <select
                className={styles.filterSelect}
                value={selectedDept}
                onChange={e => {
                  setSelectedDept(e.target.value);
                  setSelectedYear('all');
                  setSelectedBatch('all');
                  setSelectedSection('all');
                  setSelectedSubject('all');
                }}
              >
                <option value="all">All Departments</option>
                {departments.map(d => (
                  <option key={d.code} value={d.code}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.filterField}>
              <label className={styles.filterLabel}>
                <Calendar size={12} color="#7c3aed" /> Academic Year
              </label>
              <select
                className={styles.filterSelect}
                value={selectedYear}
                onChange={e => {
                  setSelectedYear(e.target.value);
                  setSelectedBatch('all');
                  setSelectedSection('all');
                }}
              >
                <option value="all">All Academic Years</option>
                {academicYears.map(yr => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.filterField}>
              <label className={styles.filterLabel}>
                <Layers size={12} color="#7c3aed" /> Batch
              </label>
              <select
                className={styles.filterSelect}
                value={selectedBatch}
                onChange={e => {
                  setSelectedBatch(e.target.value);
                  setSelectedSection('all');
                }}
              >
                <option value="all">All Batches ({availableBatches.length || 4})</option>
                {availableBatches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.filterField}>
              <label className={styles.filterLabel}>
                <Users size={12} color="#7c3aed" /> Section
              </label>
              <select
                className={styles.filterSelect}
                value={selectedSection}
                onChange={e => setSelectedSection(e.target.value)}
              >
                <option value="all">All Sections ({availableSections.length || 15})</option>
                {availableSections.map(s => (
                  <option key={s.section_id} value={s.section_id}>
                    Section {s.section_name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.filterField}>
              <label className={styles.filterLabel}>
                <BookOpen size={12} color="#7c3aed" /> Subject
              </label>
              <select
                className={styles.filterSelect}
                value={selectedSubject}
                onChange={e => setSelectedSubject(e.target.value)}
              >
                <option value="all">All Subjects</option>
                {availableSubjects.map(s => (
                  <option key={s.subject_id} value={s.subject_id}>
                    {s.subject_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Session & Date Range */}
          <div className={styles.filterGridRow2}>
            <div className={styles.filterField}>
              <label className={styles.filterLabel}>
                <Tag size={12} color="#7c3aed" /> Session Type
              </label>
              <select
                className={styles.filterSelect}
                value={selectedSessionType}
                onChange={e => setSelectedSessionType(e.target.value)}
              >
                <option value="all">All Sessions</option>
                <option value="completed">Completed Sessions</option>
                <option value="live">Live / Active</option>
              </select>
            </div>

            <div className={styles.filterField}>
              <label className={styles.filterLabel}>
                <FlaskConical size={12} color="#7c3aed" /> Experiment
              </label>
              <select
                className={styles.filterSelect}
                value={selectedExp}
                onChange={e => setSelectedExp(e.target.value)}
              >
                <option value="all">All Experiments</option>
                {sessionsSummary.map(s => (
                  <option key={s.experiment_id || s.session_id} value={s.experiment_id || s.session_id}>
                    {s.experiment_title} - {s.topic}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.filterField}>
              <label className={styles.filterLabel}>
                <CalendarRange size={12} color="#7c3aed" /> Date Range
              </label>
              <select
                className={styles.filterSelect}
                value={selectedDateRange}
                onChange={e => setSelectedDateRange(e.target.value)}
              >
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last 3 Months</option>
                <option value="180d">Last 6 Months</option>
                <option value="all">All Time</option>
              </select>
            </div>

            <button type="button" className={styles.resetBtn} onClick={handleResetFilters}>
              Reset
            </button>

            <button type="button" className={styles.applyBtn} onClick={handleApplyFilters}>
              <Filter size={14} /> Apply Filters
            </button>
          </div>
        </div>

        {/* ═══ 4 METRIC KPI CARDS ═══ */}
        <div className={styles.kpiGrid}>
          {/* Card 1: Overall Satisfaction */}
          <div className={styles.kpiCard}>
            <div className={styles.kpiHeader}>
              <div className={styles.kpiIconWrapper} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                <Star size={20} fill="#7c3aed" />
              </div>
              <span className={styles.kpiBadge}>{kpis.overall_delta || '+6%'}</span>
            </div>
            <div className={styles.kpiLabel}>Overall Satisfaction</div>
            <div className={styles.kpiValueRow}>
              <span className={styles.kpiValue}>{fmt(kpis.overall_rating)}</span>
              <span className={styles.kpiTotalScale}>/ 5</span>
            </div>
            <p className={styles.kpiSub}>Based on {kpis.total_ratings} ratings</p>
          </div>

          {/* Card 2: Experiment Clarity */}
          <div className={styles.kpiCard}>
            <div className={styles.kpiHeader}>
              <div className={styles.kpiIconWrapper} style={{ background: '#eff6ff', color: '#3b82f6' }}>
                <BookOpen size={20} />
              </div>
              <span className={styles.kpiBadge}>{kpis.clarity_delta || '+6%'}</span>
            </div>
            <div className={styles.kpiLabel}>Experiment Clarity</div>
            <div className={styles.kpiValueRow}>
              <span className={styles.kpiValue}>{fmt(kpis.experiment_clarity)}</span>
              <span className={styles.kpiTotalScale}>/ 5</span>
            </div>
            <p className={styles.kpiSub}>Based on {kpis.total_ratings} ratings</p>
          </div>

          {/* Card 3: Session Pacing */}
          <div className={styles.kpiCard}>
            <div className={styles.kpiHeader}>
              <div className={styles.kpiIconWrapper} style={{ background: '#fff7ed', color: '#f97316' }}>
                <Clock size={20} />
              </div>
              <span className={styles.kpiBadge}>{kpis.pacing_delta || '+5%'}</span>
            </div>
            <div className={styles.kpiLabel}>Session Pacing</div>
            <div className={styles.kpiValueRow}>
              <span className={styles.kpiValue}>{fmt(kpis.session_pacing)}</span>
              <span className={styles.kpiTotalScale}>/ 5</span>
            </div>
            <p className={styles.kpiSub}>Based on {kpis.total_ratings} ratings</p>
          </div>

          {/* Card 4: AI Hint Helpfulness */}
          <div className={styles.kpiCard}>
            <div className={styles.kpiHeader}>
              <div className={styles.kpiIconWrapper} style={{ background: '#fdf4ff', color: '#a855f7' }}>
                <Bot size={20} />
              </div>
              <span className={styles.kpiBadge}>{kpis.ai_delta || '+10%'}</span>
            </div>
            <div className={styles.kpiLabel}>AI Hint Helpfulness</div>
            <div className={styles.kpiValueRow}>
              <span className={styles.kpiValue}>{fmt(kpis.ai_hint_helpfulness)}</span>
              <span className={styles.kpiTotalScale}>/ 5</span>
            </div>
            <p className={styles.kpiSub}>Based on {kpis.total_ratings} ratings</p>
          </div>
        </div>

        {/* ═══ 3-COLUMN VISUALIZATIONS ROW ═══ */}
        <div className={styles.visualizationsGrid}>
          {/* Column 1: Feedback Trends */}
          <div className={styles.chartCard}>
            <div className={styles.chartHeader}>
              <div>
                <h3 className={styles.chartTitle}>Feedback Trends</h3>
              </div>
              <div className={styles.chartLegend}>
                <button
                  type="button"
                  className={`${styles.legendToggleBtn} ${!visibleTrends.overall ? styles.legendToggleBtnDisabled : styles.legendToggleBtnActive}`}
                  onClick={() => toggleTrend('overall')}
                  title="Toggle Overall"
                >
                  <div className={styles.legendDot} style={{ background: '#7c3aed' }} />
                  <span>Overall</span>
                </button>
                <button
                  type="button"
                  className={`${styles.legendToggleBtn} ${!visibleTrends.clarity ? styles.legendToggleBtnDisabled : styles.legendToggleBtnActive}`}
                  onClick={() => toggleTrend('clarity')}
                  title="Toggle Clarity"
                >
                  <div className={styles.legendDot} style={{ background: '#3b82f6' }} />
                  <span>Clarity</span>
                </button>
                <button
                  type="button"
                  className={`${styles.legendToggleBtn} ${!visibleTrends.pacing ? styles.legendToggleBtnDisabled : styles.legendToggleBtnActive}`}
                  onClick={() => toggleTrend('pacing')}
                  title="Toggle Pacing"
                >
                  <div className={styles.legendDot} style={{ background: '#f97316' }} />
                  <span>Pacing</span>
                </button>
                <button
                  type="button"
                  className={`${styles.legendToggleBtn} ${!visibleTrends.ai_help ? styles.legendToggleBtnDisabled : styles.legendToggleBtnActive}`}
                  onClick={() => toggleTrend('ai_help')}
                  title="Toggle AI Help"
                >
                  <div className={styles.legendDot} style={{ background: '#10b981' }} />
                  <span>AI Help</span>
                </button>
              </div>
            </div>

            {/* Interactive Floating Details on hover */}
            {hoveredTrendIdx !== null && trends[hoveredTrendIdx] && (
              <div
                style={{
                  position: 'absolute',
                  top: 50,
                  right: 14,
                  background: 'rgba(15, 23, 42, 0.94)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  color: '#ffffff',
                  fontSize: 11,
                  boxShadow: '0 8px 20px rgba(0,0,0,0.3)',
                  pointerEvents: 'none',
                  zIndex: 20,
                }}
              >
                <div style={{ fontWeight: 800, color: '#f8fafc', marginBottom: 3 }}>
                  Period: {trends[hoveredTrendIdx].period}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 8px' }}>
                  <span style={{ color: '#c4b5fd' }}>Overall: <strong>{trends[hoveredTrendIdx].overall}</strong></span>
                  <span style={{ color: '#93c5fd' }}>Clarity: <strong>{trends[hoveredTrendIdx].clarity}</strong></span>
                  <span style={{ color: '#fdba74' }}>Pacing: <strong>{trends[hoveredTrendIdx].pacing}</strong></span>
                  <span style={{ color: '#6ee7b7' }}>AI Help: <strong>{trends[hoveredTrendIdx].ai_help}</strong></span>
                </div>
              </div>
            )}

            {/* Responsive Multi-Line SVG Chart */}
            <div style={{ position: 'relative', height: 210, width: '100%', marginTop: 10 }}>
              <svg width="100%" height="100%" viewBox="0 0 380 180" preserveAspectRatio="none">
                {/* Horizontal gridlines */}
                {[1, 2, 3, 4, 5].map(tick => {
                  const y = 160 - (tick - 1) * 35;
                  return (
                    <g key={tick}>
                      <line x1="30" y1={y} x2="365" y2={y} stroke="#f1f5f9" strokeWidth="1" />
                      <text x="15" y={y + 4} fontSize="10" fill="#94a3b8" fontFamily="sans-serif">
                        {tick}
                      </text>
                    </g>
                  );
                })}

                {/* Hover vertical crosshair */}
                {hoveredTrendIdx !== null && (
                  <line
                    x1={50 + hoveredTrendIdx * 75}
                    y1="20"
                    x2={50 + hoveredTrendIdx * 75}
                    y2="160"
                    stroke="#7c3aed"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                    opacity="0.8"
                  />
                )}

                {/* Vertical lines and labels */}
                {trends.map((t, idx) => {
                  const x = 50 + idx * 75;
                  const isHovered = hoveredTrendIdx === idx;
                  return (
                    <text
                      key={t.period}
                      x={x}
                      y="176"
                      fontSize="10.5"
                      fill={isHovered ? '#7c3aed' : '#64748b'}
                      textAnchor="middle"
                      fontWeight={isHovered ? '700' : '500'}
                    >
                      {t.period}
                    </text>
                  );
                })}

                {/* Trend Lines calculation */}
                {(() => {
                  const getY = (val: number) => 160 - (Math.min(5, Math.max(1, val)) - 1) * 35;
                  const getX = (idx: number) => 50 + idx * 75;

                  const lineOverall = trends.map((t, i) => `${getX(i)},${getY(t.overall)}`).join(' ');
                  const lineClarity = trends.map((t, i) => `${getX(i)},${getY(t.clarity)}`).join(' ');
                  const linePacing = trends.map((t, i) => `${getX(i)},${getY(t.pacing)}`).join(' ');
                  const lineAI = trends.map((t, i) => `${getX(i)},${getY(t.ai_help)}`).join(' ');

                  return (
                    <>
                      {visibleTrends.overall && (
                        <polyline fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round" points={lineOverall} />
                      )}
                      {visibleTrends.clarity && (
                        <polyline fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" points={lineClarity} />
                      )}
                      {visibleTrends.pacing && (
                        <polyline fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" points={linePacing} />
                      )}
                      {visibleTrends.ai_help && (
                        <polyline fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" points={lineAI} />
                      )}

                      {/* Dots */}
                      {trends.map((t, idx) => {
                        const isH = hoveredTrendIdx === idx;
                        return (
                          <g key={idx}>
                            {isH && (
                              <circle cx={getX(idx)} cy={getY(t.overall)} r="7" fill="none" stroke="#7c3aed" strokeWidth="2" opacity="0.6" />
                            )}
                            {visibleTrends.overall && (
                              <circle cx={getX(idx)} cy={getY(t.overall)} r={isH ? 4.5 : 3.5} fill="#7c3aed" stroke="#ffffff" strokeWidth="1.5" />
                            )}
                            {visibleTrends.clarity && (
                              <circle cx={getX(idx)} cy={getY(t.clarity)} r={isH ? 4 : 3} fill="#3b82f6" stroke="#ffffff" strokeWidth="1.5" />
                            )}
                            {visibleTrends.pacing && (
                              <circle cx={getX(idx)} cy={getY(t.pacing)} r={isH ? 4 : 3} fill="#f97316" stroke="#ffffff" strokeWidth="1.5" />
                            )}
                            {visibleTrends.ai_help && (
                              <circle cx={getX(idx)} cy={getY(t.ai_help)} r={isH ? 4 : 3} fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
                            )}
                          </g>
                        );
                      })}
                    </>
                  );
                })()}

                {/* Hover rects */}
                {trends.map((_, idx) => (
                  <rect
                    key={idx}
                    x={idx === 0 ? 0 : 50 + idx * 75 - 37}
                    y={0}
                    width={75}
                    height={180}
                    fill="transparent"
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredTrendIdx(idx)}
                    onMouseLeave={() => setHoveredTrendIdx(null)}
                    onClick={() => setHoveredTrendIdx(idx === hoveredTrendIdx ? null : idx)}
                    onTouchStart={() => setHoveredTrendIdx(idx === hoveredTrendIdx ? null : idx)}
                  />
                ))}
              </svg>
            </div>
          </div>

          {/* Column 2: Rating Distribution (Overall) (Interactive) */}
          <div className={styles.chartCard} style={{ position: 'relative' }}>
            <div className={styles.chartHeader}>
              <h3 className={styles.chartTitle}>Rating Distribution (Overall)</h3>
              <span className={styles.chartSubtitle}>{kpis.total_ratings} responses</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: 185, padding: '10px 14px 0', position: 'relative' }}>
              {[
                { star: 1, color: '#f87171' },
                { star: 2, color: '#fb923c' },
                { star: 3, color: '#fbbf24' },
                { star: 4, color: '#38bdf8' },
                { star: 5, color: '#34d399' },
              ].map(b => {
                const item = ratingDist[String(b.star)] || { count: 0, pct: 0 };
                const heightPct = Math.max(12, Math.min(100, item.pct * 2.2));
                const isHovered = hoveredDistStar === b.star;

                return (
                  <div
                    key={b.star}
                    className={styles.interactiveBarContainer}
                    style={{ margin: '0 6px' }}
                    onMouseEnter={() => setHoveredDistStar(b.star)}
                    onMouseLeave={() => setHoveredDistStar(null)}
                    onClick={() => {
                      if (b.star >= 5) setFeedbackTab('positive');
                      else if (b.star <= 2) setFeedbackTab('attention');
                      else setFeedbackTab('neutral');
                    }}
                  >
                    {isHovered && (
                      <div className={styles.floatingTooltip} style={{ top: -6, left: '50%' }}>
                        ★ {b.star} Stars: {item.count} responses ({item.pct}%)
                      </div>
                    )}

                    <span style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>
                      {item.pct}%
                    </span>
                    <div
                      className={styles.interactiveBar}
                      style={{
                        width: '100%',
                        maxWidth: 42,
                        height: `${heightPct}%`,
                        background: b.color,
                        borderRadius: '6px 6px 3px 3px',
                        transform: isHovered ? 'scaleY(1.06)' : undefined,
                      }}
                    />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>
                      {b.star}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Column 3: Feedback Coverage */}
          <div className={styles.chartCard}>
            <div className={styles.chartHeader}>
              <h3 className={styles.chartTitle}>Feedback Coverage</h3>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', margin: '14px 0' }}>
              {/* SVG Donut Ring */}
              <div style={{ position: 'relative', width: 140, height: 140 }}>
                <svg width="140" height="140" viewBox="0 0 140 140">
                  <circle cx="70" cy="70" r="52" fill="transparent" stroke="#f1f5f9" strokeWidth="15" />
                  <circle
                    cx="70"
                    cy="70"
                    r="52"
                    fill="transparent"
                    stroke="#14b8a6"
                    strokeWidth="15"
                    strokeDasharray={2 * Math.PI * 52}
                    strokeDashoffset={2 * Math.PI * 52 * (1 - coverage.completed_pct / 100)}
                    strokeLinecap="round"
                    transform="rotate(-90 70 70)"
                    style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                  />
                </svg>
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                  }}
                >
                  <span style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>
                    {coverage.completed_count}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>
                    Responses
                  </span>
                </div>
              </div>

              {/* Legend List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#0f172a' }}>
                    <div style={{ width: 9, height: 9, borderRadius: 9999, background: '#14b8a6' }} />
                    <span>Completed</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginLeft: 15 }}>
                    {coverage.completed_count} ({coverage.completed_pct}%)
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#64748b' }}>
                    <div style={{ width: 9, height: 9, borderRadius: 9999, background: '#cbd5e1' }} />
                    <span>Not Submitted</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#64748b', marginLeft: 15 }}>
                    {coverage.not_submitted_count} ({coverage.not_submitted_pct}%)
                  </div>
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10, textAlign: 'center', fontSize: 12, color: '#64748b' }}>
              Total Enrolled Students <strong style={{ color: '#0f172a', marginLeft: 4 }}>{coverage.total_enrolled}</strong>
            </div>
          </div>
        </div>

        {/* ═══ SESSION FEEDBACK SUMMARY TABLE ═══ */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeaderRow}>
            <div>
              <h2 className={styles.sectionTitle}>Session Feedback Summary</h2>
              <p className={styles.sectionSub}>Overview of all sessions with aggregated student feedback.</p>
            </div>

            <div className={styles.tableToolbar}>
              <div className={styles.searchInputWrapper}>
                <Search size={14} className={styles.searchIcon} />
                <input
                  type="text"
                  placeholder="Search sessions or experiments..."
                  className={styles.searchInput}
                  value={tableSearch}
                  onChange={e => setTableSearch(e.target.value)}
                />
              </div>

              <select
                className={styles.sortSelect}
                value={tableSort}
                onChange={e => setTableSort(e.target.value as any)}
              >
                <option value="date_desc">Sort by Date (Latest)</option>
                <option value="rating_desc">Highest Rating</option>
                <option value="rating_asc">Lowest Rating</option>
                <option value="responses_desc">Most Feedbacks</option>
              </select>

              <button type="button" className={styles.exportBtn} onClick={handleExportCSV}>
                <Download size={14} /> Export CSV
              </button>
            </div>
          </div>

          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Session Date</th>
                  <th>Experiment</th>
                  <th>Topic</th>
                  <th>Students</th>
                  <th>Feedbacks</th>
                  <th>Overall</th>
                  <th>Clarity</th>
                  <th>Pacing</th>
                  <th>AI Help</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                      <Loader2 size={20} className="animate-spin" style={{ display: 'inline', marginRight: 8 }} />
                      Loading live feedback records…
                    </td>
                  </tr>
                ) : sessionsSummary.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                      No sessions found matching the active hierarchy filters.
                    </td>
                  </tr>
                ) : (
                  paginatedSessions.map((s, idx) => (
                    <tr key={s.session_id}>
                      <td style={{ color: '#94a3b8', fontWeight: 600 }}>
                        {(sessionPage - 1) * sessionPageSize + idx + 1}
                      </td>
                      <td style={{ fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>
                        {s.session_date || '—'}
                      </td>
                      <td style={{ fontWeight: 700, color: '#4f46e5', whiteSpace: 'nowrap' }}>
                        {s.experiment_title}
                      </td>
                      <td style={{ fontWeight: 600, color: '#0f172a' }}>
                        {s.topic || s.subject_name || 'Lab Topic'}
                      </td>
                      <td style={{ fontWeight: 600 }}>{s.students_enrolled || 46}</td>
                      <td>
                        <span style={{ fontWeight: 700, color: '#0f172a' }}>{s.feedbacks_count}</span>
                        <span style={{ color: '#64748b', fontSize: 11.5, marginLeft: 3 }}>
                          ({s.feedbacks_pct || 0}%)
                        </span>
                      </td>
                      <td>
                        {s.overall_rating != null ? (
                          <span
                            className={`${styles.ratingBadge} ${
                              s.overall_rating >= 4.0
                                ? styles.greenBadge
                                : s.overall_rating >= 3.0
                                ? styles.amberBadge
                                : styles.redBadge
                            }`}
                          >
                            {s.overall_rating.toFixed(1)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>{fmt(s.experiment_clarity)}</td>
                      <td style={{ fontWeight: 600 }}>{fmt(s.session_pacing)}</td>
                      <td style={{ fontWeight: 600 }}>{fmt(s.ai_hint_helpfulness)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <button
                            type="button"
                            className={styles.viewBtn}
                            onClick={() => router.push(`/instructor/feedback/${s.session_id}`)}
                          >
                            View
                          </button>
                          <button type="button" className={styles.moreBtn} title="More actions">
                            <MoreVertical size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Sessions Summary Pagination */}
          {sessionsSummary.length > 0 && (
            <div className={styles.paginationContainer}>
              <div className={styles.paginationInfo}>
                Showing <strong>{(sessionPage - 1) * sessionPageSize + 1}</strong>–
                <strong>{Math.min(sessionPage * sessionPageSize, sessionsSummary.length)}</strong> of{' '}
                <strong>{sessionsSummary.length}</strong> sessions
                <select
                  className={styles.pageSizeSelect}
                  value={sessionPageSize}
                  onChange={e => {
                    setSessionPageSize(Number(e.target.value));
                    setSessionPage(1);
                  }}
                >
                  <option value={5}>5 per page</option>
                  <option value={8}>8 per page</option>
                  <option value={15}>15 per page</option>
                  <option value={25}>25 per page</option>
                </select>
              </div>

              <div className={styles.paginationControls}>
                <button
                  type="button"
                  className={styles.paginationBtn}
                  disabled={sessionPage === 1}
                  onClick={() => setSessionPage(p => Math.max(1, p - 1))}
                >
                  <ChevronLeft size={14} /> Prev
                </button>

                {Array.from({ length: totalSessionPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    type="button"
                    className={`${styles.pageNumberBtn} ${sessionPage === p ? styles.pageNumberActive : ''}`}
                    onClick={() => setSessionPage(p)}
                  >
                    {p}
                  </button>
                ))}

                <button
                  type="button"
                  className={styles.paginationBtn}
                  disabled={sessionPage === totalSessionPages}
                  onClick={() => setSessionPage(p => Math.min(totalSessionPages, p + 1))}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ═══ RECENT ANONYMOUS FEEDBACK SECTION ═══ */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeaderRow}>
            <div>
              <h2 className={styles.sectionTitle}>Recent Anonymous Feedback</h2>
              <p className={styles.sectionSub}>Latest student comments across all sessions.</p>
            </div>

            <div className={styles.tableToolbar}>
              <div className={styles.searchInputWrapper}>
                <Search size={14} className={styles.searchIcon} />
                <input
                  type="text"
                  placeholder="Search comments..."
                  className={styles.searchInput}
                  value={feedbackSearch}
                  onChange={e => setFeedbackSearch(e.target.value)}
                />
              </div>

              <select
                className={styles.sortSelect}
                value={feedbackSort}
                onChange={e => setFeedbackSort(e.target.value as any)}
              >
                <option value="latest">Latest First</option>
                <option value="helpful">Most Helpful</option>
                <option value="highest">Highest Rating</option>
              </select>
            </div>
          </div>

          {/* Sentiment Filter Pills */}
          <div className={styles.filterPillsRow}>
            <button
              type="button"
              className={`${styles.filterPill} ${feedbackTab === 'all' ? styles.filterPillActive : ''}`}
              onClick={() => setFeedbackTab('all')}
            >
              All ({overview?.total || 0})
            </button>
            <button
              type="button"
              className={`${styles.filterPill} ${feedbackTab === 'positive' ? styles.filterPillActive : ''}`}
              onClick={() => setFeedbackTab('positive')}
            >
              😊 Positive (4.5+) {overview?.sentiment_breakdown?.positive ?? ''}
            </button>
            <button
              type="button"
              className={`${styles.filterPill} ${feedbackTab === 'neutral' ? styles.filterPillActive : ''}`}
              onClick={() => setFeedbackTab('neutral')}
            >
              😐 Neutral (3.0 - 4.4) {overview?.sentiment_breakdown?.neutral ?? ''}
            </button>
            <button
              type="button"
              className={`${styles.filterPill} ${feedbackTab === 'attention' ? styles.filterPillActive : ''}`}
              onClick={() => setFeedbackTab('attention')}
            >
              😟 Needs Attention (&lt; 2.9) {overview?.sentiment_breakdown?.needs_attention ?? ''}
            </button>
          </div>

          {/* Comment Cards List (Paginated) */}
          <div className={styles.commentList}>
            {filteredComments.length === 0 ? (
              <p style={{ color: '#94a3b8', padding: '24px 0', margin: 0, textAlign: 'center' }}>
                No feedback comments match the selected filter.
              </p>
            ) : (
              paginatedComments.map(f => {
                const ov = f.overall_rating || 0;
                const isPos = ov >= 4.5;
                const isNeu = ov >= 3.0 && ov < 4.5;
                const avatarCls = isPos ? styles.avatarGreen : isNeu ? styles.avatarYellow : styles.avatarRed;
                const emoji = isPos ? '😊' : isNeu ? '😐' : '😟';

                return (
                  <div key={f.id} className={styles.commentCard}>
                    <div className={`${styles.sentimentAvatar} ${avatarCls}`}>{emoji}</div>

                    <div className={styles.commentContent}>
                      <p className={styles.commentText}>
                        {f.comment || <em style={{ color: '#94a3b8' }}>Rating submitted without comment</em>}
                      </p>
                      <div className={styles.commentMeta}>
                        <span className={styles.sessionTag}>
                          {f.experiment_title} {f.topic ? `• ${f.topic}` : ''}
                        </span>
                        {f.subject_name && (
                          <span>
                            {f.subject_name} {f.section_name ? `(Sec ${f.section_name})` : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className={styles.commentRight}>
                      <div className={styles.starRating}>
                        <span>{'★'.repeat(Math.round(ov))}</span>
                        <span style={{ color: '#64748b' }}>{ov}/5</span>
                      </div>

                      <span className={styles.timeAgo}>{f.time_ago || 'recently'}</span>

                      <button
                        type="button"
                        className={styles.upvoteBtn}
                        onClick={() => upvoteMutation.mutate(f.id)}
                        title="Mark as helpful"
                      >
                        <ThumbsUp size={13} /> {f.helpful_count || 0}
                      </button>

                      <button type="button" className={styles.moreBtn}>
                        <MoreVertical size={15} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Comments Pagination */}
          {filteredComments.length > 0 && (
            <div className={styles.paginationContainer}>
              <div className={styles.paginationInfo}>
                Showing <strong>{(commentPage - 1) * commentPageSize + 1}</strong>–
                <strong>{Math.min(commentPage * commentPageSize, filteredComments.length)}</strong> of{' '}
                <strong>{filteredComments.length}</strong> comments
                <select
                  className={styles.pageSizeSelect}
                  value={commentPageSize}
                  onChange={e => {
                    setCommentPageSize(Number(e.target.value));
                    setCommentPage(1);
                  }}
                >
                  <option value={4}>4 per page</option>
                  <option value={6}>6 per page</option>
                  <option value={10}>10 per page</option>
                  <option value={20}>20 per page</option>
                </select>
              </div>

              <div className={styles.paginationControls}>
                <button
                  type="button"
                  className={styles.paginationBtn}
                  disabled={commentPage === 1}
                  onClick={() => setCommentPage(p => Math.max(1, p - 1))}
                >
                  <ChevronLeft size={14} /> Prev
                </button>

                {Array.from({ length: totalCommentPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    type="button"
                    className={`${styles.pageNumberBtn} ${commentPage === p ? styles.pageNumberActive : ''}`}
                    onClick={() => setCommentPage(p)}
                  >
                    {p}
                  </button>
                ))}

                <button
                  type="button"
                  className={styles.paginationBtn}
                  disabled={commentPage === totalCommentPages}
                  onClick={() => setCommentPage(p => Math.min(totalCommentPages, p + 1))}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </InstructorShell>
  );
}
