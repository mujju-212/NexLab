'use client';

import React, { useId } from 'react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import styles from './analytics.module.css';

interface KpiCardProps {
  label: string;
  value: string | number;
  delta?: {
    value: number; // e.g. 4.2 or -12.8
    unit?: string;  // e.g. "%" or "pts"
    label?: string; // e.g. "1,864 in previous period"
    isPositiveGood?: boolean; // default true (false for e.g. risk or drop-off)
  };
  note?: string;
  icon?: React.ReactNode;
  accentColor?: string;
  sparklineVariant?: 'purple' | 'blue' | 'red' | 'green' | 'amber';
  sparklinePoints?: number[];
}

export function KpiCard({
  label,
  value,
  delta,
  note,
  icon,
  accentColor = '#7c3aed',
  sparklineVariant,
  sparklinePoints,
}: KpiCardProps) {
  const uid = useId().replace(/:/g, '');
  const isPositiveGood = delta?.isPositiveGood ?? true;
  const isUp = delta ? delta.value > 0 : false;
  const isDown = delta ? delta.value < 0 : false;
  const isNeutral = delta ? delta.value === 0 : false;

  const isGood = delta ? (isPositiveGood ? isUp : isDown) : false;
  const isBad = delta ? (isPositiveGood ? isDown : isUp) : false;

  // Default wave path depending on variant / delta
  const isUpTrend = delta ? delta.value >= 0 : true;
  const wavePoints = sparklinePoints || (isUpTrend
    ? [28, 26, 22, 24, 18, 20, 14, 16, 10, 8]
    : [10, 12, 16, 14, 20, 18, 24, 22, 26, 28]);

  // Construct SVG smooth cubic path across 200 units width
  const step = 200 / (wavePoints.length - 1);
  const pathD = wavePoints.reduce((acc, pt, idx) => {
    if (idx === 0) return `M 0,${pt}`;
    const prevX = (idx - 1) * step;
    const prevY = wavePoints[idx - 1];
    const currX = idx * step;
    const currY = pt;
    const c1X = prevX + (currX - prevX) / 2;
    const c2X = prevX + (currX - prevX) / 2;
    return `${acc} C ${c1X},${prevY} ${c2X},${currY} ${currX},${currY}`;
  }, '');

  const areaD = `${pathD} L 200,40 L 0,40 Z`;

  return (
    <div
      className={styles.kpiCard}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: '#ffffff',
        border: '1px solid #f1f5f9',
        borderRadius: 16,
        padding: '18px 20px 22px 20px',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: 142,
      }}
    >
      {/* Top row: Icon + Label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        {icon && (
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: accentColor,
              background: `${accentColor}18`,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        )}
        <span
          style={{
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: '#475569',
            letterSpacing: '-0.01em',
          }}
        >
          {label}
        </span>
      </div>

      {/* Middle row: Big Value + Delta Badge */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, zIndex: 1 }}>
        <div
          style={{
            fontSize: '1.75rem',
            fontWeight: 800,
            color: '#0f172a',
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
          }}
        >
          {value}
        </div>
        {delta && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontSize: '0.725rem',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: 9999,
              background: isGood ? '#ecfdf5' : isBad ? '#fef2f2' : '#f8fafc',
              color: isGood ? '#059669' : isBad ? '#dc2626' : '#64748b',
              border: `1px solid ${isGood ? '#a7f3d0' : isBad ? '#fecaca' : '#e2e8f0'}`,
            }}
          >
            {isUp && <ArrowUp size={11} strokeWidth={3} />}
            {isDown && <ArrowDown size={11} strokeWidth={3} />}
            {isNeutral && <Minus size={11} strokeWidth={3} />}
            <span>
              {Math.abs(delta.value)}
              {delta.unit ?? '%'}
            </span>
          </span>
        )}
      </div>

      {/* Bottom row: Subtitle Note */}
      {(delta?.label || note) && (
        <div
          style={{
            fontSize: '0.725rem',
            color: '#94a3b8',
            marginTop: 6,
            fontWeight: 500,
            zIndex: 1,
          }}
        >
          {delta?.label || note}
        </div>
      )}

      {/* Soft Wave Sparkline SVG at the bottom */}
      <svg
        viewBox="0 0 200 40"
        preserveAspectRatio="none"
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          width: '100%',
          height: 38,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      >
        <defs>
          <linearGradient id={`spark-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accentColor} stopOpacity={0.22} />
            <stop offset="100%" stopColor={accentColor} stopOpacity={0.0} />
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#spark-${uid})`} />
        <path d={pathD} fill="none" stroke={accentColor} strokeWidth="2.2" strokeLinecap="round" opacity={0.85} />
      </svg>
    </div>
  );
}

export function KpiCardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: 16,
        marginBottom: 20,
      }}
    >
      {children}
    </div>
  );
}
