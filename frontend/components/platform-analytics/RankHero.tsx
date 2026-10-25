'use client';

import React, { useState } from 'react';
import { Flame, Share2, Sparkles, TrendingUp, Trophy, Zap, CheckCircle2 } from 'lucide-react';
import { LevelRing } from '@/components/student-analytics/LevelRing';
import { ShowcaseModal } from './ShowcaseModal';
import type { PlatformStanding, PlatformDifficultyMix, PlatformUnlocksData } from '@/services/platform-user.service';
import styles from './platform-analytics.module.css';

interface RankHeroProps {
  standing: PlatformStanding;
  difficultyMix?: PlatformDifficultyMix;
  unlocks?: PlatformUnlocksData;
  userName?: string;
  initialPublic?: boolean;
  profileSlug?: string | null;
}

export const RankHero: React.FC<RankHeroProps> = ({
  standing,
  difficultyMix,
  unlocks,
  userName = 'Athlete',
  initialPublic = false,
  profileSlug = null,
}) => {
  const [showcaseOpen, setShowcaseOpen] = useState(false);

  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'NL';

  const solvedTotal = standing.problems_solved || difficultyMix?.total_solved || 0;
  const easySolved = standing.easy_solved || difficultyMix?.easy || 0;
  const medSolved = standing.medium_solved || difficultyMix?.medium || 0;
  const hardSolved = standing.hard_solved || difficultyMix?.hard || 0;
  const accuracy = difficultyMix?.acceptance_rate ?? 0;

  const nextUnlock = unlocks?.next_unlock;

  return (
    <div className={styles.rankHero}>
      {/* ── Top Row: Identity & Actions ───────────────────────────────────── */}
      <div className={styles.heroTopRow}>
        <div className={styles.userIdentity}>
          <div className={styles.avatarBox}>{initials}</div>
          <div>
            <h1 className={styles.userName}>{userName}</h1>
            <p className={styles.userSubtitle}>NexLab Free Track · Global Platform Athlete</p>
          </div>
        </div>

        <div className={styles.heroTopActions}>
          <div className={styles.streakPill}>
            <Flame size={16} />
            <span>{standing.streak_days || 0}-day streak</span>
          </div>

          <button className={styles.shareButton} onClick={() => setShowcaseOpen(true)}>
            <Share2 size={14} />
            <span>Share Profile ↗</span>
          </button>
        </div>
      </div>

      {/* ── Hero Metrics Grid ─────────────────────────────────────────────── */}
      <div className={styles.heroMetricsGrid}>
        {/* Metric 1: Platform Rating */}
        <div className={styles.heroMetricCard}>
          <span className={styles.metricLabel}>Platform Rating</span>
          <div className={styles.metricValueWrap}>
            <span className={styles.metricPrimary}>{Math.round(standing.rating || 0).toLocaleString()}</span>
            {standing.rank_movement !== 0 && (
              <span className={styles.metricDelta} style={{ color: standing.rank_movement > 0 ? '#10b981' : '#ef4444' }}>
                {standing.rank_movement > 0 ? `▲ +${standing.rank_movement}` : `▼ ${standing.rank_movement}`}
              </span>
            )}
          </div>
          <span className={styles.metricSubtext}>Difficulty-weighted competitive rating</span>
        </div>

        {/* Metric 2: Global Standing & Percentile */}
        <div className={styles.heroMetricCard}>
          <span className={styles.metricLabel}>Global Ladder</span>
          <div className={styles.metricValueWrap}>
            {standing.global_rank && (standing.problems_solved || 0) > 0 && (standing.rating || 0) > 0 ? (
              <>
                <span className={styles.metricPrimary}>
                  #{standing.global_rank.toLocaleString()}
                </span>
                <span className={styles.metricDelta} style={{ color: '#7c3aed' }}>
                  Top {Math.max(1, 100 - Math.round(standing.global_percentile || 0))}%
                </span>
              </>
            ) : (
              <>
                <span className={styles.metricPrimary} style={{ fontSize: '1.25rem' }}>
                  Unranked
                </span>
                <span className={styles.metricDelta} style={{ color: '#64748b', fontSize: '0.78rem' }}>
                  Solve 1 problem to rank
                </span>
              </>
            )}
          </div>
          <span className={styles.metricSubtext}>Across all worldwide platform coders</span>
        </div>

        {/* Metric 3: Level Ring */}
        <div className={styles.heroMetricCard}>
          <span className={styles.metricLabel}>Player Progression</span>
          <div style={{ marginTop: '0.25rem' }}>
            <LevelRing
              level={standing.level || 1}
              levelName={standing.level_name || 'Newcomer'}
              currentXp={standing.total_xp || 0}
              nextXp={standing.next_level_xp || 500}
              size={54}
            />
          </div>
        </div>

        {/* Metric 4: Solved Mix & Accuracy */}
        <div className={styles.heroMetricCard}>
          <span className={styles.metricLabel}>Total Solved & Accuracy</span>
          <div className={styles.metricValueWrap}>
            <span className={styles.metricPrimary}>{solvedTotal}</span>
            <span className={styles.metricDelta} style={{ color: '#059669' }}>
              {accuracy}% Acc
            </span>
          </div>
          <div className={styles.diffChipsRow}>
            <span className={`${styles.diffChip} ${styles.diffEasy}`}>E {easySolved}</span>
            <span className={`${styles.diffChip} ${styles.diffMed}`}>M {medSolved}</span>
            <span className={`${styles.diffChip} ${styles.diffHard}`}>H {hardSolved}</span>
          </div>
        </div>
      </div>

      {/* ── Content Unlock Progression Bar ───────────────────────────────── */}
      {nextUnlock && (
        <div className={styles.heroUnlockRow}>
          <div className={styles.unlockHeader}>
            <span className={styles.unlockTarget}>
              <Sparkles size={14} color="#7c3aed" />
              <span>
                <strong>Next Content Unlock:</strong> {nextUnlock.target} — {nextUnlock.current}
              </span>
            </span>
            <span className={styles.unlockPct}>{nextUnlock.progress_pct}%</span>
          </div>
          <div className={styles.unlockProgressBar}>
            <div
              className={styles.unlockProgressFill}
              style={{ width: `${Math.min(100, nextUnlock.progress_pct)}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Showcase Modal ───────────────────────────────────────────────── */}
      <ShowcaseModal
        isOpen={showcaseOpen}
        onClose={() => setShowcaseOpen(false)}
        initialPublic={initialPublic}
        initialSlug={profileSlug}
        userName={userName}
        rating={standing.rating || 0}
        level={standing.level || 1}
        levelName={standing.level_name || 'Newcomer'}
        streakDays={standing.streak_days || 0}
        badgesCount={standing.badges?.length || 0}
      />
    </div>
  );
};
