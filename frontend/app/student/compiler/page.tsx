'use client';

/**
 * Student Compiler — a free-practice playground that runs real code through
 * Judge0 and shows the whole verdict, not just stdout.
 *
 * Nothing here is graded: it posts to /execution/playground (no experiment, no
 * attempt row) and /ai/code-assist (no HintLog, no deduction).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  Play, Loader2, Copy, Check, Download, RotateCcw, Terminal, Sparkles,
  Lightbulb, Bug, ClipboardCheck, AlertTriangle, CheckCircle2, Clock,
  Cpu, Send, Info, Eraser, ChevronDown, Globe, RefreshCcw,
} from 'lucide-react';
import StudentShell from '@/components/layout/StudentShell';
import CodeEditor from '@/components/editor/code-editor';
import { executionService, type CompilerLanguage, type PlaygroundResult } from '@/services/execution.service';
import { aiService, type CodeAssistMode, type CodeAssistResponse } from '@/services/ai.service';
import styles from './page.module.css';

const LANG_KEY = 'nexlab.compiler.lang';
const draftKey = (id: string) => `nexlab.compiler.draft.${id}`;
const stdinKey = (id: string) => `nexlab.compiler.stdin.${id}`;

const QUICK_ACTIONS: Array<{
  mode: Exclude<CodeAssistMode, 'ask'>;
  label: string;
  Icon: typeof Lightbulb;
}> = [
  { mode: 'hint',          label: 'Nudge me',    Icon: Lightbulb },
  { mode: 'explain_error', label: 'Explain error', Icon: Bug },
  { mode: 'review',        label: 'Review code', Icon: ClipboardCheck },
];

/** Axios rejects with the raw error; the backend puts its reason in `error`. */
function errMsg(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e)) {
    const detail = (e.response?.data as { error?: string } | undefined)?.error;
    if (detail) return detail;
    if (e.code === 'ECONNABORTED') return 'Timed out waiting for the runner. Try again.';
    if (!e.response) return 'Cannot reach the server. Is the backend running?';
  }
  return e instanceof Error && e.message ? e.message : fallback;
}

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode / quota — drafts are a convenience, never a requirement */
  }
}

