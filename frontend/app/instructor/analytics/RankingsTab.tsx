'use client';

import React, { useState, useMemo } from 'react';
import {
  Search,
  Download,
  ArrowUpDown,
  ChevronDown,
  Info,
  ChevronRight,
  Award,
  Trophy,
  Medal,
} from 'lucide-react';
import styles from './rankings-tab.module.css';
import {
  RankingsOverviewData,
  RankingsTableRow,
  RankingsPodiumStudent,
} from '@/services/analytics.service';
import { exportCSV } from '@/lib/analytics-utils';

interface RankingsTabProps {
  data: RankingsOverviewData;
  currentScope: string;
  onScopeChange: (scope: string) => void;
  onSelectStudent: (studentId: string) => void;
}

export function RankingsTab({
  data,
  currentScope,
  onScopeChange,
  onSelectStudent,
}: RankingsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<'rank' | 'student_name' | 'holistic_score' | 'cohort_percentile'>('rank');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showFormulaTooltip, setShowFormulaTooltip] = useState(false);

  const PAGE_SIZE = 10;

  // Filter students by search
  const filteredStudents = useMemo(() => {
    let result = data.students || [];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (s) =>
          s.student_name.toLowerCase().includes(q) ||
          (s.roll_number && s.roll_number.toLowerCase().includes(q))
      );
    }

    // Sort
    return [...result].sort((a, b) => {
      let comparison = 0;
      if (sortField === 'rank') {
        comparison = a.rank - b.rank;
      } else if (sortField === 'student_name') {
        comparison = a.student_name.localeCompare(b.student_name);
      } else if (sortField === 'holistic_score') {
        comparison = a.holistic_score - b.holistic_score;
      } else if (sortField === 'cohort_percentile') {
        comparison = a.cohort_percentile - b.cohort_percentile;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data.students, searchQuery, sortField, sortDirection]);

  // Paginated items
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
  const activePage = Math.min(currentPage, totalPages);
  const startIndex = (activePage - 1) * PAGE_SIZE;
  const paginatedStudents = filteredStudents.slice(startIndex, startIndex + PAGE_SIZE);

  // Sorting helper
  const handleSort = (field: 'rank' | 'student_name' | 'holistic_score' | 'cohort_percentile') => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // CSV Export
  const handleExportCSV = () => {
    const rows = filteredStudents.map((s) => ({
      Rank: s.rank,
      StudentName: s.student_name,
      RollNumber: s.roll_number || '—',
      HolisticScore: s.holistic_score,
      CohortPercentile: s.cohort_percentile_label,
      MasteryScore: s.raw_components.mastery,
      EngagementScore: s.raw_components.engagement,
      EffortScore: s.raw_components.effort,
      EfficiencyScore: s.raw_components.efficiency,
      ConsistencyScore: s.raw_components.consistency,
      InsufficientData: s.insufficient_data ? 'Yes' : 'No',
    }));
    exportCSV(rows, `leaderboard_${currentScope.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}`);
  };

  const scopes = data.scopes || ['Section', 'Subject', 'Department', 'Year Cohort', 'Institution'];

  return (
    <div className={styles.container}>
      <div className={styles.mainCard}>
        {/* ── Card Header ── */}
        <div className={styles.cardHeader}>
          <div className={styles.headerLeft}>
            <div className={styles.titleRow}>
              <div className={styles.trophyIconWrapper}>
                <Trophy size={18} className={styles.trophyIcon} />
              </div>
              <h2 className={styles.cardTitle}>Multi-Scope Leaderboard</h2>
            </div>
            <p className={styles.cardSubtitle}>
              Ranked by existing holistic score (StudentRanking.rank_score). Compares students within the selected scope only.
            </p>
          </div>

          <div className={styles.headerRight}>
            <div
              className={styles.infoDropdownTrigger}
              onClick={() => setShowFormulaTooltip(!showFormulaTooltip)}
              title="Click to view holistic score weighting formula"
            >
              <Info size={14} color="#7c3aed" />
              <span>Holistic score · 5 components</span>
              <ChevronDown size={14} />
            </div>

            {/* Weights legend */}
            <div className={styles.weightsLegendRow}>
              <div className={styles.weightItem}>
                <span className={styles.weightDot} style={{ background: '#7c3aed' }} />
                <span className={styles.weightText}>
                  Mastery <strong>{data.weights?.mastery || 30}%</strong>
                </span>
              </div>
              <div className={styles.weightItem}>
                <span className={styles.weightDot} style={{ background: '#3b82f6' }} />
                <span className={styles.weightText}>
                  Engagement <strong>{data.weights?.engagement || 20}%</strong>
                </span>
              </div>
              <div className={styles.weightItem}>
                <span className={styles.weightDot} style={{ background: '#f59e0b' }} />
                <span className={styles.weightText}>
                  Effort <strong>{data.weights?.effort || 20}%</strong>
                </span>
              </div>
              <div className={styles.weightItem}>
                <span className={styles.weightDot} style={{ background: '#10b981' }} />
                <span className={styles.weightText}>
                  Efficiency <strong>{data.weights?.efficiency || 15}%</strong>
                </span>
              </div>
              <div className={styles.weightItem}>
                <span className={styles.weightDot} style={{ background: '#ec4899' }} />
                <span className={styles.weightText}>
                  Consistency <strong>{data.weights?.consistency || 15}%</strong>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Scope Switcher ── */}
        <div className={styles.scopeRow}>
          {scopes.map((scope) => {
            const isActive =
              currentScope.toLowerCase().replace(/\s+/g, '') ===
              scope.toLowerCase().replace(/\s+/g, '');
            return (
              <button
                key={scope}
                type="button"
                className={`${styles.scopePill} ${isActive ? styles.scopePillActive : ''}`}
                onClick={() => {
                  onScopeChange(scope);
                  setCurrentPage(1);
                }}
              >
                {scope}
              </button>
            );
          })}
        </div>

        {/* ── Top 3 Podium Cards ── */}
        {data.top_3 && data.top_3.length > 0 && (
          <div className={styles.podiumGrid}>
            {data.top_3.map((podium) => {
              const isGold = podium.podium_theme === 'gold' || podium.rank === 1;
              const isSilver = podium.podium_theme === 'silver' || podium.rank === 2;
              const isBronze = podium.podium_theme === 'bronze' || podium.rank === 3;

              const cardClass = isGold
                ? styles.podiumCardGold
                : isSilver
                ? styles.podiumCardSilver
                : styles.podiumCardBronze;

              const badgeClass = isGold
                ? styles.badgeGold
                : isSilver
                ? styles.badgeSilver
                : styles.badgeBronze;

              const ribbonClass = isGold
                ? styles.ribbonGold
                : isSilver
                ? styles.ribbonSilver
                : styles.ribbonBronze;

              const waveColor = isGold
                ? '#fde047'
                : isSilver
                ? '#93c5fd'
                : '#fdba74';

              return (
                <div
                  key={podium.student_id}
                  className={`${styles.podiumCard} ${cardClass}`}
                  onClick={() => onSelectStudent(podium.student_id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className={styles.podiumLeft}>
                    {/* Ribbon badge */}
                    <div className={`${styles.ribbonBadge} ${ribbonClass}`}>
                      <svg width="28" height="34" viewBox="0 0 28 34" fill="none" style={{ position: 'absolute' }}>
                        <path
                          d="M4 2H24C25.1 2 26 2.9 26 4V30L14 24L2 30V4C2 2.9 2.9 2 4 2Z"
                          fill={isGold ? '#fef08a' : isSilver ? '#e2e8f0' : '#fed7aa'}
                          stroke={isGold ? '#eab308' : isSilver ? '#94a3b8' : '#f97316'}
                          strokeWidth="1.5"
                        />
                      </svg>
                      <span style={{ position: 'relative', zIndex: 1, marginTop: -4 }}>{podium.rank}</span>
                    </div>

                    {/* Student Avatar */}
                    <div
                      className={styles.studentAvatar}
                      style={{ background: podium.avatar_color }}
                    >
                      {podium.avatar}
                    </div>

                    {/* Student Metadata */}
                    <div className={styles.studentMeta}>
                      <div className={styles.studentName}>{podium.student_name}</div>
                      <div className={styles.studentRoll}>{podium.roll_number}</div>
                      <div className={`${styles.percentileBadge} ${badgeClass}`}>
                        {podium.badge}
                      </div>
                    </div>
                  </div>

                  <div className={styles.podiumRight}>
                    <div className={styles.scoreRow}>
                      <span className={styles.scoreValue}>{podium.rank_score}</span>
                      <span className={styles.scoreMax}>/ {podium.max_score}</span>
                    </div>
                    <div className={styles.percentileSubtitle}>{podium.percentile_label}</div>
                  </div>

                  {/* Decorative Bottom Wave SVG */}
                  <svg
                    className={styles.cardWaveSvg}
                    viewBox="0 0 350 40"
                    preserveAspectRatio="none"
                  >
                    <path
                      d="M0,28 C80,16 180,36 260,20 C300,12 330,22 350,18 L350,40 L0,40 Z"
                      fill={waveColor}
                      opacity={isGold ? 0.35 : isSilver ? 0.3 : 0.32}
                    />
                    <path
                      d="M0,32 C100,24 200,38 290,26 C320,22 340,30 350,28 L350,40 L0,40 Z"
                      fill={waveColor}
                      opacity={isGold ? 0.2 : isSilver ? 0.15 : 0.18}
                    />
                  </svg>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Toolbar: Search & Export CSV ── */}
        <div className={styles.tableToolbar}>
          <div className={styles.searchBox}>
            <Search size={15} className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search student or roll number..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className={styles.searchInput}
            />
          </div>

          <button
            type="button"
            onClick={handleExportCSV}
            className={styles.exportBtn}
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>

        {/* ── Leaderboard Table ── */}
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th
                  className={styles.sortable}
                  onClick={() => handleSort('rank')}
                  style={{ width: 80 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    Rank <ArrowUpDown size={12} />
                  </div>
                </th>
                <th
                  className={styles.sortable}
                  onClick={() => handleSort('student_name')}
                  style={{ width: 220 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    Student <ArrowUpDown size={12} />
                  </div>
                </th>
                <th
                  className={styles.sortable}
                  onClick={() => handleSort('holistic_score')}
                  style={{ width: 130 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    Holistic Score <ArrowUpDown size={12} />
                  </div>
                </th>
                <th
                  className={styles.sortable}
                  onClick={() => handleSort('cohort_percentile')}
                  style={{ width: 150 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    Cohort Percentile <ArrowUpDown size={12} />
                  </div>
                </th>
                <th style={{ minWidth: 260 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    Component Balance <Info size={12} color="#94a3b8" />
                  </div>
                </th>
                <th style={{ width: 110, textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedStudents.map((st) => {
                const isMedal1 = st.rank === 1;
                const isMedal2 = st.rank === 2;
                const isMedal3 = st.rank === 3;

                return (
                  <tr key={st.student_id}>
                    {/* Rank */}
                    <td>
                      <div className={styles.rankCell}>
                        {isMedal1 ? (
                          <span className={styles.medalBadgeGold} title="1st Place">
                            <Medal size={13} />
                          </span>
                        ) : isMedal2 ? (
                          <span className={styles.medalBadgeSilver} title="2nd Place">
                            <Medal size={13} />
                          </span>
                        ) : isMedal3 ? (
                          <span className={styles.medalBadgeBronze} title="3rd Place">
                            <Medal size={13} />
                          </span>
                        ) : null}
                        <span>{st.rank}</span>
                      </div>
                    </td>

                    {/* Student */}
                    <td>
                      <div className={styles.studentCell}>
                        <div
                          className={styles.tableAvatar}
                          style={{ background: st.avatar_color }}
                        >
                          {st.avatar}
                        </div>
                        <div className={styles.studentCellMeta}>
                          <span className={styles.studentCellName}>{st.student_name}</span>
                          <span className={styles.studentCellRoll}>{st.roll_number}</span>
                        </div>
                      </div>
                    </td>

                    {/* Holistic Score */}
                    <td>
                      <span className={styles.scoreCell}>{st.holistic_score}</span>
                    </td>

                    {/* Cohort Percentile */}
                    <td>
                      <span className={styles.percentilePill}>{st.cohort_percentile_label}</span>
                    </td>

                    {/* Component Balance */}
                    <td>
                      {st.insufficient_data || !st.component_balance ? (
                        <div className={styles.insufficientDataBar}>
                          <Info size={13} color="#94a3b8" />
                          <span>Insufficient data (needs more activity)</span>
                        </div>
                      ) : (
                        <div className={styles.componentBarContainer}>
                          {st.component_balance.mastery_pct > 0 && (
                            <div
                              className={`${styles.barSegment} ${styles.segmentMastery}`}
                              style={{ width: `${st.component_balance.mastery_pct}%` }}
                              title={`Mastery: ${st.component_balance.mastery_pct}% (Score: ${st.raw_components.mastery})`}
                            >
                              {st.component_balance.mastery_pct}%
                            </div>
                          )}
                          {st.component_balance.engagement_pct > 0 && (
                            <div
                              className={`${styles.barSegment} ${styles.segmentEngagement}`}
                              style={{ width: `${st.component_balance.engagement_pct}%` }}
                              title={`Engagement: ${st.component_balance.engagement_pct}% (Score: ${st.raw_components.engagement})`}
                            >
                              {st.component_balance.engagement_pct}%
                            </div>
                          )}
                          {st.component_balance.effort_pct > 0 && (
                            <div
                              className={`${styles.barSegment} ${styles.segmentEffort}`}
                              style={{ width: `${st.component_balance.effort_pct}%` }}
                              title={`Effort: ${st.component_balance.effort_pct}% (Score: ${st.raw_components.effort})`}
                            >
                              {st.component_balance.effort_pct}%
                            </div>
                          )}
                          {st.component_balance.efficiency_pct > 0 && (
                            <div
                              className={`${styles.barSegment} ${styles.segmentEfficiency}`}
                              style={{ width: `${st.component_balance.efficiency_pct}%` }}
                              title={`Efficiency: ${st.component_balance.efficiency_pct}% (Score: ${st.raw_components.efficiency})`}
                            >
                              {st.component_balance.efficiency_pct}%
                            </div>
                          )}
                          {st.component_balance.consistency_pct > 0 && (
                            <div
                              className={`${styles.barSegment} ${styles.segmentConsistency}`}
                              style={{ width: `${st.component_balance.consistency_pct}%` }}
                              title={`Consistency: ${st.component_balance.consistency_pct}% (Score: ${st.raw_components.consistency})`}
                            >
                              {st.component_balance.consistency_pct}%
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Action */}
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => onSelectStudent(st.student_id)}
                        className={styles.actionBtn}
                      >
                        View 360 →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        <div className={styles.paginationRow}>
          <div className={styles.paginationText}>
            Showing <strong>{filteredStudents.length > 0 ? startIndex + 1 : 0}</strong> to{' '}
            <strong>{Math.min(startIndex + PAGE_SIZE, filteredStudents.length)}</strong> of{' '}
            <strong>{filteredStudents.length}</strong> ranked students
          </div>

          <div className={styles.paginationButtons}>
            <button
              type="button"
              disabled={activePage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className={`${styles.pageBtn} ${activePage === 1 ? styles.pageBtnDisabled : ''}`}
            >
              &lt; Previous
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
              <button
                key={pageNum}
                type="button"
                onClick={() => setCurrentPage(pageNum)}
                className={`${styles.pageBtn} ${activePage === pageNum ? styles.pageBtnActive : ''}`}
              >
                {pageNum}
              </button>
            ))}

            <button
              type="button"
              disabled={activePage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className={`${styles.pageBtn} ${activePage === totalPages ? styles.pageBtnDisabled : ''}`}
            >
              Next &gt;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
