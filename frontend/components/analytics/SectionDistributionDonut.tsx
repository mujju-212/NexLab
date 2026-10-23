'use client';

import React from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts';
import { Layers } from 'lucide-react';

interface SectionDistributionDonutProps {
  distribution?: {
    total: number;
    above_average: { count: number; pct: number };
    on_par: { count: number; pct: number };
    below_average: { count: number; pct: number };
    significantly_below: { count: number; pct: number };
  };
}

export function SectionDistributionDonut({ distribution }: SectionDistributionDonutProps) {
  // Real counts only. These used to default to a made-up 27-section split.
  const total = distribution?.total ?? 0;
  const above = distribution?.above_average?.count ?? 0;
  const onPar = distribution?.on_par?.count ?? 0;
  const below = distribution?.below_average?.count ?? 0;
  const sigBelow = distribution?.significantly_below?.count ?? 0;
  const unmeasured = (distribution as any)?.unmeasured ?? 0;
  const empty = total === 0;

  const data = [
    {
      name: 'Above Average',
      value: above,
      pct: distribution?.above_average?.pct ?? Math.round((above / total) * 100),
      color: '#10b981',
      description: 'Z ≥ +0.5σ above mean',
    },
    {
      name: 'On Par',
      value: onPar,
      pct: distribution?.on_par?.pct ?? Math.round((onPar / total) * 100),
      color: '#8b5cf6',
      description: 'Within ±0.5σ of baseline',
    },
    {
      name: 'Below Average',
      value: below,
      pct: distribution?.below_average?.pct ?? Math.round((below / total) * 100),
      color: '#f59e0b',
      description: '-1.5σ to -0.5σ below mean',
    },
    {
      name: 'Significantly Below',
      value: sigBelow,
      pct: distribution?.significantly_below?.pct ?? Math.round((sigBelow / total) * 100),
      color: '#ef4444',
      description: 'Z < -1.5σ critical deviation',
    },
  ];

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
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
          <Layers size={16} />
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
            Section Performance Distribution
          </h3>
          <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#64748b' }}>
            How sections perform compared to campus average
          </p>
        </div>
      </div>

      {/* Body: Donut on Left, Legend Breakdown on Right */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          height: 260,
        }}
      >
        {/* Donut Chart with Centered Count */}
        <div style={{ position: 'relative', width: 200, height: 200, flexShrink: 0 }}>
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                fontSize: '1.5rem',
                fontWeight: 800,
                color: '#0f172a',
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
              }}
            >
              {total}
            </div>
            <div
              style={{
                fontSize: '0.675rem',
                color: '#64748b',
                fontWeight: 600,
                marginTop: 2,
              }}
            >
              {empty ? 'Measured' : 'Sections'}
            </div>
          </div>

          {empty ? (
            <div
              style={{
                position: 'absolute', inset: 0, borderRadius: '50%', border: '22px solid #f1f5f9',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', textAlign: 'center', padding: 28,
              }}
            >
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, lineHeight: 1.35 }}>
                Not benchmarkable yet — a cohort needs at least two measured sections.
              </span>
            </div>
          ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={82}
                paddingAngle={3}
                dataKey="value"
                stroke="none"
              >
                {data.map(entry => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: '#ffffff',
                  borderRadius: 10,
                  border: '1px solid #ede9fe',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                  fontSize: 12,
                }}
                formatter={(val: any, name: any) => [
                  `${val} sections (${Math.round((Number(val) / total) * 100)}%)`,
                  name,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
          )}
        </div>

        {/* Breakdown List */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {data.map(item => (
            <div
              key={item.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                fontSize: '0.8125rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 2.5,
                    background: item.color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: '#334155', fontWeight: 600 }}>{item.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontWeight: 700, color: '#0f172a' }}>{item.value}</span>
                <span style={{ color: '#64748b', fontWeight: 500, minWidth: 32, textAlign: 'right' }}>
                  {item.pct}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
