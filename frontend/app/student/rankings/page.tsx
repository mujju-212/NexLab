'use client';

import React, { useEffect, useState, useMemo } from 'react';
import StudentShell from '@/components/layout/StudentShell';
import { studentService } from '@/services/student.service';
import {
  studentAnalyticsService,
  type AcademicLeaderboardItem,
  type PlatformLeaderboardResponse,
} from '@/services/student-analytics.service';
import type { StudentRanking, SectionSubject } from '@/types';
import {
  Trophy,
  Medal,
  Award,
  Search,
  BookOpen,
  Users,
  Building,
  Globe,
  Sparkles,
  Loader2,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  GraduationCap,
  CheckCircle2,
} from 'lucide-react';
import styles from './page.module.css';

interface EnrichedStudentRanking extends StudentRanking {
  subject_name?: string;
  subject_code?: string;
  subject_color?: string;
  subject_icon?: string;
  cohort_size?: number;
}

const COMPONENT_META = [
  { key: 'mastery' as const,     label: 'Mastery',     weight: '30%', color: '#9333ea' },
  { key: 'engagement' as const,  label: 'Engagement',  weight: '20%', color: '#10b981' },
  { key: 'effort' as const,      label: 'Effort',      weight: '20%', color: '#f59e0b' },
  { key: 'efficiency' as const,  label: 'Efficiency',  weight: '15%', color: '#ec4899' },
  { key: 'consistency' as const, label: 'Consistency', weight: '15%', color: '#6366f1' },
];

type ScopeLevel = 'section' | 'subject' | 'department' | 'institution';

const SCOPES: Array<{
  key: ScopeLevel;
  label: string;
  icon: React.ReactNode;
}> = [
  { key: 'section',     label: 'Section',     icon: <Users size={14} /> },
  { key: 'subject',     label: 'Subject',     icon: <BookOpen size={14} /> },
  { key: 'department',  label: 'Department',  icon: <Building size={14} /> },
  { key: 'institution', label: 'Institution', icon: <GraduationCap size={14} /> },
];

