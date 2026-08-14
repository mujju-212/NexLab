'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import StudentShell from '@/components/layout/StudentShell';
import { studentService } from '@/services/student.service';
import type { StudentDashboard, LabSession, Experiment } from '@/types';
import {
  FlaskConical, Terminal, Upload, Trophy, Calendar, Filter,
  Plus, Code2, Cpu, Crosshair, Beaker, Thermometer, Loader2
} from 'lucide-react';
import styles from './page.module.css';

const EXP_ICONS = [Thermometer, Code2, Cpu, Crosshair, Beaker, FlaskConical];
const EXP_BGS = ['#9333ea', 'linear-gradient(135deg,#f97316,#ef4444)', 'linear-gradient(135deg,#22c55e,#16a34a)', '#d946ef', '#f59e0b', '#0284c7'];

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

interface SessionWithMeta extends LabSession {
  my_attendance?: { status: string; joined_at?: string | null };
  duration_minutes?: number | null;
}

export default function StudentDashboard() {
  const router = useRouter();
  const [dash, setDash] = useState<StudentDashboard | null>(null);
  const [sessions, setSessions] = useState<SessionWithMeta[]>([]);
  const [expTitles, setExpTitles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [d, sess, subjects] = await Promise.all([
          studentService.getDashboard(),
          studentService.getSessions(),
          studentService.getSubjects(),
        ]);
        if (cancelled) return;
        setDash(d);
        setSessions(sess as SessionWithMeta[]);

        // Build experiment title lookup across all enrolled subjects
        const expLists = await Promise.all(
          subjects.map(s => studentService.getExperiments(s.subject_id).catch(() => [] as Experiment[]))
        );
        if (cancelled) return;
        const titles: Record<string, string> = {};
        expLists.flat().forEach(e => { titles[e.id] = e.title; });
        setExpTitles(titles);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <StudentShell activePage="Dashboard Home">
        <div className={styles.loadingBox}><Loader2 size={22} className={styles.spinner} /> Loading your dashboard…</div>
      </StudentShell>
    );
  }

  if (error || !dash) {
    return (
      <StudentShell activePage="Dashboard Home">
        <div className={styles.errorBox}>⚠️ {error || 'No dashboard data available'}</div>
      </StudentShell>
    );
  }

  const scheduled = sessions.filter(s => s.status === 'scheduled').slice(0, 4);
  const active    = sessions.filter(s => s.status === 'active').slice(0, 4);
  const ended     = sessions.filter(s => s.status === 'ended').slice(0, 4);

  const renderCard = (s: SessionWithMeta, i: number, target: string) => {
    const Icon = EXP_ICONS[i % EXP_ICONS.length];
    return (
      <div key={s.id} className={styles.sessionCard} onClick={() => router.push(target)} style={{ cursor: 'pointer' }}>
        <div className={styles.cardTop}>
          <div className={styles.subjectIcon} style={{ background: EXP_BGS[i % EXP_BGS.length] }}>
            <Icon size={16} strokeWidth={2} style={{ color: '#fff' }} />
          </div>
        </div>
        <p className={styles.cardTitle}>{expTitles[s.experiment_id] || 'Lab Session'}</p>
        <div className={styles.metaRow}>
          <span><span className={styles.metaLabel}>Scheduled:</span><span className={styles.metaValue}>{fmtDate(s.scheduled_at)}</span></span>
          <span><span className={styles.metaLabel}>Duration:</span><span className={styles.metaValue}>{s.duration_minutes ? `${s.duration_minutes} min` : '—'}</span></span>
        </div>
        <p className={styles.lastUpdated}>Status: <strong>{s.status}</strong></p>
      </div>
    );
  };

  return (
    <StudentShell activePage="Dashboard Home">
      {/* Hero */}
      <div className={styles.heroRow}>
        <div className={styles.heroText}>
          <h1>Your overall performance</h1>
          <p className={styles.heroStat}>{dash.avg_grade != null ? `${dash.avg_grade}%` : '—'}</p>
        </div>
        <div className={styles.heroActions}>
          <button className={styles.btn} onClick={() => router.push('/student/subjects')}>
            <Calendar size={15} strokeWidth={1.9} /> My Subjects
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
          <p className={styles.statLabel}>Subjects Enrolled</p>
          <div className={styles.statRow}>
            <span className={styles.statValue}>{dash.subjects_enrolled}</span>
          </div>
          <p className={styles.statCompare}>{dash.total_submissions} submissions total</p>
        </div>

        <div className={styles.statCard} onClick={() => router.push('/student/rankings')} style={{ cursor: 'pointer' }}>
          <p className={styles.statLabel}>Best Rank Score</p>
          <div className={styles.statRow}>
            <span className={styles.statValue}>{dash.best_rank ? dash.best_rank.rank_score.toFixed(1) : '—'}</span>
          </div>
          <p className={styles.statCompare}>{dash.hints_used_today} AI hints used today</p>
        </div>

        <div className={styles.statCard} onClick={() => router.push('/student/certificates')} style={{ cursor: 'pointer' }}>
          <p className={styles.statLabel}>Unread Notifications</p>
          <div className={styles.statRow}>
            <span className={styles.statValue}>{dash.unread_notifications}</span>
          </div>
          <p className={styles.statCompare}>Tap to view notifications</p>
        </div>
      </div>

      {/* Sessions board */}
      <div className={styles.boardSection}>
        <div className={styles.boardHeader}>
          <h2>My Sessions</h2>
          <a onClick={() => router.push('/student/live-lab')}>View all</a>
        </div>
        <div className={styles.boardColumns}>
          <div>
            <p className={styles.colTitle}>Upcoming <span className={styles.countPill}>{scheduled.length}</span></p>
            {scheduled.map((s, i) => renderCard(s, i, '/student/pre-lab'))}
            {scheduled.length === 0 && <p className={styles.emptyCol}>No upcoming sessions</p>}
          </div>

          <div>
            <p className={styles.colTitle}>Active <span className={styles.countPill}>{active.length}</span></p>
            {active.map((s, i) => renderCard(s, i, `/student/live-lab/${s.id}`))}
            {active.length === 0 && <p className={styles.emptyCol}>No active sessions right now</p>}
          </div>

          <div>
            <p className={styles.colTitle}>Completed <span className={styles.countPill}>{ended.length}</span></p>
            {ended.map((s, i) => renderCard(s, i, '/student/submissions'))}
            {ended.length === 0 && <p className={styles.emptyCol}>No completed sessions yet</p>}
            <div className={styles.addLab} onClick={() => router.push('/student/live-lab')}>
              <Plus size={15} strokeWidth={1.9} /> All sessions
            </div>
          </div>
        </div>
      </div>

      {/* Concept snapshot */}
      {(dash.top_concepts.length > 0 || dash.weak_concepts.length > 0) && (
        <div className={styles.boardSection}>
          <div className={styles.boardHeader}>
            <h2>Concept Snapshot</h2>
            <a onClick={() => router.push('/student/analytics')}>Full analytics</a>
          </div>
          <div className={styles.boardColumns}>
            <div>
              <p className={styles.colTitle}>Strongest Concepts <span className={styles.countPill}>{dash.top_concepts.length}</span></p>
              {dash.top_concepts.map(c => (
                <div key={c.concept} className={styles.sessionCard}>
                  <p className={styles.cardTitle}>{c.concept}</p>
                  <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${c.mastery_score}%`, background: '#22c55e' }} /></div>
                  <p className={styles.lastUpdated}>Mastery: <strong>{Math.round(c.mastery_score)}%</strong></p>
                </div>
              ))}
              {dash.top_concepts.length === 0 && <p className={styles.emptyCol}>No mastery data yet</p>}
            </div>
            <div>
              <p className={styles.colTitle}>Needs Attention <span className={styles.countPill}>{dash.weak_concepts.length}</span></p>
              {dash.weak_concepts.map(c => (
                <div key={c.concept} className={styles.sessionCard}>
                  <p className={styles.cardTitle}>{c.concept}</p>
                  <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${c.mastery_score}%`, background: '#f59e0b' }} /></div>
                  <p className={styles.lastUpdated}>Mastery: <strong>{Math.round(c.mastery_score)}%</strong></p>
                </div>
              ))}
              {dash.weak_concepts.length === 0 && <p className={styles.emptyCol}>No weak concepts — great job! 🎉</p>}
            </div>
          </div>
        </div>
      )}
    </StudentShell>
  );
}
