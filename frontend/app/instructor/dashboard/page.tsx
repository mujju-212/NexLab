'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import InstructorShell from '@/components/layout/InstructorShell';
import AttentionPanel from '@/components/instructor/AttentionPanel';
import { useAuthStore } from '@/store/auth-store';
import { sessionService } from '@/services/session.service';
import {
  PlayCircle, ClipboardCheck, Users, BarChart3,
  FlaskConical, CalendarClock,
  Radio, Clock, CheckCircle2, AlertCircle, BookOpen
} from 'lucide-react';
import styles from './page.module.css';

interface SessionItem {
  id: string;
  status: 'scheduled' | 'active' | 'ended';
  experiment_title: string;
  section_name: string | null;
  subject_name: string | null;
  student_count: number;
  scheduled_at: string;
}

interface PendingSub {
  student_id: string;
  experiment_id: string;
  session_id: string | null;
  student_name: string;
  roll_number: string;
  experiment_title: string;
  submitted_at: string | null;
  test_cases_passed: number | null;
  test_cases_total: number | null;
}

interface DashStats {
  experiment_count: number;
  student_count: number;
  active_session_count: number;
  pending_grading_count: number;
}

const AVATAR_BGS = ['#7c3aed', '#d946ef', '#f59e0b', '#22c55e', '#ec4899', '#f2994a'];

const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
};

const timeAgo = (iso: string | null) => {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
  return `${Math.floor(hrs / 24)} day(s) ago`;
};

