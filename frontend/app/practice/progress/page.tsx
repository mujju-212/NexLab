'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Sparkles,
  Trophy,
  Target,
  Calendar,
  BookOpen,
  RefreshCw,
  AlertCircle,
  BarChart3,
  ExternalLink,
} from 'lucide-react';
import IndividualShell from '@/components/layout/IndividualShell';
import { ProgressSkeleton } from '@/components/practice/PracticeSkeletons';
import {
  PlatformOverviewTab,
  PlatformLadderTab,
  PlatformSkillsTab,
  PlatformActivityTab,
  PlatformCoursesTab,
  ShowcaseModal,
} from '@/components/platform-analytics';
import { platformUserService } from '@/services/platform-user.service';
import { useAuthStore } from '@/store/auth-store';
import styles from '@/components/platform-analytics/platform-analytics.module.css';

import Cookies from 'js-cookie';
import { authService } from '@/services/auth.service';

const VALID_TABS = ['overview', 'ladder', 'skills', 'activity', 'courses'] as const;
type TabKey = (typeof VALID_TABS)[number];

function ProgressPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, hasHydrated, setUser } = useAuthStore();
  const [showcaseOpen, setShowcaseOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isReady = mounted && (hasHydrated || typeof window !== 'undefined');

  useEffect(() => {
    if (!isReady) return;

    const token = Cookies.get('access_token') || (typeof window !== 'undefined' ? localStorage.getItem('access_token') : null);

    if (!token && !isAuthenticated) {
      router.replace('/login');
      return;
    }

    if (token && !user) {
      authService.getMe()
        .then((u) => setUser(u))
        .catch(() => router.replace('/login'));
    }
  }, [isReady, isAuthenticated, user, router, setUser]);

  // Tab State synced with URL query param and fast local state
  const currentTab = (searchParams?.get('tab') as TabKey) || 'overview';
  const [activeTab, setActiveTab] = useState<TabKey>(
    VALID_TABS.includes(currentTab) ? currentTab : 'overview'
  );

  useEffect(() => {
    const urlTab = searchParams?.get('tab') as TabKey;
    if (urlTab && VALID_TABS.includes(urlTab) && urlTab !== activeTab) {
      setActiveTab(urlTab);
    }
  }, [searchParams, activeTab]);

  const handleTabChange = (tab: string) => {
    const validTab = (VALID_TABS.includes(tab as TabKey) ? tab : 'overview') as TabKey;
    setActiveTab(validTab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', validTab);
      window.history.replaceState(null, '', url.toString());
    }
  };

  // 1. Unified Profile Query (Overview)
  const {
    data: overview,
    isLoading: overviewLoading,
    error: overviewError,
    refetch,
  } = useQuery({
    queryKey: ['platform-analytics-overview'],
    queryFn: () => platformUserService.getPlatformOverview(),
    enabled: !!user,
  });

  // 2. Targeted Recommendations
  const { data: recsData } = useQuery({
    queryKey: ['platform-analytics-recommendations'],
    queryFn: () => platformUserService.getRecommendations(5),
    enabled: !!user,
  });

  // 3. User's Showcase Settings
  const { data: showcaseMe } = useQuery({
    queryKey: ['platform-analytics-showcase-me'],
    queryFn: () => platformUserService.getMyShowcase(),
    enabled: !!user,
  });

  if (!mounted || !isAuthenticated || !user) {
    return (
      <IndividualShell activePage="progress">
        <ProgressSkeleton />
      </IndividualShell>
    );
  }

  return (
    <IndividualShell activePage="progress">
      <div className={styles.container}>
        
        {/* ══ TOP HERO HEADER (Only on non-courses tabs) ══ */}
        {activeTab !== 'courses' && (
          <div className={styles.topHeaderBar}>
            <div className={styles.topHeaderLeft}>
              <div className={styles.topHeaderIconBadge}>
                <BarChart3 size={24} />
              </div>
              <div>
                <h1 className={styles.pageTitle}>My Growth</h1>
                <p className={styles.pageSubtitle}>
                  Track your progress, improve your skills, and climb the global leaderboard.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ══ NAVIGATION TABS PILLS + USER PROFILE BADGE ══ */}
        <div className={styles.tabsNavRow}>
          <div className={styles.tabsNavPills}>
            {[
              { id: 'overview', label: 'Overview', icon: Sparkles },
              { id: 'ladder', label: 'Ladder & Ranks', icon: Trophy },
              { id: 'skills', label: 'Skills & Topics', icon: Target },
              { id: 'activity', label: 'Activity & Trends', icon: Calendar },
              { id: 'courses', label: 'Courses & Certs', icon: BookOpen },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`${styles.tabPillBtn} ${isActive ? styles.tabPillBtnActive : ''}`}
                >
                  <Icon size={15} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className={styles.userProfilePillHeader}>
            <div className={styles.userAvatarSm}>FL</div>
            <div className={styles.userNameBlock}>
              <span className={styles.userFullNameText}>{user?.full_name || 'Platform Learner'}</span>
              <span className={styles.userHandleText}>@{(user?.full_name || "learner").toLowerCase().replace(/\s+/g, "")}</span>
            </div>
            <button
              onClick={() => setShowcaseOpen(true)}
              className={styles.shareProfileBtnHeader}
              title="Share Public Profile"
            >
              <span>Share Profile</span>
              <ExternalLink size={12} />
            </button>
          </div>
        </div>

        {/* ══ CONTENT STATES ══ */}
        {overviewLoading ? (
          <ProgressSkeleton />
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
            {/* ══ 1. Overview Tab (Redesigned matching mockup) ══ */}
            {activeTab === 'overview' && (
              <PlatformOverviewTab
                overview={overview}
                recommendations={recsData?.recommendations}
                onNavigateTab={handleTabChange}
                onOpenShare={() => setShowcaseOpen(true)}
              />
            )}

            {/* ══ 2. Ladder & Ranks Tab ══ */}
            {activeTab === 'ladder' && (
              <PlatformLadderTab
                standing={overview.standing}
                difficultyMix={overview.difficulty_mix}
                unlocks={overview.unlocks}
                onOpenShare={() => setShowcaseOpen(true)}
              />
            )}

            {/* ══ 3. Skills & Topics Tab ══ */}
            {activeTab === 'skills' && (
              <PlatformSkillsTab
                topicStrength={overview.topic_strength}
                recommendations={recsData?.recommendations}
              />
            )}

            {/* ══ 4. Activity & Trends Tab ══ */}
            {activeTab === 'activity' && (
              <PlatformActivityTab activity={overview.activity} />
            )}

            {/* ══ 5. Courses & Certs Tab ══ */}
            {activeTab === 'courses' && (
              <PlatformCoursesTab
                initialCourses={overview.courses}
                onOpenShare={() => setShowcaseOpen(true)}
              />
            )}
          </>
        )}

        {/* ══ Showcase Share Modal ══ */}
        {overview && (
          <ShowcaseModal
            isOpen={showcaseOpen}
            onClose={() => setShowcaseOpen(false)}
            initialPublic={showcaseMe?.profile_public ?? false}
            initialSlug={showcaseMe?.profile_slug ?? null}
            userName={user?.full_name || 'Platform Learner'}
            rating={Math.round(overview.standing.rating ?? 0)}
            level={overview.standing.level ?? 1}
            levelName={overview.standing.level_name ?? 'Newcomer'}
            streakDays={overview.standing.streak_days ?? 0}
            badgesCount={(overview.standing.badges || []).length}
          />
        )}

      </div>
    </IndividualShell>
  );
}

export default function ProgressPage() {
  return (
    <Suspense
      fallback={
        <IndividualShell activePage="progress">
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
