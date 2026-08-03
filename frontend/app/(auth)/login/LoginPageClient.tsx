'use client';

import { useState, useEffect, useRef, useId } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

type Role = 'student' | 'teacher' | 'admin';

interface RoleOption {
  value: Role;
  label: string;
  iconId: string;
  colorCls: string;
}

const ROLES: RoleOption[] = [
  { value: 'student', label: 'Student', iconId: 'i-book', colorCls: styles.roleStudent },
  { value: 'teacher', label: 'Teacher', iconId: 'i-cap', colorCls: styles.roleTeacher },
  { value: 'admin', label: 'Admin', iconId: 'i-shield', colorCls: styles.roleAdmin },
];

const STATUS_MSGS = [
  'Initializing neural graph...',
  'Comparing adjacent nodes...',
  'Optimizing traversal path...',
  'Model calibrated',
];

const NUM_BARS = 8;
const NET_NODES: [number, number, number][] = [
  [18, 62, 0], [78, 22, 0.3], [148, 22, 0.6],
  [218, 62, 0.9], [148, 102, 1.2], [78, 102, 1.5],
];
const NET_BALLS = [
  { fill: '#5eead4', begin: '0s' },
  { fill: '#fbbf24', begin: '1.3s' },
  { fill: '#f472b6', begin: '2.6s' },
];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const randArray = (n: number) => Array.from({ length: n }, () => 18 + Math.random() * 75);

