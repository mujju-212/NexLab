'use client';

import React, { useState } from 'react';
import { Trophy, Globe, Building, Hash, ShieldCheck, Flame, Medal, Award } from 'lucide-react';
import type { PlatformLeaderboardResponse } from '@/services/student-analytics.service';
import styles from './student-analytics.module.css';

interface PlatformLeaderboardViewProps {
  boardData: PlatformLeaderboardResponse | null;
  loading: boolean;
  selectedScope: 'global' | 'topic' | 'institution';
  selectedPeriod: 'all_time' | 'monthly' | 'weekly';
  selectedTopic: string;
  onScopeChange: (scope: 'global' | 'topic' | 'institution') => void;
  onPeriodChange: (period: 'all_time' | 'monthly' | 'weekly') => void;
  onTopicChange: (topic: string) => void;
}

const COMMON_TOPICS = [
  'Arrays & Strings',
  'Linked Lists',
  'Trees & Graphs',
  'Dynamic Programming',
  'Sorting & Searching',
  'Recursion',
];

export const PlatformLeaderboardView: React.FC<PlatformLeaderboardViewProps> = ({
  boardData,
  loading,
  selectedScope,
  selectedPeriod,
  selectedTopic,
  onScopeChange,
  onPeriodChange,
  onTopicChange,
}) => {
  const list = boardData?.leaderboard || [];
  const top3 = list.slice(0, 3);

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleWrap}>
          <div className={styles.cardIconBox} style={{ background: '#fef3c7', color: '#b45309' }}>
            <Trophy size={20} />
          </div>
          <div>
            <h2 className={styles.cardTitle}>Platform Competitive Leaderboard</h2>
            <p className={styles.cardSubtitle}>
              Track 2 global ladder ranked by difficulty-weighted rating and verified test solves
            </p>
          </div>
        </div>

        {/* Filter Controls */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Scope buttons */}
          <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '0.5rem', padding: '0.2rem' }}>
            <button
              onClick={() => onScopeChange('global')}
              style={{
                border: 'none',
                background: selectedScope === 'global' ? '#ffffff' : 'transparent',
                color: selectedScope === 'global' ? '#7c3aed' : '#64748b',
                fontWeight: 600,
                fontSize: '0.75rem',
                padding: '0.35rem 0.65rem',
                borderRadius: '0.35rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                boxShadow: selectedScope === 'global' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              <Globe size={13} /> Global
            </button>
            <button
              onClick={() => onScopeChange('institution')}
              style={{
                border: 'none',
                background: selectedScope === 'institution' ? '#ffffff' : 'transparent',
                color: selectedScope === 'institution' ? '#7c3aed' : '#64748b',
                fontWeight: 600,
                fontSize: '0.75rem',
                padding: '0.35rem 0.65rem',
                borderRadius: '0.35rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                boxShadow: selectedScope === 'institution' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              <Building size={13} /> Institution
            </button>
            <button
              onClick={() => onScopeChange('topic')}
              style={{
                border: 'none',
                background: selectedScope === 'topic' ? '#ffffff' : 'transparent',
                color: selectedScope === 'topic' ? '#7c3aed' : '#64748b',
                fontWeight: 600,
                fontSize: '0.75rem',
                padding: '0.35rem 0.65rem',
                borderRadius: '0.35rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                boxShadow: selectedScope === 'topic' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              <Hash size={13} /> Topic
            </button>
          </div>

          {/* Topic selector if scope is topic */}
          {selectedScope === 'topic' && (
            <select
              value={selectedTopic}
              onChange={(e) => onTopicChange(e.target.value)}
              style={{
                fontSize: '0.75rem',
                padding: '0.35rem 0.6rem',
                borderRadius: '0.5rem',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#1e293b',
                fontWeight: 600,
              }}
            >
              {COMMON_TOPICS.map((t) => (
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
                onClick={() => onPeriodChange(p)}
                style={{
                  border: 'none',
                  background: selectedPeriod === p ? '#ffffff' : 'transparent',
                  color: selectedPeriod === p ? '#0f172a' : '#64748b',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  padding: '0.35rem 0.65rem',
                  borderRadius: '0.35rem',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  boxShadow: selectedPeriod === p ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                {p.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tenant Privacy Notice Banner */}
      <div className={styles.privacyBanner}>
        <ShieldCheck size={16} />
        <span>
          <strong>Tenant Privacy Rule:</strong> Platform leaderboards expose Track 2 problem ratings only.
          Academic grades, confidential risk assessments, and course transcripts never cross into public view.
        </span>
      </div>

      {/* Podium for Top 3 */}
      {top3.length >= 3 && (
        <div className={styles.podiumRow}>
          {/* Silver (Rank 2) */}
          <div className={`${styles.podiumCard} ${styles.podiumSilver}`}>
            <span style={{ position: 'absolute', top: 12, right: 12, fontSize: '1rem' }}>🥈 #2</span>
            <div className={styles.podiumAvatar} style={{ background: '#94a3b8' }}>
              {top3[1].full_name?.charAt(0) || '2'}
            </div>
            <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>{top3[1].full_name}</strong>
            <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
              Level {top3[1].level} · {top3[1].level_name}
            </span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#334155', marginTop: '0.4rem' }}>
              {Math.round(top3[1].rating).toLocaleString()} pts
            </div>
            <small style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
              {top3[1].problems_solved} solves
            </small>
          </div>

          {/* Gold (Rank 1) */}
          <div className={`${styles.podiumCard} ${styles.podiumGold}`} style={{ transform: 'scale(1.04)' }}>
            <span style={{ position: 'absolute', top: 12, right: 12, fontSize: '1.2rem' }}>👑 #1</span>
            <div className={styles.podiumAvatar} style={{ background: '#f59e0b', width: 56, height: 56 }}>
              {top3[0].full_name?.charAt(0) || '1'}
            </div>
            <strong style={{ fontSize: '1.05rem', color: '#0f172a' }}>{top3[0].full_name}</strong>
            <span style={{ fontSize: '0.75rem', color: '#b45309', marginTop: '0.2rem' }}>
              Level {top3[0].level} · {top3[0].level_name}
            </span>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#b45309', marginTop: '0.4rem' }}>
              {Math.round(top3[0].rating).toLocaleString()} pts
            </div>
            <small style={{ fontSize: '0.75rem', color: '#92400e', marginTop: '0.2rem' }}>
              {top3[0].problems_solved} solves ({top3[0].hard_solved} Hard)
            </small>
          </div>

          {/* Bronze (Rank 3) */}
          <div className={`${styles.podiumCard} ${styles.podiumBronze}`}>
            <span style={{ position: 'absolute', top: 12, right: 12, fontSize: '1rem' }}>🥉 #3</span>
            <div className={styles.podiumAvatar} style={{ background: '#ea580c' }}>
              {top3[2].full_name?.charAt(0) || '3'}
            </div>
            <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>{top3[2].full_name}</strong>
            <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
              Level {top3[2].level} · {top3[2].level_name}
            </span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#c2410c', marginTop: '0.4rem' }}>
              {Math.round(top3[2].rating).toLocaleString()} pts
            </div>
            <small style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
              {top3[2].problems_solved} solves
            </small>
          </div>
        </div>
      )}

      {/* Leaderboard Table */}
      <div className={styles.tableWrap}>
        <table className={styles.leaderboardTable}>
          <thead>
            <tr>
              <th style={{ width: '60px' }}>Rank</th>
              <th>Coder</th>
              <th>Level</th>
              <th>Rating</th>
              <th>Solves (E / M / H)</th>
              <th>Percentile</th>
            </tr>
          </thead>
          <tbody>
            {list.map((row) => (
              <tr key={row.student_id} className={row.is_current_user ? styles.currentUserRow : ''}>
                <td style={{ fontWeight: 800 }}>
                  {row.position === 1 ? '🥇 1' : row.position === 2 ? '🥈 2' : row.position === 3 ? '🥉 3' : `#${row.position}`}
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: '#e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: '#475569',
                      }}
                    >
                      {row.full_name?.charAt(0) || 'U'}
                    </div>
                    <span>
                      {row.full_name}
                      {row.is_current_user && (
                        <span
                          style={{
                            marginLeft: '0.5rem',
                            fontSize: '0.7rem',
                            background: '#7c3aed',
                            color: '#ffffff',
                            padding: '0.1rem 0.4rem',
                            borderRadius: '0.25rem',
                          }}
                        >
                          You
                        </span>
                      )}
                    </span>
                  </div>
                </td>
                <td>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      background: '#f1f5f9',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '0.3rem',
                      fontWeight: 600,
                    }}
                  >
                    Lv {row.level} · {row.level_name}
                  </span>
                </td>
                <td style={{ fontWeight: 800, color: '#047857' }}>
                  {Math.round(row.rating).toLocaleString()} pts
                </td>
                <td>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    {row.problems_solved} total ({row.easy_solved}E · {row.medium_solved}M · {row.hard_solved}H)
                  </span>
                </td>
                <td>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#7c3aed' }}>
                    Top {Math.max(1, Math.round(100 - row.percentile))}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
