'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  LayoutDashboard, Users, BookOpen, GraduationCap,
  BarChart3, Megaphone, ShieldCheck, Settings,
  Bell, ChevronRight, LogOut, Menu, Search, User,
  Layers
} from 'lucide-react';
import styles from './InstitutionShell.module.css';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth-store';

const NAV_MAIN = [
  { id: 'Dashboard',  Icon: LayoutDashboard, route: '/institution/dashboard'     },
  { id: 'Users',      Icon: Users,           route: '/institution/users'          },
  { id: 'Academic',   Icon: Layers,          route: '/institution/academic'       },
  { id: 'Sessions',   Icon: GraduationCap,   route: '/institution/sessions'       },
  { id: 'Analytics',  Icon: BarChart3,       route: '/institution/analytics'      },
];

const NAV_TOOLS = [
  { id: 'Announcements', Icon: Megaphone,   route: '/institution/announcements'  },
  { id: 'Audit Log',     Icon: ShieldCheck, route: '/institution/audit-log'      },
  { id: 'Settings',      Icon: Settings,    route: '/institution/settings'       },
];

interface InstitutionShellProps {
  activePage: string;
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export default function InstitutionShell({
  activePage, children, title, subtitle,
}: InstitutionShellProps) {
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const go = async (id: string, route: string) => {
    setMobileOpen(false);
    if (id === 'Logout') {
      await authService.logout();
      clearAuth();
      router.push('/login');
      return;
    }
    router.push(route);
  };

  const handleSearch = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      router.push(`/institution/users?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  const navCls = (id: string, isLogout = false) =>
    [styles.navItem, id === activePage ? styles.navItemActive : '', isLogout ? styles.navItemLogout : '']
      .filter(Boolean).join(' ');

  const initials = user?.full_name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() ?? 'IA';

  return (
    <div className={styles.stage}>
      <div className={`${styles.blob} ${styles.blob1}`} />
      <div className={`${styles.blob} ${styles.blob2}`} />
      <div className={`${styles.blob} ${styles.blob3}`} />
      <div className={styles.sheen} />

      <div className={styles.appPanel}>
        {/* Mobile overlay */}
        <div className={`${styles.mobileOverlay} ${mobileOpen ? styles.show : ''}`} onClick={() => setMobileOpen(false)} />
        {/* ══ SIDEBAR ══ */}
        <aside className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ''} ${mobileOpen ? styles.sidebarOpen : ''}`}>
          <div className={styles.sidebarTop}>
            <div className={styles.logo} onClick={() => router.push('/institution/dashboard')}>
              <Image src="/logo.png" alt="NexLab" width={collapsed ? 54 : 105} height={collapsed ? 36 : 70} style={{ objectFit:'contain' }} priority />
            </div>
            <button className={styles.collapseBtn} onClick={() => setCollapsed(p => !p)} title="Collapse">
              <Menu size={16} strokeWidth={2} />
            </button>
          </div>

          {!collapsed && (
            <div className={styles.institutionBadge}>
              <span className={styles.institutionName}>
                {user?.institution_id ? `Inst. ${user.institution_id.slice(0, 8).toUpperCase()}` : 'Institution Admin'}
              </span>
              <span className={styles.institutionRole}>Admin Portal</span>
            </div>
          )}

          <nav className={styles.navGroup}>
            <span className={styles.navLabel}>Management</span>
            <ul>
              {NAV_MAIN.map(({ id, Icon, route }) => (
                <li key={id} className={navCls(id)} title={id} onClick={() => go(id, route)}>
                  <Icon size={17} strokeWidth={1.9} className={styles.navIcon} />
                  <span className={styles.label}>{id}</span>
                </li>
              ))}
            </ul>
          </nav>

          <nav className={styles.navGroup}>
            <span className={styles.navLabel}>Tools</span>
            <ul>
              {NAV_TOOLS.map(({ id, Icon, route }) => (
                <li key={id} className={navCls(id)} title={id} onClick={() => go(id, route)}>
                  <Icon size={17} strokeWidth={1.9} className={styles.navIcon} />
                  <span className={styles.label}>{id}</span>
                </li>
              ))}
            </ul>
          </nav>

          <div className={`${styles.navGroup} ${styles.bottomGroup}`}>
            <ul>
              <li className={navCls('Logout', true)} title="Logout" onClick={() => go('Logout', '/login')}>
                <LogOut size={17} strokeWidth={1.9} className={styles.navIcon} />
                <span className={styles.label}>Logout</span>
              </li>
            </ul>
          </div>
        </aside>

        {/* ══ MAIN ══ */}
        <main className={styles.content}>
          <div className={styles.contentHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className={styles.mobileMenuBtn} onClick={() => setMobileOpen(true)}>
                <Menu size={18} strokeWidth={2} />
              </button>
              <div className={styles.breadcrumb}>
                Institution <ChevronRight size={14} className={styles.breadSep} /> <strong>{activePage}</strong>
              </div>
            </div>
            <div className={styles.headerRight}>
              <div className={styles.searchBar} style={searchFocused ? { borderColor: '#7c3aed', boxShadow: '0 0 0 3px rgba(124,58,237,0.1)' } : {}}>
                <Search size={14} strokeWidth={2} className={styles.searchIcon} />
                <input type="text" placeholder="Search users, batches…" value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)} onKeyDown={handleSearch}
                  onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)}
                  style={{ border:'none', outline:'none', background:'transparent', fontSize:13, color:'#1e293b', fontFamily:"'Manrope',sans-serif", width:'100%', padding:0 }} />
                <kbd className={styles.searchKbd}>↵</kbd>
              </div>
              <div style={{ position: 'relative' }}>
                <button className={styles.iconBtn} onClick={() => router.push('/institution/announcements')}>
                  <Bell size={16} strokeWidth={1.9} />
                  <span className={styles.notifDot} />
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <div className={styles.profileChip} onClick={() => setShowProfileMenu(p => !p)}>
                  <div className={styles.avatarLg} style={{ background: '#7c3aed' }}>{initials}</div>
                  <span>{user?.full_name?.split(' ')[0] ?? 'Admin'}</span>
                </div>
                {showProfileMenu && (
                  <div style={{ position:'absolute', top:'100%', right:0, marginTop:8, zIndex:100, background:'#fff', borderRadius:12, boxShadow:'0 8px 28px rgba(0,0,0,0.12)', border:'1px solid #f1f5f9', minWidth:200, overflow:'hidden' }}>
                    <div style={{ padding:'12px 16px', borderBottom:'1px solid #f1f5f9' }}>
                      <p style={{ margin:0, fontSize:14, fontWeight:700, color:'#201b2e' }}>{user?.full_name}</p>
                      <p style={{ margin:'2px 0 0', fontSize:12, color:'#9891a6' }}>{user?.email}</p>
                    </div>
                    <button onClick={() => { setShowProfileMenu(false); router.push('/institution/profile'); }}
                      style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'10px 16px', background:'none', border:'none', cursor:'pointer', fontSize:13, fontWeight:500, color:'#201b2e' }}>
                      <User size={14} style={{ color:'#7c3aed' }} /> My Profile
                    </button>
                    <button onClick={() => { setShowProfileMenu(false); router.push('/institution/settings'); }}
                      style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'10px 16px', background:'none', border:'none', cursor:'pointer', fontSize:13, fontWeight:500, color:'#201b2e' }}>
                      <Settings size={14} style={{ color:'#7c3aed' }} /> Settings
                    </button>
                    <div style={{ height:1, background:'#f1f5f9' }} />
                    <button onClick={() => go('Logout', '/login')}
                      style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'10px 16px', background:'none', border:'none', cursor:'pointer', fontSize:13, fontWeight:500, color:'#ef4444' }}>
                      <LogOut size={14} /> Sign Out
                    </button>
                  </div>
                )}
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
