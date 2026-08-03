'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '@/components/layout/AdminShell';
import {
  Search, UserPlus, Upload, Filter, MoreHorizontal,
  Mail, Phone, Edit, Trash2, Eye, Users, GraduationCap, ShieldCheck
} from 'lucide-react';
import styles from './page.module.css';

const STUDENTS = [
  { id:'STU001', name:'Riya Sharma',      dept:'CSE', sem:'Sem 3', section:'A', status:'Active',   email:'riya.s@hkbk.edu.in',   joined:'Jul 2026' },
  { id:'STU002', name:'Kiran Reddy',      dept:'CSE', sem:'Sem 5', section:'B', status:'At-Risk',  email:'kiran.r@hkbk.edu.in',  joined:'Jul 2025' },
  { id:'STU003', name:'Ananya Nair',      dept:'ME',  sem:'Sem 3', section:'A', status:'At-Risk',  email:'ananya.n@hkbk.edu.in', joined:'Jul 2025' },
  { id:'STU004', name:'Rahul Mehta',      dept:'ME',  sem:'Sem 5', section:'C', status:'Active',   email:'rahul.m@hkbk.edu.in',  joined:'Jul 2025' },
  { id:'STU005', name:'Sneha Patil',      dept:'CSE', sem:'Sem 1', section:'A', status:'Active',   email:'sneha.p@hkbk.edu.in',  joined:'Jul 2026' },
  { id:'STU006', name:'Vijay Bhat',       dept:'ECE', sem:'Sem 7', section:'B', status:'At-Risk',  email:'vijay.b@hkbk.edu.in',  joined:'Jul 2024' },
  { id:'STU007', name:'Meena Shetty',     dept:'CSE', sem:'Sem 3', section:'C', status:'Active',   email:'meena.s@hkbk.edu.in',  joined:'Jul 2025' },
  { id:'STU008', name:'Arjun Krishnan',   dept:'EEE', sem:'Sem 5', section:'A', status:'Active',   email:'arjun.k@hkbk.edu.in',  joined:'Jul 2025' },
  { id:'STU009', name:'Pooja Desai',      dept:'ECE', sem:'Sem 1', section:'B', status:'Active',   email:'pooja.d@hkbk.edu.in',  joined:'Jul 2026' },
  { id:'STU010', name:'Siddharth Rao',    dept:'CSE', sem:'Sem 7', section:'A', status:'Inactive', email:'sid.r@hkbk.edu.in',    joined:'Jul 2024' },
];

const INSTRUCTORS = [
  { id:'FAC001', name:'Dr. Arun Kumar',    dept:'ECE',  subject:'Digital Logic',         status:'Active',   email:'arun.k@hkbk.edu.in',  joined:'Jan 2020' },
  { id:'FAC002', name:'Prof. Suma Nair',   dept:'CSE',  subject:'Data Structures',       status:'Active',   email:'suma.n@hkbk.edu.in',  joined:'Mar 2019' },
  { id:'FAC003', name:'Dr. Ravi Patil',    dept:'ME',   subject:'Thermodynamics',        status:'Active',   email:'ravi.p@hkbk.edu.in',  joined:'Jul 2021' },
  { id:'FAC004', name:'Prof. Leela Bhat',  dept:'EEE',  subject:'Circuit Design',        status:'Active',   email:'leela.b@hkbk.edu.in', joined:'Jan 2022' },
  { id:'FAC005', name:'Dr. Mohan Rao',     dept:'CSE',  subject:'Organic Chemistry',     status:'Active',   email:'mohan.r@hkbk.edu.in', joined:'Jul 2018' },
  { id:'FAC006', name:'Prof. Divya Shetty',dept:'ECE',  subject:'Microprocessors',       status:'On-Leave', email:'divya.s@hkbk.edu.in', joined:'Jan 2021' },
  { id:'FAC007', name:'Dr. Pradeep Joshi', dept:'CSE',  subject:'Machine Learning',      status:'Active',   email:'pradeep.j@hkbk.edu.in',joined:'Jul 2023' },
];

const ADMINS = [
  { id:'ADM001', name:'Administrator',  role:'Super Admin',    status:'Active',  email:'admin@hkbk.edu.in',   lastLogin:'Today, 10:23 AM' },
  { id:'ADM002', name:'Dept. Coordinator (CSE)', role:'Department Admin', status:'Active', email:'coord.cse@hkbk.edu.in', lastLogin:'Today, 08:45 AM' },
  { id:'ADM003', name:'Dept. Coordinator (ECE)', role:'Department Admin', status:'Active', email:'coord.ece@hkbk.edu.in', lastLogin:'Yesterday' },
];

