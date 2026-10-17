'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Trophy, Medal, Award, Search, Download, ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';
import styles from './analytics.module.css';
import { exportCSV } from '@/lib/analytics-utils';
import { LeaderboardRankItem } from '@/services/analytics.service';

interface LeaderboardProps {
  items: LeaderboardRankItem[];
  currentScope: string;
  onScopeChange: (scope: string) => void;
  availableScopes?: { key: string; label: string }[];
  cohortSize?: number;
  onSelectStudent?: (studentId: string) => void;
  loading?: boolean;
}

const DEFAULT_SCOPES = [
  { key: 'section', label: 'Section' },
  { key: 'subject', label: 'Subject' },
  { key: 'department', label: 'Department' },
  { key: 'year', label: 'Year Cohort' },
  { key: 'institution', label: 'Institution' },
];

export function Leaderboard({
  items,
  currentScope,
  onScopeChange,
  availableScopes = DEFAULT_SCOPES,
  cohortSize,
  onSelectStudent,
  loading = false,
}: LeaderboardProps) {
  const [search, setSearch] = useState('');
  const [hoveredStudent, setHoveredStudent] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filteredItems = (items || []).filter((item) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      item.student_name?.toLowerCase().includes(q) ||
      item.roll_number?.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    setPage(1);
  }, [search, currentScope]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const pagedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, page, pageSize]);

  const handleExport = () => {
    const rows = filteredItems.map((item) => ({
      Rank: item.rank_position,
      Name: item.student_name,
      Roll: item.roll_number || '',
      'Rank Score': item.rank_score,
      Percentile: `${Math.round(item.percentile)}%`,
      Mastery: item.components?.mastery ?? '',
      Engagement: item.components?.engagement ?? '',
      Effort: item.components?.effort ?? '',
      Efficiency: item.components?.efficiency ?? '',
      Consistency: item.components?.consistency ?? '',
    }));
    exportCSV(rows, `leaderboard_${currentScope}_${new Date().toISOString().split('T')[0]}`);
  };

  const top3 = (items || []).slice(0, 3);

  const getRankBadge = (pos: number) => {
    if (pos === 1) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: '#fef3c7',
            color: '#b45309',
            fontWeight: 800,
            fontSize: '0.8rem',
            border: '1px solid #fde68a',
          }}
          title="Gold - Rank 1"
        >
          <Trophy size={13} style={{ marginRight: 1 }} /> 1
        </span>
      );
    }
    if (pos === 2) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: '#f3f4f6',
            color: '#4b5563',
            fontWeight: 800,
            fontSize: '0.8rem',
            border: '1px solid #e5e7eb',
          }}
          title="Silver - Rank 2"
        >
          <Medal size={13} style={{ marginRight: 1 }} /> 2
        </span>
      );
    }
    if (pos === 3) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: '#ffedd5',
            color: '#c2410c',
            fontWeight: 800,
            fontSize: '0.8rem',
            border: '1px solid #fed7aa',
          }}
          title="Bronze - Rank 3"
        >
          <Award size={13} style={{ marginRight: 1 }} /> 3
        </span>
      );
    }
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 24,
          height: 24,
          borderRadius: 6,
          background: '#f9fafb',
          color: '#6b7280',
          fontWeight: 700,
          fontSize: '0.785rem',
        }}
      >
        #{pos}
      </span>
    );
  };

  return (
    <div className={styles.card}>
      {/* Header with scope switch and search */}
      <div className={styles.cardHeader}>
        <div>
          <div className={styles.cardTitleGroup}>
            <Trophy size={18} className={styles.cardTitleIcon} style={{ color: '#f59e0b' }} />
            <h3 className={styles.cardTitle}>Multi-Scope Leaderboard</h3>
          </div>
          <div className={styles.cardSubtitle}>
            Normalized multi-component ranking based on mastery, consistency, engagement, efficiency, and effort.
            {cohortSize !== undefined && ` Total cohort: ${cohortSize} students.`}
          </div>
        </div>

        {/* Scope Pill Tabs */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {availableScopes.map((scope) => {
            const active = currentScope === scope.key;
            return (
              <button
                key={scope.key}
                type="button"
                onClick={() => onScopeChange(scope.key)}
                style={{
                  height: 32,
                  padding: '0 12px',
                  borderRadius: 20,
                  fontSize: '0.775rem',
                  fontWeight: active ? 700 : 500,
                  background: active ? '#7c3aed' : '#f3f4f6',
                  color: active ? '#ffffff' : '#4b5563',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {scope.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Top 3 Podium Highlights if available */}
      {top3.length >= 3 && !search && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
            marginBottom: 20,
          }}
        >
          {top3.map((top, idx) => {
            const bgGrad =
              idx === 0
                ? 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)'
                : idx === 1
                ? 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)'
                : 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)';
            const borderCol = idx === 0 ? '#fde68a' : idx === 1 ? '#e5e7eb' : '#fed7aa';

            return (
              <div
                key={top.student_id}
                onClick={() => onSelectStudent && onSelectStudent(top.student_id)}
                style={{
                  background: bgGrad,
                  border: `1px solid ${borderCol}`,
                  borderRadius: 12,
                  padding: '14px 16px',
                  cursor: onSelectStudent ? 'pointer' : 'default',
                  position: 'relative',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  {getRankBadge(top.rank_position)}
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b7280' }}>
                    Top {Math.max(1, 100 - Math.round(top.percentile))}%
                  </span>
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#111827', marginBottom: 2 }}>
                  {top.student_name}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 8 }}>
                  {top.roll_number || 'Enrolled Student'}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#7c3aed' }}>
                    {Math.round(top.rank_score)}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>pts</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Toolbar */}
      <div className={styles.tableToolbar} style={{ borderRadius: '8px 8px 0 0' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, color: '#9ca3af' }} />
          <input
            type="text"
            placeholder="Search student or roll..."
            className={styles.tableSearch}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <button
          type="button"
          onClick={handleExport}
          className={`${styles.actionBtn} ${styles.outlineBtn}`}
          style={{ height: 32, fontSize: '0.775rem' }}
        >
          <Download size={13} /> Export CSV
        </button>
      </div>

      {/* Table */}
      <div className={styles.tableWrapper} style={{ borderTop: 'none', borderRadius: '0 0 10px 10px' }}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th style={{ width: 60, textAlign: 'center' }}>Rank</th>
              <th>Student</th>
              <th style={{ textAlign: 'center' }}>Score</th>
              <th style={{ textAlign: 'center' }}>Cohort Percentile</th>
              <th>Component Balance (Mastery · Engage · Effort · Effic · Consist)</th>
              <th style={{ width: 60, textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: '#9ca3af' }}>
                  Loading rankings...
                </td>
              </tr>
            ) : pagedItems.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: '#9ca3af' }}>
                  No students found matching your criteria.
                </td>
              </tr>
            ) : (
              pagedItems.map((item) => {
                const isHovered = hoveredStudent === item.student_id;
                const comp = item.components || {
                  mastery: 0,
                  engagement: 0,
                  effort: 0,
                  efficiency: 0,
                  consistency: 0,
                };

                return (
                  <tr
                    key={item.student_id}
                    className={styles.tableRowInteractive}
                    onClick={() => onSelectStudent && onSelectStudent(item.student_id)}
                    onMouseEnter={() => setHoveredStudent(item.student_id)}
                    onMouseLeave={() => setHoveredStudent(null)}
                  >
                    <td style={{ textAlign: 'center' }}>{getRankBadge(item.rank_position)}</td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{item.student_name}</div>
                      {item.roll_number && (
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{item.roll_number}</div>
                      )}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 800, color: '#7c3aed', fontSize: '0.95rem' }}>
                      {Math.round(item.rank_score)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span
                        style={{
                          background: item.percentile >= 75 ? '#ecfdf5' : item.percentile >= 50 ? '#eff6ff' : '#fef3c7',
                          color: item.percentile >= 75 ? '#059669' : item.percentile >= 50 ? '#2563eb' : '#d97706',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 9999,
                        }}
                      >
                        {Math.round(item.percentile)}th %ile
                      </span>
                    </td>
                    <td>
                      {/* 5-component breakdown bar */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 220 }}>
                        <div
                          style={{
                            display: 'flex',
                            height: 7,
                            borderRadius: 4,
                            overflow: 'hidden',
                            background: '#e5e7eb',
                          }}
                        >
                          <div
                            style={{
                              width: `${comp.mastery || 0}%`,
                              background: '#7c3aed',
                            }}
                            title={`Mastery: ${comp.mastery}%`}
                          />
                          <div
                            style={{
                              width: `${comp.engagement || 0}%`,
                              background: '#06b6d4',
                            }}
                            title={`Engagement: ${comp.engagement}%`}
                          />
                          <div
                            style={{
                              width: `${comp.effort || 0}%`,
                              background: '#f59e0b',
                            }}
                            title={`Effort: ${comp.effort}%`}
                          />
                          <div
                            style={{
                              width: `${comp.efficiency || 0}%`,
                              background: '#10b981',
                            }}
                            title={`Efficiency: ${comp.efficiency}%`}
                          />
                          <div
                            style={{
                              width: `${comp.consistency || 0}%`,
                              background: '#ec4899',
                            }}
                            title={`Consistency: ${comp.consistency}%`}
                          />
                        </div>

                        {/* Details chips visible on hover or compact */}
                        {isHovered && (
                          <div style={{ display: 'flex', gap: 8, fontSize: '0.68rem', color: '#6b7280' }}>
                            <span style={{ color: '#7c3aed' }}>M: {Math.round(comp.mastery)}%</span>
                            <span style={{ color: '#0891b2' }}>Eng: {Math.round(comp.engagement)}%</span>
                            <span style={{ color: '#d97706' }}>Eff: {Math.round(comp.effort)}%</span>
                            <span style={{ color: '#059669' }}>Efc: {Math.round(comp.efficiency)}%</span>
                            <span style={{ color: '#db2777' }}>Con: {Math.round(comp.consistency)}%</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#7c3aed',
                        }}
                      >
                        <ArrowUpRight size={16} />
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {!loading && filteredItems.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 16,
            marginTop: 8,
            borderTop: '1px solid #f1f5f9',
            fontSize: '0.8rem',
            color: '#64748b',
          }}
        >
          <div>
            Showing <strong style={{ color: '#0f172a' }}>{(page - 1) * pageSize + 1}</strong> to{' '}
            <strong style={{ color: '#0f172a' }}>{Math.min(page * pageSize, filteredItems.length)}</strong> of{' '}
            <strong style={{ color: '#0f172a' }}>{filteredItems.length}</strong> ranked students
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                background: page <= 1 ? '#f8fafc' : '#ffffff',
                color: page <= 1 ? '#cbd5e1' : '#334155',
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
                fontWeight: 600,
              }}
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <span style={{ fontWeight: 600, color: '#334155' }}>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                background: page >= totalPages ? '#f8fafc' : '#ffffff',
                color: page >= totalPages ? '#cbd5e1' : '#334155',
                cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                fontWeight: 600,
              }}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
