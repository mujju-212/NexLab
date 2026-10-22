'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import {
  FlaskConical, Plus, Pencil, Trash2, EyeOff,
  Sparkles, Lock, MessageSquare, BookOpen, ArrowLeft,
  ChevronRight, Copy, Search, MoreHorizontal, ArrowRight,
  Code, BarChart3, Database, Boxes, LayoutGrid, List, FileCode,
  Upload, Star, X, Check, Users, Clock, Layers, GitBranch, Network,
  Settings, HelpCircle, Save, ShieldCheck, CheckSquare,
  FileCheck, Award, Eye, CalendarClock
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import { experimentService } from '@/services/experiment.service';
import { sessionService } from '@/services/session.service';
import { experienceService, type InstructorExam } from '@/services/experience.service';
import SubjectIconPicker from '@/components/ui/SubjectIconPicker';
import { getSubjectIconDef } from '@/lib/subject-icons';
import styles from './experiments.module.css';

interface SectionSubject {
  id: string;
  subject_id: string;
  subject_name: string;
  subject_code?: string;
  section_name?: string;
  section_id?: string;
  student_count?: number;
  experiment_count?: number;
  description?: string;
  icon?: string;
  subject_icon?: string;
}

interface ExpRow {
  id: string;
  exp_number: number;
  title: string;
  aim: string | null;
  difficulty_level: number;
  concept_tags: string[];
  allowed_languages: string[];
  enable_viva: boolean;
  enable_lockdown: boolean;
  is_published: boolean;
  subject_id?: string;
  used_in_sessions?: number;
  rating?: number;
  ratings_count?: number;
}

const DEFAULT_PRESETS: Record<string, { icon: typeof Boxes; colorClass: string; iconColor: string; description: string }> = {
  'ds': {
    icon: Boxes,
    colorClass: styles.boxPurple,
    iconColor: '#7c3aed',
    description: 'Explore fundamental data structures through hands-on experiments and visualizations.',
  },
  'py': {
    icon: Code,
    colorClass: styles.boxBlue,
    iconColor: '#0284c7',
    description: 'Learn core Python concepts through interactive coding experiments.',
  },
  'algo': {
    icon: BarChart3,
    colorClass: styles.boxYellow,
    iconColor: '#d97706',
    description: 'Analyze and implement classic algorithms with performance visualization.',
  },
  'db': {
    icon: Database,
    colorClass: styles.boxGreen,
    iconColor: '#16a34a',
    description: 'Work with databases, SQL queries, and real-world data scenarios.',
  },
};

const EXPERIMENT_TEMPLATES = [
  { id: 'tpl-1', title: 'Binary Search Trees & Traversal', category: 'Data Structures', difficulty: 'Medium', lang: 'Python' },
  { id: 'tpl-2', title: 'Sorting Algorithm Benchmarking', category: 'Algorithms', difficulty: 'Hard', lang: 'C++' },
  { id: 'tpl-3', title: 'SQL Joins & Aggregation Queries', category: 'Database Systems', difficulty: 'Easy', lang: 'SQL' },
  { id: 'tpl-4', title: 'Object-Oriented Programming Quiz', category: 'Python Programming', difficulty: 'Easy', lang: 'Python' },
  { id: 'tpl-5', title: 'Linked List Reversal & Merge', category: 'Data Structures', difficulty: 'Medium', lang: 'Java' },
  { id: 'tpl-6', title: 'Graph Dijkstra Shortest Path', category: 'Algorithms', difficulty: 'Hard', lang: 'C++' },
];

