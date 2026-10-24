'use client';

import React from 'react';
import {
  Target,
  ShieldCheck,
  ArrowRight,
  Layers,
  Box,
  Database,
  Cpu,
  Network,
  Repeat,
  GitBranch,
  Code2,
  Zap,
  LayoutGrid,
} from 'lucide-react';
import type { UnifiedStudentOverview } from '@/services/student-analytics.service';
import styles from './growth-overview.module.css';

interface StrongestWeakestCardProps {
  overview: UnifiedStudentOverview | null;
  onNavigateTab: (tab: string) => void;
}

const CONCEPT_ICONS: Record<string, React.FC<{ size?: number }>> = {
  'Arrays & Lists': Layers,
  'Arrays & Strings': Layers,
  'Object-Oriented Programming': Box,
  'SQL & Databases': Database,
  'Operating Systems': Cpu,
  'Computer Networks': Network,
  'Recursion': Repeat,
  'Recursion & Backtracking': Repeat,
  'Dynamic Programming': GitBranch,
  'Pointers & Memory': Code2,
  'Concurrency': Zap,
  'System Design Basics': LayoutGrid,
  'Linked Lists': Layers,
  'Trees & Graphs': GitBranch,
};

export const StrongestWeakestCard: React.FC<StrongestWeakestCardProps> = ({
  overview,
  onNavigateTab,
}) => {
  const strongest = overview?.strongest_concepts ?? [];
  const focusNext = overview?.focus_next_concepts ?? [];

  const renderIcon = (name: string, fallbackColor: string) => {
    const IconComp = CONCEPT_ICONS[name] || Layers;
    return <IconComp size={14} />;
  };

  return (
    <div className={styles.card}>
      <div className={styles.cardHeaderRow}>
        <div className={styles.cardTitleBlock}>
          <div className={styles.headerIconCircle} style={{ background: '#ffe4e6', color: '#e11d48' }}>
            <Target size={18} />
          </div>
          <div>
            <h3>My Strongest & Weakest Areas</h3>
            <p>Based on blended mastery across academic and practice.</p>
          </div>
        </div>

        <button
          onClick={() => onNavigateTab('knowledge')}
          className={styles.viewFullMapBtn}
          title="Open complete interactive Knowledge Map"
        >
          <span>View Full Map</span>
          <ArrowRight size={13} />
        </button>
      </div>

      <div className={styles.splitConceptsGrid}>
        {/* ── Left Subpanel: Strongest Concepts ── */}
        <div className={styles.conceptSubpanel}>
          <div className={`${styles.subpanelHeader} ${styles.headerGreen}`}>
            <ShieldCheck size={14} />
            <span>Strongest Concepts</span>
          </div>

          {strongest.length === 0 ? (
            <p style={{ color: '#64748b', padding: '0.75rem' }}>No measured strengths yet.</p>
          ) : strongest.slice(0, 5).map((c, i) => (
            <div key={i} className={styles.conceptRowItem}>
              <div className={styles.conceptRowTop}>
                <div className={styles.conceptLabelWithIcon}>
                  {renderIcon(c.name, '#10b981')}
                  <span>{c.name}</span>
                </div>
                <span className={styles.conceptScoreText}>{c.score}%</span>
              </div>
              <div className={styles.conceptBarTrack}>
                <div
                  className={styles.conceptBarGreen}
                  style={{ width: `${c.score}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* ── Right Subpanel: Focus Next ── */}
        <div className={styles.conceptSubpanel}>
          <div className={`${styles.subpanelHeader} ${styles.headerOrange}`}>
            <Target size={14} />
            <span>Focus Next</span>
          </div>

          {focusNext.length === 0 ? (
            <p style={{ color: '#64748b', padding: '0.75rem' }}>No measured focus areas yet.</p>
          ) : focusNext.slice(0, 5).map((c, i) => (
            <div key={i} className={styles.conceptRowItem}>
              <div className={styles.conceptRowTop}>
                <div className={styles.conceptLabelWithIcon}>
                  {renderIcon(c.name, '#ea580c')}
                  <span>{c.name}</span>
                </div>
                <span className={styles.conceptScoreText}>{c.score}%</span>
              </div>
              <div className={styles.conceptBarTrack}>
                <div
                  className={styles.conceptBarOrange}
                  style={{ width: `${c.score}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
