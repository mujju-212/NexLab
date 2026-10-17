'use client';

import React, { useState } from 'react';
import {
  Calendar,
  RefreshCw,
  Zap,
  GraduationCap,
  BookOpen,
  Building,
  Layers,
  ChevronDown,
} from 'lucide-react';
import styles from './analytics.module.css';

interface DepartmentOption {
  id: string;
  name: string;
}

interface SectionOption {
  id: string;
  name: string;
}

interface BatchOption {
  id: string;
  name: string;
}

interface SubjectOption {
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
  batches?: BatchOption[];
  selectedBatch?: string;
  onBatchChange?: (batchId: string) => void;
  subjects?: SubjectOption[];
  selectedSubject?: string;
  onSubjectChange?: (subjectId: string) => void;
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
  batches = [
    { id: 'all', name: 'All Batches' },
    { id: '2028', name: '2028 (B.Tech)' },
    { id: '2027', name: '2027 (B.Tech)' },
    { id: '2026', name: '2026 (B.Tech)' },
    { id: '2025', name: '2025 (B.Tech)' },
  ],
  selectedBatch = 'all',
  onBatchChange,
  subjects = [],
  selectedSubject = '',
  onSubjectChange,
  comparePeriod = false,
  onComparePeriodChange,
  onRefresh,
  onRunSnapshots,
  isRefreshing = false,
}: FilterBarProps) {
  const [internalSpinning, setInternalSpinning] = useState(false);

  const handleRefreshClick = () => {
    setInternalSpinning(true);
    if (onRefresh) onRefresh();
    setTimeout(() => setInternalSpinning(false), 800);
  };

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 14,
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)',
      }}
    >
      {/* Left Filter Inputs Group */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flex: 1,
          flexWrap: 'nowrap',
        }}
      >
        {/* Calendar Bag Icon Badge */}
        <div
          style={{
            width: 35,
            height: 35,
            borderRadius: 9,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#7c3aed',
            flexShrink: 0,
            marginTop: 14,
          }}
          title="Filter Scope"
        >
          <Calendar size={16} />
        </div>

        {/* Date range */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 125, flex: '1 1 125px' }}>
          <label style={{ fontSize: '0.675rem', fontWeight: 600, color: '#64748b' }}>Date range</label>
          <div style={{ position: 'relative' }}>
            <select
              value={days}
              onChange={e => onDaysChange(Number(e.target.value))}
              style={{
                width: '100%',
                height: 35,
                padding: '0 22px 0 26px',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                background: '#ffffff',
                fontSize: '0.765rem',
                fontWeight: 600,
                color: '#0f172a',
                outline: 'none',
                appearance: 'none',
                cursor: 'pointer',
              }}
            >
              <option value={7}>Last 7 Days</option>
              <option value={14}>Last 14 Days</option>
              <option value={30}>Last 30 Days</option>
              <option value={60}>Last 60 Days</option>
              <option value={90}>Last 90 Days</option>
              <option value={365}>All Time</option>
            </select>
            <Calendar
              size={12}
              style={{ position: 'absolute', left: 8, top: 11, color: '#7c3aed', pointerEvents: 'none' }}
            />
            <ChevronDown
              size={12}
              style={{ position: 'absolute', right: 7, top: 11, color: '#94a3b8', pointerEvents: 'none' }}
            />
          </div>
        </div>

        {/* Department */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 135, flex: '1 1 135px' }}>
          <label style={{ fontSize: '0.675rem', fontWeight: 600, color: '#64748b' }}>Department</label>
          <div style={{ position: 'relative' }}>
            <select
              value={selectedDepartment}
              onChange={e => onDepartmentChange && onDepartmentChange(e.target.value)}
              style={{
                width: '100%',
                height: 35,
                padding: '0 20px 0 10px',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                background: '#ffffff',
                fontSize: '0.765rem',
                fontWeight: 600,
                color: '#0f172a',
                outline: 'none',
                appearance: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name.replace('& Engineering', '').replace('& Communication', '& Comm')}
                </option>
              ))}
            </select>
            <ChevronDown
              size={12}
              style={{ position: 'absolute', right: 7, top: 11, color: '#94a3b8', pointerEvents: 'none' }}
            />
          </div>
        </div>

        {/* Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 105, flex: '1 1 105px' }}>
          <label style={{ fontSize: '0.675rem', fontWeight: 600, color: '#64748b' }}>Section</label>
          <div style={{ position: 'relative' }}>
            <select
              value={selectedSection}
              onChange={e => onSectionChange && onSectionChange(e.target.value)}
              style={{
                width: '100%',
                height: 35,
                padding: '0 20px 0 10px',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                background: '#ffffff',
                fontSize: '0.765rem',
                fontWeight: 600,
                color: '#0f172a',
                outline: 'none',
                appearance: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="">All Sections</option>
              {sections.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={12}
              style={{ position: 'absolute', right: 7, top: 11, color: '#94a3b8', pointerEvents: 'none' }}
            />
          </div>
        </div>

        {/* Batch / Year */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 130, flex: '1 1 130px' }}>
          <label style={{ fontSize: '0.675rem', fontWeight: 600, color: '#64748b' }}>Batch / Year</label>
          <div style={{ position: 'relative' }}>
            <select
              value={selectedBatch}
              onChange={e => onBatchChange && onBatchChange(e.target.value)}
              style={{
                width: '100%',
                height: 35,
                padding: '0 20px 0 25px',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                background: '#ffffff',
                fontSize: '0.765rem',
                fontWeight: 600,
                color: '#0f172a',
                outline: 'none',
                appearance: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="">2028 (B.Tech)</option>
              {batches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <GraduationCap
              size={12}
              style={{ position: 'absolute', left: 8, top: 11, color: '#7c3aed', pointerEvents: 'none' }}
            />
            <ChevronDown
              size={12}
              style={{ position: 'absolute', right: 7, top: 11, color: '#94a3b8', pointerEvents: 'none' }}
            />
          </div>
        </div>

        {/* Subject */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 120, flex: '1 1 120px' }}>
          <label style={{ fontSize: '0.675rem', fontWeight: 600, color: '#64748b' }}>Subject</label>
          <div style={{ position: 'relative' }}>
            <select
              value={selectedSubject}
              onChange={e => onSubjectChange && onSubjectChange(e.target.value)}
              style={{
                width: '100%',
                height: 35,
                padding: '0 20px 0 25px',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                background: '#ffffff',
                fontSize: '0.765rem',
                fontWeight: 600,
                color: '#0f172a',
                outline: 'none',
                appearance: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="">All Subjects</option>
              {subjects.map(sub => (
                <option key={sub.id} value={sub.id}>
                  {sub.name}
                </option>
              ))}
            </select>
            <BookOpen
              size={12}
              style={{ position: 'absolute', left: 8, top: 11, color: '#7c3aed', pointerEvents: 'none' }}
            />
            <ChevronDown
              size={12}
              style={{ position: 'absolute', right: 7, top: 11, color: '#94a3b8', pointerEvents: 'none' }}
            />
          </div>
        </div>
      </div>

      {/* Right Side Controls: Compare Toggle + Refresh Button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
          marginTop: 14,
        }}
      >
        {onComparePeriodChange && (
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <div
              onClick={() => onComparePeriodChange(!comparePeriod)}
              style={{
                width: 34,
                height: 19,
                borderRadius: 9999,
                background: comparePeriod ? '#7c3aed' : '#cbd5e1',
                position: 'relative',
                transition: 'background 0.2s ease',
              }}
            >
              <div
                style={{
                  width: 15,
                  height: 15,
                  borderRadius: 9999,
                  background: '#ffffff',
                  position: 'absolute',
                  top: 2,
                  left: comparePeriod ? 17 : 2,
                  transition: 'left 0.2s ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }}
              />
            </div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>
              Compare with Previous Period
            </span>
          </label>
        )}

        {onRunSnapshots && (
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.outlineBtn}`}
            onClick={onRunSnapshots}
            title="Trigger on-demand daily metrics snapshot"
            style={{ height: 35, borderRadius: 8, fontSize: '0.75rem' }}
          >
            <Zap size={13} style={{ color: '#f59e0b' }} />
            <span>Snapshot</span>
          </button>
        )}

        {onRefresh && (
          <button
            type="button"
            onClick={handleRefreshClick}
            disabled={isRefreshing}
            style={{
              height: 35,
              padding: '0 16px',
              borderRadius: 8,
              background: '#7c3aed',
              color: '#ffffff',
              border: 'none',
              fontWeight: 700,
              fontSize: '0.785rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: isRefreshing ? 'wait' : 'pointer',
              boxShadow: '0 2px 8px rgba(124, 58, 237, 0.25)',
              transition: 'all 0.15s ease',
            }}
          >
            <RefreshCw
              size={13}
              style={{
                transition: 'transform 0.6s ease',
                transform: isRefreshing || internalSpinning ? 'rotate(360deg)' : 'none',
              }}
            />
            <span>Refresh</span>
          </button>
        )}
      </div>
    </div>
  );
}
