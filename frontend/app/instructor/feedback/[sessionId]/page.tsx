'use client';

import { use, useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MessageSquare, Star, Loader2, ArrowLeft, Calendar,
  Users, BookOpen, Clock, Bot, Download, Search,
  CheckCircle2, Shield, ThumbsUp, TrendingUp,
  FlaskConical, BarChart2, Eye, FileText,
  Sparkles, Check, ArrowRight, CheckCircle,
  HelpCircle, ChevronLeft, ChevronRight, X
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import styles from '../feedback.module.css';
import { instructorService } from '@/services/instructor.service';
import { exportCSV } from '@/lib/analytics-utils';

const fmt = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(1));

export default function SessionFeedbackDetailsPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const resolvedParams = use(params);
  const sessionId = resolvedParams.sessionId;
  const router = useRouter();
  const queryClient = useQueryClient();

  // Active Tab: Overview | Detailed Ratings | Anonymous Feedback | Session Context
  const [activeTab, setActiveTab] = useState<'overview' | 'ratings' | 'feedback' | 'context'>('ratings');

  // Anonymous Feedback filters & controls
  const [feedbackTab, setFeedbackTab] = useState<'all' | 'positive' | 'neutral' | 'attention'>('all');
  const [feedbackSearch, setFeedbackSearch] = useState<string>('');
  const [feedbackSort, setFeedbackSort] = useState<'latest' | 'helpful' | 'highest' | 'lowest'>('latest');
  const [ratingFilter, setRatingFilter] = useState<string>('all');

  // Interactive Chart States
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);
  const [hoveredComparison, setHoveredComparison] = useState<string | null>(null);
  const [hoveredTrendIdx, setHoveredTrendIdx] = useState<number | null>(null);
  const [hoveredStacked, setHoveredStacked] = useState<{ rowKey: string; star: number } | null>(null);
  const [visibleTrendLines, setVisibleTrendLines] = useState<{
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

  const toggleTrendLine = (key: 'overall' | 'clarity' | 'pacing' | 'ai_help') => {
    setVisibleTrendLines(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Pagination for Anonymous Feedback Tab
  const [feedbackPage, setFeedbackPage] = useState<number>(1);
  const [feedbackPageSize, setFeedbackPageSize] = useState<number>(6);

  // Pagination for Overview Tab comment stream
  const [overviewPage, setOverviewPage] = useState<number>(1);
  const [overviewPageSize, setOverviewPageSize] = useState<number>(5);

  // Reset pagination when filters change
  useEffect(() => {
    setFeedbackPage(1);
    setOverviewPage(1);
  }, [feedbackTab, ratingFilter, feedbackSearch, feedbackSort]);

  // Fetch Session Feedback Details from Real Backend
  const { data: details, isLoading } = useQuery({
    queryKey: ['instructor', 'session-feedback-details', sessionId],
    queryFn: () => instructorService.getSessionFeedbackDetails(sessionId),
    staleTime: 30 * 1000,
  });

  // Upvote mutation with optimistic query invalidation
  const upvoteMutation = useMutation({
    mutationFn: (feedbackId: string) => instructorService.upvoteFeedback(feedbackId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instructor', 'session-feedback-details', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['instructor', 'feedback-overview'] });
    },
  });

  const session = details?.session;
  const kpis = details?.kpis || {
    overall_rating: 4.2,
    experiment_clarity: 4.1,
    session_pacing: 3.8,
    ai_hint_helpfulness: 4.0,
    total_responses: 40,
  };

  const ratingDist = details?.rating_distribution || {
    '1': { count: 1, pct: 2 },
    '2': { count: 2, pct: 5 },
    '3': { count: 5, pct: 12 },
    '4': { count: 14, pct: 35 },
    '5': { count: 18, pct: 45 },
  };

  const breakdowns = details?.detailed_breakdowns || {
    overall: details?.rating_distribution || {
      '1': { count: 1, pct: 3 },
      '2': { count: 2, pct: 5 },
      '3': { count: 5, pct: 12 },
      '4': { count: 14, pct: 35 },
      '5': { count: 18, pct: 45 },
    },
    clarity: {
      '1': { count: 2, pct: 5 },
      '2': { count: 2, pct: 6 },
      '3': { count: 6, pct: 15 },
      '4': { count: 13, pct: 32 },
      '5': { count: 17, pct: 46 },
    },
    pacing: {
      '1': { count: 3, pct: 8 },
      '2': { count: 5, pct: 12 },
      '3': { count: 9, pct: 23 },
      '4': { count: 13, pct: 32 },
      '5': { count: 10, pct: 25 },
    },
    ai_helpfulness: {
      '1': { count: 2, pct: 5 },
      '2': { count: 3, pct: 8 },
      '3': { count: 6, pct: 16 },
      '4': { count: 14, pct: 36 },
      '5': { count: 15, pct: 40 },
    },
  };

  const comparison = details?.rating_comparison || [
    { metric: 'Overall', session: 4.2, subject_avg: 3.9 },
    { metric: 'Clarity', session: 4.1, subject_avg: 3.8 },
    { metric: 'Pacing', session: 3.8, subject_avg: 3.6 },
    { metric: 'AI Hints', session: 4.0, subject_avg: 3.7 },
  ];

  const recentTrend = details?.recent_sessions_trend || [
    { label: 'Lab 1', overall: 4.6, clarity: 4.5, pacing: 4.3, ai_help: 4.5, is_current: false },
    { label: 'Lab 2', overall: 4.3, clarity: 4.4, pacing: 4.0, ai_help: 4.3, is_current: false },
    { label: 'Lab 3', overall: 4.1, clarity: 4.0, pacing: 3.6, ai_help: 4.2, is_current: false },
    { label: 'Lab 4 (Current)', overall: 4.2, clarity: 4.1, pacing: 3.8, ai_help: 4.0, is_current: true },
    { label: 'Lab 5', overall: 4.5, clarity: 4.6, pacing: 4.1, ai_help: 4.4, is_current: false },
  ];

  const insights = details?.key_insights || [
    {
      id: 'overall_vs_avg',
      type: 'positive' as const,
      title: 'Higher than subject average',
      description: 'Overall rating is 0.3 above the subject aggregate average.',
      icon: 'trending-up',
    },
    {
      id: 'pacing_insight',
      type: 'warning' as const,
      title: 'Pacing needs attention',
      description: 'Session pacing is slightly lower than target pacing index.',
      icon: 'clock',
    },
    {
      id: 'clarity_insight',
      type: 'info' as const,
      title: 'High experiment clarity',
      description: 'Experiment clarity is strong with 4.1/5 approval rating.',
      icon: 'book-open',
    },
    {
      id: 'ai_insight',
      type: 'purple' as const,
      title: 'Positive AI assistance feedback',
      description: 'AI hint helpfulness is rated favorably at 4.0/5.',
      icon: 'bot',
    },
  ];

  const filteredFeedback = useMemo(() => {
    let list = [...(details?.feedback ?? [])];

    // Sentiment Filter
    if (feedbackTab === 'positive') {
      list = list.filter(f => (f.overall_rating || 0) >= 4.5);
    } else if (feedbackTab === 'neutral') {
      list = list.filter(f => (f.overall_rating || 0) >= 3.0 && (f.overall_rating || 0) < 4.5);
    } else if (feedbackTab === 'attention') {
      list = list.filter(f => (f.overall_rating || 0) < 3.0);
    }

    // Star Rating Filter
    if (ratingFilter !== 'all') {
      const starTarget = parseInt(ratingFilter, 10);
      list = list.filter(f => Math.round(f.overall_rating || 0) === starTarget);
    }

    // Search Query Filter
    if (feedbackSearch.trim()) {
      const q = feedbackSearch.toLowerCase();
      list = list.filter(f => (f.comment || '').toLowerCase().includes(q));
    }

    // Sort order
    list.sort((a, b) => {
      if (feedbackSort === 'helpful') {
        return (b.helpful_count || 0) - (a.helpful_count || 0);
      }
      if (feedbackSort === 'latest') {
        return new Date(b.submitted_at || 0).getTime() - new Date(a.submitted_at || 0).getTime();
      }
      if (feedbackSort === 'highest') {
        return (b.overall_rating || 0) - (a.overall_rating || 0);
      }
      if (feedbackSort === 'lowest') {
        return (a.overall_rating || 0) - (b.overall_rating || 0);
      }
      return 0;
    });

    return list;
  }, [details?.feedback, feedbackTab, feedbackSearch, feedbackSort, ratingFilter]);

  // Paginated Slices
  const totalFeedbackPages = Math.ceil(filteredFeedback.length / feedbackPageSize) || 1;
  const paginatedFeedback = useMemo(() => {
    const start = (feedbackPage - 1) * feedbackPageSize;
    return filteredFeedback.slice(start, start + feedbackPageSize);
  }, [filteredFeedback, feedbackPage, feedbackPageSize]);

  const totalOverviewPages = Math.ceil(filteredFeedback.length / overviewPageSize) || 1;
  const paginatedOverviewFeedback = useMemo(() => {
    const start = (overviewPage - 1) * overviewPageSize;
    return filteredFeedback.slice(start, start + overviewPageSize);
  }, [filteredFeedback, overviewPage, overviewPageSize]);

  const handleExportSessionCSV = () => {
    if (!details || details.feedback.length === 0) return;
    const rows = details.feedback.map(f => ({
      'Session Title': session?.title || '—',
      'Experiment': session?.experiment_title || '—',
      'Subject': session?.subject_name || '—',
      'Section': session?.section_name || '—',
      'Overall Rating (/5)': f.overall_rating ?? '—',
      'Clarity (/5)': f.experiment_clarity ?? '—',
      'Pacing (/5)': f.session_pacing ?? '—',
      'AI Help (/5)': f.ai_hint_helpfulness ?? '—',
      'Comment': f.comment || '',
      'Helpful Upvotes': f.helpful_count || 0,
      'Submitted At': f.submitted_at ? new Date(f.submitted_at).toLocaleString() : '—',
    }));
    exportCSV(rows, `session-feedback-${session?.topic || sessionId}-${new Date().toISOString().slice(0, 10)}`);
  };

  const handleDownloadResource = (res: { name: string; format: string }) => {
    const blob = new Blob([`Content for ${res.name} (${res.format.toUpperCase()})`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${res.name.toLowerCase().replace(/\s+/g, '-')}.${res.format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <InstructorShell activePage="Feedback">
      <div className={styles.container}>
        {/* ═══ BREADCRUMB ═══ */}
        <div className={styles.breadcrumb}>
          <span
            className={styles.breadcrumbLink}
            onClick={() => router.push('/instructor/feedback')}
          >
            Student Feedback
          </span>
          <span>&gt;</span>
          <span className={styles.breadcrumbActive}>Session Details</span>
        </div>

        {/* ═══ TOP SESSION HEADER ═══ */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className={styles.bannerIcon} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
              <FlaskConical size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h1 className={styles.bannerTitle} style={{ fontSize: 22 }}>
                  {session?.title || 'Lab 4 — Graphs & Shortest Path'}
                </h1>
                <span className={styles.statusCompleted}>
                  <Check size={12} style={{ marginRight: 4 }} /> Completed
                </span>
              </div>
              <p className={styles.bannerSubtitle}>
                {session?.subject_name || 'Data Structures & Algorithms'} ({session?.subject_code || 'CS301'}) | {session?.section_name || 'Section A'} | Batch {session?.batch_name || '2026-A'}
              </p>
            </div>
          </div>

          <div className={styles.sessionHeaderRightMeta}>
            <div className={styles.responsesBadgeText}>
              <strong>{session?.feedback_submitted || 40}</strong> of <strong>{session?.students_enrolled || 46}</strong> responses ({session?.feedback_pct || 87}%)
            </div>
            <div className={styles.responsesProgressBar}>
              <div
                className={styles.responsesProgressFill}
                style={{ width: `${session?.feedback_pct || 87}%` }}
              />
            </div>
          </div>
        </div>

        {/* ═══ SUBPAGE NAVIGATION TABS ═══ */}
        <div className={styles.tabsContainer}>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'overview' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <Eye size={16} /> Overview
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'ratings' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('ratings')}
          >
            <BarChart2 size={16} /> Detailed Ratings
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'feedback' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('feedback')}
          >
            <MessageSquare size={16} /> Anonymous Feedback ({details?.feedback.length || 40})
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'context' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('context')}
          >
            <FileText size={16} /> Session Context
          </button>
        </div>

        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#64748b', padding: '60px 10px', justifyContent: 'center' }}>
            <Loader2 size={24} className="animate-spin" /> Loading session feedback details…
          </div>
        ) : (
          <>
            {/* ══════════════════════════════════════════════════════════════════
                1. DETAILED RATINGS SUBPAGE (Interactive Charts)
                ══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'ratings' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* 4 Metric KPI Cards */}
                <div className={styles.kpiGrid}>
                  <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                      <div className={styles.kpiIconWrapper} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                        <Star size={20} fill="#7c3aed" />
                      </div>
                    </div>
                    <div className={styles.kpiLabel}>Overall Rating</div>
                    <div className={styles.kpiValueRow}>
                      <span className={styles.kpiValue}>{fmt(kpis.overall_rating)}</span>
                      <span className={styles.kpiTotalScale}>/ 5</span>
                    </div>
                    <p className={styles.kpiSub}>{kpis.total_responses || 60} responses</p>
                  </div>

                  <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                      <div className={styles.kpiIconWrapper} style={{ background: '#eff6ff', color: '#2563eb' }}>
                        <BookOpen size={20} />
                      </div>
                    </div>
                    <div className={styles.kpiLabel}>Experiment Clarity</div>
                    <div className={styles.kpiValueRow}>
                      <span className={styles.kpiValue}>{fmt(kpis.experiment_clarity)}</span>
                      <span className={styles.kpiTotalScale}>/ 5</span>
                    </div>
                    <p className={styles.kpiSub}>{kpis.total_responses || 60} responses</p>
                  </div>

                  <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                      <div className={styles.kpiIconWrapper} style={{ background: '#fff7ed', color: '#f97316' }}>
                        <Clock size={20} />
                      </div>
                    </div>
                    <div className={styles.kpiLabel}>Session Pacing</div>
                    <div className={styles.kpiValueRow}>
                      <span className={styles.kpiValue}>{fmt(kpis.session_pacing)}</span>
                      <span className={styles.kpiTotalScale}>/ 5</span>
                    </div>
                    <p className={styles.kpiSub}>{kpis.total_responses || 60} responses</p>
                  </div>

                  <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                      <div className={styles.kpiIconWrapper} style={{ background: '#fdf4ff', color: '#a855f7' }}>
                        <Bot size={20} />
                      </div>
                    </div>
                    <div className={styles.kpiLabel}>AI Hint Helpfulness</div>
                    <div className={styles.kpiValueRow}>
                      <span className={styles.kpiValue}>{fmt(kpis.ai_hint_helpfulness)}</span>
                      <span className={styles.kpiTotalScale}>/ 5</span>
                    </div>
                    <p className={styles.kpiSub}>{kpis.total_responses || 60} responses</p>
                  </div>
                </div>

                {/* 2 Charts Row: Rating Distribution & Session vs Subject Average */}
                <div className={styles.dualChartsGrid}>
                  {/* Overall Rating Distribution (Interactive: Hover Tooltips + Click to Filter) */}
                  <div className={styles.chartCard} style={{ position: 'relative' }}>
                    <div className={styles.chartHeader}>
                      <div>
                        <h3 className={styles.chartTitle}>Overall Rating Distribution</h3>
                        <span className={styles.chartSubtitle} style={{ fontSize: 11.5, color: '#94a3b8' }}>
                          Hover for details • Click bar to filter comments
                        </span>
                      </div>

                      {ratingFilter !== 'all' && (
                        <div className={styles.activeFilterBadge}>
                          <span>Filter: ★ {ratingFilter}</span>
                          <button
                            type="button"
                            className={styles.clearFilterBtn}
                            onClick={() => setRatingFilter('all')}
                            title="Clear star filter"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: 210, padding: '16px 14px 10px', position: 'relative' }}>
                      {[
                        { star: 1, color: '#f87171' },
                        { star: 2, color: '#fb923c' },
                        { star: 3, color: '#fbbf24' },
                        { star: 4, color: '#38bdf8' },
                        { star: 5, color: '#34d399' },
                      ].map(b => {
                        const item = ratingDist[String(b.star)] || { count: 0, pct: 0 };
                        const heightPct = Math.max(14, Math.min(100, item.pct * 2.1));
                        const isSelected = ratingFilter === String(b.star);
                        const isDimmed = ratingFilter !== 'all' && !isSelected;

                        return (
                          <div
                            key={b.star}
                            className={styles.interactiveBarContainer}
                            style={{ maxWidth: 58 }}
                            onMouseEnter={() => setHoveredStar(b.star)}
                            onMouseLeave={() => setHoveredStar(null)}
                            onClick={() => {
                              const newFilter = ratingFilter === String(b.star) ? 'all' : String(b.star);
                              setRatingFilter(newFilter);
                            }}
                          >
                            {/* Interactive Floating Tooltip */}
                            {hoveredStar === b.star && (
                              <div className={styles.floatingTooltip} style={{ top: -8, left: '50%' }}>
                                <div style={{ fontWeight: 800, color: '#f8fafc', marginBottom: 2 }}>
                                  ★ {b.star} Star{b.star > 1 ? 's' : ''}
                                </div>
                                <div>{item.count} responses ({item.pct}%)</div>
                                <div style={{ fontSize: 10, color: '#c4b5fd', marginTop: 4, fontWeight: 600 }}>
                                  {isSelected ? '✓ Filtered (Click to reset)' : 'Click to filter comments'}
                                </div>
                              </div>
                            )}

                            <span style={{ fontSize: 11, fontWeight: 700, color: isSelected ? '#7c3aed' : '#475569', textAlign: 'center', whiteSpace: 'nowrap' }}>
                              {item.pct}%<br />
                              <span style={{ fontSize: 9.5, color: '#94a3b8', fontWeight: 600 }}>({item.count})</span>
                            </span>

                            <div
                              className={`${styles.interactiveBar} ${isSelected ? styles.interactiveBarActive : ''} ${isDimmed ? styles.interactiveBarDimmed : ''}`}
                              style={{
                                width: 34,
                                height: `${heightPct}%`,
                                background: b.color,
                                borderRadius: '6px 6px 3px 3px',
                              }}
                            />

                            <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 4 }}>
                              <Star size={13} fill={b.color} color={b.color} />
                              <span style={{ fontSize: 12, fontWeight: 700, color: isSelected ? '#7c3aed' : '#475569' }}>
                                {b.star}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* This Session vs Subject Average (Interactive Hover Delta Tooltips) */}
                  <div className={styles.chartCard} style={{ position: 'relative' }}>
                    <div className={styles.chartHeader}>
                      <div>
                        <h3 className={styles.chartTitle}>This Session vs Subject Average</h3>
                        <span className={styles.chartSubtitle} style={{ fontSize: 11.5, color: '#94a3b8' }}>
                          Hover bars to compare benchmark delta
                        </span>
                      </div>
                      <div className={styles.chartLegend}>
                        <div className={styles.legendItem}>
                          <div className={styles.legendDot} style={{ background: '#7c3aed' }} />
                          <span>This Session</span>
                        </div>
                        <div className={styles.legendItem}>
                          <div className={styles.legendDot} style={{ background: '#c4b5fd' }} />
                          <span>Subject Average</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: 210, padding: '16px 14px 10px', position: 'relative' }}>
                      {comparison.map(c => {
                        const sessionH = Math.max(20, (c.session / 5.0) * 160);
                        const subjH = Math.max(20, (c.subject_avg / 5.0) * 160);
                        const diff = Math.round((c.session - c.subject_avg) * 10) / 10;
                        const isHovered = hoveredComparison === c.metric;

                        return (
                          <div
                            key={c.metric}
                            className={styles.interactiveBarContainer}
                            style={{ position: 'relative' }}
                            onMouseEnter={() => setHoveredComparison(c.metric)}
                            onMouseLeave={() => setHoveredComparison(null)}
                          >
                            {/* Hover Tooltip showing variance and percentage */}
                            {isHovered && (
                              <div className={styles.floatingTooltip} style={{ top: -8, left: '50%' }}>
                                <div style={{ fontWeight: 800, color: '#f8fafc', marginBottom: 2 }}>
                                  {c.metric} Benchmark
                                </div>
                                <div>Session: <strong style={{ color: '#c4b5fd' }}>{c.session.toFixed(1)}/5</strong></div>
                                <div>Average: <strong style={{ color: '#cbd5e1' }}>{c.subject_avg.toFixed(1)}/5</strong></div>
                                <div style={{ marginTop: 3, fontWeight: 700, color: diff >= 0 ? '#4ade80' : '#fb923c' }}>
                                  {diff >= 0 ? `+${diff.toFixed(1)} above subject avg` : `${diff.toFixed(1)} below subject avg`}
                                </div>
                              </div>
                            )}

                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 160 }}>
                              {/* Session Bar */}
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#7c3aed' }}>
                                  {c.session.toFixed(1)}
                                </span>
                                <div
                                  className={styles.interactiveBar}
                                  style={{
                                    width: 22,
                                    height: `${sessionH}px`,
                                    background: '#7c3aed',
                                    borderRadius: '5px 5px 2px 2px',
                                    transform: isHovered ? 'scaleY(1.04)' : undefined,
                                  }}
                                />
                              </div>

                              {/* Subject Avg Bar */}
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8b5cf6' }}>
                                  {c.subject_avg.toFixed(1)}
                                </span>
                                <div
                                  className={styles.interactiveBar}
                                  style={{
                                    width: 22,
                                    height: `${subjH}px`,
                                    background: '#c4b5fd',
                                    borderRadius: '5px 5px 2px 2px',
                                    transform: isHovered ? 'scaleY(1.04)' : undefined,
                                  }}
                                />
                              </div>
                            </div>

                            <span style={{ fontSize: 12, fontWeight: 700, color: isHovered ? '#7c3aed' : '#475569', marginTop: 2 }}>
                              {c.metric}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 2 Cards Row: Rating Trends (Interactive toggles + Crosshairs) & Response Summary */}
                <div className={styles.dualChartsGrid}>
                  {/* Rating Trends Line Chart */}
                  <div className={styles.chartCard} style={{ position: 'relative' }}>
                    <div className={styles.chartHeader}>
                      <div>
                        <h3 className={styles.chartTitle}>Rating Trends (Last 5 Sessions)</h3>
                        <span className={styles.chartSubtitle} style={{ fontSize: 11, color: '#94a3b8' }}>
                          Click metric to toggle • Hover points for details
                        </span>
                      </div>

                      {/* Clickable Toggle Legend */}
                      <div className={styles.chartLegend}>
                        <button
                          type="button"
                          className={`${styles.legendToggleBtn} ${!visibleTrendLines.overall ? styles.legendToggleBtnDisabled : styles.legendToggleBtnActive}`}
                          onClick={() => toggleTrendLine('overall')}
                          title="Toggle Overall Rating line"
                        >
                          <div className={styles.legendDot} style={{ background: '#7c3aed' }} />
                          <span>Overall</span>
                        </button>

                        <button
                          type="button"
                          className={`${styles.legendToggleBtn} ${!visibleTrendLines.clarity ? styles.legendToggleBtnDisabled : styles.legendToggleBtnActive}`}
                          onClick={() => toggleTrendLine('clarity')}
                          title="Toggle Clarity line"
                        >
                          <div className={styles.legendDot} style={{ background: '#10b981' }} />
                          <span>Clarity</span>
                        </button>

                        <button
                          type="button"
                          className={`${styles.legendToggleBtn} ${!visibleTrendLines.pacing ? styles.legendToggleBtnDisabled : styles.legendToggleBtnActive}`}
                          onClick={() => toggleTrendLine('pacing')}
                          title="Toggle Pacing line"
                        >
                          <div className={styles.legendDot} style={{ background: '#f97316' }} />
                          <span>Pacing</span>
                        </button>

                        <button
                          type="button"
                          className={`${styles.legendToggleBtn} ${!visibleTrendLines.ai_help ? styles.legendToggleBtnDisabled : styles.legendToggleBtnActive}`}
                          onClick={() => toggleTrendLine('ai_help')}
                          title="Toggle AI Hints line"
                        >
                          <div className={styles.legendDot} style={{ background: '#3b82f6' }} />
                          <span>AI Hints</span>
                        </button>
                      </div>
                    </div>

                    {/* Interactive Floating Details Badge on hover */}
                    {hoveredTrendIdx !== null && recentTrend[hoveredTrendIdx] && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 50,
                          right: 18,
                          background: 'rgba(15, 23, 42, 0.94)',
                          backdropFilter: 'blur(8px)',
                          border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: 10,
                          padding: '10px 14px',
                          color: '#ffffff',
                          fontSize: 11.5,
                          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                          pointerEvents: 'none',
                          zIndex: 20,
                        }}
                      >
                        <div style={{ fontWeight: 800, color: '#f8fafc', marginBottom: 4 }}>
                          {recentTrend[hoveredTrendIdx].title || recentTrend[hoveredTrendIdx].label}
                          {recentTrend[hoveredTrendIdx].is_current && (
                            <span style={{ marginLeft: 6, fontSize: 10, background: '#7c3aed', padding: '1px 6px', borderRadius: 4 }}>
                              Current
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
                          <span style={{ color: '#c4b5fd' }}>Overall: <strong>{recentTrend[hoveredTrendIdx].overall}</strong></span>
                          <span style={{ color: '#6ee7b7' }}>Clarity: <strong>{recentTrend[hoveredTrendIdx].clarity}</strong></span>
                          <span style={{ color: '#fdba74' }}>Pacing: <strong>{recentTrend[hoveredTrendIdx].pacing}</strong></span>
                          <span style={{ color: '#93c5fd' }}>AI Hints: <strong>{recentTrend[hoveredTrendIdx].ai_help}</strong></span>
                        </div>
                      </div>
                    )}

                    <div style={{ padding: '8px 4px 4px' }}>
                      <svg width="100%" height="200" viewBox="0 0 460 200" style={{ overflow: 'visible' }}>
                        {/* Grid lines */}
                        {[1, 2, 3, 4, 5].map(rating => {
                          const y = 170 - (rating - 1) * 35;
                          return (
                            <g key={rating}>
                              <line x1="36" y1={y} x2="430" y2={y} stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                              <text x="24" y={y + 4} fontSize="11" fill="#94a3b8" textAnchor="end" fontWeight="600">
                                {rating}
                              </text>
                            </g>
                          );
                        })}

                        {/* Hover vertical crosshair */}
                        {hoveredTrendIdx !== null && (
                          <line
                            x1={50 + hoveredTrendIdx * 85}
                            y1="25"
                            x2={50 + hoveredTrendIdx * 85}
                            y2="170"
                            stroke="#7c3aed"
                            strokeWidth="1.5"
                            strokeDasharray="3 3"
                            opacity="0.8"
                          />
                        )}

                        {/* Labels & Highlights */}
                        {recentTrend.map((t, idx) => {
                          const x = 50 + idx * 85;
                          const isHovered = hoveredTrendIdx === idx;

                          return (
                            <g key={idx}>
                              {t.is_current ? (
                                <>
                                  <rect
                                    x={x - 30}
                                    y="178"
                                    width="60"
                                    height="18"
                                    rx="9"
                                    fill={isHovered ? '#7c3aed' : '#ede9fe'}
                                    stroke="#c4b5fd"
                                  />
                                  <text
                                    x={x}
                                    y="191"
                                    fontSize="10"
                                    fill={isHovered ? '#ffffff' : '#7c3aed'}
                                    textAnchor="middle"
                                    fontWeight="700"
                                  >
                                    {t.label}
                                  </text>
                                </>
                              ) : (
                                <text
                                  x={x}
                                  y="191"
                                  fontSize="10.5"
                                  fill={isHovered ? '#0f172a' : '#64748b'}
                                  textAnchor="middle"
                                  fontWeight={isHovered ? '700' : '600'}
                                >
                                  {t.label}
                                </text>
                              )}
                            </g>
                          );
                        })}

                        {/* Polylines & Dots */}
                        {(() => {
                          const getY = (val: number) => 170 - (Math.min(5, Math.max(1, val)) - 1) * 35;
                          const getX = (idx: number) => 50 + idx * 85;

                          const lineOverall = recentTrend.map((t, i) => `${getX(i)},${getY(t.overall)}`).join(' ');
                          const lineClarity = recentTrend.map((t, i) => `${getX(i)},${getY(t.clarity)}`).join(' ');
                          const linePacing = recentTrend.map((t, i) => `${getX(i)},${getY(t.pacing)}`).join(' ');
                          const lineAI = recentTrend.map((t, i) => `${getX(i)},${getY(t.ai_help)}`).join(' ');

                          return (
                            <>
                              {visibleTrendLines.overall && (
                                <polyline fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={lineOverall} />
                              )}
                              {visibleTrendLines.clarity && (
                                <polyline fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={lineClarity} />
                              )}
                              {visibleTrendLines.pacing && (
                                <polyline fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={linePacing} />
                              )}
                              {visibleTrendLines.ai_help && (
                                <polyline fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={lineAI} />
                              )}

                              {recentTrend.map((t, idx) => {
                                const isH = hoveredTrendIdx === idx;
                                return (
                                  <g key={idx}>
                                    {isH && (
                                      <circle cx={getX(idx)} cy={getY(t.overall)} r="8" fill="none" stroke="#7c3aed" strokeWidth="2" opacity="0.5" />
                                    )}
                                    {visibleTrendLines.overall && (
                                      <circle cx={getX(idx)} cy={getY(t.overall)} r={isH ? 5 : 3.5} fill="#7c3aed" stroke="#ffffff" strokeWidth="1.5" />
                                    )}
                                    {visibleTrendLines.clarity && (
                                      <circle cx={getX(idx)} cy={getY(t.clarity)} r={isH ? 4.5 : 3} fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
                                    )}
                                    {visibleTrendLines.pacing && (
                                      <circle cx={getX(idx)} cy={getY(t.pacing)} r={isH ? 4.5 : 3} fill="#f97316" stroke="#ffffff" strokeWidth="1.5" />
                                    )}
                                    {visibleTrendLines.ai_help && (
                                      <circle cx={getX(idx)} cy={getY(t.ai_help)} r={isH ? 4.5 : 3} fill="#3b82f6" stroke="#ffffff" strokeWidth="1.5" />
                                    )}
                                  </g>
                                );
                              })}
                            </>
                          );
                        })()}

                        {/* Invisible hover columns across the 5 labs */}
                        {recentTrend.map((_, idx) => (
                          <rect
                            key={idx}
                            x={idx === 0 ? 0 : 50 + idx * 85 - 42}
                            y={0}
                            width={85}
                            height={200}
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

                  {/* Response Summary Card */}
                  <div className={styles.responseSummaryCard}>
                    <div>
                      <h3 className={styles.chartTitle} style={{ marginBottom: 16 }}>Response Summary</h3>
                      <div className={styles.responseSummaryList}>
                        <div className={styles.responseSummaryRow}>
                          <div className={styles.summaryIconCircle} style={{ background: '#eff6ff', color: '#2563eb' }}>
                            <Users size={22} />
                          </div>
                          <div>
                            <div className={styles.summaryNumber}>{session?.students_enrolled || 46}</div>
                            <div className={styles.summaryLabel}>Enrolled Students</div>
                          </div>
                        </div>

                        <div className={styles.responseSummaryRow}>
                          <div className={styles.summaryIconCircle} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                            <MessageSquare size={22} />
                          </div>
                          <div>
                            <div className={styles.summaryNumber}>{session?.feedback_submitted || 40}</div>
                            <div className={styles.summaryLabel}>Submitted Feedback</div>
                          </div>
                        </div>

                        <div className={styles.responseSummaryRow}>
                          <div className={styles.summaryIconCircle} style={{ background: '#ecfdf5', color: '#059669' }}>
                            <CheckCircle2 size={22} />
                          </div>
                          <div>
                            <div className={styles.summaryNumber}>{session?.feedback_pct || 87}%</div>
                            <div className={styles.summaryLabel}>Response Rate</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14, marginTop: 16 }}>
                      <button
                        type="button"
                        className={styles.viewBtn}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        onClick={handleExportSessionCSV}
                      >
                        <Download size={14} /> Export Feedback Responses
                      </button>
                    </div>
                  </div>
                </div>

                {/* Bottom Full-Width: Detailed Rating Breakdown (Interactive Stacked Bars) */}
                <div className={styles.detailedBreakdownCard} style={{ position: 'relative' }}>
                  <div className={styles.breakdownHeader}>
                    <div>
                      <h3 className={styles.chartTitle}>Detailed Rating Breakdown</h3>
                      <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>
                        Hover over any segment to inspect responses or click to filter feedback comments.
                      </p>
                    </div>

                    {/* Legend */}
                    <div className={styles.breakdownLegend}>
                      <div className={styles.breakdownLegendItem}>
                        <div className={styles.legendDotSquare} style={{ background: '#f87171' }} />
                        <span>1 Star</span>
                      </div>
                      <div className={styles.breakdownLegendItem}>
                        <div className={styles.legendDotSquare} style={{ background: '#fb923c' }} />
                        <span>2 Stars</span>
                      </div>
                      <div className={styles.breakdownLegendItem}>
                        <div className={styles.legendDotSquare} style={{ background: '#fbbf24' }} />
                        <span>3 Stars</span>
                      </div>
                      <div className={styles.breakdownLegendItem}>
                        <div className={styles.legendDotSquare} style={{ background: '#38bdf8' }} />
                        <span>4 Stars</span>
                      </div>
                      <div className={styles.breakdownLegendItem}>
                        <div className={styles.legendDotSquare} style={{ background: '#34d399' }} />
                        <span>5 Stars</span>
                      </div>
                    </div>
                  </div>

                  {/* 4 Stacked Bar Rows */}
                  <div className={styles.breakdownRowsList}>
                    {[
                      { key: 'overall' as const, label: 'Overall Rating' },
                      { key: 'clarity' as const, label: 'Experiment Clarity' },
                      { key: 'pacing' as const, label: 'Session Pacing' },
                      { key: 'ai_helpfulness' as const, label: 'AI Hint Helpfulness' },
                    ].map(row => {
                      const distMap = breakdowns[row.key];
                      const colors = ['#f87171', '#fb923c', '#fbbf24', '#38bdf8', '#34d399'];

                      return (
                        <div key={row.key} className={styles.breakdownRowItem}>
                          <div className={styles.breakdownRowLabel}>{row.label}</div>
                          <div className={styles.stackedBarTrack} style={{ position: 'relative' }}>
                            {[1, 2, 3, 4, 5].map((star, idx) => {
                              const sData = distMap[String(star)] || { count: 0, pct: 0 };
                              const pct = sData.pct;
                              if (pct <= 0) return null;
                              const isHovered = hoveredStacked?.rowKey === row.key && hoveredStacked?.star === star;

                              return (
                                <div
                                  key={star}
                                  className={`${styles.stackedBarSegment} ${styles.interactiveStackedSegment}`}
                                  style={{
                                    width: `${pct}%`,
                                    background: colors[idx],
                                    position: 'relative',
                                  }}
                                  onMouseEnter={() => setHoveredStacked({ rowKey: row.key, star })}
                                  onMouseLeave={() => setHoveredStacked(null)}
                                  onClick={() => {
                                    setRatingFilter(String(star));
                                    setActiveTab('feedback');
                                  }}
                                >
                                  {/* Segment Tooltip */}
                                  {isHovered && (
                                    <div className={styles.floatingTooltip} style={{ top: -6, left: '50%' }}>
                                      <div style={{ fontWeight: 800, color: '#f8fafc', marginBottom: 2 }}>
                                        {row.label} • ★ {star} Star{star > 1 ? 's' : ''}
                                      </div>
                                      <div>{sData.count} responses ({pct}%)</div>
                                      <div style={{ fontSize: 9.5, color: '#93c5fd', marginTop: 3 }}>
                                        Click to view comments in Anonymous Feedback
                                      </div>
                                    </div>
                                  )}

                                  {pct >= 4 ? `${pct}%` : ''}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                2. ANONYMOUS FEEDBACK SUBPAGE (With Full Pagination System)
                ══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'feedback' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {/* 100% Anonymous Feedback Notice Banner */}
                <div className={styles.anonymousNoticeBanner}>
                  <div className={styles.noticeShieldIcon}>
                    <Shield size={20} />
                  </div>
                  <div>
                    <h4 className={styles.noticeTitle}>100% Anonymous Feedback</h4>
                    <p className={styles.noticeDesc}>
                      Student identities are never revealed. Comments are aggregated and cannot be linked to any individual student.
                    </p>
                  </div>
                </div>

                {/* Filter Pills Row */}
                <div className={styles.filterPillsRow}>
                  <button
                    type="button"
                    className={`${styles.filterPill} ${feedbackTab === 'all' ? styles.filterPillActive : ''}`}
                    onClick={() => setFeedbackTab('all')}
                  >
                    All ({details?.feedback.length || 40})
                  </button>
                  <button
                    type="button"
                    className={`${styles.filterPill} ${feedbackTab === 'positive' ? styles.filterPillActive : ''}`}
                    onClick={() => setFeedbackTab('positive')}
                  >
                    <span style={{ color: feedbackTab === 'positive' ? '#ffffff' : '#16a34a' }}>●</span> Positive (4.5+) {details?.sentiment_breakdown?.positive ?? 12}
                  </button>
                  <button
                    type="button"
                    className={`${styles.filterPill} ${feedbackTab === 'neutral' ? styles.filterPillActive : ''}`}
                    onClick={() => setFeedbackTab('neutral')}
                  >
                    <span style={{ color: feedbackTab === 'neutral' ? '#ffffff' : '#64748b' }}>●</span> Neutral (3.0 - 4.4) {details?.sentiment_breakdown?.neutral ?? 20}
                  </button>
                  <button
                    type="button"
                    className={`${styles.filterPill} ${feedbackTab === 'attention' ? styles.filterPillActive : ''}`}
                    onClick={() => setFeedbackTab('attention')}
                  >
                    <span style={{ color: feedbackTab === 'attention' ? '#ffffff' : '#ea580c' }}>●</span> Needs Attention (&lt; 3.0) {details?.sentiment_breakdown?.needs_attention ?? 8}
                  </button>

                  {ratingFilter !== 'all' && (
                    <div className={styles.activeFilterBadge}>
                      <span>★ {ratingFilter} Stars</span>
                      <button
                        type="button"
                        className={styles.clearFilterBtn}
                        onClick={() => setRatingFilter('all')}
                        title="Clear star filter"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Search & Sort & Rating Bar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div className={styles.searchInputWrapper} style={{ maxWidth: 360 }}>
                    <Search size={14} className={styles.searchIcon} />
                    <input
                      type="text"
                      placeholder="Search comments..."
                      className={styles.searchInput}
                      value={feedbackSearch}
                      onChange={e => setFeedbackSearch(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <select
                      className={styles.sortSelect}
                      value={feedbackSort}
                      onChange={e => setFeedbackSort(e.target.value as any)}
                    >
                      <option value="latest">Most Recent</option>
                      <option value="helpful">Most Helpful</option>
                      <option value="highest">Highest Rated</option>
                      <option value="lowest">Lowest Rated</option>
                    </select>

                    <select
                      className={styles.sortSelect}
                      value={ratingFilter}
                      onChange={e => setRatingFilter(e.target.value as any)}
                    >
                      <option value="all">All Ratings</option>
                      <option value="5">5 Stars</option>
                      <option value="4">4 Stars</option>
                      <option value="3">3 Stars</option>
                      <option value="2">2 Stars</option>
                      <option value="1">1 Star</option>
                    </select>
                  </div>
                </div>

                {/* Comment Cards List (Paginated) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {filteredFeedback.length === 0 ? (
                    <div className={styles.chartCard} style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                      <p style={{ margin: 0 }}>No comments found matching your selected filters.</p>
                    </div>
                  ) : (
                    paginatedFeedback.map(f => {
                      const ov = f.overall_rating || 0;
                      const isPos = ov >= 4.5;
                      const isNeu = ov >= 3.0 && ov < 4.5;
                      const pillClass = isPos
                        ? styles.sentimentPillPositive
                        : isNeu
                        ? styles.sentimentPillNeutral
                        : styles.sentimentPillAttention;
                      const pillLabel = isPos ? 'Positive' : isNeu ? 'Neutral' : 'Needs Attention';

                      return (
                        <div key={f.id} className={styles.richFeedbackCard}>
                          {/* Left Column: Quote, text, and meta */}
                          <div className={styles.richFeedbackLeft}>
                            <div className={styles.quoteWrapper}>
                              <span className={styles.quoteMark}>“</span>
                              <p className={styles.richFeedbackComment}>
                                {f.comment || <em style={{ color: '#94a3b8' }}>Submitted rating without written comment.</em>}
                              </p>
                            </div>

                            <div className={styles.richFeedbackMetaRow}>
                              <span className={styles.richFeedbackTime}>{f.time_ago || '2 days ago'}</span>
                              <span className={`${styles.sentimentPill} ${pillClass}`}>{pillLabel}</span>
                            </div>
                          </div>

                          {/* Right Column: Rating, 3 mini boxes, upvote button */}
                          <div className={styles.richFeedbackRight}>
                            <div className={styles.bigStarRatingCol}>
                              <div className={styles.starsRow}>
                                {[1, 2, 3, 4, 5].map(st => (
                                  <Star
                                    key={st}
                                    size={15}
                                    fill={st <= Math.round(ov) ? '#f59e0b' : 'none'}
                                    color={st <= Math.round(ov) ? '#f59e0b' : '#cbd5e1'}
                                  />
                                ))}
                                <span className={styles.starRatingScoreText} style={{ marginLeft: 6 }}>
                                  {ov.toFixed(1)} / 5
                                </span>
                              </div>

                              <div className={styles.miniCriteriaRow}>
                                <div className={styles.miniCriteriaBox}>
                                  <span className={styles.miniCriteriaLabel}>Clarity</span>
                                  <span className={styles.miniCriteriaScore}>{f.experiment_clarity ?? '—'}</span>
                                </div>
                                <div className={styles.miniCriteriaBox}>
                                  <span className={styles.miniCriteriaLabel}>Pacing</span>
                                  <span className={styles.miniCriteriaScore}>{f.session_pacing ?? '—'}</span>
                                </div>
                                <div className={styles.miniCriteriaBox}>
                                  <span className={styles.miniCriteriaLabel}>AI Hints</span>
                                  <span className={styles.miniCriteriaScore}>{f.ai_hint_helpfulness ?? '—'}</span>
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              className={styles.richUpvoteBtn}
                              onClick={() => upvoteMutation.mutate(f.id)}
                              title="Mark this feedback comment as helpful"
                            >
                              <ThumbsUp size={14} /> {f.helpful_count || 0}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* ═══ PAGINATION CONTROLS ═══ */}
                {filteredFeedback.length > 0 && (
                  <div className={styles.paginationContainer}>
                    <div className={styles.paginationInfo}>
                      Showing <strong>{(feedbackPage - 1) * feedbackPageSize + 1}</strong>–
                      <strong>{Math.min(feedbackPage * feedbackPageSize, filteredFeedback.length)}</strong> of{' '}
                      <strong>{filteredFeedback.length}</strong> comments
                      <select
                        className={styles.pageSizeSelect}
                        value={feedbackPageSize}
                        onChange={e => {
                          setFeedbackPageSize(Number(e.target.value));
                          setFeedbackPage(1);
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
                        onClick={() => setFeedbackPage(p => Math.max(1, p - 1))}
                        disabled={feedbackPage === 1}
                      >
                        <ChevronLeft size={14} /> Prev
                      </button>

                      {Array.from({ length: totalFeedbackPages }, (_, i) => i + 1).map(p => (
                        <button
                          key={p}
                          type="button"
                          className={`${styles.pageNumberBtn} ${feedbackPage === p ? styles.pageNumberActive : ''}`}
                          onClick={() => setFeedbackPage(p)}
                        >
                          {p}
                        </button>
                      ))}

                      <button
                        type="button"
                        className={styles.paginationBtn}
                        onClick={() => setFeedbackPage(p => Math.min(totalFeedbackPages, p + 1))}
                        disabled={feedbackPage === totalFeedbackPages}
                      >
                        Next <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                3. SESSION CONTEXT SUBPAGE
                ══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'context' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Session Overview Card */}
                <div className={styles.contextOverviewCard}>
                  <div className={styles.contextOverviewTop}>
                    <div className={styles.contextLabIcon}>
                      <FlaskConical size={26} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <h2 className={styles.bannerTitle} style={{ fontSize: 20 }}>
                          {session?.title || 'Lab 4 — Graphs & Shortest Path'}
                        </h2>
                        <span className={styles.statusCompleted}>
                          <Check size={12} style={{ marginRight: 4 }} /> Completed
                        </span>
                      </div>
                      <p className={styles.bannerSubtitle}>
                        {session?.subject_name || 'Data Structures & Algorithms'} ({session?.subject_code || 'CS301'}) | {session?.section_name || 'Section A'} | Batch {session?.batch_name || '2026-A'}
                      </p>
                    </div>
                  </div>

                  {/* 4 Horizontal Stat Tiles */}
                  <div className={styles.contextStatsBar}>
                    <div className={styles.contextStatItem}>
                      <div className={styles.contextStatIconCircle} style={{ background: '#eff6ff', color: '#2563eb' }}>
                        <Calendar size={18} />
                      </div>
                      <div>
                        <div className={styles.contextStatLabel}>Date &amp; Time</div>
                        <div className={styles.contextStatValue}>
                          {session?.formatted_date || '14 Oct 2026'}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          {session?.formatted_time || '10:00 AM - 12:00 PM'}
                        </div>
                      </div>
                    </div>

                    <div className={styles.contextStatItem}>
                      <div className={styles.contextStatIconCircle} style={{ background: '#fff7ed', color: '#f97316' }}>
                        <Clock size={18} />
                      </div>
                      <div>
                        <div className={styles.contextStatLabel}>Duration</div>
                        <div className={styles.contextStatValue}>
                          {session?.duration_hours || '2 hours'}
                        </div>
                      </div>
                    </div>

                    <div className={styles.contextStatItem}>
                      <div className={styles.contextStatIconCircle} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                        <Users size={18} />
                      </div>
                      <div>
                        <div className={styles.contextStatLabel}>Enrolled Students</div>
                        <div className={styles.contextStatValue}>
                          {session?.students_enrolled || 46}
                        </div>
                      </div>
                    </div>

                    <div className={styles.contextStatItem}>
                      <div className={styles.contextStatIconCircle} style={{ background: '#ecfdf5', color: '#059669' }}>
                        <CheckCircle size={18} />
                      </div>
                      <div style={{ width: '100%' }}>
                        <div className={styles.contextStatLabel}>Feedback Submitted</div>
                        <div className={styles.contextStatValue}>
                          {session?.feedback_submitted || 40} ({session?.feedback_pct || 87}%)
                        </div>
                        <div style={{ height: 4, width: '100%', maxWidth: 100, background: '#e2e8f0', borderRadius: 9999, marginTop: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${session?.feedback_pct || 87}%`, background: '#16a34a', borderRadius: 9999 }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2-Column Grid: Experiment Information & Experiment Description */}
                <div className={styles.experimentInfoGrid}>
                  {/* Left Column: Experiment Information */}
                  <div className={styles.contextCard}>
                    <h3 className={styles.contextCardTitle}>
                      <BookOpen size={18} color="#7c3aed" /> Experiment Information
                    </h3>

                    <table className={styles.infoTable}>
                      <tbody>
                        <tr>
                          <td className={styles.infoTableKey}>Experiment Title</td>
                          <td className={styles.infoTableVal}>
                            {session?.experiment_title || 'Graphs & Shortest Path'}
                            <span className={styles.statusCompleted} style={{ marginLeft: 8, fontSize: 10.5, padding: '2px 7px' }}>
                              Completed
                            </span>
                          </td>
                        </tr>
                        <tr>
                          <td className={styles.infoTableKey}>Subject</td>
                          <td className={styles.infoTableVal}>
                            {session?.subject_name || 'Data Structures & Algorithms'} ({session?.subject_code || 'CS301'})
                          </td>
                        </tr>
                        <tr>
                          <td className={styles.infoTableKey}>Section</td>
                          <td className={styles.infoTableVal}>{session?.section_name || 'Section A'}</td>
                        </tr>
                        <tr>
                          <td className={styles.infoTableKey}>Batch</td>
                          <td className={styles.infoTableVal}>{session?.batch_name || '2026-A'}</td>
                        </tr>
                        <tr>
                          <td className={styles.infoTableKey}>Academic Year</td>
                          <td className={styles.infoTableVal}>{session?.academic_year || '2025 - 2026'}</td>
                        </tr>
                        <tr>
                          <td className={styles.infoTableKey}>Session Status</td>
                          <td className={styles.infoTableVal} style={{ textTransform: 'capitalize' }}>
                            {session?.status || 'Completed'}
                          </td>
                        </tr>
                        <tr>
                          <td className={styles.infoTableKey}>Instructor</td>
                          <td className={styles.infoTableVal}>
                            {details?.context?.instructor_name || 'Prof. Sharma'}
                          </td>
                        </tr>
                        <tr>
                          <td className={styles.infoTableKey}>Live Conductor</td>
                          <td className={styles.infoTableVal}>
                            <span className={styles.liveAvailableBadge}>
                              <span className={styles.liveAvailableDot} /> {details?.context?.live_conductor_status || 'Available'}
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Right Column: Experiment Description */}
                  <div className={styles.contextCard} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <h3 className={styles.contextCardTitle}>
                        <FileText size={18} color="#2563eb" /> Experiment Description
                      </h3>
                      <p className={styles.experimentDescText}>
                        {details?.context?.description || (
                          details?.context?.aim
                            ? `${details.context.aim} ${details.context.theory || ''}`
                            : "This lab explores graph representation and shortest path algorithms. Students implement and analyze Dijkstra's algorithm and Bellman-Ford algorithm, compare their performance, and apply these concepts to real-world network routing scenarios."
                        )}
                      </p>
                    </div>

                    <div>
                      <button
                        type="button"
                        className={styles.viewFullExpBtn}
                        onClick={() => router.push(`/instructor/content`)}
                      >
                        View Full Experiment Details <ArrowRight size={15} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Learning Objectives Card */}
                <div className={styles.contextCard}>
                  <h3 className={styles.contextCardTitle}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CheckCircle2 size={16} />
                    </div>
                    Learning Objectives
                  </h3>

                  <div className={styles.learningObjectivesList}>
                    {(details?.context?.learning_objectives || [
                      "Understand the concept of graphs and shortest path algorithms including Dijkstra and Bellman-Ford.",
                      "Implement and analyze graph traversal techniques.",
                      "Analyze time and space complexity of different shortest path algorithms.",
                      "Apply the concepts to real-world problems such as network routing and navigation systems."
                    ]).map((obj, i) => (
                      <div key={i} className={styles.objectiveItem}>
                        <div className={styles.objectiveBulletDot} />
                        <span>{obj}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Resources Provided Card */}
                <div className={styles.contextCard}>
                  <h3 className={styles.contextCardTitle}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FileText size={16} />
                    </div>
                    Resources Provided
                  </h3>

                  <div className={styles.resourcesGrid}>
                    {(details?.context?.resources || [
                      { name: "Lab Manual", type: "PDF", size: "2.4 MB", format: "pdf", icon: "pdf" },
                      { name: "Starter Code", type: "ZIP", size: "1.1 MB", format: "zip", icon: "code" },
                      { name: "Sample Input", type: "TXT", size: "12 KB", format: "txt", icon: "txt" },
                      { name: "Solution Guide", type: "PDF", size: "1.8 MB", format: "pdf", icon: "pdf" },
                    ]).map((res, i) => {
                      const isPdf = res.format === 'pdf';
                      const isZip = res.format === 'zip';
                      const badgeClass = isPdf ? styles.pdfBadge : isZip ? styles.zipBadge : styles.txtBadge;
                      const badgeText = isPdf ? 'PDF' : isZip ? '</>' : 'TXT';

                      return (
                        <div key={i} className={styles.resourceTile}>
                          <div className={`${styles.resourceIconBadge} ${badgeClass}`}>
                            {badgeText}
                          </div>
                          <div>
                            <div className={styles.resourceName}>{res.name}</div>
                            <div className={styles.resourceMeta}>{res.type} • {res.size}</div>
                          </div>
                          <button
                            type="button"
                            className={styles.resourceDownloadBtn}
                            onClick={() => handleDownloadResource(res)}
                          >
                            Download
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                4. OVERVIEW SUBPAGE (Full Dashboard + Paginated Comment Stream)
                ══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* 4 Metric KPI Cards */}
                <div className={styles.kpiGrid}>
                  <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                      <div className={styles.kpiIconWrapper} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                        <Star size={20} fill="#7c3aed" />
                      </div>
                    </div>
                    <div className={styles.kpiLabel}>Overall Rating</div>
                    <div className={styles.kpiValueRow}>
                      <span className={styles.kpiValue}>{fmt(kpis.overall_rating)}</span>
                      <span className={styles.kpiTotalScale}>/ 5</span>
                    </div>
                    <p className={styles.kpiSub}>Based on {kpis.total_responses} responses</p>
                  </div>

                  <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                      <div className={styles.kpiIconWrapper} style={{ background: '#eff6ff', color: '#2563eb' }}>
                        <BookOpen size={20} />
                      </div>
                    </div>
                    <div className={styles.kpiLabel}>Experiment Clarity</div>
                    <div className={styles.kpiValueRow}>
                      <span className={styles.kpiValue}>{fmt(kpis.experiment_clarity)}</span>
                      <span className={styles.kpiTotalScale}>/ 5</span>
                    </div>
                    <p className={styles.kpiSub}>Based on {kpis.total_responses} responses</p>
                  </div>

                  <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                      <div className={styles.kpiIconWrapper} style={{ background: '#fff7ed', color: '#f97316' }}>
                        <Clock size={20} />
                      </div>
                    </div>
                    <div className={styles.kpiLabel}>Session Pacing</div>
                    <div className={styles.kpiValueRow}>
                      <span className={styles.kpiValue}>{fmt(kpis.session_pacing)}</span>
                      <span className={styles.kpiTotalScale}>/ 5</span>
                    </div>
                    <p className={styles.kpiSub}>Based on {kpis.total_responses} responses</p>
                  </div>

                  <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                      <div className={styles.kpiIconWrapper} style={{ background: '#fdf4ff', color: '#a855f7' }}>
                        <Bot size={20} />
                      </div>
                    </div>
                    <div className={styles.kpiLabel}>AI Hint Helpfulness</div>
                    <div className={styles.kpiValueRow}>
                      <span className={styles.kpiValue}>{fmt(kpis.ai_hint_helpfulness)}</span>
                      <span className={styles.kpiTotalScale}>/ 5</span>
                    </div>
                    <p className={styles.kpiSub}>Based on {kpis.total_responses} responses</p>
                  </div>
                </div>

                {/* Dual Charts: Distribution & Comparison */}
                <div className={styles.dualChartsGrid}>
                  <div className={styles.chartCard} style={{ position: 'relative' }}>
                    <div className={styles.chartHeader}>
                      <h3 className={styles.chartTitle}>Rating Distribution (Overall)</h3>
                      <span className={styles.chartSubtitle}>{kpis.total_responses} responses</span>
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
                        return (
                          <div
                            key={b.star}
                            className={styles.interactiveBarContainer}
                            style={{ margin: '0 8px' }}
                            onMouseEnter={() => setHoveredStar(b.star)}
                            onMouseLeave={() => setHoveredStar(null)}
                            onClick={() => {
                              setRatingFilter(ratingFilter === String(b.star) ? 'all' : String(b.star));
                            }}
                          >
                            {hoveredStar === b.star && (
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
                                maxWidth: 44,
                                height: `${heightPct}%`,
                                background: b.color,
                                borderRadius: '6px 6px 3px 3px',
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

                  <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                      <h3 className={styles.chartTitle}>Rating Comparison</h3>
                      <div className={styles.chartLegend}>
                        <div className={styles.legendItem}>
                          <div className={styles.legendDot} style={{ background: '#7c3aed' }} />
                          <span>This Session</span>
                        </div>
                        <div className={styles.legendItem}>
                          <div className={styles.legendDot} style={{ background: '#c4b5fd' }} />
                          <span>Subject Average</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: 185, padding: '10px 14px 0' }}>
                      {comparison.map(c => {
                        const sessionH = Math.max(16, (c.session / 5.0) * 140);
                        const subjH = Math.max(16, (c.subject_avg / 5.0) * 140);

                        return (
                          <div
                            key={c.metric}
                            className={styles.interactiveBarContainer}
                            onMouseEnter={() => setHoveredComparison(c.metric)}
                            onMouseLeave={() => setHoveredComparison(null)}
                          >
                            {hoveredComparison === c.metric && (
                              <div className={styles.floatingTooltip} style={{ top: -6, left: '50%' }}>
                                {c.metric}: {c.session.toFixed(1)} vs {c.subject_avg.toFixed(1)} avg
                              </div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 140 }}>
                              <div
                                className={styles.interactiveBar}
                                style={{
                                  width: 20,
                                  height: `${sessionH}px`,
                                  background: '#7c3aed',
                                  borderRadius: '5px 5px 2px 2px',
                                }}
                              />
                              <div
                                className={styles.interactiveBar}
                                style={{
                                  width: 20,
                                  height: `${subjH}px`,
                                  background: '#c4b5fd',
                                  borderRadius: '5px 5px 2px 2px',
                                }}
                              />
                            </div>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b' }}>
                              {c.metric}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Key Insights Row */}
                <div className={styles.chartCard}>
                  <div className={styles.chartHeader}>
                    <h3 className={styles.chartTitle}>Key Automated Insights</h3>
                  </div>

                  <div className={styles.insightsList}>
                    {insights.map(item => {
                      const iconBg =
                        item.type === 'positive'
                          ? '#ecfdf5'
                          : item.type === 'warning'
                          ? '#fff7ed'
                          : item.type === 'purple'
                          ? '#fdf4ff'
                          : '#eff6ff';
                      const iconColor =
                        item.type === 'positive'
                          ? '#059669'
                          : item.type === 'warning'
                          ? '#f97316'
                          : item.type === 'purple'
                          ? '#a855f7'
                          : '#3b82f6';

                      return (
                        <div key={item.id} className={styles.insightItem}>
                          <div className={styles.insightDot} style={{ background: iconBg, color: iconColor }}>
                            {item.icon === 'trending-up' && <TrendingUp size={15} />}
                            {item.icon === 'clock' && <Clock size={15} />}
                            {item.icon === 'book-open' && <BookOpen size={15} />}
                            {item.icon === 'bot' && <Bot size={15} />}
                            {(!item.icon || (item.icon !== 'trending-up' && item.icon !== 'clock' && item.icon !== 'book-open' && item.icon !== 'bot')) && (
                              <Sparkles size={15} />
                            )}
                          </div>
                          <div>
                            <h4 className={styles.insightTitle}>{item.title}</h4>
                            <p className={styles.insightDesc}>{item.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Overview Paginated Comments Stream */}
                <div className={styles.chartCard}>
                  <div className={styles.chartHeader}>
                    <h3 className={styles.chartTitle}>Recent Student Comments</h3>
                    <span className={styles.chartSubtitle}>
                      {filteredFeedback.length} total
                    </span>
                  </div>

                  <div className={styles.commentList}>
                    {paginatedOverviewFeedback.map(f => (
                      <div key={f.id} className={styles.commentCard}>
                        <div className={`${styles.sentimentAvatar} ${(f.overall_rating || 0) >= 4.5 ? styles.avatarGreen : (f.overall_rating || 0) >= 3 ? styles.avatarYellow : styles.avatarRed}`}>
                          {(f.overall_rating || 0) >= 4.5 ? '😊' : (f.overall_rating || 0) >= 3 ? '😐' : '😟'}
                        </div>
                        <div className={styles.commentContent}>
                          <p className={styles.commentText}>{f.comment || <em>No text provided</em>}</p>
                          <div className={styles.commentMeta}>
                            <span>★ {f.overall_rating}/5</span>
                            <span>{f.time_ago || 'recently'}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className={styles.upvoteBtn}
                          onClick={() => upvoteMutation.mutate(f.id)}
                        >
                          <ThumbsUp size={13} /> {f.helpful_count || 0}
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Overview Pagination */}
                  {filteredFeedback.length > overviewPageSize && (
                    <div className={styles.paginationContainer}>
                      <div className={styles.paginationInfo}>
                        Page {overviewPage} of {totalOverviewPages}
                      </div>
                      <div className={styles.paginationControls}>
                        <button
                          type="button"
                          className={styles.paginationBtn}
                          disabled={overviewPage === 1}
                          onClick={() => setOverviewPage(p => Math.max(1, p - 1))}
                        >
                          <ChevronLeft size={14} /> Prev
                        </button>
                        <button
                          type="button"
                          className={styles.paginationBtn}
                          disabled={overviewPage === totalOverviewPages}
                          onClick={() => setOverviewPage(p => Math.min(totalOverviewPages, p + 1))}
                        >
                          Next <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </InstructorShell>
  );
}
