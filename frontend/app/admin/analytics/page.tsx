'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/layout/AdminShell';
import { adminService, type PlatformAnalytics } from '@/services/admin.service';
import {
  TrendingUp, Users, Brain, Activity,
  BarChart3, Building2, RefreshCw, UserPlus
} from 'lucide-react';
import styles from './page.module.css';

const PERIODS: { id: string; label: string; days: number }[] = [
  { id: 'week', label: 'Week', days: 7 },
  { id: 'month', label: 'Month', days: 30 },
  { id: 'semester', label: 'Semester', days: 120 },
];

const INST_COLORS = ['#7c3aed', '#d946ef', '#f59e0b', '#22c55e', '#ec4899', '#06b6d4'];

export default function AnalyticsPage() {
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<PlatformAnalytics | null>(null);
  const [sessionsTrend, setSessionsTrend] = useState<{ date: string; sessions: number }[]>([]);
  const [groqTrend, setGroqTrend] = useState<{ date: string; total: number }[]>([]);
  const [insts, setInsts] = useState<{ id: string; name: string; plan: string; users: number; sessions: number; sessions_per_user: number }[]>([]);

  const days = PERIODS.find(p => p.id === period)?.days ?? 30;

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [ov, st, gt, ci] = await Promise.all([
          adminService.getAnalyticsOverview(days),
          adminService.getSessionsTrend(Math.min(days, 30)),
          adminService.getGroqTrend(Math.min(days, 30)),
          adminService.getCrossInstitutionAnalytics(),
        ]);
        setOverview(ov);
        setSessionsTrend(st);
        setGroqTrend(gt);
        setInsts(ci);
      } catch {
        /* leave empty states */
      } finally {
        setLoading(false);
      }
    })();
  }, [days]);

  const groqTotal = groqTrend.reduce((s, g) => s + g.total, 0);
  const maxSessions = Math.max(1, ...sessionsTrend.map(t => t.sessions));
  const maxGroq = Math.max(1, ...groqTrend.map(g => g.total));
  const maxInstSessions = Math.max(1, ...insts.map(i => i.sessions));

  return (
    <AdminShell activePage="Platform Analytics" title="Platform Analytics" subtitle="Usage trends, institution comparison and AI consumption — live from backend">

      {/* ── Period Filter ─────────────────────────────────────────────── */}
      <div className={styles.topBar}>
        <div className={styles.tabs}>
          {PERIODS.map(p => (
            <button key={p.id} className={`${styles.tab} ${period === p.id ? styles.tabActive : ''}`} onClick={() => setPeriod(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <button className={styles.btnSecondary} onClick={() => setPeriod(period)}>
          <RefreshCw size={14} strokeWidth={2} /> Refresh
        </button>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────────── */}
      <div className={styles.kpiGrid}>
        {[
          { label: 'Total Users',          value: overview?.total_users,         Icon: Users,      bg: 'linear-gradient(135deg,#7c3aed,#9333ea)' },
          { label: `New Users (${days}d)`, value: overview?.new_users,           Icon: UserPlus,   bg: 'linear-gradient(135deg,#ec4899,#d6409f)' },
          { label: 'Total Sessions',       value: overview?.total_sessions,      Icon: Activity,   bg: 'linear-gradient(135deg,#06b6d4,#d946ef)' },
          { label: `Sessions (${days}d)`,  value: overview?.sessions_in_period,  Icon: BarChart3,  bg: 'linear-gradient(135deg,#22c55e,#16a34a)' },
          { label: 'Active Institutions',  value: overview?.active_institutions, Icon: Building2,  bg: 'linear-gradient(135deg,#f59e0b,#f2994a)' },
          { label: `AI Calls (${Math.min(days, 30)}d)`, value: groqTotal,        Icon: Brain,      bg: 'linear-gradient(135deg,#9333ea,#7c3aed)' },
        ].map(k => (
          <div key={k.label} className={styles.kpiCard}>
            <div className={styles.kpiIcon} style={{ background: k.bg }}>
              <k.Icon size={17} strokeWidth={1.9} color="#fff" />
            </div>
            <p className={styles.kpiLabel}>{k.label}</p>
            <div className={styles.kpiRow}>
              <span className={styles.kpiValue}>{loading ? '…' : k.value ?? '—'}</span>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.twoCol}>
        {/* ── Institution Comparison ─────────────────────────────────── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Institution Comparison <span className={styles.pill}>{insts.length}</span></h2>
          {insts.length === 0 && !loading && (
            <p style={{ fontSize: 13, color: '#9891a6' }}>No institutions found.</p>
          )}
          {insts.map((i, idx) => (
            <div key={i.id} className={styles.deptRow}>
              <div className={styles.deptTag} style={{ background: INST_COLORS[idx % INST_COLORS.length] + '22', color: INST_COLORS[idx % INST_COLORS.length] }}>
                {i.plan}
              </div>
              <div className={styles.deptMeta}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span className={styles.deptLabel}>{i.name} · {i.users} users</span>
                  <span className={styles.deptPct}>{i.sessions} sessions</span>
                </div>
                <div className={styles.barTrack}>
                  <div className={styles.barFill} style={{ width: `${(i.sessions / maxInstSessions) * 100}%`, background: INST_COLORS[idx % INST_COLORS.length] }} />
                </div>
              </div>
              <span className={styles.scoreChip}>{i.sessions_per_user}/user</span>
            </div>
          ))}
        </div>

        {/* ── Sessions Trend ─────────────────────────────────────────── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Sessions Trend <span className={styles.pill}>last {Math.min(days, 30)}d</span></h2>
          {sessionsTrend.length === 0 && !loading && (
            <p style={{ fontSize: 13, color: '#9891a6' }}>No sessions recorded in this window.</p>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 140, padding: '8px 0' }}>
            {sessionsTrend.map(t => (
              <div key={t.date} title={`${t.date}: ${t.sessions} sessions`}
                style={{ flex: 1, minWidth: 10, height: `${Math.max(4, (t.sessions / maxSessions) * 100)}%`, background: 'linear-gradient(180deg,#9333ea,#7c3aed)', borderRadius: '5px 5px 2px 2px' }} />
            ))}
          </div>
          {sessionsTrend.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9891a6', fontFamily: 'JetBrains Mono,monospace' }}>
              <span>{sessionsTrend[0].date}</span>
              <span>{sessionsTrend[sessionsTrend.length - 1].date}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── AI Usage — Groq trend ────────────────────────────────────── */}
      <div className={styles.card} style={{ marginTop: 18 }}>
        <h2 className={styles.cardTitle}>AI Hint Engine — Groq Usage (last {Math.min(days, 30)}d) <span className={styles.pill}>{groqTotal} calls</span></h2>
        {groqTrend.length === 0 ? (
          <p style={{ fontSize: 13, color: '#9891a6', margin: 0 }}>No AI calls recorded yet — usage appears here once hints are served.</p>
        ) : (
          <div className={styles.aiGrid}>
            {groqTrend.map(g => (
              <div key={g.date} className={styles.aiCard}>
                <p className={styles.aiLabel}>{g.date}</p>
                <p className={styles.aiValue}>{g.total}</p>
                <div className={styles.aiBarTrack}>
                  <div className={styles.aiBarFill} style={{ width: `${(g.total / maxGroq) * 100}%`, background: '#7c3aed' }} />
                </div>
                <p className={styles.aiPct}>{g.total === maxGroq ? 'peak day' : `${Math.round((g.total / maxGroq) * 100)}% of peak`}</p>
              </div>
            ))}
          </div>
        )}
        <p style={{ fontSize: 12, color: '#9891a6', margin: '12px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
          <TrendingUp size={13} strokeWidth={2} /> Figures aggregated across all institutions from the Groq usage ledger.
        </p>
      </div>
    </AdminShell>
  );
}
