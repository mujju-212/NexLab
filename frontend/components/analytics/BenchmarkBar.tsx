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
  ReferenceLine,
  Cell,
} from 'recharts';
import { Award } from 'lucide-react';
import styles from './analytics.module.css';

interface BenchmarkBarProps {
  title?: string;
  subtitle?: string;
  data: Array<{
    name: string;
    value: number;
    z_score?: number;
    percentile?: number;
    delta?: number;
  }>;
  baselineMean?: number;
  baselineLabel?: string;
  height?: number;
  yUnit?: string;
}

export function BenchmarkBar({
  title = 'Cohort Benchmark vs Baseline',
  subtitle = 'Comparison across entities relative to campus baseline mean',
  data,
  baselineMean = 50,
  baselineLabel = 'Campus Baseline Mean',
  height = 320,
  yUnit = '',
}: BenchmarkBarProps) {
  if (!data || !data.length) {
    return null;
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleGroup}>
          <Award size={18} className={styles.cardTitleIcon} />
          <div>
            <h3 className={styles.cardTitle}>{title}</h3>
            {subtitle && <p className={styles.cardSubtitle}>{subtitle}</p>}
          </div>
        </div>
      </div>

      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 15, right: 15, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis
              dataKey="name"
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
                `${val}${yUnit} (${item.payload.z_score !== undefined ? `z: ${item.payload.z_score > 0 ? '+' : ''}${item.payload.z_score}` : ''})`,
                'Performance',
              ]}
              labelStyle={{ fontWeight: 700, color: '#111827' }}
            />
            {baselineMean !== undefined && (
              <ReferenceLine
                y={baselineMean}
                stroke="#ef4444"
                strokeDasharray="4 4"
                strokeWidth={2}
                label={{
                  value: `${baselineLabel} (${(baselineMean ?? 0).toFixed(1)}${yUnit})`,
                  position: 'insideTopRight',
                  fill: '#ef4444',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              />
            )}
            <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={38}>
              {data.map((entry, index) => {
                const isAbove = entry.value >= baselineMean;
                return (
                  <Cell
                    key={`bm-cell-${index}`}
                    fill={isAbove ? '#10b981' : '#f59e0b'}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
