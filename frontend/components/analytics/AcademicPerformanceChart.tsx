'use client';

import React, { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
} from 'recharts';
import { Users } from 'lucide-react';
import type { SectionComparison } from '@/services/institution.service';

interface AcademicPerformanceChartProps {
  sections?: SectionComparison[];
  baselineMean?: number | null;
}

export function AcademicPerformanceChart({
  sections = [],
  baselineMean,
}: AcademicPerformanceChartProps) {
  const [metric, setMetric] = useState<'grade' | 'attendance' | 'focus' | 'risk'>('grade');

  const pick = (sec: SectionComparison): number | null => {
    if (metric === 'grade') return sec.avg_grade ?? null;
    if (metric === 'attendance') return sec.attendance_rate ?? null;
    if (metric === 'focus') return sec.focus_avg ?? null;
    return sec.risk_score ?? null;
  };

  // Sections with no students (or no measured value for this metric) are not
  // plotted at all — they used to appear as a 0 bar beside real data.
  const rows = (sections || [])
    .filter(sec => (sec.enrolled ?? 0) > 0 && pick(sec) !== null)
    .slice(0, 8)
    .map(sec => ({
    name: (sec.section_name || '').replace(/Section\s*/i, '').slice(0, 14) || '—',
    fullName: sec.section_name,
    value: pick(sec),
    enrolled: sec.enrolled ?? 0,
  }));

  // The campus comparison is the mean of the sections actually plotted, for the
  // *selected* metric. It used to be the grade baseline for every metric, and
  // it collapsed to 0 whenever the campus average was unavailable — drawing a
  // zero-height bar next to real ones.
  const realValues = rows.map(r => r.value).filter((v): v is number => typeof v === 'number');
  const campusMean =
    typeof baselineMean === 'number' && metric === 'grade'
      ? baselineMean
      : realValues.length
        ? realValues.reduce((a, b) => a + b, 0) / realValues.length
        : null;

  const chartData = rows.map(r => ({
    name: r.name,
    fullName: r.fullName,
    sectionAverage: r.value === null ? null : Math.round(r.value),
    campusMean: campusMean === null ? null : Math.round(campusMean),
    enrolled: r.enrolled,
  }));

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
        minHeight: 340,
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
            <Users size={16} />
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
              Academic Performance vs Campus Mean
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#64748b' }}>
              Average grades across sections with campus comparison
            </p>
          </div>
        </div>

        {/* Metric Selector & Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.75rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#475569', fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#8b5cf6' }} />
              Section Average
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#64748b', fontWeight: 500 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ddd6fe' }} />
              Campus Mean
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

      {/* Chart */}
      <div style={{ width: '100%', height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {chartData.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            No section academic performance data available for this selection.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }} barGap={3}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                tick={{ fill: '#64748b', fontSize: 11, fontWeight: 500 }}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 20, 40, 60, 80, 100]}
                tickLine={false}
                axisLine={false}
                tick={{ fill: '#94a3b8', fontSize: 11 }}
              />
              <Tooltip
                cursor={{ fill: 'rgba(241, 245, 249, 0.6)' }}
                contentStyle={{
                  background: '#ffffff',
                  borderRadius: 10,
                  border: '1px solid #ede9fe',
                  boxShadow: '0 6px 20px rgba(0,0,0,0.06)',
                  fontSize: 12,
                }}
                formatter={(val: any, name: any) => [
                  `${val} ${metric === 'grade' ? 'pts' : '%'}`,
                  name === 'sectionAverage' ? 'Section Avg' : 'Campus Mean',
                ]}
                labelFormatter={(label, items) => {
                  const item = items?.[0]?.payload;
                  return `${item?.fullName || label} (${item?.enrolled ?? 0} students)`;
                }}
              />
              <Bar dataKey="sectionAverage" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={22}>
                <LabelList
                  dataKey="sectionAverage"
                  position="top"
                  style={{ fontSize: 10, fill: '#1e293b', fontWeight: 700 }}
                />
              </Bar>
              <Bar dataKey="campusMean" fill="#ddd6fe" radius={[4, 4, 0, 0]} maxBarSize={22}>
                <LabelList
                  dataKey="campusMean"
                  position="top"
                  style={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
