'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminShell from '@/components/layout/AdminShell';
import { Search, Users, GraduationCap, ShieldCheck, Loader2 } from 'lucide-react';
import { adminService, Institution } from '@/services/admin.service';
import styles from './page.module.css';

interface PlatformUser {
  id: string;
  institution_id: string | null;
  email: string;
  full_name: string;
  role: string;
  roll_number: string | null;
  is_active: boolean;
  created_at: string | null;
}

const ROLE_OPTIONS = ['', 'student', 'instructor', 'institution_admin', 'platform_admin'];

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

export default function UserManagementPage() {
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [institutionId, setInstitutionId] = useState('');
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [count, setCount] = useState(0);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    adminService.listInstitutions()
      .then(setInstitutions)
      .catch(() => {/* institution filter is optional */});
  }, []);

  // Debounced search — runs whenever filters change (350ms after typing stops)
  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await adminService.searchUsers({
          q: q || undefined,
          role: role || undefined,
          institution_id: institutionId || undefined,
        });
        setUsers(res.users || []);
        setCount(res.count ?? 0);
        setHasSearched(true);
      } catch {
        setError('User search failed. Check your connection and permissions.');
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [q, role, institutionId]);

  const institutionById = useMemo(
    () => new Map(institutions.map((i) => [i.id, i])),
    [institutions]
  );

  const students = users.filter((u) => u.role === 'student').length;
  const instructors = users.filter((u) => u.role === 'instructor').length;
  const admins = users.filter((u) => u.role === 'institution_admin' || u.role === 'platform_admin').length;

  const rolePill = (r: string) => {
    switch (r) {
      case 'student': return styles.pillGreen;
      case 'instructor': return styles.pillOrange;
      case 'institution_admin':
      case 'platform_admin': return styles.pillGray;
      default: return styles.pillGray;
    }
  };

  return (
    <AdminShell
      activePage="User Management"
      title="User Management"
      subtitle="Cross-institution user search — creation and bulk import are handled by each institution's admin"
    >
      {/* ── Summary Cards ─────────────────────────────────────────────── */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryIcon} style={{ background: 'linear-gradient(135deg,#9333ea,#7c3aed)' }}>
            <Users size={18} strokeWidth={1.9} color="#fff" />
          </div>
          <div>
            <p className={styles.summaryLabel}>Students (in results)</p>
            <p className={styles.summaryValue}>{students}</p>
          </div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryIcon} style={{ background: 'linear-gradient(135deg,#ec4899,#d6409f)' }}>
            <GraduationCap size={18} strokeWidth={1.9} color="#fff" />
          </div>
          <div>
            <p className={styles.summaryLabel}>Instructors (in results)</p>
            <p className={styles.summaryValue}>{instructors}</p>
          </div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryIcon} style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)' }}>
            <ShieldCheck size={18} strokeWidth={1.9} color="#fff" />
          </div>
          <div>
            <p className={styles.summaryLabel}>Admins (in results)</p>
            <p className={styles.summaryValue}>{admins}</p>
          </div>
        </div>
      </div>

      {/* ── Toolbar ───────────────────────────────────────────────────── */}
      <div className={styles.toolBar}>
        <div className={styles.toolRight} style={{ width: '100%', justifyContent: 'flex-start' }}>
          <div className={styles.searchBox} style={{ flex: 1, minWidth: '240px' }}>
            <Search size={14} strokeWidth={2} color="#9891a6" />
            <input
              className={styles.searchInput}
              placeholder="Search by name, email, or roll number…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select
            className={styles.searchInput}
            style={{ width: 'auto', minWidth: '160px', border: '1px solid rgba(148,142,166,.25)', borderRadius: '10px', padding: '8px 12px', fontSize: '13px', background: 'rgba(255,255,255,.7)' }}
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>{r === '' ? 'All roles' : r.replace('_', ' ')}</option>
            ))}
          </select>
          <select
            className={styles.searchInput}
            style={{ width: 'auto', minWidth: '200px', border: '1px solid rgba(148,142,166,.25)', borderRadius: '10px', padding: '8px 12px', fontSize: '13px', background: 'rgba(255,255,255,.7)' }}
            value={institutionId}
            onChange={(e) => setInstitutionId(e.target.value)}
          >
            <option value="">All institutions</option>
            {institutions.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: '12px', marginBottom: '20px', color: '#b91c1c', fontSize: '13.5px', fontWeight: 600 }}>
          {error}
        </div>
      )}

      {/* ── Results Table ─────────────────────────────────────────────── */}
      <div className={styles.tableWrap}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#6b7280', fontSize: '13.5px', padding: '24px' }}>
            <Loader2 size={18} className="spin" /> Searching users…
          </div>
        ) : hasSearched && users.length === 0 ? (
          <p style={{ color: '#9ca3af', fontSize: '13.5px', padding: '24px', margin: 0 }}>
            No users match the current filters.
          </p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Roll No.</th>
                <th>Institution</th>
                <th>Status</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className={styles.userCell}>
                      <div className={styles.avatar} style={{ background: u.role === 'student' ? '#9333ea' : u.role === 'instructor' ? '#d6409f' : '#7c3aed' }}>
                        {u.full_name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className={styles.userName}>{u.full_name}</p>
                        <p className={styles.userEmail}>{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`${styles.pill} ${rolePill(u.role)}`}>{u.role.replace('_', ' ')}</span>
                  </td>
                  <td>{u.roll_number ? <code className={styles.code}>{u.roll_number}</code> : '—'}</td>
                  <td>{u.institution_id ? (institutionById.get(u.institution_id)?.name ?? 'Platform') : 'Platform'}</td>
                  <td>
                    <span className={`${styles.pill} ${u.is_active ? styles.pillGreen : styles.pillGray}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>{fmtDate(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className={styles.tableFooter}>
          <span>Showing {count} user{count === 1 ? '' : 's'} (results capped at 50 — refine your search to narrow down)</span>
        </div>
      </div>
    </AdminShell>
  );
}
