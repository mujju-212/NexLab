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
  // Honest zeros — no fabricated fallbacks when nothing is graded yet.
  const subject = gradeSummaryData?.subject ?? {};
  const publishedCount = subject.published_count ?? 0;
  const draftCount = subject.draft_count ?? 0;
  const publishedWeightage = subject.published_weightage ?? 0;
  const draftWeightage = subject.draft_weightage ?? 0;
  const totalAssessments = subject.total_assessments ?? totalExperiments ?? 0;
  const notStartedCount = Math.max(0, totalAssessments - publishedCount - draftCount);

  const totalExps = Math.max(1, totalAssessments);
  const pubPct = Math.min(100, Math.round((publishedCount / totalExps) * 100));
  const draftPct = Math.max(0, Math.min(100 - pubPct, Math.round((draftCount / totalExps) * 100)));
  const classAverage = gradeSummaryData?.stats?.class_average;

  const distribution = gradeSummaryData?.stats?.distribution ?? {};
  const distBars = [
    { label: '0-40', count: distribution['0-40'] ?? 0, highlight: false },
    { label: '40-60', count: distribution['40-60'] ?? 0, highlight: false },
    { label: '60-75', count: distribution['60-75'] ?? 0, highlight: false },
    { label: '75-90', count: distribution['75-90'] ?? 0, highlight: false },
    { label: '90-100', count: distribution['90-100'] ?? 0, highlight: false },
  ];
  const distMax = Math.max(...distBars.map(b => b.count), 1);
  const hasGrades = distBars.some(b => b.count > 0);

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
              {classAverage != null ? classAverage : '—'}
              <span className={hub.kpiCardUnit}> / 100</span>
            </span>
          </div>
          <span className={hub.kpiCardSubtext}>
            Based on {counts.graded} graded cells
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
              {gradeSummaryData?.stats?.graded_submissions ?? counts.graded ?? 0}
            </span>
          </div>
          <span className={hub.kpiCardSubtext}>
            of {gradeSummaryData?.stats?.total_submissions ?? counts.total ?? 0} total submissions
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
              {gradeSummaryData?.stats?.pending_submissions ?? counts.needsReview ?? 0}
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
              {gradeSummaryData?.stats?.not_submitted_count ?? counts.notStarted ?? 0}
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
                {publishedCount} of {totalAssessments} assessments published • {publishedWeightage} marks allocated
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
            {!hasGrades ? (
              <div style={{ margin: 'auto', fontSize: 12.5, color: '#9891a6', fontWeight: 600 }}>
                No grades recorded yet
              </div>
            ) : distBars.map(b => {
              const heightPct = Math.max(4, Math.round((b.count / distMax) * 100));
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
            {(gradeSummaryData?.recent_activity ?? []).slice(0, 4).length === 0 ? (
              <div style={{ padding: '18px 0', fontSize: 12.5, color: '#9891a6', fontWeight: 600 }}>
                No activity yet — events appear as students submit and you grade.
              </div>
            ) : (gradeSummaryData.recent_activity.slice(0, 4)).map((act: any) => (
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
                <span className={hub.insightTileNumber}>—</span>
              </div>
              <span className={hub.insightTileSub}>Mean of {counts.total} students</span>
            </div>

            <div className={hub.insightTile}>
              <span className={hub.insightTileTitle}>Average completion</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span className={hub.insightTileNumber}>—</span>
              </div>
              <span className={hub.insightTileSub}>of all experiments</span>
            </div>

            <div className={hub.insightTile}>
              <span className={hub.insightTileTitle}>Avg. hint usage</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span className={hub.insightTileNumber}>—</span>
              </div>
              <span className={hub.insightTileSub}>per submission</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
