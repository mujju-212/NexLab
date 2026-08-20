'use client';

/**
 * ProblemSolverPage — shared split-screen solver used by BOTH portals:
 *   /student/practice/[slug]         (StudentShell)
 *   /practice/library/[slug]         (IndividualShell)
 *
 * Features:
 *   - Left: problem description / examples / constraints / hints / submissions
 *   - Right: Monaco code editor + language selector + Run / Submit buttons
 *   - Live "Run" against sample test cases (uses the NexLab Docker runner)
 *   - "Submit" runs all hidden cases, awards XP, updates streak
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, RotateCcw,
  Play, Send, Lightbulb, CheckCircle2, XCircle
} from 'lucide-react';
import styles from './ProblemSolver.module.css';
import { apiClient } from '@/services/api-client';

// ── Types ─────────────────────────────────────────────────────────────────────

// The backend sends examples as { example_num, example_text, images } where
// example_text is freeform LeetCode text ("Input: …\nOutput: …\nExplanation: …").
// Older / hand-authored data may already be structured. Support both shapes.
interface Example {
  example_num?: number;
  example_text?: string;
  images?: string[];
  input?: string;
  output?: string;
  explanation?: string;
}

interface ProblemDetail {
  id: string; slug: string; lc_id: string; title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  nexlab_topic: string; topics: string[];
  description: string; examples: Example[];
  constraints: string[]; hints: string[];
  acceptance: number; xp_reward: number;
  starter_code: Record<string, string>;
}

interface SampleCase { id: string; input_data: string; expected: string; }

interface Submission {
  id: string; language: string; status: string;
  runtime_ms: number | null; memory_kb: number | null;
  submitted_at: string; score: number;
}

interface CaseResult {
  input: string | null; expected: string | null; output: string;
  passed: boolean | null; time_ms: number | null; status: string;
}

// ── Language starters ─────────────────────────────────────────────────────────

// Starter code that READS FROM STDIN and PRINTS TO STDOUT — this is a
// competitive-programming style judge (it runs `python main.py`, pipes the test
// input to stdin, and compares stdout). A bare `def solution(): pass` prints
// nothing, so these skeletons nudge students toward the correct I/O model.
const DEFAULT_CODE: Record<string, string> = {
  python:
`import sys

def main():
    data = sys.stdin.read().split()
    # TODO: use the parsed input, then print your answer
    print()

main()
`,
  javascript:
`const input = require('fs').readFileSync(0, 'utf8').trim();
// TODO: parse the input, then print your answer with console.log()
console.log();
`,
  java:
`import java.util.*;
import java.io.*;

// The public class MUST be named Main for the runner to execute it.
public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        // TODO: read input with br.readLine(), then System.out.println(...)
    }
}
`,
  cpp:
`#include <bits/stdc++.h>
using namespace std;

int main() {
    // TODO: read input with cin, then print your answer with cout
    return 0;
}
`,
  c:
`#include <stdio.h>

int main() {
    // TODO: read input with scanf, then print your answer with printf
    return 0;
}
`,
};

const LANGUAGES = [
  { value: 'python',     label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'java',       label: 'Java' },
  { value: 'cpp',        label: 'C++' },
  { value: 'c',          label: 'C' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function diffClass(d: string) {
  if (d === 'Easy') return styles.easy;
  if (d === 'Medium') return styles.medium;
  return styles.hard;
}

function timeSince(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Turn a backend example into displayable {input, output, explanation}. When the
// freeform text can't be split into Input/Output, fall back to showing it raw.
function parseExample(ex: Example): { input: string; output: string; explanation: string; raw: string } {
  if ((ex.input && ex.input.trim()) || (ex.output && ex.output.trim())) {
    return {
      input: (ex.input || '').trim(),
      output: (ex.output || '').trim(),
      explanation: (ex.explanation || '').trim(),
      raw: '',
    };
  }
  const text = (ex.example_text || '').replace(/\r\n/g, '\n');
  if (!text.trim()) return { input: '', output: '', explanation: '', raw: '' };

  const inM  = text.match(/Input:\s*([\s\S]*?)(?=\n\s*Output:|\n\s*Explanation:|$)/i);
  const outM = text.match(/Output:\s*([\s\S]*?)(?=\n\s*Explanation:|$)/i);
  const expM = text.match(/Explanation:\s*([\s\S]*)$/i);

  const input       = inM  ? inM[1].trim()  : '';
  const output      = outM ? outM[1].trim() : '';
  const explanation = expM ? expM[1].trim() : '';

  // Couldn't parse a structured example → show the whole thing verbatim.
  if (!input && !output) return { input: '', output: '', explanation: '', raw: text.trim() };
  return { input, output, explanation, raw: '' };
}

// ── Main Component ────────────────────────────────────────────────────────────

interface ProblemSolverPageProps {
  slug: string;
  baseRoute: string;
}

export default function ProblemSolverPage({ slug, baseRoute }: ProblemSolverPageProps) {
  const router = useRouter();

  // Problem data
  const [problem, setProblem] = useState<ProblemDetail | null>(null);
  const [samples, setSamples] = useState<SampleCase[]>([]);
  const [mySubmissions, setMySubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  // Editor state
  const [language, setLanguage] = useState('python');
  const [code, setCode] = useState('');
  const [codeByLang, setCodeByLang] = useState<Record<string, string>>({});

  // UI state
  const [leftTab, setLeftTab] = useState<'description' | 'hints' | 'submissions'>('description');
  const [rightTab, setRightTab] = useState<'testcases' | 'result'>('testcases');
  const [hintShown, setHintShown] = useState(0);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [runResults, setRunResults] = useState<CaseResult[]>([]);
  const [runError, setRunError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<{
    status: string; passed: number; total: number;
    score: number; xp_earned: number; runtime_ms: number | null;
    memory_kb: number | null;
    fail_case?: { input: string; expected: string; output: string };
  } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Layout: draggable panel split + resizable/collapsible results dock
  const [leftWidth, setLeftWidth] = useState(44);        // percent of the split
  const [resultsHeight, setResultsHeight] = useState(240); // px of the results dock
  const [resultsCollapsed, setResultsCollapsed] = useState(false);
  const solverRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const dragKind = useRef<null | 'col' | 'row'>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const openedAt = useRef<number>(Date.now());   // for speed_demon (elapsed since open)

  // Fetch problem on mount
  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      openedAt.current = Date.now();   // reset timer for this problem
      try {
        const res = await apiClient.get(`/practice/problems/${slug}`);
        const p: ProblemDetail = res.data.problem;
        const sc: SampleCase[] = res.data.sample_cases || [];
        const subs: Submission[] = res.data.my_submissions || [];
        setProblem(p);
        setSamples(sc);
        setMySubmissions(subs);

        // Initialise code from starter or default
        const starters: Record<string, string> = {};
        LANGUAGES.forEach(l => {
          starters[l.value] = (p.starter_code?.[l.value]) || DEFAULT_CODE[l.value] || '';
        });
        setCodeByLang(starters);
        setCode(starters['python']);
      } catch (e) {
        console.error('Problem fetch error:', e);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [slug]);

  // Hand-rolled drag handlers for the vertical panel splitter (col) and the
  // horizontal results-dock resizer (row). No external dependency.
  const startColDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    dragKind.current = 'col';
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };
  const startRowDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    dragKind.current = 'row';
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragKind.current === 'col' && solverRef.current) {
        const rect = solverRef.current.getBoundingClientRect();
        const pct = ((e.clientX - rect.left) / rect.width) * 100;
        setLeftWidth(Math.min(70, Math.max(26, pct)));
      } else if (dragKind.current === 'row' && rightPanelRef.current) {
        const rect = rightPanelRef.current.getBoundingClientRect();
        const h = rect.bottom - e.clientY;
        setResultsHeight(Math.min(rect.height - 140, Math.max(90, h)));
      }
    };
    const onUp = () => {
      if (dragKind.current) {
        dragKind.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // Switch language
  const switchLang = (lang: string) => {
    // Save current code
    setCodeByLang(prev => ({ ...prev, [language]: code }));
    setLanguage(lang);
    setCode(codeByLang[lang] || DEFAULT_CODE[lang] || '');
  };

  // Reset code
  const resetCode = () => {
    const starter = problem?.starter_code?.[language] || DEFAULT_CODE[language] || '';
    setCode(starter);
    setCodeByLang(prev => ({ ...prev, [language]: starter }));
  };

  // Run against sample cases
  const handleRun = async () => {
    if (!problem) return;
    setRunning(true);
    setRightTab('result');
    setRunResults([]);
    setRunError(null);
    setSubmitResult(null);
    setSubmitError(null);
    try {
      const res = await apiClient.post(`/practice/problems/${slug}/run`, {
        code, language,
      });
      setRunResults(res.data.results || []);
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Run failed. Check the backend logs.';
      setRunError(msg);
      console.error('Run error:', e);
    } finally {
      setRunning(false);
    }
  };

  // Submit (all hidden cases)
  const handleSubmit = async () => {
    if (!problem) return;
    setSubmitting(true);
    setRightTab('result');
    setRunResults([]);
    setRunError(null);
    setSubmitResult(null);
    setSubmitError(null);
    try {
      const res = await apiClient.post(`/practice/problems/${slug}/submit`, {
        code, language,
        elapsed_sec: Math.round((Date.now() - openedAt.current) / 1000),
      });
      setSubmitResult(res.data);
      // Refresh submissions list
      const detailRes = await apiClient.get(`/practice/problems/${slug}`);
      setMySubmissions(detailRes.data.my_submissions || []);
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Submission failed.';
      setSubmitError(msg);
      console.error('Submit error:', e);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className={styles.loadingWrap}>Loading problem…</div>;
  if (!problem) return <div className={styles.loadingWrap}>Problem not found.</div>;

  const accepted = mySubmissions.some(s => s.status === 'Accepted');

  return (
    <>
      {/* ── Top bar ── */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.push(baseRoute)}>
          <ArrowLeft size={15} /> Practice Library
        </button>
        <div className={styles.probNav}>
          <button className={styles.navBtn}><ChevronLeft size={14} /> Prev</button>
          <button className={styles.navBtn}>Next <ChevronRight size={14} /></button>
        </div>
      </div>

      {/* ── Split-screen ── */}
      <div
        className={styles.solver}
        ref={solverRef}
        style={{ '--left-width': `${leftWidth}%` } as React.CSSProperties}
      >

        {/* ════ LEFT PANEL ════ */}
        <div className={styles.leftPanel}>

          {/* Left tabs */}
          <div className={styles.probTabs}>
            {(['description', 'hints', 'submissions'] as const).map(t => (
              <button
                key={t}
                className={`${styles.probTab} ${leftTab === t ? styles.probTabActive : ''}`}
                onClick={() => setLeftTab(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
                {t === 'submissions' && mySubmissions.length > 0 && ` (${mySubmissions.length})`}
              </button>
            ))}
          </div>

          <div className={styles.probContent}>

            {/* ── Description tab ── */}
            {leftTab === 'description' && (
              <>
                <div className={styles.probHeader}>
                  <div className={styles.probMeta}>
                    <span className={styles.probNum}>#{problem.lc_id}</span>
                    <span className={`${styles.diffBadge} ${diffClass(problem.difficulty)}`}>
                      {problem.difficulty}
                    </span>
                    <span className={styles.topicTag}>{problem.nexlab_topic}</span>
                    <span className={styles.xpReward}>+{problem.xp_reward || 10} XP</span>
                    {accepted && (
                      <span style={{ color: '#15803d', fontSize: '.75rem', fontWeight: 800 }}>
                        <CheckCircle2 size={13} style={{ verticalAlign: 'middle' }} /> Solved
                      </span>
                    )}
                  </div>
                  <h1 className={styles.probTitle}>{problem.title}</h1>
                  <div className={styles.acceptance}>
                    Acceptance: {Math.round((problem.acceptance || 0) * 100)}%
                  </div>
                </div>

                {/* Description */}
                <div
                  className={styles.description}
                  dangerouslySetInnerHTML={{ __html: problem.description || '' }}
                />

                {/* How this judge works — stdin/stdout contract */}
                <div className={styles.ioNote}>
                  <strong>How this judge works:</strong> your program reads the test input from{' '}
                  <code>stdin</code> and must <strong>print</strong> the answer to <code>stdout</code>.
                  Returning a value from a function is not enough — use{' '}
                  <code>print()</code> / <code>console.log()</code> / <code>cout</code>.
                </div>

                {/* Examples */}
                {problem.examples?.length > 0 && (
                  <>
                    <div style={{ marginTop: '1rem', marginBottom: '.25rem', fontWeight: 800, color: '#201b2e', fontSize: '.85rem', fontFamily: 'Space Grotesk, sans-serif' }}>
                      Examples
                    </div>
                    {problem.examples.map((raw, i) => {
                      const ex = parseExample(raw);
                      return (
                        <div key={i} className={styles.exampleBlock}>
                          <div className={styles.exampleLabel}>Example {i + 1}</div>
                          {ex.raw ? (
                            <pre className={styles.exampleRaw}>{ex.raw}</pre>
                          ) : (
                            <>
                              {ex.input && (
                                <div className={styles.exampleRow}>
                                  <span className={styles.exampleKey}>Input:</span>
                                  <span className={styles.exampleVal}>{ex.input}</span>
                                </div>
                              )}
                              {ex.output && (
                                <div className={styles.exampleRow}>
                                  <span className={styles.exampleKey}>Output:</span>
                                  <span className={styles.exampleVal}>{ex.output}</span>
                                </div>
                              )}
                              {ex.explanation && (
                                <div style={{ marginTop: '.35rem', fontSize: '.78rem', color: '#6b7280', fontWeight: 600, lineHeight: 1.5 }}>
                                  {ex.explanation}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}

                {/* Constraints */}
                {problem.constraints?.length > 0 && (
                  <>
                    <div style={{ marginTop: '.85rem', marginBottom: '.35rem', fontWeight: 800, color: '#201b2e', fontSize: '.85rem', fontFamily: 'Space Grotesk, sans-serif' }}>
                      Constraints
                    </div>
                    <ul className={styles.constraintList}>
                      {problem.constraints.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </>
                )}
              </>
            )}

            {/* ── Hints tab ── */}
            {leftTab === 'hints' && (
              <>
                <div style={{ marginBottom: '.75rem', fontSize: '.85rem', color: '#9891a6', fontWeight: 600 }}>
                  Hints help you think — try solving without them first!
                </div>
                {hintShown === 0 ? (
                  <button className={styles.hintBtn} onClick={() => setHintShown(1)}>
                    <Lightbulb size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    Show Hint 1
                  </button>
                ) : (
                  problem.hints?.slice(0, hintShown).map((h, i) => (
                    <div key={i} className={styles.hintBox}>
                      <strong>Hint {i + 1}:</strong> {h}
                    </div>
                  ))
                )}
                {hintShown > 0 && hintShown < (problem.hints?.length || 0) && (
                  <button className={styles.hintBtn} style={{ marginTop: '.5rem' }}
                    onClick={() => setHintShown(h => h + 1)}>
                    Show Hint {hintShown + 1}
                  </button>
                )}
                {!problem.hints?.length && (
                  <div style={{ color: '#9891a6', fontWeight: 600, fontSize: '.85rem' }}>
                    No hints available for this problem.
                  </div>
                )}
              </>
            )}

            {/* ── Submissions tab ── */}
            {leftTab === 'submissions' && (
              <div className={styles.submissionList}>
                {mySubmissions.length === 0 ? (
                  <div style={{ color: '#9891a6', fontWeight: 600, fontSize: '.85rem' }}>
                    No submissions yet. Write your solution and hit Submit!
                  </div>
                ) : (
                  mySubmissions.map(s => (
                    <div key={s.id} className={styles.subCard}>
                      <span className={`${styles.subStatus} ${s.status === 'Accepted' ? styles.subAccepted : styles.subWrong}`}>
                        {s.status === 'Accepted' ? <CheckCircle2 size={13} style={{ verticalAlign: 'middle' }} /> : <XCircle size={13} style={{ verticalAlign: 'middle' }} />}
                        {' '}{s.status}
                      </span>
                      <span className={styles.subLang}>{s.language}</span>
                      {s.runtime_ms != null && (
                        <span className={styles.subTime}>{s.runtime_ms}ms</span>
                      )}
                      <span className={styles.subTime}>{timeSince(s.submitted_at)}</span>
                    </div>
                  ))
                )}
              </div>
            )}

          </div>
        </div>

        {/* ════ Draggable splitter ════ */}
        <div
          className={styles.splitter}
          onMouseDown={startColDrag}
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize panels"
        />

        {/* ════ RIGHT PANEL ════ */}
        <div className={styles.rightPanel} ref={rightPanelRef}>

          {/* Editor toolbar */}
          <div className={styles.editorToolbar}>
            <select
              className={styles.langSelect}
              value={language}
              onChange={e => switchLang(e.target.value)}
            >
              {LANGUAGES.map(l => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>

            <div className={styles.toolbarRight}>
              <button className={`${styles.editorBtn} ${styles.resetBtn}`} onClick={resetCode} title="Reset to starter">
                <RotateCcw size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                Reset
              </button>
              <button
                className={`${styles.editorBtn} ${styles.runBtn}`}
                onClick={handleRun}
                disabled={running || submitting}
              >
                <Play size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                {running ? 'Running…' : 'Run'}
              </button>
              <button
                className={`${styles.editorBtn} ${styles.submitBtn}`}
                onClick={handleSubmit}
                disabled={running || submitting}
              >
                <Send size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </div>

          {/* Code textarea (Monaco-ready) */}
          <div className={styles.editorWrap}>
            <textarea
              ref={textareaRef}
              value={code}
              onChange={e => setCode(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              wrap="off"
              style={{
                width: '100%',
                height: '100%',
                padding: '1rem',
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
                fontSize: '13px',
                lineHeight: '1.65',
                background: '#fafbfc',
                border: 'none',
                outline: 'none',
                resize: 'none',
                color: '#1e293b',
                tabSize: 4,
                whiteSpace: 'pre',
                overflowX: 'auto',
                overflowY: 'auto',
              }}
              onKeyDown={e => {
                // Tab key inserts spaces
                if (e.key === 'Tab') {
                  e.preventDefault();
                  const start = e.currentTarget.selectionStart;
                  const end = e.currentTarget.selectionEnd;
                  const newCode = code.substring(0, start) + '    ' + code.substring(end);
                  setCode(newCode);
                  setTimeout(() => {
                    if (textareaRef.current) {
                      textareaRef.current.selectionStart = start + 4;
                      textareaRef.current.selectionEnd = start + 4;
                    }
                  }, 0);
                }
              }}
            />
          </div>

          {/* Results panel */}
          <div
            className={styles.resultsPanel}
            style={{ height: resultsCollapsed ? 'auto' : resultsHeight }}
          >
            {!resultsCollapsed && (
              <div
                className={styles.resultsResizer}
                onMouseDown={startRowDrag}
                role="separator"
                aria-orientation="horizontal"
                title="Drag to resize"
              />
            )}
            <div className={styles.resultsTabs}>
              <button
                className={`${styles.resultTab} ${rightTab === 'testcases' ? styles.resultTabActive : ''}`}
                onClick={() => { setRightTab('testcases'); setResultsCollapsed(false); }}
              >
                Test Cases ({samples.length})
              </button>
              <button
                className={`${styles.resultTab} ${rightTab === 'result' ? styles.resultTabActive : ''}`}
                onClick={() => { setRightTab('result'); setResultsCollapsed(false); }}
              >
                {running ? 'Running…' : submitting ? 'Submitting…' : 'Result'}
              </button>
              <button
                className={styles.collapseBtn}
                onClick={() => setResultsCollapsed(c => !c)}
                title={resultsCollapsed ? 'Expand results' : 'Collapse results'}
              >
                {resultsCollapsed ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
            </div>

            <div className={styles.resultsBody} style={{ display: resultsCollapsed ? 'none' : undefined }}>

              {/* Sample test cases */}
              {rightTab === 'testcases' && (
                <div className={styles.caseList}>
                  {samples.length === 0 ? (
                    <div style={{ color: '#9891a6', fontSize: '.8rem', fontWeight: 600 }}>
                      No sample test cases available.
                    </div>
                  ) : (
                    samples.map((tc, i) => (
                      <div key={tc.id} className={styles.caseCard}>
                        <div className={styles.caseHeader}>
                          <span className={styles.caseNum}>Case {i + 1}</span>
                        </div>
                        <div className={styles.caseRow}>
                          <span className={styles.caseKey}>Input:</span>
                          <span className={styles.caseVal}>{tc.input_data}</span>
                        </div>
                        <div className={styles.caseRow}>
                          <span className={styles.caseKey}>Expected:</span>
                          <span className={styles.caseVal}>{tc.expected}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Results (run or submit) */}
              {rightTab === 'result' && (
                <>
                  {/* Submit result banner */}
                  {submitResult && (
                    <div className={`${styles.resultBanner} ${submitResult.status === 'Accepted' ? styles.resultBannerAccepted : styles.resultBannerWrong}`}>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, fontFamily: 'Space Grotesk, sans-serif', marginBottom: '.5rem' }}>
                        {submitResult.status === 'Accepted' ? '🎉 Accepted!' : `✗ ${submitResult.status}`}
                      </div>
                      <div className={styles.resultStats}>
                        <span className={styles.resultStat}>
                          Cases: <span>{submitResult.passed}/{submitResult.total}</span>
                        </span>
                        <span className={styles.resultStat}>
                          Score: <span>{submitResult.score}%</span>
                        </span>
                        {submitResult.runtime_ms != null && (
                          <span className={styles.resultStat}>
                            Runtime: <span>{submitResult.runtime_ms} ms</span>
                          </span>
                        )}
                        {submitResult.memory_kb != null && (
                          <span className={styles.resultStat}>
                            Memory: <span>{submitResult.memory_kb >= 1024
                              ? `${(submitResult.memory_kb / 1024).toFixed(1)} MB`
                              : `${submitResult.memory_kb} KB`}
                            </span>
                          </span>
                        )}
                        {submitResult.xp_earned > 0 && (
                          <span className={styles.xpGained}>+{submitResult.xp_earned} XP</span>
                        )}
                      </div>

                      {/* First failing test case */}
                      {submitResult.fail_case && (
                        <div style={{ marginTop: '.65rem', background: 'rgba(0,0,0,.05)', borderRadius: '10px', padding: '.6rem .8rem', fontSize: '.78rem', fontFamily: "'JetBrains Mono', monospace" }}>
                          <div style={{ fontWeight: 700, color: '#201b2e', marginBottom: '.3rem', fontFamily: 'Space Grotesk, sans-serif' }}>First Failing Case</div>
                          <div style={{ color: '#6b7280', marginBottom: '.15rem' }}><span style={{ fontWeight: 700 }}>Input:</span>    {submitResult.fail_case.input || '(empty)'}</div>
                          <div style={{ color: '#15803d', marginBottom: '.15rem' }}><span style={{ fontWeight: 700 }}>Expected:</span> {submitResult.fail_case.expected}</div>
                          <div style={{ color: '#dc2626' }}><span style={{ fontWeight: 700 }}>Got:</span>      {submitResult.fail_case.output || '(empty)'}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Run case-by-case results */}
                  {runResults.length > 0 && (
                    <div className={styles.caseList} style={{ marginTop: submitResult ? '.65rem' : 0 }}>
                      {runResults.map((r, i) => (
                        <div key={i} className={styles.caseCard}>
                          <div className={styles.caseHeader}>
                            <span className={styles.caseNum}>Case {i + 1}</span>
                            {r.passed === null ? (
                              <span style={{ fontSize: '.75rem', fontWeight: 700, color: '#6b7280', background: 'rgba(107,114,128,.1)', borderRadius: '6px', padding: '2px 8px' }}>
                                ⚡ Executed
                              </span>
                            ) : (
                              <span className={r.passed ? styles.casePassed : styles.caseFailed}>
                                {r.passed ? '✓ Passed' : '✗ Failed'}
                              </span>
                            )}
                          </div>
                          {r.input != null && (
                            <div className={styles.caseRow}>
                              <span className={styles.caseKey}>Input:</span>
                              <span className={styles.caseVal}>{r.input}</span>
                            </div>
                          )}
                          {r.expected != null && (
                            <div className={styles.caseRow}>
                              <span className={styles.caseKey}>Expected:</span>
                              <span className={styles.caseVal}>{r.expected}</span>
                            </div>
                          )}
                          <div className={styles.caseRow}>
                            <span className={styles.caseKey}>Output:</span>
                            <span className={styles.caseVal}>{r.output || '(empty)'}</span>
                          </div>
                          {r.passed === false && r.status && r.status !== 'Accepted' && (
                            <div className={styles.caseRow}>
                              <span className={styles.caseKey}>Status:</span>
                              <span className={styles.caseVal} style={{ color: '#b91c1c' }}>{r.status}</span>
                            </div>
                          )}
                          {r.time_ms != null && (
                            <div className={styles.caseRow}>
                              <span className={styles.caseKey}>Time:</span>
                              <span className={styles.caseVal}>{r.time_ms}ms</span>
                            </div>
                          )}
                          {r.passed === null && (
                            <div style={{ marginTop: '.4rem', fontSize: '.72rem', color: '#9891a6', fontWeight: 600 }}>
                              ℹ No test cases seeded for this problem yet. Submit to record your attempt.
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Error states */}
                  {runError && (
                    <div style={{ background: 'rgba(220,38,38,.07)', border: '1px solid rgba(220,38,38,.2)', borderRadius: '10px', padding: '.7rem 1rem', color: '#dc2626', fontSize: '.8rem', fontWeight: 700, marginTop: '.5rem' }}>
                      ⚠ Run error: {runError}
                    </div>
                  )}
                  {submitError && (
                    <div style={{ background: 'rgba(220,38,38,.07)', border: '1px solid rgba(220,38,38,.2)', borderRadius: '10px', padding: '.7rem 1rem', color: '#dc2626', fontSize: '.8rem', fontWeight: 700, marginTop: '.5rem' }}>
                      ⚠ Submit error: {submitError}
                    </div>
                  )}

                  {!submitResult && !runError && !submitError && runResults.length === 0 && !running && !submitting && (
                    <div style={{ color: '#9891a6', fontSize: '.8rem', fontWeight: 600, padding: '.25rem 0' }}>
                      Click Run to test against sample cases, or Submit to evaluate all cases.
                    </div>
                  )}

                  {(running || submitting) && (
                    <div style={{ color: '#7c3aed', fontSize: '.82rem', fontWeight: 700, padding: '.25rem 0' }}>
                      {running ? 'Running against sample cases…' : 'Evaluating all test cases…'}
                    </div>
                  )}
                </>
              )}

            </div>
          </div>
        </div>
      </div>
    </>
  );
}
