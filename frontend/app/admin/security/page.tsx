'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/layout/AdminShell';
import { adminService, adminGovernanceService, type AuditLogEntry, type ImpersonationSessionRow, type ExportJobRow } from '@/services/admin.service';
import {
  Shield, Users, Key, ClipboardList, Eye,
  CheckCircle2, AlertTriangle, Loader2, ChevronLeft, ChevronRight
} from 'lucide-react';
import styles from './page.module.css';

const ROLES = [
  { role: 'Platform Admin',     users: 'Global', perms: ['Institution CRUD', 'Billing & Plans', 'Global Audit Logs', 'Platform Config'], color: '#7c3aed' },
  { role: 'Institution Admin',  users: 'Per institution', perms: ['User Management', 'Academic Setup', 'Announcements', 'Institution Analytics'], color: '#ec4899' },
  { role: 'Instructor',         users: 'Per section', perms: ['Create Experiments', 'Schedule Sessions', 'Grade Submissions', 'Attendance'], color: '#f59e0b' },
  { role: 'Student',            users: 'Per section', perms: ['Join Lab Sessions', 'Submit Code', 'View Grades', 'Catch-Up Access'], color: '#22c55e' },
];

const AUTH_SETTINGS = [
  { key: 'Auth Mechanism', value: 'Signed JWT, validated by the backend' },
  { key: 'Token Transport', value: 'Authorization: Bearer header; client token storage is JavaScript-readable' },
  { key: 'Password Hashing', value: 'bcrypt' },
  { key: 'Role Enforcement', value: '@require_role decorator per protected route' },
  { key: 'Session Invalidation', value: 'Per-user force_logout plus account and institution status checks' },
];

const ACTION_STYLE = (action: string) => {
  if (action.includes('delete') || action.includes('deactivate') || action.includes('suspend'))
    return <AlertTriangle size={14} strokeWidth={2} color="#ef4444" />;
  if (action.includes('force_logout'))
    return <AlertTriangle size={14} strokeWidth={2} color="#f59e0b" />;
  if (action.includes('create') || action.includes('upload') || action.includes('enroll'))
    return <CheckCircle2 size={14} strokeWidth={2} color="#22c55e" />;
  return <ClipboardList size={14} strokeWidth={2} color="#d946ef" />;
};

