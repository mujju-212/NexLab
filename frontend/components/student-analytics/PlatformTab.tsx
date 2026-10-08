'use client';

import React from 'react';
import {
  Trophy,
  Flame,
  Zap,
  Award,
  Medal,
  CheckCircle2,
  Lock,
  Unlock,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { DonutChart } from '@/components/analytics';
import type {
  ContentUnlocksResponse,
  PracticeMasteryItem,
  PlatformLeaderboardResponse,
} from '@/services/student-analytics.service';
import { LevelRing } from './LevelRing';
import { UnlockTracker } from './UnlockTracker';
import { PlatformLeaderboardView } from './PlatformLeaderboardView';
import styles from './student-analytics.module.css';

interface PlatformTabProps {
  standing: any;
  unlocks: ContentUnlocksResponse | undefined;
  practiceMastery: PracticeMasteryItem[];
  leaderboardData: PlatformLeaderboardResponse | null;
  leaderboardLoading: boolean;
  boardScope: 'global' | 'topic' | 'institution';
  boardPeriod: 'all_time' | 'monthly' | 'weekly';
  boardTopic: string;
  onScopeChange: (scope: 'global' | 'topic' | 'institution') => void;
  onPeriodChange: (period: 'all_time' | 'monthly' | 'weekly') => void;
  onTopicChange: (topic: string) => void;
}

export const PlatformTab: React.FC<PlatformTabProps> = ({
  standing,
  unlocks,
  practiceMastery = [],
  leaderboardData,
  leaderboardLoading,
  boardScope,
  boardPeriod,
  boardTopic,
  onScopeChange,
  onPeriodChange,
  onTopicChange,
}) => {
  const easySolved = standing?.easy_solved ?? 0;
  const medSolved = standing?.medium_solved ?? 0;
  const hardSolved = standing?.hard_solved ?? 0;
  const totalSolved = standing?.problems_solved ?? easySolved + medSolved + hardSolved;

  // DonutChart data for Easy / Medium / Hard difficulty distribution
  const difficultyData = [
    { name: 'Easy', value: easySolved, color: '#10b981' },
    { name: 'Medium', value: medSolved, color: '#f59e0b' },
    { name: 'Hard', value: hardSolved, color: '#ef4444' },
  ];

  const badges = standing?.badges || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* 1. Rating & Level Showcase Block */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 0.8fr',
          gap: '1.25rem',
        }}
      >
        {/* Left: Big Rating & Percentile Card */}
        <div
          className={styles.card}
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(236,253,245,0.6) 100%)',
            border: '1px solid #a7f3d0',
          }}
        >
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleWrap}>
              <div className={styles.cardIconBox} style={{ background: '#ecfdf5', color: '#059669' }}>
                <Trophy size={20} />
              </div>
              <div>
                <h3 className={styles.cardTitle}>Competitive Platform Rating</h3>
                <p className={styles.cardSubtitle}>
                  Difficulty-weighted rating (Easy=10, Medium=30, Hard=70) with anti-farming protection
                </p>
              </div>
            </div>
            <span
              className={styles.metaBadge}
              style={{ background: '#d1fae5', color: '#065f46', fontSize: '0.8rem', fontWeight: 700 }}
            >
              Verified Ladder
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '1.5rem', flexWrap: 'wrap', margin: '1rem 0' }}>
            <div>
              <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#047857', lineHeight: 1 }}>
                {standing?.rating ? Math.round(standing.rating).toLocaleString() : '0'}
              </div>
              <small style={{ color: '#64748b', fontWeight: 600 }}>Active Rating Points</small>
            </div>

            <div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
                #{standing?.global_rank ?? '—'}
              </div>
              <small style={{ color: '#64748b', fontWeight: 600 }}>
                Global Rank (Top{' '}
                {standing?.global_percentile != null
                  ? Math.max(1, 100 - Math.round(standing.global_percentile))
                  : 10}
                %)
              </small>
            </div>

            <div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#c2410c', lineHeight: 1 }}>
                🔥 {standing?.streak_days ?? 0}
              </div>
              <small style={{ color: '#64748b', fontWeight: 600 }}>Day Solve Streak</small>
            </div>
          </div>

          {/* Level Progress */}
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
            <LevelRing
              level={standing?.level ?? 1}
              levelName={standing?.level_name || 'Novice'}
              currentXp={standing?.total_xp ?? (standing?.level ?? 1) * 350}
              nextXp={standing?.next_level_xp ?? ((standing?.level ?? 1) + 1) * 500}
              size={54}
              strokeWidth={5}
            />
          </div>
        </div>

        {/* Right: Solved Difficulty Distribution DonutChart */}
        <div>
          <DonutChart
            title="Difficulty Solves Breakdown"
            subtitle={`${totalSolved} Total Problems Solved`}
            data={difficultyData}
            height={280}
            innerRadius={55}
            outerRadius={85}
            centerLabel={{
              title: `${totalSolved}`,
              subtitle: 'Solves',
            }}
          />
        </div>
      </div>

      {/* 2. Badge Shelf */}
      {badges.length > 0 && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleWrap}>
              <div className={styles.cardIconBox} style={{ background: '#fef3c7', color: '#b45309' }}>
                <Award size={20} />
              </div>
              <div>
                <h3 className={styles.cardTitle}>Earned Platform Badges</h3>
                <p className={styles.cardSubtitle}>Recognized achievements from competitive solves</p>
              </div>
            </div>
            <span className={styles.metaBadge}>{badges.length} Badges</span>
          </div>

          <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap' }}>
            {badges.map((b: any) => (
              <div
                key={b.id || b.badge_type}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.5rem 0.85rem',
                  borderRadius: '0.65rem',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  color: '#1e293b',
                }}
              >
                <Medal size={16} color="#f59e0b" />
                <span>{b.title || b.badge_type}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Content Unlock Progression */}
      <UnlockTracker
        unlockedTiers={unlocks?.unlocked_tiers}
        easySolved={unlocks?.easy_solved}
        mediumSolved={unlocks?.medium_solved}
        hardSolved={unlocks?.hard_solved}
        rating={unlocks?.rating}
        nextUnlock={unlocks?.next_unlock}
      />

      {/* 4. Practice Topic Strengths Breakdown */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleWrap}>
            <div className={styles.cardIconBox} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
              <Zap size={20} />
            </div>
            <div>
              <h3 className={styles.cardTitle}>Practice Topic Strength Matrix</h3>
              <p className={styles.cardSubtitle}>
                Algorithm proficiency categorized across NexLab practice topics
              </p>
            </div>
          </div>
          <Link
            href="/student/practice"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              color: '#7c3aed',
              fontWeight: 700,
              fontSize: '0.85rem',
              textDecoration: 'none',
            }}
          >
            Practice Library <ExternalLink size={13} />
          </Link>
        </div>

        {practiceMastery.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
            No practice telemetry logged. Solve problems in the Practice Library to illuminate your matrix.
          </p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '1rem',
            }}
          >
            {practiceMastery.map((pm) => (
              <div
                key={pm.topic}
                style={{
                  padding: '1rem',
                  borderRadius: '0.75rem',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>{pm.topic}</strong>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '0.15rem 0.5rem',
                      borderRadius: '0.35rem',
                      background: pm.band === 'Mastered' ? '#dcfce7' : '#e0f2fe',
                      color: pm.band === 'Mastered' ? '#15803d' : '#0369a1',
                    }}
                  >
                    {pm.strength}% ({pm.band})
                  </span>
                </div>

                <div className={styles.barTrack} style={{ height: '6px', marginBottom: '0.5rem' }}>
                  <div
                    className={styles.barFill}
                    style={{
                      width: `${pm.strength}%`,
                      background: 'linear-gradient(90deg, #10b981, #06b6d4)',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748b' }}>
                  <span>Solved: {pm.solved_count} / {pm.attempted_count}</span>
                  <span>
                    {((pm.by_difficulty as any)?.easy?.solved ?? (pm.by_difficulty as any)?.Easy?.solved ?? 0)}E · {((pm.by_difficulty as any)?.medium?.solved ?? (pm.by_difficulty as any)?.Medium?.solved ?? 0)}M · {((pm.by_difficulty as any)?.hard?.solved ?? (pm.by_difficulty as any)?.Hard?.solved ?? 0)}H
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Platform Competitive Leaderboards */}
      <PlatformLeaderboardView
        boardData={leaderboardData}
        loading={leaderboardLoading}
        selectedScope={boardScope}
        selectedPeriod={boardPeriod}
        selectedTopic={boardTopic}
        onScopeChange={onScopeChange}
        onPeriodChange={onPeriodChange}
        onTopicChange={onTopicChange}
      />
    </div>
  );
};
