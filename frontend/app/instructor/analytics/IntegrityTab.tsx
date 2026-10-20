'use client';

import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  FileText,
  Activity,
  Info,
  ExternalLink,
  ArrowRight,
  Monitor,
  Code,
  X,
  GitCompare,
  Clock,
  Sparkles,
  ChevronRight,
  Play,
  Pause,
  Sliders,
  CheckCircle2,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import styles from './instructor-analytics.module.css';
import type {
  IntegrityOverviewData,
  IntegrityQueueStudent,
  IntegrityTimelineEvent,
  PlagiarismPairItem,
} from '@/services/analytics.service';

interface IntegrityTabProps {
  data?: IntegrityOverviewData;
  isLoading?: boolean;
  onRefresh?: () => void;
  onSelectStudent?: (studentId: string) => void;
}

export function IntegrityTab({
  data,
  isLoading,
  onRefresh,
}: IntegrityTabProps) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [activeQueueFilter, setActiveQueueFilter] = useState<
    'all' | 'high_confidence' | 'plagiarism' | 'proctor_events'
  >('all');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [evidenceModalStudent, setEvidenceModalStudent] = useState<IntegrityQueueStudent | null>(null);
  const [compareModalPair, setCompareModalPair] = useState<PlagiarismPairItem | null>(null);
  const [showHowItWorksModal, setShowHowItWorksModal] = useState<boolean>(false);
  const [showSessionModal, setShowSessionModal] = useState<boolean>(false);
  const [showAllPairsModal, setShowAllPairsModal] = useState<boolean>(false);

  // Chart interactivity states
  const [hoveredDonutSlice, setHoveredDonutSlice] = useState<{
    name: string;
    count: number;
    pct: number;
  } | null>(null);
  const [activeLegendFilter, setActiveLegendFilter] = useState<string | null>(null);
  const [activeKpiCard, setActiveKpiCard] = useState<string | null>(null);

  // Timeline interactivity states
  const [timelineSeverityFilter, setTimelineSeverityFilter] = useState<
    'all' | 'high' | 'medium' | 'low' | 'info'
  >('all');
  const [expandedTimelineId, setExpandedTimelineId] = useState<string | null>(null);

  // Session video player scrubber state
  const [isScrubPlaying, setIsScrubPlaying] = useState<boolean>(false);
  const [scrubPosition, setScrubPosition] = useState<number>(14); // in minutes (0 to 30)

  // Confidence formula simulator state
  const [simProctorEvents, setSimProctorEvents] = useState<number>(3);
  const [simSimilarity, setSimSimilarity] = useState<number>(45);
  const [simCodeAnomaly, setSimCodeAnomaly] = useState<boolean>(false);

  // Live calculated simulated confidence score
  const simScore = useMemo(() => {
    let score = 100;
    // Proctor deductions: 1.5 pts per event up to 25 pts
    score -= Math.min(25, simProctorEvents * 1.5);
    // Similarity deductions: if > 50%, scales up to 35 pts
    if (simSimilarity > 50) {
      score -= ((simSimilarity - 50) / 50) * 35;
    }
    // Code progression leap deduction: 15 pts
    if (simCodeAnomaly) {
      score -= 15;
    }
    return Math.max(10, Math.round(score * 10) / 10);
  }, [simProctorEvents, simSimilarity, simCodeAnomaly]);

  // ── Derived Queue & Active Student ─────────────────────────────────────────
  const reviewQueue = data?.review_queue || [];

  // Set initial selected student
  const activeStudent = useMemo(() => {
    if (selectedStudentId) {
      const found = reviewQueue.find((s) => s.student_id === selectedStudentId);
      if (found) return found;
    }
    return reviewQueue[0] || null;
  }, [selectedStudentId, reviewQueue]);

  // Filtered queue items
  const filteredQueue = useMemo(() => {
    if (activeQueueFilter === 'all') return reviewQueue;
    return reviewQueue.filter((item) => item.category_tags?.includes(activeQueueFilter));
  }, [reviewQueue, activeQueueFilter]);

  // Review queue pagination
  const [queuePage, setQueuePage] = useState<number>(1);
  const [queuePageSize, setQueuePageSize] = useState<number>(10);

  React.useEffect(() => {
    setQueuePage(1);
  }, [activeQueueFilter]);

  const queueTotalPages = Math.max(1, Math.ceil(filteredQueue.length / queuePageSize));
  const queueStartIndex = (queuePage - 1) * queuePageSize;
  const queueEndIndex = Math.min(queueStartIndex + queuePageSize, filteredQueue.length);
  const paginatedQueue = useMemo(() => {
    return filteredQueue.slice(queueStartIndex, queueEndIndex);
  }, [filteredQueue, queueStartIndex, queueEndIndex]);

  // Plagiarism pairs pagination
  const [pairsPage, setPairsPage] = useState<number>(1);
  const [pairsPageSize, setPairsPageSize] = useState<number>(5);

  const plagiarismPairs = data?.plagiarism_pairs || [];
  const pairsTotalPages = Math.max(1, Math.ceil(plagiarismPairs.length / pairsPageSize));
  const pairsStartIndex = (pairsPage - 1) * pairsPageSize;
  const pairsEndIndex = Math.min(pairsStartIndex + pairsPageSize, plagiarismPairs.length);
  const paginatedPairs = useMemo(() => {
    return plagiarismPairs.slice(pairsStartIndex, pairsEndIndex);
  }, [plagiarismPairs, pairsStartIndex, pairsEndIndex]);

  // Filter tab counts
  const filterCounts = useMemo(() => {
    return {
      all: reviewQueue.length,
      high_confidence: reviewQueue.filter((s) => s.category_tags?.includes('high_confidence')).length,
      plagiarism: reviewQueue.filter((s) => s.category_tags?.includes('plagiarism')).length,
      proctor_events: reviewQueue.filter((s) => s.category_tags?.includes('proctor_events')).length,
    };
  }, [reviewQueue]);

  // Active student's timeline from live backend DB events
  const activeTimeline = useMemo(() => {
    if (!activeStudent) return [];
    if (data?.student_timelines && data.student_timelines[activeStudent.student_id]) {
      return data.student_timelines[activeStudent.student_id];
    }
    if (data?.selected_student_timeline?.student_id === activeStudent.student_id) {
      return data.selected_student_timeline.events;
    }
    return data?.selected_student_timeline?.events || [];
  }, [activeStudent, data]);

  // Filtered timeline by severity
  const filteredTimeline = useMemo(() => {
    if (timelineSeverityFilter === 'all') return activeTimeline;
    return activeTimeline.filter((ev) => ev.severity_type === timelineSeverityFilter);
  }, [activeTimeline, timelineSeverityFilter]);

  // Donut chart data
  const donutData = useMemo(() => {
    return (
      data?.evidence_mix?.distribution?.map((d) => ({
        name: d.name,
        value: d.count,
        color: d.color,
        percentage: d.percentage,
      })) || [
        { name: 'Proctor events', value: 6, color: '#6366f1', percentage: 46 },
        { name: 'Plagiarism matches', value: 2, color: '#0ea5e9', percentage: 31 },
        { name: 'Code anomalies', value: 1, color: '#f59e0b', percentage: 23 },
      ]
    );
  }, [data]);

  const totalEvidenceStudents = data?.evidence_mix?.total_students ?? 9;

  // Render icon based on type
  const renderEvidenceIcon = (type: string, key: number) => {
    if (type === 'document') {
      return (
        <span key={key} className={styles.evidenceIconBadge} title="Plagiarism Flag">
          <FileText size={11} color="#0284c7" />
        </span>
      );
    }
    if (type === 'warning') {
      return (
        <span key={key} className={styles.evidenceIconBadge} title="Proctor Anomaly">
          <AlertTriangle size={11} color="#f59e0b" />
        </span>
      );
    }
    if (type === 'code') {
      return (
        <span key={key} className={styles.evidenceIconBadge} title="Code Leaps Anomaly">
          <Code size={11} color="#7c3aed" />
        </span>
      );
    }
    return (
      <span key={key} className={styles.evidenceIconBadge} title="Browser Event">
        <Monitor size={11} color="#3b82f6" />
      </span>
    );
  };

  // Sparkline SVG helper with interactive points
  const renderSparkline = (points: number[], strokeColor: string) => {
    if (!points || points.length === 0) return null;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const width = 80;
    const height = 26;
    const coords = points.map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((p - min) / range) * (height - 6) - 3;
      return { x, y, val: p };
    });
    const pathD = `M ${coords.map((c) => `${c.x},${c.y}`).join(' L ')}`;
    return (
      <svg className={styles.integrityKpiSparkline} viewBox={`0 0 ${width} ${height}`}>
        <path
          d={pathD}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {coords.map((c, i) => (
          <circle
            key={i}
            cx={c.x}
            cy={c.y}
            r="2.5"
            fill={strokeColor}
            opacity={i === coords.length - 1 ? 1 : 0}
          >
            <title>{`Day ${i + 1}: ${c.val}`}</title>
          </circle>
        ))}
      </svg>
    );
  };

  return (
    <div className={styles.integrityContainer}>
      {/* ────────────────────────────────────────────────────────────────────────
          1. 4 EXECUTIVE KPI CARDS (Interactive On-Click Filters & Sparklines)
         ──────────────────────────────────────────────────────────────────────── */}
      <div className={styles.integrityKpiGrid}>
        {/* Card 1: Integrity Confidence */}
        <div
          className={`${styles.integrityKpiCard} ${
            activeKpiCard === 'confidence' ? styles.integrityKpiCardActive : ''
          }`}
          onClick={() => {
            setActiveKpiCard('confidence');
            setShowHowItWorksModal(true);
          }}
          title="Click to view probabilistic scoring model & interactive formula simulator"
        >
          <div>
            <div className={styles.integrityKpiTop}>
              <div className={styles.integrityKpiIcon} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                <ShieldCheck size={18} />
              </div>
              <span className={`${styles.integrityKpiBadge} ${styles.badgeGreen}`}>
                ↑ 3%
              </span>
            </div>
            <div className={styles.integrityKpiBody}>
              <span className={styles.integrityKpiLabel}>Integrity Confidence</span>
              <div className={styles.integrityKpiValueRow}>
                <span className={styles.integrityKpiValue}>
                  {data?.kpis?.integrity_confidence?.value || '94.2%'}
                </span>
                {renderSparkline(
                  data?.kpis?.integrity_confidence?.sparkline || [88, 89, 90, 92, 91, 93, 94.2],
                  '#8b5cf6'
                )}
              </div>
            </div>
          </div>
          <div className={styles.integrityKpiNote}>
            {data?.kpis?.integrity_confidence?.note || 'Cohort-weighted signal; not a misconduct verdict.'}
          </div>
        </div>

        {/* Card 2: Review Recommended */}
        <div
          className={`${styles.integrityKpiCard} ${
            activeKpiCard === 'review' ? styles.integrityKpiCardActive : ''
          }`}
          onClick={() => {
            setActiveKpiCard('review');
            setActiveQueueFilter('all');
            setActiveLegendFilter(null);
          }}
          title="Click to view all 5 students needing review in the queue"
        >
          <div>
            <div className={styles.integrityKpiTop}>
              <div className={styles.integrityKpiIcon} style={{ background: '#fef2f2', color: '#ef4444' }}>
                <AlertTriangle size={18} />
              </div>
              <span className={`${styles.integrityKpiBadge} ${styles.badgeRed}`}>
                ↑ 2
              </span>
            </div>
            <div className={styles.integrityKpiBody}>
              <span className={styles.integrityKpiLabel}>Review Recommended</span>
              <div className={styles.integrityKpiValueRow}>
                <span className={styles.integrityKpiValue}>
                  {data?.kpis?.review_recommended?.value ?? 5}
                </span>
                {renderSparkline(
                  data?.kpis?.review_recommended?.sparkline || [2, 3, 3, 4, 3, 4, 5],
                  '#ef4444'
                )}
              </div>
            </div>
          </div>
          <div className={styles.integrityKpiNote}>
            {data?.kpis?.review_recommended?.note || 'Students with signals needing human review.'}
          </div>
        </div>

        {/* Card 3: Plagiarism Matches */}
        <div
          className={`${styles.integrityKpiCard} ${
            activeKpiCard === 'plagiarism' ? styles.integrityKpiCardActive : ''
          }`}
          onClick={() => {
            setActiveKpiCard('plagiarism');
            setActiveQueueFilter('plagiarism');
            setActiveLegendFilter('Plagiarism matches');
          }}
          title="Click to filter review queue to similarity matches"
        >
          <div>
            <div className={styles.integrityKpiTop}>
              <div className={styles.integrityKpiIcon} style={{ background: '#eff6ff', color: '#0ea5e9' }}>
                <FileText size={18} />
              </div>
              <span className={`${styles.integrityKpiBadge} ${styles.badgeGreen}`}>
                ↓ 1
              </span>
            </div>
            <div className={styles.integrityKpiBody}>
              <span className={styles.integrityKpiLabel}>Plagiarism Matches</span>
              <div className={styles.integrityKpiValueRow}>
                <span className={styles.integrityKpiValue}>
                  {data?.kpis?.plagiarism_matches?.value ?? 2}
                </span>
                {renderSparkline(
                  data?.kpis?.plagiarism_matches?.sparkline || [4, 4, 3, 3, 2, 3, 2],
                  '#0ea5e9'
                )}
              </div>
            </div>
          </div>
          <div className={styles.integrityKpiNote}>
            {data?.kpis?.plagiarism_matches?.note || 'Similarity flags awaiting review.'}
          </div>
        </div>

        {/* Card 4: Proctor Events */}
        <div
          className={`${styles.integrityKpiCard} ${
            activeKpiCard === 'proctor' ? styles.integrityKpiCardActive : ''
          }`}
          onClick={() => {
            setActiveKpiCard('proctor');
            setActiveQueueFilter('proctor_events');
            setActiveLegendFilter('Proctor events');
          }}
          title="Click to filter review queue to proctor events"
        >
          <div>
            <div className={styles.integrityKpiTop}>
              <div className={styles.integrityKpiIcon} style={{ background: '#fdf2f8', color: '#db2777' }}>
                <Activity size={18} />
              </div>
              <span className={`${styles.integrityKpiBadge} ${styles.badgeGreen}`}>
                ↓ 3
              </span>
            </div>
            <div className={styles.integrityKpiBody}>
              <span className={styles.integrityKpiLabel}>Proctor Events</span>
              <div className={styles.integrityKpiValueRow}>
                <span className={styles.integrityKpiValue}>
                  {data?.kpis?.proctor_events?.value ?? 12}
                </span>
                {renderSparkline(
                  data?.kpis?.proctor_events?.sparkline || [18, 16, 17, 15, 14, 13, 12],
                  '#db2777'
                )}
              </div>
            </div>
          </div>
          <div className={styles.integrityKpiNote}>
            {data?.kpis?.proctor_events?.note || 'Severity-weighted events in selected window.'}
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────
          2. MIDDLE ROW: REVIEW QUEUE (LEFT) + EVIDENCE MIX (RIGHT)
         ──────────────────────────────────────────────────────────────────────── */}
      <div className={styles.integrityMiddleGrid}>
        {/* Integrity Review Queue */}
        <div className={styles.integrityCard}>
          <div className={styles.integrityCardHeader}>
            <div className={styles.integrityHeaderLeft}>
              <div className={styles.headerIconBadge}>
                <ShieldCheck size={16} />
              </div>
              <div className={styles.integrityTitleGroup}>
                <h3 className={styles.integrityTitle}>Integrity Review Queue</h3>
                <p className={styles.integritySubtitle}>
                  Prioritized by evidence strength and recency. Signals are review leads, not verdicts.
                </p>
              </div>
            </div>

            {/* Filter Pills */}
            <div className={styles.queueFilterGroup}>
              <button
                type="button"
                className={`${styles.queueFilterPill} ${
                  activeQueueFilter === 'all' ? styles.queueFilterPillActive : ''
                }`}
                onClick={() => {
                  setActiveQueueFilter('all');
                  setActiveLegendFilter(null);
                  setActiveKpiCard(null);
                }}
              >
                All ({filterCounts.all})
              </button>
              <button
                type="button"
                className={`${styles.queueFilterPill} ${
                  activeQueueFilter === 'high_confidence' ? styles.queueFilterPillActive : ''
                }`}
                onClick={() => {
                  setActiveQueueFilter('high_confidence');
                  setActiveLegendFilter(null);
                }}
              >
                High confidence ({filterCounts.high_confidence})
              </button>
              <button
                type="button"
                className={`${styles.queueFilterPill} ${
                  activeQueueFilter === 'plagiarism' ? styles.queueFilterPillActive : ''
                }`}
                onClick={() => {
                  setActiveQueueFilter('plagiarism');
                  setActiveLegendFilter('Plagiarism matches');
                }}
              >
                Plagiarism ({filterCounts.plagiarism})
              </button>
              <button
                type="button"
                className={`${styles.queueFilterPill} ${
                  activeQueueFilter === 'proctor_events' ? styles.queueFilterPillActive : ''
                }`}
                onClick={() => {
                  setActiveQueueFilter('proctor_events');
                  setActiveLegendFilter('Proctor events');
                }}
              >
                Proctor events ({filterCounts.proctor_events})
              </button>
            </div>
          </div>

          {/* Table */}
          <div className={styles.tableResponsive}>
            <table className={styles.integrityTable}>
              <thead>
                <tr>
                  <th style={{ width: '21%', minWidth: 105 }}>Student</th>
                  <th style={{ width: '18%', minWidth: 95 }}>Section / Experiment</th>
                  <th style={{ width: '13%', minWidth: 70 }}>
                    Confidence{' '}
                    <span title="Calculated from weighted deductions based on proctor flags, plagiarism similarity, and code anomalies.">
                      ⓘ
                    </span>
                  </th>
                  <th style={{ width: '14%', minWidth: 78 }}>Evidence signals</th>
                  <th style={{ width: '14%', minWidth: 80 }}>Latest event</th>
                  <th style={{ width: '10%', minWidth: 78 }}>Review status</th>
                  <th style={{ width: '10%', minWidth: 85, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedQueue.map((student) => {
                  const isSelected = activeStudent?.student_id === student.student_id;
                  return (
                    <tr
                      key={student.student_id}
                      className={isSelected ? styles.selectedRow : ''}
                      onClick={() => setSelectedStudentId(student.student_id)}
                      title="Click to view chronological timeline in panel below"
                    >
                      {/* Student */}
                      <td>
                        <div className={styles.studentMetaBox}>
                          <div
                            className={styles.studentAvatar}
                            style={{ background: student.avatar_color || '#8b5cf6' }}
                          >
                            {student.avatar}
                          </div>
                          <div className={styles.studentNameCol}>
                            <span className={styles.studentNameText}>{student.student_name}</span>
                            <span className={styles.studentRollText}>{student.roll_number}</span>
                          </div>
                        </div>
                      </td>

                      {/* Section / Experiment */}
                      <td>
                        <div className={styles.sectionExpCol}>
                          <span className={styles.sectionText}>
                            {student.section_experiment.split('·')[0]?.trim()}
                          </span>
                          <span className={styles.expText}>
                            {student.section_experiment.split('·')[1]?.trim()}
                          </span>
                        </div>
                      </td>

                      {/* Confidence */}
                      <td>
                        <div className={styles.confidenceBox}>
                          <span
                            className={styles.confidenceVal}
                            style={{ color: student.confidence_color }}
                          >
                            {student.confidence !== null ? `${student.confidence}%` : '—'}
                          </span>
                          <div className={styles.confidenceBarTrack}>
                            <div
                              className={styles.confidenceBarFill}
                              style={{
                                width: student.confidence !== null ? `${student.confidence}%` : '0%',
                                background: student.confidence_color,
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Evidence Signals */}
                      <td>
                        <div className={styles.evidenceBox}>
                          <span className={styles.evidenceCountText}>{student.evidence_text}</span>
                          <div style={{ display: 'flex', gap: 3 }}>
                            {student.evidence_types.map((type, idx) => renderEvidenceIcon(type, idx))}
                          </div>
                        </div>
                      </td>

                      {/* Latest Event */}
                      <td>
                        <div className={styles.studentNameCol}>
                          <span style={{ fontWeight: 600, color: '#1e293b' }}>
                            {student.latest_event}
                          </span>
                          {student.latest_event_time && (
                            <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                              {student.latest_event_time}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Review Status */}
                      <td>
                        <div className={styles.statusBadge}>
                          <span
                            className={
                              student.review_status_type === 'needs_review'
                                ? styles.statusDotRed
                                : student.review_status_type === 'low_evidence'
                                ? styles.statusDotYellow
                                : styles.statusDotGrey
                            }
                          />
                          <span
                            style={{
                              color:
                                student.review_status_type === 'needs_review'
                                  ? '#b91c1c'
                                  : student.review_status_type === 'low_evidence'
                                  ? '#b45309'
                                  : '#64748b',
                            }}
                          >
                            {student.review_status}
                          </span>
                        </div>
                      </td>

                      {/* Action */}
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className={styles.actionBtnOutline}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEvidenceModalStudent(student);
                          }}
                        >
                          Review evidence
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Review Queue Pagination Controls Bar */}
          <div className={styles.paginationRow}>
            <div className={styles.paginationText}>
              <span>
                Showing {filteredQueue.length === 0 ? 0 : queueStartIndex + 1}–{queueEndIndex} of {filteredQueue.length} review leads
              </span>
              <span style={{ margin: '0 4px', color: '#cbd5e1' }}>|</span>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span>Per page:</span>
                <select
                  value={queuePageSize}
                  onChange={(e) => {
                    setQueuePageSize(Number(e.target.value));
                    setQueuePage(1);
                  }}
                  className={styles.paginationSelect}
                >
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                </select>
              </label>
            </div>

            <div className={styles.paginationButtons}>
              <button
                type="button"
                onClick={() => setQueuePage((p) => Math.max(1, p - 1))}
                disabled={queuePage <= 1}
                className={`${styles.pageBtn} ${queuePage <= 1 ? styles.pageBtnDisabled : ''}`}
              >
                Prev
              </button>
              {Array.from({ length: queueTotalPages }, (_, i) => i + 1).map((pageNum) => (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => setQueuePage(pageNum)}
                  className={`${styles.pageBtn} ${queuePage === pageNum ? styles.pageBtnActive : ''}`}
                >
                  {pageNum}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setQueuePage((p) => Math.min(queueTotalPages, p + 1))}
                disabled={queuePage >= queueTotalPages}
                className={`${styles.pageBtn} ${queuePage >= queueTotalPages ? styles.pageBtnDisabled : ''}`}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* Evidence Mix (Interactive Donut & Click-to-Filter Legend) */}
        <div className={styles.integrityCard}>
          <div className={styles.integrityCardHeader}>
            <div className={styles.integrityHeaderLeft}>
              <div className={styles.headerIconBadge} style={{ background: '#eff6ff', color: '#0284c7' }}>
                <FileText size={16} />
              </div>
              <div className={styles.integrityTitleGroup}>
                <h3 className={styles.integrityTitle}>Evidence Mix</h3>
                <p className={styles.integritySubtitle}>
                  Breakdown of integrity signals (counts can overlap)
                </p>
              </div>
            </div>
          </div>

          {/* Donut & Interactive Legend */}
          <div className={styles.evidenceMixContent}>
            <div className={styles.donutContainer}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={56}
                    paddingAngle={3}
                    dataKey="value"
                    cursor="pointer"
                    onClick={(entry) => {
                      if (entry.name === 'Proctor events') {
                        setActiveQueueFilter(activeQueueFilter === 'proctor_events' ? 'all' : 'proctor_events');
                        setActiveLegendFilter(activeLegendFilter === 'Proctor events' ? null : 'Proctor events');
                      } else if (entry.name === 'Plagiarism matches') {
                        setActiveQueueFilter(activeQueueFilter === 'plagiarism' ? 'all' : 'plagiarism');
                        setActiveLegendFilter(activeLegendFilter === 'Plagiarism matches' ? null : 'Plagiarism matches');
                      } else {
                        setActiveQueueFilter('all');
                        setActiveLegendFilter(activeLegendFilter === 'Code anomalies' ? null : 'Code anomalies');
                      }
                    }}
                  >
                    {donutData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.color}
                        stroke={hoveredDonutSlice?.name === entry.name ? '#ffffff' : 'none'}
                        strokeWidth={hoveredDonutSlice?.name === entry.name ? 2 : 0}
                        onMouseEnter={() =>
                          setHoveredDonutSlice({
                            name: entry.name,
                            count: entry.value,
                            pct: entry.percentage,
                          })
                        }
                        onMouseLeave={() => setHoveredDonutSlice(null)}
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(val: any, name: any) => [`${val} students`, name]}
                    contentStyle={{
                      background: '#0f172a',
                      color: '#ffffff',
                      borderRadius: 8,
                      fontSize: '0.72rem',
                      border: 'none',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className={styles.donutCenterLabel}>
                {hoveredDonutSlice ? (
                  <>
                    <span className={styles.donutCenterNum}>{hoveredDonutSlice.count}</span>
                    <span className={styles.donutCenterSub} style={{ color: '#4f46e5', fontWeight: 700 }}>
                      {hoveredDonutSlice.name.split(' ')[0]} ({hoveredDonutSlice.pct}%)
                    </span>
                  </>
                ) : (
                  <>
                    <span className={styles.donutCenterNum}>{totalEvidenceStudents}</span>
                    <span className={styles.donutCenterSub}>students</span>
                  </>
                )}
              </div>
            </div>

            <div className={styles.evidenceLegendList}>
              {donutData.map((d) => {
                const isActive = activeLegendFilter === d.name;
                return (
                  <div
                    key={d.name}
                    className={`${styles.legendRow} ${isActive ? styles.legendRowActive : ''}`}
                    onClick={() => {
                      if (d.name === 'Proctor events') {
                        setActiveQueueFilter(activeQueueFilter === 'proctor_events' ? 'all' : 'proctor_events');
                        setActiveLegendFilter(isActive ? null : 'Proctor events');
                      } else if (d.name === 'Plagiarism matches') {
                        setActiveQueueFilter(activeQueueFilter === 'plagiarism' ? 'all' : 'plagiarism');
                        setActiveLegendFilter(isActive ? null : 'Plagiarism matches');
                      } else {
                        setActiveQueueFilter('all');
                        setActiveLegendFilter(isActive ? null : 'Code anomalies');
                      }
                    }}
                    onMouseEnter={() =>
                      setHoveredDonutSlice({
                        name: d.name,
                        count: d.value,
                        pct: d.percentage,
                      })
                    }
                    onMouseLeave={() => setHoveredDonutSlice(null)}
                    title={`Click to filter review queue by ${d.name}`}
                  >
                    <div className={styles.legendNameCol}>
                      <span className={styles.legendColorDot} style={{ background: d.color }} />
                      <span>{d.name}</span>
                    </div>
                    <div className={styles.legendStatsCol}>
                      <span className={styles.legendCount}>{d.value}</span>
                      <span className={styles.legendPct}>{d.percentage}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Info callout */}
          <div className={styles.noticeCallout}>
            <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              Counts represent review leads and can overlap for the same student. They do not indicate misconduct by themselves.
            </div>
          </div>

          {/* Interactive Feature Card */}
          <div
            className={styles.featureExplainCard}
            onClick={() => setShowHowItWorksModal(true)}
            role="button"
            tabIndex={0}
            title="Click to open interactive probabilistic model & formula simulator"
          >
            <div className={styles.featureExplainTop}>
              <div className={styles.featureExplainTitle}>
                <Sparkles size={14} />
                <span>How integrity confidence works?</span>
              </div>
              <ChevronRight size={14} color="#7c3aed" />
            </div>
            <div className={styles.featureExplainDesc}>
              Combines proctoring event types and overlay, plagiarism similarity/status, and code anomaly signals relative to the student's own baseline.
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────
          3. BOTTOM ROW: VIOLATION TIMELINE (LEFT) + PLAGIARISM PAIRS (RIGHT)
         ──────────────────────────────────────────────────────────────────────── */}
      <div className={styles.integrityBottomGrid}>
        {/* Violation Timeline */}
        <div className={styles.integrityCard}>
          <div className={styles.integrityCardHeader}>
            <div className={styles.integrityHeaderLeft}>
              <div
                className={styles.headerIconBadge}
                style={{
                  background: activeStudent?.avatar_color || '#8b5cf6',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.72rem',
                }}
              >
                {activeStudent?.avatar || 'AP'}
              </div>
              <div className={styles.integrityTitleGroup}>
                <h3 className={styles.integrityTitle}>
                  Violation Timeline — {activeStudent?.student_name || 'Aadhya Pillai'}
                </h3>
                <p className={styles.integritySubtitle}>
                  Chronological view of integrity signals for the selected student.
                </p>
              </div>
            </div>

            <button
              type="button"
              className={styles.actionBtnOutline}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              onClick={() => setShowSessionModal(true)}
            >
              <span>Open session evidence</span>
              <ExternalLink size={12} />
            </button>
          </div>

          {/* Severity filter pills for timeline */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
            {(['all', 'high', 'medium', 'low', 'info'] as const).map((sev) => (
              <button
                key={sev}
                type="button"
                className={`${styles.queueFilterPill} ${
                  timelineSeverityFilter === sev ? styles.queueFilterPillActive : ''
                }`}
                style={{ fontSize: '0.66rem', padding: '2px 7px' }}
                onClick={() => setTimelineSeverityFilter(sev)}
              >
                {sev === 'all' ? 'All signals' : sev.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Timeline Events List */}
          <div className={styles.timelineWrapper}>
            <div className={styles.timelineTrack} />
            {filteredTimeline.map((ev) => {
              const isExpanded = expandedTimelineId === ev.id;
              return (
                <div key={ev.id} className={styles.timelineItemRow}>
                  <span className={styles.timelineNodeIcon} />
                  <div className={styles.timelineTimeCol}>
                    <span className={styles.timelineTimeMain}>{ev.time}</span>
                    <span className={styles.timelineTimeSub}>{ev.date}</span>
                  </div>
                  <div
                    className={styles.timelineEventCard}
                    onClick={() => setExpandedTimelineId(isExpanded ? null : ev.id)}
                    title="Click to view event forensic details"
                  >
                    <div className={styles.timelineEventTop}>
                      <span className={styles.timelineEventTitle}>{ev.title}</span>
                      <span
                        className={`${styles.severityBadge} ${
                          ev.severity_type === 'high'
                            ? styles.sevHigh
                            : ev.severity_type === 'medium'
                            ? styles.sevMedium
                            : ev.severity_type === 'low'
                            ? styles.sevLow
                            : styles.sevInfo
                        }`}
                      >
                        {ev.severity}
                      </span>
                    </div>
                    {(ev.session_tag || ev.experiment_tag) && (
                      <div className={styles.timelineTags}>
                        {ev.session_tag && <span className={styles.tagPill}>{ev.session_tag}</span>}
                        {ev.experiment_tag && (
                          <span className={styles.tagPill}>{ev.experiment_tag}</span>
                        )}
                      </div>
                    )}
                    <div className={styles.timelineDetailText}>{ev.description}</div>

                    {/* Expandable Forensic Audit Info */}
                    {isExpanded && (
                      <div
                        style={{
                          marginTop: 6,
                          padding: 8,
                          background: '#f8fafc',
                          borderRadius: 6,
                          border: '1px solid #e2e8f0',
                          fontSize: '0.7rem',
                          color: '#475569',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 3,
                        }}
                      >
                        <div>
                          <strong>Forensic Timestamp:</strong> {ev.date} at {ev.time}
                        </div>
                        <div>
                          <strong>Signal Weight:</strong>{' '}
                          {ev.severity_type === 'high'
                            ? '-15 pts (Requires Instructor Attestation)'
                            : ev.severity_type === 'medium'
                            ? '-8 pts (Flagged in Review Queue)'
                            : '-3 pts (Informational Telemetry)'}
                        </div>
                        <div>
                          <strong>Diagnostic Source:</strong> Browser Lock & AST Parser Telemetry
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Plagiarism Review Pairs */}
        <div className={styles.integrityCard}>
          <div className={styles.integrityCardHeader}>
            <div className={styles.integrityHeaderLeft}>
              <div className={styles.headerIconBadge} style={{ background: '#eff6ff', color: '#0284c7' }}>
                <FileText size={16} />
              </div>
              <div className={styles.integrityTitleGroup}>
                <h3 className={styles.integrityTitle}>Plagiarism Review Pairs</h3>
                <p className={styles.integritySubtitle}>
                  Potential code similarity matches for review.
                </p>
              </div>
            </div>

            <button
              type="button"
              style={{
                background: 'none',
                border: 'none',
                color: '#4f46e5',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
              onClick={() => setShowAllPairsModal(true)}
            >
              <span>View all</span>
              <ArrowRight size={13} />
            </button>
          </div>

          {/* Pairs Table */}
          <div className={styles.tableResponsive}>
            <table className={styles.integrityTable}>
              <thead>
                <tr>
                  <th style={{ width: '19%', minWidth: 70 }}>Student A</th>
                  <th style={{ width: '19%', minWidth: 70 }}>Student B</th>
                  <th style={{ width: '18%', minWidth: 68 }}>Experiment</th>
                  <th style={{ width: '12%', minWidth: 46 }}>Similarity</th>
                  <th style={{ width: '16%', minWidth: 76 }}>Status</th>
                  <th style={{ width: '16%', minWidth: 105, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedPairs.map((pair) => (
                  <tr
                    key={pair.id}
                    onClick={() => setCompareModalPair(pair)}
                    title="Click to open side-by-side AST comparison"
                  >
                    <td style={{ fontWeight: 600 }}>{pair.student_a}</td>
                    <td style={{ fontWeight: 600 }}>{pair.student_b}</td>
                    <td style={{ color: '#475569' }}>{pair.experiment}</td>
                    <td>
                      <strong style={{ color: pair.similarity >= 75 ? '#dc2626' : '#d97706' }}>
                        {pair.similarity}%
                      </strong>
                    </td>
                    <td>
                      <div className={styles.statusBadge}>
                        <span
                          className={
                            pair.status_type === 'needs_review'
                              ? styles.statusDotRed
                              : pair.status_type === 'under_review'
                              ? styles.statusDotYellow
                              : styles.statusDotBlue
                          }
                        />
                        <span
                          style={{
                            color:
                              pair.status_type === 'needs_review'
                                ? '#b91c1c'
                                : pair.status_type === 'under_review'
                                ? '#b45309'
                                : '#2563eb',
                          }}
                        >
                          {pair.status}
                        </span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className={styles.actionBtnOutline}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCompareModalPair(pair);
                        }}
                      >
                        Compare submissions
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pairs Pagination Controls Bar */}
          <div className={styles.paginationRow}>
            <div className={styles.paginationText}>
              <span>
                Showing {plagiarismPairs.length === 0 ? 0 : pairsStartIndex + 1}–{pairsEndIndex} of {plagiarismPairs.length} pairs
              </span>
              <span style={{ margin: '0 4px', color: '#cbd5e1' }}>|</span>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span>Per page:</span>
                <select
                  value={pairsPageSize}
                  onChange={(e) => {
                    setPairsPageSize(Number(e.target.value));
                    setPairsPage(1);
                  }}
                  className={styles.paginationSelect}
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                </select>
              </label>
            </div>

            <div className={styles.paginationButtons}>
              <button
                type="button"
                onClick={() => setPairsPage((p) => Math.max(1, p - 1))}
                disabled={pairsPage <= 1}
                className={`${styles.pageBtn} ${pairsPage <= 1 ? styles.pageBtnDisabled : ''}`}
              >
                Prev
              </button>
              {Array.from({ length: pairsTotalPages }, (_, i) => i + 1).map((pageNum) => (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => setPairsPage(pageNum)}
                  className={`${styles.pageBtn} ${pairsPage === pageNum ? styles.pageBtnActive : ''}`}
                >
                  {pageNum}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPairsPage((p) => Math.min(pairsTotalPages, p + 1))}
                disabled={pairsPage >= pairsTotalPages}
                className={`${styles.pageBtn} ${pairsPage >= pairsTotalPages ? styles.pageBtnDisabled : ''}`}
              >
                Next
              </button>
            </div>
          </div>

          {/* Info callout */}
          <div className={styles.noticeCallout} style={{ marginTop: 12 }}>
            <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              Similarity alone does not establish plagiarism. Review code context, allowed collaboration rules, and the full submission before taking action.
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────
          4. INTERACTIVE MODAL: How Integrity Confidence Works & Simulator
         ──────────────────────────────────────────────────────────────────────── */}
      {showHowItWorksModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowHowItWorksModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className={styles.headerIconBadge}>
                  <Sparkles size={18} />
                </div>
                <div>
                  <h3 className={styles.modalTitle}>How Integrity Confidence Works</h3>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Probabilistic multi-signal model with real-time formula simulator.
                  </div>
                </div>
              </div>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setShowHowItWorksModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {/* Signal breakdown cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <div style={{ padding: 10, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6366f1', marginBottom: 3 }}>
                    1. Proctoring Events (40%)
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#475569', lineHeight: 1.35 }}>
                    Deductions for application window blurs (0.5 pts), fullscreen exits (1.0 pt), and copy/paste violations (3.0 pts).
                  </div>
                </div>
                <div style={{ padding: 10, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0ea5e9', marginBottom: 3 }}>
                    2. Plagiarism Similarity (35%)
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#475569', lineHeight: 1.35 }}>
                    AST winnowing fingerprinting. Progressively penalizes similarity above the 50% baseline threshold.
                  </div>
                </div>
                <div style={{ padding: 10, background: '#f8fafc', borderRadius: 8, border: '1px solid #f59e0b' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b', marginBottom: 3 }}>
                    3. Code Progression Leaps (25%)
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#475569', lineHeight: 1.35 }}>
                    Detects sudden leaps (e.g. 0/10 test cases passed leaping instantly to 10/10 with an 80+ line single buffer paste).
                  </div>
                </div>
              </div>

              {/* LIVE FORMULA SIMULATOR */}
              <div style={{ padding: 14, background: '#faf5ff', borderRadius: 10, border: '1px solid #ede9fe' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '0.8rem', color: '#7c3aed' }}>
                    <Sliders size={15} />
                    <span>Live Interactive Confidence Simulator</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6d28d9', fontWeight: 700 }}>
                    Calculated Confidence:{' '}
                    <span
                      style={{
                        fontSize: '1.15rem',
                        fontWeight: 800,
                        color: simScore >= 75 ? '#059669' : simScore >= 50 ? '#d97706' : '#dc2626',
                      }}
                    >
                      {simScore}%
                    </span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Proctor Events: <strong>{simProctorEvents}</strong>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="15"
                      value={simProctorEvents}
                      onChange={(e) => setSimProctorEvents(Number(e.target.value))}
                      style={{ width: '100%', accentColor: '#7c3aed' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Plagiarism Similarity: <strong>{simSimilarity}%</strong>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={simSimilarity}
                      onChange={(e) => setSimSimilarity(Number(e.target.value))}
                      style={{ width: '100%', accentColor: '#0ea5e9' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <label style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 600, marginBottom: 4 }}>
                      Code Anomaly Leap
                    </label>
                    <button
                      type="button"
                      style={{
                        padding: '4px 8px',
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        background: simCodeAnomaly ? '#fef3c7' : '#ffffff',
                        color: simCodeAnomaly ? '#b45309' : '#475569',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                      onClick={() => setSimCodeAnomaly(!simCodeAnomaly)}
                    >
                      {simCodeAnomaly ? '● Anomaly Flagged (-15 pts)' : '○ Normal Flow (0 pts)'}
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ padding: 10, background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#166534' }}>
                  Pedagogical Bias Prevention Guardrail:
                </span>
                <p style={{ fontSize: '0.7rem', color: '#14532d', margin: '3px 0 0', lineHeight: 1.35 }}>
                  Confidence scores do not determine disciplinary penalties. They highlight review candidates to instructors with complete context and full code diffs before any administrative action can be taken.
                </p>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.actionBtnOutline}
                onClick={() => setShowHowItWorksModal(false)}
              >
                Close Explanation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          5. INTERACTIVE MODAL: Compare Submissions (Side-by-Side Diff)
         ──────────────────────────────────────────────────────────────────────── */}
      {compareModalPair && (
        <div className={styles.modalBackdrop} onClick={() => setCompareModalPair(null)}>
          <div className={styles.modalCard} style={{ maxWidth: 840 }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className={styles.headerIconBadge} style={{ background: '#eff6ff', color: '#0284c7' }}>
                  <GitCompare size={18} />
                </div>
                <div>
                  <h3 className={styles.modalTitle}>
                    Code Comparison: {compareModalPair.student_a} vs {compareModalPair.student_b}
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    {compareModalPair.experiment} · AST Similarity Match:{' '}
                    <strong style={{ color: '#dc2626' }}>{compareModalPair.similarity}%</strong>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setCompareModalPair(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {/* Student A Code */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f172a' }}>
                      {compareModalPair.student_a}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Submitted 10:42 AM</span>
                  </div>
                  <pre
                    style={{
                      background: '#0f172a',
                      color: '#e2e8f0',
                      padding: 12,
                      borderRadius: 8,
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      overflowX: 'auto',
                      height: 220,
                      lineHeight: 1.45,
                    }}
                  >
                    {compareModalPair.code_a}
                  </pre>
                </div>

                {/* Student B Code */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f172a' }}>
                      {compareModalPair.student_b}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Submitted 10:46 AM</span>
                  </div>
                  <pre
                    style={{
                      background: '#0f172a',
                      color: '#e2e8f0',
                      padding: 12,
                      borderRadius: 8,
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      overflowX: 'auto',
                      height: 220,
                      lineHeight: 1.45,
                    }}
                  >
                    {compareModalPair.code_b}
                  </pre>
                </div>
              </div>

              <div style={{ padding: 10, background: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a', fontSize: '0.72rem', color: '#92400e' }}>
                Matching code block: Inorder traversal stack formulation exhibits identical loop invariants and control variable aliasing (AST distance score: 0.18).
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                onClick={() => setCompareModalPair(null)}
              >
                Dismiss Flag
              </button>
              <button
                type="button"
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#4f46e5',
                  color: '#ffffff',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                onClick={() => {
                  alert(`Intervention notice initiated for ${compareModalPair.student_a} and ${compareModalPair.student_b}`);
                  setCompareModalPair(null);
                }}
              >
                Schedule Academic Integrity Review
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          6. INTERACTIVE MODAL: Review Evidence Dossier
         ──────────────────────────────────────────────────────────────────────── */}
      {evidenceModalStudent && (
        <div className={styles.modalBackdrop} onClick={() => setEvidenceModalStudent(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  className={styles.headerIconBadge}
                  style={{
                    background: evidenceModalStudent.avatar_color || '#8b5cf6',
                    color: '#ffffff',
                    fontWeight: 700,
                  }}
                >
                  {evidenceModalStudent.avatar}
                </div>
                <div>
                  <h3 className={styles.modalTitle}>
                    Evidence Dossier: {evidenceModalStudent.student_name}
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Roll: {evidenceModalStudent.roll_number} · {evidenceModalStudent.section_experiment}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setEvidenceModalStudent(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: '#f8fafc', borderRadius: 10 }}>
                <div>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Confidence Score</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: evidenceModalStudent.confidence_color }}>
                    {evidenceModalStudent.confidence !== null ? `${evidenceModalStudent.confidence}%` : 'Insufficient Data'}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Active Status</span>
                  <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#b91c1c' }}>
                    {evidenceModalStudent.review_status}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Flagged Signals</span>
                  <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a' }}>
                    {evidenceModalStudent.evidence_text}
                  </div>
                </div>
              </div>

              <div>
                <h4 style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
                  Recorded Diagnostic Signals
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ padding: 10, background: '#fef2f2', borderRadius: 8, border: '1px solid #fee2e2', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Monitor size={16} color="#ef4444" />
                    <span style={{ fontSize: '0.75rem', color: '#991b1b' }}>
                      2 application blur events registered within a 60-second window during assessment.
                    </span>
                  </div>
                  <div style={{ padding: 10, background: '#fffbeb', borderRadius: 8, border: '1px solid #fef3c7', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <AlertTriangle size={16} color="#f59e0b" />
                    <span style={{ fontSize: '0.75rem', color: '#92400e' }}>
                      Exited lockdown fullscreen mode for 14 seconds before returning to session.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.actionBtnOutline}
                onClick={() => setEvidenceModalStudent(null)}
              >
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          7. INTERACTIVE MODAL: Open Session Evidence (Video Timeline Scrubber)
         ──────────────────────────────────────────────────────────────────────── */}
      {showSessionModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowSessionModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className={styles.headerIconBadge} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                  <Clock size={18} />
                </div>
                <div>
                  <h3 className={styles.modalTitle}>
                    Session Telemetry: {activeStudent?.student_name}
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Proctored Session: 08:30 – 09:00 AM · DSA Lab 1 (Arrays)
                  </div>
                </div>
              </div>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setShowSessionModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {/* Interactive Video Playback Simulation */}
              <div
                style={{
                  background: '#0f172a',
                  borderRadius: 10,
                  padding: 16,
                  color: '#ffffff',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Session Playback Stream</span>
                  <span style={{ fontSize: '0.7rem', background: '#dc2626', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                    REC 1080p
                  </span>
                </div>

                <div
                  style={{
                    height: 120,
                    background: '#1e293b',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    [Proctoring Stream: Webcam & Active IDE Window Synced at {scrubPosition}:00 min]
                  </span>
                </div>

                {/* Scrubber controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    type="button"
                    style={{
                      background: '#4f46e5',
                      border: 'none',
                      color: '#ffffff',
                      borderRadius: '50%',
                      width: 28,
                      height: 28,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                    onClick={() => setIsScrubPlaying(!isScrubPlaying)}
                  >
                    {isScrubPlaying ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="30"
                    value={scrubPosition}
                    onChange={(e) => setScrubPosition(Number(e.target.value))}
                    style={{ flex: 1, accentColor: '#4f46e5' }}
                  />
                  <span style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                    {scrubPosition < 10 ? `0${scrubPosition}` : scrubPosition}:00 / 30:00
                  </span>
                </div>
              </div>

              <div style={{ padding: 12, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                  <span style={{ color: '#64748b' }}>Active Focus Duration:</span>
                  <strong>26 min 45 sec (89.1%)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                  <span style={{ color: '#64748b' }}>Keystroke Rate:</span>
                  <strong>48 WPM (Standard baseline)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                  <span style={{ color: '#64748b' }}>Webcam Verification:</span>
                  <span style={{ color: '#16a34a', fontWeight: 700 }}>● Passed (1 Face detected)</span>
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.actionBtnOutline}
                onClick={() => setShowSessionModal(false)}
              >
                Close Session Trace
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          8. INTERACTIVE MODAL: View All Plagiarism Pairs
         ──────────────────────────────────────────────────────────────────────── */}
      {showAllPairsModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowAllPairsModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className={styles.headerIconBadge} style={{ background: '#eff6ff', color: '#0284c7' }}>
                  <FileText size={18} />
                </div>
                <div>
                  <h3 className={styles.modalTitle}>All Plagiarism Review Pairs</h3>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Full roster of similarity matches across all sections.
                  </div>
                </div>
              </div>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setShowAllPairsModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.tableResponsive}>
                <table className={styles.integrityTable}>
                  <thead>
                    <tr>
                      <th>Student A</th>
                      <th>Student B</th>
                      <th>Experiment</th>
                      <th>Similarity</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.plagiarism_pairs || []).map((pair) => (
                      <tr key={pair.id}>
                        <td style={{ fontWeight: 600 }}>{pair.student_a}</td>
                        <td style={{ fontWeight: 600 }}>{pair.student_b}</td>
                        <td style={{ color: '#475569' }}>{pair.experiment}</td>
                        <td>
                          <strong style={{ color: pair.similarity >= 75 ? '#dc2626' : '#d97706' }}>
                            {pair.similarity}%
                          </strong>
                        </td>
                        <td>{pair.status}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className={styles.actionBtnOutline}
                            onClick={() => {
                              setShowAllPairsModal(false);
                              setCompareModalPair(pair);
                            }}
                          >
                            Compare
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.actionBtnOutline}
                onClick={() => setShowAllPairsModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
