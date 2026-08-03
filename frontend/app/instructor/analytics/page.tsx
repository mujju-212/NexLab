'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart3, CheckCircle2, Clock, AlertTriangle, Users, BrainCircuit,
  Eye, FileText, Video, Code, HelpCircle, ChevronRight, ShieldCheck, RefreshCw
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import styles from '../shared.module.css';

interface StudentReadiness {
  id: string;
  name: string;
  roll: string;
  subject: string;
  section: string;
  theoryRead: boolean;
  videoWatched: boolean;
  codeAttempted: boolean;
  quizScore: number;
  threshold: number;
  status: 'Prepared' | 'In Progress' | 'Not Started';
}

const INITIAL_STUDENTS: StudentReadiness[] = [
  { id: 's1', name: 'Arjun Mehta', roll: 'CS21001', subject: 'Data Structures', section: 'Section A', theoryRead: true, videoWatched: true, codeAttempted: true, quizScore: 90, threshold: 75, status: 'Prepared' },
  { id: 's2', name: 'Priya Sharma', roll: 'CS21002', subject: 'Data Structures', section: 'Section A', theoryRead: true, videoWatched: true, codeAttempted: true, quizScore: 85, threshold: 75, status: 'Prepared' },
  { id: 's3', name: 'Rohan Gupta', roll: 'CS21003', subject: 'Data Structures', section: 'Section A', theoryRead: true, videoWatched: true, codeAttempted: false, quizScore: 65, threshold: 75, status: 'In Progress' },
  { id: 's4', name: 'Neha Pillai', roll: 'CS21004', subject: 'Data Structures', section: 'Section A', theoryRead: true, videoWatched: false, codeAttempted: false, quizScore: 40, threshold: 75, status: 'In Progress' },
  { id: 's5', name: 'Amit Das', roll: 'CS21005', subject: 'Data Structures', section: 'Section A', theoryRead: false, videoWatched: false, codeAttempted: false, quizScore: 0, threshold: 75, status: 'Not Started' },
  { id: 's6', name: 'Dev Chatterjee', roll: 'CS21006', subject: 'Data Structures', section: 'Section A', theoryRead: true, videoWatched: true, codeAttempted: true, quizScore: 78, threshold: 75, status: 'Prepared' },
  { id: 's7', name: 'Ananya Verma', roll: 'CS21007', subject: 'Data Structures', section: 'Section A', theoryRead: true, videoWatched: true, codeAttempted: true, quizScore: 95, threshold: 75, status: 'Prepared' },
  { id: 's8', name: 'Karan Singh', roll: 'CS21008', subject: 'Data Structures', section: 'Section A', theoryRead: false, videoWatched: false, codeAttempted: false, quizScore: 0, threshold: 75, status: 'Not Started' },
];

