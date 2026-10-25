'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Target,
  Zap,
  Search,
  ChevronRight,
  ArrowRight,
  Code2,
  TrendingDown,
  AlertCircle,
} from 'lucide-react';
import type { PlatformTopicMasteryItem, PlatformRecommendation } from '@/services/platform-user.service';
import styles from './platform-analytics.module.css';

interface PlatformSkillsTabProps {
  topicStrength?: PlatformTopicMasteryItem[];
  recommendations?: PlatformRecommendation[];
}

export const PlatformSkillsTab: React.FC<PlatformSkillsTabProps> = ({
  topicStrength = [],
  recommendations = [],
}) => {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('All Levels');
  const [hoveredAxisIndex, setHoveredAxisIndex] = useState<number | null>(null);

  // Real Database Topics from topicStrength
  const displayTopics = useMemo(() => {
    if (!topicStrength || topicStrength.length === 0) {
      // Default placeholder set when user has 0 problem history
      const defaults = [
        'Algorithms', 'Arrays', 'Strings', 'Linked Lists', 'Trees',
        'Dynamic Programming', 'Hash Table', 'Stack & Queue', 'Graphs',
        'Backtracking', 'Bit Manipulation', 'Mathematics'
      ];
      return defaults.map((name) => ({
        name,
        category: 'Core Concepts',
        iconSymbol: name.slice(0, 2).toUpperCase(),
        iconBg: '#eff6ff',
        iconColor: '#2563eb',
        solvedCount: 0,
        attemptedCount: 0,
        accuracy: 0,
        mastery: 0,
        easyCount: 0,
        medCount: 0,
        hardCount: 0,
        band: 'Needs Practice' as const,
      }));
    }

    return topicStrength.map((t) => {
      return {
        name: t.topic,
        category: 'Algorithms & Data Structures',
        iconSymbol: t.topic.slice(0, 2).toUpperCase(),
        iconBg: t.strength >= 70 ? '#ecfdf5' : t.strength >= 50 ? '#fffbeb' : '#f5f3ff',
        iconColor: t.strength >= 70 ? '#059669' : t.strength >= 50 ? '#d97706' : '#7c3aed',
        solvedCount: t.total_solved ?? 0,
        attemptedCount: t.total_attempted ?? 0,
        accuracy: Math.round(t.accuracy_pct ?? 0),
        mastery: Math.round(t.strength ?? 0),
        easyCount: t.solved_by_difficulty?.Easy ?? 0,
        medCount: t.solved_by_difficulty?.Medium ?? 0,
        hardCount: t.solved_by_difficulty?.Hard ?? 0,
        band: t.band,
      };
    });
  }, [topicStrength]);

  // Filter topics based on search and level
  const filteredTopics = useMemo(() => {
    return displayTopics.filter((t) => {
      const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase());
      let matchesLevel = true;
      if (levelFilter === 'Mastered (70+)') matchesLevel = t.mastery >= 70;
      else if (levelFilter === 'Proficient (50-69)') matchesLevel = t.mastery >= 50 && t.mastery < 70;
      else if (levelFilter === 'Learning (35-49)') matchesLevel = t.mastery >= 35 && t.mastery < 50;
      else if (levelFilter === 'Needs Work (<35)') matchesLevel = t.mastery < 35;

      return matchesSearch && matchesLevel;
    });
  }, [displayTopics, search, levelFilter]);

  // Helper color for mastery bar fill
  const getMasteryColor = (score: number) => {
    if (score >= 70) return '#10b981'; // Green
    if (score >= 50) return '#f59e0b'; // Amber
    if (score >= 35) return '#f97316'; // Orange
    return '#ef4444'; // Red
  };

  // Real Database Weak Topics (lowest mastery from topicStrength)
  const weakTopics = useMemo(() => {
    const list = [...displayTopics]
      .filter((t) => t.attemptedCount > 0 || t.mastery > 0)
      .sort((a, b) => a.mastery - b.mastery);

    if (list.length === 0) {
      return displayTopics.slice(0, 5).map((t, idx) => ({
        rank: idx + 1,
        name: t.name,
        icon: t.iconSymbol,
        score: t.mastery,
        color: getMasteryColor(t.mastery),
      }));
    }

    return list.slice(0, 5).map((t, idx) => ({
      rank: idx + 1,
      name: t.name,
      icon: t.iconSymbol,
      score: t.mastery,
      color: getMasteryColor(t.mastery),
    }));
  }, [displayTopics]);

  // Real Radar Axes based on top 6 tracked topics
  const radarAxes = useMemo(() => {
    const top6 = displayTopics.slice(0, 6);
    const count = Math.max(3, top6.length);

    return top6.map((t, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
      return {
        label: t.name,
        score: t.mastery,
        angle,
        solved: t.solvedCount,
        accuracy: t.accuracy,
      };
    });
  }, [displayTopics]);

  const rcX = 150;
  const rcY = 140;
  const rMax = 82;

  // Compute points for user polygon
  const userPolygonPoints = radarAxes
    .map((axis) => {
      const r = Math.max(0.12, (axis.score / 100)) * rMax;
      const x = rcX + r * Math.cos(axis.angle);
      const y = rcY + r * Math.sin(axis.angle);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* ═════════════════════════════════════════════════════════════════════
          1. HERO HEADER: Target Icon + Title + Bullseye Vector Graphic
         ═════════════════════════════════════════════════════════════════════ */}
      <div className={styles.skillsHeroRow}>
        <div className={styles.skillsHeroLeft}>
          <div className={styles.skillsIconBox}>
            <Target size={24} />
          </div>
          <div>
            <h2 className={styles.cardTitle} style={{ fontSize: '1.25rem', color: '#0f172a' }}>
              Skills &amp; Topics
            </h2>
            <p className={styles.cardSubtitle} style={{ fontSize: '0.825rem', color: '#64748b' }}>
              Understand your strengths, find weak areas, and get personalized practice recommendations.
            </p>
          </div>
        </div>

        <div className={styles.skillsHeroRight}>
          <div className={styles.targetArtBox}>
            <svg width="68" height="68" viewBox="0 0 68 68" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="34" cy="34" r="30" fill="#ede9fe" stroke="#ddd6fe" strokeWidth="1.5" />
              <circle cx="34" cy="34" r="21" fill="#c4b5fd" opacity="0.6" />
              <circle cx="34" cy="34" r="13" fill="#8b5cf6" />
              <circle cx="34" cy="34" r="6" fill="#6d28d9" />
              <line x1="58" y1="10" x2="36" y2="32" stroke="#7c3aed" strokeWidth="3" strokeLinecap="round" />
              <path d="M54 6L60 12M58 4L62 8" stroke="#a855f7" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <div className={styles.targetBadgeColumn}>
              <span className={styles.targetBadgeWord}>Practice</span>
              <span className={styles.targetBadgeWord}>Master</span>
              <span className={styles.targetBadgeWord}>Grow</span>
            </div>
          </div>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════
          2. TOP CARD: Skill Reinforcement Targets (Real DB Recommendations)
         ═════════════════════════════════════════════════════════════════════ */}
      <div className={styles.reinforceCard}>
        <div className={styles.reinforceHeaderFlex}>
          <div className={styles.cardTitleWrap}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '8px',
                background: '#ede9fe',
                color: '#7c3aed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Zap size={16} />
            </div>
            <div>
              <h3 className={styles.cardTitle} style={{ fontSize: '1.02rem' }}>
                Skill Reinforcement Targets
              </h3>
              <p className={styles.cardSubtitle} style={{ fontSize: '0.775rem' }}>
                Curated problems based on your accuracy and weakest topics
              </p>
            </div>
          </div>

          <button
            type="button"
            className={styles.viewAllBadgesLink}
            onClick={() => router.push('/practice/library')}
            style={{ border: 'none', background: 'transparent' }}
          >
            <span>View All</span>
            <span style={{ fontSize: '13px' }}>→</span>
          </button>
        </div>

        {recommendations.length > 0 ? (
          <div className={styles.reinforceGrid}>
            {recommendations.slice(0, 4).map((prob) => {
              const isMed = (prob.difficulty || '').toLowerCase() === 'medium';
              const isHard = (prob.difficulty || '').toLowerCase() === 'hard';
              const badgeClass = isHard
                ? styles.reinforceBadgeHard || styles.reinforceBadgeMed
                : isMed
                ? styles.reinforceBadgeMed
                : styles.reinforceBadgeEasy;

              const acc = prob.acceptance != null ? Math.round(prob.acceptance * 100) : null;

              return (
                <div
                  key={prob.id}
                  className={styles.reinforceItem}
                  onClick={() => router.push(`/practice/library/${prob.slug || prob.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className={styles.reinforceItemTop}>
                    <div className={styles.reinforceIconTitle}>
                      <div className={styles.reinforceIcon}>
                        <Code2 size={16} />
                      </div>
                      <div>
                        <h4 className={styles.reinforceTitle}>{prob.title}</h4>
                        <p className={styles.reinforceSub}>{prob.reason || prob.topic}</p>
                      </div>
                    </div>
                    <span className={badgeClass}>{prob.difficulty}</span>
                  </div>

                  <div className={styles.reinforceBottom} style={{ marginTop: '12px' }}>
                    <div className={styles.reinforceMeta}>
                      <span>{prob.topic}</span>
                      <span>·</span>
                      <span>{acc != null ? `${acc}%` : '—'} acceptance</span>
                    </div>

                    <button
                      type="button"
                      className={styles.reinforceSolveBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/practice/library?problem=${prob.slug || prob.id}`);
                      }}
                    >
                      <span>Solve</span>
                      <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
            <p style={{ margin: '0 0 0.5rem' }}>Solve problems in the practice library to generate personalized targets.</p>
            <button
              className={styles.solveNowBtn}
              style={{ margin: '0 auto' }}
              onClick={() => router.push('/practice/library')}
            >
              Browse Library Problems <ArrowRight size={13} />
            </button>
          </div>
        )}
      </div>

      {/* ═════════════════════════════════════════════════════════════════════
          3. MAIN SECTION: All Topics Matrix + Right Sidebar
         ═════════════════════════════════════════════════════════════════════ */}
      <div className={styles.skillsMainGrid}>
        {/* Left: Search, Filters & Topic Cards */}
        <div className={styles.skillsLeftCol}>
          <div className={styles.skillsSearchRow}>
            <div className={styles.skillsSearchInputWrap}>
              <Search size={15} color="#94a3b8" />
              <input
                type="text"
                placeholder="Search topics (e.g., Arrays, Dynamic Programming)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={styles.skillsSearchInput}
              />
            </div>

            <div className={styles.skillsFiltersFlex}>
              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                className={styles.matrixSelect}
              >
                <option value="All Levels">All Levels</option>
                <option value="Mastered (70+)">Mastered (70+)</option>
                <option value="Proficient (50-69)">Proficient (50-69)</option>
                <option value="Learning (35-49)">Learning (35-49)</option>
                <option value="Needs Work (<35)">Needs Work (&lt;35)</option>
              </select>
            </div>
          </div>

          <div className={styles.topicsGrid2}>
            {filteredTopics.map((topic) => {
              const barColor = getMasteryColor(topic.mastery);

              return (
                <div
                  key={topic.name}
                  className={styles.topicCardItem}
                  onClick={() => router.push(`/practice/library?topic=${encodeURIComponent(topic.name)}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className={styles.topicCardTop}>
                    <div className={styles.topicIconTitleWrap}>
                      <div
                        className={styles.topicIconSymbol}
                        style={{ background: topic.iconBg, color: topic.iconColor }}
                      >
                        {topic.iconSymbol}
                      </div>
                      <div>
                        <h4 className={styles.topicCardName}>{topic.name}</h4>
                        <span className={styles.topicCardCategory}>{topic.band}</span>
                      </div>
                    </div>

                    <div className={styles.topicSolvedScoreBadge}>
                      <span className={styles.topicScoreNumber} style={{ color: barColor }}>
                        {topic.mastery}%
                      </span>
                    </div>
                  </div>

                  <div className={styles.topicMasteryTrack}>
                    <div
                      className={styles.topicMasteryFill}
                      style={{ width: `${Math.min(100, Math.max(3, topic.mastery))}%`, background: barColor }}
                    />
                  </div>

                  <div className={styles.topicCardMetaRow}>
                    <div className={styles.topicMetaItem}>
                      <span>Solved: <strong>{topic.solvedCount}</strong></span>
                      <span style={{ margin: '0 4px', color: '#cbd5e1' }}>/</span>
                      <span>Attempted: <strong>{topic.attemptedCount}</strong></span>
                    </div>
                    <div className={styles.topicMetaItem}>
                      <span>Accuracy: <strong>{topic.accuracy}%</strong></span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Sidebar: Interactive Radar Map + Weak Topics */}
        <div className={styles.skillsRightCol}>
          {/* Radar Chart Card */}
          <div className={styles.radarCard}>
            <div className={styles.cardHeaderFlex}>
              <div className={styles.cardHeaderLeftWrap}>
                <div className={styles.cardPurpleIconBadge}>
                  <Target size={16} />
                </div>
                <div>
                  <h3 className={styles.cardTitle} style={{ fontSize: '0.98rem' }}>Skill Proficiency Radar</h3>
                  <p className={styles.cardSubtitle} style={{ fontSize: '0.725rem' }}>Top skill mastery</p>
                </div>
              </div>
            </div>

            <div style={{ position: 'relative', width: 300, height: 260, margin: '0 auto' }}>
              <svg width="300" height="260" viewBox="0 0 300 260" fill="none">
                <defs>
                  <linearGradient id="skillsRadarFill" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#a855f7" stopOpacity="0.1" />
                  </linearGradient>
                </defs>

                {/* Concentric Hexagons */}
                {[0.25, 0.5, 0.75, 1.0].map((frac, idx) => {
                  const points = radarAxes
                    .map((axis) => {
                      const x = rcX + rMax * frac * Math.cos(axis.angle);
                      const y = rcY + rMax * frac * Math.sin(axis.angle);
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    })
                    .join(' ');
                  return <polygon key={idx} points={points} fill="none" stroke="#e2e8f0" strokeWidth="1" />;
                })}

                {/* Spokes */}
                {radarAxes.map((axis, i) => {
                  const x = rcX + rMax * Math.cos(axis.angle);
                  const y = rcY + rMax * Math.sin(axis.angle);
                  return (
                    <line
                      key={i}
                      x1={rcX}
                      y1={rcY}
                      x2={x}
                      y2={y}
                      stroke={hoveredAxisIndex === i ? '#7c3aed' : '#e2e8f0'}
                      strokeWidth={hoveredAxisIndex === i ? 2 : 1}
                      strokeDasharray="2 2"
                    />
                  );
                })}

                {/* User Data Polygon */}
                <polygon
                  points={userPolygonPoints}
                  fill="url(#skillsRadarFill)"
                  stroke="#7c3aed"
                  strokeWidth="2.2"
                />

                {/* Vertices & Labels */}
                {radarAxes.map((axis, i) => {
                  const r = Math.max(0.12, (axis.score / 100)) * rMax;
                  const px = rcX + r * Math.cos(axis.angle);
                  const py = rcY + r * Math.sin(axis.angle);
                  const lx = rcX + (rMax + 20) * Math.cos(axis.angle);
                  const ly = rcY + (rMax + 20) * Math.sin(axis.angle);
                  const isHovered = hoveredAxisIndex === i;

                  return (
                    <g
                      key={i}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredAxisIndex(i)}
                      onMouseLeave={() => setHoveredAxisIndex(null)}
                      onClick={() => router.push(`/practice/library?topic=${encodeURIComponent(axis.label)}`)}
                    >
                      <circle
                        cx={px}
                        cy={py}
                        r={isHovered ? 6 : 4}
                        fill={isHovered ? '#6d28d9' : '#7c3aed'}
                        stroke="#ffffff"
                        strokeWidth="2"
                      />
                      <text
                        x={lx}
                        y={ly}
                        textAnchor="middle"
                        fontSize="9"
                        fontWeight={isHovered ? 800 : 600}
                        fill={isHovered ? '#7c3aed' : '#64748b'}
                        fontFamily="'Space Grotesk', sans-serif"
                      >
                        {axis.label} ({axis.score}%)
                      </text>
                    </g>
                  );
                })}
              </svg>

              {hoveredAxisIndex !== null && radarAxes[hoveredAxisIndex] && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '4px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(15, 23, 42, 0.95)',
                    color: '#fff',
                    padding: '5px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontFamily: "'Space Grotesk', sans-serif",
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                    zIndex: 10,
                  }}
                >
                  <strong>{radarAxes[hoveredAxisIndex].label}</strong>: {radarAxes[hoveredAxisIndex].score}% mastery
                  {radarAxes[hoveredAxisIndex].solved !== undefined && (
                    <span> · {radarAxes[hoveredAxisIndex].solved} solved</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Weak Topics Card */}
          <div className={styles.recordsCard}>
            <div className={styles.cardHeader} style={{ marginBottom: '8px' }}>
              <div className={styles.cardTitleWrap}>
                <TrendingDown size={16} color="#ef4444" />
                <h3 className={styles.cardTitle} style={{ fontSize: '0.98rem' }}>Focus Areas (Weak Topics)</h3>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {weakTopics.map((item) => (
                <div
                  key={item.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    cursor: 'pointer',
                  }}
                  onClick={() => router.push(`/practice/library?topic=${encodeURIComponent(item.name)}`)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8' }}>#{item.rank}</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b' }}>{item.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: item.color }}>{item.score}%</span>
                    <ChevronRight size={13} color="#94a3b8" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlatformSkillsTab;
