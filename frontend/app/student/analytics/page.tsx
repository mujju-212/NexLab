'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCw, Lightbulb, Sparkles } from 'lucide-react';

import StudentShell from '@/components/layout/StudentShell';
import { useAuthStore } from '@/store/auth-store';
import { studentAnalyticsService } from '@/services/student-analytics.service';
import {
  TwoTrackHero,
  OverviewTab,
  AcademicTab,
  PlatformTab,
  KnowledgeMapTab,
} from '@/components/student-analytics';
import styles from '@/components/student-analytics/student-analytics.module.css';

function StudentAnalyticsDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const currentTab = searchParams.get('tab') || 'overview';
  const selectedSubjectId = searchParams.get('subject') || null;

  const handleTabChange = (tab: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`?${params.toString()}`);
  };

  const handleSubjectChange = (subjectId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (subjectId) {
      params.set('subject', subjectId);
    } else {
      params.delete('subject');
    }
    router.replace(`?${params.toString()}`);
  };

  // Platform Leaderboard state
  const [boardScope, setBoardScope] = useState<'global' | 'topic' | 'institution'>('global');
  const [boardPeriod, setBoardPeriod] = useState<'all_time' | 'monthly' | 'weekly'>('all_time');
  const [boardTopic, setBoardTopic] = useState('Arrays & Strings');

  // ── TanStack Queries ───────────────────────────────────────────────────────
  const {
    data: overview,
    isLoading: overviewLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['student-analytics-overview'],
    queryFn: () => studentAnalyticsService.getOverview(),
    staleTime: 60 * 1000,
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ['student-analytics-subjects'],
    queryFn: () => studentAnalyticsService.getSubjects(),
    staleTime: 60 * 1000,
  });

  const { data: ranks } = useQuery({
    queryKey: ['student-analytics-ranks'],
    queryFn: () => studentAnalyticsService.getRanks(),
    staleTime: 60 * 1000,
  });

  const { data: standing } = useQuery({
    queryKey: ['student-analytics-standing'],
    queryFn: () => studentAnalyticsService.getStanding(),
    staleTime: 60 * 1000,
  });

  const { data: attendance } = useQuery({
    queryKey: ['student-analytics-attendance', selectedSubjectId],
    queryFn: () => studentAnalyticsService.getAttendance(selectedSubjectId || undefined),
    staleTime: 60 * 1000,
  });

  const { data: integrity } = useQuery({
    queryKey: ['student-analytics-integrity'],
    queryFn: () => studentAnalyticsService.getIntegrity(),
    staleTime: 60 * 1000,
  });

  const { data: trends } = useQuery({
    queryKey: ['student-analytics-trends'],
    queryFn: () => studentAnalyticsService.getTrends(),
    staleTime: 60 * 1000,
  });

  const { data: forecast } = useQuery({
    queryKey: ['student-analytics-forecast'],
    queryFn: () => studentAnalyticsService.getForecast(),
    staleTime: 60 * 1000,
  });

  const { data: unlocks } = useQuery({
    queryKey: ['student-analytics-unlocks'],
    queryFn: () => studentAnalyticsService.getContentUnlocks(),
    staleTime: 60 * 1000,
  });

  const { data: mastery } = useQuery({
    queryKey: ['student-analytics-mastery', selectedSubjectId],
    queryFn: () => studentAnalyticsService.getMastery(selectedSubjectId || undefined),
    staleTime: 60 * 1000,
  });

  const { data: practiceMastery = [] } = useQuery({
    queryKey: ['student-analytics-practice-mastery'],
    queryFn: () => studentAnalyticsService.getPracticeMastery(),
    staleTime: 60 * 1000,
  });

  const { data: leaderboardData, isLoading: leaderboardLoading } = useQuery({
    queryKey: ['platform-leaderboard', boardScope, boardTopic, boardPeriod],
    queryFn: () =>
      studentAnalyticsService.getPlatformLeaderboard({
        scope: boardScope,
        scope_id: boardScope === 'topic' ? boardTopic : undefined,
        period: boardPeriod,
      }),
    staleTime: 30 * 1000,
  });

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['student-analytics'] });
    await queryClient.invalidateQueries({ queryKey: ['platform-leaderboard'] });
    refetch();
  };

  const highlights = overview?.highlights;

  return (
    <StudentShell
      activePage="Performance Analytics"
      title="My Growth"
      subtitle="Two-Track Growth Profile: Academic Mastery & Platform Competitive Standing"
    >
      <div className={styles.container}>
        {/* Dual-Rank Hero Banner (<ProfileHero>) */}
        <TwoTrackHero
          overview={overview ?? null}
          activeTab={currentTab}
          onTabChange={handleTabChange}
          studentName={user?.full_name || 'Student'}
          rollNumber={(user as any)?.roll_number}
          department={(user as any)?.department || 'Computer Science'}
        />

        {/* Action Controls & Refetch Status */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '-0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {highlights?.suggestions && highlights.suggestions.length > 0 && (
              <span className={styles.metaBadge} style={{ background: '#f5f3ff', color: '#6d28d9' }}>
                <Lightbulb size={13} /> {highlights.suggestions[0]}
              </span>
            )}
          </div>

          <button
            onClick={handleRefresh}
            disabled={isRefetching}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.85rem',
              borderRadius: '0.5rem',
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              color: '#475569',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <RotateCw size={13} className={isRefetching ? styles.spinner : ''} />
            <span>{isRefetching ? 'Updating…' : 'Refresh Telemetry'}</span>
          </button>
        </div>

        {/* ── 4 PRIMARY TABS ──────────────────────────────────────────────── */}

        {/* Tab 1: 🏠 Overview */}
        {currentTab === 'overview' && (
          <OverviewTab overview={overview ?? null} onNavigateTab={handleTabChange} />
        )}

        {/* Tab 2: 🎓 Academic */}
        {currentTab === 'academic' && (
          <AcademicTab
            subjects={subjects}
            selectedSubjectId={selectedSubjectId}
            onSubjectChange={handleSubjectChange}
            mastery={mastery}
            trends={trends}
            forecast={forecast}
            standing={standing}
            attendance={attendance || overview?.academic?.attendance}
            academicRanks={ranks?.academic || overview?.academic?.ranks}
          />
        )}

        {/* Tab 3: 🏆 Platform */}
        {currentTab === 'platform' && (
          <PlatformTab
            standing={overview?.platform}
            unlocks={unlocks || overview?.unlocks}
            practiceMastery={practiceMastery}
            leaderboardData={leaderboardData ?? null}
            leaderboardLoading={leaderboardLoading}
            boardScope={boardScope}
            boardPeriod={boardPeriod}
            boardTopic={boardTopic}
            onScopeChange={setBoardScope}
            onPeriodChange={setBoardPeriod}
            onTopicChange={setBoardTopic}
          />
        )}

        {/* Tab 4: 🧭 Knowledge Map */}
        {currentTab === 'knowledge' && (
          <KnowledgeMapTab
            knowledgeMap={overview?.knowledge_map}
            focusTopics={highlights?.focus_topics}
            prerequisiteBlocks={mastery?.prerequisite_blocks}
          />
        )}
      </div>
    </StudentShell>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense
      fallback={
        <StudentShell
          activePage="Performance Analytics"
          title="My Growth"
          subtitle="Loading your personalized growth profile…"
        >
          <div className={styles.loadingBox}>
            <RotateCw size={20} className={styles.spinner} /> Loading telemetry…
          </div>
        </StudentShell>
      }
    >
      <StudentAnalyticsDashboard />
    </Suspense>
  );
}
