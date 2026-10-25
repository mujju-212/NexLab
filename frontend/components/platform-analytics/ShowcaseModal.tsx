'use client';

import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Globe, Lock, Share2, Sparkles, ExternalLink } from 'lucide-react';
import { platformUserService } from '@/services/platform-user.service';
import styles from './platform-analytics.module.css';

interface ShowcaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPublic: boolean;
  initialSlug: string | null;
  userName: string;
  rating: number;
  level: number;
  levelName: string;
  streakDays: number;
  badgesCount: number;
}

export const ShowcaseModal: React.FC<ShowcaseModalProps> = ({
  isOpen,
  onClose,
  initialPublic,
  initialSlug,
  userName,
  rating,
  level,
  levelName,
  streakDays,
  badgesCount,
}) => {
  const [isPublic, setIsPublic] = useState(initialPublic);
  const [slug, setSlug] = useState(initialSlug);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsPublic(initialPublic);
      setSlug(initialSlug);
    }
  }, [isOpen, initialPublic, initialSlug]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const publicUrl = typeof window !== 'undefined' && slug ? `${window.location.origin}/u/${slug}` : slug ? `/u/${slug}` : '';

  const handleToggle = async (checked: boolean) => {
    setLoading(true);
    try {
      const res = await platformUserService.toggleShowcase(checked);
      setIsPublic(res.profile_public);
      if (res.profile_slug) {
        setSlug(res.profile_slug);
      }
    } catch (e) {
      console.error('Failed to toggle showcase status', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
    }
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{ width: 34, height: 34, borderRadius: '0.5rem', background: '#ede9fe', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Share2 size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>Public Achievement Showcase</h3>
              <p style={{ margin: '0.1rem 0 0', fontSize: '0.775rem', color: '#64748b' }}>Share your verified platform standing & achievements</p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Visibility Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: '#f8fafc', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {isPublic ? <Globe size={20} color="#10b981" /> : <Lock size={20} color="#64748b" />}
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a' }}>
                {isPublic ? 'Public Showcase Active' : 'Private Profile'}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                {isPublic ? 'Anyone with the share link can view your rank card' : 'Only you can see your analytics data'}
              </div>
            </div>
          </div>

          <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isPublic}
              disabled={loading}
              onChange={(e) => handleToggle(e.target.checked)}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 9999,
                background: isPublic ? '#7c3aed' : '#cbd5e1',
                transition: 'background 0.2s ease',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  left: isPublic ? 22 : 2,
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: '#fff',
                  transition: 'left 0.2s ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }}
              />
            </span>
          </label>
        </div>

        {/* Share Link Box (when active) */}
        {isPublic && slug && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Your Shareable Portfolio Link
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                readOnly
                value={publicUrl}
                style={{
                  flex: 1,
                  padding: '0.6rem 0.85rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  fontSize: '0.85rem',
                  color: '#334155',
                  fontFamily: 'monospace',
                }}
              />
              <button
                onClick={handleCopy}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.6rem 1rem',
                  borderRadius: '0.5rem',
                  background: copied ? '#10b981' : '#7c3aed',
                  color: '#fff',
                  border: 'none',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'background 0.2s ease',
                }}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {/* Card Live Preview */}
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '1rem', overflow: 'hidden', background: '#faf8ff' }}>
          <div style={{ background: 'linear-gradient(135deg, #7c3aed, #9333ea)', padding: '1rem 1.25rem', color: '#fff' }}>
            <span style={{ fontSize: '0.675rem', fontWeight: 800, letterSpacing: '0.1em', opacity: 0.8 }}>NEXLAB PLATFORM ATHLETE</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, marginTop: '0.2rem' }}>{userName}</div>
            <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>Level {level} · {levelName}</div>
          </div>
          <div style={{ padding: '1rem 1.25rem', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', textAlign: 'center' }}>
            <div style={{ background: '#fff', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #ede9fe' }}>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Rating</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#7c3aed' }}>{Math.round(rating)}</div>
            </div>
            <div style={{ background: '#fff', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #fee2e2' }}>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Streak</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ef4444' }}>{streakDays}d 🔥</div>
            </div>
            <div style={{ background: '#fff', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #fef3c7' }}>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Badges</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#b45309' }}>{badgesCount} 🏅</div>
            </div>
          </div>
        </div>

        {/* Bottom Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.5rem' }}>
          {isPublic && slug && (
            <a
              href={`/u/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.85rem',
                fontWeight: 700,
                color: '#7c3aed',
                textDecoration: 'none',
                padding: '0.5rem 0.75rem',
              }}
            >
              Open Live Showcase <ExternalLink size={14} />
            </a>
          )}
          <button
            onClick={onClose}
            style={{
              padding: '0.55rem 1.25rem',
              borderRadius: '0.5rem',
              background: '#0f172a',
              color: '#fff',
              border: 'none',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
