'use client';

import StudentShell from '@/components/layout/StudentShell';
import styles from './page.module.css';

const SUBMISSIONS = [
  { id: 'SUB-001', exp: 'Mechanics: Projectile Motion Lab',    subject: 'Physics', score: 95, status: 'graded',  submittedOn: 'Jun 11, 2026', feedback: 'Excellent work! Your analysis was thorough and code was clean.', file: 'projectile_motion.py' },
  { id: 'SUB-002', exp: 'Organic Chemistry: Titration Lab',    subject: 'Chem',    score: 82, status: 'graded',  submittedOn: 'Jul 18, 2026', feedback: 'Good understanding of stoichiometry. Minor errors in equivalence calculation.', file: 'titration_lab.py' },
  { id: 'SUB-003', exp: 'Digital Logic: Circuit Design Lab',   subject: 'ECE',     score: null, status: 'pending', submittedOn: 'Jul 20, 2026', feedback: '', file: 'circuit_design.c' },
  { id: 'SUB-004', exp: 'Data Structures: Stack Implementation', subject: 'CS',    score: 88, status: 'graded',  submittedOn: 'Jul 2, 2026',  feedback: 'Stack operations correctly implemented. Could optimize memory.', file: 'stack_impl.py' },
  { id: 'SUB-005', exp: 'Thermodynamics: Heat Transfer',       subject: 'Physics', score: null, status: 'pending', submittedOn: 'Jul 10, 2026', feedback: '', file: 'heat_transfer.py' },
];

export default function SubmissionsPage() {
  return (
    <StudentShell activePage="Submission" title="My Submissions" subtitle="Track your experiment submissions, grades and feedback">

      {/* Summary Row */}
      <div className={styles.summaryRow}>
        {[
          { label: 'Total Submitted', value: SUBMISSIONS.length, color: '#8b5cf6' },
          { label: 'Graded',          value: SUBMISSIONS.filter(s => s.status === 'graded').length, color: '#22c55e' },
          { label: 'Pending Review',  value: SUBMISSIONS.filter(s => s.status === 'pending').length, color: '#f59e0b' },
          { label: 'Average Score',   value: `${Math.round(SUBMISSIONS.filter(s => s.score).reduce((a, b) => a + (b.score || 0), 0) / SUBMISSIONS.filter(s => s.score).length)}%`, color: '#ec4899' },
        ].map(s => (
          <div key={s.label} className={styles.summaryCard}>
            <p className={styles.summaryLabel}>{s.label}</p>
            <p className={styles.summaryValue} style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Submissions List */}
      <div className={styles.subList}>
        {SUBMISSIONS.map(s => (
          <div key={s.id} className={styles.subCard}>
            <div className={styles.subTop}>
              <div>
                <p className={styles.subId}>{s.id} · {s.subject}</p>
                <h3 className={styles.subTitle}>{s.exp}</h3>
                <p className={styles.subDate}>Submitted: {s.submittedOn}</p>
              </div>
              <div className={styles.subRight}>
                {s.status === 'graded' ? (
                  <div className={styles.scoreCircle} style={{ background: (s.score || 0) >= 90 ? 'linear-gradient(135deg,#22c55e,#16a34a)' : (s.score || 0) >= 75 ? 'linear-gradient(135deg,#8b5cf6,#7c3aed)' : 'linear-gradient(135deg,#f59e0b,#f2994a)' }}>
                    {s.score}
                  </div>
                ) : (
                  <div className={styles.pendingBadge}>⏳ Pending</div>
                )}
              </div>
            </div>

            {s.feedback && (
              <div className={styles.feedback}>
                <p className={styles.feedbackLabel}>💬 Instructor Feedback</p>
                <p className={styles.feedbackText}>{s.feedback}</p>
              </div>
            )}

            <div className={styles.subFooter}>
              <span className={styles.fileTag}>📄 {s.file}</span>
              <div className={styles.subActions}>
                <button className={styles.viewBtn}>View Submission</button>
                {s.status === 'graded' && <button className={styles.reportBtn}>📊 Download Report</button>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </StudentShell>
  );
}
