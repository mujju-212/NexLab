'use client';

import React from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts';
import { PieChart as PieIcon } from 'lucide-react';
import { CHART_PALETTE } from '@/lib/analytics-utils';
import styles from './analytics.module.css';

interface DonutChartProps {
  title?: string;
  subtitle?: string;
  data: Array<{ name: string; value: number; color?: string; pct?: number }>;
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  centerLabel?: { title: string; subtitle?: string };
  icon?: React.ReactNode;
}

export function DonutChart({
  title,
  subtitle,
  data,
  height = 300,
  innerRadius = 60,
  outerRadius = 90,
  centerLabel,
  icon,
}: DonutChartProps) {
  if (!data || data.length === 0 || data.every(d => d.value === 0)) {
    return (
      <div className={styles.card}>
        {title && (
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleGroup}>
              {icon || <PieIcon size={18} className={styles.cardTitleIcon} />}
              <h3 className={styles.cardTitle}>{title}</h3>
            </div>
          </div>
        )}
        <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
          No breakdown data recorded.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      {title && (
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleGroup}>
            {icon || <PieIcon size={18} className={styles.cardTitleIcon} />}
            <div>
              <h3 className={styles.cardTitle}>{title}</h3>
              {subtitle && <p className={styles.cardSubtitle}>{subtitle}</p>}
            </div>
          </div>
        </div>
      )}

      <div style={{ width: '100%', height, position: 'relative' }}>
        {centerLabel && (
          <div
            style={{
              position: 'absolute',
              top: '42%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              pointerEvents: 'none',
            }}
          >
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#111827', lineHeight: 1.1 }}>
              {centerLabel.title}
            </div>
            {centerLabel.subtitle && (
              <div style={{ fontSize: '0.725rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>
                {centerLabel.subtitle}
              </div>
            )}
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="45%"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              paddingAngle={3}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color || CHART_PALETTE[index % CHART_PALETTE.length]}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: '#ffffff',
                borderRadius: 10,
                border: '1px solid #ede9fe',
                boxShadow: '0 4px 16px rgba(124,58,237,0.08)',
                fontSize: 12,
              }}
            />
            <Legend
              verticalAlign="bottom"
              align="center"
              iconType="circle"
              wrapperStyle={{ fontSize: 12, paddingTop: 10 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
