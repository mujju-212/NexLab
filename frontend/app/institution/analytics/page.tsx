'use client';

/**
 * Institution Analytics — tabbed dashboard (B1–B9 + Instructors).
 * Tabs: Overview · Attendance · Grades · Integrity · Engagement · AI Usage · Instructors
 * All tabs share a common date-range/days filter.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import InstitutionShell from '@/components/layout/InstitutionShell';
import {
  institutionService,
  type AnalyticsOverview,
  type AtRiskStudent,
  type SectionComparison,
  type AttendanceSummary,
  type GradeDistribution,
  type ExperimentUsage,
  type AnalyticsTrend,
  type InstructorPerf,
  type ProctoringReport,
  type EngagementReport,
  type AIUsageReport,
} from '@/services/institution.service';
import {
  AlertTriangle, TrendingUp, Users, CheckCircle, Clock,
  BarChart2, ShieldAlert, Cpu, BookOpen, UserCheck,
  Download, RefreshCw, ChevronDown,
} from 'lucide-react';
import styles from '../dashboard/page.module.css';

// ── Types ────────────────────────────────────────────────────────────────────

type Tab =
  | 'overview'
  | 'attendance'
  | 'grades'
  | 'integrity'
  | 'engagement'
  | 'ai-usage'
  | 'instructors';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview',    label: 'Overview',    icon: <BarChart2  size={14}/> },
  { id: 'attendance',  label: 'Attendance',  icon: <UserCheck  size={14}/> },
  { id: 'grades',      label: 'Grades',      icon: <TrendingUp size={14}/> },
  { id: 'integrity',   label: 'Integrity',   icon: <ShieldAlert size={14}/> },
  { id: 'engagement',  label: 'Engagement',  icon: <Users      size={14}/> },
  { id: 'ai-usage',    label: 'AI Usage',    icon: <Cpu        size={14}/> },
  { id: 'instructors', label: 'Instructors', icon: <BookOpen   size={14}/> },
];

const DAYS_OPTIONS = [7, 14, 30, 60, 90];

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(n: number | null | undefined, total: number): string {
  if (n == null || total === 0) return '—';
  return `${Math.round((n / total) * 100)}%`;
}
function fmt(n: number | null | undefined, decimals = 1): string {
  if (n == null) return '—';
  return typeof n === 'number' ? n.toFixed(decimals) : '—';
}
function scoreColor(v: number | null | undefined): string {
  if (v == null) return '#9891a6';
  if (v >= 70) return '#22c55e';
  if (v >= 50) return '#eab308';
  return '#ef4444';
}

/** Export an array of objects to CSV and trigger browser download */
function exportCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const header = keys.join(',');
  const body = rows.map(r =>
    keys.map(k => {
      const v = r[k];
      let s = v == null ? '' : String(v);
      // Neutralise Excel formula injection + quote commas/quotes
      if (/^[=+\-@]/.test(s)) s = `'${s}`;
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')
  ).join('\n');
  // UTF-8 BOM so non-ASCII names survive Excel
  const blob = new Blob(['\ufeff' + header + '\n' + body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, note, color }: {
  label: string; value: string | number; note?: string; color?: string;
}) {
  return (
    <div className={styles.analyticsCard}>
      <p className={styles.analyticsValue} style={color ? { color } : undefined}>{value}</p>
      <p className={styles.analyticsLabel}>{label}</p>
      {note && <p className={styles.analyticsNote}>{note}</p>}
    </div>
  );
}

function MiniBar({ value, max, color = '#9333ea' }: { value: number; max: number; color?: string }) {
  const w = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className={styles.progressBar} style={{ flex: 1 }}>
      <div
        className={styles.progressFill}
        style={{ width: `${w}%`, background: color }}
      />
    </div>
  );
}

function EmptyState({ message = 'No data for the selected period.' }: { message?: string }) {
  return (
    <div className={styles.emptyState} style={{ padding: 48, textAlign: 'center', color: '#9891a6' }}>
      <p>{message}</p>
    </div>
  );
}

function LoadingRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} style={{ textAlign: 'center', color: '#9891a6', padding: 32 }}>
        Loading…
      </td>
    </tr>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [tab, setTab]   = useState<Tab>('overview');
  const [days, setDays] = useState(30);

  // Per-tab data
  const [overview,    setOverview]    = useState<AnalyticsOverview | null>(null);
  const [atRisk,      setAtRisk]      = useState<AtRiskStudent[]>([]);
  const [sections,    setSections]    = useState<SectionComparison[]>([]);
  const [attendance,  setAttendance]  = useState<AttendanceSummary | null>(null);
  const [grades,      setGrades]      = useState<GradeDistribution | null>(null);
  const [experiments, setExperiments] = useState<ExperimentUsage | null>(null);
  const [trends,      setTrends]      = useState<AnalyticsTrend | null>(null);
  const [proctoring,  setProctoring]  = useState<ProctoringReport | null>(null);
  const [engagement,  setEngagement]  = useState<EngagementReport | null>(null);
  const [aiUsage,     setAiUsage]     = useState<AIUsageReport | null>(null);
  const [instructors, setInstructors] = useState<InstructorPerf[]>([]);

  const [loading, setLoading] = useState(false);
  const loadRef = useRef(0);

  const load = useCallback(async (t: Tab, d: number) => {
    const id = ++loadRef.current;
    setLoading(true);
    try {
      if (t === 'overview') {
        const [ov, ar, sc] = await Promise.allSettled([
          institutionService.getAnalyticsOverview(d),
          institutionService.getAtRiskStudents(),
          institutionService.getSectionComparison(),
        ]);
        if (id !== loadRef.current) return;
        if (ov.status === 'fulfilled') setOverview(ov.value);
        if (ar.status === 'fulfilled') setAtRisk(ar.value);
        if (sc.status === 'fulfilled') setSections(sc.value);
      } else if (t === 'attendance') {
        const r = await institutionService.getAnalyticsAttendance({ days: d });
        if (id !== loadRef.current) return;
        setAttendance(r);
      } else if (t === 'grades') {
        const [gr, ex, tr] = await Promise.allSettled([
          institutionService.getAnalyticsGrades({ days: d }),
          institutionService.getAnalyticsExperiments({ days: d }),
          institutionService.getAnalyticsTrends({ days: d, grain: 'week' }),
        ]);
        if (id !== loadRef.current) return;
        if (gr.status === 'fulfilled') setGrades(gr.value);
        if (ex.status === 'fulfilled') setExperiments(ex.value);
        if (tr.status === 'fulfilled') setTrends(tr.value);
      } else if (t === 'integrity') {
        const r = await institutionService.getAnalyticsProctoring({ days: d });
        if (id !== loadRef.current) return;
        setProctoring(r);
      } else if (t === 'engagement') {
        const r = await institutionService.getAnalyticsEngagement({ days: d });
        if (id !== loadRef.current) return;
        setEngagement(r);
      } else if (t === 'ai-usage') {
        const r = await institutionService.getAnalyticsAIUsage({ days: d });
        if (id !== loadRef.current) return;
        setAiUsage(r);
      } else if (t === 'instructors') {
        const r = await institutionService.getAnalyticsInstructors({ days: d });
        if (id !== loadRef.current) return;
        setInstructors(r.instructors);
      }
    } catch (e) {
      console.error('[analytics] load error', e);
    } finally {
      if (id === loadRef.current) setLoading(false);
    }
  }, []);

  // Load when tab or days changes
  useEffect(() => { load(tab, days); }, [tab, days, load]);

  // ── Toolbar ──────────────────────────────────────────────────────────────────

  const toolbar = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <Clock size={14} style={{ position: 'absolute', left: 10, color: '#9891a6', pointerEvents: 'none' }}/>
        <select
          value={days}
          onChange={e => setDays(Number(e.target.value))}
          style={{
            paddingLeft: 30, paddingRight: 28, paddingTop: 7, paddingBottom: 7,
            background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(147,51,234,0.2)',
            borderRadius: 8, fontSize: 13, color: '#201b2e', cursor: 'pointer',
            appearance: 'none',
          }}
        >
          {DAYS_OPTIONS.map(d => (
            <option key={d} value={d}>Last {d} days</option>
          ))}
        </select>
        <ChevronDown size={12} style={{ position: 'absolute', right: 9, color: '#9891a6', pointerEvents: 'none' }}/>
      </div>
      <button
        onClick={() => load(tab, days)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 14px', borderRadius: 8,
          background: 'rgba(147,51,234,0.08)', border: '1px solid rgba(147,51,234,0.2)',
          color: '#9333ea', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}
      >
        <RefreshCw size={13} style={loading ? { animation: 'spin 1s linear infinite' } : {}}/>
        Refresh
      </button>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <InstitutionShell
      activePage="Analytics"
      title="Analytics"
      subtitle={`Performance dashboard — last ${days} days`}
    >
      {/* Tabs + toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 4 }}>
        <div className={styles.tabs} style={{ flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
              onClick={() => setTab(t.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 5 }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        {toolbar}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── OVERVIEW ─────────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <>
          <div className={styles.analyticsGrid}>
            <StatCard label="Sessions this month" value={loading ? '—' : overview?.sessions.total ?? 0} />
            <StatCard
              label="Completion Rate"
              value={loading ? '—' : `${overview?.sessions.completion_rate_pct ?? 0}%`}
              note={`${overview?.sessions.completed ?? 0} completed`}
            />
            <StatCard label="Active Students" value={loading ? '—' : overview?.students.total ?? 0} />
            <StatCard
              label="At-Risk Students"
              value={loading ? '—' : overview?.students.at_risk ?? 0}
              note={`${overview?.students.at_risk_pct ?? 0}% of total`}
              color={(overview?.students.at_risk ?? 0) > 0 ? '#ef4444' : '#22c55e'}
            />
            <StatCard label="Active Instructors" value={loading ? '—' : overview?.instructors.active_this_period ?? 0} />
          </div>

          {/* Section comparison mini-bars */}
          {!loading && sections.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Section Performance</h2>
                <button
                  onClick={() => exportCSV(
                    sections.map(s => ({ section: s.section_name, enrolled: s.enrolled, avg_grade: s.avg_grade, graded_count: s.graded_count })),
                    'section-comparison.csv',
                  )}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, background: 'rgba(147,51,234,0.08)', border: '1px solid rgba(147,51,234,0.2)', color: '#9333ea', fontSize: 12, cursor: 'pointer' }}
                >
                  <Download size={12}/> CSV
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sections.map((sec, i) => {
                  const graded = sections.filter(s => s.avg_grade != null);
                  const maxGrade = Math.max(...graded.map(s => s.avg_grade!), 1);
                  const rank = graded.length
                    ? graded.slice().sort((a, b) => b.avg_grade! - a.avg_grade!).findIndex(s => s.section_id === sec.section_id) + 1
                    : 0;
                  return (
                  <div key={sec.section_id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: 'rgba(255,255,255,0.75)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.9)' }}>
                    <span style={{ width: 22, textAlign: 'center', fontSize: 13, fontWeight: 700, color: rank === 1 ? '#9333ea' : '#9891a6' }}>{sec.avg_grade != null ? `#${rank}` : '·'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#201b2e' }}>{sec.section_name}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: sec.avg_grade != null ? '#9333ea' : '#9891a6' }}>
                          {sec.avg_grade != null ? `${sec.avg_grade} avg` : 'No grades yet'}
                        </span>
                      </div>
                      {sec.avg_grade != null && (
                        <MiniBar value={sec.avg_grade} max={maxGrade} color={rank === 1 ? 'linear-gradient(90deg,#9333ea,#c084fc)' : 'linear-gradient(90deg,#d8b4fe,#e9d5ff)'} />
                      )}
                      <div style={{ fontSize: 12, color: '#9891a6', marginTop: 3 }}>
                        {sec.enrolled} enrolled · {sec.graded_count} graded
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Peak hours — backend stores UTC hours; convert to local for display */}
          {!loading && (overview?.peak_hours?.length ?? 0) > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHead}><h2 className={styles.sectionTitle}>Peak Usage Hours (your local time)</h2></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {overview!.peak_hours.map(ph => {
                  const utcHour = (ph.hour - Math.round(new Date().getTimezoneOffset() / 60 * -1) + 24) % 24;
                  return (
                  <div key={ph.hour} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: 'rgba(255,255,255,0.7)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.9)' }}>
                    <Clock size={16} style={{ color: '#9333ea', flexShrink: 0 }}/>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#201b2e', width: 100 }}>
                      {String(utcHour).padStart(2, '0')}:00 – {String((utcHour + 1) % 24).padStart(2, '0')}:00
                    </span>
                    <MiniBar value={ph.session_count} max={overview!.peak_hours[0].session_count}/>
                    <span style={{ fontSize: 13, color: '#726a85', fontWeight: 600 }}>{ph.session_count} sessions</span>
                  </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* At-risk students */}
          {!loading && atRisk.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Students at Risk <span style={{ fontSize: 13, color: '#ef4444', fontWeight: 600 }}>({atRisk.length})</span></h2>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Student</th><th>Roll No.</th><th>Avg Mastery</th><th>Concepts</th></tr></thead>
                  <tbody>
                    {atRisk.map(s => (
                      <tr key={s.student_id}>
                        <td>
                          <div style={{ fontWeight: 700, color: '#201b2e' }}>{s.full_name}</div>
                          <div style={{ fontSize: 12, color: '#9891a6' }}>{s.email}</div>
                        </td>
                        <td style={{ color: '#726a85' }}>{s.roll_number ?? '—'}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className={styles.progressBar} style={{ flex: 1, maxWidth: 80 }}>
                              <div className={styles.progressFill} style={{ width: `${s.avg_mastery}%`, background: s.avg_mastery < 20 ? '#ef4444' : s.avg_mastery < 35 ? '#f97316' : '#eab308' }}/>
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 700, color: s.avg_mastery < 20 ? '#ef4444' : '#f97316' }}>{s.avg_mastery}%</span>
                          </div>
                        </td>
                        <td style={{ color: '#726a85' }}>{s.concepts_tracked}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {/* ── ATTENDANCE ───────────────────────────────────────────────────────── */}
      {tab === 'attendance' && (
        <>
          <div className={styles.analyticsGrid}>
            <StatCard label="Total Sessions"          value={loading ? '—' : attendance?.total_sessions ?? 0} />
            <StatCard label="Avg Attendance Rate"     value={loading ? '—' : `${fmt(attendance?.avg_attendance_rate)}%`} />
            <StatCard label="Present Records"         value={loading ? '—' : attendance?.present_count ?? 0} />
            <StatCard label="Absent Records"          value={loading ? '—' : attendance?.absent_count ?? 0}
              color={(attendance?.absent_count ?? 0) > (attendance?.present_count ?? 0) ? '#ef4444' : undefined}
            />
          </div>

          {!loading && attendance?.by_session?.length ? (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Per-Session Attendance</h2>
                <button
                  onClick={() => exportCSV(attendance.by_session.map(r => ({ session: r.session_title, date: r.scheduled_at, total: r.total, present: r.present, rate: r.rate })), 'attendance.csv')}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, background: 'rgba(147,51,234,0.08)', border: '1px solid rgba(147,51,234,0.2)', color: '#9333ea', fontSize: 12, cursor: 'pointer' }}
                >
                  <Download size={12}/> CSV
                </button>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Session</th><th>Date</th><th>Total</th><th>Present</th><th>Rate</th></tr></thead>
                  <tbody>
                    {attendance.by_session.map(r => (
                      <tr key={r.session_id}>
                        <td style={{ fontWeight: 600 }}>{r.session_title || '(untitled)'}</td>
                        <td style={{ color: '#9891a6', fontSize: 12 }}>{new Date(r.scheduled_at).toLocaleDateString()}</td>
                        <td>{r.total}</td>
                        <td>{r.present}</td>
                        <td>
                          <span style={{ fontWeight: 700, color: scoreColor(r.rate) }}>{fmt(r.rate)}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : !loading ? <EmptyState/> : null}
        </>
      )}

      {/* ── GRADES ───────────────────────────────────────────────────────────── */}
      {tab === 'grades' && (
        <>
          <div className={styles.analyticsGrid}>
            <StatCard label="Total Grades Recorded"  value={loading ? '—' : grades?.total_grades ?? 0} />
            <StatCard label="Avg Score"               value={loading ? '—' : `${fmt(grades?.avg_score)}%`} />
            <StatCard label="Pass Rate"               value={loading ? '—' : `${fmt(grades?.pass_rate)}%`}
              color={scoreColor(grades?.pass_rate ?? null)}
            />
            <StatCard label="Experiments Run"         value={loading ? '—' : experiments?.total_experiments ?? 0} />
          </div>

          {/* Grade distribution */}
          {!loading && grades?.distribution?.length ? (
            <section className={styles.section}>
              <div className={styles.sectionHead}><h2 className={styles.sectionTitle}>Score Distribution</h2></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {grades.distribution.map(band => (
                  <div key={band.range} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ width: 80, fontSize: 13, color: '#726a85', fontWeight: 600 }}>{band.range}</span>
                    <MiniBar value={band.count} max={Math.max(...grades.distribution.map(b => b.count), 1)}/>
                    <span style={{ fontSize: 13, color: '#201b2e', fontWeight: 700, width: 40, textAlign: 'right' }}>{band.count}</span>
                    <span style={{ fontSize: 12, color: '#9891a6', width: 40 }}>{fmt(band.pct)}%</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Per-section grade table */}
          {!loading && grades?.by_section?.length ? (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>By Section</h2>
                <button
                  onClick={() => exportCSV(grades.by_section.map(s => ({ section: s.section_name, avg_score: s.avg_score, total: s.total })), 'grades-by-section.csv')}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, background: 'rgba(147,51,234,0.08)', border: '1px solid rgba(147,51,234,0.2)', color: '#9333ea', fontSize: 12, cursor: 'pointer' }}
                >
                  <Download size={12}/> CSV
                </button>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Section</th><th>Submissions</th><th>Avg Score</th></tr></thead>
                  <tbody>
                    {grades.by_section.map(s => (
                      <tr key={s.section_id}>
                        <td style={{ fontWeight: 600 }}>{s.section_name}</td>
                        <td>{s.total}</td>
                        <td><span style={{ fontWeight: 700, color: scoreColor(s.avg_score) }}>{fmt(s.avg_score)}%</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {/* Experiment usage */}
          {!loading && (experiments?.experiments?.length ?? 0) > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Experiment Usage</h2>
                <button
                  onClick={() => exportCSV(
                    experiments!.experiments.map(e => ({ title: e.title, subject: e.subject_name, times_used: e.times_used, avg_score: e.avg_score, avg_completion: e.avg_completion_pct })),
                    'experiment-usage.csv',
                  )}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, background: 'rgba(147,51,234,0.08)', border: '1px solid rgba(147,51,234,0.2)', color: '#9333ea', fontSize: 12, cursor: 'pointer' }}
                >
                  <Download size={12}/> CSV
                </button>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Experiment</th><th>Subject</th><th>Times Used</th><th>Avg Score</th><th>Avg Completion</th></tr></thead>
                  <tbody>
                    {experiments!.experiments.map(e => (
                      <tr key={e.experiment_id}>
                        <td style={{ fontWeight: 600 }}>{e.title}</td>
                        <td style={{ color: '#9891a6', fontSize: 12 }}>{e.subject_name}</td>
                        <td>{e.times_used}</td>
                        <td><span style={{ color: scoreColor(e.avg_score) }}>{fmt(e.avg_score)}%</span></td>
                        <td>{fmt(e.avg_completion_pct)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {/* ── INTEGRITY (Proctoring) ───────────────────────────────────────────── */}
      {tab === 'integrity' && (
        <>
          {/* Institution-wide event totals */}
          {!loading && proctoring && (
            <div className={styles.analyticsGrid}>
              <StatCard label="Tab Switches"       value={proctoring.proctor_event_totals?.tab_switch ?? 0} color={proctoring.proctor_event_totals?.tab_switch > 10 ? '#ef4444' : undefined}/>
              <StatCard label="Fullscreen Exits"   value={proctoring.proctor_event_totals?.fullscreen_exit ?? 0} color={proctoring.proctor_event_totals?.fullscreen_exit > 5 ? '#ef4444' : undefined}/>
              <StatCard label="Lockdown Violations" value={proctoring.proctor_event_totals?.lockdown_violation ?? 0} />
              <StatCard label="Screen Share Stops" value={proctoring.proctor_event_totals?.screen_share_stop ?? 0} />
              <StatCard label="Avg Focus Score"    value={loading ? '—' : `${fmt(proctoring.institution_avg?.focus_score)}`}
                color={scoreColor(proctoring.institution_avg?.focus_score ?? null)}
              />
            </div>
          )}

          {!loading && (proctoring?.at_risk_students?.length ?? 0) > 0 ? (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Integrity Risk Students</h2>
                <button
                  onClick={() => exportCSV(
                    proctoring!.at_risk_students.map(s => ({
                      name: s.full_name, roll: s.roll_number,
                      avg_focus: s.avg_focus_score,
                      tab_switch: s.proctor_events?.tab_switch ?? 0,
                      fullscreen_exit: s.proctor_events?.fullscreen_exit ?? 0,
                      lockdown_violation: s.proctor_events?.lockdown_violation ?? 0,
                    })),
                    'integrity-risk.csv',
                  )}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, background: 'rgba(147,51,234,0.08)', border: '1px solid rgba(147,51,234,0.2)', color: '#9333ea', fontSize: 12, cursor: 'pointer' }}
                >
                  <Download size={12}/> CSV
                </button>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Roll</th>
                      <th>Avg Focus</th>
                      <th>Tab Switches</th>
                      <th>Fullscreen Exits</th>
                      <th>Violations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? <LoadingRow cols={6}/> : proctoring!.at_risk_students.map(s => (
                      <tr key={s.student_id}>
                        <td style={{ fontWeight: 600 }}>{s.full_name ?? '—'}</td>
                        <td style={{ color: '#9891a6' }}>{s.roll_number ?? '—'}</td>
                        <td>
                          <span style={{ fontWeight: 700, color: scoreColor(s.avg_focus_score) }}>
                            {s.avg_focus_score != null ? fmt(s.avg_focus_score) : '—'}
                          </span>
                        </td>
                        <td>{s.proctor_events?.tab_switch ?? 0}</td>
                        <td>{s.proctor_events?.fullscreen_exit ?? 0}</td>
                        <td>{s.proctor_events?.lockdown_violation ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : !loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 24, color: '#22c55e', fontWeight: 600 }}>
              <CheckCircle size={20}/> No integrity issues detected for this period.
            </div>
          ) : <EmptyState message="Loading…"/>}
        </>
      )}

      {/* ── ENGAGEMENT ───────────────────────────────────────────────────────── */}
      {tab === 'engagement' && (
        <>
          <div className={styles.analyticsGrid}>
            <StatCard label="Total Students"   value={loading ? '—' : engagement?.total_students ?? 0} />
            <StatCard label="Active Students"  value={loading ? '—' : engagement?.active_students ?? 0}  color="#22c55e"/>
            <StatCard label="Dormant Students" value={loading ? '—' : engagement?.dormant_students ?? 0} color={(engagement?.dormant_students ?? 0) > 0 ? '#eab308' : undefined}/>
            <StatCard label="At-Risk Students" value={loading ? '—' : engagement?.at_risk_count ?? 0}    color={(engagement?.at_risk_count ?? 0) > 0 ? '#ef4444' : undefined}/>
            <StatCard label="Engagement Rate"  value={loading ? '—' : `${fmt(engagement?.engagement_rate)}%`}
              color={scoreColor(engagement?.engagement_rate ?? null)}
            />
          </div>

          {!loading && (engagement?.at_risk_students?.length ?? 0) > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Low-Engagement Students</h2>
                <button
                  onClick={() => exportCSV(
                    engagement!.at_risk_students.map(s => ({
                      name: s.full_name, roll: s.roll_number,
                      sessions_attended: s.sessions_attended,
                      time_min: s.total_time_minutes,
                      avg_score: s.avg_score,
                      mastery: s.concept_mastery,
                    })),
                    'low-engagement.csv',
                  )}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, background: 'rgba(147,51,234,0.08)', border: '1px solid rgba(147,51,234,0.2)', color: '#9333ea', fontSize: 12, cursor: 'pointer' }}
                >
                  <Download size={12}/> CSV
                </button>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Student</th><th>Sessions</th><th>Time (min)</th><th>Avg Score</th><th>Mastery</th><th>Focus</th></tr></thead>
                  <tbody>
                    {engagement!.at_risk_students.map(s => (
                      <tr key={s.student_id}>
                        <td>
                          <div style={{ fontWeight: 700 }}>{s.full_name ?? '—'}</div>
                          <div style={{ fontSize: 12, color: '#9891a6' }}>{s.roll_number ?? ''}</div>
                        </td>
                        <td>{s.sessions_attended}</td>
                        <td>{s.total_time_minutes}</td>
                        <td><span style={{ color: scoreColor(s.avg_score) }}>{fmt(s.avg_score)}%</span></td>
                        <td><span style={{ color: scoreColor(s.concept_mastery) }}>{fmt(s.concept_mastery)}%</span></td>
                        <td><span style={{ color: scoreColor(s.focus_score) }}>{fmt(s.focus_score)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {!loading && (engagement?.at_risk_students?.length ?? 0) === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 24, color: '#22c55e', fontWeight: 600 }}>
              <CheckCircle size={20}/> All students are actively engaged this period.
            </div>
          )}
        </>
      )}

      {/* ── AI USAGE ─────────────────────────────────────────────────────────── */}
      {tab === 'ai-usage' && (
        <>
          <div className={styles.analyticsGrid}>
            <StatCard label="Total AI Calls"     value={loading ? '—' : aiUsage?.total_calls ?? 0} />
            <StatCard label="Total Tokens Used"  value={loading ? '—' : (aiUsage?.total_tokens ?? 0).toLocaleString()} />
            <StatCard label="Student Tokens"     value={loading ? '—' : (aiUsage?.top_consumers ?? []).filter(u => u.role === 'student').reduce((a, u) => a + u.tokens, 0).toLocaleString()} note="students' share of usage" />
            <StatCard label="Instructor Tokens"  value={loading ? '—' : (aiUsage?.top_consumers ?? []).filter(u => u.role !== 'student').reduce((a, u) => a + u.tokens, 0).toLocaleString()} note="staff share of usage" />
            <StatCard label="Features Active"    value={loading ? '—' : Object.keys(aiUsage?.by_feature ?? {}).length} />
          </div>

          {!loading && aiUsage && Object.keys(aiUsage.by_feature).length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Usage by Feature</h2>
                <button
                  onClick={() => exportCSV(
                    Object.entries(aiUsage.by_feature).map(([feat, d]) => ({ feature: feat, calls: d.calls, tokens: d.tokens })),
                    'ai-usage-features.csv',
                  )}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, background: 'rgba(147,51,234,0.08)', border: '1px solid rgba(147,51,234,0.2)', color: '#9333ea', fontSize: 12, cursor: 'pointer' }}
                >
                  <Download size={12}/> CSV
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.entries(aiUsage.by_feature)
                  .sort((a, b) => b[1].calls - a[1].calls)
                  .map(([feat, d]) => (
                  <div key={feat} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: 'rgba(255,255,255,0.75)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.9)' }}>
                    <Cpu size={14} style={{ color: '#9333ea', flexShrink: 0 }}/>
                    <span style={{ width: 160, fontSize: 13, fontWeight: 600, color: '#201b2e' }}>{feat.replace(/_/g, ' ')}</span>
                    <MiniBar value={d.calls} max={Math.max(...Object.values(aiUsage.by_feature).map(x => x.calls), 1)}/>
                    <span style={{ fontSize: 13, color: '#726a85', width: 60, textAlign: 'right' }}>{d.calls} calls</span>
                    <span style={{ fontSize: 12, color: '#9891a6', width: 80, textAlign: 'right' }}>{d.tokens.toLocaleString()} tok</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {!loading && (aiUsage?.top_consumers?.length ?? 0) > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Top Consumers</h2>
                <button
                  onClick={() => exportCSV(
                    aiUsage!.top_consumers.map(u => ({ name: u.full_name, role: u.role, calls: u.calls, tokens: u.tokens })),
                    'ai-usage-consumers.csv',
                  )}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, background: 'rgba(147,51,234,0.08)', border: '1px solid rgba(147,51,234,0.2)', color: '#9333ea', fontSize: 12, cursor: 'pointer' }}
                >
                  <Download size={12}/> CSV
                </button>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>User</th><th>Role</th><th>Calls</th><th>Tokens</th></tr></thead>
                  <tbody>
                    {aiUsage!.top_consumers.map(u => (
                      <tr key={u.user_id}>
                        <td style={{ fontWeight: 600 }}>{u.full_name ?? '—'}</td>
                        <td style={{ color: '#9891a6', textTransform: 'capitalize' }}>{u.role}</td>
                        <td>{u.calls}</td>
                        <td>{u.tokens.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {!loading && aiUsage?.total_calls === 0 && (
            <EmptyState message="No AI usage recorded yet. Enable AI features in Settings → AI & Policy."/>
          )}
        </>
      )}

      {/* ── INSTRUCTORS ──────────────────────────────────────────────────────── */}
      {tab === 'instructors' && (
        <>
          <div className={styles.analyticsGrid}>
            <StatCard label="Total Instructors" value={loading ? '—' : instructors.length} />
            <StatCard label="Sessions Run" value={loading ? '—' : instructors.reduce((s, i) => s + i.sessions_run, 0)} />
          </div>

          {!loading && instructors.length > 0 ? (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Instructor Performance</h2>
                <button
                  onClick={() => exportCSV(
                    instructors.map(i => ({
                      name: i.full_name, email: i.email,
                      sessions: i.sessions_run, subjects: i.subjects_count, sections: i.sections_count,
                      avg_attendance: i.avg_attendance, avg_grade: i.avg_final_grade,
                      avg_focus: i.avg_focus_score, avg_feedback: i.avg_feedback,
                    })),
                    'instructor-performance.csv',
                  )}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, background: 'rgba(147,51,234,0.08)', border: '1px solid rgba(147,51,234,0.2)', color: '#9333ea', fontSize: 12, cursor: 'pointer' }}
                >
                  <Download size={12}/> CSV
                </button>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Instructor</th>
                      <th>Sessions</th>
                      <th>Subjects</th>
                      <th>Sections</th>
                      <th>Avg Attendance</th>
                      <th>Avg Grade</th>
                      <th>Avg Focus</th>
                      <th>Feedback</th>
                    </tr>
                  </thead>
                  <tbody>
                    {instructors.map(instr => (
                      <tr key={instr.instructor_id}>
                        <td>
                          <div style={{ fontWeight: 700 }}>{instr.full_name}</div>
                          <div style={{ fontSize: 11, color: '#9891a6' }}>{instr.email}</div>
                        </td>
                        <td style={{ fontWeight: 700 }}>{instr.sessions_run}</td>
                        <td>{instr.subjects_count}</td>
                        <td>{instr.sections_count}</td>
                        <td>
                          <span style={{ color: scoreColor(instr.avg_attendance) }}>
                            {instr.avg_attendance != null ? `${fmt(instr.avg_attendance)}%` : '—'}
                          </span>
                        </td>
                        <td>
                          <span style={{ color: scoreColor(instr.avg_final_grade) }}>
                            {instr.avg_final_grade != null ? `${fmt(instr.avg_final_grade)}%` : '—'}
                          </span>
                        </td>
                        <td>
                          <span style={{ color: scoreColor(instr.avg_focus_score) }}>
                            {instr.avg_focus_score != null ? fmt(instr.avg_focus_score) : '—'}
                          </span>
                        </td>
                        <td>
                          {instr.avg_feedback != null ? (
                            <span style={{ color: scoreColor((instr.avg_feedback / 5) * 100) }}>
                              {fmt(instr.avg_feedback, 2)} / 5
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : !loading ? <EmptyState message="No instructor data for this period."/> : <EmptyState message="Loading…"/>}
        </>
      )}

    </InstitutionShell>
  );
}
