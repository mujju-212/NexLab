'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen, Video, FileText, HelpCircle, Plus, ArrowUp, ArrowDown,
  Trash2, X, ExternalLink, Code2, Image as ImageIcon, FileCode, Play, Loader2,
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import { experimentService } from '@/services/experiment.service';
import { instructorService } from '@/services/instructor.service';
import { executionService, type CompilerLanguage, type PlaygroundResult } from '@/services/execution.service';
import { renderMarkdown } from '@/lib/markdown';
import styles from '../shared.module.css';

interface ExpLite { id: string; title: string; exp_number: string }

type ModuleType = 'text' | 'video' | 'pdf' | 'quiz' | 'markdown' | 'code' | 'image';

interface ContentModule {
  id: string;
  module_type: ModuleType;
  title: string;
  content_data: Record<string, unknown> | null;
  display_order: number;
  min_watch_pct: number;
  question_count?: number;
}

const errText = (err: unknown) =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error
  || 'Something went wrong';

export default function ContentLibraryPage() {
  const router = useRouter();
  const [experiments, setExperiments] = useState<ExpLite[]>([]);
  const [expId, setExpId] = useState('');
  const [modules, setModules] = useState<ContentModule[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [languages, setLanguages] = useState<CompilerLanguage[]>([]);

  // Add-module form
  const [showAdd, setShowAdd] = useState(false);
  const [newType, setNewType] = useState<ModuleType>('markdown');
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newHtml, setNewHtml] = useState('');
  const [newMd, setNewMd] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newLang, setNewLang] = useState('python');
  const [newStdin, setNewStdin] = useState('');
  const [newRunnable, setNewRunnable] = useState(true);
  const [newAlt, setNewAlt] = useState('');
  const [newCaption, setNewCaption] = useState('');
  const [minWatchPct, setMinWatchPct] = useState(80);

  // Inline run preview (code block author test)
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<PlaygroundResult | null>(null);

  const toast3 = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // ── Load experiments + language catalog once ─────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const exps = (await experimentService.listMine()) as ExpLite[];
        setExperiments(exps);
        if (exps.length > 0) setExpId(exps[0].id);
      } catch (err) {
        toast3(errText(err));
      }
    })();
    (async () => {
      try {
        const { languages: langs } = await executionService.listLanguages();
        setLanguages(langs);
        const py = langs.find((l) => l.id === 'python');
        if (py) setNewLang(py.id);
        else if (langs[0]) setNewLang(langs[0].id);
      } catch {
        /* language catalog is best-effort; code block still saves without it */
      }
    })();
  }, []);

  const loadModules = async (id: string) => {
    setLoading(true);
    try {
      const res = await instructorService.listContent(id);
      setModules(res.content_modules ?? []);
    } catch (err) {
      toast3(errText(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (expId) loadModules(expId);
    else setModules([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expId]);

  const resetForm = () => {
    setNewTitle(''); setNewUrl(''); setNewHtml(''); setNewMd('');
    setNewCode(''); setNewStdin(''); setNewRunnable(true);
    setNewAlt(''); setNewCaption(''); setRunResult(null);
  };

  const handleAdd = async () => {
    if (!expId || !newTitle.trim()) {
      toast3('Title is required');
      return;
    }
    setBusy(true);
    try {
      let content_data: Record<string, unknown> = {};
      if (newType === 'text') content_data = { html: newHtml };
      if (newType === 'video') content_data = { url: newUrl };
      if (newType === 'pdf') content_data = { url: newUrl };
      if (newType === 'markdown') content_data = { md: newMd };
      if (newType === 'code') {
        content_data = { language: newLang, code: newCode, runnable: newRunnable, stdin: newStdin };
      }
      if (newType === 'image') content_data = { url: newUrl, alt: newAlt, caption: newCaption };
      if (newType === 'quiz') {
        content_data = { pass_threshold: 70, max_attempts: 3, cooldown_minutes: 30, shuffle: true };
      }
      await instructorService.addContentModule(expId, {
        module_type: newType,
        title: newTitle.trim(),
        content_data,
        ...(newType === 'video' ? { min_watch_pct: minWatchPct } : {}),
      });
      toast3('Module added');
      setShowAdd(false);
      resetForm();
      await loadModules(expId);
    } catch (err) {
      toast3(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRun = async () => {
    if (!newCode.trim()) { toast3('Write some code to run'); return; }
    setRunning(true);
    setRunResult(null);
    try {
      const res = await executionService.runPlayground({
        code: newCode, language: newLang, stdin: newStdin,
      });
      setRunResult(res);
    } catch (err) {
      toast3(errText(err));
    } finally {
      setRunning(false);
    }
  };

  const handleDelete = async (m: ContentModule) => {
    if (!window.confirm(`Delete module "${m.title}"?`)) return;
    try {
      await instructorService.deleteContentModule(expId, m.id);
      toast3('Module deleted');
      await loadModules(expId);
    } catch (err) {
      toast3(errText(err));
    }
  };

  const handleMove = async (index: number, dir: -1 | 1) => {
    const next = [...modules];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setModules(next); // optimistic
    try {
      await instructorService.reorderContent(expId, next.map((m) => m.id));
    } catch (err) {
      toast3(errText(err));
      await loadModules(expId);
    }
  };

  const typeIcon = (t: ModuleType) =>
    t === 'video' ? <Video size={20} /> :
    t === 'pdf' ? <FileText size={20} /> :
    t === 'quiz' ? <HelpCircle size={20} /> :
    t === 'markdown' ? <FileCode size={20} /> :
    t === 'code' ? <Code2 size={20} /> :
    t === 'image' ? <ImageIcon size={20} /> : <BookOpen size={20} />;

  const typeLabel = (t: ModuleType) =>
    t === 'video' ? 'Video' : t === 'pdf' ? 'PDF' : t === 'quiz' ? 'Quiz' :
    t === 'markdown' ? 'Markdown' : t === 'code' ? 'Code' : t === 'image' ? 'Image' : 'Text';

  const rowSub = (m: ContentModule) => {
    if (m.module_type === 'quiz') return `${m.question_count ?? 0} question(s)`;
    if (m.module_type === 'video') return `Min watch: ${m.min_watch_pct ?? 80}%${typeof m.content_data?.url === 'string' ? ' · URL attached' : ''}`;
    if (m.module_type === 'pdf') return typeof m.content_data?.url === 'string' ? 'URL attached' : 'No URL yet';
    if (m.module_type === 'code') {
      const lang = String(m.content_data?.language ?? '');
      const runnable = m.content_data?.runnable ? 'runnable' : 'read-only';
      return `${lang || 'code'} · ${runnable}`;
    }
    if (m.module_type === 'image') return typeof m.content_data?.url === 'string' ? 'Image attached' : 'No URL yet';
    if (m.module_type === 'markdown') return 'Rich text (Markdown)';
    return 'Reading';
  };

  const PLACEHOLDER_MD = '# Heading\n\nExplain the concept here. **Bold**, *italic*, `inline code`.\n\n- point one\n- point two\n\n```python\nprint("fenced code block")\n```';

  return (
    <InstructorShell
      activePage="Content Library"
      title="Pre-Lab Content Library"
      subtitle="Author the text, markdown, code, image, video, PDF, and quiz modules students complete before a lab session"
    >
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1000, background: '#201b2e',
          color: '#fff', padding: '12px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
        }}>
          {toast}
        </div>
      )}

      {/* Top Action Bar */}
      <div className={styles.actionRow}>
        <select className={styles.select} style={{ maxWidth: 380 }}
          value={expId} onChange={(e) => setExpId(e.target.value)}>
          <option value="">Select an experiment…</option>
          {experiments.map((e) => (
            <option key={e.id} value={e.id}>Exp {e.exp_number} — {e.title}</option>
          ))}
        </select>
        <button type="button" className={styles.primaryBtn} disabled={!expId}
          onClick={() => { resetForm(); setShowAdd(true); }}>
          <Plus size={16} strokeWidth={2} /> Add Content Module
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={() => router.push('/instructor/experiments')}>
          <BookOpen size={16} strokeWidth={1.9} /> Experiment Authoring
        </button>
      </div>

      {/* Module List */}
      <section className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Content Modules</h2>
            <p className={styles.sectionSub}>
              {loading ? 'Loading…' : expId
                ? `${modules.length} module(s) in student completion order`
                : 'Select an experiment to manage its pre-lab content'}
            </p>
          </div>
        </div>

        <div className={styles.list}>
          {modules.map((m, i) => (
            <div key={m.id} className={styles.listRow}>
              <div className={styles.rowIcon}>{typeIcon(m.module_type)}</div>
              <div className={styles.rowBody}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <p className={styles.rowTitle}>{i + 1}. {m.title}</p>
                  <span className={`${styles.pill} ${styles.pillBlue}`}>{typeLabel(m.module_type)}</span>
                </div>
                <p className={styles.rowSub}>{rowSub(m)}</p>
              </div>
              <div className={styles.rowSide}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {(m.module_type === 'video' || m.module_type === 'pdf' || m.module_type === 'image') && typeof m.content_data?.url === 'string' && (
                    <a className={styles.ghostBtn} style={{ minHeight: 32, padding: '0 10px', fontSize: 11.5, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      href={String(m.content_data.url)} target="_blank" rel="noreferrer">
                      <ExternalLink size={12} /> Open
                    </a>
                  )}
                  {m.module_type === 'quiz' && (
                    <button type="button" className={styles.ghostBtn}
                      style={{ minHeight: 32, padding: '0 10px', fontSize: 11.5 }}
                      onClick={() => router.push(`/instructor/experiments/${expId}/edit?tab=content`)}>
                      <HelpCircle size={12} /> Questions
                    </button>
                  )}
                  <button type="button" className={styles.ghostBtn}
                    style={{ minHeight: 32, padding: '0 8px' }}
                    disabled={i === 0} onClick={() => handleMove(i, -1)}>
                    <ArrowUp size={13} />
                  </button>
                  <button type="button" className={styles.ghostBtn}
                    style={{ minHeight: 32, padding: '0 8px' }}
                    disabled={i === modules.length - 1} onClick={() => handleMove(i, 1)}>
                    <ArrowDown size={13} />
                  </button>
                  <button type="button" className={styles.secondaryBtn}
                    style={{ minHeight: 32, padding: '0 10px', fontSize: 11.5, color: '#b91c1c' }}
                    onClick={() => handleDelete(m)}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {!loading && expId && modules.length === 0 && (
            <p className={styles.sectionSub} style={{ padding: 16 }}>
              No content modules yet. Add the first one students must complete before the lab.
            </p>
          )}
        </div>
      </section>

      {showAdd && renderAddModal()}
    </InstructorShell>
  );

  // ── Add-module modal (kept as a closure so it can read builder state) ─────────
  function renderAddModal() {
    return (
      <div className={styles.modalOverlay} onClick={() => setShowAdd(false)}>
        <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720, width: '92%' }}>
          <div className={styles.modalHeader}>
            <div>
              <h3 className={styles.modalTitle}>Add Content Module</h3>
              <p className={styles.sectionSub}>Appended to the end of the pre-lab sequence</p>
            </div>
            <button type="button" className={styles.closeBtn} onClick={() => setShowAdd(false)}>
              <X size={18} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Module Type</label>
              <select className={styles.select} value={newType}
                onChange={(e) => { setNewType(e.target.value as ModuleType); setRunResult(null); }}>
                <option value="markdown">Markdown / Rich Text</option>
                <option value="code">Code Snippet (runnable)</option>
                <option value="image">Image / Diagram</option>
                <option value="video">Video Walkthrough</option>
                <option value="pdf">PDF Manual</option>
                <option value="text">Text / Theory (raw HTML)</option>
                <option value="quiz">Pre-Lab Quiz</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Title</label>
              <input type="text" className={styles.input} placeholder="e.g. Stack Concept Walkthrough"
                value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            </div>
          </div>

          {renderTypeFields()}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <button type="button" className={styles.secondaryBtn} onClick={() => setShowAdd(false)}>Cancel</button>
            <button type="button" className={styles.primaryBtn} disabled={busy} onClick={handleAdd}>
              {busy ? 'Adding…' : 'Add Module'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Per-type form fields ──────────────────────────────────────────────────────
  function renderTypeFields() {
    if (newType === 'markdown') {
      return (
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Markdown Source</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <textarea className={styles.textarea} rows={12} placeholder={PLACEHOLDER_MD}
              value={newMd} onChange={(e) => setNewMd(e.target.value)}
              style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }} />
            <div style={{ border: '1px solid #e5e0ec', borderRadius: 8, padding: '10px 14px', overflow: 'auto', maxHeight: 320, background: '#fbfaff' }}>
              <div className="md-preview"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(newMd || '*Live preview appears here…*') }} />
            </div>
          </div>
          <p className={styles.sectionSub} style={{ marginTop: 6 }}>
            Supports headings, <strong>bold</strong>, <em>italic</em>, lists, links, blockquotes, and fenced code. Sanitized on render.
          </p>
        </div>
      );
    }

    if (newType === 'code') {
      return (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Language</label>
              <select className={styles.select} value={newLang} onChange={(e) => setNewLang(e.target.value)}>
                {languages.length === 0 && <option value={newLang}>{newLang}</option>}
                {languages.map((l) => (
                  <option key={l.id} value={l.id}>{l.label}{l.version ? ` — ${l.version}` : ''}</option>
                ))}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={newRunnable}
                  onChange={(e) => setNewRunnable(e.target.checked)} />
                Runnable by students
              </label>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Code</label>
            <textarea className={styles.textarea} rows={9}
              placeholder="print('hello')"
              value={newCode} onChange={(e) => setNewCode(e.target.value)}
              style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }} />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Standard Input (stdin, optional)</label>
            <textarea className={styles.textarea} rows={2}
              value={newStdin} onChange={(e) => setNewStdin(e.target.value)}
              style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" className={styles.secondaryBtn} disabled={running} onClick={handleRun}>
              {running ? <><Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Running…</> : <><Play size={14} /> Test Run</>}
            </button>
            <span className={styles.sectionSub}>Verify the snippet before saving. Uses the same sandbox students run in.</span>
          </div>

          {runResult && (
            <div style={{ marginTop: 12, border: '1px solid #e5e0ec', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{
                display: 'flex', gap: 12, padding: '8px 12px', fontSize: 12, fontWeight: 600,
                background: runResult.status_id === 3 ? '#ecfdf3' : '#fef2f2',
                color: runResult.status_id === 3 ? '#067647' : '#b42318',
              }}>
                <span>{runResult.status}</span>
                {runResult.time_ms != null && <span style={{ fontWeight: 500 }}>{runResult.time_ms} ms</span>}
                {runResult.memory_kb != null && <span style={{ fontWeight: 500 }}>{Math.round(runResult.memory_kb / 1024)} MB</span>}
              </div>
              {(runResult.compile_output || runResult.stderr || runResult.stdout) && (
                <pre style={{ margin: 0, padding: '10px 12px', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 220, overflow: 'auto', background: '#0f0b17', color: '#e7e3f0' }}>
                  {runResult.compile_output || runResult.stderr || runResult.stdout}
                </pre>
              )}
            </div>
          )}
        </>
      );
    }

    if (newType === 'image') {
      return (
        <>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Image URL</label>
            <input type="text" className={styles.input} placeholder="https://…"
              value={newUrl} onChange={(e) => setNewUrl(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Alt Text (accessibility)</label>
              <input type="text" className={styles.input} placeholder="Diagram of a stack"
                value={newAlt} onChange={(e) => setNewAlt(e.target.value)} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Caption (optional)</label>
              <input type="text" className={styles.input}
                value={newCaption} onChange={(e) => setNewCaption(e.target.value)} />
            </div>
          </div>
          {newUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={newUrl} alt={newAlt || 'preview'}
              style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 8, border: '1px solid #e5e0ec', marginTop: 4 }} />
          )}
        </>
      );
    }

    if (newType === 'video' || newType === 'pdf') {
      return (
        <>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{newType === 'video' ? 'Video URL (YouTube / Cloudinary)' : 'PDF URL (Cloudinary)'}</label>
            <input type="text" className={styles.input} placeholder="https://…"
              value={newUrl} onChange={(e) => setNewUrl(e.target.value)} />
          </div>
          {newType === 'video' && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Minimum Watch % to pass gate</label>
              <input type="number" className={styles.input} min={1} max={100}
                value={minWatchPct} onChange={(e) => setMinWatchPct(Number(e.target.value))} />
            </div>
          )}
        </>
      );
    }

    if (newType === 'text') {
      return (
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Theory Content (HTML)</label>
          <textarea className={styles.textarea} rows={5}
            placeholder="<p>Theory explanation…</p>"
            value={newHtml} onChange={(e) => setNewHtml(e.target.value)} />
        </div>
      );
    }

    // quiz
    return (
      <p className={styles.sectionSub}>
        Quiz starts with default config (pass 70%, 3 attempts, 30 min cooldown).
        Add questions afterwards from the experiment editor.
      </p>
    );
  }
}
