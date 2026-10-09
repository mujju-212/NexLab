'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import InstitutionShell from '@/components/layout/InstitutionShell';
import { useAuthStore } from '@/store/auth-store';
import { apiClient } from '@/services/api-client';
import { institutionService, AI_FEATURES, type PlanUsage, type AIPolicy, type AIUsageSummary } from '@/services/institution.service';
import {
  User, Bell, CreditCard, HelpCircle, Mail, Phone, Building2, Save,
  KeyRound, ChevronRight, Shield, Zap, Check, MessageSquare, AlertTriangle,
  BookOpen, ExternalLink, Cpu, RefreshCw, Download
} from 'lucide-react';
import styles from '../dashboard/page.module.css';

type Tab = 'profile' | 'notifications' | 'plan' | 'ai' | 'help';

const TABS: { id: Tab; label: string; Icon: any }[] = [
  { id: 'profile',       label: 'Profile & Security', Icon: User },
  { id: 'notifications', label: 'Notifications',      Icon: Bell },
  { id: 'plan',          label: 'Plan & Billing',     Icon: CreditCard },
  { id: 'ai',            label: 'AI & Usage',         Icon: Cpu },
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

const PLAN_META: Record<string, { name: string; blurb: string; price: string; sub: string; rank: number }> = {
  free:       { name: 'Institution Starter', blurb: 'For small to medium institutions getting started with virtual labs.', price: 'Free',    sub: 'during beta',  rank: 0 },
  pro:        { name: 'Pro',                  blurb: 'For growing institutions that need more capacity and priority support.', price: '₹4,999', sub: 'per month',    rank: 1 },
  enterprise: { name: 'Enterprise',           blurb: 'Unlimited scale with dedicated support and deployment options.',         price: 'Custom', sub: 'contact sales', rank: 2 },
};

const UPGRADE_PLANS = [
  { key: 'pro',        name: 'Pro',        price: '₹4,999/mo', features: ['500 students', '50 instructors', 'Priority support', 'Custom environments', 'Advanced analytics'], highlight: true },
  { key: 'enterprise', name: 'Enterprise', price: 'Custom',    features: ['Unlimited students', 'Unlimited instructors', 'Dedicated support', 'SSO / SAML', 'On-premise option'], highlight: false },
];

// Pill toggle switch — matches the notification-prefs style used elsewhere on this page.
function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        width: 44, height: 24, borderRadius: 12, border: 'none', flexShrink: 0,
        cursor: disabled ? 'not-allowed' : 'pointer', position: 'relative',
        opacity: disabled ? 0.4 : 1,
        background: on ? '#9333ea' : '#e5e7eb', transition: 'background .2s ease',
      }}>
      <span style={{
        position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.15)', transition: 'left .2s ease',
        left: on ? 22 : 2,
      }} />
    </button>
  );
}

const fmtNum = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString());

