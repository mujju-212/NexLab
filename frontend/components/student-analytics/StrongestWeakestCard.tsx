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

const DEFAULT_STRONGEST = [
  { name: 'Arrays & Lists', score: 92 },
  { name: 'Object-Oriented Programming', score: 88 },
  { name: 'SQL & Databases', score: 84 },
  { name: 'Operating Systems', score: 82 },
  { name: 'Computer Networks', score: 78 },
];

const DEFAULT_FOCUS = [
  { name: 'Recursion', score: 34 },
  { name: 'Dynamic Programming', score: 42 },
  { name: 'Pointers & Memory', score: 46 },
  { name: 'Concurrency', score: 52 },
  { name: 'System Design Basics', score: 58 },
];

export const StrongestWeakestCard: React.FC<StrongestWeakestCardProps> = ({
  overview,
  onNavigateTab,
}) => {
  const strongest = overview?.strongest_concepts && overview.strongest_concepts.length >= 5
    ? overview.strongest_concepts
    : DEFAULT_STRONGEST;

  const focusNext = overview?.focus_next_concepts && overview.focus_next_concepts.length >= 5
    ? overview.focus_next_concepts
    : DEFAULT_FOCUS;

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

          {strongest.slice(0, 5).map((c, i) => (
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

          {focusNext.slice(0, 5).map((c, i) => (
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
