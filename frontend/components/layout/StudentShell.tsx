'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Zap, LayoutDashboard, BookOpen, FlaskConical, LogIn,
  Terminal, Upload, TrendingUp, Trophy, Clock, RotateCcw,
  ShieldCheck, Settings, LogOut, Bell, Search, MessageCircle,
  ChevronRight, User, Menu
} from 'lucide-react';
import styles from './StudentShell.module.css';

const NAV_FAVORITES = [
  { id: 'Dashboard Home',     Icon: LayoutDashboard, route: '/student/dashboard'  },
  { id: 'My Subjects',        Icon: BookOpen,         route: '/student/subjects'   },
  { id: 'Pre-Lab',            Icon: FlaskConical,     route: '/student/pre-lab'    },
  { id: 'Join Lab',           Icon: LogIn,            route: '/student/live-lab'   },
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
  const [collapsed, setCollapsed] = useState(false);

  const go = (id: string, route: string) => {
    if (id === 'Logout') { router.push('/login'); return; }
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
        <aside className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ''}`}>
          <div className={styles.sidebarTop}>
            <div className={styles.logo} onClick={() => router.push('/student/dashboard')}>
              <Zap size={18} strokeWidth={2.2} />
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

        {/* ══ MAIN ══ */}
        <main className={styles.content}>
          <div className={styles.contentHeader}>
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
                <div className={styles.avatarLg} style={{ background: '#8b5cf6' }}>RS</div>
                <span>Riya S.</span>
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
