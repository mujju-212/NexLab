'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard, FlaskConical, PlayCircle, Radio,
  ClipboardCheck, BarChart3,
  LogOut, Settings, Menu,
  FileText, HeartHandshake, Star, ShieldCheck, Megaphone, User,
  MoreHorizontal, X
} from 'lucide-react';
import Image from 'next/image';
import styles from './InstructorShell.module.css';
import { ShellNotifications, ShellSearchBox, ShellProfileMenu, type SearchHit } from './shell-widgets';
import AgentChatPanel from './AgentChatPanel';
import { AppToaster } from '@/components/ui/toast';
import { experienceService } from '@/services/experience.service';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth-store';

const NAV_MAIN = [
  { id: 'Dashboard',       label: 'Dashboard',       Icon: LayoutDashboard, route: '/instructor/dashboard' },
  { id: 'Experiments',     label: 'Experiments & Exams', Icon: FlaskConical, route: '/instructor/experiments' },
  { id: 'Sessions',        label: 'Sessions',        Icon: PlayCircle,      route: '/instructor/sessions' },
  { id: 'Live Conductor',  label: 'Live Conductor',  Icon: Radio,           route: '/instructor/live-lab' },
  { id: 'Grading',         label: 'Grading & Hub',   Icon: ClipboardCheck,  route: '/instructor/grading' },
  { id: 'Analytics',       label: 'Analytics Pulse', Icon: BarChart3,       route: '/instructor/analytics' },
];

const NAV_TEACHING = [
  { id: 'Management',      label: 'Class Management', Icon: HeartHandshake, route: '/instructor/management' },
  { id: 'Feedback',        label: 'Student Feedback', Icon: Star,           route: '/instructor/feedback' },
  { id: 'Announcements',   label: 'Announcements',    Icon: Megaphone,      route: '/instructor/announcements' },
  { id: 'Reports',         label: 'Reports Studio',   Icon: FileText,       route: '/instructor/reports' },
];

const NAV_MORE = [
  { id: 'Profile',         label: 'My Profile',         Icon: User,         route: '/instructor/profile' },
  { id: 'Settings',        label: 'Teaching Settings',  Icon: Settings,     route: '/instructor/settings' },
];

/* Mobile bottom tab bar — 5 primary destinations one tap away for faculty on mobile.
   Remaining sections live in the "More" bottom sheet. */
