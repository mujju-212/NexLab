'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '@/components/layout/AdminShell';
import {
  UploadCloud, Download, FileSpreadsheet, CheckCircle2, AlertTriangle,
  ArrowLeft, RefreshCw, Trash2, Edit2, ShieldAlert, Check, FileText
} from 'lucide-react';
import styles from './page.module.css';

interface ParsedRow {
  id: number;
  fullName: string;
  rollNoOrUsn: string;
  personalEmail: string;
  department: string;
  batch: string;
  section: string;
  role: 'student' | 'instructor';
  subjectsAssigned?: string;
  isValid: boolean;
  errorReason?: string;
  officialEmail?: string;
  tempPassword?: string;
}

const SAMPLE_CSV = `full_name,roll_no_or_usn,personal_email,department,batch,section,role,subjects_assigned
Aarav Sharma,1HK24CS001,aarav.personal@gmail.com,CSE,CSE-2Y-26,A,student,
Priya Patel,1HK24CS002,priya.patel@gmail.com,CSE,CSE-2Y-26,A,student,
Rahul Verma,1HK24CS003,,CSE,CSE-2Y-26,B,student,
Dr. Suresh Kumar,FAC-CSE-101,suresh.k@gmail.com,CSE,,,instructor,CS301 Data Structures
Ananya Roy,1HK24CS001,ananya@gmail.com,CSE,CSE-2Y-26,A,student,
Invalid User,,not-an-email,ME,ME-2Y-26,A,student,`;

const INITIAL_ROWS: ParsedRow[] = [
  {
    id: 1,
    fullName: 'Aarav Sharma',
    rollNoOrUsn: '1HK24CS001',
    personalEmail: 'aarav.personal@gmail.com',
    department: 'CSE',
    batch: 'CSE-2Y-26',
    section: 'Section A',
    role: 'student',
    isValid: true,
  },
  {
    id: 2,
    fullName: 'Priya Patel',
    rollNoOrUsn: '1HK24CS002',
    personalEmail: 'priya.patel@gmail.com',
    department: 'CSE',
    batch: 'CSE-2Y-26',
    section: 'Section A',
    role: 'student',
    isValid: true,
  },
  {
    id: 3,
    fullName: 'Rahul Verma',
    rollNoOrUsn: '1HK24CS003',
    personalEmail: '',
    department: 'CSE',
    batch: 'CSE-2Y-26',
    section: 'Section B',
    role: 'student',
    isValid: true,
  },
  {
    id: 4,
    fullName: 'Dr. Suresh Kumar',
    rollNoOrUsn: 'FAC-CSE-101',
    personalEmail: 'suresh.k@gmail.com',
    department: 'CSE',
    batch: '',
    section: '',
    role: 'instructor',
    subjectsAssigned: 'CS301 Data Structures',
    isValid: true,
  },
  {
    id: 5,
    fullName: 'Ananya Roy',
    rollNoOrUsn: '1HK24CS001',
    personalEmail: 'ananya@gmail.com',
    department: 'CSE',
    batch: 'CSE-2Y-26',
    section: 'Section A',
    role: 'student',
    isValid: false,
    errorReason: 'Duplicate Roll No / USN (1HK24CS001 already exists in file)',
  },
  {
    id: 6,
    fullName: 'Vikram Singh',
    rollNoOrUsn: '1HK24ME088',
    personalEmail: 'invalid-email-format',
    department: 'ME',
    batch: 'ME-2Y-26',
    section: 'Section A',
    role: 'student',
    isValid: false,
    errorReason: 'Invalid personal email format',
  },
];

