'use client';

import React from 'react';
import { ShieldAlert, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { riskColor, riskBandLabel } from '@/lib/analytics-utils';
import styles from './analytics.module.css';

interface RiskGaugeProps {
  score: number; // 0..100
  band?: 'critical' | 'high' | 'watch' | 'ok';
  primaryReason?: string;
  trendArrow?: string;
  title?: string;
  subtitle?: string;
  size?: number; // default 200
}

export function RiskGauge({
  score,
  band,
  primaryReason,
  trendArrow,
  title = 'Unified Risk Score',
  subtitle = 'Composite weighted health index (0–100)',
  size = 200,
}: RiskGaugeProps) {
  const boundedScore = Math.max(0, Math.min(100, Math.round(score)));
  const color = riskColor(boundedScore);
  const bandInfo = riskBandLabel(band || (boundedScore >= 70 ? 'critical' : boundedScore >= 50 ? 'high' : boundedScore >= 30 ? 'watch' : 'ok'));

  // SVG Gauge calculations
  const strokeWidth = 14;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = Math.PI * radius; // Half circle (180 deg)
  const strokeDashoffset = circumference - (boundedScore / 100) * circumference;

  return (
    <div className={styles.card} style={{ textAlign: 'center' }}>
      <div className={styles.cardHeader} style={{ justifyContent: 'center' }}>
        <div>
          <h3 className={styles.cardTitle}>{title}</h3>
          {subtitle && <p className={styles.cardSubtitle}>{subtitle}</p>}
        </div>
      </div>

      <div style={{ position: 'relative', width: size, height: size / 1.7, margin: '0 auto' }}>
        <svg
          width={size}
          height={size / 1.5}
          viewBox={`0 0 ${size} ${size / 1.5}`}
          style={{ overflow: 'visible' }}
        >
          {/* Background track arc */}
          <path
            d={`M ${strokeWidth} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth} ${size / 2}`}
            fill="none"
            stroke="#f3f4f6"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Active score arc */}
          <path
            d={`M ${strokeWidth} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth} ${size / 2}`}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.8s ease' }}
          />
        </svg>

        {/* Central score overlay */}
        <div
          style={{
            position: 'absolute',
            bottom: 4,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: '2.5rem', fontWeight: 800, color, lineHeight: 1 }}>
              {boundedScore}
            </span>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#9ca3af' }}>/100</span>
          </div>

          <div
            style={{
              marginTop: 6,
              background: bandInfo.bg,
              color: bandInfo.color,
              padding: '2px 10px',
              borderRadius: 9999,
              fontSize: '0.75rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {trendArrow && <span>{trendArrow}</span>}
            <span>{bandInfo.label}</span>
          </div>
        </div>
      </div>

      {primaryReason && (
        <div
          style={{
            marginTop: 18,
            padding: '8px 12px',
            background: '#faf5ff',
            border: '1px solid #ede9fe',
            borderRadius: 8,
            fontSize: '0.8125rem',
            color: '#4b5563',
          }}
        >
          <strong style={{ color: '#7c3aed' }}>Primary Driver:</strong> {primaryReason}
        </div>
      )}
    </div>
  );
}
