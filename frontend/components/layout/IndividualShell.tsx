'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard, GraduationCap, Terminal, TrendingUp,
  User, LogOut, Bell, Search, Sparkles,
  ChevronRight, Menu, Library, Zap, Flame, BookMarked
} from 'lucide-react';
import Image from 'next/image';
import styles from './IndividualShell.module.css';
import { ShellNotifications, ShellSearchBox, type SearchHit } from './shell-widgets';
import { practiceExtraService } from '@/services/practice-extra.service';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth-store';

const NAV_MAIN = [
  { id: 'dashboard',  label: 'Dashboard',   Icon: LayoutDashboard, route: '/practice/dashboard'  },
  { id: 'courses',    label: 'Courses',     Icon: GraduationCap,   route: '/practice'            },
  { id: 'playground', label: 'Playground',  Icon: Terminal,        route: '/practice/playground' },
  { id: 'progress',   label: 'My Progress', Icon: TrendingUp,      route: '/practice/progress'   },
  { id: 'profile',    label: 'Profile',     Icon: User,            route: '/practice/profile'    },
];
const NAV_PRACTICE = [
  { id: 'library',    label: 'Practice Library', Icon: Library,    route: '/practice/library'              },
  { id: 'plans',      label: 'Study Plans',      Icon: BookMarked, route: '/practice/library/study-plans'  },
  { id: 'daily',      label: 'Daily Challenge',  Icon: Flame,      route: '/practice/library/daily'        },
  { id: 'quest',      label: 'Quest',            Icon: Zap,        route: '/practice/library/quest'        },
];

interface IndividualShellProps {
  activePage: string;
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export default function IndividualShell({ activePage, children, title, subtitle }: IndividualShellProps) {
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
            <div className={styles.logo} onClick={() => router.push('/practice/dashboard')}>
              <Image src="/logo.png" alt="NexLab" width={collapsed ? 54 : 105} height={collapsed ? 36 : 70} style={{ objectFit: 'contain' }} priority />
            </div>
            <button className={styles.collapseBtn} onClick={() => setCollapsed(p => !p)} title="Collapse">
              <Menu size={16} strokeWidth={2} />
            </button>
          </div>

          {/* ── Scrollable nav area (both sections always visible) ── */}
          <div className={styles.navScroll}>
            <nav className={styles.navGroup}>
              <span className={styles.navLabel}>Menu</span>
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
              <span className={styles.navLabel}>Practice</span>
              <ul>
                {NAV_PRACTICE.map(({ id, label, Icon, route }) => (
                  <li key={id} className={navCls(id)} title={label} onClick={() => go(id, route)}>
                    <Icon size={17} strokeWidth={1.9} className={styles.navIcon} />
                    <span className={styles.label}>{label}</span>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          {/* ── Fixed footer: Sign Out + promo ── */}
          <div className={styles.sidebarFooter}>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              <li className={navCls('Logout', true)} title="Sign Out" onClick={() => go('Logout', '/login')}>
                <LogOut size={17} strokeWidth={1.9} className={styles.navIcon} />
                <span className={styles.label}>Sign Out</span>
              </li>
            </ul>
            <div className={styles.promoBanner}>
              <div className={styles.promoIcon}><Sparkles size={16} strokeWidth={1.9} /></div>
              <div className={styles.promoText}>
                <p className={styles.promoTitle}>Free &amp; Open</p>
                <a className={styles.promoLink} onClick={() => router.push('/practice')}>Browse courses</a>
              </div>
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
              Practice <ChevronRight size={14} className={styles.breadSep} /> <strong>{activePage}</strong>
            </div>
            <div className={styles.headerRight}>
              <ShellSearchBox
                className={styles.searchBar}
                placeholder="Search practice problems…"
                fetcher={(q) => practiceExtraService.searchProblems(q)}
                onSelect={(hit: SearchHit) => router.push(hit.link ?? '/practice/library')}
              />
              <ShellNotifications buttonClass={styles.iconBtn} dotClass={styles.notifDot} />
              <div className={styles.profileChip} onClick={() => router.push('/practice/profile')}>
                <div className={styles.avatarLg} style={{ background: '#9333ea' }}>
                  {user?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? 'ME'}
                </div>
                <span>{user?.full_name?.split(' ')[0] ?? 'Learner'}</span>
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
