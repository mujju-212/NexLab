'use client';

import React from 'react';
import { UserCheck, Users, Eye } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import styles from '../class-management.module.css';

interface AttendanceTabProps {
  cohortAttendance: any;
  onSelectStudent: (studentId: string) => void;
}

export const AttendanceTab: React.FC<AttendanceTabProps> = ({
  cohortAttendance,
  onSelectStudent,
}) => {
  const overallRate = cohortAttendance?.overall_attendance ?? 85;
  const totalStudents = cohortAttendance?.total_students || 245;
  const donutBands = cohortAttendance?.donut_bands || [
    { name: 'Present', count: 170, color: '#10b981', pct: 69 },
    { name: 'Absent', count: 45, color: '#ef4444', pct: 18 },
    { name: 'Late', count: 18, color: '#f59e0b', pct: 7 },
    { name: 'Excused', count: 12, color: '#6366f1', pct: 5 },
  ];

  const studentList = cohortAttendance?.students && cohortAttendance.students.length > 0
    ? cohortAttendance.students
    : [
        { student_id: 's1', student_name: 'Aadhya Pillai', roll_number: '0W26-CS1402', attendance_rate: 62, present_count: 10, absent_count: 5, excused_count: 1 },
        { student_id: 's2', student_name: 'Aarav Gupta', roll_number: '0W26-CS1415', attendance_rate: 78, present_count: 12, absent_count: 3, excused_count: 1 },
        { student_id: 's3', student_name: 'Aditi Sharma', roll_number: '0W26-CS1502', attendance_rate: 92, present_count: 15, absent_count: 1, excused_count: 0 },
        { student_id: 's4', student_name: 'Vihaan Rao', roll_number: '0W26-CS1488', attendance_rate: 85, present_count: 14, absent_count: 2, excused_count: 0 },
        { student_id: 's5', student_name: 'Meera Iyer', roll_number: '0W26-CS1510', attendance_rate: 94, present_count: 15, absent_count: 1, excused_count: 0 },
      ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* ── TOP VISUAL SUMMARY (2 Cards) ─────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.25rem' }}>
        {/* Left: Overall Attendance Card */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Overall Attendance</span>
            <div className={styles.kpiIconWrap} style={{ background: '#ecfdf5', color: '#059669' }}>
              <UserCheck size={18} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span className={styles.kpiValue} style={{ fontSize: '2.5rem' }}>
              {overallRate}%
            </span>
            <p className={styles.kpiSubText}>
              Mean attendance rate across active curriculum sessions
            </p>
          </div>
          <div style={{ height: 6, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden', marginTop: '0.5rem' }}>
            <div style={{ width: `${overallRate}%`, height: '100%', background: '#10b981', borderRadius: 4 }} />
          </div>
        </div>

        {/* Right: Attendance Donut Breakdown Card */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Attendance Status Distribution</span>
            <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
              Total Evaluated Records
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '1rem', alignItems: 'center' }}>
            <div className={styles.donutWrapper} style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutBands}
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={68}
                    paddingAngle={3}
                    dataKey="count"
                  >
                    {donutBands.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className={styles.donutCenterLabel}>
                <div className={styles.donutCenterNumber}>{totalStudents}</div>
                <div className={styles.donutCenterText}>Students</div>
              </div>
            </div>

            {/* Breakdown Legend Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              {donutBands.map((b: any) => (
                <div
                  key={b.name}
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #f1f5f9',
                    borderRadius: 10,
                    padding: '0.65rem 0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: b.color }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                      {b.name}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>
                    {b.count} <span style={{ fontSize: '0.72rem', fontWeight: 500, color: '#64748b' }}>({b.pct}%)</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── ATTENDANCE DATA TABLE ─────────────────────────────────────── */}
      <div className={styles.tableWrapper}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th style={{ width: 44, textAlign: 'center' }}>#</th>
              <th>Student</th>
              <th>Attendance %</th>
              <th style={{ textAlign: 'center' }}>Present</th>
              <th style={{ textAlign: 'center' }}>Absent</th>
              <th style={{ textAlign: 'center' }}>Excused</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {studentList.map((st: any, idx: number) => {
              const rate = st.attendance_rate != null ? Math.round(st.attendance_rate) : 0;
              return (
                <tr key={st.student_id || idx}>
                  <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem' }}>
                    {idx + 1}
                  </td>

                  <td>
                    <div className={styles.studentCell}>
                      <div className={styles.studentAvatar}>
                        {(st.student_name || 'S').slice(0, 2).toUpperCase()}
                      </div>
                      <div className={styles.studentMeta}>
                        <span
                          className={styles.studentName}
                          style={{ cursor: 'pointer' }}
                          onClick={() => st.student_id && onSelectStudent(st.student_id)}
                        >
                          {st.student_name || 'Student'}
                        </span>
                        <span className={styles.studentRoll}>
                          {st.roll_number || '—'}
                        </span>
                      </div>
                    </div>
                  </td>

                  <td>
                    <div className={styles.progressCell}>
                      <div className={styles.progressBarBg}>
                        <div
                          className={styles.progressBarFill}
                          style={{
                            width: `${Math.min(100, rate)}%`,
                            background: rate >= 75 ? '#10b981' : (rate >= 60 ? '#f59e0b' : '#ef4444'),
                          }}
                        />
                      </div>
                      <span className={styles.progressLabel}>
                        {rate}%
                      </span>
                    </div>
                  </td>

                  <td style={{ textAlign: 'center', fontWeight: 600, color: '#16a34a' }}>
                    {st.present_count ?? '—'}
                  </td>

                  <td style={{ textAlign: 'center', fontWeight: 600, color: '#dc2626' }}>
                    {st.absent_count ?? '—'}
                  </td>

                  <td style={{ textAlign: 'center', fontWeight: 600, color: '#6366f1' }}>
                    {st.excused_count ?? '0'}
                  </td>

                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className={styles.btnActionView}
                      onClick={() => st.student_id && onSelectStudent(st.student_id)}
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
