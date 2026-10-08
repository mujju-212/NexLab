'use client';

import React from 'react';
import { Lock, Unlock, Zap, ShieldCheck, Sparkles, ChevronRight } from 'lucide-react';
import type { ContentUnlocksResponse } from '@/services/student-analytics.service';
import styles from './student-analytics.module.css';

interface ContentUnlockCardProps {
  unlocks:
    | {
        student_id?: string;
        unlocked_tiers?: string[];
        easy_solved?: number;
        medium_solved?: number;
        hard_solved?: number;
        rating?: number;
        next_unlock?: {
          tier: string;
          requirement: string;
          current: number;
          target: number;
          progress_pct: number;
        } | null;
      }
    | undefined;
}


export const ContentUnlockCard: React.FC<ContentUnlockCardProps> = ({ unlocks }) => {
  const tiers = [
    {
      name: 'Easy',
      desc: 'Fundamental algorithms, recursion, and core data structures.',
      req: 'Always accessible to all registered learners.',
      isUnlocked: true,
      icon: '🟢',
    },
    {
      name: 'Medium',
      desc: 'Complex trees, graph traversal, and dynamic programming.',
      req: 'Requires 15 Easy Solves OR Rating ≥ 300.',
      isUnlocked: unlocks?.unlocked_tiers?.includes('Medium') ?? false,
      icon: '🟡',
    },
    {
      name: 'Hard',
      desc: 'Advanced NP problems, segment trees, and system design.',
      req: 'Requires 20 Medium Solves OR Rating ≥ 1,500.',
      isUnlocked: unlocks?.unlocked_tiers?.includes('Hard') ?? false,
      icon: '🔴',
    },
    {
      name: 'Grandmaster Contests',
      desc: 'Weekly speed matches and competitive institution cups.',
      req: 'Requires Level 5 OR Rating ≥ 3,000.',
      isUnlocked: unlocks?.unlocked_tiers?.includes('Grandmaster') ?? false,
      icon: '👑',
    },
  ];

  const next = unlocks?.next_unlock;

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleWrap}>
          <div className={styles.cardIconBox} style={{ background: '#ecfdf5', color: '#059669' }}>
            <Zap size={20} />
          </div>
          <div>
            <h2 className={styles.cardTitle}>Tiered Content Progression</h2>
            <p className={styles.cardSubtitle}>
              Content unlocking dynamically based on solving complexity and verified platform rating
            </p>
          </div>
        </div>
        {next && (
          <span className={styles.metaBadge} style={{ background: '#fef3c7', color: '#b45309' }}>
            <Sparkles size={12} /> Next: {next.tier} ({next.progress_pct}% unlocked)
          </span>
        )}
      </div>

      {/* Progress towards Next Unlock if not fully unlocked */}
      {next && (
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '0.875rem',
            padding: '1rem',
            marginBottom: '1.25rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.5rem',
              fontSize: '0.85rem',
            }}
          >
            <span>
              <strong>Target Tier:</strong> {next.tier} — {next.requirement}
            </span>
            <span style={{ fontWeight: 700, color: '#7c3aed' }}>
              {next.current} / {next.target}
            </span>
          </div>
          <div className={styles.barTrack} style={{ height: '8px' }}>
            <div
              className={styles.barFill}
              style={{
                width: `${next.progress_pct}%`,
                background: 'linear-gradient(90deg, #7c3aed, #3b82f6)',
              }}
            />
          </div>
        </div>
      )}

      {/* Tiers Grid */}
      <div className={styles.unlockTiersGrid}>
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`${styles.tierCard} ${
              tier.isUnlocked ? styles.tierCardUnlocked : styles.tierCardLocked
            }`}
          >
            <div className={styles.tierHeader}>
              <span style={{ fontSize: '1.25rem' }}>{tier.icon}</span>
              <span
                className={`${styles.tierBadge} ${
                  tier.isUnlocked ? styles.tierUnlockedBadge : styles.tierLockedBadge
                }`}
              >
                {tier.isUnlocked ? (
                  <>
                    <Unlock size={12} /> Unlocked
                  </>
                ) : (
                  <>
                    <Lock size={12} /> Gated
                  </>
                )}
              </span>
            </div>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.35rem', color: '#0f172a' }}>
              {tier.name}
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 0.5rem', minHeight: '38px' }}>
              {tier.desc}
            </p>
            <div className={styles.tierReq}>
              <small>{tier.req}</small>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
