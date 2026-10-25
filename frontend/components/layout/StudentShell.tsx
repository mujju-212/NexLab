'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, BookOpen,
  Terminal, Upload, TrendingUp, Trophy, Clock,
  ShieldCheck, LogOut, ChevronRight, ChevronDown, User, Menu, GraduationCap, Code2,
  Library, Zap, Flame, BookMarked, FileClock, Megaphone, Search, X
} from 'lucide-react';
import Image from 'next/image';
import styles from './StudentShell.module.css';
import ImpersonationBanner from '@/components/shared/ImpersonationBanner';
import { ShellNotifications, ShellSearchBox, ShellProfileMenu, type SearchHit } from './shell-widgets';
import AgentChatPanel from './AgentChatPanel';
import { AppToaster } from '@/components/ui/toast';
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
  { id: 'Performance Analytics', label: 'Performance Analytics', Icon: TrendingUp,  route: '/student/analytics' },
  { id: 'Leaderboard',           label: 'Leaderboard',           Icon: Trophy,      route: '/student/rankings' },
  { id: 'Certificates & Records', label: 'Certificates & Records', Icon: ShieldCheck, route: '/student/certificates' },
];

// Mobile bottom navigation tabs (5 primary destinations)
const MOBILE_BOTTOM_TABS = [
  { id: 'Dashboard', label: 'Home',     Icon: LayoutDashboard, route: '/student/dashboard', match: '/student/dashboard' },
  { id: 'Subjects',  label: 'Subjects', Icon: BookOpen,        route: '/student/subjects',  match: '/student/subjects' },
  { id: 'Practice',  label: 'Practice', Icon: Library,         route: '/student/practice',  match: '/student/practice' },
  { id: 'Exams',     label: 'Exams',    Icon: FileClock,       route: '/student/exams',     match: '/student/exams' },
  { id: 'More',      label: 'More',     Icon: Menu,            route: '/student/more',      match: '/student/more' },
];

interface StudentShellProps {
  activePage: string;
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  chrome?: boolean; // default true, false for immersive fullscreen lab sessions
}

