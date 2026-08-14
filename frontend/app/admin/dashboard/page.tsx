'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '@/components/layout/AdminShell';
import { adminService, type PlatformDashboard } from '@/services/admin.service';
import { useAuthStore } from '@/store/auth-store';
import {
  Building2, Users, Activity, Calendar,
  ArrowUp, RefreshCw, Plus, AlertCircle
} from 'lucide-react';
import styles from './page.module.css';

export default function AdminDashboard() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [dash, setDash] = useState<PlatformDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isPlatformAdmin = user?.role === 'platform_admin';

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await adminService.getDashboard();
        setDash(data);
      } catch {
        setError('Could not load dashboard data.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <AdminShell activePage="Dashboard">

      {/* ── Welcome Banner ───────────────────────────────────────────────── */}
      <div className={styles.welcomeBanner}>
        <div className={styles.welcomeLeft}>
          <h1>{greeting()}, {user?.full_name?.split(' ')[0] ?? 'Admin'} 👋</h1>
          <div className={styles.welcomeMeta}>
            <span className={styles.welcomeTag}>
              {isPlatformAdmin ? '🔱 Platform Super Admin' : '🏛️ Institution Admin'}
            </span>
          </div>
        </div>
        <div className={styles.welcomeRight}>
          {isPlatformAdmin && (
            <button className={styles.quickBtn} onClick={() => router.push('/admin/institutions')}>
              <Plus size={14} strokeWidth={2} />
              Register Institution
            </button>
          )}
          <button className={styles.quickBtn} onClick={() => router.push('/admin/users')}>
            <Users size={14} strokeWidth={2} />
            Add User
          </button>
        </div>
      </div>

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {error && (
        <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:10, padding:'12px 16px', color:'#f87171', fontSize:'0.85rem', marginBottom:20 }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* ── Stat Row — live from backend ─────────────────────────────────── */}
      <div className={styles.statGrid4}>
        {loading ? (
          Array(4).fill(0).map((_, i) => (
            <div key={i} className={styles.statCard} style={{ minHeight: 110, opacity: 0.4 }}>
              <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', color: '#64748b' }} />
            </div>
          ))
        ) : (
          <>
            <div className={styles.statCard} onClick={() => router.push('/admin/institutions')} style={{ cursor:'pointer' }}>
              <div className={styles.statIcon} style={{ background: 'linear-gradient(135deg,#9333ea,#7c3aed)' }}>
                <Building2 size={17} strokeWidth={1.9} color="#fff" />
              </div>
              <p className={styles.statLabel}>Total Institutions</p>
              <div className={styles.statRow}>
                <span className={styles.statValue}>{dash?.institutions?.total ?? '—'}</span>
                <span className={`${styles.badge} ${styles.badgeUp}`}>
                  <ArrowUp size={11} strokeWidth={2.5} />
                  {dash?.institutions?.active ?? 0} active
                </span>
              </div>
              <p className={styles.statSub}>Platform-wide</p>
            </div>

            <div className={styles.statCard} onClick={() => router.push('/admin/users')} style={{ cursor:'pointer' }}>
              <div className={styles.statIcon} style={{ background: 'linear-gradient(135deg,#ec4899,#d6409f)' }}>
                <Users size={17} strokeWidth={1.9} color="#fff" />
              </div>
              <p className={styles.statLabel}>Total Users</p>
              <div className={styles.statRow}>
                <span className={styles.statValue}>{dash?.users?.total ?? '—'}</span>
              </div>
              <p className={styles.statSub}>All roles</p>
            </div>

            <div className={styles.statCard} onClick={() => router.push('/admin/monitoring')} style={{ cursor:'pointer' }}>
              <div className={styles.statIcon} style={{ background: 'linear-gradient(135deg,#9333ea,#d946ef)' }}>
                <Activity size={17} strokeWidth={1.9} color="#fff" />
              </div>
              <p className={styles.statLabel}>Live Sessions</p>
              <div className={styles.statRow}>
                <span className={styles.statValue}>{dash?.live_sessions?.active ?? '—'}</span>
              </div>
              <p className={styles.statSub}>Currently active</p>
            </div>

            <div className={styles.statCard} style={{ cursor:'default' }}>
              <div className={styles.statIcon} style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)' }}>
                <Calendar size={17} strokeWidth={1.9} color="#fff" />
              </div>
              <p className={styles.statLabel}>Suspended</p>
              <div className={styles.statRow}>
                <span className={styles.statValue}>
                  {dash ? (dash.institutions.total - dash.institutions.active) : '—'}
                </span>
              </div>
              <p className={styles.statSub}>Inactive institutions</p>
            </div>
          </>
        )}
      </div>

      {/* ── Quick Links ───────────────────────────────────────────────────── */}
      <div className={styles.boardSection}>
        <div className={styles.boardHeader}>
          <h2>Quick Actions</h2>
        </div>
        <div className={styles.boardColumns}>
          {[
            { label: 'Manage Institutions', desc: 'Register, suspend, or configure institutions', route: '/admin/institutions', color: '#9333ea' },
            { label: 'Platform Analytics',  desc: 'Cross-institution usage and trends',           route: '/admin/analytics',    color: '#9333ea' },
            { label: 'System Health',       desc: 'Judge0, DB, and Groq API status',              route: '/admin/monitoring',   color: '#22c55e' },
            { label: 'Platform Config',     desc: 'Feature flags and global settings',            route: '/admin/settings',     color: '#f59e0b' },
          ].map(a => (
            <div key={a.label} className={styles.actCard} onClick={() => router.push(a.route)} style={{ cursor:'pointer' }}>
              <div className={styles.actTop}>
                <div className={styles.actIcon} style={{ background: `${a.color}22`, border:`1px solid ${a.color}44` }}>
                  <Activity size={16} strokeWidth={1.9} color={a.color} />
                </div>
                <div>
                  <p className={styles.actName}>{a.label}</p>
                  <p className={styles.actMeta}>{a.desc}</p>
                </div>
              </div>
              <p className={styles.actFooter} style={{ color: a.color }}>Open →</p>
            </div>
          ))}
        </div>
      </div>

    </AdminShell>
  );
}
