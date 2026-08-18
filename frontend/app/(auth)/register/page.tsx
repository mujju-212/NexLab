'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authService, type RegisterDto } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth-store';
import styles from './register.module.css';
import Image from 'next/image';

const ROLE_ROUTES: Record<string, string> = {
  free_user:         '/practice/dashboard',
  student:           '/student/dashboard',
  instructor:        '/instructor/dashboard',
  institution_admin: '/institution/dashboard',
  platform_admin:    '/admin/dashboard',
};

const pwStrength = (pw: string): { label: string; color: string; width: string } => {
  if (!pw) return { label: '', color: 'transparent', width: '0%' };
  if (pw.length < 8) return { label: 'Too short', color: '#ef4444', width: '20%' };
  const score = [/[A-Z]/.test(pw), /\d/.test(pw), /[!@#$%^&*]/.test(pw)].filter(Boolean).length;
  if (score === 0) return { label: 'Weak',   color: '#f97316', width: '40%' };
  if (score === 1) return { label: 'Fair',   color: '#eab308', width: '65%' };
  if (score === 2) return { label: 'Good',   color: '#22c55e', width: '80%' };
  return             { label: 'Strong', color: '#10b981', width: '100%' };
};

// ── Code animation snippets ────────────────────────────────────────────────
interface Token { text: string; type: 'keyword'|'fn'|'str'|'num'|'comment'|'plain'|'var'; }
interface Snippet { filename: string; language: string; lines: Token[][]; output: string[]; label: string; }

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
function renderTokens(tokens: Token[]) {
  return tokens.map((tok, i) => (
    <span key={i} className={styles[`tok_${tok.type}` as keyof typeof styles]}>{tok.text}</span>
  ));
}

// useSearchParams() requires a Suspense boundary for Next.js to statically
// prerender this route at build time — without it, the build fails and the
// route falls back to full client-side rendering (slower first load for users).
export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterPageInner />
    </Suspense>
  );
}

