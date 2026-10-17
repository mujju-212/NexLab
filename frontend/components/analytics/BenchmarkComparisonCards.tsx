'use client';

import React from 'react';
import { Trophy, AlertTriangle, Building2 } from 'lucide-react';

interface BenchmarkComparisonCardsProps {
  topPerforming?: Array<{
    rank: number;
    section: string;
    avg_grade: number;
    z_score: number;
    percentile: string;
  }>;
  needsAttention?: Array<{
    rank: number;
    section: string;
    avg_grade: number;
    z_score: number;
    percentile: string;
  }>;
  departments?: Array<{
    department: string;
    students: number;
    avg_grade: number;
    z_score: number;
  }>;
}

export function BenchmarkComparisonCards({
  topPerforming = [],
  needsAttention = [],
  departments = [],
}: BenchmarkComparisonCardsProps) {
  const topList = topPerforming.slice(0, 5);
  const needsList = needsAttention.slice(0, 5);
  const deptList = departments.slice(0, 6);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: 16,
      }}
    >
      {/* ── CARD 1: TOP PERFORMING SECTIONS ── */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #f1f5f9',
          borderRadius: 16,
          padding: '18px 20px',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: '#fef3c7',
              color: '#d97706',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Trophy size={16} />
          </div>
          <h3
            style={{
              margin: 0,
              fontSize: '0.925rem',
              fontWeight: 700,
              color: '#0f172a',
              letterSpacing: '-0.01em',
            }}
          >
            Top Performing Sections
          </h3>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.785rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #f1f5f9', textAlign: 'left', color: '#64748b' }}>
              <th style={{ padding: '8px 4px', fontWeight: 600, width: 24 }}>#</th>
              <th style={{ padding: '8px 10px', fontWeight: 600 }}>Section</th>
              <th style={{ padding: '8px 10px', fontWeight: 600 }}>Avg Grade</th>
              <th style={{ padding: '8px 10px', fontWeight: 600 }}>Z-Score</th>
              <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>Percentile</th>
            </tr>
          </thead>
          <tbody>
            {topList.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '24px 8px', textAlign: 'center', color: '#94a3b8' }}>
                  No top performing section records available.
                </td>
              </tr>
            ) : (
              topList.map((item, idx) => (
                <tr key={`${item.section}-${item.rank}-${idx}`} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '9px 4px', color: '#94a3b8', fontWeight: 600 }}>{item.rank}</td>
                  <td style={{ padding: '9px 10px', fontWeight: 700, color: '#1e293b' }}>{item.section}</td>
                  <td style={{ padding: '9px 10px', fontWeight: 600, color: '#334155' }}>
                    {(item.avg_grade ?? 0).toFixed(1)}
                  </td>
                  <td style={{ padding: '9px 10px', fontWeight: 700, color: '#10b981' }}>
                    {item.z_score >= 0 ? `+${item.z_score.toFixed(2)}` : item.z_score.toFixed(2)}
                  </td>
                  <td style={{ padding: '9px 4px', textAlign: 'right' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 9999,
                        background: '#ecfdf5',
                        color: '#059669',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        border: '1px solid #a7f3d0',
                      }}
                    >
                      {item.percentile || 'Top Tier'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── CARD 2: NEEDS ATTENTION ── */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #f1f5f9',
          borderRadius: 16,
          padding: '18px 20px',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: '#fee2e2',
              color: '#dc2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AlertTriangle size={16} />
          </div>
          <h3
            style={{
              margin: 0,
              fontSize: '0.925rem',
              fontWeight: 700,
              color: '#0f172a',
              letterSpacing: '-0.01em',
            }}
          >
            Needs Attention
          </h3>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.785rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #f1f5f9', textAlign: 'left', color: '#64748b' }}>
              <th style={{ padding: '8px 4px', fontWeight: 600, width: 24 }}>#</th>
              <th style={{ padding: '8px 10px', fontWeight: 600 }}>Section</th>
              <th style={{ padding: '8px 10px', fontWeight: 600 }}>Avg Grade</th>
              <th style={{ padding: '8px 10px', fontWeight: 600 }}>Z-Score</th>
              <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>Percentile</th>
            </tr>
          </thead>
          <tbody>
            {needsList.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '24px 8px', textAlign: 'center', color: '#94a3b8' }}>
                  No sections requiring attention for this selection.
                </td>
              </tr>
            ) : (
              needsList.map((item, idx) => (
                <tr key={`${item.section}-${item.rank}-${idx}`} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '9px 4px', color: '#94a3b8', fontWeight: 600 }}>{item.rank}</td>
                  <td style={{ padding: '9px 10px', fontWeight: 700, color: '#1e293b' }}>{item.section}</td>
                  <td style={{ padding: '9px 10px', fontWeight: 600, color: '#334155' }}>
                    {(item.avg_grade ?? 0).toFixed(1)}
                  </td>
                  <td style={{ padding: '9px 10px', fontWeight: 700, color: '#ef4444' }}>
                    {item.z_score >= 0 ? `+${item.z_score.toFixed(2)}` : item.z_score.toFixed(2)}
                  </td>
                  <td style={{ padding: '9px 4px', textAlign: 'right' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 9999,
                        background: '#fef2f2',
                        color: '#dc2626',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        border: '1px solid #fecaca',
                      }}
                    >
                      {item.percentile || 'Watch Tier'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── CARD 3: DEPARTMENT COMPARISON ── */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #f1f5f9',
          borderRadius: 16,
          padding: '18px 20px',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
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
            <Building2 size={16} />
          </div>
          <h3
            style={{
              margin: 0,
              fontSize: '0.925rem',
              fontWeight: 700,
              color: '#0f172a',
              letterSpacing: '-0.01em',
            }}
          >
            Department Comparison
          </h3>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.785rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #f1f5f9', textAlign: 'left', color: '#64748b' }}>
              <th style={{ padding: '8px 4px', fontWeight: 600 }}>Department</th>
              <th style={{ padding: '8px 10px', fontWeight: 600 }}>Students</th>
              <th style={{ padding: '8px 10px', fontWeight: 600 }}>Avg Grade</th>
              <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>Z-Score</th>
            </tr>
          </thead>
          <tbody>
            {deptList.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: '24px 8px', textAlign: 'center', color: '#94a3b8' }}>
                  No department benchmark records available.
                </td>
              </tr>
            ) : (
              deptList.map((item, idx) => {
                const isPositive = (item.z_score ?? 0) >= 0;
                return (
                  <tr key={`${item.department}-${idx}`} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '9px 4px', fontWeight: 700, color: '#1e293b' }}>
                      {item.department}
                    </td>
                    <td style={{ padding: '9px 10px', color: '#64748b', fontWeight: 500 }}>
                      {item.students}
                    </td>
                    <td style={{ padding: '9px 10px', fontWeight: 600, color: '#334155' }}>
                      {(item.avg_grade ?? 0).toFixed(1)}
                    </td>
                    <td style={{ padding: '9px 4px', textAlign: 'right', fontWeight: 700, color: isPositive ? '#10b981' : '#ef4444' }}>
                      {isPositive ? `+${(item.z_score ?? 0).toFixed(2)}` : (item.z_score ?? 0).toFixed(2)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
