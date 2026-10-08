'use client';

import React, { useMemo } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import styles from './analytics.module.css';
import { type StruggleQuadrantData } from '@/services/analytics.service';
import { Users, TrendingUp, AlertTriangle, Zap, CheckCircle2 } from 'lucide-react';

interface StruggleQuadrantProps {
  data?: StruggleQuadrantData | null;
  onSelectStudent?: (studentId: string) => void;
  title?: string;
  subtitle?: string;
}

const QUADRANT_COLORS = {
  thriving: '#10b981',   // Emerald
  struggling: '#ef4444', // Red (High Effort, Low Outcome)
  coasting: '#3b82f6',   // Blue (Low Effort, High Outcome)
  disengaged: '#f59e0b', // Amber (Low Effort, Low Outcome)
};

export function StruggleQuadrant({
  data,
  onSelectStudent,
  title = 'Effort vs. Outcome (Struggle Quadrant)',
  subtitle = 'Cohort median split partitioning students into Thriving, Grinding/Struggling, Coasting, and Disengaged',
}: StruggleQuadrantProps) {
  const medians = data?.medians || { effort: 50, outcome: 50 };
  const students = data?.students || [];

  const counts = useMemo(() => {
    const c = { thriving: 0, struggling: 0, coasting: 0, disengaged: 0 };
    students.forEach((s) => {
      if (s.quadrant in c) c[s.quadrant]++;
    });
    return c;
  }, [students]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length && payload[0]?.payload) {
      const p = payload[0].payload;
      const color = QUADRANT_COLORS[p.quadrant as keyof typeof QUADRANT_COLORS] || '#7c3aed';
      return (
        <div
          style={{
            background: 'rgba(17, 24, 39, 0.95)',
            backdropFilter: 'blur(8px)',
            color: '#fff',
            padding: '10px 14px',
            borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            border: `1px solid ${color}`,
            fontSize: '12px',
            minWidth: '180px',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px' }}>
            {p.full_name}
          </div>
          {p.roll_number && (
            <div style={{ color: '#9ca3af', marginBottom: '6px' }}>Roll: {p.roll_number}</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
            <span style={{ color: '#d1d5db' }}>Effort:</span>
            <span style={{ fontWeight: 600 }}>{Math.round(p.effort)}%</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ color: '#d1d5db' }}>Grade:</span>
            <span style={{ fontWeight: 600 }}>{Math.round(p.outcome)}%</span>
          </div>
          <div
            style={{
              padding: '3px 8px',
              borderRadius: '6px',
              background: `${color}25`,
              color: color,
              fontWeight: 700,
              textTransform: 'capitalize',
              textAlign: 'center',
            }}
          >
            {p.quadrant === 'struggling' ? 'Grinding / Struggling' : p.quadrant}
          </div>
          <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '6px', textAlign: 'center' }}>
            Click point to view Student 360
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={styles.card} style={{ position: 'relative' }}>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>{title}</h3>
          <p className={styles.cardSubtitle}>{subtitle}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <span
            className={styles.badge}
            style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }}
          >
            <CheckCircle2 size={12} /> Thriving: {counts.thriving}
          </span>
          <span
            className={styles.badge}
            style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}
          >
            <AlertTriangle size={12} /> Struggling: {counts.struggling}
          </span>
          <span
            className={styles.badge}
            style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}
          >
            <Zap size={12} /> Coasting: {counts.coasting}
          </span>
          <span
            className={styles.badge}
            style={{ background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a' }}
          >
            <TrendingUp size={12} /> Disengaged: {counts.disengaged}
          </span>
        </div>
      </div>

      <div style={{ height: 380, width: '100%', position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 30, bottom: 25, left: 15 }}>
            <XAxis
              type="number"
              dataKey="effort"
              name="Effort"
              domain={[0, 100]}
              unit="%"
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              label={{
                value: 'Effort (Time on Task, Attempts, Practice) →',
                position: 'insideBottom',
                offset: -12,
                fill: '#6b7280',
                fontSize: 12,
                fontWeight: 600,
              }}
            />
            <YAxis
              type="number"
              dataKey="outcome"
              name="Outcome"
              domain={[0, 100]}
              unit="%"
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              label={{
                value: 'Outcome (Final Assessment Grade) →',
                angle: -90,
                position: 'insideLeft',
                offset: 5,
                fill: '#6b7280',
                fontSize: 12,
                fontWeight: 600,
              }}
            />
            <ZAxis range={[60, 60]} />
            <Tooltip content={<CustomTooltip />} />

            {/* Median Partition Lines */}
            <ReferenceLine
              x={medians.effort}
              stroke="#9ca3af"
              strokeDasharray="4 4"
              label={{
                value: `Effort Median (${Math.round(medians.effort)}%)`,
                position: 'top',
                fill: '#6b7280',
                fontSize: 10,
              }}
            />
            <ReferenceLine
              y={medians.outcome}
              stroke="#9ca3af"
              strokeDasharray="4 4"
              label={{
                value: `Outcome Median (${Math.round(medians.outcome)}%)`,
                position: 'right',
                fill: '#6b7280',
                fontSize: 10,
              }}
            />

            <Scatter
              name="Students"
              data={students}
              onClick={(e) => {
                if (e && e.student_id && onSelectStudent) {
                  onSelectStudent(e.student_id);
                }
              }}
              style={{ cursor: onSelectStudent ? 'pointer' : 'default' }}
            >
              {students.map((entry, idx) => (
                <Cell
                  key={`cell-${idx}`}
                  fill={QUADRANT_COLORS[entry.quadrant] || '#7c3aed'}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '8px',
          marginTop: '12px',
          paddingTop: '12px',
          borderTop: '1px solid #f3f4f6',
          fontSize: '11px',
          color: '#6b7280',
          textAlign: 'center',
        }}
      >
        <div>
          <span style={{ fontWeight: 700, color: '#2563eb' }}>Coasting</span>: Low Effort, High Grade (needs challenge)
        </div>
        <div>
          <span style={{ fontWeight: 700, color: '#059669' }}>Thriving</span>: High Effort, High Grade (on track)
        </div>
        <div>
          <span style={{ fontWeight: 700, color: '#d97706' }}>Disengaged</span>: Low Effort, Low Grade (attendance/motivation)
        </div>
        <div>
          <span style={{ fontWeight: 700, color: '#dc2626' }}>Struggling</span>: High Effort, Low Grade (needs concept help)
        </div>
      </div>
    </div>
  );
}
