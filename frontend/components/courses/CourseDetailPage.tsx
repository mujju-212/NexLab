'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  freeService,
  type FreeCourse,
  type FreeExercise,
  type CourseUserProgress,
  type TopicSummaryItem,
  type FreeCourseLeaderboardItem,
} from '@/services/free.service';
import styles from './CourseDetailPage.module.css';
import {
  Code2, Zap, Clock, ArrowRight, Bookmark, Search,
  CheckCircle2, PlayCircle, Lock, Trophy, BarChart2,
  Crown, ChevronRight, BookOpen, FileText, MessageSquare,
  BookMarked, HelpCircle, FlaskConical, Sparkles, RefreshCw
} from 'lucide-react';

interface CourseDetailPageProps {
  courseId: string;
  basePath?: string; // '/practice' or '/student/courses'
}

export default function CourseDetailPage({ courseId, basePath = '/practice' }: CourseDetailPageProps) {
  const router = useRouter();

  const [course, setCourse] = useState<(FreeCourse & { estimated_hours?: string; topic_count?: number }) | null>(null);
  const [exercises, setExercises] = useState<FreeExercise[]>([]);
  const [userProgress, setUserProgress] = useState<CourseUserProgress | null>(null);
  const [topicsSummary, setTopicsSummary] = useState<TopicSummaryItem[]>([]);
  const [courseLeaderboard, setCourseLeaderboard] = useState<FreeCourseLeaderboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'problems' | 'topics' | 'discussion' | 'editorials' | 'leaderboard' | 'notes'>('problems');
  const [isSaved, setIsSaved] = useState(false);

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('All Topics');
  const [selectedDifficulty, setSelectedDifficulty] = useState('All Difficulty');
  const [sortOrder, setSortOrder] = useState('default');

  const loadData = useCallback(async () => {
    try {
      const data = await freeService.getCourse(courseId);
      setCourse(data.course);
      setExercises(data.exercises || []);
      if (data.user_progress) setUserProgress(data.user_progress);
      if (data.topics_summary) setTopicsSummary(data.topics_summary);
      const leaderboardData = await freeService.getLeaderboard(data.course.id).catch(() => ({ leaderboard: [] }));
      setCourseLeaderboard(leaderboardData.leaderboard || []);
    } catch (err) {
      console.error('Failed to load course details:', err);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Derived progress values (guaranteed 100% from real API payload)
  const totalExercisesCount = exercises.length;
  const solvedCount = userProgress?.solved_count ?? exercises.filter(e => e.is_solved).length;
  const attemptedCount = userProgress?.attempted_count ?? exercises.filter(e => e.is_attempted).length;
  const unsolvedCount = userProgress?.unsolved_count ?? Math.max(0, totalExercisesCount - solvedCount - attemptedCount);
  const totalXP = userProgress?.total_xp ?? exercises.reduce((acc, e) => acc + (e.xp_reward || 0), 0);
  const earnedXP = userProgress?.earned_xp ?? exercises.filter(e => e.is_solved).reduce((acc, e) => acc + (e.xp_reward || 0), 0);
  const pctSolved = totalExercisesCount ? Math.round((solvedCount / totalExercisesCount) * 100) : 0;
  const pctXP = totalXP ? Math.round((earnedXP / totalXP) * 100) : 0;

  // Next unsolved exercise to continue learning
  const nextExercise = useMemo(() => {
    return exercises.find(e => !e.is_solved) || exercises[0];
  }, [exercises]);

  // Topic filter options
  const topicFilterOptions = useMemo(() => {
    const list = ['All Topics'];
    topicsSummary.forEach(t => {
      if (!list.includes(t.name)) list.push(t.name);
    });
    return list;
  }, [topicsSummary]);

  // Filtered & sorted exercises
  const displayedExercises = useMemo(() => {
    let list = [...exercises];

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(e =>
        e.title.toLowerCase().includes(q) ||
        (e.tags && e.tags.some(t => t.toLowerCase().includes(q))) ||
        e.difficulty.toLowerCase().includes(q)
      );
    }

    // Topic dropdown
    if (selectedTopic !== 'All Topics') {
      list = list.filter(e => {
        if (!e.tags) return false;
        if (selectedTopic === 'Complexity Analysis') {
          return e.tags.some(t => ['Complexity Analysis', 'Complexity', 'Theory'].includes(t));
        }
        if (selectedTopic === 'Stacks & Queues') {
          return e.tags.some(t => ['Stacks', 'Queues'].includes(t));
        }
        return e.tags.includes(selectedTopic);
      });
    }

    // Difficulty dropdown
    if (selectedDifficulty !== 'All Difficulty') {
      list = list.filter(e => e.difficulty.toLowerCase() === selectedDifficulty.toLowerCase());
    }

    // Sort order
    if (sortOrder === 'xp-high') {
      list.sort((a, b) => b.xp_reward - a.xp_reward);
    } else if (sortOrder === 'acceptance-high') {
      list.sort((a, b) => a.acceptance_rate == null ? (b.acceptance_rate == null ? 0 : 1) : b.acceptance_rate == null ? -1 : b.acceptance_rate - a.acceptance_rate);
    } else if (sortOrder === 'solved-first') {
      list.sort((a, b) => (b.is_solved ? 1 : 0) - (a.is_solved ? 1 : 0));
    } else if (sortOrder === 'unsolved-first') {
      list.sort((a, b) => (a.is_solved ? 1 : 0) - (b.is_solved ? 1 : 0));
    } else {
      list.sort((a, b) => a.order_index - b.order_index);
    }

    return list;
  }, [exercises, searchQuery, selectedTopic, selectedDifficulty, sortOrder]);

  const handleExerciseAction = (ex: FreeExercise) => {
    if (basePath === '/student/courses') {
      router.push(`/student/courses/${courseId}/${ex.id}`);
    } else {
      router.push(`/practice/${courseId}/${ex.id}`);
    }
  };

  const handleContinue = () => {
    if (nextExercise) {
      handleExerciseAction(nextExercise);
    }
  };

  const handleViewStudyPlan = () => {
    router.push('/practice/library/study-plans');
  };

  // SVG Circular Donut calculations
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (pctSolved / 100) * circumference;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 12, color: '#64748b' }}>
        <RefreshCw size={24} className={styles.spinIcon} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: 15, fontWeight: 600 }}>Loading course details…</span>
      </div>
    );
  }

  if (!course) {
    return (
      <div className={styles.emptyState}>
        <p>Course not found or currently unavailable.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* ══════════════════════════════════════════════════════════════════════
          HERO GRID
          ══════════════════════════════════════════════════════════════════════ */}
      <div className={styles.heroGrid}>
        {/* Left Hero Card */}
        <div className={styles.heroLeftCard}>
          <div className={styles.heroContent}>
            <span className={styles.difficultyBadge}>{course.difficulty}</span>
            <h1 className={styles.courseTitle}>{course.title}</h1>
            <p className={styles.courseDesc}>{course.description}</p>

            {/* Topic pills */}
            <div className={styles.tagsRow}>
              {(course.tags || []).map(tag => (
                <span
                  key={tag}
                  className={styles.tagPill}
                  onClick={() => {
                    setSelectedTopic(tag);
                    setActiveTab('problems');
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* Metadata row */}
            <div className={styles.metaRow}>
              <span className={styles.metaItem}>
                <Code2 size={16} strokeWidth={2.2} color="#7c3aed" />
                {totalExercisesCount} Exercises
              </span>
              <span className={`${styles.metaItem} ${styles.metaItemXp}`}>
                <Zap size={16} strokeWidth={2.5} color="#d97706" />
                {totalXP} XP Total
              </span>
              {(topicsSummary.length > 0 || course.topic_count !== undefined) && (
                <span className={styles.metaItem}>
                  <BookMarked size={16} strokeWidth={2.2} color="#6366f1" />
                  {course.topic_count ?? topicsSummary.length} Topics
                </span>
              )}
              {course.estimated_hours && (
                <span className={styles.metaItem}>
                  <Clock size={16} strokeWidth={2.2} color="#64748b" />
                  Estimated {course.estimated_hours}
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className={styles.heroActions}>
              <button className={styles.primaryBtn} onClick={handleContinue}>
                Continue Learning <ArrowRight size={16} />
              </button>
              <button className={styles.secondaryBtn} onClick={handleViewStudyPlan}>
                <BookOpen size={16} /> View Study Plan
              </button>
            </div>
          </div>

          {/* Right 3D Isometric illustration */}
          <div className={styles.heroArtWrap}>
            <Image
              src={course.thumbnail_url || '/dsa-course-hero.jpg'}
              alt={course.title}
              width={260}
              height={260}
              className={styles.heroArtImg}
              priority
            />
          </div>
        </div>

        {/* Right Hero Card: Your Progress */}
        <div className={styles.progressCard}>
          <div className={styles.progressCardHead}>Your Progress</div>

          {/* Donut & Legend */}
          <div className={styles.progressDonutRow}>
            <div className={styles.donutWrap}>
              <svg className={styles.donutSvg} viewBox="0 0 100 100">
                <circle
                  className={styles.donutTrack}
                  cx="50"
                  cy="50"
                  r={radius}
                />
                <circle
                  className={styles.donutFill}
                  cx="50"
                  cy="50"
                  r={radius}
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                />
              </svg>
              <div className={styles.donutCenter}>
                <span className={styles.donutNumbers}>{solvedCount}/{totalExercisesCount}</span>
                <span className={styles.donutPct}>{pctSolved}%</span>
              </div>
            </div>

            <div className={styles.donutLegend}>
              <div className={styles.legendItem}>
                <span className={styles.legendDotSolved} />
                <span>{solvedCount} Solved</span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendDotAttempted} />
                <span>{attemptedCount} Attempted</span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendDotUnsolved} />
                <span>{unsolvedCount} Unsolved</span>
              </div>
            </div>
          </div>

          {/* XP Progress Bar */}
          <div className={styles.xpProgressRow}>
            <div className={styles.xpLabels}>
              <span className={styles.xpCurrent}>
                <Zap size={14} color="#d97706" /> {earnedXP} / {totalXP} XP
              </span>
              <span className={styles.xpPercent}>{pctXP}%</span>
            </div>
            <div className={styles.xpBarTrack}>
              <div className={styles.xpBarFill} style={{ width: `${pctXP}%` }} />
            </div>
          </div>

          {/* Bottom 3 Stat Chips */}
          <div className={styles.statChipsRow}>
            <div className={styles.statChip}>
              <Trophy size={16} color="#f59e0b" className={styles.statChipIcon} />
              <span className={styles.statChipVal}>{userProgress?.rank_in_course != null ? `#${userProgress.rank_in_course}` : '—'}</span>
              <span className={styles.statChipSub}>In Course</span>
            </div>
            <div className={styles.statChip}>
              <BarChart2 size={16} color="#8b5cf6" className={styles.statChipIcon} />
              <span className={styles.statChipVal}>{userProgress?.global_rank ?? '—'}</span>
              <span className={styles.statChipSub}>Global Rank</span>
            </div>
            <div className={styles.statChip}>
              <Crown size={16} color="#eab308" className={styles.statChipIcon} />
              <span className={styles.statChipVal}>{userProgress?.top_percentile != null ? `Top ${userProgress.top_percentile}%` : '—'}</span>
              <span className={styles.statChipSub}>Worldwide</span>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TABS ROW
          ══════════════════════════════════════════════════════════════════════ */}
      <div className={styles.tabsBar}>
        <div className={styles.tabGroup}>
          <button
            className={`${styles.tabBtn} ${activeTab === 'problems' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('problems')}
          >
            <Code2 size={15} /> Problems
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'topics' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('topics')}
          >
            <BookMarked size={15} /> Topics
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'discussion' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('discussion')}
          >
            <MessageSquare size={15} /> Discussion
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'editorials' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('editorials')}
          >
            <FileText size={15} /> Editorials
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'leaderboard' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('leaderboard')}
          >
            <Trophy size={15} /> Leaderboard
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'notes' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('notes')}
          >
            <BookOpen size={15} /> Notes
          </button>
        </div>

        <button
          className={`${styles.saveBtn} ${isSaved ? styles.saveBtnSaved : ''}`}
          onClick={() => setIsSaved(p => !p)}
        >
          <Bookmark size={15} fill={isSaved ? '#7c3aed' : 'none'} color={isSaved ? '#7c3aed' : '#475569'} />
          {isSaved ? 'Saved' : 'Save Course'}
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          MAIN TWO-COLUMN CONTENT
          ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'problems' && (
        <div className={styles.mainLayout}>
          {/* Left Column: Problems List */}
          <div className={styles.leftColumn}>
            <div className={styles.sectionBox}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionHeaderRow}>
                  <div className={styles.sectionIconBadge}>
                    <Code2 size={20} />
                  </div>
                  <div>
                    <h2 className={styles.sectionTitle}>
                      Course Problems ({displayedExercises.length})
                    </h2>
                    <p className={styles.sectionSubtitle}>
                      Solve problems to build your skills and earn XP
                    </p>
                  </div>
                </div>
              </div>

              {/* Filters Bar */}
              <div className={styles.filtersBar}>
                <div className={styles.searchWrap}>
                  <Search size={15} className={styles.searchIcon} />
                  <input
                    type="text"
                    placeholder="Search problems in this course..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={styles.searchInput}
                  />
                </div>

                <select
                  value={selectedTopic}
                  onChange={(e) => setSelectedTopic(e.target.value)}
                  className={styles.filterSelect}
                >
                  {topicFilterOptions.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>

                <select
                  value={selectedDifficulty}
                  onChange={(e) => setSelectedDifficulty(e.target.value)}
                  className={styles.filterSelect}
                >
                  <option value="All Difficulty">All Difficulty</option>
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>

                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  className={styles.filterSelect}
                >
                  <option value="default">Default Order</option>
                  <option value="xp-high">XP: High to Low</option>
                  <option value="acceptance-high">Acceptance: High to Low</option>
                  <option value="solved-first">Solved First</option>
                  <option value="unsolved-first">Unsolved First</option>
                </select>
              </div>

              {/* Problem Cards */}
              <div className={styles.problemList}>
                {displayedExercises.map((ex, index) => {
                  const isSolved = Boolean(ex.is_solved);
                  const isLocked = Boolean(ex.is_locked);

                  return (
                    <div
                      key={ex.id}
                      className={`${styles.problemCard} ${isSolved ? styles.problemCardSolved : ''}`}
                    >
                      <div className={styles.problemLeft}>
                        <div className={styles.problemIndex}>
                          {ex.order_index || index + 1}
                        </div>
                        <div className={styles.problemMainInfo}>
                          <div className={styles.problemTitleRow}>
                            <span
                              className={styles.problemTitle}
                              onClick={() => handleExerciseAction(ex)}
                            >
                              {ex.title}
                            </span>
                            {(ex.tags || []).slice(0, 2).map(tag => (
                              <span key={tag} className={styles.problemTagChip}>
                                {tag}
                              </span>
                            ))}
                          </div>
                          <div className={styles.problemStatsRow}>
                            <span>{ex.acceptance_rate != null ? `${ex.acceptance_rate}% acceptance` : 'Acceptance unavailable'}</span>
                            <span className={styles.problemStatSep}>•</span>
                            <span>{ex.solves_display ?? (ex.solves_count != null ? `${ex.solves_count} solves` : 'Solve count unavailable')}</span>
                          </div>
                        </div>
                      </div>

                      <div className={styles.problemRight}>
                        <span className={styles.xpBadge}>
                          <Zap size={13} fill="#f59e0b" color="#d97706" /> {ex.xp_reward} XP
                        </span>

                        {/* Status Icon */}
                        {isSolved ? (
                          <CheckCircle2 size={20} className={styles.statusIconSolved} />
                        ) : isLocked ? (
                          <Lock size={18} className={styles.statusIconLocked} />
                        ) : (
                          <PlayCircle size={20} className={styles.statusIconOpen} />
                        )}

                        {/* Action Button */}
                        <button
                          className={
                            isSolved
                              ? styles.actionBtnSolveAgain
                              : isLocked
                              ? styles.actionBtnUnlock
                              : styles.actionBtnSolve
                          }
                          onClick={() => handleExerciseAction(ex)}
                        >
                          {ex.action_label || (isSolved ? 'Solve Again' : isLocked ? 'Unlock' : 'Solve')}
                        </button>
                      </div>
                    </div>
                  );
                })}

                {displayedExercises.length === 0 && (
                  <div className={styles.emptyState}>
                    No problems match your current search and filters.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Topics & Resources */}
          <div className={styles.rightColumn}>
            {/* Card 1: Course Topics */}
            <div className={styles.sidebarCard}>
              <div className={styles.sidebarCardHead}>
                <div className={styles.sidebarCardTitleRow}>
                  <Code2 size={18} className={styles.sidebarCardIcon} />
                  <span className={styles.sidebarCardTitle}>
                    Course Topics ({course.topic_count ?? topicsSummary.length})
                  </span>
                </div>
                <button
                  className={styles.sidebarViewAllBtn}
                  onClick={() => setSelectedTopic('All Topics')}
                >
                  View All →
                </button>
              </div>

              <div className={styles.topicsList}>
                {topicsSummary.map((topic, i) => {
                  const isActive = selectedTopic === topic.name;
                  return (
                    <div
                      key={topic.name}
                      className={`${styles.topicRow} ${isActive ? styles.topicRowActive : ''}`}
                      onClick={() => setSelectedTopic(isActive ? 'All Topics' : topic.name)}
                    >
                      <div className={styles.topicLeft}>
                        <span className={styles.topicIndex}>{i + 1}</span>
                        <span className={styles.topicName}>{topic.name}</span>
                      </div>
                      <div className={styles.topicRight}>
                        <div className={styles.topicBarTrack}>
                          <div
                            className={styles.topicBarFill}
                            style={{ width: `${topic.pct}%` }}
                          />
                        </div>
                        <span className={styles.topicRatio}>
                          {topic.solved}/{topic.total}
                        </span>
                        <ChevronRight size={14} className={styles.topicArrow} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Card 2: Course Resources */}
            <div className={styles.sidebarCard}>
              <div className={styles.sidebarCardHead}>
                <div className={styles.sidebarCardTitleRow}>
                  <BookOpen size={18} className={styles.sidebarCardIcon} />
                  <span className={styles.sidebarCardTitle}>Course Resources</span>
                </div>
              </div>

              <div className={styles.resourcesList}>
                <div
                  className={styles.resourceItem}
                  onClick={() => setActiveTab('notes')}
                >
                  <div className={styles.resourceLeft}>
                    <div className={styles.resourceIconWrapNotes}>
                      <BookOpen size={18} />
                    </div>
                    <div className={styles.resourceInfo}>
                      <span className={styles.resourceTitle}>Course Notes</span>
                      <span className={styles.resourceDesc}>
                        Handwritten-style notes for quick revision
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={16} className={styles.resourceArrow} />
                </div>

                <div
                  className={styles.resourceItem}
                  onClick={() => setActiveTab('editorials')}
                >
                  <div className={styles.resourceLeft}>
                    <div className={styles.resourceIconWrapEditorials}>
                      <FileText size={18} />
                    </div>
                    <div className={styles.resourceInfo}>
                      <span className={styles.resourceTitle}>Editorials</span>
                      <span className={styles.resourceDesc}>
                        Detailed solutions and explanations
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={16} className={styles.resourceArrow} />
                </div>

                <div
                  className={styles.resourceItem}
                  onClick={() => setActiveTab('discussion')}
                >
                  <div className={styles.resourceLeft}>
                    <div className={styles.resourceIconWrapDiscuss}>
                      <MessageSquare size={18} />
                    </div>
                    <div className={styles.resourceInfo}>
                      <span className={styles.resourceTitle}>Discuss</span>
                      <span className={styles.resourceDesc}>
                        Ask questions and learn with the community
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={16} className={styles.resourceArrow} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alternate Tabs: Topics, Discussion, Editorials, Leaderboard, Notes */}
      {activeTab === 'topics' && (
        <div className={styles.sectionBox}>
          <h2 className={styles.sectionTitle}>Course Syllabus &amp; Topics</h2>
          <p className={styles.sectionSubtitle}>
            Full curriculum breakdown across all 8 modules.
          </p>
          <div className={styles.topicsList} style={{ marginTop: 12 }}>
            {topicsSummary.map((topic, i) => (
              <div
                key={topic.name}
                className={styles.topicRow}
                onClick={() => {
                  setSelectedTopic(topic.name);
                  setActiveTab('problems');
                }}
              >
                <div className={styles.topicLeft}>
                  <span className={styles.topicIndex}>{i + 1}</span>
                  <span className={styles.topicName} style={{ fontSize: 15, fontWeight: 700 }}>
                    {topic.name}
                  </span>
                </div>
                <div className={styles.topicRight}>
                  <div className={styles.topicBarTrack} style={{ width: 120, height: 8 }}>
                    <div className={styles.topicBarFill} style={{ width: `${topic.pct}%` }} />
                  </div>
                  <span className={styles.topicRatio} style={{ fontSize: 13, fontWeight: 700 }}>
                    {topic.solved}/{topic.total} ({topic.pct}%)
                  </span>
                  <ChevronRight size={16} className={styles.topicArrow} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'discussion' && (
        <div className={styles.sectionBox}>
          <h2 className={styles.sectionTitle}>Community Discussion</h2>
          <p className={styles.sectionSubtitle}>
            Join discussion threads, compare approaches, and get help from fellow engineers.
          </p>
          <div className={styles.emptyState}>
            No discussion threads have been added for this course yet.
          </div>
        </div>
      )}

      {activeTab === 'editorials' && (
        <div className={styles.sectionBox}>
          <h2 className={styles.sectionTitle}>Solution Editorials</h2>
          <p className={styles.sectionSubtitle}>
            Official visual editorials and complexity breakdowns for all problems.
          </p>
          <div className={styles.emptyState}>
            No official editorials have been added for this course yet.
          </div>
        </div>
      )}

      {activeTab === 'leaderboard' && (
        <div className={styles.sectionBox}>
          <h2 className={styles.sectionTitle}>Course Leaderboard</h2>
          <p className={styles.sectionSubtitle}>
            Top learners in Data Structures &amp; Algorithms by XP and solved problems.
          </p>
          {courseLeaderboard.length ? (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {courseLeaderboard.map((entry) => (
                <div key={entry.user_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: entry.rank === 1 ? '#f5f3ff' : '#f8fafc', borderRadius: 10, fontWeight: entry.rank === 1 ? 700 : 500, color: entry.rank === 1 ? '#7c3aed' : '#475569' }}>
                  <span>#{entry.rank} {entry.name}</span>
                  <span>⚡ {entry.xp} XP • {entry.solved} solved</span>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState} style={{ marginTop: 16 }}>
              No learners have completed an exercise in this course yet.
            </div>
          )}
        </div>
      )}

      {activeTab === 'notes' && (
        <div className={styles.sectionBox}>
          <h2 className={styles.sectionTitle}>Course Revision Notes</h2>
          <p className={styles.sectionSubtitle}>
            Curated cheat sheets on Big-O complexity, Two Pointers, Sliding Window, and Tree Traversals.
          </p>
          <div className={styles.emptyState}>
            No revision notes have been added for this course yet.
          </div>
        </div>
      )}
    </div>
  );
}
