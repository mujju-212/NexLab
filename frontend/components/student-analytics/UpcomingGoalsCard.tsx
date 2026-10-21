'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Compass,
  FileText,
  Target,
  Repeat,
  ArrowRight,
  X,
  ExternalLink,
  CheckCircle2,
  Calendar,
  BookOpen,
  Layers,
  Zap,
  ChevronRight,
} from 'lucide-react';
import type { UnifiedStudentOverview } from '@/services/student-analytics.service';
import { apiClient } from '@/services/api-client';
import styles from './growth-overview.module.css';

interface UpcomingGoalsCardProps {
  overview: UnifiedStudentOverview | null;
}

const DEFAULT_GOALS = [
  {
    id: 'goal-1',
    title: 'Complete 6 more experiments to finish Data Structures lab',
    type: 'lab',
    current_display: '18 / 24',
    progress_pct: 75,
    color: 'purple',
  },
  {
    id: 'goal-2',
    title: 'Solve 3 more Medium problems to unlock Hard difficulty',
    type: 'practice',
    current_display: '2 / 3',
    progress_pct: 66,
    color: 'blue',
  },
  {
    id: 'goal-3',
    title: 'Improve Recursion mastery Practice 5 recommended problems',
    type: 'concept',
    current_display: '34% → 60%',
    progress_pct: 57,
    color: 'orange',
  },
  {
    id: 'goal-4',
    title: 'Maintain 7-day practice streak for Bronze Flame',
    type: 'practice',
    current_display: '5 / 7 days',
    progress_pct: 71,
    color: 'orange',
  },
  {
    id: 'goal-5',
    title: 'Complete DBMS Lab Exp 4 on Normalization',
    type: 'lab',
    current_display: '0 / 1',
    progress_pct: 0,
    color: 'purple',
  },
];

const DEFAULT_STUDY_PLANS = [
  {
    id: 'plan-1',
    slug: 'nexlab-75',
    title: 'NexLab 75',
    description: '75 must-solve curated coding interview questions covering 14 essential algorithmic patterns.',
    total_problems: 75,
    difficulty_mix: 'Mixed Difficulty',
    tag: 'Most Popular',
    solved_count: 0,
  },
  {
    id: 'plan-2',
    slug: 'top-interview-150',
    title: 'Top Interview 150',
    description: 'The classic 150 problems essential for technical interviews across top software engineering companies.',
    total_problems: 150,
    difficulty_mix: 'Medium & Hard',
    tag: 'Interview Prep',
    solved_count: 0,
  },
  {
    id: 'plan-3',
    slug: 'sql-50',
    title: 'SQL 50 Study Plan',
    description: 'Master relational queries, multi-table joins, subqueries, grouping, and advanced window functions.',
    total_problems: 50,
    difficulty_mix: 'Easy & Medium',
    tag: 'Database Mastery',
    solved_count: 0,
  },
  {
    id: 'plan-4',
    slug: 'dynamic-programming',
    title: 'Dynamic Programming 30',
    description: 'Master 1D, 2D, and multidimensional dynamic programming patterns from memoization to tabulation.',
    total_problems: 30,
    difficulty_mix: 'Intermediate',
    tag: 'Advanced Algorithms',
    solved_count: 0,
  },
];

