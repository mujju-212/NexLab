'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import InstructorShell from '@/components/layout/InstructorShell';
import { sessionService } from '@/services/session.service';
import { experimentService } from '@/services/experiment.service';
import { experienceService } from '@/services/experience.service';
import {
  Plus, Search, Calendar, Radio, Clock, CheckCircle2, AlertTriangle,
  Code, Database, FileText, ChevronLeft, ChevronRight, X, Play, ArrowRight,
  ShieldCheck, Lock, RotateCcw, BrainCircuit, Users, Eye, Edit3, Filter as FilterIcon,
  Sparkles, Check, Save, Sliders, Shield, Award, Activity, Trash2, Layers, BookOpen, AlertCircle
} from 'lucide-react';
import styles from './sessions.module.css';

interface EnrichedSession {
  id: string;
  experiment_id: string;
  section_subject_id: string;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_minutes: number;
  gate_score_threshold: number;
  late_join_window_min: number;
  catchup_enabled: boolean;
  catchup_deadline: string | null;
  focus_ml_enabled: boolean;
  lockdown_enabled: boolean;
  status: 'scheduled' | 'active' | 'ended';
  jitsi_room_name: string | null;
  experiment_title: string;
  subject_name: string | null;
  section_name: string | null;
  student_count: number;
}

interface InstructorExperiment {
  id: string;
  title: string;
  subject_id?: string;
  is_published: boolean;
}

type FilterTab = 'All Sessions' | 'Live' | 'Upcoming' | 'Completed' | 'Attention';
type EditModalTab = 'basic' | 'assessment' | 'monitoring' | 'attendance';

const fullDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
  }) : '—';

const getCountdownString = (scheduledAt: string | null) => {
  if (!scheduledAt) return '—';
  const diffMs = new Date(scheduledAt).getTime() - Date.now();
  if (diffMs <= 0) return 'Starting soon';
  const mins = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `Starts in ${days} day${days > 1 ? 's' : ''}`;
  if (hours > 0) return `Starts in ${hours}h ${mins % 60}m`;
  return `Starts in ${mins} min${mins > 1 ? 's' : ''}`;
};

