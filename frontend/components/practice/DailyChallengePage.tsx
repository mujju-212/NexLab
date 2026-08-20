'use client';
/**
 * DailyChallengePage — shared, used by both portals
 * Shows today's problem + a 30-day history calendar
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Flame } from 'lucide-react';
import styles from './PracticePages.module.css';
import { apiClient } from '@/services/api-client';

interface DailyProblem {
  slug: string; title: string; difficulty: string;
  nexlab_topic: string; acceptance: number;
}

function diffClass(d: string) {
  if (d === 'Easy') return 'easy';
  if (d === 'Medium') return 'medium';
  return 'hard';
}

/* Mini badge inline styles (avoid extra CSS) */
const DIFF_STYLE: Record<string, React.CSSProperties> = {
  Easy:   { background: 'rgba(22,163,74,.1)',  color: '#15803d' },
  Medium: { background: 'rgba(234,179,8,.12)', color: '#a16207' },
  Hard:   { background: 'rgba(220,38,38,.1)',  color: '#b91c1c' },
};

export default function DailyChallengePage({ baseRoute }: { baseRoute: string }) {
  const router = useRouter();
  const [daily, setDaily] = useState<DailyProblem | null>(null);
  const [solved, setSolved] = useState(false);
  const [date, setDate] = useState('');
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [dailyRes, xpRes] = await Promise.all([
          apiClient.get('/practice/daily'),
          apiClient.get('/practice/quest/stats'),
        ]);
        setDaily(dailyRes.data.daily);
        setSolved(dailyRes.data.solved_today || false);
        setDate(dailyRes.data.date || '');
        setStreak(xpRes.data.xp?.streak_days || 0);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  if (loading) return <div className={styles.loading}>Loading daily challenge…</div>;

  const formattedDate = date
    ? new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  return (
    <div className={styles.dailyPage}>
      <button className={styles.backBtn} onClick={() => router.push(baseRoute)}>
        <ArrowLeft size={14} /> Practice Library
      </button>

      <div className={styles.dailyHeader}>
        <h1>🔥 Daily Challenge</h1>
        <p>Solve one problem every day to keep your streak alive</p>
        {formattedDate && <div className={styles.dailyDate}>{formattedDate}</div>}
      </div>

      {/* Streak strip */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        background: 'rgba(220,38,38,.06)',
        border: '1px solid rgba(220,38,38,.15)',
        borderRadius: '14px',
        padding: '.9rem 1.2rem',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
      }}>
        <Flame size={24} color="#dc2626" />
        <div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#201b2e', fontFamily: 'Space Grotesk, sans-serif', lineHeight: 1.1 }}>
            {streak}
          </div>
          <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#9891a6' }}>Day Streak</div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: '.82rem', fontWeight: 700, color: streak > 0 ? '#15803d' : '#9891a6' }}>
          {streak === 0
            ? 'Start your streak today!'
            : streak >= 30
            ? '🌟 Incredible streak!'
            : streak >= 7
            ? '🔥 Keep it up!'
            : 'Great start!'}
        </div>
      </div>

      {/* Daily problem card */}
      {daily ? (
        <div style={{
          background: 'rgba(255,255,255,.65)',
          border: '1px solid rgba(255,255,255,.7)',
          borderRadius: '20px',
          padding: '1.6rem 1.8rem',
          boxShadow: '0 4px 20px rgba(30,20,60,.07)',
        }}>
          <div style={{ fontSize: '.7rem', fontWeight: 800, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '.65rem', fontFamily: 'Space Grotesk, sans-serif' }}>
            Today's Problem
          </div>

          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#201b2e', fontFamily: 'Space Grotesk, sans-serif', margin: '0 0 .65rem', letterSpacing: '-.01em' }}>
            {daily.title}
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap', marginBottom: '1.2rem' }}>
            <span style={{ ...DIFF_STYLE[daily.difficulty], fontSize: '.72rem', fontWeight: 800, padding: '.2rem .6rem', borderRadius: '7px', fontFamily: 'Space Grotesk, sans-serif' }}>
              {daily.difficulty}
            </span>
            <span style={{ background: 'rgba(124,58,237,.09)', color: '#7c3aed', fontSize: '.72rem', fontWeight: 700, padding: '.2rem .6rem', borderRadius: '7px' }}>
              {daily.nexlab_topic}
            </span>
            <span style={{ color: '#9891a6', fontSize: '.75rem', fontWeight: 600 }}>
              Acceptance: {Math.round((daily.acceptance || 0) * 100)}%
            </span>
          </div>

          {solved ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '.75rem',
              background: 'rgba(22,163,74,.07)', border: '1px solid rgba(22,163,74,.18)',
              borderRadius: '12px', padding: '1rem 1.2rem',
            }}>
              <span style={{ fontSize: '1.5rem' }}>✅</span>
              <div>
                <div style={{ fontWeight: 800, color: '#15803d', fontFamily: 'Space Grotesk, sans-serif' }}>
                  Already solved! +15 XP earned
                </div>
                <div style={{ fontSize: '.78rem', color: '#9891a6', fontWeight: 600, marginTop: '.2rem' }}>
                  Come back tomorrow for a new challenge
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => router.push(`${baseRoute}/${daily.slug}`)}
              style={{
                background: 'linear-gradient(135deg, #dc2626, #f97316)',
                color: '#fff',
                fontWeight: 800,
                fontSize: '.9rem',
                padding: '.7rem 1.6rem',
                borderRadius: '11px',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'Manrope, sans-serif',
                transition: 'opacity .15s, transform .15s',
                boxShadow: '0 4px 14px rgba(220,38,38,.3)',
              }}
              onMouseEnter={e => { (e.target as HTMLButtonElement).style.opacity = '.88'; }}
              onMouseLeave={e => { (e.target as HTMLButtonElement).style.opacity = '1'; }}
            >
              Solve Today's Challenge +15 XP →
            </button>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', color: '#9891a6', padding: '3rem', fontWeight: 600 }}>
          No daily challenge available today. Check back soon!
        </div>
      )}

      {/* Tip */}
      <div style={{
        marginTop: '1.5rem',
        background: 'rgba(124,58,237,.06)',
        border: '1px solid rgba(124,58,237,.12)',
        borderRadius: '12px',
        padding: '.9rem 1.1rem',
        fontSize: '.8rem',
        color: '#6b21a8',
        fontWeight: 600,
        lineHeight: 1.6,
      }}>
        💡 <strong>Tip:</strong> Daily problems rotate at midnight UTC. Solving it within the day awards +15 bonus XP on top of the base reward.
      </div>
    </div>
  );
}
