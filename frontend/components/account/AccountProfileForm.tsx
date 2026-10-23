'use client';

import { useEffect, useState } from 'react';
import { authService, type AuthUser } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth-store';
import { CheckCircle2, Loader2, LockKeyhole, Save, UserRound } from 'lucide-react';

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #e9e4f2', borderRadius: 18,
  padding: 22, boxShadow: '0 8px 24px rgba(37, 22, 62, .045)',
};
const label: React.CSSProperties = {
  display: 'block', marginBottom: 6, color: '#423b50', fontSize: 12.5, fontWeight: 700,
};
const input: React.CSSProperties = {
  width: '100%', minHeight: 42, border: '1px solid #ddd6e8', borderRadius: 10,
  padding: '10px 12px', color: '#211a2c', background: '#fff', font: 'inherit', fontSize: 13,
  boxSizing: 'border-box', outlineColor: '#8b5cf6',
};
const primary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  border: 0, borderRadius: 10, background: '#6d28d9', color: '#fff',
  padding: '10px 15px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
};

function apiError(error: unknown, fallback: string): string {
  const e = error as { response?: { data?: { error?: string } }; message?: string };
  return e?.response?.data?.error || e?.message || fallback;
}

export default function AccountProfileForm({ roleLabel }: { roleLabel: string }) {
  const storeUser = useAuthStore(s => s.user);
  const setUser = useAuthStore(s => s.setUser);
  const [profile, setProfile] = useState({ full_name: '', phone: '', bio: '', location: '', timezone: '', language: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileNotice, setProfileNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [password, setPassword] = useState({ current: '', next: '', confirm: '' });
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    authService.getMe().then((user: AuthUser) => {
      if (!active) return;
      setUser(user);
      setProfile({
        full_name: user.full_name || '', phone: user.phone || '', bio: user.bio || '',
        location: user.location || '', timezone: user.timezone || '', language: user.language || '',
      });
    }).catch(error => {
      if (!active) return;
      setProfile({
        full_name: storeUser?.full_name || '', phone: storeUser?.phone || '', bio: storeUser?.bio || '',
        location: storeUser?.location || '', timezone: storeUser?.timezone || '', language: storeUser?.language || '',
      });
      setProfileNotice({ ok: false, text: apiError(error, 'Could not refresh your profile; showing saved account details.') });
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [setUser]);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile.full_name.trim()) {
      setProfileNotice({ ok: false, text: 'Name cannot be blank.' });
      return;
    }
    setSaving(true);
    setProfileNotice(null);
    try {
      const updated = await authService.updateProfile({
        full_name: profile.full_name.trim(), phone: profile.phone.trim(), bio: profile.bio.trim(),
        location: profile.location.trim(), timezone: profile.timezone.trim(), language: profile.language.trim(),
      });
      setUser({ ...storeUser, ...updated });
      setProfile({
        full_name: updated.full_name || '', phone: updated.phone || '', bio: updated.bio || '',
        location: updated.location || '', timezone: updated.timezone || '', language: updated.language || '',
      });
      setProfileNotice({ ok: true, text: 'Profile saved. Your account header is updated.' });
    } catch (error) {
      setProfileNotice({ ok: false, text: apiError(error, 'Could not save your profile.') });
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordNotice(null);
    if (password.next.length < 8) return setPasswordNotice({ ok: false, text: 'Use at least 8 characters for your new password.' });
    if (password.next !== password.confirm) return setPasswordNotice({ ok: false, text: 'The new passwords do not match.' });
    if (password.current === password.next) return setPasswordNotice({ ok: false, text: 'Choose a password different from your current one.' });
    setSavingPassword(true);
    try {
      const result = await authService.changePassword(password.current, password.next);
      if (result.user) setUser({ ...storeUser, ...result.user });
      setPassword({ current: '', next: '', confirm: '' });
      setPasswordNotice({ ok: true, text: 'Password changed successfully.' });
    } catch (error) {
      setPasswordNotice({ ok: false, text: apiError(error, 'Could not change the password.') });
    } finally {
      setSavingPassword(false);
    }
  };

  const field = (key: keyof typeof profile, title: string, placeholder = '') => (
    <div key={key}>
      <label htmlFor={`account-${key}`} style={label}>{title}</label>
      <input id={`account-${key}`} style={input} value={profile[key]} placeholder={placeholder}
        onChange={e => setProfile(current => ({ ...current, [key]: e.target.value }))} />
    </div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 18, alignItems: 'start' }}>
      <section style={card} aria-labelledby="account-profile-title">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 18 }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, background: '#f3e8ff', color: '#7c3aed', display: 'grid', placeItems: 'center' }}><UserRound size={19} /></span>
          <div><h2 id="account-profile-title" style={{ margin: 0, color: '#201b2e', fontSize: 17 }}>Personal profile</h2><p style={{ margin: '3px 0 0', color: '#787187', fontSize: 12 }}>Edit the account details used across NexLab.</p></div>
        </div>
        {loading ? <div style={{ padding: 24, color: '#777' }}><Loader2 size={18} className="animate-spin" /> Loading profile…</div> : (
          <form onSubmit={saveProfile}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 14 }}>
              {field('full_name', 'Full name')}
              <div><label htmlFor="account-email" style={label}>Login email</label><input id="account-email" style={{ ...input, background: '#f8f7fa', color: '#756e80' }} value={storeUser?.email || ''} readOnly /><small style={{ display: 'block', marginTop: 5, color: '#8b8494', fontSize: 11 }}>Contact your administrator to change your login email.</small></div>
              {field('phone', 'Phone', 'Add a phone number')}
              {field('location', 'Location', 'City, region')}
              {field('timezone', 'Time zone', 'e.g. Asia/Kolkata')}
              {field('language', 'Language', 'e.g. English')}
              <div style={{ gridColumn: '1 / -1' }}>{field('bio', 'About me', 'A short introduction')}</div>
            </div>
            {profileNotice && <p role="status" style={{ margin: '14px 0 0', color: profileNotice.ok ? '#15803d' : '#b91c1c', fontSize: 12.5, fontWeight: 600 }}>{profileNotice.text}</p>}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, gap: 12, flexWrap: 'wrap' }}>
              <span style={{ color: '#858091', fontSize: 11.5 }}>{roleLabel} · Email is read-only</span>
              <button type="submit" style={{ ...primary, opacity: saving ? .7 : 1 }} disabled={saving || loading}>{saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {saving ? 'Saving…' : 'Save profile'}</button>
            </div>
          </form>
        )}
      </section>

      <section style={card} aria-labelledby="account-password-title">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 18 }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, background: '#eff6ff', color: '#2563eb', display: 'grid', placeItems: 'center' }}><LockKeyhole size={19} /></span>
          <div><h2 id="account-password-title" style={{ margin: 0, color: '#201b2e', fontSize: 17 }}>Password & security</h2><p style={{ margin: '3px 0 0', color: '#787187', fontSize: 12 }}>Change your password. Your current session stays signed in.</p></div>
        </div>
        <form onSubmit={changePassword} style={{ display: 'grid', gap: 13 }}>
          <div><label htmlFor="current-password" style={label}>Current password</label><input id="current-password" type="password" autoComplete="current-password" required style={input} value={password.current} onChange={e => setPassword(v => ({ ...v, current: e.target.value }))} /></div>
          <div><label htmlFor="new-password" style={label}>New password</label><input id="new-password" type="password" autoComplete="new-password" minLength={8} required style={input} value={password.next} onChange={e => setPassword(v => ({ ...v, next: e.target.value }))} /></div>
          <div><label htmlFor="confirm-password" style={label}>Confirm new password</label><input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required style={input} value={password.confirm} onChange={e => setPassword(v => ({ ...v, confirm: e.target.value }))} /></div>
          {passwordNotice && <p role="status" style={{ margin: 0, color: passwordNotice.ok ? '#15803d' : '#b91c1c', fontSize: 12.5, fontWeight: 600 }}>{passwordNotice.text}</p>}
          <button type="submit" style={{ ...primary, background: '#334155', opacity: savingPassword ? .7 : 1, justifySelf: 'start' }} disabled={savingPassword}>{savingPassword ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} {savingPassword ? 'Updating…' : 'Change password'}</button>
        </form>
        <p style={{ margin: '14px 0 0', fontSize: 11.5, color: '#8b8494', lineHeight: 1.5 }}>Two-factor authentication is not configured for this account, so we do not show a misleading on/off switch here.</p>
      </section>
    </div>
  );
}
