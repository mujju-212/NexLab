'use client';

import { useEffect, useState } from 'react';
import InstitutionShell from '@/components/layout/InstitutionShell';
import { useAuthStore } from '@/store/auth-store';
import { authService } from '@/services/auth.service';
import { useRouter } from 'next/navigation';
import { User, Mail, Phone, Shield, Building2, Save, KeyRound } from 'lucide-react';
import styles from '../dashboard/page.module.css';

export default function ProfilePage() {
  const { user } = useAuthStore();
  const router   = useRouter();
  const [saving, setSaving]   = useState(false);
  const [toast, setToast]     = useState<string | null>(null);
  const [pwForm, setPwForm]   = useState({ current: '', newPw: '', confirm: '' });
  const [showPw, setShowPw]   = useState(false);

  const toast3 = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.newPw !== pwForm.confirm) { toast3('Passwords do not match.'); return; }
    if (pwForm.newPw.length < 8) { toast3('Password must be at least 8 characters.'); return; }
    setSaving(true);
    try {
      // POST /api/auth/change-password
      const { apiClient } = await import('@/services/api-client');
      await apiClient.post('/auth/change-password', {
        current_password: pwForm.current,
        new_password:     pwForm.newPw,
      });
      toast3('Password changed successfully!');
      setPwForm({ current:'', newPw:'', confirm:'' });
    } catch (err: any) {
      toast3(err?.response?.data?.error ?? 'Failed to change password.');
    } finally { setSaving(false); }
  };

  const handleLogout = async () => {
    await authService.logout();
    const { clearAuth } = useAuthStore.getState();
    clearAuth();
    router.push('/login');
  };

  const initials = user?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? 'IA';

  return (
    <InstitutionShell activePage="Profile" title="My Profile" subtitle="Manage your account details and security.">
      {toast && (
        <div style={{ position:'fixed', bottom:24, right:24, zIndex:300, background:'#201b2e', color:'#fff', padding:'12px 20px', borderRadius:12, fontSize:14, fontWeight:600 }}>
          {toast}
        </div>
      )}

      <div className={styles.grid2} style={{ maxWidth:900 }}>

        {/* Profile Card */}
        <div style={{ background:'rgba(255,255,255,0.78)', borderRadius:18, border:'1px solid rgba(255,255,255,0.9)', padding:28, boxShadow:'0 2px 12px rgba(0,0,0,0.05)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:28 }}>
            <div style={{ width:64, height:64, borderRadius:'50%', background:'linear-gradient(135deg,#9333ea,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:22, fontWeight:700, fontFamily:'Space Grotesk,sans-serif', flexShrink:0 }}>
              {initials}
            </div>
            <div>
              <p style={{ margin:0, fontSize:18, fontWeight:700, color:'#201b2e', fontFamily:'Space Grotesk,sans-serif' }}>{user?.full_name ?? '—'}</p>
              <p style={{ margin:'3px 0 0', fontSize:13, color:'#9891a6' }}>Institution Administrator</p>
            </div>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {[
              { Icon: Mail,      label: 'Email',          value: user?.email },
              { Icon: Shield,    label: 'Role',           value: 'Institution Admin' },
              { Icon: Building2, label: 'Institution ID', value: user?.institution_id?.slice(0,12)+'…' },
            ].map(({ Icon, label, value }) => (
              <div key={label} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:'rgba(245,243,255,0.5)', borderRadius:11 }}>
                <Icon size={15} style={{ color:'#9333ea', flexShrink:0 }} />
                <div>
                  <p style={{ margin:0, fontSize:11, fontWeight:700, color:'#9891a6', textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</p>
                  <p style={{ margin:'2px 0 0', fontSize:14, fontWeight:600, color:'#201b2e' }}>{value ?? '—'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Change Password */}
        <div style={{ background:'rgba(255,255,255,0.78)', borderRadius:18, border:'1px solid rgba(255,255,255,0.9)', padding:28, boxShadow:'0 2px 12px rgba(0,0,0,0.05)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:22 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'#faf5ff', display:'flex', alignItems:'center', justifyContent:'center', color:'#9333ea' }}>
              <KeyRound size={17} strokeWidth={1.8} />
            </div>
            <div>
              <p style={{ margin:0, fontFamily:'Space Grotesk,sans-serif', fontSize:15, fontWeight:700, color:'#201b2e' }}>Change Password</p>
              <p style={{ margin:0, fontSize:12, color:'#9891a6' }}>Keep your account secure</p>
            </div>
          </div>

          <form onSubmit={changePassword}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Current Password</label>
              <input className={styles.input} type={showPw?'text':'password'} required placeholder="Current password"
                value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current:e.target.value }))} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>New Password</label>
              <input className={styles.input} type={showPw?'text':'password'} required placeholder="Min 8 characters"
                value={pwForm.newPw} onChange={e => setPwForm(f => ({ ...f, newPw:e.target.value }))} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Confirm New Password</label>
              <input className={styles.input} type={showPw?'text':'password'} required placeholder="Re-enter new password"
                value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm:e.target.value }))} />
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
              <input type="checkbox" id="showPw" checked={showPw} onChange={e => setShowPw(e.target.checked)} />
              <label htmlFor="showPw" style={{ fontSize:13, color:'#726a85', cursor:'pointer' }}>Show passwords</label>
            </div>
            <button type="submit" className={styles.btnPrimary} disabled={saving}>
              <Save size={14} /> {saving ? 'Saving…' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </InstitutionShell>
  );
}
