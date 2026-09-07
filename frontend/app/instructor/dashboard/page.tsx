'use client';

import { useEffect, useMemo, useState } from 'react';
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
  // DB6 deltas
  new_experiments_this_month?: number;
  new_pending_since_yesterday?: number;
  active_session_started_min_ago?: number | null;
  sections_taught?: number;
}

interface ActivityEvent {
  type: 'final_submission' | 'plagiarism' | 'graded' | 'session_ended' | 'all_checkpoints_passed';
  title: string;
  detail: string;
  link: string;
  at: string | null;
}

interface SessionHealth {
  session_id: string;
  title: string | null;
  avg_focus: number | null;
  checkpoint_pass_pct: number | null;
  proctor_alerts: number;
  not_joined_count: number;
  enrolled_count: number;
}

const EVENT_ICONS: Record<ActivityEvent['type'], { Icon: typeof Radio; color: string; bg: string }> = {
  final_submission:      { Icon: ClipboardCheck, color: '#7c3aed', bg: 'rgba(124,58,237,.09)' },
  plagiarism:            { Icon: AlertCircle,    color: '#dc2626', bg: 'rgba(239,68,68,.09)'  },
  graded:                { Icon: CheckCircle2,   color: '#16a34a', bg: 'rgba(34,197,94,.09)'  },
  session_ended:         { Icon: Radio,          color: '#9891a6', bg: 'rgba(152,145,166,.1)' },
  all_checkpoints_passed:{ Icon: CheckCircle2,   color: '#059669', bg: 'rgba(16,185,129,.1)'  },
};

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
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [health, setHealth] = useState<SessionHealth[]>([]);

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
        setActivity(res.recent_activity ?? []);
        setHealth(res.session_health ?? []);
      } catch {
        // dashboard stays empty on error — toast handled elsewhere
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const allSessions: SessionItem[] = useMemo(() => [...activeSessions, ...upcomingSessions], [activeSessions, upcomingSessions]);
  const firstName = useMemo(() => user?.full_name?.split(' ')[0] || 'Instructor', [user?.full_name]);

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
          { label: 'My Students',       value: String(stats.student_count),          sub: `Across ${stats.sections_taught ?? 1} section(s)`, Icon: Users,          bg: 'linear-gradient(135deg,#7c3aed,#9333ea)', route: '/instructor/students'   },
          { label: 'Active Sessions',   value: String(stats.active_session_count),   sub: stats.active_session_started_min_ago != null
              ? `Running for ${stats.active_session_started_min_ago} min`
              : `${upcomingSessions.length} upcoming scheduled`, Icon: PlayCircle, bg: 'linear-gradient(135deg,#d946ef,#9333ea)', route: '/instructor/sessions'   },
          { label: 'Pending Grading',   value: String(stats.pending_grading_count),  sub: stats.new_pending_since_yesterday
              ? `+${stats.new_pending_since_yesterday} since yesterday`
              : 'Final submissions ungraded',  Icon: ClipboardCheck, bg: 'linear-gradient(135deg,#f59e0b,#f2994a)', route: '/instructor/grading'    },
          { label: 'My Experiments',    value: String(stats.experiment_count),       sub: stats.new_experiments_this_month
              ? `+${stats.new_experiments_this_month} this month`
              : 'Authored lab experiments',    Icon: BarChart3,      bg: 'linear-gradient(135deg,#22c55e,#16a34a)', route: '/instructor/experiments' },
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

      {/* ── Live Session Health (DB7) ─────────────────────────────────── */}
      {health.length > 0 && (
        <div style={{
          background: '#fff', borderRadius: 18, border: '1px solid #fff',
          boxShadow: '0 2px 12px rgba(16,185,129,.08)', padding: '16px 20px', marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Radio size={15} color="#059669" />
            <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: '#111827', flex: 1 }}>
              Live Session Health
            </h3>
            <span style={{ fontSize: 11.5, color: '#9ca3af', fontWeight: 600 }}>
              peek only — open the Conductor for full control
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
            {health.map(h => (
              <button key={h.session_id}
                onClick={() => router.push(`/instructor/sessions/${h.session_id}/live`)}
                style={{
                  textAlign: 'left', cursor: 'pointer', borderRadius: 12,
                  border: '1px solid rgba(16,185,129,.25)', background: 'rgba(16,185,129,.05)',
                  padding: '12px 14px',
                }}>
                <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#111827' }}>
                  {h.title || 'Live session'}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: 12, color: '#6b7280' }}>
                  <span>Focus avg: <strong style={{ color: (h.avg_focus ?? 100) < 40 ? '#dc2626' : '#059669' }}>{h.avg_focus ?? '—'}</strong></span>
                  <span>Checkpoints: <strong>{h.checkpoint_pass_pct != null ? `${h.checkpoint_pass_pct}%` : '—'}</strong></span>
                  <span>Proctor alerts: <strong style={{ color: h.proctor_alerts > 0 ? '#d97706' : '#059669' }}>{h.proctor_alerts}</strong></span>
                  <span>Not joined: <strong style={{ color: h.not_joined_count > 0 ? '#d97706' : '#059669' }}>{h.not_joined_count}/{h.enrolled_count}</strong></span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

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

          {/* Recent Activity (DB3) */}
          <div>
            <p className={styles.colTitle}>
              Recent Activity {activity.length > 0 && <span className={styles.countPill}>{activity.length}</span>}
            </p>
            {activity.length === 0 && !loading && (
              <p style={{ fontSize: 12.5, color: '#9891a6', padding: '8px 2px' }}>
                Nothing in the last 7 days.
              </p>
            )}
            {activity.slice(0, 8).map((ev, i) => {
              const meta = EVENT_ICONS[ev.type] ?? EVENT_ICONS.final_submission;
              return (
                <div key={i} className={styles.actCard}
                  onClick={() => router.push(ev.link)} style={{ cursor: 'pointer' }}>
                  <div className={styles.actTop}>
                    <div className={styles.actIcon} style={{ background: meta.bg, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <meta.Icon size={14} strokeWidth={2} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p className={styles.actName} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</p>
                      <p className={styles.actMeta}>{ev.detail}</p>
                    </div>
                  </div>
                  <p className={styles.actFooter}>{timeAgo(ev.at)}</p>
                </div>
              );
            })}
          </div>

          {/* Quick Actions */}
          <div>
            <p className={styles.colTitle}>Quick Actions</p>
            {[
              { label: 'Create Experiment',    sub: 'Aim, theory, code assets',     Icon: FlaskConical,   bg: 'linear-gradient(135deg,#7c3aed,#9333ea)', route: '/instructor/experiments/new' },
              { label: 'Pre-lab Content',      sub: 'Manage modules inside each experiment', Icon: BookOpen,     bg: 'linear-gradient(135deg,#ec4899,#d6409f)', route: '/instructor/experiments'     },
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
