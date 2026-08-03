'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users, Search, Filter, Mail, Award, CheckCircle2, AlertTriangle, Eye, X, BookOpen
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import styles from '../shared.module.css';

interface RosterStudent {
  id: string;
  name: string;
  roll: string;
  email: string;
  section: string;
  preLabPct: number;
  avgGrade: number;
  attendancePct: number;
  readiness: 'High' | 'Moderate' | 'At Risk';
}

const INITIAL_ROSTER: RosterStudent[] = [
  { id: 'st1', name: 'Arjun Mehta', roll: 'CS21001', email: 'arjun.mehta@univ.edu', section: 'Section A', preLabPct: 100, avgGrade: 94, attendancePct: 98, readiness: 'High' },
  { id: 'st2', name: 'Priya Sharma', roll: 'CS21002', email: 'priya.sharma@univ.edu', section: 'Section A', preLabPct: 90, avgGrade: 86, attendancePct: 95, readiness: 'High' },
  { id: 'st3', name: 'Rohan Gupta', roll: 'CS21003', email: 'rohan.gupta@univ.edu', section: 'Section B', preLabPct: 75, avgGrade: 78, attendancePct: 90, readiness: 'Moderate' },
  { id: 'st4', name: 'Neha Pillai', roll: 'CS21004', email: 'neha.pillai@univ.edu', section: 'Section A', preLabPct: 60, avgGrade: 72, attendancePct: 85, readiness: 'Moderate' },
  { id: 'st5', name: 'Amit Das', roll: 'CS21005', email: 'amit.das@univ.edu', section: 'Section B', preLabPct: 40, avgGrade: 58, attendancePct: 70, readiness: 'At Risk' },
  { id: 'st6', name: 'Dev Chatterjee', roll: 'CS21006', email: 'dev.chatterjee@univ.edu', section: 'Section A', preLabPct: 95, avgGrade: 90, attendancePct: 96, readiness: 'High' },
];

export default function StudentsPage() {
  const router = useRouter();
  const [students, setStudents] = useState<RosterStudent[]>(INITIAL_ROSTER);
  const [sectionFilter, setSectionFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStudent, setSelectedStudent] = useState<RosterStudent | null>(null);

  const filtered = students.filter((s) => {
    const matchSection = sectionFilter === 'All' || s.section === sectionFilter;
    const matchSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.roll.toLowerCase().includes(searchQuery.toLowerCase());
    return matchSection && matchSearch;
  });

  return (
    <InstructorShell
      activePage="Student Management"
      title="Student Directory & Readiness Roster"
      subtitle="Monitor class performance across sections, review individual student readiness, and track attendance"
    >
      {/* Top Action Bar */}
      <div className={styles.actionRow}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '320px' }}>
          <input
            type="text"
            className={styles.input}
            style={{ width: '100%', paddingLeft: '34px' }}
            placeholder="Search student name or roll..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search size={15} style={{ position: 'absolute', left: '12px', top: '13px', color: '#94a3b8' }} />
        </div>
        <button type="button" className={styles.primaryBtn} onClick={() => router.push('/instructor/analytics')}>
          <Award size={16} strokeWidth={2} /> Class Analytics
        </button>
      </div>

      {/* Filter Chips */}
      <div className={styles.tabRow}>
        {['All Sections', 'Section A', 'Section B'].map((sec) => {
          const key = sec.startsWith('All') ? 'All' : sec;
          return (
            <button
              key={sec}
              type="button"
              className={`${styles.tabChip} ${sectionFilter === key ? styles.tabChipActive : ''}`}
              onClick={() => setSectionFilter(key)}
            >
              {sec} ({key === 'All' ? students.length : students.filter(s => s.section === key).length})
            </button>
          );
        })}
      </div>

      {/* Roster Table */}
      <section className={styles.tableCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Enrolled Student Directory</h2>
            <p className={styles.sectionSub}>CS301 Data Structures & Algorithms · Academic Year 2024-2025</p>
          </div>
        </div>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Student Name</th>
              <th>Roll Number</th>
              <th>Section</th>
              <th>Pre-Lab Completion</th>
              <th>Average Score</th>
              <th>Attendance</th>
              <th>Readiness Level</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id}>
                <td className={styles.tdStrong}>{s.name}</td>
                <td>{s.roll}</td>
                <td>{s.section}</td>
                <td>{s.preLabPct}%</td>
                <td className={styles.tdStrong} style={{ color: '#0f62fe' }}>{s.avgGrade}%</td>
                <td>{s.attendancePct}%</td>
                <td>
                  <span className={`${styles.pill} ${s.readiness === 'High' ? styles.pillGreen : s.readiness === 'Moderate' ? styles.pillAmber : styles.pillPurple}`}>
                    {s.readiness}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    style={{ minHeight: '30px', padding: '0 10px', fontSize: '11.5px' }}
                    onClick={() => setSelectedStudent(s)}
                  >
                    <Eye size={12} /> Profile
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* STUDENT PROFILE DRAWER */}
      {selectedStudent && (
        <div className={styles.modalOverlay} onClick={() => setSelectedStudent(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>{selectedStudent.name}</h3>
                <p className={styles.sectionSub}>{selectedStudent.roll} · {selectedStudent.email} · {selectedStudent.section}</p>
              </div>
              <button type="button" className={styles.closeBtn} onClick={() => setSelectedStudent(null)}>
                <X size={18} />
              </button>
            </div>

            <div className={styles.kpiRow} style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: '16px' }}>
              <div className={styles.kpiCard}>
                <p className={styles.kpiLabel}>Pre-Lab Pass</p>
                <p className={styles.kpiValue} style={{ color: '#22c55e' }}>{selectedStudent.preLabPct}%</p>
              </div>
              <div className={styles.kpiCard}>
                <p className={styles.kpiLabel}>Avg Score</p>
                <p className={styles.kpiValue} style={{ color: '#2563eb' }}>{selectedStudent.avgGrade}%</p>
              </div>
              <div className={styles.kpiCard}>
                <p className={styles.kpiLabel}>Attendance</p>
                <p className={styles.kpiValue} style={{ color: '#7c3aed' }}>{selectedStudent.attendancePct}%</p>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Recent Lab Activity & Submissions</label>
              <div className={styles.list}>
                <div className={styles.listRow}>
                  <div className={styles.rowBody}>
                    <p className={styles.rowTitle}>Stack Implementation Lab</p>
                    <p className={styles.rowSub}>Submitted Jul 26 · Grade: 95% | Pre-lab score: 90%</p>
                  </div>
                  <span className={styles.pillGreen}>Passed</span>
                </div>
                <div className={styles.listRow}>
                  <div className={styles.rowBody}>
                    <p className={styles.rowTitle}>Titration Analysis Lab</p>
                    <p className={styles.rowSub}>Submitted Jul 18 · Grade: 88% | Pre-lab score: 85%</p>
                  </div>
                  <span className={styles.pillGreen}>Passed</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button type="button" className={styles.primaryBtn} onClick={() => setSelectedStudent(null)}>
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </InstructorShell>
  );
}
