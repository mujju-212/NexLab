'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import Image from 'next/image';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth-store';
import type { BackendRole } from '@/services/auth.service';

const ROLE_ROUTES: Record<BackendRole, string> = {
  platform_admin:    '/admin/dashboard',
  institution_admin: '/institution/dashboard',
  instructor:        '/instructor/dashboard',
  student:           '/student/dashboard',
  free_user:         '/practice',
};

// ── Code snippets ──────────────────────────────────────────────────────────
interface Token { text: string; type: 'keyword'|'fn'|'str'|'num'|'comment'|'plain'|'var'; }
interface Snippet {
  filename: string; language: string;
  lines: Token[][];
  output: string[];
  label: string;
}

const SNIPPETS: Snippet[] = [
  {
    filename: 'binary_search.py', language: 'Python', label: 'Binary Search',
    lines: [
      [{ text:'def ', type:'keyword' },{ text:'binary_search', type:'fn' },{ text:'(arr, target):', type:'plain' }],
      [{ text:'    lo, hi = ', type:'plain' },{ text:'0', type:'num' },{ text:', len(arr)-', type:'plain' },{ text:'1', type:'num' }],
      [{ text:'    ', type:'plain' },{ text:'while', type:'keyword' },{ text:' lo <= hi:', type:'plain' }],
      [{ text:'        mid = (lo + hi) // ', type:'plain' },{ text:'2', type:'num' }],
      [{ text:'        ', type:'plain' },{ text:'if', type:'keyword' },{ text:' arr[mid] == target:', type:'plain' }],
      [{ text:'            ', type:'plain' },{ text:'return', type:'keyword' },{ text:' mid', type:'var' }],
      [{ text:'    ', type:'plain' },{ text:'return ', type:'keyword' },{ text:'-1', type:'num' }],
    ],
    output: ['✓  binary_search([1,3,5,7], 5)  →  2','✓  binary_search([2,4,6,8], 3)  →  -1','★  Score 100/100 · 18ms · +30 XP'],
  },
  {
    filename: 'two_sum.py', language: 'Python', label: 'Hash Map',
    lines: [
      [{ text:'def ', type:'keyword' },{ text:'two_sum', type:'fn' },{ text:'(nums, target):', type:'plain' }],
      [{ text:'    seen = {}', type:'plain' }],
      [{ text:'    ', type:'plain' },{ text:'for', type:'keyword' },{ text:' i, n ', type:'plain' },{ text:'in', type:'keyword' },{ text:' enumerate(nums):', type:'plain' }],
      [{ text:'        comp = target - n', type:'plain' }],
      [{ text:'        ', type:'plain' },{ text:'if', type:'keyword' },{ text:' comp ', type:'plain' },{ text:'in', type:'keyword' },{ text:' seen:', type:'plain' }],
      [{ text:'            ', type:'plain' },{ text:'return', type:'keyword' },{ text:' [seen[comp], i]', type:'var' }],
      [{ text:'        seen[n] = i', type:'plain' }],
    ],
    output: ['✓  two_sum([2,7,11,15], 9)  →  [0, 1]','✓  two_sum([3,2,4], 6)  →  [1, 2]','★  Score 100/100 · 12ms · +40 XP'],
  },
  {
    filename: 'fibonacci.py', language: 'Python', label: 'DP / Memoization',
    lines: [
      [{ text:'from ', type:'keyword' },{ text:'functools ', type:'plain' },{ text:'import', type:'keyword' },{ text:' lru_cache', type:'fn' }],
      [{ text:'@lru_cache(maxsize=', type:'plain' },{ text:'None', type:'keyword' },{ text:')', type:'plain' }],
      [{ text:'def ', type:'keyword' },{ text:'fib', type:'fn' },{ text:'(n):', type:'plain' }],
      [{ text:'    ', type:'plain' },{ text:'# memoised recursion', type:'comment' }],
      [{ text:'    ', type:'plain' },{ text:'if', type:'keyword' },{ text:' n <= ', type:'plain' },{ text:'1', type:'num' },{ text:': ', type:'plain' },{ text:'return', type:'keyword' },{ text:' n', type:'var' }],
      [{ text:'    ', type:'plain' },{ text:'return ', type:'keyword' },{ text:'fib', type:'fn' },{ text:'(n-', type:'plain' },{ text:'1', type:'num' },{ text:') + ', type:'plain' },{ text:'fib', type:'fn' },{ text:'(n-', type:'plain' },{ text:'2', type:'num' },{ text:')', type:'plain' }],
    ],
    output: ['✓  fib(10)  →  55','✓  fib(20)  →  6765','★  Score 100/100 · 8ms · +25 XP'],
  },
];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Renders a full token array to a React fragment
function renderTokens(tokens: Token[]) {
  return tokens.map((tok, i) => (
    <span key={i} className={styles[`tok_${tok.type}`]}>{tok.text}</span>
  ));
}

