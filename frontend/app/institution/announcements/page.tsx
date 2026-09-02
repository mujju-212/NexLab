'use client';

import { useEffect, useState } from 'react';
import InstitutionShell from '@/components/layout/InstitutionShell';
import { institutionService } from '@/services/institution.service';
import { Send, Bell, Clock, X, CalendarClock } from 'lucide-react';
import styles from '../dashboard/page.module.css';

export default function AnnouncementsPage() {
  const [form, setForm] = useState<{
    title: string; message: string;
    target: 'all' | 'students' | 'instructors';
    department_id?: string; batch_id?: string; section_id?: string; academic_year?: string;
  }>({ title:'', message:'', target:'all' });
  const [recent, setRecent]   = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [years, setYears]     = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [sending, setSending] = useState(false);
  const [toast, setToast]     = useState<string|null>(null);

  // P5 — scheduled delivery: send now, or queue for a future moment.
  const [deliverAt, setDeliverAt] = useState<'now' | 'later'>('now');
  const [sendAtLocal, setSendAtLocal] = useState('');
  const [scheduledList, setScheduledList] = useState<any[]>([]);

  const toast3 = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3200); };

  const loadRecent = async () => {
    try { setRecent(await institutionService.getRecentAnnouncements()); } catch {}
  };
  const loadScheduled = async () => {
    try { setScheduledList(await institutionService.getScheduledAnnouncements()); } catch {}
  };
  useEffect(() => { loadRecent(); loadScheduled(); }, []);

  // Academic structure for rich targeting (A5).
  useEffect(() => {
    institutionService.listDepartments().then(setDepartments).catch(() => {});
    institutionService.getAcademicYears().then(ys => {
      setYears(ys);
      // Load batches of the active year (if any) so the cascade starts populated.
      const active = ys.find((y: any) => y.is_active);
      if (active) {
        setForm(f => ({ ...f, academic_year: f.academic_year ?? String(active.year_label).slice(0, 4) }));
        institutionService.getBatches(active.id).then(setBatches).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  const onYearChange = async (yearLabel: string) => {
    setForm(f => ({ ...f, academic_year: yearLabel, batch_id: undefined, section_id: undefined }));
    setSections([]);
    if (!yearLabel) { setBatches([]); return; }
    const year = years.find((y: any) => String(y.year_label).slice(0, 4) === yearLabel);
    setBatches(year ? await institutionService.getBatches(year.id).catch(() => []) : []);
  };

  const onBatchChange = async (batchId: string) => {
    setForm(f => ({ ...f, batch_id: batchId, section_id: undefined }));
    setSections(batchId ? await institutionService.getSections(batchId).catch(() => []) : []);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.message) return;
    setSending(true);
    try {
      const hasFilters = form.department_id || form.batch_id || form.section_id || form.academic_year;
      const scopeExtras = {
        department_id: form.department_id || undefined,
        batch_id: form.batch_id || undefined,
        section_id: form.section_id || undefined,
        academic_year: form.academic_year ? Number(form.academic_year) : undefined,
      };

      if (deliverAt === 'later') {
        // datetime-local → UTC ISO. The scheduler dispatches it via the same
        // core as the immediate-send endpoint.
        if (!sendAtLocal) { toast3('Pick a delivery date & time.'); setSending(false); return; }
        const when = new Date(sendAtLocal);
        if (isNaN(when.getTime()) || when.getTime() <= Date.now()) {
          toast3('Delivery time must be in the future.'); setSending(false); return;
        }
        await institutionService.scheduleAnnouncement({
          title: form.title, message: form.message, target: form.target,
          send_at: when.toISOString(), ...scopeExtras,
        });
        toast3(`Announcement scheduled for ${when.toLocaleString('en-IN')}.`);
      } else {
        const res = hasFilters
          ? await institutionService.sendTargetedAnnouncement({
              title: form.title, message: form.message, target: form.target, ...scopeExtras,
            })
          : await institutionService.sendAnnouncement({
              title: form.title, message: form.message, target: form.target,
            });
        const scope = hasFilters ? 'targeted audience' : (form.target === 'all' ? 'users' : form.target);
        toast3(`Announcement sent to ${res.sent_to} ${scope}.`);
      }

      setForm({ title:'', message:'', target:'all' });
      setSendAtLocal('');
      setBatches([]); setSections([]);
      loadRecent(); loadScheduled();
    } catch { toast3('Failed to send.'); }
    finally { setSending(false); }
  };

  const cancelScheduled = async (id: string) => {
    if (!confirm('Cancel this scheduled announcement?')) return;
    try {
      await institutionService.cancelScheduledAnnouncement(id);
      toast3('Scheduled announcement cancelled.');
      loadScheduled();
    } catch { toast3('Could not cancel — it may have already been sent.'); }
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

        {/* Rich targeting (A5) — narrow the audience. Leave blank to send to all. */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:14 }}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Department <span style={{ color:'#9891a6', fontWeight:500 }}>(optional)</span></label>
            <select className={styles.select} value={form.department_id ?? ''}
              onChange={e => setForm(f => ({ ...f, department_id: e.target.value || undefined }))}>
              <option value="">All departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Academic Year <span style={{ color:'#9891a6', fontWeight:500 }}>(optional)</span></label>
            <select className={styles.select} value={form.academic_year ?? ''} onChange={e => onYearChange(e.target.value)}>
              <option value="">All years</option>
              {years.map(y => (
                <option key={y.id} value={String(y.year_label).slice(0, 4)}>{y.year_label}</option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Batch <span style={{ color:'#9891a6', fontWeight:500 }}>(optional)</span></label>
            <select className={styles.select} value={form.batch_id ?? ''} disabled={!batches.length}
              onChange={e => onBatchChange(e.target.value)}>
              <option value="">{batches.length ? 'All batches' : 'Pick a year first'}</option>
              {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Section <span style={{ color:'#9891a6', fontWeight:500 }}>(optional)</span></label>
            <select className={styles.select} value={form.section_id ?? ''} disabled={!sections.length}
              onChange={e => setForm(f => ({ ...f, section_id: e.target.value || undefined }))}>
              <option value="">{sections.length ? 'All sections' : 'Pick a batch first'}</option>
              {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
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

        <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:16, flexWrap:'wrap' }}>
          {/* Delivery timing — send now or queue for later (P5) */}
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight:600, color:'#201b2e', cursor:'pointer' }}>
              <input type="radio" checked={deliverAt==='now'} onChange={() => setDeliverAt('now')} /> Send now
            </label>
            <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight:600, color:'#201b2e', cursor:'pointer' }}>
              <input type="radio" checked={deliverAt==='later'} onChange={() => setDeliverAt('later')} /> Schedule
            </label>
            {deliverAt === 'later' && (
              <input className={styles.input} type="datetime-local" value={sendAtLocal}
                onChange={e => setSendAtLocal(e.target.value)}
                style={{ width: 230 }} />
            )}
          </div>
          <button type="submit" className={styles.btnPrimary} disabled={sending || !form.title || !form.message}>
            {deliverAt === 'later' ? <><Clock size={14} /> {sending ? 'Scheduling…' : 'Schedule Announcement'}</> : <><Send size={14} /> {sending ? 'Sending…' : 'Send Announcement'}</>}
          </button>
        </div>
      </form>

      {/* Scheduled queue */}
      {scheduledList.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle} style={{ display:'flex', alignItems:'center', gap:8 }}>
              <CalendarClock size={17} color="#7c3aed" /> Scheduled Queue
            </h2>
          </div>
          {scheduledList.filter(s => s.status === 'pending').map(s => (
            <div key={s.id} className={styles.auditRow} style={{ borderLeft: '3px solid #f59e0b' }}>
              <div className={styles.auditIcon}><Clock size={15} /></div>
              <div style={{ flex:1 }}>
                <p className={styles.auditAction}>{s.title}</p>
                <p className={styles.auditDetail}>
                  Delivers {new Date(s.send_at).toLocaleString('en-IN')} · to {s.target}
                  {s.message?.length > 100 ? ` · ${s.message.slice(0, 100)}…` : ''}
                </p>
              </div>
              <button onClick={() => cancelScheduled(s.id)} title="Cancel scheduled announcement"
                style={{ display:'flex', alignItems:'center', gap:5, background:'none', border:'1px solid #fecaca', color:'#dc2626', borderRadius:8, padding:'5px 10px', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                <X size={12} /> Cancel
              </button>
            </div>
          ))}
          {scheduledList.filter(s => s.status !== 'pending').slice(0, 5).map(s => (
            <div key={s.id} className={styles.auditRow} style={{ opacity: 0.65 }}>
              <div className={styles.auditIcon}><Bell size={15} /></div>
              <div style={{ flex:1 }}>
                <p className={styles.auditAction}>{s.title}</p>
                <p className={styles.auditDetail}>
                  {s.status === 'sent' ? `Delivered ${new Date(s.sent_at || s.send_at).toLocaleString('en-IN')}` : `Status: ${s.status}`}
                  {s.recipients_sent != null ? ` · ${s.recipients_sent} recipients` : ''}
                </p>
              </div>
              <span className={styles.auditTime}>{s.status}</span>
            </div>
          ))}
        </section>
      )}

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
