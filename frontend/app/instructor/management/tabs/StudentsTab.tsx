'use client';

import React, { useState, useMemo } from 'react';
import { Search, Filter, Columns, ChevronDown, Eye } from 'lucide-react';
import styles from '../class-management.module.css';

interface StudentsTabProps {
  students: any[];
  onSelectStudent: (studentId: string) => void;
}

export const StudentsTab: React.FC<StudentsTabProps> = ({
  students,
  onSelectStudent,
}) => {
  const [search, setSearch] = useState<string>('');
  const [filterSegment, setFilterSegment] = useState<'all' | 'at_risk' | 'attention' | 'good'>('all');

  // Counts for segment pills
  const counts = useMemo(() => {
    let atRisk = 0;
    let attention = 0;
    let good = 0;
    students.forEach((s) => {
      const b = (s.risk_band || s.status_band || 'ok').toLowerCase();
      if (b === 'critical' || b === 'high') atRisk++;
      else if (b === 'watch') attention++;
      else good++;
    });
    return {
      all: students.length,
      atRisk,
      attention,
      good,
    };
  }, [students]);

  // Filtered students
  const filtered = useMemo(() => {
    return students.filter((s) => {
      // 1. Search filter
      const q = search.toLowerCase().trim();
      if (q) {
        const nameMatch = (s.student_name || s.full_name || '').toLowerCase().includes(q);
        const rollMatch = (s.roll_number || '').toLowerCase().includes(q);
        const emailMatch = (s.email || '').toLowerCase().includes(q);
        if (!nameMatch && !rollMatch && !emailMatch) return false;
      }

      // 2. Segment filter
      const b = (s.risk_band || s.status_band || 'ok').toLowerCase();
      if (filterSegment === 'at_risk') return b === 'critical' || b === 'high';
      if (filterSegment === 'attention') return b === 'watch';
      if (filterSegment === 'good') return b === 'ok' || b === 'low';
      return true;
    });
  }, [students, search, filterSegment]);

  const getRiskBadgeClass = (band: string) => {
    switch (band?.toLowerCase()) {
      case 'critical':
        return styles.riskCritical;
      case 'high':
        return styles.riskHigh;
      case 'watch':
        return styles.riskWatch;
      case 'ok':
      case 'on track':
        return styles.riskOk;
      default:
        return styles.riskUnknown;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* ── SEARCH & CONTROLS ROW ────────────────────────────────────── */}
      <div className={styles.filterPillsRow}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div className={styles.searchBox}>
            <Search size={15} color="#94a3b8" />
            <input
              type="text"
              placeholder="Search by name, roll number or email..."
              className={styles.searchInput}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Segment Pills */}
          <div className={styles.pillsGroup}>
            <button
              type="button"
              className={`${styles.pillBtn} ${filterSegment === 'all' ? styles.pillBtnActive : ''}`}
              onClick={() => setFilterSegment('all')}
            >
              All ({counts.all})
            </button>
            <button
              type="button"
              className={`${styles.pillBtn} ${filterSegment === 'at_risk' ? styles.pillBtnActive : ''}`}
              onClick={() => setFilterSegment('at_risk')}
            >
              At Risk ({counts.atRisk})
            </button>
            <button
              type="button"
              className={`${styles.pillBtn} ${filterSegment === 'attention' ? styles.pillBtnActive : ''}`}
              onClick={() => setFilterSegment('attention')}
            >
              Needs Attention ({counts.attention})
            </button>
            <button
              type="button"
              className={`${styles.pillBtn} ${filterSegment === 'good' ? styles.pillBtnActive : ''}`}
              onClick={() => setFilterSegment('good')}
            >
              Performing Well ({counts.good})
            </button>
          </div>
        </div>

        {/* Action Controls on right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button type="button" className={styles.btnSecondary}>
            <Filter size={13} /> Filters
          </button>
          <button type="button" className={styles.btnSecondary}>
            <Columns size={13} /> Columns
          </button>
          <button type="button" className={styles.btnSecondary}>
            Actions <ChevronDown size={13} />
          </button>
        </div>
      </div>

      {/* ── STUDENTS DATA TABLE ────────────────────────────────────────── */}
      <div className={styles.tableWrapper}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th style={{ width: 44, textAlign: 'center' }}>#</th>
              <th>Student</th>
              <th>Risk</th>
              <th>Overall Progress</th>
              <th>Attendance</th>
              <th>Avg. Score</th>
              <th>Last Active</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '3rem 0', color: '#94a3b8' }}>
                  No students found matching current filters.
                </td>
              </tr>
            ) : (
              filtered.map((s, idx) => {
                const band = s.risk_band || s.status_band || 'ok';
                const progressPct = s.completion?.completion_pct ?? s.mastery_pct ?? Math.round(s.progress || 0);
                const score = s.grade_avg != null ? Math.round(s.grade_avg) : (s.avg_score != null ? Math.round(s.avg_score) : null);
                const attRate = s.attendance_rate != null ? Math.round(s.attendance_rate) : (s.attendance_pct != null ? Math.round(s.attendance_pct) : null);

                return (
                  <tr key={s.student_id || idx}>
                    <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem' }}>
                      {idx + 1}
                    </td>

                    {/* Student Avatar + Meta */}
                    <td>
                      <div className={styles.studentCell}>
                        <div className={styles.studentAvatar}>
                          {(s.initials || (s.student_name || s.full_name || 'S').slice(0, 2)).toUpperCase()}
                        </div>
                        <div className={styles.studentMeta}>
                          <span
                            className={styles.studentName}
                            style={{ cursor: 'pointer' }}
                            onClick={() => onSelectStudent(s.student_id)}
                          >
                            {s.student_name || s.full_name || 'Student'}
                          </span>
                          <span className={styles.studentRoll}>
                            {s.roll_number || s.email || '—'}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Risk Badge */}
                    <td>
                      <span className={`${styles.riskPill} ${getRiskBadgeClass(band)}`}>
                        {band}
                      </span>
                    </td>

                    {/* Overall Progress */}
                    <td>
                      <div className={styles.progressCell}>
                        <div className={styles.progressBarBg}>
                          <div
                            className={styles.progressBarFill}
                            style={{ width: `${Math.min(100, progressPct)}%` }}
                          />
                        </div>
                        <span className={styles.progressLabel}>
                          {progressPct}%
                        </span>
                      </div>
                    </td>

                    {/* Attendance */}
                    <td>
                      <span style={{ fontWeight: 600, color: '#334155' }}>
                        {attRate != null ? `${attRate}%` : '—'}
                      </span>
                    </td>

                    {/* Avg Score */}
                    <td>
                      <span style={{ fontWeight: 600, color: '#334155' }}>
                        {score != null ? `${score}%` : '—'}
                      </span>
                    </td>

                    {/* Last Active */}
                    <td>
                      <span style={{ fontSize: '0.76rem', color: '#64748b' }}>
                        {s.last_active_at ? new Date(s.last_active_at).toLocaleDateString() : 'Active recently'}
                      </span>
                    </td>

                    {/* Action View */}
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className={styles.btnActionView}
                        onClick={() => onSelectStudent(s.student_id)}
                      >
                        View
                      </button>
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
};
