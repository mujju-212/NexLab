'use client';

import { useRouter } from 'next/navigation';
import StudentShell from '@/components/layout/StudentShell';
import {
  FlaskConical, Terminal, Upload, Trophy, Calendar, Filter,
  ArrowUp, ArrowDown, Plus, Thermometer, Code2, Cpu, Crosshair, Beaker
} from 'lucide-react';
import styles from './page.module.css';

export default function StudentDashboard() {
  const router = useRouter();

  return (
    <StudentShell activePage="Dashboard Home">
      {/* Hero */}
      <div className={styles.heroRow}>
        <div className={styles.heroText}>
          <h1>Your overall performance</h1>
          <p className={styles.heroStat}>92.5%</p>
        </div>
        <div className={styles.heroActions}>
          <button className={styles.btn} onClick={() => router.push('/student/pre-lab')}>
            <Calendar size={15} strokeWidth={1.9} /> View Schedule
          </button>
          <button className={styles.btn} onClick={() => router.push('/student/analytics')}>
            <Filter size={15} strokeWidth={1.9} /> Analytics
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className={styles.quickActions}>
        <button className={`${styles.quickBtn} ${styles.quickBtnPrimary}`} onClick={() => router.push('/student/pre-lab')}>
          <FlaskConical size={15} strokeWidth={1.9} /> Start Pre-Lab
        </button>
        <button className={`${styles.quickBtn} ${styles.quickBtnGreen}`} onClick={() => router.push('/student/live-lab')}>
          <Terminal size={15} strokeWidth={1.9} /> Join Live Lab
        </button>
        <button className={styles.quickBtn} onClick={() => router.push('/student/submissions')}>
          <Upload size={15} strokeWidth={1.9} /> View Submissions
        </button>
        <button className={styles.quickBtn} onClick={() => router.push('/student/rankings')}>
          <Trophy size={15} strokeWidth={1.9} /> Rankings
        </button>
      </div>

      {/* Stat cards */}
      <div className={styles.statCards}>
        <div className={styles.statCard} onClick={() => router.push('/student/analytics')} style={{ cursor: 'pointer' }}>
          <p className={styles.statLabel}>Weekly Study Hours</p>
          <div className={styles.statRow}>
            <span className={styles.statValue}>18.5 <small>hrs</small></span>
            <span className={`${styles.badge} ${styles.badgeUp}`}><ArrowUp size={11} strokeWidth={2.5} />12%</span>
          </div>
          <p className={styles.statCompare}>compared to last week</p>
          <svg className={styles.sparkline} viewBox="0 0 140 64">
            <defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#a855f7"/><stop offset="100%" stopColor="#7c3aed"/></linearGradient></defs>
            <polyline points="2,50 24,46 46,52 68,34 90,26 112,14 138,6" fill="none" stroke="url(#g1)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <div className={styles.statCard} onClick={() => router.push('/student/pre-lab')} style={{ cursor: 'pointer' }}>
          <p className={styles.statLabel}>Pending Pre-Labs</p>
          <div className={styles.statRow}>
            <span className={styles.statValue}>3</span>
            <span className={`${styles.badge} ${styles.badgeDown}`}><ArrowDown size={11} strokeWidth={2.5} />2</span>
          </div>
          <p className={styles.statCompare}>compared to last week</p>
          <svg className={styles.sparkline} viewBox="0 0 140 64">
            <defs><linearGradient id="g2" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#fb923c"/><stop offset="100%" stopColor="#ea580c"/></linearGradient></defs>
            <polyline points="2,10 24,22 46,16 68,34 90,30 112,48 138,44" fill="none" stroke="url(#g2)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <div className={styles.statCard} onClick={() => router.push('/student/rankings')} style={{ cursor: 'pointer' }}>
          <p className={styles.statLabel}>Current Rank</p>
          <div className={styles.statRow}>
            <span className={styles.statValue}>#12</span>
            <span className={`${styles.badge} ${styles.badgeUp}`}><ArrowUp size={11} strokeWidth={2.5} />3</span>
          </div>
          <p className={styles.statCompare}>compared to last week</p>
          <svg className={styles.sparkline} viewBox="0 0 140 64">
            <defs><linearGradient id="g3" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#c084fc"/><stop offset="100%" stopColor="#9333ea"/></linearGradient></defs>
            <polyline points="2,48 24,50 46,38 68,40 90,24 112,20 138,6" fill="none" stroke="url(#g3)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      {/* Sessions board */}
      <div className={styles.boardSection}>
        <div className={styles.boardHeader}>
          <h2>Upcoming Sessions</h2>
          <a onClick={() => router.push('/student/pre-lab')}>View all</a>
        </div>
        <div className={styles.boardColumns}>
          <div>
            <p className={styles.colTitle}>Pending <span className={styles.countPill}>2</span></p>
            {[
              { title: 'Thermodynamics: Heat Transfer Experiment', Icon: Thermometer, bg: 'linear-gradient(135deg,#f97316,#ef4444)', avatars: [['RS','#8b5cf6'],['AK','#ec4899'],['MN','#f59e0b']], date: 'Jul 10, 2026' },
              { title: 'Data Structures: Stack Implementation', Icon: Code2, bg: '#6366f1', avatars: [['PJ','#14b8a6'],['IN','#64748b']], date: 'Jul 12, 2026' },
            ].map(s => (
              <div key={s.title} className={styles.sessionCard} onClick={() => router.push('/student/pre-lab')} style={{ cursor: 'pointer' }}>
                <div className={styles.cardTop}>
                  <div className={styles.subjectIcon} style={{ background: s.bg }}><s.Icon size={16} strokeWidth={2} style={{ color: '#fff' }} /></div>
                  <div className={styles.avatarStack}>{s.avatars.map(([i, c]) => <div key={i} className={styles.avatar} style={{ background: c }}>{i}</div>)}</div>
                </div>
                <p className={styles.cardTitle}>{s.title}</p>
                <div className={styles.metaRow}><span><span className={styles.metaLabel}>Start:</span><span className={styles.metaValueMuted}>Not Started</span></span></div>
                <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: '0%', background: 'rgba(255,255,255,.2)' }} /></div>
                <p className={styles.lastUpdated}>Last updated: <strong>{s.date}</strong></p>
              </div>
            ))}
          </div>

          <div>
            <p className={styles.colTitle}>Ongoing <span className={styles.countPill}>2</span></p>
            {[
              { title: 'Organic Chemistry: Titration Lab', Icon: Beaker, bg: 'linear-gradient(135deg,#22c55e,#16a34a)', avatars: [['IN','#64748b']], start: 'Jul 1', end: 'Jul 30', pct: 60, date: 'Jul 18, 2026' },
              { title: 'Digital Logic: Circuit Design Lab', Icon: Cpu, bg: '#0ea5e9', avatars: [['AK','#ec4899'],['RS','#8b5cf6']], start: 'Jul 5', end: 'Aug 5', pct: 25, date: 'Jul 20, 2026' },
            ].map(s => (
              <div key={s.title} className={styles.sessionCard} onClick={() => router.push('/student/live-lab')} style={{ cursor: 'pointer' }}>
                <div className={styles.cardTop}>
                  <div className={styles.subjectIcon} style={{ background: s.bg }}><s.Icon size={16} strokeWidth={2} style={{ color: '#fff' }} /></div>
                  <div className={styles.avatarStack}>{s.avatars.map(([i, c]) => <div key={i} className={styles.avatar} style={{ background: c }}>{i}</div>)}</div>
                </div>
                <p className={styles.cardTitle}>{s.title}</p>
                <div className={styles.metaRow}>
                  <span><span className={styles.metaLabel}>Start:</span><span className={styles.metaValue}>{s.start}</span></span>
                  <span><span className={styles.metaLabel}>Deadline:</span><span className={styles.metaValue}>{s.end}</span></span>
                </div>
                <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${s.pct}%` }} /></div>
                <p className={styles.lastUpdated}>Last updated: <strong>{s.date}</strong></p>
              </div>
            ))}
          </div>

          <div>
            <p className={styles.colTitle}>Completed <span className={styles.countPill}>1</span></p>
            <div className={styles.sessionCard} onClick={() => router.push('/student/submissions')} style={{ cursor: 'pointer' }}>
              <div className={styles.cardTop}>
                <div className={styles.subjectIcon} style={{ background: 'linear-gradient(135deg,#a855f7,#7c3aed)' }}><Crosshair size={16} strokeWidth={2} style={{ color: '#fff' }} /></div>
                <div className={styles.avatarStack}>{[['IN','#64748b'],['MN','#f59e0b']].map(([i, c]) => <div key={i} className={styles.avatar} style={{ background: c }}>{i}</div>)}</div>
              </div>
              <p className={styles.cardTitle}>Mechanics: Projectile Motion Lab</p>
              <div className={styles.metaRow}><span><span className={styles.metaLabel}>Ended:</span><span className={styles.metaValue}>Jun 11, 2026</span></span></div>
              <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: '100%' }} /></div>
              <p className={styles.lastUpdated}>Last updated: <strong>Jun 12, 2026</strong></p>
            </div>
            <div className={styles.addLab} onClick={() => router.push('/student/live-lab')}>
              <Plus size={15} strokeWidth={2} /> Join new lab
            </div>
          </div>
        </div>
      </div>
    </StudentShell>
  );
}
