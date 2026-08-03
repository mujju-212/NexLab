'use client';

import { useState } from 'react';
import AdminShell from '@/components/layout/AdminShell';
import {
  FileText, Download, Users, GraduationCap, BarChart3,
  Server, Award, ClipboardList, CheckCircle2, Clock
} from 'lucide-react';
import styles from './page.module.css';

const REPORT_TYPES = [
  {
    id: 'student-performance',
    Icon: Users,
    title: 'Student Performance Report',
    desc: 'Completion rates, scores, attendance, and at-risk analysis across all batches.',
    lastGen: 'Today, 08:30 AM',
    bg: 'linear-gradient(135deg,#7c3aed,#9333ea)',
    formats: ['PDF','Excel','CSV'],
  },
  {
    id: 'faculty-activity',
    Icon: GraduationCap,
    title: 'Faculty Activity Report',
    desc: 'Instructor engagement, experiment creation, grading timelines and feedback stats.',
    lastGen: 'Yesterday, 11:00 AM',
    bg: 'linear-gradient(135deg,#ec4899,#d6409f)',
    formats: ['PDF','Excel'],
  },
  {
    id: 'platform-usage',
    Icon: BarChart3,
    title: 'Platform Usage Report',
    desc: 'Judge0 API usage, AI hint consumption, session counts and concurrency stats.',
    lastGen: 'Jul 30, 2026',
    bg: 'linear-gradient(135deg,#f59e0b,#f2994a)',
    formats: ['PDF','CSV'],
  },
  {
    id: 'system-audit',
    Icon: Server,
    title: 'System Audit Report',
    desc: 'Login events, configuration changes, API errors, and security incidents.',
    lastGen: 'Jul 29, 2026',
    bg: 'linear-gradient(135deg,#06b6d4,#0ea5e9)',
    formats: ['PDF','CSV'],
  },
  {
    id: 'certificates',
    Icon: Award,
    title: 'Digital Certificates',
    desc: 'Generate verifiable achievement certificates for students who completed experiments.',
    lastGen: 'Jul 28, 2026',
    bg: 'linear-gradient(135deg,#22c55e,#16a34a)',
    formats: ['PDF'],
  },
  {
    id: 'academic-summary',
    Icon: ClipboardList,
    title: 'Academic Summary Report',
    desc: 'Batch-wise summary, section performance comparison, and knowledge tracing insights.',
    lastGen: 'Jul 25, 2026',
    bg: 'linear-gradient(135deg,#a855f7,#7c3aed)',
    formats: ['PDF','Excel','CSV'],
  },
];

const RECENT = [
  { name:'Student Performance — CSE Batch',  format:'PDF',   size:'2.4 MB', gen:'Today, 08:30 AM',  status:'Ready' },
  { name:'Faculty Activity — Jul 2026',       format:'Excel', size:'890 KB', gen:'Yesterday, 11:00 AM', status:'Ready' },
  { name:'Platform Usage — Week 30',          format:'CSV',   size:'120 KB', gen:'Jul 30, 10:15 AM', status:'Ready' },
  { name:'Digital Certificates — Batch CSE2Y',format:'PDF',   size:'5.1 MB', gen:'Jul 28, 3:00 PM',  status:'Ready' },
];

export default function ReportsPage() {
  const [generating, setGenerating] = useState<string | null>(null);

  const handleGenerate = (id: string) => {
    setGenerating(id);
    setTimeout(() => setGenerating(null), 2000);
  };

  return (
    <AdminShell activePage="Reports & Exports" title="Reports & Exports" subtitle="Generate, download and schedule institutional reports">

      {/* ── Report Cards ──────────────────────────────────────────────── */}
      <div className={styles.reportGrid}>
        {REPORT_TYPES.map(r => (
          <div key={r.id} className={styles.reportCard}>
            <div className={styles.reportHeader}>
              <div className={styles.reportIcon} style={{ background: r.bg }}>
                <r.Icon size={20} strokeWidth={1.9} color="#fff" />
              </div>
              <div>
                <p className={styles.reportTitle}>{r.title}</p>
                <p className={styles.reportDesc}>{r.desc}</p>
              </div>
            </div>
            <div className={styles.reportMeta}>
              <span className={styles.lastGen}>
                <Clock size={12} strokeWidth={2} /> Last: {r.lastGen}
              </span>
              <div className={styles.formatBtns}>
                {r.formats.map(f => (
                  <button key={f} className={styles.formatBtn}>
                    <Download size={11} strokeWidth={2} /> {f}
                  </button>
                ))}
              </div>
            </div>
            <button
              className={`${styles.generateBtn} ${generating === r.id ? styles.generating : ''}`}
              onClick={() => handleGenerate(r.id)}
            >
              {generating === r.id ? (
                <><Clock size={14} strokeWidth={2} /> Generating…</>
              ) : (
                <><FileText size={14} strokeWidth={2} /> Generate Report</>
              )}
            </button>
          </div>
        ))}
      </div>

      {/* ── Recent Reports ─────────────────────────────────────────────── */}
      <div className={styles.recentSection}>
        <h2 className={styles.sectionTitle}>Recently Generated</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Report Name</th><th>Format</th><th>Size</th><th>Generated</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {RECENT.map(r => (
                <tr key={r.name}>
                  <td><strong style={{ color:'#201b2e', fontFamily:'Space Grotesk,sans-serif' }}>{r.name}</strong></td>
                  <td><code className={styles.code}>{r.format}</code></td>
                  <td>{r.size}</td>
                  <td>{r.gen}</td>
                  <td>
                    <span className={styles.readyBadge}>
                      <CheckCircle2 size={12} strokeWidth={2} /> {r.status}
                    </span>
                  </td>
                  <td>
                    <button className={styles.dlBtn}><Download size={14} strokeWidth={2} /> Download</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
