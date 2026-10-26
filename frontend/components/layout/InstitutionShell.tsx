'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  LayoutDashboard, Users, BookOpen, GraduationCap,
  BarChart3, Megaphone, ShieldCheck, Settings,
  Bell, ChevronRight, ChevronDown, LogOut, Menu, Search, User,
  Layers, Clock, Calendar, ClipboardList, CreditCard, Crown,
  Cpu, HelpCircle, MoreHorizontal, X
} from 'lucide-react';
import styles from './InstitutionShell.module.css';
import PasswordGate from './PasswordGate';
import AgentChatPanel from './AgentChatPanel';
import { ShellNotifications, ShellProfileMenu } from './shell-widgets';
import { AppToaster } from '@/components/ui/toast';
import { authService } from '@/services/auth.service';
import { institutionService, type GlobalSearchHit } from '@/services/institution.service';
import { useAuthStore } from '@/store/auth-store';

const ACADEMIC_SUBNAV = [
  { id: 'years',       label: 'Years & Batches', route: '/institution/academic?tab=years' },
  { id: 'departments', label: 'Departments',     route: '/institution/academic?tab=departments' },
  { id: 'sections',    label: 'Sections',        route: '/institution/academic?tab=sections' },
  { id: 'subjects',    label: 'Subjects',        route: '/institution/academic?tab=subjects' },
  { id: 'enroll',      label: 'Enroll & Assign', route: '/institution/academic?tab=enroll' },
];

const SESSIONS_SUBNAV = [
  { id: 'live',     label: 'Live',     route: '/institution/sessions?tab=live' },
  { id: 'calendar', label: 'Calendar', route: '/institution/sessions?tab=calendar' },
  { id: 'upcoming', label: 'Upcoming', route: '/institution/sessions?tab=upcoming' },
  { id: 'planner',  label: 'Planner',  route: '/institution/sessions?tab=planner' },
  { id: 'history',  label: 'History',  route: '/institution/sessions?tab=history' },
];

const ANALYTICS_SUBNAV = [
  { id: 'overview',    label: 'Overview',             route: '/institution/analytics?tab=overview' },
  { id: 'outcomes',    label: 'Learning Outcomes',    route: '/institution/analytics?tab=outcomes' },
  { id: 'funnel',      label: 'Student Funnel',       route: '/institution/analytics?tab=funnel' },
  { id: 'benchmark',   label: 'Cohort Benchmark',     route: '/institution/analytics?tab=benchmark' },
  { id: 'attendance',  label: 'Attendance Matrix',    route: '/institution/analytics?tab=attendance' },
  { id: 'grades',      label: 'Grades & Marks',       route: '/institution/analytics?tab=grades' },
  { id: 'integrity',   label: 'Integrity Violations', route: '/institution/analytics?tab=integrity' },
  { id: 'engagement',  label: 'Engagement Signals',   route: '/institution/analytics?tab=engagement' },
  { id: 'risk',        label: 'Risk Early Warning',   route: '/institution/analytics?tab=risk' },
  { id: 'ai-usage',    label: 'AI & Telemetry',       route: '/institution/analytics?tab=ai-usage' },
  { id: 'instructors', label: 'Instructors',          route: '/institution/analytics?tab=instructors' },
];

const NAV_MAIN = [
  { id: 'Dashboard',      Icon: LayoutDashboard, route: '/institution/dashboard',     hasChevron: false },
  { id: 'Users',          Icon: Users,           route: '/institution/users',         hasChevron: false },
  { id: 'Academic',       Icon: GraduationCap,   route: '/institution/academic',      hasChevron: true },
  { id: 'Sessions',       Icon: Calendar,        route: '/institution/sessions?tab=live', hasChevron: true },
  { id: 'Analytics',      Icon: BarChart3,       route: '/institution/analytics?tab=overview', hasChevron: true },
  { id: 'Announcements',  Icon: Megaphone,       route: '/institution/announcements', hasChevron: false },
];

