'use client';

import React from 'react';
import {
  Sparkles,
  TrendingUp,
  Flame,
  Award,
  Zap,
  ChevronRight,
  Lightbulb,
  ArrowRight,
  BookOpen,
  Trophy,
} from 'lucide-react';
import type { UnifiedStudentOverview } from '@/services/student-analytics.service';
import { BlendedKnowledgeRadar } from './BlendedKnowledgeRadar';
import { AcademicRanksGrid } from './AcademicRanksGrid';
import { UnlockTracker } from './UnlockTracker';
import { RiskGuidanceCard } from './RiskGuidanceCard';
import styles from './student-analytics.module.css';

interface OverviewTabProps {
  overview: UnifiedStudentOverview | null;
  onNavigateTab: (tab: string) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ overview, onNavigateTab }) => {
  const highlights = overview?.highlights;
  const platform = overview?.platform;
  const academic = overview?.academic;
  const unlocks = overview?.unlocks;

  const suggestions = highlights?.suggestions || [
    'Review Linked Lists recursion before the upcoming Binary Trees lab.',
    'Challenge yourself with Medium difficulty practice problems to raise your platform rating.',
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* 1. Highlights Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1rem',
        }}
      >
        {/* Highlight 1: Grade Velocity */}
        <div
          style={{
            background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
            border: '1px solid #ddd6fe',
            borderRadius: '1rem',
            padding: '1.15rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#6d28d9', fontSize: '0.8rem', fontWeight: 700 }}>
            <TrendingUp size={16} /> Academic Momentum
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
            {academic?.grades?.average != null ? `${Math.round(academic.grades.average)}% Avg Grade` : 'On Track'}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
            Completed {academic?.completion?.completed ?? 0} of {academic?.completion?.assigned ?? 0} assigned lab coursework
          </div>
        </div>

        {/* Highlight 2: Active Streak */}
        <div
          style={{
            background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
            border: '1px solid #fed7aa',
            borderRadius: '1rem',
            padding: '1.15rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#c2410c', fontSize: '0.8rem', fontWeight: 700 }}>
            <Flame size={16} /> Problem Solving Streak
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
            {platform?.streak_days ?? 0} Days Active
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
            Solved {platform?.problems_solved ?? 0} competitive problems across platform topics
          </div>
        </div>

        {/* Highlight 3: Platform Rating */}
        <div
          style={{
            background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
            border: '1px solid #a7f3d0',
            borderRadius: '1rem',
            padding: '1.15rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#047857', fontSize: '0.8rem', fontWeight: 700 }}>
            <Trophy size={16} /> Platform Rating
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
            {platform?.rating ? Math.round(platform.rating).toLocaleString() : '0'} pts
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
            Ranked Global #{platform?.global_rank ?? '—'} (top {platform?.global_percentile != null ? Math.max(1, 100 - Math.round(platform.global_percentile)) : 10}%)
          </div>
        </div>

        {/* Highlight 4: Next Content Unlock */}
        <div
          style={{
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            border: '1px solid #bfdbfe',
            borderRadius: '1rem',
            padding: '1.15rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#1d4ed8', fontSize: '0.8rem', fontWeight: 700 }}>
            <Zap size={16} /> Content Tier
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
            {unlocks?.unlocked_tiers?.slice(-1)[0] ?? 'Easy'} Tier
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
            {unlocks?.next_unlock ? `Target: ${unlocks.next_unlock.tier} (${unlocks.next_unlock.progress_pct}% progress)` : 'All standard tiers unlocked'}
          </div>
        </div>
      </div>

      {/* 2. Next Actions Nudges */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '1rem',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>
            <Lightbulb size={18} color="#eab308" />
            <span>Recommended Next Actions</span>
          </div>
          <span className={styles.metaBadge} style={{ background: '#fef3c7', color: '#b45309' }}>
            Personalized Telemetry
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
          {suggestions.map((s, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.65rem',
                padding: '0.85rem 1rem',
                borderRadius: '0.65rem',
                background: '#f8fafc',
                border: '1px solid #f1f5f9',
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: '#ede9fe',
                  color: '#7c3aed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  flexShrink: 0,
                  marginTop: '1px',
                }}
              >
                {idx + 1}
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#334155', lineHeight: 1.4 }}>
                {s}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Blended Knowledge Map Preview */}
      <div>
        <BlendedKnowledgeRadar
          knowledgeMap={overview?.knowledge_map?.slice(0, 6)}
          focusTopics={highlights?.focus_topics}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button
            onClick={() => onNavigateTab('knowledge')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              background: 'transparent',
              border: 'none',
              color: '#7c3aed',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              padding: '0.25rem 0.5rem',
            }}
          >
            Explore Full Competency Map & Deep Diagnostics <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* 4. Academic Multi-Scope Standings */}
      <AcademicRanksGrid ranks={academic?.ranks} />

      {/* 5. Content Progression Tracker */}
      <UnlockTracker
        unlockedTiers={unlocks?.unlocked_tiers}
        easySolved={unlocks?.easy_solved}
        mediumSolved={unlocks?.medium_solved}
        hardSolved={unlocks?.hard_solved}
        rating={unlocks?.rating}
        nextUnlock={unlocks?.next_unlock}
      />

      {/* 6. Learning Guidance Card */}
      <RiskGuidanceCard
        band={academic?.standing?.band}
        primaryReason={academic?.standing?.primary_reason}
        suggestions={highlights?.suggestions}
        isSufficient={true}
      />
    </div>
  );
};
