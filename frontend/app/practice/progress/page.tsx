'use client';

import React, { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Sparkles,
  Trophy,
  Compass,
  Calendar,
  BookOpen,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import IndividualShell from '@/components/layout/IndividualShell';
import {
  RankHero,
  FreeOverviewTab,
  FreeLadderTab,
  FreeSkillsTab,
  FreeActivityTab,
  FreeCoursesTab,
} from '@/components/free-analytics';
import { freeService } from '@/services/free.service';
import { useAuthStore } from '@/store/auth-store';
import styles from '@/components/free-analytics/free-analytics.module.css';

const VALID_TABS = ['overview', 'ladder', 'skills', 'activity', 'courses'] as const;
type TabKey = (typeof VALID_TABS)[number];

function ProgressPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated || !user) {
      router.replace('/login');
    }
  }, [isAuthenticated, user, router]);

  // Tab State synced with URL query param
  const currentTab = (searchParams?.get('tab') as TabKey) || 'overview';
  const activeTab: TabKey = VALID_TABS.includes(currentTab) ? currentTab : 'overview';

  const handleTabChange = (tab: string) => {
    const params = new URLSearchParams(searchParams?.toString() || '');
    params.set('tab', tab);
    router.push(`/practice/progress?${params.toString()}`);
  };

  // 1. Unified Profile Query (Overview)
  const {
    data: overview,
    isLoading: overviewLoading,
    error: overviewError,
    refetch,
  } = useQuery({
    queryKey: ['free-analytics-overview'],
    queryFn: () => freeService.getFreeOverview(),
    enabled: !!user,
  });

  // 2. Targeted Recommendations
  const { data: recsData } = useQuery({
    queryKey: ['free-analytics-recommendations'],
    queryFn: () => freeService.getRecommendations(5),
    enabled: !!user,
  });

  // 3. User's Showcase Settings
  const { data: showcaseMe } = useQuery({
    queryKey: ['free-analytics-showcase-me'],
    queryFn: () => freeService.getMyShowcase(),
    enabled: !!user,
  });

  if (!isAuthenticated || !user) return null;

  return (
    <IndividualShell
      activePage="progress"
      title="My Growth"
      subtitle="Track your competitive platform rating, ladder standings, topic mastery, and course progress."
    >
      <div className={styles.container}>
        {overviewLoading ? (
          <div
            style={{
              minHeight: '360px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1rem',
              color: '#64748b',
            }}
          >
            <RefreshCw size={28} className={styles.spinIcon} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>Loading your platform growth profile…</span>
          </div>
        ) : overviewError || !overview ? (
          <div
            style={{
              padding: '2.5rem',
              background: '#fef2f2',
              border: '1px solid #fee2e2',
              borderRadius: '1.25rem',
              textAlign: 'center',
              color: '#dc2626',
            }}
          >
            <AlertCircle size={36} style={{ margin: '0 auto 0.75rem' }} />
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Unable to load growth analytics</h3>
            <p style={{ margin: '0.5rem 0 1.25rem', fontSize: '0.85rem', color: '#991b1b' }}>
              We encountered a temporary issue retrieving your performance metrics.
            </p>
            <button
              onClick={() => refetch()}
              style={{
                padding: '0.6rem 1.25rem',
                borderRadius: '0.625rem',
                background: '#dc2626',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.825rem',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* ── 1. The Rank Hero ───────────────────────────────────────── */}
            <RankHero
              standing={overview.standing}
              difficultyMix={overview.difficulty_mix}
              unlocks={overview.unlocks}
              userName={user?.full_name || 'Coder'}
              initialPublic={showcaseMe?.profile_public ?? false}
              profileSlug={showcaseMe?.profile_slug}
            />

            {/* ── 2. Growth Profile Navigation Tabs ───────────────────────── */}
            <div className={styles.tabsNav}>
              {[
                { id: 'overview', label: 'Overview', icon: Sparkles },
                { id: 'ladder', label: 'Ladder & Ranks', icon: Trophy },
                { id: 'skills', label: 'Skills & Topics', icon: Compass },
                { id: 'activity', label: 'Activity & Trends', icon: Calendar },
                { id: 'courses', label: 'Courses & Certs', icon: BookOpen },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={`${styles.tabBtn} ${isActive ? styles.tabBtnActive : ''}`}
                  >
                    <Icon size={16} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* ── 3. Tab Panels ───────────────────────────────────────────── */}
            {activeTab === 'overview' && (
              <FreeOverviewTab
                overview={overview}
                recommendations={recsData?.recommendations}
                onNavigateTab={handleTabChange}
              />
            )}

            {activeTab === 'ladder' && (
              <FreeLadderTab
                standing={overview.standing}
                difficultyMix={overview.difficulty_mix}
                unlocks={overview.unlocks}
              />
            )}

            {activeTab === 'skills' && (
              <FreeSkillsTab
                topicStrength={overview.topic_strength}
                recommendations={recsData?.recommendations}
              />
            )}

            {activeTab === 'activity' && (
              <FreeActivityTab activity={overview.activity} />
            )}

            {activeTab === 'courses' && (
              <FreeCoursesTab initialCourses={overview.courses} />
            )}
          </>
        )}
      </div>
    </IndividualShell>
  );
}

export default function ProgressPage() {
  return (
    <Suspense
      fallback={
        <IndividualShell activePage="progress" title="My Growth">
          <div
            style={{
              minHeight: '360px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748b',
            }}
          >
            Loading Growth Profile…
          </div>
        </IndividualShell>
      }
    >
      <ProgressPageContent />
    </Suspense>
  );
}