const NAV_MANAGEMENT = [
  { id: 'Notifications',         Icon: Bell,        route: '/institution/notifications' },
  { id: 'Audit Log',             Icon: ShieldCheck, route: '/institution/audit-log' },
  { id: 'Billing & Plan',        Icon: CreditCard,  route: '/institution/billing' },
  { id: 'Environment Requests',  Icon: Layers,      route: '/institution/environments' },
  { id: 'Institution Settings',  Icon: Settings,    route: '/institution/settings' },
];

const NAV_AI_TOOLS = [
  { id: 'AI & Usage',            Icon: Cpu,         route: '/institution/ai-usage' },
  { id: 'Security & Compliance', Icon: ShieldCheck, route: '/institution/security' },
  { id: 'Help & FAQ',            Icon: HelpCircle,  route: '/institution/help' },
];

const NAV_ACCOUNT = [
  { id: 'Profile',  Icon: User,   route: '/institution/profile' },
  { id: 'Logout',   Icon: LogOut, route: '/login', isLogout: true },
];

/* Mobile bottom tab bar — the five destinations an admin needs one tap away.
   Everything else lives in the "More" sheet, which mirrors the full sidebar. */
const BOTTOM_TABS = [
  { id: 'Dashboard', label: 'Home',      Icon: LayoutDashboard, route: '/institution/dashboard' },
  { id: 'Users',     label: 'Users',     Icon: Users,           route: '/institution/users' },
  { id: 'Sessions',  label: 'Sessions',  Icon: Calendar,        route: '/institution/sessions?tab=live' },
  { id: 'Analytics', label: 'Insights',  Icon: BarChart3,       route: '/institution/analytics?tab=overview' },
  { id: 'More',      label: 'More',      Icon: MoreHorizontal,  route: '' },
];

