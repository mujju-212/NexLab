'use client';

import React, { useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Sparkles,
  Target,
  Maximize2,
  Minimize2,
  Plus,
  Minus,
  RotateCcw,
  RotateCw,
  BookOpen,
  Star,
  AlertTriangle,
  Lightbulb,
  ExternalLink,
  PlayCircle,
  Code2,
  Lock,
  Shield,
  Trophy,
  Layers,
  ChevronDown,
  ArrowRight,
  TrendingUp,
  FileText,
  List,
  Compass,
  X,
} from 'lucide-react';
import Link from 'next/link';
import {
  studentAnalyticsService,
  KnowledgeMapDashboardResponse,
  KnowledgeMapConcept,
  KnowledgeMapDomain,
  UnifiedStudentOverview,
} from '@/services/student-analytics.service';
import styles from './knowledge-map.module.css';

// SVG Mindmap Visual Layout Coordinates
interface DomainLayoutCoord {
  id: string;
  x: number;
  y: number;
  conceptCoords: Record<string, { x: number; y: number; textAnchor: 'start' | 'end' | 'middle'; textDx: number; textDy: number }>;
}

const MINDMAP_LAYOUT: Record<string, DomainLayoutCoord> = {
  'Data Structures': {
    id: 'domain-dsa',
    x: 340,
    y: 190,
    conceptCoords: {
      'Arrays': { x: 280, y: 110, textAnchor: 'end', textDx: -10, textDy: -2 },
      'Linked Lists': { x: 235, y: 155, textAnchor: 'end', textDx: -10, textDy: -2 },
      'Stacks & Queues': { x: 225, y: 200, textAnchor: 'end', textDx: -10, textDy: -2 },
      'Trees': { x: 250, y: 245, textAnchor: 'end', textDx: -10, textDy: -2 },
      'Graphs': { x: 295, y: 280, textAnchor: 'end', textDx: -10, textDy: -2 },
    },
  },
  'Algorithms': {
    id: 'domain-algo',
    x: 580,
    y: 195,
    conceptCoords: {
      'Sorting': { x: 645, y: 115, textAnchor: 'start', textDx: 10, textDy: -2 },
      'Searching': { x: 680, y: 155, textAnchor: 'start', textDx: 10, textDy: -2 },
      'Greedy': { x: 690, y: 200, textAnchor: 'start', textDx: 10, textDy: -2 },
      'Dynamic Programming': { x: 675, y: 245, textAnchor: 'start', textDx: 10, textDy: -2 },
      'Graph Algorithms': { x: 640, y: 285, textAnchor: 'start', textDx: 10, textDy: -2 },
    },
  },
  'Databases': {
    id: 'domain-dbms',
    x: 300,
    y: 365,
    conceptCoords: {
      'SQL Basics': { x: 220, y: 310, textAnchor: 'end', textDx: -10, textDy: -2 },
      'Relational Model': { x: 190, y: 350, textAnchor: 'end', textDx: -10, textDy: -2 },
      'Normalization': { x: 185, y: 395, textAnchor: 'end', textDx: -10, textDy: -2 },
      'Transaction': { x: 205, y: 440, textAnchor: 'end', textDx: -10, textDy: -2 },
      'Query Optimization': { x: 250, y: 475, textAnchor: 'end', textDx: -10, textDy: -2 },
    },
  },
  'Operating Systems': {
    id: 'domain-os',
    x: 460,
    y: 415,
    conceptCoords: {
      'Processes': { x: 395, y: 485, textAnchor: 'middle', textDx: 0, textDy: 16 },
      'Memory Mgmt': { x: 460, y: 505, textAnchor: 'middle', textDx: 0, textDy: 16 },
      'File Systems': { x: 535, y: 485, textAnchor: 'middle', textDx: 0, textDy: 16 },
    },
  },
  'Computer Networks': {
    id: 'domain-cn',
    x: 620,
    y: 365,
    conceptCoords: {
      'OSI Model': { x: 695, y: 325, textAnchor: 'start', textDx: 10, textDy: -2 },
      'TCP/IP': { x: 720, y: 365, textAnchor: 'start', textDx: 10, textDy: -2 },
      'Routing': { x: 710, y: 410, textAnchor: 'start', textDx: 10, textDy: -2 },
      'Network Security': { x: 680, y: 455, textAnchor: 'start', textDx: 10, textDy: -2 },
    },
  },
};

const CENTER_NODE = { x: 460, y: 285 };

interface KnowledgeMapTabProps {
  knowledgeMap?: UnifiedStudentOverview['knowledge_map'];
  focusTopics?: string[];
  prerequisiteBlocks?: Array<{ concept: string; blocked_by: string[] }>;
  onNavigateTab?: (tab: string) => void;
  dateRange?: string;
}

