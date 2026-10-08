'use client';

import React from 'react';
import { Calendar, Filter, RefreshCw, Download, Zap } from 'lucide-react';
import styles from './analytics.module.css';

interface DepartmentOption {
  id: string;
  name: string;
}

interface SectionOption {
  id: string;
  name: string;
}

interface FilterBarProps {
  days: number;
  onDaysChange: (days: number) => void;
  departments?: DepartmentOption[];
  selectedDepartment?: string;
  onDepartmentChange?: (deptId: string) => void;
  sections?: SectionOption[];
  selectedSection?: string;
  onSectionChange?: (secId: string) => void;
  comparePeriod?: boolean;
  onComparePeriodChange?: (enabled: boolean) => void;
  onRefresh?: () => void;
  onExportAll?: () => void;
  onRunSnapshots?: () => void;
  isRefreshing?: boolean;
}

export function FilterBar({
  days,
  onDaysChange,
  departments = [],
  selectedDepartment = '',
  onDepartmentChange,
  sections = [],
  selectedSection = '',
  onSectionChange,
  comparePeriod,
  onComparePeriodChange,
  onRefresh,
  onExportAll,
  onRunSnapshots,
  isRefreshing = false,
}: FilterBarProps) {
  return (
    <div className={styles.filterBar}>
      <div className={styles.filterGroup}>
        {/* Date range preset */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Calendar size={15} style={{ color: '#7c3aed' }} />
          <span className={styles.filterLabel}>Window:</span>
          <select
            className={styles.filterSelect}
            value={days}
            onChange={e => onDaysChange(Number(e.target.value))}
          >
            <option value={7}>Last 7 Days</option>
            <option value={14}>Last 14 Days</option>
            <option value={30}>Last 30 Days</option>
            <option value={60}>Last 60 Days</option>
            <option value={90}>Last 90 Days</option>
          </select>
        </div>

        {/* Scope cascade: Department */}
        {departments.length > 0 && onDepartmentChange && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Filter size={15} style={{ color: '#7c3aed' }} />
            <span className={styles.filterLabel}>Dept:</span>
            <select
              className={styles.filterSelect}
              value={selectedDepartment}
              onChange={e => onDepartmentChange(e.target.value)}
            >
              <option value="">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Scope cascade: Section */}
        {sections.length > 0 && onSectionChange && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={styles.filterLabel}>Section:</span>
            <select
              className={styles.filterSelect}
              value={selectedSection}
              onChange={e => onSectionChange(e.target.value)}
            >
              <option value="">All Sections</option>
              {sections.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Compare period toggle */}
        {onComparePeriodChange && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', fontWeight: 600, color: '#4b5563', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={comparePeriod ?? false}
              onChange={e => onComparePeriodChange(e.target.checked)}
              style={{ accentColor: '#7c3aed', cursor: 'pointer' }}
            />
            <span>Compare vs Prior</span>
          </label>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {onRunSnapshots && (
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.outlineBtn}`}
            onClick={onRunSnapshots}
            title="Trigger on-demand daily metrics snapshot"
          >
            <Zap size={14} style={{ color: '#f59e0b' }} />
            <span>Run Snapshot</span>
          </button>
        )}

        {onExportAll && (
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.outlineBtn}`}
            onClick={onExportAll}
            title="Export CSV"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
        )}

        {onRefresh && (
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.primaryBtn}`}
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        )}
      </div>
    </div>
  );
}
