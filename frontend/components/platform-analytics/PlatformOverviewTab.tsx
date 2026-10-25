'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Flame, Trophy, Target, ArrowRight, BookOpen, CheckCircle2,
  ChevronRight, Lock, Zap, FileText, ChevronDown, Sparkles
} from 'lucide-react';
import type {
  FreeAnalyticsOverview,
  FreeRecommendation,
} from '@/services/free.service';
import styles from './free-analytics.module.css';

interface FreeOverviewTabProps {
  overview: FreeAnalyticsOverview;
  recommendations?: FreeRecommendation[];
  onNavigateTab: (tab: string) => void;
  onOpenShare?: () => void;
}

/* ── Custom Laurel Wreath & Royal Crown Crest SVG ── */
function CrownCrestBadge() {
  return (
    <svg width="68" height="68" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="crestGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <path
        d="M40 7 L66 22 V46 C66 60 40 72 40 72 C40 72 14 60 14 46 V22 Z"
        fill="url(#crestGrad)"
      />
      <path d="M28 44 L32 30 L40 37 L48 30 L52 44 Z" fill="#ffffff" />
      <circle cx="32" cy="28" r="2" fill="#ffffff" />
      <circle cx="40" cy="34" r="2" fill="#ffffff" />
      <circle cx="48" cy="28" r="2" fill="#ffffff" />
      <rect x="28" y="46" width="24" height="3" rx="1.5" fill="#ffffff" />
      <path
        d="M10 38 C7 48 15 58 24 64"
        stroke="#c4b5fd"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="11" cy="40" r="2" fill="#c4b5fd" />
      <circle cx="15" cy="49" r="2" fill="#c4b5fd" />
      <circle cx="21" cy="57" r="2" fill="#c4b5fd" />
      <path
        d="M70 38 C73 48 65 58 56 64"
        stroke="#c4b5fd"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="69" cy="40" r="2" fill="#c4b5fd" />
      <circle cx="65" cy="49" r="2" fill="#c4b5fd" />
      <circle cx="59" cy="57" r="2" fill="#c4b5fd" />
    </svg>
  );
}

/* ── Circular Progress Ring ── */
function ProgressRing({
  percent,
  size = 68,
  strokeWidth = 6,
  label,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#e2e8f0"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#ringGradBlue)"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        <defs>
          <linearGradient id="ringGradBlue" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
        </defs>
      </svg>
      <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.1 }}>
        {label && <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', fontFamily: 'Space Grotesk, sans-serif' }}>{label}</span>}
        <span style={{ fontSize: 11, fontWeight: 700, color: label ? '#64748b' : '#0f172a', fontFamily: 'Space Grotesk, sans-serif' }}>{percent}%</span>
      </div>
    </div>
  );
}

