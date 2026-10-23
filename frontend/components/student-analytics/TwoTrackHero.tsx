'use client';

import React from 'react';
import {
  GraduationCap,
  Trophy,
  Flame,
  Award,
  Zap,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  LayoutDashboard,
  BookOpen,
  Compass,
  ArrowUp,
  Sparkles,
} from 'lucide-react';
import type { UnifiedStudentOverview } from '@/services/student-analytics.service';
import { LevelRing } from './LevelRing';
import { CompletionRing } from './CompletionRing';
import styles from './student-analytics.module.css';

interface TwoTrackHeroProps {
  overview: UnifiedStudentOverview | null;
  activeTab: string;
  onTabChange: (tab: string) => void;
  studentName?: string;
  rollNumber?: string | null;
  department?: string | null;
  academicYear?: string | null;
}

export const TwoTrackHero: React.FC<TwoTrackHeroProps> = ({
  overview,
  activeTab,
  onTabChange,
  studentName = 'Student',
  rollNumber,
  department = 'Computer Science',
  academicYear = '2026',
}) => {
  const academic = overview?.academic;
  const platform = overview?.platform;
  const unlocks = overview?.unlocks;

  const standingBand = academic?.standing?.band || 'ok';
  const standingClass =
    standingBand === 'ok'
      ? styles.standingOk
      : standingBand === 'watch'
      ? styles.standingWatch
      : styles.standingHigh;

  const standingLabel =
    standingBand === 'ok'
      ? 'On track ✓'
      : standingBand === 'watch'
      ? 'Needs focus'
      : 'Guidance available';

  // Institution Rank
  const instRank = academic?.ranks?.institution;
  // No invented #1 and no invented 95th percentile: an unranked student simply
  // shows no rank and no percentile claim.
  const rankPos = instRank?.position ?? academic?.ranks?.section?.position ?? null;
  const cohortSize = instRank?.cohort_size ?? academic?.ranks?.section?.cohort_size ?? null;
  const rankPercentile = instRank?.percentile ?? academic?.ranks?.section?.percentile ?? null;
  const topPct = rankPercentile == null ? null : Math.max(1, 100 - Math.round(rankPercentile));

  const initials = studentName
    ? studentName
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'ST';

  const streakDays = platform?.streak_days ?? 0;
  const nextUnlock = unlocks?.next_unlock;

  return (
    <div className={styles.heroCard}>
      {/* Top Header Identity Strip */}
      <div className={styles.heroHeader}>
        <div className={styles.heroIdentity}>
          <div className={styles.avatarRing}>{initials}</div>
          <div className={styles.identityText}>
            <h1>{studentName}</h1>
            <div className={styles.metaRow}>
              {rollNumber && (
                <span className={styles.metaBadge}>
                  <strong>Roll:</strong> {rollNumber}
                </span>
              )}
              <span className={styles.metaBadge}>
                {department} · Year {academicYear}
              </span>
              <span className={styles.metaBadge}>
                <Award size={13} color="#7c3aed" /> Two-Track Certified
              </span>
            </div>
          </div>
        </div>

        {/* Streak Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.9rem',
              borderRadius: '9999px',
              background: '#fff7ed',
              border: '1px solid #fed7aa',
              color: '#c2410c',
              fontWeight: 700,
              fontSize: '0.875rem',
            }}
          >
            <Flame size={18} fill="#f97316" color="#ea580c" />
            <span>{streakDays}-day streak</span>
          </div>
        </div>
      </div>

      {/* Two-Track Dual Presentation Grid */}
      <div className={styles.tracksGrid}>
        {/* Track 1: Academic (Institution-Private) */}
        <div className={`${styles.trackCard} ${styles.academicTrack}`}>
          <div className={styles.trackHeader}>
            <div className={styles.trackTitle}>
              <GraduationCap size={18} />
              <span>🎓 Track 1 · Academic Surface</span>
            </div>
            <span className={`${styles.trackPill} ${standingClass}`}>
              {standingBand === 'ok' ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
              {standingLabel}
            </span>
          </div>

          <div className={styles.trackStatsRow}>
            {/* Rank */}
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                <div className={styles.bigStat}>{rankPos ? `#${rankPos}` : '—'}</div>
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  {rankPos && cohortSize ? `/ ${cohortSize}` : ''}
                </div>
              </div>
              <div className={styles.statLabel}>
                Institution Rank (top {topPct}%)
              </div>
            </div>

            {/* Average Grade */}
            <div>
              <div className={styles.bigStat} style={{ color: '#7c3aed' }}>
                {academic?.grades?.average != null ? `${Math.round(academic.grades.average)}%` : '—'}
              </div>
              <div className={styles.statLabel}>Avg Course Grade</div>
            </div>

            {/* Course Completion Mini-Ring */}
            <div>
              <CompletionRing
                completed={academic?.completion?.completed ?? 0}
                total={academic?.completion?.assigned ?? 0}
                size={48}
                strokeWidth={5}
                color="#7c3aed"
              />
              <div className={styles.statLabel} style={{ marginTop: '0.25rem' }}>
                Lab Completion
              </div>
            </div>
          </div>

          <div className={styles.pillsRow}>
            <span className={styles.metaBadge}>
              <ArrowUp size={11} color="#15803d" />{' '}
              {topPct != null && (cohortSize ?? 0) >= 5
                ? `Top ${topPct}% in Institution`
                : (cohortSize ?? 0) < 2
                ? 'Only student in cohort'
                : 'Cohort too small for a percentile'}
            </span>
            <span className={styles.metaBadge}>
              Attendance:{' '}
              <strong>
                {academic?.attendance?.attendance_rate == null
                  ? '—'
                  : `${academic.attendance.attendance_rate}%`}
              </strong>
            </span>
            <span className={styles.metaBadge}>
              Mastery Score:{' '}
              <strong>
                {academic?.mastery?.scope_avg == null ? '—' : `${academic.mastery.scope_avg}%`}
              </strong>
            </span>
          </div>
        </div>

        {/* Track 2: Platform (Global Competitive / Practice) */}
        <div className={`${styles.trackCard} ${styles.platformTrack}`}>
          <div className={styles.trackHeader}>
            <div className={styles.trackTitle}>
              <Trophy size={18} />
              <span>🏆 Track 2 · Platform Competitive</span>
            </div>
            <span className={`${styles.trackPill} ${styles.ratingPill}`}>
              {platform?.level_name || 'Novice'}
            </span>
          </div>

          <div className={styles.trackStatsRow}>
            {/* Rating & Global Standing */}
            <div>
              <div className={styles.bigStat} style={{ color: '#047857' }}>
                {platform?.rating ? Math.round(platform.rating).toLocaleString() : '—'}
              </div>
              <div className={styles.statLabel}>
                Rating · Global #{platform?.global_rank ?? '—'} (top{' '}
                {platform?.global_percentile != null
                  ? `${Math.max(1, 100 - Math.round(platform.global_percentile))}%`
                  : '—'})
              </div>
            </div>

            {/* Level Ring */}
            <div>
              <LevelRing
                level={platform?.level ?? 1}
                levelName={platform?.level_name || 'Novice'}
                currentXp={(platform as any)?.total_xp ?? (platform?.level ?? 1) * 350}
                nextXp={(platform as any)?.next_level_xp ?? ((platform?.level ?? 1) + 1) * 500}
                size={48}
                strokeWidth={5}
              />
            </div>

            {/* Problems Solved */}
            <div>
              <div className={styles.bigStat}>
                {platform?.problems_solved ?? 0}
              </div>
              <div className={styles.statLabel}>Problems Solved</div>
            </div>
          </div>

          <div className={styles.pillsRow}>
            <span className={styles.metaBadge} style={{ background: '#dcfce7', color: '#15803d' }}>
              E: <strong>{platform?.easy_solved ?? 0}</strong>
            </span>
            <span className={styles.metaBadge} style={{ background: '#e0f2fe', color: '#0369a1' }}>
              M: <strong>{platform?.medium_solved ?? 0}</strong>
            </span>
            <span className={styles.metaBadge} style={{ background: '#fef3c7', color: '#b45309' }}>
              H: <strong>{platform?.hard_solved ?? 0}</strong>
            </span>
            {nextUnlock && (
              <span className={styles.metaBadge} style={{ background: '#f3e8ff', color: '#7e22ce' }}>
                <Sparkles size={11} /> Next: {nextUnlock.tier} in {Math.max(0, nextUnlock.target - nextUnlock.current)} solves
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Primary Tab Navigation Strip */}
      <div className={styles.tabNav}>
        {[
          { id: 'overview', label: '🏠 Overview', icon: LayoutDashboard },
          { id: 'academic', label: '🎓 Academic', icon: BookOpen },
          { id: 'platform', label: '🏆 Platform', icon: Trophy },
          { id: 'knowledge', label: '🧭 Knowledge Map', icon: Compass },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`${styles.tabBtn} ${isActive ? styles.tabBtnActive : ''}`}
            >
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
