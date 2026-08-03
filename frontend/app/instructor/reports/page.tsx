'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText, Download, BarChart3, CheckCircle2, Award, Printer, Table, Share2
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import styles from '../shared.module.css';

export default function ReportsPage() {
  const router = useRouter();
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const handleExportCSV = () => {
    setExportNotice('Exported CS301_Gradebook_Full.csv successfully!');
    setTimeout(() => setExportNotice(null), 4000);
  };

  const handleExportPDF = () => {
    setExportNotice('Exported ABET_CO_PO_Attainment_Report.pdf successfully!');
    setTimeout(() => setExportNotice(null), 4000);
  };

  return (
    <InstructorShell
      activePage="Reports"
      title="Class Reports & Gradebook Export"
      subtitle="Export session summary reports, student gradebooks, attendance logs, and ABET CO-PO attainment analysis"
    >
      {/* Top Action Bar */}
      <div className={styles.actionRow}>
        <button type="button" className={styles.primaryBtn} onClick={handleExportCSV}>
          <Download size={16} strokeWidth={2} /> Export Gradebook CSV
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={handleExportPDF}>
          <Printer size={16} strokeWidth={1.9} /> Generate ABET Attainment Report PDF
        </button>
      </div>

      {exportNotice && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px 16px', borderRadius: '12px', marginBottom: '20px', color: '#166534', fontSize: '13.5px', fontWeight: 600 }}>
          📊 {exportNotice}
        </div>
      )}

      {/* KPI Cards */}
      <div className={styles.kpiRow}>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Course Target Attainment</p>
          <p className={styles.kpiValue} style={{ color: '#2563eb' }}>86%</p>
          <p className={styles.kpiSub}>CO-1 & CO-2 achieved</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Class Average</p>
          <p className={styles.kpiValue} style={{ color: '#16a34a' }}>84.5%</p>
          <p className={styles.kpiSub}>28 students enrolled</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Lab Completion Rate</p>
          <p className={styles.kpiValue} style={{ color: '#7c3aed' }}>96%</p>
          <p className={styles.kpiSub}>On-time submissions</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Audit Compliance</p>
          <p className={styles.kpiValue} style={{ color: '#0ea5e9' }}>100%</p>
          <p className={styles.kpiSub}>PostgreSQL logs synced</p>
        </div>
      </div>

      {/* Reports Grid */}
      <div className={styles.gridTwo}>
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Course Outcome (CO) Attainment</h2>
              <p className={styles.sectionSub}>CS301 Data Structures & Algorithms</p>
            </div>
          </div>

          <div className={styles.list}>
            <div className={styles.listRow}>
              <div className={styles.rowBody}>
                <p className={styles.rowTitle}>CO-1: Understand Linear Data Structures</p>
                <p className={styles.rowSub}>Target: 70% | Achieved: 88%</p>
              </div>
              <span className={styles.pillGreen}>Attained</span>
            </div>
            <div className={styles.listRow}>
              <div className={styles.rowBody}>
                <p className={styles.rowTitle}>CO-2: Implement Stack & Queue in C++/Python</p>
                <p className={styles.rowSub}>Target: 75% | Achieved: 84%</p>
              </div>
              <span className={styles.pillGreen}>Attained</span>
            </div>
            <div className={styles.listRow}>
              <div className={styles.rowBody}>
                <p className={styles.rowTitle}>CO-3: Analyze Time & Space Complexity</p>
                <p className={styles.rowSub}>Target: 70% | Achieved: 79%</p>
              </div>
              <span className={styles.pillGreen}>Attained</span>
            </div>
          </div>
        </section>

        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Available Export Files</h2>
              <p className={styles.sectionSub}>Download formatted reports for department audit</p>
            </div>
          </div>

          <div className={styles.list}>
            <div className={styles.listRow}>
              <div className={styles.rowIcon}><Table size={18} /></div>
              <div className={styles.rowBody}>
                <p className={styles.rowTitle}>Section A Full Gradebook Matrix</p>
                <p className={styles.rowSub}>Includes pre-lab, auto-grade, viva, and final scores</p>
              </div>
              <button type="button" className={styles.ghostBtn} style={{ minHeight: '30px', padding: '0 10px', fontSize: '11.5px' }} onClick={handleExportCSV}>
                <Download size={12} /> CSV
              </button>
            </div>
            <div className={styles.listRow}>
              <div className={styles.rowIcon}><FileText size={18} /></div>
              <div className={styles.rowBody}>
                <p className={styles.rowTitle}>ABET CO-PO Mapping Audit Report</p>
                <p className={styles.rowSub}>Official accreditation PDF document</p>
              </div>
              <button type="button" className={styles.secondaryBtn} style={{ minHeight: '30px', padding: '0 10px', fontSize: '11.5px' }} onClick={handleExportPDF}>
                <Download size={12} /> PDF
              </button>
            </div>
          </div>
        </section>
      </div>
    </InstructorShell>
  );
}