export const KnowledgeMapTab: React.FC<KnowledgeMapTabProps> = ({
  knowledgeMap: _legacyMap,
  focusTopics: _legacyFocus,
  prerequisiteBlocks: _legacyPrereqs,
  onNavigateTab,
  dateRange,
}) => {
  // Top filter states
  const [viewMode, setViewMode] = useState<'blended' | 'academic' | 'practice'>('blended');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [selectedTopic, setSelectedTopic] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('30d');

  // Synchronize with top global date filter
  React.useEffect(() => {
    if (dateRange) {
      const mapped = dateRange === 'all' ? 'all' : dateRange === 'semester' ? 'semester' : `${dateRange}d`;
      setSelectedPeriod(mapped);
    }
  }, [dateRange]);

  // Visualization states
  const [viewType, setViewType] = useState<'map' | 'list'>('map');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Concept details subtab
  const [detailsSubTab, setDetailsSubTab] = useState<'overview' | 'practice' | 'experiments'>('overview');

  // Currently selected concept for right details panel
  const [selectedConceptName, setSelectedConceptName] = useState<string>('');

  // Video and Bottom Cards modal states
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isUnlocksModalOpen, setIsUnlocksModalOpen] = useState(false);
  const [isStrengthsModalOpen, setIsStrengthsModalOpen] = useState(false);
  const [isFocusModalOpen, setIsFocusModalOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Fetch real knowledge map dashboard payload from backend
  const { data: dashboardData, isLoading, isError, error, refetch } = useQuery<KnowledgeMapDashboardResponse>({
    queryKey: ['student-knowledge-map-dashboard', viewMode, selectedSubject, selectedTopic, selectedPeriod],
    queryFn: () =>
      studentAnalyticsService.getKnowledgeMapDashboard({
        view: viewMode,
        subject: selectedSubject !== 'all' ? selectedSubject : undefined,
        topic: selectedTopic !== 'all' ? selectedTopic : undefined,
        period: selectedPeriod,
      }),
    staleTime: 60_000,
  });

  // Analytics are rendered only from the API response. Missing observations remain unavailable.
  const kpi = dashboardData?.kpi_summary ?? null;

  const domains: KnowledgeMapDomain[] = useMemo(() => {
    const raw = dashboardData?.mindmap?.domains ?? [];
    return raw.map((d) => ({
      ...d,
      color:
        d.color ||
        (d.name.toLowerCase().includes('data structure')
          ? '#3b82f6'
          : d.name.toLowerCase().includes('algo')
          ? '#8b5cf6'
          : d.name.toLowerCase().includes('data') || d.name.toLowerCase().includes('db')
          ? '#10b981'
          : d.name.toLowerCase().includes('operat') || d.name.toLowerCase().includes('os')
          ? '#f59e0b'
          : '#ec4899'),
    }));
  }, [dashboardData?.mindmap?.domains]);

  // Flatten all concepts for subject/topic lookups and list view
  const allConcepts = useMemo(() => {
    const list: KnowledgeMapConcept[] = [];
    domains.forEach((d) => {
      d.concepts.forEach((c) => list.push(c));
    });
    return list;
  }, [domains]);

  // Prefer detailed API records; map-only records retain their measured scores and
  // explicitly mark unavailable attempt/grade statistics instead of inventing them.
  const activeConcept = useMemo<NonNullable<KnowledgeMapDashboardResponse['concept_details']> | null>(() => {
    const name = selectedConceptName || allConcepts[0]?.name || '';
    const details = dashboardData?.concept_details;
    if (details && details.name.toLowerCase() === name.toLowerCase()) return details;
    const match = allConcepts.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (!match) return null;
    return {
      id: match.id,
      name: match.name,
      domain: match.domain,
      breadcrumb: `${match.domain} > ${match.name}`,
      status_badge: match.status,
      mastery_score: match.score,
      practice_strength: match.practice_strength,
      academic_strength: match.academic_score,
      callout_reason: 'Detailed attempt and assessment records are not available for this concept.',
      recommended_steps: [],
      practice_stats: { attempted: null, solved: null, acceptance_rate: null, avg_time_mins: null },
      experiment_stats: { count: null, avg_grade: null, last_submission: null },
    };
  }, [dashboardData?.concept_details, allConcepts, selectedConceptName]);

  // Mouse pan handlers for SVG mindmap
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - panOffset.x,
      y: e.clientY - panOffset.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPanOffset({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleZoomIn = () => setZoomLevel((z) => Math.min(1.8, +(z + 0.15).toFixed(2)));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(0.65, +(z - 0.15).toFixed(2)));
  const handleResetZoom = () => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const toggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
  };

  // Helper to get status color badge
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'strong':
      case 'good':
        return '#10b981';
      case 'moderate':
        return '#f59e0b';
      case 'weak':
        return '#ef4444';
      default:
        return '#94a3b8';
    }
  };

  if (isLoading) return <div className={styles.container} style={{ padding: '2rem', color: '#64748b' }}>Loading knowledge-map records…</div>;
  if (isError) return <div role="alert" className={styles.container} style={{ padding: '2rem', color: '#991b1b' }}>Could not load knowledge-map records. No sample data is shown. <button onClick={() => refetch()}>Retry</button></div>;
  if (domains.length === 0) return <div className={styles.container} style={{ padding: '2rem', color: '#64748b' }}>No measured concept mastery is available yet. Knowledge-map scores are not estimated from missing data.</div>;

  return (
    <div className={styles.container} ref={containerRef}>
      {/* ── 1. Top Filter Bar ─────────────────────────────────────────────── */}
      <div className={styles.filterBar}>
        <div className={styles.filterLeft}>
          <div className={styles.viewModePillGroup}>
            <button
              className={`${styles.viewModeBtn} ${
                viewMode === 'blended' ? styles.viewModeBtnActive : ''
              }`}
              onClick={() => setViewMode('blended')}
            >
              Blended (Academic + Practice)
            </button>
            <button
              className={`${styles.viewModeBtn} ${
                viewMode === 'academic' ? styles.viewModeBtnActive : ''
              }`}
              onClick={() => setViewMode('academic')}
            >
              Academic Only
            </button>
            <button
              className={`${styles.viewModeBtn} ${
                viewMode === 'practice' ? styles.viewModeBtnActive : ''
              }`}
              onClick={() => setViewMode('practice')}
            >
              Practice Only
            </button>
          </div>

          {/* Subject Filter Dropdown */}
          <div className={styles.filterGroup}>
            <button
              type="button"
              className={`${styles.filterBtn} ${selectedSubject !== 'all' ? styles.filterBtnActive : ''}`}
              onClick={() => setOpenDropdown(openDropdown === 'subject' ? null : 'subject')}
            >
              <span style={{ color: '#64748b' }}>Subject:</span>
              <span>{selectedSubject === 'all' ? 'All Subjects' : selectedSubject}</span>
              <ChevronDown size={14} color="#64748b" />
            </button>
            {openDropdown === 'subject' && (
              <ul className={styles.dropdownMenu} style={{ left: 0, minWidth: '190px' }}>
                {['all', ...Array.from(new Set(domains.map((domain) => domain.name)))].map((s) => (
                  <li
                    key={s}
                    className={`${styles.dropdownItem} ${selectedSubject === s ? styles.dropdownItemActive : ''}`}
                    onClick={() => {
                      setSelectedSubject(s);
                      setOpenDropdown(null);
                    }}
                  >
                    {s === 'all' ? 'All Subjects' : s}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Topic Filter Dropdown */}
          <div className={styles.filterGroup}>
            <button
              type="button"
              className={`${styles.filterBtn} ${selectedTopic !== 'all' ? styles.filterBtnActive : ''}`}
              onClick={() => setOpenDropdown(openDropdown === 'topic' ? null : 'topic')}
            >
              <span style={{ color: '#64748b' }}>Topic:</span>
              <span>{selectedTopic === 'all' ? 'All Topics' : selectedTopic}</span>
              <ChevronDown size={14} color="#64748b" />
            </button>
            {openDropdown === 'topic' && (
              <ul className={styles.dropdownMenu} style={{ left: 0, minWidth: '220px' }}>
                <li
                  className={`${styles.dropdownItem} ${selectedTopic === 'all' ? styles.dropdownItemActive : ''}`}
                  onClick={() => {
                    setSelectedTopic('all');
                    setOpenDropdown(null);
                  }}
                >
                  All Topics
                </li>
                {allConcepts.map((c) => (
                  <li
                    key={c.id}
                    className={`${styles.dropdownItem} ${selectedTopic === c.name ? styles.dropdownItemActive : ''}`}
                    onClick={() => {
                      setSelectedTopic(c.name);
                      setSelectedConceptName(c.name);
                      setOpenDropdown(null);
                    }}
                  >
                    <span>{c.name}</span>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{Math.round(c.score)}%</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className={styles.filterLegend}>
          <div className={styles.legendDotItem}>
            <span className={styles.dotCircle} style={{ background: '#10b981' }} />
            <span>Strong</span>
          </div>
          <div className={styles.legendDotItem}>
            <span className={styles.dotCircle} style={{ background: '#34d399' }} />
            <span>Good</span>
          </div>
          <div className={styles.legendDotItem}>
            <span className={styles.dotCircle} style={{ background: '#f59e0b' }} />
            <span>Moderate</span>
          </div>
          <div className={styles.legendDotItem}>
            <span className={styles.dotCircle} style={{ background: '#ef4444' }} />
            <span>Weak</span>
          </div>
          <div className={styles.legendDotItem}>
            <span className={styles.dotCircle} style={{ background: '#94a3b8' }} />
            <span>Not Started</span>
          </div>
        </div>
      </div>

      {/* ── 2. Top 5 KPI Summary Strip ────────────────────────────────────── */}
      <div className={styles.kpiStrip}>
        {/* Card 1: Blended Mastery Score */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <div className={styles.kpiIconBox} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
              <Sparkles size={16} />
            </div>
            <p className={styles.kpiTitle}>Blended Mastery Score</p>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{kpi?.blended_mastery_score != null ? `${kpi.blended_mastery_score}%` : '—'}</span>
            <span className={styles.kpiDeltaBadge}>
              {kpi?.blended_delta ? <><TrendingUp size={11} /> {kpi.blended_delta}</> : 'Trend unavailable'}
            </span>
          </div>
          <p className={styles.kpiSubtext}>Across all subjects and practice</p>
          <div className={styles.kpiAccentGlow} />
        </div>

        {/* Card 2: Concepts Mastered */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <div className={styles.kpiIconBox} style={{ background: '#ecfdf5', color: '#059669' }}>
              <Layers size={16} />
            </div>
            <p className={styles.kpiTitle}>Concepts Mastered</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div className={styles.kpiValueRow}>
              <span className={styles.kpiValue}>
                {kpi?.concepts_mastered ?? '—'} <span style={{ fontSize: '1rem', color: '#94a3b8', fontWeight: 600 }}>/ {kpi?.total_concepts ?? '—'}</span>
              </span>
            </div>
            <div className={styles.kpiMiniBars}>
              {(kpi?.mastery_bars || []).map((h, i) => (
                <div
                  key={i}
                  className={styles.kpiMiniBar}
                  style={{
                    height: `${Math.max(6, Math.min(24, (h / 20) * 24))}px`,
                    opacity: 0.5 + i * 0.12,
                  }}
                />
              ))}
            </div>
          </div>
          <p className={styles.kpiSubtext}>Topics with ≥ 80% mastery</p>
        </div>

        {/* Card 3: Strong Areas */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <div className={styles.kpiIconBox} style={{ background: '#f0fdf4', color: '#16a34a' }}>
              <Star size={16} />
            </div>
            <p className={styles.kpiTitle}>Strong Areas</p>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{kpi?.strong_areas_count ?? '—'}</span>
          </div>
          <p className={styles.kpiSubtext}>High mastery concepts</p>
        </div>

        {/* Card 4: Areas to Improve */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <div className={styles.kpiIconBox} style={{ background: '#fff7ed', color: '#ea580c' }}>
              <AlertTriangle size={16} />
            </div>
            <p className={styles.kpiTitle}>Areas to Improve</p>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{kpi?.areas_to_improve_count ?? '—'}</span>
          </div>
          <p className={styles.kpiSubtext}>Recommended focus areas</p>
        </div>

        {/* Card 5: Not Started */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <div className={styles.kpiIconBox} style={{ background: '#faf5ff', color: '#9333ea' }}>
              <BookOpen size={16} />
            </div>
            <p className={styles.kpiTitle}>Not Started</p>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{kpi?.not_started_count ?? '—'}</span>
          </div>
          <p className={styles.kpiSubtext}>Upcoming concepts</p>
        </div>
      </div>

      {/* ── 3. Middle Section: Mindmap Canvas (65%) + Concept Details (35%) ─ */}
      <div className={styles.middleGrid}>
        {/* Left Column: Interactive Knowledge Mindmap Card */}
        <div className={styles.card} style={{ minHeight: '580px' }}>
          <div className={styles.mapCardHeader}>
            <div className={styles.mapTitleGroup}>
              <div style={{ color: '#7c3aed', display: 'flex' }}>
                <Sparkles size={20} />
              </div>
              <div>
                <h3>Knowledge Map</h3>
                <p>Interactive view of your concept mastery across subjects (Academic + Practice).</p>
              </div>
            </div>

            <div className={styles.mapControlsGroup}>
              <div className={styles.viewSwitchPill}>
                <button
                  className={`${styles.viewSwitchBtn} ${
                    viewType === 'map' ? styles.viewSwitchBtnActive : ''
                  }`}
                  onClick={() => setViewType('map')}
                >
                  Map View
                </button>
                <button
                  className={`${styles.viewSwitchBtn} ${
                    viewType === 'list' ? styles.viewSwitchBtnActive : ''
                  }`}
                  onClick={() => setViewType('list')}
                >
                  List View
                </button>
              </div>

              <button
                className={styles.iconSquareBtn}
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit Fullscreen' : 'Expand Fullscreen'}
              >
                {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
            </div>
          </div>

          {/* Canvas or List View */}
          {viewType === 'map' ? (
            <div
              className={styles.canvasAreaWrapper}
              style={{
                height: isFullscreen ? '78vh' : '480px',
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {/* Zoom Dock */}
              <div className={styles.zoomDock}>
                <button className={styles.zoomBtn} onClick={handleZoomIn} title="Zoom In">
                  <Plus size={14} />
                </button>
                <button className={styles.zoomBtn} onClick={handleZoomOut} title="Zoom Out">
                  <Minus size={14} />
                </button>
                <button className={styles.zoomBtn} onClick={handleResetZoom} title="Recenter Map">
                  <RotateCcw size={13} />
                </button>
              </div>

              {/* Interactive SVG Mindmap Canvas */}
              <svg
                className={styles.mindmapSvg}
                viewBox="0 0 920 540"
                preserveAspectRatio="xMidYMid meet"
              >
                <defs>
                  {/* Gradients */}
                  <radialGradient id="centerGradient" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#a855f7" />
                    <stop offset="100%" stopColor="#6d28d9" />
                  </radialGradient>

                  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>

                  <filter id="softShadow" x="-10%" y="-10%" width="120%" height="120%">
                    <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.08" />
                  </filter>
                </defs>

                <g
                  transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoomLevel})`}
                  style={{
                    transformOrigin: '460px 270px',
                    transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                >
                  {/* 1. Branch Curves: Center to Domain Nodes */}
                  {Object.entries(MINDMAP_LAYOUT).map(([domainName, layout]) => {
                    const isDimmed =
                      selectedSubject !== 'all' &&
                      selectedSubject.toLowerCase() !== domainName.toLowerCase();
                    const dx = (CENTER_NODE.x + layout.x) / 2;
                    const dy = (CENTER_NODE.y + layout.y) / 2;
                    const pathD = `M ${CENTER_NODE.x} ${CENTER_NODE.y} Q ${dx} ${dy} ${layout.x} ${layout.y}`;
                    return (
                      <path
                        key={`line-root-${layout.id}`}
                        d={pathD}
                        fill="none"
                        stroke="#cbd5e1"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        opacity={isDimmed ? 0.15 : 0.8}
                        style={{ transition: 'opacity 0.25s ease' }}
                      />
                    );
                  })}

                  {/* 2. Branch Curves: Domain Nodes to Concept Nodes */}
                  {domains.map((domain) => {
                    const layout = MINDMAP_LAYOUT[domain.name];
                    if (!layout) return null;
                    const isDimmed =
                      selectedSubject !== 'all' &&
                      selectedSubject.toLowerCase() !== domain.name.toLowerCase();

                    return domain.concepts.map((concept) => {
                      const cCoord = layout.conceptCoords[concept.name];
                      if (!cCoord) return null;

                      const isSelected =
                        selectedConceptName.toLowerCase() === concept.name.toLowerCase();

                      // Smooth cubic curve
                      const midX = (layout.x + cCoord.x) / 2;
                      const pathD = `M ${layout.x} ${layout.y} C ${midX} ${layout.y}, ${midX} ${cCoord.y}, ${cCoord.x} ${cCoord.y}`;

                      return (
                        <path
                          key={`line-${concept.id}`}
                          d={pathD}
                          fill="none"
                          stroke={isSelected ? '#7c3aed' : '#e2e8f0'}
                          strokeWidth={isSelected ? '2.5' : '1.5'}
                          strokeLinecap="round"
                          opacity={isDimmed ? 0.12 : isSelected ? 1 : 0.75}
                          style={{ transition: 'opacity 0.25s ease' }}
                        />
                      );
                    });
                  })}

                  {/* 3. Concept Leaf Nodes & Text Labels */}
                  {domains.map((domain) => {
                    const layout = MINDMAP_LAYOUT[domain.name];
                    if (!layout) return null;
                    const isDimmed =
                      selectedSubject !== 'all' &&
                      selectedSubject.toLowerCase() !== domain.name.toLowerCase();

                    return domain.concepts.map((concept) => {
                      const cCoord = layout.conceptCoords[concept.name];
                      if (!cCoord) return null;

                      const isSelected =
                        selectedConceptName.toLowerCase() === concept.name.toLowerCase();
                      const statusColor = getStatusColor(concept.status);

                      return (
                        <g
                          key={concept.id}
                          style={{
                            cursor: isDimmed ? 'default' : 'pointer',
                            opacity: isDimmed ? 0.2 : 1,
                            pointerEvents: isDimmed ? 'none' : 'auto',
                            transition: 'opacity 0.25s ease',
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedConceptName(concept.name);
                            setSelectedTopic(concept.name);
                          }}
                        >
                          {/* Highlight Halo if Selected */}
                          {isSelected && (
                            <circle
                              cx={cCoord.x}
                              cy={cCoord.y}
                              r={12}
                              fill="none"
                              stroke="#7c3aed"
                              strokeWidth="2.5"
                              strokeDasharray="3 2"
                              opacity={0.9}
                            />
                          )}

                          {/* Concept Pin Dot */}
                          <circle
                            cx={cCoord.x}
                            cy={cCoord.y}
                            r={isSelected ? 6 : 5}
                            fill={statusColor}
                            stroke="#ffffff"
                            strokeWidth="2"
                            filter="url(#softShadow)"
                          />

                          {/* Concept Label & Percentage */}
                          <text
                            x={cCoord.x + cCoord.textDx}
                            y={cCoord.y + cCoord.textDy}
                            textAnchor={cCoord.textAnchor}
                            fill={isSelected ? '#7c3aed' : '#334155'}
                            fontSize="11"
                            fontWeight={isSelected ? '800' : '600'}
                            fontFamily="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto"
                          >
                            {concept.name}
                            <tspan
                              dx="4"
                              fill={statusColor}
                              fontWeight="700"
                              fontSize="10"
                            >
                              {Math.round(concept.score)}%
                            </tspan>
                          </text>
                        </g>
                      );
                    });
                  })}

                  {/* 4. Domain Hub Nodes */}
                  {domains.map((domain) => {
                    const layout = MINDMAP_LAYOUT[domain.name];
                    if (!layout) return null;
                    const isDimmed =
                      selectedSubject !== 'all' &&
                      selectedSubject.toLowerCase() !== domain.name.toLowerCase();

                    return (
                      <g
                        key={domain.id}
                        transform={`translate(${layout.x}, ${layout.y})`}
                        style={{
                          cursor: 'pointer',
                          opacity: isDimmed ? 0.25 : 1,
                          transition: 'opacity 0.25s ease',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (domain.concepts.length > 0) {
                            setSelectedConceptName(domain.concepts[0].name);
                            setSelectedTopic(domain.concepts[0].name);
                          }
                        }}
                      >
                        <circle
                          r="34"
                          fill="#ffffff"
                          stroke={domain.color}
                          strokeWidth="2.5"
                          filter="url(#softShadow)"
                        />
                        <text
                          textAnchor="middle"
                          y="-4"
                          fontSize="10"
                          fontWeight="700"
                          fill="#0f172a"
                          fontFamily="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto"
                        >
                          {domain.name.split(' ')[0]}
                        </text>
                        {domain.name.split(' ').length > 1 && (
                          <text
                            textAnchor="middle"
                            y="8"
                            fontSize="10"
                            fontWeight="700"
                            fill="#0f172a"
                            fontFamily="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto"
                          >
                            {domain.name.split(' ').slice(1).join(' ')}
                          </text>
                        )}
                        <text
                          textAnchor="middle"
                          y="22"
                          fontSize="11"
                          fontWeight="800"
                          fill={domain.color}
                          fontFamily="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto"
                        >
                          {Math.round(domain.score)}%
                        </text>
                      </g>
                    );
                  })}

                  {/* 5. Center Root: Computer Science */}
                  <g
                    transform={`translate(${CENTER_NODE.x}, ${CENTER_NODE.y})`}
                    filter="url(#softShadow)"
                  >
                    <circle r="44" fill="url(#centerGradient)" />
                    <circle
                      r="48"
                      fill="none"
                      stroke="#c084fc"
                      strokeWidth="1.5"
                      opacity={0.6}
                    />
                    <text
                      textAnchor="middle"
                      y="-4"
                      fontSize="12"
                      fontWeight="800"
                      fill="#ffffff"
                      fontFamily="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto"
                    >
                      Computer
                    </text>
                    <text
                      textAnchor="middle"
                      y="14"
                      fontSize="12"
                      fontWeight="800"
                      fill="#ffffff"
                      fontFamily="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto"
                    >
                      Science
                    </text>
                  </g>
                </g>
              </svg>
            </div>
          ) : (
            /* List View representation */
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                maxHeight: '480px',
                overflowY: 'auto',
                padding: '0.5rem',
              }}
            >
              {domains.map((domain) => (
                <div
                  key={domain.id}
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.75rem',
                    padding: '0.85rem 1rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '0.65rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          background: domain.color,
                        }}
                      />
                      <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>
                        {domain.name}
                      </strong>
                    </div>
                    <span
                      style={{
                        fontWeight: 800,
                        fontSize: '0.85rem',
                        color: domain.color,
                      }}
                    >
                      {domain.score}%
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {domain.concepts.map((concept) => (
                      <div
                        key={concept.id}
                        onClick={() => setSelectedConceptName(concept.name)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background:
                            selectedConceptName.toLowerCase() === concept.name.toLowerCase()
                              ? '#f5f3ff'
                              : '#ffffff',
                          border: `1px solid ${
                            selectedConceptName.toLowerCase() === concept.name.toLowerCase()
                              ? '#ddd6fe'
                              : '#f1f5f9'
                          }`,
                          borderRadius: '0.5rem',
                          padding: '0.45rem 0.75rem',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span
                            style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              background: getStatusColor(concept.status),
                            }}
                          />
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1e293b' }}>
                            {concept.name}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              color: getStatusColor(concept.status),
                            }}
                          >
                            {concept.score}%
                          </span>
                          <span
                            className={`${styles.statusPillBadge} ${
                              concept.status === 'Weak'
                                ? styles.statusWeak
                                : concept.status === 'Strong'
                                ? styles.statusStrong
                                : styles.statusModerate
                            }`}
                          >
                            {concept.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Canvas Bottom Legend */}
          <div className={styles.canvasBottomLegend}>
            <div className={styles.legendDotItem}>
              <span className={styles.dotCircle} style={{ background: '#10b981' }} />
              <span>≥ 80% Strong</span>
            </div>
            <div className={styles.legendDotItem}>
              <span className={styles.dotCircle} style={{ background: '#34d399' }} />
              <span>60-79% Good</span>
            </div>
            <div className={styles.legendDotItem}>
              <span className={styles.dotCircle} style={{ background: '#f59e0b' }} />
              <span>40-59% Moderate</span>
            </div>
            <div className={styles.legendDotItem}>
              <span className={styles.dotCircle} style={{ background: '#ef4444' }} />
              <span>20-39% Weak</span>
            </div>
            <div className={styles.legendDotItem}>
              <span className={styles.dotCircle} style={{ background: '#94a3b8' }} />
              <span>&lt; 20% Not Started</span>
            </div>
          </div>
        </div>

        {/* Right Column: Concept Details Card */}
        <div className={styles.card}>
          <div className={styles.detailsHeader}>
            <div style={{ color: '#7c3aed', display: 'flex' }}>
              <Target size={18} />
            </div>
            <h3>Concept Details</h3>
          </div>

          {activeConcept ? <>
          {/* Active Concept Header Card */}
          <div className={styles.activeConceptCard}>
            <div className={styles.conceptIdentityLeft}>
              <div className={styles.conceptBadgeIcon}>
                <Layers size={18} />
              </div>
              <div className={styles.conceptTitles}>
                <h4>{activeConcept.name}</h4>
                <p className={styles.conceptBreadcrumb}>{activeConcept.breadcrumb}</p>
              </div>
            </div>
            <span
              className={`${styles.statusPillBadge} ${
                activeConcept.status_badge === 'Weak'
                  ? styles.statusWeak
                  : activeConcept.status_badge === 'Strong'
                  ? styles.statusStrong
                  : styles.statusModerate
              }`}
            >
              {activeConcept.status_badge}
            </span>
          </div>

          {/* Details Sub-Tabs */}
          <div className={styles.detailsSubTabs}>
            <button
              className={`${styles.detailsSubTabBtn} ${
                detailsSubTab === 'overview' ? styles.detailsSubTabBtnActive : ''
              }`}
              onClick={() => setDetailsSubTab('overview')}
            >
              Overview
            </button>
            <button
              className={`${styles.detailsSubTabBtn} ${
                detailsSubTab === 'practice' ? styles.detailsSubTabBtnActive : ''
              }`}
              onClick={() => setDetailsSubTab('practice')}
            >
              Practice
            </button>
            <button
              className={`${styles.detailsSubTabBtn} ${
                detailsSubTab === 'experiments' ? styles.detailsSubTabBtnActive : ''
              }`}
              onClick={() => setDetailsSubTab('experiments')}
            >
              Experiments
            </button>
          </div>

          {/* Subtab Content: Overview */}
          {detailsSubTab === 'overview' && (
            <div>
              {/* 3 Score Bars */}
              <div className={styles.scoreBarsGroup}>
                <div className={styles.scoreBarCol}>
                  <span className={styles.scoreBarLabel}>Mastery Score</span>
                  <span className={styles.scoreBarValue}>{activeConcept.mastery_score != null ? `${Math.round(activeConcept.mastery_score)}%` : '—'}</span>
                  <div className={styles.scoreBarTrack}>
                    <div
                      className={styles.scoreBarCoralFill}
                      style={{ width: `${activeConcept.mastery_score != null ? Math.max(0, Math.min(100, activeConcept.mastery_score)) : 0}%` }}
                    />
                  </div>
                </div>

                <div className={styles.scoreBarCol}>
                  <span className={styles.scoreBarLabel}>Practice Strength</span>
                  <span className={styles.scoreBarValue}>{activeConcept.practice_strength != null ? `${Math.round(activeConcept.practice_strength)}%` : '—'}</span>
                  <div className={styles.scoreBarTrack}>
                    <div
                      className={styles.scoreBarOrangeFill}
                      style={{ width: `${activeConcept.practice_strength != null ? Math.max(0, Math.min(100, activeConcept.practice_strength)) : 0}%` }}
                    />
                  </div>
                </div>

                <div className={styles.scoreBarCol}>
                  <span className={styles.scoreBarLabel}>Academic Strength</span>
                  <span className={styles.scoreBarValue}>{activeConcept.academic_strength != null ? `${Math.round(activeConcept.academic_strength)}%` : '—'}</span>
                  <div className={styles.scoreBarTrack}>
                    <div
                      className={styles.scoreBarCoralFill}
                      style={{ width: `${activeConcept.academic_strength != null ? Math.max(0, Math.min(100, activeConcept.academic_strength)) : 0}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Why Focus On This Callout Box */}
              <div className={styles.calloutBox}>
                <Lightbulb size={18} className={styles.calloutIcon} />
                <div className={styles.calloutContent}>
                  <h5>Why focus on this?</h5>
                  <p>{activeConcept.callout_reason}</p>
                </div>
              </div>

              {/* Recommended Next Steps */}
              <h5 className={styles.recommendedSectionTitle}>Recommended Next Steps</h5>
              <div className={styles.stepsList}>
                {activeConcept.recommended_steps.length === 0 ? (
                  <p style={{ color: '#64748b' }}>No recorded next-step recommendations are available.</p>
                ) : activeConcept.recommended_steps.map((st) => (
                  <div key={st.step} className={styles.stepItem}>
                    <div className={styles.stepLeft}>
                      <span className={styles.stepNumCircle}>{st.step}</span>
                      <span className={styles.stepTitle}>{st.title}</span>
                    </div>

                    {st.action_link.startsWith('#') ? (
                      <button
                        className={styles.stepActionBtn}
                        onClick={() => setIsVideoModalOpen(true)}
                      >
                        {st.action_label}
                      </button>
                    ) : (
                      <Link href={st.action_link} style={{ textDecoration: 'none' }}>
                        <button className={styles.stepActionBtn}>{st.action_label}</button>
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Subtab Content: Practice */}
          {detailsSubTab === 'practice' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.65rem',
                  background: '#f8fafc',
                  padding: '0.85rem',
                  borderRadius: '0.5rem',
                }}
              >
                <div>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Attempted</span>
                  <p style={{ fontSize: '1.1rem', fontWeight: 800, margin: '2px 0 0', color: '#0f172a' }}>
                    {activeConcept.practice_stats.attempted != null ? `${activeConcept.practice_stats.attempted} problems` : '—'}
                  </p>
                </div>
                <div>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Solved</span>
                  <p style={{ fontSize: '1.1rem', fontWeight: 800, margin: '2px 0 0', color: '#16a34a' }}>
                    {activeConcept.practice_stats.solved != null ? `${activeConcept.practice_stats.solved} accepted` : '—'}
                  </p>
                </div>
                <div>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Acceptance Rate</span>
                  <p style={{ fontSize: '1.1rem', fontWeight: 800, margin: '2px 0 0', color: '#ea580c' }}>
                    {activeConcept.practice_stats.acceptance_rate != null ? `${activeConcept.practice_stats.acceptance_rate}%` : '—'}
                  </p>
                </div>
                <div>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Avg Solve Time</span>
                  <p style={{ fontSize: '1.1rem', fontWeight: 800, margin: '2px 0 0', color: '#475569' }}>
                    {activeConcept.practice_stats.avg_time_mins != null ? `${activeConcept.practice_stats.avg_time_mins} mins` : '—'}
                  </p>
                </div>
              </div>

              <Link
                href={`/student/practice?topic=${encodeURIComponent(activeConcept.name)}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '0.6rem 1rem',
                  background: '#7c3aed',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  borderRadius: '0.5rem',
                  textDecoration: 'none',
                  marginTop: '0.5rem',
                }}
              >
                <Code2 size={16} /> Open Practice Arena
              </Link>
            </div>
          )}

          {/* Subtab Content: Experiments */}
          {detailsSubTab === 'experiments' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  padding: '0.85rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Linked Lab Exercises:</span>
                  <strong style={{ fontSize: '0.78rem', color: '#0f172a' }}>
                    {activeConcept.experiment_stats.count != null ? `${activeConcept.experiment_stats.count} completed` : '—'}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Average Grade:</span>
                  <strong style={{ fontSize: '0.78rem', color: '#7c3aed' }}>
                    {activeConcept.experiment_stats.avg_grade != null ? `${activeConcept.experiment_stats.avg_grade}%` : '—'}
                  </strong>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.5rem' }}>
                  Latest: <em>{activeConcept.experiment_stats.last_submission || '—'}</em>
                </div>
              </div>

              <Link
                href="/student/subjects"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '0.6rem 1rem',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  color: '#334155',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  borderRadius: '0.5rem',
                  textDecoration: 'none',
                }}
              >
                <FileText size={16} /> Review Lab Worksheets
              </Link>
            </div>
          )}
          </> : <p style={{ color: '#64748b', padding: '1rem 0' }}>No concept records are available for the selected filters.</p>}
        </div>
      </div>

      {/* ── 4. Bottom Section: 3 Equal Width Cards ────────────────────────── */}
      <div className={styles.bottomGrid}>
        {/* Card 1: Top Strengths */}
        <div className={styles.card}>
          <div className={styles.bottomCardHeader}>
            <div className={styles.bottomTitleBlock}>
              <div style={{ color: '#7c3aed', display: 'flex' }}>
                <Trophy size={18} />
              </div>
              <div>
                <h3>Top Strengths</h3>
                <p>Your strongest concepts across subjects.</p>
              </div>
            </div>
            <button
              type="button"
              className={styles.viewAllLink}
              onClick={() => setIsStrengthsModalOpen(true)}
            >
              View All <ArrowRight size={12} />
            </button>
          </div>

          <div className={styles.rankedList}>
            {(dashboardData?.top_strengths || []).map((item) => (
              <div
                key={item.rank}
                className={styles.rankedRowItem}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedConceptName(item.concept_name)}
                title={`Inspect ${item.concept_name}`}
              >
                <span className={`${styles.rankNumberBadge} ${styles.rankGreen}`}>
                  {item.rank}
                </span>
                <span className={styles.rankedRowName}>{item.name}</span>
                <div className={styles.rankedBarTrack}>
                  <div
                    className={styles.rankedBarFillGreen}
                    style={{ width: `${Math.min(100, item.score)}%` }}
                  />
                </div>
                <span className={styles.rankedRowScore}>{Math.round(item.score)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Card 2: Focus Next */}
        <div className={styles.card}>
          <div className={styles.bottomCardHeader}>
            <div className={styles.bottomTitleBlock}>
              <div style={{ color: '#ea580c', display: 'flex' }}>
                <Target size={18} />
              </div>
              <div>
                <h3>Focus Next</h3>
                <p>Recommended concepts to improve.</p>
              </div>
            </div>
            <button
              type="button"
              className={styles.viewAllLink}
              onClick={() => setIsFocusModalOpen(true)}
            >
              View All <ArrowRight size={12} />
            </button>
          </div>

          <div className={styles.rankedList}>
            {(dashboardData?.focus_next || []).map((item) => (
              <div
                key={item.rank}
                className={styles.rankedRowItem}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedConceptName(item.concept_name)}
                title={`Inspect ${item.concept_name}`}
              >
                <span className={`${styles.rankNumberBadge} ${styles.rankOrange}`}>
                  {item.rank}
                </span>
                <span className={styles.rankedRowName}>{item.name}</span>
                <div className={styles.rankedBarTrack}>
                  <div
                    className={styles.rankedBarFillCoral}
                    style={{ width: `${Math.min(100, item.score)}%` }}
                  />
                </div>
                <span className={styles.rankedRowScore}>{Math.round(item.score)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Card 3: Learning Path & Unlocks */}
        <div className={styles.card}>
          <div className={styles.bottomCardHeader}>
            <div className={styles.bottomTitleBlock}>
              <div style={{ color: '#7c3aed', display: 'flex' }}>
                <BookOpen size={18} />
              </div>
              <div>
                <h3>Learning Path & Unlocks</h3>
                <p>Your progress towards next topic unlocks.</p>
              </div>
            </div>
            <button
              className={styles.viewAllLink}
              onClick={() => setIsUnlocksModalOpen(true)}
            >
              View All <ArrowRight size={12} />
            </button>
          </div>

          <div className={styles.unlocksList}>
            {(dashboardData?.learning_path_unlocks || []).map((un) => {
              const iconBg =
                un.color === 'gold'
                  ? '#fef9c3'
                  : un.color === 'purple'
                  ? '#f3e8ff'
                  : un.color === 'blue'
                  ? '#e0f2fe'
                  : '#ffedd5';
              const iconColor =
                un.color === 'gold'
                  ? '#a16207'
                  : un.color === 'purple'
                  ? '#7c3aed'
                  : un.color === 'blue'
                  ? '#0284c7'
                  : '#c2410c';
              const barFillColor =
                un.color === 'gold'
                  ? 'linear-gradient(90deg, #facc15, #eab308)'
                  : un.color === 'purple'
                  ? 'linear-gradient(90deg, #c084fc, #7c3aed)'
                  : un.color === 'blue'
                  ? 'linear-gradient(90deg, #38bdf8, #0284c7)'
                  : 'linear-gradient(90deg, #fb923c, #f97316)';

              return (
                <div key={un.id} className={styles.unlockRowItem}>
                  <div className={styles.unlockTitleRow}>
                    <div
                      className={styles.unlockIconCircle}
                      style={{ background: iconBg, color: iconColor }}
                    >
                      {un.icon === 'lock' && <Lock size={12} />}
                      {un.icon === 'shield' && <Shield size={12} />}
                      {un.icon === 'book' && <BookOpen size={12} />}
                      {un.icon === 'trophy' && <Trophy size={12} />}
                    </div>
                    <span className={styles.unlockTitle}>{un.title}</span>
                  </div>

                  <div className={styles.unlockProgressRow}>
                    <div className={styles.unlockBarTrack}>
                      <div
                        className={styles.unlockBarFill}
                        style={{
                          width: `${Math.min(100, un.progress_pct)}%`,
                          background: barFillColor,
                        }}
                      />
                    </div>
                    <span className={styles.unlockCurrentText}>{un.current_display}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Concept Video Modal */}
      {isVideoModalOpen && activeConcept && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setIsVideoModalOpen(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '1rem',
              padding: '1.5rem',
              width: '90%',
              maxWidth: '560px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1rem',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                {activeConcept.name}: Concept Explainer (10 mins)
              </h3>
              <button
                onClick={() => setIsVideoModalOpen(false)}
                style={{
                  border: 'none',
                  background: '#f1f5f9',
                  borderRadius: '50%',
                  width: '28px',
                  height: '28px',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                ✕
              </button>
            </div>
            <div
              style={{
                width: '100%',
                height: '280px',
                background: '#0f172a',
                borderRadius: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                gap: '0.75rem',
              }}
            >
              <PlayCircle size={48} color="#a855f7" />
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
                Video Tutorial: Core principles of {activeConcept.name}
              </p>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginTop: '1rem',
                gap: '0.5rem',
              }}
            >
              <button
                onClick={() => setIsVideoModalOpen(false)}
                style={{
                  padding: '0.45rem 1rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
              <Link
                href={`/student/practice?topic=${encodeURIComponent(activeConcept.name)}`}
                style={{ textDecoration: 'none' }}
              >
                <button
                  style={{
                    padding: '0.45rem 1rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    background: '#7c3aed',
                    color: '#ffffff',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Start Practice
                </button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Learning Path & Unlocks Roadmap Modal */}
      {isUnlocksModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setIsUnlocksModalOpen(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '1rem',
              padding: '1.5rem',
              width: '90%',
              maxWidth: '620px',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1.25rem',
                borderBottom: '1px solid #f1f5f9',
                paddingBottom: '0.75rem',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                  Learning Path & Topic Milestones
                </h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                  Requirements to unlock next tier concepts, practice sets, and advanced labs.
                </p>
              </div>
              <button
                onClick={() => setIsUnlocksModalOpen(false)}
                style={{
                  border: 'none',
                  background: '#f1f5f9',
                  borderRadius: '50%',
                  width: '30px',
                  height: '30px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {(dashboardData?.learning_path_unlocks || []).length === 0 ? (
                <p style={{ color: '#64748b', textAlign: 'center', padding: '1rem' }}>No unlock progress is available.</p>
              ) : (dashboardData?.learning_path_unlocks || []).map((un: any) => (
                <div
                  key={un.id}
                  style={{
                    padding: '1rem',
                    border: '1px solid #eef2f6',
                    borderRadius: '0.75rem',
                    background: '#f8fafc',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a' }}>{un.title}</span>
                    <span style={{ fontWeight: 700, fontSize: '0.78rem', color: '#7c3aed' }}>{un.current_display}</span>
                  </div>
                  <div style={{ width: '100%', height: '7px', background: '#e2e8f0', borderRadius: '9999px', overflow: 'hidden', margin: '0.4rem 0' }}>
                    <div
                      style={{
                        width: `${Math.min(100, un.progress_pct)}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #a855f7, #7c3aed)',
                        borderRadius: '9999px',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: '#64748b', marginTop: '0.35rem' }}>
                    <Sparkles size={11} color="#7c3aed" />
                    <span>Unlock progress from recorded solves.</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button
                onClick={() => setIsUnlocksModalOpen(false)}
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  background: '#7c3aed',
                  color: '#ffffff',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── All Top Strengths Modal ── */}
      {isStrengthsModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={() => setIsStrengthsModalOpen(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '1.25rem',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '680px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid #e2e8f0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1rem',
                borderBottom: '1px solid #f1f5f9',
                paddingBottom: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{ color: '#7c3aed', display: 'flex' }}>
                  <Trophy size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                    All Top Strengths
                  </h3>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                    Ranked concepts where you have demonstrated mastery and high proficiency.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsStrengthsModalOpen(false)}
                style={{
                  border: 'none',
                  background: '#f1f5f9',
                  borderRadius: '50%',
                  width: '30px',
                  height: '30px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ overflowY: 'auto', maxHeight: '420px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {allConcepts
                .slice()
                .sort((a, b) => b.score - a.score)
                .map((item, idx) => (
                  <div
                    key={item.id}
                    className={styles.rankedRowItem}
                    style={{
                      cursor: 'pointer',
                      padding: '0.65rem 0.85rem',
                      border: '1px solid #f1f5f9',
                      borderRadius: '0.625rem',
                    }}
                    onClick={() => {
                      setSelectedConceptName(item.name);
                      setSelectedTopic(item.name);
                      setIsStrengthsModalOpen(false);
                    }}
                    title={`Click to inspect ${item.name}`}
                  >
                    <span className={`${styles.rankNumberBadge} ${styles.rankGreen}`}>
                      {idx + 1}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span className={styles.rankedRowName}>{item.name}</span>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginLeft: '0.5rem' }}>
                        ({item.domain})
                      </span>
                    </div>
                    <div className={styles.rankedBarTrack} style={{ maxWidth: '140px' }}>
                      <div
                        className={styles.rankedBarFillGreen}
                        style={{ width: `${Math.min(100, item.score)}%` }}
                      />
                    </div>
                    <span className={styles.rankedRowScore}>{Math.round(item.score)}%</span>
                  </div>
                ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
              <button
                onClick={() => setIsStrengthsModalOpen(false)}
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  background: '#7c3aed',
                  color: '#ffffff',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── All Recommended Focus Areas Modal ── */}
      {isFocusModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={() => setIsFocusModalOpen(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '1.25rem',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '680px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid #e2e8f0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1rem',
                borderBottom: '1px solid #f1f5f9',
                paddingBottom: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{ color: '#ea580c', display: 'flex' }}>
                  <Target size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                    All Focus Next Areas
                  </h3>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                    Priority concepts where additional practice will yield the largest score improvements.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsFocusModalOpen(false)}
                style={{
                  border: 'none',
                  background: '#f1f5f9',
                  borderRadius: '50%',
                  width: '30px',
                  height: '30px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ overflowY: 'auto', maxHeight: '420px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {allConcepts
                .slice()
                .sort((a, b) => a.score - b.score)
                .map((item, idx) => (
                  <div
                    key={item.id}
                    className={styles.rankedRowItem}
                    style={{
                      cursor: 'pointer',
                      padding: '0.65rem 0.85rem',
                      border: '1px solid #f1f5f9',
                      borderRadius: '0.625rem',
                    }}
                    onClick={() => {
                      setSelectedConceptName(item.name);
                      setSelectedTopic(item.name);
                      setIsFocusModalOpen(false);
                    }}
                    title={`Click to inspect ${item.name}`}
                  >
                    <span className={`${styles.rankNumberBadge} ${styles.rankOrange}`}>
                      {idx + 1}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span className={styles.rankedRowName}>{item.name}</span>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginLeft: '0.5rem' }}>
                        ({item.domain})
                      </span>
                    </div>
                    <div className={styles.rankedBarTrack} style={{ maxWidth: '140px' }}>
                      <div
                        className={styles.rankedBarFillCoral}
                        style={{ width: `${Math.min(100, item.score)}%` }}
                      />
                    </div>
                    <span className={styles.rankedRowScore}>{Math.round(item.score)}%</span>
                  </div>
                ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
              <button
                onClick={() => setIsFocusModalOpen(false)}
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  background: '#7c3aed',
                  color: '#ffffff',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
