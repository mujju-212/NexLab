'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import IndividualShell from '@/components/layout/IndividualShell';
import { executionService, type CompilerLanguage, type PlaygroundResult } from '@/services/execution.service';
import { useAuthStore } from '@/store/auth-store';
import { CodeEditor } from '@/components/editor/code-editor';
import styles from './playground.module.css';
import {
  Play, Terminal, Trash2, Copy, Check, Loader2, Zap,
  Clock, MemoryStick, AlertCircle, CheckCircle2
} from 'lucide-react';

const FALLBACK_LANGUAGES: CompilerLanguage[] = [
  { id: 'python', label: 'Python', version: '3.14', engine: 'docker', editor_mode: 'python', filename: 'main.py', line_comment: '#', group: 'Popular', hint: null, starter: '# Python Playground\nprint("Hello, World!")\n' },
  { id: 'cpp', label: 'C++', version: 'GCC 16 / C++23', engine: 'docker', editor_mode: 'clike', filename: 'main.cpp', line_comment: '//', group: 'Popular', hint: null, starter: '#include <iostream>\nusing namespace std;\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}\n' },
  { id: 'c', label: 'C', version: 'GCC 16 / C23', engine: 'docker', editor_mode: 'clike', filename: 'main.c', line_comment: '//', group: 'Popular', hint: null, starter: '#include <stdio.h>\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}\n' },
  { id: 'java', label: 'Java', version: 'JDK 25', engine: 'docker', editor_mode: 'clike', filename: 'Main.java', line_comment: '//', group: 'Popular', hint: 'Class must be named Main', starter: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}\n' },
  { id: 'javascript', label: 'JavaScript', version: 'Node.js 24', engine: 'docker', editor_mode: 'javascript', filename: 'main.js', line_comment: '//', group: 'Popular', hint: null, starter: '// JavaScript Playground\nconsole.log("Hello, World!");\n' },
];

type Phase = 'idle' | 'running' | 'done';