export default function LoginPageClient() {
  const router = useRouter();
  const roleListboxId = useId();
  const [roleOpen, setRoleOpen] = useState(false);
  const [role, setRole] = useState<Role>('student');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const barRefs = useRef<(HTMLDivElement | null)[]>(Array(NUM_BARS).fill(null));
  const statusRef = useRef<HTMLParagraphElement>(null);
  const aliveRef = useRef(true);
  const roleDropdownRef = useRef<HTMLDivElement>(null);
  const roleTriggerRef = useRef<HTMLButtonElement>(null);
  const roleOptionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    aliveRef.current = true;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let vals = randArray(NUM_BARS);

    const render = () =>
      barRefs.current.forEach((bar, index) => {
        if (bar) bar.style.height = `${vals[index]}%`;
      });

    const pass = async () => {
      for (let i = 0; i < vals.length - 1; i++) {
        if (!aliveRef.current) return;
        barRefs.current[i]?.classList.add(styles.comparing);
        barRefs.current[i + 1]?.classList.add(styles.comparing);
        await sleep(240);
        if (!aliveRef.current) return;
        if (vals[i] > vals[i + 1]) {
          [vals[i], vals[i + 1]] = [vals[i + 1], vals[i]];
          render();
          await sleep(300);
        }
        if (!aliveRef.current) return;
        barRefs.current[i]?.classList.remove(styles.comparing);
        barRefs.current[i + 1]?.classList.remove(styles.comparing);
      }
    };

    const loop = async () => {
      if (reduce) {
        vals = [...randArray(NUM_BARS)].sort((a, b) => a - b);
        render();
        return;
      }
      render();
      while (aliveRef.current) {
        await sleep(700);
        for (let p = 0; p < NUM_BARS - 1 && aliveRef.current; p++) await pass();
        if (!aliveRef.current) break;
        await sleep(1800);
        if (!aliveRef.current) break;
        vals = randArray(NUM_BARS);
        render();
      }
    };

    loop();
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    const el = statusRef.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      el.textContent = STATUS_MSGS[0];
      return;
    }

    let cancelled = false;
    (async () => {
      let index = 0;
      while (!cancelled) {
        const msg = STATUS_MSGS[index % STATUS_MSGS.length];
        for (let i = 1; i <= msg.length && !cancelled; i++) {
          el.textContent = msg.slice(0, i);
          await sleep(28);
        }
        if (cancelled) break;
        await sleep(1200);
        for (let i = msg.length; i >= 0 && !cancelled; i--) {
          el.textContent = msg.slice(0, i);
          await sleep(14);
        }
        if (cancelled) break;
        await sleep(300);
        index++;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (roleDropdownRef.current?.contains(target)) return;
      setRoleOpen(false);
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setRoleOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, []);

  useEffect(() => {
    if (!roleOpen) return;
    const selectedIndex = ROLES.findIndex((item) => item.value === role);
    const focusTarget = roleOptionRefs.current[selectedIndex] ?? roleOptionRefs.current[0];
    if (!focusTarget) return;
    const frame = window.requestAnimationFrame(() => focusTarget.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [roleOpen, role]);

  const focusRoleOption = (index: number) => {
    const total = ROLES.length;
    const nextIndex = ((index % total) + total) % total;
    roleOptionRefs.current[nextIndex]?.focus();
  };

  const openMenu = () => setRoleOpen(true);

  const closeMenu = () => {
    setRoleOpen(false);
    roleTriggerRef.current?.focus();
  };

  const toggleMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setRoleOpen((open) => !open);
  };

  const selectRole = (event: React.MouseEvent<HTMLButtonElement>, value: Role) => {
    event.stopPropagation();
    setRole(value);
    closeMenu();
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!roleOpen) {
        openMenu();
        return;
      }
      const currentIndex = ROLES.findIndex((item) => item.value === role);
      focusRoleOption(currentIndex + (event.key === 'ArrowDown' ? 1 : -1));
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setRoleOpen((open) => !open);
      return;
    }

    if (event.key === 'Escape' && roleOpen) {
      event.preventDefault();
      closeMenu();
    }
  };

  const handleOptionKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
    value: Role,
  ) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusRoleOption(index + 1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusRoleOption(index - 1);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      focusRoleOption(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      focusRoleOption(ROLES.length - 1);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setRole(value);
      closeMenu();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      if (role === 'student') router.push('/student/dashboard');
      else if (role === 'teacher') router.push('/instructor/dashboard');
      else router.push('/admin/dashboard');
    }, 900);
  };

  // ensure the ROLES array labels map correctly
  const ROLE_DISPLAY: Record<Role, string> = {
    student: 'Student',
    teacher: 'Teacher',
    admin: 'Admin',
  };

  const currentRole = ROLES.find((item) => item.value === role)!;

  return (
    <>
      <svg style={{ display: 'none' }}>
        <symbol id="i-book" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></symbol>
        <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></symbol>
        <symbol id="i-cap" viewBox="0 0 24 24"><path d="M12 3 2 8l10 5 10-5-10-5z" /><path d="M6 11v5c0 1.4 2.7 3 6 3s6-1.6 6-3v-5" /><path d="M22 8v6" /></symbol>
        <symbol id="i-chevron-down" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" /></symbol>
        <symbol id="i-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></symbol>
        <symbol id="i-mail" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 6 12 13 2 6" /></symbol>
        <symbol id="i-lock" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></symbol>
        <symbol id="i-eye" viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" /></symbol>
        <symbol id="i-eye-off" viewBox="0 0 24 24"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a21.6 21.6 0 0 1 5.06-5.94" /><path d="M9.9 4.24A10.9 10.9 0 0 1 12 4c7 0 11 7 11 7a21.6 21.6 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /></symbol>
        <symbol id="i-cpu" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" /><line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" /><line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" /><line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" /></symbol>
        <symbol id="i-sparkle" viewBox="0 0 24 24"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" /></symbol>
      </svg>

      <div className={styles.stage}>
        <div className={`${styles.blob} ${styles.blob1}`} />
        <div className={`${styles.blob} ${styles.blob2}`} />
        <div className={`${styles.blob} ${styles.blob3}`} />

        <div className={styles.loginPanel}>
          <div className={styles.visualPane}>
            <div className={styles.dotGrid} />
            <div className={`${styles.glow} ${styles.glow1}`} />
            <div className={`${styles.glow} ${styles.glow2}`} />

            <div className={styles.labCard}>
              <div className={styles.aiBadge}>
                <svg viewBox="0 0 24 24"><use href="#i-sparkle" /></svg>
                AI
              </div>

              <div className={styles.labHeader}>
                <div className={styles.labEyebrow}>
                  <span className={styles.liveDot} />
                  AI Virtual Lab
                </div>
                <div className={styles.labCpu}>
                  <svg className={styles.iconSm}><use href="#i-cpu" /></svg>
                </div>
              </div>

              <svg className={styles.netWrap} viewBox="0 0 260 118">
                <path
                  id="netPath"
                  d="M18,62 L78,22 L148,22 L218,62 L148,102 L78,102 Z"
                  fill="none"
                  stroke="rgba(255,255,255,.35)"
                  strokeWidth="1.4"
                />
                <g fill="#fff">
                  {NET_NODES.map(([cx, cy, delay], index) => (
                    <circle key={index} className={styles.netNode} cx={cx} cy={cy} r="5" style={{ animationDelay: `${delay}s` }} />
                  ))}
                </g>
                {NET_BALLS.map((ball, index) => (
                  <circle key={index} r="3.2" fill={ball.fill}>
                    <animateMotion dur="4s" begin={ball.begin} repeatCount="indefinite">
                      <mpath href="#netPath" />
                    </animateMotion>
                  </circle>
                ))}
              </svg>

              <div className={styles.sortTitle}>
                <span>Bubble Sort</span>
                <span className={styles.mono}>O(n^2)</span>
              </div>
              <div className={styles.sortBars}>
                {Array.from({ length: NUM_BARS }, (_, index) => (
                  <div
                    key={index}
                    className={styles.sortBar}
                    ref={(element) => {
                      barRefs.current[index] = element;
                    }}
                  />
                ))}
              </div>

              <p className={`${styles.statusLine} ${styles.mono}`} ref={statusRef} />
            </div>

            <p className={styles.vpTagline}>
              Where algorithms come alive - build, run and debug real experiments in your virtual lab.
            </p>
          </div>

          <div className={styles.formPane}>
            <div className={styles.brandRow}>
              <div className={styles.brandMark}><span /><span /><span /></div>
              <span className={styles.logoText}>TYLET</span>
            </div>

            <div className={styles.formHead}>
              <h1>Log In</h1>
              <p>Enter your details to access your virtual lab.</p>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              <div className={`${styles.field} ${styles.fieldRole}`} ref={roleDropdownRef}>
                <label className={styles.fieldLabel}>Login as</label>

                <button
                  type="button"
                  ref={roleTriggerRef}
                  className={`${styles.selectTrigger} ${roleOpen ? styles.selectTriggerOpen : ''}`}
                  onClick={toggleMenu}
                  aria-haspopup="listbox"
                  aria-expanded={roleOpen}
                  aria-controls={roleListboxId}
                  onKeyDown={handleTriggerKeyDown}
                >
                  <div className={`${styles.selectRoleIcon} ${currentRole.colorCls}`}>
                    <svg className={styles.icon}><use href={`#${currentRole.iconId}`} /></svg>
                  </div>
                  <span className={styles.triggerLabel} style={{ flex: 1, textAlign: 'left' }}>
                    {ROLE_DISPLAY[role]}
                  </span>
                  <span className={styles.chevron}>
                    <svg className={styles.icon}><use href="#i-chevron-down" /></svg>
                  </span>
                </button>

                {roleOpen && (
                  <div className={styles.selectMenu} id={roleListboxId} role="listbox" aria-label="Login role options">
                    {ROLES.map((option, index) => (
                      <button
                        key={option.value}
                        type="button"
                        ref={(element) => {
                          roleOptionRefs.current[index] = element;
                        }}
                        className={`${styles.selectOption} ${role === option.value ? styles.selectOptionActive : ''}`}
                        role="option"
                        aria-selected={role === option.value}
                        onClick={(event) => selectRole(event, option.value)}
                        onKeyDown={(event) => handleOptionKeyDown(event, index, option.value)}
                      >
                        <div className={`${styles.optIcon} ${option.colorCls}`}>
                          <svg className={styles.iconSm}><use href={`#${option.iconId}`} /></svg>
                        </div>
                        <span className={styles.optText}>{option.label}</span>
                        <span className={`${styles.optCheck} ${role === option.value ? styles.optCheckOn : ''}`}>
                          <svg className={styles.icon}><use href="#i-check" /></svg>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className={`${styles.field} ${styles.fieldEmail}`}>
                <label className={styles.fieldLabel} htmlFor="email">Email</label>
                <div className={styles.inputWrap}>
                  <span className={styles.fieldIcon}><svg className={styles.icon}><use href="#i-mail" /></svg></span>
                  <input
                    id="email"
                    type="email"
                    className={styles.textInput}
                    placeholder="you@example.com"
                    autoComplete="username"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
              </div>

              <div className={`${styles.field} ${styles.fieldPw}`}>
                <label className={styles.fieldLabel} htmlFor="password">Password</label>
                <div className={styles.inputWrap}>
                  <span className={styles.fieldIcon}><svg className={styles.icon}><use href="#i-lock" /></svg></span>
                  <input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    className={styles.textInput}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    className={styles.togglePw}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPw((visible) => !visible)}
                  >
                    <svg className={styles.icon}><use href={showPw ? '#i-eye-off' : '#i-eye'} /></svg>
                  </button>
                </div>
              </div>

              <div className={styles.formActions}>
                <button
                  type="submit"
                  id="signInBtn"
                  className={`${styles.btnPrimary} ${loading ? styles.btnLoading : ''}`}
                >
                  <span className={styles.btnLabel}>Sign In</span>
                  <span className={styles.spinner} />
                </button>
              </div>
            </form>

            <p className={styles.formFoot}>
              Don&apos;t have an account? <a href="#">Sign Up</a>
            </p>
            <p className={`${styles.formFoot} ${styles.forgotRow}`}>
              <a href="#">Forgot Password?</a>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
