'use client';

import React, { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { TrendingUp, ChevronDown } from 'lucide-react';

export interface TrendDataPoint {
  date: string;
  avg_grade: number;
  mastery_rate: number;
  completion_rate: number;
}

interface LearningOutcomesTrendChartProps {
  data?: TrendDataPoint[];
  days?: number;
  onDaysChange?: (days: number) => void;
}

export function LearningOutcomesTrendChart({
  data,
  days = 30,
  onDaysChange,
}: LearningOutcomesTrendChartProps) {
  const [selectedRange, setSelectedRange] = useState<string>('Last 30 Days');
  const [menuOpen, setMenuOpen] = useState(false);

  const fallbackData: TrendDataPoint[] = [
    { date: 'Sep 15', avg_grade: 60.5, mastery_rate: 38.2, completion_rate: 22.8 },
    { date: 'Sep 20', avg_grade: 63.8, mastery_rate: 41.5, completion_rate: 25.4 },
    { date: 'Sep 25', avg_grade: 62.1, mastery_rate: 40.0, completion_rate: 24.1 },
    { date: 'Sep 30', avg_grade: 65.4, mastery_rate: 43.6, completion_rate: 27.3 },
    { date: 'Oct 05', avg_grade: 66.8, mastery_rate: 45.2, completion_rate: 26.8 },
    { date: 'Oct 10', avg_grade: 71.2, mastery_rate: 48.9, completion_rate: 28.5 },
    { date: 'Oct 15', avg_grade: 74.6, mastery_rate: 52.4, completion_rate: 32.1 },
  ];

  const chartData = (data && data.length > 0) ? data : fallbackData;

  const handleSelectRange = (label: string, d: number) => {
    setSelectedRange(label);
    setMenuOpen(false);
    if (onDaysChange) onDaysChange(d);
  };

  return (
    <div
      style={{
        background: '#ffffff',
        borderRadius: 16,
        padding: '20px 24px',
        border: '1px solid #f1f5f9',
        boxShadow: '0 4px 20px -2px rgba(124, 58, 237, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 380,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: 'rgba(124, 58, 237, 0.08)',
              color: '#7c3aed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <TrendingUp size={18} />
          </div>
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: '0.95rem',
                fontWeight: 700,
                color: '#1e293b',
              }}
            >
              Learning Outcomes Trend
            </h3>
          </div>
        </div>

        {/* Center Legend */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            fontSize: '0.8rem',
            color: '#64748b',
            fontWeight: 500,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: '#8b5cf6',
                display: 'inline-block',
              }}
            />
            <span>Average Grade</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: '#10b981',
                display: 'inline-block',
              }}
            />
            <span>Mastery Rate</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: '#06b6d4',
                display: 'inline-block',
              }}
            />
            <span>Completion Rate</span>
          </div>
        </div>

        {/* Dropdown Range Filter */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
              fontSize: '0.785rem',
              fontWeight: 600,
              color: '#475569',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <span>{selectedRange}</span>
            <ChevronDown size={14} style={{ color: '#94a3b8' }} />
          </button>

          {menuOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                right: 0,
                width: 140,
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                zIndex: 20,
                padding: '4px',
              }}
            >
              {[
                { label: 'Last 7 Days', d: 7 },
                { label: 'Last 30 Days', d: 30 },
                { label: 'Last 90 Days', d: 90 },
              ].map(opt => (
                <button
                  key={opt.d}
                  type="button"
                  onClick={() => handleSelectRange(opt.label, opt.d)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: 'none',
                    background: selectedRange === opt.label ? 'rgba(124, 58, 237, 0.08)' : 'transparent',
                    color: selectedRange === opt.label ? '#7c3aed' : '#334155',
                    fontSize: '0.785rem',
                    fontWeight: selectedRange === opt.label ? 700 : 500,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      <div style={{ flex: 1, width: '100%', minHeight: 280 }}>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
            <defs>
              <linearGradient id="gradeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="masteryGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="completionGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }}
              dy={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }}
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={v => `${v}%`}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null;
                return (
                  <div
                    style={{
                      background: '#1e293b',
                      borderRadius: 10,
                      padding: '10px 14px',
                      color: '#ffffff',
                      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)',
                      fontSize: '0.785rem',
                      lineHeight: 1.5,
                      border: '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 6, color: '#f8fafc' }}>{label}</div>
                    {payload.map((item: any, i: number) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 16,
                          color: '#e2e8f0',
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              backgroundColor: item.color,
                              display: 'inline-block',
                            }}
                          />
                          <span>{item.name}:</span>
                        </span>
                        <span style={{ fontWeight: 700, color: '#ffffff' }}>
                          {Number(item.value).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />

            <Area
              type="monotone"
              dataKey="avg_grade"
              name="Average Grade"
              stroke="#8b5cf6"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#gradeGradient)"
              activeDot={{ r: 5, fill: '#8b5cf6', stroke: '#ffffff', strokeWidth: 2 }}
              dot={{ r: 3.5, fill: '#8b5cf6', stroke: '#ffffff', strokeWidth: 1.5 }}
            />
            <Area
              type="monotone"
              dataKey="mastery_rate"
              name="Mastery Rate"
              stroke="#10b981"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#masteryGradient)"
              activeDot={{ r: 5, fill: '#10b981', stroke: '#ffffff', strokeWidth: 2 }}
              dot={{ r: 3.5, fill: '#10b981', stroke: '#ffffff', strokeWidth: 1.5 }}
            />
            <Area
              type="monotone"
              dataKey="completion_rate"
              name="Completion Rate"
              stroke="#06b6d4"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#completionGradient)"
              activeDot={{ r: 5, fill: '#06b6d4', stroke: '#ffffff', strokeWidth: 2 }}
              dot={{ r: 3.5, fill: '#06b6d4', stroke: '#ffffff', strokeWidth: 1.5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
