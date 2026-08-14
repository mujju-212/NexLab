'use client';

import { useState } from 'react';
import InstitutionShell from '@/components/layout/InstitutionShell';
import { useAuthStore } from '@/store/auth-store';
import {
  User, Bell, CreditCard, HelpCircle, Mail, Phone, Building2, Save,
  KeyRound, ChevronRight, Shield, Zap, Check, MessageSquare, AlertTriangle,
  BookOpen, ExternalLink
} from 'lucide-react';
import styles from '../dashboard/page.module.css';

type Tab = 'profile' | 'notifications' | 'plan' | 'help';

const TABS: { id: Tab; label: string; Icon: any }[] = [
  { id: 'profile',       label: 'Profile & Security', Icon: User },
  { id: 'notifications', label: 'Notifications',      Icon: Bell },
  { id: 'plan',          label: 'Plan & Billing',     Icon: CreditCard },
  { id: 'help',          label: 'Help & FAQ',         Icon: HelpCircle },
];

const FAQ_ITEMS = [
  { q: 'How do I add students in bulk?', a: 'Go to User Management → Bulk Upload CSV. Prepare a CSV with columns: full_name, email, role, roll_number. Click "Bulk Upload CSV" and select your file.' },
  { q: 'How do I create academic structure?', a: 'Navigate to Academics → Create an Academic Year → Add Batches → Add Sections under each batch → Assign subjects and instructors to sections.' },
  { q: 'Can I schedule sessions for different batches?', a: 'Yes. Go to Sessions → Assign a session timing for the specific batch. You can manage schedules for past, current, and future batches.' },
  { q: 'How do I track student performance?', a: 'The Analytics page shows session completion rates, at-risk students, and section comparisons. Dashboard cards also give a quick overview.' },
  { q: 'How to reset a user\'s password?', a: 'Go to User Management → Click on the user → Use the "Reset Password" option. A temporary password will be set.' },
  { q: 'Who can I contact for support?', a: 'Use the Help section below or email support@nexlab.io for platform-level assistance.' },
];

