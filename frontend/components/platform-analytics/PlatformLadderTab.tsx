'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Trophy,
  Flame,
  Award,
  Zap,
  Globe,
  Share2,
  Crown,
  BarChart3,
  CheckCircle2,
  Target,
  Lock,
  PieChart,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { platformUserService } from '@/services/platform-user.service';
import type {
  PlatformStanding,
  PlatformDifficultyMix,
  PlatformUnlocksData,
} from '@/services/platform-user.service';
import styles from './platform-analytics.module.css';

interface PlatformLadderTabProps {
  standing: PlatformStanding;
  difficultyMix?: PlatformDifficultyMix;
  unlocks?: PlatformUnlocksData;
  onOpenShare?: () => void;
}

const TOPICS_LIST = [
  'Array',
  'String',
  'Hash Table',
  'Two Pointers',
  'Linked List',
  'Tree',
  'Graph',
  'Dynamic Programming',
  'Binary Search',
  'Stack',
];

export const PlatformLadderTab: React.FC<PlatformLadderTabProps> = ({
  standing,
  difficultyMix,
  unlocks,
  onOpenShare,
}) => {
  const router = useRouter();
  const [scope, setScope] = useState<'global' | 'topic'>('global');
  const [topic, setTopic] = useState('Array');
  const [period, setPeriod] = useState<'monthly' | 'weekly' | 'all_time'>('all_time');
  const [timeframe, setTimeframe] = useState('All Time');

  // Query real leaderboard from platform API
  const { data: boardData, isLoading: boardLoading } = useQuery({
    queryKey: ['free-leaderboard', scope, topic, period],
    queryFn: () =>
      platformUserService.getPlatformLeaderboard({
        scope,
        scope_id: scope === 'topic' ? topic : undefined,
        period,
        limit: 25,
      }),
    staleTime: 60 * 1000,
  });

  // Dynamic user statistics from real database data (nullish coalescing)
  const totalSolved = standing?.problems_solved ?? difficultyMix?.total_solved ?? 0;
  const rating = Math.round(standing?.rating ?? 0);
  const isRanked = totalSolved > 0 && rating > 0 && standing?.global_rank != null;
  const rankMovement = standing?.rank_movement ?? 0;
  const percentile = (isRanked && standing?.global_percentile != null)
    ? Math.max(1, 100 - Math.round(standing.global_percentile))
    : null;
  const level = standing?.level ?? 1;
  const levelName = standing?.level_name ?? 'Newcomer';
  const currentXp = standing?.total_xp ?? 0;
  const nextXp = standing?.next_level_xp ?? 100;
  const levelPct = nextXp > 0 ? Math.min(100, Math.max(0, Math.round((currentXp / nextXp) * 100))) : 0;
  const xpRemaining = Math.max(0, nextXp - currentXp);
  const streak = standing?.streak_days ?? 0;
  const easySolved = standing?.easy_solved ?? difficultyMix?.easy ?? 0;
  const mediumSolved = standing?.medium_solved ?? difficultyMix?.medium ?? 0;
  const hardSolved = standing?.hard_solved ?? difficultyMix?.hard ?? 0;
  const accuracy = (standing as any)?.accuracy ?? difficultyMix?.acceptance_rate ?? 0;

  // Donut chart stroke calculations with real data
  const radius = 38;
  const circumference = 2 * Math.PI * radius; // ~238.76
  const easyRatio = totalSolved > 0 ? easySolved / totalSolved : 0;
  const medRatio = totalSolved > 0 ? mediumSolved / totalSolved : 0;
  const hardRatio = totalSolved > 0 ? hardSolved / totalSolved : 0;

  const easyStroke = easyRatio * circumference;
  const medStroke = medRatio * circumference;
  const hardStroke = hardRatio * circumference;

  const easyOffset = 0;
  const medOffset = -easyStroke;
  const hardOffset = -(easyStroke + medStroke);

  const easyPct = totalSolved > 0 ? (easyRatio * 100).toFixed(1) : '0';
  const medPct = totalSolved > 0 ? (medRatio * 100).toFixed(1) : '0';
  const hardPct = totalSolved > 0 ? (hardRatio * 100).toFixed(1) : '0';

  // SVG Level Ring calculation
  const ringRadius = 26;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringStroke = (levelPct / 100) * ringCircumference;

  // Real Database Badges Catalog reference
  const earnedBadges = standing?.badges ?? [];
  const catalogBadges = [
    { badge_id: 'first_solve', title: 'First Steps', sub: 'First solve', icon: '⭐' },
    { badge_id: 'speed_demon', title: 'Speed Demon', sub: 'Solve in < 5 min', icon: '⚡' },
    { badge_id: 'beginner_path', title: 'Beginner Badge', sub: 'Path completed', icon: '🎯' },
    { badge_id: 'streak_master', title: 'Streak Master', sub: '7-day streak', icon: '🔥' },
    { badge_id: '100_solves', title: '100 Solves', sub: 'Century milestone', icon: '🏆' },
    { badge_id: 'hard_hitter', title: 'Hard Hitter', sub: 'Solve 20 Hard', icon: '💎' },
  ];


  // Leaderboard data from real database
  const apiBoard = boardData?.leaderboard ?? [];
  const cohortSize = boardData?.cohort_size ?? 0;

  // Unlocks calculations from real DB props
  const medUnlocked = Boolean(unlocks?.medium_unlocked);
  const hardUnlocked = Boolean(unlocks?.hard_unlocked);
  const contestsUnlocked = Boolean(unlocks?.contests_unlocked);

  const medProgressPct = Math.min(100, Math.round((Math.min(10, easySolved) / 10) * 100));
  const hardProgressPct = Math.min(100, Math.round((Math.min(20, mediumSolved) / 20) * 100));
  const contestProgressPct = contestsUnlocked ? 100 : Math.min(100, Math.round((rating / 1200) * 100));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', paddingBottom: '36px' }}>
      {/* ═════════════════════════════════════════════════════════════════════
          1. HERO HEADER: Trophy + Title + Mountain Vector + Share Profile
         ═════════════════════════════════════════════════════════════════════ */}
      <div className={styles.ladderHeroRow}>
        <div className={styles.ladderHeroLeft}>
          <div className={styles.ladderTrophyIconBox}>
            <Trophy size={24} />
          </div>
          <div>
            <h2 className={styles.cardTitle} style={{ fontSize: '1.25rem', color: '#0f172a' }}>
              Platform Ladder & Ranks
            </h2>
            <p className={styles.cardSubtitle} style={{ fontSize: '0.825rem', color: '#64748b' }}>
              See your competitive standing, level progression, unlocks and how you compare with other NexLab coders worldwide.
            </p>
          </div>
        </div>

        <div className={styles.ladderHeroRight}>
          {/* Mountain Summit Vector with Pink Flag */}
          <div className={styles.mountainArtBox} title="NexLab Summit">
            <svg width="140" height="56" viewBox="0 0 140 56" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M10 56L50 20L75 42L105 10L135 56H10Z"
                fill="url(#mountainGrad1)"
                opacity="0.45"
              />
              <path
                d="M32 56L68 28L88 44L112 18L138 56H32Z"
                fill="url(#mountainGrad2)"
                opacity="0.85"
              />
              <line x1="105" y1="10" x2="105" y2="2" stroke="#d97706" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M105 2L120 6L105 10Z" fill="#ec4899" />
              <defs>
                <linearGradient id="mountainGrad1" x1="72" y1="10" x2="72" y2="56" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#c4b5fd" />
                  <stop offset="1" stopColor="#ede9fe" stopOpacity="0.2" />
                </linearGradient>
                <linearGradient id="mountainGrad2" x1="85" y1="18" x2="85" y2="56" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#8b5cf6" />
                  <stop offset="1" stopColor="#c4b5fd" stopOpacity="0.4" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* Share Profile Button */}
          <button
            type="button"
            className={styles.ladderShareBtn}
            onClick={(e) => {
              e.stopPropagation();
              onOpenShare?.();
            }}
            aria-label="Share public competitive profile"
          >
            <Share2 size={15} />
            <span>Share Profile</span>
          </button>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════
          2. TOP 3 METRICS CARDS: Global Standing, Level Progression, Key Stats
         ═════════════════════════════════════════════════════════════════════ */}
      <div className={styles.ladderTopGrid3}>
        {/* ── Metric Card 1: Global Standing ── */}
        <div className={styles.ladderMetricCard}>
          <div className={styles.ladderCardHeader}>
            <div className={styles.ladderCardTitleWrap}>
              <Globe size={16} color="#3b82f6" />
              <h3 className={styles.ladderCardTitle}>Global Standing</h3>
            </div>
            <button
              type="button"
              className={styles.jumpStandingsBtn}
              onClick={(e) => {
                e.stopPropagation();
                document.getElementById('platform-standings-section')?.scrollIntoView({ behavior: 'smooth' });
              }}
              title="Jump down to Worldwide Platform Standings"
            >
              <span>View Standings ↓</span>
            </button>
          </div>

          <div className={styles.ladderCardBodyFlex}>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <span className={styles.ladderScoreBig}>{isRanked ? rating.toLocaleString() : 'Unranked'}</span>
                {isRanked && (
                  <span className={styles.ladderTrendChip}>
                    {rankMovement > 0 ? `▲ +${rankMovement} this week` : rankMovement < 0 ? `▼ ${rankMovement}` : 'Stable this week'}
                  </span>
                )}
              </div>
              <div className={styles.ladderSubHead}>
                {isRanked && percentile ? `Top ${percentile}% worldwide` : 'Unranked · Solve 1 problem to rank'}
              </div>
              <div className={styles.ladderFootnote}>
                {cohortSize > 0 ? `Out of ${cohortSize.toLocaleString()} active platform coders` : 'Across all NexLab coders'}
              </div>
            </div>

            <div className={styles.rankShieldWrapper}>
              <svg width="68" height="68" viewBox="0 0 68 68" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M34 6L54 13V33C54 45.5 45.5 56.5 34 60C22.5 56.5 14 45.5 14 33V13L34 6Z"
                  fill="url(#shieldGrad)"
                />
                <path
                  d="M26 36L24 25L30 29L34 23L38 29L44 25L42 36H26Z"
                  fill="#ffffff"
                  stroke="#fbbf24"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                />
                <circle cx="24" cy="24" r="1.5" fill="#fde68a" />
                <circle cx="34" cy="22" r="1.5" fill="#fde68a" />
                <circle cx="44" cy="24" r="1.5" fill="#fde68a" />
                <path
                  d="M20 28C19 32 20 37 23 41M48 28C49 32 48 37 45 41"
                  stroke="#e9d5ff"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient id="shieldGrad" x1="34" y1="6" x2="34" y2="60" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#8b5cf6" />
                    <stop offset="1" stopColor="#6d28d9" />
                  </linearGradient>
                </defs>
              </svg>
              <div className={styles.rankRibbonBadge}>
                {standing?.global_rank ? `Rank #${standing.global_rank}` : 'Unranked'}
              </div>
            </div>
          </div>
        </div>

        {/* ── Metric Card 2: Level Progression ── */}
        <div className={styles.ladderMetricCard}>
          <div className={styles.ladderCardHeader}>
            <div className={styles.ladderCardTitleWrap}>
              <Crown size={16} color="#f59e0b" />
              <h3 className={styles.ladderCardTitle}>Level Progression</h3>
            </div>
            <button
              type="button"
              className={styles.practiceXpLink}
              onClick={(e) => {
                e.stopPropagation();
                router.push('/practice/library');
              }}
              title="Practice problems in the library to earn XP"
            >
              Practice for XP →
            </button>
          </div>

          <div className={styles.levelProgFlex}>
            <div className={styles.levelRingWrap}>
              <svg width="68" height="68" viewBox="0 0 68 68">
                <circle
                  cx="34"
                  cy="34"
                  r={ringRadius}
                  stroke="#f1f5f9"
                  strokeWidth="6"
                  fill="none"
                />
                <circle
                  cx="34"
                  cy="34"
                  r={ringRadius}
                  stroke="url(#ringGrad)"
                  strokeWidth="6"
                  strokeDasharray={`${ringCircumference} ${ringCircumference}`}
                  strokeDashoffset={ringCircumference - ringStroke}
                  strokeLinecap="round"
                  fill="none"
                  transform="rotate(-90 34 34)"
                />
                <defs>
                  <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#7c3aed" />
                    <stop offset="1" stopColor="#a855f7" />
                  </linearGradient>
                </defs>
              </svg>
              <div className={styles.levelRingTextCenter}>
                <span className={styles.levelRingLv}>Lv {level}</span>
                <span className={styles.levelRingPct}>{levelPct}%</span>
              </div>
            </div>

            <div className={styles.levelProgRight}>
              <div className={styles.levelTitle}>Level {level} · {levelName}</div>
              <div className={styles.levelSub}>
                {currentXp.toLocaleString()} / {nextXp.toLocaleString()} XP
              </div>
              <div className={styles.levelTrack}>
                <div
                  className={styles.levelFill}
                  style={{ width: `${levelPct}%` }}
                />
              </div>
              <div className={styles.levelFooter}>
                {xpRemaining > 0 ? `${xpRemaining.toLocaleString()} XP to Level ${level + 1}` : 'Maximum level achieved'}
              </div>
            </div>
          </div>
        </div>

        {/* ── Metric Card 3: Key Stats ── */}
        <div className={styles.ladderMetricCard}>
          <div className={styles.ladderCardHeader}>
            <div className={styles.ladderCardTitleWrap}>
              <BarChart3 size={16} color="#3b82f6" />
              <h3 className={styles.ladderCardTitle}>Key Stats</h3>
            </div>
            <button
              type="button"
              className={styles.ladderDropdownBtn}
              onClick={() => setTimeframe(timeframe === 'Last 90 days' ? 'All Time' : 'Last 90 days')}
            >
              <span>{timeframe}</span>
              <ChevronDown size={12} />
            </button>
          </div>

          <div className={styles.keyStatsRow}>
            {/* 1. Streak */}
            <div className={styles.keyStatItem}>
              <div className={styles.keyStatIconBox} style={{ background: '#ffedd5', color: '#f97316' }}>
                <Flame size={16} />
              </div>
              <div className={styles.keyStatValWrap}>
                <span className={styles.keyStatVal}>{streak}</span>
                <span className={styles.keyStatLbl}>Day Streak</span>
              </div>
            </div>

            {/* 2. Solved */}
            <div className={styles.keyStatItem}>
              <div className={styles.keyStatIconBox} style={{ background: '#dcfce7', color: '#10b981' }}>
                <CheckCircle2 size={16} />
              </div>
              <div className={styles.keyStatValWrap}>
                <span className={styles.keyStatVal}>{totalSolved}</span>
                <span className={styles.keyStatLbl}>Problems Solved</span>
              </div>
            </div>

            {/* 3. Accuracy */}
            <div className={styles.keyStatItem}>
              <div className={styles.keyStatIconBox} style={{ background: '#fee2e2', color: '#ef4444' }}>
                <Target size={16} />
              </div>
              <div className={styles.keyStatValWrap}>
                <span className={styles.keyStatVal}>{Number(accuracy).toFixed(1)}%</span>
                <span className={styles.keyStatLbl}>Accuracy</span>
              </div>
            </div>
          </div>

          <div className={styles.diffPillsRow}>
            <div className={styles.diffPill} style={{ color: '#15803d' }}>
              <span className={styles.diffTag} style={{ background: '#dcfce7', color: '#15803d' }}>
                E
              </span>
              <span>{easySolved}</span>
            </div>
            <div className={styles.diffPill} style={{ color: '#b45309' }}>
              <span className={styles.diffTag} style={{ background: '#fef3c7', color: '#b45309' }}>
                M
              </span>
              <span>{mediumSolved}</span>
            </div>
            <div className={styles.diffPill} style={{ color: '#b91c1c' }}>
              <span className={styles.diffTag} style={{ background: '#fee2e2', color: '#b91c1c' }}>
                H
              </span>
              <span>{hardSolved}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════
          3. MIDDLE ROW: Badges & Achievements + Interactive Donut
         ═════════════════════════════════════════════════════════════════════ */}
      <div className={styles.ladderMiddleGrid2}>
        {/* ── Badges & Achievements Shelf (Bound to Live DB Badges) ── */}
        <div className={styles.badgesCard}>
          <div className={styles.cardHeader} style={{ marginBottom: 0 }}>
            <div className={styles.cardTitleWrap}>
              <Award size={18} color="#f59e0b" />
              <h3 className={styles.cardTitle}>Badges & Achievements ({earnedBadges.length})</h3>
            </div>
            <button
              type="button"
              className={styles.viewAllBadgesLink}
              onClick={() => router.push('/practice/profile')}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
              title="View all achievements in your profile"
            >
              <span>View All</span>
              <span style={{ fontSize: '13px' }}>→</span>
            </button>
          </div>

          <div className={styles.badgesRowFlex}>
            {catalogBadges.map((badge) => {
              const earned = earnedBadges.find((b) => b.badge_id === badge.badge_id || b.title === badge.title);
              const isLocked = !earned;
              const badgeIcon = (earned?.icon === '🌱' || badge.icon === '🌱') ? '⭐' : (earned?.icon || badge.icon);

              return (
                <div
                  key={badge.badge_id}
                  className={styles.badgeHexCol}
                  style={{ opacity: isLocked ? 0.6 : 1 }}
                  title={earned ? `${badge.title}: Earned! (${badge.sub})` : `${badge.title}: Locked - ${badge.sub}`}
                >
                  <div className={styles.badgeHexBox} style={{ position: 'relative' }}>
                    <svg width="46" height="52" viewBox="0 0 46 52">
                      <polygon
                        points="23,2 44,14 44,38 23,50 2,38 2,14"
                        fill={isLocked ? '#f1f5f9' : 'url(#bGradReal)'}
                        stroke={isLocked ? '#cbd5e1' : '#a855f7'}
                        strokeWidth="1.5"
                      />
                      <defs>
                        <linearGradient id="bGradReal" x1="23" y1="2" x2="23" y2="50" gradientUnits="userSpaceOnUse">
                          <stop stopColor="#8b5cf6" />
                          <stop offset="1" stopColor="#6d28d9" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '18px',
                        pointerEvents: 'none',
                      }}
                    >
                      {isLocked ? <Lock size={15} color="#94a3b8" /> : badgeIcon}
                    </div>
                  </div>
                  <div className={styles.badgeTitle}>{badge.title}</div>
                  <div className={styles.badgeSub}>{isLocked ? badge.sub : '✓ Earned'}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Interactive Difficulty Distribution Donut + Bars ── */}
        <div className={styles.diffCard}>
          <div className={styles.cardHeader} style={{ marginBottom: 0 }}>
            <div className={styles.cardTitleWrap}>
              <PieChart size={18} color="#7c3aed" />
              <h3 className={styles.cardTitle}>Difficulty Distribution</h3>
            </div>
            <div className={styles.donutHeaderLegend}>
              <span className={styles.legendDotEasy}>● Easy {easySolved}</span>
              <span className={styles.legendDotMed}>● Med {mediumSolved}</span>
              <span className={styles.legendDotHard}>● Hard {hardSolved}</span>
            </div>
          </div>

          <div className={styles.diffBodyFlex}>
            {/* SVG Donut */}
            <div className={styles.donutWrap}>
              <svg width="108" height="108" viewBox="0 0 100 100" style={{ overflow: 'visible' }}>
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  stroke="#f1f5f9"
                  strokeWidth="11"
                  fill="none"
                />

                {totalSolved > 0 ? (
                  <>
                    {/* Easy Arc */}
                    {easyStroke > 0 && (
                      <circle
                        cx="50"
                        cy="50"
                        r={radius}
                        stroke="#10b981"
                        strokeWidth={11}
                        strokeDasharray={`${easyStroke} ${circumference}`}
                        strokeDashoffset={easyOffset}
                        fill="none"
                        transform="rotate(-90 50 50)"
                        className={styles.donutArcEasy}
                      />
                    )}
                    {/* Medium Arc */}
                    {medStroke > 0 && (
                      <circle
                        cx="50"
                        cy="50"
                        r={radius}
                        stroke="#f59e0b"
                        strokeWidth={11}
                        strokeDasharray={`${medStroke} ${circumference}`}
                        strokeDashoffset={medOffset}
                        fill="none"
                        transform="rotate(-90 50 50)"
                        className={styles.donutArcMed}
                      />
                    )}
                    {/* Hard Arc */}
                    {hardStroke > 0 && (
                      <circle
                        cx="50"
                        cy="50"
                        r={radius}
                        stroke="#ef4444"
                        strokeWidth={11}
                        strokeDasharray={`${hardStroke} ${circumference}`}
                        strokeDashoffset={hardOffset}
                        fill="none"
                        transform="rotate(-90 50 50)"
                        className={styles.donutArcHard}
                      />
                    )}
                  </>
                ) : (
                  <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    stroke="#e2e8f0"
                    strokeWidth="11"
                    strokeDasharray="4 4"
                    fill="none"
                  />
                )}

                <text
                  x="50"
                  y="47"
                  textAnchor="middle"
                  fontSize="19"
                  fontWeight="900"
                  fill="#0f172a"
                  fontFamily="'Space Grotesk', sans-serif"
                >
                  {totalSolved}
                </text>
                <text
                  x="50"
                  y="62"
                  textAnchor="middle"
                  fontSize="8.5"
                  fontWeight="600"
                  fill="#64748b"
                >
                  Total Solved
                </text>
              </svg>
            </div>

            {/* Horizontal progress bars */}
            <div className={styles.diffBarsCol}>
              {/* Easy */}
              <div className={styles.diffBarRow}>
                <div className={styles.diffBarLabel}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
                  <span>Easy</span>
                </div>
                <div className={styles.diffBarCount}>{easySolved}</div>
                <div className={styles.diffBarTrack}>
                  <div
                    className={styles.diffBarFill}
                    style={{ width: `${easyPct}%`, background: '#10b981' }}
                  />
                </div>
                <div className={styles.diffBarPct}>{easyPct}%</div>
              </div>

              {/* Medium */}
              <div className={styles.diffBarRow}>
                <div className={styles.diffBarLabel}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
                  <span>Medium</span>
                </div>
                <div className={styles.diffBarCount}>{mediumSolved}</div>
                <div className={styles.diffBarTrack}>
                  <div
                    className={styles.diffBarFill}
                    style={{ width: `${medPct}%`, background: '#f59e0b' }}
                  />
                </div>
                <div className={styles.diffBarPct}>{medPct}%</div>
              </div>

              {/* Hard */}
              <div className={styles.diffBarRow}>
                <div className={styles.diffBarLabel}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
                  <span>Hard</span>
                </div>
                <div className={styles.diffBarCount}>{hardSolved}</div>
                <div className={styles.diffBarTrack}>
                  <div
                    className={styles.diffBarFill}
                    style={{ width: `${hardPct}%`, background: '#ef4444' }}
                  />
                </div>
                <div className={styles.diffBarPct}>{hardPct}%</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════
          4. TIERED CONTENT PROGRESSION (Bound to Real DB Unlocks)
         ═════════════════════════════════════════════════════════════════════ */}
      <div className={styles.tierProgressionCard}>
        <div className={styles.tierHeaderFlex}>
          <div className={styles.cardTitleWrap}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: '#dcfce7',
                color: '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Zap size={15} />
            </div>
            <div>
              <h3 className={styles.cardTitle} style={{ fontSize: '1rem' }}>
                Tiered Content Progression
              </h3>
              <p className={styles.cardSubtitle} style={{ fontSize: '0.775rem' }}>
                Unlock higher tiers by solving problems and improving your platform rating.
              </p>
            </div>
          </div>

          <div className={styles.nextTierAlertPill}>
            <Lock size={12} />
            <span>
              {hardUnlocked
                ? 'All Core Problem Tiers Unlocked'
                : `Next: Hard Difficulty (${hardProgressPct}% unlocked)`}
            </span>
            <ChevronRight size={13} />
          </div>
        </div>

        <div className={styles.tierGrid4}>
          {/* Tier 1: Easy */}
          <div className={styles.tierItemCard}>
            <div className={styles.tierItemTop}>
              <div className={styles.tierName}>
                <CheckCircle2 size={15} color="#10b981" />
                <span>Easy Tier</span>
              </div>
              <span className={styles.tierBadgeUnlocked}>✓ Unlocked</span>
            </div>
            <p className={styles.tierDesc}>
              Fundamental algorithms, recursion, and core data structures.
            </p>
            <div className={styles.tierFooterText}>
              Always accessible to all learners.
            </div>
            <button
              type="button"
              className={styles.tierActionBtn}
              onClick={() => router.push('/practice/library?difficulty=Easy')}
            >
              Practice Easy →
            </button>
          </div>

          {/* Tier 2: Medium */}
          <div className={styles.tierItemCard}>
            <div className={styles.tierItemTop}>
              <div className={styles.tierName}>
                {medUnlocked ? <CheckCircle2 size={15} color="#10b981" /> : <Flame size={15} color="#f59e0b" />}
                <span>Medium Tier</span>
              </div>
              <span className={medUnlocked ? styles.tierBadgeUnlocked : styles.tierBadgeGated}>
                {medUnlocked ? '✓ Unlocked' : '🔒 Gated'}
              </span>
            </div>
            <p className={styles.tierDesc}>
              Complex trees, graph traversal, and dynamic programming.
            </p>
            <div className={styles.tierProgressBlock}>
              <div className={styles.tierReqText}>
                <span>10 easy solves OR Rating ≥ 300</span>
                <span style={{ fontWeight: 800 }}>{Math.min(10, easySolved)} / 10</span>
              </div>
              <div className={styles.tierTrack}>
                <div
                  className={styles.tierFill}
                  style={{ width: `${medProgressPct}%`, background: medUnlocked ? '#10b981' : '#f59e0b' }}
                />
              </div>
            </div>
            {medUnlocked ? (
              <button
                type="button"
                className={styles.tierActionBtn}
                onClick={() => router.push('/practice/library?difficulty=Medium')}
              >
                Practice Medium →
              </button>
            ) : (
              <div className={styles.tierLockedNotice}>
                <Lock size={12} />
                <span>Solve {Math.max(0, 10 - easySolved)} more Easy to unlock</span>
              </div>
            )}
          </div>

          {/* Tier 3: Hard */}
          <div className={styles.tierItemCard}>
            <div className={styles.tierItemTop}>
              <div className={styles.tierName}>
                {hardUnlocked ? <CheckCircle2 size={15} color="#10b981" /> : <Lock size={14} color="#ef4444" />}
                <span>Hard Tier</span>
              </div>
              <span className={hardUnlocked ? styles.tierBadgeUnlocked : styles.tierBadgeGated}>
                {hardUnlocked ? '✓ Unlocked' : '🔒 Gated'}
              </span>
            </div>
            <p className={styles.tierDesc}>
              Advanced NP problems, segment trees, and system design.
            </p>
            <div className={styles.tierProgressBlock}>
              <div className={styles.tierReqText}>
                <span>20 medium solves OR Rating ≥ 1,500</span>
                <span style={{ fontWeight: 800 }}>{Math.min(20, mediumSolved)} / 20</span>
              </div>
              <div className={styles.tierTrack}>
                <div
                  className={styles.tierFill}
                  style={{ width: `${hardProgressPct}%`, background: hardUnlocked ? '#10b981' : '#ef4444' }}
                />
              </div>
            </div>
            {hardUnlocked ? (
              <button
                type="button"
                className={styles.tierActionBtn}
                onClick={() => router.push('/practice/library?difficulty=Hard')}
              >
                Practice Hard →
              </button>
            ) : (
              <div className={styles.tierLockedNotice}>
                <Lock size={12} />
                <span>Solve {Math.max(0, 20 - mediumSolved)} more Medium to unlock</span>
              </div>
            )}
          </div>

          {/* Tier 4: Grandmaster Contests */}
          <div className={styles.tierItemCard}>
            <div className={styles.tierItemTop}>
              <div className={styles.tierName}>
                {contestsUnlocked ? <CheckCircle2 size={15} color="#10b981" /> : <Lock size={14} color="#7c3aed" />}
                <span>Contests Track</span>
              </div>
              <span className={contestsUnlocked ? styles.tierBadgeUnlocked : styles.tierBadgeGated}>
                {contestsUnlocked ? '✓ Unlocked' : '🔒 Gated'}
              </span>
            </div>
            <p className={styles.tierDesc}>
              Weekly speed matches and competitive inter-university cups.
            </p>
            <div className={styles.tierProgressBlock}>
              <div className={styles.tierReqText}>
                <span>Level 5 OR Rating ≥ 1,200</span>
                <span style={{ fontWeight: 800 }}>{rating} / 1,200</span>
              </div>
              <div className={styles.tierTrack}>
                <div
                  className={styles.tierFill}
                  style={{ width: `${contestProgressPct}%`, background: '#7c3aed' }}
                />
              </div>
            </div>
            {contestsUnlocked ? (
              <button
                type="button"
                className={`${styles.tierActionBtn} ${styles.tierActionBtnPurple}`}
                onClick={() => router.push('/practice/contests')}
              >
                Enter Contests →
              </button>
            ) : (
              <div className={styles.tierLockedNotice}>
                <Lock size={12} />
                <span>Reach Lv 5 or 1200 Rating</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════
          5. WORLDWIDE PLATFORM STANDINGS (Real DB Leaderboard)
         ═════════════════════════════════════════════════════════════════════ */}
      <div id="platform-standings-section" className={styles.leaderboardCard}>
        <div className={styles.leaderboardTopRow}>
          <div className={styles.cardTitleWrap}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: '#fef3c7',
                color: '#b45309',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Trophy size={16} />
            </div>
            <div>
              <h3 className={styles.cardTitle} style={{ fontSize: '1.05rem' }}>
                Worldwide Platform Standings
              </h3>
              <p className={styles.cardSubtitle} style={{ fontSize: '0.775rem' }}>
                Fair competition ranking all free &amp; platform coders
              </p>
            </div>
          </div>

          {/* Filters & Toggles */}
          <div className={styles.leaderboardControls}>
            {/* Scope Toggle: Global | By Topic */}
            <div className={styles.pillsGroup}>
              <button
                type="button"
                className={`${styles.pillOption} ${scope === 'global' ? styles.pillOptionActive : ''}`}
                onClick={() => setScope('global')}
              >
                Global
              </button>
              <button
                type="button"
                className={`${styles.pillOption} ${scope === 'topic' ? styles.pillOptionActive : ''}`}
                onClick={() => setScope('topic')}
              >
                By Topic
              </button>
            </div>

            {/* Topic Select if Topic Scope */}
            {scope === 'topic' && (
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                style={{
                  padding: '5px 10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#334155',
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                {TOPICS_LIST.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}

            {/* Period Toggle: Monthly | Weekly | All Time */}
            <div className={styles.pillsGroup}>
              <button
                type="button"
                className={`${styles.pillOption} ${period === 'monthly' ? styles.pillOptionWhiteActive : ''}`}
                onClick={() => setPeriod('monthly')}
              >
                Monthly
              </button>
              <button
                type="button"
                className={`${styles.pillOption} ${period === 'weekly' ? styles.pillOptionWhiteActive : ''}`}
                onClick={() => setPeriod('weekly')}
              >
                Weekly
              </button>
              <button
                type="button"
                className={`${styles.pillOption} ${period === 'all_time' ? styles.pillOptionWhiteActive : ''}`}
                onClick={() => setPeriod('all_time')}
              >
                All Time
              </button>
            </div>
          </div>
        </div>

        {/* Table Content */}
        <div style={{ overflowX: 'auto' }}>
          <table className={styles.leaderTable}>
            <thead>
              <tr>
                <th className={styles.thCell} style={{ width: '45px' }}>#</th>
                <th className={styles.thCell}>Coder</th>
                <th className={styles.thCell}>Level</th>
                <th className={styles.thCell}>Rating</th>
                <th className={styles.thCell}>Solved</th>
                <th className={styles.thCell}>Streak</th>
              </tr>
            </thead>
            <tbody>
              {boardLoading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                    Loading leaderboard standings…
                  </td>
                </tr>
              ) : apiBoard.length > 0 ? (
                apiBoard.map((row) => {
                  const isCurrentUser = row.student_id === standing?.student_id;
                  return (
                    <tr key={row.student_id} className={isCurrentUser ? styles.userRowHighlight : undefined}>
                      <td className={styles.tdCell}>
                        <span
                          className={styles.rankMedalPill}
                          style={{
                            color:
                              row.position === 1
                                ? '#f59e0b'
                                : row.position === 2
                                ? '#64748b'
                                : row.position === 3
                                ? '#b45309'
                                : '#94a3b8',
                          }}
                        >
                          {row.position}
                        </span>
                      </td>
                      <td className={styles.tdCell}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div
                            className={styles.tableAvatarInitials}
                            style={{
                              background:
                                row.position === 1
                                  ? 'linear-gradient(135deg, #1e293b, #0f172a)'
                                  : row.position === 2
                                  ? 'linear-gradient(135deg, #8b5cf6, #7c3aed)'
                                  : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                            }}
                          >
                            {(row.student_name || 'CO').slice(0, 2).toUpperCase()}
                          </div>
                          <span style={{ fontWeight: 700, color: '#0f172a', fontFamily: "'Space Grotesk', sans-serif" }}>
                            {row.student_name}
                            {isCurrentUser && <span style={{ color: '#7c3aed', fontWeight: 700 }}> (You)</span>}
                          </span>
                          {row.position === 1 && <span title="Platform Rank 1">👑</span>}
                        </div>
                      </td>
                      <td className={styles.tdCell}>
                        <span style={{ color: '#6d28d9', fontWeight: 600 }}>
                          Lv {row.level} · {row.level_name}
                        </span>
                      </td>
                      <td className={styles.tdCell} style={{ fontWeight: 800, color: '#0f172a', fontFamily: "'Space Grotesk', sans-serif" }}>
                        {Math.round(row.rating).toLocaleString()}
                      </td>
                      <td className={styles.tdCell} style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, color: '#10b981' }}>
                        {row.problems_solved ?? 0}
                      </td>
                      <td className={styles.tdCell}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#ea580c', fontWeight: 700 }}>
                          🔥 {row.streak_days ?? 0}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                    No ranked participants found for this scope/period yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PlatformLadderTab;
