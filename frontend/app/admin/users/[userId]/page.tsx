'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';
import AdminShell from '@/components/layout/AdminShell';
import {
  ArrowLeft, Loader2, RefreshCw, Zap, Trophy, CheckCircle2, GraduationCap,
  ShieldCheck, ShieldOff, KeyRound, LogOut, Copy, Check, Eye, Download,
} from 'lucide-react';
import {
  adminUsersService, adminGovernanceService,
  type AdminUser360, type AdminUserProgress, type AdminUserGrades,
  type AdminUserAttempts, type AdminUserActivity,
} from '@/services/admin.service';
import styles from '../page.module.css';

type Tab = 'progress' | 'grades' | 'attempts' | 'activity';
const TABS: { key: Tab; label: string }[] = [
  { key: 'progress', label: 'Progress' },
  { key: 'grades', label: 'Grades & Certificates' },
  { key: 'attempts', label: 'Attempts' },
  { key: 'activity', label: 'Audit Trail' },
];

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export default function User360Page() {
  const { userId } = useParams<{ userId: string }>();
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [data, setData] = useState<AdminUser360 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('progress');
  const [tabData, setTabData] = useState<Record<string, unknown>>({});
  const [tabLoading, setTabLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await adminUsersService.getUser360(userId));
    } catch {
      setError('Could not load this user.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (tabData[tab]) return;
      setTabLoading(true);
      try {
        let res: unknown;
        if (tab === 'progress') res = await adminUsersService.getUserProgress(userId);
        else if (tab === 'grades') res = await adminUsersService.getUserGrades(userId);
        else if (tab === 'attempts') res = await adminUsersService.getUserAttempts(userId);
        else res = await adminUsersService.getUserActivity(userId);
        if (!cancelled) setTabData((prev) => ({ ...prev, [tab]: res }));
      } catch {
        if (!cancelled) setTabData((prev) => ({ ...prev, [tab]: { __error: true } }));
      } finally {
        if (!cancelled) setTabLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, tabData, userId]);

  const act = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await fn();
      setNotice(done);
      await load();
    } catch (e) {
      setNotice((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  const createUserExport = async () => {
    setBusy(true);
    try {
      const res = await adminGovernanceService.createExport(userId);
      setNotice(`Export ready — expires ${new Date(res.job.expires_at).toLocaleString()}. Download it in Security → Governance.`);
    } catch (e) {
      setNotice((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Export generation failed.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <AdminShell activePage="User Management">
        <div style={{ padding: '4rem', textAlign: 'center', color: '#64748b', fontWeight: 600, display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
          <Loader2 size={16} className="spin" /> Loading user profile…
        </div>
      </AdminShell>
    );
  }
  if (error || !data) {
    return (
      <AdminShell activePage="User Management">
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <p style={{ color: '#b91c1c', fontWeight: 700 }}>{error}</p>
          <button className={styles.btnSecondary} style={{ margin: '12px auto 0' }} onClick={load}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      </AdminShell>
    );
  }

  const u = data.user;
  const s = data.stats;
  const progress = tabData.progress as AdminUserProgress | undefined;
  const grades = tabData.grades as AdminUserGrades | undefined;
  const attempts = tabData.attempts as AdminUserAttempts | undefined;
  const activity = tabData.activity as AdminUserActivity | undefined;
  const initials = (u.full_name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <AdminShell activePage="User Management">
      <button className={styles.btnSecondary} style={{ marginBottom: 16 }} onClick={() => router.push('/admin/users')}>
        <ArrowLeft size={14} /> All users
      </button>

      {notice && (
        <div style={{ margin: '0 0 14px', padding: '12px 16px', borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', fontSize: 13, fontWeight: 600 }}>
          {notice}
        </div>
      )}

      {/* header card */}
      <div style={{ background: 'rgba(255,255,255,.5)', border: '1px solid rgba(255,255,255,.7)', borderRadius: 20, padding: 24, marginBottom: 18, boxShadow: '0 10px 30px rgba(20,20,30,.06)' }}>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ width: 62, height: 62, borderRadius: 18, background: 'linear-gradient(135deg,#7c3aed,#db2777)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800 }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-display)' }}>{u.full_name}</h1>
              <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#ede9fe', color: '#6d28d9' }}>{u.role.replace(/_/g, ' ')}</span>
              <span style={{
                padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                background: u.status === 'suspended' ? '#fee2e2' : '#dcfce7',
                color: u.status === 'suspended' ? '#b91c1c' : '#15803d',
              }}>
                ● {u.status}
              </span>
            </div>
            <p style={{ margin: '4px 0 8px', fontSize: 13.5, color: '#64748b', fontWeight: 600 }}>{u.email}</p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12.5, color: '#615a72', fontWeight: 600 }}>
              <span>{u.account_type === 'direct' ? '◆ Direct user' : `🏛 ${u.institution_name || 'Institution'}`}</span>
              <span>Joined {fmtDate(u.created_at)}</span>
              <span>Last login {fmtDate(u.last_login)}</span>
              {u.must_change_password && <span style={{ color: '#b45309' }}>⚠ password change pending</span>}
            </div>
            {u.status === 'suspended' && (
              <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 12.5, color: '#b91c1c', fontWeight: 600 }}>
                Suspended — {u.suspension_reason}
                {u.suspended_until ? ` · lifts ${fmtDate(u.suspended_until)}` : ' · indefinite'}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {u.status === 'suspended' ? (
              <button className={styles.btnSecondary} disabled={busy} onClick={() => act(() => adminUsersService.activateUser(u.id).then(() => {}), 'User reactivated.')}>
                <ShieldCheck size={14} /> Activate
              </button>
            ) : (
              <button className={styles.btnSecondary} disabled={busy || u.role === 'platform_admin'} title={u.role === 'platform_admin' ? 'Two-admin rule — not available here' : ''} onClick={() => {
                const reason = window.prompt('Suspension reason (stored in the audit log):');
                if (reason && reason.trim()) act(() => adminUsersService.suspendUser(u.id, reason.trim()).then(() => {}), 'User suspended.');
              }}>
                <ShieldOff size={14} /> Suspend
              </button>
            )}
            <button className={styles.btnSecondary} disabled={busy || u.role === 'platform_admin'} onClick={() => {
              if (window.confirm(`Issue a temp password for ${u.full_name}? Their old password and sessions stop working.`)) {
                adminUsersService.resetUserPassword(u.id)
                  .then((r) => setTemp(r.temp_password))
                  .catch((e) => setNotice((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Reset failed.'));
              }
            }}>
              <KeyRound size={14} /> Reset password
            </button>
            <button className={styles.btnSecondary} disabled={busy} onClick={() => {
              if (window.confirm(`End all live sessions for ${u.full_name}?`)) act(() => adminUsersService.forceLogoutUser(u.id).then(() => {}), 'All sessions ended.');
            }}>
              <LogOut size={14} /> Force logout
            </button>
            <button
              className={styles.btnSecondary}
              disabled={busy || u.role === 'platform_admin'}
              title={u.role === 'platform_admin' ? 'Platform admins cannot be impersonated' : 'Open a read-only session as this user (30 min, audited)'}
              onClick={async () => {
                const reason = window.prompt('Impersonation reason (stored in the audit log):');
                if (!reason || !reason.trim()) return;
                try {
                  const res = await adminGovernanceService.impersonate(u.id, reason.trim());
                  // stash the admin token, install the read-only impersonation token
                  localStorage.setItem('imp_admin_backup',
                    localStorage.getItem('access_token') || '');
                  localStorage.setItem('access_token', res.token);
                  document.cookie = `access_token=${res.token}; path=/`;
                  const { authService } = await import('@/services/auth.service');
                  const me = await authService.getMe();
                  setUser(me as never);
                  const home = u.role === 'platform_user' ? '/practice/dashboard'
                    : u.role === 'student' ? '/student/dashboard'
                    : u.role === 'instructor' ? '/instructor/dashboard'
                    : '/institution/dashboard';
                  router.push(home);
                } catch (e) {
                  setNotice((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Impersonation failed.');
                }
              }}
            >
              <Eye size={14} /> View as user
            </button>
            <button
              className={styles.btnSecondary}
              disabled={busy}
              title="Generate a GDPR/portability JSON bundle (7-day expiry)"
              onClick={() => void createUserExport()}
            >
              <Download size={14} /> Export data
            </button>
          </div>
        </div>

        {temp && (
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, background: '#fffbeb', border: '1px dashed #f59e0b' }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#92400e' }}>Temp password (shown once):</span>
            <code style={{ fontSize: 15, fontWeight: 800, color: '#7c3aed', letterSpacing: .5 }}>{temp}</code>
            <button onClick={() => { navigator.clipboard.writeText(temp); setCopied(true); setTimeout(() => setCopied(false), 1500); }} style={{ marginLeft: 'auto', border: 'none', background: '#ede9fe', color: '#6d28d9', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
        )}

        {/* quick stats */}
        <div className={styles.summaryGrid} style={{ marginTop: 20 }}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryIcon} style={{ background: '#fef3c7', color: '#d97706' }}><Zap size={20} /></div>
            <div><p className={styles.summaryLabel}>Total XP</p><p className={styles.summaryValue}>{(s.total_xp || 0).toLocaleString()}</p></div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryIcon} style={{ background: '#dcfce7', color: '#059669' }}><CheckCircle2 size={20} /></div>
            <div><p className={styles.summaryLabel}>Solves (course + practice)</p><p className={styles.summaryValue}>{s.course_solves + s.practice_accepted}</p></div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryIcon} style={{ background: '#ede9fe', color: '#6d28d9' }}><GraduationCap size={20} /></div>
            <div><p className={styles.summaryLabel}>Grades · Exams</p><p className={styles.summaryValue}>{s.grades} · {s.exam_attempts}</p></div>
          </div>
        </div>
      </div>

      {/* tabs */}
      <div className={styles.tabs} style={{ marginBottom: 16 }}>
        {TABS.map((t) => (
          <button key={t.key} className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tabLoading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b', fontWeight: 600, display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
          <Loader2 size={16} className="spin" /> Loading…
        </div>
      ) : (
        <>
          {/* ── Progress ── */}
          {tab === 'progress' && (progress ? (
            <div style={{ display: 'grid', gap: 16 }}>
              <div className={styles.summaryGrid} style={{ marginBottom: 0 }}>
                <div className={styles.summaryCard}>
                  <div className={styles.summaryIcon} style={{ background: '#fef3c7', color: '#d97706' }}><Trophy size={20} /></div>
                  <div>
                    <p className={styles.summaryLabel}>Level</p>
                    <p className={styles.summaryValue} style={{ fontSize: 20 }}>{progress.xp ? `${progress.xp.level} · ${progress.xp.level_name}` : '—'}</p>
                  </div>
                </div>
                <div className={styles.summaryCard}>
                  <div className={styles.summaryIcon} style={{ background: '#e0e7ff', color: '#4338ca' }}><Zap size={20} /></div>
                  <div>
                    <p className={styles.summaryLabel}>Rating</p>
                    <p className={styles.summaryValue} style={{ fontSize: 20 }}>{progress.rating?.rating != null ? Math.round(progress.rating.rating) : '—'}</p>
                  </div>
                </div>
                <div className={styles.summaryCard}>
                  <div className={styles.summaryIcon} style={{ background: '#fce7f3', color: '#be185d' }}><CheckCircle2 size={20} /></div>
                  <div>
                    <p className={styles.summaryLabel}>Practice accepted</p>
                    <p className={styles.summaryValue} style={{ fontSize: 20 }}>{s.practice_accepted} / {s.practice_submissions}</p>
                  </div>
                </div>
              </div>

              {progress.topic_strength.length > 0 && (
                <div style={{ background: 'rgba(255,255,255,.5)', border: '1px solid rgba(255,255,255,.7)', borderRadius: 18, padding: 20 }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 800 }}>Topic strength</h3>
                  {progress.topic_strength.slice(0, 8).map((t) => (
                    <div key={t.topic} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                      <span style={{ width: 160, fontSize: 12.5, fontWeight: 700, color: '#463f57', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.topic}</span>
                      <div style={{ flex: 1, height: 8, borderRadius: 99, background: 'rgba(124,58,237,.12)', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, t.strength)}%`, height: '100%', background: 'linear-gradient(90deg,#7c3aed,#a855f7)' }} />
                      </div>
                      <span style={{ width: 70, fontSize: 12, fontWeight: 700, color: '#64748b', textAlign: 'right' }}>{t.total_solved} solved</span>
                    </div>
                  ))}
                </div>
              )}

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Course</th><th>Completion</th><th>XP earned</th><th>Certificate</th></tr></thead>
                  <tbody>
                    {progress.courses.courses.length === 0 && (
                      <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9891a6' }}>No course activity yet.</td></tr>
                    )}
                    {progress.courses.courses.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 700, color: '#201b2e' }}>{c.title}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 110, height: 7, borderRadius: 99, background: 'rgba(124,58,237,.12)', overflow: 'hidden' }}>
                              <div style={{ width: `${c.completion_pct}%`, height: '100%', background: '#7c3aed' }} />
                            </div>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#463f57' }}>{c.completion_pct}%</span>
                          </div>
                        </td>
                        <td>{c.xp_earned}</td>
                        <td>{c.cert_eligible ? <span style={{ color: '#15803d', fontWeight: 700 }}>✓ eligible</span> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : <EmptyRetry onRetry={() => setTabData((p) => ({ ...p, progress: undefined }))} />)}

          {/* ── Grades ── */}
          {tab === 'grades' && (grades ? (
            <div style={{ display: 'grid', gap: 16 }}>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Source</th><th>Kind</th><th>Final grade</th><th>Graded at</th></tr></thead>
                  <tbody>
                    {grades.grades.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9891a6' }}>No graded work yet.</td></tr>}
                    {grades.grades.map((g) => (
                      <tr key={g.id}>
                        <td style={{ fontWeight: 700, color: '#201b2e' }}>{g.source_title || '—'}</td>
                        <td>{g.source_kind || '—'}</td>
                        <td><strong>{g.final_grade != null ? `${g.final_grade}%` : '—'}</strong></td>
                        <td>{fmtDate(g.graded_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Exam</th><th>Status</th><th>Score</th><th>Submitted</th></tr></thead>
                  <tbody>
                    {grades.exam_attempts.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9891a6' }}>No exam attempts.</td></tr>}
                    {grades.exam_attempts.map((a) => (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 700, color: '#201b2e' }}>{a.exam_id.slice(0, 8)}…</td>
                        <td>{a.status}</td>
                        <td><strong>{a.score != null ? `${a.score}%` : '—'}</strong></td>
                        <td>{fmtDate(a.submitted_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {grades.certificates.length > 0 && (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead><tr><th>Certificate</th><th>ID</th></tr></thead>
                    <tbody>
                      {grades.certificates.map((c) => (
                        <tr key={c.course_id}>
                          <td style={{ fontWeight: 700, color: '#201b2e' }}>{c.course_title || c.course_id}</td>
                          <td><code style={{ fontSize: 11.5, color: '#7c3aed' }}>{c.certificate_id || '—'}</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : <EmptyRetry onRetry={() => setTabData((p) => ({ ...p, grades: undefined }))} />)}

          {/* ── Attempts ── */}
          {tab === 'attempts' && (attempts ? (
            <div style={{ display: 'grid', gap: 16 }}>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Practice submission</th><th>Status</th><th>Cases</th><th>XP</th><th>When</th></tr></thead>
                  <tbody>
                    {attempts.practice_submissions.items.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9891a6' }}>No practice submissions.</td></tr>}
                    {attempts.practice_submissions.items.map((a) => (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 700, color: '#201b2e' }}>{a.problem_title || 'Problem'} <span style={{ color: '#9891a6', fontWeight: 600 }}>({a.language})</span></td>
                        <td>
                          <span style={{ fontWeight: 700, color: a.status === 'Accepted' ? '#15803d' : a.status === 'Wrong Answer' ? '#b45309' : '#b91c1c' }}>{a.status}</span>
                        </td>
                        <td>{a.passed ?? '—'}/{a.total_cases ?? '—'}</td>
                        <td>{a.xp_earned || 0}</td>
                        <td>{fmtDate(a.submitted_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Lab attempt</th><th>Verdict</th><th>Time</th><th>When</th></tr></thead>
                  <tbody>
                    {attempts.lab_attempts.items.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9891a6' }}>No lab code attempts.</td></tr>}
                    {attempts.lab_attempts.items.map((a) => (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 700, color: '#201b2e' }}>{a.experiment_title || 'Experiment'}</td>
                        <td>{a.compile_status || '—'}</td>
                        <td>{a.execution_time_ms != null ? `${a.execution_time_ms} ms` : '—'}</td>
                        <td>{fmtDate(a.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : <EmptyRetry onRetry={() => setTabData((p) => ({ ...p, attempts: undefined }))} />)}

          {/* ── Activity ── */}
          {tab === 'activity' && (activity ? (
            <div style={{ display: 'grid', gap: 16 }}>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Administrative actions about this user</th><th>Severity</th><th>When</th></tr></thead>
                  <tbody>
                    {activity.about_user.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: '#9891a6' }}>No administrative actions recorded.</td></tr>}
                    {activity.about_user.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <strong style={{ color: '#201b2e' }}>{a.action}</strong>
                          {a.detail && <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{a.detail}</div>}
                        </td>
                        <td><span style={{ fontWeight: 700, color: a.severity === 'high' ? '#b91c1c' : a.severity === 'medium' ? '#b45309' : '#64748b' }}>{a.severity}</span></td>
                        <td>{fmtDate(a.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Actions by this user</th><th>Severity</th><th>When</th></tr></thead>
                  <tbody>
                    {activity.by_user.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: '#9891a6' }}>No audited activity by this user.</td></tr>}
                    {activity.by_user.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <strong style={{ color: '#201b2e' }}>{a.action}</strong>
                          {a.detail && <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{a.detail}</div>}
                        </td>
                        <td><span style={{ fontWeight: 700, color: a.severity === 'high' ? '#b91c1c' : a.severity === 'medium' ? '#b45309' : '#64748b' }}>{a.severity}</span></td>
                        <td>{fmtDate(a.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : <EmptyRetry onRetry={() => setTabData((p) => ({ ...p, activity: undefined }))} />)}
        </>
      )}
    </AdminShell>
  );
}

function EmptyRetry({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={{ padding: '2.5rem', textAlign: 'center' }}>
      <p style={{ color: '#b91c1c', fontWeight: 700, margin: '0 0 12px' }}>This section failed to load.</p>
      <button className={styles.btnSecondary} style={{ margin: '0 auto' }} onClick={onRetry}>
        <RefreshCw size={14} /> Retry
      </button>
    </div>
  );
}
