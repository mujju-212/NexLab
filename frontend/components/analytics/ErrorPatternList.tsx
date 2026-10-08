'use client';

import React, { useState } from 'react';
import { AlertTriangle, Terminal, ChevronDown, ChevronRight, Lightbulb, Users } from 'lucide-react';
import styles from './analytics.module.css';

export interface ErrorClusterItem {
  signature: string;
  count: number;
  error_type: string;
  sample_message: string;
  affected_students_pct: number;
}

interface ErrorPatternListProps {
  clusters: ErrorClusterItem[];
  totalFailedAttempts?: number;
  experimentTitle?: string;
  onSelectCluster?: (signature: string) => void;
}

const ERROR_TIPS: Record<string, string> = {
  IndexError: 'Students are frequently encountering off-by-one or out-of-bounds indexing. Consider reviewing boundary checks and loop termination criteria.',
  KeyError: 'Missing dictionary keys or undefined properties. Emphasize checking key presence or using .get() with defaults.',
  TypeError: 'Type mismatches or unexpected null/undefined variables. Revisit type casting and function return contracts.',
  ValueError: 'Invalid arguments or parsing failures. Clarify input format requirements and sanity validation.',
  RecursionError: 'Infinite recursion detected. Highlight the importance of base cases and state reduction.',
  AssertionError: 'Hidden or boundary test cases failing. Guide students on edge case verification (empty inputs, zeroes, negative values).',
  SyntaxError: 'Structural syntax errors. Point students toward language syntax reference and indentation standards.',
  NameError: 'Variable scope or naming issues. Review variable scoping and import statements.',
};

export function ErrorPatternList({
  clusters,
  totalFailedAttempts = 0,
  experimentTitle,
  onSelectCluster,
}: ErrorPatternListProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);

  if (!clusters || clusters.length === 0) {
    return (
      <div className={styles.card} style={{ textAlign: 'center', padding: '36px 20px' }}>
        <Terminal size={32} style={{ color: '#10b981', margin: '0 auto 12px' }} />
        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#111827' }}>
          No Critical Error Clusters Detected
        </h4>
        <p style={{ margin: '6px 0 0', fontSize: '0.8125rem', color: '#6b7280' }}>
          Submissions for this experiment are passing cleanly without concentrated failure patterns.
        </p>
      </div>
    );
  }

  const getTip = (errorType: string) => {
    return ERROR_TIPS[errorType] || 'Common struggle point observed across multiple students. Review test constraints during office hours.';
  };

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <div className={styles.cardTitleGroup}>
            <AlertTriangle size={18} className={styles.cardTitleIcon} style={{ color: '#ef4444' }} />
            <h3 className={styles.cardTitle}>Frequent Error Clusters</h3>
          </div>
          <div className={styles.cardSubtitle}>
            {experimentTitle ? `Patterns in ${experimentTitle}` : 'Common compiler and runtime failures across cohort'}
            {totalFailedAttempts > 0 && ` (${totalFailedAttempts} failed runs recorded)`}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {clusters.map((item, idx) => {
          const isExpanded = expandedIndex === idx;
          const tip = getTip(item.error_type);

          return (
            <div
              key={item.signature || idx}
              style={{
                border: '1px solid var(--an-border, #ede9fe)',
                borderRadius: 10,
                background: isExpanded ? '#faf8ff' : '#ffffff',
                overflow: 'hidden',
                transition: 'all 0.15s ease',
              }}
            >
              {/* Header row */}
              <div
                onClick={() => {
                  setExpandedIndex(isExpanded ? null : idx);
                  if (onSelectCluster) onSelectCluster(item.signature);
                }}
                style={{
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  userSelect: 'none',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#7c3aed' }}>
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </div>

                  <span
                    style={{
                      background: '#fee2e2',
                      color: '#b91c1c',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '3px 7px',
                      borderRadius: 6,
                      fontFamily: 'monospace',
                      flexShrink: 0,
                    }}
                  >
                    {item.error_type || 'Error'}
                  </span>

                  <span
                    style={{
                      fontSize: '0.825rem',
                      fontWeight: 600,
                      color: '#1f2937',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={item.signature}
                  >
                    {item.signature}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                  {/* Affected % */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.775rem', color: '#4b5563' }}>
                    <Users size={14} style={{ color: '#6b7280' }} />
                    <span style={{ fontWeight: 700, color: '#ef4444' }}>
                      {Math.round(item.affected_students_pct || 0)}%
                    </span>
                    <span style={{ color: '#9ca3af' }}>of class</span>
                  </div>

                  {/* Occurrences count */}
                  <span
                    style={{
                      background: '#f3f4f6',
                      color: '#374151',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 9999,
                    }}
                  >
                    {item.count} hits
                  </span>
                </div>
              </div>

              {/* Progress bar visually showing affected % */}
              <div style={{ width: '100%', height: 3, background: '#f3f4f6' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(100, Math.max(3, item.affected_students_pct || 0))}%`,
                    background: item.affected_students_pct > 40 ? '#ef4444' : '#f59e0b',
                    borderRadius: '0 2px 2px 0',
                  }}
                />
              </div>

              {/* Expandable details */}
              {isExpanded && (
                <div style={{ padding: '12px 14px 14px', borderTop: '1px solid #f3f4f6' }}>
                  {/* Sample message / traceback */}
                  {item.sample_message && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', marginBottom: 4 }}>
                        Sample Trace / Output
                      </div>
                      <pre
                        style={{
                          background: '#111827',
                          color: '#f9fafb',
                          padding: '10px 12px',
                          borderRadius: 8,
                          fontSize: '0.75rem',
                          fontFamily: 'Consolas, Monaco, monospace',
                          overflowX: 'auto',
                          margin: 0,
                          lineHeight: 1.45,
                        }}
                      >
                        {item.sample_message}
                      </pre>
                    </div>
                  )}

                  {/* Pedagogical Teaching Tip */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      background: '#eff6ff',
                      border: '1px solid #dbeafe',
                      borderRadius: 8,
                      padding: '9px 12px',
                    }}
                  >
                    <Lightbulb size={16} style={{ color: '#2563eb', flexShrink: 0, marginTop: 1 }} />
                    <div style={{ fontSize: '0.785rem', color: '#1e40af', lineHeight: 1.4 }}>
                      <strong style={{ fontWeight: 600 }}>Teaching Recommendation: </strong>
                      {tip}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
