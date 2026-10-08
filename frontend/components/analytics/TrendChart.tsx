'use client';

import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { CHART_PALETTE } from '@/lib/analytics-utils';
import styles from './analytics.module.css';

export interface TrendSeries {
  key: string;
  name: string;
  color?: string;
  type?: 'area' | 'line';
  yAxisId?: string;
  unit?: string;
}

interface TrendChartProps {
  title?: string;
  subtitle?: string;
  data: Record<string, any>[];
  xKey?: string;
  series: TrendSeries[];
  height?: number;
  icon?: React.ReactNode;
  rightAction?: React.ReactNode;
}

export function TrendChart({
  title,
  subtitle,
  data,
  xKey = 'period',
  series,
  height = 320,
  icon,
  rightAction,
}: TrendChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className={styles.card}>
        {title && (
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleGroup}>
              {icon || <TrendingUp size={18} className={styles.cardTitleIcon} />}
              <div>
                <h3 className={styles.cardTitle}>{title}</h3>
                {subtitle && <p className={styles.cardSubtitle}>{subtitle}</p>}
              </div>
            </div>
          </div>
        )}
        <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
          No trend data recorded for this time range.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      {(title || rightAction) && (
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleGroup}>
            {icon || <TrendingUp size={18} className={styles.cardTitleIcon} />}
            <div>
              {title && <h3 className={styles.cardTitle}>{title}</h3>}
              {subtitle && <p className={styles.cardSubtitle}>{subtitle}</p>}
            </div>
          </div>
          {rightAction && <div>{rightAction}</div>}
        </div>
      )}

      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              {series.map((s, idx) => {
                const color = s.color || CHART_PALETTE[idx % CHART_PALETTE.length];
                return (
                  <linearGradient key={`grad-${s.key}`} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.0} />
                  </linearGradient>
                );
              })}
            </defs>
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
              labelStyle={{ fontWeight: 700, color: '#111827' }}
            />
            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              wrapperStyle={{ fontSize: 12, paddingBottom: 10 }}
            />
            {series.map((s, idx) => {
              const color = s.color || CHART_PALETTE[idx % CHART_PALETTE.length];
              return (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stroke={color}
                  strokeWidth={2.5}
                  fill={`url(#grad-${s.key})`}
                  dot={{ r: 3, fill: color }}
                  activeDot={{ r: 5 }}
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