interface InstitutionShellProps {
  activePage: string;
  activeSubPage?: string;
  activeSubPageLabel?: string;
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export default function InstitutionShell({
  activePage, activeSubPage, activeSubPageLabel, children, title, subtitle,
}: InstitutionShellProps) {
  const router = useRouter();
  const { user, clearAuth, setUser } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [academicOpen, setAcademicOpen] = useState(activePage === 'Academic');
  const [sessionsOpen, setSessionsOpen] = useState(activePage === 'Sessions');
  const [analyticsOpen, setAnalyticsOpen] = useState(activePage === 'Analytics');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  // Auto-sync institution_name into auth storage if missing
  useEffect(() => {
    if (!user?.institution_name && user?.institution_id) {
      authService.getMe().then(updatedUser => {
        if (updatedUser?.institution_name) {
          setUser({ ...user, ...updatedUser });
        }
      }).catch(() => {});
    }
  }, [user?.institution_name, user?.institution_id, setUser]);

  const institutionDisplayName = user?.institution_name || (user?.institution_id ? `Inst. ${user.institution_id.slice(0, 8).toUpperCase()}` : 'Institution');

  const institutionInitials = useMemo(() => {
    if (user?.institution_name) {
      const parts = user.institution_name.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return user.institution_name.slice(0, 2).toUpperCase();
    }
    return 'IA';
  }, [user?.institution_name]);


  // Sync open state when activePage changes
  useEffect(() => {
    if (activePage === 'Academic') {
      setAcademicOpen(true);
    } else if (activePage === 'Sessions') {
      setSessionsOpen(true);
    } else if (activePage === 'Analytics') {
      setAnalyticsOpen(true);
    }
  }, [activePage]);
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
    setMoreOpen(false);
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

  // Global search field — rendered in the desktop header and in the mobile
  // app bar. State is shared, so both stay in sync.
  const renderGlobalSearch = () => (
    <div className={styles.searchBar} style={{ ...(searchFocused ? { borderColor: '#7c3aed', boxShadow: '0 0 0 3px rgba(124,58,237,0.1)' } : {}), position: 'relative' }}>
      <Search size={14} strokeWidth={2} className={styles.searchIcon} />
      <input type="text" placeholder="Search students, instructors, batches, subjects..." value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') { setSearchQuery(''); setSearchHits([]); }
          if (e.key === 'Enter' && searchQuery.trim()) {
            router.push(`/institution/users?search=${encodeURIComponent(searchQuery.trim())}`);
            setSearchQuery(''); setSearchHits([]);
          }
        }}
        onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)}
        style={{ border:'none', outline:'none', background:'transparent', fontSize:13, color:'#1e293b', fontFamily:"'Manrope',sans-serif", width:'100%', padding:0 }} />
      <kbd className={styles.searchKbd} style={{ fontSize: 10 }}>Ctrl K</kbd>

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
  );

  // Compact title for the mobile app bar (sub-page label wins over the section).
  const mobileBarTitle = activeSubPageLabel || activePage;

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
              <span className={styles.institutionName} title={institutionDisplayName}>
                {institutionDisplayName}
              </span>
              <span className={styles.institutionRole}>Admin Portal</span>
            </div>
          )}

          <nav className={styles.navGroup}>
            <span className={styles.navLabel}>Main</span>
            <ul>
              {NAV_MAIN.map(({ id, Icon, route, hasChevron }) => {
                if (id === 'Academic') {
                  const isAcademicActive = activePage === 'Academic';
                  return (
                    <li key={id} style={{ display: 'flex', flexDirection: 'column' }}>
                      <div
                        className={navCls(id)}
                        title={id}
                        onClick={() => {
                          if (collapsed) {
                            setCollapsed(false);
                            setAcademicOpen(true);
                            go(id, route);
                          } else if (isAcademicActive) {
                            setAcademicOpen(p => !p);
                          } else {
                            setAcademicOpen(true);
                            go(id, route);
                          }
                        }}
                      >
                        <Icon size={17} strokeWidth={1.9} className={styles.navIcon} />
                        <span className={styles.label}>{id}</span>
                        {!collapsed && (
                          <button
                            type="button"
                            className={styles.navChevron}
                            onClick={(e) => {
                              e.stopPropagation();
                              setAcademicOpen(p => !p);
                            }}
                            title={academicOpen ? "Collapse Academic" : "Expand Academic"}
                          >
                            {academicOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        )}
                      </div>

                      {!collapsed && academicOpen && (
                        <ul className={styles.subnavGroup}>
                          {ACADEMIC_SUBNAV.map(sub => {
                            const isSubActive = isAcademicActive && (activeSubPage === sub.id || (!activeSubPage && sub.id === 'years'));
                            return (
                              <li
                                key={sub.id}
                                className={`${styles.subnavItem} ${isSubActive ? styles.subnavItemActive : ''}`}
                                onClick={e => {
                                  e.stopPropagation();
                                  go(sub.id, sub.route);
                                }}
                              >
                                <span className={`${styles.subnavDot} ${isSubActive ? styles.subnavDotActive : ''}`} />
                                <span>{sub.label}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                }

                if (id === 'Sessions') {
                  const isSessionsActive = activePage === 'Sessions';
                  return (
                    <li key={id} style={{ display: 'flex', flexDirection: 'column' }}>
                      <div
                        className={navCls(id)}
                        title={id}
                        onClick={() => {
                          if (collapsed) {
                            setCollapsed(false);
                            setSessionsOpen(true);
                            go(id, route);
                          } else if (isSessionsActive) {
                            setSessionsOpen(p => !p);
                          } else {
                            setSessionsOpen(true);
                            go(id, route);
                          }
                        }}
                      >
                        <Icon size={17} strokeWidth={1.9} className={styles.navIcon} />
                        <span className={styles.label}>{id}</span>
                        {!collapsed && (
                          <button
                            type="button"
                            className={styles.navChevron}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSessionsOpen(p => !p);
                            }}
                            title={sessionsOpen ? "Collapse Sessions" : "Expand Sessions"}
                          >
                            {sessionsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        )}
                      </div>

                      {!collapsed && sessionsOpen && (
                        <ul className={styles.subnavGroup}>
                          {SESSIONS_SUBNAV.map(sub => {
                            const isSubActive = isSessionsActive && (activeSubPage === sub.id || (!activeSubPage && sub.id === 'live'));
                            return (
                              <li
                                key={sub.id}
                                className={`${styles.subnavItem} ${isSubActive ? styles.subnavItemActive : ''}`}
                                onClick={e => {
                                  e.stopPropagation();
                                  go(sub.id, sub.route);
                                }}
                              >
                                <span className={`${styles.subnavDot} ${isSubActive ? styles.subnavDotActive : ''}`} />
                                <span>{sub.label}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                }

                if (id === 'Analytics') {
                  const isAnalyticsActive = activePage === 'Analytics';
                  return (
                    <li key={id} style={{ display: 'flex', flexDirection: 'column' }}>
                      <div
                        className={navCls(id)}
                        title={id}
                        onClick={() => {
                          if (collapsed) {
                            setCollapsed(false);
                            setAnalyticsOpen(true);
                            go(id, route);
                          } else if (isAnalyticsActive) {
                            setAnalyticsOpen(p => !p);
                          } else {
                            setAnalyticsOpen(true);
                            go(id, route);
                          }
                        }}
                      >
                        <Icon size={17} strokeWidth={1.9} className={styles.navIcon} />
                        <span className={styles.label}>{id}</span>
                        {!collapsed && (
                          <button
                            type="button"
                            className={styles.navChevron}
                            onClick={(e) => {
                              e.stopPropagation();
                              setAnalyticsOpen(p => !p);
                            }}
                            title={analyticsOpen ? "Collapse Analytics" : "Expand Analytics"}
                          >
                            {analyticsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        )}
                      </div>

                      {!collapsed && analyticsOpen && (
                        <ul className={styles.subnavGroup}>
                          {ANALYTICS_SUBNAV.map(sub => {
                            const isSubActive = isAnalyticsActive && (activeSubPage === sub.id || (!activeSubPage && sub.id === 'overview'));
                            return (
                              <li
                                key={sub.id}
                                className={`${styles.subnavItem} ${isSubActive ? styles.subnavItemActive : ''}`}
                                onClick={e => {
                                  e.stopPropagation();
                                  go(sub.id, sub.route);
                                }}
                              >
                                <span className={`${styles.subnavDot} ${isSubActive ? styles.subnavDotActive : ''}`} />
                                <span>{sub.label}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                }

                return (
                  <li key={id} className={navCls(id)} title={id} onClick={() => go(id, route)}>
                    <Icon size={17} strokeWidth={1.9} className={styles.navIcon} />
                    <span className={styles.label}>{id}</span>
                    {hasChevron && !collapsed && (
                      <ChevronRight size={13} className={styles.navChevron} />
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>

          <nav className={styles.navGroup}>
            <span className={styles.navLabel}>Management</span>
            <ul>
              {NAV_MANAGEMENT.map(({ id, Icon, route }) => (
                <li key={id} className={navCls(id)} title={id} onClick={() => go(id, route)}>
                  <Icon size={17} strokeWidth={1.9} className={styles.navIcon} />
                  <span className={styles.label}>{id}</span>
                </li>
              ))}
            </ul>
          </nav>

          <nav className={styles.navGroup}>
            <span className={styles.navLabel}>AI & Tools</span>
            <ul>
              {NAV_AI_TOOLS.map(({ id, Icon, route }) => (
                <li key={id} className={navCls(id)} title={id} onClick={() => go(id, route)}>
                  <Icon size={17} strokeWidth={1.9} className={styles.navIcon} />
                  <span className={styles.label}>{id}</span>
                </li>
              ))}
            </ul>
          </nav>

          <nav className={styles.navGroup}>
            <span className={styles.navLabel}>Account</span>
            <ul>
              {NAV_ACCOUNT.map(({ id, Icon, route, isLogout }) => (
                <li key={id} className={navCls(id, isLogout)} title={id} onClick={() => go(id, route)}>
                  <Icon size={17} strokeWidth={1.9} className={styles.navIcon} />
                  <span className={styles.label}>{id}</span>
                </li>
              ))}
            </ul>
          </nav>

          {!collapsed && (
            <div className={styles.promoBanner} style={{ marginTop: 'auto', cursor: 'pointer' }} onClick={() => router.push('/institution/billing')}>
              <div className={styles.promoIcon} style={{ background: '#fef3c7', color: '#f59e0b' }}>
                <Crown size={16} />
              </div>
              <div className={styles.promoBody}>
                <h4 className={styles.promoTitle}>NexLab Pro</h4>
                <p className={styles.promoText}>Scale your institution with advanced features.</p>
                <span className={styles.promoLink}>Manage Plan &rarr;</span>
              </div>
            </div>
          )}
        </aside>

        {/* ══ MAIN ══ */}
        <main className={styles.content} data-portal="institution">
          {/* ══ MOBILE APP BAR — designed for phones; hidden on desktop ══ */}
          <div className={styles.mobileAppBar}>
            <button className={styles.mobileBarBtn} onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <Menu size={20} strokeWidth={2.1} />
            </button>
            <span className={styles.mobileBarTitle}>{mobileBarTitle}</span>
            <div className={styles.mobileBarActions}>
              <ShellNotifications buttonClass={styles.iconBtn} dotClass={styles.notifDot} role="institution_admin" />
              <ShellProfileMenu
                name={user?.full_name ?? institutionDisplayName}
                email={user?.email}
                initials={user?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? institutionInitials}
                roleLabel="Institution Admin"
                profileHref="/institution/profile"
                settingsHref="/institution/settings"
                buttonClass={styles.profileChip}
                avatarClass={styles.avatarLg}
                avatarStyle={{ background: '#7c3aed', width: 32, height: 32, fontSize: 12 }}
                onSignOut={() => go('Logout', '/login')}
              />
            </div>
          </div>
          <div className={styles.mobileSearchRow}>{renderGlobalSearch()}</div>

          <div className={styles.contentHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className={styles.mobileMenuBtn} onClick={() => setMobileOpen(true)}>
                <Menu size={18} strokeWidth={2} />
              </button>
              <div className={styles.breadcrumb}>
                Institution <ChevronRight size={14} className={styles.breadSep} />
                {activePage === 'Academic' && activeSubPageLabel ? (
                  <>
                    <span style={{ cursor: 'pointer' }} onClick={() => router.push('/institution/academic?tab=years')}>Academic</span>
                    <ChevronRight size={14} className={styles.breadSep} />
                    <strong>{activeSubPageLabel}</strong>
                  </>
                ) : activePage === 'Sessions' && activeSubPageLabel ? (
                  <>
                    <span style={{ cursor: 'pointer' }} onClick={() => router.push('/institution/sessions?tab=live')}>Sessions</span>
                    <ChevronRight size={14} className={styles.breadSep} />
                    <strong>{activeSubPageLabel}</strong>
                  </>
                ) : activePage === 'Analytics' ? (
                  <>
                    <span style={{ cursor: 'pointer' }} onClick={() => router.push('/institution/analytics?tab=overview')}>Analytics</span>
                    {activeSubPageLabel && (
                      <>
                        <ChevronRight size={14} className={styles.breadSep} />
                        <strong>{activeSubPageLabel}</strong>
                      </>
                    )}
                  </>
                ) : (
                  <strong>{activePage}</strong>
                )}
              </div>
            </div>
            <div className={styles.headerRight}>
              {renderGlobalSearch()}
              <ShellNotifications buttonClass={styles.iconBtn} dotClass={styles.notifDot} role="institution_admin" />
              <ShellProfileMenu
                name={user?.full_name ?? institutionDisplayName}
                email={user?.email}
                initials={user?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? institutionInitials}
                roleLabel="Institution Admin"
                profileHref="/institution/profile"
                settingsHref="/institution/settings"
                buttonClass={styles.profileChip}
                avatarClass={styles.avatarLg}
                avatarStyle={{ background: '#7c3aed', width: 32, height: 32, fontSize: 12 }}
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

      {/* ══ MOBILE BOTTOM TAB BAR (app-style; hidden on desktop) ══ */}
      <nav className={styles.bottomTabBar} aria-label="Primary">
        {BOTTOM_TABS.map(({ id, label, Icon, route }) => {
          const active = id !== 'More' && activePage === id;
          return (
            <button
              key={id}
              className={`${styles.bottomTab} ${active ? styles.bottomTabActive : ''}`}
              onClick={() => (id === 'More' ? setMoreOpen(true) : go(id, route))}
            >
              <Icon size={20} strokeWidth={active ? 2.3 : 1.9} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {/* ══ MOBILE "MORE" SHEET — mirrors the full sidebar ══ */}
      {moreOpen && (
        <>
          <div className={styles.sheetBackdrop} onClick={() => setMoreOpen(false)} />
          <div className={styles.moreSheet} role="dialog" aria-label="All sections">
            <div className={styles.moreSheetHeader}>
              <div>
                <p className={styles.moreSheetTitle}>{institutionDisplayName}</p>
                <p className={styles.moreSheetRole}>Admin Portal</p>
              </div>
              <button className={styles.moreSheetClose} onClick={() => setMoreOpen(false)} aria-label="Close menu">
                <X size={18} />
              </button>
            </div>

            <div className={styles.moreSheetBody}>
              <p className={styles.moreSheetGroup}>Academic</p>
              {ACADEMIC_SUBNAV.map(sub => (
                <button key={sub.id} className={`${styles.moreSheetItem} ${activePage === 'Academic' && activeSubPage === sub.id ? styles.moreSheetItemActive : ''}`} onClick={() => go(sub.id, sub.route)}>
                  <GraduationCap size={16} className={styles.moreSheetIcon} />
                  {sub.label}
                </button>
              ))}

              <p className={styles.moreSheetGroup}>Sessions</p>
              {SESSIONS_SUBNAV.map(sub => (
                <button key={sub.id} className={`${styles.moreSheetItem} ${activePage === 'Sessions' && activeSubPage === sub.id ? styles.moreSheetItemActive : ''}`} onClick={() => go(sub.id, sub.route)}>
                  <Calendar size={16} className={styles.moreSheetIcon} />
                  {sub.label}
                </button>
              ))}

              <p className={styles.moreSheetGroup}>Analytics</p>
              {ANALYTICS_SUBNAV.map(sub => (
                <button key={sub.id} className={`${styles.moreSheetItem} ${activePage === 'Analytics' && activeSubPage === sub.id ? styles.moreSheetItemActive : ''}`} onClick={() => go(sub.id, sub.route)}>
                  <BarChart3 size={16} className={styles.moreSheetIcon} />
                  {sub.label}
                </button>
              ))}

              <p className={styles.moreSheetGroup}>Institution</p>
              {[...NAV_MAIN.filter(n => !['Dashboard', 'Users', 'Academic', 'Sessions', 'Analytics'].includes(n.id)),
                ...NAV_MANAGEMENT,
                ...NAV_AI_TOOLS,
                ...NAV_ACCOUNT].map(item => {
                const isLogout = 'isLogout' in item && item.isLogout;
                return (
                  <button key={item.id} className={`${styles.moreSheetItem} ${item.id === activePage ? styles.moreSheetItemActive : ''} ${isLogout ? styles.moreSheetItemLogout : ''}`} onClick={() => go(item.id, item.route)}>
                    <item.Icon size={16} className={styles.moreSheetIcon} />
                    {item.id}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      <AppToaster />
      <AgentChatPanel />
    </div>
  );
}
