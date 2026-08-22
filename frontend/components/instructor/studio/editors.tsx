'use client';

/**
 * editors.tsx — per-type body editors for studio cells.
 *
 * Every editor is controlled: it receives the block's `content_data` as `data`
 * and calls `onData(next)` with the FULL next content_data on any change. The
 * studio debounces the PATCH to updateContentModule. Editors never touch the
 * network except Code (Run via playground) and Quiz (question CRUD).
 */
import { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import { Play, Loader2, Plus, Trash2, ImageOff, Sparkles, Check as CheckIcon } from 'lucide-react';
import { renderMarkdown } from '@/lib/markdown';
import {
  executionService, type CompilerLanguage, type PlaygroundResult,
} from '@/services/execution.service';
import { instructorService } from '@/services/instructor.service';
import { asString, asBool, asNumber } from './blocks';
import shared from '@/app/instructor/shared.module.css';
import s from './studio.module.css';

export interface EditorProps {
  data: Record<string, unknown>;
  onData: (next: Record<string, unknown>) => void;
  languages?: CompilerLanguage[];
  moduleId?: string;
  experimentId?: string;
}

const FALLBACK_LANGS = ['python', 'cpp', 'c', 'java', 'javascript'];

// ── AI assist chip ────────────────────────────────────────────────────────────
// A compact "✦ AI" button that generates content for the block it sits in.
// `run` performs the type-specific generate call and applies the result; the chip
// owns its own loading / done / error state so no parent wiring is needed.
function AiChip({
  label, disabled, run,
}: { label: string; disabled?: boolean; run: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onClick = async () => {
    if (busy) return;
    setBusy(true); setErr(null); setDone(false);
    try {
      await run();
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch (e) {
      const detail = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setErr(detail || 'Generation failed — try again.');
    } finally { setBusy(false); }
  };

  return (
    <span className={s.aiChipWrap}>
      <button
        type="button" className={s.aiChip} onClick={onClick}
        disabled={busy || disabled}
        title="Generate this block's content with AI"
      >
        {busy ? <Loader2 size={13} className={s.spin} />
          : done ? <CheckIcon size={13} />
            : <Sparkles size={13} />}
        {busy ? 'Generating…' : done ? 'Done' : label}
      </button>
      {err && <span className={s.aiChipErr}>{err}</span>}
    </span>
  );
}

// ── Markdown ────────────────────────────────────────────────────────────────
export function MarkdownEditor({ data, onData, experimentId }: EditorProps) {
  const md = asString(data.md);

  const generate = async () => {
    if (!experimentId) throw new Error('no-exp');
    const res = await instructorService.generateAiContent(experimentId, {
      source: 'experiment', generate: ['notes'],
    });
    const generated = res.notes?.markdown?.trim();
    if (!generated) throw new Error('empty');
    // Append to existing notes if any, so a manual draft is never clobbered.
    onData({ ...data, md: md.trim() ? `${md.trim()}\n\n${generated}` : generated });
  };

  return (
    <div className={s.editorStack}>
      {experimentId && (
        <div className={s.aiChipBar}>
          <AiChip label="Generate notes" run={generate} />
          <span className={s.aiChipHint}>Drafts study notes from this experiment&rsquo;s aim &amp; theory.</span>
        </div>
      )}
      <div className={s.split}>
        <div className={s.splitPane}>
          <span className={s.paneLabel}>Markdown</span>
          <textarea
            className={s.codeArea} style={{ fontFamily: 'inherit', whiteSpace: 'pre-wrap' }}
            value={md} placeholder="# Heading&#10;&#10;Write **notes**, `code`, lists, [links](https://…)…"
            onChange={e => onData({ ...data, md: e.target.value })}
          />
        </div>
        <div className={s.splitPane}>
          <span className={s.paneLabel}>Preview</span>
          <div className={s.preview} dangerouslySetInnerHTML={{ __html: renderMarkdown(md) }} />
        </div>
      </div>
    </div>
  );
}

// ── Rich text (HTML) ──────────────────────────────────────────────────────────
export function TextEditor({ data, onData }: EditorProps) {
  const html = asString(data.html);
  const clean = typeof window === 'undefined' ? html : DOMPurify.sanitize(html);
  return (
    <div className={s.split}>
      <div className={s.splitPane}>
        <span className={s.paneLabel}>HTML / text</span>
        <textarea
          className={s.codeArea} style={{ fontFamily: 'inherit', whiteSpace: 'pre-wrap' }}
          value={html} placeholder="<p>Theory text — basic HTML is allowed and sanitized.</p>"
          onChange={e => onData({ ...data, html: e.target.value })}
        />
      </div>
      <div className={s.splitPane}>
        <span className={s.paneLabel}>Preview</span>
        <div className={s.preview} dangerouslySetInnerHTML={{ __html: clean }} />
      </div>
    </div>
  );
}

// ── Code (runnable) ───────────────────────────────────────────────────────────
export function CodeEditor({ data, onData, languages }: EditorProps) {
  const code = asString(data.code);
  const language = asString(data.language) || 'python';
  const stdin = asString(data.stdin);
  const runnable = asBool(data.runnable, true);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [runErr, setRunErr] = useState<string | null>(null);

  const opts = languages && languages.length
    ? languages.map(l => ({ id: l.id, label: l.label }))
    : FALLBACK_LANGS.map(id => ({ id, label: id }));

  const run = async () => {
    setRunning(true); setRunErr(null); setResult(null);
    try {
      setResult(await executionService.runPlayground({ code, language, stdin }));
    } catch {
      setRunErr('Run failed — is the execution engine up?');
    } finally { setRunning(false); }
  };

  const onTab = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart, end = el.selectionEnd;
    const next = code.slice(0, start) + '  ' + code.slice(end);
    onData({ ...data, code: next });
    requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 2; });
  };

  return (
    <div>
      <div className={s.row}>
        <div className={s.field} style={{ maxWidth: 220 }}>
          <span className={s.fieldLabel}>Language</span>
          <select className={shared.select} value={language}
            onChange={e => onData({ ...data, language: e.target.value })}>
            {opts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <label className={s.check} style={{ marginBottom: 8 }}>
          <input type="checkbox" checked={runnable}
            onChange={e => onData({ ...data, runnable: e.target.checked })} />
          Students can run this
        </label>
      </div>

      <textarea className={s.codeArea} value={code} spellCheck={false} onKeyDown={onTab}
        placeholder={`# ${language} — students see this exactly as typed`}
        onChange={e => onData({ ...data, code: e.target.value })} />

      {runnable && (
        <>
          <div className={s.field} style={{ marginTop: 10 }}>
            <span className={s.fieldLabel}>Stdin (optional — fed to the program on Run)</span>
            <textarea className={s.codeArea} style={{ minHeight: 54 }} value={stdin}
              onChange={e => onData({ ...data, stdin: e.target.value })} />
          </div>
          <div className={s.runBar}>
            <button className={shared.primaryBtn} onClick={run} disabled={running || !code.trim()}>
              {running ? <Loader2 size={13} className={s.spin} /> : <Play size={13} />}
              {running ? 'Running…' : 'Test run'}
            </button>
            <span className={shared.sectionSub} style={{ margin: 0 }}>
              Verifies your example against the live engine — nothing is graded.
            </span>
          </div>
        </>
      )}

      {runErr && <div className={`${s.runStat} ${s.runStatBad}`} style={{ marginTop: 10, borderRadius: 10 }}>{runErr}</div>}
      {result && <RunOutput r={result} />}
    </div>
  );
}

function RunOutput({ r }: { r: PlaygroundResult }) {
  const ok = r.status_id === 3;
  const body = [r.stdout, r.stderr, r.compile_output].filter(Boolean).join('\n').trim();
  return (
    <div className={s.runOut}>
      <div className={`${s.runStat} ${ok ? s.runStatOk : s.runStatBad}`}>
        <span>{ok ? '✓' : '✕'} {r.status}</span>
        {r.time_ms != null && <span>{r.time_ms} ms</span>}
        {r.memory_kb != null && <span>{Math.round(r.memory_kb / 1024)} MB</span>}
      </div>
      <pre className={s.runPre}>{body || '(no output)'}</pre>
    </div>
  );
}

// ── Image ─────────────────────────────────────────────────────────────────────
export function ImageEditor({ data, onData }: EditorProps) {
  const url = asString(data.url), alt = asString(data.alt), caption = asString(data.caption);
  const [broken, setBroken] = useState(false);
  return (
    <div>
      <div className={s.row}>
        <div className={s.field}>
          <span className={s.fieldLabel}>Image URL</span>
          <input className={shared.input} placeholder="https://…/diagram.png" value={url}
            onChange={e => { setBroken(false); onData({ ...data, url: e.target.value }); }} />
        </div>
      </div>
      <div className={s.row}>
        <div className={s.field}>
          <span className={s.fieldLabel}>Alt text (accessibility)</span>
          <input className={shared.input} value={alt}
            onChange={e => onData({ ...data, alt: e.target.value })} />
        </div>
        <div className={s.field}>
          <span className={s.fieldLabel}>Caption (shown below)</span>
          <input className={shared.input} value={caption}
            onChange={e => onData({ ...data, caption: e.target.value })} />
        </div>
      </div>
      {url && !broken && (
        <div className={s.mediaPreview}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={s.mediaImg} src={url} alt={alt} onError={() => setBroken(true)} />
        </div>
      )}
      {url && broken && (
        <div className={`${s.runStat} ${s.runStatBad}`} style={{ borderRadius: 10, marginTop: 10 }}>
          <ImageOff size={13} /> Couldn’t load that image URL.
        </div>
      )}
    </div>
  );
}

// ── URL-embed base (video / pdf) ───────────────────────────────────────────────
function UrlEmbedEditor({ data, onData, kind }: EditorProps & { kind: 'video' | 'pdf' }) {
  const url = asString(data.url);
  return (
    <div>
      <div className={s.field}>
        <span className={s.fieldLabel}>{kind === 'video' ? 'Video embed URL' : 'PDF URL'}</span>
        <input className={shared.input} placeholder="https://…" value={url}
          onChange={e => onData({ ...data, url: e.target.value })} />
      </div>
      {url && (
        <div className={s.mediaPreview}>
          <iframe className={s.embedFrame} src={url} title={kind}
            allow="fullscreen" sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" />
        </div>
      )}
    </div>
  );
}
export const VideoEditor = (p: EditorProps) => <UrlEmbedEditor {...p} kind="video" />;
export const PdfEditor = (p: EditorProps) => <UrlEmbedEditor {...p} kind="pdf" />;

// ── HTML embed (inline simulation) ─────────────────────────────────────────────
export function HtmlEditor({ data, onData }: EditorProps) {
  const html = asString(data.html);
  return (
    <div className={s.split}>
      <div className={s.splitPane}>
        <span className={s.paneLabel}>HTML source</span>
        <textarea className={s.codeArea} value={html} spellCheck={false}
          placeholder="<canvas id=…></canvas><script>/* self-contained sim */</script>"
          onChange={e => onData({ ...data, html: e.target.value })} />
      </div>
      <div className={s.splitPane}>
        <span className={s.paneLabel}>Sandboxed preview</span>
        <iframe className={s.embedFrame} title="html-embed" srcDoc={html}
          sandbox="allow-scripts allow-popups allow-forms" />
      </div>
    </div>
  );
}

// ── Link ───────────────────────────────────────────────────────────────────────
export function LinkEditor({ data, onData }: EditorProps) {
  return (
    <div>
      <div className={s.row}>
        <div className={s.field}>
          <span className={s.fieldLabel}>URL</span>
          <input className={shared.input} placeholder="https://…" value={asString(data.url)}
            onChange={e => onData({ ...data, url: e.target.value })} />
        </div>
        <div className={s.field}>
          <span className={s.fieldLabel}>Button label</span>
          <input className={shared.input} placeholder="Open the reference" value={asString(data.label)}
            onChange={e => onData({ ...data, label: e.target.value })} />
        </div>
      </div>
      <div className={s.field}>
        <span className={s.fieldLabel}>Description (optional)</span>
        <input className={shared.input} value={asString(data.description)}
          onChange={e => onData({ ...data, description: e.target.value })} />
      </div>
    </div>
  );
}

// ── Download (file by URL) ──────────────────────────────────────────────────────
export function FileEditor({ data, onData }: EditorProps) {
  const kind = asString(data.kind) || 'pdf';
  return (
    <div>
      <div className={s.row}>
        <div className={s.field}>
          <span className={s.fieldLabel}>File URL</span>
          <input className={shared.input} placeholder="https://…/dataset.csv" value={asString(data.url)}
            onChange={e => onData({ ...data, url: e.target.value })} />
        </div>
        <div className={s.field} style={{ maxWidth: 150 }}>
          <span className={s.fieldLabel}>Kind</span>
          <select className={shared.select} value={kind}
            onChange={e => onData({ ...data, kind: e.target.value })}>
            {['pdf', 'csv', 'xlsx', 'zip', 'txt', 'other'].map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
      </div>
      <div className={s.field}>
        <span className={s.fieldLabel}>Display filename</span>
        <input className={shared.input} placeholder="dataset.csv" value={asString(data.filename)}
          onChange={e => onData({ ...data, filename: e.target.value })} />
      </div>
    </div>
  );
}

// ── Quiz (config + question CRUD) ────────────────────────────────────────────────
interface QRow { id: string; question_text: string; options: string[]; correct_answer: string; points: number }
const EMPTY_Q = { question_text: '', a: '', b: '', c: '', d: '', correct_answer: 'A' };

export function QuizEditor({ data, onData, moduleId }: EditorProps) {
  const [questions, setQuestions] = useState<QRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [nq, setNq] = useState(EMPTY_Q);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    if (!moduleId) return;
    try {
      const d = await instructorService.listQuestions(moduleId);
      // `options` is a JSON column — normalise to a real array whether the API
      // hands it back as an array or a JSON-encoded string.
      const rows = ((d.questions ?? []) as QRow[]).map(q => ({
        ...q,
        options: Array.isArray(q.options)
          ? q.options
          : (() => { try { return JSON.parse(q.options as unknown as string); } catch { return []; } })(),
      }));
      setQuestions(rows);
    } catch { setQuestions([]); }
    finally { setLoaded(true); }
  };
  // Load this quiz's questions once when the cell mounts / its id resolves.
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [moduleId]);

  const addQ = async () => {
    if (!moduleId) return;
    if (!nq.question_text || !nq.a || !nq.b || !nq.c || !nq.d) { setErr('Fill the question and all 4 options.'); return; }
    setBusy(true); setErr(null);
    try {
      await instructorService.addQuestions(moduleId, {
        question_text: nq.question_text, options: [nq.a, nq.b, nq.c, nq.d],
        correct_answer: nq.correct_answer, points: 1,
      });
      setNq(EMPTY_Q);
      await load();
    } catch (e: unknown) {
      const x = e as { response?: { data?: { error?: string } } };
      setErr(x?.response?.data?.error ?? 'Failed to add question.');
    } finally { setBusy(false); }
  };

  const delQ = async (id: string) => {
    try { await instructorService.deleteQuestion(id); setQuestions(qs => qs.filter(q => q.id !== id)); }
    catch { setErr('Failed to delete question.'); }
  };

  return (
    <div>
      {/* config */}
      <div className={s.row}>
        <div className={s.field} style={{ maxWidth: 130 }}>
          <span className={s.fieldLabel}>Pass %</span>
          <input className={shared.input} type="number" min={0} max={100}
            value={asNumber(data.pass_threshold, 70)}
            onChange={e => onData({ ...data, pass_threshold: Number(e.target.value) })} />
        </div>
        <div className={s.field} style={{ maxWidth: 130 }}>
          <span className={s.fieldLabel}>Max attempts</span>
          <input className={shared.input} type="number" min={1}
            value={asNumber(data.max_attempts, 3)}
            onChange={e => onData({ ...data, max_attempts: Number(e.target.value) })} />
        </div>
        <div className={s.field} style={{ maxWidth: 150 }}>
          <span className={s.fieldLabel}>Cooldown (min)</span>
          <input className={shared.input} type="number" min={0}
            value={asNumber(data.cooldown_minutes, 30)}
            onChange={e => onData({ ...data, cooldown_minutes: Number(e.target.value) })} />
        </div>
        <label className={s.check} style={{ marginBottom: 8 }}>
          <input type="checkbox" checked={asBool(data.shuffle, true)}
            onChange={e => onData({ ...data, shuffle: e.target.checked })} />
          Shuffle questions
        </label>
      </div>

      {/* questions */}
      <span className={s.fieldLabel} style={{ display: 'block', margin: '4px 0 6px' }}>
        Questions ({questions.length})
      </span>
      <div className={s.qList}>
        {questions.map((q, i) => (
          <div key={q.id} className={s.qRow}>
            <div>
              <p className={s.qText}>{i + 1}. {q.question_text}</p>
              <p className={s.qOpts}>
                {(Array.isArray(q.options) ? q.options : []).map((o, oi) => `${'ABCD'[oi]}: ${o}`).join('  ·  ')} — answer <b>{q.correct_answer}</b>
              </p>
            </div>
            <button className={`${s.iconBtn} ${s.iconBtnDanger}`} onClick={() => delQ(q.id)} title="Delete">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {loaded && questions.length === 0 && (
          <p className={shared.sectionSub} style={{ margin: 0 }}>No questions yet — add the first below.</p>
        )}
      </div>

      {/* new question */}
      <div className={s.field}>
        <span className={s.fieldLabel}>New question</span>
        <input className={shared.input} placeholder="Question text" value={nq.question_text}
          onChange={e => setNq(q => ({ ...q, question_text: e.target.value }))} />
      </div>
      <div className={s.row} style={{ marginTop: 8 }}>
        {(['a', 'b', 'c', 'd'] as const).map(k => (
          <div key={k} className={s.field} style={{ minWidth: 140 }}>
            <span className={s.fieldLabel}>Option {k.toUpperCase()}</span>
            <input className={shared.input} value={nq[k]}
              onChange={e => setNq(q => ({ ...q, [k]: e.target.value }))} />
          </div>
        ))}
      </div>
      <div className={s.runBar}>
        <select className={shared.select} style={{ maxWidth: 150 }} value={nq.correct_answer}
          onChange={e => setNq(q => ({ ...q, correct_answer: e.target.value }))}>
          {['A', 'B', 'C', 'D'].map(x => <option key={x} value={x}>Correct: {x}</option>)}
        </select>
        <button className={shared.primaryBtn} onClick={addQ} disabled={busy}>
          <Plus size={13} /> Add question
        </button>
        {err && <span style={{ color: '#ef4444', fontSize: 12.5, fontWeight: 600 }}>{err}</span>}
      </div>
    </div>
  );
}

// ── Graded coding assignment ─────────────────────────────────────────────────────
interface TC { input?: string; expected?: string; hidden?: boolean; weight?: number }

export function AssignEditor({ data, onData, languages, experimentId }: EditorProps) {
  const language = asString(data.language) || 'python';
  const opts = languages && languages.length
    ? languages.map(l => ({ id: l.id, label: l.label }))
    : FALLBACK_LANGS.map(id => ({ id, label: id }));
  const tests: TC[] = Array.isArray(data.test_cases) ? (data.test_cases as TC[]) : [];

  const setTests = (next: TC[]) => onData({ ...data, test_cases: next });
  const addTest = () => setTests([...tests, { input: '', expected: '', hidden: false, weight: 1 }]);
  const updTest = (i: number, patch: Partial<TC>) =>
    setTests(tests.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const delTest = (i: number) => setTests(tests.filter((_, j) => j !== i));

  const generateStarter = async () => {
    if (!experimentId) throw new Error('no-exp');
    const res = await instructorService.generateAiContent(experimentId, {
      source: 'experiment', generate: ['code'], language,
    });
    const snippet = res.code_snippets?.[0];
    if (!snippet?.code?.trim()) throw new Error('empty');
    onData({
      ...data,
      language: snippet.language || language,
      starter_code: snippet.code,
      // Seed instructions from the snippet description only if none written yet.
      instructions: asString(data.instructions).trim()
        ? data.instructions
        : (snippet.description || ''),
    });
  };

  return (
    <div>
      {experimentId && (
        <div className={s.aiChipBar}>
          <AiChip label="Generate starter code" run={generateStarter} />
          <span className={s.aiChipHint}>Drafts starter code (and instructions, if empty) for the selected language.</span>
        </div>
      )}
      <div className={s.row}>
        <div className={s.field} style={{ maxWidth: 220 }}>
          <span className={s.fieldLabel}>Language</span>
          <select className={shared.select} value={language}
            onChange={e => onData({ ...data, language: e.target.value })}>
            {opts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <div className={s.field} style={{ maxWidth: 130 }}>
          <span className={s.fieldLabel}>Pass %</span>
          <input className={shared.input} type="number" min={0} max={100}
            value={asNumber(data.pass_threshold, 60)}
            onChange={e => onData({ ...data, pass_threshold: Number(e.target.value) })} />
        </div>
        <div className={s.field} style={{ maxWidth: 150 }}>
          <span className={s.fieldLabel}>Time limit (s)</span>
          <input className={shared.input} type="number" min={1}
            value={asNumber(data.time_limit_sec, 5)}
            onChange={e => onData({ ...data, time_limit_sec: Number(e.target.value) })} />
        </div>
      </div>

      <div className={s.field}>
        <span className={s.fieldLabel}>Instructions (shown to students)</span>
        <textarea className={s.codeArea} style={{ fontFamily: 'inherit', whiteSpace: 'pre-wrap', minHeight: 80 }}
          value={asString(data.instructions)}
          placeholder="Describe the task, the input/output format, and any constraints…"
          onChange={e => onData({ ...data, instructions: e.target.value })} />
      </div>

      <div className={s.field} style={{ marginTop: 10 }}>
        <span className={s.fieldLabel}>Starter code (pre-filled in the student editor)</span>
        <textarea className={s.codeArea} value={asString(data.starter_code)} spellCheck={false}
          placeholder={`# ${language} starter`}
          onChange={e => onData({ ...data, starter_code: e.target.value })} />
      </div>

      <span className={s.fieldLabel} style={{ display: 'block', margin: '12px 0 6px' }}>
        Test cases ({tests.length}) — hidden ones grade silently; stdin is fed to the program, stdout is compared to “expected”.
      </span>
      <div className={s.qList}>
        {tests.map((t, i) => (
          <div key={i} className={s.qRow} style={{ display: 'block' }}>
            <div className={s.row} style={{ marginBottom: 8, alignItems: 'center' }}>
              <span className={s.typeTag}>#{i + 1}</span>
              <label className={s.check}>
                <input type="checkbox" checked={!!t.hidden}
                  onChange={e => updTest(i, { hidden: e.target.checked })} /> Hidden
              </label>
              <div className={s.field} style={{ maxWidth: 110 }}>
                <span className={s.fieldLabel}>Weight</span>
                <input className={shared.input} type="number" min={1}
                  value={typeof t.weight === 'number' ? t.weight : 1}
                  onChange={e => updTest(i, { weight: Number(e.target.value) })} />
              </div>
              <span className={s.barSpacer} />
              <button className={`${s.iconBtn} ${s.iconBtnDanger}`} onClick={() => delTest(i)} title="Remove test">
                <Trash2 size={13} />
              </button>
            </div>
            <div className={s.split}>
              <div className={s.splitPane}>
                <span className={s.paneLabel}>Stdin</span>
                <textarea className={s.codeArea} style={{ minHeight: 60 }} value={asString(t.input)}
                  onChange={e => updTest(i, { input: e.target.value })} />
              </div>
              <div className={s.splitPane}>
                <span className={s.paneLabel}>Expected stdout</span>
                <textarea className={s.codeArea} style={{ minHeight: 60 }} value={asString(t.expected)}
                  onChange={e => updTest(i, { expected: e.target.value })} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <button className={shared.secondaryBtn} onClick={addTest} style={{ marginTop: 4 }}>
        <Plus size={13} /> Add test case
      </button>
    </div>
  );
}


// ── AI Viva ──────────────────────────────────────────────────────────────────────
interface VivaQ { question: string; expected_answer: string; topics: string[]; difficulty: number | null }

export function VivaEditor({ data, onData, moduleId, experimentId }: EditorProps) {
  const mode: 'topics' | 'content' = asString(data.mode) === 'content' ? 'content' : 'topics';
  const topics: string[] = Array.isArray(data.topics) ? data.topics as string[] : [];
  const topicsStr = topics.join(', ');
  const count = asNumber(data.count, 5);
  const difficulty = data.difficulty as number | null;
  const passThreshold = asNumber(data.pass_threshold, 70);
  const questions: VivaQ[] = Array.isArray(data.questions) ? data.questions as VivaQ[] : [];

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [genQuestions, setGenQuestions] = useState<VivaQ[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  const handleGenerate = async () => {
    if (mode === 'topics' && !topicsStr.trim()) {
      setErr('Enter at least one topic (comma-separated).');
      return;
    }
    if (!experimentId) {
      setErr('Experiment context missing — can’t generate questions.');
      return;
    }
    setBusy(true);
    setErr(null);
    setGenQuestions([]);
    try {
      const res = await instructorService.generateVivaQuestions(experimentId, {
        source: mode,
        topics: mode === 'topics' ? topicsStr.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        count,
        difficulty: difficulty ?? undefined,
      });
      setGenQuestions(res.questions);
      setShowPreview(true);
    } catch (e: unknown) {
      const x = e as { response?: { data?: { error?: string } } };
      setErr(x?.response?.data?.error ?? 'Failed to generate questions.');
    } finally {
      setBusy(false);
    }
  };

  const applyGenerated = () => {
    if (genQuestions.length === 0) return;
    onData({
      ...data,
      mode,
      topics: mode === 'topics' ? topicsStr.split(',').map(s => s.trim()).filter(Boolean) : [],
      count,
      difficulty,
      pass_threshold: passThreshold,
      questions: genQuestions,
    });
    setShowPreview(false);
  };

  return (
    <div>
      {/* Mode selector */}
      <div className={s.row} style={{ marginBottom: 12 }}>
        <div className={s.field} style={{ maxWidth: 180 }}>
          <span className={s.fieldLabel}>Source</span>
          <select className={shared.select} value={mode}
            onChange={e => { onData({ ...data, mode: e.target.value }); setGenQuestions([]); setShowPreview(false); }}>
            <option value="topics">Topics I specify</option>
            <option value="content">From experiment content</option>
          </select>
        </div>
      </div>

      {/* Topics input (only for topics mode) */}
      {mode === 'topics' && (
        <div className={s.field} style={{ marginBottom: 10 }}>
          <span className={s.fieldLabel}>Topics (comma-separated)</span>
          <input className={shared.input} placeholder="arrays, sorting, recursion, dynamic programming"
            value={topicsStr} onChange={e => onData({ ...data, topics: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
          <span className={shared.sectionSub}>AI will focus questions on these topics.</span>
        </div>
      )}

      {/* Content mode hint */}
      {mode === 'content' && (
        <div className={s.field} style={{ marginBottom: 10, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '10px 12px' }}>
          <span className={shared.sectionSub}>
            AI will read the experiment's aim, theory, and existing blocks (markdown, text, code, assign)
            to derive relevant questions.
          </span>
        </div>
      )}

      {/* Settings */}
      <div className={s.row} style={{ marginBottom: 12 }}>
        <div className={s.field} style={{ maxWidth: 100 }}>
          <span className={s.fieldLabel}>Questions</span>
          <input className={shared.input} type="number" min={1} max={10} value={count}
            onChange={e => onData({ ...data, count: Math.max(1, Math.min(10, Number(e.target.value) || 5)) })} />
        </div>
        <div className={s.field} style={{ maxWidth: 130 }}>
          <span className={s.fieldLabel}>Difficulty (1–4)</span>
          <input className={shared.input} type="number" min={1} max={4}
            value={difficulty ?? ''} placeholder="optional"
            onChange={e => {
              const v = e.target.value ? Math.max(1, Math.min(4, Number(e.target.value))) : null;
              onData({ ...data, difficulty: v });
            }} />
        </div>
        <div className={s.field} style={{ maxWidth: 100 }}>
          <span className={s.fieldLabel}>Pass %</span>
          <input className={shared.input} type="number" min={0} max={100}
            value={passThreshold}
            onChange={e => onData({ ...data, pass_threshold: Number(e.target.value) })} />
        </div>
      </div>

      {/* Generate button */}
      <div className={s.runBar}>
        <button className={shared.primaryBtn} onClick={handleGenerate} disabled={busy || !moduleId || !experimentId}>
          {busy ? <Loader2 size={13} className={s.spin} /> : <Sparkles size={13} />}
          {busy ? 'Generating…' : 'Generate questions'}
        </button>
        {err && <span style={{ color: '#ef4444', fontSize: 12.5, fontWeight: 600 }}>{err}</span>}
      </div>

      {/* Preview generated questions */}
      {showPreview && genQuestions.length > 0 && (
        <div style={{ marginTop: 16, padding: 12, border: '1px solid #e5e7eb', borderRadius: 10, background: '#fafafa' }}>
          <div className={s.runBar} style={{ marginBottom: 8 }}>
            <span className={s.typeTag} style={{ fontSize: 13, fontWeight: 600 }}>
              Preview ({genQuestions.length} questions) — review before saving
            </span>
          </div>
          <div className={s.qList}>
            {genQuestions.map((q, i) => (
              <div key={i} className={s.qRow} style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: 8, marginBottom: 8 }}>
                <div>
                  <p className={s.qText} style={{ fontSize: 13.5 }}><b>{i + 1}.</b> {q.question}</p>
                  <p className={s.qOpts} style={{ fontSize: 12.5 }}>
                    <b>Answer:</b> {q.expected_answer} &nbsp;|&nbsp;
                    <b>Topics:</b> {q.topics.length ? q.topics.join(', ') : '—'} &nbsp;|&nbsp;
                    <b>Difficulty:</b> {q.difficulty ?? '—'}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className={s.runBar}>
            <button className={shared.primaryBtn} onClick={applyGenerated}>
              <CheckIcon size={13} /> Apply to block
            </button>
            <button className={shared.secondaryBtn} onClick={() => { setShowPreview(false); setGenQuestions([]); }}>
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Already saved questions (read-only display) */}
      {questions.length > 0 && !showPreview && (
        <div style={{ marginTop: 12, padding: 12, border: '1px solid #e5e7eb', borderRadius: 10, background: '#fafafa' }}>
          <span className={s.typeTag} style={{ fontSize: 13, fontWeight: 600 }}>
            Stored ({questions.length} questions)
          </span>
          <div className={s.qList} style={{ marginTop: 8 }}>
            {questions.map((q, i) => (
              <div key={i} className={s.qRow} style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: 8, marginBottom: 8 }}>
                <p className={s.qText} style={{ fontSize: 13.5 }}><b>{i + 1}.</b> {q.question}</p>
                <p className={s.qOpts} style={{ fontSize: 12.5 }}>
                  <b>Answer:</b> {q.expected_answer} &nbsp;|&nbsp;
                  <b>Topics:</b> {q.topics.length ? q.topics.join(', ') : '—'} &nbsp;|&nbsp;
                  <b>Difficulty:</b> {q.difficulty ?? '—'}
                </p>
              </div>
            ))}
          </div>
          <div className={s.runBar}>
            <button className={shared.secondaryBtn} onClick={handleGenerate}>
              <Sparkles size={13} /> Regenerate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
