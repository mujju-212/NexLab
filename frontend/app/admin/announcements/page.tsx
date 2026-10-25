'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Megaphone, RefreshCw, Send } from 'lucide-react';
import AdminShell from '@/components/layout/AdminShell';
import { adminService } from '@/services/admin.service';

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

  return (
    <AdminShell activePage="Platform Announcements" title="Platform Announcements" subtitle="Send and review platform-wide admin notices">
      <div style={{ maxWidth: 1000, margin: '0 auto', paddingBottom: 40 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div><h1 style={{ margin: 0, fontSize: 25, color: '#211a32' }}>Platform announcements</h1><p style={{ margin: '6px 0 0', color: '#716b80', fontSize: 13 }}>Recipients are active institution-admin accounts.</p></div>
          <button type="button" onClick={() => void refresh()} disabled={loading} style={buttonStyle}><RefreshCw size={15} /> Refresh</button>
        </header>

        <section style={{ background: 'rgba(255,255,255,.78)', border: '1px solid #ece9f2', borderRadius: 16, padding: 22, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 16, color: '#342b49' }}><Megaphone size={18} /><h2 style={{ margin: 0, fontSize: 16 }}>Compose notice</h2></div>
          <label style={labelStyle}>Title <input value={title} maxLength={160} onChange={e => setTitle(e.target.value)} style={inputStyle} /></label>
          <label style={{ ...labelStyle, marginTop: 12 }}>Message <textarea value={message} maxLength={5000} rows={5} onChange={e => setMessage(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} /></label>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: '#60596f' }}>
              {recipientCount === null ? 'Recipient count unavailable' : <><strong>{recipientCount}</strong> active institution admin recipient(s) · count is rechecked when sending</>}
            </span>
            <button type="button" disabled={sending || loading || recipientCount === null || recipientCount === 0} onClick={() => void send()} style={{ ...buttonStyle, background: '#5b3cc4', color: 'white', borderColor: '#5b3cc4', opacity: sending || loading || recipientCount === null || recipientCount === 0 ? .6 : 1 }}>
              {sending ? <Loader2 size={15} className="spin" /> : <Send size={15} />} Send announcement
            </button>
          </div>
          {recipientCount === 0 && <p style={{ margin: '10px 0 0', color: '#946200', fontSize: 12 }}>There are no active institution admins to receive this notice. It will not be sent to platform admins or students.</p>}
        </section>

        {error && <div role="alert" style={{ padding: 12, marginBottom: 14, borderRadius: 10, background: '#fff0f0', color: '#a4262c', border: '1px solid #f5c4c4' }}><AlertTriangle size={15} style={{ verticalAlign: 'middle', marginRight: 7 }} />{error}</div>}
        {notice && <div role="status" style={{ padding: 12, marginBottom: 14, borderRadius: 10, background: '#effaf2', color: '#216e39', border: '1px solid #c8ead0' }}>{notice}</div>}

        <section>
          <h2 style={{ fontSize: 17, margin: '0 0 12px', color: '#302a41' }}>Sent history</h2>
          {loading ? <p style={{ color: '#716b80' }}>Loading sent history…</p> : history.length === 0 ? (
            <div style={{ background: 'rgba(255,255,255,.7)', border: '1px solid #ece9f2', borderRadius: 14, padding: 24, color: '#716b80', textAlign: 'center' }}>No platform announcements have been sent.</div>
          ) : <div style={{ display: 'grid', gap: 10 }}>
            {history.map(item => <article key={item.id} style={{ background: 'rgba(255,255,255,.78)', border: '1px solid #ece9f2', borderRadius: 14, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><strong style={{ color: '#302a41' }}>{item.title}</strong><span style={{ color: '#716b80', fontSize: 12 }}>{item.created_at ? new Date(item.created_at).toLocaleString() : '—'} · {item.sent_to} recipient(s)</span></div>
              <p style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0', color: '#5f596d', fontSize: 13 }}>{item.message}</p>
            </article>)}
          </div>}
        </section>
      </div>
    </AdminShell>
  );
}

const labelStyle: React.CSSProperties = { display: 'grid', gap: 6, color: '#514a60', fontWeight: 700, fontSize: 12 };
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #ddd8e8', borderRadius: 9, padding: '10px 11px', font: 'inherit', fontSize: 13, color: '#302a41', background: '#fff' };
const buttonStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '9px 13px', borderRadius: 9, border: '1px solid #ddd8e8', background: '#fff', color: '#433b55', cursor: 'pointer', fontWeight: 650, fontSize: 13 };
