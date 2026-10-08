'use client';

import React from 'react';
import { Lock, Unlock, Zap, Sparkles } from 'lucide-react';
import styles from './student-analytics.module.css';

interface UnlockTrackerProps {
  unlockedTiers?: string[];
  easySolved?: number;
  mediumSolved?: number;
  hardSolved?: number;
  rating?: number;
  nextUnlock?: {
    tier: string;
    requirement: string;
    current: number;
    target: number;
    progress_pct: number;
  } | null;
}

export const UnlockTracker: React.FC<UnlockTrackerProps> = ({
  unlockedTiers = ['Easy'],
  easySolved = 0,
  mediumSolved = 0,
  hardSolved = 0,
  rating = 0,
  nextUnlock,
}) => {
  const tiers = [
    {
      name: 'Easy',
      desc: 'Fundamental algorithms, recursion, and core data structures.',
      req: 'Always accessible to all learners',
      isUnlocked: true,
      color: '#10b981',
    },
    {
      name: 'Medium',
      desc: 'Complex trees, graph traversal, and dynamic programming.',
      req: '15 Easy Solves OR Rating ≥ 300',
      isUnlocked: unlockedTiers.includes('Medium'),
      color: '#f59e0b',
    },
    {
      name: 'Hard',
      desc: 'Advanced NP problems, segment trees, and system design.',
      req: '20 Medium Solves OR Rating ≥ 1,500',
      isUnlocked: unlockedTiers.includes('Hard'),
      color: '#ef4444',
    },
    {
      name: 'Grandmaster Contests',
      desc: 'Weekly speed matches and inter-university cups.',
      req: 'Level 5 OR Rating ≥ 3,000',
      isUnlocked: unlockedTiers.includes('Grandmaster'),
      color: '#8b5cf6',
    },
  ];

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleWrap}>
          <div className={styles.cardIconBox} style={{ background: '#ecfdf5', color: '#059669' }}>
            <Zap size={20} />
          </div>
          <div>
            <h3 className={styles.cardTitle}>Tiered Content Progression</h3>
            <p className={styles.cardSubtitle}>
              Access gated by problem-solving complexity and verified competitive rating
            </p>
          </div>
        </div>

        {nextUnlock && (
          <span className={styles.metaBadge} style={{ background: '#fef3c7', color: '#b45309' }}>
            <Sparkles size={12} /> Next: {nextUnlock.tier} ({nextUnlock.progress_pct}% unlocked)
          </span>
        )}
      </div>

      {/* Progress towards Next Unlock */}
      {nextUnlock && (
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
              <strong>Target Unlock:</strong> {nextUnlock.tier} — {nextUnlock.requirement}
            </span>
            <span style={{ fontWeight: 700, color: '#7c3aed' }}>
              {nextUnlock.current} / {nextUnlock.target}
            </span>
          </div>
          <div className={styles.barTrack} style={{ height: '8px' }}>
            <div
              className={styles.barFill}
              style={{
                width: `${nextUnlock.progress_pct}%`,
                background: 'linear-gradient(90deg, #7c3aed, #06b6d4)',
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
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: tier.color,
                  display: 'inline-block',
                }}
              />
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
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.35rem', color: '#0f172a' }}>
              {tier.name}
            </h4>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 0.5rem', minHeight: '36px' }}>
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
