'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Megaphone, RefreshCw, Send } from 'lucide-react';
import AdminShell from '@/components/layout/AdminShell';
import { adminService } from '@/services/admin.service';
import styles from './page.module.css';

type Announcement = { id: string; title: string; message: string; sent_to: number; actor_id: string | null; created_at: string | null };

export default function PlatformAnnouncementsPage() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [history, setHistory] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [preview, sent] = await Promise.all([
        adminService.getAnnouncementPreview(), adminService.getPlatformAnnouncements(),
      ]);
      setRecipientCount(preview.recipient_count);
      setHistory(sent.announcements || []);
    } catch (e) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Could not load announcement information.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const send = async () => {
    const cleanTitle = title.trim();
    const cleanMessage = message.trim();
    if (!cleanTitle || !cleanMessage) { setError('Enter both a title and a message.'); return; }
    if (recipientCount === null) { setError('Refresh the recipient preview before sending.'); return; }
    const confirmed = window.confirm(`Send this platform announcement to ${recipientCount} active institution admin account(s)? This action cannot be recalled.`);
    if (!confirmed) return;
    setSending(true); setError(''); setNotice('');
    try {
      const result = await adminService.sendPlatformAnnouncement({
        title: cleanTitle, message: cleanMessage, expected_recipients: recipientCount,
      });
      setNotice(`${result.message} Delivered to ${result.sent_to} active institution admin account(s).`);
      setTitle(''); setMessage('');
      await refresh();
    } catch (e) {
      const err = e as { response?: { data?: { error?: string; recipient_count?: number } } };
      setError(err?.response?.data?.error || 'Could not send the announcement.');
      if (typeof err?.response?.data?.recipient_count === 'number') setRecipientCount(err.response.data.recipient_count);
    } finally { setSending(false); }
  };

  const sendDisabled = sending || loading || recipientCount === null || recipientCount === 0;

  return (
    <AdminShell activePage="Platform Announcements" title="Platform Announcements" subtitle="Send and review platform-wide admin notices">
      <div className={styles.pageWrap}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.pageTitle}>Platform announcements</h1>
            <p className={styles.pageSub}>Recipients are active institution-admin accounts.</p>
          </div>
          <button type="button" onClick={() => void refresh()} disabled={loading} className={styles.btn}>
            <RefreshCw size={15} /> Refresh
          </button>
        </header>

        <section className={styles.card}>
          <div className={styles.cardHeader}><Megaphone size={18} strokeWidth={1.9} /><h2>Compose notice</h2></div>
          <label className={styles.field}>Title
            <input value={title} maxLength={160} onChange={e => setTitle(e.target.value)} className={styles.input} />
          </label>
          <label className={styles.field}>Message
            <textarea value={message} maxLength={5000} rows={5} onChange={e => setMessage(e.target.value)} className={styles.input} style={{ resize: 'vertical' }} />
          </label>
          <div className={styles.composeFooter}>
            <span className={styles.recipientNote}>
              {recipientCount === null ? 'Recipient count unavailable' : <><strong>{recipientCount}</strong> active institution admin recipient(s) · count is rechecked when sending</>}
            </span>
            <button type="button" disabled={sendDisabled} onClick={() => void send()} className={styles.btnPrimary}>
              {sending ? <Loader2 size={15} className="spin" /> : <Send size={15} />} Send announcement
            </button>
          </div>
          {recipientCount === 0 && <p className={styles.warnNote}>There are no active institution admins to receive this notice. It will not be sent to platform admins or students.</p>}
        </section>

        {error && <div role="alert" className={styles.alert}><AlertTriangle size={15} />{error}</div>}
        {notice && <div role="status" className={styles.success}><CheckCircle2 size={15} />{notice}</div>}

        <section>
          <h2 className={styles.sectionTitle}>Sent history</h2>
          {loading ? <p style={{ color: '#716b80' }}>Loading sent history…</p> : history.length === 0 ? (
            <div className={styles.empty}>No platform announcements have been sent.</div>
          ) : (
            <div className={styles.historyList}>
              {history.map(item => (
                <article key={item.id} className={styles.historyItem}>
                  <div className={styles.historyTop}>
                    <strong className={styles.historyTitle}>{item.title}</strong>
                    <span className={styles.historyMeta}>
                      {item.created_at ? new Date(item.created_at).toLocaleString() : '—'} · {item.sent_to} recipient(s)
                    </span>
                  </div>
                  <p className={styles.historyMsg}>{item.message}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