export default function PlaygroundPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();

  const [languages, setLanguages] = useState<CompilerLanguage[]>(FALLBACK_LANGUAGES);
  const [selectedLang, setSelectedLang] = useState<CompilerLanguage>(FALLBACK_LANGUAGES[0]);
  const [code, setCode] = useState(FALLBACK_LANGUAGES[0].starter);
  const [stdin, setStdin] = useState('');
  const [showStdin, setShowStdin] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [copied, setCopied] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  // Guard: only logged-in free_user
  useEffect(() => {
    if (!isAuthenticated || !user) { router.replace('/login'); }
  }, [isAuthenticated, user, router]);

  // Load language catalog
  useEffect(() => {
    executionService.listLanguages().then(({ languages: langs }) => {
      if (langs.length > 0) {
        setLanguages(langs);
        const py = langs.find(l => l.id === 'python') ?? langs[0];
        setSelectedLang(py);
        setCode(py.starter);
      }
    }).catch(() => { /* use fallback */ });
  }, []);

  // Persist draft in localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`playground_draft_${selectedLang.id}`);
    if (saved) setCode(saved);
    else setCode(selectedLang.starter);
  }, [selectedLang]);

  useEffect(() => {
    localStorage.setItem(`playground_draft_${selectedLang.id}`, code);
  }, [code, selectedLang.id]);

  const handleLangChange = (langId: string) => {
    const lang = languages.find(l => l.id === langId) ?? languages[0];
    setSelectedLang(lang);
    setResult(null);
    setPhase('idle');
  };

  const handleRun = useCallback(async () => {
    if (!code.trim() || phase === 'running') return;
    if (!user) { router.push('/login'); return; }
    setPhase('running');
    setResult(null);
    try {
      const res = await executionService.runPlayground({ code, language: selectedLang.id, stdin: stdin || undefined });
      setResult(res);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Execution failed. Is the backend running?';
      setResult({
        language: selectedLang.id, label: selectedLang.label, engine: 'docker',
        status: 'Error', status_id: null, success: false,
        is_compile_error: false, is_runtime_error: true,
        stdout: '', stderr: msg, compile_output: '', message: msg,
        exit_code: 1, exit_signal: null, time_ms: null, compile_ms: null, memory_kb: null,
      });
    } finally {
      setPhase('done');
      setTimeout(() => outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
    }
  }, [code, phase, user, router, selectedLang, stdin]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleClear = () => {
    setCode(selectedLang.starter);
    setResult(null);
    setPhase('idle');
    localStorage.removeItem(`playground_draft_${selectedLang.id}`);
  };

  if (!isAuthenticated || !user) return null;

  const statusColor = result
    ? result.success ? '#22c55e' : result.is_compile_error ? '#f59e0b' : '#ef4444'
    : '#9891a6';

  const statusIcon = result
    ? result.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />
    : null;

  // Group languages for optgroup
  const groups = Array.from(new Set(languages.map(l => l.group)));

  return (
    <IndividualShell activePage="playground" title="Playground" subtitle="Write and run code instantly in any supported language.">
      <div className={`${styles.page} ${styles.pageEmbedded}`}>
        {/* ── Top Bar ─────────────────────────────────────────────────────── */}
        <div className={styles.topBar}>
          <div className={styles.topLeft}>
            <Terminal size={15} className={styles.termIcon} />
            <span className={styles.playgroundLabel}>{selectedLang.filename}</span>
          </div>

          <div className={styles.topCenter}>
            <div className={styles.langSelectWrap}>
              <select
                className={styles.langSelect}
                value={selectedLang.id}
                onChange={e => handleLangChange(e.target.value)}
              >
                {groups.map(group => (
                  <optgroup key={group} label={group}>
                    {languages.filter(l => l.group === group).map(l => (
                      <option key={l.id} value={l.id}>{l.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <button
              className={`${styles.runBtn} ${phase === 'running' ? styles.runBtnActive : ''}`}
              onClick={handleRun}
              disabled={phase === 'running'}
            >
              {phase === 'running'
                ? <><Loader2 size={14} className={styles.spin} /> Running…</>
                : <><Play size={14} /> Run</>
              }
            </button>

            <button className={styles.iconBtn} onClick={handleCopy} title="Copy code">
              {copied ? <Check size={14} style={{ color: '#22c55e' }} /> : <Copy size={14} />}
            </button>
            <button className={styles.iconBtn} onClick={handleClear} title="Reset to starter">
              <Trash2 size={14} />
            </button>
            <button
              className={`${styles.iconBtn} ${showStdin ? styles.iconBtnActive : ''}`}
              onClick={() => setShowStdin(v => !v)}
              title="Toggle stdin input"
            >
              <Terminal size={14} />
              <span className={styles.stdinLabel}>stdin</span>
            </button>
          </div>

          <div className={styles.topRight}>
            <span className={styles.langBadge}>{selectedLang.label}</span>
          </div>
        </div>

        {/* ── Hint bar ─────────────────────────────────────────────────────── */}
        {selectedLang.hint && (
          <div className={styles.hintBar}>
            <AlertCircle size={13} /> {selectedLang.hint}
          </div>
        )}

        {/* ── Main IDE Area ─────────────────────────────────────────────────── */}
        <div className={styles.ide}>
          {/* Left: Editor */}
          <div className={styles.editorPanel}>
            <div className={styles.editorHeader}>
              <span className={styles.filename}>{selectedLang.filename}</span>
              <span className={styles.langBadge}>{selectedLang.label}</span>
            </div>

            <div className={styles.editorBody}>
              <CodeEditor
                value={code}
                onChange={setCode}
                mode={selectedLang.editor_mode}
                lineComment={selectedLang.line_comment}
                onRun={handleRun}
              />
            </div>

            {/* Stdin panel */}
            {showStdin && (
              <div className={styles.stdinPanel}>
                <div className={styles.stdinHeader}>
                  <Terminal size={13} /> stdin (custom input)
                </div>
                <textarea
                  className={styles.stdinArea}
                  value={stdin}
                  onChange={e => setStdin(e.target.value)}
                  placeholder="Enter input for your program here…"
                  spellCheck={false}
                />
              </div>
            )}

            <div className={styles.editorFooter}>
              <span className={styles.footerHint}>
                <Zap size={12} /> Ctrl+Enter to run &nbsp;·&nbsp; Tab to indent &nbsp;·&nbsp; Ctrl+/ to comment
              </span>
            </div>
          </div>

          {/* Right: Output */}
          <div className={styles.outputPanel} ref={outputRef}>
            <div className={styles.outputHeader}>
              <div className={styles.outputTitle}>
                <Terminal size={14} />
                <span>Output</span>
              </div>
              {result && (
                <div className={styles.outputMeta}>
                  {result.time_ms != null && (
                    <span className={styles.metaChip}>
                      <Clock size={11} /> {result.time_ms}ms
                    </span>
                  )}
                  {result.memory_kb != null && (
                    <span className={styles.metaChip}>
                      <MemoryStick size={11} /> {Math.round(result.memory_kb / 1024)}MB
                    </span>
                  )}
                  <span className={styles.statusBadge} style={{ color: statusColor, borderColor: statusColor + '40', background: statusColor + '12' }}>
                    {statusIcon} {result.status}
                  </span>
                </div>
              )}
            </div>

            <div className={styles.outputBody}>
              {phase === 'idle' && !result && (
                <div className={styles.outputIdle}>
                  <Play size={32} className={styles.idleIcon} />
                  <p>Click <strong>Run</strong> or press <kbd>Ctrl+Enter</kbd> to execute your code</p>
                </div>
              )}

              {phase === 'running' && (
                <div className={styles.outputRunning}>
                  <Loader2 size={24} className={styles.spin} />
                  <p>Executing {selectedLang.label} code…</p>
                </div>
              )}

              {phase === 'done' && result && (
                <div className={styles.outputResult}>
                  {/* Compile output */}
                  {result.compile_output && (
                    <div className={styles.outputSection}>
                      <span className={styles.sectionLabel} style={{ color: '#f59e0b' }}>Compile Output</span>
                      <pre className={styles.outputPre} style={{ color: '#fbbf24' }}>{result.compile_output}</pre>
                    </div>
                  )}

                  {/* Stdout */}
                  {result.stdout ? (
                    <div className={styles.outputSection}>
                      <span className={styles.sectionLabel} style={{ color: '#22c55e' }}>stdout</span>
                      <pre className={styles.outputPre} style={{ color: '#d4d4d4' }}>{result.stdout}</pre>
                    </div>
                  ) : result.success && (
                    <div className={styles.outputSection}>
                      <span className={styles.sectionLabel} style={{ color: '#22c55e' }}>stdout</span>
                      <pre className={styles.outputPre} style={{ color: '#6b7280' }}>(no output)</pre>
                    </div>
                  )}

                  {/* Stderr */}
                  {result.stderr && (
                    <div className={styles.outputSection}>
                      <span className={styles.sectionLabel} style={{ color: '#ef4444' }}>stderr</span>
                      <pre className={styles.outputPre} style={{ color: '#fca5a5' }}>{result.stderr}</pre>
                    </div>
                  )}

                  {/* Success banner */}
                  {result.success && (
                    <div className={styles.successBanner}>
                      <CheckCircle2 size={15} /> Executed successfully
                      {result.time_ms != null && <> · {result.time_ms}ms</>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </IndividualShell>
  );
}
