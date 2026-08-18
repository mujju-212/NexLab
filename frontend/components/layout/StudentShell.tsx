'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard, BookOpen, FlaskConical, LogIn,
  Terminal, Upload, TrendingUp, Trophy, Clock, RotateCcw,
  ShieldCheck, Settings, LogOut, Bell, Search, MessageCircle,
  ChevronRight, User, Menu, GraduationCap, Code2,
  Library, Zap, Flame, BookMarked
} from 'lucide-react';
import Image from 'next/image';
import styles from './StudentShell.module.css';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth-store';

const NAV_FAVORITES = [
  { id: 'Dashboard Home',     Icon: LayoutDashboard, route: '/student/dashboard'         },
  { id: 'My Subjects',        Icon: BookOpen,         route: '/student/subjects'          },
  { id: 'Courses',            Icon: GraduationCap,    route: '/student/courses'           },
  { id: 'Practice Library',   Icon: Library,          route: '/student/practice'          },
  { id: 'Compiler',           Icon: Code2,            route: '/student/compiler'          },
  { id: 'Pre-Lab',            Icon: FlaskConical,     route: '/student/pre-lab'           },
  { id: 'Join Lab',           Icon: LogIn,            route: '/student/live-lab'          },
];
const NAV_PRACTICE = [
  { id: 'Practice Library',   Icon: Library,          route: '/student/practice'          },
  { id: 'Study Plans',        Icon: BookMarked,        route: '/student/practice/study-plans' },
  { id: 'Daily Challenge',    Icon: Flame,             route: '/student/practice/daily'   },
  { id: 'Quest',              Icon: Zap,               route: '/student/practice/quest'   },
];
const NAV_MAIN = [
  { id: 'Live Coding Lab',              Icon: Terminal,    route: '/student/live-lab'      },
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

  const go = async (id: string, route: string) => {
    setDrawerOpen(false); // close mobile drawer on navigation
    if (id === 'Logout') {
      await authService.logout();
      clearAuth();
      router.push('/login');
      return;
    }
    router.push(route);
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
            <div className={styles.logo} onClick={() => router.push('/student/dashboard')}>
              <Image src="/logo.png" alt="NexLab" width={collapsed ? 54 : 105} height={collapsed ? 36 : 70} style={{ objectFit: 'contain' }} priority />
            </div>
            <button className={styles.collapseBtn} onClick={() => setCollapsed(p => !p)} title="Collapse">
              <Menu size={16} strokeWidth={2} />
            </button>
          </div>

          <nav className={styles.navGroup}>
            <span className={styles.navLabel}>Favorites</span>
            <ul>
              {NAV_FAVORITES.map(({ id, Icon, route }) => (
                <li key={id} className={navCls(id)} title={id} onClick={() => go(id, route)}>
                  <Icon size={17} strokeWidth={1.9} className={styles.navIcon} />
                  <span className={styles.label}>{id}</span>
                </li>
              ))}
            </ul>
          </nav>

          <nav className={styles.navGroup}>
            <span className={styles.navLabel}>Practice</span>
            <ul>
              {NAV_PRACTICE.map(({ id, Icon, route }) => (
                <li key={id} className={navCls(id)} title={id} onClick={() => go(id, route)}>
                  <Icon size={17} strokeWidth={1.9} className={styles.navIcon} />
                  <span className={styles.label}>{id}</span>
                </li>
              ))}
            </ul>
          </nav>

          <nav className={styles.navGroup}>
            <span className={styles.navLabel}>Main Menu</span>
            <ul>
              {NAV_MAIN.map(({ id, Icon, route }) => (
                <li key={id} className={navCls(id)} title={id} onClick={() => go(id, route)}>
                  <Icon size={17} strokeWidth={1.9} className={styles.navIcon} />
                  <span className={styles.label}>{id}</span>
                </li>
              ))}
            </ul>
          </nav>

          <div className={`${styles.navGroup} ${styles.bottomGroup}`}>
            <ul>
              <li className={navCls('Profile')} title="Profile" onClick={() => go('Profile', '/student/profile')}>
                <User size={17} strokeWidth={1.9} className={styles.navIcon} />
                <span className={styles.label}>Profile</span>
              </li>
              <li className={navCls('Logout', true)} title="Logout" onClick={() => go('Logout', '/login')}>
                <LogOut size={17} strokeWidth={1.9} className={styles.navIcon} />
                <span className={styles.label}>Logout</span>
              </li>
            </ul>
          </div>

          <div className={styles.promoBanner}>
            <div className={styles.promoIcon}><MessageCircle size={16} strokeWidth={1.9} /></div>
            <div className={styles.promoText}>
              <p className={styles.promoTitle}>Stuck on a doubt?</p>
              <a className={styles.promoLink} onClick={() => router.push('/student/live-lab')}>Ask AI Tutor</a>
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
              <div className={styles.searchBar}>
                <Search size={14} strokeWidth={2} className={styles.searchIcon} />
                <span>Search</span>
                <kbd className={styles.searchKbd}>⌘ /</kbd>
              </div>
              <button className={styles.iconBtn}>
                <Bell size={16} strokeWidth={1.9} />
                <span className={styles.notifDot} />
              </button>
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
