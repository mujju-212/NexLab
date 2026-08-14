'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/layout/AdminShell';
import { adminService, type AuditLogEntry } from '@/services/admin.service';
import {
  Shield, Users, Key, ClipboardList,
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
  { key: 'Auth Mechanism',     value: 'JWT (httpOnly cookie: access_token)' },
  { key: 'Token Transport',    value: 'Cookie + Bearer header fallback' },
  { key: 'Password Hashing',   value: 'werkzeug PBKDF2-SHA256' },
  { key: 'Role Enforcement',   value: '@require_role decorator per route' },
  { key: 'Session Invalidation', value: 'force_logout flag (per-user)' },
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
  const [tab, setTab] = useState<'roles' | 'audit' | 'auth'>('audit');

  // Audit log state
  const [days, setDays] = useState(7);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <AdminShell activePage="Security" title="Security & Access Control" subtitle="Role matrix, platform-wide audit trail and authentication details">

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <div className={styles.tabs}>
        {[
          { id: 'roles', label: 'Role Matrix', Icon: Users },
          { id: 'audit', label: 'Audit Logs', Icon: ClipboardList },
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
