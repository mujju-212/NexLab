'use client';

import React, { useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
} from 'recharts';
import { Trophy } from 'lucide-react';

interface BenchmarkDualAxisChartProps {
  data?: Array<{
    name: string;
    fullName?: string;
    sectionAverage: number;
    campusMean: number;
    zScore: number;
  }>;
}

export function BenchmarkDualAxisChart({ data }: BenchmarkDualAxisChartProps) {
  const [metric, setMetric] = useState<'grade' | 'attendance' | 'focus' | 'risk'>('grade');

  const chartData = (data && data.length > 0) ? data : [];

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #f1f5f9',
        borderRadius: 16,
        padding: '20px 22px',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
        minHeight: 350,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: '#f3e8ff',
              color: '#7c3aed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Trophy size={16} />
          </div>
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: '0.95rem',
                fontWeight: 700,
                color: '#0f172a',
                letterSpacing: '-0.01em',
              }}
            >
              Section Performance vs Campus Mean
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#64748b' }}>
              Average grades with standardized z-scores across sections
            </p>
          </div>
        </div>

        {/* Legend + Metric Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.75rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#475569', fontWeight: 600 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#8b5cf6' }} />
              Section Average
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#64748b', fontWeight: 500 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#ddd6fe' }} />
              Campus Mean
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#7c3aed', fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#7c3aed' }} />
              Z-Score
            </span>
          </div>

          <select
            value={metric}
            onChange={e => setMetric(e.target.value as any)}
            style={{
              height: 32,
              padding: '0 8px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#334155',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="grade">Average Grade</option>
            <option value="attendance">Attendance Rate</option>
            <option value="focus">Focus Score</option>
            <option value="risk">Risk Score</option>
          </select>
        </div>
      </div>

      {/* Dual Axis Chart */}
      <div style={{ width: '100%', height: 270, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {chartData.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            No section benchmark distribution data available for current selection.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 20, right: 25, left: -15, bottom: 0 }}
              barGap={3}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#64748b', fontSize: 11, fontWeight: 500 }}
            />
            {/* Left Y Axis: Grade (0-100) */}
            <YAxis
              yAxisId="left"
              domain={[0, 100]}
              ticks={[0, 20, 40, 60, 80, 100]}
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
            />
            {/* Right Y Axis: Z-Score (-2.0 to 2.0) */}
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[-2.0, 2.0]}
              ticks={[-2.0, -1.0, 0.0, 1.0, 2.0]}
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#7c3aed', fontSize: 11, fontWeight: 600 }}
              tickFormatter={val => `${val > 0 ? '+' : ''}${val.toFixed(1)}`}
            />
            <Tooltip
              contentStyle={{
                background: '#ffffff',
                borderRadius: 10,
                border: '1px solid #ede9fe',
                boxShadow: '0 6px 20px rgba(0,0,0,0.06)',
                fontSize: 12,
              }}
              formatter={(val: any, name: any) => {
                if (name === 'zScore') return [`${val > 0 ? '+' : ''}${Number(val).toFixed(2)}σ`, 'Z-Score'];
                if (name === 'sectionAverage') return [`${val} pts`, 'Section Avg'];
                return [`${val} pts`, 'Campus Mean'];
              }}
              labelFormatter={(label, items) => {
                const item = items?.[0]?.payload;
                return item?.fullName || label;
              }}
            />
            {/* Section Average Bar with Label on Top */}
            <Bar
              yAxisId="left"
              dataKey="sectionAverage"
              fill="#8b5cf6"
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
            >
              <LabelList
                dataKey="sectionAverage"
                position="top"
                style={{ fontSize: 10, fill: '#1e293b', fontWeight: 700 }}
              />
            </Bar>
            {/* Campus Mean Bar with Label on Top */}
            <Bar
              yAxisId="left"
              dataKey="campusMean"
              fill="#ddd6fe"
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
            >
              <LabelList
                dataKey="campusMean"
                position="top"
                style={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
              />
            </Bar>
            {/* Z-Score Line Overlay */}
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="zScore"
              stroke="#7c3aed"
              strokeWidth={2.5}
              dot={{ r: 4.5, fill: '#7c3aed', stroke: '#ffffff', strokeWidth: 1.5 }}
              activeDot={{ r: 6, fill: '#6d28d9' }}
            />
          </ComposedChart>
        </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
