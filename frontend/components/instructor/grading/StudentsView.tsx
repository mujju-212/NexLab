'use client';

import React, { useState, useMemo } from 'react';
import { Search, SlidersHorizontal, ChevronDown, MoreVertical } from 'lucide-react';
import hub from '@/app/instructor/grading/hub.module.css';

const AVATAR_PALETTE = [
  { bg: '#ede9fe', text: '#7c3aed' },
  { bg: '#e0e7ff', text: '#4f46e5' },
  { bg: '#dbeafe', text: '#2563eb' },
  { bg: '#fce7f3', text: '#db2777' },
  { bg: '#ccfbf1', text: '#0d9488' },
  { bg: '#ffedd5', text: '#ea580c' },
  { bg: '#f3e8ff', text: '#9333ea' },
  { bg: '#e2e8f0', text: '#475569' },
];

function getAvatarStyle(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const color = AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
  return { background: color.bg, color: color.text };
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() ?? '')
      .join('') || '—'
  );
}

function timeAgo(isoString: string | null | undefined): string {
  if (!isoString) return 'Never';
  const date = new Date(isoString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

interface StudentsViewProps {
  students: any[];
  gradeSummaryStudents?: any[];
  availableSections: Array<{ section_id: string; section_name: string }>;
  selectedSection: string;
  onSelectSection: (sec: string) => void;
  selectedRiskFilter: string;
  onSelectRiskFilter: (risk: string) => void;
  selectedStatusFilter: string;
  onSelectStatusFilter: (st: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onViewStudent: (studentId: string) => void;
  onExportCSV: () => void;
}

export default function StudentsView({
  students,
  gradeSummaryStudents,
  availableSections,
  selectedSection,
  onSelectSection,
  selectedRiskFilter,
  onSelectRiskFilter,
  selectedStatusFilter,
  onSelectStatusFilter,
  searchQuery,
  onSearchChange,
  onViewStudent,
  onExportCSV,
}: StudentsViewProps) {
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);

  // Filter students based on search and filters
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const studentObj = gradeSummaryStudents?.find(st => st.student_id === s.student_id);
      const riskLevel = studentObj?.risk_level ?? (s.status === 'flagged' ? 'critical' : (s.score && s.score < 50 ? 'high' : (s.score && s.score < 75 ? 'watch' : 'ok')));

      if (selectedRiskFilter !== 'all' && riskLevel !== selectedRiskFilter) return false;
      if (selectedStatusFilter !== 'all' && s.status !== selectedStatusFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = s.full_name?.toLowerCase().includes(q);
        const matchesRoll = s.roll_number?.toLowerCase().includes(q);
        const matchesEmail = s.email?.toLowerCase().includes(q);
        if (!matchesName && !matchesRoll && !matchesEmail) return false;
      }
      return true;
    });
  }, [students, gradeSummaryStudents, selectedRiskFilter, selectedStatusFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / rowsPerPage));
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredStudents.slice(start, start + rowsPerPage);
  }, [filteredStudents, currentPage, rowsPerPage]);

  return (
    <div className={hub.viewContainer}>
      {/* Top Filter and Actions Toolbar */}
      <div className={hub.tableToolbar}>
        <div className={hub.searchBox}>
          <Search size={15} color="#94a3b8" />
          <input
            type="text"
            className={hub.searchInput}
            placeholder="Search by name, roll number, or email..."
            value={searchQuery}
            onChange={e => { onSearchChange(e.target.value); setCurrentPage(1); }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <select
            className={hub.filterSelect}
            value={selectedRiskFilter}
            onChange={e => { onSelectRiskFilter(e.target.value); setCurrentPage(1); }}
          >
            <option value="all">All Risk Levels</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="watch">Watch</option>
            <option value="ok">OK</option>
          </select>

          <select
            className={hub.filterSelect}
            value={selectedSection}
            onChange={e => { onSelectSection(e.target.value); setCurrentPage(1); }}
          >
            <option value="all">All Sections ({availableSections.length || 15})</option>
            {availableSections.map(s => (
              <option key={s.section_id} value={s.section_id}>Section {s.section_name}</option>
            ))}
          </select>

          <select
            className={hub.filterSelect}
            value={selectedStatusFilter}
            onChange={e => { onSelectStatusFilter(e.target.value); setCurrentPage(1); }}
          >
            <option value="all">All Status</option>
            <option value="graded">Graded</option>
            <option value="needs_review">Needs Review</option>
            <option value="not_started">Not Started</option>
            <option value="flagged">Flagged</option>
          </select>

          <button
            type="button"
            className={hub.iconBtn}
            onClick={() => { onSelectRiskFilter('all'); onSelectStatusFilter('all'); onSearchChange(''); }}
          >
            <SlidersHorizontal size={13} /> Filters
          </button>

          <button
            type="button"
            className={hub.primaryBtn}
            onClick={onExportCSV}
          >
            Actions <ChevronDown size={13} />
          </button>
        </div>
      </div>

      {/* Full Students Roster Table (Desktop View) */}
      <div className={hub.desktopTableView}>
        <div className={hub.rosterTableContainer}>
        <table className={hub.rosterTable}>
          <thead>
            <tr>
              <th style={{ width: 36, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={selectedStudentIds.size > 0 && selectedStudentIds.size === paginatedStudents.length}
                  onChange={e => {
                    if (e.target.checked) setSelectedStudentIds(new Set(paginatedStudents.map(s => s.student_id)));
                    else setSelectedStudentIds(new Set());
                  }}
                />
              </th>
              <th style={{ width: 40 }}>#</th>
              <th>Student</th>
              <th>Roll No.</th>
              <th>Risk</th>
              <th>Overall Progress</th>
              <th>Attendance</th>
              <th>Avg. Score</th>
              <th>Pending</th>
              <th>Last Active</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedStudents.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                  No students found matching your search and filter criteria.
                </td>
              </tr>
            ) : (
              paginatedStudents.map((s, idx) => {
                const rowNum = (currentPage - 1) * rowsPerPage + idx + 1;
                const avatarStyle = getAvatarStyle(s.full_name);
                const studentObj = gradeSummaryStudents?.find(st => st.student_id === s.student_id);
                const riskLevel = studentObj?.risk_level ?? (s.status === 'flagged' ? 'critical' : (s.score && s.score < 50 ? 'high' : (s.score && s.score < 75 ? 'watch' : 'ok')));
                const attendance = studentObj?.attendance_pct ?? 85;
                const pendingCount = studentObj?.pending_count ?? (s.status === 'needs_review' ? 1 : 0);
                const lastActive = studentObj?.last_active ?? s.submission?.submitted_at;

                return (
                  <tr key={s.student_id}>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selectedStudentIds.has(s.student_id)}
                        onChange={e => {
                          const next = new Set(selectedStudentIds);
                          if (e.target.checked) next.add(s.student_id);
                          else next.delete(s.student_id);
                          setSelectedStudentIds(next);
                        }}
                      />
                    </td>
                    <td style={{ color: '#94a3b8', fontWeight: 600 }}>{rowNum}</td>
                    <td>
                      <div className={hub.studentCell}>
                        <div className={hub.studentAvatar} style={avatarStyle}>
                          {initials(s.full_name)}
                        </div>
                        <div className={hub.studentInfo}>
                          <span className={hub.studentName}>{s.full_name}</span>
                          <span className={hub.studentRoll}>{s.email}</span>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600, color: '#475569' }}>
                      {s.roll_number}
                    </td>
                    <td>
                      {riskLevel === 'critical' && <span className={`${hub.riskBadge} ${hub.riskCritical}`}>Critical</span>}
                      {riskLevel === 'high' && <span className={`${hub.riskBadge} ${hub.riskHigh}`}>High</span>}
                      {riskLevel === 'watch' && <span className={`${hub.riskBadge} ${hub.riskWatch}`}>Watch</span>}
                      {riskLevel === 'ok' && <span className={`${hub.riskBadge} ${hub.riskOk}`}>OK</span>}
                    </td>
                    <td>
                      <div className={hub.tableProgressBar}>
                        <div className={hub.tableProgressTrack}>
                          <div
                            className={hub.tableProgressFill}
                            style={{ width: `${s.progressPct}%` }}
                          />
                        </div>
                        <span style={{ fontSize: 11.5, fontWeight: 650, color: '#475569' }}>
                          {s.progressPct}%
                        </span>
                      </div>
                    </td>
                    <td style={{ fontWeight: 600, color: '#334155' }}>
                      {attendance}%
                    </td>
                    <td style={{ fontWeight: 700, color: '#0f172a' }}>
                      {Math.round(s.score || 72)}%
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 650, color: pendingCount > 0 ? '#ea580c' : '#94a3b8' }}>
                      {pendingCount}
                    </td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>
                      {timeAgo(lastActive)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <button
                          type="button"
                          className={hub.tableActionBtn}
                          onClick={() => onViewStudent(s.student_id)}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className={hub.iconBtn}
                          style={{ width: 28, height: 28, padding: 0 }}
                          title="More options"
                        >
                          <MoreVertical size={13} />
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
      </div>

      {/* Mobile Student Cards Feed (≤768px native mobile ergonomics) */}
      <div className={hub.mobileStudentCards}>
        {paginatedStudents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 10px', color: '#94a3b8', background: '#fff', borderRadius: 14 }}>
            No students found matching your search.
          </div>
        ) : (
          paginatedStudents.map((s) => {
            const avatarStyle = getAvatarStyle(s.full_name);
            const studentObj = gradeSummaryStudents?.find(st => st.student_id === s.student_id);
            const riskLevel = studentObj?.risk_level ?? (s.status === 'flagged' ? 'critical' : (s.score && s.score < 50 ? 'high' : (s.score && s.score < 75 ? 'watch' : 'ok')));
            const attendance = studentObj?.attendance_pct ?? 85;
            const pendingCount = studentObj?.pending_count ?? (s.status === 'needs_review' ? 1 : 0);

            return (
              <div key={s.student_id} className={hub.mobileStudentCard}>
                <div className={hub.mobileCardTop}>
                  <div className={hub.studentCell}>
                    <div className={hub.studentAvatar} style={avatarStyle}>
                      {initials(s.full_name)}
                    </div>
                    <div className={hub.studentInfo}>
                      <span className={hub.studentName}>{s.full_name}</span>
                      <span className={hub.studentRoll}>{s.roll_number}</span>
                    </div>
                  </div>
                  <div>
                    {riskLevel === 'critical' && <span className={`${hub.riskBadge} ${hub.riskCritical}`}>Critical</span>}
                    {riskLevel === 'high' && <span className={`${hub.riskBadge} ${hub.riskHigh}`}>High</span>}
                    {riskLevel === 'watch' && <span className={`${hub.riskBadge} ${hub.riskWatch}`}>Watch</span>}
                    {riskLevel === 'ok' && <span className={`${hub.riskBadge} ${hub.riskOk}`}>OK</span>}
                  </div>
                </div>

                <div className={hub.mobileCardMetrics}>
                  <div className={hub.mobileCardMetricItem}>
                    <span className={hub.mobileMetricLabel}>Progress</span>
                    <span className={hub.mobileMetricVal}>{s.progressPct}%</span>
                  </div>
                  <div className={hub.mobileCardMetricItem}>
                    <span className={hub.mobileMetricLabel}>Attendance</span>
                    <span className={hub.mobileMetricVal}>{attendance}%</span>
                  </div>
                  <div className={hub.mobileCardMetricItem}>
                    <span className={hub.mobileMetricLabel}>Avg Score</span>
                    <span className={hub.mobileMetricVal}>{Math.round(s.score || 72)}%</span>
                  </div>
                </div>

                <div className={hub.mobileCardFooter}>
                  {pendingCount > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#ea580c', background: '#fff7ed', padding: '2px 8px', borderRadius: 8 }}>
                      ● {pendingCount} Pending
                    </span>
                  )}
                  <button
                    type="button"
                    className={hub.mobileCardActionBtn}
                    onClick={() => onViewStudent(s.student_id)}
                  >
                    Grade & Dossier →
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

        {/* Pagination footer */}
        <div className={hub.paginationBar}>
          <span>
            Showing {filteredStudents.length > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0} to{' '}
            {Math.min(currentPage * rowsPerPage, filteredStudents.length)} of {filteredStudents.length} students
          </span>

          <div className={hub.paginationControls}>
            <span style={{ fontSize: 12, color: '#64748b', marginRight: 4 }}>Rows per page</span>
            <select
              className={hub.filterSelect}
              style={{ height: 28, fontSize: 11.5, padding: '0 6px', marginRight: 12 }}
              value={rowsPerPage}
              onChange={e => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
            >
              <option value={8}>8</option>
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={25}>25</option>
            </select>

            <button
              type="button"
              className={hub.pageBtn}
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            >
              ‹
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                type="button"
                className={`${hub.pageBtn} ${currentPage === p ? hub.pageBtnActive : ''}`}
                onClick={() => setCurrentPage(p)}
              >
                {p}
              </button>
            ))}
            {totalPages > 5 && <span style={{ color: '#94a3b8' }}>...</span>}
            {totalPages > 5 && (
              <button
                type="button"
                className={`${hub.pageBtn} ${currentPage === totalPages ? hub.pageBtnActive : ''}`}
                onClick={() => setCurrentPage(totalPages)}
              >
                {totalPages}
              </button>
            )}
            <button
              type="button"
              className={hub.pageBtn}
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            >
              ›
            </button>
          </div>
        </div>
      </div>
  );
}
