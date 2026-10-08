'use client';

import React, { useState, useMemo } from 'react';
import { Search, Download, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react';
import { exportCSV } from '@/lib/analytics-utils';
import styles from './analytics.module.css';

export interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
}

interface DataTableProps<T> {
  title?: string;
  subtitle?: string;
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  exportFilename?: string;
  searchPlaceholder?: string;
  pageSize?: number;
  rowKey?: (row: T) => string;
}

export function DataTable<T extends Record<string, any>>({
  title,
  subtitle,
  columns,
  data,
  onRowClick,
  exportFilename = 'analytics-export',
  searchPlaceholder = 'Search records...',
  pageSize = 10,
  rowKey,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);

  const rows = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  // Search filter
  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(row =>
      Object.values(row).some(v => v != null && String(v).toLowerCase().includes(q))
    );
  }, [rows, search]);

  // Sort
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va == null) return sortAsc ? 1 : -1;
      if (vb == null) return sortAsc ? -1 : 1;
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortAsc ? va - vb : vb - va;
      }
      return sortAsc
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
  }, [filtered, sortKey, sortAsc]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pagedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize]);

  const handleSort = (colKey: string) => {
    if (sortKey === colKey) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(colKey);
      setSortAsc(true);
    }
  };

  return (
    <div className={styles.tableWrapper}>
      <div className={styles.tableToolbar}>
        <div>
          {title && <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#111827' }}>{title}</h3>}
          {subtitle && <p style={{ margin: '2px 0 0', fontSize: '0.775rem', color: '#6b7280' }}>{subtitle}</p>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#9ca3af' }} />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className={styles.tableSearch}
            />
          </div>

          <button
            type="button"
            className={`${styles.actionBtn} ${styles.outlineBtn}`}
            onClick={() => exportCSV(rows, exportFilename)}
            title="Export CSV"
          >
            <Download size={14} />
            <span>CSV</span>
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              {columns.map(col => {
                const k = String(col.key);
                return (
                  <th
                    key={k}
                    className={col.sortable !== false ? styles.sortable : undefined}
                    onClick={() => col.sortable !== false && handleSort(k)}
                    style={{ textAlign: col.align || 'left' }}
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span>{col.header}</span>
                      {col.sortable !== false && (
                        <ArrowUpDown size={11} style={{ opacity: sortKey === k ? 1 : 0.3 }} />
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pagedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: 'center', padding: '32px 16px', color: '#9ca3af' }}>
                  No matching records found.
                </td>
              </tr>
            ) : (
              pagedData.map((row, idx) => {
                const rKey = rowKey ? rowKey(row) : `row-${idx}`;
                return (
                  <tr
                    key={rKey}
                    className={onRowClick ? styles.tableRowInteractive : undefined}
                    onClick={() => onRowClick && onRowClick(row)}
                  >
                    {columns.map(col => (
                      <td key={String(col.key)} style={{ textAlign: col.align || 'left' }}>
                        {col.render ? col.render(row) : (row[col.key as keyof T] ?? '—')}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className={styles.tablePagination}>
          <span>
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, sorted.length)} of {sorted.length} records
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.outlineBtn}`}
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              style={{ padding: '0 8px', height: 28 }}
            >
              <ChevronLeft size={14} />
            </button>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 6px', fontSize: '0.8rem', fontWeight: 600 }}>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.outlineBtn}`}
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              style={{ padding: '0 8px', height: 28 }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
