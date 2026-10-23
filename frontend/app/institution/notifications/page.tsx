'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, CircleAlert, Mail, RefreshCw, Send, Smartphone, Loader2, Check } from 'lucide-react';
import InstitutionShell from '@/components/layout/InstitutionShell';
import { institutionService } from '@/services/institution.service';
import { notificationService, type NotificationRow } from '@/services/notification.service';
import { useAuthStore } from '@/store/auth-store';
import styles from './notifications.module.css';

function relativeTime(value: string | null) {
  if (!value) return 'Recently';
  const age = Math.max(0, Date.now() - new Date(value).getTime());
  const mins = Math.floor(age / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function InstitutionNotificationsPage() {
  const user = useAuthStore(s => s.user);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true); else setLoading(true);
    try {
      const result = await notificationService.list();
      setRows(result.notifications || []);
      setUnread(result.unread || 0);
      setNotice(null);
    } catch (error) {
      const e = error as { response?: { data?: { error?: string } }; message?: string };
      setNotice({ ok: false, text: e.response?.data?.error || e.message || 'Could not load notifications.' });
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const sendTest = async () => {
    setSendingTest(true); setNotice(null);
    try {
      await institutionService.sendTestNotification('in_app', user?.email || '');
      await load(true);
      setNotice({ ok: true, text: 'A test notice was added to your account. Check the header bell.' });
    } catch (error) {
      const e = error as { response?: { data?: { error?: string } }; message?: string };
      setNotice({ ok: false, text: e.response?.data?.error || e.message || 'Could not create a test notification.' });
    } finally { setSendingTest(false); }
  };

  const markOneRead = async (id: string) => {
    try {
      await notificationService.markRead(id);
      setRows(current => current.map(row => row.id === id ? { ...row, is_read: true } : row));
      setUnread(current => Math.max(0, current - 1));
    } catch {
      setNotice({ ok: false, text: 'Could not mark this notice as read.' });
    }
  };

  const markAllRead = async () => {
    try {
      await notificationService.markAllRead();
      setRows(current => current.map(row => ({ ...row, is_read: true })));
      setUnread(0);
      setNotice({ ok: true, text: 'All in-app notifications marked as read.' });
    } catch {
      setNotice({ ok: false, text: 'Could not mark notifications as read.' });
    }
  };

  return (
    <InstitutionShell activePage="Notifications" title="Notifications" subtitle="Manage and verify the in-app notices delivered to your institution administrator account.">
      <div className={styles.pageGrid}>
        <section style={{ background: '#fff', border: '1px solid #e9e4f2', borderRadius: 18, padding: 20, boxShadow: '0 8px 24px rgba(37,22,62,.045)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div><h2 style={{ margin: 0, color: '#201b2e', fontSize: 17 }}>Recent in-app notices</h2><p style={{ margin: '4px 0 0', color: '#787187', fontSize: 12 }}>{unread} unread · Opening the bell does not mark notices read.</p></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" aria-label="Refresh notifications" onClick={() => void load(true)} disabled={refreshing} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #e5dff0', borderRadius: 9, background: '#fff', padding: '8px 10px', color: '#574d68', cursor: 'pointer', fontSize: 11.5, fontWeight: 700 }}><RefreshCw size={13} /> Refresh</button>
              {unread > 0 && <button type="button" onClick={() => void markAllRead()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 0, borderRadius: 9, background: '#f3e8ff', padding: '8px 10px', color: '#6d28d9', cursor: 'pointer', fontSize: 11.5, fontWeight: 700 }}><CheckCheck size={13} /> Mark all read</button>}
            </div>
          </div>
          {notice && <p role="status" style={{ margin: '0 0 12px', borderRadius: 10, padding: '10px 12px', color: notice.ok ? '#166534' : '#b91c1c', background: notice.ok ? '#f0fdf4' : '#fef2f2', fontSize: 12.5 }}>{notice.text}</p>}
          {loading ? <div style={{ padding: 36, textAlign: 'center', color: '#8b8494' }}><Loader2 size={20} className="animate-spin" /><p>Loading notifications…</p></div> : rows.length === 0 ? (
            <div style={{ padding: '44px 18px', borderRadius: 14, border: '1px dashed #ddd6e8', background: '#faf9fc', textAlign: 'center' }}><Bell size={28} color="#a99fba" style={{ margin: '0 auto 10px' }} /><p style={{ margin: '0 0 4px', color: '#494156', fontSize: 14, fontWeight: 700 }}>No notifications yet</p><p style={{ margin: 0, color: '#8b8494', fontSize: 12 }}>New session and announcement notices will appear here.</p></div>
          ) : (
            <div style={{ display: 'grid', gap: 9 }}>
              {rows.map(row => <article key={row.id} style={{ display: 'flex', gap: 11, padding: 13, borderRadius: 12, border: `1px solid ${row.is_read ? '#eeeaf3' : '#ddd0fb'}`, background: row.is_read ? '#fff' : '#fcfaff' }}>
                <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 10, display: 'grid', placeItems: 'center', background: row.type === 'announcement' ? '#e0f2fe' : '#f3e8ff', color: row.type === 'announcement' ? '#0284c7' : '#7c3aed' }}>{row.type === 'announcement' ? <Mail size={16} /> : <Bell size={16} />}</span>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><h3 style={{ margin: 0, fontSize: 13, color: '#241d31' }}>{row.title}</h3><time style={{ flexShrink: 0, color: '#9a93a7', fontSize: 10.5 }}>{relativeTime(row.created_at)}</time></div><p style={{ margin: '5px 0 0', color: '#625b6d', fontSize: 12.5, whiteSpace: 'pre-wrap' }}>{row.message}</p></div>
                {!row.is_read && <button type="button" aria-label={`Mark ${row.title} read`} onClick={() => void markOneRead(row.id)} style={{ alignSelf: 'center', flexShrink: 0, border: '1px solid #ddd6e8', background: '#fff', borderRadius: 8, padding: 7, color: '#6d28d9', cursor: 'pointer' }}><Check size={14} /></button>}
              </article>)}
            </div>
          )}
        </section>

        <aside style={{ display: 'grid', gap: 14 }}>
          <section style={{ background: '#fff', border: '1px solid #e9e4f2', borderRadius: 18, padding: 20, boxShadow: '0 8px 24px rgba(37,22,62,.045)' }}>
            <div style={{ display: 'flex', gap: 11, alignItems: 'center', marginBottom: 13 }}><span style={{ width: 38, height: 38, borderRadius: 12, background: '#f3e8ff', color: '#7c3aed', display: 'grid', placeItems: 'center' }}><Send size={17} /></span><div><h2 style={{ margin: 0, color: '#201b2e', fontSize: 15 }}>Test the in-app bell</h2><p style={{ margin: '3px 0 0', color: '#787187', fontSize: 11.5 }}>Creates one test notice for your account.</p></div></div>
            <button type="button" onClick={() => void sendTest()} disabled={sendingTest} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: 0, borderRadius: 10, background: '#6d28d9', color: '#fff', padding: '10px 13px', fontWeight: 700, fontSize: 12.5, cursor: sendingTest ? 'wait' : 'pointer', opacity: sendingTest ? .7 : 1 }}>{sendingTest ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send test notification</button>
          </section>

          <section style={{ background: '#fff', border: '1px solid #e9e4f2', borderRadius: 18, padding: 20, boxShadow: '0 8px 24px rgba(37,22,62,.045)' }}>
            <h2 style={{ margin: 0, color: '#201b2e', fontSize: 15 }}>Delivery status</h2>
            <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 11, borderRadius: 11, background: '#f0fdf4' }}><span style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#166534', fontSize: 12.5, fontWeight: 700 }}><Bell size={15} /> In-app bell</span><span style={{ color: '#15803d', fontSize: 10.5, fontWeight: 800 }}>ACTIVE</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 11, borderRadius: 11, background: '#f8f7fa' }}><span style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#6b6475', fontSize: 12.5 }}><Mail size={15} /> Email / SMS / Push</span><span style={{ color: '#8b8494', fontSize: 10.5, fontWeight: 800 }}>NOT CONNECTED</span></div>
            </div>
            <p style={{ margin: '12px 0 0', display: 'flex', gap: 6, color: '#80798b', fontSize: 11.5, lineHeight: 1.5 }}><CircleAlert size={14} style={{ flexShrink: 0, marginTop: 1 }} /> External delivery and event-level channel controls are not connected, so they are not presented as working settings.</p>
          </section>
        </aside>
      </div>
    </InstitutionShell>
  );
}
