'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import StudentShell from '@/components/layout/StudentShell';
import styles from './page.module.css';

const SUBJECTS = [
  {
    id: 'sub-001', name: 'Data Structures & Algorithms', code: 'CS301',
    instructor: 'Dr. Ramesh Kumar', section: 'Section A', credits: 4,
    color: 'linear-gradient(135deg,#8b5cf6,#7c3aed)',
    experiments: [
      { name: 'Stack Implementation',       status: 'ready',    date: 'Aug 2' },
      { name: 'Queue using Linked List',     status: 'upcoming', date: 'Aug 9' },
      { name: 'Binary Search Tree',          status: 'upcoming', date: 'Aug 16' },
      { name: 'Graph — BFS & DFS',           status: 'draft',    date: 'Aug 23' },
    ],
  },
  {
    id: 'sub-002', name: 'Operating Systems', code: 'CS401',
    instructor: 'Prof. Anita Verma', section: 'Section B', credits: 3,
    color: 'linear-gradient(135deg,#0ea5e9,#0284c7)',
    experiments: [
      { name: 'Process Scheduling',   status: 'ready',    date: 'Aug 3' },
      { name: 'Memory Management',    status: 'upcoming', date: 'Aug 10' },
      { name: 'Deadlock Detection',   status: 'draft',    date: 'Aug 17' },
    ],
  },
  {
    id: 'sub-003', name: 'Database Management Systems', code: 'CS402',
    instructor: 'Dr. Priya Nair', section: 'Section A', credits: 4,
    color: 'linear-gradient(135deg,#f59e0b,#f2994a)',
    experiments: [
      { name: 'ER Diagram Lab',        status: 'ready',    date: 'Aug 4' },
      { name: 'SQL Queries Lab',       status: 'upcoming', date: 'Aug 11' },
      { name: 'Normalization Exercise', status: 'draft',   date: 'Aug 18' },
    ],
  },
  {
    id: 'sub-004', name: 'Computer Networks', code: 'CS403',
    instructor: 'Dr. Suresh Mehta', section: 'Section C', credits: 3,
    color: 'linear-gradient(135deg,#ec4899,#d6409f)',
    experiments: [
      { name: 'OSI Layer Simulation',  status: 'upcoming', date: 'Aug 5' },
      { name: 'TCP/IP Protocol Lab',   status: 'draft',    date: 'Aug 12' },
    ],
  },
];

export default function SubjectsPage() {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>('sub-001');

  return (
    <StudentShell activePage="My Subjects" title="My Subjects" subtitle="View your enrolled subjects and their experiments">
      <div className={styles.grid}>
        {SUBJECTS.map(sub => (
          <div key={sub.id} className={`${styles.subCard} ${expanded === sub.id ? styles.subCardOpen : ''}`}>
            <div className={styles.subHeader} onClick={() => setExpanded(expanded === sub.id ? null : sub.id)}>
              <div className={styles.subIcon} style={{ background: sub.color }}>
                {sub.name.charAt(0)}
              </div>
              <div className={styles.subInfo}>
                <p className={styles.subCode}>{sub.code} · {sub.credits} Credits</p>
                <h3 className={styles.subName}>{sub.name}</h3>
                <p className={styles.subMeta}>{sub.instructor} · {sub.section}</p>
              </div>
              <div className={styles.subRight}>
                <span className={styles.expCount}>{sub.experiments.length} experiments</span>
                <span className={styles.chevron}>{expanded === sub.id ? '▲' : '▼'}</span>
              </div>
            </div>

            {expanded === sub.id && (
              <div className={styles.expList}>
                <div className={styles.expListHeader}>
                  <span>Experiment</span>
                  <span>Date</span>
                  <span>Status</span>
                  <span>Action</span>
                </div>
                {sub.experiments.map((exp, i) => (
                  <div key={i} className={styles.expRow}>
                    <span className={styles.expName}>
                      <span className={styles.expNum}>{i + 1}</span>
                      {exp.name}
                    </span>
                    <span className={styles.expDate}>{exp.date}</span>
                    <span className={`${styles.expStatus} ${
                      exp.status === 'ready' ? styles.statusReady :
                      exp.status === 'upcoming' ? styles.statusUpcoming : styles.statusDraft}`}>
                      {exp.status === 'ready' ? '✅ Ready' : exp.status === 'upcoming' ? '🕐 Upcoming' : '📝 Draft'}
                    </span>
                    <button
                      className={`${styles.expBtn} ${exp.status !== 'ready' ? styles.expBtnDisabled : ''}`}
                      disabled={exp.status !== 'ready'}
                      onClick={() => router.push('/student/pre-lab')}
                    >
                      {exp.status === 'ready' ? '→ Open Pre-Lab' : 'Not Available'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </StudentShell>
  );
}
