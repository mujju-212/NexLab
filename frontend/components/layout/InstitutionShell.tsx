'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  LayoutDashboard, Users, BookOpen, GraduationCap,
  BarChart3, Megaphone, ShieldCheck, Settings,
  Bell, ChevronRight, LogOut, Menu, Search, User,
  Layers, Clock
} from 'lucide-react';
import styles from './InstitutionShell.module.css';
import PasswordGate from './PasswordGate';
import AgentChatPanel from './AgentChatPanel';
import { ShellNotifications } from './shell-widgets';
import { authService } from '@/services/auth.service';
import { institutionService, type GlobalSearchHit } from '@/services/institution.service';
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
  // Live global search — hits the /institution/search endpoint (users,
  // sections, sessions) instead of only forwarding to the users page.
  const [searchHits, setSearchHits] = useState<GlobalSearchHit[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = searchQuery.trim();
    if (q.length < 2) { setSearchHits([]); return; }
    searchTimer.current = setTimeout(async () => {
      const hits = await institutionService.globalSearch(q);
      setSearchHits(hits);
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery]);

  const go = useCallback(async (id: string, route: string) => {
    setMobileOpen(false);
    if (id === 'Logout') {
      await authService.logout();
      clearAuth();
      router.push('/login');
      return;
    }
    router.push(route);
  }, [router, clearAuth]);

  const navCls = useCallback((id: string, isLogout = false) =>
    [styles.navItem, id === activePage ? styles.navItemActive : '', isLogout ? styles.navItemLogout : '']
      .filter(Boolean).join(' '),
  [activePage]);

  const initials = useMemo(
    () => user?.full_name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() ?? 'IA',
    [user?.full_name],
  );

  const SEARCH_ICONS: Record<GlobalSearchHit['type'], React.ReactNode> = useMemo(() => ({
    user: <User size={13} />,
    section: <Layers size={13} />,
    session: <Clock size={13} />,
  }), []);

  const goSearchHit = useCallback((hit: GlobalSearchHit) => {
    setSearchQuery(''); setSearchHits([]); setMobileOpen(false);
    if (hit.type === 'user') router.push(`/institution/users/${hit.id}`);
    else if (hit.type === 'section') router.push('/institution/academic?tab=sections');
    else router.push('/institution/sessions?tab=history');
  }, [router]);

  // Admin-issued temp password → block the entire shell until replaced.
  if (user?.must_change_password) {
    return <PasswordGate>{null}</PasswordGate>;
  }

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
              <div className={styles.searchBar} style={{ ...(searchFocused ? { borderColor: '#7c3aed', boxShadow: '0 0 0 3px rgba(124,58,237,0.1)' } : {}), position: 'relative' }}>
                <Search size={14} strokeWidth={2} className={styles.searchIcon} />
                <input type="text" placeholder="Search users, batches…" value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') { setSearchQuery(''); setSearchHits([]); }
                    if (e.key === 'Enter' && searchQuery.trim()) {
                      // Fallback: full user list filtered by the query.
                      router.push(`/institution/users?search=${encodeURIComponent(searchQuery.trim())}`);
                      setSearchQuery(''); setSearchHits([]);
                    }
                  }}
                  onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)}
                  style={{ border:'none', outline:'none', background:'transparent', fontSize:13, color:'#1e293b', fontFamily:"'Manrope',sans-serif", width:'100%', padding:0 }} />
                <kbd className={styles.searchKbd}>↵</kbd>

                {/* Live results dropdown */}
                {searchFocused && searchQuery.trim().length >= 2 && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 120,
                    background: '#fff', borderRadius: 12, border: '1px solid #ede9fe',
                    boxShadow: '0 14px 38px -10px rgba(30,20,60,.25)', overflow: 'hidden',
                    maxHeight: 320, overflowY: 'auto',
                  }}>
                    {searchHits.length === 0 ? (
                      <p style={{ margin: 0, padding: '12px 14px', fontSize: 12.5, color: '#9891a6' }}>
                        No matches — press ↵ to search the full user list.
                      </p>
                    ) : searchHits.map(hit => (
                      <button key={`${hit.type}-${hit.id}`}
                        onMouseDown={e => { e.preventDefault(); goSearchHit(hit); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                          padding: '10px 14px', background: 'none', border: 'none',
                          borderBottom: '1px solid #f5f3ff', cursor: 'pointer', textAlign: 'left',
                        }}>
                        <span style={{
                          width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'rgba(147,51,234,0.09)', color: '#7c3aed',
                        }}>
                          {SEARCH_ICONS[hit.type] ?? <Search size={13} />}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#201b2e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {hit.label}
                          </span>
                          <span style={{ display: 'block', fontSize: 11, color: '#9891a6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {hit.sub_label || hit.type}
                          </span>
                        </span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#7c3aed', textTransform: 'capitalize' }}>{hit.type}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <ShellNotifications buttonClass={styles.iconBtn} dotClass={styles.notifDot} />
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

      <AgentChatPanel />
    </div>
  );
}
