'use client';

import React from 'react';
import { Clock } from 'lucide-react';
import styles from './analytics.module.css';

interface HeatmapProps {
  title?: string;
  subtitle?: string;
  peakHours: Array<{ hour: number; session_count: number }>;
  color?: string;
}

export function Heatmap({
  title = 'Session Activity Heatmap',
  subtitle = 'Peak lab utilization by hour of the day (00:00 – 23:00)',
  peakHours,
  color = '#7c3aed',
}: HeatmapProps) {
  // Ensure all 24 hours are present
  const hourMap = new Map<number, number>();
  peakHours?.forEach(h => hourMap.set(h.hour, h.session_count));

  const maxVal = Math.max(1, ...Array.from(hourMap.values()));
  const hours = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    count: hourMap.get(i) || 0,
  }));

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleGroup}>
          <Clock size={18} className={styles.cardTitleIcon} />
          <div>
            <h3 className={styles.cardTitle}>{title}</h3>
            {subtitle && <p className={styles.cardSubtitle}>{subtitle}</p>}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 6, padding: '10px 0' }}>
        {hours.map(h => {
          const intensity = h.count / maxVal;
          const bg = h.count === 0 ? '#f3f4f6' : `${color}${Math.max(20, Math.round(intensity * 255)).toString(16).padStart(2, '0')}`;
          const isLight = intensity < 0.5;

          return (
            <div
              key={h.hour}
              className={styles.heatmapCell}
              style={{
                background: bg,
                color: isLight ? '#4b5563' : '#ffffff',
              }}
              title={`${h.hour}:00 — ${h.count} session(s)`}
            >
              {h.hour}h
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: '0.725rem', color: '#9ca3af' }}>
        <span>00:00 (Midnight)</span>
        <span>12:00 (Noon)</span>
        <span>23:00 (Night)</span>
      </div>
    </div>
  );
}
