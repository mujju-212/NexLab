'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Clock,
  FileCode,
  Code2,
  Database,
  ArrowRight,
  FileText,
  X,
  ExternalLink,
} from 'lucide-react';
import type { UnifiedStudentOverview } from '@/services/student-analytics.service';
import styles from './growth-overview.module.css';

interface RecentActivityCardProps {
  overview: UnifiedStudentOverview | null;
}

const DEFAULT_ACTIVITIES = [
  {
    id: 'act-1',
    title: 'Exp 3: Stack Implementation',
    category: 'DSA Lab',
    type: 'experiment',
    status: 'Graded',
    score_display: '87%',
    time_ago: '2 hours ago',
  },
  {
    id: 'act-2',
    title: 'Binary Search Practice',
    category: 'Practice',
    type: 'practice',
    status: 'Accepted',
    score_display: '+25 XP',
    time_ago: '5 hours ago',
  },
  {
    id: 'act-3',
    title: 'Exp 2: SQL Queries',
    category: 'DBMS Lab',
    type: 'experiment',
    status: 'Needs Review',
    score_display: '—',
    time_ago: '1 day ago',
  },
];

export const RecentActivityCard: React.FC<RecentActivityCardProps> = ({ overview }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'experiment' | 'practice'>('all');

  const activities = overview?.recent_activity && overview.recent_activity.length > 0
    ? overview.recent_activity
    : DEFAULT_ACTIVITIES;

  const filteredActivities = activities.filter((item) => {
    if (filterType === 'all') return true;
    return item.type === filterType;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Graded':
        return (
          <span className={`${styles.pillBadge} ${styles.pillGreen}`}>
            Graded
          </span>
        );
      case 'Accepted':
        return (
          <span
            className={styles.pillBadge}
            style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}
          >
            Accepted
          </span>
        );
      case 'Needs Review':
      default:
        return (
          <span
            className={styles.pillBadge}
            style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' }}
          >
            Needs Review
          </span>
        );
    }
  };

  const getIcon = (item: any) => {
    if (item.category?.toLowerCase().includes('dbms') || item.title?.toLowerCase().includes('sql')) {
      return (
        <div className={styles.activityIconCircle} style={{ background: '#e0f2fe', color: '#0284c7' }}>
          <Database size={16} />
        </div>
      );
    }
    if (item.type === 'practice' || item.category === 'Practice') {
      return (
        <div className={styles.activityIconCircle} style={{ background: '#ffedd5', color: '#ea580c' }}>
          <Code2 size={16} />
        </div>
      );
    }
    return (
      <div className={styles.activityIconCircle} style={{ background: '#eff6ff', color: '#2563eb' }}>
        <FileCode size={16} />
      </div>
    );
  };

  return (
    <>
      <div className={styles.card}>
        <div className={styles.cardHeaderRow}>
          <div className={styles.cardTitleBlock}>
            <div className={styles.headerIconCircle} style={{ background: '#eff6ff', color: '#2563eb' }}>
              <Clock size={18} />
            </div>
            <div>
              <h3>Recent Activity</h3>
              <p>Your latest submissions, grades, and practice progress.</p>
            </div>
          </div>

          <button
            type="button"
            className={styles.bottomActionLink}
            onClick={() => setIsModalOpen(true)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <span>View All</span>
            <ArrowRight size={13} />
          </button>
        </div>

        <div className={styles.activityList}>
          {activities.slice(0, 3).map((item) => (
            <div key={item.id} className={styles.activityItem}>
              <div className={styles.activityLeft}>
                {getIcon(item)}
                <div className={styles.activityText}>
                  <h5>{item.title}</h5>
                  <p>{item.category}</p>
                </div>
              </div>

              <div className={styles.activityRight}>
                <div className={styles.activityScoreRow}>
                  {getStatusBadge(item.status)}
                  <span
                    className={styles.activityScore}
                    style={{
                      color: item.status === 'Accepted' ? '#16a34a' : '#0f172a',
                    }}
                  >
                    {item.score_display}
                  </span>
                </div>
                <span className={styles.activityTime}>{item.time_ago}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── All Recent Activity Modal ── */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={() => setIsModalOpen(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '1.25rem',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '680px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid #e2e8f0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1rem',
                borderBottom: '1px solid #f1f5f9',
                paddingBottom: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div className={styles.headerIconCircle} style={{ background: '#eff6ff', color: '#2563eb' }}>
                  <Clock size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                    All Recent Activity
                  </h3>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                    Comprehensive timeline of submissions, practice runs, and evaluations.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{
                  border: 'none',
                  background: '#f1f5f9',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#64748b',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Filter Pills */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              {(['all', 'experiment', 'practice'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  style={{
                    padding: '0.35rem 0.85rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    background: filterType === t ? '#f5f3ff' : '#f8fafc',
                    color: filterType === t ? '#7c3aed' : '#64748b',
                    fontWeight: filterType === t ? 700 : 500,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                  }}
                  onClick={() => setFilterType(t)}
                >
                  {t === 'all' ? 'All Activity' : t === 'experiment' ? 'Lab Experiments' : 'Platform Practice'}
                </button>
              ))}
            </div>

            {/* Scrollable Activity List */}
            <div style={{ overflowY: 'auto', maxHeight: '420px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {filteredActivities.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem 0' }}>No activity matching this filter.</p>
              ) : (
                filteredActivities.map((item) => (
                  <div key={item.id} className={styles.activityItem} style={{ border: '1px solid #f1f5f9', borderRadius: '0.75rem', padding: '0.75rem 1rem' }}>
                    <div className={styles.activityLeft}>
                      {getIcon(item)}
                      <div className={styles.activityText}>
                        <h5 style={{ fontSize: '0.88rem' }}>{item.title}</h5>
                        <p>{item.category}</p>
                      </div>
                    </div>

                    <div className={styles.activityRight}>
                      <div className={styles.activityScoreRow}>
                        {getStatusBadge(item.status)}
                        <span
                          className={styles.activityScore}
                          style={{
                            color: item.status === 'Accepted' ? '#16a34a' : '#0f172a',
                          }}
                        >
                          {item.score_display}
                        </span>
                      </div>
                      <span className={styles.activityTime}>{item.time_ago}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
              <Link
                href="/student/submissions"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: '#7c3aed',
                  textDecoration: 'none',
                }}
              >
                <span>Go to Submissions Page</span>
                <ExternalLink size={13} />
              </Link>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  background: '#7c3aed',
                  color: '#ffffff',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
