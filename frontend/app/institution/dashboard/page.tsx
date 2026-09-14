'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import InstitutionShell from '@/components/layout/InstitutionShell';
import {
  institutionService,
  type InstitutionDashboard,
} from '@/services/institution.service';
import { useAuthStore } from '@/store/auth-store';
import {
  Users, GraduationCap, BookOpen, Layers, Radio, Calendar,
  CalendarPlus, UserPlus, UsersRound, BarChart2, Settings,
  ShieldCheck, CheckCircle2, Clock, ArrowRight, ChevronRight,
  Rocket, Database, Sparkles, Activity
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid
} from 'recharts';
import styles from './page.module.css';

export default function InstitutionDashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [data, setData] = useState<InstitutionDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [growthPeriod, setGrowthPeriod] = useState<'6m' | '12m'>('6m');
  const [sessionPeriod, setSessionPeriod] = useState<'week' | 'month'>('week');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await institutionService.getDashboard();
      setData(d);
    } catch {
      setError('Could not load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }, []);

  const formattedDate = useMemo(() => {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(new Date());
  }, []);

  const institutionTitle = data?.institution_name || 'Greenwood Institute';

  const stats = data?.stats;

  // 5 KPI Stat Cards matching the reference UI
  const KPI_CARDS = [
    {
      id: 'students',
      label: 'Total Students',
      value: stats?.students ?? 245,
      growth: stats?.students_growth ?? '+12%',
      delta: stats?.students_delta ?? '+26 this month',
      Icon: GraduationCap,
      color: '#7c3aed',
      bg: '#f5f3ff',
      href: '/institution/users?role=student'
    },
    {
      id: 'instructors',
      label: 'Total Instructors',
      value: stats?.instructors ?? 18,
      growth: stats?.instructors_growth ?? '+6%',
      delta: stats?.instructors_delta ?? '+2 this month',
      Icon: Users,
      color: '#10b981',
      bg: '#ecfdf5',
      href: '/institution/users?role=instructor'
    },
    {
      id: 'batches',
      label: 'Total Batches',
      value: stats?.batches ?? 12,
      growth: stats?.batches_growth ?? '+20%',
      delta: stats?.batches_delta ?? '+2 this month',
      Icon: Layers,
      color: '#3b82f6',
      bg: '#eff6ff',
      href: '/institution/academic?tab=sections'
    },
    {
      id: 'subjects',
      label: 'Total Subjects',
      value: stats?.subjects ?? 36,
      growth: stats?.subjects_growth ?? '+9%',
      delta: stats?.subjects_delta ?? '+3 this month',
      Icon: BookOpen,
      color: '#f59e0b',
      bg: '#fffbeb',
      href: '/institution/academic?tab=subjects'
    },
    {
      id: 'sessions',
      label: 'Active Sessions',
      value: stats?.active_sessions ?? 4,
      isLiveBadge: true,
      liveCount: stats?.live_sessions ?? 2,
      Icon: Radio,
      color: '#ef4444',
      bg: '#fef2f2',
      href: '/institution/sessions'
    },
  ];

  // Quick Action Buttons
  const QUICK_ACTIONS = [
    { label: 'Add Student', Icon: UserPlus, color: '#7c3aed', bg: '#f5f3ff', href: '/institution/users?role=student' },
    { label: 'Add Instructor', Icon: UserPlus, color: '#3b82f6', bg: '#eff6ff', href: '/institution/users?role=instructor' },
    { label: 'Create Batch', Icon: Layers, color: '#06b6d4', bg: '#ecfeff', href: '/institution/academic?tab=sections' },
    { label: 'Create Subject', Icon: BookOpen, color: '#2563eb', bg: '#eff6ff', href: '/institution/academic?tab=subjects' },
    { label: 'Schedule Session', Icon: CalendarPlus, color: '#3b82f6', bg: '#eff6ff', href: '/institution/sessions' },
    { label: 'Manage Enrollments', Icon: UsersRound, color: '#0891b2', bg: '#ecfeff', href: '/institution/academic?tab=enroll' },
    { label: 'View Analytics', Icon: BarChart2, color: '#0d9488', bg: '#f0fdfa', href: '/institution/analytics' },
    { label: 'Institution Settings', Icon: Settings, color: '#4f46e5', bg: '#eef2ff', href: '/institution/settings' },
  ];

  // Helper to parse dates into month abbreviation and day number
  const formatSessionDate = (isoString?: string) => {
    const d = isoString ? new Date(isoString) : new Date();
    const valid = !isNaN(d.getTime()) ? d : new Date();
    const month = valid.toLocaleString('en-US', { month: 'short' }).toUpperCase();
    const day = String(valid.getDate()).padStart(2, '0');
    return { month, day };
  };

  // Helper to format session time range
  const formatSessionTime = (isoString?: string, durationMins = 90, instructorName?: string | null) => {
    if (!isoString) return `10:00 AM - 11:30 AM | ${instructorName || 'Faculty'}`;
    const start = new Date(isoString);
    if (isNaN(start.getTime())) return `10:00 AM - 11:30 AM | ${instructorName || 'Faculty'}`;
    const end = new Date(start.getTime() + durationMins * 60000);
    const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${timeFmt.format(start)} - ${timeFmt.format(end)} | ${instructorName || 'Faculty'}`;
  };

  return (
    <InstitutionShell activePage="Dashboard">
      <div className={styles.dashContainer}>
        {/* ── TOP ROW: Hero Greeting Banner + Date/Quote Card ── */}
        <div className={styles.topRow}>
          <div className={styles.heroBanner}>
            <div className={styles.heroContent}>
              <p className={styles.heroGreeting}>
                {greeting}, Admin! 👋
              </p>
              <h1 className={styles.heroTitle}>
                {institutionTitle}
              </h1>
              <p className={styles.heroTagline}>
                Manage. Monitor. Empower. Build brighter learners together.
              </p>
            </div>

            <div className={styles.heroBuildingWrap}>
              <Image
                src="/institution_building_vector.png"
                alt="Greenwood Institute Campus"
                className={styles.heroBuildingImg}
                width={331}
                height={155}
                priority
              />
            </div>

            <div className={styles.heroQuoteSection}>
              <p className={styles.heroQuoteText}>
                &ldquo;Education thrives when people are empowered.&rdquo;
              </p>
              <div className={styles.heroQuoteBar} />
            </div>
          </div>

          <div className={styles.dateCard}>
            <div className={styles.dateHeader}>
              <Calendar size={18} className={styles.dateCalendarIcon} />
              <span>{formattedDate}</span>
            </div>
            <p className={styles.dateQuote}>
              &ldquo;A well-managed institution today shapes a brighter tomorrow.&rdquo;
            </p>
          </div>
        </div>

        {/* ── 5 KPI STAT CARDS ROW ── */}
        <div className={styles.statsRow}>
          {KPI_CARDS.map(card => {
            const Icon = card.Icon;
            return (
              <div
                key={card.id}
                className={styles.kpiCard}
                onClick={() => router.push(card.href)}
                title={`View ${card.label}`}
              >
                <div className={styles.kpiIcon} style={{ background: card.bg, color: card.color }}>
                  <Icon size={22} strokeWidth={2} />
                </div>
                <div className={styles.kpiBody}>
                  <p className={styles.kpiLabel}>{card.label}</p>
                  <p className={styles.kpiValue}>
                    {loading ? '—' : card.value.toLocaleString()}
                  </p>
                  <div className={styles.kpiFooter}>
                    {card.isLiveBadge ? (
                      <span className={styles.kpiLiveBadge}>
                        <span className={styles.kpiLiveDot} />
                        {card.liveCount} live now
                      </span>
                    ) : (
                      <>
                        <span className={styles.kpiGrowth}>↑ {card.growth}</span>
                        <span className={styles.kpiDelta}>{card.delta}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── MIDDLE ROW: Student Growth, Session Activity, System Status ── */}
        <div className={styles.middleRow}>
          {/* Card 1: Student & Instructor Growth */}
          <div className={styles.chartCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitleGroup}>
                <BarChart2 size={18} className={styles.cardTitleIcon} />
                <h3 className={styles.cardTitle}>Student &amp; Instructor Growth</h3>
              </div>
              <select
                className={styles.cardSelect}
                value={growthPeriod}
                onChange={e => setGrowthPeriod(e.target.value as '6m' | '12m')}
              >
                <option value="6m">Last 6 Months</option>
                <option value="12m">Last 12 Months</option>
              </select>
            </div>

            <div className={styles.chartLegendRow}>
              <div className={styles.legendItems}>
                <span className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: '#7c3aed' }} />
                  Students
                </span>
                <span className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: '#c084fc' }} />
                  Instructors
                </span>
              </div>
              <div className={styles.legendCallout}>
                Sep 2026: {stats?.students ?? 245} Students · {stats?.instructors ?? 18} Instructors
              </div>
            </div>

            <div className={styles.chartArea}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data?.growth_chart || [
                    { month: 'Apr', students: 110, instructors: 12 },
                    { month: 'May', students: 130, instructors: 14 },
                    { month: 'Jun', students: 145, instructors: 16 },
                    { month: 'Jul', students: 160, instructors: 18 },
                    { month: 'Aug', students: 180, instructors: 19 },
                    { month: 'Sep', students: 245, instructors: 22 },
                  ]}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  barGap={4}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: '#ffffff', borderRadius: 10, border: '1px solid #ede9fe', boxShadow: '0 4px 14px rgba(0,0,0,0.06)' }}
                    labelStyle={{ fontWeight: 700, color: '#111827' }}
                  />
                  <Bar dataKey="students" fill="#7c3aed" radius={[5, 5, 0, 0]} maxBarSize={22} />
                  <Bar dataKey="instructors" fill="#c084fc" radius={[5, 5, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Card 2: Session Activity */}
          <div className={styles.chartCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitleGroup}>
                <Activity size={18} className={styles.cardTitleIcon} />
                <h3 className={styles.cardTitle}>Session Activity</h3>
              </div>
              <select
                className={styles.cardSelect}
                value={sessionPeriod}
                onChange={e => setSessionPeriod(e.target.value as 'week' | 'month')}
              >
                <option value="week">This Week</option>
                <option value="month">This Month</option>
              </select>
            </div>

            <div className={styles.chartLegendRow}>
              <div className={styles.legendItems}>
                <span className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: '#c084fc' }} />
                  Scheduled
                </span>
                <span className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: '#10b981' }} />
                  Completed
                </span>
                <span className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: '#6366f1' }} />
                  Live
                </span>
              </div>
            </div>

            <div className={styles.chartArea}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data?.session_activity || [
                    { day: 'Mon', scheduled: 12, completed: 5, live: 2 },
                    { day: 'Tue', scheduled: 9, completed: 4, live: 2 },
                    { day: 'Wed', scheduled: 13, completed: 6, live: 3 },
                    { day: 'Thu', scheduled: 16, completed: 7, live: 5 },
                    { day: 'Fri', scheduled: 10, completed: 4, live: 2 },
                    { day: 'Sat', scheduled: 11, completed: 4, live: 4 },
                    { day: 'Sun', scheduled: 11, completed: 4, live: 2 },
                  ]}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  barGap={2}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: '#ffffff', borderRadius: 10, border: '1px solid #ede9fe', boxShadow: '0 4px 14px rgba(0,0,0,0.06)' }}
                    labelStyle={{ fontWeight: 700, color: '#111827' }}
                  />
                  <Bar dataKey="scheduled" fill="#c084fc" radius={[3, 3, 0, 0]} maxBarSize={14} />
                  <Bar dataKey="completed" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={14} />
                  <Bar dataKey="live" fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Card 3: System Status */}
          <div className={styles.chartCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitleGroup}>
                <ShieldCheck size={18} className={styles.cardTitleIcon} />
                <h3 className={styles.cardTitle}>System Status</h3>
              </div>
              <button
                className={styles.viewAllLink}
                onClick={() => router.push('/institution/settings')}
              >
                View Details <ChevronRight size={13} />
              </button>
            </div>

            <div className={styles.systemStatusList}>
              {(data?.system_status || [
                { name: 'Platform Services', status: 'Operational', healthy: true },
                { name: 'Database', status: 'Operational', healthy: true },
                { name: 'Live Session Servers', status: 'Operational', healthy: true },
                { name: 'Code Execution', status: 'Operational', healthy: true },
                { name: 'AI Services', status: 'Operational', healthy: true },
              ]).map(item => (
                <div key={item.name} className={styles.systemStatusRow}>
                  <div className={styles.systemStatusLeft}>
                    <CheckCircle2 size={16} className={styles.statusCheckIcon} />
                    <span>{item.name}</span>
                  </div>
                  <span className={styles.systemStatusTag}>{item.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── BOTTOM ROW: Quick Actions, Recent Activity, Upcoming Sessions ── */}
        <div className={styles.bottomRow}>
          {/* Column 1: Quick Actions */}
          <div className={styles.chartCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitleGroup}>
                <Sparkles size={18} className={styles.cardTitleIcon} />
                <h3 className={styles.cardTitle}>Quick Actions</h3>
              </div>
            </div>

            <div className={styles.quickActionsGrid}>
              {QUICK_ACTIONS.map(action => {
                const ActionIcon = action.Icon;
                return (
                  <div
                    key={action.label}
                    className={styles.actionBtn}
                    onClick={() => router.push(action.href)}
                    title={action.label}
                  >
                    <div className={styles.actionBtnIcon} style={{ background: action.bg, color: action.color }}>
                      <ActionIcon size={18} strokeWidth={2} />
                    </div>
                    <span className={styles.actionBtnLabel}>{action.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Column 2: Recent Activity */}
          <div className={styles.chartCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitleGroup}>
                <Clock size={18} className={styles.cardTitleIcon} />
                <h3 className={styles.cardTitle}>Recent Activity</h3>
              </div>
              <button
                className={styles.viewAllLink}
                onClick={() => router.push('/institution/settings')}
              >
                View All <ChevronRight size={13} />
              </button>
            </div>

            <div className={styles.recentActivityList}>
              {(data?.recent_activity || []).slice(0, 5).map(act => (
                <div key={act.id} className={styles.activityItem}>
                  <div
                    className={styles.activityIcon}
                    style={{
                      background: act.type === 'student' ? '#f5f3ff' : act.type === 'instructor' ? '#ecfdf5' : act.type === 'batch' ? '#eff6ff' : '#fffbeb',
                      color: act.type === 'student' ? '#7c3aed' : act.type === 'instructor' ? '#10b981' : act.type === 'batch' ? '#3b82f6' : '#f59e0b',
                    }}
                  >
                    {act.type === 'student' ? (
                      <GraduationCap size={15} />
                    ) : act.type === 'instructor' ? (
                      <Users size={15} />
                    ) : act.type === 'batch' ? (
                      <Layers size={15} />
                    ) : (
                      <BookOpen size={15} />
                    )}
                  </div>
                  <div className={styles.activityContent}>
                    <p className={styles.activityTitle}>{act.title}</p>
                    <p className={styles.activityDesc}>{act.description}</p>
                  </div>
                  <span className={styles.activityTime}>{act.time_ago}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Column 3: Upcoming Sessions */}
          <div className={styles.chartCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitleGroup}>
                <Calendar size={18} className={styles.cardTitleIcon} />
                <h3 className={styles.cardTitle}>Upcoming Sessions</h3>
              </div>
              <button
                className={styles.viewAllLink}
                onClick={() => router.push('/institution/sessions')}
              >
                View All <ChevronRight size={13} />
              </button>
            </div>

            <div className={styles.upcomingSessionsList}>
              {(data?.upcoming_sessions || []).slice(0, 4).map(sess => {
                const dateInfo = formatSessionDate(sess.scheduled_at);
                const timeStr = formatSessionTime(sess.scheduled_at, sess.duration_minutes, sess.instructor_name);

                return (
                  <div
                    key={sess.id}
                    className={styles.upcomingSessionItem}
                    onClick={() => router.push('/institution/sessions')}
                  >
                    <div className={styles.dateBadge}>
                      <span className={styles.dateBadgeMonth}>{dateInfo.month}</span>
                      <span className={styles.dateBadgeDay}>{dateInfo.day}</span>
                    </div>
                    <div className={styles.sessionDetails}>
                      <p className={styles.sessionItemTitle}>{sess.title || sess.subject_name || 'Lab Session'}</p>
                      <p className={styles.sessionItemMeta}>{timeStr}</p>
                    </div>
                    <ChevronRight size={15} className={styles.sessionItemChevron} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── BOTTOM STRIP: Pro Plan Banner + Storage & Usage ── */}
        <div className={styles.bottomStrip}>
          <div className={styles.planBanner}>
            <div className={styles.planLeft}>
              <div className={styles.planRocketIcon}>
                <Rocket size={20} />
              </div>
              <div>
                <h4 className={styles.planTitle}>You&apos;re on the Pro Plan</h4>
                <p className={styles.planSubtitle}>
                  Manage your institution, track growth, and unlock more possibilities with NexLab.
                </p>
              </div>
            </div>
            <button
              className={styles.planButton}
              onClick={() => router.push('/institution/settings?tab=plan')}
            >
              Manage Plan <ArrowRight size={14} />
            </button>
          </div>

          <div className={styles.storageCard}>
            <div className={styles.storageLeft}>
              <div className={styles.storageIcon}>
                <Database size={18} />
              </div>
              <div className={styles.storageInfo}>
                <div className={styles.storageTitleRow}>
                  <h4 className={styles.storageTitle}>Storage &amp; Usage</h4>
                  <span className={styles.storagePercent}>{data?.storage_usage?.percent ?? 25}%</span>
                </div>
                <div className={styles.storageBar}>
                  <div
                    className={styles.storageFill}
                    style={{ width: `${data?.storage_usage?.percent ?? 25}%` }}
                  />
                </div>
                <p className={styles.storageText}>
                  {data?.storage_usage?.used_gb ?? 12.5} GB of {data?.storage_usage?.total_gb ?? 50} GB used
                </p>
              </div>
            </div>
            <button
              className={styles.storageManageBtn}
              onClick={() => router.push('/institution/settings?tab=plan')}
            >
              Manage
            </button>
          </div>
        </div>
      </div>
    </InstitutionShell>
  );
}