export default function SettingsPage() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<Tab>('profile');
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Profile form
  const [profileForm, setProfileForm] = useState({
    full_name: user?.full_name ?? '',
    email: user?.email ?? '',
    phone: '',
  });

  // Password form
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);

  // Notification prefs
  const [notifs, setNotifs] = useState({
    email_sessions: true,
    email_announcements: true,
    email_user_activity: false,
    email_weekly_digest: true,
    push_sessions: true,
    push_announcements: false,
  });

  const toast3 = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { apiClient } = await import('@/services/api-client');
      await apiClient.patch('/auth/profile', profileForm);
      toast3('Profile updated successfully!');
    } catch (err: any) {
      toast3(err?.response?.data?.error ?? 'Failed to update profile.');
    } finally { setSaving(false); }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.newPw !== pwForm.confirm) { toast3('Passwords do not match.'); return; }
    if (pwForm.newPw.length < 8) { toast3('Min 8 characters required.'); return; }
    setSaving(true);
    try {
      const { apiClient } = await import('@/services/api-client');
      await apiClient.post('/auth/change-password', {
        current_password: pwForm.current,
        new_password: pwForm.newPw,
      });
      toast3('Password changed!');
      setPwForm({ current: '', newPw: '', confirm: '' });
    } catch (err: any) {
      toast3(err?.response?.data?.error ?? 'Failed to change password.');
    } finally { setSaving(false); }
  };

  const saveNotifs = () => {
    toast3('Notification preferences saved!');
  };

  const initials = user?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? 'IA';

  return (
    <InstitutionShell activePage="Settings" title="Settings" subtitle="Manage your account, notifications, and institution preferences.">
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 300, background: '#201b2e', color: '#fff', padding: '12px 20px', borderRadius: 12, fontSize: 14, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Check size={14} /> {toast}
        </div>
      )}

      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, background: 'rgba(255,255,255,0.5)', borderRadius: 14, padding: 4, border: '1px solid rgba(255,255,255,0.8)', width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 10,
              border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              fontFamily: "'Space Grotesk', sans-serif",
              background: tab === t.id ? '#fff' : 'transparent',
              color: tab === t.id ? '#201b2e' : '#9891a6',
              boxShadow: tab === t.id ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
              transition: 'all .15s ease',
            }}>
            <t.Icon size={15} strokeWidth={1.9} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ PROFILE & SECURITY ═══ */}
      {tab === 'profile' && (
        <div className={styles.grid2} style={{ maxWidth: 900 }}>
          {/* Profile info */}
          <div style={{ background: 'rgba(255,255,255,0.78)', borderRadius: 18, border: '1px solid rgba(255,255,255,0.9)', padding: 28, boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#9333ea,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20, fontWeight: 700, flexShrink: 0 }}>
                {initials}
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#201b2e', fontFamily: "'Space Grotesk', sans-serif" }}>{user?.full_name ?? '—'}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9891a6' }}>Institution Administrator</p>
              </div>
            </div>

            <form onSubmit={saveProfile}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Full Name</label>
                <input className={styles.input} value={profileForm.full_name}
                  onChange={e => setProfileForm(f => ({ ...f, full_name: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Email</label>
                <input className={styles.input} type="email" value={profileForm.email}
                  onChange={e => setProfileForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Phone</label>
                <input className={styles.input} placeholder="+91 98765 43210" value={profileForm.phone}
                  onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <button type="submit" className={styles.btnPrimary} disabled={saving} style={{ marginTop: 8 }}>
                <Save size={14} /> {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </form>
          </div>

          {/* Change password */}
          <div style={{ background: 'rgba(255,255,255,0.78)', borderRadius: 18, border: '1px solid rgba(255,255,255,0.9)', padding: 28, boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9333ea' }}>
                <KeyRound size={17} strokeWidth={1.8} />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#201b2e', fontFamily: "'Space Grotesk', sans-serif" }}>Change Password</p>
                <p style={{ margin: 0, fontSize: 12, color: '#9891a6' }}>Keep your account secure</p>
              </div>
            </div>

            <form onSubmit={changePassword}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Current Password</label>
                <input className={styles.input} type={showPw ? 'text' : 'password'} required
                  placeholder="Current password" value={pwForm.current}
                  onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>New Password</label>
                <input className={styles.input} type={showPw ? 'text' : 'password'} required
                  placeholder="Min 8 characters" value={pwForm.newPw}
                  onChange={e => setPwForm(f => ({ ...f, newPw: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Confirm Password</label>
                <input className={styles.input} type={showPw ? 'text' : 'password'} required
                  placeholder="Re-enter password" value={pwForm.confirm}
                  onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <input type="checkbox" id="showPw" checked={showPw} onChange={e => setShowPw(e.target.checked)} />
                <label htmlFor="showPw" style={{ fontSize: 13, color: '#726a85', cursor: 'pointer' }}>Show passwords</label>
              </div>
              <button type="submit" className={styles.btnPrimary} disabled={saving}>
                <Shield size={14} /> {saving ? 'Saving…' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ═══ NOTIFICATIONS ═══ */}
      {tab === 'notifications' && (
        <div style={{ maxWidth: 600 }}>
          <div style={{ background: 'rgba(255,255,255,0.78)', borderRadius: 18, border: '1px solid rgba(255,255,255,0.9)', padding: 28, boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: '#201b2e', fontFamily: "'Space Grotesk', sans-serif" }}>Email Notifications</h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#9891a6' }}>Choose which emails you'd like to receive.</p>

            {[
              { key: 'email_sessions',       label: 'Session updates',       desc: 'When sessions are scheduled, started, or ended' },
              { key: 'email_announcements',   label: 'Announcements',        desc: 'When new announcements are posted' },
              { key: 'email_user_activity',   label: 'User activity',        desc: 'When users are created, deactivated, or modified' },
              { key: 'email_weekly_digest',   label: 'Weekly digest',        desc: 'Summary of institution activity every Monday' },
            ].map(item => (
              <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #f1f5f9' }}>
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#201b2e' }}>{item.label}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9891a6' }}>{item.desc}</p>
                </div>
                <button onClick={() => setNotifs(n => ({ ...n, [item.key]: !n[item.key as keyof typeof n] }))}
                  style={{
                    width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative',
                    background: notifs[item.key as keyof typeof notifs] ? '#9333ea' : '#e5e7eb',
                    transition: 'background .2s ease',
                  }}>
                  <span style={{
                    position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%', background: '#fff',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.15)', transition: 'left .2s ease',
                    left: notifs[item.key as keyof typeof notifs] ? 22 : 2,
                  }} />
                </button>
              </div>
            ))}

            <h3 style={{ margin: '28px 0 6px', fontSize: 16, fontWeight: 700, color: '#201b2e', fontFamily: "'Space Grotesk', sans-serif" }}>Push Notifications</h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#9891a6' }}>In-app push notification preferences.</p>

            {[
              { key: 'push_sessions',       label: 'Live session alerts',   desc: 'Real-time alerts when sessions start' },
              { key: 'push_announcements',   label: 'Announcement alerts',   desc: 'Push when announcements are sent' },
            ].map(item => (
              <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #f1f5f9' }}>
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#201b2e' }}>{item.label}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9891a6' }}>{item.desc}</p>
                </div>
                <button onClick={() => setNotifs(n => ({ ...n, [item.key]: !n[item.key as keyof typeof n] }))}
                  style={{
                    width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative',
                    background: notifs[item.key as keyof typeof notifs] ? '#9333ea' : '#e5e7eb',
                    transition: 'background .2s ease',
                  }}>
                  <span style={{
                    position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%', background: '#fff',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.15)', transition: 'left .2s ease',
                    left: notifs[item.key as keyof typeof notifs] ? 22 : 2,
                  }} />
                </button>
              </div>
            ))}

            <button className={styles.btnPrimary} onClick={saveNotifs} style={{ marginTop: 24 }}>
              <Save size={14} /> Save Preferences
            </button>
          </div>
        </div>
      )}

      {/* ═══ PLAN & BILLING ═══ */}
      {tab === 'plan' && (
        <div style={{ maxWidth: 700 }}>
          {/* Current plan */}
          <div style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.06), rgba(124,58,237,0.02))', borderRadius: 18, border: '1.5px solid rgba(124,58,237,0.18)', padding: 28, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Zap size={16} style={{ color: '#9333ea' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#9333ea', textTransform: 'uppercase', letterSpacing: '.05em' }}>Current Plan</span>
                </div>
                <h3 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: '#201b2e', fontFamily: "'Space Grotesk', sans-serif" }}>Institution Starter</h3>
                <p style={{ margin: 0, fontSize: 13, color: '#726a85' }}>For small to medium institutions getting started with virtual labs.</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#201b2e', fontFamily: "'Space Grotesk', sans-serif" }}>Free</p>
                <p style={{ margin: 0, fontSize: 12, color: '#9891a6' }}>during beta</p>
              </div>
            </div>

            <div className={styles.grid3} style={{ marginTop: 20 }}>
              {[
                { label: 'Students', value: '100', max: '100' },
                { label: 'Instructors', value: '10', max: '10' },
                { label: 'Sessions/mo', value: 'Unlimited', max: '' },
              ].map(u => (
                <div key={u.label} style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 12, padding: '12px 16px', border: '1px solid rgba(255,255,255,0.9)' }}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#9891a6', textTransform: 'uppercase', letterSpacing: '.04em' }}>{u.label}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 700, color: '#201b2e' }}>{u.value}{u.max ? <span style={{ fontSize: 13, color: '#9891a6', fontWeight: 500 }}>/{u.max}</span> : null}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Upgrade options */}
          <div className={styles.grid2} style={{ gap: 16 }}>
            {[
              { name: 'Pro', price: '₹4,999/mo', features: ['500 students', '50 instructors', 'Priority support', 'Custom environments', 'Advanced analytics'], highlight: true },
              { name: 'Enterprise', price: 'Custom', features: ['Unlimited students', 'Unlimited instructors', 'Dedicated support', 'SSO / SAML', 'On-premise option'], highlight: false },
            ].map(plan => (
              <div key={plan.name} style={{
                background: plan.highlight ? 'linear-gradient(135deg, #9333ea, #7c3aed)' : 'rgba(255,255,255,0.78)',
                borderRadius: 18, padding: 24, border: plan.highlight ? 'none' : '1px solid rgba(255,255,255,0.9)',
                color: plan.highlight ? '#fff' : '#201b2e',
              }}>
                <h4 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>{plan.name}</h4>
                <p style={{ margin: '0 0 16px', fontSize: 24, fontWeight: 800 }}>{plan.price}</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {plan.features.map(f => (
                    <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500 }}>
                      <Check size={14} style={{ color: plan.highlight ? '#e9d5ff' : '#22c55e', flexShrink: 0 }} /> {f}
                    </li>
                  ))}
                </ul>
                <button style={{
                  width: '100%', padding: '10px 0', borderRadius: 10, border: plan.highlight ? '1.5px solid rgba(255,255,255,0.4)' : '1.5px solid #9333ea',
                  background: plan.highlight ? 'rgba(255,255,255,0.15)' : 'transparent',
                  color: plan.highlight ? '#fff' : '#9333ea', cursor: 'pointer',
                  fontSize: 13.5, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif",
                }}>
                  {plan.name === 'Enterprise' ? 'Contact Sales' : 'Upgrade to Pro'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ HELP & FAQ ═══ */}
      {tab === 'help' && (
        <div style={{ maxWidth: 700 }}>
          <div style={{ background: 'rgba(255,255,255,0.78)', borderRadius: 18, border: '1px solid rgba(255,255,255,0.9)', padding: 28, boxShadow: '0 2px 12px rgba(0,0,0,0.05)', marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: '#201b2e', fontFamily: "'Space Grotesk', sans-serif" }}>Frequently Asked Questions</h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#9891a6' }}>Quick answers to common questions about managing your institution.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {FAQ_ITEMS.map((faq, i) => (
                <div key={i} style={{ borderBottom: i < FAQ_ITEMS.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    style={{
                      width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '16px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#201b2e' }}>{faq.q}</span>
                    <ChevronRight size={16} style={{
                      color: '#9891a6', flexShrink: 0, transition: 'transform .2s ease',
                      transform: openFaq === i ? 'rotate(90deg)' : 'rotate(0deg)',
                    }} />
                  </button>
                  {openFaq === i && (
                    <p style={{ margin: '0 0 16px', fontSize: 13, color: '#726a85', lineHeight: 1.7, paddingLeft: 0 }}>
                      {faq.a}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Contact support */}
          <div className={styles.grid2} style={{ gap: 16 }}>
            <div style={{ background: 'rgba(255,255,255,0.78)', borderRadius: 18, border: '1px solid rgba(255,255,255,0.9)', padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9333ea' }}>
                <MessageSquare size={18} strokeWidth={1.8} />
              </div>
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#201b2e' }}>Chat Support</p>
                <p style={{ margin: 0, fontSize: 12.5, color: '#726a85' }}>Get help from our team in real-time during business hours.</p>
              </div>
              <button className={styles.btnSecondary} style={{ marginTop: 'auto' }}>
                <MessageSquare size={13} /> Start Chat
              </button>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.78)', borderRadius: 18, border: '1px solid rgba(255,255,255,0.9)', padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                <BookOpen size={18} strokeWidth={1.8} />
              </div>
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#201b2e' }}>Documentation</p>
                <p style={{ margin: 0, fontSize: 12.5, color: '#726a85' }}>Browse guides, tutorials, and API documentation.</p>
              </div>
              <button className={styles.btnSecondary} style={{ marginTop: 'auto' }}>
                <ExternalLink size={13} /> View Docs
              </button>
            </div>
          </div>
        </div>
      )}
    </InstitutionShell>
  );
}
