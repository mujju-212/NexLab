'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import IndividualShell from '@/components/layout/IndividualShell';
import { useAuthStore } from '@/store/auth-store';
import { authService } from '@/services/auth.service';
import { platformUserService, type PlatformAnalyticsOverview } from '@/services/platform-user.service';
import { practiceExtraService } from '@/services/practice-extra.service';
import styles from './profile.module.css';
import {
  User, Mail, Phone, Lock, Save, LogOut,
  Zap, CheckCircle2, Eye, EyeOff,
  Target, TrendingUp, AlertCircle, Trophy, Sparkles,
  Camera, Globe, Calendar, Link as LinkIcon,
  Clock, XCircle, ShieldCheck, CreditCard, Check,
  Download, Sliders, ChevronRight, Copy, FileText,
  CheckCheck, Edit3, X, Laptop, Award
} from 'lucide-react';
import Cookies from 'js-cookie';

type TabKey = 'Overview' | 'Achievements' | 'Activity' | 'Preferences' | 'Security' | 'Billing';

export default function ProfilePage() {
  const router = useRouter();
  const { user, setUser, clearAuth, isAuthenticated, hasHydrated } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('Overview');

  // Overview / Backend Data
  const [analytics, setAnalytics] = useState<PlatformAnalyticsOverview | null>(null);
  const [courseCertificates, setCourseCertificates] = useState<
    { course_id: string; course_title?: string; title?: string; certificate_id?: string; completed_at?: string; download_url?: string }[]
  >([]);
  const [submissions, setSubmissions] = useState<Array<{
    id: string;
    problem_id: string;
    title: string;
    slug: string;
    difficulty: string;
    nexlab_topic?: string;
    status: string;
    is_solved: boolean;
    language: string;
    passed: number;
    total: number;
    time_ms: number;
    memory_kb: number;
    xp_earned: number;
    submitted_at: string;
  }>>([]);
  const [showcase, setShowcase] = useState<{ profile_public: boolean; profile_slug: string | null; share_url?: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit Profile Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editWebsite, setEditWebsite] = useState('https://nexlab.io');
  const [editSaving, setEditSaving] = useState(false);
  const [editMsg, setEditMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Password Change State
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 2FA State
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [toggling2FA, setToggling2FA] = useState(false);

  // Preferences State
  const [prefLang, setPrefLang] = useState('python');
  const [prefTheme, setPrefTheme] = useState('dark');
  const [prefFontSize, setPrefFontSize] = useState('14px');
  const [prefAiLevel, setPrefAiLevel] = useState('balanced');
  const [prefDailyNotif, setPrefDailyNotif] = useState(true);
  const [prefStreakNotif, setPrefStreakNotif] = useState(true);
  const [prefSavedToast, setPrefSavedToast] = useState(false);

  // Activity filter state
  const [activityFilter, setActivityFilter] = useState<'all' | 'solved' | 'attempted'>('all');
  const [overviewRange, setOverviewRange] = useState('Last 30 Days');
  const [heatmapRange, setHeatmapRange] = useState('Past 12 Months');

  // Heatmap tooltip state
  const [hoveredCell, setHoveredCell] = useState<{ date: string; count: number } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isReady = mounted && (hasHydrated || typeof window !== 'undefined');

  // Auth gate
  useEffect(() => {
    if (!isReady) return;
    const token = Cookies.get('access_token') || (typeof window !== 'undefined' ? localStorage.getItem('access_token') : null);

    if (!token && !isAuthenticated) {
      router.replace('/login');
      return;
    }

    if (token && !user) {
      authService.getMe()
        .then((u) => setUser(u))
        .catch(() => router.replace('/login'));
    }
  }, [isReady, isAuthenticated, user, router, setUser]);

  // Sync form state when user changes
  useEffect(() => {
    if (user) {
      setEditName(user.full_name || '');
      setEditBio(user.bio || '');
      setEditPhone(user.phone || '');
      setEditLocation(user.location || 'Global');
      setTwoFactorEnabled(Boolean(user.two_factor_enabled));
    }
  }, [user]);

  // Fetch real analytics and submission history
  useEffect(() => {
    if (!user) return;
    setLoading(true);

    Promise.all([
      platformUserService.getPlatformOverview().catch(() => null),
      platformUserService.getSubmissions(20).catch(() => ({ submissions: [], total: 0 })),
      platformUserService.getMyShowcase().catch(() => null),
      platformUserService.getCoursesAnalytics().catch(() => null),
    ]).then(([overviewData, subsData, showcaseData, coursesData]) => {
      if (overviewData) {
        setAnalytics(overviewData);
      }
      if (subsData && subsData.submissions) {
        setSubmissions(subsData.submissions);
      }
      if (showcaseData) {
        setShowcase(showcaseData);
      }
      if (coursesData) {
        setCourseCertificates(coursesData.certificates || []);
      }
    }).finally(() => {
      setLoading(false);
    });
  }, [user]);

  // Handle Edit Profile Save
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditSaving(true);
    setEditMsg(null);

    try {
      const updatedUser = await authService.updateProfile({
        full_name: editName,
        bio: editBio,
        phone: editPhone || undefined,
        location: editLocation || undefined,
      });
      setUser(updatedUser);
      setEditMsg({ type: 'success', text: 'Profile updated successfully!' });
      setTimeout(() => {
        setIsEditModalOpen(false);
        setEditMsg(null);
      }, 1200);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to update profile.';
      setEditMsg({ type: 'error', text: msg });
    } finally {
      setEditSaving(false);
    }
  };

  // Handle Change Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) {
      setPwMsg({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    if (newPw.length < 8) {
      setPwMsg({ type: 'error', text: 'Password must be at least 8 characters.' });
      return;
    }
    setPwSaving(true);
    setPwMsg(null);
    try {
      await authService.changePassword(currentPw, newPw);
      setPwMsg({ type: 'success', text: 'Password changed successfully!' });
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to change password.';
      setPwMsg({ type: 'error', text: msg });
    } finally {
      setPwSaving(false);
    }
  };

  // Handle 2FA Toggle
  const handleToggle2FA = async () => {
    setToggling2FA(true);
    try {
      const res = await authService.toggle2FA();
      setTwoFactorEnabled(res.two_factor_enabled);
      if (user) {
        setUser({ ...user, two_factor_enabled: res.two_factor_enabled });
      }
    } catch {
      // Keep state
    } finally {
      setToggling2FA(false);
    }
  };

  // Handle Export Data
  const handleExportData = async () => {
    try {
      const data = await authService.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nexlab_account_export_${user?.id || 'profile'}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to export account data.');
    }
  };

  // Handle Copy Showcase Link
  const handleCopyShowcase = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://nexlab.io';
    const slug = showcase?.profile_slug || user?.id?.slice(0, 8) || 'learner';
    navigator.clipboard.writeText(`${origin}/u/${slug}`).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  // Format initials
  const initials = useMemo(() => {
    if (!user?.full_name) return '?';
    const parts = user.full_name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [user]);

  // Real telemetry only — zero until the API answers. No invented numbers.
  const totalXp = analytics?.standing?.total_xp ?? 0;
  const problemsSolved = analytics?.standing?.problems_solved ?? 0;
  const problemsAttempted = analytics?.difficulty_mix?.total_attempted ? Math.max(0, analytics.difficulty_mix.total_attempted - problemsSolved) : 0;
  const totalSubmissions = analytics?.activity?.summary?.total_submissions ?? 0;

  const easySolved = analytics?.difficulty_mix?.easy ?? 0;
  const medSolved = analytics?.difficulty_mix?.medium ?? 0;
  const hardSolved = analytics?.difficulty_mix?.hard ?? 0;
  const solvedTotal = easySolved + medSolved + hardSolved;
  const shareOfSolved = (n: number) => (solvedTotal > 0 ? Math.round((n / solvedTotal) * 100) : 0);

  const acceptanceRate = analytics?.difficulty_mix?.acceptance_rate
    ? Math.min(100, Math.round(analytics.difficulty_mix.acceptance_rate))
    : 0;

  // Format relative time helper
  const formatTimeAgo = (dateStr: string) => {
    if (!dateStr) return 'Recently';
    const now = new Date();
    const past = new Date(dateStr);
    const diffMs = now.getTime() - past.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours} hours ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 30) return `${diffDays} days ago`;
    return past.toLocaleDateString();
  };

  const recentList = submissions.slice(0, 5).map(s => ({
    title: s.title,
    slug: s.slug,
    difficulty: s.difficulty,
    status: s.is_solved ? 'Solved' : 'Attempted',
    is_solved: s.is_solved,
    timeAgo: formatTimeAgo(s.submitted_at),
  }));

  // Badge DEFINITIONS (display catalog) — earned state comes only from the API.
  const BADGE_DEFS = [
    { id: 'first_solve', icon: '🌱', title: 'First Steps', desc: 'Solve your first problem' },
    { id: 'streak_7', icon: '🔥', title: 'Week Warrior', desc: 'Maintain a 7-day streak' },
    { id: 'streak_30', icon: '🔥', title: 'Month Master', desc: 'Maintain a 30-day streak' },
    { id: 'easy_10', icon: '✅', title: 'Easy Mode', desc: 'Solve 10 Easy problems' },
    { id: 'medium_10', icon: '⚡', title: 'Rising Star', desc: 'Solve 10 Medium problems' },
    { id: 'hard_5', icon: '💎', title: 'Diamond Coder', desc: 'Solve 5 Hard problems' },
    { id: 'centurion', icon: '💯', title: 'Centurion', desc: 'Solve 100 problems' },
    { id: 'speed_demon', icon: '⚡', title: 'Speed Demon', desc: 'Accepted under 5 minutes' },
  ];
  const earnedBadges = analytics?.standing?.badges || [];
  type EarnedBadge = { badge_id: string; earned_at?: string | null };
  const earnedList: EarnedBadge[] = earnedBadges;
  const earnedBadgeIds = earnedList.map((b) => b.badge_id);
  const earnedBadgeDates: Record<string, string | null | undefined> = Object.fromEntries(
    earnedList.map((b) => [b.badge_id, b.earned_at ?? undefined]),
  );

  // 52-week heatmap grid generator (from real analytics.activity.heatmap or fallback)
  const heatmapWeeks = useMemo(() => {
    const raw = analytics?.activity?.heatmap || [];
    const totalDays = 52 * 7; // 364 days
    const days = [...raw];

    // Ensure we have 364 days
    while (days.length < totalDays) {
      days.unshift({ date: '', count: 0, level: 0 });
    }
    const sliced = days.slice(-totalDays);

    const weeks = [];
    for (let w = 0; w < 52; w++) {
      const weekDays = [];
      for (let d = 0; d < 7; d++) {
        const item = sliced[w * 7 + d] || { date: '', count: 0, level: 0 };
        weekDays.push(item);
      }
      weeks.push(weekDays);
    }
    return weeks;
  }, [analytics]);

  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // SVG Radial circle helper (radius = 34, circum = 213.6)
  const renderCircleGauge = (pct: number, color: string, label: string, sub: string) => {
    const r = 34;
    const circum = 2 * Math.PI * r;
    const offset = circum - (pct / 100) * circum;

    return (
      <div className={styles.gaugeItem}>
        <div className={styles.gaugeCircleWrapper}>
          <svg className={styles.gaugeSvg} viewBox="0 0 86 86">
            <circle cx="43" cy="43" r={r} className={styles.gaugeBgCircle} />
            <circle
              cx="43"
              cy="43"
              r={r}
              className={styles.gaugeFillCircle}
              style={{
                stroke: color,
                strokeDasharray: circum,
                strokeDashoffset: offset,
              }}
            />
          </svg>
          <span className={styles.gaugeCenterText}>{pct}%</span>
        </div>
        <span className={styles.gaugeLabel}>{label}</span>
        <span className={styles.gaugeSubtext}>{sub}</span>
      </div>
    );
  };

  if (!isAuthenticated || !user) return null;

  return (
    <IndividualShell activePage="Profile">
      <div className={styles.container}>

        {/* ══════════════════════════════════════════════════════════════════════
            1. HERO BANNER CARD
            ══════════════════════════════════════════════════════════════════════ */}
        <section className={styles.heroCard}>
          <div className={styles.heroLeft}>
            <div className={styles.avatarWrapper}>
              <div className={styles.avatar}>
                {user.profile_pic_url ? (
                  <img src={user.profile_pic_url} alt={user.full_name} className={styles.avatarImg} />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
              <button
                type="button"
                className={styles.cameraBtn}
                title="Change Avatar"
                onClick={() => setIsEditModalOpen(true)}
              >
                <Camera size={14} />
              </button>
            </div>

            <div className={styles.heroMeta}>
              <div className={styles.heroNameRow}>
                <h1 className={styles.heroName}>{user.full_name || 'Platform Learner'}</h1>
              </div>

              <div className={styles.handleBadgeRow}>
                <span className={styles.username}>
                  @{user.email ? user.email.split('@')[0] : 'learner'}
                </span>
                <span className={styles.roleBadge}>
                  <Sparkles size={12} />
                  {user.role === 'platform_user' ? 'Platform User' : (user.role || 'Member')}
                </span>
              </div>

              {user.bio ? (
                <p className={styles.heroBio}>{user.bio}</p>
              ) : null}

              <div className={styles.metaRow}>
                <div className={styles.metaItem}>
                  <Calendar size={13} />
                  <span>
                    {user.created_at
                      ? `Joined ${new Date(user.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`
                      : 'Platform member'}
                  </span>
                </div>
                <div className={styles.metaItem}>
                  <Globe size={13} />
                  <span>{user.location || 'Global'}</span>
                </div>
                {(user as unknown as { website?: string }).website ? (
                  <a
                    href={(user as unknown as { website: string }).website}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.metaLink}
                    title="Visit Website"
                  >
                    <LinkIcon size={13} />
                    <span>{(user as unknown as { website: string }).website}</span>
                  </a>
                ) : null}
              </div>
            </div>
          </div>

          <div className={styles.heroRight}>
            <img
              src="/images/profile-banner.jpg"
              alt="Profile Milestone Banner"
              className={styles.bannerBg}
            />

            <button
              type="button"
              className={styles.editBtnTop}
              onClick={() => setIsEditModalOpen(true)}
            >
              <Edit3 size={13} />
              <span>Edit Profile</span>
            </button>

            <div className={styles.quoteCard}>
              <span className={styles.quoteIcon}>“</span>
              <p className={styles.quoteText}>
                Consistency turns problems into <span className={styles.quoteHighlight}>progress.</span>
              </p>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════════
            2. TOP QUICK STATS ROW
            ══════════════════════════════════════════════════════════════════════ */}
        <section className={styles.statsGrid}>
          {/* Card 1: Total XP */}
          <div className={styles.statCard}>
            <div className={`${styles.statIconBox} ${styles.statIconBoxYellow}`}>
              <Zap size={22} />
            </div>
            <div className={styles.statInfo}>
              <div className={styles.statTopRow}>
                <span className={styles.statValue}>{totalXp.toLocaleString()}</span>
              </div>
              <span className={styles.statLabel}>Total XP</span>
            </div>
          </div>

          {/* Card 2: Problems Solved */}
          <div className={styles.statCard}>
            <div className={`${styles.statIconBox} ${styles.statIconBoxGreen}`}>
              <CheckCircle2 size={22} />
            </div>
            <div className={styles.statInfo}>
              <div className={styles.statTopRow}>
                <span className={styles.statValue}>{problemsSolved}</span>
              </div>
              <span className={styles.statLabel}>Problems Solved</span>
            </div>
          </div>

          {/* Card 3: Problems Attempted */}
          <div className={styles.statCard}>
            <div className={`${styles.statIconBox} ${styles.statIconBoxPurple}`}>
              <Target size={22} />
            </div>
            <div className={styles.statInfo}>
              <div className={styles.statTopRow}>
                <span className={styles.statValue}>{problemsAttempted}</span>
              </div>
              <span className={styles.statLabel}>Problems Attempted</span>
            </div>
          </div>

          {/* Card 4: Total Submissions */}
          <div className={styles.statCard}>
            <div className={`${styles.statIconBox} ${styles.statIconBoxBlue}`}>
              <TrendingUp size={22} />
            </div>
            <div className={styles.statInfo}>
              <div className={styles.statTopRow}>
                <span className={styles.statValue}>{totalSubmissions}</span>
              </div>
              <span className={styles.statLabel}>Total Submissions</span>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════════
            3. SUB-TABS NAVIGATION
            ══════════════════════════════════════════════════════════════════════ */}
        <nav className={styles.tabsNav} aria-label="Profile Sections">
          {(['Overview', 'Achievements', 'Activity', 'Preferences', 'Security', 'Billing'] as TabKey[]).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`${styles.tabBtn} ${activeTab === tab ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>

        {/* ══════════════════════════════════════════════════════════════════════
            4. TAB CONTENT: OVERVIEW
            ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'Overview' && (
          <>
            {/* Top Row: Progress Overview + Activity Heatmap */}
            <div className={styles.overviewGrid}>
              {/* Progress Overview Card */}
              <div className={styles.sectionCard}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardHeaderLeft}>
                    <div className={styles.headerIconBox}>
                      <Sliders size={18} />
                    </div>
                    <div>
                      <h3 className={styles.cardTitle}>Progress Overview</h3>
                      <p className={styles.cardSubtitle}>Your overall learning progress and performance</p>
                    </div>
                  </div>
                  <select
                    className={styles.cardSelect}
                    value={overviewRange}
                    onChange={(e) => setOverviewRange(e.target.value)}
                  >
                    <option>Last 30 Days</option>
                    <option>Last 90 Days</option>
                    <option>All Time</option>
                  </select>
                </div>

                <div className={styles.radialGaugesRow}>
                  {renderCircleGauge(shareOfSolved(easySolved), '#10b981', 'Easy', `${easySolved} solved`)}
                  {renderCircleGauge(shareOfSolved(medSolved), '#f59e0b', 'Medium', `${medSolved} solved`)}
                  {renderCircleGauge(shareOfSolved(hardSolved), '#ef4444', 'Hard', `${hardSolved} solved`)}
                  {renderCircleGauge(acceptanceRate, '#6366f1', 'Acceptance Rate', `${totalSubmissions} submissions`)}
                </div>
              </div>

              {/* Activity Heatmap Card */}
              <div className={styles.sectionCard}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardHeaderLeft}>
                    <div className={styles.headerIconBox}>
                      <Calendar size={18} />
                    </div>
                    <div>
                      <h3 className={styles.cardTitle}>Activity Heatmap</h3>
                      <p className={styles.cardSubtitle}>Your problem solving activity over the past year</p>
                    </div>
                  </div>
                  <select
                    className={styles.cardSelect}
                    value={heatmapRange}
                    onChange={(e) => setHeatmapRange(e.target.value)}
                  >
                    <option>Past 12 Months</option>
                    <option>Past 6 Months</option>
                  </select>
                </div>

                <div className={styles.heatmapContainer}>
                  <div className={styles.heatmapMonths}>
                    {monthLabels.map((m) => (
                      <span key={m}>{m}</span>
                    ))}
                  </div>

                  <div className={styles.heatmapGridWrapper}>
                    <div className={styles.heatmapDays}>
                      {dayLabels.map((d) => (
                        <span key={d}>{d}</span>
                      ))}
                    </div>

                    <div className={styles.heatmapCols}>
                      {heatmapWeeks.map((week, wIdx) => (
                        <div key={wIdx} className={styles.heatmapCol}>
                          {week.map((day, dIdx) => {
                            const lvlCls =
                              day.count === 0 ? styles.heatLvl0
                              : day.count <= 2 ? styles.heatLvl1
                              : day.count <= 5 ? styles.heatLvl2
                              : day.count <= 9 ? styles.heatLvl3
                              : styles.heatLvl4;

                            return (
                              <div
                                key={dIdx}
                                className={`${styles.heatmapCell} ${lvlCls}`}
                                title={day.date ? `${day.date}: ${day.count} problem${day.count === 1 ? '' : 's'} solved` : 'No activity'}
                                onMouseEnter={() => setHoveredCell({ date: day.date, count: day.count })}
                                onMouseLeave={() => setHoveredCell(null)}
                              />
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className={styles.heatmapFooter}>
                    <div className={styles.heatmapLegend}>
                      <span>Less</span>
                      <div className={styles.legendSquares}>
                        <div className={`${styles.legendSquare} ${styles.heatLvl0}`} />
                        <div className={`${styles.legendSquare} ${styles.heatLvl1}`} />
                        <div className={`${styles.legendSquare} ${styles.heatLvl2}`} />
                        <div className={`${styles.legendSquare} ${styles.heatLvl3}`} />
                        <div className={`${styles.legendSquare} ${styles.heatLvl4}`} />
                      </div>
                      <span>More</span>
                    </div>
                    <span>{problemsSolved} problems solved</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Row: Recent Activity + Account Information */}
            <div className={styles.overviewBottomGrid}>
              {/* Recent Activity Card */}
              <div className={styles.sectionCard}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardHeaderLeft}>
                    <div className={styles.headerIconBox}>
                      <Clock size={18} />
                    </div>
                    <div>
                      <h3 className={styles.cardTitle}>Recent Activity</h3>
                      <p className={styles.cardSubtitle}>Your latest submissions and progress</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.cardActionLink}
                    onClick={() => setActiveTab('Activity')}
                  >
                    View All <ChevronRight size={14} />
                  </button>
                </div>

                <div className={styles.activityList}>
                  {recentList.length === 0 && (
                    <p style={{ margin: 0, padding: '18px 4px', fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>
                      No submissions yet — solve your first problem to start your history.
                    </p>
                  )}
                  {recentList.map((item, idx) => (
                    <div key={idx} className={styles.activityRow}>
                      <div className={styles.activityRowLeft}>
                        {item.is_solved ? (
                          <CheckCircle2 size={16} className={styles.statusIconSolved} />
                        ) : (
                          <XCircle size={16} className={styles.statusIconAttempted} />
                        )}
                        <a
                          href={`/practice/library/${item.slug || 'two-sum'}`}
                          className={styles.problemTitleLink}
                        >
                          {item.title}
                        </a>
                      </div>

                      <div className={styles.activityRowRight}>
                        <span className={`${styles.diffPill} ${
                          item.difficulty.toLowerCase() === 'easy' ? styles.diffEasy :
                          item.difficulty.toLowerCase() === 'medium' ? styles.diffMedium : styles.diffHard
                        }`}>
                          {item.difficulty}
                        </span>
                        <span className={styles.statusText}>{item.status}</span>
                        <span className={styles.timeAgo}>{item.timeAgo}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Account Information Card */}
              <div className={styles.sectionCard}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardHeaderLeft}>
                    <div className={styles.headerIconBox}>
                      <User size={18} />
                    </div>
                    <div>
                      <h3 className={styles.cardTitle}>Account Information</h3>
                      <p className={styles.cardSubtitle}>Manage your personal details and account info</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.cardActionLink}
                    onClick={() => setIsEditModalOpen(true)}
                  >
                    <Edit3 size={13} /> Edit
                  </button>
                </div>

                <div className={styles.infoRows}>
                  <div className={styles.infoRow}>
                    <div className={styles.infoRowLeft}>
                      <Mail size={15} />
                      <span>Full Name</span>
                    </div>
                    <span className={styles.infoRowValue}>{user.full_name || 'Platform Learner'}</span>
                  </div>

                  <div className={styles.infoRow}>
                    <div className={styles.infoRowLeft}>
                      <Mail size={15} />
                      <span>Email Address</span>
                    </div>
                    <span className={styles.infoRowValue}>{user.email || '—'}</span>
                  </div>

                  <div className={styles.infoRow}>
                    <div className={styles.infoRowLeft}>
                      <User size={15} />
                      <span>Username</span>
                    </div>
                    <span className={styles.infoRowValue}>@{user.email ? user.email.split('@')[0] : 'learner'}</span>
                  </div>

                  <div className={styles.infoRow}>
                    <div className={styles.infoRowLeft}>
                      <Award size={15} />
                      <span>Account Type</span>
                    </div>
                    <span className={styles.roleBadge}>
                      <Sparkles size={11} />
                      {user.role === 'platform_user' ? 'Platform User' : (user.role || 'Member')}
                    </span>
                  </div>

                  <div className={styles.infoRow}>
                    <div className={styles.infoRowLeft}>
                      <Calendar size={15} />
                      <span>Member Since</span>
                    </div>
                    <span className={styles.infoRowValue}>
                      {user.created_at
                        ? new Date(user.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
                        : '—'}
                    </span>
                  </div>

                  <div className={styles.infoRow}>
                    <div className={styles.infoRowLeft}>
                      <Globe size={15} />
                      <span>Location</span>
                    </div>
                    <span className={styles.infoRowValue}>{user.location || 'Global'}</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            5. TAB CONTENT: ACHIEVEMENTS
            ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'Achievements' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Standing banner */}
            <div className={styles.standingHero}>
              <div>
                <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 800 }}>Platform Rating &amp; Standing</h2>
                <p style={{ margin: 0, fontSize: 13, opacity: 0.9 }}>
                  Based on algorithmic contest performance, difficulty weightings, and solve consistency.
                </p>
              </div>
              <div className={styles.standingHeroStats}>
                <div className={styles.standingStatItem}>
                  <h4>Rating</h4>
                  <p>{analytics?.standing?.rating ? Math.round(analytics.standing.rating) : '—'}</p>
                </div>
                <div className={styles.standingStatItem}>
                  <h4>Level</h4>
                  <p>{analytics?.standing?.level_name || 'Level 1'}</p>
                </div>
                <div className={styles.standingStatItem}>
                  <h4>Global Rank</h4>
                  <p>{analytics?.standing?.global_rank ? `#${analytics.standing.global_rank}` : '—'}</p>
                </div>
                <div className={styles.standingStatItem}>
                  <h4>Active Streak</h4>
                  <p>{analytics?.standing?.streak_days ?? 0} days</p>
                </div>
              </div>
            </div>

            {/* Public Showcase Toggle Card */}
            <div className={styles.sectionCard}>
              <div className={styles.cardHeader}>
                <div className={styles.cardHeaderLeft}>
                  <div className={styles.headerIconBox}><Globe size={18} /></div>
                  <div>
                    <h3 className={styles.cardTitle}>Public Showcase Profile</h3>
                    <p className={styles.cardSubtitle}>Share your badges, verified solved problems, and milestones with recruiters.</p>
                  </div>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={showcase?.profile_public ?? false}
                    onChange={async (e) => {
                      const on = e.target.checked;
                      try {
                        const res = await practiceExtraService.toggleShowcase(on);
                        setShowcase(res);
                      } catch { /* retain */ }
                    }}
                  />
                  <span className={styles.slider} />
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafc', padding: '12px 16px', borderRadius: 10 }}>
                <code style={{ fontSize: 13, color: '#334155', flex: 1 }}>
                  {typeof window !== 'undefined' ? window.location.origin : 'https://nexlab.io'}/u/{showcase?.profile_slug || 'platform-learner'}
                </code>
                <button
                  type="button"
                  className={styles.saveBtn}
                  style={{ margin: 0, padding: '7px 14px', fontSize: 12 }}
                  onClick={handleCopyShowcase}
                >
                  {copiedLink ? <CheckCheck size={14} /> : <Copy size={14} />}
                  {copiedLink ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
            </div>

            {/* Badges Collection */}
            <div className={styles.sectionCard}>
              <div className={styles.cardHeader}>
                <div className={styles.cardHeaderLeft}>
                  <div className={styles.headerIconBox}><Trophy size={18} /></div>
                  <div>
                    <h3 className={styles.cardTitle}>Badges &amp; Milestones</h3>
                    <p className={styles.cardSubtitle}>Achievements earned through algorithmic dedication and speed.</p>
                  </div>
                </div>
                <span className={styles.roleBadge}>
                  {earnedBadgeIds.length} of {BADGE_DEFS.length} Unlocked
                </span>
              </div>

              <div className={styles.badgesGrid}>
                {BADGE_DEFS.map((b) => {
                  const earned = earnedBadgeIds.includes(b.id);
                  const earnedAt = earnedBadgeDates[b.id];
                  return (
                    <div
                      key={b.id}
                      className={styles.badgeCard}
                      style={{ opacity: earned ? 1 : 0.6, background: earned ? '#ffffff' : '#fafafa' }}
                    >
                      <div className={styles.badgeIconBox}>{b.icon}</div>
                      <div>
                        <h4 className={styles.badgeTitle}>{b.title}</h4>
                        <p className={styles.badgeDesc}>{b.desc}</p>
                        <span className={styles.badgeEarnedDate} style={{ color: earned ? '#7c3aed' : '#9ca3af' }}>
                          {earned ? (earnedAt ? new Date(earnedAt).toLocaleDateString() : 'Earned') : 'Locked'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Verified Course Certificates */}
            <div className={styles.sectionCard}>
              <div className={styles.cardHeader}>
                <div className={styles.cardHeaderLeft}>
                  <div className={styles.headerIconBox}><FileText size={18} /></div>
                  <div>
                    <h3 className={styles.cardTitle}>Verified Certificates</h3>
                    <p className={styles.cardSubtitle}>Graduation credentials earned from completed interactive tracks.</p>
                  </div>
                </div>
              </div>

              <div className={styles.certList}>
                {courseCertificates.length === 0 && (
                  <p style={{ margin: 0, padding: '18px 4px', fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>
                    No certificates yet — complete a course to earn your first verified certificate.
                  </p>
                )}
                {courseCertificates.map((c) => (
                  <div key={c.certificate_id || c.course_id} className={styles.certCard}>
                    <div>
                      <h4 style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 700 }}>
                        {c.course_title || c.title || 'Course Certificate'}
                      </h4>
                      <p style={{ margin: '0 0 4px', fontSize: 11.5, color: '#6b7280' }}>
                        {c.completed_at ? `Completed ${new Date(c.completed_at).toLocaleDateString()}` : 'Completed'}
                      </p>
                      {c.certificate_id && <code style={{ fontSize: 10.5, color: '#7c3aed' }}>{c.certificate_id}</code>}
                    </div>
                    <button
                      type="button"
                      className={styles.certDownloadBtn}
                      onClick={() => window.open(c.download_url || `/api/platform-user/courses/${c.course_id}/certificate`, '_blank')}
                    >
                      <Download size={13} /> PDF
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            6. TAB CONTENT: ACTIVITY
            ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'Activity' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className={styles.sectionCard}>
              <div className={styles.cardHeader}>
                <div className={styles.cardHeaderLeft}>
                  <div className={styles.headerIconBox}><Clock size={18} /></div>
                  <div>
                    <h3 className={styles.cardTitle}>Full Submissions History</h3>
                    <p className={styles.cardSubtitle}>Complete log of your code submissions across problems.</p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  {(['all', 'solved', 'attempted'] as const).map((filterKey) => (
                    <button
                      key={filterKey}
                      type="button"
                      style={{
                        padding: '6px 14px',
                        borderRadius: 8,
                        fontSize: 12.5,
                        fontWeight: 600,
                        border: '1px solid #e5e7eb',
                        background: activityFilter === filterKey ? '#6366f1' : '#ffffff',
                        color: activityFilter === filterKey ? '#ffffff' : '#4b5563',
                        cursor: 'pointer'
                      }}
                      onClick={() => setActivityFilter(filterKey)}
                    >
                      {filterKey === 'all' ? 'All' : (filterKey === 'solved' ? 'Solved' : 'Attempted')}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.tableWrapper}>
                <table className={styles.fullSubmissionsTable}>
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Problem Title</th>
                      <th>Difficulty</th>
                      <th>Topic</th>
                      <th>Language</th>
                      <th>Test Cases</th>
                      <th>Runtime</th>
                      <th>XP</th>
                      <th>Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', padding: '36px 16px', color: '#9ca3af' }}>
                          No recent practice submissions found. Start solving problems in the Practice Library!
                        </td>
                      </tr>
                    ) : (
                      submissions
                        .filter((s) => {
                          if (activityFilter === 'solved') return s.is_solved;
                          if (activityFilter === 'attempted') return !s.is_solved;
                          return true;
                        })
                        .map((sub, i) => (
                          <tr key={sub.id || i}>
                            <td>
                              {sub.is_solved ? (
                                <span style={{ color: '#16a34a', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
                                  <CheckCircle2 size={15} /> Accepted
                                </span>
                              ) : (
                                <span style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
                                  <XCircle size={15} /> Attempted
                                </span>
                              )}
                            </td>
                            <td>
                              <a href={`/practice/library/${sub.slug || 'two-sum'}`} style={{ color: '#111827', fontWeight: 600, textDecoration: 'none' }}>
                                {sub.title}
                              </a>
                            </td>
                            <td>
                              <span className={`${styles.diffPill} ${
                                sub.difficulty?.toLowerCase() === 'easy' ? styles.diffEasy :
                                sub.difficulty?.toLowerCase() === 'medium' ? styles.diffMedium : styles.diffHard
                              }`}>
                                {sub.difficulty}
                              </span>
                            </td>
                            <td style={{ color: '#6b7280' }}>{sub.nexlab_topic || 'Algorithms'}</td>
                            <td style={{ textTransform: 'capitalize', fontWeight: 500 }}>{sub.language || 'python'}</td>
                            <td>{sub.passed ?? 0} / {sub.total ?? 0}</td>
                            <td style={{ color: '#6b7280' }}>{sub.time_ms ? `${sub.time_ms}ms` : '—'}</td>
                            <td style={{ fontWeight: 700, color: '#f59e0b' }}>+{sub.xp_earned ?? 0} XP</td>
                            <td style={{ color: '#9ca3af' }}>{formatTimeAgo(sub.submitted_at)}</td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            7. TAB CONTENT: PREFERENCES
            ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'Preferences' && (
          <div className={styles.sectionCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderLeft}>
                <div className={styles.headerIconBox}><Sliders size={18} /></div>
                <div>
                  <h3 className={styles.cardTitle}>Environment &amp; Learning Preferences</h3>
                  <p className={styles.cardSubtitle}>Customize your coding playground, AI assistant level, and alerts.</p>
                </div>
              </div>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Default Programming Language</label>
                <select
                  className={styles.formInput}
                  value={prefLang}
                  onChange={(e) => setPrefLang(e.target.value)}
                >
                  <option value="python">Python 3 (Recommended)</option>
                  <option value="cpp">C++ (GCC 12)</option>
                  <option value="java">Java (OpenJDK 17)</option>
                  <option value="javascript">JavaScript (Node.js 20)</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Code Editor Theme</label>
                <select
                  className={styles.formInput}
                  value={prefTheme}
                  onChange={(e) => setPrefTheme(e.target.value)}
                >
                  <option value="dark">NexLab Dark (Deep Indigo)</option>
                  <option value="light">Sleek Clean Light</option>
                  <option value="monokai">Monokai Pro</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Font Size</label>
                <select
                  className={styles.formInput}
                  value={prefFontSize}
                  onChange={(e) => setPrefFontSize(e.target.value)}
                >
                  <option value="13px">13px (Compact)</option>
                  <option value="14px">14px (Standard)</option>
                  <option value="16px">16px (Comfortable)</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>AI Hint Assistant Guidance</label>
                <select
                  className={styles.formInput}
                  value={prefAiLevel}
                  onChange={(e) => setPrefAiLevel(e.target.value)}
                >
                  <option value="socratic">Socratic (Conceptual hints only)</option>
                  <option value="balanced">Balanced (Step-by-step guidance)</option>
                  <option value="detailed">In-Depth (Code breakdown &amp; complexity)</option>
                </select>
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <div className={styles.toggleRow}>
                <div className={styles.toggleInfo}>
                  <h4>Daily Practice Reminders</h4>
                  <p>Receive an alert when the new Daily Challenge problem goes live at 00:00 UTC.</p>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={prefDailyNotif}
                    onChange={(e) => setPrefDailyNotif(e.target.checked)}
                  />
                  <span className={styles.slider} />
                </label>
              </div>

              <div className={styles.toggleRow}>
                <div className={styles.toggleInfo}>
                  <h4>Streak Protection Alerts</h4>
                  <p>Send an emergency email reminder if your streak is about to expire before midnight.</p>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={prefStreakNotif}
                    onChange={(e) => setPrefStreakNotif(e.target.checked)}
                  />
                  <span className={styles.slider} />
                </label>
              </div>
            </div>

            {prefSavedToast && (
              <div className={`${styles.alertBox} ${styles.alertSuccess}`}>
                <CheckCircle2 size={16} /> Preferences saved on this device.
              </div>
            )}

            <button
              type="button"
              className={styles.saveBtn}
              onClick={() => {
                try {
                  localStorage.setItem('nexlab_prefs', JSON.stringify({
                    daily_notif: prefDailyNotif,
                  }));
                } catch { /* storage unavailable */ }
                setPrefSavedToast(true);
                setTimeout(() => setPrefSavedToast(false), 2500);
              }}
            >
              <Save size={15} /> Save Preferences (this device)
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            8. TAB CONTENT: SECURITY
            ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'Security' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Change Password Card */}
            <div className={styles.sectionCard}>
              <div className={styles.cardHeader}>
                <div className={styles.cardHeaderLeft}>
                  <div className={styles.headerIconBox}><Lock size={18} /></div>
                  <div>
                    <h3 className={styles.cardTitle}>Change Password</h3>
                    <p className={styles.cardSubtitle}>Ensure your account is protected with a strong, distinct password.</p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleChangePassword}>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Current Password</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showCurrentPw ? 'text' : 'password'}
                        className={styles.formInput}
                        style={{ width: '100%' }}
                        value={currentPw}
                        onChange={(e) => setCurrentPw(e.target.value)}
                        placeholder="••••••••••••"
                        required
                      />
                      <button
                        type="button"
                        style={{ position: 'absolute', right: 12, top: 12, background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}
                        onClick={() => setShowCurrentPw(!showCurrentPw)}
                      >
                        {showCurrentPw ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>New Password</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showNewPw ? 'text' : 'password'}
                        className={styles.formInput}
                        style={{ width: '100%' }}
                        value={newPw}
                        onChange={(e) => setNewPw(e.target.value)}
                        placeholder="Min 8 chars"
                        required
                      />
                      <button
                        type="button"
                        style={{ position: 'absolute', right: 12, top: 12, background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}
                        onClick={() => setShowNewPw(!showNewPw)}
                      >
                        {showNewPw ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
                    <label className={styles.formLabel}>Confirm New Password</label>
                    <input
                      type="password"
                      className={styles.formInput}
                      value={confirmPw}
                      onChange={(e) => setConfirmPw(e.target.value)}
                      placeholder="Repeat new password"
                      required
                    />
                  </div>
                </div>

                {pwMsg && (
                  <div className={`${styles.alertBox} ${pwMsg.type === 'success' ? styles.alertSuccess : styles.alertError}`}>
                    {pwMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    {pwMsg.text}
                  </div>
                )}

                <button type="submit" className={styles.saveBtn} disabled={pwSaving}>
                  <Lock size={14} />
                  {pwSaving ? 'Updating…' : 'Update Password'}
                </button>
              </form>
            </div>

            {/* Two-Factor Authentication & Active Sessions */}
            <div className={styles.overviewBottomGrid}>
              <div className={styles.sectionCard}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardHeaderLeft}>
                    <div className={styles.headerIconBox}><ShieldCheck size={18} /></div>
                    <div>
                      <h3 className={styles.cardTitle}>Two-Factor Authentication</h3>
                      <p className={styles.cardSubtitle}>Require OTP verification for additional security.</p>
                    </div>
                  </div>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={twoFactorEnabled}
                      disabled={toggling2FA}
                      onChange={handleToggle2FA}
                    />
                    <span className={styles.slider} />
                  </label>
                </div>
                <p style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.5, margin: 0 }}>
                  Two-factor authentication adds an extra layer of protection by requiring your password and a verification code sent to your registered email during logins.
                </p>
                <div style={{ marginTop: 14 }}>
                  <span className={`${styles.roleBadge} ${twoFactorEnabled ? '' : ''}`}>
                    {twoFactorEnabled ? '🛡️ 2FA Currently Active' : '⚪ 2FA Disabled'}
                  </span>
                </div>
              </div>

              <div className={styles.sectionCard}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardHeaderLeft}>
                    <div className={styles.headerIconBox}><Laptop size={18} /></div>
                    <div>
                      <h3 className={styles.cardTitle}>Active Sessions</h3>
                      <p className={styles.cardSubtitle}>Devices currently authenticated with your token.</p>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: 10 }}>
                  <div>
                    <h4 style={{ margin: '0 0 2px', fontSize: 13.5, fontWeight: 700 }}>This device</h4>
                    <p style={{ margin: 0, fontSize: 11.5, color: '#6b7280' }}>Current session · Active Now</p>
                  </div>
                  <span className={styles.statDelta} style={{ background: '#dcfce7', color: '#16a34a' }}>
                    Current Device
                  </span>
                </div>

                <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    className={styles.certDownloadBtn}
                    style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' }}
                    onClick={handleExportData}
                  >
                    <Download size={13} /> Export My Account Data
                  </button>
                  <button
                    type="button"
                    className={styles.certDownloadBtn}
                    style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }}
                    onClick={async () => {
                      await authService.logout();
                      clearAuth();
                      router.push('/login');
                    }}
                  >
                    <LogOut size={13} /> Sign Out
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            9. TAB CONTENT: BILLING
            ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'Billing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className={styles.billingGrid}>
              {/* Current Plan */}
              <div className={`${styles.sectionCard} ${styles.planCardCurrent}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className={styles.roleBadge} style={{ background: '#6366f1', color: '#ffffff', border: 'none' }}>
                    Active Plan
                  </span>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>Free Forever</span>
                </div>
                <h3 style={{ fontSize: 22, fontWeight: 800, margin: '12px 0 0', color: '#111827' }}>NexLab Platform Tier</h3>
                <div className={styles.planPrice}>$0 <span style={{ fontSize: 14, fontWeight: 500, color: '#6b7280' }}>/ month</span></div>

                <ul className={styles.planFeatures}>
                  <li><Check size={16} color="#16a34a" /> Access to the curated algorithmic problem library</li>
                  <li><Check size={16} color="#16a34a" /> 10 Daily AI debugging calls</li>
                  <li><Check size={16} color="#16a34a" /> Public achievement profile &amp; showcase URL</li>
                  <li><Check size={16} color="#16a34a" /> Standard curated study plans &amp; daily streak</li>
                  <li><Check size={16} color="#16a34a" /> Interactive course modules &amp; simulations</li>
                </ul>

                <button
                  type="button"
                  style={{
                    padding: '10px 16px',
                    borderRadius: 10,
                    background: '#ede9fe',
                    color: '#6366f1',
                    border: 'none',
                    fontWeight: 700,
                    cursor: 'default',
                    marginTop: 'auto'
                  }}
                >
                  Current Membership
                </button>
              </div>

              {/* NexLab Pro Upgrade Card */}
              <div className={styles.sectionCard} style={{ background: 'linear-gradient(145deg, #ffffff 0%, #faf5ff 100%)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className={styles.roleBadge} style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' }}>
                    ⭐ Recommended
                  </span>
                  <span style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600 }}>Save 20% Annually</span>
                </div>
                <h3 style={{ fontSize: 22, fontWeight: 800, margin: '12px 0 0', color: '#111827' }}>NexLab Pro</h3>
                <div className={styles.planPrice}>$12 <span style={{ fontSize: 14, fontWeight: 500, color: '#6b7280' }}>/ month</span></div>

                <ul className={styles.planFeatures}>
                  <li><Check size={16} color="#6366f1" /> Unlimited 24/7 AI pair programming mentor</li>
                  <li><Check size={16} color="#6366f1" /> Full hidden test cases &amp; custom test case builder</li>
                  <li><Check size={16} color="#6366f1" /> Mock FAANG technical interview simulations</li>
                  <li><Check size={16} color="#6366f1" /> Dedicated low-latency cloud sandbox execution</li>
                  <li><Check size={16} color="#6366f1" /> Verified digital completion certificates with QR</li>
                </ul>

                <button
                  type="button"
                  className={styles.saveBtn}
                  disabled
                  title="Online checkout is coming soon."
                  style={{ width: '100%', justifyContent: 'center', marginTop: 'auto', opacity: 0.7, cursor: 'not-allowed' }}
                >
                  <Sparkles size={16} /> Upgrade to Pro — Coming Soon
                </button>
              </div>
            </div>

            {/* Billing Receipts & Payment Methods */}
            <div className={styles.sectionCard}>
              <div className={styles.cardHeader}>
                <div className={styles.cardHeaderLeft}>
                  <div className={styles.headerIconBox}><CreditCard size={18} /></div>
                  <div>
                    <h3 className={styles.cardTitle}>Invoices &amp; Receipts</h3>
                    <p className={styles.cardSubtitle}>Download your past billing records and receipts.</p>
                  </div>
                </div>
              </div>

              <div className={styles.tableWrapper}>
                <table className={styles.fullSubmissionsTable}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: '#9ca3af', padding: '18px 8px', fontSize: 13 }}>
                        No invoices yet — your account is on the free Platform tier.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            10. EDIT PROFILE MODAL DIALOG
            ══════════════════════════════════════════════════════════════════════ */}
        {isEditModalOpen && (
          <div className={styles.modalOverlay} onClick={() => setIsEditModalOpen(false)}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>Edit Profile Information</h3>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={() => setIsEditModalOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Full Name</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>About / Bio</label>
                  <textarea
                    className={styles.formTextarea}
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Phone Number</label>
                    <input
                      type="tel"
                      className={styles.formInput}
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Location</label>
                    <input
                      type="text"
                      className={styles.formInput}
                      value={editLocation}
                      onChange={(e) => setEditLocation(e.target.value)}
                      placeholder="e.g. Bengaluru, India or Global"
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Personal Website / Portfolio</label>
                  <input
                    type="url"
                    className={styles.formInput}
                    value={editWebsite}
                    onChange={(e) => setEditWebsite(e.target.value)}
                    placeholder="https://..."
                  />
                </div>

                {editMsg && (
                  <div className={`${styles.alertBox} ${editMsg.type === 'success' ? styles.alertSuccess : styles.alertError}`}>
                    {editMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    {editMsg.text}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                  <button
                    type="button"
                    style={{
                      padding: '10px 18px',
                      borderRadius: 10,
                      background: '#f1f5f9',
                      border: 'none',
                      color: '#475569',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                    onClick={() => setIsEditModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={styles.saveBtn}
                    style={{ margin: 0 }}
                    disabled={editSaving}
                  >
                    <Save size={15} />
                    {editSaving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </IndividualShell>
  );
}
