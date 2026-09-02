'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import InstitutionShell from '@/components/layout/InstitutionShell';
import { institutionService, type InstitutionDashboard, type DashboardActivity, type SystemHealth, type PlanUsage, type GroqBudget } from '@/services/institution.service';
import { useAuthStore } from '@/store/auth-store';
import {
  Users, GraduationCap, BookOpen, Radio, Calendar, RefreshCw, Plus, ArrowRight,
  TrendingUp, TrendingDown, Clock, Activity, AlertTriangle, CheckCircle, Cpu, Armchair
} from 'lucide-react';
import styles from './page.module.css';

export default function InstitutionDashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [data, setData] = useState<InstitutionDashboard | null>(null);
  const [activity, setActivity] = useState<DashboardActivity | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [plan, setPlan] = useState<PlanUsage | null>(null);
  const [budget, setBudget] = useState<GroqBudget | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await institutionService.getDashboard();
      setData(d);
    } catch {
      setError('Could not load dashboard.');
    } finally { setLoading(false); }
    // Secondary widgets — independent, never block the main dashboard.
    try { setActivity(await institutionService.getDashboardActivity()); } catch { /* chart shows fallback */ }
    try { setHealth(await institutionService.getSystemHealth()); } catch { /* health shows fallback */ }
    try { setPlan(await institutionService.getPlanUsage()); } catch { /* seat card hidden */ }
    try { setBudget(await institutionService.getGroqBudget()); } catch { /* budget card hidden */ }
  };

  useEffect(() => { load(); }, []);

  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  };

  const STAT_CARDS = [
    { label: 'Students',      value: data?.stats.students,      Icon: GraduationCap, color: '#9333ea', bg: '#faf5ff', href: '/institution/users?role=student' },
    { label: 'Instructors',   value: data?.stats.instructors,   Icon: Users,         color: '#10b981', bg: '#ecfdf5', href: '/institution/users?role=instructor' },
    { label: 'Subjects',      value: data?.stats.subjects,      Icon: BookOpen,      color: '#f59e0b', bg: '#fffbeb', href: '/institution/academic' },
    { label: 'Live Sessions', value: data?.stats.live_sessions, Icon: Radio,         color: '#ef4444', bg: '#fef2f2', href: '/institution/sessions' },
  ];

  // Weekly activity — real last-7-days data from the backend.
  const activityDays = activity?.days ?? [];
  const maxActivity = Math.max(...activityDays.map(d => d.total), 1);
  const deltaPct = activity?.delta_pct ?? 0;
  const deltaUp = deltaPct >= 0;

  return (
    <InstitutionShell activePage="Dashboard"
      title={`${greeting()}, ${user?.full_name?.split(' ')[0] ?? 'Admin'} 👋`}
      subtitle="Here's what's happening in your institution today.">

      {/* Quick stats */}
      <div className={styles.statsGrid}>
        {STAT_CARDS.map(({ label, value, Icon, color, bg, href }) => (
          <div key={label} className={styles.statCard} onClick={() => router.push(href)}>
            <div className={styles.statIcon} style={{ background: bg, color }}>
              <Icon size={22} strokeWidth={1.8} />
            </div>
            <div className={styles.statBody}>
              <p className={styles.statLabel}>{label}</p>
              <p className={styles.statValue}>
                {loading ? '—' : (value ?? 0).toLocaleString()}
              </p>
            </div>
            <ArrowRight size={14} className={styles.statArrow} />
          </div>
        ))}
      </div>

      {/* Plan seats + AI budget — the two things that silently block the campus */}
      {(plan || budget) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginBottom: 20 }}>
          {/* Student seats */}
          {plan && (
            <div style={{ background: 'rgba(255,255,255,0.78)', borderRadius: 18, border: '1px solid rgba(255,255,255,0.9)', padding: '20px 26px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', cursor: 'pointer' }} onClick={() => router.push('/institution/settings?tab=plan')}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Armchair size={16} style={{ color: '#9333ea' }} />
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#201b2e', fontFamily: "'Space Grotesk', sans-serif" }}>Student Seats</h3>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '.05em', background: 'rgba(147,51,234,0.08)', padding: '3px 10px', borderRadius: 20 }}>
                  {plan.plan} plan
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: '#201b2e' }}>
                  {plan.students.used}<span style={{ fontSize: 13, fontWeight: 600, color: '#9891a6' }}> / {plan.students.limit ?? '∞'} seats</span>
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: plan.students.remaining === 0 ? '#dc2626' : '#16a34a' }}>
                  {plan.students.remaining === 0 ? 'Full — upgrade to add more' : `${plan.students.remaining} remaining`}
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 6, background: 'rgba(147,51,234,0.08)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 6, transition: 'width .4s ease',
                  width: `${Math.min(plan.students.percent ?? 0, 100)}%`,
                  background: (plan.students.percent ?? 0) >= 100 ? '#ef4444'
                    : (plan.students.percent ?? 0) >= 85 ? 'linear-gradient(90deg,#f59e0b,#f97316)'
                    : 'linear-gradient(90deg,#9333ea,#c084fc)',
                }} />
              </div>
            </div>
          )}

          {/* AI budget today */}
          {budget && (
            <div style={{ background: 'rgba(255,255,255,0.78)', borderRadius: 18, border: '1px solid rgba(255,255,255,0.9)', padding: '20px 26px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', cursor: 'pointer' }} onClick={() => router.push('/institution/analytics')}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Cpu size={16} style={{ color: '#0ea5e9' }} />
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#201b2e', fontFamily: "'Space Grotesk', sans-serif" }}>AI Budget — Today</h3>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: budget.exhausted ? '#dc2626' : '#16a34a' }}>
                  {budget.exhausted ? 'Exhausted' : `${Math.round((budget.remaining_tokens / Math.max(budget.limit_tokens, 1)) * 100)}% left`}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: '#201b2e' }}>
                  {budget.used_tokens.toLocaleString()}<span style={{ fontSize: 13, fontWeight: 600, color: '#9891a6' }}> / {budget.limit_tokens.toLocaleString()} tokens</span>
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#9891a6' }}>≈ ${budget.cost_usd_today.toFixed(4)}</span>
              </div>
              <div style={{ height: 8, borderRadius: 6, background: 'rgba(14,165,233,0.08)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 6, transition: 'width .4s ease',
                  width: `${Math.min((budget.used_tokens / Math.max(budget.limit_tokens, 1)) * 100, 100)}%`,
                  background: budget.exhausted ? '#ef4444'
                    : (budget.used_tokens / Math.max(budget.limit_tokens, 1)) > 0.85 ? 'linear-gradient(90deg,#f59e0b,#f97316)'
                    : 'linear-gradient(90deg,#0ea5e9,#38bdf8)',
                }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Analytics overview row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginBottom: 20 }}>
        {/* Weekly activity chart */}
        <div style={{ background: 'rgba(255,255,255,0.78)', borderRadius: 18, border: '1px solid rgba(255,255,255,0.9)', padding: '24px 28px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#201b2e', fontFamily: "'Space Grotesk', sans-serif" }}>Weekly Activity</h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9891a6' }}>Sessions & submissions this week</p>
            </div>
            {activity && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: deltaUp ? '#22c55e' : '#ef4444' }}>
                {deltaUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />} {deltaUp ? '+' : ''}{deltaPct}% vs last week
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140 }}>
            {activityDays.length === 0 ? (
              <div style={{ width: '100%', textAlign: 'center', color: '#9891a6', fontSize: 13, alignSelf: 'center' }}>
                {loading ? 'Loading…' : 'No activity in the last 7 days.'}
              </div>
            ) : activityDays.map((d, i) => (
              <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
                title={`${d.sessions} session${d.sessions === 1 ? '' : 's'}, ${d.submissions} submission${d.submissions === 1 ? '' : 's'}`}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#9333ea' }}>{d.total}</span>
                <div style={{
                  width: '100%', borderRadius: 6, transition: 'height .3s ease',
                  height: `${(d.total / maxActivity) * 100}px`,
                  background: i === activityDays.length - 1
                    ? 'linear-gradient(180deg, #9333ea, #7c3aed)'
                    : 'linear-gradient(180deg, #e9d5ff, #d8b4fe)',
                  minHeight: 8,
                }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: '#9891a6' }}>{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* System health card */}
        <div style={{ background: 'rgba(255,255,255,0.78)', borderRadius: 18, border: '1px solid rgba(255,255,255,0.9)', padding: '24px 28px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#201b2e', fontFamily: "'Space Grotesk', sans-serif" }}>System Health</h3>
            {health?.maintenance && (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#d97706', background: 'rgba(245,158,11,0.12)', padding: '3px 10px', borderRadius: 20 }}>
                Maintenance mode
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {(health?.components ?? []).length === 0 ? (
              <div style={{ color: '#9891a6', fontSize: 13, padding: '8px 0' }}>
                {loading ? 'Checking services…' : 'Health data unavailable.'}
              </div>
            ) : health!.components.map(s => {
              const down = !s.ok && s.status === 'down';
              const palette = s.ok
                ? { bg: 'rgba(34,197,94,0.04)',  border: 'rgba(34,197,94,0.12)', icon: '#22c55e', text: '#16a34a' }
                : down
                ? { bg: 'rgba(239,68,68,0.04)',  border: 'rgba(239,68,68,0.15)', icon: '#ef4444', text: '#dc2626' }
                : { bg: 'rgba(245,158,11,0.04)', border: 'rgba(245,158,11,0.15)', icon: '#f59e0b', text: '#d97706' };
              return (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: palette.bg, borderRadius: 10, border: `1px solid ${palette.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {s.ok
                      ? <CheckCircle size={15} style={{ color: palette.icon }} />
                      : <AlertTriangle size={15} style={{ color: palette.icon }} />}
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#201b2e' }}>{s.label}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: palette.text, textTransform: 'capitalize' }}>{s.status}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Quick actions + Upcoming sessions row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
        {/* Quick actions */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Quick Actions</h2>
          </div>
          <div className={styles.quickGrid}>
            {[
              { label: 'Add Student',       color: '#9333ea', href: '/institution/users?create=student' },
              { label: 'Add Instructor',     color: '#10b981', href: '/institution/users?create=instructor' },
              { label: 'New Section',        color: '#f59e0b', href: '/institution/academic?tab=sections' },
              { label: 'Send Announcement',  color: '#7c3aed', href: '/institution/announcements' },
              { label: 'View Analytics',     color: '#9333ea', href: '/institution/analytics' },
              { label: 'Audit Log',          color: '#726a85', href: '/institution/audit-log' },
            ].map(({ label, color, href }) => (
              <button key={label} className={styles.quickBtn}
                style={{ borderColor: `${color}30` }}
                onClick={() => router.push(href)}>
                <span className={styles.quickDot} style={{ background: color }} />
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* Upcoming sessions */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Upcoming Sessions</h2>
            <button className={styles.refreshBtn} onClick={load}>
              <RefreshCw size={14} />
            </button>
          </div>

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : error ? (
            <div className={styles.errorState}>{error}</div>
          ) : !data?.upcoming_sessions?.length ? (
            <div className={styles.emptyState}>
              <Calendar size={32} strokeWidth={1.4} style={{ color: '#d8b4fe', marginBottom: 8 }} />
              <p>No scheduled sessions yet.</p>
              <button className={styles.btnPrimary} onClick={() => router.push('/institution/sessions')}>
                <Plus size={14} /> Schedule a Session
              </button>
            </div>
          ) : (
            <div className={styles.sessionList}>
              {data.upcoming_sessions.slice(0, 5).map((s) => (
                <div key={s.id} className={styles.sessionRow}>
                  <div className={styles.sessionIcon}>
                    <Radio size={16} strokeWidth={1.8} style={{ color: '#9333ea' }} />
                  </div>
                  <div className={styles.sessionInfo}>
                    <p className={styles.sessionTitle}>{s.title ?? 'Lab Session'}</p>
                    <p className={styles.sessionTime}>
                      {new Date(s.scheduled_at).toLocaleString('en-IN', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                  </div>
                  <span className={`${styles.sessionBadge} ${styles[`badge_${s.status}`]}`}>
                    {s.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </InstitutionShell>
  );
}
