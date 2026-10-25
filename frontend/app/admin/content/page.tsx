'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import AdminShell from '@/components/layout/AdminShell';
import PlatformLessonStudio from '@/components/admin/PlatformLessonStudio';
import type { PlatformContentBlock } from '@/types/platform-content';
import {
  Loader2, RefreshCw, Plus, BookOpen, ChevronRight, ChevronLeft, Trash2,
  Pencil, Globe, GlobeLock, Search, X, Check, FileCode,
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

type ExerciseForm = {
  title: string; exercise_type: string; difficulty: string; xp_reward: number;
  description: string; hint_text: string; language: string; languages: string[];
  starter_code: string; starter_code_by_language: Record<string, string>;
  test_cases: { input: string; expected: string; hidden: boolean }[];
  mcq_options: string[]; mcq_answer: string; mcq_explanation: string;
  simulation_path: string; content_blocks: PlatformContentBlock[];
};
const emptyExerciseForm = (): ExerciseForm => ({
  title: '', exercise_type: 'coding', difficulty: 'easy', xp_reward: 10,
  description: '', hint_text: '', language: 'python', languages: ['python'], starter_code: '', starter_code_by_language: {},
  test_cases: [{ input: '', expected: '', hidden: false }],
  mcq_options: ['', '', '', ''], mcq_answer: 'A', mcq_explanation: '', simulation_path: '', content_blocks: [],
});

export default function ContentPage() {
  const [tab, setTab] = useState<Tab>('courses');

  // courses
  const [courses, setCourses] = useState<AdminPlatformCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exercises, setExercises] = useState<Record<string, AdminPlatformExercise[]>>({});
  const [exerciseLoading, setExerciseLoading] = useState<string | null>(null);
  const [simulationAssets, setSimulationAssets] = useState<{ path: string; name: string }[]>([]);
  const [simulationAssetsLoaded, setSimulationAssetsLoaded] = useState(false);
  const [importingSimulation, setImportingSimulation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingCourse, setEditingCourse] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', slug: '', difficulty: 'beginner', language: 'python', description: '' });
  const [showExForm, setShowExForm] = useState<string | null>(null);
  const [editingExercise, setEditingExercise] = useState<string | null>(null);
  const [exForm, setExForm] = useState<ExerciseForm>(emptyExerciseForm());

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
    if (!showExForm || exForm.exercise_type !== 'simulation' || simulationAssetsLoaded) return;
    adminContentService.listSimulationAssets()
      .then((res) => setSimulationAssets(res.assets || []))
      .catch(() => setError('Could not load the existing simulation file list. You can still enter a path manually.'))
      .finally(() => setSimulationAssetsLoaded(true));
  }, [showExForm, exForm.exercise_type, simulationAssetsLoaded]);

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
    setError(null);
    try { await fn(); setNotice(done); await load(); }
    catch (e) {
      setNotice(null);
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Action failed.');
    } finally { setBusy(false); }
  };

  const fetchExercises = async (courseId: string) => {
    setExerciseLoading(courseId);
    setError(null);
    try {
      const res = await adminContentService.listExercises(courseId);
      setExercises((p) => ({ ...p, [courseId]: res.exercises || [] }));
    } catch {
      setExercises((p) => { const next = { ...p }; delete next[courseId]; return next; });
      setError('Could not load exercises for this course. Retry to try again.');
    } finally {
      setExerciseLoading((current) => current === courseId ? null : current);
    }
  };

  const openExercises = async (courseId: string) => {
    if (expanded === courseId) { setExpanded(null); return; }
    setExpanded(courseId);
    if (!exercises[courseId]) await fetchExercises(courseId);
  };

  const openEditExercise = (courseId: string, exercise: AdminPlatformExercise) => {
    const languages = exercise.allowed_languages?.length ? exercise.allowed_languages : ['python'];
    const language = languages[0];
    setShowExForm(courseId);
    setEditingExercise(exercise.id);
    setExForm({
      title: exercise.title,
      exercise_type: exercise.exercise_type,
      difficulty: exercise.difficulty,
      xp_reward: exercise.xp_reward,
      description: exercise.description || '',
      hint_text: exercise.hint_text || '',
      language,
      languages,
      starter_code: exercise.starter_code?.[language] || '',
      starter_code_by_language: exercise.starter_code || {},
      test_cases: (exercise.test_cases || []).map((tc) => ({ input: tc.input ?? '', expected: tc.expected ?? '', hidden: Boolean(tc.hidden) })),
      mcq_options: [...(exercise.mcq_options || []), '', '', '', ''].slice(0, 4),
      mcq_answer: exercise.mcq_answer || 'A',
      mcq_explanation: exercise.mcq_explanation || '',
      simulation_path: exercise.simulation_path || '',
      content_blocks: (exercise.content_blocks || []).map((block, index) => ({
        ...block,
        id: block.id || `loaded-${exercise.id}-${index}`,
        content_data: block.content_data || {},
      })),
    });
  };

  const submitExercise = () => {
    if (!showExForm) return;
    const testCases = exForm.exercise_type === 'coding'
      ? exForm.test_cases.filter((tc) => tc.input.trim() !== '' || tc.expected.trim() !== '')
      : [];
    const mcqOptions = exForm.mcq_options.map((option) => option.trim());
    while (mcqOptions.length && !mcqOptions[mcqOptions.length - 1]) mcqOptions.pop();
    if (exForm.exercise_type === 'mcq' && (mcqOptions.length < 2 || mcqOptions.some((option) => !option))) {
      setError('MCQ choices must be filled consecutively from A, with at least two choices.');
      return;
    }
    if (exForm.exercise_type === 'mcq' && (exForm.mcq_answer.charCodeAt(0) - 65 < 0 || exForm.mcq_answer.charCodeAt(0) - 65 >= mcqOptions.length)) {
      setError('Choose a correct answer that matches a filled choice.');
      return;
    }
    const allowedLanguages = Array.from(new Set(exForm.languages.includes(exForm.language)
      ? exForm.languages : [...exForm.languages, exForm.language]));
    const starterCodeByLanguage = {
      ...exForm.starter_code_by_language,
      [exForm.language]: exForm.starter_code,
    };
    const starterCode = Object.fromEntries(Object.entries(starterCodeByLanguage)
      .filter(([language, code]) => allowedLanguages.includes(language) && code.trim() !== ''));
    const payload: Record<string, unknown> = {
      title: exForm.title.trim(),
      exercise_type: exForm.exercise_type,
      difficulty: exForm.difficulty,
      xp_reward: exForm.xp_reward,
      description: exForm.description.trim(),
      hint_text: exForm.hint_text.trim() || null,
      starter_code: exForm.exercise_type === 'coding' ? starterCode : {},
      allowed_languages: exForm.exercise_type === 'coding' ? allowedLanguages : [],
      test_cases: testCases,
      mcq_options: exForm.exercise_type === 'mcq' ? mcqOptions : [],
      mcq_answer: exForm.exercise_type === 'mcq' ? exForm.mcq_answer : null,
      mcq_explanation: exForm.exercise_type === 'mcq' ? exForm.mcq_explanation.trim() : null,
      simulation_path: exForm.exercise_type === 'simulation' ? exForm.simulation_path.trim() || null : null,
      content_blocks: exForm.content_blocks,
      ...(editingExercise ? {} : { is_published: false }),
    };
    void act(async () => {
      if (editingExercise) {
        await adminContentService.updateExercise(editingExercise, payload);
      } else {
        await adminContentService.createExercise(showExForm, payload);
      }
      const res = await adminContentService.listExercises(showExForm);
      setExercises((p) => ({ ...p, [showExForm]: res.exercises || [] }));
      setShowExForm(null);
      setEditingExercise(null);
    }, editingExercise ? 'Exercise saved.' : 'Exercise created as a draft. Complete and publish it when ready.');
  };

  const importSimulationHtml = async () => {
    const path = exForm.simulation_path.trim();
    if (!path) { setError('Choose a simulation file path before importing its HTML.'); return; }
    setImportingSimulation(true);
    setError(null);
    try {
      const source = await adminContentService.getSimulationAssetSource(path);
      setExForm((formState) => {
        const existing = formState.content_blocks.find((block) => block.module_type === 'html');
        if (existing) {
          return {
            ...formState,
            content_blocks: formState.content_blocks.map((block) => block.id === existing.id
              ? { ...block, content_data: { ...block.content_data, html: source.html } } : block),
          };
        }
        const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID() : `imported-${Date.now()}`;
        return {
          ...formState,
          content_blocks: [...formState.content_blocks, {
            id, module_type: 'html', title: 'Interactive simulation', content_data: { html: source.html },
          }],
        };
      });
      setNotice('Simulation source copied into the lesson studio. Save the exercise to store your editable version.');
    } catch (error) {
      setError((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Could not import this simulation file.');
    } finally {
      setImportingSimulation(false);
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
          <button onClick={() => { void load(); if (expanded) void fetchExercises(expanded); }} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', fontWeight: 700, cursor: 'pointer' }}>Retry</button>
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
            <button className={styles.btnPrimary} onClick={() => { setEditingCourse(null); setForm({ title: '', slug: '', difficulty: 'beginner', language: 'python', description: '' }); setShowCreate(true); }}>
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
                  <Fragment key={c.id}>
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
                          <button type="button" title="Edit course" aria-label={`Edit ${c.title}`} disabled={busy} onClick={() => {
                            setEditingCourse(c.id);
                            setForm({ title: c.title, slug: c.slug, difficulty: c.difficulty, language: c.language, description: c.description || '' });
                            setShowCreate(true);
                          }} style={{ border: 'none', cursor: 'pointer', borderRadius: 8, padding: '6px 8px', background: '#e0e7ff', color: '#4338ca' }}><Pencil size={13} /></button>
                          <button title={c.is_published ? 'Unpublish' : 'Publish'} disabled={busy} onClick={() => act(() => adminContentService.updateCourse(c.id, { is_published: !c.is_published }).then(() => {}), c.is_published ? 'Course unpublished.' : 'Course published.')} style={{ border: 'none', cursor: 'pointer', borderRadius: 8, padding: '6px 8px', background: c.is_published ? '#fef3c7' : '#dcfce7', color: c.is_published ? '#b45309' : '#15803d' }}>
                            {c.is_published ? <GlobeLock size={13} /> : <Globe size={13} />}
                          </button>
                          <button type="button" title="Add exercise" aria-label={`Add exercise to ${c.title}`} onClick={() => { setExForm(emptyExerciseForm()); setEditingExercise(null); setShowExForm(c.id); }} style={{ border: 'none', cursor: 'pointer', borderRadius: 8, padding: '6px 8px', background: '#e0e7ff', color: '#4338ca' }}>
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
                            {exerciseLoading === c.id ? <p style={{ color: '#64748b', fontSize: 12.5 }}>Loading exercises…</p> : exercises[c.id] ? <>
                            {exercises[c.id].map(e => (
                              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,.7)', fontSize: 13 }}>
                                <span style={{ fontWeight: 700, color: '#201b2e', flex: 1 }}>{e.title}</span>
                                <span style={{ color: '#64748b', fontSize: 12 }}>{e.exercise_type} · {e.difficulty} · {e.xp_reward} XP · {e.test_case_count} cases · {e.solves_count} solves · {e.is_published ? 'published' : 'draft'}</span>
                                <button type="button" title={e.is_published ? 'Unpublish exercise' : 'Publish exercise'} aria-label={`${e.is_published ? 'Unpublish' : 'Publish'} ${e.title}`} disabled={busy} onClick={() => act(async () => {
                                  await adminContentService.updateExercise(e.id, { is_published: !e.is_published });
                                  const res = await adminContentService.listExercises(c.id);
                                  setExercises((p) => ({ ...p, [c.id]: res.exercises || [] }));
                                }, e.is_published ? 'Exercise unpublished.' : 'Exercise published.')} style={{ border: 'none', cursor: 'pointer', borderRadius: 8, padding: '5px 7px', background: e.is_published ? '#fef3c7' : '#dcfce7', color: e.is_published ? '#b45309' : '#15803d' }}>
                                  {e.is_published ? <GlobeLock size={12} /> : <Globe size={12} />}
                                </button>
                                <button type="button" title="Edit exercise" aria-label={`Edit ${e.title}`} onClick={() => openEditExercise(c.id, e)} style={{ border: 'none', cursor: 'pointer', borderRadius: 8, padding: '5px 7px', background: '#e0e7ff', color: '#4338ca' }}>
                                  <Pencil size={12} />
                                </button>
                                <button type="button" title="Delete exercise" aria-label={`Delete ${e.title}`} disabled={busy} onClick={() => {
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
                            {exercises[c.id].length === 0 && (
                              <p style={{ color: '#9891a6', fontSize: 12.5, margin: '8px 0' }}>No exercises yet — add the first one.</p>
                            )}
                            </> : <p style={{ color: '#b91c1c', fontSize: 12.5 }}>Exercises could not be loaded. <button type="button" onClick={() => void fetchExercises(c.id)} style={{ color: '#4338ca', border: 0, background: 'transparent', cursor: 'pointer', fontWeight: 700 }}>Retry</button></p>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,10,30,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80 }} onClick={() => { setShowCreate(false); setEditingCourse(null); }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(460px, 92vw)', background: '#fff', borderRadius: 18, padding: 26, boxShadow: '0 30px 80px rgba(0,0,0,.25)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 800 }}>{editingCourse ? 'Edit platform course' : 'New platform course'}</h3>
            <label style={labelS}>Title</label>
            <input style={inputS} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Python Basics" />
            <label style={{ ...labelS, marginTop: 10 }}>Slug</label>
            <input style={inputS} value={form.slug} disabled={Boolean(editingCourse)} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder="python-basics" />
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
              <button className={styles.btnSecondary} onClick={() => { setShowCreate(false); setEditingCourse(null); }}>Cancel</button>
              <button className={styles.btnPrimary} disabled={!form.title.trim() || (!editingCourse && !form.slug.trim()) || busy} onClick={() => act(async () => {
                if (editingCourse) {
                  await adminContentService.updateCourse(editingCourse, {
                    title: form.title.trim(), description: form.description.trim(),
                    difficulty: form.difficulty, language: form.language,
                  });
                } else {
                  await adminContentService.createCourse({ ...form, title: form.title.trim(), slug: form.slug.trim() });
                }
                setShowCreate(false);
                setEditingCourse(null);
              }, editingCourse ? 'Course updated.' : 'Course created.')}>
                <Check size={14} /> {editingCourse ? 'Save changes' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── add/edit exercise modal ── */}
      {showExForm && (
        <div role="presentation" onClick={(e) => { if (e.target === e.currentTarget && !busy) { setShowExForm(null); setEditingExercise(null); } }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,10,30,.5)', display: 'grid', placeItems: 'center', zIndex: 80, padding: 16 }}>
          <section role="dialog" aria-modal="true" aria-labelledby="exercise-editor-title" style={{ width: 'min(720px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 18, padding: 26, boxShadow: '0 30px 80px rgba(0,0,0,.25)' }}>
            <h2 id="exercise-editor-title" style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 800 }}>{editingExercise ? 'Edit exercise' : 'Add exercise'}</h2>
            <label style={labelS} htmlFor="exercise-title">Title / question</label>
            <input id="exercise-title" required style={inputS} value={exForm.title} onChange={e => setExForm(f => ({ ...f, title: e.target.value }))} placeholder="Sum Two Numbers" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginTop: 12 }}>
              <div>
                <label style={labelS} htmlFor="exercise-type">Type</label>
                <select id="exercise-type" style={inputS} value={exForm.exercise_type} onChange={e => setExForm(f => ({ ...f, exercise_type: e.target.value }))}>
                  <option value="coding">Coding</option><option value="mcq">Multiple choice</option><option value="reading">Reading</option><option value="simulation">Simulation</option>
                </select>
              </div>
              <div>
                <label style={labelS} htmlFor="exercise-difficulty">Difficulty</label>
                <select id="exercise-difficulty" style={inputS} value={exForm.difficulty} onChange={e => setExForm(f => ({ ...f, difficulty: e.target.value }))}>
                  <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                </select>
              </div>
              <div>
                <label style={labelS} htmlFor="exercise-xp">XP reward</label>
                <input id="exercise-xp" style={inputS} type="number" min={0} max={10000} value={exForm.xp_reward} onChange={e => setExForm(f => ({ ...f, xp_reward: Number(e.target.value) }))} />
              </div>
            </div>
            {(exForm.exercise_type === 'coding' || exForm.exercise_type === 'reading' || exForm.exercise_type === 'simulation') && (
              <>
                <label style={{ ...labelS, marginTop: 12 }} htmlFor="exercise-description">Learner instructions / content</label>
                <textarea id="exercise-description" style={{ ...inputS, resize: 'vertical' }} rows={4} value={exForm.description} onChange={e => setExForm(f => ({ ...f, description: e.target.value }))} placeholder="Write the prompt or learning content…" />
              </>
            )}
            <label style={{ ...labelS, marginTop: 12 }} htmlFor="exercise-hint">Hint (optional)</label>
            <textarea id="exercise-hint" style={{ ...inputS, resize: 'vertical' }} rows={2} value={exForm.hint_text} onChange={e => setExForm(f => ({ ...f, hint_text: e.target.value }))} />

            {exForm.exercise_type === 'coding' && (
              <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
                <div>
                  <label style={labelS} htmlFor="exercise-language">Starter-code language</label>
                  <select id="exercise-language" style={inputS} value={exForm.language} onChange={e => setExForm(f => {
                    const codeByLanguage = { ...f.starter_code_by_language, [f.language]: f.starter_code };
                    const language = e.target.value;
                    return { ...f, language, starter_code: codeByLanguage[language] || '', starter_code_by_language: codeByLanguage };
                  })}>
                    {Array.from(new Set(['python', 'javascript', 'c', 'cpp', 'java', ...exForm.languages])).map(language => <option key={language} value={language}>{language}</option>)}
                  </select>
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: '6px 12px' }}>
                    {Array.from(new Set(['python', 'javascript', 'c', 'cpp', 'java', ...exForm.languages])).map(language => (
                      <label key={language} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#475569' }}>
                        <input type="checkbox" checked={exForm.languages.includes(language)} onChange={e => setExForm(f => {
                          const willCheck = e.target.checked;
                          if (!willCheck && f.languages.length <= 1) return f;
                          const languages = willCheck ? [...f.languages, language] : f.languages.filter(item => item !== language);
                          const codeByLanguage = { ...f.starter_code_by_language, [f.language]: f.starter_code };
                          const currentLanguage = languages.includes(f.language) ? f.language : languages[0];
                          return { ...f, languages, language: currentLanguage, starter_code: codeByLanguage[currentLanguage] || '', starter_code_by_language: codeByLanguage };
                        })} /> {language}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={labelS} htmlFor="exercise-starter">Starter code for {exForm.language} (optional)</label>
                  <textarea id="exercise-starter" style={{ ...inputS, resize: 'vertical', fontFamily: 'monospace' }} rows={5} value={exForm.starter_code} onChange={e => setExForm(f => ({ ...f, starter_code: e.target.value, starter_code_by_language: { ...f.starter_code_by_language, [f.language]: e.target.value } }))} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <label style={labelS}>Test cases (at least one required to publish)</label>
                    <button type="button" className={styles.btnSecondary} onClick={() => setExForm(f => ({ ...f, test_cases: [...f.test_cases, { input: '', expected: '', hidden: false }] }))}><Plus size={13} /> Add case</button>
                  </div>
                  {exForm.test_cases.map((tc, index) => (
                    <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 8, alignItems: 'center', marginTop: 8 }}>
                      <input aria-label={`Test case ${index + 1} input`} style={inputS} value={tc.input} onChange={e => setExForm(f => ({ ...f, test_cases: f.test_cases.map((x, i) => i === index ? { ...x, input: e.target.value } : x) }))} placeholder="stdin" />
                      <input aria-label={`Test case ${index + 1} expected output`} style={inputS} value={tc.expected} onChange={e => setExForm(f => ({ ...f, test_cases: f.test_cases.map((x, i) => i === index ? { ...x, expected: e.target.value } : x) }))} placeholder="Expected stdout" />
                      <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11, whiteSpace: 'nowrap' }}><input type="checkbox" checked={tc.hidden} onChange={e => setExForm(f => ({ ...f, test_cases: f.test_cases.map((x, i) => i === index ? { ...x, hidden: e.target.checked } : x) }))} /> Hidden</label>
                      <button type="button" aria-label={`Remove test case ${index + 1}`} disabled={exForm.test_cases.length <= 1} onClick={() => setExForm(f => ({ ...f, test_cases: f.test_cases.filter((_, i) => i !== index) }))} style={{ border: 0, background: 'transparent', color: '#b91c1c', cursor: 'pointer' }}><X size={15} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {exForm.exercise_type === 'mcq' && (
              <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
                <label style={labelS}>Answer options</label>
                {['A', 'B', 'C', 'D'].map((letter, index) => (
                  <div key={letter} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <strong style={{ width: 22 }}>{letter}</strong>
                    <input aria-label={`Option ${letter}`} style={inputS} value={exForm.mcq_options[index] || ''} onChange={e => setExForm(f => ({ ...f, mcq_options: f.mcq_options.map((option, i) => i === index ? e.target.value : option) }))} />
                  </div>
                ))}
                <label style={{ ...labelS, marginTop: 4 }} htmlFor="mcq-answer">Correct answer</label>
                <select id="mcq-answer" style={inputS} value={exForm.mcq_answer} onChange={e => setExForm(f => ({ ...f, mcq_answer: e.target.value }))}>
                  {['A', 'B', 'C', 'D'].map((letter, i) => <option key={letter} value={letter} disabled={!exForm.mcq_options[i]?.trim()}>{letter}</option>)}
                </select>
                <label style={labelS} htmlFor="mcq-explanation">Explanation (optional)</label>
                <textarea id="mcq-explanation" style={{ ...inputS, resize: 'vertical' }} rows={2} value={exForm.mcq_explanation} onChange={e => setExForm(f => ({ ...f, mcq_explanation: e.target.value }))} />
              </div>
            )}

            {exForm.exercise_type === 'simulation' && (
              <div style={{ marginTop: 12 }}>
                <label style={labelS} htmlFor="simulation-path">Existing simulation file (optional when you author inline HTML below)</label>
                <input id="simulation-path" list="platform-simulation-files" style={inputS} value={exForm.simulation_path} onChange={e => setExForm(f => ({ ...f, simulation_path: e.target.value }))} placeholder="/simulations/example/index.html" />
                <datalist id="platform-simulation-files">{simulationAssets.map(asset => <option key={asset.path} value={asset.path}>{asset.name}</option>)}</datalist>
                <button type="button" disabled={importingSimulation || !exForm.simulation_path.trim()} onClick={() => void importSimulationHtml()} style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #ddd6fe', borderRadius: 8, background: '#fff', color: '#5b21b6', padding: '7px 10px', fontWeight: 700, fontSize: 12, cursor: importingSimulation ? 'wait' : 'pointer' }}>
                  {importingSimulation ? <Loader2 size={13} className="spin" /> : <FileCode size={13} />} Import existing HTML into lesson studio
                </button>
                <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#64748b' }}>Import copies the bundled file into this exercise&rsquo;s editable database content; it does not overwrite the repository asset.</p>
              </div>
            )}

            <PlatformLessonStudio
              blocks={exForm.content_blocks}
              languages={exForm.languages}
              onChange={(content_blocks) => setExForm(formState => ({ ...formState, content_blocks }))}
            />

            <p style={{ margin: '12px 0 0', color: '#64748b', fontSize: 12 }}>New exercises are saved as drafts. Publish only after validating the learner view.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button type="button" className={styles.btnSecondary} disabled={busy} onClick={() => { setShowExForm(null); setEditingExercise(null); }}>Cancel</button>
              <button type="button" className={styles.btnPrimary} disabled={busy || !exForm.title.trim()} onClick={submitExercise}>
                {busy ? <Loader2 size={14} className="spin" /> : <Check size={14} />} {editingExercise ? 'Save changes' : 'Create draft'}
              </button>
            </div>
          </section>
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
