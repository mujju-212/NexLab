'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, BookOpen,
  Terminal, Upload, TrendingUp, Trophy, Clock,
  ShieldCheck, LogOut, ChevronRight, ChevronDown, User, Menu, GraduationCap, Code2,
  Library, Zap, Flame, BookMarked, FileClock, Megaphone
} from 'lucide-react';
import Image from 'next/image';
import styles from './StudentShell.module.css';
import { ShellNotifications, ShellSearchBox, type SearchHit } from './shell-widgets';
import { studentService } from '@/services/student.service';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth-store';

const NAV_STUDENT = [
  { id: 'Dashboard',          label: 'Dashboard',          Icon: LayoutDashboard, route: '/student/dashboard' },
  { id: 'Announcements',      label: 'Announcements',      Icon: Megaphone,       route: '/student/announcements' },
  { id: 'My Subjects',        label: 'My Subjects',        Icon: BookOpen,        route: '/student/subjects' },
  { id: 'Exams',              label: 'My Exams',           Icon: FileClock,       route: '/student/exams' },
  { id: 'Compiler',           label: 'Compiler',           Icon: Code2,           route: '/student/compiler' },
  { id: 'Live Coding Lab',    label: 'Live Coding Lab',    Icon: Terminal,        route: '/student/live-lab' },
];

const NAV_PRACTICE = [
  { id: 'Practice Library',   label: 'Practice Library',   Icon: Library,         route: '/student/practice' },
  { id: 'Courses',            label: 'Courses',            Icon: GraduationCap,   route: '/student/courses' },
  { id: 'Study Plans',        label: 'Study Plans',        Icon: BookMarked,      route: '/student/practice/study-plans' },
  { id: 'Daily Challenge',    label: 'Daily Challenge',    Icon: Flame,           route: '/student/practice/daily' },
  { id: 'Quests',             label: 'Quests',             Icon: Zap,             route: '/student/practice/quest' },
];

const NAV_MORE = [
  { id: 'Submissions',                  label: 'Submissions',                  Icon: Upload,      route: '/student/submissions' },
  { id: 'Performance Analytics',        label: 'Performance Analytics',        Icon: TrendingUp,  route: '/student/analytics' },
  { id: 'Leaderboard',                  label: 'Leaderboard',                  Icon: Trophy,      route: '/student/rankings' },
  { id: 'Experiment History',           label: 'Experiment History',           Icon: Clock,       route: '/student/submissions' },
  { id: 'Certificates & Notifications', label: 'Certificates & Notifications', Icon: ShieldCheck, route: '/student/certificates' },
];