export const UpcomingGoalsCard: React.FC<UpcomingGoalsCardProps> = ({ overview }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'plans' | 'goals'>('plans');

  // Fetch real Study Plans from backend
  const { data: dbPlans = [] } = useQuery({
    queryKey: ['student-study-plans-overview'],
    queryFn: async () => {
      try {
        const res = await apiClient.get<{ plans: any[] }>('/practice/plans');
        return res.data.plans || [];
      } catch {
        return [];
      }
    },
    staleTime: 60 * 1000,
  });

  const studyPlans = dbPlans.length > 0 ? dbPlans : DEFAULT_STUDY_PLANS;

  const goals = overview?.upcoming_goals && overview.upcoming_goals.length > 0
    ? overview.upcoming_goals
    : DEFAULT_GOALS;

  const getGoalIcon = (type: string, color: string) => {
    switch (type) {
      case 'practice':
        return (
          <div className={styles.goalIconBox} style={{ background: '#e0f2fe', color: '#0284c7' }}>
            <Target size={15} />
          </div>
        );
      case 'concept':
        return (
          <div className={styles.goalIconBox} style={{ background: '#fff7ed', color: '#ea580c' }}>
            <Repeat size={15} />
          </div>
        );
      case 'lab':
      default:
        return (
          <div className={styles.goalIconBox} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
            <FileText size={15} />
          </div>
        );
    }
  };

  const getProgressBarClass = (color: string) => {
    if (color === 'blue') return styles.goalBarBlue;
    if (color === 'orange') return styles.goalBarOrange;
    return styles.goalBarPurple;
  };

  return (
    <>
      <div className={styles.card}>
        <div className={styles.cardHeaderRow}>
          <div className={styles.cardTitleBlock}>
            <div className={styles.headerIconCircle} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
              <Compass size={18} />
            </div>
            <div>
              <h3>Upcoming Goals</h3>
              <p>Personalized recommendations for your next steps.</p>
            </div>
          </div>

          <button
            type="button"
            className={styles.bottomActionLink}
            onClick={() => {
              setModalTab('plans');
              setIsModalOpen(true);
            }}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
            title="Explore structured Study Plans"
          >
            <span>View Study Plan</span>
            <ArrowRight size={13} />
          </button>
        </div>

        <div className={styles.goalsList}>
          {goals.slice(0, 3).map((goal) => (
            <div key={goal.id} className={styles.goalItem}>
              <div className={styles.goalTitleRow}>
                {getGoalIcon(goal.type, goal.color)}
                <span className={styles.goalTitleText}>{goal.title}</span>
              </div>

              <div className={styles.goalProgressRow}>
                <div className={styles.goalBarTrack}>
                  <div
                    className={getProgressBarClass(goal.color)}
                    style={{ width: `${goal.progress_pct}%` }}
                  />
                </div>
                <span className={styles.goalCurrentText}>{goal.current_display}</span>
              </div>
            </div>
          ))}
        </div>

        <div className={styles.cardFooterStudyPlan}>
          <Link
            href="/student/practice?tab=plans"
            className={styles.studyPlanQuickLink}
            title="Navigate to Practice Study Plans in library"
          >
            <BookOpen size={13} />
            <span>Explore Practice Study Plans</span>
            <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      {/* ── Comprehensive Study Plans & Goals Modal ── */}
      {isModalOpen && (
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
          onClick={() => setIsModalOpen(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '1.25rem',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '720px',
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid #e2e8f0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1rem',
                borderBottom: '1px solid #f1f5f9',
                paddingBottom: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div className={styles.headerIconCircle} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                  <BookOpen size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                    Curated Study Plans & Roadmaps
                  </h3>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                    Follow structured learning paths to master algorithms, SQL, and system patterns.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{
                  border: 'none',
                  background: '#f1f5f9',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#64748b',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Tab Switcher */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button
                onClick={() => setModalTab('plans')}
                style={{
                  padding: '0.45rem 0.95rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  background: modalTab === 'plans' ? '#7c3aed' : '#f1f5f9',
                  color: modalTab === 'plans' ? '#ffffff' : '#475569',
                  transition: 'all 0.15s ease',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <BookOpen size={14} />
                <span>Active Study Plans ({studyPlans.length})</span>
              </button>
              <button
                onClick={() => setModalTab('goals')}
                style={{
                  padding: '0.45rem 0.95rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  background: modalTab === 'goals' ? '#7c3aed' : '#f1f5f9',
                  color: modalTab === 'goals' ? '#ffffff' : '#475569',
                  transition: 'all 0.15s ease',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <Target size={14} />
                <span>Upcoming Milestones ({goals.length})</span>
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ overflowY: 'auto', maxHeight: '460px', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {modalTab === 'plans' ? (
                <>
                  <div
                    style={{
                      background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
                      border: '1px solid #ddd6fe',
                      borderRadius: '0.75rem',
                      padding: '0.85rem 1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.75rem',
                    }}
                  >
                    <div>
                      <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, color: '#5b21b6' }}>
                        End-to-End Structured Curriculum
                      </h4>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: '#6d28d9' }}>
                        Each plan contains organized sections, curated problems, progress tracking, and verifiable completion certificates.
                      </p>
                    </div>
                    <Link
                      href="/student/practice?tab=plans"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        padding: '0.45rem 0.85rem',
                        borderRadius: '0.5rem',
                        background: '#7c3aed',
                        color: '#ffffff',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        textDecoration: 'none',
                        flexShrink: 0,
                      }}
                    >
                      <span>Open Library Tab</span>
                      <ExternalLink size={12} />
                    </Link>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '0.75rem' }}>
                    {studyPlans.map((plan: any) => {
                      const solvedCount = plan.solved_count || 0;
                      const totalProbs = plan.total_problems || 75;
                      const pct = Math.min(100, Math.round((solvedCount / Math.max(1, totalProbs)) * 100));

                      return (
                        <div
                          key={plan.id || plan.slug}
                          style={{
                            border: '1px solid #e2e8f0',
                            borderRadius: '0.75rem',
                            padding: '1rem',
                            background: '#ffffff',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: '0.75rem',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
                              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
                                {plan.title}
                              </h4>
                              <span
                                style={{
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  padding: '0.15rem 0.5rem',
                                  borderRadius: '9999px',
                                  background: plan.tag === 'Most Popular' ? '#f3e8ff' : '#ecfdf5',
                                  color: plan.tag === 'Most Popular' ? '#7c3aed' : '#059669',
                                }}
                              >
                                {plan.tag || 'Curated'}
                              </span>
                            </div>
                            <p style={{ margin: 0, fontSize: '0.76rem', color: '#64748b', lineHeight: 1.4 }}>
                              {plan.description}
                            </p>
                          </div>

                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: '#475569', marginBottom: '0.35rem', fontWeight: 600 }}>
                              <span>{totalProbs} problems • {plan.difficulty_mix || 'Mixed'}</span>
                              <span style={{ fontWeight: 700, color: '#7c3aed' }}>{solvedCount} / {totalProbs} ({pct}%)</span>
                            </div>

                            <div style={{ width: '100%', height: '6px', background: '#f1f5f9', borderRadius: '9999px', overflow: 'hidden', marginBottom: '0.75rem' }}>
                              <div
                                style={{
                                  width: `${pct}%`,
                                  height: '100%',
                                  background: 'linear-gradient(90deg, #7c3aed, #2563eb)',
                                  borderRadius: '9999px',
                                }}
                              />
                            </div>

                            <Link
                              href={`/student/practice/study-plans/${plan.slug}`}
                              style={{
                                display: 'inline-flex',
                                width: '100%',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.35rem',
                                padding: '0.5rem 0.75rem',
                                borderRadius: '0.5rem',
                                background: '#f5f3ff',
                                border: '1px solid #ddd6fe',
                                color: '#7c3aed',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                textDecoration: 'none',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              <span>{solvedCount > 0 ? 'Continue Study Plan' : 'Start Study Plan Roadmap'}</span>
                              <ChevronRight size={13} />
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {goals.map((goal) => (
                    <div key={goal.id} className={styles.goalItem} style={{ border: '1px solid #f1f5f9', borderRadius: '0.75rem', padding: '0.85rem 1rem' }}>
                      <div className={styles.goalTitleRow} style={{ marginBottom: '0.5rem' }}>
                        {getGoalIcon(goal.type, goal.color)}
                        <span className={styles.goalTitleText} style={{ fontSize: '0.88rem', fontWeight: 600 }}>{goal.title}</span>
                      </div>

                      <div className={styles.goalProgressRow}>
                        <div className={styles.goalBarTrack} style={{ height: '8px' }}>
                          <div
                            className={getProgressBarClass(goal.color)}
                            style={{ width: `${goal.progress_pct}%` }}
                          />
                        </div>
                        <span className={styles.goalCurrentText} style={{ fontWeight: 700 }}>{goal.current_display}</span>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '0.5rem' }}>({goal.progress_pct}%)</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
              <Link
                href="/student/practice?tab=plans"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: '#7c3aed',
                  textDecoration: 'none',
                }}
              >
                <span>Browse All Plans in Practice Library</span>
                <ExternalLink size={13} />
              </Link>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  background: '#7c3aed',
                  color: '#ffffff',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