export default function SecurityPage() {
  const [tab, setTab] = useState<'roles' | 'audit' | 'governance' | 'auth'>('audit');

  // Audit log state
  const [days, setDays] = useState(7);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [impSessions, setImpSessions] = useState<ImpersonationSessionRow[]>([]);
  const [exportJobs, setExportJobs] = useState<ExportJobRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== 'audit') return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await adminService.getAuditLogs({ days, page });
        setTotal(res.total);
        setPages(res.pages);
        setLogs(res.logs ?? []);
      } catch {
        setError('Could not load audit logs.');
      } finally {
        setLoading(false);
      }
    })();
  }, [tab, days, page]);

  useEffect(() => {
    if (tab !== 'governance') return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      adminGovernanceService.getImpersonationHistory(),
      adminGovernanceService.listExports(),
    ]).then(([sessions, exports]) => {
      if (cancelled) return;
      setImpSessions(sessions.sessions ?? []);
      setExportJobs(exports.jobs ?? []);
    }).catch(() => {
      if (!cancelled) setError('Could not load governance history and export jobs.');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [tab]);

  const saveDownload = async (key: string, filename: string, fetchBlob: () => Promise<Blob>) => {
    setDownloading(key);
    setError(null);
    try {
      const blob = await fetchBlob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      const response = (e as { response?: { data?: Blob } }).response?.data;
      let message = 'Download failed. Please retry.';
      if (response instanceof Blob) {
        try {
          const parsed = JSON.parse(await response.text()) as { error?: string };
          if (parsed.error) message = parsed.error;
        } catch { /* keep generic download error */ }
      }
      setError(message);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <AdminShell activePage="Security" title="Security & Access Control" subtitle="Role matrix, platform-wide audit trail and authentication details">

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <div className={styles.tabs}>
        {[
          { id: 'roles', label: 'Role Matrix', Icon: Users },
          { id: 'audit', label: 'Audit Logs', Icon: ClipboardList },
          { id: 'governance', label: 'Governance', Icon: Eye },
          { id: 'auth', label: 'Auth Details', Icon: Key },
        ].map(t => (
          <button
            key={t.id}
            className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
            onClick={() => setTab(t.id as typeof tab)}
          >
            <t.Icon size={14} strokeWidth={2} /> {t.label}
          </button>
        ))}
      </div>

      {/* ── Roles ─────────────────────────────────────────────────────── */}
      {tab === 'roles' && (
        <div className={styles.roleGrid}>
          {ROLES.map(r => (
            <div key={r.role} className={styles.roleCard}>
              <div className={styles.roleHeader}>
                <div className={styles.roleIcon} style={{ background: r.color + '22', color: r.color }}>
                  <Shield size={20} strokeWidth={1.9} />
                </div>
                <div>
                  <p className={styles.roleTitle}>{r.role}</p>
                  <p className={styles.roleCount}>{r.users}</p>
                </div>
              </div>
              <div className={styles.permsList}>
                {r.perms.map(p => (
                  <span key={p} className={styles.permTag}>
                    <CheckCircle2 size={11} strokeWidth={2} color={r.color} /> {p}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Audit Logs ────────────────────────────────────────────────── */}
      {tab === 'audit' && (
        <div className={styles.tableWrap}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            {[7, 30, 90].map(d => (
              <button key={d} className={`${styles.tab} ${days === d ? styles.tabActive : ''}`} onClick={() => { setDays(d); setPage(1); }}>
                Last {d} days
              </button>
            ))}
          </div>

          {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}

          <table className={styles.table}>
            <thead>
              <tr><th>Time (UTC)</th><th></th><th>Action</th><th>Actor</th><th>Detail</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>
                  <Loader2 size={18} strokeWidth={2} className="spin" color="#7c3aed" />
                </td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#9891a6', fontSize: 13 }}>
                  No audit entries in the selected window.
                </td></tr>
              ) : logs.map(log => (
                <tr key={log.id}>
                  <td style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 12, color: '#9891a6', whiteSpace: 'nowrap' }}>
                    {log.created_at ? new Date(log.created_at).toLocaleString() : '—'}
                  </td>
                  <td>{ACTION_STYLE(log.action)}</td>
                  <td><code className={styles.code}>{log.action}</code></td>
                  <td>{log.actor_name}</td>
                  <td style={{ fontSize: 13, color: '#64748b' }}>{log.detail ?? (log.target_type ? `${log.target_type} · ${log.target_id?.slice(0, 8)}…` : '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className={styles.tableFooter}>
            <span>Showing page {page} of {pages} — {total} total entries</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className={styles.exportBtn} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft size={14} strokeWidth={2} /> Prev
              </button>
              <button className={styles.exportBtn} disabled={page >= pages} onClick={() => setPage(p => p + 1)}>
                Next <ChevronRight size={14} strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ── Governance (Phase 4) ───────────────────────────────────────── */}
      {tab === 'governance' && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Impersonation history</h3>
          {error && <p role="alert" style={{ color: '#b91c1c', fontSize: 13 }}>{error}</p>}
          {loading && <p style={{ color: '#64748b', fontSize: 13 }}>Loading governance records…</p>}
          {!loading && impSessions.length === 0 && <p style={{ color: '#9891a6', fontSize: 13, fontWeight: 600 }}>No impersonation sessions recorded.</p>}
          {impSessions.map(s => (
            <div key={s.id} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,.7)', fontSize: 13 }}>
              <span style={{ fontWeight: 700, color: s.active ? '#b45309' : '#463f57', minWidth: 90 }}>
                {s.active ? '● active' : 'ended'}
              </span>
              <span style={{ flex: 1 }}>{s.admin_name || 'admin'} → <strong>{s.target_name}</strong> ({s.target_email})</span>
              <span style={{ color: '#9891a6', fontSize: 12 }}>{s.reason}</span>
            </div>
          ))}

          <h3 className={styles.cardTitle} style={{ marginTop: 22 }}>Data export jobs</h3>
          {!loading && exportJobs.length === 0 && <p style={{ color: '#9891a6', fontSize: 13, fontWeight: 600 }}>No export jobs yet — generate one from a User 360 profile.</p>}
          {exportJobs.map(j => (
            <div key={j.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,.7)', fontSize: 13 }}>
              <span style={{ fontWeight: 700, color: j.status === 'ready' ? '#15803d' : '#b45309', minWidth: 70 }}>{j.status}</span>
              <span style={{ flex: 1 }}>GDPR bundle · expires {new Date(j.expires_at).toLocaleString()}</span>
              {j.status === 'ready' && (
                <button type="button" disabled={downloading === j.id} onClick={() => void saveDownload(j.id, `user-data-export-${j.id}.json`, () => adminGovernanceService.downloadExport(j.id))} style={{ border: 0, background: 'transparent', fontWeight: 700, color: '#6d28d9', cursor: 'pointer' }}>
                  {downloading === j.id ? 'Downloading…' : 'Download'}
                </button>
              )}
            </div>
          ))}

          <div style={{ marginTop: 22, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className={styles.btnSecondary} disabled={downloading === 'audit'} onClick={() => void saveDownload('audit', `nexlab_audit_${new Date().toISOString().slice(0, 10)}.csv`, () => adminGovernanceService.downloadAuditCsv(30))}>
              {downloading === 'audit' ? 'Exporting…' : 'Export audit log CSV (30 days)'}
            </button>
          </div>
        </div>
      )}

      {/* ── Auth Details ──────────────────────────────────────────────── */}
      {tab === 'auth' && (
        <div className={styles.authWrap}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Setting</th><th>Current Implementation</th></tr>
              </thead>
              <tbody>
                {AUTH_SETTINGS.map(s => (
                  <tr key={s.key}>
                    <td><strong style={{ color: '#201b2e' }}>{s.key}</strong></td>
                    <td><code className={styles.code}>{s.value}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
