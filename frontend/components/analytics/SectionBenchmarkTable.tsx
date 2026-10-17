'use client';

import React, { useState, useMemo } from 'react';
import {
  Layers,
  Search,
  Filter,
  Download,
  MoreHorizontal,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

interface SectionEntity {
  id: string;
  name: string;
  section_name?: string;
  department_name?: string;
  student_count: number;
  avg_grade?: number;
  z_score?: number;
  percentile_rank?: string;
  vs_campus?: number;
  trend?: number[];
}

interface SectionBenchmarkTableProps {
  sections?: SectionEntity[];
  onViewSection?: (sectionId: string) => void;
  onExportCSV?: () => void;
}

type SortField =
  | 'name'
  | 'department_name'
  | 'student_count'
  | 'avg_grade'
  | 'z_score'
  | 'percentile_rank'
  | 'vs_campus';

type SortOrder = 'asc' | 'desc';

export function SectionBenchmarkTable({
  sections = [],
  onViewSection,
  onExportCSV,
}: SectionBenchmarkTableProps) {
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [sortField, setSortField] = useState<SortField>('avg_grade');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const rawList = sections || [];

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const renderSortIcon = (field: SortField) => {
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
          s.name?.toLowerCase().includes(q) ||
          s.section_name?.toLowerCase().includes(q) ||
          s.department_name?.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (sortField === 'name') {
        aVal = a.name || a.section_name || '';
        bVal = b.name || b.section_name || '';
      }

      if (typeof aVal === 'string') {
        const cmp = (aVal || '').localeCompare(bVal || '');
        return sortOrder === 'asc' ? cmp : -cmp;
      }

      const numA = Number(aVal ?? (sortOrder === 'asc' ? Infinity : -Infinity));
      const numB = Number(bVal ?? (sortOrder === 'asc' ? Infinity : -Infinity));
      return sortOrder === 'asc' ? numA - numB : numB - numA;
    });

    return list;
  }, [rawList, search, sortField, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page]);

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(s => s.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // Render a mini trend sparkline SVG without any mock fallbacks
  const renderTrendSvg = (trend?: number[], isPositive = true) => {
    if (!trend || trend.length < 2 || trend.every(v => v === 0)) {
      return <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>—</span>;
    }
    const pts = trend;
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const range = max - min || 1;
    const width = 64;
    const height = 18;
    const step = width / (pts.length - 1);

    const pathD = pts.reduce((acc, pt, idx) => {
      const x = idx * step;
      const y = height - ((pt - min) / range) * (height - 4) - 2;
      return idx === 0 ? `M ${x},${y}` : `${acc} L ${x},${y}`;
    }, '');

    const strokeColor = isPositive ? '#10b981' : '#ef4444';

    return (
      <svg width={width} height={height} style={{ overflow: 'visible', verticalAlign: 'middle' }}>
        <path
          d={pathD}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
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
              background: '#f3e8ff',
              color: '#7c3aed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Layers size={18} />
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
              Section Statistical Benchmark Table
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#64748b' }}>
              Detailed comparison of section performance, percentiles and baseline deviations
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
              placeholder="Search sections..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                height: 34,
                width: 240,
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

          <button
            type="button"
            onClick={onExportCSV}
            style={{
              height: 34,
              padding: '0 14px',
              borderRadius: 8,
              border: 'none',
              background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
              color: '#ffffff',
              fontSize: '0.775rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(124, 58, 237, 0.25)',
            }}
          >
            <Download size={13} />
            <span>Export CSV</span>
          </button>
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
                  checked={selectedIds.size === filtered.length && filtered.length > 0}
                  onChange={toggleSelectAll}
                  style={{ accentColor: '#7c3aed', cursor: 'pointer' }}
                />
              </th>
              <th style={{ padding: '10px 8px', color: '#64748b', fontWeight: 600, width: 36 }}>#</th>
              <th
                onClick={() => handleSort('name')}
                style={{ padding: '10px 12px', color: sortField === 'name' ? '#7c3aed' : '#64748b', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <span>Section Name</span>
                  {renderSortIcon('name')}
                </div>
              </th>
              <th
                onClick={() => handleSort('department_name')}
                style={{ padding: '10px 12px', color: sortField === 'department_name' ? '#7c3aed' : '#64748b', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <span>Department</span>
                  {renderSortIcon('department_name')}
                </div>
              </th>
              <th
                onClick={() => handleSort('student_count')}
                style={{ padding: '10px 12px', color: sortField === 'student_count' ? '#7c3aed' : '#64748b', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <span>Students</span>
                  {renderSortIcon('student_count')}
                </div>
              </th>
              <th
                onClick={() => handleSort('avg_grade')}
                style={{ padding: '10px 12px', color: sortField === 'avg_grade' ? '#7c3aed' : '#64748b', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <span>Avg Grade</span>
                  {renderSortIcon('avg_grade')}
                </div>
              </th>
              <th
                onClick={() => handleSort('z_score')}
                style={{ padding: '10px 12px', color: sortField === 'z_score' ? '#7c3aed' : '#64748b', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <span>Z-Score</span>
                  {renderSortIcon('z_score')}
                </div>
              </th>
              <th
                onClick={() => handleSort('percentile_rank')}
                style={{ padding: '10px 12px', color: sortField === 'percentile_rank' ? '#7c3aed' : '#64748b', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <span>Percentile Rank</span>
                  {renderSortIcon('percentile_rank')}
                </div>
              </th>
              <th
                onClick={() => handleSort('vs_campus')}
                style={{ padding: '10px 12px', color: sortField === 'vs_campus' ? '#7c3aed' : '#64748b', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <span>Vs Campus</span>
                  {renderSortIcon('vs_campus')}
                </div>
              </th>
              <th style={{ padding: '10px 12px', color: '#64748b', fontWeight: 600 }}>Trend</th>
              <th style={{ padding: '10px 12px', color: '#64748b', fontWeight: 600, textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ textAlign: 'center', padding: '36px 16px', color: '#94a3b8' }}>
                  No sections matching benchmark criteria found.
                </td>
              </tr>
            ) : (
              paged.map((sec, idx) => {
                const itemIndex = (page - 1) * pageSize + idx + 1;
                const isChecked = selectedIds.has(sec.id);
                const isPositiveZ = (sec.z_score ?? 0) >= 0;
                const isPositiveDelta = (sec.vs_campus ?? 0) >= 0;
                const isTop = sec.percentile_rank?.toLowerCase().includes('top');

                return (
                  <tr
                    key={sec.id}
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
                        onChange={() => toggleSelect(sec.id)}
                        style={{ accentColor: '#7c3aed', cursor: 'pointer' }}
                      />
                    </td>

                    {/* Index */}
                    <td style={{ padding: '12px 8px', color: '#94a3b8', fontWeight: 600 }}>
                      {itemIndex}
                    </td>

                    {/* Section Name */}
                    <td style={{ padding: '12px', fontWeight: 700, color: '#0f172a' }}>
                      {sec.name || sec.section_name}
                    </td>

                    {/* Department */}
                    <td style={{ padding: '12px', color: '#475569', fontWeight: 500 }}>
                      {sec.department_name || 'General Science'}
                    </td>

                    {/* Students */}
                    <td style={{ padding: '12px', color: '#64748b', fontWeight: 600 }}>
                      {sec.student_count}
                    </td>

                    {/* Avg Grade */}
                    <td style={{ padding: '12px', fontWeight: 700, color: '#1e293b' }}>
                      {sec.avg_grade != null ? sec.avg_grade.toFixed(1) : '—'}
                    </td>

                    {/* Z-Score */}
                    <td
                      style={{
                        padding: '12px',
                        fontWeight: 700,
                        color: isPositiveZ ? '#10b981' : '#ef4444',
                      }}
                    >
                      {sec.z_score != null
                        ? `${sec.z_score > 0 ? '+' : ''}${sec.z_score.toFixed(2)}`
                        : '—'}
                    </td>

                    {/* Percentile Rank */}
                    <td style={{ padding: '12px' }}>
                      {sec.percentile_rank ? (
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: 9999,
                            background: isTop ? '#ecfdf5' : '#fef2f2',
                            color: isTop ? '#059669' : '#dc2626',
                            fontSize: '0.725rem',
                            fontWeight: 700,
                            border: `1px solid ${isTop ? '#a7f3d0' : '#fecaca'}`,
                          }}
                        >
                          {sec.percentile_rank}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>

                    {/* Vs Campus */}
                    <td
                      style={{
                        padding: '12px',
                        fontWeight: 700,
                        color: isPositiveDelta ? '#10b981' : '#ef4444',
                      }}
                    >
                      {sec.vs_campus != null
                        ? `${sec.vs_campus > 0 ? '+' : ''}${sec.vs_campus.toFixed(1)}`
                        : '—'}
                    </td>

                    {/* Trend Sparkline */}
                    <td style={{ padding: '12px' }}>
                      {renderTrendSvg(sec.trend, isPositiveDelta)}
                    </td>

                    {/* Action */}
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => onViewSection && onViewSection(sec.id)}
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 16,
          paddingTop: 14,
          borderTop: '1px solid #f1f5f9',
          fontSize: '0.8125rem',
          color: '#64748b',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <span>
          Showing {filtered.length > 0 ? (page - 1) * pageSize + 1 : 0} to{' '}
          {Math.min(page * pageSize, filtered.length)} of {filtered.length} sections
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: '5px 12px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              color: '#334155',
              cursor: page === 1 ? 'not-allowed' : 'pointer',
              opacity: page === 1 ? 0.5 : 1,
              fontWeight: 600,
              fontSize: '0.75rem',
            }}
          >
            Previous
          </button>
          <span style={{ fontWeight: 600, color: '#1e293b' }}>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            style={{
              padding: '5px 12px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              color: '#334155',
              cursor: page >= totalPages ? 'not-allowed' : 'pointer',
              opacity: page >= totalPages ? 0.5 : 1,
              fontWeight: 600,
              fontSize: '0.75rem',
            }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