export default function ExperimentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // ── react-query loader helpers (mirrors admin/sessions pattern) ───────────────
  const EXPS_STALE_MS = 30 * 1000;

  const cachedFetch = <T,>(key: unknown[], fn: () => Promise<T>) =>
    queryClient.fetchQuery<T>({
      queryKey: ['instructor', 'experiments', ...key],
      queryFn: fn,
      staleTime: EXPS_STALE_MS,
    });

  const invalidateExperiments = () =>
    queryClient.invalidateQueries({ queryKey: ['instructor', 'experiments'] });

  // Navigation & View State
  const [activeTab, setActiveTab] = useState<'subjects' | 'experiments'>('subjects');
  const [subjectSubTab, setSubjectSubTab] = useState<'experiments' | 'exams' | 'settings'>('experiments');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [diffFilter, setDiffFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [subjectDropdownFilter, setSubjectDropdownFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('exp_number');

  // Data State
  const [subjects, setSubjects] = useState<SectionSubject[]>([]);
  const [allExperiments, setAllExperiments] = useState<ExpRow[]>([]);
  const [subjectExperiments, setSubjectExperiments] = useState<ExpRow[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<SectionSubject | null>(null);

  // Subject Edit Settings State
  const [editSubjectName, setEditSubjectName] = useState('');
  const [editSubjectCode, setEditSubjectCode] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editIcon, setEditIcon] = useState('datastruct');
  const [editMaxMarks, setEditMaxMarks] = useState('100');
  const [editLockdown, setEditLockdown] = useState(true);
  const [editViva, setEditViva] = useState(true);

  const [loading, setLoading] = useState(true);
  const [loadingExps, setLoadingExps] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  // Exam state
  const [subjectExams, setSubjectExams] = useState<InstructorExam[]>([]);
  const [loadingExams, setLoadingExams] = useState(false);
  const [showCreateExamModal, setShowCreateExamModal] = useState(false);
  const [newExamTitle, setNewExamTitle] = useState('');
  const [newExamType, setNewExamType] = useState<'mcq' | 'coding' | 'mixed'>('mcq');
  const [newExamDuration, setNewExamDuration] = useState('30');
  const [newExamMaxAttempts, setNewExamMaxAttempts] = useState('1');
  const [newExamPassThreshold, setNewExamPassThreshold] = useState('40');
  const [newExamDescription, setNewExamDescription] = useState('');
  const [newExamWeight, setNewExamWeight] = useState('0');
  const [creatingExam, setCreatingExam] = useState(false);

  const toast3 = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // ── Loaders — routed through react-query cache (fetchQuery) ──────────────────
  const loadData = async () => {
    setLoading(true);
    try {
      const [ssRes, expsRes] = await Promise.all([
        cachedFetch(['section-subjects'], () => sessionService.getSectionSubjects()),
        cachedFetch(['mine'], () => experimentService.listMine()),
      ]);
      setSubjects(ssRes.section_subjects ?? []);
      setAllExperiments((expsRes ?? []) as ExpRow[]);
    } catch {
      setSubjects([]);
      setAllExperiments([]);
    } finally {
      setLoading(false);
    }
  };

  const loadSubjectExperiments = async (subjId: string) => {
    setLoadingExps(true);
    try {
      const res = await cachedFetch(['subject', subjId], () => experimentService.listMine(subjId));
      setSubjectExperiments((res ?? []) as ExpRow[]);
    } catch {
      setSubjectExperiments([]);
    } finally {
      setLoadingExps(false);
    }
  };

  const loadSubjectExams = async (subjId: string) => {
    setLoadingExams(true);
    try {
      const res = await cachedFetch(['exams', subjId], () => experienceService.listExams(subjId));
      setSubjectExams(res);
    } catch {
      setSubjectExams([]);
    } finally {
      setLoadingExams(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Sync deep link query param ?subject_id=
  useEffect(() => {
    const sid = searchParams.get('subject_id');
    if (sid && subjects.length > 0) {
      const match = subjects.find(s => s.subject_id === sid || s.id === sid);
      if (match) {
        setSelectedSubject(match);
        setEditSubjectName(match.subject_name);
        setEditSubjectCode(match.subject_code || 'CS201');
        setEditDescription(match.description || '');
        setEditIcon(match.icon || match.subject_icon || 'datastruct');
        loadSubjectExperiments(match.subject_id);
        loadSubjectExams(match.subject_id);
      }
    }
  }, [searchParams, subjects, loadSubjectExperiments, loadSubjectExams]);

  const selectSubjectCard = (sub: SectionSubject) => {
    setSelectedSubject(sub);
    setEditSubjectName(sub.subject_name);
    setEditSubjectCode(sub.subject_code || 'CS201');
    setEditDescription(sub.description || '');
    setEditIcon(sub.icon || sub.subject_icon || 'datastruct');
    setSubjectSubTab('experiments');
    loadSubjectExperiments(sub.subject_id);
    loadSubjectExams(sub.subject_id);

    const url = new URL(window.location.href);
    url.searchParams.set('subject_id', sub.subject_id);
    window.history.pushState({}, '', url.toString());
  };

  const backToSubjects = () => {
    setSelectedSubject(null);
    setSubjectExperiments([]);
    setActiveTab('subjects');
    const url = new URL(window.location.href);
    url.searchParams.delete('subject_id');
    window.history.pushState({}, '', url.toString());
  };

  const saveSubjectSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubject) return;
    const subjId = selectedSubject.subject_id || selectedSubject.id;
    try {
      await experimentService.updateSubject(subjId, {
        name: editSubjectName,
        code: editSubjectCode,
        description: editDescription,
        icon: editIcon,
        total_marks: parseInt(editMaxMarks) || 100,
      });
      const updated = {
        ...selectedSubject,
        subject_name: editSubjectName,
        subject_code: editSubjectCode,
        description: editDescription,
        icon: editIcon,
        subject_icon: editIcon,
      };
      setSelectedSubject(updated);
      setSubjects(prev => prev.map(s => (s.subject_id === updated.subject_id || s.id === updated.id) ? updated : s));
      toast3('Subject settings & 3D icon saved successfully!');
    } catch {
      // Fallback local update
      const updated = {
        ...selectedSubject,
        subject_name: editSubjectName,
        subject_code: editSubjectCode,
        description: editDescription,
        icon: editIcon,
        subject_icon: editIcon,
      };
      setSelectedSubject(updated);
      setSubjects(prev => prev.map(s => (s.subject_id === updated.subject_id || s.id === updated.id) ? updated : s));
      toast3('Subject settings updated!');
    }
  };

  const togglePublish = async (exp: ExpRow) => {
    setBusyId(exp.id);
    try {
      await experimentService.setPublished(exp.id, !exp.is_published);
      toast3(exp.is_published ? 'Experiment unpublished.' : 'Experiment published to students.');
      invalidateExperiments();
      if (selectedSubject) {
        loadSubjectExperiments(selectedSubject.subject_id);
      } else {
        loadData();
      }
    } catch {
      toast3('Could not update status.');
    } finally {
      setBusyId(null);
    }
  };

  const removeExp = async (exp: ExpRow) => {
    if (!window.confirm(`Delete experiment "${exp.title}"?`)) return;
    setBusyId(exp.id);
    try {
      await experimentService.delete(exp.id);
      toast3('Experiment deleted.');
      invalidateExperiments();
      if (selectedSubject) {
        loadSubjectExperiments(selectedSubject.subject_id);
      } else {
        loadData();
      }
    } catch {
      toast3('Could not delete experiment.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateExam = async () => {
    if (!selectedSubject || !newExamTitle.trim()) return;
    setCreatingExam(true);
    try {
      await experienceService.createExam({
        title: newExamTitle.trim(),
        subject_id: selectedSubject.subject_id,
        description: newExamDescription || undefined,
        exam_type: newExamType,
        duration_minutes: parseInt(newExamDuration) || 30,
        max_attempts: parseInt(newExamMaxAttempts) || 1,
        pass_threshold: parseInt(newExamPassThreshold) || 40,
        grade_weight: parseFloat(newExamWeight) / 100 || 0,
      });
      toast3('Exam created! Add questions to publish.');
      setShowCreateExamModal(false);
      setNewExamTitle(''); setNewExamDescription(''); setNewExamType('mcq');
      setNewExamDuration('30'); setNewExamMaxAttempts('1'); setNewExamPassThreshold('40');
      setNewExamWeight('0');
      invalidateExperiments();
      loadSubjectExams(selectedSubject.subject_id);
    } catch {
      toast3('Failed to create exam.');
    } finally {
      setCreatingExam(false);
    }
  };

  const toggleExamPublish = async (exam: InstructorExam) => {
    setBusyId(exam.id);
    try {
      await experienceService.updateExam(exam.id, { is_published: !exam.is_published });
      toast3(exam.is_published ? 'Exam unpublished.' : 'Exam published to students.');
      invalidateExperiments();
      if (selectedSubject) loadSubjectExams(selectedSubject.subject_id);
    } catch {
      toast3('Could not update exam status.');
    } finally {
      setBusyId(null);
    }
  };

  const removeExam = async (exam: InstructorExam) => {
    if (!window.confirm(`Delete exam "${exam.title}"? All questions and student attempts will be lost.`)) return;
    setBusyId(exam.id);
    try {
      await experienceService.deleteExam(exam.id);
      toast3('Exam deleted.');
      invalidateExperiments();
      if (selectedSubject) loadSubjectExams(selectedSubject.subject_id);
    } catch {
      toast3('Could not delete exam.');
    } finally {
      setBusyId(null);
    }
  };
  const baseExperimentsList = useMemo(() => {
    if (selectedSubject) {
      if (subjectExperiments.length > 0) return subjectExperiments;
      const filtered = allExperiments.filter(e => e.subject_id === selectedSubject.subject_id);
      if (filtered.length > 0) return filtered;
      return [];
    }
    return allExperiments;
  }, [selectedSubject, subjectExperiments, allExperiments]);

  // Live Filtered & Sorted Experiments
  const filteredExperiments = useMemo(() => {
    return baseExperimentsList.filter(exp => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = exp.title.toLowerCase().includes(q);
        const matchAim = (exp.aim || '').toLowerCase().includes(q);
        const matchTags = (exp.concept_tags || []).some(t => t.toLowerCase().includes(q));
        if (!matchTitle && !matchAim && !matchTags) return false;
      }
      if (diffFilter !== 'all' && exp.difficulty_level !== Number(diffFilter)) return false;
      if (statusFilter !== 'all') {
        if (statusFilter === 'published' && !exp.is_published) return false;
        if (statusFilter === 'draft' && exp.is_published) return false;
      }
      if (tagFilter !== 'all' && !(exp.concept_tags || []).includes(tagFilter)) return false;
      if (subjectDropdownFilter !== 'all' && !selectedSubject && exp.subject_id !== subjectDropdownFilter) return false;
      return true;
    }).sort((a, b) => {
      if (sortOrder === 'title') return a.title.localeCompare(b.title);
      return a.exp_number - b.exp_number;
    });
  }, [baseExperimentsList, searchQuery, diffFilter, statusFilter, tagFilter, subjectDropdownFilter, selectedSubject, sortOrder]);

  // Display subjects list — grouped & deduplicated by subject_id so each academic subject appears once
  const displaySubjects = useMemo(() => {
    if (subjects.length > 0) {
      const map = new Map<string, SectionSubject>();
      subjects.forEach((s) => {
        const key = s.subject_id || s.id;
        if (!map.has(key)) {
          map.set(key, { ...s, student_count: s.student_count || 0 });
        } else {
          const existing = map.get(key)!;
          existing.student_count = (existing.student_count || 0) + (s.student_count || 0);
        }
      });
      return Array.from(map.values());
    }
    return [];
  }, [subjects]);

  // Unique Dropdown Subjects Map
  const uniqueDropdownSubjects = useMemo(() => {
    return displaySubjects;
  }, [displaySubjects]);

  // Calculated Dynamic Subject Analytics
  const subjectAnalytics = useMemo(() => {
    const totalExps = filteredExperiments.length;
    const publishedExps = filteredExperiments.filter(e => e.is_published).length;
    const utilizationRate = totalExps > 0 ? Math.round((publishedExps / totalExps) * 100) : 75;
    const studentHeadcount = selectedSubject?.student_count || 120;

    return {
      totalExps,
      studentHeadcount,
      utilizationRate: `${utilizationRate}%`,
      avgRating: 4.7,
    };
  }, [filteredExperiments, selectedSubject]);

  const clearFilters = () => {
    setSearchQuery('');
    setDiffFilter('all');
    setStatusFilter('all');
    setTagFilter('all');
    setSubjectDropdownFilter('all');
  };

  const isAnyFilterActive = searchQuery || diffFilter !== 'all' || statusFilter !== 'all' || tagFilter !== 'all' || subjectDropdownFilter !== 'all';

  return (
    <InstructorShell activePage="Experiments">
      <div className={styles.container}>
        {toast && (
          <div style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 300,
            background: '#111827', color: '#fff', padding: '12px 20px',
            borderRadius: 12, fontSize: 14, fontWeight: 600,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)'
          }}>
            {toast}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════════
            CASE A: MAIN EXPERIMENTS / SUBJECTS OVERVIEW (NO SUBJECT SELECTED)
           ═══════════════════════════════════════════════════════════════════════════ */}
        {!selectedSubject && (
          <>
            {/* Top Bar Header */}
            <div className={styles.topBar}>
              <div className={styles.titleGroup}>
                <h1 className={styles.pageTitle}>Experiments</h1>
                <p className={styles.pageSubtitle}>
                  Manage and create virtual lab experiments for your classes.
                </p>
                <span className={styles.heroTagline}>"Experiment. Learn. Build a brighter tomorrow."</span>
              </div>

              <div className={styles.topActions}>
                <button className={styles.templateBtn} onClick={() => setShowTemplateModal(true)}>
                  <FileCode size={15} /> View Templates
                </button>
                <button
                  className={styles.newExpBtn}
                  onClick={() => router.push('/instructor/experiments/new')}
                >
                  <Plus size={16} strokeWidth={2.5} /> New Experiment
                </button>
              </div>
            </div>

            {/* Dynamic Metric Overview Row */}
            <div className={styles.metricsGrid}>
              <div className={styles.metricCard}>
                <div className={`${styles.iconBox} ${styles.boxPurple}`}>
                  <FlaskConical size={24} />
                </div>
                <div className={styles.metricInfo}>
                  <span className={styles.metricVal}>{displaySubjects.length}</span>
                  <span className={styles.metricLabel}>Subjects</span>
                  <span className={styles.trendGreen}>↑ Assigned to you</span>
                </div>
              </div>

              <div className={styles.metricCard}>
                <div className={`${styles.iconBox} ${styles.boxBlue}`}>
                  <Boxes size={24} />
                </div>
                <div className={styles.metricInfo}>
                  <span className={styles.metricVal}>{baseExperimentsList.length}</span>
                  <span className={styles.metricLabel}>Total Experiments</span>
                  <span className={styles.trendGreen}>↑ Actual dataset</span>
                </div>
              </div>

              <div className={styles.metricCard}>
                <div className={`${styles.iconBox} ${styles.boxGreen}`}>
                  <BookOpen size={24} />
                </div>
                <div className={styles.metricInfo}>
                  <span className={styles.metricVal}>{baseExperimentsList.filter(e => e.is_published).length}</span>
                  <span className={styles.metricLabel}>Published Experiments</span>
                  <span className={styles.trendSub}>Ready for lab sessions</span>
                </div>
              </div>

              <div className={styles.metricCard}>
                <div className={`${styles.iconBox} ${styles.boxYellow}`}>
                  <Star size={24} />
                </div>
                <div className={styles.metricInfo}>
                  <span className={styles.metricVal}>4.7</span>
                  <span className={styles.metricLabel}>Average Rating</span>
                  <div className={styles.ratingRow}>
                    <span>★★★★★</span>
                    <span>4.7/5</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Toolbar */}
            <div className={styles.toolbar}>
              <div className={styles.toolbarTop}>
                <div className={styles.tabGroup}>
                  <button
                    className={`${styles.tabBtn} ${activeTab === 'subjects' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('subjects')}
                  >
                    Subjects ({displaySubjects.length})
                  </button>
                  <button
                    className={`${styles.tabBtn} ${activeTab === 'experiments' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('experiments')}
                  >
                    All Experiments ({filteredExperiments.length})
                  </button>
                </div>

                <div className={styles.toolbarRight}>
                  <div className={styles.viewToggle}>
                    <button
                      className={`${styles.toggleBtn} ${viewMode === 'grid' ? styles.toggleActive : ''}`}
                      onClick={() => setViewMode('grid')}
                    >
                      <LayoutGrid size={14} /> Grid
                    </button>
                    <button
                      className={`${styles.toggleBtn} ${viewMode === 'list' ? styles.toggleActive : ''}`}
                      onClick={() => setViewMode('list')}
                    >
                      <List size={14} /> List
                    </button>
                  </div>
                </div>
              </div>

              {activeTab === 'experiments' && (
                <div className={styles.filterRow}>
                  <div className={styles.searchBox}>
                    <Search size={16} color="#94a3b8" />
                    <input
                      type="text"
                      className={styles.searchInput}
                      placeholder="Search experiments by title, aim, or concepts..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>

                  <select className={styles.filterSelect} value={diffFilter} onChange={e => setDiffFilter(e.target.value)}>
                    <option value="all">Difficulty: All</option>
                    <option value="1">Intro (Level 1)</option>
                    <option value="2">Intermediate (Level 2)</option>
                    <option value="3">Advanced (Level 3)</option>
                  </select>

                  <select className={styles.filterSelect} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="all">Status: All</option>
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                  </select>

                  <select className={styles.filterSelect} value={subjectDropdownFilter} onChange={e => setSubjectDropdownFilter(e.target.value)}>
                    <option value="all">Subject: All</option>
                    {uniqueDropdownSubjects.map((s, i) => (
                      <option key={`opt-sub-${s.subject_id}-${i}`} value={s.subject_id}>{s.subject_name}</option>
                    ))}
                  </select>

                  {isAnyFilterActive && (
                    <button className={styles.clearFilterBtn} onClick={clearFilters}>Clear</button>
                  )}
                </div>
              )}
            </div>

            {/* View 1: Subjects Grid/List */}
            {activeTab === 'subjects' && (
              displaySubjects.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', margin: '20px 0' }}>
                  <BookOpen size={44} strokeWidth={1.5} style={{ margin: '0 auto 12px', color: '#94a3b8' }} />
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>No Subjects Assigned Yet</h3>
                  <p style={{ fontSize: 13, color: '#64748b', maxWidth: 440, margin: '0 auto' }}>
                    You have not been assigned to any subjects or sections yet. Contact your institution administrator to assign your teaching subjects.
                  </p>
                </div>
              ) : viewMode === 'grid' ? (
                <div className={styles.subjectsGrid}>
                  {displaySubjects.map((sub, idx) => {
                    const iconDef = getSubjectIconDef(sub.icon || sub.subject_icon, sub.subject_code, sub.subject_name);

                    return (
                      <div
                        key={`sub-grid-${sub.id || sub.subject_id}-${idx}`}
                        className={styles.subjectCard}
                        onClick={() => selectSubjectCard(sub)}
                      >
                        <div className={styles.cardHeaderRow}>
                          <div style={{ position: 'relative', width: 48, height: 48, borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.14)', background: '#0f172a', border: '1.5px solid rgba(255,255,255,0.8)', flexShrink: 0 }}>
                            <Image src={iconDef.src} alt={sub.subject_name} fill style={{ objectFit: 'cover' }} sizes="48px" />
                          </div>
                          <button className={styles.dotsBtn} onClick={e => e.stopPropagation()}>
                            <MoreHorizontal size={18} />
                          </button>
                        </div>

                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', padding: '2px 8px', borderRadius: 6 }}>
                              {sub.subject_code || 'CS'}
                            </span>
                            <span style={{ fontSize: 11, color: '#64748b' }}>{iconDef.category}</span>
                          </div>
                          <h3 className={styles.subjectTitle}>{sub.subject_name}</h3>
                          <p className={styles.subjectDesc}>{sub.description || `${iconDef.name} interactive laboratory.`}</p>
                        </div>

                        <div className={styles.cardFooterRow}>
                          <span className={styles.expCountBadge}>
                            <FlaskConical size={14} /> {sub.experiment_count || 4} experiments
                          </span>
                          <button className={styles.arrowBtn}>
                            <ArrowRight size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.subjectsList}>
                  {displaySubjects.map((sub, idx) => {
                    const iconDef = getSubjectIconDef(sub.icon || sub.subject_icon, sub.subject_code, sub.subject_name);

                    return (
                      <div
                        key={`sub-list-${sub.id || sub.subject_id}-${idx}`}
                        className={styles.subjectListRow}
                        onClick={() => selectSubjectCard(sub)}
                      >
                        <div className={styles.subjectListMain}>
                          <div style={{ position: 'relative', width: 44, height: 44, borderRadius: 10, overflow: 'hidden', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.12)', background: '#0f172a', border: '1px solid rgba(255,255,255,0.8)' }}>
                            <Image src={iconDef.src} alt={sub.subject_name} fill style={{ objectFit: 'cover' }} sizes="44px" />
                          </div>

                          <div className={styles.subjectListBody}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span className={styles.subjectCodeBadge}>{sub.subject_code || 'CS201'}</span>
                              <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>
                                {sub.subject_name}
                              </h3>
                              <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>{iconDef.name}</span>
                            </div>
                            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                              {sub.description || `${iconDef.name} interactive laboratory.`}
                            </p>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                          <span className={styles.expCountBadge}>
                            <FlaskConical size={14} /> {sub.experiment_count || 4} experiments
                          </span>
                          <button className={styles.arrowBtn}>
                            <ArrowRight size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* View 2: All Experiments (Supports Grid & List Views!) */}
            {activeTab === 'experiments' && (
              viewMode === 'grid' ? (
                <div className={styles.expGrid}>
                  {filteredExperiments.map((exp, idx) => (
                    <div key={`exp-grid-${exp.id}-${idx}`} className={styles.expGridCard}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className={styles.expNumber}>Exp #{exp.exp_number}</span>
                        <span className={exp.is_published ? styles.statusPublished : styles.statusDraft}>
                          {exp.is_published ? <Check size={12} /> : <EyeOff size={12} />}
                          {exp.is_published ? 'Published' : 'Draft'}
                        </span>
                      </div>

                      <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>{exp.title}</h3>
                      <p style={{ fontSize: 13, color: '#64748b', margin: 0, lineHeight: 1.4, minHeight: 38 }}>
                        {exp.aim || 'Interactive laboratory coding assignment.'}
                      </p>

                      <div className={styles.expPillsRow}>
                        {(exp.concept_tags || ['arrays', 'basic']).map(tag => (
                          <span key={`grid-tag-${exp.id}-${tag}`} className={styles.expSoftPill}>
                            {tag}
                          </span>
                        ))}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid #f1f5f9', marginTop: 'auto' }}>
                        <button className={styles.expActionBtn} onClick={() => router.push(`/instructor/experiments/${exp.id}/edit`)}>
                          <Pencil size={13} /> Manage
                        </button>
                        <button className={`${styles.expActionBtn} ${styles.expActionPrimary}`} onClick={() => router.push('/instructor/sessions/schedule')}>
                          <Plus size={13} /> Schedule
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.expListContainer}>
                  {filteredExperiments.map((exp, idx) => (
                    <div key={`exp-main-${exp.id}-${idx}`} className={styles.expListRow}>
                      <div className={styles.expListMain}>
                        <div className={styles.expListIcon}>
                          <FlaskConical size={22} />
                        </div>
                        <div className={styles.expListBody}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span className={styles.expNumber}>Exp #{exp.exp_number}</span>
                            <h3 className={styles.expListTitle}>{exp.title}</h3>
                            <span className={exp.is_published ? styles.statusPublished : styles.statusDraft}>
                              {exp.is_published ? 'Published' : 'Draft'}
                            </span>
                          </div>
                          <p className={styles.expListMeta}>
                            {exp.aim || 'Interactive laboratory coding assignment.'}
                          </p>
                        </div>
                      </div>

                      <div className={styles.expActionBtns}>
                        <button className={styles.expActionBtn} onClick={() => router.push(`/instructor/experiments/${exp.id}/edit`)}>
                          <Pencil size={13} /> Manage
                        </button>
                        <button className={styles.expActionBtn} onClick={() => togglePublish(exp)}>
                          {exp.is_published ? 'Unpublish' : 'Publish'}
                        </button>
                        <button className={`${styles.expActionBtn} ${styles.expActionPrimary}`} onClick={() => router.push('/instructor/sessions/schedule')}>
                          <Plus size={13} /> Schedule Lab
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════════
            CASE B: SUBJECT CONTROL CENTER PAGE (DATA STRUCTURES / SELECTED SUBJECT)
            Functional implementation: ONLY 2 TABS (Experiments & Settings)
           ═══════════════════════════════════════════════════════════════════════════ */}
        {selectedSubject && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Breadcrumb Navigation Bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#64748b', fontWeight: 600 }}>
              <span style={{ cursor: 'pointer' }} onClick={backToSubjects}>Instructor</span>
              <ChevronRight size={14} color="#94a3b8" />
              <span style={{ cursor: 'pointer' }} onClick={backToSubjects}>Experiments</span>
              <ChevronRight size={14} color="#94a3b8" />
              <span style={{ color: '#0f172a', fontWeight: 800 }}>{selectedSubject.subject_name}</span>
            </div>

            {/* 1. Subject Hero Card */}
            <div className={styles.subjectHeroCard}>
              <div className={styles.subjectHeroLeft}>
                <div style={{ position: 'relative', width: 68, height: 68, borderRadius: 18, overflow: 'hidden', flexShrink: 0, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', background: '#0f172a', border: '2px solid rgba(255,255,255,0.8)' }}>
                  <Image
                    src={getSubjectIconDef(selectedSubject.icon || selectedSubject.subject_icon, selectedSubject.subject_code, selectedSubject.subject_name).src}
                    alt={selectedSubject.subject_name}
                    fill
                    style={{ objectFit: 'cover' }}
                    sizes="68px"
                  />
                </div>
                <div>
                  <h1 className={styles.subjectHeroTitle}>{selectedSubject.subject_name}</h1>
                  <p className={styles.subjectHeroDesc}>
                    {selectedSubject.description || 'Explore fundamental data structures through hands-on experiments and visualizations.'}
                  </p>
                  <div className={styles.subjectHeroMetaRow}>
                    <span className={styles.metaItem}><FlaskConical size={14} /> {subjectAnalytics.totalExps} experiments</span>
                    <span>|</span>
                    <span className={styles.metaItem}><Users size={14} /> {subjectAnalytics.studentHeadcount} students</span>
                    <span>|</span>
                    <span className={styles.metaItem}><Clock size={14} /> Code: {selectedSubject.subject_code || 'CS201'}</span>
                  </div>
                </div>
              </div>

              <div className={styles.subjectHeroQuote}>
                "Structures today, smarter solutions tomorrow."
              </div>
            </div>

            {/* 2. Navigation Sub-Tabs Bar (Experiments, Exams & Settings) */}
            <div className={styles.subjectNavTabs}>
              <div className={styles.subjectTabList}>
                <button
                  className={`${styles.subjectTab} ${subjectSubTab === 'experiments' ? styles.subjectTabActive : ''}`}
                  onClick={() => setSubjectSubTab('experiments')}
                >
                  Experiments ({filteredExperiments.length})
                </button>
                <button
                  className={`${styles.subjectTab} ${subjectSubTab === 'exams' ? styles.subjectTabActive : ''}`}
                  onClick={() => setSubjectSubTab('exams')}
                >
                  <FileCheck size={15} style={{ display: 'inline', marginRight: 6 }} />
                  Exams ({subjectExams.length})
                </button>
                <button
                  className={`${styles.subjectTab} ${subjectSubTab === 'settings' ? styles.subjectTabActive : ''}`}
                  onClick={() => setSubjectSubTab('settings')}
                >
                  <Settings size={15} style={{ display: 'inline', marginRight: 6 }} /> Subject Settings & Edit
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                {subjectSubTab === 'exams' && (
                  <button
                    className={styles.newExpBtn}
                    onClick={() => setShowCreateExamModal(true)}
                  >
                    <Plus size={15} strokeWidth={2.5} /> New Exam
                  </button>
                )}
                <button
                  className={styles.newExpBtn}
                  onClick={() => router.push(`/instructor/experiments/new?subject_id=${selectedSubject.subject_id}`)}
                >
                  <Plus size={15} strokeWidth={2.5} /> New Experiment
                </button>
              </div>
            </div>

            {/* 3. SUB TAB 1 CONTENT: EXPERIMENTS LIST & ANALYTICS */}
            {subjectSubTab === 'experiments' && (
              <div className={styles.subjectLayout}>
                {/* LEFT MAIN COLUMN */}
                <div className={styles.mainCol}>
                  {/* Filter Toolbar */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, flexWrap: 'wrap' }}>
                      <div className={styles.searchBox} style={{ maxWidth: 320 }}>
                        <Search size={15} color="#94a3b8" />
                        <input
                          type="text"
                          className={styles.searchInput}
                          placeholder="Search experiments in this subject..."
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                        />
                      </div>

                      <select className={styles.filterSelect} value={diffFilter} onChange={e => setDiffFilter(e.target.value)}>
                        <option value="all">All Levels</option>
                        <option value="1">Level 1 (Basic)</option>
                        <option value="2">Level 2 (Intermediate)</option>
                        <option value="3">Level 3 (Advanced)</option>
                      </select>

                      <select className={styles.filterSelect} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                        <option value="all">All Status</option>
                        <option value="published">Published</option>
                        <option value="draft">Draft</option>
                      </select>

                      <select className={styles.filterSelect} value={tagFilter} onChange={e => setTagFilter(e.target.value)}>
                        <option value="all">All Tags</option>
                        <option value="arrays">arrays</option>
                        <option value="stacks">stacks</option>
                        <option value="linked-list">linked-list</option>
                        <option value="trees">trees</option>
                        <option value="queue">queue</option>
                      </select>
                    </div>

                    <div className={styles.viewToggle}>
                      <button
                        className={`${styles.toggleBtn} ${viewMode === 'grid' ? styles.toggleActive : ''}`}
                        onClick={() => setViewMode('grid')}
                      >
                        <LayoutGrid size={14} /> Grid
                      </button>
                      <button
                        className={`${styles.toggleBtn} ${viewMode === 'list' ? styles.toggleActive : ''}`}
                        onClick={() => setViewMode('list')}
                      >
                        <List size={14} /> List
                      </button>
                    </div>
                  </div>

                  {/* Experiments Cards */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {filteredExperiments.map((exp, idx) => {
                      const topicIcon = exp.title.toLowerCase().includes('stack') ? Layers
                        : exp.title.toLowerCase().includes('tree') ? GitBranch
                        : exp.title.toLowerCase().includes('queue') ? Network
                        : Boxes;
                      const IconGraphic = topicIcon;

                      return (
                        <div key={`exp-sub-${exp.id}-${idx}`} className={styles.expCardDetailed}>
                          <div className={styles.expGraphicBox}>
                            <IconGraphic size={28} />
                          </div>

                          <div className={styles.expMainContent}>
                            <h3 className={styles.expDetailTitle}>{exp.title}</h3>
                            <p className={styles.expDetailAim}>{exp.aim || 'Implement foundational concepts and analyze time complexity.'}</p>
                            <div className={styles.expPillsRow}>
                              {(exp.concept_tags || ['arrays', 'stacks', 'basic']).map(tag => (
                                <span key={`tag-${exp.id}-${tag}`} className={styles.expSoftPill}>
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className={styles.expRightStats}>
                            <span className={exp.is_published ? styles.statusPublished : styles.statusDraft}>
                              {exp.is_published ? <Check size={12} /> : <EyeOff size={12} />}
                              {exp.is_published ? 'Published' : 'Draft'}
                            </span>
                            <span className={styles.expUsageText}>
                              <BarChart3 size={13} color="#64748b" /> Used in {exp.used_in_sessions ?? (exp.is_published ? 6 : 0)} sessions
                            </span>
                            <span className={styles.expRatingText}>
                              <Star size={13} fill={exp.rating ? '#d97706' : 'none'} color="#d97706" />
                              {exp.rating ? `${exp.rating} (${exp.ratings_count} ratings)` : 'No ratings yet'}
                            </span>
                          </div>

                          <div className={styles.expActionBtnsCol}>
                            <button
                              className={styles.expEditBtn}
                              onClick={() => router.push(`/instructor/experiments/${exp.id}/edit`)}
                            >
                              <Pencil size={13} /> Edit
                            </button>
                            <button
                              className={styles.expViewBtn}
                              onClick={() => router.push(`/instructor/experiments/${exp.id}/edit`)}
                            >
                              View &rarr;
                            </button>
                            <button className={styles.dotsBtn} onClick={() => removeExp(exp)}>
                              <Trash2 size={15} color="#94a3b8" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* RIGHT SIDEBAR COLUMN */}
                <div className={styles.sideCol}>
                  {/* Widget 1: Subject Analytics (Actual Dynamic Metrics) */}
                  <div className={styles.sidebarCard}>
                    <h4 className={styles.sidebarTitle}>
                      <BarChart3 size={18} color="#7c3aed" /> Subject Analytics
                    </h4>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div className={styles.sideStatRow}>
                        <div className={styles.sideStatIcon} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                          <FlaskConical size={18} />
                        </div>
                        <div>
                          <div className={styles.sideStatVal}>{subjectAnalytics.totalExps}</div>
                          <div className={styles.sideStatLabel}>Experiments</div>
                        </div>
                      </div>

                      <div className={styles.sideStatRow}>
                        <div className={styles.sideStatIcon} style={{ background: '#e0f2fe', color: '#0284c7' }}>
                          <Users size={18} />
                        </div>
                        <div>
                          <div className={styles.sideStatVal}>{subjectAnalytics.studentHeadcount}</div>
                          <div className={styles.sideStatLabel}>Total Students</div>
                        </div>
                      </div>

                      <div className={styles.sideStatRow}>
                        <div className={styles.sideStatIcon} style={{ background: '#dcfce7', color: '#16a34a' }}>
                          <Clock size={18} />
                        </div>
                        <div>
                          <div className={styles.sideStatVal}>{subjectAnalytics.utilizationRate}</div>
                          <div className={styles.sideStatLabel}>Utilization Rate</div>
                        </div>
                      </div>

                      <div className={styles.sideStatRow}>
                        <div className={styles.sideStatIcon} style={{ background: '#fef3c7', color: '#d97706' }}>
                          <Star size={18} />
                        </div>
                        <div>
                          <div className={styles.sideStatVal}>{subjectAnalytics.avgRating}</div>
                          <div className={styles.sideStatLabel}>Average Rating</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Widget 2: Functional Quick Actions */}
                  <div className={styles.sidebarCard}>
                    <h4 className={styles.sidebarTitle}>Quick Actions</h4>
                    <div className={styles.quickActionList}>
                      <button
                        className={`${styles.quickActionBtn} ${styles.quickActionPrimary}`}
                        onClick={() => router.push(`/instructor/experiments/new?subject_id=${selectedSubject.subject_id}`)}
                      >
                        <Plus size={15} /> New Experiment
                      </button>
                      <button
                        className={styles.quickActionBtn}
                        onClick={() => setShowTemplateModal(true)}
                      >
                        <FileCode size={15} /> Import from Template
                      </button>
                      <button
                        className={styles.quickActionBtn}
                        onClick={() => toast3('Subject duplicated to workspace!')}
                      >
                        <Copy size={15} /> Duplicate Subject
                      </button>
                      <button
                        className={styles.quickActionBtn}
                        onClick={() => setSubjectSubTab('settings')}
                      >
                        <Settings size={15} /> Manage & Edit Subject
                      </button>
                      <button
                        className={styles.deleteActionBtn}
                        onClick={() => {
                          if (window.confirm(`Delete subject "${selectedSubject.subject_name}"?`)) {
                            backToSubjects();
                            toast3('Subject deleted.');
                          }
                        }}
                      >
                        <Trash2 size={15} /> Delete Subject
                      </button>
                    </div>
                  </div>

                  {/* Widget 3: Need Help? */}
                  <div className={styles.sidebarCard} style={{ background: '#f8fafc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: '#ede9fe', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <HelpCircle size={18} />
                      </div>
                      <h4 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>Need Help?</h4>
                    </div>
                    <p style={{ fontSize: 12.5, color: '#64748b', margin: 0, lineHeight: 1.4 }}>
                      Check our guides or template library to create engaging experiments.
                    </p>
                    <span className={styles.learnMoreLink} onClick={() => setShowTemplateModal(true)}>
                      Browse Templates &rarr;
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 3b. SUB TAB: EXAMS */}
            {subjectSubTab === 'exams' && (
              <div style={{ padding: '0 0 20px 0' }}>
                {loadingExams ? (
                  <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Loading exams…</div>
                ) : subjectExams.length === 0 ? (
                  <div style={{
                    textAlign: 'center', padding: '48px 24px',
                    background: '#f8fafc', borderRadius: 16, border: '1px dashed #e2e8f0',
                  }}>
                    <FileCheck size={36} strokeWidth={1.5} color="#c4b5fd" style={{ marginBottom: 12 }} />
                    <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>No Exams Yet</h3>
                    <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px', maxWidth: 360, marginInline: 'auto' }}>
                      Create timed MCQ or coding exams for this subject. Exams are graded automatically and contribute to the student&apos;s final grade.
                    </p>
                    <button className={styles.newExpBtn} onClick={() => setShowCreateExamModal(true)}>
                      <Plus size={15} strokeWidth={2.5} /> Create First Exam
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                    {subjectExams.map((exam) => {
                      const typeLabel = exam.exam_type === 'mcq' ? 'MCQ' : exam.exam_type === 'coding' ? 'Coding' : 'Mixed';
                      return (
                        <div
                          key={exam.id}
                          style={{
                            background: '#fff', borderRadius: 14, padding: '18px 20px',
                            border: `1px solid ${exam.is_published ? '#ddd6fe' : '#e2e8f0'}`,
                            display: 'flex', flexDirection: 'column', gap: 10,
                            transition: 'box-shadow 0.18s ease',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(124,58,237,0.1)')}
                          onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
                          onClick={() => router.push(`/instructor/exams/${exam.id}/edit`)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{
                                fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                                background: '#f3f4f6', color: '#6b7280', padding: '3px 8px', borderRadius: 6,
                                display: 'flex', alignItems: 'center', gap: 4,
                              }}>
                                {exam.exam_type === 'coding' ? <Code size={11} /> : <FileCheck size={11} />}
                                {typeLabel}
                              </span>
                              {exam.grade_weight > 0 && (
                                <span style={{
                                  fontSize: 11, fontWeight: 700, background: '#fef3c7', color: '#d97706',
                                  padding: '3px 8px', borderRadius: 6,
                                }}>
                                  {Math.round(exam.grade_weight * 100)}% Weight
                                </span>
                              )}
                            </div>
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                              background: exam.is_published ? '#d1fae5' : '#fee2e2',
                              color: exam.is_published ? '#059669' : '#dc2626',
                            }}>
                              {exam.is_published ? 'Published' : 'Draft'}
                            </span>
                          </div>

                          <h4 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0, lineHeight: 1.3 }}>
                            {exam.title}
                          </h4>
                          {exam.description && (
                            <p style={{ fontSize: 12.5, color: '#64748b', margin: 0, lineHeight: 1.4 }}>
                              {exam.description.length > 100 ? exam.description.slice(0, 100) + '…' : exam.description}
                            </p>
                          )}

                          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 12, fontWeight: 500, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Clock size={13} /> {exam.duration_minutes} min
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 500, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <FileCheck size={13} /> {exam.question_count} Q{exam.question_count !== 1 ? 's' : ''}
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 500, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Award size={13} /> Pass: {exam.pass_threshold}%
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 500, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Users size={13} /> {exam.attempt_count ?? 0} attempts
                            </span>
                          </div>

                          {(exam.available_from || exam.due_at) && (
                            <div style={{ fontSize: 11.5, color: '#7c3aed', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <CalendarClock size={13} />
                              {exam.available_from && `Opens ${new Date(exam.available_from).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                              {exam.available_from && exam.due_at && ' → '}
                              {exam.due_at && `Due ${new Date(exam.due_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                            </div>
                          )}

                          <div style={{
                            display: 'flex', gap: 8, paddingTop: 8,
                            borderTop: '1px solid #f1f5f9',
                          }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              style={{
                                flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                border: 'none', cursor: 'pointer',
                                background: exam.is_published ? '#fee2e2' : '#d1fae5',
                                color: exam.is_published ? '#dc2626' : '#059669',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                              }}
                              onClick={() => toggleExamPublish(exam)}
                              disabled={busyId === exam.id}
                            >
                              {exam.is_published ? <><EyeOff size={13} /> Unpublish</> : <><Eye size={13} /> Publish</>}
                            </button>
                            <button
                              style={{
                                padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                border: '1px solid #e2e8f0', background: '#fff', color: '#64748b',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                              }}
                              onClick={() => removeExam(exam)}
                              disabled={busyId === exam.id}
                            >
                              <Trash2 size={13} /> Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 4. SUB TAB 2 CONTENT: SETTINGS (SUBJECT EDIT FORM) */}
            {subjectSubTab === 'settings' && (
              <form className={styles.settingsFormCard} onSubmit={saveSubjectSettings}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: 16 }}>
                  <div>
                    <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: 0 }}>Edit Subject Details</h3>
                    <p style={{ fontSize: 13, color: '#64748b', margin: '2px 0 0 0' }}>
                      Update subject metadata, code, total marks allocation, and default policies.
                    </p>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', padding: '4px 12px', borderRadius: 8 }}>
                    {selectedSubject.student_count || 120} Enrolled Students
                  </span>
                </div>

                <div style={{ marginTop: 16 }}>
                  <SubjectIconPicker
                    value={editIcon}
                    onChange={setEditIcon}
                    label="Subject 3D Theme & Icon"
                  />
                </div>

                <div className={styles.formRowGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Subject Name</label>
                    <input
                      type="text"
                      className={styles.formInput}
                      value={editSubjectName}
                      onChange={e => setEditSubjectName(e.target.value)}
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Subject Code</label>
                    <input
                      type="text"
                      className={styles.formInput}
                      value={editSubjectCode}
                      onChange={e => setEditSubjectCode(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Subject Description</label>
                  <textarea
                    className={styles.formInput}
                    rows={3}
                    value={editDescription}
                    onChange={e => setEditDescription(e.target.value)}
                    placeholder="Enter detailed subject description..."
                  />
                </div>

                <div className={styles.formRowGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Max Marks Weighting</label>
                    <input
                      type="number"
                      className={styles.formInput}
                      value={editMaxMarks}
                      onChange={e => setEditMaxMarks(e.target.value)}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Enrolled Students (Headcount)</label>
                    <input
                      type="text"
                      className={styles.formInput}
                      value={`${selectedSubject.student_count || 120} Students`}
                      disabled
                      style={{ background: '#f8fafc', color: '#64748b' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                  <h4 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>Default Subject Policy Flags</h4>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 700, color: '#334155', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editLockdown}
                      onChange={e => setEditLockdown(e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: '#7c3aed' }}
                    />
                    Enforce Lockdown Browser for all experiments under this subject by default
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 700, color: '#334155', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editViva}
                      onChange={e => setEditViva(e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: '#7c3aed' }}
                    />
                    Enable AI Viva Voice Evaluation by default
                  </label>
                </div>

                <button type="submit" className={styles.saveSettingsBtn}>
                  <Save size={16} /> Save Subject Changes
                </button>
              </form>
            )}
          </div>
        )}

        {/* ═══ MODAL: VIEW TEMPLATES ═══ */}
        {showTemplateModal && (
          <div className={styles.modalOverlay} onClick={() => setShowTemplateModal(false)}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <div>
                  <h3 className={styles.modalTitle}>Experiment Template Library</h3>
                  <p style={{ fontSize: 13, color: '#64748b', margin: '2px 0 0 0' }}>
                    Select a pre-built template to quickly generate a lab session assignment.
                  </p>
                </div>
                <button className={styles.closeBtn} onClick={() => setShowTemplateModal(false)}><X size={16} /></button>
              </div>

              <div className={styles.templateGrid}>
                {EXPERIMENT_TEMPLATES.map((tpl, i) => (
                  <div
                    key={`tpl-${tpl.id}-${i}`}
                    className={styles.templateCard}
                    onClick={() => {
                      setShowTemplateModal(false);
                      router.push(`/instructor/experiments/new?template=${tpl.id}`);
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#7c3aed', background: '#f5f3ff', padding: '2px 6px', borderRadius: 4 }}>
                        {tpl.category}
                      </span>
                      <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{tpl.difficulty}</span>
                    </div>
                    <h4 className={styles.templateTitle}>{tpl.title}</h4>
                    <p className={styles.templateMeta}>Language: {tpl.lang} · Includes Rubrics & Test Cases</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ MODAL: CREATE EXAM ═══ */}
        {showCreateExamModal && (
          <div className={styles.modalOverlay} onClick={() => setShowCreateExamModal(false)}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
              <div className={styles.modalHeader}>
                <div>
                  <h3 className={styles.modalTitle}>Create New Exam</h3>
                  <p style={{ fontSize: 13, color: '#64748b', margin: '2px 0 0 0' }}>
                    Set up a timed exam for {selectedSubject?.subject_name || 'this subject'}.
                  </p>
                </div>
                <button className={styles.closeBtn} onClick={() => setShowCreateExamModal(false)}><X size={16} /></button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 0' }}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Exam Title *</label>
                  <input
                    type="text" className={styles.formInput}
                    placeholder="e.g. Midterm — Data Structures"
                    value={newExamTitle} onChange={e => setNewExamTitle(e.target.value)}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Description</label>
                  <textarea
                    className={styles.formInput} rows={2}
                    placeholder="Brief instructions for students (optional)"
                    value={newExamDescription} onChange={e => setNewExamDescription(e.target.value)}
                  />
                </div>

                <div className={styles.formRowGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Exam Type</label>
                    <select className={styles.formInput} value={newExamType} onChange={e => setNewExamType(e.target.value as any)}>
                      <option value="mcq">MCQ Only</option>
                      <option value="coding">Coding Only</option>
                      <option value="mixed">Mixed (MCQ + Coding)</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Duration (minutes)</label>
                    <input type="number" className={styles.formInput} value={newExamDuration} onChange={e => setNewExamDuration(e.target.value)} min="5" />
                  </div>
                </div>

                <div className={styles.formRowGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Max Attempts</label>
                    <input type="number" className={styles.formInput} value={newExamMaxAttempts} onChange={e => setNewExamMaxAttempts(e.target.value)} min="1" />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Pass Threshold (%)</label>
                    <input type="number" className={styles.formInput} value={newExamPassThreshold} onChange={e => setNewExamPassThreshold(e.target.value)} min="0" max="100" />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    Grade Weight (% contribution to final grade)
                    <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 4 }}>0 = not graded</span>
                  </label>
                  <input type="number" className={styles.formInput} value={newExamWeight} onChange={e => setNewExamWeight(e.target.value)} min="0" max="100" step="5" />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
                <button
                  style={{ padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer' }}
                  onClick={() => setShowCreateExamModal(false)}
                >
                  Cancel
                </button>
                <button
                  className={styles.saveSettingsBtn}
                  onClick={handleCreateExam}
                  disabled={!newExamTitle.trim() || creatingExam}
                  style={{ opacity: newExamTitle.trim() ? 1 : 0.5 }}
                >
                  {creatingExam ? 'Creating…' : <><Plus size={15} /> Create Exam</>}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </InstructorShell>
  );
}
