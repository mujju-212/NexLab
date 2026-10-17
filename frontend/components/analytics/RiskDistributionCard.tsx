'use client';

import React from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts';
import { ShieldAlert } from 'lucide-react';

interface RiskDistributionCardProps {
  totalStudents: number;
  bands?: {
    critical?: number;
    high?: number;
    watch?: number;
    ok?: number;
  };
}

export function RiskDistributionCard({
  totalStudents = 0,
  bands = {},
}: RiskDistributionCardProps) {
  const critical = bands.critical ?? 0;
  const high = bands.high ?? 0;
  const watch = bands.watch ?? 0;
  const ok = bands.ok ?? 0;

  const total = totalStudents || (critical + high + watch + ok) || 0;
  const safeTotal = total > 0 ? total : 1;

  const data = [
    { name: 'Critical (≥70)', key: 'critical', value: critical, color: '#ef4444', pct: total > 0 ? Math.round((critical / safeTotal) * 100) : 0 },
    { name: 'High (50–69)', key: 'high', value: high, color: '#f59e0b', pct: total > 0 ? Math.round((high / safeTotal) * 100) : 0 },
    { name: 'Watch (30–49)', key: 'watch', value: watch, color: '#eab308', pct: total > 0 ? Math.round((watch / safeTotal) * 100) : 0 },
    { name: 'OK (<30)', key: 'ok', value: ok, color: '#22c55e', pct: total > 0 ? Math.round((ok / safeTotal) * 100) : 0 },
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
        minHeight: 340,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
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
            <ShieldAlert size={16} />
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
            Risk Distribution
          </h3>
        </div>

        <select
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
          defaultValue="all"
        >
          <option value="all">All Students</option>
          <option value="dept">By Department</option>
          <option value="year">By Year</option>
        </select>
      </div>

      {/* Body: Donut on Left, Legend List on Right */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          height: 250,
        }}
      >
        {/* Donut Chart with Centered Text */}
        <div style={{ position: 'relative', width: 220, height: 220, flexShrink: 0 }}>
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
                fontSize: '1.45rem',
                fontWeight: 800,
                color: '#0f172a',
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
              }}
            >
              {total.toLocaleString()}
            </div>
            <div
              style={{
                fontSize: '0.675rem',
                color: '#64748b',
                fontWeight: 600,
                marginTop: 2,
              }}
            >
              Total Students
            </div>
          </div>

          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={64}
                outerRadius={88}
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
                formatter={(val: any, name: any) => [`${val} students (${Math.round((Number(val)/total)*100)}%)`, name]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Stats breakdown list */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {data.map(item => (
            <div
              key={item.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                fontSize: '0.8125rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
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
