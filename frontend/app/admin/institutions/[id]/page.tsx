'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminShell from '@/components/layout/AdminShell';
import {
  ArrowLeft, Loader2, RefreshCw, Building2, Users as UsersIcon, Zap, FlaskConical,
  Activity, Trophy, ShieldOff, ShieldCheck, KeyRound, Search, ChevronLeft, ChevronRight, Copy, Check, X,
} from 'lucide-react';
import {
  adminService, adminTenantService,
  type TenantAnalytics, type AdminDirectoryUser,
} from '@/services/admin.service';
import styles from '../../users/page.module.css';

type Tab = 'overview' | 'users' | 'usage' | 'billing' | 'onboarding' | 'danger';
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'users', label: 'Users' },
  { key: 'usage', label: 'Usage' },
  { key: 'billing', label: 'Billing' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'danger', label: 'Danger' },
];

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export default function InstitutionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [detail, setDetail] = useState<{ institution: Record<string, unknown> & { name?: string; plan?: string; is_active?: boolean }; stats: Record<string, number> } | null>(null);
  const [analytics, setAnalytics] = useState<TenantAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');

  // users tab state
  const [uq, setUq] = useState('');
  const [uRole, setURole] = useState('');
  const [uPage, setUPage] = useState(1);
  const [uPages, setUPages] = useState(1);
  const [uTotal, setUTotal] = useState(0);
  const [users, setUsers] = useState<AdminDirectoryUser[]>([]);
  const [uLoading, setULoading] = useState(false);

  // billing + onboarding
  const [billing, setBilling] = useState<Record<string, unknown> | null>(null);
  const [onboarding, setOnboarding] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tempCredentials, setTempCredentials] = useState<{ email: string; password: string } | null>(null);
  const [copiedCredentials, setCopiedCredentials] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, a] = await Promise.all([
        adminService.getInstitution(id).catch(() => null),
        adminTenantService.getInstitutionAnalytics(id, 30).catch(() => null),
      ]);
      if (!d && !a) throw new Error('load failed');
      setDetail(d as typeof detail);
      setAnalytics(a);
    } catch {
      setError('Could not load this institution.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (tab !== 'users') return;
    const t = setTimeout(async () => {
      setULoading(true);
      try {
        const res = await adminTenantService.getInstitutionUsers(id, {
          q: uq || undefined, role: uRole || undefined, page: uPage, per_page: 15,
        });
        setUsers(res.users || []);
        setUTotal(res.total || 0);
        setUPages(res.pages || 1);
      } catch { setUsers([]); }
      finally { setULoading(false); }
    }, uq ? 350 : 0);
    return () => clearTimeout(t);
  }, [tab, uq, uRole, uPage, id]);

  useEffect(() => {
    if (tab === 'billing' && !billing) adminService.getBilling(id).then(setBilling).catch(() => setBilling(null));
    if (tab === 'onboarding' && !onboarding) adminService.getOnboardingChecklist(id).then((r: unknown) => setOnboarding(r as Record<string, unknown>)).catch(() => setOnboarding(null));
  }, [tab, billing, onboarding, id]);

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await fn(); setNotice(done); await load(); }
    catch (e) { setNotice((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Action failed.'); }
    finally { setBusy(false); }
  };

  const resetInstitutionAdminPassword = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await adminService.resetAdminPassword(id);
      setTempCredentials({ email: result.email, password: result.temp_password });
      await load();
    } catch (e) {
      setNotice((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Could not reset the admin password.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <AdminShell activePage="Institutions">
        <div style={{ padding: '4rem', textAlign: 'center', color: '#64748b', fontWeight: 600, display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
          <Loader2 size={16} className="spin" /> Loading institution…
        </div>
      </AdminShell>
    );
  }
  if (error || !detail) {
    return (
      <AdminShell activePage="Institutions">
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <p style={{ color: '#b91c1c', fontWeight: 700 }}>{error}</p>
          <button className={styles.btnSecondary} style={{ margin: '12px auto 0' }} onClick={load}><RefreshCw size={14} /> Retry</button>
        </div>
      </AdminShell>
    );
  }

  const inst = detail.institution as { id: string; name: string; plan: string; is_active: boolean; code?: string; created_at?: string };
  const stats = detail.stats || {};
  const people = analytics?.people;
  const Trend = ({ data, color }: { data: { date: string; count: number }[] | undefined; color: string }) => {
    if (!data || data.length === 0) return <span style={{ color: '#9891a6', fontSize: 12.5 }}>No data in window</span>;
    const max = Math.max(...data.map((d) => d.count), 1);
    return (
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 48 }}>
        {data.map((d) => (
          <div key={d.date} title={`${fmtDay(d.date)}: ${d.count}`} style={{
            flex: 1, minWidth: 3, height: `${Math.max(4, (d.count / max) * 100)}%`,
            background: d.count ? color : 'rgba(124,58,237,.12)', borderRadius: 2,
          }} />
        ))}
      </div>
    );
  };

  return (
    <AdminShell activePage="Institutions">
      <button className={styles.btnSecondary} style={{ marginBottom: 16 }} onClick={() => router.push('/admin/institutions')}>
        <ArrowLeft size={14} /> All institutions
      </button>

      {notice && (
        <div style={{ margin: '0 0 14px', padding: '12px 16px', borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', fontSize: 13, fontWeight: 600 }}>{notice}</div>
      )}

      {/* header */}
      <div style={{ background: 'rgba(255,255,255,.5)', border: '1px solid rgba(255,255,255,.7)', borderRadius: 20, padding: 24, marginBottom: 18, boxShadow: '0 10px 30px rgba(20,20,30,.06)' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg,#2563eb,#7c3aed)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building2 size={24} />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-display)' }}>{inst.name}</h1>
              <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#ede9fe', color: '#6d28d9' }}>{inst.plan || 'free'} plan</span>
              <span style={{
                padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                background: inst.is_active ? '#dcfce7' : '#fee2e2',
                color: inst.is_active ? '#15803d' : '#b91c1c',
              }}>● {inst.is_active ? 'active' : 'suspended'}</span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b', fontWeight: 600 }}>
              {inst.code || '—'} · joined {fmtDate(inst.created_at as string | undefined)}
            </p>
          </div>
          <button className={styles.btnSecondary} onClick={load}><RefreshCw size={14} /> Refresh</button>
        </div>
      </div>

      {/* tabs */}
      <div className={styles.tabs} style={{ marginBottom: 16 }}>
        {TABS.map((t) => (
          <button key={t.key} className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryIcon} style={{ background: '#e0e7ff', color: '#4338ca' }}><UsersIcon size={20} /></div>
            <div>
              <p className={styles.summaryLabel}>Users</p>
              <p className={styles.summaryValue}>{people?.total_users ?? stats.students + stats.instructors}</p>
              <p style={{ margin: 0, fontSize: 11.5, color: '#9891a6', fontWeight: 600 }}>
                {people ? Object.entries(people.role_counts).map(([r, n]) => `${n} ${r.replace(/_/g, ' ')}`).join(' · ') : `${stats.students} students · ${stats.instructors} instructors`}
              </p>
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryIcon} style={{ background: '#dcfce7', color: '#059669' }}><Activity size={20} /></div>
            <div>
              <p className={styles.summaryLabel}>Sessions</p>
              <p className={styles.summaryValue}>{analytics?.sessions.total ?? stats.sessions}</p>
              <p style={{ margin: 0, fontSize: 11.5, color: '#9891a6', fontWeight: 600 }}>{analytics?.sessions.live ?? stats.live} live now</p>
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryIcon} style={{ background: '#fef3c7', color: '#d97706' }}><Zap size={20} /></div>
            <div>
              <p className={styles.summaryLabel}>Active users (30d)</p>
              <p className={styles.summaryValue}>{people?.active_users_30d ?? '—'}</p>
              <p style={{ margin: 0, fontSize: 11.5, color: '#9891a6', fontWeight: 600 }}>{people?.suspended_users ?? 0} suspended</p>
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryIcon} style={{ background: '#fce7f3', color: '#be185d' }}><FlaskConical size={20} /></div>
            <div>
              <p className={styles.summaryLabel}>Executions (30d)</p>
              <p className={styles.summaryValue}>{analytics?.executions.runs_in_window ?? '—'}</p>
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryIcon} style={{ background: '#ede9fe', color: '#6d28d9' }}><Trophy size={20} /></div>
            <div>
              <p className={styles.summaryLabel}>Course solves (all time)</p>
              <p className={styles.summaryValue}>{analytics?.learning.course_solves_total ?? '—'}</p>
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryIcon} style={{ background: '#e0e7ff', color: '#4338ca' }}><Zap size={20} /></div>
            <div>
              <p className={styles.summaryLabel}>AI calls (30d)</p>
              <p className={styles.summaryValue}>{analytics?.ai.calls_in_window ?? '—'}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Users ── */}
      {tab === 'users' && (
        <>
          <div className={styles.toolBar}>
            <div className={styles.searchBox}>
              <Search size={15} color="#9891a6" />
              <input className={styles.searchInput} placeholder="Search members…" value={uq} onChange={(e) => { setUq(e.target.value); setUPage(1); }} />
            </div>
            <select value={uRole} onChange={(e) => { setURole(e.target.value); setUPage(1); }} style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.7)', background: 'rgba(255,255,255,.55)', fontWeight: 600, fontSize: 13, color: '#463f57' }}>
              <option value="">All roles</option>
              {['student', 'instructor', 'institution_admin'].map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div className={styles.tableWrap}>
            {uLoading ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: '#64748b', fontWeight: 600, display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
                <Loader2 size={16} className="spin" /> Loading members…
              </div>
            ) : users.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: '#9891a6', fontWeight: 600 }}>No members match.</div>
            ) : (
              <table className={styles.table}>
                <thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Last active</th><th /></tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/admin/users/${u.id}`)}>
                      <td>
                        <div style={{ fontWeight: 700, color: '#201b2e' }}>{u.full_name}</div>
                        <div style={{ fontSize: 12, color: '#9891a6', fontWeight: 600 }}>{u.email}</div>
                      </td>
                      <td>{u.role.replace(/_/g, ' ')}</td>
                      <td>
                        <span style={{ fontWeight: 700, fontSize: 12, color: u.status === 'suspended' ? '#b91c1c' : '#15803d' }}>● {u.status}</span>
                      </td>
                      <td>{u.last_login ? fmtDate(u.last_login) : 'never'}</td>
                      <td><ChevronRight size={14} color="#9891a6" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className={styles.tableFooter}>
              <span>Page {uPage} of {uPages} · {uTotal} members</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className={styles.btnSecondary} disabled={uPage <= 1} onClick={() => setUPage((p) => p - 1)} style={{ opacity: uPage <= 1 ? .45 : 1 }}><ChevronLeft size={14} /> Prev</button>
                <button className={styles.btnSecondary} disabled={uPage >= uPages} onClick={() => setUPage((p) => p + 1)} style={{ opacity: uPage >= uPages ? .45 : 1 }}>Next <ChevronRight size={14} /></button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Usage ── */}
      {tab === 'usage' && analytics && (
        <div style={{ display: 'grid', gap: 16 }}>
          {[
            { title: 'Lab sessions (30d)', data: analytics.sessions.trend, color: '#059669', total: analytics.sessions.total },
            { title: 'Code executions (30d)', data: analytics.executions.trend, color: '#db2777', total: analytics.executions.runs_in_window },
            { title: 'AI calls (30d)', data: analytics.ai.trend, color: '#d97706', total: analytics.ai.calls_in_window },
            { title: 'Practice solves (30d)', data: analytics.learning.solves_trend, color: '#7c3aed', total: analytics.learning.practice_solves_in_window },
          ].map((c) => (
            <div key={c.title} style={{ background: 'rgba(255,255,255,.5)', border: '1px solid rgba(255,255,255,.7)', borderRadius: 18, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800 }}>{c.title}</h3>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>{c.total.toLocaleString()} total</span>
              </div>
              <Trend data={c.data} color={c.color} />
            </div>
          ))}
        </div>
      )}

      {/* ── Billing ── */}
      {tab === 'billing' && (
        billing ? (
          <div style={{ background: 'rgba(255,255,255,.5)', border: '1px solid rgba(255,255,255,.7)', borderRadius: 18, padding: 24, maxWidth: 640 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 800 }}>Billing</h3>
            <div style={{ display: 'grid', gap: 10, fontSize: 13.5, fontWeight: 600, color: '#463f57' }}>
              {Object.entries(billing).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,.7)', paddingBottom: 8 }}>
                  <span style={{ color: '#9891a6' }}>{k.replace(/_/g, ' ')}</span>
                  <span>{typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: '#9891a6', fontWeight: 600 }}>No billing record for this institution.</div>
        )
      )}

      {/* ── Onboarding ── */}
      {tab === 'onboarding' && (
        onboarding ? (
          <div style={{ background: 'rgba(255,255,255,.5)', border: '1px solid rgba(255,255,255,.7)', borderRadius: 18, padding: 24, maxWidth: 640 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 800 }}>Onboarding checklist</h3>
            {Object.entries(onboarding).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,.7)', fontSize: 13.5, fontWeight: 600, color: '#463f57' }}>
                <span>{k.replace(/_/g, ' ')}</span>
                <span style={{ color: v ? '#15803d' : '#b45309' }}>{v ? '✓ done' : 'pending'}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: '#9891a6', fontWeight: 600 }}>Onboarding data unavailable.</div>
        )
      )}

      {/* ── Danger ── */}
      {tab === 'danger' && (
        <div style={{ background: 'rgba(255,255,255,.5)', border: '1px solid rgba(255,255,255,.7)', borderRadius: 18, padding: 24, maxWidth: 640 }}>
          <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 800, color: '#b91c1c' }}>Danger zone</h3>
          <p style={{ margin: '0 0 18px', fontSize: 13, color: '#64748b', fontWeight: 600 }}>
            Institution-level operations affect every member of this tenant.
          </p>
          <div style={{ display: 'grid', gap: 12 }}>
            {inst.is_active ? (
              <button className={styles.btnSecondary} disabled={busy} onClick={() => {
                const reason = window.prompt('Suspension reason:');
                if (reason) act(() => adminService.suspendInstitution(id, reason), 'Institution suspended — logins blocked.');
              }}>
                <ShieldOff size={14} /> Suspend institution (blocks all logins)
              </button>
            ) : (
              <button className={styles.btnSecondary} disabled={busy} onClick={() => act(() => adminService.activateInstitution(id), 'Institution reactivated.')}>
                <ShieldCheck size={14} /> Activate institution
              </button>
            )}
            <button className={styles.btnSecondary} disabled={busy} onClick={() => {
              if (window.confirm('Issue a new one-time password and sign the institution admin out of all sessions?')) {
                void resetInstitutionAdminPassword();
              }
            }}>
              <KeyRound size={14} /> Reset institution admin password
            </button>
          </div>
        </div>
      )}

      {tempCredentials && (
        <div role="presentation" onClick={(e) => { if (e.target === e.currentTarget) setTempCredentials(null); }} style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(15,10,30,.55)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <section role="dialog" aria-modal="true" aria-labelledby="temp-password-title" style={{ width: 'min(480px, 100%)', background: '#fff', borderRadius: 18, padding: 24, boxShadow: '0 24px 80px rgba(0,0,0,.25)' }}>
            <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <h2 id="temp-password-title" style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#201b2e' }}>Temporary password issued</h2>
                <p style={{ margin: '6px 0 18px', color: '#64748b', fontSize: 13 }}>Share this once with {tempCredentials.email}. They must change it at their next login.</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setTempCredentials(null)} style={{ border: 0, background: 'transparent', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
              <code style={{ flex: 1, overflowWrap: 'anywhere', fontSize: 14 }}>{tempCredentials.password}</code>
              <button type="button" onClick={async () => { await navigator.clipboard.writeText(`Email: ${tempCredentials.email}\nTemporary password: ${tempCredentials.password}`); setCopiedCredentials(true); window.setTimeout(() => setCopiedCredentials(false), 1800); }} aria-label="Copy temporary credentials" style={{ border: 0, background: '#ede9fe', color: '#6d28d9', borderRadius: 8, padding: 8, cursor: 'pointer' }}>
                {copiedCredentials ? <Check size={15} /> : <Copy size={15} />}
              </button>
            </div>
            <button type="button" className={styles.btnPrimary} onClick={() => setTempCredentials(null)} style={{ marginTop: 18 }}>Done</button>
          </section>
        </div>
      )}
    </AdminShell>
  );
}
