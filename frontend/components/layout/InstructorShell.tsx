'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, FlaskConical, PlayCircle, Radio,
  ClipboardCheck, BarChart3,
  Bell, Search, ChevronRight, LogOut, Settings, User, Menu,
  FileText, Crown, ArrowRight,
  ClipboardList, RotateCcw, HeartHandshake, Star
} from 'lucide-react';
import Image from 'next/image';
import styles from './InstructorShell.module.css';
import { ShellNotifications, ShellSearchBox, type SearchHit } from './shell-widgets';
import { experienceService } from '@/services/experience.service';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth-store';

const NAV_MAIN = [
  { id: 'Dashboard',       label: 'Dashboard',       Icon: LayoutDashboard, route: '/instructor/dashboard' },
  { id: 'Experiments',     label: 'Experiments',     Icon: FlaskConical,    route: '/instructor/experiments' },
  { id: 'Sessions',        label: 'Sessions',        Icon: PlayCircle,      route: '/instructor/sessions' },
  { id: 'Live Conductor',  label: 'Live Conductor',  Icon: Radio,           route: '/instructor/live-lab' },
  { id: 'Grading',         label: 'Grading',         Icon: ClipboardCheck,  route: '/instructor/grading' },
  { id: 'Analytics',       label: 'Analytics',       Icon: BarChart3,       route: '/instructor/analytics' },
];

const NAV_TEACHING = [
  { id: 'Exams',            label: 'Exams',            Icon: ClipboardList,   route: '/instructor/exams' },
  { id: 'Catch-Up Reviews', label: 'Catch-Up Reviews', Icon: RotateCcw,       route: '/instructor/catch-up' },
  { id: 'Management',       label: 'Class Management', Icon: HeartHandshake,  route: '/instructor/management' },
];

const NAV_MORE = [
  { id: 'Feedback', label: 'Student Feedback', Icon: Star,     route: '/instructor/feedback' },
  { id: 'Reports',  label: 'Reports',          Icon: FileText, route: '/instructor/reports' },
  { id: 'Settings', label: 'Settings',         Icon: Settings, route: '/instructor/settings' },
];

interface InstructorShellProps {
  activePage: string;
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  noScroll?: boolean;
}

