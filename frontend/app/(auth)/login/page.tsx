'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import styles from './page.module.css';
import { authService } from '@/services/auth.service';
import { apiClient } from '@/services/api-client';
import { useAuthStore } from '@/store/auth-store';
import type { BackendRole } from '@/services/auth.service';
import {
  Code2,
  FlaskConical,
  BarChart3,
  Users,
  GraduationCap,
  ArrowRight,
  ShieldCheck,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Building2,
  Loader2,
  AlertCircle,
} from 'lucide-react';

const ROLE_ROUTES: Record<BackendRole, string> = {
  platform_admin:    '/admin/dashboard',
  institution_admin: '/institution/dashboard',
  instructor:        '/instructor/dashboard',
  student:           '/student/dashboard',
  free_user:         '/practice/dashboard',
};

export default function LoginPageClient() {
  const router = useRouter();
  const { setUser } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load remembered email on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('nexlab_remembered_email');
      if (saved) setEmail(saved);
    }
  }, []);

  // Speculative prefetch for fast redirects
  const safePrefetch = (route: string) => {
    try {
      const p = router.prefetch(route) as unknown as Promise<void> | void;
      if (p instanceof Promise) p.catch(() => {});
    } catch {
      /* noop */
    }
  };

  useEffect(() => {
    Object.values(ROLE_ROUTES).forEach(safePrefetch);
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;

    const fd = new FormData(e.currentTarget);
    const em = String(fd.get('email') ?? email).trim();
    const pw = String(fd.get('password') ?? password);

    if (!em || !pw) {
      setError('Please enter both your email and password.');
      return;
    }

    setEmail(em);
    setPassword(pw);
    setError(null);
    setLoading(true);

    if (rememberMe && typeof window !== 'undefined') {
      localStorage.setItem('nexlab_remembered_email', em);
    } else if (typeof window !== 'undefined') {
      localStorage.removeItem('nexlab_remembered_email');
    }

    Object.values(ROLE_ROUTES).forEach(safePrefetch);

    try {
      const data = await authService.login({ email: em, password: pw });
      setUser(data.user);
      const targetRoute = ROLE_ROUTES[data.user.role] ?? '/practice/dashboard';
      router.push(targetRoute);
    } catch (err: unknown) {
      // Distinguish "your password is wrong" from "the server/tunnel is not
      // reachable". A 530/502/503 used to be reported as bad credentials, which
      // sends people hunting for a password problem that does not exist.
      const e = err as {
        response?: { status?: number; data?: { error?: string } };
        code?: string;
        message?: string;
      };
      const status = e?.response?.status;
      const serverMsg = e?.response?.data?.error;
      let msg: string;
      if (status === undefined || e?.code === 'ERR_NETWORK' || e?.code === 'ECONNABORTED') {
        msg =
          'Cannot reach the NexLab server. It may be restarting — wait a few seconds and try again.';
      } else if (status >= 500) {
        msg = `The server is temporarily unavailable (HTTP ${status}). This is not a password problem — please retry shortly.`;
      } else if (status === 429) {
        msg = serverMsg ?? 'Too many login attempts. Please wait a minute and try again.';
      } else if (status === 401 || status === 403) {
        msg = serverMsg ?? 'Login failed. Please verify your credentials and try again.';
      } else {
        msg = serverMsg ?? `Login failed (HTTP ${status}). Please try again.`;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Real platform counters for the hero stats bar (no invented marketing figures).
  const [platformStats, setPlatformStats] = React.useState<{
    active_students: number | null;
    experiments: number | null;
    institutions: number | null;
  } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    apiClient
      .get('/platform/public-stats')
      .then((r) => {
        if (!cancelled) setPlatformStats(r.data);
      })
      .catch(() => {
        if (!cancelled) setPlatformStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const statValue = (n: number | null | undefined) => {
    if (n === null || n === undefined) return '—';
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K+`;
    return `${n}`;
  };

  return (
    <div className={styles.stage}>
      {/* Background ambient lighting */}
      <div className={`${styles.blob} ${styles.blob1}`} />
      <div className={`${styles.blob} ${styles.blob2}`} />
      <div className={`${styles.blob} ${styles.blob3}`} />

      {/* Main Glass/SaaS Window */}
      <div className={styles.loginPanel}>

        {/* ═════════════════════════════════════════════════════════════════════
            LEFT VISUAL & MOTION SHOWCASE
            ═════════════════════════════════════════════════════════════════════ */}
        <div className={styles.visualPane}>
          <div className={styles.dotGrid} />

          {/* 1. Brand Header */}
          <div className={styles.brandHeaderRow}>
            <div className={styles.brandLogoGroup}>
              <div className={styles.logoIconWrap}>
                <Image
                  src="/logo.png"
                  alt="NexLab Logo"
                  width={34}
                  height={34}
                  style={{ objectFit: 'contain' }}
                  priority
                />
              </div>
              <div className={styles.brandLogoText}>
                <span className={styles.brandName}>NexLab</span>
                <span className={styles.brandTagline}>Learn · Experiment · Grow</span>
              </div>
            </div>

            <div className={styles.audiencePill}>
              <div className={styles.audienceIconBox}>
                <GraduationCap size={13} />
              </div>
              <span>For Students, Educators &amp; Institutions</span>
            </div>
          </div>

          {/* 2. Hero Headings */}
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>
              Practice Today<br />
              <span className={styles.heroTitleGradient}>Build Tomorrow</span>
            </h1>
            <p className={styles.heroSubtitle}>
              A modern virtual lab platform to practice, experiment and master real-world concepts — anytime, anywhere.
            </p>

            {/* 3. 4 Feature Pills Row */}
            <div className={styles.featuresRow}>
              <div className={styles.featureCard}>
                <div className={styles.featureIconBox} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                  <Code2 size={16} />
                </div>
                <span className={styles.featureTitle}>Interactive<br />Coding Labs</span>
              </div>

              <div className={styles.featureCard}>
                <div className={styles.featureIconBox} style={{ background: '#fdf2f8', color: '#db2777' }}>
                  <FlaskConical size={16} />
                </div>
                <span className={styles.featureTitle}>Hands-on<br />Experiments</span>
              </div>

              <div className={styles.featureCard}>
                <div className={styles.featureIconBox} style={{ background: '#eff6ff', color: '#2563eb' }}>
                  <BarChart3 size={16} />
                </div>
                <span className={styles.featureTitle}>Track Your<br />Progress</span>
              </div>

              <div className={styles.featureCard}>
                <div className={styles.featureIconBox} style={{ background: '#f5f3ff', color: '#9333ea' }}>
                  <Users size={16} />
                </div>
                <span className={styles.featureTitle}>Learn<br />Collaboratively</span>
              </div>
            </div>
          </div>

          {/* 4. 3D Stage Section with Overlapping Motion Site Animations */}
          <div className={styles.laptopStage}>
            <div className={styles.stageImageWrap}>
              <Image
                src="/login/laptop_stage.png"
                alt="NexLab 3D Laptop Laboratory Workspace"
                fill
                style={{ objectFit: 'contain' }}
                priority
              />

              {/* Overlapping Motion: Cursive Annotation on Left */}
              <div className={styles.plantAnnotation}>
                <span className={styles.cursiveText}>Code<br />Experiment<br />Improve</span>
                <svg className={styles.cursiveArrow} viewBox="0 0 40 24" fill="none" stroke="currentColor">
                  <path d="M 4 4 C 16 22, 28 20, 36 12" strokeWidth="2.5" strokeLinecap="round" />
                  <polygon points="32,7 38,11 36,18" fill="currentColor" />
                </svg>
              </div>

              {/* Overlapping Motion: Live Lab Active Status Pill */}
              <div className={styles.compilerStatusPill}>
                <span className={styles.pulseDotGreen} />
                <span className={styles.compilerPillText}>Live Lab Session · Active</span>
              </div>

              {/* Overlapping Motion: Floating Glass Badge on Right */}
              <div className={styles.floatingGlassBadge}>
                <div className={styles.badgeSparkleRow}>
                  <span className={styles.badgeSub}>Small</span>
                  <span className={styles.sparkleDot} />
                </div>
                <div className={styles.badgeAccentRow}>
                  <span className={styles.badgeAccent}>Experiments</span>
                </div>
                <div className={styles.badgeFuturesRow}>
                  <span className={styles.badgeFutures}>Big Futures</span>
                  <span className={styles.badgeArrow}>↗</span>
                </div>
              </div>

              {/* Overlapping Motion: XP Score Reward Chip */}
              <div className={styles.xpRewardBadge}>
                <span className={styles.xpCheckIcon}>✓</span>
                <span className={styles.xpText}>Passed 100/100</span>
                <span className={styles.xpBonus}>+40 XP</span>
              </div>
            </div>
          </div>

          {/* 5. Bottom Metrics Stats Bar */}
          <div className={styles.statsRow}>
            <div className={styles.statItem}>
              <span className={styles.statValue}>{statValue(platformStats?.active_students)}</span>
              <span className={styles.statLabel}>Active Students</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.statItem}>
              <span className={styles.statValue}>{statValue(platformStats?.experiments)}</span>
              <span className={styles.statLabel}>Experiments</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.statItem}>
              <span className={styles.statValue}>{statValue(platformStats?.institutions)}</span>
              <span className={styles.statLabel}>Institutions</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.statItem}>
              <span className={styles.statValue}>∞</span>
              <span className={styles.statLabel}>Learning Possibilities</span>
            </div>
          </div>
        </div>

        {/* ═════════════════════════════════════════════════════════════════════
            RIGHT AUTHENTICATION FORM PANE
            ═════════════════════════════════════════════════════════════════════ */}
        <div className={styles.formPane}>
          {/* Form Header */}
          <div className={styles.formHeader}>
            <h2 className={styles.formTitle}>Welcome back</h2>
            <p className={styles.formDesc}>Sign in to continue your learning journey.</p>
          </div>

          {/* Login Form */}
          <form className={styles.loginForm} onSubmit={handleSubmit} method="post" action="/login" noValidate>
            {/* Email Field */}
            <div className={styles.formGroup}>
              <label className={styles.inputLabel} htmlFor="login-email">Email</label>
              <div className={styles.inputWrapper}>
                <span className={styles.inputIcon}>
                  <Mail size={16} />
                </span>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  className={styles.textInput}
                  placeholder="student@nexlab.demo"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div className={styles.formGroup}>
              <label className={styles.inputLabel} htmlFor="login-password">Password</label>
              <div className={styles.inputWrapper}>
                <span className={styles.inputIcon}>
                  <Lock size={16} />
                </span>
                <input
                  id="login-password"
                  name="password"
                  type={showPw ? 'text' : 'password'}
                  className={styles.textInput}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className={styles.pwToggleBtn}
                  onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Remember Me & Forgot Password */}
            <div className={styles.formMetaRow}>
              <label className={styles.rememberMeLabel}>
                <input
                  type="checkbox"
                  className={styles.rememberCheckbox}
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Remember me</span>
              </label>

              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  alert('Password reset instructions have been dispatched to administrator services.');
                }}
                className={styles.forgotPwLink}
              >
                Forgot password?
              </a>
            </div>

            {/* Error Message */}
            {error && (
              <div className={styles.errorAlert}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              id="signInBtn"
              className={styles.signInBtn}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Signing in…</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Sign Up Links */}
          <div className={styles.signupLinksWrap}>
            <p className={styles.signupLinkText}>
              New to NexLab?{' '}
              <Link href="/register" className={styles.signupLinkAccent}>
                Create free account →
              </Link>
            </p>
            <p className={styles.signupLinkText}>
              Registering an institution?{' '}
              <Link href="/register?type=institution" className={styles.signupLinkAccent}>
                Register institution →
              </Link>
            </p>
          </div>

          {/* Bottom Security Trust Badge */}
          <div className={styles.trustBadge}>
            <div className={styles.trustIconBox}>
              <ShieldCheck size={18} />
            </div>
            <div>
              <h4 className={styles.trustTitle}>Secure · Reliable · Built for Learners</h4>
              <p className={styles.trustDesc}>Your data and code submissions are safe with us.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
