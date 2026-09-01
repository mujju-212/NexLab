'use client';

import { useEffect, useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth-store';

/**
 * Blocks the whole shell until the user replaces an admin-issued temp
 * password. The backend enforces the same rule (403 PASSWORD_CHANGE_REQUIRED
 * on every gated endpoint) — this is the friendly face of that gate.
 * Shown as a full-screen overlay so no page content is reachable underneath.
 */
export default function PasswordGate({ children }: { children: React.ReactNode }) {
  const { user, setUser } = useAuthStore();
  const needsChange = !!user?.must_change_password;

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the store in sync if the flag is cleared elsewhere (e.g. re-login).
  useEffect(() => { /* reactive via zustand — nothing to fetch */ }, [user]);

  if (!needsChange) return <>{children}</>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < 8) { setError('New password must be at least 8 characters.'); return; }
    if (next !== confirm) { setError('Passwords do not match.'); return; }
    if (next === current) { setError('New password must be different.'); return; }
    setBusy(true);
    try {
      // The response carries a fresh token (old JWT has the expired-password
      // claim) and the updated user — swap both in.
      const data = await authService.changePassword(current, next);
      if (data.user) setUser({ ...user!, ...data.user, must_change_password: false });
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: string } } };
      setError(e2?.response?.data?.error ?? 'Failed to change password. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000, display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 20,
      background: 'linear-gradient(135deg, #170f26 0%, #2b1f42 100%)',
      overflowY: 'auto',
    }}>
      <form onSubmit={submit} style={{
        width: '100%', maxWidth: 420, background: 'rgba(255,255,255,0.96)',
        borderRadius: 20, padding: '34px 30px', boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(147,51,234,0.1)', color: '#9333ea', marginBottom: 16,
        }}>
          <Lock size={24} />
        </div>
        <h1 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700, color: '#201b2e', fontFamily: "'Space Grotesk', sans-serif" }}>
          Set your own password
        </h1>
        <p style={{ margin: '0 0 20px', fontSize: 13.5, color: '#6b6480', lineHeight: 1.5 }}>
          You&apos;re signed in with a password issued by your institution&apos;s
          administrator. Choose your own password to continue — you won&apos;t be
          asked again.
        </p>

        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#201b2e', marginBottom: 6 }}>
          Temporary password
        </label>
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <input
            type={show ? 'text' : 'password'}
            value={current}
            onChange={e => setCurrent(e.target.value)}
            placeholder="Paste the temporary password"
            autoFocus
            style={{ width: '100%', padding: '11px 40px 11px 13px', borderRadius: 10, border: '1px solid #ddd6ee', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
          />
          <button type="button" onClick={() => setShow(s => !s)} aria-label="Toggle visibility"
            style={{ position: 'absolute', right: 10, top: 9, background: 'none', border: 'none', cursor: 'pointer', color: '#9891a6' }}>
            {show ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>

        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#201b2e', marginBottom: 6 }}>
          New password
        </label>
        <input
          type="password"
          value={next}
          onChange={e => setNext(e.target.value)}
          placeholder="At least 8 characters"
          style={{ width: '100%', padding: '11px 13px', borderRadius: 10, border: '1px solid #ddd6ee', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 14 }}
        />

        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#201b2e', marginBottom: 6 }}>
          Confirm new password
        </label>
        <input
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder="Type it once more"
          style={{ width: '100%', padding: '11px 13px', borderRadius: 10, border: '1px solid #ddd6ee', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 16 }}
        />

        {error && (
          <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#dc2626', fontWeight: 600 }}>{error}</p>
        )}

        <button type="submit" disabled={busy || !current || !next || !confirm}
          style={{
            width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
            fontSize: 14.5, fontWeight: 700, color: '#fff', cursor: 'pointer',
            background: 'linear-gradient(135deg, #9333ea, #7c3aed)',
            opacity: busy || !current || !next || !confirm ? 0.6 : 1,
          }}>
          {busy ? 'Saving…' : 'Save password & continue'}
        </button>
      </form>
    </div>
  );
}
