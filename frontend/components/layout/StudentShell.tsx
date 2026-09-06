'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, BookOpen, FlaskConical, LogIn,
  Terminal, Upload, TrendingUp, Trophy, Clock, RotateCcw,
  ShieldCheck, Settings, LogOut, Bell, Search, MessageCircle,
  ChevronRight, User, Menu, GraduationCap, Code2,
  Library, Zap, Flame, BookMarked, FileClock
} from 'lucide-react';
import Image from 'next/image';
import styles from './StudentShell.module.css';
import { ShellNotifications, ShellSearchBox, type SearchHit } from './shell-widgets';
import { studentService } from '@/services/student.service';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth-store';

const NAV_FAVORITES = [
  { id: 'Dashboard Home',     Icon: LayoutDashboard, route: '/student/dashboard'         },
  { id: 'My Subjects',        Icon: BookOpen,         route: '/student/subjects'          },
  { id: 'Compiler',           Icon: Code2,            route: '/student/compiler'          },
  { id: 'Live Coding Lab',    Icon: Terminal,         route: '/student/live-lab'          },
];
const NAV_PRACTICE = [
  { id: 'Practice Library',   Icon: Library,          route: '/student/practice'          },
  { id: 'Courses',            Icon: GraduationCap,    route: '/student/courses'           },
  { id: 'Study Plans',        Icon: BookMarked,        route: '/student/practice/study-plans' },
  { id: 'Daily Challenge',    Icon: Flame,             route: '/student/practice/daily'   },
  { id: 'Quest',              Icon: Zap,               route: '/student/practice/quest'   },
];
const NAV_MAIN = [
  { id: 'Exams',                        Icon: FileClock,   route: '/student/exams'         },
  { id: 'Submission',                   Icon: Upload,      route: '/student/submissions'   },
  { id: 'Performance Analytics',        Icon: TrendingUp,  route: '/student/analytics'     },
  { id: 'Ranking',                      Icon: Trophy,      route: '/student/rankings'      },
  { id: 'Experiment History',           Icon: Clock,       route: '/student/submissions'   },
  { id: 'Catch-Up Mode',                Icon: RotateCcw,   route: '/student/pre-lab'       },
  { id: 'Certificates & Notifications', Icon: ShieldCheck, route: '/student/certificates'  },
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

  const navCls = (id: string, isLogout = false) =>
    [styles.navItem, id === activePage ? styles.navItemActive : '', isLogout ? styles.navItemLogout : '']
      .filter(Boolean).join(' ');

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
              <Image src="/logo.png" alt="NexLab" width={collapsed ? 54 : 105} height={collapsed ? 36 : 70} style={{ objectFit: 'contain' }} priority />
            </Link>
            <button className={styles.collapseBtn} onClick={() => setCollapsed(p => !p)} title="Collapse">
              <Menu size={16} strokeWidth={2} />
            </button>
          </div>

          <nav className={styles.navGroup}>
            <span className={styles.navLabel}>Favorites</span>
            <ul>
              {NAV_FAVORITES.map(({ id, Icon, route }) => (
                <li key={id}>
                  <Link
                    href={route}
                    prefetch={true}
                    className={navCls(id)}
                    title={id}
                    onClick={() => setDrawerOpen(false)}
                    onMouseEnter={() => { try { router.prefetch(route); } catch {} }}
                  >
                    <Icon size={17} strokeWidth={1.9} className={styles.navIcon} />
                    <span className={styles.label}>{id}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav className={styles.navGroup}>
            <span className={styles.navLabel}>Practice</span>
            <ul>
              {NAV_PRACTICE.map(({ id, Icon, route }) => (
                <li key={id}>
                  <Link
                    href={route}
                    prefetch={true}
                    className={navCls(id)}
                    title={id}
                    onClick={() => setDrawerOpen(false)}
                    onMouseEnter={() => { try { router.prefetch(route); } catch {} }}
                  >
                    <Icon size={17} strokeWidth={1.9} className={styles.navIcon} />
                    <span className={styles.label}>{id}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav className={styles.navGroup}>
            <span className={styles.navLabel}>Main Menu</span>
            <ul>
              {NAV_MAIN.map(({ id, Icon, route }) => (
                <li key={id}>
                  <Link
                    href={route}
                    prefetch={true}
                    className={navCls(id)}
                    title={id}
                    onClick={() => setDrawerOpen(false)}
                    onMouseEnter={() => { try { router.prefetch(route); } catch {} }}
                  >
                    <Icon size={17} strokeWidth={1.9} className={styles.navIcon} />
                    <span className={styles.label}>{id}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

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

          <div className={styles.promoBanner}>
            <div className={styles.promoIcon}><MessageCircle size={16} strokeWidth={1.9} /></div>
            <div className={styles.promoText}>
              <p className={styles.promoTitle}>Stuck on a doubt?</p>
              <Link href="/student/live-lab" prefetch={true} className={styles.promoLink} onClick={() => setDrawerOpen(false)}>Ask AI Tutor</Link>
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
            <div className={styles.breadcrumb}>
              Student <ChevronRight size={14} className={styles.breadSep} /> <strong>{activePage}</strong>
            </div>
            <div className={styles.headerRight}>
              <ShellSearchBox
                className={styles.searchBar}
                placeholder="Search sessions, problems…"
                fetcher={(q) => studentService.search(q)}
                onSelect={(hit: SearchHit) => router.push(hit.link ?? '/student/practice')}
              />
              <ShellNotifications buttonClass={styles.iconBtn} dotClass={styles.notifDot} />
              <div className={styles.profileChip} onClick={() => router.push('/student/profile')}>
                <div className={styles.avatarLg} style={{ background: '#9333ea' }}>
                  {user?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? 'ST'}
                </div>
                <span>{user?.full_name?.split(' ')[0] ?? 'Student'}</span>
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
