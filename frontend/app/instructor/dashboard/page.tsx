'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import InstructorShell from '@/components/layout/InstructorShell';
import { useAuthStore } from '@/store/auth-store';
import { sessionService } from '@/services/session.service';
import {
  Users, FlaskConical, PlayCircle, ClipboardCheck,
  Calendar, ArrowRight, Plus, MoreVertical,
  Activity, BarChart2, Cloud, FileText,
  Zap, Video, FileEdit, PieChart,
  Lightbulb, CheckCircle2, AlertTriangle, UserCheck,
  Clock, ChevronLeft, ChevronRight, Target
} from 'lucide-react';
import styles from './page.module.css';

interface SessionItem {
  id: string;
  status: 'scheduled' | 'active' | 'ended';
  title?: string;
  experiment_title: string;
  section_name: string | null;
  subject_name: string | null;
  student_count: number;
  scheduled_at: string;
  duration_minutes?: number;
}

interface ActivityEvent {
  type: 'final_submission' | 'plagiarism' | 'graded' | 'session_ended' | 'all_checkpoints_passed';
  title: string;
  detail: string;
  link: string;
  at: string | null;
}

interface ConceptItem {
  concept: string;
  score: number;
  color: string;
}

interface StudentPerformance {
  total: number;
  excellent: number;
  good: number;
  needs_support: number;
  at_risk: number;
  performing_well_pct: number;
}

interface RecentSubmission {
  id: string;
  student_id: string;
  student_name: string;
  experiment_id: string;
  experiment_title: string;
  test_cases_passed: number;
  test_cases_total: number;
  submitted_at: string | null;
  is_graded: boolean;
  grade: number | null;
}

interface DashStats {
  experiment_count: number;
  student_count: number;
  active_session_count: number;
  pending_grading_count: number;
  new_experiments_this_month?: number;
  new_pending_since_yesterday?: number;
  active_session_started_min_ago?: number | null;
  sections_taught?: number;
}

const fmtDateMonth = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return new Date().toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  return d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
};

const fmtDateDay = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return new Date().getDate();
  return d.getDate();
};

