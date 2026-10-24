'use client';

import React, { useState, useMemo } from 'react';
import { Plus, Search, CalendarClock } from 'lucide-react';
import styles from '../class-management.module.css';

interface DeadlineReliefTabProps {
  extensions: any[];
  onOpenGrantModal: () => void;
  onSelectStudent: (studentId: string) => void;
}

export const DeadlineReliefTab: React.FC<DeadlineReliefTabProps> = ({
  extensions,
  onOpenGrantModal,
  onSelectStudent,
}) => {
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expFilter, setExpFilter] = useState<string>('all');

  const displayList = useMemo(() => {
    const raw = extensions.length > 0 ? extensions : [
      {
        id: 'ext-1',
        student_id: 's1',
        student_name: 'Aadhya Pillai',
        roll_number: '0W26-CS1402',
        experiment_title: 'Lab 2 - Trees',
        type: 'Extension',
        original_deadline: '2026-10-18',
        extension_until: '2026-10-25',
        reason: 'Medical Leave',
        status: 'Active',
      },
      {
        id: 'ext-2',
        student_id: 's2',
        student_name: 'Aarav Gupta',
        roll_number: '0W26-CS1415',
        experiment_title: 'Lab 3 - Graphs',
        type: 'Extension',
        original_deadline: '2026-10-20',
        extension_until: '2026-10-27',
        reason: 'Personal Issue',
        status: 'Active',
      },
      {
        id: 'ext-3',
        student_id: 's3',
        student_name: 'Vihaan Rao',
        roll_number: '0W26-CS1488',
        experiment_title: 'Lab 4 - Stacks',
        type: 'Excused Absence',
        original_deadline: '2026-10-12',
        extension_until: '2026-10-22',
        reason: 'Exam Conflict',
        status: 'Active',
      },
      {
        id: 'ext-4',
        student_id: 's4',
        student_name: 'Aditi Sharma',
        roll_number: '0W26-CS1502',
        experiment_title: 'Lab 1 - Arrays',
        type: 'Extension',
        original_deadline: '2026-10-05',
        extension_until: '2026-10-12',
        reason: 'Health Issue',
        status: 'Active',
      },
      {
        id: 'ext-5',
        student_id: 's5',
        student_name: 'Meera Iyer',
        roll_number: '0W26-CS1510',
        experiment_title: 'Lab 2 - Trees',
        type: 'Extension',
        original_deadline: '2026-10-08',
        extension_until: '2026-10-15',
        reason: 'Family Event',
        status: 'Expired',
      },
    ];

    return raw.filter((item: any) => {
      const q = search.toLowerCase().trim();
      if (q) {
        const nameMatch = (item.student_name || '').toLowerCase().includes(q);
        const expMatch = (item.experiment_title || '').toLowerCase().includes(q);
        if (!nameMatch && !expMatch) return false;
      }
      if (statusFilter !== 'all') {
        const isExpired = new Date(item.extension_until || '') < new Date();
        const itemStatus = item.status || (isExpired ? 'Expired' : 'Active');
        if (statusFilter.toLowerCase() !== itemStatus.toLowerCase()) return false;
      }
      return true;
    });
  }, [extensions, search, statusFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* ── TOP ACTION & CONTROLS ROW ─────────────────────────────────── */}
      <div className={styles.filterPillsRow}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div className={styles.searchBox}>
            <Search size={14} color="#94a3b8" />
            <input
              type="text"
              placeholder="Search students or experiments..."
              className={styles.searchInput}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className={styles.filterSelect}
            value={expFilter}
            onChange={(e) => setExpFilter(e.target.value)}
          >
            <option value="all">All Experiments</option>
            <option value="trees">Lab 2 - Trees</option>
            <option value="graphs">Lab 3 - Graphs</option>
          </select>

          <select
            className={styles.filterSelect}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
          </select>
        </div>

        <button
          type="button"
          className={styles.btnPrimary}
          onClick={onOpenGrantModal}
        >
          <Plus size={15} /> Grant Relief
        </button>
      </div>

      {/* ── DEADLINE RELIEF TABLE ─────────────────────────────────────── */}
      <div className={styles.tableWrapper}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th style={{ width: 44, textAlign: 'center' }}>#</th>
              <th>Student</th>
              <th>Experiment</th>
              <th>Type</th>
              <th>Original Deadline</th>
              <th>New Deadline</th>
              <th>Reason</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayList.map((item: any, idx: number) => {
              const isExpired = new Date(item.extension_until || '') < new Date();
              const statusStr = item.status || (isExpired ? 'Expired' : 'Active');
              const isStatusActive = statusStr.toLowerCase() === 'active';

              return (
                <tr key={item.id || idx}>
                  <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem' }}>
                    {idx + 1}
                  </td>

                  <td>
                    <div className={styles.studentCell}>
                      <div className={styles.studentAvatar}>
                        {(item.student_name || 'S').slice(0, 2).toUpperCase()}
                      </div>
                      <div className={styles.studentMeta}>
                        <span
                          className={styles.studentName}
                          style={{ cursor: 'pointer' }}
                          onClick={() => item.student_id && onSelectStudent(item.student_id)}
                        >
                          {item.student_name || 'Student'}
                        </span>
                        <span className={styles.studentRoll}>
                          {item.roll_number || '—'}
                        </span>
                      </div>
                    </div>
                  </td>

                  <td>
                    <span
                      style={{
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        padding: '0.2rem 0.55rem',
                        borderRadius: 6,
                        background: '#f8fafc',
                        color: '#334155',
                        border: '1px solid #e2e8f0',
                      }}
                    >
                      {item.experiment_title || item.experiment || 'Lab Assignment'}
                    </span>
                  </td>

                  <td>
                    <span style={{ fontSize: '0.76rem', color: '#64748b', fontWeight: 500 }}>
                      {item.excused ? 'Excused Absence' : (item.type || 'Extension')}
                    </span>
                  </td>

                  <td>
                    <span style={{ fontSize: '0.76rem', color: '#64748b' }}>
                      {item.original_deadline ? new Date(item.original_deadline).toLocaleDateString() : '—'}
                    </span>
                  </td>

                  <td>
                    <span style={{ fontSize: '0.76rem', fontWeight: 600, color: '#0f172a' }}>
                      {item.extension_until ? new Date(item.extension_until).toLocaleDateString() : '—'}
                    </span>
                  </td>

                  <td>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        padding: '0.2rem 0.55rem',
                        borderRadius: 6,
                        background: '#f1f5f9',
                        color: '#475569',
                      }}
                    >
                      {item.reason || 'Medical Leave'}
                    </span>
                  </td>

                  <td>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        padding: '0.2rem 0.6rem',
                        borderRadius: 20,
                        background: isStatusActive ? '#ecfdf5' : '#fef2f2',
                        color: isStatusActive ? '#059669' : '#dc2626',
                        border: isStatusActive ? '1px solid #a7f3d0' : '1px solid #fecaca',
                      }}
                    >
                      {statusStr}
                    </span>
                  </td>

                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className={styles.btnActionView}
                      onClick={() => item.student_id && onSelectStudent(item.student_id)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
