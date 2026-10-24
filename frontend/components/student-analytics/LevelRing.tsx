'use client';

import React from 'react';

interface LevelRingProps {
  level: number | null;
  levelName?: string | null;
  currentXp?: number | null;
  nextXp?: number | null;
  size?: number;
  strokeWidth?: number;
}

export const LevelRing: React.FC<LevelRingProps> = ({
  level,
  levelName,
  currentXp,
  nextXp,
  size = 64,
  strokeWidth = 6,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const hasProgress = currentXp != null && nextXp != null && nextXp > 0;
  const progress = hasProgress ? Math.min(1, Math.max(0, currentXp / nextXp)) : 0;
  const strokeDashoffset = circumference - progress * circumference;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.75rem',
      }}
    >
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#e2e8f0"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="url(#levelGradient)"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
          <defs>
            <linearGradient id="levelGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
          </defs>
        </svg>

        {/* Center label */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.75rem',
            fontWeight: 800,
            color: '#0f172a',
            lineHeight: 1,
          }}
        >
          <span>Lv {level ?? '—'}</span>
          <span style={{ fontSize: '0.6rem', color: '#64748b', marginTop: '2px' }}>
            {hasProgress ? `${Math.round(progress * 100)}%` : '—'}
          </span>
        </div>
      </div>

      <div>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
          {level != null ? `Level ${level}` : 'Level unavailable'}{levelName ? ` · ${levelName}` : ''}
        </div>
        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '1px' }}>
          {hasProgress ? `${currentXp.toLocaleString()} / ${nextXp.toLocaleString()} XP` : 'XP progress unavailable'}
        </div>
      </div>
    </div>
  );
};
