'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck, LayoutDashboard, GraduationCap, Users,
  Activity, BarChart3, FileText, Shield, Settings, LogOut,
  Bell, Search, ChevronRight, Menu, Building2
} from 'lucide-react';
import Image from 'next/image';
import styles from './AdminShell.module.css';
import { ShellNotifications, ShellSearchBox, type SearchHit } from './shell-widgets';
import AgentChatPanel from './AgentChatPanel';
import { adminService } from '@/services/admin.service';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth-store';

const NAV_FAVORITES = [
  { id: 'Dashboard',       Icon: LayoutDashboard, route: '/admin/dashboard'      },
  { id: 'Institutions',    Icon: Building2,       route: '/admin/institutions'   },
  { id: 'Academic Setup',  Icon: GraduationCap,   route: '/admin/academic'       },
  { id: 'User Management', Icon: Users,           route: '/admin/users'          },
];

const NAV_MAIN = [
  { id: 'System Monitoring', Icon: Activity,  route: '/admin/monitoring' },
  { id: 'Platform Analytics',Icon: BarChart3, route: '/admin/analytics'  },
  { id: 'Reports & Exports', Icon: FileText,  route: '/admin/reports'    },
  { id: 'Security',          Icon: Shield,    route: '/admin/security'   },
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
            <div className={styles.logo} onClick={() => router.push('/admin/dashboard')}>
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
              <li className={navCls('Settings')} title="Settings" onClick={() => go('Settings', '/admin/settings')}>
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
            <div className={styles.promoIcon}><ShieldCheck size={16} strokeWidth={1.9} /></div>
            <div className={styles.promoText}>
              <p className={styles.promoTitle}>Admin Portal</p>
              <a className={styles.promoLink} onClick={() => router.push('/admin/monitoring')}>System Health →</a>
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
                    link: '/admin/users',
                  }));
                }}
                onSelect={(hit: SearchHit) => router.push(hit.link ?? '/admin/users')}
              />
              <ShellNotifications buttonClass={styles.iconBtn} dotClass={styles.notifDot} />
              <div className={styles.profileChip} onClick={() => router.push('/admin/settings')}>
                <div className={styles.avatarLg} style={{ background: '#7c3aed' }} suppressHydrationWarning>
                  {user?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? 'AD'}
                </div>
                <span suppressHydrationWarning>{user?.full_name?.split(' ')[0] ?? 'Admin'}</span>
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

      <AgentChatPanel roleOverride="admin" pageContext={{ page_title: title || activePage }} />
    </div>
  );
}