export default function AnalyticsPage() {
  const router = useRouter();
  const [students, setStudents] = useState<StudentReadiness[]>(INITIAL_STUDENTS);
  const [statusFilter, setStatusFilter] = useState<'All' | 'Prepared' | 'In Progress' | 'Not Started'>('All');
  const [toast, setToast] = useState<string | null>(null);

  const preparedCount = students.filter(s => s.status === 'Prepared').length;
  const inProgressCount = students.filter(s => s.status === 'In Progress').length;
  const notStartedCount = students.filter(s => s.status === 'Not Started').length;
  const overallPct = Math.round((preparedCount / students.length) * 100);

  const filteredStudents = students.filter(
    (s) => statusFilter === 'All' || s.status === statusFilter
  );

  const handleNotifyReminders = () => {
    setToast(`Nudge sent to ${inProgressCount + notStartedCount} students who haven't unlocked the pre-lab gate yet.`);
    setTimeout(() => setToast(null), 4000);
  };

  return (
    <InstructorShell
      activePage="Analytics"
      title="Student Pre-Lab & Knowledge Insights"
      subtitle="Workflow 4 & 8: Track student pre-lab completion, monitor readiness scores, and view concept mastery signals"
    >
      {/* Top Action Bar */}
      <div className={styles.actionRow}>
        <button type="button" className={styles.primaryBtn} onClick={handleNotifyReminders}>
          <Clock size={16} strokeWidth={2} /> Nudge Unprepared Students
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={() => router.push('/instructor/live-lab')}>
          <Users size={16} strokeWidth={1.9} /> Open Live Lab Control
        </button>
        <button type="button" className={styles.ghostBtn} onClick={() => router.push('/instructor/grading')}>
          <BarChart3 size={16} strokeWidth={1.9} /> Review Post-Grading
        </button>
      </div>

      {toast && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px 16px', borderRadius: '12px', marginBottom: '20px', color: '#166534', fontSize: '13.5px', fontWeight: 600 }}>
          ✅ {toast}
        </div>
      )}

      {/* Workflow 4 Readiness Overview Panel */}
      <div className={styles.gridTwo}>
        {/* Readiness Gauge & Breakdown */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Workflow 4: Overall Class Readiness</h2>
              <p className={styles.sectionSub}>CS301 Data Structures · Section A (28 Students)</p>
            </div>
            <span className={styles.greenBadge}>78% Ready</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', margin: '20px 0' }}>
            {/* Visual Ring Simulator */}
            <div style={{ position: 'relative', width: '120px', height: '120px', flexShrink: 0 }}>
              <svg width="120" height="120" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="50" fill="none" stroke="#e2e8f0" strokeWidth="12" />
                <circle cx="60" cy="60" r="50" fill="none" stroke="#0f766e" strokeWidth="12" strokeDasharray="314" strokeDashoffset={314 - (314 * overallPct) / 100} strokeLinecap="round" transform="rotate(-90 60 60)" />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'Space Grotesk' }}>{overallPct}%</span>
                <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Cleared Gate</span>
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e' }} /> Prepared & Ready
                </span>
                <strong style={{ fontFamily: 'Space Grotesk', fontSize: '15px' }}>{preparedCount} students</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#b45309', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b' }} /> In Progress
                </span>
                <strong style={{ fontFamily: 'Space Grotesk', fontSize: '15px' }}>{inProgressCount} students</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }} /> Not Started
                </span>
                <strong style={{ fontFamily: 'Space Grotesk', fontSize: '15px' }}>{notStartedCount} students</strong>
              </div>
            </div>
          </div>
        </section>

        {/* Concept Mastery & Knowledge Insights (Workflow 8) */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Concept Mastery & Risk Signals</h2>
              <p className={styles.sectionSub}>AI Knowledge Tracing Engine Insights</p>
            </div>
            <span className={styles.purpleBadge}><BrainCircuit size={14} /> AI Active</span>
          </div>

          <div className={styles.list}>
            <div className={styles.listRow}>
              <div className={styles.rowIcon} style={{ background: '#dcfce7', color: '#166534' }}>
                <CheckCircle2 size={20} />
              </div>
              <div className={styles.rowBody}>
                <p className={styles.rowTitle}>Stack Operations & LIFO Logic</p>
                <p className={styles.rowSub}>92% class mastery · High confidence score</p>
              </div>
              <span className={styles.pillGreen}>High Mastery</span>
            </div>

            <div className={styles.listRow}>
              <div className={styles.rowIcon} style={{ background: '#fef3c7', color: '#b45309' }}>
                <AlertTriangle size={20} />
              </div>
              <div className={styles.rowBody}>
                <p className={styles.rowTitle}>Pointer Memory & Array Overflow Handling</p>
                <p className={styles.rowSub}>64% class mastery · 5 students struggling</p>
              </div>
              <span className={styles.pillAmber}>Intervention Recommended</span>
            </div>
          </div>
        </section>
      </div>

      {/* Student Activity & Pre-Lab Breakdown Table */}
      <section className={styles.tableCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Student Pre-Lab Activity Roster</h2>
            <p className={styles.sectionSub}>Step completion: Read Theory → Watch Video → Interactive Code → Quiz Score vs Gate (75%)</p>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['All', 'Prepared', 'In Progress', 'Not Started'] as const).map((st) => (
              <button
                key={st}
                type="button"
                className={`${styles.tabChip} ${statusFilter === st ? styles.tabChipActive : ''}`}
                style={{ padding: '6px 12px', fontSize: '12px' }}
                onClick={() => setStatusFilter(st)}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Student Name</th>
              <th>Roll No</th>
              <th>Theory</th>
              <th>Video</th>
              <th>Interactive Code</th>
              <th>Quiz Score</th>
              <th>Readiness Gate</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((s) => (
              <tr key={s.id}>
                <td className={styles.tdStrong}>{s.name}</td>
                <td>{s.roll}</td>
                <td>{s.theoryRead ? <span style={{ color: '#16a34a' }}>✓ Done</span> : <span style={{ color: '#94a3b8' }}>-</span>}</td>
                <td>{s.videoWatched ? <span style={{ color: '#16a34a' }}>✓ Watched</span> : <span style={{ color: '#94a3b8' }}>-</span>}</td>
                <td>{s.codeAttempted ? <span style={{ color: '#16a34a' }}>✓ Executed</span> : <span style={{ color: '#94a3b8' }}>-</span>}</td>
                <td>
                  <strong style={{ color: s.quizScore >= s.threshold ? '#166534' : s.quizScore > 0 ? '#b45309' : '#94a3b8' }}>
                    {s.quizScore > 0 ? `${s.quizScore}%` : 'Not Attempted'}
                  </strong>
                </td>
                <td>
                  <span className={`${styles.pill} ${s.status === 'Prepared' ? styles.pillGreen : s.status === 'In Progress' ? styles.pillAmber : styles.pillSlate}`}>
                    {s.status === 'Prepared' ? 'Unlocked (Ready)' : s.status === 'In Progress' ? 'Locked (In Progress)' : 'Not Started'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </InstructorShell>
  );
}
