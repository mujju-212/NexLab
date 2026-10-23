'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Bell, Check, Loader2, Megaphone, MessageSquareText, RefreshCw, Send, ThumbsUp, Users } from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import { experienceService } from '@/services/experience.service';
import styles from './announcements.module.css';

type Recipient = { section_subject_id: string; subject_name: string; section_name: string; student_count: number };
type Notice = {
  id: string; title: string; message: string; author_name?: string; author_role?: string;
  priority?: 'normal' | 'important' | 'urgent'; category?: string; sent_at?: string | null; created_at?: string | null;
  reach_count?: number; views_count?: number; likes_count?: number; is_read?: boolean; is_liked?: boolean;
};

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e9e4f2', borderRadius: 18, padding: 20, boxShadow: '0 8px 24px rgba(37,22,62,.045)' };
const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #ddd6e8', borderRadius: 10, padding: '11px 12px', font: 'inherit', fontSize: 13, color: '#211a2c', outlineColor: '#8b5cf6', background: '#fff' };
const label: React.CSSProperties = { display: 'block', marginBottom: 6, color: '#423b50', fontSize: 12.5, fontWeight: 700 };

export default function InstructorAnnouncementsPage() {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [target, setTarget] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const [recipientResult, noticeResult] = await Promise.all([
        experienceService.announcementRecipients(),
        experienceService.listInstructorAnnouncements(),
      ]);
      setRecipients(recipientResult.recipients || []);
      setNotices(noticeResult.announcements || []);
      setTarget(current => current || recipientResult.recipients?.[0]?.section_subject_id || '');
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err.response?.data?.error || err.message || 'Could not load announcements.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null); setSuccess(null);
    if (!target || !title.trim() || !message.trim()) {
      setError('Choose an assigned class and enter both a title and message.');
      return;
    }
    setSending(true);
    try {
      const result = await experienceService.instructorAnnounce({ section_subject_id: target, title: title.trim(), message: message.trim() });
      setSuccess(`Announcement sent to ${result.sent_to} enrolled student${result.sent_to === 1 ? '' : 's'}.`);
      setTitle(''); setMessage('');
      await load(true);
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err.response?.data?.error || err.message || 'Announcement could not be sent.');
    } finally { setSending(false); }
  };

  const markRead = async (notice: Notice) => {
    if (notice.is_read) return;
    try {
      await experienceService.markInstructorAnnouncementRead(notice.id);
      setNotices(items => items.map(item => item.id === notice.id ? { ...item, is_read: true } : item));
    } catch { setError('Could not update the read status.'); }
  };

  const toggleLike = async (notice: Notice) => {
    try {
      const result = await experienceService.toggleInstructorAnnouncementLike(notice.id);
      setNotices(items => items.map(item => item.id === notice.id ? { ...item, is_liked: result.liked, likes_count: result.likes_count } : item));
    } catch { setError('Could not update the like.'); }
  };

  const selected = recipients.find(item => item.section_subject_id === target);
  const unread = notices.filter(item => !item.is_read).length;

  return (
    <InstructorShell activePage="Announcements" title="Class Announcements" subtitle="Send a clear update to one of your assigned classes and follow institutional notices in one place.">
      <div className={styles.layout}>
        <section style={card} aria-labelledby="compose-announcement-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ width: 42, height: 42, borderRadius: 13, background: '#f3e8ff', color: '#7c3aed', display: 'grid', placeItems: 'center' }}><Megaphone size={20} /></span>
            <div><h2 id="compose-announcement-title" style={{ margin: 0, fontSize: 17, color: '#201b2e' }}>Compose</h2><p style={{ margin: '3px 0 0', fontSize: 12, color: '#787187' }}>Only students enrolled in the selected class receive it.</p></div>
          </div>
          <form onSubmit={send}>
            <div style={{ marginBottom: 14 }}>
              <label style={label} htmlFor="announcement-target">Assigned class</label>
              <select id="announcement-target" style={field} value={target} onChange={e => setTarget(e.target.value)} required>
                <option value="">Select a class</option>
                {recipients.map(item => <option key={item.section_subject_id} value={item.section_subject_id}>{item.subject_name} · Section {item.section_name} · {item.student_count} students</option>)}
              </select>
              {selected && <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#746d82', display: 'flex', alignItems: 'center', gap: 5 }}><Users size={12} /> {selected.student_count} enrolled recipients</p>}
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={label} htmlFor="announcement-title">Title</label>
              <input id="announcement-title" style={field} value={title} maxLength={255} onChange={e => setTitle(e.target.value)} placeholder="e.g. Lab preparation reminder" required />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={label} htmlFor="announcement-message">Message</label>
              <textarea id="announcement-message" style={{ ...field, minHeight: 150, resize: 'vertical', lineHeight: 1.55 }} value={message} maxLength={20000} onChange={e => setMessage(e.target.value)} placeholder="Write the update, include a date or next step if students need to act…" required />
              <div style={{ textAlign: 'right', marginTop: 4, color: '#9a93a7', fontSize: 10.5 }}>{message.length.toLocaleString()} / 20,000</div>
            </div>
            {error && <p role="alert" style={{ display: 'flex', gap: 7, alignItems: 'center', color: '#b91c1c', fontSize: 12.5, margin: '0 0 12px' }}><AlertCircle size={15} />{error}</p>}
            {success && <p role="status" style={{ display: 'flex', gap: 7, alignItems: 'center', color: '#15803d', fontSize: 12.5, margin: '0 0 12px' }}><Check size={15} />{success}</p>}
            <button type="submit" disabled={sending || !recipients.length} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#6d28d9', border: 0, borderRadius: 10, padding: '11px 15px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: sending || !recipients.length ? 'not-allowed' : 'pointer', opacity: sending || !recipients.length ? .55 : 1 }}>
              {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}{sending ? 'Sending…' : 'Send to class'}
            </button>
            {!loading && !recipients.length && <p style={{ margin: '10px 0 0', color: '#9a6b16', fontSize: 12 }}>No assigned classes are available for announcements.</p>}
          </form>
        </section>

        <section style={card} aria-labelledby="announcement-history-title">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div><h2 id="announcement-history-title" style={{ margin: 0, fontSize: 17, color: '#201b2e' }}>Announcement feed</h2><p style={{ margin: '3px 0 0', fontSize: 12, color: '#787187' }}>{unread} unread · Your class notices and institution-wide updates.</p></div>
            <button type="button" onClick={() => void load(true)} disabled={refreshing} aria-label="Refresh announcements" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #e5dff0', borderRadius: 9, background: '#fff', padding: '8px 10px', color: '#574d68', cursor: 'pointer', fontSize: 11.5, fontWeight: 700 }}><RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Refresh</button>
          </div>
          {loading ? <div style={{ padding: 36, textAlign: 'center', color: '#8b8494' }}><Loader2 size={19} className="animate-spin" /><p style={{ fontSize: 12 }}>Loading feed…</p></div> : notices.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '42px 18px', borderRadius: 14, background: '#faf9fc', border: '1px dashed #ddd6e8' }}><MessageSquareText size={28} color="#a99fba" style={{ margin: '0 auto 10px' }} /><p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: '#494156' }}>No announcements yet</p><p style={{ margin: 0, fontSize: 12, color: '#8b8494' }}>New class and institution announcements will appear here.</p></div>
          ) : (
            <div style={{ display: 'grid', gap: 10, maxHeight: 670, overflowY: 'auto', paddingRight: 2 }}>
              {notices.map(notice => (
                <article key={notice.id} style={{ padding: 14, borderRadius: 13, border: `1px solid ${notice.is_read ? '#eeeaf3' : '#ddd0fb'}`, background: notice.is_read ? '#fff' : '#fcfaff', borderLeft: `3px solid ${notice.priority === 'urgent' ? '#dc2626' : notice.priority === 'important' ? '#f59e0b' : '#8b5cf6'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ minWidth: 0 }}><h3 style={{ margin: 0, fontSize: 13.5, color: '#241d31', lineHeight: 1.35 }}>{notice.title}</h3><p style={{ margin: '4px 0 0', color: '#847d91', fontSize: 10.5 }}>{notice.author_name || 'NexLab'} · {new Date(notice.sent_at || notice.created_at || Date.now()).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p></div>
                    {!notice.is_read && <span style={{ flexShrink: 0, padding: '4px 7px', borderRadius: 999, color: '#6d28d9', background: '#f3e8ff', fontSize: 9.5, fontWeight: 800 }}>NEW</span>}
                  </div>
                  <p style={{ margin: '10px 0 12px', color: '#514a5e', fontSize: 12.5, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{notice.message}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, color: '#91899d', fontSize: 10.5 }}>
                    <span>{notice.reach_count != null ? `${notice.reach_count} recipients` : 'Institution notice'}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" onClick={() => void toggleLike(notice)} aria-label={notice.is_liked ? 'Unlike announcement' : 'Like announcement'} style={{ border: '1px solid #e6e0ed', borderRadius: 8, background: '#fff', color: notice.is_liked ? '#7c3aed' : '#70697d', padding: '6px 8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11 }}><ThumbsUp size={12} />{notice.likes_count || 0}</button>
                      <button type="button" onClick={() => void markRead(notice)} disabled={notice.is_read} style={{ border: '1px solid #e6e0ed', borderRadius: 8, background: '#fff', color: notice.is_read ? '#15803d' : '#70697d', padding: '6px 8px', cursor: notice.is_read ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11 }}>{notice.is_read ? <Check size={12} /> : <Bell size={12} />}{notice.is_read ? 'Read' : 'Mark read'}</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </InstructorShell>
  );
}
