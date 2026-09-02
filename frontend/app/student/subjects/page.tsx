'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import StudentShell from '@/components/layout/StudentShell';
import { studentService } from '@/services/student.service';
import type { SectionSubject, Experiment } from '@/types';
import {
  LayoutGrid, List, ChevronDown, ChevronUp, CheckCircle2,
  Clock, Circle, MoreVertical, ArrowRight, Sparkles,
  BookOpen, FlaskConical, Loader2, PlayCircle, Layers
} from 'lucide-react';
import styles from './page.module.css';

import { getSubjectIconDef } from '@/lib/subject-icons';

function getSubjectIcon(sub?: Partial<SectionSubject>, index = 0): { src?: string; gradient: string } {
  const def = getSubjectIconDef(sub?.icon || sub?.subject_icon, sub?.subject_code, sub?.subject_name, index);
  return {
    src: def.src,
    gradient: def.gradient,
  };
}

export default function StudentSubjectsPage() {
  const router = useRouter();

  const [subjects, setSubjects] = useState<SectionSubject[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [experimentsMap, setExperimentsMap] = useState<Record<string, Experiment[]>>({});
  const [loadingExps, setLoadingExps] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filtering & View Modes
  const [filter, setFilter] = useState<'all' | 'in_progress' | 'completed' | 'not_started'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'progress'>('recent');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  // Load enrolled subjects
  useEffect(() => {
    let cancelled = false;
    studentService.getSubjects()
      .then(list => {
        if (cancelled) return;
        setSubjects(list);
        // Default expand the first in-progress subject or CS3401, or the first card
        const initial = list.find(s => s.subject_code === 'CS3401') ||
                        list.find(s => s.status === 'in_progress') ||
                        list[0];
        if (initial) {
          setExpandedId(initial.section_subject_id);
        }
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load subjects');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  // Fetch experiments when a subject is expanded
  const fetchExperimentsForSubject = useCallback(async (sectionSub: SectionSubject) => {
    const key = sectionSub.section_subject_id;
    if (experimentsMap[key] || loadingExps[key]) return;

    setLoadingExps(prev => ({ ...prev, [key]: true }));
    try {
      const exps = await studentService.getExperiments(sectionSub.subject_id);
      setExperimentsMap(prev => ({ ...prev, [key]: exps }));
    } catch {
      setExperimentsMap(prev => ({ ...prev, [key]: [] }));
    } finally {
      setLoadingExps(prev => ({ ...prev, [key]: false }));
    }
  }, [experimentsMap, loadingExps]);

  // Trigger loading experiments for expanded card
  useEffect(() => {
    if (!expandedId) return;
    const sub = subjects.find(s => s.section_subject_id === expandedId);
    if (sub) {
      fetchExperimentsForSubject(sub);
    }
  }, [expandedId, subjects, fetchExperimentsForSubject]);

  // Status counts
  const counts = useMemo(() => {
    let inProgress = 0;
    let completed = 0;
    let notStarted = 0;
    subjects.forEach(s => {
      if (s.status === 'completed') completed++;
      else if (s.status === 'in_progress') inProgress++;
      else notStarted++;
    });
    return {
      all: subjects.length,
      in_progress: inProgress,
      completed,
      not_started: notStarted,
    };
  }, [subjects]);

  // Filtered & Sorted list
  const filteredSubjects = useMemo(() => {
    let list = [...subjects];

    // Status filter
    if (filter === 'in_progress') {
      list = list.filter(s => s.status === 'in_progress');
    } else if (filter === 'completed') {
      list = list.filter(s => s.status === 'completed');
    } else if (filter === 'not_started') {
      list = list.filter(s => s.status === 'not_started');
    }

    // Sort
    if (sortBy === 'name') {
      list.sort((a, b) => a.subject_name.localeCompare(b.subject_name));
    } else if (sortBy === 'progress') {
      list.sort((a, b) => (b.progress_percentage || 0) - (a.progress_percentage || 0));
    }

    return list;
  }, [subjects, filter, sortBy]);

  // Toggle card expansion
  const toggleExpand = (sectionSubjectId: string) => {
    setExpandedId(prev => (prev === sectionSubjectId ? null : sectionSubjectId));
  };

  // Close sort menu on outside click
  useEffect(() => {
    if (!sortMenuOpen) return;
    const handleClose = () => setSortMenuOpen(false);
    window.addEventListener('click', handleClose);
    return () => window.removeEventListener('click', handleClose);
  }, [sortMenuOpen]);

  // Radial progress stroke calculation
  const renderRadialDial = (percentage = 0, size = 64, strokeWidth = 5) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
      <div className={styles.radialProgressBox} style={{ width: size, height: size }}>
        <svg className={styles.radialSvg} viewBox={`0 0 ${size} ${size}`}>
          <circle
            className={styles.radialBgCircle}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
          />
          <circle
            className={styles.radialProgressCircle}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
          />
        </svg>
        <span className={styles.radialCenterText}>{percentage}%</span>
      </div>
    );
  };

  return (
    <StudentShell activePage="My Subjects">
      <div className={styles.pageContainer}>

        {/* ══ TOP HERO BANNER ══ */}
        <header className={styles.heroBanner}>
          <div className={styles.heroLeft}>
            <h1 className={styles.pageTitle}>My Subjects</h1>
            <p className={styles.pageSubtitle}>
              Continue learning from your enrolled subjects and start experimenting.
            </p>
          </div>

          <div className={styles.heroRight}>
            <div className={styles.quoteCallout}>
              <span className={styles.quoteText}>&ldquo;Small Experiments</span>
              <span className={styles.quoteSub}>Big Understanding&rdquo;</span>
            </div>
            <div className={styles.heroIllustrationBox}>
              <Image
                src="/subjects/hero-lab.jpg"
                alt="Interactive Lab Experiments"
                width={96}
                height={96}
                className={styles.heroImg}
                priority
              />
            </div>
          </div>
        </header>

        {/* ══ FILTER TABS & CONTROLS ══ */}
        <section className={styles.controlsBar}>
          <div className={styles.filterTabs}>
            <button
              className={`${styles.filterPill} ${filter === 'all' ? styles.filterPillActive : ''}`}
              onClick={() => setFilter('all')}
            >
              <span>All Subjects</span>
              <span className={styles.pillBadge}>{counts.all}</span>
            </button>

            <button
              className={`${styles.filterPill} ${filter === 'in_progress' ? styles.filterPillActive : ''}`}
              onClick={() => setFilter('in_progress')}
            >
              <Clock size={13} />
              <span>In Progress</span>
              <span className={styles.pillBadge}>{counts.in_progress}</span>
            </button>

            <button
              className={`${styles.filterPill} ${filter === 'completed' ? styles.filterPillActive : ''}`}
              onClick={() => setFilter('completed')}
            >
              <CheckCircle2 size={13} />
              <span>Completed</span>
              <span className={styles.pillBadge}>{counts.completed}</span>
            </button>

            <button
              className={`${styles.filterPill} ${filter === 'not_started' ? styles.filterPillActive : ''}`}
              onClick={() => setFilter('not_started')}
            >
              <Circle size={13} />
              <span>Not Started</span>
              <span className={styles.pillBadge}>{counts.not_started}</span>
            </button>
          </div>

          <div className={styles.viewAndSortControls}>
            {/* View Mode Toggle */}
            <div className={styles.viewToggleGroup}>
              <button
                className={`${styles.viewBtn} ${viewMode === 'grid' ? styles.viewBtnActive : ''}`}
                onClick={() => setViewMode('grid')}
                title="Grid view"
              >
                <LayoutGrid size={14} />
                <span>Grid</span>
              </button>
              <button
                className={`${styles.viewBtn} ${viewMode === 'list' ? styles.viewBtnActive : ''}`}
                onClick={() => setViewMode('list')}
                title="List view"
              >
                <List size={14} />
                <span>List</span>
              </button>
            </div>

            {/* Sort Dropdown */}
            <div className={styles.sortDropdownContainer} onClick={e => e.stopPropagation()}>
              <button
                className={styles.sortBtn}
                onClick={() => setSortMenuOpen(o => !o)}
              >
                <span>
                  Sort by: <strong>{sortBy === 'recent' ? 'Recent' : sortBy === 'name' ? 'Name' : 'Progress'}</strong>
                </span>
                <ChevronDown size={14} />
              </button>

              {sortMenuOpen && (
                <div className={styles.sortMenu}>
                  <button
                    className={`${styles.sortOption} ${sortBy === 'recent' ? styles.sortOptionActive : ''}`}
                    onClick={() => { setSortBy('recent'); setSortMenuOpen(false); }}
                  >
                    Recent
                  </button>
                  <button
                    className={`${styles.sortOption} ${sortBy === 'name' ? styles.sortOptionActive : ''}`}
                    onClick={() => { setSortBy('name'); setSortMenuOpen(false); }}
                  >
                    Subject Name
                  </button>
                  <button
                    className={`${styles.sortOption} ${sortBy === 'progress' ? styles.sortOptionActive : ''}`}
                    onClick={() => { setSortBy('progress'); setSortMenuOpen(false); }}
                  >
                    Highest Progress
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ══ LOADING & ERROR STATES ══ */}
        {loading && (
          <div className={styles.loadingContainer}>
            <Loader2 size={28} className="animate-spin" style={{ color: '#7c3aed' }} />
            <span>Loading your enrolled curriculum…</span>
          </div>
        )}

        {error && (
          <div className={styles.emptyStateCard}>
            <p className={styles.emptyTitle}>⚠️ {error}</p>
          </div>
        )}

        {!loading && !error && filteredSubjects.length === 0 && (
          <div className={styles.emptyStateCard}>
            <BookOpen size={40} className={styles.emptyIcon} />
            <h3 className={styles.emptyTitle}>No subjects found</h3>
            <p className={styles.emptyDesc}>
              {filter !== 'all'
                ? `You have no subjects categorized under '${filter.replace('_', ' ')}'.`
                : 'You are not enrolled in any subjects yet. Contact your institution administrator.'}
            </p>
          </div>
        )}

        {/* ══ SUBJECTS CONTENT ══ */}
        {!loading && !error && filteredSubjects.length > 0 && (
          <>
            {viewMode === 'grid' ? (
              <div className={styles.subjectsGrid}>
                {filteredSubjects.map((sub, idx) => {
                  const isExpanded = expandedId === sub.section_subject_id;
                  const iconInfo = getSubjectIcon(sub, idx);
                  const experiments = experimentsMap[sub.section_subject_id] || [];
                  const isExpsLoading = loadingExps[sub.section_subject_id];

                  // Render Expanded Featured Subject Card with Timeline Drawer
                  if (isExpanded) {
                    return (
                      <div key={sub.section_subject_id} className={styles.expandedWrapper}>
                        {/* Dark Gradient Header */}
                        <div className={styles.expandedHeader}>
                          <div className={styles.expandedLeft}>
                            <div className={styles.expandedIconBox}>
                              {iconInfo.src ? (
                                <Image
                                  src={iconInfo.src}
                                  alt={sub.subject_name}
                                  width={80}
                                  height={80}
                                  className={styles.expandedIconImg}
                                />
                              ) : (
                                <div style={{ width: '100%', height: '100%', background: iconInfo.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 24 }}>
                                  {sub.subject_code?.slice(0, 2) || 'SUB'}
                                </div>
                              )}
                            </div>

                            <div className={styles.expandedInfo}>
                              <span className={styles.expandedCode}>{sub.subject_code || 'LAB'}</span>
                              <h2 className={styles.expandedTitle}>{sub.subject_name}</h2>
                              <p className={styles.expandedDesc}>
                                {sub.description || 'Comprehensive curriculum experiments and practical hands-on problem solving.'}
                              </p>

                              {sub.concept_tags && sub.concept_tags.length > 0 && (
                                <div className={styles.conceptTagsRow}>
                                  {sub.concept_tags.slice(0, 5).map(tag => (
                                    <span key={tag} className={styles.conceptTag}>{tag}</span>
                                  ))}
                                  {sub.concept_tags.length > 5 && (
                                    <span className={styles.conceptTagMore}>+{sub.concept_tags.length - 5}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className={styles.expandedRight}>
                            <div className={styles.progressCluster}>
                              {renderRadialDial(sub.progress_percentage || 0, 68, 5)}
                              <div className={styles.progressMeta}>
                                <span className={styles.progressCount}>
                                  {sub.completed_experiments ?? 0} / {sub.total_experiments ?? 0}
                                </span>
                                <span className={styles.progressLabel}>Experiments completed</span>
                              </div>
                            </div>

                            <button
                              className={styles.collapseChevronBtn}
                              onClick={() => toggleExpand(sub.section_subject_id)}
                              title="Collapse experiments"
                              aria-label="Collapse"
                            >
                              <ChevronUp size={18} strokeWidth={2.5} />
                            </button>
                          </div>
                        </div>

                        {/* Connected Timeline Accordion Drawer */}
                        <div className={styles.drawerBody}>
                          <h3 className={styles.drawerTitle}>
                            Experiments ({sub.total_experiments ?? experiments.length})
                          </h3>

                          {isExpsLoading && (
                            <div style={{ padding: '24px 0', textAlign: 'center', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                              <Loader2 size={18} className="animate-spin" />
                              <span>Loading published experiments…</span>
                            </div>
                          )}

                          {!isExpsLoading && experiments.length === 0 && (
                            <p style={{ color: '#94a3b8', fontSize: 13.5, margin: '12px 0' }}>
                              No published experiments available for this subject yet.
                            </p>
                          )}

                          {!isExpsLoading && experiments.length > 0 && (
                            <div className={styles.timelineTrack}>
                              {experiments.map(exp => {
                                const isCompleted = exp.student_status === 'completed';
                                const isInProgress = exp.student_status === 'in_progress';

                                return (
                                  <div key={exp.id} className={styles.timelineItem}>
                                    <div
                                      className={`${styles.timelineNode} ${
                                        isCompleted
                                          ? styles.timelineNodeCompleted
                                          : isInProgress
                                          ? styles.timelineNodeInProgress
                                          : ''
                                      }`}
                                    />

                                    <div className={styles.expCard}>
                                      <div className={styles.expMain}>
                                        <div className={styles.expIconBox}>
                                          <FlaskConical size={18} strokeWidth={2.2} />
                                        </div>
                                        <div className={styles.expContent}>
                                          <h4 className={styles.expTitle}>{exp.title}</h4>
                                          <p className={styles.expAim}>{exp.aim || exp.problem_statement}</p>

                                          {exp.concept_tags && exp.concept_tags.length > 0 && (
                                            <div className={styles.expTagsRow}>
                                              {exp.concept_tags.slice(0, 4).map(t => (
                                                <span key={t} className={styles.expTag}>{t}</span>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      <div className={styles.expRight}>
                                        {isCompleted ? (
                                          <span className={styles.statusPillCompleted}>
                                            <CheckCircle2 size={13} />
                                            <span>Completed</span>
                                            {exp.completed_at && (
                                              <span className={styles.statusDate}>{exp.completed_at}</span>
                                            )}
                                          </span>
                                        ) : isInProgress ? (
                                          <span className={styles.statusPillInProgress}>
                                            <Clock size={13} />
                                            <span>In Progress</span>
                                          </span>
                                        ) : (
                                          <span className={styles.statusPillNotStarted}>
                                            <Circle size={12} />
                                            <span>Not Started</span>
                                          </span>
                                        )}

                                        <button
                                          className={styles.openLabBtn}
                                          onClick={() => router.push(`/student/pre-lab/${exp.id}`)}
                                        >
                                          <span>Open Lab</span>
                                          <ArrowRight size={13} />
                                        </button>

                                        <button className={styles.moreOptionsBtn} aria-label="More options">
                                          <MoreVertical size={16} />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          <div className={styles.showLessFooter}>
                            <button
                              className={styles.showLessBtn}
                              onClick={() => toggleExpand(sub.section_subject_id)}
                            >
                              <span>Show Less</span>
                              <ChevronUp size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Render Standard Subject Card
                  return (
                    <div key={sub.section_subject_id} className={styles.standardCard}>
                      <div className={styles.cardTopRow}>
                        <div className={styles.cardIconBox}>
                          {iconInfo.src ? (
                            <Image
                              src={iconInfo.src}
                              alt={sub.subject_name}
                              width={68}
                              height={68}
                              className={styles.cardIconImg}
                            />
                          ) : (
                            <div style={{ width: '100%', height: '100%', background: iconInfo.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 18 }}>
                              {sub.subject_code?.slice(0, 2) || 'SUB'}
                            </div>
                          )}
                        </div>

                        <button className={styles.moreOptionsBtn} aria-label="Options">
                          <MoreVertical size={16} />
                        </button>
                      </div>

                      <div className={styles.cardBody}>
                        <span className={styles.cardCode}>{sub.subject_code || 'LAB'}</span>
                        <h3 className={styles.cardTitle}>{sub.subject_name}</h3>
                        <p className={styles.cardDesc}>
                          {sub.description || 'Relational databases, software modeling and core computing concepts.'}
                        </p>
                      </div>

                      <div className={styles.cardProgressSection}>
                        {sub.progress_percentage && sub.progress_percentage > 0 ? (
                          <div className={styles.cardDialSection}>
                            {renderRadialDial(sub.progress_percentage, 50, 4)}
                            <div>
                              <div className={styles.cardProgressPct}>{sub.progress_percentage}%</div>
                              <div className={styles.cardProgressLabel}>
                                {sub.completed_experiments ?? 0} / {sub.total_experiments ?? 0} Experiments completed
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className={styles.cardProgressInfoRow}>
                              <span className={styles.cardProgressLabel}>
                                {sub.completed_experiments ?? 0} / {sub.total_experiments ?? 0} Experiments completed
                              </span>
                              <span className={styles.cardProgressPct}>{sub.progress_percentage || 0}%</span>
                            </div>
                            <div className={styles.cardProgressBarTrack}>
                              <div
                                className={styles.cardProgressBarFill}
                                style={{ width: `${sub.progress_percentage || 0}%` }}
                              />
                            </div>
                          </>
                        )}
                      </div>

                      <button
                        className={styles.viewExperimentsBtn}
                        onClick={() => toggleExpand(sub.section_subject_id)}
                      >
                        <span>View Experiments</span>
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ══ LIST VIEW ALTERNATE MODE ══ */
              <div className={styles.subjectsList}>
                {filteredSubjects.map((sub, idx) => {
                  const iconInfo = getSubjectIcon(sub, idx);
                  const isExpanded = expandedId === sub.section_subject_id;

                  return (
                    <div key={sub.section_subject_id} className={styles.listRowCard}>
                      <div className={styles.listRowLeft}>
                        <div className={styles.listRowIcon}>
                          {iconInfo.src ? (
                            <Image
                              src={iconInfo.src}
                              alt={sub.subject_name}
                              width={50}
                              height={50}
                              className={styles.cardIconImg}
                            />
                          ) : (
                            <div style={{ width: '100%', height: '100%', background: iconInfo.gradient }} />
                          )}
                        </div>
                        <div className={styles.listRowDetails}>
                          <span className={styles.cardCode}>{sub.subject_code}</span>
                          <h4 className={styles.cardTitle} style={{ fontSize: 16 }}>{sub.subject_name}</h4>
                          <span style={{ fontSize: 12, color: '#64748b' }}>{sub.description}</span>
                        </div>
                      </div>

                      <div className={styles.listRowMiddle}>
                        <div className={styles.listRowProgress}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 700 }}>
                            <span>Progress</span>
                            <span>{sub.progress_percentage || 0}%</span>
                          </div>
                          <div className={styles.cardProgressBarTrack}>
                            <div
                              className={styles.cardProgressBarFill}
                              style={{ width: `${sub.progress_percentage || 0}%` }}
                            />
                          </div>
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>
                            {sub.completed_experiments ?? 0} of {sub.total_experiments ?? 0} done
                          </span>
                        </div>

                        {sub.status === 'completed' ? (
                          <span className={styles.statusPillCompleted}>Completed</span>
                        ) : sub.status === 'in_progress' ? (
                          <span className={styles.statusPillInProgress}>In Progress</span>
                        ) : (
                          <span className={styles.statusPillNotStarted}>Not Started</span>
                        )}
                      </div>

                      <button
                        className={styles.viewExperimentsBtn}
                        style={{ width: 'auto', padding: '8px 16px' }}
                        onClick={() => {
                          setViewMode('grid');
                          setExpandedId(sub.section_subject_id);
                        }}
                      >
                        <span>{isExpanded ? 'Viewing' : 'View Experiments'}</span>
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ══ FOOTER QUOTE ══ */}
        <footer className={styles.pageFooter}>
          <span className={styles.footerSparkle}>
            <Sparkles size={14} />
            <span>&ldquo;Experiment. Fail. Learn. Repeat.&rdquo;</span>
          </span>
          <span className={styles.footerBrand}>NexLab &bull; Learn by Doing</span>
        </footer>

      </div>
    </StudentShell>
  );
}
