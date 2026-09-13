'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import { experienceService } from '@/services/experience.service';
import { sessionService } from '@/services/session.service';
import styles from '../shared.module.css';

import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid, Cell, PieChart, Pie,
} from 'recharts';

interface SectionLite { section_subject_id: string; subject_name: string; section_name: string; student_count: number; }

const TABS = [
  { key: 'experiments', label: 'Experiments', icon: '📊' },
  { key: 'trajectory',  label: 'Trajectory',  icon: '📈' },
  { key: 'trends',      label: 'Trends',      icon: '📉' },
  { key: 'engagement',  label: 'Engagement',  icon: '⚡' },
  { key: 'integrity',   label: 'Integrity',   icon: '🛡' },
  { key: 'ai-usage',    label: 'AI Usage',    icon: '🤖' },
];

const errText = (err: unknown) =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Something went wrong';

export default function InstructorAnalyticsPage() {
  const [tab, setTab] = useState('experiments');
  const [sections, setSections] = useState<SectionLite[]>([]);
  const [ssId, setSsId] = useState('');

  const [exps, setExps] = useState<any[]>([]);
  const [trends, setTrends] = useState<any[]>([]);
  const [engagement, setEngagement] = useState<any[]>([]);
  const [integrity, setIntegrity] = useState<any[]>([]);
  const [aiUsage, setAiUsage] = useState<any[]>([]);
  const [byFeature, setByFeature] = useState<{ feature: string; count: number }[]>([]);

  const [trajectory, setTrajectory] = useState<any | null>(null);
  const [trajectoryStudent, setTrajectoryStudent] = useState('');
  const [roster, setRoster] = useState<{ student_id: string; full_name: string }[]>([]);

  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [mounted, setMounted] = useState(false);

  const toast3 = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); }, []);

  // Trajectory: load roster for the student picker — lightweight /roster endpoint
  const loadRoster = useCallback(async () => {
    try {
      const data = await experienceService.analyticsRoster();
      const r = (data.roster || []).map(x => ({
        student_id: x.student_id,
        full_name: `${x.full_name}${x.roll_number ? ` (${x.roll_number})` : ''}`,
      }));
      setRoster(r);
      return r;
    } catch { return []; }
  }, []);

  const pickTrajectoryStudent = useCallback(async (sid: string) => {
    setTrajectoryStudent(sid);
    if (!sid) { setTrajectory(null); return; }
    setLoading(true);
    try { setTrajectory(await experienceService.analyticsTrajectory(sid)); }
    catch (e: any) { toast3(errText(e)); } finally { setLoading(false); }
  }, [toast3]);

  // Load sections for filter & roster on mount
  useEffect(() => {
    setMounted(true);
    sessionService.getSectionSubjects().then(res => {
      const list = (res.section_subjects ?? []) as SectionLite[];
      setSections(list);
      if (list.length === 1) setSsId(list[0].section_subject_id);
    }).catch(() => {});
    loadRoster().then(r => {
      if (r.length > 0) {
        pickTrajectoryStudent(r[0].student_id);
      }
    });
  }, [loadRoster, pickTrajectoryStudent]);

  const params = () => (ssId ? { section_subject_id: ssId } : {});

  // Load per-tab data
  const loadExperiments = useCallback(async () => {
    setLoading(true);
    try { setExps(await experienceService.analyticsExperiments()); }
    catch (e: any) { toast3(errText(e)); } finally { setLoading(false); }
  }, [toast3]);

  const loadTrends = useCallback(async () => {
    setLoading(true);
    try { setTrends(await experienceService.analyticsTrends(params())); }
    catch (e: any) { toast3(errText(e)); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ssId, toast3]);

  const loadEngagement = useCallback(async () => {
    setLoading(true);
    try { setEngagement(await experienceService.analyticsEngagement(params())); }
    catch (e: any) { toast3(errText(e)); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ssId, toast3]);

  const loadIntegrity = useCallback(async () => {
    setLoading(true);
    try { const d = await experienceService.analyticsIntegrity(params()); setIntegrity(d.integrity); }
    catch (e: any) { toast3(errText(e)); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ssId, toast3]);

  const loadAiUsage = useCallback(async () => {
    setLoading(true);
    try { const d = await experienceService.analyticsAiUsage(params()); setAiUsage(d.ai_usage); setByFeature(d.by_feature); }
    catch (e: any) { toast3(errText(e)); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ssId, toast3]);

  useEffect(() => {
    if (tab === 'experiments') loadExperiments();
    if (tab === 'trends') loadTrends();
    if (tab === 'engagement') loadEngagement();
    if (tab === 'integrity') loadIntegrity();
    if (tab === 'ai-usage') loadAiUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, ssId]);


  // Quality donut data — memoized, only recomputed when experiments change
  const qualityDonut = useMemo(() => {
    const q: Record<string, number> = {};
    exps.forEach(e => Object.entries(e.quality_distribution || {}).forEach(([k, v]) => { q[k] = (q[k] || 0) + (v as number); }));
    return Object.entries(q).map(([name, value]) => ({ name, value }));
  }, [exps]);

  const COLORS = ['#7c3aed', '#9333ea', '#f59e0b', '#10b981', '#ef4444', '#3b82f6'];

  return (
    <InstructorShell activePage="Analytics">
      {toast && <div style={{ position: 'fixed', top: 18, right: 18, zIndex: 999, background: '#111827', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13 }}>{toast}</div>}

      <div className={styles.actionRow}>
        <h2 style={{ margin: 0, fontFamily: "'Geist',sans-serif", fontSize: 18, fontWeight: 700, color: '#111827', flex: 1 }}>Analytics</h2>
        <select className={styles.select} value={ssId} onChange={e => setSsId(e.target.value)}
          style={{ width: 'auto', minWidth: 200 }}>
          <option value="">All my sections</option>
          {sections.map(s => (
            <option key={s.section_subject_id} value={s.section_subject_id}>
              {s.subject_name} · {s.section_name}
            </option>
          ))}
        </select>
      </div>

      {/* Tab row */}
      <div className={styles.tabRow}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`${styles.tabChip} ${tab === t.key ? styles.tabChipActive : ''}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign: 'center', color: '#9891a6', padding: 30 }}><Loader2 size={20} className="animate-spin" /></div>}

      {/* ══ TAB A — Experiments ═══════════════════════════════════════════════ */}
      {tab === 'experiments' && !loading && (
        <div className={styles.gridTwo}>
          <div className={styles.sectionCard}>
            <h3 className={styles.sectionTitle}>Average Score by Experiment</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={exps}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0edf7" />
                <XAxis dataKey="exp_number" label={{ value: 'Experiment', position: 'insideBottom', fontSize: 11 }} />
                <YAxis domain={[0, 100]} width={32} />
                <Tooltip />
                <Bar dataKey="avg_score" name="Avg Score" fill="#7c3aed" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className={styles.sectionCard}>
            <h3 className={styles.sectionTitle}>Quality Distribution</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={qualityDonut} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                  {qualityDonut.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className={styles.tableCard} style={{ gridColumn: '1 / -1' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th><th>Title</th><th>Difficulty</th><th>Avg Score</th>
                  <th>Test Pass</th><th>Completion</th><th>Avg Attempts</th><th>Hint/Student</th>
                </tr>
              </thead>
              <tbody>
                {exps.map(e => (
                  <tr key={e.experiment_id}>
                    <td className={styles.tdStrong}>{e.exp_number}</td>
                    <td>{e.title}</td>
                    <td>{'⭐'.repeat(e.difficulty || 1)}</td>
                    <td className={styles.tdStrong}>{e.avg_score ?? '—'}</td>
                    <td>{e.avg_tc_score ?? '—'}%</td>
                    <td>{e.completion_pct ?? '—'}%</td>
                    <td>{e.avg_attempts}</td>
                    <td>{e.hint_usage_per_student}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ TAB B — Trajectory ═══════════════════════════════════════════════ */}
      {tab === 'trajectory' && !loading && (
        <div className={styles.sectionCard}>
          <div className={styles.actionRow}>
            <h3 className={styles.sectionTitle} style={{ flex: 1 }}>Student Trajectory</h3>
            <button className={styles.ghostBtn} onClick={loadRoster}>Load students</button>
            <select className={styles.select} value={trajectoryStudent} onChange={e => pickTrajectoryStudent(e.target.value)}
              style={{ width: 'auto', minWidth: 220 }}>
              <option value="">Select a student…</option>
              {roster.map(r => <option key={r.student_id} value={r.student_id}>{r.full_name}</option>)}
            </select>
          </div>

          {!trajectory && <div style={{ color: '#9891a6', padding: 30, textAlign: 'center' }}>Select a student to view their trajectory.</div>}

          {trajectory && (
            <div className={styles.gridTwo}>
              <div className={styles.sectionCard}>
                <h3 className={styles.sectionTitle}>Grade Over Time</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={trajectory.grade_timeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0edf7" />
                    <XAxis dataKey="scheduled_at" tickFormatter={(v: string) => v ? v.slice(5, 10) : ''} fontSize={10} />
                    <YAxis domain={[0, 100]} width={32} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="final_grade" name="Student" stroke="#7c3aed" strokeWidth={2} />
                    <Line type="monotone" dataKey="class_avg" name="Class avg" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className={styles.sectionCard}>
                <h3 className={styles.sectionTitle}>Concept Mastery</h3>
                {trajectory.concepts.length === 0 ? (
                  <div style={{ color: '#9891a6', padding: 20, textAlign: 'center' }}>No concept mastery data yet.</div>
                ) : (
                  <div className={styles.list}>
                    {trajectory.concepts.map((c: any) => (
                      <div key={c.concept} className={styles.listRow}>
                        <div className={styles.rowBody}>
                          <div className={styles.rowTitle}>{c.concept}</div>
                          <div style={{ height: 6, background: '#f3f4f6', borderRadius: 3, marginTop: 6 }}>
                            <div style={{ width: `${c.mastery_score}%`, height: '100%', borderRadius: 3,
                              background: c.mastery_score >= 75 ? '#22c55e' : c.mastery_score >= 50 ? '#f59e0b' : '#ef4444' }} />
                          </div>
                        </div>
                        <div className={styles.rowSide}><span className={styles.tdStrong}>{c.mastery_score}%</span></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ TAB C — Trends ═══════════════════════════════════════════════════ */}
      {tab === 'trends' && !loading && (
        <div className={styles.sectionCard}>
          <h3 className={styles.sectionTitle}>Class Trends Over Time</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0edf7" />
              <XAxis dataKey="week" fontSize={10} />
              <YAxis domain={[0, 100]} width={32} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="avg_score" name="Avg Score" stroke="#7c3aed" strokeWidth={2} />
              <Line type="monotone" dataKey="avg_attendance" name="Attendance" stroke="#10b981" strokeWidth={2} />
              <Line type="monotone" dataKey="avg_focus" name="Focus" stroke="#f59e0b" strokeWidth={2} />
              <Line type="monotone" dataKey="avg_completion" name="Completion" stroke="#3b82f6" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
          {trends.length === 0 && <div style={{ color: '#9891a6', textAlign: 'center', padding: 20 }}>No sessions in range yet.</div>}
        </div>
      )}

      {/* ══ TAB D — Engagement ═══════════════════════════════════════════════ */}
      {tab === 'engagement' && !loading && (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Student</th><th>Avg Focus</th><th>Attempts</th><th>Time on task (s)</th>
                <th>Hint Reliance</th><th>Auto-save ratio</th>
              </tr>
            </thead>
            <tbody>
              {engagement.map(r => (
                <tr key={r.student_id}>
                  <td className={styles.tdStrong}>{r.full_name}</td>
                  <td><span className={r.avg_focus_score !== null && r.avg_focus_score < 40 ? styles.redBadge : styles.greenBadge}>{r.avg_focus_score ?? '—'}%</span></td>
                  <td>{r.attempt_count}</td>
                  <td>{r.time_on_task_sec}</td>
                  <td>{r.hint_reliance}</td>
                  <td>{r.auto_save_ratio}</td>
                </tr>
              ))}
              {engagement.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9891a6', padding: 24 }}>No engagement data yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ══ TAB E — Integrity ════════════════════════════════════════════════ */}
      {tab === 'integrity' && !loading && (
        <div className={styles.sectionCard}>
          <h3 className={styles.sectionTitle}>Integrity Overview</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={integrity}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0edf7" />
              <XAxis dataKey="full_name" fontSize={9} />
              <YAxis domain={[0, 100]} width={32} />
              <Tooltip />
              <Bar dataKey="integrity_score" name="Integrity" radius={[6, 6, 0, 0]}>
                {integrity.map((r, i) => <Cell key={i} fill={r.integrity_score >= 80 ? '#22c55e' : r.integrity_score >= 60 ? '#f59e0b' : '#ef4444'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <table className={styles.table} style={{ marginTop: 16 }}>
            <thead>
              <tr><th>Student</th><th>Score</th><th>Tab</th><th>Fullscreen</th><th>Copy</th><th>Lockdown</th><th>Plagiarism</th></tr>
            </thead>
            <tbody>
              {integrity.map(r => (
                <tr key={r.student_id}>
                  <td className={styles.tdStrong}>{r.full_name}</td>
                  <td><span className={r.integrity_score >= 80 ? styles.greenBadge : r.integrity_score >= 60 ? styles.amberBadge : styles.redBadge}>{r.integrity_score}</span></td>
                  <td>{r.proctor_events.tab_switch}</td>
                  <td>{r.proctor_events.fullscreen_exit}</td>
                  <td>{r.proctor_events.copy_paste}</td>
                  <td>{r.proctor_events.lockdown_violation}</td>
                  <td>{r.plagiarism_flags.length > 0 ? <span className={styles.redBadge}>{r.plagiarism_flags.length}</span> : <span className={styles.slateBadge}>0</span>}</td>
                </tr>
              ))}
              {integrity.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9891a6', padding: 24 }}>No integrity data yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ══ TAB F — AI Usage ═════════════════════════════════════════════════ */}
      {tab === 'ai-usage' && !loading && (
        <div className={styles.gridTwo}>
          <div className={styles.sectionCard}>
            <h3 className={styles.sectionTitle}>AI Calls by Feature</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byFeature}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0edf7" />
                <XAxis dataKey="feature" fontSize={10} />
                <YAxis width={32} />
                <Tooltip />
                <Bar dataKey="count" name="Calls" fill="#9333ea" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className={styles.sectionCard}>
            <h3 className={styles.sectionTitle}>Top AI Consumers</h3>
            <table className={styles.table}>
              <thead><tr><th>Student</th><th>Tokens</th><th>Cost (USD)</th><th>Feature Calls</th></tr></thead>
              <tbody>
                {aiUsage.slice(0, 15).map(r => (
                  <tr key={r.student_id}>
                    <td className={styles.tdStrong}>{r.full_name || 'Unknown'}</td>
                    <td>{r.total_tokens.toLocaleString()}</td>
                    <td>{r.estimated_cost_usd.toFixed(4)}</td>
                    <td>{r.total_calls}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </InstructorShell>
  );
}
