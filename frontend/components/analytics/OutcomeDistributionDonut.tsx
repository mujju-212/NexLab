'use client';

import React, { useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { PieChart as PieIcon, ChevronDown } from 'lucide-react';

export interface PerformanceTier {
  name: string;
  range: string;
  count: number;
  percentage: number;
  color: string;
}

interface OutcomeDistributionDonutProps {
  totalStudents?: number;
  tiers?: PerformanceTier[];
}

export function OutcomeDistributionDonut({
  totalStudents = 0,
  tiers,
}: OutcomeDistributionDonutProps) {
  const [filterMode, setFilterMode] = useState<string>('By Performance Level');
  const [menuOpen, setMenuOpen] = useState(false);

  const defaultTiers: PerformanceTier[] = [
    { name: 'Excellent', range: '≥80', count: 0, percentage: 0, color: '#10b981' },
    { name: 'Good', range: '65–79', count: 0, percentage: 0, color: '#34d399' },
    { name: 'Average', range: '50–64', count: 0, percentage: 0, color: '#f59e0b' },
    { name: 'Below Avg', range: '35–49', count: 0, percentage: 0, color: '#f97316' },
    { name: 'At Risk', range: '<35', count: 0, percentage: 0, color: '#ef4444' },
  ];

  const currentTiers = (tiers && tiers.length > 0) ? tiers : defaultTiers;
  const computedTotal = totalStudents || currentTiers.reduce((acc, t) => acc + t.count, 0);

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
            <PieIcon size={18} />
          </div>
          <h3
            style={{
              margin: 0,
              fontSize: '0.95rem',
              fontWeight: 700,
              color: '#1e293b',
            }}
          >
            Outcome Distribution
          </h3>
        </div>

        {/* Filter Dropdown */}
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
            <span>{filterMode}</span>
            <ChevronDown size={14} style={{ color: '#94a3b8' }} />
          </button>

          {menuOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                right: 0,
                width: 170,
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                zIndex: 20,
                padding: '4px',
              }}
            >
              {['By Performance Level', 'By Department', 'By Cohort'].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setFilterMode(m);
                    setMenuOpen(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: 'none',
                    background: filterMode === m ? 'rgba(124, 58, 237, 0.08)' : 'transparent',
                    color: filterMode === m ? '#7c3aed' : '#334155',
                    fontSize: '0.785rem',
                    fontWeight: filterMode === m ? 700 : 500,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Content: Donut on Left, Breakdown List on Right */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginTop: 6,
        }}
      >
        {/* Donut with Center Text */}
        <div style={{ position: 'relative', width: 170, height: 190, flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={currentTiers}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={70}
                paddingAngle={3}
                stroke="#ffffff"
                strokeWidth={2}
              >
                {currentTiers.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const item = payload[0].payload as PerformanceTier;
                  return (
                    <div
                      style={{
                        background: '#1e293b',
                        color: '#ffffff',
                        padding: '8px 12px',
                        borderRadius: 8,
                        fontSize: '0.785rem',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                      }}
                    >
                      <div style={{ fontWeight: 700, color: item.color }}>{item.name} ({item.range})</div>
                      <div style={{ color: '#cbd5e1' }}>
                        {(item.count ?? 0).toLocaleString()} students ({item.percentage ?? 0}%)
                      </div>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Centered Total Label */}
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
                fontSize: '1.35rem',
                fontWeight: 800,
                color: '#1e293b',
                lineHeight: 1.1,
              }}
            >
              {(computedTotal ?? 0).toLocaleString()}
            </div>
            <div
              style={{
                fontSize: '0.675rem',
                fontWeight: 600,
                color: '#94a3b8',
                marginTop: 2,
                whiteSpace: 'nowrap',
              }}
            >
              Total Students
            </div>
          </div>
        </div>

        {/* Right-Side Tier Breakdown List */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {currentTiers.map((tier, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              {/* Colored Indicator & Label */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1, overflow: 'hidden' }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: tier.color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: '0.785rem',
                    fontWeight: 600,
                    color: '#334155',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tier.name}
                </span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 500,
                    color: '#94a3b8',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ({tier.range})
                </span>
              </div>

              {/* Count and Percentage Badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span
                  style={{
                    fontSize: '0.785rem',
                    fontWeight: 700,
                    color: '#1e293b',
                    minWidth: 24,
                    textAlign: 'right',
                  }}
                >
                  {(tier.count ?? 0).toLocaleString()}
                </span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    color: tier.color,
                    backgroundColor: `${tier.color}18`,
                    padding: '2px 7px',
                    borderRadius: 999,
                    minWidth: 40,
                    textAlign: 'center',
                  }}
                >
                  {tier.percentage}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
