'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import StudentShell from '@/components/layout/StudentShell';
import { studentService } from '@/services/student.service';
import type { StudentExam } from '@/services/student.service';
import { useAuthStore } from '@/store/auth-store';
import type { StudentDashboard as DashboardData, LabSession, Experiment } from '@/types';
import { getGlobalSocket } from '@/lib/socket';
import {
  FlaskConical, Terminal, Upload, Trophy, BookOpen, Bell, Target,
  ChevronRight, TrendingUp, Code2, Cpu, Crosshair, Beaker,
  Calendar as CalendarIcon, Sparkles, Loader2, ArrowRight,
  Play, FolderGit2, Zap, BarChart3, Megaphone,
  FileCheck, Clock, Award
} from 'lucide-react';
import styles from './page.module.css';

interface SessionWithMeta extends LabSession {
  title?: string;
  my_attendance?: { status: string; joined_at?: string | null };
  duration_minutes?: number | null;
}

const EXP_ICONS = [Beaker, Code2, Cpu, Crosshair, FlaskConical];
const EXP_ICON_COLORS = [
  { bg: '#f3e8ff', color: '#7c3aed' },
  { bg: '#ffedd5', color: '#ea580c' },
  { bg: '#dcfce7', color: '#16a34a' },
  { bg: '#e0f2fe', color: '#0284c7' },
  { bg: '#fce7f3', color: '#db2777' },
];

