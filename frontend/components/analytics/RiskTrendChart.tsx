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
import { TrendingUp } from 'lucide-react';

interface RiskTrendChartProps {
  series?: Array<any>;
}

export function RiskTrendChart({ series }: RiskTrendChartProps) {
  const [range, setRange] = useState('30');

  const chartData = (series && series.length > 0)
    ? series.map(s => {
        const dStr = s.week || s.period || 'W';
        return {
          date: dStr.replace(/^(\d{4}-W\d{2}|.*-)/, 'W'),
          critical: s.risk_bands?.critical ?? 0,
          high: s.risk_bands?.high ?? 0,
          watch: s.risk_bands?.watch ?? 0,
          ok: s.risk_bands?.ok ?? 0,
        };
      })
    : [];

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
        minHeight: 290,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
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
            <TrendingUp size={16} />
          </div>
          <h3
            style={{
              margin: 0,
              fontSize: '0.95rem',
              fontWeight: 700,
              color: '#0f172a',
              letterSpacing: '-0.01em',
            }}
          >
            Risk Trend Over Time
          </h3>

          {/* Inline Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.75rem', marginLeft: 6 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#475569', fontWeight: 600 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444' }} />
              Critical
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#475569', fontWeight: 600 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b' }} />
              High
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#475569', fontWeight: 600 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#eab308' }} />
              Watch
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#475569', fontWeight: 600 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e' }} />
              OK
            </span>
          </div>
        </div>

        <select
          value={range}
          onChange={e => setRange(e.target.value)}
          style={{
            height: 30,
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
          <option value="30">Last 30 Days</option>
          <option value="60">Last 60 Days</option>
          <option value="90">Last 90 Days</option>
        </select>
      </div>

      {/* Area Chart */}
      <div style={{ width: '100%', height: 210, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {chartData.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            No longitudinal risk trend data available for current selection.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gradCrit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="gradHigh" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="gradWatch" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#eab308" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#eab308" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="gradOk" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#64748b', fontSize: 11 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{
                background: '#ffffff',
                borderRadius: 10,
                border: '1px solid #ede9fe',
                boxShadow: '0 6px 20px rgba(0,0,0,0.06)',
                fontSize: 12,
              }}
            />
            <Area
              type="monotone"
              dataKey="critical"
              name="Critical"
              stroke="#ef4444"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#gradCrit)"
              dot={{ r: 3, fill: '#ef4444' }}
            />
            <Area
              type="monotone"
              dataKey="high"
              name="High"
              stroke="#f59e0b"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#gradHigh)"
            />
            <Area
              type="monotone"
              dataKey="watch"
              name="Watch"
              stroke="#eab308"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#gradWatch)"
            />
            <Area
              type="monotone"
              dataKey="ok"
              name="OK"
              stroke="#22c55e"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#gradOk)"
            />
          </AreaChart>
        </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
