'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  RotateCcw, Video, Lock, Unlock, CheckCircle2, Clock, ShieldAlert, FileText,
  ChevronRight, PlayCircle, Percent, Send
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import styles from '../shared.module.css';

interface CatchUpStudent {
  id: string;
  name: string;
  roll: string;
  session: string;
  videoWatchedPct: number;
  videoThreshold: number;
  codeUnlocked: boolean;
  latePenaltyPct: number;
  status: 'Reviewing' | 'Pending Video' | 'Unlocked';
  notes: string;
}

const INITIAL_CATCHUP: CatchUpStudent[] = [
  {
    id: 'c1',
    name: 'Dev Chatterjee',
    roll: 'CS21009',
    session: 'Acid-Base Titration Analysis',
    videoWatchedPct: 100,
    videoThreshold: 80,
    codeUnlocked: true,
    latePenaltyPct: 5,
    status: 'Unlocked',
    notes: 'Completed video recording; submitted code within 24h window.',
  },
  {
    id: 'c2',
    name: 'Amit Das',
    roll: 'CS21014',
    session: 'Stack Data Structure Implementation',
    videoWatchedPct: 85,
    videoThreshold: 80,
    codeUnlocked: false,
    latePenaltyPct: 10,
    status: 'Reviewing',
    notes: 'Watched 85% of recording. Ready to unlock virtual lab coding.',
  },
  {
    id: 'c3',
    name: 'Nisha Reddy',
    roll: 'CS21015',
    session: 'Digital Logic Circuit Design',
    videoWatchedPct: 40,
    videoThreshold: 80,
    codeUnlocked: false,
    latePenaltyPct: 15,
    status: 'Pending Video',
    notes: 'Needs to complete video recording before coding environment unlocks.',
  },
];

export default function CatchUpPage() {
  const router = useRouter();
  const [students, setStudents] = useState<CatchUpStudent[]>(INITIAL_CATCHUP);
  const [toast, setToast] = useState<string | null>(null);

  const toggleUnlockCode = (id: string) => {
    setStudents(students.map(s => {
      if (s.id === id) {
        const nextState = !s.codeUnlocked;
        if (nextState) {
          setToast(`Unlocked Virtual Lab coding environment for ${s.name}!`);
        }
        return { ...s, codeUnlocked: nextState, status: nextState ? 'Unlocked' : 'Reviewing' };
      }
      return s;
    }));
    setTimeout(() => setToast(null), 4000);
  };

  return (
    <InstructorShell
      activePage="Catch-Up Reviews"
      title="Catch-Up & Late Submission Review"
      subtitle="Workflow 7: Monitor late learners, verify video recording completion thresholds, unlock coding labs, and configure late penalties"
    >
      {/* Action Row */}
      <div className={styles.actionRow}>
        <button type="button" className={styles.primaryBtn} onClick={() => router.push('/instructor/content')}>
          <Video size={16} strokeWidth={2} /> Video Recording Library
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={() => router.push('/instructor/grading')}>
          <FileText size={16} strokeWidth={1.9} /> Review Catch-Up Submissions
        </button>
      </div>

      {toast && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px 16px', borderRadius: '12px', marginBottom: '20px', color: '#166534', fontSize: '13.5px', fontWeight: 600 }}>
          🔓 {toast}
        </div>
      )}

      {/* KPI Cards */}
      <div className={styles.kpiRow}>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Catch-Up Students</p>
          <p className={styles.kpiValue} style={{ color: '#2563eb' }}>{students.length}</p>
          <p className={styles.kpiSub}>Missed live session</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Video Gate Requirement</p>
          <p className={styles.kpiValue} style={{ color: '#7c3aed' }}>80%</p>
          <p className={styles.kpiSub}>Required watch threshold</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Lab Unlocked</p>
          <p className={styles.kpiValue} style={{ color: '#16a34a' }}>{students.filter(s => s.codeUnlocked).length}</p>
          <p className={styles.kpiSub}>Ready for code submission</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Default Late Penalty</p>
          <p className={styles.kpiValue} style={{ color: '#b45309' }}>10%</p>
          <p className={styles.kpiSub}>Auto-applied to catch-up</p>
        </div>
      </div>

      {/* Catch-Up List */}
      <section className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Catch-Up Roster & Video Watch Verification</h2>
            <p className={styles.sectionSub}>Workflow 7 rules: Students must watch 80% of lab recording to unlock the interactive coding editor.</p>
          </div>
        </div>

        <div className={styles.list}>
          {students.map((st) => (
            <div key={st.id} className={styles.listRow}>
              <div className={styles.rowIcon} style={{ background: st.codeUnlocked ? '#dcfce7' : '#fef3c7', color: st.codeUnlocked ? '#166534' : '#b45309' }}>
                <RotateCcw size={20} strokeWidth={1.9} />
              </div>

              <div className={styles.rowBody}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <p className={styles.rowTitle}>{st.name} <span style={{ fontSize: '12px', color: '#64748b' }}>({st.roll})</span></p>
                  <span className={`${styles.badge} ${st.codeUnlocked ? styles.greenBadge : st.videoWatchedPct >= st.videoThreshold ? styles.blueBadge : styles.amberBadge}`}>
                    {st.status}
                  </span>
                </div>
                <p className={styles.rowMeta}>Session: {st.session} · Late Penalty: {st.latePenaltyPct}%</p>
                
                {/* Video Watch Progress Bar */}
                <div style={{ margin: '8px 0', maxWidth: '380px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', fontWeight: 600, color: '#475569', marginBottom: '3px' }}>
                    <span>Recording Watched: {st.videoWatchedPct}%</span>
                    <span>Gate Requirement: {st.videoThreshold}%</span>
                  </div>
                  <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${st.videoWatchedPct}%`,
                        background: st.videoWatchedPct >= st.videoThreshold ? '#22c55e' : '#f59e0b',
                      }}
                    />
                  </div>
                </div>

                <p className={styles.rowSub}>📝 Note: {st.notes}</p>
              </div>

              <div className={styles.rowSide}>
                {st.codeUnlocked ? (
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#166534', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Unlock size={14} /> Coding Unlocked
                  </span>
                ) : (
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#b45309', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Lock size={14} /> Coding Locked
                  </span>
                )}
                
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  <button
                    type="button"
                    className={st.codeUnlocked ? styles.secondaryBtn : styles.primaryBtn}
                    style={{ minHeight: '34px', padding: '0 12px', fontSize: '12px' }}
                    onClick={() => toggleUnlockCode(st.id)}
                  >
                    {st.codeUnlocked ? 'Lock Coding' : 'Unlock Coding'}
                  </button>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    style={{ minHeight: '34px', padding: '0 12px', fontSize: '12px' }}
                    onClick={() => router.push('/instructor/grading')}
                  >
                    Review Code
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </InstructorShell>
  );
}
