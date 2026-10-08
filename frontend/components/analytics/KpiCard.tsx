'use client';

import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import styles from './analytics.module.css';

interface KpiCardProps {
  label: string;
  value: string | number;
  delta?: {
    value: number; // e.g. 5.4 or -2.1
    unit?: string;  // e.g. "%" or "pts"
    label?: string; // e.g. "vs prev period"
    isPositiveGood?: boolean; // default true (false for e.g. risk or drop-off)
  };
  note?: string;
  icon?: React.ReactNode;
  accentColor?: string;
}

export function KpiCard({
  label,
  value,
  delta,
  note,
  icon,
  accentColor,
}: KpiCardProps) {
  const isPositiveGood = delta?.isPositiveGood ?? true;
  const isUp = delta ? delta.value > 0 : false;
  const isDown = delta ? delta.value < 0 : false;
  const isNeutral = delta ? delta.value === 0 : false;

  const isGood = delta ? (isPositiveGood ? isUp : isDown) : false;
  const isBad = delta ? (isPositiveGood ? isDown : isUp) : false;

  return (
    <div className={styles.kpiCard} style={accentColor ? { borderTop: `3px solid ${accentColor}` } : undefined}>
      <div className={styles.kpiTop}>
        <span className={styles.kpiLabel}>{label}</span>
        {icon && (
          <div
            className={styles.kpiIconWrapper}
            style={accentColor ? { color: accentColor, background: `${accentColor}14` } : undefined}
          >
            {icon}
          </div>
        )}
      </div>

      <div className={styles.kpiValueRow}>
        <span className={styles.kpiValue} style={accentColor ? { color: accentColor } : undefined}>
          {value}
        </span>
        {delta && (
          <span
            className={`${styles.kpiDeltaBadge} ${
              isNeutral
                ? styles.kpiDeltaNeutral
                : isGood
                ? styles.kpiDeltaPos
                : isBad
                ? styles.kpiDeltaNeg
                : styles.kpiDeltaNeutral
            }`}
          >
            {isUp && <ArrowUpRight size={12} strokeWidth={2.5} />}
            {isDown && <ArrowDownRight size={12} strokeWidth={2.5} />}
            {isNeutral && <Minus size={12} strokeWidth={2.5} />}
            <span>
              {delta.value > 0 ? `+${delta.value}` : delta.value}
              {delta.unit ?? '%'}
            </span>
          </span>
        )}
      </div>

      {(delta?.label || note) && (
        <span className={styles.kpiNote}>
          {delta?.label ? delta.label : note}
        </span>
      )}
    </div>
  );
}

export function KpiCardGrid({ children }: { children: React.ReactNode }) {
  return <div className={styles.kpiGrid}>{children}</div>;
}