type Tab = 'students' | 'instructors' | 'admins';

export default function UserManagementPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('students');
  const [search, setSearch] = useState('');

  const filteredStudents = STUDENTS.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.dept.toLowerCase().includes(search.toLowerCase()) ||
    s.id.toLowerCase().includes(search.toLowerCase())
  );
  const filteredInstructors = INSTRUCTORS.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.dept.toLowerCase().includes(search.toLowerCase()) ||
    i.id.toLowerCase().includes(search.toLowerCase())
  );

  const statusCls = (status: string) => {
    if (status === 'Active')    return styles.pillGreen;
    if (status === 'At-Risk')   return styles.pillRed;
    if (status === 'On-Leave')  return styles.pillOrange;
    return styles.pillGray;
  };

  return (
    <AdminShell activePage="User Management" title="User Management" subtitle="Manage students, instructors, and administrators">
      {/* ── Summary Cards ─────────────────────────────────────────────── */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard} onClick={() => setTab('students')} style={{ cursor:'pointer', borderColor: tab==='students' ? 'rgba(139,92,246,.4)' : undefined }}>
          <div className={styles.summaryIcon} style={{ background:'linear-gradient(135deg,#8b5cf6,#7c3aed)' }}>
            <Users size={18} strokeWidth={1.9} color="#fff" />
          </div>
          <div>
            <p className={styles.summaryLabel}>Students</p>
            <p className={styles.summaryValue}>1,247</p>
          </div>
        </div>
        <div className={styles.summaryCard} onClick={() => setTab('instructors')} style={{ cursor:'pointer', borderColor: tab==='instructors' ? 'rgba(236,72,153,.4)' : undefined }}>
          <div className={styles.summaryIcon} style={{ background:'linear-gradient(135deg,#ec4899,#d6409f)' }}>
            <GraduationCap size={18} strokeWidth={1.9} color="#fff" />
          </div>
          <div>
            <p className={styles.summaryLabel}>Instructors</p>
            <p className={styles.summaryValue}>89</p>
          </div>
        </div>
        <div className={styles.summaryCard} onClick={() => setTab('admins')} style={{ cursor:'pointer', borderColor: tab==='admins' ? 'rgba(124,58,237,.4)' : undefined }}>
          <div className={styles.summaryIcon} style={{ background:'linear-gradient(135deg,#7c3aed,#6d28d9)' }}>
            <ShieldCheck size={18} strokeWidth={1.9} color="#fff" />
          </div>
          <div>
            <p className={styles.summaryLabel}>Admins</p>
            <p className={styles.summaryValue}>3</p>
          </div>
        </div>
      </div>

      {/* ── Toolbar ───────────────────────────────────────────────────── */}
      <div className={styles.toolBar}>
        <div className={styles.tabs}>
          {(['students','instructors','admins'] as Tab[]).map(t => (
            <button key={t} className={`${styles.tab} ${tab===t ? styles.tabActive : ''}`} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className={styles.toolRight}>
          <div className={styles.searchBox}>
            <Search size={14} strokeWidth={2} color="#9891a6" />
            <input
              className={styles.searchInput}
              placeholder="Search by name, ID, dept…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button className={styles.btnSecondary}>
            <Filter size={14} strokeWidth={2} /> Filter
          </button>
          {tab !== 'admins' && (
            <button className={styles.btnSecondary} onClick={() => router.push('/admin/users/import')}>
              <Upload size={14} strokeWidth={2} /> Bulk Import CSV / XLSX
            </button>
          )}
          <button className={styles.btnPrimary}>
            <UserPlus size={14} strokeWidth={2} /> Add {tab === 'students' ? 'Student' : tab === 'instructors' ? 'Instructor' : 'Admin'}
          </button>
        </div>
      </div>

      {/* ── Students Table ────────────────────────────────────────────── */}
      {tab === 'students' && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Student</th>
                <th>ID</th>
                <th>Dept</th>
                <th>Semester</th>
                <th>Section</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map(s => (
                <tr key={s.id}>
                  <td>
                    <div className={styles.userCell}>
                      <div className={styles.avatar} style={{ background: s.status === 'At-Risk' ? '#f97316' : '#8b5cf6' }}>
                        {s.name.split(' ').map(w=>w[0]).join('').slice(0,2)}
                      </div>
                      <div>
                        <p className={styles.userName}>{s.name}</p>
                        <p className={styles.userEmail}>{s.email}</p>
                      </div>
                    </div>
                  </td>
                  <td><code className={styles.code}>{s.id}</code></td>
                  <td>{s.dept}</td>
                  <td>{s.sem}</td>
                  <td>Section {s.section}</td>
                  <td><span className={`${styles.pill} ${statusCls(s.status)}`}>{s.status}</span></td>
                  <td>{s.joined}</td>
                  <td>
                    <div className={styles.actions}>
                      <button className={styles.actionBtn} title="View"><Eye size={14} strokeWidth={2} /></button>
                      <button className={styles.actionBtn} title="Edit"><Edit size={14} strokeWidth={2} /></button>
                      <button className={styles.actionBtn} title="Email"><Mail size={14} strokeWidth={2} /></button>
                      <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} title="Delete"><Trash2 size={14} strokeWidth={2} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={styles.tableFooter}>
            <span>Showing {filteredStudents.length} of 1,247 students</span>
            <div className={styles.pagination}>
              <button className={styles.pageBtn}>←</button>
              <button className={`${styles.pageBtn} ${styles.pageBtnActive}`}>1</button>
              <button className={styles.pageBtn}>2</button>
              <button className={styles.pageBtn}>3</button>
              <button className={styles.pageBtn}>→</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Instructors Table ─────────────────────────────────────────── */}
      {tab === 'instructors' && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Instructor</th>
                <th>ID</th>
                <th>Department</th>
                <th>Subject</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInstructors.map(i => (
                <tr key={i.id}>
                  <td>
                    <div className={styles.userCell}>
                      <div className={styles.avatar} style={{ background:'#d6409f' }}>
                        {i.name.split(' ').map(w=>w[0]).join('').slice(0,2)}
                      </div>
                      <div>
                        <p className={styles.userName}>{i.name}</p>
                        <p className={styles.userEmail}>{i.email}</p>
                      </div>
                    </div>
                  </td>
                  <td><code className={styles.code}>{i.id}</code></td>
                  <td>{i.dept}</td>
                  <td>{i.subject}</td>
                  <td><span className={`${styles.pill} ${statusCls(i.status)}`}>{i.status}</span></td>
                  <td>{i.joined}</td>
                  <td>
                    <div className={styles.actions}>
                      <button className={styles.actionBtn} title="View"><Eye size={14} strokeWidth={2} /></button>
                      <button className={styles.actionBtn} title="Edit"><Edit size={14} strokeWidth={2} /></button>
                      <button className={styles.actionBtn} title="Email"><Mail size={14} strokeWidth={2} /></button>
                      <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} title="Delete"><Trash2 size={14} strokeWidth={2} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={styles.tableFooter}>
            <span>Showing {filteredInstructors.length} of 89 instructors</span>
          </div>
        </div>
      )}

      {/* ── Admins Table ──────────────────────────────────────────────── */}
      {tab === 'admins' && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Admin</th>
                <th>ID</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {ADMINS.map(a => (
                <tr key={a.id}>
                  <td>
                    <div className={styles.userCell}>
                      <div className={styles.avatar} style={{ background:'#7c3aed' }}>
                        {a.name.split(' ').map(w=>w[0]).join('').slice(0,2)}
                      </div>
                      <div>
                        <p className={styles.userName}>{a.name}</p>
                        <p className={styles.userEmail}>{a.email}</p>
                      </div>
                    </div>
                  </td>
                  <td><code className={styles.code}>{a.id}</code></td>
                  <td>{a.role}</td>
                  <td><span className={`${styles.pill} ${statusCls(a.status)}`}>{a.status}</span></td>
                  <td>{a.lastLogin}</td>
                  <td>
                    <div className={styles.actions}>
                      <button className={styles.actionBtn} title="View"><Eye size={14} strokeWidth={2} /></button>
                      <button className={styles.actionBtn} title="Edit"><Edit size={14} strokeWidth={2} /></button>
                      <button className={styles.actionBtn} title="More"><MoreHorizontal size={14} strokeWidth={2} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
