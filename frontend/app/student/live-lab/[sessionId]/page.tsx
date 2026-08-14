'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import StudentShell from '@/components/layout/StudentShell';
import { studentService } from '@/services/student.service';
import { executionService } from '@/services/execution.service';
import { aiService } from '@/services/ai.service';
import type { Language } from '@/types';
import { Radio, Sparkles, Loader2, ShieldAlert, Video } from 'lucide-react';
import styles from '../page.module.css';

interface GateResult {
  gate_passed: boolean;
  session: { experiment_id: string; jitsi_room_name?: string | null; status?: string };
  jitsi_room: string | null;
  focus_ml_enabled: boolean;
  lockdown_enabled: boolean;
}

const LANGS: { key: Language; label: string; file: string }[] = [
  { key: 'python', label: 'Python', file: 'lab.py' },
  { key: 'javascript', label: 'JS', file: 'lab.js' },
  { key: 'c', label: 'C', file: 'lab.c' },
  { key: 'cpp', label: 'C++', file: 'lab.cpp' },
  { key: 'java', label: 'Java', file: 'Main.java' },
];

export default function LiveLabRoomPage() {
  const router = useRouter();
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;

  const [gate, setGate] = useState<GateResult | null>(null);
  const [gateLoading, setGateLoading] = useState(true);
  const [gateError, setGateError] = useState('');

  const [language, setLanguage] = useState<Language>('python');
  const [code, setCode] = useState('# Write your experiment code here\n');
  const [stdin, setStdin] = useState('');
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<'output' | 'ai'>('output');

  const [hint, setHint] = useState('');
  const [hintLevel, setHintLevel] = useState(0);
  const [hintLoading, setHintLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Gate check on mount ────────────────────────────────────────────────────
  useEffect(() => {
    studentService.checkGate(sessionId)
      .then(res => setGate(res as GateResult))
      .catch(e => setGateError(e instanceof Error ? e.message : 'Gate check failed'))
      .finally(() => setGateLoading(false));
  }, [sessionId]);

  // ── Real code execution via Judge0 ─────────────────────────────────────────
  const runCode = async () => {
    if (!gate) return;
    setRunning(true);
    setOutput('');
    setActiveTab('output');
    try {
      const res = await executionService.runCode({
        files: { main: code },
        language,
        stdin: stdin || undefined,
        experiment_id: gate.session.experiment_id,
        session_id: sessionId,
      });
      const parts = [
        res.compile_output ? `[Compile]\n${res.compile_output}` : '',
        res.stdout || '',
        res.stderr ? `[Error]\n${res.stderr}` : '',
        `\n>>> Status: ${res.status} | Time: ${res.time}s | Memory: ${res.memory} KB`,
      ].filter(Boolean);
      setOutput(parts.join('\n'));
    } catch (e) {
      setOutput(`Execution failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setRunning(false);
    }
  };

  // ── Progressive AI hints (3 levels, real Groq backend) ─────────────────────
  const getHint = async () => {
    if (!gate) return;
    const nextLevel = Math.min(hintLevel + 1, 3) as 1 | 2 | 3;
    setHintLoading(true);
    setActiveTab('ai');
    try {
      const res = await aiService.getHint({
        experiment_id: gate.session.experiment_id,
        session_id: sessionId,
        hint_level: nextLevel,
        code,
        language,
      }) as { hint?: string; error?: string };
      setHint(res.hint || res.error || 'No hint available.');
      setHintLevel(nextLevel);
    } catch (e) {
      setHint(e instanceof Error ? e.message : 'Hint service unavailable');
    } finally {
      setHintLoading(false);
    }
  };

  const handleTab = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      setCode(c => c.substring(0, start) + '    ' + c.substring(end));
      setTimeout(() => { el.selectionStart = el.selectionEnd = start + 4; }, 0);
    }
  }, []);

  if (gateLoading) {
    return (
      <StudentShell activePage="Live Coding Lab">
        <div className={styles.loadingBox}><Loader2 size={20} className={styles.spinner} /> Checking pre-lab gate…</div>
      </StudentShell>
    );
  }

  if (gateError || !gate) {
    return (
      <StudentShell activePage="Live Coding Lab">
        <div className={styles.errorBox}>⚠️ {gateError || 'Session not found'}</div>
        <button className={styles.joinBtn} onClick={() => router.push('/student/live-lab')}>← Back to sessions</button>
      </StudentShell>
    );
  }

  if (!gate.gate_passed) {
    return (
      <StudentShell activePage="Live Coding Lab" title="Gate Locked" subtitle="Complete the pre-lab quiz to unlock this session">
        <div className={styles.joinFlow}>
          <div className={styles.sessionCard}>
            <div className={styles.sessionBadge}><ShieldAlert size={13} /> LOCKED</div>
            <h2 className={styles.sessionTitle}>Pre-Lab Gate Not Cleared</h2>
            <p style={{ fontSize: 14, color: '#615a72', fontWeight: 500, lineHeight: 1.6 }}>
              You must pass the pre-lab quiz for this experiment before joining the live session.
              Complete the quiz modules first, then come back to join.
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
              <button className={styles.joinBtn} onClick={() => router.push('/student/pre-lab')}>📖 Go to Pre-Lab</button>
              <button className={styles.checkBtn} onClick={() => router.push('/student/live-lab')}>Back to sessions</button>
            </div>
          </div>
        </div>
      </StudentShell>
    );
  }

  const currentLang = LANGS.find(l => l.key === language)!;

  return (
    <StudentShell activePage="Live Coding Lab">
      <div className={styles.labLayout}>

        {/* ── Top Bar ── */}
        <div className={styles.labTopBar}>
          <div className={styles.sessionInfo}>
            <span className={styles.livePill}><Radio size={12} /> LIVE</span>
            <span className={styles.sessionName}>Lab Session</span>
            {gate.focus_ml_enabled && <span className={styles.attendedPill}>🧠 Focus ML on</span>}
            {gate.lockdown_enabled && <span className={styles.attendedPill}>🔒 Lockdown on</span>}
          </div>
          <div className={styles.labActions}>
            {gate.jitsi_room && (
              <a
                className={styles.attendBtn}
                href={`https://meet.jit.si/${gate.jitsi_room}`}
                target="_blank" rel="noopener noreferrer"
                style={{ textDecoration: 'none' }}
              >
                <Video size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
                Join Video Room
              </a>
            )}
            <button className={styles.hintBtn} onClick={getHint} disabled={hintLoading}>
              <Sparkles size={14} /> AI Hint {hintLevel > 0 ? `(L${hintLevel})` : ''}
            </button>
            <div className={styles.langSelect}>
              {LANGS.map(l => (
                <button
                  key={l.key}
                  className={`${styles.langBtn} ${language === l.key ? styles.langActive : ''}`}
                  onClick={() => setLanguage(l.key)}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Split Layout ── */}
        <div className={styles.splitLayout}>

          {/* Left: Output + AI */}
          <div className={styles.leftPane}>
            <div className={styles.paneTabs}>
              {(['output', 'ai'] as const).map(t => (
                <button
                  key={t}
                  className={`${styles.paneTab} ${activeTab === t ? styles.paneTabActive : ''}`}
                  onClick={() => setActiveTab(t)}
                >
                  {t === 'output' ? 'Output' : 'AI Hints'}
                  {t === 'output' && output && <span className={styles.tabDot} />}
                </button>
              ))}
            </div>

            <div className={styles.paneContent}>
              {activeTab === 'output' && (
                <div className={styles.outputPane}>
                  {running ? (
                    <div className={styles.outputRunning}>
                      <div className={styles.outputSpinner} />
                      <span>Executing in Judge0 sandbox…</span>
                    </div>
                  ) : output ? (
                    <pre className={styles.outputText}>{output}</pre>
                  ) : (
                    <div className={styles.outputEmpty}>
                      <span>▶ Run your code to see output here</span>
                    </div>
                  )}
                  <div style={{ marginTop: 14 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#9891a6' }}>Stdin (optional)</label>
                    <textarea
                      className={styles.stdinBox}
                      value={stdin}
                      onChange={e => setStdin(e.target.value)}
                      placeholder="Program input…"
                      rows={3}
                    />
                  </div>
                </div>
              )}

              {activeTab === 'ai' && (
                <div className={styles.aiPane}>
                  <div className={styles.aiHeader}>
                    <Sparkles size={28} style={{ color: '#7c3aed' }} />
                    <div>
                      <p className={styles.aiTitle}>AI Lab Assistant</p>
                      <p className={styles.aiSub}>Progressive hints — level {hintLevel}/3 used</p>
                    </div>
                  </div>
                  {hintLoading ? (
                    <div className={styles.hintLoading}>
                      <div className={styles.hintSpinner} />
                      <span>Generating hint…</span>
                    </div>
                  ) : hint ? (
                    <div className={styles.hintBubble}><p>{hint}</p></div>
                  ) : (
                    <div className={styles.hintBubble}><p>Stuck? Click “AI Hint” for a level-1 nudge. Deeper levels cost more grade deduction.</p></div>
                  )}
                  <button className={styles.newHintBtn} onClick={getHint} disabled={hintLoading || hintLevel >= 3}>
                    {hintLevel >= 3 ? 'All hint levels used' : '✨ Get Next Hint'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right: Code Editor */}
          <div className={styles.rightPane}>
            <div className={styles.editorWrapper}>
              <div className={styles.editorBar}>
                <div className={styles.editorDots}>
                  <span style={{ background: '#ef4444' }} />
                  <span style={{ background: '#f59e0b' }} />
                  <span style={{ background: '#22c55e' }} />
                </div>
                <span className={styles.editorFilename}>{currentLang.file}</span>
                <span className={styles.editorLang}>{language.toUpperCase()}</span>
              </div>

              <div className={styles.editorArea}>
                <div className={styles.lineNums}>
                  {code.split('\n').map((_, i) => (
                    <div key={i} className={styles.lineNum}>{i + 1}</div>
                  ))}
                </div>
                <textarea
                  ref={textareaRef}
                  className={styles.editor}
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  onKeyDown={handleTab}
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="off"
                />
              </div>

              <div className={styles.editorFooter}>
                <div className={styles.editorStats}>
                  <span>Lines: {code.split('\n').length}</span>
                  <span>Chars: {code.length}</span>
                </div>
                <div className={styles.editorBtns}>
                  <button className={styles.clearCodeBtn} onClick={() => setCode('')}>Clear</button>
                  <button className={styles.runBtn} onClick={runCode} disabled={running || !code.trim()}>
                    {running ? <><span className={styles.runSpinner} /> Running…</> : <>▶ Run Code</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </StudentShell>
  );
}
