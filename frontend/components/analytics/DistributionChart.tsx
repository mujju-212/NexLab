'use client';

import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { CHART_PALETTE } from '@/lib/analytics-utils';
import styles from './analytics.module.css';

interface DistributionChartProps {
  title?: string;
  subtitle?: string;
  data: Array<{ label: string; count: number; pct?: number; color?: string }>;
  xKey?: string;
  yKey?: string;
  barColor?: string;
  height?: number;
  icon?: React.ReactNode;
}

export function DistributionChart({
  title,
  subtitle,
  data,
  xKey = 'label',
  yKey = 'count',
  barColor = '#7c3aed',
  height = 300,
  icon,
}: DistributionChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className={styles.card}>
        {title && (
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleGroup}>
              {icon || <BarChart3 size={18} className={styles.cardTitleIcon} />}
              <h3 className={styles.cardTitle}>{title}</h3>
            </div>
          </div>
        )}
        <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
          No distribution records available.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      {title && (
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleGroup}>
            {icon || <BarChart3 size={18} className={styles.cardTitleIcon} />}
            <div>
              <h3 className={styles.cardTitle}>{title}</h3>
              {subtitle && <p className={styles.cardSubtitle}>{subtitle}</p>}
            </div>
          </div>
        </div>
      )}

      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis
              dataKey={xKey}
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#6b7280', fontSize: 11 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#9ca3af', fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{
                background: '#ffffff',
                borderRadius: 10,
                border: '1px solid #ede9fe',
                boxShadow: '0 4px 16px rgba(124,58,237,0.08)',
                fontSize: 12,
              }}
              formatter={(val: any, name: any, item: any) => [
                `${val} (${item.payload.pct ?? 0}%)`,
                'Students',
              ]}
              labelStyle={{ fontWeight: 700, color: '#111827' }}
            />
            <Bar dataKey={yKey} radius={[6, 6, 0, 0]} maxBarSize={38}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color || CHART_PALETTE[index % CHART_PALETTE.length] || barColor}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
