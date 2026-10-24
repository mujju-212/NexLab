'use client';

import React from 'react';
import { BookOpen, CheckCircle2, Clock, FileText, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { SubjectAnalyticsItem } from '@/services/student-analytics.service';
import styles from './student-analytics.module.css';

interface SubjectProgressCardProps {
  subjects: SubjectAnalyticsItem[] | undefined;
}

export const SubjectProgressCard: React.FC<SubjectProgressCardProps> = ({ subjects = [] }) => {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleWrap}>
          <div className={styles.cardIconBox} style={{ background: '#ede9fe', color: '#6d28d9' }}>
            <BookOpen size={20} />
          </div>
          <div>
            <h2 className={styles.cardTitle}>Enrolled Subjects & Lab Progress</h2>
            <p className={styles.cardSubtitle}>
              Course completion status, weighted experiment scores, and assignment rollups
            </p>
          </div>
        </div>
        <span className={styles.metaBadge}>
          {subjects.length} Enrolled {subjects.length === 1 ? 'Subject' : 'Subjects'}
        </span>
      </div>

      {subjects.length === 0 ? (
        <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
          No enrolled subjects found. Check with your department coordinator.
        </p>
      ) : (
        <div className={styles.subjectsGrid}>
          {subjects.map((s) => {
            const avgColor =
              s.subject_average == null ? '#94a3b8' : s.subject_average >= 85
                ? '#10b981'
                : s.subject_average >= 70
                ? '#7c3aed'
                : s.subject_average >= 50
                ? '#f59e0b'
                : '#ef4444';

            return (
              <div key={s.subject_id} className={styles.subjectCard}>
                <div className={styles.subjectTitleRow}>
                  <div>
                    <span className={styles.subjectCode}>{s.subject_code}</span>
                    <h3 className={styles.subjectName}>{s.subject_name}</h3>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: avgColor }}>
                      {s.subject_average != null ? `${s.subject_average}%` : '—'}
                    </div>
                    <small style={{ color: '#64748b' }}>Average Grade</small>
                  </div>
                </div>

                {/* Completion Progress Bar */}
                <div style={{ marginBottom: '0.875rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.75rem',
                      color: '#64748b',
                      marginBottom: '0.35rem',
                    }}
                  >
                    <span>
                      Completed {s.completed_experiments} of {s.total_experiments} labs
                    </span>
                    <strong>{s.completion_pct != null ? `${s.completion_pct}%` : '—'}</strong>
                  </div>
                  <div className={styles.barTrack} style={{ height: '6px' }}>
                    <div
                      className={styles.barFill}
                      style={{
                        width: `${s.completion_pct ?? 0}%`,
                        background:
                          (s.completion_pct ?? 0) >= 80
                            ? 'linear-gradient(90deg, #10b981, #059669)'
                            : 'linear-gradient(90deg, #7c3aed, #6d28d9)',
                      }}
                    />
                  </div>
                </div>

                {/* Experiments list */}
                {s.experiments && s.experiments.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.4rem' }}>
                      Recent Experiments:
                    </div>
                    <div className={styles.expList}>
                      {s.experiments.slice(0, 5).map((exp) => (
                        <div key={exp.experiment_id} className={styles.expRow}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            {exp.is_completed ? (
                              <CheckCircle2 size={13} color="#10b981" />
                            ) : (
                              <Clock size={13} color="#94a3b8" />
                            )}
                            <span
                              style={{
                                fontWeight: 500,
                                color: exp.is_completed ? '#0f172a' : '#64748b',
                                maxWidth: '170px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Exp {exp.exp_number}: {exp.title}
                            </span>
                          </div>
                          <div>
                            {exp.final_grade != null ? (
                              <span
                                style={{
                                  fontWeight: 700,
                                  color: exp.final_grade >= 75 ? '#15803d' : '#b45309',
                                  background: exp.final_grade >= 75 ? '#dcfce7' : '#fef3c7',
                                  padding: '0.1rem 0.4rem',
                                  borderRadius: '0.25rem',
                                  fontSize: '0.72rem',
                                }}
                              >
                                {Math.round(exp.final_grade)}%
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Pending</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick action footer */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '1rem',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid #f1f5f9',
                  }}
                >
                  <Link
                    href={`/student/subjects/${s.subject_id}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: '#7c3aed',
                      textDecoration: 'none',
                    }}
                  >
                    View Coursework <ChevronRight size={13} />
                  </Link>

                  <a
                    href={`/api/student/lab-record/${s.subject_id}/download`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      color: '#64748b',
                      textDecoration: 'none',
                    }}
                  >
                    <FileText size={12} /> PDF Record
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