export default function InstructorShell({ activePage, children, title, subtitle, noScroll }: InstructorShellProps) {
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const primaryRoutes = [
      '/instructor/dashboard',
      '/instructor/experiments',
      '/instructor/sessions',
      '/instructor/live-lab',
      '/instructor/students',
      '/instructor/grading',
      '/instructor/analytics',
      '/instructor/exams',
      '/instructor/feedback',
      '/instructor/viva',
      '/instructor/catch-up',
      '/instructor/management',
      '/instructor/reports',
      '/instructor/settings',
    ];
    primaryRoutes.forEach((route) => {
      try {
        router.prefetch(route);
      } catch {
        /* noop */
      }
    });
  }, [router]);

  const go = useCallback(async (id: string, route: string) => {
    setDrawerOpen(false);
    if (id === 'Logout') {
      await authService.logout();
      clearAuth();
      router.push('/login');
      return;
    }
    router.push(route);
  }, [router, clearAuth]);

  const isItemActive = (id: string) => {
    if (id === activePage) return true;
    if (id === 'Dashboard' && (activePage === 'Dashboard' || activePage === 'Dashboard Home')) return true;
    if (id === 'Exams' && (activePage === 'Exams' || activePage === 'Exam Management')) return true;
    if (id === 'Feedback' && (activePage === 'Feedback' || activePage === 'Student Feedback')) return true;
    if (id === 'Catch-Up Reviews' && (activePage === 'Catch-Up' || activePage === 'Catch-Up Reviews')) return true;
    if (id === 'Management' && (activePage === 'Management' || activePage === 'Class Management')) return true;
    if (id === 'Students' && (activePage === 'Students' || activePage === 'Student Management')) return true;
    return false;
  };

  const navCls = useCallback((id: string, isLogout = false) =>
    [styles.navItem, isItemActive(id) ? styles.navItemActive : '', isLogout ? styles.navItemLogout : '']
      .filter(Boolean).join(' '),
  [activePage]);

  const initials = useMemo(
    () => user?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? 'DI',
    [user?.full_name],
  );
  const fullName = user?.full_name || 'Dr. Priya Sharma';

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
            <div className={styles.brandRow} onClick={() => router.push('/instructor/dashboard')}>
              <Image src="/logo.png" alt="NexLab" width={collapsed ? 42 : 88} height={collapsed ? 28 : 56} style={{ objectFit: 'contain' }} priority />
              {!collapsed && <span className={styles.roleBadge}>Instructor</span>}
            </div>
            <button className={styles.collapseBtn} onClick={() => setCollapsed(p => !p)} title="Toggle Sidebar">
              <Menu size={16} strokeWidth={2} />
            </button>
          </div>

          <nav className={styles.navGroup}>
            <span className={styles.navLabel}>MAIN</span>
            <ul>
              {NAV_MAIN.map(({ id, label, Icon, route }) => (
                <li key={id} className={navCls(id)} title={label} onClick={() => go(id, route)}>
                  <Icon size={17} strokeWidth={1.9} className={styles.navIcon} />
                  <span className={styles.label}>{label}</span>
                </li>
              ))}
            </ul>
          </nav>

          <nav className={styles.navGroup}>
            <span className={styles.navLabel}>TEACHING & MANAGEMENT</span>
            <ul>
              {NAV_TEACHING.map(({ id, label, Icon, route }) => (
                <li key={id} className={navCls(id)} title={label} onClick={() => go(id, route)}>
                  <Icon size={17} strokeWidth={1.9} className={styles.navIcon} />
                  <span className={styles.label}>{label}</span>
                </li>
              ))}
            </ul>
          </nav>

          <nav className={styles.navGroup}>
            <span className={styles.navLabel}>MORE</span>
            <ul>
              {NAV_MORE.map(({ id, label, Icon, route }) => (
                <li key={id} className={navCls(id)} title={label} onClick={() => go(id, route)}>
                  <Icon size={17} strokeWidth={1.9} className={styles.navIcon} />
                  <span className={styles.label}>{label}</span>
                </li>
              ))}
            </ul>
          </nav>

          {/* NexLab Pro bottom promo card */}
          <div className={styles.nexlabProCard} onClick={() => router.push('/instructor/management')}>
            <div className={styles.proCardLeft}>
              <div className={styles.crownIcon}>
                <Crown size={16} color="#f59e0b" fill="#f59e0b" />
              </div>
              <div className={styles.proText}>
                <p className={styles.proTitle}>NexLab Pro</p>
                <p className={styles.proSub}>Empowering hands-on learning</p>
              </div>
            </div>
            <button className={styles.proArrowBtn} aria-label="Learn more about NexLab Pro">
              <ArrowRight size={13} color="#fff" />
            </button>
          </div>
        </aside>

        {/* mobile drawer backdrop */}
        {drawerOpen && <div className={styles.drawerBackdrop} onClick={() => setDrawerOpen(false)} />}

        {/* ══ MAIN ══ */}
        <main className={styles.content} style={noScroll ? { overflow: 'hidden', display: 'flex', flexDirection: 'column' } : undefined}>
          
          {/* Top Header */}
          <div className={styles.contentHeader}>
            <button className={styles.mobileMenuBtn} onClick={() => setDrawerOpen(true)} aria-label="Open menu">
              <Menu size={17} strokeWidth={2} />
            </button>

            {/* Global Search Bar with Ctrl K */}
            <div className={styles.headerSearchWrap}>
              <ShellSearchBox
                className={styles.searchBar}
                placeholder="Search students, experiments, sessions, or reports..."
                fetcher={(q) => experienceService.instructorSearch(q)}
                onSelect={(hit: SearchHit) => router.push(hit.link ?? '/instructor/analytics?tab=students')}
              />
            </div>

            {/* Header Right Actions */}
            <div className={styles.headerRight}>
              <ShellNotifications buttonClass={styles.iconBtn} dotClass={styles.notifDot} />
              
              <div className={styles.profileChip} onClick={() => router.push('/instructor/profile')}>
                <div className={styles.avatarLg} suppressHydrationWarning>
                  {initials}
                </div>
                <div className={styles.profileText}>
                  <span className={styles.userName} suppressHydrationWarning>{fullName}</span>
                  <span className={styles.userRole}>Instructor</span>
                </div>
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
