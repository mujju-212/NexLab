'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '@/components/layout/AdminShell';
import {
  Search, Users as UsersIcon, ShieldCheck, ShieldOff, KeyRound, LogOut,
  Loader2, ChevronLeft, ChevronRight, RefreshCw, X, Copy, Check, Plus,
} from 'lucide-react';
import { adminService, adminUsersService, type Institution, type AdminDirectoryUser } from '@/services/admin.service';
import styles from './page.module.css';

const ROLE_OPTIONS = ['student', 'instructor', 'institution_admin', 'platform_admin', 'platform_user'];
const STATUS_OPTIONS = ['active', 'inactive', 'suspended', 'pending_deletion'];

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
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ email: '', full_name: '', role: 'student', institution_id: '' });
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; full_name: string; temp_password: string } | null>(null);
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

  const runAction = async (fn: () => Promise<void>, done: string, closeModal = true) => {
    setActionBusy(true);
    try {
      await fn();
      if (done) setNotice(done);
      if (closeModal) setModal(null);
      await load();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Action failed.';
      setError(msg);
      if (closeModal) setModal(null);
    } finally {
      setActionBusy(false);
    }
  };

  const createUser = async () => {
    const institutionId = createForm.role === 'platform_user' ? undefined : createForm.institution_id || undefined;
    if (createForm.role !== 'platform_user' && !institutionId) {
      setError('Select an institution for this account.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const result = await adminUsersService.createUser({
        email: createForm.email.trim(),
        full_name: createForm.full_name.trim(),
        role: createForm.role,
        institution_id: institutionId,
      });
      setCreateOpen(false);
      setCreatedCredentials({
        email: result.user.email,
        full_name: result.user.full_name,
        temp_password: result.temp_password,
      });
      setCreateForm({ email: '', full_name: '', role: 'student', institution_id: '' });
      setNotice('User created. Deliver the one-time password securely.');
      await load();
    } catch (e) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Could not create the user.');
    } finally {
      setCreating(false);
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
  const statusPill = (s: string) => {
    const meta: Record<string, { label: string; bg: string; fg: string }> = {
      active: { label: 'Active', bg: '#dcfce7', fg: '#15803d' },
      inactive: { label: 'Inactive', bg: '#f1f5f9', fg: '#475569' },
      suspended: { label: 'Suspended', bg: '#fee2e2', fg: '#b91c1c' },
      pending_deletion: { label: 'Pending deletion', bg: '#fef3c7', fg: '#b45309' },
    };
    const item = meta[s] ?? { label: s.replace(/_/g, ' '), bg: '#f1f5f9', fg: '#475569' };
    return <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', background: item.bg, color: item.fg }}>● {item.label}</span>;
  };

  return (
    <AdminShell activePage="User Management">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, fontFamily: 'var(--font-display)' }}>User Management</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b', fontWeight: 600 }}>
            Every account on the platform — institutions and direct users. {total.toLocaleString()} total.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={styles.btnPrimary} onClick={() => { setError(null); setCreateOpen(true); }}>
            <Plus size={14} /> Add user
          </button>
          <button className={styles.btnSecondary} onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
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
                      {u.role === 'platform_admin' ? (
                        <span title="Platform admin account actions are restricted" style={{ fontSize: 11, color: '#64748b' }}>Restricted</span>
                      ) : (
                        <>
                          {u.status === 'suspended' || u.status === 'inactive' ? (
                            <button title="Reactivate" aria-label={`Reactivate ${u.full_name}`} onClick={() => runAction(() => adminUsersService.activateUser(u.id).then(() => {}), `${u.full_name} reactivated.`)} style={actBtn('#dcfce7', '#15803d')}>
                              <ShieldCheck size={13} />
                            </button>
                          ) : u.status === 'active' ? (
                            <button title="Suspend" aria-label={`Suspend ${u.full_name}`} onClick={() => { setSuspendReason(''); setSuspendUntil(''); setModal({ kind: 'suspend', user: u }); }} style={actBtn('#fee2e2', '#b91c1c')}>
                              <ShieldOff size={13} />
                            </button>
                          ) : null}
                          <button title="Reset password" aria-label={`Reset password for ${u.full_name}`} onClick={() => setModal({ kind: 'reset', user: u })} style={actBtn('#fef3c7', '#b45309')}>
                            <KeyRound size={13} />
                          </button>
                          <button title="Force logout" aria-label={`Force logout ${u.full_name}`} onClick={() => setModal({ kind: 'force-logout', user: u })} style={actBtn('#e0e7ff', '#4338ca')}>
                            <LogOut size={13} />
                          </button>
                        </>
                      )}
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
                    }, 'Temporary password issued; deliver it securely.', false)}
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

      {createOpen && (
        <div role="presentation" onClick={(e) => { if (e.target === e.currentTarget && !creating) setCreateOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(15,10,30,.48)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <section role="dialog" aria-modal="true" aria-labelledby="create-user-title" style={{ width: 'min(520px, 100%)', background: '#fff', borderRadius: 18, padding: 24, boxShadow: '0 24px 80px rgba(0,0,0,.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12, marginBottom: 18 }}>
              <div>
                <h2 id="create-user-title" style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Add user</h2>
                <p style={{ margin: '5px 0 0', fontSize: 13, color: '#64748b' }}>A unique temporary password will be generated and shown once.</p>
              </div>
              <button type="button" aria-label="Close" disabled={creating} onClick={() => setCreateOpen(false)} style={{ border: 0, background: 'transparent', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); void createUser(); }}>
              <label style={labelStyle} htmlFor="new-user-name">Full name</label>
              <input id="new-user-name" required value={createForm.full_name} onChange={(e) => setCreateForm((f) => ({ ...f, full_name: e.target.value }))} style={inputStyle} autoComplete="name" />
              <label style={{ ...labelStyle, marginTop: 12 }} htmlFor="new-user-email">Email</label>
              <input id="new-user-email" required type="email" value={createForm.email} onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))} style={inputStyle} autoComplete="email" />
              <label style={{ ...labelStyle, marginTop: 12 }} htmlFor="new-user-role">Role</label>
              <select id="new-user-role" value={createForm.role} onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value, institution_id: e.target.value === 'platform_user' ? '' : f.institution_id }))} style={{ ...inputStyle, background: '#fff' }}>
                <option value="student">Student</option>
                <option value="instructor">Instructor</option>
                <option value="institution_admin">Institution admin</option>
                <option value="platform_user">Direct platform user</option>
              </select>
              {createForm.role !== 'platform_user' && (
                <>
                  <label style={{ ...labelStyle, marginTop: 12 }} htmlFor="new-user-institution">Institution</label>
                  <select id="new-user-institution" required value={createForm.institution_id} onChange={(e) => setCreateForm((f) => ({ ...f, institution_id: e.target.value }))} style={{ ...inputStyle, background: '#fff' }}>
                    <option value="">Select an active institution</option>
                    {institutions.filter((i) => i.is_active).map((i) => <option key={i.id} value={i.id}>{i.name} ({i.code})</option>)}
                  </select>
                </>
              )}
              {error && <p role="alert" style={{ margin: '12px 0 0', color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>{error}</p>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                <button type="button" className={styles.btnSecondary} disabled={creating} onClick={() => setCreateOpen(false)}>Cancel</button>
                <button type="submit" className={styles.btnPrimary} disabled={creating || !createForm.full_name.trim() || !createForm.email.trim() || (createForm.role !== 'platform_user' && !createForm.institution_id)}>
                  {creating ? <><Loader2 size={14} className="spin" /> Creating…</> : <><Plus size={14} /> Create account</>}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {createdCredentials && (
        <div role="presentation" onClick={(e) => { if (e.target === e.currentTarget) setCreatedCredentials(null); }} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(15,10,30,.55)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <section role="dialog" aria-modal="true" aria-labelledby="created-user-title" style={{ width: 'min(500px, 100%)', background: '#fff', borderRadius: 18, padding: 24, boxShadow: '0 24px 80px rgba(0,0,0,.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
              <div>
                <h2 id="created-user-title" style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>User created</h2>
                <p style={{ margin: '5px 0 16px', color: '#64748b', fontSize: 13 }}>Share these credentials securely with {createdCredentials.full_name}. They must change the password at first login.</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setCreatedCredentials(null)} style={{ border: 0, background: 'transparent', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'grid', gap: 10, padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12 }}>
              <div><span style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>EMAIL</span><div style={{ fontWeight: 700 }}>{createdCredentials.email}</div></div>
              <div><span style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>ONE-TIME PASSWORD</span><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><code style={{ flex: 1, overflowWrap: 'anywhere', fontSize: 14 }}>{createdCredentials.temp_password}</code><button type="button" aria-label="Copy credentials" onClick={async () => { try { await navigator.clipboard.writeText(`Email: ${createdCredentials.email}\nTemporary password: ${createdCredentials.temp_password}`); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { setError('Clipboard access was denied. Select and copy the credentials manually.'); } }} style={{ border: 0, background: '#ede9fe', color: '#6d28d9', borderRadius: 8, padding: 8, cursor: 'pointer' }}>{copied ? <Check size={15} /> : <Copy size={15} />}</button></div></div>
            </div>
            <button type="button" className={styles.btnPrimary} onClick={() => setCreatedCredentials(null)} style={{ marginTop: 18 }}>Done</button>
          </section>
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