const BOTTOM_TABS = [
  { id: 'Dashboard',   label: 'Home',      Icon: LayoutDashboard, route: '/instructor/dashboard' },
  { id: 'Sessions',    label: 'Sessions',  Icon: PlayCircle,       route: '/instructor/sessions' },
  { id: 'Grading',     label: 'Grading',   Icon: ClipboardCheck,  route: '/instructor/grading' },
  { id: 'Management',  label: 'Classes',   Icon: HeartHandshake,  route: '/instructor/management' },
  { id: 'More',        label: 'More',      Icon: MoreHorizontal,   route: '' },
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const primaryRoutes = [
      '/instructor/dashboard',
      '/instructor/experiments',
      '/instructor/sessions',
      '/instructor/live-lab',
      '/instructor/grading',
      '/instructor/analytics',
      '/instructor/management',
      '/instructor/feedback',
      '/instructor/announcements',
      '/instructor/reports',
      '/instructor/profile',
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
    setMoreOpen(false);
    if (id === 'Logout') {
      setSigningOut(true);
      try {
        await authService.logout();
      } catch {
        /* ignore network errors on logout */
      }
      clearAuth();
      router.push('/login');
      return;
    }
    router.push(route);
  }, [router, clearAuth]);

  const isItemActive = (id: string) => {
    if (id === activePage) return true;
    if (id === 'Dashboard' && (activePage === 'Dashboard' || activePage === 'Dashboard Home')) return true;
    if (id === 'Experiments' && (activePage === 'Experiments' || activePage === 'Exams' || activePage === 'Exam Management')) return true;
    if (id === 'Feedback' && (activePage === 'Feedback' || activePage === 'Student Feedback')) return true;
    if (id === 'Announcements' && activePage === 'Announcements') return true;
    if (id === 'Management' && (activePage === 'Management' || activePage === 'Class Management' || activePage === 'Students' || activePage === 'Student Management')) return true;
    if (id === 'Profile' && (activePage === 'Profile' || activePage === 'My Profile')) return true;
    if (id === 'Settings' && (activePage === 'Settings' || activePage === 'Teaching Settings')) return true;
    return false;
  };

  const navCls = useCallback((id: string, isLogout = false) =>
    [styles.navItem, isItemActive(id) ? styles.navItemActive : '', isLogout ? styles.navItemLogout : '']
      .filter(Boolean).join(' '),
  [activePage]);

  const initials = useMemo(
    () => user?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '',
    [user?.full_name],
  );
  const fullName = user?.full_name || '';

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
            <span className={styles.navLabel}>TEACHING WORKSPACE</span>
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
            <span className={styles.navLabel}>CLASS & INSIGHTS</span>
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
            <span className={styles.navLabel}>ACCOUNT</span>
            <ul>
              {NAV_MORE.map(({ id, label, Icon, route }) => (
                <li key={id} className={navCls(id)} title={label} onClick={() => go(id, route)}>
                  <Icon size={17} strokeWidth={1.9} className={styles.navIcon} />
                  <span className={styles.label}>{label}</span>
                </li>
              ))}
              <li
                className={navCls('Logout', true)}
                title="Sign Out"
                onClick={() => go('Logout', '/login')}
                style={{ color: '#dc2626', marginTop: 4 }}
              >
                <LogOut size={17} strokeWidth={1.9} className={styles.navIcon} style={{ color: '#dc2626' }} />
                <span className={styles.label} style={{ color: '#dc2626', fontWeight: 700 }}>
                  {signingOut ? 'Signing out…' : 'Sign Out'}
                </span>
              </li>
            </ul>
          </nav>

          {/* Verified Faculty Account Footer Card (replaces consumer NexLab Pro card) */}
          {!collapsed && (
            <div
              style={{
                marginTop: 'auto',
                marginInline: 12,
                marginBottom: 12,
                padding: '12px 14px',
                borderRadius: 14,
                background: 'linear-gradient(135deg, rgba(124,58,237,0.08), rgba(79,70,229,0.05))',
                border: '1px solid rgba(124,58,237,0.16)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: '#ede9fe', color: '#7c3aed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <ShieldCheck size={17} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#1e1b4b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {fullName}
                  </p>
                  <p style={{ margin: 0, fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Institution Faculty
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => go('Logout', '/login')}
                title="Sign Out"
                style={{
                  border: '1px solid rgba(220,38,38,0.2)',
                  background: '#fef2f2',
                  color: '#dc2626',
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <LogOut size={14} />
              </button>
            </div>
          )}
        </aside>

        {/* mobile drawer backdrop */}
        {drawerOpen && <div className={styles.drawerBackdrop} onClick={() => setDrawerOpen(false)} />}

        {/* ══ MAIN ══ */}
        <main className={styles.content} style={noScroll ? { overflow: 'hidden', display: 'flex', flexDirection: 'column' } : undefined}>
          
          {/* ══ MOBILE APP BAR (phone view; hidden on desktop) ══ */}
          <div className={styles.mobileAppBar}>
            <button className={styles.mobileBarBtn} onClick={() => setDrawerOpen(true)} aria-label="Open menu">
              <Menu size={20} strokeWidth={2.1} />
            </button>
            <div className={styles.mobileBarTitleWrap}>
              <span className={styles.mobileBarTitle}>{title || activePage}</span>
              <span className={styles.mobileRoleBadge}>Faculty</span>
            </div>
            <div className={styles.mobileBarActions}>
              <ShellNotifications buttonClass={styles.iconBtn} dotClass={styles.notifDot} role="instructor" />
              <ShellProfileMenu
                name={fullName}
                email={user?.email}
                initials={initials}
                roleLabel="Instructor"
                profileHref="/instructor/profile"
                settingsHref="/instructor/settings"
                buttonClass={styles.profileChip}
                avatarClass={styles.avatarLg}
                avatarStyle={{ background: '#7c3aed', width: 32, height: 32, fontSize: 12 }}
                onSignOut={() => go('Logout', '/login')}
              />
            </div>
          </div>
          <div className={styles.mobileSearchRow}>
            <ShellSearchBox
              className={styles.searchBar}
              placeholder="Search students, experiments, sessions..."
              fetcher={(q) => experienceService.instructorSearch(q)}
              onSelect={(hit: SearchHit) => router.push(hit.link ?? '/instructor/management')}
            />
          </div>

          {/* Top Header (Desktop only) */}
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
                onSelect={(hit: SearchHit) => router.push(hit.link ?? '/instructor/management')}
              />
            </div>

            {/* Header Right Actions */}
            <div className={styles.headerRight}>
              <ShellNotifications buttonClass={styles.iconBtn} dotClass={styles.notifDot} role="instructor" />
              
              <ShellProfileMenu
                name={fullName}
                email={user?.email}
                initials={initials}
                roleLabel="Instructor"
                profileHref="/instructor/profile"
                settingsHref="/instructor/settings"
                buttonClass={styles.profileChip}
                avatarClass={styles.avatarLg}
                onSignOut={() => go('Logout', '/login')}
              />
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

      {/* ══ MOBILE BOTTOM TAB BAR (fixed at bottom on phones) ══ */}
      <nav className={styles.bottomTabBar} aria-label="Instructor Primary Navigation">
        {BOTTOM_TABS.map(({ id, label, Icon, route }) => {
          const active = id !== 'More' && isItemActive(id);
          return (
            <button
              key={id}
              type="button"
              className={`${styles.bottomTab} ${active ? styles.bottomTabActive : ''}`}
              onClick={() => (id === 'More' ? setMoreOpen(true) : go(id, route))}
            >
              <Icon size={20} strokeWidth={active ? 2.3 : 1.9} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {/* ══ MOBILE "MORE" SHEET (bottom sheet modal) ══ */}
      {moreOpen && (
        <>
          <div className={styles.sheetBackdrop} onClick={() => setMoreOpen(false)} />
          <div className={styles.moreSheet} role="dialog" aria-label="Instructor Sections">
            <div className={styles.moreSheetHeader}>
              <div>
                <p className={styles.moreSheetTitle}>{fullName || 'Instructor Portal'}</p>
                <p className={styles.moreSheetRole}>Teaching & Academic Hub</p>
              </div>
              <button className={styles.moreSheetClose} onClick={() => setMoreOpen(false)} aria-label="Close menu">
                <X size={18} />
              </button>
            </div>

            <div className={styles.moreSheetBody}>
              <p className={styles.moreSheetGroup}>Curriculum & Teaching</p>
              <button className={`${styles.moreSheetItem} ${isItemActive('Experiments') ? styles.moreSheetItemActive : ''}`} onClick={() => go('Experiments', '/instructor/experiments')}>
                <FlaskConical size={16} className={styles.moreSheetIcon} />
                Experiments & Exam Studio
              </button>
              <button className={`${styles.moreSheetItem} ${isItemActive('Live Conductor') ? styles.moreSheetItemActive : ''}`} onClick={() => go('Live Conductor', '/instructor/live-lab')}>
                <Radio size={16} className={styles.moreSheetIcon} />
                Live Conductor
              </button>
              <button className={`${styles.moreSheetItem} ${isItemActive('Grading') ? styles.moreSheetItemActive : ''}`} onClick={() => go('Grading', '/instructor/grading')}>
                <ClipboardCheck size={16} className={styles.moreSheetIcon} />
                Grading & Evaluation Hub
              </button>
              <button className={`${styles.moreSheetItem} ${isItemActive('Management') ? styles.moreSheetItemActive : ''}`} onClick={() => go('Management', '/instructor/management')}>
                <HeartHandshake size={16} className={styles.moreSheetIcon} />
                Class & Student Management
              </button>

              <p className={styles.moreSheetGroup}>Insights & Communication</p>
              <button className={`${styles.moreSheetItem} ${isItemActive('Analytics') ? styles.moreSheetItemActive : ''}`} onClick={() => go('Analytics', '/instructor/analytics')}>
                <BarChart3 size={16} className={styles.moreSheetIcon} />
                Analytics Pulse & Insights
              </button>
              <button className={`${styles.moreSheetItem} ${isItemActive('Feedback') ? styles.moreSheetItemActive : ''}`} onClick={() => go('Feedback', '/instructor/feedback')}>
                <Star size={16} className={styles.moreSheetIcon} />
                Student Feedback & Sentiment
              </button>
              <button className={`${styles.moreSheetItem} ${isItemActive('Announcements') ? styles.moreSheetItemActive : ''}`} onClick={() => go('Announcements', '/instructor/announcements')}>
                <Megaphone size={16} className={styles.moreSheetIcon} />
                Announcements Broadcast
              </button>
              <button className={`${styles.moreSheetItem} ${isItemActive('Reports') ? styles.moreSheetItemActive : ''}`} onClick={() => go('Reports', '/instructor/reports')}>
                <FileText size={16} className={styles.moreSheetIcon} />
                Reports Studio & Exports
              </button>

              <p className={styles.moreSheetGroup}>Account & Workspace</p>
              <button className={`${styles.moreSheetItem} ${isItemActive('Profile') ? styles.moreSheetItemActive : ''}`} onClick={() => go('Profile', '/instructor/profile')}>
                <User size={16} className={styles.moreSheetIcon} />
                My Profile & Showcase
              </button>
              <button className={`${styles.moreSheetItem} ${isItemActive('Settings') ? styles.moreSheetItemActive : ''}`} onClick={() => go('Settings', '/instructor/settings')}>
                <Settings size={16} className={styles.moreSheetIcon} />
                Teaching Settings & Security
              </button>
              <button className={`${styles.moreSheetItem} ${styles.moreSheetItemLogout}`} onClick={() => go('Logout', '/login')}>
                <LogOut size={16} className={styles.moreSheetIcon} style={{ color: '#dc2626' }} />
                Sign Out
              </button>
            </div>
          </div>
        </>
      )}

      <AppToaster />
      <AgentChatPanel roleOverride="instructor" pageContext={{ page_title: title || activePage }} />
    </div>
  );
}
