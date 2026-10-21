'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Award,
  Flame,
  Layers,
  ArrowRight,
  X,
  ExternalLink,
  Shield,
  Star,
  CheckCircle2,
} from 'lucide-react';
import type { UnifiedStudentOverview } from '@/services/student-analytics.service';
import styles from './growth-overview.module.css';

interface AchievementsCardProps {
  overview: UnifiedStudentOverview | null;
}

const DEFAULT_ACHIEVEMENTS = [
  {
    id: 'ach-1',
    title: '100 Problems',
    subtitle: 'Practice Milestone',
    badge_color: 'gold',
    value_display: '100',
    description: 'Solve 100 coding problems across easy, medium, and hard tiers.',
    unlocked: true,
  },
  {
    id: 'ach-2',
    title: '7-Day Streak',
    subtitle: 'Consistency',
    badge_color: 'fire',
    value_display: '7',
    description: 'Maintain practice activity for 7 consecutive days.',
    unlocked: true,
  },
  {
    id: 'ach-3',
    title: 'Arrays Master',
    subtitle: 'Concept Mastery',
    badge_color: 'purple',
    value_display: '92%',
    description: 'Reach 90%+ blended score in array algorithms & memory layouts.',
    unlocked: true,
  },
  {
    id: 'ach-4',
    title: 'Speed Demon',
    subtitle: 'Execution Speed',
    badge_color: 'blue',
    value_display: '<5m',
    description: 'Solve any medium-tier problem in under 5 minutes.',
    unlocked: false,
  },
  {
    id: 'ach-5',
    title: 'Lab Perfectionist',
    subtitle: 'Academic Excellence',
    badge_color: 'green',
    value_display: '100%',
    description: 'Receive full marks on 5 consecutive experiment evaluations.',
    unlocked: false,
  },
  {
    id: 'ach-6',
    title: 'Centurion Flame',
    subtitle: 'Platform Legend',
    badge_color: 'fire',
    value_display: '30d',
    description: 'Complete a continuous 30-day coding and problem-solving streak.',
    unlocked: false,
  },
];

export const AchievementsCard: React.FC<AchievementsCardProps> = ({ overview }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const achievements = overview?.achievements && overview.achievements.length >= 3
    ? overview.achievements
    : DEFAULT_ACHIEVEMENTS;

  const renderBadgeIcon = (ach: any) => {
    if (ach.badge_color === 'gold' || ach.title.includes('100')) {
      return (
        <div className={`${styles.badgeIconOuter} ${styles.badgeHexGold}`}>
          <span>{ach.value_display || '100'}</span>
        </div>
      );
    }
    if (ach.badge_color === 'fire' || ach.title.includes('Streak')) {
      return (
        <div className={`${styles.badgeIconOuter} ${styles.badgeCircleFire}`}>
          <Flame size={20} fill="#ea580c" />
        </div>
      );
    }
    return (
      <div className={`${styles.badgeIconOuter} ${styles.badgeCirclePurple}`}>
        <Layers size={20} color="#7c3aed" />
      </div>
    );
  };

  return (
    <>
      <div className={styles.card}>
        <div className={styles.cardHeaderRow}>
          <div className={styles.cardTitleBlock}>
            <div className={styles.headerIconCircle} style={{ background: '#fef3c7', color: '#b45309' }}>
              <Award size={18} />
            </div>
            <div>
              <h3>Achievements</h3>
              <p>Your latest milestones.</p>
            </div>
          </div>

          <button
            type="button"
            className={styles.bottomActionLink}
            onClick={() => setIsModalOpen(true)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <span>View All</span>
            <ArrowRight size={13} />
          </button>
        </div>

        <div className={styles.achievementsRow}>
          {achievements.slice(0, 3).map((ach) => (
            <div key={ach.id} className={styles.achievementBadgeCard}>
              {renderBadgeIcon(ach)}
              <h5 className={styles.badgeTitle}>{ach.title}</h5>
              <p className={styles.badgeSubtitle}>{ach.subtitle}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── All Achievements Modal ── */}
      {isModalOpen && (
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
          onClick={() => setIsModalOpen(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '1.25rem',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '720px',
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
                marginBottom: '1.25rem',
                borderBottom: '1px solid #f1f5f9',
                paddingBottom: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div className={styles.headerIconCircle} style={{ background: '#fef3c7', color: '#b45309' }}>
                  <Award size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                    Badges & Achievements
                  </h3>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                    Track your earned credentials, speed badges, and active learning milestones.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{
                  border: 'none',
                  background: '#f1f5f9',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#64748b',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Badges Grid */}
            <div style={{ overflowY: 'auto', maxHeight: '430px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', padding: '0.25rem' }}>
              {(achievements.length >= 6 ? achievements : DEFAULT_ACHIEVEMENTS).map((ach) => (
                <div
                  key={ach.id}
                  style={{
                    background: (ach as any).unlocked === false ? '#f8fafc' : '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.85rem',
                    padding: '1.15rem 1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    gap: '0.5rem',
                    opacity: (ach as any).unlocked === false ? 0.6 : 1,
                  }}
                >
                  {renderBadgeIcon(ach)}
                  <div>
                    <h5 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{ach.title}</h5>
                    <p style={{ margin: '0.15rem 0', fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>{ach.subtitle}</p>
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.72rem', color: '#94a3b8', lineHeight: 1.35 }}>
                      {(ach as any).description || 'Milestone achieved through platform practice & lab excellence.'}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
              <Link
                href="/student/certificates"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: '#7c3aed',
                  textDecoration: 'none',
                }}
              >
                <span>View Official Certificates</span>
                <ExternalLink size={13} />
              </Link>
              <button
                onClick={() => setIsModalOpen(false)}
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
    </>
  );
};
