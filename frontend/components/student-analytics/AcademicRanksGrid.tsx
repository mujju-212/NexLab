'use client';

import React from 'react';
import { Award, Trophy, Users, Shield, Building2 } from 'lucide-react';
import type { UnifiedRanksResponse } from '@/services/student-analytics.service';
import styles from './student-analytics.module.css';

interface AcademicRanksGridProps {
  ranks:
    | Record<
        string,
        {
          position: number;
          cohort_size: number;
          percentile: number;
          rank_score: number;
          components?: Record<string, number>;
        }
      >
    | undefined;
}


export const AcademicRanksGrid: React.FC<AcademicRanksGridProps> = ({ ranks }) => {
  const scopeMeta: Record<string, { label: string; icon: React.ReactNode }> = {
    section: { label: 'Section Standing', icon: <Users size={16} /> },
    subject: { label: 'Subject Standing', icon: <Trophy size={16} /> },
    year: { label: 'Batch / Year Standing', icon: <Award size={16} /> },
    department: { label: 'Department Standing', icon: <Building2 size={16} /> },
    institution: { label: 'Institution-Wide Standing', icon: <Shield size={16} /> },
  };

  const rankEntries = Object.entries(ranks || {});

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleWrap}>
          <div className={styles.cardIconBox} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
            <Award size={20} />
          </div>
          <div>
            <h2 className={styles.cardTitle}>Multi-Scope Academic Standing</h2>
            <p className={styles.cardSubtitle}>
              Holistic academic rankings evaluated across Section, Subject, Batch, Department, and Institution
            </p>
          </div>
        </div>
        <span className={styles.metaBadge}>
          5-Factor Composite Score
        </span>
      </div>

      {rankEntries.length === 0 ? (
        <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
          No academic ranking snapshots calculated yet for this cohort.
        </p>
      ) : (
        <div className={styles.ranksGrid}>
          {rankEntries.map(([scope, data]) => {
            const meta = scopeMeta[scope.toLowerCase()] || {
              label: `${scope.toUpperCase()} Standing`,
              icon: <Award size={16} />,
            };
            const topPct = Math.max(1, 100 - (data.percentile ?? 90));
            return (
              <div key={scope} className={styles.rankCard}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div className={styles.rankScope}>{meta.label}</div>
                  <div style={{ color: '#7c3aed' }}>{meta.icon}</div>
                </div>

                <div className={styles.rankNumberRow}>
                  <div className={styles.rankBig}>#{data.position}</div>
                  <div className={styles.rankTotal}>of {data.cohort_size} students</div>
                </div>

                <div className={styles.rankPercentile}>
                  <span>Top {topPct}%</span>
                </div>

                {data.components && (
                  <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748b' }}>
                      <span>Score: {Math.round(data.rank_score)} pts</span>
                      <span>Mastery: {Math.round(data.components.mastery || 0)}</span>
                    </div>
                    {/* 5-component mini balance bar */}
                    <div
                      style={{
                        display: 'flex',
                        height: '4px',
                        borderRadius: '9999px',
                        overflow: 'hidden',
                        background: '#e2e8f0',
                      }}
                    >
                      <div style={{ width: '30%', background: '#7c3aed' }} title="Mastery (30%)" />
                      <div style={{ width: '20%', background: '#3b82f6' }} title="Engagement (20%)" />
                      <div style={{ width: '20%', background: '#10b981' }} title="Effort (20%)" />
                      <div style={{ width: '15%', background: '#f59e0b' }} title="Efficiency (15%)" />
                      <div style={{ width: '15%', background: '#ec4899' }} title="Consistency (15%)" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
