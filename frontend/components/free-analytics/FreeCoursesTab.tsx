'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  CheckCircle2,
  Award,
  Zap,
  ArrowRight,
  Search,
  Sparkles,
  ExternalLink,
  Code2,
  GraduationCap,
  ShieldCheck,
} from 'lucide-react';
import { CompletionRing } from '@/components/student-analytics/CompletionRing';
import {
  freeService,
  type FreeCoursesAnalytics,
  type FreeCourseItem,
} from '@/services/free.service';
import styles from './free-analytics.module.css';

interface FreeCoursesTabProps {
  initialCourses?: FreeCourseItem[];
}

export const FreeCoursesTab: React.FC<FreeCoursesTabProps> = ({ initialCourses }) => {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_progress' | 'completed' | 'not_started'>('all');

  // Query Courses Analytics
  const { data: coursesData, isLoading } = useQuery<FreeCoursesAnalytics>({
    queryKey: ['free-courses-analytics'],
    queryFn: () => freeService.getCoursesAnalytics(),
  });

  const coursesList = coursesData?.courses || initialCourses || [];

  const filteredCourses = useMemo(() => {
    return coursesList.filter((c) => {
      const matchesSearch =
        c.title.toLowerCase().includes(search.toLowerCase()) ||
        (c.description && c.description.toLowerCase().includes(search.toLowerCase())) ||
        (c.tags && c.tags.some((t) => t.toLowerCase().includes(search.toLowerCase())));

      let matchesStatus = true;
      if (statusFilter === 'completed') matchesStatus = c.completion_pct >= 100;
      else if (statusFilter === 'in_progress') matchesStatus = c.completion_pct > 0 && c.completion_pct < 100;
      else if (statusFilter === 'not_started') matchesStatus = c.completion_pct === 0;

      return matchesSearch && matchesStatus;
    });
  }, [coursesList, search, statusFilter]);

  const diffColor = (diff: string) => {
    switch (diff?.toLowerCase()) {
      case 'beginner':
        return { bg: '#ecfdf5', text: '#059669', border: '#a7f3d0' };
      case 'intermediate':
        return { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' };
      case 'advanced':
        return { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' };
      default:
        return { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' };
    }
  };

  const certificates = coursesData?.certificates || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* ── 1. Summary Highlights Strip ───────────────────────────────────── */}
      <div className={styles.highlightsRow}>
        <div className={styles.highlightCard}>
          <div className={styles.highlightIconBox} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
            <BookOpen size={18} />
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
              {coursesData?.enrolled_courses ?? 0} / {coursesData?.total_courses ?? coursesList.length}
            </div>
            <div style={{ fontSize: '0.725rem', color: '#64748b' }}>Enrolled Courses</div>
          </div>
        </div>

        <div className={styles.highlightCard}>
          <div className={styles.highlightIconBox} style={{ background: '#ecfdf5', color: '#059669' }}>
            <CheckCircle2 size={18} />
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
              {coursesData?.completed_courses ?? 0}
            </div>
            <div style={{ fontSize: '0.725rem', color: '#64748b' }}>Completed Curriculums</div>
          </div>
        </div>

        <div className={styles.highlightCard}>
          <div className={styles.highlightIconBox} style={{ background: '#fffbeb', color: '#d97706' }}>
            <Zap size={18} />
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
              {coursesData?.total_exercises_solved ?? 0} / {coursesData?.total_exercises_catalog ?? 0}
            </div>
            <div style={{ fontSize: '0.725rem', color: '#64748b' }}>Curriculum Exercises Solved</div>
          </div>
        </div>

        <div className={styles.highlightCard}>
          <div className={styles.highlightIconBox} style={{ background: '#ede9fe', color: '#7c3aed' }}>
            <Award size={18} />
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
              {certificates.length}
            </div>
            <div style={{ fontSize: '0.725rem', color: '#64748b' }}>Verified Certificates</div>
          </div>
        </div>
      </div>

      {/* ── 2. Certificates Shelf ─────────────────────────────────────────── */}
      {certificates.length > 0 && (
        <div className={styles.card} style={{ background: 'linear-gradient(135deg, #faf5ff, #ffffff)', borderColor: '#e9d5ff' }}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleWrap}>
              <div className={styles.cardIconBox} style={{ background: '#ede9fe', color: '#7c3aed' }}>
                <Award size={20} />
              </div>
              <div>
                <h3 className={styles.cardTitle}>Verified Credentials & Certificates</h3>
                <p className={styles.cardSubtitle}>
                  Accredited proofs of curriculum completion on the NexLab platform
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            {certificates.map((cert) => (
              <div
                key={cert.certificate_id}
                style={{
                  background: '#fff',
                  border: '1px solid #d8b4fe',
                  borderRadius: '0.875rem',
                  padding: '1.15rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  boxShadow: '0 4px 12px rgba(124, 58, 237, 0.06)',
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: '0 4px 10px rgba(124, 58, 237, 0.25)',
                  }}
                >
                  <Award size={22} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.15rem' }}>
                    <ShieldCheck size={14} color="#10b981" />
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>
                      Verified Certificate
                    </span>
                  </div>
                  <h4
                    style={{
                      margin: 0,
                      fontSize: '0.95rem',
                      fontWeight: 800,
                      color: '#0f172a',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {cert.course_title}
                  </h4>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
                    ID: <code>{cert.verification_slug}</code>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 3. Search & Filter Bar ────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ position: 'relative', minWidth: 260 }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '0.85rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#94a3b8',
            }}
          />
          <input
            type="text"
            placeholder="Search enrolled courses, technologies, tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '0.6rem 0.85rem 0.6rem 2.4rem',
              borderRadius: '0.625rem',
              border: '1px solid #cbd5e1',
              background: '#fff',
              fontSize: '0.85rem',
              outline: 'none',
            }}
          />
        </div>

        {/* Status Filter Buttons */}
        <div style={{ display: 'flex', gap: '0.35rem', background: '#f1f5f9', padding: '0.25rem', borderRadius: '0.625rem' }}>
          {[
            { id: 'all', label: 'All Courses' },
            { id: 'in_progress', label: 'In Progress' },
            { id: 'completed', label: 'Completed' },
            { id: 'not_started', label: 'Unstarted' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as any)}
              style={{
                fontSize: '0.775rem',
                fontWeight: statusFilter === tab.id ? 700 : 600,
                padding: '0.4rem 0.85rem',
                borderRadius: '0.5rem',
                border: 'none',
                cursor: 'pointer',
                background: statusFilter === tab.id ? '#fff' : 'transparent',
                color: statusFilter === tab.id ? '#7c3aed' : '#64748b',
                boxShadow: statusFilter === tab.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 4. Enriched Course Cards Grid ─────────────────────────────────── */}
      <div className={styles.coursesGrid}>
        {filteredCourses.map((course) => {
          const diff = diffColor(course.difficulty);
          const isComplete = course.completion_pct >= 100;
          const isInProgress = course.completion_pct > 0 && !isComplete;

          return (
            <div key={course.id} className={styles.courseCard}>
              <div>
                <div className={styles.courseCardTop}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.5rem',
                          borderRadius: '0.35rem',
                          background: diff.bg,
                          color: diff.text,
                          border: `1px solid ${diff.border}`,
                          textTransform: 'capitalize',
                        }}
                      >
                        {course.difficulty}
                      </span>
                      {course.language && (
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.5rem',
                            borderRadius: '0.35rem',
                            background: '#f1f5f9',
                            color: '#475569',
                          }}
                        >
                          {course.language}
                        </span>
                      )}
                    </div>
                    <h3 className={styles.courseTitle}>{course.title}</h3>
                    {course.description && <p className={styles.courseDesc}>{course.description}</p>}
                  </div>

                  {/* Completion Ring */}
                  <CompletionRing
                    completed={course.solved_count}
                    total={course.exercise_count || 1}
                    size={52}
                    color={isComplete ? '#059669' : '#7c3aed'}
                  />
                </div>

                {/* Tags */}
                {course.tags && course.tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.85rem' }}>
                    {course.tags.slice(0, 3).map((tag, tIdx) => (
                      <span
                        key={tIdx}
                        style={{
                          fontSize: '0.675rem',
                          color: '#64748b',
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '0.3rem',
                        }}
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Card Bottom Progress & Action */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#64748b' }}>
                    <Code2 size={13} />
                    <span>
                      <strong>{course.solved_count}</strong> of {course.exercise_count} solved
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#d97706', fontWeight: 700 }}>
                    <Zap size={13} />
                    <span>{course.xp_earned} XP</span>
                  </div>
                </div>

                {/* Certificate Pill if completed */}
                {isComplete && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div className={styles.certBadge}>
                      <Award size={13} />
                      <span>Certificate Unlocked</span>
                    </div>
                  </div>
                )}

                {/* Continue / Start Button */}
                <button
                  className={styles.courseActionBtn}
                  onClick={() => router.push(`/practice/${course.slug || course.id}`)}
                >
                  <span>
                    {isComplete ? 'Review Course' : isInProgress ? 'Continue Course' : 'Start Course'}
                  </span>
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredCourses.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '3rem 1rem',
            background: '#fff',
            borderRadius: '1rem',
            border: '1px dashed #cbd5e1',
            color: '#64748b',
          }}
        >
          <BookOpen size={36} style={{ margin: '0 auto 0.75rem', color: '#94a3b8' }} />
          <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
            No courses match your filter
          </h4>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.825rem' }}>
            Try adjusting your search query or switching to &ldquo;All Courses&rdquo;.
          </p>
        </div>
      )}
    </div>
  );
};