export default function LoginPageClient() {
  const router   = useRouter();
  const { setUser } = useAuthStore();
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]     = useState<string | null>(null);

  // Animation state — coarse-grained to avoid render storms
  const [sIdx,          setSIdx]          = useState(0);
  const [visibleLines,  setVisibleLines]  = useState(0);        // how many lines fully shown
  const [phase,         setPhase]         = useState<'typing'|'running'|'output'|'pause'>('typing');
  const [visibleOutput, setVisibleOutput] = useState(0);

  // Typing effect: DOM ref for the CURRENT (last) line — updated directly, no extra renders
  const typingLineRef = useRef<HTMLSpanElement>(null);
  const aliveRef      = useRef(true);

  useEffect(() => {
    aliveRef.current = true;

    const animate = async () => {
      while (aliveRef.current) {
        const snippet = SNIPPETS[sIdx % SNIPPETS.length];

        // ── Reset ──
        setPhase('typing');
        setVisibleLines(0);
        setVisibleOutput(0);

        // ── Type each line ──
        for (let li = 0; li < snippet.lines.length; li++) {
          if (!aliveRef.current) return;

          // Reveal placeholder for current line
          setVisibleLines(li + 1);
          await sleep(60); // let React paint the new line

          // Build the full text of this line for char-by-char DOM update
          const fullText = snippet.lines[li].map((t) => t.text).join('');

          // Type chars directly into the DOM ref — ZERO extra React renders
          for (let c = 0; c <= fullText.length; c++) {
            if (!aliveRef.current) return;
            if (typingLineRef.current) {
              typingLineRef.current.textContent = fullText.slice(0, c);
            }
            await sleep(32 + Math.random() * 20);
          }

          await sleep(100);
        }

        // ── Running state ──
        await sleep(350);
        if (!aliveRef.current) return;
        setPhase('running');
        await sleep(950);

        // ── Output reveal ──
        if (!aliveRef.current) return;
        setPhase('output');
        for (let o = 1; o <= snippet.output.length; o++) {
          if (!aliveRef.current) return;
          setVisibleOutput(o);
          await sleep(380);
        }

        // ── Pause then next snippet ──
        setPhase('pause');
        await sleep(3000);
        if (!aliveRef.current) return;
        setSIdx((i) => (i + 1) % SNIPPETS.length);
      }
    };

    animate();
    return () => { aliveRef.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sIdx]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || !email || !password) return;
    setError(null);
    setLoading(true);
    try {
      const data = await authService.login({ email, password });
      setUser(data.user);
      const route = ROLE_ROUTES[data.user.role] ?? '/student/dashboard';
      router.push(route);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Login failed. Check your email and password.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const snippet = SNIPPETS[sIdx % SNIPPETS.length];

  return (
    <>
      <svg style={{ display: 'none' }}>
        <symbol id="i-mail"    viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 6 12 13 2 6" /></symbol>
        <symbol id="i-lock"    viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></symbol>
        <symbol id="i-eye"     viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" /></symbol>
        <symbol id="i-eye-off" viewBox="0 0 24 24"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a21.6 21.6 0 0 1 5.06-5.94" /><path d="M9.9 4.24A10.9 10.9 0 0 1 12 4c7 0 11 7 11 7a21.6 21.6 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /></symbol>
        <symbol id="i-play"    viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3" /></symbol>
        <symbol id="i-check"   viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></symbol>
        <symbol id="i-zap"     viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></symbol>
      </svg>

      <div className={styles.stage}>
        <div className={`${styles.blob} ${styles.blob1}`} />
        <div className={`${styles.blob} ${styles.blob2}`} />
        <div className={`${styles.blob} ${styles.blob3}`} />

        <div className={styles.loginPanel}>

          {/* ── Left Pane ── */}
          <div className={styles.visualPane}>
            <div className={styles.dotGrid} />
            <div className={`${styles.glow} ${styles.glow1}`} />
            <div className={`${styles.glow} ${styles.glow2}`} />

            <div className={styles.aiBadge}>
              <svg viewBox="0 0 24 24"><use href="#i-zap" /></svg>
              +XP
            </div>

            {/* Editor Card */}
            <div className={styles.editorCard}>
              {/* Title bar */}
              <div className={styles.editorTitleBar}>
                <div className={styles.editorDots}>
                  <span className={styles.dot} style={{ background:'rgba(255,100,100,0.75)' }} />
                  <span className={styles.dot} style={{ background:'rgba(255,200,80,0.75)' }} />
                  <span className={styles.dot} style={{ background:'rgba(80,210,140,0.75)' }} />
                </div>
                <div className={styles.editorTabs}>
                  <span className={styles.editorTabActive}>{snippet.filename}</span>
                  <span className={styles.editorTab}>output</span>
                </div>
                <div className={styles.editorLang}>{snippet.language}</div>
              </div>

              {/* Body */}
              <div className={styles.editorBody}>
                <div className={styles.editorCode}>
                  {snippet.lines.map((tokens, li) => {
                    const isCurrentLine = li === visibleLines - 1 && phase === 'typing';
                    const isVisible     = li < visibleLines;
                    return (
                      <div
                        key={li}
                        className={`${styles.codeLine} ${isVisible ? styles.codeLineVisible : ''}`}
                      >
                        <span className={styles.lineNum}>{li + 1}</span>
                        <span className={styles.lineContent}>
                          {isCurrentLine ? (
                            // current line: plain span updated by DOM ref (no extra renders)
                            <>
                              <span ref={typingLineRef} className={styles.tok_plain} />
                              <span className={styles.cursor} />
                            </>
                          ) : isVisible ? (
                            // fully typed lines: render proper coloured tokens
                            renderTokens(tokens)
                          ) : null}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Output overlay */}
                <div className={`${styles.editorOutput} ${(phase==='running'||phase==='output'||phase==='pause') ? styles.editorOutputVisible : ''}`}>
                  <div className={styles.outputHeader}>
                    {phase === 'running' ? (
                      <span className={styles.runningPill}>
                        <span className={styles.runDot} /> Running…
                      </span>
                    ) : (
                      <span className={styles.passPill}>
                        <svg className={styles.iconTiny}><use href="#i-check" /></svg> Passed
                      </span>
                    )}
                  </div>
                  <div className={styles.outputLines}>
                    {snippet.output.map((line, oi) => (
                      <div
                        key={oi}
                        className={`${styles.outputLine} ${oi < visibleOutput ? styles.outputLineVisible : ''} ${oi === snippet.output.length - 1 ? styles.outputXP : ''}`}
                      >
                        {line}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className={styles.editorFooter}>
                <span className={styles.problemLabel}>{snippet.label}</span>
                <button className={`${styles.runBtn} ${phase==='running' ? styles.runBtnActive : ''}`} tabIndex={-1}>
                  <svg className={styles.iconTiny}><use href="#i-play" /></svg>
                  {phase === 'running' ? 'Running…' : 'Run ▶'}
                </button>
              </div>
            </div>

            <p className={styles.vpTagline}>
              Write code · Run it · Learn — NexLab AI Virtual Lab
            </p>
          </div>

          {/* ── Right Form Pane ── */}
          <div className={styles.formPane}>
            <div className={styles.brandRow}>
              <Image src="/logo.png" alt="NexLab" width={96} height={64} style={{ objectFit: 'contain' }} priority />
            </div>

            <div className={styles.formHead}>
              <h1>Welcome back</h1>
              <p>Enter your credentials to access your portal.</p>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              <div className={`${styles.field} ${styles.fieldEmail}`}>
                <label className={styles.fieldLabel} htmlFor="login-email">Email</label>
                <div className={styles.inputWrap}>
                  <span className={styles.fieldIcon}>
                    <svg className={styles.icon}><use href="#i-mail" /></svg>
                  </span>
                  <input
                    id="login-email" type="email"
                    className={styles.textInput} placeholder="you@example.com"
                    autoComplete="username" value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className={`${styles.field} ${styles.fieldPw}`}>
                <label className={styles.fieldLabel} htmlFor="login-password">Password</label>
                <div className={styles.inputWrap}>
                  <span className={styles.fieldIcon}>
                    <svg className={styles.icon}><use href="#i-lock" /></svg>
                  </span>
                  <input
                    id="login-password" type={showPw ? 'text' : 'password'}
                    className={styles.textInput} placeholder="Enter your password"
                    autoComplete="current-password" value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button type="button" className={styles.togglePw}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPw((v) => !v)}>
                    <svg className={styles.icon}><use href={showPw ? '#i-eye-off' : '#i-eye'} /></svg>
                  </button>
                </div>
              </div>

              {error && (
                <p style={{ color:'#f87171', fontSize:'0.82rem', marginBottom:'8px', padding:'8px 12px', background:'rgba(248,113,113,0.1)', borderRadius:'6px', border:'1px solid rgba(248,113,113,0.3)' }}>
                  {error}
                </p>
              )}

              <div className={styles.formActions}>
                <button type="submit" id="signInBtn"
                  disabled={loading || !email || !password}
                  className={`${styles.btnPrimary} ${loading ? styles.btnLoading : ''}`}>
                  <span className={styles.btnLabel}>{loading ? 'Signing in…' : 'Sign In'}</span>
                  <span className={styles.spinner} />
                </button>
              </div>
            </form>

            <p className={`${styles.formFoot} ${styles.forgotRow}`}>
              <a href="#">Forgot Password?</a>
            </p>

            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(245,243,255,.9)', display:'flex', flexDirection:'column', gap:7 }}>
              <p className={styles.formFoot}>
                New to NexLab?{' '}
                <a href="/register" style={{ color:'#7c3aed', fontWeight:700 }}>
                  Create free account →
                </a>
              </p>
              <p className={styles.formFoot}>
                Registering an institution?{' '}
                <a href="/register?type=institution" style={{ color:'#7c3aed', fontWeight:700 }}>
                  Register institution →
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