export default function StudentDashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [sessions, setSessions] = useState<SessionWithMeta[]>([]);
  const [expTitles, setExpTitles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [urgentAnnouncement, setUrgentAnnouncement] = useState<any>(null);
  const [exams, setExams] = useState<StudentExam[]>([]);

  // Active tabs
  const [sessionTab, setSessionTab] = useState<'upcoming' | 'active' | 'completed'>('upcoming');
  const [conceptTab, setConceptTab] = useState<'strongest' | 'attention'>('strongest');

  // Calendar strip state: selected day index (0 = Sun .. 6 = Sat)
  const [selectedDayOffset, setSelectedDayOffset] = useState<number>(() => new Date().getDay());

  // Generate current week days
  const weekDays = useMemo(() => {
    const today = new Date();
    const currentDayOfWeek = today.getDay(); // 0 = Sun
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - currentDayOfWeek);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      days.push({
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNumber: d.getDate(),
        dateObj: d,
        isToday: d.toDateString() === today.toDateString(),
        dayIndex: i,
      });
    }
    return days;
  }, []);

  // Time-of-day greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning,';
    if (hour < 17) return 'Good afternoon,';
    return 'Good evening,';
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [d, sess, subjects] = await Promise.all([
        studentService.getDashboard(),
        studentService.getSessions(),
        studentService.getSubjects(),
      ]);
      setDash(d);
      setSessions(sess as SessionWithMeta[]);

      // Build experiment title lookup
      const expLists = await Promise.all(
        subjects.map(s => studentService.getExperiments(s.subject_id).catch(() => [] as Experiment[]))
      );
      const titles: Record<string, string> = {};
      expLists.flat().forEach(e => { titles[e.id] = e.title; });
      setExpTitles(titles);
      // Fetch announcements for top urgent notice
      studentService.getAnnouncements().then(res => {
        const urgent = res.announcements.find((a: any) => (a.priority === 'urgent' || a.priority === 'important') && !a.is_read);
        if (urgent) setUrgentAnnouncement(urgent);
      }).catch(() => {});
      // Fetch student exams (runs in parallel, non-blocking)
      studentService.getExams().then(setExams).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 25_000);
    return () => clearInterval(t);
  }, [fetchData]);

  // Real-time socket listener
  useEffect(() => {
    const socket = getGlobalSocket();
    if (!socket) return;

    const onSessionChange = () => {
      fetchData();
    };

    socket.on('session_started', onSessionChange);
    socket.on('session_ended', onSessionChange);
    socket.on('new_notification', onSessionChange);
    socket.on('grade_published', onSessionChange);

    return () => {
      socket.off('session_started', onSessionChange);
      socket.off('session_ended', onSessionChange);
      socket.off('new_notification', onSessionChange);
      socket.off('grade_published', onSessionChange);
    };
  }, [fetchData]);

  // Categorize sessions
  const upcomingSessions = useMemo(() => sessions.filter(s => s.status === 'scheduled'), [sessions]);
  const activeSessions   = useMemo(() => sessions.filter(s => s.status === 'active'), [sessions]);
  const endedSessions    = useMemo(() => sessions.filter(s => s.status === 'ended'), [sessions]);

  // Categorize exams — open or upcoming exams show as action items
  const activeExams = useMemo(() => exams.filter(e =>
    e.window_state === 'open' || e.window_state === 'upcoming'
  ), [exams]);
  const completedExams = useMemo(() => exams.filter(e =>
    e.window_state === 'closed' || (e.attempts_used > 0 && e.attempts_remaining === 0)
  ), [exams]);

  // Filter sessions by selected calendar day
  const selectedDateObj = weekDays[selectedDayOffset]?.dateObj;
  const sessionsOnSelectedDay = useMemo(() => {
    if (!selectedDateObj) return [];
    const targetDateStr = selectedDateObj.toDateString();
    return sessions.filter(s => {
      if (!s.scheduled_at) return false;
      const sDate = new Date(s.scheduled_at);
      return sDate.toDateString() === targetDateStr;
    });
  }, [sessions, selectedDateObj]);

  if (loading) {
    return (
      <StudentShell activePage="Dashboard">
        <div className={styles.loadingContainer}>
          <Loader2 size={26} className={styles.spinner} />
          <span>Loading your personalized dashboard…</span>
        </div>
      </StudentShell>
    );
  }

  if (error || !dash) {
    return (
      <StudentShell activePage="Dashboard">
        <div className={styles.errorBox}>
          <p>⚠️ {error || 'Unable to load dashboard. Please refresh or try again.'}</p>
          <button className={styles.retryBtn} onClick={fetchData}>Retry</button>
        </div>
      </StudentShell>
    );
  }

  const overallProgress = dash.overall_progress ?? (dash.avg_grade != null ? Math.round(dash.avg_grade) : 0);
  const studentDisplayName = user?.full_name ?? 'Test Student';

  // SVG Circular progress math (radius = 38)
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (overallProgress / 100) * circumference;

  // Active tab sessions list
  const currentTabSessions = sessionTab === 'upcoming'
    ? upcomingSessions
    : sessionTab === 'active'
      ? activeSessions
      : endedSessions;

  return (
    <StudentShell activePage="Dashboard">
      <div className={styles.dashContainer}>

        {/* ══ URGENT ANNOUNCEMENT ALERT BANNER ══ */}
        {urgentAnnouncement && (
          <div style={{
            background: urgentAnnouncement.priority === 'urgent' ? '#fee2e2' : '#fef3c7',
            border: urgentAnnouncement.priority === 'urgent' ? '1px solid #fca5a5' : '1px solid #fde68a',
            borderRadius: 14, padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Megaphone size={20} color={urgentAnnouncement.priority === 'urgent' ? '#dc2626' : '#d97706'} />
              <div>
                <strong style={{ fontSize: 13.5, color: '#111827' }}>{urgentAnnouncement.title}: </strong>
                <span style={{ fontSize: 13, color: '#4b5563' }}>
                  {urgentAnnouncement.message.length > 130 ? urgentAnnouncement.message.slice(0, 130) + '…' : urgentAnnouncement.message}
                </span>
              </div>
            </div>
            <button
              onClick={() => router.push('/student/announcements')}
              style={{
                background: '#ffffff', border: '1px solid #d1d5db', borderRadius: 8,
                padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                color: '#111827'
              }}
            >
              View Notice →
            </button>
          </div>
        )}

        {/* ══ ROW 1: HERO & OVERALL PROGRESS ══ */}
        <section className={styles.heroGrid}>

          {/* Left: Welcome Banner */}
          <div className={styles.welcomeCard}>
            <div className={styles.welcomeContent}>
              <p className={styles.greetingText}>{greeting}</p>
              <h1 className={styles.studentName}>
                {studentDisplayName} <span className={styles.waveEmoji}>👋</span>
              </h1>
              <p className={styles.motivationText}>
                Keep learning, keep building. You&apos;re <strong className={styles.highlightProgress}>{overallProgress}%</strong> towards your goals!
              </p>

              {/* Action Buttons Row */}
              <div className={styles.heroActionBtns}>
                <button
                  className={`${styles.heroBtn} ${styles.btnPrimary}`}
                  onClick={() => router.push('/student/pre-lab')}
                >
                  <FlaskConical size={15} strokeWidth={2.2} />
                  <span>Start Pre-Lab</span>
                </button>
                <button
                  className={`${styles.heroBtn} ${styles.btnOutline}`}
                  onClick={() => router.push(activeSessions.length > 0 ? `/student/live-lab/${activeSessions[0].id}` : '/student/live-lab')}
                >
                  <Play size={14} fill="currentColor" />
                  <span>Join Live Lab</span>
                  {activeSessions.length > 0 && <span className={styles.livePulseDot} />}
                </button>
                <button
                  className={`${styles.heroBtn} ${styles.btnGhost}`}
                  onClick={() => router.push('/student/submissions')}
                >
                  <Upload size={14} strokeWidth={2} />
                  <span>View Submissions</span>
                </button>
                <button
                  className={`${styles.heroBtn} ${styles.btnGhost}`}
                  onClick={() => router.push('/student/rankings')}
                >
                  <Trophy size={14} strokeWidth={2} />
                  <span>Rankings</span>
                </button>
              </div>
            </div>

            {/* 3D Student Character Graphic */}
            <div className={styles.heroGraphicWrap}>
              <div className={styles.badgeCloud}>
                <span>Code</span>
                <span>Practice</span>
                <span>Learn</span>
                <span>Grow</span>
              </div>
              <Image
                src="/student_hero_3d.jpg"
                alt="Student 3D Character"
                width={280}
                height={210}
                className={styles.heroImg}
                priority
              />
            </div>
          </div>

          {/* Right: Overall Progress Card */}
          <div className={styles.progressCard}>
            <div className={styles.progressTop}>
              <div className={styles.ringWrap}>
                <svg className={styles.progressSvg} width="96" height="96" viewBox="0 0 96 96">
                  <defs>
                    <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#7c3aed" />
                      <stop offset="100%" stopColor="#9333ea" />
                    </linearGradient>
                  </defs>
                  <circle
                    className={styles.ringTrack}
                    cx="48"
                    cy="48"
                    r={radius}
                    strokeWidth="7.5"
                    fill="none"
                  />
                  <circle
                    className={styles.ringIndicator}
                    cx="48"
                    cy="48"
                    r={radius}
                    strokeWidth="7.5"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    stroke="url(#progressGrad)"
                    fill="none"
                  />
                </svg>
                <div className={styles.ringValText}>
                  <span className={styles.ringNumber}>{overallProgress}%</span>
                </div>
              </div>

              <div className={styles.progressLabels}>
                <h3 className={styles.progressTitle}>Overall Progress</h3>
                <p className={styles.progressSubtitle}>
                  {overallProgress >= 70 ? "You're doing great!" : overallProgress >= 40 ? "Keep up the momentum!" : "Let's build daily momentum!"}
                </p>
              </div>
            </div>

            {/* Motivation Quote Card */}
            <div className={styles.quotePill}>
              <div className={styles.quoteIcon}>
                <TrendingUp size={14} strokeWidth={2.4} />
              </div>
              <p className={styles.quoteText}>
                &ldquo;Small steps everyday lead to big results.&rdquo;
              </p>
            </div>
          </div>
        </section>

        {/* ══ ROW 2: 4 METRIC CARDS ══ */}
        <section className={styles.metricGrid}>
          {/* Card 1: Subjects Enrolled */}
          <div
            className={styles.metricCard}
            onClick={() => router.push('/student/subjects')}
            role="button"
            tabIndex={0}
          >
            <div className={styles.metricHeader}>
              <div className={`${styles.metricIconBox} ${styles.iconPurple}`}>
                <BookOpen size={18} strokeWidth={2.2} />
              </div>
              <ChevronRight size={16} className={styles.metricChevron} />
            </div>
            <div className={styles.metricBody}>
              <span className={styles.metricLabel}>Subjects Enrolled</span>
              <div className={styles.metricValue}>{dash.subjects_enrolled}</div>
              <span className={styles.metricSub}>{dash.total_submissions} submissions total</span>
            </div>
          </div>

          {/* Card 2: Best Rank Score */}
          <div
            className={styles.metricCard}
            onClick={() => router.push('/student/rankings')}
            role="button"
            tabIndex={0}
          >
            <div className={styles.metricHeader}>
              <div className={`${styles.metricIconBox} ${styles.iconAmber}`}>
                <Trophy size={18} strokeWidth={2.2} />
              </div>
              <ChevronRight size={16} className={styles.metricChevron} />
            </div>
            <div className={styles.metricBody}>
              <span className={styles.metricLabel}>Best Rank Score</span>
              <div className={styles.metricValue}>
                {dash.best_rank ? dash.best_rank.rank_score.toFixed(1) : (dash.avg_grade != null ? dash.avg_grade.toFixed(1) : '70.0')}
              </div>
              <span className={styles.metricSub}>
                <Sparkles size={12} className={styles.sparkleIcon} /> {dash.hints_used_today} AI hints used today
              </span>
            </div>
          </div>

          {/* Card 3: Unread Notifications */}
          <div
            className={styles.metricCard}
            onClick={() => router.push('/student/certificates')}
            role="button"
            tabIndex={0}
          >
            <div className={styles.metricHeader}>
              <div className={`${styles.metricIconBox} ${styles.iconRose}`}>
                <Bell size={18} strokeWidth={2.2} />
              </div>
              <ChevronRight size={16} className={styles.metricChevron} />
            </div>
            <div className={styles.metricBody}>
              <span className={styles.metricLabel}>Unread Notifications</span>
              <div className={styles.metricValue}>{dash.unread_notifications}</div>
              <span className={styles.metricSub}>Tap to view notifications</span>
            </div>
          </div>

          {/* Card 4: Daily Streak */}
          <div
            className={styles.metricCard}
            onClick={() => router.push('/student/practice/quest')}
            role="button"
            tabIndex={0}
          >
            <div className={styles.metricHeader}>
              <div className={`${styles.metricIconBox} ${styles.iconEmerald}`}>
                <Target size={18} strokeWidth={2.2} />
              </div>
              <ChevronRight size={16} className={styles.metricChevron} />
            </div>
            <div className={styles.metricBody}>
              <span className={styles.metricLabel}>Daily Streak</span>
              <div className={styles.metricValue}>{dash.daily_streak ?? 0} Days</div>
              <span className={styles.metricSub}>Keep it going! 🔥</span>
            </div>
          </div>
        </section>

        {/* ══ ROW 3: MIDDLE 3-COLUMN SECTION ══ */}
        <section className={styles.middleGrid}>

          {/* Col 1: My Sessions */}
          <div className={styles.panelCard}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>My Sessions</h2>
              <button
                className={styles.viewLink}
                onClick={() => router.push('/student/live-lab')}
              >
                <span>View all</span>
                <ArrowRight size={13} />
              </button>
            </div>

            {/* Session Status Tabs */}
            <div className={styles.tabPillRow}>
              <button
                className={`${styles.tabPill} ${sessionTab === 'upcoming' ? styles.tabPillActive : ''}`}
                onClick={() => setSessionTab('upcoming')}
              >
                <span className={styles.tabRadioDot} />
                <span>Upcoming</span>
                <span className={styles.tabCountBadge}>{upcomingSessions.length}</span>
              </button>

              <button
                className={`${styles.tabPill} ${sessionTab === 'active' ? styles.tabPillActive : ''}`}
                onClick={() => setSessionTab('active')}
              >
                <span className={styles.tabRadioDot} />
                <span>Active</span>
                <span className={styles.tabCountBadge}>{activeSessions.length}</span>
              </button>

              <button
                className={`${styles.tabPill} ${sessionTab === 'completed' ? styles.tabPillActive : ''}`}
                onClick={() => setSessionTab('completed')}
              >
                <span className={styles.tabRadioDot} />
                <span>Completed</span>
                <span className={styles.tabCountBadge}>{endedSessions.length}</span>
              </button>
            </div>

            {/* Sessions List */}
            <div className={styles.sessionList}>
              {currentTabSessions.slice(0, 4).map((s, idx) => {
                const IconComponent = EXP_ICONS[idx % EXP_ICONS.length];
                const iconColor = EXP_ICON_COLORS[idx % EXP_ICON_COLORS.length];
                const title = expTitles[s.experiment_id] || s.title || 'Interactive Lab Session';
                const dateFormatted = s.scheduled_at
                  ? new Date(s.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : 'Scheduled';
                const duration = s.duration_minutes ? `${s.duration_minutes} min` : '90 min';

                const targetRoute = s.status === 'active'
                  ? `/student/live-lab/${s.id}`
                  : s.status === 'scheduled'
                    ? `/student/pre-lab`
                    : `/student/submissions`;

                return (
                  <div
                    key={s.id}
                    className={styles.sessionItem}
                    onClick={() => router.push(targetRoute)}
                    role="button"
                    tabIndex={0}
                  >
                    <div
                      className={styles.sessionIconWrap}
                      style={{ background: iconColor.bg, color: iconColor.color }}
                    >
                      <IconComponent size={16} strokeWidth={2.2} />
                    </div>

                    <div className={styles.sessionMeta}>
                      <h4 className={styles.sessionTitle} title={title}>{title}</h4>
                      <p className={styles.sessionTime}>
                        {dateFormatted} • {duration} • {s.status === 'active' ? 'Live Now' : s.status === 'scheduled' ? 'Scheduled' : 'Ended'}
                      </p>
                    </div>

                    <div className={styles.sessionBadgeWrap}>
                      <span className={`${styles.statusBadge} ${s.status === 'active' ? styles.badgeActive : s.status === 'scheduled' ? styles.badgeUpcoming : styles.badgeEnded}`}>
                        {s.status === 'active' ? 'Live' : s.status === 'scheduled' ? 'Upcoming' : 'Ended'}
                      </span>
                      <ChevronRight size={14} className={styles.sessionChevron} />
                    </div>
                  </div>
                );
              })}

              {currentTabSessions.length === 0 && (
                <div className={styles.emptySessionBox}>
                  <CalendarIcon size={24} className={styles.emptyIcon} />
                  <p className={styles.emptyTitle}>No {sessionTab} sessions</p>
                  <p className={styles.emptySub}>
                    {sessionTab === 'upcoming'
                      ? 'You have no scheduled sessions coming up right now.'
                      : sessionTab === 'active'
                        ? 'There are no live sessions running at this moment.'
                        : 'No completed sessions recorded yet.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Col 2: Concept Snapshot */}
          <div className={styles.panelCard}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Concept Snapshot</h2>
              <button
                className={styles.viewLink}
                onClick={() => router.push('/student/analytics')}
              >
                <span>View Analytics</span>
                <ArrowRight size={13} />
              </button>
            </div>

            {/* Concept Category Tabs */}
            <div className={styles.tabLineRow}>
              <button
                className={`${styles.tabLineBtn} ${conceptTab === 'strongest' ? styles.tabLineBtnActive : ''}`}
                onClick={() => setConceptTab('strongest')}
              >
                <span>Strongest Concepts</span>
                <span className={styles.tabLineCount}>{dash.top_concepts.length}</span>
              </button>

              <button
                className={`${styles.tabLineBtn} ${conceptTab === 'attention' ? styles.tabLineBtnActive : ''}`}
                onClick={() => setConceptTab('attention')}
              >
                <span className={styles.tabRadioDot} />
                <span>Needs Attention</span>
                <span className={styles.tabLineCount}>{dash.weak_concepts.length}</span>
              </button>
            </div>

            {/* Concept Mastery Bars */}
            <div className={styles.conceptList}>
              {(conceptTab === 'strongest' ? dash.top_concepts : dash.weak_concepts).map((c) => {
                const score = Math.round(c.mastery_score);
                const isStrong = conceptTab === 'strongest';
                return (
                  <div
                    key={c.concept}
                    className={styles.conceptItem}
                    onClick={() => router.push('/student/practice')}
                    role="button"
                    tabIndex={0}
                  >
                    <div className={styles.conceptHeaderRow}>
                      <span className={styles.conceptName}>{c.concept}</span>
                      <div className={styles.conceptRight}>
                        <span className={styles.conceptScore}>{score}%</span>
                        <ChevronRight size={14} className={styles.conceptChevron} />
                      </div>
                    </div>

                    <div className={styles.progressBarTrack}>
                      <div
                        className={styles.progressBarFill}
                        style={{
                          width: `${Math.max(4, score)}%`,
                          background: isStrong
                            ? 'linear-gradient(90deg, #10b981 0%, #22c55e 100%)'
                            : 'linear-gradient(90deg, #f59e0b 0%, #ef4444 100%)',
                        }}
                      />
                    </div>
                  </div>
                );
              })}

              {(conceptTab === 'strongest' ? dash.top_concepts : dash.weak_concepts).length === 0 && (
                <div className={styles.emptySessionBox}>
                  <p className={styles.emptyTitle}>No concept data yet</p>
                  <p className={styles.emptySub}>Complete lab assignments and practice questions to calibrate your concept mastery scores.</p>
                </div>
              )}
            </div>
          </div>

          {/* Col 3: Today & Calendar */}
          <div className={styles.panelCard}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Today</h2>
              <span className={styles.todayDateBadge}>
                {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>

            {/* 7-Day Weekday Strip */}
            <div className={styles.weekStrip}>
              {weekDays.map((day) => {
                const isSelected = day.dayIndex === selectedDayOffset;
                return (
                  <button
                    key={day.dayName + day.dayNumber}
                    className={`${styles.dayPill} ${isSelected ? styles.dayPillSelected : ''} ${day.isToday ? styles.dayPillToday : ''}`}
                    onClick={() => setSelectedDayOffset(day.dayIndex)}
                  >
                    <span className={styles.dayNameText}>{day.dayName}</span>
                    <span className={styles.dayNumText}>{day.dayNumber}</span>
                  </button>
                );
              })}
            </div>

            {/* Selected Day Agenda / Empty State */}
            <div className={styles.agendaWrap}>
              {sessionsOnSelectedDay.length > 0 ? (
                <div className={styles.agendaList}>
                  {sessionsOnSelectedDay.map((s) => (
                    <div
                      key={s.id}
                      className={styles.agendaItem}
                      onClick={() => router.push(s.status === 'active' ? `/student/live-lab/${s.id}` : '/student/pre-lab')}
                    >
                      <div className={styles.agendaDot} />
                      <div className={styles.agendaInfo}>
                        <p className={styles.agendaTitle}>{expTitles[s.experiment_id] || s.title || 'Lab Session'}</p>
                        <p className={styles.agendaMeta}>
                          {s.scheduled_at ? new Date(s.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'All Day'} • {s.status}
                        </p>
                      </div>
                      <ChevronRight size={14} className={styles.agendaChevron} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.noSessionsBox}>
                  <div className={styles.calendarOutlineIcon}>
                    <CalendarIcon size={26} strokeWidth={1.8} />
                  </div>
                  <h4 className={styles.noSessionsTitle}>No sessions today</h4>
                  <p className={styles.noSessionsSub}>
                    Take some time to practice or explore new experiments!
                  </p>
                  <button
                    className={styles.browsePracticeBtn}
                    onClick={() => router.push('/student/practice')}
                  >
                    <BookOpen size={14} strokeWidth={2} />
                    <span>Browse Practice Library</span>
                  </button>
                </div>
              )}
            </div>
          </div>

        </section>

        {/* ══ ROW 3.5: UPCOMING & ACTIVE EXAMS ══ */}
        {activeExams.length > 0 && (
          <section className={styles.examSection}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>
                <FileCheck size={18} strokeWidth={2.2} style={{ marginRight: 8, color: '#7c3aed' }} />
                Upcoming Exams
              </h2>
              <span className={styles.examCount}>{activeExams.length} exam{activeExams.length !== 1 ? 's' : ''}</span>
            </div>
            <div className={styles.examGrid}>
              {activeExams.map((exam) => {
                const isOpen = exam.window_state === 'open';
                const hasInProgress = exam.has_in_progress;
                const dueDate = exam.due_at ? new Date(exam.due_at) : null;
                const opensAt = exam.available_from ? new Date(exam.available_from) : null;
                const typeLabel = exam.exam_type === 'mcq' ? 'MCQ' : exam.exam_type === 'coding' ? 'Coding' : 'Mixed';

                return (
                  <div
                    key={exam.id}
                    className={`${styles.examCard} ${isOpen ? styles.examCardOpen : styles.examCardUpcoming}`}
                    onClick={() => router.push(`/student/exams/${exam.id}`)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className={styles.examCardTop}>
                      <div className={styles.examTypeBadge}>
                        {exam.exam_type === 'coding' ? <Code2 size={12} /> : <FileCheck size={12} />}
                        <span>{typeLabel}</span>
                      </div>
                      <span className={`${styles.examStateBadge} ${isOpen ? styles.examStateOpen : styles.examStateUpcoming}`}>
                        {hasInProgress ? 'In Progress' : isOpen ? 'Open Now' : 'Upcoming'}
                      </span>
                    </div>

                    <h3 className={styles.examTitle}>{exam.title}</h3>
                    {exam.description && (
                      <p className={styles.examDesc}>
                        {exam.description.length > 80 ? exam.description.slice(0, 80) + '…' : exam.description}
                      </p>
                    )}

                    <div className={styles.examMeta}>
                      <span className={styles.examMetaItem}>
                        <Clock size={13} strokeWidth={2} />
                        {exam.duration_minutes} min
                      </span>
                      <span className={styles.examMetaItem}>
                        <FileCheck size={13} strokeWidth={2} />
                        {exam.question_count} Q{exam.question_count !== 1 ? 's' : ''}
                      </span>
                      <span className={styles.examMetaItem}>
                        <Award size={13} strokeWidth={2} />
                        Pass: {exam.pass_threshold}%
                      </span>
                    </div>

                    <div className={styles.examFooter}>
                      <span className={styles.examDueText}>
                        {isOpen && dueDate
                          ? `Due ${dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${dueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : opensAt
                            ? `Opens ${opensAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${opensAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : 'No deadline'}
                      </span>
                      <span className={styles.examAttempts}>
                        {exam.attempts_used}/{exam.max_attempts} attempt{exam.max_attempts !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {exam.best_score !== null && (
                      <div className={styles.examScoreBar}>
                        <div className={styles.examScoreTrack}>
                          <div
                            className={styles.examScoreFill}
                            style={{
                              width: `${Math.min(100, exam.best_score)}%`,
                              background: exam.best_score >= exam.pass_threshold
                                ? 'linear-gradient(90deg, #10b981, #22c55e)'
                                : 'linear-gradient(90deg, #f59e0b, #ef4444)'
                            }}
                          />
                        </div>
                        <span className={styles.examScoreLabel}>Best: {exam.best_score.toFixed(0)}%</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ══ ROW 4: QUICK ACTIONS & SET YOUR NEXT GOAL ══ */}
        <section className={styles.bottomGrid}>

          {/* Quick Actions (5 Tiles) */}
          <div className={styles.quickActionsCard}>
            <h3 className={styles.bottomSectionTitle}>Quick Actions</h3>
            <div className={styles.actionTilesRow}>
              <div
                className={styles.actionTile}
                onClick={() => router.push('/student/compiler')}
                role="button"
                tabIndex={0}
              >
                <div className={styles.tileIcon}>
                  <Code2 size={20} strokeWidth={2.2} />
                </div>
                <span className={styles.tileLabel}>Open Compiler</span>
              </div>

              <div
                className={styles.actionTile}
                onClick={() => router.push('/student/practice')}
                role="button"
                tabIndex={0}
              >
                <div className={styles.tileIcon}>
                  <BookOpen size={20} strokeWidth={2.2} />
                </div>
                <span className={styles.tileLabel}>Practice Library</span>
              </div>

              <div
                className={styles.actionTile}
                onClick={() => router.push('/student/subjects')}
                role="button"
                tabIndex={0}
              >
                <div className={styles.tileIcon}>
                  <FolderGit2 size={20} strokeWidth={2.2} />
                </div>
                <span className={styles.tileLabel}>My Subjects</span>
              </div>

              <div
                className={styles.actionTile}
                onClick={() => router.push('/student/practice/daily')}
                role="button"
                tabIndex={0}
              >
                <div className={styles.tileIcon}>
                  <Zap size={20} strokeWidth={2.2} />
                </div>
                <span className={styles.tileLabel}>Daily Challenge</span>
              </div>

              <div
                className={styles.actionTile}
                onClick={() => router.push('/student/analytics')}
                role="button"
                tabIndex={0}
              >
                <div className={styles.tileIcon}>
                  <BarChart3 size={20} strokeWidth={2.2} />
                </div>
                <span className={styles.tileLabel}>View Progress</span>
              </div>
            </div>
          </div>

          {/* Set Your Next Goal */}
          <div className={styles.goalCard}>
            <div className={styles.goalLeftContent}>
              <div className={styles.goalIconWrap}>
                <Target size={22} strokeWidth={2.2} />
              </div>
              <div className={styles.goalTextWrap}>
                <h3 className={styles.goalTitle}>Set Your Next Goal</h3>
                <p className={styles.goalDesc}>
                  Challenge yourself with a new experiment and improve your skills.
                </p>
                <button
                  className={styles.goalExploreBtn}
                  onClick={() => router.push('/student/subjects')}
                >
                  <span>Explore Experiments</span>
                  <ArrowRight size={14} strokeWidth={2.2} />
                </button>
              </div>
            </div>

            {/* Stylized Summit Peak Backdrop */}
            <div className={styles.summitIllustration}>
              <div className={styles.mountainBackdrop} />
              <div className={styles.flagPole}>
                <div className={styles.summitFlag} />
              </div>
            </div>
          </div>

        </section>

      </div>
    </StudentShell>
  );
}
