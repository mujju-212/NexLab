'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/layout/AdminShell';
import { adminService, adminGrowthService, type PlatformAnalytics, type AdminFunnelStage, type AdminCohort } from '@/services/admin.service';
import {
  TrendingUp, Users, Brain, Activity,
  BarChart3, Building2, RefreshCw, UserPlus, Download, Filter
} from 'lucide-react';
import styles from './page.module.css';

const PERIODS: { id: string; label: string; days: number }[] = [
  { id: 'week', label: 'Week', days: 7 },
  { id: 'month', label: 'Month', days: 30 },
  { id: 'semester', label: 'Semester', days: 120 },
];

const INST_COLORS = ['#7c3aed', '#d946ef', '#f59e0b', '#22c55e', '#ec4899', '#84cc16'];

export default function AnalyticsPage() {
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<PlatformAnalytics | null>(null);
  const [sessionsTrend, setSessionsTrend] = useState<{ date: string; sessions: number }[]>([]);
  const [groqTrend, setGroqTrend] = useState<{ date: string; total: number }[]>([]);
  const [insts, setInsts] = useState<{ id: string; name: string; plan: string; users: number; sessions: number; sessions_per_user: number }[]>([]);
  const [funnel, setFunnel] = useState<AdminFunnelStage[] | null>(null);
  const [cohorts, setCohorts] = useState<AdminCohort[] | null>(null);
  const [pusers, setPUsers] = useState<{ total: number; active: number; signups_in_window: number; growth: { date: string; count: number }[]; dau: { date: string; count: number }[]; xp_distribution: Record<string, number>; top_learners: { id: string; name: string; xp: number }[] } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [f, c, pu] = await Promise.all([
          adminGrowthService.getFunnel(60),
          adminGrowthService.getCohorts(8),
          adminGrowthService.getPlatformUsers(30),
        ]);
        setFunnel(f.stages);
        setCohorts(c.cohorts);
        setPUsers(pu);
      } catch { /* growth section shows its own empty state */ }
    })();
  }, []);

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
          { label: 'Total Sessions',       value: overview?.total_sessions,      Icon: Activity,   bg: 'linear-gradient(135deg,#9333ea,#d946ef)' },
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
                style={{ flex: 1, minWidth: 10, maxWidth: 46, height: `${Math.max(4, (t.sessions / maxSessions) * 100)}%`, background: 'linear-gradient(180deg,#9333ea,#7c3aed)', borderRadius: '5px 5px 2px 2px' }} />
            ))}
          </div>
          {sessionsTrend.length === 1 && (
            <p style={{ fontSize: 11, color: '#9891a6', marginTop: 6 }}>
              Only one day of session data in this window — a trend needs at least two.
            </p>
          )}
          {sessionsTrend.length > 1 && (
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

      {/* ══ GROWTH (Phase 3) ═══════════════════════════════════════════ */}
      <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Acquisition funnel <span style={{ fontWeight: 600, fontSize: 12, color: '#9891a6' }}>(last 60d signups)</span></h3>
          {funnel ? funnel.map(st => {
            const width = Math.max(4, st.pct);
            return (
              <div key={st.key} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: '#463f57', marginBottom: 4 }}>
                  <span>{st.label}</span>
                  <span>{st.count} · {st.pct}%</span>
                </div>
                <div style={{ height: 10, borderRadius: 99, background: 'rgba(124,58,237,.12)', overflow: 'hidden' }}>
                  <div style={{ width: `${width}%`, height: '100%', background: 'linear-gradient(90deg,#7c3aed,#a855f7)' }} />
                </div>
              </div>
            );
          }) : <p style={{ color: '#9891a6', fontSize: 13 }}>Funnel unavailable.</p>}
        </div>

        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Weekly signup cohorts <span style={{ fontWeight: 600, fontSize: 12, color: '#9891a6' }}>(% active in week N)</span></h3>
          {cohorts && cohorts.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 11.5, width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '4px 8px', textAlign: 'left', color: '#9891a6' }}>Cohort</th>
                    <th style={{ padding: '4px 6px', color: '#9891a6' }}>n</th>
                    {cohorts[0].cells.map((_, i) => (
                      <th key={i} style={{ padding: '4px 6px', color: '#9891a6' }}>W{i}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map(c => (
                    <tr key={c.cohort}>
                      <td style={{ padding: '4px 8px', fontWeight: 700, color: '#463f57', whiteSpace: 'nowrap' }}>
                        {new Date(c.cohort).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                      <td style={{ padding: '4px 6px', textAlign: 'center', color: '#9891a6', fontWeight: 700 }}>{c.size}</td>
                      {c.cells.map(cell => {
                        const intensity = cell.pct == null ? 0 : Math.min(1, cell.pct / 100);
                        return (
                          <td key={cell.week} style={{ padding: 3 }}>
                            <div title={cell.pct != null ? `${cell.count} active (${cell.pct}%)` : 'future'} style={{
                              minWidth: 34, padding: '4px 0', textAlign: 'center', borderRadius: 6, fontWeight: 700,
                              background: intensity > 0 ? `rgba(124,58,237,${0.12 + intensity * 0.6})` : 'rgba(148,163,184,.12)',
                              color: intensity > 0.5 ? '#fff' : '#615a72',
                            }}>
                              {cell.pct != null ? (cell.pct > 0 ? `${cell.pct}%` : '·') : '—'}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p style={{ color: '#9891a6', fontSize: 13 }}>Cohorts unavailable.</p>}
        </div>

        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Direct (platform) users</h3>
          {pusers ? (
            <>
              <div style={{ display: 'flex', gap: 18, marginBottom: 12, fontSize: 13, fontWeight: 700, color: '#463f57' }}>
                <span>{pusers.total} total</span>
                <span>{pusers.active} active</span>
                <span style={{ color: '#db2777' }}>+{pusers.signups_in_window} in 30d</span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 40, marginBottom: 8 }}>
                {pusers.dau.map(d => {
                  const max = Math.max(1, ...pusers.dau.map(x => x.count));
                  return (
                    <div key={d.date} title={`${d.date}: ${d.count}`} style={{
                      flex: 1, minWidth: 3, height: `${Math.max(6, (d.count / max) * 100)}%`,
                      background: d.count ? '#db2777' : 'rgba(219,39,119,.12)', borderRadius: 2,
                    }} />
                  );
                })}
              </div>
              <p style={{ fontSize: 11.5, color: '#9891a6', margin: '0 0 10px' }}>Daily active (30d)</p>
              {pusers.top_learners.slice(0, 5).map((t, i) => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 700, color: '#463f57', padding: '3px 0' }}>
                  <span>{i + 1}. {t.name}</span>
                  <span style={{ color: '#7c3aed' }}>{t.xp.toLocaleString()} XP</span>
                </div>
              ))}
            </>
          ) : <p style={{ color: '#9891a6', fontSize: 13 }}>Direct-user cohort unavailable.</p>}
        </div>

        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Exports</h3>
          <p style={{ fontSize: 12.5, color: '#64748b', fontWeight: 600, margin: '0 0 12px' }}>
            CSV streams generated live from the database — every export is written to the audit log.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a className={styles.btnSecondary} style={{ textDecoration: 'none' }} href={adminGrowthService.exportUrl('users')} download>
              <Download size={14} /> Users CSV
            </a>
            <a className={styles.btnSecondary} style={{ textDecoration: 'none' }} href={adminGrowthService.exportUrl('activity')} download>
              <Download size={14} /> Activity CSV
            </a>
          </div>
          <p style={{ fontSize: 11.5, color: '#9891a6', margin: '10px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Filter size={12} /> Exports carry your access token automatically via the API client cookie session.
          </p>
        </div>
      </div>
    </AdminShell>
  );
}
