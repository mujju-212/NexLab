'use client';

/**
 * Shell widgets — the notification bell (with a real unread badge, a real
 * dropdown and mark-as-read) and a live search box, shared by every role
 * shell. Previously each shell rendered a dead <span>Search</span> and a
 * bell with a hardcoded red dot.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell, Search, CheckCircle2, Calendar, Trophy, AlertTriangle,
  Megaphone, RotateCcw, FlaskConical, BookOpen, GraduationCap, X, Radio, User, Settings, LogOut, ChevronDown,
} from 'lucide-react';
import { notificationService, type NotificationRow } from '@/services/notification.service';
import { getGlobalSocket } from '@/lib/socket';

// ── helpers ──────────────────────────────────────────────────────────────────

export function timeAgo(iso?: string | null): string {
  if (!iso) return '';
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

const NOTIF_META: Record<string, { Icon: typeof Bell; color: string; bg: string }> = {
  session_reminder:  { Icon: Calendar,      color: '#7c3aed', bg: 'rgba(124,58,237,.09)' },
  session_scheduled: { Icon: Calendar,      color: '#7c3aed', bg: 'rgba(124,58,237,.09)' },
  session_started:   { Icon: Radio,         color: '#16a34a', bg: 'rgba(22,163,74,.12)' },
  session_ended:     { Icon: CheckCircle2,  color: '#64748b', bg: 'rgba(100,116,139,.12)' },
  grade_published:   { Icon: Trophy,        color: '#d97706', bg: 'rgba(217,119,6,.09)'  },
  alert:             { Icon: AlertTriangle, color: '#dc2626', bg: 'rgba(239,68,68,.09)'  },
  announcement:      { Icon: Megaphone,     color: '#0ea5e9', bg: 'rgba(14,165,233,.09)' },
  catchup_available: { Icon: RotateCcw,     color: '#059669', bg: 'rgba(16,185,129,.09)' },
};

// ── Notification bell + dropdown ─────────────────────────────────────────────

export function ShellNotifications({
  buttonClass,
  dotClass,
  role,
}: {
  buttonClass?: string;
  dotClass?: string;
  role: 'student' | 'instructor' | 'institution_admin' | 'platform_admin' | 'free_user';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const refreshFull = useCallback(async (): Promise<boolean> => {
    try {
      const res = await notificationService.list();
      setRows(res.notifications ?? []);
      setUnread(res.unread ?? 0);
      setLoadError(null);
      return true;
    } catch {
      setLoadError('Could not load notifications. Try again.');
      return false;
    }
  }, []);

  const refreshUnread = useCallback(async () => {
    try {
      setUnread(await notificationService.unreadCount());
    } catch { /* keep the last known badge count */ }
  }, []);

  useEffect(() => {
    refreshUnread();
    const t = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (open) refreshFull();
      else refreshUnread();
    }, 120_000);
    return () => clearInterval(t);
  }, [open, refreshUnread, refreshFull]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setActionError(null);
    refreshFull().finally(() => setLoading(false));
  }, [open, refreshFull]);

  useEffect(() => {
    const socket = getGlobalSocket();
    if (!socket) return;
    const onIncoming = () => open ? refreshFull() : refreshUnread();
    socket.on('new_notification', onIncoming);
    socket.on('session_started', onIncoming);
    socket.on('session_ended', onIncoming);
    return () => {
      socket.off('new_notification', onIncoming);
      socket.off('session_started', onIncoming);
      socket.off('session_ended', onIncoming);
    };
  }, [open, refreshFull, refreshUnread]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const routeFor = (type: string): string => {
    if (type === 'announcement') {
      if (role === 'student') return '/student/announcements';
      if (role === 'instructor') return '/instructor/announcements';
      if (role === 'institution_admin') return '/institution/announcements';
      if (role === 'free_user') return '/practice/dashboard';
      return '/admin/dashboard';
    }
    if (type.startsWith('session_') || type === 'session_reminder' || type === 'session_scheduled') {
      if (role === 'student') return '/student/live-lab';
      if (role === 'instructor') return '/instructor/sessions';
      if (role === 'institution_admin') return '/institution/sessions?tab=history';
      if (role === 'free_user') return '/practice/dashboard';
      return '/admin/monitoring';
    }
    if (role === 'student') return '/student/dashboard';
    if (role === 'instructor') return '/instructor/analytics';
    if (role === 'institution_admin') return '/institution/dashboard';
    if (role === 'free_user') return '/practice/dashboard';
    return '/admin/dashboard';
  };

  const openNotification = async (n: NotificationRow) => {
    if (!n.is_read) {
      try {
        await notificationService.markRead(n.id);
        setRows(current => current.map(row => row.id === n.id ? { ...row, is_read: true } : row));
        setUnread(current => Math.max(0, current - 1));
      } catch {
        setActionError('Could not mark this notification as read.');
      }
    }
    const href = routeFor(n.type);
    setOpen(false);
    router.push(href);
  };

  const markAllRead = async () => {
    try {
      await notificationService.markAllRead();
      setRows(current => current.map(row => ({ ...row, is_read: true })));
      setUnread(0);
      setActionError(null);
    } catch {
      setActionError('Could not mark notifications as read. Try again.');
    }
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className={buttonClass}
        onClick={() => setOpen(o => !o)}
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
        title={unread > 0 ? `${unread} unread notification(s)` : 'Notifications'}
      >
        <Bell size={16} strokeWidth={1.9} />
        {unread > 0 && (
          <span className={dotClass} data-count={unread > 9 ? '9+' : unread}
            style={{ display: 'flex', width: unread > 9 ? 20 : 16, height: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 999, color: '#fff', fontSize: 9, lineHeight: 1, fontWeight: 800 }} title={`${unread} unread`}>{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <section
          role="dialog"
          aria-label="Notifications"
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 10px)', zIndex: 200,
            width: 'min(360px, calc(100vw - 24px))', background: '#fff', borderRadius: 14,
            border: '1px solid #ede9fe', boxShadow: '0 18px 44px -12px rgba(30,20,60,.3)', overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #f1ecfb' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#201b2e' }}>Notifications</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {unread > 0 && <button type="button" onClick={markAllRead} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', fontSize: 11.5, fontWeight: 700 }}>Mark all read</button>}
              <button type="button" onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9891a6' }} aria-label="Close notifications"><X size={14} /></button>
            </div>
          </div>
          {actionError && <p role="alert" style={{ margin: 0, padding: '8px 16px', color: '#b91c1c', fontSize: 11.5, background: '#fef2f2' }}>{actionError}</p>}
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {loading ? (
              <p style={{ padding: 20, textAlign: 'center', fontSize: 12.5, color: '#9891a6' }}>Loading…</p>
            ) : loadError ? (
              <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                <p role="alert" style={{ margin: '0 0 10px', fontSize: 12.5, color: '#b91c1c' }}>{loadError}</p>
                <button type="button" onClick={() => { setLoading(true); refreshFull().finally(() => setLoading(false)); }} style={{ border: '1px solid #ddd6fe', borderRadius: 8, background: '#faf5ff', color: '#6d28d9', padding: '7px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Retry</button>
              </div>
            ) : rows.length === 0 ? (
              <div style={{ padding: '28px 16px', textAlign: 'center' }}>
                <Bell size={26} style={{ margin: '0 auto 10px', color: '#d9d3e8' }} />
                <p style={{ margin: 0, fontSize: 13, color: '#9891a6' }}>You're all caught up.</p>
              </div>
            ) : (
              rows.map(n => {
                const meta = NOTIF_META[n.type] ?? NOTIF_META.alert;
                return (
                  <button key={n.id} type="button" onClick={() => openNotification(n)} style={{
                    display: 'flex', width: '100%', gap: 11, padding: '12px 16px', textAlign: 'left',
                    border: 0, borderBottom: '1px solid #f5f3ff',
                    background: n.is_read ? '#fff' : 'rgba(124,58,237,.045)', cursor: 'pointer',
                  }}>
                    <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: meta.bg, color: meta.color }}><meta.Icon size={14} /></span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {!n.is_read && <span style={{ width: 6, height: 6, borderRadius: 3, background: '#7c3aed', flexShrink: 0 }} />}
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#201b2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
                      </span>
                      <span style={{ display: 'block', fontSize: 12, color: '#726a85', marginTop: 2, whiteSpace: 'pre-wrap' }}>{n.message}</span>
                      <span style={{ display: 'block', fontSize: 10.5, color: '#b3accc', marginTop: 4 }}>{timeAgo(n.created_at)}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export function ShellProfileMenu({
  name,
  email,
  initials,
  roleLabel,
  profileHref,
  settingsHref,
  buttonClass,
  avatarClass,
  onSignOut,
  avatarStyle,
}: {
  name: string;
  email?: string | null;
  initials: string;
  roleLabel: string;
  profileHref: string;
  settingsHref?: string;
  buttonClass?: string;
  avatarClass?: string;
  onSignOut: () => void;
  avatarStyle?: React.CSSProperties;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const go = (href: string) => { setOpen(false); router.push(href); };
  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button type="button" className={buttonClass} onClick={() => setOpen(v => !v)} aria-expanded={open} aria-haspopup="menu" aria-label="Open profile menu" style={{ font: 'inherit', color: 'inherit' }}>
        <div className={avatarClass} style={avatarStyle}>{initials || 'U'}</div>
        <span className="shellProfileName" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{name || 'Account'}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 220, width: 240, background: '#fff', border: '1px solid #ede9fe', borderRadius: 14, boxShadow: '0 18px 44px -12px rgba(30,20,60,.28)', overflow: 'hidden' }}>
          <div style={{ padding: '13px 15px', borderBottom: '1px solid #f1ecfb' }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#201b2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name || 'Account'}</p>
            <p style={{ margin: '3px 0 0', fontSize: 11.5, color: '#7b728b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email || roleLabel}</p>
            <p style={{ margin: '4px 0 0', fontSize: 10.5, color: '#8b5cf6', fontWeight: 700 }}>{roleLabel}</p>
          </div>
          <button type="button" role="menuitem" onClick={() => go(profileHref)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', border: 0, background: '#fff', padding: '10px 15px', textAlign: 'left', cursor: 'pointer', color: '#201b2e', fontSize: 12.5 }}><User size={14} color="#7c3aed" /> My Profile</button>
          {settingsHref && <button type="button" role="menuitem" onClick={() => go(settingsHref)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', border: 0, background: '#fff', padding: '10px 15px', textAlign: 'left', cursor: 'pointer', color: '#201b2e', fontSize: 12.5 }}><Settings size={14} color="#7c3aed" /> Settings</button>}
          <div style={{ height: 1, background: '#f1ecfb' }} />
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onSignOut(); }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', border: 0, background: '#fff', padding: '10px 15px', textAlign: 'left', cursor: 'pointer', color: '#b91c1c', fontSize: 12.5 }}><LogOut size={14} /> Sign out</button>
        </div>
      )}
    </div>
  );
}

export interface SearchHit {
  type: string;
  id: string;
  label: string;
  sub_label?: string | null;
  link?: string;
}

const HIT_ICONS: Record<string, typeof Search> = {
  user: GraduationCap,
  student: GraduationCap,
  section: BookOpen,
  experiment: FlaskConical,
  session: Calendar,
  problem: BookOpen,
};

export function ShellSearchBox({
  className, placeholder = 'Search…', fetcher, onSelect, kbd = '↵',
}: {
  className?: string;
  placeholder?: string;
  fetcher: (q: string) => Promise<SearchHit[]>;
  onSelect: (hit: SearchHit) => void;
  kbd?: string;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const query = q.trim();
    if (query.length < 2) { setHits([]); return; }
    timer.current = setTimeout(async () => {
      const res = await fetcher(query).catch(() => [] as SearchHit[]);
      setHits(res);
      setOpen(true);
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, fetcher]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className={className} style={{ position: 'relative' }}>
      <Search size={14} strokeWidth={2} className="searchIcon" />
      <input
        type="text"
        placeholder={placeholder}
        value={q}
        onChange={e => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={e => { if (e.key === 'Escape') { setQ(''); setHits([]); } }}
        style={{
          border: 'none', outline: 'none', background: 'transparent',
          fontSize: 13, color: '#1e293b', fontFamily: "'Manrope', sans-serif",
          width: '100%', padding: 0,
        }}
      />
      <kbd className="searchKbd">{kbd}</kbd>

      {open && q.trim().length >= 2 && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 120,
            background: '#fff', borderRadius: 12, border: '1px solid #ede9fe',
            boxShadow: '0 14px 38px -10px rgba(30,20,60,.25)', overflow: 'hidden',
            maxHeight: 340, overflowY: 'auto',
          }}
        >
          {hits.length === 0 ? (
            <p style={{ margin: 0, padding: '12px 14px', fontSize: 12.5, color: '#9891a6' }}>
              No matches.
            </p>
          ) : (
            hits.map(hit => {
              const HitIcon = HIT_ICONS[hit.type] ?? Search;
              return (
                <button
                  key={`${hit.type}-${hit.id}`}
                  onMouseDown={e => { e.preventDefault(); onSelect(hit); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '10px 14px', background: 'none', border: 'none',
                    borderBottom: '1px solid #f5f3ff', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{
                    width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(124,58,237,.09)', color: '#7c3aed',
                  }}>
                    <HitIcon size={13} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      display: 'block', fontSize: 13, fontWeight: 600, color: '#201b2e',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{hit.label}</span>
                    <span style={{
                      display: 'block', fontSize: 11, color: '#9891a6',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{hit.sub_label || hit.type}</span>
                  </span>
                  <span style={{
                    fontSize: 10.5, fontWeight: 700, color: '#7c3aed', textTransform: 'capitalize',
                  }}>{hit.type}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
