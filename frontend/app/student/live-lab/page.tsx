'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import StudentShell from '@/components/layout/StudentShell';
import { studentService } from '@/services/student.service';
import type { LabSession, Experiment, SectionSubject } from '@/types';
import { getGlobalSocket } from '@/lib/socket';
import {
  Radio, Clock, Loader2, RotateCcw, Video, CalendarDays,
  Calendar, CheckCircle2, ArrowRight, BookOpen, Search,
  Filter as FilterIcon, X, Terminal, Shield, Eye, AlertCircle,
  Sparkles, Check, ChevronLeft, ChevronRight, Layers, FileText, Star
} from 'lucide-react';
import SessionFeedbackModal from '@/components/student/SessionFeedbackModal';
import styles from './page.module.css';

interface SessionWithMeta extends LabSession {
  title?: string | null;
  my_attendance?: { status: string; joined_at?: string | null; feedback_submitted?: boolean };
  duration_minutes?: number | null;
  subject_name?: string;
  subject_code?: string;
  experiment_title?: string;
  experiment_aim?: string;
}

type FilterTab = 'All Sessions' | 'Live' | 'Upcoming' | 'Completed' | 'Catch-Up';

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—';

const fmtTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—';

const getCountdownString = (scheduledAt: string | null | undefined) => {
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

export default function StudentLiveLabPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionWithMeta[]>([]);
  const [subjects, setSubjects] = useState<SectionSubject[]>([]);
  const [expTitles, setExpTitles] = useState<Record<string, string>>({});
  const [expAims, setExpAims] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [catchupBusy, setCatchupBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [feedbackSession, setFeedbackSession] = useState<SessionWithMeta | null>(null);

  // UI state matching instructor dashboard
  const [activeTab, setActiveTab] = useState<FilterTab>('All Sessions');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [selectedDrawerSession, setSelectedDrawerSession] = useState<SessionWithMeta | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const [sess, subjs] = await Promise.all([
        studentService.getSessions(),
        studentService.getSubjects(),
      ]);
      setSubjects(subjs);

      const expLists = await Promise.all(
        subjs.map(s => studentService.getExperiments(s.subject_id).catch(() => [] as Experiment[]))
      );

      const titles: Record<string, string> = {};
      const aims: Record<string, string> = {};
      const expToSubjectMap: Record<string, SectionSubject> = {};

      subjs.forEach((s, idx) => {
        const exps = expLists[idx] || [];
        exps.forEach(e => {
          titles[e.id] = e.title;
          aims[e.id] = e.aim || '';
          expToSubjectMap[e.id] = s;
        });
      });

      setExpTitles(titles);
      setExpAims(aims);

      const enriched = (sess as SessionWithMeta[]).map(s => {
        const sub = expToSubjectMap[s.experiment_id];
        return {
          ...s,
          experiment_title: titles[s.experiment_id] || s.title || 'Scheduled lab session',
          experiment_aim: aims[s.experiment_id] || '',
          subject_name: sub?.subject_name || 'Laboratory Subject',
          subject_code: sub?.subject_code || '',
        };
      });

      setSessions(enriched);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load live lab sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      fetchData();
    }, 25_000);
    return () => clearInterval(t);
  }, [fetchData]);

  // Real-time socket listener: when session is started or ended, reload immediately!
  useEffect(() => {
    const socket = getGlobalSocket();
    if (!socket) return;

    const onSessionChange = () => {
      fetchData();
    };

    socket.on('session_started', onSessionChange);
    socket.on('session_ended', onSessionChange);
    socket.on('new_notification', onSessionChange);

    return () => {
      socket.off('session_started', onSessionChange);
      socket.off('session_ended', onSessionChange);
      socket.off('new_notification', onSessionChange);
    };
  }, [fetchData]);

  const startCatchup = async (session: SessionWithMeta) => {
    setCatchupBusy(session.id);
    setNotice('');
    try {
      await studentService.startCatchup(session.id);
      router.push(`/student/live-lab/${session.id}`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not start catch-up');
    } finally {
      setCatchupBusy(null);
    }
  };

  // KPI Metrics calculation
  const totalCount = sessions.length;
  const liveCount = sessions.filter(s => s.status === 'active').length;
  const upcomingCount = sessions.filter(s => s.status === 'scheduled').length;
  const completedCount = sessions.filter(s => s.status === 'ended').length;
  const catchupCount = sessions.filter(s => {
    const attended = s.my_attendance && ['present', 'late', 'partial'].includes(s.my_attendance.status);
    return s.status === 'ended' && s.catchup_enabled && !attended;
  }).length;

  // Filtered sessions
  const filteredSessions = useMemo(() => {
    return sessions.filter(s => {
      // Tab filter
      if (activeTab === 'Live' && s.status !== 'active') return false;
      if (activeTab === 'Upcoming' && s.status !== 'scheduled') return false;
      if (activeTab === 'Completed' && s.status !== 'ended') return false;
      if (activeTab === 'Catch-Up') {
        const attended = s.my_attendance && ['present', 'late', 'partial'].includes(s.my_attendance.status);
        if (!(s.status === 'ended' && s.catchup_enabled && !attended)) return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = (s.experiment_title || expTitles[s.experiment_id] || '').toLowerCase().includes(q);
        const matchSubj = (s.subject_name || '').toLowerCase().includes(q);
        const matchCode = (s.subject_code || '').toLowerCase().includes(q);
        if (!matchTitle && !matchSubj && !matchCode) return false;
      }

      // Subject dropdown filter
      if (subjectFilter !== 'all') {
        if (s.subject_name !== subjectFilter && s.section_subject_id !== subjectFilter) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      const dateA = new Date(a.scheduled_at || a.started_at || 0).getTime();
      const dateB = new Date(b.scheduled_at || b.started_at || 0).getTime();
      return sortOrder === 'oldest' ? dateA - dateB : dateB - dateA;
    });
  }, [sessions, activeTab, searchQuery, subjectFilter, sortOrder, expTitles]);

  const clearFilters = () => {
    setSearchQuery('');
    setSubjectFilter('all');
    setActiveTab('All Sessions');
  };

  // Calendar dates computation (Monday–Sunday week)
  const calendarDays = useMemo(() => {
    const days: Date[] = [];
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

  const isToday = (d: Date) => {
    const today = new Date();
    return d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();
  };

  return (
    <StudentShell activePage="Live Coding Lab">
      <div className={styles.container}>

        {/* ═══ 1. Top Header Bar ═══ */}
        <div className={styles.topBar}>
          <div className={styles.topTitleGroup}>
            <h1 className={styles.pageTitle}>Live Coding Lab</h1>
            <p className={styles.pageSubtitle}>
              Join active laboratory sessions, inspect scheduled timetables, or complete catch-up tasks.
            </p>
          </div>

          {liveCount > 0 && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: '#fee2e2', color: '#dc2626', border: '1.5px solid #fca5a5',
              padding: '8px 16px', borderRadius: 999, fontWeight: 800, fontSize: 13,
              boxShadow: '0 2px 10px rgba(220, 38, 38, 0.15)'
            }}>
              <span className={styles.livePulse} />
              <span>{liveCount} Live Session{liveCount > 1 ? 's' : ''} Active Now</span>
            </div>
          )}
        </div>

        {/* ═══ 2. Top-Level KPI Metrics Cards (Matching Instructor Overview) ═══ */}
        <div className={styles.metricsGrid}>
          {/* Total Sessions */}
          <div className={styles.metricCard} onClick={() => setActiveTab('All Sessions')} style={{ cursor: 'pointer' }}>
            <div className={styles.metricHeader}>
              <div className={`${styles.iconBox} ${styles.iconPurple}`}>
                <Calendar size={20} strokeWidth={2} />
              </div>
            </div>
            <div className={styles.metricVal}>{totalCount}</div>
            <div className={styles.metricBody}>
              <span className={styles.metricLabel}>Total Sessions</span>
              <span className={styles.metricSub}>Enrolled lab practicals</span>
            </div>
          </div>

          {/* Live Now */}
          <div className={styles.metricCard} onClick={() => setActiveTab('Live')} style={{ cursor: 'pointer' }}>
            <div className={styles.metricHeader}>
              <div className={`${styles.iconBox} ${styles.iconRed}`}>
                <Radio size={20} strokeWidth={2} />
              </div>
              {liveCount > 0 && <span className={styles.livePulse} />}
            </div>
            <div className={styles.metricVal}>{liveCount}</div>
            <div className={styles.metricBody}>
              <span className={styles.metricLabel}>Live Now</span>
              <span className={styles.metricSub}>{liveCount > 0 ? 'Active in laboratory' : 'No active sessions'}</span>
            </div>
          </div>

          {/* Upcoming */}
          <div className={styles.metricCard} onClick={() => setActiveTab('Upcoming')} style={{ cursor: 'pointer' }}>
            <div className={styles.metricHeader}>
              <div className={`${styles.iconBox} ${styles.iconBlue}`}>
                <Clock size={20} strokeWidth={2} />
              </div>
            </div>
            <div className={styles.metricVal}>{upcomingCount}</div>
            <div className={styles.metricBody}>
              <span className={styles.metricLabel}>Upcoming</span>
              <span className={styles.metricSub}>{upcomingCount > 0 ? 'Scheduled in timetable' : 'None scheduled'}</span>
            </div>
          </div>

          {/* Completed */}
          <div className={styles.metricCard} onClick={() => setActiveTab('Completed')} style={{ cursor: 'pointer' }}>
            <div className={styles.metricHeader}>
              <div className={`${styles.iconBox} ${styles.iconGreen}`}>
                <CheckCircle2 size={20} strokeWidth={2} />
              </div>
            </div>
            <div className={styles.metricVal}>{completedCount}</div>
            <div className={styles.metricBody}>
              <span className={styles.metricLabel}>Completed</span>
              <span className={styles.metricSub}>{completedCount > 0 ? 'Practicals concluded' : 'None yet'}</span>
            </div>
          </div>

          {/* Catch-Up Available */}
          <div className={styles.metricCard} onClick={() => setActiveTab('Catch-Up')} style={{ cursor: 'pointer' }}>
            <div className={styles.metricHeader}>
              <div className={`${styles.iconBox} ${styles.iconOrange}`}>
                <RotateCcw size={20} strokeWidth={2} />
              </div>
            </div>
            <div className={styles.metricVal}>{catchupCount}</div>
            <div className={styles.metricBody}>
              <span className={styles.metricLabel}>Catch-Up Access</span>
              <span className={styles.metricSub}>{catchupCount > 0 ? 'Self-paced completion' : 'No catch-ups pending'}</span>
            </div>
          </div>
        </div>

        {/* ═══ 3. Filter & View Controls Toolbar ═══ */}
        <div className={styles.controlsBlock}>
          <div className={styles.tabAndToggleRow}>
            {/* Filter Tabs */}
            <div className={styles.filterTabs}>
              {(['All Sessions', 'Live', 'Upcoming', 'Completed', 'Catch-Up'] as FilterTab[]).map(tab => {
                const countMap: Record<FilterTab, number> = {
                  'All Sessions': totalCount,
                  'Live': liveCount,
                  'Upcoming': upcomingCount,
                  'Completed': completedCount,
                  'Catch-Up': catchupCount,
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

            {/* View Mode Toggle: List View vs Calendar View */}
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

          {/* Search & Subject Dropdown Row */}
          <div className={styles.searchAndDropdownsRow}>
            <div className={styles.searchBox}>
              <Search size={16} color="#9ca3af" />
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Search sessions or experiments..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Subject Filter */}
            <select
              className={styles.dropdownSelect}
              value={subjectFilter}
              onChange={e => setSubjectFilter(e.target.value)}
            >
              <option value="all">All Subjects</option>
              {subjects.map(s => (
                <option key={s.section_subject_id || s.subject_id} value={s.subject_name}>
                  {s.subject_name} ({s.subject_code})
                </option>
              ))}
            </select>

            {/* Sort Order */}
            <select
              className={`${styles.dropdownSelect} ${styles.sortSelect}`}
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value as 'newest' | 'oldest')}
            >
              <option value="newest">Sort: Newest First</option>
              <option value="oldest">Sort: Oldest First</option>
            </select>

            {(searchQuery || subjectFilter !== 'all' || activeTab !== 'All Sessions') && (
              <button className={styles.clearBtn} onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Notices and Errors */}
        {error && <div className={styles.errorBox}>⚠️ {error}</div>}
        {notice && <div className={styles.errorBox}>ℹ️ {notice}</div>}
        {loading && (
          <div className={styles.loadingBox}>
            <Loader2 size={24} className={styles.spinner} />
            <span>Loading live coding lab sessions…</span>
          </div>
        )}

        {/* ═══ 4. CONTENT AREA: LIST VIEW ═══ */}
        {!loading && viewMode === 'list' && (
          <div className={styles.cardList}>
            {filteredSessions.length === 0 ? (
              <div className={styles.emptyState}>
                <CalendarDays size={40} className={styles.emptyIcon} />
                <h3 className={styles.emptyTitle}>No sessions match your filter</h3>
                <p className={styles.emptyDesc}>
                  Try selecting a different tab or clear your search keywords.
                </p>
                <button className={styles.openDetailsBtn} onClick={clearFilters} style={{ marginTop: 8 }}>
                  Reset Filters
                </button>
              </div>
            ) : (
              filteredSessions.map(s => {
                const isLive = s.status === 'active';
                const isUpcoming = s.status === 'scheduled';
                const isEnded = s.status === 'ended';
                const attended = s.my_attendance && ['present', 'late', 'partial'].includes(s.my_attendance.status);
                const catchupAvailable = isEnded && s.catchup_enabled && !attended;

                return (
                  <div
                    key={s.id}
                    className={`${styles.sessionCardItem} ${isLive ? styles.sessionCardItemLive : ''}`}
                    onClick={() => setSelectedDrawerSession(s)}
                  >
                    {/* Left: Icon & Titles */}
                    <div className={styles.cardLeft}>
                      <div className={`${styles.typeIconBox} ${
                        isLive ? styles.bgRedSoft : isUpcoming ? styles.bgBlueSoft : styles.bgGreenSoft
                      }`}>
                        {isLive ? <Radio size={22} /> : isUpcoming ? <Clock size={22} /> : <CheckCircle2 size={22} />}
                      </div>

                      <div className={styles.cardMainInfo}>
                        <div className={styles.badgeGroup}>
                          {isLive && (
                            <span className={styles.liveNowBadge}>
                              <span className={styles.livePulse} /> LIVE NOW
                            </span>
                          )}
                          {isUpcoming && (
                            <span className={styles.upcomingBadge}>
                              <Clock size={12} /> UPCOMING
                            </span>
                          )}
                          {isEnded && (
                            <span className={styles.completedBadge}>
                              <CheckCircle2 size={12} /> COMPLETED
                            </span>
                          )}
                          {catchupAvailable && (
                            <span className={styles.catchupBadge}>
                              <RotateCcw size={12} /> CATCH-UP READY
                            </span>
                          )}
                          {s.my_attendance && !['absent', 'not_recorded'].includes(s.my_attendance.status) && (
                            <span className={styles.attendanceBadgePresent}>
                              <Check size={11} strokeWidth={3} /> {s.my_attendance.status.toUpperCase()}
                            </span>
                          )}
                        </div>

                        <h3 className={styles.cardTitle}>{s.experiment_title}</h3>
                        <p className={styles.cardSubtitle}>
                          {s.subject_name} {s.subject_code ? `· ${s.subject_code}` : ''}
                        </p>
                      </div>
                    </div>

                    {/* Center: Timetable and Countdown Metadata */}
                    <div className={styles.cardCenterMeta}>
                      <div className={styles.metaItem}>
                        <CalendarDays size={15} color="#64748b" />
                        <span>{fmtDate(s.scheduled_at || s.started_at)}</span>
                      </div>
                      <div className={styles.metaItem}>
                        <Clock size={15} color="#64748b" />
                        <span>{fmtTime(s.scheduled_at || s.started_at)}</span>
                        {s.duration_minutes != null && <span>({s.duration_minutes}m)</span>}
                      </div>

                      {isUpcoming && (
                        <div className={styles.countdownBlock}>
                          <span className={styles.countdownLabel}>TIMETABLE COUNTDOWN</span>
                          <span className={styles.countdownTime}>{getCountdownString(s.scheduled_at)}</span>
                        </div>
                      )}
                    </div>

                    {/* Right: Primary Action Buttons */}
                    <div className={styles.cardActions} onClick={e => e.stopPropagation()}>
                      {isLive && (
                        <button
                          className={styles.joinLiveBtn}
                          onClick={() => router.push(`/student/live-lab/${s.id}`)}
                        >
                          <Video size={15} />
                          <span>Join Live Room</span>
                          <ArrowRight size={14} />
                        </button>
                      )}

                      {isUpcoming && (
                        <button
                          className={styles.openDetailsBtn}
                          onClick={() => setSelectedDrawerSession(s)}
                        >
                          <Eye size={14} />
                          <span>View Details</span>
                        </button>
                      )}

                      {catchupAvailable && (
                        <button
                          className={styles.startCatchupBtn}
                          disabled={catchupBusy === s.id}
                          onClick={() => startCatchup(s)}
                        >
                          {catchupBusy === s.id ? <Loader2 size={14} className={styles.spinner} /> : <RotateCcw size={14} />}
                          <span>{catchupBusy === s.id ? 'Starting…' : 'Start Catch-Up'}</span>
                        </button>
                      )}

                      {isEnded && (
                        <>
                          {s.my_attendance?.feedback_submitted ? (
                            <button
                              className={styles.openDetailsBtn}
                              disabled
                              aria-label="Feedback already submitted"
                              style={{ borderColor: '#16a34a', color: '#15803d', background: 'rgba(22,163,74,0.07)', cursor: 'default' }}
                            >
                              <CheckCircle2 size={14} />
                              <span>Feedback Submitted</span>
                            </button>
                          ) : (
                            <button
                              className={styles.openDetailsBtn}
                              style={{ borderColor: '#7c3aed', color: '#7c3aed', background: 'rgba(124,58,237,0.06)' }}
                              onClick={() => setFeedbackSession(s)}
                              title="Rate this session"
                            >
                              <Star size={14} />
                              <span>Rate Session</span>
                            </button>
                          )}
                          {!catchupAvailable && (
                            <button
                              className={styles.openDetailsBtn}
                              onClick={() => setSelectedDrawerSession(s)}
                            >
                              <Eye size={14} />
                              <span>Review Session</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ═══ 5. CONTENT AREA: CALENDAR VIEW ═══ */}
        {!loading && viewMode === 'calendar' && (
          <div className={styles.calendarContainer}>
            {/* Week Nav Header */}
            <div className={styles.calendarHeader}>
              <div className={styles.calendarWeekNav}>
                <button
                  className={styles.weekNavBtn}
                  onClick={() => setWeekOffset(prev => prev - 1)}
                  title="Previous Week"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  className={styles.openDetailsBtn}
                  onClick={() => setWeekOffset(0)}
                  style={{ padding: '5px 12px', fontSize: 12 }}
                >
                  Current Week
                </button>
                <button
                  className={styles.weekNavBtn}
                  onClick={() => setWeekOffset(prev => prev + 1)}
                  title="Next Week"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className={styles.weekRangeText}>
                {calendarDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {calendarDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            </div>

            {/* 7 Days Grid */}
            <div className={styles.calendarGrid}>
              {calendarDays.map((day, idx) => {
                const today = isToday(day);
                const daySessions = sessions.filter(s => {
                  const sDate = new Date(s.scheduled_at || s.started_at || '');
                  return sDate.getFullYear() === day.getFullYear() &&
                    sDate.getMonth() === day.getMonth() &&
                    sDate.getDate() === day.getDate();
                });

                return (
                  <div
                    key={idx}
                    className={`${styles.calendarDayCol} ${today ? styles.calendarDayColToday : ''}`}
                  >
                    <div className={styles.calendarDayHeader}>
                      <span className={styles.dayName}>
                        {day.toLocaleDateString('en-US', { weekday: 'short' })}
                      </span>
                      <span className={styles.dayNumber}>
                        {day.getDate()}
                      </span>
                    </div>

                    <div className={styles.calendarSessionList}>
                      {daySessions.map(s => {
                        const isLive = s.status === 'active';
                        return (
                          <div
                            key={s.id}
                            className={`${styles.calendarSessionCard} ${isLive ? styles.calendarSessionLive : ''}`}
                            onClick={() => setSelectedDrawerSession(s)}
                          >
                            <span className={styles.calCardTime}>
                              {fmtTime(s.scheduled_at || s.started_at)}
                            </span>
                            <span className={styles.calCardTitle}>
                              {s.experiment_title}
                            </span>
                            {isLive ? (
                              <span className={styles.liveNowBadge} style={{ alignSelf: 'flex-start' }}>
                                <span className={styles.livePulse} /> LIVE
                              </span>
                            ) : s.status === 'scheduled' ? (
                              <span className={styles.upcomingBadge} style={{ alignSelf: 'flex-start' }}>
                                UPCOMING
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ 6. READ-ONLY STUDENT INSPECTION DRAWER ═══ */}
        {selectedDrawerSession && (
          <div
            className={styles.drawerOverlay}
            onClick={() => setSelectedDrawerSession(null)}
          >
            <div
              className={styles.drawerContent}
              onClick={e => e.stopPropagation()}
            >
              {/* Drawer Header */}
              <div className={styles.drawerHeader}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase' }}>
                    Laboratory Session Overview
                  </span>
                  <h3 className={styles.drawerTitle}>
                    {selectedDrawerSession.experiment_title}
                  </h3>
                </div>
                <button
                  className={styles.drawerCloseBtn}
                  onClick={() => setSelectedDrawerSession(null)}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Drawer Body */}
              <div className={styles.drawerBody}>
                {/* Status Callout */}
                <div style={{
                  padding: '14px 16px', borderRadius: 12,
                  background: selectedDrawerSession.status === 'active' ? '#fff1f2' : '#f8fafc',
                  border: `1.5px solid ${selectedDrawerSession.status === 'active' ? '#fecdd3' : '#e2e8f0'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                  <div>
                    <span style={{
                      fontSize: 12, fontWeight: 800,
                      color: selectedDrawerSession.status === 'active' ? '#dc2626' : '#334155'
                    }}>
                      STATUS: {selectedDrawerSession.status.toUpperCase()}
                    </span>
                    <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#64748b' }}>
                      {selectedDrawerSession.status === 'active'
                        ? 'Live room is currently open and accepting students.'
                        : selectedDrawerSession.status === 'scheduled'
                        ? `Scheduled to begin on ${fmtDate(selectedDrawerSession.scheduled_at)}.`
                        : 'This session has concluded.'}
                    </p>
                  </div>
                </div>

                {/* Timetable & Class Info */}
                <div className={styles.drawerSection}>
                  <h4 className={styles.drawerSectionTitle}>Timetable Details</h4>
                  <div className={styles.drawerMetaGrid}>
                    <div className={styles.drawerMetaItem}>
                      <span className={styles.drawerMetaLabel}>Subject</span>
                      <span className={styles.drawerMetaVal}>{selectedDrawerSession.subject_name}</span>
                    </div>
                    <div className={styles.drawerMetaItem}>
                      <span className={styles.drawerMetaLabel}>Subject Code</span>
                      <span className={styles.drawerMetaVal}>{selectedDrawerSession.subject_code || '—'}</span>
                    </div>
                    <div className={styles.drawerMetaItem}>
                      <span className={styles.drawerMetaLabel}>Date & Time</span>
                      <span className={styles.drawerMetaVal}>
                        {fmtDate(selectedDrawerSession.scheduled_at)} at {fmtTime(selectedDrawerSession.scheduled_at)}
                      </span>
                    </div>
                    <div className={styles.drawerMetaItem}>
                      <span className={styles.drawerMetaLabel}>Allocated Duration</span>
                      <span className={styles.drawerMetaVal}>
                        {selectedDrawerSession.duration_minutes ?? 60} Minutes
                      </span>
                    </div>
                  </div>
                </div>

                {/* Experiment Aim & Overview */}
                {selectedDrawerSession.experiment_aim && (
                  <div className={styles.drawerSection}>
                    <h4 className={styles.drawerSectionTitle}>Experiment Objective</h4>
                    <p style={{
                      margin: 0, fontSize: 13.5, color: '#475569', lineHeight: 1.6,
                      background: '#f8fafc', padding: '12px 14px', borderRadius: 10,
                      border: '1px solid #e2e8f0'
                    }}>
                      {selectedDrawerSession.experiment_aim}
                    </p>
                  </div>
                )}

                {/* Environment & Policy Checklist */}
                <div className={styles.drawerSection}>
                  <h4 className={styles.drawerSectionTitle}>Session Environment Checklist</h4>
                  <div className={styles.drawerChecklist}>
                    <div className={styles.checklistItem}>
                      <Video size={16} color="#7c3aed" />
                      <span>Audio &amp; Video Connection: LiveKit / Jitsi Room</span>
                    </div>
                    <div className={styles.checklistItem}>
                      <Terminal size={16} color="#7c3aed" />
                      <span>Interactive Multi-Language Compiler &amp; Sandbox</span>
                    </div>
                    <div className={styles.checklistItem}>
                      <Shield size={16} color={selectedDrawerSession.lockdown_enabled ? '#dc2626' : '#64748b'} />
                      <span>
                        Lockdown Environment: {selectedDrawerSession.lockdown_enabled ? 'Strict Tab-Lock Active' : 'Standard Browser Allowed'}
                      </span>
                    </div>
                    <div className={styles.checklistItem}>
                      <Sparkles size={16} color={selectedDrawerSession.focus_ml_enabled ? '#059669' : '#64748b'} />
                      <span>
                        AI Proctoring &amp; Focus Tracker: {selectedDrawerSession.focus_ml_enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Pre-lab Guidance */}
                <div className={styles.drawerSection}>
                  <h4 className={styles.drawerSectionTitle}>Pre-Lab Preparation</h4>
                  <p style={{ margin: 0, fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
                    Reviewing your pre-lab study materials, syntax snippets, and concept checks before joining improves your lab mastery score.
                  </p>
                </div>
              </div>

              {/* Drawer Footer Action */}
              {selectedDrawerSession.status === 'active' ? (
                <button
                  className={styles.drawerFooterBtn}
                  onClick={() => router.push(`/student/live-lab/${selectedDrawerSession.id}`)}
                >
                  <Video size={16} />
                  <span>Enter Live Laboratory Room</span>
                  <ArrowRight size={16} />
                </button>
              ) : selectedDrawerSession.status === 'scheduled' ? (
                <button
                  className={styles.drawerFooterBtn}
                  onClick={() => {
                    setSelectedDrawerSession(null);
                    router.push(`/student/pre-lab/${selectedDrawerSession.experiment_id}`);
                  }}
                >
                  <BookOpen size={16} />
                  <span>Open Pre-Lab Study Materials</span>
                </button>
              ) : selectedDrawerSession.catchup_enabled ? (
                <button
                  className={styles.drawerFooterBtn}
                  disabled={catchupBusy === selectedDrawerSession.id}
                  onClick={() => startCatchup(selectedDrawerSession)}
                >
                  <RotateCcw size={16} />
                  <span>Start Catch-Up Practical Attempt</span>
                </button>
              ) : (
                <button
                  className={styles.drawerFooterBtn}
                  style={{ background: '#0f172a' }}
                  onClick={() => setSelectedDrawerSession(null)}
                >
                  <span>Close Details</span>
                </button>
              )}
            </div>
          </div>
        )}

        {feedbackSession && (
          <SessionFeedbackModal
            isOpen={!!feedbackSession}
            sessionId={feedbackSession.id}
            sessionTitle={feedbackSession.experiment_title || expTitles[feedbackSession.experiment_id]}
            instructorName={(feedbackSession as any).instructor_name}
            onClose={() => setFeedbackSession(null)}
            onSuccess={() => {
              const submittedSessionId = feedbackSession.id;
              setSessions(current => current.map(session => session.id === submittedSessionId
                ? { ...session, my_attendance: { ...session.my_attendance, status: session.my_attendance?.status || 'not_recorded', feedback_submitted: true } }
                : session));
              setFeedbackSession(null);
              setNotice('Thank you! Your feedback was submitted.');
              setTimeout(() => setNotice(''), 3000);
            }}
          />
        )}
      </div>
    </StudentShell>
  );
}
