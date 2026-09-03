'use client';

/**
 * Public achievement showcase — /u/<slug>
 * No auth, no shell: a share card anyone can open.
 * Respects the owner's opt-out (404 when private).
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Zap, Flame, Trophy, Target, CheckCircle2, Copy, Lock } from 'lucide-react';

interface ShowcaseData {
  display_name: string;
  xp: {
    total_xp: number; level: number; level_name: string;
    streak_days: number; problems_solved: number;
    easy: number; medium: number; hard: number;
  };
  badges: Array<{ badge_id: string; [k: string]: unknown }>;
  recent_solves: Array<{ title: string; slug: string | null; difficulty: string | null; solved_at: string | null }>;
}

export default function PublicShowcasePage() {
  const [data, setData] = useState<ShowcaseData | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'private'>('loading');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const slug = window.location.pathname.split('/').pop();
    if (!slug) { setState('private'); return; }
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/practice/showcase/${slug}`)
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(d => { setData(d); setState('ok'); })
      .catch(() => setState('private'));
  }, []);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* clipboard unavailable */ }
  };

  if (state === 'loading') {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#170f26,#2b1f42)', color: '#c9c2d8', fontFamily: "'Manrope', sans-serif" }}>
        Loading…
      </main>
    );
  }

  if (state === 'private' || !data) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#170f26,#2b1f42)', color: '#fff', fontFamily: "'Manrope', sans-serif", textAlign: 'center', padding: 24 }}>
        <div>
          <Lock size={36} style={{ margin: '0 auto 14px', color: '#8b7fa8' }} />
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>This profile is private</h1>
          <p style={{ fontSize: 14, color: '#8b7fa8' }}>The user has not made their achievements public.</p>
          <Link href="/practice/dashboard" style={{ color: '#a78bfa', fontSize: 14 }}>← Back to NexLab</Link>
        </div>
      </main>
    );
  }

  const { xp, badges, recent_solves, display_name } = data;
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  const cardWidth = Math.min(560, isMobile ? window.innerWidth - 32 : 560);

  return (
    <main style={{
      minHeight: '100vh', background: 'linear-gradient(135deg,#170f26,#2b1f42)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      fontFamily: "'Manrope', sans-serif",
    }}>
      <div style={{ width: cardWidth, maxWidth: '100%' }}>
        {/* Share card */}
        <div style={{
          background: 'rgba(255,255,255,0.97)', borderRadius: 24, overflow: 'hidden',
          boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
        }}>
          <div style={{
            background: 'linear-gradient(135deg,#7c3aed,#9333ea)', padding: '26px 28px', color: '#fff',
          }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: 4, opacity: 0.85 }}>NEXLAB PRACTICE</p>
            <h1 style={{ margin: '8px 0 2px', fontSize: 26, fontWeight: 800 }}>{display_name}</h1>
            <p style={{ margin: 0, fontSize: 14, opacity: 0.9 }}>{xp.level_name} · Level {xp.level}</p>
          </div>

          <div style={{ padding: '22px 28px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
              {[
                { Icon: Zap, label: 'Total XP', value: xp.total_xp.toLocaleString(), color: '#d97706' },
                { Icon: Target, label: 'Problems Solved', value: xp.problems_solved, color: '#7c3aed' },
                { Icon: Flame, label: 'Current Streak', value: `${xp.streak_days}d`, color: '#dc2626' },
                { Icon: Trophy, label: 'Badges', value: badges.length, color: '#059669' },
              ].map(s => (
                <div key={s.label} style={{ background: '#faf9ff', borderRadius: 14, padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <s.Icon size={14} color={s.color} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#9891a6', textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</span>
                  </div>
                  <span style={{ fontSize: 20, fontWeight: 800, color: '#201b2e' }}>{s.value}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
              {[
                ['Easy', xp.easy, '#059669'], ['Medium', xp.medium, '#d97706'], ['Hard', xp.hard, '#dc2626'],
              ].map(([label, n, color]) => (
                <div key={label as string} style={{ flex: 1, textAlign: 'center', background: '#faf9ff', borderRadius: 10, padding: '8px 0' }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: color as string }}>{n}</span>
                  <span style={{ display: 'block', fontSize: 10.5, color: '#9891a6', fontWeight: 700, textTransform: 'uppercase' }}>{label}</span>
                </div>
              ))}
            </div>

            {recent_solves.length > 0 && (
              <>
                <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#9891a6', textTransform: 'uppercase', letterSpacing: '.05em' }}>Recent solves</p>
                {recent_solves.slice(0, 4).map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid #f3f0fa' }}>
                    <CheckCircle2 size={14} color="#059669" />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#201b2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                    <span style={{ fontSize: 11, color: '#9891a6' }}>{s.difficulty}</span>
                  </div>
                ))}
              </>
            )}

            {badges.length > 0 && (
              <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {badges.map(b => (
                  <span key={b.badge_id} style={{
                    fontSize: 11, fontWeight: 700, color: '#7c3aed',
                    background: 'rgba(124,58,237,.09)', borderRadius: 999, padding: '4px 11px',
                  }}>
                    🏅 {(b.label as string) ?? (b.badge_id as string).replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 18 }}>
          <button onClick={copyLink} style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px',
            borderRadius: 12, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.08)',
            color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
          }}>
            <Copy size={14} /> {copied ? 'Link copied!' : 'Share this profile'}
          </button>
          <Link href="/practice/dashboard" style={{ color: '#a78bfa', fontSize: 14, display: 'flex', alignItems: 'center' }}>
            ← NexLab
          </Link>
        </div>
      </div>
    </main>
  );
}