export default function InstructorDashboard() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState(true);
  const [activeSessions, setActiveSessions] = useState<SessionItem[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<SessionItem[]>([]);
  const [pending, setPending] = useState<PendingSub[]>([]);
  const [stats, setStats] = useState<DashStats>({
    experiment_count: 0, student_count: 0, active_session_count: 0, pending_grading_count: 0,
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await sessionService.getDashboard();
        if (!mounted) return;
        setActiveSessions(res.active_sessions ?? []);
        setUpcomingSessions(res.upcoming_sessions ?? []);
        setPending(res.pending_submissions ?? []);
        setStats(res.stats ?? { experiment_count: 0, student_count: 0, active_session_count: 0, pending_grading_count: 0 });
      } catch {
        // dashboard stays empty on error — toast handled elsewhere
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const allSessions: SessionItem[] = [...activeSessions, ...upcomingSessions];
  const firstName = user?.full_name?.split(' ')[0] || 'Instructor';

  return (
    <InstructorShell activePage="Dashboard">

      {/* ── Welcome Banner ─────────────────────────────────────────────── */}
      <div className={styles.welcomeBanner}>
        <div className={styles.welcomeLeft}>
          <h1>Welcome back, {firstName} 👋</h1>
          <div className={styles.welcomeMeta}>
            <span className={styles.welcomeTag}>
              <FlaskConical size={13} strokeWidth={2} />
              {stats.experiment_count} experiment{stats.experiment_count === 1 ? '' : 's'} authored
            </span>
            <span className={styles.welcomeTag}>
              <Users size={13} strokeWidth={2} />
              {stats.student_count} students across your sections
            </span>
          </div>
        </div>
        <div className={styles.welcomeRight}>
          <button className={styles.quickBtn} onClick={() => router.push('/instructor/live-lab')}>
            <Radio size={14} strokeWidth={2} /> Join Live Lab
          </button>
          <button className={styles.quickBtn} onClick={() => router.push('/instructor/grading')}>
            <ClipboardCheck size={14} strokeWidth={2} /> Grade Submissions
          </button>
        </div>
      </div>

      {/* ── 4 Stat Cards ──────────────────────────────────────────────── */}
      <div className={styles.statGrid4}>
        {[
          { label: 'My Students',       value: String(stats.student_count),          sub: 'Enrolled in your sections',   Icon: Users,          bg: 'linear-gradient(135deg,#7c3aed,#9333ea)', route: '/instructor/students'   },
          { label: 'Active Sessions',   value: String(stats.active_session_count),   sub: `${upcomingSessions.length} upcoming scheduled`, Icon: PlayCircle, bg: 'linear-gradient(135deg,#d946ef,#9333ea)', route: '/instructor/sessions'   },
          { label: 'Pending Grading',   value: String(stats.pending_grading_count),  sub: 'Final submissions ungraded',  Icon: ClipboardCheck, bg: 'linear-gradient(135deg,#f59e0b,#f2994a)', route: '/instructor/grading'    },
          { label: 'My Experiments',    value: String(stats.experiment_count),       sub: 'Authored lab experiments',    Icon: BarChart3,      bg: 'linear-gradient(135deg,#22c55e,#16a34a)', route: '/instructor/experiments' },
        ].map(s => (
          <div
            key={s.label}
            className={styles.statCard}
            onClick={() => router.push(s.route)}
            style={{ cursor: 'pointer' }}
          >
            <div className={styles.statIcon} style={{ background: s.bg }}>
              <s.Icon size={17} strokeWidth={1.9} color="#fff" />
            </div>
            <p className={styles.statLabel}>{s.label}</p>
            <div className={styles.statRow}>
              <span className={styles.statValue}>{loading ? '…' : s.value}</span>
            </div>
            <p className={styles.statSub}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Attention Needed (DB1-DB4) ─────────────────────────────────── */}
      <AttentionPanel />

      {/* ── Activity Board ─────────────────────────────────────────────── */}
      <div className={styles.boardSection}>
        <div className={styles.boardHeader}>
          <h2>Teaching Overview</h2>
          <a onClick={() => router.push('/instructor/sessions')} style={{ cursor: 'pointer' }}>View all sessions</a>
        </div>
        <div className={styles.boardColumns}>

          {/* Sessions */}
          <div>
            <p className={styles.colTitle}>
              Sessions <span className={styles.countPill}>{allSessions.length}</span>
            </p>
            {allSessions.map(s => (
              <div
                key={s.id}
                className={styles.actCard}
                onClick={() => router.push(
                  s.status === 'active' ? `/instructor/live-lab?session=${s.id}` : '/instructor/sessions'
                )}
                style={{ cursor: 'pointer' }}
              >
                <div className={styles.actTop}>
                  <div className={styles.actIcon} style={{
                    background: s.status === 'active' ? 'linear-gradient(135deg,#22c55e,#16a34a)' :
                      'linear-gradient(135deg,#7c3aed,#9333ea)'
                  }}>
                    {s.status === 'active' ? <Radio size={15} strokeWidth={1.9} color="#fff" /> :
                      <CalendarClock size={15} strokeWidth={1.9} color="#fff" />}
                  </div>
                  <div>
                    <p className={styles.actName}>{s.experiment_title}</p>
                    <p className={styles.actMeta}>
                      {s.section_name ?? '—'} · {s.student_count} students
                    </p>
                  </div>
                  <div className={styles.actStatus}>
                    <span className={`${styles.statusPill} ${
                      s.status === 'active' ? styles.statusActive : styles.statusPending
                    }`}>
                      {s.status === 'active' ? 'Live' : 'Upcoming'}
                    </span>
                  </div>
                </div>
                <p className={styles.actFooter}>
                  <Clock size={11} strokeWidth={2} /> {fmtWhen(s.scheduled_at)}
                </p>
              </div>
            ))}
            {!loading && allSessions.length === 0 && (
              <p style={{ fontSize: 12.5, color: '#9891a6', padding: '8px 2px' }}>
                No active or upcoming sessions.
              </p>
            )}
            <div className={styles.addRow} onClick={() => router.push('/instructor/sessions')} style={{ cursor: 'pointer' }}>
              <CalendarClock size={15} strokeWidth={2} /> Schedule new session
            </div>
          </div>

          {/* Pending Grading */}
          <div>
            <p className={styles.colTitle}>
              Pending Grading <span className={styles.countPill}>{stats.pending_grading_count}</span>
            </p>
            {pending.map((sub, i) => (
              <div
                key={`${sub.student_id}-${sub.experiment_id}`}
                className={styles.actCard}
                onClick={() => router.push('/instructor/grading')}
                style={{ cursor: 'pointer' }}
              >
                <div className={styles.actTop}>
                  <div className={styles.avatar} style={{ background: AVATAR_BGS[i % AVATAR_BGS.length], width: 36, height: 36, fontSize: 13 }}>
                    {sub.student_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className={styles.actName}>{sub.student_name} <span style={{ color: '#9891a6', fontSize: 12 }}>{sub.roll_number}</span></p>
                    <p className={styles.actMeta}>{sub.experiment_title}</p>
                  </div>
                  <div className={styles.actStatus}>
                    <span className={`${styles.statusPill} ${styles.statusPending}`}>
                      <AlertCircle size={10} strokeWidth={2} />
                      {sub.test_cases_total ? `${sub.test_cases_passed ?? 0}/${sub.test_cases_total} tests` : 'Review'}
                    </span>
                  </div>
                </div>
                <p className={styles.actFooter}>Submitted {timeAgo(sub.submitted_at)}</p>
              </div>
            ))}
            {!loading && pending.length === 0 && (
              <p style={{ fontSize: 12.5, color: '#9891a6', padding: '8px 2px' }}>
                Nothing waiting for grading. <CheckCircle2 size={12} style={{ verticalAlign: '-1px' }} />
              </p>
            )}
            <div className={styles.addRow} onClick={() => router.push('/instructor/grading')} style={{ cursor: 'pointer' }}>
              <ClipboardCheck size={15} strokeWidth={2} /> Open grading dashboard
            </div>
          </div>

          {/* Quick Actions */}
          <div>
            <p className={styles.colTitle}>Quick Actions</p>
            {[
              { label: 'Create Experiment',    sub: 'Aim, theory, code assets',     Icon: FlaskConical,   bg: 'linear-gradient(135deg,#7c3aed,#9333ea)', route: '/instructor/experiments/new' },
              { label: 'Content Library',      sub: 'Pre-lab modules per experiment', Icon: BookOpen,     bg: 'linear-gradient(135deg,#ec4899,#d6409f)', route: '/instructor/content'         },
              { label: 'Analytics & Insights', sub: 'Class performance, at-risk',   Icon: BarChart3,      bg: 'linear-gradient(135deg,#f59e0b,#f2994a)', route: '/instructor/analytics'       },
              { label: 'Student Management',   sub: 'Roster, attendance, catch-up', Icon: Users,          bg: 'linear-gradient(135deg,#d946ef,#9333ea)', route: '/instructor/students'        },
              { label: 'Viva Panel',           sub: 'Schedule & conduct vivas',     Icon: ClipboardCheck, bg: 'linear-gradient(135deg,#22c55e,#16a34a)', route: '/instructor/viva'            },
            ].map(q => (
              <div key={q.label} className={styles.quickCard} onClick={() => router.push(q.route)}>
                <div className={styles.quickCardIcon} style={{ background: q.bg }}>
                  <q.Icon size={15} strokeWidth={1.9} color="#fff" />
                </div>
                <div>
                  <p className={styles.quickCardLabel}>{q.label}</p>
                  <p className={styles.quickCardSub}>{q.sub}</p>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </InstructorShell>
  );
}
