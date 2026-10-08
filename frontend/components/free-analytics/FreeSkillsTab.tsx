'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Compass,
  Search,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  TrendingUp,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import type { FreeTopicMasteryItem, FreeRecommendation } from '@/services/free.service';
import styles from './free-analytics.module.css';

interface FreeSkillsTabProps {
  topicStrength: FreeTopicMasteryItem[];
  recommendations?: FreeRecommendation[];
}

export const FreeSkillsTab: React.FC<FreeSkillsTabProps> = ({
  topicStrength = [],
  recommendations = [],
}) => {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [bandFilter, setBandFilter] = useState<string>('all');

  const filteredTopics = topicStrength.filter((t) => {
    const matchesSearch = t.topic.toLowerCase().includes(search.toLowerCase());
    const matchesBand = bandFilter === 'all' || t.band === bandFilter;
    return matchesSearch && matchesBand;
  });

  const bandColor = (band: string) => {
    switch (band) {
      case 'Mastered':
        return { bg: '#ecfdf5', text: '#059669', border: '#a7f3d0' };
      case 'Proficient':
        return { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' };
      case 'Learning':
        return { bg: '#fffbeb', text: '#d97706', border: '#fde68a' };
      default:
        return { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* ── 1. Top Strip: Targeted Recommendations ───────────────────────── */}
      {recommendations.length > 0 && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleWrap}>
              <div className={styles.cardIconBox} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                <Sparkles size={20} />
              </div>
              <div>
                <h3 className={styles.cardTitle}>Skill Reinforcement Targets</h3>
                <p className={styles.cardSubtitle}>
                  Curated problems addressing your lowest accuracy and mastery areas
                </p>
              </div>
            </div>
          </div>

          <div className={styles.recGrid}>
            {recommendations.map((r) => (
              <div key={r.id} className={styles.recCard}>
                <div className={styles.recTop}>
                  <div>
                    <h4 className={styles.recTitle}>{r.title}</h4>
                    <p className={styles.recReason}>{r.reason}</p>
                  </div>
                  <span
                    className={styles.diffChip}
                    style={{
                      background:
                        r.difficulty === 'Easy'
                          ? '#ecfdf5'
                          : r.difficulty === 'Medium'
                          ? '#fffbeb'
                          : '#fef2f2',
                      color:
                        r.difficulty === 'Easy'
                          ? '#059669'
                          : r.difficulty === 'Medium'
                          ? '#b45309'
                          : '#dc2626',
                    }}
                  >
                    {r.difficulty}
                  </span>
                </div>

                <div className={styles.recBottom}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    {r.topic} · {Math.round(r.acceptance * 100)}% Pass
                  </span>
                  <button
                    onClick={() => router.push(`/practice/problems/${r.slug}`)}
                    className={styles.recActionBtn}
                  >
                    Solve <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 2. Topic Strength Matrix ──────────────────────────────────────── */}
      <div className={styles.card}>
        <div className={styles.cardHeader} style={{ flexWrap: 'wrap', gap: '1rem' }}>
          <div className={styles.cardTitleWrap}>
            <div className={styles.cardIconBox} style={{ background: '#ecfdf5', color: '#059669' }}>
              <Compass size={20} />
            </div>
            <div>
              <h3 className={styles.cardTitle}>Topic Proficiency Matrix</h3>
              <p className={styles.cardSubtitle}>
                Algorithmically weighted scores across all coding categories
              </p>
            </div>
          </div>

          {/* Search & Band Filters */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search topic..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  padding: '0.4rem 0.65rem 0.4rem 2rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.8rem',
                  outline: 'none',
                }}
              />
            </div>

            <select
              value={bandFilter}
              onChange={(e) => setBandFilter(e.target.value)}
              style={{
                padding: '0.4rem 0.65rem',
                borderRadius: '0.5rem',
                border: '1px solid #cbd5e1',
                background: '#fff',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: '#334155',
              }}
            >
              <option value="all">All Bands</option>
              <option value="Mastered">Mastered (80%+)</option>
              <option value="Proficient">Proficient (60-79%)</option>
              <option value="Learning">Learning (30-59%)</option>
              <option value="Needs Practice">Needs Practice (&lt;30%)</option>
            </select>
          </div>
        </div>

        {/* Matrix Grid / Table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {filteredTopics.length > 0 ? (
            filteredTopics.map((item) => {
              const bStyle = bandColor(item.band);
              return (
                <div
                  key={item.topic}
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.875rem',
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '1rem',
                  }}
                >
                  <div style={{ minWidth: '220px', flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>{item.topic}</strong>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.5rem',
                          borderRadius: '9999px',
                          background: bStyle.bg,
                          color: bStyle.text,
                          border: `1px solid ${bStyle.border}`,
                        }}
                      >
                        {item.band}
                      </span>
                    </div>

                    {/* Strength Bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
                      <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.min(100, item.strength)}%`,
                            background: item.strength >= 80 ? '#10b981' : item.strength >= 60 ? '#3b82f6' : '#7c3aed',
                            borderRadius: 999,
                          }}
                        />
                      </div>
                      <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#334155', minWidth: '40px' }}>
                        {Math.round(item.strength)}%
                      </span>
                    </div>
                  </div>

                  {/* Difficulty Solved & Accuracy */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                    <div className={styles.diffChipsRow}>
                      <span className={`${styles.diffChip} ${styles.diffEasy}`}>E {item.solved_by_difficulty?.Easy || 0}</span>
                      <span className={`${styles.diffChip} ${styles.diffMed}`}>M {item.solved_by_difficulty?.Medium || 0}</span>
                      <span className={`${styles.diffChip} ${styles.diffHard}`}>H {item.solved_by_difficulty?.Hard || 0}</span>
                    </div>

                    <div style={{ textAlign: 'right', minWidth: '70px' }}>
                      <div style={{ fontSize: '0.825rem', fontWeight: 800, color: '#0f172a' }}>
                        {item.total_solved} solved
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                        {item.accuracy_pct}% accuracy
                      </div>
                    </div>

                    {/* Action Deep Link */}
                    <button
                      onClick={() => router.push(`/practice/library?topic=${encodeURIComponent(item.topic)}`)}
                      style={{
                        background: '#f5f3ff',
                        color: '#7c3aed',
                        border: '1px solid #ddd6fe',
                        padding: '0.45rem 0.85rem',
                        borderRadius: '0.5rem',
                        fontSize: '0.775rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}
                    >
                      Practice <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ textAlign: 'center', color: '#64748b', padding: '2rem 0' }}>
              No topics matched your search criteria.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
