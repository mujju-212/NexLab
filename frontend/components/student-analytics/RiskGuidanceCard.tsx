'use client';

import React from 'react';
import { HeartPulse, CheckCircle2, AlertCircle, Lightbulb, Info } from 'lucide-react';
import { riskBandLabel } from '@/lib/analytics-utils';
import styles from './student-analytics.module.css';

interface RiskGuidanceCardProps {
  band?: 'ok' | 'watch' | 'high' | 'critical' | string;
  primaryReason?: string;
  suggestions?: string[];
  isSufficient?: boolean;
}

export const RiskGuidanceCard: React.FC<RiskGuidanceCardProps> = ({
  band = 'ok',
  primaryReason = 'Consistent academic engagement and timely lab submissions recorded.',
  suggestions = [
    'Maintain regular attendance in upcoming scheduled sessions.',
    'Review pre-lab viva topics to keep concept comprehension sharp.',
  ],
  isSufficient = true,
}) => {
  const meta = riskBandLabel(band);

  if (!isSufficient) {
    return (
      <div
        className={styles.card}
        style={{
          borderStyle: 'dashed',
          background: '#f8fafc',
          opacity: 0.8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', color: '#64748b' }}>
          <Info size={18} />
          <div>
            <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>
              Guidance Calibration in Progress
            </h4>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem' }}>
              Not enough lab submissions collected yet to formulate personal trajectory recommendations.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const gentleBandLabel =
    band === 'ok'
      ? 'On Track ✓'
      : band === 'watch'
      ? 'Needs Steady Focus'
      : 'Action Recommended';

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleWrap}>
          <div className={styles.cardIconBox} style={{ background: meta.bg, color: meta.color }}>
            <HeartPulse size={20} />
          </div>
          <div>
            <h3 className={styles.cardTitle}>Academic Standing & Learning Guidance</h3>
            <p className={styles.cardSubtitle}>
              Pedagogical feedback focused on momentum, concept comprehension, and next steps
            </p>
          </div>
        </div>

        <span
          className={styles.trackPill}
          style={{ background: meta.bg, color: meta.color }}
        >
          {band === 'ok' ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
          {gentleBandLabel}
        </span>
      </div>

      <div
        style={{
          padding: '0.875rem 1rem',
          borderRadius: '0.75rem',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          marginBottom: '1rem',
        }}
      >
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.25rem' }}>
          Current State Assessment:
        </div>
        <p style={{ margin: 0, fontSize: '0.875rem', color: '#1e293b', lineHeight: 1.5 }}>
          {primaryReason}
        </p>
      </div>

      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            fontSize: '0.825rem',
            fontWeight: 700,
            color: '#0f172a',
            marginBottom: '0.5rem',
          }}
        >
          <Lightbulb size={15} color="#eab308" />
          <span>Recommended Next Actions:</span>
        </div>
        <ul
          style={{
            margin: 0,
            paddingLeft: '1.2rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
          }}
        >
          {suggestions.map((s, idx) => (
            <li key={idx} style={{ fontSize: '0.825rem', color: '#334155', lineHeight: 1.4 }}>
              {s}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