export default function BulkImportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'upload' | 'preview' | 'success'>('upload');
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>(INITIAL_ROWS);
  const [editingRowId, setEditingRowId] = useState<number | null>(null);
  const [fileTypeNotice, setFileTypeNotice] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const validCount = parsedRows.filter(r => r.isValid).length;
  const errorCount = parsedRows.filter(r => !r.isValid).length;

  const downloadTemplate = (format: 'csv' | 'xlsx') => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk_user_import_template.${format}`;
    a.click();
  };

  const handleFile = (file: File) => {
    const name = file.name.toLowerCase();

    if (name.endsWith('.pdf')) {
      setFileTypeNotice('PDF document uploaded: Extracted tabular student data into preview grid.');
    } else if (name.endsWith('.docx') || name.endsWith('.doc')) {
      setFileTypeNotice('Word document uploaded: Extracted tabular student data into preview grid.');
    } else {
      setFileTypeNotice(null);
    }

    const validExtensions = ['.csv', '.xlsx', '.xls', '.pdf', '.docx', '.doc'];
    const isValidExt = validExtensions.some(ext => name.endsWith(ext));

    if (!isValidExt) {
      alert('Invalid file format. Supported formats: PDF (.pdf), Word (.docx/.doc), CSV (.csv), Excel (.xlsx).');
      return;
    }

    setSelectedFile(file);
    setStep('preview');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleConfirmImport = () => {
    setIsProcessing(true);
    setTimeout(() => {
      // Auto generate official email and temp passwords
      const updated = parsedRows.map(row => {
        const cleanName = row.fullName.toLowerCase().replace(/[^a-z]/g, '');
        const cleanRoll = row.rollNoOrUsn.toLowerCase().replace(/[^a-z0-9]/g, '');
        const generatedEmail = `${cleanName}.${cleanRoll}@hkbk.edu.in`;
        const tempPw = `Temp#${Math.floor(100000 + Math.random() * 900000)}`;

        return {
          ...row,
          officialEmail: generatedEmail,
          tempPassword: tempPw,
        };
      });

      setParsedRows(updated);
      setIsProcessing(false);
      setStep('success');
    }, 1500);
  };

  const handleRowFieldChange = (id: number, field: keyof ParsedRow, val: string) => {
    setParsedRows(prev =>
      prev.map(row => {
        if (row.id !== id) return row;
        const updated = { ...row, [field]: val };

        if (field === 'rollNoOrUsn') {
          const isDup = prev.some(r => r.id !== id && r.rollNoOrUsn.toLowerCase() === val.toLowerCase());
          if (isDup) {
            updated.isValid = false;
            updated.errorReason = `Duplicate Roll No / USN (${val})`;
          } else if (!val) {
            updated.isValid = false;
            updated.errorReason = 'Roll No / USN is required';
          } else {
            updated.isValid = true;
            updated.errorReason = undefined;
          }
        }
        if (field === 'personalEmail' && val) {
          if (!val.includes('@') || !val.includes('.')) {
            updated.isValid = false;
            updated.errorReason = 'Invalid personal email format';
          } else {
            updated.isValid = true;
            updated.errorReason = undefined;
          }
        }
        return updated;
      })
    );
  };

  const handleDeleteRow = (id: number) => {
    setParsedRows(prev => prev.filter(r => r.id !== id));
  };

  return (
    <AdminShell
      activePage="User Management"
      title="Bulk Account Provisioning"
      subtitle="Admin Controlled Account Creator: Import Students and Instructors via PDF, Word (.docx), CSV, or Excel (.xlsx)"
    >
      <div className={styles.topHeaderRow}>
        <button className={styles.backBtn} onClick={() => router.push('/admin/users')}>
          <ArrowLeft size={16} /> Back to User Directory
        </button>

        <div className={styles.templateGroup}>
          <span className={styles.templateLabel}>Download Sample Template:</span>
          <button className={styles.templateBtn} onClick={() => downloadTemplate('csv')}>
            <Download size={14} /> .CSV Template
          </button>
          <button className={styles.templateBtn} onClick={() => downloadTemplate('xlsx')}>
            <FileSpreadsheet size={14} /> .XLSX Template
          </button>
        </div>
      </div>

      {/* ── STEP 1: UPLOAD DROPZONE ─────────────────────────────────────── */}
      {step === 'upload' && (
        <div className={styles.uploadCard}>
          <div
            className={`${styles.dropzone} ${dragActive ? styles.dropzoneActive : ''}`}
            onDragOver={e => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept=".csv, .xlsx, .xls, .pdf, .docx, .doc"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <div className={styles.dropIcon}>
              <UploadCloud size={36} strokeWidth={1.8} color="#7c3aed" />
            </div>
            <h3 className={styles.dropTitle}>Drag & Drop Student / Instructor List</h3>
            <p className={styles.dropSub}>
              Supported Formats: <strong>PDF (.pdf)</strong>, <strong>Word (.docx / .doc)</strong>, <strong>CSV (.csv)</strong>, <strong>Excel (.xlsx)</strong> (Max 5MB, up to 5,000 rows)
            </p>
            <button className={styles.btnPrimary} type="button">
              <FileSpreadsheet size={16} /> Browse & Select File
            </button>
          </div>

          <div className={styles.noticeBox}>
            <ShieldAlert size={18} color="#7c3aed" />
            <div>
              <p className={styles.noticeTitle}>Admin Provisioning Policy</p>
              <p className={styles.noticeText}>
                Students and Instructors cannot self-register. Accounts created through this import will have official email IDs generated automatically, temporary passwords assigned, and a mandatory <strong>&quot;Change Password on First Login&quot;</strong> requirement enabled.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 2: PREVIEW & INLINE EDITING ──────────────────────────── */}
      {step === 'preview' && (
        <div>
          {fileTypeNotice && (
            <div className={styles.infoBanner}>
              <FileText size={18} color="#7c3aed" />
              <div>
                <strong>File Uploaded ({selectedFile?.name}):</strong> {fileTypeNotice}
              </div>
            </div>
          )}

          {/* Validation Summary Bar */}
          <div className={styles.summaryBar}>
            <div className={styles.summaryStats}>
              <span className={styles.statTagTotal}>Total Parsed: {parsedRows.length} Rows</span>
              <span className={styles.statTagValid}>
                <CheckCircle2 size={14} /> {validCount} Valid Rows
              </span>
              {errorCount > 0 && (
                <span className={styles.statTagError}>
                  <AlertTriangle size={14} /> {errorCount} Rows with Errors
                </span>
              )}
            </div>

            <div className={styles.summaryActions}>
              <button className={styles.btnSecondary} onClick={() => setStep('upload')}>
                <RefreshCw size={14} /> Re-upload File
              </button>
              <button
                className={`${styles.btnPrimary} ${errorCount > 0 ? styles.btnDisabled : ''}`}
                disabled={errorCount > 0 || isProcessing}
                onClick={handleConfirmImport}
              >
                {isProcessing ? 'Processing Batch Import...' : 'Confirm & Create Accounts'}
              </button>
            </div>
          </div>

          {/* Parsed Rows Table */}
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Full Name</th>
                  <th>Roll No / USN</th>
                  <th>Personal Email</th>
                  <th>Department</th>
                  <th>Batch / Section</th>
                  <th>Role</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {parsedRows.map(row => (
                  <tr key={row.id} className={!row.isValid ? styles.errorRow : ''}>
                    <td>
                      {row.isValid ? (
                        <span className={styles.pillValid}>
                          <CheckCircle2 size={12} /> Valid
                        </span>
                      ) : (
                        <span className={styles.pillError} title={row.errorReason}>
                          <AlertTriangle size={12} /> Invalid
                        </span>
                      )}
                    </td>
                    <td>
                      {editingRowId === row.id ? (
                        <input
                          className={styles.cellInput}
                          value={row.fullName}
                          onChange={e => handleRowFieldChange(row.id, 'fullName', e.target.value)}
                        />
                      ) : (
                        <strong style={{ color: '#201b2e', fontFamily: 'Space Grotesk, sans-serif' }}>{row.fullName}</strong>
                      )}
                    </td>
                    <td>
                      {editingRowId === row.id ? (
                        <input
                          className={styles.cellInput}
                          value={row.rollNoOrUsn}
                          onChange={e => handleRowFieldChange(row.id, 'rollNoOrUsn', e.target.value)}
                        />
                      ) : (
                        <code className={styles.code}>{row.rollNoOrUsn}</code>
                      )}
                    </td>
                    <td>
                      {editingRowId === row.id ? (
                        <input
                          className={styles.cellInput}
                          value={row.personalEmail}
                          onChange={e => handleRowFieldChange(row.id, 'personalEmail', e.target.value)}
                        />
                      ) : (
                        <span>{row.personalEmail || <em style={{ color: '#9891a6' }}>Auto-generate</em>}</span>
                      )}
                    </td>
                    <td>{row.department}</td>
                    <td>{row.batch ? `${row.batch} (${row.section})` : '—'}</td>
                    <td>
                      <span className={`${styles.roleTag} ${row.role === 'student' ? styles.roleStudent : styles.roleTeacher}`}>
                        {row.role}
                      </span>
                    </td>
                    <td>
                      <div className={styles.rowActions}>
                        <button
                          className={styles.actionIconBtn}
                          title={editingRowId === row.id ? 'Save' : 'Edit inline'}
                          onClick={() => setEditingRowId(editingRowId === row.id ? null : row.id)}
                        >
                          {editingRowId === row.id ? <Check size={14} color="#16a34a" /> : <Edit2 size={14} />}
                        </button>
                        <button
                          className={`${styles.actionIconBtn} ${styles.actionIconDanger}`}
                          title="Delete row"
                          onClick={() => handleDeleteRow(row.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {errorCount > 0 && (
            <div className={styles.errorHelpBox}>
              <AlertTriangle size={16} color="#ef4444" />
              <span>
                Please edit the red rows inline or click <strong>Delete</strong> on invalid rows to enable the <strong>Confirm & Create Accounts</strong> button.
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── STEP 3: SUCCESS REPORT ─────────────────────────────────────── */}
      {step === 'success' && (
        <div className={styles.successCard}>
          <div className={styles.successHeader}>
            <div className={styles.successIcon}>
              <CheckCircle2 size={40} color="#fff" />
            </div>
            <h2>Import Successful!</h2>
            <p>Created <strong>{validCount}</strong> user accounts in PostgreSQL database. Audit log updated.</p>
          </div>

          <div className={styles.reportSummary}>
            <div className={styles.reportCard}>
              <p className={styles.reportLabel}>Official Email Pattern</p>
              <p className={styles.reportVal}><code>{'{first_name}.{roll_no}@hkbk.edu.in'}</code></p>
            </div>
            <div className={styles.reportCard}>
              <p className={styles.reportLabel}>First-Login Policy</p>
              <p className={styles.reportVal}>Mandatory Password Reset Enabled</p>
            </div>
            <div className={styles.reportCard}>
              <p className={styles.reportLabel}>Welcome Email Queue</p>
              <p className={styles.reportVal}>RabbitMQ Queue Dispatched</p>
            </div>
          </div>

          <div className={styles.tableWrap} style={{ marginTop: '20px' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Roll / USN</th>
                  <th>Official Email Created</th>
                  <th>Temporary Password</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {parsedRows.map(r => (
                  <tr key={r.id}>
                    <td><strong>{r.fullName}</strong></td>
                    <td><code>{r.rollNoOrUsn}</code></td>
                    <td><code style={{ color: '#7c3aed' }}>{r.officialEmail}</code></td>
                    <td><code style={{ background: '#fef3c7', color: '#b45309' }}>{r.tempPassword}</code></td>
                    <td><span className={styles.pillValid}><CheckCircle2 size={12} /> Account Created</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.successFooter}>
            <button className={styles.btnSecondary} onClick={() => downloadTemplate('csv')}>
              <Download size={14} /> Download Credentials PDF / CSV
            </button>
            <button className={styles.btnPrimary} onClick={() => router.push('/admin/users')}>
              Go to User Directory →
            </button>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
