'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Terminal,
  Copy,
  Check,
  ExternalLink,
  Code2,
  Calendar,
  User,
  ArrowRight,
  Share2,
  Play,
  Lock,
} from 'lucide-react';
import { practiceExtraService } from '@/services/practice-extra.service';

interface SharedSessionData {
  title: string;
  language: string;
  code: string;
  stdin_data?: string;
  author_name?: string;
  updated_at?: string;
}

export default function SharedPlaygroundPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params?.slug;

  const [session, setSession] = useState<SharedSessionData | null>(null);
  const [author, setAuthor] = useState<string>('NexLab Developer');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  useEffect(() => {
    if (!slug) {
      setError(true);
      setLoading(false);
      return;
    }

    practiceExtraService
      .getSharedPlayground(slug)
      .then((res: any) => {
        if (res && res.session) {
          setSession(res.session);
          setAuthor(res.session.author_name || res.author || 'NexLab Developer');
        } else {
          setError(true);
        }
      })
      .catch(() => {
        setError(true);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [slug]);

  const handleCopyCode = async () => {
    if (!session?.code) return;
    try {
      await navigator.clipboard.writeText(session.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {}
  };

  const handleCopyLink = async () => {
    if (typeof window === 'undefined') return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {}
  };

  const handleForkInPlayground = () => {
    if (!session) return;
    try {
      const lang = session.language || 'python';
      localStorage.setItem(`playground_draft_${lang}`, session.code || '');
      if (session.stdin_data) {
        localStorage.setItem(`playground_stdin_${lang}`, session.stdin_data);
      }
      localStorage.setItem('playground_lang', lang);
    } catch {}
    router.push('/practice/playground');
  };

  if (loading) {
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
          <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Loading shared code session…</span>
        </div>
      </main>
    );
  }

  if (error || !session) {
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
            <Lock size={26} />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 0.5rem' }}>Session Not Found or Private</h2>
          <p style={{ fontSize: '0.875rem', color: '#94a3b8', lineHeight: 1.5, margin: '0 0 1.5rem' }}>
            This playground code session may have been deleted, unshared by the author, or never existed.
          </p>
          <Link
            href="/practice/playground"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              borderRadius: 12,
              background: '#7c3aed',
              color: '#fff',
              fontSize: '0.875rem',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            <Terminal size={15} /> Open NexLab Playground
          </Link>
        </div>
      </main>
    );
  }

  const lines = (session.code || '').split('\n');

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#090d16',
        color: '#f8fafc',
        fontFamily: "'Inter', -apple-system, sans-serif",
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top Navbar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(15, 23, 42, 0.8)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link
            href="/practice/playground"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              textDecoration: 'none',
              color: '#fff',
              fontWeight: 800,
              fontSize: '1rem',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="NexLab" style={{ width: 28, height: 28, borderRadius: 6 }} />
            <span>NexLab</span>
          </Link>
          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.9rem' }}>/</span>
          <span style={{ color: '#94a3b8', fontSize: '0.875rem', fontWeight: 600 }}>Shared Playground</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={handleCopyLink}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#f1f5f9',
              padding: '7px 14px',
              borderRadius: 10,
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {copiedLink ? <Check size={14} color="#10b981" /> : <Share2 size={14} />}
            <span>{copiedLink ? 'Link Copied!' : 'Share Link'}</span>
          </button>

          <button
            onClick={handleForkInPlayground}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
              border: 'none',
              color: '#fff',
              padding: '7px 16px',
              borderRadius: 10,
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 10px rgba(124, 58, 237, 0.35)',
            }}
          >
            <Play size={13} fill="#fff" />
            <span>Fork in Playground</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div style={{ flex: 1, maxWidth: 1100, width: '100%', margin: '0 auto', padding: '28px 24px' }}>
        {/* Session Metadata Card */}
        <div
          style={{
            background: 'rgba(30, 41, 59, 0.45)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 16,
            padding: '20px 24px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <h1 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, color: '#fff' }}>
                {session.title || 'Untitled Session'}
              </h1>
              <span
                style={{
                  background: 'rgba(124, 58, 237, 0.18)',
                  color: '#c4b5fd',
                  border: '1px solid rgba(124, 58, 237, 0.3)',
                  padding: '3px 10px',
                  borderRadius: 20,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                {session.language || 'python'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: '0.82rem', color: '#94a3b8' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <User size={13} />
                Shared by <strong style={{ color: '#e2e8f0' }}>{author}</strong>
              </span>
              <span>•</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Code2 size={13} />
                {lines.length} lines ({((session.code?.length || 0) / 1024).toFixed(1)} KB)
              </span>
            </div>
          </div>

          <button
            onClick={handleCopyCode}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#f8fafc',
              padding: '8px 16px',
              borderRadius: 10,
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {copiedCode ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
            <span>{copiedCode ? 'Copied Code!' : 'Copy Code'}</span>
          </button>
        </div>

        {/* Code Display Card */}
        <div
          style={{
            background: '#0d1117',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 16,
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
          }}
        >
          {/* Editor Header Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 18px',
              background: '#161b22',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56' }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#27c93f' }} />
              </div>
              <span style={{ fontSize: '0.8rem', color: '#8b949e', marginLeft: 8, fontFamily: 'monospace' }}>
                {session.title || 'main'}.{session.language === 'python' ? 'py' : session.language === 'javascript' ? 'js' : session.language}
              </span>
            </div>

            <span style={{ fontSize: '0.75rem', color: '#6e7681', fontWeight: 600 }}>READ-ONLY PREVIEW</span>
          </div>

          {/* Code Lines with line numbers */}
          <div
            style={{
              display: 'flex',
              fontFamily: "'Fira Code', 'JetBrains Mono', Consolas, monospace",
              fontSize: '13.5px',
              lineHeight: '1.6',
              overflowX: 'auto',
              padding: '16px 0',
            }}
          >
            {/* Line numbers gutter */}
            <div
              style={{
                userSelect: 'none',
                textAlign: 'right',
                paddingRight: '16px',
                paddingLeft: '18px',
                color: '#484f58',
                borderRight: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              {lines.map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>

            {/* Code Body */}
            <pre
              style={{
                margin: 0,
                paddingLeft: '16px',
                paddingRight: '18px',
                flex: 1,
                color: '#e6edf3',
                overflowX: 'auto',
              }}
            >
              <code>{session.code}</code>
            </pre>
          </div>
        </div>

        {/* Stdin Data if Present */}
        {session.stdin_data && (
          <div
            style={{
              marginTop: 20,
              background: '#0d1117',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 14,
              padding: 16,
            }}
          >
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#8b949e', textTransform: 'uppercase' }}>
              Standard Input (stdin)
            </span>
            <pre
              style={{
                margin: '8px 0 0',
                padding: '10px 14px',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: 8,
                fontSize: '0.85rem',
                color: '#94a3b8',
                fontFamily: 'monospace',
              }}
            >
              {session.stdin_data}
            </pre>
          </div>
        )}
      </div>
    </main>
  );
}
