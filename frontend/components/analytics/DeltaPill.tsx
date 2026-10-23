'use client';

import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

/**
 * A movement indicator that only ever shows measured movement.
 *
 * Contract with the API (see app/analytics/composite.py::delta_vs_previous):
 *   delta: number | null      — null means "no comparable previous period"
 *   direction: 'up'|'down'|'flat'
 *   delta_available: boolean  — optional; defaults to delta !== null
 *
 * When there is no delta we render a neutral dash instead of a green "+0%" or
 * a hardcoded "↑ 3%" arrow.
 */
export interface DeltaPillProps {
  delta?: number | null;
  direction?: 'up' | 'down' | 'flat' | string | null;
  available?: boolean;
  /** true when a rise is good (grades); false when a rise is bad (violations). */
  higherIsBetter?: boolean;
  suffix?: string;
  /** Show "pts"/"%" after the number. */
  unit?: string;
  size?: 'sm' | 'md';
  style?: React.CSSProperties;
  className?: string;
}

export default function DeltaPill({
  delta,
  direction,
  available,
  higherIsBetter = true,
  unit = '%',
  size = 'sm',
  style,
  className,
}: DeltaPillProps) {
  const isAvailable = available ?? (typeof delta === 'number' && !Number.isNaN(delta));
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    borderRadius: 999,
    fontWeight: 700,
    fontSize: size === 'sm' ? '0.7rem' : '0.78rem',
    padding: size === 'sm' ? '2px 7px' : '3px 9px',
    whiteSpace: 'nowrap',
    ...style,
  };

  if (!isAvailable || delta === null || delta === undefined) {
    return (
      <span
        className={className}
        style={{ ...base, background: '#f3f4f6', color: '#6b7280' }}
        title="No comparable previous period"
      >
        <Minus size={11} strokeWidth={2.6} />
        <span>—</span>
      </span>
    );
  }

  const dir = direction || (delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat');
  const isPositive = dir === 'flat' ? null : (dir === 'up') === higherIsBetter;
  const palette =
    isPositive === null
      ? { background: '#f3f4f6', color: '#6b7280' }
      : isPositive
        ? { background: '#f0fdf4', color: '#16a34a' }
        : { background: '#fef2f2', color: '#dc2626' };

  const Icon = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : Minus;
  const value = Math.abs(delta);

  return (
    <span className={className} style={{ ...base, ...palette }}>
      <Icon size={11} strokeWidth={2.6} />
      <span>
        {value}
        {unit}
      </span>
    </span>
  );
}