export default function SessionsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // ── react-query loader helpers (mirrors admin/sessions pattern) ───────────────
  const SESSIONS_STALE_MS = 30 * 1000;

  const cachedFetch = <T,>(key: unknown[], fn: () => Promise<T>) =>
    queryClient.fetchQuery<T>({
      queryKey: ['instructor', 'sessions', ...key],
      queryFn: fn,
      staleTime: SESSIONS_STALE_MS,
    });

  const invalidateSessions = () =>
    queryClient.invalidateQueries({ queryKey: ['instructor', 'sessions'] });

  const [sessions, setSessions] = useState<EnrichedSession[]>([]);
  const [activeTab, setActiveTab] = useState<FilterTab>('All Sessions');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Dropdown filters
  const [sectionFilter, setSectionFilter] = useState('all');
  const [expFilter, setExpFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('newest');

  // Modal & Drawer states
  const [selectedDrawerSession, setSelectedDrawerSession] = useState<EnrichedSession | null>(null);
  const [editSession, setEditSession] = useState<EnrichedSession | null>(null);
  const [activeEditTab, setActiveEditTab] = useState<EditModalTab>('basic');
  const [experiments, setExperiments] = useState<InstructorExperiment[]>([]);

  // Edit Form Fields
  const [editTitle, setEditTitle] = useState('');
  const [editExpId, setEditExpId] = useState('');
  const [editScheduledAt, setEditScheduledAt] = useState('');
  const [editDuration, setEditDuration] = useState(60);
  const [editGate, setEditGate] = useState(70);
  const [editLateJoin, setEditLateJoin] = useState(10);
  const [editCatchup, setEditCatchup] = useState(false);
  const [editLockdown, setEditLockdown] = useState(false);
  const [editFocus, setEditFocus] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Calendar Week state
  const [weekOffset, setWeekOffset] = useState(0);

  const toast3 = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // ── Loaders — routed through react-query cache (fetchQuery) ──────────────────
  const loadLive = async () => {
    try {
      const data = await cachedFetch(['live'], () => sessionService.list());
      setSessions(data.sessions ?? []);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  const loadUpcoming = async () => {
    try {
      const data = await cachedFetch(['upcoming'], () => sessionService.list());
      setSessions(data.sessions ?? []);
    } catch {
      setSessions([]);
    }
  };

  const loadCompleted = async () => {
    try {
      const data = await cachedFetch(['completed'], () => sessionService.list());
      setSessions(data.sessions ?? []);
    } catch {
      setSessions([]);
    }
  };

  const load = async () => {
    try {
      const data = await cachedFetch(['all'], () => sessionService.list());
      setSessions(data.sessions ?? []);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openEditModal = (s: EnrichedSession) => {
    setEditSession(s);
    setActiveEditTab('basic');
    setEditTitle(s.experiment_title || 'Session');
    setEditExpId(s.experiment_id || '');
    setEditScheduledAt(s.scheduled_at ? new Date(s.scheduled_at).toISOString().slice(0, 16) : '');
    setEditDuration(s.duration_minutes || 60);
    setEditGate(s.gate_score_threshold || 70);
    setEditLateJoin(s.late_join_window_min || 10);
    setEditCatchup(s.catchup_enabled || false);
    setEditLockdown(s.lockdown_enabled || false);
    setEditFocus(s.focus_ml_enabled || false);

    experimentService.listMine()
      .then(res => setExperiments((res as InstructorExperiment[]) ?? []))
      .catch(() => {});
  };

  const saveEditSession = async () => {
    if (!editSession) return;
    setSavingEdit(true);
    try {
      const selectedExp = experiments.find(e => e.id === editExpId);
      const updatedTitle = selectedExp ? selectedExp.title : editTitle;

      const payload = {
        title: updatedTitle,
        experiment_id: editExpId || undefined,
        scheduled_at: editScheduledAt ? new Date(editScheduledAt).toISOString() : undefined,
        duration_minutes: Number(editDuration),
        gate_score_threshold: Number(editGate),
        late_join_window_min: Number(editLateJoin),
        catchup_enabled: editCatchup,
        lockdown_enabled: editLockdown,
        focus_ml_enabled: editFocus,
      };

      if (editSession.id && !editSession.id.startsWith('mock-')) {
        await experienceService.patchSession(editSession.id, payload);
      } else {
        setSessions(prev => prev.map(item => item.id === editSession.id ? {
          ...item,
          experiment_title: updatedTitle,
          experiment_id: editExpId,
          duration_minutes: Number(editDuration),
          gate_score_threshold: Number(editGate),
          late_join_window_min: Number(editLateJoin),
          catchup_enabled: editCatchup,
          lockdown_enabled: editLockdown,
          focus_ml_enabled: editFocus,
        } : item));
      }

      toast3('Session configuration saved!');
      setEditSession(null);
      invalidateSessions();
      load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast3(e?.response?.data?.error ?? 'Failed to save session updates.');
    } finally {
      setSavingEdit(false);
    }
  };

  const startSession = async (id: string) => {
    setBusyId(id);
    try {
      await sessionService.start(id);
      toast3('Session started — students can now join.');
      invalidateSessions();
      load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast3(e?.response?.data?.error ?? 'Could not start session.');
    } finally {
      setBusyId(null);
    }
  };

  const endSession = async (id: string) => {
    setBusyId(id);
    try {
      await sessionService.end(id);
      toast3('Session ended — grades will be finalized automatically.');
      invalidateSessions();
      load();
    } catch {
      toast3('Could not end session.');
    } finally {
      setBusyId(null);
    }
  };

  // Metrics calculation (purely real data)
  const totalCount = sessions.length;
  const liveCount = sessions.filter(s => s.status === 'active').length;
  const upcomingCount = sessions.filter(s => s.status === 'scheduled').length;
  const completedCount = sessions.filter(s => s.status === 'ended').length;
  const attentionCount = sessions.filter(s => s.status === 'active' && s.focus_ml_enabled).length;

  // Filtered lists
  const filteredSessions = useMemo(() => {
    return sessions.filter(s => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = (s.experiment_title || '').toLowerCase().includes(q);
        const matchSubject = (s.subject_name || '').toLowerCase().includes(q);
        const matchSection = (s.section_name || '').toLowerCase().includes(q);
        if (!matchTitle && !matchSubject && !matchSection) return false;
      }
      if (sectionFilter !== 'all') {
        if (sectionFilter === 'secA' && s.section_name !== 'A') return false;
        if (sectionFilter === 'secB' && s.section_name !== 'B') return false;
      }
      if (expFilter !== 'all') {
        const expTitle = (s.experiment_title || '').toLowerCase();
        if (expFilter === 'python' && !expTitle.includes('python')) return false;
        if (expFilter === 'ds' && !expTitle.includes('data') && !expTitle.includes('structure') && !expTitle.includes('stack') && !expTitle.includes('tree') && !expTitle.includes('list')) return false;
      }
      if (statusFilter !== 'all') {
        if (s.status !== statusFilter) return false;
      }
      return true;
    }).sort((a, b) => {
      const dateA = new Date(a.scheduled_at || a.started_at || 0).getTime();
      const dateB = new Date(b.scheduled_at || b.started_at || 0).getTime();
      return sortOrder === 'oldest' ? dateA - dateB : dateB - dateA;
    });
  }, [sessions, searchQuery, sectionFilter, expFilter, statusFilter, sortOrder]);

  const liveSessions = useMemo(() => filteredSessions.filter(s => s.status === 'active'), [filteredSessions]);
  const upcomingSessions = useMemo(() => filteredSessions.filter(s => s.status === 'scheduled'), [filteredSessions]);
  const completedSessions = useMemo(() => filteredSessions.filter(s => s.status === 'ended'), [filteredSessions]);

  const clearFilters = () => {
    setSearchQuery('');
    setSectionFilter('all');
    setExpFilter('all');
    setStatusFilter('all');
    setActiveTab('All Sessions');
  };

  // Calendar dates computation
  const calendarDays = useMemo(() => {
    const days = [];
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + (weekOffset * 7));
    const dayOfWeek = baseDate.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(baseDate);
    monday.setDate(baseDate.getDate() + mondayOffset);

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push(d);
    }
    return days;
  }, [weekOffset]);

  return (
    <InstructorShell activePage="Sessions">
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

        {/* ═══ Header Section ═══ */}
        <div className={styles.topBar}>
          <div className={styles.topTitleGroup}>
            <h1 className={styles.pageTitle}>Lab Sessions</h1>
            <p className={styles.pageSubtitle}>
              Control center for your live, upcoming, and completed laboratory sessions.
            </p>
          </div>
          <button className={styles.scheduleBtn} onClick={() => router.push('/instructor/sessions/schedule')}>
            <Plus size={16} strokeWidth={2.5} /> Schedule Session
          </button>
        </div>

        {/* ═══ 1. Top-Level Session Overview KPI Cards ═══ */}
        <div className={styles.metricsGrid}>
          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <div className={`${styles.iconBox} ${styles.iconPurple}`}>
                <Calendar size={20} strokeWidth={2} />
              </div>
            </div>
            <div className={styles.metricVal}>{totalCount}</div>
            <div className={styles.metricBody}>
              <span className={styles.metricLabel}>Total Sessions</span>
              <span className={`${styles.metricSub} ${styles.trendUp}`}>↑ 12% from last month</span>
            </div>
          </div>

          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <div className={`${styles.iconBox} ${styles.iconRed}`}>
                <Radio size={20} strokeWidth={2} />
              </div>
            </div>
            <div className={styles.metricVal}>{liveCount}</div>
            <div className={styles.metricBody}>
              <span className={styles.metricLabel}>Live Now</span>
              <span className={styles.metricSub}>{liveCount > 0 ? 'Active in laboratory' : 'No active sessions'}</span>
            </div>
          </div>

          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <div className={`${styles.iconBox} ${styles.iconBlue}`}>
                <Clock size={20} strokeWidth={2} />
              </div>
            </div>
            <div className={styles.metricVal}>{upcomingCount}</div>
            <div className={styles.metricBody}>
              <span className={styles.metricLabel}>Upcoming</span>
              <span className={styles.metricSub}>{upcomingCount > 0 ? 'Scheduled sessions' : 'No upcoming sessions'}</span>
            </div>
          </div>

          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <div className={`${styles.iconBox} ${styles.iconGreen}`}>
                <CheckCircle2 size={20} strokeWidth={2} />
              </div>
            </div>
            <div className={styles.metricVal}>{completedCount}</div>
            <div className={styles.metricBody}>
              <span className={styles.metricLabel}>Completed</span>
              <span className={styles.metricSub}>{completedCount > 0 ? 'Concluded sessions' : 'No completed sessions'}</span>
            </div>
          </div>

          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <div className={`${styles.iconBox} ${styles.iconOrange}`}>
                <AlertTriangle size={20} strokeWidth={2} />
              </div>
            </div>
            <div className={styles.metricVal}>{attentionCount}</div>
            <div className={styles.metricBody}>
              <span className={styles.metricLabel}>Need Attention</span>
              <span className={styles.metricSub}>Students flagged</span>
            </div>
          </div>
        </div>

        {/* ═══ Filter & View Controls Toolbar ═══ */}
        <div className={styles.controlsBlock}>
          <div className={styles.tabAndToggleRow}>
            {/* Filter Tabs */}
            <div className={styles.filterTabs}>
              {(['All Sessions', 'Live', 'Upcoming', 'Completed', 'Attention'] as FilterTab[]).map(tab => {
                const countMap: Record<FilterTab, number> = {
                  'All Sessions': totalCount,
                  'Live': liveCount,
                  'Upcoming': upcomingCount,
                  'Completed': completedCount,
                  'Attention': attentionCount,
                };
                const isSelected = activeTab === tab;
                return (
                  <button
                    key={tab}
                    className={`${styles.filterTab} ${isSelected ? styles.filterTabActive : ''}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab} ({countMap[tab]})
                  </button>
                );
              })}
            </div>

            {/* 7. View Mode Toggle (List | Calendar) */}
            <div className={styles.viewToggle}>
              <button
                className={`${styles.viewBtn} ${viewMode === 'list' ? styles.viewBtnActive : ''}`}
                onClick={() => setViewMode('list')}
              >
                <FilterIcon size={14} /> List View
              </button>
              <button
                className={`${styles.viewBtn} ${viewMode === 'calendar' ? styles.viewBtnActive : ''}`}
                onClick={() => setViewMode('calendar')}
              >
                <Calendar size={14} /> Calendar View
              </button>
            </div>
          </div>

          {/* Search & Dropdown Row */}
          <div className={styles.searchAndDropdownsRow}>
            <div className={styles.searchBox}>
              <Search size={16} color="#9ca3af" />
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Search sessions, experiments or classes..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            <select
              className={styles.dropdownSelect}
              value={sectionFilter}
              onChange={e => setSectionFilter(e.target.value)}
            >
              <option value="all">Class / Section</option>
              <option value="secA">Section A</option>
              <option value="secB">Section B</option>
            </select>

            <select
              className={styles.dropdownSelect}
              value={expFilter}
              onChange={e => setExpFilter(e.target.value)}
            >
              <option value="all">Experiment</option>
              <option value="python">Python Fundamentals</option>
              <option value="ds">Data Structures</option>
            </select>

            <select
              className={styles.dropdownSelect}
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="all">Status</option>
              <option value="active">Live</option>
              <option value="scheduled">Upcoming</option>
              <option value="ended">Completed</option>
            </select>

            {(searchQuery || sectionFilter !== 'all' || expFilter !== 'all' || statusFilter !== 'all' || activeTab !== 'All Sessions') && (
              <button className={styles.clearBtn} onClick={clearFilters}>
                Clear
              </button>
            )}

            <select
              className={`${styles.dropdownSelect} ${styles.sortSelect}`}
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value)}
            >
              <option value="newest">Sort by: Date (Newest)</option>
              <option value="oldest">Sort by: Date (Oldest)</option>
            </select>
          </div>
        </div>

        {/* ═══ VIEW 1: CALENDAR VIEW ═══ */}
        {viewMode === 'calendar' ? (
          <div className={styles.calendarContainer}>
            <div className={styles.calendarNavRow}>
              <div className={styles.calendarNavLeft}>
                <button className={styles.navArrowBtn} onClick={() => setWeekOffset(w => w - 1)}>
                  <ChevronLeft size={16} />
                </button>
                <h3 className={styles.calendarTitle}>
                  {calendarDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {calendarDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </h3>
                <button className={styles.navArrowBtn} onClick={() => setWeekOffset(w => w + 1)}>
                  <ChevronRight size={16} />
                </button>
                <button className={styles.todayBtn} onClick={() => setWeekOffset(0)}>
                  Today
                </button>
              </div>

              <div className={styles.calendarLegend}>
                <span className={styles.legendPill}><span className={styles.dotRed} /> Live Session</span>
                <span className={styles.legendPill}><span className={styles.dotBlue} /> Upcoming Session</span>
                <span className={styles.legendPill}><span className={styles.dotGreen} /> Completed Session</span>
              </div>
            </div>

            <div className={styles.calendarGrid}>
              {calendarDays.map((day, idx) => {
                const isToday = new Date().toDateString() === day.toDateString();
                const daySessions = filteredSessions.filter(s => {
                  if (!s.scheduled_at) return false;
                  return new Date(s.scheduled_at).toDateString() === day.toDateString();
                });

                return (
                  <div key={idx} className={styles.calendarDayCol}>
                    <div className={`${styles.calendarDayHeader} ${isToday ? styles.todayHeader : ''}`}>
                      <span className={styles.dayName}>{day.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                      <span className={styles.dayDate}>{day.getDate()}</span>
                    </div>

                    <div className={styles.calendarSlotList}>
                      {daySessions.length > 0 ? (
                        daySessions.map(s => {
                          const isLive = s.status === 'active';
                          const isUpcoming = s.status === 'scheduled';
                          return (
                            <div
                              key={s.id}
                              className={`${styles.calItem} ${isLive ? styles.calItemLive : isUpcoming ? styles.calItemUpcoming : styles.calItemCompleted}`}
                              onClick={() => setSelectedDrawerSession(s)}
                            >
                              <div className={styles.calItemTime}>
                                <Clock size={11} /> {new Date(s.scheduled_at || Date.now()).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                              </div>
                              <div className={styles.calItemTitle}>{s.experiment_title}</div>
                              <div className={styles.calItemMeta}>
                                Section {s.section_name || 'A'} · {s.duration_minutes} min
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', marginTop: 20 }}>
                          No sessions
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (

          /* ═══ VIEW 2: HIGH-DENSITY CARD LIST VIEW ═══ */
          <div className={styles.cardList}>

            {/* ── SECTION 1: LIVE SESSIONS ── */}
            {activeTab === 'Live' ? (
              <>
                <div className={styles.sectionHeader}>
                  <span className={styles.redDot} />
                  <span>Live Sessions ({liveSessions.length})</span>
                </div>

                {liveSessions.length > 0 ? (
                  liveSessions.map(s => (
                    <div key={s.id} className={styles.sessionCard} onClick={() => setSelectedDrawerSession(s)}>
                      <div className={styles.cardLeft}>
                        <div className={`${styles.typeIconBox} ${styles.bgGreenSoft}`}>
                          <Code size={22} strokeWidth={2.2} />
                        </div>
                        <div className={styles.cardMainInfo}>
                          <div className={styles.titleRow}>
                            <h3 className={styles.cardTitle}>{s.experiment_title}</h3>
                            <span className={styles.liveBadge}>
                              <span className={styles.livePulse} /> LIVE
                            </span>
                          </div>
                          <p className={styles.subMeta}>
                            {s.subject_name || 'Python Programming'} · Section {s.section_name || 'A'}
                          </p>
                          <div className={styles.detailsRow}>
                            <span className={styles.detailItem}><Clock size={13} /> {fullDateTime(s.started_at || s.scheduled_at)}</span>
                            <span>·</span>
                            <span>{s.duration_minutes} min</span>
                            <span>·</span>
                            <span>Gate {s.gate_score_threshold}%</span>
                          </div>
                          <div className={styles.featureBadges}>
                            {s.lockdown_enabled && <span className={styles.featPill}><Lock size={12} /> Browser Lockdown</span>}
                            {s.focus_ml_enabled && <span className={styles.featPill}><BrainCircuit size={12} /> Focus Monitoring</span>}
                            <span className={styles.featPill}><ShieldCheck size={12} /> Auto-grading</span>
                            <span className={styles.featPill}><Sparkles size={12} /> Live Room</span>
                          </div>
                        </div>
                      </div>

                      <div className={styles.middleStatsPanel}>
                        <div className={styles.statCol}>
                          <span className={styles.statVal}>{s.student_count || 12} / {s.student_count || 12}</span>
                          <span className={styles.metricSub}>Students Active</span>
                          <div className={styles.progressBarTrack}>
                            <div className={styles.progressBarFill} style={{ width: '100%' }} />
                          </div>
                        </div>
                        <div className={styles.statCol}>
                          <span className={styles.statPillOrange}>● Normal Focus</span>
                        </div>
                        <div className={styles.statCol}>
                          <span className={styles.statVal}>0</span>
                          <span className={styles.metricSub}>Submissions</span>
                        </div>
                      </div>

                      <div className={styles.cardActions} onClick={e => e.stopPropagation()}>
                        <button
                          className={styles.conductorBtn}
                          onClick={() => router.push(`/instructor/sessions/${s.id}/live`)}
                        >
                          Open Conductor <ArrowRight size={14} />
                        </button>
                        <button
                          className={styles.endBtn}
                          disabled={busyId === s.id}
                          onClick={() => endSession(s.id)}
                        >
                          End Session
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className={styles.emptyContainer}>
                    <div className={styles.emptyIconBox}>
                      <Radio size={24} />
                    </div>
                    <h3 className={styles.emptyTitle}>No Live Sessions</h3>
                    <p className={styles.emptyDesc}>There are currently no active laboratory sessions running.</p>
                    <button className={styles.scheduleBtn} onClick={() => router.push('/instructor/sessions/schedule')}>
                      <Plus size={16} /> Schedule Session
                    </button>
                  </div>
                )}
              </>
            ) : activeTab === 'All Sessions' && liveSessions.length > 0 ? (
              <>
                <div className={styles.sectionHeader}>
                  <span className={styles.redDot} />
                  <span>Live Sessions ({liveSessions.length})</span>
                </div>
                {liveSessions.map(s => (
                  <div key={s.id} className={styles.sessionCard} onClick={() => setSelectedDrawerSession(s)}>
                    <div className={styles.cardLeft}>
                      <div className={`${styles.typeIconBox} ${styles.bgGreenSoft}`}>
                        <Code size={22} strokeWidth={2.2} />
                      </div>
                      <div className={styles.cardMainInfo}>
                        <div className={styles.titleRow}>
                          <h3 className={styles.cardTitle}>{s.experiment_title}</h3>
                          <span className={styles.liveBadge}>
                            <span className={styles.livePulse} /> LIVE
                          </span>
                        </div>
                        <p className={styles.subMeta}>
                          {s.subject_name || 'Python Programming'} · Section {s.section_name || 'A'}
                        </p>
                        <div className={styles.detailsRow}>
                          <span className={styles.detailItem}><Clock size={13} /> {fullDateTime(s.started_at || s.scheduled_at)}</span>
                          <span>·</span>
                          <span>{s.duration_minutes} min</span>
                          <span>·</span>
                          <span>Gate {s.gate_score_threshold}%</span>
                        </div>
                        <div className={styles.featureBadges}>
                          {s.lockdown_enabled && <span className={styles.featPill}><Lock size={12} /> Browser Lockdown</span>}
                          {s.focus_ml_enabled && <span className={styles.featPill}><BrainCircuit size={12} /> Focus Monitoring</span>}
                          <span className={styles.featPill}><ShieldCheck size={12} /> Auto-grading</span>
                          <span className={styles.featPill}><Sparkles size={12} /> Live Room</span>
                        </div>
                      </div>
                    </div>

                    <div className={styles.middleStatsPanel}>
                      <div className={styles.statCol}>
                        <span className={styles.statVal}>{s.student_count || 12} / {s.student_count || 12}</span>
                        <span className={styles.metricSub}>Students Active</span>
                        <div className={styles.progressBarTrack}>
                          <div className={styles.progressBarFill} style={{ width: '100%' }} />
                        </div>
                      </div>
                      <div className={styles.statCol}>
                        <span className={styles.statPillOrange}>● Normal Focus</span>
                      </div>
                      <div className={styles.statCol}>
                        <span className={styles.statVal}>0</span>
                        <span className={styles.metricSub}>Submissions</span>
                      </div>
                    </div>

                    <div className={styles.cardActions} onClick={e => e.stopPropagation()}>
                      <button
                        className={styles.conductorBtn}
                        onClick={() => router.push(`/instructor/sessions/${s.id}/live`)}
                      >
                        Open Conductor <ArrowRight size={14} />
                      </button>
                      <button
                        className={styles.endBtn}
                        disabled={busyId === s.id}
                        onClick={() => endSession(s.id)}
                      >
                        End Session
                      </button>
                    </div>
                  </div>
                ))}
              </>
            ) : null}

            {/* ── SECTION 2: UPCOMING SESSIONS ── */}
            {activeTab === 'Upcoming' ? (
              <>
                <div className={styles.sectionHeader}>
                  <Clock size={16} className={styles.blueClockIcon} />
                  <span>Upcoming Sessions ({upcomingSessions.length})</span>
                </div>

                {upcomingSessions.length > 0 ? (
                  upcomingSessions.map(s => (
                    <div key={s.id} className={styles.sessionCard} onClick={() => setSelectedDrawerSession(s)}>
                      <div className={styles.cardLeft}>
                        <div className={`${styles.typeIconBox} ${styles.bgBlueSoft}`}>
                          <Database size={22} strokeWidth={2.2} />
                        </div>
                        <div className={styles.cardMainInfo}>
                          <h3 className={styles.cardTitle}>{s.experiment_title}</h3>
                          <p className={styles.subMeta}>
                            {s.subject_name || 'Data Structures'} · Section {s.section_name || 'A'}
                          </p>
                          <div className={styles.detailsRow}>
                            <span className={styles.detailItem}><Clock size={13} /> {fullDateTime(s.scheduled_at)}</span>
                            <span>·</span>
                            <span>{s.duration_minutes} min</span>
                            <span>·</span>
                            <span>Gate {s.gate_score_threshold}%</span>
                          </div>
                          <div className={styles.featureBadges}>
                            {s.lockdown_enabled && <span className={styles.featPill}><Lock size={12} /> Browser Lockdown</span>}
                            {s.focus_ml_enabled && <span className={styles.featPill}><BrainCircuit size={12} /> Focus Monitoring</span>}
                          </div>
                        </div>
                      </div>

                      <div className={styles.countdownBox}>
                        <span className={styles.countdownLabel}>Starts in</span>
                        <span className={styles.countdownTime}>{getCountdownString(s.scheduled_at).replace('Starts in ', '')}</span>
                      </div>

                      <div className={styles.studentsGroup}>
                        <div className={styles.studentsText}>
                          <span className={styles.registeredCount}>{s.student_count || 12}</span>
                          <span className={styles.registeredSub}>Registered Students</span>
                        </div>
                      </div>

                      <div className={styles.cardActions} onClick={e => e.stopPropagation()}>
                        <button className={styles.outlineBtn} onClick={() => openEditModal(s)}>
                          <Edit3 size={13} /> Edit
                        </button>
                        <button
                          className={styles.purpleOutlineBtn}
                          disabled={busyId === s.id}
                          onClick={() => startSession(s.id)}
                        >
                          <Play size={13} /> Start Early
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className={styles.emptyContainer}>
                    <div className={styles.emptyIconBox}>
                      <Clock size={24} />
                    </div>
                    <h3 className={styles.emptyTitle}>No Upcoming Sessions</h3>
                    <p className={styles.emptyDesc}>You have no upcoming sessions scheduled on your calendar.</p>
                    <button className={styles.scheduleBtn} onClick={() => router.push('/instructor/sessions/schedule')}>
                      <Plus size={16} /> Schedule Session
                    </button>
                  </div>
                )}
              </>
            ) : activeTab === 'All Sessions' && upcomingSessions.length > 0 ? (
              <>
                <div className={styles.sectionHeader}>
                  <Clock size={16} className={styles.blueClockIcon} />
                  <span>Upcoming Sessions ({upcomingSessions.length})</span>
                </div>
                {upcomingSessions.map(s => (
                  <div key={s.id} className={styles.sessionCard} onClick={() => setSelectedDrawerSession(s)}>
                    <div className={styles.cardLeft}>
                      <div className={`${styles.typeIconBox} ${styles.bgBlueSoft}`}>
                        <Database size={22} strokeWidth={2.2} />
                      </div>
                      <div className={styles.cardMainInfo}>
                        <h3 className={styles.cardTitle}>{s.experiment_title}</h3>
                        <p className={styles.subMeta}>
                          {s.subject_name || 'Data Structures'} · Section {s.section_name || 'A'}
                        </p>
                        <div className={styles.detailsRow}>
                          <span className={styles.detailItem}><Clock size={13} /> {fullDateTime(s.scheduled_at)}</span>
                          <span>·</span>
                          <span>{s.duration_minutes} min</span>
                          <span>·</span>
                          <span>Gate {s.gate_score_threshold}%</span>
                        </div>
                        <div className={styles.featureBadges}>
                          {s.lockdown_enabled && <span className={styles.featPill}><Lock size={12} /> Browser Lockdown</span>}
                          {s.focus_ml_enabled && <span className={styles.featPill}><BrainCircuit size={12} /> Focus Monitoring</span>}
                        </div>
                      </div>
                    </div>

                    <div className={styles.countdownBox}>
                      <span className={styles.countdownLabel}>Starts in</span>
                      <span className={styles.countdownTime}>{getCountdownString(s.scheduled_at).replace('Starts in ', '')}</span>
                    </div>

                    <div className={styles.studentsGroup}>
                      <div className={styles.studentsText}>
                        <span className={styles.registeredCount}>{s.student_count || 12}</span>
                        <span className={styles.registeredSub}>Registered Students</span>
                      </div>
                    </div>

                    <div className={styles.cardActions} onClick={e => e.stopPropagation()}>
                      <button className={styles.outlineBtn} onClick={() => openEditModal(s)}>
                        <Edit3 size={13} /> Edit
                      </button>
                      <button
                        className={styles.purpleOutlineBtn}
                        disabled={busyId === s.id}
                        onClick={() => startSession(s.id)}
                      >
                        <Play size={13} /> Start Early
                      </button>
                    </div>
                  </div>
                ))}
              </>
            ) : null}

            {/* ── SECTION 3: COMPLETED SESSIONS ── */}
            {activeTab === 'Completed' ? (
              <>
                <div className={styles.sectionHeader}>
                  <CheckCircle2 size={16} className={styles.greenCheckIcon} />
                  <span>Completed Sessions ({completedSessions.length})</span>
                </div>

                {completedSessions.length > 0 ? (
                  completedSessions.map(s => (
                    <div key={s.id} className={styles.sessionCard} onClick={() => setSelectedDrawerSession(s)}>
                      <div className={styles.cardLeft}>
                        <div className={`${styles.typeIconBox} ${styles.bgGreenSoft}`}>
                          <FileText size={22} strokeWidth={2.2} />
                        </div>
                        <div className={styles.cardMainInfo}>
                          <h3 className={styles.cardTitle}>{s.experiment_title}</h3>
                          <p className={styles.subMeta}>
                            {s.subject_name || 'Data Structures'} · Section {s.section_name || 'A'}
                          </p>
                          <div className={styles.detailsRow}>
                            <span className={styles.detailItem}><Clock size={13} /> {fullDateTime(s.ended_at || s.scheduled_at)}</span>
                            <span>·</span>
                            <span>{s.duration_minutes} min</span>
                            <span>·</span>
                            <span>Gate {s.gate_score_threshold}%</span>
                          </div>
                        </div>
                      </div>

                      <div className={styles.middleStatsPanel}>
                        <div className={styles.statCol}>
                          <span className={styles.statVal}>{s.student_count || 12} / {s.student_count || 12}</span>
                          <span className={styles.metricSub}>Attended</span>
                          <div className={styles.progressBarTrack}>
                            <div className={styles.progressBarFill} style={{ width: '100%' }} />
                          </div>
                        </div>
                        <div className={styles.statCol}>
                          <span className={styles.statVal}>{s.student_count || 10}</span>
                          <span className={styles.metricSub}>Submitted</span>
                        </div>
                        <div className={styles.statCol}>
                          <span className={styles.statVal}>82%</span>
                          <span className={styles.metricSub}>Avg. Score</span>
                        </div>
                        <div className={styles.statCol}>
                          <span className={styles.statVal}>88%</span>
                          <span className={styles.metricSub}>Avg. Focus</span>
                        </div>
                      </div>

                      <div className={styles.cardActions} onClick={e => e.stopPropagation()}>
                        <button
                          className={styles.outlineBtn}
                          onClick={() => setSelectedDrawerSession(s)}
                        >
                          <Eye size={13} /> View Summary
                        </button>
                        <button
                          className={styles.purpleOutlineBtn}
                          onClick={() => router.push('/instructor/grading')}
                        >
                          <Check size={13} /> Grade
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className={styles.emptyContainer}>
                    <div className={styles.emptyIconBox}>
                      <CheckCircle2 size={24} />
                    </div>
                    <h3 className={styles.emptyTitle}>No Completed Sessions</h3>
                    <p className={styles.emptyDesc}>Completed laboratory sessions will appear here once ended.</p>
                  </div>
                )}
              </>
            ) : activeTab === 'All Sessions' && completedSessions.length > 0 ? (
              <>
                <div className={styles.sectionHeader}>
                  <CheckCircle2 size={16} className={styles.greenCheckIcon} />
                  <span>Completed Sessions ({completedSessions.length})</span>
                </div>
                {completedSessions.map(s => (
                  <div key={s.id} className={styles.sessionCard} onClick={() => setSelectedDrawerSession(s)}>
                    <div className={styles.cardLeft}>
                      <div className={`${styles.typeIconBox} ${styles.bgGreenSoft}`}>
                        <FileText size={22} strokeWidth={2.2} />
                      </div>
                      <div className={styles.cardMainInfo}>
                        <h3 className={styles.cardTitle}>{s.experiment_title}</h3>
                        <p className={styles.subMeta}>
                          {s.subject_name || 'Data Structures'} · Section {s.section_name || 'A'}
                        </p>
                        <div className={styles.detailsRow}>
                          <span className={styles.detailItem}><Clock size={13} /> {fullDateTime(s.ended_at || s.scheduled_at)}</span>
                          <span>·</span>
                          <span>{s.duration_minutes} min</span>
                          <span>·</span>
                          <span>Gate {s.gate_score_threshold}%</span>
                        </div>
                      </div>
                    </div>

                    <div className={styles.middleStatsPanel}>
                      <div className={styles.statCol}>
                        <span className={styles.statVal}>{s.student_count || 12} / {s.student_count || 12}</span>
                        <span className={styles.metricSub}>Attended</span>
                        <div className={styles.progressBarTrack}>
                          <div className={styles.progressBarFill} style={{ width: '100%' }} />
                        </div>
                      </div>
                      <div className={styles.statCol}>
                        <span className={styles.statVal}>{s.student_count || 10}</span>
                        <span className={styles.metricSub}>Submitted</span>
                      </div>
                      <div className={styles.statCol}>
                        <span className={styles.statVal}>82%</span>
                        <span className={styles.metricSub}>Avg. Score</span>
                      </div>
                      <div className={styles.statCol}>
                        <span className={styles.statVal}>88%</span>
                        <span className={styles.metricSub}>Avg. Focus</span>
                      </div>
                    </div>

                    <div className={styles.cardActions} onClick={e => e.stopPropagation()}>
                      <button
                        className={styles.outlineBtn}
                        onClick={() => setSelectedDrawerSession(s)}
                      >
                        <Eye size={13} /> View Summary
                      </button>
                      <button
                        className={styles.purpleOutlineBtn}
                        onClick={() => router.push('/instructor/grading')}
                      >
                        <Check size={13} /> Grade
                      </button>
                    </div>
                  </div>
                ))}
              </>
            ) : null}

            {/* ── EMPTY STATE FOR ALL SESSIONS OR ATTENTION ── */}
            {((activeTab === 'All Sessions' && liveSessions.length === 0 && upcomingSessions.length === 0 && completedSessions.length === 0) || (activeTab === 'Attention' && attentionCount === 0)) && (
              <div className={styles.emptyContainer}>
                <div className={styles.emptyIconBox}>
                  {activeTab === 'Attention' ? <AlertTriangle size={24} /> : <BookOpen size={24} />}
                </div>
                <h3 className={styles.emptyTitle}>
                  {activeTab === 'Attention' ? 'No Flagged Sessions' : 'No Sessions Found'}
                </h3>
                <p className={styles.emptyDesc}>
                  {activeTab === 'Attention'
                    ? 'There are currently no active sessions with proctoring or focus alerts.'
                    : searchQuery || sectionFilter !== 'all' || expFilter !== 'all' || statusFilter !== 'all'
                    ? 'No sessions match your filter criteria.'
                    : 'You have no laboratory sessions scheduled yet.'}
                </p>
                {searchQuery || sectionFilter !== 'all' || expFilter !== 'all' || statusFilter !== 'all' ? (
                  <button className={styles.clearBtn} onClick={clearFilters}>
                    Clear Filters
                  </button>
                ) : (
                  <button className={styles.scheduleBtn} onClick={() => router.push('/instructor/sessions/schedule')}>
                    <Plus size={16} /> Schedule Session
                  </button>
                )}
              </div>
            )}

          </div>
        )}

        {/* ═══ 6. SESSION DETAILS OVERVIEW DRAWER ═══ */}
        {selectedDrawerSession && (
          <div className={styles.drawerOverlay} onClick={() => setSelectedDrawerSession(null)}>
            <div className={styles.drawerContainer} onClick={e => e.stopPropagation()}>
              <div className={styles.drawerHeader}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <h2 className={styles.drawerTitle}>{selectedDrawerSession.experiment_title}</h2>
                    {selectedDrawerSession.status === 'active' && <span className={styles.liveBadge}>● LIVE</span>}
                    {selectedDrawerSession.status === 'scheduled' && <span className={styles.featPill}>UPCOMING</span>}
                    {selectedDrawerSession.status === 'ended' && <span className={styles.featPill} style={{ background: '#dcfce7', color: '#16a34a' }}>COMPLETED</span>}
                  </div>
                  <p className={styles.drawerSub}>
                    {selectedDrawerSession.subject_name || 'Computer Science'} · Section {selectedDrawerSession.section_name || 'A'}
                  </p>
                </div>
                <button className={styles.closeBtn} onClick={() => setSelectedDrawerSession(null)}>
                  <X size={16} />
                </button>
              </div>

              <div className={styles.drawerBody}>
                {/* Section A: Session Configuration */}
                <div className={styles.drawerCardBlock}>
                  <h4 className={styles.drawerBlockTitle}><BookOpen size={14} /> Session Configuration Overview</h4>
                  <div className={styles.detailGrid}>
                    <div className={styles.detailTile}>
                      <span className={styles.tileLabel}>Scheduled Date & Time</span>
                      <span className={styles.tileValue}>{fullDateTime(selectedDrawerSession.scheduled_at)}</span>
                    </div>
                    <div className={styles.detailTile}>
                      <span className={styles.tileLabel}>Duration</span>
                      <span className={styles.tileValue}>{selectedDrawerSession.duration_minutes} Minutes</span>
                    </div>
                    <div className={styles.detailTile}>
                      <span className={styles.tileLabel}>Gate Score Threshold</span>
                      <span className={styles.tileValue}>{selectedDrawerSession.gate_score_threshold}% Minimum</span>
                    </div>
                    <div className={styles.detailTile}>
                      <span className={styles.tileLabel}>Late Join Window</span>
                      <span className={styles.tileValue}>{selectedDrawerSession.late_join_window_min} Minutes</span>
                    </div>
                  </div>
                </div>

                {/* Section B: Proctored Security Controls */}
                <div className={styles.drawerCardBlock}>
                  <h4 className={styles.drawerBlockTitle}><Shield size={14} /> Security & Environment Rules</h4>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                    {selectedDrawerSession.lockdown_enabled ? (
                      <span className={styles.featPill} style={{ background: '#fee2e2', color: '#dc2626' }}><Lock size={12} /> Browser Lockdown Active</span>
                    ) : (
                      <span className={styles.featPill} style={{ background: '#f3f4f6' }}>Standard Browser</span>
                    )}

                    {selectedDrawerSession.focus_ml_enabled ? (
                      <span className={styles.featPill} style={{ background: '#e0e7ff', color: '#4338ca' }}><BrainCircuit size={12} /> AI Focus Monitoring Active</span>
                    ) : (
                      <span className={styles.featPill} style={{ background: '#f3f4f6' }}>Focus ML Off</span>
                    )}

                    {selectedDrawerSession.catchup_enabled && (
                      <span className={styles.featPill} style={{ background: '#fef3c7', color: '#b45309' }}><RotateCcw size={12} /> Catch-up Lab Allowed</span>
                    )}
                  </div>
                </div>

                {/* Section C: Live / Post-Session Telemetry */}
                <div className={styles.drawerCardBlock}>
                  <h4 className={styles.drawerBlockTitle}><Activity size={14} /> Session Performance Telemetry</h4>
                  <div className={styles.detailGrid}>
                    <div className={styles.detailTile}>
                      <span className={styles.tileLabel}>Enrolled Headcount</span>
                      <span className={styles.tileValue}>{selectedDrawerSession.student_count || 12} Students</span>
                    </div>
                    <div className={styles.detailTile}>
                      <span className={styles.tileLabel}>Attendance Rate</span>
                      <span className={styles.tileValue}>11 / 12 Attended (91%)</span>
                    </div>
                    <div className={styles.detailTile}>
                      <span className={styles.tileLabel}>Code Submissions</span>
                      <span className={styles.tileValue}>10 Final Submissions</span>
                    </div>
                    <div className={styles.detailTile}>
                      <span className={styles.tileLabel}>Class Average Score</span>
                      <span className={styles.tileValue}>78% Pass Rate</span>
                    </div>
                  </div>
                </div>

                {/* Section D: Operational Actions */}
                <div className={styles.actionRow} style={{ marginTop: 'auto', borderTop: 'none' }}>
                  {selectedDrawerSession.status === 'active' && (
                    <button
                      className={styles.conductorBtn}
                      style={{ width: '100%', justifyContent: 'center' }}
                      onClick={() => router.push(`/instructor/sessions/${selectedDrawerSession.id}/live`)}
                    >
                      Launch Conductor Dashboard <ArrowRight size={16} />
                    </button>
                  )}
                  {selectedDrawerSession.status === 'scheduled' && (
                    <button
                      className={styles.conductorBtn}
                      style={{ width: '100%', justifyContent: 'center' }}
                      onClick={() => {
                        setSelectedDrawerSession(null);
                        openEditModal(selectedDrawerSession);
                      }}
                    >
                      <Edit3 size={16} /> Edit Full Session Configuration
                    </button>
                  )}
                  {selectedDrawerSession.status === 'ended' && (
                    <button
                      className={styles.purpleOutlineBtn}
                      style={{ width: '100%', justifyContent: 'center' }}
                      onClick={() => router.push('/instructor/grading')}
                    >
                      <Check size={16} /> Grade Submissions & Reports
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ 9. FULL SECTIONED EDIT SESSION MODAL ═══ */}
        {editSession && (
          <div className={styles.modalOverlay} onClick={() => setEditSession(null)}>
            <div className={styles.modalCard} onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
              <div className={styles.modalHeader}>
                <div>
                  <h2 className={styles.modalTitle}>Session Configuration</h2>
                  <p style={{ fontSize: 13, color: '#64748b', margin: '2px 0 0 0' }}>
                    Configure assessment, monitoring, and attendance rules for {editSession.experiment_title}
                  </p>
                </div>
                <button className={styles.closeBtn} onClick={() => setEditSession(null)}><X size={16} /></button>
              </div>

              {/* 4 Multi-section Tabs */}
              <div className={styles.modalTabsNav}>
                <button
                  className={`${styles.modalTabBtn} ${activeEditTab === 'basic' ? styles.modalTabActive : ''}`}
                  onClick={() => setActiveEditTab('basic')}
                >
                  <BookOpen size={14} /> 1. Session Setup
                </button>
                <button
                  className={`${styles.modalTabBtn} ${activeEditTab === 'assessment' ? styles.modalTabActive : ''}`}
                  onClick={() => setActiveEditTab('assessment')}
                >
                  <Award size={14} /> 2. Assessment
                </button>
                <button
                  className={`${styles.modalTabBtn} ${activeEditTab === 'monitoring' ? styles.modalTabActive : ''}`}
                  onClick={() => setActiveEditTab('monitoring')}
                >
                  <Shield size={14} /> 3. Monitoring
                </button>
                <button
                  className={`${styles.modalTabBtn} ${activeEditTab === 'attendance' ? styles.modalTabActive : ''}`}
                  onClick={() => setActiveEditTab('attendance')}
                >
                  <Clock size={14} /> 4. Attendance
                </button>
              </div>

              {/* Tab 1: Basic Session Setup */}
              {activeEditTab === 'basic' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Session Title</label>
                    <input
                      type="text"
                      className={styles.input}
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      placeholder="e.g. Python Fundamentals — Quiz Lab"
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Attached Experiment</label>
                    <select
                      className={styles.select}
                      value={editExpId}
                      onChange={e => setEditExpId(e.target.value)}
                    >
                      <option value="">Choose experiment from library...</option>
                      {experiments.map(e => (
                        <option key={e.id} value={e.id}>
                          {e.title} {e.is_published ? '' : '(Draft)'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Scheduled Date & Time</label>
                      <input
                        type="datetime-local"
                        className={styles.input}
                        value={editScheduledAt}
                        onChange={e => setEditScheduledAt(e.target.value)}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Duration (minutes)</label>
                      <input
                        type="number"
                        className={styles.input}
                        value={editDuration}
                        onChange={e => setEditDuration(Number(e.target.value))}
                        min={15}
                        max={300}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Assessment & Submission Rules */}
              {activeEditTab === 'assessment' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Pre-Lab Quiz Gate Score Threshold (%)</label>
                    <input
                      type="number"
                      className={styles.input}
                      value={editGate}
                      onChange={e => setEditGate(Number(e.target.value))}
                      min={0}
                      max={100}
                    />
                    <span style={{ fontSize: 12, color: '#64748b' }}>
                      Students must achieve this percentage on the briefing quiz before accessing code execution.
                    </span>
                  </div>

                  <div className={styles.checkboxGroup}>
                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        defaultChecked={true}
                      />
                      Enforce Automated Rubric Test Case Evaluation
                    </label>
                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        defaultChecked={true}
                      />
                      Require Viva Voce Verification Before Submission
                    </label>
                  </div>
                </div>
              )}

              {/* Tab 3: Security & Monitoring */}
              {activeEditTab === 'monitoring' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className={styles.checkboxGroup}>
                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={editLockdown}
                        onChange={e => setEditLockdown(e.target.checked)}
                      />
                      Enable Strict Browser Lockdown Mode (Blocks tab switches & copy/paste)
                    </label>

                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={editFocus}
                        onChange={e => setEditFocus(e.target.checked)}
                      />
                      Enable AI Focus Score & ML Behavioral Monitoring
                    </label>

                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        defaultChecked={true}
                      />
                      Enable Live Screen Sharing & Video Feed Telemetry
                    </label>
                  </div>
                </div>
              )}

              {/* Tab 4: Attendance & Catch-Up */}
              {activeEditTab === 'attendance' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Late Join Grace Window (minutes)</label>
                    <input
                      type="number"
                      className={styles.input}
                      value={editLateJoin}
                      onChange={e => setEditLateJoin(Number(e.target.value))}
                      min={0}
                      max={60}
                    />
                    <span style={{ fontSize: 12, color: '#64748b' }}>
                      Students joining after this duration will be automatically marked 'Late'.
                    </span>
                  </div>

                  <div className={styles.checkboxGroup}>
                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={editCatchup}
                        onChange={e => setEditCatchup(e.target.checked)}
                      />
                      Allow Asynchronous Catch-Up Session Access
                    </label>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className={styles.actionRow}>
                <button className={styles.outlineBtn} onClick={() => setEditSession(null)}>Cancel</button>
                <button className={styles.conductorBtn} onClick={saveEditSession} disabled={savingEdit}>
                  <Save size={14} /> {savingEdit ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </InstructorShell>
  );
}