export default function StudentShell({ activePage, children, title, subtitle, chrome = true }: StudentShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, clearAuth } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

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
      '/student/more',
    ];
    primaryRoutes.forEach((route) => {
      try {
        router.prefetch(route);
      } catch {
        /* noop */
      }
    });
  }, [router]);

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
    setMobileSearchOpen(false);
  }, [pathname]);

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
    if (id === 'Certificates & Records' && (activePage === 'Certificates' || activePage === 'Certificates & Records' || activePage === 'Certificates & Notifications')) return true;
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

  // Check which mobile bottom tab is active
  const isMobileTabActive = (tab: typeof MOBILE_BOTTOM_TABS[0]) => {
    if (pathname === tab.route || pathname?.startsWith(tab.match)) return true;
    if (tab.id === 'Dashboard' && (activePage === 'Dashboard' || pathname === '/student')) return true;
    if (tab.id === 'Subjects' && (activePage === 'My Subjects' || activePage === 'Subjects')) return true;
    if (tab.id === 'Practice' && (activePage === 'Practice Library' || activePage === 'Practice' || pathname?.includes('/student/practice'))) return true;
    if (tab.id === 'Exams' && (activePage === 'Exams' || activePage === 'My Exams' || pathname?.includes('/student/exams'))) return true;
    if (tab.id === 'More' && (activePage === 'More' || pathname?.includes('/student/more'))) return true;
    return false;
  };

  return (
    <div className={styles.stage}>
      <ImpersonationBanner />
      <div className={`${styles.blob} ${styles.blob1}`} />
      <div className={`${styles.blob} ${styles.blob2}`} />
      <div className={`${styles.blob} ${styles.blob3}`} />
      <div className={styles.sheen} />

      <div className={chrome ? styles.appPanel : styles.appPanelImmersive}>

        {/* ══ SIDEBAR (Desktop sidebar & Mobile slide-out drawer) ══ */}
        {chrome && (
          <aside
            className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ''} ${drawerOpen ? styles.sidebarDrawerOpen : ''}`}
            aria-label="Student Navigation"
          >
            <div className={styles.sidebarTop}>
              <Link href="/student/dashboard" prefetch={true} className={styles.logo} onClick={() => setDrawerOpen(false)}>
                <Image
                  src="/logo.png"
                  alt="NexLab"
                  width={collapsed ? 48 : 100}
                  height={collapsed ? 34 : 64}
                  style={{ objectFit: 'contain' }}
                  priority
                />
              </Link>
              <div className={styles.sidebarTopActions}>
                <button
                  type="button"
                  className={styles.collapseBtn}
                  onClick={() => setCollapsed(p => !p)}
                  title="Toggle Sidebar"
                  aria-label="Toggle Sidebar"
                >
                  <Menu size={17} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className={styles.drawerCloseBtn}
                  onClick={() => setDrawerOpen(false)}
                  title="Close Menu"
                  aria-label="Close Menu"
                >
                  <X size={18} strokeWidth={2.2} />
                </button>
              </div>
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
        )}

        {/* mobile drawer backdrop */}
        {drawerOpen && <div className={styles.drawerBackdrop} onClick={() => setDrawerOpen(false)} />}

        {/* ══ MAIN VIEW AREA ══ */}
        <main className={chrome ? styles.content : styles.contentImmersive}>
          {chrome && (
            <div className={styles.contentHeader}>
              <div className={styles.headerLeftMobile}>
                <button
                  type="button"
                  className={styles.mobileMenuBtn}
                  onClick={() => setDrawerOpen(true)}
                  aria-label="Open navigation drawer"
                >
                  <Menu size={18} strokeWidth={2.2} />
                </button>
                <Link href="/student/dashboard" className={styles.mobileBrandLogo}>
                  <Image src="/logo.png" alt="NexLab" width={76} height={28} style={{ objectFit: 'contain' }} priority />
                </Link>
              </div>

              {/* Desktop Global Search Bar */}
              <div className={styles.headerLeftDesktop}>
                <ShellSearchBox
                  className={styles.searchBar}
                  placeholder="Search subjects, experiments, or sessions..."
                  fetcher={(q) => studentService.search(q)}
                  onSelect={(hit: SearchHit) => router.push(hit.link ?? '/student/practice')}
                />
              </div>

              {/* Header Right Actions */}
              <div className={styles.headerRight}>
                {/* Mobile Search Trigger Icon */}
                <button
                  type="button"
                  className={`${styles.iconBtn} ${styles.mobileSearchTrigger}`}
                  onClick={() => setMobileSearchOpen(p => !p)}
                  aria-label="Search"
                  title="Search"
                >
                  <Search size={17} strokeWidth={2.2} />
                </button>

                <ShellNotifications buttonClass={styles.iconBtn} dotClass={styles.notifDot} role="student" />

                <ShellProfileMenu
                  name={user?.full_name ?? 'Student'}
                  email={user?.email}
                  initials={initials}
                  roleLabel="Student"
                  profileHref="/student/profile"
                  buttonClass={styles.profileChip}
                  avatarClass={styles.avatarLg}
                  onSignOut={handleLogout}
                />
              </div>
            </div>
          )}

          {/* Mobile Search Drawer (collapsible underneath top bar) */}
          {chrome && mobileSearchOpen && (
            <div className={styles.mobileSearchDrawer}>
              <ShellSearchBox
                className={styles.searchBar}
                placeholder="Search subjects, experiments, sessions..."
                fetcher={(q) => studentService.search(q)}
                onSelect={(hit: SearchHit) => {
                  setMobileSearchOpen(false);
                  router.push(hit.link ?? '/student/dashboard');
                }}
              />
            </div>
          )}

          {title && (
            <div className={styles.pageHero}>
              <h1 className={styles.pageTitle}>{title}</h1>
              {subtitle && <p className={styles.pageSubtitle}>{subtitle}</p>}
            </div>
          )}

          <div className={styles.pageScrollArea}>
            {children}
          </div>
        </main>

        {/* ══ MOBILE BOTTOM TAB BAR (visible on <860px screens) ══ */}
        {chrome && (
          <nav className={styles.tabBar} aria-label="Mobile Navigation">
            {MOBILE_BOTTOM_TABS.map((tab) => {
              const active = isMobileTabActive(tab);
              const { id, label, Icon, route } = tab;
              return (
                <Link
                  key={id}
                  href={route}
                  prefetch={true}
                  className={`${styles.tabItem} ${active ? styles.tabItemActive : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className={styles.tabIconWrap}>
                    <Icon size={20} strokeWidth={active ? 2.4 : 1.9} />
                    {active && <span className={styles.tabDot} />}
                  </span>
                  <span className={styles.tabLabel}>{label}</span>
                </Link>
              );
            })}
          </nav>
        )}
      </div>

      <AppToaster />
      <AgentChatPanel roleOverride="student" pageContext={{ page_title: title || activePage }} />
    </div>
  );
}