function RegisterPageInner() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const searchParams = useSearchParams();

  // ── Account type selection ─────────────────────────────────────────────
  const [accountType, setAccountType] = useState<'individual' | 'institution'>(
    searchParams.get('type') === 'institution' ? 'institution' : 'individual'
  );

  // ── Form state ─────────────────────────────────────────────────────────
  const [form, setForm] = useState<RegisterDto>({ full_name: '', email: '', password: '', phone: '' });
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Institution-specific
  const [institutionName, setInstitutionName] = useState('');
  const [institutionType, setInstitutionType] = useState('');
  const [institutionCode, setInstitutionCode] = useState('');
  const [institutionPhone, setInstitutionPhone] = useState('');
  const [address, setAddress] = useState('');
  const [website, setWebsite] = useState('');

  // Admin identity (institution flow only — individual flow keeps a single Full Name field)
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [staffId, setStaffId] = useState('');

  // ── Email OTP verification (required before submit) ─────────────────────
  const otpPurpose = accountType === 'institution' ? 'institution_register' : 'individual_register';
  const [otpSent,      setOtpSent]      = useState(false);
  const [otpValue,     setOtpValue]     = useState('');
  const [otpVerified,  setOtpVerified]  = useState(false);
  const [otpSending,   setOtpSending]   = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpMessage,   setOtpMessage]   = useState<string | null>(null);
  const [otpError,     setOtpError]     = useState<string | null>(null);

  // Re-lock verification if the user changes the email after verifying/sending
  const handleEmail = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, email: e.target.value }));
    setOtpSent(false); setOtpVerified(false); setOtpValue(''); setOtpError(null); setOtpMessage(null);
  };

  const sendOtp = async () => {
    if (!form.email || !form.email.includes('@')) { setOtpError('Enter a valid email first.'); return; }
    setOtpSending(true); setOtpError(null); setOtpMessage(null);
    try {
      const res = await authService.sendOtp(form.email, otpPurpose);
      setOtpSent(true);
      setOtpMessage(res.message);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Failed to send verification code.';
      setOtpError(msg);
    } finally {
      setOtpSending(false);
    }
  };

  const verifyOtp = async () => {
    if (otpValue.length !== 6) { setOtpError('Enter the 6-digit code.'); return; }
    setOtpVerifying(true); setOtpError(null);
    try {
      const res = await authService.verifyOtp(form.email, otpValue, otpPurpose);
      setOtpVerified(res.verified);
      setOtpMessage(res.message);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Invalid or expired code.';
      setOtpError(msg);
    } finally {
      setOtpVerifying(false);
    }
  };

  const handle = (k: keyof RegisterDto) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const strength = pwStrength(form.password);

  // ── Code editor animation ──────────────────────────────────────────────
  const [sIdx,          setSIdx]          = useState(0);
  const [visibleLines,  setVisibleLines]  = useState(0);
  const [phase,         setPhase]         = useState<'typing'|'running'|'output'|'pause'>('typing');
  const [visibleOutput, setVisibleOutput] = useState(0);
  const typingLineRef = useRef<HTMLSpanElement>(null);
  const aliveRef      = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    const animate = async () => {
      while (aliveRef.current) {
        const snippet = SNIPPETS[sIdx % SNIPPETS.length];
        setPhase('typing');
        setVisibleLines(0);
        setVisibleOutput(0);

        for (let li = 0; li < snippet.lines.length; li++) {
          if (!aliveRef.current) return;
          setVisibleLines(li + 1);
          await sleep(60);
          const fullText = snippet.lines[li].map((t) => t.text).join('');
          for (let c = 0; c <= fullText.length; c++) {
            if (!aliveRef.current) return;
            if (typingLineRef.current) typingLineRef.current.textContent = fullText.slice(0, c);
            await sleep(32 + Math.random() * 20);
          }
          await sleep(100);
        }

        await sleep(350);
        if (!aliveRef.current) return;
        setPhase('running');
        await sleep(950);

        if (!aliveRef.current) return;
        setPhase('output');
        for (let o = 1; o <= snippet.output.length; o++) {
          if (!aliveRef.current) return;
          setVisibleOutput(o);
          await sleep(380);
        }

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

  const snippet = SNIPPETS[sIdx % SNIPPETS.length];

  // ── Submit ─────────────────────────────────────────────────────────────
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.password !== confirmPw) { setError('Passwords do not match.'); return; }
    if (form.password.length < 8)   { setError('Password must be at least 8 characters.'); return; }
    if (accountType === 'institution') {
      if (!institutionName.trim()) { setError('Please enter your institution name.'); return; }
      if (!institutionType) { setError('Please select an institution type.'); return; }
      if (!firstName.trim() || !lastName.trim()) { setError('Please enter the admin\'s first and last name.'); return; }
      if (website && !/^https?:\/\//.test(website)) { setError('Website URL must start with http:// or https://'); return; }
    }
    if (!otpVerified) { setError('Please verify your email with the code sent to it first.'); return; }
    setLoading(true);
    try {
      const res = await authService.register({
        full_name: accountType === 'institution' ? `${firstName} ${lastName}`.trim() : form.full_name,
        email: form.email,
        password: form.password,
        phone: form.phone || undefined,
        ...(accountType === 'institution' ? {
          role: 'institution_admin',
          first_name: firstName,
          last_name: lastName,
          staff_id: staffId || undefined,
          institution_name: institutionName,
          institution_type: institutionType,
          institution_code: institutionCode || undefined,
          institution_phone: institutionPhone || undefined,
          address: address || undefined,
          website: website || undefined,
        } : {}),
      });
      setUser(res.user);
      router.push(ROLE_ROUTES[res.user.role] ?? '/practice/dashboard');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Registration failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.stage}>
      <svg style={{ display: 'none' }}>
        <symbol id="r-play"  viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3" /></symbol>
        <symbol id="r-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></symbol>
        <symbol id="r-zap"   viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></symbol>
      </svg>

      <div className={`${styles.blob} ${styles.blob1}`} />
      <div className={`${styles.blob} ${styles.blob2}`} />
      <div className={`${styles.blob} ${styles.blob3}`} />

      <div className={styles.loginPanel}>
        {/* ── Left: Code Editor Animation ── */}
        <div className={styles.visualPane}>
          <div className={styles.dotGrid} />
          <div className={`${styles.glow} ${styles.glow1}`} />
          <div className={`${styles.glow} ${styles.glow2}`} />

          <div className={styles.aiBadge}>
            <svg viewBox="0 0 24 24"><use href="#r-zap" /></svg>
            +XP
          </div>

          <div className={styles.editorCard}>
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

            <div className={styles.editorBody}>
              <div className={styles.editorCode}>
                {snippet.lines.map((tokens, li) => {
                  const isCurrentLine = li === visibleLines - 1 && phase === 'typing';
                  const isVisible     = li < visibleLines;
                  return (
                    <div key={li} className={`${styles.codeLine} ${isVisible ? styles.codeLineVisible : ''}`}>
                      <span className={styles.lineNum}>{li + 1}</span>
                      <span className={styles.lineContent}>
                        {isCurrentLine ? (
                          <>
                            <span ref={typingLineRef} className={styles.tok_plain} />
                            <span className={styles.cursor} />
                          </>
                        ) : isVisible ? renderTokens(tokens) : null}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className={`${styles.editorOutput} ${(phase==='running'||phase==='output'||phase==='pause') ? styles.editorOutputVisible : ''}`}>
                <div className={styles.outputHeader}>
                  {phase === 'running' ? (
                    <span className={styles.runningPill}><span className={styles.runDot} /> Running…</span>
                  ) : (
                    <span className={styles.passPill}>
                      <svg className={styles.iconTiny}><use href="#r-check" /></svg> Passed
                    </span>
                  )}
                </div>
                <div className={styles.outputLines}>
                  {snippet.output.map((line, oi) => (
                    <div key={oi}
                      className={`${styles.outputLine} ${oi < visibleOutput ? styles.outputLineVisible : ''} ${oi === snippet.output.length-1 ? styles.outputXP : ''}`}>
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.editorFooter}>
              <span className={styles.problemLabel}>{snippet.label}</span>
              <button className={`${styles.runBtn} ${phase==='running' ? styles.runBtnActive : ''}`} tabIndex={-1}>
                <svg className={styles.iconTiny}><use href="#r-play" /></svg>
                {phase === 'running' ? 'Running…' : 'Run ▶'}
              </button>
            </div>
          </div>

          <p className={styles.vpTagline}>
            {accountType === 'institution'
              ? 'Set up your institution · Manage labs & students at scale'
              : 'Free forever · No institution required · Start coding today'}
          </p>
        </div>

        {/* ── Right: Form ── */}
        <div className={styles.formPane}>
          {/* Fixed — always visible, never scrolls away */}
          <div className={styles.formTop}>
            <div className={styles.brandRow}>
              <Image src="/logo.png" alt="NexLab" width={96} height={64} style={{ objectFit: 'contain' }} priority />
            </div>

            {/* Account type toggle */}
            <div style={{ display:'flex', gap:8, background:'rgba(243,232,255,.7)', borderRadius:12, padding:4, border:'1px solid rgba(255,255,255,.9)' }}>
              {(['individual', 'institution'] as const).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => { setAccountType(type); setError(null); }}
                  style={{
                    flex:1, padding:'8px 10px', borderRadius:9, border:'none', cursor:'pointer',
                    fontFamily:'Geist,sans-serif', fontSize:13, fontWeight:600,
                    transition:'all .18s',
                    background: accountType === type ? '#fff' : 'transparent',
                    color: accountType === type ? '#7c3aed' : '#6b7280',
                    boxShadow: accountType === type ? '0 1px 6px rgba(124,58,237,.12)' : 'none',
                  }}
                >
                  {type === 'individual' ? '👤 Individual' : '🏛️ Institution'}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable — header + fields + footer, contained within the panel */}
          <div className={styles.formScroll}>
            <div className={styles.formHead}>
              <h1>
                {accountType === 'individual' ? 'Create Free Account' : 'Register Institution'}
              </h1>
              <p>
                {accountType === 'individual'
                  ? 'Practice DSA, Python & C++ — no institution required.'
                  : 'Set up your NexLab institution and start managing your labs.'}
              </p>
            </div>

            <form onSubmit={submit} className={styles.form} noValidate>

            {/* ─── Institution details ─── only for institution type ─── */}
            {accountType === 'institution' && (
              <>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Institution Name</label>
                  <input className={styles.textInput}
                    placeholder="e.g. ABC Engineering College"
                    value={institutionName}
                    onChange={e => setInstitutionName(e.target.value.replace(/[^A-Za-z\s]/g, ''))}
                    required />
                </div>

                <div className={styles.fieldRow}>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Institution Type</label>
                    <select className={styles.textInput} value={institutionType}
                      onChange={e => setInstitutionType(e.target.value)} required>
                      <option value="">Select type…</option>
                      <option value="University">University</option>
                      <option value="College">College</option>
                      <option value="School">School</option>
                      <option value="Coaching">Coaching Institute</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>
                      Institution Unique ID <span className={styles.optional}>(optional — auto-generated if blank)</span>
                    </label>
                    <input className={styles.textInput}
                      placeholder="e.g. ABC123"
                      value={institutionCode}
                      onChange={e => setInstitutionCode(e.target.value.toUpperCase())} />
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.fieldLabel}>
                    Institution Phone <span className={styles.optional}>(optional)</span>
                  </label>
                  <input className={styles.textInput} type="tel"
                    placeholder="+91 98765 43210"
                    value={institutionPhone}
                    onChange={e => setInstitutionPhone(e.target.value)} />
                </div>

                <div className={styles.field}>
                  <label className={styles.fieldLabel}>
                    Physical Address <span className={styles.optional}>(optional)</span>
                  </label>
                  <textarea className={styles.textarea ?? styles.textInput}
                    placeholder="Street, city, state, PIN code"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    rows={2} />
                </div>

                <div className={styles.field}>
                  <label className={styles.fieldLabel}>
                    Website URL <span className={styles.optional}>(optional)</span>
                  </label>
                  <input className={styles.textInput} type="url"
                    placeholder="https://your-institution.edu"
                    value={website}
                    onChange={e => setWebsite(e.target.value)} />
                </div>

                <div className={styles.fieldRow}>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Admin First Name</label>
                    <input className={styles.textInput}
                      placeholder="First name"
                      value={firstName}
                      onChange={e => setFirstName(e.target.value.replace(/[^A-Za-z\s]/g, ''))}
                      required />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Admin Last Name</label>
                    <input className={styles.textInput}
                      placeholder="Last name"
                      value={lastName}
                      onChange={e => setLastName(e.target.value.replace(/[^A-Za-z\s]/g, ''))}
                      required />
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.fieldLabel}>
                    Admin Employee/Staff ID <span className={styles.optional}>(optional)</span>
                  </label>
                  <input className={styles.textInput}
                    placeholder="e.g. EMP1001"
                    value={staffId}
                    onChange={e => setStaffId(e.target.value)} />
                </div>
              </>
            )}

            {accountType === 'individual' && (
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Full Name</label>
                <input className={styles.textInput}
                  placeholder="Your full name"
                  value={form.full_name} onChange={handle('full_name')} required />
              </div>
            )}

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Email</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className={styles.textInput} type="email"
                  placeholder={accountType === 'institution' ? 'admin@institution.edu' : 'you@example.com'}
                  value={form.email} onChange={handleEmail} disabled={otpVerified} required
                  style={{ flex: 1 }} />
                <button type="button" className={styles.togglePw}
                  style={{ position: 'static', whiteSpace: 'nowrap', padding: '0 14px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontWeight: 600, fontSize: 13, color: otpVerified ? '#10b981' : '#7c3aed' }}
                  disabled={otpSending || otpVerified || !form.email}
                  onClick={sendOtp}>
                  {otpVerified ? 'Verified ✓' : otpSending ? 'Sending…' : otpSent ? 'Resend code' : 'Send code'}
                </button>
              </div>
            </div>

            {otpSent && !otpVerified && (
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Verification Code</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className={styles.textInput} inputMode="numeric" maxLength={6}
                    placeholder="6-digit code" value={otpValue}
                    onChange={e => setOtpValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    style={{ flex: 1, letterSpacing: 4 }} />
                  <button type="button" className={styles.togglePw}
                    style={{ position: 'static', whiteSpace: 'nowrap', padding: '0 14px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontWeight: 600, fontSize: 13, color: '#7c3aed' }}
                    disabled={otpVerifying || otpValue.length !== 6}
                    onClick={verifyOtp}>
                    {otpVerifying ? 'Verifying…' : 'Verify'}
                  </button>
                </div>
              </div>
            )}

            {otpMessage && !otpError && (
              <p style={{ fontSize: 12.5, color: otpVerified ? '#10b981' : '#6b7280', margin: '-8px 0 4px' }}>{otpMessage}</p>
            )}
            {otpError && (
              <p style={{ fontSize: 12.5, color: '#ef4444', margin: '-8px 0 4px' }}>{otpError}</p>
            )}

            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Password</label>
                <div className={styles.pwWrap}>
                  <input className={styles.textInput}
                    type={showPw ? 'text' : 'password'} placeholder="Min. 8 characters"
                    value={form.password} onChange={handle('password')} required />
                  <button type="button" className={styles.togglePw}
                    onClick={() => setShowPw(v => !v)}>
                    {showPw ? '🙈' : '👁️'}
                  </button>
                </div>
                {form.password && (
                  <div className={styles.strengthRow}>
                    <div className={styles.strengthBar}>
                      <div className={styles.strengthFill}
                        style={{ width: strength.width, background: strength.color }} />
                    </div>
                    <span className={styles.strengthLabel} style={{ color: strength.color }}>
                      {strength.label}
                    </span>
                  </div>
                )}
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Confirm Password</label>
                <div className={styles.pwWrap}>
                  <input className={styles.textInput}
                    type={showPw ? 'text' : 'password'} placeholder="Re-enter password"
                    value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required />
                </div>
              </div>
            </div>

            {accountType === 'individual' && (
              <div className={styles.field}>
                <label className={styles.fieldLabel}>
                  Phone <span className={styles.optional}>(optional)</span>
                </label>
                <input className={styles.textInput} type="tel"
                  placeholder="+91 98765 43210"
                  value={form.phone} onChange={handle('phone')} />
              </div>
            )}

            {error && <div className={styles.errorBox}>⚠ {error}</div>}

            <div className={styles.formActions}>
              <button type="submit" className={styles.btnPrimary}
                disabled={loading || !form.full_name || !form.email || !form.password || !otpVerified}>
                <span className={styles.btnLabel}>
                  {loading
                    ? (accountType === 'institution' ? 'Setting up…' : 'Creating account…')
                    : (accountType === 'institution' ? 'Register Institution →' : 'Create Free Account →')}
                </span>
                <span className={styles.spinner} style={{ display: loading ? 'inline-block' : 'none' }} />
              </button>
            </div>
          </form>

          <p className={styles.formFoot}>
            Already have an account? <a href="/login" className={styles.link}>Sign in</a>
          </p>
          {accountType === 'institution' && (
            <p className={styles.formFoot} style={{ marginTop:4 }}>
              Student or instructor?{' '}
              <a href="/login" className={styles.link}>Login with your credentials</a>
            </p>
          )}
          {accountType === 'individual' && (
            <p className={styles.formFoot} style={{ marginTop:4 }}>
              Registering an institution?{' '}
              <button type="button" className={styles.link}
                style={{ background:'none', border:'none', padding:0, cursor:'pointer', font:'inherit' }}
                onClick={() => setAccountType('institution')}>
                Register Institution →
              </button>
            </p>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
