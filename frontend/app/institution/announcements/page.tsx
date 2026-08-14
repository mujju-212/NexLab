'use client';

import { useEffect, useState } from 'react';
import InstitutionShell from '@/components/layout/InstitutionShell';
import { institutionService } from '@/services/institution.service';
import { Send, Bell } from 'lucide-react';
import styles from '../dashboard/page.module.css';

export default function AnnouncementsPage() {
  const [form, setForm] = useState({ title:'', message:'', target:'all' as 'all'|'students'|'instructors' });
  const [recent, setRecent]   = useState<any[]>([]);
  const [sending, setSending] = useState(false);
  const [toast, setToast]     = useState<string|null>(null);

  const toast3 = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3200); };

  const loadRecent = async () => {
    try { setRecent(await institutionService.getRecentAnnouncements()); } catch {}
  };
  useEffect(() => { loadRecent(); }, []);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.message) return;
    setSending(true);
    try {
      const res = await institutionService.sendAnnouncement(form);
      toast3(`Announcement sent to ${res.sent_to} ${form.target === 'all' ? 'users' : form.target}.`);
      setForm({ title:'', message:'', target:'all' });
      loadRecent();
    } catch { toast3('Failed to send.'); }
    finally { setSending(false); }
  };

  return (
    <InstitutionShell activePage="Announcements" title="Announcements" subtitle="Broadcast messages to students and instructors.">
      {toast && <div style={{ position:'fixed', bottom:24, right:24, zIndex:300, background:'#201b2e', color:'#fff', padding:'12px 20px', borderRadius:12, fontSize:14, fontWeight:600 }}>{toast}</div>}

      {/* Compose */}
      <form className={styles.announceForm} onSubmit={send}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
          <div style={{ width:38, height:38, borderRadius:11, background:'#faf5ff', display:'flex', alignItems:'center', justifyContent:'center', color:'#9333ea' }}>
            <Bell size={18} strokeWidth={1.8} />
          </div>
          <div>
            <p style={{ margin:0, fontFamily:'Space Grotesk,sans-serif', fontSize:15, fontWeight:700, color:'#201b2e' }}>Compose Announcement</p>
            <p style={{ margin:0, fontSize:12.5, color:'#9891a6' }}>Sent instantly to all target users via notification + SocketIO</p>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Send To</label>
          <select className={styles.select} value={form.target} onChange={e => setForm(f => ({ ...f, target: e.target.value as any }))}>
            <option value="all">Everyone (Students + Instructors)</option>
            <option value="students">Students only</option>
            <option value="instructors">Instructors only</option>
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Title *</label>
          <input className={styles.input} placeholder="e.g. Lab cancelled tomorrow" required
            value={form.title} onChange={e => setForm(f => ({ ...f, title:e.target.value }))} />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Message *</label>
          <textarea className={styles.textarea} placeholder="Write your announcement here…" required
            value={form.message} onChange={e => setForm(f => ({ ...f, message:e.target.value }))} />
        </div>

        <div style={{ display:'flex', justifyContent:'flex-end' }}>
          <button type="submit" className={styles.btnPrimary} disabled={sending || !form.title || !form.message}>
            <Send size={14} /> {sending ? 'Sending…' : 'Send Announcement'}
          </button>
        </div>
      </form>

      {/* Recent */}
      <section className={styles.section}>
        <div className={styles.sectionHead}><h2 className={styles.sectionTitle}>Recent Announcements</h2></div>
        {recent.length === 0 ? (
          <div className={styles.emptyState}><p>No announcements sent yet.</p></div>
        ) : recent.slice(0, 10).map((ann, i) => (
          <div key={i} className={styles.auditRow}>
            <div className={styles.auditIcon}><Bell size={15} /></div>
            <div style={{ flex:1 }}>
              <p className={styles.auditAction}>{ann.title}</p>
              <p className={styles.auditDetail}>{ann.message?.slice(0, 120)}{ann.message?.length>120?'…':''}</p>
            </div>
            <span className={styles.auditTime}>
              {new Date(ann.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}
            </span>
          </div>
        ))}
      </section>
    </InstitutionShell>
  );
}
