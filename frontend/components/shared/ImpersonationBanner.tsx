'use client';

/**
 * ImpersonationBanner — mounted in every learner shell. When the signed-in
 * identity is actually an admin "viewing as" this user (the /me payload
 * carries `impersonation`), render the fixed read-only banner with an
 * End-session control that restores the admin token.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, LogOut } from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { adminGovernanceService } from '@/services/admin.service';

export default function ImpersonationBanner() {
  const { user, setUser, isAuthenticated } = useAuthStore();
  const router = useRouter();
  const [ending, setEnding] = useState(false);
  const imp = (user as unknown as { impersonation?: { active: boolean; impersonator_name?: string; reason?: string } })?.impersonation;

  if (!isAuthenticated || !imp?.active) return null;

  const end = async () => {
    setEnding(true);
    try {
      await adminGovernanceService.endImpersonation();
    } catch { /* session may already be closed */ }
    // restore the admin token stashed at impersonation start
    const backup = localStorage.getItem('imp_admin_backup');
    if (backup) {
      localStorage.setItem('access_token', backup);
      document.cookie = `access_token=${backup}; path=/`;
      localStorage.removeItem('imp_admin_backup');
    }
    try {
      const { authService } = await import('@/services/auth.service');
      const me = await authService.getMe();
      setUser(me as never);
    } catch { /* fall through to admin area */ }
    router.push('/admin/users');
  };

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 95, width: '100%',
      background: 'linear-gradient(90deg,#f59e0b,#d97706)', color: '#fff',
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      padding: '10px 20px', fontSize: 13, fontWeight: 700,
      boxShadow: '0 4px 16px rgba(217,119,6,.35)',
    }}>
      <Eye size={15} />
      <span>
        Read-only — viewing as <u>{user?.full_name}</u>
        {imp.impersonator_name ? ` · started by ${imp.impersonator_name}` : ''}
        {imp.reason ? ` · ${imp.reason}` : ''}
      </span>
      <button
        onClick={end}
        disabled={ending}
        style={{
          marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(255,255,255,.2)', border: '1px solid rgba(255,255,255,.5)',
          color: '#fff', fontWeight: 800, fontSize: 12.5, borderRadius: 9,
          padding: '6px 14px', cursor: 'pointer',
        }}
      >
        <LogOut size={13} /> {ending ? 'Ending…' : 'End session'}
      </button>
    </div>
  );
}
