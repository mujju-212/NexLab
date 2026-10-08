'use client';

import React from 'react';
import { Layers } from 'lucide-react';
import styles from './analytics.module.css';

interface RiskComponent {
  name: string;
  weight: number; // e.g. 0.25 (25%)
  value: number;  // e.g. 35 (out of 100)
  penalty: number; // e.g. 16.25 points of risk
  contribution_pct: number; // e.g. 38.5% of total risk
  color?: string;
}

interface RiskBreakdownBarProps {
  title?: string;
  subtitle?: string;
  components: Record<string, { weight: number; value: number; penalty: number; contribution_pct: number }> | RiskComponent[];
}

export function RiskBreakdownBar({
  title = 'Risk Driver Breakdown',
  subtitle = 'Component penalties contributing to the risk score',
  components,
}: RiskBreakdownBarProps) {
  // Normalize dictionary or array
  const list: RiskComponent[] = Array.isArray(components)
    ? components
    : Object.entries(components).map(([k, v]) => ({
        name: k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        weight: v.weight,
        value: v.value,
        penalty: v.penalty,
        contribution_pct: v.contribution_pct,
      }));

  if (!list.length) {
    return null;
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleGroup}>
          <Layers size={18} className={styles.cardTitleIcon} />
          <div>
            <h3 className={styles.cardTitle}>{title}</h3>
            {subtitle && <p className={styles.cardSubtitle}>{subtitle}</p>}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {list.map((c, i) => {
          const isHighPenalty = c.contribution_pct >= 25;
          const barColor = isHighPenalty ? '#ef4444' : c.contribution_pct >= 15 ? '#f59e0b' : '#7c3aed';

          return (
            <div key={`comp-${i}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.8125rem' }}>
                <span style={{ fontWeight: 600, color: '#1f2937' }}>
                  {c.name}
                  <span style={{ color: '#9ca3af', fontWeight: 400, marginLeft: 6 }}>
                    ({Math.round(c.weight * 100)}% weight · healthy: {Math.round(c.value)}/100)
                  </span>
                </span>
                <span style={{ fontWeight: 700, color: barColor }}>
                  +{(c.penalty ?? 0).toFixed(1)} pts ({Math.round(c.contribution_pct ?? 0)}% risk)
                </span>
              </div>
              <div
                style={{
                  height: 8,
                  width: '100%',
                  background: '#f3f4f6',
                  borderRadius: 9999,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(100, Math.max(0, c.contribution_pct))}%`,
                    background: barColor,
                    borderRadius: 9999,
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
