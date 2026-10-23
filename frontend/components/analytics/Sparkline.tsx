'use client';

import React from 'react';

/**
 * The one sparkline in the app.
 *
 * Guards that the 9 previous copies did not:
 *  - < 2 real points  -> renders nothing (no more `d="M "` console errors)
 *  - null / undefined points are treated as gaps, not zeroes
 *  - a flat series still renders (a real flat line is information)
 *
 * Any caller that has no real series simply passes [] and gets nothing back.
 */
export interface SparklineProps {
  points?: Array<number | null> | null;
  color?: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
  fill?: boolean;
  className?: string;
  /** Rendered instead of the svg when there is nothing real to draw. */
  emptyLabel?: React.ReactNode;
}

export default function Sparkline({
  points,
  color = '#7c3aed',
  width = 84,
  height = 28,
  strokeWidth = 2.2,
  fill = false,
  className,
  emptyLabel = null,
}: SparklineProps) {
  const real = (points || []).filter((p): p is number => typeof p === 'number' && !Number.isNaN(p));

  if (real.length < 2) return <>{emptyLabel}</>;

  const min = Math.min(...real);
  const max = Math.max(...real);
  const range = max - min || 1;
  const padY = 3;
  const plotH = height - padY * 2;

  const stepX = width / Math.max(1, real.length - 1);
  const coords = real.map((v, i) => {
    const x = i * stepX;
    const y = padY + plotH - ((v - min) / range) * plotH;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const line = `M ${coords.join(' L ')}`;
  const area = `${line} L ${width},${height} L 0,${height} Z`;
  const gradientId = `spark-${color.replace('#', '')}-${width}-${height}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={{ overflow: 'visible' }}
      role="img"
      aria-label="trend"
    >
      {fill && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {fill && <path d={area} fill={`url(#${gradientId})`} stroke="none" />}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
