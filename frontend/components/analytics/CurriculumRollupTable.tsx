'use client';

import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  Search,
  Filter,
  Download,
  ArrowUpDown,
  MoreHorizontal,
  Check,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { exportCSV } from '@/lib/analytics-utils';

export interface CurriculumSubjectItem {
  subject_id: string;
  subject_name: string;
  code: string;
  department_name: string;
  enrolled_count: number;
  avg_grade: number;
  mastery_rate: number;
  completion_rate: number;
  difficulty_index: number;
  trend?: number[];
}

interface CurriculumRollupTableProps {
  subjects?: CurriculumSubjectItem[];
  onViewSubject?: (subjectId: string) => void;
}

export function CurriculumRollupTable({
  subjects = [],
  onViewSubject,
}: CurriculumRollupTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<keyof CurriculumSubjectItem>('enrolled_count');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const dataSource = subjects || [];

  React.useEffect(() => {
    setPage(1);
  }, [searchQuery, departmentFilter]);

  // Filtered & Sorted items
  const filteredAndSorted = useMemo(() => {
    let result = dataSource.filter(item => {
      const matchSearch =
        item.subject_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.department_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchDept = departmentFilter === 'ALL' || item.department_name === departmentFilter;
      return matchSearch && matchDept;
    });

    result.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      if (aVal === undefined) aVal = 0 as any;
      if (bVal === undefined) bVal = 0 as any;
      if (typeof aVal === 'string') {
        return sortOrder === 'asc'
          ? (aVal as string).localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal as string);
      }
      return sortOrder === 'asc' ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal);
    });

    return result;
  }, [dataSource, searchQuery, sortField, sortOrder, departmentFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / pageSize));
  const pagedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredAndSorted.slice(start, start + pageSize);
  }, [filteredAndSorted, page, pageSize]);

  const toggleSort = (field: keyof CurriculumSubjectItem) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(pagedItems.map(s => s.subject_id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleSelectOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleExportCSV = () => {
    const rows = filteredAndSorted.map(s => ({
      Subject: s.subject_name,
      Code: s.code,
      Department: s.department_name,
      Enrolled: s.enrolled_count,
      Avg_Grade: s.avg_grade,
      Mastery_Rate: `${s.mastery_rate}%`,
      Completion_Rate: `${s.completion_rate}%`,
      Difficulty_Index: s.difficulty_index,
    }));
    exportCSV(rows, 'curriculum_learning_outcomes');
  };

  // Render Mini Sparkline Curve
  const renderTrendSparkline = (points?: number[], isNegative?: boolean) => {
    const pts = points && points.length >= 2 ? points : [];
    if (pts.length < 2 || pts.every(p => p === 0)) {
      return <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>;
    }
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const range = max - min || 1;
    const width = 56;
    const height = 20;

    const pathPoints = pts
      .map((p, idx) => {
        const x = (idx / (pts.length - 1)) * width;
        const y = height - ((p - min) / range) * (height - 4) - 2;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' L ');

    const strokeColor = isNegative ? '#ef4444' : '#10b981';

    return (
      <svg width={width} height={height} style={{ overflow: 'visible' }}>
        <path
          d={pathPoints ? `M ${pathPoints}` : undefined}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  };

  // Grade score color pill
  const getGradePill = (grade: number) => {
    let bg = '#ecfdf5';
    let text = '#059669';
    let border = '#a7f3d0';

    if (grade >= 40) {
      bg = '#ecfdf5';
      text = '#059669';
      border = '#a7f3d0';
    } else if (grade >= 30) {
      bg = '#f0fdf4';
      text = '#15803d';
      border = '#bbf7d0';
    } else {
      bg = '#fffbeb';
      text = '#d97706';
      border = '#fde68a';
    }

    return (
      <span
        style={{
          display: 'inline-block',
          padding: '3px 8px',
          borderRadius: 6,
          backgroundColor: bg,
          border: `1px solid ${border}`,
          color: text,
          fontSize: '0.785rem',
          fontWeight: 700,
        }}
      >
        {grade.toFixed(1)} pts
      </span>
    );
  };

  // Difficulty index pill
  const getDifficultyPill = (diff: number) => {
    let bg = '#fff1f2';
    let text = '#e11d48';
    let border = '#fecdd3';

    if (diff >= 0.8) {
      bg = '#fff1f2';
      text = '#e11d48';
      border = '#fecdd3';
    } else if (diff >= 0.75) {
      bg = '#fff7ed';
      text = '#ea580c';
      border = '#fed7aa';
    } else {
      bg = '#fefce8';
      text = '#ca8a04';
      border = '#fef08a';
    }

    return (
      <span
        style={{
          display: 'inline-block',
          padding: '2px 8px',
          borderRadius: 6,
          backgroundColor: bg,
          border: `1px solid ${border}`,
          color: text,
          fontSize: '0.785rem',
          fontWeight: 700,
        }}
      >
        {diff.toFixed(2)}
      </span>
    );
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
        gap: 16,
      }}
    >
      {/* Header with Title and Action Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'rgba(124, 58, 237, 0.08)',
              color: '#7c3aed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <BookOpen size={20} />
          </div>
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: '1rem',
                fontWeight: 700,
                color: '#1e293b',
              }}
            >
              Curriculum Learning Outcomes Rollup
            </h3>
            <p
              style={{
                margin: '2px 0 0 0',
                fontSize: '0.785rem',
                color: '#64748b',
              }}
            >
              Unified subject performance including experiments and unified exams
            </p>
          </div>
        </div>

        {/* Right Actions: Search, Filter, Export */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Search Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              flex: '1 1 200px',
              maxWidth: 280,
            }}
          >
            <Search size={14} style={{ color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search subjects, code..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: '0.785rem',
                color: '#334155',
                width: '100%',
              }}
            />
          </div>

          {/* Filters Button */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowFilterModal(!showFilterModal)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 12px',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                background: showFilterModal ? 'rgba(124, 58, 237, 0.08)' : '#ffffff',
                color: showFilterModal ? '#7c3aed' : '#475569',
                fontSize: '0.785rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Filter size={13} />
              <span>Filters</span>
            </button>

            {showFilterModal && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  width: 200,
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                  zIndex: 30,
                  padding: 10,
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: 6 }}>
                  Department Filter
                </div>
                {['ALL', 'Computer Science', 'Electronics & Comm', 'Information Tech'].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setDepartmentFilter(d);
                      setShowFilterModal(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: 6,
                      border: 'none',
                      background: departmentFilter === d ? 'rgba(124, 58, 237, 0.08)' : 'transparent',
                      color: departmentFilter === d ? '#7c3aed' : '#334155',
                      fontSize: '0.785rem',
                      fontWeight: departmentFilter === d ? 700 : 500,
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    {d === 'ALL' ? 'All Departments' : d}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Export CSV Button */}
          <button
            type="button"
            onClick={handleExportCSV}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 14px',
              borderRadius: 8,
              border: 'none',
              background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
              color: '#ffffff',
              fontSize: '0.785rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(124, 58, 237, 0.25)',
              transition: 'opacity 0.15s ease',
            }}
          >
            <Download size={13} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div style={{ overflowX: 'auto', margin: '0 -24px' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.8125rem',
            textAlign: 'left',
          }}
        >
          <thead>
            <tr
              style={{
                borderTop: '1px solid #f1f5f9',
                borderBottom: '1px solid #f1f5f9',
                color: '#64748b',
                fontWeight: 600,
                fontSize: '0.75rem',
                backgroundColor: '#fafbfc',
              }}
            >
              <th style={{ padding: '12px 16px 12px 24px', width: 40 }}>
                <input
                  type="checkbox"
                  checked={
                    pagedItems.length > 0 &&
                    selectedIds.size === pagedItems.length
                  }
                  onChange={handleSelectAll}
                  style={{ cursor: 'pointer', accentColor: '#7c3aed' }}
                />
              </th>
              <th style={{ padding: '12px 12px', width: 40 }}>#</th>
              <th
                onClick={() => toggleSort('subject_name')}
                style={{ padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span>Subject & Code</span>
                  <ArrowUpDown size={12} style={{ color: '#94a3b8' }} />
                </div>
              </th>
              <th style={{ padding: '12px 16px' }}>Department</th>
              <th
                onClick={() => toggleSort('enrolled_count')}
                style={{ padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span>Enrolled</span>
                  <ArrowUpDown size={12} style={{ color: '#94a3b8' }} />
                </div>
              </th>
              <th
                onClick={() => toggleSort('avg_grade')}
                style={{ padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span>Avg Grade</span>
                  <ArrowUpDown size={12} style={{ color: '#94a3b8' }} />
                </div>
              </th>
              <th
                onClick={() => toggleSort('mastery_rate')}
                style={{ padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span>Mastery Rate</span>
                  <ArrowUpDown size={12} style={{ color: '#94a3b8' }} />
                </div>
              </th>
              <th
                onClick={() => toggleSort('completion_rate')}
                style={{ padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span>Completion</span>
                  <ArrowUpDown size={12} style={{ color: '#94a3b8' }} />
                </div>
              </th>
              <th
                onClick={() => toggleSort('difficulty_index')}
                style={{ padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span>Difficulty Index</span>
                  <ArrowUpDown size={12} style={{ color: '#94a3b8' }} />
                </div>
              </th>
              <th style={{ padding: '12px 16px' }}>Trend</th>
              <th style={{ padding: '12px 24px 12px 16px', textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {pagedItems.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ padding: '36px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                  {searchQuery.trim() || departmentFilter !== 'ALL'
                    ? 'No curriculum subjects match your search or filter criteria.'
                    : 'No curriculum subject records available.'}
                </td>
              </tr>
            ) : (
              pagedItems.map((item, idx) => {
                const isSelected = selectedIds.has(item.subject_id);
                const isNegativeTrend = item.trend && item.trend[item.trend.length - 1] < item.trend[0];
                const rowIdx = (page - 1) * pageSize + idx + 1;

                return (
                  <tr
                    key={item.subject_id}
                    style={{
                      borderBottom: '1px solid #f8fafc',
                      backgroundColor: isSelected ? 'rgba(124, 58, 237, 0.02)' : 'transparent',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    <td style={{ padding: '14px 16px 14px 24px' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectOne(item.subject_id)}
                        style={{ cursor: 'pointer', accentColor: '#7c3aed' }}
                      />
                    </td>
                    <td style={{ padding: '14px 12px', color: '#94a3b8', fontWeight: 600 }}>
                      {rowIdx}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: 700, color: '#1e293b' }}>{item.subject_name}</div>
                      <div style={{ fontSize: '0.725rem', color: '#94a3b8', marginTop: 1 }}>
                        {item.code}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#475569', fontWeight: 500 }}>
                      {item.department_name}
                    </td>
                    <td style={{ padding: '14px 16px', color: '#1e293b', fontWeight: 600 }}>
                      {(item.enrolled_count ?? 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {getGradePill(item.avg_grade ?? 0)}
                    </td>
                    <td style={{ padding: '14px 16px', color: '#1e293b', fontWeight: 600 }}>
                      {(item.mastery_rate ?? 0).toFixed(1)}%
                    </td>
                    <td style={{ padding: '14px 16px', color: '#1e293b', fontWeight: 600 }}>
                      {(item.completion_rate ?? 0).toFixed(1)}%
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {getDifficultyPill(item.difficulty_index ?? 0)}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {renderTrendSparkline(item.trend, isNegativeTrend)}
                    </td>
                    <td style={{ padding: '14px 24px 14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => onViewSubject && onViewSubject(item.subject_id)}
                          style={{
                            padding: '5px 12px',
                            borderRadius: 6,
                            border: 'none',
                            background: 'rgba(124, 58, 237, 0.08)',
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
                            border: '1px solid #e2e8f0',
                            background: '#ffffff',
                            color: '#94a3b8',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          <MoreHorizontal size={14} />
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
      {filteredAndSorted.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            borderTop: '1px solid #f1f5f9',
            fontSize: '0.8rem',
            color: '#64748b',
          }}
        >
          <div>
            Showing <strong style={{ color: '#0f172a' }}>{(page - 1) * pageSize + 1}</strong> to{' '}
            <strong style={{ color: '#0f172a' }}>{Math.min(page * pageSize, filteredAndSorted.length)}</strong> of{' '}
            <strong style={{ color: '#0f172a' }}>{filteredAndSorted.length}</strong> subjects
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
