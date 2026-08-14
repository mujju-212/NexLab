'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '@/components/layout/AdminShell';
import { Building2, Users, Activity, Layers, Loader2, ExternalLink } from 'lucide-react';
import { adminService, Institution } from '@/services/admin.service';
import styles from './page.module.css';

interface InstitutionUsage {
  id: string;
  name: string;
  plan: string;
  users: number;
  sessions: number;
  sessions_per_user: number;
}

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

export default function AcademicPage() {
  const router = useRouter();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [usage, setUsage] = useState<InstitutionUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [inst, cross] = await Promise.all([
          adminService.listInstitutions(),
          adminService.getCrossInstitutionAnalytics(),
        ]);
        setInstitutions(inst);
        setUsage(cross);
      } catch {
        setError('Could not load institution overview.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const usageById = useMemo(
    () => new Map(usage.map((u) => [u.id, u])),
    [usage]
  );

  const totalUsers = usage.reduce((sum, u) => sum + u.users, 0);
  const totalSessions = usage.reduce((sum, u) => sum + u.sessions, 0);
  const active = institutions.filter((i) => i.is_active).length;

  const planPill = (plan: string) => {
    switch (plan) {
      case 'enterprise': return styles.pillBlue;
      case 'pro': return styles.pillGreen;
      default: return styles.pillGray;
    }
  };

  const onboardingPill = (status: string) => {
    switch (status) {
      case 'active': return styles.pillGreen;
      case 'pending': return styles.pillOrange;
      default: return styles.pillGray;
    }
  };

  return (
    <AdminShell
      activePage="Academic Setup"
      title="Academic Overview"
      subtitle="Academic structure (departments, sections, subjects, faculty allocation) is managed inside each institution's admin portal — this is the platform-level view"
    >
      {/* ── Summary Cards ────────────────────────────────────────────── */}
      <div className={styles.overviewGrid} style={{ gridTemplateColumns: 'repeat(4, 1fr)', cursor: 'default' }}>
        <div className={styles.overviewCard} style={{ cursor: 'default' }}>
          <div className={styles.overviewIcon}>
            <Building2 size={18} strokeWidth={1.9} color="#fff" />
          </div>
          <div>
            <p className={styles.overviewLabel}>Institutions</p>
            <p className={styles.overviewCount}>{institutions.length}</p>
          </div>
        </div>
        <div className={styles.overviewCard} style={{ cursor: 'default' }}>
          <div className={styles.overviewIcon} style={{ background: 'linear-gradient(135deg,#ec4899,#d6409f)' }}>
            <Activity size={18} strokeWidth={1.9} color="#fff" />
          </div>
          <div>
            <p className={styles.overviewLabel}>Active</p>
            <p className={styles.overviewCount}>{active}</p>
          </div>
        </div>
        <div className={styles.overviewCard} style={{ cursor: 'default' }}>
          <div className={styles.overviewIcon} style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)' }}>
            <Users size={18} strokeWidth={1.9} color="#fff" />
          </div>
          <div>
            <p className={styles.overviewLabel}>Total Users</p>
            <p className={styles.overviewCount}>{totalUsers}</p>
          </div>
        </div>
        <div className={styles.overviewCard} style={{ cursor: 'default' }}>
          <div className={styles.overviewIcon} style={{ background: 'linear-gradient(135deg,#9333ea,#d946ef)' }}>
            <Layers size={18} strokeWidth={1.9} color="#fff" />
          </div>
          <div>
            <p className={styles.overviewLabel}>Total Sessions</p>
            <p className={styles.overviewCount}>{totalSessions}</p>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: '12px', marginBottom: '20px', color: '#b91c1c', fontSize: '13.5px', fontWeight: 600 }}>
          {error}
        </div>
      )}

      {/* ── Institution Table ────────────────────────────────────────── */}
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Per-Institution Setup Status</h2>
        <button className={styles.btnPrimary} onClick={() => router.push('/admin/institutions')}>
          <ExternalLink size={14} strokeWidth={2} /> Manage Institutions
        </button>
      </div>

      <div className={styles.tableWrap}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#6b7280', fontSize: '13.5px', padding: '24px' }}>
            <Loader2 size={18} className="spin" /> Loading institution overview…
          </div>
        ) : institutions.length === 0 ? (
          <p style={{ color: '#9ca3af', fontSize: '13.5px', padding: '24px', margin: 0 }}>
            No institutions onboarded yet.
          </p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Institution</th>
                <th>Plan</th>
                <th>Onboarding</th>
                <th>Setup Checklist</th>
                <th>Users</th>
                <th>Sessions</th>
                <th>Onboarded</th>
              </tr>
            </thead>
            <tbody>
              {institutions.map((inst) => {
                const u = usageById.get(inst.id);
                const done = [inst.checklist?.has_users, inst.checklist?.has_experiments, inst.checklist?.has_environment].filter(Boolean).length;
                return (
                  <tr key={inst.id}>
                    <td>
                      <strong style={{ color: '#201b2e', fontFamily: "'Space Grotesk',sans-serif" }}>{inst.name}</strong>
                      <div style={{ fontSize: '12px', color: '#9891a6' }}>{inst.code}</div>
                    </td>
                    <td><span className={`${styles.pill} ${planPill(inst.plan)}`}>{inst.plan}</span></td>
                    <td><span className={`${styles.pill} ${onboardingPill(inst.onboarding_status)}`}>{inst.onboarding_status}</span></td>
                    <td>
                      <code className={styles.code}>{done}/3 complete</code>
                    </td>
                    <td>{u?.users ?? '—'}</td>
                    <td>{u?.sessions ?? '—'}</td>
                    <td>{fmtDate(inst.onboarded_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </AdminShell>
  );
}
