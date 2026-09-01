'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import styles from './register.module.css';
import { authService, type RegisterDto } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth-store';
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
  Phone,
  Globe,
  MapPin,
  CreditCard,
  User,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

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

  // Admin identity (institution flow only)
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [staffId, setStaffId] = useState('');

  // ── Email OTP verification ─────────────────────────────────────────────
  const otpPurpose = accountType === 'institution' ? 'institution_register' : 'individual_register';
  const [otpSent,      setOtpSent]      = useState(false);
  const [otpValue,     setOtpValue]     = useState('');
  const [otpVerified,  setOtpVerified]  = useState(false);
  const [otpSending,   setOtpSending]   = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpMessage,   setOtpMessage]   = useState<string | null>(null);
  const [otpError,     setOtpError]     = useState<string | null>(null);

  const handleTypeSwitch = (type: 'individual' | 'institution') => {
    setAccountType(type);
    setError(null);
    setOtpSent(false);
    setOtpVerified(false);
    setOtpValue('');
    setOtpError(null);
    setOtpMessage(null);
  };

  const handleEmail = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, email: e.target.value }));
    setOtpSent(false);
    setOtpVerified(false);
    setOtpValue('');
    setOtpError(null);
    setOtpMessage(null);
  };

  const sendOtp = async () => {
    if (!form.email || !form.email.includes('@')) {
      setOtpError('Enter a valid email first.');
      return;
    }
    setOtpSending(true);
    setOtpError(null);
    setOtpMessage(null);
    try {
      const res = await authService.sendOtp(form.email, otpPurpose);
      setOtpSent(true);
      setOtpMessage(res.message);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to send verification code.';
      setOtpError(msg);
    } finally {
      setOtpSending(false);
    }
  };

  const verifyOtp = async () => {
    if (otpValue.length !== 6) {
      setOtpError('Enter the 6-digit code.');
      return;
    }
    setOtpVerifying(true);
    setOtpError(null);
    try {
      const res = await authService.verifyOtp(form.email, otpValue, otpPurpose);
      setOtpVerified(res.verified);
      setOtpMessage(res.message);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Invalid or expired code.';
      setOtpError(msg);
    } finally {
      setOtpVerifying(false);
    }
  };

  const handle = (k: keyof RegisterDto) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const strength = pwStrength(form.password);

  // ── Form Submission ───────────────────────────────────────────────────
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.password !== confirmPw) {
      setError('Passwords do not match.');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (accountType === 'institution') {
      if (!institutionName.trim()) {
        setError('Please enter your institution name.');
        return;
      }
      if (!institutionType) {
        setError('Please select an institution type.');
        return;
      }
      if (!firstName.trim() || !lastName.trim()) {
        setError('Please enter the admin\'s first and last name.');
        return;
      }
      if (website && !/^https?:\/\//.test(website)) {
        setError('Website URL must start with http:// or https://');
        return;
      }
    }
    if (!otpVerified) {
      setError('Please verify your email with the code sent to it first.');
      return;
    }
    setLoading(true);
    try {
      const res = await authService.register({
        full_name: accountType === 'institution' ? `${firstName} ${lastName}`.trim() : form.full_name,
        email: form.email,
        password: form.password,
        phone: form.phone || undefined,
        ...(accountType === 'institution'
          ? {
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
            }
          : {}),
      });
      setUser(res.user);
      router.push(ROLE_ROUTES[res.user.role] ?? '/practice/dashboard');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Registration failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
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
            LEFT VISUAL & MOTION SHOWCASE (Matching Login Aesthetic)
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
                  width={32}
                  height={32}
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
                <GraduationCap size={12} />
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
              {accountType === 'institution'
                ? 'Empower your institution with cutting-edge virtual labs, real-time analytics, and seamless classroom management.'
                : 'A modern virtual lab platform to practice, experiment and master real-world concepts — anytime, anywhere.'}
            </p>

            {/* 3. 4 Feature Pills Row */}
            <div className={styles.featuresRow}>
              <div className={styles.featureCard}>
                <div className={styles.featureIconBox} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                  <Code2 size={15} />
                </div>
                <span className={styles.featureTitle}>Interactive<br />Coding Labs</span>
              </div>

              <div className={styles.featureCard}>
                <div className={styles.featureIconBox} style={{ background: '#fdf2f8', color: '#db2777' }}>
                  <FlaskConical size={15} />
                </div>
                <span className={styles.featureTitle}>Hands-on<br />Experiments</span>
              </div>

              <div className={styles.featureCard}>
                <div className={styles.featureIconBox} style={{ background: '#eff6ff', color: '#2563eb' }}>
                  <BarChart3 size={15} />
                </div>
                <span className={styles.featureTitle}>Track Your<br />Progress</span>
              </div>

              <div className={styles.featureCard}>
                <div className={styles.featureIconBox} style={{ background: '#f5f3ff', color: '#9333ea' }}>
                  <Users size={15} />
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
              <span className={styles.statValue}>10K+</span>
              <span className={styles.statLabel}>Active Students</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.statItem}>
              <span className={styles.statValue}>200+</span>
              <span className={styles.statLabel}>Experiments</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.statItem}>
              <span className={styles.statValue}>50+</span>
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
            RIGHT REGISTRATION FORM PANE
            ═════════════════════════════════════════════════════════════════════ */}
        <div className={styles.formPane}>
          {/* Fixed Header & Switcher */}
          <div className={styles.formTop}>
            <div className={styles.formHeader}>
              <h2 className={styles.formTitle}>
                {accountType === 'individual' ? 'Create Free Account' : 'Register Institution'}
              </h2>
              <p className={styles.formDesc}>
                {accountType === 'individual'
                  ? 'Practice DSA, Python & C++ — no institution required.'
                  : 'Set up your NexLab institution and start managing your labs.'}
              </p>
            </div>

            {/* Segmented Control / Type Tabs */}
            <div className={styles.typeToggleWrap}>
              <button
                type="button"
                className={`${styles.typeBtn} ${accountType === 'individual' ? styles.typeBtnActive : ''}`}
                onClick={() => handleTypeSwitch('individual')}
              >
                <User size={15} />
                <span>Individual</span>
              </button>
              <button
                type="button"
                className={`${styles.typeBtn} ${accountType === 'institution' ? styles.typeBtnActive : ''}`}
                onClick={() => handleTypeSwitch('institution')}
              >
                <Building2 size={15} />
                <span>Institution</span>
              </button>
            </div>
          </div>

          {/* Scrollable Form Body */}
          <div className={styles.formScroll}>
            <form onSubmit={submit} className={styles.form} noValidate>

              {/* ─── Institution details ─── only for institution type ─── */}
              {accountType === 'institution' && (
                <>
                  <div className={styles.formGroup}>
                    <label className={styles.inputLabel}>Institution Name</label>
                    <div className={styles.inputWrapper}>
                      <span className={styles.inputIcon}>
                        <Building2 size={16} />
                      </span>
                      <input
                        className={styles.textInput}
                        placeholder="e.g. ABC Engineering College"
                        value={institutionName}
                        onChange={e => setInstitutionName(e.target.value.replace(/[^A-Za-z\s]/g, ''))}
                        required
                      />
                    </div>
                  </div>

                  <div className={styles.fieldRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel}>Institution Type</label>
                      <div className={styles.inputWrapper}>
                        <span className={styles.inputIcon}>
                          <Building2 size={16} />
                        </span>
                        <select
                          className={styles.selectInput}
                          value={institutionType}
                          onChange={e => setInstitutionType(e.target.value)}
                          required
                        >
                          <option value="">Select type…</option>
                          <option value="University">University</option>
                          <option value="College">College</option>
                          <option value="School">School</option>
                          <option value="Coaching">Coaching Institute</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel}>
                        Unique ID <span className={styles.optional}>(optional)</span>
                      </label>
                      <div className={styles.inputWrapper}>
                        <span className={styles.inputIcon}>
                          <CreditCard size={16} />
                        </span>
                        <input
                          className={styles.textInput}
                          placeholder="e.g. ABC123"
                          value={institutionCode}
                          onChange={e => setInstitutionCode(e.target.value.toUpperCase())}
                        />
                      </div>
                    </div>
                  </div>

                  <div className={styles.fieldRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel}>
                        Institution Phone <span className={styles.optional}>(optional)</span>
                      </label>
                      <div className={styles.inputWrapper}>
                        <span className={styles.inputIcon}>
                          <Phone size={16} />
                        </span>
                        <input
                          className={styles.textInput}
                          type="tel"
                          placeholder="+91 98765 43210"
                          value={institutionPhone}
                          onChange={e => setInstitutionPhone(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel}>
                        Website <span className={styles.optional}>(optional)</span>
                      </label>
                      <div className={styles.inputWrapper}>
                        <span className={styles.inputIcon}>
                          <Globe size={16} />
                        </span>
                        <input
                          className={styles.textInput}
                          type="url"
                          placeholder="https://your-institution.edu"
                          value={website}
                          onChange={e => setWebsite(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.inputLabel}>
                      Physical Address <span className={styles.optional}>(optional)</span>
                    </label>
                    <div className={styles.inputWrapper}>
                      <span className={styles.inputIcon} style={{ top: '12px' }}>
                        <MapPin size={16} />
                      </span>
                      <textarea
                        className={styles.textareaInput}
                        placeholder="Street, city, state, PIN code"
                        value={address}
                        onChange={e => setAddress(e.target.value)}
                        rows={2}
                      />
                    </div>
                  </div>

                  <div className={styles.fieldRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel}>Admin First Name</label>
                      <div className={styles.inputWrapper}>
                        <span className={styles.inputIcon}>
                          <User size={16} />
                        </span>
                        <input
                          className={styles.textInput}
                          placeholder="First name"
                          value={firstName}
                          onChange={e => setFirstName(e.target.value.replace(/[^A-Za-z\s]/g, ''))}
                          required
                        />
                      </div>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel}>Admin Last Name</label>
                      <div className={styles.inputWrapper}>
                        <span className={styles.inputIcon}>
                          <User size={16} />
                        </span>
                        <input
                          className={styles.textInput}
                          placeholder="Last name"
                          value={lastName}
                          onChange={e => setLastName(e.target.value.replace(/[^A-Za-z\s]/g, ''))}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.inputLabel}>
                      Admin Employee/Staff ID <span className={styles.optional}>(optional)</span>
                    </label>
                    <div className={styles.inputWrapper}>
                      <span className={styles.inputIcon}>
                        <CreditCard size={16} />
                      </span>
                      <input
                        className={styles.textInput}
                        placeholder="e.g. EMP1001"
                        value={staffId}
                        onChange={e => setStaffId(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* ─── Individual: Full Name ─── */}
              {accountType === 'individual' && (
                <div className={styles.formGroup}>
                  <label className={styles.inputLabel}>Full Name</label>
                  <div className={styles.inputWrapper}>
                    <span className={styles.inputIcon}>
                      <User size={16} />
                    </span>
                    <input
                      className={styles.textInput}
                      placeholder="e.g. Alex Johnson"
                      value={form.full_name}
                      onChange={handle('full_name')}
                      required
                    />
                  </div>
                </div>
              )}

              {/* ─── Email with OTP Verification ─── */}
              <div className={styles.formGroup}>
                <label className={styles.inputLabel}>Email Address</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div className={styles.inputWrapper} style={{ flex: 1 }}>
                    <span className={styles.inputIcon}>
                      <Mail size={16} />
                    </span>
                    <input
                      className={styles.textInput}
                      type="email"
                      placeholder={accountType === 'institution' ? 'admin@institution.edu' : 'you@example.com'}
                      value={form.email}
                      onChange={handleEmail}
                      disabled={otpVerified}
                      required
                    />
                  </div>
                  <button
                    type="button"
                    className={`${styles.otpActionBtn} ${otpVerified ? styles.otpVerifiedBadge : ''}`}
                    disabled={otpSending || otpVerified || !form.email}
                    onClick={sendOtp}
                  >
                    {otpVerified ? (
                      <>
                        <CheckCircle2 size={14} />
                        <span>Verified</span>
                      </>
                    ) : otpSending ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        <span>Sending…</span>
                      </>
                    ) : otpSent ? (
                      'Resend'
                    ) : (
                      'Send Code'
                    )}
                  </button>
                </div>
              </div>

              {/* Verification Code input */}
              {otpSent && !otpVerified && (
                <div className={styles.formGroup}>
                  <label className={styles.inputLabel}>Verification Code</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div className={styles.inputWrapper} style={{ flex: 1 }}>
                      <span className={styles.inputIcon}>
                        <ShieldCheck size={16} />
                      </span>
                      <input
                        className={styles.textInput}
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="6-digit code"
                        value={otpValue}
                        onChange={e => setOtpValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        style={{ letterSpacing: 4, fontWeight: 700 }}
                      />
                    </div>
                    <button
                      type="button"
                      className={styles.otpActionBtn}
                      disabled={otpVerifying || otpValue.length !== 6}
                      onClick={verifyOtp}
                    >
                      {otpVerifying ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          <span>Verifying…</span>
                        </>
                      ) : (
                        'Verify'
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* OTP Notifications */}
              {otpMessage && !otpError && (
                <div className={`${styles.infoAlert} ${otpVerified ? styles.infoAlertSuccess : styles.infoAlertNeutral}`}>
                  <CheckCircle2 size={13} />
                  <span>{otpMessage}</span>
                </div>
              )}
              {otpError && (
                <div className={styles.errorAlert} style={{ padding: '7px 12px', fontSize: '11.5px', marginBottom: 8 }}>
                  <AlertCircle size={13} />
                  <span>{otpError}</span>
                </div>
              )}

              {/* ─── Passwords ─── */}
              <div className={styles.fieldRow}>
                <div className={styles.formGroup}>
                  <label className={styles.inputLabel}>Password</label>
                  <div className={styles.inputWrapper}>
                    <span className={styles.inputIcon}>
                      <Lock size={16} />
                    </span>
                    <input
                      className={styles.textInput}
                      type={showPw ? 'text' : 'password'}
                      placeholder="Min. 8 characters"
                      value={form.password}
                      onChange={handle('password')}
                      required
                    />
                    <button
                      type="button"
                      className={styles.pwToggleBtn}
                      onClick={() => setShowPw(v => !v)}
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                    >
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {form.password && (
                    <div className={styles.strengthRow}>
                      <div className={styles.strengthBar}>
                        <div
                          className={styles.strengthFill}
                          style={{ width: strength.width, background: strength.color }}
                        />
                      </div>
                      <span className={styles.strengthLabel} style={{ color: strength.color }}>
                        {strength.label}
                      </span>
                    </div>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.inputLabel}>Confirm Password</label>
                  <div className={styles.inputWrapper}>
                    <span className={styles.inputIcon}>
                      <Lock size={16} />
                    </span>
                    <input
                      className={styles.textInput}
                      type={showPw ? 'text' : 'password'}
                      placeholder="Re-enter password"
                      value={confirmPw}
                      onChange={e => setConfirmPw(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Optional Phone for Individual */}
              {accountType === 'individual' && (
                <div className={styles.formGroup}>
                  <label className={styles.inputLabel}>
                    Phone <span className={styles.optional}>(optional)</span>
                  </label>
                  <div className={styles.inputWrapper}>
                    <span className={styles.inputIcon}>
                      <Phone size={16} />
                    </span>
                    <input
                      className={styles.textInput}
                      type="tel"
                      placeholder="+91 98765 43210"
                      value={form.phone}
                      onChange={handle('phone')}
                    />
                  </div>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className={styles.errorAlert}>
                  <AlertCircle size={15} />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                className={styles.submitBtn}
                disabled={
                  loading ||
                  (accountType === 'individual' && !form.full_name) ||
                  !form.email ||
                  !form.password ||
                  !otpVerified
                }
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>
                      {accountType === 'institution' ? 'Setting up…' : 'Creating account…'}
                    </span>
                  </>
                ) : (
                  <>
                    <span>
                      {accountType === 'institution' ? 'Register Institution' : 'Create Free Account'}
                    </span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            {/* Bottom Links */}
            <div className={styles.bottomLinksWrap}>
              <p className={styles.bottomLinkText}>
                Already have an account?{' '}
                <Link href="/login" className={styles.bottomLinkAccent}>
                  Sign in →
                </Link>
              </p>
              {accountType === 'individual' && (
                <p className={styles.bottomLinkText}>
                  Registering an institution?{' '}
                  <button
                    type="button"
                    className={styles.switchTypeBtn}
                    onClick={() => handleTypeSwitch('institution')}
                  >
                    Register Institution →
                  </button>
                </p>
              )}
              {accountType === 'institution' && (
                <p className={styles.bottomLinkText}>
                  Student or instructor?{' '}
                  <Link href="/login" className={styles.bottomLinkAccent}>
                    Login with your credentials →
                  </Link>
                </p>
              )}
            </div>

            {/* Bottom Security Trust Badge */}
            <div className={styles.trustBadge}>
              <div className={styles.trustIconBox}>
                <ShieldCheck size={16} />
              </div>
              <div>
                <h4 className={styles.trustTitle}>Secure · Reliable · Built for Learners</h4>
                <p className={styles.trustDesc}>Your data and credentials are encrypted &amp; safe.</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
