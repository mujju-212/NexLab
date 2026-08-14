'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Save, Sparkles, Plus, Trash2, FileText, Video, FileCheck2,
  HelpCircle, Upload, Eye, GripVertical, AlertCircle, CheckCircle2
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import { experimentService } from '@/services/experiment.service';
import { instructorService } from '@/services/instructor.service';
import styles from '../../../shared.module.css';

type Tab = 'details' | 'tests' | 'content' | 'simulation';

interface Exp {
  id: string;
  exp_number: number;
  title: string;
  aim: string | null;
  theory: string | null;
  problem_statement: string | null;
  input_format: string | null;
  output_format: string | null;
  difficulty_level: number;
  concept_tags: string[];
  allowed_languages: string[];
  enable_viva: boolean;
  enable_lockdown: boolean;
  allow_ai_hints: boolean;
  time_limit_sec: number;
  is_published: boolean;
  rubric: { test_cases: number; lab_report: number; code_quality: number; viva: number };
}

interface TestCaseRow {
  id: string;
  input_data: string;
  expected_output: string;
  is_hidden: boolean;
  description: string | null;
}

interface ContentModuleRow {
  id: string;
  module_type: 'text' | 'video' | 'pdf' | 'quiz';
  title: string;
  content_data: Record<string, unknown>;
  display_order: number;
  min_watch_pct: number;
  question_count?: number;
}

interface QuestionRow {
  id: string;
  question_text: string;
  options: string[];
  correct_answer: string;
  points: number;
  explanation: string | null;
}

const MODULE_ICON: Record<string, typeof FileText> = {
  text: FileText, video: Video, pdf: FileCheck2, quiz: HelpCircle,
};

