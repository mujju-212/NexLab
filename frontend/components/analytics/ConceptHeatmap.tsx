'use client';

import React, { useMemo } from 'react';
import styles from './analytics.module.css';
import { scoreColor } from '@/lib/analytics-utils';
import { AlertCircle, Brain, Lock, CheckCircle2 } from 'lucide-react';

export interface ConceptHeatmapStudent {
  student_id: string;
  full_name: string;
  roll_number?: string | null;
  concept_scores: Record<string, number>; // concept name -> score 0-100
}

interface ConceptHeatmapProps {
  concepts: string[];
  students: ConceptHeatmapStudent[];
  blockedPrereqs?: Array<{ student_name: string; blocked_concept: string; missing_prereq: string }>;
  onSelectStudent?: (studentId: string) => void;
  title?: string;
  subtitle?: string;
}

export function ConceptHeatmap({
  concepts,
  students,
  blockedPrereqs = [],
  onSelectStudent,
  title = 'Curriculum Concept Mastery Matrix',
  subtitle = 'Heatmap of scoped concept mastery across students; highlights class-wide bottlenecks and blocked prerequisites',
}: ConceptHeatmapProps) {
  // Compute column averages
  const conceptAverages = useMemo(() => {
    const avgs: Record<string, number> = {};
    concepts.forEach((c) => {
      let sum = 0;
      let count = 0;
      students.forEach((s) => {
        if (s.concept_scores[c] !== undefined) {
          sum += s.concept_scores[c];
          count++;
        }
      });
      avgs[c] = count > 0 ? Math.round(sum / count) : 0;
    });
    return avgs;
  }, [concepts, students]);

  if (!concepts.length || !students.length) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>{title}</h3>
        </div>
        <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af' }}>
          <Brain size={32} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
          No concept mastery data recorded for this section scope.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>{title}</h3>
          <p className={styles.cardSubtitle}>{subtitle}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: '#6b7280' }}>Mastery scale:</span>
          <span className={styles.badge} style={{ background: '#fef2f2', color: '#ef4444' }}>
            &lt;50% Weak
          </span>
          <span className={styles.badge} style={{ background: '#fffbeb', color: '#d97706' }}>
            50-69% Developing
          </span>
          <span className={styles.badge} style={{ background: '#ecfdf5', color: '#10b981' }}>
            ≥70% Mastered
          </span>
        </div>
      </div>

      {blockedPrereqs.length > 0 && (
        <div
          style={{
            background: '#fff1f2',
            border: '1px solid #fecdd3',
            borderRadius: '10px',
            padding: '10px 14px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '12px',
            color: '#9f1239',
          }}
        >
          <Lock size={16} style={{ flexShrink: 0 }} />
          <div>
            <strong>Prerequisite Block Alerts ({blockedPrereqs.length}): </strong>
            {blockedPrereqs.slice(0, 3).map((b, i) => (
              <span key={i} style={{ marginRight: '10px' }}>
                {b.student_name}: <em>{b.blocked_concept}</em> blocked by <em>{b.missing_prereq}</em>
              </span>
            ))}
            {blockedPrereqs.length > 3 && <span>+{blockedPrereqs.length - 3} more</span>}
          </div>
        </div>
      )}

      {/* Heatmap Matrix Table */}
      <div style={{ overflowX: 'auto', maxHeight: '480px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: '#f9fafb', position: 'sticky', top: 0, zIndex: 10 }}>
              <th
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderBottom: '2px solid #e5e7eb',
                  minWidth: '160px',
                  fontWeight: 700,
                  color: '#374151',
                }}
              >
                Student
              </th>
              {concepts.map((concept) => (
                <th
                  key={concept}
                  style={{
                    textAlign: 'center',
                    padding: '10px 8px',
                    borderBottom: '2px solid #e5e7eb',
                    minWidth: '90px',
                    fontWeight: 700,
                    color: '#374151',
                    textTransform: 'capitalize',
                  }}
                >
                  <div>{concept.replace(/_/g, ' ')}</div>
                  <div
                    style={{
                      fontSize: '10px',
                      color: conceptAverages[concept] < 50 ? '#dc2626' : '#6b7280',
                      marginTop: '2px',
                    }}
                  >
                    Avg: {conceptAverages[concept]}%
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr
                key={student.student_id}
                style={{
                  borderBottom: '1px solid #f3f4f6',
                  transition: 'background 0.15s',
                }}
                className={styles.tableRowInteractive}
                onClick={() => onSelectStudent && onSelectStudent(student.student_id)}
              >
                <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                  <div style={{ color: '#111827' }}>{student.full_name}</div>
                  {student.roll_number && (
                    <div style={{ fontSize: '10px', color: '#9ca3af' }}>{student.roll_number}</div>
                  )}
                </td>
                {concepts.map((concept) => {
                  const score = student.concept_scores[concept];
                  const hasScore = score !== undefined && score !== null;
                  const color = hasScore ? scoreColor(score) : '#9ca3af';
                  const bg = hasScore ? `${color}18` : '#f3f4f6';

                  return (
                    <td
                      key={concept}
                      style={{
                        padding: '6px 8px',
                        textAlign: 'center',
                      }}
                    >
                      <div
                        style={{
                          background: bg,
                          color: hasScore ? color : '#9ca3af',
                          borderRadius: '6px',
                          padding: '4px 6px',
                          fontWeight: 700,
                          fontSize: '11px',
                          display: 'inline-block',
                          minWidth: '42px',
                          border: hasScore ? `1px solid ${color}30` : '1px solid transparent',
                        }}
                        title={`${student.full_name} - ${concept}: ${hasScore ? `${Math.round(score)}%` : 'No data'}`}
                      >
                        {hasScore ? `${Math.round(score)}%` : '—'}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
