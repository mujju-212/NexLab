'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import {
  GraduationCap,
  Trophy,
  Shield,
  Sparkles,
  ArrowUp,
  BookOpen,
  CalendarCheck,
  Clock,
  Puzzle,
  Flame,
  Award,
  Building2,
  Pencil,
  Upload,
  User,
  Check,
  X,
  Camera,
  RotateCcw,
} from 'lucide-react';
import type { UnifiedStudentOverview } from '@/services/student-analytics.service';
import styles from './growth-overview.module.css';

interface TopStandingsRowProps {
  overview: UnifiedStudentOverview | null;
  studentName?: string;
  rollNumber?: string | null;
  department?: string | null;
}

export const TopStandingsRow: React.FC<TopStandingsRowProps> = ({
  overview,
  studentName,
  rollNumber,
  department,
}) => {
  const profile = overview?.profile;
  const academic = overview?.academic;
  const platform = overview?.platform;

  // Student Profile Data
  const displayName = profile?.name || studentName || 'Aditi Rao';
  const displayRoll = profile?.roll_number || rollNumber || 'CS-2024-042';
  const displayDept = profile?.department_year || (department ? `${department} • 2nd Year` : 'CSE-A • 2nd Year');
  const displayInst = profile?.institution_name || 'NexLab Institute of Technology';
  const defaultAvatarUrl = profile?.avatar_url || '/images/student_avatar.jpg';
  const defaultQuote = profile?.quote || 'Consistent practice today builds expertise tomorrow.';

  // Interactive Avatar and Quote State (Persisted in localStorage)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [customAvatar, setCustomAvatar] = useState<string | null>(null);
  const [useInitials, setUseInitials] = useState(false);
  const [quoteInput, setQuoteInput] = useState(defaultQuote);
  const [activeQuote, setActiveQuote] = useState(defaultQuote);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const savedAvatar = localStorage.getItem('nexlab_student_avatar');
      if (savedAvatar) setCustomAvatar(savedAvatar);
      const savedQuote = localStorage.getItem('nexlab_student_quote');
      if (savedQuote) {
        setQuoteInput(savedQuote);
        setActiveQuote(savedQuote);
      }
      const savedInitials = localStorage.getItem('nexlab_student_use_initials');
      if (savedInitials === 'true') setUseInitials(true);
    } catch {
      // ignore localStorage errors in sandboxed environments
    }
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('Please select an image smaller than 5MB');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setCustomAvatar(result);
        setUseInitials(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = () => {
    try {
      if (customAvatar) {
        localStorage.setItem('nexlab_student_avatar', customAvatar);
      } else {
        localStorage.removeItem('nexlab_student_avatar');
      }
      localStorage.setItem('nexlab_student_quote', quoteInput);
      localStorage.setItem('nexlab_student_use_initials', String(useInitials));
    } catch {
      // ignore
    }
    setActiveQuote(quoteInput);
    setIsEditModalOpen(false);
  };

  const handleResetAvatar = () => {
    setCustomAvatar(null);
    setUseInitials(false);
    try {
      localStorage.removeItem('nexlab_student_avatar');
      localStorage.setItem('nexlab_student_use_initials', 'false');
    } catch {
      // ignore
    }
  };

  const studentInitials = displayName
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'AR';

  // Academic Standing Data
  const instRank = academic?.ranks?.institution;
  const rankPos = instRank?.position ?? academic?.ranks?.section?.position ?? 42;
  const cohortSize = instRank?.cohort_size ?? academic?.ranks?.section?.cohort_size ?? 480;
  const rankPercentile = instRank?.percentile ?? 91;
  const topPct = Math.max(1, 100 - Math.round(rankPercentile));
  const avgGrade = academic?.grades?.average != null ? Math.round(academic.grades.average) : 78;

  const standingBand = academic?.standing?.band || 'ok';
  const standingLabel =
    standingBand === 'ok'
      ? 'On Track'
      : standingBand === 'watch'
      ? 'Steady Progress'
      : 'Needs Support';

  const completedExps = academic?.completion?.completed ?? 18;
  const assignedExps = academic?.completion?.assigned ?? 24;
  const attendancePct = academic?.attendance?.attendance_rate ?? 92;

  // Platform Standing Data
  const levelNum = platform?.level ?? 6;
  const levelName = platform?.level_name || 'Skilled';
  const ratingVal = platform?.rating ? Math.round(platform.rating).toLocaleString() : '1,540';
  const globalPct = platform?.global_percentile != null ? Math.max(1, 100 - Math.round(platform.global_percentile)) : 7;

  const curXp = (platform as any)?.total_xp ?? 2350;
  const nextXp = (platform as any)?.next_level_xp ?? 3500;
  const xpPct = Math.min(100, Math.max(10, Math.round((curXp / Math.max(1, nextXp)) * 100))) || 68;

  const problemsSolved = platform?.problems_solved ?? 142;
  const easySolved = platform?.easy_solved ?? 90;
  const medSolved = platform?.medium_solved ?? 42;
  const hardSolved = platform?.hard_solved ?? 10;
  const streakDays = platform?.streak_days ?? 12;
  const badgeCount = platform?.badges?.length ?? 6;

  // SVG Circular Gauge Calculations
  const radius = 27;
  const circumference = 2 * Math.PI * radius;
  const gradeOffset = circumference - (Math.min(100, Math.max(0, avgGrade)) / 100) * circumference;
  const xpOffset = circumference - (Math.min(100, Math.max(0, xpPct)) / 100) * circumference;

  // Overall Growth Blended Score for Card 1 ring (Academic grade + completion rate + attendance)
  const completionRate = academic?.completion?.completion_pct != null
    ? academic.completion.completion_pct
    : Math.round((completedExps / Math.max(1, assignedExps)) * 100);
  const growthScore = Math.min(100, Math.max(10, Math.round(avgGrade * 0.5 + completionRate * 0.3 + attendancePct * 0.2))) || 78;
  const growthOffset = circumference - (growthScore / 100) * circumference;

  return (
    <div className={styles.standingsGrid}>
      {/* ── CARD 1: Student Profile Card ── */}
      <div className={styles.card}>
        <div className={styles.standingHeader}>
          <div className={styles.standingTitleGroup}>
            <div className={`${styles.headerIconCircle} ${styles.profileIconBg}`}>
              <User size={16} />
            </div>
            <h3>Student Profile</h3>
          </div>
          <span className={`${styles.pillBadge} ${styles.pillPurple}`}>
            ● Active Learner
          </span>
        </div>

        <div className={styles.standingBody}>
          <div className={styles.profileHero}>
            <div
              className={styles.avatarWrapper}
              onClick={() => setIsEditModalOpen(true)}
              style={{ cursor: 'pointer' }}
              title="Click to edit profile & avatar"
            >
              {useInitials ? (
                <div className={styles.avatarInitials}>{studentInitials}</div>
              ) : customAvatar ? (
                <img
                  src={customAvatar}
                  alt={displayName}
                  className={styles.avatarImg}
                />
              ) : (
                <Image
                  src={defaultAvatarUrl}
                  alt={displayName}
                  width={56}
                  height={56}
                  className={styles.avatarImg}
                  priority
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              )}
              <div className={styles.avatarEditBadge} title="Edit Profile & Avatar">
                <Pencil size={9} />
              </div>
            </div>

            <div className={styles.profileDetails}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <h2>{displayName}</h2>
                <button
                  onClick={() => setIsEditModalOpen(true)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#7c3aed',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    flexShrink: 0,
                  }}
                  title="Edit profile & personal quote"
                >
                  <Pencil size={11} />
                </button>
              </div>
              <p className={styles.profileSub}>{displayDept}</p>
              <div
                className={styles.quoteChip}
                onClick={() => setIsEditModalOpen(true)}
                title={`"${activeQuote}" - Click to edit personal quote`}
              >
                <Sparkles size={11} style={{ flexShrink: 0 }} />
                <span>&ldquo;{activeQuote}&rdquo;</span>
              </div>
            </div>
          </div>

          <div className={styles.ringColumn}>
            <div className={styles.ringWrapper}>
              <svg width="72" height="72" viewBox="0 0 72 72">
                <circle
                  cx="36"
                  cy="36"
                  r={radius}
                  fill="none"
                  stroke="#f1f5f9"
                  strokeWidth="5.5"
                />
                <circle
                  cx="36"
                  cy="36"
                  r={radius}
                  fill="none"
                  stroke="url(#growthGrad)"
                  strokeWidth="5.5"
                  strokeDasharray={circumference}
                  strokeDashoffset={growthOffset}
                  strokeLinecap="round"
                  transform="rotate(-90 36 36)"
                />
                <defs>
                  <linearGradient id="growthGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#6366f1" />
                  </linearGradient>
                </defs>
              </svg>
              <div className={styles.ringValue}>{growthScore}%</div>
            </div>
            <div className={styles.ringLabel}>Growth Index</div>
            <div className={styles.ringSublabel}>Blended Score</div>
          </div>
        </div>

        <div className={styles.standingFooter}>
          <div className={styles.footerMetric} title={`Campus: ${displayInst}`}>
            <Building2 size={13} className={styles.footerMetricIcon} />
            <span className={styles.footerMetricLabel}>Campus</span>
            <span className={styles.footerMetricVal}>
              {displayInst.length > 11 ? displayInst.slice(0, 11) + '…' : displayInst}
            </span>
          </div>

          <div className={styles.footerMetric} title={`Roll Number: ${displayRoll}`}>
            <User size={13} className={styles.footerMetricIcon} />
            <span className={styles.footerMetricLabel}>Roll</span>
            <span className={styles.footerMetricVal}>{displayRoll}</span>
          </div>

          <div className={styles.footerMetric} style={{ justifyContent: 'flex-end' }}>
            <div className={styles.statusBadge}>
              <span className={styles.statusDot} />
              <span>Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── CARD 2: Academic Standing Card ── */}
      <div className={styles.card}>
        <div className={styles.standingHeader}>
          <div className={styles.standingTitleGroup}>
            <div className={`${styles.headerIconCircle} ${styles.academicIconBg}`}>
              <GraduationCap size={16} />
            </div>
            <h3>Academic Standing</h3>
          </div>
          <span className={`${styles.pillBadge} ${styles.pillGreen}`}>
            ● {standingLabel}
          </span>
        </div>

        <div className={styles.standingBody}>
          <div className={styles.bigRankGroup}>
            <div className={styles.bigRankRow}>
              <span className={styles.bigRankNum}>#{rankPos}</span>
              <span className={styles.cohortNum}>/ {cohortSize}</span>
            </div>
            <span className={styles.standingSubtext}>Top {topPct}% in Institute</span>
            <span className={styles.standingDelta}>
              <ArrowUp size={12} /> +5 this week
            </span>
          </div>

          <div className={styles.ringColumn}>
            <div className={styles.ringWrapper}>
              <svg width="72" height="72" viewBox="0 0 72 72">
                <circle
                  cx="36"
                  cy="36"
                  r={radius}
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="5.5"
                />
                <circle
                  cx="36"
                  cy="36"
                  r={radius}
                  fill="none"
                  stroke="url(#academicGrad)"
                  strokeWidth="5.5"
                  strokeDasharray={circumference}
                  strokeDashoffset={gradeOffset}
                  strokeLinecap="round"
                  transform="rotate(-90 36 36)"
                />
                <defs>
                  <linearGradient id="academicGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                </defs>
              </svg>
              <div className={styles.ringValue}>{avgGrade}%</div>
            </div>
            <div className={styles.ringLabel}>Average Grade</div>
            <div className={styles.ringSublabel}>3/5 subjects</div>
          </div>
        </div>

        <div className={styles.standingFooter}>
          <div className={styles.footerMetric} title="Enrolled Subjects">
            <BookOpen size={13} className={styles.footerMetricIcon} />
            <span className={styles.footerMetricLabel}>Subjects</span>
            <span className={styles.footerMetricVal}>3/5</span>
          </div>

          <div className={styles.footerMetric} title={`Completed Experiments: ${completedExps} of ${assignedExps}`}>
            <CalendarCheck size={13} className={styles.footerMetricIcon} />
            <span className={styles.footerMetricLabel}>Labs</span>
            <span className={styles.footerMetricVal}>{completedExps}/{assignedExps}</span>
          </div>

          <div className={styles.footerMetric} title={`Attendance Rate: ${attendancePct}%`} style={{ justifyContent: 'flex-end' }}>
            <Clock size={13} className={styles.footerMetricIcon} />
            <span className={styles.footerMetricLabel}>Attend</span>
            <span className={styles.footerMetricVal}>{attendancePct}%</span>
          </div>
        </div>
      </div>

      {/* ── CARD 3: Platform Standing Card ── */}
      <div className={styles.card}>
        <div className={styles.standingHeader}>
          <div className={styles.standingTitleGroup}>
            <div className={`${styles.headerIconCircle} ${styles.platformIconBg}`}>
              <Trophy size={16} />
            </div>
            <h3>Platform Standing</h3>
          </div>
          <span className={`${styles.pillBadge} ${styles.pillOrange}`}>
            {levelName}
          </span>
        </div>

        <div className={styles.standingBody}>
          <div className={styles.bigRankGroup}>
            <div className={styles.levelBadgeRow}>
              <span>Level {levelNum}</span>
              <Shield size={15} fill="#ef4444" className={styles.levelIcon} />
            </div>
            <div className={styles.ratingRow}>{ratingVal} rating</div>
            <span className={styles.percentilePurple}>Top {globalPct}% globally</span>
            <div className={styles.levelProgressBar}>
              <div
                className={styles.levelProgressFill}
                style={{ width: `${xpPct}%` }}
              />
            </div>
          </div>

          <div className={styles.ringColumn}>
            <div className={styles.ringWrapper}>
              <svg width="72" height="72" viewBox="0 0 72 72">
                <circle
                  cx="36"
                  cy="36"
                  r={radius}
                  fill="none"
                  stroke="#f1f5f9"
                  strokeWidth="5.5"
                />
                <circle
                  cx="36"
                  cy="36"
                  r={radius}
                  fill="none"
                  stroke="url(#platformGrad)"
                  strokeWidth="5.5"
                  strokeDasharray={circumference}
                  strokeDashoffset={xpOffset}
                  strokeLinecap="round"
                  transform="rotate(-90 36 36)"
                />
                <defs>
                  <linearGradient id="platformGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#ea580c" />
                  </linearGradient>
                </defs>
              </svg>
              <div className={styles.ringValue}>{xpPct}%</div>
            </div>
            <div className={styles.ringLabel}>
              {curXp.toLocaleString()} / {nextXp.toLocaleString()} XP
            </div>
            <div className={styles.ringSublabel}>to Level {levelNum + 1}</div>
          </div>
        </div>

        <div className={styles.standingFooter}>
          <div className={styles.footerMetric} title={`Problems Solved: ${problemsSolved} (Easy: ${easySolved}, Med: ${medSolved}, Hard: ${hardSolved})`}>
            <Puzzle size={13} className={styles.footerMetricIcon} />
            <span className={styles.footerMetricLabel}>Solved</span>
            <span className={styles.footerMetricVal}>{problemsSolved}</span>
          </div>

          <div className={styles.footerMetric} title={`Active Streak: ${streakDays} consecutive active days`}>
            <Flame size={13} color="#ea580c" fill="#ea580c" className={styles.footerMetricIcon} />
            <span className={styles.footerMetricLabel}>Streak</span>
            <span className={styles.footerMetricVal}>{streakDays}d</span>
          </div>

          <div className={styles.footerMetric} title={`Platform Badges Earned: ${badgeCount}`} style={{ justifyContent: 'flex-end' }}>
            <Award size={13} color="#7c3aed" className={styles.footerMetricIcon} />
            <span className={styles.footerMetricLabel}>Badges</span>
            <span className={styles.footerMetricVal}>{badgeCount}</span>
          </div>
        </div>
      </div>

      {/* Hidden File Input for Avatar Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        style={{ display: 'none' }}
      />

      {/* Profile & Avatar Customization Modal */}
      {isEditModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={() => setIsEditModalOpen(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '1.25rem',
              padding: '1.75rem',
              width: '100%',
              maxWidth: '480px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{ background: '#f5f3ff', color: '#7c3aed', width: 34, height: 34, borderRadius: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <User size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                    Edit Profile & Avatar
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                    Personalize your student identity and inspirational quote.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                style={{
                  border: 'none',
                  background: '#f1f5f9',
                  borderRadius: '50%',
                  width: '28px',
                  height: '28px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Avatar Preview & Actions */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1.25rem',
                background: '#f8fafc',
                padding: '1rem',
                borderRadius: '0.75rem',
                border: '1px solid #f1f5f9',
              }}
            >
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  border: '3px solid #ffffff',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {useInitials ? (
                  <div className={styles.avatarInitials} style={{ width: '100%', height: '100%', fontSize: '1.5rem' }}>
                    {studentInitials}
                  </div>
                ) : customAvatar ? (
                  <img src={customAvatar} alt="Custom" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <Image src={defaultAvatarUrl} alt={displayName} width={72} height={72} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', flex: 1 }}>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    padding: '0.45rem 0.85rem',
                    background: '#7c3aed',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '0.5rem',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <Upload size={13} /> Upload New Photo
                </button>

                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    onClick={() => setUseInitials((prev) => !prev)}
                    style={{
                      flex: 1,
                      padding: '0.35rem 0.65rem',
                      background: useInitials ? '#f5f3ff' : '#ffffff',
                      border: `1px solid ${useInitials ? '#c4b5fd' : '#e2e8f0'}`,
                      color: useInitials ? '#7c3aed' : '#475569',
                      borderRadius: '0.4rem',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {useInitials ? '✓ Initials Mode' : 'Use Initials'}
                  </button>

                  <button
                    onClick={handleResetAvatar}
                    style={{
                      padding: '0.35rem 0.65rem',
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      color: '#64748b',
                      borderRadius: '0.4rem',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                    }}
                    title="Reset to default portrait"
                  >
                    <RotateCcw size={11} /> Reset
                  </button>
                </div>
              </div>
            </div>

            {/* Motivational Quote Input */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                Motivational Bio / Motto:
              </label>
              <textarea
                value={quoteInput}
                onChange={(e) => setQuoteInput(e.target.value)}
                rows={2}
                maxLength={120}
                placeholder="Enter an inspiring quote or study goal..."
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.82rem',
                  color: '#0f172a',
                  fontFamily: 'inherit',
                  resize: 'none',
                  outline: 'none',
                }}
              />
              <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', textAlign: 'right', marginTop: '2px' }}>
                {quoteInput.length}/120
              </span>
            </div>

            {/* Read-Only Academic Info */}
            <div style={{ background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '0.5rem', border: '1px solid #f1f5f9', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.75rem' }}>
              <div>
                <span style={{ color: '#64748b' }}>Roll Number:</span>
                <p style={{ margin: '1px 0 0', fontWeight: 700, color: '#0f172a' }}>{displayRoll}</p>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Department:</span>
                <p style={{ margin: '1px 0 0', fontWeight: 700, color: '#0f172a' }}>{displayDept}</p>
              </div>
            </div>

            {/* Modal Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', paddingTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}>
              <button
                onClick={() => setIsEditModalOpen(false)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  color: '#475569',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProfile}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.5rem 1.25rem',
                  borderRadius: '0.5rem',
                  background: '#7c3aed',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <Check size={14} /> Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
