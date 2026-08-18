'use client';

/**
 * Student Compiler — a free-practice playground that runs real code in a
 * Docker sandbox and shows the whole verdict, not just stdout.
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
  // ── Typewriter animation state ─────────────────────────────────────────
  const [typedLines, setTypedLines] = useState<string[]>([]);
  const [typingDone, setTypingDone] = useState(false);
  const [phase, setPhase]   = useState<'idle'|'compiling'|'running'|'done'|'failed'>('idle');
  const typeTimerRef = useRef<number | null>(null);
  const termBodyRef  = useRef<HTMLDivElement | null>(null);
  // ── Browser preview (HTML/CSS) ──────────────────────────────────────────
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const previewTimerRef = useRef<number | null>(null);

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
    previewTimerRef.current = window.setTimeout(() => {
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

  // ── Typewriter animation when a new result arrives ────────────────────────────
  useEffect(() => {
    if (!result) {
      setTypedLines([]);
      setTypingDone(false);
      if (phase !== 'idle') setPhase('idle');
      return;
    }
    // Build the full list of output lines to animate
    const allLines: string[] = [];
    if (result.compile_output?.trim()) {
      allLines.push(...result.compile_output.trimEnd().split('\n').map(l => `\x01${l}`)); // \x01 = compiler stream marker
    }
    if (result.stdout?.trim()) {
      allLines.push(...result.stdout.trimEnd().split('\n'));
    }
    if (result.stderr?.trim()) {
      allLines.push(...result.stderr.trimEnd().split('\n').map(l => `\x02${l}`)); // \x02 = stderr marker
    }
    if (result.message?.trim() && !result.stdout?.trim() && !result.stderr?.trim()) {
      allLines.push(`\x03${result.message.trim()}`); // \x03 = runner msg marker
    }
    if (allLines.length === 0) allLines.push('\x04'); // empty output marker

    // Defensive: ensure every entry is a string (split can't produce undefined
    // but JS APIs can if output contains \r — strip \r to be safe)
    const safeLines = allLines
      .map(l => (typeof l === 'string' ? l.replace(/\r/g, '') : ''))
      .filter((l): l is string => l !== undefined);

    setTypedLines([]);
    setTypingDone(false);
    setPhase(result.success ? 'done' : 'failed');

    let i = 0;
    function tick() {
      if (i >= safeLines.length) { setTypingDone(true); return; }
      setTypedLines(prev => [...prev, safeLines[i]]);
      i++;
      window.setTimeout(() => {
        if (termBodyRef.current) termBodyRef.current.scrollTop = termBodyRef.current.scrollHeight;
      }, 20);
      typeTimerRef.current = window.setTimeout(tick, i === 1 ? 60 : 22);
    }
    typeTimerRef.current = window.setTimeout(tick, 80); // initial 80ms delay
    return () => { if (typeTimerRef.current) clearTimeout(typeTimerRef.current); };
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

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

  /** Build the command string echoed in the terminal header */
  const terminalCmd = useMemo(() => {
    if (!lang) return '';
    const cmds: Record<string, string> = {
      python: 'python main.py', javascript: 'node main.js',
      typescript: 'tsc main.ts && node main.js', c: 'gcc main.c -o prog && ./prog',
      cpp: 'g++ main.cpp -o prog && ./prog', java: 'javac Main.java && java Main',
      kotlin: 'kotlinc Main.kt -d app.jar && java -jar app.jar',
      csharp: 'dotnet run Main.cs', r: 'Rscript main.R',
      bash: 'bash main.sh', sql: 'sqlite3 :memory: < script.sql',
    };
    return cmds[lang.id] ?? lang.filename;
  }, [lang]);

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

          {/* ── Terminal panel (compiled languages only) ── */}
          {!isBrowserLang && (
          <div className={styles.terminalCard}>

            {/* Traffic-light header */}
            <div className={styles.termHead}>
              <div className={styles.termDots}>
                <div className={`${styles.termDot} ${styles.termDotRed}`} />
                <div className={`${styles.termDot} ${styles.termDotYel}`} />
                <div className={`${styles.termDot} ${styles.termDotGrn}`} />
              </div>
              <span className={styles.termTitle}>Terminal</span>
              {lang && <span className={styles.termBadge}>{lang.id.toUpperCase()}</span>}
              {(result || runError) && (
                <button className={styles.termClearBtn}
                  onClick={() => { setResult(null); setRunError(''); setTypedLines([]); setTypingDone(false); setPhase('idle'); }}>
                  clear
                </button>
              )}
            </div>

            {/* Phase progress bar — shown while running or after */}
            {(running || result) && (
              <div className={styles.phaseBar}>
                {/* compile phase — only for languages with a compile step */}
                {lang && ['c','cpp','java','kotlin','typescript','csharp'].includes(lang.id) && (
                  <>
                    <div className={`${styles.phaseStep} ${
                      running ? styles.active
                      : result?.is_compile_error ? styles.failed
                      : styles.done
                    }`}>
                      <div className={styles.phaseDot} />
                      Compile
                      {result?.compile_ms != null && result.compile_ms > 0 && (
                        <span style={{fontSize:'9px',opacity:.6}}>{result.compile_ms}ms</span>
                      )}
                    </div>
                    <span className={styles.phaseSep}>›</span>
                  </>
                )}
                {/* run phase */}
                <div className={`${styles.phaseStep} ${
                  running ? (result?.is_compile_error ? styles.failed : styles.active)
                  : result?.success ? styles.done
                  : styles.failed
                }`}>
                  <div className={styles.phaseDot} />
                  Run
                  {result?.time_ms != null && (
                    <span style={{fontSize:'9px',opacity:.6}}>{result.time_ms}ms</span>
                  )}
                </div>
                {result?.time_ms != null && (
                  <span className={styles.phaseTime}>
                    total {(result.compile_ms ?? 0) + (result.time_ms ?? 0)}ms
                  </span>
                )}
              </div>
            )}

            {/* Output area */}
            <div className={styles.termBody} ref={termBodyRef}>

              {/* Idle state */}
              {!result && !runError && !running && (
                <div className={styles.termIdle}>
                  <span className={styles.termIdleIcon}>&#9654;</span>
                  Press <strong style={{color:'#a855f7'}}>Run</strong> to execute — output appears here.
                </div>
              )}

              {/* Running spinner */}
              {running && (
                <div className={styles.termIdle}>
                  <Loader2 size={22} className={styles.spin} style={{color:'#a855f7'}} />
                  <span>Queued on the Docker runner…</span>
                </div>
              )}

              {/* Error banner */}
              {runError && !running && (
                <div className={`${styles.termVerdict} ${styles.tvFail}`}>
                  <AlertTriangle size={14} /> {runError}
                </div>
              )}

              {/* Command echo */}
              {result && !running && terminalCmd && (
                <div className={styles.termCmd}>
                  <span className={styles.termPromptChar}>$</span>{terminalCmd}
                </div>
              )}

              {/* Typewriter lines */}
              {typedLines.map((line, i) => {
                // Defensive guard — all entries should be strings after safeLines filter
                if (typeof line !== 'string') return null;
                const isComp  = line.startsWith('\x01');
                const isErr   = line.startsWith('\x02');
                const isWarn  = line.startsWith('\x03');
                const isEmpty = line === '\x04';
                const text    = isComp || isErr || isWarn ? line.slice(1) : line;
                if (isEmpty) return (
                  <span key={i} className={styles.termLine}
                    style={{color:'rgba(196,181,253,.3)',fontStyle:'italic'}}>
                    (no output)
                  </span>
                );
                return (
                  <span key={i} className={`${styles.termLine} ${
                    isComp ? styles.termLineComp
                    : isErr ? styles.termLineErr
                    : isWarn ? styles.termLineWarn
                    : ''
                  }`}>
                    {text || '\u00a0'}
                  </span>
                );
              })}

              {/* Blinking cursor while typing */}
              {result && !typingDone && <span className={styles.termCursor} />}

              {/* Verdict + truncation after typing finishes */}
              {result && typingDone && verdict && (
                <div className={`${styles.termVerdict} ${
                  result.success ? styles.tvPass
                  : result.is_compile_error || result.is_runtime_error ? styles.tvFail
                  : styles.tvWarn
                }`}>
                  <verdict.Icon size={13} />
                  {verdict.text}
                  <span className={styles.termVerdictSub}>
                    🐳 docker
                  </span>
                </div>
              )}

              {result?.truncated && typingDone && (
                <div className={styles.termTrunc}>⚠ Output truncated at 256 KB</div>
              )}
            </div>

            {/* Metrics footer */}
            {result && typingDone && (
              <div className={styles.termFoot}>
                <span><Clock size={12} />
                  {result.time_ms != null ? `${result.time_ms} ms` : '—'}
                </span>
                <span><Cpu size={12} />
                  {result.memory_kb != null ? `${(result.memory_kb/1024).toFixed(1)} MB` : '—'}
                </span>
                <span>exit {result.exit_code ?? '—'}</span>
                {result.compile_ms != null && result.compile_ms > 0 && (
                  <span>🔨 compile {result.compile_ms}ms</span>
                )}
              </div>
            )}

            {/* Stdin input row — always visible, hidden for browser langs */}
            <div className={styles.termStdinRow}>
              <span className={styles.termStdinPrompt}>stdin ›</span>
              <textarea
                className={styles.termStdinInput}
                value={stdin}
                onChange={(e) => setStdin(e.target.value)}
                placeholder="Type input here (one value per line)…"
                spellCheck={false}
                rows={1}
                aria-label="Standard input"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    run();
                  }
                }}
              />
            </div>
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