const AVATAR_COLORS = [
  'linear-gradient(135deg, #7c3aed, #4f46e5)',
  'linear-gradient(135deg, #059669, #10b981)',
  'linear-gradient(135deg, #d97706, #f59e0b)',
  'linear-gradient(135deg, #dc2626, #ef4444)',
  'linear-gradient(135deg, #2563eb, #3b82f6)',
  'linear-gradient(135deg, #7c2d12, #ea580c)',
  'linear-gradient(135deg, #4c1d95, #8b5cf6)',
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function percentileText(percentile: number | null | undefined, cohort: number, position?: number | null): string {
  // No invented percentile: a cohort of one has no ranking distribution.
  if (cohort < 5 || percentile === null || percentile === undefined) {
    return cohort < 2 ? 'Only student in cohort' : position ? `#${position}` : '—';
  }
  return `Top ${Math.max(1, 100 - Math.round(percentile))}%`;
}

function cohortText(cohort: number): string {
  if (!cohort) return '—';
  return `of ${cohort} ${cohort === 1 ? 'student' : 'students'}`;
}

function getInitials(name: string) {
  if (!name) return 'ST';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function StudentRankingsPage() {
  const [track, setTrack] = useState<'academic' | 'competitive'>('academic');
  const [scope, setScope] = useState<ScopeLevel>('section');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');

  // Student's personal rankings across enrolled subjects
  const [myRankings, setMyRankings] = useState<EnrichedStudentRanking[]>([]);
  const [subjects, setSubjects] = useState<SectionSubject[]>([]);

  // Cohort leaderboard data
  const [academicItems, setAcademicItems] = useState<AcademicLeaderboardItem[]>([]);
  const [platformData, setPlatformData] = useState<PlatformLeaderboardResponse | null>(null);
  const [cohortSize, setCohortSize] = useState<number>(0);
  const [currentUserEntry, setCurrentUserEntry] = useState<AcademicLeaderboardItem | null>(null);

  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingCohort, setLoadingCohort] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // 1. Initial Load: Load personal rankings and enrolled subjects
  useEffect(() => {
    async function loadInitial() {
      try {
        setLoadingInitial(true);
        const [rData, sData] = await Promise.all([
          studentService.getRankings(),
          studentService.getSubjects(),
        ]);

        const typedRankings = (rData || []) as EnrichedStudentRanking[];
        typedRankings.sort((a, b) => (a.rank_position ?? 999) - (b.rank_position ?? 999));
        setMyRankings(typedRankings);
        setSubjects(sData || []);

        // Pick default subject: prefer the first one with a ranking, or first subject
        if (typedRankings.length > 0 && typedRankings[0].section_subject_id) {
          setSelectedSubjectId(typedRankings[0].section_subject_id);
        } else if (sData && sData.length > 0) {
          setSelectedSubjectId(sData[0].section_subject_id);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load rankings overview');
      } finally {
        setLoadingInitial(false);
      }
    }
    loadInitial();
  }, []);

  // 2. Load Cohort Leaderboard whenever scope, selectedSubjectId, or track changes
  useEffect(() => {
    let isCancelled = false;

    async function fetchCohort() {
      if (loadingInitial) return;
      try {
        setLoadingCohort(true);
        setError('');

        if (track === 'academic') {
          const params: { scope_level: ScopeLevel; scope_id?: string; limit: number } = {
            scope_level: scope,
            limit: 100,
          };
          if (scope === 'subject' && selectedSubjectId) {
            params.scope_id = selectedSubjectId;
          }

          const res = await studentAnalyticsService.getAcademicLeaderboard(params);
          if (isCancelled) return;

          setAcademicItems(res.leaderboard || []);
          setCohortSize(res.cohort_size || (res.leaderboard ? res.leaderboard.length : 0));
          setCurrentUserEntry(res.current_user || null);
        } else {
          // Competitive platform track
          const res = await studentAnalyticsService.getPlatformLeaderboard({
            scope: 'global',
            period: 'all_time',
          });
          if (isCancelled) return;

          setPlatformData(res);
          setCohortSize(res.cohort_size || (res.leaderboard ? res.leaderboard.length : 0));
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load cohort leaderboard');
        }
      } finally {
        if (!isCancelled) setLoadingCohort(false);
      }
    }

    fetchCohort();
    return () => {
      isCancelled = true;
    };
  }, [track, scope, selectedSubjectId, loadingInitial]);

  // Reset pagination on search or scope change
  useEffect(() => {
    setPage(1);
  }, [search, scope, track, selectedSubjectId]);

  // Map subjects for quick lookup
  const subjectMap = useMemo(() => {
    return new Map(subjects.map((s) => [s.section_subject_id, s]));
  }, [subjects]);

  // Filtered leaderboard rows
  const filteredAcademicItems = useMemo(() => {
    if (!search.trim()) return academicItems;
    const q = search.toLowerCase();
    return academicItems.filter(
      (item) =>
        (item.name && item.name.toLowerCase().includes(q)) ||
        (item.student_id && item.student_id.toLowerCase().includes(q))
    );
  }, [academicItems, search]);

  const totalPages = Math.max(1, Math.ceil(filteredAcademicItems.length / pageSize));
  const pagedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredAcademicItems.slice(start, start + pageSize);
  }, [filteredAcademicItems, page, pageSize]);

  // Podium: Top 3 students (shown when no search filter active)
  const podiumStudents = useMemo(() => {
    if (academicItems.length < 3 || search.trim()) return [];
    // Arrange: [2nd, 1st, 3rd] for visual podium height
    const first = academicItems[0];
    const second = academicItems[1];
    const third = academicItems[2];
    return [
      { ...second, medal: '🥈', title: 'Silver - Rank 2', isFirst: false },
      { ...first,  medal: '🥇', title: 'Gold - Rank 1',   isFirst: true },
      { ...third,  medal: '🥉', title: 'Bronze - Rank 3', isFirst: false },
    ];
  }, [academicItems, search]);

  // Find active subject display name
  const currentSubjectObj = subjectMap.get(selectedSubjectId);
  const activeSubjectName =
    currentSubjectObj?.subject_name ||
    myRankings.find((r) => r.section_subject_id === selectedSubjectId)?.subject_name ||
    'Subject';

  if (loadingInitial) {
    return (
      <StudentShell
        activePage="Ranking"
        title="Leaderboard & Rankings"
        subtitle="Live academic cohort rankings and performance across enrolled subjects"
      >
        <div className={styles.loadingBox}>
          <Loader2 size={24} className={styles.spinner} />
          <span>Loading leaderboard and standings…</span>
        </div>
      </StudentShell>
    );
  }

  return (
    <StudentShell
      activePage="Ranking"
      title="Leaderboard & Rankings"
      subtitle="Live academic cohort rankings and performance across enrolled subjects"
    >
      {error && <div className={styles.errorBox}>⚠️ {error}</div>}

      {/* ── Track Selector Tabs ── */}
      <div className={styles.trackSelector}>
        <button
          type="button"
          onClick={() => setTrack('academic')}
          className={`${styles.trackBtn} ${track === 'academic' ? styles.trackBtnActive : ''}`}
        >
          <GraduationCap size={16} />
          Academic Curriculum
        </button>
        <button
          type="button"
          onClick={() => setTrack('competitive')}
          className={`${styles.trackBtn} ${track === 'competitive' ? styles.trackBtnActive : ''}`}
        >
          <Sparkles size={16} />
          Competitive Platform
        </button>
      </div>

      {/* ── 1. My Standing Across Enrolled Subjects ── */}
      <section className={styles.myStandingsSection}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>
              <Trophy size={18} style={{ color: '#f59e0b' }} />
              My Standings Across Enrolled Subjects
            </h2>
            <p className={styles.sectionSubtitle}>
              Your official rank and 5-factor holistic performance in each enrolled subject
            </p>
          </div>
        </div>

        {myRankings.length === 0 ? (
          <div className={styles.emptyCohortNotice} style={{ background: '#fff', borderRadius: 16 }}>
            No subject rankings computed yet. Your rank will update after your next graded activity.
          </div>
        ) : (
          <div className={styles.myStandingsGrid}>
            {myRankings.map((r) => {
              const sub = subjectMap.get(r.section_subject_id);
              const subjectName = r.subject_name || sub?.subject_name || 'Enrolled Subject';
              const subjectCode = r.subject_code || sub?.subject_code || 'CS';
              const cohort = r.cohort_size || 0;
              const isSelected = selectedSubjectId === r.section_subject_id;

              return (
                <div
                  key={r.section_subject_id}
                  className={`${styles.standingCard} ${isSelected ? styles.standingCardActive : ''}`}
                  onClick={() => {
                    setSelectedSubjectId(r.section_subject_id);
                    setScope('subject');
                  }}
                  title="Click to view full cohort leaderboard for this subject"
                >
                  <div className={styles.standingCardTop}>
                    <div className={styles.standingSubjectInfo}>
                      <span className={styles.standingCode}>{subjectCode}</span>
                      <h3 className={styles.standingSubjectName}>{subjectName}</h3>
                    </div>
                    <div className={styles.standingRankBadge}>
                      <span className={styles.standingRankNumber}>
                        {r.rank_position != null ? `#${r.rank_position}` : '—'}
                      </span>
                      <span className={styles.standingRankCohort}>{cohortText(cohort)}</span>
                    </div>
                  </div>

                  <div className={styles.standingScoreBox}>
                    <span className={styles.standingScoreLabel}>Holistic Composite Score</span>
                    <span className={styles.standingScoreValue}>
                      {r.rank_score === null || r.rank_score === undefined ? '—' : `${r.rank_score} pts`}
                    </span>
                  </div>

                  <div className={styles.componentsGrid}>
                    {COMPONENT_META.map((c) => {
                      // A missing factor is unmeasured -> no bar, em dash
                      const raw = r.components ? (r.components as any)[c.key] : null;
                      const val = typeof raw === 'number' ? raw : null;
                      return (
                        <div key={c.key} className={styles.componentRow}>
                          <span className={styles.componentName}>
                            {c.label} <em style={{ fontSize: '10px', color: '#94a3b8' }}>({c.weight})</em>
                          </span>
                          <div className={styles.componentBar}>
                            <div
                              className={styles.componentFill}
                              style={{ width: `${val === null ? 0 : Math.min(val, 100)}%`, background: c.color, opacity: val === null ? 0 : 1 }}
                            />
                          </div>
                          <span className={styles.componentVal}>{val === null ? '—' : val}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className={styles.standingCardFooter}>
                    {isSelected ? (
                      <span className={styles.standingActiveIndicator}>
                        <CheckCircle2 size={14} /> Active in Leaderboard
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={styles.standingSelectBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSubjectId(r.section_subject_id);
                          setScope('subject');
                        }}
                      >
                        View Subject Board <ChevronRight size={14} />
                      </button>
                    )}
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                      {r.rank_position && cohort >= 5
                        ? `Top ${Math.max(1, Math.round((r.rank_position / cohort) * 100))}%`
                        : cohort >= 2 ? 'Cohort too small for a percentile' : 'Only student in cohort'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── 2. Real Cohort Leaderboard ── */}
      {track === 'academic' ? (
        <>
          {/* Scope & Subject Filter Card */}
          <div className={styles.filterCard}>
            <div className={styles.scopeGroup}>
              <span className={styles.scopeLabel}>Cohort Scope:</span>
              <div className={styles.scopePills}>
                {SCOPES.map((sc) => (
                  <button
                    key={sc.key}
                    type="button"
                    onClick={() => setScope(sc.key)}
                    className={`${styles.scopePill} ${scope === sc.key ? styles.scopePillActive : ''}`}
                  >
                    {sc.icon}
                    {sc.label}
                  </button>
                ))}
              </div>
            </div>

            {/* If Subject or Section Scope is chosen, provide Quick Subject Pills */}
            {(scope === 'subject' || scope === 'section') && subjects.length > 0 && (
              <div className={styles.subjectSelectorBar}>
                <div className={styles.subjectSelectorHeader}>
                  <div className={styles.subjectSelectorTitle}>
                    <BookOpen size={15} className={styles.subjectSelectorIcon} />
                    <span>Select Enrolled Subject:</span>
                  </div>
                  <span className={styles.subjectBadge}>{subjects.length} Subjects</span>
                </div>

                <div className={styles.subjectPillsQuickList}>
                  {subjects.map((sub) => {
                    const isActive = selectedSubjectId === sub.section_subject_id;
                    return (
                      <button
                        key={sub.section_subject_id}
                        type="button"
                        onClick={() => setSelectedSubjectId(sub.section_subject_id)}
                        className={`${styles.subjectQuickPill} ${
                          isActive ? styles.subjectQuickPillActive : ''
                        }`}
                      >
                        {sub.subject_code ? `${sub.subject_code} · ` : ''}
                        {sub.subject_name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Search Input Row */}
            <div className={styles.searchRow}>
              <div className={styles.searchBox}>
                <Search size={16} style={{ color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Search students in cohort by name or roll number…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={styles.searchInput}
                />
              </div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>
                Showing {cohortSize} students · {scope.charAt(0).toUpperCase() + scope.slice(1)} Cohort
                {scope === 'subject' && ` (${activeSubjectName})`}
              </div>
            </div>
          </div>

          {loadingCohort ? (
            <div className={styles.loadingBox}>
              <Loader2 size={22} className={styles.spinner} />
              <span>Updating cohort leaderboard…</span>
            </div>
          ) : (
            <>
              {/* Top 3 Visual Podium */}
              {podiumStudents.length === 3 && (
                <div className={styles.podium}>
                  {podiumStudents.map((student) => (
                    <div
                      key={student.student_id}
                      className={`${styles.podiumCard} ${student.isFirst ? styles.podiumFirst : ''}`}
                    >
                      <div className={styles.podiumBadge}>{student.medal}</div>
                      <div
                        className={styles.podiumAvatar}
                        style={{ background: getAvatarColor(student.name) }}
                      >
                        {getInitials(student.name)}
                      </div>
                      <p className={styles.podiumName}>
                        {student.name}
                        {student.is_current_user && (
                          <span className={styles.youTag} style={{ marginLeft: 6 }}>
                            YOU
                          </span>
                        )}
                      </p>
                      <p className={styles.podiumScore}>{Math.round(student.rank_score)} pts</p>
                      <span
                        style={{
                          fontSize: '11.5px',
                          fontWeight: 700,
                          color: student.isFirst ? '#b45309' : '#64748b',
                        }}
                      >
                        {percentileText(student.percentile, cohortSize, student.position)} · #{student.position}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Ranked Cohort Table */}
              <div className={styles.tableCard}>
                {pagedItems.length === 0 ? (
                  <div className={styles.emptyCohortNotice}>
                    {search ? `No students found matching "${search}".` : 'No cohort rankings found for this scope.'}
                  </div>
                ) : (
                  <>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th style={{ width: 60 }}>Rank</th>
                          <th>Student</th>
                          <th>Holistic Score</th>
                          <th>Percentile</th>
                          <th>Mastery</th>
                          <th>Engagement</th>
                          <th>Effort</th>
                          <th>Efficiency</th>
                          <th>Consistency</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedItems.map((item) => {
                          const isCurrentUser = item.is_current_user;
                          const pos = item.position;
                          const isMedal = pos <= 3;
                          const medalEmoji = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : null;

                          return (
                            <tr
                              key={item.student_id}
                              className={isCurrentUser ? styles.myRow : ''}
                            >
                              <td>
                                <span className={`${styles.rankPill} ${isMedal ? styles.rankTop : ''}`}>
                                  {medalEmoji || `#${pos}`}
                                </span>
                              </td>
                              <td>
                                <div className={styles.studentCell}>
                                  <div
                                    className={styles.studentAvatar}
                                    style={{ background: getAvatarColor(item.name) }}
                                  >
                                    {getInitials(item.name)}
                                  </div>
                                  <div>
                                    <div className={styles.studentName}>
                                      {item.name}
                                      {isCurrentUser && <span className={styles.youTag}>YOU</span>}
                                    </div>
                                    <div className={styles.studentRoll}>
                                      {item.student_id ? `ID: ${item.student_id.slice(0, 8)}…` : 'Student'}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className={styles.scoreTd}>{item.rank_score}</td>
                              <td style={{ fontWeight: 600, color: '#475569' }}>
                                {percentileText(item.percentile, cohortSize, item.position)}
                              </td>
                              <td>
                                <div className={styles.progressBar} title={`Mastery: ${item.mastery}`}>
                                  <div
                                    className={styles.progressFill}
                                    style={{ width: `${Math.min(item.mastery || 0, 100)}%`, background: '#9333ea' }}
                                  />
                                </div>
                              </td>
                              <td>
                                <div className={styles.progressBar} title={`Engagement: ${item.engagement}`}>
                                  <div
                                    className={styles.progressFill}
                                    style={{ width: `${Math.min(item.engagement || 0, 100)}%`, background: '#10b981' }}
                                  />
                                </div>
                              </td>
                              <td>
                                <div className={styles.progressBar} title={`Effort: ${item.effort}`}>
                                  <div
                                    className={styles.progressFill}
                                    style={{ width: `${Math.min(item.effort || 0, 100)}%`, background: '#f59e0b' }}
                                  />
                                </div>
                              </td>
                              <td>
                                <div className={styles.progressBar} title={`Efficiency: ${item.efficiency}`}>
                                  <div
                                    className={styles.progressFill}
                                    style={{ width: `${Math.min(item.efficiency || 0, 100)}%`, background: '#ec4899' }}
                                  />
                                </div>
                              </td>
                              <td>
                                <div className={styles.progressBar} title={`Consistency: ${item.consistency}`}>
                                  <div
                                    className={styles.progressFill}
                                    style={{ width: `${Math.min(item.consistency || 0, 100)}%`, background: '#6366f1' }}
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className={styles.paginationRow}>
                        <span className={styles.pageInfo}>
                          Showing {(page - 1) * pageSize + 1} to{' '}
                          {Math.min(page * pageSize, filteredAcademicItems.length)} of{' '}
                          {filteredAcademicItems.length} students
                        </span>
                        <div className={styles.pageBtns}>
                          <button
                            type="button"
                            className={styles.pageBtn}
                            disabled={page === 1}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                          >
                            <ChevronLeft size={15} /> Previous
                          </button>
                          <span style={{ fontSize: '13px', fontWeight: 700, padding: '0 8px' }}>
                            {page} / {totalPages}
                          </span>
                          <button
                            type="button"
                            className={styles.pageBtn}
                            disabled={page >= totalPages}
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          >
                            Next <ChevronRight size={15} />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}

          {/* Sticky Student Bar */}
          {currentUserEntry && (
            <div className={styles.stickyUserBar}>
              <div className={styles.stickyLeft}>
                <div className={styles.stickyRankCircle}>
                  #{currentUserEntry.position}
                </div>
                <div>
                  <p className={styles.stickyTitle}>Your Position in Current Scope</p>
                  <p className={styles.stickySub}>
                    Rank #{currentUserEntry.position} of {cohortSize} {cohortSize === 1 ? 'student' : 'students'} ·{' '}
                    {percentileText(currentUserEntry.percentile, cohortSize, currentUserEntry.position)}
                    {scope === 'subject' && ` · ${activeSubjectName}`}
                  </p>
                </div>
              </div>
              <div className={styles.stickyRight}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: '#c4b5fd', fontWeight: 600 }}>COMPOSITE SCORE</div>
                  <div className={styles.stickyScore}>{currentUserEntry.rank_score} pts</div>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        /* ── Competitive Platform Track ── */
        <div className={styles.tableCard}>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#1e1b4b', margin: '0 0 4px' }}>
              ⚡ Global Competitive Arena
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
              Real-time problem-solving leaderboard based on platform rating and solve velocity
            </p>
          </div>

          {loadingCohort ? (
            <div className={styles.loadingBox}>
              <Loader2 size={22} className={styles.spinner} />
              <span>Loading platform leaderboard…</span>
            </div>
          ) : platformData?.leaderboard && platformData.leaderboard.length > 0 ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Rank</th>
                  <th>Coder</th>
                  <th>Rating</th>
                  <th>Level</th>
                  <th>Solved</th>
                  <th>Difficulty Breakdown</th>
                </tr>
              </thead>
              <tbody>
                {platformData.leaderboard.map((item) => (
                  <tr
                    key={item.student_id}
                    className={item.is_current_user ? styles.myRow : ''}
                  >
                    <td>
                      <span
                        className={`${styles.rankPill} ${item.position <= 3 ? styles.rankTop : ''}`}
                      >
                        {item.position === 1 ? '🥇' : item.position === 2 ? '🥈' : item.position === 3 ? '🥉' : `#${item.position}`}
                      </span>
                    </td>
                    <td>
                      <div className={styles.studentCell}>
                        <div
                          className={styles.studentAvatar}
                          style={{ background: getAvatarColor(item.full_name) }}
                        >
                          {getInitials(item.full_name)}
                        </div>
                        <div>
                          <div className={styles.studentName}>
                            {item.full_name}
                            {item.is_current_user && <span className={styles.youTag}>YOU</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className={styles.scoreTd}>{Math.round(item.rating)}</td>
                    <td>
                      <span
                        style={{
                          fontSize: '11.5px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 6,
                          background: '#ede9fe',
                          color: '#6d28d9',
                        }}
                      >
                        Lv.{item.level} {item.level_name}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{item.problems_solved}</td>
                    <td style={{ fontWeight: 600, color: '#64748b', fontSize: '12px' }}>
                      <span style={{ color: '#10b981' }}>{item.easy_solved} Easy</span> ·{' '}
                      <span style={{ color: '#f59e0b' }}>{item.medium_solved} Med</span> ·{' '}
                      <span style={{ color: '#ef4444' }}>{item.hard_solved} Hard</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className={styles.emptyCohortNotice}>
              No platform leaderboard data found.
            </div>
          )}
        </div>
      )}
    </StudentShell>
  );
}
