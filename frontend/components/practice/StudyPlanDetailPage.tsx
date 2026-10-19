'use client';
/**
 * StudyPlanDetailPage — Redesigned High-Fidelity Study Plan Experience
 * Used by:
 *   /practice/library/study-plans/[slug]
 *   /student/practice/study-plans/[slug]
 */
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChevronDown,
  CheckCircle2,
  Circle,
  Clock,
  Sparkles,
  Zap,
  BookOpen,
  Layers,
  Award,
  Trophy,
  Search,
  ChevronsUpDown,
  ArrowRight,
  Calendar,
  Check,
  Flame,
  FileText,
} from 'lucide-react';
import styles from './StudyPlanDetailPage.module.css';
import { apiClient } from '@/services/api-client';
import { practiceExtraService } from '@/services/practice-extra.service';

interface ProblemRow {
  id: string;
  slug: string;
  lc_id?: string;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | string;
  nexlab_topic?: string;
  status: 'solved' | 'attempted' | 'todo' | string;
}

interface Section {
  id: string;
  title: string;
  order_index: number;
  problems: ProblemRow[];
  solved_count: number;
}

interface Plan {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon: string;
  total_problems: number;
  difficulty_mix: string;
  tag?: string;
  estimated_days: number;
  badge_id?: string;
}

interface Progress {
  id?: string;
  solved_slugs: string[];
  completed_at: string | null;
}

