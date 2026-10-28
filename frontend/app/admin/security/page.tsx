'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/layout/AdminShell';
import { adminService, adminGovernanceService, type AuditLogEntry, type ImpersonationSessionRow, type ExportJobRow } from '@/services/admin.service';
import {
  Shield, Users, Key, ClipboardList, Eye,
  CheckCircle2, AlertTriangle, Loader2, ChevronLeft, ChevronRight,
  FileText, LayoutGrid, X, ShieldAlert
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

function actionLabel(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function severityKey(severity?: string | null): string {
  const sev = (severity || 'low').toLowerCase();
  return sev === 'high' ? styles.sevHigh : sev === 'medium' ? styles.sevMedium : styles.sevLow;
}

function getInitials(name?: string): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export default function SecurityPage() {
  const [tab, setTab] = useState<'roles' | 'audit' | 'governance' | 'auth'>('audit');

  // Audit log state
  const [days, setDays] = useState(7);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [actionFilter, setActionFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<AuditLogEntry | null>(null);
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
        const [logRes, summaryRes] = await Promise.all([
          adminService.getAuditLogs({ days, page, action: actionFilter || undefined }),
          adminService.getAuditLogSummary(30),
        ]);
        setTotal(logRes.total);
        setPages(logRes.pages);
        setLogs(logRes.logs ?? []);
        setSummary(summaryRes.summary ?? {});
      } catch {
        setError('Could not load audit logs.');
      } finally {
        setLoading(false);
      }
    })();
  }, [tab, days, page, actionFilter]);

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

  // ── Derived audit data ─────────────────────────────────────────────────
  const actionOptions = Object.keys(summary).sort((a, b) => summary[b] - summary[a]);
  const totalActions30d = Object.values(summary).reduce((sum, n) => sum + n, 0);
  const highSeverity = logs.filter(l => (l.severity || '').toLowerCase() === 'high').length;
  const uniqueModules = new Set(logs.map(l => l.module || 'System'));
  const activeActors = new Set(logs.map(l => l.actor_name)).size;

  const visibleLogs = logs.filter(l =>
    !severityFilter || (l.severity || 'low').toLowerCase() === severityFilter
  );

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
        <>
        <p role="note" style={{ padding: '10px 13px', margin: '0 0 14px', borderRadius: 10, background: '#f4f1ff', color: '#5b3cc4', fontSize: 12.5 }}>
          Reference only: this matrix describes the current role model. It does not edit permissions or authorize access changes.
        </p>
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
        </>
      )}

      {/* ── Audit Logs ────────────────────────────────────────────────── */}
      {tab === 'audit' && (
        <div className={styles.auditSection}>
          {/* KPI strip */}
          <div className={styles.auditKpiGrid}>
            <div className={styles.auditKpi}>
              <div className={styles.auditKpiIcon} style={{ background: '#f3e8ff', color: '#7c3aed' }}>
                <FileText size={20} strokeWidth={1.9} />
              </div>
              <div>
                <p className={styles.auditKpiValue}>{total.toLocaleString()}</p>
                <p className={styles.auditKpiLabel}>Events in last {days} days</p>
              </div>
            </div>
            <div className={styles.auditKpi}>
              <div className={styles.auditKpiIcon} style={{ background: '#ecfdf5', color: '#059669' }}>
                <LayoutGrid size={20} strokeWidth={1.9} />
              </div>
              <div>
                <p className={styles.auditKpiValue}>{actionOptions.length.toLocaleString()}</p>
                <p className={styles.auditKpiLabel}>Distinct actions (30d)</p>
              </div>
            </div>
            <div className={styles.auditKpi}>
              <div className={styles.auditKpiIcon} style={{ background: '#e0f2fe', color: '#0284c7' }}>
                <Users size={20} strokeWidth={1.9} />
              </div>
              <div>
                <p className={styles.auditKpiValue}>{activeActors}</p>
                <p className={styles.auditKpiLabel}>Actors on this page</p>
              </div>
            </div>
            <div className={styles.auditKpi}>
              <div className={styles.auditKpiIcon} style={{ background: '#fef2f2', color: '#dc2626' }}>
                <ShieldAlert size={20} strokeWidth={1.9} />
              </div>
              <div>
                <p className={styles.auditKpiValue}>{highSeverity}</p>
                <p className={styles.auditKpiLabel}>High severity on this page</p>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className={styles.auditToolbar}>
            <div className={styles.auditDayGroup}>
              {[7, 30, 90].map(d => (
                <button key={d} className={`${styles.tab} ${days === d ? styles.tabActive : ''}`} onClick={() => { setDays(d); setPage(1); }}>
                  Last {d} days
                </button>
              ))}
            </div>
            <select
              className={styles.auditSelect}
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value)}
            >
              <option value="">All actions</option>
              {actionOptions.map(a => (
                <option key={a} value={a}>{actionLabel(a)} ({summary[a]})</option>
              ))}
            </select>
            <select
              className={styles.auditSelect}
              value={severityFilter}
              onChange={e => setSeverityFilter(e.target.value)}
            >
              <option value="">All severities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <button
              className={styles.exportBtn}
              disabled={downloading === 'audit'}
              onClick={() => void saveDownload('audit', `nexlab_audit_${new Date().toISOString().slice(0, 10)}.csv`, () => adminGovernanceService.downloadAuditCsv(days))}
            >
              <ClipboardList size={14} strokeWidth={2} /> {downloading === 'audit' ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>

          {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}
          {actionFilter && (
            <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#5b3cc4', fontWeight: 700 }}>
              Filtered to <strong>{actionLabel(actionFilter)}</strong> — clear the filter to see the full window again ({totalActions30d.toLocaleString()} actions in the last 30 days).
            </p>
          )}

          <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Date &amp; Time</th><th>Action</th><th>Actor</th><th>Module</th><th>Severity</th><th>Detail</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24 }}>
                  <Loader2 size={18} strokeWidth={2} className="spin" color="#7c3aed" />
                </td></tr>
              ) : visibleLogs.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#9891a6', fontSize: 13 }}>
                  No audit entries match the selected filters.
                </td></tr>
              ) : visibleLogs.map(log => (
                <tr key={log.id} className={styles.auditRow} onClick={() => setSelectedEvent(log)}>
                  <td style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 12, color: '#9891a6', whiteSpace: 'nowrap' }}>
                    {formatDateTime(log.created_at)}
                  </td>
                  <td>
                    <span className={styles.auditAction}>
                      {ACTION_STYLE(log.action)} <code className={styles.code}>{log.action}</code>
                    </span>
                  </td>
                  <td>
                    <span className={styles.auditActor}>
                      <span className={styles.auditAvatar}>{getInitials(log.actor_name)}</span>
                      <span>
                        <span style={{ display: 'block' }}>{log.actor_name}</span>
                        <span style={{ display: 'block', fontSize: 11, color: '#9891a6', fontWeight: 500 }}>
                          {log.actor_email || (log.actor_role ? `${log.actor_role} · ` : '') + 'platform'}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td style={{ fontSize: 12.5, fontWeight: 600 }}>{log.module || 'System'}</td>
                  <td><span className={`${styles.sevPill} ${severityKey(log.severity)}`}>{log.severity || 'low'}</span></td>
                  <td style={{ fontSize: 13, color: '#64748b' }}>
                    {log.detail ?? (log.target_type ? `${log.target_type} · ${log.target_id?.slice(0, 8)}…` : '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

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

      {/* ── Event detail modal ────────────────────────────────────────── */}
      {selectedEvent && (
        <div className={styles.auditModalBackdrop} onClick={() => setSelectedEvent(null)}>
          <div className={styles.auditModal} onClick={e => e.stopPropagation()}>
            <div className={styles.auditModalHead}>
              <h3>Audit Event Details</h3>
              <button className={styles.auditModalClose} onClick={() => setSelectedEvent(null)} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className={styles.auditModalBody}>
              {([
                ['Event ID', <code key="id" className={styles.code} style={{ fontSize: 11.5 }}>{selectedEvent.id}</code>],
                ['Date & Time', formatDateTime(selectedEvent.created_at)],
                ['Actor', `${selectedEvent.actor_name || 'System'}${selectedEvent.actor_email ? ` (${selectedEvent.actor_email})` : ''}`],
                ['Action', <code key="a" className={styles.code}>{selectedEvent.action}</code>],
                ['Module', selectedEvent.module || 'System'],
                ['Severity', <span key="s" className={`${styles.sevPill} ${severityKey(selectedEvent.severity)}`}>{selectedEvent.severity || 'low'}</span>],
                ['Client IP', selectedEvent.ip_address ? <code key="ip" className={styles.code}>{selectedEvent.ip_address}</code> : '—'],
              ] as [string, React.ReactNode][]).map(([label, value]) => (
                <div key={label} className={styles.auditDetailRow}>
                  <span className={styles.auditDetailLabel}>{label}</span>
                  <span className={styles.auditDetailValue}>{value}</span>
                </div>
              ))}
              <div>
                <span className={styles.auditDetailLabel}>Full detail</span>
                <div className={styles.auditDetailBox}>
                  {selectedEvent.detail || 'No detail recorded.'}
                </div>
              </div>
              {selectedEvent.target_type && (
                <div className={styles.auditDetailRow} style={{ border: 'none', paddingBottom: 0 }}>
                  <span className={styles.auditDetailLabel}>Target</span>
                  <span className={styles.auditDetailValue}>
                    {selectedEvent.target_type} ({selectedEvent.target_id || 'N/A'})
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
