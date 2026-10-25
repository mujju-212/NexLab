'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck, LayoutDashboard, Users, BookMarked,
  Activity, BarChart3, FileText, Shield, Settings, LogOut,
  ChevronRight, Menu, Building2, BookOpen, ClipboardList, Boxes
} from 'lucide-react';
import Image from 'next/image';
import styles from './AdminShell.module.css';
import { ShellNotifications, ShellSearchBox, ShellProfileMenu, type SearchHit } from './shell-widgets';
import AgentChatPanel from './AgentChatPanel';
import { AppToaster } from '@/components/ui/toast';
import { adminService } from '@/services/admin.service';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth-store';

const NAV_FAVORITES = [
  { id: 'Dashboard',       Icon: LayoutDashboard, route: '/admin/dashboard'      },
  { id: 'Institutions',    Icon: Building2,       route: '/admin/institutions'   },
  { id: 'User Management', Icon: Users,           route: '/admin/users'          },
  { id: 'Content',         Icon: BookMarked,      route: '/admin/content'        },
  { id: 'Platform Analytics', Icon: BarChart3,    route: '/admin/analytics'      },
];

const NAV_MAIN = [
  { id: 'System Monitoring', Icon: Activity,      route: '/admin/monitoring' },
  { id: 'Reports & Exports', Icon: FileText,      route: '/admin/reports'    },
  { id: 'Security',          Icon: Shield,        route: '/admin/security'   },
  { id: 'Academic Setup',    Icon: BookOpen,      route: '/admin/academic'    },
  { id: 'Assignments',       Icon: ClipboardList, route: '/admin/assignments' },
  { id: 'Environment Profiles', Icon: Boxes,       route: '/admin/environments' },
];

interface AdminShellProps {
  activePage: string;
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export default function AdminShell({ activePage, children, title, subtitle }: AdminShellProps) {
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
            <button type="button" aria-label="Go to admin dashboard" className={styles.logo} onClick={() => router.push('/admin/dashboard')} style={{ border: 0, padding: 0, background: 'transparent' }}>
              <Image src="/logo.png" alt="NexLab" width={collapsed ? 54 : 105} height={collapsed ? 36 : 70} style={{ objectFit: 'contain' }} priority />
            </button>
            <button className={styles.collapseBtn} onClick={() => setCollapsed(p => !p)} title="Collapse">
              <Menu size={16} strokeWidth={2} />
            </button>
          </div>

          <nav className={styles.navGroup}>
            <span className={styles.navLabel}>Favorites</span>
            <ul>
              {NAV_FAVORITES.map(({ id, Icon, route }) => (
                <li key={id}>
                  <button type="button" className={navCls(id)} title={id} aria-current={id === activePage ? 'page' : undefined} onClick={() => go(id, route)} style={{ width: '100%', border: 0, textAlign: 'left', fontFamily: 'inherit' }}>
                    <Icon size={17} strokeWidth={1.9} className={styles.navIcon} />
                    <span className={styles.label}>{id}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <nav className={styles.navGroup}>
            <span className={styles.navLabel}>Main Menu</span>
            <ul>
              {NAV_MAIN.map(({ id, Icon, route }) => (
                <li key={id}>
                  <button type="button" className={navCls(id)} title={id} aria-current={id === activePage ? 'page' : undefined} onClick={() => go(id, route)} style={{ width: '100%', border: 0, textAlign: 'left', fontFamily: 'inherit' }}>
                    <Icon size={17} strokeWidth={1.9} className={styles.navIcon} />
                    <span className={styles.label}>{id}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div className={`${styles.navGroup} ${styles.bottomGroup}`}>
            <ul>
              <li>
                <button type="button" className={navCls('Settings')} title="Settings" aria-current={'Settings' === activePage ? 'page' : undefined} onClick={() => go('Settings', '/admin/settings')} style={{ width: '100%', border: 0, textAlign: 'left', fontFamily: 'inherit' }}>
                  <Settings size={17} strokeWidth={1.9} className={styles.navIcon} />
                  <span className={styles.label}>Settings</span>
                </button>
              </li>
              <li>
                <button type="button" className={navCls('Logout', true)} title="Logout" onClick={() => go('Logout', '/login')} style={{ width: '100%', border: 0, textAlign: 'left', fontFamily: 'inherit' }}>
                  <LogOut size={17} strokeWidth={1.9} className={styles.navIcon} />
                  <span className={styles.label}>Logout</span>
                </button>
              </li>
            </ul>
          </div>

          <div className={styles.promoBanner}>
            <div className={styles.promoIcon}><ShieldCheck size={16} strokeWidth={1.9} /></div>
            <div className={styles.promoText}>
              <p className={styles.promoTitle}>Admin Portal</p>
              <button type="button" className={styles.promoLink} onClick={() => router.push('/admin/monitoring')}>System Health →</button>
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
              Admin <ChevronRight size={14} className={styles.breadSep} /> <strong>{activePage}</strong>
            </div>
            <div className={styles.headerRight}>
              <ShellSearchBox
                className={styles.searchBar}
                placeholder="Search users…"
                fetcher={async (q) => {
                  const res = await adminService.searchUsers({ q }) as { users?: Array<{ id: string; full_name: string; role: string; email: string }> };
                  return (res.users ?? []).map(u => ({
                    type: 'user', id: u.id, label: u.full_name,
                    sub_label: `${u.role} · ${u.email}`,
                    link: `/admin/users/${u.id}`,
                  }));
                }}
                onSelect={(hit: SearchHit) => router.push(hit.link ?? '/admin/users')}
              />
              <ShellNotifications buttonClass={styles.iconBtn} dotClass={styles.notifDot} role="platform_admin" />
              <ShellProfileMenu
                name={user?.full_name ?? 'Admin'}
                email={user?.email}
                initials={user?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? 'AD'}
                roleLabel="Platform Admin"
                profileHref="/admin/profile"
                settingsHref="/admin/settings"
                buttonClass={styles.profileChip}
                avatarClass={styles.avatarLg}
                avatarStyle={{ background: '#7c3aed' }}
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

      <AppToaster />
      <AgentChatPanel roleOverride="admin" pageContext={{ page_title: title || activePage }} />
    </div>
  );
}
