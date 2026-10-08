'use client';

import React from 'react';
import { Filter, ArrowDown } from 'lucide-react';
import styles from './analytics.module.css';

interface FunnelStage {
  name: string;
  key: string;
  count: number;
  pct: number;
  drop_off_pct: number;
  drop_off_count: number;
  description?: string;
}

interface FunnelChartProps {
  title?: string;
  subtitle?: string;
  stages: FunnelStage[];
  totalEnrolled?: number;
}

export function FunnelChart({
  title = 'Student Progression Funnel',
  subtitle = 'Monotonic progression stages from enrolment to concept mastery',
  stages,
  totalEnrolled,
}: FunnelChartProps) {
  if (!stages || !stages.length) {
    return null;
  }

  const baseCount = totalEnrolled ?? (stages[0]?.count || 1);

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleGroup}>
          <Filter size={18} className={styles.cardTitleIcon} />
          <div>
            <h3 className={styles.cardTitle}>{title}</h3>
            {subtitle && <p className={styles.cardSubtitle}>{subtitle}</p>}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 0' }}>
        {stages.map((stage, idx) => {
          const stagePct = Number.isFinite(stage.pct)
            ? Math.round(stage.pct)
            : Math.round((stage.count / Math.max(1, baseCount)) * 100);
          const dropOffPct = Number.isFinite(stage.drop_off_pct)
            ? Math.round(stage.drop_off_pct)
            : 0;
          const widthPct = Math.max(12, Math.min(100, (stage.count / Math.max(1, baseCount)) * 100));
          const stageColors = ['#7c3aed', '#06b6d4', '#3b82f6', '#10b981', '#14b8a6'];
          const color = stageColors[idx % stageColors.length];

          return (
            <div key={stage.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827' }}>
                  {stage.name}
                  <span style={{ color: '#6b7280', fontWeight: 500, fontSize: '0.785rem', marginLeft: 6 }}>
                    ({stage.count.toLocaleString()} students · {stagePct}% of cohort)
                  </span>
                </span>
                {idx > 0 && stage.drop_off_count > 0 && (
                  <span style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 600 }}>
                    ▼ Drop-off: -{stage.drop_off_count} ({dropOffPct}%)
                  </span>
                )}
              </div>

              <div
                style={{
                  height: 38,
                  width: '100%',
                  background: '#f9fafb',
                  borderRadius: 8,
                  overflow: 'hidden',
                  position: 'relative',
                  border: '1px solid #f3f4f6',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${widthPct}%`,
                    background: `linear-gradient(90deg, ${color}dd 0%, ${color} 100%)`,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 14,
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    transition: 'width 0.6s ease',
                  }}
                >
                  {stagePct}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
