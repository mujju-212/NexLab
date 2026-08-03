'use client';

import { useState } from 'react';
import AdminShell from '@/components/layout/AdminShell';
import { Plus, Edit, Trash2, Search, Filter, CheckCircle2, User } from 'lucide-react';
import styles from './page.module.css';

const ASSIGNMENTS = [
  { id:'ASN001', subject:'CS301 — Data Structures', dept:'CSE', section:'Section A', instructor:'Prof. Suma Nair',    sem:'Sem 3', status:'Confirmed' },
  { id:'ASN002', subject:'CS301 — Data Structures', dept:'CSE', section:'Section B', instructor:'Prof. Suma Nair',    sem:'Sem 3', status:'Confirmed' },
  { id:'ASN003', subject:'CS302 — DBMS',            dept:'CSE', section:'Section A', instructor:'Dr. Mohan Rao',      sem:'Sem 3', status:'Confirmed' },
  { id:'ASN004', subject:'EC301 — Digital Logic',   dept:'ECE', section:'Section A', instructor:'Dr. Arun Kumar',     sem:'Sem 3', status:'Confirmed' },
  { id:'ASN005', subject:'ME301 — Thermodynamics',  dept:'ME',  section:'Section A', instructor:'Dr. Ravi Patil',     sem:'Sem 3', status:'Confirmed' },
  { id:'ASN006', subject:'EE701 — Power Systems',   dept:'EEE', section:'Section A', instructor:'Prof. Leela Bhat',   sem:'Sem 7', status:'Confirmed' },
  { id:'ASN007', subject:'CS501 — Machine Learning',dept:'CSE', section:'Section A', instructor:'Dr. Pradeep Joshi',  sem:'Sem 5', status:'Pending'   },
  { id:'ASN008', subject:'EC505 — Microprocessors', dept:'ECE', section:'Section B', instructor:'—',                  sem:'Sem 5', status:'Unassigned' },
  { id:'ASN009', subject:'CS303 — OS',              dept:'CSE', section:'Section C', instructor:'—',                  sem:'Sem 5', status:'Unassigned' },
];

const INSTRUCTORS = [
  'Prof. Suma Nair','Dr. Mohan Rao','Dr. Arun Kumar','Dr. Ravi Patil','Prof. Leela Bhat','Dr. Pradeep Joshi','Prof. Divya Shetty',
];

export default function AssignmentsPage() {
  const [search, setSearch] = useState('');
  const [editId, setEditId] = useState<string|null>(null);

  const filtered = ASSIGNMENTS.filter(a =>
    a.subject.toLowerCase().includes(search.toLowerCase()) ||
    a.instructor.toLowerCase().includes(search.toLowerCase()) ||
    a.dept.toLowerCase().includes(search.toLowerCase())
  );

  const statusCls = (s: string) => {
    if (s === 'Confirmed')  return styles.pillGreen;
    if (s === 'Pending')    return styles.pillOrange;
    return styles.pillRed;
  };

  return (
    <AdminShell activePage="Assignments" title="Faculty Allocation" subtitle="Assign instructors to subject-section combinations (Workflow 1 — Steps 7 & 8)">

      {/* ── Summary ───────────────────────────────────────────────────── */}
      <div className={styles.summaryRow}>
        {[
          { label:'Total Assignments', value:'9',  color:'#7c3aed' },
          { label:'Confirmed',         value:'6',  color:'#22c55e' },
          { label:'Pending',           value:'1',  color:'#f59e0b' },
          { label:'Unassigned',        value:'2',  color:'#ef4444' },
        ].map(s => (
          <div key={s.label} className={styles.summaryCard}>
            <p className={styles.summaryLabel}>{s.label}</p>
            <p className={styles.summaryValue} style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Toolbar ───────────────────────────────────────────────────── */}
      <div className={styles.toolBar}>
        <div className={styles.searchBox}>
          <Search size={14} strokeWidth={2} color="#9891a6" />
          <input
            className={styles.searchInput}
            placeholder="Search by subject, instructor, dept…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className={styles.toolRight}>
          <button className={styles.btnSecondary}><Filter size={14} strokeWidth={2} /> Filter by Dept</button>
          <button className={styles.btnPrimary}><Plus size={14} strokeWidth={2} /> New Assignment</button>
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────── */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Subject</th>
              <th>Dept</th>
              <th>Section</th>
              <th>Semester</th>
              <th>Assigned Instructor</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(a => (
              <tr key={a.id}>
                <td><code className={styles.code}>{a.id}</code></td>
                <td><strong style={{ color:'#201b2e', fontFamily:'Space Grotesk,sans-serif' }}>{a.subject}</strong></td>
                <td>{a.dept}</td>
                <td>{a.section}</td>
                <td>{a.sem}</td>
                <td>
                  {editId === a.id ? (
                    <div className={styles.selectWrap}>
                      <select className={styles.select} defaultValue={a.instructor}>
                        <option value="—">— Unassigned —</option>
                        {INSTRUCTORS.map(i => <option key={i} value={i}>{i}</option>)}
                      </select>
                      <button className={styles.saveBtn} onClick={() => setEditId(null)}>
                        <CheckCircle2 size={14} strokeWidth={2} /> Save
                      </button>
                    </div>
                  ) : (
                    <div className={styles.instructorCell}>
                      {a.instructor !== '—' && (
                        <div className={styles.avatar} style={{ background:'#d6409f' }}>
                          {a.instructor.split(' ').map((w:string)=>w[0]).join('').slice(0,2)}
                        </div>
                      )}
                      <span style={{ color: a.instructor === '—' ? '#9891a6' : '#463f57' }}>{a.instructor}</span>
                    </div>
                  )}
                </td>
                <td><span className={`${styles.pill} ${statusCls(a.status)}`}>{a.status}</span></td>
                <td>
                  <div className={styles.actions}>
                    <button className={styles.actionBtn} title="Assign Instructor" onClick={() => setEditId(editId === a.id ? null : a.id)}>
                      <User size={14} strokeWidth={2} />
                    </button>
                    <button className={styles.actionBtn} title="Edit"><Edit size={14} strokeWidth={2} /></button>
                    <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} title="Delete"><Trash2 size={14} strokeWidth={2} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className={styles.tableFooter}>
          <span>Showing {filtered.length} of {ASSIGNMENTS.length} assignments</span>
        </div>
      </div>
    </AdminShell>
  );
}