/* ── Course Logos ── */
function MiniCourseLogo({ slug }: { slug: string }) {
  const s = slug.toLowerCase();
  if (s.includes('python')) {
    return (
      <svg width="34" height="34" viewBox="0 0 128 128" fill="none">
        <path d="M63.5 12C42.8 12 44.2 21 44.2 21L44.3 30.3H64.2V33.2H36.3C22.6 33.2 12.8 44.9 12.8 58.7C12.8 74.8 20.8 73.2 28.5 73.2H34.4V64.9C34.4 53.6 43.8 44.5 55.4 44.5H74.4C83.5 44.5 90.9 37 90.9 27.8V17.9C90.9 17.9 84.1 12 63.5 12ZM52.4 20.4C55.7 20.4 58.3 23 58.3 26.3C58.3 29.5 55.7 32.1 52.4 32.1C49.2 32.1 46.5 29.5 46.5 26.3C46.5 23 49.2 20.4 52.4 20.4Z" fill="#3776AB"/>
        <path d="M64.5 116C85.2 116 83.8 107 83.8 107L83.7 97.7H63.8V94.8H91.7C105.4 94.8 115.2 83.1 115.2 69.3C115.2 53.2 107.2 54.8 99.5 54.8H93.6V63.1C93.6 74.4 84.2 83.5 72.6 83.5H53.6C44.5 83.5 37.1 91 37.1 100.2V110.1C37.1 110.1 43.9 116 64.5 116ZM75.6 107.6C72.3 107.6 69.7 105 69.7 101.7C69.7 98.5 72.3 95.9 75.6 95.9C78.8 95.9 81.5 98.5 81.5 101.7C81.5 105 78.8 107.6 75.6 107.6Z" fill="#FFD43B"/>
      </svg>
    );
  }
  if (s.includes('data-structure') || s.includes('dsa')) {
    return (
      <svg width="34" height="34" viewBox="0 0 48 48" fill="none">
        <polygon points="24,6 34,11 24,16 14,11" fill="#ec4899"/>
        <polygon points="14,11 24,16 24,25 14,20" fill="#be185d"/>
        <polygon points="24,16 34,11 34,20 24,25" fill="#db2777"/>
        <polygon points="14,24 24,29 14,34 4,29" fill="#38bdf8"/>
        <polygon points="4,29 14,34 14,42 4,37" fill="#0284c7"/>
        <polygon points="14,34 24,29 24,37 14,42" fill="#0ea5e9"/>
        <polygon points="34,24 44,29 34,34 24,29" fill="#818cf8"/>
        <polygon points="24,29 34,34 34,42 24,37" fill="#4338ca"/>
        <polygon points="34,34 44,29 44,37 34,42" fill="#6366f1"/>
      </svg>
    );
  }
  return (
    <svg width="34" height="34" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="10" r="4.5" fill="#38bdf8" stroke="#0284c7" strokeWidth="2"/>
      <circle cx="10" cy="36" r="4.5" fill="#60a5fa" stroke="#2563eb" strokeWidth="2"/>
      <circle cx="38" cy="36" r="4.5" fill="#818cf8" stroke="#4f46e5" strokeWidth="2"/>
      <line x1="24" y1="15" x2="13" y2="32" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round"/>
      <line x1="24" y1="15" x2="35" y2="32" stroke="#818cf8" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

/* ── Interactive Multi-Axis Topic Proficiency Radar SVG ── */
function TopicProficiencyRadarSVG({
  topics,
  activeTopicIndex,
  onHoverTopic,
  onClickTopic,
}: {
  topics: Array<{
    name: string;
    score: number;
    color: string;
    solved?: number;
    attempted?: number;
    accuracy?: number;
  }>;
  activeTopicIndex: number | null;
  onHoverTopic: (idx: number | null) => void;
  onClickTopic?: (topicName: string) => void;
}) {
  const cx = 150;
  const cy = 135;
  const r = 85;
  const count = Math.max(3, topics.length);

  const levels = [0.25, 0.5, 0.75, 1.0];

  const getCoords = (i: number, frac: number) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    return {
      x: cx + r * frac * Math.cos(angle),
      y: cy + r * frac * Math.sin(angle),
    };
  };

  const gridPolys = levels.map((frac) => {
    return Array.from({ length: count })
      .map((_, i) => {
        const { x, y } = getCoords(i, frac);
        return `${x},${y}`;
      })
      .join(' ');
  });

  const dataPolyPoints = topics
    .map((t, i) => {
      const frac = Math.min(1, Math.max(0.12, (t.score || 0) / 100));
      const { x, y } = getCoords(i, frac);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div style={{ position: 'relative', width: 300, height: 270 }}>
      <svg width="300" height="270" viewBox="0 0 300 270" fill="none">
        <defs>
          <linearGradient id="radarFillGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.15" />
          </linearGradient>
          <filter id="radarGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Concentric Grids */}
        {gridPolys.map((points, idx) => (
          <polygon
            key={idx}
            points={points}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="1.2"
          />
        ))}

        {/* Spokes */}
        {Array.from({ length: count }).map((_, i) => {
          const { x, y } = getCoords(i, 1.0);
          const isSpokeActive = activeTopicIndex === i;
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke={isSpokeActive ? '#7c3aed' : '#e2e8f0'}
              strokeWidth={isSpokeActive ? '2' : '1'}
              strokeDasharray={isSpokeActive ? 'none' : '2 2'}
              style={{ transition: 'stroke 0.2s ease, stroke-width 0.2s ease' }}
            />
          );
        })}

        {/* Data Polygon Fill */}
        <polygon
          points={dataPolyPoints}
          fill="url(#radarFillGrad)"
          stroke="#7c3aed"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />

        {/* Interactive Vertex Nodes */}
        {topics.map((t, i) => {
          const frac = Math.min(1, Math.max(0.12, (t.score || 0) / 100));
          const { x: px, y: py } = getCoords(i, frac);
          const { x: lx, y: ly } = getCoords(i, 1.24);
          const isSelected = activeTopicIndex === i;

          return (
            <g
              key={i}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => onHoverTopic(i)}
              onMouseLeave={() => onHoverTopic(null)}
              onClick={() => onClickTopic && onClickTopic(t.name)}
            >
              {/* Pulsing ring on hover */}
              {isSelected && (
                <circle
                  cx={px}
                  cy={py}
                  r="9"
                  fill="#7c3aed"
                  opacity="0.25"
                  filter="url(#radarGlow)"
                />
              )}

              {/* Vertex dot */}
              <circle
                cx={px}
                cy={py}
                r={isSelected ? 6 : 4}
                fill={isSelected ? '#6d28d9' : '#7c3aed'}
                stroke="#ffffff"
                strokeWidth="2"
                style={{ transition: 'r 0.2s ease, fill 0.2s ease' }}
              />

              {/* Label & Score Badge */}
              <g transform={`translate(${lx}, ${ly})`}>
                <text
                  x="0"
                  y="-7"
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight={isSelected ? '800' : '700'}
                  fill={isSelected ? '#7c3aed' : '#475569'}
                  fontFamily="Space Grotesk, sans-serif"
                >
                  {t.name}
                </text>
                <rect
                  x="-13"
                  y="-5"
                  width="26"
                  height="16"
                  rx="4"
                  fill={isSelected ? '#7c3aed' : '#f5f3ff'}
                  stroke={isSelected ? '#7c3aed' : '#c4b5fd'}
                  strokeWidth="1"
                  style={{ transition: 'all 0.2s ease' }}
                />
                <text
                  x="0"
                  y="6.5"
                  textAnchor="middle"
                  fontSize="9.5"
                  fontWeight="800"
                  fill={isSelected ? '#ffffff' : '#7c3aed'}
                  fontFamily="Space Grotesk, sans-serif"
                >
                  {t.score}
                </text>
              </g>
            </g>
          );
        })}
      </svg>

      {/* Floating Tooltip Callout on Topic Hover */}
      {activeTopicIndex !== null && topics[activeTopicIndex] && (
        <div
          style={{
            position: 'absolute',
            bottom: '10px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15, 23, 42, 0.95)',
            color: '#fff',
            padding: '6px 12px',
            borderRadius: '8px',
            fontSize: '11px',
            fontFamily: "'Space Grotesk', sans-serif",
            whiteSpace: 'nowrap',
            boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
            pointerEvents: 'none',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ fontWeight: 800, color: '#c4b5fd' }}>
            {topics[activeTopicIndex].name}
          </span>
          <span>·</span>
          <span>Mastery: <strong>{topics[activeTopicIndex].score}%</strong></span>
          {topics[activeTopicIndex].solved !== undefined && (
            <>
              <span>·</span>
              <span>Solved: {topics[activeTopicIndex].solved}</span>
            </>
          )}
          {topics[activeTopicIndex].accuracy !== undefined && (
            <>
              <span>·</span>
              <span>Acc: {topics[activeTopicIndex].accuracy}%</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export const FreeOverviewTab: React.FC<FreeOverviewTabProps> = ({
  overview,
  recommendations = [],
  onNavigateTab,
  onOpenShare,
}) => {
  const router = useRouter();
  const [activeTopicIdx, setActiveTopicIdx] = useState<number | null>(null);
  const [selectedFilterBand, setSelectedFilterBand] = useState<string>('All Topics');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);

  // Exact Database Metrics Extraction (Using ?? 0 to avoid masking true 0 values)
  const standing = overview?.standing ?? ({} as any);
  const diffMix = overview?.difficulty_mix ?? ({} as any);
  const unlocks = overview?.unlocks ?? ({} as any);

  const rating = Math.round(standing.rating ?? 0);
  const percentile = standing.global_percentile != null
    ? Math.max(1, 100 - Math.round(standing.global_percentile))
    : null;
  const rankMovement = standing.rank_movement ?? 0;

  const level = standing.level ?? 1;
  const levelName = standing.level_name ?? 'Newcomer';
  const currentXp = standing.total_xp ?? 0;
  const xpForNext = standing.next_level_xp ?? 100;
  const levelPct = xpForNext > 0 ? Math.min(100, Math.round((currentXp / xpForNext) * 100)) : 0;
  const xpRemaining = Math.max(0, xpForNext - currentXp);

  const streakDays = standing.streak_days ?? 0;
  const solvedTotal = standing.problems_solved ?? diffMix.total_solved ?? 0;
  const accuracy = diffMix.acceptance_rate ?? 0;

  const easySolved = standing.easy_solved ?? diffMix.easy ?? 0;
  const medSolved = standing.medium_solved ?? diffMix.medium ?? 0;
  const hardSolved = standing.hard_solved ?? diffMix.hard ?? 0;

  // Real Database Topics for Radar
  const rawTopics = overview?.topic_strength ?? [];
  const palette = ['#3b82f6', '#10b981', '#8b5cf6', '#f97316', '#a855f7', '#ef4444', '#06b6d4', '#eab308'];

  // Filter topics by band if user selected one
  const filteredTopicsList = rawTopics.filter((t) => {
    if (selectedFilterBand === 'All Topics') return true;
    if (selectedFilterBand === 'Mastered') return t.strength >= 70;
    if (selectedFilterBand === 'Proficient') return t.strength >= 50 && t.strength < 70;
    if (selectedFilterBand === 'Needs Practice') return t.strength < 50;
    return true;
  });

  const topTopics = (filteredTopicsList.length > 0 ? filteredTopicsList : rawTopics).slice(0, 6);

  const radarTopics = topTopics.length >= 3
    ? topTopics.map((t, idx) => ({
        name: t.topic,
        score: Math.round(t.strength ?? 0),
        color: palette[idx % palette.length],
        solved: t.total_solved,
        attempted: t.total_attempted,
        accuracy: Math.round(t.accuracy_pct ?? 0),
      }))
    : [
        { name: 'Algorithms', score: 0, color: '#3b82f6', solved: 0, accuracy: 0 },
        { name: 'Arrays', score: 0, color: '#10b981', solved: 0, accuracy: 0 },
        { name: 'Strings', score: 0, color: '#8b5cf6', solved: 0, accuracy: 0 },
        { name: 'Data Structures', score: 0, color: '#f97316', solved: 0, accuracy: 0 },
        { name: 'Problem Solving', score: 0, color: '#a855f7', solved: 0, accuracy: 0 },
        { name: 'Mathematics', score: 0, color: '#ef4444', solved: 0, accuracy: 0 },
      ];

  // Real Database Highlights
  const dbHighlights = overview?.highlights ?? [];

  // Real Database Recommendations
  const displayRecs = recommendations.slice(0, 3);

  // Real Database Enrolled Courses
  const enrolledCourses = overview?.courses ?? [];

  // Next Unlock Target from Database
  const nextUnlockInfo = unlocks?.next_unlock;
  const gateTitle = nextUnlockInfo?.target || (unlocks?.medium_unlocked ? 'Hard Difficulty Problems' : 'Medium Difficulty Problems');
  const gateRequirement = nextUnlockInfo?.requirement || (unlocks?.medium_unlocked ? 'Solve 20 Medium problems OR attain 1500+ Platform Rating' : 'Solve 10 Easy problems OR attain 300+ Platform Rating');
  const gateCurrent = nextUnlockInfo?.current || (unlocks?.medium_unlocked ? `${medSolved}/20 medium solved` : `${easySolved}/10 easy solved`);
  const gateProgressPct = Math.round(nextUnlockInfo?.progress_pct ?? (unlocks?.medium_unlocked ? Math.min(100, (medSolved / 20) * 100) : Math.min(100, (easySolved / 10) * 100)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>

      {/* ══ 1. UNIFIED RATING & LEVEL OVERVIEW CARD ══ */}
      <div className={styles.overviewHeroCard}>
        
        {/* Column 1: Platform Rating */}
        <div className={styles.heroColRating}>
          <div className={styles.crestIconBox}>
            <CrownCrestBadge />
          </div>
          <div className={styles.ratingInfo}>
            <span className={styles.ratingLabel}>Platform Rating</span>
            <span className={styles.ratingBig}>{rating.toLocaleString()}</span>
            <span className={styles.ratingSubtext}>
              {percentile ? `Top ${percentile}% worldwide` : 'Unranked · Complete challenges to rank'}
            </span>
            <span className={styles.ratingTrend}>
              {rankMovement > 0 ? `▲ +${rankMovement} this week` : rankMovement < 0 ? `▼ ${rankMovement}` : 'Stable this week'}
            </span>
          </div>
        </div>

        {/* Column 2: Level Progress Ring */}
        <div className={styles.heroColLevel}>
          <div className={styles.levelRingBox}>
            <ProgressRing percent={levelPct} label={`Lv ${level}`} size={72} strokeWidth={6.5} />
          </div>
          <div className={styles.levelTextSide}>
            <h3 className={styles.levelTitle}>Level {level} · {levelName}</h3>
            <p className={styles.levelXpSub}>{currentXp.toLocaleString()} / {xpForNext.toLocaleString()} XP</p>
            <div className={styles.levelProgressBar}>
              <div className={styles.levelProgressFill} style={{ width: `${levelPct}%` }} />
            </div>
            <span className={styles.levelNextHelp}>
              {xpRemaining > 0 ? `${xpRemaining.toLocaleString()} XP to Level ${level + 1}` : 'Max level achieved'}
            </span>
          </div>
        </div>

        {/* Column 3: Stats & Difficulty Mix */}
        <div className={styles.heroColStats}>
          <div className={styles.statsTopRow}>
            <div className={styles.statItemCol}>
              <span className={styles.statItemIcon}>🔥</span>
              <div className={styles.statNumBlock}>
                <span className={styles.statNumBig}>{streakDays}</span>
                <span className={styles.statNumLabel}>Day Streak</span>
              </div>
            </div>

            <div className={styles.statItemCol}>
              <CheckCircle2 size={18} color="#16a34a" />
              <div className={styles.statNumBlock}>
                <span className={styles.statNumBig}>{solvedTotal}</span>
                <span className={styles.statNumLabel}>Problems Solved</span>
              </div>
            </div>

            <div className={styles.statItemCol}>
              <Target size={18} color="#ea580c" />
              <div className={styles.statNumBlock}>
                <span className={styles.statNumBig}>{accuracy.toFixed(1)}%</span>
                <span className={styles.statNumLabel}>Accuracy</span>
              </div>
            </div>
          </div>

          <div className={styles.diffPillsRow}>
            <div className={styles.diffPillBox} title="Easy Problems Solved">
              <span className={`${styles.diffInitialBadge} ${styles.diffInitialE}`}>E</span>
              <span>{easySolved}</span>
            </div>
            <div className={styles.diffPillBox} title="Medium Problems Solved">
              <span className={`${styles.diffInitialBadge} ${styles.diffInitialM}`}>M</span>
              <span>{medSolved}</span>
            </div>
            <div className={styles.diffPillBox} title="Hard Problems Solved">
              <span className={`${styles.diffInitialBadge} ${styles.diffInitialH}`}>H</span>
              <span>{hardSolved}</span>
            </div>
          </div>
        </div>

      </div>

      {/* ══ 2. HIGHLIGHTS ROW (Driven by Live DB Highlights) ══ */}
      <div className={styles.highlightsGrid4}>
        <div className={styles.highlightCardInteractive} onClick={() => onNavigateTab('ladder')}>
          <div className={styles.highlightIconCircle} style={{ background: '#fef3c7', color: '#d97706' }}>
            <Trophy size={18} />
          </div>
          <div className={styles.highlightInfoBlock}>
            <span className={styles.highlightCardTitle}>
              {percentile ? `Top ${percentile}% Platform Rank` : 'Platform Standing'}
            </span>
            <span className={styles.highlightCardSub}>Among all NexLab coders</span>
          </div>
          <ChevronRight size={15} className={styles.highlightChevron} />
        </div>

        <div className={styles.highlightCardInteractive} onClick={() => onNavigateTab('activity')}>
          <div className={styles.highlightIconCircle} style={{ background: '#fee2e2', color: '#dc2626' }}>
            <Flame size={18} />
          </div>
          <div className={styles.highlightInfoBlock}>
            <span className={styles.highlightCardTitle}>
              {streakDays > 0 ? `Active ${streakDays}-Day Streak` : 'Start Daily Streak'}
            </span>
            <span className={styles.highlightCardSub}>
              {streakDays > 0 ? 'Consistency is power' : 'Solve a problem today'}
            </span>
          </div>
          <ChevronRight size={15} className={styles.highlightChevron} />
        </div>

        <div className={styles.highlightCardInteractive} onClick={() => onNavigateTab('ladder')}>
          <div className={styles.highlightIconCircle} style={{ background: '#e0e7ff', color: '#4f46e5' }}>
            <Lock size={17} />
          </div>
          <div className={styles.highlightInfoBlock}>
            <span className={styles.highlightCardTitle}>
              {unlocks?.hard_unlocked ? 'Hard-tier Unlocked' : unlocks?.medium_unlocked ? 'Medium-tier Unlocked' : 'Easy Tier Active'}
            </span>
            <span className={styles.highlightCardSub}>
              {unlocks?.hard_unlocked ? 'Elite NP-hard challenges' : unlocks?.medium_unlocked ? 'Tackle harder challenges' : '10 solves to Medium'}
            </span>
          </div>
          <ChevronRight size={15} className={styles.highlightChevron} />
        </div>

        <div className={styles.highlightCardInteractive} onClick={() => onNavigateTab('activity')}>
          <div className={styles.highlightIconCircle} style={{ background: '#ede9fe', color: '#7c3aed' }}>
            <Zap size={18} />
          </div>
          <div className={styles.highlightInfoBlock}>
            <span className={styles.highlightCardTitle}>
              {dbHighlights.find(h => h.toLowerCase().includes('fastest')) || dbHighlights[0] || 'Active Learner'}
            </span>
            <span className={styles.highlightCardSub}>Recorded on your profile</span>
          </div>
          <ChevronRight size={15} className={styles.highlightChevron} />
        </div>
      </div>

      {/* ══ 3. MIDDLE 2-COLUMN ROW ══ */}
      <div className={styles.middleGrid2}>
        
        {/* Left: Topic Proficiency Radar */}
        <div className={styles.radarCard}>
          <div className={styles.cardHeaderFlex}>
            <div className={styles.cardHeaderLeftWrap}>
              <div className={styles.cardPurpleIconBadge}>
                <Sparkles size={18} />
              </div>
              <div>
                <h3 className={styles.cardTitle}>Topic Proficiency Radar</h3>
                <p className={styles.cardSubtitle}>
                  Top skill areas synthesized across library and course problems
                </p>
              </div>
            </div>

            {/* Interactive Band Filter Dropdown */}
            <div style={{ position: 'relative' }}>
              <div
                className={styles.topicsDropdownPill}
                onClick={() => setFilterMenuOpen(!filterMenuOpen)}
                style={{ cursor: 'pointer' }}
              >
                <span>{selectedFilterBand}</span>
                <ChevronDown size={13} />
              </div>

              {filterMenuOpen && (
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '110%',
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                    zIndex: 25,
                    minWidth: '150px',
                    overflow: 'hidden',
                  }}
                >
                  {['All Topics', 'Mastered', 'Proficient', 'Needs Practice'].map((band) => (
                    <button
                      key={band}
                      type="button"
                      onClick={() => {
                        setSelectedFilterBand(band);
                        setFilterMenuOpen(false);
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 12px',
                        border: 'none',
                        background: selectedFilterBand === band ? '#f5f3ff' : 'transparent',
                        color: selectedFilterBand === band ? '#7c3aed' : '#334155',
                        fontWeight: selectedFilterBand === band ? 700 : 500,
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      {band}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={styles.radarBody}>
            <div className={styles.radarChartCol}>
              <TopicProficiencyRadarSVG
                topics={radarTopics}
                activeTopicIndex={activeTopicIdx}
                onHoverTopic={setActiveTopicIdx}
                onClickTopic={(topicName) => router.push(`/practice/library?topic=${encodeURIComponent(topicName)}`)}
              />
            </div>

            <div className={styles.radarLegendCol}>
              <h4 className={styles.legendHeading}>Top Topics</h4>
              {radarTopics.map((item, idx) => (
                <div
                  key={idx}
                  className={styles.legendItemRow}
                  style={{
                    cursor: 'pointer',
                    background: activeTopicIdx === idx ? '#f5f3ff' : 'transparent',
                    padding: '4px 6px',
                    borderRadius: '6px',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={() => setActiveTopicIdx(idx)}
                  onMouseLeave={() => setActiveTopicIdx(null)}
                  onClick={() => router.push(`/practice/library?topic=${encodeURIComponent(item.name)}`)}
                >
                  <div className={styles.legendTopicName}>
                    <span className={styles.topicColorDot} style={{ background: item.color }} />
                    <span style={{ fontWeight: activeTopicIdx === idx ? 700 : 500 }}>{item.name}</span>
                  </div>
                  <span className={styles.legendScoreVal}>{item.score}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.radarFooterRow}>
            <button className={styles.radarFooterLink} onClick={() => onNavigateTab('skills')}>
              Explore Complete Skills Map <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {/* Right: Personalized Next Steps */}
        <div className={styles.nextStepsCard}>
          <div className={styles.cardHeaderFlex}>
            <div className={styles.cardHeaderLeftWrap}>
              <div className={styles.cardPurpleIconBadge}>
                <Target size={18} />
              </div>
              <div>
                <h3 className={styles.cardTitle}>Personalized Next Steps</h3>
                <p className={styles.cardSubtitle}>
                  Targeted practice to reinforce weak concepts and unlock higher tiers
                </p>
              </div>
            </div>
          </div>

          <div className={styles.nextStepsList}>
            {displayRecs.length > 0 ? (
              displayRecs.map((rec) => {
                const isMed = (rec.difficulty || '').toLowerCase() === 'medium';
                const isHard = (rec.difficulty || '').toLowerCase() === 'hard';
                return (
                  <div key={rec.id} className={styles.problemStepItem}>
                    <div className={styles.problemStepLeft}>
                      <FileText size={16} className={styles.problemDocIcon} />
                      <span
                        className={styles.problemDiffBadge}
                        style={{
                          background: isHard ? '#fee2e2' : isMed ? '#fef3c7' : '#dcfce7',
                          color: isHard ? '#b91c1c' : isMed ? '#b45309' : '#15803d',
                        }}
                      >
                        {rec.difficulty || 'Easy'}
                      </span>
                      <div className={styles.problemTitleBlock}>
                        <span className={styles.problemName}>{rec.title}</span>
                        <span className={styles.problemSubtitle}>{rec.reason || rec.topic}</span>
                      </div>
                    </div>

                    <button
                      className={styles.solveNowBtn}
                      onClick={() => router.push(`/practice/library/${rec.slug || rec.id}`)}
                    >
                      Solve Now <ArrowRight size={13} />
                    </button>
                  </div>
                );
              })
            ) : (
              <div style={{ padding: '1.25rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                <p style={{ margin: '0 0 0.5rem' }}>No pending recommendations.</p>
                <button
                  className={styles.solveNowBtn}
                  style={{ margin: '0 auto' }}
                  onClick={() => router.push('/practice/library')}
                >
                  Explore Practice Library <ArrowRight size={13} />
                </button>
              </div>
            )}
          </div>

          {/* Gate Target Banner (Bound to Live DB Unlocks) */}
          <div className={styles.gateTargetBox}>
            <div className={styles.gateTargetTop}>
              <div className={styles.gateTargetLeft}>
                <div className={styles.gateLockIconBox}>
                  <Lock size={15} />
                </div>
                <div>
                  <h4 className={styles.gateTargetTitle}>Gate Target: {gateTitle}</h4>
                  <p className={styles.gateTargetDesc}>
                    {gateRequirement}
                  </p>
                </div>
              </div>
              <button className={styles.viewLadderBtn} onClick={() => onNavigateTab('ladder')}>
                View Ladder
              </button>
            </div>

            <div className={styles.gateProgressBar}>
              <div
                className={styles.gateProgressFill}
                style={{ width: `${Math.min(100, Math.max(5, gateProgressPct))}%` }}
              />
            </div>

            <div className={styles.gateProgressMeta}>
              <span>{gateCurrent}</span>
              <span>{gateProgressPct}%</span>
            </div>
          </div>

        </div>

      </div>

      {/* ══ 4. BOTTOM ENROLLED COURSES & CERTIFICATIONS (Live DB Courses) ══ */}
      <div className={styles.enrolledCoursesCard}>
        <div className={styles.coursesHeaderRow}>
          <div className={styles.coursesHeaderLeft}>
            <div className={styles.coursesGreenIconBadge}>
              <BookOpen size={18} />
            </div>
            <div>
              <h3 className={styles.cardTitle}>Enrolled Courses &amp; Certifications</h3>
              <p className={styles.cardSubtitle}>
                Continue learning with structured courses and earn certificates
              </p>
            </div>
          </div>

          <a className={styles.allCoursesLink} onClick={() => router.push('/practice')}>
            All Courses &amp; Certificates <ArrowRight size={14} />
          </a>
        </div>

        {enrolledCourses.length > 0 ? (
          <div className={styles.coursesGrid3}>
            {enrolledCourses.slice(0, 3).map((c) => {
              const pct = Math.round(c.completion_pct ?? 0);
              return (
                <div
                  key={c.id}
                  className={styles.courseItemCard}
                  onClick={() => router.push(`/practice/${c.slug || c.id}`)}
                >
                  <div className={styles.courseItemLeft}>
                    <div className={styles.courseLogoWrapper}>
                      <MiniCourseLogo slug={c.slug || c.title} />
                    </div>
                    <div className={styles.courseTextWrap}>
                      <h4 className={styles.courseTitleText}>{c.title}</h4>
                      <p className={styles.courseDescSnippet}>{c.description || 'Structured interactive curriculum'}</p>
                      <span className={styles.courseExsCount}>{c.solved_count ?? 0} / {c.exercise_count ?? 0} exercises</span>
                    </div>
                  </div>

                  <div className={styles.courseItemRight}>
                    <ProgressRing percent={pct} size={48} strokeWidth={4.5} />
                    <button
                      className={styles.courseContinueBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/practice/${c.slug || c.id}`);
                      }}
                    >
                      {pct > 0 ? 'Continue' : 'Start'} <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div
            style={{
              padding: '2rem',
              textAlign: 'center',
              background: '#f8fafc',
              borderRadius: '1rem',
              border: '1px dashed #cbd5e1',
            }}
          >
            <p style={{ margin: '0 0 1rem', color: '#64748b', fontSize: '0.9rem' }}>
              You haven&apos;t enrolled in any structured courses yet. Start your journey with hands-on practice.
            </p>
            <button
              onClick={() => router.push('/practice')}
              style={{
                padding: '0.6rem 1.25rem',
                borderRadius: '0.625rem',
                background: '#7c3aed',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.85rem',
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              Browse Course Catalog <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>

    </div>
  );
};

export default FreeOverviewTab;
