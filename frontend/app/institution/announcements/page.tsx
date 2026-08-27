'use client';

import { useEffect, useState } from 'react';
import InstitutionShell from '@/components/layout/InstitutionShell';
import { institutionService } from '@/services/institution.service';
import { Send, Bell } from 'lucide-react';
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

  const toast3 = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3200); };

  const loadRecent = async () => {
    try { setRecent(await institutionService.getRecentAnnouncements()); } catch {}
  };
  useEffect(() => { loadRecent(); }, []);

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
      const res = hasFilters
        ? await institutionService.sendTargetedAnnouncement({
            title: form.title, message: form.message, target: form.target,
            department_id: form.department_id || undefined,
            batch_id: form.batch_id || undefined,
            section_id: form.section_id || undefined,
            academic_year: form.academic_year ? Number(form.academic_year) : undefined,
          })
        : await institutionService.sendAnnouncement({
            title: form.title, message: form.message, target: form.target,
          });
      const scope = hasFilters ? 'targeted audience' : (form.target === 'all' ? 'users' : form.target);
      toast3(`Announcement sent to ${res.sent_to} ${scope}.`);
      setForm({ title:'', message:'', target:'all' });
      setBatches([]); setSections([]);
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
