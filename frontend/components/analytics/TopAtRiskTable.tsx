'use client';

import React, { useState, useMemo } from 'react';
import {
  ShieldAlert,
  Search,
  Filter,
  ArrowRight,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Eye,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import type { AtRiskStudent } from '@/services/institution.service';

interface TopAtRiskTableProps {
  students?: AtRiskStudent[];
  onViewStudent?: (studentId: string) => void;
  onViewAll?: () => void;
}

export function TopAtRiskTable({
  students = [],
  onViewStudent,
  onViewAll,
}: TopAtRiskTableProps) {
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [sortField, setSortField] = useState<'student' | 'risk_score' | 'risk_band' | 'primary_reason' | 'mastery' | 'grade' | 'attendance' | 'focus'>('risk_score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const rawList = students || [];

  const handleSort = (field: 'student' | 'risk_score' | 'risk_band' | 'primary_reason' | 'mastery' | 'grade' | 'attendance' | 'focus') => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const renderSortIcon = (field: 'student' | 'risk_score' | 'risk_band' | 'primary_reason' | 'mastery' | 'grade' | 'attendance' | 'focus') => {
    if (sortField !== field) {
      return <ArrowUpDown size={12} style={{ opacity: 0.35, marginLeft: 4 }} />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp size={12} style={{ color: '#7c3aed', marginLeft: 4 }} />
    ) : (
      <ArrowDown size={12} style={{ color: '#7c3aed', marginLeft: 4 }} />
    );
  };

  const filtered = useMemo(() => {
    let list = [...rawList];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        s =>
          s.full_name?.toLowerCase().includes(q) ||
          s.roll_number?.toLowerCase().includes(q) ||
          s.email?.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      let aVal: any = 0;
      let bVal: any = 0;

      if (sortField === 'student') {
        aVal = a.full_name || '';
        bVal = b.full_name || '';
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      if (sortField === 'risk_score') {
        aVal = a.risk_score ?? 0;
        bVal = b.risk_score ?? 0;
      } else if (sortField === 'risk_band') {
        const bandRank: Record<string, number> = { critical: 4, high: 3, watch: 2, ok: 1 };
        aVal = bandRank[a.risk_band || 'ok'] || 0;
        bVal = bandRank[b.risk_band || 'ok'] || 0;
      } else if (sortField === 'primary_reason') {
        aVal = a.primary_reason || '';
        bVal = b.primary_reason || '';
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      } else if (sortField === 'mastery') {
        aVal = a.components?.mastery ?? a.avg_mastery ?? 0;
        bVal = b.components?.mastery ?? b.avg_mastery ?? 0;
      } else if (sortField === 'grade') {
        aVal = a.components?.grade ?? 0;
        bVal = b.components?.grade ?? 0;
      } else if (sortField === 'attendance') {
        aVal = a.components?.attendance ?? 0;
        bVal = b.components?.attendance ?? 0;
      } else if (sortField === 'focus') {
        aVal = a.components?.focus ?? 0;
        bVal = b.components?.focus ?? 0;
      }

      return sortOrder === 'asc' ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal);
    });

    return list;
  }, [rawList, search, sortField, sortOrder]);

  React.useEffect(() => {
    setPage(1);
  }, [search, sortField, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const toggleSelectAll = () => {
    if (selectedIds.size === paged.length && paged.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paged.map(s => s.student_id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const getInitials = (name?: string) => {
    if (!name) return 'ST';
    return name
      .split(' ')
      .map(w => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  const getAvatarBg = (idx: number) => {
    const colors = ['#fee2e2', '#e0e7ff', '#fef3c7', '#dcfce7', '#f3e8ff', '#e0f2fe'];
    return colors[idx % colors.length];
  };

  const getAvatarColor = (idx: number) => {
    const colors = ['#dc2626', '#4338ca', '#d97706', '#15803d', '#7c3aed', '#0284c7'];
    return colors[idx % colors.length];
  };

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #f1f5f9',
        borderRadius: 16,
        padding: '20px 22px',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)',
      }}
    >
      {/* Table Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: '#fee2e2',
              color: '#dc2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ShieldAlert size={18} />
          </div>
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: '0.975rem',
                fontWeight: 700,
                color: '#0f172a',
                letterSpacing: '-0.01em',
              }}
            >
              Top At-Risk Students
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#64748b' }}>
              Students who need immediate attention based on unified risk model
            </p>
          </div>
        </div>

        {/* Right Search + Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 12,
                color: '#94a3b8',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              placeholder="Search students by name, ID or email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                height: 34,
                width: 260,
                padding: '0 12px 0 34px',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                background: '#ffffff',
                fontSize: '0.775rem',
                outline: 'none',
                color: '#1e293b',
              }}
            />
          </div>

          <button
            type="button"
            style={{
              height: 34,
              padding: '0 12px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              fontSize: '0.775rem',
              fontWeight: 600,
              color: '#334155',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
            }}
          >
            <Filter size={13} style={{ color: '#64748b' }} />
            <span>Filters</span>
          </button>

          {onViewAll && (
            <button
              type="button"
              onClick={onViewAll}
              style={{
                height: 34,
                padding: '0 12px',
                borderRadius: 8,
                border: 'none',
                background: 'transparent',
                fontSize: '0.8rem',
                fontWeight: 700,
                color: '#7c3aed',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer',
              }}
            >
              <span>View All</span>
              <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #f1f5f9', textAlign: 'left' }}>
              <th style={{ padding: '10px 12px', width: 32 }}>
                <input
                  type="checkbox"
                  checked={selectedIds.size === paged.length && paged.length > 0}
                  onChange={toggleSelectAll}
                  style={{ accentColor: '#7c3aed', cursor: 'pointer' }}
                />
              </th>
              <th style={{ padding: '10px 8px', color: '#64748b', fontWeight: 600, width: 36 }}>#</th>
              <th onClick={() => handleSort('student')} style={{ padding: '10px 12px', color: '#64748b', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center' }}>Student {renderSortIcon('student')}</div>
              </th>
              <th onClick={() => handleSort('risk_score')} style={{ padding: '10px 12px', color: '#64748b', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center' }}>Risk Score {renderSortIcon('risk_score')}</div>
              </th>
              <th onClick={() => handleSort('risk_band')} style={{ padding: '10px 12px', color: '#64748b', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center' }}>Risk Band {renderSortIcon('risk_band')}</div>
              </th>
              <th onClick={() => handleSort('primary_reason')} style={{ padding: '10px 12px', color: '#64748b', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center' }}>Primary Driver {renderSortIcon('primary_reason')}</div>
              </th>
              <th onClick={() => handleSort('mastery')} style={{ padding: '10px 12px', color: '#64748b', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center' }}>Mastery {renderSortIcon('mastery')}</div>
              </th>
              <th onClick={() => handleSort('grade')} style={{ padding: '10px 12px', color: '#64748b', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center' }}>Grade Avg {renderSortIcon('grade')}</div>
              </th>
              <th onClick={() => handleSort('attendance')} style={{ padding: '10px 12px', color: '#64748b', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center' }}>Attendance {renderSortIcon('attendance')}</div>
              </th>
              <th onClick={() => handleSort('focus')} style={{ padding: '10px 12px', color: '#64748b', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center' }}>Engagement {renderSortIcon('focus')}</div>
              </th>
              <th style={{ padding: '10px 12px', color: '#64748b', fontWeight: 600 }}>Last Active</th>
              <th style={{ padding: '10px 12px', color: '#64748b', fontWeight: 600, textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={12} style={{ padding: '36px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                  {search.trim() ? 'No at-risk students match your search criteria.' : 'No at-risk students identified for this selection.'}
                </td>
              </tr>
            ) : (
              paged.map((s, idx) => {
                const riskVal = Math.round(s.risk_score ?? 0);
                const masteryVal = Math.round(s.components?.mastery ?? s.avg_mastery ?? 0);
                const gradeVal = Math.round(s.components?.grade ?? 0);
                const attVal = Math.round(s.components?.attendance ?? 0);
                const focusVal = Math.round(s.components?.focus ?? 0);
                const rowIdx = (page - 1) * pageSize + idx + 1;

                const isChecked = selectedIds.has(s.student_id);

                return (
                  <tr
                    key={s.student_id}
                    style={{
                      borderBottom: '1px solid #f8fafc',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#fbf9ff')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Checkbox */}
                    <td style={{ padding: '12px' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelect(s.student_id)}
                        style={{ accentColor: '#7c3aed', cursor: 'pointer' }}
                      />
                    </td>

                    {/* Index */}
                    <td style={{ padding: '12px 8px', color: '#94a3b8', fontWeight: 600 }}>
                      {rowIdx}
                    </td>

                    {/* Student Avatar + Name + Subtitle */}
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: getAvatarBg(idx),
                            color: getAvatarColor(idx),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {getInitials(s.full_name)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{s.full_name}</div>
                          <div style={{ fontSize: '0.725rem', color: '#64748b' }}>
                            {s.roll_number || '—'}{s.section_name ? ` • ${s.section_name}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Risk Score */}
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 800, color: riskVal >= 70 ? '#dc2626' : '#d97706', width: 20 }}>
                          {riskVal}
                        </span>
                        <div
                          style={{
                            width: 48,
                            height: 5,
                            borderRadius: 9999,
                            background: '#fee2e2',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(100, Math.max(0, riskVal))}%`,
                              height: '100%',
                              background: riskVal >= 70 ? '#ef4444' : '#f59e0b',
                              borderRadius: 9999,
                            }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Risk Band */}
                    <td style={{ padding: '12px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: 9999,
                          background: s.risk_band === 'critical' ? '#fee2e2' : '#fef3c7',
                          color: s.risk_band === 'critical' ? '#dc2626' : '#d97706',
                          fontSize: '0.725rem',
                          fontWeight: 700,
                          border: s.risk_band === 'critical' ? '1px solid #fecaca' : '1px solid #fde68a',
                          textTransform: 'capitalize',
                        }}
                      >
                        {s.risk_band || 'Critical'}
                      </span>
                    </td>

                    {/* Primary Driver */}
                    <td style={{ padding: '12px', color: '#334155', fontWeight: 500 }}>
                      {s.primary_reason || 'Academic performance risk'}
                    </td>

                    {/* Mastery */}
                    <td style={{ padding: '12px', fontWeight: 700, color: masteryVal < 40 ? '#dc2626' : '#334155' }}>
                      {masteryVal}%
                    </td>

                    {/* Grade Avg */}
                    <td style={{ padding: '12px', fontWeight: 700, color: gradeVal < 40 ? '#dc2626' : '#334155' }}>
                      {gradeVal}%
                    </td>

                    {/* Attendance */}
                    <td style={{ padding: '12px', fontWeight: 600, color: attVal < 60 ? '#dc2626' : '#334155' }}>
                      {attVal}%
                    </td>

                    {/* Engagement */}
                    <td style={{ padding: '12px', fontWeight: 600, color: '#334155' }}>
                      {focusVal}%
                    </td>

                    {/* Last Active */}
                    <td style={{ padding: '12px', color: '#64748b' }}>
                      {s.last_active || '—'}
                    </td>

                    {/* Action */}
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => onViewStudent && onViewStudent(s.student_id)}
                          style={{
                            padding: '4px 12px',
                            borderRadius: 8,
                            border: '1px solid #ddd6fe',
                            background: '#faf5ff',
                            color: '#7c3aed',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            border: 'none',
                            background: 'transparent',
                            color: '#94a3b8',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          <MoreHorizontal size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {filtered.length > 0 && (
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
            <strong style={{ color: '#0f172a' }}>{Math.min(page * pageSize, filtered.length)}</strong> of{' '}
            <strong style={{ color: '#0f172a' }}>{filtered.length}</strong> at-risk students
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
