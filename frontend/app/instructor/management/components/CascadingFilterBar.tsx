'use client';

import React from 'react';
import { Building2, Calendar, Layers, Hash, BookOpen } from 'lucide-react';
import styles from '../class-management.module.css';

export interface FilterOption {
  id: string;
  name: string;
  code?: string;
}

interface CascadingFilterBarProps {
  departments: FilterOption[];
  years: FilterOption[];
  batches: FilterOption[];
  sections: FilterOption[];
  subjects: FilterOption[];
  selectedDept: string;
  onSelectDept: (val: string) => void;
  selectedYear: string;
  onSelectYear: (val: string) => void;
  selectedBatch: string;
  onSelectBatch: (val: string) => void;
  selectedSection: string;
  onSelectSection: (val: string) => void;
  selectedSubject: string;
  onSelectSubject: (val: string) => void;
}

export const CascadingFilterBar: React.FC<CascadingFilterBarProps> = ({
  departments,
  years,
  batches,
  sections,
  subjects,
  selectedDept,
  onSelectDept,
  selectedYear,
  onSelectYear,
  selectedBatch,
  onSelectBatch,
  selectedSection,
  onSelectSection,
  selectedSubject,
  onSelectSubject,
}) => {
  return (
    <div className={styles.filterRibbon}>
      {/* 1. Department */}
      <div className={styles.filterGroup}>
        <label className={styles.filterLabel}>
          <Building2 size={12} /> Department
        </label>
        <select
          className={styles.filterSelect}
          value={selectedDept}
          onChange={(e) => onSelectDept(e.target.value)}
        >
          <option value="all">All Departments ({departments.length})</option>
          {departments.map((d) => (
            <option key={d.id || d.code} value={d.id || d.code}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {/* 2. Academic Year */}
      <div className={styles.filterGroup}>
        <label className={styles.filterLabel}>
          <Calendar size={12} /> Academic Year
        </label>
        <select
          className={styles.filterSelect}
          value={selectedYear}
          onChange={(e) => onSelectYear(e.target.value)}
        >
          <option value="all">All Years</option>
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
            </option>
          ))}
        </select>
      </div>

      {/* 3. Batch */}
      <div className={styles.filterGroup}>
        <label className={styles.filterLabel}>
          <Layers size={12} /> Batch
        </label>
        <select
          className={styles.filterSelect}
          value={selectedBatch}
          onChange={(e) => onSelectBatch(e.target.value)}
        >
          <option value="all">All Batches ({batches.length})</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {/* 4. Section */}
      <div className={styles.filterGroup}>
        <label className={styles.filterLabel}>
          <Hash size={12} /> Section
        </label>
        <select
          className={styles.filterSelect}
          value={selectedSection}
          onChange={(e) => onSelectSection(e.target.value)}
        >
          <option value="all">All Sections ({sections.length})</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* 5. Subject */}
      <div className={styles.filterGroup}>
        <label className={styles.filterLabel}>
          <BookOpen size={12} /> Subject
        </label>
        <select
          className={styles.filterSelect}
          value={selectedSubject}
          onChange={(e) => onSelectSubject(e.target.value)}
        >
          <option value="all">All Subjects ({subjects.length})</option>
          {subjects.map((sub) => (
            <option key={sub.id} value={sub.id}>
              {sub.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};
