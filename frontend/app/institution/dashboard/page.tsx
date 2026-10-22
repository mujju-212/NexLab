'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import InstitutionShell from '@/components/layout/InstitutionShell';
import {
  institutionService,
} from '@/services/institution.service';
import { useAuthStore } from '@/store/auth-store';
import {
  Users, GraduationCap, BookOpen, Layers, Radio, Calendar,
  CalendarPlus, UserPlus, UsersRound, BarChart2, Settings,
  ShieldCheck, CheckCircle2, Clock, ArrowRight, ChevronRight,
  Rocket, Database, Sparkles
} from 'lucide-react';
import styles from './page.module.css';

// Charts pull in the whole recharts bundle (~100KB). Loading them after
// hydration keeps the dashboard's first paint to KPIs + shell only.
const DashboardCharts = dynamic(() => import('./DashboardCharts'), {
  ssr: false,
  loading: () => (
    <div className={styles.chartCard} style={{ minHeight: 240 }} aria-busy="true" />
  ),
});

export default function InstitutionDashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  // Cached by react-query: revisiting the dashboard (or any mutation that
  // doesn't invalidate it) renders from cache instantly instead of refetching.
  const { data, isPending: loading } = useQuery({
    queryKey: ['institution', 'dashboard'],
    queryFn: () => institutionService.getDashboard(),
  });

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

  const institutionTitle = data?.institution_name || user?.institution_name || 'Institution';

  const stats = data?.stats;

  // 5 KPI Stat Cards matching the reference UI
  const KPI_CARDS = [
    {
      id: 'students',
      label: 'Total Students',
      value: stats?.students ?? 0,
      growth: stats?.students_growth && stats.students_growth !== '0%' ? stats.students_growth : undefined,
      delta: stats?.students_delta ?? (stats?.students === 0 ? 'No students enrolled' : '0 this month'),
      Icon: GraduationCap,
      color: '#7c3aed',
      bg: '#f5f3ff',
      href: '/institution/users?role=student'
    },
    {
      id: 'instructors',
      label: 'Total Instructors',
      value: stats?.instructors ?? 0,
      growth: stats?.instructors_growth && stats.instructors_growth !== '0%' ? stats.instructors_growth : undefined,
      delta: stats?.instructors_delta ?? (stats?.instructors === 0 ? 'No instructors yet' : '0 this month'),
      Icon: Users,
      color: '#10b981',
      bg: '#ecfdf5',
      href: '/institution/users?role=instructor'
    },
    {
      id: 'batches',
      label: 'Total Batches',
      value: stats?.batches ?? 0,
      growth: stats?.batches_growth && stats.batches_growth !== '0%' ? stats.batches_growth : undefined,
      delta: stats?.batches_delta ?? (stats?.batches === 0 ? 'No batches yet' : '0 this month'),
      Icon: Layers,
      color: '#3b82f6',
      bg: '#eff6ff',
      href: '/institution/academic?tab=sections'
    },
    {
      id: 'subjects',
      label: 'Total Subjects',
      value: stats?.subjects ?? 0,
      growth: stats?.subjects_growth && stats.subjects_growth !== '0%' ? stats.subjects_growth : undefined,
      delta: stats?.subjects_delta ?? (stats?.subjects === 0 ? 'No subjects yet' : '0 this month'),
      Icon: BookOpen,
      color: '#f59e0b',
      bg: '#fffbeb',
      href: '/institution/academic?tab=subjects'
    },
    {
      id: 'sessions',
      label: 'Active Sessions',
      value: stats?.active_sessions ?? 0,
      isLiveBadge: true,
      liveCount: stats?.live_sessions ?? 0,
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
                        {card.growth && <span className={styles.kpiGrowth}>↑ {card.growth}</span>}
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
          <DashboardCharts data={data} stats={stats} />

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
