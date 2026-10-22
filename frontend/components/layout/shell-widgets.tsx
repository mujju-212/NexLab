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
  Megaphone, RotateCcw, FlaskConical, BookOpen, GraduationCap, X, Radio,
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

export function ShellNotifications({ buttonClass, dotClass }: { buttonClass?: string; dotClass?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const refreshFull = useCallback(async () => {
    try {
      const res = await notificationService.list();
      setRows(res.notifications ?? []);
      setUnread(res.unread ?? 0);
    } catch { /* silent */ }
  }, []);

  const refreshUnread = useCallback(async () => {
    try {
      const count = await notificationService.unreadCount();
      setUnread(count);
    } catch { /* silent */ }
  }, []);

  const refresh = refreshFull;

  // Initial load + 120s badge poll (lightweight unreadCount if closed, real-time socket delivers instant events)
  useEffect(() => {
    refreshUnread();
    const t = setInterval(() => {
      if (typeof document !== 'undefined' && (document.visibilityState === 'hidden' || document.hidden)) return;
      if (open) {
        refreshFull();
      } else {
        refreshUnread();
      }
    }, 120_000);
    return () => clearInterval(t);
  }, [open, refreshUnread, refreshFull]);

  // When opening dropdown, fetch full list immediately
  useEffect(() => {
    if (open) {
      refreshFull();
    }
  }, [open, refreshFull]);

  // Real-time socket listeners for instant notification delivery
  useEffect(() => {
    const socket = getGlobalSocket();
    if (!socket) return;

    const onIncoming = () => {
      refresh();
    };

    socket.on('new_notification', onIncoming);
    socket.on('session_started', onIncoming);
    socket.on('session_ended', onIncoming);

    return () => {
      socket.off('new_notification', onIncoming);
      socket.off('session_started', onIncoming);
      socket.off('session_ended', onIncoming);
    };
  }, [refresh]);

  // Open → refresh + mark everything read (badge clears)
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    refresh().finally(() => {
      setLoading(false);
      notificationService.markAllRead().then(() => setUnread(0)).catch(() => {});
    });
  }, [open, refresh]);

  // Outside click closes
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        className={buttonClass}
        onClick={() => setOpen(o => !o)}
        aria-label="Notifications"
        title={unread > 0 ? `${unread} unread notification(s)` : 'Notifications'}
      >
        <Bell size={16} strokeWidth={1.9} />
        {unread > 0 && (
          <span
            className={dotClass}
            data-count={unread > 9 ? '9+' : unread}
            style={{ display: 'flex' }}
            title={`${unread} unread`}
          />
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 10px)', zIndex: 200,
            width: 340, background: '#fff', borderRadius: 14, border: '1px solid #ede9fe',
            boxShadow: '0 18px 44px -12px rgba(30,20,60,.3)', overflow: 'hidden',
          }}
        >
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', borderBottom: '1px solid #f1ecfb',
          }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#201b2e' }}>Notifications</span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9891a6' }}
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>

          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {loading ? (
              <p style={{ padding: 20, textAlign: 'center', fontSize: 12.5, color: '#9891a6' }}>Loading…</p>
            ) : rows.length === 0 ? (
              <div style={{ padding: '28px 16px', textAlign: 'center' }}>
                <Bell size={26} style={{ margin: '0 auto 10px', color: '#d9d3e8' }} />
                <p style={{ margin: 0, fontSize: 13, color: '#9891a6' }}>You're all caught up.</p>
              </div>
            ) : (
              rows.map(n => {
                const meta = NOTIF_META[n.type] ?? NOTIF_META.alert;
                const isActionable = n.type === 'session_started';
                return (
                  <div
                    key={n.id}
                    onClick={() => {
                      if (isActionable) {
                        setOpen(false);
                        router.push('/student/live-lab');
                      }
                    }}
                    style={{
                      display: 'flex', gap: 11, padding: '12px 16px',
                      borderBottom: '1px solid #f5f3ff',
                      background: n.is_read ? 'transparent' : 'rgba(124,58,237,.045)',
                      cursor: isActionable ? 'pointer' : 'default',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <span
                      style={{
                        width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: meta.bg, color: meta.color,
                      }}
                    >
                      <meta.Icon size={14} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {!n.is_read && <span style={{ width: 6, height: 6, borderRadius: 3, background: '#7c3aed', flexShrink: 0 }} />}
                        <span style={{
                          fontSize: 13, fontWeight: 700, color: '#201b2e',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{n.title}</span>
                      </span>
                      <span style={{
                        display: 'block', fontSize: 12, color: '#726a85', marginTop: 2,
                        whiteSpace: 'pre-wrap',
                      }}>{n.message}</span>
                      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                        <span style={{ fontSize: 10.5, color: '#b3accc' }}>
                          {timeAgo(n.created_at)}
                        </span>
                        {isActionable && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a' }}>
                            Join Lab →
                          </span>
                        )}
                      </span>
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Live search box ──────────────────────────────────────────────────────────

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
