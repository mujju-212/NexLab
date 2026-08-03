'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  GraduationCap, LayoutDashboard, FlaskConical, PlayCircle, Radio,
  ClipboardCheck, BarChart3, RotateCcw, Users, BookOpen,
  Bell, Search, ChevronRight, LogOut, Settings, User, Menu,
  MessageSquare, Lightbulb, FileText
} from 'lucide-react';
import styles from './InstructorShell.module.css';

const NAV_FAVORITES = [
  { id: 'Dashboard',       Icon: LayoutDashboard, route: '/instructor/dashboard'  },
  { id: 'Experiments',     Icon: FlaskConical,    route: '/instructor/experiments' },
  { id: 'Sessions',        Icon: PlayCircle,      route: '/instructor/sessions'    },
  { id: 'Live Lab Control',Icon: Radio,           route: '/instructor/live-lab'    },
];

const NAV_MAIN = [
  { id: 'Grading',             Icon: ClipboardCheck, route: '/instructor/grading'     },
  { id: 'Analytics',           Icon: BarChart3,      route: '/instructor/analytics'   },
  { id: 'Catch-Up Reviews',    Icon: RotateCcw,      route: '/instructor/catch-up'    },
  { id: 'Student Management',  Icon: Users,          route: '/instructor/students'    },
  { id: 'Content Library',     Icon: BookOpen,       route: '/instructor/content'     },
  { id: 'Viva',                Icon: MessageSquare,  route: '/instructor/viva'        },
  { id: 'Reports',             Icon: FileText,       route: '/instructor/reports'     },
];

interface InstructorShellProps {
  activePage: string;
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export default function InstructorShell({ activePage, children, title, subtitle }: InstructorShellProps) {
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
            <div className={styles.logo} onClick={() => router.push('/instructor/dashboard')}>
              <GraduationCap size={18} strokeWidth={2} />
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
              <li className={navCls('Profile')} title="Profile" onClick={() => go('Profile', '/instructor/profile')}>
                <User size={17} strokeWidth={1.9} className={styles.navIcon} />
                <span className={styles.label}>Profile</span>
              </li>
              <li className={navCls('Settings')} title="Settings" onClick={() => go('Settings', '/instructor/settings')}>
                <Settings size={17} strokeWidth={1.9} className={styles.navIcon} />
                <span className={styles.label}>Settings</span>
              </li>
              <li className={navCls('Logout', true)} title="Logout" onClick={() => go('Logout', '/login')}>
                <LogOut size={17} strokeWidth={1.9} className={styles.navIcon} />
                <span className={styles.label}>Logout</span>
              </li>
            </ul>
          </div>

          <div className={styles.promoBanner}>
            <div className={styles.promoIcon}><Lightbulb size={16} strokeWidth={1.9} /></div>
            <div className={styles.promoText}>
              <p className={styles.promoTitle}>AI Grading Ready</p>
              <a className={styles.promoLink} onClick={() => router.push('/instructor/grading')}>Grade with AI →</a>
            </div>
          </div>
        </aside>

        {/* ══ MAIN ══ */}
        <main className={styles.content}>
          <div className={styles.contentHeader}>
            <div className={styles.breadcrumb}>
              Instructor <ChevronRight size={14} className={styles.breadSep} /> <strong>{activePage}</strong>
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
              <div className={styles.profileChip} onClick={() => router.push('/instructor/profile')}>
                <div className={styles.avatarLg} style={{ background: '#0ea5e9' }}>DR</div>
                <span>Dr. Ramesh</span>
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
