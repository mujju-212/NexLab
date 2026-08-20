'use client';
/**
 * QuestPage — shared XP, level, streak, and badges page
 * Used by both student and individual portals
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Zap, Flame, Trophy, CheckCircle2 } from 'lucide-react';
import styles from './PracticePages.module.css';
import { apiClient } from '@/services/api-client';

interface XP {
  total_xp: number; level: number; level_name: string;
  next_level_xp: number|null; streak_days: number;
  problems_solved: number; easy_solved: number; medium_solved: number; hard_solved: number;
}
interface Badge {
  id: string; badge_id: string; earned_at: string;
}
interface LbEntry {
  rank: number; student_id: string; name: string; account_type: 'institution'|'individual';
  total_xp: number; level: number; level_name: string;
  problems_solved: number; streak_days: number; is_me: boolean;
}

// All possible badges (catalog)
const BADGE_CATALOG = [
  { id: 'first_solve',    emoji: '🎯', name: 'First Solve',    desc: 'Solve your first problem' },
  { id: 'streak_7',       emoji: '🔥', name: '7-Day Streak',   desc: 'Maintain a 7-day streak' },
  { id: 'streak_30',      emoji: '🌟', name: '30-Day Streak',  desc: 'Maintain a 30-day streak' },
  { id: 'easy_10',        emoji: '✅', name: 'Easy Mode',      desc: 'Solve 10 Easy problems' },
  { id: 'medium_10',      emoji: '⚡', name: 'Rising Star',    desc: 'Solve 10 Medium problems' },
  { id: 'hard_5',         emoji: '💎', name: 'Diamond Coder',  desc: 'Solve 5 Hard problems' },
  { id: 'nexlab75',       emoji: '🏆', name: 'NexLab 75',      desc: 'Complete the NexLab 75 plan' },
  { id: 'beginner_path',  emoji: '🌱', name: 'Beginner',       desc: 'Complete Beginner Path plan' },
  { id: 'dp_mastery',     emoji: '🧠', name: 'DP Master',      desc: 'Complete DP Mastery plan' },
  { id: 'trees_graphs',   emoji: '🌳', name: 'Graph Explorer', desc: 'Complete Trees & Graphs plan' },
  { id: 'sql_50',         emoji: '🗄️', name: 'SQL Expert',    desc: 'Complete SQL 50 plan' },
  { id: 'century',        emoji: '💯', name: 'Centurion',      desc: 'Solve 100 problems' },
];

const LEVEL_ICONS = ['🌱', '🌿', '⚡', '🔥', '💎', '👑'];

export default function QuestPage({ baseRoute }: { baseRoute: string }) {
  const router = useRouter();
  const [xp, setXP] = useState<XP|null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);

  // Leaderboard state
  const [board, setBoard] = useState<LbEntry[]>([]);
  const [scope, setScope] = useState<'institution'|'global'>('global');
  const [canViewInstitution, setCanViewInstitution] = useState(false);
  const [myRank, setMyRank] = useState<number|null>(null);
  const [lbLoading, setLbLoading] = useState(true);

  const loadBoard = async (s: 'institution'|'global') => {
    setLbLoading(true);
    try {
      const res = await apiClient.get(`/practice/quest/leaderboard?scope=${s}`);
      setBoard(res.data.leaderboard || []);
      setMyRank(res.data.my_rank ?? null);
      setCanViewInstitution(!!res.data.can_view_institution);
      setScope(res.data.scope || s);
    } catch (e) { console.error(e); }
    finally { setLbLoading(false); }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiClient.get('/practice/quest/stats');
        setXP(res.data.xp);
        setBadges(res.data.badges || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
    // Default board: institution students see their institution board first, else global
    apiClient.get('/practice/quest/leaderboard')
      .then(res => {
        setBoard(res.data.leaderboard || []);
        setMyRank(res.data.my_rank ?? null);
        setCanViewInstitution(!!res.data.can_view_institution);
        setScope(res.data.scope || 'global');
      })
      .catch(e => console.error(e))
      .finally(() => setLbLoading(false));
  }, []);

  if (loading) return <div className={styles.loading}>Loading quest stats…</div>;

  const earnedIds = new Set(badges.map(b => b.badge_id));
  const levelIcon = xp ? LEVEL_ICONS[Math.min(xp.level - 1, LEVEL_ICONS.length - 1)] : '🌱';
  const xpPct = xp && xp.next_level_xp
    ? Math.min(100, Math.round(xp.total_xp / xp.next_level_xp * 100))
    : 100;

  return (
    <div className={styles.questPage}>
      <button className={styles.backBtn} onClick={() => router.push(baseRoute)}>
        <ArrowLeft size={14} /> Practice Library
      </button>

      <div className={styles.questHeader}>
        <h1>⚡ Quest & XP</h1>
        <p>Track your progress, maintain your streak, and earn badges</p>
      </div>

      {/* Level card */}
      <div className={styles.levelCard}>
        <div className={styles.levelIcon}>{levelIcon}</div>
        <div className={styles.levelInfo}>
          <div className={styles.levelName}>
            {xp ? `Level ${xp.level} — ${xp.level_name}` : 'Loading…'}
          </div>
          <div className={styles.levelXp}>
            {xp?.total_xp.toLocaleString()} XP total
          </div>
          <div className={styles.xpBar}>
            <div className={styles.xpFill} style={{ width: `${xpPct}%` }} />
          </div>
          {xp?.next_level_xp && (
            <div className={styles.xpToNext}>
              {(xp.next_level_xp - xp.total_xp).toLocaleString()} XP to next level
            </div>
          )}
        </div>

        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <span className={styles.statValue}>
              <Flame size={16} style={{ color: '#dc2626', verticalAlign: 'middle' }} />
              {xp?.streak_days ?? 0}
            </span>
            <span className={styles.statLabel}>Day Streak</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{xp?.problems_solved ?? 0}</span>
            <span className={styles.statLabel}>Solved</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue} style={{ color: '#15803d' }}>{xp?.easy_solved ?? 0}</span>
            <span className={styles.statLabel}>Easy</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue} style={{ color: '#a16207' }}>{xp?.medium_solved ?? 0}</span>
            <span className={styles.statLabel}>Medium</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue} style={{ color: '#b91c1c' }}>{xp?.hard_solved ?? 0}</span>
            <span className={styles.statLabel}>Hard</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{badges.length}</span>
            <span className={styles.statLabel}>Badges</span>
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className={styles.badgesSection}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div className={styles.sectionHeading} style={{ margin: 0 }}>
            <Trophy size={16} style={{ verticalAlign: 'middle', color: '#7c3aed' }} />{' '}
            Leaderboard {myRank ? `— you're #${myRank}` : ''}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {canViewInstitution && (
              <button
                onClick={() => loadBoard('institution')}
                style={{
                  padding: '5px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                  border: '1px solid #7c3aed',
                  background: scope === 'institution' ? '#7c3aed' : 'transparent',
                  color: scope === 'institution' ? '#fff' : '#7c3aed',
                }}>
                My Institution
              </button>
            )}
            <button
              onClick={() => loadBoard('global')}
              style={{
                padding: '5px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                border: '1px solid #7c3aed',
                background: scope === 'global' ? '#7c3aed' : 'transparent',
                color: scope === 'global' ? '#fff' : '#7c3aed',
              }}>
              Platform (Global)
            </button>
          </div>
        </div>

        {lbLoading ? (
          <div className={styles.loading}>Loading leaderboard…</div>
        ) : board.length === 0 ? (
          <div style={{ padding: 16, color: '#6b7280', fontSize: 14 }}>No ranked players yet — solve a problem to appear here.</div>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '8px 10px', width: 56 }}>#</th>
                  <th style={{ padding: '8px 10px' }}>Player</th>
                  <th style={{ padding: '8px 10px' }}>Level</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Solved</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>🔥</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>XP</th>
                </tr>
              </thead>
              <tbody>
                {board.map(e => {
                  const medal = e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : e.rank;
                  return (
                    <tr key={e.student_id}
                      style={{
                        borderBottom: '1px solid #f3f4f6',
                        background: e.is_me ? 'rgba(124,58,237,0.08)' : 'transparent',
                        fontWeight: e.is_me ? 600 : 400,
                      }}>
                      <td style={{ padding: '8px 10px' }}>{medal}</td>
                      <td style={{ padding: '8px 10px' }}>
                        {e.name}{e.is_me ? ' (you)' : ''}
                        {scope === 'global' && (
                          <span style={{
                            marginLeft: 6, fontSize: 11, padding: '1px 6px', borderRadius: 6,
                            background: e.account_type === 'institution' ? '#ede9fe' : '#f3f4f6',
                            color: e.account_type === 'institution' ? '#6d28d9' : '#6b7280',
                          }}>
                            {e.account_type === 'institution' ? 'Student' : 'Individual'}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px 10px', color: '#6b7280' }}>{e.level_name}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>{e.problems_solved}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>{e.streak_days}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{e.total_xp.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Badges */}
      <div className={styles.badgesSection}>
        <div className={styles.sectionHeading}>Badges ({badges.length}/{BADGE_CATALOG.length})</div>
        <div className={styles.badgeGrid}>
          {BADGE_CATALOG.map(b => {
            const earned = earnedIds.has(b.id);
            const earnedBadge = badges.find(x => x.badge_id === b.id);
            return (
              <div key={b.id} className={`${styles.badgeCard} ${earned ? '' : styles.locked}`}>
                <span className={styles.badgeEmoji}>{b.emoji}</span>
                <div className={styles.badgeName}>{b.name}</div>
                <div className={styles.badgeDesc}>{b.desc}</div>
                {earned && earnedBadge && (
                  <div className={styles.badgeEarned}>
                    <CheckCircle2 size={11} style={{ verticalAlign: 'middle' }} />
                    {' '}Earned
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
