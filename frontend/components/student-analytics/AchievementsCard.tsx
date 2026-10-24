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

export const AchievementsCard: React.FC<AchievementsCardProps> = ({ overview }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const achievements = overview?.achievements ?? [];

  const renderBadgeIcon = (ach: any) => {
    if (ach.badge_color === 'gold' || ach.title?.includes('100')) {
      return (
        <div className={`${styles.badgeIconOuter} ${styles.badgeHexGold}`}>
          <span>{ach.value_display || '✓'}</span>
        </div>
      );
    }
    if (ach.badge_color === 'fire' || ach.title?.includes('Streak')) {
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
          {achievements.length === 0 ? (
            <p style={{ color: '#64748b', padding: '0.75rem' }}>No earned badges yet.</p>
          ) : achievements.slice(0, 3).map((ach) => (
            <div key={ach.id} className={styles.achievementBadgeCard}>
              {renderBadgeIcon(ach)}
              <h5 className={styles.badgeTitle}>{ach.title || 'Earned badge'}</h5>
              <p className={styles.badgeSubtitle}>{ach.subtitle || ''}</p>
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
              {achievements.length === 0 ? (
                <p style={{ color: '#64748b', textAlign: 'center', gridColumn: '1 / -1', padding: '2rem' }}>No earned badges yet.</p>
              ) : achievements.map((ach) => (
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
                      {(ach as any).description || (ach as any).desc || ''}
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
