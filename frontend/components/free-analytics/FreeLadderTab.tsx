'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Trophy,
  Flame,
  Award,
  Zap,
  TrendingUp,
  ShieldCheck,
  Globe,
  Hash,
  Sparkles,
} from 'lucide-react';
import { LevelRing } from '@/components/student-analytics/LevelRing';
import { UnlockTracker } from '@/components/student-analytics/UnlockTracker';
import { DonutChart } from '@/components/analytics/DonutChart';
import { freeService } from '@/services/free.service';
import type {
  FreePlatformStanding,
  FreeDifficultyMix,
  FreeUnlocksData,
} from '@/services/free.service';
import styles from './free-analytics.module.css';

interface FreeLadderTabProps {
  standing: FreePlatformStanding;
  difficultyMix?: FreeDifficultyMix;
  unlocks?: FreeUnlocksData;
}

const TOPICS_LIST = [
  'Arrays',
  'Strings',
  'Linked Lists',
  'Trees',
  'Dynamic Programming',
  'Algorithms',
];

export const FreeLadderTab: React.FC<FreeLadderTabProps> = ({
  standing,
  difficultyMix,
  unlocks,
}) => {
  const [scope, setScope] = useState<'global' | 'topic'>('global');
  const [topic, setTopic] = useState('Arrays');
  const [period, setPeriod] = useState<'all_time' | 'monthly' | 'weekly'>('all_time');

  // Leaderboard Query
  const { data: boardData, isLoading: boardLoading } = useQuery({
    queryKey: ['free-leaderboard', scope, topic, period],
    queryFn: () =>
      freeService.getPlatformLeaderboard({
        scope,
        scope_id: scope === 'topic' ? topic : undefined,
        period,
        limit: 50,
      }),
    staleTime: 60 * 1000,
  });

  const donutData = [
    {
      name: 'Easy',
      value: standing.easy_solved || difficultyMix?.easy || 0,
      color: '#10b981',
    },
    {
      name: 'Medium',
      value: standing.medium_solved || difficultyMix?.medium || 0,
      color: '#f59e0b',
    },
    {
      name: 'Hard',
      value: standing.hard_solved || difficultyMix?.hard || 0,
      color: '#ef4444',
    },
  ];

  const totalSolved = standing.problems_solved || difficultyMix?.total_solved || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* ── 1. Top Row: Rating & Level Deep-Dive + Difficulty Mix ─────────── */}
      <div className={styles.twoColGrid}>
        {/* Rating & Badge Shelf */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleWrap}>
              <div className={styles.cardIconBox} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                <Trophy size={20} />
              </div>
              <div>
                <h3 className={styles.cardTitle}>Platform Competitive Ladder</h3>
                <p className={styles.cardSubtitle}>Verified difficulty-weighted points & achievements</p>
              </div>
            </div>
            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#7c3aed' }}>
              Rank #{standing.global_rank || 1}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', marginBottom: '1.25rem' }}>
            <LevelRing
              level={standing.level || 1}
              levelName={standing.level_name || 'Newcomer'}
              currentXp={standing.total_xp || 0}
              nextXp={standing.next_level_xp || 500}
              size={70}
            />
            <div>
              <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#0f172a', lineHeight: 1.1 }}>
                {Math.round(standing.rating || 0).toLocaleString()} <span style={{ fontSize: '0.85rem', color: '#64748b' }}>pts</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 700, marginTop: '0.2rem' }}>
                Top {Math.max(1, 100 - Math.round(standing.global_percentile || 99))}% Globally
              </div>
            </div>
          </div>

          {/* Badges Shelf */}
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1rem' }}>
            <span style={{ fontSize: '0.725rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Badges Earned ({standing.badges?.length || 0})
            </span>
            <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
              {standing.badges && standing.badges.length > 0 ? (
                standing.badges.map((b) => (
                  <div
                    key={b.badge_id}
                    title={`${b.title}: ${b.desc}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      background: '#faf8ff',
                      border: '1px solid #ede9fe',
                      padding: '0.3rem 0.65rem',
                      borderRadius: '0.5rem',
                      fontSize: '0.775rem',
                      fontWeight: 700,
                      color: '#4c1d95',
                    }}
                  >
                    <span>{b.icon || '🏅'}</span>
                    <span>{b.title}</span>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: '0.775rem', color: '#94a3b8' }}>
                  Solve problems and build daily streaks to unlock badges!
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Difficulty Mix Donut */}
        <DonutChart
          title="Difficulty Distribution"
          subtitle="Breakdown of solves across Easy, Medium, and Hard tiers"
          data={donutData}
          centerLabel={{ title: `${totalSolved}`, subtitle: 'Total Solved' }}
          height={260}
        />
      </div>

      {/* ── 2. Content Unlock Progression ─────────────────────────────────── */}
      <UnlockTracker
        unlockedTiers={unlocks?.unlocked_tiers || ['Easy']}
        easySolved={unlocks?.stats?.easy_solved || standing.easy_solved || 0}
        mediumSolved={unlocks?.stats?.medium_solved || standing.medium_solved || 0}
        hardSolved={standing.hard_solved || 0}
        rating={unlocks?.stats?.rating || standing.rating || 0}
        nextUnlock={
          unlocks?.next_unlock
            ? {
                tier: unlocks.next_unlock.target,
                requirement: unlocks.next_unlock.requirement,
                current: 0,
                target: 100,
                progress_pct: unlocks.next_unlock.progress_pct,
              }
            : null
        }
      />

      {/* ── 3. Interactive Platform Leaderboard ──────────────────────────── */}
      <div className={styles.card}>
        <div className={styles.cardHeader} style={{ flexWrap: 'wrap', gap: '1rem' }}>
          <div className={styles.cardTitleWrap}>
            <div className={styles.cardIconBox} style={{ background: '#fef3c7', color: '#b45309' }}>
              <Award size={20} />
            </div>
            <div>
              <h3 className={styles.cardTitle}>Worldwide Platform Standings</h3>
              <p className={styles.cardSubtitle}>Fair competition ranking all free & platform coders</p>
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Scope */}
            <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '0.5rem', padding: '0.2rem' }}>
              <button
                onClick={() => setScope('global')}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '0.4rem',
                  fontSize: '0.775rem',
                  fontWeight: 700,
                  border: 'none',
                  background: scope === 'global' ? '#fff' : 'transparent',
                  color: scope === 'global' ? '#0f172a' : '#64748b',
                  cursor: 'pointer',
                  boxShadow: scope === 'global' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                Global
              </button>
              <button
                onClick={() => setScope('topic')}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '0.4rem',
                  fontSize: '0.775rem',
                  fontWeight: 700,
                  border: 'none',
                  background: scope === 'topic' ? '#fff' : 'transparent',
                  color: scope === 'topic' ? '#0f172a' : '#64748b',
                  cursor: 'pointer',
                  boxShadow: scope === 'topic' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                By Topic
              </button>
            </div>

            {/* Topic selector if scope === topic */}
            {scope === 'topic' && (
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                style={{
                  padding: '0.35rem 0.65rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  fontSize: '0.775rem',
                  fontWeight: 600,
                  color: '#334155',
                }}
              >
                {TOPICS_LIST.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}

            {/* Period buttons */}
            <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '0.5rem', padding: '0.2rem' }}>
              {(['all_time', 'monthly', 'weekly'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  style={{
                    padding: '0.35rem 0.65rem',
                    borderRadius: '0.4rem',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    border: 'none',
                    background: period === p ? '#fff' : 'transparent',
                    color: period === p ? '#7c3aed' : '#64748b',
                    cursor: 'pointer',
                    boxShadow: period === p ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  {p === 'all_time' ? 'All-Time' : p === 'monthly' ? 'Monthly' : 'Weekly'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Board Table */}
        {boardLoading ? (
          <div style={{ padding: '2rem 0', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
            Loading platform standings…
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.65rem 0.75rem' }}>Rank</th>
                  <th style={{ padding: '0.65rem 0.75rem' }}>Coder</th>
                  <th style={{ padding: '0.65rem 0.75rem' }}>Level</th>
                  <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Solves</th>
                  <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Rating</th>
                </tr>
              </thead>
              <tbody>
                {(boardData?.leaderboard || []).slice(0, 15).map((row) => {
                  const isMe = row.student_id === standing.student_id;
                  return (
                    <tr
                      key={row.student_id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        background: isMe ? '#f5f3ff' : 'transparent',
                        fontWeight: isMe ? 800 : 500,
                      }}
                    >
                      <td style={{ padding: '0.75rem', color: row.position <= 3 ? '#b45309' : '#64748b', fontWeight: 800 }}>
                        {row.position === 1 ? '🥇 1' : row.position === 2 ? '🥈 2' : row.position === 3 ? '🥉 3' : `#${row.position}`}
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ color: isMe ? '#7c3aed' : '#0f172a' }}>{row.student_name}</span>
                          {isMe && (
                            <span style={{ fontSize: '0.65rem', background: '#7c3aed', color: '#fff', padding: '0.1rem 0.35rem', borderRadius: '0.25rem' }}>
                              YOU
                            </span>
                          )}
                          {row.streak_days > 0 && (
                            <span style={{ fontSize: '0.72rem', color: '#ef4444' }}>🔥{row.streak_days}d</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem', color: '#64748b' }}>
                        Lv {row.level} · {row.level_name}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', color: '#334155' }}>
                        {row.problems_solved}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 800, color: '#7c3aed' }}>
                        {Math.round(row.rating).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