export default function EditExperimentPage({ params }: { params: Promise<{ experimentId: string }> }) {
  const { experimentId } = use(params);
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('details');
  const [exp, setExp] = useState<Exp | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // details form
  const [form, setForm] = useState({
    title: '', aim: '', theory: '', problem_statement: '',
    input_format: '', output_format: '', difficulty_level: 1,
    concept_tags: '', time_limit_sec: 10,
    rubric_test_cases: 60, rubric_lab_report: 20, rubric_code_quality: 10, rubric_viva: 10,
    enable_viva: false, enable_lockdown: false, allow_ai_hints: true,
  });

  // test cases
  const [cases, setCases] = useState<TestCaseRow[]>([]);
  const [newCase, setNewCase] = useState({ input_data: '', expected_output: '', description: '', is_hidden: false });
  const [generating, setGenerating] = useState(false);

  // content
  const [modules, setModules] = useState<ContentModuleRow[]>([]);
  const [newModule, setNewModule] = useState({ module_type: 'text', title: '', html: '', url: '' });
  const [openQuizId, setOpenQuizId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [newQ, setNewQ] = useState({ question_text: '', a: '', b: '', c: '', d: '', correct_answer: 'A' });

  // simulation
  const [simInfo, setSimInfo] = useState<{ has_simulation: boolean; preview_url: string | null } | null>(null);
  const [simPrompt, setSimPrompt] = useState<string | null>(null);

  const toast3 = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const loadExp = useCallback(async () => {
    try {
      const exps = await experimentService.listMine() as Exp[];
      const found = exps.find(e => e.id === experimentId) ?? null;
      setExp(found);
      if (found) {
        setForm({
          title: found.title, aim: found.aim ?? '', theory: found.theory ?? '',
          problem_statement: found.problem_statement ?? '',
          input_format: found.input_format ?? '', output_format: found.output_format ?? '',
          difficulty_level: found.difficulty_level,
          concept_tags: found.concept_tags.join(', '),
          time_limit_sec: found.time_limit_sec,
          rubric_test_cases: found.rubric.test_cases, rubric_lab_report: found.rubric.lab_report,
          rubric_code_quality: found.rubric.code_quality, rubric_viva: found.rubric.viva,
          enable_viva: found.enable_viva, enable_lockdown: found.enable_lockdown,
          allow_ai_hints: found.allow_ai_hints,
        });
      }
    } catch { setExp(null); }
  }, [experimentId]);

  const loadCases = useCallback(async () => {
    try { setCases(await experimentService.getTestCases(experimentId) as TestCaseRow[]); }
    catch { setCases([]); }
  }, [experimentId]);

  const loadModules = useCallback(async () => {
    try {
      const d = await instructorService.listContent(experimentId);
      setModules(d.content_modules ?? []);
    } catch { setModules([]); }
  }, [experimentId]);

  const loadSim = useCallback(async () => {
    try { setSimInfo(await instructorService.getSimulationInfo(experimentId)); }
    catch { setSimInfo(null); }
  }, [experimentId]);

  useEffect(() => { loadExp(); loadCases(); loadModules(); loadSim(); }, [loadExp, loadCases, loadModules, loadSim]);

  // ── actions ──────────────────────────────────────────────────────────────────
  const saveDetails = async () => {
    setError(null);
    const tags = form.concept_tags.split(',').map(t => t.trim()).filter(Boolean);
    const rubricSum = form.rubric_test_cases + form.rubric_lab_report + form.rubric_code_quality + form.rubric_viva;
    if (tags.length === 0) { setError('At least one concept tag is required.'); return; }
    if (rubricSum !== 100) { setError(`Rubric must sum to 100 (currently ${rubricSum}).`); return; }
    try {
      await experimentService.update(experimentId, {
        title: form.title, aim: form.aim, theory: form.theory,
        problem_statement: form.problem_statement,
        input_format: form.input_format, output_format: form.output_format,
        difficulty_level: form.difficulty_level, concept_tags: tags,
        time_limit_sec: form.time_limit_sec,
        rubric_test_cases: form.rubric_test_cases, rubric_lab_report: form.rubric_lab_report,
        rubric_code_quality: form.rubric_code_quality, rubric_viva: form.rubric_viva,
        enable_viva: form.enable_viva, enable_lockdown: form.enable_lockdown,
        allow_ai_hints: form.allow_ai_hints,
      });
      toast3('Experiment saved.');
      loadExp();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error ?? 'Failed to save.');
    }
  };

  const addCase = async () => {
    if (!newCase.input_data && !newCase.expected_output) return;
    try {
      await experimentService.addTestCases(experimentId, {
        input_data: newCase.input_data,
        expected_output: newCase.expected_output,
        description: newCase.description || undefined,
        is_hidden: newCase.is_hidden,
      });
      setNewCase({ input_data: '', expected_output: '', description: '', is_hidden: false });
      toast3('Test case added.');
      loadCases();
    } catch { toast3('Failed to add test case.'); }
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await experimentService.generateTestCases(experimentId, 6);
      toast3(`Generated ${res.generated} test cases with AI.`);
      loadCases();
    } catch {
      toast3('AI generation failed — check the problem statement is filled in.');
    } finally { setGenerating(false); }
  };

  const addModule = async () => {
    if (!newModule.title.trim()) { toast3('Module title required.'); return; }
    try {
      const content_data: Record<string, unknown> =
        newModule.module_type === 'text' ? { html: newModule.html } :
        newModule.module_type === 'video' ? { url: newModule.url } :
        newModule.module_type === 'pdf' ? { url: newModule.url } :
        { pass_threshold: 70, max_attempts: 3, cooldown_minutes: 30, shuffle: true };
      await instructorService.addContentModule(experimentId, {
        module_type: newModule.module_type as 'text' | 'video' | 'pdf' | 'quiz',
        title: newModule.title,
        content_data,
      });
      setNewModule({ module_type: 'text', title: '', html: '', url: '' });
      toast3('Module added.');
      loadModules();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast3(e?.response?.data?.error ?? 'Failed to add module.');
    }
  };

  const removeModule = async (m: ContentModuleRow) => {
    try { await instructorService.deleteContentModule(experimentId, m.id); loadModules(); toast3('Module deleted.'); }
    catch { toast3('Failed to delete module.'); }
  };

  const moveModule = async (idx: number, dir: -1 | 1) => {
    const next = [...modules];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setModules(next);
    try { await instructorService.reorderContent(experimentId, next.map(m => m.id)); }
    catch { toast3('Reorder failed.'); loadModules(); }
  };

  const openQuiz = async (moduleId: string) => {
    setOpenQuizId(moduleId === openQuizId ? null : moduleId);
    if (moduleId !== openQuizId) {
      try {
        const d = await instructorService.listQuestions(moduleId);
        setQuestions(d.questions ?? []);
      } catch { setQuestions([]); }
    }
  };

  const addQuestion = async () => {
    if (!openQuizId) return;
    if (!newQ.question_text || !newQ.a || !newQ.b || !newQ.c || !newQ.d) {
      toast3('Fill the question and all 4 options.'); return;
    }
    try {
      await instructorService.addQuestions(openQuizId, {
        question_text: newQ.question_text,
        options: [newQ.a, newQ.b, newQ.c, newQ.d],
        correct_answer: newQ.correct_answer,
        points: 1,
      });
      setNewQ({ question_text: '', a: '', b: '', c: '', d: '', correct_answer: 'A' });
      toast3('Question added.');
      openQuizId && (async () => {
        const d = await instructorService.listQuestions(openQuizId);
        setQuestions(d.questions ?? []);
      })();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast3(e?.response?.data?.error ?? 'Failed to add question.');
    }
  };

  const removeQuestion = async (qId: string) => {
    try {
      await instructorService.deleteQuestion(qId);
      setQuestions(qs => qs.filter(q => q.id !== qId));
    } catch { toast3('Failed to delete question.'); }
  };

  const uploadSim = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await instructorService.uploadSimulation(experimentId, file);
      toast3(res.message ?? 'Simulation uploaded.');
      loadSim();
    } catch { toast3('Upload failed — only .html or .zip (with index.html) allowed.'); }
    e.target.value = '';
  };

  const fetchSimPrompt = async () => {
    try {
      const d = await instructorService.getSimulationPrompt(experimentId);
      setSimPrompt(d.prompt);
    } catch { toast3('Could not load AI prompt.'); }
  };

  if (!exp) {
    return (
      <InstructorShell activePage="Experiments" title="Experiment">
        <p className={styles.sectionSub}>Loading experiment…</p>
      </InstructorShell>
    );
  }

  return (
    <InstructorShell activePage="Experiments" title={`#${exp.exp_number} — ${exp.title}`}
      subtitle={exp.is_published ? 'Published — students can see this experiment.' : 'Draft — not visible to students yet.'}>

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 300, background: '#111827', color: '#fff', padding: '12px 20px', borderRadius: 12, fontSize: 14, fontWeight: 600 }}>{toast}</div>}

      <div className={styles.actionRow}>
        <button className={styles.ghostBtn} onClick={() => router.push('/instructor/experiments')}>
          <ArrowLeft size={13} /> Back
        </button>
        <div className={styles.tabRow}>
          {([
            { id: 'details', label: 'Details' },
            { id: 'tests', label: `Test Cases (${cases.length})` },
            { id: 'content', label: `Pre-lab Content (${modules.length})` },
            { id: 'simulation', label: 'Simulation' },
          ] as { id: Tab; label: string }[]).map(t => (
            <button key={t.id} className={`${styles.tabChip} ${tab === t.id ? styles.tabChipActive : ''}`}
              onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>
          <AlertCircle size={14} /> {error}
        </p>
      )}

      {/* ══ DETAILS ══ */}
      {tab === 'details' && (
        <div className={styles.sectionCard}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Title</label>
            <input className={styles.input} value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div className={styles.gridTwo}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Aim</label>
              <textarea className={styles.textarea} value={form.aim}
                onChange={e => setForm(f => ({ ...f, aim: e.target.value }))} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Problem statement</label>
              <textarea className={styles.textarea} value={form.problem_statement}
                onChange={e => setForm(f => ({ ...f, problem_statement: e.target.value }))} />
            </div>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Theory</label>
            <textarea className={styles.textarea} value={form.theory}
              onChange={e => setForm(f => ({ ...f, theory: e.target.value }))} />
          </div>
          <div className={styles.gridTwo}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Input format</label>
              <textarea className={styles.textarea} value={form.input_format}
                onChange={e => setForm(f => ({ ...f, input_format: e.target.value }))} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Output format</label>
              <textarea className={styles.textarea} value={form.output_format}
                onChange={e => setForm(f => ({ ...f, output_format: e.target.value }))} />
            </div>
          </div>
          <div className={styles.gridTwo}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Concept tags (comma separated)</label>
              <input className={styles.input} value={form.concept_tags}
                onChange={e => setForm(f => ({ ...f, concept_tags: e.target.value }))} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Difficulty (1–4)</label>
              <select className={styles.select} value={form.difficulty_level}
                onChange={e => setForm(f => ({ ...f, difficulty_level: parseInt(e.target.value) }))}>
                <option value={1}>1 — Intro</option>
                <option value={2}>2 — Intermediate</option>
                <option value={3}>3 — Advanced</option>
                <option value={4}>4 — Expert</option>
              </select>
            </div>
          </div>
          <div className={styles.gridTwo}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Rubric: test cases / report / quality / viva (sum 100)</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['rubric_test_cases', 'rubric_lab_report', 'rubric_code_quality', 'rubric_viva'] as const).map(k => (
                  <input key={k} className={styles.input} type="number" min={0} max={100} style={{ width: 70 }}
                    value={form[k]}
                    onChange={e => setForm(f => ({ ...f, [k]: parseInt(e.target.value) || 0 }))} />
                ))}
              </div>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Options</label>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', paddingTop: 6 }}>
                <label style={{ display: 'flex', gap: 6, fontSize: 13, fontWeight: 600, color: '#374151' }}>
                  <input type="checkbox" checked={form.enable_viva}
                    onChange={e => setForm(f => ({ ...f, enable_viva: e.target.checked }))} /> Viva
                </label>
                <label style={{ display: 'flex', gap: 6, fontSize: 13, fontWeight: 600, color: '#374151' }}>
                  <input type="checkbox" checked={form.enable_lockdown}
                    onChange={e => setForm(f => ({ ...f, enable_lockdown: e.target.checked }))} /> Lockdown
                </label>
                <label style={{ display: 'flex', gap: 6, fontSize: 13, fontWeight: 600, color: '#374151' }}>
                  <input type="checkbox" checked={form.allow_ai_hints}
                    onChange={e => setForm(f => ({ ...f, allow_ai_hints: e.target.checked }))} /> AI hints
                </label>
              </div>
            </div>
          </div>
          <div className={styles.actionRow}>
            <span />
            <button className={styles.primaryBtn} onClick={saveDetails}>
              <Save size={13} /> Save Changes
            </button>
          </div>
        </div>
      )}

      {/* ══ TEST CASES ══ */}
      {tab === 'tests' && (
        <>
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>Existing test cases</h3>
              <button className={styles.secondaryBtn} disabled={generating} onClick={generate}>
                <Sparkles size={13} /> {generating ? 'Generating…' : 'Generate with AI'}
              </button>
            </div>
            {cases.length === 0 ? (
              <p className={styles.sectionSub}>No test cases yet. Add one below or generate with AI.</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr><th>#</th><th>Input</th><th>Expected output</th><th>Description</th><th>Visibility</th></tr>
                </thead>
                <tbody>
                  {cases.map((c, i) => (
                    <tr key={c.id}>
                      <td>{i + 1}</td>
                      <td><code className={styles.codeBlock}>{c.input_data.slice(0, 60)}</code></td>
                      <td><code className={styles.codeBlock}>{c.expected_output.slice(0, 60)}</code></td>
                      <td className={styles.tdStrong}>{c.description ?? '—'}</td>
                      <td>
                        <span className={`${styles.pill} ${c.is_hidden ? styles.pillAmber : styles.pillBlue}`}>
                          {c.is_hidden ? 'Hidden' : 'Visible'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>Add test case</h3>
            </div>
            <div className={styles.gridTwo}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Stdin input</label>
                <textarea className={styles.textarea} value={newCase.input_data}
                  onChange={e => setNewCase(c => ({ ...c, input_data: e.target.value }))} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Expected stdout</label>
                <textarea className={styles.textarea} value={newCase.expected_output}
                  onChange={e => setNewCase(c => ({ ...c, expected_output: e.target.value }))} />
              </div>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Description (optional)</label>
              <input className={styles.input} value={newCase.description}
                onChange={e => setNewCase(c => ({ ...c, description: e.target.value }))} />
            </div>
            <div className={styles.actionRow}>
              <label style={{ display: 'flex', gap: 6, fontSize: 13, fontWeight: 600, color: '#374151' }}>
                <input type="checkbox" checked={newCase.is_hidden}
                  onChange={e => setNewCase(c => ({ ...c, is_hidden: e.target.checked }))} />
                Hidden from students
              </label>
              <button className={styles.primaryBtn} onClick={addCase}>
                <Plus size={13} /> Add Test Case
              </button>
            </div>
          </div>
        </>
      )}

      {/* ══ PRE-LAB CONTENT ══ */}
      {tab === 'content' && (
        <>
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>Content modules (student must complete before live session)</h3>
            </div>
            {modules.length === 0 ? (
              <p className={styles.sectionSub}>No pre-lab content yet. Add a module below.</p>
            ) : (
              <div className={styles.list}>
                {modules.map((m, idx) => {
                  const Icon = MODULE_ICON[m.module_type] ?? FileText;
                  return (
                    <div key={m.id} className={styles.listRow}>
                      <GripVertical size={14} color="#ddd6fe" />
                      <div className={styles.rowIcon} style={{ background: '#f5f3ff' }}>
                        <Icon size={15} color="#7c3aed" />
                      </div>
                      <div className={styles.rowBody}>
                        <p className={styles.rowTitle}>{idx + 1}. {m.title}</p>
                        <p className={styles.rowMeta}>
                          {m.module_type}
                          {m.module_type === 'quiz' && ` · ${m.question_count ?? 0} questions`}
                          {m.module_type === 'video' && ` · watch ≥ ${m.min_watch_pct}%`}
                        </p>
                      </div>
                      <div className={styles.rowSide}>
                        <button className={styles.ghostBtn} onClick={() => moveModule(idx, -1)}>↑</button>
                        <button className={styles.ghostBtn} onClick={() => moveModule(idx, +1)}>↓</button>
                        {m.module_type === 'quiz' && (
                          <button className={styles.secondaryBtn} onClick={() => openQuiz(m.id)}>
                            {openQuizId === m.id ? 'Close' : 'Questions'}
                          </button>
                        )}
                        <button className={styles.ghostBtn} onClick={() => removeModule(m)}>
                          <Trash2 size={13} color="#ef4444" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {openQuizId && (
            <div className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>Quiz questions</h3>
                <span className={`${styles.pill} ${styles.pillBlue}`}>{questions.length} questions</span>
              </div>
              {questions.map((q, i) => (
                <div key={q.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid #f5f3ff' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#111827' }}>{i + 1}. {q.question_text}</p>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: '#6b7280' }}>
                      {q.options.map((o, oi) => `${'ABCD'[oi]}: ${o}`).join(' · ')} — answer <b>{q.correct_answer}</b>
                    </p>
                  </div>
                  <button className={styles.ghostBtn} onClick={() => removeQuestion(q.id)}>
                    <Trash2 size={13} color="#ef4444" />
                  </button>
                </div>
              ))}
              <div className={styles.formGroup} style={{ marginTop: 14 }}>
                <label className={styles.formLabel}>New question</label>
                <input className={styles.input} placeholder="Question text" value={newQ.question_text}
                  onChange={e => setNewQ(q => ({ ...q, question_text: e.target.value }))} />
              </div>
              <div className={styles.gridTwo}>
                {(['a', 'b', 'c', 'd'] as const).map(k => (
                  <div key={k} className={styles.formGroup}>
                    <label className={styles.formLabel}>Option {k.toUpperCase()}</label>
                    <input className={styles.input} value={newQ[k]}
                      onChange={e => setNewQ(q => ({ ...q, [k]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <div className={styles.actionRow}>
                <select className={styles.select} style={{ width: 160 }} value={newQ.correct_answer}
                  onChange={e => setNewQ(q => ({ ...q, correct_answer: e.target.value }))}>
                  <option value="A">Correct: A</option>
                  <option value="B">Correct: B</option>
                  <option value="C">Correct: C</option>
                  <option value="D">Correct: D</option>
                </select>
                <button className={styles.primaryBtn} onClick={addQuestion}>
                  <Plus size={13} /> Add Question
                </button>
              </div>
            </div>
          )}

          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>Add module</h3>
            </div>
            <div className={styles.gridTwo}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Type</label>
                <select className={styles.select} value={newModule.module_type}
                  onChange={e => setNewModule(m => ({ ...m, module_type: e.target.value }))}>
                  <option value="text">Text / theory</option>
                  <option value="video">Video (URL)</option>
                  <option value="pdf">PDF (URL)</option>
                  <option value="quiz">Quiz</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Title</label>
                <input className={styles.input} value={newModule.title}
                  onChange={e => setNewModule(m => ({ ...m, title: e.target.value }))} />
              </div>
            </div>
            {newModule.module_type === 'text' && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Content (HTML or plain text)</label>
                <textarea className={styles.textarea} value={newModule.html}
                  onChange={e => setNewModule(m => ({ ...m, html: e.target.value }))} />
              </div>
            )}
            {(newModule.module_type === 'video' || newModule.module_type === 'pdf') && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>URL</label>
                <input className={styles.input} placeholder="https://…" value={newModule.url}
                  onChange={e => setNewModule(m => ({ ...m, url: e.target.value }))} />
              </div>
            )}
            {newModule.module_type === 'quiz' && (
              <p className={styles.sectionSub}>A quiz starts with pass threshold 70%, 3 attempts, 30 min cooldown — add questions after creating it.</p>
            )}
            <div className={styles.actionRow}>
              <span />
              <button className={styles.primaryBtn} onClick={addModule}>
                <Plus size={13} /> Add Module
              </button>
            </div>
          </div>
        </>
      )}

      {/* ══ SIMULATION ══ */}
      {tab === 'simulation' && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>Custom HTML simulation</h3>
            <span className={`${styles.pill} ${simInfo?.has_simulation ? styles.pillGreen : styles.pillSlate}`}>
              {simInfo?.has_simulation ? <CheckCircle2 size={11} style={{ display: 'inline', marginRight: 4 }} /> : null}
              {simInfo?.has_simulation ? 'Uploaded' : 'Not uploaded'}
            </span>
          </div>
          <p className={styles.sectionSub}>
            Upload a self-contained HTML file (or zip with index.html). It renders in the student session panel.
            Use the AI prompt to generate one with ChatGPT/Claude.
          </p>
          <div className={styles.actionRow}>
            <button className={styles.secondaryBtn} onClick={fetchSimPrompt}>
              <Sparkles size={13} /> Get AI prompt
            </button>
            <label className={styles.primaryBtn} style={{ cursor: 'pointer' }}>
              <Upload size={13} /> Upload HTML / zip
              <input type="file" accept=".html,.zip" style={{ display: 'none' }} onChange={uploadSim} />
            </label>
            {simInfo?.has_simulation && simInfo.preview_url && (
              <a className={styles.ghostBtn} href={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api'}${simInfo.preview_url.replace('/api', '')}`}
                target="_blank" rel="noreferrer">
                <Eye size={13} /> Preview
              </a>
            )}
            {simInfo?.has_simulation && (
              <button className={styles.ghostBtn} onClick={async () => {
                await instructorService.deleteSimulation(experimentId); loadSim(); toast3('Simulation deleted.');
              }}>
                <Trash2 size={13} color="#ef4444" /> Delete
              </button>
            )}
          </div>
          {simPrompt && (
            <div className={styles.formGroup} style={{ marginTop: 14 }}>
              <label className={styles.formLabel}>Copy this prompt into ChatGPT / Claude</label>
              <pre className={styles.codeBlock} style={{ whiteSpace: 'pre-wrap', maxHeight: 280, overflow: 'auto' }}>{simPrompt}</pre>
            </div>
          )}
        </div>
      )}
    </InstructorShell>
  );
}
