'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, CircleAlert, Mail, RefreshCw, Send, Loader2, Check } from 'lucide-react';
import InstitutionShell from '@/components/layout/InstitutionShell';
import { institutionService } from '@/services/institution.service';
import { notificationService, type NotificationRow } from '@/services/notification.service';
import { useAuthStore } from '@/store/auth-store';
import { toast } from '@/components/ui/toast';
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

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true); else setLoading(true);
    try {
      const result = await notificationService.list();
      setRows(result.notifications || []);
      setUnread(result.unread || 0);
    } catch (error) {
      const e = error as { response?: { data?: { error?: string } }; message?: string };
      toast.error(e.response?.data?.error || e.message || 'Could not load notifications.');
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const sendTest = async () => {
    setSendingTest(true);
    try {
      await institutionService.sendTestNotification('in_app', user?.email || '');
      await load(true);
      toast.success('A test notice was added to your account. Check the header bell.');
    } catch (error) {
      const e = error as { response?: { data?: { error?: string } }; message?: string };
      toast.error(e.response?.data?.error || e.message || 'Could not create a test notification.');
    } finally { setSendingTest(false); }
  };

  const markOneRead = async (id: string) => {
    try {
      await notificationService.markRead(id);
      setRows(current => current.map(row => row.id === id ? { ...row, is_read: true } : row));
      setUnread(current => Math.max(0, current - 1));
    } catch {
      toast.error('Could not mark this notice as read.');
    }
  };

  const markAllRead = async () => {
    try {
      await notificationService.markAllRead();
      setRows(current => current.map(row => ({ ...row, is_read: true })));
      setUnread(0);
      toast.success('All in-app notifications marked as read.');
    } catch {
      toast.error('Could not mark notifications as read.');
    }
  };

  return (
    <InstitutionShell activePage="Notifications" title="Notifications" subtitle="Manage and verify the in-app notices delivered to your institution administrator account.">
      <div className={styles.pageContainer}>
        <div className={styles.pageGrid}>
          <section className={styles.sectionCard}>
            <div className={styles.cardHeader}>
              <div className={styles.titleGroup}>
                <h2 className={styles.cardTitle}>Recent in-app notices</h2>
                <p className={styles.cardSubtitle}>{unread} unread · Opening the bell does not mark notices read.</p>
              </div>
              <div className={styles.headerRow}>
                <button type="button" aria-label="Refresh notifications" className={styles.resetBtn} onClick={() => void load(true)} disabled={refreshing}>
                  <RefreshCw size={13} className={refreshing ? 'animate-spin' : undefined} /> Refresh
                </button>
                {unread > 0 && (
                  <button type="button" className={styles.sendTestBtn} onClick={() => void markAllRead()}>
                    <CheckCheck size={13} /> Mark all read
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <div className={styles.recentNotifList}><p style={{ padding: 36, textAlign: 'center', color: '#8b8494', fontSize: 13 }}><Loader2 size={18} className="animate-spin" style={{ marginRight: 8 }} />Loading notifications…</p></div>
            ) : rows.length === 0 ? (
              <div className={styles.recentNotifList}>
                <div style={{ padding: '44px 18px', borderRadius: 14, border: '1px dashed #ddd6e8', background: '#faf9fc', textAlign: 'center' }}>
                  <Bell size={28} color="#a99fba" style={{ margin: '0 auto 10px' }} />
                  <p style={{ margin: '0 0 4px', color: '#494156', fontSize: 14, fontWeight: 700 }}>No notifications yet</p>
                  <p style={{ margin: 0, color: '#8b8494', fontSize: 12 }}>New session and announcement notices will appear here.</p>
                </div>
              </div>
            ) : (
              <div className={styles.recentNotifList}>
                {rows.map(row => (
                  <article key={row.id} className={styles.recentNotifItem}>
                    <span className={`${styles.recentNotifIconBox} ${row.type === 'announcement' ? styles.recentNotifIconBlue : styles.recentNotifIconPurple}`}>
                      {row.type === 'announcement' ? <Mail size={16} /> : <Bell size={16} />}
                    </span>
                    <div className={styles.recentNotifContent}>
                      <div className={styles.channelTopRow}>
                        <h3 className={styles.recentNotifTitle}>{row.title}</h3>
                        <time className={styles.recentNotifTime}>{relativeTime(row.created_at)}</time>
                      </div>
                      <p className={styles.recentNotifMsg}>{row.message}</p>
                    </div>
                    {!row.is_read && (
                      <button type="button" aria-label={`Mark ${row.title} read`} onClick={() => void markOneRead(row.id)}
                        style={{ alignSelf: 'center', flexShrink: 0, border: '1px solid #ddd6e8', background: '#fff', borderRadius: 8, padding: 7, color: '#6d28d9', cursor: 'pointer' }}>
                        <Check size={14} />
                      </button>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>

          <aside className={styles.rightColumn}>
            <section className={styles.sectionCard}>
              <div className={styles.cardHeader}>
                <div className={styles.titleGroup}>
                  <h2 className={styles.cardTitle}>Test the in-app bell</h2>
                  <p className={styles.cardSubtitle}>Creates one test notice for your account.</p>
                </div>
              </div>
              <button type="button" className={styles.sendTestBtn} onClick={() => void sendTest()} disabled={sendingTest}>
                {sendingTest ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send test notification
              </button>
            </section>

            <section className={styles.sectionCard}>
              <h2 className={styles.cardTitle}>Delivery status</h2>
              <div className={styles.channelsGrid} style={{ marginTop: 14 }}>
                <div className={styles.channelCard}>
                  <div className={styles.channelTopRow}>
                    <span className={styles.channelIconBox}><Bell size={15} /></span>
                    <span className={styles.channelTitle}>In-app bell</span>
                    <span className={styles.channelCheckBadge}>ACTIVE</span>
                  </div>
                  <p className={styles.channelDesc}>Working — notices are delivered to the header bell on this account.</p>
                </div>
                <div className={styles.channelCard}>
                  <div className={styles.channelTopRow}>
                    <span className={styles.channelIconBox}><Mail size={15} /></span>
                    <span className={styles.channelTitle}>Email / SMS / Push</span>
                    <span className={styles.channelDesc} style={{ fontWeight: 800 }}>NOT CONNECTED</span>
                  </div>
                  <p className={styles.channelDesc}><CircleAlert size={13} style={{ verticalAlign: -2, marginRight: 4 }} />External delivery is not connected, so it is not presented as a working setting.</p>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </InstitutionShell>
  );
}
