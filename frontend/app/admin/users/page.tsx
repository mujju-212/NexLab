'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '@/components/layout/AdminShell';
import {
  Search, Users as UsersIcon, ShieldCheck, ShieldOff, KeyRound, LogOut,
  Loader2, ChevronLeft, ChevronRight, RefreshCw, X, Copy, Check,
} from 'lucide-react';
import { adminService, adminUsersService, Institution, type AdminDirectoryUser } from '@/services/admin.service';
import styles from './page.module.css';

const ROLE_OPTIONS = ['student', 'instructor', 'institution_admin', 'platform_admin', 'platform_user'];
const STATUS_OPTIONS = ['active', 'suspended'];

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const fmtRel = (iso: string | null) => {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return 'never';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : fmtDate(iso);
};

type Modal =
  | { kind: 'suspend'; user: AdminDirectoryUser }
  | { kind: 'reset'; user: AdminDirectoryUser; temp?: string }
  | { kind: 'force-logout'; user: AdminDirectoryUser }
  | null;

export default function UserManagementPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [institutionId, setInstitutionId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [users, setUsers] = useState<AdminDirectoryUser[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendUntil, setSuspendUntil] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    adminService.listInstitutions().then(setInstitutions).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminUsersService.listUsers({
        q: q || undefined,
        role: role || undefined,
        institution_id: institutionId || undefined,
        status: status || undefined,
        page,
        per_page: 20,
      });
      setUsers(res.users || []);
      setTotal(res.total || 0);
      setPages(res.pages || 1);
    } catch {
      setError('Could not load the user directory. Check your connection and retry.');
    } finally {
      setLoading(false);
    }
  }, [q, role, institutionId, status, page]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(load, q ? 350 : 0);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [load]);

  const runAction = async (fn: () => Promise<void>, done: string) => {
    setActionBusy(true);
    try {
      await fn();
      setNotice(done);
      setModal(null);
      await load();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Action failed.';
      setError(msg);
      setModal(null);
    } finally {
      setActionBusy(false);
    }
  };

  const roleChip = (r: string) => {
    const map: Record<string, string> = {
      platform_admin: '#7c3aed', institution_admin: '#2563eb', instructor: '#059669',
      student: '#d97706', platform_user: '#db2777',
    };
    const c = map[r] || '#64748b';
    return (
      <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: `${c}18`, color: c, whiteSpace: 'nowrap' }}>
        {r.replace(/_/g, ' ')}
      </span>
    );
  };
  const statusPill = (s: string) => (
    <span style={{
      padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
      background: s === 'suspended' ? '#fee2e2' : '#dcfce7',
      color: s === 'suspended' ? '#b91c1c' : '#15803d',
    }}>
      {s === 'suspended' ? '● suspended' : '● active'}
    </span>
  );

  return (
    <AdminShell activePage="User Management">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, fontFamily: 'var(--font-display)' }}>User Management</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b', fontWeight: 600 }}>
            Every account on the platform — institutions and direct users. {total.toLocaleString()} total.
          </p>
        </div>
        <button className={styles.btnSecondary} onClick={load}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* filters */}
      <div className={styles.toolBar}>
        <div className={styles.searchBox}>
          <Search size={15} color="#9891a6" />
          <input
            className={styles.searchInput}
            placeholder="Search name or email…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
          />
        </div>
        <div className={styles.toolRight}>
          <select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} style={selectStyle}>
            <option value="">All roles</option>
            {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
          </select>
          <select value={institutionId} onChange={(e) => { setInstitutionId(e.target.value); setPage(1); }} style={{ ...selectStyle, maxWidth: 220 }}>
            <option value="">All institutions</option>
            <option value="direct">◆ Direct (no institution)</option>
            {institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={selectStyle}>
            <option value="">Any status</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {error && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, margin: '0 0 14px', padding: '12px 16px', borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>
          <span>{error}</span>
          <button onClick={load} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', fontWeight: 700, cursor: 'pointer', fontSize: 12.5 }}>Retry</button>
        </div>
      )}
      {notice && (
        <div style={{ margin: '0 0 14px', padding: '12px 16px', borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#15803d' }}><X size={14} /></button>
        </div>
      )}

      {/* table */}
      <div className={styles.tableWrap}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Loader2 size={16} className="spin" /> Loading directory…
          </div>
        ) : users.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#9891a6', fontWeight: 600 }}>
            <UsersIcon size={22} style={{ marginBottom: 8, opacity: .5 }} /><br />
            No users match these filters.
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>User</th><th>Role</th><th>Institution</th><th>Status</th>
                <th>Last active</th><th>Joined</th><th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/admin/users/${u.id}`)}>
                  <td>
                    <div style={{ fontWeight: 700, color: '#201b2e' }}>{u.full_name || '—'}</div>
                    <div style={{ fontSize: 12, color: '#9891a6', fontWeight: 600 }}>{u.email}</div>
                  </td>
                  <td>{roleChip(u.role)}</td>
                  <td style={{ fontSize: 12.5, color: '#615a72' }}>
                    {u.account_type === 'direct'
                      ? <span style={{ color: '#db2777', fontWeight: 700 }}>◆ Direct</span>
                      : (u.institution_name || '—')}
                  </td>
                  <td>{statusPill(u.status)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtRel(u.last_login)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(u.created_at)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      {u.status === 'suspended' ? (
                        <button title="Activate" onClick={() => runAction(() => adminUsersService.activateUser(u.id).then(() => {}), `${u.full_name} reactivated.`)} style={actBtn('#dcfce7', '#15803d')}>
                          <ShieldCheck size={13} />
                        </button>
                      ) : (
                        <button title="Suspend" onClick={() => { setSuspendReason(''); setSuspendUntil(''); setModal({ kind: 'suspend', user: u }); }} style={actBtn('#fee2e2', '#b91c1c')}>
                          <ShieldOff size={13} />
                        </button>
                      )}
                      <button title="Reset password" onClick={() => setModal({ kind: 'reset', user: u })} style={actBtn('#fef3c7', '#b45309')}>
                        <KeyRound size={13} />
                      </button>
                      <button title="Force logout" onClick={() => setModal({ kind: 'force-logout', user: u })} style={actBtn('#e0e7ff', '#4338ca')}>
                        <LogOut size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className={styles.tableFooter}>
          <span>Page {page} of {pages} · {total.toLocaleString()} users</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={styles.btnSecondary} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={{ opacity: page <= 1 ? .45 : 1 }}>
              <ChevronLeft size={14} /> Prev
            </button>
            <button className={styles.btnSecondary} disabled={page >= pages} onClick={() => setPage((p) => p + 1)} style={{ opacity: page >= pages ? .45 : 1 }}>
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ── modals ─────────────────────────────────────────────────────── */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,10,30,.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80 }} onClick={() => !actionBusy && setModal(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(480px, 92vw)', background: '#fff', borderRadius: 18, padding: 26, boxShadow: '0 30px 80px rgba(0,0,0,.25)' }}>

            {modal.kind === 'suspend' && (
              <>
                <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800 }}>Suspend account</h3>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                  {modal.user.full_name} · {modal.user.email} — login will be blocked and all live sessions revoked.
                </p>
                <label style={labelStyle}>Reason (required, stored in the audit log)</label>
                <textarea value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Why is this account being suspended?" />
                <label style={{ ...labelStyle, marginTop: 12 }}>Temporary — lift automatically at (optional)</label>
                <input type="datetime-local" value={suspendUntil} onChange={(e) => setSuspendUntil(e.target.value)} style={inputStyle} />
                <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
                  <button className={styles.btnSecondary} onClick={() => setModal(null)} disabled={actionBusy}>Cancel</button>
                  <button
                    className={styles.btnPrimary}
                    disabled={actionBusy || !suspendReason.trim()}
                    onClick={() => runAction(
                      async () => {
                        await adminUsersService.suspendUser(
                          modal.user.id, suspendReason.trim(),
                          suspendUntil ? new Date(suspendUntil).toISOString() : undefined);
                      },
                      `${modal.user.full_name} suspended.`)}
                    style={{ background: 'linear-gradient(135deg,#dc2626,#ef4444)' }}
                  >
                    {actionBusy ? <Loader2 size={14} className="spin" /> : <ShieldOff size={14} />} Suspend
                  </button>
                </div>
              </>
            )}

            {modal.kind === 'reset' && !('temp' in modal && modal.temp) && (
              <>
                <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800 }}>Reset password</h3>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                  {modal.user.full_name} · {modal.user.email} — their old password and sessions stop working;
                  they must set a new password at next login.
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button className={styles.btnSecondary} onClick={() => setModal(null)} disabled={actionBusy}>Cancel</button>
                  <button
                    className={styles.btnPrimary}
                    disabled={actionBusy}
                    onClick={() => runAction(async () => {
                      const res = await adminUsersService.resetUserPassword(modal.user.id);
                      setModal({ kind: 'reset', user: modal.user, temp: res.temp_password });
                    }, '')}
                  >
                    {actionBusy ? <Loader2 size={14} className="spin" /> : <KeyRound size={14} />} Issue temp password
                  </button>
                </div>
              </>
            )}

            {modal.kind === 'reset' && 'temp' in modal && modal.temp && (
              <>
                <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800 }}>Temp password issued</h3>
                <p style={{ margin: '0 0 14px', fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                  Shown once — copy and deliver it to {modal.user.full_name} now.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, background: '#f8fafc', border: '1px dashed #cbd5e1' }}>
                  <code style={{ flex: 1, fontSize: 16, fontWeight: 700, color: '#7c3aed', letterSpacing: .5 }}>{modal.temp}</code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(modal.temp!); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                    style={{ ...actBtn('#ede9fe', '#6d28d9'), padding: '7px 10px' }}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
                  <button className={styles.btnPrimary} onClick={() => setModal(null)}>Done</button>
                </div>
              </>
            )}

            {modal.kind === 'force-logout' && (
              <>
                <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800 }}>Force logout</h3>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                  End every live session for {modal.user.full_name} right now? They can log in again with their password.
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button className={styles.btnSecondary} onClick={() => setModal(null)} disabled={actionBusy}>Cancel</button>
                  <button
                    className={styles.btnPrimary}
                    disabled={actionBusy}
                    onClick={() => runAction(() => adminUsersService.forceLogoutUser(modal.user.id).then(() => {}), `All sessions for ${modal.user.full_name} ended.`)}
                  >
                    {actionBusy ? <Loader2 size={14} className="spin" /> : <LogOut size={14} />} Force logout
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </AdminShell>
  );
}

const actBtn = (bg: string, color: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 30, height: 30, borderRadius: 9, border: 'none', cursor: 'pointer', background: bg, color,
});
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: '#615a72', marginBottom: 6 };
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0',
  fontSize: 13.5, fontWeight: 600, color: '#201b2e', outline: 'none', boxSizing: 'border-box',
};
const selectStyle: React.CSSProperties = {
  padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.7)',
  background: 'rgba(255,255,255,.55)', fontWeight: 600, fontSize: 13, color: '#463f57',
};