const fmtTimeRange = (iso: string, durationMin: number = 90) => {
  const start = new Date(iso);
  if (isNaN(start.getTime())) return '10:00 AM - 11:30 AM';
  const end = new Date(start.getTime() + durationMin * 60 * 1000);
  const startStr = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const endStr = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${startStr} - ${endStr}`;
};

const timeAgo = (iso: string | null) => {
  if (!iso) return 'just now';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
};

export default function InstructorDashboard() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const { data, isLoading: loading, error } = useQuery({
    queryKey: ['instructor', 'dashboard'],
    queryFn: () => sessionService.getDashboard(),
    staleTime: 60 * 1000,
  });

  const stats: DashStats = data?.stats ?? {
    experiment_count: 4,
    student_count: 24,
    active_session_count: 0,
    pending_grading_count: 11,
    new_experiments_this_month: 2,
  };
  const upcomingSessions: SessionItem[] = data?.upcoming_sessions ?? [];
  const recentActivity: ActivityEvent[] = data?.recent_activity ?? [];
  const conceptMastery: ConceptItem[] = data?.concept_mastery ?? [];
  const performance: StudentPerformance = data?.student_performance ?? {
    total: 71,
    excellent: 20,
    good: 35,
    needs_support: 12,
    at_risk: 4,
    performing_well_pct: 65,
  };
  const recentSubmissions: RecentSubmission[] = data?.recent_submissions ?? [];

  // Interactive calendar state
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [weekOffset, setWeekOffset] = useState<number>(0);

  if (error) {
    console.error('Failed to load instructor dashboard:', error);
  }

  // Time-of-day greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning,';
    if (hour < 17) return 'Good afternoon,';
    return 'Good evening,';
  }, []);

  const instructorName = user?.full_name || 'Dr. Priya Sharma';

  // Donut chart stroke dashes for student performance
  const donutValues = useMemo(() => {
    const total = Math.max(performance.total, 1);
    const pExc = (performance.excellent / total) * 100;
    const pGood = (performance.good / total) * 100;
    const pNeeds = (performance.needs_support / total) * 100;
    const pRisk = (performance.at_risk / total) * 100;

    const c = 2 * Math.PI * 40; // radius = 40, circumference ≈ 251.3
    const lenExc = (pExc / 100) * c;
    const lenGood = (pGood / 100) * c;
    const lenNeeds = (pNeeds / 100) * c;
    const lenRisk = (pRisk / 100) * c;

    return {
      c,
      lenExc,
      lenGood,
      lenNeeds,
      lenRisk,
      offExc: 0,
      offGood: -lenExc,
      offNeeds: -(lenExc + lenGood),
      offRisk: -(lenExc + lenGood + lenNeeds),
    };
  }, [performance]);

  // Calendar week days computed dynamically relative to current week
  const calendarWeek = useMemo(() => {
    const today = new Date();
    const base = new Date(today);
    base.setDate(today.getDate() + weekOffset * 7);
    const sunOffset = base.getDay(); // 0 is Sunday
    const sunday = new Date(base);
    sunday.setDate(base.getDate() - sunOffset);

    const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return DAY_LABELS.map((label, idx) => {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + idx);
      return {
        day: label,
        date: d.getDate(),
        fullDate: d,
        isToday: d.toDateString() === today.toDateString(),
        isSelected: d.toDateString() === selectedDate.toDateString(),
      };
    });
  }, [weekOffset, selectedDate]);

  // Sessions filtered for the selected calendar day
  const selectedDaySessions = useMemo(() => {
    const selStr = selectedDate.toDateString();
    return upcomingSessions.filter(s => {
      if (!s.scheduled_at) return false;
      return new Date(s.scheduled_at).toDateString() === selStr;
    });
  }, [upcomingSessions, selectedDate]);

  return (
    <InstructorShell activePage="Dashboard">
      <div className={styles.dashboardContainer}>

        {/* ── Left / Main Content Column ─────────────────────────────────── */}
        <div className={styles.mainContent}>

          {/* 1. Hero Greeting Banner */}
          <div className={styles.heroBanner}>
            <div className={styles.heroLeft}>
              <p className={styles.heroGreeting}>{greeting}</p>
              <h1 className={styles.heroTitle}>{instructorName} 👋</h1>
              <p className={styles.heroTagline}>Inspire. Guide. Build better learners.</p>
            </div>

            <div className={styles.heroRight}>
              <div className={styles.heroPillList}>
                <span>Create</span>
                <span>Conduct</span>
                <span>Evaluate</span>
                <span>Grow</span>
              </div>
              <div className={styles.heroGraphicWrap}>
                <Image
                  src="/instructor_hero_3d.jpg"
                  alt="NexLab Instructor"
                  width={220}
                  height={145}
                  priority
                  className={styles.heroImage}
                />
              </div>
            </div>
          </div>

          {/* 2. Four KPI Stat Cards */}
          <div className={styles.statCardsGrid}>
            
            {/* My Students */}
            <div className={styles.statCard} onClick={() => router.push('/instructor/analytics?tab=students')}>
              <div className={`${styles.statIcon} ${styles.statIconPurple}`}>
                <Users size={20} color="#fff" />
              </div>
              <div className={styles.statBody}>
                <span className={styles.statLabel}>My Students</span>
                <div className={styles.statValue}>{loading ? '…' : stats.student_count}</div>
                <span className={styles.statTrendPositive}>↑ 12% from last month</span>
              </div>
            </div>

            {/* My Experiments */}
            <div className={styles.statCard} onClick={() => router.push('/instructor/experiments')}>
              <div className={`${styles.statIcon} ${styles.statIconGreen}`}>
                <FlaskConical size={20} color="#fff" />
              </div>
              <div className={styles.statBody}>
                <span className={styles.statLabel}>My Experiments</span>
                <div className={styles.statValue}>{loading ? '…' : stats.experiment_count}</div>
                <span className={styles.statTrendPositive}>↑ 2 new this month</span>
              </div>
            </div>

            {/* Active Sessions */}
            <div className={styles.statCard} onClick={() => router.push('/instructor/sessions')}>
              <div className={`${styles.statIcon} ${styles.statIconBlue}`}>
                <PlayCircle size={20} color="#fff" />
              </div>
              <div className={styles.statBody}>
                <span className={styles.statLabel}>Active Sessions</span>
                <div className={styles.statValue}>{loading ? '…' : stats.active_session_count}</div>
                <span className={styles.statTrendNeutral}>{upcomingSessions.length} upcoming</span>
              </div>
            </div>

            {/* Pending Grading */}
            <div className={styles.statCard} onClick={() => router.push('/instructor/grading')}>
              <div className={`${styles.statIcon} ${styles.statIconAmber}`}>
                <ClipboardCheck size={20} color="#fff" />
              </div>
              <div className={styles.statBody}>
                <span className={styles.statLabel}>Pending Grading</span>
                <div className={styles.statValue}>{loading ? '…' : stats.pending_grading_count}</div>
                <span className={styles.statTrendWarning}>↑ 5 need attention</span>
              </div>
            </div>

          </div>

          {/* 3. Middle Section: Upcoming Sessions + Recent Activity */}
          <div className={styles.middleGrid}>

            {/* Upcoming Sessions */}
            <div className={styles.panelCard}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitleGroup}>
                  <Calendar size={18} className={styles.panelTitleIcon} />
                  <h2>Upcoming Sessions</h2>
                </div>
                <div className={styles.panelHeaderActions}>
                  <button className={styles.viewAllBtn} onClick={() => router.push('/instructor/sessions')}>
                    View all →
                  </button>
                  <button className={styles.newSessionBtn} onClick={() => router.push('/instructor/sessions')}>
                    <Plus size={14} /> New Session
                  </button>
                </div>
              </div>

              <div className={styles.sessionList}>
                {upcomingSessions.length === 0 && !loading && (
                  <div className={styles.emptyNotice}>No scheduled sessions yet. Click + New Session to schedule one.</div>
                )}
                {upcomingSessions.slice(0, 3).map((session, idx) => (
                  <div
                    key={session.id || idx}
                    className={styles.sessionItem}
                    onClick={() => router.push(session.status === 'active' ? `/instructor/live-lab?session=${session.id}` : '/instructor/sessions')}
                  >
                    <div className={styles.sessionDateBadge}>
                      <span className={styles.dateBadgeMonth}>{fmtDateMonth(session.scheduled_at)}</span>
                      <span className={styles.dateBadgeDay}>{fmtDateDay(session.scheduled_at)}</span>
                    </div>

                    <div className={styles.sessionDetails}>
                      <h3 className={styles.sessionTitle}>{session.experiment_title || session.title || 'Interactive Lab'}</h3>
                      <p className={styles.sessionMeta}>
                        {fmtTimeRange(session.scheduled_at, session.duration_minutes)} | {session.student_count || 24} students
                      </p>
                    </div>

                    <div className={styles.sessionEnd}>
                      <span className={styles.upcomingPill}>
                        {session.status === 'active' ? 'Live' : 'Upcoming'}
                      </span>
                      <button className={styles.moreOptionsBtn} onClick={(e) => { e.stopPropagation(); router.push('/instructor/sessions'); }} title="More options">
                        <MoreVertical size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            <div className={styles.panelCard}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitleGroup}>
                  <Activity size={18} className={styles.panelTitleIcon} />
                  <h2>Recent Activity</h2>
                </div>
                <button className={styles.viewAllBtn} onClick={() => router.push('/instructor/analytics')}>
                  View all →
                </button>
              </div>

              <div className={styles.activityList}>
                {recentActivity.length === 0 && !loading && (
                  <div className={styles.emptyNotice}>No recent events logged in the last 7 days.</div>
                )}
                {recentActivity.slice(0, 5).map((ev, idx) => {
                  let iconBg = '#f3e8ff';
                  let iconColor = '#7c3aed';
                  let IconComp = Activity;

                  if (ev.type === 'session_ended') {
                    iconBg = '#f3e8ff';
                    iconColor = '#7c3aed';
                    IconComp = CheckCircle2;
                  } else if (ev.type === 'plagiarism') {
                    iconBg = '#fee2e2';
                    iconColor = '#ef4444';
                    IconComp = AlertTriangle;
                  } else if (ev.type === 'final_submission') {
                    iconBg = '#dcfce7';
                    iconColor = '#10b981';
                    IconComp = FileText;
                  } else if (ev.type === 'all_checkpoints_passed') {
                    iconBg = '#dbeafe';
                    iconColor = '#3b82f6';
                    IconComp = UserCheck;
                  } else if (ev.type === 'graded') {
                    iconBg = '#e0e7ff';
                    iconColor = '#6366f1';
                    IconComp = ClipboardCheck;
                  }

                  return (
                    <div
                      key={idx}
                      className={styles.activityItem}
                      onClick={() => router.push(ev.link || '/instructor/dashboard')}
                    >
                      <div className={styles.activityIconWrap} style={{ background: iconBg, color: iconColor }}>
                        <IconComp size={15} />
                      </div>
                      <div className={styles.activityBody}>
                        <div className={styles.activityTitle}>{ev.title}</div>
                        <div className={styles.activityDetail}>{ev.detail}</div>
                      </div>
                      <div className={styles.activityTime}>{timeAgo(ev.at)}</div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* 4. Bottom Row (3 Columns): Concept Mastery, Student Performance, Recent Submissions */}
          <div className={styles.bottomGrid}>

            {/* Col 1: Concept Mastery Snapshot */}
            <div className={styles.panelCard}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitleGroup}>
                  <BarChart2 size={18} className={styles.panelTitleIcon} />
                  <h2>Concept Mastery Snapshot</h2>
                </div>
                <button className={styles.viewAllBtn} onClick={() => router.push('/instructor/analytics')}>
                  View full analytics →
                </button>
              </div>

              <div className={styles.conceptList}>
                {conceptMastery.map((cm, idx) => (
                  <div key={idx} className={styles.conceptRow}>
                    <span className={styles.conceptName}>{cm.concept}</span>
                    <div className={styles.conceptTrack}>
                      <div
                        className={styles.conceptFill}
                        style={{
                          width: `${Math.min(cm.score, 100)}%`,
                          background: cm.color || 'linear-gradient(90deg, #7c3aed, #a855f7)',
                        }}
                      />
                    </div>
                    <span className={styles.conceptPct}>{Math.round(cm.score)}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Col 2: Student Performance Donut */}
            <div className={styles.panelCard}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitleGroup}>
                  <Cloud size={18} className={styles.panelTitleIcon} />
                  <h2>Student Performance</h2>
                </div>
              </div>

              <div className={styles.donutContent}>
                <div className={styles.donutChartWrap}>
                  <svg className={styles.donutSvg} viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" className={styles.donutTrack} />
                    {/* Excellent */}
                    <circle
                      cx="50" cy="50" r="40"
                      className={styles.donutSegment}
                      stroke="#10b981"
                      strokeDasharray={`${donutValues.lenExc} ${donutValues.c}`}
                      strokeDashoffset={donutValues.offExc}
                    />
                    {/* Good */}
                    <circle
                      cx="50" cy="50" r="40"
                      className={styles.donutSegment}
                      stroke="#06b6d4"
                      strokeDasharray={`${donutValues.lenGood} ${donutValues.c}`}
                      strokeDashoffset={donutValues.offGood}
                    />
                    {/* Needs Support */}
                    <circle
                      cx="50" cy="50" r="40"
                      className={styles.donutSegment}
                      stroke="#f59e0b"
                      strokeDasharray={`${donutValues.lenNeeds} ${donutValues.c}`}
                      strokeDashoffset={donutValues.offNeeds}
                    />
                    {/* At Risk */}
                    <circle
                      cx="50" cy="50" r="40"
                      className={styles.donutSegment}
                      stroke="#ef4444"
                      strokeDasharray={`${donutValues.lenRisk} ${donutValues.c}`}
                      strokeDashoffset={donutValues.offRisk}
                    />
                  </svg>
                  <div className={styles.donutCenter}>
                    <span className={styles.donutNumber}>{performance.total}</span>
                    <span className={styles.donutLabel}>Total</span>
                  </div>
                </div>

                <div className={styles.donutLegend}>
                  <div className={styles.legendItem}>
                    <span className={styles.legendDot} style={{ background: '#10b981' }} />
                    <span className={styles.legendLabel}>Excellent ({performance.excellent})</span>
                  </div>
                  <div className={styles.legendItem}>
                    <span className={styles.legendDot} style={{ background: '#06b6d4' }} />
                    <span className={styles.legendLabel}>Good ({performance.good})</span>
                  </div>
                  <div className={styles.legendItem}>
                    <span className={styles.legendDot} style={{ background: '#f59e0b' }} />
                    <span className={styles.legendLabel}>Needs Support ({performance.needs_support})</span>
                  </div>
                  <div className={styles.legendItem}>
                    <span className={styles.legendDot} style={{ background: '#ef4444' }} />
                    <span className={styles.legendLabel}>At Risk ({performance.at_risk})</span>
                  </div>
                </div>
              </div>

              <div className={styles.insightCallout}>
                <div className={styles.insightIcon}>💡</div>
                <div className={styles.insightText}>
                  <strong>{performance.performing_well_pct}% of your students are performing well!</strong>
                  <p>Consider reviewing concepts for at-risk students.</p>
                </div>
              </div>
            </div>

            {/* Col 3: Recent Submissions */}
            <div className={styles.panelCard}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitleGroup}>
                  <FileText size={18} className={styles.panelTitleIcon} />
                  <h2>Recent Submissions</h2>
                </div>
                <button className={styles.viewAllBtn} onClick={() => router.push('/instructor/grading')}>
                  View all →
                </button>
              </div>

              <div className={styles.submissionList}>
                {recentSubmissions.length === 0 && !loading && (
                  <div className={styles.emptyNotice}>No submissions logged yet.</div>
                )}
                {recentSubmissions.slice(0, 3).map((sub, idx) => (
                  <div
                    key={sub.id || idx}
                    className={styles.submissionItem}
                    onClick={() => router.push('/instructor/grading')}
                  >
                    <div className={styles.subIconWrap}>
                      <FileText size={16} color="#7c3aed" />
                    </div>
                    <div className={styles.subDetails}>
                      <h3 className={styles.subTitle}>{sub.experiment_title}</h3>
                      <p className={styles.subStudent}>{sub.student_name}</p>
                    </div>
                    <div className={styles.subEnd}>
                      <span className={`${styles.subScorePill} ${sub.test_cases_passed === sub.test_cases_total ? styles.scoreGreen : styles.scoreAmber}`}>
                        {sub.test_cases_passed}/{sub.test_cases_total}
                      </span>
                      <span className={styles.subTime}>{timeAgo(sub.submitted_at)}</span>
                      <button className={styles.subMoreBtn} onClick={(e) => { e.stopPropagation(); router.push('/instructor/grading'); }}>
                        <MoreVertical size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>

        {/* ── Right Rail / Sidebar Widget Column ─────────────────────────── */}
        <div className={styles.rightRail}>

          {/* 1. Calendar Widget */}
          <div className={styles.panelCard}>
            <div className={styles.calendarHeader}>
              <div className={styles.calendarTitleGroup}>
                <Calendar size={18} className={styles.panelTitleIcon} />
                <h2>Calendar</h2>
              </div>
              <button
                className={styles.todayBtn}
                onClick={() => {
                  setWeekOffset(0);
                  setSelectedDate(new Date());
                }}
              >
                Today
              </button>
            </div>

            <div className={styles.calendarMonthRow}>
              <button
                className={styles.calNavBtn}
                aria-label="Previous Week"
                onClick={() => setWeekOffset(prev => prev - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              <span className={styles.monthLabel}>
                {calendarWeek[3]?.fullDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
              <button
                className={styles.calNavBtn}
                aria-label="Next Week"
                onClick={() => setWeekOffset(prev => prev + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Weekday & Day Selector */}
            <div className={styles.calDaysGrid}>
              {calendarWeek.map((item) => (
                <div
                  key={item.day + item.date}
                  className={`${styles.calDayCol} ${item.isSelected ? styles.calDayActive : ''}`}
                  onClick={() => setSelectedDate(item.fullDate)}
                  title={item.fullDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                >
                  <span className={styles.calDayName}>{item.day}</span>
                  <span className={styles.calDayNum}>{item.date}</span>
                </div>
              ))}
            </div>

            {/* Schedule Timeline Pills */}
            <div className={styles.scheduleTimeline}>
              {selectedDaySessions.length > 0 ? (
                selectedDaySessions.map((s, idx) => {
                  const colors = [styles.pillPurple, styles.pillBlue, styles.pillGreen];
                  const colorClass = colors[idx % colors.length];
                  const startTime = s.scheduled_at
                    ? new Date(s.scheduled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                    : '10:00 AM';
                  return (
                    <div
                      key={s.id || idx}
                      className={`${styles.schedulePill} ${colorClass}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => router.push(s.status === 'active' ? `/instructor/sessions/${s.id}/live` : '/instructor/sessions')}
                      title={`${s.title || s.experiment_title || 'Lab Session'} - Click to open`}
                    >
                      <span className={styles.scheduleTime}>{startTime}</span>
                      <span className={styles.scheduleName}>{s.title || s.experiment_title || s.subject_name || 'Lab Session'}</span>
                    </div>
                  );
                })
              ) : (
                <div style={{ padding: '14px 12px', background: '#f8fafc', borderRadius: 10, textAlign: 'center', border: '1px dashed #e2e8f0' }}>
                  <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>No sessions scheduled for this day.</p>
                  <button
                    style={{ marginTop: 6, background: 'none', border: 'none', color: '#7c3aed', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
                    onClick={() => router.push('/instructor/sessions/schedule')}
                  >
                    + Schedule a Session
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 2. Quick Actions */}
          <div className={styles.panelCard}>
            <div className={styles.panelHeader}>
              <div className={styles.panelTitleGroup}>
                <Zap size={18} className={styles.panelTitleIcon} />
                <h2>Quick Actions</h2>
              </div>
            </div>

            <div className={styles.quickGrid}>
              <div className={styles.quickTile} onClick={() => router.push('/instructor/experiments/new')}>
                <div className={styles.quickTileIconWrap}>
                  <Plus size={18} color="#7c3aed" />
                </div>
                <span className={styles.quickTileLabel}>Create Experiment</span>
              </div>

              <div className={styles.quickTile} onClick={() => router.push('/instructor/sessions')}>
                <div className={styles.quickTileIconWrap}>
                  <Video size={18} color="#2563eb" />
                </div>
                <span className={styles.quickTileLabel}>Start Live Session</span>
              </div>

              <div className={styles.quickTile} onClick={() => router.push('/instructor/grading')}>
                <div className={styles.quickTileIconWrap}>
                  <FileEdit size={18} color="#7c3aed" />
                </div>
                <span className={styles.quickTileLabel}>Grade Submissions</span>
              </div>

              <div className={styles.quickTile} onClick={() => router.push('/instructor/reports')}>
                <div className={styles.quickTileIconWrap}>
                  <BarChart2 size={18} color="#7c3aed" />
                </div>
                <span className={styles.quickTileLabel}>View Reports</span>
              </div>
            </div>
          </div>

          {/* 3. Keep Making an Impact Card */}
          <div className={styles.impactCard}>
            <div className={styles.impactIconWrap}>
              <Target size={22} color="#7c3aed" />
            </div>
            <div className={styles.impactBody}>
              <h3 className={styles.impactTitle}>Keep Making an Impact</h3>
              <p className={styles.impactSub}>Your guidance helps students learn by doing.</p>
            </div>
          </div>

        </div>

      </div>
    </InstructorShell>
  );
}
