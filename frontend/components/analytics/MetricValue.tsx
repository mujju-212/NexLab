'use client';

import React from 'react';

/**
 * Helpers for rendering a metric that may legitimately be unmeasured.
 *
 * The rule everywhere in analytics: a null from the API is printed as an em
 * dash (or a short empty-state string), never as 0, 50, "—%" or a blank gap.
 */

export function isMeasured(v: unknown): v is number {
  return typeof v === 'number' && !Number.isNaN(v);
}

export function MetricValue({
  value,
  suffix = '',
  empty = '—',
  emptyTitle,
  digits,
  className,
  style,
}: {
  value?: number | null;
  suffix?: string;
  empty?: string;
  emptyTitle?: string;
  digits?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (!isMeasured(value)) {
    return (
      <span
        className={className}
        style={{ color: '#9ca3af', ...style }}
        title={emptyTitle || 'Not enough data to measure this yet'}
      >
        {empty}
      </span>
    );
  }
  const shown = digits === undefined ? value : Number(value.toFixed(digits));
  return (
    <span className={className} style={style}>
      {shown}
      {suffix}
    </span>
  );
}

/** "1 student" / "3 students" — used by every count label. */
export function pluralize(count: number, singular: string, plural?: string): string {
  return Number(count) === 1 ? singular : plural || `${singular}s`;
}

/** Rank/percentile text that refuses to invent a position for a cohort of one. */
export function rankLabel(
  position?: number | null,
  cohortSize?: number | null,
  percentile?: number | null
): string {
  if (!position || !cohortSize) return 'Not ranked yet';
  if (cohortSize < 2) return 'Only student in cohort';
  if (typeof percentile === 'number' && cohortSize >= 5) return `Top ${Math.max(1, Math.round(100 - percentile))}%`;
  return `#${position} of ${cohortSize} ${pluralize(cohortSize, 'student')}`;
}

/** "0 / 0" is not a progress figure; show a dash instead. */
export function FractionValue({
  numerator,
  denominator,
  suffix = '',
}: {
  numerator?: number | null;
  denominator?: number | null;
  suffix?: string;
}) {
  if (!isMeasured(numerator) || !isMeasured(denominator) || denominator === 0) {
    return <span style={{ color: '#9ca3af' }}>—</span>;
  }
  return (
    <span>
      {numerator}
      {suffix} / {denominator}
      {suffix}
    </span>
  );
}
