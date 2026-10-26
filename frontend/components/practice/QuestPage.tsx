'use client';
/**
 * QuestPage — NexLab Gamified Quest & XP Page
 * 100% Real Live Telemetry & Database Backed. Zero Mock Data.
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  Flame,
  Zap,
  Trophy,
  BarChart3,
  Calendar,
  Clock,
  Check,
  ChevronRight,
  Target,
  Sparkles,
  ArrowRight,
  Code,
  Award,
  Layers,
  X,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import styles from './QuestPage.module.css';
import { apiClient } from '@/services/api-client';

interface QuestStats {
  streak_days: number;
  total_xp: number;
  problems_solved: number;
  easy_solved: number;
  medium_solved: number;
  hard_solved: number;
  level: number;
  level_name: string;
  global_rank: number | null;
}

interface HeroQuest {
  id: string;
  title: string;
  description: string;
  xp_reward: number;
  difficulty: string;
  topic: string;
  ends_in: string;
  progress: number;
  total: number;
  is_completed: boolean;
  action_label: string;
  action_url: string;
}

interface CalendarDay {
  name: string;
  date: number;
  iso_date: string;
  is_active: boolean;
  is_today: boolean;
  is_future: boolean;
}

interface WeeklyProgress {
  range_label: string;
  active_days_count: number;
  total_days: number;
  reward_xp: number;
  days: CalendarDay[];
}

interface QuestItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: string;
  xp_reward: number;
  progress: number;
  total: number;
  is_completed: boolean;
  is_claimed?: boolean;
  action_label?: string;
  action_url: string;
}

interface AchievementItem {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  xp_reward: number;
  progress: number;
  total: number;
  is_earned: boolean;
}

interface LbEntry {
  rank: number;
  student_id: string;
  name: string;
  account_type: 'institution' | 'individual';
  total_xp: number;
  level: number;
  level_name: string;
  problems_solved: number;
  streak_days: number;
  is_me: boolean;
}



interface BadgeCatalogItem {
  id: string;
  emoji: string;
  name: string;
  desc: string;
}

const BADGE_CATALOG: BadgeCatalogItem[] = [
  { id: 'first_solve', emoji: '🌱', name: 'First Steps', desc: 'Solve your first problem' },
  { id: 'streak_7', emoji: '🔥', name: 'Week Warrior', desc: '7-day streak' },
  { id: 'streak_30', emoji: '🔥', name: 'Month Master', desc: '30-day streak' },
  { id: 'easy_10', emoji: '✅', name: 'Easy Mode', desc: 'Solve 10 Easy problems' },
  { id: 'medium_10', emoji: '⚡', name: 'Rising Star', desc: 'Solve 10 Medium problems' },
  { id: 'hard_5', emoji: '💎', name: 'Diamond Coder', desc: 'Solve 5 Hard problems' },
  { id: 'nexlab75', emoji: '🎯', name: 'NexLab 75', desc: 'Complete NexLab 75' },
  { id: 'beginner_path', emoji: '🌱', name: 'Beginner Badge', desc: 'Complete Beginner Path' },
  { id: 'dp_mastery', emoji: '🧠', name: 'DP Expert', desc: 'Complete DP Mastery' },
  { id: 'trees_graphs', emoji: '🌳', name: 'Tree Climber', desc: 'Complete Trees & Graphs' },
  { id: 'sql_50', emoji: '🗄️', name: 'SQL Pro', desc: 'Complete SQL 50' },
  { id: 'interview_ready', emoji: '💼', name: 'Interview Ready', desc: 'Complete Interview Ready' },
  { id: 'centurion', emoji: '💯', name: 'Centurion', desc: 'Solve 100 problems' },
  { id: 'speed_demon', emoji: '⚡', name: 'Speed Demon', desc: 'Submit & accepted under 5 min' },
  { id: 'top_10', emoji: '🏆', name: 'Top 10', desc: 'Top 10 in institution leaderboard' },
];

export default function QuestPage({ baseRoute }: { baseRoute: string }) {
  const router = useRouter();

  // Dashboard Data State
  const [stats, setStats] = useState<QuestStats | null>(null);
  const [heroQuest, setHeroQuest] = useState<HeroQuest | null>(null);
  const [weeklyProgress, setWeeklyProgress] = useState<WeeklyProgress | null>(null);
  const [dailyQuests, setDailyQuests] = useState<{
    completed_count: number;
    total_count: number;
    resets_in: string;
    items: QuestItem[];
  } | null>(null);
  const [weeklyQuests, setWeeklyQuests] = useState<{
    completed_count: number;
    total_count: number;
    resets_in: string;
    items: QuestItem[];
  } | null>(null);
  const [achievementQuests, setAchievementQuests] = useState<AchievementItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter Pill state
  const [activeTab, setActiveTab] = useState<'all' | 'daily' | 'weekly' | 'skill' | 'badge' | 'achievement'>('all');

  // Leaderboard Modal state
  const [showLbModal, setShowLbModal] = useState(false);
  const [board, setBoard] = useState<LbEntry[]>([]);
  const [scope, setScope] = useState<'institution' | 'global'>('global');
  const [canViewInstitution, setCanViewInstitution] = useState(false);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [lbLoading, setLbLoading] = useState(false);

  // Claim Toast Notification
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const loadDashboard = async () => {
    try {
      const res = await apiClient.get('/practice/quest/dashboard');
      const data = res.data;
      setStats(data.stats);
      setHeroQuest(data.today_quest);
      setWeeklyProgress(data.weekly_progress);
      setDailyQuests(data.daily_quests);
      setWeeklyQuests(data.weekly_quests);
      setAchievementQuests(data.achievement_quests?.items || []);
    } catch (e) {
      console.error('Failed to load quest dashboard:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadLeaderboard = async (s: 'institution' | 'global') => {
    setLbLoading(true);
    try {
      const res = await apiClient.get(`/practice/quest/leaderboard?scope=${s}`);
      setBoard(res.data.leaderboard || []);
      setMyRank(res.data.my_rank ?? null);
      setCanViewInstitution(!!res.data.can_view_institution);
      setScope(res.data.scope || s);
    } catch (e) {
      console.error('Failed to load leaderboard:', e);
    } finally {
      setLbLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleClaim = async (questKey: string, rewardXp: number) => {
    try {
      const res = await apiClient.post('/practice/quest/claim', { quest_key: questKey });
      if (res.data.success) {
        setToastMsg(`Quest completed! +${res.data.xp_awarded} XP added to your total!`);
        setTimeout(() => setToastMsg(null), 4000);
        // Refresh dashboard data to reflect claimed state & new XP
        loadDashboard();
      }
    } catch (e: any) {
      console.error('Claim error:', e);
      if (e?.response?.data?.error) {
        setToastMsg(e.response.data.error);
        setTimeout(() => setToastMsg(null), 3000);
      }
    }
  };

  const handleActionClick = (item: QuestItem) => {
    if (item.is_completed && !item.is_claimed) {
      handleClaim(item.id, item.xp_reward);
      return;
    }
    if (item.is_completed) return;

    if (item.action_url) {
      router.push(item.action_url);
    } else {
      router.push(baseRoute);
    }
  };

  const handleHeroAction = () => {
    if (!heroQuest) return;
    if (heroQuest.is_completed) {
      handleClaim(heroQuest.id, heroQuest.xp_reward);
      return;
    }
    if (heroQuest.action_url) {
      router.push(heroQuest.action_url);
    } else {
      router.push(`${baseRoute}?topic=Array`);
    }
  };

  const openLeaderboard = () => {
    setShowLbModal(true);
    loadLeaderboard('global');
  };

  if (loading) {
    return (
      <div className={styles.loadingSpinner}>
        <Sparkles size={22} className="spin text-purple-600" />
        Loading your quest data…
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* ══ 1. HEADER ROW ══ */}
      <div className={styles.headerRow}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIconBox}>
            <Zap size={28} strokeWidth={2.4} fill="#f97316" color="#ea580c" />
          </div>
          <div className={styles.titleArea}>
            <h1>Quest &amp; XP</h1>
            <p>Complete quests, earn XP, maintain your streak, and unlock amazing badges.</p>
          </div>
        </div>

        {/* Top Right Stats Pills */}
        <div className={styles.statsPills}>
          {/* Day Streak */}
          <div className={styles.statPillCard}>
            <div className={styles.statPillIcon} style={{ background: '#fff7ed', color: '#ea580c' }}>
              <Flame size={19} fill="#ea580c" />
            </div>
            <div className={styles.statPillInfo}>
              <span className={styles.statPillVal}>{stats?.streak_days ?? 0}</span>
              <span className={styles.statPillLabel}>Day Streak</span>
            </div>
          </div>

          {/* Total XP */}
          <div className={styles.statPillCard}>
            <div className={styles.statPillIcon} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
              <Zap size={18} fill="#7c3aed" />
            </div>
            <div className={styles.statPillInfo}>
              <span className={styles.statPillVal}>{stats?.total_xp ?? 0} XP</span>
              <span className={styles.statPillLabel}>Total XP</span>
            </div>
          </div>

          {/* Problems Solved */}
          <div className={styles.statPillCard}>
            <div className={styles.statPillIcon} style={{ background: '#fefce8', color: '#ca8a04' }}>
              <Trophy size={18} fill="#ca8a04" />
            </div>
            <div className={styles.statPillInfo}>
              <span className={styles.statPillVal}>{stats?.problems_solved ?? 0}</span>
              <span className={styles.statPillLabel}>Problems Solved</span>
            </div>
          </div>

          {/* Global Rank */}
          <div
            className={styles.statPillCard}
            style={{ cursor: 'pointer' }}
            onClick={openLeaderboard}
            title="Click to view Global Leaderboard"
          >
            <div className={styles.statPillIcon} style={{ background: '#eff6ff', color: '#2563eb' }}>
              <BarChart3 size={18} />
            </div>
            <div className={styles.statPillInfo}>
              <span className={styles.statPillVal}>{stats?.global_rank != null ? `#${stats.global_rank}` : '—'}</span>
              <span className={styles.statPillLabel}>Global Rank</span>
            </div>
          </div>
        </div>
      </div>

      {/* ══ 2. HERO ROW (Today's Quest + Weekly Progress) ══ */}
      <div className={styles.heroGrid}>
        {/* Left Hero Banner */}
        <div className={styles.heroBanner}>
          <div className={styles.heroContent}>
            <div className={styles.todayQuestBadge}>
              <Sparkles size={14} fill="#ea580c" />
              TODAY&apos;S QUEST
            </div>
            <h2 className={styles.heroTitle}>{heroQuest?.title ?? 'No quest available today'}</h2>
            <p className={styles.heroSubtitle}>
              {heroQuest?.description ?? 'There is no active quest to display right now.'}
            </p>

            <div className={styles.tagRow}>
              <span className={`${styles.tagPill} ${styles.tagXp}`}>
                <Zap size={12} fill="#ea580c" /> {heroQuest?.xp_reward != null ? `+${heroQuest.xp_reward} XP` : 'XP unavailable'}
              </span>
              <span className={`${styles.tagPill} ${styles.tagDiff}`}>
                {heroQuest?.difficulty ?? '—'}
              </span>
              <span className={`${styles.tagPill} ${styles.tagTopic}`}>
                {heroQuest?.topic ?? '—'}
              </span>
              <span className={`${styles.tagPill} ${styles.tagTime}`}>
                <Clock size={12} /> Ends in {heroQuest?.ends_in ?? '—'}
              </span>
            </div>

            <div className={styles.heroActionsRow}>
              <div className={styles.heroProgressWrap}>
                <div className={styles.heroProgressText}>
                  {heroQuest?.progress ?? 0} / {heroQuest?.total ?? 0} completed
                </div>
                <div className={styles.progressBarTrack}>
                  <div
                    className={styles.progressBarFill}
                    style={{
                      width: `${heroQuest?.total ? Math.min(100, Math.round(((heroQuest.progress ?? 0) / heroQuest.total) * 100)) : 0}%`,
                    }}
                  />
                </div>
              </div>

              <button className={styles.heroCtaBtn} onClick={handleHeroAction} disabled={!heroQuest}>
                {heroQuest?.action_label ?? 'No active quest'} <ArrowRight size={15} />
              </button>
            </div>
          </div>

          <div className={styles.heroImageWrap}>
            <Image
              src="/quest-target-hero.jpg"
              alt="Quest Target 3D Illustration"
              width={170}
              height={170}
              className={styles.heroImage}
              priority
            />
          </div>
        </div>

        {/* Right Weekly Progress Card */}
        <div className={styles.weeklyCard}>
          <div>
            <div className={styles.weeklyTop}>
              <div className={styles.weeklyTitleRow}>
                <div className={styles.weeklyIconBox}>
                  <Calendar size={18} />
                </div>
                <div>
                  <h3 className={styles.weeklyTitle}>Weekly Progress</h3>
                  <p className={styles.weeklyDates}>{weeklyProgress?.range_label ?? '—'}</p>
                </div>
              </div>
              <button className={styles.viewAllLink} onClick={openLeaderboard}>
                View All
              </button>
            </div>

            {/* 7 Days Grid */}
            <div className={styles.daysGrid}>
              {weeklyProgress?.days.map((day) => {
                let bubbleClass = styles.dayBubbleEmpty;
                if (day.is_active) {
                  bubbleClass = styles.dayBubbleCompleted;
                } else if (day.is_today) {
                  bubbleClass = styles.dayBubbleToday;
                } else if (day.is_future) {
                  bubbleClass = styles.dayBubbleFuture;
                }

                return (
                  <div key={day.iso_date} className={styles.dayCol}>
                    <span className={styles.dayName}>{day.name}</span>
                    <div className={`${styles.dayBubble} ${bubbleClass}`}>
                      {day.is_active ? (
                        <Check size={14} strokeWidth={3} />
                      ) : (
                        <span>{day.date}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Weekly Card Bottom */}
          <div className={styles.weeklyBottom}>
            <div className={styles.weeklyProgressMeta}>
              <span className={styles.weeklyDaysCount}>
                {weeklyProgress?.active_days_count ?? 0} / {weeklyProgress?.total_days ?? 0} days
              </span>
              <span className={styles.weeklyRewardTag}>{weeklyProgress?.reward_xp != null ? `+${weeklyProgress.reward_xp} XP` : '—'}</span>
            </div>
            <div className={styles.progressBarTrack}>
              <div
                className={styles.progressBarFill}
                style={{
                  width: `${weeklyProgress?.total_days ? Math.min(100, Math.round(((weeklyProgress.active_days_count ?? 0) / weeklyProgress.total_days) * 100)) : 0}%`,
                  background: '#7c3aed',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ══ 3. FILTER PILL TABS ══ */}
      <div className={styles.filterPillsRow}>
        {[
          { key: 'all', label: 'All Quests' },
          { key: 'daily', label: 'Daily Quests' },
          { key: 'weekly', label: 'Weekly Quests' },
          { key: 'skill', label: 'Skill Quests' },
          { key: 'badge', label: 'Badge Quests' },
          { key: 'achievement', label: 'Achievement Quests' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`${styles.filterPill} ${activeTab === tab.key ? styles.filterPillActive : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══ 4. DAILY QUESTS SECTION ══ */}
      {(activeTab === 'all' || activeTab === 'daily') && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionHeaderLeft}>
              <div className={styles.sectionIconBox} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                <Calendar size={18} />
              </div>
              <div>
                <h3 className={styles.sectionTitle}>Daily Quests</h3>
                <p className={styles.sectionSubtitle}>Complete these quests every day and keep your streak alive.</p>
              </div>
            </div>

            <div className={styles.sectionHeaderRight}>
              <span className={styles.completedBadge}>
                {dailyQuests?.completed_count ?? 0}/{dailyQuests?.total_count ?? 0} completed
              </span>
              <span className={styles.resetsBadge}>
                <Clock size={13} /> Resets in {dailyQuests?.resets_in ?? '—'}
              </span>
            </div>
          </div>

          {/* 5 Daily Quest Cards */}
          <div className={styles.fiveCardsGrid}>
            {(dailyQuests?.items ?? []).length ? dailyQuests!.items.map((item, idx) => {
              const isHighlight = idx === 1; // Card 2 has subtle purple glow like in screenshot
              const isFull = item.progress >= item.total;
              const fillPct = Math.min(100, Math.round((item.progress / item.total) * 100));

              // Icon selection based on item icon type
              let IconComp = Check;
              let iconBg = '#f5f3ff';
              let iconColor = '#7c3aed';

              if (item.icon === 'check' || isFull) {
                IconComp = Check;
                iconBg = '#dcfce7';
                iconColor = '#16a34a';
              } else if (item.icon === 'target') {
                IconComp = Target;
                iconBg = '#f5f3ff';
                iconColor = '#7c3aed';
              } else if (item.icon === 'flame') {
                IconComp = Flame;
                iconBg = '#fff7ed';
                iconColor = '#ea580c';
              } else if (item.icon === 'zap') {
                IconComp = Zap;
                iconBg = '#fefce8';
                iconColor = '#ca8a04';
              }

              return (
                <div
                  key={item.id}
                  className={`${styles.questCard} ${isHighlight ? styles.questCardHighlight : ''}`}
                >
                  <div className={styles.questCardTop}>
                    <div className={styles.questCardIconBox} style={{ background: iconBg, color: iconColor }}>
                      <IconComp size={16} strokeWidth={2.4} />
                    </div>
                    <div className={styles.questCardHeadings}>
                      <h4 className={styles.questCardTitle}>{item.title}</h4>
                      {item.subtitle && <p className={styles.questCardSubtitle}>{item.subtitle}</p>}
                    </div>
                  </div>

                  <div className={styles.questCardProgressRow}>
                    <div className={styles.questCardProgressMeta}>
                      <span className={styles.questCardProgressText}>
                        {item.progress} / {item.total}
                      </span>
                    </div>
                    <div className={styles.progressBarTrack}>
                      <div
                        className={styles.progressBarFill}
                        style={{
                          width: `${fillPct}%`,
                          background: isFull ? '#22c55e' : (fillPct > 0 ? '#7c3aed' : '#e2e8f0'),
                        }}
                      />
                    </div>
                  </div>

                  <div className={styles.questCardFooter}>
                    <span className={styles.questRewardXp}>
                      <Zap size={13} fill="#ea580c" /> +{item.xp_reward} XP
                    </span>

                    {isFull ? (
                      <button className={styles.btnCompleted} disabled>
                        Completed
                      </button>
                    ) : item.progress > 0 ? (
                      <button className={styles.btnPrimary} onClick={() => handleActionClick(item)}>
                        Continue
                      </button>
                    ) : (
                      <button className={styles.btnOutline} onClick={() => handleActionClick(item)}>
                        {item.action_label || 'Solve Now'}
                      </button>
                    )}
                  </div>
                </div>
              );
            }) : <p className={styles.sectionSubtitle}>No daily quests available.</p>}
          </div>
        </div>
      )}

      {/* ══ 5. WEEKLY QUESTS SECTION ══ */}
      {(activeTab === 'all' || activeTab === 'weekly') && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionHeaderLeft}>
              <div className={styles.sectionIconBox} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                <BarChart3 size={18} />
              </div>
              <div>
                <h3 className={styles.sectionTitle}>Weekly Quests</h3>
                <p className={styles.sectionSubtitle}>Bigger goals for bigger rewards. Complete these within the week.</p>
              </div>
            </div>

            <div className={styles.sectionHeaderRight}>
              <span className={styles.completedBadge}>
                {weeklyQuests?.completed_count ?? 0}/{weeklyQuests?.total_count ?? 0} completed
              </span>
              <span className={styles.resetsBadge}>
                <Clock size={13} /> Resets in {weeklyQuests?.resets_in ?? '—'}
              </span>
            </div>
          </div>

          {/* 5 Weekly Quest Cards */}
          <div className={styles.fiveCardsGrid}>
            {(weeklyQuests?.items ?? []).length ? weeklyQuests!.items.map((item) => {
              const fillPct = Math.min(100, Math.round((item.progress / item.total) * 100));

              let IconComponent = Code;
              let iconBg = '#f5f3ff';
              let iconColor = '#7c3aed';

              if (item.icon === 'code') {
                IconComponent = Code;
                iconBg = '#ede9fe';
                iconColor = '#6d28d9';
              } else if (item.icon === 'chart') {
                IconComponent = BarChart3;
                iconBg = '#eff6ff';
                iconColor = '#2563eb';
              } else if (item.icon === 'layers') {
                IconComponent = Layers;
                iconBg = '#f0f9ff';
                iconColor = '#0284c7';
              } else if (item.icon === 'flame') {
                IconComponent = Flame;
                iconBg = '#fff7ed';
                iconColor = '#ea580c';
              } else if (item.icon === 'trophy') {
                IconComponent = Trophy;
                iconBg = '#fefce8';
                iconColor = '#ca8a04';
              }

              return (
                <div
                  key={item.id}
                  className={styles.weeklyQuestCard}
                  onClick={() => router.push(item.action_url || baseRoute)}
                  title={`Click to work on: ${item.title}`}
                >
                  <div className={styles.weeklyQuestCardHeader}>
                    <div className={styles.weeklyQuestLeft}>
                      <div className={styles.questCardIconBox} style={{ background: iconBg, color: iconColor }}>
                        <IconComponent size={16} strokeWidth={2.2} />
                      </div>
                      <h4 className={styles.weeklyQuestTitle}>{item.title}</h4>
                    </div>
                    <ChevronRight size={15} className={styles.weeklyQuestArrow} />
                  </div>

                  <div className={styles.questCardProgressRow}>
                    <div className={styles.progressBarTrack}>
                      <div
                        className={styles.progressBarFill}
                        style={{
                          width: `${fillPct}%`,
                          background: '#7c3aed',
                        }}
                      />
                    </div>
                  </div>

                  <div className={styles.weeklyQuestCardFooter}>
                    <span className={styles.questCardProgressText}>
                      {item.progress} / {item.total}
                    </span>
                    <span className={styles.questRewardXp}>
                      <Zap size={13} fill="#ea580c" /> +{item.xp_reward} XP
                    </span>
                  </div>
                </div>
              );
            }) : <p className={styles.sectionSubtitle}>No weekly quests available.</p>}
          </div>
        </div>
      )}

      {/* ══ 6. SKILL & ACHIEVEMENT QUESTS SECTION ══ */}
      {(activeTab === 'all' || activeTab === 'skill' || activeTab === 'achievement') && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionHeaderLeft}>
              <div className={styles.sectionIconBox} style={{ background: '#fefce8', color: '#ca8a04' }}>
                <Trophy size={18} />
              </div>
              <div>
                <h3 className={styles.sectionTitle}>Skill &amp; Achievement Quests</h3>
                <p className={styles.sectionSubtitle}>
                  Complete topic-specific and milestone quests to unlock badges and special rewards.
                </p>
              </div>
            </div>

            <button className={styles.viewAllLink} onClick={openLeaderboard}>
              View All
            </button>
          </div>

          {/* 5 Milestone Cards */}
          <div className={styles.achievementGrid}>
            {achievementQuests.slice(0, 5).map((item) => {
              const fillPct = Math.min(100, Math.round((item.progress / item.total) * 100));

              let IconComponent = Target;
              let iconBg = '#fdf4ff';
              let iconColor = '#c026d3';

              if (item.icon === 'target') {
                IconComponent = Target;
                iconBg = '#fdf4ff';
                iconColor = '#c026d3';
              } else if (item.icon === 'flame') {
                IconComponent = Flame;
                iconBg = '#fff7ed';
                iconColor = '#ea580c';
              } else if (item.icon === 'sparkles') {
                IconComponent = Sparkles;
                iconBg = '#fefce8';
                iconColor = '#eab308';
              } else if (item.icon === 'check') {
                IconComponent = Check;
                iconBg = '#f0fdf4';
                iconColor = '#16a34a';
              } else if (item.icon === 'zap') {
                IconComponent = Zap;
                iconBg = '#fff7ed';
                iconColor = '#ea580c';
              }

              return (
                <div key={item.id} className={styles.achievementCard}>
                  <div className={styles.questCardTop}>
                    <div className={styles.questCardIconBox} style={{ background: iconBg, color: iconColor }}>
                      <IconComponent size={16} strokeWidth={2.4} />
                    </div>
                    <div className={styles.questCardHeadings}>
                      <h4 className={styles.questCardTitle}>{item.title}</h4>
                      <p className={styles.questCardSubtitle}>{item.subtitle}</p>
                    </div>
                  </div>

                  {item.is_earned ? (
                    <div style={{ paddingTop: 6 }}>
                      <span className={styles.badgeEarnedPill}>
                        <Check size={12} strokeWidth={3} /> Earned
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className={styles.questCardProgressRow}>
                        <div className={styles.progressBarTrack}>
                          <div
                            className={styles.progressBarFill}
                            style={{
                              width: `${fillPct}%`,
                              background: '#7c3aed',
                            }}
                          />
                        </div>
                      </div>

                      <div className={styles.questCardFooter}>
                        <span className={styles.questCardProgressText}>
                          {item.progress} / {item.total}
                        </span>
                        <span className={styles.questRewardXp}>
                          <Zap size={13} fill="#ea580c" /> +{item.xp_reward} XP
                        </span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══ LEADERBOARD & FULL BADGES MODAL ══ */}
      {showLbModal && (
        <div className={styles.modalOverlay} onClick={() => setShowLbModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <button className={styles.modalCloseBtn} onClick={() => setShowLbModal(false)} aria-label="Close modal">
              <X size={18} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Trophy size={20} color="#7c3aed" /> Platform Leaderboard
                </h2>
                <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
                  Top problem solvers ranked by real earned XP {myRank ? `— you are #${myRank}` : ''}
                </p>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                {canViewInstitution && (
                  <button
                    onClick={() => loadLeaderboard('institution')}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 10,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: '1px solid #7c3aed',
                      background: scope === 'institution' ? '#7c3aed' : '#ffffff',
                      color: scope === 'institution' ? '#ffffff' : '#7c3aed',
                    }}
                  >
                    My Institution
                  </button>
                )}
                <button
                  onClick={() => loadLeaderboard('global')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: '1px solid #7c3aed',
                    background: scope === 'global' ? '#7c3aed' : '#ffffff',
                    color: scope === 'global' ? '#ffffff' : '#7c3aed',
                  }}
                >
                  Platform (Global)
                </button>
              </div>
            </div>

            {lbLoading ? (
              <div className={styles.loadingSpinner}>Loading leaderboard…</div>
            ) : board.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 14 }}>
                No ranked players found. Solve a problem to climb the ranks!
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '10px 12px', width: 60 }}>#</th>
                      <th style={{ padding: '10px 12px' }}>Player</th>
                      <th style={{ padding: '10px 12px' }}>Level</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Solved</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <Flame size={13} color="#ea580c" style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }} />
                        Streak
                      </th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Total XP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {board.map((e) => {
                      const medal = e.rank === 1 ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: '#fef3c7', color: '#b45309', fontWeight: 800, fontSize: 11 }}>1</span>
                      ) : e.rank === 2 ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: '#f1f5f9', color: '#475569', fontWeight: 800, fontSize: 11 }}>2</span>
                      ) : e.rank === 3 ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: '#ffedd5', color: '#c2410c', fontWeight: 800, fontSize: 11 }}>3</span>
                      ) : `#${e.rank}`;
                      return (
                        <tr
                          key={e.student_id}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: e.is_me ? 'rgba(124, 58, 237, 0.08)' : 'transparent',
                            fontWeight: e.is_me ? 700 : 400,
                          }}
                        >
                          <td style={{ padding: '10px 12px' }}>{medal}</td>
                          <td style={{ padding: '10px 12px' }}>
                            {e.name} {e.is_me ? ' (you)' : ''}
                            <span
                              style={{
                                marginLeft: 8,
                                fontSize: 11,
                                padding: '2px 8px',
                                borderRadius: 6,
                                background: e.account_type === 'institution' ? '#ede9fe' : '#f1f5f9',
                                color: e.account_type === 'institution' ? '#6d28d9' : '#64748b',
                                fontWeight: 600,
                              }}
                            >
                              {e.account_type === 'institution' ? 'Student' : 'Learner'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', color: '#64748b' }}>{e.level_name}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>{e.problems_solved}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>{e.streak_days}d</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#7c3aed' }}>
                            {e.total_xp.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Badges Catalog in Modal */}
            <div style={{ marginTop: 32 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: '#111827', marginBottom: 12 }}>
                Badges Catalog
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {BADGE_CATALOG.map((b) => (
                  <div
                    key={b.id}
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 12,
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div style={{ fontSize: 22 }}>{b.emoji}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{b.name}</div>
                    <div style={{ fontSize: 11.5, color: '#64748b' }}>{b.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ CLAIM TOAST ══ */}
      {toastMsg && (
        <div className={styles.claimToast}>
          <Sparkles size={18} color="#eab308" />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