export default function StudyPlanDetailPage({
  planSlug,
  baseRoute,
}: {
  planSlug: string;
  baseRoute: string;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [enrolling, setEnrolling] = useState(false);
  const [downloadingCert, setDownloadingCert] = useState(false);
  const [loading, setLoading] = useState(true);
  const [certificateReady, setCertificateReady] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState<'All' | 'Easy' | 'Medium' | 'Hard'>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Solved' | 'Todo'>('All');

  useEffect(() => {
    let isMounted = true;
    const loadPlan = async () => {
      setLoading(true);
      try {
        const res = await apiClient.get(`/practice/plans/${planSlug}`);
        if (!isMounted) return;
        setCertificateReady(!!res.data.certificate_ready);
        setPlan(res.data.plan);
        const fetchedSections: Section[] = res.data.sections || [];
        setSections(fetchedSections);
        setProgress(res.data.progress || null);

        // Open all sections by default so the user sees their roadmaps immediately
        if (fetchedSections.length) {
          setOpenSections(new Set(fetchedSections.map((s) => s.id)));
        }
      } catch (e) {
        console.error('Failed to load study plan detail:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadPlan();
    return () => {
      isMounted = false;
    };
  }, [planSlug]);

  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const s = new Set(prev);
      if (s.has(id)) {
        s.delete(id);
      } else {
        s.add(id);
      }
      return s;
    });
  };

  const toggleAllSections = () => {
    if (openSections.size === sections.length) {
      setOpenSections(new Set());
    } else {
      setOpenSections(new Set(sections.map((s) => s.id)));
    }
  };

  const enroll = async () => {
    if (!plan) return;
    setEnrolling(true);
    try {
      await apiClient.post(`/practice/plans/${plan.id}/enroll`);
      setProgress({ solved_slugs: [], completed_at: null });
    } catch (e) {
      console.error('Failed to enroll in study plan:', e);
    } finally {
      setEnrolling(false);
    }
  };

  const handleDownloadCert = async () => {
    if (!plan) return;
    setDownloadingCert(true);
    try {
      await practiceExtraService.downloadCertificate(plan.id);
    } catch (err) {
      console.error('Failed to download certificate:', err);
    } finally {
      setDownloadingCert(false);
    }
  };

  // Find first unsolved problem across sections
  const firstUnsolvedSlug = useMemo(() => {
    for (const sec of sections) {
      for (const p of sec.problems) {
        if (p.status !== 'solved') return p.slug;
      }
    }
    return sections[0]?.problems[0]?.slug || null;
  }, [sections]);

  // Difficulty counts breakdown
  const diffCounts = useMemo(() => {
    let easy = 0,
      medium = 0,
      hard = 0;
    sections.forEach((sec) => {
      sec.problems.forEach((p) => {
        if (p.difficulty === 'Easy') easy++;
        else if (p.difficulty === 'Medium') medium++;
        else if (p.difficulty === 'Hard') hard++;
      });
    });
    return { easy, medium, hard };
  }, [sections]);

  // Filtered sections & problems
  const filteredSections = useMemo(() => {
    return sections
      .map((sec) => {
        const matchingProblems = sec.problems.filter((p) => {
          if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            const matchTitle = p.title.toLowerCase().includes(q);
            const matchTopic = (p.nexlab_topic || '').toLowerCase().includes(q);
            const matchLc = (p.lc_id || '').toLowerCase().includes(q);
            if (!matchTitle && !matchTopic && !matchLc) return false;
          }
          if (difficultyFilter !== 'All' && p.difficulty !== difficultyFilter) {
            return false;
          }
          if (statusFilter === 'Solved' && p.status !== 'solved') {
            return false;
          }
          if (statusFilter === 'Todo' && p.status === 'solved') {
            return false;
          }
          return true;
        });

        return {
          ...sec,
          problems: matchingProblems,
        };
      })
      .filter((sec) => sec.problems.length > 0 || !searchQuery.trim());
  }, [sections, searchQuery, difficultyFilter, statusFilter]);

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
        <div className={styles.loadingText}>Loading curriculum and problems…</div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className={styles.container}>
        <button
          className={styles.backBtn}
          onClick={() => router.push(`${baseRoute}?tab=plans`)}
        >
          <ArrowLeft size={15} /> Back to Study Plans
        </button>
        <div className={styles.emptyState}>
          <h3 className={styles.emptyStateTitle}>Study Plan Not Found</h3>
          <p className={styles.emptyStateDesc}>
            The requested study plan could not be found or has been moved.
          </p>
        </div>
      </div>
    );
  }

  const totalProblems = plan.total_problems || sections.reduce((acc, s) => acc + s.problems.length, 0);
  const totalSolved = progress?.solved_slugs?.length || 0;
  const pct = totalProblems ? Math.min(100, Math.round((totalSolved / totalProblems) * 100)) : 0;
  const enrolled = !!progress;
  const isCompleted = !!progress?.completed_at || pct === 100;
  const remaining = Math.max(0, totalProblems - totalSolved);

  const getDifficultyClass = (diff: string) => {
    if (diff === 'Easy') return styles.diffEasy;
    if (diff === 'Medium') return styles.diffMedium;
    if (diff === 'Hard') return styles.diffHard;
    return '';
  };

  return (
    <div className={styles.container}>
      {/* ── 1. Top Navigation Bar ── */}
      <div className={styles.topNav}>
        <button
          className={styles.backBtn}
          onClick={() => router.push(`${baseRoute}?tab=plans`)}
          type="button"
        >
          <ArrowLeft size={15} />
          <span>Back to Study Plans</span>
        </button>

        <div className={styles.topMetaBadge}>
          <Sparkles size={13} />
          <span>Official NexLab Mastery Track</span>
        </div>
      </div>

      {/* ── 2. Celebratory Banner if Completed ── */}
      {isCompleted && (
        <div className={styles.completedBanner}>
          <div className={styles.completedBannerLeft}>
            <span className={styles.completedTrophy}>🏆</span>
            <div>
              <h3 className={styles.completedTitle}>Plan Completed! Outstanding Work!</h3>
              <p className={styles.completedSub}>
                You have solved all problems in {plan.title}. Your official certificate of completion is ready.
              </p>
            </div>
          </div>
          {certificateReady && (
            <button
              className={`${styles.actionBtn} ${styles.certBtn}`}
              onClick={handleDownloadCert}
              disabled={downloadingCert}
              type="button"
            >
              <Award size={16} />
              <span>{downloadingCert ? 'Downloading…' : 'Download Certificate (PDF)'}</span>
            </button>
          )}
        </div>
      )}

      {/* ── 3. Hero Card ── */}
      <div className={styles.heroCard}>
        <div className={styles.heroLeft}>
          <div className={styles.heroHeaderRow}>
            <div className={styles.heroIconBox}>
              {plan.icon || '🎯'}
            </div>
            <div className={styles.heroTitleCol}>
              <div className={styles.heroTagRow}>
                <span className={styles.planTag}>{plan.tag || 'Curated Plan'}</span>
                {enrolled && (
                  <span className={`${styles.chip} ${styles.chipSuccess}`}>
                    <Check size={12} strokeWidth={2.5} /> Enrolled
                  </span>
                )}
              </div>
              <h1 className={styles.heroTitle}>{plan.title}</h1>
            </div>
          </div>

          <p className={styles.heroDesc}>{plan.description}</p>

          <div className={styles.heroChips}>
            <div className={`${styles.chip} ${styles.chipPrimary}`}>
              <BookOpen size={13} />
              <span>{totalProblems} Problems</span>
            </div>
            <div className={styles.chip}>
              <span className={styles.difficultyDot} />
              <span>{plan.difficulty_mix || 'Easy – Hard'}</span>
            </div>
            {plan.estimated_days && (
              <div className={styles.chip}>
                <Calendar size={13} />
                <span>{plan.estimated_days} Days Est.</span>
              </div>
            )}
            <div className={styles.chip}>
              <Layers size={13} />
              <span>{sections.length} Chapters</span>
            </div>
          </div>
        </div>

        {/* Hero Right: Progress Card */}
        <div className={styles.heroRight}>
          <div>
            <div className={styles.progressHeader}>
              <span className={styles.progressLabel}>Your Progress</span>
              <span className={styles.progressPctBadge}>{pct}% Complete</span>
            </div>

            <div className={styles.progressNums}>
              <span className={styles.progressCurrent}>{totalSolved}</span>
              <span className={styles.progressTotal}>/ {totalProblems} Solved</span>
            </div>

            <div className={styles.progressBarTrack}>
              <div className={styles.progressBarFill} style={{ width: `${pct}%` }} />
            </div>

            <div className={styles.progressSubtext}>
              {pct === 100
                ? 'All roadmap problems mastered!'
                : `${remaining} problems remaining to achieve mastery`}
            </div>
          </div>

          <div>
            {!enrolled ? (
              <button
                className={`${styles.actionBtn} ${styles.startBtn}`}
                onClick={enroll}
                disabled={enrolling}
                type="button"
              >
                <Zap size={16} />
                <span>{enrolling ? 'Enrolling…' : 'Start This Plan'}</span>
              </button>
            ) : isCompleted && certificateReady ? (
              <button
                className={`${styles.actionBtn} ${styles.certBtn}`}
                onClick={handleDownloadCert}
                disabled={downloadingCert}
                type="button"
              >
                <Award size={16} />
                <span>{downloadingCert ? 'Downloading…' : 'Download Certificate'}</span>
              </button>
            ) : (
              <button
                className={`${styles.actionBtn} ${styles.continueBtn}`}
                onClick={() => {
                  if (firstUnsolvedSlug) {
                    router.push(`${baseRoute}/${firstUnsolvedSlug}`);
                  }
                }}
                type="button"
              >
                <span>Continue Practice</span>
                <ArrowRight size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── 4. Highlight Stats Strip ── */}
      <div className={styles.statsStrip}>
        <div className={styles.statStripCard}>
          <div className={styles.statStripIcon}>
            <Layers size={18} />
          </div>
          <div>
            <div className={styles.statStripVal}>{sections.length}</div>
            <div className={styles.statStripLabel}>Topic Chapters</div>
          </div>
        </div>

        <div className={styles.statStripCard}>
          <div className={`${styles.statStripIcon} ${styles.statStripIconGreen}`}>
            <CheckCircle2 size={18} />
          </div>
          <div>
            <div className={styles.statStripVal}>{diffCounts.easy}</div>
            <div className={styles.statStripLabel}>Easy Foundation</div>
          </div>
        </div>

        <div className={styles.statStripCard}>
          <div className={`${styles.statStripIcon} ${styles.statStripIconAmber}`}>
            <Flame size={18} />
          </div>
          <div>
            <div className={styles.statStripVal}>{diffCounts.medium}</div>
            <div className={styles.statStripLabel}>Medium Core</div>
          </div>
        </div>

        <div className={styles.statStripCard}>
          <div className={`${styles.statStripIcon} ${styles.statStripIconBlue}`}>
            <Trophy size={18} />
          </div>
          <div>
            <div className={styles.statStripVal}>{diffCounts.hard}</div>
            <div className={styles.statStripLabel}>Hard Challenges</div>
          </div>
        </div>
      </div>

      {/* ── 5. Search & Filters Toolbar ── */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchBox}>
            <Search size={14} className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search problems by title, topic..."
              className={styles.searchInput}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className={styles.filterGroup}>
            {(['All', 'Easy', 'Medium', 'Hard'] as const).map((diff) => (
              <button
                key={diff}
                type="button"
                className={`${styles.filterBtn} ${difficultyFilter === diff ? styles.filterBtnActive : ''}`}
                onClick={() => setDifficultyFilter(diff)}
              >
                {diff}
              </button>
            ))}
          </div>

          <div className={styles.filterGroup}>
            {(['All', 'Solved', 'Todo'] as const).map((st) => (
              <button
                key={st}
                type="button"
                className={`${styles.filterBtn} ${statusFilter === st ? styles.filterBtnActive : ''}`}
                onClick={() => setStatusFilter(st)}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.toolbarRight}>
          <button
            type="button"
            className={styles.toggleAllBtn}
            onClick={toggleAllSections}
          >
            <ChevronsUpDown size={14} />
            <span>{openSections.size === sections.length ? 'Collapse All' : 'Expand All'}</span>
          </button>
        </div>
      </div>

      {/* ── 6. Section Accordion Cards ── */}
      <div className={styles.sectionsWrapper}>
        {filteredSections.length === 0 ? (
          <div className={styles.emptyState}>
            <h4 className={styles.emptyStateTitle}>No Matching Problems Found</h4>
            <p className={styles.emptyStateDesc}>
              Try adjusting your search query or difficulty filters to see roadmap problems.
            </p>
          </div>
        ) : (
          filteredSections.map((sec, secIdx) => {
            const isOpen = openSections.has(sec.id);
            const totalInSec = sec.problems.length;
            const solvedInSec = sec.problems.filter((p) => p.status === 'solved').length;
            const isSecDone = totalInSec > 0 && solvedInSec === totalInSec;

            return (
              <div key={sec.id} className={styles.sectionCard}>
                <div
                  className={styles.sectionHeader}
                  onClick={() => toggleSection(sec.id)}
                  role="button"
                  tabIndex={0}
                >
                  <div className={styles.sectionHeaderLeft}>
                    <div className={styles.sectionIndexBadge}>
                      {String(secIdx + 1).padStart(2, '0')}
                    </div>
                    <div>
                      <h3 className={styles.sectionTitle}>{sec.title}</h3>
                      <div className={styles.sectionProblemCount}>
                        {totalInSec} {totalInSec === 1 ? 'problem' : 'problems'}
                      </div>
                    </div>
                  </div>

                  <div className={styles.sectionHeaderRight}>
                    <div
                      className={`${styles.sectionProgressPill} ${
                        isSecDone
                          ? styles.sectionProgressComplete
                          : styles.sectionProgressIncomplete
                      }`}
                    >
                      {isSecDone ? (
                        <>
                          <Check size={12} strokeWidth={2.5} />
                          <span>All {totalInSec} Solved</span>
                        </>
                      ) : (
                        <span>
                          {solvedInSec} / {totalInSec} Solved
                        </span>
                      )}
                    </div>

                    <ChevronDown
                      size={18}
                      className={`${styles.chevronIcon} ${isOpen ? styles.chevronOpen : ''}`}
                    />
                  </div>
                </div>

                {isOpen && (
                  <div className={styles.problemsList}>
                    {sec.problems.map((p, idx) => {
                      const isSolved = p.status === 'solved';
                      const isAttempted = p.status === 'attempted';

                      return (
                        <div
                          key={p.id || p.slug}
                          className={styles.problemRow}
                          onClick={() => router.push(`${baseRoute}/${p.slug}`)}
                        >
                          <div className={styles.statusIconBox}>
                            {isSolved ? (
                              <CheckCircle2 size={18} className={styles.statusSolved} />
                            ) : isAttempted ? (
                              <Clock size={17} className={styles.statusAttempted} />
                            ) : (
                              <Circle size={17} className={styles.statusTodo} />
                            )}
                          </div>

                          <div className={styles.problemIndex}>
                            #{String(idx + 1).padStart(2, '0')}
                          </div>

                          <div className={styles.problemTitleCol}>
                            <span className={styles.problemTitle}>{p.title}</span>
                            {p.lc_id && (
                              <span className={styles.lcTag}>LC #{p.lc_id}</span>
                            )}
                            {p.nexlab_topic && (
                              <span className={styles.topicTag}>{p.nexlab_topic}</span>
                            )}
                          </div>

                          <span
                            className={`${styles.diffBadge} ${getDifficultyClass(p.difficulty)}`}
                          >
                            {p.difficulty}
                          </span>

                          <button
                            type="button"
                            className={styles.actionPillBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`${baseRoute}/${p.slug}`);
                            }}
                          >
                            <span>{isSolved ? 'Review' : 'Solve'}</span>
                            <ArrowRight size={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
