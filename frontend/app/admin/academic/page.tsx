'use client';

import { useState } from 'react';
import AdminShell from '@/components/layout/AdminShell';
import {
  CalendarDays, Layers, BookOpen, Users, Building2,
  Plus, ChevronRight, Edit, Trash2, X, Save
} from 'lucide-react';
import styles from './page.module.css';

type Section = 'years' | 'batches' | 'sections' | 'subjects' | 'departments';

interface AcademicYearItem { year: string; status: string; start: string; end: string; batches: number }
interface BatchItem { code: string; name: string; dept: string; sem: string; students: number; status: string }
interface SectionItem { code: string; batch: string; name: string; capacity: number; enrolled: number; status: string }
interface SubjectItem { code: string; name: string; dept: string; credits: number; sem: string; type: string }
interface DepartmentItem { code: string; name: string; hod: string; faculty: number; students: number; status: string }

export default function AcademicPage() {
  const [activeSection, setActiveSection] = useState<Section>('years');

  const [years, setYears] = useState<AcademicYearItem[]>([
    { year: '2026–27', status: 'Active', start: 'Jul 2026', end: 'Apr 2027', batches: 12 },
    { year: '2025–26', status: 'Archived', start: 'Jul 2025', end: 'Apr 2026', batches: 10 },
    { year: '2024–25', status: 'Archived', start: 'Jul 2024', end: 'Apr 2025', batches: 10 },
  ]);

  const [batches, setBatches] = useState<BatchItem[]>([
    { code: 'CSE-2Y-26', name: 'CSE Second Year', dept: 'CSE', sem: 'Sem 3 & 4', students: 120, status: 'Active' },
    { code: 'ECE-3Y-25', name: 'ECE Third Year', dept: 'ECE', sem: 'Sem 5 & 6', students: 85, status: 'Active' },
    { code: 'ME-2Y-26', name: 'ME Second Year', dept: 'ME', sem: 'Sem 3 & 4', students: 98, status: 'Active' },
    { code: 'EEE-4Y-24', name: 'EEE Final Year', dept: 'EEE', sem: 'Sem 7 & 8', students: 62, status: 'Active' },
  ]);

  const [sections, setSections] = useState<SectionItem[]>([
    { code: 'CSE-3A', batch: 'CSE Second Year', name: 'Section A', capacity: 60, enrolled: 58, status: 'Active' },
    { code: 'CSE-3B', batch: 'CSE Second Year', name: 'Section B', capacity: 60, enrolled: 62, status: 'Full' },
    { code: 'ECE-5A', batch: 'ECE Third Year', name: 'Section A', capacity: 45, enrolled: 43, status: 'Active' },
  ]);

  const [subjects, setSubjects] = useState<SubjectItem[]>([
    { code: 'CS301', name: 'Data Structures & Algorithms', dept: 'CSE', credits: 4, sem: 'Sem 3', type: 'Core' },
    { code: 'CS302', name: 'Database Management Systems', dept: 'CSE', credits: 3, sem: 'Sem 3', type: 'Core' },
    { code: 'CS501', name: 'Machine Learning', dept: 'CSE', credits: 4, sem: 'Sem 5', type: 'Elective' },
  ]);

  const [departments, setDepartments] = useState<DepartmentItem[]>([
    { code: 'CSE', name: 'Computer Science & Engineering', hod: 'Dr. Ramesh Kumar', faculty: 28, students: 480, status: 'Active' },
    { code: 'ECE', name: 'Electronics & Communication', hod: 'Dr. Priya Menon', faculty: 22, students: 340, status: 'Active' },
  ]);

  // Modal Control
  const [modalType, setModalType] = useState<Section | null>(null);
  const [formInput1, setFormInput1] = useState('');
  const [formInput2, setFormInput2] = useState('');
  const [formInput3, setFormInput3] = useState('');

  const openCreateModal = (type: Section) => {
    setModalType(type);
    setFormInput1('');
    setFormInput2('');
    setFormInput3('');
  };

  const handleSaveModal = () => {
    if (!formInput1) return;

    if (modalType === 'years') {
      setYears([{ year: formInput1, status: 'Active', start: 'Jul 2026', end: 'Apr 2027', batches: 0 }, ...years]);
    } else if (modalType === 'batches') {
      setBatches([{ code: formInput1.toUpperCase(), name: formInput2 || `${formInput1} Batch`, dept: 'CSE', sem: 'Sem 1', students: 0, status: 'Active' }, ...batches]);
    } else if (modalType === 'sections') {
      setSections([{ code: formInput1.toUpperCase(), batch: formInput2 || 'CSE Batch', name: formInput1, capacity: 60, enrolled: 0, status: 'Active' }, ...sections]);
    } else if (modalType === 'subjects') {
      setSubjects([{ code: formInput1.toUpperCase(), name: formInput2 || 'New Subject', dept: 'CSE', credits: 4, sem: 'Sem 1', type: 'Core' }, ...subjects]);
    } else if (modalType === 'departments') {
      setDepartments([{ code: formInput1.toUpperCase(), name: formInput2 || 'New Dept', hod: formInput3 || 'Dr. HOD', faculty: 10, students: 100, status: 'Active' }, ...departments]);
    }

    setModalType(null);
  };

  const categories: { id: Section; label: string; Icon: React.ElementType; count: number; color: string }[] = [
    { id: 'years', label: 'Academic Years', Icon: CalendarDays, count: years.length, color: 'linear-gradient(135deg,#7c3aed,#9333ea)' },
    { id: 'batches', label: 'Batches', Icon: Layers, count: batches.length, color: 'linear-gradient(135deg,#ec4899,#d6409f)' },
    { id: 'departments', label: 'Departments', Icon: Building2, count: departments.length, color: 'linear-gradient(135deg,#f59e0b,#f2994a)' },
    { id: 'sections', label: 'Sections', Icon: Users, count: sections.length, color: 'linear-gradient(135deg,#22c55e,#16a34a)' },
    { id: 'subjects', label: 'Subjects', Icon: BookOpen, count: subjects.length, color: 'linear-gradient(135deg,#06b6d4,#0ea5e9)' },
  ];

  return (
    <AdminShell activePage="Academic Setup" title="Academic Setup" subtitle="Configure academic years, batches, departments, sections, and subjects">
      {/* ── Category Cards ────────────────────────────────────────────── */}
      <div className={styles.overviewGrid}>
        {categories.map(s => (
          <div
            key={s.id}
            className={`${styles.overviewCard} ${activeSection === s.id ? styles.overviewCardActive : ''}`}
            onClick={() => setActiveSection(s.id)}
          >
            <div className={styles.overviewIcon} style={{ background: s.color }}>
              <s.Icon size={20} strokeWidth={1.9} color="#fff" />
            </div>
            <div>
              <p className={styles.overviewLabel}>{s.label}</p>
              <p className={styles.overviewCount}>{s.count}</p>
            </div>
            <ChevronRight size={16} strokeWidth={2} color="#9891a6" style={{ marginLeft: 'auto' }} />
          </div>
        ))}
      </div>

      {/* ── Academic Years ────────────────────────────────────────────── */}
      {activeSection === 'years' && (
        <>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Academic Years</h2>
            <button className={styles.btnPrimary} onClick={() => openCreateModal('years')}>
              <Plus size={14} strokeWidth={2} /> Create Academic Year
            </button>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Year</th><th>Status</th><th>Start</th><th>End</th><th>Batches</th><th>Actions</th></tr></thead>
              <tbody>
                {years.map(y => (
                  <tr key={y.year}>
                    <td><strong style={{ fontFamily: 'Space Grotesk,sans-serif', color: '#201b2e' }}>{y.year}</strong></td>
                    <td><span className={`${styles.pill} ${y.status === 'Active' ? styles.pillGreen : styles.pillGray}`}>{y.status}</span></td>
                    <td>{y.start}</td><td>{y.end}</td><td>{y.batches}</td>
                    <td>
                      <div className={styles.actions}>
                        <button className={styles.actionBtn}><Edit size={14} /></button>
                        <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => setYears(years.filter(r => r.year !== y.year))}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Batches ───────────────────────────────────────────────────── */}
      {activeSection === 'batches' && (
        <>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Batches</h2>
            <button className={styles.btnPrimary} onClick={() => openCreateModal('batches')}>
              <Plus size={14} strokeWidth={2} /> Create Batch
            </button>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Batch Code</th><th>Name</th><th>Department</th><th>Semester</th><th>Students</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {batches.map(b => (
                  <tr key={b.code}>
                    <td><code className={styles.code}>{b.code}</code></td>
                    <td><strong style={{ color: '#201b2e' }}>{b.name}</strong></td>
                    <td>{b.dept}</td><td>{b.sem}</td><td>{b.students}</td>
                    <td><span className={`${styles.pill} ${styles.pillGreen}`}>{b.status}</span></td>
                    <td>
                      <div className={styles.actions}>
                        <button className={styles.actionBtn}><Edit size={14} /></button>
                        <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => setBatches(batches.filter(r => r.code !== b.code))}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Sections ──────────────────────────────────────────────────── */}
      {activeSection === 'sections' && (
        <>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Sections</h2>
            <button className={styles.btnPrimary} onClick={() => openCreateModal('sections')}>
              <Plus size={14} strokeWidth={2} /> Create Section
            </button>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Code</th><th>Batch</th><th>Section Name</th><th>Capacity</th><th>Enrolled</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {sections.map(s => (
                  <tr key={s.code}>
                    <td><code className={styles.code}>{s.code}</code></td>
                    <td>{s.batch}</td><td>{s.name}</td>
                    <td>{s.capacity}</td>
                    <td>{s.enrolled}</td>
                    <td><span className={`${styles.pill} ${s.status === 'Full' ? styles.pillOrange : styles.pillGreen}`}>{s.status}</span></td>
                    <td>
                      <div className={styles.actions}>
                        <button className={styles.actionBtn}><Edit size={14} /></button>
                        <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => setSections(sections.filter(r => r.code !== s.code))}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Subjects ──────────────────────────────────────────────────── */}
      {activeSection === 'subjects' && (
        <>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Subjects</h2>
            <button className={styles.btnPrimary} onClick={() => openCreateModal('subjects')}>
              <Plus size={14} strokeWidth={2} /> Add Subject
            </button>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Code</th><th>Subject Name</th><th>Department</th><th>Credits</th><th>Semester</th><th>Type</th><th>Actions</th></tr></thead>
              <tbody>
                {subjects.map(s => (
                  <tr key={s.code}>
                    <td><code className={styles.code}>{s.code}</code></td>
                    <td><strong style={{ color: '#201b2e' }}>{s.name}</strong></td>
                    <td>{s.dept}</td><td>{s.credits}</td><td>{s.sem}</td>
                    <td><span className={`${styles.pill} ${s.type === 'Lab' ? styles.pillBlue : s.type === 'Elective' ? styles.pillOrange : styles.pillGreen}`}>{s.type}</span></td>
                    <td>
                      <div className={styles.actions}>
                        <button className={styles.actionBtn}><Edit size={14} /></button>
                        <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => setSubjects(subjects.filter(r => r.code !== s.code))}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Departments ───────────────────────────────────────────────── */}
      {activeSection === 'departments' && (
        <>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Departments</h2>
            <button className={styles.btnPrimary} onClick={() => openCreateModal('departments')}>
              <Plus size={14} strokeWidth={2} /> Add Department
            </button>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Code</th><th>Department Name</th><th>HOD</th><th>Faculty</th><th>Students</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {departments.map(d => (
                  <tr key={d.code}>
                    <td><code className={styles.code}>{d.code}</code></td>
                    <td><strong style={{ color: '#201b2e' }}>{d.name}</strong></td>
                    <td>{d.hod}</td><td>{d.faculty}</td><td>{d.students}</td>
                    <td><span className={`${styles.pill} ${styles.pillGreen}`}>{d.status}</span></td>
                    <td>
                      <div className={styles.actions}>
                        <button className={styles.actionBtn}><Edit size={14} /></button>
                        <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => setDepartments(departments.filter(r => r.code !== d.code))}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── CREATION MODAL ────────────────────────────────────────────── */}
      {modalType && (
        <div className={styles.modalOverlay} onClick={() => setModalType(null)}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                Create New {modalType === 'years' ? 'Academic Year' : modalType.slice(0, -1)}
              </h3>
              <button className={styles.closeBtn} onClick={() => setModalType(null)}>
                <X size={18} />
              </button>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                {modalType === 'years' ? 'Academic Year (e.g. 2027–28)' : 'Code / ID'}
              </label>
              <input
                className={styles.input}
                placeholder="Enter value..."
                value={formInput1}
                onChange={e => setFormInput1(e.target.value)}
              />
            </div>

            {modalType !== 'years' && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Name / Title</label>
                <input
                  className={styles.input}
                  placeholder="Enter full name..."
                  value={formInput2}
                  onChange={e => setFormInput2(e.target.value)}
                />
              </div>
            )}

            {modalType === 'departments' && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Head of Department (HOD)</label>
                <input
                  className={styles.input}
                  placeholder="Enter HOD name..."
                  value={formInput3}
                  onChange={e => setFormInput3(e.target.value)}
                />
              </div>
            )}

            <div className={styles.modalFooter}>
              <button className={styles.btnSecondary} onClick={() => setModalType(null)}>
                Cancel
              </button>
              <button className={styles.btnPrimary} onClick={handleSaveModal}>
                <Save size={15} /> Save & Create
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
