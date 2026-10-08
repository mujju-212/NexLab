'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Trophy,
  Target,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Code2,
  Compass,
  Zap,
} from 'lucide-react';
import { MasteryRadar } from '@/components/analytics/MasteryRadar';
import { CompletionRing } from '@/components/student-analytics/CompletionRing';
import type {
  FreeAnalyticsOverview,
  FreeRecommendation,
} from '@/services/free.service';
import styles from './free-analytics.module.css';

interface FreeOverviewTabProps {
  overview: FreeAnalyticsOverview;
  recommendations?: FreeRecommendation[];
  onNavigateTab: (tab: string) => void;
}

export const FreeOverviewTab: React.FC<FreeOverviewTabProps> = ({
  overview,
  recommendations = [],
  onNavigateTab,
}) => {
  const router = useRouter();

  // Radar data from topic strength
  const radarData = (overview.topic_strength || []).slice(0, 6).map((t) => ({
    concept: t.topic,
    mastery_score: Math.round(t.strength),
  }));

  const courses = overview.courses || [];
  const topCourses = courses.slice(0, 3);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* ── 1. Highlights Strip ───────────────────────────────────────────── */}
      {overview.highlights && overview.highlights.length > 0 && (
        <div className={styles.highlightsRow}>
          {overview.highlights.map((h, i) => (
            <div key={i} className={styles.highlightCard}>
              <div className={styles.highlightIconBox}>
                <Sparkles size={18} />
              </div>
              <span className={styles.highlightText}>{h}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── 2. Two-Column Grid: Radar Preview & Recommended Actions ───────── */}
      <div className={styles.twoColGrid}>
        {/* Topic Radar Preview */}
        <div>
          <MasteryRadar
            title="Topic Proficiency Radar"
            subtitle="Top skill areas synthesized across library and course problems"
            data={radarData}
            height={310}
            color="#7c3aed"
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
            <button
              onClick={() => onNavigateTab('skills')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.825rem',
                fontWeight: 700,
                color: '#7c3aed',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Explore Complete Skills Map <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {/* Actionable Next Steps / Recommendations */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleWrap}>
              <div className={styles.cardIconBox} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                <Target size={20} />
              </div>
              <div>
                <h3 className={styles.cardTitle}>Personalized Next Steps</h3>
                <p className={styles.cardSubtitle}>Targeted practice to reinforce weak concepts and unlock higher tiers</p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {recommendations.length > 0 ? (
              recommendations.slice(0, 3).map((rec) => (
                <div
                  key={rec.id}
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.75rem',
                    padding: '0.9rem 1.1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span
                        className={styles.diffChip}
                        style={{
                          background:
                            rec.difficulty === 'Easy'
                              ? '#ecfdf5'
                              : rec.difficulty === 'Medium'
                              ? '#fffbeb'
                              : '#fef2f2',
                          color:
                            rec.difficulty === 'Easy'
                              ? '#059669'
                              : rec.difficulty === 'Medium'
                              ? '#b45309'
                              : '#dc2626',
                        }}
                      >
                        {rec.difficulty}
                      </span>
                      <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>{rec.title}</strong>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
                      {rec.reason} · {rec.topic}
                    </div>
                  </div>

                  <button
                    onClick={() => router.push(`/practice/problems/${rec.slug}`)}
                    style={{
                      background: '#7c3aed',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '0.5rem',
                      padding: '0.45rem 0.85rem',
                      fontSize: '0.775rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Solve Now
                  </button>
                </div>
              ))
            ) : (
              <div style={{ color: '#64748b', fontSize: '0.85rem', padding: '1rem 0' }}>
                All current recommendations completed! Keep solving to generate new targets.
              </div>
            )}

            {/* Next Unlock Nudge */}
            {overview.unlocks?.next_unlock && (
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(124,58,237,0.06), rgba(245,158,11,0.06))',
                  border: '1px solid rgba(124,58,237,0.15)',
                  borderRadius: '0.75rem',
                  padding: '0.9rem 1.1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#4c1d95' }}>
                    Gate Target: {overview.unlocks.next_unlock.target}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#7c3aed', marginTop: '0.15rem' }}>
                    {overview.unlocks.next_unlock.requirement}
                  </div>
                </div>
                <button
                  onClick={() => onNavigateTab('ladder')}
                  style={{
                    background: 'transparent',
                    border: '1px solid #7c3aed',
                    color: '#7c3aed',
                    borderRadius: '0.5rem',
                    padding: '0.4rem 0.75rem',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  View Ladder
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 3. Active Courses Snapshot ────────────────────────────────────── */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleWrap}>
            <div className={styles.cardIconBox} style={{ background: '#ecfdf5', color: '#059669' }}>
              <BookOpen size={20} />
            </div>
            <div>
              <h3 className={styles.cardTitle}>Enrolled Courses & Certifications</h3>
              <p className={styles.cardSubtitle}>
                {overview.course_summary?.completed_courses || 0} completed ·{' '}
                {overview.course_summary?.enrolled_courses || 0} active in syllabus
              </p>
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('courses')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.825rem',
              fontWeight: 700,
              color: '#059669',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            All Courses & Certificates <ArrowRight size={14} />
          </button>
        </div>

        <div className={styles.coursesGrid}>
          {topCourses.map((c) => (
            <div key={c.id} className={styles.courseCard}>
              <div className={styles.courseCardTop}>
                <div>
                  <h4 className={styles.courseTitle}>{c.title}</h4>
                  <p className={styles.courseDesc}>
                    {c.description ? c.description.slice(0, 95) + '...' : `${c.language} fundamentals & practice`}
                  </p>
                </div>
                <CompletionRing
                  completed={c.solved_count}
                  total={c.exercise_count || 1}
                  size={48}
                  color={c.cert_eligible ? '#059669' : '#7c3aed'}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  <Zap size={12} style={{ display: 'inline', color: '#f59e0b', verticalAlign: '-1px' }} />{' '}
                  {c.xp_earned} XP earned
                </span>
                {c.cert_eligible ? (
                  <span className={styles.certBadge}>
                    <CheckCircle2 size={12} /> Certificate Unlocked
                  </span>
                ) : (
                  <button
                    onClick={() => router.push(`/practice/${c.slug || c.id}`)}
                    className={styles.courseActionBtn}
                  >
                    Continue
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