export default function StudentCompilerPage() {
  const [languages, setLanguages] = useState<CompilerLanguage[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [langId, setLangId] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  const [code, setCode] = useState('');
  const [stdin, setStdin] = useState('');
  const [showStdin, setShowStdin] = useState(false);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [runError, setRunError] = useState('');

  const [assist, setAssist] = useState<CodeAssistResponse | null>(null);
  const [assistBusy, setAssistBusy] = useState<CodeAssistMode | null>(null);
  const [assistError, setAssistError] = useState('');
  const [question, setQuestion] = useState('');

  const [copied, setCopied] = useState(false);
  // ── Browser preview (HTML/CSS) ─────────────────────────────────────────────
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lang = useMemo(
    () => languages.find((l) => l.id === langId) ?? null,
    [languages, langId],
  );

  const isBrowserLang = lang?.engine === 'browser';

  // Ref mirror so the draft-persisting effect and the language switch can read
  // the live buffer without re-subscribing on every keystroke.
  const codeRef = useRef(code);
  codeRef.current = code;
  const stdinRef = useRef(stdin);
  stdinRef.current = stdin;

  // ── Load the catalog, then restore the student's last language ────────────
  useEffect(() => {
    let alive = true;
    executionService.listLanguages()
      .then(({ languages: list, groups: order }) => {
        if (!alive) return;
        setLanguages(list);
        setGroups(order);
        const saved = readLocal(LANG_KEY);
        const initial = list.find((l) => l.id === saved) ?? list.find((l) => l.id === 'python') ?? list[0];
        if (!initial) return;
        setLangId(initial.id);
        setCode(readLocal(draftKey(initial.id)) ?? initial.starter);
        setStdin(readLocal(stdinKey(initial.id)) ?? '');
      })
      .catch((e) => { if (alive) setCatalogError(errMsg(e, 'Could not load the language list.')); })
      .finally(() => { if (alive) setLoadingCatalog(false); });
    return () => { alive = false; };
  }, []);

  // ── Persist the draft (debounced — one write per idle second) ─────────────
  useEffect(() => {
    if (!langId) return;
    const t = window.setTimeout(() => {
      writeLocal(draftKey(langId), code);
      writeLocal(stdinKey(langId), stdin);
    }, 800);
    return () => window.clearTimeout(t);
  }, [code, stdin, langId]);

  // ── Live browser preview (HTML/CSS — debounced 300 ms) ────────────────────
  useEffect(() => {
    if (!isBrowserLang) { setPreviewSrc(null); return; }
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      if (langId === 'css') {
        // Wrap CSS in a minimal demo page
        setPreviewSrc(`<!DOCTYPE html><html><head><style>${code}</style></head><body>
<h1>Heading 1</h1><h2>Heading 2</h2><p>Paragraph text. <a href="#">A link</a>.</p>
<button>Button</button><ul><li>List item 1</li><li>List item 2</li></ul>
<div class="box" style="padding:1rem;border:1px solid">div.box</div>
</body></html>`);
      } else {
        setPreviewSrc(code);
      }
    }, 300);
    return () => { if (previewTimerRef.current) clearTimeout(previewTimerRef.current); };
  }, [code, isBrowserLang, langId]);

  const switchLanguage = useCallback((nextId: string) => {
    if (nextId === langId) return;
    if (langId) {
      writeLocal(draftKey(langId), codeRef.current);
      writeLocal(stdinKey(langId), stdinRef.current);
    }
    const next = languages.find((l) => l.id === nextId);
    if (!next) return;
    setLangId(next.id);
    writeLocal(LANG_KEY, next.id);
    setCode(readLocal(draftKey(next.id)) ?? next.starter);
    setStdin(readLocal(stdinKey(next.id)) ?? '');
    setResult(null);
    setRunError('');
    setAssist(null);
    setAssistError('');
  }, [langId, languages]);

  /** Everything the AI should treat as diagnostics, newest signal first. */
  const diagnostics = useMemo(() => {
    if (!result) return '';
    return [result.compile_output, result.stderr, result.message]
      .filter((s) => s && s.trim())
      .join('\n')
      .trim();
  }, [result]);

  const run = useCallback(async () => {
    if (!lang || running) return;
    // Browser languages render client-side — no backend call
    if (isBrowserLang) return;
    if (!code.trim()) {
      setRunError('Nothing to run yet — write some code first.');
      setResult(null);
      return;
    }
    setRunning(true);
    setRunError('');
    try {
      const res = await executionService.runPlayground({
        code, language: lang.id, stdin: stdin || undefined,
      });
      setResult(res);
    } catch (e) {
      setResult(null);
      setRunError(errMsg(e, 'Run failed.'));
    } finally {
      setRunning(false);
    }
  }, [code, isBrowserLang, lang, running, stdin]);

  const askAssist = useCallback(async (mode: CodeAssistMode) => {
    if (!lang || assistBusy) return;
    setAssistBusy(mode);
    setAssistError('');
    try {
      const res = await aiService.codeAssist({
        mode,
        code,
        language: lang.id,
        error: diagnostics || undefined,
        stdout: result?.stdout || undefined,
        question: mode === 'ask' ? question.trim() : undefined,
      });
      setAssist(res);
      if (mode === 'ask') setQuestion('');
    } catch (e) {
      setAssist(null);
      setAssistError(errMsg(e, 'The assistant is unavailable right now.'));
    } finally {
      setAssistBusy(null);
    }
  }, [assistBusy, code, diagnostics, lang, question, result]);

  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setRunError('Clipboard access was blocked by the browser.');
    }
  }, [code]);

  const downloadCode = useCallback(() => {
    if (!lang) return;
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = lang.filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [code, lang]);

  const resetCode = useCallback(() => {
    if (!lang) return;
    setCode(lang.starter);
    setResult(null);
    setRunError('');
  }, [lang]);

  // ── Verdict presentation ──────────────────────────────────────────────────
  const verdict = useMemo(() => {
    if (!result) return null;
    if (result.is_compile_error) {
      return { tone: styles.vFail, Icon: AlertTriangle, text: result.status || 'Compilation Error' };
    }
    if (result.is_runtime_error) {
      return { tone: styles.vFail, Icon: AlertTriangle, text: result.status || 'Runtime Error' };
    }
    if (result.success) {
      return { tone: styles.vPass, Icon: CheckCircle2, text: result.status || 'Accepted' };
    }
    return { tone: styles.vWarn, Icon: Info, text: result.status || 'Finished' };
  }, [result]);

  const hasOutput = Boolean(
    result && (result.stdout || result.stderr || result.compile_output || result.message),
  );

  return (
    <StudentShell activePage="Compiler" title="Compiler Playground"
      subtitle="Write, run and debug in 18 languages — nothing here is graded, so experiment freely">

      {catalogError && (
        <div className={styles.pageAlert}>
          <AlertTriangle size={16} /> {catalogError}
        </div>
      )}

      {/* ══ Toolbar ══ */}
      <div className={styles.toolbar}>
        <div className={styles.langWrap}>
          <select
            className={styles.langSelect}
            value={langId}
            onChange={(e) => switchLanguage(e.target.value)}
            disabled={loadingCatalog || languages.length === 0}
            aria-label="Language"
          >
            {loadingCatalog && <option value="">Loading languages…</option>}
            {groups.map((groupName) => {
              const inGroup = languages.filter((l) => l.group === groupName);
              if (inGroup.length === 0) return null;
              return (
                <optgroup key={groupName} label={groupName}>
                  {inGroup.map((l) => (
                    <option key={l.id} value={l.id}>{l.label} — {l.version}</option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          <ChevronDown size={15} className={styles.langChevron} />
        </div>

        <button
          className={styles.runBtn}
          onClick={isBrowserLang ? () => { /* preview auto-updates */ } : run}
          disabled={running || !lang || isBrowserLang}
          title={isBrowserLang ? 'Preview updates automatically as you type' : 'Run code (Ctrl+Enter)'}
        >
          {running ? <Loader2 size={16} className={styles.spin} /> : isBrowserLang ? <Globe size={16} /> : <Play size={16} />}
          {running ? 'Running…' : isBrowserLang ? 'Live Preview' : 'Run'}
          {!isBrowserLang && <kbd className={styles.kbd}>Ctrl ⏎</kbd>}
        </button>

        <div className={styles.toolSpacer} />

        <button className={styles.toolBtn} onClick={() => setShowStdin((p) => !p)}
          title="Standard input passed to the program">
          <Terminal size={15} /> {showStdin ? 'Hide input' : 'Input'}
          {stdin.trim() && <span className={styles.dot} />}
        </button>
        <button className={styles.toolBtn} onClick={copyCode} title="Copy code">
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy'}
        </button>
        <button className={styles.toolBtn} onClick={downloadCode} disabled={!lang}
          title={lang ? `Download as ${lang.filename}` : 'Download'}>
          <Download size={15} /> Save
        </button>
        <button className={styles.toolBtn} onClick={resetCode} disabled={!lang}
          title="Restore the starter template">
          <RotateCcw size={15} /> Reset
        </button>
      </div>

      {lang?.hint && (
        <p className={styles.langHint}><Info size={14} /> {lang.hint}</p>
      )}

      {/* ══ Workspace ══ */}
      <div className={styles.workspace}>

        {/* ── Editor column ── */}
        <section className={styles.editorCol}>
          <div className={styles.editorCard}>
            <div className={styles.cardHead}>
              <span className={styles.cardTitle}>
                {lang ? lang.filename : 'Editor'}
              </span>
              <span className={styles.cardMeta}>
                {code.split('\n').length} lines · {code.length} chars
              </span>
            </div>
            <div className={styles.editorBody}>
              <CodeEditor
                value={code}
                onChange={setCode}
                mode={lang?.editor_mode ?? 'plain'}
                lineComment={lang?.line_comment ?? '//'}
                onRun={run}
                ariaLabel={`${lang?.label ?? 'Code'} editor`}
              />
            </div>
          </div>

          {/* hide stdin panel for browser langs */}
          {showStdin && !isBrowserLang && (
            <div className={styles.stdinCard}>
              <div className={styles.cardHead}>
                <span className={styles.cardTitle}>Standard input (stdin)</span>
                <button className={styles.linkBtn} onClick={() => setStdin('')}>
                  <Eraser size={13} /> Clear
                </button>
              </div>
              <textarea
                className={styles.stdinArea}
                value={stdin}
                onChange={(e) => setStdin(e.target.value)}
                placeholder="One value per line — whatever your program reads from input"
                spellCheck={false}
                aria-label="Standard input"
              />
            </div>
          )}
        </section>

        {/* ── Console + AI column ── */}
        <section className={styles.sideCol}>

          {/* ── Browser Preview (HTML / CSS) ── */}
          {isBrowserLang && (
            <div className={styles.previewCard}>
              <div className={styles.cardHead}>
                <span className={styles.cardTitle}><Globe size={14} /> Live Preview</span>
                <span className={styles.cardMeta}>sandboxed — updates as you type</span>
              </div>
              <div className={styles.previewBody}>
                {previewSrc ? (
                  <iframe
                    className={styles.previewFrame}
                    srcDoc={previewSrc}
                    sandbox="allow-scripts"
                    title="Browser preview"
                    aria-label="Live browser preview of your HTML or CSS code"
                  />
                ) : (
                  <p className={styles.consoleEmpty}>
                    <Globe size={22} />
                    Start typing HTML or CSS — the preview updates instantly.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Console (compiled languages only) ── */}
          {!isBrowserLang && (
          <div className={styles.consoleCard}>
            <div className={styles.cardHead}>
              <span className={styles.cardTitle}><Terminal size={14} /> Console</span>
              {result && (
                <button className={styles.linkBtn} onClick={() => { setResult(null); setRunError(''); }}>
                  <Eraser size={13} /> Clear
                </button>
              )}
            </div>

            <div className={styles.consoleBody}>
              {runError && (
                <div className={`${styles.verdict} ${styles.vFail}`}>
                  <AlertTriangle size={15} /> {runError}
                </div>
              )}

              {verdict && (
                <div className={`${styles.verdict} ${verdict.tone}`}>
                  <verdict.Icon size={15} /> {verdict.text}
                  {result?.label && <span className={styles.verdictLang}>{result.label}</span>}
                </div>
              )}

              {result?.compile_output?.trim() && (
                <pre className={`${styles.stream} ${styles.streamErr}`}>
                  <span className={styles.streamLabel}>compiler</span>
                  {result.compile_output}
                </pre>
              )}

              {result?.stdout?.trim() && (
                <pre className={styles.stream}>
                  <span className={styles.streamLabel}>stdout</span>
                  {result.stdout}
                </pre>
              )}

              {result?.stderr?.trim() && (
                <pre className={`${styles.stream} ${styles.streamErr}`}>
                  <span className={styles.streamLabel}>stderr</span>
                  {result.stderr}
                </pre>
              )}

              {result?.message?.trim() && (
                <pre className={`${styles.stream} ${styles.streamWarn}`}>
                  <span className={styles.streamLabel}>runner</span>
                  {result.message}
                </pre>
              )}

              {result && !hasOutput && (
                <p className={styles.emptyLine}>Program produced no output.</p>
              )}

              {!result && !runError && !running && (
                <p className={styles.consoleEmpty}>
                  <Terminal size={22} />
                  Press <strong>Run</strong> to execute your code. Output, errors and
                  compiler diagnostics all land here.
                </p>
              )}

              {running && (
                <p className={styles.consoleEmpty}>
                  <Loader2 size={22} className={styles.spin} />
                  Queued on the runner — this can take a few seconds on first run.
                </p>
              )}
            </div>

            {result && (
              <div className={styles.consoleFoot}>
                <span><Clock size={13} /> {result.time_ms} ms</span>
                <span><Cpu size={13} /> {(result.memory_kb / 1024).toFixed(1)} MB</span>
                <span>exit {result.exit_code ?? '—'}</span>
                {result.exit_signal ? <span>signal {result.exit_signal}</span> : null}
              </div>
            )}
          </div>
          )}

          {/* ── AI assistant ── */}
          <div className={styles.aiCard}>
            <div className={styles.cardHead}>
              <span className={styles.cardTitle}><Sparkles size={14} /> AI Tutor</span>
              <span className={styles.cardMeta}>guides, never solves</span>
            </div>

            <div className={styles.aiActions}>
              {QUICK_ACTIONS.map(({ mode, label, Icon }) => {
                const needsError = mode === 'explain_error';
                const disabled = Boolean(assistBusy) || !code.trim() || (needsError && !diagnostics);
                return (
                  <button
                    key={mode}
                    className={styles.aiBtn}
                    onClick={() => askAssist(mode)}
                    disabled={disabled}
                    title={needsError && !diagnostics ? 'Run the code and hit an error first' : label}
                  >
                    {assistBusy === mode ? <Loader2 size={14} className={styles.spin} /> : <Icon size={14} />}
                    {label}
                  </button>
                );
              })}
            </div>

            <form
              className={styles.askRow}
              onSubmit={(e) => { e.preventDefault(); if (question.trim()) askAssist('ask'); }}
            >
              <input
                className={styles.askInput}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask about your code…"
                aria-label="Ask the AI tutor about your code"
              />
              <button className={styles.askBtn} type="submit"
                disabled={Boolean(assistBusy) || !question.trim() || !code.trim()}>
                {assistBusy === 'ask' ? <Loader2 size={14} className={styles.spin} /> : <Send size={14} />}
              </button>
            </form>

            <div className={styles.aiBody}>
              {assistError && (
                <div className={`${styles.verdict} ${styles.vFail}`}>
                  <AlertTriangle size={15} /> {assistError}
                </div>
              )}

              {assist && (
                <>
                  <p className={styles.aiAnswer}>{assist.answer}</p>
                  <div className={styles.aiFoot}>
                    {assist.is_fallback
                      ? <span className={styles.aiFallback}>offline fallback</span>
                      : <span>{assist.model_used ?? 'ai'}</span>}
                    <span>{assist.latency_ms} ms</span>
                  </div>
                </>
              )}

              {!assist && !assistError && !assistBusy && (
                <p className={styles.aiEmpty}>
                  Stuck? Ask for a nudge, an error explanation, or a review of what
                  you have written. You will get direction — not the answer.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </StudentShell>
  );
}
