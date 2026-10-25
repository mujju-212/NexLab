'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminShell from '@/components/layout/AdminShell';
import {
  Loader2, RefreshCw, Plus, BookOpen, ChevronRight, ChevronLeft, Trash2,
  Pencil, Globe, GlobeLock, Search, X, Check,
} from 'lucide-react';
import {
  adminContentService,
  type AdminPlatformCourse, type AdminPlatformExercise, type AdminProblemBankRow,
} from '@/services/admin.service';
import styles from '../users/page.module.css';

type Tab = 'courses' | 'problems';
const PROBLEM_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'no_tests', label: 'Missing test cases' },
  { key: 'disabled', label: 'Disabled' },
  { key: 'zero_solves', label: 'No solves yet' },
];

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function ContentPage() {
  const [tab, setTab] = useState<Tab>('courses');

  // courses
  const [courses, setCourses] = useState<AdminPlatformCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exercises, setExercises] = useState<Record<string, AdminPlatformExercise[]>>({});
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', slug: '', difficulty: 'beginner', language: 'python', description: '' });
  const [showExForm, setShowExForm] = useState<string | null>(null);
  const [exForm, setExForm] = useState({ title: '', exercise_type: 'coding', difficulty: 'easy', xp_reward: 10 });

  // problems
  const [pFilter, setPFilter] = useState('all');
  const [pPage, setPPage] = useState(1);
  const [pPages, setPPages] = useState(1);
  const [pTotal, setPTotal] = useState(0);
  const [pSummary, setPSummary] = useState<{ no_test_cases: number; disabled: number; total: number } | null>(null);
  const [problems, setProblems] = useState<AdminProblemBankRow[]>([]);
  const [pLoading, setPLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminContentService.listCourses();
      setCourses(res.courses || []);
    } catch {
      setError('Could not load platform courses.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (tab !== 'problems') return;
    (async () => {
      setPLoading(true);
      try {
        const res = await adminContentService.listProblems(pFilter, pPage);
        setProblems(res.problems || []);
        setPTotal(res.total);
        setPPages(res.pages || 1);
        setPSummary(res.summary);
      } catch { setProblems([]); }
      finally { setPLoading(false); }
    })();
  }, [tab, pFilter, pPage]);

  const act = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    try { await fn(); setNotice(done); await load(); }
    catch (e) { setNotice((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Action failed.'); }
    finally { setBusy(false); }
  };

  const openExercises = async (courseId: string) => {
    if (expanded === courseId) { setExpanded(null); return; }
    setExpanded(courseId);
    if (!exercises[courseId]) {
      try {
        const res = await adminContentService.listExercises(courseId);
        setExercises((p) => ({ ...p, [courseId]: res.exercises || [] }));
      } catch { setExercises((p) => ({ ...p, [courseId]: [] })); }
    }
  };

  return (
    <AdminShell activePage="Content" title="Content" subtitle="Platform courses, exercises and the problem bank — the learner-facing catalog under your control.">
      {notice && (
        <div style={{ margin: '0 0 14px', padding: '12px 16px', borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#15803d' }}><X size={14} /></button>
        </div>
      )}
      {error && (
        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '0 0 14px', padding: '12px 16px', borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>
          <span>{error}</span>
          <button onClick={load} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', fontWeight: 700, cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      <div className={styles.toolBar}>
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === 'courses' ? styles.tabActive : ''}`} onClick={() => setTab('courses')}>Platform Courses</button>
          <button className={`${styles.tab} ${tab === 'problems' ? styles.tabActive : ''}`} onClick={() => setTab('problems')}>Problem Bank</button>
        </div>
        {tab === 'courses' && (
          <div className={styles.toolRight}>
            <button className={styles.btnSecondary} onClick={load}><RefreshCw size={14} /> Refresh</button>
            <button className={styles.btnPrimary} onClick={() => { setForm({ title: '', slug: '', difficulty: 'beginner', language: 'python', description: '' }); setShowCreate(true); }}>
              <Plus size={14} /> New course
            </button>
          </div>
        )}
      </div>

      {/* ── courses ── */}
      {tab === 'courses' && (
        <div className={styles.tableWrap}>
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b', fontWeight: 600, display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
              <Loader2 size={16} className="spin" /> Loading courses…
            </div>
          ) : courses.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#9891a6', fontWeight: 600 }}>
              <BookOpen size={22} style={{ marginBottom: 8, opacity: .5 }} /><br />No platform courses yet.
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr><th>Course</th><th>Difficulty</th><th>Exercises</th><th>Solves</th><th>State</th><th>Created</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
              </thead>
              <tbody>
                {courses.map(c => (
                  <>
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontWeight: 700, color: '#201b2e', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => openExercises(c.id)}>
                          <ChevronRight size={13} style={{ transform: expanded === c.id ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
                          {c.title}
                        </div>
                        <div style={{ fontSize: 12, color: '#9891a6', fontWeight: 600 }}>{c.slug}</div>
                      </td>
                      <td>{c.difficulty}</td>
                      <td>{c.exercise_count}</td>
                      <td>{c.solves_count}</td>
                      <td>
                        <span style={{ fontWeight: 700, fontSize: 12, color: c.is_published ? '#15803d' : '#b45309' }}>
                          ● {c.is_published ? 'published' : 'draft'}
                        </span>
                      </td>
                      <td>{fmtDate(c.created_at)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button title={c.is_published ? 'Unpublish' : 'Publish'} disabled={busy} onClick={() => act(() => adminContentService.updateCourse(c.id, { is_published: !c.is_published }).then(() => {}), c.is_published ? 'Course unpublished.' : 'Course published.')} style={{ border: 'none', cursor: 'pointer', borderRadius: 8, padding: '6px 8px', background: c.is_published ? '#fef3c7' : '#dcfce7', color: c.is_published ? '#b45309' : '#15803d' }}>
                            {c.is_published ? <GlobeLock size={13} /> : <Globe size={13} />}
                          </button>
                          <button title="Add exercise" onClick={() => { setExForm({ title: '', exercise_type: 'coding', difficulty: 'easy', xp_reward: 10 }); setShowExForm(c.id); }} style={{ border: 'none', cursor: 'pointer', borderRadius: 8, padding: '6px 8px', background: '#e0e7ff', color: '#4338ca' }}>
                            <Plus size={13} />
                          </button>
                          <button title="Delete" disabled={busy} onClick={() => {
                            if (window.confirm(`Delete course "${c.title}"? Blocked if learners have progress.`)) {
                              act(() => adminContentService.deleteCourse(c.id).then(() => {}), 'Course deleted.');
                            }
                          }} style={{ border: 'none', cursor: 'pointer', borderRadius: 8, padding: '6px 8px', background: '#fee2e2', color: '#b91c1c' }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded === c.id && (
                      <tr key={`${c.id}-ex`}>
                        <td colSpan={7} style={{ background: 'rgba(255,255,255,.35)' }}>
                          <div style={{ padding: '4px 10px' }}>
                            <strong style={{ fontSize: 12.5, color: '#463f57' }}>Exercises</strong>
                            {(exercises[c.id] || []).map(e => (
                              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,.7)', fontSize: 13 }}>
                                <span style={{ fontWeight: 700, color: '#201b2e', flex: 1 }}>{e.title}</span>
                                <span style={{ color: '#64748b', fontSize: 12 }}>{e.exercise_type} · {e.difficulty} · {e.xp_reward} XP · {e.test_case_count} cases · {e.solves_count} solves</span>
                                <button title="Delete exercise" onClick={() => {
                                  if (window.confirm(`Delete exercise "${e.title}"?`)) {
                                    act(async () => {
                                      await adminContentService.deleteExercise(e.id);
                                      const res = await adminContentService.listExercises(c.id);
                                      setExercises((p) => ({ ...p, [c.id]: res.exercises || [] }));
                                    }, 'Exercise deleted.');
                                  }
                                }} style={{ border: 'none', cursor: 'pointer', borderRadius: 8, padding: '5px 7px', background: '#fee2e2', color: '#b91c1c' }}>
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            ))}
                            {(exercises[c.id] || []).length === 0 && (
                              <p style={{ color: '#9891a6', fontSize: 12.5, margin: '8px 0' }}>No exercises yet — add the first one.</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── problem bank ── */}
      {tab === 'problems' && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {PROBLEM_FILTERS.map(f => (
              <button key={f.key} onClick={() => { setPFilter(f.key); setPPage(1); }}
                style={{
                  padding: '7px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  border: '1px solid rgba(255,255,255,.7)',
                  background: pFilter === f.key ? 'linear-gradient(135deg,#7c3aed,#9333ea)' : 'rgba(255,255,255,.55)',
                  color: pFilter === f.key ? '#fff' : '#463f57',
                }}>
                {f.label}
                {f.key === 'no_tests' && pSummary ? ` (${pSummary.no_test_cases})` : ''}
                {f.key === 'disabled' && pSummary ? ` (${pSummary.disabled})` : ''}
              </button>
            ))}
          </div>
          <div className={styles.tableWrap}>
            {pLoading ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: '#64748b', fontWeight: 600, display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
                <Loader2 size={16} className="spin" /> Loading problems…
              </div>
            ) : problems.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: '#9891a6', fontWeight: 600 }}>No problems in this view.</div>
            ) : (
              <table className={styles.table}>
                <thead><tr><th>Problem</th><th>Topic</th><th>Difficulty</th><th>Acceptance</th><th>State</th><th style={{ textAlign: 'right' }}>Action</th></tr></thead>
                <tbody>
                  {problems.map(p => (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: 700, color: '#201b2e' }}>{p.title}</div>
                        <div style={{ fontSize: 12, color: '#9891a6', fontWeight: 600 }}>{p.slug}{p.lc_id ? ` · LC ${p.lc_id}` : ''}</div>
                      </td>
                      <td>{p.nexlab_topic}</td>
                      <td>{p.difficulty}</td>
                      <td>{p.acceptance != null ? `${Math.round(p.acceptance * 100)}%` : '—'}</td>
                      <td>
                        <span style={{ fontWeight: 700, fontSize: 12, color: p.is_active ? '#15803d' : '#b91c1c' }}>● {p.is_active ? 'live' : 'disabled'}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button onClick={() => act(async () => {
                          await adminContentService.toggleProblem(p.id, !p.is_active);
                          const res = await adminContentService.listProblems(pFilter, pPage);
                          setProblems(res.problems || []); setPSummary(res.summary);
                        }, p.is_active ? 'Problem disabled.' : 'Problem enabled.')}
                          style={{ border: 'none', cursor: 'pointer', borderRadius: 8, padding: '6px 10px', background: p.is_active ? '#fee2e2' : '#dcfce7', color: p.is_active ? '#b91c1c' : '#15803d', fontWeight: 700, fontSize: 12.5 }}>
                          {p.is_active ? 'Disable' : 'Enable'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className={styles.tableFooter}>
              <span>Page {pPage} of {pPages} · {pTotal.toLocaleString()} problems</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className={styles.btnSecondary} disabled={pPage <= 1} onClick={() => setPPage(p => p - 1)} style={{ opacity: pPage <= 1 ? .45 : 1 }}><ChevronLeft size={14} /> Prev</button>
                <button className={styles.btnSecondary} disabled={pPage >= pPages} onClick={() => setPPage(p => p + 1)} style={{ opacity: pPage >= pPages ? .45 : 1 }}>Next <ChevronRight size={14} /></button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── create course modal ── */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,10,30,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80 }} onClick={() => setShowCreate(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(460px, 92vw)', background: '#fff', borderRadius: 18, padding: 26, boxShadow: '0 30px 80px rgba(0,0,0,.25)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 800 }}>New platform course</h3>
            <label style={labelS}>Title</label>
            <input style={inputS} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Python Basics" />
            <label style={{ ...labelS, marginTop: 10 }}>Slug</label>
            <input style={inputS} value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder="python-basics" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              <div>
                <label style={labelS}>Difficulty</label>
                <select style={inputS} value={form.difficulty} onChange={e => setForm({ ...form, difficulty: e.target.value })}>
                  <option>beginner</option><option>intermediate</option><option>advanced</option>
                </select>
              </div>
              <div>
                <label style={labelS}>Language</label>
                <select style={inputS} value={form.language} onChange={e => setForm({ ...form, language: e.target.value })}>
                  <option>python</option><option>javascript</option><option>c</option><option>cpp</option><option>java</option>
                </select>
              </div>
            </div>
            <label style={{ ...labelS, marginTop: 10 }}>Description</label>
            <textarea style={{ ...inputS, resize: 'vertical' }} rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className={styles.btnSecondary} onClick={() => setShowCreate(false)}>Cancel</button>
              <button className={styles.btnPrimary} disabled={!form.title.trim() || !form.slug.trim()} onClick={() => act(async () => {
                await adminContentService.createCourse({ ...form, title: form.title.trim(), slug: form.slug.trim() });
                setShowCreate(false);
              }, 'Course created.')}>
                <Check size={14} /> Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── add exercise modal ── */}
      {showExForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,10,30,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80 }} onClick={() => setShowExForm(null)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(460px, 92vw)', background: '#fff', borderRadius: 18, padding: 26, boxShadow: '0 30px 80px rgba(0,0,0,.25)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 800 }}>Add exercise</h3>
            <label style={labelS}>Title</label>
            <input style={inputS} value={exForm.title} onChange={e => setExForm({ ...exForm, title: e.target.value })} placeholder="Sum Two Numbers" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
              <div>
                <label style={labelS}>Type</label>
                <select style={inputS} value={exForm.exercise_type} onChange={e => setExForm({ ...exForm, exercise_type: e.target.value })}>
                  <option>coding</option><option>mcq</option><option>reading</option><option>simulation</option>
                </select>
              </div>
              <div>
                <label style={labelS}>Difficulty</label>
                <select style={inputS} value={exForm.difficulty} onChange={e => setExForm({ ...exForm, difficulty: e.target.value })}>
                  <option>easy</option><option>medium</option><option>hard</option>
                </select>
              </div>
              <div>
                <label style={labelS}>XP</label>
                <input style={inputS} type="number" min={1} value={exForm.xp_reward} onChange={e => setExForm({ ...exForm, xp_reward: Number(e.target.value) })} />
              </div>
            </div>
            <p style={{ fontSize: 12, color: '#9891a6', fontWeight: 600, margin: '12px 0 0' }}>
              Test cases, MCQ options and starter code can be edited after creation via the API.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
              <button className={styles.btnSecondary} onClick={() => setShowExForm(null)}>Cancel</button>
              <button className={styles.btnPrimary} disabled={!exForm.title.trim()} onClick={() => act(async () => {
                await adminContentService.createExercise(showExForm, { ...exForm, title: exForm.title.trim() });
                const res = await adminContentService.listExercises(showExForm);
                setExercises(p => ({ ...p, [showExForm]: res.exercises || [] }));
                setShowExForm(null);
              }, 'Exercise added.')}>
                <Check size={14} /> Add
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

const labelS: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: '#615a72', marginBottom: 6 };
const inputS: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0',
  fontSize: 13.5, fontWeight: 600, color: '#201b2e', outline: 'none', boxSizing: 'border-box',
};
