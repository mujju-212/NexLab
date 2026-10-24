'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  RotateCw,
  Calendar,
  ChevronDown,
  Sparkles,
  GraduationCap,
  Trophy,
  Network,
  Lightbulb,
} from 'lucide-react';

import StudentShell from '@/components/layout/StudentShell';
import { useAuthStore } from '@/store/auth-store';
import { studentAnalyticsService } from '@/services/student-analytics.service';
import {
  OverviewTab,
  AcademicTab,
  PlatformTab,
  KnowledgeMapTab,
} from '@/components/student-analytics';
import growthStyles from '@/components/student-analytics/growth-overview.module.css';

function StudentAnalyticsDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const currentTab = searchParams.get('tab') || 'academic';
  const selectedSubjectId = searchParams.get('subject') || null;
  const [dateRange, setDateRange] = useState('30');

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

  // ── TanStack Queries ───────────────────────────────────────────────────────
  const {
    data: overview,
    isLoading: overviewLoading,
    isRefetching,
    isError: overviewIsError,
    error: overviewError,
    refetch,
  } = useQuery({
    queryKey: ['student-analytics-overview', user?.id ?? 'anonymous', dateRange],
    queryFn: () => studentAnalyticsService.getOverview({ period: dateRange }),
    staleTime: 60 * 1000,
  });

  const { data: subjects } = useQuery({
    queryKey: ['student-analytics-subjects', user?.id ?? 'anonymous'],
    queryFn: () => studentAnalyticsService.getSubjects(),
    staleTime: 60 * 1000,
  });

  const handleRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['student-analytics'] }),
      queryClient.invalidateQueries({ queryKey: ['student-analytics-overview'] }),
      queryClient.invalidateQueries({ queryKey: ['student-academic-dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['student-platform-dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['student-knowledge-map-dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['student-study-plans-overview'] }),
    ]);
    refetch();
  };

  return (
    <StudentShell activePage="Performance Analytics">
      <div className={growthStyles.container}>
        {/* ── Top Header Row: Title, Subtitle, and Date Range Dropdown ── */}
        <div className={growthStyles.topHeaderBar}>
          <div className={growthStyles.headerTitleGroup}>
            <h1>My Growth</h1>
            <p>Track your academic progress, practice journey, and build a stronger you.</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className={growthStyles.dateFilterWrapper}>
              <Calendar size={15} className={growthStyles.dateFilterIcon} />
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className={growthStyles.dateFilterSelect}
              >
                <option value="30">Last 30 Days</option>
                <option value="60">Last 60 Days</option>
                <option value="90">Last 90 Days</option>
                <option value="all">All Time</option>
              </select>
              <ChevronDown size={14} className={growthStyles.chevronIcon} />
            </div>

            <button
              onClick={handleRefresh}
              disabled={isRefetching}
              title="Refresh Telemetry"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.5rem 0.75rem',
                borderRadius: '0.5rem',
                border: '1px solid #e2e8f0',
                background: '#ffffff',
                color: '#64748b',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <RotateCw size={13} className={isRefetching ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* ── 4 Primary Navigation Tabs ── */}
        <div className={growthStyles.mainTabNav}>
          <button
            onClick={() => handleTabChange('overview')}
            className={`${growthStyles.mainTabBtn} ${currentTab === 'overview' ? growthStyles.mainTabActive : ''}`}
          >
            <Sparkles size={16} />
            <span>Overview</span>
          </button>
          <button
            onClick={() => handleTabChange('academic')}
            className={`${growthStyles.mainTabBtn} ${currentTab === 'academic' ? growthStyles.mainTabActive : ''}`}
          >
            <GraduationCap size={16} />
            <span>Academic</span>
          </button>
          <button
            onClick={() => handleTabChange('platform')}
            className={`${growthStyles.mainTabBtn} ${currentTab === 'platform' ? growthStyles.mainTabActive : ''}`}
          >
            <Trophy size={16} />
            <span>Platform</span>
          </button>
          <button
            onClick={() => handleTabChange('knowledge')}
            className={`${growthStyles.mainTabBtn} ${currentTab === 'knowledge' ? growthStyles.mainTabActive : ''}`}
          >
            <Network size={16} />
            <span>Knowledge Map</span>
          </button>
        </div>

        {/* ── TAB CONTENT ── */}

        {/* Tab 1: Overview */}
        {currentTab === 'overview' && (
          <OverviewTab
            overview={overview ?? null}
            onNavigateTab={handleTabChange}
            studentName={user?.full_name}
            rollNumber={(user as any)?.roll_number}
            department={(user as any)?.department}
            subjectCount={subjects?.length ?? null}
            loading={overviewLoading}
            error={overviewIsError ? (overviewError instanceof Error ? overviewError.message : 'Analytics request failed') : null}
            onRetry={() => refetch()}
            dateRange={dateRange}
          />
        )}

        {/* Tab 2: Academic Deep-Dive */}
        {currentTab === 'academic' && (
          <AcademicTab
            initialSubjectId={selectedSubjectId}
            onSubjectChange={handleSubjectChange}
            onNavigateTab={handleTabChange}
            dateRange={dateRange}
          />
        )}

        {/* Tab 3: Platform Competitive & Leaderboards */}
        {currentTab === 'platform' && (
          <PlatformTab
            onNavigateTab={handleTabChange}
            dateRange={dateRange}
          />
        )}

        {/* Tab 4: Blended Knowledge Map & Prerequisite Intelligence */}
        {currentTab === 'knowledge' && (
          <KnowledgeMapTab
            knowledgeMap={overview?.knowledge_map}
            focusTopics={overview?.highlights?.focus_topics}
            onNavigateTab={handleTabChange}
            dateRange={dateRange}
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
        <StudentShell activePage="Performance Analytics">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: '0.5rem', color: '#64748b' }}>
            <RotateCw size={18} className="animate-spin" />
            <span>Loading your personalized growth profile…</span>
          </div>
        </StudentShell>
      }
    >
      <StudentAnalyticsDashboard />
    </Suspense>
  );
}