interface StudentShellProps {
  activePage: string;
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export default function StudentShell({ activePage, children, title, subtitle }: StudentShellProps) {
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Background idle warming — prefetch primary student routes so transitions are instant
  useEffect(() => {
    const primaryRoutes = [
      '/student/dashboard',
      '/student/subjects',
      '/student/exams',
      '/student/compiler',
      '/student/live-lab',
      '/student/practice',
      '/student/courses',
    ];
    primaryRoutes.forEach((route) => {
      try {
        router.prefetch(route);
      } catch {
        /* noop */
      }
    });
  }, [router]);

  const handleLogout = async () => {
    setDrawerOpen(false);
    await authService.logout();
    clearAuth();
    router.push('/login');
  };

  const isItemActive = (id: string) => {
    if (id === activePage) return true;
    if (id === 'Dashboard' && (activePage === 'Dashboard' || activePage === 'Dashboard Home')) return true;
    if (id === 'Exams' && (activePage === 'Exams' || activePage === 'My Exams')) return true;
    if (id === 'Submissions' && (activePage === 'Submission' || activePage === 'Submissions')) return true;
    if (id === 'Leaderboard' && (activePage === 'Ranking' || activePage === 'Leaderboard')) return true;
    if (id === 'Quests' && activePage === 'Quest') return true;
    return false;
  };

  const navCls = (id: string, isLogout = false) =>
    [
      styles.navItem,
      isItemActive(id) ? styles.navItemActive : '',
      isLogout ? styles.navItemLogout : ''
    ].filter(Boolean).join(' ');

  const initials = user?.full_name
    ? user.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'TS';

  return (
    <div className={styles.stage}>
      <div className={`${styles.blob} ${styles.blob1}`} />
      <div className={`${styles.blob} ${styles.blob2}`} />
      <div className={`${styles.blob} ${styles.blob3}`} />
      <div className={styles.sheen} />

      <div className={styles.appPanel}>

        {/* ══ SIDEBAR ══ */}
        <aside className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ''} ${drawerOpen ? styles.sidebarDrawerOpen : ''}`}>
          <div className={styles.sidebarTop}>
            <Link href="/student/dashboard" prefetch={true} className={styles.logo} onClick={() => setDrawerOpen(false)}>
              <Image src="/logo.png" alt="NexLab" width={collapsed ? 48 : 100} height={collapsed ? 34 : 64} style={{ objectFit: 'contain' }} priority />
            </Link>
            <button className={styles.collapseBtn} onClick={() => setCollapsed(p => !p)} title="Toggle Sidebar">
              <Menu size={17} strokeWidth={2} />
            </button>
          </div>

          {/* Section: STUDENT */}
          <nav className={styles.navGroup}>
            <span className={styles.navLabel}>Student</span>
            <ul>
              {NAV_STUDENT.map(({ id, label, Icon, route }) => (
                <li key={id}>
                  <Link
                    href={route}
                    prefetch={true}
                    className={navCls(id)}
                    title={label}
                    onClick={() => setDrawerOpen(false)}
                    onMouseEnter={() => { try { router.prefetch(route); } catch {} }}
                  >
                    <Icon size={17} strokeWidth={isItemActive(id) ? 2.2 : 1.9} className={styles.navIcon} />
                    <span className={styles.label}>{label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Section: PRACTICE */}
          <nav className={styles.navGroup}>
            <span className={styles.navLabel}>Practice</span>
            <ul>
              {NAV_PRACTICE.map(({ id, label, Icon, route }) => (
                <li key={id}>
                  <Link
                    href={route}
                    prefetch={true}
                    className={navCls(id)}
                    title={label}
                    onClick={() => setDrawerOpen(false)}
                    onMouseEnter={() => { try { router.prefetch(route); } catch {} }}
                  >
                    <Icon size={17} strokeWidth={isItemActive(id) ? 2.2 : 1.9} className={styles.navIcon} />
                    <span className={styles.label}>{label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Section: MORE */}
          <nav className={styles.navGroup}>
            <span className={styles.navLabel}>More</span>
            <ul>
              {NAV_MORE.map(({ id, label, Icon, route }) => (
                <li key={id}>
                  <Link
                    href={route}
                    prefetch={true}
                    className={navCls(id)}
                    title={label}
                    onClick={() => setDrawerOpen(false)}
                    onMouseEnter={() => { try { router.prefetch(route); } catch {} }}
                  >
                    <Icon size={17} strokeWidth={isItemActive(id) ? 2.2 : 1.9} className={styles.navIcon} />
                    <span className={styles.label}>{label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Account Profile & Logout */}
          <div className={`${styles.navGroup} ${styles.bottomGroup}`}>
            <ul>
              <li>
                <Link
                  href="/student/profile"
                  prefetch={true}
                  className={navCls('Profile')}
                  title="Profile"
                  onClick={() => setDrawerOpen(false)}
                  onMouseEnter={() => { try { router.prefetch('/student/profile'); } catch {} }}
                >
                  <User size={17} strokeWidth={1.9} className={styles.navIcon} />
                  <span className={styles.label}>Profile</span>
                </Link>
              </li>
              <li>
                <div
                  className={navCls('Logout', true)}
                  title="Logout"
                  onClick={handleLogout}
                  role="button"
                  tabIndex={0}
                >
                  <LogOut size={17} strokeWidth={1.9} className={styles.navIcon} />
                  <span className={styles.label}>Logout</span>
                </div>
              </li>
            </ul>
          </div>

          {/* Promo Card: Keep Learning Go Further */}
          <div className={styles.promoBanner} onClick={() => router.push('/student/practice')}>
            <div className={styles.promoCube}>
              <Image src="/icon_cube_3d.jpg" alt="Learn" width={38} height={38} className={styles.promoCubeImg} />
            </div>
            <div className={styles.promoText}>
              <p className={styles.promoTitle}>Keep Learning</p>
              <p className={styles.promoSub}>Go Further</p>
              <p className={styles.promoDesc}>Practice. Experiment. Build your future.</p>
            </div>
            <div className={styles.promoArrowBtn}>
              <ChevronRight size={14} strokeWidth={2.5} />
            </div>
          </div>
        </aside>

        {/* mobile drawer backdrop */}
        {drawerOpen && <div className={styles.drawerBackdrop} onClick={() => setDrawerOpen(false)} />}

        {/* ══ MAIN ══ */}
        <main className={styles.content}>
          <div className={styles.contentHeader}>
            <button className={styles.mobileMenuBtn} onClick={() => setDrawerOpen(true)} aria-label="Open menu">
              <Menu size={17} strokeWidth={2} />
            </button>
            <div className={styles.headerLeft}>
              <ShellSearchBox
                className={styles.searchBar}
                placeholder="Search subjects, experiments, or sessions..."
                fetcher={(q) => studentService.search(q)}
                onSelect={(hit: SearchHit) => router.push(hit.link ?? '/student/practice')}
              />
            </div>
            <div className={styles.headerRight}>
              <ShellNotifications buttonClass={styles.iconBtn} dotClass={styles.notifDot} />
              <div className={styles.profileChip} onClick={() => router.push('/student/profile')} title="My Profile">
                <div className={styles.avatarLg}>
                  {initials}
                </div>
                <span className={styles.profileName}>{user?.full_name ?? 'Test Student'}</span>
                <ChevronDown size={14} className={styles.profileChevron} />
              </div>
            </div>
          </div>

          {title && (
            <div className={styles.pageHero}>
              <h1 className={styles.pageTitle}>{title}</h1>
              {subtitle && <p className={styles.pageSubtitle}>{subtitle}</p>}
            </div>
          )}

          {children}
        </main>
      </div>
    </div>
  );
}
