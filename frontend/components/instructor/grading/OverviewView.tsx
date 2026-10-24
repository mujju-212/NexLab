'use client';

import React from 'react';
import { BookOpen, Inbox, Clock, FileText } from 'lucide-react';
import hub from '@/app/instructor/grading/hub.module.css';

const AVATAR_PALETTE = [
  { bg: '#ede9fe', text: '#7c3aed' },
  { bg: '#e0e7ff', text: '#4f46e5' },
  { bg: '#dbeafe', text: '#2563eb' },
  { bg: '#fce7f3', text: '#db2777' },
  { bg: '#ccfbf1', text: '#0d9488' },
  { bg: '#ffedd5', text: '#ea580c' },
  { bg: '#f3e8ff', text: '#9333ea' },
  { bg: '#e2e8f0', text: '#475569' },
];

function getAvatarStyle(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const color = AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
  return { background: color.bg, color: color.text };
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() ?? '')
      .join('') || '—'
  );
}

function timeAgo(isoString: string | null | undefined): string {
  if (!isoString) return 'Just now';
  const date = new Date(isoString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

interface OverviewViewProps {
  gradeSummaryData: any;
  counts: {
    total: number;
    needsReview: number;
    graded: number;
    notStarted: number;
    flagged: number;
  };
  totalExperiments: number;
  classAvg: string;
  onManageAssessments: () => void;
  onViewAnalytics: () => void;
  onViewAllActivity: () => void;
}

export default function OverviewView({
  gradeSummaryData,
  counts,
  totalExperiments,
  classAvg,
  onManageAssessments,
  onViewAnalytics,
  onViewAllActivity,
}: OverviewViewProps) {
  const publishedCount = gradeSummaryData?.subject?.published_count ?? 1;
  const draftCount = gradeSummaryData?.subject?.draft_count ?? 2;
  const publishedWeightage = gradeSummaryData?.subject?.published_weightage ?? 80;
  const draftWeightage = gradeSummaryData?.subject?.draft_weightage ?? 0;
  const notStartedCount = Math.max(0, (totalExperiments || 5) - publishedCount - draftCount);

  const totalExps = Math.max(1, totalExperiments || 5);
  const pubPct = Math.max(15, Math.round((publishedCount / totalExps) * 100));
  const draftPct = Math.max(20, Math.round((draftCount / totalExps) * 100));

  return (
    <div className={hub.viewContainer}>
      {/* 4 Top KPI Cards */}
      <div className={hub.overviewKpiGrid}>
        {/* Card 1: Class average */}
        <div className={hub.kpiCardV2}>
          <div className={hub.kpiCardTopRow}>
            <span className={hub.kpiCardTitle}>Class average</span>
            <div className={`${hub.kpiCardIconBox} ${hub.kpiIconBlue}`}>
              <BookOpen size={16} />
            </div>
          </div>
          <div className={hub.kpiCardMainRow}>
            <span className={hub.kpiCardNumber}>
              {gradeSummaryData?.stats?.class_average ?? classAvg}
              <span className={hub.kpiCardUnit}> / 100</span>
            </span>
            <span className={`${hub.kpiCardBadge} ${hub.kpiBadgeGreen}`}>
              +6%
            </span>
          </div>
          <span className={hub.kpiCardSubtext}>
            Based on {counts.graded || 180} graded cells
          </span>
        </div>

        {/* Card 2: Graded submissions */}
        <div className={hub.kpiCardV2}>
          <div className={hub.kpiCardTopRow}>
            <span className={hub.kpiCardTitle}>Graded submissions</span>
            <div className={`${hub.kpiCardIconBox} ${hub.kpiIconGold}`}>
              <Inbox size={16} />
            </div>
          </div>
          <div className={hub.kpiCardMainRow}>
            <span className={hub.kpiCardNumber}>
              {gradeSummaryData?.stats?.graded_submissions ?? counts.graded ?? 724}
            </span>
            <span className={`${hub.kpiCardBadge} ${hub.kpiBadgeGreen}`}>
              +58%
            </span>
          </div>
          <span className={hub.kpiCardSubtext}>
            of {gradeSummaryData?.stats?.total_submissions ?? ((counts.total * (totalExperiments || 1)) || 1082)} total submissions
          </span>
        </div>

        {/* Card 3: Pending review */}
        <div className={hub.kpiCardV2}>
          <div className={hub.kpiCardTopRow}>
            <span className={hub.kpiCardTitle}>Pending review</span>
            <div className={`${hub.kpiCardIconBox} ${hub.kpiIconPurple}`}>
              <Clock size={16} />
            </div>
          </div>
          <div className={hub.kpiCardMainRow}>
            <span className={hub.kpiCardNumber}>
              {gradeSummaryData?.stats?.pending_submissions ?? counts.needsReview ?? 186}
            </span>
            <span className={`${hub.kpiCardBadge} ${hub.kpiBadgeAmber}`}>
              +17%
            </span>
          </div>
          <span className={hub.kpiCardSubtext}>
            needs grading
          </span>
        </div>

        {/* Card 4: Not submitted */}
        <div className={hub.kpiCardV2}>
          <div className={hub.kpiCardTopRow}>
            <span className={hub.kpiCardTitle}>Not submitted</span>
            <div className={`${hub.kpiCardIconBox} ${hub.kpiIconOrange}`}>
              <FileText size={16} />
            </div>
          </div>
          <div className={hub.kpiCardMainRow}>
            <span className={hub.kpiCardNumber}>
              {gradeSummaryData?.stats?.not_submitted_count ?? counts.notStarted ?? 150}
            </span>
            <span className={`${hub.kpiCardBadge} ${hub.kpiBadgeGray}`}>
              -14%
            </span>
          </div>
          <span className={hub.kpiCardSubtext}>
            students with missing work
          </span>
        </div>
      </div>

      {/* Middle Row: Assessment progress + Grade distribution */}
      <div className={hub.cardGrid2Col}>
        {/* Left: Assessment progress */}
        <div className={hub.whiteCard}>
          <div className={hub.cardHeaderRow}>
            <div>
              <div className={hub.cardHeading}>Assessment progress</div>
              <div className={hub.cardSubheading}>
                {publishedCount} of {totalExperiments || 5} assessments published • {publishedWeightage} marks allocated
              </div>
            </div>
            <button
              type="button"
              className={hub.cardLinkBtn}
              onClick={onManageAssessments}
            >
              Manage Assessments
            </button>
          </div>

          <div className={hub.segmentedBar}>
            <div className={hub.segmentGreen} style={{ width: `${pubPct}%` }} />
            <div className={hub.segmentAmber} style={{ width: `${draftPct}%` }} />
            <div className={hub.segmentSlate} style={{ flex: 1 }} />
          </div>

          <div className={hub.legendRow}>
            <div>
              <span className={hub.legendDot} style={{ background: '#16a34a' }} />
              Published ({publishedCount}) • {publishedWeightage} marks
            </div>
            <div>
              <span className={hub.legendDot} style={{ background: '#f59e0b' }} />
              Draft ({draftCount}) • {draftWeightage} marks
            </div>
            <div>
              <span className={hub.legendDot} style={{ background: '#94a3b8' }} />
              Not started ({notStartedCount}) • 0 marks
            </div>
          </div>
        </div>

        {/* Right: Grade distribution */}
        <div className={hub.whiteCard}>
          <div className={hub.cardHeaderRow}>
            <div className={hub.cardHeading}>Grade distribution</div>
            <button
              type="button"
              className={hub.cardLinkBtn}
              onClick={onViewAnalytics}
            >
              View Details
            </button>
          </div>

          {/* Vertical Bar Histogram */}
          <div className={hub.histogramBox}>
            {[
              { label: '0-40', count: gradeSummaryData?.stats?.distribution?.['0-40'] ?? 28, highlight: false },
              { label: '40-60', count: gradeSummaryData?.stats?.distribution?.['40-60'] ?? 52, highlight: false },
              { label: '60-75', count: gradeSummaryData?.stats?.distribution?.['60-75'] ?? 84, highlight: true },
              { label: '75-90', count: gradeSummaryData?.stats?.distribution?.['75-90'] ?? 36, highlight: false },
              { label: '90-100', count: gradeSummaryData?.stats?.distribution?.['90-100'] ?? 20, highlight: false },
            ].map(b => {
              const maxVal = 90;
              const heightPct = Math.max(12, Math.round((b.count / maxVal) * 100));
              return (
                <div key={b.label} className={hub.histogramCol}>
                  <span className={hub.histogramValue}>{b.count}</span>
                  <div
                    className={`${hub.histogramBar} ${b.highlight ? hub.histogramBarHighlight : ''}`}
                    style={{ height: `${heightPct}%` }}
                  />
                  <span className={hub.histogramLabel}>{b.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Row: Recent activity + Subject insights */}
      <div className={hub.cardGrid2Col}>
        {/* Left: Recent activity */}
        <div className={hub.whiteCard}>
          <div className={hub.cardHeaderRow}>
            <div className={hub.cardHeading}>Recent activity</div>
            <button
              type="button"
              className={hub.cardLinkBtn}
              onClick={onViewAllActivity}
            >
              View All
            </button>
          </div>

          <div className={hub.activityList}>
            {(gradeSummaryData?.recent_activity && gradeSummaryData.recent_activity.length > 0
              ? gradeSummaryData.recent_activity.slice(0, 4)
              : [
                  { id: '1', student_name: 'Aarav Gupta', action: 'graded Lab 1 - Sorting Algorithms', timestamp: new Date(Date.now() - 2 * 60000).toISOString() },
                  { id: '2', student_name: 'Vihan Sharma', action: 'submitted Lab 2', timestamp: new Date(Date.now() - 12 * 60000).toISOString() },
                  { id: '3', student_name: 'AI System', action: 'flagged 2 submissions for similarity', timestamp: new Date(Date.now() - 60 * 60000).toISOString() },
                ]
            ).map((act: any) => (
              <div key={act.id} className={hub.activityItem}>
                <div
                  className={hub.activityAvatar}
                  style={getAvatarStyle(act.student_name)}
                >
                  {initials(act.student_name)}
                </div>
                <div className={hub.activityContent}>
                  <div className={hub.activityTitle}>
                    <span style={{ fontWeight: 700 }}>{act.student_name}</span> {act.action}
                  </div>
                  <div className={hub.activityTime}>
                    {timeAgo(act.timestamp)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Subject insights */}
        <div className={hub.whiteCard}>
          <div className={hub.cardHeaderRow}>
            <div className={hub.cardHeading}>Subject insights</div>
          </div>

          <div className={hub.insightsGrid}>
            <div className={hub.insightTile}>
              <span className={hub.insightTileTitle}>Attendance (Live Labs)</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span className={hub.insightTileNumber}>85%</span>
                <span className={`${hub.kpiCardBadge} ${hub.kpiBadgeGreen}`} style={{ fontSize: 10 }}>+4%</span>
              </div>
              <span className={hub.insightTileSub}>Mean of {counts.total || 260} students</span>
            </div>

            <div className={hub.insightTile}>
              <span className={hub.insightTileTitle}>Average completion</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span className={hub.insightTileNumber}>62%</span>
              </div>
              <span className={hub.insightTileSub}>of all experiments</span>
            </div>

            <div className={hub.insightTile}>
              <span className={hub.insightTileTitle}>Avg. hint usage</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span className={hub.insightTileNumber}>1.8</span>
              </div>
              <span className={hub.insightTileSub}>per submission</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
