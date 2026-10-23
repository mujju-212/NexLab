'use client';

import React from 'react';

interface CompletionRingProps {
  completed: number;
  total: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  color?: string;
}

export const CompletionRing: React.FC<CompletionRingProps> = ({
  completed,
  total,
  size = 54,
  strokeWidth = 5,
  label,
  color = '#7c3aed',
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = total > 0 ? Math.min(1, Math.max(0, completed / total)) : 0;
  const strokeDashoffset = circumference - pct * circumference;

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#f1f5f9"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.72rem',
            fontWeight: 800,
            color: '#0f172a',
          }}
        >
          {total > 0 ? `${Math.round(pct * 100)}%` : '—'}
        </div>
      </div>

      {label && (
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>{label}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
            {completed} of {total} completed
          </div>
        </div>
      )}
    </div>
  );
};