export default function SettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, setUser } = useAuthStore();
  const [tab, setTab] = useState<Tab>('plan');
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notifSaving, setNotifSaving] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Check URL parameters for tab on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam === 'notifications') {
        router.push('/institution/notifications');
      } else if (tabParam === 'profile') {
        router.push('/institution/profile');
      } else if (tabParam === 'plan') {
        router.push('/institution/billing');
      } else if (tabParam === 'ai') {
        router.push('/institution/ai-usage');
      } else if (tabParam === 'help') {
        router.push('/institution/help');
      }
    }
  }, [router]);

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

  // Plan & billing
  const [plan, setPlan] = useState<PlanUsage | null>(null);

  // AI governance
  const [aiPolicy, setAiPolicy] = useState<AIPolicy | null>(null);
  const [aiUsage, setAiUsage] = useState<AIUsageSummary | null>(null);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiDirty, setAiDirty] = useState(false);

  const toast3 = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // Load current profile (incl. phone), notification prefs, and plan usage on
  // mount — cached: revisiting settings renders instantly. AI-tab data comes
  // from the gated queries below.
  const { data: meData } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const { data } = await apiClient.get('/auth/me');
      return (data.user ?? {}) as Record<string, string>;
    },
    staleTime: 5 * 60 * 1000,
  });
  useEffect(() => {
    const u = meData as { full_name?: string; email?: string; phone?: string } | undefined;
    if (u) setProfileForm({ full_name: u.full_name ?? '', email: u.email ?? '', phone: u.phone ?? '' });
  }, [meData]);

  const { data: notifPrefsData } = useQuery({
    queryKey: ['institution', 'notification-prefs'],
    queryFn: () => institutionService.getNotificationPrefs(),
    staleTime: 60 * 1000,
  });
  useEffect(() => {
    if (notifPrefsData) setNotifs(notifPrefsData);
  }, [notifPrefsData]);

  const { data: planData } = useQuery({
    queryKey: ['institution', 'plan-usage'],
    queryFn: () => institutionService.getPlanUsage(),
    staleTime: 60 * 1000,
  });
  useEffect(() => {
    if (planData) setPlan(planData);
  }, [planData]);

  // AI policy + usage — gated on the AI tab; cached like everything else
  const aiTabActive = tab === 'ai';
  const { data: aiPolicyData, isFetching: aiFetching } = useQuery({
    queryKey: ['institution', 'ai-policy'],
    queryFn: () => institutionService.getAiPolicy(),
    enabled: aiTabActive,
    staleTime: 30 * 1000,
  });
  const { data: aiUsageData } = useQuery({
    queryKey: ['institution', 'ai-usage-summary'],
    queryFn: () => institutionService.getAiUsageSummary({ days: 30, limit: 5 }),
    enabled: aiTabActive,
    staleTime: 30 * 1000,
  });
  useEffect(() => {
    if (aiPolicyData) setAiPolicy(aiPolicyData);
  }, [aiPolicyData]);
  useEffect(() => {
    if (aiUsageData) setAiUsage(aiUsageData);
  }, [aiUsageData]);
  // Mirror aiLoading for the existing render code without a new state flag
  const aiLoading = aiTabActive && aiFetching;

  const handleAiToggle = (field: string, value: boolean) => {
    if (!aiPolicy) return;
    setAiPolicy({ ...aiPolicy, [field]: value });
    setAiDirty(true);
  };

  const handleFeatureToggle = (key: string, value: boolean) => {
    if (!aiPolicy) return;
    setAiPolicy({
      ...aiPolicy,
      features_enabled: { ...aiPolicy.features_enabled, [key]: value },
    });
    setAiDirty(true);
  };

  const handleAiQuotaChange = (field: 'daily_token_quota' | 'monthly_token_quota' | 'per_student_daily_quota', raw: string) => {
    if (!aiPolicy) return;
    const parsed = raw === '' ? null : parseInt(raw, 10);
    // NaN / negative quotas would silently block AI — normalise to null.
    const clean = (parsed === null || isNaN(parsed) || parsed <= 0) ? null : parsed;
    setAiPolicy({ ...aiPolicy, [field]: clean });
    setAiDirty(true);
  };

  const saveAiPolicy = async () => {
    if (!aiPolicy) return;
    setAiSaving(true);
    try {
      const updated = await institutionService.updateAiPolicy({
        ai_enabled_global: aiPolicy.ai_enabled_global,
        ai_enabled_students: aiPolicy.ai_enabled_students,
        ai_enabled_instructors: aiPolicy.ai_enabled_instructors,
        features_enabled: aiPolicy.features_enabled,
        daily_token_quota: aiPolicy.daily_token_quota,
        monthly_token_quota: aiPolicy.monthly_token_quota,
        per_student_daily_quota: aiPolicy.per_student_daily_quota,
        hard_stop: aiPolicy.hard_stop,
      });
      setAiPolicy(updated);
      queryClient.setQueryData(['institution', 'ai-policy'], updated);
      setAiDirty(false);
      toast3('AI governance policy saved!');
    } catch (e: any) {
      toast3(e?.response?.data?.error ?? 'Failed to save AI policy.');
    } finally { setAiSaving(false); }
  };

  const refreshAiUsage = () => {
    queryClient.invalidateQueries({ queryKey: ['institution', 'ai-usage-summary'] });
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await apiClient.patch('/auth/profile', profileForm);
      if (data?.user && user) setUser({ ...user, full_name: data.user.full_name, email: data.user.email });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['institution', 'profile'] });
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

  const saveNotifs = async () => {
    setNotifSaving(true);
    try {
      const updated = await institutionService.updateNotificationPrefs(notifs);
      setNotifs(updated);
      queryClient.invalidateQueries({ queryKey: ['institution', 'notification-prefs'] });
      toast3('Notification preferences saved!');
    } catch (err: any) {
      toast3(err?.response?.data?.error ?? 'Failed to save preferences.');
    } finally { setNotifSaving(false); }
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
          <button key={t.id} onClick={() => {
            if (t.id === 'notifications') {
              router.push('/institution/notifications');
            } else if (t.id === 'profile') {
              router.push('/institution/profile');
            } else if (t.id === 'plan') {
              router.push('/institution/billing');
            } else if (t.id === 'ai') {
              router.push('/institution/ai-usage');
            } else if (t.id === 'help') {
              router.push('/institution/help');
            } else {
              setTab(t.id);
            }
          }}
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

            <button className={styles.btnPrimary} onClick={saveNotifs} disabled={notifSaving} style={{ marginTop: 24 }}>
              <Save size={14} /> {notifSaving ? 'Saving…' : 'Save Preferences'}
            </button>
          </div>
        </div>
      )}

      {/* ═══ PLAN & BILLING ═══ */}
      {tab === 'plan' && (() => {
        const pm = PLAN_META[plan?.plan ?? 'free'] ?? PLAN_META.free;
        const fmtLimit = (n?: number | null) => (n == null || n >= 99999) ? 'Unlimited' : String(n);
        const usageCards = [
          { label: 'Students',    value: plan ? String(plan.students.used) : '—',    max: plan ? fmtLimit(plan.students.limit) : '' },
          { label: 'Instructors', value: plan ? String(plan.instructors.used) : '—', max: plan ? fmtLimit(plan.instructors.limit) : '' },
          { label: 'Subjects',    value: plan ? String(plan.subjects) : '—',         max: '' },
        ];
        const upgrades = UPGRADE_PLANS.filter(p => PLAN_META[p.key].rank > pm.rank);
        return (
        <div style={{ maxWidth: 700 }}>
          {/* Current plan */}
          <div style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.06), rgba(124,58,237,0.02))', borderRadius: 18, border: '1.5px solid rgba(124,58,237,0.18)', padding: 28, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Zap size={16} style={{ color: '#9333ea' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#9333ea', textTransform: 'uppercase', letterSpacing: '.05em' }}>Current Plan</span>
                </div>
                <h3 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: '#201b2e', fontFamily: "'Space Grotesk', sans-serif" }}>{pm.name}</h3>
                <p style={{ margin: 0, fontSize: 13, color: '#726a85' }}>{pm.blurb}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#201b2e', fontFamily: "'Space Grotesk', sans-serif" }}>{pm.price}</p>
                <p style={{ margin: 0, fontSize: 12, color: '#9891a6' }}>{pm.sub}</p>
              </div>
            </div>

            <div className={styles.grid3} style={{ marginTop: 20 }}>
              {usageCards.map(u => (
                <div key={u.label} style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 12, padding: '12px 16px', border: '1px solid rgba(255,255,255,0.9)' }}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#9891a6', textTransform: 'uppercase', letterSpacing: '.04em' }}>{u.label}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 700, color: '#201b2e' }}>
                    {u.value}
                    {u.max === 'Unlimited'
                      ? <span style={{ fontSize: 13, color: '#9891a6', fontWeight: 500 }}> / ∞</span>
                      : u.max ? <span style={{ fontSize: 13, color: '#9891a6', fontWeight: 500 }}>/{u.max}</span> : null}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Upgrade options — only plans above the current tier */}
          {upgrades.length > 0 ? (
            <div className={styles.grid2} style={{ gap: 16 }}>
              {upgrades.map(plan => (
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
                    {plan.name === 'Enterprise' ? 'Contact Sales' : `Upgrade to ${plan.name}`}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ background: 'rgba(255,255,255,0.78)', borderRadius: 18, border: '1px solid rgba(255,255,255,0.9)', padding: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Check size={18} style={{ color: '#22c55e' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#201b2e' }}>You're on our highest tier — thank you for being an Enterprise partner.</span>
            </div>
          )}
        </div>
        );
      })()}

      {/* ═══ AI & USAGE ═══ */}
      {tab === 'ai' && (
        <div style={{ maxWidth: 780 }}>
          {aiLoading && !aiPolicy ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#9891a6' }}>Loading AI governance…</div>
          ) : aiPolicy ? (
            <>
              {/* Master + role switches */}
              <div style={{ background: 'rgba(255,255,255,0.78)', borderRadius: 18, border: '1px solid rgba(255,255,255,0.9)', padding: 28, boxShadow: '0 2px 12px rgba(0,0,0,0.05)', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9333ea' }}>
                    <Cpu size={17} strokeWidth={1.8} />
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#201b2e', fontFamily: "'Space Grotesk', sans-serif" }}>AI Governance</p>
                    <p style={{ margin: 0, fontSize: 12, color: '#9891a6' }}>Control which AI features are available across your institution</p>
                  </div>
                </div>

                {/* Master */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 12, background: aiPolicy.ai_enabled_global ? 'rgba(147,51,234,0.05)' : 'rgba(239,68,68,0.05)', border: `1px solid ${aiPolicy.ai_enabled_global ? 'rgba(147,51,234,0.15)' : 'rgba(239,68,68,0.15)'}`, marginBottom: 8 }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#201b2e' }}>AI Master Switch</p>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#726a85' }}>
                      {aiPolicy.ai_enabled_global ? 'All AI features are available (subject to per-role and per-feature settings below)' : 'All AI features are disabled institution-wide'}
                    </p>
                  </div>
                  <Toggle on={aiPolicy.ai_enabled_global} onClick={() => handleAiToggle('ai_enabled_global', !aiPolicy.ai_enabled_global)} />
                </div>

                {/* Role toggles */}
                {[
                  { field: 'ai_enabled_students',    label: 'Students',    desc: 'Allow students to use AI features' },
                  { field: 'ai_enabled_instructors', label: 'Instructors', desc: 'Allow instructors to use AI features' },
                ].map(r => (
                  <div key={r.field} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#201b2e' }}>{r.label}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9891a6' }}>{r.desc}</p>
                    </div>
                    <Toggle on={(aiPolicy as any)[r.field]} disabled={!aiPolicy.ai_enabled_global}
                      onClick={() => handleAiToggle(r.field, !(aiPolicy as any)[r.field])} />
                  </div>
                ))}
              </div>

              {/* Per-feature switches */}
              <div style={{ background: 'rgba(255,255,255,0.78)', borderRadius: 18, border: '1px solid rgba(255,255,255,0.9)', padding: 28, boxShadow: '0 2px 12px rgba(0,0,0,0.05)', marginBottom: 20 }}>
                <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: '#201b2e', fontFamily: "'Space Grotesk', sans-serif" }}>Feature Controls</h3>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: '#9891a6' }}>Toggle individual AI capabilities on or off.</p>
                {AI_FEATURES.map((f, i) => (
                  <div key={f.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: i < AI_FEATURES.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#201b2e' }}>{f.label}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9891a6' }}>{f.desc}</p>
                    </div>
                    <Toggle on={aiPolicy.features_enabled[f.key] ?? false} disabled={!aiPolicy.ai_enabled_global}
                      onClick={() => handleFeatureToggle(f.key, !(aiPolicy.features_enabled[f.key] ?? false))} />
                  </div>
                ))}
              </div>

              {/* Quotas */}
              <div style={{ background: 'rgba(255,255,255,0.78)', borderRadius: 18, border: '1px solid rgba(255,255,255,0.9)', padding: 28, boxShadow: '0 2px 12px rgba(0,0,0,0.05)', marginBottom: 20 }}>
                <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: '#201b2e', fontFamily: "'Space Grotesk', sans-serif" }}>Token Quotas</h3>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: '#9891a6' }}>Daily token limits. Leave blank to inherit the platform default.</p>
                <div className={styles.grid2} style={{ gap: 16 }}>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Institution daily quota (tokens)</label>
                    <input className={styles.input} type="number" min={0} placeholder="Platform default"
                      value={aiPolicy.daily_token_quota ?? ''}
                      onChange={e => handleAiQuotaChange('daily_token_quota', e.target.value)} />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Institution monthly quota (tokens)</label>
                    <input className={styles.input} type="number" min={0} placeholder="No monthly cap"
                      value={aiPolicy.monthly_token_quota ?? ''}
                      onChange={e => handleAiQuotaChange('monthly_token_quota', e.target.value)} />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Per-student daily quota (tokens)</label>
                    <input className={styles.input} type="number" min={0} placeholder="No per-student cap"
                      value={aiPolicy.per_student_daily_quota ?? ''}
                      onChange={e => handleAiQuotaChange('per_student_daily_quota', e.target.value)} />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0 0' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#201b2e' }}>Hard stop at quota</p>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9891a6' }}>
                      {aiPolicy.hard_stop ? 'Block AI calls once the quota is reached' : 'Warn only — allow calls to continue past the quota'}
                    </p>
                  </div>
                  <Toggle on={aiPolicy.hard_stop} onClick={() => handleAiToggle('hard_stop', !aiPolicy.hard_stop)} />
                </div>
              </div>

              {/* Save bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <button className={styles.btnPrimary} onClick={saveAiPolicy} disabled={!aiDirty || aiSaving}>
                  <Save size={14} /> {aiSaving ? 'Saving…' : 'Save AI Policy'}
                </button>
                {aiDirty && <span style={{ fontSize: 13, color: '#eab308', fontWeight: 600 }}>Unsaved changes</span>}
                {aiPolicy.updated_at && !aiDirty && (
                  <span style={{ fontSize: 12, color: '#9891a6' }}>Last updated {new Date(aiPolicy.updated_at).toLocaleString()}</span>
                )}
              </div>

              {/* ── Usage snapshot ── */}
              <div style={{ background: 'rgba(255,255,255,0.78)', borderRadius: 18, border: '1px solid rgba(255,255,255,0.9)', padding: 28, boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                  <div>
                    <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#201b2e', fontFamily: "'Space Grotesk', sans-serif" }}>Usage — Last 30 Days</h3>
                    <p style={{ margin: 0, fontSize: 12, color: '#9891a6' }}>Deeper per-user analysis lives in Analytics → AI Usage.</p>
                  </div>
                  <button onClick={refreshAiUsage}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: 'rgba(147,51,234,0.08)', border: '1px solid rgba(147,51,234,0.2)', color: '#9333ea', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    <RefreshCw size={13} style={aiLoading ? { animation: 'spin 1s linear infinite' } : {}} /> Refresh
                  </button>
                </div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

                <div className={styles.grid3} style={{ marginBottom: 20 }}>
                  <div style={{ background: 'rgba(147,51,234,0.05)', borderRadius: 12, padding: '14px 16px', border: '1px solid rgba(147,51,234,0.12)' }}>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#9891a6', textTransform: 'uppercase', letterSpacing: '.04em' }}>Total Calls</p>
                    <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: '#201b2e', fontFamily: "'Space Grotesk', sans-serif" }}>{fmtNum(aiUsage?.summary.calls)}</p>
                  </div>
                  <div style={{ background: 'rgba(147,51,234,0.05)', borderRadius: 12, padding: '14px 16px', border: '1px solid rgba(147,51,234,0.12)' }}>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#9891a6', textTransform: 'uppercase', letterSpacing: '.04em' }}>Total Tokens</p>
                    <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: '#201b2e', fontFamily: "'Space Grotesk', sans-serif" }}>{fmtNum(aiUsage?.summary.tokens)}</p>
                  </div>
                  <div style={{ background: 'rgba(147,51,234,0.05)', borderRadius: 12, padding: '14px 16px', border: '1px solid rgba(147,51,234,0.12)' }}>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#9891a6', textTransform: 'uppercase', letterSpacing: '.04em' }}>Est. Cost</p>
                    <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: '#201b2e', fontFamily: "'Space Grotesk', sans-serif" }}>${(aiUsage?.summary.cost_usd ?? 0).toFixed(4)}</p>
                  </div>
                </div>

                {/* Per-feature bars */}
                {aiUsage && Object.keys(aiUsage.summary.by_feature).length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Object.entries(aiUsage.summary.by_feature)
                      .sort((a, b) => b[1].tokens - a[1].tokens)
                      .map(([feat, d]) => {
                        const maxTok = Math.max(...Object.values(aiUsage.summary.by_feature).map(x => x.tokens), 1);
                        const w = Math.round((d.tokens / maxTok) * 100);
                        return (
                          <div key={feat} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ width: 130, fontSize: 13, fontWeight: 600, color: '#201b2e', textTransform: 'capitalize' }}>{feat.replace(/_/g, ' ')}</span>
                            <div style={{ flex: 1, height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                              <div style={{ width: `${w}%`, height: '100%', background: 'linear-gradient(90deg,#9333ea,#c084fc)', borderRadius: 4 }} />
                            </div>
                            <span style={{ width: 70, textAlign: 'right', fontSize: 12, color: '#726a85', fontWeight: 600 }}>{d.calls} calls</span>
                            <span style={{ width: 90, textAlign: 'right', fontSize: 12, color: '#9891a6' }}>{fmtNum(d.tokens)} tok</span>
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: '#9891a6', textAlign: 'center', padding: 24 }}>No AI usage recorded in the last 30 days.</p>
                )}
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 24, color: '#ef4444' }}>
              <AlertTriangle size={18} /> Could not load AI governance settings.
            </div>
          )}
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
