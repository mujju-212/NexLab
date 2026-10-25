'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Zap,
  Flame,
  Trophy,
  Target,
  CheckCircle2,
  Copy,
  Lock,
  ExternalLink,
  Award,
  Compass,
  ArrowRight,
  ShieldCheck,
  Code2,
} from 'lucide-react';
import { platformUserService, type PlatformShowcaseData } from '@/services/platform-user.service';

export default function PublicShowcasePage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;

  const [data, setData] = useState<PlatformShowcaseData | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'private'>('loading');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!slug) {
      setState('private');
      return;
    }

    platformUserService
      .getShowcase(slug)
      .then((res) => {
        setData(res);
        setState('ok');
      })
      .catch(() => {
        setState('private');
      });
  }, [slug]);

  const copyLink = async () => {
    if (typeof window === 'undefined') return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // clipboard fallback
    }
  };

  if (state === 'loading') {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0b0f19 0%, #1e1b4b 100%)',
          color: '#c4b5fd',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              border: '3px solid rgba(124, 58, 237, 0.3)',
              borderTopColor: '#7c3aed',
              animation: 'spin 1s linear infinite',
            }}
          />
          <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Loading verified athlete profile…</span>
        </div>
      </main>
    );
  }

  if (state === 'private' || !data) {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0b0f19 0%, #1e1b4b 100%)',
          color: '#fff',
          fontFamily: "'Inter', -apple-system, sans-serif",
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            maxWidth: 420,
            background: 'rgba(255, 255, 255, 0.04)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 24,
            padding: '2.5rem 2rem',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem',
            }}
          >
            <Lock size={28} />
          </div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 0.5rem' }}>This Profile is Private</h1>
          <p style={{ fontSize: '0.875rem', color: '#94a3b8', lineHeight: 1.5, margin: '0 0 1.5rem' }}>
            The athlete has made their statistics private, or this profile link is no longer active.
          </p>
          <Link
            href="/practice/dashboard"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: '#7c3aed',
              color: '#fff',
              padding: '0.65rem 1.25rem',
              borderRadius: '0.625rem',
              fontWeight: 700,
              fontSize: '0.85rem',
              textDecoration: 'none',
            }}
          >
            ← Explore NexLab Practice
          </Link>
        </div>
      </main>
    );
  }

  const { standing, badges, top_topics, recent_solves, display_name } = data;
  const initials = display_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'NL';

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #090d16 0%, #151128 50%, #1e1b4b 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div style={{ maxWidth: 620, width: '100%' }}>
        {/* Profile Card Container */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 24,
            overflow: 'hidden',
            boxShadow: '0 30px 90px -20px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.1)',
          }}
        >
          {/* Header Banner */}
          <div
            style={{
              background: 'linear-gradient(135deg, #6d28d9 0%, #7c3aed 50%, #9333ea 100%)',
              padding: '2rem',
              color: '#fff',
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <ShieldCheck size={16} color="#34d399" />
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: '#a7f3d0',
                  }}
                >
                  VERIFIED PLATFORM ATHLETE
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  background: 'rgba(0, 0, 0, 0.25)',
                  padding: '0.3rem 0.65rem',
                  borderRadius: 9999,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
              >
                <Flame size={14} color="#f87171" />
                <span>{standing.streak_days}d Streak</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
              <div
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: '50%',
                  background: '#fff',
                  color: '#7c3aed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.4rem',
                  fontWeight: 900,
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
                  flexShrink: 0,
                }}
              >
                {initials}
              </div>

              <div>
                <h1 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                  {display_name}
                </h1>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: '#e9d5ff', fontWeight: 600 }}>
                  {standing.level_name} · Level {standing.level}
                </p>
              </div>
            </div>
          </div>

          {/* Body Section */}
          <div style={{ padding: '1.75rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Primary Metrics Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.85rem' }}>
              <div style={{ background: '#faf8ff', borderRadius: 14, padding: '1rem', border: '1px solid #ede9fe' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#7c3aed', marginBottom: '0.3rem' }}>
                  <Award size={15} />
                  <span style={{ fontSize: '0.725rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Platform Rating
                  </span>
                </div>
                <div style={{ fontSize: '1.65rem', fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>
                  {Math.round(standing.rating).toLocaleString()}
                </div>
                <div style={{ fontSize: '0.725rem', color: '#059669', fontWeight: 700, marginTop: '0.35rem' }}>
                  Top {Math.max(1, 100 - Math.round(standing.global_percentile))}% Globally
                </div>
              </div>

              <div style={{ background: '#faf8ff', borderRadius: 14, padding: '1rem', border: '1px solid #ede9fe' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#d97706', marginBottom: '0.3rem' }}>
                  <Zap size={15} />
                  <span style={{ fontSize: '0.725rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Experience & Solves
                  </span>
                </div>
                <div style={{ fontSize: '1.65rem', fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>
                  {standing.problems_solved} <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 600 }}>solved</span>
                </div>
                <div style={{ fontSize: '0.725rem', color: '#64748b', fontWeight: 600, marginTop: '0.35rem' }}>
                  {standing.total_xp.toLocaleString()} XP Earned
                </div>
              </div>
            </div>

            {/* Solved Breakdown Chips */}
            <div style={{ display: 'flex', gap: '0.65rem' }}>
              <div style={{ flex: 1, textAlign: 'center', background: '#ecfdf5', borderRadius: 10, padding: '0.6rem 0', border: '1px solid #a7f3d0' }}>
                <span style={{ display: 'block', fontSize: '1.15rem', fontWeight: 800, color: '#059669' }}>
                  {standing.easy_solved}
                </span>
                <span style={{ fontSize: '0.675rem', fontWeight: 700, color: '#047857', textTransform: 'uppercase' }}>Easy</span>
              </div>
              <div style={{ flex: 1, textAlign: 'center', background: '#fffbeb', borderRadius: 10, padding: '0.6rem 0', border: '1px solid #fde68a' }}>
                <span style={{ display: 'block', fontSize: '1.15rem', fontWeight: 800, color: '#d97706' }}>
                  {standing.medium_solved}
                </span>
                <span style={{ fontSize: '0.675rem', fontWeight: 700, color: '#b45309', textTransform: 'uppercase' }}>Medium</span>
              </div>
              <div style={{ flex: 1, textAlign: 'center', background: '#fef2f2', borderRadius: 10, padding: '0.6rem 0', border: '1px solid #fecaca' }}>
                <span style={{ display: 'block', fontSize: '1.15rem', fontWeight: 800, color: '#dc2626' }}>
                  {standing.hard_solved}
                </span>
                <span style={{ fontSize: '0.675rem', fontWeight: 700, color: '#b91c1c', textTransform: 'uppercase' }}>Hard</span>
              </div>
            </div>

            {/* Top Topic Mastery */}
            {top_topics && top_topics.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.65rem' }}>
                  <Compass size={15} color="#7c3aed" />
                  <span style={{ fontSize: '0.775rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>
                    Verified Topic Proficiencies
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {top_topics.slice(0, 4).map((t) => (
                    <div key={t.topic} style={{ background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                        <span style={{ color: '#0f172a' }}>{t.topic}</span>
                        <span style={{ color: '#7c3aed' }}>{Math.round(t.strength)}%</span>
                      </div>
                      <div style={{ height: 6, background: '#e2e8f0', borderRadius: 9999, overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            background: 'linear-gradient(90deg, #7c3aed, #9333ea)',
                            width: `${Math.min(100, t.strength)}%`,
                            borderRadius: 9999,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Badges Shelf */}
            {badges && badges.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.65rem' }}>
                  <Trophy size={15} color="#d97706" />
                  <span style={{ fontSize: '0.775rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>
                    Earned Badges ({badges.length})
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {badges.map((b) => (
                    <div
                      key={b.badge_id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        background: '#faf8ff',
                        border: '1px solid #ede9fe',
                        padding: '0.35rem 0.75rem',
                        borderRadius: 9999,
                        fontSize: '0.775rem',
                        fontWeight: 700,
                        color: '#6d28d9',
                      }}
                    >
                      <span>🏅</span>
                      <span>{b.title || b.badge_id.replace(/_/g, ' ')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Solves */}
            {recent_solves && recent_solves.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.65rem' }}>
                  <Code2 size={15} color="#059669" />
                  <span style={{ fontSize: '0.775rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>
                    Recent Solved Problems
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {recent_solves.slice(0, 4).map((s, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.55rem 0.75rem',
                        background: '#f8fafc',
                        borderRadius: 8,
                        fontSize: '0.8rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <CheckCircle2 size={14} color="#10b981" />
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>{s.title}</span>
                      </div>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.45rem',
                          borderRadius: 4,
                          background:
                            s.difficulty === 'Easy'
                              ? '#ecfdf5'
                              : s.difficulty === 'Medium'
                              ? '#fffbeb'
                              : '#fef2f2',
                          color:
                            s.difficulty === 'Easy'
                              ? '#059669'
                              : s.difficulty === 'Medium'
                              ? '#d97706'
                              : '#dc2626',
                        }}
                      >
                        {s.difficulty}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '1.5rem',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <button
            onClick={copyLink}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.65rem 1.15rem',
              borderRadius: 12,
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#fff',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            <Copy size={15} />
            <span>{copied ? 'Link Copied!' : 'Copy Share Link'}</span>
          </button>

          <Link
            href="/practice/dashboard"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              color: '#c4b5fd',
              fontSize: '0.85rem',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            <span>Practice on NexLab</span>
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </main>
  );
}
